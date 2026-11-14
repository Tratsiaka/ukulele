import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  slotLabels, parseSlots, patternSpeech, strumPosition, nextTickPos, chordForBar, nextStrumBpm,
  tapTempoBpm, createTapTempo, tempoWord, sanitizeMetronomePrefs, readMetronomePrefs, writeMetronomePrefs,
  METRONOME_KEY, fingerHints, omcTip, omcSummary, shuffle, centsText, needleAngle, createInTuneTracker,
} from '../../src/exercises/drill-helpers.js';
import { getShape, getShapes } from '../../src/core/shapes.js';
import { STRUM_PATTERNS } from '../../src/core/curriculum.js';

// ---------- бой ----------

test('slotLabels: восьмые 4/4 и 3/4', () => {
  assert.deepEqual(slotLabels(8), ['1', 'и', '2', 'и', '3', 'и', '4', 'и']);
  assert.deepEqual(slotLabels(6), ['1', 'и', '2', 'и', '3', 'и']);
  assert.deepEqual(slotLabels(0), []);
});

test('parseSlots: виды ударов, доли и подписи', () => {
  const s = parseSlots('D-XU');
  assert.deepEqual(s.map((x) => x.kind), ['down', 'rest', 'chuck', 'up']);
  assert.deepEqual(s.map((x) => x.label), ['1', 'и', '2', 'и']);
  assert.deepEqual(s.map((x) => x.onBeat), [true, false, true, false]);
  assert.deepEqual(s.map((x) => x.beat), [0, 0, 1, 1]);
  assert.equal(parseSlots('dq')[1].kind, 'rest', 'незнакомый символ — пропуск');
});

test('все бои учебного плана разбираются, длина = 2 × доли', () => {
  for (const p of STRUM_PATTERNS) {
    const s = parseSlots(p.slots);
    assert.equal(s.length, p.beats * 2, p.id);
    assert.equal(s[0].kind, 'down', `${p.id}: начинается вниз`);
  }
});

test('patternSpeech', () => {
  assert.equal(patternSpeech('D-DU'), 'вниз, пропуск, вниз, вверх');
});

test('strumPosition: вступление, игра, конец', () => {
  assert.deepEqual(strumPosition({ bar: 0, beat: 2, sub: 1 }, { bars: 8 }), { phase: 'countin', runBar: -1, slot: 5, beat: 2 });
  assert.deepEqual(strumPosition({ bar: 1, beat: 0, sub: 0 }, { bars: 8 }), { phase: 'run', runBar: 0, slot: 0, beat: 0 });
  assert.deepEqual(strumPosition({ bar: 8, beat: 3, sub: 1 }, { bars: 8 }), { phase: 'run', runBar: 7, slot: 7, beat: 3 });
  assert.equal(strumPosition({ bar: 9, beat: 0, sub: 0 }, { bars: 8 }).phase, 'end');
});

test('nextTickPos: переход через долю и такт', () => {
  assert.deepEqual(nextTickPos({ beat: 0, sub: 0, bar: 0 }, 4), { beat: 0, sub: 1, bar: 0 });
  assert.deepEqual(nextTickPos({ beat: 0, sub: 1, bar: 0 }, 4), { beat: 1, sub: 0, bar: 0 });
  assert.deepEqual(nextTickPos({ beat: 2, sub: 1, bar: 3 }, 3), { beat: 0, sub: 0, bar: 4 });
});

test('chordForBar: по кругу', () => {
  assert.equal(chordForBar(['C', 'G'], 0), 'C');
  assert.equal(chordForBar(['C', 'G'], 3), 'G');
  assert.equal(chordForBar([], 1), null);
  assert.equal(chordForBar(undefined, 1), null);
});

test('nextStrumBpm: +4, с потолком', () => {
  assert.equal(nextStrumBpm(80), 84);
  assert.equal(nextStrumBpm(198), 200);
});

// ---------- tap tempo ----------

test('tapTempoBpm: ровные нажатия по 500 мс → 120', () => {
  assert.equal(tapTempoBpm([0, 500, 1000, 1500]), 120);
  assert.equal(tapTempoBpm([1000]), null);
  assert.equal(tapTempoBpm([]), null);
});

test('tapTempoBpm: пауза длиннее 2 с начинает серию заново', () => {
  // старая серия на 60 BPM, потом пауза и новая на 100
  assert.equal(tapTempoBpm([0, 1000, 2000, 6000, 6600, 7200]), 100);
  assert.equal(tapTempoBpm([0, 1000, 5000]), null);
});

