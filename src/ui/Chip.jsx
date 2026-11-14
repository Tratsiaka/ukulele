import { cx, renderIcon } from './icon.js';

/**
 * Чип: фильтр, метка или быстрый выбор. С onClick — кнопка (aria-pressed по active).
 * @param {{active?: boolean, tone?: 'default'|'accent'|'teal'|'success'|'warn'|'danger'|'outline', onClick?: (e: Event) => void,
 *          icon?: any, class?: string, children?: any, [key: string]: any}} props
 */
export function Chip({ active, tone = 'default', onClick, icon, class: extra, children, ...rest }) {
  const className = cx('chip', tone !== 'default' && `chip--${tone}`, active && 'is-active', extra);
  const inner = (
    <>
      {renderIcon(icon, 16)}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button
        {...rest}
        type="button"
        class={className}
        aria-pressed={typeof active === 'boolean' ? String(active) : undefined}
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }
  return (
    <span {...rest} class={className}>
      {inner}
    </span>
  );
}
