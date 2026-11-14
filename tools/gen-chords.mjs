#!/usr/bin/env node
// Генерирует src/data/chords.json из @tombatossals/chords-db (MIT): node tools/gen-chords.mjs
// Лады переводятся в абсолютные, к позициям chords-db добавляются подобранные перебором (лады 0–9, растяжка ≤ 3),
// на аккорд остаётся до 3 самых лёгких по формуле сложности, поверх кладутся учебные аппликатуры из ARCHITECTURE.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('node_modules/@tombatossals/chords-db/lib/ukulele.json', ROOT);
const PKG = new URL('node_modules/@tombatossals/chords-db/package.json', ROOT);
const OUT = new URL('src/data/chords.json', ROOT);
const MAX_POSITIONS = 3;
const TUNING = [67, 60, 64, 69];

// shapes.js импортирует chords.json статически: на чистой копии создаём пустой файл, чтобы импорт сработал.
if (!existsSync(OUT)) {
  mkdirSync(dirname(fileURLToPath(OUT)), { recursive: true });
  writeFileSync(OUT, '{}\n');
}
const { parseChord, chordId, formatChord, QUALITIES, QUALITY_FAMILY } = await import('../src/core/chord.js');
const { makeShape } = await import('../src/core/shapes.js');

/** Суффикс chords-db → качество из chord.js. Остальные суффиксы (alt, 9#11, maj13…) не нужны. */
const SUFFIX_QUALITY = {
  major: 'maj', minor: 'min', dim: 'dim', dim7: 'dim7', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', aug: 'aug',
  6: '6', 69: '69', 7: '7', '7b5': '7b5', aug7: 'aug7', 9: '9', '7b9': '7b9', '7#9': '7#9', 11: '11', 13: '13',
  maj7: 'maj7', maj9: 'maj9', m6: 'm6', m7: 'm7', m7b5: 'm7b5', m9: 'm9', m11: 'm11', mmaj7: 'mmaj7',
  add9: 'add9', madd9: 'madd9',
};

/** Ступени аккорда (полутоны от корня) — для проверки, что аппликатура звучит как надо. */
const TONES = {
  maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], mmaj7: [0, 3, 7, 11],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 2, 4, 7, 9], 9: [0, 2, 4, 7, 10], m9: [0, 2, 3, 7, 10],
  maj9: [0, 2, 4, 7, 11], add9: [0, 2, 4, 7], madd9: [0, 2, 3, 7], 11: [0, 2, 4, 5, 7, 10], m11: [0, 2, 3, 5, 7, 10],
  13: [0, 2, 4, 5, 7, 9, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], aug7: [0, 4, 8, 10], m7b5: [0, 3, 6, 10],
  '7b5': [0, 4, 6, 10], '7b9': [0, 1, 4, 7, 10], '7#9': [0, 3, 4, 7, 10], 5: [0, 7],
};
// Что обязано звучать в подобранной перебором аппликатуре (по умолчанию — все ступени, кроме квинты в 5+ звуках).
const REQUIRED = { 5: [0, 7], '7sus2': [0, 2, 10], 11: [0, 5, 10], 13: [0, 4, 9, 10] };
const required = (q) => REQUIRED[q] ?? TONES[q].filter((t) => TONES[q].length <= 4 || t !== 7).slice(0, 4);

/**
 * Учебные аппликатуры (ARCHITECTURE.md, раздел shapes.js; research/pedagogy.md, research/critic.md).
 * Строка — лады, пальцы берутся из chords-db; объект — свои пальцы, тег или замена.
 */
const OVERRIDES = {
  C: ['0003'], Am: ['2000'], F: ['2010'], G: ['0232'], Dm: ['2210'],
  Em: ['0432', { frets: '0202', tag: 'alt', sub: 'Em7' }],
  E7: ['1202'], A7: ['0100'], D: ['2220'], A: ['2100'],
  // 2020 — D7 без основного тона (A C F# A): так его учат на укулеле, полный D7 — 2223.
  D7: [{ frets: '2020', fingers: '1020', rootless: true }, { frets: '2223', tag: 'alt' }],
  G7: ['0212'], C7: ['0001'], Bb: ['3211'], Gm: ['0231'], Bm: ['4222'], B7: ['2322'], 'F#m': ['2120'],
  E: ['1402', '4442'],
  Cm: ['0333'], Fm: ['1013'], Eb: ['0331'], Ab: ['1343', '5343'],
  'C#m': [{ frets: '1104', fingers: '1204' }],
  Am7: ['0000'], Em7: ['0202'], Dm7: [{ frets: '2213', fingers: '2314' }],
  Fmaj7: [{ frets: '2410', fingers: '2410' }],
};

