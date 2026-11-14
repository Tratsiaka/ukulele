// Чистые помощники экранов «Аккорды», «Тюнер» (смены) и «Настройки». Без DOM — проверяются в node --test (tests/tools/).

import { LEVELS } from '../core/curriculum.js';
import { DICTIONARY_ORDER, getShapes, listChordNames } from '../core/shapes.js';
import { QUALITY_FAMILY, formatChord, normalizeChordName, normalizeChordText, parseChord } from '../core/chord.js';
import { nextChordGains } from '../core/playable.js';
import { PRIORITY_PAIRS, chordSequence } from '../core/practice.js';
import { pairKey } from '../core/progress.js';
import { formatDay, plural } from '../lib/format.js';

const hasShape = (name) => getShapes(name).length > 0;

// ---------- словарь аккордов ----------

/** Группы словаря по учебному пути; L0 и L1 — одна группа «Первые четыре». */
const GROUP_DEFS = [
  { id: 'first', title: 'Первые четыре', hint: 'C, Am, F и G — с ними уже играется каждая пятая песня', levels: ['L0', 'L1'] },
  { id: 'minor', title: 'Миноры', hint: 'Dm и Em — и главный укулельный бой', levels: ['L2'] },
  { id: 'sevenths', title: 'Септаккорды', hint: 'E7, A7, D, A — русские песни и блюз', levels: ['L3'] },
  { id: 'barre', title: 'Первое баррэ', hint: 'Bb и Gm — один палец на всех струнах', levels: ['L4'] },
  { id: 'barre-minor', title: 'Баррэ-миноры', hint: 'Bm, B7, F#m — для полного темпа', levels: ['L5'] },
  { id: 'free', title: 'Свобода', hint: 'E и подвижные формы', levels: ['L6'] },
];

/**
 * Группы словаря: по уровням пути (основные аккорды, затем запасные), потом «Остальные» из DICTIONARY_ORDER.
 * Только аккорды с аппликатурой.
 * @param {Iterable<string>} [knownNames]
 * @returns {{id: string, title: string, hint: string, chords: string[], known: number}[]}
 */
export function chordGroups(knownNames = []) {
  const known = new Set(knownNames);
  const used = new Set();
  const groups = GROUP_DEFS.map((def) => {
    const chords = [];
    for (const id of def.levels) {
      const level = LEVELS.find((l) => l.id === id);
      for (const name of [...(level?.chords ?? []), ...(level?.bonus ?? [])]) {
        if (used.has(name) || !hasShape(name)) continue;
        used.add(name);
        chords.push(name);
      }
    }
    return { id: def.id, title: def.title, hint: def.hint, chords };
  });
  const rest = DICTIONARY_ORDER.filter((n) => !used.has(n) && hasShape(n));
  groups.push({ id: 'rest', title: 'Остальные', hint: 'Септы, sus, maj7 и редкие гости', chords: rest });
  return groups
    .filter((g) => g.chords.length)
    .map((g) => ({ ...g, known: g.chords.filter((c) => known.has(c)).length }));
}

/** Аккорды учебного пути (основные и запасные) — для кольца «путь пройден на N из M». */
export function pathChords() {
  return [...new Set(LEVELS.flatMap((l) => [...l.chords, ...(l.bonus ?? [])]))].filter(hasShape);
}

/**
 * Запрос поиска аккорда → текст и нормализованное имя. «am» → Am, «f#m» → F#m, «А#» (кириллица) → Bb.
 * @param {string} query
 * @param {{german?: boolean}} [opts] german — нотация H: «H» = B, «B» = Bb
 * @returns {{text: string, name: string|null}|null} null — пустой запрос
 */
export function normalizeQuery(query, { german = false } = {}) {
  let text = normalizeChordText(query).replace(/\s+/g, '');
  if (!text) return null;
  if (/^[a-h]/.test(text)) text = text[0].toUpperCase() + text.slice(1);
  return { text, name: normalizeChordName(text, { german }) };
}

