import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Play, RotateCcw, Square, Trophy, Turtle } from 'lucide-preact';
import { Button, ChordDiagram, Stepper, Toggle } from '../ui/index.js';
import { progress, recordStrum, settings } from '../state.js';
import { STRUM_PATTERNS, strumById } from '../core/curriculum.js';
import { normalizeChordName } from '../core/chord.js';
import { unlockAudio } from '../audio/context.js';
import { chuck, silence, strumChord } from '../audio/synth.js';
import { clampBpm, createMetronome } from '../audio/metronome.js';
import { chordLabel, plural } from '../lib/format.js';
import { chordForBar, nextStrumBpm, nextTickPos, parseSlots, strumPosition } from './drill-helpers.js';
import { useWakeLock } from './drill-hooks.js';
import { StrumPattern } from './StrumPattern.jsx';
import './drills.css';

const BPM_MIN = 40;
const BPM_MAX = 200;
const COUNT_IN = 1;
const OPEN_STRINGS = { frets: [0, 0, 0, 0] };

/**
 * Бой под метроном: стрелки с подсветкой текущей восьмой, аккорд такта (по кругу), вступительный такт,
 * N тактов игры → «Ровно получилось?» → да: recordStrum и +4 BPM на следующий раз; нет: ещё раз.
 * @param {{patternId: string, bpm?: number, chords?: string[], bars?: number, onDone?: (bpm: number) => void}} props
 */
