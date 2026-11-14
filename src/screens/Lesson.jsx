import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, BookX, Check, Flame, Lightbulb, Music, Play, RotateCcw, SkipForward, Sparkles, Trophy } from 'lucide-preact';
import { Button, ChordChip, EmptyState, Page } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { navigate } from '../app/router.js';
import { addSong, completeLesson, getSong, logPractice, progress, settings, songs, todayStats } from '../state.js';
import { lessonById, levelById, levelProgress, isLessonDone, strumById } from '../core/curriculum.js';
import { starterSongById } from '../data/starter-songs.js';
import { chordLabel, formatDuration, plural } from '../lib/format.js';
import { TunerPanel } from '../exercises/TunerPanel.jsx';
import { ChordLearn } from '../exercises/ChordLearn.jsx';
import { WarmupQuiz } from '../exercises/WarmupQuiz.jsx';
import { OmcDrill } from '../exercises/OmcDrill.jsx';
import { StrumDrill } from '../exercises/StrumDrill.jsx';
import { PlayAlong } from '../exercises/PlayAlong.jsx';
import {
  createActiveClock, levelCoverage, levelNumber, newChordsOf, nextLessonAfter, paragraphs, practiceSeconds, stepLabel,
} from './learn-helpers.js';
import './learn.css';

/** @typedef {import('../core/curriculum.js').Lesson} Lesson */
/** @typedef {import('../core/curriculum.js').Step} Step */
/**
 * @typedef {{seconds: number, wasDone: boolean, newChords: string[], levelComplete: boolean, dayCounted: boolean,
 *            streak: number, next: Lesson|null}} LessonResult
 */

/** После «Сыграл» в песне — пауза, чтобы увидеть «Записано», и дальше. */
const SONG_ADVANCE_MS = 700;
/** Ушёл с урока на середине — время всё равно идёт в зачёт дня, если позанимался хотя бы столько. */
const PARTIAL_MIN_SECONDS = 30;

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function scrollTop() {
  if (typeof window !== 'undefined') window.scrollTo(0, 0);
}

/**
 * Урок (/learn/lesson/:id): шаги с точками прогресса и «Назад / Дальше», в конце — итог урока.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Lesson({ params }) {
  const lesson = lessonById(params?.id ?? '');
  if (!lesson || !lesson.steps?.length) {
    return (
      <Page title="Урок" back="/learn">
        <EmptyState
          icon={BookX}
          title="Такого урока нет"
          text="Возможно, ссылка устарела. Весь путь — во вкладке «Учёба»."
          action={{ label: 'К пути', href: '/learn' }}
        />
      </Page>
    );
  }
  return <LessonPlayer lesson={lesson} />;
}

/**
 * Время на уроке, пока экран виден (свернул приложение — часы стоят).
 * @returns {() => number} миллисекунды
 */
function useActiveClock() {
  const ref = useRef(/** @type {ReturnType<typeof createActiveClock>|null} */ (null));
  if (!ref.current) ref.current = createActiveClock(nowMs(), isVisible());
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVis = () => (isVisible() ? ref.current.resume(nowMs()) : ref.current.pause(nowMs()));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return () => ref.current.elapsed(nowMs());
}

/**
 * Проигрыватель урока.
 * @param {{lesson: Lesson}} props
 */
