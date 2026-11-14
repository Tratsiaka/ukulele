// Каноническая модель аккорда и нотация. Чистый модуль: без DOM, работает в браузере и в node --test.

/** @typedef {{root:number, quality:string, bass:number|null, raw:string, alt?:boolean}} Chord */

export const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Как обычно пишут корень, если тональность неизвестна.
const DEFAULT_MAJ = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEFAULT_MIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

/** Качество → суффикс для показа. */
export const QUALITY_SUFFIX = {
  maj: '', min: 'm', '7': '7', m7: 'm7', maj7: 'maj7', mmaj7: 'mmaj7', '6': '6', m6: 'm6', '69': '6/9',
  '9': '9', m9: 'm9', maj9: 'maj9', add9: 'add9', madd9: 'madd9', '11': '11', m11: 'm11', '13': '13',
  sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', '7sus2': '7sus2', dim: 'dim', dim7: 'dim7', aug: 'aug', aug7: '7#5',
  m7b5: 'm7b5', '7b5': '7b5', '7b9': '7b9', '7#9': '7#9', '5': '5',
};
export const QUALITIES = Object.keys(QUALITY_SUFFIX);

/** Семейство качества — для масок «играбельно» и упрощения. */
export const QUALITY_FAMILY = {
  maj: 'maj', '6': 'maj', '69': 'maj', maj7: 'maj', maj9: 'maj', add9: 'maj', sus2: 'maj', sus4: 'maj', '5': 'maj', aug: 'maj',
  min: 'min', m7: 'min', m6: 'min', m9: 'min', m11: 'min', madd9: 'min', mmaj7: 'min', m7b5: 'min', dim: 'min', dim7: 'min',
  '7': 'dom7', '9': 'dom7', '11': 'dom7', '13': 'dom7', '7sus4': 'dom7', '7sus2': 'dom7', aug7: 'dom7', '7b5': 'dom7', '7b9': 'dom7', '7#9': 'dom7',
};

// Суффикс (как написан на сайтах, в т. ч. русская запись) → качество. Сравнение без учёта регистра,
// кроме ведущих «M»/«m» — их разбираем отдельно.
const SUFFIX = new Map(Object.entries({
  '': 'maj', maj: 'maj', major: 'maj', M: 'maj',
  m: 'min', min: 'min', mi: 'min', '-': 'min', minor: 'min',
  '7': '7', dom7: '7', '7+': 'aug7', '+7': 'aug7', aug7: 'aug7', '7#5': 'aug7', '7+5': 'aug7', '7/5+': 'aug7',
  m7: 'm7', min7: 'm7', mi7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7', ma7: 'maj7', j7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', '7M': 'maj7', 'maj7+': 'maj7',
  mmaj7: 'mmaj7', 'm(maj7)': 'mmaj7', mM7: 'mmaj7', 'm7+': 'mmaj7', minmaj7: 'mmaj7',
  '6': '6', maj6: '6', m6: 'm6', min6: 'm6', '6/9': '69', '69': '69', '6add9': '69',
  '9': '9', m9: 'm9', min9: 'm9', maj9: 'maj9', M9: 'maj9',
  add9: 'add9', add2: 'add9', '(9)': 'add9', '(add9)': 'add9', madd9: 'madd9', 'm(add9)': 'madd9', 'm(9)': 'madd9',
  '11': '11', m11: 'm11', '13': '13', '7/9': '9', '7(9)': '9', '7/6': '13', '7(13)': '13',
  sus2: 'sus2', '2': 'sus2', sus4: 'sus4', sus: 'sus4', '4': 'sus4', '7sus4': '7sus4', '7sus': '7sus4', '7/4': '7sus4', '7sus2': '7sus2',
  dim: 'dim', o: 'dim', '°': 'dim', mb5: 'dim', 'm-5': 'dim', 'm/5-': 'dim', dim7: 'dim7', o7: 'dim7', '°7': 'dim7',
  aug: 'aug', '+': 'aug', '#5': 'aug', '+5': 'aug', '5+': 'aug', '(#5)': 'aug',
  m7b5: 'm7b5', 'm7-5': 'm7b5', 'm7/5-': 'm7b5', 'm7(b5)': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7(5-)': 'm7b5',
  '7b5': '7b5', '7-5': '7b5', '7/5-': '7b5', '7(b5)': '7b5', '7(5-)': '7b5',
  '7b9': '7b9', '7-9': '7b9', '7#9': '7#9', '7+9': '7#9', '5': '5',
}));

// Кириллические буквы, похожие на латинские (А В С Е Н, иногда м и Д/Г не встречаются в аккордах).
const HOMOGLYPHS = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'а': 'a', 'с': 'c', 'е': 'e', 'м': 'm', 'М': 'M', 'о': 'o', 'Д': 'D' };

