// Занятие дня: план на 5, 10 или 18 минут, выбор пар по Лейтнеру и слабым местам, песня в конце.
// Чистый модуль. Даты, Лейтнер и серия живут в progress.js и реэкспортируются отсюда по контракту.

import { formatChord, normalizeChordName, parseChord, transposeChord } from './chord.js';
import { bestKey, nextChordGains, simplifyName } from './playable.js';
import {
  LEVELS, STRUM_PATTERNS, chordRank, currentLevel, knownChordsAfter, lessonById, levelById, nextLesson, omcTarget,
} from './curriculum.js';
import { pairKey, practiceDay } from './progress.js';

export { practiceDay, leitner, streak, pairKey, addDays } from './progress.js';

/**
 * @typedef {{type: 'tuner'|'warmup'|'new'|'omc'|'strum'|'song', title: string, seconds: number, payload: object}} Block
 * payload: tuner {}; warmup {chords}; new {chord?, lessonId?, gain?}; omc {pairs: [a, b][], seconds: 60};
 *          strum {patternId, bpm, chords}; song {songId, speed, shift, missing} — speed: доля темпа (0.7 = 70 %),
 *          shift: на сколько полутонов транспонировать, missing: аккорды, которых пока нет.
 */
/** @typedef {{minutes: 5|10|18, day: string, blocks: Block[]}} PlanSession */

/** Длительности занятий. */
export const SESSION_MINUTES = [5, 10, 18];

/** Самые полезные пары в «укулельных» тональностях (research/pedagogy.md), по убыванию пользы. */
export const PRIORITY_PAIRS = [
  ['C', 'Am'], ['C', 'G'], ['C', 'F'], ['Am', 'F'], ['F', 'G'], ['Am', 'G'], ['Am', 'Dm'], ['Dm', 'G'],
  ['Em', 'Am'], ['C', 'Em'], ['Am', 'E7'], ['Dm', 'E7'], ['G', 'D'], ['D', 'A7'], ['A', 'D'], ['G', 'Em'],
  ['C', 'A7'], ['G7', 'C'], ['F', 'Bb'], ['Dm', 'Gm'], ['Bb', 'C'], ['G', 'Bm'], ['D', 'Bm'], ['A', 'E'], ['A', 'F#m'],
];
const PRIORITY_INDEX = new Map(PRIORITY_PAIRS.map(([a, b], i) => [pairKey(a, b), i]));

// Шаблоны занятий: секунды блоков. Песня получает остаток до полной длительности.
const TEMPLATES = {
  5: { tuner: 30, omcPairs: 2, omcRest: 15, songMax: 180 },
  10: { tuner: 45, warmup: 90, warmupChords: 4, omcPairs: 2, omcRest: 15, strum: 120, songMax: 270 },
  18: { tuner: 60, warmup: 120, warmupChords: 6, fresh: 180, omcPairs: 3, omcRest: 30, strum: 180, songMax: 420 },
};
const OMC_SECONDS = 60;
const FALLBACK_SONG_ID = 'starter-bratec-yakov';
const SPEED_BY_STATUS = { new: 0.7, learning: 0.8, playing: 0.9, polished: 1 };

// Детерминированный генератор по строке: в один день — одно и то же занятие, в другой — другое.
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byRank = (a, b) => chordRank(a) - chordRank(b) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Аккорды из ChordPro по порядку исполнения (всё в [квадратных скобках], что разбирается как аккорд).
 * @param {string} text
 * @returns {string[]} нормализованные имена
 */
export function chordSequence(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/\[([^\]\n]{1,16})\]/g)) {
    const name = normalizeChordName(m[1]);
    if (name) out.push(name);
  }
  return out;
}

function shiftName(name, shift) {
  const c = parseChord(name);
  return c ? formatChord(transposeChord(c, shift)) : name;
}

// Чем играть аккорд из песни при этих известных аккордах: сам, упрощённый, 7 → мажор, E/B → E7/B7.
function playedName(name, known) {
  if (known.has(name)) return name;
  const s = simplifyName(name);
  if (known.has(s)) return s;
  const c = parseChord(s);
  if (!c) return null;
  if (c.quality === '7') {
    const maj = formatChord({ ...c, quality: 'maj', bass: null });
    if (known.has(maj)) return maj;
  }
  if (c.quality === 'maj' && (c.root === 4 || c.root === 11)) {
    const sev = formatChord({ ...c, quality: '7', bass: null });
    if (known.has(sev)) return sev;
  }
  return null;
}

