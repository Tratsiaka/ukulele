import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusLabel, normalizeFilter, isPlayingNow, filterSongs, filterCounts, sortRecent, isKnownChord, formatShift,
  shiftedKeyName, playBadge, songInfo, matchLibrary, urlKey, findByUrl, hitKey, groupHits, pushRecent,
  externalSearchLinks, snippetLines, importPreview, chordCount, extractUrl, guessTitleArtist, guessFromFileName,
  analyzeShare, sourceLabel, savedMessage,
} from '../../src/screens/songs-helpers.js';
import { parseSong } from '../../src/core/song.js';

const SONGS = [
  { id: 'a', title: 'Братец Яков', artist: 'народная', status: 'new', fav: false, chords: ['C', 'Am'], updatedAt: 10 },
  { id: 'b', title: 'Drunken Sailor', artist: 'trad.', status: 'learning', fav: true, chords: ['Am', 'G', 'Dm'], updatedAt: 30 },
  { id: 'c', title: 'Чёрный ворон', artist: 'народная', status: 'playing', fav: false, chords: ['Am', 'Dm', 'E7'], updatedAt: 20, lastPlayedAt: 50 },
  { id: 'd', title: 'Купалінка', artist: 'беларуская народная', status: 'polished', fav: true, chords: ['Bb', 'Gm', 'F'], updatedAt: 5 },
];

test('statusLabel и normalizeFilter', () => {
  assert.equal(statusLabel('learning'), 'Учу');
  assert.equal(statusLabel('polished'), 'Готова');
  assert.equal(statusLabel('???'), 'Новая');
  assert.equal(normalizeFilter('playable'), 'playable');
  assert.equal(normalizeFilter('nope'), 'all');
  assert.equal(normalizeFilter(undefined), 'all');
});

test('«Играю сейчас» — учу или играю', () => {
  assert.deepEqual(SONGS.filter(isPlayingNow).map((s) => s.id), ['b', 'c']);
});

