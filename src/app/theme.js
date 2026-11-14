// Тема: data-theme на <html> + цвет системной панели (meta theme-color).
// Последний выбор кешируется в localStorage, чтобы при запуске не мигала светлая тема до загрузки настроек.

const KEY = 'uke:theme';

/**
 * Тема из прошлого запуска (до загрузки настроек из IndexedDB).
 * @returns {'auto'|'light'|'dark'}
 */
export function cachedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Применяет тему: 'light' и 'dark' — явно, 'auto' — по системе.
 * @param {'auto'|'light'|'dark'|undefined} theme
 */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const forced = theme === 'light' || theme === 'dark' ? theme : null;
  const root = document.documentElement;
  if (forced) root.dataset.theme = forced;
  else delete root.dataset.theme;

  try {
    if (forced) localStorage.setItem(KEY, forced);
    else localStorage.removeItem(KEY);
  } catch {
    // приватный режим — не страшно
  }

  const bg = forced ? getComputedStyle(root).getPropertyValue('--bg').trim() : '';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!meta.dataset.auto) meta.dataset.auto = meta.content;
    meta.content = bg || meta.dataset.auto;
  }
}