/**
 * Поиск по всем аккордам с аппликатурами. Имя аккорда — сначала он сам, потом тот же корень и семейство
 * (Am → Am7, Am6…), потом остальные с тем же началом. Иначе — по вхождению текста (sus, maj7, m7b5).
 * Энгармонизмы сводятся: A# → Bb.
 * @param {string} query
 * @param {{names?: readonly string[], german?: boolean, limit?: number}} [opts]
 * @returns {string[]|null} null — запрос пустой (показываем группы)
 */
export function searchChords(query, { names = listChordNames(), german = false, limit = 60 } = {}) {
  const q = normalizeQuery(query, { german });
  if (!q) return null;
  const chord = q.name ? parseChord(q.name) : null;
  let out;
  if (chord) {
    const base = formatChord({ ...chord, bass: null });
    const family = QUALITY_FAMILY[chord.quality];
    const rank = (n) => {
      if (n === base) return 0;
      const c = parseChord(n);
      return c && QUALITY_FAMILY[c.quality] === family ? 1 : 2;
    };
    out = names
      .map((n, i) => ({ n, i, c: parseChord(n) }))
      .filter(({ n, c }) => c && c.root === chord.root && n.startsWith(base))
      .sort((x, y) => rank(x.n) - rank(y.n) || x.i - y.i)
      .map(({ n }) => n);
    if (!out.includes(base) && hasShape(base)) out.unshift(base);
  } else {
    const low = q.text.toLowerCase();
    out = names.filter((n) => n.toLowerCase().includes(low));
  }
  return out.slice(0, Math.max(0, limit));
}

/**
 * Сложность аккорда словами и «точками» 1–5 (по chordDifficulty: Am7 0, C 1, F 2, G 3, Bb 6).
 * @param {number} d
 * @returns {{dots: number, label: string}}
 */
export function difficultyInfo(d) {
  if (!Number.isFinite(d)) return { dots: 0, label: 'нет схемы' };
  if (d <= 1) return { dots: 1, label: 'совсем легко' };
  if (d <= 2) return { dots: 2, label: 'легко' };
  if (d <= 4) return { dots: 3, label: 'средне' };
  if (d <= 6) return { dots: 4, label: 'трудновато' };
  return { dots: 5, label: 'трудно' };
}

/**
 * Подпись аппликатуры в списке вариантов.
 * @param {{frets: number[], sub?: string}} shape
 * @param {number} index
 * @returns {string}
 */
export function shapeCaption(shape, index) {
  if (index === 0) return 'основная';
  if (shape?.sub) return `попроще · ${shape.sub}`;
  if (Math.max(...(shape?.frets ?? [0])) > 4) return 'выше по грифу';
  return 'вариант';
}

const STATUS_ORDER = { playing: 0, learning: 1, polished: 2, new: 3 };

/**
 * Песни библиотеки, где встречается аккорд: сначала «играю» и «учу», потом по названию.
 * @param {string} name нормализованное имя
 * @param {{id: string, title: string, chords?: string[], status?: string}[]} songs
 * @returns {object[]}
 */
export function chordSongs(name, songs) {
  return (songs ?? [])
    .filter((s) => Array.isArray(s?.chords) && s.chords.includes(name))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      || String(a.title).localeCompare(String(b.title), 'ru'));
}

/**
 * Сколько песен библиотеки станут играбельны (со сдвигом ±5), если выучить этот аккорд.
 * Уже известный (или его семейство по тому же корню) → 0.
 * @param {string} name
 * @param {{chords?: string[]}[]} songs
 * @param {string[]} knownNames
 * @returns {number}
 */
export function chordGain(name, songs, knownNames) {
  if (!name || knownNames.includes(name)) return 0;
  const lists = (songs ?? []).map((s) => s?.chords ?? []);
  return nextChordGains(lists, knownNames, [name])[0]?.gain ?? 0;
}

/**
 * Какой аккорд выучить следующим: с наибольшим приростом песен, а если прироста нет — следующий по словарю.
 * @param {{chords?: string[]}[]} songs
 * @param {string[]} knownNames
 * @returns {{chord: string, gain: number}|null} null — выучено всё из словаря
 */
