import { useMemo } from 'preact/hooks';
import { settings } from '../state.js';
import { chordLabel } from '../lib/format.js';
import { cx } from '../ui/icon.js';
import { hasChords, knownTester, lineText, lyricWords, prepareSong, sectionLabel, structureRows } from './sheet-model.js';
import './sheet.css';

/** @typedef {import('../core/song.js').Song} Song */

const NBSP = ' ';

/** Раскладка песни для показа: строки текста заранее разбиты на слова. */
function layoutSong(song) {
  return (song?.sections ?? []).map((sec) => ({
    sec,
    label: sectionLabel(sec),
    lines: (sec.lines ?? []).map((l) => {
      if (l.type !== 'lyrics') return l;
      return hasChords(l.segments)
        ? { type: 'lyrics', chorded: true, items: lyricWords(l.segments) }
        : { type: 'lyrics', chorded: false, text: lineText(l.segments) };
    }),
  }));
}

/**
 * Аккорд в тексте: кнопка (тап — onTap(name)) или просто подпись. Незнакомый — в пунктирной рамке.
 * @param {{name: string, known?: boolean, notation: string, onTap?: (name: string) => void, chip?: boolean}} props
 */
function SheetChord({ name, known, notation, onTap, chip = false }) {
  const label = chordLabel(name, { notation });
  const unknown = known === false;
  const className = cx(chip ? 'songsheet__chip' : 'songsheet__chord', unknown && 'is-unknown');
  if (!onTap) {
    return (
      <span class={className}>
        {label}
        {unknown && <span class="sr-only"> (новый аккорд)</span>}
      </span>
    );
  }
  return (
    <button
      type="button"
      class={className}
      aria-label={`${label}${unknown ? ', новый аккорд' : ''}. Показать аппликатуру`}
      onClick={(e) => {
        e.stopPropagation();
        onTap(name);
      }}
    >
      {label}
    </button>
  );
}

/**
 * Лист песни: секции с подписями, аккорды над слогами (переносятся вместе с ними), строки аккордов — чипами,
 * комментарии приглушённо, табы моноширинно с горизонтальной прокруткой.
 * @param {{song: Song, transpose?: number, simplify?: boolean, fontSize?: number, known?: Set<string>|string[],
 *          onChordTap?: (name: string) => void, structureOnly?: boolean, class?: string}} props
 *   known — знакомые аккорды (незнакомые в рамке); не задан — без отметок
 */
export function SongSheet({ song, transpose = 0, simplify = false, fontSize = 18, known, onChordTap, structureOnly = false, class: extra }) {
  const shown = useMemo(() => prepareSong(song, { transpose, simplify }), [song, transpose, simplify]);
  const layout = useMemo(() => layoutSong(shown), [shown]);
  const isKnown = useMemo(() => knownTester(known), [known]);
  const notation = settings.value?.notation ?? 'B';
  const chord = (name, chip = false, key = undefined) => (
    <SheetChord key={key} name={name} known={isKnown ? isKnown(name) : undefined} notation={notation} onTap={onChordTap} chip={chip} />
  );

  const style = { '--songsheet-fs': `${fontSize}px` };
  const meta = [];
  if (shown?.capo) meta.push(`Каподастр: ${shown.capo} лад`);
  if (shown?.strum) meta.push(`Бой: ${shown.strum}`);

  if (!layout.length) {
    return (
      <div class={cx('songsheet', extra)} style={style}>
        <p class="songsheet__comment">В песне пока нет текста.</p>
      </div>
    );
  }

  if (structureOnly) {
    return (
      <div class={cx('songsheet', 'songsheet--structure', extra)} style={style}>
        {layout.map(({ sec }, i) => {
          const rows = structureRows(sec);
          const label = sectionLabel(sec, true);
          if (!rows.length && !label) return null;
          return (
            <section key={i} class={cx('songsheet__sec', `songsheet__sec--${sec.kind}`)}>
              {label && <h2 class="songsheet__label">{label}</h2>}
              {rows.map((r, j) => (
                <div key={j} class="songsheet__chips">
                  {r.chords.map((c, k) => chord(c, true, k))}
                  {r.times > 1 && (
                    <span class="songsheet__times" aria-label={`повторить ${r.times} раза`}>
                      ×{r.times}
                    </span>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div class={cx('songsheet', extra)} style={style}>
      {meta.length > 0 && (
        <p class="songsheet__meta">
          {meta.map((m) => (
            <span key={m} class="songsheet__tag">
              {m}
            </span>
          ))}
        </p>
      )}
      {layout.map(({ sec, label, lines }, i) => (
        <section key={i} class={cx('songsheet__sec', `songsheet__sec--${sec.kind}`)}>
          {label && <h2 class="songsheet__label">{label}</h2>}
          {lines.map((l, j) => {
            if (l.type === 'lyrics') {
              if (!l.chorded) return <p key={j} class="songsheet__line">{l.text}</p>;
              return (
                <p key={j} class="songsheet__line songsheet__line--chorded">
                  {l.items.map((it, k) =>
                    it.t === 's' ? (
                      ' '
                    ) : (
                      <span key={k} class={cx('songsheet__word', it.long && 'is-long')}>
                        {it.parts.map((p, m) =>
                          p.chord ? (
                            <span key={m} class="songsheet__seg">
                              {chord(p.chord)}
                              <span class="songsheet__syl">{p.text || NBSP}</span>
                            </span>
                          ) : (
                            p.text
                          ),
                        )}
                      </span>
                    ),
                  )}
                </p>
              );
            }
            if (l.type === 'chords') {
              return (
                <div key={j} class="songsheet__chips">
                  {l.chords.map((c, k) => chord(c, true, k))}
                </div>
              );
            }
            if (l.type === 'comment') return <p key={j} class="songsheet__comment">{l.text}</p>;
            if (l.type === 'tab') {
              return (
                <pre key={j} class="songsheet__tab" tabIndex={0} aria-label="Табулатура">
                  {l.lines.join('\n')}
                </pre>
              );
            }
            return <div key={j} class="songsheet__gap" aria-hidden="true" />;
          })}
        </section>
      ))}
    </div>
  );
}
