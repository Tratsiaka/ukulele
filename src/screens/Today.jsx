import { useMemo } from 'preact/hooks';
import {
  ArrowLeftRight, BookOpen, Check, ChevronRight, Flame, Gauge, GraduationCap, Music, Play, Settings, Snowflake, Sparkles,
  Sprout, Trophy, Unlock, Waves,
} from 'lucide-preact';
import { Button, Card, Chip, IconButton, Page, ProgressRing, Segmented } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { Link } from '../app/router.js';
import { knownChordNames, progress, setSetting, settings, songs, today, todayStats } from '../state.js';
import { activeDays } from '../core/progress.js';
import { buildSession } from '../core/practice.js';
import { chordLabel, plural } from '../lib/format.js';
import {
  formatLongDate, freezeHint, isFirstDay, learnSummary, nowPlaying, pairLabel, recordsSummary, trainerStages, weekGoal,
  weekStrip,
} from './practice-helpers.js';
import './today.css';

const MINUTE_OPTIONS = [
  { value: 5, label: '5 мин' },
  { value: 10, label: '10 мин' },
  { value: 18, label: '18 мин' },
];
const DAYS = ['день', 'дня', 'дней'];
const SONGS = ['песню', 'песни', 'песен'];
const SONGS_NOM = ['песня', 'песни', 'песен'];
const DAY_STATE_TEXT = {
  done: 'занимался', frozen: 'заморозка', today: 'сегодня, ещё впереди', missed: 'пропуск', future: 'впереди',
  before: 'до первого занятия',
};
const STATUS_TEXT = { learning: 'учу', playing: 'играю' };
const BLOCK_ICON = { tuner: Gauge, warmup: Sparkles, new: Sprout, omc: ArrowLeftRight, strum: Waves, song: Music };

const songHref = (id, tail = '') => `/song/${encodeURIComponent(id)}${tail}`;

