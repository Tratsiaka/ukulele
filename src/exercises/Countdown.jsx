import { useEffect, useRef, useState } from 'preact/hooks';
import { click } from '../audio/synth.js';
import { settings } from '../state.js';
import './drills.css';

/**
 * Крупный отсчёт 3-2-1 со щелчками метронома. Звук должен быть разбужен раньше (unlockAudio в обработчике «Старт»).
 * @param {{from?: number, onDone?: () => void, sound?: boolean, interval?: number, label?: string}} props
 *   sound — щелчки (по умолчанию из настроек); interval — мс между числами; label — подпись над числом
 */
export function Countdown({ from = 3, onDone, sound, interval = 1000, label = 'Приготовься' }) {
  const total = Math.max(1, Math.floor(from));
  const [n, setN] = useState(total);
  const done = useRef(onDone);
  done.current = onDone;
  const withSound = sound ?? settings.value.sound !== false;
  const soundRef = useRef(withSound);
  soundRef.current = withSound;

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let i = 0;
    const t0 = performance.now();
    const step = () => {
      if (!alive) return;
      const left = total - i;
      if (left <= 0) {
        done.current?.();
        return;
      }
      setN(left);
      // «1» звучит выше — сигнал «поехали»
      if (soundRef.current) click({ accent: left === 1 });
      i += 1;
      timer = setTimeout(step, Math.max(0, t0 + i * interval - performance.now()));
    };
    step();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [total, interval]);

  return (
    <div class="cdn" role="timer" aria-live="assertive" aria-atomic="true">
      {label && <p class="cdn-label">{label}</p>}
      <div class="cdn-stage">
        <span class="cdn-halo" key={`h${n}`} aria-hidden="true" />
        <span class="cdn-num nums" key={n}>
          {n}
        </span>
      </div>
      <div class="cdn-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, k) => (
          <span key={k} class={k < total - n + 1 ? 'cdn-dot is-on' : 'cdn-dot'} />
        ))}
      </div>
    </div>
  );
}
