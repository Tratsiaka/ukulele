# Архитектура и контракты модулей

Документ для разработки: что где лежит, кто за какой файл отвечает и какие функции экспортирует каждый модуль.
Контракт обязателен: другие модули пишутся против него параллельно. Менять сигнатуры можно только согласованно.
Продуктовый план — `PLAN.md`, исследование — `research/`.

## Принципы продукта

- Цель — сформировать навык и **ежедневную привычку**. Интерес и удобство важнее музыкальной точности.
- Два равных входа: **«Учиться»** (путь по уровням) и **«Тренировать песню»** (любая песня → аккорды → смены → бой → игра).
- Телефон Android в первую очередь (ширина 360–430 px, одна рука, большой палец). Десктоп от 840 px — боковая панель и две колонки.
- Самооценка вместо микрофона. Микрофон нужен только тюнеру.
- Укулеле владельца — тенор, строй GCEA. Тюнер принимает струну G в обеих октавах (high-G и low-G).
- Интерфейс по-русски, на «ты», коротко и дружелюбно, без канцелярита и без восклицательных знаков на каждом шагу.
- Всё, кроме поиска песен в сети, работает офлайн. Во время работы никаких CDN: всё отдаётся с GitHub Pages.

## Стек и сборка

- Preact 11.2.0 + @preact/signals 2.11.4, JSX (automatic, `jsxImportSource: preact`), ES-модули.
- esbuild 0.28.2 вызывается из `build.py`: `src/main.jsx` → `docs/assets/app.js` + `app.css`. CSS импортируется прямо из JSX/JS
  (`import './x.css'`), esbuild собирает его в `app.css`.
- idb 8.0.4 (IndexedDB), pitchy 4.1.0 (тюнер), lucide-preact 1.73.0 (иконки, импорт по имени: `import { Music } from 'lucide-preact'`).
- Тесты: `npm test` = `node --test "tests/**/*.test.js"`; fast-check для проверки свойств, linkedom — DOM в тестах.
- Бюджет: `app.js` ≤ 180 КБ gzip (около трети — уроки и стартовые песни; после первой загрузки всё в кеше service worker).
- Маршрутизация через hash (`#/songs`), все пути относительные: приложение живёт по адресу `…github.io/ukulele/`.
- Хранилище: IndexedDB `uke`; localStorage только с префиксом `uke:` (на этом origin есть другое приложение).
- Лицензии зависимостей — MIT/ISC/Apache. GPL/AGPL в бандл не берём.

Проверка своего кода без полной сборки (не запускай `build.py` параллельно с другими — он удаляет `docs/`):

```bash
node_modules/.bin/esbuild <твой-файл> --bundle --format=esm --jsx=automatic --jsx-import-source=preact --loader:.json=json --outfile=<scratch>/check.js
```

## Раскладка и владельцы файлов

| Путь | Что | Владелец |
|---|---|---|
| `src/core/chord.js` | модель аккорда (готово) | — |
| `src/core/song.js` | разбор песен, ChordPro, транспонирование | song |
| `src/core/shapes.js`, `src/data/chords.json`, `tools/gen-chords.mjs` | аппликатуры укулеле, сложность | shapes |
| `src/core/playable.js` | «играбельно моими аккордами», лёгкая тональность, сложность песни | shapes |
| `src/core/curriculum.js` | уровни, уроки, бои | learn |
| `src/core/practice.js` | план занятия, Лейтнер, серия | learn |
| `src/data/store.js`, `src/state.js` | IndexedDB и реактивное состояние | learn |
| `src/lib/ics.js` | файл напоминания для календаря | learn |
| `src/sources/*.js` | поиск и загрузка песен, LRCLIB, iTunes | sources |
| `src/data/starter-songs.js` | стартовый набор из общественного достояния | sources |
| `src/audio/*.js`, `src/lib/device.js` | звук, метроном, тюнер, Wake Lock, вибрация | audio |
| `src/main.jsx`, `src/index.tpl.html`, `src/sw.tpl.js`, `src/static/**`, `src/styles/**`, `src/app/**`, `src/ui/**`, `src/lib/format.js` | оболочка, дизайн-система, PWA | shell |
| `src/exercises/**` | упражнения и общие блоки экранов (волна 2) | exercises-* |
| `src/screens/**` | экраны (волна 2; на волне 1 shell кладёт заглушки) | screens-* |
| `tests/<area>/**` | тесты своей области | владелец области |

