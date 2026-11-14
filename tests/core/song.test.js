// Тесты разбора песен. Фикстуры в tests/fixtures/songs — синтетические: народные и традиционные тексты или придуманные строки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import fc from 'fast-check';
import {
  parseSong, parseChordPro, parseChordsOverLyrics, toChordPro, songChords, songPairs, transposeSong, guessKey,
  isChordLine, detectFormat,
} from '../../src/core/song.js';
import { normalizeChordName } from '../../src/core/chord.js';

const FIXTURES = new URL('../fixtures/songs/', import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');
const lyr = (...pairs) => ({ type: 'lyrics', segments: pairs.map(([chord, text]) => ({ chord, text })) });
const allLines = (song) => song.sections.flatMap((s) => s.lines);
const comments = (song) => allLines(song).filter((l) => l.type === 'comment').map((l) => l.text);

// ───────────────────────────── классификатор строк ─────────────────────────────

const CHORD_LINES = [
  'Am', 'C G Am F', 'Am  Dm  E7  Am', '    Am      C', 'Am | C | G | F', '| Am | C | G |', 'Am - C - G', 'Am, C, G.',
  'Am C G x2', 'Am C G (x2)', 'Am | C | G } 4 раза', 'Am C G F 2 раза', 'C G Am F (2 раза)', 'Аm С Е7', 'Нm Н7',
  'H7 Em', 'Hm A D', 'B#m E', 'Am7-5 E7', 'A7+ Dm', '(E7) Am', 'Am (E7)', 'Intro: Am C', 'Вступление: Am Dm',
  'Проигрыш: Am G', 'Chorus: C F G', 'N.C. Am', 'Am ↓↑ C ↓↑', 'C/G Am/E', 'D/F# G', 'Cmaj7 Fmaj7', 'Asus4 A', 'Gsus2',
  'Bb F', 'Eb Ab Bb', 'F#m C#m', 'C♯m B♭', 'Am7 D9 G13', 'Cadd9 G6', 'Edim Faug', 'Am*', 'Am C G F Am C G F', '[Am] [C]',
  'GF Am', 'AmG C', 'Am-C-G', 'Am/Dm', 'х2 Am C', 'Am C |', 'Am, Dm; E7: Am', 'Em7(b5) A7', 'Am C G F ×2', 'C   G   Am   Em',
  'Dm  Gm  A7  Dm', '\tAm\tC', 'Am C G Coda',
];

const TEXT_LINES = [
  '', '   ', 'Ой, мороз, мороз', 'Am мороз', 'Am C G мороз', 'Am Dm мороз E7 Am', 'Hello', 'Am I wrong', 'A day in the life',
  'All you need is love', 'Bad Day', 'I', 'x2', '(x2)', '4 раза', 'Бой: ↓↑↓↑', '↓ ↓↑ ↑↓↑', 'D DU UDU', 'Capo 2',
  'Каподастр на 2 ладу', 'Tempo: 120', 'Key: Am', 'Тональность: Am', 'Am C G and', 'Ла-ла-ла', 'А я иду',
  'В лесу родилась ёлочка', 'Ты и я', 'BAD DEAD', 'Am7sus C', 'Припев:', 'Verse 1', 'N.C.', 'Am7 мама', 'Am Amмороз',
  'Am C G Fine', 'Песня про укулеле', 'Em Am the end', 'C, мой друг, G', 'GFC BAD',
];

test('isChordLine: строки аккордов', () => {
  for (const line of CHORD_LINES) assert.equal(isChordLine(line), true, JSON.stringify(line));
});

test('isChordLine: строки текста и служебные строки', () => {
  for (const line of TEXT_LINES) assert.equal(isChordLine(line), false, JSON.stringify(line));
});

// ───────────────────────────── нормализация аккордов ─────────────────────────────

const NORMALIZE = [
  ['Аm', 'Am'], ['С', 'C'], ['Е7', 'E7'], ['Dm', 'Dm'], ['B#m', 'Cm'], ['B#', 'C'], ['E#', 'F'], ['Cb', 'B'], ['Fb', 'E'],
  ['A#', 'Bb'], ['A#m', 'Bbm'], ['Am7-5', 'Am7b5'], ['A7+', 'A7#5'], ['(E7)', 'E7'], ['E7/9', 'E9'], ['Am,', 'Am'],
  ['C.', 'C'], ['G!', 'G'], ['Am*', 'Am'], ['D/F#', 'D/F#'], ['C/G', 'C/G'], ['Gb', 'F#'], ['Db', 'C#'], ['Abm', 'G#m'],
  ['D#m', 'Ebm'], ['Fmaj7', 'Fmaj7'], ['FM7', 'Fmaj7'], ['Asus', 'Asus4'], ['Csus2', 'Csus2'], ['Bbm', 'Bbm'], ['B♭', 'Bb'],
  ['F♯m', 'F#m'], ['Cdim', 'Cdim'], ['C+', 'Caug'], ['Cm7b5', 'Cm7b5'], ['Cø', 'Cm7b5'], ['G7sus4', 'G7sus4'],
  ['Am(maj7)', 'Ammaj7'], ['C6/9', 'C6/9'], ['Dm6', 'Dm6'], ['E7b9', 'E7b9'], ['Cadd9', 'Cadd9'], ['Em7(b5)', 'Em7b5'],
  ['[Am]', 'Am'], ['Am)', 'Am'], ['(Am', 'Am'], ['Am:', 'Am'], ['Am;', 'Am'], ['Am7', 'Am7'], ['Dm7-5', 'Dm7b5'],
  ['Hm', 'Bm'], ['H7', 'B7'], ['Нm', 'Bm'], ['Hb', 'Bb'], ['B', 'B'], ['«Am»', 'Am'], ['Am…', 'Am'],
];

test('нормализация аккордов в строке аккордов', () => {
  for (const [raw, expected] of NORMALIZE) {
    assert.deepEqual(songChords(parseSong(`${raw} ${raw}`)), [expected], raw);
  }
});

test('несколько аккордов в одном токене', () => {
  const cases = [
    ['GF', ['G', 'F']], ['AmG', ['Am', 'G']], ['Am-C-G', ['Am', 'C', 'G']], ['Am/Dm', ['Am', 'Dm']], ['Am,C,G', ['Am', 'C', 'G']],
    ['BbF', ['Bb', 'F']], ['C7F', ['C7', 'F']], ['Am7Dm', ['Am7', 'Dm']],
  ];
  for (const [raw, expected] of cases) assert.deepEqual(songChords(parseSong(raw)), expected, raw);
});

test('немецкая нотация: H есть — B читаем как Bb для всей песни', () => {
  const s = parseSong('Em  B  H7  Em\nТекст песни');
  assert.equal(s.german, true);
  assert.deepEqual(songChords(s), ['Em', 'Bb', 'B7']);
  const plain = parseSong('Em  B  E7\nТекст песни');
  assert.equal(plain.german, undefined);
  assert.deepEqual(songChords(plain), ['Em', 'B', 'E7']);
  const slash = parseSong('G/H  B\nТекст');
  assert.equal(slash.german, true);
  assert.deepEqual(songChords(slash), ['G/B', 'Bb']);
  const cp = parseSong('[Hm]Раз [B]два [H7]три');
  assert.equal(cp.german, true);
  assert.deepEqual(songChords(cp), ['Bm', 'Bb', 'B7']);
  // склеенное «AH» не включает немецкую нотацию
  assert.equal(parseSong('AH  B').german, undefined);
});

// ───────────────────────────── слияние по колонкам ─────────────────────────────

const MERGE = [
  ['Am      Dm\nОй мороз мороз', [lyr(['Am', 'Ой мороз'], ['Dm', ' мороз'])]],
  ['Am          G\nОй', [lyr(['Am', 'Ой          '], ['G', ''])]],
  ['    Am\nОй мороз', [lyr([null, 'Ой м'], ['Am', 'ороз'])]],
  ['Am\n    Ой', [lyr(['Am', 'Ой'])]],
  ['\tAm\n\tОй мороз', [lyr(['Am', 'Ой мороз'])]],
  ['C\tG\nОй мороз мороз', [lyr(['C', 'Ой мороз'], ['G', ' мороз'])]],
  ['C       G\nОй\tда', [lyr(['C', 'Ой      '], ['G', 'да'])]],
  ['Am  Dm\nморозь', [lyr(['Am', 'моро'], ['Dm', 'зь'])]],
  ['Am C\nG F\nОй мороз', [{ type: 'chords', chords: ['Am', 'C'] }, lyr(['G', 'Ой'], ['F', ' мороз'])]],
  ['Am   C  x2\nОй мороз', [lyr(['Am', 'Ой мо'], ['C', 'роз']), { type: 'comment', text: 'x2' }]],
  ['[ch]Am[/ch]    [ch]C[/ch]\nОй мороз мороз', [lyr(['Am', 'Ой мор'], ['C', 'оз мороз'])]],
  ['H7  Em\nНад моею', [lyr(['B7', 'Над '], ['Em', 'моею'])]],
  ['Аm   С\nУтро', [lyr(['Am', 'Утро '], ['C', ''])]],
  ['Am         C\nКуда ты, мой', [lyr(['Am', 'Куда ты, мо'], ['C', 'й'])]],
  ['  Am  C\n  Ой мороз', [lyr(['Am', 'Ой м'], ['C', 'ороз'])]],
  ['GF\nЛя', [lyr(['G', 'Л'], ['F', 'я'])]],
  ['(E7)  Am\nОй да', [lyr(['E7', 'Ой да '], ['Am', ''])]],
  ['Am, C\nОй мороз', [lyr(['Am', 'Ой м'], ['C', 'ороз'])]],
];

test('слияние строки аккордов со строкой текста по колонкам', () => {
  for (const [text, expected] of MERGE) assert.deepEqual(allLines(parseSong(text)), expected, JSON.stringify(text));
});

test('строка аккордов перед пустой строкой или заголовком остаётся строкой аккордов', () => {
  const s = parseSong('Am C\n\nОй');
  assert.deepEqual(s.sections.map((x) => x.lines), [[{ type: 'chords', chords: ['Am', 'C'] }], [lyr([null, 'Ой'])]]);
  const h = parseSong('Am C\nПрипев:\nG\nОй');
  assert.deepEqual(h.sections, [
    { label: null, kind: 'other', lines: [{ type: 'chords', chords: ['Am', 'C'] }] },
    { label: 'Припев', kind: 'chorus', lines: [lyr(['G', 'Ой'])] },
  ]);
});

test('строка аккордов над «Припев: текст» сливается с текстом после заголовка', () => {
  const s = parseSong('Am        C\nПрипев: Ой мороз');
  assert.deepEqual(s.sections, [{ label: 'Припев', kind: 'chorus', lines: [lyr(['Am', 'Ой'], ['C', ' мороз'])] }]);
});

// ───────────────────────────── секции ─────────────────────────────

const HEADERS = [
  ['Припев:', 'Припев', 'chorus'], ['ПРИПЕВ:', 'Припев', 'chorus'], ['[Chorus]', 'Chorus', 'chorus'], ['Chorus:', 'Chorus', 'chorus'],
  ['[Verse 1]', 'Verse 1', 'verse'], ['Куплет 2:', 'Куплет 2', 'verse'], ['2 куплет:', 'Куплет 2', 'verse'],
  ['2-й куплет', 'Куплет 2', 'verse'], ['(Припев)', 'Припев', 'chorus'], ['Вступление:', 'Вступление', 'intro'],
  ['Intro', 'Intro', 'intro'], ['Проигрыш:', 'Проигрыш', 'other'], ['Бридж:', 'Бридж', 'bridge'], ['[Bridge]', 'Bridge', 'bridge'],
  ['Кода:', 'Кода', 'outro'], ['Outro:', 'Outro', 'outro'], ['[Pre-Chorus]', 'Pre-Chorus', 'other'], ['[Solo]', 'Solo', 'other'],
  ['Куплет II:', 'Куплет II', 'verse'], ['[Hook]', 'Hook', 'chorus'], ['*Припев*', 'Припев', 'chorus'],
  ['[Interlude]', 'Interlude', 'other'], ['Вступ:', 'Вступ', 'intro'], ['Рефрен:', 'Рефрен', 'chorus'], ['[Куплет 1]:', 'Куплет 1', 'verse'],
  ['[Verse 2: Someone]', 'Verse 2', 'verse'], ['[Ukulele riff]', 'Ukulele riff', 'other'], ['  Припев :', 'Припев', 'chorus'],
];

test('заголовки секций по-русски и по-английски', () => {
  for (const [head, label, kind] of HEADERS) {
    const s = parseSong(`${head}\nAm\nОй`);
    assert.equal(s.sections.length, 1, head);
    assert.equal(s.sections[0].label, label, head);
    assert.equal(s.sections[0].kind, kind, head);
    assert.deepEqual(s.sections[0].lines, [lyr(['Am', 'Ой'])], head);
  }
});

test('строки, похожие на заголовки, остаются текстом', () => {
  for (const line of ['Припевочка моя', 'Bridge over troubled water', 'Куплетов много', 'Verse after verse', 'Intro to love']) {
    const s = parseSong(line);
    assert.deepEqual(s.sections, [{ label: null, kind: 'verse', lines: [lyr([null, line])] }], line);
  }
});

test('заголовок с аккордами, повтором или текстом в той же строке', () => {
  assert.deepEqual(parseSong('Вступление: Am C G').sections,
    [{ label: 'Вступление', kind: 'intro', lines: [{ type: 'chords', chords: ['Am', 'C', 'G'] }] }]);
  assert.deepEqual(parseSong('Intro Am G\nОй').sections, [
    { label: 'Intro', kind: 'intro', lines: [{ type: 'chords', chords: ['Am', 'G'] }, lyr([null, 'Ой'])] },
  ]);
  assert.deepEqual(parseSong('Припев x2\nОй').sections, [
    { label: 'Припев', kind: 'chorus', lines: [{ type: 'comment', text: 'x2' }] },
    { label: null, kind: 'verse', lines: [lyr([null, 'Ой'])] },
  ]);
  assert.deepEqual(parseSong('Припев (2 раза)').sections[0].lines, [{ type: 'comment', text: '2 раза' }]);
  assert.deepEqual(parseSong('Припев: Ой мороз').sections, [{ label: 'Припев', kind: 'chorus', lines: [lyr([null, 'Ой мороз'])] }]);
  assert.deepEqual(parseSong('Проигрыш: Am | Dm } 2 раза').sections[0].lines,
    [{ type: 'chords', chords: ['Am', 'Dm'] }, { type: 'comment', text: '2 раза' }]);
});

test('«Припев:» держит пустую строку, «Припев.» и «(Припев)» — ссылки', () => {
  const open = parseSong('Припев:\n\nAm\nОй');
  assert.deepEqual(open.sections, [{ label: 'Припев', kind: 'chorus', lines: [lyr(['Am', 'Ой'])] }]);
  for (const ref of ['Припев.', '(Припев)', 'Припев']) {
    const s = parseSong(`Ой мороз\n\n${ref}\n\nДругой куплет`);
    assert.deepEqual(s.sections, [
      { label: null, kind: 'verse', lines: [lyr([null, 'Ой мороз'])] },
      { label: 'Припев', kind: 'chorus', lines: [] },
      { label: null, kind: 'verse', lines: [lyr([null, 'Другой куплет'])] },
    ], ref);
  }
  const dot = parseSong('Припев.\nДругой куплет');
  assert.deepEqual(dot.sections.map((s) => s.label), ['Припев', null]);
});

test('пустая строка делит текст на секции, без заголовков секции без меток', () => {
  const s = parseSong('Am\nРаз\n\n\nC\nДва\n\nG C');
  assert.deepEqual(s.sections, [
    { label: null, kind: 'verse', lines: [lyr(['Am', 'Раз'])] },
    { label: null, kind: 'verse', lines: [lyr(['C', 'Два'])] },
    { label: null, kind: 'other', lines: [{ type: 'chords', chords: ['G', 'C'] }] },
  ]);
});

// ───────────────────────────── служебные строки ─────────────────────────────

test('бой: song.strum (первая строка боя) и комментарий', () => {
  const cases = [
    ['Бой: ↓↑↓↑', '↓↑↓↑'], ['↓ ↓↑ ↑↓↑', '↓ ↓↑ ↑↓↑'], ['Strumming: D DU UDU', 'D DU UDU'], ['Strum: D-DU-UDU', 'D-DU-UDU'],
    ['Бой — шестёрка', 'шестёрка'], ['Ритм: ↓ ↑', '↓ ↑'], ['Схема боя: ↓↓↑↑↓↑', '↓↓↑↑↓↑'], ['Бой ↓↑↓↑', '↓↑↓↑'],
    ['DDUUDU', 'DDUUDU'], ['Strumming pattern: D-D-U-U-D-U', 'D-D-U-U-D-U'],
  ];
  for (const [line, strum] of cases) {
    const s = parseSong(`${line}\nAm\nОй`);
    assert.equal(s.strum, strum, line);
    assert.deepEqual(comments(s), [line], line);
  }
  assert.equal(parseSong('Бой: ↓↑\nБой: ↓↓↑↑').strum, '↓↑');
  const lyric = parseSong('Бой мой последний');
  assert.equal(lyric.strum, undefined);
  assert.deepEqual(allLines(lyric), [lyr([null, 'Бой мой последний'])]);
});

test('каподастр: song.capo', () => {
  const cases = [
    ['Capo 3', 3], ['Capo: 2', 2], ['Capo III', 3], ['Каподастр на 5 ладу', 5], ['кап. 1', 1], ['Капо IV', 4],
    ['capo on 2nd fret', 2], ['Capo VII', 7], ['(каподастр на 2-м ладу)', 2], ['Аккорды для гитары, capo 4', 4],
  ];
  for (const [line, capo] of cases) {
    const s = parseSong(`${line}\nAm\nОй`);
    assert.equal(s.capo, capo, line);
    assert.deepEqual(comments(s), [line], line);
  }
  for (const line of ['Без каподастра', 'Capo is not needed', 'Капот 3 машины']) assert.equal(parseSong(line).capo, undefined, line);
});

test('тональность и темп из служебных строк', () => {
  assert.equal(parseSong('Тональность: Am').key, 'Am');
  assert.equal(parseSong('Key: F#m').key, 'F#m');
  assert.equal(parseSong('Тональность: Ам').key, 'Am');
  assert.equal(parseSong('Тональность: Hm\nH7\nТекст').key, 'Bm');
  assert.equal(parseSong('Темп: 120').bpm, 120);
  assert.equal(parseSong('Tempo 96').bpm, 96);
  assert.equal(parseSong('100 BPM').bpm, 100);
  assert.equal(parseSong('Темп: 5').bpm, undefined);
});

test('повторы — комментарии', () => {
  const cases = [
    ['x2', 'x2'], ['х2', 'х2'], ['}x2', 'x2'], ['} x2', 'x2'], ['(x2)', 'x2'], ['2x', '2x'], ['4 раза', '4 раза'],
    ['(2 раза)', '2 раза'], ['Повторить 2 раза', 'Повторить 2 раза'], ['×3', '×3'], ['Повтор припева', 'Повтор припева'],
  ];
  for (const [line, text] of cases) {
    assert.deepEqual(allLines(parseSong(`Am\nОй\n${line}`)), [lyr(['Am', 'Ой']), { type: 'comment', text }], line);
  }
});

// ───────────────────────────── табулатуры ─────────────────────────────

const UKE_TAB = ['A|--0--3--|', 'E|--------|', 'C|--------|', 'G|--------|'];
const GUITAR_TAB = ['e|-----0---|', 'B|---1-----|', 'G|-2-------|', 'D|---------|', 'A|---------|', 'E|---------|'];

test('табы: 6-струнные прячем, 4-струнные укулеле оставляем', () => {
  assert.deepEqual(allLines(parseSong(GUITAR_TAB.join('\n'))), []);
  assert.deepEqual(allLines(parseSong(UKE_TAB.join('\n'))), [{ type: 'tab', lines: UKE_TAB }]);
  assert.deepEqual(allLines(parseSong([...UKE_TAB, ...UKE_TAB].join('\n'))), [{ type: 'tab', lines: UKE_TAB }, { type: 'tab', lines: UKE_TAB }]);
  assert.deepEqual(allLines(parseSong('e|---0---|\nB|-1-----|')), []);
  assert.deepEqual(allLines(parseSong('A|---0---|\nE|-1-----|')), [{ type: 'tab', lines: ['A|---0---|', 'E|-1-----|'] }]);
  assert.deepEqual(allLines(parseSong('A----0----3--\nE-------------\nC-------------\nG-------------')).map((l) => l.type), ['tab']);
  // всё, что не таб, остаётся
  const mixed = parseSong(['Am', 'Ой', ...GUITAR_TAB, 'C', 'Да'].join('\n'));
  assert.deepEqual(allLines(mixed), [lyr(['Am', 'Ой']), lyr(['C', 'Да'])]);
  assert.deepEqual(allLines(parseSong('C | - - - |\nОй')), [lyr(['C', 'Ой'])], 'доли в схеме аккордов — не таб');
});

// ───────────────────────────── форматы ─────────────────────────────

test('определение формата', () => {
  assert.equal(detectFormat('{title: X}\nТекст'), 'chordpro');
  assert.equal(detectFormat('Ой [Am]мороз'), 'chordpro');
  assert.equal(detectFormat('[Verse 1]\n[ch]Am[/ch]\nText'), 'ug');
  assert.equal(detectFormat('[tab]A|---|[/tab]'), 'ug');
  assert.equal(detectFormat('[Verse 1]\nAm\nText'), 'plain');
  assert.equal(detectFormat('Am  C\nОй мороз'), 'plain');
  assert.equal(detectFormat('} x2'), 'plain');
});

test('Ultimate Guitar: [ch], [tab], [Verse 1], гитарный таб прячется', () => {
  const s = parseSong(fixture('drunken-sailor.ug.txt'));
  assert.deepEqual(s.sections.map((x) => [x.label, x.kind]), [
    ['Intro', 'intro'], ['Verse 1', 'verse'], ['Chorus', 'chorus'], ['Solo', 'other'], ['Ukulele riff', 'other'],
  ]);
  assert.deepEqual(s.sections[0].lines, [{ type: 'chords', chords: ['Am', 'G', 'Am'] }]);
  assert.deepEqual(s.sections[1].lines[2], lyr(['G', 'Early in th'], ['Em', 'e morni'], ['Am', 'ng!']));
  assert.deepEqual(s.sections[3].lines, []);
  assert.deepEqual(s.sections[4].lines, [{ type: 'tab', lines: UKE_TAB }]);
  assert.deepEqual(songChords(s), ['Am', 'G', 'Em']);
});

test('«аккорды над строками» в стиле amdm: вступление, секции, бой, капо, повторы', () => {
  const s = parseSong(fixture('oy-moroz.amdm.txt'), { title: 'Ой, мороз, мороз', artist: 'народная' });
  assert.equal(s.title, 'Ой, мороз, мороз');
  assert.equal(s.artist, 'народная');
  assert.equal(s.capo, 2);
  assert.equal(s.strum, '↓ ↓↑ ↑↓↑');
  assert.deepEqual(s.sections.map((x) => [x.label, x.kind]), [
    [null, 'other'], ['Вступление', 'intro'], ['Куплет 1', 'verse'], ['Припев', 'chorus'], ['Куплет 2', 'verse'],
    ['Припев', 'chorus'], ['Проигрыш', 'other'],
  ]);
  assert.deepEqual(s.sections[2].lines, [
    lyr(['Am', 'Ой, мороз, мороз, '], ['Dm', 'не морозь меня,']),
    lyr(['E7', 'Не морозь меня, моего кон'], ['Am', 'я.']),
  ]);
  assert.deepEqual(s.sections[3].lines, [
    lyr([null, 'Ой, да т'], ['C', 'ы калину'], ['G', 'шка']),
    { type: 'chords', chords: ['Am', 'Dm', 'E7', 'Am'] },
    { type: 'comment', text: 'x2' },
  ]);
  assert.deepEqual(s.sections[4].lines[0], lyr(['Am', 'Я вернусь домой '], ['Dm', 'на закате дня,']));
  assert.deepEqual(s.sections[5].lines, []);
  assert.deepEqual(s.sections[6].lines, [{ type: 'chords', chords: ['Am', 'Dm', 'E7', 'Am'] }, { type: 'comment', text: '2 раза' }]);
  assert.deepEqual(songChords(s), ['Am', 'Dm', 'E7', 'C', 'G']);
  assert.equal(guessKey(s).name, 'Am');
});

test('«аккорды над строками» в стиле akkords: несколько аккордов в строке, бой словом', () => {
  const s = parseSong(fixture('vo-pole-bereza.akkords.txt'));
  assert.equal(s.strum, 'шестёрка');
  assert.deepEqual(s.sections[1].lines[2],
    lyr(['Am', 'Люли, лю'], ['Dm', 'ли, стояла'], ['E7', ', люли, '], ['Am', 'люли, стояла.']));
  assert.deepEqual(s.sections.find((x) => x.kind === 'chorus').lines, [{ type: 'chords', chords: ['F#m', 'Bm', 'F#m', 'Bm', 'Ab', 'A'] }]);
  assert.deepEqual(songChords(s), ['Am', 'Dm', 'E7', 'F#m', 'Bm', 'Ab', 'A']);
});

test('«аккорды над строками» в стиле mychords: H, кириллические буквы в аккордах', () => {
  const s = parseSong(fixture('chernyi-voron.mychords.txt'));
  assert.equal(s.german, true);
  assert.equal(s.key, 'Em');
  assert.deepEqual(songChords(s), ['Em', 'Am', 'B7', 'C', 'Bm', 'Bb']);
  assert.deepEqual(s.sections[1].lines[1], lyr(['B7', 'Над моею голов'], ['Em', 'ой?']));
  assert.equal(guessKey(s).name, 'Em');
});

test('придуманная песня: гомоглифы, B#m, Am7-5, (E7), склеенные аккорды, бой D/U, темп', () => {
  const s = parseSong(fixture('invented.mychords.txt'));
  assert.equal(s.strum, 'D DU UDU');
  assert.equal(s.bpm, 96);
  assert.deepEqual(s.sections[1].lines, [
    lyr(['Am', 'Утром я беру'], ['C', ' укулеле,']),
    lyr(['F', 'Струны тихо по'], ['G7', 'ют.']),
    lyr(['Dm7', 'Мы с тобо'], ['Am7b5', 'й давно '], ['E7', 'не пели,']),
    lyr(['Cm', 'Песни сами'], ['E7', ' нас з'], ['Am', 'овут.']),
  ]);
  assert.equal(s.sections[2].label, 'Припев');
  assert.deepEqual(s.sections[2].lines[0], lyr(['G', 'Л'], ['F', 'я-ля-ля'], ['Am', ', '], ['G', 'ля-ля,']));
});

test('ChordPro: директивы, блоки, комментарии, табы, x_strum', () => {
  const s = parseSong(fixture('red-river-valley.chordpro'));
  assert.equal(s.title, 'Red River Valley');
  assert.equal(s.artist, 'Traditional');
  assert.equal(s.key, 'C');
  assert.equal(s.bpm, 96);
  assert.equal(s.strum, 'du');
  assert.deepEqual(s.sections.map((x) => [x.label, x.kind, x.lines.length]), [
    ['Verse 1', 'verse', 2], [null, 'chorus', 3], [null, 'other', 1], [null, 'chorus', 0], [null, 'other', 1], [null, 'bridge', 1],
  ]);
  assert.deepEqual(s.sections[0].lines[0], lyr([null, 'From this '], ['C', 'valley they say you are '], ['G7', 'going,']));
  assert.deepEqual(s.sections[1].lines[1], { type: 'empty' });
  assert.deepEqual(s.sections[2].lines, [{ type: 'comment', text: 'Repeat chorus' }]);
  assert.deepEqual(s.sections[4].lines, [{ type: 'tab', lines: UKE_TAB }]);
  assert.deepEqual(s.sections[5].lines, [{ type: 'chords', chords: ['Am', 'F', 'C', 'G'] }]);
  assert.ok(!comments(s).some((c) => c.includes('ChordPro')), '# — комментарий ChordPro, не показываем');
});

test('ChordPro: короткие и длинные имена директив', () => {
  const s = parseChordPro([
    '{t: Песня}', '{st: Автор}', '{capo: 3}', '{tempo: 120.5}', '{key: Ам}', '{x_german: true}', '{unknown: x}',
    '{start_of_chorus: Припев}', '[Am]Ой', '{end_of_chorus}',
    '{start_of_verse label="Куплет 2"}', '[C]Да', '{eov}',
    '{sob}', '[G]Мост', '{eob}',
    '{ci: курсив}', '{comment_italic: тоже}', '{chorus: Припев}',
    '{meta: artist Другой}',
  ].join('\n'));
  assert.equal(s.title, 'Песня');
  assert.equal(s.artist, 'Другой');
  assert.equal(s.capo, 3);
  assert.equal(s.bpm, 121);
  assert.equal(s.key, 'Am');
  assert.equal(s.german, true);
  assert.deepEqual(s.sections.map((x) => [x.label, x.kind]), [
    ['Припев', 'chorus'], ['Куплет 2', 'verse'], [null, 'bridge'], [null, 'other'], ['Припев', 'chorus'],
  ]);
  assert.deepEqual(s.sections[3].lines, [{ type: 'comment', text: 'курсив' }, { type: 'comment', text: 'тоже' }]);
});

test('ChordPro: директива важнее строки в тексте, x_strum важнее «Бой:»', () => {
  const s = parseSong('{capo: 1}\n{x_strum: island}\n{comment: Capo 4}\n{c: Бой: ↓↑}\n[Am]Ой');
  assert.equal(s.capo, 1);
  assert.equal(s.strum, 'island');
  const late = parseSong('{c: Бой: ↓↑}\n[Am]Ой\n{x_strum: du}');
  assert.equal(late.strum, 'du');
});

test('ChordPro: строки без скобок разбираются как «аккорды над строками»', () => {
  const s = parseChordPro('{title: Смесь}\nПрипев:\nAm      Dm\nОй мороз мороз');
  assert.deepEqual(s.sections, [{ label: 'Припев', kind: 'chorus', lines: [lyr(['Am', 'Ой мороз'], ['Dm', ' мороз'])] }]);
});

test('ChordPro: квадратные скобки без аккорда — это текст', () => {
  assert.deepEqual(allLines(parseSong('[Am]Ой [x2] да [C]нет')), [lyr(['Am', 'Ой [x2] да '], ['C', 'нет'])]);
  assert.deepEqual(allLines(parseSong('[Am]   [C]')), [{ type: 'chords', chords: ['Am', 'C'] }]);
  assert.deepEqual(allLines(parseSong('  [Am]  Ой  ')), [lyr(['Am', 'Ой'])]);
});

test('parseChordsOverLyrics и parseChordPro доступны напрямую', () => {
  assert.deepEqual(allLines(parseChordsOverLyrics('[ch]Am[/ch]\nОй')), [lyr(['Am', 'Ой'])]);
  assert.deepEqual(allLines(parseChordPro('[Am]Ой')), [lyr(['Am', 'Ой'])]);
  assert.deepEqual(parseSong(''), { title: '', artist: '', sections: [] });
  assert.deepEqual(parseSong(null), { title: '', artist: '', sections: [] });
});

// ───────────────────────────── toChordPro ─────────────────────────────

test('toChordPro: ожидаемый текст', () => {
  const s = parseSong('Capo 2\n\nПрипев:\nAm   C\nОй да\nx2\n\nAm\nРаз', { title: 'Тест', artist: 'Я' });
  assert.equal(toChordPro(s), [
    '{title: Тест}', '{artist: Я}', '{capo: 2}', '',
    '{comment: Capo 2}', '',
    '{start_of_chorus: Припев}', '[Am]Ой да[C]', '{comment: x2}', '{end_of_chorus}', '',
    '[Am]Раз', '',
  ].join('\n'));
});

test('toChordPro → parseSong: та же модель для всех фикстур', () => {
  for (const name of readdirSync(FIXTURES)) {
    const s = parseSong(fixture(name), { title: name });
    const cp = toChordPro(s);
    assert.deepEqual(parseSong(cp), s, name);
    assert.equal(toChordPro(parseSong(cp)), cp, name);
  }
});

test('toChordPro: текст, похожий на директиву или комментарий, не теряется', () => {
  const s = parseSong('Am\n#1 хит\n\n{не директива}\n{x}');
  assert.deepEqual(parseSong(toChordPro(s)), s);
  assert.deepEqual(allLines(s).slice(1).map((l) => l.segments[0].text), ['{не директива}', '{x}']);
});

// ───────────────────────────── аккорды, пары, тональность ─────────────────────────────

test('songChords — уникальные в порядке появления', () => {
  assert.deepEqual(songChords(parseSong('Am C\nОй\nG Am C F')), ['Am', 'C', 'G', 'F']);
  assert.deepEqual(songChords(parseSong('Просто текст')), []);
});

test('songPairs — смены между разными аккордами без учёта порядка', () => {
  const s = parseSong('[Am]Раз [C]два [Am]три [C]четыре [C]пять [G]шесть\n\n[G]семь [Am]восемь');
  assert.deepEqual(songPairs(s), [
    { a: 'Am', b: 'C', count: 3 }, { a: 'C', b: 'G', count: 1 }, { a: 'G', b: 'Am', count: 1 },
  ]);
  assert.deepEqual(songPairs(parseSong('[Am]Раз [Am]два')), []);
});

test('guessKey', () => {
  const key = (text) => guessKey(parseSong(text)).name;
  assert.equal(key('Am Dm E7 Am'), 'Am');
  assert.equal(key('C F G C'), 'C');
  assert.equal(key('G D Em C G'), 'G');
  assert.equal(key('Em Am H7 Em'), 'Em');
  assert.equal(key('Dm Gm A7 Dm'), 'Dm');
  assert.equal(key('F Bb C F'), 'F');
  assert.equal(key('E A B7 E'), 'E');
  assert.equal(key('C#m F#m G#7 C#m'), 'C#m');
  assert.equal(key('{key: Dm}\n[C]Ой [F]да'), 'Dm');
  assert.deepEqual(guessKey(parseSong('Текст')), { root: 0, minor: false, name: 'C' });
  assert.deepEqual(guessKey(parseSong('Am Dm E7 Am')), { root: 9, minor: true, name: 'Am' });
});

test('transposeSong: знаки по тональности, ключ, не меняет исходник', () => {
  const am = parseSong('{key: Am}\n[Am]Ой [Dm]мороз [E7]мороз [Am]да');
  const cm = transposeSong(am, 3);
  assert.equal(cm.key, 'Cm');
  assert.deepEqual(songChords(cm), ['Cm', 'Fm', 'G7']);
  assert.deepEqual(songChords(am), ['Am', 'Dm', 'E7'], 'исходник не меняется');
  const c = parseSong('C F G Am C');
  assert.deepEqual(songChords(transposeSong(c, 4)), ['E', 'A', 'B', 'C#m']);
  assert.deepEqual(songChords(transposeSong(c, -4)), ['Ab', 'Db', 'Eb', 'Fm']);
  assert.deepEqual(songChords(transposeSong(c, 1)), ['Db', 'Gb', 'Ab', 'Bbm']);
  assert.deepEqual(songChords(transposeSong(c, 1, { preferFlats: false })), ['C#', 'F#', 'G#', 'A#m']);
  assert.deepEqual(songChords(transposeSong(c, 2)), ['D', 'G', 'A', 'Bm']);
  assert.deepEqual(songChords(transposeSong(parseSong('C Bb F C'), 2)), ['D', 'C', 'G']);
  assert.deepEqual(songChords(transposeSong(parseSong('E A B7 G#m E'), 7)), ['B', 'E', 'F#7', 'D#m']);
  assert.deepEqual(songChords(transposeSong(parseSong('C/E G'), 5)), ['F/A', 'C']);
  assert.deepEqual(transposeSong(am, 12), am);
  assert.deepEqual(transposeSong(am, 0), am);
  assert.notEqual(transposeSong(am, 0), am);
});

// ───────────────────────────── свойства ─────────────────────────────

const CHORD_POOL = ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'Bb', 'F#m', 'C/G', 'Gsus4', 'Hm', 'H7', 'B', 'Cmaj7',
  'Am7-5', '(E7)', 'Аm', 'С', 'Eb', 'C#m', 'G#', 'Db7', 'Ab'];
