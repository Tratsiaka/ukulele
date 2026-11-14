import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ArrowLeft, ArrowLeftRight, Play, Trophy } from 'lucide-preact';
import { Button, Chip, IconButton, Page, Segmented, useIsDesktop } from '../ui/index.js';
import { cx } from '../ui/icon.js';
import { knownChordNames, progress, settings, today } from '../state.js';
import { Link, navigate } from '../app/router.js';
import { weakPairs } from '../core/practice.js';
import { chordLabel, formatDay } from '../lib/format.js';
import { TunerPanel } from '../exercises/TunerPanel.jsx';
import { MetronomePanel } from '../exercises/MetronomePanel.jsx';
import { OmcDrill } from '../exercises/OmcDrill.jsx';
import {
  bpmFromQuery, initialPair, pairKey, pairOptions, pairRecords, setPairSlot, sparkline, toolFromParam,
} from './tools-helpers.js';
import './tools.css';

const TOOLS = [
  { value: 'tuner', label: 'Тюнер' },
  { value: 'metronome', label: 'Метроном' },
  { value: 'omc', label: 'Смены' },
];
const TITLES = { tuner: 'Тюнер', metronome: 'Метроном', omc: 'Смены за минуту' };
const RECORDS_PREVIEW = 6;

/**
 * Вкладка «Тюнер» (/tools, /tools/:tool — tuner | metronome | omc): переключатель инструментов синхронизирован
 * с маршрутом. Тюнер и метроном — готовые панели; «Смены» — выбор пары, тренажёр и личные рекорды.
 * ?bpm=96 — начальный темп метронома; ?a=Am&b=F — пара для смен.
 * @param {{params: Record<string, string>, query: Record<string, string>}} props
 */
export default function Tools({ params, query }) {
  const tool = toolFromParam(params?.tool);
  const isDesktop = useIsDesktop();
  const setTool = (v) => navigate(`/tools/${v}`, { replace: true, scroll: false });

  return (
    <Page title={TITLES[tool]} wide={tool === 'omc' && isDesktop}>
      <Segmented class="tls-seg" label="Инструмент" value={tool} options={TOOLS} onChange={setTool} />
      {tool === 'tuner' && <TunerPanel />}
      {tool === 'metronome' && <MetronomePanel initialBpm={bpmFromQuery(query?.bpm)} />}
      {tool === 'omc' && <OmcTool query={query} isDesktop={isDesktop} />}
    </Page>
  );
}

