// «Добавить песню» (/songs/import): вставка текста, файл, Share Target (?title&text&url).
// Пришёл текст с аккордами — подставляем; пришла ссылка akkords/dieza — загружаем и сохраняем сами;
// иначе — подсказка «выдели текст → Поделиться → Уке».

import './songs.css';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ClipboardPaste, ExternalLink, FolderOpen, Info, LoaderCircle, Save, WifiOff, X } from 'lucide-preact';
import { addSong, knownChordNames, settings, songs } from '../state.js';
import { navigate } from '../app/router.js';
import { SOURCES, hitFromUrl, loadSong } from '../sources/index.js';
import { parseSong, songChords, toChordPro } from '../core/song.js';
import { Button, Card, Chip, Page, toast } from '../ui/index.js';
import { countLabel } from '../lib/format.js';
import {
  analyzeShare, findByUrl, guessFromFileName, importPreview, savedMessage, snippetLines, songInfo,
} from './songs-helpers.js';
import { ChordChips, PlayBadge, SongSnippet, Stars, useOnline } from './Songs.jsx';

const DRAFT_KEY = 'uke:import-draft';
const MAX_FILE_BYTES = 1024 * 1024;
const FILE_ACCEPT = '.txt,.chordpro,.cho,.chopro,.crd,.pro,text/plain';
const PREVIEW_DELAY = 200;
const DRAFT_DELAY = 500;
const PLACEHOLDER = `Am              Dm
Вставь сюда песню: аккорды
E7                   Am
над строками или [Am]в скобках`;

const songHref = (id) => `/song/${encodeURIComponent(id)}`;

