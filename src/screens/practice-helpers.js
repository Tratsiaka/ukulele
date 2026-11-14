// Чистые помощники экранов «Сегодня» и «Занятие»: неделя, рекорды, учёба, учёт времени занятия, итог.
// Без DOM и сигналов — работают в node --test.

import { addDays, weekStart } from '../core/progress.js';
import { bestKey, nextChordGains } from '../core/playable.js';
import { currentLevel, lessonById, levelProgress, nextLesson, strumById } from '../core/curriculum.js';

/** @typedef {import('../state.js').Progress} Progress */
/** @typedef {import('../state.js').SongRecord} SongRecord */

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WEEKDAYS_AT = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября',
  'ноября', 'декабря'];

const parseDay = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};
const dow = (day) => (parseDay(day).getUTCDay() + 6) % 7; // 0 = понедельник

/**
 * Дата для шапки: 'суббота, 14 ноября'.
 * @param {string} day 'YYYY-MM-DD'
 * @returns {string}
 */
export function formatLongDate(day) {
  const d = parseDay(day);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS_LONG[dow(day)]}, ${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;
}

/**
 * @typedef {{day: string, label: string, state: 'done'|'frozen'|'today'|'missed'|'future'|'before', isToday: boolean,
 *            seconds: number}} WeekDay
 */

/**
 * Полоска недели пн–вс. done — день засчитан в серию; frozen — закрыт заморозкой; today — сегодня, ещё не засчитан;
 * missed — прошедший день без занятий; future — ещё не наступил; before — до самого первого занятия (не пропуск).
 * @param {{today: string, activeDays: Iterable<string>, frozen?: Iterable<string>,
 *          practice?: Record<string, {seconds: number}>}} opts
 * @returns {WeekDay[]}
 */
export function weekStrip({ today, activeDays, frozen = [], practice = {} }) {
  const done = new Set(activeDays);
  const since = [...done].sort()[0] ?? today;
  const ice = new Set(frozen);
  const monday = weekStart(today);
  return WEEKDAYS_SHORT.map((label, i) => {
    const day = addDays(monday, i);
    const isToday = day === today;
    let state;
    if (done.has(day)) state = 'done';
    else if (ice.has(day)) state = 'frozen';
    else if (isToday) state = 'today';
    else if (day > today) state = 'future';
    else if (day < since) state = 'before';
    else state = 'missed';
    return { day, label, state, isToday, seconds: practice?.[day]?.seconds ?? 0 };
  });
}

/**
 * Недельная цель в минутах.
 * @param {number} weekSeconds
 * @param {number} goalSeconds
 * @returns {{ratio: number, minutes: number, goalMinutes: number, reached: boolean, leftMinutes: number}}
 */
export function weekGoal(weekSeconds, goalSeconds) {
  const sec = Math.max(0, Number(weekSeconds) || 0);
  const goal = Math.max(60, Number(goalSeconds) || 0);
  const minutes = Math.floor(sec / 60);
  const goalMinutes = Math.round(goal / 60);
  return {
    ratio: Math.min(1, sec / goal),
    minutes,
    goalMinutes,
    reached: sec >= goal,
    leftMinutes: Math.max(0, goalMinutes - minutes),
  };
}

/**
 * Подсказка про заморозку: сработала на этой неделе, есть в запасе или потрачена.
 * @param {{today: string, frozen?: string[], freezesLeft?: number, streak?: number}} opts
 * @returns {{kind: 'used'|'ready'|'spent', text: string}|null} null — серии нет, подсказка не нужна
 */
export function freezeHint({ today, frozen = [], freezesLeft = 0, streak = 0 }) {
  const monday = weekStart(today);
  const thisWeek = frozen.filter((d) => d >= monday && d <= today);
  if (thisWeek.length) {
    const last = thisWeek[thisWeek.length - 1];
    const when = last === addDays(today, -1) ? 'вчера' : WEEKDAYS_AT[dow(last)];
    return { kind: 'used', text: `Заморозка спасла серию ${when}. Новая — с понедельника.` };
  }
  if (streak <= 0) return null;
  if (freezesLeft > 0) return { kind: 'ready', text: 'Есть заморозка: один пропуск на этой неделе не оборвёт серию.' };
  return { kind: 'spent', text: 'Заморозка на этой неделе потрачена. Новая — с понедельника.' };
}

