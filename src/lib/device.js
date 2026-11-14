// Помощники устройства: экран не гаснет во время занятия, короткая вибрация.
// Всё безопасно вызывать где угодно: без поддержки API функции просто ничего не делают.

/**
 * Не даёт экрану погаснуть, пока не вызван release. Браузер снимает блокировку, когда вкладка скрыта,
 * поэтому при возвращении на вкладку запрашиваем её снова. Без поддержки Wake Lock — тихо ничего не делает.
 * @returns {Promise<() => Promise<void>>} release — снять блокировку и перестать следить за вкладкой
 */
export async function requestWakeLock() {
  const wakeLock = globalThis.navigator?.wakeLock;
  const doc = globalThis.document;
  if (!wakeLock?.request || !doc) return async () => {};

  /** @type {WakeLockSentinel|null} */
  let sentinel = null;
  let released = false;

  const acquire = async () => {
    if (released || doc.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await wakeLock.request('screen');
    } catch {
      // NotAllowedError в режиме энергосбережения — живём без блокировки
      sentinel = null;
    }
    // release мог прийти, пока ждали ответа
    if (released && sentinel) {
      sentinel.release().catch(() => {});
      sentinel = null;
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') acquire();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  await acquire();

  return async () => {
    if (released) return;
    released = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) {
      try {
        await s.release();
      } catch {
        // уже снята
      }
    }
  };
}

/**
 * Короткая вибрация (Android). На десктопе и iOS ничего не делает.
 * @param {number|number[]} pattern миллисекунды или шаблон [вибро, пауза, вибро…]
 * @returns {boolean} true, если браузер принял вызов
 */
export function vibrate(pattern) {
  try {
    return Boolean(globalThis.navigator?.vibrate?.(pattern));
  } catch {
    return false;
  }
}
