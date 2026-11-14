import { useId } from 'preact/hooks';

const CREAM = '#fff5ea';
const WOOD = '#6e3520';

/**
 * Значок приложения: укулеле на закатном градиенте (та же геометрия, что в icons/favicon.svg — tools/make-icons.py).
 * @param {{class?: string, size?: number}} props
 */
export function Logo({ class: extra, size }) {
  const id = `uke-logo-${useId()}`;
  return (
    <svg class={extra} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffa852" />
          <stop offset="1" stop-color="#e2513f" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill={`url(#${id})`} />
      <circle cx="256" cy="225.3" r="184.3" fill="#fff" fill-opacity="0.15" />
      <g transform="translate(225.56 301.04) scale(1.1217) rotate(38)">
        <circle cx="0" cy="64" r="92" fill={CREAM} />
        <circle cx="0" cy="-52" r="72" fill={CREAM} />
        <rect x="-24" y="-262" width="48" height="56" rx="13" fill={CREAM} />
        <rect x="-15" y="-214" width="30" height="152" rx="7" fill={WOOD} />
        <circle cx="0" cy="-40" r="27" fill={WOOD} />
        <rect x="-34" y="102" width="68" height="14" rx="7" fill={WOOD} />
        <circle cx="-33" cy="-248" r="7" fill={CREAM} />
        <circle cx="33" cy="-248" r="7" fill={CREAM} />
        <circle cx="-33" cy="-222" r="7" fill={CREAM} />
        <circle cx="33" cy="-222" r="7" fill={CREAM} />
        <g stroke="#eec8aa" stroke-width="2.4">
          <line x1="-15" y1="-186" x2="15" y2="-186" />
          <line x1="-15" y1="-160" x2="15" y2="-160" />
          <line x1="-15" y1="-137" x2="15" y2="-137" />
          <line x1="-15" y1="-116" x2="15" y2="-116" />
          <line x1="-15" y1="-97" x2="15" y2="-97" />
        </g>
        <g stroke="#d9a07f" stroke-width="2">
          <line x1="-9" y1="-256" x2="-9" y2="108" />
          <line x1="-3" y1="-256" x2="-3" y2="108" />
          <line x1="3" y1="-256" x2="3" y2="108" />
          <line x1="9" y1="-256" x2="9" y2="108" />
        </g>
      </g>
    </svg>
  );
}
