// Лист песни: чистые помощники раскладки, «знаком ли аккорд», тональности и автопрокрутки.
// Без DOM: работает в браузере и в node --test (tests/sheet/).

import { guessKey, transposeSong } from '../core/song.js';
import { bestKey, knownMasks, playableAt, simplifyName, songMasks } from '../core/playable.js';
import { plural } from '../lib/format.js';

/** @typedef {import('../core/song.js').Song} Song */
/** @typedef {import('../core/song.js').Segment} Segment */
/** @typedef {import('../core/song.js').Section} Section */
/** @typedef {{chord: string|null, text: string}} WordPart */
/** @typedef {{t: 'w', parts: WordPart[], long: boolean} | {t: 's'}} LyricItem  w — слово (не рвётся), s — пробел */

export const FONT_MIN = 14;
export const FONT_MAX = 32;
export const FONT_STEP = 2;
export const SPEED_MIN = 1;
export const SPEED_MAX = 10;
export const SHIFT_LIMIT = 11;
export const DEFAULT_PREFS = Object.freeze({ transpose: 0, fontSize: 18, speed: 5, simplify: false });

// Слово длиннее — переносим внутри (иначе на 360 px при крупном шрифте вылезет за край).
const LONG_WORD = 16;
const SPACE = Object.freeze({ t: 's' });
const MINUS = '−';

const KIND_LABEL = {
  verse: 'Куплет', chorus: 'Припев', bridge: 'Бридж', intro: 'Вступление', outro: 'Концовка', other: 'Проигрыш',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod12 = (n) => ((Math.round(Number(n) || 0) % 12) + 12) % 12;

/**
 * Настройки показа песни в допустимых пределах (как в record.prefs).
 * @param {Partial<{transpose: number, fontSize: number, speed: number, simplify: boolean}>|null|undefined} prefs
 * @returns {{transpose: number, fontSize: number, speed: number, simplify: boolean}}
 */
export function normalizePrefs(prefs) {
  const p = { ...DEFAULT_PREFS, ...(prefs && typeof prefs === 'object' ? prefs : {}) };
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    transpose: clamp(Math.round(num(p.transpose, 0)), -SHIFT_LIMIT, SHIFT_LIMIT),
    fontSize: clamp(Math.round(num(p.fontSize, DEFAULT_PREFS.fontSize)), FONT_MIN, FONT_MAX),
    speed: clamp(Math.round(num(p.speed, DEFAULT_PREFS.speed)), SPEED_MIN, SPEED_MAX),
    simplify: Boolean(p.simplify),
  };
}

/**
 * Сдвиг для людей: +2, 0, −3 (настоящий минус).
 * @param {number} n
 * @returns {string}
 */