const encFret = (f) => (f < 0 ? 'x' : f.toString(36));
const decFrets = (s) => [...s].map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
const fretKey = (frets) => frets.map(encFret).join('');

function encode(shape) {
  return [fretKey(shape.frets), shape.fingers.join(''), shape.tag, shape.sub].filter(Boolean).join(' ');
}

function pitchClasses(frets) {
  return frets.flatMap((f, i) => (f < 0 ? [] : [(TUNING[i] + f) % 12]));
}

function fitsChord(frets, root, quality, { needRoot = false } = {}) {
  const allowed = new Set(TONES[quality].map((t) => (root + t) % 12));
  const pcs = pitchClasses(frets);
  return pcs.every((pc) => allowed.has(pc)) && (!needRoot || pcs.includes(root));
}

// --- 1. chords-db → позиции с абсолютными ладами --------------------------------------------------------

const db = JSON.parse(readFileSync(SRC, 'utf8'));
const dbVersion = JSON.parse(readFileSync(PKG, 'utf8')).version;
/** @type {Map<string, Array<{frets: number[], fingers: number[]}>>} */
const fromDb = new Map();
const warnings = [];

for (const [key, list] of Object.entries(db.chords)) {
  const root = parseChord(key).root;
  for (const chord of list) {
    const quality = SUFFIX_QUALITY[chord.suffix];
    if (!quality) continue;
    const id = `${root}:${quality}`;
    const positions = fromDb.get(id) ?? [];
    for (const p of chord.positions) {
      // В chords-db лады при baseFret > 1 записаны относительно baseFret; 0 и -1 остаются как есть.
      const frets = p.frets.map((f) => (f <= 0 ? f : f + p.baseFret - 1));
      const midiOk = frets.every((f, i) => f < 0 || TUNING[i] + f === p.midi[i]);
      if (!midiOk || !fitsChord(frets, root, quality)) {
        warnings.push(`пропущено ${key}${chord.suffix} ${fretKey(frets)}`);
        continue;
      }
      if (!positions.some((q) => fretKey(q.frets) === fretKey(frets))) positions.push({ frets, fingers: p.fingers });
    }
    fromDb.set(id, positions);
  }
}

// --- 2. Перебор для качеств, которых нет в chords-db ---------------------------------------------------

// Простая расстановка пальцев: по возрастанию лада; ≥3 струн на нижнем ладу — баррэ указательным.
function autoFingers(frets) {
  const fingers = [0, 0, 0, 0];
  const fretted = [0, 1, 2, 3].filter((i) => frets[i] > 0).sort((a, b) => frets[a] - frets[b] || a - b);
  if (!fretted.length) return fingers;
  const low = frets[fretted[0]];
  const onLow = fretted.filter((i) => frets[i] === low);
  let next = 1;
  if (onLow.length >= 3) {
    onLow.forEach((i) => { fingers[i] = 1; });
    next = 2;
  }
  for (const i of fretted) if (!fingers[i]) fingers[i] = next++;
  return next - 1 <= 4 ? fingers : null;
}

function searchShapes(root, quality) {
  const found = [];
  const need = required(quality).map((t) => (root + t) % 12);
  for (let n = 0; n < 10 ** 4; n++) {
    const frets = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
    const fretted = frets.filter((f) => f > 0);
    if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) continue;
    if (!fitsChord(frets, root, quality)) continue;
    const pcs = pitchClasses(frets);
    if (!need.every((pc) => pcs.includes(pc))) continue;
    const fingers = autoFingers(frets);
    if (fingers) found.push({ frets, fingers });
  }
  return found;
}

// --- 3. Сборка: сортировка по сложности, учебные аппликатуры поверх -------------------------------------

const byDifficulty = (list) => list
  .map((p, i) => ({ ...p, i, d: makeShape(p.frets, p.fingers).difficulty, top: Math.max(...p.frets) }))
  .sort((a, b) => a.d - b.d || a.top - b.top || a.i - b.i);

