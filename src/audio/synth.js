// Звук укулеле без файлов: синтез Karplus-Strong (щипок струны), плюс щелчок метронома и глушение (chuck).
// Ноты рендерятся в AudioBuffer один раз и кешируются; дальше воспроизведение стоит копейки.

import { getShape, shapeMidi } from '../core/shapes.js';
import { audioCtx, ensureRunning } from './context.js';

const NOTE_SECONDS = 2.2; // длина буфера ноты
const DECAY_SECONDS = 2.0; // за это время нота затухает примерно на 40 дБ
const NYLON_BRIGHTNESS = 0.45; // нейлон звучит мягче стальных струн
const STRUM_STAGGER = 0.012; // задержка между струнами при ударе, с
const START_OFFSET = 0.02; // «сейчас» с небольшим запасом, чтобы начало не обрезалось
const CLICK_SECONDS = 0.018;

/**
 * Частота ноты по номеру MIDI (A4 = 69 = 440 Гц).
 * @param {number} midi
 * @returns {number} Гц
 */
export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Детерминированный ГПСЧ: одинаковый шум → одинаковый звук и стабильные тесты. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Рендер щипка струны алгоритмом Karplus-Strong. Чистая функция, без Web Audio.
 * Петля: линия задержки N + усреднение соседних отсчётов (0,5 отсчёта) + всепропускающий фильтр
 * для дробной части периода — так высота точная и на высоких нотах.
 * @param {number} freq частота, Гц
 * @param {number} sampleRate частота дискретизации
 * @param {number} seconds длительность
 * @param {{damping?: number, brightness?: number, seed?: number}} [opts]
 *   damping — потери за один период (0,98–0,999, больше — дольше звенит);
 *   brightness — 0…1, яркость начального шума (меньше — теплее);
 *   seed — зерно шума.
 * @returns {Float32Array} отсчёты, пик около 1
 */
export function ksRender(freq, sampleRate, seconds, { damping = 0.996, brightness = 0.5, seed = 1 } = {}) {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const out = new Float32Array(length);
  if (!(freq > 0) || !(sampleRate > 0) || freq >= sampleRate / 4) return out;

  const period = sampleRate / freq;
  const n = Math.max(2, Math.floor(period - 0.6));
  const frac = period - 0.5 - n; // ∈ [0,1; 1,1) — устойчивая зона всепропускающего фильтра
  const apC = (1 - frac) / (1 + frac);

  // Возбуждение: шум через однополюсный ФНЧ, без постоянной составляющей, нормированный к 1.
  const rand = mulberry32(seed);
  const line = new Float32Array(n);
  const a = 0.1 + 0.9 * clamp(brightness, 0, 1);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    lp += a * (rand() * 2 - 1 - lp);
    line[i] = lp;
    mean += lp;
  }
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    line[i] -= mean;
    peak = Math.max(peak, Math.abs(line[i]));
  }
  const norm = peak > 0 ? 1 / peak : 0;
  for (let i = 0; i < n; i++) line[i] *= norm;

  const loss = clamp(damping, 0, 1);
  let idx = 0;
  let xPrev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let t = 0; t < length; t++) {
    const x = line[idx];
    out[t] = x;
    const avg = 0.5 * (x + xPrev);
    xPrev = x;
    const ap = apC * avg + apIn - apC * apOut;
    apIn = avg;
    apOut = ap;
    line[idx] = loss * ap;
    idx = idx + 1 === n ? 0 : idx + 1;
  }

  // Короткое затухание в конце буфера, чтобы не было щелчка при обрыве.
  const fade = Math.min(length, Math.round(sampleRate * 0.015));
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
  return out;
}

/**
 * Щелчок метронома: короткий синус ~2,8 кГц (акцент ~3,4 кГц) с быстрой огибающей.
 * Узкая полоса, чтобы детектор ударов по струнам (150–1500 Гц) мог его отрезать.
 * @param {number} sampleRate
 * @param {{accent?: boolean}} [opts]
 * @returns {Float32Array}
 */
