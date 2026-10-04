import { FS, RenderState } from './fs'
import { assert, escapeRegex } from '../util'

export interface LoaderOptions {
  fs: FS;
  extname: string;
  root: string[];
  partials: string[];
  layouts: string[];
  relativeReference: boolean;
}
export enum LookupType {
  Partials = 'partials',
  Layouts = 'layouts',
  Root = 'root'
}
export class Loader {
  public shouldLoadRelative: (referencedFile: string) => boolean
  private options: LoaderOptions
  private contains: (root: string, file: string) => boolean

  constructor (options: LoaderOptions) {
    this.options = options
    if (options.relativeReference) {
      const sep = options.fs.sep
      assert(sep, '`fs.sep` is required for relative reference')
      const rRelativePath = new RegExp(['.' + sep, '..' + sep, './', '../'].map(prefix => escapeRegex(prefix)).join('|'))
      this.shouldLoadRelative = (referencedFile: string) => rRelativePath.test(referencedFile)
    } else {
      this.shouldLoadRelative = (_referencedFile: string) => false
    }
    this.contains = this.options.fs.contains || (() => true)
  }

  public * lookup (file: string, type: LookupType, sync?: boolean, currentFile?: string): Generator<unknown, string, string> {
    const { fs } = this.options
    const dirs = this.options[type]
    for (const filepath of this.candidates(file, dirs, currentFile, type !== LookupType.Root)) {
      if (sync ? fs.existsSync(filepath) : yield fs.exists(filepath)) return filepath
    }
    throw this.lookupError(file, dirs)
  }

  /**
   * resolve `file` to a filepath and its last modification time.
   * `undefined` mtime means the file does not exist or the fs provides no mtime.
   * results are memoized in `state` for the lifetime of one render.
   */
  public * stat (file: string, type: LookupType, sync?: boolean, currentFile?: string, state?: RenderState): Generator<unknown, { filepath: string; mtime?: number }, unknown> {
    const filepath = (yield this.lookup(file, type, sync, currentFile)) as string
    const memo = state?.mtimes
    if (memo?.has(filepath)) {
      return { filepath, mtime: memo.get(filepath) }
    }
    const { fs } = this.options
    let mtime: number | undefined
    if (sync) mtime = fs.mtimeSync?.(filepath)
    else if (fs.mtime) mtime = (yield fs.mtime(filepath)) as number | undefined
    memo?.set(filepath, mtime)
    return { filepath, mtime }
  }

  public * candidates (file: string, dirs: string[], currentFile?: string, enforceRoot?: boolean) {
    const { fs, extname } = this.options
    const isAllowed = (filepath: string) => {
      if (!enforceRoot) return true
      for (const dir of dirs) {
        if (this.contains(dir, filepath)) return true
      }
      return false
    }

    if (this.shouldLoadRelative(file) && currentFile) {
      const referenced = fs.resolve(this.dirname(currentFile), file, extname)
      if (isAllowed(referenced)) yield referenced
    }
    for (const dir of dirs) {
      const referenced = fs.resolve(dir, file, extname)
      if (isAllowed(referenced)) yield referenced
    }

    if (fs.fallback !== undefined) {
      const filepath = fs.fallback(file)
      if (filepath !== undefined && isAllowed(filepath)) yield filepath
    }
  }

  private dirname (path: string) {
    const fs = this.options.fs
    assert(fs.dirname, '`fs.dirname` is required for relative reference')
    return fs.dirname!(path)
  }

  private lookupError (file: string, roots: string[]) {
    const err = new Error('ENOENT') as any
    err.message = `ENOENT: Failed to lookup "${file}" in "${roots}"`
    err.code = 'ENOENT'
    return err
  }
}
