import { useMemo } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { settings } from '../state.js';
import { chordLabel } from '../lib/format.js';
import { ChordDiagram } from '../ui/ChordDiagram.jsx';
import { cx } from '../ui/icon.js';
import { knownTester } from './sheet-model.js';
import './sheet.css';

/**
 * Полоса диаграмм аккордов песни. На телефоне — горизонтальная лента, прилипает под шапкой; vertical — сетка
 * для боковой колонки десктопа. Тап по диаграмме — звук аккорда (и onChordTap, если задан).
 * Незнакомые аккорды — в пунктирной рамке со значком и подписью для диктора.
 * @param {{chords: string[], known?: Set<string>|string[], leftHanded?: boolean, onChordTap?: (name: string) => void,
 *          size?: 'sm'|'md'|'lg', vertical?: boolean, sticky?: boolean, compact?: boolean, class?: string}} props
 *   sticky — прилипать сверху (по умолчанию для горизонтальной полосы); compact — только имена, без диаграмм
 */
export function ChordStrip({ chords, known, leftHanded, onChordTap, size = 'sm', vertical = false, sticky = !vertical, compact = false, class: extra }) {
  const isKnown = useMemo(() => knownTester(known), [known]);
  if (!chords?.length) return null;
  const notation = settings.value?.notation ?? 'B';

  return (
    <div
      class={cx(
        'chordstrip',
        vertical ? 'chordstrip--vertical' : 'chordstrip--row',
        `chordstrip--${size}`,
        sticky && 'chordstrip--sticky',
        compact && 'chordstrip--compact',
        extra,
      )}
    >
      <ul class="chordstrip__list" aria-label="Аккорды песни">
        {chords.map((name) => {
          const unknown = isKnown ? !isKnown(name) : false;
          return (
            <li key={name} class={cx('chordstrip__item', unknown && 'is-unknown')}>
              {compact ? (
                <button
                  type="button"
                  class="chordstrip__name"
                  onClick={() => onChordTap?.(name)}
                  disabled={!onChordTap}
                  aria-label={`${chordLabel(name, { notation })}${unknown ? ', новый аккорд' : ''}`}
                >
                  {chordLabel(name, { notation })}
                </button>
              ) : (
                <ChordDiagram
                  name={name}
                  size={size}
                  leftHanded={leftHanded}
                  sound
                  onClick={onChordTap ? () => onChordTap(name) : undefined}
                />
              )}
              {unknown && (
                <>
                  <span class="chordstrip__badge" aria-hidden="true">
                    <Sparkles size={11} strokeWidth={2.5} />
                  </span>
                  {!compact && <span class="sr-only">{chordLabel(name, { notation })} — новый аккорд</span>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
