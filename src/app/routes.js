// Таблица маршрутов без компонентов (компоненты сопоставляет App.jsx). Чистый модуль — его читают роутер и тесты.

/**
 * @typedef {{pattern: string, screen: string, tab?: 'today'|'learn'|'songs'|'chords'|'tools', full?: boolean}} RouteDef
 * full — полноэкранный маршрут: нижняя навигация и рейка скрыты.
 */

/** Путь по умолчанию (и для неизвестных адресов). */
export const DEFAULT_PATH = '/today';

/** @type {readonly RouteDef[]} */
export const ROUTES = Object.freeze([
  { pattern: '/today', screen: 'Today', tab: 'today' },
  { pattern: '/practice', screen: 'Practice', full: true },
  { pattern: '/learn', screen: 'Learn', tab: 'learn' },
  { pattern: '/learn/lesson/:id', screen: 'Lesson', full: true },
  { pattern: '/songs', screen: 'Songs', tab: 'songs' },
  { pattern: '/songs/import', screen: 'SongImport', full: true },
  { pattern: '/song/:id', screen: 'SongView', full: true },
  { pattern: '/song/:id/train', screen: 'SongTrainer', full: true },
  { pattern: '/chords', screen: 'Chords', tab: 'chords' },
  { pattern: '/chords/:name', screen: 'Chords', tab: 'chords' },
  { pattern: '/tools', screen: 'Tools', tab: 'tools' },
  { pattern: '/tools/:tool', screen: 'Tools', tab: 'tools' },
  { pattern: '/settings', screen: 'Settings', full: true },
  { pattern: '/onboarding', screen: 'Onboarding', full: true },
]);

/**
 * Сопоставляет шаблон вида '/song/:id/train' с путём. Параметры декодируются (`F%23m` → `F#m`).
 * @param {string} pattern
 * @param {string} path путь без query
 * @returns {Record<string, string>|null} параметры или null, если не подходит
 */
export function matchRoute(pattern, path) {
  const ps = splitPath(pattern);
  const xs = splitPath(path);
  if (ps.length !== xs.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) {
      if (!xs[i]) return null;
      params[ps[i].slice(1)] = safeDecode(xs[i]);
    } else if (ps[i] !== xs[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Находит маршрут для пути.
 * @param {string} path
 * @returns {{def: RouteDef, params: Record<string, string>}|null}
 */
export function resolveRoute(path) {
  for (const def of ROUTES) {
    const params = matchRoute(def.pattern, path);
    if (params) return { def, params };
  }
  return null;
}

/**
 * Полноэкранный ли маршрут (без нижней навигации).
 * @param {string} path
 * @returns {boolean}
 */
export function isFullscreenPath(path) {
  return Boolean(resolveRoute(path)?.def.full);
}

function splitPath(p) {
  return String(p).split('/').filter(Boolean);
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
