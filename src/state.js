// Реактивное состояние приложения: сигналы + запись в IndexedDB с задержкой ~300 мс.
// Если IndexedDB недоступна (приватный режим), приложение работает в памяти и честно об этом сообщает через `storage`.

import { batch, computed, signal } from '@preact/signals';
import { loadAll, saveBatch } from './data/store.js';
import { STARTER_SONGS } from './data/starter-songs.js';
import { parseSong, songChords, toChordPro } from './core/song.js';
import { normalizeChordName } from './core/chord.js';
import { chordRank, omcTarget } from './core/curriculum.js';
import {
  activeDays, applyChordKnown, applyChordReview, applyLessonDone, applyOmc, applyOnboarded, applyPractice, applyStrum,
  mergeProgress, normalizeProgress, pairKey, practiceDay, streak, weekSeconds,
} from './core/progress.js';

/**
 * @typedef {{id: string, title: string, artist: string, lang?: string,
 *   source: {site: string, url?: string, fetchedAt?: number},
 *   text: string, rawText?: string, chords: string[], level?: string,
 *   status: 'new'|'learning'|'playing'|'polished', fav: boolean,
 *   prefs: {transpose: number, fontSize: number, speed: number, simplify: boolean},
 *   trainer: {chords: boolean, changes: boolean, strum: boolean, play: boolean, plays: number},
 *   strum?: string, bpm?: number, preview?: {url: string, artwork: string, link: string},
 *   createdAt: number, updatedAt: number, lastPlayedAt?: number, deleted?: boolean}} SongRecord
 * text — ChordPro. deleted — мягкое удаление (запись остаётся для слияния при импорте и будущей синхронизации).
 * prefs.fontSize — размер текста песни в px; prefs.speed — скорость прокрутки 1–10.
 */
/**
 * @typedef {{theme: 'auto'|'light'|'dark', tuning: 'gcea'|'lowg', leftHanded: boolean, sessionMinutes: 5|10|18,
 *   weeklyGoalMin: number, sound: boolean, notation: 'B'|'H'}} Settings
 */
/**
 * @typedef {{knownChords: Record<string, {since: string, box: number, due: string, seen?: string}>,
 *   pairs: Record<string, {best: number, last: number, history: {day: string, count: number}[], box: number, due: string}>,
 *   strum: Record<string, {bestBpm: number, history: {day: string, bpm: number}[]}>,
 *   lessonsDone: Record<string, string>, practice: Record<string, {seconds: number, sessions: number}>,
 *   streakBest: number, onboarded: boolean, lastSongId?: string}} Progress
 */

/** Настройки по умолчанию. @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'auto', tuning: 'gcea', leftHanded: false, sessionMinutes: 10, weeklyGoalMin: 70, sound: true, notation: 'B',
});
const DEFAULT_PREFS = Object.freeze({ transpose: 0, fontSize: 18, speed: 5, simplify: false });
const DEFAULT_TRAINER = Object.freeze({ chords: false, changes: false, strum: false, play: false, plays: 0 });
const STATUSES = new Set(['new', 'learning', 'playing', 'polished']);
const SETTING_CHOICES = {
  theme: ['auto', 'light', 'dark'], tuning: ['gcea', 'lowg'], sessionMinutes: [5, 10, 18], notation: ['B', 'H'],
};
const SAVE_DELAY = 300;
const PERSIST_ASKED_KEY = 'uke:persist-asked';

/** Состояние загружено из базы. */
export const ready = signal(false);
/** @type {import('@preact/signals').Signal<Settings>} */
export const settings = signal({ ...DEFAULT_SETTINGS });
/** @type {import('@preact/signals').Signal<Progress>} */
export const progress = signal(normalizeProgress(null));
/** Песни без удалённых, свежие сверху. @type {import('@preact/signals').Signal<SongRecord[]>} */
export const songs = signal([]);
/** Текущий день занятий 'YYYY-MM-DD' (день начинается в 04:00), обновляется сам. */
export const today = signal(practiceDay());
/** Хранилище: available — IndexedDB работает; persistent — браузер обещал не чистить данные (null — неизвестно). */
export const storage = signal({ available: true, persistent: /** @type {boolean|null} */ (null) });