/**
 * Импорт песни.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function SongImport({ query = {} }) {
  // Параметры Share Target читаем один раз, при открытии
  const init = useMemo(() => initialState(query), []);
  const [title, setTitle] = useState(init.title);
  const [artist, setArtist] = useState(init.artist);
  const [text, setText] = useState(init.text);
  const [site, setSite] = useState(init.site);
  const [url, setUrl] = useState(init.url);
  const [hint, setHint] = useState(init.hint);
  const [fetchHit, setFetchHit] = useState(init.hit);
  const [fetchError, setFetchError] = useState('');
  const [saving, setSaving] = useState(false);
  const online = useOnline();
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const textRef = useRef(/** @type {HTMLTextAreaElement|null} */ (null));

  const known = knownChordNames.value;
  const knownSet = useMemo(() => new Set(known), [known]);
  const notation = settings.value?.notation ?? 'B';

  // Длинный текст из «Поделиться» не нужен в адресе: перезагрузка не должна запускать импорт снова
  useEffect(() => {
    if (init.shared) navigate('/songs/import', { replace: true, scroll: false });
  }, []);

  // Ссылка на akkords/dieza: загрузить и сохранить без лишних вопросов (без сети — ждём её)
  useEffect(() => {
    if (!fetchHit || !online) return undefined;
    const dupe = findByUrl(songs.value, fetchHit.url);
    if (dupe) {
      toast('Эта песня уже в библиотеке');
      navigate(songHref(dupe.id), { replace: true });
      return undefined;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const loaded = await loadSong(fetchHit, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const again = findByUrl(songs.value, loaded.source?.url);
        const id = again ? again.id : await addSong({ ...loaded, source: loaded.source });
        toast(again ? 'Эта песня уже в библиотеке' : savedMessage(songInfo(loaded.chords, knownChordNames.value).badge));
        navigate(songHref(id), { replace: true });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setFetchError(err?.message || 'что-то пошло не так');
        setFetchHit(null);
        setHint(true);
      }
    })();
    return () => ctrl.abort();
  }, [fetchHit, online]);

  // Черновик: вставленный текст переживает уход с экрана
  useEffect(() => {
    if (fetchHit) return undefined;
    const t = setTimeout(() => writeDraft({ text, title, artist }), DRAFT_DELAY);
    return () => clearTimeout(t);
  }, [text, title, artist, fetchHit]);

  const previewText = useDebouncedValue(text, PREVIEW_DELAY);
  const preview = useMemo(
    () => importPreview(previewText, { title: title.trim(), artist: artist.trim() }),
    [previewText, title, artist],
  );
  const ok = Boolean(preview && !('error' in preview) && preview.chords.length > 0);
  const canSave = ok && !saving && text.trim().length > 0;

  if (fetchHit) {
    return (
      <FetchingScreen
        hit={fetchHit}
        title={title}
        online={online}
        onCancel={() => {
          setFetchHit(null);
          setHint(true);
        }}
      />
    );
  }

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const t = title.trim();
      const a = artist.trim();
      const parsed = parseSong(text, { title: t, artist: a });
      const finalTitle = t || parsed.title || '';
      const finalArtist = a || parsed.artist || '';
      const id = await addSong({
        title: finalTitle,
        artist: finalArtist,
        rawText: text,
        text: toChordPro(parseSong(text, { title: finalTitle, artist: finalArtist })),
        source: { site, ...(url ? { url } : {}) },
      });
      clearDraft();
      toast(savedMessage(songInfo(songChords(parsed), known).badge));
      navigate(songHref(id), { replace: true });
    } catch (err) {
      console.warn('[uke] не удалось сохранить песню', err);
      setSaving(false);
      toast('Не получилось сохранить. Попробуй ещё раз');
    }
  };

  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) {
        toast('В буфере пусто');
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${clip}` : clip));
    } catch {
      toast('Буфер не открылся. Вставь долгим нажатием в поле');
      textRef.current?.focus();
    }
  };

  const onFile = async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast('Файл великоват: нужен текст песни до 1 МБ');
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setSite('file');
      setUrl('');
      const p = importPreview(content);
      const fromText = p && !('error' in p) ? p.song : null;
      if (!title.trim() && !fromText?.title) {
        const g = guessFromFileName(file.name);
        setTitle(g.title);
        if (!artist.trim() && g.artist) setArtist(g.artist);
      }
    } catch {
      toast('Не получилось прочитать файл');
    }
  };

  const clearAll = () => {
    const prev = { text, title, artist, site, url };
    setText('');
    setTitle('');
    setArtist('');
    setSite('paste');
    setUrl('');
    clearDraft();
    textRef.current?.focus();
    toast('Очистил', {
      action: {
        label: 'Вернуть',
        onClick: () => {
          setText(prev.text);
          setTitle(prev.title);
          setArtist(prev.artist);
          setSite(prev.site);
          setUrl(prev.url);
        },
      },
    });
  };

  const parsedSong = preview && !('error' in preview) ? preview.song : null;
  const status = !text.trim()
    ? 'Вставь текст песни'
    : !preview || 'error' in preview
      ? 'Читаю текст…'
      : preview.chords.length === 0
        ? 'Не вижу аккордов'
        : `${countLabel(preview.lines, ['строка', 'строки', 'строк'])} · ${countLabel(preview.chords.length, ['аккорд', 'аккорда', 'аккордов'])}`;

  return (
    <Page title="Добавить песню" subtitle="Текст с аккордами — откуда угодно" back="/songs" wide>
      {hint && <ShareHint url={url} error={fetchError} />}

      <div class="split songs-import">
        <div class="stack">
          <div class="songs-import-fields">
            <label class="songs-field">
              <span class="songs-field-label">Название</span>
              <input
                type="text"
                value={title}
                placeholder={parsedSong?.title || 'Например, Группа крови'}
                autocomplete="off"
                enterkeyhint="next"
                onInput={(e) => setTitle(e.currentTarget.value)}
              />
            </label>
            <label class="songs-field">
              <span class="songs-field-label">Исполнитель</span>
              <input
                type="text"
                value={artist}
                placeholder={parsedSong?.artist || 'Например, Кино'}
                autocomplete="off"
                enterkeyhint="next"
                onInput={(e) => setArtist(e.currentTarget.value)}
              />
            </label>
          </div>

          <div class="row row-wrap gap-2 songs-import-tools">
            {canPaste && (
              <Button size="sm" icon={ClipboardPaste} onClick={pasteFromClipboard}>
                Из буфера
              </Button>
            )}
            <Button size="sm" icon={FolderOpen} onClick={() => fileRef.current?.click()}>
              Открыть файл
            </Button>
            <input ref={fileRef} type="file" accept={FILE_ACCEPT} hidden onChange={onFile} />
            <span class="spacer" />
            {text && (
              <Button size="sm" variant="ghost" icon={X} onClick={clearAll}>
                Очистить
              </Button>
            )}
          </div>

          <label class="sr-only" for="songs-import-text">
            Текст песни с аккордами
          </label>
          <textarea
            id="songs-import-text"
            ref={textRef}
            class="songs-import-text"
            value={text}
            placeholder={PLACEHOLDER}
            wrap="off"
            spellcheck={false}
            autocapitalize="off"
            autocomplete="off"
            rows={14}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </div>

        <aside class="split-aside">
          <ImportPreview preview={preview} knownSet={knownSet} known={known} notation={notation} />
        </aside>
      </div>

      <div class="thumb-bar songs-import-bar">
        <span class={ok || !text.trim() ? 'songs-import-status' : 'songs-import-status is-warn'} aria-live="polite">
          {status}
        </span>
        <Button
          variant="primary"
          size="lg"
          icon={saving ? <LoaderCircle class="songs-spin" size={22} aria-hidden="true" /> : Save}
          disabled={!canSave}
          aria-busy={saving ? 'true' : undefined}
          onClick={save}
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </Button>
      </div>
    </Page>
  );
}

// ---------- части экрана ----------

function FetchingScreen({ hit, title, online, onCancel }) {
  const siteName = SOURCES.find((s) => s.id === hit.sourceId)?.name ?? 'сайта';
  return (
    <Page title="Добавить песню" back="/songs">
      <Card class="songs-fetch">
        <div class="songs-fetch-icon" aria-hidden="true">
          {online ? <LoaderCircle class="songs-spin" size={28} /> : <WifiOff size={28} />}
        </div>
        <div class="stack stack-sm" role="status" aria-live="polite">
          {online ? (
            <>
              <b>Загружаю песню с {siteName}</b>
              <p class="muted small">{title || hit.url}</p>
            </>
          ) : (
            <>
              <b>Нет сети</b>
              <p class="muted small">Загружу песню, как только появится интернет. Можно не ждать и вставить текст вручную.</p>
            </>
          )}
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Вставлю сам
        </Button>
      </Card>
    </Page>
  );
}

function ShareHint({ url, error }) {
  return (
    <Card tone="accent" class="songs-hint">
      <Info size={22} aria-hidden="true" class="songs-hint-icon" />
      <div class="stack stack-sm">
        {error && (
          <p class="small">
            <b>По ссылке не загрузилось:</b> {error}.
          </p>
        )}
        <p>
          <b>Выдели на сайте текст песни вместе с аккордами → Поделиться → Уке</b>
        </p>
        <p class="small muted">Или скопируй его и вставь сюда.</p>
        {url && (
          <div>
            <Button size="sm" icon={ExternalLink} href={url}>
              Открыть страницу
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ImportPreview({ preview, knownSet, known, notation }) {
  if (!preview) {
    return (
      <Card class="songs-import-tips">
        <span class="eyebrow">Что подойдёт</span>
        <ul class="songs-tips">
          <li>
            <b>Аккорды над строками</b> — как на большинстве сайтов
          </li>
          <li>
            <b>ChordPro</b> — <code>[Am]</code> прямо в тексте
          </li>
          <li>
            <b>Ultimate Guitar</b> — с <code>[ch]Am[/ch]</code> тоже разберусь
          </li>
          <li>
            <b>Файл</b> .txt, .chordpro, .cho, .pro
          </li>
        </ul>
      </Card>
    );
  }
  if ('error' in preview) {
    return (
      <Card tone="warn">
        <p>Этот текст не разобрался. Проверь, что аккорды стоят над строками или в [квадратных скобках].</p>
      </Card>
    );
  }
  const info = preview.chords.length ? songInfo(preview.chords, known, { notation }) : null;
  const lines = snippetLines(preview.song, 6);
  return (
    <Card class="songs-import-preview">
      <div class="stack">
        <div class="row row-wrap gap-2">
          <span class="eyebrow grow">Что я вижу</span>
          <Chip tone="outline" class="songs-badge">
            {preview.formatLabel}
          </Chip>
        </div>
        <p class="small muted nums">
          {countLabel(preview.lines, ['строка', 'строки', 'строк'])}
          {preview.parts > 1 ? ` · ${countLabel(preview.parts, ['часть', 'части', 'частей'])}` : ''}
        </p>
        {preview.chords.length > 0 ? (
          <>
            <ChordChips chords={preview.chords} known={knownSet} max={16} />
            <div class="row row-wrap gap-2">
              <PlayBadge badge={info.badge} />
              <Stars n={info.stars} hint={info.bottleneck} />
            </div>
          </>
        ) : (
          <p class="songs-error">Не вижу аккордов. Они должны стоять над строками текста или в [квадратных скобках].</p>
        )}
        {lines.length > 0 && <SongSnippet lines={lines} notation={notation} />}
      </div>
    </Card>
  );
}

// ---------- состояние ----------

function initialState(query) {
  const share = analyzeShare(query);
  if (share.mode === 'none') {
    const d = readDraft();
    return { title: d.title, artist: d.artist, text: d.text, site: 'paste', url: '', hint: false, hit: null, shared: false };
  }
  const base = { title: share.title, artist: share.artist, site: 'paste', url: share.url, shared: true };
  if (share.mode === 'text') return { ...base, text: share.text, hint: false, hit: null };
  const hit = share.mode === 'url' ? hitFromUrl(share.url) : null;
  return { ...base, text: '', hint: !hit, hit };
}

function useDebouncedValue(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && typeof d === 'object') {
      return { text: String(d.text ?? ''), title: String(d.title ?? ''), artist: String(d.artist ?? '') };
    }
  } catch {
    /* нет черновика — и ладно */
  }
  return { text: '', title: '', artist: '' };
}

function writeDraft(d) {
  try {
    if (d.text.trim() || d.title.trim() || d.artist.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* черновик — только удобство */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ничего */
  }
}
