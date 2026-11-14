// Аппликатуры укулеле (GCEA) и сложность аккорда. Чистый модуль: без DOM, работает в браузере и в node --test.
// Данные — src/data/chords.json (генерирует tools/gen-chords.mjs из @tombatossals/chords-db, MIT).

import CHORDS from '../data/chords.json' with { type: 'json' };
import { parseChord, chordId, formatChord, QUALITIES } from './chord.js';

/**
 * @typedef {{frets: number[], fingers: number[], barre: {fret: number, from: number, to: number}|null,
 *            baseFret: number, tag?: 'beginner'|'alt', sub?: string, difficulty: number}} Shape
 * frets — 4 числа в порядке струн G C E A, абсолютные лады; -1 — не звучит, 0 — открытая.
 * fingers — 0 нет пальца, 1 указательный … 4 мизинец. barre.from/to — индексы струн 0..3.
 * baseFret — первый лад на диаграмме. sub — имя аккорда, который на самом деле звучит, если это замена
 * (у Em есть альтернатива Em7 0202).
 */

/** Строи укулеле: MIDI открытых струн G C E A. */
export const TUNINGS = Object.freeze({
  gcea: Object.freeze({ name: 'GCEA, high-G', midi: Object.freeze([67, 60, 64, 69]) }),
  lowg: Object.freeze({ name: 'GCEA, low-G', midi: Object.freeze([55, 60, 64, 69]) }),
});

/** Порядок словаря: сначала то, что открывает больше песен (PLAN.md, раздел 1), потом остальное. */
export const DICTIONARY_ORDER = Object.freeze([
  'C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A', 'G7', 'C7', 'D7', 'Bb', 'Gm', 'Bm', 'B7', 'F#m', 'E',
  'Cm', 'Fm', 'Eb', 'Ab', 'C#m',
  'B', 'F#', 'C#', 'G#m', 'Ebm', 'Bbm', 'F7', 'Bb7', 'Eb7', 'Ab7', 'C#7', 'F#7',
  'Am7', 'Em7', 'Dm7', 'Bm7', 'Gm7', 'Cm7', 'F#m7',
  'Cmaj7', 'Fmaj7', 'Gmaj7', 'Dmaj7', 'Amaj7',
  'Csus4', 'Dsus4', 'Esus4', 'Gsus4', 'Asus4', 'Csus2', 'Dsus2', 'Gsus2', 'Asus2',
  'C6', 'F6', 'G6', 'A6', 'Cadd9', 'Gadd9',
  'Bdim', 'C#dim', 'Cdim7', 'Caug',
]);

const STRINGS = [0, 1, 2, 3];

// Баррэ: один палец прижимает ≥2 струн на одном ладу, и между крайними нет струн ниже этого лада.
function findBarre(frets, fingers) {
  for (let finger = 1; finger <= 4; finger++) {
    const idx = STRINGS.filter((i) => fingers[i] === finger && frets[i] > 0);
    if (idx.length < 2) continue;
    const fret = frets[idx[0]];
    if (!idx.every((i) => frets[i] === fret)) continue;
    const from = idx[0];
    const to = idx[idx.length - 1];
    let covered = true;
    for (let i = from; i <= to; i++) if (frets[i] < fret) covered = false;
    if (covered) return { fret, from, to };
  }
  return null;
}

function baseFretOf(frets) {
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length || Math.max(...fretted) <= 4) return 1;
  return Math.min(...fretted);
}

/**
 * Сложность аппликатуры: пальцы + 2·баррэ + 1, если не первая позиция, + max(0, разброс ладов − 1).
 * @param {{frets: number[], fingers: number[], barre: object|null, baseFret: number}} shape
 * @returns {number}
 */
export function shapeDifficulty(shape) {
  const fretted = shape.frets.filter((f) => f > 0);
  const fingers = new Set(shape.fingers.filter((x) => x > 0)).size || fretted.length;
  const spread = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  return fingers + (shape.barre ? 2 : 0) + (shape.baseFret > 1 ? 1 : 0) + Math.max(0, spread - 1);
}

/**
 * Собирает Shape из ладов и пальцев: считает баррэ, первый лад диаграммы и сложность.
 * @param {number[]} frets
 * @param {number[]} fingers
 * @param {{tag?: 'beginner'|'alt', sub?: string}} [extra]
 * @returns {Shape}
 */
