import { useEffect, useRef } from 'preact/hooks';
import { Minus, Plus } from 'lucide-preact';
import { cx } from './icon.js';

const HOLD_DELAY = 420;
const HOLD_EVERY = 70;

/**
 * Число с кнопками − и + (удержание кнопки листает быстрее). Удобно для BPM и минут.
 * @param {{value: number, min?: number, max?: number, step?: number, onChange: (v: number) => void,
 *          label?: any, format?: (v: number) => any, class?: string}} props
 */
export function Stepper({ value, min = -Infinity, max = Infinity, step = 1, onChange, label, format, class: extra }) {
  const live = useRef({ value, onChange });
  live.current = { value, onChange };
  const timer = useRef(0);
  const held = useRef(false);

  const bump = (dir) => {
    const { value: cur, onChange: change } = live.current;
    const decimals = (String(step).split('.')[1] || '').length;
    const next = Math.min(max, Math.max(min, Number((cur + dir * step).toFixed(decimals))));
    if (next !== cur) {
      live.current.value = next;
      change(next);
    }
    return next;
  };
  const stop = () => {
    clearTimeout(timer.current);
    timer.current = 0;
  };
  useEffect(() => stop, []);

  const startHold = (dir) => (e) => {
    if (e.button !== 0) return;
    stop();
    held.current = false;
    const repeat = () => {
      held.current = true;
      const next = bump(dir);
      if (next <= min || next >= max) return stop();
      timer.current = setTimeout(repeat, HOLD_EVERY);
    };
    timer.current = setTimeout(repeat, HOLD_DELAY);
  };

  const btn = (dir, Icon, text, disabled) => (
    <button
      type="button"
      class="stepper-btn"
      aria-label={text}
      disabled={disabled}
      onClick={() => {
        // после удержания клик не добавляет лишний шаг
        if (held.current) {
          held.current = false;
          return;
        }
        bump(dir);
      }}
      onPointerDown={startHold(dir)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );

  return (
    <div class={cx('stepper', extra)}>
      {label && <span class="stepper-label">{label}</span>}
      <div class="stepper-ctrl" role="group" aria-label={typeof label === 'string' ? label : undefined}>
        {btn(-1, Minus, 'Меньше', value <= min)}
        <output class="stepper-value" aria-live="polite">
          {format ? format(value) : value}
        </output>
        {btn(1, Plus, 'Больше', value >= max)}
      </div>
    </div>
  );
}