/** Известные аккорды в учебном порядке. */
export const knownChordNames = computed(() =>
  Object.keys(progress.value.knownChords).sort((a, b) => chordRank(a) - chordRank(b) || a.localeCompare(b)));

/**
 * Сводка дня: seconds — время сегодня, streak — длина серии, best — рекорд серии, frozen — дни под заморозкой,
 * freezesLeft — заморозок на этой неделе, weekSeconds / weeklyGoalSec — для недельной цели.
 */
export const todayStats = computed(() => {
  const day = today.value;
  const p = progress.value;
  const s = streak(activeDays(p), day);
  return {
    seconds: p.practice[day]?.seconds ?? 0,
    doneToday: s.doneToday,
    streak: s.current,
    best: Math.max(s.best, p.streakBest ?? 0),
    frozen: s.frozen,
    freezesLeft: s.freezesLeft,
    weekSeconds: weekSeconds(p, day),
    weeklyGoalSec: (settings.value.weeklyGoalMin ?? DEFAULT_SETTINGS.weeklyGoalMin) * 60,
  };
});

// ---------- хранение ----------

/** @type {Map<string, SongRecord>} все песни, включая удалённые */
const all = new Map();
let meta = { seededIds: /** @type {string[]} */ ([]) };
const pending = { settings: false, progress: false, meta: false, songs: new Set() };
let timer = null;
let writing = Promise.resolve();

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, SAVE_DELAY);
}

/**
 * Записать накопленные изменения сразу (вызывается само при уходе со страницы).
 * @returns {Promise<void>}
 */
export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const data = { songs: [...pending.songs].map((id) => all.get(id)).filter(Boolean), kv: {} };
  if (pending.settings) data.kv.settings = settings.value;
  if (pending.progress) data.kv.progress = progress.value;
  if (pending.meta) data.kv.meta = meta;
  pending.settings = pending.progress = pending.meta = false;
  pending.songs.clear();
  if (!storage.value.available) return writing;
  writing = writing
    .then(() => saveBatch(data))
    .catch((err) => console.warn('[uke] не удалось сохранить', err));
  return writing;
}

function refreshToday() {
  const day = practiceDay();
  if (today.value !== day) today.value = day;
  return day;
}

