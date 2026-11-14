// Чистые помощники тренажёров (drills): бой по восьмым, tap-tempo, подсказки по пальцам, тексты итогов.
// Без DOM и без Web Audio — проверяется в node --test (tests/drills/).

import { plural } from '../lib/format.js';

const STRING_NAMES = ['G', 'C', 'E', 'A'];
/** Где струна, когда держишь укулеле: G ближе к лицу, A ближе к полу. */
const STRING_PLACE = ['верхняя', 'вторая сверху', 'третья сверху', 'нижняя'];
const FINGER_NAME = { 1: 'Указательный', 2: 'Средний', 3: 'Безымянный', 4: 'Мизинец' };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- бой ----------

/** Вид удара по символу слота: D вниз, U вверх, X глушение, - пропуск. */
export const SLOT_KIND = Object.freeze({ D: 'down', U: 'up', X: 'chuck', '-': 'rest' });
const KIND_SPEECH = { down: 'вниз', up: 'вверх', chuck: 'глушение', rest: 'пропуск' };

/**
 * Подписи счёта для восьмых: 8 слотов → ['1', 'и', '2', 'и', '3', 'и', '4', 'и'], 6 → до '3'.
 * @param {number} count число восьмых
 * @returns {string[]}
 */
export function slotLabels(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return Array.from({ length: n }, (_, i) => (i % 2 ? 'и' : String(i / 2 + 1)));
}

/**
 * Разбор строки боя по слотам.
 * @param {string|string[]} slots 'D-DUD-DU' или массив символов
 * @returns {{index: number, kind: 'down'|'up'|'chuck'|'rest', label: string, beat: number, onBeat: boolean}[]}
 */
export function parseSlots(slots) {
  const chars = Array.isArray(slots) ? slots : [...String(slots ?? '')];
  const labels = slotLabels(chars.length);
  return chars.map((ch, index) => ({
    index,
    kind: SLOT_KIND[String(ch).toUpperCase()] ?? 'rest',
    label: labels[index],
    beat: Math.floor(index / 2),
    onBeat: index % 2 === 0,
  }));
}

/**
 * Бой словами для экранного диктора: 'вниз, пропуск, вниз, вверх'.
 * @param {string|string[]} slots
 * @returns {string}
 */
export function patternSpeech(slots) {
  return parseSlots(slots)
    .map((s) => KIND_SPEECH[s.kind])
    .join(', ');
}

/**
 * Где сейчас прогон боя по доле метронома (восьмые, subdivision = 2).
 * Первые countIn тактов — вступительный счёт, затем bars тактов игры, потом конец.
 * @param {{beat: number, sub: number, bar: number}} tick 0-based
 * @param {{bars: number, countIn?: number}} opts
 * @returns {{phase: 'countin'|'run'|'end', runBar: number, slot: number, beat: number}}
 */
export function strumPosition(tick, { bars, countIn = 1 }) {
  const runBar = tick.bar - countIn;
  const slot = tick.beat * 2 + tick.sub;
  if (runBar < 0) return { phase: 'countin', runBar: -1, slot, beat: tick.beat };
  if (runBar >= bars) return { phase: 'end', runBar, slot: 0, beat: 0 };
  return { phase: 'run', runBar, slot, beat: tick.beat };
}

/**
 * Следующая позиция метронома после этой доли.
 * @param {{beat: number, sub: number, bar: number}} tick
 * @param {number} beatsPerBar
 * @param {number} [subdivision]
 * @returns {{beat: number, sub: number, bar: number}}
 */
export function nextTickPos({ beat, sub, bar }, beatsPerBar, subdivision = 2) {
  let b = beat;
  let s = sub + 1;
  let br = bar;
  if (s >= subdivision) {
    s = 0;
    b += 1;
  }
  if (b >= beatsPerBar) {
    b = 0;
    br += 1;
  }
  return { beat: b, sub: s, bar: br };
}

/**
 * Аккорд такта: аккорды идут по кругу, по одному на такт.
 * @param {string[]|undefined} chords
 * @param {number} bar 0-based
 * @returns {string|null}
 */
export function chordForBar(chords, bar) {
  if (!Array.isArray(chords) || !chords.length) return null;
  const n = chords.length;
  return chords[((Math.floor(bar) % n) + n) % n];
}

