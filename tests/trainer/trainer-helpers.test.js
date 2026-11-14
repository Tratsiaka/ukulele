import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSong, transposeSong } from '../../src/core/song.js';
import { STRUM_PATTERNS } from '../../src/core/curriculum.js';
import {
  STAGES, SPEED_STEPS, POLISH_PLAYS, normalizeTrainer, isStage, stageStates, firstOpenStage, doneCount, nextStage,
  stageLabel, mainProgression, topPairs, chordPlan, chordSummary, strumSetup, openPatch, speedLabel, nearestSpeed,
  defaultSpeed, playOutcome, shouldSuggestPolish, pairDrilledPatch, createPracticeClock,
} from '../../src/screens/trainer-helpers.js';

const SONG = parseSong(`{title: Тест}
{key: Am}

{start_of_verse: Куплет}
[Am]Раз, два, [Dm]три, [E7]четыре,
[Am]пять, [Dm]шесть, [E7]семь, [Am]восемь.
[C]Снова [G]и [Am]снова.
{end_of_verse}
`);

const emptyProgress = { knownChords: {}, pairs: {}, strum: {}, lessonsDone: {}, practice: {}, streakBest: 0, onboarded: true };

// ---------- этапы ----------

test('normalizeTrainer заполняет пропуски и чистит мусор', () => {
  assert.deepEqual(normalizeTrainer(undefined), {
    chords: false, changes: false, strum: false, play: false, plays: 0, pairs: [], speed: 0,
  });
  const t = normalizeTrainer({ chords: 1, plays: '3', pairs: ['A|B', 5], speed: 7 });
  assert.equal(t.chords, true);
  assert.equal(t.plays, 3);
  assert.deepEqual(t.pairs, ['A|B']);
  assert.equal(t.speed, 1);
});

test('этапы: порядок, подписи, следующий', () => {
  assert.deepEqual(STAGES.map((s) => s.id), ['chords', 'changes', 'strum', 'play']);
  assert.equal(stageLabel('strum'), 'Ритм');
  assert.equal(nextStage('chords'), 'changes');
  assert.equal(nextStage('play'), null);
  assert.equal(isStage('play'), true);
  assert.equal(isStage('nope'), false);
});

test('firstOpenStage — первый непройденный, всё пройдено → «Играем»', () => {
  assert.equal(firstOpenStage(undefined), 'chords');
  assert.equal(firstOpenStage({ chords: true }), 'changes');
  assert.equal(firstOpenStage({ chords: true, changes: true }), 'strum');
  assert.equal(firstOpenStage({ chords: true, strum: true }), 'changes');
  assert.equal(firstOpenStage({ chords: true, changes: true, strum: true, play: true }), 'play');
});

test('stageStates и doneCount', () => {
  const st = stageStates({ chords: true, strum: true });
  assert.deepEqual(st.map((s) => s.done), [true, false, true, false]);
  assert.deepEqual(st.map((s) => s.index), [0, 1, 2, 3]);
  assert.equal(doneCount({ chords: true, strum: true }), 2);
  assert.equal(doneCount(null), 0);
});

// ---------- аккорды песни ----------

test('mainProgression — первые 4 разных аккорда по порядку', () => {
  assert.deepEqual(mainProgression(SONG), ['Am', 'Dm', 'E7', 'C']);
  assert.deepEqual(mainProgression(SONG, 2), ['Am', 'Dm']);
  assert.deepEqual(mainProgression(null), []);
});

test('mainProgression после транспонирования', () => {
  assert.deepEqual(mainProgression(transposeSong(SONG, 3)), ['Cm', 'Fm', 'G7', 'Eb']);
});

test('topPairs — три самых частых перехода с ключами', () => {
  const pairs = topPairs(SONG);
  assert.equal(pairs.length, 3);
  assert.deepEqual(pairs[0], { a: 'Am', b: 'Dm', count: 2, key: 'Am|Dm' });
  assert.ok(pairs.every((p) => p.key === [p.a, p.b].sort().join('|')));
  assert.ok(pairs[0].count >= pairs[1].count && pairs[1].count >= pairs[2].count);
  assert.deepEqual(topPairs(parseSong('[C]один аккорд')), []);
});