test('filterSongs: все фильтры и счётчики', () => {
  const known = ['C', 'Am', 'G', 'Dm'];
  const info = (s) => songInfo(s.chords, known);
  assert.deepEqual(filterSongs(SONGS, 'all', info).map((s) => s.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(filterSongs(SONGS, 'playing', info).map((s) => s.id), ['b', 'c']);
  assert.deepEqual(filterSongs(SONGS, 'fav', info).map((s) => s.id), ['b', 'd']);
  // Bb Gm F → сдвиг +2 даёт C Am G: всё знакомо
  assert.deepEqual(filterSongs(SONGS, 'playable', info).map((s) => s.id), ['a', 'b', 'd']);
  assert.deepEqual(filterCounts(SONGS, info), { all: 4, playing: 2, playable: 3, fav: 2 });
  // не мутирует исходный список
  assert.notEqual(filterSongs(SONGS, 'all', info), SONGS);
});

test('sortRecent: игра или изменение, свежие сверху', () => {
  assert.deepEqual(sortRecent(SONGS).map((s) => s.id), ['c', 'b', 'a', 'd']);
});

test('isKnownChord: с упрощением', () => {
  const known = new Set(['Am', 'C']);
  assert.equal(isKnownChord('Am', known), true);
  assert.equal(isKnownChord('Am7', known), true);
  assert.equal(isKnownChord('Cmaj7', known), true);
  assert.equal(isKnownChord('F', known), false);
  assert.equal(isKnownChord('Am', new Set()), false);
});

test('formatShift — с настоящим минусом', () => {
  assert.equal(formatShift(3), '+3');
  assert.equal(formatShift(-3), '−3');
  assert.equal(formatShift(0), '0');
});

test('shiftedKeyName: тональность после сдвига', () => {
  assert.equal(shiftedKeyName(['Dm', 'Gm', 'A7'], -5), 'Am');
  assert.equal(shiftedKeyName(['C', 'F', 'G'], 0), 'C');
  assert.equal(shiftedKeyName(['C', 'F', 'G'], 5), 'F');
  assert.equal(shiftedKeyName(['C', 'F', 'G'], -2), 'Bb');
});

test('playBadge: все четыре случая', () => {
  assert.deepEqual(playBadge(['C', 'Am'], ['C', 'Am']), { kind: 'playable', text: 'можно сыграть', shift: 0, missing: [] });

  const shifted = playBadge(['Dm', 'Gm', 'A7'], ['Am', 'Dm', 'E7']);
  assert.equal(shifted.kind, 'shift');
  assert.equal(shifted.shift, -5);
  assert.equal(shifted.text, 'в Am (−5)');

  const one = playBadge(['C', 'F', 'G'], ['C', 'G']);
  assert.equal(one.kind, 'missing');
  assert.equal(one.text, 'не хватает F');

  const two = playBadge(['Am', 'F', 'G', 'C'], []);
  assert.equal(two.kind, 'missing');
  assert.match(two.text, /^не хватает \d$/);

  assert.equal(playBadge([], ['C']).kind, 'none');
  assert.equal(playBadge(undefined, ['C']).kind, 'none');
});

test('playBadge: красивые имена и нотация H', () => {
  assert.equal(playBadge(['C', 'Bb'], ['C']).text, 'не хватает B♭');
  assert.equal(playBadge(['C', 'Bb'], ['C'], { notation: 'H' }).text, 'не хватает B');
});

test('songInfo: звёзды и узкое место', () => {
  const easy = songInfo(['C', 'Am'], ['C', 'Am']);
  assert.equal(easy.playable, true);
  assert.ok(easy.stars >= 1 && easy.stars <= 5);
  const hard = songInfo(['Bb', 'E', 'F#m', 'C#m', 'G#', 'Ebm'], ['C']);
  assert.ok(hard.stars > easy.stars);
  assert.ok(hard.bottleneck.length > 0);
  const none = songInfo([], ['C']);
  assert.equal(none.playable, false);
  assert.equal(none.stars, 1);
});

test('matchLibrary: начала слов, ё/е, і/и, исполнитель', () => {
  assert.deepEqual(matchLibrary(SONGS, 'черн вор').map((s) => s.id), ['c']);
  assert.deepEqual(matchLibrary(SONGS, 'купалинка').map((s) => s.id), ['d']);
  assert.deepEqual(matchLibrary(SONGS, 'народная').map((s) => s.id), ['a', 'c', 'd']);
  assert.deepEqual(matchLibrary(SONGS, 'sailor trad').map((s) => s.id), ['b']);
  assert.deepEqual(matchLibrary(SONGS, '   '), []);
  assert.equal(matchLibrary(SONGS, 'народная', 2).length, 2);
});

test('urlKey и findByUrl: одна и та же страница', () => {
  assert.equal(urlKey('https://www.akkords.pro/songs/kino/'), urlKey('http://akkords.pro/songs/kino'));
  assert.equal(urlKey('не адрес'), '');
  assert.equal(urlKey(''), '');
  const list = [{ id: 'x', source: { url: 'https://dieza.net/akkordy/gruppa-krovi/' } }, { id: 'y', source: {} }];
  assert.equal(findByUrl(list, 'https://dieza.net/akkordy/gruppa-krovi')?.id, 'x');
  assert.equal(findByUrl(list, 'https://dieza.net/akkordy/other'), undefined);
  assert.equal(findByUrl(list, ''), undefined);
});

test('groupHits: одна песня из двух источников — одна группа', () => {
  const hits = [
    { id: 'akkords:1', sourceId: 'akkords', title: 'Группа крови', artist: 'Кино', score: 0.9, chords: ['F#m', 'D'] },
    { id: 'akkords:2', sourceId: 'akkords', title: 'Кукушка', artist: 'Кино', score: 0.4 },
    { id: 'dieza:7', sourceId: 'dieza', title: 'Группа Крови', artist: 'КИНО', score: 0.95, chords: ['Am', 'F'] },
  ];
  const groups = groupHits(hits);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].versions.length, 2);
  assert.equal(groups[0].score, 0.95);
  assert.equal(groups[0].versions[0].id, 'dieza:7');
  assert.equal(groups[1].versions[0].id, 'akkords:2');
  // rank важнее оценки: более играбельная версия первой
  const ranked = groupHits(hits, { rank: (h) => (h.id === 'akkords:1' ? 0 : 1) });
  assert.equal(ranked[0].versions[0].id, 'akkords:1');
  assert.equal(hitKey({ title: 'Ёлка', artist: 'Ё' }), hitKey({ title: 'елка', artist: 'е' }));
});

