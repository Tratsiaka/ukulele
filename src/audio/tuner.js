// Тюнер: микрофон → AnalyserNode → pitchy (метод McLeod). Ненадёжные оценки отбрасываем по чёткости,
// остальные сглаживаем медианой последних 5 — так стрелка не прыгает на октаву от шума.
// Струну G принимаем в обеих октавах: тюнер сам понимает и high-G, и low-G.

import { PitchDetector } from 'pitchy';
import { audioCtx } from './context.js';
import { getMic, stopStream, MicError } from './mic.js';

const FFT_SIZE = 4096; // ~85 мс при 48 кГц — хватает для G3
const MIN_CLARITY = 0.9;
const MIN_FREQ = 60;
const MAX_FREQ = 1200;
const MEDIAN_SIZE = 5;
const HOLD_MS = 500; // столько держим последнее показание после того, как струна затихла
const MIN_RMS = 0.0025; // ≈ −52 дБ: тише — считаем тишиной
/** Порог «в строю», центы. Точность вторична — новичку важнее быстро настроиться. */
export const IN_TUNE_CENTS = 7;

/** Названия нот по высотному классу 0–11, с диезами. */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// MIDI целевых нот по струнам 4→1. Для 'gcea' струна G допускает и G4 (67), и G3 (55).
const TARGETS = {
  gcea: [
    { string: 'G', midi: [67, 55] },
    { string: 'C', midi: [60] },
    { string: 'E', midi: [64] },
    { string: 'A', midi: [69] },
  ],
  lowg: [
    { string: 'G', midi: [55] },
    { string: 'C', midi: [60] },
    { string: 'E', midi: [64] },
    { string: 'A', midi: [69] },
  ],
};

/**
 * @typedef {{freq: number|null, clarity: number, note: string|null, octave: number|null, cents: number|null,
 *   midi: number|null, string: 'G'|'C'|'E'|'A'|null, stringCents: number|null, targetFreq: number|null,
 *   inTune: boolean}} TunerReading
 * cents — отклонение от ближайшей ноты; stringCents — от целевой ноты ближайшей струны (минус — ниже, подтянуть).
 */

const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Частота → ближайшая нота равномерного строя (A4 = 440 Гц).
 * @param {number} freq Гц
 * @returns {{midi: number, note: string, octave: number, cents: number}|null} cents — целые, −50…+50
 */
export function freqToNote(freq) {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return {
    midi,
    note: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((exact - midi) * 100) || 0,
  };
}

/**
 * Целевые частоты струн для строя.
 * @param {'gcea'|'lowg'|{midi: number[]}} [tuning] id строя или объект с midi по струнам G C E A
 * @returns {Array<{string: 'G'|'C'|'E'|'A', freqs: number[]}>}
 */
export function stringTargets(tuning = 'gcea') {
  let list = TARGETS.gcea;
  if (typeof tuning === 'string' && TARGETS[tuning]) list = TARGETS[tuning];
  else if (tuning && Array.isArray(tuning.midi) && tuning.midi.length === 4) {
    list = ['G', 'C', 'E', 'A'].map((string, i) => ({ string, midi: [tuning.midi[i]] }));
  }
  return list.map(({ string, midi }) => ({ string, freqs: midi.map(midiToFreq) }));
}

/**
 * Ближайшая струна и отклонение от неё. Для 'gcea' струна G принимается и как G4 (392 Гц), и как G3 (196 Гц) —
 * выбирается та октава, что ближе.
 * @param {number} freq Гц
 * @param {'gcea'|'lowg'|{midi: number[]}} [tuning]
 * @param {{only?: 'G'|'C'|'E'|'A'|null}} [opts] only — сравнивать только с этой струной (ручной выбор струны)
 * @returns {{string: 'G'|'C'|'E'|'A', targetFreq: number, cents: number}|null} cents — целые
 */
export function nearestString(freq, tuning = 'gcea', { only = null } = {}) {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;
  let best = null;
  for (const { string, freqs } of stringTargets(tuning)) {
    if (only && string !== only) continue;
    for (const target of freqs) {
      const cents = 1200 * Math.log2(freq / target);
      if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { string, targetFreq: target, cents };
    }
  }
  if (!best) return null;
  return { string: best.string, targetFreq: Math.round(best.targetFreq * 100) / 100, cents: Math.round(best.cents) || 0 };
}

/**
 * Медиана массива чисел (пустой → NaN).
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Скользящая медиана последних `size` значений.
 * @param {number} [size]
 * @returns {{push(x: number): number, clear(): void, readonly length: number}}
 */
export function createMedianFilter(size = MEDIAN_SIZE) {
  const buf = [];
  return {
    push(x) {
      buf.push(x);
      if (buf.length > size) buf.shift();
      return median(buf);
    },
    clear() {
      buf.length = 0;
    },
    get length() {
      return buf.length;
    },
  };
}

function emptyReading(clarity = 0) {
  return {
    freq: null, clarity, note: null, octave: null, cents: null, midi: null,
    string: null, stringCents: null, targetFreq: null, inTune: false,
  };
}

/**
 * Показание тюнера для частоты (уже отфильтрованной).
 * @param {number} freq
 * @param {number} clarity
 * @param {'gcea'|'lowg'|{midi: number[]}} [tuning]
 * @param {'G'|'C'|'E'|'A'|null} [only]
 * @returns {TunerReading}
 */