test('chordPlan: знакомые, замены, новые, без аппликатуры', () => {
  const plan = chordPlan(['Am', 'Am7', 'E', 'G7', 'Dm', 'Xyz7', 'Am'], ['Am', 'E7', 'G'], (n) => !['Dm', 'Xyz7'].includes(n));
  assert.deepEqual(plan, [
    { name: 'Am', status: 'known' },
    { name: 'Am7', status: 'sub', as: 'Am' },
    { name: 'E', status: 'sub', as: 'E7' },
    { name: 'G7', status: 'sub', as: 'G' },
    { name: 'Dm', status: 'noshape' },
    { name: 'Xyz7', status: 'noshape' },
  ]);
});

test('chordPlan с настоящими аппликатурами', () => {
  const plan = chordPlan(['C', 'F', 'Bb'], ['C']);
  assert.deepEqual(plan.map((c) => c.status), ['known', 'new', 'new']);
});

test('chordSummary', () => {
  const s = chordSummary(chordPlan(['C', 'Am7', 'F', 'G'], ['C', 'Am']));
  assert.equal(s.total, 4);
  assert.equal(s.ready, 2);
  assert.deepEqual(s.toLearn, ['F', 'G']);
  assert.equal(s.allReady, false);
  assert.equal(chordSummary(chordPlan(['C'], ['C'])).allReady, true);
});

// ---------- бой ----------

test('strumSetup: бой песни и темп из диапазона его уровня', () => {
  const s = strumSetup({ strum: 'island' }, emptyProgress);
  assert.equal(s.patternId, 'island');
  assert.deepEqual(s.range, [70, 90]);
  assert.equal(s.bpm, 70);
});

test('strumSetup: без боя у песни — бой текущего уровня', () => {
  const s = strumSetup({}, emptyProgress);
  assert.equal(s.patternId, 'quarters');
  assert.equal(s.bpm, 50);
  assert.equal(strumSetup({ strum: 'нет-такого' }, emptyProgress).patternId, 'quarters');
});

test('strumSetup: рекорд зажимается в диапазон', () => {
  const p = (bestBpm) => ({ ...emptyProgress, strum: { du: { bestBpm, history: [] } } });
  assert.equal(strumSetup({ strum: 'du' }, p(72)).bpm, 72);
  assert.equal(strumSetup({ strum: 'du' }, p(120)).bpm, 80);
  assert.equal(strumSetup({ strum: 'du' }, p(40)).bpm, 60);
});

test('strumSetup всегда даёт существующий бой', () => {
  for (const id of [...STRUM_PATTERNS.map((p) => p.id), undefined, '']) {
    const s = strumSetup({ strum: id }, null);
    assert.ok(STRUM_PATTERNS.some((p) => p.id === s.patternId));
    assert.ok(s.bpm >= s.range[0] && s.bpm <= s.range[1]);
  }
});

// ---------- игра и статусы ----------

test('openPatch: «новая» → «учу», остальные без изменений', () => {
  assert.deepEqual(openPatch({ status: 'new' }), { status: 'learning' });
  for (const status of ['learning', 'playing', 'polished']) assert.equal(openPatch({ status }), null);
  assert.equal(openPatch(undefined), null);
});

test('speedLabel и nearestSpeed', () => {
  assert.equal(speedLabel(0.6), '60 %');
  assert.equal(speedLabel(1), '100 %');
  assert.equal(nearestSpeed(0.79), 0.8);
  assert.equal(nearestSpeed(5), 1);
  assert.equal(nearestSpeed(0), 0.6);
});

test('defaultSpeed: следующая ступень после пройденной', () => {
  assert.equal(defaultSpeed(undefined), 0.6);
  assert.equal(defaultSpeed({ speed: 0.6 }), 0.8);
  assert.equal(defaultSpeed({ speed: 0.8 }), 1);
  assert.equal(defaultSpeed({ speed: 1 }), 1);
  assert.equal(defaultSpeed({ play: true, speed: 0.6 }), 1);
});

