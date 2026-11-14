import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, CalendarPlus, Check, Download, GraduationCap, Guitar, Music, Plus, Sprout } from 'lucide-preact';
import { Button, Card, ChordDiagram, toast } from '../ui/index.js';
import { cx, renderIcon } from '../ui/icon.js';
import { navigate } from '../app/router.js';
import { Logo } from '../app/Logo.jsx';
import { knownChordNames, markOnboarded, progress, setChordKnown, setSetting, settings } from '../state.js';
import { levelById } from '../core/curriculum.js';
import { dailyReminderIcs, downloadIcs } from '../lib/ics.js';
import { chordLabel, plural } from '../lib/format.js';
import { TunerPanel } from '../exercises/TunerPanel.jsx';
import { BEGINNER_CHORDS, SESSION_OPTIONS, continueLesson, levelNumber, parseTime, practiceUrl } from './learn-helpers.js';
import './learn.css';

const STEPS = 4;
const DEFAULT_REMINDER = '19:00';
/** Время напоминания хранится в настройках под этим ключом ('HH:MM'). */
const REMINDER_KEY = 'reminderTime';

/**
 * Первый запуск (/onboarding): привет и опыт → строй → время в день и напоминание → с чего начать.
 * markOnboarded() вызывается перед любым уходом с экрана (App иначе вернёт сюда).
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(/** @type {'new'|'some'|null} */ (null));

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'Привет · Уке';
  }, []);

  const go = (to) => {
    setStep(Math.min(STEPS - 1, Math.max(0, to)));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
  const leave = (path) => {
    markOnboarded();
    navigate(path, { replace: true });
  };

  const back = step > 0 && (
    <Button variant="ghost" size="lg" icon={ArrowLeft} onClick={() => go(step - 1)}>
      Назад
    </Button>
  );

  let body;
  let bar;
  if (step === 0) {
    body = <HelloStep mode={mode} setMode={setMode} />;
    bar = (
      <Button variant="primary" size="lg" block disabled={!mode} onClick={() => go(1)}>
        {mode ? 'Дальше' : 'Выбери вариант'}
      </Button>
    );
  } else if (step === 1) {
    body = <TuneStep onDone={() => go(2)} />;
    bar = (
      <>
        {back}
        <span class="spacer" />
        <Button variant="ghost" size="lg" onClick={() => go(2)}>
          Пропустить
        </Button>
      </>
    );
  } else if (step === 2) {
    body = <TimeStep />;
    bar = (
      <>
        {back}
        <Button variant="primary" size="lg" class="onb-bar__main" onClick={() => go(3)}>
          Дальше
        </Button>
      </>
    );
  } else {
    body = <StartStep mode={mode} onLeave={leave} />;
    bar = back;
  }

  return (
    <div class="page onb">
      <header class="onb-top">
        <div
          class="onb-steps"
          role="progressbar"
          aria-label="Знакомство"
          aria-valuemin={1}
          aria-valuemax={STEPS}
          aria-valuenow={step + 1}
          aria-valuetext={`Шаг ${step + 1} из ${STEPS}`}
        >
          {Array.from({ length: STEPS }, (_, k) => (
            <span key={k} class={cx('onb-steps__seg', k < step && 'is-done', k === step && 'is-current')} />
          ))}
        </div>
        <span class="onb-top__count nums" aria-hidden="true">
          {step + 1}/{STEPS}
        </span>
        <Button variant="ghost" size="sm" onClick={() => leave('/today')}>
          Пропустить всё
        </Button>
      </header>

      <div class="onb-body" key={step}>
        {body}
      </div>

      {bar && <div class="thumb-bar onb-bar">{bar}</div>}
    </div>
  );
}

/**
 * Вариант-карточка с ролью radio.
 * @param {{checked: boolean, icon: any, title: string, text: string, onClick: () => void}} props
 */
