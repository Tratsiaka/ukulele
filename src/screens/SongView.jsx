import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Dumbbell, Ellipsis, ExternalLink, Headphones, Heart, Music, RotateCcw, Trash2 } from 'lucide-preact';
import { knownChordNames, removeSong, settings, songs, updateSong } from '../state.js';
import { navigate } from '../app/router.js';
import { findPreview, SourceError } from '../sources/index.js';
import { chordLabel, plural } from '../lib/format.js';
import { Button, EmptyState, IconButton, Page, Segmented, Sheet, Stepper, Toggle, toast } from '../ui/index.js';
import { KeyBanner } from '../exercises/KeyBanner.jsx';
import { PlayAlong, usePlayPrefs } from '../exercises/PlayAlong.jsx';
import { FONT_MAX, FONT_MIN, FONT_STEP, SHIFT_LIMIT, formatShift, keyNameAt } from '../exercises/sheet-model.js';
import '../exercises/sheet.css';

/** @typedef {import('../state.js').SongRecord} SongRecord */

const STATUS = { new: 'Новая', learning: 'Учу', playing: 'Играю', polished: 'Отполировано' };
const STATUS_OPTIONS = [
  { value: 'learning', label: 'Учу' },
  { value: 'playing', label: 'Играю' },
  { value: 'polished', label: 'Отполировано' },
];
const STRIP_KEY = 'uke:sheet-strip';

function readStripPref() {
  try {
    return localStorage.getItem(STRIP_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeStripPref(on) {
  try {
    localStorage.setItem(STRIP_KEY, on ? '1' : '0');
  } catch {
    // не страшно: настройка только для удобства
  }
}

/** Тональность из ChordPro ({key: Am}) — без полного разбора песни. */
function keyFromText(text) {
  return /\{\s*key\s*:\s*([^}]+)\}/i.exec(String(text ?? ''))?.[1]?.trim() || undefined;
}

/**
 * Песня в режиме игры (/song/:id): лист, полоса диаграмм, автопрокрутка, тональность и всё остальное в «⋯».
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function SongView({ params }) {
  const record = songs.value.find((s) => s.id === params?.id);
  if (!record) return <NotFound />;
  return <SongScreen record={record} />;
}

function NotFound() {
  return (
    <Page title="Песня" back="/songs">
      <EmptyState
        icon={Music}
        title="Такой песни нет"
        text="Возможно, её удалили. В библиотеке остальные песни на месте."
        action={{ label: 'К песням', href: '/songs' }}
      />
    </Page>
  );
}

/** @param {{record: SongRecord}} props */
function SongScreen({ record }) {
  const { prefs, setPref } = usePlayPrefs(record);
  const [menu, setMenu] = useState(false);
  const [structure, setStructure] = useState(false);
  const [strip, setStrip] = useState(readStripPref);
  const known = knownChordNames.value;
  const songKey = useMemo(() => keyFromText(record.text), [record.text]);
  const trainHref = `/song/${encodeURIComponent(record.id)}/train`;
  const plays = record.trainer?.plays ?? 0;

  const toggleStrip = (on) => {
    setStrip(on);
    writeStripPref(on);
  };

  const actions = (
    <>
      <Button class="desktop-only" variant="primary" size="sm" icon={Dumbbell} href={trainHref}>
        Тренировать
      </Button>
      <IconButton icon={Ellipsis} label="Ещё: тональность, статус, превью" onClick={() => setMenu(true)} />
    </>
  );

  const top = (
    <>
      <div class="songview__meta">
        <span class={`songview__status songview__status--${record.status}`}>{STATUS[record.status] ?? STATUS.new}</span>
        {record.fav && (
          <span class="accent row gap-1" title="В избранном">
            <Heart size={16} fill="currentColor" aria-hidden="true" />
            <span class="sr-only">В избранном</span>
          </span>
        )}
        {plays > 0 && (
          <span class="small muted nums">
            сыграна {plays} {plural(plays, ['раз', 'раза', 'раз'])}
          </span>
        )}
        <Button class="songview__train mobile-only" variant="primary" size="sm" icon={Dumbbell} href={trainHref}>
          Тренировать
        </Button>
      </div>
      <KeyBanner
        chords={record.chords}
        known={known}
        transpose={prefs.transpose}
        songKey={songKey}
        onApply={(shift) => setPref('transpose', shift)}
      />
    </>
  );

  return (
    <Page title={record.title} subtitle={record.artist || undefined} back="/songs" actions={actions} wide class="songview">
      <PlayAlong
        record={record}
        prefs={prefs}
        setPref={setPref}
        structureOnly={structure}
        showStrip={strip}
        top={top}
      />
      <SongMenu
        open={menu}
        onClose={() => setMenu(false)}
        record={record}
        prefs={prefs}
        setPref={setPref}
        songKey={songKey}
        structure={structure}
        setStructure={setStructure}
        strip={strip}
        setStrip={toggleStrip}
      />
    </Page>
  );
}

/**
 * Шторка «⋯»: тональность, шрифт, упрощение, структура, статус, избранное, превью, источник, удаление.
 */
function SongMenu({ open, onClose, record, prefs, setPref, songKey, structure, setStructure, strip, setStrip }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);
  const notation = settings.value?.notation ?? 'B';
  const keyName = record.chords?.length ? keyNameAt(record.chords, prefs.transpose, songKey) : '';

  const setStatus = (status) => {
    updateSong(record.id, { status });
    if (status === 'polished') toast('Отполировано. Красота');
  };

  const onDelete = () => {
    const title = record.title;
    onClose();
    navigate('/songs', { replace: true });
    removeSong(record.id);
    toast(`«${title}» убрана из библиотеки`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Песня">
      <div class="stack songview__menu">
        <section class="songview__group">
          <p class="eyebrow">Как показывать</p>
          <Stepper
            label={keyName ? `Тональность: ${chordLabel(keyName, { notation })}` : 'Тональность'}
            value={prefs.transpose}
            min={-SHIFT_LIMIT}
            max={SHIFT_LIMIT}
            onChange={(v) => setPref('transpose', v)}
            format={formatShift}
          />
          {prefs.transpose !== 0 && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setPref('transpose', 0)} class="songview__reset">
              Вернуть исходную
            </Button>
          )}
          <Stepper
            label="Размер текста"
            value={prefs.fontSize}
            min={FONT_MIN}
            max={FONT_MAX}
            step={FONT_STEP}
            onChange={(v) => setPref('fontSize', v)}
          />
          <Toggle label="Упростить аккорды" hint="Am7 → Am, Cmaj7 → C" checked={prefs.simplify} onChange={(v) => setPref('simplify', v)} />
          <Toggle label="Только структура" hint="Секции и аккорды, без текста" checked={structure} onChange={setStructure} />
          <Toggle label="Диаграммы аккордов" hint="Выключи — останутся только названия" checked={strip} onChange={setStrip} />
        </section>

        <section class="songview__group">
          <p class="eyebrow">Статус</p>
          <Segmented label="Статус песни" value={record.status} options={STATUS_OPTIONS} onChange={setStatus} />
          <Toggle label="В избранном" checked={Boolean(record.fav)} onChange={(v) => updateSong(record.id, { fav: v })} />
        </section>

        <section class="songview__group">
          <p class="eyebrow">Послушать</p>
          <PreviewPlayer record={record} />
          {record.source?.url && (
            <Button variant="ghost" icon={ExternalLink} href={record.source.url}>
              Открыть источник
            </Button>
          )}
        </section>

        <section class="songview__group">
          {confirm ? (
            <div class="songview__confirm stack gap-3">
              <p>Убрать «{record.title}» из библиотеки?</p>
              <div class="row row-wrap gap-2">
                <Button variant="danger" icon={Trash2} onClick={onDelete}>
                  Удалить
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Оставить
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" icon={Trash2} class="danger" onClick={() => setConfirm(true)}>
              Удалить песню
            </Button>
          )}
        </section>
      </div>
    </Sheet>
  );
}

