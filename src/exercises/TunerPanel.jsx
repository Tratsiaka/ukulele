import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Mic, MicOff, RotateCcw } from 'lucide-preact';
import { Button, Chip } from '../ui/index.js';
import { settings } from '../state.js';
import { TUNINGS } from '../core/shapes.js';
import { unlockAudio } from '../audio/context.js';
import { pluck } from '../audio/synth.js';
import { IN_TUNE_CENTS, makeReading, startTuner } from '../audio/tuner.js';
import { vibrate } from '../lib/device.js';
import { centsText, createInTuneTracker, needleAngle } from './drill-helpers.js';
import './drills.css';

const STRINGS = /** @type {const} */ (['G', 'C', 'E', 'A']);
const REF_SECONDS = 1.6;
const REF_MUTE_MS = 1900; // пока звучит эталон, микрофон слушает его — показания пропускаем
const PAINT_MS = 66; // перерисовка ~15 раз в секунду, стрелку сглаживает CSS

// Геометрия шкалы: дуга ±60° вокруг точки (120, 130).
const CX = 120;
const CY = 130;
const R = 100;
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const arc = (from, to, r) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const ZONE = needleAngle(IN_TUNE_CENTS);
const TICKS = Array.from({ length: 11 }, (_, k) => (k - 5) * 10);

/**
 * Тюнер: стрелка с центами, найденная струна и нота, подсказка «выше — ослабь» / «ниже — подтяни» / «в строю»,
 * кнопки G C E A с эталонным звуком (при включённом тюнере ещё и закрепляют струну), отметки струн,
 * продержавшихся в строю 0,5 с. Микрофон включается только по нажатию и выключается при уходе с экрана.
 * @param {{compact?: boolean, onDone?: () => void}} props compact — для начала занятия, с кнопкой «Готово»
 */