export function nextChordSuggestion(songs, knownNames) {
  const known = new Set(knownNames);
  const candidates = DICTIONARY_ORDER.filter((n) => !known.has(n) && hasShape(n));
  if (!candidates.length) return null;
  const lists = (songs ?? []).map((s) => s?.chords ?? []);
  const top = nextChordGains(lists, knownNames, candidates)[0];
  if (top && top.gain > 0) return top;
  return { chord: candidates[0], gain: 0 };
}

/**
 * Частый партнёр аккорда для «смен за минуту»: известный из главных пар → частый сосед в твоих песнях →
 * любой известный → из главных пар → C (или Am для C).
 * @param {string} name
 * @param {{known?: string[], songs?: {text?: string, chords?: string[]}[]}} [opts]
 * @returns {string}
 */
export function partnerFor(name, { known = [], songs = [] } = {}) {
  const knownSet = new Set(known);
  const prio = PRIORITY_PAIRS.filter((p) => p.includes(name)).map(([a, b]) => (a === name ? b : a));
  const knownPrio = prio.find((c) => knownSet.has(c));
  if (knownPrio) return knownPrio;

  const counts = new Map();
  for (const s of songs ?? []) {
    if (!s?.chords?.includes(name)) continue;
    const seq = chordSequence(s.text);
    seq.forEach((c, i) => {
      if (c !== name) return;
      for (const nb of [seq[i - 1], seq[i + 1]]) if (nb && nb !== name) counts.set(nb, (counts.get(nb) ?? 0) + 1);
    });
  }
  const neighbours = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c);
  return neighbours.find((c) => knownSet.has(c))
    ?? known.find((c) => c !== name)
    ?? prio[0]
    ?? neighbours[0]
    ?? (name === 'C' ? 'Am' : 'C');
}

/**
 * Небольшой праздник по числу известных аккордов.
 * @param {number} n
 * @returns {string|null}
 */
export function knownMilestone(n) {
  const text = {
    1: 'Первый аккорд в копилке.',
    2: 'Два аккорда — уже можно играть «Братца Якова».',
    4: 'Четыре аккорда — это сотни песен.',
    8: 'Восемь аккордов. Почти любой дворовый хит твой.',
    12: 'Двенадцать аккордов — серьёзный репертуар.',
    20: 'Двадцать аккордов. Ты уже не новичок.',
  };
  return text[n] ?? null;
}

/**
 * Когда аккорд попал в копилку: «выучен сегодня», «выучен вчера», «выучен 12 нояб.».
 * @param {string} since 'YYYY-MM-DD'
 * @param {string} today 'YYYY-MM-DD'
 * @returns {string}
 */
export function knownSinceText(since, today) {
  const day = formatDay(since, { today });
  return day ? `выучен ${day}` : 'выучен';
}

/**
 * «Ты знаешь N аккордов».
 * @param {number} n
 * @returns {string}
 */
export function knownTitle(n) {
  if (!n) return 'Пока ни одного аккорда';
  return `Ты знаешь ${n} ${plural(n, ['аккорд', 'аккорда', 'аккордов'])}`;
}

// ---------- инструменты ----------

/** Инструменты вкладки «Тюнер» — параметр маршрута /tools/:tool. */
export const TOOL_IDS = Object.freeze(['tuner', 'metronome', 'omc']);

/**
 * Инструмент по параметру маршрута; неизвестный → тюнер.
 * @param {string|undefined} param
 * @returns {'tuner'|'metronome'|'omc'}
 */
export function toolFromParam(param) {
  return TOOL_IDS.includes(param) ? /** @type {any} */ (param) : 'tuner';
}

/**
 * Темп из query (?bpm=96) для метронома.
 * @param {string|undefined} raw
 * @returns {number|undefined}
 */
export function bpmFromQuery(raw) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 20 && n <= 300 ? n : undefined;
}

/**
 * Рекорды «смен за минуту» по парам: свежие сверху.
 * recordToday — сегодня побит прошлый рекорд (нужна хотя бы одна прошлая попытка).
 * @param {Record<string, {best?: number, last?: number, history?: {day: string, count: number}[]}>} pairs
 * @param {{today?: string}} [opts]
 * @returns {{key: string, a: string, b: string, best: number, last: number, lastDay: string|null, counts: number[],
 *   recordToday: boolean}[]}
 */