export function makeReading(freq, clarity, tuning = 'gcea', only = null) {
  const note = freqToNote(freq);
  const str = nearestString(freq, tuning, { only });
  if (!note || !str) return emptyReading(clarity);
  return {
    freq: Math.round(freq * 100) / 100,
    clarity,
    note: note.note,
    octave: note.octave,
    cents: note.cents,
    midi: note.midi,
    string: str.string,
    stringCents: str.cents,
    targetFreq: str.targetFreq,
    inTune: Math.abs(str.cents) <= IN_TUNE_CENTS,
  };
}

/**
 * Чистая логика тюнера поверх сырых оценок pitchy: порог чёткости, диапазон, медиана, удержание.
 * push возвращает новое показание, пустое показание (струна затихла) или undefined (ничего не менять).
 * @param {{tuning?: 'gcea'|'lowg'|{midi: number[]}, lockString?: 'G'|'C'|'E'|'A'|null, size?: number, holdMs?: number}} [opts]
 * @returns {{push(freq: number, clarity: number, nowMs: number): TunerReading|undefined,
 *            setTuning(t: 'gcea'|'lowg'): void, setLockString(s: 'G'|'C'|'E'|'A'|null): void, reset(): void}}
 */
export function createPitchTracker({ tuning = 'gcea', lockString = null, size = MEDIAN_SIZE, holdMs = HOLD_MS } = {}) {
  const filter = createMedianFilter(size);
  let lastGood = -Infinity;
  let silent = true;
  let currentTuning = tuning;
  let lock = lockString;
  return {
    push(freq, clarity, nowMs) {
      const ok = clarity >= MIN_CLARITY && freq >= MIN_FREQ && freq <= MAX_FREQ;
      if (ok) {
        lastGood = nowMs;
        silent = false;
        return makeReading(filter.push(freq), clarity, currentTuning, lock);
      }
      if (!silent && nowMs - lastGood > holdMs) {
        silent = true;
        filter.clear();
        return emptyReading(clarity);
      }
      return undefined;
    },
    setTuning(t) {
      currentTuning = t;
      filter.clear();
    },
    setLockString(s) {
      lock = s || null;
    },
    reset() {
      filter.clear();
      silent = true;
      lastGood = -Infinity;
    },
  };
}

/**
 * Запускает тюнер. Вызывать из обработчика нажатия (нужен звук и разрешение на микрофон).
 * Когда вкладка скрыта, микрофон выключается и включается снова при возвращении.
 * @param {(reading: TunerReading) => void} onReading вызывается при новом показании и один раз, когда струна затихла
 * @param {{tuning?: 'gcea'|'lowg', lockString?: 'G'|'C'|'E'|'A'|null, onError?: (err: MicError) => void}} [opts]
 *   onError — если микрофон не удалось включить снова после возвращения на вкладку
 * @returns {Promise<() => void>} stop — выключить микрофон и освободить узлы
 * @throws {MicError} если микрофон не включился (текст для пользователя — в message)
 */
export async function startTuner(onReading, { tuning = 'gcea', lockString = null, onError } = {}) {
  const ctx = audioCtx();
  // resume — до ожидания разрешения: так он ещё внутри жеста пользователя
  const resuming = ctx.state === 'running' ? null : ctx.resume().catch(() => {});
  /** @type {MediaStream|null} */
  let stream = await getMic();
  if (resuming) await resuming;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  // Анализатор без выхода в destination в части браузеров не получает данных: подключаем через ноль.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  analyser.connect(sink);
  sink.connect(ctx.destination);

  const detector = PitchDetector.forFloat32Array(FFT_SIZE);
  detector.minVolumeAbsolute = MIN_RMS;
  const buf = new Float32Array(FFT_SIZE);
  const tracker = createPitchTracker({ tuning, lockString });
  const doc = globalThis.document;
  let source = null;
  let raf = 0;
  let stopped = false;
  let attaching = null;

  const frame = () => {
    raf = 0;
    if (stopped || !source) return;
    analyser.getFloatTimeDomainData(buf);
    const [freq, clarity] = detector.findPitch(buf, ctx.sampleRate);
    const reading = tracker.push(freq, clarity, performance.now());
    if (reading) onReading(reading);
    raf = requestAnimationFrame(frame);
  };

  const connect = (s) => {
    stream = s;
    source = ctx.createMediaStreamSource(s);
    source.connect(analyser);
    for (const track of s.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (!stopped && stream === s) onError?.(new MicError('busy'));
      });
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const detach = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    source?.disconnect();
    source = null;
    stopStream(stream);
    stream = null;
    tracker.reset();
  };

  const reattach = async () => {
    if (attaching || stream || stopped) return;
    attaching = getMic()
      .then((s) => {
        if (stopped || doc?.hidden) stopStream(s);
        else connect(s);
      })
      .catch((err) => onError?.(err))
      .finally(() => {
        attaching = null;
      });
  };

  // Скрытая вкладка: микрофон не держим (батарея, приватность, индикатор в шторке).
  const onVisibility = () => {
    if (doc.hidden) {
      if (stream) {
        detach();
        onReading(emptyReading());
      }
    } else reattach();
  };
  doc?.addEventListener('visibilitychange', onVisibility);

  connect(stream);

  return function stop() {
    if (stopped) return;
    stopped = true;
    doc?.removeEventListener('visibilitychange', onVisibility);
    detach();
    analyser.disconnect();
    sink.disconnect();
  };
}
