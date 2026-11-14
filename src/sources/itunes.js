// iTunes Search: 30-секундное превью, обложка и ссылка на трек для кнопки «Послушать». CORS «*», ответ — JSON с типом text/javascript.

import { getJson, similarity } from './util.js';

/**
 * Обложка нужного размера: …/100x100bb.jpg → …/300x300bb.jpg.
 * @param {string} url
 * @param {number} [size]
 */
export function upscaleArtwork(url, size = 300) {
  if (!url) return '';
  return String(url).replace(/\/\d+x\d+(?:bb)?(\.\w+)$/i, `/${size}x${size}bb$1`);
}

/**
 * Лучший трек из выдачи: похожие название и исполнитель; с превью — выше.
 * @param {Array<object>} results
 * @param {{artist?: string, title: string}} want
 */
export function pickBestTrack(results, { artist, title }) {
  let best = null, bestScore = -Infinity;
  for (const r of results ?? []) {
    if (!r || (r.kind && r.kind !== 'song')) continue;
    const ts = similarity(title, r.trackName ?? '');
    if (ts < 0.4) continue;
    let score = 0.6 * ts + (artist ? 0.4 * similarity(artist, r.artistName ?? '') : 0.2);
    if (r.previewUrl) score += 0.2;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/**
 * Превью и обложка из iTunes (магазин Беларуси по умолчанию).
 * @param {{artist?: string, title: string}} song
 * @param {{signal?: AbortSignal, fetch?: typeof fetch, country?: string}} [opts]
 * @returns {Promise<{previewUrl: string|null, artworkUrl: string, trackUrl: string, durationMs: number|null}|null>}
 */
export async function findPreview({ artist = '', title } = {}, opts = {}) {
  if (!title || !String(title).trim()) return null;
  const term = [artist, title].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
  const p = new URLSearchParams({ term, entity: 'song', limit: '5', country: opts.country ?? 'by' });
  const r = await getJson(`https://itunes.apple.com/search?${p}`, { signal: opts.signal, fetch: opts.fetch });
  const best = pickBestTrack(r.data?.results, { artist, title });
  if (!best) return null;
  return {
    previewUrl: best.previewUrl ?? null,
    artworkUrl: upscaleArtwork(best.artworkUrl100 ?? best.artworkUrl60 ?? ''),
    trackUrl: best.trackViewUrl ?? '',
    durationMs: Number(best.trackTimeMillis) || null,
  };
}
