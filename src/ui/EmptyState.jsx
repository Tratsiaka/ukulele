import { isValidElement } from 'preact';
import { Sparkles } from 'lucide-preact';
import { Button } from './Button.jsx';
import { renderIcon } from './icon.js';

/**
 * Пустое состояние: значок, заголовок, пояснение и одно действие.
 * @param {{icon?: any, title: any, text?: any,
 *          action?: any | {label: string, onClick?: () => void, href?: string, icon?: any}}} props
 *   action — готовый элемент или описание кнопки
 */
export function EmptyState({ icon = Sparkles, title, text, action }) {
  let actionNode = action;
  if (action && !isValidElement(action) && typeof action === 'object' && 'label' in action) {
    actionNode = (
      <Button variant="primary" icon={action.icon} href={action.href} onClick={action.onClick}>
        {action.label}
      </Button>
    );
  }
  return (
    <div class="empty">
      <div class="empty-icon" aria-hidden="true">
        {renderIcon(icon, 32)}
      </div>
      <h2 class="empty-title">{title}</h2>
      {text && <p class="empty-text">{text}</p>}
      {actionNode && <div class="empty-action">{actionNode}</div>}
    </div>
  );
}
