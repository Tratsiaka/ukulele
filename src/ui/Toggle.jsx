import { cx } from './icon.js';

/**
 * Переключатель «вкл/выкл» во всю ширину строки: подпись слева, тумблер справа.
 * @param {{checked: boolean, onChange: (checked: boolean) => void, label: any, hint?: any, disabled?: boolean,
 *          class?: string}} props
 *   hint — мелкий поясняющий текст под подписью
 */
export function Toggle({ checked, onChange, label, hint, disabled = false, class: extra }) {
  return (
    <button
      type="button"
      role="switch"
      class={cx('toggle', extra)}
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span class="toggle-label">
        {label}
        {hint && <span class="toggle-hint">{hint}</span>}
      </span>
      <span class="toggle-track" aria-hidden="true">
        <span class="toggle-thumb" />
      </span>
    </button>
  );
}