Чужие файлы не редактировать. Если контракт неудобен или неполон — допиши недостающее у себя и сообщи об этом в итоге.

## Контракты

Все имена аккордов в данных — **нормализованные** строки (`normalizeChordName` из `core/chord.js`): `C`, `Am`, `G7`, `Bb`, `F#m`, `C/G`.

### core/chord.js (готово)

`parseChord(str, {german?}) → Chord|null`, `formatChord(chord, {preferFlats?, german?})`, `transposeChord(chord, n)`,
`normalizeChordName(str, {german?, preferFlats?}) → string|null`, `isChordToken(str, {german?})`, `chordId(chord) → 'root:quality'`,
`normalizeChordText(str)`, `noteName(pc, preferFlats?)`, `preferFlatsForKey(rootPc, isMinor)`,
`QUALITIES`, `QUALITY_SUFFIX`, `QUALITY_FAMILY` (`maj` | `min` | `dom7`), `SHARP`, `FLAT`.
`Chord = {root: 0–11, quality, bass: 0–11|null, raw, alt?}`.

### core/song.js (song)

```js
/** @typedef {{chord: string|null, text: string}} Segment   // chord — нормализованное имя; text — слог/кусок строки после аккорда
/** @typedef {{type:'lyrics', segments: Segment[]} | {type:'chords', chords: string[]} | {type:'comment', text: string}
 *          | {type:'tab', lines: string[]} | {type:'empty'}} Line
 *   'lyrics' — строка текста с аккордами внутри; 'chords' — строка только из аккордов (вступление, проигрыш)
/** @typedef {{label: string|null, kind: 'verse'|'chorus'|'bridge'|'intro'|'outro'|'other', lines: Line[]}} Section
/** @typedef {{title: string, artist: string, key?: string, capo?: number, bpm?: number, strum?: string,
 *             german?: boolean, sections: Section[]}} Song
```

- `parseSong(text, {title?, artist?}) → Song` — сам определяет формат: ChordPro (`{title: …}`, `[Am]` внутри строк), разметка
  Ultimate Guitar (`[ch]Am[/ch]`, `[tab]…[/tab]`, `[Verse 1]`) или «аккорды над строками». Всё из раздела «Нормализация» в `PLAN.md`:
  заголовки секций по-русски и по-английски («Куплет», «Припев», «Проигрыш», «Вступление», «Бридж», `Chorus:`, `[Verse]`),
  повторы (`x2`, `4 раза`) → `comment`, каподастр → `capo`, строки боя (`Бой: ↓↓↑`) → `strum` + `comment`,
  6-струнные табы прячутся, 4-струнные табы укулеле → `tab`, наличие H → `german: true` для всей песни.
- `parseChordPro(text) → Song`, `parseChordsOverLyrics(text) → Song`.
- `toChordPro(song) → string` (в песне хранится ChordPro; `parseSong(toChordPro(s))` ≡ `s`).
- `songChords(song) → string[]` — уникальные аккорды в порядке появления.
- `transposeSong(song, semitones, {preferFlats?}) → Song` — новый объект; бемоли/диезы по получившейся тональности.
- `songPairs(song) → Array<{a, b, count}>` — смены между соседними разными аккордами, пара без учёта порядка, по убыванию.
- `guessKey(song) → {root, minor, name}`.
- `isChordLine(line) → boolean`.

### core/shapes.js (shapes)

```js
/** @typedef {{frets: number[], fingers: number[], barre: {fret:number, from:number, to:number}|null,
 *             baseFret: number, tag?: 'beginner'|'alt', difficulty: number}} Shape
 * frets — 4 числа в порядке струн G C E A (4-я → 1-я), абсолютные лады; -1 — не звучит, 0 — открытая.
 * fingers — 0 нет пальца, 1 указательный … 4 мизинец. barre.from/to — индексы струн 0..3. baseFret — первый лад на диаграмме.
```

- `getShapes(nameOrChord) → Shape[]` — `[0]` рекомендуемая для новичка; бас слэш-аккорда игнорируется; неизвестно → `[]`.
- `getShape(nameOrChord) → Shape|null`.
- `chordDifficulty(nameOrChord) → number` — по аппликатуре: пальцы + 2·баррэ + 1, если не первая позиция, + max(0, разброс ладов − 1);
  `Infinity`, если аппликатуры нет. Ориентир: Am7 0; Am, C, A7 1; F, A 2; G, Dm, E7 3; Bb, E ≥5.
