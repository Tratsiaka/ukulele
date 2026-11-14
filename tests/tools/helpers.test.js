import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  chordGroups, pathChords, normalizeQuery, searchChords, difficultyInfo, shapeCaption, chordSongs, chordGain,
  nextChordSuggestion, partnerFor, knownMilestone, knownSinceText, knownTitle, toolFromParam, bpmFromQuery, pairRecords, sparkline,
  initialPair, setPairSlot, pairOptions, backupFileName, parseTime, versionFromSrc, importMessage, storageInfo,
  weeklyHint, appUrl, lastBackupText, TOOL_IDS,
} from '../../src/screens/tools-helpers.js';
import { DICTIONARY_ORDER, chordDifficulty, getShapes, listChordNames } from '../../src/core/shapes.js';

const SONGS = [
  { id: 's1', title: 'Братец Яков', status: 'new', chords: ['C', 'Am'], text: '[C]Бра-[Am]тец [C]Я-[Am]ков' },
  { id: 's2', title: 'Oh! Susanna', status: 'playing', chords: ['C', 'F', 'G'], text: '[C]Oh I [G]come from [C]Ala[F]bama [C]with my [G]banjo' },
  { id: 's3', title: 'Drunken Sailor', status: 'learning', chords: ['Am', 'G', 'Dm'], text: '[Am]What shall we [G]do with a [Am]drunken [Dm]sailor' },
  { id: 's4', title: 'Чёрный ворон', status: 'new', chords: ['Am', 'Dm', 'E7'], text: '[Am]Чёрный [Dm]ворон [E7]что ты [Am]вьёшься' },
];

// ---------- словарь ----------