/**
 * Темп для следующего раза после ровного прогона.
 * @param {number} bpm
 * @param {{step?: number, max?: number}} [opts]
 * @returns {number}
 */
export function nextStrumBpm(bpm, { step = 4, max = 200 } = {}) {
  return clamp(Math.round(Number(bpm) || 0) + step, 20, max);
}

// ---------- tap tempo и метроном ----------

/**
 * Темп по моментам нажатий: среднее по последней серии без пауз длиннее maxGapMs.
 * @param {number[]} times миллисекунды по возрастанию
 * @param {{maxGapMs?: number, maxTaps?: number}} [opts]
 * @returns {number|null} BPM (20–300) или null, если нажатий меньше двух
 */
export function tapTempoBpm(times, { maxGapMs = 2000, maxTaps = 6 } = {}) {
  if (!Array.isArray(times) || times.length < 2) return null;
  let start = times.length - 1;
  while (start > 0 && times[start] - times[start - 1] <= maxGapMs && times[start] > times[start - 1]) start--;
  const run = times.slice(start).slice(-maxTaps);
  if (run.length < 2) return null;
  const avg = (run[run.length - 1] - run[0]) / (run.length - 1);
  if (!(avg > 0)) return null;
  return clamp(Math.round(60000 / avg), 20, 300);
}

/**
 * Счётчик tap-tempo: tap(now) возвращает темп или null (нужно ещё нажатие).
 * Пауза дольше maxGapMs начинает серию заново.
 * @param {{maxGapMs?: number, maxTaps?: number}} [opts]
 * @returns {{tap(nowMs: number): number|null, reset(): void, readonly count: number}}
 */
export function createTapTempo({ maxGapMs = 2000, maxTaps = 6 } = {}) {
  let times = [];
  return {
    tap(now) {
      if (times.length && (now - times[times.length - 1] > maxGapMs || now <= times[times.length - 1])) times = [];
      times.push(now);
      if (times.length > maxTaps) times.shift();
      return tapTempoBpm(times, { maxGapMs, maxTaps });
    },
    reset() {
      times = [];
    },
    get count() {
      return times.length;
    },
  };
}

/**
 * Темп словами.
 * @param {number} bpm
 * @returns {string}
 */
export function tempoWord(bpm) {
  if (bpm < 60) return 'очень медленно';
  if (bpm < 76) return 'медленно';
  if (bpm < 108) return 'спокойно';
  if (bpm < 132) return 'бодро';
  if (bpm < 168) return 'быстро';
  return 'очень быстро';
}

/** Ключ localStorage метронома (только с префиксом uke:). */
export const METRONOME_KEY = 'uke:metronome';
/** Настройки метронома по умолчанию. */
export const METRONOME_DEFAULTS = Object.freeze({ bpm: 80, beats: 4, sub: 1, accent: true, vibrate: false });

/**
 * Приводит сохранённые настройки метронома к допустимым.
 * @param {any} raw
 * @returns {{bpm: number, beats: 3|4, sub: 1|2, accent: boolean, vibrate: boolean}}
 */
export function sanitizeMetronomePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const bpm = Math.round(Number(p.bpm));
  return {
    bpm: Number.isFinite(bpm) ? clamp(bpm, 20, 300) : METRONOME_DEFAULTS.bpm,
    beats: p.beats === 3 ? 3 : 4,
    sub: p.sub === 2 ? 2 : 1,
    accent: typeof p.accent === 'boolean' ? p.accent : METRONOME_DEFAULTS.accent,
    vibrate: typeof p.vibrate === 'boolean' ? p.vibrate : METRONOME_DEFAULTS.vibrate,
  };
}

/**
 * Читает настройки метронома. Без localStorage (приватный режим) — значения по умолчанию.
 * @param {{getItem(k: string): string|null}|undefined} [storage]
 */
export function readMetronomePrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(METRONOME_KEY);
    return sanitizeMetronomePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeMetronomePrefs(null);
  }
}

/**
 * Сохраняет настройки метронома (ошибки хранилища молча пропускаются).
 * @param {object} prefs
 * @param {{setItem(k: string, v: string): void}|undefined} [storage]
 */
export function writeMetronomePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(METRONOME_KEY, JSON.stringify(sanitizeMetronomePrefs(prefs)));
  } catch {
    // нет места или нет доступа — не страшно
  }
}

// ---------- аккорды ----------

