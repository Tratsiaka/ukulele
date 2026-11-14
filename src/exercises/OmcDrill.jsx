import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeftRight, Check, Lightbulb, Play, RotateCcw, Square, Trophy } from 'lucide-preact';
import { Button, Chip, ChordDiagram, Stepper, Toggle } from '../ui/index.js';
import { progress, recordOmc, settings, today } from '../state.js';
import { omcTarget } from '../core/curriculum.js';
import { pairKey } from '../core/progress.js';
import { normalizeChordName } from '../core/chord.js';
import { getShape } from '../core/shapes.js';
import { unlockAudio } from '../audio/context.js';
import { click } from '../audio/synth.js';
import { createMetronome } from '../audio/metronome.js';
import { chordLabel, plural } from '../lib/format.js';
import { omcSummary, omcTip } from './drill-helpers.js';
import { useWakeLock } from './drill-hooks.js';
import { Countdown } from './Countdown.jsx';
import { BigTimer } from './BigTimer.jsx';
import './drills.css';

const PACE_BPM = 60;

/**
 * «Смены за минуту» (One Minute Changes): знакомство с парой → отсчёт → минута с кольцом →
 * ввод числа смен → рекорд, разница и цель (recordOmc) → «Ещё раз» / «Готово».
 * @param {{a: string, b: string, seconds?: number, target?: number, onDone?: (count: number) => void, compact?: boolean}} props
 *   target — цель (по умолчанию omcTarget для текущего уровня); compact — для блока занятия, без лишнего текста
 */
