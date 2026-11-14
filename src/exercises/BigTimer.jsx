import { useEffect, useRef, useState } from 'preact/hooks';
import { formatClock } from '../lib/format.js';
import { vibrate } from '../lib/device.js';
import './drills.css';

const R = 88;
const C = 2 * Math.PI * R;

/**
 * Крупный таймер обратного отсчёта: кольцо тает, в центре mm:ss. Время считается по performance.now,
 * поэтому не плывёт от задержек отрисовки; пауза (running = false) сохраняет прошедшее время.
 * В конце — вибрация и onEnd. Новое значение seconds начинает отсчёт заново.
 * @param {{seconds: number, running: boolean, onEnd?: () => void, children?: any, size?: number, warnAt?: number}} props
 *   size — максимальный диаметр в px; warnAt — за сколько секунд до конца кольцо меняет цвет
 */
export function BigTimer({ seconds, running, onEnd, children, size = 260, warnAt = 10 }) {
  const totalMs = Math.max(1, Number(seconds) || 0) * 1000;
  const [left, setLeft] = useState(Math.ceil(totalMs / 1000));
  const elapsed = useRef(0);
  const ended = useRef(false);
  const bar = useRef(/** @type {SVGCircleElement|null} */ (null));
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const paint = (ms) => {
    const el = bar.current;
    if (el) el.style.strokeDashoffset = String(C * Math.min(1, ms / totalMs));
  };

  // новый отсчёт при смене длительности
  useEffect(() => {
    elapsed.current = 0;
    ended.current = false;
    setLeft(Math.ceil(totalMs / 1000));
    paint(0);
  }, [totalMs]);

  useEffect(() => {
    if (!running || ended.current) return undefined;
    let raf = 0;
    let backup = 0;
    const start = performance.now() - elapsed.current;

    const finish = () => {
      if (ended.current) return;
      ended.current = true;
      elapsed.current = totalMs;
      paint(totalMs);
      setLeft(0);
      cancelAnimationFrame(raf);
      clearTimeout(backup);
      vibrate([180, 90, 180]);
      endRef.current?.();
    };
    const frame = () => {
      const ms = performance.now() - start;
      if (ms >= totalMs) return finish();
      elapsed.current = ms;
      paint(ms);
      setLeft(Math.ceil((totalMs - ms) / 1000));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // Скрытая вкладка не рисует кадры — конец всё равно наступит вовремя.
    backup = setTimeout(finish, totalMs - elapsed.current + 30);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(backup);
      if (!ended.current) elapsed.current = Math.min(totalMs, performance.now() - start);
    };
  }, [running, totalMs]);

  const ending = left <= warnAt && left > 0;
  return (
    <div
      class={`btimer${ending ? ' is-ending' : ''}${!running && left > 0 ? ' is-paused' : ''}${left === 0 ? ' is-over' : ''}`}
      style={{ '--btimer-size': `${size}px` }}
      role="timer"
      aria-label={`Осталось ${formatClock(left)}`}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <circle class="btimer-track" cx="100" cy="100" r={R} fill="none" stroke-width="12" />
        <circle
          ref={bar}
          class="btimer-bar"
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray={C}
          stroke-dashoffset="0"
        />
      </svg>
      <div class="btimer-center">
        <span class={`btimer-time nums${left <= 3 && left > 0 && running ? ' is-last' : ''}`} key={left <= 3 ? left : 'n'}>
          {formatClock(left)}
        </span>
        {children != null && <div class="btimer-extra">{children}</div>}
      </div>
    </div>
  );
}
