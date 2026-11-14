import { Link } from '../app/router.js';
import { cx } from './icon.js';

/**
 * Карточка. С `href` — ссылка, с `onClick` — нажимается целиком (Enter и пробел тоже).
 * @param {{onClick?: (e: Event) => void, href?: string, tone?: 'default'|'accent'|'success'|'warn', class?: string,
 *          label?: string, children?: any, [key: string]: any}} props
 *   label — aria-label для нажимаемой карточки, если текста внутри мало
 */
export function Card({ onClick, href, tone = 'default', class: extra, label, children, ...rest }) {
  const className = cx('card', tone !== 'default' && `card--${tone}`, (href || onClick) && 'card--interactive', extra);
  if (href) {
    return (
      <Link {...rest} href={href} class={className} aria-label={label} onClick={onClick}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    const onKeyDown = (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e);
      }
    };
    return (
      <div {...rest} class={className} role="button" tabIndex={0} aria-label={label} onClick={onClick} onKeyDown={onKeyDown}>
        {children}
      </div>
    );
  }
  return (
    <div {...rest} class={className}>
      {children}
    </div>
  );
}
