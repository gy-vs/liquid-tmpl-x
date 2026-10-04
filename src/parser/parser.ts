import { Limiter, toPromise, assert, isTagToken, isOutputToken, isPromise, ParseError } from '../util'
import { Tokenizer } from './tokenizer'
import { ParseStream } from './parse-stream'
import { TopLevelToken, OutputToken } from '../tokens'
import { Template, Output, HTML } from '../template'
import { LiquidCache, CachedTemplates, MTIME } from '../cache'
import { FS, Loader, LookupType, RenderState } from '../fs'
import { LiquidError, LiquidErrors } from '../util/error'
import type { Liquid } from '../liquid'

export class Parser {
  public parseFile: (file: string, sync?: boolean, type?: LookupType, currentFile?: string, state?: RenderState) => Generator<unknown, Template[], Template[] | string>

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
  private * _parseFileCached (file: string, sync?: boolean, type: LookupType = LookupType.Root, currentFile?: string, state?: RenderState): Generator<unknown, Template[], Template[]> {
    const cache = this.cache!
    const key = this.cacheKey(file, type, currentFile)
    let entry = yield cache.read(key)
    if (entry && isPromise<CachedTemplates>(entry)) entry = yield entry
    const tpls = entry as CachedTemplates | undefined
    if (tpls && !this.canStat(sync)) return tpls
    if (tpls) {
      let mtime: number | undefined
      try {
        const stat = (yield this.loader.stat(file, type, sync, currentFile, state)) as unknown as { filepath: string; mtime?: number }
        mtime = stat.mtime
      } catch (err) {
        // file no longer resolves (e.g. deleted): drop stale cache and surface the lookup error
        cache.remove(key)
        throw err
      }
      const cached = tpls[MTIME]
      // invalidate on deletion, on a known different mtime, or when fs.mtime is unreliable (returns undefined for an existing file);
      // an entry without a tracked mtime (e.g. pre-populated custom cache) is left untouched
      if (mtime === undefined || (cached !== undefined && mtime !== cached)) {
        cache.remove(key)
      } else {
        return tpls
      }
    }

    const task = this._parseFile(file, sync, type, currentFile, state)
    // sync mode: exec the task and cache the result
    // async mode: cache the task before exec
    const taskOrTpl = sync ? yield task : toPromise(task)
    cache.write(key, taskOrTpl as any)
    // note: concurrent tasks will be reused, cache for failed task is removed until its end
    try { return yield taskOrTpl } catch (err) { cache.remove(key); throw err }
  }
  private canStat (sync?: boolean) {
    return !!(sync ? this.fs.mtimeSync : this.fs.mtime)
  }
  private * _parseFile (file: string, sync?: boolean, type: LookupType = LookupType.Root, currentFile?: string, state?: RenderState): Generator<unknown, Template[], string> {
    // when cache is off, keep the legacy load path exactly (lookup + read, no extra stat)
    const trackMtime = !!this.cache && this.canStat(sync)
    let filepath: string
    let mtime: number | undefined
    if (trackMtime) {
      const stat = (yield this.loader.stat(file, type, sync, currentFile, state)) as unknown as { filepath: string; mtime?: number }
      filepath = stat.filepath
      mtime = stat.mtime
    } else {
      filepath = yield this.loader.lookup(file, type, sync, currentFile)
    }
    const html = sync ? this.fs.readFileSync(filepath) : yield this.fs.readFile(filepath)
    const tpls = this.parse(html, filepath) as CachedTemplates
    if (trackMtime && mtime !== undefined) tpls[MTIME] = mtime
    return tpls
  }
  private cacheKey (file: string, type: LookupType, currentFile?: string) {
    return this.loader.shouldLoadRelative(file) ? currentFile + ',' + file : type + ':' + file
  }
}