test('chordGroups: первые четыре, уровни, «Остальные» без повторов', () => {
  const groups = chordGroups(['C', 'Am', 'Dm']);
  assert.equal(groups[0].title, 'Первые четыре');
  assert.deepEqual(groups[0].chords, ['C', 'Am', 'F', 'G']);
  assert.equal(groups[0].known, 2);
  const sev = groups.find((g) => g.id === 'sevenths');
  assert.ok(sev.chords.includes('G7'), 'запасные аккорды уровня тоже в группе');
  const rest = groups[groups.length - 1];
  assert.equal(rest.id, 'rest');
  assert.equal(rest.title, 'Остальные');
  const all = groups.flatMap((g) => g.chords);
  assert.equal(new Set(all).size, all.length, 'аккорд встречается один раз');
  assert.ok(all.every((n) => getShapes(n).length), 'только аккорды со схемой');
  assert.ok(!rest.chords.includes('C'));
  // порядок «Остальных» — как в словаре
  const idx = rest.chords.map((n) => DICTIONARY_ORDER.indexOf(n));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('pathChords: аккорды пути без повторов', () => {
  const p = pathChords();
  assert.ok(p.includes('C') && p.includes('C#m') && p.includes('D7'));
  assert.equal(new Set(p).size, p.length);
});

test('normalizeQuery: регистр, кириллица, нотация H', () => {
  assert.equal(normalizeQuery('  '), null);
  assert.deepEqual(normalizeQuery('am'), { text: 'Am', name: 'Am' });
  assert.equal(normalizeQuery('f#m').name, 'F#m');
  assert.equal(normalizeQuery('А#').name, 'Bb'); // кириллическая А
  assert.equal(normalizeQuery('H', { german: true }).name, 'B');
  assert.equal(normalizeQuery('B', { german: true }).name, 'Bb');
  assert.equal(normalizeQuery('Csu').name, null);
});

test('searchChords: сам аккорд первым, затем то же семейство', () => {
  assert.equal(searchChords(''), null);
  const am = searchChords('am');
  assert.equal(am[0], 'Am');
  assert.ok(am.includes('Am7'));
  const firstMajor = am.findIndex((n) => n.startsWith('Amaj'));
  const lastMinor = Math.max(am.indexOf('Am7'), am.indexOf('Am6'));
  if (firstMajor >= 0) assert.ok(lastMinor < firstMajor, 'миноры раньше мажорных Amaj7');
  const c = searchChords('C');
  assert.equal(c[0], 'C');
  assert.ok(!c.some((n) => n.startsWith('C#')), 'C# — другой корень');
});

test('searchChords: энгармонизм, части суффикса, лимит', () => {
  assert.equal(searchChords('A#')[0], 'Bb');
  assert.ok(searchChords('Gb').every((n) => n.startsWith('F#')));
  const sus = searchChords('Csu');
  assert.ok(sus.length && sus.every((n) => n.includes('sus')));
  assert.ok(searchChords('m7b5').every((n) => n.endsWith('m7b5')));
  assert.equal(searchChords('C', { limit: 3 }).length, 3);
  assert.deepEqual(searchChords('zzz'), []);
});

test('searchChords: найденное всегда есть в словаре', () => {
  const names = new Set(listChordNames());
  fc.assert(
    fc.property(fc.string({ maxLength: 6 }), (q) => {
      const r = searchChords(q);
      return r === null || r.every((n) => names.has(n) || getShapes(n).length > 0);
    }),
    { numRuns: 300 },
  );
});

test('difficultyInfo и shapeCaption', () => {
  assert.equal(difficultyInfo(chordDifficulty('Am7')).dots, 1);
  assert.equal(difficultyInfo(chordDifficulty('C')).label, 'совсем легко');
  assert.ok(difficultyInfo(chordDifficulty('Bb')).dots >= 4);
  assert.equal(difficultyInfo(Infinity).dots, 0);
  const em = getShapes('Em');
  assert.equal(shapeCaption(em[0], 0), 'основная');
  assert.equal(shapeCaption(em[1], 1), 'попроще · Em7');
  assert.equal(shapeCaption({ frets: [5, 5, 5, 7] }, 2), 'выше по грифу');
  assert.equal(shapeCaption({ frets: [0, 4, 0, 3] }, 2), 'вариант');
});

test('chordSongs: играю и учу сверху, затем по названию', () => {
  assert.deepEqual(chordSongs('Am', SONGS).map((s) => s.id), ['s3', 's1', 's4']);
  assert.deepEqual(chordSongs('Bb', SONGS), []);
  assert.deepEqual(chordSongs('C', [{ id: 'x' }, null]), []);
});

test('chordGain и nextChordSuggestion: сколько песен откроет аккорд', () => {
  assert.equal(chordGain('E7', SONGS, ['Am', 'Dm']), 1);
  assert.equal(chordGain('Am', SONGS, ['Am']), 0, 'известный — ноль');
  assert.equal(chordGain('Am7', SONGS, ['Am']), 0, 'то же семейство — ноль');
  const next = nextChordSuggestion(SONGS, ['C', 'Am', 'F']);
  assert.deepEqual(next, { chord: 'G', gain: 1 });
  assert.deepEqual(nextChordSuggestion(SONGS, ['C', 'Am']), { chord: 'F', gain: 0 }, 'нет прироста — по словарю');
  const flat = nextChordSuggestion([], ['C']);
  assert.deepEqual(flat, { chord: 'Am', gain: 0 }, 'без песен — следующий по словарю');
  assert.equal(nextChordSuggestion([], DICTIONARY_ORDER), null);
});

test('partnerFor: известный из главных пар, сосед в песнях, запасные варианты', () => {
  assert.equal(partnerFor('F', { known: ['C', 'G', 'F'] }), 'C');
  assert.equal(partnerFor('E7', { known: ['Dm'], songs: SONGS }), 'Dm');
  assert.equal(partnerFor('E7', { known: [], songs: SONGS }), 'Am');
  assert.equal(partnerFor('Cadd9', { known: ['G'] }), 'G');
  assert.equal(partnerFor('Cadd9', { known: [] }), 'C');
  assert.equal(partnerFor('C', {}), 'Am');
  assert.notEqual(partnerFor('Am', { known: ['Am'] }), 'Am');
});

test('knownSinceText', () => {
  assert.equal(knownSinceText('2026-11-14', '2026-11-14'), 'выучен сегодня');
  assert.equal(knownSinceText('2026-11-13', '2026-11-14'), 'выучен вчера');
  assert.equal(knownSinceText('2026-11-02', '2026-11-14'), 'выучен 2 нояб.');
  assert.equal(knownSinceText('???', '2026-11-14'), 'выучен');
});

test('knownTitle и knownMilestone', () => {
  assert.equal(knownTitle(0), 'Пока ни одного аккорда');
  assert.equal(knownTitle(1), 'Ты знаешь 1 аккорд');
  assert.equal(knownTitle(3), 'Ты знаешь 3 аккорда');
  assert.equal(knownTitle(11), 'Ты знаешь 11 аккордов');
  assert.ok(knownMilestone(4));
  assert.equal(knownMilestone(5), null);
});

// ---------- инструменты ----------

test('toolFromParam и bpmFromQuery', () => {
  assert.deepEqual([...TOOL_IDS], ['tuner', 'metronome', 'omc']);
  assert.equal(toolFromParam('omc'), 'omc');
  assert.equal(toolFromParam(undefined), 'tuner');
  assert.equal(toolFromParam('drum'), 'tuner');
  assert.equal(bpmFromQuery('96'), 96);
  assert.equal(bpmFromQuery('5'), undefined);
  assert.equal(bpmFromQuery('abc'), undefined);
});

test('pairRecords: свежие сверху, рекорд сегодня', () => {
  const pairs = {
    'Am|C': { best: 30, last: 30, history: [{ day: '2026-11-10', count: 22 }, { day: '2026-11-14', count: 30 }] },
    'C|G': { best: 25, last: 20, history: [{ day: '2026-11-12', count: 25 }, { day: '2026-11-13', count: 20 }] },
    'F|G': { best: 12, last: 12, history: [{ day: '2026-11-14', count: 12 }] },
    broken: { best: 3 },
  };
  const r = pairRecords(pairs, { today: '2026-11-14' });
  assert.deepEqual(r.map((x) => x.key), ['Am|C', 'F|G', 'C|G']);
  assert.equal(r[0].recordToday, true);
  assert.equal(r[1].recordToday, false, 'первый замер — не рекорд');
  assert.equal(r[2].recordToday, false);
  assert.deepEqual(r[2].counts, [25, 20]);
  assert.equal(r[2].lastDay, '2026-11-13');
  assert.deepEqual(pairRecords(undefined), []);
});

test('sparkline: точки внутри рамки, последняя справа', () => {
  assert.equal(sparkline([]), null);
  const one = sparkline([10], { width: 80, height: 28 });
  assert.equal(one.points.split(' ').length, 2);
  assert.equal(one.last.y, 14);
  const s = sparkline([10, 20, 15], { width: 80, height: 28, pad: 3 });
  assert.equal(s.points, '3,25 40,3 77,14');
  assert.deepEqual(s.last, { x: 77, y: 14 });
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 1, maxLength: 30 }), (vals) => {
      const sp = sparkline(vals, { width: 80, height: 28, pad: 3 });
      return sp.points.split(' ').every((p) => {
        const [x, y] = p.split(',').map(Number);
        return x >= 3 && x <= 77 && y >= 3 && y <= 25;
      });
    }),
  );
});