export function pairRecords(pairs, { today } = {}) {
  return Object.entries(pairs ?? {})
    .map(([key, rec]) => {
      const [a, b] = key.split('|');
      const history = Array.isArray(rec?.history) ? rec.history : [];
      const counts = history.map((h) => Math.max(0, Number(h?.count) || 0));
      const lastDay = history[history.length - 1]?.day ?? null;
      const best = Math.max(Number(rec?.best) || 0, ...counts, 0);
      const before = counts.slice(0, -1);
      const prevBest = before.length ? Math.max(...before) : 0;
      const recordToday = Boolean(today) && lastDay === today && before.length > 0 && counts[counts.length - 1] > prevBest;
      return { key, a, b, best, last: Number(rec?.last) || counts[counts.length - 1] || 0, lastDay, counts, recordToday };
    })
    .filter((r) => r.a && r.b)
    .sort((x, y) => String(y.lastDay ?? '').localeCompare(String(x.lastDay ?? '')) || y.best - x.best);
}

/**
 * Точки мини-графика (SVG polyline) по значениям: масштаб от минимума до максимума, отступы по краям.
 * @param {number[]} values
 * @param {{width?: number, height?: number, pad?: number}} [opts]
 * @returns {{points: string, last: {x: number, y: number}}|null}
 */
export function sparkline(values, { width = 80, height = 28, pad = 3 } = {}) {
  const v = (values ?? []).map(Number).filter(Number.isFinite);
  if (!v.length) return null;
  const series = v.length === 1 ? [v[0], v[0]] : v;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const w = width - pad * 2;
  const h = height - pad * 2;
  const r = (x) => Math.round(x * 10) / 10;
  const pts = series.map((val, i) => ({
    x: r(pad + (series.length > 1 ? (i / (series.length - 1)) * w : w / 2)),
    y: r(max === min ? height / 2 : pad + (1 - (val - min) / (max - min)) * h),
  }));
  return { points: pts.map((p) => `${p.x},${p.y}`).join(' '), last: pts[pts.length - 1] };
}

/**
 * Пара для тренажёра смен при открытии: из query (a, b) → самая слабая → последняя тренированная →
 * два первых известных → C и Am.
 * @param {{a?: string, b?: string}} query
 * @param {{known?: string[], weak?: [string, string][], records?: {a: string, b: string}[]}} [opts]
 * @returns {[string, string]}
 */
export function initialPair(query, { known = [], weak = [], records = [] } = {}) {
  const qa = query?.a ? normalizeQuery(query.a)?.name ?? null : null;
  const qb = query?.b ? normalizeQuery(query.b)?.name ?? null : null;
  if (qa && qb && qa !== qb) return [qa, qb];
  if (qa) {
    const other = known.find((c) => c !== qa) ?? (qa === 'C' ? 'Am' : 'C');
    return [qa, other];
  }
  if (weak[0]) return [weak[0][0], weak[0][1]];
  if (records[0]) return [records[0].a, records[0].b];
  if (known.length >= 2) return [known[0], known[1]];
  return ['C', 'Am'];
}

/**
 * Поменять один аккорд пары. Если совпал со вторым — второй встаёт на место прежнего (обмен).
 * @param {[string, string]} pair
 * @param {0|1} index
 * @param {string} value
 * @returns {[string, string]}
 */
export function setPairSlot(pair, index, value) {
  const next = /** @type {[string, string]} */ ([...pair]);
  next[index] = value;
  if (next[0] === next[1]) next[1 - index] = pair[index];
  return next;
}

/**
 * Варианты для выбора аккорда в паре: известные и все остальные из словаря (плюс лишние, например из query).
 * @param {string[]} known
 * @param {string[]} [extra]
 * @returns {{known: string[], other: string[]}}
 */
