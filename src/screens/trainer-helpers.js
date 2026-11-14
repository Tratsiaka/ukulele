// Тренировка песни: чистые помощники (этапы, аккорды песни, переходы, бой, статусы, учёт времени).
// Без DOM и без состояния приложения: работает в браузере и в node --test (tests/trainer/).

import { parseChord, QUALITY_FAMILY } from '../core/chord.js';
import { songChords, songPairs } from '../core/song.js';
import { simplifyName } from '../core/playable.js';
import { getShapes } from '../core/shapes.js';
import { STRUM_PATTERNS, currentLevel, levelById, strumById } from '../core/curriculum.js';
import { pairKey } from '../core/progress.js';

/** @typedef {import('../state.js').SongRecord} SongRecord */
/** @typedef {'chords'|'changes'|'strum'|'play'} StageId */
/**
 * @typedef {{chords: boolean, changes: boolean, strum: boolean, play: boolean, plays: number,
 *            pairs: string[], speed: number}} TrainerState
 * pairs и speed — дополнительные поля record.trainer (их пишет только тренировка):
 * pairs — ключи пар (pairKey), которые уже прогнали на этапе «Смены»; speed — самая высокая пройденная доля темпа.
 */

/** Этапы по порядку. @type {ReadonlyArray<{id: StageId, label: string}>} */
export const STAGES = Object.freeze([
  Object.freeze({ id: 'chords', label: 'Аккорды' }),
  Object.freeze({ id: 'changes', label: 'Смены' }),
  Object.freeze({ id: 'strum', label: 'Ритм' }),
  Object.freeze({ id: 'play', label: 'Играем' }),
]);
const STAGE_IDS = STAGES.map((s) => s.id);

/** Доли темпа на этапе «Играем». */
export const SPEED_STEPS = Object.freeze([0.6, 0.8, 1]);
/** Меньше — не записываем в занятия. */
export const MIN_LOG_SECONDS = 30;
/** После стольких игр предлагаем отметить песню отполированной. */
export const POLISH_PLAYS = 5;
/** Сколько переходов тренируем и сколько аккордов берём в бой. */
export const PAIRS_COUNT = 3;
export const PROGRESSION_SIZE = 4;

const FALLBACK_BPM = [60, 80];

// ---------- этапы ----------

/**
 * record.trainer в полном виде (недостающее — по умолчанию).
 * @param {Partial<TrainerState>|null|undefined} t
 * @returns {TrainerState}
 */
export function normalizeTrainer(t) {
  const src = t && typeof t === 'object' ? t : {};
  const plays = Math.max(0, Math.round(Number(src.plays) || 0));
  const speed = Number(src.speed);
  return {
    chords: Boolean(src.chords),
    changes: Boolean(src.changes),
    strum: Boolean(src.strum),
    play: Boolean(src.play),
    plays,
    pairs: Array.isArray(src.pairs) ? src.pairs.filter((k) => typeof k === 'string') : [],
    speed: Number.isFinite(speed) && speed > 0 ? Math.min(1, speed) : 0,
  };
}

/** @param {any} id @returns {id is StageId} */
export function isStage(id) {
  return STAGE_IDS.includes(id);
}

/**
 * Этапы с отметками «готово».
 * @param {Partial<TrainerState>|null|undefined} trainer
 * @returns {Array<{id: StageId, label: string, done: boolean, index: number}>}
 */
export function stageStates(trainer) {
  const t = normalizeTrainer(trainer);
  return STAGES.map((s, index) => ({ ...s, index, done: t[s.id] }));
}

/**
 * Какой этап открыть: первый непройденный; всё пройдено — «Играем».
 * @param {Partial<TrainerState>|null|undefined} trainer
 * @returns {StageId}
 */
export function firstOpenStage(trainer) {
  const t = normalizeTrainer(trainer);
  return STAGE_IDS.find((id) => !t[id]) ?? 'play';
}

/**
 * Сколько этапов пройдено.
 * @param {Partial<TrainerState>|null|undefined} trainer
 */
export function doneCount(trainer) {
  const t = normalizeTrainer(trainer);
  return STAGE_IDS.filter((id) => t[id]).length;
}

/**
 * Следующий этап после id (null — последний).
 * @param {StageId} id
 * @returns {StageId|null}
 */
export function nextStage(id) {
  const i = STAGE_IDS.indexOf(id);
  return i >= 0 && i < STAGE_IDS.length - 1 ? STAGE_IDS[i + 1] : null;
}

/**
 * Подпись этапа по id.
 * @param {StageId} id
 */