export function renderClick(sampleRate, { accent = false } = {}) {
  const freq = accent ? 3400 : 2800;
  const length = Math.round(sampleRate * CLICK_SECONDS);
  const out = new Float32Array(length);
  const attack = sampleRate * 0.001;
  const tau = sampleRate * 0.004;
  for (let i = 0; i < length; i++) {
    const env = (i < attack ? i / attack : Math.exp(-(i - attack) / tau)) * (1 - i / length);
    out[i] = env * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

/**
 * Глушение ладонью (chuck): короткий шумовой «тык» с телом. Чистая функция.
 * @param {number} sampleRate
 * @returns {Float32Array}
 */
export function renderChuck(sampleRate) {
  const length = Math.round(sampleRate * 0.06);
  const out = new Float32Array(length);
  const rand = mulberry32(7);
  let lp = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    lp += 0.35 * (rand() * 2 - 1 - lp);
    const thump = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.02);
    out[i] = (0.8 * lp + 0.5 * thump) * Math.exp(-t / 0.012) * (1 - i / length);
  }
  return out;
}

// ---- Web Audio часть ----

/** @type {Map<string, AudioBuffer>} */
const buffers = new Map();
/** @type {{ctx: AudioContext, input: AudioNode, clicks: AudioNode}|null} */
let bus = null;
/** Звучащие голоса по струнам 0..3: новый удар глушит старую ноту на той же струне. */
const voices = [null, null, null, null];

function toBuffer(c, data) {
  const buf = c.createBuffer(1, data.length, c.sampleRate);
  buf.getChannelData(0).set(data);
  return buf;
}

function cached(c, key, render) {
  const k = `${key}|${c.sampleRate}`;
  let buf = buffers.get(k);
  if (!buf) {
    buf = toBuffer(c, render());
    buffers.set(k, buf);
  }
  return buf;
}

function noteBuffer(c, midi) {
  return cached(c, `n${midi}`, () => {
    const freq = midiToFreq(midi);
    // Потери подобраны так, чтобы все ноты затухали за одно время, а не высокие — мгновенно.
    const damping = 0.01 ** (1 / (DECAY_SECONDS * freq));
    return ksRender(freq, c.sampleRate, NOTE_SECONDS, { damping, brightness: NYLON_BRIGHTNESS, seed: midi });
  });
}

/** Выходная цепочка: корпус (резонанс ~230 Гц) → мягкий ФНЧ → компрессор от перегруза. */
function output(c) {
  if (bus && bus.ctx === c) return bus;
  const input = c.createGain();
  input.gain.value = 0.9;
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 230;
  body.Q.value = 1.4;
  body.gain.value = 5;
  const air = c.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 4200;
  air.Q.value = 0.5;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  input.connect(body).connect(air).connect(comp).connect(c.destination);
  // Щелчки идут мимо фильтров, чтобы ФНЧ их не приглушал.
  const clicks = c.createGain();
  clicks.gain.value = 0.5;
  clicks.connect(c.destination);
  bus = { ctx: c, input, clicks };
  return bus;
}

function startTime(c, when) {
  const now = c.currentTime + START_OFFSET;
  return when == null || when < now ? now : when;
}

function play(c, buffer, when, gain, dest) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, when);
  src.connect(g).connect(dest);
  src.start(when);
  const voice = { src, g, start: when };
  src.onended = () => {
    src.disconnect();
    g.disconnect();
  };
  return voice;
}

function damp(voice, at, tau = 0.012) {
  if (!voice || voice.start >= at) return;
  try {
    voice.g.gain.cancelScheduledValues(at);
    voice.g.gain.setTargetAtTime(0, at, tau);
    voice.src.stop(at + tau * 8);
  } catch {
    // голос уже остановлен
  }
}

function resolveMidi(nameOrShape, tuning) {
  if (Array.isArray(nameOrShape)) return nameOrShape;
  const shape = typeof nameOrShape === 'string' ? getShape(nameOrShape) : nameOrShape;
  if (!shape || !Array.isArray(shape.frets)) return null;
  return shapeMidi(shape, tuning);
}

