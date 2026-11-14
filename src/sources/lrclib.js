// LRCLIB: текст песни без аккордов и строки с привязкой ко времени. CORS «*», ключ не нужен.
// Порядок: /api/get (точное совпадение) → /api/v2/search + /api/get/{id} (лёгкий поиск) → /api/search (тяжёлый, запасной).

import { getJson, similarity, isAbort } from './util.js';

const BASE = 'https://lrclib.net/api';
/** Заголовок, по которому LRCLIB узнаёт клиента (поднимает лимит запросов). */
export const LRCLIB_CLIENT = 'Uke/0.1 (personal ukulele trainer)';
const HEADERS = { 'Lrclib-Client': LRCLIB_CLIENT };

/** Убирает метки времени LRC: «[01:02.33] строка» → «строка». */
export function syncedToPlain(synced) {
  return String(synced ?? '')
    .split('\n')
    .map((l) => l.replace(/^(\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+\s?/, '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, ''))
    .join('\n')
    .trim();
}

function toLyrics(rec) {
  if (!rec || rec.instrumental) return null;
  const synced = rec.syncedLyrics ? String(rec.syncedLyrics) : null;
  const plain = rec.plainLyrics ? String(rec.plainLyrics) : synced ? syncedToPlain(synced) : '';
  if (!plain.trim()) return null;
  return { plain, synced, duration: Number(rec.duration) || undefined };
}

/**
 * Лучшая запись из выдачи поиска: похожее название и исполнитель, близкая длительность, есть синхронные строки.
 * @param {Array<object>} list  записи LRCLIB (v1 или v2)
 * @param {{artist?: string, title: string, durationSec?: number}} want
 */
export function pickBestRecord(list, { artist, title, durationSec }) {
  let best = null, bestScore = -Infinity;
  for (const r of list ?? []) {
    if (!r || r.instrumental) continue;
    const hasText = r.plainLyrics || r.syncedLyrics || r.hasPlainLyrics || r.hasSyncedLyrics;
    if (!hasText) continue;
    const ts = similarity(title, r.trackName ?? r.name ?? '');
    if (ts < 0.5) continue;
    let score = 0.6 * ts + (artist ? 0.4 * similarity(artist, r.artistName ?? '') : 0.2);
    if (durationSec && r.duration) {
      const d = Math.abs(Number(r.duration) - durationSec);
      score += d <= 2 ? 0.3 : -Math.min(0.3, d / 60);
    }
    if (r.syncedLyrics || r.hasSyncedLyrics) score += 0.05;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/**
 * Текст песни из LRCLIB.
 * @param {{artist?: string, title: string, durationSec?: number}} song
 * @param {{signal?: AbortSignal, fetch?: typeof fetch}} [opts]
 * @returns {Promise<{plain: string, synced: string|null, duration?: number}|null>}
 */
export async function findLyrics({ artist = '', title, durationSec } = {}, opts = {}) {
  if (!title || !String(title).trim()) return null;
  const req = { signal: opts.signal, headers: HEADERS, fetch: opts.fetch };
  const exact = new URLSearchParams({ artist_name: artist, track_name: title });
  if (durationSec) exact.set('duration', String(Math.round(durationSec)));
  try {
    const r = await getJson(`${BASE}/get?${exact}`, req);
    if (r.status === 200) {
      const lyrics = toLyrics(r.data);
      if (lyrics) return lyrics;
    }
  } catch (err) {
    if (isAbort(err, opts.signal) || err?.code === 'rate') throw err;
    // остальное — пробуем поиск
  }

  const q = new URLSearchParams({ track_name: title });
  if (artist) q.set('artist_name', artist);
  const want = { artist, title, durationSec };
  try {
    const r = await getJson(`${BASE}/v2/search?${q}`, req);
    if (Array.isArray(r.data)) {
      const best = pickBestRecord(r.data, want);
      if (!best) return null;
      const full = await getJson(`${BASE}/get/${encodeURIComponent(best.id)}`, req);
      return full.status === 200 ? toLyrics(full.data) : null;
    }
  } catch (err) {
    if (isAbort(err, opts.signal) || err?.code === 'rate') throw err;
    // v2 — бета; если сломался, идём в старый поиск
  }
  const r = await getJson(`${BASE}/search?${q}`, req);
  if (!Array.isArray(r.data)) return null;
  return toLyrics(pickBestRecord(r.data, want));
}
