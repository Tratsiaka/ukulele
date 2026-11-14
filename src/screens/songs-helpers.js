// Чистые помощники экранов «Песни» и «Добавить песню»: фильтры библиотеки, бейдж «можно сыграть», слияние выдачи
// поиска, догадка названия и исполнителя из «Поделиться», разбор вставленного текста. Без DOM — тестируется в node.

import { bestKey, songDifficulty, simplifyName } from '../core/playable.js';
import { detectFormat, guessKey, parseSong, songChords } from '../core/song.js';
import { noteName, preferFlatsForKey } from '../core/chord.js';
import { SOURCES, searchKey } from '../sources/index.js';
import { chordLabel } from '../lib/format.js';

// ---------- статусы и фильтры ----------

/** Статусы песни для переключателя. */
export const STATUS_OPTIONS = Object.freeze([
  { value: 'new', label: 'Новая' },
  { value: 'learning', label: 'Учу' },
  { value: 'playing', label: 'Играю' },
  { value: 'polished', label: 'Готова' },
]);

/** @param {string} status @returns {string} */
export function statusLabel(status) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? 'Новая';
}

/** Фильтры вкладки «Мои» (query-параметр f). */
export const FILTERS = Object.freeze(['all', 'playing', 'playable', 'fav']);
export const FILTER_LABELS = Object.freeze({
  all: 'Все', playing: 'Играю сейчас', playable: 'Можно сыграть', fav: 'Избранное',
});

/** @param {string|undefined} f @returns {'all'|'playing'|'playable'|'fav'} */
export function normalizeFilter(f) {
  return FILTERS.includes(/** @type {any} */ (f)) ? /** @type {any} */ (f) : 'all';
}

/** «Играю сейчас»: песня в работе (учу или играю). */
export function isPlayingNow(song) {
  return song?.status === 'learning' || song?.status === 'playing';
}

/**
 * Песни под фильтр. info(song) → {playable} (для «Можно сыграть»).
 * @template {{status?: string, fav?: boolean}} S
 * @param {S[]} list
 * @param {string} filter
 * @param {(s: S) => {playable: boolean}|undefined} info
 * @returns {S[]}
 */
export function filterSongs(list, filter, info) {
  switch (normalizeFilter(filter)) {
    case 'playing': return list.filter(isPlayingNow);
    case 'playable': return list.filter((s) => Boolean(info(s)?.playable));
    case 'fav': return list.filter((s) => Boolean(s.fav));
    default: return list.slice();
  }
}

/** Сколько песен в каждом фильтре. */
export function filterCounts(list, info) {
  return Object.fromEntries(FILTERS.map((f) => [f, filterSongs(list, f, info).length]));
}

/** Когда песню последний раз трогали: игра или изменение. */
export function recentAt(song) {
  return Math.max(Number(song?.lastPlayedAt) || 0, Number(song?.updatedAt) || 0);
}

/** Свежие сверху (недавно игранные или изменённые), при равенстве — по названию. */
export function sortRecent(list) {
  return list.slice().sort((a, b) => recentAt(b) - recentAt(a) || String(a.title).localeCompare(String(b.title), 'ru'));
}

// ---------- аккорды, тональность, бейдж ----------

/**
 * Знаком ли аккорд: он сам или его упрощение (Am7 → Am) среди известных.
 * @param {string} name
 * @param {Set<string>} known
 */
export function isKnownChord(name, known) {
  if (!name || !known?.size) return false;
  return known.has(name) || known.has(simplifyName(name));
}

