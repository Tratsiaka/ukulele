// Service worker в песочнице node:vm: кеш, навигация с таймаутом, чужие адреса, SKIP_WAITING.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCOPE = 'https://me.github.io/ukulele/';
const SRC = readFileSync(new URL('../../src/sw.tpl.js', import.meta.url), 'utf8').replaceAll('__V__', 'T1');

function makeCaches() {
  const store = new Map(); // name → Map(url → Response)
  const key = (r) => (typeof r === 'string' ? new URL(r, SCOPE).href : r.url);
  const strip = (u) => u.split('?')[0];
  const open = async (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async addAll(reqs) {
        for (const r of reqs) m.set(key(r), new Response('x'));
      },
      async put(r, res) {
        m.set(key(r), res);
      },
      async match(r, { ignoreSearch = false } = {}) {
        const k = key(r);
        if (m.has(k)) return m.get(k).clone();
        if (ignoreSearch) for (const [u, res] of m) if (strip(u) === strip(k)) return res.clone();
        return undefined;
      },
    };
  };
  return {
    store,
    open,
    keys: async () => [...store.keys()],
    delete: async (k) => store.delete(k),
    match: async (r, opts = {}) => {
      const names = opts.cacheName ? [opts.cacheName] : [...store.keys()];
      for (const n of names) {
        const hit = store.has(n) ? await (await open(n)).match(r, opts) : undefined;
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

function basic(body, status = 200) {
  const res = new Response(body, { status });
  Object.defineProperty(res, 'type', { value: 'basic' });
  return res;
}

function boot(fetchImpl) {
  const listeners = {};
  const caches = makeCaches();
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    location: new URL('sw.js', SCOPE),
    registration: { scope: SCOPE },
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: () => calls.skipWaiting++,
    clients: { claim: async () => calls.claim++ },
  };
  const ctx = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    Request: class extends Request {
      constructor(u, init) {
        super(new URL(u, SCOPE), init);
      }
    },
    Response,
    URL,
    Promise,
    setTimeout: (fn, ms) => setTimeout(fn, ms / 100), // 3 с → 30 мс
    clearTimeout,
  });
  vm.runInContext(SRC, ctx);
  // wait: false — не ждать waitUntil (сеть, которая так и не ответила)
  const fire = async (type, extra = {}, { wait = true } = {}) => {
    const pending = [];
    let response;
    const ev = { ...extra, waitUntil: (p) => pending.push(p), respondWith: (p) => (response = p) };
    listeners[type](ev);
    const res = await response;
    if (wait) await Promise.all(pending);
    return { res, responded: response !== undefined };
  };
  return { fire, caches, calls };
}

const nav = (url = SCOPE) => ({ request: { method: 'GET', url, mode: 'navigate', headers: new Headers() } });
const get = (url) => ({ request: new Request(url) });

test('install кладёт оболочку в кеш uke-<версия>, activate чистит старые uke-*', async () => {
  const { fire, caches, calls } = boot(async () => basic('ok'));
  await fire('install');
  const shell = caches.store.get('uke-T1');
  assert.ok(shell.has(`${SCOPE}index.html`));
  assert.ok(shell.has(`${SCOPE}assets/app.js?v=T1`));
  assert.ok(shell.has(`${SCOPE}icons/icon-maskable-512.png`));
  assert.equal(calls.skipWaiting, 0, 'без skipWaiting при установке');
  caches.store.set('uke-old', new Map());
  caches.store.set('other-app', new Map());
  await fire('activate');
  assert.deepEqual([...caches.store.keys()].sort(), ['other-app', 'uke-T1']);
  assert.equal(calls.claim, 1);
});

test('SKIP_WAITING по сообщению', async () => {
  const { fire, calls } = boot(async () => basic('ok'));
  await fire('message', { data: { type: 'SKIP_WAITING' } });
  await fire('message', { data: 'hello' });
  assert.equal(calls.skipWaiting, 1);
});

test('чужие адреса и POST не перехватываются', async () => {
  const { fire } = boot(async () => basic('ok'));
  assert.equal((await fire('fetch', get('https://akkords.pro/wp-json/wp/v2/posts?search=x'))).responded, false);
  assert.equal((await fire('fetch', get('https://me.github.io/other-app/x.js'))).responded, false);
  assert.equal((await fire('fetch', { request: new Request(`${SCOPE}x`, { method: 'POST' }) })).responded, false);
});

test('навигация: сеть, затем кеш при обрыве и по таймауту', async () => {
  let mode = 'online';
  const { fire, caches } = boot(async () => {
    if (mode === 'offline') throw new TypeError('offline');
    if (mode === 'slow') return new Promise(() => {});
    return basic('<html>fresh</html>');
  });
  await fire('install');
  let { res } = await fire('fetch', nav(`${SCOPE}?source=pwa`));
  assert.equal(await res.text(), '<html>fresh</html>');
  assert.equal(await (await caches.match('./index.html')).text(), '<html>fresh</html>');

  mode = 'offline';
  ({ res } = await fire('fetch', nav()));
  assert.equal(await res.text(), '<html>fresh</html>');

  mode = 'slow';
  const t0 = Date.now();
  ({ res } = await fire('fetch', nav(), { wait: false }));
  assert.equal(await res.text(), '<html>fresh</html>', 'по таймауту отдаётся кеш');
  assert.ok(Date.now() - t0 < 1000);
});

test('свои файлы: из кеша, промах — из сети с сохранением', async () => {
  let fetched = 0;
  const { fire, caches } = boot(async () => {
    fetched++;
    return basic('net');
  });
  await fire('install');
  fetched = 0;
  const hit = await fire('fetch', get(`${SCOPE}assets/app.js?v=T1`));
  assert.equal(await hit.res.text(), 'x');
  assert.equal(fetched, 0);
  const miss = await fire('fetch', get(`${SCOPE}data/extra.json`));
  assert.equal(await miss.res.text(), 'net');
  assert.equal(fetched, 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(caches.store.get('uke-T1').has(`${SCOPE}data/extra.json`));
});

test('всё из оболочки (кроме index и assets) лежит в src/static, иконки манифеста тоже', async () => {
  const { fire, caches } = boot(async () => basic('ok'));
  await fire('install');
  const staticDir = new URL('../../src/static/', import.meta.url);
  const urls = [...caches.store.get('uke-T1').keys()].map((u) => u.slice(SCOPE.length));
  for (const rel of urls.filter((u) => u && u !== 'index.html' && !u.startsWith('assets/'))) {
    assert.ok(readFileSync(new URL(rel, staticDir)).length > 0, rel);
  }
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', staticDir), 'utf8'));
  const icons = [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)].map((i) => i.src);
  for (const src of icons) assert.ok(urls.includes(src), `${src} в кеше оболочки`);
  assert.equal(manifest.share_target.action, './?share=1');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});
