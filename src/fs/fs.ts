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
   * get the last modification time of a file asynchronously,
   * resolves to `undefined` if the file does not exist.
   * Used to invalidate cached templates when the file changes;
   * if not implemented, cached templates are never invalidated.
   */
  mtime?: (filepath: string) => Promise<number | undefined>;
  /** synchronous counterpart of `mtime` */
  mtimeSync?: (filepath: string) => number | undefined;
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

/**
 * Per-render state shared by file loading within one render,
 * so that files included multiple times are only stat'd once.
 */
export interface RenderState {
  /** resolved filepath -> last modification time, `undefined` means file not found */
  mtimes?: Map<string, number | undefined>;
}