/** NFC, кириллические двойники → латиница, ♯ ♭ → # b, длинные тире → дефис, без пробелов по краям. Пробелы внутри сохраняются. */
export function normalizeChordText(str) {
  let s = String(str ?? '').normalize('NFC').trim();
  s = s.replace(/[АВСЕНасемМоД]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
  return s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[–—−]/g, '-');
}

function letterPc(letter, accidental, german) {
  let pc = LETTER_PC[letter];
  if (letter === 'B' && german) pc = 10; // немецкая нотация: B = си-бемоль, H = си
  if (accidental === '#') pc += 1;
  else if (accidental === 'b') pc -= 1;
  return (pc + 12) % 12;
}

function suffixQuality(suffix) {
  if (SUFFIX.has(suffix)) return SUFFIX.get(suffix);
  const lower = suffix.toLowerCase();
  // «M» в начале — мажор (M7, Maj7), «m» — минор: регистр важен только для первой буквы.
  if (suffix.startsWith('M') && SUFFIX.has('maj' + lower.slice(1))) return SUFFIX.get('maj' + lower.slice(1));
  if (SUFFIX.has(lower) && !/^m/i.test(suffix)) return SUFFIX.get(lower);
  if (suffix.startsWith('m') && SUFFIX.has('m' + lower.slice(1))) return SUFFIX.get('m' + lower.slice(1));
  return null;
}

/**
 * Разбирает обозначение аккорда. Возвращает null, если это не аккорд.
 * @param {string} str
 * @param {{german?: boolean}} [opts] german: B = Bb (если в песне встречается H).
 * @returns {Chord|null}
 */
export function parseChord(str, opts = {}) {
  let s = normalizeChordText(str);
  if (!s || /\s/.test(s)) return null;
  let alt = false;
  const paren = /^\((.+)\)$/.exec(s); // (E7) — альтернативный аккорд
  if (paren) { s = paren[1]; alt = true; }
  s = s.replace(/[*!]+$/, '');
  const m = /^([A-H])([#b]?)(.*?)(?:\/([A-H])([#b]?))?$/.exec(s);
  if (!m) return null;
  const [, letter, acc, rawSuffix, bassLetter, bassAcc] = m;
  // «Hb» в немецкой нотации — это Bb; «Hm» — си минор.
  const german = !!opts.german;
  const quality = suffixQuality(rawSuffix);
  if (quality == null) return null;
  const chord = {
    root: letterPc(letter, acc, german),
    quality,
    bass: bassLetter ? letterPc(bassLetter, bassAcc, german) : null,
    raw: String(str ?? '').trim(),
  };
  if (alt) chord.alt = true;
  return chord;
}

/** Строка целиком — обозначение аккорда? */
export function isChordToken(str, opts) {
  return parseChord(str, opts) != null;
}

/** Предпочитать бемоли в тональности с тоникой rootPc. */
export function preferFlatsForKey(rootPc, isMinor) {
  const majFlat = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
  const minFlat = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm
  return isMinor ? minFlat.has(rootPc) : majFlat.has(rootPc);
}

/** Название ноты по классу высоты. preferFlats: true/false или undefined (по умолчанию для этого класса). */
export function noteName(pc, preferFlats, minorContext = false) {
  const p = ((pc % 12) + 12) % 12;
  if (preferFlats === true) return FLAT[p];
  if (preferFlats === false) return SHARP[p];
  return (minorContext ? DEFAULT_MIN : DEFAULT_MAJ)[p];
}

/**
 * Обозначение аккорда для показа.
 * @param {Chord} chord
 * @param {{preferFlats?: boolean, german?: boolean}} [opts]
 */
export function formatChord(chord, opts = {}) {
  const minor = QUALITY_FAMILY[chord.quality] === 'min';
  let root = noteName(chord.root, opts.preferFlats, minor);
  if (opts.german) root = root === 'B' ? 'H' : root === 'Bb' || root === 'A#' ? 'B' : root;
  let s = root + (QUALITY_SUFFIX[chord.quality] ?? '');
  if (chord.bass != null && chord.bass !== chord.root) {
    let b = noteName(chord.bass, opts.preferFlats);
    if (opts.german) b = b === 'B' ? 'H' : b === 'Bb' || b === 'A#' ? 'B' : b;
    s += '/' + b;
  }
  return s;
}

/** @param {Chord} chord @param {number} semitones */
export function transposeChord(chord, semitones) {
  const t = (pc) => (((pc + semitones) % 12) + 12) % 12;
  return { ...chord, root: t(chord.root), bass: chord.bass == null ? null : t(chord.bass) };
}

/** Ключ для поиска аппликатуры: «root:quality» (бас не учитывается). */
export function chordId(chord) {
  return `${chord.root}:${chord.quality}`;
}

/** Нормализованное имя аккорда (то, что храним в песне): разбор + показ. Не аккорд → null. */
export function normalizeChordName(str, opts = {}) {
  const c = parseChord(str, opts);
  return c ? formatChord(c, { preferFlats: opts.preferFlats }) : null;
}
