import { Liquid } from '../../../src/liquid'
import { mock, restore } from '../../stub/mockfs'
import { Template } from '../../../src/template'

describe('LiquidOptions#cache', function () {
  afterEach(restore)
  describe('#renderFile', function () {
    it('should be disabled by default', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html'
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('bar')
    })
    it('should be disabled when cache <= 0', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: -1
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('bar')
    })
    it('should respect cache=true option', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('foo')
    })
    it('should respect cache=2 option', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: 2
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      await engine.renderFile('files/foo')
      mock({ '/root/files/foo.html': 'FOO' })
      await engine.renderFile('files/bar')
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')

      await engine.renderFile('files/bar')
      await engine.renderFile('files/coo')
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('FOO')
    })
    it('should respect cache={read, write} option', async function () {
      let last: Template[] | undefined
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: {
          remove: () => void (0),
          read: (): Template[] | undefined => last,
          write: (key: string, value: Template[]) => { last = value }
        }
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      expect(await engine.renderFile('files/foo')).toBe('foo')
      expect(await engine.renderFile('files/bar')).toBe('foo')
      expect(await engine.renderFile('files/coo')).toBe('foo')
    })
    it('should respect cache={ async read, async write } option', async function () {
      const cached: { [key: string]: Template[] | undefined } = {}
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: {
          remove: (key: string) => { delete cached[key] },
          read: (key: string) => Promise.resolve(cached[key]),
          write: (key: string, value: Template[]) => { cached[key] = value; Promise.resolve() }
        }
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      expect(await engine.renderFile('files/foo')).toBe('foo')
      expect(await engine.renderFile('files/bar')).toBe('bar')
      expect(await engine.renderFile('files/coo')).toBe('coo')
      mock({ '/root/files/coo.html': 'COO' })
      expect(await engine.renderFile('files/coo')).toBe('coo')
    })
    it('should handle concurrent cache read/write', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: 1
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      const [foo1, foo2, bar, coo] = await Promise.all([
        engine.renderFile('files/foo'),
        engine.renderFile('files/foo'),
        engine.renderFile('files/bar'),
        engine.renderFile('files/coo')
      ])
      expect(foo1).toBe('foo')
      expect(foo2).toBe('foo')
      expect(bar).toBe('bar')
      expect(coo).toBe('coo')
    })
    it('should not cache not exist file', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      try {
        await engine.renderFile('foo')
      } catch (err) {}

      mock({ '/root/foo.html': 'foo' })
      const html = await engine.renderFile('foo')
      expect(html).toBe('foo')
    })
  })

  describe('#renderFileSync', function () {
    it('should be disabled by default', function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html'
      })
      mock({ '/root/foo.html': 'foo' })
      const x = engine.renderFileSync('foo')
      expect(x).toBe('foo')

      mock({ '/root/foo.html': 'bar' })
      const y = engine.renderFileSync('foo')
      expect(y).toBe('bar')
    })
    it('should respect cache=true option', function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': 'foo' })
      expect(engine.renderFileSync('foo')).toBe('foo')
      mock({ '/root/foo.html': 'bar' })
      expect(engine.renderFileSync('foo')).toBe('foo')
    })
    it('should not cache not exist file', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      try { engine.renderFileSync('foo') } catch (err) {}

      mock({ '/root/foo.html': 'foo' })
      const y = await engine.renderFile('foo')
      expect(y).toBe('foo')
    })
    it('should cache relative referenced files properly', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({
        '/root/foo.html': '{% render "./bar" %}',
        '/root/bar.html': 'bar1',
        '/root/another/foo.html': '{% render "./bar" %}',
        '/root/another/bar.html': 'bar2'
      })
      const foo1 = await engine.renderFile('foo')
      expect(foo1).toBe('bar1')

      const foo2 = await engine.renderFile('another/foo')
      expect(foo2).toBe('bar2')
    })
  })

  describe('#mtime based invalidation', function () {
    it('should reparse a changed template (async)', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 2 } })
      expect(await engine.renderFile('foo')).toBe('bar')
    })
    it('should reparse a changed template (sync)', function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(engine.renderFileSync('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 2 } })
      expect(engine.renderFileSync('foo')).toBe('bar')
    })
    it('should keep the cache when mtime unchanged', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      // same mtime even though the content differs: cache is trusted
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
    })
    it('should invalidate a changed partial via render/include without touching the parent', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({
        '/root/page.html': { mode: '33188', content: '{% render "header" %}body', mtime: 1 },
        '/root/header.html': { mode: '33188', content: 'v1', mtime: 1 }
      })
      expect(await engine.renderFile('page')).toBe('v1body')
      mock({
        '/root/page.html': { mode: '33188', content: '{% render "header" %}body', mtime: 1 },
        '/root/header.html': { mode: '33188', content: 'v2', mtime: 2 }
      })
      expect(await engine.renderFile('page')).toBe('v2body')
    })
    it('should invalidate a changed layout', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({
        '/root/view.html': { mode: '33188', content: '{% layout "l" %}view', mtime: 1 },
        '/root/l.html': { mode: '33188', content: 'L1{% block %}{% endblock %}', mtime: 1 }
      })
      expect(await engine.renderFile('view')).toBe('L1view')
      mock({
        '/root/view.html': { mode: '33188', content: '{% layout "l" %}view', mtime: 1 },
        '/root/l.html': { mode: '33188', content: 'L2{% block %}{% endblock %}', mtime: 2 }
      })
      expect(await engine.renderFile('view')).toBe('L2view')
    })
    it('should throw ENOENT for a removed file (async)', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '0000', content: '', mtime: 2 } })
      // mode 0000 makes existsSync false, simulating removal
      await expect(engine.renderFile('foo')).rejects.toHaveProperty('code', 'ENOENT')
    })
    it('should throw ENOENT for a removed file (sync)', function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(engine.renderFileSync('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '0000', content: '', mtime: 2 } })
      expect(() => engine.renderFileSync('foo')).toThrow('ENOENT')
    })
    it('should work with cache as a number', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: 2
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 2 } })
      expect(await engine.renderFile('foo')).toBe('bar')
    })
    it('should work with a custom LiquidCache instance', async function () {
      const store: { [key: string]: Template[] } = {}
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: {
          read: (key: string) => store[key],
          write: (key: string, value: Template[]) => { store[key] = value },
          remove: (key: string) => { delete store[key] }
        }
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 2 } })
      expect(await engine.renderFile('foo')).toBe('bar')
    })
    it('should keep cached templates forever when fs provides no mtime method', async function () {
      const base = require('../../../src/fs/fs-impl')
      // proxy the (mocked) module so exists/read still delegate to it
      const fsNoMtime = new Proxy(base, {
        get (target, prop) {
          if (prop === 'mtime' || prop === 'mtimeSync') return undefined
          return target[prop]
        }
      })
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true,
        fs: fsNoMtime
      })
      mock({ '/root/foo.html': { mode: '33188', content: 'foo', mtime: 1 } })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': { mode: '33188', content: 'bar', mtime: 2 } })
      expect(await engine.renderFile('foo')).toBe('foo')
    })
    it('should stat each file at most once per render', async function () {
      let mtimeCalls = 0
      const base = require('../../../src/fs/fs-impl')
      const fsCounting = new Proxy(base, {
        get (target, prop) {
          if (prop === 'mtime') return async (filepath: string) => { mtimeCalls++; return target.mtime(filepath) }
          if (prop === 'mtimeSync') return (filepath: string) => { mtimeCalls++; return target.mtimeSync(filepath) }
          return target[prop]
        }
      })
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true,
        fs: fsCounting
      })
      mock({
        '/root/list.html': { mode: '33188', content: '{% render "item" for items as x %}', mtime: 1 },
        '/root/item.html': { mode: '33188', content: '{{x}}', mtime: 1 }
      })
      await engine.renderFile('list', { items: [1, 2, 3, 4, 5] })
      // second render with a warm cache: list + item mtime checked once each, despite 5 includes
      mtimeCalls = 0
      await engine.renderFile('list', { items: [1, 2, 3, 4, 5] })
      expect(mtimeCalls).toBe(2)
    })
  })
})
