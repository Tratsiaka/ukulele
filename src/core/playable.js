// «Играбельно моими аккордами», лёгкая тональность, рекомендация следующего аккорда и сложность песни.
// Чистый модуль: без DOM. Аккорды упрощаются по лестнице (PLAN.md, раздел 4) и сводятся к трём 12-битным маскам
// по корням: мажоры, миноры, септаккорды.

import { parseChord, formatChord, normalizeChordText, QUALITY_FAMILY } from './chord.js';
import { chordDifficulty, DICTIONARY_ORDER } from './shapes.js';

/** @typedef {{maj: number, min: number, dom7: number}} Masks */

const FULL = 0xfff;
// Мажор E и B можно сыграть как E7 и B7 (они намного проще).
const SEVENTH_FOR_MAJOR = (1 << 4) | (1 << 11);
const DEFAULT_MAX_SHIFT = 5;
// Пороги звёзд сложности песни: score ≤ 2 — одна звезда, > 5 — пять.
const STAR_STEPS = [2, 3, 4, 5];

/** Качество после упрощения: мажор, минор, 7, dim или dim7. */
function simpleQuality(quality) {
  const family = QUALITY_FAMILY[quality];
  if (family === 'maj') return 'maj';
  if (family === 'dom7') return '7';
  if (quality === 'dim' || quality === 'm7b5') return 'dim';
  if (quality === 'dim7') return 'dim7';
  return 'min';
}