test('initialPair: query → слабая пара → рекорды → известные → C и Am', () => {
  assert.deepEqual(initialPair({ a: 'am', b: 'F' }), ['Am', 'F']);
  assert.deepEqual(initialPair({ a: 'F#m' }, { known: ['F#m', 'D'] }), ['F#m', 'D']);
  assert.deepEqual(initialPair({ a: 'C', b: 'C' }, { known: ['G', 'D'] }), ['C', 'G']);
  assert.deepEqual(initialPair({}, { weak: [['Am', 'F']], records: [{ a: 'C', b: 'G' }] }), ['Am', 'F']);
  assert.deepEqual(initialPair({}, { records: [{ a: 'C', b: 'G' }] }), ['C', 'G']);
  assert.deepEqual(initialPair({}, { known: ['G', 'D'] }), ['G', 'D']);
  assert.deepEqual(initialPair({ a: '???' }), ['C', 'Am']);
});

test('setPairSlot: совпадение превращается в обмен', () => {
  assert.deepEqual(setPairSlot(['C', 'Am'], 0, 'F'), ['F', 'Am']);
  assert.deepEqual(setPairSlot(['C', 'Am'], 0, 'Am'), ['Am', 'C']);
  assert.deepEqual(setPairSlot(['C', 'Am'], 1, 'C'), ['Am', 'C']);
});