test('playOutcome на 60 %: запоминает скорость, статус не трогает, дальше 80 %', () => {
  const r = playOutcome({ status: 'learning', trainer: { plays: 1 } }, 0.6);
  assert.deepEqual(r.patch, { trainer: { speed: 0.6 } });
  assert.equal(r.finished, false);
  assert.equal(r.next, 0.8);
  assert.equal(r.suggestPolish, false);
});

test('playOutcome не понижает пройденную скорость', () => {
  const r = playOutcome({ status: 'learning', trainer: { plays: 4, speed: 0.8 } }, 0.6);
  assert.equal(r.patch.trainer.speed, 0.8);
});

test('playOutcome на 100 %: этап пройден, статус «играю»', () => {
  const r = playOutcome({ status: 'learning', trainer: { plays: 2, speed: 0.8 } }, 1);
  assert.deepEqual(r.patch, { trainer: { speed: 1, play: true }, status: 'playing' });
  assert.equal(r.finished, true);
  assert.equal(r.next, null);
});

test('playOutcome: отполированная остаётся отполированной, «играю» не переписывается', () => {
  assert.equal(playOutcome({ status: 'polished', trainer: { plays: 9 } }, 1).patch.status, undefined);
  assert.equal(playOutcome({ status: 'playing', trainer: { plays: 3 } }, 1).patch.status, undefined);
});

test('после 5 игр предлагаем «отполировано»', () => {
  assert.equal(playOutcome({ status: 'learning', trainer: { plays: POLISH_PLAYS - 1 } }, 1).suggestPolish, false);
  assert.equal(playOutcome({ status: 'learning', trainer: { plays: POLISH_PLAYS } }, 1).suggestPolish, true);
  assert.equal(playOutcome({ status: 'learning', trainer: { plays: POLISH_PLAYS } }, 0.6).suggestPolish, true);
  assert.equal(playOutcome({ status: 'polished', trainer: { plays: 12 } }, 1).suggestPolish, false);
  assert.equal(shouldSuggestPolish({ status: 'playing', trainer: { plays: 6 } }), true);
  assert.equal(shouldSuggestPolish(null), false);
});

test('SPEED_STEPS — 60 → 80 → 100 %', () => {
  assert.deepEqual([...SPEED_STEPS], [0.6, 0.8, 1]);
});

test('pairDrilledPatch: этап пройден, когда прогнаны все пары', () => {
  const keys = ['Am|Dm', 'Dm|E7', 'Am|E7'];
  let t = {};
  let p = pairDrilledPatch(t, 'Am|Dm', keys);
  assert.deepEqual(p, { pairs: ['Am|Dm'] });
  t = { ...t, ...p };
  p = pairDrilledPatch(t, 'Am|Dm', keys);
  assert.deepEqual(p.pairs, ['Am|Dm']);
  t = { ...t, ...pairDrilledPatch(t, 'Dm|E7', keys) };
  p = pairDrilledPatch(t, 'Am|E7', keys);
  assert.deepEqual(p, { pairs: ['Am|Dm', 'Dm|E7', 'Am|E7'], changes: true });
});

// ---------- учёт времени ----------

test('createPracticeClock: меньше 30 с не пишет', () => {
  const c = createPracticeClock();
  c.add(29);
  assert.equal(c.take(), null);
  assert.equal(c.pending, 29);
  c.add(1);
  assert.deepEqual(c.take(), { seconds: 30, session: true });
  assert.equal(c.pending, 0);
  assert.equal(c.logged, true);
});

test('createPracticeClock: занятие считается один раз, потом только время', () => {
  const c = createPracticeClock({ minSeconds: 30 });
  c.add(45);
  assert.deepEqual(c.take(), { seconds: 45, session: true });
  assert.equal(c.take(), null);
  c.add(5);
  assert.deepEqual(c.take(), { seconds: 5, session: false });
  c.add(-3);
  c.add(Number.NaN);
  assert.equal(c.take(), null);
});