/** Сдвиг для людей: 3 → '+3', −3 → '−3' (настоящий минус). */
export function formatShift(n) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${-v}`;
  return '0';
}

/**
 * Тональность песни после сдвига на shift полутонов (по её аккордам): ['Dm','Gm','A7'], −5 → 'Am'.
 * @param {string[]} chords
 * @param {number} shift
 * @returns {string}
 */
export function shiftedKeyName(chords, shift) {
  const song = { title: '', artist: '', sections: [{ label: null, kind: 'verse', lines: [{ type: 'chords', chords: [...chords] }] }] };
  const key = guessKey(/** @type {any} */ (song));
  const root = (((key.root + Math.round(shift)) % 12) + 12) % 12;
  return noteName(root, preferFlatsForKey(root, key.minor) ? true : undefined, key.minor) + (key.minor ? 'm' : '');
}

/**
 * @typedef {{kind: 'playable'|'shift'|'missing'|'none', text: string, shift: number, missing: string[]}} PlayBadgeInfo
 * playable — играется как есть; shift — играется в другой тональности; missing — не хватает аккордов; none — аккордов нет.
 */

/**
 * Бейдж «можно сыграть» / «в Am (−3)» / «не хватает F» / «не хватает 2».
 * @param {string[]|undefined} chords
 * @param {string[]} knownNames
 * @param {{best?: {shift: number, missing: string[], playable: boolean}, notation?: 'B'|'H'}} [opts]
 * @returns {PlayBadgeInfo}
 */
export function playBadge(chords, knownNames, { best, notation = 'B' } = {}) {
  if (!chords?.length) return { kind: 'none', text: 'аккорды не нашлись', shift: 0, missing: [] };
  const b = best ?? bestKey(chords, knownNames);
  if (b.playable && b.shift === 0) return { kind: 'playable', text: 'можно сыграть', shift: 0, missing: [] };
  if (b.playable) {
    const key = chordLabel(shiftedKeyName(chords, b.shift), { notation });
    return { kind: 'shift', text: `в ${key} (${formatShift(b.shift)})`, shift: b.shift, missing: [] };
  }
  const n = b.missing.length;
  const text = n === 1 ? `не хватает ${chordLabel(b.missing[0], { notation })}` : `не хватает ${n}`;
  return { kind: 'missing', text, shift: b.shift, missing: b.missing };
}

/**
 * Всё, что список показывает о песне: лучшая тональность, бейдж, звёзды сложности.
 * @param {string[]|undefined} chords
 * @param {string[]} knownNames
 * @param {{notation?: 'B'|'H', bpm?: number}} [opts]
 * @returns {{playable: boolean, shift: number, missing: string[], badge: PlayBadgeInfo, stars: number, bottleneck: string}}
 */
export function songInfo(chords, knownNames, { notation, bpm } = {}) {
  const list = Array.isArray(chords) ? chords : [];
  const best = list.length ? bestKey(list, knownNames) : { shift: 0, missing: [], playable: false };
  const badge = playBadge(list, knownNames, { best, notation });
  const diff = list.length ? songDifficulty(list, { bpm }) : { stars: 1, bottleneck: '' };
  return { playable: best.playable, shift: best.shift, missing: best.missing, badge, stars: diff.stars, bottleneck: diff.bottleneck };
}

// ---------- поиск: библиотека, адреса, слияние выдачи ----------

/**
 * Песни библиотеки под запрос: каждое слово запроса — начало какого-то слова названия или исполнителя.
 * @template {{title: string, artist?: string}} S
 * @param {S[]} list
 * @param {string} query
 * @param {number} [limit]
 * @returns {S[]}
 */
export function matchLibrary(list, query, limit = 6) {
  const q = searchKey(query);
  if (!q) return [];
  const words = q.split(' ');
  const out = [];
  for (const s of list) {
    const hay = searchKey(`${s.title ?? ''} ${s.artist ?? ''}`).split(' ');
    if (words.every((w) => hay.some((h) => h.startsWith(w)))) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ключ адреса для сравнения: без протокола, www, хвостового «/», регистр не важен. Не адрес → ''. */
export function urlKey(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    let path = u.pathname;
    try { path = decodeURIComponent(path); } catch { /* как есть */ }
    return `${u.hostname.replace(/^www\./, '')}${path.replace(/\/+$/, '')}${u.search}`.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Песня библиотеки с тем же адресом источника.
 * @template {{source?: {url?: string}}} S
 * @param {S[]} list
 * @param {string} url
 * @returns {S|undefined}
 */
export function findByUrl(list, url) {
  const k = urlKey(url);
  if (!k) return undefined;
  return list.find((s) => s.source?.url && urlKey(s.source.url) === k);
}

/** Ключ одной песни в выдаче разных источников: исполнитель + название. */
export function hitKey(hit) {
  return `${searchKey(hit?.artist ?? '')}|${searchKey(hit?.title ?? '')}`;
}

/**
 * Склеивает выдачу всех источников: одна песня — одна группа с версиями. Группы по убыванию лучшей оценки
 * (при равенстве — в порядке появления), версии внутри — по rank (меньше — лучше), затем по оценке.
 * @template {{title: string, artist: string, score?: number}} H
 * @param {H[]} hits
 * @param {{rank?: (h: H) => number}} [opts]
 * @returns {Array<{key: string, score: number, versions: H[]}>}
 */
export function groupHits(hits, { rank = () => 0 } = {}) {
  /** @type {Map<string, {key: string, score: number, order: number, versions: H[]}>} */
  const groups = new Map();
  hits.forEach((h, i) => {
    const key = hitKey(h);
    const g = groups.get(key);
    if (g) {
      g.versions.push(h);
      g.score = Math.max(g.score, h.score ?? 0);
    } else {
      groups.set(key, { key, score: h.score ?? 0, order: i, versions: [h] });
    }
  });
  const out = [...groups.values()];
  for (const g of out) {
    const ranked = g.versions.map((h) => ({ h, r: rank(h) }));
    ranked.sort((a, b) => a.r - b.r || (b.h.score ?? 0) - (a.h.score ?? 0));
    g.versions = ranked.map((x) => x.h);
  }
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  return out.map(({ key, score, versions }) => ({ key, score, versions }));
}

/**
 * Недавние запросы: новый — первым, без повторов и без собственных «недопечатанных» начал.
 * @param {string[]} list
 * @param {string} query
 * @param {number} [max]
 * @returns {string[]}
 */
export function pushRecent(list, query, max = 6) {
  const q = String(query ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return list.slice(0, max);
  const k = q.toLowerCase();
  const rest = (list ?? []).filter((x) => {
    const xk = String(x).toLowerCase();
    return xk !== k && !k.startsWith(xk);
  });
  return [q, ...rest].slice(0, max);
}

const SITE_LABELS = { starter: 'стартовый набор', paste: 'вставлена вручную', file: 'из файла' };

/** Откуда песня, коротко: «akkords.pro», «стартовый набор», «из файла», иначе — домен адреса. */
export function sourceLabel(source) {
  if (!source) return '';
  if (SITE_LABELS[source.site]) return SITE_LABELS[source.site];
  const known = SOURCES.find((s) => s.id === source.site);
  if (known) return known.name;
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Сообщение после сохранения: маленькая радость, если песню уже можно сыграть. */
export function savedMessage(badge) {
  if (badge?.kind === 'playable') return 'Сохранил. Все аккорды тебе знакомы';
  if (badge?.kind === 'shift') return `Сохранил. Можно играть ${badge.text} — все аккорды знакомы`;
  return 'Сохранил в библиотеку';
}

/** Ссылки на поиск на сайтах, которые приложение не читает (только открыть в новой вкладке). */
export function externalSearchLinks(query) {
  const v = encodeURIComponent(String(query ?? '').trim());
  return [
    { id: 'ug', name: 'Ultimate Guitar', url: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${v}` },
    { id: 'amdm', name: 'AmDm', url: `https://amdm.ru/search/?q=${v}` },
  ];
}

