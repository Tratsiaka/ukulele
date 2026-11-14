import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, matchRoute, resolveRoute, isFullscreenPath, DEFAULT_PATH } from '../../src/app/routes.js';
import { parseHref, toRoute, withQuery, navigate, route } from '../../src/app/router.js';
import { shareTargetPath } from '../../src/app/share-target.js';

test('matchRoute: параметры и точное совпадение', () => {
  assert.deepEqual(matchRoute('/song/:id/train', '/song/abc/train'), { id: 'abc' });
  assert.deepEqual(matchRoute('/chords/:name', '/chords/F%23m'), { name: 'F#m' });
  assert.deepEqual(matchRoute('/today', '/today/'), {});
  assert.equal(matchRoute('/song/:id', '/song/abc/train'), null);
  assert.equal(matchRoute('/songs', '/song'), null);
  assert.equal(matchRoute('/chords/:name', '/chords'), null);
  assert.deepEqual(matchRoute('/chords/:name', '/chords/%E0%A4%A'), { name: '%E0%A4%A' });
});

test('resolveRoute: таблица из ARCHITECTURE.md', () => {
  const cases = {
    '/today': ['Today', false],
    '/practice': ['Practice', true],
    '/learn': ['Learn', false],
    '/learn/lesson/l1-1': ['Lesson', true],
    '/songs': ['Songs', false],
    '/songs/import': ['SongImport', true],
    '/song/x1': ['SongView', true],
    '/song/x1/train': ['SongTrainer', true],
    '/chords': ['Chords', false],
    '/chords/Am': ['Chords', false],
    '/tools': ['Tools', false],
    '/tools/tuner': ['Tools', false],
    '/settings': ['Settings', true],
    '/onboarding': ['Onboarding', true],
  };
  for (const [path, [screen, full]] of Object.entries(cases)) {
    const r = resolveRoute(path);
    assert.ok(r, path);
    assert.equal(r.def.screen, screen, path);
    assert.equal(isFullscreenPath(path), full, path);
  }
  assert.equal(resolveRoute('/nope'), null);
  assert.equal(new Set(ROUTES.map((r) => r.pattern)).size, ROUTES.length);
});

test('parseHref и toRoute', () => {
  assert.deepEqual(parseHref('#/songs?q=%D0%BA%D0%B8%D0%BD%D0%BE&tab=find'), {
    path: '/songs',
    query: { q: 'кино', tab: 'find' },
    search: 'q=%D0%BA%D0%B8%D0%BD%D0%BE&tab=find',
  });
  assert.equal(parseHref('').path, DEFAULT_PATH);
  assert.equal(parseHref('#/').path, DEFAULT_PATH);
  assert.equal(parseHref('#//songs//').path, '/songs');
  const r = toRoute('#/song/abc/train?from=today');
  assert.equal(r.screen, 'SongTrainer');
  assert.deepEqual(r.params, { id: 'abc' });
  assert.deepEqual(r.query, { from: 'today' });
  assert.equal(r.href, '/song/abc/train?from=today');
  assert.equal(r.full, true);
  assert.equal(toRoute('/practice?min=10').query.min, '10');
  const unknown = toRoute('#/whatever');
  assert.equal(unknown.path, DEFAULT_PATH);
  assert.equal(unknown.tab, 'today');
});

test('withQuery пропускает пустые значения', () => {
  assert.equal(withQuery('/songs', { q: 'кино', tab: 'find', x: '', y: null, z: undefined }), '/songs?q=%D0%BA%D0%B8%D0%BD%D0%BE&tab=find');
  assert.equal(withQuery('/songs'), '/songs');
  assert.equal(toRoute(withQuery('/songs', { q: 'a b&c' })).query.q, 'a b&c');
});

test('navigate без DOM меняет сигнал', () => {
  navigate('/chords/Am');
  assert.equal(route.value.screen, 'Chords');
  assert.equal(route.value.params.name, 'Am');
  navigate('/today');
  assert.equal(route.value.path, '/today');
});

test('shareTargetPath', () => {
  assert.equal(shareTargetPath(''), null);
  assert.equal(shareTargetPath('?source=pwa'), null);
  assert.equal(shareTargetPath('?share=1&title=&text=%20'), null);
  const p = shareTargetPath('?share=1&title=Kino&text=%D0%9F%D0%B5%D1%81%D0%BD%D1%8F&url=https%3A%2F%2Fakkords.pro%2Fx');
  const r = toRoute(p);
  assert.equal(r.screen, 'SongImport');
  assert.deepEqual(r.query, { title: 'Kino', text: 'Песня', url: 'https://akkords.pro/x' });
});
