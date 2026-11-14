import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleStep, createScheduleState, clampBpm, createMetronome, BPM_MIN, BPM_MAX } from '../../src/audio/metronome.js';

const EPS = 1e-9;

/** Гоняет планировщик фейковыми часами с шагом таймера 25 мс. cfgAt(now) позволяет менять настройки по ходу. */
function run(start, until, cfgAt, { step = 0.025, from = start - 0.06 } = {}) {
  let state = createScheduleState(start);
  const ticks = [];
  for (let now = from; now <= until + EPS; now += step) {
    const res = scheduleStep(state, now, cfgAt(now, ticks));
    for (const t of res.ticks) {
      assert.ok(t.time >= now - EPS, `tick ${t.time} scheduled late at ${now}`);
      assert.ok(t.time < now + 0.1 + EPS, `tick ${t.time} scheduled too early at ${now}`);
      ticks.push({ ...t, scheduledAt: now });
    }
    state = res.state;
  }
  return ticks;
}

test('120 bpm 4/4: exact times, beats, bars, accent on beat 1', () => {
  const ticks = run(1, 4.45, () => ({ bpm: 120, beatsPerBar: 4, subdivision: 1 }));
  const times = ticks.map((t) => t.time);
  const expected = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  assert.equal(times.length, expected.length);
  times.forEach((t, i) => assert.ok(Math.abs(t - expected[i]) < EPS, `${t} vs ${expected[i]}`));
  assert.deepEqual(ticks.map((t) => t.beat), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.deepEqual(ticks.map((t) => t.bar), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(ticks.map((t) => t.accent), [true, false, false, false, true, false, false, false]);
  assert.ok(ticks.every((t) => t.sub === 0));
});

test('no tick is scheduled twice across steps', () => {
  const ticks = run(0, 10, () => ({ bpm: 97, beatsPerBar: 4 }), { step: 0.013 });
  const times = ticks.map((t) => t.time);
  assert.equal(new Set(times).size, times.length);
  for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - 60 / 97) < 1e-9);
});

test('bpm change applies from the next tick', () => {
  // 120 → 60 после того, как поставлена доля на 1,5 с
  const ticks = run(1, 5, (now, done) => ({ bpm: done.some((t) => t.time >= 1.5 - EPS) ? 60 : 120 }));
  const times = ticks.map((t) => t.time);
  assert.ok(Math.abs(times[0] - 1) < EPS);
  assert.ok(Math.abs(times[1] - 1.5) < EPS);
  assert.ok(Math.abs(times[2] - 2.5) < EPS, `next interval is 1 s: ${times[2]}`);
  assert.ok(Math.abs(times[3] - 3.5) < EPS);
});

test('setting bpm in the middle of a gap moves the pending next tick', () => {
  let state = createScheduleState(0);
  let res = scheduleStep(state, 0, { bpm: 60 });
  assert.deepEqual(res.ticks.map((t) => t.time), [0]);
  state = res.state;
  // через 0,3 с темп стал 120: следующая доля — через 0,5 с после последней, а не через 1 с
  res = scheduleStep(state, 0.45, { bpm: 120 });
  assert.equal(res.ticks.length, 1);
  assert.ok(Math.abs(res.ticks[0].time - 0.5) < EPS);
});

test('eighths: sub alternates, accent only on the first eighth of the bar', () => {
  const ticks = run(0, 2.3, () => ({ bpm: 120, beatsPerBar: 4, subdivision: 2 }));
  assert.ok(Math.abs(ticks[1].time - 0.25) < EPS);
  assert.deepEqual(ticks.slice(0, 10).map((t) => t.sub), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  assert.deepEqual(ticks.slice(0, 10).map((t) => t.beat), [0, 0, 1, 1, 2, 2, 3, 3, 0, 0]);
  assert.deepEqual(ticks.slice(0, 10).map((t) => t.accent), [true, false, false, false, false, false, false, false, true, false]);
});

test('triplets in 3/4: three subs per beat, bar of three beats', () => {
  const ticks = run(0, 3.1, () => ({ bpm: 60, beatsPerBar: 3, subdivision: 3 }));
  assert.ok(Math.abs(ticks[1].time - 1 / 3) < EPS);
  assert.deepEqual(ticks.slice(0, 10).map((t) => t.sub), [0, 1, 2, 0, 1, 2, 0, 1, 2, 0]);
  assert.deepEqual(ticks.slice(0, 10).map((t) => t.beat), [0, 0, 0, 1, 1, 1, 2, 2, 2, 0]);
  assert.equal(ticks[9].bar, 1);
  assert.ok(ticks[9].accent);
});

test('sleeping timer: missed ticks are skipped, grid and bar count stay aligned', () => {
  let state = createScheduleState(0);
  let res = scheduleStep(state, 0, { bpm: 120 });
  state = res.state;
  // таймер проснулся через 5 с
  res = scheduleStep(state, 5.01, { bpm: 120 });
  assert.equal(res.ticks.length, 1, 'only ticks inside the window are played');
  const t = res.ticks[0];
  assert.ok(Math.abs(t.time - 5.0) < EPS, `on grid: ${t.time}`);
  assert.equal(t.beat, 2);
  assert.equal(t.bar, 2);
});

test('beatsPerBar shrinking mid-bar wraps to a new bar', () => {
  let state = { startTime: 0, lastTime: 1.5, beat: 3, sub: 0, bar: 0 };
  const res = scheduleStep(state, 1.95, { bpm: 120, beatsPerBar: 3 });
  assert.equal(res.ticks[0].beat, 0);
  assert.equal(res.ticks[0].bar, 1);
  assert.ok(res.ticks[0].accent);
});

test('clampBpm', () => {
  assert.equal(clampBpm(80.4), 80);
  assert.equal(clampBpm(5), BPM_MIN);
  assert.equal(clampBpm(999), BPM_MAX);
  assert.equal(clampBpm('abc'), 80);
});

test('createMetronome without Web Audio: start is a safe no-op, setters work', () => {
  const m = createMetronome({ bpm: 70, beatsPerBar: 3, subdivision: 2, sound: false });
  assert.equal(m.bpm, 70);
  assert.equal(m.beatsPerBar, 3);
  assert.equal(m.subdivision, 2);
  assert.equal(m.sound, false);
  m.start();
  assert.equal(m.running, false);
  m.setBpm(500);
  assert.equal(m.bpm, BPM_MAX);
  m.setSound(true);
  assert.equal(m.sound, true);
  m.stop();
  assert.equal(m.running, false);
});
