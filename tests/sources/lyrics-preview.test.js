// LRCLIB и iTunes на поддельном fetch. Тексты выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLyrics, syncedToPlain, pickBestRecord, LRCLIB_CLIENT } from '../../src/sources/lrclib.js';
import { findPreview, upscaleArtwork, pickBestTrack } from '../../src/sources/itunes.js';
import { mockFetch } from './_mock.js';

const rec = (id, trackName, artistName, duration, extra = {}) => ({
  id, trackName, artistName, duration, instrumental: false, plainLyrics: `la la ${id}`, syncedLyrics: `[00:01.00] la la ${id}`, ...extra,
});

test('findLyrics: точное совпадение через /api/get с заголовком клиента', async () => {
  const f = mockFetch([['/api/get?', { body: rec(1, 'Песня', 'Группа', 180) }]]);
  const r = await findLyrics({ artist: 'Группа', title: 'Песня', durationSec: 180.4 }, { fetch: f });
  assert.deepEqual(r, { plain: 'la la 1', synced: '[00:01.00] la la 1', duration: 180 });
  const u = new URL(f.calls[0].url);
  assert.equal(u.pathname, '/api/get');
  assert.equal(u.searchParams.get('artist_name'), 'Группа');
  assert.equal(u.searchParams.get('track_name'), 'Песня');
  assert.equal(u.searchParams.get('duration'), '180');
  assert.equal(f.calls[0].init.headers['Lrclib-Client'], LRCLIB_CLIENT);
});

test('findLyrics: 404 → v2 search → /api/get/{id}, выбор по длительности', async () => {
  const f = mockFetch([
    ['/api/get?', { status: 404, body: { message: 'Failed to find specified track' } }],
    ['/api/v2/search', { body: [
      { id: 10, trackName: 'Песня', artistName: 'Группа', duration: 240, instrumental: false, hasPlainLyrics: true },
      { id: 11, trackName: 'Песня', artistName: 'Группа', duration: 181, instrumental: false, hasPlainLyrics: true, hasSyncedLyrics: true },
      { id: 12, trackName: 'Совсем другое', artistName: 'Группа', duration: 181, instrumental: false, hasPlainLyrics: true },
    ] }],
    ['/api/get/11', { body: rec(11, 'Песня', 'Группа', 181) }],
  ]);
  const r = await findLyrics({ artist: 'Группа', title: 'Песня', durationSec: 180 }, { fetch: f });
  assert.equal(r.plain, 'la la 11');
  assert.deepEqual(f.calls.map((c) => new URL(c.url).pathname), ['/api/get', '/api/v2/search', '/api/get/11']);
});

test('findLyrics: v2 сломан → старый /api/search; инструментал и пусто → null', async () => {
  const f = mockFetch([
    ['/api/get?', { status: 404, body: {} }],
    ['/api/v2/search', { status: 500, body: 'err' }],
    ['/api/search', { body: [rec(20, 'Песня', 'Группа', 100, { instrumental: true }), rec(21, 'Песня', 'Группа', 100, { syncedLyrics: null })] }],
  ]);
  const r = await findLyrics({ artist: 'Группа', title: 'Песня' }, { fetch: f });
  assert.deepEqual(r, { plain: 'la la 21', synced: null, duration: 100 });

  const empty = mockFetch([['/api/get?', { status: 404, body: {} }], ['/api/v2/search', { body: [] }]]);
  assert.equal(await findLyrics({ artist: 'A', title: 'B' }, { fetch: empty }), null);
  assert.equal(await findLyrics({ title: '' }, { fetch: empty }), null);
});

test('syncedToPlain и pickBestRecord', () => {
  assert.equal(syncedToPlain('[00:01.20] раз\n[00:02.50][00:10.00] два <00:03.10>слово'), 'раз\nдва слово');
  assert.equal(pickBestRecord([rec(1, 'Другая', 'X', 100)], { title: 'Песня' }), null);
});

const track = (trackId, trackName, artistName, extra = {}) => ({
  kind: 'song', trackId, trackName, artistName, previewUrl: `https://audio.example/${trackId}.m4a`,
  artworkUrl100: `https://img.example/${trackId}/100x100bb.jpg`, trackViewUrl: `https://music.example/${trackId}`, trackTimeMillis: 200000, ...extra,
});

test('findPreview: лучший трек, обложка 300 px, country=by', async () => {
  const f = mockFetch([['itunes.apple.com/search', { body: { resultCount: 3, results: [
    track(1, 'Другая песня', 'Группа'),
    track(2, 'Песня', 'Каверщики', { previewUrl: undefined }),
    track(3, 'Песня', 'Группа'),
  ] } }]]);
  const r = await findPreview({ artist: 'Группа', title: 'Песня' }, { fetch: f });
  assert.deepEqual(r, {
    previewUrl: 'https://audio.example/3.m4a', artworkUrl: 'https://img.example/3/300x300bb.jpg',
    trackUrl: 'https://music.example/3', durationMs: 200000,
  });
  const u = new URL(f.calls[0].url);
  assert.equal(u.searchParams.get('term'), 'Группа Песня');
  assert.equal(u.searchParams.get('entity'), 'song');
  assert.equal(u.searchParams.get('limit'), '5');
  assert.equal(u.searchParams.get('country'), 'by');
});

test('findPreview: ничего похожего → null', async () => {
  const f = mockFetch([['itunes', { body: { resultCount: 1, results: [track(1, 'Совсем не то', 'Кто-то')] } }]]);
  assert.equal(await findPreview({ artist: 'Группа', title: 'Песня' }, { fetch: f }), null);
  assert.equal(pickBestTrack([], { title: 'x' }), null);
  assert.equal(upscaleArtwork('https://a/b/60x60bb.png', 600), 'https://a/b/600x600bb.png');
  assert.equal(upscaleArtwork(''), '');
});