test('pushRecent: без повторов и недопечатанных начал', () => {
  assert.deepEqual(pushRecent([], 'кино'), ['кино']);
  assert.deepEqual(pushRecent(['ки', 'сплин'], 'кино'), ['кино', 'сплин']);
  assert.deepEqual(pushRecent(['Кино', 'сплин'], 'кино'), ['кино', 'сплин']);
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
  assert.deepEqual(pushRecent(['a'], '  '), ['a']);
});

test('externalSearchLinks: запрос в адресе', () => {
  const [ug, amdm] = externalSearchLinks('группа крови');
  assert.equal(ug.url, 'https://www.ultimate-guitar.com/search.php?search_type=title&value=%D0%B3%D1%80%D1%83%D0%BF%D0%BF%D0%B0%20%D0%BA%D1%80%D0%BE%D0%B2%D0%B8');
  assert.match(amdm.url, /^https:\/\/amdm\.ru\/search\/\?q=%D0%B3/);
  assert.equal(externalSearchLinks('')[1].url, 'https://amdm.ru/search/?q=');
});

test('snippetLines: первые строки с подписями частей', () => {
  const song = parseSong('{title: T}\n{start_of_verse: Куплет 1}\n[C]Раз два [Am]три\n[F]четыре\n{end_of_verse}\n\n{start_of_chorus}\n[G]Припев [C]тут\n{end_of_chorus}\n');
  const lines = snippetLines(song, 8);
  assert.equal(lines[0].type, 'label');
  assert.equal(lines[0].text, 'Куплет 1');
  assert.equal(lines[1].type, 'lyrics');
  assert.equal(lines.filter((l) => l.type === 'lyrics').length, 3);
  assert.equal(snippetLines(song, 2).length, 2);
  assert.deepEqual(snippetLines(null), []);
});

test('importPreview: формат, аккорды, строки', () => {
  assert.equal(importPreview('   '), null);
  const plain = importPreview('Am        Dm\nСпят курганы тёмные\nE7          Am\nСолнцем опалённые\n');
  assert.equal(plain.format, 'plain');
  assert.equal(plain.formatLabel, 'аккорды над строками');
  assert.deepEqual(plain.chords, ['Am', 'Dm', 'E7']);
  assert.equal(plain.lines, 2);
  const cp = importPreview('{title: Песня}\n[C]Раз [G]два\n');
  assert.equal(cp.format, 'chordpro');
  assert.equal(cp.song.title, 'Песня');
  const ug = importPreview('[Verse]\n[ch]Am[/ch]   [ch]C[/ch]\nТекст песни тут\n');
  assert.equal(ug.format, 'ug');
  assert.deepEqual(ug.chords, ['Am', 'C']);
  assert.equal(importPreview('просто текст без аккордов\nи ещё строка').chords.length, 0);
});

test('chordCount и extractUrl', () => {
  assert.equal(chordCount('Am  C\nтекст\nG F\nещё'), 4);
  assert.equal(chordCount('Обычное сообщение'), 0);
  assert.equal(extractUrl('Смотри https://akkords.pro/songs/x/. круто'), 'https://akkords.pro/songs/x/');
  assert.equal(extractUrl('нет ссылки'), '');
});

