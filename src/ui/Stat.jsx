import { cx } from './icon.js';

/**
 * Крупное число с подписью: «12 мин — сегодня».
 * @param {{value: any, label: any, hint?: any, class?: string}} props
 */
export function Stat({ value, label, hint, class: extra }) {
  return (
    <div class={cx('stat', extra)}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
      {hint && <div class="stat-hint">{hint}</div>}
    </div>
  );
}
