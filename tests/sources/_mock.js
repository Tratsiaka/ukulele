// Помощники для тестов sources: поддельный fetch и хранилище. Не тест (node --test берёт только *.test.js).

/**
 * Поддельный fetch: routes — массив [предикат(url) | подстрока, ответ | (url, init) => ответ].
 * Ответ: {status?, body?, headers?, delay?, hang?}. body-объект сериализуется в JSON.
 * @returns {typeof fetch & {calls: Array<{url: string, init: any}>}}
 */
export function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find(([m]) => (typeof m === 'function' ? m(String(url)) : String(url).includes(m)));
    if (!route) return new Response('[]', { status: 200 });
    let spec = route[1];
    if (typeof spec === 'function') spec = await spec(String(url), init);
    if (spec instanceof Error) throw spec;
    const { status = 200, body = [], headers = {}, delay = 0, hang = false } = spec;
    if (hang || delay) {
      await new Promise((resolve, reject) => {
        const t = hang ? null : setTimeout(resolve, delay);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
        }, { once: true });
      });
    }
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers });
  };
  fn.calls = calls;
  return fn;
}

/** Хранилище как localStorage. */
export function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

/** Часы, которые двигаем руками. */
export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}
