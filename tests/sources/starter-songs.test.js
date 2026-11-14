import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_SONGS, starterSongById } from '../../src/data/starter-songs.js';
import { parseSong, songChords, toChordPro } from '../../src/core/song.js';
import { detectLang } from '../../src/sources/util.js';

// Таблица из ARCHITECTURE.md: id, уровень, аккорды.
const TABLE = [
  ['starter-bratec-yakov', 'L0', 'C, Am'],
  ['starter-row-boat', 'L0', 'C, Am'],
  ['starter-oh-susanna', 'L1', 'C, F, G'],
  ['starter-when-the-saints', 'L1', 'C, F, G'],
  ['starter-vo-sadu', 'L1', 'C, F, G, Am'],
  ['starter-jingle-bells', 'L1', 'C, F, G'],
  ['starter-clementine', 'L1', 'C, G, F'],
  ['starter-amazing-grace', 'L1', 'C, F, G, Am'],
  ['starter-drunken-sailor', 'L2', 'Am, G, Dm'],
  ['starter-scarborough-fair', 'L2', 'Am, G, C, Em, D'],
  ['starter-red-river-valley', 'L2', 'C, F, G, Dm'],
  ['starter-shenandoah', 'L2', 'C, F, G, Am, Dm, Em'],
  ['starter-auld-lang-syne', 'L2', 'C, G, F, Am, Dm'],
  ['starter-oy-moroz', 'L3', 'Am, Dm, E7, G, C'],
  ['starter-chernyi-voron', 'L3', 'Am, Dm, E7'],
  ['starter-korobeiniki', 'L3', 'Am, Dm, E7, C, G'],
  ['starter-kalinka', 'L3', 'Am, Dm, E7, C, G'],
  ['starter-vo-pole-bereza', 'L3', 'Am, Dm, E7'],
  ['starter-kupalinka', 'L3', 'Am, Dm, E7'],
  ['starter-house-rising-sun', 'L3', 'Am, C, D, F, E7'],
  ['starter-greensleeves', 'L3', 'Am, G, F, E7, C'],
];
const STRUMS = new Set(['quarters', 'du', 'island', 'eighths', 'waltz', 'chuck', 'shuffle']);
const WALTZ = ['starter-amazing-grace', 'starter-scarborough-fair', 'starter-greensleeves', 'starter-shenandoah'];

test('состав: ровно 21 песня с id и уровнями из таблицы', () => {
  assert.equal(STARTER_SONGS.length, 21);
  assert.deepEqual(STARTER_SONGS.map((s) => [s.id, s.level]), TABLE.map(([id, level]) => [id, level]));
  assert.equal(new Set(STARTER_SONGS.map((s) => s.id)).size, 21);
  assert.equal(starterSongById('starter-kalinka').title, 'Калинка');
  assert.equal(starterSongById('nope'), null);
});

test('каждая песня разбирается и использует ровно свои аккорды', () => {
  for (const s of STARTER_SONGS) {
    const want = TABLE.find(([id]) => id === s.id)[2].split(', ').sort();
    const song = parseSong(s.text);
    assert.deepEqual([...songChords(song)].sort(), want, s.id);
    assert.equal(song.title, s.title, s.id);
    assert.equal(song.artist, s.artist, s.id);
    assert.ok(song.key, s.id);
    assert.ok(song.sections.length >= 2, s.id);
    assert.deepEqual(songChords(parseSong(toChordPro(song))), songChords(song), s.id);
  }
});

test('поля: бой из STRUM_PATTERNS, язык совпадает с текстом, вальс для песен на 3/4', () => {
  for (const s of STARTER_SONGS) {
    assert.ok(STRUMS.has(s.strum), `${s.id}: ${s.strum}`);
    assert.ok(['ru', 'be', 'en'].includes(s.lang), s.id);
    assert.equal(detectLang(s.text), s.lang, s.id);
    assert.ok(s.title && s.artist, s.id);
  }
  for (const id of WALTZ) assert.equal(starterSongById(id).strum, 'waltz', id);
});
