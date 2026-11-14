import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { BookOpen, Sparkles, X } from 'lucide-preact';
import { settings } from '../state.js';
import { Link } from '../app/router.js';
import { chordLabel } from '../lib/format.js';
import { Button } from '../ui/Button.jsx';
import { IconButton } from '../ui/IconButton.jsx';
import { cx } from '../ui/icon.js';
import { formatShift, keyAdvice } from './sheet-model.js';
import './sheet.css';

/**
 * Баннер тональности по bestKey: «Можно в Am (−3) — все аккорды знакомы» с кнопкой «Применить»
 * или «Не хватает: Bb, Gm» со ссылками в словарь. Ничего не рисует, если песня уже играбельна.
 * @param {{chords: string[], known: Set<string>|string[], transpose?: number, onApply: (shift: number) => void,
 *          songKey?: string, class?: string}} props
 *   onApply(shift) — shift считается от исходной тональности (поставить transpose = shift)
 */
export function KeyBanner({ chords, known, transpose = 0, onApply, songKey, class: extra }) {
  const [hidden, setHidden] = useState(false);
  const advice = useMemo(() => keyAdvice(chords, known, transpose, { key: songKey }), [chords, known, transpose, songKey]);
  if (!advice || hidden) return null;
  const notation = settings.value?.notation ?? 'B';
  const label = (name) => chordLabel(name, { notation });
  const close = <IconButton icon={X} size={18} label="Скрыть подсказку" class="keybanner__close" onClick={() => setHidden(true)} />;

  if (advice.kind === 'easy') {
    return (
      <div class={cx('keybanner', 'keybanner--easy', extra)} role="status">
        <span class="keybanner__icon" aria-hidden="true">
          <Sparkles size={20} />
        </span>
        <p class="keybanner__text">
          Можно в <b>{label(advice.key)}</b> <span class="nums">({formatShift(advice.shift)})</span> — все аккорды знакомы
        </p>
        <Button size="sm" variant="secondary" class="keybanner__apply" onClick={() => onApply?.(advice.shift)}>
          Применить
        </Button>
        {close}
      </div>
    );
  }

  return (
    <div class={cx('keybanner', 'keybanner--missing', extra)} role="status">
      <span class="keybanner__icon" aria-hidden="true">
        <BookOpen size={20} />
      </span>
      <div class="keybanner__text">
        <p>
          Не хватает:{' '}
          {advice.missing.map((name, i) => (
            <Fragment key={name}>
              {i > 0 && ', '}
              <Link href={`/chords/${encodeURIComponent(name)}`} class="keybanner__chord">
                {label(name)}
              </Link>
            </Fragment>
          ))}
        </p>
        {advice.better && (
          <p class="keybanner__hint">
            В <b>{label(advice.better.key)}</b> <span class="nums">({formatShift(advice.better.shift)})</span> — только{' '}
            {advice.better.missing.map(label).join(', ')}
          </p>
        )}
      </div>
      {advice.better && (
        <Button size="sm" variant="secondary" class="keybanner__apply" onClick={() => onApply?.(advice.better.shift)}>
          Применить
        </Button>
      )}
      {close}
    </div>
  );
}