function LessonPlayer({ lesson }) {
  const steps = lesson.steps;
  const total = steps.length;
  const n = levelNumber(lesson.levelId);
  const notation = settings.value?.notation ?? 'B';

  const [index, setIndex] = useState(0);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const [result, setResult] = useState(/** @type {LessonResult|null} */ (null));
  const elapsed = useActiveClock();
  const knownBefore = useRef(/** @type {string[]|null} */ (null));
  if (!knownBefore.current) knownBefore.current = Object.keys(progress.value.knownChords);
  const finished = useRef(false);
  const timer = useRef(/** @type {any} */ (0));

  // Ушёл посреди урока — время всё равно засчитывается в день (но не как отдельное занятие).
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (finished.current) return;
      const sec = practiceSeconds(elapsed());
      if (sec >= PARTIAL_MIN_SECONDS) logPractice(sec, { session: false });
    },
    [],
  );

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    clearTimeout(timer.current);
    const seconds = practiceSeconds(elapsed());
    const before = progress.value;
    const dayBefore = todayStats.value.doneToday;
    const levelWasComplete = levelProgress(before, lesson.levelId).complete;
    const wasDone = isLessonDone(before, lesson.id);
    completeLesson(lesson.id);
    if (seconds > 0) logPractice(seconds);
    const after = progress.value;
    const stats = todayStats.value;
    setResult({
      seconds,
      wasDone,
      newChords: newChordsOf(lesson, knownBefore.current),
      levelComplete: !levelWasComplete && levelProgress(after, lesson.levelId).complete,
      dayCounted: !dayBefore && stats.doneToday,
      streak: stats.streak,
      next: nextLessonAfter(after, lesson.id, Object.keys(after.knownChords)),
    });
    scrollTop();
  };

  const goTo = (to) => {
    clearTimeout(timer.current);
    if (to >= total) {
      finish();
      return;
    }
    setIndex(Math.max(0, to));
    scrollTop();
  };

  const markDone = (at) =>
    setDoneSteps((prev) => {
      if (prev.has(at)) return prev;
      const next = new Set(prev);
      next.add(at);
      return next;
    });

  /** Упражнение закончено — отмечаем шаг и идём дальше. */
  const stepDone = (at, delay = 0) => {
    markDone(at);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => goTo(at + 1), delay);
  };

  if (result) return <LessonDone lesson={lesson} result={result} />;

  const step = steps[index];
  const isLast = index === total - 1;
  const isText = step.type === 'text';
  const backBtn =
    index > 0 ? (
      <Button variant="ghost" size="lg" icon={ArrowLeft} onClick={() => goTo(index - 1)}>
        Назад
      </Button>
    ) : null;

  return (
    <Page title={lesson.title} subtitle={`Уровень ${n} · ${lesson.minutes} мин`} back="/learn" class="ls">
      <StepProgress steps={steps} index={index} done={doneSteps} notation={notation} />

      <div class={cx('ls-stage', isText && 'ls-stage--text')} key={index}>
        <StepView step={step} onDone={(delay) => stepDone(index, delay)} />
      </div>

      {isText ? (
        <div class="thumb-bar ls-bar">
          {backBtn}
          <Button
            variant="primary"
            size="lg"
            icon={isLast ? Check : undefined}
            onClick={() => {
              markDone(index);
              goTo(index + 1);
            }}
          >
            {isLast ? 'Завершить урок' : 'Дальше'}
          </Button>
        </div>
      ) : (
        <div class="ls-quiet">
          {backBtn ?? <span />}
          <Button variant="ghost" icon={isLast ? Check : SkipForward} onClick={() => goTo(index + 1)}>
            {isLast ? 'Завершить урок' : doneSteps.has(index) ? 'Дальше' : 'Пропустить'}
          </Button>
        </div>
      )}
    </Page>
  );
}

/** Название шага с подробностями: «Новый аккорд · C», «Смены за минуту · C ⇄ Am». */
function stepTitle(step, notation) {
  const label = (c) => chordLabel(c, { notation });
  const base = stepLabel(step);
  if (step.type === 'chord') return `${base} · ${label(step.chord)}`;
  if (step.type === 'omc') return `${base} · ${label(step.pair[0])} ⇄ ${label(step.pair[1])}`;
  if (step.type === 'strum') return `${base} · ${strumById(step.pattern)?.name ?? ''}`.replace(/ · $/, '');
  return base;
}

/**
 * Точки прогресса урока и подпись текущего шага.
 * @param {{steps: Step[], index: number, done: Set<number>, notation: 'B'|'H'}} props
 */
