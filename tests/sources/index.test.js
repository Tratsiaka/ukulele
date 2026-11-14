// searchSongs и loadSong целиком (WP-адаптеры + core/song.js) на поддельном fetch. Тексты народные или выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { SOURCES, searchSongs, loadSong, hitFromUrl, detectLang, searchKey, findLyrics, findPreview } from '../../src/sources/index.js';
import { parseSong, songChords } from '../../src/core/song.js';
import { mockFetch, fakeStorage, fakeClock } from './_mock.js';

const VORON = '<p class="chords"><b>Куплет 1:</b>\n<span>Am</span>            <span>Dm</span>\nЧёрный ворон, чёрный ворон,\n'
  + '<span>E7</span>                  <span>Am</span>\nЧто ты вьёшься надо мной?\n</p>';
const wpPost = (id, title, link, content, artist) => ({
  id, title: { rendered: title }, link, content: { rendered: content },
  _embedded: { 'wp:term': [[{ taxonomy: 'category', name: artist, slug: 'a' }]] },
});
const AKK = wpPost(1, 'Чёрный ворон', 'https://akkords.pro/songs/narod/voron/', VORON, 'Народная');
const DZ = wpPost(2, 'Чёрный ворон', 'https://dieza.net/akkordy/n-rus/narod/voron.html', `<pre>${'Am     Dm\nЧёрный ворон\nE7  Am\nя не твой'}</pre>`, 'Народ');

test('контракт: экспорты и SOURCES', () => {
  assert.deepEqual(SOURCES.map((s) => s.id), ['akkords', 'dieza']);
  for (const s of SOURCES) {
    assert.ok(s.name && s.site.startsWith('https://') && Array.isArray(s.langs) && s.note);
  }
  for (const fn of [searchSongs, loadSong, findLyrics, findPreview, detectLang, searchKey, hitFromUrl]) assert.equal(typeof fn, 'function');
});

test('searchSongs: результаты по мере прихода, с аккордами', async () => {
  let releaseDieza;
  const diezaGate = new Promise((r) => { releaseDieza = r; });
  const f = mockFetch([
    ['akkords.pro', { body: [AKK] }],
    ['dieza.net', async () => { await diezaGate; return { body: [DZ] }; }],
  ]);
  const events = [];
  const done = searchSongs('чёрный ворон', {
    fetch: f, parser: DOMParser, storage: fakeStorage(),
    onHits: (id, hits) => {
      events.push(id);
      if (id === 'akkords') releaseDieza();
      for (const h of hits) assert.deepEqual(h.chords, ['Am', 'Dm', 'E7']);
    },
    onError: (id, e) => assert.fail(`${id}: ${e.message}`),
  });
  await done;
  assert.deepEqual(events, ['akkords', 'dieza']);
});

test('searchSongs: 3 сбоя подряд → источник пропускается, потом reset', async () => {
  const storage = fakeStorage();
  const now = fakeClock();
  const f = mockFetch([['akkords.pro', { body: [AKK] }], ['dieza.net', { status: 503, body: 'down' }]]);
  const errors = [];
  const run = () => searchSongs('ворон', { fetch: f, parser: DOMParser, storage, now, onError: (id, e) => errors.push([id, e.code]) });
  await run(); await run(); await run();
  assert.deepEqual(errors, [['dieza', 'http'], ['dieza', 'http'], ['dieza', 'http']]);
  const diezaCalls = f.calls.filter((c) => c.url.includes('dieza')).length;
  await run();
  assert.deepEqual(errors.at(-1), ['dieza', 'skipped']);
  assert.equal(f.calls.filter((c) => c.url.includes('dieza')).length, diezaCalls);
  now.advance(24 * 3600 * 1000 + 1);
  await run();
  assert.deepEqual(errors.at(-1), ['dieza', 'http']);
});

test('searchSongs: отмена — без колбэков; пустой запрос — без запросов', async () => {
  const f = mockFetch([[() => true, { hang: true }]]);
  const ctrl = new AbortController();
  const calls = [];
  const p = searchSongs('ворон', { fetch: f, parser: DOMParser, storage: fakeStorage(), signal: ctrl.signal,
    onHits: () => calls.push('hits'), onError: () => calls.push('err') });
  ctrl.abort();
  await p;
  assert.deepEqual(calls, []);
  const g = mockFetch([]);
  await searchSongs('  ?! ', { fetch: g, storage: fakeStorage() });
  assert.equal(g.calls.length, 0);
});

test('loadSong: текст из поиска без повторного запроса', async () => {
  let hit;
  const f = mockFetch([['akkords.pro', { body: [AKK] }], ['dieza.net', { body: [] }]]);
  await searchSongs('ворон', { fetch: f, parser: DOMParser, storage: fakeStorage(), onHits: (id, h) => { if (h.length) hit = h[0]; } });
  const before = f.calls.length;
  const s = await loadSong(hit, { fetch: f, parser: DOMParser });
  assert.equal(f.calls.length, before);
  assert.equal(s.title, 'Чёрный ворон');
  assert.equal(s.artist, 'Народная');
  assert.deepEqual(s.chords, ['Am', 'Dm', 'E7']);
  assert.equal(s.lang, 'ru');
  assert.equal(s.source.site, 'akkords');
  assert.equal(s.source.url, 'https://akkords.pro/songs/narod/voron/');
  assert.ok(Number.isFinite(s.source.fetchedAt));
  assert.match(s.text, /^\{title: Чёрный ворон\}/);
  assert.deepEqual(songChords(parseSong(s.text)), ['Am', 'Dm', 'E7']);
  assert.match(s.rawText, /Чёрный ворон, чёрный ворон/);
});

test('loadSong: по ссылке (Share Target) через slug', async () => {
  const f = mockFetch([['slug=voron', { body: [DZ] }]]);
  const s = await loadSong(hitFromUrl('https://dieza.net/akkordy/n-rus/narod/voron.html'), { fetch: f, parser: DOMParser });
  assert.equal(s.title, 'Чёрный ворон');
  assert.equal(s.artist, 'Народ');
  assert.deepEqual(s.chords, ['Am', 'Dm', 'E7']);
  assert.equal(s.source.site, 'dieza');
  await assert.rejects(loadSong({ sourceId: 'nowhere', id: 'x' }), (e) => e.code === 'unknown');
});
