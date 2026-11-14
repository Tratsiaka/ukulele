// Вкладка «Песни»: библиотека («Мои») и поиск по сайтам («Найти»). Маршрут /songs?tab=find&q=…&f=…
// Здесь же общие куски для экрана импорта: превью текста, бейдж, звёзды, чипы аккордов, useOnline.

import './songs.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowDownUp, BookmarkPlus, Check, ClipboardPaste, Clock, Dumbbell, EllipsisVertical, ExternalLink, Heart, ListMusic,
  LoaderCircle, Play, RotateCw, Search, SearchX, Sparkles, Star, Trash, WifiOff, X,
} from 'lucide-preact';
import { addSong, getSong, knownChordNames, removeSong, settings, songs, updateSong } from '../state.js';
import { Link, navigate, withQuery } from '../app/router.js';
import { SOURCES, loadSong, resetBreaker, searchSongs } from '../sources/index.js';
import { parseSong } from '../core/song.js';
import { nextChordGains } from '../core/playable.js';
import {
  Button, Card, Chip, ChordChip, ChordDiagram, EmptyState, IconButton, Page, Segmented, Sheet, Toggle, toast,
} from '../ui/index.js';
import { chordLabel, countLabel } from '../lib/format.js';
import {
  FILTERS, FILTER_LABELS, STATUS_OPTIONS, externalSearchLinks, filterCounts, filterSongs, findByUrl, groupHits,
  isKnownChord, matchLibrary, normalizeFilter, pushRecent, savedMessage, snippetLines, songInfo, sortRecent, sourceLabel,
  statusLabel,
} from './songs-helpers.js';

const DEBOUNCE_MS = 450;
const RECENT_KEY = 'uke:songs-recent';
const TABS = [
  { value: 'mine', label: 'Мои' },
  { value: 'find', label: 'Найти' },
];
const SONGS_WORDS = /** @type {[string, string, string]} */ (['песню', 'песни', 'песен']);

const songHref = (id) => `/song/${encodeURIComponent(id)}`;
const sourceName = (id) => SOURCES.find((s) => s.id === id)?.name ?? id;

/**
 * Вкладка «Песни».
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Songs({ query = {} }) {
  const tab = query.tab === 'find' ? 'find' : 'mine';
  const filter = normalizeFilter(query.f);
  const lib = useLibrary();
  // «Найти» монтируется при первом открытии и дальше живёт скрытым: выдача не теряется при переключении
  const [findMounted, setFindMounted] = useState(tab === 'find');
  useEffect(() => {
    if (tab === 'find') setFindMounted(true);
  }, [tab]);

  const go = (patch) => {
    const next = { tab: tab === 'find' ? 'find' : undefined, q: query.q, f: query.f, ...patch };
    navigate(withQuery('/songs', next), { replace: true, scroll: false });
  };

  return (
    <Page
      title="Песни"
      wide
      actions={
        <Button variant="ghost" size="sm" icon={ClipboardPaste} href="/songs/import">
          Вставить текст
        </Button>
      }
    >
      <Segmented
        class="songs-tabs"
        label="Раздел песен"
        value={tab}
        options={TABS}
        onChange={(v) => go({ tab: v === 'find' ? 'find' : undefined })}
      />
      <div class="songs-pane" hidden={tab !== 'mine'}>
        <Library
          filter={filter}
          lib={lib}
          onFilter={(f) => go({ f: f === 'all' ? undefined : f })}
          onFind={() => go({ tab: 'find' })}
        />
      </div>
      {findMounted && (
        <div class="songs-pane" hidden={tab !== 'find'}>
          <Finder q={query.q ?? ''} active={tab === 'find'} lib={lib} onQuery={(q) => go({ tab: 'find', q: q || undefined })} />
        </div>
      )}
    </Page>
  );
}

// ---------- данные ----------

/** Библиотека и всё, что о песнях показывает список (бейдж, звёзды), с мемоизацией по песням и знакомым аккордам. */
function useLibrary() {
  const list = songs.value;
  const known = knownChordNames.value;
  const notation = settings.value?.notation ?? 'B';
  return useMemo(() => {
    const knownSet = new Set(known);
    const infos = new Map();
    for (const s of list) infos.set(s.id, songInfo(s.chords, known, { notation, bpm: s.bpm }));
    const info = (s) => infos.get(s.id) ?? songInfo(s.chords, known, { notation });
    return { list, known, knownSet, notation, info };
  }, [list, known, notation]);
}