- `TUNINGS = {gcea: {name, midi: [67,60,64,69]}, lowg: {name, midi: [55,60,64,69]}}`.
- `shapeMidi(shape, tuningId = 'gcea') → (number|null)[]`.
- `DICTIONARY_ORDER: string[]` — порядок словаря: C, Am, F, G, Dm, Em, E7, A7, D, A, G7, C7, D7, Bb, Gm, Bm, B7, F#m, E, Cm, Fm, Eb, Ab, C#m, …
- `listChordNames() → string[]` — все аккорды с аппликатурами.
- Учебные аппликатуры: C 0003, Am 2000, F 2010, G 0232, Dm 2210, Em 0432 (+ alt Em7 0202), E7 1202, A7 0100, D 2220, A 2100,
  D7 2020 (учебная) и 2223, G7 0212, C7 0001, Bb 3211, Gm 0231, Bm 4222, B7 2322, F#m 2120, E 1402 / 4442.

### core/playable.js (shapes)

- `simplifyName(name) → string` — лестница: maj7/6/6/9/sus2/sus4/add9/5/aug → мажор; 9/11/13/7sus4/7b9… → 7; m7/m6/m9/madd9/mmaj7 → m;
  m7b5 → dim; бас отбрасывается.
- `songMasks(names) → {maj, min, dom7}` и `knownMasks(names)` — 12-битные маски по корням после упрощения.
- Аккорд играбелен, если известен тот же корень и семейство; 7-аккорд можно играть как мажор; мажор E и B можно заменить на E7 и B7.
- `playableAt(songMask, knownMask, shift) → boolean`.
- `bestKey(names, knownNames, {maxShift = 5}) → {shift, missing: string[], playable: boolean}` — сдвиг с наименьшим числом незнакомых
  аккордов; при равенстве — меньший |shift|, затем меньшая суммарная сложность. `shift` — на сколько полутонов транспонировать.
- `nextChordGains(songChordLists, knownNames, candidates = DICTIONARY_ORDER) → Array<{chord, gain}>` — сколько песен станут играбельны
  (со сдвигом в пределах ±5), если выучить этот аккорд; по убыванию.
- `songDifficulty(names, {bpm?}) → {stars: 1–5, score, bottleneck: string}` — «Bb; 6 аккордов».

### core/curriculum.js (learn)

```js
/** @typedef {{id: string, title: string, subtitle: string, chords: string[], strum: string /* id боя */, bpm: [number, number],
 *             goals: string[], lessons: string[]}} Level          // chords — новые аккорды уровня
/** @typedef {{id: string, levelId: string, title: string, minutes: number, steps: Step[]}} Lesson
/** @typedef {{type:'text', title?: string, body: string} | {type:'tuner'} | {type:'chord', chord: string, tip?: string}
 *          | {type:'quiz', chords: string[]} | {type:'omc', pair: [string, string], target: number}
 *          | {type:'strum', pattern: string, bpm: number, chords?: string[]} | {type:'song', songId: string, speed?: number}} Step
/** @typedef {{id: string, name: string, slots: string, beats: number, swing?: boolean, level: string, hint: string}} StrumPattern
 * slots — по одному символу на восьмую: D вниз, U вверх, X глушение (chuck), - пропуск. 4/4 → 8 символов, 3/4 → 6.
```

- `LEVELS: Level[]` — L0–L6 из `PLAN.md` (раздел 2). Уроки с содержимым — для L0–L3, у L4–L6 уровни с целями и 1–2 урока.
- `LESSONS: Record<string, Lesson>`, `levelById(id)`, `lessonById(id)`, `knownChordsAfter(levelId) → string[]`.
- `STRUM_PATTERNS: StrumPattern[]` с id: `quarters` `D-D-D-D-`, `du` `D-DUD-DU`, `island` `D-DU-UDU`, `eighths` `DUDUDUDU`,
  `waltz` `D-DUDU` (3/4), `chuck` `D-XUD-XU`, `shuffle` (как `du`, swing).
- `nextLesson(progress) → Lesson|null`, `currentLevel(progress) → Level`.
- Песни в уроках — по id стартового набора (список ниже).

### core/practice.js (learn)

```js
/** @typedef {{type: 'tuner'|'warmup'|'new'|'omc'|'strum'|'song', title: string, seconds: number, payload: object}} Block
 * payload: tuner {}; warmup {chords}; new {chord?, lessonId?}; omc {pairs: [a, b][], seconds: 60}; strum {patternId, bpm, chords};
 *          song {songId, speed}
/** @typedef {{minutes: 5|10|18, blocks: Block[]}} PlanSession
```

