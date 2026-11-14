// Учебный путь для экранов «Учёба», «Урок» и «Знакомство»: где продолжить, состояние уровней, что открывает уровень,
// подписи шагов, учёт активного времени. Чистый модуль: без DOM и без state.js — работает в node --test.

import { LEVELS, LESSONS, isLessonDone, levelProgress, nextLesson, knownChordsAfter } from '../core/curriculum.js';
import { bestKey } from '../core/playable.js';

/** @typedef {import('../core/curriculum.js').Lesson} Lesson */
/** @typedef {import('../core/curriculum.js').Level} Level */
/** @typedef {{lessonsDone?: Record<string, string>}} ProgressLike */

/** Все уроки пути по порядку (только существующие). */
export const LESSON_ORDER = Object.freeze(LEVELS.flatMap((l) => l.lessons).filter((id) => LESSONS[id]));

/** Аккорды для «уже немного играю»: основные аккорды L0–L3. */
export const BEGINNER_CHORDS = Object.freeze(LEVELS.slice(0, 4).flatMap((l) => l.chords));

/** Варианты длины занятия в день. */
export const SESSION_OPTIONS = Object.freeze([
  { minutes: 5, text: 'Минимум: тюнер, смены и песня. Серия не прервётся.' },
  { minutes: 10, text: 'Спокойно: ещё разминка и бой.', recommended: true },
  { minutes: 18, text: 'Полное занятие: новинка, смены, бой и песня.' },
]);

/** Сколько песен открывают аккорды к концу уровня (PLAN.md, раздел 1: доля песен с транспонированием). */
const COVERAGE = {
  L0: { share: null, text: 'Двух аккордов уже хватает на первые песни.' },
  L1: { share: 20, text: 'Четыре аккорда открывают около 20 % песен, а ещё 45 % не хватает всего одного.' },
  L2: { share: 40, text: 'С Dm и Em играется уже около 40 % песен.' },
  L3: { share: 70, text: 'С ними — около 70 % песен и почти вся русская классика на Am–Dm–E7.' },
  L4: { share: 75, text: 'Первое баррэ доводит до 75 % песен.' },
  L5: { share: 80, text: 'Около 80 % песен — почти любая в гитарной тональности.' },
  L6: { share: null, text: 'Подвижные формы: любая тональность и почти любой аккорд.' },
};

/**
 * Номер уровня из id: 'L3' → 3.
 * @param {string|{id: string}|null|undefined} level
 * @returns {number|null}
 */
