// Прогресс ученика: дни занятий, Лейтнер, серия и чистые переходы состояния (reducer-функции).
// Всё здесь чистое: на входе старый progress и «сегодня», на выходе новый объект. Без DOM и IndexedDB.

import { lessonById } from './curriculum.js';

/** @typedef {import('../state.js').Progress} Progress */

/** День занятий начинается в 04:00 по местному времени. */
export const DAY_START_HOUR = 4;
/** Интервалы Лейтнера в днях: коробки 1–5. */
export const LEITNER_DAYS = [1, 3, 7, 14, 30];
/** Сколько секунд за день нужно, чтобы день засчитался в серию. Пройденный урок засчитывает день и так. */
export const MIN_DAY_SECONDS = 60;
// Сколько точек истории хранить у пары или боя (по одной на день).
const HISTORY_LIMIT = 180;

const pad = (n) => String(n).padStart(2, '0');
const fmtUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDay = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * День занятий 'YYYY-MM-DD': до 04:00 ещё идёт «вчера», чтобы ночное занятие не рвало серию.
 * @param {Date} [date]
 * @returns {string}
 */
export function practiceDay(date = new Date()) {
  const shift = date.getHours() < DAY_START_HOUR ? 1 : 0;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Сдвиг дня на n дней.
 * @param {string} day 'YYYY-MM-DD'
 * @param {number} n
 * @returns {string}
 */
export function addDays(day, n) {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtUtc(d);
}

/**
 * Сколько дней от a до b (b − a).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function dayDiff(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

/**
 * Понедельник недели, в которую попадает день.
 * @param {string} day
 * @returns {string}
 */
export function weekStart(day) {
  const dow = (parseDay(day).getUTCDay() + 6) % 7; // 0 = понедельник
  return addDays(day, -dow);
}

/**
 * Шаг Лейтнера. box 0 — ещё не повторяли. Успех → следующая коробка, провал → коробка 1.
 * @param {number} box 0–5
 * @param {boolean} success
 * @returns {{box: number, days: number}} новая коробка и через сколько дней повторить
 */
export function leitner(box, success) {
  const b = success ? Math.min(Math.max(0, box | 0) + 1, LEITNER_DAYS.length) : 1;
  return { box: b, days: LEITNER_DAYS[b - 1] };
}

/**
 * Ключ пары аккордов без учёта порядка: pairKey('G', 'C') === 'C|G'.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function daysStrictlyBetween(a, b) {
  const out = [];
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Серия дней с заморозками. Пропуск закрывается заморозкой, если на его неделе (пн–вс) они ещё остались;
 * пропуск из нескольких дней закрывается, только если хватает на все дни, иначе серия обнуляется.
 * Сегодняшний день пропуском не считается, пока он не закончился. Замороженные дни в длину серии не входят.
 * @param {string[]} days дни с занятиями 'YYYY-MM-DD'
 * @param {string} today
 * @param {{freezesPerWeek?: number}} [opts]
 * @returns {{current: number, best: number, doneToday: boolean, frozen: string[], freezesLeft: number}}
 */
export function streak(days, today, { freezesPerWeek = 1 } = {}) {
  const sorted = [...new Set(days)].filter((d) => d <= today).sort();
  const doneToday = sorted.includes(today);
  const used = new Map(); // понедельник → сколько заморозок потрачено
  const frozen = [];
  const cover = (gap) => {
    const need = new Map();
    for (const d of gap) {
      const w = weekStart(d);
      need.set(w, (need.get(w) ?? 0) + 1);
      if ((used.get(w) ?? 0) + need.get(w) > freezesPerWeek) return false;
    }
    for (const [w, n] of need) used.set(w, (used.get(w) ?? 0) + n);
    frozen.push(...gap);
    return true;
  };

  let run = 0;
  let best = 0;
  let prev = null;
  for (const d of sorted) {
    if (prev && !cover(daysStrictlyBetween(prev, d))) run = 0;
    run += 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = run;
  // Открытый хвост: от последнего занятия до вчера включительно.
  if (prev && !doneToday) {
    const gap = daysStrictlyBetween(prev, today);
    if (gap.length && !cover(gap)) current = 0;
  }
  const freezesLeft = Math.max(0, freezesPerWeek - (used.get(weekStart(today)) ?? 0));
  return { current, best, doneToday, frozen, freezesLeft };
}

/**
 * Пустой прогресс нового ученика.
 * @returns {Progress}
 */
export function defaultProgress() {
  return { knownChords: {}, pairs: {}, strum: {}, lessonsDone: {}, practice: {}, streakBest: 0, onboarded: false };
}

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Дополняет прогресс недостающими полями (старые версии, импорт).
 * @param {any} p
 * @returns {Progress}
 */
export function normalizeProgress(p) {
  const base = defaultProgress();
  if (!isObj(p)) return base;
  const out = { ...base, ...p };
  for (const k of ['knownChords', 'pairs', 'strum', 'lessonsDone', 'practice']) out[k] = isObj(p[k]) ? { ...p[k] } : {};
  out.streakBest = Number.isFinite(p.streakBest) ? p.streakBest : 0;
  out.onboarded = Boolean(p.onboarded);
  return out;
}

/**
 * Дни, которые засчитываются в серию: ≥ MIN_DAY_SECONDS занятий или пройденный урок.
 * @param {Progress} p
 * @returns {string[]} отсортированные дни
 */
export function activeDays(p) {
  const set = new Set();
  for (const [day, v] of Object.entries(p.practice ?? {})) if ((v?.seconds ?? 0) >= MIN_DAY_SECONDS) set.add(day);
  for (const day of Object.values(p.lessonsDone ?? {})) if (typeof day === 'string') set.add(day);
  return [...set].sort();
}

/**
 * Секунды занятий за неделю (пн–вс), в которую попадает today.
 * @param {Progress} p
 * @param {string} today
 * @returns {number}
 */
export function weekSeconds(p, today) {
  const from = weekStart(today);
  const to = addDays(from, 6);
  let sum = 0;
  for (const [day, v] of Object.entries(p.practice ?? {})) if (day >= from && day <= to) sum += v?.seconds ?? 0;
  return sum;
}

function withBest(p, today) {
  const s = streak(activeDays(p), today);
  return { ...p, streakBest: Math.max(p.streakBest ?? 0, s.best) };
}

// История «одна точка на день»: в тот же день оставляем лучшее значение.
function pushDaily(history, day, field, value) {
  const list = Array.isArray(history) ? history.slice() : [];
  const last = list[list.length - 1];
  if (last?.day === day) list[list.length - 1] = { ...last, [field]: Math.max(last[field] ?? 0, value) };
  else list.push({ day, [field]: value });
  return list.slice(-HISTORY_LIMIT);
}

/**
 * Отметить аккорд выученным или забыть его. Новый аккорд встаёт в коробку 1 с повтором завтра.
 * @param {Progress} p
 * @param {string} name нормализованное имя
 * @param {boolean} known
 * @param {string} today
 * @returns {Progress}
 */
export function applyChordKnown(p, name, known, today) {
  const knownChords = { ...p.knownChords };
  if (!known) delete knownChords[name];
  else if (!knownChords[name]) knownChords[name] = { since: today, box: 1, due: addDays(today, LEITNER_DAYS[0]) };
  else return p;
  return { ...p, knownChords };
}

/**
 * Повтор аккорда в разминке (самооценка «поставил по памяти» / «не вспомнил»).
 * Коробку меняет только первый повтор за день. Незнакомый аккорд при успехе становится известным.
 * @param {Progress} p
 * @param {string} name
 * @param {boolean} success
 * @param {string} today
 * @returns {Progress}
 */
export function applyChordReview(p, name, success, today) {
  const prev = p.knownChords[name];
  if (!prev && !success) return p;
  if (prev?.seen === today) return p;
  const r = leitner(prev?.box ?? 0, success);
  const rec = { since: prev?.since ?? today, box: r.box, due: addDays(today, r.days), seen: today };
  return { ...p, knownChords: { ...p.knownChords, [name]: rec } };
}

/**
 * Результат «смен за минуту». Лейтнер считается по первой попытке дня: успех — цель достигнута
 * и результат не упал больше чем на 20 % от прошлого; иначе пара возвращается в коробку 1.
 * @param {Progress} p
 * @param {string} a
 * @param {string} b
 * @param {number} count число смен
 * @param {{today: string, target?: number}} opts
 * @returns {Progress}
 */
export function applyOmc(p, a, b, count, { today, target = 30 }) {
  const key = pairKey(a, b);
  const prev = p.pairs[key];
  const n = Math.max(0, Math.round(Number(count) || 0));
  const history = prev?.history ?? [];
  let box = prev?.box ?? 0;
  let due = prev?.due ?? today;
  if (history[history.length - 1]?.day !== today) {
    const dropped = prev != null && prev.last > 0 && n < prev.last * 0.8;
    const r = leitner(box, n >= target && !dropped);
    box = r.box;
    due = addDays(today, r.days);
  }
  const rec = { best: Math.max(prev?.best ?? 0, n), last: n, history: pushDaily(history, today, 'count', n), box, due };
  return { ...p, pairs: { ...p.pairs, [key]: rec } };
}

/**
 * Темп, который удалось держать в бое.
 * @param {Progress} p
 * @param {string} patternId
 * @param {number} bpm
 * @param {string} today
 * @returns {Progress}
 */
export function applyStrum(p, patternId, bpm, today) {
  const prev = p.strum[patternId];
  const v = Math.max(0, Math.round(Number(bpm) || 0));
  const rec = { bestBpm: Math.max(prev?.bestBpm ?? 0, v), history: pushDaily(prev?.history, today, 'bpm', v) };
  return { ...p, strum: { ...p.strum, [patternId]: rec } };
}

/**
 * Добавить время занятий за день. session — считать ли это отдельным занятием.
 * @param {Progress} p
 * @param {number} seconds
 * @param {{today: string, session?: boolean}} opts
 * @returns {Progress}
 */
export function applyPractice(p, seconds, { today, session = true }) {
  const prev = p.practice[today] ?? { seconds: 0, sessions: 0 };
  const add = Math.max(0, Math.round(Number(seconds) || 0));
  const rec = { seconds: prev.seconds + add, sessions: prev.sessions + (session ? 1 : 0) };
  return withBest({ ...p, practice: { ...p.practice, [today]: rec } }, today);
}

/**
 * Урок пройден: запоминаем день (первый раз) и отмечаем выученными аккорды из его шагов-аккордов.
 * @param {Progress} p
 * @param {string} lessonId
 * @param {string} today
 * @returns {Progress}
 */
export function applyLessonDone(p, lessonId, today) {
  let next = { ...p, lessonsDone: { ...p.lessonsDone, [lessonId]: p.lessonsDone[lessonId] ?? today } };
  for (const step of lessonById(lessonId)?.steps ?? []) {
    if (step.type === 'chord') next = applyChordKnown(next, step.chord, true, today);
  }
  return withBest(next, today);
}

/**
 * Онбординг пройден.
 * @param {Progress} p
 * @returns {Progress}
 */
export function applyOnboarded(p) {
  return p.onboarded ? p : { ...p, onboarded: true };
}

function mergeHistory(a = [], b = [], field) {
  const byDay = new Map();
  for (const h of [...a, ...b]) {
    if (!h?.day) continue;
    const cur = byDay.get(h.day);
    if (!cur || (h[field] ?? 0) > (cur[field] ?? 0)) byDay.set(h.day, h);
  }
  return [...byDay.values()].sort((x, y) => (x.day < y.day ? -1 : 1)).slice(-HISTORY_LIMIT);
}

const lastDay = (rec) => rec?.history?.[rec.history.length - 1]?.day ?? '';

/**
 * Слияние двух прогрессов (импорт с другого устройства). Идемпотентно: рекорды — максимум,
 * история — объединение по дням, время за день — максимум, уроки — самая ранняя дата.
 * @param {Progress} a текущий
 * @param {Progress} b импортируемый
 * @returns {Progress}
 */
export function mergeProgress(a, b) {
  const x = normalizeProgress(a);
  const y = normalizeProgress(b);
  const out = { ...x };

  out.knownChords = { ...x.knownChords };
  for (const [name, r] of Object.entries(y.knownChords)) {
    const cur = out.knownChords[name];
    if (!cur || (r.box ?? 0) > (cur.box ?? 0) || ((r.box ?? 0) === (cur.box ?? 0) && (r.due ?? '') > (cur.due ?? ''))) {
      out.knownChords[name] = { ...r, since: cur?.since && cur.since < r.since ? cur.since : r.since };
    }
  }

  out.pairs = { ...x.pairs };
  for (const [key, r] of Object.entries(y.pairs)) {
    const cur = out.pairs[key];
    if (!cur) { out.pairs[key] = r; continue; }
    const newer = lastDay(r) > lastDay(cur) ? r : cur;
    out.pairs[key] = { ...newer, best: Math.max(cur.best ?? 0, r.best ?? 0), history: mergeHistory(cur.history, r.history, 'count') };
  }

  out.strum = { ...x.strum };
  for (const [id, r] of Object.entries(y.strum)) {
    const cur = out.strum[id];
    out.strum[id] = cur
      ? { bestBpm: Math.max(cur.bestBpm ?? 0, r.bestBpm ?? 0), history: mergeHistory(cur.history, r.history, 'bpm') }
      : r;
  }

  out.lessonsDone = { ...x.lessonsDone };
  for (const [id, day] of Object.entries(y.lessonsDone)) {
    if (!out.lessonsDone[id] || day < out.lessonsDone[id]) out.lessonsDone[id] = day;
  }

  out.practice = { ...x.practice };
  for (const [day, r] of Object.entries(y.practice)) {
    const cur = out.practice[day];
    out.practice[day] = cur
      ? { seconds: Math.max(cur.seconds ?? 0, r.seconds ?? 0), sessions: Math.max(cur.sessions ?? 0, r.sessions ?? 0) }
      : r;
  }

  out.streakBest = Math.max(x.streakBest, y.streakBest);
  out.onboarded = x.onboarded || y.onboarded;
  out.lastSongId = x.lastSongId ?? y.lastSongId;
  if (out.lastSongId === undefined) delete out.lastSongId;
  return out;
}