export function makeShape(frets, fingers, extra = {}) {
  const shape = { frets: [...frets], fingers: [...fingers], barre: findBarre(frets, fingers), baseFret: baseFretOf(frets) };
  if (extra.tag) shape.tag = extra.tag;
  if (extra.sub) shape.sub = extra.sub;
  shape.difficulty = shapeDifficulty(shape);
  return shape;
}

/**
 * Разбирает запись аппликатуры из chords.json: «лады пальцы [тег] [замена]», например «2020 1020 beginner».
 * Лад — символ base36 (a = 10 …), x — струна не звучит.
 * @param {string} code
 * @returns {Shape}
 */
export function decodeShape(code) {
  const [f, p, tag, sub] = code.split(' ');
  const frets = [...f].map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
  const fingers = [...p].map(Number);
  return makeShape(frets, fingers, { tag, sub });
}

function deepFreeze(shape) {
  Object.freeze(shape.frets);
  Object.freeze(shape.fingers);
  if (shape.barre) Object.freeze(shape.barre);
  return Object.freeze(shape);
}

const cache = new Map();

function toChord(nameOrChord) {
  if (typeof nameOrChord === 'string') return parseChord(nameOrChord);
  if (nameOrChord && Number.isInteger(nameOrChord.root) && nameOrChord.quality) return nameOrChord;
  return null;
}

/**
 * Аппликатуры аккорда; [0] — рекомендуемая для новичка. Бас слэш-аккорда игнорируется.
 * @param {string|import('./chord.js').Chord} nameOrChord
 * @returns {readonly Shape[]} неизвестный аккорд → []
 */
export function getShapes(nameOrChord) {
  const chord = toChord(nameOrChord);
  if (!chord) return [];
  const id = chordId(chord);
  if (!cache.has(id)) {
    const codes = Object.hasOwn(CHORDS, id) && id !== '_meta' ? CHORDS[id] : [];
    cache.set(id, Object.freeze(codes.map((c) => deepFreeze(decodeShape(c)))));
  }
  return cache.get(id);
}

/**
 * Рекомендуемая аппликатура или null.
 * @param {string|import('./chord.js').Chord} nameOrChord
 * @returns {Shape|null}
 */
export function getShape(nameOrChord) {
  return getShapes(nameOrChord)[0] ?? null;
}

/**
 * Сложность аккорда по рекомендуемой аппликатуре. Ориентир: Am7 0; Am, C, A7 1; F, A 2; G, Dm, E7 3; Bb, E ≥ 5.
 * @param {string|import('./chord.js').Chord} nameOrChord
 * @returns {number} Infinity, если аппликатуры нет
 */
export function chordDifficulty(nameOrChord) {
  return getShape(nameOrChord)?.difficulty ?? Infinity;
}

/**
 * MIDI-ноты струн G C E A для аппликатуры; null — струна не звучит.
 * @param {{frets: number[]}} shape
 * @param {'gcea'|'lowg'} [tuningId]
 * @returns {(number|null)[]}
 */
export function shapeMidi(shape, tuningId = 'gcea') {
  const tuning = TUNINGS[tuningId] ?? TUNINGS.gcea;
  return shape.frets.map((f, i) => (f < 0 ? null : tuning.midi[i] + f));
}

let allNames = null;

/**
 * Все аккорды с аппликатурами: сначала DICTIONARY_ORDER, затем остальные по качеству и корню.
 * @returns {readonly string[]}
 */
export function listChordNames() {
  if (allNames) return allNames;
  const names = new Set(DICTIONARY_ORDER.filter((n) => getShapes(n).length));
  const ids = Object.keys(CHORDS).filter((k) => k !== '_meta' && CHORDS[k].length);
  const qIndex = (q) => QUALITIES.indexOf(q);
  ids
    .map((id) => { const [root, quality] = id.split(':'); return { root: Number(root), quality }; })
    .sort((a, b) => qIndex(a.quality) - qIndex(b.quality) || a.root - b.root)
    .forEach((c) => names.add(formatChord({ ...c, bass: null })));
  allNames = Object.freeze([...names]);
  return allNames;
}
