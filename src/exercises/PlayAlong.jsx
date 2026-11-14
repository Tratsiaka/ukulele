import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BookOpen, Check, CircleCheck, Minus, Pause, Play, Plus, RotateCcw, SlidersHorizontal } from 'lucide-preact';
import { knownChordNames, markSongPlayed, settings, updateSong } from '../state.js';
import { parseSong, songChords } from '../core/song.js';
import { getShapes } from '../core/shapes.js';
import { requestWakeLock, vibrate } from '../lib/device.js';
import { unlockAudio } from '../audio/context.js';
import { chordLabel } from '../lib/format.js';
import { Button } from '../ui/Button.jsx';
import { ChordDiagram } from '../ui/ChordDiagram.jsx';
import { Sheet } from '../ui/Sheet.jsx';
import { Stepper } from '../ui/Stepper.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { toast } from '../ui/Toast.jsx';
import { useIsDesktop } from '../ui/useIsDesktop.js';
import { cx } from '../ui/icon.js';
import { Countdown } from './Countdown.jsx';
import { SongSheet } from './SongSheet.jsx';
import { ChordStrip } from './ChordStrip.jsx';
import { findScrollParent, pageScroll, useAutoscroll } from './useAutoscroll.js';
import {
  FONT_MAX, FONT_MIN, FONT_STEP, SHIFT_LIMIT, SPEED_MAX, SPEED_MIN,
  formatShift, keyNameAt, knownTester, normalizePrefs, playsMessage, prepareSong,
} from './sheet-model.js';
import './sheet.css';

/** @typedef {import('../state.js').SongRecord} SongRecord */
/** @typedef {{transpose: number, fontSize: number, speed: number, simplify: boolean}} PlayPrefs */
/** @typedef {(key: keyof PlayPrefs, value: any) => void} SetPref  value — значение или функция от прошлого */

const SAVE_DELAY = 600;
const COUNT_STEP_MS = 800;
const HINT_KEY = 'uke:sheet-tap-hint';
const HINT_TIMES = 3;
const HINT_MS = 2600;

// ---------- настройки песни ----------

/**
 * Настройки показа песни (транспонирование, шрифт, скорость, упрощение) с отложенной записью в record.prefs.
 * @param {SongRecord|null|undefined} record null — без записи (настройки ведёт кто-то снаружи)
 * @param {{initialTranspose?: number}} [opts] initialTranspose — стартовый сдвиг, если у песни свой не задан
 *   (например, shift из блока занятия); записывается, только если его поменять
 * @returns {{prefs: PlayPrefs, setPref: SetPref}}
 */
export function usePlayPrefs(record, { initialTranspose } = {}) {
  const [prefs, setPrefs] = useState(() => {
    const base = normalizePrefs(record?.prefs);
    if (Number.isFinite(initialTranspose) && !record?.prefs?.transpose) {
      base.transpose = normalizePrefs({ transpose: initialTranspose }).transpose;
    }
    return base;
  });
  const cur = useRef(prefs);
  cur.current = prefs;
  const idRef = useRef(record?.id);
  idRef.current = record?.id;
  const pending = useRef(/** @type {Partial<PlayPrefs>|null} */ (null));
  const timer = useRef(/** @type {any} */ (0));

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = 0;
    const patch = pending.current;
    pending.current = null;
    if (patch && idRef.current) updateSong(idRef.current, { prefs: patch });
  }, []);

  /** @type {SetPref} */
  const setPref = useCallback(
    (key, value) => {
      const prev = cur.current;
      const raw = typeof value === 'function' ? value(prev[key]) : value;
      const next = normalizePrefs({ ...prev, [key]: raw });
      if (next[key] === prev[key]) return;
      cur.current = next;
      setPrefs(next);
      if (!idRef.current) return;
      pending.current = { ...(pending.current ?? {}), [key]: next[key] };
      clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DELAY);
    },
    [save],
  );

  useEffect(() => save, [save]);
  return { prefs, setPref };
}

// ---------- экран не гаснет ----------

function useWakeLock() {
  const st = useRef({ on: false, gen: 0, release: /** @type {null|(() => Promise<void>)} */ (null) });
  const acquire = useCallback(() => {
    const s = st.current;
    if (s.on) return;
    s.on = true;
    const gen = ++s.gen;
    requestWakeLock()
      .then((release) => {
        if (s.on && s.gen === gen) s.release = release;
        else release().catch(() => {});
      })
      .catch(() => {});
  }, []);
  const release = useCallback(() => {
    const s = st.current;
    s.on = false;
    s.gen += 1;
    const r = s.release;
    s.release = null;
    r?.().catch(() => {});
  }, []);
  useEffect(() => release, [release]);
  return { acquire, release };
}

