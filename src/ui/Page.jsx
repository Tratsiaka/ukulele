import { useEffect } from 'preact/hooks';
import { ArrowLeft } from 'lucide-preact';
import { back as goBack } from '../app/router.js';
import { IconButton } from './IconButton.jsx';
import { cx } from './icon.js';

const APP_NAME = 'Уке';

/**
 * Страница: липкая шапка (заголовок, подзаголовок, действия, кнопка «назад») и контент.
 * @param {{title: string, subtitle?: any, back?: string|true, actions?: any, wide?: boolean, class?: string,
 *          children?: any}} props
 *   back — показать «назад»: true → назад по истории (иначе на «Сегодня»), строка → назад по истории,
 *   а если идти некуда — на этот маршрут. wide — широкая раскладка для десктопа (до 1200 px).
 */
export function Page({ title, subtitle, back, actions, wide = false, class: extra, children }) {
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);

  const onBack = () => (typeof back === 'string' ? goBack(back) : goBack());

  return (
    <div class={cx('page', wide && 'page--wide', extra)}>
      <header class={cx('page-head', back && 'page-head--back')}>
        {back && <IconButton icon={ArrowLeft} label="Назад" onClick={onBack} />}
        <div class="page-titles">
          <h1 class="page-title">{title}</h1>
          {subtitle && <p class="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div class="page-actions">{actions}</div>}
      </header>
      <div class="page-body">{children}</div>
    </div>
  );
}