function Choice({ checked, icon, title, text, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={checked ? 'true' : 'false'} class="onb-choice" onClick={onClick}>
      <span class="onb-choice__icon" aria-hidden="true">
        {renderIcon(icon, 24)}
      </span>
      <span class="onb-choice__text">
        <span class="onb-choice__title">{title}</span>
        <span class="onb-choice__hint">{text}</span>
      </span>
      <span class="onb-choice__mark" aria-hidden="true">
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * Шаг 1: привет и опыт; «уже немного играю» — сетка аккордов, чтобы отметить знакомые.
 * @param {{mode: 'new'|'some'|null, setMode: (m: 'new'|'some') => void}} props
 */
function HelloStep({ mode, setMode }) {
  return (
    <>
      <div class="onb-hello">
        <Logo class="onb-hello__logo" size={72} />
        <h1 class="onb-title">Привет! Уке поможет научиться играть и не бросить</h1>
        <p class="onb-lead">Короткие занятия каждый день и настоящие песни с первой недели. Сначала пара вопросов.</p>
      </div>
      <div class="onb-choices" role="radiogroup" aria-label="Как у тебя с укулеле?">
        <Choice
          checked={mode === 'new'}
          icon={Sprout}
          title="Учусь с нуля"
          text="Начнём с посадки и первого аккорда"
          onClick={() => setMode('new')}
        />
        <Choice
          checked={mode === 'some'}
          icon={Guitar}
          title="Уже немного играю"
          text="Отметишь аккорды, которые знаешь"
          onClick={() => setMode('some')}
        />
      </div>
      {mode === 'some' && <ChordPicker />}
    </>
  );
}

/** Сетка аккордов L0–L3: тап — знаю / не знаю (setChordKnown сразу). */
function ChordPicker() {
  const knownList = knownChordNames.value;
  const known = new Set(knownList);
  const notation = settings.value?.notation ?? 'B';
  const count = BEGINNER_CHORDS.filter((c) => known.has(c)).length;
  const start = continueLesson(progress.value, knownList);
  const level = start ? levelById(start.levelId) : null;

  let summary = 'Пока ничего не отмечено — начнём с самого начала.';
  if (count > 0 && level) {
    summary = `${count} ${plural(count, ['аккорд', 'аккорда', 'аккордов'])} — начнём с уровня ${levelNumber(level)}, «${level.title}».`;
  }

  return (
    <section class="onb-chords" aria-labelledby="onb-chords-title">
      <div>
        <h2 id="onb-chords-title" class="onb-subtitle">
          Какие аккорды уже знаешь?
        </h2>
        <p class="small muted">Отметь те, что ставишь без подсказки.</p>
      </div>
      <div class="onb-chord-grid">
        {BEGINNER_CHORDS.map((c) => {
          const on = known.has(c);
          const label = chordLabel(c, { notation });
          return (
            <button
              key={c}
              type="button"
              class={cx('onb-chord', on && 'is-on')}
              aria-pressed={on ? 'true' : 'false'}
              aria-label={`${label}, знаю`}
              onClick={() => setChordKnown(c, !on)}
            >
              <span class="onb-chord__name">{label}</span>
              <ChordDiagram name={c} size="sm" showName={false} />
              <span class="onb-chord__mark" aria-hidden="true">
                {on ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={2.5} />}
              </span>
            </button>
          );
        })}
      </div>
      <p class="onb-chords__sum small" aria-live="polite">
        {summary}
      </p>
    </section>
  );
}

/**
 * Шаг 2: строй.
 * @param {{onDone: () => void}} props
 */
function TuneStep({ onDone }) {
  return (
    <>
      <header class="onb-head">
        <h1 class="onb-title">Настроим укулеле</h1>
        <p class="onb-lead">Расстроенная укулеле звучит плохо, даже когда всё делаешь верно. Минута — и готово.</p>
      </header>
      <TunerPanel compact onDone={onDone} />
    </>
  );
}

/** Шаг 3: сколько минут в день (setSetting sessionMinutes) и напоминание в календарь. */
function TimeStep() {
  const minutes = settings.value?.sessionMinutes ?? 10;
  return (
    <>
      <header class="onb-head">
        <h1 class="onb-title">Сколько времени в день?</h1>
        <p class="onb-lead">Лучше пять минут каждый день, чем час по выходным. Поменять можно в настройках.</p>
      </header>
      <div class="onb-times" role="radiogroup" aria-label="Время занятия в день">
        {SESSION_OPTIONS.map((o) => {
          const on = o.minutes === minutes;
          return (
            <button
              key={o.minutes}
              type="button"
              role="radio"
              aria-checked={on ? 'true' : 'false'}
              class="onb-time"
              onClick={() => setSetting('sessionMinutes', o.minutes)}
            >
              <span class="onb-time__value">
                <span class="onb-time__num nums">{o.minutes}</span>
                <span class="onb-time__unit">мин</span>
              </span>
              <span class="onb-time__text">
                {o.text}
                {o.recommended && <span class="onb-time__badge">советуем</span>}
              </span>
              <span class="onb-choice__mark" aria-hidden="true">
                {on && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <Reminder minutes={minutes} />
    </>
  );
}

/**
 * Напоминание: выбор времени → файл .ics с ежедневным событием и ссылкой на занятие дня.
 * @param {{minutes: number}} props
 */
function Reminder({ minutes }) {
  const saved = settings.value?.[REMINDER_KEY];
  const valid = typeof saved === 'string' && parseTime(saved) ? saved : null;
  const [open, setOpen] = useState(Boolean(valid));
  const [time, setTime] = useState(valid ?? DEFAULT_REMINDER);
  const [added, setAdded] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" icon={CalendarPlus} class="onb-reminder__open" onClick={() => setOpen(true)}>
        Добавить напоминание в календарь
      </Button>
    );
  }

  const add = () => {
    const t = parseTime(time);
    if (!t) {
      toast('Выбери время напоминания');
      return;
    }
    setSetting(REMINDER_KEY, time);
    try {
      const href = typeof location !== 'undefined' ? location.href : '';
      downloadIcs(
        dailyReminderIcs({ hour: t.hour, minute: t.minute, title: `Укулеле: ${minutes} мин`, url: practiceUrl(href) }),
        'uke-reminder.ics',
      );
      setAdded(true);
    } catch (err) {
      console.warn('[uke] напоминание не скачалось', err);
      toast('Не получилось сохранить файл. Попробуй ещё раз.');
    }
  };

  return (
    <div class="onb-reminder">
      <label class="onb-reminder__label" for="onb-reminder-time">
        <CalendarPlus size={18} aria-hidden="true" />
        Напоминать каждый день в
      </label>
      <div class="onb-reminder__row">
        <input
          id="onb-reminder-time"
          type="time"
          class="onb-reminder__time nums"
          value={time}
          onInput={(e) => {
            setTime(e.currentTarget.value);
            setAdded(false);
          }}
        />
        <Button variant="secondary" icon={added ? Check : Download} onClick={add}>
          {added ? 'Готово' : 'В календарь'}
        </Button>
      </div>
      <p class="xsmall muted" aria-live="polite">
        {added
          ? 'Открой скачанный файл — событие встанет в календарь.'
          : 'Скачается файл .ics: календарь телефона добавит ежедневное событие со ссылкой на занятие.'}
      </p>
    </div>
  );
}

/**
 * Шаг 4: «Первый урок» или «Выбрать песню».
 * @param {{mode: 'new'|'some'|null, onLeave: (path: string) => void}} props
 */
function StartStep({ mode, onLeave }) {
  const first = continueLesson(progress.value, mode === 'some' ? knownChordNames.value : []);
  const level = first ? levelById(first.levelId) : null;
  const done = () => markOnboarded();
  return (
    <>
      <header class="onb-head">
        <h1 class="onb-title">С чего начнём?</h1>
        <p class="onb-lead">Оба пути равны, их можно чередовать. Занятие дня соберётся на главной само.</p>
      </header>
      <div class="onb-starts">
        {first && (
          <Card href={`/learn/lesson/${first.id}`} replace tone="accent" class="onb-start" onClick={done}>
            <span class="onb-start__icon" aria-hidden="true">
              <GraduationCap size={26} />
            </span>
            <span class="onb-start__title">Первый урок</span>
            <span class="onb-start__text">
              {first.title} · {first.minutes} мин
            </span>
            {level && (
              <span class="onb-start__hint">
                Уровень {levelNumber(level)} · {level.title}
              </span>
            )}
          </Card>
        )}
        <Card href="/songs" replace class="onb-start onb-start--song" onClick={done}>
          <span class="onb-start__icon" aria-hidden="true">
            <Music size={26} />
          </span>
          <span class="onb-start__title">Выбрать песню</span>
          <span class="onb-start__text">Любую — разложим на шаги: аккорды, смены, бой и игра.</span>
          <span class="onb-start__hint">Тренировать песню</span>
        </Card>
      </div>
      <Button variant="ghost" class="onb-later" onClick={() => onLeave('/today')}>
        Сначала осмотрюсь
      </Button>
    </>
  );
}
