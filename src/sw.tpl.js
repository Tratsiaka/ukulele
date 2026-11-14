// Service worker «Уке». __V__ подставляет build.py (хэш сборки).
// Оболочка — в кеше заранее; навигация — сначала сеть (3 с), потом кеш; свои файлы — сначала кеш.
// Чужие адреса (песни, LRCLIB, iTunes) не кешируем никогда. Новая версия ждёт, пока пользователь нажмёт «Обновить».

const VERSION = '__V__';
const CACHE = `uke-${VERSION}`;
const INDEX = './index.html';
const NAV_TIMEOUT_MS = 3000;

const SHELL = [
  './',
  INDEX,
  `./assets/app.js?v=${VERSION}`,
  `./assets/app.css?v=${VERSION}`,
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/shortcut-practice.png',
  './icons/shortcut-tuner.png',
  './icons/shortcut-songs.png',
];

self.addEventListener('install', (event) => {
  // Без skipWaiting: новая версия не включается посреди занятия
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('uke-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужое — мимо кеша
  if (!url.href.startsWith(self.registration.scope)) return; // соседние приложения на том же домене

  if (req.mode === 'navigate') {
    const network = fetch(req).then(async (res) => {
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(INDEX, res.clone());
      }
      return res;
    });
    event.waitUntil(network.then(() => undefined, () => undefined));
    event.respondWith(navigationResponse(network));
    return;
  }

  event.respondWith(cacheFirst(req));
});

/** Сеть с таймаутом 3 с; не успела или упала — index.html из кеша. */
async function navigationResponse(network) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // нет сети — пробуем кеш
  } finally {
    clearTimeout(timer);
  }
  const cached = await caches.match(INDEX, { cacheName: CACHE, ignoreSearch: true });
  if (cached) return cached;
  try {
    return await network;
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:24px">Нет сети. Открой Уке, когда появится интернет.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** Свои файлы: из кеша, иначе из сети с сохранением. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic' && !req.headers.has('range')) {
    cache.put(req, res.clone()).catch(() => {});
  }
  return res;
}
