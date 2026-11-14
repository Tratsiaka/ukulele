import { signal } from '@preact/signals';
import { X } from 'lucide-preact';

/**
 * @typedef {{label: string, onClick: () => void}} ToastAction
 * @typedef {{id: number, message: string, action?: ToastAction}} ToastItem
 */

const MAX_VISIBLE = 3;
const toasts = signal(/** @type {ToastItem[]} */ ([]));
let nextId = 1;

/**
 * Показывает короткое сообщение внизу экрана.
 * @param {string} message
 * @param {{action?: ToastAction, duration?: number}} [opts] duration — мс; 0 — пока не закроют
 *   (по умолчанию 3 с, с действием — 6 с)
 * @returns {() => void} закрыть сообщение
 */
export function toast(message, { action, duration } = {}) {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, action }].slice(-MAX_VISIBLE);
  const dismiss = () => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };
  const ms = duration ?? (action ? 6000 : 3000);
  if (ms > 0) setTimeout(dismiss, ms);
  return dismiss;
}

/**
 * Место для сообщений. Ставится один раз в корне приложения.
 */
export function ToastHost() {
  const list = toasts.value;
  const close = (id) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {list.map((t) => (
        <div class="toast" key={t.id}>
          <span class="toast-msg">{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                close(t.id);
                t.action.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" class="toast-close" aria-label="Закрыть" onClick={() => close(t.id)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