export function formatShift(n) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+${v}`;
  if (v < 0) return `${MINUS}${-v}`;
  return '0';
}

/**
 * Песня для показа: транспонирование и упрощение аккордов. Без изменений — тот же объект (для мемоизации).
 * @param {Song} song
 * @param {{transpose?: number, simplify?: boolean}} [opts]
 * @returns {Song}
 */
export function prepareSong(song, { transpose = 0, simplify = false } = {}) {
  if (!song) return song;
  let out = mod12(transpose) === 0 ? song : transposeSong(song, transpose);
  if (simplify) {
    if (out === song) out = structuredClone(song);
    for (const s of out.sections ?? []) {
      for (const l of s.lines ?? []) {
        if (l.type === 'lyrics') for (const g of l.segments) { if (g.chord) g.chord = simplifyName(g.chord); }
        else if (l.type === 'chords') l.chords = l.chords.map(simplifyName);
      }
    }
  }
  return out;
}

/**
 * Строка текста → слова и пробелы для переноса. Слово — неразрывная группа кусков «аккорд + слог»:
 * «Su[G]sanna» не разорвётся между «Su» и «sanna». Аккорд без текста (или над пробелом) получает свой кусок
 * с пустым текстом — так он занимает место по ширине и не наезжает на соседа.
 * @param {Segment[]} segments
 * @returns {LyricItem[]}
 */
export function lyricWords(segments) {
  /** @type {LyricItem[]} */
  const items = [];
  /** @type {{t: 'w', parts: WordPart[], long: boolean}|null} */
  let cur = null;
  const word = () => (cur ??= { t: 'w', parts: [], long: false });
  const push = (chord, text) => {
    const w = word();
    const last = w.parts[w.parts.length - 1];
    if (!chord && last && !last.chord) last.text += text;
    else w.parts.push({ chord: chord ?? null, text });
  };
  const space = () => {
    if (cur) {
      items.push(cur);
      cur = null;
    }
    if (items.length && items[items.length - 1].t !== 's') items.push(SPACE);
  };

  for (const seg of segments ?? []) {
    let chord = seg?.chord || null;
    const runs = String(seg?.text ?? '').split(/(\s+)/u).filter((r) => r !== '');
    if (!runs.length) {
      if (chord) push(chord, '');
      continue;
    }
    for (const run of runs) {
      if (/^\s/u.test(run)) {
        if (chord) push(chord, '');
        chord = null;
        space();
      } else {
        push(chord, run);
        chord = null;
      }
    }
  }
  if (cur) items.push(cur);
  while (items.length && items[items.length - 1].t === 's') items.pop();
  for (const it of items) {
    if (it.t === 'w') it.long = it.parts.reduce((n, p) => n + p.text.length, 0) > LONG_WORD;
  }
  return items;
}

/**
 * Есть ли в строке аккорды.
 * @param {Segment[]} segments
 */
export function hasChords(segments) {
  return (segments ?? []).some((s) => s?.chord);
}

/**
 * Текст строки без аккордов.
 * @param {Segment[]} segments
 */
export function lineText(segments) {
  return (segments ?? []).map((s) => s?.text ?? '').join('');
}

/**
 * Подпись секции. fallback — подставить название по виду, если подписи нет (для режима «только структура»).
 * @param {Section} section
 * @param {boolean} [fallback]
 * @returns {string|null}
 */
export function sectionLabel(section, fallback = false) {
  const label = String(section?.label ?? '').trim();
  if (label) return label;
  if (section?.kind === 'chorus') return KIND_LABEL.chorus;
  return fallback ? KIND_LABEL[section?.kind] ?? null : null;
}

/**
 * Аккорды секции по строкам для режима «только структура»; одинаковые строки подряд сливаются (×N).
 * @param {Section} section
 * @returns {{chords: string[], times: number}[]}
 */
export function structureRows(section) {
  const rows = [];
  for (const l of section?.lines ?? []) {
    let chords = null;
    if (l.type === 'lyrics') chords = l.segments.filter((g) => g.chord).map((g) => g.chord);
    else if (l.type === 'chords') chords = [...l.chords];
    if (!chords?.length) continue;
    const prev = rows[rows.length - 1];
    if (prev && prev.chords.length === chords.length && prev.chords.every((c, i) => c === chords[i])) prev.times += 1;
    else rows.push({ chords, times: 1 });
  }
  return rows;
}

/**
 * Проверка «знаешь ли аккорд»: точное имя или играбельно известным по правилам playable.js
 * (Am7 → Am, C7 → C, E → E7). known не задан — null (показывать нейтрально).
 * @param {Iterable<string>|null|undefined} known
 * @returns {((name: string) => boolean)|null}
 */
export function knownTester(known) {
  if (!known) return null;
  const list = [...known];
  const set = new Set(list);
  const masks = knownMasks(list);
  const cache = new Map();
  return (name) => {
    if (!name || set.has(name)) return true;
    if (!cache.has(name)) cache.set(name, playableAt(songMasks([name]), masks, 0));
    return cache.get(name);
  };
}

/** Мини-песня из списка аккордов — чтобы пользоваться guessKey/transposeSong. */
function chordsSong(names, key) {
  return { title: '', artist: '', ...(key ? { key } : {}), sections: [{ label: null, kind: 'other', lines: [{ type: 'chords', chords: [...names] }] }] };
}

/**
 * Аккорды, транспонированные на shift, с правильными знаками для получившейся тональности.
 * @param {string[]} names
 * @param {number} shift
 * @returns {string[]}
 */
export function transposeNames(names, shift) {
  if (!names?.length || mod12(shift) === 0) return [...(names ?? [])];
  return transposeSong(chordsSong(names), shift).sections[0].lines[0].chords;
}

/**
 * Название тональности после сдвига: keyNameAt(['Am', 'Dm', 'E7'], 3) → 'Cm'.
 * @param {string[]} names
 * @param {number} shift
 * @param {string} [key] известная тональность песни
 * @returns {string}
 */
export function keyNameAt(names, shift, key) {
  const k = key || guessKey(chordsSong(names)).name;
  if (mod12(shift) === 0) return k;
  return transposeSong(chordsSong(names, k), shift).key ?? k;
}

/**
 * Совет для баннера тональности.
 * null — песня уже играбельна в текущей тональности (или в ней нет аккордов);
 * {kind: 'easy', shift, key} — в тональности key (сдвиг shift от исходной) все аккорды знакомы;
 * {kind: 'missing', missing, better?} — чего не хватает сейчас; better — сдвиг, где не хватает меньшего.
 * @param {string[]} chords аккорды песни (исходные)
 * @param {Iterable<string>} knownNames
 * @param {number} [transpose] текущее транспонирование
 * @param {{key?: string}} [opts]
 * @returns {null | {kind: 'easy', shift: number, key: string}
 *   | {kind: 'missing', missing: string[], better?: {shift: number, key: string, missing: string[]}}}
 */
export function keyAdvice(chords, knownNames, transpose = 0, { key } = {}) {
  const names = (chords ?? []).filter(Boolean);
  if (!names.length) return null;
  const known = [...(knownNames ?? [])];
  const here = bestKey(transposeNames(names, transpose), known, { maxShift: 0 });
  if (here.playable) return null;
  const best = bestKey(names, known);
  if (best.playable) return { kind: 'easy', shift: best.shift, key: keyNameAt(names, best.shift, key) };
  /** @type {{kind: 'missing', missing: string[], better?: {shift: number, key: string, missing: string[]}}} */
  const out = { kind: 'missing', missing: here.missing };
  if (mod12(best.shift) !== mod12(transpose) && best.missing.length < here.missing.length) {
    out.better = { shift: best.shift, key: keyNameAt(names, best.shift, key), missing: best.missing };
  }
  return out;
}

// ---------- автопрокрутка ----------

/**
 * Скорость автопрокрутки в px/s: при шрифте 18 px — 6 + 5·speed (11…56 px/s), крупнее шрифт — быстрее.
 * factor — доля темпа (0.6 в тренировке «на 60 %»).
 * @param {number} speed 1–10
 * @param {{fontSize?: number, factor?: number}} [opts]
 * @returns {number}
 */
export function autoscrollSpeed(speed, { fontSize = 18, factor = 1 } = {}) {
  const s = clamp(Number(speed) || DEFAULT_PREFS.speed, SPEED_MIN, SPEED_MAX);
  const scale = clamp(Number(fontSize) || 18, 10, 48) / 18;
  const f = clamp(Number(factor) || 1, 0.1, 3);
  return (6 + s * 5) * scale * f;
}

/**
 * Следующая желаемая позиция прокрутки (дробная). Если реальная позиция ушла дальше slack от той, что мы
 * просили в прошлый раз (человек прокрутил сам), отсчёт идёт от реальной.
 * @param {number|null} wanted прошлая желаемая позиция (null — начать с реальной)
 * @param {number} actual реальная позиция сейчас
 * @param {number} pxPerSec
 * @param {number} dtMs прошедшее время; больше 100 мс (вкладка спала) считается за 100 мс
 * @param {number} [slack]
 * @returns {number}
 */
export function nextScrollPos(wanted, actual, pxPerSec, dtMs, slack = 2) {
  const base = wanted == null || Math.abs(actual - wanted) > slack ? actual : wanted;
  const dt = clamp(Number(dtMs) || 0, 0, 100);
  return base + (Math.max(0, pxPerSec) * dt) / 1000;
}

/**
 * Дошли ли до конца.
 * @param {number} pos прокрутка сверху
 * @param {number} viewport высота окна или контейнера
 * @param {number} total полная высота содержимого
 * @param {number} [slack]
 */
export function isAtEnd(pos, viewport, total, slack = 2) {
  return pos + viewport >= total - slack;
}

/**
 * Подпись числа игр: «Первая игра — записал», «Записал. Уже 3 раза».
 * @param {number} plays
 */
export function playsMessage(plays) {
  const n = Math.max(0, Math.round(Number(plays) || 0));
  if (n <= 1) return 'Первая игра этой песни — записал';
  return `Записал. Уже ${n} ${plural(n, ['раз', 'раза', 'раз'])}`;
}