// ---------- отсчёт ----------

/**
 * Отсчёт 3-2-1 (общий Countdown со щелчками) поверх листа. Тап — отмена.
 * @param {{onDone: () => void, onCancel: () => void}} props
 */
function SheetCountdown({ onDone, onCancel }) {
  return (
    <div class="playalong__count" onClick={onCancel}>
      <Countdown from={3} interval={COUNT_STEP_MS} onDone={onDone} label="Приготовься" />
      <span class="playalong__count-hint">Тап — отмена</span>
    </div>
  );
}

// ---------- аккорд крупно ----------

function ChordDetail({ name, known }) {
  const shapes = getShapes(name);
  return (
    <div class="stack playalong__chord">
      <div class="row center">
        <ChordDiagram name={name} size="lg" sound />
      </div>
      {!shapes.length && <p class="center muted">Аппликатуры для этого аккорда пока нет.</p>}
      {shapes.length > 1 && (
        <>
          <p class="eyebrow center">Ещё варианты</p>
          <div class="row row-wrap center gap-4">
            {shapes.slice(1, 3).map((sh, i) => (
              <ChordDiagram key={i} name={name} shape={sh} size="md" sound showName={false} />
            ))}
          </div>
        </>
      )}
      {known !== undefined && (
        <p class="center small muted">{known ? 'Ты его знаешь. Тапни диаграмму — услышишь, как звучит.' : 'Новый аккорд — загляни в словарь и потренируй.'}</p>
      )}
      <Button href={`/chords/${encodeURIComponent(name)}`} variant="secondary" icon={BookOpen} block>
        Открыть в словаре
      </Button>
    </div>
  );
}

// ---------- разное ----------

function safeParse(record) {
  try {
    return parseSong(String(record?.text ?? ''), { title: record?.title, artist: record?.artist });
  } catch (err) {
    console.warn('[uke] не удалось разобрать песню', err);
    return { title: record?.title ?? '', artist: record?.artist ?? '', sections: [] };
  }
}