/**
 * Удар по аккорду: струны звучат с задержкой ~12 мс (вниз — G C E A, вверх — наоборот).
 * Вызывать из обработчика жеста или после unlockAudio().
 * @param {string|import('../core/shapes.js').Shape|(number|null)[]} nameOrShape имя аккорда, аппликатура
 *   или готовые MIDI-ноты по струнам G C E A (null — струна не звучит)
 * @param {{direction?: 'down'|'up', when?: number, gain?: number, tuning?: 'gcea'|'lowg'}} [opts]
 *   when — время AudioContext; по умолчанию сейчас
 * @returns {number|null} время начала удара или null, если аккорд неизвестен / звука нет
 */
export function strumChord(nameOrShape, { direction = 'down', when, gain = 0.8, tuning = 'gcea' } = {}) {
  const midis = resolveMidi(nameOrShape, tuning);
  if (!midis || !midis.some((m) => m != null)) return null;
  let c;
  try {
    c = ensureRunning();
  } catch {
    return null;
  }
  const t0 = startTime(c, when);
  const { input } = output(c);
  const up = direction === 'up';
  const order = up ? [3, 2, 1, 0] : [0, 1, 2, 3];
  // Удар вверх обычно легче.
  const level = gain * (up ? 0.85 : 1) * 0.32;
  order.forEach((s, k) => {
    const midi = midis[s];
    if (midi == null) return;
    const t = t0 + k * STRUM_STAGGER;
    damp(voices[s], t);
    voices[s] = play(c, noteBuffer(c, midi), t, level * (0.92 + 0.08 * Math.random()), input);
  });
  return t0;
}

/**
 * Одна нота (щипок струны).
 * @param {number} midi номер ноты MIDI
 * @param {{when?: number, duration?: number, gain?: number}} [opts] duration — заглушить через N секунд
 * @returns {number|null} время начала или null
 */
export function pluck(midi, { when, duration, gain = 0.7 } = {}) {
  if (!Number.isFinite(midi)) return null;
  let c;
  try {
    c = ensureRunning();
  } catch {
    return null;
  }
  const t = startTime(c, when);
  const voice = play(c, noteBuffer(c, midi), t, gain * 0.5, output(c).input);
  if (duration > 0) damp(voice, t + duration, 0.03);
  return t;
}

/**
 * Щелчок метронома.
 * @param {{when?: number, accent?: boolean, gain?: number}} [opts] gain — 0…1, по умолчанию 1 для акцента и 0,7 для доли
 * @returns {number|null} время щелчка или null
 */
export function click({ when, accent = false, gain } = {}) {
  let c;
  try {
    c = ensureRunning();
  } catch {
    return null;
  }
  const t = startTime(c, when);
  const buf = cached(c, accent ? 'click-accent' : 'click', () => renderClick(c.sampleRate, { accent }));
  play(c, buf, t, gain ?? (accent ? 1 : 0.7), output(c).clicks);
  return t;
}

/**
 * Глушение ладонью (символ X в бое): гасит звенящие струны и даёт короткий шумовой удар.
 * @param {{when?: number, gain?: number}} [opts]
 * @returns {number|null} время удара или null
 */
export function chuck({ when, gain = 0.8 } = {}) {
  let c;
  try {
    c = ensureRunning();
  } catch {
    return null;
  }
  const t = startTime(c, when);
  voices.forEach((v) => damp(v, t, 0.008));
  play(c, cached(c, 'chuck', () => renderChuck(c.sampleRate)), t, gain * 0.6, output(c).input);
  return t;
}

/**
 * Быстро заглушить все звенящие струны (например, при уходе с экрана).
 */
export function silence() {
  if (!bus) return;
  const t = bus.ctx.currentTime;
  voices.forEach((v, i) => {
    if (v && v.start >= t) {
      try {
        v.src.stop();
      } catch {
        // уже остановлен
      }
    } else damp(v, t, 0.01);
    voices[i] = null;
  });
}