/**
 * Вкладка «Сегодня» (/today): серия и неделя, занятие дня 5/10/18 мин, «Учиться» и «Тренировать песню»,
 * «Играю сейчас», рекорды и «следующий аккорд → +N песен».
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Today() {
  const p = progress.value;
  const list = songs.value;
  const known = knownChordNames.value;
  const stats = todayStats.value;
  const day = today.value;
  const set = settings.value;
  const notation = set.notation;
  const label = (name) => chordLabel(name, { notation });

  const first = isFirstDay(p);
  const strip = useMemo(
    () => weekStrip({ today: day, activeDays: activeDays(p), frozen: stats.frozen, practice: p.practice }),
    [p, day, stats.frozen],
  );
  const goal = weekGoal(stats.weekSeconds, stats.weeklyGoalSec);
  const freeze = freezeHint({ today: day, frozen: stats.frozen, freezesLeft: stats.freezesLeft, streak: stats.streak });
  const minutes = [5, 10, 18].includes(set.sessionMinutes) ? set.sessionMinutes : 10;
  const plan = useMemo(() => buildSession(p, list, { minutes, today: day }), [p, list, minutes, day]);
  const learn = learnSummary(p);
  const lastSong = p.lastSongId ? list.find((s) => s.id === p.lastSongId) : undefined;
  const playing = nowPlaying(list, 5);
  const records = useMemo(() => recordsSummary(p, list, known), [p, list, known]);

  return (
    <Page
      title="Сегодня"
      subtitle={formatLongDate(day)}
      wide
      actions={<IconButton icon={Settings} label="Настройки" href="/settings" />}
    >
      <div class="today">
        <div class="today-col today-col--main">
          <StreakCard stats={stats} strip={strip} goal={goal} freeze={freeze} first={first} />
          <SessionCard
            first={first}
            knownCount={known.length}
            learn={learn}
            minutes={minutes}
            plan={plan}
            doneToday={stats.doneToday}
            label={label}
          />
        </div>
        <div class="today-col">
          <div class="today-entries">
            <LearnCard learn={learn} />
            <SongCard rec={lastSong} />
          </div>
          <NowPlaying list={playing} first={first} />
          <Records records={records} label={label} />
        </div>
      </div>
    </Page>
  );
}

// ---------- серия и неделя ----------

function StreakCard({ stats, strip, goal, freeze, first }) {
  const n = stats.streak;
  const isRecord = stats.doneToday && n >= 3 && n >= stats.best;
  let sub;
  if (stats.doneToday) sub = 'Сегодня засчитано. До завтра.';
  else if (n > 0) sub = 'Сегодня ещё не занимался. Хватит и 5 минут.';
  else if (first) sub = 'Первый день — самое время начать.';
  else sub = 'Начни новую серию. Хватит и 5 минут.';
  const best = !isRecord && stats.best > n && stats.best >= 2 ? `Рекорд — ${stats.best} ${plural(stats.best, DAYS)}` : '';

  return (
    <section class="card today-streak" aria-labelledby="today-streak-title">
      <div class="today-streak__top">
        <span class={cx('today-flame', stats.doneToday && 'is-lit', n === 0 && 'is-out')} aria-hidden="true">
          <Flame size={30} />
        </span>
        <div class="today-streak__text">
          <h2 id="today-streak-title" class="today-streak__count nums">
            {n > 0 ? `${n} ${plural(n, DAYS)} подряд` : 'Серия начнётся сегодня'}
          </h2>
          <p class="small muted">{sub}</p>
          {(isRecord || best) && (
            <p class={cx('today-streak__best xsmall', isRecord && 'is-record')}>
              {isRecord ? (
                <>
                  <Trophy size={14} aria-hidden="true" /> Это твой рекорд серии
                </>
              ) : (
                best
              )}
            </p>
          )}
        </div>
        <div class="today-goal">
          <ProgressRing
            value={goal.ratio}
            size={64}
            tone="teal"
            label={`За неделю ${goal.minutes} из ${goal.goalMinutes} минут`}
          >
            <span class="today-goal__num nums">{goal.reached ? <Check size={22} aria-hidden="true" /> : goal.minutes}</span>
          </ProgressRing>
          <span class={cx('today-goal__cap', goal.reached && 'is-done')} aria-hidden="true">
            {goal.reached ? 'цель недели' : `из ${goal.goalMinutes} мин`}
          </span>
        </div>
      </div>

      <ol class="today-week" aria-label="Эта неделя">
        {strip.map((d) => (
          <li
            key={d.day}
            class={cx('today-week__day', `is-${d.state}`, d.isToday && 'is-now')}
            aria-current={d.isToday ? 'date' : undefined}
          >
            <span class="sr-only">
              {d.label}: {DAY_STATE_TEXT[d.state]}
            </span>
            <span class="today-week__dot" aria-hidden="true">
              {d.state === 'done' && <Check size={16} strokeWidth={3} />}
              {d.state === 'frozen' && <Snowflake size={15} />}
            </span>
            <span class="today-week__label" aria-hidden="true">
              {d.label}
            </span>
          </li>
        ))}
      </ol>

      {freeze && (
        <p class={cx('today-freeze xsmall', `is-${freeze.kind}`)}>
          <Snowflake size={14} aria-hidden="true" />
          <span>{freeze.text}</span>
        </p>
      )}
    </section>
  );
}

// ---------- занятие дня ----------

function blockChip(b, label) {
  switch (b.type) {
    case 'tuner':
      return 'Тюнер';
    case 'warmup':
      return 'Разминка';
    case 'new':
      return b.payload?.chord ? `Новое: ${label(b.payload.chord)}` : 'Новый урок';
    case 'omc':
      return `Смены ×${b.payload?.pairs?.length ?? 1}`;
    case 'strum':
      return 'Бой';
    case 'song':
      return b.title.replace(/^Песня:\s*/, '') || 'Песня';
    default:
      return b.title;
  }
}