/**
 * Первый день: ещё ни одного занятия и ни одного урока.
 * @param {Progress} p
 * @returns {boolean}
 */
export function isFirstDay(p) {
  const practiced = Object.values(p?.practice ?? {}).some((v) => (v?.seconds ?? 0) > 0);
  return !practiced && Object.keys(p?.lessonsDone ?? {}).length === 0;
}

/**
 * Карточка «Учиться»: текущий уровень, его прогресс и следующий урок.
 * @param {Progress} p
 * @returns {{levelId: string, levelTitle: string, levelNumber: number, done: number, total: number, ratio: number,
 *            lesson: {id: string, title: string, minutes: number}|null, finished: boolean}}
 */
export function learnSummary(p) {
  const level = currentLevel(p);
  const lp = levelProgress(p, level.id);
  const lesson = nextLesson(p);
  return {
    levelId: level.id,
    levelTitle: level.title,
    levelNumber: Number(String(level.id).replace(/\D/g, '')) || 0,
    done: lp.done,
    total: lp.total,
    ratio: lp.total ? lp.done / lp.total : 0,
    lesson: lesson ? { id: lesson.id, title: lesson.title, minutes: lesson.minutes } : null,
    finished: !lesson,
  };
}

/** Этапы тренировки песни (порядок как в SongTrainer). */
export const TRAINER_STAGES = /** @type {const} */ ([
  { key: 'chords', label: 'Аккорды' },
  { key: 'changes', label: 'Смены' },
  { key: 'strum', label: 'Ритм' },
  { key: 'play', label: 'Играем' },
]);

/**
 * Этапы тренировки песни из record.trainer.
 * @param {SongRecord|null|undefined} rec
 * @returns {{stages: {key: string, label: string, done: boolean}[], done: number, next: string|null}}
 */
export function trainerStages(rec) {
  const t = rec?.trainer ?? {};
  const stages = TRAINER_STAGES.map((s) => ({ ...s, done: Boolean(t[s.key]) }));
  const next = stages.find((s) => !s.done)?.label ?? null;
  return { stages, done: stages.filter((s) => s.done).length, next };
}

/**
 * «Играю сейчас»: песни со статусом «учу» или «играю», недавно игранные сверху.
 * @param {SongRecord[]} songs
 * @param {number} [n]
 * @returns {SongRecord[]}
 */
export function nowPlaying(songs, n = 5) {
  return (songs ?? [])
    .filter((s) => s && !s.deleted && (s.status === 'learning' || s.status === 'playing'))
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, Math.max(0, n));
}

/**
 * Сколько песен играбельны целиком известными аккордами (со сдвигом ±5).
 * @param {SongRecord[]} songs
 * @param {string[]} knownNames
 * @returns {number}
 */
export function playableCount(songs, knownNames) {
  if (!knownNames?.length) return 0;
  let n = 0;
  for (const s of songs ?? []) {
    if (s && !s.deleted && s.chords?.length && bestKey(s.chords, knownNames).playable) n++;
  }
  return n;
}

/**
 * Сводка рекордов для главной: топ-3 пары OMC, лучший темп боя, «можешь сыграть N песен» и следующий аккорд.
 * @param {Progress} p
 * @param {SongRecord[]} songs
 * @param {string[]} knownNames
 * @returns {{omcTop: {a: string, b: string, best: number}[], strumBest: {patternId: string, name: string, bpm: number}|null,
 *            playable: number, nextChord: {chord: string, gain: number}|null, empty: boolean}}
 */
