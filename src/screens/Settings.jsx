import { useRef, useState } from 'preact/hooks';
import {
  CalendarPlus, Download, ExternalLink, HardDrive, Moon, RotateCcw, ShieldCheck, Sun, SunMoon, Trash2, TriangleAlert, Upload,
} from 'lucide-preact';
import { Button, ChordDiagram, Page, Segmented, Sheet, Stepper, Toggle, toast } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { exportData, flush, importData, setSetting, settings, storage } from '../state.js';
import { chordLabel, plural } from '../lib/format.js';
import { dailyReminderIcs, downloadIcs } from '../lib/ics.js';
import {
  DEFAULT_REMINDER, appUrl, backupFileName, importMessage, lastBackupText, parseTime, storageInfo, versionFromSrc,
  weeklyHint,
} from './tools-helpers.js';
import './tools.css';

const LAST_BACKUP_KEY = 'uke:last-backup';
const DB_NAME = 'uke';

const THEMES = [
  { value: 'auto', label: <SegLabel icon={SunMoon} text="Авто" /> },
  { value: 'light', label: <SegLabel icon={Sun} text="Светлая" /> },
  { value: 'dark', label: <SegLabel icon={Moon} text="Тёмная" /> },
];
const TUNINGS = [
  { value: 'gcea', label: 'High-G' },
  { value: 'lowg', label: 'Low-G' },
];
const NOTATIONS = [
  { value: 'B', label: 'B♭ и B' },
  { value: 'H', label: 'B и H' },
];
const SESSIONS = [5, 10, 18].map((m) => ({ value: m, label: `${m} мин` }));

const SOURCES = [
  { name: 'akkords.pro', what: 'аккорды песен', url: 'https://akkords.pro' },
  { name: 'dieza.net', what: 'аккорды песен', url: 'https://dieza.net' },
  { name: 'LRCLIB', what: 'тексты песен', url: 'https://lrclib.net' },
  { name: 'iTunes', what: 'превью и обложки', url: 'https://www.apple.com/itunes/' },
];
const LICENSES = [
  { name: 'chords-db', license: 'MIT', what: 'аппликатуры' },
  { name: 'Preact и @preact/signals', license: 'MIT', what: 'интерфейс' },
  { name: 'idb', license: 'ISC', what: 'хранилище' },
  { name: 'pitchy', license: 'MIT', what: 'тюнер' },
  { name: 'Lucide', license: 'ISC', what: 'значки' },
];

function SegLabel({ icon: Icon, text }) {
  return (
    <span class="stg-seg-label">
      <Icon size={16} aria-hidden="true" />
      {text}
    </span>
  );
}