test('tapTempoBpm: берёт только последние maxTaps нажатий', () => {
  const times = [0, 1000, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
  assert.equal(tapTempoBpm(times, { maxTaps: 4 }), 120);
});

test('createTapTempo: серия, сброс по паузе, границы 20–300', () => {
  const t = createTapTempo();
  assert.equal(t.tap(0), null);
  assert.equal(t.tap(750), 80);
  assert.equal(t.tap(1500), 80);
  assert.equal(t.tap(10_000), null, 'длинная пауза — новая серия');
  assert.equal(t.count, 1);
  assert.equal(t.tap(10_050), 300, 'слишком быстро — упираемся в 300');
  t.reset();
  assert.equal(t.count, 0);
});

test('tapTempoBpm: свойство — ровные нажатия дают исходный темп ±1', () => {
  fc.assert(
    fc.property(fc.integer({ min: 30, max: 240 }), fc.integer({ min: 2, max: 8 }), (bpm, n) => {
      const gap = 60000 / bpm;
      const times = Array.from({ length: n }, (_, i) => 1000 + i * gap);
      return Math.abs(tapTempoBpm(times) - bpm) <= 1;
    }),
  );
});

test('tempoWord', () => {
  assert.equal(tempoWord(50), 'очень медленно');
  assert.equal(tempoWord(80), 'спокойно');
  assert.equal(tempoWord(200), 'очень быстро');
});

// ---------- настройки метронома ----------

test('sanitizeMetronomePrefs: мусор → значения по умолчанию', () => {
  assert.deepEqual(sanitizeMetronomePrefs(null), { bpm: 80, beats: 4, sub: 1, accent: true, vibrate: false });
  assert.deepEqual(sanitizeMetronomePrefs({ bpm: '999', beats: 3, sub: 2, accent: false, vibrate: true }),
    { bpm: 300, beats: 3, sub: 2, accent: false, vibrate: true });
  assert.equal(sanitizeMetronomePrefs({ beats: 5 }).beats, 4);
});

test('readMetronomePrefs / writeMetronomePrefs: ключ uke:metronome, битый JSON не роняет', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  writeMetronomePrefs({ bpm: 96, beats: 3, sub: 2, accent: false, vibrate: true }, storage);
  assert.ok(mem.has(METRONOME_KEY));
  assert.ok(METRONOME_KEY.startsWith('uke:'));
  assert.equal(readMetronomePrefs(storage).bpm, 96);
  mem.set(METRONOME_KEY, '{oops');
  assert.equal(readMetronomePrefs(storage).bpm, 80);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readMetronomePrefs(broken).bpm, 80);
  assert.doesNotThrow(() => writeMetronomePrefs({ bpm: 70 }, broken));
});

// ---------- подсказки по пальцам ----------

test('fingerHints: Am — средний на G, остальные открытые', () => {
  const h = fingerHints(getShape('Am'));
  assert.equal(h.length, 2);
  assert.equal(h[0].finger, 2);
  assert.equal(h[0].title, 'Средний');
  assert.match(h[0].text, /2-й лад, струна G \(верхняя\)/);
  assert.equal(h[1].finger, 0);
  assert.match(h[1].text, /струны C, E, A/);
});

test('fingerHints: C — безымянный на A, 3-й лад', () => {
  const h = fingerHints(getShape('C'));
  assert.equal(h[0].title, 'Безымянный');
  assert.match(h[0].text, /3-й лад, струна A \(нижняя\)/);
});

test('fingerHints: G — три пальца по порядку номеров', () => {
  const h = fingerHints(getShape('G'));
  assert.deepEqual(h.filter((x) => x.finger).map((x) => x.finger), [1, 2, 3]);
  assert.match(h.at(-1).text, /струна G — не задевай её/);
});

test('fingerHints: Bb — баррэ указательным', () => {
  const h = fingerHints(getShape('Bb'));
  const barre = h.find((x) => x.finger === 1);
  assert.match(barre.text, /баррэ на 1-м ладу/);
  assert.match(barre.text, /E, A/);
});

test('fingerHints: немые струны, все открытые, нет аппликатуры', () => {
  const muted = fingerHints({ frets: [-1, 2, 3, 2], fingers: [0, 1, 3, 2] });
  assert.ok(muted.some((x) => /струна G не звучит/.test(x.text)));
  const open = fingerHints({ frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0] });
  assert.equal(open.length, 1);
  assert.match(open[0].text, /все струны открытые/);
  assert.deepEqual(fingerHints(null), []);
  const noFingers = fingerHints({ frets: [0, 0, 0, 3] });
  assert.equal(noFingers[0].title, 'Любой удобный палец');
});