const WORDS = ['ой', 'мороз', 'не', 'морозь', 'меня', 'коня', 'ворон', 'берёза', 'стояла', 'люли', 'and', 'the', 'river',
  'valley', 'sailor', 'да', 'Я', 'ты', 'укулеле', 'ля-ля', 'snow,', 'день.', 'ночь!', 'what?'];
const SERVICE = new Set(['вступление', 'вступ', 'проигрыш', 'припев', 'куплет', 'бридж', 'кода', 'соло', 'концовка', 'интро',
  'аутро', 'раз', 'раза', 'повтор', 'повторить']);

const spaces = fc.integer({ min: 1, max: 6 }).map((n) => ' '.repeat(n));
const chordLineArb = fc.tuple(spaces, fc.array(fc.tuple(fc.constantFrom(...CHORD_POOL), spaces), { minLength: 1, maxLength: 6 }))
  .map(([lead, items]) => (lead.length > 3 ? '' : lead) + items.map(([c, sp]) => c + sp).join('').trimEnd());
const lyricLineArb = fc.array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 7 }).map((ws) => ws.join(' '))
  .filter((l) => !isChordLine(l));
const blockArb = fc.oneof(
  { weight: 5, arbitrary: fc.tuple(chordLineArb, lyricLineArb).map(([c, l]) => `${c}\n${l}`) },
  { weight: 2, arbitrary: lyricLineArb },
  { weight: 2, arbitrary: chordLineArb },
  { weight: 2, arbitrary: fc.constant('') },
  {
    weight: 2,
    arbitrary: fc.constantFrom('Припев:', 'Куплет 2:', '[Verse 1]', '[Chorus]', 'Припев.', '(Припев)', 'Вступление: Am C G',
      'Проигрыш:', 'Intro', 'Припев x2', '[Solo]'),
  },
  { weight: 1, arbitrary: fc.constantFrom('x2', '} 2 раза', 'Бой: ↓↑↓↑', 'Capo 3', 'Тональность: Am', 'Strumming: D DU UDU', 'Темп: 90') },
  { weight: 1, arbitrary: fc.constantFrom(UKE_TAB.join('\n'), GUITAR_TAB.join('\n'), 'A|--0--|--3--|\nE|--1--|-----|') },
);
const songTextArb = fc.array(blockArb, { minLength: 1, maxLength: 14 }).map((bs) => bs.join('\n'));