- `buildSession(progress, songs, {minutes, today}) → PlanSession` — 5 мин: тюнер, 2 пары OMC, песня; 10 мин: + разминка и бой;
  18 мин: полный шаблон из `PLAN.md`. Пары и аккорды — по сроку Лейтнера и слабым результатам. Песня — из «Играю сейчас» или
  ближайшая играбельная.
- `practiceDay(date = new Date()) → 'YYYY-MM-DD'` — день начинается в 04:00 по местному времени.
- `leitner(box, success) → {box, days}` — интервалы 1, 3, 7, 14, 30 дней.
- `streak(days: string[], today: string, {freezesPerWeek = 1}) → {current, best, doneToday, frozen: string[]}`.
- `pairKey(a, b) → 'A|B'` (отсортированная пара), `weakPairs(progress, knownNames, n) → [a, b][]`.

### data/store.js и state.js (learn)

IndexedDB `uke` v1: хранилище `songs` (keyPath `id`, индекс `updatedAt`) и `kv` (keyPath `k`: `settings`, `progress`).

```js
/** @typedef {{id: string, title: string, artist: string, lang?: string,
 *   source: {site: 'starter'|'akkords'|'dieza'|'paste'|'file'|string, url?: string, fetchedAt?: number},
 *   text: string /* ChordPro */, rawText?: string, chords: string[], level?: string,
 *   status: 'new'|'learning'|'playing'|'polished', fav: boolean,
 *   prefs: {transpose: number, fontSize: number, speed: number /* 1–10 */, simplify: boolean},
 *   trainer: {chords: boolean, changes: boolean, strum: boolean, play: boolean, plays: number},
 *   strum?: string, bpm?: number, preview?: {url, artwork, link},
 *   createdAt: number, updatedAt: number, lastPlayedAt?: number}} SongRecord
/** @typedef {{theme: 'auto'|'light'|'dark', tuning: 'gcea'|'lowg', leftHanded: boolean, sessionMinutes: 5|10|18,
 *   weeklyGoalMin: number, sound: boolean, notation: 'B'|'H'}} Settings
/** @typedef {{knownChords: Record<string, {since: string, box: number, due: string}>,
 *   pairs: Record<string, {best: number, last: number, history: {day: string, count: number}[], box: number, due: string}>,
 *   strum: Record<string, {bestBpm: number, history: {day: string, bpm: number}[]}>,
 *   lessonsDone: Record<string, string>, practice: Record<string, {seconds: number, sessions: number}>,
 *   streakBest: number, onboarded: boolean, lastSongId?: string}} Progress
```

`state.js` (сигналы `@preact/signals`, запись в IndexedDB с задержкой ~300 мс):

- сигналы: `ready`, `settings`, `progress`, `songs` (без удалённых, по `updatedAt` desc); computed: `knownChordNames`, `todayStats`
  (`{seconds, doneToday, streak}`).
- `initState()` — загрузка; при первом запуске добавляет стартовый набор (`STARTER_SONGS`), повторно не добавляет.
- `setSetting(key, value)`, `setChordKnown(name, known)`, `recordOmc(a, b, count)`, `recordStrum(patternId, bpm)`,
  `logPractice(seconds)`, `completeLesson(id)`, `markOnboarded()`.
- `addSong(partial) → Promise<id>` — дозаполняет поля, считает `chords` через `parseSong`/`songChords`; `updateSong(id, patch)`,
  `removeSong(id)`, `getSong(id) → SongRecord|undefined`.
- `exportData() → string` (JSON `{app: 'uke', v: 1, exportedAt, settings, progress, songs}`), `importData(json)`.

### lib/ics.js (learn)

`dailyReminderIcs({hour, minute, title, url}) → string` и `downloadIcs(text, filename)`.

### sources (sources)

```js
/** @typedef {{id: string, sourceId: string, title: string, artist: string, url: string, chords?: string[]}} SearchHit
```

- `SOURCES: Array<{id, name, site, langs: string[], note}>` — в MVP `akkords` (akkords.pro) и `dieza` (dieza.net), оба WP REST с CORS.
- `searchSongs(query, {onHits(sourceId, hits), onError(sourceId, err), signal}) → Promise<void>` — запросы к источникам параллельно,
  результаты по мере прихода. Один запрос `/wp-json/wp/v2/posts?search=…&_fields=id,title,link,content` сразу даёт аккорды для
  бейджей. Таймаут 12 с, после 3 сбоев подряд источник пропускается 24 ч (localStorage `uke:breaker`).