export function recordsSummary(p, songs, knownNames) {
  const omcTop = Object.entries(p?.pairs ?? {})
    .map(([key, r]) => {
      const [a, b] = key.split('|');
      return { a, b, best: r?.best ?? 0 };
    })
    .filter((x) => x.a && x.b && x.best > 0)
    .sort((x, y) => y.best - x.best || (x.a + x.b).localeCompare(y.a + y.b))
    .slice(0, 3);

  let strumBest = null;
  for (const [patternId, r] of Object.entries(p?.strum ?? {})) {
    const bpm = r?.bestBpm ?? 0;
    if (bpm > 0 && (!strumBest || bpm > strumBest.bpm)) {
      strumBest = { patternId, name: strumById(patternId)?.name ?? patternId, bpm };
    }
  }

  const live = (songs ?? []).filter((s) => s && !s.deleted);
  const playable = playableCount(live, knownNames ?? []);
  const gains = live.length ? nextChordGains(live.map((s) => s.chords ?? []), knownNames ?? []) : [];
  const top = gains.find((g) => g.gain > 0);
  return {
    omcTop,
    strumBest,
    playable,
    nextChord: top ? { chord: top.chord, gain: top.gain } : null,
    empty: !omcTop.length && !strumBest,
  };
}

// ---------- учёт времени занятия ----------

/** @typedef {{acc: number, since: number|null}} Clock  acc — накоплено мс; since — с какого момента идёт (null — пауза) */

/**
 * Часы занятия, сразу запущенные.
 * @param {number} now мс
 * @returns {Clock}
 */
export function clockStart(now) {
  return { acc: 0, since: now };
}

/**
 * Пауза (вкладка скрыта). Повторная пауза ничего не меняет.
 * @param {Clock} c
 * @param {number} now
 * @returns {Clock}
 */
export function clockPause(c, now) {
  if (c.since == null) return c;
  return { acc: c.acc + Math.max(0, now - c.since), since: null };
}

/**
 * Продолжить после паузы. Если часы уже идут — без изменений.
 * @param {Clock} c
 * @param {number} now
 * @returns {Clock}
 */
export function clockResume(c, now) {
  return c.since == null ? { acc: c.acc, since: now } : c;
}

/**
 * Сколько мс накоплено к моменту now.
 * @param {Clock} c
 * @param {number} now
 * @returns {number}
 */
export function clockMs(c, now) {
  return c.acc + (c.since == null ? 0 : Math.max(0, now - c.since));
}

/**
 * Секунды активного времени (вниз).
 * @param {Clock} c
 * @param {number} now
 * @returns {number}
 */
export function clockSeconds(c, now) {
  return Math.floor(clockMs(c, now) / 1000);
}

/** Сколько секунд занятия нужно, чтобы при закрытии спросить подтверждение и засчитать время. */
export const CONFIRM_CLOSE_SECONDS = 60;

/**
 * Что делать при закрытии занятия посередине.
 * @param {number} elapsedSec
 * @returns {{confirm: boolean, logSeconds: number}} confirm — спросить; logSeconds — сколько засчитать (0 — ничего)
 */
export function closePolicy(elapsedSec) {
  const sec = Math.max(0, Math.floor(Number(elapsedSec) || 0));
  return sec > CONFIRM_CLOSE_SECONDS ? { confirm: true, logSeconds: sec } : { confirm: false, logSeconds: 0 };
}

/**
 * Заполнение сегментов полосы блоков: пройденные и пропущенные — 1, текущий — доля прошедшего от плана, дальше — 0.
 * @param {{seconds: number}[]} blocks
 * @param {number} index текущий блок
 * @param {number} blockElapsedSec сколько идёт текущий блок
 * @returns {number[]}
 */
export function segmentFill(blocks, index, blockElapsedSec) {
  return blocks.map((b, i) => {
    if (i < index) return 1;
    if (i > index) return 0;
    const plan = Math.max(1, b.seconds || 0);
    return Math.min(1, Math.max(0, (Number(blockElapsedSec) || 0) / plan));
  });
}

/**
 * Плановая длительность занятия.
 * @param {{seconds: number}[]} blocks
 * @returns {number}
 */
export function plannedSeconds(blocks) {
  return (blocks ?? []).reduce((sum, b) => sum + (b.seconds || 0), 0);
}

// ---------- итог занятия ----------

/**
 * @typedef {{kind: 'omc', a: string, b: string, from: number, to: number, first: boolean}
 *         | {kind: 'strum', patternId: string, name: string, from: number, to: number, first: boolean}} SessionRecord
 * first — первый замер (сравнивать не с чем), иначе — побитый рекорд.
 */

