import { Limiter, toPromise, assert, isTagToken, isOutputToken, ParseError } from '../util'
import { Tokenizer } from './tokenizer'
import { ParseStream } from './parse-stream'
import { TopLevelToken, OutputToken } from '../tokens'
import { Template, Output, HTML } from '../template'
import { LiquidCache } from '../cache'
import { FS, Loader, LookupType, MtimeCache } from '../fs'
import { LiquidError, LiquidErrors } from '../util/error'
import type { Liquid } from '../liquid'

interface LoadedFile {
  filepath: string;
  templates: Template[];
}

interface CachedFileInfo {
  filepath: string;
  mtime: number;
}

type ParseFile = (
  file: string,
  sync?: boolean,
  type?: LookupType,
  currentFile?: string,
  mtimeCache?: MtimeCache
) => Generator<unknown, Template[], Template[] | string>

// filepath/mtime recorded alongside each cache entry, keyed by the cache instance
const cacheInfo = new WeakMap<LiquidCache, Map<string, CachedFileInfo>>()

function getCacheInfo (cache: LiquidCache): Map<string, CachedFileInfo> {
  let info = cacheInfo.get(cache)
  if (!info) {
    info = new Map()
    cacheInfo.set(cache, info)
  }
  return info
}

export class Parser {
  public parseFile: ParseFile

  private liquid: Liquid
  private fs: FS
  private cache?: LiquidCache
  private loader: Loader
  private parseLimit: Limiter

  public constructor (liquid: Liquid) {
    this.liquid = liquid
    this.cache = this.liquid.options.cache
    this.fs = this.liquid.options.fs
    this.parseFile = this.cache ? this._parseFileCached : this._parseFile
    this.loader = new Loader(this.liquid.options)
    this.parseLimit = new Limiter('parse length', liquid.options.parseLimit)
  }
  public parse (html: string, filepath?: string): Template[] {
    html = String(html)
    this.parseLimit.use(html.length)
    const tokenizer = new Tokenizer(html, this.liquid.options.operators, filepath)
    const tokens = tokenizer.readTopLevelTokens(this.liquid.options)
    return this.parseTokens(tokens)
  }
  public parseTokens (tokens: TopLevelToken[]) {
    let token
    const templates: Template[] = []
    const errors: LiquidError[] = []
    while ((token = tokens.shift())) {
      try {
        templates.push(this.parseToken(token, tokens))
      } catch (err) {
        if (this.liquid.options.catchAllErrors) errors.push(err as LiquidError)
        else throw err
      }
    }
    if (errors.length) throw new LiquidErrors(errors)
    return templates
  }
  public parseToken (token: TopLevelToken, remainTokens: TopLevelToken[]) {
    try {
      if (isTagToken(token)) {
        const TagClass = this.liquid.tags[token.name]
        assert(TagClass, `tag "${token.name}" not found`)
        return new TagClass(token, remainTokens, this.liquid, this)
      }
      if (isOutputToken(token)) {
        return new Output(token as OutputToken, this.liquid)
      }
      return new HTML(token)
    } catch (e) {
      if (LiquidError.is(e)) throw e
      throw new ParseError(e as Error, token)
    }
  }
  public parseStream (tokens: TopLevelToken[]) {
    return new ParseStream(tokens, (token, tokens) => this.parseToken(token, tokens))
  }
  private * _parseFileCached (file: string, sync?: boolean, type: LookupType = LookupType.Root, currentFile?: string, mtimeCache?: MtimeCache): Generator<unknown, Template[], Template[]> {
    const cache = this.cache!
    const info = getCacheInfo(cache)
    const key = this.loader.shouldLoadRelative(file) ? currentFile + ',' + file : type + ':' + file
    const cached = yield cache.read(key)
    if (cached) {
      const fileInfo = info.get(key)
      // filesystems without mtime support keep their cache forever
      if (!fileInfo) return cached as Template[]
      const mtime = (yield this.getMtime(fileInfo.filepath, !!sync, mtimeCache)) as unknown as number | null | undefined
      if (typeof mtime === 'number' && mtime === fileInfo.mtime) return cached as Template[]
      // mtime changed, or file removed: drop the stale cache and reload
      yield cache.remove(key)
      info.delete(key)
    }

    if (sync) {
      const loaded = (yield this._loadFile(file, true, type, currentFile)) as unknown as LoadedFile
      const mtime = (yield this.getMtime(loaded.filepath, true, mtimeCache)) as unknown as number | null | undefined
      // a `null` mtime means the file vanished right after reading; don't keep it
      if (mtime !== null) {
        cache.write(key, loaded.templates)
        if (typeof mtime === 'number') info.set(key, { filepath: loaded.filepath, mtime })
      }
      return loaded.templates
    }

    // async mode: cache the task before exec so concurrent renders share it
    const task = toPromise(this._loadFile(file, false, type, currentFile)).then(async loaded => {
      const mtime = await toPromise(this.getMtime(loaded.filepath, false, mtimeCache))
      if (mtime === null) {
        await cache.remove(key)
        return loaded.templates
      }
      if (typeof mtime === 'number') info.set(key, { filepath: loaded.filepath, mtime })
      return loaded.templates
    })
    cache.write(key, task as any)
    try {
      return yield task
    } catch (err) {
      // cache for failed task is removed until its end
      yield cache.remove(key)
      info.delete(key)
      throw err
    }
  }
  private * _parseFile (file: string, sync?: boolean, type: LookupType = LookupType.Root, currentFile?: string): Generator<unknown, Template[], string> {
    const loaded = (yield this._loadFile(file, sync, type, currentFile)) as unknown as LoadedFile
    return loaded.templates
  }
  private * _loadFile (file: string, sync?: boolean, type: LookupType = LookupType.Root, currentFile?: string): Generator<unknown, LoadedFile, string> {
    const filepath = yield this.loader.lookup(file, type, sync, currentFile)
    const html = sync ? this.fs.readFileSync(filepath) : yield this.fs.readFile(filepath)
    return { filepath, templates: this.parse(html, filepath) }
  }
  /**
   * read the mtime of `filepath`, memoized for the current render.
   * @returns timestamp in ms; `null` if the file doesn't exist (or stat failed);
   *          `undefined` if the filesystem provides no mtime method
   */
  private * getMtime (filepath: string, sync: boolean, mtimeCache?: MtimeCache): Generator<unknown, number | null | undefined> {
    const memoized = mtimeCache?.get(filepath)
    if (memoized !== undefined) return memoized
    const stat = sync ? this.fs.mtimeSync : this.fs.mtime
    if (!stat) return undefined
    let mtime: number | null
    try {
      const value = yield stat(filepath) as number | Date | undefined
      mtime = value === undefined ? null : value instanceof Date ? value.getTime() : Number(value)
    } catch (err) {
      mtime = null
    }
    mtimeCache?.set(filepath, mtime)
    return mtime
  }
}
