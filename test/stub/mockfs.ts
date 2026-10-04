import { isString, forOwn } from '../../src/util/underscore'
import * as nodeFs from '../../src/fs/fs-impl'
import { resolve } from 'path'

interface FileDescriptor {
  mode: string;
  content: string;
  mtime?: number;
}

let files: { [path: string]: FileDescriptor } = {}
const originals: any = {
  readFile: nodeFs.readFile,
  exists: nodeFs.exists,
  readFileSync: nodeFs.readFileSync,
  existsSync: nodeFs.existsSync,
  mtime: nodeFs.mtime,
  mtimeSync: nodeFs.mtimeSync
}

export function mock (options: { [path: string]: (string | FileDescriptor) }) {
  forOwn(options, (val, key) => {
    files[resolve(key)] = isString(val)
      ? { mode: '33188', content: val }
      : val as FileDescriptor
  })
  const fs: any = nodeFs
  fs.readFile = async function (filepath: string) {
    return fs.readFileSync(filepath)
  }
  fs.readFileSync = function (filepath: string) {
    const file = files[filepath]
    if (file === undefined) throw new Error('ENOENT')
    if (file.mode === '0000') throw new Error('EACCES')
    return file.content
  }
  fs.exists = async function (filepath: string) {
    return fs.existsSync(filepath)
  }
  fs.existsSync = function (filepath: string) {
    const file = files[filepath]
    return !!file && file.mode !== '0000'
  }
  // mocked files report a stable mtime by default, so cached templates are never invalidated
  fs.mtime = async function (filepath: string) {
    return fs.mtimeSync(filepath)
  }
  fs.mtimeSync = function (filepath: string) {
    const file = files[filepath]
    if (!file) throw new Error('ENOENT')
    return file.mtime ?? 0
  }
}

export function restore () {
  files = {}
  const fs: any = nodeFs
  fs.readFileSync = originals.readFileSync
  fs.existsSync = originals.existsSync
  fs.readFile = originals.readFile
  fs.exists = originals.exists
  fs.mtime = originals.mtime
  fs.mtimeSync = originals.mtimeSync
}
