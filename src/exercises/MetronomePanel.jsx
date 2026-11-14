import { useEffect, useRef, useState } from 'preact/hooks';
import { Hand, Play, Square } from 'lucide-preact';
import { Button, Segmented, Slider, Toggle } from '../ui/index.js';
import { unlockAudio } from '../audio/context.js';
import { createMetronome } from '../audio/metronome.js';
import { vibrate } from '../lib/device.js';
import { createTapTempo, readMetronomePrefs, tempoWord, writeMetronomePrefs } from './drill-helpers.js';
import { useWakeLock } from './drill-hooks.js';
import './drills.css';

const MIN = 30;
const MAX = 240;
const TAP_RESET_MS = 2200;
const clamp = (v) => Math.min(MAX, Math.max(MIN, Math.round(Number(v) || 0)));

/**
 * Метроном: крупный темп, ±1/±5, ползунок, tap-tempo, 3/4 и 4/4, четверти/восьмые, акцент на «раз»,
 * пульсирующая точка и доли, вибрация. Последние настройки — в localStorage 'uke:metronome'.
 * @param {{initialBpm?: number}} props initialBpm — начать с этого темпа (например, темп песни)
 */
export function MetronomePanel({ initialBpm }) {
  const [prefs, setPrefs] = useState(() => {
    const p = readMetronomePrefs();
    return initialBpm ? { ...p, bpm: clamp(initialBpm) } : { ...p, bpm: clamp(p.bpm) };
  });
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [taps, setTaps] = useState(0);
  const metro = useRef(/** @type {ReturnType<typeof createMetronome>|null} */ (null));
  const dot = useRef(/** @type {HTMLElement|null} */ (null));
  const tapper = useRef(/** @type {ReturnType<typeof createTapTempo>|null} */ (null));
  if (!tapper.current) tapper.current = createTapTempo({ maxGapMs: TAP_RESET_MS });
  const tapTimer = useRef(0);
  const live = useRef(prefs);
  live.current = prefs;
  const starting = useRef(false);
  const alive = useRef(true);
  const wake = useWakeLock();
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const setBpm = (v) => update({ bpm: clamp(v) });

  // Сохраняем сразу (запись крошечная) и применяем к играющему метроному.
  useEffect(() => {
    writeMetronomePrefs(prefs);
    const m = metro.current;
    if (!m) return;
    m.setBpm(prefs.bpm);
    m.setSubdivision(prefs.sub);
    // Без акцента все доли одинаковые: такт из одной доли, счёт долей ведём сами.
    m.setBeatsPerBar(prefs.accent ? prefs.beats : 1);
  }, [prefs]);

  useEffect(
    () => () => {
      alive.current = false;
      metro.current?.stop();
      metro.current = null;
      clearTimeout(tapTimer.current);
    },
    [],
  );

  const onTick = (t) => {
    if (t.sub !== 0) return;
    const p = live.current;
    const b = (p.accent ? t.beat : t.bar) % p.beats;
    const strong = p.accent && b === 0;
    setBeat(b);
    const el = dot.current;
    if (el) {
      el.classList.remove('is-pulse', 'is-strong');
      void el.offsetWidth; // перезапуск анимации
      el.classList.add('is-pulse');
      if (strong) el.classList.add('is-strong');
    }
    if (p.vibrate) vibrate(strong ? 45 : 20);
  };

  const start = async () => {
    if (metro.current || starting.current) return;
    starting.current = true;
    await unlockAudio();
    starting.current = false;
    if (!alive.current) return;
    const p = live.current;
    const m = createMetronome({ bpm: p.bpm, beatsPerBar: p.accent ? p.beats : 1, subdivision: p.sub, sound: true, onTick });
    metro.current = m;
    m.start();
    wake.acquire();
    setRunning(true);
  };

  const stop = () => {
    metro.current?.stop();
    metro.current = null;
    wake.release();
    setRunning(false);
    setBeat(-1);
    dot.current?.classList.remove('is-pulse', 'is-strong');
  };

  const tap = () => {
    const v = tapper.current.tap(performance.now());
    setTaps(tapper.current.count);
    if (v) setBpm(v);
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => alive.current && setTaps(0), TAP_RESET_MS);
  };

  const step = (d, text) => (
    <button type="button" class="metro-step" aria-label={text} onClick={() => setBpm(prefs.bpm + d)}>
      {d > 0 ? `+${d}` : `−${-d}`}
    </button>
  );

  return (
    <section class="drill metro" aria-label="Метроном">
      <div class="drill-cols">
        <div class="metro-main">
          <div class="metro-pulse" aria-hidden="true">
            <span ref={dot} class={`metro-dot${running ? ' is-running' : ''}`} />
          </div>
          <div class="metro-beats" aria-hidden="true">
            {Array.from({ length: prefs.beats }, (_, k) => (
              <span
                key={k}
                class={`metro-beat${k === 0 && prefs.accent ? ' is-accent' : ''}${running && k === beat ? ' is-on' : ''}`}
              />
            ))}
          </div>
          <div class="metro-bpm">
            {step(-5, 'Медленнее на 5')}
            {step(-1, 'Медленнее на 1')}
            <div class="metro-bpm-num">
              <output class="nums" aria-live="polite" aria-label={`${prefs.bpm} ударов в минуту`}>
                {prefs.bpm}
              </output>
              <span class="metro-bpm-word">BPM · {tempoWord(prefs.bpm)}</span>
            </div>
            {step(1, 'Быстрее на 1')}
            {step(5, 'Быстрее на 5')}
          </div>
        </div>

        <div class="stack">
          <Slider value={prefs.bpm} min={MIN} max={MAX} step={1} onChange={setBpm} label="Темп" format={(v) => `${v} BPM`} />
          <div class="metro-segs">
            <Segmented
              label="Размер"
              value={prefs.beats}
              options={[
                { value: 4, label: '4/4' },
                { value: 3, label: '3/4' },
              ]}
              onChange={(v) => update({ beats: v })}
            />
            <Segmented
              label="Деление доли"
              value={prefs.sub}
              options={[
                { value: 1, label: 'Четверти' },
                { value: 2, label: 'Восьмые' },
              ]}
              onChange={(v) => update({ sub: v })}
            />
          </div>
          <Toggle checked={prefs.accent} onChange={(v) => update({ accent: v })} label="Акцент на «раз»" hint="первая доля звучит выше" />
          {canVibrate && (
            <Toggle
              checked={prefs.vibrate}
              onChange={(v) => update({ vibrate: v })}
              label="Вибрация"
              hint="на каждую долю — удобно, когда шумно"
            />
          )}
        </div>
      </div>

      <div class="drill-actions">
        <Button
          variant="secondary"
          size="lg"
          icon={Hand}
          class="metro-tap"
          aria-label="Тап: задай темп нажатиями"
          onPointerDown={(e) => {
            if (e.button === 0) tap();
          }}
          onClick={(e) => {
            // клавиатура (Enter/пробел) даёт click без pointerdown
            if (e.detail === 0) tap();
          }}
        >
          {taps === 0 ? 'Тап' : taps === 1 ? 'Ещё…' : `Тап · ${taps}`}
        </Button>
        <Button variant="primary" size="lg" icon={running ? Square : Play} onClick={running ? stop : start}>
          {running ? 'Стоп' : 'Старт'}
        </Button>
      </div>
    </section>
  );
}