function SessionCard({ first, knownCount, learn, minutes, plan, doneToday, label }) {
  // Первый день новичка: тёплое приветствие и первый урок.
  if (first && knownCount < 2 && learn.lesson) {
    return (
      <section class="card card--accent today-session today-session--welcome" aria-labelledby="today-session-title">
        <span class="today-session__wave" aria-hidden="true">
          <Sprout size={26} />
        </span>
        <p class="eyebrow">Первый день</p>
        <h2 id="today-session-title" class="today-session__title">Привет. Начнём с первого урока</h2>
        <p class="muted">
          «{learn.lesson.title}» — {learn.lesson.minutes} мин. Посадка, строй и первые два аккорда, а дальше — каждый день
          понемногу.
        </p>
        <div class="today-session__cta stack gap-2">
          <Button variant="primary" size="lg" block icon={Play} href={`/learn/lesson/${learn.lesson.id}`}>
            Начать первый урок
          </Button>
          <Button variant="ghost" size="sm" href="/practice?min=5">
            Или сразу занятие на 5 минут
          </Button>
        </div>
      </section>
    );
  }

  const blocks = plan?.blocks ?? [];
  return (
    <section
      class={cx('card today-session', doneToday ? 'card--success today-session--done' : 'card--accent')}
      aria-labelledby="today-session-title"
    >
      <p class="eyebrow">{first ? 'Первое занятие' : 'Занятие дня'}</p>
      {doneToday ? (
        <>
          <h2 id="today-session-title" class="today-session__title today-session__title--done">
            <span class="today-session__check" aria-hidden="true">
              <Check size={20} strokeWidth={3} />
            </span>
            Сегодня уже занимался
          </h2>
          <p class="small muted">Хочешь ещё — вот план на ещё одно.</p>
        </>
      ) : (
        <h2 id="today-session-title" class="today-session__title">
          {minutes} минут — и день засчитан
        </h2>
      )}

      <ul class="today-plan" aria-label="Что будет в занятии">
        {blocks.map((b, i) => {
          const Icon = BLOCK_ICON[b.type] ?? Sparkles;
          return (
            <li key={i} class={cx('today-plan__item', b.type === 'song' && 'is-song')}>
              <Icon size={14} aria-hidden="true" />
              <span class="truncate">{blockChip(b, label)}</span>
            </li>
          );
        })}
      </ul>

      <Segmented
        value={minutes}
        options={MINUTE_OPTIONS}
        onChange={(v) => setSetting('sessionMinutes', v)}
        label="Длительность занятия"
        class="today-session__seg"
      />
      <Button
        variant={doneToday ? 'secondary' : 'primary'}
        size="lg"
        block
        icon={Play}
        href={`/practice?min=${minutes}`}
        class="today-session__start"
      >
        {doneToday ? 'Ещё одно' : 'Начать'}
      </Button>
    </section>
  );
}

// ---------- два входа ----------

function LearnCard({ learn }) {
  const href = learn.lesson ? `/learn/lesson/${learn.lesson.id}` : '/learn';
  const pct = Math.round(learn.ratio * 100);
  return (
    <Card href={href} class="today-entry">
      <span class="today-entry__icon" aria-hidden="true">
        <GraduationCap size={22} />
      </span>
      <p class="eyebrow">Учиться</p>
      <h3 class="today-entry__title clamp-2">{learn.finished ? 'Путь пройден' : learn.levelTitle}</h3>
      {!learn.finished && (
        <>
          <div
            class="today-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`Уровень ${learn.levelNumber}: ${learn.done} из ${learn.total} уроков`}
          >
            <span class="today-bar__fill" style={{ width: `${pct}%` }} />
          </div>
          <p class="xsmall faint nums">
            Уровень {learn.levelNumber} · {learn.done} из {learn.total}
          </p>
        </>
      )}
      <p class="today-entry__next small clamp-2">
        {learn.lesson ? (
          <>
            Дальше: <b>{learn.lesson.title}</b>
          </>
        ) : (
          'Повторяй любые уроки и добавляй песни'
        )}
      </p>
    </Card>
  );
}

function SongCard({ rec }) {
  if (!rec) {
    return (
      <Card href="/songs" class="today-entry today-entry--empty">
        <span class="today-entry__icon today-entry__icon--teal" aria-hidden="true">
          <Music size={22} />
        </span>
        <p class="eyebrow">Тренировать песню</p>
        <h3 class="today-entry__title">Выбери песню</h3>
        <p class="today-entry__next small">Любую — разберём по шагам: аккорды, смены, ритм.</p>
      </Card>
    );
  }
  const t = trainerStages(rec);
  return (
    <Card href={songHref(rec.id, '/train')} class="today-entry">
      <span class="today-entry__icon today-entry__icon--teal" aria-hidden="true">
        <Music size={22} />
      </span>
      <p class="eyebrow">Тренировать песню</p>
      <h3 class="today-entry__title clamp-2">{rec.title}</h3>
      {rec.artist && <p class="xsmall faint truncate">{rec.artist}</p>}
      <ol class="today-stages" aria-label={`Этапы: ${t.done} из 4`}>
        {t.stages.map((s) => (
          <li key={s.key} class={cx('today-stages__dot', s.done && 'is-done')} title={s.label}>
            <span class="sr-only">
              {s.label}: {s.done ? 'пройдено' : 'впереди'}
            </span>
          </li>
        ))}
      </ol>
      <p class="today-entry__next small">
        {t.next ? (
          <>
            Дальше: <b>{t.next}</b>
          </>
        ) : (
          'Все этапы пройдены ✓'
        )}
      </p>
    </Card>
  );
}

