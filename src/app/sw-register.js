// Регистрация service worker и мягкое обновление: новая версия ждёт, пока ты сам нажмёшь «Обновить».
// Посреди занятия или песни (полноэкранные маршруты) сообщение не показываем — оно появится на обычном экране.

import { signal, effect } from '@preact/signals';
import { route } from './router.js';
import { toast } from '../ui/Toast.jsx';

/** Ждущий service worker новой версии или null. */
export const updateWaiting = signal(/** @type {ServiceWorker|null} */ (null));

let accepted = false;
let shown = false;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Регистрирует ./sw.js (scope ./). Без поддержки SW или на file:// ничего не делает.
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || location.protocol === 'file:') return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Перезагружаемся только после «Обновить» — первая установка тоже меняет контроллер.
    if (accepted) location.reload();
  });

  const start = async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (err) {
      console.warn('[uke] service worker не зарегистрирован', err);
      return;
    }
    const hasController = () => Boolean(navigator.serviceWorker.controller);
    if (reg.waiting && hasController()) updateWaiting.value = reg.waiting;
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && hasController()) updateWaiting.value = reg.waiting || sw;
      });
    });

    // Раз в час при возвращении в приложение проверяем, нет ли новой версии
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_EVERY_MS) {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      }
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  effect(() => {
    const sw = updateWaiting.value;
    const busy = route.value.full;
    if (!sw || busy || shown) return;
    shown = true;
    toast('Доступно обновление', {
      duration: 0,
      action: { label: 'Обновить', onClick: () => applyUpdate(sw) },
    });
  });
}

/**
 * Включает ждущую версию и перезагружает страницу, когда она возьмёт управление.
 * @param {ServiceWorker} sw
 */
export function applyUpdate(sw) {
  accepted = true;
  sw.postMessage({ type: 'SKIP_WAITING' });
  // Если контроллер не сменится (редкий сбой), всё равно перезагрузимся
  setTimeout(() => location.reload(), 4000);
}