// Аккорды, с которыми строим занятие: известные, а новичку — аккорды L0.
function workingChords(progress) {
  const known = Object.keys(progress.knownChords ?? {});
  const list = known.length >= 2 ? known : [...new Set([...known, ...knownChordsAfter('L0')])];
  return list.sort(byRank);
}

const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);

// Последний освоенный уровень: пройден уроками или известны все его аккорды (для тех, кто идёт через песни).
// −1 — пока ни одного.
function masteredIndex(progress) {
  const byLessons = nextLesson(progress) ? LEVELS.indexOf(currentLevel(progress)) - 1 : LEVELS.length - 1;
  const known = new Set(Object.keys(progress.knownChords ?? {}));
  let byChords = -1;
  while (byChords + 1 < LEVELS.length && LEVELS[byChords + 1].chords.every((c) => known.has(c))) byChords++;
  return Math.max(byLessons, byChords);
}

// Бои, которые уже показаны: из освоенных уровней и из пройденных уроков. «Четыре вниз» доступен всегда.
function unlockedPatterns(progress, mastered) {
  const ids = new Set(['quarters']);
  for (const s of STRUM_PATTERNS) if (levelIndex(s.level) <= mastered) ids.add(s.id);
  for (const id of Object.keys(progress.lessonsDone ?? {})) {
    for (const step of lessonById(id)?.steps ?? []) if (step.type === 'strum') ids.add(step.pattern);
  }
  // Сначала самый свежий бой; на одном уровне — основной бой уровня.
  const rank = (s) => levelIndex(s.level) * 2 + (LEVELS[levelIndex(s.level)]?.strum === s.id ? 1 : 0);
  return STRUM_PATTERNS.filter((s) => ids.has(s.id)).sort((a, b) => rank(b) - rank(a));
}

/**
 * Самые слабые пары среди известных аккордов: отношение последнего результата к цели уровня, по возрастанию.
 * Частые пары, которые ещё ни разу не тренировались, считаются самыми слабыми.
 * @param {import('../state.js').Progress} progress
 * @param {string[]} knownNames
 * @param {number} [n]
 * @returns {[string, string][]}
 */
export function weakPairs(progress, knownNames, n = 3) {
  const known = new Set(knownNames);
  const cands = new Map();
  for (const [key, rec] of Object.entries(progress?.pairs ?? {})) {
    const [a, b] = key.split('|');
    if (!known.has(a) || !known.has(b)) continue;
    cands.set(key, { pair: [a, b], ratio: (rec?.last ?? rec?.best ?? 0) / omcTarget(progress, a, b) });
  }
  for (const [a, b] of PRIORITY_PAIRS) {
    const key = pairKey(a, b);
    if (known.has(a) && known.has(b) && !cands.has(key)) cands.set(key, { pair: [a, b], ratio: 0 });
  }
  const prio = (key) => PRIORITY_INDEX.get(key) ?? PRIORITY_PAIRS.length;
  return [...cands.entries()]
    .sort(([ka, x], [kb, y]) => x.ratio - y.ratio || prio(ka) - prio(kb))
    .slice(0, Math.max(0, n))
    .map(([, v]) => v.pair);
}

function duePairs(progress, known, today) {
  return Object.entries(progress.pairs ?? {})
    .filter(([key, rec]) => {
      const [a, b] = key.split('|');
      return known.has(a) && known.has(b) && rec?.due && rec.due <= today;
    })
    .sort(([, x], [, y]) => (x.due < y.due ? -1 : x.due > y.due ? 1 : (x.last ?? 0) - (y.last ?? 0)))
    .map(([key]) => key.split('|'));
}