// Как написан корень: Db остаётся Db, C# — C#.
function accidentalPreference(name) {
  const m = /^[A-H]([#b])/.exec(normalizeChordText(name));
  return m ? m[1] === 'b' : undefined;
}

const nameOf = (root, quality, preferFlats) => formatChord({ root, quality, bass: null }, { preferFlats });

/**
 * Упрощает аккорд по лестнице: maj7/6/6/9/sus2/sus4/add9/5/aug → мажор; 9/11/13/7sus4/7b9… → 7;
 * m7/m6/m9/madd9/mmaj7 → m; m7b5 → dim; бас отбрасывается. Не аккорд — строка без изменений.
 * @param {string} name
 * @returns {string}
 */
export function simplifyName(name) {
  const chord = parseChord(name);
  if (!chord) return String(name ?? '');
  return nameOf(chord.root, simpleQuality(chord.quality), accidentalPreference(name));
}

/**
 * Маски песни по корням после упрощения: бит k — аккорд с корнем k (0 = C).
 * @param {Iterable<string>} names
 * @returns {Masks}
 */
export function songMasks(names) {
  const masks = { maj: 0, min: 0, dom7: 0 };
  for (const name of names ?? []) {
    const chord = parseChord(name);
    if (chord) masks[QUALITY_FAMILY[chord.quality]] |= 1 << chord.root;
  }
  return masks;
}

/**
 * Маски известных аккордов — так же, как у песни.
 * @param {Iterable<string>} names
 * @returns {Masks}
 */
export function knownMasks(names) {
  return songMasks(names);
}

/** Циклический сдвиг 12-битной маски на k полутонов вверх. */
function rotate(mask, k) {
  const s = ((k % 12) + 12) % 12;
  return ((mask << s) | (mask >>> (12 - s))) & FULL;
}

/** Что из известного закрывает мажор и септаккорд: 7 играется как мажор, E и B — через E7 и B7. */
function coverage(known) {
  return { maj: known.maj | (known.dom7 & SEVENTH_FOR_MAJOR), min: known.min, dom7: known.dom7 | known.maj };
}

/**
 * Играбельна ли песня, если транспонировать её на shift полутонов.
 * @param {Masks} songMask
 * @param {Masks} knownMask
 * @param {number} shift
 * @returns {boolean}
 */
export function playableAt(songMask, knownMask, shift) {
  const cover = coverage(knownMask);
  return (rotate(songMask.maj, shift) & ~cover.maj) === 0
    && (rotate(songMask.min, shift) & ~cover.min) === 0
    && (rotate(songMask.dom7, shift) & ~cover.dom7) === 0;
}

function playableWithin(songMask, knownMask, maxShift) {
  for (let k = -maxShift; k <= maxShift; k++) if (playableAt(songMask, knownMask, k)) return true;
  return false;
}

/** Сдвиги по возрастанию |shift|: 0, 1, −1, 2, −2, … */
function shiftOrder(maxShift) {
  const order = [0];
  for (let k = 1; k <= maxShift; k++) order.push(k, -k);
  return order;
}

/** Уникальные аккорды песни после упрощения (по корню и качеству), в порядке появления. */
function simpleChords(names) {
  const out = new Map();
  for (const name of names ?? []) {
    const chord = parseChord(name);
    if (!chord) continue;
    const quality = simpleQuality(chord.quality);
    const key = `${chord.root}:${quality}`;
    if (!out.has(key)) out.set(key, { root: chord.root, quality, family: QUALITY_FAMILY[chord.quality] });
  }
  return [...out.values()];
}

const finite = (d) => (Number.isFinite(d) ? d : 10);

// Чем играть аккорд при этом наборе: само имя, замена (C7 → C, E → E7) или null, если не хватает.
function playedName(root, quality, family, known) {
  const bit = 1 << root;
  if (family === 'maj') {
    if (known.maj & bit) return nameOf(root, 'maj');
    return known.dom7 & bit & SEVENTH_FOR_MAJOR ? nameOf(root, '7') : null;
  }
  if (family === 'dom7') {
    if (known.dom7 & bit) return nameOf(root, '7');
    return known.maj & bit ? nameOf(root, 'maj') : null;
  }
  return known.min & bit ? nameOf(root, quality) : null;
}

function evaluateShift(chords, known, shift) {
  const missing = new Map();
  let cost = 0;
  for (const { root, quality, family } of chords) {
    const r = (((root + shift) % 12) + 12) % 12;
    const played = playedName(r, quality, family, known);
    const name = nameOf(r, quality);
    cost += finite(chordDifficulty(played ?? name));
    if (!played && !missing.has(`${r}:${family}`)) missing.set(`${r}:${family}`, name);
  }
  // Если не хватает и C, и C7 — достаточно выучить C.
  for (const key of [...missing.keys()]) {
    const [r, family] = key.split(':');
    if (family === 'dom7' && missing.has(`${r}:maj`)) missing.delete(key);
  }
  return { missing: [...missing.values()], cost };
}

/**
 * Лучшая тональность в пределах ±maxShift: меньше незнакомых аккордов; при равенстве — меньший |shift|,
 * затем меньшая суммарная сложность. missing — упрощённые имена после сдвига. Песня без аккордов не играбельна.
 * @param {string[]} names аккорды песни
 * @param {string[]} knownNames известные аккорды
 * @param {{maxShift?: number}} [opts]
 * @returns {{shift: number, missing: string[], playable: boolean}} shift — на сколько полутонов транспонировать
 */
export function bestKey(names, knownNames, { maxShift = DEFAULT_MAX_SHIFT } = {}) {
  const chords = simpleChords(names);
  const known = knownMasks(knownNames);
  let best = null;
  for (const shift of shiftOrder(Math.max(0, Math.floor(maxShift)))) {
    const r = evaluateShift(chords, known, shift);
    const better = !best || r.missing.length < best.missing.length
      || (r.missing.length === best.missing.length && Math.abs(shift) === Math.abs(best.shift) && r.cost < best.cost);
    if (better) best = { shift, ...r };
  }
  return { shift: best.shift, missing: best.missing, playable: chords.length > 0 && best.missing.length === 0 };
}

/**
 * Сколько песен станут играбельны (со сдвигом в пределах ±5), если выучить ещё один аккорд. Уже известные
 * кандидаты и повторы после упрощения пропускаются. По убыванию прироста; при равенстве — порядок кандидатов.
 * @param {string[][]} songChordLists аккорды каждой песни
 * @param {string[]} knownNames
 * @param {readonly string[]} [candidates]
 * @returns {Array<{chord: string, gain: number}>}
 */
export function nextChordGains(songChordLists, knownNames, candidates = DICTIONARY_ORDER) {
  const known = knownMasks(knownNames);
  const locked = songChordLists
    .map(songMasks)
    .filter((m) => (m.maj | m.min | m.dom7) && !playableWithin(m, known, DEFAULT_MAX_SHIFT));
  const seen = new Set();
  const gains = [];
  for (const name of candidates) {
    const chord = parseChord(name);
    if (!chord) continue;
    const family = QUALITY_FAMILY[chord.quality];
    const bit = 1 << chord.root;
    const key = `${family}:${chord.root}`;
    if (known[family] & bit || seen.has(key)) continue;
    seen.add(key);
    const next = { ...known, [family]: known[family] | bit };
    gains.push({ chord: name, gain: locked.filter((m) => playableWithin(m, next, DEFAULT_MAX_SHIFT)).length });
  }
  return gains.sort((a, b) => b.gain - a.gain);
}

// Сложность с учётом подстановок, которые приложение и так предлагает: C9 → C7 или C, E → E7.
function effectiveDifficulty(chord) {
  const quality = simpleQuality(chord.quality);
  const options = [chord, { ...chord, quality }];
  if (quality === '7') options.push({ ...chord, quality: 'maj' });
  if (quality === 'maj' && (1 << chord.root) & SEVENTH_FOR_MAJOR) options.push({ ...chord, quality: '7' });
  return finite(Math.min(...options.map((c) => chordDifficulty(c))));
}

function chordsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'аккорд';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'аккорда';
  return 'аккордов';
}

/**
 * Сложность песни: 0.45·самый трудный аккорд + 0.25·средняя сложность по вхождениям + 0.4·(разных аккордов − 4)
 * + 0.5 за темп > 120. Узкое место — «Bb; 6 аккордов».
 * @param {string[]} names аккорды песни (с повторами — тогда средняя взвешена по вхождениям)
 * @param {{bpm?: number}} [opts]
 * @returns {{stars: number, score: number, bottleneck: string}}
 */
export function songDifficulty(names, { bpm } = {}) {
  const chords = (names ?? []).map((n) => parseChord(n)).filter(Boolean);
  if (!chords.length) return { stars: 1, score: 0, bottleneck: '' };
  const diffs = chords.map(effectiveDifficulty);
  const max = Math.max(...diffs);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const unique = new Set(chords.map((c) => `${c.root}:${c.quality}`)).size;
  const fast = bpm > 120;
  const score = Math.round((0.45 * max + 0.25 * mean + 0.4 * Math.max(0, unique - 4) + (fast ? 0.5 : 0)) * 100) / 100;
  const stars = 1 + STAR_STEPS.filter((t) => score > t).length;
  const hardest = chords[diffs.indexOf(max)];
  const parts = [nameOf(hardest.root, hardest.quality, accidentalPreference(hardest.raw)), `${unique} ${chordsWord(unique)}`];
  if (fast) parts.push('быстрый темп');
  return { stars, score, bottleneck: parts.join('; ') };
}
