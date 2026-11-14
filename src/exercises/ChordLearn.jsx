import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Lightbulb, RotateCcw, Sparkles, Volume2 } from 'lucide-preact';
import { Button, Chip, ChordDiagram, EmptyState } from '../ui/index.js';
import { progress, setChordKnown, settings } from '../state.js';
import { normalizeChordName } from '../core/chord.js';
import { getShapes } from '../core/shapes.js';
import { unlockAudio } from '../audio/context.js';
import { strumChord } from '../audio/synth.js';
import { shapeText } from '../ui/chord-layout.js';
import { chordLabel } from '../lib/format.js';
import { CHORD_TIPS, fingerHints } from './drill-helpers.js';
import './drills.css';

const DONE_DELAY = 1100;

/**
 * Новый аккорд: крупная диаграмма со звуком, подсказка по пальцам, «сыграй 4 раза медленно»,
 * «Звучит чисто» → setChordKnown и onDone(true); «Пока не выходит» → короткие советы и onDone(false).
 * @param {{name: string, onDone?: (known: boolean) => void}} props
 */
export function ChordLearn({ name, onDone }) {
  const norm = normalizeChordName(name) ?? name;
  const notation = settings.value.notation;
  const label = chordLabel(norm, { notation });
  const shapes = getShapes(norm);
  const main = shapes[0] ?? null;
  // Упрощённая форма-замена (Em → Em7 0202), если она легче основной.
  const easy = shapes.find((s, i) => i > 0 && s.sub && s.difficulty < (main?.difficulty ?? Infinity)) ?? null;
  const known = Boolean(progress.value.knownChords[norm]);

  const [useEasy, setUseEasy] = useState(false);
  const [view, setView] = useState(/** @type {'learn'|'tips'|'done'} */ ('learn'));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!main) {
    return (
      <section class="drill learn">
        <EmptyState
          title={`Для ${label} пока нет аппликатуры`}
          text="Пропусти его — вернёмся, когда появится схема."
          action={onDone ? { label: 'Дальше', onClick: () => onDone(false) } : undefined}
        />
      </section>
    );
  }

  const shape = useEasy && easy ? easy : main;
  const hints = fingerHints(shape);

  const play = () => {
    unlockAudio().then(() => strumChord(shape, { tuning: settings.value.tuning || 'gcea' }));
  };

  const good = () => {
    setChordKnown(norm, true);
    setView('done');
    clearTimeout(timer.current);
    if (doneRef.current) timer.current = setTimeout(() => doneRef.current?.(true), DONE_DELAY);
  };

  if (view === 'done') {
    return (
      <section class="drill learn drill--fill" aria-live="polite">
        <div class="drill-center stack">
          <span class="learn-done-mark" aria-hidden="true">
            <Check size={44} />
          </span>
          <h2 class="drill-title">{label} — в копилке</h2>
          <p class="muted">Завтра вспомним его в разминке.</p>
        </div>
        {!onDone && (
          <div class="drill-actions drill-actions--center">
            <Button variant="secondary" icon={RotateCcw} onClick={() => setView('learn')}>
              Ещё раз посмотреть
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section class="drill learn drill--fill" aria-label={`Аккорд ${label}`}>
      <div class="drill-cols">
        <div class="learn-visual">
          <ChordDiagram name={norm} shape={shape} size="lg" sound />
          <button type="button" class="learn-listen" onClick={play}>
            <Volume2 size={18} aria-hidden="true" /> Послушать
          </button>
        </div>
        <div class="stack">
          <header class="drill-head">
            <p class="eyebrow">{known ? 'Повторяем' : 'Новый аккорд'}</p>
            <h2 class="drill-title learn-title">{label}</h2>
          </header>
          {shape.sub && (
            <p class="drill-note">
              Играем как {chordLabel(shape.sub, { notation })} — звучит почти так же, а пальцам проще.
            </p>
          )}
          {easy && (
            <div class="row row-wrap gap-2">
              <Chip active={!useEasy} onClick={() => setUseEasy(false)}>
                Полная форма · {shapeText(main)}
              </Chip>
              <Chip active={useEasy} onClick={() => setUseEasy(true)}>
                Попроще · {shapeText(easy)}
              </Chip>
            </div>
          )}
          <ol class="learn-hints">
            {hints.map((h) => (
              <li key={`${h.finger}-${h.text}`}>
                <span class={`learn-finger${h.finger ? '' : ' learn-finger--open'}`} aria-hidden="true">
                  {h.finger || '○'}
                </span>
                {h.finger ? (
                  <span>
                    <b>{h.title}</b> палец — {h.text}
                  </span>
                ) : (
                  <span>
                    <b>{h.title}:</b> {h.text}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {view === 'tips' ? (
            <div class="learn-tips" role="note">
              <p class="row gap-2 bold">
                <Lightbulb size={18} aria-hidden="true" /> Это нормально. Попробуй так:
              </p>
              <ul>
                {CHORD_TIPS.slice(0, 4).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p class="drill-tip">
              <Sparkles size={18} aria-hidden="true" />
              <span>Поставь пальцы и сыграй 4 раза медленно. Звенит каждая струна — значит, чисто.</span>
            </p>
          )}
        </div>
      </div>
      <div class="drill-actions">
        {view === 'tips' ? (
          <>
            {onDone && (
              <Button variant="ghost" size="lg" onClick={() => onDone(false)}>
                Дальше
              </Button>
            )}
            <Button variant="primary" size="lg" icon={RotateCcw} onClick={() => setView('learn')}>
              Попробую ещё
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={() => setView('tips')}>
              Пока не выходит
            </Button>
            <Button variant="primary" size="lg" icon={Check} onClick={good}>
              Звучит чисто
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