export function stageLabel(id) {
  return STAGES.find((s) => s.id === id)?.label ?? '';
}

// ---------- аккорды песни ----------

/**
 * Основная последовательность для боя: первые n разных аккордов песни (уже транспонированной/упрощённой).
 * @param {import('../core/song.js').Song|null|undefined} song
 * @param {number} [n]
 * @returns {string[]}
 */
export function mainProgression(song, n = PROGRESSION_SIZE) {
  if (!song) return [];
  return songChords(song).slice(0, Math.max(0, n));
}

/**
 * Самые частые переходы песни с ключами пар.
 * @param {import('../core/song.js').Song|null|undefined} song
 * @param {number} [n]
 * @returns {Array<{a: string, b: string, count: number, key: string}>}
 */
export function topPairs(song, n = PAIRS_COUNT) {
  if (!song) return [];
  return songPairs(song)
    .slice(0, Math.max(0, n))
    .map((p) => ({ ...p, key: pairKey(p.a, p.b) }));
}

// Чем заменить аккорд, если он сам не выучен: упрощение (Am7 → Am), 7 ↔ мажор, E/B → E7/B7 (как в playable.js).
function substituteFor(name, known) {
  const c = parseChord(name);
  if (!c) return null;
  const simple = simplifyName(name);
  const family = QUALITY_FAMILY[c.quality];
  const candidates = [simple];
  const root = simple.replace(/(m|7|dim7?)$/, '');
  if (family === 'maj' && (c.root === 4 || c.root === 11)) candidates.push(`${root}7`);
  if (family === 'dom7') candidates.push(root);
  return candidates.find((n) => n !== name && known.has(n)) ?? null;
}

/**
 * Что делать с каждым аккордом песни: known — выучен; sub — сыграешь знакомым (as); new — надо выучить;
 * noshape — аппликатуры нет (учить нечего, не мешает идти дальше).
 * @param {string[]} names аккорды песни (как показываются)
 * @param {Iterable<string>} knownNames
 * @param {(name: string) => boolean} [hasShape]
 * @returns {Array<{name: string, status: 'known'|'sub'|'new'|'noshape', as?: string}>}
 */
export function chordPlan(names, knownNames, hasShape = (n) => getShapes(n).length > 0) {
  const known = new Set(knownNames ?? []);
  const seen = new Set();
  const out = [];
  for (const name of names ?? []) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (known.has(name)) {
      out.push({ name, status: 'known' });
      continue;
    }
    const as = substituteFor(name, known);
    if (as) out.push({ name, status: 'sub', as });
    else if (!hasShape(name)) out.push({ name, status: 'noshape' });
    else out.push({ name, status: 'new' });
  }
  return out;
}

/**
 * Сводка плана: сколько всего, сколько уже можно играть, какие учить.
 * @param {ReturnType<typeof chordPlan>} plan
 * @returns {{total: number, ready: number, toLearn: string[], allReady: boolean}}
 */
export function chordSummary(plan) {
  const toLearn = plan.filter((c) => c.status === 'new').map((c) => c.name);
  const ready = plan.filter((c) => c.status === 'known' || c.status === 'sub').length;
  return { total: plan.length, ready, toLearn, allReady: toLearn.length === 0 };
}

// ---------- бой ----------

/**
 * Бой и стартовый темп: бой песни (record.strum), иначе бой текущего уровня; темп — из диапазона уровня боя,
 * а если есть рекорд в этом бою — рекорд, зажатый в этот диапазон.
 * @param {{strum?: string}|null|undefined} record
 * @param {any} progress
 * @returns {{patternId: string, bpm: number, range: [number, number]}}
 */
export function strumSetup(record, progress) {
  let pattern = strumById(record?.strum ?? '');
  if (!pattern) {
    try {
      pattern = strumById(currentLevel(progress ?? {}).strum);
    } catch {
      pattern = null;
    }
  }
  pattern ??= STRUM_PATTERNS[0];
  const lvl = levelById(pattern.level);
  const range = /** @type {[number, number]} */ (Array.isArray(lvl?.bpm) && lvl.bpm.length === 2 ? [...lvl.bpm] : [...FALLBACK_BPM]);
  const best = Number(progress?.strum?.[pattern.id]?.bestBpm) || 0;
  const bpm = best > 0 ? Math.min(range[1], Math.max(range[0], best)) : range[0];
  return { patternId: pattern.id, bpm, range };
}

// ---------- игра и статусы ----------