- `loadSong(hit, {signal}) → {title, artist, text /* ChordPro */, rawText, chords, lang, source: {site, url, fetchedAt}}`.
- `findLyrics({artist, title, durationSec?}, {signal}) → {plain, synced}|null` — LRCLIB (`/api/get`, `/api/search`), заголовок
  `Lrclib-Client`.
- `findPreview({artist, title}, {signal}) → {previewUrl, artworkUrl, trackUrl, durationMs}|null` — iTunes Search, `country=by`.
- `detectLang(text) → 'ru'|'be'|'uk'|'en'|'other'`, `searchKey(s)` — ё→е, і→и, ў→у, без пунктуации, `(OST)`, `feat.`.
- Файлы: `sources/index.js` (экспортирует всё выше), `sources/wp.js`, `sources/html-to-text.js`, `sources/lrclib.js`, `sources/itunes.js`.
  Разбор HTML — `DOMParser` в браузере; в тестах — linkedom.

`data/starter-songs.js`: `export const STARTER_SONGS = [{id, title, artist, level, lang, strum, text /* ChordPro */}]`. Только
общественное достояние, тексты пишем сами. Аккорды — лёгкие, в «укулельных» тональностях. Состав и id (их используют уроки):

| id | Песня | Уровень | Аккорды |
|---|---|---|---|
| `starter-bratec-yakov` | «Братец Яков» (народная) | L0 | C, Am |
| `starter-row-boat` | Row, Row, Row Your Boat (trad.) | L0 | C, Am |
| `starter-oh-susanna` | Oh! Susanna (S. Foster) | L1 | C, F, G |
| `starter-when-the-saints` | When the Saints Go Marching In (trad.) | L1 | C, F, G |
| `starter-vo-sadu` | «Во саду ли, в огороде» (народная) | L1 | C, F, G, Am |
| `starter-jingle-bells` | Jingle Bells (J. Pierpont) | L1 | C, F, G |
| `starter-clementine` | Clementine (trad.) | L1 | C, G, F |
| `starter-amazing-grace` | Amazing Grace (J. Newton) | L1 | C, F, G, Am |
| `starter-drunken-sailor` | Drunken Sailor (trad.) | L2 | Am, G, Dm |
| `starter-scarborough-fair` | Scarborough Fair (trad.) | L2 | Am, G, C, Em, D |
| `starter-red-river-valley` | Red River Valley (trad.) | L2 | C, F, G, Dm |
| `starter-shenandoah` | Shenandoah (trad.) | L2 | C, F, G, Am, Dm, Em |
| `starter-auld-lang-syne` | Auld Lang Syne (R. Burns) | L2 | C, G, F, Am, Dm |
| `starter-oy-moroz` | «Ой, мороз, мороз» (народная) | L3 | Am, Dm, E7, G, C |
| `starter-chernyi-voron` | «Чёрный ворон» (народная) | L3 | Am, Dm, E7 |
| `starter-korobeiniki` | «Коробейники» (Некрасов, народная музыка) | L3 | Am, Dm, E7, C, G |
| `starter-kalinka` | «Калинка» (И. Ларионов) | L3 | Am, Dm, E7, C, G |
| `starter-vo-pole-bereza` | «Во поле берёза стояла» (народная) | L3 | Am, Dm, E7 |
| `starter-kupalinka` | «Купалінка» (беларуская народная) | L3 | Am, Dm, E7 |
| `starter-house-rising-sun` | House of the Rising Sun (trad.) | L3 | Am, C, D, F, E7 |
| `starter-greensleeves` | Greensleeves (trad.) | L3 | Am, G, F, E7, C |

### audio (audio)

- `audio/context.js`: `audioCtx() → AudioContext` (лениво), `unlockAudio() → Promise` (вызывать в обработчике жеста).
- `audio/synth.js`: `strumChord(nameOrShape, {direction = 'down', when?, gain?, tuning?})` — Karplus-Strong, струны с задержкой ~12 мс;
  `pluck(midi, {when?, duration?, gain?})`; `click({when?, accent?})` — щелчок метронома (короткий тон 2,5–3 кГц).
