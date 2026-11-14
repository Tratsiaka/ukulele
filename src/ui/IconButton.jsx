import { Link } from '../app/router.js';
import { cx, renderIcon } from './icon.js';

/**
 * Круглая кнопка-иконка 48×48. Подпись обязательна — она становится aria-label и подсказкой.
 * @param {{icon: any, label: string, onClick?: (e: Event) => void, active?: boolean, href?: string,
 *          size?: number, disabled?: boolean, class?: string, [key: string]: any}} props
 *   size — размер значка (по умолчанию 22); active задан — кнопка-переключатель (aria-pressed)
 */
export function IconButton({ icon, label, onClick, active, href, size = 22, disabled = false, class: extra, ...rest }) {
  const className = cx('icon-btn', active && 'is-active', extra);
  if (href && !disabled) {
    return (
      <Link {...rest} href={href} class={className} aria-label={label} title={label} onClick={onClick}>
        {renderIcon(icon, size)}
      </Link>
    );
  }
  return (
    <button
      {...rest}
      type="button"
      class={className}
      aria-label={label}
      title={label}
      aria-pressed={typeof active === 'boolean' ? String(active) : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {renderIcon(icon, size)}
    </button>
  );
}
