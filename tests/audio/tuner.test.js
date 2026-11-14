import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freqToNote, nearestString, median, createMedianFilter, createPitchTracker, makeReading, stringTargets, IN_TUNE_CENTS,
} from '../../src/audio/tuner.js';

test('freqToNote table', () => {
  const cases = [
    [440, 'A', 4, 0, 69],
    [261.63, 'C', 4, 0, 60],
    [196, 'G', 3, 0, 55],
    [392, 'G', 4, 0, 67],
    [446, 'A', 4, 23, 69],
    [329.63, 'E', 4, 0, 64],
    [466.16, 'A#', 4, 0, 70],
    [55, 'A', 1, 0, 33],
  ];
  for (const [f, note, octave, cents, midi] of cases) {
    assert.deepEqual(freqToNote(f), { midi, note, octave, cents }, `${f} Hz`);
  }
  assert.equal(freqToNote(430).note, 'A');
  assert.ok(freqToNote(430).cents < -35);
});

test('freqToNote: invalid input → null', () => {
  assert.equal(freqToNote(0), null);
  assert.equal(freqToNote(-1), null);
  assert.equal(freqToNote(NaN), null);
  assert.equal(freqToNote(Infinity), null);
});

test('nearestString: G accepted in both octaves for gcea', () => {
  assert.deepEqual(nearestString(392), { string: 'G', targetFreq: 392, cents: 0 });
  assert.deepEqual(nearestString(196), { string: 'G', targetFreq: 196, cents: 0 });
  assert.equal(nearestString(190).string, 'G');
  assert.ok(nearestString(190).cents < -40);
  assert.equal(nearestString(261.63).string, 'C');
  assert.equal(nearestString(329.63).string, 'E');
  const a = nearestString(446);
  assert.equal(a.string, 'A');
  assert.equal(a.cents, 23);
});

test('nearestString: lowg targets G3 only', () => {
  assert.deepEqual(nearestString(196, 'lowg'), { string: 'G', targetFreq: 196, cents: 0 });
  // G4 на low-G — не цель струны G
  assert.notEqual(nearestString(392, 'lowg').targetFreq, 392);
});

test('nearestString: only = locked string, unknown tuning falls back to gcea', () => {
  const r = nearestString(370, 'gcea', { only: 'A' });
  assert.equal(r.string, 'A');
  assert.ok(r.cents < -150);
  assert.equal(nearestString(392, 'baritone').string, 'G');
  assert.equal(nearestString(0), null);
});

test('stringTargets: four strings, G in two octaves for gcea', () => {
  const t = stringTargets('gcea');
  assert.deepEqual(t.map((s) => s.string), ['G', 'C', 'E', 'A']);
  assert.equal(t[0].freqs.length, 2);
  assert.equal(stringTargets('lowg')[0].freqs.length, 1);
  assert.equal(stringTargets({ midi: [55, 60, 64, 69] })[0].freqs.length, 1);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.ok(Number.isNaN(median([])));
  const src = [5, 1, 4];
  median(src);
  assert.deepEqual(src, [5, 1, 4], 'does not mutate input');
});

test('median filter: window of 5 hides an octave jump', () => {
  const f = createMedianFilter(5);
  const out = [440, 440, 880, 441, 439].map((x) => f.push(x));
  assert.equal(out.at(-1), 440);
  assert.equal(out[2], 440);
  for (let i = 0; i < 5; i++) f.push(262);
  assert.equal(f.push(262), 262, 'old values leave the window');
  assert.equal(f.length, 5);
  f.clear();
  assert.equal(f.length, 0);
});

test('makeReading: inTune within ±7 cents, fields filled', () => {
  const r = makeReading(441, 0.95);
  assert.equal(r.note, 'A');
  assert.equal(r.octave, 4);
  assert.equal(r.string, 'A');
  assert.equal(r.inTune, true);
  assert.equal(IN_TUNE_CENTS, 7);
  assert.equal(makeReading(443, 0.95).inTune, false);
  const g = makeReading(196.5, 0.97);
  assert.equal(g.string, 'G');
  assert.equal(g.targetFreq, 196);
  assert.equal(g.inTune, true);
});

test('pitch tracker: clarity gate, range gate, median, hold then silence', () => {
  const t = createPitchTracker({ holdMs: 500 });
  assert.equal(t.push(440, 0.5, 0), undefined, 'low clarity ignored');
  assert.equal(t.push(40, 0.99, 10), undefined, 'below 60 Hz ignored');
  assert.equal(t.push(1500, 0.99, 20), undefined, 'above 1200 Hz ignored');

  let r;
  for (const [i, f] of [440, 441, 880, 439, 440].entries()) r = t.push(f, 0.95, 100 + i * 16);
  assert.equal(r.string, 'A');
  assert.ok(Math.abs(r.freq - 440) < 1.1, `median ${r.freq}`);

  assert.equal(t.push(0, 0, 300), undefined, 'within hold: no change');
  const empty = t.push(0, 0, 800);
  assert.equal(empty.freq, null);
  assert.equal(empty.string, null);
  assert.equal(empty.inTune, false);
  assert.equal(t.push(0, 0, 900), undefined, 'silence reported once');

  // после тишины медиана начинается заново
  r = t.push(196, 0.95, 1000);
  assert.equal(r.freq, 196);
  assert.equal(r.string, 'G');
});

test('pitch tracker: lockString and setTuning', () => {
  const t = createPitchTracker({ lockString: 'E' });
  assert.equal(t.push(392, 0.95, 0).string, 'E');
  t.setLockString(null);
  assert.equal(t.push(392, 0.95, 16).string, 'G');
  t.setTuning('lowg');
  t.reset();
  assert.equal(t.push(196, 0.95, 32).targetFreq, 196);
});
