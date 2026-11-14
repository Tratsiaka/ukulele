// Share Target: Android «Поделиться» → манифест открывает ./?share=1&title=…&text=…&url=…
// Превращаем это в маршрут импорта песни. Чистый модуль.

const SHARE_KEYS = ['title', 'text', 'url'];

/**
 * Маршрут импорта для параметров Share Target или null, если делиться нечем.
 * @param {string} search location.search, например '?share=1&text=…'
 * @returns {string|null} например '/songs/import?title=…&text=…&url=…'
 */
export function shareTargetPath(search) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const key of SHARE_KEYS) {
    const value = (params.get(key) || '').trim();
    if (value) out.set(key, value);
  }
  const qs = out.toString();
  return qs ? `/songs/import?${qs}` : null;
}
