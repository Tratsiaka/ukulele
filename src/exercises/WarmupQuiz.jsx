import { useRef, useState } from 'preact/hooks';
import { Check, Eye, RotateCcw, Sparkles, X } from 'lucide-preact';
import { Button, ChordDiagram, EmptyState } from '../ui/index.js';
import { reviewChord, settings } from '../state.js';
import { normalizeChordName } from '../core/chord.js';
import { unlockAudio } from '../audio/context.js';
import { strumChord } from '../audio/synth.js';
import { chordLabel } from '../lib/format.js';
import { shuffle } from './drill-helpers.js';
import './drills.css';

/**
 * Разминка-вспоминание: имя аккорда → ставишь пальцы по памяти и играешь → «Проверить» показывает
 * диаграмму и звучит → «Верно» / «Ошибся» (reviewChord). В конце — итог; ошибки можно повторить.
 * @param {{chords: string[], onDone?: (results: {name: string, ok: boolean}[]) => void}} props
 *   results — первый проход (повтор ошибок в счёт не идёт)
 */
export function WarmupQuiz({ chords, onDone }) {
  const [order, setOrder] = useState(() =>
    shuffle([...new Set((chords ?? []).map((c) => normalizeChordName(c) ?? c).filter(Boolean))]));
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState(/** @type {{name: string, ok: boolean}[]} */ ([]));
  const [retry, setRetry] = useState(/** @type {{name: string, ok: boolean}[]|null} */ (null));
  const first = useRef(/** @type {{name: string, ok: boolean}[]|null} */ (null));
  const notation = settings.value.notation;
  const label = (n) => chordLabel(n, { notation });

  if (!order.length) {
    return (
      <section class="drill wq">
        <EmptyState
          icon={Sparkles}
          title="Пока нечего вспоминать"
          text="Выучи пару аккордов — и разминка появится сама."
          action={onDone ? { label: 'Дальше', onClick: () => onDone([]) } : undefined}
        />
      </section>
    );
  }

  const cur = order[i];
  const inRetry = retry !== null;

  const check = () => {
    unlockAudio().then(() => strumChord(cur, { tuning: settings.value.tuning || 'gcea' }));
    setRevealed(true);
  };

  const answer = (ok) => {
    if (inRetry) setRetry([...retry, { name: cur, ok }]);
    else {
      reviewChord(cur, ok);
      setResults([...results, { name: cur, ok }]);
    }
    setRevealed(false);
    setI(i + 1);
  };

  // итог
  if (i >= order.length) {
    const firstPass = inRetry ? first.current ?? results : results;
    const shown = inRetry ? retry : results;
    const okCount = shown.filter((r) => r.ok).length;
    const missed = shown.filter((r) => !r.ok).map((r) => r.name);
    const all = okCount === shown.length;
    const again = () => {
      if (!inRetry) first.current = results;
      setRetry([]);
      setOrder(shuffle(missed));
      setI(0);
      setRevealed(false);
    };
    return (
      <section class="drill wq drill--fill" aria-label="Итог разминки">
        <div class={`drill-result drill-result--${all ? 'good' : 'plain'}`} aria-live="polite">
          {all && (
            <span class="drill-badge drill-badge--good">
              <Check size={16} aria-hidden="true" /> Всё по памяти
            </span>
          )}
          <div class="drill-result-num nums">
            {okCount}
            <span class="drill-result-unit">из {shown.length}</span>
          </div>
          <p class="muted">{inRetry ? 'со второй попытки' : 'вспомнил по памяти'}</p>
          <ul class="wq-summary">
            {shown.map((r) => (
              <li key={r.name} class={r.ok ? 'is-ok' : 'is-miss'}>
                {r.ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
                <span class="chord-name">{label(r.name)}</span>
                <span class="sr-only">{r.ok ? 'верно' : 'ошибся'}</span>
              </li>
            ))}
          </ul>
          {!all && <p class="small muted">Ошибки — это нормально: завтра эти аккорды придут снова.</p>}
        </div>
        <div class="drill-actions">
          {missed.length > 0 && (
            <Button variant="secondary" size="lg" icon={RotateCcw} onClick={again}>
              Повторить ошибки
            </Button>
          )}
          <Button variant="primary" size="lg" block={!missed.length} onClick={() => onDone?.(firstPass)}>
            Готово
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section class="drill wq drill--fill" aria-label="Разминка">
      <div class="wq-progress">
        <span class="eyebrow">{inRetry ? 'Повтор' : 'Разминка'}</span>
        <span class="wq-dots" aria-hidden="true">
          {order.map((n, k) => (
            <span key={`${n}${k}`} class={`wq-dot${k < i ? ' is-done' : ''}${k === i ? ' is-current' : ''}`} />
          ))}
        </span>
        <span class="small muted nums">
          {i + 1} из {order.length}
        </span>
      </div>
      <div class="wq-card" key={`${cur}-${i}-${inRetry}`}>
        <span class="chord-name chord-xl wq-name">{label(cur)}</span>
        {revealed ? (
          <div class="wq-reveal">
            <ChordDiagram name={cur} size="lg" sound showName={false} />
            <p class="muted small">Совпало с тем, что ты поставил?</p>
          </div>
        ) : (
          <p class="muted wq-ask">Поставь пальцы по памяти и сыграй</p>
        )}
      </div>
      <div class="drill-actions">
        {revealed ? (
          <>
            <Button variant="secondary" size="lg" icon={X} onClick={() => answer(false)}>
              Ошибся
            </Button>
            <Button variant="primary" size="lg" icon={Check} onClick={() => answer(true)}>
              Верно
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" block icon={Eye} onClick={check}>
            Проверить
          </Button>
        )}
      </div>
    </section>
  );
}