/**
 * Что поменять в песне при открытии тренировки: «новая» → «учу».
 * @param {{status?: string}|null|undefined} record
 * @returns {{status: 'learning'}|null}
 */
export function openPatch(record) {
  return record?.status === 'new' ? { status: 'learning' } : null;
}

/**
 * «60 %».
 * @param {number} f
 */
export function speedLabel(f) {
  return `${Math.round((Number(f) || 0) * 100)} %`;
}

/**
 * Ближайшая к f ступень темпа.
 * @param {number} f
 */
export function nearestSpeed(f) {
  const v = Number(f) || 0;
  return SPEED_STEPS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), SPEED_STEPS[0]);
}

/**
 * С какой скорости начать этап «Играем»: после 100 % — 100 %, иначе следующая после пройденной.
 * @param {Partial<TrainerState>|null|undefined} trainer
 * @returns {number}
 */
export function defaultSpeed(trainer) {
  const t = normalizeTrainer(trainer);
  if (t.play) return 1;
  return SPEED_STEPS.find((s) => s > t.speed + 1e-9) ?? 1;
}

/**
 * Итог одной игры (запись уже обновлена markSongPlayed: plays +1, «новая» → «учу»).
 * После 100 % — trainer.play и статус «играю» (отполированная остаётся отполированной).
 * @param {SongRecord|{status?: string, trainer?: Partial<TrainerState>}} record
 * @param {number} speed доля темпа этой игры
 * @returns {{patch: {trainer: Partial<TrainerState>, status?: 'playing'}, finished: boolean, next: number|null,
 *            plays: number, suggestPolish: boolean}}
 */
export function playOutcome(record, speed) {
  const t = normalizeTrainer(record?.trainer);
  const s = nearestSpeed(speed);
  const finished = s >= 1;
  /** @type {{trainer: Partial<TrainerState>, status?: 'playing'}} */
  const patch = { trainer: { speed: Math.max(t.speed, s) } };
  let status = record?.status ?? 'learning';
  if (finished) {
    patch.trainer.play = true;
    if (status !== 'polished' && status !== 'playing') {
      patch.status = 'playing';
      status = 'playing';
    }
  }
  const i = SPEED_STEPS.indexOf(s);
  const next = i >= 0 && i < SPEED_STEPS.length - 1 ? SPEED_STEPS[i + 1] : null;
  return { patch, finished, next, plays: t.plays, suggestPolish: shouldSuggestPolish({ status, trainer: t }) };
}

/**
 * Пора ли предложить «отполировано»: сыграна не меньше POLISH_PLAYS раз и ещё не отполирована.
 * @param {{status?: string, trainer?: Partial<TrainerState>}|null|undefined} record
 */
export function shouldSuggestPolish(record) {
  const t = normalizeTrainer(record?.trainer);
  return t.plays >= POLISH_PLAYS && record?.status !== 'polished';
}

/**
 * Пару прогнали на этапе «Смены»: добавить её ключ; когда прогнаны все пары песни — этап пройден.
 * @param {Partial<TrainerState>|null|undefined} trainer
 * @param {string} key pairKey
 * @param {string[]} allKeys ключи всех пар этапа
 * @returns {{pairs: string[], changes?: true}}
 */
export function pairDrilledPatch(trainer, key, allKeys) {
  const t = normalizeTrainer(trainer);
  const pairs = t.pairs.includes(key) ? t.pairs : [...t.pairs, key];
  const done = new Set(pairs);
  const out = { pairs };
  if ((allKeys ?? []).every((k) => done.has(k))) out.changes = true;
  return out;
}

// ---------- учёт времени ----------

/**
 * Счётчик активного времени тренировки. take() отдаёт время для logPractice: первый раз — как занятие
 * (не раньше minSeconds), потом — просто добавочное время без нового занятия.
 * @param {{minSeconds?: number}} [opts]
 */
export function createPracticeClock({ minSeconds = MIN_LOG_SECONDS } = {}) {
  let pending = 0;
  let logged = false;
  return {
    /** @param {number} sec */
    add(sec) {
      const v = Number(sec);
      if (Number.isFinite(v) && v > 0) pending += v;
    },
    /** @returns {{seconds: number, session: boolean}|null} */
    take() {
      const seconds = Math.round(pending);
      if (!logged && seconds < minSeconds) return null;
      if (seconds <= 0) return null;
      pending = 0;
      const session = !logged;
      logged = true;
      return { seconds, session };
    },
    get pending() {
      return pending;
    },
    get logged() {
      return logged;
    },
  };
}