- `audio/metronome.js`: `createMetronome({bpm = 80, beatsPerBar = 4, subdivision = 1, sound = true, onTick})` →
  `{start(), stop(), setBpm(n), setSound(b), running, bpm}`; `onTick({beat, bar, sub, time})` вызывается в момент звучания доли
  (планирование с упреждением по `AudioContext.currentTime`, визуальный колбэк по `setTimeout` к этому времени).
- `audio/tuner.js`: `startTuner(onReading, {tuning = 'gcea'}) → Promise<stop>`; reading:
  `{freq|null, clarity, note, octave, cents, string: 'G'|'C'|'E'|'A'|null, stringCents, inTune}`. Чистые функции для тестов:
  `freqToNote(freq)`, `nearestString(freq, tuning)` (G в обеих октавах). pitchy, порог чёткости 0,9, медианный фильтр.
- `audio/mic.js`: `getMic() → MediaStream` (`echoCancellation`, `noiseSuppression`, `autoGainControl` = false), `stopStream(s)`.
- `lib/device.js`: `requestWakeLock() → Promise<release>` (повторный запрос при возврате на вкладку), `vibrate(pattern)`.

### Оболочка и дизайн-система (shell)

`app/router.js`: сигнал `route` (`{path, params, query}`), `navigate(path, {replace?})`, `back(fallback = '/today')`,
`matchRoute(pattern, path) → params|null`, компонент `<Link href>`.

Маршруты (hash). «Полноэкранные» скрывают нижнюю навигацию.

| Маршрут | Экран (файл в `src/screens/`) | Полноэкранный |
|---|---|---|
| `/today` | `Today.jsx` (вкладка «Сегодня») | |
| `/practice?min=10` | `Practice.jsx` — занятие дня | да |
| `/learn` | `Learn.jsx` (вкладка «Учёба») | |
| `/learn/lesson/:id` | `Lesson.jsx` | да |
| `/songs`, `/songs?q=…&tab=find` | `Songs.jsx` (вкладка «Песни») | |
| `/songs/import` (+ `?title&text&url` от Share Target) | `SongImport.jsx` | да |
| `/song/:id` | `SongView.jsx` — режим игры | да |
| `/song/:id/train` | `SongTrainer.jsx` | да |
| `/chords`, `/chords/:name` | `Chords.jsx` (вкладка «Аккорды») | |
| `/tools`, `/tools/:tool` (`tuner` / `metronome` / `omc`) | `Tools.jsx` (вкладка «Тюнер») | |
| `/settings` | `Settings.jsx` | да |
| `/onboarding` | `Onboarding.jsx` (первый запуск) | да |

Экран — компонент по умолчанию с пропсами `{params, query}`. Пять нижних вкладок: Сегодня · Учёба · Песни · Аккорды · Тюнер.

Компоненты `src/ui/` (каждый — именованный экспорт одноимённого файла):

- `Page` — `{title, subtitle?, back?: string|true, actions?, wide?, children}`: шапка (на полноэкранных — кнопка «назад») + контент.
- `Button` — `{variant: 'primary'|'secondary'|'ghost'|'danger', size: 'sm'|'md'|'lg', icon?, block?, href?, onClick, disabled}`.
- `IconButton` — `{icon, label, onClick, active?}` (label → `aria-label`).
- `Card` — `{onClick?, href?, tone?: 'default'|'accent'|'success'|'warn', children}`.
- `Sheet` — нижняя шторка `{open, onClose, title, children}`.
- `Segmented` — `{value, options: [{value, label}], onChange}`.
- `Stepper` — `{value, min, max, step, onChange, label?, format?}`.
- `Slider` — `{value, min, max, step, onChange, label?}`; `Toggle` — `{checked, onChange, label}`.
- `Chip` — `{active?, tone?, onClick?, children}`; `Stat` — `{value, label, hint?}`; `ProgressRing` — `{value: 0–1, size?, children}`.
- `EmptyState` — `{icon?, title, text?, action?}`.
- `toast(message, {action?: {label, onClick}})` и `<ToastHost/>` (в `ui/Toast.jsx`).
- `ChordDiagram` — `{name, shape?, size: 'sm'|'md'|'lg', leftHanded?, showName?, dim?, onClick?, sound?: boolean}`: SVG по `getShape`,
  `aria-label` («Am: 2-й лад на струне G…») и текстовая запись `2000`; `sound` — по тапу `strumChord`.
- `ChordChip` — `{name, known?, onClick?}`.
- `useIsDesktop()` — `matchMedia('(min-width: 840px)')`.
- `lib/format.js`: `plural(n, ['день', 'дня', 'дней'])`, `formatDuration(sec)`, `formatDay(day)`.