function StepProgress({ steps, index, done, notation }) {
  const title = stepTitle(steps[index], notation);
  return (
    <div class="ls-progress">
      <ol class="ls-dots" aria-hidden="true">
        {steps.map((_, k) => (
          <li
            key={k}
            class={cx('ls-dot', done.has(k) && 'is-done', k < index && !done.has(k) && 'is-skipped', k === index && 'is-current')}
          />
        ))}
      </ol>
      <p class="ls-progress__label" aria-hidden="true">
        <span class="nums">
          {index + 1}/{steps.length}
        </span>
        <span class="ls-progress__what">{title}</span>
      </p>
      <p class="sr-only" aria-live="polite">
        Шаг {index + 1} из {steps.length}: {title}
      </p>
    </div>
  );
}

/**
 * Содержимое шага. onDone(delay?) — упражнение закончено, можно идти дальше.
 * @param {{step: Step, onDone: (delay?: number) => void}} props
 */
function StepView({ step, onDone }) {
  switch (step.type) {
    case 'text':
      return <TextStep step={step} />;
    case 'tuner':
      return (
        <>
          <header class="ls-head">
            <h2 class="ls-head__title">Настрой укулеле</h2>
            <p class="small muted">Дёрни струну и крути колок, пока стрелка не встанет в центр.</p>
          </header>
          <TunerPanel compact onDone={() => onDone()} />
        </>
      );
    case 'chord':
      return (
        <>
          {step.tip && (
            <p class="ls-tip">
              <Lightbulb size={18} aria-hidden="true" />
              <span>{step.tip}</span>
            </p>
          )}
          <ChordLearn name={step.chord} onDone={() => onDone()} />
        </>
      );
    case 'quiz':
      return <WarmupQuiz chords={step.chords} onDone={() => onDone()} />;
    case 'omc':
      return <OmcDrill a={step.pair[0]} b={step.pair[1]} target={step.target} onDone={() => onDone()} />;
    case 'strum':
      return <StrumDrill patternId={step.pattern} bpm={step.bpm} chords={step.chords} onDone={() => onDone()} />;
    case 'song':
      return <SongStep step={step} onDone={() => onDone(SONG_ADVANCE_MS)} />;
    default:
      return <EmptyState title="Этот шаг пока не умеем показывать" text="Пропусти его — дальше всё работает." />;
  }
}

/**
 * Текстовый шаг: заголовок и короткие абзацы.
 * @param {{step: Extract<Step, {type: 'text'}>}} props
 */
function TextStep({ step }) {
  const paras = paragraphs(step.body);
  return (
    <article class="ls-text">
      {step.title && <h2 class="ls-text__title">{step.title}</h2>}
      {paras.map((p, k) => (
        <p key={k} class={cx('ls-text__p', k === 0 && !step.title && 'ls-text__lead')}>
          {p}
        </p>
      ))}
    </article>
  );
}

/**
 * Песня урока под автопрокрутку (на доле темпа из шага). Удалённую стартовую песню можно вернуть.
 * @param {{step: Extract<Step, {type: 'song'}>, onDone: () => void}} props
 */
function SongStep({ step, onDone }) {
  void songs.value; // подписка: песня может вернуться в библиотеку
  const record = getSong(step.songId);
  const starter = starterSongById(step.songId);
  const [restoring, setRestoring] = useState(false);
  const speed = Number.isFinite(step.speed) && step.speed > 0 ? step.speed : 1;

  if (!record) {
    const restore = () => {
      if (!starter || restoring) return;
      setRestoring(true);
      addSong({ ...starter, source: { site: 'starter' } }).catch(() => setRestoring(false));
    };
    return (
      <EmptyState
        icon={Music}
        title={starter ? `«${starter.title}» нет в библиотеке` : 'Песня не найдена'}
        text={starter ? 'Похоже, ты её удалил. Она из стартового набора — можно вернуть.' : 'Пропусти этот шаг — урок засчитается и без неё.'}
        action={
          starter ? { label: restoring ? 'Возвращаю…' : 'Вернуть песню', icon: RotateCcw, onClick: restore } : undefined
        }
      />
    );
  }

  return (
    <div class="ls-song">
      <header class="ls-head">
        <p class="eyebrow">Песня</p>
        <h2 class="ls-head__title">{record.title}</h2>
        <p class="small muted">
          {record.artist}
          {record.artist && speed !== 1 ? ' · ' : ''}
          {speed !== 1 && <span class="nums">темп {Math.round(speed * 100)} %</span>}
        </p>
      </header>
      <PlayAlong record={record} speedFactor={speed} embedded onDone={onDone} />
    </div>
  );
}