/** @type {Map<string, Array<{frets: number[], fingers: number[], tag?: string, sub?: string}>>} */
const result = new Map();
let searched = 0;
for (let root = 0; root < 12; root++) {
  for (const quality of QUALITIES) {
    const id = `${root}:${quality}`;
    // У chords-db мало позиций для sus/add и т. п. — добавляем подобранные перебором; при совпадении ладов
    // остаются пальцы из chords-db.
    const dbList = fromDb.get(id) ?? [];
    if (!dbList.length) searched++;
    const seen = new Set(dbList.map((p) => fretKey(p.frets)));
    const list = [...dbList, ...searchShapes(root, quality).filter((p) => !seen.has(fretKey(p.frets)))];
    result.set(id, byDifficulty(list).slice(0, MAX_POSITIONS + 2).map(({ frets, fingers }) => ({ frets, fingers })));
  }
}

for (const [name, entries] of Object.entries(OVERRIDES)) {
  const chord = parseChord(name);
  const id = chordId(chord);
  const dbList = fromDb.get(id) ?? [];
  const shapes = entries.map((e) => {
    const spec = typeof e === 'string' ? { frets: e } : e;
    const frets = decFrets(spec.frets);
    // Пальцы для замены (Em7 вместо Em) ищем у звучащего аккорда.
    const target = spec.sub ? parseChord(spec.sub) : chord;
    const known = (fromDb.get(chordId(target)) ?? dbList).find((p) => fretKey(p.frets) === spec.frets);
    const fingers = spec.fingers ? [...spec.fingers].map(Number) : known?.fingers;
    if (!fingers) throw new Error(`${name} ${spec.frets}: нет пальцев ни в chords-db, ни в OVERRIDES`);
    if (!fitsChord(frets, target.root, target.quality, { needRoot: !spec.rootless })) {
      throw new Error(`${name} ${spec.frets}: ноты не из аккорда ${spec.sub ?? name}`);
    }
    return { frets, fingers, tag: spec.tag ?? 'beginner', sub: spec.sub };
  });
  const taken = new Set(shapes.map((s) => fretKey(s.frets)));
  const rest = result.get(id).filter((p) => !taken.has(fretKey(p.frets)));
  result.set(id, [...shapes, ...rest]);
}

// Не нашлось ничего (например, Ab5 без заглушённой струны не взять): играем упрощённый аккорд — мажор, минор или 7.
const SIMPLE = { maj: 'maj', min: 'min', dom7: '7' };
for (const [id, list] of result) {
  if (list.length) continue;
  const [root, quality] = id.split(':');
  const simple = SIMPLE[QUALITY_FAMILY[quality]];
  const sub = formatChord({ root: Number(root), quality: simple, bass: null });
  result.set(id, result.get(`${root}:${simple}`).map((p) => ({ ...p, tag: 'alt', sub })));
  warnings.push(`${formatChord({ root: Number(root), quality, bass: null })}: играем как ${sub}`);
}

// --- 4. Запись ---------------------------------------------------------------------------------------

const meta = {
  source: `@tombatossals/chords-db ${dbVersion} (lib/ukulele.json)`,
  license: 'MIT, (c) David Rubert; https://github.com/tombatossals/chords-db',
  generator: 'tools/gen-chords.mjs',
  format: 'ключ "корень:качество" (chord.js); значение — до 3 аппликатур «лады пальцы [тег] [замена]», '
    + 'струны G C E A, абсолютные лады в base36 (a = 10), x — не звучит; [0] — для новичка',
};
const lines = [`"_meta": ${JSON.stringify(meta)}`];
for (const [id, list] of result) {
  if (!list.length) { warnings.push(`нет аппликатуры: ${id}`); continue; }
  lines.push(`${JSON.stringify(id)}: ${JSON.stringify(list.slice(0, MAX_POSITIONS).map(encode))}`);
}
const json = `{\n${lines.join(',\n')}\n}\n`;
JSON.parse(json);
writeFileSync(OUT, json);

const missing = [...result].filter(([, l]) => !l.length).map(([id]) => formatChord({ root: +id.split(':')[0], quality: id.split(':')[1], bass: null }));
console.log(`chords.json: ${result.size - missing.length} аккордов, ${(json.length / 1024).toFixed(1)} КБ; нет в chords-db: ${searched}`);
if (missing.length) console.log(`без аппликатуры: ${missing.join(', ')}`);
if (warnings.length) console.log(`предупреждения (${warnings.length}):\n  ${warnings.join('\n  ')}`);