test('pairOptions: известные отдельно, без повторов', () => {
  const o = pairOptions(['Am', 'C', 'Am'], ['Cadd9', 'Xyz']);
  assert.deepEqual(o.known, ['Am', 'C']);
  assert.ok(!o.other.includes('C'));
  assert.ok(o.other.includes('F'));
  assert.ok(o.other.includes('Cadd9'));
  assert.ok(!o.other.includes('Xyz'));
  assert.equal(new Set(o.other).size, o.other.length);
});

// ---------- настройки ----------

test('backupFileName: местная дата', () => {
  assert.equal(backupFileName(new Date(2026, 10, 4, 23, 30)), 'uke-backup-2026-11-04.json');
});

test('parseTime', () => {
  assert.deepEqual(parseTime('19:30'), { hour: 19, minute: 30 });
  assert.deepEqual(parseTime('7:05'), { hour: 7, minute: 5 });
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('12:60'), null);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime(undefined), null);
});

test('versionFromSrc', () => {
  assert.equal(versionFromSrc('https://x.github.io/ukulele/assets/app.js?v=3f9a1c'), '3f9a1c');
  assert.equal(versionFromSrc('assets/app.js?x=1&v=abc#h'), 'abc');
  assert.equal(versionFromSrc('assets/app.js'), null);
  assert.equal(versionFromSrc(null), null);
});

test('importMessage', () => {
  assert.equal(
    importMessage({ added: 3, updated: 1, skipped: 0 }),
    'Готово: 3 новые песни, 1 песня обновлена. Прогресс и настройки — из файла.',
  );
  assert.match(importMessage({ added: 0, updated: 0, skipped: 0 }), /уже были на месте/);
  assert.match(importMessage({ added: 5, updated: 0, skipped: 2 }), /5 новых песен.*Пропущено испорченных записей: 2/);
});

test('storageInfo', () => {
  assert.equal(storageInfo({ available: false, persistent: null }).tone, 'danger');
  assert.equal(storageInfo({ available: true, persistent: true }).tone, 'success');
  const w = storageInfo({ available: true, persistent: null });
  assert.equal(w.tone, 'warn');
  assert.equal(w.canAsk, true);
});

test('weeklyHint, appUrl, lastBackupText', () => {
  assert.equal(weeklyHint(70), '≈ 10 мин в день');
  assert.equal(weeklyHint(0), '≈ 1 мин в день');
  assert.equal(appUrl('https://x.github.io/ukulele/?source=pwa#/settings', '/practice'), 'https://x.github.io/ukulele/#/practice');
  const now = Date.UTC(2026, 10, 14, 12);
  assert.equal(lastBackupText(null, now), 'Копий ещё не было');
  assert.equal(lastBackupText(now - 3600e3, now), 'Последняя копия — сегодня');
  assert.equal(lastBackupText(now - 86400e3, now), 'Последняя копия — вчера');
  assert.equal(lastBackupText(now - 5 * 86400e3, now), 'Последняя копия — 5 дней назад');
});
