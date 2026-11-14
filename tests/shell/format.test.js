import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, countLabel, formatClock, formatDuration, formatDay, dayKey, chordLabel } from '../../src/lib/format.js';

const DAYS = ['день', 'дня', 'дней'];

test('plural: русские формы', () => {
  const cases = { 0: 'дней', 1: 'день', 2: 'дня', 4: 'дня', 5: 'дней', 11: 'дней', 12: 'дней', 14: 'дней', 21: 'день', 22: 'дня', 25: 'дней', 101: 'день', 111: 'дней', 112: 'дней', 1001: 'день' };
  for (const [n, word] of Object.entries(cases)) assert.equal(plural(Number(n), DAYS), word, `n=${n}`);
  assert.equal(plural(-3, DAYS), 'дня');
  assert.equal(plural(1.5, DAYS), 'дня');
  assert.equal(countLabel(3, ['песня', 'песни', 'песен']), '3 песни');
});

test('formatClock и formatDuration', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(59.9), '0:59');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatDuration(45), '45 с');
  assert.equal(formatDuration(720), '12 мин');
  assert.equal(formatDuration(89), '1 мин');
  assert.equal(formatDuration(3600), '1 ч');
  assert.equal(formatDuration(3900), '1 ч 5 мин');
  assert.equal(formatDuration(65, { clock: true }), '1:05');
  assert.equal(formatDuration(undefined), '0 с');
});

test('formatDay: сегодня, вчера, дата', () => {
  const today = '2026-11-14';
  assert.equal(formatDay('2026-11-14', { today }), 'сегодня');
  assert.equal(formatDay('2026-11-13', { today }), 'вчера');
  assert.equal(formatDay('2026-11-15', { today }), 'завтра');
  assert.equal(formatDay('2026-11-01', { today }), '1 нояб.');
  assert.equal(formatDay('2026-05-09', { today }), '9 мая');
  assert.equal(formatDay('2025-12-31', { today: '2026-01-02' }), '31 дек. 2025');
  assert.equal(formatDay('2026-01-01', { today: '2026-01-02' }), 'вчера');
  assert.equal(formatDay('мусор', { today }), '');
});

test('dayKey: день начинается в 04:00', () => {
  assert.equal(dayKey(new Date(2026, 10, 14, 3, 59)), '2026-11-13');
  assert.equal(dayKey(new Date(2026, 10, 14, 4, 0)), '2026-11-14');
  assert.equal(formatDay(new Date(2026, 10, 14, 2, 0).getTime(), { today: '2026-11-13' }), 'сегодня');
});

test('chordLabel: знаки и нотация H', () => {
  assert.equal(chordLabel('Bb'), 'B♭');
  assert.equal(chordLabel('F#m'), 'F♯m');
  assert.equal(chordLabel('Am7'), 'Am7');
  assert.equal(chordLabel('C/G'), 'C/G');
  assert.equal(chordLabel('Ab/Eb'), 'A♭/E♭');
  assert.equal(chordLabel('Bm', { notation: 'H' }), 'Hm');
  assert.equal(chordLabel('Bb', { notation: 'H' }), 'B');
  assert.equal(chordLabel('G/B', { notation: 'H' }), 'G/H');
  assert.equal(chordLabel(''), '');
});