const chordProArb = fc.array(fc.oneof(
  fc.tuple(fc.constantFrom(...WORDS), fc.constantFrom(...CHORD_POOL), fc.constantFrom(...WORDS))
    .map(([a, c, b]) => `${a} [${c}]${b}`),
  fc.constantFrom('{soc}', '{eoc}', '{start_of_verse: Куплет}', '{end_of_verse}', '{c: x2}', '{chorus}', '', '{sob}', '{eob}',
    '{title: Песня}', '{key: Am}', '{x_strum: island}', '{start_of_intro}', '{end_of_intro}', '{start_of_part: Соло}'),
), { minLength: 1, maxLength: 16 }).map((ls) => ls.join('\n'));

const mapChords = (song, f) => ({
  ...song,
  ...(song.key ? { key: f(song.key) } : {}),
  sections: song.sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => (l.type === 'lyrics'
      ? { ...l, segments: l.segments.map((g) => ({ ...g, chord: g.chord && f(g.chord) })) }
      : l.type === 'chords' ? { ...l, chords: l.chords.map(f) } : l)),
  })),
});

test('свойство: строка с русским словом из 3+ букв (не служебным) — никогда не строка аккордов', () => {
  const cyrWord = fc.string({ unit: fc.constantFrom(...'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАВСЕНМОД'), minLength: 3, maxLength: 9 })
    .filter((w) => !SERVICE.has(w.toLowerCase()));
  const glue = fc.constantFrom('', ',', '.', '!', '(', ')', ':', '-', '…');
  fc.assert(fc.property(
    fc.array(fc.constantFrom(...CHORD_POOL, '|', 'x2', '-', '↓↑', '(x2)', 'N.C.'), { maxLength: 8 }),
    cyrWord, glue, glue, fc.nat(), spaces,
    (tokens, word, pre, post, pos, sp) => {
      const items = [...tokens];
      items.splice(pos % (items.length + 1), 0, pre + word + post);
      return isChordLine(items.join(sp)) === false;
    },
  ), { numRuns: 1000 });
});

