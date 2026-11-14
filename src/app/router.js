// Hash-роутер: #/songs?q=… → сигнал route. Пути относительные — приложение живёт в подпапке.
// В node (тесты) работает без window: route = маршрут по умолчанию, навигация — только сигнал.

import { h } from 'preact';
import { signal } from '@preact/signals';
import { DEFAULT_PATH, matchRoute, resolveRoute } from './routes.js';
import { shareTargetPath } from './share-target.js';

export { matchRoute };

/**
 * @typedef {{path: string, params: Record<string, string>, query: Record<string, string>, href: string,
 *            screen: string, tab: string|null, full: boolean}} Route
 * href — путь с query (как в адресе после #); screen/tab/full — из таблицы маршрутов.
 */

const hasDom = typeof window !== 'undefined' && typeof location !== 'undefined' && typeof history !== 'undefined';

/** Разбирает hash ('#/songs?q=1') или путь ('/songs?q=1') в путь и query. */
export function parseHref(href) {
  let s = String(href || '').replace(/^#/, '');
  const qi = s.indexOf('?');
  const rawPath = qi >= 0 ? s.slice(0, qi) : s;
  const search = qi >= 0 ? s.slice(qi + 1) : '';
  /** @type {Record<string, string>} */
  const query = {};
  for (const [k, v] of new URLSearchParams(search)) query[k] = v;
  return { path: normalizePath(rawPath), query, search };
}

/**
 * Собирает путь с query: withQuery('/songs', {q: 'кино', tab: 'find'}) → '/songs?q=%D0…&tab=find'.
 * Пустые значения (undefined, null, '') пропускаются.
 * @param {string} path
 * @param {Record<string, string|number|boolean|null|undefined>} [query]
 * @returns {string}
 */
export function withQuery(path, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Маршрут для hash/пути; неизвестный путь → маршрут по умолчанию.
 * @param {string} href
 * @returns {Route}
 */
export function toRoute(href) {
  const { path, query, search } = parseHref(href);
  const found = resolveRoute(path);
  if (!found) return toRoute(DEFAULT_PATH);
  return {
    path,
    params: found.params,
    query,
    href: search ? `${path}?${search}` : path,
    screen: found.def.screen,
    tab: found.def.tab ?? null,
    full: Boolean(found.def.full),
  };
}

function normalizePath(p) {
  let path = '/' + String(p).split('/').filter(Boolean).join('/');
  return path === '/' ? DEFAULT_PATH : path;
}

/** Текущий маршрут. */
export const route = signal(toRoute(hasDom ? location.hash : DEFAULT_PATH));

// ---------- История и прокрутка ----------

const scrollByKey = new Map();
let started = false;
let lastIdx = 0;

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function currentState() {
  const st = hasDom ? history.state : null;
  return st && st.uke ? st : null;
}

function urlFor(href) {
  // query страницы (?source=pwa, ?share=1…) не нужен после старта — оставляем только hash
  return `${location.pathname}#${href}`;
}

function saveScroll() {
  const st = currentState();
  if (st) scrollByKey.set(st.key, window.scrollY);
}

function scrollAfterRender(y) {
  requestAnimationFrame(() => window.scrollTo(0, y));
}

function sync({ restoreScroll = false } = {}) {
  let st = currentState();
  if (!st) {
    // Новый пункт истории без нашего состояния: ручная правка адреса или обычная ссылка
    st = { uke: 1, idx: lastIdx + 1, key: newKey() };
    history.replaceState(st, '', location.href);
  }
  lastIdx = st.idx;
  const next = toRoute(location.hash);
  // Пустой, неканонический или неизвестный адрес — тихо заменяем на канонический
  if (location.hash !== `#${next.href}`) history.replaceState(st, '', urlFor(next.href));
  if (next.href !== route.value.href) route.value = next;
  if (restoreScroll) scrollAfterRender(scrollByKey.get(st.key) ?? 0);
}

/**
 * Запускает роутер: слушатели истории, Share Target, чистка query страницы. Вызывать один раз до рендера.
 */
export function startRouter() {
  if (!hasDom || started) return;
  started = true;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const st = currentState() ?? { uke: 1, idx: 0, key: newKey() };
  lastIdx = st.idx;
  const shared = shareTargetPath(location.search);
  if (shared) {
    history.replaceState(st, '', urlFor(shared));
  } else if (location.search) {
    history.replaceState(st, '', `${location.pathname}${location.hash}`);
  } else if (!history.state?.uke) {
    history.replaceState(st, '', location.href);
  }
  sync();

  window.addEventListener('popstate', () => sync({ restoreScroll: true }));
  window.addEventListener('hashchange', () => sync({ restoreScroll: false }));
}

/**
 * Переход по маршруту.
 * @param {string} path путь с query, например '/songs?tab=find'
 * @param {{replace?: boolean, scroll?: boolean}} [opts] replace — заменить текущий пункт истории;
 *   scroll: false — не прокручивать наверх (например, открыть аккорд поверх списка)
 */
export function navigate(path, { replace = false, scroll = true } = {}) {
  const next = toRoute(path);
  if (!hasDom) {
    route.value = next;
    return;
  }
  const same = next.href === route.value.href;
  if (same && !replace) return;
  saveScroll();
  if (replace) {
    const st = currentState() ?? { uke: 1, idx: lastIdx, key: newKey() };
    history.replaceState(st, '', urlFor(next.href));
  } else {
    lastIdx += 1;
    history.pushState({ uke: 1, idx: lastIdx, key: newKey() }, '', urlFor(next.href));
  }
  route.value = next;
  if (scroll && !same) scrollAfterRender(0);
}

/**
 * Назад по истории приложения; если идти некуда (открыли по ссылке) — переход на fallback.
 * @param {string} [fallback]
 */
export function back(fallback = DEFAULT_PATH) {
  const st = currentState();
  if (hasDom && st && st.idx > 0) history.back();
  else navigate(fallback, { replace: true });
}

/**
 * Ссылка на маршрут приложения: <Link href="/songs">Песни</Link>. Внешние адреса (https:, mailto:) открываются как обычно.
 * @param {{href: string, replace?: boolean, scroll?: boolean, onClick?: (e: MouseEvent) => void,
 *          children?: any, [key: string]: any}} props
 */
export function Link({ href, replace, scroll, onClick, children, ...rest }) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return h('a', { target: '_blank', rel: 'noopener noreferrer', ...rest, href, onClick }, children);
  }
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href, { replace, scroll });
  };
  return h('a', { ...rest, href: `#${href}`, onClick: handle }, children);
}
