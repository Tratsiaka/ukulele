import { cx } from './icon.js';

/**
 * Переключатель из нескольких вариантов (один выбран). Стрелки ← → меняют выбор.
 * @template T
 * @param {{value: T, options: {value: T, label: any}[], onChange: (value: T) => void, label?: string, class?: string}} props
 *   label — aria-label группы
 */
export function Segmented({ value, options, onChange, label, class: extra }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    const buttons = e.currentTarget.querySelectorAll('button');
    buttons[options.indexOf(next)]?.focus();
  };
  return (
    <div class={cx('seg', extra)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            class="seg-opt"
            aria-checked={on ? 'true' : 'false'}
            tabIndex={on ? 0 : -1}
            onClick={() => !on && onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
