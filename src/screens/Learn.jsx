import { useMemo, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, Hand, Library, Lock, Music, Play, Plus, Repeat, Sparkles, Target, Trophy } from 'lucide-preact';
import { Button, Card, ChordChip, Page, ProgressRing } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { Link, navigate } from '../app/router.js';
import { knownChordNames, progress, settings, songs, today } from '../state.js';
import { lessonsOfLevel, strumById } from '../core/curriculum.js';
import { chordLabel, formatDay, plural } from '../lib/format.js';
import { lessonTags, levelCoverage, levelNumber, libraryUnlocks, pathModel } from './learn-helpers.js';
import './learn.css';

/** @typedef {ReturnType<typeof pathModel>} PathModel */
/** @typedef {PathModel['levels'][number]} LevelEntry */

const STATUS = {
  done: () => 'пройден',
  current: () => 'ты здесь',
  open: (e) => (e.done > 0 ? 'не закончен' : 'пропущен'),
  ahead: () => 'впереди',
};

/**
 * Вкладка «Учёба» (/learn): куда продолжить, ссылка на «Тренировать песню» и путь по уровням L0–L6.
 * Текущий уровень раскрыт со списком уроков; будущие видны и открываются — можно забегать вперёд.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Learn() {
  const p = progress.value;
  const knownList = knownChordNames.value;
  const known = useMemo(() => new Set(knownList), [knownList]);
  const model = useMemo(() => pathModel(p, knownList), [p, knownList]);
  const songList = songs.value;
  const unlocks = useMemo(() => libraryUnlocks(songList.map((s) => s.chords)), [songList]);
  const notation = settings.value?.notation ?? 'B';
  const day = today.value;

  const [open, setOpen] = useState(() => new Set([model.focusId]));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Page title="Учёба" wide>
      <div class="lp">
        <aside class="lp-aside" aria-label="Куда дальше">
          <p class="lp-intro">Семь уровней — от первого звука до своих песен. Забегать вперёд можно.</p>
          <ContinueCard model={model} />
          <Card href="/songs" class="lp-songs">
            <span class="lp-songs__icon" aria-hidden="true">
              <Music size={22} />
            </span>
            <span class="lp-songs__text">
              <span class="lp-songs__q">Хочешь сразу песню?</span>
              <span class="lp-songs__a">Тренировать песню</span>
            </span>
            <ChevronRight class="lp-songs__chev" size={20} aria-hidden="true" />
          </Card>
        </aside>

        <section class="lp-path" aria-label="Уровни">
          <ol class="lp-levels">
            {model.levels.map((entry) => (
              <LevelCard
                key={entry.level.id}
                entry={entry}
                open={open.has(entry.level.id)}
                onToggle={() => toggle(entry.level.id)}
                known={known}
                nextId={model.next?.id ?? null}
                lessonsDone={p.lessonsDone}
                gained={unlocks[entry.level.id]?.gained ?? 0}
                notation={notation}
                day={day}
              />
            ))}
          </ol>
        </section>
      </div>
    </Page>
  );
}

/**
 * Карточка «продолжить»: следующий урок, прогресс уровня и одна главная кнопка.
 * @param {{model: PathModel}} props
 */
function ContinueCard({ model }) {
  const next = model.next;
  if (!next) {
    return (
      <Card tone="success" class="lp-hero">
        <span class="lp-hero__trophy" aria-hidden="true">
          <Trophy size={26} />
        </span>
        <div class="lp-hero__text">
          <p class="eyebrow">Весь путь пройден</p>
          <h2 class="lp-hero__title">Дальше — свой репертуар</h2>
          <p class="small muted">Все {model.total} уроков позади. Держи форму занятием дня и новыми песнями.</p>
        </div>
        <Button variant="primary" size="lg" block icon={Music} href="/songs">
          Выбрать песню
        </Button>
      </Card>
    );
  }
  const entry = model.levels.find((l) => l.level.id === next.levelId);
  const started = model.done > 0;
  const n = levelNumber(next.levelId);
  return (
    <Card tone="accent" class="lp-hero">
      <div class="lp-hero__top">
        <ProgressRing
          value={entry.total ? entry.done / entry.total : 0}
          size={60}
          label={`Уровень ${n}: пройдено ${entry.done} из ${entry.total}`}
        >
          <span class="lp-hero__ring nums">
            {entry.done}/{entry.total}
          </span>
        </ProgressRing>
        <div class="lp-hero__text">
          <p class="eyebrow">
            {started ? 'Продолжим' : 'Начнём'} · уровень {n}
          </p>
          <h2 class="lp-hero__title">{next.title}</h2>
          <p class="small muted">
            {next.minutes} мин · {entry.level.title}
          </p>
        </div>
      </div>
      <Button variant="primary" size="lg" block icon={Play} href={`/learn/lesson/${next.id}`}>
        {started ? 'Продолжить' : 'Начать урок'}
      </Button>
      {started && (
        <p class="lp-hero__total xsmall faint nums">
          Пройдено {model.done} из {model.total} {plural(model.total, ['урока', 'уроков', 'уроков'])}
        </p>
      )}
    </Card>
  );
}

/**
 * Уровень на пути: заголовок-переключатель, прогресс, новые аккорды; раскрытый — мотивация, бой, цель смен,
 * цели уровня и уроки.
 * @param {{entry: LevelEntry, open: boolean, onToggle: () => void, known: Set<string>, nextId: string|null,
 *          lessonsDone: Record<string, string>, gained: number, notation: 'B'|'H', day: string}} props
 */