export function pairOptions(known, extra = []) {
  const k = [...new Set(known)].filter(hasShape);
  const seen = new Set(k);
  const other = [];
  for (const n of [...DICTIONARY_ORDER, ...extra]) {
    if (!n || seen.has(n) || !hasShape(n)) continue;
    seen.add(n);
    other.push(n);
  }
  return { known: k, other };
}

/** Ключ пары (отсортированный) — реэкспорт для экрана. */
export { pairKey };

// ---------- настройки ----------

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Имя файла резервной копии по местной дате: uke-backup-2026-11-14.json.
 * @param {Date} [date]
 * @returns {string}
 */
export function backupFileName(date = new Date()) {
  return `uke-backup-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.json`;
}

/** Время напоминания по умолчанию. */
export const DEFAULT_REMINDER = '19:00';

/**
 * «19:30» → {hour: 19, minute: 30}; неверное → null.
 * @param {string} value
 * @returns {{hour: number, minute: number}|null}
 */
export function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Версия сборки из адреса скрипта: 'assets/app.js?v=3f9a1c' → '3f9a1c'.
 * @param {string|null|undefined} src
 * @returns {string|null}
 */
export function versionFromSrc(src) {
  const m = /[?&]v=([^&#]+)/.exec(String(src ?? ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Итог загрузки резервной копии по-человечески.
 * @param {{added: number, updated: number, skipped: number}} r результат importData
 * @returns {string}
 */
export function importMessage({ added = 0, updated = 0, skipped = 0 } = {}) {
  const parts = [];
  if (added) parts.push(`${added} ${plural(added, ['новая песня', 'новые песни', 'новых песен'])}`);
  if (updated) parts.push(`${updated} ${plural(updated, ['песня обновлена', 'песни обновлены', 'песен обновлено'])}`);
  let text = parts.length ? `Готово: ${parts.join(', ')}. Прогресс и настройки — из файла.` : 'Готово. Песни уже были на месте, прогресс и настройки взяты из файла.';
  if (skipped) text += ` Пропущено испорченных записей: ${skipped}.`;
  return text;
}

/**
 * Состояние хранилища для карточки «Данные».
 * @param {{available: boolean, persistent: boolean|null}} storage
 * @returns {{tone: 'success'|'warn'|'danger', title: string, text: string, canAsk: boolean}}
 */
export function storageInfo(storage) {
  if (!storage?.available) {
    return {
      tone: 'danger',
      title: 'Данные не сохраняются',
      text: 'Браузер не дал базу (приватная вкладка?). Всё пропадёт после закрытия — сохрани копию.',
      canAsk: false,
    };
  }
  if (storage.persistent) {
    return {
      tone: 'success',
      title: 'Хранилище надёжное',
      text: 'Браузер обещал не удалять данные. Копия раз в месяц всё равно не помешает.',
      canAsk: false,
    };
  }
  return {
    tone: 'warn',
    title: 'Браузер может почистить данные',
    text: 'Когда мало места, он вправе стереть прогресс. Сохраняй копию раз в неделю.',
    canAsk: true,
  };
}

/**
 * Подсказка к недельной цели: «≈ 10 мин в день».
 * @param {number} minutes
 * @returns {string}
 */
export function weeklyHint(minutes) {
  const perDay = Math.max(1, Math.round((Number(minutes) || 0) / 7));
  return `≈ ${perDay} мин в день`;
}

/**
 * Адрес приложения с маршрутом: 'https://x.github.io/ukulele/?a=1#/songs' + '/practice' → '…/ukulele/#/practice'.
 * @param {string} href
 * @param {string} path
 * @returns {string}
 */
export function appUrl(href, path) {
  const base = String(href ?? '').split('#')[0].split('?')[0];
  return `${base}#${path}`;
}

/**
 * Сколько дней назад была копия — подпись под кнопкой экспорта.
 * @param {number|null} ts время последней копии (мс)
 * @param {number} [now]
 * @returns {string}
 */
export function lastBackupText(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || ts <= 0) return 'Копий ещё не было';
  const days = Math.floor((now - ts) / 86400000);
  if (days <= 0) return 'Последняя копия — сегодня';
  if (days === 1) return 'Последняя копия — вчера';
  return `Последняя копия — ${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
}
