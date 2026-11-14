// Адаптер WordPress REST для akkords.pro и dieza.net: поиск, загрузка записи, название/исполнитель, фильтр шума, ранжирование.
// Оба сайта отражают Origin в CORS, поэтому PWA ходит к ним напрямую. Разбор аккордов — в index.js (через core/song.js).

import { htmlToText } from './html-to-text.js';
import { getJson, plainText, matchScore, searchKey, SourceError, TIMEOUT_MS } from './util.js';

/**
 * @typedef {{id: string, name: string, site: string, langs: string[], note: string, perPage: number,
 *   songPath: RegExp, filterNoise: boolean}} WpSite
 */

/** @type {Record<string, WpSite>} */
export const WP_SITES = {
  akkords: {
    id: 'akkords', name: 'akkords.pro', site: 'https://akkords.pro', langs: ['ru'],
    note: 'Около 1,3 тыс. популярных песен, часто со схемой боя',
    perPage: 10, songPath: /\/songs\//, filterNoise: false,
  },
  dieza: {
    id: 'dieza', name: 'dieza.net', site: 'https://dieza.net', langs: ['ru', 'be', 'uk', 'en'],
    note: 'Больше 80 тыс. песен, русские и зарубежные; отвечает не спеша',
    perPage: 20, songPath: /\/akkordy\//, filterNoise: true,
  },
};

// _links нужен, чтобы сработал _embed (рубрика = исполнитель приходит в том же ответе).
const FIELDS = 'id,title,link,content,categories,_links,_embedded';
// Общий бюджет на поиск в одном источнике (несколько попыток подряд).
const SEARCH_BUDGET_MS = 20000;

/**
 * URL поиска записей. titleOnly — искать только в названиях (search_columns=post_title, WP 6.2+).
 * @param {WpSite} site
 * @param {string} query
 * @param {{titleOnly?: boolean, perPage?: number}} [opts]
 */
export function buildSearchUrl(site, query, { titleOnly = true, perPage = site.perPage } = {}) {
  const p = new URLSearchParams({ search: query, per_page: String(perPage), _fields: FIELDS, _embed: 'wp:term' });
  if (titleOnly) p.set('search_columns', 'post_title');
  return `${site.site}/wp-json/wp/v2/posts?${p}`;
}

/** URL одной записи по id или по slug. */
export function buildPostUrl(site, { postId, slug }) {
  const p = new URLSearchParams({ _fields: FIELDS, _embed: 'wp:term' });
  if (postId != null) return `${site.site}/wp-json/wp/v2/posts/${encodeURIComponent(postId)}?${p}`;
  p.set('slug', slug);
  return `${site.site}/wp-json/wp/v2/posts?${p}`;
}

/** Рубрики записи из _embedded: [{name, slug}]. */
export function postCategories(post) {
  const groups = post?._embedded?.['wp:term'];
  if (!Array.isArray(groups)) return [];
  return groups.flat().filter((t) => t && t.taxonomy === 'category').map((t) => ({ name: plainText(t.name), slug: String(t.slug ?? '') }));
}

