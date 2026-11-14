import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeDays, addDays, applyChordKnown, applyChordReview, applyLessonDone, applyOmc, applyOnboarded, applyPractice,
  applyStrum, dayDiff, defaultProgress, mergeProgress, normalizeProgress, weekSeconds, weekStart,
} from '../../src/core/progress.js';

const D = '2026-11-16'; // понедельник

test('даты: сдвиг через месяц и год, разница, начало недели с понедельника', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // переход на летнее время в Европе
  assert.equal(dayDiff('2026-11-16', '2026-11-23'), 7);
  assert.equal(dayDiff('2026-11-23', '2026-11-16'), -7);
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // воскресенье
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});

test('normalizeProgress дополняет поля и не ломается на мусоре', () => {
  assert.deepEqual(normalizeProgress(null), defaultProgress());
  assert.deepEqual(normalizeProgress('x'), defaultProgress());
  const p = normalizeProgress({ knownChords: { C: { since: D, box: 1, due: D } }, pairs: 5, streakBest: 'a' });
  assert.deepEqual(p.knownChords, { C: { since: D, box: 1, due: D } });
  assert.deepEqual(p.pairs, {});
  assert.equal(p.streakBest, 0);
  assert.equal(p.onboarded, false);
});

test('applyChordKnown: новый аккорд в коробку 1 с повтором завтра, повторная отметка ничего не меняет', () => {
  const p0 = defaultProgress();
  const p1 = applyChordKnown(p0, 'C', true, D);
  assert.deepEqual(p1.knownChords.C, { since: D, box: 1, due: '2026-11-17' });
  assert.notEqual(p1, p0);
  assert.deepEqual(p0.knownChords, {}); // исходник не мутирует
  assert.equal(applyChordKnown(p1, 'C', true, '2026-11-20'), p1);
  assert.deepEqual(applyChordKnown(p1, 'C', false, D).knownChords, {});
});

test('applyChordReview: Лейтнер по первому повтору дня; провал сбрасывает в коробку 1', () => {
  let p = applyChordKnown(defaultProgress(), 'Am', true, D);
  p = applyChordReview(p, 'Am', true, '2026-11-17');
  assert.equal(p.knownChords.Am.box, 2);
  assert.equal(p.knownChords.Am.due, '2026-11-20');
  assert.equal(applyChordReview(p, 'Am', false, '2026-11-17'), p); // второй раз за день — без изменений
  p = applyChordReview(p, 'Am', false, '2026-11-20');
  assert.equal(p.knownChords.Am.box, 1);
  assert.equal(p.knownChords.Am.due, '2026-11-21');
  assert.equal(p.knownChords.Am.since, D);
  // Незнакомый аккорд: успех делает его известным, провал ничего не делает.
  assert.equal(applyChordReview(p, 'F', false, D), p);
  assert.equal(applyChordReview(p, 'F', true, D).knownChords.F.box, 1);
});

test('applyOmc: рекорд, история по дню, Лейтнер по первой попытке дня', () => {
  let p = defaultProgress();
  p = applyOmc(p, 'C', 'Am', 32, { today: D, target: 30 });
  let r = p.pairs['Am|C'];
  assert.deepEqual(r, { best: 32, last: 32, history: [{ day: D, count: 32 }], box: 1, due: '2026-11-17' });

  // Тот же день: лучше результат — история и рекорд обновляются, коробка нет.
  p = applyOmc(p, 'Am', 'C', 36, { today: D, target: 30 });
  r = p.pairs['Am|C'];
  assert.equal(r.best, 36);
  assert.equal(r.last, 36);
  assert.deepEqual(r.history, [{ day: D, count: 36 }]);
  assert.equal(r.box, 1);

  // Следующий день, успех → коробка 2, повтор через 3 дня.
  p = applyOmc(p, 'C', 'Am', 35, { today: '2026-11-17', target: 30 });
  r = p.pairs['Am|C'];
  assert.equal(r.box, 2);
  assert.equal(r.due, '2026-11-20');
  assert.equal(r.history.length, 2);

  // Падение больше чем на 20 % от прошлого — сброс, даже если цель взята.
  p = applyOmc(p, 'C', 'Am', 31, { today: '2026-11-20', target: 30 }); // 31 ≥ 0.8·35 = 28 — это не падение
  assert.equal(p.pairs['Am|C'].box, 3);
  p = applyOmc(p, 'C', 'Am', 24, { today: '2026-11-27', target: 20 });
  assert.equal(p.pairs['Am|C'].box, 1);
  assert.equal(p.pairs['Am|C'].due, '2026-11-28');
  assert.equal(p.pairs['Am|C'].best, 36);

  // Ниже цели — коробка 1.
  const q = applyOmc(defaultProgress(), 'F', 'G', 18, { today: D, target: 30 });
  assert.equal(q.pairs['F|G'].box, 1);
  assert.equal(q.pairs['F|G'].due, '2026-11-17');
});

