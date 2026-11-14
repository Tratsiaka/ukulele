import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutChordDiagram, shapeText, describeChord } from '../../src/ui/chord-layout.js';

const AM = { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0], barre: null, baseFret: 1 };
const BB = { frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], barre: { fret: 1, from: 2, to: 3 }, baseFret: 1 };
const HIGH = { frets: [7, 7, 7, 10], fingers: [1, 1, 1, 4], barre: { fret: 7, from: 0, to: 2 }, baseFret: 7 };
const MUTED = { frets: [-1, 2, 3, 2], fingers: [0, 1, 3, 2], barre: null, baseFret: 1 };

test('Am: порожек, точка на G, три открытые струны', () => {
  const l = layoutChordDiagram(AM);
  assert.ok(l.nut);
  assert.equal(l.position, null);
  assert.equal(l.rows, 4);
  assert.equal(l.dots.length, 1);
  assert.equal(l.dots[0].string, 0);
  assert.equal(l.dots[0].finger, 2);
  assert.equal(l.dots[0].x, l.strings[0].x);
  assert.equal(l.markers.filter((m) => m.kind === 'open').length, 3);
  assert.equal(l.barres.length, 0);
});

test('левша: струны зеркально', () => {
  const r = layoutChordDiagram(AM);
  const l = layoutChordDiagram(AM, { leftHanded: true });
  assert.equal(l.dots[0].x, r.strings[3].x);
  assert.equal(l.width, r.width);
});

test('баррэ не дублируется точками', () => {
  const l = layoutChordDiagram(BB);
  assert.equal(l.barres.length, 1);
  assert.equal(l.barres[0].finger, 1);
  assert.deepEqual(l.dots.map((d) => d.string).sort(), [0, 1]);
});

test('высокая позиция: номер лада, без порожка, 4 ряда', () => {
  const l = layoutChordDiagram(HIGH);
  assert.equal(l.nut, null);
  assert.equal(l.baseFret, 7);
  assert.equal(l.position.text, '7');
  assert.equal(l.rows, 4);
  assert.ok(l.dots.every((d) => d.y > l.gridTop && d.y < l.gridBottom));
  const lefty = layoutChordDiagram(HIGH, { leftHanded: true });
  assert.ok(lefty.position.x > lefty.width / 2);
});

test('baseFret вычисляется, если не задан', () => {
  assert.equal(layoutChordDiagram({ frets: [5, 5, 5, 8] }).baseFret, 5);
  assert.equal(layoutChordDiagram({ frets: [0, 0, 0, 3] }).baseFret, 1);
});

test('подписи струн и заглушённые', () => {
  const l = layoutChordDiagram(MUTED, { labels: true });
  assert.deepEqual(l.labels.map((x) => x.text), ['G', 'C', 'E', 'A']);
  assert.equal(l.markers.find((m) => m.string === 0).kind, 'mute');
  assert.ok(l.height > layoutChordDiagram(MUTED).height);
});

test('shapeText', () => {
  assert.equal(shapeText(AM), '2000');
  assert.equal(shapeText(MUTED), 'x232');
  assert.equal(shapeText(HIGH), '7-7-7-10');
  assert.equal(shapeText(null), '');
});

test('describeChord', () => {
  assert.equal(describeChord('Am', AM), 'Am (2000): G — 2-й лад, средний палец; C, E, A — открытые');
  assert.equal(
    describeChord('B♭', BB),
    'B♭ (3211): баррэ указательным на 1-м ладу; G — 3-й лад, безымянный палец; C — 2-й лад, средний палец',
  );
  assert.match(describeChord('D', MUTED), /G — не звучит$/);
  assert.equal(describeChord('X', null), 'X: аппликатура не найдена');
});