function takeHint() {
  try {
    const n = Number(localStorage.getItem(HINT_KEY)) || 0;
    if (n >= HINT_TIMES) return false;
    localStorage.setItem(HINT_KEY, String(n + 1));
    return true;
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

const PLAY_LABEL = { idle: 'Старт автопрокрутки', count: 'Отменить отсчёт', run: 'Пауза', pause: 'Продолжить', end: 'Сначала' };
const ANNOUNCE = { idle: '', count: '', run: 'Прокрутка идёт', pause: 'Пауза', end: 'Конец песни' };

/**
 * Режим игры: лист + полоса диаграмм + автопрокрутка с отсчётом 3-2-1 и минимальным управлением
 * (старт/пауза, скорость, Aa, транспонирование). Тап по листу — пауза. Пока играешь, экран не гаснет.
 * @param {{record: SongRecord, speedFactor?: number, embedded?: boolean, onDone?: () => void,
 *          prefs?: PlayPrefs, setPref?: SetPref, shift?: number, structureOnly?: boolean, showStrip?: boolean,
 *          top?: any, aside?: any, keys?: boolean, class?: string}} props
 *   embedded — компактно внутри тренировки/занятия/урока, кнопка «Сыграл ✓» (markSongPlayed + onDone);
 *   prefs/setPref — настройки снаружи (экран песни), иначе свои из record.prefs; shift — стартовый сдвиг;
 *   showStrip — false: вместо диаграмм строка имён; top — что показать над листом (баннер тональности);
 *   aside — верх боковой колонки на десктопе; keys — горячие клавиши и педаль (по умолчанию не в embedded)
 */
export function PlayAlong({
  record,
  speedFactor = 1,
  embedded = false,
  onDone,
  prefs: prefsProp,
  setPref: setPrefProp,
  shift,
  structureOnly = false,
  showStrip = true,
  top,
  aside,
  keys = !embedded,
  class: extra,
}) {
  const own = usePlayPrefs(prefsProp ? null : record, { initialTranspose: shift });
  const prefs = prefsProp ?? own.prefs;
  const setPref = setPrefProp ?? own.setPref;
  const desktop = useIsDesktop() && !embedded;
  const notation = settings.value?.notation ?? 'B';

  const song = useMemo(() => safeParse(record), [record?.text, record?.title, record?.artist]);
  const shownChords = useMemo(
    () => songChords(prepareSong(song, { transpose: prefs.transpose, simplify: prefs.simplify })),
    [song, prefs.transpose, prefs.simplify],
  );
  const keyName = useMemo(
    () => (record?.chords?.length ? keyNameAt(record.chords, prefs.transpose, song.key) : ''),
    [record?.chords, prefs.transpose, song],
  );
  const knownList = knownChordNames.value;
  const known = useMemo(() => new Set(knownList), [knownList]);
  const isKnown = useMemo(() => knownTester(known), [known]);

  const [phase, setPhase] = useState(/** @type {'idle'|'count'|'run'|'pause'|'end'} */ ('idle'));
  const [pop, setPop] = useState(/** @type {null|'font'|'key'|'tune'} */ (null));
  const [chordOpen, setChordOpen] = useState(/** @type {string|null} */ (null));
  const lastChord = useRef('');
  if (chordOpen) lastChord.current = chordOpen;
  const [played, setPlayed] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [hint, setHint] = useState(false);
  const hintShown = useRef(false);
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const sheetRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const wake = useWakeLock();

  useAutoscroll(sheetRef, {
    running: phase === 'run',
    speed: prefs.speed,
    fontSize: prefs.fontSize,
    factor: speedFactor,
    onEnd: () => setPhase('end'),
  });

  // Конец песни — экран можно гасить; подсказка про тап — пару секунд после первого старта
  useEffect(() => {
    if (phase === 'end') wake.release();
    if (phase === 'run' && !hintShown.current) {
      hintShown.current = true;
      if (takeHint()) setHint(true);
    }
  }, [phase]);

  useEffect(() => {
    if (!hint) return undefined;
    const t = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  // Высота липкой шапки страницы → отступ для липкой полосы аккордов и боковой колонки
  useEffect(() => {
    const root = rootRef.current;
    const head = root?.closest('.page')?.querySelector('.page-head');
    if (!root || !head || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => root.style.setProperty('--chordstrip-top', `${Math.round(head.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // Ушли в другое приложение посреди песни — пауза, чтобы по возвращении ничего не уехало
  useEffect(() => {
    if (phase !== 'run' || typeof document === 'undefined') return undefined;
    const onVis = () => {
      if (document.visibilityState === 'hidden') setPhase('pause');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase]);

  /** Поставить начало листа под липкие шапку и полосу. always — даже если уже ниже начала. */
  const alignToSheet = (always) => {
    const el = sheetRef.current;
    if (!el || typeof window === 'undefined') return;
    const sticky = [rootRef.current?.querySelector('.chordstrip--sticky'), el.closest('.page')?.querySelector('.page-head')];
    const line = Math.max(0, ...sticky.filter(Boolean).map((n) => n.getBoundingClientRect().bottom));
    const delta = el.getBoundingClientRect().top - line - 8;
    if (!always && delta <= 0) return;
    const target = findScrollParent(el);
    target?.scrollBy({ top: delta, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const begin = () => {
    unlockAudio().catch(() => {});
    wake.acquire();
    setPop(null);
    if (phase === 'end') setPlayed(false);
    alignToSheet(phase === 'end');
    setPhase('count');
  };

  const toggle = () => {
    if (phase === 'idle' || phase === 'end') begin();
    else if (phase === 'count') setPhase('idle');
    else if (phase === 'run') setPhase('pause');
    else {
      wake.acquire();
      setPhase('run');
    }
  };

  const onSheetClick = (e) => {
    if (e.target?.closest?.('button, a, input, select, textarea, label, pre')) return;
    const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (sel && !sel.isCollapsed) return;
    if (pop) {
      setPop(null);
      return;
    }
    if (phase === 'run' || phase === 'pause') toggle();
    else if (phase === 'idle' || phase === 'end') setNudge((n) => n + 1);
  };

  const openChord = (name) => {
    if (phase === 'run') setPhase('pause');
    setChordOpen(name);
  };

  const markPlayed = () => {
    if (played || !record) return;
    const rec = markSongPlayed(record.id);
    setPlayed(true);
    vibrate([20, 40, 20]);
    if (!embedded) toast(playsMessage(rec?.trainer?.plays ?? 1));
    onDone?.();
  };

  const bumpSpeed = (d) => setPref('speed', (v) => v + d);
  const bumpFont = (d) => setPref('fontSize', (v) => v + d * FONT_STEP);
  const bumpKey = (d) => setPref('transpose', (v) => v + d);

  // Горячие клавиши и Bluetooth-педали
  const turn = (dir) => pageScroll(sheetRef.current, dir, { smooth: phase !== 'run' });
  const live = useRef({ toggle, bumpSpeed, bumpFont, bumpKey, turn });
  live.current = { toggle, bumpSpeed, bumpFont, bumpKey, turn };
  const popRef = useRef(pop);
  popRef.current = pop;
  useEffect(() => {
    if (!keys || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.documentElement.classList.contains('is-locked')) return; // открыта шторка
      const t = /** @type {HTMLElement} */ (e.target);
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const L = live.current;
      const act = {
        ' ': () => (tag === 'BUTTON' || tag === 'A' ? false : L.toggle()),
        ArrowRight: () => L.bumpSpeed(1),
        ArrowLeft: () => L.bumpSpeed(-1),
        '+': () => L.bumpFont(1),
        '=': () => L.bumpFont(1),
        '-': () => L.bumpFont(-1),
        _: () => L.bumpFont(-1),
        ']': () => L.bumpKey(1),
        '[': () => L.bumpKey(-1),
        PageDown: () => L.turn(1),
        ArrowDown: () => L.turn(1),
        PageUp: () => L.turn(-1),
        ArrowUp: () => L.turn(-1),
        Escape: () => (popRef.current ? setPop(null) : false),
      }[e.key];
      if (act && act() !== false) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys]);

  if (!record) return <p class="muted center">Песня не найдена.</p>;

  const PlayIcon = phase === 'run' || phase === 'count' ? Pause : phase === 'end' ? RotateCcw : Play;
  const playButton = (
    <button
      type="button"
      class={cx('playalong__play', embedded && 'playalong__play--soft', phase === 'run' && 'is-running')}
      aria-label={PLAY_LABEL[phase]}
      title={PLAY_LABEL[phase]}
      onClick={toggle}
    >
      <PlayIcon size={28} strokeWidth={2.4} aria-hidden="true" />
      {nudge > 0 && <span key={nudge} class="playalong__nudge" aria-hidden="true" />}
    </button>
  );

  const speedStepper = (
    <Stepper label="Скорость" value={prefs.speed} min={SPEED_MIN} max={SPEED_MAX} onChange={(v) => setPref('speed', v)} />
  );
  const fontStepper = (
    <Stepper
      label="Размер текста"
      value={prefs.fontSize}
      min={FONT_MIN}
      max={FONT_MAX}
      step={FONT_STEP}
      onChange={(v) => setPref('fontSize', v)}
    />
  );
  const keyStepper = (
    <Stepper
      label={keyName ? `Тональность: ${chordLabel(keyName, { notation })}` : 'Тональность'}
      value={prefs.transpose}
      min={-SHIFT_LIMIT}
      max={SHIFT_LIMIT}
      onChange={(v) => setPref('transpose', v)}
      format={formatShift}
    />
  );
  const simplifyToggle = (
    <Toggle
      label="Упростить аккорды"
      hint="Am7 → Am, Cmaj7 → C"
      checked={prefs.simplify}
      onChange={(v) => setPref('simplify', v)}
    />
  );

  const status =
    phase === 'pause'
      ? 'Пауза · тап по листу — дальше'
      : phase === 'end'
        ? 'Вот и вся песня'
        : hint
          ? 'Тап по листу — пауза'
          : '';

  const tool = (id, label, content, extraClass) => (
    <button
      type="button"
      class={cx('playalong__tool', pop === id && 'is-active', extraClass)}
      aria-label={label}
      title={label}
      aria-expanded={pop === id ? 'true' : 'false'}
      onClick={() => setPop(pop === id ? null : id)}
    >
      {content}
    </button>
  );

  const bar = (
    <div class={cx('thumb-bar', 'playalong__bar', embedded && 'playalong__bar--embedded')}>
      {status && (
        <p class={cx('playalong__status', phase === 'end' && 'is-end')} aria-hidden="true">
          {status}
        </p>
      )}
      {pop && (
        <div class="playalong__pop stack gap-2">
          {pop === 'font' && fontStepper}
          {pop === 'key' && (
            <>
              {keyStepper}
              {simplifyToggle}
            </>
          )}
          {pop === 'tune' && (
            <>
              {speedStepper}
              {fontStepper}
              {keyStepper}
              {simplifyToggle}
            </>
          )}
        </div>
      )}
      <div class="playalong__controls">
        {playButton}
        {embedded ? (
          <>
            {tool('tune', 'Скорость, текст и тональность', <SlidersHorizontal size={22} aria-hidden="true" />)}
            <span class="spacer" />
            <Button
              variant="primary"
              icon={played ? CircleCheck : Check}
              onClick={markPlayed}
              disabled={played}
              class={cx('playalong__played', played && 'is-done')}
            >
              {played ? 'Записано' : 'Сыграл'}
            </Button>
          </>
        ) : (
          <>
            <div class="playalong__speed" role="group" aria-label="Скорость прокрутки">
              <button
                type="button"
                class="playalong__step"
                aria-label="Медленнее"
                disabled={prefs.speed <= SPEED_MIN}
                onClick={() => bumpSpeed(-1)}
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <span class="playalong__val">
                <output class="nums" aria-live="polite">
                  {prefs.speed}
                </output>
                <small aria-hidden="true">скорость</small>
              </span>
              <button
                type="button"
                class="playalong__step"
                aria-label="Быстрее"
                disabled={prefs.speed >= SPEED_MAX}
                onClick={() => bumpSpeed(1)}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
            {tool('font', 'Размер текста', <span class="playalong__aa">Aa</span>)}
            {tool(
              'key',
              'Тональность и упрощение',
              <span class="playalong__key">
                <span aria-hidden="true">♯♭</span>
                <small class="nums">{formatShift(prefs.transpose)}</small>
              </span>,
              prefs.transpose !== 0 && 'is-changed',
            )}
          </>
        )}
      </div>
    </div>
  );

  const panel = (
    <div class="playalong__panel stack gap-2">
      <div class="row">
        {playButton}
        <div class="grow">
          <p class="playalong__panel-state">{status || (phase === 'run' ? 'Играем' : 'Автопрокрутка')}</p>
          <p class="xsmall faint">Пробел — старт и пауза</p>
        </div>
      </div>
      {speedStepper}
      {fontStepper}
      {keyStepper}
      {simplifyToggle}
      <p class="playalong__keys xsmall faint">←/→ скорость · +/− текст · [ ] тональность · PgDn и ↓ листают</p>
    </div>
  );

  const endCard = (
    <div class={cx('playalong__end', phase === 'end' && 'is-ended')}>
      <p class="playalong__end-title">{phase === 'end' ? 'Вот и вся песня' : 'Доиграл до конца?'}</p>
      <div class="row row-wrap center gap-2">
        {!embedded && (
          <Button
            variant={phase === 'end' && !played ? 'primary' : 'secondary'}
            icon={played ? CircleCheck : Check}
            onClick={markPlayed}
            disabled={played}
            class={cx('playalong__played', played && 'is-done')}
          >
            {played ? 'Записано' : 'Сыграл'}
          </Button>
        )}
        {phase === 'end' && (
          <Button variant="ghost" icon={RotateCcw} onClick={toggle}>
            Ещё раз
          </Button>
        )}
      </div>
    </div>
  );

  const sheet = (
    <div class="playalong__sheet" ref={sheetRef} onClick={onSheetClick}>
      <SongSheet
        song={song}
        transpose={prefs.transpose}
        simplify={prefs.simplify}
        fontSize={prefs.fontSize}
        known={known}
        onChordTap={openChord}
        structureOnly={structureOnly}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      class={cx('playalong', embedded && 'playalong--embedded', desktop && 'playalong--desktop', phase === 'run' && 'is-running', extra)}
    >
      {desktop ? (
        <>
          <div class="playalong__main">
            {top}
            {sheet}
            {endCard}
          </div>
          <aside class="playalong__aside stack gap-4" aria-label="Управление и аккорды">
            {aside}
            {panel}
            <ChordStrip chords={shownChords} known={known} vertical size={shownChords.length > 8 ? 'sm' : 'md'} />
          </aside>
        </>
      ) : (
        <>
          {top}
          <ChordStrip chords={shownChords} known={known} compact={!showStrip} onChordTap={showStrip ? undefined : openChord} />
          {sheet}
          {(!embedded || phase === 'end') && endCard}
          {bar}
        </>
      )}
      {phase === 'count' && <SheetCountdown onDone={() => setPhase('run')} onCancel={() => setPhase('idle')} />}
      <Sheet open={Boolean(chordOpen)} onClose={() => setChordOpen(null)} title={chordLabel(lastChord.current, { notation })}>
        {lastChord.current && <ChordDetail name={lastChord.current} known={isKnown ? isKnown(lastChord.current) : undefined} />}
      </Sheet>
      <p class="sr-only" aria-live="polite">
        {ANNOUNCE[phase]}
      </p>
    </div>
  );
}
