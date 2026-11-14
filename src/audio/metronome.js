// Метроном с планированием наперёд (схема «двух часов» Криса Уилсона): таймер раз в 25 мс смотрит
// на 100 мс вперёд и ставит щелчки точно по AudioContext.currentTime. Таймер может опаздывать —
// звук от этого не плывёт. Визуальная доля приходит через setTimeout к моменту звучания.

import { audioCtx, ensureRunning } from './context.js';
import { click } from './synth.js';

const LOOKAHEAD = 0.1; // с
const TIMER_MS = 25;
const START_DELAY = 0.06; // с, запас перед первым щелчком
const LATE = 0.03; // доли, опоздавшие больше чем на столько (вкладка спала), пропускаем
const SUB_GAIN = 0.35; // громкость дробных долей (восьмые, триоли)

/** Допустимый темп. */
export const BPM_MIN = 20;
export const BPM_MAX = 300;

/**
 * @typedef {{time: number, beat: number, sub: number, bar: number, accent: boolean}} Tick
 * time — время AudioContext; beat — доля в такте с 0; sub — дробная доля с 0 (0 — сама доля);
 * bar — номер такта с 0; accent — первая доля такта.
 */

/**
 * @typedef {{startTime: number, lastTime: number|null, beat: number, sub: number, bar: number}} ScheduleState
 * beat/sub/bar — позиция следующей ещё не поставленной доли.
 */

/**
 * Ограничивает темп разумными пределами.
 * @param {number} bpm
 * @returns {number}
 */
export function clampBpm(bpm) {
  const n = Math.round(Number(bpm));
  if (!Number.isFinite(n)) return 80;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, n));
}

/**
 * Начальное состояние планировщика.
 * @param {number} startTime время первой доли (по часам AudioContext)
 * @returns {ScheduleState}
 */
export function createScheduleState(startTime) {
  return { startTime, lastTime: null, beat: 0, sub: 0, bar: 0 };
}

function normalizePos(beat, sub, bar, beatsPerBar, subdivision) {
  if (sub >= subdivision) {
    sub = 0;
    beat += 1;
  }
  if (beat >= beatsPerBar) {
    beat = 0;
    bar += 1;
  }
  return [beat, sub, bar];
}

/**
 * Один шаг планировщика — чистая функция. Возвращает доли, которые надо поставить до `now + ahead`.
 * Интервал до следующей доли считается от последней поставленной по текущему темпу,
 * поэтому новый темп начинает действовать со следующей доли.
 * @param {ScheduleState} state
 * @param {number} now текущее время AudioContext
 * @param {{bpm: number, beatsPerBar?: number, subdivision?: number, ahead?: number}} cfg
 *   subdivision: 1 — четверти, 2 — восьмые, 3 — триоли, 4 — шестнадцатые
 * @returns {{state: ScheduleState, ticks: Tick[]}}
 */
export function scheduleStep(state, now, { bpm, beatsPerBar = 4, subdivision = 1, ahead = LOOKAHEAD }) {
  const perBar = Math.max(1, Math.floor(beatsPerBar));
  const subs = Math.max(1, Math.floor(subdivision));
  const interval = 60 / clampBpm(bpm) / subs;
  /** @type {Tick[]} */
  const ticks = [];
  let { lastTime, beat, sub, bar } = state;
  [beat, sub, bar] = normalizePos(beat, sub, bar, perBar, subs);
  let next = lastTime == null ? state.startTime : lastTime + interval;

  const advance = () => {
    lastTime = next;
    [beat, sub, bar] = normalizePos(beat, sub + 1, bar, perBar, subs);
    next = lastTime + interval;
  };

  // Таймер проспал (вкладка в фоне): прошедшие доли не играем пачкой, но счёт тактов сохраняем.
  while (next < now - LATE) advance();
  while (next < now + ahead) {
    ticks.push({ time: next, beat, sub, bar, accent: beat === 0 && sub === 0 });
    advance();
  }
  return { state: { startTime: state.startTime, lastTime, beat, sub, bar }, ticks };
}

