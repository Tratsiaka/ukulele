import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, Circle, Dumbbell, ListMusic, Search, Sparkles, X } from 'lucide-preact';
import { Button, Card, ChordDiagram, EmptyState, IconButton, Page, ProgressRing, Sheet, Toggle, toast } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { shapeText } from '../ui/chord-layout.js';
import { knownChordNames, progress, setChordKnown, settings, songs, today } from '../state.js';
import { Link, back, navigate, withQuery } from '../app/router.js';
import { chordDifficulty, getShapes } from '../core/shapes.js';
import { levelOfChord } from '../core/curriculum.js';
import { chordLabel, countLabel } from '../lib/format.js';
import { fingerHints } from '../exercises/drill-helpers.js';
import {
  chordGain, chordGroups, chordSongs, difficultyInfo, knownMilestone, knownSinceText, knownTitle, nextChordSuggestion, normalizeQuery,
  partnerFor, pathChords, searchChords, shapeCaption,
} from './tools-helpers.js';
import './tools.css';

const REST_PREVIEW = 8;
const SONGS_PREVIEW = 5;
const POP_MS = 700;
const SONG_FORMS = /** @type {[string, string, string]} */ (['песня', 'песни', 'песен']);
const STATUS_LABEL = { new: 'новая', learning: 'учу', playing: 'играю', polished: 'готова' };

const chordHref = (name) => `/chords/${encodeURIComponent(name)}`;

