import { h, isValidElement } from 'preact';

/**
 * Рисует иконку: компонент lucide (`Music`) или готовый элемент (`<Music/>`).
 * @param {any} icon
 * @param {number} size
 * @returns {any}
 */
export function renderIcon(icon, size) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === 'function') return h(icon, { size, 'aria-hidden': 'true' });
  return icon;
}

/**
 * Склеивает классы, пропуская пустые.
 * @param {...(string|false|null|undefined)} parts
 * @returns {string}
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