function refreshSongs() {
  songs.value = [...all.values()].filter((s) => !s.deleted).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function touchSong(id) {
  pending.songs.add(id);
  refreshSongs();
  schedule();
}

function setProgress(fn) {
  progress.value = fn(progress.value);
  pending.progress = true;
  schedule();
}

// ---------- песни ----------

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const clean = (s) => (typeof s === 'string' ? s.trim() : '');

function newId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeParse(text, meta) {
  try {
    return parseSong(String(text ?? ''), meta);
  } catch (err) {
    console.warn('[uke] песня не разобралась', err);
    return null;
  }
}

function chordsOf(parsed) {
  try {
    return parsed ? songChords(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Полная запись песни из частичной. keepText — текст уже в ChordPro (стартовый набор), не пересобирать.
 * @returns {SongRecord}
 */
function buildRecord(partial, now, { keepText = false } = {}) {
  const src = String(partial.text ?? '');
  const parsed = safeParse(src, { title: partial.title, artist: partial.artist });
  const title = clean(partial.title) || clean(parsed?.title) || 'Без названия';
  const artist = clean(partial.artist) || clean(parsed?.artist);
  let text = src;
  if (parsed && !keepText) {
    try {
      text = toChordPro({ ...parsed, title, artist });
    } catch (err) {
      console.warn('[uke] не удалось собрать ChordPro', err);
    }
  }
  const given = Array.isArray(partial.chords) ? partial.chords.map((c) => normalizeChordName(c)).filter(Boolean) : [];
  /** @type {SongRecord} */
  const rec = {
    id: clean(partial.id) || newId(),
    title,
    artist,
    source: { site: 'paste', ...(isObj(partial.source) ? partial.source : {}) },
    text,
    chords: chordsOf(parsed) ?? given,
    status: STATUSES.has(partial.status) ? partial.status : 'new',
    fav: Boolean(partial.fav),
    prefs: { ...DEFAULT_PREFS, ...(isObj(partial.prefs) ? partial.prefs : {}) },
    trainer: { ...DEFAULT_TRAINER, ...(isObj(partial.trainer) ? partial.trainer : {}) },
    createdAt: Number.isFinite(partial.createdAt) ? partial.createdAt : now,
    updatedAt: now,
  };
  const rawText = partial.rawText ?? (src && src !== text ? src : undefined);
  const extra = {
    lang: partial.lang, rawText, level: partial.level, strum: partial.strum ?? parsed?.strum,
    bpm: partial.bpm ?? parsed?.bpm, preview: partial.preview, lastPlayedAt: partial.lastPlayedAt,
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') rec[k] = v;
  return rec;
}

/**
 * Добавить песню: дозаполняет поля, приводит текст к ChordPro (исходник — в rawText), считает аккорды.
 * Песня с уже существующим id обновляется, статус и настройки сохраняются.
 * @param {Partial<SongRecord> & {text: string}} partial
 * @returns {Promise<string>} id
 */
export async function addSong(partial) {
  const now = Date.now();
  const rec = buildRecord(partial ?? {}, now);
  const cur = all.get(rec.id);
  if (cur) {
    rec.createdAt = cur.createdAt ?? now;
    if (!partial.status) rec.status = cur.status;
    if (partial.fav === undefined) rec.fav = cur.fav;
    if (!partial.prefs) rec.prefs = cur.prefs;
    if (!partial.trainer) rec.trainer = cur.trainer;
  }
  all.set(rec.id, rec);
  touchSong(rec.id);
  await flush();
  return rec.id;
}

/**
 * Изменить песню. prefs, trainer и source сливаются, а не заменяются. Новый text — аккорды пересчитываются.
 * @param {string} id
 * @param {Partial<SongRecord>} patch
 * @returns {SongRecord|undefined} обновлённая запись
 */
export function updateSong(id, patch = {}) {
  const cur = all.get(id);
  if (!cur || cur.deleted) return undefined;
  const next = { ...cur, ...patch, id: cur.id, updatedAt: Date.now() };
  for (const k of ['prefs', 'trainer', 'source']) if (isObj(patch[k])) next[k] = { ...cur[k], ...patch[k] };
  if (typeof patch.text === 'string' && patch.text !== cur.text) {
    next.chords = chordsOf(safeParse(patch.text, { title: next.title, artist: next.artist })) ?? cur.chords;
  }
  all.set(id, next);
  touchSong(id);
  return next;
}

/**
 * Удалить песню (мягко: запись помечается deleted и пропадает из `songs`).
 * @param {string} id
 * @returns {boolean} была ли такая песня
 */
export function removeSong(id) {
  const cur = all.get(id);
  if (!cur || cur.deleted) return false;
  all.set(id, { ...cur, deleted: true, updatedAt: Date.now() });
  if (progress.value.lastSongId === id) {
    setProgress((p) => {
      const { lastSongId, ...rest } = p;
      return rest;
    });
  }
  touchSong(id);
  return true;
}

/**
 * Песня по id (удалённые не возвращаются).
 * @param {string} id
 * @returns {SongRecord|undefined}
 */
export function getSong(id) {
  const s = all.get(id);
  return s && !s.deleted ? s : undefined;
}

/**
 * Песню сыграли: время, счётчик, «новая» → «учу», последняя песня в прогрессе.
 * @param {string} id
 * @returns {SongRecord|undefined}
 */
export function markSongPlayed(id) {
  const cur = getSong(id);
  if (!cur) return undefined;
  const rec = updateSong(id, {
    lastPlayedAt: Date.now(),
    status: cur.status === 'new' ? 'learning' : cur.status,
    trainer: { plays: (cur.trainer?.plays ?? 0) + 1 },
  });
  setProgress((p) => ({ ...p, lastSongId: id }));
  return rec;
}

/**
 * Запомнить песню, которую сейчас тренируешь (для карточки «Тренировать песню» на главной), без счётчика игр.
 * @param {string} id
 */
export function setLastSong(id) {
  if (!getSong(id) || progress.value.lastSongId === id) return;
  setProgress((p) => ({ ...p, lastSongId: id }));
}

// ---------- настройки и прогресс ----------

function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in DEFAULT_SETTINGS)) out[k] = v; // новые ключи (например, время напоминания) храним как есть
    else if (SETTING_CHOICES[k]) { if (SETTING_CHOICES[k].includes(v)) out[k] = v; }
    else if (typeof v === typeof DEFAULT_SETTINGS[k] && (typeof v !== 'number' || (Number.isFinite(v) && v > 0))) out[k] = v;
  }
  return out;
}

/**
 * Изменить настройку.
 * @param {keyof Settings | string} key
 * @param {any} value
 */
export function setSetting(key, value) {
  const next = sanitizeSettings({ ...settings.value, [key]: value });
  if (next[key] !== value) {
    console.warn('[uke] неподходящее значение настройки', key, value);
    return;
  }
  settings.value = next;
  pending.settings = true;
  schedule();
}

const norm = (name) => normalizeChordName(name) ?? String(name);

/**
 * Отметить аккорд выученным (или снять отметку).
 * @param {string} name
 * @param {boolean} [known]
 */
export function setChordKnown(name, known = true) {
  const day = refreshToday();
  setProgress((p) => applyChordKnown(p, norm(name), known, day));
}

/**
 * Повтор аккорда в разминке: вспомнил форму или нет.
 * @param {string} name
 * @param {boolean} success
 */
export function reviewChord(name, success) {
  const day = refreshToday();
  setProgress((p) => applyChordReview(p, norm(name), success, day));
}

/**
 * Результат «смен за минуту».
 * @param {string} a
 * @param {string} b
 * @param {number} count
 * @returns {{count: number, best: number, prevBest: number, record: boolean, first: boolean, target: number, reached: boolean}}
 */
export function recordOmc(a, b, count) {
  const day = refreshToday();
  const na = norm(a);
  const nb = norm(b);
  const prev = progress.value.pairs[pairKey(na, nb)];
  const target = omcTarget(progress.value, na, nb);
  setProgress((p) => applyOmc(p, na, nb, count, { today: day, target }));
  const rec = progress.value.pairs[pairKey(na, nb)];
  const prevBest = prev?.best ?? 0;
  return {
    count: rec.last, best: rec.best, prevBest, record: prevBest > 0 && rec.last > prevBest, first: !prev, target,
    reached: rec.last >= target,
  };
}

/**
 * Темп, который удалось держать в бое.
 * @param {string} patternId
 * @param {number} bpm
 * @returns {{bestBpm: number, record: boolean}}
 */
export function recordStrum(patternId, bpm) {
  const day = refreshToday();
  const prevBest = progress.value.strum[patternId]?.bestBpm ?? 0;
  setProgress((p) => applyStrum(p, patternId, bpm, day));
  const bestBpm = progress.value.strum[patternId].bestBpm;
  return { bestBpm, record: prevBest > 0 && bestBpm > prevBest };
}

/**
 * Добавить время занятий за сегодня.
 * @param {number} seconds
 * @param {{session?: boolean}} [opts] session: false — дописать время, не считая отдельным занятием
 */
export function logPractice(seconds, { session = true } = {}) {
  const day = refreshToday();
  setProgress((p) => applyPractice(p, seconds, { today: day, session }));
}

/**
 * Урок пройден; аккорды из урока становятся известными.
 * @param {string} id
 */
export function completeLesson(id) {
  const day = refreshToday();
  setProgress((p) => applyLessonDone(p, id, day));
}

/** Онбординг пройден. */
export function markOnboarded() {
  setProgress(applyOnboarded);
}

// ---------- экспорт и импорт ----------

/**
 * Резервная копия всего: настройки, прогресс, песни (вместе с удалёнными — чтобы удаление переехало).
 * @returns {string} JSON
 */
export function exportData() {
  return JSON.stringify({
    app: 'uke', v: 1, exportedAt: new Date().toISOString(),
    settings: settings.value, progress: progress.value, songs: [...all.values()],
  });
}

function validSong(s) {
  return isObj(s) && typeof s.id === 'string' && s.id && typeof s.text === 'string' && typeof s.title === 'string';
}

function normalizeImported(s) {
  const base = buildRecord(s, Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now(), { keepText: true });
  if (Array.isArray(s.chords) && s.chords.every((c) => typeof c === 'string')) base.chords = s.chords;
  if (s.deleted) base.deleted = true;
  return base;
}

/**
 * Загрузить резервную копию: песни сливаются по id (побеждает более свежая updatedAt), прогресс сливается
 * без потерь, настройки берутся из файла. Повторный импорт того же файла ничего не меняет.
 * @param {string|object} json
 * @returns {Promise<{added: number, updated: number, skipped: number}>}
 */
export async function importData(json) {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('Файл не читается: это не JSON.');
    }
  }
  if (!isObj(data) || data.app !== 'uke') throw new Error('Это не резервная копия Уке.');
  if (!(Number(data.v) >= 1)) throw new Error('Неизвестная версия файла.');
  if (Number(data.v) > 1) throw new Error('Файл из более новой версии приложения. Обнови приложение.');
  if (data.songs !== undefined && !Array.isArray(data.songs)) throw new Error('В файле испорчен список песен.');
  if (data.progress !== undefined && !isObj(data.progress)) throw new Error('В файле испорчен прогресс.');

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const s of data.songs ?? []) {
    if (!validSong(s)) {
      skipped++;
      continue;
    }
    const cur = all.get(s.id);
    if (cur && (Number(s.updatedAt) || 0) <= (cur.updatedAt ?? 0)) continue;
    all.set(s.id, normalizeImported(s));
    pending.songs.add(s.id);
    if (cur) updated++;
    else added++;
  }
  batch(() => {
    if (isObj(data.settings)) {
      settings.value = sanitizeSettings({ ...settings.value, ...data.settings });
      pending.settings = true;
    }
    if (isObj(data.progress)) {
      progress.value = mergeProgress(progress.value, data.progress);
      pending.progress = true;
    }
    refreshSongs();
  });
  await flush();
  return { added, updated, skipped };
}

