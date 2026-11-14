import { useEffect, useRef, useState } from 'preact/hooks';
import {
  BookOpen, Check, Flame, Gauge, KeyRound, Music, SkipForward, Sprout, Trophy, Unlock, X,
} from 'lucide-preact';
import { Button, Chip, ChordDiagram, EmptyState, IconButton, ProgressRing, Sheet, toast } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { back, navigate } from '../app/router.js';
import {
  flush, knownChordNames, logPractice, progress, settings, songs, today, todayStats, updateSong,
} from '../state.js';
import { buildSession } from '../core/practice.js';
import { chordLabel, countLabel, formatClock, formatDuration, plural } from '../lib/format.js';
import { TunerPanel } from '../exercises/TunerPanel.jsx';
import { WarmupQuiz } from '../exercises/WarmupQuiz.jsx';
import { ChordLearn } from '../exercises/ChordLearn.jsx';
import { OmcDrill } from '../exercises/OmcDrill.jsx';
import { StrumDrill } from '../exercises/StrumDrill.jsx';
import { PlayAlong } from '../exercises/PlayAlong.jsx';
import { useWakeLock } from '../exercises/drill-hooks.js';
import { formatShift } from '../exercises/sheet-model.js';
import {
  brokenRecords, clockMs, clockPause, clockResume, clockSeconds, clockStart, closePolicy, learnedChords, lessonPreview,
  pairLabel, plannedSeconds, segmentFill, streakChange, unlockedSongs, weekGoal,
} from './practice-helpers.js';
import './today.css';

/** @typedef {import('../core/practice.js').Block} Block */
/** @typedef {'todo'|'done'|'skipped'} BlockStatus */

