import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Check, Gem, Library, Music, Play, RotateCcw, Sparkles, Trophy,
} from 'lucide-preact';
import {
  flush, getSong, knownChordNames, logPractice, progress, setChordKnown, setLastSong, settings, songs, updateSong,
} from '../state.js';
import { parseSong, songChords } from '../core/song.js';
import { omcTarget } from '../core/curriculum.js';
import { chordLabel, plural } from '../lib/format.js';
import { Button, Chip, ChordDiagram, EmptyState, Page, Sheet, toast } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { KeyBanner } from '../exercises/KeyBanner.jsx';
import { ChordLearn } from '../exercises/ChordLearn.jsx';
import { OmcDrill } from '../exercises/OmcDrill.jsx';
import { StrumDrill } from '../exercises/StrumDrill.jsx';
import { PlayAlong } from '../exercises/PlayAlong.jsx';
import { formatShift, keyNameAt, prepareSong } from '../exercises/sheet-model.js';
import {
  SPEED_STEPS, chordPlan, chordSummary, createPracticeClock, defaultSpeed, firstOpenStage, isStage, mainProgression,
  nextStage, normalizeTrainer, openPatch, pairDrilledPatch, playOutcome, shouldSuggestPolish, speedLabel, stageLabel,
  stageStates, strumSetup, topPairs,
} from './trainer-helpers.js';
import './trainer.css';

/** @typedef {import('../state.js').SongRecord} SongRecord */
/** @typedef {import('./trainer-helpers.js').StageId} StageId */

const CELEBRATE_MS = 1600;
const SPEED_HINT = {
  0.6: 'Медленно и спокойно. Главное — не останавливаться.',
  0.8: 'Чуть быстрее. Сбился — подхвати с ближайшего аккорда.',
  1: 'Полный темп, от начала до конца.',
};

/**
 * Тренировка песни (/song/:id/train): Аккорды → Смены → Ритм → Играем (60 % → 80 % → 100 %).
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 *   query.stage — открыть сразу этот этап (chords | changes | strum | play)
 */
export default function SongTrainer({ params, query }) {
  const record = songs.value.find((s) => s.id === params?.id);
  if (!record) return <NotFound />;
  return <Trainer key={record.id} record={record} initialStage={query?.stage} />;
}

function NotFound() {
  return (
    <Page title="Тренировка песни" back="/songs">
      <EmptyState
        icon={Music}
        title="Такой песни нет"
        text="Возможно, её удалили. Выбери другую — и потренируем."
        action={{ label: 'К песням', href: '/songs', icon: Library }}
      />
    </Page>
  );
}

// ---------- экран ----------