// ---------- запуск ----------

let initPromise = null;

/**
 * Загрузка состояния. Стартовый набор песен добавляется один раз: id запоминаются, удалённая песня не вернётся.
 * Повторный вызов возвращает тот же Promise.
 * @returns {Promise<void>}
 */
export function initState() {
  initPromise ??= init();
  return initPromise;
}

async function init() {
  let data = { songs: [], kv: {} };
  try {
    data = await loadAll();
  } catch (err) {
    console.warn('[uke] IndexedDB недоступна, данные живут только до закрытия вкладки', err);
    storage.value = { ...storage.value, available: false };
  }

  all.clear();
  for (const s of data.songs ?? []) if (s?.id) all.set(s.id, s);
  meta = { seededIds: [], ...(isObj(data.kv?.meta) ? data.kv.meta : {}) };

  const seeded = new Set(meta.seededIds);
  const now = Date.now();
  for (const [i, s] of (STARTER_SONGS ?? []).entries()) {
    if (!s?.id || seeded.has(s.id)) continue;
    if (!all.has(s.id)) {
      // Время чуть разное, чтобы порядок в списке совпадал с порядком набора.
      const rec = buildRecord({ ...s, source: { site: 'starter' } }, now - i, { keepText: true });
      all.set(rec.id, rec);
      pending.songs.add(rec.id);
    }
    seeded.add(s.id);
    pending.meta = true;
  }
  meta = { ...meta, seededIds: [...seeded] };

  batch(() => {
    settings.value = sanitizeSettings(data.kv?.settings);
    progress.value = normalizeProgress(data.kv?.progress);
    refreshSongs();
    refreshToday();
    ready.value = true;
  });

  listen();
  requestPersistOnce();
  await flush();
}

function listen() {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else refreshToday();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => flush());
    setInterval(refreshToday, 60_000);
  }
}

async function requestPersistOnce() {
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persist || !storage.value.available) return;
  try {
    let persisted = (await st.persisted?.()) ?? false;
    let asked = false;
    try {
      asked = localStorage.getItem(PERSIST_ASKED_KEY) === '1';
    } catch { /* localStorage может быть недоступен */ }
    if (!persisted && !asked) {
      try {
        localStorage.setItem(PERSIST_ASKED_KEY, '1');
      } catch { /* не страшно */ }
      persisted = await st.persist();
    }
    storage.value = { ...storage.value, persistent: Boolean(persisted) };
  } catch (err) {
    console.warn('[uke] storage.persist не сработал', err);
  }
}