const DAYS = ['день', 'дня', 'дней'];
const SONGS_OPENED = ['песня открыта', 'песни открыты', 'песен открыто'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Занятие дня (/practice?min=10): план из buildSession, блоки по очереди (тюнер, разминка, новинка, смены, бой, песня),
 * сверху — ход занятия и время, «Пропустить» и «Закончить». Время считается только при открытой вкладке.
 * В конце — logPractice один раз и итог: время, блоки, рекорды, серия, открытые песни.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Practice({ query }) {
  // План и снимок «до» — один раз на занятие: прогресс по ходу меняется, план — нет.
  const [boot] = useState(() => {
    const minutes = Number(query?.min) || settings.peek().sessionMinutes || 10;
    return {
      plan: buildSession(progress.peek(), songs.peek(), { minutes, today: today.peek() }),
      progress: progress.peek(),
      known: knownChordNames.peek(),
      stats: todayStats.peek(),
    };
  });
  const blocks = boot.plan.blocks;
  const planned = plannedSeconds(blocks);

  const [index, setIndex] = useState(0);
  const [pairIdx, setPairIdx] = useState(0);
  const [pairsDone, setPairsDone] = useState(0);
  const [statuses, setStatuses] = useState(/** @type {BlockStatus[]} */ (() => blocks.map(() => 'todo')));
  const [summary, setSummary] = useState(/** @type {Summary|null} */ (null));
  const [confirm, setConfirm] = useState(false);

  const clock = useRef(clockStart(now()));
  const blockStartMs = useRef(0);
  const loggedSec = useRef(0);
  const finished = useRef(false);
  const wakeOn = useRef(false);
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const headRef = useRef(/** @type {HTMLElement|null} */ (null));
  const wake = useWakeLock();

  const elapsedSec = () => clockSeconds(clock.current, now());

  // Дописать в прогресс время сверх уже записанного. Занятием считается только первая запись.
  const logUpTo = (sec) => {
    const add = Math.floor(sec) - loggedSec.current;
    if (add <= 0) return 0;
    logPractice(add, { session: loggedSec.current === 0 });
    loggedSec.current += add;
    return add;
  };

  // Вкладка скрыта — часы стоят; на всякий случай записываем время (Android может выгрузить вкладку).
  useEffect(() => {
    const onVisibility = () => {
      if (finished.current) return;
      const t = now();
      if (document.visibilityState === 'hidden') {
        clock.current = clockPause(clock.current, t);
        const sec = clockSeconds(clock.current, t);
        if (closePolicy(sec).logSeconds && logUpTo(sec)) flush();
      } else {
        clock.current = clockResume(clock.current, t);
      }
    };
    if (document.visibilityState === 'hidden') clock.current = clockPause(clock.current, now());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Ушли с экрана посередине (жест «назад», переход в урок) — засчитываем время, если позанимался больше минуты.
  useEffect(
    () => () => {
      if (finished.current) return;
      const sec = clockSeconds(clock.current, now());
      if (closePolicy(sec).logSeconds && logUpTo(sec)) toast(`Засчитали ${formatDuration(loggedSec.current)}`);
    },
    [],
  );

  useEffect(() => {
    document.title = 'Занятие · Уке';
  }, []);

  // Высота шапки → липкая полоса аккордов песни встаёт под неё.
  useEffect(() => {
    const head = headRef.current;
    const root = rootRef.current;
    if (!head || !root || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => root.style.setProperty('--practice-head', `${head.offsetHeight}px`));
    ro.observe(head);
    return () => ro.disconnect();
  }, [summary]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [index, pairIdx, summary]);

  // Экран не гаснет всё занятие — после первого касания (Wake Lock только из жеста).
  const onPointerDown = () => {
    if (wakeOn.current || finished.current) return;
    wakeOn.current = true;
    wake.acquire();
  };

  const finish = (finalStatuses) => {
    if (finished.current) return;
    const t = now();
    clock.current = clockPause(clock.current, t);
    const total = clockSeconds(clock.current, t);
    logUpTo(total);
    finished.current = true;
    wake.release();
    flush();
    const after = progress.peek();
    const knownAfter = knownChordNames.peek();
    const stats = todayStats.peek();
    setSummary({
      total,
      done: finalStatuses.filter((s) => s === 'done').length,
      count: blocks.length,
      records: brokenRecords(boot.progress, after),
      learned: learnedChords(boot.progress, after),
      unlocked: unlockedSongs(songs.peek(), boot.known, knownAfter),
      streak: streakChange(boot.stats, stats),
      goal: weekGoal(stats.weekSeconds, stats.weeklyGoalSec),
    });
  };

  /** @param {BlockStatus} status */
  const next = (status = 'done') => {
    const nextStatuses = statuses.slice();
    nextStatuses[index] = status;
    setStatuses(nextStatuses);
    if (index + 1 >= blocks.length) {
      finish(nextStatuses);
      return;
    }
    blockStartMs.current = clockMs(clock.current, now());
    setIndex(index + 1);
    setPairIdx(0);
    setPairsDone(0);
  };

  const block = blocks[index];
  const pairs = block?.type === 'omc' ? block.payload.pairs ?? [] : [];

  const onPairDone = () => {
    const done = pairsDone + 1;
    setPairsDone(done);
    if (pairIdx + 1 < pairs.length) setPairIdx(pairIdx + 1);
    else next('done');
  };

  const skip = () => {
    if (block.type === 'omc' && pairIdx + 1 < pairs.length) {
      setPairIdx(pairIdx + 1);
      return;
    }
    next(block.type === 'omc' && pairsDone > 0 ? 'done' : 'skipped');
  };

  const leave = (path) => navigate(path, { replace: true });

  const close = () => {
    if (closePolicy(elapsedSec()).confirm) setConfirm(true);
    else back('/today');
  };

  const endEarly = () => {
    const t = now();
    clock.current = clockPause(clock.current, t);
    const sec = clockSeconds(clock.current, t);
    logUpTo(sec);
    finished.current = true;
    flush();
    setConfirm(false);
    toast(`Засчитали ${formatDuration(sec)}. До завтра`);
    back('/today');
  };

  if (summary) return <Finish summary={summary} />;

  const notation = settings.value.notation;
  const label = (name) => chordLabel(name, { notation });
  const stepLabel = block.type === 'omc' && pairs.length > 1 ? `пара ${pairIdx + 1} из ${pairs.length}` : '';

  return (
    <div class="page practice" ref={rootRef} onPointerDown={onPointerDown}>
      <SessionBar
        headRef={headRef}
        blocks={blocks}
        index={index}
        statuses={statuses}
        clock={clock}
        blockStartMs={blockStartMs}
        planned={planned}
        title={block.title}
        stepLabel={stepLabel}
        onClose={close}
        onSkip={skip}
      />

      <div class="practice-block" key={`${index}:${pairIdx}`}>
        <BlockView
          block={block}
          pair={pairs[pairIdx]}
          label={label}
          onDone={next}
          onPairDone={onPairDone}
          onLeave={leave}
        />
      </div>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Закончить занятие?">
        <div class="stack gap-4">
          <p class="muted">
            Ты занимался {formatDuration(elapsedSec())}. Это время засчитаем
            {!boot.stats.doneToday ? ', и день попадёт в серию.' : '.'}
          </p>
          <div class="practice-confirm">
            <Button variant="secondary" size="lg" onClick={endEarly}>
              Закончить
            </Button>
            <Button variant="primary" size="lg" onClick={() => setConfirm(false)}>
              Продолжить
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- шапка: ход занятия и время ----------

function SessionBar({ headRef, blocks, index, statuses, clock, blockStartMs, planned, title, stepLabel, onClose, onSkip }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = clockMs(clock.current, now());
  const fill = segmentFill(blocks, index, (ms - blockStartMs.current) / 1000);
  const elapsed = Math.floor(ms / 1000);
  const over = elapsed > planned;

  return (
    <header class="practice-head" ref={headRef}>
      <div class="practice-head__row">
        <IconButton icon={X} label="Закончить занятие" onClick={onClose} />
        <div class="practice-head__titles">
          <p class="practice-head__step xsmall">
            Блок {index + 1} из {blocks.length}
            {stepLabel && ` · ${stepLabel}`}
          </p>
          <h1 class="practice-head__title truncate">{title}</h1>
        </div>
        <Button variant="ghost" size="sm" icon={SkipForward} onClick={onSkip} class="practice-head__skip">
          Пропустить
        </Button>
      </div>
      <div
        class="practice-segs"
        role="progressbar"
        aria-label="Ход занятия"
        aria-valuemin={0}
        aria-valuemax={blocks.length}
        aria-valuenow={index}
        aria-valuetext={`Блок ${index + 1} из ${blocks.length}`}
      >
        {blocks.map((b, i) => (
          <span
            key={i}
            class={cx('practice-segs__seg', i === index && 'is-current', statuses[i] === 'skipped' && 'is-skipped')}
            style={{ flexGrow: Math.max(1, b.seconds) }}
          >
            <span class="practice-segs__fill" style={{ transform: `scaleX(${fill[i]})` }} />
          </span>
        ))}
      </div>
      <p class="practice-head__time xsmall nums">
        <span class={cx(over && 'practice-head__over')}>{formatClock(elapsed)}</span>
        <span class="faint"> / {formatClock(planned)}</span>
      </p>
    </header>
  );
}

// ---------- текущий блок ----------

function BlockView({ block, pair, label, onDone, onPairDone, onLeave }) {
  const p = block.payload ?? {};
  switch (block.type) {
    case 'tuner':
      return <TunerPanel compact onDone={() => onDone('done')} />;
    case 'warmup':
      return <WarmupQuiz chords={p.chords ?? []} onDone={() => onDone('done')} />;
    case 'new':
      return <NewBlock payload={p} label={label} onDone={onDone} onLeave={onLeave} />;
    case 'omc':
      return pair ? (
        <OmcDrill a={pair[0]} b={pair[1]} seconds={p.seconds ?? 60} compact onDone={onPairDone} />
      ) : (
        <Skipper text="Пар для смен пока нет." onDone={() => onDone('skipped')} />
      );
    case 'strum':
      return <StrumDrill patternId={p.patternId} bpm={p.bpm} chords={p.chords} onDone={() => onDone('done')} />;
    case 'song':
      return <SongBlock payload={p} label={label} onDone={onDone} />;
    default:
      return <Skipper text="Этот блок пока не умеем показывать." onDone={() => onDone('skipped')} />;
  }
}

function Skipper({ text, onDone }) {
  return <EmptyState title={text} action={{ label: 'Дальше', onClick: onDone }} />;
}

function NewBlock({ payload, label, onDone, onLeave }) {
  if (payload.chord) {
    return (
      <div class="stack gap-3">
        {payload.gain > 0 && (
          <p class="practice-gain small">
            <Unlock size={16} aria-hidden="true" />
            <span>
              {label(payload.chord)} откроет ещё {countLabel(payload.gain, ['песню', 'песни', 'песен'])}
            </span>
          </p>
        )}
        <ChordLearn name={payload.chord} onDone={() => onDone('done')} />
      </div>
    );
  }
  const lesson = lessonPreview(payload.lessonId);
  if (!lesson) return <Skipper text="Новинку не нашли — идём дальше." onDone={() => onDone('skipped')} />;
  return (
    <section class="card card--accent practice-lesson" aria-labelledby="practice-lesson-title">
      <span class="practice-lesson__icon" aria-hidden="true">
        <Sprout size={24} />
      </span>
      <p class="eyebrow">Новое сегодня</p>
      <h2 id="practice-lesson-title" class="practice-lesson__title">
        {lesson.title}
      </h2>
      <p class="small muted">
        Урок на {lesson.minutes} мин. Он откроется отдельно, а время этого занятия сохранится.
      </p>
      {lesson.steps.length > 0 && (
        <ul class="row row-wrap gap-2 practice-lesson__steps">
          {lesson.steps.map((s) => (
            <li key={s}>
              <Chip tone="outline">{s}</Chip>
            </li>
          ))}
        </ul>
      )}
      <div class="practice-lesson__actions">
        <Button variant="ghost" size="lg" onClick={() => onDone('skipped')}>
          Не сейчас
        </Button>
        <Button variant="primary" size="lg" icon={BookOpen} onClick={() => onLeave(`/learn/lesson/${lesson.id}`)}>
          Открыть урок
        </Button>
      </div>
    </section>
  );
}

function SongBlock({ payload, label, onDone }) {
  const rec = songs.value.find((s) => s.id === payload.songId);
  const [applied, setApplied] = useState(false);
  const [chordOpen, setChordOpen] = useState(/** @type {string|null} */ (null));
  const lastChord = useRef('');
  if (chordOpen) lastChord.current = chordOpen;

  if (!rec) {
    return (
      <EmptyState
        icon={Music}
        title="Песня не нашлась"
        text="Похоже, её удалили. Выбери любую в «Песнях» — а занятие можно завершить."
        action={{ label: 'Завершить', onClick: () => onDone('skipped') }}
      />
    );
  }

  const shift = Math.round(Number(payload.shift) || 0);
  const ownShift = Math.round(Number(rec.prefs?.transpose) || 0);
  const speed = Number(payload.speed) || 1;
  const missing = payload.missing ?? [];
  // Сдвиг из плана действует только здесь; в песню записываем, только если попросят.
  const canApply = shift !== 0 && ownShift === 0;

  const apply = () => {
    updateSong(rec.id, { prefs: { transpose: shift } });
    setApplied(true);
    toast('Тональность сохранена для песни');
  };

  const meta = (
    <div class="practice-song stack gap-2">
      {rec.artist && <p class="small muted truncate">{rec.artist}</p>}
      <div class="row row-wrap gap-2">
        <Chip tone="teal" icon={Gauge}>
          темп {Math.round(speed * 100)} %
        </Chip>
        {canApply && !applied && (
          <Chip tone="accent" icon={KeyRound} onClick={apply} aria-label={`Сохранить тональность ${formatShift(shift)} для песни`}>
            Тональность {formatShift(shift)} · сохранить
          </Chip>
        )}
        {(applied || (shift !== 0 && ownShift === shift)) && (
          <Chip tone="success" icon={Check}>
            Тональность {formatShift(shift)}
          </Chip>
        )}
      </div>
      {missing.length > 0 && (
        <div class="row row-wrap gap-2 practice-song__missing">
          <span class="small muted">Не хватает:</span>
          {missing.map((m) => (
            <Chip key={m} tone="warn" onClick={() => setChordOpen(m)} aria-label={`Показать аккорд ${label(m)}`}>
              {label(m)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PlayAlong record={rec} embedded speedFactor={speed} shift={shift} top={meta} onDone={() => onDone('done')} />
      <Sheet open={Boolean(chordOpen)} onClose={() => setChordOpen(null)} title={label(lastChord.current)}>
        {lastChord.current && (
          <div class="stack gap-3 center">
            <ChordDiagram name={lastChord.current} size="lg" sound />
            <p class="small muted">Пока его нет в копилке — можно пропускать этот аккорд и играть остальные.</p>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------- итог ----------

/**
 * @typedef {{total: number, done: number, count: number, records: import('./practice-helpers.js').SessionRecord[],
 *            learned: string[], unlocked: number, streak: ReturnType<typeof streakChange>,
 *            goal: ReturnType<typeof weekGoal>}} Summary
 */

function Finish({ summary }) {
  const notation = settings.value.notation;
  const label = (name) => chordLabel(name, { notation });
  const { total, done, count, records, learned, unlocked, streak, goal } = summary;
  const real = records.filter((r) => !r.first);
  const firsts = records.filter((r) => r.first);

  useEffect(() => {
    document.title = 'Итог занятия · Уке';
  }, []);

  const recordText = (r) =>
    r.kind === 'omc' ? `${pairLabel(r.a, r.b, label)} — ${r.to}` : `Бой «${r.name.replace(/[«»]/g, '')}» — ${r.to} BPM`;

  return (
    <div class="page practice practice-finish">
      <div class="practice-finish__hero" aria-live="polite">
        <span class="practice-finish__mark" aria-hidden="true">
          <Check size={40} strokeWidth={3} />
        </span>
        <h1 class="practice-finish__title">{streak.grew ? 'День засчитан' : 'Занятие окончено'}</h1>
        <p class="muted nums">
          {formatDuration(total)} · {done} из {count} {plural(count, ['блока', 'блоков', 'блоков'])}
        </p>
      </div>

      <div class="practice-finish__cards">
        {streak.counted ? (
          <div class={cx('practice-streak', streak.grew && 'is-grew')}>
            <span class="practice-streak__flame" aria-hidden="true">
              <Flame size={28} />
            </span>
            <p class="practice-streak__text">
              {streak.grew && streak.from > 0 && (
                <>
                  <span class="practice-streak__from nums" aria-hidden="true">
                    {streak.from}
                  </span>
                  <span class="faint" aria-hidden="true">
                    {' → '}
                  </span>
                </>
              )}
              <span class="practice-streak__to nums">{streak.to}</span> {plural(streak.to, DAYS)} подряд
            </p>
          </div>
        ) : (
          <p class="practice-finish__note small muted">Чтобы день попал в серию, нужна хотя бы минута занятий.</p>
        )}

        {real.length > 0 && (
          <ul class="practice-records" aria-label="Рекорды">
            {real.map((r) => (
              <li key={r.kind === 'omc' ? `${r.a}|${r.b}` : r.patternId} class="practice-records__item is-record">
                <Trophy size={18} aria-hidden="true" />
                <span class="grow">
                  <b>Рекорд:</b> {recordText(r)}
                </span>
                <span class="small faint nums">было {r.from}</span>
              </li>
            ))}
          </ul>
        )}
        {firsts.length > 0 && (
          <ul class="practice-records" aria-label="Первые замеры">
            {firsts.map((r) => (
              <li key={r.kind === 'omc' ? `${r.a}|${r.b}` : r.patternId} class="practice-records__item">
                <Check size={18} aria-hidden="true" />
                <span class="grow">Первый замер: {recordText(r)}</span>
              </li>
            ))}
          </ul>
        )}

        {learned.length > 0 && (
          <div class="practice-learned">
            <p class="small muted">{learned.length > 1 ? 'Новые аккорды' : 'Новый аккорд'}</p>
            <div class="row row-wrap gap-2">
              {learned.map((c) => (
                <span key={c} class="practice-learned__chord chord-name">
                  {label(c)}
                </span>
              ))}
            </div>
            {unlocked > 0 && (
              <p class="practice-unlocked">
                <Unlock size={18} aria-hidden="true" />+{unlocked} {plural(unlocked, SONGS_OPENED)}
              </p>
            )}
          </div>
        )}

        <div class="practice-week">
          <ProgressRing value={goal.ratio} size={52} tone="teal" label={`За неделю ${goal.minutes} из ${goal.goalMinutes} минут`}>
            {goal.reached ? <Check size={18} aria-hidden="true" /> : null}
          </ProgressRing>
          <p class="small">
            {goal.reached ? (
              <>
                <b>Цель недели выполнена.</b> {goal.minutes} мин
              </>
            ) : (
              <>
                За неделю <b class="nums">{goal.minutes}</b> из {goal.goalMinutes} мин
                <span class="muted"> · осталось {goal.leftMinutes}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div class="thumb-bar practice-finish__bar">
        <Button variant="secondary" size="lg" icon={Music} onClick={() => navigate('/songs', { replace: true })}>
          Ещё песню
        </Button>
        <Button variant="primary" size="lg" icon={Check} onClick={() => back('/today')}>
          Готово
        </Button>
      </div>
    </div>
  );
}