/** «Смены за минуту»: пара (выбор, слабые пары, обмен) → OmcDrill; рекорды по парам с графиком. */
function OmcTool({ query, isDesktop }) {
  const notation = settings.value.notation;
  const known = knownChordNames.value;
  const p = progress.value;
  const day = today.value;
  const weak = useMemo(() => weakPairs(p, known, 4), [p, known]);
  const records = useMemo(() => pairRecords(p.pairs, { today: day }), [p.pairs, day]);
  const [pair, setPair] = useState(() => initialPair(query, { known, weak, records }));
  // На телефоне два шага: выбрать пару → тренажёр. Пришли со ссылкой ?a&b — сразу тренажёр.
  const [drilling, setDrilling] = useState(() => Boolean(query?.a && query?.b));
  const [showAll, setShowAll] = useState(false);
  const [a, b] = pair;
  const label = (n) => chordLabel(n, { notation });

  // Текущая пара: ссылка ?a&b на неё же ничего не сбрасывает.
  const written = useRef(pairKey(a, b));

  // Переход на эту же вкладку с другой парой (?a&b) без пересоздания экрана.
  useEffect(() => {
    if (!query?.a || !query?.b) return;
    const next = initialPair(query, { known });
    const key = pairKey(next[0], next[1]);
    if (key === written.current) return;
    written.current = key;
    setPair(next);
    setDrilling(true);
  }, [query?.a, query?.b]);

  const choose = (next, { start = false } = {}) => {
    written.current = pairKey(next[0], next[1]);
    setPair(next);
    if (start) setDrilling(true);
  };

  const options = pairOptions(known, [a, b]);
  const shownRecords = showAll ? records : records.slice(0, RECORDS_PREVIEW);

  const picker = (
    <section class="card tls-pick" aria-label="Пара аккордов">
      <div class="tls-pair">
        <PairSelect id="tls-a" label="Первый аккорд" value={a} options={options} notation={notation} onChange={(v) => choose(setPairSlot(pair, 0, v))} />
        <IconButton icon={ArrowLeftRight} label="Поменять местами" class="tls-swap" onClick={() => choose([b, a])} />
        <PairSelect id="tls-b" label="Второй аккорд" value={b} options={options} notation={notation} onChange={(v) => choose(setPairSlot(pair, 1, v))} />
      </div>
      {weak.length > 0 && (
        <div class="stack stack-sm">
          <p class="eyebrow">Стоит подтянуть</p>
          <div class="row row-wrap gap-2">
            {weak.map(([x, y]) => {
              const on = pairKey(x, y) === pairKey(a, b);
              return (
                <Chip key={pairKey(x, y)} tone="teal" active={on} onClick={() => choose([x, y], { start: !isDesktop })}>
                  {label(x)} ⇄ {label(y)}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
      {known.length < 2 && (
        <p class="small muted">
          Отметь в <Link href="/chords">словаре</Link> аккорды, которые уже знаешь, — тут появятся подходящие пары.
        </p>
      )}
      {!isDesktop && (
        <Button variant="primary" size="lg" block icon={Play} onClick={() => setDrilling(true)}>
          Минута на {label(a)} ⇄ {label(b)}
        </Button>
      )}
    </section>
  );

  const recordList = (
    <section class="tls-records" aria-labelledby="tls-records-title">
      <h2 class="section-title" id="tls-records-title">
        Твои рекорды
      </h2>
      {records.length ? (
        <>
          <ul class="tls-rec-list">
            {shownRecords.map((r) => (
              <li key={r.key}>
                <RecordRow
                  rec={r}
                  active={r.key === pairKey(a, b)}
                  day={day}
                  label={label}
                  onPick={() => choose([r.a, r.b], { start: !isDesktop })}
                />
              </li>
            ))}
          </ul>
          {records.length > RECORDS_PREVIEW && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Свернуть' : `Все пары · ${records.length}`}
            </Button>
          )}
        </>
      ) : (
        <p class="tls-empty small muted">
          Пока ни одного замера. Одна минута — и тут появится первый рекорд и график.
        </p>
      )}
    </section>
  );

  const drill = <OmcDrill key={pairKey(a, b)} a={a} b={b} compact={!isDesktop} />;

  if (isDesktop) {
    return (
      <div class="tls-omc">
        <div class="stack gap-4">
          {picker}
          {recordList}
        </div>
        <div class="card tls-omc-drill">{drill}</div>
      </div>
    );
  }

  if (drilling) {
    return (
      <div class="stack">
        <div class="tls-omc-bar">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setDrilling(false)}>
            Другая пара
          </Button>
        </div>
        {drill}
      </div>
    );
  }

  return (
    <div class="stack gap-4">
      {picker}
      {recordList}
    </div>
  );
}

/** Нативный выбор аккорда: «Знаю» и остальные из словаря. */
function PairSelect({ id, label, value, options, notation, onChange }) {
  return (
    <div class="tls-select">
      <label class="sr-only" for={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        {options.known.length > 0 && (
          <optgroup label="Знаю">
            {options.known.map((n) => (
              <option key={n} value={n}>
                {chordLabel(n, { notation })}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={options.known.length ? 'Остальные' : 'Все аккорды'}>
          {options.other.map((n) => (
            <option key={n} value={n}>
              {chordLabel(n, { notation })}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

/** Строка рекорда: пара, когда и сколько в последний раз, мини-график, рекорд. */
function RecordRow({ rec, active, day, label, onPick }) {
  const when = rec.lastDay ? formatDay(rec.lastDay, { today: day }) : '';
  const pairText = `${label(rec.a)} ⇄ ${label(rec.b)}`;
  return (
    <button
      type="button"
      class={cx('tls-rec', active && 'is-active', rec.recordToday && 'is-record')}
      aria-label={`${pairText}: рекорд ${rec.best}, в последний раз ${rec.last}${when ? `, ${when}` : ''}. Тренировать`}
      onClick={onPick}
    >
      <span class="tls-rec-main">
        <span class="tls-rec-pair">{pairText}</span>
        <span class="tls-rec-meta">
          {rec.recordToday ? (
            <span class="tls-rec-badge">
              <Trophy size={14} aria-hidden="true" /> рекорд сегодня
            </span>
          ) : (
            <>
              {when && `${when} · `}
              {rec.last}
            </>
          )}
        </span>
      </span>
      <Spark counts={rec.counts} />
      <span class="tls-rec-best">
        <span class="nums">{rec.best}</span>
        <span class="tls-rec-best-l">рекорд</span>
      </span>
    </button>
  );
}

/** Мини-график последних результатов. */
function Spark({ counts }) {
  const sp = sparkline(counts.slice(-14), { width: 72, height: 28, pad: 4 });
  if (!sp) return <span class="tls-spark" aria-hidden="true" />;
  return (
    <svg class="tls-spark" viewBox="0 0 72 28" width="72" height="28" aria-hidden="true" focusable="false">
      <polyline points={sp.points} />
      <circle cx={sp.last.x} cy={sp.last.y} r="3" />
    </svg>
  );
}