/**
 * Подсказка по пальцам для аппликатуры: по одному пункту на палец (по номеру),
 * затем открытые и заглушённые струны.
 * @param {{frets: number[], fingers?: number[], barre?: {fret: number, from: number, to: number}|null}|null} shape
 * @returns {{finger: number, title: string, text: string}[]} finger 0 — пункт про открытые/немые струны
 */
export function fingerHints(shape) {
  if (!shape || !Array.isArray(shape.frets)) return [];
  const frets = shape.frets;
  const fingers = shape.fingers || [0, 0, 0, 0];
  /** @type {Map<number, number[]>} палец → струны */
  const byFinger = new Map();
  const loose = [];
  frets.forEach((f, s) => {
    if (!(f > 0)) return;
    const fg = fingers[s] || 0;
    if (!fg) loose.push(s);
    else byFinger.set(fg, [...(byFinger.get(fg) ?? []), s]);
  });

  const hints = [];
  const where = (s) => `струна ${STRING_NAMES[s]} (${STRING_PLACE[s]})`;
  for (const fg of [...byFinger.keys()].sort((a, b) => a - b)) {
    const strings = byFinger.get(fg);
    const sameFret = strings.every((s) => frets[s] === frets[strings[0]]);
    let text;
    if (strings.length === 1) text = `${frets[strings[0]]}-й лад, ${where(strings[0])}`;
    else if (sameFret) {
      const names = strings.map((s) => STRING_NAMES[s]).join(', ');
      text = `баррэ на ${frets[strings[0]]}-м ладу: ложится плашмя на струны ${names}`;
    } else text = strings.map((s) => `${frets[s]}-й лад на ${STRING_NAMES[s]}`).join(' и ');
    hints.push({ finger: fg, title: FINGER_NAME[fg] ?? `Палец ${fg}`, text });
  }
  for (const s of loose) hints.push({ finger: 0, title: 'Любой удобный палец', text: `${frets[s]}-й лад, ${where(s)}` });

  const open = [];
  const muted = [];
  frets.forEach((f, s) => {
    if (f === 0) open.push(STRING_NAMES[s]);
    else if (f < 0) muted.push(STRING_NAMES[s]);
  });
  if (open.length === 4) hints.push({ finger: 0, title: 'Без пальцев', text: 'все струны открытые — просто бей по ним' });
  else if (open.length) {
    const many = open.length > 1;
    hints.push({
      finger: 0,
      title: many ? 'Открытые' : 'Открытая',
      text: `${many ? 'струны' : 'струна'} ${open.join(', ')} — не задевай ${many ? 'их' : 'её'}, пусть звенят`,
    });
  }
  if (muted.length) {
    const many = muted.length > 1;
    hints.push({
      finger: 0,
      title: 'Глушим',
      text: `${many ? 'струны' : 'струна'} ${muted.join(', ')} не ${many ? 'звучат' : 'звучит'} — приглуши слегка пальцем`,
    });
  }
  return hints;
}

/** Короткие советы, когда аккорд не звучит. */
export const CHORD_TIPS = Object.freeze([
  'Прижимай у самой ладовой пластинки, а не посередине лада.',
  'Ставь пальцы кончиками, почти вертикально — так они не глушат соседние струны.',
  'Большой палец — за грифом, напротив среднего. Гриф не обхватывай.',
  'Дёрни струны по одной и найди глухую — дело обычно в одном пальце.',
  'Жми ровно так, чтобы звенело. Подушечки окрепнут за пару недель.',
]);

/**
 * Совет к паре для OMC: общий палец — якорь, иначе один из общих советов по дню.
 * @param {{frets: number[], fingers: number[]}|null} sa
 * @param {{frets: number[], fingers: number[]}|null} sb
 * @param {number} [seed] например номер дня
 * @returns {string}
 */
export function omcTip(sa, sb, seed = 0) {
  if (sa && sb) {
    for (let s = 0; s < 4; s++) {
      const f = sa.frets[s];
      if (f > 0 && f === sb.frets[s] && sa.fingers?.[s] && sa.fingers[s] === sb.fingers?.[s]) {
        return `${FINGER_NAME[sa.fingers[s]]} палец на ${STRING_NAMES[s]}, ${f}-й лад, общий — не отрывай его, это якорь.`;
      }
    }
  }
  const tips = [
    'Смотри на следующий аккорд раньше, чем убираешь пальцы.',
    'Не поднимай пальцы высоко — держи их прямо над струнами.',
    'Переставляй все пальцы разом, одним движением.',
    'Сначала скорость смены, чистота догонит.',
  ];
  return tips[((Math.floor(seed) % tips.length) + tips.length) % tips.length];
}

