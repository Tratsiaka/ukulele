import { Link } from '../app/router.js';
import { cx, renderIcon } from './icon.js';

const ICON_SIZE = { sm: 18, md: 20, lg: 22 };

/**
 * Кнопка. С `href` — ссылка на маршрут приложения (или внешний адрес).
 * @param {{variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md'|'lg', icon?: any, block?: boolean,
 *          href?: string, onClick?: (e: Event) => void, disabled?: boolean, type?: string, class?: string,
 *          children?: any, [key: string]: any}} props
 *   icon — компонент lucide (`Play`) или элемент
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block = false,
  href,
  onClick,
  disabled = false,
  type = 'button',
  class: extra,
  children,
  ...rest
}) {
  const className = cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', extra);
  const content = (
    <>
      {icon && <span class="btn-icon">{renderIcon(icon, ICON_SIZE[size] ?? 20)}</span>}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <Link {...rest} href={href} class={className} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button {...rest} type={type} class={className} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