function LevelCard({ entry, open, onToggle, known, nextId, lessonsDone, gained, notation, day }) {
  const { level, done, total, state } = entry;
  const n = levelNumber(level);
  const bodyId = `lp-level-${level.id}`;
  const cover = levelCoverage(level.id);
  const strum = strumById(level.strum);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const label = (c) => chordLabel(c, { notation });
  const openChord = (c) => navigate(`/chords/${encodeURIComponent(c)}`);

  return (
    <li class={cx('lp-level', `lp-level--${state}`, open && 'is-open')}>
      <span class="lp-level__badge" aria-hidden="true">
        {state === 'done' ? <Check size={18} strokeWidth={3} /> : n}
      </span>
      <div class="lp-level__card">
        <h2 class="lp-level__h">
          <button type="button" class="lp-level__head" aria-expanded={open ? 'true' : 'false'} aria-controls={bodyId} onClick={onToggle}>
            <span class="lp-level__titles">
              <span class="lp-level__eyebrow">
                {state === 'ahead' && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
                Уровень {n} · {STATUS[state](entry)}
              </span>
              <span class="lp-level__title">{level.title}</span>
              <span class="lp-level__sub">{level.subtitle}</span>
            </span>
            <span class="lp-level__count nums">
              {done}/{total}
              <span class="sr-only"> {plural(total, ['урок', 'урока', 'уроков'])} пройдено</span>
            </span>
            <ChevronDown class="lp-level__chev" size={20} aria-hidden="true" />
          </button>
        </h2>
        <div class="lp-level__bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div class="lp-level__chords">
          {level.chords.map((c) => (
            <ChordChip key={c} name={c} known={known.has(c)} onClick={() => openChord(c)} />
          ))}
          {cover?.share != null && <span class="lp-level__share nums">~{cover.share} % песен</span>}
        </div>

        <div class="lp-level__body" id={bodyId} hidden={!open}>
          {state === 'ahead' && (
            <p class="lp-level__ahead small muted">
              <Lock size={14} aria-hidden="true" /> Это впереди, но уроки открыты — можно заглянуть.
            </p>
          )}
          {(cover || gained > 0) && (
            <div class="lp-cover">
              {cover && (
                <p class="lp-cover__line">
                  <Sparkles size={16} aria-hidden="true" />
                  <span>{cover.text}</span>
                </p>
              )}
              {gained > 0 && (
                <p class="lp-cover__line">
                  <Library size={16} aria-hidden="true" />
                  <span>
                    +{gained} {plural(gained, ['песня', 'песни', 'песен'])} из твоей библиотеки
                  </span>
                </p>
              )}
            </div>
          )}
          <ul class="lp-facts">
            {strum && (
              <li>
                <Hand size={16} aria-hidden="true" />
                <span>
                  Бой: {strum.name} · <span class="nums">{level.bpm[0]}–{level.bpm[1]}</span> BPM
                </span>
              </li>
            )}
            <li>
              <Repeat size={16} aria-hidden="true" />
              <span>
                Смены за минуту: цель <b class="nums">{level.omc}</b>
              </span>
            </li>
            {level.bonus?.length > 0 && (
              <li>
                <Plus size={16} aria-hidden="true" />
                <span>По желанию: {level.bonus.map(label).join(', ')}</span>
              </li>
            )}
          </ul>
          {level.goals.length > 0 && (
            <details class="lp-goals">
              <summary>
                <Target size={16} aria-hidden="true" />
                <span class="grow">
                  Цели уровня <span class="faint nums">· {level.goals.length}</span>
                </span>
                <ChevronDown class="lp-goals__chev" size={18} aria-hidden="true" />
              </summary>
              <ul>
                {level.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          )}
          <ol class="lp-lessons" aria-label={`Уроки уровня ${n}`}>
            {lessonsOfLevel(level.id).map((lesson, k) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                index={k}
                doneDay={lessonsDone?.[lesson.id]}
                isNext={lesson.id === nextId}
                notation={notation}
                day={day}
              />
            ))}
          </ol>
        </div>
      </div>
    </li>
  );
}

/**
 * Строка урока: отметка (✓ / ▶ / номер), название, минуты и что внутри; следующий урок — «Продолжить».
 * @param {{lesson: import('../core/curriculum.js').Lesson, index: number, doneDay?: string, isNext: boolean,
 *          notation: 'B'|'H', day: string}} props
 */
function LessonRow({ lesson, index, doneDay, isNext, notation, day }) {
  const isDone = Boolean(doneDay);
  const tags = lessonTags(lesson);
  const meta = [
    isDone ? `пройден ${formatDay(doneDay, { today: day })}` : `${lesson.minutes} мин`,
    ...tags.chords.map((c) => chordLabel(c, { notation })),
    ...tags.parts,
  ].join(' · ');
  return (
    <li>
      <Link href={`/learn/lesson/${lesson.id}`} class={cx('lp-lesson', isDone && 'is-done', isNext && 'is-next')}>
        <span class="lp-lesson__mark" aria-hidden="true">
          {isDone ? <Check size={16} strokeWidth={3} /> : isNext ? <Play size={14} strokeWidth={2.5} /> : index + 1}
        </span>
        <span class="lp-lesson__body">
          <span class="lp-lesson__title">{lesson.title}</span>
          <span class="lp-lesson__meta">{meta}</span>
        </span>
        {isNext ? (
          <span class="lp-lesson__go">Продолжить</span>
        ) : (
          <ChevronRight class="lp-lesson__chev" size={18} aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}