/**
 * Итог «смен за минуту» для карточки результата.
 * @param {{count: number, best: number, prevBest: number, record: boolean, first: boolean, target: number, reached: boolean}} r
 *   результат recordOmc
 * @returns {{tone: 'record'|'first'|'good'|'plain', title: string, lines: {ok?: boolean, text: string}[]}}
 */
export function omcSummary(r) {
  const n = Math.max(0, Math.round(r.count || 0));
  const lines = [];
  let tone = 'plain';
  let title;
  if (r.first) {
    tone = 'first';
    title = 'Первый замер';
    lines.push({ text: 'Теперь есть с чем сравнивать.' });
  } else if (r.record) {
    tone = 'record';
    title = 'Новый рекорд';
    const d = n - r.prevBest;
    lines.push({ ok: true, text: `На ${d} ${plural(d, ['смену', 'смены', 'смен'])} больше прошлого рекорда (${r.prevBest})` });
  } else if (n === r.best) {
    tone = 'good';
    title = 'Ровно как рекорд';
    lines.push({ ok: true, text: `Рекорд ${r.best} — повторён` });
  } else {
    title = n >= r.best * 0.9 ? 'Почти рекорд' : 'Засчитано';
    const d = r.best - n;
    lines.push({ text: `До рекорда ${d} ${plural(d, ['смена', 'смены', 'смен'])} (рекорд ${r.best})` });
  }
  if (r.target > 0) {
    if (r.reached) {
      if (tone === 'plain') tone = 'good';
      lines.push({ ok: true, text: `Цель ${r.target} — есть` });
    } else {
      const d = r.target - n;
      lines.push({ text: `До цели ${r.target} осталось ${d}` });
    }
  }
  return { tone, title, lines };
}

/**
 * Перемешивание (Фишер — Йейтс), новый массив.
 * @template T
 * @param {T[]} list
 * @param {() => number} [rand]
 * @returns {T[]}
 */
export function shuffle(list, rand = Math.random) {
  const a = [...(list ?? [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- тюнер ----------

/**
 * Подсказка тюнера по отклонению от струны.
 * @param {number|null} cents stringCents (минус — ниже)
 * @param {boolean} inTune
 * @returns {string} '' — нечего показать
 */
export function centsText(cents, inTune) {
  if (cents == null || !Number.isFinite(cents)) return '';
  if (inTune) return 'в строю ✓';
  const c = Math.round(Math.abs(cents));
  if (c >= 100) return cents > 0 ? 'сильно выше — ослабь' : 'сильно ниже — подтяни';
  const word = plural(c, ['цент', 'цента', 'центов']);
  return cents > 0 ? `выше на ${c} ${word} — ослабь` : `ниже на ${c} ${word} — подтяни`;
}

/**
 * Угол стрелки тюнера: ±range центов → ±maxDeg градусов, дальше упирается в край.
 * @param {number|null} cents
 * @param {{range?: number, maxDeg?: number}} [opts]
 * @returns {number}
 */
export function needleAngle(cents, { range = 50, maxDeg = 60 } = {}) {
  if (cents == null || !Number.isFinite(cents)) return 0;
  return (clamp(cents, -range, range) / range) * maxDeg;
}

/**
 * Отмечает струны, которые продержались в строю holdMs подряд.
 * push возвращает имя струны в момент, когда она впервые засчитана, иначе null.
 * @param {{holdMs?: number}} [opts]
 * @returns {{push(string: string|null, inTune: boolean, nowMs: number): string|null, reset(): void,
 *            readonly done: Set<string>}}
 */
export function createInTuneTracker({ holdMs = 500 } = {}) {
  let cur = null;
  let since = 0;
  const done = new Set();
  return {
    push(string, inTune, now) {
      if (!string || !inTune) {
        cur = null;
        return null;
      }
      if (string !== cur) {
        cur = string;
        since = now;
        return null;
      }
      if (now - since >= holdMs && !done.has(string)) {
        done.add(string);
        return string;
      }
      return null;
    },
    reset() {
      cur = null;
      done.clear();
    },
    get done() {
      return done;
    },
  };
}