test('applyStrum: лучший темп и одна точка истории на день', () => {
  let p = applyStrum(defaultProgress(), 'du', 72, D);
  p = applyStrum(p, 'du', 68, D);
  p = applyStrum(p, 'du', 75, '2026-11-17');
  assert.deepEqual(p.strum.du, { bestBpm: 75, history: [{ day: D, bpm: 72 }, { day: '2026-11-17', bpm: 75 }] });
});

test('applyPractice копит время и занятия, рекорд серии обновляется', () => {
  let p = applyPractice(defaultProgress(), 300, { today: D });
  p = applyPractice(p, 120, { today: D, session: false });
  assert.deepEqual(p.practice[D], { seconds: 420, sessions: 1 });
  p = applyPractice(p, 600, { today: '2026-11-17' });
  p = applyPractice(p, 600, { today: '2026-11-18' });
  assert.equal(p.streakBest, 3);
  assert.equal(applyPractice(p, -50, { today: D }).practice[D].seconds, 420);
});

test('applyLessonDone: первая дата сохраняется, аккорды из урока становятся известными, день засчитан', () => {
  let p = applyLessonDone(defaultProgress(), 'l0-c', D);
  assert.equal(p.lessonsDone['l0-c'], D);
  assert.ok(p.knownChords.C);
  assert.equal(p.streakBest, 1);
  p = applyLessonDone(p, 'l0-c', '2026-11-18');
  assert.equal(p.lessonsDone['l0-c'], D);
  p = applyLessonDone(p, 'l0-hold', D);
  assert.deepEqual(Object.keys(p.knownChords), ['C']);
  assert.ok(applyLessonDone(p, 'l3-a-sevenths', D).knownChords.G7);
  assert.equal(applyLessonDone(p, 'nope', D).lessonsDone.nope, D);
});

test('activeDays: минута занятий или урок; weekSeconds — с понедельника по воскресенье', () => {
  const p = {
    ...defaultProgress(),
    practice: { '2026-11-15': { seconds: 600, sessions: 1 }, [D]: { seconds: 30, sessions: 1 },
      '2026-11-22': { seconds: 120, sessions: 1 }, '2026-11-23': { seconds: 90, sessions: 1 } },
    lessonsDone: { 'l0-hold': '2026-11-17' },
  };
  assert.deepEqual(activeDays(p), ['2026-11-15', '2026-11-17', '2026-11-22', '2026-11-23']);
  assert.equal(weekSeconds(p, '2026-11-19'), 150);
  assert.equal(weekSeconds(p, '2026-11-23'), 90);
});

test('applyOnboarded', () => {
  const p = applyOnboarded(defaultProgress());
  assert.equal(p.onboarded, true);
  assert.equal(applyOnboarded(p), p);
});

test('mergeProgress: идемпотентно и без потерь', () => {
  let a = defaultProgress();
  a = applyChordKnown(a, 'C', true, '2026-11-10');
  a = applyOmc(a, 'C', 'Am', 30, { today: '2026-11-10', target: 30 });
  a = applyStrum(a, 'du', 70, '2026-11-10');
  a = applyPractice(a, 300, { today: '2026-11-10' });
  a = applyLessonDone(a, 'l0-hold', '2026-11-11');

  let b = defaultProgress();
  b = applyChordKnown(b, 'Am', true, '2026-11-12');
  b = applyOmc(b, 'C', 'Am', 40, { today: '2026-11-12', target: 30 });
  b = applyStrum(b, 'du', 65, '2026-11-12');
  b = applyPractice(b, 200, { today: '2026-11-10' });
  b = applyLessonDone(b, 'l0-hold', '2026-11-09');
  b = { ...b, onboarded: true, streakBest: 9 };

  assert.deepEqual(mergeProgress(a, a), normalizeProgress(a));
  const m = mergeProgress(a, b);
  assert.deepEqual(Object.keys(m.knownChords).sort(), ['Am', 'C']);
  assert.equal(m.pairs['Am|C'].best, 40);
  assert.equal(m.pairs['Am|C'].last, 40);
  assert.equal(m.pairs['Am|C'].history.length, 2);
  assert.equal(m.strum.du.bestBpm, 70);
  assert.equal(m.strum.du.history.length, 2);
  assert.deepEqual(m.practice['2026-11-10'], { seconds: 300, sessions: 1 });
  assert.equal(m.lessonsDone['l0-hold'], '2026-11-09');
  assert.equal(m.onboarded, true);
  assert.equal(m.streakBest, 9);
  assert.deepEqual(mergeProgress(m, b), m);
  assert.deepEqual(mergeProgress(defaultProgress(), null), defaultProgress());
});
