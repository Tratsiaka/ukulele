import { RotateCw, CircleAlert } from 'lucide-preact';
import { Button } from '../ui/Button.jsx';
import { Logo } from './Logo.jsx';

/** Спокойная заставка, пока загружаются данные (появляется с задержкой, чтобы не мигать). */
export function Splash() {
  return (
    <div class="splash" role="status" aria-label="Загрузка">
      <Logo class="splash-logo" />
      <div class="splash-name">Уке</div>
      <div class="splash-hint">Настраиваю струны…</div>
    </div>
  );
}

/**
 * Экран на случай, если данные не открылись (например, браузер запретил хранилище).
 * @param {{error: unknown}} props
 */
export function BootError({ error }) {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return (
    <div class="splash" role="alert">
      <div class="empty-icon">
        <CircleAlert size={32} aria-hidden="true" />
      </div>
      <div class="stack center boot-error">
        <h1 class="splash-name">Не открылись данные</h1>
        <p class="muted">
          Попробуй перезагрузить. Если не поможет — проверь, что это не приватная вкладка и что сайту разрешено хранить данные.
        </p>
        {detail && <p class="faint xsmall mono">{detail}</p>}
      </div>
      <Button variant="primary" icon={RotateCw} onClick={() => location.reload()}>
        Перезагрузить
      </Button>
    </div>
  );
}
