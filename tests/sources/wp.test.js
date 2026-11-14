// Синтетические ответы WP REST в форме akkords.pro и dieza.net. Тексты — народные или выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import {
  WP_SITES, buildSearchUrl, buildPostUrl, parsePost, splitTitleArtist, isNoisePost, rankPosts, searchAttempts, wpSearch,
  wpLoadPost, hitFromUrl, postCategories,
} from '../../src/sources/wp.js';
import { mockFetch, fakeClock } from './_mock.js';

const { akkords, dieza } = WP_SITES;
const term = (name, slug) => ({ taxonomy: 'category', name, slug });
const post = (id, title, link, content, cats = [], tags = []) => ({
  id, title: { rendered: title }, link, content: { rendered: content }, categories: cats.map((_, i) => i + 1),
  _links: {}, _embedded: { 'wp:term': [cats, tags.map((n) => ({ taxonomy: 'post_tag', name: n, slug: n }))] },
});

const VORON_HTML = '<p class="chords"><b>Куплет 1:</b>\n<span>Am</span>            <span>Dm</span>\nЧёрный ворон, чёрный ворон,\n</p>';
const BEREZA_PRE = '<pre class="chords">Am          Dm\nВо поле берёза стояла</pre>';

test('URL поиска и записи', () => {
  const u = new URL(buildSearchUrl(dieza, 'группа крови'));
  assert.equal(u.origin + u.pathname, 'https://dieza.net/wp-json/wp/v2/posts');
  assert.equal(u.searchParams.get('search'), 'группа крови');
  assert.equal(u.searchParams.get('search_columns'), 'post_title');
  assert.equal(u.searchParams.get('per_page'), '20');
  assert.equal(u.searchParams.get('_embed'), 'wp:term');
  assert.match(u.searchParams.get('_fields'), /content/);
  assert.equal(new URL(buildSearchUrl(akkords, 'x', { titleOnly: false })).searchParams.get('search_columns'), null);
  assert.match(buildPostUrl(akkords, { postId: 616 }), /^https:\/\/akkords\.pro\/wp-json\/wp\/v2\/posts\/616\?/);
  assert.equal(new URL(buildPostUrl(dieza, { slug: 'chyornyj-voron' })).searchParams.get('slug'), 'chyornyj-voron');
});

test('parsePost: akkords.pro — исполнитель из рубрики, текст из p.chords; статья блога — null', () => {
  const p = parsePost(post(11, 'Чёрный ворон', 'https://akkords.pro/songs/narodnye/chernyj-voron/', VORON_HTML,
    [term('Народные песни &amp; романсы', 'narodnye')], ['Песни на гитаре с боем']), akkords, { parser: DOMParser });
  assert.equal(p.postId, 11);
  assert.equal(p.title, 'Чёрный ворон');
  assert.equal(p.artist, 'Народные песни & романсы');
  assert.deepEqual(postCategories(post(1, '', '', '', [term('A', 'a')], ['t'])), [{ name: 'A', slug: 'a' }]);
  assert.equal(p.rawText, 'Куплет 1:\nAm            Dm\nЧёрный ворон, чёрный ворон,');
  assert.equal(parsePost(post(12, 'Квинтовый круг', 'https://akkords.pro/blog/krug/', '<p>статья</p>'), akkords, { parser: DOMParser }), null);
});

test('splitTitleArtist', () => {
  assert.deepEqual(splitTitleArtist('Кукушка', [term('Кино (Виктор Цой)', 'kino')]), { title: 'Кукушка', artist: 'Кино (Виктор Цой)' });
  assert.deepEqual(splitTitleArtist('Супергруппа &#8211; Неживая природа', [term('Авторские песни', 'avtorskie-pesni')]),
    { title: 'Неживая природа', artist: 'Супергруппа' });
  assert.deepEqual(splitTitleArtist('Yesterday', [term('Beatles, The', 'the-beatles-en')]), { title: 'Yesterday', artist: 'The Beatles' });
  assert.deepEqual(splitTitleArtist('Вагнер-Ангел', [term('Fateev', 'fateev')]), { title: 'Вагнер-Ангел', artist: 'Fateev' });
  assert.deepEqual(splitTitleArtist('Песня', []), { title: 'Песня', artist: '' });
});

