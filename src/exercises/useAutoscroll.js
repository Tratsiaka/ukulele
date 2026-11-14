// Плавная автопрокрутка листа песни через requestAnimationFrame.
// Прокручивает ближайший прокручиваемый контейнер вокруг ref (или само окно). Пока палец на экране или крутится
// колесо — ждёт; ручная прокрутка сдвигает позицию без остановки. В конце вызывает onEnd один раз.

import { useEffect, useRef } from 'preact/hooks';
import { autoscrollSpeed, isAtEnd, nextScrollPos } from './sheet-model.js';

// После того как палец отпустили, ждём, пока докатится инерция.
const RESUME_AFTER_TOUCH_MS = 700;
const RESUME_AFTER_WHEEL_MS = 900;
const CONTROLS = 'button, a, input, select, textarea, label, [role="slider"], [role="switch"]';

/**
 * Ближайший прокручиваемый по вертикали предок (включая сам элемент) или window.
 * @param {Element|null|undefined} el
 * @returns {Window|HTMLElement}
 */
export function findScrollParent(el) {
  if (typeof window === 'undefined') return /** @type {any} */ (null);
  const root = typeof document !== 'undefined' ? document : null;
  for (let n = /** @type {any} */ (el); n && n !== root?.body && n !== root?.documentElement; n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return window;
}

function metrics(target) {
  if (target === window) {
    const doc = document.scrollingElement || document.documentElement;
    return { pos: window.scrollY, view: window.innerHeight, total: doc.scrollHeight };
  }
  return { pos: target.scrollTop, view: target.clientHeight, total: target.scrollHeight };
}

function scrollToPos(target, top) {
  if (target === window) window.scrollTo(0, top);
  else target.scrollTop = top;
}

/**
 * Автопрокрутка листа.
 * @param {{current: Element|null}} ref элемент листа (или сам контейнер прокрутки)
 * @param {{running: boolean, speed?: number, onEnd?: () => void, fontSize?: number, factor?: number}} opts
 *   speed — 1–10 (≈ 6 + 5·speed px/s при шрифте 18 px, пропорционально шрифту); factor — доля темпа
 */
export function useAutoscroll(ref, { running, speed = 5, onEnd, fontSize = 18, factor = 1 }) {
  const live = useRef({ speed, onEnd, fontSize, factor });
  live.current = { speed, onEnd, fontSize, factor };

  useEffect(() => {
    if (!running || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return undefined;
    const target = findScrollParent(ref?.current);
    if (!target) return undefined;
    const events = target === window ? window : target;

    let raf = 0;
    let last = 0;
    let wanted = /** @type {number|null} */ (null);
    let touching = false;
    let holdUntil = 0;
    let done = false;

    const onTouchStart = (e) => {
      if (e.target?.closest?.(CONTROLS)) return;
      touching = true;
    };
    const onTouchEnd = () => {
      if (!touching) return;
      touching = false;
      holdUntil = performance.now() + RESUME_AFTER_TOUCH_MS;
    };
    const onWheel = () => {
      holdUntil = performance.now() + RESUME_AFTER_WHEEL_MS;
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? now - last : 0;
      last = now;
      if (touching || now < holdUntil) {
        wanted = null; // после паузы — от того места, где оставил человек
        return;
      }
      const m = metrics(target);
      if (isAtEnd(m.pos, m.view, m.total)) {
        cancelAnimationFrame(raf);
        if (!done) {
          done = true;
          live.current.onEnd?.();
        }
        return;
      }
      const { speed: s, fontSize: fs, factor: f } = live.current;
      wanted = nextScrollPos(wanted, m.pos, autoscrollSpeed(s, { fontSize: fs, factor: f }), dt);
      scrollToPos(target, wanted);
    };

    events.addEventListener('touchstart', onTouchStart, { passive: true });
    events.addEventListener('touchend', onTouchEnd, { passive: true });
    events.addEventListener('touchcancel', onTouchEnd, { passive: true });
    events.addEventListener('wheel', onWheel, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      events.removeEventListener('touchstart', onTouchStart);
      events.removeEventListener('touchend', onTouchEnd);
      events.removeEventListener('touchcancel', onTouchEnd);
      events.removeEventListener('wheel', onWheel);
    };
  }, [running]);
}

/**
 * Листнуть на долю экрана (педаль, PageDown/PageUp, стрелки).
 * @param {Element|null|undefined} el элемент листа
 * @param {1|-1} dir
 * @param {{part?: number, smooth?: boolean}} [opts] part — доля высоты окна; smooth: false — сразу
 *   (во время автопрокрутки плавный скролл перебивался бы следующим кадром)
 */
export function pageScroll(el, dir, { part = 0.7, smooth = true } = {}) {
  if (typeof window === 'undefined') return;
  const target = findScrollParent(el);
  if (!target) return;
  const view = target === window ? window.innerHeight : /** @type {HTMLElement} */ (target).clientHeight;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollBy({ top: dir * view * part, behavior: smooth && !reduce ? 'smooth' : 'auto' });
}
