import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ksRender, renderClick, renderChuck, midiToFreq } from '../../src/audio/synth.js';

const SR = 48000;

/** Период по пику автокорреляции с параболическим уточнением, в отсчётах. */
function periodOf(x, expected, from = 4000, win = 4096) {
  let bestLag = 0;
  let best = -Infinity;
  const lo = Math.floor(expected * 0.6);
  const hi = Math.ceil(expected * 1.4);
  const r = (lag) => {
    let s = 0;
    for (let i = from; i < from + win; i++) s += x[i] * x[i + lag];
    return s;
  };
  for (let lag = lo; lag <= hi; lag++) {
    const v = r(lag);
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  const a = r(bestLag - 1);
  const c = r(bestLag + 1);
  const denom = a - 2 * best + c;
  return denom ? bestLag + (0.5 * (a - c)) / denom : bestLag;
}

const rms = (x, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};

test('midiToFreq', () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(60) - 261.63) < 0.01);
  assert.ok(Math.abs(midiToFreq(55) - 196) < 0.01);
});

test('ksRender: period matches sampleRate / freq (G3, C4, E4, A4, A5)', () => {
  for (const freq of [196, 261.63, 329.63, 440, 880]) {
    const x = ksRender(freq, SR, 0.5);
    const expected = SR / freq;
    const lag = periodOf(x, expected);
    const cents = 1200 * Math.log2(expected / lag);
    assert.ok(Math.abs(cents) < 5, `${freq} Hz: lag ${lag.toFixed(2)} vs ${expected.toFixed(2)} (${cents.toFixed(1)} c)`);
  }
});

test('ksRender: sound decays, more damping loss decays faster', () => {
  const x = ksRender(440, SR, 1.2, { damping: 0.996 });
  const early = rms(x, 0, SR * 0.1);
  const late = rms(x, SR * 0.9, SR * 1.0);
  assert.ok(early > 0.1, `early rms ${early}`);
  assert.ok(late < early * 0.3, `late ${late} vs early ${early}`);

  const ringy = ksRender(440, SR, 1.2, { damping: 0.999 });
  assert.ok(rms(ringy, SR * 0.9, SR * 1.0) > late, 'higher damping value should ring longer');
});

test('ksRender: finite, bounded, deterministic, ends silently', () => {
  const a = ksRender(261.63, SR, 1, { seed: 3 });
  const b = ksRender(261.63, SR, 1, { seed: 3 });
  assert.equal(a.length, SR);
  assert.deepEqual(a, b);
  let peak = 0;
  for (const v of a) {
    assert.ok(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
  }
  assert.ok(peak <= 1.01 && peak > 0.5, `peak ${peak}`);
  assert.ok(a[a.length - 1] === 0, 'last sample is silent');
});

test('ksRender: lower brightness gives a warmer (less high-frequency) start', () => {
  const hf = (x) => {
    let d = 0;
    for (let i = 1; i < 2000; i++) d += Math.abs(x[i] - x[i - 1]);
    return d / rms(x, 0, 2000);
  };
  const warm = ksRender(330, SR, 0.1, { brightness: 0.1 });
  const bright = ksRender(330, SR, 0.1, { brightness: 1 });
  assert.ok(hf(warm) < hf(bright));
});

test('ksRender: invalid input returns silence instead of throwing', () => {
  assert.ok(ksRender(0, SR, 0.1).every((v) => v === 0));
  assert.ok(ksRender(-5, SR, 0.1).every((v) => v === 0));
  assert.ok(ksRender(NaN, SR, 0.1).every((v) => v === 0));
});

test('renderClick: 18 ms, ~2.8 kHz, accent ~3.4 kHz, short envelope', () => {
  const zeroCrossFreq = (x) => {
    let n = 0;
    for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++;
    return n / 2 / (x.length / SR);
  };
  const c = renderClick(SR);
  const a = renderClick(SR, { accent: true });
  assert.equal(c.length, Math.round(SR * 0.018));
  assert.ok(Math.abs(zeroCrossFreq(c) - 2800) < 200, `click ${zeroCrossFreq(c)}`);
  assert.ok(Math.abs(zeroCrossFreq(a) - 3400) < 200, `accent ${zeroCrossFreq(a)}`);
  assert.ok(Math.max(...c.map(Math.abs)) <= 1);
  // к концу почти тишина
  assert.ok(rms(c, c.length - 100, c.length) < rms(c, 0, 200) * 0.1);
});

test('renderChuck: short and bounded', () => {
  const x = renderChuck(SR);
  assert.ok(x.length < SR * 0.1);
  assert.ok(x.every((v) => Number.isFinite(v) && Math.abs(v) <= 1.5));
});