Дизайн: токены в `styles/tokens.css` (светлая и тёмная тема: `prefers-color-scheme` + `[data-theme]`). Тёплая палитра («закат и дерево»):
акцент — оранжево-коралловый, второй цвет — морской бирюзовый, успех — зелёный. Радиусы 12–20 px, цели нажатия ≥ 48 px, крупная
типографика для аккордов, `font-variant-numeric: tabular-nums` для чисел. Классы-утилиты: `.stack`, `.row`, `.grid`, `.muted`, `.center`.

## Упражнения и экраны (волна 2)

Каждый компонент — именованный экспорт одноимённого файла в `src/exercises/`; стили области — `src/exercises/exercises.css`
(или свой файл рядом), импорт из компонента. Экраны — default export в `src/screens/`.

### Лист песни и режим игры (sheet)

- `SongSheet` — `{song: Song, transpose?: number, simplify?: boolean, fontSize?: number, known?: Set<string>, onChordTap?(name),
  structureOnly?: boolean}`: секции с подписями; строка текста — переносимые сегменты `inline-flex` «аккорд над слогом»; строка
  только из аккордов — ряд чипов; комментарии — приглушённо; табы — моноширинно с горизонтальной прокруткой. Незнакомые аккорды
  (нет в `known`) — с рамкой. Транспонирование и упрощение — при показе (`transposeSong`, `simplifyName`), с мемоизацией.
- `ChordStrip` — `{chords, known?, leftHanded?, onChordTap?, size?, vertical?}`: полоса диаграмм аккордов песни (прилипает сверху на
  телефоне, вертикальная колонка на десктопе); незнакомые отмечены рамкой и значком.
- `useAutoscroll(ref, {running, speed /* 1–10 */, onEnd?})` — плавная прокрутка через requestAnimationFrame.
- `KeyBanner` — `{chords, known, transpose, onApply(shift)}`: по `bestKey` — «Можно в Am (−3) — все аккорды знакомы» или
  «Не хватает: Bb, Gm».
- `PlayAlong` — `{record: SongRecord, speedFactor?: number, embedded?: boolean, onDone?()}`: лист + полоса диаграмм + автопрокрутка
  с отсчётом 3-2-1 и минимальным управлением (старт/пауза, скорость, Aa, транспонирование). Тап по листу — пауза. Экран не гаснет.
- Экран `SongView.jsx` (тот же владелец): полноэкранный режим игры по маршруту `/song/:id`.

### Тренажёры (drills)

- `Countdown` — `{from = 3, onDone}`; `BigTimer` — `{seconds, running, onEnd, children}` (кольцо).
- `OmcDrill` — `{a, b, seconds = 60, target?, onDone?(count), compact?}`: две диаграммы → отсчёт → минута с кольцом → ввод числа смен
  (крупный Stepper, по умолчанию прошлый результат) → рекорд и разница, `recordOmc` → «Ещё раз» / «Готово».
- `StrumDrill` — `{patternId, bpm, chords?, bars = 8, onDone?(bpm)}`: стрелки боя с подсветкой текущей восьмой по метроному,
  аккорд такта, BPM ±, после прогона «Ровно получилось?» → да: +4 BPM и `recordStrum`, нет: ещё раз.
- `ChordLearn` — `{name, onDone?(known)}`: крупная диаграмма со звуком, подсказка по пальцам, «Звучит чисто» → `setChordKnown`.
- `WarmupQuiz` — `{chords, onDone?(results)}`: название → поставь и сыграй → «Проверить» показывает диаграмму и звук → «Верно» / «Ошибся».
- `TunerPanel` — `{compact?, onDone?}`: стрелка/шкала, кнопки G C E A с эталонным звуком, текст «выше на 12 центов» / «в строю»,
  отметки настроенных струн, состояния разрешения микрофона и ошибок.
- `MetronomePanel` — `{initialBpm?}`: крупный BPM, tap-tempo, ±, размер 3/4 и 4/4, восьмые, мигающая точка, вибрация.

### Экраны

