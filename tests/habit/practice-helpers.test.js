import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIRM_CLOSE_SECONDS, brokenRecords, clockMs, clockPause, clockResume, clockSeconds, clockStart, closePolicy,
  formatLongDate, freezeHint, isFirstDay, learnSummary, learnedChords, lessonPreview, nowPlaying, pairLabel,
  plannedSeconds, playableCount, recordsSummary, segmentFill, streakChange, trainerStages, unlockedSongs, weekGoal,
  weekStrip,
} from '../../src/screens/practice-helpers.js';
import { defaultProgress } from '../../src/core/progress.js';
import { LEVELS, LESSONS } from '../../src/core/curriculum.js';

const TODAY = '2026-11-14'; // суббота
const song = (id, chords, extra = {}) => ({ id, title: id, artist: '', chords, status: 'new', updatedAt: 0, ...extra });

// ---------- дата и неделя ----------

test('formatLongDate: день недели и месяц в родительном падеже', () => {
  assert.equal(formatLongDate('2026-11-14'), 'суббота, 14 ноября');
  assert.equal(formatLongDate('2026-11-16'), 'понедельник, 16 ноября');
  assert.equal(formatLongDate('2027-01-03'), 'воскресенье, 3 января');
});

test('weekStrip: пн–вс, состояния дней', () => {
  const strip = weekStrip({
    today: TODAY,
    activeDays: ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-08'],
    frozen: ['2026-11-11'],
    practice: { '2026-11-10': { seconds: 600 } },
  });
  assert.equal(strip.length, 7);
  assert.deepEqual(strip.map((d) => d.label), ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  assert.equal(strip[0].day, '2026-11-09');
  assert.equal(strip[6].day, '2026-11-15');
  assert.deepEqual(strip.map((d) => d.state), ['done', 'done', 'frozen', 'done', 'missed', 'today', 'future']);
  assert.equal(strip[1].seconds, 600);
  assert.equal(strip[5].isToday, true);
});

test('weekStrip: сегодня уже засчитано — done, а не today', () => {
  const strip = weekStrip({ today: TODAY, activeDays: [TODAY] });
  assert.equal(strip[5].state, 'done');
  assert.equal(strip[5].isToday, true);
});

test('weekStrip: дни до самого первого занятия — не пропуски', () => {
  assert.deepEqual(weekStrip({ today: TODAY, activeDays: [] }).map((d) => d.state),
    ['before', 'before', 'before', 'before', 'before', 'today', 'future']);
  assert.deepEqual(weekStrip({ today: TODAY, activeDays: ['2026-11-11'] }).map((d) => d.state),
    ['before', 'before', 'done', 'missed', 'missed', 'today', 'future']);
});

test('weekStrip: понедельник — первый день, остальные в будущем', () => {
  const strip = weekStrip({ today: '2026-11-16', activeDays: [] });
  assert.deepEqual(strip.map((d) => d.state), ['today', 'future', 'future', 'future', 'future', 'future', 'future']);
});

test('weekGoal: доля, минуты, достигнута ли цель', () => {
  assert.deepEqual(weekGoal(0, 4200), { ratio: 0, minutes: 0, goalMinutes: 70, reached: false, leftMinutes: 70 });
  const half = weekGoal(2100, 4200);
  assert.equal(half.ratio, 0.5);
  assert.equal(half.minutes, 35);
  assert.equal(half.leftMinutes, 35);
  const over = weekGoal(5000, 4200);
  assert.equal(over.ratio, 1);
  assert.equal(over.reached, true);
  assert.equal(over.leftMinutes, 0);
  // кривая цель не ломает деление
  assert.equal(weekGoal(30, 0).ratio, 0.5);
});

test('freezeHint: сработала, в запасе, потрачена, нет серии', () => {
  assert.equal(freezeHint({ today: TODAY, frozen: ['2026-11-13'], freezesLeft: 0, streak: 5 }).text,
    'Заморозка спасла серию вчера. Новая — с понедельника.');
  assert.match(freezeHint({ today: TODAY, frozen: ['2026-11-11'], streak: 5 }).text, /в среду/);
  assert.match(freezeHint({ today: TODAY, frozen: ['2026-11-10'], streak: 5 }).text, /во вторник/);
  assert.equal(freezeHint({ today: TODAY, frozen: ['2026-11-02'], freezesLeft: 1, streak: 3 }).kind, 'ready');
  assert.equal(freezeHint({ today: TODAY, frozen: [], freezesLeft: 0, streak: 3 }).kind, 'spent');
  assert.equal(freezeHint({ today: TODAY, frozen: [], freezesLeft: 1, streak: 0 }), null);
});

// ---------- главная ----------

test('isFirstDay: ни занятий, ни уроков', () => {
  const p = defaultProgress();
  assert.equal(isFirstDay(p), true);
  assert.equal(isFirstDay({ ...p, practice: { [TODAY]: { seconds: 0, sessions: 1 } } }), true);
  assert.equal(isFirstDay({ ...p, practice: { [TODAY]: { seconds: 30, sessions: 1 } } }), false);
  assert.equal(isFirstDay({ ...p, lessonsDone: { 'l0-hold': TODAY } }), false);
});

test('learnSummary: уровень, прогресс, следующий урок; весь путь пройден', () => {
  const p = defaultProgress();
  const first = learnSummary(p);
  assert.equal(first.levelId, 'L0');
  assert.equal(first.levelNumber, 0);
  assert.equal(first.done, 0);
  assert.equal(first.lesson.id, LEVELS[0].lessons[0]);
  assert.equal(first.finished, false);

  const two = learnSummary({ ...p, lessonsDone: { [LEVELS[0].lessons[0]]: TODAY, [LEVELS[0].lessons[1]]: TODAY } });
  assert.equal(two.done, 2);
  assert.equal(two.ratio, 2 / LEVELS[0].lessons.length);
  assert.equal(two.lesson.id, LEVELS[0].lessons[2]);

  const all = Object.fromEntries(Object.keys(LESSONS).map((id) => [id, TODAY]));
  const end = learnSummary({ ...p, lessonsDone: all });
  assert.equal(end.finished, true);
  assert.equal(end.lesson, null);
});

test('trainerStages: четыре этапа, сколько пройдено и что дальше', () => {
  const none = trainerStages(undefined);
  assert.equal(none.stages.length, 4);
  assert.equal(none.done, 0);
  assert.equal(none.next, 'Аккорды');
  const two = trainerStages({ trainer: { chords: true, changes: true, strum: false, play: false } });
  assert.equal(two.done, 2);
  assert.equal(two.next, 'Ритм');
  assert.equal(trainerStages({ trainer: { chords: true, changes: true, strum: true, play: true } }).next, null);
});

test('nowPlaying: только «учу» и «играю», свежие сверху, не больше n', () => {
  const list = [
    song('a', ['C'], { status: 'learning', lastPlayedAt: 10 }),
    song('b', ['C'], { status: 'new', lastPlayedAt: 99 }),
    song('c', ['C'], { status: 'playing', lastPlayedAt: 50 }),
    song('d', ['C'], { status: 'polished' }),
    song('e', ['C'], { status: 'learning', deleted: true }),
    song('f', ['C'], { status: 'learning', updatedAt: 5 }),
  ];
  assert.deepEqual(nowPlaying(list).map((s) => s.id), ['c', 'a', 'f']);
  assert.deepEqual(nowPlaying(list, 1).map((s) => s.id), ['c']);
});

test('playableCount и recordsSummary: топ пар, лучший бой, песни, следующий аккорд', () => {
  const songs = [
    song('s1', ['C', 'Am']),
    song('s2', ['C', 'F', 'G']),
    song('s3', ['Am', 'Dm', 'E7']),
    song('s4', ['C', 'Dm', 'G']),
    song('s5', ['Am', 'Dm']),
  ];
  const known = ['C', 'Am', 'F', 'G'];
  assert.equal(playableCount(songs, known), 2);
  assert.equal(playableCount(songs, []), 0);

  const p = {
    ...defaultProgress(),
    pairs: {
      'Am|C': { best: 42, last: 40 }, 'C|G': { best: 30, last: 30 }, 'F|G': { best: 18, last: 18 },
      'Am|F': { best: 35, last: 35 }, 'C|F': { best: 0, last: 0 },
    },
    strum: { quarters: { bestBpm: 70 }, du: { bestBpm: 84 } },
  };
  const r = recordsSummary(p, songs, known);
  assert.deepEqual(r.omcTop, [{ a: 'Am', b: 'C', best: 42 }, { a: 'Am', b: 'F', best: 35 }, { a: 'C', b: 'G', best: 30 }]);
  assert.equal(r.strumBest.patternId, 'du');
  assert.equal(r.strumBest.bpm, 84);
  assert.ok(r.strumBest.name.length > 0);
  assert.equal(r.playable, 2);
  // Dm открывает s4 и s5 (s3 ещё ждёт E7)
  assert.deepEqual(r.nextChord, { chord: 'Dm', gain: 2 });
  assert.equal(r.empty, false);

  const empty = recordsSummary(defaultProgress(), [], []);
  assert.equal(empty.empty, true);
  assert.equal(empty.nextChord, null);
  assert.equal(empty.strumBest, null);
});

// ---------- учёт времени ----------

test('часы занятия: пауза на скрытой вкладке не считается', () => {
  let c = clockStart(1000);
  assert.equal(clockMs(c, 4000), 3000);
  c = clockPause(c, 4000);
  assert.equal(clockMs(c, 60_000), 3000, 'на паузе время стоит');
  assert.equal(clockPause(c, 70_000), c, 'повторная пауза ничего не меняет');
  c = clockResume(c, 100_000);
  assert.equal(clockMs(c, 102_500), 5500);
  assert.equal(clockResume(c, 200_000), c, 'повторный старт не сбрасывает отсчёт');
  assert.equal(clockSeconds(c, 102_999), 5);
  // часы назад (смена системного времени) не уводят в минус
  assert.equal(clockMs(clockStart(5000), 1000), 0);
});

test('closePolicy: до минуты — без вопросов и без записи, больше — спросить и засчитать', () => {
  assert.deepEqual(closePolicy(0), { confirm: false, logSeconds: 0 });
  assert.deepEqual(closePolicy(CONFIRM_CLOSE_SECONDS), { confirm: false, logSeconds: 0 });
  assert.deepEqual(closePolicy(61.7), { confirm: true, logSeconds: 61 });
  assert.deepEqual(closePolicy(NaN), { confirm: false, logSeconds: 0 });
});

test('segmentFill и plannedSeconds', () => {
  const blocks = [{ seconds: 30 }, { seconds: 120 }, { seconds: 150 }];
  assert.equal(plannedSeconds(blocks), 300);
  assert.deepEqual(segmentFill(blocks, 0, 0), [0, 0, 0]);
  assert.deepEqual(segmentFill(blocks, 1, 60), [1, 0.5, 0]);
  assert.deepEqual(segmentFill(blocks, 2, 999), [1, 1, 1]);
  assert.deepEqual(segmentFill([{ seconds: 0 }], 0, 5), [1]);
});

// ---------- итог ----------

test('brokenRecords: рекорды и первые замеры, без ухудшений', () => {
  const before = {
    ...defaultProgress(),
    pairs: { 'Am|C': { best: 30 }, 'C|G': { best: 25 } },
    strum: { du: { bestBpm: 80 } },
  };
  const after = {
    ...before,
    pairs: { 'Am|C': { best: 34 }, 'C|G': { best: 25 }, 'C|F': { best: 22 } },
    strum: { du: { bestBpm: 84 }, quarters: { bestBpm: 60 } },
  };
  const recs = brokenRecords(before, after);
  assert.deepEqual(recs.filter((r) => !r.first).map((r) => (r.kind === 'omc' ? `${r.a}|${r.b}:${r.from}>${r.to}` : `${r.patternId}:${r.from}>${r.to}`)),
    ['Am|C:30>34', 'du:80>84']);
  assert.deepEqual(recs.filter((r) => r.first).map((r) => (r.kind === 'omc' ? r.b : r.patternId)), ['F', 'quarters']);
  assert.ok(recs.findIndex((r) => r.first) > recs.findIndex((r) => !r.first), 'рекорды раньше первых замеров');
  assert.deepEqual(brokenRecords(after, after), []);
});

test('learnedChords и unlockedSongs', () => {
  const before = { ...defaultProgress(), knownChords: { C: {}, Am: {}, F: {}, G: {} } };
  const after = { ...before, knownChords: { ...before.knownChords, Dm: {} } };
  assert.deepEqual(learnedChords(before, after), ['Dm']);
  assert.deepEqual(learnedChords(after, after), []);
  const songs = [song('s1', ['C', 'Am']), song('s4', ['C', 'Dm', 'G']), song('s5', ['Am', 'Dm']), song('s3', ['Am', 'Dm', 'E7'])];
  assert.equal(unlockedSongs(songs, ['C', 'Am', 'F', 'G'], ['C', 'Am', 'F', 'G', 'Dm']), 2);
  assert.equal(unlockedSongs(songs, ['C', 'Am'], ['C', 'Am']), 0);
  assert.equal(unlockedSongs(songs, [], []), 0);
});

test('streakChange: +1 только когда день засчитан этим занятием', () => {
  assert.deepEqual(streakChange({ streak: 4, doneToday: false }, { streak: 5, doneToday: true }),
    { from: 4, to: 5, grew: true, counted: true });
  assert.equal(streakChange({ streak: 5, doneToday: true }, { streak: 5, doneToday: true }).grew, false);
  assert.deepEqual(streakChange({ streak: 4, doneToday: false }, { streak: 4, doneToday: false }),
    { from: 4, to: 4, grew: false, counted: false });
  assert.equal(streakChange({ streak: 0, doneToday: false }, { streak: 1, doneToday: true }).grew, true);
});

test('pairLabel и lessonPreview', () => {
  assert.equal(pairLabel('C', 'Am'), 'C ⇄ Am');
  assert.equal(pairLabel('Bb', 'F', (x) => x.replace('b', '♭')), 'B♭ ⇄ F');
  const id = Object.keys(LESSONS)[0];
  const prev = lessonPreview(id);
  assert.equal(prev.id, id);
  assert.equal(prev.title, LESSONS[id].title);
  assert.ok(Array.isArray(prev.steps));
  assert.equal(lessonPreview('nope'), null);
});
