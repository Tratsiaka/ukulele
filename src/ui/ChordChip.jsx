import { Check, Sparkles } from 'lucide-preact';
import { settings } from '../state.js';
import { chordLabel } from '../lib/format.js';
import { cx } from './icon.js';

/**
 * Имя аккорда в рамке. Знакомый — зелёный с галочкой; новый — пунктирная рамка и значок (не только цвет).
 * @param {{name: string, known?: boolean, onClick?: (e: Event) => void, class?: string}} props
 *   known не задан — нейтральный вид
 */
export function ChordChip({ name, known, onClick, class: extra }) {
  const prefs = settings.value || {};
  const label = chordLabel(name, { notation: prefs.notation });
  const className = cx('chord-chip', known === true && 'is-known', known === false && 'is-new', extra);
  const status = known === true ? 'знаешь' : known === false ? 'новый аккорд' : '';
  const mark =
    known === true ? <Check size={16} strokeWidth={3} /> : known === false ? <Sparkles size={14} strokeWidth={2.5} /> : null;
  const inner = (
    <>
      <span>{label}</span>
      {mark && (
        <span class="chord-chip-mark" aria-hidden="true">
          {mark}
        </span>
      )}
      {status && <span class="sr-only">, {status}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" class={className} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <span class={className}>{inner}</span>;
}