// ---------- текст песни: превью и разбор вставки ----------

/**
 * Первые строки песни для превью: подписи частей, строки текста с аккордами, строки аккордов, комментарии.
 * Пустые строки и табы пропускаются.
 * @param {import('../core/song.js').Song|null|undefined} song
 * @param {number} [max]
 * @returns {Array<{type: 'label', text: string} | {type: 'comment', text: string} | {type: 'chords', chords: string[]}
 *   | {type: 'lyrics', segments: {chord: string|null, text: string}[]}>}
 */
export function snippetLines(song, max = 8) {
  const out = [];
  for (const s of song?.sections ?? []) {
    const lines = (s.lines ?? []).filter((l) => l.type === 'lyrics' || l.type === 'chords' || l.type === 'comment');
    if (!lines.length) continue;
    if (s.label && out.length < max - 1) out.push({ type: 'label', text: s.label });
    for (const l of lines) {
      if (out.length >= max) return out;
      if (l.type === 'lyrics') {
        if (l.segments.some((g) => g.chord || g.text.trim())) out.push({ type: 'lyrics', segments: l.segments });
      } else if (l.type === 'chords') {
        if (l.chords.length) out.push({ type: 'chords', chords: l.chords });
      } else if (l.text?.trim()) {
        out.push({ type: 'comment', text: l.text.trim() });
      }
    }
    if (out.length >= max) break;
  }
  return out;
}

