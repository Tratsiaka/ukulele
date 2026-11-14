// Геометрия диаграммы аккорда (единицы viewBox) и её текстовые описания. Чистый модуль — проверяется в node --test.
// Струны слева направо: G C E A; для левши — зеркально (A E C G).

const STRING_NAMES = ['G', 'C', 'E', 'A'];
const STR_GAP = 20;
const FRET_GAP = 24;
const PAD_X = 24; // место под номер лада слева (у левши — справа)
const MARK_Y = 9;
const GRID_TOP = 20;
const BOTTOM = 8;
const LABEL_H = 16;
const MAX_ROWS = 6;

/** Радиус точки пальца. */
export const DOT_R = 7.5;

/**
 * @typedef {{frets: number[], fingers?: number[], barre?: {fret: number, from: number, to: number}|null,
 *            baseFret?: number}} ShapeLike
 * @typedef {{width: number, height: number, x0: number, x1: number, gridTop: number, gridBottom: number,
 *   baseFret: number, rows: number, nut: {x: number, y: number, w: number, h: number}|null,
 *   strings: {x: number, string: number}[], fretLines: number[],
 *   markers: {x: number, y: number, kind: 'open'|'mute', string: number}[],
 *   dots: {x: number, y: number, finger: number, string: number}[],
 *   barres: {x1: number, x2: number, y: number, finger: number}[],
 *   position: {x: number, y: number, text: string}|null,
 *   labels: {x: number, y: number, text: string}[]}} ChordLayout
 */

/**
 * Раскладка диаграммы: струны, лады, точки, баррэ, отметки открытых и заглушённых струн.
 * @param {ShapeLike} shape аппликатура (лады абсолютные, -1 — не звучит)
 * @param {{leftHanded?: boolean, minFrets?: number, labels?: boolean}} [opts] labels — подписи струн под сеткой
 * @returns {ChordLayout}
 */
export function layoutChordDiagram(shape, { leftHanded = false, minFrets = 4, labels = false } = {}) {
  const frets = shape.frets;
  const fingers = shape.fingers || [0, 0, 0, 0];
  const fretted = frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  let base = Number(shape.baseFret);
  if (!(base >= 1)) base = maxF <= 4 ? 1 : Math.min(...fretted);
  const rows = Math.min(MAX_ROWS, Math.max(minFrets, maxF - base + 1));
  const width = PAD_X * 2 + STR_GAP * 3;
  const gridBottom = GRID_TOP + rows * FRET_GAP;
  const height = gridBottom + (labels ? LABEL_H + 2 : BOTTOM);

  const xOf = (s) => PAD_X + (leftHanded ? 3 - s : s) * STR_GAP;
  const yOf = (fret) => GRID_TOP + (fret - base + 0.5) * FRET_GAP;
  const inGrid = (fret) => fret >= base && fret < base + rows;

  const barre = shape.barre && inGrid(shape.barre.fret) ? shape.barre : null;
  const bLo = barre ? Math.min(barre.from, barre.to) : -1;
  const bHi = barre ? Math.max(barre.from, barre.to) : -1;
  const barreFinger = barre ? fingers[bLo] || fingers[bHi] || 1 : 0;
  const underBarre = (s, f) => barre && f === barre.fret && s >= bLo && s <= bHi && (!fingers[s] || fingers[s] === barreFinger);

  const strings = [0, 1, 2, 3].map((s) => ({ x: xOf(s), string: s }));
  const fretLines = Array.from({ length: rows + 1 }, (_, k) => GRID_TOP + k * FRET_GAP);
  const markers = [];
  const dots = [];
  frets.forEach((f, s) => {
    if (f < 0) markers.push({ x: xOf(s), y: MARK_Y, kind: 'mute', string: s });
    else if (f === 0) markers.push({ x: xOf(s), y: MARK_Y, kind: 'open', string: s });
    else if (inGrid(f) && !underBarre(s, f)) dots.push({ x: xOf(s), y: yOf(f), finger: fingers[s] || 0, string: s });
  });
  const barres = barre
    ? [{ x1: Math.min(xOf(bLo), xOf(bHi)), x2: Math.max(xOf(bLo), xOf(bHi)), y: yOf(barre.fret), finger: barreFinger }]
    : [];

  const nut = base <= 1 ? { x: PAD_X - 1, y: GRID_TOP - 4, w: STR_GAP * 3 + 2, h: 5 } : null;
  const position = nut ? null : { x: leftHanded ? width - PAD_X / 2 + 2 : PAD_X / 2 - 2, y: yOf(base), text: String(base) };
  const labelList = labels
    ? [0, 1, 2, 3].map((s) => ({ x: xOf(s), y: gridBottom + 2 + LABEL_H / 2, text: STRING_NAMES[s] }))
    : [];

  return {
    width,
    height,
    x0: PAD_X,
    x1: PAD_X + STR_GAP * 3,
    gridTop: GRID_TOP,
    gridBottom,
    baseFret: base,
    rows,
    nut,
    strings,
    fretLines,
    markers,
    dots,
    barres,
    position,
    labels: labelList,
  };
}

/**
 * Текстовая запись аппликатуры G C E A: '2000', 'x232'; если есть лады ≥ 10 — через дефис: '7-7-7-10'.
 * @param {ShapeLike|null|undefined} shape
 * @returns {string}
 */
export function shapeText(shape) {
  if (!shape) return '';
  const parts = shape.frets.map((f) => (f < 0 ? 'x' : String(f)));
  return shape.frets.some((f) => f >= 10) ? parts.join('-') : parts.join('');
}

const FINGER = { 1: 'указательный', 2: 'средний', 3: 'безымянный', 4: 'мизинец' };
const FINGER_BY = { 1: 'указательным', 2: 'средним', 3: 'безымянным', 4: 'мизинцем' };

/**
 * Описание аппликатуры для экранного диктора:
 * 'Am (2000): G — 2-й лад, средний палец; C, E, A — открытые'.
 * @param {string} name имя аккорда, как его показать
 * @param {ShapeLike|null|undefined} shape
 * @returns {string}
 */
export function describeChord(name, shape) {
  if (!shape) return `${name}: аппликатура не найдена`;
  const fingers = shape.fingers || [0, 0, 0, 0];
  const parts = [];
  const barre = shape.barre;
  const bLo = barre ? Math.min(barre.from, barre.to) : -1;
  const bHi = barre ? Math.max(barre.from, barre.to) : -1;
  const barreFinger = barre ? fingers[bLo] || fingers[bHi] || 1 : 0;
  if (barre) parts.push(`баррэ ${FINGER_BY[barreFinger] || 'пальцем'} на ${barre.fret}-м ладу`);

  const open = [];
  const muted = [];
  shape.frets.forEach((f, s) => {
    const str = STRING_NAMES[s];
    if (f < 0) muted.push(str);
    else if (f === 0) open.push(str);
    else if (barre && f === barre.fret && s >= bLo && s <= bHi && (!fingers[s] || fingers[s] === barreFinger)) {
      // струна под баррэ — уже описана
    } else {
      const finger = FINGER[fingers[s]];
      parts.push(`${str} — ${f}-й лад${finger ? `, ${finger} палец` : ''}`);
    }
  });
  if (open.length) parts.push(`${open.join(', ')} — ${open.length > 1 ? 'открытые' : 'открытая'}`);
  if (muted.length) parts.push(`${muted.join(', ')} — ${muted.length > 1 ? 'не звучат' : 'не звучит'}`);
  return `${name} (${shapeText(shape)}): ${parts.join('; ')}`;
}
