import { parseSlots, patternSpeech } from './drill-helpers.js';
import './drills.css';

// Стрелки рисуем SVG, а не символами ↓↑: в системных шрифтах они разного размера.
const PATHS = {
  down: 'M12 4v22M5 19l7 7 7-7',
  up: 'M12 28V6M5 13l7-7 7 7',
  chuck: 'M6 10l12 12M18 10L6 22',
};

function glyph(kind) {
  if (kind === 'rest') return <circle cx="12" cy="16" r="2.4" class="spat-restdot" />;
  return <path d={PATHS[kind]} />;
}

/**
 * Рисунок боя по восьмым: стрелки ↓ ↑, ✕ глушение, · пропуск; под ними счёт «1 и 2 и …».
 * @param {{slots: string|string[], active?: number, size?: 'sm'|'md'|'lg', label?: string, class?: string}} props
 *   slots — 'D-DUD-DU' (по символу на восьмую); active — индекс подсвеченной восьмой (-1 — нет)
 */
export function StrumPattern({ slots, active = -1, size = 'md', label, class: extra }) {
  const items = parseSlots(slots);
  const cls = ['spat', `spat--${size}`, extra].filter(Boolean).join(' ');
  return (
    <div class={cls} role="img" aria-label={label ?? `Бой: ${patternSpeech(slots)}`}>
      {items.map((it) => (
        <span
          key={it.index}
          class={`spat-slot spat-slot--${it.kind}${it.onBeat ? ' is-beat' : ''}${it.index === active ? ' is-active' : ''}`}
          aria-hidden="true"
        >
          <svg class="spat-glyph" viewBox="0 0 24 32" focusable="false">
            {glyph(it.kind)}
          </svg>
          <span class="spat-count">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
