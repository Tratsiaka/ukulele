import { useId } from 'preact/hooks';
import { cx } from './icon.js';

/**
 * Ползунок. onChange вызывается непрерывно, пока тянешь.
 * @param {{value: number, min?: number, max?: number, step?: number, onChange: (v: number) => void, label?: any,
 *          format?: (v: number) => any, class?: string}} props
 *   format — подпись значения справа от названия (без format значение не показывается)
 */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, label, format, class: extra }) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div class={cx('slider', extra)}>
      {(label || format) && (
        <div class="slider-top">
          {label && (
            <label class="slider-label" for={id}>
              {label}
            </label>
          )}
          {format && <span class="slider-value">{format(value)}</span>}
        </div>
      )}
      <input
        id={id}
        class="slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${Math.min(100, Math.max(0, pct))}%` }}
        aria-valuetext={format ? String(format(value)) : undefined}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}