/**
 * Таймер для планировщика. В Web Worker его меньше душит троттлинг; если воркер недоступен — setInterval.
 * @param {() => void} fn
 * @returns {{stop: () => void}}
 */
function startTicker(fn) {
  let fallback = 0;
  const useInterval = () => {
    if (!fallback) fallback = setInterval(fn, TIMER_MS);
  };
  let worker = null;
  let url = '';
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') throw new Error('no worker');
    const code = `setInterval(() => postMessage(0), ${TIMER_MS});`;
    url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = fn;
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      useInterval();
    };
  } catch {
    worker = null;
    useInterval();
  }
  return {
    stop() {
      if (worker) worker.terminate();
      worker = null;
      if (url) URL.revokeObjectURL(url);
      if (fallback) clearInterval(fallback);
      fallback = 0;
    },
  };
}

/**
 * Метроном.
 * @param {{bpm?: number, beatsPerBar?: number, subdivision?: number, sound?: boolean,
 *          onTick?: (tick: Tick) => void}} [opts]
 *   onTick вызывается примерно в момент, когда доля слышна (с поправкой на задержку вывода).
 *   Без звука (`sound: false`) onTick продолжает приходить — «тихий» и вибро-метроном.
 * @returns {{start(): void, stop(): void, setBpm(n: number): void, setSound(b: boolean): void,
 *            setBeatsPerBar(n: number): void, setSubdivision(n: number): void,
 *            setOnTick(fn: ((tick: Tick) => void)|null): void,
 *            readonly running: boolean, readonly bpm: number, readonly beatsPerBar: number,
 *            readonly subdivision: number, readonly sound: boolean}}
 */
export function createMetronome({ bpm = 80, beatsPerBar = 4, subdivision = 1, sound = true, onTick } = {}) {
  const cfg = { bpm: clampBpm(bpm), beatsPerBar: Math.max(1, beatsPerBar | 0), subdivision: Math.max(1, subdivision | 0) };
  let soundOn = sound;
  let tickCb = onTick || null;
  let running = false;
  /** @type {ScheduleState|null} */
  let state = null;
  /** @type {{stop: () => void}|null} */
  let ticker = null;
  const timeouts = new Set();

  const notify = (c, tick) => {
    // Звук выходит из динамика позже, чем currentTime, на outputLatency.
    const latency = c.outputLatency || c.baseLatency || 0;
    const delay = Math.max(0, (tick.time - c.currentTime + latency) * 1000);
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (running && tickCb) tickCb(tick);
    }, delay);
    timeouts.add(id);
  };

  const pump = () => {
    if (!running || !state) return;
    const c = audioCtx();
    const step = scheduleStep(state, c.currentTime, cfg);
    state = step.state;
    for (const tick of step.ticks) {
      if (soundOn) click({ when: tick.time, accent: tick.accent, gain: tick.sub ? SUB_GAIN : undefined });
      if (tickCb) notify(c, tick);
    }
  };

  return {
    start() {
      if (running) return;
      let c;
      try {
        c = ensureRunning();
      } catch {
        return;
      }
      running = true;
      state = createScheduleState(c.currentTime + START_DELAY);
      pump();
      ticker = startTicker(pump);
    },
    stop() {
      running = false;
      ticker?.stop();
      ticker = null;
      state = null;
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
    },
    setBpm(n) {
      cfg.bpm = clampBpm(n);
    },
    setSound(b) {
      soundOn = Boolean(b);
    },
    setBeatsPerBar(n) {
      cfg.beatsPerBar = Math.max(1, n | 0);
    },
    setSubdivision(n) {
      cfg.subdivision = Math.max(1, n | 0);
    },
    setOnTick(fn) {
      tickCb = fn || null;
    },
    get running() {
      return running;
    },
    get bpm() {
      return cfg.bpm;
    },
    get beatsPerBar() {
      return cfg.beatsPerBar;
    },
    get subdivision() {
      return cfg.subdivision;
    },
    get sound() {
      return soundOn;
    },
  };
}
