import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchKey, detectLang, decodeEntities, plainText, similarity, matchScore, createBreaker, getJson, SourceError, BREAKER_KEY,
} from '../../src/sources/util.js';
import { mockFetch, fakeStorage, fakeClock } from './_mock.js';

test('searchKey: таблица', () => {
  const cases = [
    ['Группа крови (OST «Закон каменных джунглей 2»)', 'группа крови'],
    ['Song (из к/ф «Что-то»)', 'song'],
    ['Всё идёт по плану', 'все идет по плану'],
    ['Купалінка', 'купалинка'],
    ['Ўсё будзе добра', 'усе будзе добра'],
    ['Пісня про рушник', 'писня про рушник'],
    ['Мой май', 'мой май'],
    ["Don't Stop", 'dont stop'],
    ['Остаться с тобой feat. гр. «Кино»', 'остаться с тобой'],
    ['Song ft. Somebody', 'song'],
    ['Beyoncé – Halo', 'beyonce halo'],
    ['Hello &amp; Goodbye', 'hello goodbye'],
    ['  Звёзды   ждут... ', 'звезды ждут'],
    ['', ''],
    [null, ''],
  ];
  for (const [input, want] of cases) assert.equal(searchKey(input), want, String(input));
});

test('detectLang: таблица', () => {
  const cases = [
    ['Чёрный ворон, чёрный ворон,\nЧто ты вьёшься надо мной?\nТы добычи не дождёшься', 'ru'],
    ['Am        Dm\nЧёрный ворон, что ты вьёшься\nE7       Am\nнадо мной?', 'ru'],
    ['Купалінка, купалінка, цёмная ночка,\nцёмная ночка, а дзе ж твая дочка?', 'be'],
    ['Мая дочка ў садочку ружу-кветку поліць', 'be'],
    ['Ой у лузі червона калина похилилася,\nчогось наша славна Україна зажурилася', 'uk'],
    ['What shall we do with a drunken sailor\nearly in the morning', 'en'],
    ['[C]Row, row, row your [G]boat gently down the stream', 'en'],
    ['De la sierra morena, cielito lindo, vienen bajando,\nun par de ojitos negros, cielito lindo, de contrabando', 'other'],
    ['', 'other'],
    ['Am  Dm  E7', 'other'],
  ];
  for (const [text, want] of cases) assert.equal(detectLang(text), want, text);
});

test('decodeEntities и plainText', () => {
  assert.equal(decodeEntities('&#8220;Кино&#8221; &amp; &laquo;x&raquo; &#x2014; &hellip;'), '“Кино” & «x» — …');
  assert.equal(decodeEntities('&unknown; &#0;'), '&unknown; &#0;');
  assert.equal(plainText('<b>Sokolow &amp; Daria</b>\n  Dubovik'), 'Sokolow & Daria Dubovik');
});

test('similarity и matchScore', () => {
  assert.equal(similarity('Группа крови', 'группа  крови!'), 1);
  assert.ok(similarity('группа крови', 'группы крови') > 0.7);
  assert.ok(similarity('группа крови', 'сухие губы') < 0.3);
  assert.equal(matchScore('кукушка', { title: 'Кукушка', artist: 'Кино' }), 1);
  assert.equal(matchScore('кино кукушка', { title: 'Кукушка', artist: 'Кино' }), 1);
  const kino = matchScore('кино кукушка', { title: 'Кукушка', artist: 'Кино (Виктор Цой)' });
  const other = matchScore('кино кукушка', { title: 'Кукушка', artist: 'Полина Гагарина' });
  assert.ok(kino > other, `${kino} > ${other}`);
  assert.ok(matchScore('yesterday', { title: 'From Yesterday', artist: 'X' }) < 1);
  assert.equal(matchScore('', { title: 'x' }), 0);
});

test('предохранитель: 3 сбоя подряд → пропуск на 24 ч', () => {
  const storage = fakeStorage();
  const now = fakeClock();
  const b = createBreaker({ storage, now });
  b.failure('dieza'); b.failure('dieza');
  assert.equal(b.isOpen('dieza'), false);
  b.failure('dieza');
  assert.equal(b.isOpen('dieza'), true);
  assert.equal(b.isOpen('akkords'), false);
  assert.ok(JSON.parse(storage.dump()[BREAKER_KEY]).dieza.until > now());
  // другой экземпляр видит то же состояние (общий localStorage)
  assert.equal(createBreaker({ storage, now }).isOpen('dieza'), true);
  now.advance(24 * 3600 * 1000 - 1);
  assert.equal(b.isOpen('dieza'), true);
  now.advance(2);
  assert.equal(b.isOpen('dieza'), false);
  // после остывания снова нужно 3 сбоя
  b.failure('dieza');
  assert.equal(b.isOpen('dieza'), false);
});

test('предохранитель: успех сбрасывает счётчик, reset снимает блокировку', () => {
  const now = fakeClock();
  const b = createBreaker({ storage: fakeStorage(), now });
  b.failure('a'); b.failure('a'); b.success('a'); b.failure('a'); b.failure('a');
  assert.equal(b.isOpen('a'), false);
  b.failure('a');
  assert.equal(b.isOpen('a'), true);
  b.reset('a');
  assert.equal(b.isOpen('a'), false);
  b.failure('x'); b.failure('x'); b.failure('x');
  b.reset();
  assert.equal(b.isOpen('x'), false);
});

test('предохранитель: без localStorage и при падающем storage живёт в памяти', () => {
  const now = fakeClock();
  const mem = createBreaker({ storage: null, now });
  mem.failure('a'); mem.failure('a'); mem.failure('a');
  assert.equal(mem.isOpen('a'), true);

  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const b = createBreaker({ storage: broken, now });
  b.failure('a'); b.failure('a'); b.failure('a');
  assert.equal(b.isOpen('a'), true);

  const garbage = fakeStorage();
  garbage.setItem(BREAKER_KEY, '{not json');
  assert.equal(createBreaker({ storage: garbage, now }).isOpen('a'), false);
});

test('getJson: 200, 404, ошибки, таймаут, отмена', async () => {
  const f = mockFetch([
    ['/ok', { body: { a: 1 } }],
    ['/missing', { status: 404, body: { message: 'nope' } }],
    ['/boom', { status: 500, body: 'oops' }],
    ['/rate', { status: 429, body: '', headers: { 'retry-after': '7' } }],
    ['/bad', { body: '<html>' }],
    ['/hang', { hang: true }],
  ]);
  assert.deepEqual((await getJson('https://x/ok', { fetch: f })).data, { a: 1 });
  assert.equal((await getJson('https://x/missing', { fetch: f })).status, 404);
  await assert.rejects(getJson('https://x/boom', { fetch: f }), (e) => e instanceof SourceError && e.code === 'http' && e.status === 500);
  await assert.rejects(getJson('https://x/rate', { fetch: f }), (e) => e.code === 'rate' && e.retryAfter === 7);
  await assert.rejects(getJson('https://x/bad', { fetch: f }), (e) => e.code === 'parse');
  await assert.rejects(getJson('https://x/hang', { fetch: f, timeoutMs: 20 }), (e) => e.code === 'timeout' && e.message === 'не отвечает');
  const ctrl = new AbortController();
  const p = getJson('https://x/hang', { fetch: f, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
  await assert.rejects(getJson('https://x/ok', { fetch: f, signal: ctrl.signal }), (e) => e.name === 'AbortError');
  const down = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(getJson('https://x/ok', { fetch: down }), (e) => e.code === 'network');
});
