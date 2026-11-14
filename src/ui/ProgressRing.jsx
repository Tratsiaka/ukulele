import { cx } from './icon.js';

/**
 * Кольцо прогресса с содержимым в центре. При value ≥ 1 кольцо становится зелёным.
 * @param {{value: number, size?: number, stroke?: number, tone?: 'accent'|'teal'|'success', label?: string,
 *          class?: string, children?: any}} props
 *   value — 0…1; label — aria-label (по умолчанию «N %»)
 */
export function ProgressRing({ value, size = 64, stroke, tone = 'accent', label, class: extra, children }) {
  const v = Math.min(1, Math.max(0, Number(value) || 0));
  const sw = stroke ?? Math.max(4, Math.round(size / 10));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      class={cx('ring', tone !== 'accent' && `ring--${tone}`, v >= 1 && 'is-done', extra)}
      style={{ width: `${size}px`, height: `${size}px` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label ?? `${Math.round(v * 100)} %`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle class="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" stroke-width={sw} />
        <circle
          class="ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke-width={sw}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - v)}
          opacity={v > 0 ? 1 : 0}
        />
      </svg>
      {children != null && <div class="ring-center">{children}</div>}
    </div>
  );
}