/**
 * «Послушать»: 30-секундное превью из iTunes (с подписью и ссылкой на трек). Найденное запоминается в record.preview.
 * @param {{record: SongRecord}} props
 */
function PreviewPlayer({ record }) {
  const cached = record.preview?.url ? record.preview : null;
  const [state, setState] = useState(/** @type {'idle'|'loading'|'ready'|'none'|'error'} */ (cached ? 'ready' : 'idle'));
  const [data, setData] = useState(cached);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef(/** @type {AbortController|null} */ (null));
  const retried = useRef(false);
  useEffect(() => () => ctrl.current?.abort(), []);

  const load = async () => {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setState('loading');
    try {
      const r = await findPreview({ artist: record.artist, title: record.title }, { signal: ac.signal });
      if (ac.signal.aborted) return;
      if (!r?.previewUrl) {
        setState('none');
        return;
      }
      const p = { url: r.previewUrl, artwork: r.artworkUrl || '', link: r.trackUrl || '' };
      updateSong(record.id, { preview: p });
      setData(p);
      setAuto(true);
      setState('ready');
    } catch (err) {
      if (ac.signal.aborted || err?.name === 'AbortError') return;
      setError(err instanceof SourceError ? err.message : 'Не получилось достучаться до iTunes. Проверь связь.');
      setState('error');
    }
  };

  if (state === 'ready' && data) {
    return (
      <div class="songview__preview">
        {data.artwork && <img class="songview__art" src={data.artwork} alt="" loading="lazy" />}
        <div class="stack gap-1 grow">
          <audio
            class="songview__audio"
            src={data.url}
            controls
            autoPlay={auto}
            preload="none"
            onError={() => {
              // Ссылка из кэша устарела — ищем заново один раз
              if (!retried.current) {
                retried.current = true;
                load();
              } else {
                setError('Превью не играет. Попробуй позже.');
                setState('error');
              }
            }}
          />
          <p class="songview__credit">
            Превью: iTunes
            {data.link && (
              <>
                {' · '}
                <a href={data.link} target="_blank" rel="noopener noreferrer">
                  открыть в Apple Music
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="stack gap-2">
      {state === 'none' && <p class="small muted">Не нашёл превью этой песни.</p>}
      {state === 'error' && <p class="small muted">{error}</p>}
      {state !== 'none' && (
        <Button variant="secondary" icon={Headphones} onClick={load} disabled={state === 'loading'}>
          {state === 'loading' ? 'Ищу превью…' : state === 'error' ? 'Ещё раз' : 'Послушать 30 секунд'}
        </Button>
      )}
    </div>
  );
}