test('свойство: строка только из аккордов — строка аккордов', () => {
  fc.assert(fc.property(chordLineArb, (line) => isChordLine(line)), { numRuns: 500 });
});

test('свойство: parseSong(toChordPro(s)) ≡ s', () => {
  fc.assert(fc.property(songTextArb, (text) => {
    const s = parseSong(text);
    assert.deepEqual(parseSong(toChordPro(s)), s);
  }), { numRuns: 400 });
  fc.assert(fc.property(chordProArb, (text) => {
    const s = parseSong(text);
    assert.deepEqual(parseSong(toChordPro(s)), s);
  }), { numRuns: 400 });
});

test('свойство: transposeSong(k), затем (−k) возвращает те же аккорды', () => {
  fc.assert(fc.property(songTextArb, fc.integer({ min: -11, max: 11 }), (text, k) => {
    const s = parseSong(text);
    const back = transposeSong(transposeSong(s, k), -k);
    assert.deepEqual(mapChords(back, (n) => normalizeChordName(n) ?? n), s);
  }), { numRuns: 300 });
});

test('свойство: transposeSong на 12 и 0 — тождество', () => {
  fc.assert(fc.property(songTextArb, fc.constantFrom(0, 12, -12, 24), (text, k) => {
    const s = parseSong(text);
    assert.deepEqual(transposeSong(s, k), s);
  }), { numRuns: 200 });
  fc.assert(fc.property(songTextArb, fc.boolean(), (text, flats) => {
    const s = parseSong(text);
    const t = transposeSong(s, 12, { preferFlats: flats });
    assert.deepEqual(mapChords(t, (n) => normalizeChordName(n) ?? n), s);
  }), { numRuns: 200 });
});

test('свойство: songChords ⊆ нормализованные имена, songPairs без пар из одинаковых аккордов', () => {
  fc.assert(fc.property(songTextArb, (text) => {
    const s = parseSong(text);
    for (const c of songChords(s)) assert.equal(normalizeChordName(c), c);
    for (const p of songPairs(s)) assert.notEqual(p.a, p.b);
  }), { numRuns: 300 });
});