| Владелец | Файлы | Суть |
|---|---|---|
| habit | `Today.jsx`, `Practice.jsx` | главная (серия, занятие дня 5/10/18, «Учиться» и «Тренировать песню», «Играю сейчас», рекорды, «следующий аккорд → +N песен»); проигрыватель занятия по блокам с итогом |
| learn | `Learn.jsx`, `Lesson.jsx`, `Onboarding.jsx` | путь по уровням; проигрыватель урока по шагам; первый запуск (с нуля / уже играю, тюнер, время в день и напоминание, старт: урок или песня) |
| songs | `Songs.jsx`, `SongImport.jsx` | библиотека с фильтрами («Играю сейчас», «Играбельно сейчас», избранное) и поиск по источникам с бейджами; вставка текста и Share Target |
| trainer | `SongTrainer.jsx` | тренировка песни: Аккорды → Смены → Ритм → Играем (60 % → 80 % → 100 %), статусы песни |
| tools | `Chords.jsx`, `Tools.jsx`, `Settings.jsx` | словарь аккордов с «Я знаю» и «+N песен»; тюнер, метроном, смены; настройки, экспорт и импорт, напоминание |

### Что реально экспортирует волна 1 (сверх контракта)

Перед использованием модуля открой его исходник: ниже только главное.

- **state.js:** `today` (сигнал практического дня), `storage`, `flush()`, `reviewChord(name, success)` (самопроверка в разминке),
  `markSongPlayed(id)` (+1 игра, «новая» → «учу», `lastSongId`), `setLastSong(id)` (без счётчика), `DEFAULT_SETTINGS`.
  `recordOmc` → `{count, best, prevBest, record, first, target, reached}`; `recordStrum` → `{bestBpm, record}`;
  `logPractice(seconds, {session = true})` — вызывать один раз в конце занятия/урока; `removeSong` — мягкое удаление.
  `todayStats` → `{seconds, doneToday, streak (число), best, frozen, freezesLeft, weekSeconds, weeklyGoalSec}`.
  `prefs.speed` — шкала автопрокрутки 1–10 (по умолчанию 5), `prefs.fontSize` — px (18).
- **curriculum.js:** у уровня есть `omc` (цель OMC) и `bonus` (L3: G7, C7, D7); `strumById`, `lessonsOfLevel`, `levelOfChord`,
  `chordRank`, `isLessonDone`, `levelProgress(progress, id) → {done, total, complete}`, `omcTarget(progress, a, b)`.
  `completeLesson(id)` (state) отмечает выученными аккорды из шагов `chord`. В шаге `song` и в блоке `song` поле `speed` — доля темпа (0.7).
- **practice.js:** блок `song` → `{songId, speed, shift, missing}` (`shift` — транспонирование из `bestKey`); `chordSequence(text)`.
- **song.js:** `detectFormat(text) → 'chordpro'|'ug'|'plain'`. `song.strum` — сырой текст боя из источника; у записи песни
  `record.strum` — id из `STRUM_PATTERNS` (у стартового набора задан).
- **shapes.js:** у формы может быть `sub` — какой аккорд реально звучит (Em → `Em7 0202`); `shapeDifficulty`.
- **sources:** `SourceError` с готовым русским `message` («не отвечает», «отдыхает до завтра»), `resetBreaker(id)`,
  `hitFromUrl(url)` (ссылка akkords/dieza → загрузка по ссылке), `hit.score` для слияния выдачи; `onHits` — ровно один раз на источник.
- **audio:** `startTuner(onReading, {tuning, lockString, onError})`, ошибки микрофона — `MicError` с русским `message`;
  метроном: `onTick({beat, sub, bar, time, accent})` (0-based), `setBeatsPerBar`, `setSubdivision`, `setOnTick`; `chuck()` для X в бое,
  `silence()`. Звук и тюнер запускать из обработчика тапа (`unlockAudio()`).
- **router.js:** `navigate(path, {replace, scroll})`, `withQuery(path, query)`, `route.value.query/params`. `Page back`: `true` —
  назад по истории или на /today; строка — назад или на эту страницу.
- **ui:** всё ре-экспортируется из `src/ui/index.js`. `toast()` возвращает функцию закрытия. `Card`/`Button` принимают `href`.
  Утилиты в `styles/utilities.css`: `.stack .row .row-wrap .grid (--min) .grid-2 .grid-3 .split/.split-aside .scroll-x .thumb-bar
  .chord-name .chord-xl .muted .faint .center .spacer .nums .eyebrow .section-title .sr-only .mobile-only .desktop-only`.
  Цвета — только токены из `styles/tokens.css`.
- **Onboarding** обязан вызвать `markOnboarded()` перед уходом: App отправляет на `/onboarding`, пока `progress.onboarded` = false.