test('fingerHints: у каждого учебного аккорда есть хотя бы один пункт', () => {
  for (const name of ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A', 'G7', 'C7', 'D7', 'Bb', 'Gm', 'Bm', 'B7', 'F#m', 'E']) {
    const h = fingerHints(getShape(name));
    assert.ok(h.length >= 1, name);
    for (const x of h) assert.ok(x.text && x.title, name);
  }
});

test('Em: есть упрощённая форма с sub = Em7', () => {
  const alt = getShapes('Em').find((s) => s.sub);
  assert.equal(alt.sub, 'Em7');
  assert.ok(fingerHints(alt).length >= 2);
});

// ---------- OMC ----------

test('omcTip: общий палец Am–F — якорь', () => {
  assert.match(omcTip(getShape('Am'), getShape('F')), /Средний палец на G, 2-й лад, общий/);
  const generic = omcTip(getShape('C'), getShape('G'), 1);
  assert.ok(generic.length > 10);
  assert.ok(omcTip(null, null, -3).length > 10);
});

test('omcSummary: первый замер', () => {
  const s = omcSummary({ count: 18, best: 18, prevBest: 0, record: false, first: true, target: 30, reached: false });
  assert.equal(s.tone, 'first');
  assert.match(s.lines.at(-1).text, /До цели 30 осталось 12/);
});

test('omcSummary: рекорд и цель', () => {
  const s = omcSummary({ count: 34, best: 34, prevBest: 31, record: true, first: false, target: 30, reached: true });
  assert.equal(s.tone, 'record');
  assert.equal(s.title, 'Новый рекорд');
  assert.match(s.lines[0].text, /На 3 смены больше прошлого рекорда \(31\)/);
  assert.equal(s.lines[1].ok, true);
});

test('omcSummary: ниже рекорда и повтор рекорда', () => {
  const below = omcSummary({ count: 20, best: 30, prevBest: 30, record: false, first: false, target: 40, reached: false });
  assert.equal(below.tone, 'plain');
  assert.match(below.lines[0].text, /До рекорда 10 смен/);
  const same = omcSummary({ count: 30, best: 30, prevBest: 30, record: false, first: false, target: 30, reached: true });
  assert.equal(same.tone, 'good');
  assert.equal(same.title, 'Ровно как рекорд');
});

test('shuffle: та же выборка, исходный массив не меняется', () => {
  const src = ['C', 'Am', 'F', 'G', 'Dm'];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = shuffle(src, rand);
  assert.deepEqual([...out].sort(), [...src].sort());
  assert.deepEqual(src, ['C', 'Am', 'F', 'G', 'Dm']);
  assert.deepEqual(shuffle(undefined), []);
});

// ---------- тюнер ----------

test('centsText: подсказки и склонение', () => {
  assert.equal(centsText(12, false), 'выше на 12 центов — ослабь');
  assert.equal(centsText(-1, false), 'ниже на 1 цент — подтяни');
  assert.equal(centsText(-22, false), 'ниже на 22 цента — подтяни');
  assert.equal(centsText(3, true), 'в строю ✓');
  assert.equal(centsText(-180, false), 'сильно ниже — подтяни');
  assert.equal(centsText(null, false), '');
});

test('needleAngle: ±50 центов → ±60°, дальше упор', () => {
  assert.equal(needleAngle(0), 0);
  assert.equal(needleAngle(25), 30);
  assert.equal(needleAngle(-50), -60);
  assert.equal(needleAngle(-300), -60);
  assert.equal(needleAngle(null), 0);
});

test('createInTuneTracker: струна засчитывается после 0,5 с подряд в строю', () => {
  const t = createInTuneTracker();
  assert.equal(t.push('C', true, 0), null);
  assert.equal(t.push('C', true, 300), null);
  assert.equal(t.push('C', false, 350), null, 'сбилась — отсчёт заново');
  assert.equal(t.push('C', true, 400), null);
  assert.equal(t.push('C', true, 899), null);
  assert.equal(t.push('C', true, 900), 'C');
  assert.equal(t.push('C', true, 1500), null, 'засчитывается один раз');
  assert.equal(t.push('E', true, 1600), null);
  assert.equal(t.push(null, false, 1700), null);
  assert.deepEqual([...t.done], ['C']);
  t.reset();
  assert.equal(t.done.size, 0);
});
