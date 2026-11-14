import { useEffect, useState } from 'preact/hooks';

/** Граница десктопной раскладки (боковая рейка, две колонки). */
export const DESKTOP_QUERY = '(min-width: 840px)';

function matches() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * true на экранах от 840 px; обновляется при повороте и изменении окна.
 * @returns {boolean}
 */
export function useIsDesktop() {
  const [desktop, setDesktop] = useState(matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return desktop;
}