/**
 * Итог урока: отметка, время, новые аккорды, серия и следующий шаг.
 * @param {{lesson: Lesson, result: LessonResult}} props
 */
function LessonDone({ lesson, result }) {
  const level = levelById(lesson.levelId);
  const n = levelNumber(lesson.levelId);
  const cover = result.levelComplete ? levelCoverage(lesson.levelId) : null;
  const next = result.next;
  const nextN = next ? levelNumber(next.levelId) : null;
  const days = (k) => `${k} ${plural(k, ['день', 'дня', 'дней'])}`;

  let streakLine = '';
  if (result.dayCounted) streakLine = result.streak >= 2 ? `День засчитан — серия ${days(result.streak)}` : 'День засчитан — серия началась';
  else if (result.streak >= 2) streakLine = `Серия: ${days(result.streak)}`;

  const eyebrow = result.levelComplete ? `Уровень ${n} пройден` : result.wasDone ? 'Урок повторён' : 'Урок пройден';

  return (
    <Page title={lesson.title} subtitle={`Уровень ${n}`} back="/learn" class="ls ls--done">
      <section class="ls-done" aria-labelledby="ls-done-title">
        <div class={cx('ls-done__burst', result.levelComplete && 'is-level')} aria-hidden="true">
          <span class="ls-done__wave" />
          <span class="ls-done__check">{result.levelComplete ? <Trophy size={40} /> : <Check size={44} strokeWidth={3} />}</span>
        </div>
        <p class="eyebrow">{eyebrow}</p>
        <h2 id="ls-done-title" class="ls-done__title">
          {result.levelComplete && level ? `«${level.title}» позади` : lesson.title}
        </h2>
        <p class="muted">
          <span class="nums">{formatDuration(result.seconds)}</span> практики
        </p>

        {result.newChords.length > 0 && (
          <div class="ls-done__chords">
            <p class="ls-done__label">{result.newChords.length === 1 ? 'Новый аккорд в копилке' : 'Новые аккорды в копилке'}</p>
            <div class="ls-done__chips">
              {result.newChords.map((c, k) => (
                <span key={c} class="ls-done__chip" style={{ animationDelay: `${300 + k * 90}ms` }}>
                  <ChordChip name={c} known />
                </span>
              ))}
            </div>
          </div>
        )}

        {streakLine && (
          <p class="ls-done__streak">
            <Flame size={18} aria-hidden="true" />
            {streakLine}
          </p>
        )}
        {cover && (
          <p class="ls-done__cover">
            <Sparkles size={16} aria-hidden="true" />
            <span>{cover.text}</span>
          </p>
        )}
      </section>

      <div class="ls-done__actions">
        {next ? (
          <>
            <Button variant="primary" size="lg" block icon={Play} href={`/learn/lesson/${next.id}`} replace>
              Следующий урок
            </Button>
            <p class="ls-done__next small muted">
              {next.levelId !== lesson.levelId && `Уровень ${nextN} · `}
              {next.title} · {next.minutes} мин
            </p>
          </>
        ) : (
          <Button variant="primary" size="lg" block icon={Music} href="/songs" replace>
            Выбрать песню
          </Button>
        )}
        <Button variant="secondary" size="lg" block onClick={() => navigate('/learn', { replace: true })}>
          К пути
        </Button>
      </div>
    </Page>
  );
}