// Рубрика-сборник, а не исполнитель: «Авторские песни», «Песни из фильмов», «Евровидение (конкурс песни)».
const GENERIC_CATEGORY_RE = /(?:^|[\s(])(?:песни|песня|сборник|разное|разные|ost|саундтреки?|евровидение|народные|uncategorized|без рубрики)(?!\p{L})/iu;

/** «Beatles, The» → «The Beatles». */
function fixArtist(name) {
  const m = /^(.+),\s*(the|die|les|los|la|le)$/i.exec(name.trim());
  return m ? `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${m[1]}` : name.trim();
}

/**
 * Название и исполнитель записи. Исполнитель — рубрика; если рубрика-сборник, а в названии «Исполнитель – Песня»,
 * делим название по тире.
 * @param {string} rawTitle  title.rendered (с HTML-сущностями)
 * @param {Array<{name: string, slug: string}>} categories
 */
export function splitTitleArtist(rawTitle, categories = []) {
  const title = plainText(rawTitle);
  const cat = categories.find((c) => c.name) ?? null;
  const generic = !cat || GENERIC_CATEGORY_RE.test(cat.name) || /peredelan|parodi|avtorsk|sbornik|raznoe/.test(cat.slug);
  if (generic) {
    const m = /^(.{2,60}?)\s+[–—-]\s+(.{2,})$/.exec(title);
    if (m) return { title: m[2].trim(), artist: fixArtist(m[1]) };
  }
  return { title, artist: cat ? fixArtist(cat.name) : '' };
}

// Пародии, переделки, переводы, каверы — в выдаче dieza их много.
const NOISE_TITLE_RE = /пароди|переделк|переделан|перевод|translation|кавер|\bcover\b|remix|ремикс|mashup|мэшап|караоке|минусовк|прикол/iu;
const NOISE_CATEGORY_RE = /peredelan|parodi|перевод|переделан|пароди/iu;

/**
 * Явный шум: пародии и переделки (по названию, рубрике, адресу) и переводы вида «Blood Type (Группа крови)»
 * — скобка на другом алфавите, чем название.
 * @param {{title: string, url?: string, categories?: Array<{name: string, slug: string}>}} post
 */
export function isNoisePost({ title, url = '', categories = [] }) {
  const t = plainText(title);
  if (NOISE_TITLE_RE.test(t) || NOISE_CATEGORY_RE.test(url)) return true;
  if (categories.some((c) => NOISE_CATEGORY_RE.test(c.name) || NOISE_CATEGORY_RE.test(c.slug))) return true;
  const paren = /^([^()]+)\(([^()]+)\)\s*$/.exec(t);
  if (paren && !/\bost\b|feat|\bft\b|из\s/iu.test(paren[2])) {
    const script = (s) => {
      const cyr = (s.match(/[Ѐ-ӿ]/g) || []).length, lat = (s.match(/[a-z]/gi) || []).length;
      return cyr + lat < 3 ? null : cyr > lat ? 'cyr' : 'lat';
    };
    const a = script(paren[1]), b = script(paren[2]);
    if (a && b && a !== b) return true;
  }
  return false;
}

/**
 * Запись WP → разобранный пост. null, если это не песня (статья блога и т. п.).
 * @param {object} post  элемент ответа /wp/v2/posts
 * @param {WpSite} site
 * @param {{parser?: any}} [opts]
 * @returns {{postId: number, title: string, artist: string, url: string, rawTitle: string,
 *   categories: Array<{name: string, slug: string}>, rawText: string}|null}
 */
export function parsePost(post, site, { parser } = {}) {
  if (!post || post.id == null) return null;
  const url = String(post.link ?? '');
  if (url && site.songPath && !site.songPath.test(url)) return null;
  const categories = postCategories(post);
  const rawTitle = String(post.title?.rendered ?? post.title ?? '');
  const { title, artist } = splitTitleArtist(rawTitle, categories);
  const html = String(post.content?.rendered ?? '');
  const rawText = html ? htmlToText(html, { parser }) : '';
  return { postId: Number(post.id), title, artist, url, rawTitle, categories, rawText };
}

/**
 * Оценка и сортировка: похожесть на запрос; при равенстве — более старая запись (меньший id: обычно оригинал).
 * Каверы с «OST»/«feat.» в названии чуть ниже.
 * @template {{title: string, artist: string, rawTitle?: string, postId?: number}} T
 * @param {string} query
 * @param {T[]} items
 * @returns {Array<T & {score: number}>}
 */
export function rankPosts(query, items) {
  return items
    .map((it) => {
      let score = matchScore(query, it);
      if (/\bost\b|саундтрек|feat\.?|\bft\.|cover|версия|version|\blive\b/iu.test(it.rawTitle ?? '')) score -= 0.05;
      return { ...it, score: Math.max(0, Math.round(score * 1000) / 1000) };
    })
    .sort((a, b) => b.score - a.score || (a.postId ?? 0) - (b.postId ?? 0));
}

/** Варианты запроса: целиком по названию; без первого и без последнего слова (там часто исполнитель); полный текст. */
export function searchAttempts(query) {
  const q = query.trim().replace(/\s+/g, ' ');
  const words = q.split(' ');
  const rounds = [[{ q, titleOnly: true }]];
  if (words.length >= 2) {
    rounds.push([
      { q: words.slice(1).join(' '), titleOnly: true },
      { q: words.slice(0, -1).join(' '), titleOnly: true },
    ]);
  }
  rounds.push([{ q, titleOnly: false }]);
  return rounds;
}

/**
 * Поиск в одном WP-источнике. Пробует варианты запроса по очереди, пока что-то не найдётся; ранжирует по полному запросу.
 * @param {WpSite} site
 * @param {string} query
 * @param {{signal?: AbortSignal, fetch?: typeof fetch, parser?: any, timeoutMs?: number, limit?: number, now?: () => number}} [opts]
 * @returns {Promise<Array<{id: string, sourceId: string, postId: number, title: string, artist: string, url: string,
 *   rawText: string, score: number}>>}
 */
export async function wpSearch(site, query, opts = {}) {
  const { signal, parser, timeoutMs = TIMEOUT_MS, limit = 10, now = () => Date.now() } = opts;
  const started = now();
  const seen = new Map();
  const rounds = searchAttempts(query);
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    if (i > 0 && now() - started > SEARCH_BUDGET_MS - timeoutMs) break; // не начинаем попытку, которая не успеет
    const results = await Promise.all(round.map(async ({ q, titleOnly }) => {
      if (!searchKey(q)) return [];
      const res = await getJson(buildSearchUrl(site, q, { titleOnly }), { signal, timeoutMs, fetch: opts.fetch });
      if (res.status === 404) return [];
      if (!Array.isArray(res.data)) throw new SourceError('parse');
      return res.data;
    }));
    for (const post of results.flat()) {
      if (seen.has(post?.id)) continue;
      const p = parsePost(post, site, { parser });
      if (!p) continue;
      if (site.filterNoise && isNoisePost({ title: p.rawTitle, url: p.url, categories: p.categories })) continue;
      seen.set(post.id, p);
    }
    if (seen.size) break;
  }
  return rankPosts(query, [...seen.values()]).slice(0, limit).map((p) => ({
    id: `${site.id}:${p.postId}`, sourceId: site.id, postId: p.postId, title: p.title, artist: p.artist, url: p.url,
    rawText: p.rawText, score: p.score,
  }));
}