test('guessTitleArtist: заголовки сайтов', () => {
  assert.deepEqual(guessTitleArtist('Кино — Группа крови аккорды'), { artist: 'Кино', title: 'Группа крови' });
  assert.deepEqual(guessTitleArtist('Кино - Группа крови, аккорды и текст песни | AmDm.ru'), { artist: 'Кино', title: 'Группа крови' });
  assert.deepEqual(guessTitleArtist('GRUPPA KROVI CHORDS by Kino @ Ultimate-Guitar.Com'), { title: 'Gruppa Krovi', artist: 'Kino' });
  assert.deepEqual(guessTitleArtist('Wonderwall Ukulele Chords by Oasis'), { title: 'Wonderwall', artist: 'Oasis' });
  assert.deepEqual(guessTitleArtist('Аккорды песни Сплин – Выхода нет 🎸'), { artist: 'Сплин', title: 'Выхода нет' });
  assert.deepEqual(guessTitleArtist('Купалинка — аккорды на akkords.pro'), { title: 'Купалинка', artist: '' });
  assert.deepEqual(guessTitleArtist('Кино – Кукушка (аккорды)'), { artist: 'Кино', title: 'Кукушка' });
  assert.deepEqual(guessTitleArtist('Последний бой'), { title: 'Последний бой', artist: '' });
  assert.deepEqual(guessTitleArtist('ГРУППА КРОВИ'), { title: 'Группа крови', artist: '' });
  assert.deepEqual(guessTitleArtist(''), { title: '', artist: '' });
  assert.deepEqual(guessTitleArtist('Hey Jude by The Beatles'), { title: 'Hey Jude', artist: 'The Beatles' });
});

test('guessFromFileName', () => {
  assert.deepEqual(guessFromFileName('kino_-_gruppa_krovi.chordpro'), { artist: 'kino', title: 'gruppa krovi' });
  assert.deepEqual(guessFromFileName('Перемен.txt'), { title: 'Перемен', artist: '' });
});

test('analyzeShare: текст с аккордами, адрес, подсказка', () => {
  assert.equal(analyzeShare({}).mode, 'none');

  const song = 'Am            Dm\nВо поле берёза стояла\nE7             Am\nВо поле кудрявая стояла';
  const t = analyzeShare({ title: 'Кино — Группа крови аккорды', text: `${song}\n\nhttps://example.com/x`, url: '' });
  assert.equal(t.mode, 'text');
  assert.equal(t.text, song);
  assert.equal(t.url, 'https://example.com/x');
  assert.equal(t.title, 'Группа крови');
  assert.equal(t.artist, 'Кино');

  const u = analyzeShare({ title: 'Кино — Группа крови', text: 'https://akkords.pro/songs/gruppa-krovi/' });
  assert.equal(u.mode, 'url');
  assert.equal(u.url, 'https://akkords.pro/songs/gruppa-krovi/');
  assert.equal(u.text, '');

  const u2 = analyzeShare({ url: 'https://example.com/song', text: 'Посмотри, какая песня' });
  assert.equal(u2.mode, 'url');
  assert.equal(u2.title, 'Посмотри, какая песня');

  const h = analyzeShare({ title: 'Сплин — Романс' });
  assert.equal(h.mode, 'hint');
  assert.equal(h.title, 'Романс');
  assert.equal(h.artist, 'Сплин');
});

test('sourceLabel: откуда песня', () => {
  assert.equal(sourceLabel({ site: 'starter' }), 'стартовый набор');
  assert.equal(sourceLabel({ site: 'paste', url: 'https://x.ru/a' }), 'вставлена вручную');
  assert.equal(sourceLabel({ site: 'akkords', url: 'https://akkords.pro/songs/a/' }), 'akkords.pro');
  assert.equal(sourceLabel({ site: 'other', url: 'https://www.mychords.net/ru/x.html' }), 'mychords.net');
  assert.equal(sourceLabel(undefined), '');
});

test('savedMessage: радуемся, если песню уже можно сыграть', () => {
  assert.equal(savedMessage({ kind: 'playable', text: 'можно сыграть' }), 'Сохранил. Все аккорды тебе знакомы');
  assert.equal(savedMessage({ kind: 'shift', text: 'в Am (−3)' }), 'Сохранил. Можно играть в Am (−3) — все аккорды знакомы');
  assert.equal(savedMessage({ kind: 'missing', text: 'не хватает 2' }), 'Сохранил в библиотеку');
});