// Самые частые смены в песне (соседние разные аккорды), по убыванию.
function songPairList(sequence, allowed) {
  const counts = new Map();
  for (let i = 1; i < sequence.length; i++) {
    const a = sequence[i - 1];
    const b = sequence[i];
    if (!a || !b || a === b || !allowed.has(a) || !allowed.has(b)) continue;
    const key = pairKey(a, b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([key]) => key.split('|'));
}

function pickSong(progress, songs, working, rnd) {
  const live = (songs ?? []).filter((s) => s && !s.deleted && Array.isArray(s.chords) && s.chords.length);
  const evals = live.map((rec) => ({ rec, key: bestKey(rec.chords, working, { maxShift: 5 }) }));
  const byRecent = (a, b) => (a.rec.lastPlayedAt ?? 0) - (b.rec.lastPlayedAt ?? 0);
  const active = evals.filter((e) => e.rec.status === 'learning' || e.rec.status === 'playing');

  // 1) «Играю сейчас»: играбельная, которую дольше всего не трогали.
  let pick = active.filter((e) => e.key.playable).sort(byRecent)[0];
  // 2) Песня, которую учишь, даже если не хватает пары аккордов.
  pick ??= active.filter((e) => e.key.missing.length <= 2)
    .sort((a, b) => a.key.missing.length - b.key.missing.length || byRecent(a, b))[0];
  // 3) Ближайшая играбельная: близкая к уровню, давно не игранная; немного случайности для разнообразия.
  if (!pick) {
    const lvl = Math.min(masteredIndex(progress) + 1, LEVELS.length - 1);
    const dist = (e) => {
      const i = levelIndex(e.rec.level);
      return i < 0 ? 3 : Math.abs(i - lvl);
    };
    const top = evals.filter((e) => e.key.playable)
      .sort((a, b) => dist(a) - dist(b) || byRecent(a, b) || a.rec.chords.length - b.rec.chords.length)
      .slice(0, 3);
    const pool = top.length > 1 ? top.filter((e) => e.rec.id !== progress.lastSongId) : top;
    pick = pool[Math.floor(rnd() * pool.length)];
  }
  // 4) Меньше всего незнакомых аккордов.
  pick ??= evals.slice().sort((a, b) => a.key.missing.length - b.key.missing.length
    || a.rec.chords.length - b.rec.chords.length)[0];
  if (!pick) return null;

  const { rec, key } = pick;
  const known = new Set(working);
  const raw = chordSequence(rec.text);
  const sequence = (raw.length ? raw : rec.chords).map((n) => {
    const shifted = shiftName(n, key.shift);
    return playedName(shifted, known) ?? simplifyName(shifted);
  });
  return { rec, shift: key.shift, missing: key.missing, sequence };
}

function pickFresh(progress, songs, working) {
  const lesson = nextLesson(progress);
  if (lesson) {
    const step = lesson.steps.find((s) => s.type === 'chord' && !progress.knownChords?.[s.chord]);
    // Пара для OMC — из самого урока (Am–F с пальцем-якорем лучше, чем просто частая C–F).
    const pair = step && lesson.steps.find((s) => s.type === 'omc' && s.pair.includes(step.chord))?.pair;
    return step
      ? { title: `Новый аккорд: ${step.chord}`, payload: { chord: step.chord, lessonId: lesson.id }, pair }
      : { title: `Новое: ${lesson.title}`, payload: { lessonId: lesson.id } };
  }
  const gains = nextChordGains((songs ?? []).filter((s) => s && !s.deleted).map((s) => s.chords ?? []), working);
  const top = gains.find((g) => g.gain > 0);
  return top ? { title: `Новый аккорд: ${top.chord}`, payload: { chord: top.chord, gain: top.gain } } : null;
}

function pickPairs(progress, working, { count, freshChord, freshPair, songPairs, today }) {
  const known = new Set(working);
  const out = [];
  const seen = new Set();
  const add = (pair) => {
    if (!pair) return;
    const [a, b] = pair;
    if (!a || !b || a === b) return;
    const key = pairKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    out.push([a, b]);
  };
  if (freshChord && !known.has(freshChord)) {
    const other = (p) => (p[0] === freshChord ? p[1] : p[0]);
    const partner = [freshPair, ...PRIORITY_PAIRS].find((p) => p?.includes(freshChord) && known.has(other(p)));
    add(partner ? [other(partner), freshChord] : [working[0], freshChord]);
  }
  const due = duePairs(progress, known, today);
  const weak = weakPairs(progress, working, 6);
  add(due[0] ?? weak[0]);
  add(songPairs[0]);
  for (const pair of [...due, ...weak, ...songPairs]) add(pair);
  if (working.length >= 2) add([working[0], working[1]]);
  return out.slice(0, count);
}

function pickWarmup(progress, working, today, rnd, n) {
  const due = working.filter((c) => (progress.knownChords?.[c]?.due ?? '9999') <= today);
  const rest = shuffle(working.filter((c) => !due.includes(c)), rnd);
  return shuffle([...due, ...rest].slice(0, n), rnd);
}

function pickStrum(progress, chords, rnd) {
  const [latest, ...others] = unlockedPatterns(progress, masteredIndex(progress));
  // Примерно раз в три дня — один из прежних боёв, чтобы не надоедало.
  const pattern = others.length && rnd() < 0.3 ? others[Math.floor(rnd() * others.length)] : latest;
  const home = levelById(pattern.level) ?? LEVELS[0];
  const best = progress.strum?.[pattern.id]?.bestBpm;
  const bpm = best ? Math.max(home.bpm[0], best - 5) : home.bpm[0];
  return { pattern, bpm, chords };
}

/**
 * План занятия на 5, 10 или 18 минут. 5 мин: тюнер, 2 пары OMC, песня; 10 мин: + разминка и бой;
 * 18 мин: + новинка (следующий урок или аккорд с наибольшим «+N песен»). Всегда заканчивается песней,
 * сумма секунд равна длительности. В один день план одинаковый, в разные — разный.
 * @param {import('../state.js').Progress} progress
 * @param {import('../state.js').SongRecord[]} songs
 * @param {{minutes?: number, today?: string}} [opts]
 * @returns {PlanSession}
 */
export function buildSession(progress, songs, { minutes = 10, today } = {}) {
  const p = { knownChords: {}, pairs: {}, strum: {}, lessonsDone: {}, ...progress };
  const min = SESSION_MINUTES.reduce((best, m) => (Math.abs(m - minutes) < Math.abs(best - minutes) ? m : best), 10);
  const day = today ?? practiceDay();
  const t = TEMPLATES[min];
  const rnd = seededRandom(`${day}:${min}`);
  const working = workingChords(p);

  const song = pickSong(p, songs, working, rnd);
  const fresh = t.fresh ? pickFresh(p, songs, working) : null;
  const allowed = new Set([...working, ...(song?.missing ?? [])]);
  const pairs = pickPairs(p, working, {
    count: t.omcPairs,
    freshChord: fresh?.payload.chord,
    freshPair: fresh?.pair,
    songPairs: song ? songPairList(song.sequence, allowed) : [],
    today: day,
  });

  const blocks = [{ type: 'tuner', title: 'Настрой укулеле', seconds: t.tuner, payload: {} }];
  // Разминка «по памяти» имеет смысл, только когда есть что вспоминать.
  if (t.warmup && Object.keys(p.knownChords).length) {
    blocks.push({
      type: 'warmup', title: 'Разминка: аккорды по памяти', seconds: t.warmup,
      payload: { chords: pickWarmup(p, working, day, rnd, t.warmupChords) },
    });
  }
  if (fresh) blocks.push({ type: 'new', title: fresh.title, seconds: t.fresh, payload: fresh.payload });
  if (pairs.length) {
    blocks.push({
      type: 'omc', title: 'Смены за минуту', seconds: pairs.length * OMC_SECONDS + (pairs.length - 1) * t.omcRest,
      payload: { pairs, seconds: OMC_SECONDS },
    });
  }
  if (t.strum) {
    const songChords = [...new Set(song?.sequence ?? [])].filter((c) => allowed.has(c) && working.includes(c));
    const chords = (songChords.length >= 2 ? songChords : working).slice(0, 4);
    const s = pickStrum(p, chords, rnd);
    blocks.push({
      type: 'strum', title: `Бой: ${s.pattern.name}`, seconds: t.strum,
      payload: { patternId: s.pattern.id, bpm: s.bpm, chords: s.chords },
    });
  }

  const used = blocks.reduce((sum, b) => sum + b.seconds, 0);
  let songSeconds = Math.max(60, min * 60 - used);
  // Лишнее время (нет новинки, мало пар) не копится в песне, а делится между новинкой, боем и разминкой.
  const extraTo = ['new', 'strum', 'warmup'].map((type) => blocks.find((b) => b.type === type)).filter(Boolean);
  if (songSeconds > t.songMax && extraTo.length) {
    const excess = songSeconds - t.songMax;
    const share = Math.floor(excess / extraTo.length / 15) * 15;
    for (const b of extraTo) b.seconds += share;
    extraTo[0].seconds += excess - share * extraTo.length;
    songSeconds = t.songMax;
  }
  const rec = song?.rec;
  blocks.push({
    type: 'song',
    title: rec ? `Песня: ${rec.title}` : 'Песня',
    seconds: songSeconds,
    payload: {
      songId: rec?.id ?? FALLBACK_SONG_ID,
      speed: song?.missing.length ? 0.7 : SPEED_BY_STATUS[rec?.status] ?? 0.7,
      shift: song?.shift ?? 0,
      missing: song?.missing ?? [],
    },
  });
  return { minutes: /** @type {5|10|18} */ (min), day, blocks };
}
