// Поиск и загрузка песен из сети. Публичный вход модуля sources (контракт — ARCHITECTURE.md, раздел sources).

import { parseSong, songChords, toChordPro } from '../core/song.js';
import { WP_SITES, wpSearch, wpLoadPost, hitFromUrl } from './wp.js';
import { createBreaker, detectLang, searchKey, isAbort, SourceError } from './util.js';
import { findLyrics } from './lrclib.js';
import { findPreview } from './itunes.js';

export { findLyrics, findPreview, detectLang, searchKey, hitFromUrl, SourceError };

/** @typedef {{id: string, sourceId: string, title: string, artist: string, url: string, chords?: string[],
 *   postId?: number, slug?: string, rawText?: string, score?: number}} SearchHit */

/** Источники песен с аккордами (оба — WordPress REST с CORS). */
export const SOURCES = Object.values(WP_SITES).map(({ id, name, site, langs, note }) => ({ id, name, site, langs, note }));

let sharedBreaker = null;
function breakerFor(opts) {
  if (opts.storage !== undefined || opts.now) return createBreaker({ storage: opts.storage, now: opts.now });
  sharedBreaker ??= createBreaker();
  return sharedBreaker;
}

/**
 * Снова включить источник, пропущенный предохранителем (кнопка «Попробовать снова»). Без id — все.
 * @param {string} [sourceId]
 */
export function resetBreaker(sourceId) {
  breakerFor({}).reset(sourceId);
}

/** Аккорды песни для бейджей; если текст не разобрался — без аккордов. */
function chordsOf(rawText, meta) {
  try {
    return songChords(parseSong(rawText ?? '', meta));
  } catch {
    return undefined;
  }
}

/**
 * Поиск песни во всех источниках сразу. Результаты приходят по мере ответа: onHits(sourceId, hits) — по одному разу
 * на источник (и с пустым списком). Сбой источника → onError(sourceId, SourceError); после 3 сбоев подряд источник
 * пропускается 24 ч (onError с code 'skipped'). Отмена через signal ничего не вызывает.
 * @param {string} query
 * @param {{onHits?: (sourceId: string, hits: SearchHit[]) => void, onError?: (sourceId: string, err: Error) => void,
 *   signal?: AbortSignal, sources?: string[], fetch?: typeof fetch, parser?: any, storage?: Storage|null, now?: () => number}} [opts]
 *   fetch/parser/storage/now — для тестов.
 * @returns {Promise<void>}
 */
export async function searchSongs(query, opts = {}) {
  const { onHits, onError, signal } = opts;
  const q = String(query ?? '').trim();
  if (!searchKey(q)) return;
  const breaker = breakerFor(opts);
  const list = SOURCES.filter((s) => !opts.sources || opts.sources.includes(s.id));
  await Promise.all(list.map(async (src) => {
    if (breaker.isOpen(src.id)) {
      safeCall(onError, src.id, new SourceError('skipped'));
      return;
    }
    let hits;
    try {
      hits = await wpSearch(WP_SITES[src.id], q, { signal, fetch: opts.fetch, parser: opts.parser, now: opts.now });
      breaker.success(src.id);
    } catch (err) {
      if (isAbort(err, signal)) return;
      breaker.failure(src.id);
      safeCall(onError, src.id, err instanceof SourceError ? err : new SourceError('network', { cause: err }));
      return;
    }
    if (signal?.aborted) return;
    const withChords = hits.map((h) => ({ ...h, chords: chordsOf(h.rawText, { title: h.title, artist: h.artist }) }));
    safeCall(onHits, src.id, withChords);
  }));
}

function safeCall(fn, ...args) {
  try { fn?.(...args); } catch (err) { console.error(err); }
}

/**
 * Песня из результата поиска (или из hitFromUrl): ChordPro, сырой текст, аккорды, язык, источник.
 * Если текст уже пришёл с поиском, повторного запроса нет.
 * @param {SearchHit} hit
 * @param {{signal?: AbortSignal, fetch?: typeof fetch, parser?: any}} [opts]
 * @returns {Promise<{title: string, artist: string, text: string, rawText: string, chords: string[], lang: string,
 *   source: {site: string, url: string, fetchedAt: number}}>}
 */
export async function loadSong(hit, opts = {}) {
  const site = WP_SITES[hit?.sourceId];
  if (!site) throw new SourceError('unknown');
  let { title = '', artist = '', url = '', rawText } = hit;
  if (!rawText || !rawText.trim()) {
    const postId = hit.postId ?? (/^\w+:(\d+)$/.exec(hit.id ?? '')?.[1]);
    const ref = postId != null ? { postId } : { slug: hit.slug };
    if (ref.postId == null && !ref.slug) throw new SourceError('notfound');
    const post = await wpLoadPost(site, ref, opts);
    rawText = post.rawText;
    title = title || post.title;
    artist = artist || post.artist;
    url = post.url || url;
  }
  const song = parseSong(rawText, { title, artist });
  return {
    title: song.title || title,
    artist: song.artist || artist,
    text: toChordPro(song),
    rawText,
    chords: songChords(song),
    lang: detectLang(rawText),
    source: { site: site.id, url, fetchedAt: Date.now() },
  };
}
