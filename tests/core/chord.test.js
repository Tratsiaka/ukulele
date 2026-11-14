import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, formatChord, transposeChord, normalizeChordName, isChordToken } from '../../src/core/chord.js';

const n = (s, o) => normalizeChordName(s, o);

test('basic qualities', () => {
  assert.equal(n('C'), 'C'); assert.equal(n('Am'), 'Am'); assert.equal(n('G7'), 'G7');
  assert.equal(n('Fmaj7'), 'Fmaj7'); assert.equal(n('FM7'), 'Fmaj7'); assert.equal(n('Dm7'), 'Dm7');
  assert.equal(n('Csus4'), 'Csus4'); assert.equal(n('Asus'), 'Asus4'); assert.equal(n('Bbm'), 'Bbm');
  assert.equal(n('F#m'), 'F#m'); assert.equal(n('C/G'), 'C/G'); assert.equal(n('Am7-5'), 'Am7b5');
  assert.equal(n('A7+'), 'A7#5'); assert.equal(n('E7/9'), 'E9'); assert.equal(n('Cdim'), 'Cdim');
});

test('cyrillic homoglyphs and unicode accidentals', () => {
  assert.equal(n('Аm'), 'Am'); assert.equal(n('С'), 'C'); assert.equal(n('Е7'), 'E7');
  assert.equal(n('B♭'), 'Bb'); assert.equal(n('F♯m'), 'F#m');
});

test('german notation', () => {
  assert.equal(n('H7'), 'B7'); assert.equal(n('Hm'), 'Bm');
  assert.equal(n('B', { german: true }), 'Bb'); assert.equal(n('B'), 'B');
  assert.equal(formatChord(parseChord('Bb'), { german: true }), 'B');
});

test('not chords', () => {
  for (const s of ['Привет', 'And', 'I', 'x2', 'Am I', 'Car', '', 'Hello']) assert.equal(isChordToken(s), false, s);
});

test('alt in parens', () => {
  const c = parseChord('(E7)'); assert.equal(c.alt, true); assert.equal(formatChord(c), 'E7');
});

test('transpose round trip', () => {
  for (const s of ['C', 'Am', 'F#m7', 'Bb/D', 'Ebmaj7']) {
    const c = parseChord(s);
    for (let k = -11; k <= 11; k++) assert.equal(formatChord(transposeChord(transposeChord(c, k), -k)), formatChord(c));
    assert.equal(formatChord(transposeChord(c, 12)), formatChord(c));
  }
  assert.equal(formatChord(transposeChord(parseChord('E'), -4)), 'C');
  assert.equal(formatChord(transposeChord(parseChord('Am'), 3)), 'Cm');
});