/** Есть ли сеть (по событиям online/offline). */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* не страшно: это только удобство */
  }
}

// ---------- «Мои» ----------

function Library({ filter, lib, onFilter, onFind }) {
  const [menuId, setMenuId] = useState(/** @type {string|null} */ (null));
  const counts = useMemo(() => filterCounts(lib.list, lib.info), [lib]);
  const visible = useMemo(() => sortRecent(filterSongs(lib.list, filter, lib.info)), [lib, filter]);
  const next = useMemo(() => {
    if (filter !== 'playable') return null;
    const top = nextChordGains(lib.list.map((s) => s.chords ?? []), lib.known)[0];
    return top && top.gain > 0 ? top : null;
  }, [lib, filter]);

  return (
    <div class="stack songs-library">
      <div class="scroll-x songs-filters" role="group" aria-label="Какие песни показать">
        {FILTERS.map((f) => (
          <Chip
            key={f}
            active={f === filter}
            icon={f === 'playable' && counts.playable > 0 ? Sparkles : undefined}
            onClick={() => onFilter(f)}
          >
            {FILTER_LABELS[f]}{' '}
            <span class="songs-count nums">{counts[f]}</span>
          </Chip>
        ))}
      </div>

      {visible.length ? (
        <ul class="songs-list" aria-label={FILTER_LABELS[filter]}>
          {visible.map((s, i) => (
            <li key={s.id} style={{ '--i': Math.min(i, 12) }}>
              <SongRow song={s} info={lib.info(s)} known={lib.knownSet} onMenu={() => setMenuId(s.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <LibraryEmpty filter={filter} hasKnown={lib.known.length > 0} onFind={onFind} onFilter={onFilter} />
      )}

      {next && <NextChordCard chord={next.chord} gain={next.gain} notation={lib.notation} />}
      <NotFoundCard />
      <SongMenu id={menuId} lib={lib} onClose={() => setMenuId(null)} />
    </div>
  );
}

function LibraryEmpty({ filter, hasKnown, onFind, onFilter }) {
  if (filter === 'playing') {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Пока ничего не разучиваешь"
        text="Открой песню и нажми «Тренировать» — она появится здесь."
        action={{ label: 'Что можно сыграть', icon: Sparkles, onClick: () => onFilter('playable') }}
      />
    );
  }
  if (filter === 'playable') {
    return hasKnown ? (
      <EmptyState
        icon={Sparkles}
        title="Пока ни одна не складывается"
        text="Выучи ещё аккорд — и здесь появятся песни, которые ты уже потянешь."
        action={{ label: 'К аккордам', href: '/chords' }}
      />
    ) : (
      <EmptyState
        icon={Sparkles}
        title="Отметь аккорды, которые знаешь"
        text="Тогда я покажу песни, которые можно сыграть уже сейчас."
        action={{ label: 'К аккордам', href: '/chords' }}
      />
    );
  }
  if (filter === 'fav') {
    return (
      <EmptyState
        icon={Heart}
        title="Тут будут любимые"
        text="Нажми ⋮ у песни и включи «В избранном»."
        action={{ label: 'Все песни', onClick: () => onFilter('all') }}
      />
    );
  }
  return (
    <EmptyState
      icon={ListMusic}
      title="Библиотека пуста"
      text="Найди песню на сайтах или вставь свой текст с аккордами."
      action={{ label: 'Найти песню', icon: Search, onClick: onFind }}
    />
  );
}

function NextChordCard({ chord, gain, notation }) {
  const label = chordLabel(chord, { notation });
  return (
    <Card href={`/chords/${encodeURIComponent(chord)}`} tone="accent" class="songs-next" label={`Выучить ${label}`}>
      <span class="songs-next-chord chord-name" aria-hidden="true">
        {label}
      </span>
      <span class="songs-next-text">
        <span class="bold">Следующий аккорд — {label}</span>
        <span class="small muted">С ним сможешь сыграть ещё {countLabel(gain, SONGS_WORDS)}</span>
      </span>
    </Card>
  );
}

/**
 * Строка песни библиотеки: тап — режим игры, ⋮ — меню.
 * @param {{song: any, info: ReturnType<typeof songInfo>, known: Set<string>, onMenu?: () => void}} props
 */
export function SongRow({ song, info, known, onMenu }) {
  const meta = [song.artist, song.status && song.status !== 'new' ? statusLabel(song.status).toLowerCase() : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div class="songs-row">
      <Link href={songHref(song.id)} class="songs-row-main">
        <span class="songs-row-head">
          <StatusDot status={song.status} />
          <span class="songs-row-title">{song.title}</span>
          {song.fav && (
            <span class="songs-fav">
              <Heart size={15} fill="currentColor" aria-hidden="true" />
              <span class="sr-only">, в избранном</span>
            </span>
          )}
        </span>
        {meta && <span class="songs-row-meta">{meta}</span>}
        <ChordChips chords={song.chords} known={known} />
        <span class="songs-row-foot">
          <PlayBadge badge={info.badge} />
          <Stars n={info.stars} hint={info.bottleneck} />
        </span>
      </Link>
      {onMenu && <IconButton class="songs-row-more" icon={EllipsisVertical} label={`Ещё: ${song.title}`} onClick={onMenu} />}
    </div>
  );
}

function StatusDot({ status }) {
  return <span class={`songs-dot songs-dot--${status || 'new'}`} aria-hidden="true" title={statusLabel(status)} />;
}

const BADGE_LOOK = {
  playable: { tone: 'success', icon: Check, hint: 'Все аккорды знакомы' },
  shift: { tone: 'teal', icon: ArrowDownUp, hint: 'Можно сыграть, если сдвинуть тональность' },
  missing: { tone: 'outline', icon: Sparkles, hint: 'Нужно выучить новые аккорды' },
  none: { tone: 'outline', icon: undefined, hint: '' },
};

/** Бейдж «можно сыграть» / «в Am (−3)» / «не хватает 2» — значок и текст, не только цвет. */
export function PlayBadge({ badge }) {
  if (!badge) return null;
  const look = BADGE_LOOK[badge.kind] ?? BADGE_LOOK.none;
  return (
    <Chip tone={look.tone} icon={look.icon} class={`songs-badge songs-badge--${badge.kind}`} title={look.hint || undefined}>
      {badge.text}
      {badge.kind === 'shift' && <span class="sr-only">: можно сыграть знакомыми аккордами</span>}
    </Chip>
  );
}

/** Сложность 1–5 звёздами (с подписью для диктора). */
export function Stars({ n = 1, hint = '' }) {
  const label = `Сложность ${n} из 5${hint ? `: ${hint}` : ''}`;
  return (
    <span class="songs-stars" role="img" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} strokeWidth={2.2} fill={i <= n ? 'currentColor' : 'none'} class={i <= n ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/** Компактный ряд аккордов: знакомые — с галочкой, незнакомые приглушены. */
export function ChordChips({ chords, known, max = 6 }) {
  const list = chords ?? [];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const k = known?.size ? known : null;
  return (
    <span class="songs-chords">
      {shown.map((c) => (
        <ChordChip key={c} name={c} known={k ? isKnownChord(c, k) : undefined} />
      ))}
      {list.length > max && (
        <span class="songs-chords-more" aria-label={`и ещё ${list.length - max}`}>
          +{list.length - max}
        </span>
      )}
    </span>
  );
}

/** Первые строки песни: аккорд над слогом, как в листе. */
export function SongSnippet({ lines, notation = 'B' }) {
  if (!lines?.length) return null;
  const label = (c) => chordLabel(c, { notation });
  return (
    <div class="songs-snippet">
      {lines.map((l, i) => {
        if (l.type === 'label') return <div key={i} class="songs-snip-label">{l.text}</div>;
        if (l.type === 'comment') return <div key={i} class="songs-snip-comment">{l.text}</div>;
        if (l.type === 'chords') {
          return (
            <div key={i} class="songs-snip-chordline">
              {l.chords.map((c, j) => (
                <b key={j} class="songs-snip-chord">
                  {label(c)}
                </b>
              ))}
            </div>
          );
        }
        const withChords = l.segments.some((g) => g.chord);
        return (
          <div key={i} class={withChords ? 'songs-snip-line has-chords' : 'songs-snip-line'}>
            {l.segments.map((g, j) => (
              <span key={j} class="songs-snip-seg">
                {withChords && <b class="songs-snip-chord">{g.chord ? label(g.chord) : ' '}</b>}
                <span class="songs-snip-text">{g.text || ' '}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** «Не нашёл песню?» — ссылки на поиск на других сайтах (только открыть) и ручная вставка. */
export function NotFoundCard({ q = '' }) {
  return (
    <Card class="songs-notfound">
      <p class="songs-notfound-text">
        <b>Не нашёл песню?</b> Открой её на любом сайте, выдели текст и поделись в Уке — или вставь вручную.
      </p>
      <div class="row row-wrap gap-2">
        {externalSearchLinks(q).map((l) => (
          <Button key={l.id} size="sm" icon={ExternalLink} href={l.url}>
            {l.name}
            <span class="sr-only"> — поиск в новой вкладке</span>
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={ClipboardPaste} href="/songs/import">
          Вставить вручную
        </Button>
      </div>
    </Card>
  );
}

/** Меню песни: тренировать, статус, избранное, оригинал, удаление с возвратом. */
function SongMenu({ id, lib, onClose }) {
  const song = id ? lib.list.find((s) => s.id === id) : null;
  const last = useRef(/** @type {any} */ (null));
  if (song) last.current = song;
  const s = song ?? last.current;
  if (!s) return null;

  const setStatus = (status) => {
    const prev = s.status;
    updateSong(s.id, { status });
    if (status === 'polished' && prev !== 'polished') toast('Ещё одна песня в репертуаре');
  };
  const remove = () => {
    const snap = getSong(s.id);
    onClose();
    if (!snap || !removeSong(s.id)) return;
    toast(`«${snap.title}» удалена`, { action: { label: 'Вернуть', onClick: () => restoreSong(snap) } });
  };
  const from = sourceLabel(s.source);

  return (
    <Sheet open={Boolean(song)} onClose={onClose} title={s.title}>
      <div class="stack songs-menu">
        <p class="muted small">{[s.artist, from].filter(Boolean).join(' · ')}</p>
        <Button variant="primary" size="lg" block icon={Dumbbell} href={`${songHref(s.id)}/train`}>
          Тренировать
        </Button>
        <div class="stack stack-sm">
          <span class="eyebrow">Статус</span>
          <Segmented label="Статус песни" value={s.status ?? 'new'} options={STATUS_OPTIONS} onChange={setStatus} />
        </div>
        <Toggle checked={Boolean(s.fav)} onChange={(fav) => updateSong(s.id, { fav })} label="В избранном" />
        <div class="divider" />
        <div class="row row-wrap songs-menu-foot">
          {s.source?.url && (
            <Button variant="ghost" size="sm" icon={ExternalLink} href={s.source.url}>
              Оригинал
            </Button>
          )}
          <span class="spacer" />
          <Button variant="ghost" size="sm" icon={Trash} class="songs-danger" onClick={remove}>
            Удалить
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// Отмена удаления: removeSong мягкий, а «вернуть» в state.js нет — та же запись снова через addSong (тот же id).
async function restoreSong(snap) {
  const { deleted, ...rest } = snap;
  try {
    await addSong(rest);
    toast('Песня снова в библиотеке');
  } catch (err) {
    console.warn('[uke] не удалось вернуть песню', err);
    toast('Не получилось вернуть песню');
  }
}

// ---------- «Найти» ----------

/**
 * Поиск по источникам: выдача приходит по мере ответа, у каждого источника свой статус и «Повторить».
 * @param {string} q
 * @param {boolean} online
 */
function useSourceSearch(q, online) {
  const [state, setState] = useState({ q: '', status: /** @type {Record<string, any>} */ ({}), hits: /** @type {any[]} */ ([]) });
  const ctrls = useRef(new Set());

  const abortAll = useCallback(() => {
    for (const c of ctrls.current) c.abort();
    ctrls.current.clear();
  }, []);

  const run = useCallback((query, ids) => {
    const ctrl = new AbortController();
    ctrls.current.add(ctrl);
    setState((st) => ({
      ...st,
      status: { ...st.status, ...Object.fromEntries(ids.map((id) => [id, { state: 'loading' }])) },
      hits: st.hits.filter((h) => !ids.includes(h.sourceId)),
    }));
    const apply = (fn) => {
      if (ctrl.signal.aborted) return;
      setState((st) => (st.q === query ? fn(st) : st));
    };
    searchSongs(query, {
      sources: ids,
      signal: ctrl.signal,
      onHits: (id, hits) =>
        apply((st) => ({
          ...st,
          status: { ...st.status, [id]: { state: 'done', count: hits.length } },
          hits: [...st.hits.filter((h) => h.sourceId !== id), ...hits],
        })),
      onError: (id, err) =>
        apply((st) => ({
          ...st,
          status: { ...st.status, [id]: { state: 'error', message: err?.message || 'ошибка', code: err?.code } },
        })),
    })
      .catch((err) => console.warn('[uke] поиск упал', err))
      .finally(() => {
        // Источник, который так ничего и не сообщил (пустой запрос после нормализации), — «0»
        apply((st) => {
          const status = { ...st.status };
          for (const id of ids) if (status[id]?.state === 'loading') status[id] = { state: 'done', count: 0 };
          return { ...st, status };
        });
        ctrls.current.delete(ctrl);
      });
  }, []);

  useEffect(() => {
    abortAll();
    setState({ q, status: {}, hits: [] });
    if (q && online) run(q, SOURCES.map((s) => s.id));
    return abortAll;
  }, [q, online]);

  const retry = (id) => {
    resetBreaker(id);
    if (state.q && online) run(state.q, [id]);
  };
  return { ...state, retry };
}

function Finder({ q, active, lib, onQuery }) {
  const online = useOnline();
  const [text, setText] = useState(q);
  const pushed = useRef(q);
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [recent, setRecent] = useState(readRecent);
  const [openKey, setOpenKey] = useState(/** @type {string|null} */ (null));

  // Назад/вперёд по истории меняет q в адресе — подхватываем
  useEffect(() => {
    if (q !== pushed.current) {
      pushed.current = q;
      setText(q);
    }
  }, [q]);

  // Набор → адрес (с задержкой); поиск идёт по q из адреса
  useEffect(() => {
    const v = text.trim();
    if (v === pushed.current) return undefined;
    const t = setTimeout(() => {
      pushed.current = v;
      onQuery(v);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (active && !q) inputRef.current?.focus({ preventScroll: true });
  }, [active]);

  const search = useSourceSearch(q, online);
  const found = search.hits.length > 0;

  useEffect(() => {
    if (!q || !found) return;
    setRecent((r) => {
      const next = pushRecent(r, q);
      writeRecent(next);
      return next;
    });
  }, [q, found]);

  const hitInfo = useMemo(() => {
    const m = new Map();
    for (const h of search.hits) m.set(h.id, songInfo(h.chords, lib.known, { notation: lib.notation }));
    return m;
  }, [search.hits, lib]);
  const groups = useMemo(
    () =>
      groupHits(search.hits, {
        rank: (h) => {
          const i = hitInfo.get(h.id);
          return !i || i.badge.kind === 'none' ? 99 : i.missing.length;
        },
      }),
    [search.hits, hitInfo],
  );
  const local = useMemo(() => matchLibrary(lib.list, q), [lib, q]);
  const openGroup = openKey ? groups.find((g) => g.key === openKey) ?? null : null;

  const commit = (v) => {
    const value = v.trim();
    setText(value);
    pushed.current = value;
    onQuery(value);
  };
  const onSubmit = (e) => {
    e.preventDefault();
    commit(text);
    inputRef.current?.blur();
  };
  const clear = () => {
    commit('');
    inputRef.current?.focus();
  };

  const statuses = SOURCES.map((s) => search.status[s.id]?.state);
  const loading = online && Boolean(q) && statuses.some((s) => !s || s === 'loading');

  return (
    <div class="stack songs-finder">
      <form class="songs-search" role="search" onSubmit={onSubmit}>
        <label class="sr-only" for="songs-search-input">
          Название песни или исполнитель
        </label>
        <Search class="songs-search-icon" size={20} aria-hidden="true" />
        <input
          id="songs-search-input"
          ref={inputRef}
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          placeholder="Песня или исполнитель"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        {text && (
          <span class="songs-search-clear">
            <IconButton icon={X} label="Очистить поиск" onClick={clear} />
          </span>
        )}
      </form>

      {!online && (
        <Card tone="warn" class="songs-offline">
          <WifiOff size={22} aria-hidden="true" />
          <p>
            <b>Нет сети.</b> Поиск по сайтам вернётся вместе с интернетом, а пока ищу в твоей библиотеке.
          </p>
        </Card>
      )}

      {online && q && (
        <div class="songs-sources" aria-live="polite">
          {SOURCES.map((s) => (
            <SourceStatus key={s.id} source={s} status={search.status[s.id]} onRetry={() => search.retry(s.id)} />
          ))}
        </div>
      )}

      {!q && (
        <FinderIntro
          recent={recent}
          onPick={commit}
          onForget={() => {
            setRecent([]);
            writeRecent([]);
          }}
        />
      )}

      {q && local.length > 0 && (
        <section class="stack stack-sm" aria-labelledby="songs-local-title">
          <h2 class="songs-section-title" id="songs-local-title">
            В библиотеке
          </h2>
          <ul class="songs-list">
            {local.map((s) => (
              <li key={s.id}>
                <SongRow song={s} info={lib.info(s)} known={lib.knownSet} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {q && online && (groups.length > 0 || loading) && (
        <section class="stack stack-sm" aria-labelledby="songs-web-title" aria-busy={loading ? 'true' : 'false'}>
          <h2 class="songs-section-title" id="songs-web-title">
            На сайтах{groups.length > 0 && <span class="songs-count nums">{groups.length}</span>}
          </h2>
          <ul class="songs-list">
            {groups.map((g) => (
              <li key={g.key}>
                <HitRow
                  group={g}
                  info={hitInfo.get(g.versions[0].id)}
                  saved={Boolean(findByUrl(lib.list, g.versions[0].url))}
                  known={lib.knownSet}
                  onOpen={() => setOpenKey(g.key)}
                />
              </li>
            ))}
            {loading && groups.length < 3 && [0, 1, 2].slice(groups.length).map((i) => <HitSkeleton key={`sk${i}`} />)}
          </ul>
        </section>
      )}

      {q && online && !loading && groups.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Ничего не нашлось"
          text="Попробуй только название — без исполнителя и лишних слов."
        />
      )}

      <NotFoundCard q={q} />

      <HitPreview group={openGroup} lib={lib} onClose={() => setOpenKey(null)} />
    </div>
  );
}

function FinderIntro({ recent, onPick, onForget }) {
  return (
    <div class="stack songs-intro">
      {recent.length > 0 && (
        <div class="stack stack-sm">
          <div class="row row-between">
            <span class="eyebrow">Недавно искал</span>
            <Button variant="ghost" size="sm" onClick={onForget}>
              Забыть
            </Button>
          </div>
          <div class="row row-wrap gap-2">
            {recent.map((r) => (
              <Chip key={r} icon={Clock} onClick={() => onPick(r)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div class="songs-intro-hint">
        <Search size={28} aria-hidden="true" />
        <p>
          Ищу на {SOURCES.map((s) => s.name).join(' и ')}. По аккордам сразу видно, хватит ли твоих — или стоит сдвинуть
          тональность.
        </p>
      </div>
    </div>
  );
}

function SourceStatus({ source, status, onRetry }) {
  const st = status?.state ?? 'loading';
  if (st === 'error') {
    return (
      <span class="songs-source">
        <Chip tone="danger" icon={WifiOff}>
          {source.name} · {status.message}
        </Chip>
        <Button variant="ghost" size="sm" icon={RotateCw} onClick={onRetry}>
          Повторить
        </Button>
      </span>
    );
  }
  if (st === 'done') {
    return (
      <Chip tone={status.count ? 'teal' : 'outline'} icon={status.count ? Check : undefined} class="songs-source">
        {source.name} · <span class="nums">{status.count}</span>
      </Chip>
    );
  }
  return (
    <Chip tone="outline" icon={<LoaderCircle class="songs-spin" size={16} aria-hidden="true" />} class="songs-source">
      {source.name} · ищу…
    </Chip>
  );
}

function HitRow({ group, info, saved, known, onOpen }) {
  const h = group.versions[0];
  const more = group.versions.length - 1;
  return (
    <button type="button" class="songs-row songs-hit" onClick={onOpen}>
      <span class="songs-row-head">
        <span class="songs-row-title">{h.title}</span>
      </span>
      <span class="songs-row-meta">{[h.artist, sourceName(h.sourceId)].filter(Boolean).join(' · ')}</span>
      <ChordChips chords={h.chords} known={known} />
      <span class="songs-row-foot">
        {info && <PlayBadge badge={info.badge} />}
        {info && <Stars n={info.stars} hint={info.bottleneck} />}
        {more > 0 && (
          <Chip tone="outline" class="songs-badge">
            +{countLabel(more, ['версия', 'версии', 'версий'])}
          </Chip>
        )}
        {saved && (
          <Chip class="songs-badge" icon={Check}>
            в библиотеке
          </Chip>
        )}
      </span>
    </button>
  );
}

function HitSkeleton() {
  return (
    <li class="songs-skel" aria-hidden="true">
      <span />
      <span />
      <span />
    </li>
  );
}

/** Превью найденной песни: аккорды, первые строки, «Сохранить». */
function HitPreview({ group, lib, onClose }) {
  const last = useRef(/** @type {any} */ (null));
  if (group) last.current = group;
  const g = group ?? last.current;
  const [vi, setVi] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef(/** @type {AbortController|null} */ (null));
  const hit = g ? g.versions[Math.min(vi, g.versions.length - 1)] : null;

  useEffect(() => {
    setVi(0);
  }, [group?.key]);
  useEffect(() => {
    setError('');
  }, [hit?.id]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const parsed = useMemo(() => {
    if (!hit?.rawText) return null;
    try {
      return parseSong(hit.rawText, { title: hit.title, artist: hit.artist });
    } catch {
      return null;
    }
  }, [hit]);

  if (!g || !hit) return null;

  const info = songInfo(hit.chords, lib.known, { notation: lib.notation });
  const lines = snippetLines(parsed, 8);
  const saved = findByUrl(lib.list, hit.url);
  const knownSet = lib.knownSet.size ? lib.knownSet : null;

  const close = () => {
    ctrl.current?.abort();
    setSaving(false);
    onClose();
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const c = new AbortController();
    ctrl.current = c;
    try {
      const loaded = await loadSong(hit, { signal: c.signal });
      if (c.signal.aborted) return;
      const dupe = findByUrl(songs.value, loaded.source?.url || hit.url);
      const id = dupe ? dupe.id : await addSong({ ...loaded, source: loaded.source });
      toast(dupe ? 'Эта песня уже в библиотеке' : savedMessage(songInfo(loaded.chords, knownChordNames.value).badge));
      navigate(songHref(id));
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err?.message || 'что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <Sheet open={Boolean(group)} onClose={close} title={hit.title}>
      <div class="stack songs-preview">
        <p class="muted small">{[hit.artist, sourceName(hit.sourceId)].filter(Boolean).join(' · ')}</p>

        {g.versions.length > 1 && (
          <div class="scroll-x songs-versions" role="group" aria-label="Версии песни">
            {g.versions.map((v, i) => (
              <Chip key={v.id} active={i === vi} onClick={() => setVi(i)}>
                {sourceName(v.sourceId)}
                {v.chords?.length ? ` · ${v.chords.slice(0, 3).map((c) => chordLabel(c, { notation: lib.notation })).join(' ')}` : ''}
              </Chip>
            ))}
          </div>
        )}

        <div class="row row-wrap gap-2">
          <PlayBadge badge={info.badge} />
          <Stars n={info.stars} hint={info.bottleneck} />
          {info.bottleneck && <span class="xsmall faint">{info.bottleneck}</span>}
        </div>

        {hit.chords?.length > 0 && (
          <div class="scroll-x songs-diagrams">
            {hit.chords.map((c) => (
              <ChordDiagram key={c} name={c} size="sm" sound dim={knownSet ? !isKnownChord(c, knownSet) : false} />
            ))}
          </div>
        )}

        {lines.length > 0 ? (
          <SongSnippet lines={lines} notation={lib.notation} />
        ) : (
          <p class="muted small">Текст покажу после сохранения.</p>
        )}

        {error && (
          <p class="songs-error" role="alert">
            Не получилось сохранить: {error}
          </p>
        )}

        <div class="stack stack-sm songs-sheet-actions">
          {saved ? (
            <>
              <p class="songs-saved">
                <Check size={18} aria-hidden="true" /> Уже в библиотеке
              </p>
              <Button variant="primary" size="lg" block icon={Play} href={songHref(saved.id)}>
                Открыть
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              icon={saving ? <LoaderCircle class="songs-spin" size={22} aria-hidden="true" /> : BookmarkPlus}
              disabled={saving}
              aria-busy={saving ? 'true' : undefined}
              onClick={save}
            >
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          )}
          {hit.url && (
            <Button variant="ghost" block icon={ExternalLink} href={hit.url}>
              Открыть на сайте
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
