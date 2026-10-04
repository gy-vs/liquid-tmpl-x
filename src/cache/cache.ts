import type { Template } from '../template/template'

/** marker attached to parsed templates to record the file mtime they were parsed from */
export const MTIME: unique symbol = Symbol('mtime')
export type CachedTemplates = Template[] & { [MTIME]?: number }

export interface Cache<T> {
  write (key: string, value: T): void | Promise<void>;
  read (key: string): T | undefined | Promise<T | undefined>;
  remove (key: string): void | Promise<void>;
}

export type LiquidCache = Cache<Template[] | Promise<Template[]>>