export function levelNumber(level) {
  const id = typeof level === 'string' ? level : level?.id;
  const m = /^L(\d+)$/.exec(id ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Мотивация уровня: сколько песен открывается.
 * @param {string} levelId
 * @returns {{share: number|null, text: string}|null}
 */
export function levelCoverage(levelId) {
  return COVERAGE[levelId] ?? null;
}

const firstUndone = (progress, level) => level.lessons.find((id) => LESSONS[id] && !isLessonDone(progress, id)) ?? null;

/**
 * Урок, с которого продолжить. Обычно — первый непройденный по порядку пути. Но уровень пропускается, если в нём
 * ничего не пройдено, все его аккорды уже знакомы и ученик либо уже занимается дальше по пути, либо ещё ничего не проходил
 * (так «уже немного играю» сразу попадает на нужный уровень, а случайно открытый урок впереди не уводит с текущего).
 * @param {ProgressLike} progress
 * @param {Iterable<string>} [knownNames]
 * @returns {Lesson|null} null — весь путь пройден
 */
export function continueLesson(progress, knownNames = []) {
  const known = new Set(knownNames);
  const states = LEVELS.map((l) => levelProgress(progress, l.id));
  let lastTouched = -1;
  states.forEach((s, i) => {
    if (s.done > 0) lastTouched = i;
  });
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const s = states[i];
    if (s.complete || s.total === 0) continue;
    const chordsKnown = level.chords.length > 0 && level.chords.every((c) => known.has(c));
    if (s.done === 0 && chordsKnown && (lastTouched === -1 || i < lastTouched)) continue;
    const id = firstUndone(progress, level);
    if (id) return LESSONS[id];
  }
  return nextLesson(progress);
}

/**
 * Следующий урок после только что пройденного: первый непройденный дальше по пути, иначе — где продолжить.
 * @param {ProgressLike} progress прогресс уже с пройденным уроком
 * @param {string} lessonId
 * @param {Iterable<string>} [knownNames]
 * @returns {Lesson|null}
 */
export function nextLessonAfter(progress, lessonId, knownNames = []) {
  const idx = LESSON_ORDER.indexOf(lessonId);
  if (idx >= 0) {
    for (let k = idx + 1; k < LESSON_ORDER.length; k++) {
      if (!isLessonDone(progress, LESSON_ORDER[k])) return LESSONS[LESSON_ORDER[k]];
    }
  }
  const next = continueLesson(progress, knownNames);
  return next && next.id !== lessonId ? next : null;
}

/**
 * @typedef {'done'|'current'|'open'|'ahead'} LevelState
 *   done — все уроки пройдены; current — здесь продолжаем; open — позади текущего, но не закончен (пропущен);
 *   ahead — впереди (мягко закрыт, но открывается)
 */

/**
 * Модель пути для экрана «Учёба».
 * @param {ProgressLike} progress
 * @param {Iterable<string>} [knownNames]
 * @returns {{next: Lesson|null, focusId: string, done: number, total: number,
 *            levels: Array<{level: Level, done: number, total: number, complete: boolean, state: LevelState, nextId: string|null}>}}
 */
export function pathModel(progress, knownNames = []) {
  const next = continueLesson(progress, knownNames);
  const focusId = next?.levelId ?? LEVELS[LEVELS.length - 1].id;
  const focusIdx = LEVELS.findIndex((l) => l.id === focusId);
  const levels = LEVELS.map((level, i) => {
    const p = levelProgress(progress, level.id);
    /** @type {LevelState} */
    let state = 'ahead';
    if (p.complete) state = 'done';
    else if (level.id === focusId) state = 'current';
    else if (i < focusIdx || p.done > 0) state = 'open';
    return { level, ...p, state, nextId: firstUndone(progress, level) };
  });
  const done = LESSON_ORDER.filter((id) => isLessonDone(progress, id)).length;
  return { next, focusId, done, total: LESSON_ORDER.length, levels };
}

/**
 * Аккорды, которые урок учит (шаги «аккорд»), без повторов.
 * @param {Lesson|null|undefined} lesson
 * @returns {string[]}
 */
export function lessonChords(lesson) {
  return [...new Set((lesson?.steps ?? []).filter((s) => s.type === 'chord' && s.chord).map((s) => s.chord))];
}

/**
 * Аккорды урока, которых не было среди знакомых до начала урока.
 * @param {Lesson|null|undefined} lesson
 * @param {Iterable<string>} knownBefore
 * @returns {string[]}
 */
export function newChordsOf(lesson, knownBefore) {
  const before = new Set(knownBefore);
  return lessonChords(lesson).filter((c) => !before.has(c));
}

/**
 * Что внутри урока, коротко: аккорды и виды практики — для строки в списке уроков.
 * @param {Lesson} lesson
 * @returns {{chords: string[], parts: string[]}}
 */
export function lessonTags(lesson) {
  const types = new Set((lesson?.steps ?? []).map((s) => s.type));
  const parts = [];
  if (types.has('tuner')) parts.push('тюнер');
  if (types.has('strum')) parts.push('бой');
  if (types.has('omc')) parts.push('смены');
  if (types.has('quiz')) parts.push('разминка');
  if (types.has('song')) parts.push('песня');
  return { chords: lessonChords(lesson), parts };
}

const STEP_LABELS = {
  text: 'Коротко',
  tuner: 'Настройка',
  chord: 'Новый аккорд',
  quiz: 'Вспоминаем',
  omc: 'Смены за минуту',
  strum: 'Бой',
  song: 'Песня',
};

/**
 * Подпись шага для прогресса урока.
 * @param {import('../core/curriculum.js').Step} step
 * @returns {string}
 */
export function stepLabel(step) {
  if (step?.type === 'text' && step.title) return step.title;
  return STEP_LABELS[step?.type] ?? 'Шаг';
}

/**
 * Текст шага — абзацы через пустую строку.
 * @param {string} body
 * @returns {string[]}
 */
export function paragraphs(body) {
  return String(body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Часы «активного» времени: идут, только пока страница видна. Время передаётся снаружи (мс), чтобы легко тестировать.
 * @param {number} now
 * @param {boolean} [visible]
 * @returns {{pause(t: number): void, resume(t: number): void, elapsed(t: number): number, readonly running: boolean}}
 */
export function createActiveClock(now, visible = true) {
  let total = 0;
  let since = visible ? now : null;
  return {
    pause(t) {
      if (since == null) return;
      total += Math.max(0, t - since);
      since = null;
    },
    resume(t) {
      if (since == null) since = t;
    },
    elapsed(t) {
      return total + (since == null ? 0 : Math.max(0, t - since));
    },
    get running() {
      return since != null;
    },
  };
}

/** Больше часа на урок не засчитываем: скорее всего, телефон просто остался открытым. */
export const MAX_LESSON_SECONDS = 60 * 60;

/**
 * Миллисекунды → секунды для logPractice (округление, не больше MAX_LESSON_SECONDS).
 * @param {number} ms
 * @returns {number}
 */
export function practiceSeconds(ms) {
  return Math.min(MAX_LESSON_SECONDS, Math.max(0, Math.round((Number(ms) || 0) / 1000)));
}

/**
 * Сколько песен из библиотеки играбельны с аккордами к концу каждого уровня (с подбором тональности) и сколько
 * добавляет сам уровень.
 * @param {Array<string[]|null|undefined>} songChordLists
 * @returns {Record<string, {playable: number, gained: number, total: number}>}
 */
export function libraryUnlocks(songChordLists) {
  const lists = (songChordLists ?? []).filter((l) => Array.isArray(l) && l.length > 0);
  /** @type {Record<string, {playable: number, gained: number, total: number}>} */
  const out = {};
  let prev = 0;
  for (const level of LEVELS) {
    const known = knownChordsAfter(level.id);
    const playable = lists.filter((names) => bestKey(names, known).playable).length;
    out[level.id] = { playable, gained: Math.max(0, playable - prev), total: lists.length };
    prev = Math.max(prev, playable);
  }
  return out;
}

/**
 * Время из поля <input type="time">: '07:30' → {hour: 7, minute: 30}; неверное → null.
 * @param {string} s
 * @returns {{hour: number, minute: number}|null}
 */
export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Ссылка на занятие дня для напоминания: адрес приложения без hash + '#/practice'.
 * @param {string} href location.href
 * @returns {string}
 */
export function practiceUrl(href) {
  return `${String(href ?? '').split('#')[0]}#/practice`;
}
