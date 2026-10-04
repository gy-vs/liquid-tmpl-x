import { promisify } from '../util'
import { sep, resolve as nodeResolve, extname, dirname as nodeDirname } from 'path'
import { stat, statSync, Stats, readFile as nodeReadFile, readFileSync as nodeReadFileSync } from 'fs'
import { requireResolve } from './node-require'
import { MaybeMtime } from './fs'

type NodeReadFile = (file: string, encoding: string, cb: ((err: Error | null, result: string) => void)) => void
const statAsync = promisify<string, Stats>(stat)
const readFileAsync = promisify<string, string, string>(nodeReadFile as NodeReadFile)

export async function exists (filepath: string) {
  try {
    await statAsync(filepath)
    return true
  } catch (err) {
    return false
  }
}
export async function mtime (filepath: string): Promise<MaybeMtime> {
  return (await statAsync(filepath)).mtime
}
export function mtimeSync (filepath: string): MaybeMtime {
  return statSync(filepath).mtime
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