/**
 * Рекорды, побитые за занятие (сравнение прогресса до и после). Первые замеры помечены first.
 * @param {Progress} before
 * @param {Progress} after
 * @returns {SessionRecord[]} сначала рекорды, потом первые замеры
 */
export function brokenRecords(before, after) {
  const out = [];
  for (const [key, r] of Object.entries(after?.pairs ?? {})) {
    const from = before?.pairs?.[key]?.best ?? 0;
    const to = r?.best ?? 0;
    if (to > from) {
      const [a, b] = key.split('|');
      out.push({ kind: 'omc', a, b, from, to, first: from === 0 });
    }
  }
  for (const [patternId, r] of Object.entries(after?.strum ?? {})) {
    const from = before?.strum?.[patternId]?.bestBpm ?? 0;
    const to = r?.bestBpm ?? 0;
    if (to > from) out.push({ kind: 'strum', patternId, name: strumById(patternId)?.name ?? patternId, from, to, first: from === 0 });
  }
  return out.sort((x, y) => Number(x.first) - Number(y.first));
}

/**
 * Аккорды, выученные за занятие.
 * @param {Progress} before
 * @param {Progress} after
 * @returns {string[]}
 */
export function learnedChords(before, after) {
  const was = before?.knownChords ?? {};
  return Object.keys(after?.knownChords ?? {}).filter((name) => !was[name]);
}

/**
 * Сколько песен открылось: стало играбельно после занятия, хотя до него не было.
 * @param {SongRecord[]} songs
 * @param {string[]} knownBefore
 * @param {string[]} knownAfter
 * @returns {number}
 */
export function unlockedSongs(songs, knownBefore, knownAfter) {
  if (!knownAfter?.length) return 0;
  const before = new Set(knownBefore ?? []);
  if ((knownAfter ?? []).every((c) => before.has(c))) return 0;
  let n = 0;
  for (const s of songs ?? []) {
    if (!s || s.deleted || !s.chords?.length) continue;
    if (bestKey(s.chords, knownAfter).playable && !bestKey(s.chords, knownBefore ?? []).playable) n++;
  }
  return n;
}

/**
 * Как изменилась серия после занятия.
 * @param {{streak: number, doneToday: boolean}} before
 * @param {{streak: number, doneToday: boolean}} after
 * @returns {{from: number, to: number, grew: boolean, counted: boolean}} counted — сегодняшний день засчитан
 */
export function streakChange(before, after) {
  const from = before?.streak ?? 0;
  const to = after?.streak ?? 0;
  return { from, to, grew: !before?.doneToday && Boolean(after?.doneToday) && to > from, counted: Boolean(after?.doneToday) };
}

/**
 * Подпись пары для экрана.
 * @param {string} a
 * @param {string} b
 * @param {(name: string) => string} [label]
 * @returns {string}
 */
export function pairLabel(a, b, label = (x) => x) {
  return `${label(a)} ⇄ ${label(b)}`;
}

/**
 * Урок для блока «новое» без аккорда: название, длительность и короткое описание шагов.
 * @param {string} lessonId
 * @returns {{id: string, title: string, minutes: number, steps: string[]}|null}
 */
export function lessonPreview(lessonId) {
  const lesson = lessonById(lessonId);
  if (!lesson) return null;
  const names = { tuner: 'Тюнер', chord: 'Аккорд', quiz: 'Вспомнить аккорды', omc: 'Смены', strum: 'Бой', song: 'Песня' };
  const steps = [];
  for (const s of lesson.steps) {
    let text = names[s.type];
    if (!text) continue;
    if (s.type === 'chord') text = `Аккорд ${s.chord}`;
    if (s.type === 'omc') text = `Смены ${s.pair.join(' ⇄ ')}`;
    if (s.type === 'strum') text = `Бой: ${strumById(s.pattern)?.name ?? s.pattern}`;
    if (!steps.includes(text)) steps.push(text);
  }
  return { id: lesson.id, title: lesson.title, minutes: lesson.minutes, steps };
}