// ---------- играю сейчас ----------

function NowPlaying({ list, first }) {
  if (!list.length) {
    if (first) return null;
    return (
      <section class="stack gap-2" aria-labelledby="today-playing-title">
        <h2 id="today-playing-title" class="section-title">
          Играю сейчас
        </h2>
        <div class="today-hint">
          <BookOpen size={20} aria-hidden="true" />
          <p class="small muted grow">Отметь песню «учу» — она будет здесь под рукой.</p>
          <Button variant="ghost" size="sm" href="/songs">
            К песням
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section class="stack gap-2" aria-labelledby="today-playing-title">
      <div class="row row-between">
        <h2 id="today-playing-title" class="section-title">
          Играю сейчас
        </h2>
        <Button variant="ghost" size="sm" href="/songs?f=playing">
          Все
        </Button>
      </div>
      <ul class="today-list">
        {list.map((s) => (
          <li key={s.id}>
            <Link href={songHref(s.id)} class="today-list__row">
              <span class={cx('today-list__art', s.status === 'playing' && 'is-playing')} aria-hidden="true">
                <Music size={18} />
              </span>
              <span class="today-list__text">
                <span class="today-list__title truncate">{s.title}</span>
                {s.artist && <span class="xsmall faint truncate">{s.artist}</span>}
              </span>
              <Chip tone={s.status === 'playing' ? 'success' : 'teal'} class="today-list__status">
                {STATUS_TEXT[s.status]}
              </Chip>
              <ChevronRight size={18} class="today-list__chev" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- рекорды ----------

function Records({ records, label }) {
  const { omcTop, strumBest, playable, nextChord } = records;
  return (
    <section class="stack gap-2" aria-labelledby="today-records-title">
      <h2 id="today-records-title" class="section-title">
        Рекорды
      </h2>
      <div class="today-records">
        <Link href="/songs?f=playable" class="today-tile today-tile--songs">
          <span class="today-tile__label">{playable > 0 ? 'Можешь сыграть' : 'Песни'}</span>
          {playable > 0 ? (
            <span class="today-tile__value nums">
              {playable}
              <small> {plural(playable, SONGS)}</small>
            </span>
          ) : (
            <span class="today-tile__soon">откроются с первыми аккордами</span>
          )}
        </Link>
        {strumBest && (
          <div class="today-tile">
            <span class="today-tile__label">Лучший темп боя</span>
            <span class="today-tile__value nums">
              {strumBest.bpm}
              <small> BPM</small>
            </span>
            <span class="xsmall faint truncate">{strumBest.name}</span>
          </div>
        )}
        {omcTop.length > 0 && (
          <div class="today-tile today-tile--omc">
            <span class="today-tile__label">Смены за минуту</span>
            <ol class="today-omc">
              {omcTop.map((r, i) => (
                <li key={`${r.a}|${r.b}`} class="today-omc__row">
                  {i === 0 && <Trophy size={14} class="today-omc__cup" aria-label="Лучшая пара" />}
                  <span class="today-omc__pair">{pairLabel(r.a, r.b, label)}</span>
                  <b class="nums">{r.best}</b>
                </li>
              ))}
            </ol>
          </div>
        )}
        {records.empty && (
          <div class="today-tile today-tile--hint">
            <span class="today-tile__label">Смены и темп боя появятся здесь после первого занятия.</span>
          </div>
        )}
      </div>
      {nextChord && (
        <Card
          href={`/chords/${encodeURIComponent(nextChord.chord)}`}
          class="today-nudge"
          label={`Выучи ${label(nextChord.chord)}: ещё ${nextChord.gain} ${plural(nextChord.gain, SONGS_NOM)}`}
        >
          <span class="today-nudge__icon" aria-hidden="true">
            <Unlock size={20} />
          </span>
          <span class="today-nudge__text">
            Выучи <b class="chord-name">{label(nextChord.chord)}</b> → ещё {nextChord.gain} {plural(nextChord.gain, SONGS_NOM)}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Card>
      )}
    </section>
  );
}
