// Общие помощники источников: ключ поиска, похожесть строк, язык текста, сетевые запросы с таймаутом,
// «предохранитель» источников. Чистый модуль без DOM: работает в браузере и в node --test.

import { isChordToken } from '../core/chord.js';

/** Сколько ждём один ответ сайта. */
export const TIMEOUT_MS = 12000;
/** Ключ localStorage для предохранителя. */
export const BREAKER_KEY = 'uke:breaker';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- ошибки ----------

const ERROR_TEXT = {
  timeout: 'не отвечает',
  network: 'нет связи',
  http: 'сайт ответил ошибкой',
  rate: 'просит подождать',
  parse: 'непонятный ответ',
  skipped: 'отдыхает до завтра',
  unknown: 'не умею загружать отсюда',
  notfound: 'песня не нашлась',
};

/** Ошибка источника. code: timeout | network | http | rate | parse | skipped | unknown | notfound. message — коротко по-русски для UI. */
export class SourceError extends Error {
  /**
   * @param {string} code
   * @param {{status?: number, retryAfter?: number, cause?: unknown, message?: string}} [extra]
   */
  constructor(code, extra = {}) {
    super(extra.message ?? ERROR_TEXT[code] ?? 'ошибка');
    this.name = 'SourceError';
    this.code = code;
    if (extra.status != null) this.status = extra.status;
    if (extra.retryAfter != null) this.retryAfter = extra.retryAfter;
    if (extra.cause) this.cause = extra.cause;
  }
}

/** Ошибка отмены (как у fetch). */
export function abortError() {
  const e = new Error('Отменено');
  e.name = 'AbortError';
  return e;
}

/** Это отмена пользователем (а не сбой источника)? */
export function isAbort(err, signal) {
  return err?.name === 'AbortError' || !!signal?.aborted;
}

// ---------- сеть ----------

/**
 * GET и разбор JSON с таймаутом и внешним AbortSignal. Тело читается целиком под тем же таймаутом.
 * 404 не считается ошибкой: вернётся {status: 404, data}. Остальные коды не 2xx → SourceError.
 * @param {string} url
 * @param {{signal?: AbortSignal, timeoutMs?: number, headers?: Record<string, string>, fetch?: typeof fetch}} [opts]
 * @returns {Promise<{status: number, data: any, headers: Headers|undefined}>}
 */
export async function getJson(url, opts = {}) {
  const { signal, timeoutMs = TIMEOUT_MS, headers } = opts;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (signal?.aborted) throw abortError();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    let res;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, headers, mode: 'cors', credentials: 'omit' });
    } catch (cause) {
      throw new SourceError('network', { cause });
    }
    if (res.status === 429) {
      const ra = Number(res.headers?.get?.('retry-after'));
      throw new SourceError('rate', { status: 429, retryAfter: Number.isFinite(ra) ? ra : undefined });
    }
    if (!res.ok && res.status !== 404) throw new SourceError('http', { status: res.status });
    let text;
    try { text = await res.text(); } catch (cause) { throw new SourceError('network', { cause }); }
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (cause) {
      if (res.status !== 404) throw new SourceError('parse', { cause });
    }
    return { status: res.status, data, headers: res.headers };
  } catch (err) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new SourceError('timeout');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

// ---------- текст ----------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', prime: '′',
  shy: '', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', times: '×', deg: '°', sharp: '♯', flat: '♭',
};

/** Раскодирует HTML-сущности (&amp; &#8220; &#x2014; &laquo; …) без DOM — для заголовков из WP REST. */
export function decodeEntities(str) {
  return String(str ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const v = NAMED_ENTITIES[ent.toLowerCase()];
    return v ?? m;
  });
}

/** Убирает теги и раскодирует сущности; пробелы схлопывает. Для коротких строк (заголовки, рубрики). */
export function plainText(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/[\s ]+/g, ' ').trim();
}

