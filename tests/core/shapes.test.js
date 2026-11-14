import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getShapes, getShape, chordDifficulty, shapeMidi, TUNINGS, DICTIONARY_ORDER, listChordNames, decodeShape,
} from '../../src/core/shapes.js';
import { parseChord, normalizeChordName, QUALITIES, formatChord } from '../../src/core/chord.js';

const CHORDS_URL = new URL('../../src/data/chords.json', import.meta.url);
const fretsOf = (shape) => shape.frets.map((f) => (f < 0 ? 'x' : f.toString(36))).join('');

// Учебные аппликатуры из ARCHITECTURE.md (раздел shapes.js) и research/pedagogy.md.
const BEGINNER = {
  C: '0003', Am: '2000', F: '2010', G: '0232', Dm: '2210', Em: '0432', E7: '1202', A7: '0100', D: '2220', A: '2100',
  D7: '2020', G7: '0212', C7: '0001', Bb: '3211', Gm: '0231', Bm: '4222', B7: '2322', 'F#m': '2120', E: '1402',
  Am7: '0000', Em7: '0202', Cm: '0333', Fm: '1013', Eb: '0331', 'C#m': '1104',
};

test('учебные аппликатуры стоят первыми и помечены beginner', () => {
  for (const [name, frets] of Object.entries(BEGINNER)) {
    const shape = getShape(name);
    assert.ok(shape, name);
    assert.equal(fretsOf(shape), frets, name);
    assert.equal(shape.tag, 'beginner', name);
  }
});

test('альтернативы: D7 2223, Em → Em7 0202, E 4442', () => {
  const d7 = getShapes('D7');
  assert.equal(fretsOf(d7[1]), '2223');
  assert.equal(d7[1].tag, 'alt');
  const em = getShapes('Em');
  assert.equal(fretsOf(em[1]), '0202');
  assert.equal(em[1].tag, 'alt');
  assert.equal(em[1].sub, 'Em7');
  assert.equal(fretsOf(getShape('Em7')), '0202');
  assert.equal(fretsOf(getShapes('E')[1]), '4442');
});

test('у каждого аккорда словаря есть аппликатура, имена нормализованы и без повторов', () => {
  assert.equal(new Set(DICTIONARY_ORDER).size, DICTIONARY_ORDER.length);
  assert.deepEqual(DICTIONARY_ORDER.slice(0, 24), ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A', 'G7', 'C7',
    'D7', 'Bb', 'Gm', 'Bm', 'B7', 'F#m', 'E', 'Cm', 'Fm', 'Eb', 'Ab', 'C#m']);
  for (const name of DICTIONARY_ORDER) {
    assert.equal(normalizeChordName(name), name, name);
    assert.ok(getShapes(name).length > 0, name);
  }
});

test('у каждого корня и каждого качества есть 1–3 аппликатуры', () => {
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      const n = getShapes({ root, quality, bass: null }).length;
      assert.ok(n >= 1 && n <= 3, `${root}:${quality} → ${n}`);
    }
  }
});

// Ступени аккорда для проверки, что лады звучат как надо.
const TONES = {
  maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], mmaj7: [0, 3, 7, 11],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 2, 4, 7, 9], 9: [0, 2, 4, 7, 10], m9: [0, 2, 3, 7, 10],
  maj9: [0, 2, 4, 7, 11], add9: [0, 2, 4, 7], madd9: [0, 2, 3, 7], 11: [0, 2, 4, 5, 7, 10], m11: [0, 2, 3, 5, 7, 10],
  13: [0, 2, 4, 5, 7, 9, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], aug7: [0, 4, 8, 10], m7b5: [0, 3, 6, 10],
  '7b5': [0, 4, 6, 10], '7b9': [0, 1, 4, 7, 10], '7#9': [0, 3, 4, 7, 10], 5: [0, 7],
};