export function StrumDrill({ patternId, bpm: startBpm = 70, chords, bars = 8, onDone }) {
  const pattern = strumById(patternId) ?? STRUM_PATTERNS[0];
  const pid = pattern.id;
  const notation = settings.value.notation;
  const list = (chords ?? []).map((c) => normalizeChordName(c) ?? c).filter(Boolean);
  const best = progress.value.strum[pid]?.bestBpm ?? 0;
  const totalBars = Math.max(1, Math.floor(bars));

  const [bpm, setBpm] = useState(() => Math.min(BPM_MAX, Math.max(BPM_MIN, clampBpm(startBpm))));
  const [phase, setPhase] = useState(/** @type {'ready'|'run'|'ask'|'done'} */ ('ready'));
  const [pos, setPos] = useState(/** @type {ReturnType<typeof strumPosition>|null} */ (null));
  const [withSound, setWithSound] = useState(false);
  const [result, setResult] = useState(/** @type {{bpm: number, bestBpm: number, record: boolean, next: number}|null} */ (null));
  const metro = useRef(/** @type {ReturnType<typeof createMetronome>|null} */ (null));
  const starting = useRef(false);
  const alive = useRef(true);
  const wake = useWakeLock();

  // Всё, что нужно колбэку метронома, — через ref: он создан при старте и живёт весь прогон.
  const live = useRef(null);
  live.current = { bpm, withSound, list, bars: totalBars, slots: parseSlots(pattern.slots), beats: pattern.beats, tuning: settings.value.tuning };

  const stopMetro = () => {
    metro.current?.stop();
    metro.current = null;
  };

  useEffect(
    () => () => {
      alive.current = false;
      stopMetro();
      silence();
    },
    [],
  );

  const onTick = (tick) => {
    const L = live.current;
    const here = strumPosition(tick, { bars: L.bars, countIn: COUNT_IN });
    if (here.phase === 'end') {
      stopMetro();
      wake.release();
      setPos(null);
      setPhase('ask');
      return;
    }
    setPos(here);
    if (!L.withSound) return;
    // Звук удара ставим на следующую восьмую по часам AudioContext — так он точно совпадает со щелчком.
    const next = strumPosition(nextTickPos(tick, L.beats, 2), { bars: L.bars, countIn: COUNT_IN });
    const when = tick.time + 60 / L.bpm / 2;
    if (next.phase === 'run') {
      const kind = L.slots[next.slot]?.kind;
      const target = chordForBar(L.list, next.runBar) ?? OPEN_STRINGS;
      if (kind === 'down' || kind === 'up') {
        strumChord(target, { direction: kind, when, gain: kind === 'down' ? 0.7 : 0.55, tuning: L.tuning });
      } else if (kind === 'chuck') chuck({ when, gain: 0.7 });
    } else if (next.phase === 'end') {
      strumChord(chordForBar(L.list, 0) ?? OPEN_STRINGS, { when, gain: 0.8, tuning: L.tuning });
    }
  };

  const start = async () => {
    if (starting.current || metro.current) return;
    starting.current = true;
    await unlockAudio();
    starting.current = false;
    if (!alive.current) return;
    const m = createMetronome({ bpm, beatsPerBar: pattern.beats, subdivision: 2, sound: true, onTick });
    metro.current = m;
    m.start();
    wake.acquire();
    setResult(null);
    setPos({ phase: 'countin', runBar: -1, slot: -1, beat: -1 });
    setPhase('run');
  };

  const stop = () => {
    stopMetro();
    wake.release();
    silence();
    setPos(null);
    setPhase('ready');
  };

  const yes = () => {
    const r = recordStrum(pid, bpm);
    const next = Math.min(BPM_MAX, nextStrumBpm(bpm));
    setResult({ bpm, bestBpm: r.bestBpm, record: r.record, next });
    setBpm(next);
    setPhase('done');
  };

  const slower = () => {
    setBpm((v) => Math.max(BPM_MIN, v - 4));
    setPhase('ready');
  };

  const label = (n) => chordLabel(n, { notation });
  const barsWord = `${totalBars} ${plural(totalBars, ['такт', 'такта', 'тактов'])}`;

  if (phase === 'run') {
    const counting = !pos || pos.phase === 'countin';
    const runBar = counting ? -1 : pos.runBar;
    const now = chordForBar(list, Math.max(0, runBar));
    const next = runBar + 1 < totalBars ? chordForBar(list, runBar + 1) : null;
    const soon = !counting && pos.beat === pattern.beats - 1;
    return (
      <section class="drill strum drill--fill" aria-label={`Бой: ${pattern.name}`}>
        <div class="strum-bars" aria-hidden="true">
          {Array.from({ length: totalBars }, (_, i) => (
            <span key={i} class={`strum-bar${i < runBar ? ' is-done' : ''}${i === runBar ? ' is-current' : ''}`} />
          ))}
        </div>
        <p class="sr-only" aria-live="polite">
          {counting ? 'Вступительный счёт' : `Такт ${runBar + 1} из ${totalBars}`}
        </p>
        <div class="strum-stage">
          {counting ? (
            <div class="strum-countin">
              <span class="eyebrow">Счёт</span>
              <span class="strum-countin-num nums" key={pos?.beat ?? -1}>
                {pos && pos.beat >= 0 ? pos.beat + 1 : '·'}
              </span>
              {now && <span class="muted">Начинаем с {label(now)}</span>}
            </div>
          ) : (
            <div class="strum-chordline">
              {now ? (
                <div class="strum-chord" key={`${runBar}-${now}`}>
                  <span class="chord-name strum-chord-name">{label(now)}</span>
                  <ChordDiagram name={now} size="sm" showName={false} />
                </div>
              ) : (
                <div class="strum-chord muted">Любой аккорд или глушёные струны</div>
              )}
              {next && list.length > 1 && (
                <div class={`strum-next${soon ? ' is-soon' : ''}`}>
                  дальше <b>{label(next)}</b>
                </div>
              )}
            </div>
          )}
          <StrumPattern slots={pattern.slots} size="lg" active={counting ? -1 : pos.slot} />
          <p class="muted small nums center">
            {bpm} BPM · {counting ? 'вступление' : `такт ${runBar + 1} из ${totalBars}`}
          </p>
        </div>
        <div class="drill-actions drill-actions--center">
          <Button variant="ghost" icon={Square} onClick={stop}>
            Стоп
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'ask') {
    return (
      <section class="drill strum drill--fill" aria-label="Как прошло">
        <div class="drill-center stack">
          <StrumPattern slots={pattern.slots} size="md" />
          <h2 class="drill-title">Ровно получилось?</h2>
          <p class="muted">
            {bpm} BPM · {barsWord}. Если сбивался или останавливался — лучше ещё раз.
          </p>
        </div>
        <div class="drill-actions drill-actions--stack">
          <div class="drill-actions">
            <Button variant="secondary" size="lg" icon={RotateCcw} onClick={start}>
              Ещё раз
            </Button>
            <Button variant="primary" size="lg" icon={Check} onClick={yes}>
              Да, ровно
            </Button>
          </div>
          <Button variant="ghost" icon={Turtle} onClick={slower}>
            Помедленнее, −4 BPM
          </Button>
        </div>
      </section>
    );
  }

  if (phase === 'done' && result) {
    return (
      <section class="drill strum drill--fill" aria-label="Результат">
        <div class={`drill-result drill-result--${result.record ? 'record' : 'good'}`} aria-live="polite">
          {result.record && (
            <span class="drill-badge drill-badge--record">
              <Trophy size={16} aria-hidden="true" /> Новый рекорд темпа
            </span>
          )}
          <div class="drill-result-num nums">
            {result.bpm}
            <span class="drill-result-unit">BPM</span>
          </div>
          <p class="muted">
            {pattern.name} · {barsWord} ровно
          </p>
          {!result.record && (
            <h3 class="drill-result-title">
              {result.bestBpm > result.bpm ? `Рекорд — ${result.bestBpm} BPM` : 'Засчитано'}
            </h3>
          )}
          <p class="drill-tip">В следующий раз — {result.next} BPM: чуть быстрее, так же ровно.</p>
        </div>
        <div class="drill-actions">
          {onDone ? (
            <>
              <Button variant="secondary" size="lg" icon={RotateCcw} onClick={start}>
                На {result.next}
              </Button>
              <Button variant="primary" size="lg" onClick={() => onDone(result.bpm)}>
                Готово
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" block icon={Play} onClick={start}>
              Ещё раз на {result.next}
            </Button>
          )}
        </div>
      </section>
    );
  }

  // ready
  return (
    <section class="drill strum drill--fill" aria-label={`Бой: ${pattern.name}`}>
      <div class="drill-cols">
        <div class="stack center">
          <StrumPattern slots={pattern.slots} size="lg" />
          {pattern.swing && <p class="small muted">С раскачкой: вниз длиннее, вверх короче</p>}
        </div>
        <div class="stack">
          <header class="drill-head">
            <p class="eyebrow">Бой</p>
            <h2 class="drill-title">{pattern.name}</h2>
          </header>
          <p class="muted small">{pattern.hint}</p>
          {list.length > 0 && (
            <p class="strum-seq">
              {list.map((c, i) => (
                <span key={`${c}${i}`}>
                  {i > 0 && <span class="faint" aria-hidden="true"> → </span>}
                  <b>{label(c)}</b>
                </span>
              ))}
              <span class="faint small"> · по такту на аккорд</span>
            </p>
          )}
          <Stepper value={bpm} min={BPM_MIN} max={BPM_MAX} onChange={setBpm} label="Темп, BPM" />
          {best > 0 && (
            <p class="small muted row gap-2">
              <Trophy size={16} aria-hidden="true" /> Рекорд в этом бою: {best} BPM
            </p>
          )}
          <Toggle checked={withSound} onChange={setWithSound} label="Подыгрывать звуком" hint="приложение играет бой вместе с тобой" />
        </div>
      </div>
      <div class="drill-actions">
        <Button variant="primary" size="lg" block icon={Play} onClick={start}>
          Старт · {barsWord}
        </Button>
      </div>
    </section>
  );
}