export function TunerPanel({ compact = false, onDone }) {
  const tuningId = settings.value.tuning === 'lowg' ? 'lowg' : 'gcea';
  const [status, setStatus] = useState(/** @type {'idle'|'starting'|'on'|'error'} */ ('idle'));
  const [error, setError] = useState('');
  const [reading, setReading] = useState(/** @type {import('../audio/tuner.js').TunerReading|null} */ (null));
  const [lock, setLock] = useState(/** @type {'G'|'C'|'E'|'A'|null} */ (null));
  const [tuned, setTuned] = useState(/** @type {string[]} */ ([]));
  const [playing, setPlaying] = useState(/** @type {string|null} */ (null));

  const stopRef = useRef(/** @type {(() => void)|null} */ (null));
  const alive = useRef(true);
  const live = useRef({ lock, tuning: tuningId });
  live.current = { lock, tuning: tuningId };
  const tracker = useRef(createInTuneTracker());
  const muteUntil = useRef(0);
  const latest = useRef(/** @type {any} */ (null));
  const paintTimer = useRef(0);
  const playTimer = useRef(0);

  const halt = () => {
    stopRef.current?.();
    stopRef.current = null;
    clearTimeout(paintTimer.current);
    paintTimer.current = 0;
  };

  useEffect(
    () => () => {
      alive.current = false;
      halt();
      clearTimeout(playTimer.current);
    },
    [],
  );

  const onReading = (r) => {
    const now = performance.now();
    if (now < muteUntil.current) return;
    const { lock: only, tuning } = live.current;
    const rd = only && r.freq ? makeReading(r.freq, r.clarity, tuning, only) : r;
    if (tracker.current.push(rd.string, rd.inTune, now)) {
      setTuned([...tracker.current.done]);
      vibrate(35);
    }
    latest.current = rd;
    if (!paintTimer.current) {
      paintTimer.current = setTimeout(() => {
        paintTimer.current = 0;
        if (alive.current) setReading(latest.current);
      }, PAINT_MS);
    }
  };

  const fail = (err) => {
    halt();
    if (!alive.current) return;
    setReading(null);
    setError(err?.message || 'Не получилось включить микрофон. Попробуй ещё раз.');
    setStatus('error');
  };

  const enable = async () => {
    if (stopRef.current || status === 'starting') return;
    setStatus('starting');
    setError('');
    unlockAudio(); // в обработчике нажатия, до ожидания разрешения
    try {
      const stop = await startTuner(onReading, { tuning: tuningId, onError: fail });
      if (!alive.current) {
        stop();
        return;
      }
      stopRef.current = stop;
      setStatus('on');
    } catch (err) {
      fail(err);
    }
  };

  const disable = () => {
    halt();
    setReading(null);
    setLock(null);
    setStatus('idle');
  };

  const playString = (i) => {
    const s = STRINGS[i];
    unlockAudio();
    pluck(TUNINGS[tuningId].midi[i], { duration: REF_SECONDS, gain: 0.9 });
    muteUntil.current = performance.now() + REF_MUTE_MS;
    setPlaying(s);
    clearTimeout(playTimer.current);
    playTimer.current = setTimeout(() => alive.current && setPlaying(null), REF_SECONDS * 1000);
    if (stopRef.current) setLock(s);
  };

  const on = status === 'on';
  const cents = on && reading?.freq ? reading.stringCents : null;
  const active = cents != null;
  const inTune = active && reading.inTune;
  const shown = active ? reading.string : lock;
  const allDone = tuned.length === 4;
  const dir = !active ? '' : inTune ? 'is-in' : cents > 0 ? 'is-up' : 'is-down';

  let hint;
  if (status === 'error') hint = '';
  else if (!on) hint = status === 'starting' ? 'Включаю микрофон…' : 'Дёрни струну — стрелка покажет, куда крутить колок.';
  else if (active) hint = centsText(cents, inTune);
  else hint = lock ? `Дёрни струну ${lock}` : 'Дёрни любую струну';

  const gauge = (
    <div class="tuner-gauge-wrap">
      <svg class={`tuner-gauge${on ? '' : ' is-idle'}`} viewBox="0 0 240 150" aria-hidden="true" focusable="false">
        <path class="tuner-arc" d={arc(-60, 60, R)} />
        <path class="tuner-zone" d={arc(-ZONE, ZONE, R)} />
        {TICKS.map((c) => {
          const deg = needleAngle(c);
          const major = c === 0 || Math.abs(c) === 50;
          const [x1, y1] = polar(deg, major ? 84 : 89);
          const [x2, y2] = polar(deg, 95);
          return (
            <line
              key={c}
              class={`tuner-tick${major ? ' tuner-tick--major' : ''}`}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
            />
          );
        })}
        <text class="tuner-scale-label" x="22" y="112" text-anchor="start">
          ниже
        </text>
        <text class="tuner-scale-label" x="218" y="112" text-anchor="end">
          выше
        </text>
        <g class={`tuner-needle ${dir}`} style={{ transform: `rotate(${needleAngle(cents)}deg)` }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - 92} />
        </g>
        <circle class="tuner-hub" cx={CX} cy={CY} r="7" />
      </svg>
      <div class={`tuner-readout ${dir}`}>
        <span class="tuner-note">{shown ?? ''}</span>
        <span class="tuner-cents nums">{active ? `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${Math.abs(cents)}` : ''}</span>
      </div>
    </div>
  );

  return (
    <section class={`drill tuner${compact ? ' drill--compact tuner--compact' : ''}`} aria-label="Тюнер">
      <div class="drill-cols">
        <div class="stack center">
          {!compact && <p class="eyebrow">Строй {TUNINGS[tuningId].name}</p>}
          {gauge}
          <p class={`tuner-hint ${dir}`}>{hint}</p>
          {active && reading.note && (
            <p class="tuner-heard faint small nums">
              слышу {reading.note}
              {reading.octave}
            </p>
          )}
          <p class="sr-only" aria-live="polite">
            {active ? `${reading.string}: ${inTune ? 'в строю' : cents > 0 ? 'выше' : 'ниже'}` : ''}
          </p>
        </div>

        <div class="stack">
          {status === 'error' && (
            <div class="tuner-error" role="alert">
              <MicOff size={20} aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}
          <div class="tuner-strings" role="group" aria-label="Струны: эталонный звук">
            {STRINGS.map((s, i) => {
              const isTuned = tuned.includes(s);
              const cur = active && reading.string === s;
              return (
                <button
                  key={s}
                  type="button"
                  class={`tuner-string${isTuned ? ' is-tuned' : ''}${cur ? ' is-current' : ''}${lock === s ? ' is-locked' : ''}${playing === s ? ' is-playing' : ''}`}
                  aria-pressed={on ? String(lock === s) : undefined}
                  aria-label={`Струна ${s}: послушать эталон${isTuned ? ', настроена' : ''}`}
                  onClick={() => playString(i)}
                >
                  <span class="tuner-string-name">{s}</span>
                  <span class="tuner-string-mark" aria-hidden="true">
                    {isTuned ? <Check size={16} strokeWidth={3} /> : <span class="tuner-string-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
          {on && lock ? (
            <p class="tuner-lock small muted row gap-2">
              Слушаю только {lock}
              <Chip tone="outline" onClick={() => setLock(null)}>
                Авто
              </Chip>
            </p>
          ) : (
            !compact && <p class="small faint">Нажми на струну — услышишь, как она должна звучать.</p>
          )}
          {allDone ? (
            <p class="tuner-all" role="status">
              <Check size={18} aria-hidden="true" /> Все четыре в строю
            </p>
          ) : (
            on && tuned.length > 0 && <p class="small muted">Настроено {tuned.length} из 4</p>
          )}
          {!compact && status === 'idle' && <p class="xsmall faint">Звук с микрофона обрабатывается только на телефоне и никуда не уходит.</p>}
        </div>
      </div>

      <div class="drill-actions">
        {status === 'error' && (
          <>
            {onDone && (
              <Button variant="ghost" size="lg" onClick={onDone}>
                Пропустить
              </Button>
            )}
            <Button variant="primary" size="lg" block={!onDone} icon={RotateCcw} onClick={enable}>
              Попробовать снова
            </Button>
          </>
        )}
        {(status === 'idle' || status === 'starting') && (
          <>
            {onDone && (
              <Button variant="ghost" size="lg" onClick={onDone}>
                Уже настроено
              </Button>
            )}
            <Button variant="primary" size="lg" block={!onDone} icon={Mic} onClick={enable} disabled={status === 'starting'}>
              {status === 'starting' ? 'Включаю…' : 'Включить тюнер'}
            </Button>
          </>
        )}
        {on && (
          <>
            <Button variant={onDone ? 'ghost' : 'secondary'} size="lg" block={!onDone} icon={MicOff} onClick={disable}>
              Выключить
            </Button>
            {onDone && (
              <Button
                variant="primary"
                size="lg"
                icon={allDone ? Check : undefined}
                onClick={() => {
                  disable();
                  onDone();
                }}
              >
                Готово
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