test('все аппликатуры в chords.json звучат нотами своего аккорда (или замены из sub)', () => {
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      for (const shape of getShapes({ root, quality, bass: null })) {
        const target = shape.sub ? parseChord(shape.sub) : { root, quality };
        const allowed = new Set(TONES[target.quality].map((t) => (target.root + t) % 12));
        const pcs = shapeMidi(shape).filter((m) => m != null).map((m) => m % 12);
        assert.ok(pcs.every((pc) => allowed.has(pc)), `${formatChord({ root, quality, bass: null })} ${fretsOf(shape)}`);
        assert.equal(shape.frets.length, 4);
        assert.equal(shape.fingers.length, 4);
        assert.ok(shape.frets.every((f, i) => (f > 0) === (shape.fingers[i] > 0)), `пальцы ${fretsOf(shape)}`);
      }
    }
  }
});

test('сложность: ориентиры и порядок Am < F < G ≤ Dm < Bb', () => {
  const d = chordDifficulty;
  assert.equal(d('Am7'), 0);
  for (const n of ['Am', 'C', 'A7']) assert.equal(d(n), 1, n);
  for (const n of ['F', 'A', 'D7', 'Em7']) assert.equal(d(n), 2, n);
  for (const n of ['G', 'Dm', 'E7']) assert.equal(d(n), 3, n);
  assert.ok(d('Bb') >= 5 && d('E') >= 5);
  assert.ok(d('Am') < d('F') && d('F') < d('G') && d('G') <= d('Dm') && d('Dm') < d('Bb'));
  assert.ok(d('Em') > d('Em7'));
  assert.equal(d('xyz'), Infinity);
});

test('формула сложности: пальцы + 2·баррэ + позиция + растяжка', () => {
  const bb = getShape('Bb'); // 3211: 3 пальца, баррэ, разброс 2
  assert.deepEqual(bb.barre, { fret: 1, from: 2, to: 3 });
  assert.equal(bb.difficulty, 3 + 2 + 0 + 1);
  const high = decodeShape('7655 3211'); // D на 5-м ладу
  assert.equal(high.baseFret, 5);
  assert.deepEqual(high.barre, { fret: 5, from: 2, to: 3 });
  assert.equal(high.difficulty, 3 + 2 + 1 + 1);
  assert.equal(decodeShape('aaab 1112').frets[3], 11);
  assert.equal(getShape('Bm').barre.fret, 2);
  assert.equal(getShape('C').barre, null);
});

test('getShapes: слэш-бас игнорируется, H = B, неизвестное → []', () => {
  assert.deepEqual(getShapes('C/G'), getShapes('C'));
  assert.deepEqual(getShapes('H7'), getShapes('B7'));
  assert.deepEqual(getShapes('Db'), getShapes('C#'));
  assert.deepEqual(getShapes(parseChord('Am')), getShapes('Am'));
  assert.deepEqual(getShapes('Привет'), []);
  assert.deepEqual(getShapes(''), []);
  assert.deepEqual(getShapes(null), []);
  assert.equal(getShape('nope'), null);
  assert.ok(Object.isFrozen(getShape('C')));
});

test('shapeMidi для high-G и low-G', () => {
  assert.deepEqual(shapeMidi(getShape('C')), [67, 60, 64, 72]);
  assert.deepEqual(shapeMidi(getShape('C'), 'lowg'), [55, 60, 64, 72]);
  assert.deepEqual(shapeMidi({ frets: [-1, 0, 0, 3] }), [null, 60, 64, 72]);
  assert.deepEqual(TUNINGS.gcea.midi, [67, 60, 64, 69]);
  assert.deepEqual(TUNINGS.lowg.midi, [55, 60, 64, 69]);
});

test('listChordNames: сначала словарь, все имена с аппликатурами', () => {
  const names = listChordNames();
  assert.deepEqual(names.slice(0, DICTIONARY_ORDER.length), [...DICTIONARY_ORDER]);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 12 * QUALITIES.length);
  for (const n of names) assert.ok(getShapes(n).length > 0, n);
});

test('chords.json компактный и с источником', () => {
  const raw = readFileSync(CHORDS_URL, 'utf8');
  assert.ok(raw.length <= 40 * 1024, `${raw.length} байт`);
  const data = JSON.parse(raw);
  assert.match(data._meta.source, /chords-db/);
  assert.match(data._meta.license, /MIT/);
});