test('isNoisePost: пародии, переводы, каверы', () => {
  const parody = term('Переделанные песни (пародии)', 'peredelannye-pesni-parodii');
  assert.equal(isNoisePost({ title: 'Blood Type (Группа крови)' }), true);
  assert.equal(isNoisePost({ title: 'Yesterday (Вчера)' }), true);
  assert.equal(isNoisePost({ title: 'Группа крови (Выпускной)', categories: [parody] }), true);
  assert.equal(isNoisePost({ title: 'Песня', url: 'https://dieza.net/akkordy/p-rus/peredelannye-pesni-parodii/x.html' }), true);
  assert.equal(isNoisePost({ title: 'Кукушка (кавер)' }), true);
  assert.equal(isNoisePost({ title: 'Группа крови (OST &#8220;Фильм&#8221;)' }), false);
  assert.equal(isNoisePost({ title: 'Герои 90-х (90-е)' }), false);
  assert.equal(isNoisePost({ title: 'Yesterday' }), false);
});

test('rankPosts: похожесть, затем более старая запись; OST чуть ниже', () => {
  const ranked = rankPosts('группа крови', [
    { postId: 194877, title: 'Группа крови (OST “Фильм”)', artist: 'Кто-то', rawTitle: 'Группа крови (OST “Фильм”)' },
    { postId: 191304, title: 'Остаться с тобой feat. гр. Кино', artist: 'X', rawTitle: 'Остаться с тобой feat. гр. Кино' },
    { postId: 191129, title: 'Группа крови', artist: 'Пародист', rawTitle: 'Группа крови' },
    { postId: 701, title: 'Группа крови', artist: 'Кино', rawTitle: 'Группа крови' },
  ]);
  assert.deepEqual(ranked.map((r) => r.postId), [701, 191129, 194877, 191304]);
  assert.equal(ranked[0].score, 1);
});

test('searchAttempts: целиком, без крайних слов, полный текст', () => {
  assert.deepEqual(searchAttempts(' кукушка '), [[{ q: 'кукушка', titleOnly: true }], [{ q: 'кукушка', titleOnly: false }]]);
  assert.deepEqual(searchAttempts('кино  кукушка'), [
    [{ q: 'кино кукушка', titleOnly: true }],
    [{ q: 'кукушка', titleOnly: true }, { q: 'кино', titleOnly: true }],
    [{ q: 'кино кукушка', titleOnly: false }],
  ]);
});

test('wpSearch: если по названию пусто — пробует без исполнителя; ранжирует по полному запросу', async () => {
  const f = mockFetch([
    [(u) => new URL(u).searchParams.get('search') === 'кино кукушка', { body: [] }],
    [(u) => new URL(u).searchParams.get('search') === 'кукушка', { body: [
      post(13874, 'Кукушка', 'https://akkords.pro/songs/drugaya/kukushka-2/', VORON_HTML, [term('Другая певица', 'drugaya')]),
      post(616, 'Кукушка', 'https://akkords.pro/songs/kino/kukushka/', VORON_HTML, [term('Кино (Виктор Цой)', 'kino')]),
    ] }],
    [(u) => new URL(u).searchParams.get('search') === 'кино', { body: [
      post(500, 'Про кино', 'https://akkords.pro/songs/x/pro-kino/', VORON_HTML, [term('Иные', 'x')]),
    ] }],
  ]);
  const hits = await wpSearch(akkords, 'кино кукушка', { fetch: f, parser: DOMParser });
  assert.deepEqual(hits.map((h) => h.postId), [616, 13874, 500]);
  assert.equal(hits[0].id, 'akkords:616');
  assert.equal(hits[0].sourceId, 'akkords');
  assert.equal(hits[0].artist, 'Кино (Виктор Цой)');
  assert.equal(hits[0].url, 'https://akkords.pro/songs/kino/kukushka/');
  assert.match(hits[0].rawText, /Чёрный ворон/);
  assert.equal(f.calls.length, 3); // целиком + два варианта; полнотекстовый не понадобился
});

