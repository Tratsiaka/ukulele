// Хуки тренажёров: блокировка экрана на время упражнения с гарантированным снятием.

import { useEffect, useRef } from 'preact/hooks';
import { requestWakeLock } from '../lib/device.js';

/**
 * Экран не гаснет между acquire() и release(). При размонтировании блокировка снимается сама,
 * даже если запрос ещё не вернулся.
 * @returns {{acquire(): void, release(): void}}
 */
export function useWakeLock() {
  const ref = useRef(/** @type {{acquire(): void, release(): void}|null} */ (null));
  if (!ref.current) {
    let release = null;
    let pending = false;
    let token = 0;
    let alive = true;
    const api = {
      acquire() {
        if (!alive || release || pending) return;
        pending = true;
        const my = ++token;
        requestWakeLock()
          .then((rel) => {
            pending = false;
            if (!alive || my !== token) rel();
            else release = rel;
          })
          .catch(() => {
            pending = false;
          });
      },
      release() {
        token++;
        pending = false;
        const r = release;
        release = null;
        r?.();
      },
      dispose() {
        alive = false;
        api.release();
      },
    };
    ref.current = api;
  }
  useEffect(() => () => ref.current.dispose(), []);
  return ref.current;
}