/**
 * Вкладка «Аккорды» (/chords, /chords/:name): сколько аккордов знаешь, следующий полезный аккорд, поиск,
 * группы по учебному пути и «Остальные»; у каждого — диаграмма со звуком и отметка «знаю».
 * /chords/:name открывает шторку с подробностями.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Chords({ params, query }) {
  const notation = settings.value.notation;
  const known = knownChordNames.value;
  const library = songs.value;
  const knownSet = useMemo(() => new Set(known), [known]);
  const [q, setQ] = useState(query?.q ?? '');
  const [showRest, setShowRest] = useState(false);
  const [pop, setPop] = useState(/** @type {string|null} */ (null));
  const popTimer = useRef(0);
  const openedHere = useRef(false);
  useEffect(() => () => clearTimeout(popTimer.current), []);

  const groups = useMemo(() => chordGroups(known), [known]);
  const results = useMemo(() => searchChords(q, { german: notation === 'H' }), [q, notation]);
  const next = useMemo(() => nextChordSuggestion(library, known), [library, known]);
  const path = useMemo(() => pathChords(), []);
  const pathKnown = path.filter((c) => knownSet.has(c)).length;

  // Шторка: имя из маршрута; пока закрывается — держим последнее, чтобы содержимое не пропало раньше анимации.
  const routeName = params?.name ? (normalizeQuery(params.name)?.name ?? params.name) : null;
  const lastName = useRef(routeName);
  if (routeName) lastName.current = routeName;
  const sheetName = routeName ?? lastName.current;

  const open = (name) => {
    openedHere.current = true;
    navigate(chordHref(name), { scroll: false });
  };
  const close = () => {
    // Открыли отсюда — просто назад по истории (кнопка «назад» на Android не вернёт шторку); по ссылке — на список.
    if (openedHere.current) {
      openedHere.current = false;
      back('/chords');
    } else {
      navigate('/chords', { scroll: false, replace: true });
    }
  };

  const toggle = (name, on) => {
    const label = chordLabel(name, { notation });
    const before = knownChordNames.value;
    if (on) {
      const gain = chordGain(name, songs.value, before);
      setChordKnown(name, true);
      const milestone = knownMilestone(before.length + 1);
      let msg = `${label} в копилке`;
      if (milestone) msg = `${label} в копилке. ${milestone}`;
      else if (gain > 0) msg = `${label} в копилке — открылось ещё ${countLabel(gain, SONG_FORMS)}`;
      toast(msg);
      clearTimeout(popTimer.current);
      setPop(name);
      popTimer.current = setTimeout(() => setPop(null), POP_MS);
    } else {
      setChordKnown(name, false);
      toast(`${label} убран из знакомых`, { action: { label: 'Вернуть', onClick: () => setChordKnown(name, true) } });
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (results?.length) open(results[0]);
  };

  const card = (name) => (
    <ChordCard
      key={name}
      name={name}
      known={knownSet.has(name)}
      pop={pop === name}
      notation={notation}
      onToggle={toggle}
      onOpen={open}
    />
  );

  return (
    <Page title="Аккорды" wide>
      <div class="chd-top">
        <section class="card chd-hero">
          <ProgressRing
            value={path.length ? pathKnown / path.length : 0}
            size={68}
            tone="teal"
            label={`Аккорды пути: ${pathKnown} из ${path.length}`}
          >
            <span class="chd-hero-num nums" key={known.length}>
              {known.length}
            </span>
          </ProgressRing>
          <div class="chd-hero-text">
            <h2 class="chd-hero-title">{knownTitle(known.length)}</h2>
            <p class="small muted">
              {known.length
                ? `Из учебного пути — ${pathKnown} из ${path.length}`
                : 'Отмечай «знаю» — и песни подстроятся под твои аккорды'}
            </p>
          </div>
        </section>

        {next && (
          <Card class="chd-next" tone="accent" onClick={() => open(next.chord)} label={`Следующий аккорд: ${chordLabel(next.chord, { notation })}`}>
            <span class="chd-next-chord chord-name" aria-hidden="true">
              {chordLabel(next.chord, { notation })}
            </span>
            <span class="chd-next-text">
              <span class="eyebrow">Следующий</span>
              <span class="chd-next-gain">
                {next.gain > 0 ? `откроет ещё ${countLabel(next.gain, SONG_FORMS)}` : 'следующий по словарю'}
              </span>
            </span>
            <ChevronRight size={20} aria-hidden="true" class="chd-next-arrow" />
          </Card>
        )}
      </div>

      <form class="chd-search" role="search" onSubmit={onSubmit}>
        <label class="sr-only" for="chd-search-input">
          Найти аккорд
        </label>
        <Search class="chd-search-icon" size={20} aria-hidden="true" />
        <input
          id="chd-search-input"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          placeholder="Найти аккорд: Am, F#m, C7…"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        {q && (
          <span class="chd-search-clear">
            <IconButton icon={X} label="Очистить поиск" onClick={() => setQ('')} />
          </span>
        )}
      </form>

      {results ? (
        results.length ? (
          <section class="chd-group" aria-label="Найденные аккорды">
            <header class="chd-group-head">
              <h2 class="chd-group-title">
                Нашлось: {results.length}
              </h2>
            </header>
            <div class="chd-grid">{results.map(card)}</div>
          </section>
        ) : (
          <EmptyState
            icon={Search}
            title="Такого аккорда нет в словаре"
            text="Попробуй проще: Am7, F#m, Bb. Слэш-аккорды ищи без баса: C/G → C."
            action={{ label: 'Сбросить поиск', onClick: () => setQ('') }}
          />
        )
      ) : (
        groups.map((g) => {
          const rest = g.id === 'rest';
          const list = rest && !showRest ? g.chords.slice(0, REST_PREVIEW) : g.chords;
          const done = !rest && g.known === g.chords.length;
          return (
            <section key={g.id} class="chd-group" aria-labelledby={`chd-g-${g.id}`}>
              <header class="chd-group-head">
                <div class="chd-group-titles">
                  <h2 class="chd-group-title" id={`chd-g-${g.id}`}>
                    {g.title}
                  </h2>
                  <p class="chd-group-hint">{g.hint}</p>
                </div>
                {!rest && (
                  <span class={cx('chd-group-count nums', done && 'is-done')}>
                    {done && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                    {g.known} из {g.chords.length}
                  </span>
                )}
              </header>
              {!rest && (
                <div class="chd-bar" aria-hidden="true">
                  <span style={{ width: `${(g.known / g.chords.length) * 100}%` }} />
                </div>
              )}
              <div class="chd-grid">{list.map(card)}</div>
              {rest && g.chords.length > REST_PREVIEW && (
                <Button variant="ghost" icon={ChevronDown} class={cx('chd-more-btn', showRest && 'is-open')} onClick={() => setShowRest((v) => !v)}>
                  {showRest ? 'Свернуть' : `Показать все ${g.chords.length}`}
                </Button>
              )}
            </section>
          );
        })
      )}

      <Sheet open={Boolean(routeName)} onClose={close} title={sheetName ? `Аккорд ${chordLabel(sheetName, { notation })}` : ''}>
        {sheetName && (
          <ChordDetail
            key={sheetName}
            name={sheetName}
            known={knownSet.has(sheetName)}
            knownNames={known}
            library={library}
            notation={notation}
            onToggle={toggle}
          />
        )}
      </Sheet>
    </Page>
  );
}

/** Карточка словаря: диаграмма (звук по нажатию), «знаю» и «подробнее». */
function ChordCard({ name, known, pop, notation, onToggle, onOpen }) {
  const label = chordLabel(name, { notation });
  return (
    <div class={cx('chd-card', known && 'is-known', pop && 'is-pop')}>
      <ChordDiagram name={name} size="md" sound />
      <div class="chd-card-row">
        <button
          type="button"
          class="chd-know"
          aria-pressed={known ? 'true' : 'false'}
          aria-label={`Знаю ${label}`}
          onClick={() => onToggle(name, !known)}
        >
          {known ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
          <span>Знаю</span>
        </button>
        <IconButton icon={ChevronRight} label={`${label}: подробнее`} class="chd-open" onClick={() => onOpen(name)} />
      </div>
    </div>
  );
}

/** Подробности аккорда в шторке. */
function ChordDetail({ name, known, knownNames, library, notation, onToggle }) {
  const shapes = getShapes(name);
  const [variant, setVariant] = useState(0);
  const [allSongs, setAllSongs] = useState(false);
  const label = chordLabel(name, { notation });

  if (!shapes.length) {
    return (
      <EmptyState
        icon={Search}
        title={`Не знаю аккорд «${name}»`}
        text="Проверь название или найди его поиском в словаре."
      />
    );
  }

  const shape = shapes[variant] ?? shapes[0];
  const diff = difficultyInfo(chordDifficulty(name));
  const level = levelOfChord(name);
  const hints = fingerHints(shape);
  const gain = known ? 0 : chordGain(name, library, knownNames);
  const used = chordSongs(name, library);
  const shownSongs = allSongs ? used : used.slice(0, SONGS_PREVIEW);
  const partner = partnerFor(name, { known: knownNames, songs: library });
  const since = progress.value.knownChords[name]?.since;

  return (
    <div class="chd-detail">
      <div class="chd-detail-top">
        <ChordDiagram name={name} shape={shape} size="lg" sound />
        <div class="chd-detail-meta">
          <div class="chd-diff" role="img" aria-label={`Сложность: ${diff.label}`}>
            <span class="chd-diff-dots" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} class={cx('chd-diff-dot', i <= diff.dots && 'is-on')} />
              ))}
            </span>
            <span class="small muted">{diff.label}</span>
          </div>
          {level && (
            <p class="small muted">
              Уровень {level.id.slice(1)} · {level.title}
            </p>
          )}
          <p class="xsmall faint">Нажми на схему — услышишь, как звучит.</p>
        </div>
      </div>

      <Toggle
        class="chd-detail-toggle"
        checked={known}
        onChange={(v) => onToggle(name, v)}
        label="Я знаю этот аккорд"
        hint={known && since ? knownSinceText(since, today.value) : 'отмечай, когда звенит каждая струна'}
      />

      {!known && gain > 0 && (
        <p class="chd-gain">
          <Sparkles size={18} aria-hidden="true" />
          <span>
            Выучишь — откроется ещё <b>{countLabel(gain, SONG_FORMS)}</b> из твоей библиотеки
          </span>
        </p>
      )}

      {shape.sub && (
        <p class="chd-note">
          Это {chordLabel(shape.sub, { notation })} — звучит почти как {label}, а пальцам проще.
        </p>
      )}

      <section class="stack stack-sm" aria-label="Как ставить пальцы">
        <h3 class="chd-h3">Как ставить</h3>
        <ol class="chd-hints">
          {hints.map((h) => (
            <li key={`${h.finger}-${h.text}`}>
              <span class={cx('chd-finger', !h.finger && 'is-open')} aria-hidden="true">
                {h.finger || '○'}
              </span>
              <span>
                <b>{h.title}</b>
                {h.finger ? ' палец — ' : ': '}
                {h.text}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {shapes.length > 1 && (
        <section class="stack stack-sm" aria-label="Варианты аппликатуры">
          <h3 class="chd-h3">Варианты</h3>
          <div class="scroll-x chd-variants" role="group">
            {shapes.map((s, i) => {
              const caption = shapeCaption(s, i);
              return (
                <button
                  key={`${i}-${shapeText(s)}`}
                  type="button"
                  class="chd-variant"
                  aria-pressed={i === variant ? 'true' : 'false'}
                  aria-label={`${caption}: ${shapeText(s)}`}
                  onClick={() => setVariant(i)}
                >
                  <ChordDiagram name={name} shape={s} size="sm" showName={false} />
                  <span class="chd-variant-cap">{caption}</span>
                  <span class="chd-variant-code mono">{shapeText(s)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section class="stack stack-sm" aria-label="Песни с этим аккордом">
        <h3 class="chd-h3">В твоих песнях</h3>
        {used.length ? (
          <>
            <ul class="chd-songs">
              {shownSongs.map((s) => (
                <li key={s.id}>
                  <Link href={`/song/${encodeURIComponent(s.id)}`} class="chd-song">
                    <ListMusic size={18} aria-hidden="true" class="chd-song-icon" />
                    <span class="chd-song-text">
                      <span class="chd-song-title">{s.title}</span>
                      {s.artist && <span class="chd-song-artist">{s.artist}</span>}
                    </span>
                    {STATUS_LABEL[s.status] && s.status !== 'new' && (
                      <span class="chd-song-status">{STATUS_LABEL[s.status]}</span>
                    )}
                    <ChevronRight size={18} aria-hidden="true" class="chd-song-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
            {used.length > SONGS_PREVIEW && (
              <Button variant="ghost" size="sm" onClick={() => setAllSongs((v) => !v)}>
                {allSongs ? 'Свернуть' : `Ещё ${used.length - SONGS_PREVIEW}`}
              </Button>
            )}
          </>
        ) : (
          <p class="small muted">
            Пока ни одной. <Link href={withQuery('/songs', { tab: 'find' })}>Найди песню</Link> — аккорды подтянутся сами.
          </p>
        )}
      </section>

      <div class="chd-omc">
        <Button variant="primary" size="lg" block icon={Dumbbell} href={withQuery('/tools/omc', { a: name, b: partner })}>
          Потренировать смену
        </Button>
        <p class="xsmall faint center">
          {label} ⇄ {chordLabel(partner, { notation })} — частая пара, одна минута
        </p>
      </div>
    </div>
  );
}