// Скобки с пометкой саундтрека: (OST …), [OST], (из к/ф …), (саундтрек …).
const OST_RE = /[(\[][^)\]]*(?:\bost\b|o\.s\.t|саундтрек|soundtrack|из\s+(?:к\/ф|м\/ф|т\/с|кинофильма|фильма|сериала|мультфильма))[^)\]]*[)\]]/giu;
// «feat. …», «ft. …», «при участии …» — до конца строки.
const FEAT_RE = /[([]?\s*(?:\bfeat\b\.?|\bft\.|\bfeaturing\b|при\s+уч(?:\.|астии))\s.*$/iu;

/**
 * Ключ для поиска и сравнения: нижний регистр, ё→е, і→и, ў→у (й сохраняется), без диакритики и пунктуации,
 * без «(OST …)» и «feat. …».
 * @param {string} s
 * @returns {string}
 */
export function searchKey(s) {
  let t = decodeEntities(String(s ?? '')).toLowerCase();
  t = t.replace(OST_RE, ' ').replace(FEAT_RE, ' ');
  t = t.normalize('NFD').replace(/й/g, 'й').replace(/\p{M}+/gu, '').normalize('NFC');
  t = t.replace(/і/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г');
  t = t.replace(/['’`ʼ]/g, '');
  return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(key) {
  return key ? key.split(' ').filter(Boolean) : [];
}

// Совпадение слов: точное — 1, общая основа (кровь/крови) — 0,8.
function tokenMatch(a, b) {
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  if (min < 3) return 0;
  let p = 0;
  while (p < min && a[p] === b[p]) p++;
  if (p === min && min >= 3) return 0.8; // одно слово — начало другого
  return p >= 4 && p >= 0.6 * Math.max(a.length, b.length) ? 0.8 : 0;
}

/** Какая доля слов a найдена среди слов b (0..1). */
export function coverage(a, b) {
  if (!a.length || !b.length) return 0;
  let sum = 0;
  for (const x of a) {
    let best = 0;
    for (const y of b) { best = Math.max(best, tokenMatch(x, y)); if (best === 1) break; }
    sum += best;
  }
  return sum / a.length;
}

function bigrams(s) {
  const out = new Map();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Коэффициент Дайса по биграммам символов (0..1). */
export function bigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) ?? 0);
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

/** Похожесть двух строк (ключи считаются внутри), симметричная, 0..1. */
export function similarity(a, b) {
  const ka = searchKey(a), kb = searchKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ta = tokens(ka), tb = tokens(kb);
  return 0.35 * coverage(ta, tb) + 0.35 * coverage(tb, ta) + 0.3 * bigramDice(ka, kb);
}

/**
 * Насколько песня (название + исполнитель) подходит под запрос, 0..1. Запрос может содержать исполнителя в любом месте.
 * @param {string} query
 * @param {{title: string, artist?: string}} song
 */
export function matchScore(query, { title, artist = '' }) {
  const q = searchKey(query), t = searchKey(title), a = searchKey(artist);
  if (!q || !t) return 0;
  if (q === t || q === `${a} ${t}` || q === `${t} ${a}`) return 1;
  const qT = tokens(q), tT = tokens(t), aT = tokens(a);
  const covAll = coverage(qT, [...tT, ...aT]); // все слова запроса нашлись в названии или исполнителе
  const titleCov = coverage(tT, qT);            // название целиком есть в запросе (длинные названия — ниже)
  const covT = coverage(qT, tT);
  return Math.min(0.99, 0.45 * covAll + 0.25 * titleCov + 0.2 * covT + 0.1 * bigramDice(q, t));
}

// ---------- язык ----------

const EN_WORDS = new Set(('the and you i to a my me of in is it your on for that be we all with but so oh love do what this when no are ' +
  'was can just dont down will im she he her his they not go got like now one time know up way day there come baby').split(' '));

/**
 * Язык текста песни по буквам: ru | be | uk | en | other. Аккорды и директивы ChordPro не учитываются.
 * Беларуский: і и ў без «и»; украинский: ї є ґ, і вместе с «и», без ы э ё.
 * @param {string} text
 */
export function detectLang(text) {
  const words = String(text ?? '')
    .replace(/\{[^}\n]*\}/g, ' ').replace(/\[[^\]\n]*\]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !isChordToken(w.replace(/^[(|]+|[),.;:!?|]+$/g, '')));
  const body = words.join(' ').toLowerCase();
  const count = (re) => (body.match(re) || []).length;
  const cyr = count(/[Ѐ-ӿ]/g);
  const lat = count(/[a-zÀ-ɏ]/g);
  if (!cyr && !lat) return 'other';
  if (cyr >= lat) {
    const ukOnly = count(/[їєґ]/g), beOnly = count(/ў/g), i = count(/і/g), ruI = count(/и/g), ruLike = count(/[ыэёъ]/g);
    if (i + ruI === 0) return beOnly ? 'be' : ukOnly ? 'uk' : 'ru';
    const r = i / (i + ruI);
    if (r >= 0.85) return ukOnly > beOnly && ruLike === 0 ? 'uk' : 'be';
    if (r >= 0.15) return ukOnly > 0 || ruLike === 0 ? 'uk' : beOnly ? 'be' : 'ru';
    return 'ru';
  }
  const latWords = body.split(' ').filter((w) => /[a-zÀ-ɏ]/.test(w)).map((w) => w.replace(/[^a-zÀ-ɏ]/g, ''));
  const stop = latWords.filter((w) => EN_WORDS.has(w)).length / Math.max(1, latWords.length);
  const diacritics = count(/[À-ɏ]/g) / lat;
  if (stop >= 0.2 || (stop >= 0.1 && diacritics < 0.02)) return 'en';
  if (latWords.length < 8 && diacritics === 0) return 'en';
  return 'other';
}

// ---------- предохранитель ----------

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** localStorage, если он есть и пишется; иначе null. */
export function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.setItem('uke:__probe', '1');
    ls.removeItem('uke:__probe');
    return ls;
  } catch {
    return null;
  }
}

/**
 * Предохранитель источников: после `threshold` сбоев подряд источник пропускается `cooldownMs`.
 * Состояние — JSON в storage по ключу `uke:breaker`; если storage недоступен или падает — живёт в памяти.
 * @param {{storage?: {getItem, setItem}|null, now?: () => number, threshold?: number, cooldownMs?: number, key?: string}} [opts]
 * @returns {{isOpen(id: string): boolean, until(id: string): number, failure(id: string): void, success(id: string): void, reset(id?: string): void}}
 */
export function createBreaker(opts = {}) {
  const { now = () => Date.now(), threshold = 3, cooldownMs = DAY_MS, key = BREAKER_KEY } = opts;
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const memory = memoryStorage();
  let mem = {};

  const read = () => {
    try {
      const raw = storage ? storage.getItem(key) : memory.getItem(key);
      const v = raw ? JSON.parse(raw) : {};
      mem = v && typeof v === 'object' ? v : {};
    } catch { /* остаёмся на копии в памяти */ }
    return mem;
  };
  const write = (state) => {
    mem = state;
    const raw = JSON.stringify(state);
    try {
      if (storage) storage.setItem(key, raw); else memory.setItem(key, raw);
    } catch { memory.setItem(key, raw); }
  };

  return {
    isOpen(id) {
      const e = read()[id];
      return !!e?.until && now() < e.until;
    },
    until(id) {
      const e = read()[id];
      return e?.until && now() < e.until ? e.until : 0;
    },
    failure(id) {
      const state = { ...read() };
      const e = { fails: 0, ...(state[id] ?? {}) };
      if (e.until && now() >= e.until) { e.until = 0; e.fails = 0; }
      e.fails += 1;
      if (e.fails >= threshold) { e.until = now() + cooldownMs; e.fails = 0; }
      state[id] = e;
      write(state);
    },
    success(id) {
      const state = { ...read() };
      if (!(id in state)) return;
      delete state[id];
      write(state);
    },
    reset(id) {
      if (id == null) { write({}); return; }
      const state = { ...read() };
      delete state[id];
      write(state);
    },
  };
}