export function OmcDrill({ a, b, seconds = 60, target, onDone, compact = false }) {
  const na = normalizeChordName(a) ?? a;
  const nb = normalizeChordName(b) ?? b;
  const notation = settings.value.notation;
  const la = chordLabel(na, { notation });
  const lb = chordLabel(nb, { notation });
  const p = progress.value;
  const rec = p.pairs[pairKey(na, nb)];
  const goal = target ?? omcTarget(p, na, nb);
  const best = rec?.best ?? 0;
  const last = rec?.last ?? null;

  const [phase, setPhase] = useState(/** @type {'intro'|'count'|'run'|'enter'|'result'} */ ('intro'));
  const [count, setCount] = useState(last ?? 20);
  const [result, setResult] = useState(/** @type {ReturnType<typeof recordOmc>|null} */ (null));
  const [pace, setPace] = useState(false);
  const metro = useRef(/** @type {ReturnType<typeof createMetronome>|null} */ (null));
  const wake = useWakeLock();

  const stopPace = () => {
    metro.current?.stop();
    metro.current = null;
  };
  useEffect(() => stopPace, []);

  const start = () => {
    unlockAudio();
    wake.acquire();
    setResult(null);
    setPhase('count');
  };

  const begin = () => {
    if (pace) {
      // Тихий метроном: щелчки ставим сами на долю вперёд с малой громкостью.
      const interval = 60 / PACE_BPM;
      const m = createMetronome({
        bpm: PACE_BPM,
        sound: false,
        onTick: (t) => click({ when: t.time + interval, gain: 0.22 }),
      });
      click({ gain: 0.22 });
      m.start();
      metro.current = m;
    }
    setPhase('run');
  };

  const finish = () => {
    stopPace();
    wake.release();
    if (settings.value.sound !== false) {
      const t = click({ accent: true });
      if (t != null) click({ accent: true, when: t + 0.16 });
    }
    setPhase('enter');
  };

  const cancel = () => {
    stopPace();
    wake.release();
    setPhase('intro');
  };

  const save = () => {
    setResult(recordOmc(na, nb, count));
    setPhase('result');
  };

  const counting = (
    <>
      {la}→{lb} — 1, {lb}→{la} — 2
    </>
  );
  const diagramSize = compact ? 'md' : 'lg';
  const cls = `drill omc${compact ? ' drill--compact' : ' drill--fill'}`;

  if (phase === 'count') {
    return (
      <section class={cls} aria-label={`Смены ${la} и ${lb}`}>
        <div class="omc-countwrap">
          <Countdown from={3} onDone={begin} label={`Ставь ${la}`} />
          <div class="omc-pair omc-pair--dim">
            <ChordDiagram name={na} size="sm" />
            <ChordDiagram name={nb} size="sm" />
          </div>
        </div>
        <div class="drill-actions drill-actions--center">
          <Button variant="ghost" onClick={cancel}>
            Отмена
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'run') {
    return (
      <section class={cls} aria-label={`Смены ${la} и ${lb}`}>
        <div class="drill-cols omc-run">
          <BigTimer seconds={seconds} running onEnd={finish}>
            <span class="btimer-label">
              {la} ⇄ {lb}
            </span>
          </BigTimer>
          <div class="omc-pair omc-pair--run">
            <ChordDiagram name={na} size="md" />
            <span class="omc-swap" aria-hidden="true">
              <ArrowLeftRight size={20} />
            </span>
            <ChordDiagram name={nb} size="md" />
          </div>
        </div>
        <p class="drill-note center">Считай каждую смену: {counting}</p>
        <div class="drill-actions drill-actions--center">
          <Button variant="ghost" icon={Square} onClick={cancel}>
            Остановить
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'enter') {
    return (
      <section class={cls} aria-label="Сколько смен">
        <div class="drill-center stack">
          <p class="eyebrow">Время</p>
          <h2 class="drill-title">Сколько смен?</h2>
          <p class="muted small">{counting}. Примерно — тоже нормально.</p>
          <Stepper class="drill-bigstepper" value={count} min={0} max={300} onChange={setCount} label="Смен за минуту" />
          <div class="row row-wrap center gap-2">
            <Chip onClick={() => setCount((c) => Math.max(0, c - 5))} aria-label="Минус пять">
              −5
            </Chip>
            {last != null && last !== count && (
              <Chip onClick={() => setCount(last)}>как в прошлый раз · {last}</Chip>
            )}
            <Chip onClick={() => setCount((c) => Math.min(300, c + 5))} aria-label="Плюс пять">
              +5
            </Chip>
          </div>
        </div>
        <div class="drill-actions">
          <Button variant="ghost" size="lg" onClick={cancel}>
            Не сохранять
          </Button>
          <Button variant="primary" size="lg" icon={Check} onClick={save}>
            Сохранить
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'result' && result) {
    const sum = omcSummary(result);
    return (
      <section class={cls} aria-label="Результат">
        <div class={`drill-result drill-result--${sum.tone}`} aria-live="polite">
          {sum.tone === 'record' && (
            <span class="drill-badge drill-badge--record">
              <Trophy size={16} aria-hidden="true" /> Новый рекорд
            </span>
          )}
          <div class="drill-result-num nums">{result.count}</div>
          <p class="muted">
            {plural(result.count, ['смена', 'смены', 'смен'])} {seconds === 60 ? 'за минуту' : `за ${seconds} с`} · {la} ⇄ {lb}
          </p>
          {sum.tone !== 'record' && <h3 class="drill-result-title">{sum.title}</h3>}
          <ul class="drill-lines">
            {sum.lines.map((l) => (
              <li key={l.text} class={l.ok ? 'is-ok' : undefined}>
                {l.ok ? <Check size={16} aria-hidden="true" /> : <span class="drill-lines-dot" aria-hidden="true" />}
                {l.text}
              </li>
            ))}
          </ul>
          <OmcHistory history={progress.value.pairs[pairKey(na, nb)]?.history ?? []} target={result.target} />
        </div>
        <div class="drill-actions">
          {onDone ? (
            <>
              <Button variant="secondary" size="lg" icon={RotateCcw} onClick={start}>
                Ещё раз
              </Button>
              <Button variant="primary" size="lg" onClick={() => onDone(result.count)}>
                Готово
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" block icon={RotateCcw} onClick={start}>
              Ещё раз
            </Button>
          )}
        </div>
      </section>
    );
  }

  // intro
  const dayNum = Number(String(today.value).replaceAll('-', '')) || 0;
  return (
    <section class={cls} aria-label={`Смены ${la} и ${lb}`}>
      <div class="drill-cols">
        <div class="omc-pair">
          <ChordDiagram name={na} size={diagramSize} sound />
          <span class="omc-swap" aria-hidden="true">
            <ArrowLeftRight size={22} />
          </span>
          <ChordDiagram name={nb} size={diagramSize} sound />
        </div>
        <div class="stack">
          <header class="drill-head">
            <p class="eyebrow">Смены за минуту</p>
            <h2 class="drill-title">
              {la} ⇄ {lb}
            </h2>
          </header>
          <div class="drill-stats">
            <DrillStat value={goal} label="цель" />
            <DrillStat value={best || '—'} label="рекорд" />
            {last != null && <DrillStat value={last} label="в прошлый раз" />}
          </div>
          <p class="drill-note">Каждая смена считается: {counting}.</p>
          {!compact && (
            <p class="drill-tip">
              <Lightbulb size={18} aria-hidden="true" />
              <span>{omcTip(getShape(na), getShape(nb), dayNum)}</span>
            </p>
          )}
          <Toggle checked={pace} onChange={setPace} label="Тихий метроном" hint="щелчок раз в секунду — держит ровный темп" />
        </div>
      </div>
      <div class="drill-actions">
        <Button variant="primary" size="lg" block icon={Play} onClick={start}>
          Старт
        </Button>
      </div>
    </section>
  );
}

function DrillStat({ value, label }) {
  return (
    <div class="drill-stat">
      <span class="drill-stat-v nums">{value}</span>
      <span class="drill-stat-l">{label}</span>
    </div>
  );
}

/** Мини-график последних результатов пары с линией цели. */
function OmcHistory({ history, target }) {
  const items = history.slice(-7);
  if (items.length < 2) return null;
  const max = Math.max(target || 0, ...items.map((h) => h.count)) || 1;
  return (
    <div class="omc-hist" role="img" aria-label={`Последние результаты: ${items.map((h) => h.count).join(', ')}`}>
      {target > 0 && <span class="omc-hist-target" style={{ bottom: `${(target / max) * 100}%` }} aria-hidden="true" />}
      {items.map((h, i) => (
        <span
          key={h.day}
          class={`omc-hist-bar${i === items.length - 1 ? ' is-last' : ''}`}
          style={{ height: `${Math.max(6, (h.count / max) * 100)}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
