/** last modification time of a template file, as a timestamp (ms) or `Date`. `undefined` means the file doesn't exist */
export type MaybeMtime = number | Date | undefined

/**
 * mtime lookups memoized for one render, keyed by resolved filepath.
 * `null` means the file doesn't exist (or its mtime is unavailable).
 */
export type MtimeCache = Map<string, number | null>

export interface FS {
  /** check if a file exists asynchronously */
  exists: (filepath: string) => Promise<boolean>;
  /** check if a file exists synchronously */
  existsSync: (filepath: string) => boolean;
  /** read a file asynchronously */
  readFile: (filepath: string) => Promise<string>;
  /** read a file synchronously */
  readFileSync: (filepath: string) => string;
  /**
   * get the last modification time of a file asynchronously.
   * Used to invalidate cached templates: a cached template is reparsed when the returned mtime changes,
   * and a missing mtime (reject/throw or `undefined`) invalidates the cache as if the file had been removed.
   * When not implemented, cached templates are kept regardless of file changes.
   */
  mtime?: (filepath: string) => Promise<MaybeMtime>;
  /** get the last modification time of a file synchronously, see `mtime` */
  mtimeSync?: (filepath: string) => MaybeMtime;
  /** resolve a file against directory, for given `ext` option */
  resolve: (dir: string, file: string, ext: string) => string;
  /** check if file is contained in `root`, always return `true` by default. Warning: not setting this could expose path traversal vulnerabilities. */
  contains?: (root: string, file: string) => boolean;
  /** defaults to "/" */
  sep?: string;
  /** required for relative path resolving */
  dirname?: (file: string) => string;
  /** fallback file for lookup failure */
  fallback?: (file: string) => string | undefined;
}