export const FORMAT_LABELS = Object.freeze({
  chordpro: 'ChordPro', ug: 'разметка Ultimate Guitar', plain: 'аккорды над строками',
});

/**
 * Разбор вставленного текста для живого превью. Пустой текст → null.
 * @param {string} text
 * @param {{title?: string, artist?: string}} [meta]
 * @returns {null | {format: string, formatLabel: string, song: any, chords: string[], lines: number, parts: number}
 *   | {error: string}}
 */
export function importPreview(text, meta = {}) {
  const src = String(text ?? '');
  if (!src.trim()) return null;
  try {
    const format = detectFormat(src);
    const song = parseSong(src, meta);
    const chords = songChords(song);
    let lines = 0;
    let parts = 0;
    for (const s of song.sections ?? []) {
      const n = (s.lines ?? []).filter((l) => l.type === 'lyrics' || l.type === 'chords').length;
      lines += n;
      if (n) parts++;
    }
    return { format, formatLabel: FORMAT_LABELS[format] ?? format, song, chords, lines, parts };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

/** Разные аккорды в тексте (0, если текст не разбирается). */
export function chordCount(text) {
  try {
    return songChords(parseSong(String(text ?? ''))).length;
  } catch {
    return 0;
  }
}

/** Первый адрес http(s) в тексте или ''. */
export function extractUrl(text) {
  const m = /https?:\/\/[^\s<>"«»]+/i.exec(String(text ?? ''));
  return m ? m[0].replace(/[)\].,;:!?»"']+$/, '') : '';
}

// ---------- название и исполнитель из заголовка страницы ----------

// Служебные слова заголовков песенных сайтов (длинные — раньше коротких).
const NOISE = [
  'аккорды и текст песни', 'аккорды и слова', 'текст и аккорды', 'аккорды для гитары', 'аккорды на гитаре', 'аккорды для укулеле',
  'аккорды на укулеле', 'аккорды песни', 'текст песни', 'слова песни', 'как играть', 'разбор на гитаре', 'для гитары', 'на гитаре',
  'для укулеле', 'на укулеле', 'аккорды', 'табулатура', 'табы', 'разбор', 'укулеле',
  'ukulele chords', 'guitar chords', 'chords and lyrics', 'chords & lyrics', 'chords', 'tabs', 'tab', 'lyrics', 'ukulele', 'ver 2',
  'ver 3', 'ver 1', 'official',
].sort((a, b) => b.length - a.length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOISE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${NOISE.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const DOMAIN_RE = /(?:\s(?:на|on|at)\s+)?(?<![\p{L}\p{N}])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:ru|com|net|pro|org|by|ua|info|me|io|su|cc)(?![\p{L}\p{N}])/giu;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const EDGE_JUNK_RE = /^[\s,.;:|/\\·•–—-]+|[\s,;:|/\\·•–—-]+$/gu;

function tidy(s) {
  let t = String(s ?? '')
    .replace(/[([{]\s*[)\]}]/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(EDGE_JUNK_RE, '')
    .trim();
  t = t.replace(/^["'«“„]+|["'»”“]+$/g, '').trim();
  // КАПСЛОК (как в заголовках Ultimate Guitar) → обычный регистр
  if (t.length > 3 && /\p{Lu}/u.test(t) && !/\p{Ll}/u.test(t)) {
    const lower = t.toLowerCase();
    t = /[а-яё]/i.test(lower)
      ? lower[0].toUpperCase() + lower.slice(1)
      : lower.replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  return t;
}

const stripNoise = (s) => String(s).replace(DOMAIN_RE, ' ').replace(NOISE_RE, ' ');

/**
 * Название и исполнитель из заголовка страницы или того, что прислали через «Поделиться»:
 * «Кино — Группа крови аккорды» → {artist: 'Кино', title: 'Группа крови'};
 * «GRUPPA KROVI CHORDS by Kino @ Ultimate-Guitar.Com» → {title: 'Gruppa Krovi', artist: 'Kino'}.
 * @param {string} raw
 * @returns {{title: string, artist: string}}
 */
export function guessTitleArtist(raw) {
  let s = String(raw ?? '').replace(EMOJI_RE, ' ').replace(/[\s ]+/g, ' ').trim();
  if (!s) return { title: '', artist: '' };
  // Ultimate Guitar и похожие: «Song Chords by Artist @ Site»
  let m = /^(.+?)\s+(?:(?:ukulele|guitar|bass)\s+)?(?:chords|tabs?|ukulele|lyrics)\s+by\s+(.+?)(?:\s+@\s*.*)?$/i.exec(s);
  if (m) return { title: tidy(stripNoise(m[1])), artist: tidy(stripNoise(m[2])) };
  // Имя сайта после « | » или « @ »
  s = s.split(/\s+[|@]\s+/)[0];
  s = tidy(stripNoise(s));
  m = /^(.{1,80}?)\s+[–—-]\s+(.+)$/u.exec(s);
  if (m) {
    const artist = tidy(m[1]);
    const title = tidy(m[2]);
    if (artist && title) return { title, artist };
  }
  m = /^(.+?)\s+by\s+(.+)$/i.exec(s);
  if (m && !/[а-яё]/i.test(s)) return { title: tidy(m[1]), artist: tidy(m[2]) };
  return { title: tidy(s), artist: '' };
}

/** Имя файла → название: «kino_-_gruppa_krovi.chordpro» → {artist: 'kino', title: 'gruppa krovi'}. */
export function guessFromFileName(name) {
  const base = String(name ?? '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[_]+/g, ' ');
  return guessTitleArtist(base);
}

/**
 * Что пришло через «Поделиться» (параметры Share Target).
 * mode: 'text' — пришёл текст с аккордами; 'url' — есть только адрес; 'hint' — ни текста с аккордами, ни адреса;
 * 'none' — делиться было нечем.
 * @param {{title?: string, text?: string, url?: string}} [q]
 * @returns {{mode: 'text'|'url'|'hint'|'none', text: string, url: string, title: string, artist: string}}
 */
export function analyzeShare(q = {}) {
  const rawTitle = String(q.title ?? '').trim();
  const rawText = String(q.text ?? '').replace(/\r\n?/g, '\n');
  const url = String(q.url ?? '').trim() || extractUrl(rawText);
  if (!rawTitle && !rawText.trim() && !url) return { mode: 'none', text: '', url: '', title: '', artist: '' };

  // Отдельная строка с адресом в начале или в конце текста — не часть песни.
  let body = rawText;
  if (url) {
    const lines = body.split('\n');
    const isUrlLine = (l) => l.trim() === url || l.trim() === String(q.url ?? '').trim() || /^https?:\/\/\S+$/.test(l.trim());
    while (lines.length && (!lines[0].trim() || isUrlLine(lines[0]))) lines.shift();
    while (lines.length && (!lines[lines.length - 1].trim() || isUrlLine(lines[lines.length - 1]))) lines.pop();
    body = lines.join('\n');
  }
  body = body.replace(/^\n+|\s+$/g, '');

  const hasChords = chordCount(body) >= 2;
  // Без заголовка иногда сам текст — это заголовок страницы
  const titleSource = rawTitle || (!hasChords && body && !body.includes('\n') && body.length <= 120 ? body : '');
  const { title, artist } = guessTitleArtist(titleSource);
  if (hasChords) return { mode: 'text', text: body, url, title, artist };
  if (url) return { mode: 'url', text: '', url, title, artist };
  return { mode: 'hint', text: '', url: '', title, artist };
}