function readLastBackup() {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Версия сборки из адреса скрипта приложения (assets/app.js?v=…). */
function appVersion() {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('script[src*="assets/app.js"]') ?? document.querySelector('script[type="module"][src]');
  return versionFromSrc(el?.getAttribute('src'));
}

/** Скачать текстовый файл (резервная копия). */
function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

const hasCyrillic = (s) => /[а-яё]/i.test(String(s ?? ''));

/**
 * Настройки (/settings, полноэкранный): вид, игра, занятия, напоминание в календарь, резервная копия и загрузка,
 * состояние хранилища, о приложении, сброс прогресса с двойным подтверждением.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Settings() {
  const s = settings.value;
  const st = storage.value;
  const info = storageInfo(st);
  const reminder = typeof s.reminderTime === 'string' && parseTime(s.reminderTime) ? s.reminderTime : DEFAULT_REMINDER;
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [imp, setImp] = useState(/** @type {{busy?: boolean, ok?: string, error?: string}} */ ({}));
  const [reset, setReset] = useState(/** @type {0|1|2} */ (0));
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [version] = useState(appVersion);
  const canPersist = typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function';

  const set = (key) => (value) => setSetting(key, value);

  const exportBackup = () => {
    try {
      downloadText(exportData(), backupFileName(), 'application/json');
      const now = Date.now();
      try {
        localStorage.setItem(LAST_BACKUP_KEY, String(now));
      } catch {
        // без localStorage просто не запомним дату
      }
      setLastBackup(now);
      toast('Копия сохранена в «Загрузки»');
    } catch (err) {
      console.warn('[uke] экспорт не удался', err);
      toast('Не получилось сохранить копию. Попробуй ещё раз.');
    }
  };

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setImp({ busy: true });
    try {
      const text = await file.text();
      const result = await importData(text);
      setImp({ ok: importMessage(result) });
      toast('Копия загружена');
    } catch (err) {
      setImp({ error: hasCyrillic(err?.message) ? err.message : 'Не получилось прочитать файл.' });
    }
  };

  const askPersist = async () => {
    try {
      const ok = await navigator.storage.persist();
      storage.value = { ...storage.value, persistent: Boolean(ok) };
      toast(ok ? 'Готово: браузер будет беречь данные' : 'Браузер пока отказал. Чаще соглашается, когда приложение на главном экране.');
    } catch {
      toast('Браузер не ответил. Просто сохраняй копию почаще.');
    }
  };

  const addToCalendar = () => {
    const t = parseTime(reminder) ?? parseTime(DEFAULT_REMINDER);
    const minutes = s.sessionMinutes ?? 10;
    const text = dailyReminderIcs({
      hour: t.hour,
      minute: t.minute,
      title: `Укулеле: ${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`,
      url: appUrl(location.href, `/practice?min=${minutes}`),
      durationMin: minutes,
    });
    downloadIcs(text, 'uke-reminder.ics');
    toast('Открой файл — событие встанет в календарь');
  };

  const closeReset = () => {
    if (!resetting) setReset(0);
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await flush();
    } catch {
      // всё равно удаляем
    }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('uke:')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // нет localStorage — нечего чистить
    }
    if (typeof indexedDB === 'undefined' || !storage.value.available) {
      location.reload();
      return;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => location.reload();
    req.onerror = () => {
      setResetting(false);
      toast('Не получилось удалить данные. Закрой приложение и попробуй ещё раз.');
    };
    req.onblocked = () => toast('Уке открыто ещё где-то. Закрой другие вкладки — удаление закончится само.');
  };

  const look = (
    <section class="card stg-card" aria-labelledby="stg-look">
      <h2 class="stg-title" id="stg-look">
        Вид
      </h2>
      <div class="stg-field">
        <span class="stg-label">Тема</span>
        <Segmented label="Тема" value={s.theme} options={THEMES} onChange={set('theme')} />
      </div>
      <div class="stg-field">
        <span class="stg-label">Как писать си</span>
        <Segmented label="Нотация" value={s.notation} options={NOTATIONS} onChange={set('notation')} />
        <p class="stg-hint">
          Си-бемоль — {chordLabel('Bb', { notation: s.notation })}, си — {chordLabel('B', { notation: s.notation })}.
          {s.notation === 'H' ? ' Как в немецких и старых русских песенниках.' : ' Как на большинстве сайтов.'}
        </p>
      </div>
      <Toggle
        checked={s.leftHanded}
        onChange={set('leftHanded')}
        label="Диаграммы для левши"
        hint="струны на схемах зеркально: A E C G"
      />
      <div class="stg-preview" aria-hidden="true">
        <ChordDiagram name="G" size="sm" />
        <span class="small muted">{s.leftHanded ? 'Так G выглядит для левой руки' : 'Так G выглядит сейчас'}</span>
      </div>
    </section>
  );

  const play = (
    <section class="card stg-card" aria-labelledby="stg-play">
      <h2 class="stg-title" id="stg-play">
        Игра
      </h2>
      <div class="stg-field">
        <span class="stg-label">Строй</span>
        <Segmented label="Строй" value={s.tuning} options={TUNINGS} onChange={set('tuning')} />
        <p class="stg-hint">
          {s.tuning === 'lowg'
            ? 'Толстая низкая G: аккорды звучат глубже. Тюнер ждёт G на октаву ниже.'
            : 'Обычный строй: G выше, чем C. Так звучит большинство укулеле.'}
        </p>
      </div>
      <Toggle checked={s.sound} onChange={set('sound')} label="Звуки в упражнениях" hint="щелчки и сигналы в конце минуты" />
    </section>
  );

  const practice = (
    <section class="card stg-card" aria-labelledby="stg-practice">
      <h2 class="stg-title" id="stg-practice">
        Занятия
      </h2>
      <div class="stg-field">
        <span class="stg-label">Занятие по умолчанию</span>
        <Segmented label="Длина занятия" value={s.sessionMinutes} options={SESSIONS} onChange={set('sessionMinutes')} />
        <p class="stg-hint">Даже 5 минут засчитываются в серию.</p>
      </div>
      <div class="stg-field">
        <Stepper
          class="stg-stepper"
          label="Цель на неделю"
          value={s.weeklyGoalMin}
          min={10}
          max={420}
          step={10}
          format={(v) => `${v} мин`}
          onChange={set('weeklyGoalMin')}
        />
        <p class="stg-hint">{weeklyHint(s.weeklyGoalMin)}</p>
      </div>
    </section>
  );

  const remind = (
    <section class="card stg-card" aria-labelledby="stg-remind">
      <h2 class="stg-title" id="stg-remind">
        Напоминание
      </h2>
      <div class="stg-time">
        <label class="stg-label" for="stg-time-input">
          Каждый день в
        </label>
        <input
          id="stg-time-input"
          type="time"
          value={reminder}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (parseTime(v)) setSetting('reminderTime', v);
          }}
        />
      </div>
      <Button variant="secondary" block icon={CalendarPlus} onClick={addToCalendar}>
        Добавить в календарь
      </Button>
      <p class="stg-hint">
        Скачается файл — открой его, и календарь будет напоминать каждый день. Поменял время — добавь заново, а старое
        событие удали.
      </p>
    </section>
  );

  const data = (
    <section class="card stg-card" aria-labelledby="stg-data">
      <h2 class="stg-title" id="stg-data">
        Данные
      </h2>
      <div class={cx('stg-storage', `stg-storage--${info.tone}`)} role={info.tone === 'success' ? undefined : 'note'}>
        {info.tone === 'success' ? <ShieldCheck size={20} aria-hidden="true" /> : info.tone === 'danger' ? <TriangleAlert size={20} aria-hidden="true" /> : <HardDrive size={20} aria-hidden="true" />}
        <div>
          <p class="bold">{info.title}</p>
          <p class="small">{info.text}</p>
          {info.canAsk && canPersist && (
            <button type="button" class="stg-link" onClick={askPersist}>
              Попросить браузер беречь данные
            </button>
          )}
        </div>
      </div>
      <div class="stg-data-actions">
        <Button variant="primary" block icon={Download} onClick={exportBackup}>
          Сохранить копию
        </Button>
        <Button variant="secondary" block icon={Upload} onClick={pickFile} disabled={imp.busy}>
          {imp.busy ? 'Загружаю…' : 'Загрузить копию'}
        </Button>
      </div>
      <input
        ref={fileRef}
        class="sr-only"
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />
      <p class="stg-hint">{lastBackupText(lastBackup)}. Копия — один файл: песни, прогресс и настройки.</p>
      {imp.ok && (
        <p class="stg-result stg-result--ok" role="status">
          {imp.ok}
        </p>
      )}
      {imp.error && (
        <p class="stg-result stg-result--error" role="alert">
          {imp.error}
        </p>
      )}
    </section>
  );

  const about = (
    <section class="card stg-card" aria-labelledby="stg-about">
      <h2 class="stg-title" id="stg-about">
        О приложении
      </h2>
      <p class="small">
        Уке · версия <span class="mono">{version ?? 'для разработки'}</span>
      </p>
      <div class="stack stack-sm">
        <p class="stg-label">Откуда песни</p>
        <ul class="stg-list">
          {SOURCES.map((src) => (
            <li key={src.name}>
              <a href={src.url} target="_blank" rel="noopener noreferrer" class="stg-ext">
                {src.name}
                <ExternalLink size={14} aria-hidden="true" />
              </a>{' '}
              <span class="muted">— {src.what}</span>
            </li>
          ))}
        </ul>
        <p class="stg-hint">
          Песни хранятся только на этом устройстве и только для твоей практики. Приложение их никуда не отправляет.
        </p>
      </div>
      <div class="stack stack-sm">
        <p class="stg-label">Открытый код внутри</p>
        <ul class="stg-list">
          {LICENSES.map((l) => (
            <li key={l.name}>
              {l.name} <span class="stg-lic">{l.license}</span> <span class="muted">— {l.what}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );

  const danger = (
    <section class="stg-danger" aria-label="Сброс">
      <Button variant="ghost" icon={RotateCcw} class="stg-reset" onClick={() => setReset(1)}>
        Сбросить прогресс
      </Button>
    </section>
  );

  return (
    <Page title="Настройки" back="/today" wide>
      <div class="stg-cols">
        <div class="stg-col">
          {look}
          {play}
          {practice}
          {remind}
        </div>
        <div class="stg-col">
          {data}
          {about}
          {danger}
        </div>
      </div>

      <Sheet open={reset > 0} onClose={closeReset} title="Сбросить прогресс">
        {reset === 1 ? (
          <div class="stack">
            <p>
              Удалятся аккорды, рекорды, серия, уроки, настройки и твои песни. Вернуть их можно будет только из копии.
            </p>
            <Button variant="secondary" size="lg" block icon={Download} onClick={exportBackup}>
              Сначала сохранить копию
            </Button>
            <Button variant="danger" size="lg" block icon={Trash2} onClick={() => setReset(2)}>
              Удалить всё
            </Button>
          </div>
        ) : (
          <div class="stack">
            <p class="bold">Точно? Отменить это нельзя.</p>
            <p class="small muted">Приложение перезапустится и начнёт со знакомства.</p>
            <Button variant="danger" size="lg" block icon={Trash2} onClick={doReset} disabled={resetting}>
              {resetting ? 'Удаляю…' : 'Да, удалить всё'}
            </Button>
            <Button variant="ghost" block onClick={closeReset} disabled={resetting}>
              Оставить как есть
            </Button>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