test('wpSearch: dieza — шум отфильтрован, пустой ответ доходит до полнотекстового поиска', async () => {
  const f = mockFetch([
    [(u) => new URL(u).searchParams.get('search_columns') === 'post_title', { body: [] }],
    [(u) => !new URL(u).searchParams.get('search_columns'), { body: [
      post(176674, 'Берёза (Выпускной)', 'https://dieza.net/akkordy/p-rus/peredelannye-pesni-parodii/x.html', BEREZA_PRE,
        [term('Переделанные песни (пародии)', 'peredelannye-pesni-parodii')]),
      post(192948, 'Birch Tree (Во поле берёза)', 'https://dieza.net/akkordy/m/metal/birch.html', BEREZA_PRE, [term('Metal', 'metal')]),
      post(900, 'Во поле берёза стояла', 'https://dieza.net/akkordy/n-rus/narodnye/vo-pole.html', BEREZA_PRE, [term('Народные', 'narodnye')]),
    ] }],
  ]);
  const hits = await wpSearch(dieza, 'во поле берёза стояла', { fetch: f, parser: DOMParser });
  assert.deepEqual(hits.map((h) => h.postId), [900]);
  assert.equal(f.calls.length, 4);
});

test('wpSearch: после долгих попыток новые не начинает', async () => {
  const now = fakeClock();
  const f = mockFetch([[() => true, () => { now.advance(9000); return { body: [] }; }]]);
  const hits = await wpSearch(dieza, 'кино кукушка', { fetch: f, parser: DOMParser, now });
  assert.deepEqual(hits, []);
  assert.equal(f.calls.length, 1);
});

test('wpLoadPost: по slug и по id; пустая запись → notfound', async () => {
  const f = mockFetch([
    ['slug=vo-pole', { body: [post(900, 'Во поле берёза стояла', 'https://dieza.net/akkordy/n-rus/narodnye/vo-pole.html', BEREZA_PRE, [term('Народные', 'narodnye')])] }],
    ['/posts/901', { body: post(901, 'Пусто', 'https://dieza.net/akkordy/x/y.html', '') }],
    ['slug=nope', { body: [] }],
  ]);
  const p = await wpLoadPost(dieza, { slug: 'vo-pole' }, { fetch: f, parser: DOMParser });
  assert.equal(p.title, 'Во поле берёза стояла');
  assert.match(p.rawText, /^Am {10}Dm\n/);
  await assert.rejects(wpLoadPost(dieza, { postId: 901 }, { fetch: f, parser: DOMParser }), (e) => e.code === 'notfound');
  await assert.rejects(wpLoadPost(dieza, { slug: 'nope' }, { fetch: f, parser: DOMParser }), (e) => e.code === 'notfound');
});

test('hitFromUrl', () => {
  assert.deepEqual(hitFromUrl('https://akkords.pro/songs/kino/kukushka/'),
    { id: 'akkords:kukushka', sourceId: 'akkords', title: '', artist: '', url: 'https://akkords.pro/songs/kino/kukushka/', slug: 'kukushka' });
  assert.equal(hitFromUrl('https://www.dieza.net/akkordy/k-rus/kino/gruppa-krovi.html').slug, 'gruppa-krovi');
  assert.equal(hitFromUrl('https://akkords.pro/blog/kvintovyj-krug/'), null);
  assert.equal(hitFromUrl('https://example.com/songs/x/'), null);
  assert.equal(hitFromUrl('не адрес'), null);
});