/**
 * Загружает одну запись по id или slug.
 * @param {WpSite} site
 * @param {{postId?: number|string, slug?: string}} ref
 * @param {{signal?: AbortSignal, fetch?: typeof fetch, parser?: any, timeoutMs?: number}} [opts]
 */
export async function wpLoadPost(site, ref, opts = {}) {
  const res = await getJson(buildPostUrl(site, ref), { signal: opts.signal, timeoutMs: opts.timeoutMs, fetch: opts.fetch });
  const post = Array.isArray(res.data) ? res.data[0] : res.data;
  if (res.status === 404 || !post || post.id == null) throw new SourceError('notfound', { status: res.status });
  const p = parsePost(post, { ...site, songPath: null }, { parser: opts.parser });
  if (!p || !p.rawText.trim()) throw new SourceError('notfound');
  return p;
}

/**
 * Ссылка на страницу песни akkords.pro или dieza.net → «попадание» для loadSong (по slug). Чужой адрес → null.
 * @param {string} url
 * @returns {{id: string, sourceId: string, title: string, artist: string, url: string, slug: string}|null}
 */
export function hitFromUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const site = Object.values(WP_SITES).find((s) => new URL(s.site).hostname === host);
  if (!site || !site.songPath.test(u.pathname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const slug = decodeURIComponent(parts[parts.length - 1] ?? '').replace(/\.html?$/i, '');
  if (!slug) return null;
  return { id: `${site.id}:${slug}`, sourceId: site.id, title: '', artist: '', url: u.href, slug };
}
