import { useRef } from 'preact/hooks';
import { Volume2 } from 'lucide-preact';
import { getShape } from '../core/shapes.js';
import { strumChord } from '../audio/synth.js';
import { unlockAudio } from '../audio/context.js';
import { settings } from '../state.js';
import { chordLabel } from '../lib/format.js';
import { DOT_R, describeChord, layoutChordDiagram, shapeText } from './chord-layout.js';
import { cx } from './icon.js';

const EMPTY_SHAPE = { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], barre: null, baseFret: 1 };

/**
 * Диаграмма аккорда (SVG): верхний порожек или номер лада, точки с номерами пальцев, баррэ,
 * открытые (○) и заглушённые (×) струны, текстовая запись «2000» и описание для диктора.
 * @param {{name: string, shape?: import('../core/shapes.js').Shape|null, size?: 'sm'|'md'|'lg', leftHanded?: boolean,
 *          showName?: boolean, dim?: boolean, onClick?: (e: Event) => void, sound?: boolean, class?: string}} props
 *   shape — другая аппликатура (по умолчанию getShape(name)); leftHanded — по умолчанию из настроек;
 *   sound — по нажатию звучит аккорд
 */
export function ChordDiagram({ name, shape, size = 'md', leftHanded, showName = true, dim = false, onClick, sound = false, class: extra }) {
  const ref = useRef(/** @type {HTMLElement|null} */ (null));
  const prefs = settings.value || {};
  const lefty = leftHanded ?? Boolean(prefs.leftHanded);
  const sh = shape === undefined ? (name ? getShape(name) : null) : shape;
  const label = chordLabel(name, { notation: prefs.notation });
  const lay = layoutChordDiagram(sh || EMPTY_SHAPE, { leftHanded: lefty, labels: size === 'lg' });
  const description = describeChord(label, sh);
  const clickable = Boolean(onClick || sound);

  const handleClick = (e) => {
    if (sound && sh) {
      unlockAudio().then(() => strumChord(sh, { tuning: prefs.tuning || 'gcea' }));
      const el = ref.current;
      if (el) {
        el.classList.remove('is-strumming');
        void el.offsetWidth; // перезапуск анимации при быстрых нажатиях
        el.classList.add('is-strumming');
      }
    }
    onClick?.(e);
  };

  const body = (
    <>
      {showName && (
        <span class="cd-name" aria-hidden="true">
          {label}
        </span>
      )}
      <svg viewBox={`0 0 ${lay.width} ${lay.height}`} aria-hidden="true" focusable="false">
        {lay.fretLines.map((y, i) => (
          <line key={`f${i}`} class="cd-fret" x1={lay.x0} x2={lay.x1} y1={y} y2={y} />
        ))}
        {lay.strings.map((s) => (
          <line key={`s${s.string}`} class="cd-string" x1={s.x} x2={s.x} y1={lay.gridTop} y2={lay.gridBottom} />
        ))}
        {lay.nut && <rect class="cd-nut" x={lay.nut.x} y={lay.nut.y} width={lay.nut.w} height={lay.nut.h} rx={1.5} />}
        {sh &&
          lay.markers.map((m) =>
            m.kind === 'open' ? (
              <circle key={`m${m.string}`} class="cd-open" cx={m.x} cy={m.y} r={4.5} />
            ) : (
              <path
                key={`m${m.string}`}
                class="cd-mute"
                d={`M${m.x - 4} ${m.y - 4}L${m.x + 4} ${m.y + 4}M${m.x + 4} ${m.y - 4}L${m.x - 4} ${m.y + 4}`}
              />
            ),
          )}
        {lay.barres.map((b, i) => (
          <g key={`b${i}`}>
            <rect class="cd-barre" x={b.x1 - DOT_R} y={b.y - DOT_R} width={b.x2 - b.x1 + DOT_R * 2} height={DOT_R * 2} rx={DOT_R} />
            {b.finger > 0 && (
              <text class="cd-finger" x={(b.x1 + b.x2) / 2} y={b.y + 0.5}>
                {b.finger}
              </text>
            )}
          </g>
        ))}
        {lay.dots.map((d) => (
          <g key={`d${d.string}`}>
            <circle class="cd-dot" cx={d.x} cy={d.y} r={DOT_R} />
            {d.finger > 0 && (
              <text class="cd-finger" x={d.x} y={d.y + 0.5}>
                {d.finger}
              </text>
            )}
          </g>
        ))}
        {lay.position && (
          <text class="cd-pos" x={lay.position.x} y={lay.position.y} text-anchor="middle">
            {lay.position.text}
          </text>
        )}
        {lay.labels.map((l) => (
          <text key={`l${l.text}`} class="cd-label" x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
        {!sh && (
          <text class="cd-unknown" x={lay.width / 2} y={(lay.gridTop + lay.gridBottom) / 2}>
            ?
          </text>
        )}
      </svg>
      {size !== 'sm' && (
        <span class="cd-text" aria-hidden="true">
          {sh ? shapeText(sh) : '—'}
        </span>
      )}
      {sound && size === 'lg' && (
        <span class="cd-sound" aria-hidden="true">
          <Volume2 size={18} />
        </span>
      )}
    </>
  );

  const className = cx('cd', `cd--${size}`, dim && 'is-dim', clickable && 'is-clickable', extra);
  if (clickable) {
    return (
      <button
        type="button"
        ref={ref}
        class={className}
        aria-label={sound ? `${description}. Нажми, чтобы послушать` : description}
        onClick={handleClick}
      >
        {body}
      </button>
    );
  }
  return (
    <figure ref={ref} class={className} role="img" aria-label={description}>
      {body}
    </figure>
  );
}