/** @param {{record: SongRecord, initialStage?: string}} props */
function Trainer({ record, initialStage }) {
  const id = record.id;
  const trainer = normalizeTrainer(record.trainer);
  const [stage, setStage] = useState(/** @type {StageId} */ (() => (isStage(initialStage) ? initialStage : firstOpenStage(record.trainer))));
  const [celebrate, setCelebrate] = useState(/** @type {StageId|null} */ (null));
  const [announce, setAnnounce] = useState('');
  const clock = usePracticeClock();

  // Открыли — это теперь «песня, которую тренируешь»; новая песня становится «учу»
  useEffect(() => {
    setLastSong(id);
    const patch = openPatch(getSong(id));
    if (patch) updateSong(id, patch);
  }, [id]);

  useEffect(() => {
    if (!celebrate) return undefined;
    const t = setTimeout(() => setCelebrate(null), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [celebrate]);

  const transpose = Number(record.prefs?.transpose) || 0;
  const simplify = Boolean(record.prefs?.simplify);
  const parsed = useMemo(() => safeParse(record), [record.text, record.title, record.artist]);
  const shown = useMemo(() => prepareSong(parsed, { transpose, simplify }), [parsed, transpose, simplify]);
  const chords = useMemo(() => songChords(shown), [shown]);
  const pairs = useMemo(() => topPairs(shown), [shown]);
  const progression = useMemo(() => mainProgression(shown), [shown]);
  const known = knownChordNames.value;

  const goTo = (sid) => {
    setStage(sid);
    scrollToTop();
  };

  /** Этап пройден: отметка в песне, маленький праздник на шаге; advance — сразу к следующему. */
  const completeStage = (sid, { advance = false } = {}) => {
    const cur = normalizeTrainer(getSong(id)?.trainer);
    if (!cur[sid]) {
      updateSong(id, { trainer: { [sid]: true } });
      setCelebrate(sid);
      setAnnounce(`Этап «${stageLabel(sid)}» пройден`);
    }
    if (advance) goTo(nextStage(sid) ?? sid);
  };

  const onPairDrilled = (key) => {
    const cur = getSong(id);
    if (!cur) return;
    const patch = pairDrilledPatch(cur.trainer, key, pairs.map((p) => p.key));
    const already = normalizeTrainer(cur.trainer);
    if (already.changes) delete patch.changes;
    if (!patch.changes && already.pairs.includes(key)) return; // повтор той же пары — писать нечего
    updateSong(id, { trainer: patch });
    if (patch.changes) {
      setCelebrate('changes');
      setAnnounce('Этап «Смены» пройден');
    }
  };

  if (!chords.length) {
    return (
      <Page title={record.title} subtitle={record.artist || undefined} back={songHref(id)}>
        <EmptyState
          icon={Music}
          title="В песне не нашлось аккордов"
          text="Тренировать пока нечего. Открой песню и проверь текст."
          action={{ label: 'Открыть песню', href: songHref(id) }}
        />
      </Page>
    );
  }

  return (
    <Page title={record.title} subtitle={record.artist || 'Тренировка'} back={songHref(id)} wide class="trainer">
      <StageNav trainer={trainer} stage={stage} celebrate={celebrate} onSelect={goTo} />
      <div key={stage} class={cx('trainer__stage', `trainer__stage--${stage}`)}>
        {stage === 'chords' && (
          <ChordsStage
            record={record}
            chords={chords}
            known={known}
            songKey={parsed.key}
            done={trainer.chords}
            onComplete={() => completeStage('chords', { advance: true })}
            onNext={() => goTo('changes')}
          />
        )}
        {stage === 'changes' && (
          <ChangesStage
            pairs={pairs}
            trainer={trainer}
            onDrilled={onPairDrilled}
            onSkip={() => completeStage('changes', { advance: true })}
            onNext={() => goTo('strum')}
          />
        )}
        {stage === 'strum' && (
          <StrumStage
            record={record}
            progression={progression}
            done={trainer.strum}
            onYes={() => completeStage('strum')}
            onFinish={() => completeStage('strum', { advance: true })}
            onNext={() => goTo('play')}
          />
        )}
        {stage === 'play' && (
          <PlayStage
            record={record}
            trainer={trainer}
            onFinished={() => {
              if (!trainer.play) {
                setCelebrate('play');
                setAnnounce('Песня в репертуаре');
              }
              clock.commit();
            }}
          />
        )}
      </div>
      <p class="sr-only" aria-live="polite">
        {announce}
      </p>
    </Page>
  );
}

// ---------- шаги ----------

/**
 * @param {{trainer: ReturnType<typeof normalizeTrainer>, stage: StageId, celebrate: StageId|null,
 *          onSelect: (id: StageId) => void}} props
 */
function StageNav({ trainer, stage, celebrate, onSelect }) {
  const states = stageStates(trainer);
  const done = states.filter((s) => s.done).length;
  return (
    <nav class="trainer-steps" aria-label={`Этапы тренировки: пройдено ${done} из ${states.length}`}>
      <ol class="trainer-steps__list">
        {states.map((s) => (
          <li
            key={s.id}
            class={cx(
              'trainer-steps__item',
              s.done && 'is-done',
              s.id === stage && 'is-current',
              celebrate === s.id && 'is-celebrating',
            )}
          >
            <button
              type="button"
              class="trainer-steps__btn"
              aria-current={s.id === stage ? 'step' : undefined}
              onClick={() => onSelect(s.id)}
            >
              <span class="trainer-steps__dot" aria-hidden="true">
                {s.done ? <Check size={16} strokeWidth={3} /> : s.index + 1}
              </span>
              <span class="trainer-steps__label">{s.label}</span>
              {s.done && <span class="sr-only">, пройден</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---------- этап «Аккорды» ----------

/**
 * @param {{record: SongRecord, chords: string[], known: string[], songKey?: string, done: boolean,
 *          onComplete: () => void, onNext: () => void}} props
 */
function ChordsStage({ record, chords, known, songKey, done, onComplete, onNext }) {
  const [open, setOpen] = useState(/** @type {string|null} */ (null));
  const [fresh, setFresh] = useState(/** @type {string|null} */ (null));
  const plan = useMemo(() => chordPlan(chords, known), [chords, known]);
  const sum = chordSummary(plan);
  const notation = settings.value?.notation ?? 'B';
  const label = (n) => chordLabel(n, { notation });
  const transpose = Number(record.prefs?.transpose) || 0;

  const openChord = (name) => {
    setOpen(name);
    setFresh(null);
    scrollToTop();
  };

  const learnDone = (name, ok) => {
    setOpen(null);
    if (ok) setFresh(name);
    scrollToTop();
  };

  const applyShift = (shift) => {
    updateSong(record.id, { prefs: { transpose: shift } });
    const key = keyNameAt(record.chords ?? [], shift, songKey);
    toast(shift ? `Теперь в ${label(key)} (${formatShift(shift)})` : 'Вернул исходную тональность');
  };

  const allKnown = () => {
    // Самооценка: «знаю все» — значит, незнакомые из этой песни считаем выученными.
    for (const c of plan) if (c.status === 'new') setChordKnown(c.name, true);
    onComplete();
  };

  const first = sum.toLearn[0];
  let actions;
  if (first) {
    actions = (
      <>
        <Button variant="ghost" size="lg" onClick={allKnown}>
          Все знаю
        </Button>
        <Button variant="primary" size="lg" icon={Sparkles} onClick={() => openChord(first)}>
          Учить {label(first)}
        </Button>
      </>
    );
  } else if (done) {
    actions = (
      <Button variant="primary" size="lg" block icon={ArrowRight} onClick={onNext}>
        Дальше: смены
      </Button>
    );
  } else {
    actions = (
      <Button variant="primary" size="lg" block icon={Check} onClick={allKnown}>
        Все аккорды знаю
      </Button>
    );
  }

  return (
    <div class={cx('trainer-chords', open && 'has-open')}>
      <div class="trainer-chords__list stack">
        <KeyBanner chords={record.chords ?? []} known={known} transpose={transpose} songKey={songKey} onApply={applyShift} />
        <header class="trainer-intro">
          <h2 class="trainer-intro__title">Аккорды песни</h2>
          <p class="muted small">
            {sum.allReady
              ? 'Все знакомы — можно к сменам.'
              : `Знаешь ${sum.ready} из ${sum.total}. Новые выучим прямо тут, по одному.`}
          </p>
        </header>
        {transpose !== 0 && (
          <div class="row">
            <Chip tone="outline" icon={RotateCcw} onClick={() => applyShift(0)} aria-label="Вернуть исходную тональность">
              Тональность <span class="nums">{formatShift(transpose)}</span> · вернуть
            </Chip>
          </div>
        )}
        <ul class="trainer-chordgrid" aria-label="Аккорды песни">
          {plan.map((c) => (
            <li key={c.name}>
              <ChordCard
                item={c}
                label={label}
                active={open === c.name}
                fresh={fresh === c.name}
                onClick={() => openChord(c.name)}
              />
            </li>
          ))}
        </ul>
        <div class="thumb-bar trainer-bar">{actions}</div>
      </div>
      {open && (
        <div class="trainer-chords__learn stack">
          <Button variant="ghost" size="sm" icon={ArrowLeft} class="trainer-back mobile-only" onClick={() => setOpen(null)}>
            Все аккорды
          </Button>
          <ChordLearn key={open} name={open} onDone={(ok) => learnDone(open, ok)} />
        </div>
      )}
    </div>
  );
}

const CHORD_TAG = {
  known: { text: 'знаешь', icon: Check },
  sub: { text: '', icon: Check },
  new: { text: 'новый', icon: Sparkles },
  noshape: { text: 'нет схемы', icon: null },
};

/**
 * @param {{item: ReturnType<typeof chordPlan>[number], label: (n: string) => string, active: boolean, fresh: boolean,
 *          onClick: () => void}} props
 */
function ChordCard({ item, label, active, fresh, onClick }) {
  const tag = CHORD_TAG[item.status];
  const text = item.status === 'sub' ? `как ${label(item.as)}` : tag.text;
  const Icon = tag.icon;
  const name = label(item.name);
  return (
    <button
      type="button"
      class={cx('trainer-chord', `trainer-chord--${item.status}`, active && 'is-active', fresh && 'is-fresh')}
      aria-label={`${name}: ${text}${item.status === 'new' ? ', выучить' : ''}`}
      aria-pressed={active ? 'true' : undefined}
      onClick={onClick}
    >
      <span class="trainer-chord__name">{name}</span>
      <ChordDiagram name={item.name} size="sm" showName={false} dim={item.status === 'noshape'} />
      <span class="trainer-chord__tag" aria-hidden="true">
        {Icon && <Icon size={14} strokeWidth={2.6} />}
        {text}
      </span>
    </button>
  );
}

// ---------- этап «Смены» ----------

/**
 * @param {{pairs: ReturnType<typeof topPairs>, trainer: ReturnType<typeof normalizeTrainer>,
 *          onDrilled: (key: string) => void, onSkip: () => void, onNext: () => void}} props
 */
function ChangesStage({ pairs, trainer, onDrilled, onSkip, onNext }) {
  const [open, setOpen] = useState(/** @type {string|null} */ (null));
  const notation = settings.value?.notation ?? 'B';
  const label = (n) => chordLabel(n, { notation });
  const p = progress.value;
  const drilled = new Set(trainer.pairs);
  const next = pairs.find((x) => !drilled.has(x.key));
  const current = pairs.find((x) => x.key === open) ?? null;

  // Результат сохранён (recordOmc) — пара засчитана, даже если «Готово» не нажали.
  useChanged(open ? p.pairs[open] : undefined, open, () => onDrilled(open));

  if (!pairs.length) {
    return (
      <div class="stack trainer-narrow">
        <EmptyState
          icon={ArrowLeftRight}
          title="Менять нечего"
          text="В песне один аккорд — смены не нужны."
          action={{ label: 'Дальше: ритм', icon: ArrowRight, onClick: onSkip }}
        />
      </div>
    );
  }

  const closeDrill = () => {
    setOpen(null);
    scrollToTop();
  };

  const openDrill = (key) => {
    setOpen(key);
    scrollToTop();
  };

  return (
    <div class={cx('trainer-changes', current && 'has-open')}>
      <div class="trainer-changes__list stack">
        <header class="trainer-intro">
          <h2 class="trainer-intro__title">Смены за минуту</h2>
          <p class="muted small">
            {next
              ? `Самые частые переходы песни. Минута на каждый — и руки запомнят.`
              : 'Все переходы прогнаны. Можно повторить любой или идти дальше.'}
          </p>
        </header>
        <ul class="trainer-pairs">
          {pairs.map((x) => {
            const rec = p.pairs[x.key];
            const isDone = drilled.has(x.key);
            const target = omcTarget(p, x.a, x.b);
            return (
              <li key={x.key}>
                <button
                  type="button"
                  class={cx('trainer-pair', isDone && 'is-done', open === x.key && 'is-active')}
                  aria-pressed={open === x.key ? 'true' : undefined}
                  onClick={() => openDrill(x.key)}
                >
                  <span class="trainer-pair__names">
                    {label(x.a)}
                    <ArrowLeftRight size={18} aria-hidden="true" />
                    {label(x.b)}
                  </span>
                  <span class="trainer-pair__meta small muted nums">
                    в песне {x.count} {plural(x.count, ['раз', 'раза', 'раз'])} · цель {target}
                    {rec?.best ? ` · рекорд ${rec.best}` : ''}
                  </span>
                  <span class={cx('trainer-pair__state', isDone && 'is-done')}>
                    {isDone ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                    <span>{isDone ? 'есть' : 'минута'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div class="thumb-bar trainer-bar">
          {next ? (
            <Button variant="primary" size="lg" block icon={Play} onClick={() => openDrill(next.key)}>
              Минута: {label(next.a)} ⇄ {label(next.b)}
            </Button>
          ) : (
            <Button variant="primary" size="lg" block icon={ArrowRight} onClick={onNext}>
              Дальше: ритм
            </Button>
          )}
        </div>
      </div>
      {current && (
        <div class="trainer-changes__drill stack">
          <Button variant="ghost" size="sm" icon={ArrowLeft} class="trainer-back mobile-only" onClick={closeDrill}>
            Все смены
          </Button>
          <OmcDrill
            key={current.key}
            a={current.a}
            b={current.b}
            target={omcTarget(p, current.a, current.b)}
            onDone={() => {
              onDrilled(current.key);
              closeDrill();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- этап «Ритм» ----------

/**
 * @param {{record: SongRecord, progression: string[], done: boolean, onYes: () => void, onFinish: () => void,
 *          onNext: () => void}} props
 */
function StrumStage({ record, progression, done, onYes, onFinish, onNext }) {
  // Бой и темп — один раз при входе: рекорд, записанный по ходу, не должен перезапускать упражнение.
  const [setup] = useState(() => strumSetup(record, progress.value));
  // «Да, ровно» записывает темп (recordStrum) — этап пройден сразу, «Готово» только ведёт дальше.
  useChanged(progress.value.strum[setup.patternId], true, onYes);
  return (
    <div class="trainer-strum stack">
      {done && (
        <div class="trainer-note" role="status">
          <span class="trainer-note__icon" aria-hidden="true">
            <Check size={18} strokeWidth={3} />
          </span>
          <p class="grow small">Ритм засчитан. Можно ещё раз или сразу играть.</p>
          <Button variant="ghost" size="sm" icon={ArrowRight} onClick={onNext}>
            Играем
          </Button>
        </div>
      )}
      <StrumDrill patternId={setup.patternId} bpm={setup.bpm} chords={progression} onDone={onFinish} />
    </div>
  );
}

// ---------- этап «Играем» ----------

/**
 * @param {{record: SongRecord, trainer: ReturnType<typeof normalizeTrainer>, onFinished: () => void}} props
 */
function PlayStage({ record, trainer, onFinished }) {
  const id = record.id;
  const [speed, setSpeed] = useState(() => defaultSpeed(record.trainer));
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(/** @type {(ReturnType<typeof playOutcome> & {speed: number})|null} */ (null));
  const [polishHidden, setPolishHidden] = useState(false);
  const showPolish = !polishHidden && shouldSuggestPolish(record);

  // «Сыграл» в PlayAlong уже вызвал markSongPlayed (plays +1, «новая» → «учу»).
  const onPlayed = () => {
    const fresh = getSong(id);
    if (!fresh) return;
    const out = playOutcome(fresh, speed);
    updateSong(id, out.patch);
    if (out.finished) onFinished();
    setResult({ ...out, speed });
  };

  const pickSpeed = (s) => {
    setSpeed(s);
    setRound((r) => r + 1);
  };

  const again = () => {
    setResult(null);
    setRound((r) => r + 1);
    scrollToTop();
  };

  const nextSpeed = () => {
    const s = result?.next;
    setResult(null);
    if (s) pickSpeed(s);
    scrollToTop();
  };

  const polish = () => {
    updateSong(id, { status: 'polished' });
    setPolishHidden(true);
    setResult((r) => (r ? { ...r, suggestPolish: false } : r));
    toast('Отполировано. Песня — в твоём репертуаре');
  };

  return (
    <div class="trainer-play">
      <aside class="trainer-play__aside stack" aria-label="Темп и итог">
        <div class="trainer-speed">
          <p class="eyebrow">Темп прокрутки</p>
          <div class="row gap-2 trainer-speed__chips" role="group" aria-label="Темп прокрутки">
            {SPEED_STEPS.map((s) => {
              const passed = trainer.speed >= s - 1e-9;
              return (
                <Chip
                  key={s}
                  tone={passed && s !== speed ? 'success' : 'default'}
                  active={s === speed}
                  icon={passed ? Check : undefined}
                  onClick={() => pickSpeed(s)}
                  aria-label={`${speedLabel(s)}${passed ? ', пройдено' : ''}`}
                >
                  <span class="nums">{speedLabel(s)}</span>
                </Chip>
              );
            })}
          </div>
          <p class="small muted">{SPEED_HINT[speed]}</p>
        </div>
        {trainer.play && <FinishCard record={record} compact />}
        {showPolish && <PolishCard plays={trainer.plays} onPolish={polish} onLater={() => setPolishHidden(true)} />}
      </aside>
      <div class="trainer-play__main">
        <PlayAlong key={`${speed}:${round}`} record={record} speedFactor={speed} embedded onDone={onPlayed} />
      </div>
      <Sheet open={Boolean(result)} onClose={() => setResult(null)} title={result?.finished ? 'Готово' : 'Записал'}>
        {result && (
          <ResultBody result={result} record={record} onNext={nextSpeed} onAgain={again} onPolish={polish} />
        )}
      </Sheet>
    </div>
  );
}

/**
 * @param {{result: ReturnType<typeof playOutcome> & {speed: number}, record: SongRecord, onNext: () => void,
 *          onAgain: () => void, onPolish: () => void}} props
 */
function ResultBody({ result, record, onNext, onAgain, onPolish }) {
  if (result.finished) {
    return (
      <div class="stack gap-4">
        <FinishCard record={record} plays={result.plays} />
        {result.suggestPolish && <PolishCard plays={result.plays} onPolish={onPolish} />}
        <Button variant="ghost" icon={RotateCcw} onClick={onAgain}>
          Сыграть ещё раз
        </Button>
      </div>
    );
  }
  return (
    <div class="stack gap-4 trainer-result">
      <div class="trainer-result__badge" aria-hidden="true">
        <Check size={32} strokeWidth={3} />
      </div>
      <div class="center stack gap-1">
        <p class="trainer-result__title">
          На <span class="nums">{speedLabel(result.speed)}</span> — есть
        </p>
        <p class="muted small">
          {result.next ? `Следующий шаг — ${speedLabel(result.next)}. Чуть быстрее, так же спокойно.` : 'Можно ещё раз.'}
        </p>
      </div>
      {result.suggestPolish && <PolishCard plays={result.plays} onPolish={onPolish} />}
      <div class="trainer-result__actions">
        <Button variant="secondary" size="lg" icon={RotateCcw} onClick={onAgain}>
          Ещё раз
        </Button>
        {result.next && (
          <Button variant="primary" size="lg" icon={ArrowRight} onClick={onNext}>
            На {speedLabel(result.next)}
          </Button>
        )}
      </div>
    </div>
  );
}

/** @param {{record: SongRecord, plays?: number, compact?: boolean}} props */
function FinishCard({ record, plays, compact = false }) {
  const n = plays ?? normalizeTrainer(record.trainer).plays;
  return (
    <div class={cx('trainer-finish', compact && 'trainer-finish--compact')}>
      <div class="trainer-finish__head">
        <span class="trainer-finish__icon" aria-hidden="true">
          <Trophy size={compact ? 20 : 28} />
        </span>
        <div class="grow">
          <p class="trainer-finish__title">Песня в репертуаре</p>
          {n > 0 && (
            <p class="small muted nums">
              Сыграна {n} {plural(n, ['раз', 'раза', 'раз'])}
            </p>
          )}
        </div>
      </div>
      <div class="trainer-finish__actions">
        <Button variant="primary" size={compact ? 'md' : 'lg'} icon={Play} href={songHref(record.id)}>
          Играть
        </Button>
        <Button variant="secondary" size={compact ? 'md' : 'lg'} icon={Library} href="/songs">
          Другая песня
        </Button>
      </div>
    </div>
  );
}

/** @param {{plays: number, onPolish: () => void, onLater?: () => void}} props */
function PolishCard({ plays, onPolish, onLater }) {
  return (
    <div class="trainer-polish" role="note">
      <span class="trainer-polish__icon" aria-hidden="true">
        <Gem size={20} />
      </span>
      <div class="grow stack gap-2">
        <p class="small">
          <b class="nums">
            {plays} {plural(plays, ['раз', 'раза', 'раз'])}
          </b>{' '}
          — песня держится в руках. Отметим как отполированную?
        </p>
        <div class="row row-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Gem} onClick={onPolish}>
            Отполирована
          </Button>
          {onLater && (
            <Button variant="ghost" size="sm" onClick={onLater}>
              Позже
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- хуки и мелочи ----------

/**
 * Активное время тренировки: идёт, пока вкладка видна. В занятия — один раз, если набралось ≥ 30 с
 * (при уходе с экрана, сворачивании или по commit() в конце); дальше время дописывается без нового занятия.
 * @returns {{commit: () => void}}
 */
function usePracticeClock() {
  const ref = useRef(/** @type {{clock: ReturnType<typeof createPracticeClock>, commit: () => void}|null} */ (null));
  if (!ref.current) {
    const clock = createPracticeClock();
    const commit = () => {
      const r = clock.take();
      if (!r) return;
      logPractice(r.seconds, { session: r.session });
      flush();
    };
    ref.current = { clock, commit };
  }
  useEffect(() => {
    const { clock, commit } = ref.current;
    const hasDoc = typeof document !== 'undefined';
    const iv = setInterval(() => {
      if (!hasDoc || document.visibilityState !== 'hidden') clock.add(1);
    }, 1000);
    const onVis = () => {
      if (document.visibilityState === 'hidden') commit();
    };
    if (hasDoc) document.addEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', commit);
    return () => {
      clearInterval(iv);
      if (hasDoc) document.removeEventListener('visibilitychange', onVis);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', commit);
      commit();
    };
  }, []);
  return { commit: () => ref.current?.commit() };
}

/**
 * Вызывает cb, когда value меняется (по ссылке), пока active. Смена active запоминает текущее value заново.
 * @param {any} value
 * @param {any} active
 * @param {() => void} cb
 */
function useChanged(value, active, cb) {
  const base = useRef(value);
  const prevActive = useRef(active);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (prevActive.current !== active) {
      prevActive.current = active;
      base.current = value;
      return;
    }
    if (active && value !== base.current) {
      base.current = value;
      cbRef.current();
    }
  }, [value, active]);
}

function songHref(id) {
  return `/song/${encodeURIComponent(id)}`;
}

function safeParse(record) {
  try {
    return parseSong(String(record?.text ?? ''), { title: record?.title, artist: record?.artist });
  } catch (err) {
    console.warn('[uke] не удалось разобрать песню', err);
    return { title: record?.title ?? '', artist: record?.artist ?? '', sections: [] };
  }
}

function scrollToTop() {
  if (typeof window === 'undefined') return;
  const reduce = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}
