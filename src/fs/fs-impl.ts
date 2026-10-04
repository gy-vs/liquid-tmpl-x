import { promisify } from '../util'
import { sep, resolve as nodeResolve, extname, dirname as nodeDirname } from 'path'
import { stat, statSync, Stats, readFile as nodeReadFile, readFileSync as nodeReadFileSync } from 'fs'
import { requireResolve } from './node-require'

type NodeReadFile = (file: string, encoding: string, cb: ((err: Error | null, result: string) => void)) => void
const statAsync = promisify<string, Stats>(stat as unknown as (file: string, cb: (err: Error | null, result: Stats) => void) => void)
const readFileAsync = promisify<string, string, string>(nodeReadFile as NodeReadFile)

export async function exists (filepath: string) {
  try {
    await statAsync(filepath)
    return true
  } catch (err) {
    return false
  }
}
export function readFile (filepath: string) {
  return readFileAsync(filepath, 'utf8')
}
export function existsSync (filepath: string) {
  try {
    statSync(filepath)
    return true
  } catch (err) {
    return false
  }
}
export function readFileSync (filepath: string) {
  return nodeReadFileSync(filepath, 'utf8')
}
export async function mtime (filepath: string) {
  try {
    const stat = await statAsync(filepath)
    return stat.mtimeMs
  } catch (err) {
    return undefined
  }
}
export function mtimeSync (filepath: string) {
  try {
    return statSync(filepath).mtimeMs
  } catch (err) {
    return undefined
  }
}
export function resolve (root: string, file: string, ext: string) {
  if (!extname(file)) file += ext
  return nodeResolve(root, file)
}
export function fallback (file: string) {
  try {
    return requireResolve(file)
  } catch (e) {}
}
export function dirname (filepath: string) {
  return nodeDirname(filepath)
}
export function contains (root: string, file: string) {
  root = nodeResolve(root)
  root = root.endsWith(sep) ? root : root + sep
  return file.startsWith(root)
}

export { sep } from 'path'
