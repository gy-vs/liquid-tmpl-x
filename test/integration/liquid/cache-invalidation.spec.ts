import { Liquid } from '../../../src/liquid'
import { Template } from '../../../src/template'
import * as nodeFs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('cache invalidation by mtime', function () {
  let root: string
  let seq = 0

  beforeEach(function () {
    root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'liquid-cache-'))
    seq = 0
  })
  afterEach(function () {
    nodeFs.rmSync(root, { recursive: true, force: true })
  })

  function write (name: string, content: string, mtime = Date.now()) {
    const filepath = path.join(root, name)
    nodeFs.mkdirSync(path.dirname(filepath), { recursive: true })
    nodeFs.writeFileSync(filepath, content)
    // assign an explicit, strictly increasing mtime (1ms apart)
    nodeFs.utimesSync(filepath, new Date(), new Date(mtime + ++seq))
  }
  function remove (name: string) {
    nodeFs.rmSync(path.join(root, name), { force: true })
  }
  function waitTick () {
    return new Promise(resolve => setTimeout(resolve, 20))
  }

  describe('#renderFile', function () {
    it('should re-render with new content after the file changes (reproduction)', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      await expect(engine.renderFile('a')).resolves.toBe('v1')

      write('a.liquid', 'v2')
      await waitTick()
      await expect(engine.renderFile('a')).resolves.toBe('v2')
    })
    it('should keep using the cache (no re-parse) when mtime unchanged', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')

      // touch atime only, keep mtime
      const filepath = path.join(root, 'a.liquid')
      const stat = nodeFs.statSync(filepath)
      nodeFs.utimesSync(filepath, new Date(Date.now() + 10000), stat.mtime)
      await waitTick()
      expect(await engine.renderFile('a')).toBe('v1')
    })
    it('should behave identically on the sync path', function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      expect(engine.renderFileSync('a')).toBe('v1')

      write('a.liquid', 'v2')
      expect(engine.renderFileSync('a')).toBe('v2')
    })
    it('should invalidate included templates when they change, parent untouched', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('header.liquid', 'header v1')
      write('page.liquid', '{% include "header" %} body')
      expect(await engine.renderFile('page')).toBe('header v1 body')

      write('header.liquid', 'header v2')
      await waitTick()
      expect(await engine.renderFile('page')).toBe('header v2 body')
    })
    it('should invalidate {% render %}ed templates when they change', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('header.liquid', 'header v1')
      write('page.liquid', '{% render "header" %} body')
      expect(await engine.renderFile('page')).toBe('header v1 body')

      write('header.liquid', 'header v2')
      await waitTick()
      expect(await engine.renderFile('page')).toBe('header v2 body')
    })
    it('should invalidate layout templates when they change', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('layout.liquid', 'head {% block %}{% endblock %} foot')
      write('page.liquid', '{% layout "layout" %}body')
      expect(await engine.renderFile('page')).toBe('head body foot')

      write('layout.liquid', 'HEADER {% block %}{% endblock %} FOOTER')
      await waitTick()
      expect(await engine.renderFile('page')).toBe('HEADER body FOOTER')
    })
    it('should throw lookup error for a deleted cached file', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')

      remove('a.liquid')
      await waitTick()
      await expect(engine.renderFile('a')).rejects.toThrow('Failed to lookup')
    })
    it('should throw lookup error for a deleted cached file on sync path', function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      expect(engine.renderFileSync('a')).toBe('v1')

      remove('a.liquid')
      expect(() => engine.renderFileSync('a')).toThrow('Failed to lookup')
    })
    it('should throw lookup error for a deleted included template', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('header.liquid', 'header')
      write('page.liquid', '{% include "header" %} body')
      expect(await engine.renderFile('page')).toBe('header body')

      remove('header.liquid')
      await waitTick()
      await expect(engine.renderFile('page')).rejects.toThrow('Failed to lookup')
    })
    it('should load a file again after delete and recreate', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: true })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')

      remove('a.liquid')
      await waitTick()
      await expect(engine.renderFile('a')).rejects.toThrow()
      write('a.liquid', 'v2')
      await waitTick()
      expect(await engine.renderFile('a')).toBe('v2')
    })
    it('should work with numeric (LRU) cache option', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: 10 })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')

      write('a.liquid', 'v2')
      await waitTick()
      expect(await engine.renderFile('a')).toBe('v2')
    })
    it('should work with a custom LiquidCache instance', async function () {
      const store: Record<string, Template[] | Promise<Template[]>> = {}
      const engine = new Liquid({
        root,
        extname: '.liquid',
        cache: {
          read: key => store[key],
          write: (key, value) => { store[key] = value },
          remove: key => { delete store[key] }
        }
      })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')

      write('a.liquid', 'v2')
      await waitTick()
      expect(await engine.renderFile('a')).toBe('v2')
    })
    it('should not reparse when cache is off (no stat-based behavior)', async function () {
      const engine = new Liquid({ root, extname: '.liquid', cache: false })
      write('a.liquid', 'v1')
      expect(await engine.renderFile('a')).toBe('v1')
      write('a.liquid', 'v2')
      await waitTick()
      expect(await engine.renderFile('a')).toBe('v2')
    })
  })

  describe('custom fs', function () {
    function makeFs (initial: Record<string, string>) {
      const files: Record<string, string> = { ...initial }
      const mtimes: Record<string, number> = {}
      Object.keys(files).forEach(k => { mtimes[k] = 1 })
      const resolve = (base: string, file: string, ext: string) => {
        if (!/\.[^/]+$/.test(file)) file += ext
        return base + '/' + file
      }
      return {
        sep: '/',
        dirname: (x: string) => x.split('/').slice(0, -1).join('/'),
        resolve,
        exists: (x: string) => Promise.resolve(x in files),
        existsSync: (x: string) => x in files,
        readFile: (x: string) => Promise.resolve(files[x]),
        readFileSync: (x: string) => files[x],
        mtime: (x: string) => Promise.resolve(mtimes[x]),
        mtimeSync: (x: string) => mtimes[x],
        set (x: string, content: string, time: number) { files[x] = content; mtimes[x] = time },
        delete (x: string) { delete files[x]; delete mtimes[x] }
      }
    }

    it('invalidates when the custom fs reports a new mtime (async)', async function () {
      const cfs = makeFs({ '/t/a.liquid': 'v1' })
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(await engine.renderFile('a')).toBe('v1')
      cfs.set('/t/a.liquid', 'v2', 2)
      expect(await engine.renderFile('a')).toBe('v2')
    })
    it('invalidates when the custom fs reports a new mtime (sync)', function () {
      const cfs = makeFs({ '/t/a.liquid': 'v1' })
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(engine.renderFileSync('a')).toBe('v1')
      cfs.set('/t/a.liquid', 'v2', 2)
      expect(engine.renderFileSync('a')).toBe('v2')
    })
    it('reports deletion as a lookup failure through a custom fs', async function () {
      const cfs = makeFs({ '/t/a.liquid': 'v1' })
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(await engine.renderFile('a')).toBe('v1')
      cfs.delete('/t/a.liquid')
      await expect(engine.renderFile('a')).rejects.toThrow('Failed to lookup')
    })
    it('keeps cache-forever behavior when fs does not implement mtime (async)', async function () {
      const cfs = makeFs({ '/t/a.liquid': 'v1' })
      delete (cfs as any).mtime
      delete (cfs as any).mtimeSync
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(await engine.renderFile('a')).toBe('v1')
      cfs.set('/t/a.liquid', 'v2', 2)
      expect(await engine.renderFile('a')).toBe('v1')
    })
    it('keeps cache-forever behavior when fs does not implement mtime (sync)', function () {
      const cfs = makeFs({ '/t/a.liquid': 'v1' })
      delete (cfs as any).mtime
      delete (cfs as any).mtimeSync
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(engine.renderFileSync('a')).toBe('v1')
      cfs.set('/t/a.liquid', 'v2', 2)
      expect(engine.renderFileSync('a')).toBe('v1')
    })
    it('should stat an included file only once per render', async function () {
      const cfs = makeFs({
        '/t/header.liquid': 'h',
        '/t/page.liquid': '{% for i in (1..3) %}{% include "header" %}{% endfor %}'
      })
      const mtimeSpy = jest.fn(cfs.mtime)
      cfs.mtime = mtimeSpy as any
      const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true, fs: cfs })
      expect(await engine.renderFile('page')).toBe('hhh')
      // one for page itself, one for header (not three)
      expect(mtimeSpy).toHaveBeenCalledTimes(2)
    })
  })
})
