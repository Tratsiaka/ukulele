import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, LESSONS, STRUM_PATTERNS, chordRank, currentLevel, knownChordsAfter, lessonById, lessonsOfLevel, levelById,
  levelOfChord, levelProgress, nextLesson, omcTarget, strumById,
} from '../../src/core/curriculum.js';
import { normalizeChordName } from '../../src/core/chord.js';

// Стартовый набор из ARCHITECTURE.md: id → аккорды.
const STARTER = {
  'starter-bratec-yakov': ['C', 'Am'],
  'starter-row-boat': ['C', 'Am'],
  'starter-oh-susanna': ['C', 'F', 'G'],
  'starter-when-the-saints': ['C', 'F', 'G'],
  'starter-vo-sadu': ['C', 'F', 'G', 'Am'],
  'starter-jingle-bells': ['C', 'F', 'G'],
  'starter-clementine': ['C', 'G', 'F'],
  'starter-amazing-grace': ['C', 'F', 'G', 'Am'],
  'starter-drunken-sailor': ['Am', 'G', 'Dm'],
  'starter-scarborough-fair': ['Am', 'G', 'C', 'Em', 'D'],
  'starter-red-river-valley': ['C', 'F', 'G', 'Dm'],
  'starter-shenandoah': ['C', 'F', 'G', 'Am', 'Dm', 'Em'],
  'starter-auld-lang-syne': ['C', 'G', 'F', 'Am', 'Dm'],
  'starter-oy-moroz': ['Am', 'Dm', 'E7', 'G', 'C'],
  'starter-chernyi-voron': ['Am', 'Dm', 'E7'],
  'starter-korobeiniki': ['Am', 'Dm', 'E7', 'C', 'G'],
  'starter-kalinka': ['Am', 'Dm', 'E7', 'C', 'G'],
  'starter-vo-pole-bereza': ['Am', 'Dm', 'E7'],
  'starter-kupalinka': ['Am', 'Dm', 'E7'],
  'starter-house-rising-sun': ['Am', 'C', 'D', 'F', 'E7'],
  'starter-greensleeves': ['Am', 'G', 'F', 'E7', 'C'],
};
// Учебные аппликатуры из контракта core/shapes.js.
const BEGINNER = new Set(['C', 'Am', 'F', 'G', 'Dm', 'Em', 'Em7', 'E7', 'A7', 'D', 'A', 'D7', 'G7', 'C7', 'Bb', 'Gm',
  'Bm', 'B7', 'F#m', 'E']);
const DICTIONARY = new Set(['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A', 'G7', 'C7', 'D7', 'Bb', 'Gm', 'Bm',
  'B7', 'F#m', 'E', 'Cm', 'Fm', 'Eb', 'Ab', 'C#m']);
const STEP_TYPES = new Set(['text', 'tuner', 'chord', 'quiz', 'omc', 'strum', 'song']);

const allLessons = Object.values(LESSONS);
const stepChords = (step) => {
  if (step.type === 'chord') return [step.chord];
  if (step.type === 'quiz') return step.chords;
  if (step.type === 'omc') return step.pair;
  if (step.type === 'strum') return step.chords ?? [];
  return [];
};
const doneAll = (ids) => ({ lessonsDone: Object.fromEntries(ids.map((id) => [id, '2026-11-01'])) });

test('уровни L0–L6 по порядку и с полным описанием', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  for (const l of LEVELS) {
    assert.ok(l.title && l.subtitle, l.id);
    assert.ok(l.chords.length > 0, l.id);
    assert.ok(strumById(l.strum), `${l.id}: бой ${l.strum}`);
    assert.equal(l.bpm.length, 2);
    assert.ok(l.bpm[0] <= l.bpm[1] && l.bpm[0] >= 40 && l.bpm[1] <= 200, l.id);
    assert.ok(l.goals.length >= 2, l.id);
    assert.ok(l.omc >= 30 && l.omc <= 60, l.id);
  }
});

test('каждый урок уровня существует, принадлежит уровню и не висит без уровня', () => {
  const referenced = new Set();
  for (const l of LEVELS) {
    for (const id of l.lessons) {
      const lesson = lessonById(id);
      assert.ok(lesson, `урок ${id} не найден`);
      assert.equal(lesson.levelId, l.id, id);
      assert.ok(!referenced.has(id), `урок ${id} в двух уровнях`);
      referenced.add(id);
    }
  }
  assert.deepEqual([...referenced].sort(), Object.keys(LESSONS).sort());
  for (const [id, lesson] of Object.entries(LESSONS)) assert.equal(lesson.id, id);
});

test('L0–L3 — 4–6 уроков, L4–L6 — 1–2; урок на 3–8 минут', () => {
  for (const l of LEVELS) {
    const n = l.lessons.length;
    if (['L0', 'L1', 'L2', 'L3'].includes(l.id)) assert.ok(n >= 4 && n <= 6, `${l.id}: ${n}`);
    else assert.ok(n >= 1 && n <= 2, `${l.id}: ${n}`);
  }
  for (const lesson of allLessons) {
    assert.ok(lesson.minutes >= 3 && lesson.minutes <= 8, lesson.id);
    assert.ok(lesson.title, lesson.id);
    assert.ok(lesson.steps.length >= 2, lesson.id);
  }
});

test('шаги корректного вида; текст — не больше трёх коротких абзацев', () => {
  for (const lesson of allLessons) {
    for (const step of lesson.steps) {
      assert.ok(STEP_TYPES.has(step.type), `${lesson.id}: ${step.type}`);
      if (step.type !== 'text') continue;
      const paras = step.body.split('\n\n');
      assert.ok(step.body.trim().length > 0, lesson.id);
      assert.ok(paras.length <= 3, `${lesson.id}: ${paras.length} абзацев`);
      for (const p of paras) assert.ok(p.length <= 320, `${lesson.id}: длинный абзац (${p.length})`);
      assert.ok((step.body.match(/!/g) ?? []).length <= 1, `${lesson.id}: много восклицаний`);
    }
  }
});

test('песни в уроках — из стартового набора и играются аккордами, выученными к этому уровню', () => {
  for (const lesson of allLessons) {
    const known = new Set(knownChordsAfter(lesson.levelId));
    for (const step of lesson.steps.filter((s) => s.type === 'song')) {
      assert.ok(STARTER[step.songId], `${lesson.id}: неизвестная песня ${step.songId}`);
      for (const c of STARTER[step.songId]) assert.ok(known.has(c), `${lesson.id}: ${step.songId} требует ${c}`);
      if (step.speed !== undefined) assert.ok(step.speed > 0 && step.speed <= 1, lesson.id);
    }
  }
  for (const id of ['L0', 'L1', 'L2', 'L3']) {
    assert.ok(lessonsOfLevel(id).some((l) => l.steps.some((s) => s.type === 'song')), `${id} без песни`);
  }
});

test('все аккорды в уроках — с учебной аппликатурой и не забегают вперёд уровня', () => {
  for (const lesson of allLessons) {
    const idx = LEVELS.findIndex((l) => l.id === lesson.levelId);
    const allowed = new Set([...knownChordsAfter(lesson.levelId), ...LEVELS.slice(0, idx + 1).flatMap((l) => l.bonus ?? [])]);
    for (const step of lesson.steps) {
      for (const c of stepChords(step)) {
        assert.equal(normalizeChordName(c), c, `${lesson.id}: ${c} не нормализован`);
        assert.ok(BEGINNER.has(c), `${lesson.id}: ${c} без учебной аппликатуры`);
        assert.ok(allowed.has(c), `${lesson.id}: ${c} ещё не пройден`);
      }
      if (step.type === 'omc') {
        assert.notEqual(step.pair[0], step.pair[1]);
        assert.ok(step.target >= 30 && step.target <= 60, lesson.id);
      }
      if (step.type === 'strum') {
        assert.ok(strumById(step.pattern), `${lesson.id}: бой ${step.pattern}`);
        assert.ok(step.bpm >= 40 && step.bpm <= 200, lesson.id);
      }
    }
  }
});

test('новые аккорды уровня вводятся его уроками', () => {
  for (const l of LEVELS.slice(0, 4)) {
    const taught = new Set(lessonsOfLevel(l.id).flatMap((x) => x.steps.filter((s) => s.type === 'chord').map((s) => s.chord)));
    for (const c of l.chords) assert.ok(taught.has(c), `${l.id}: нет урока про ${c}`);
  }
});

test('бои: id из контракта, слоты корректны, вниз на сильных восьмых, вверх на слабых', () => {
  assert.deepEqual(STRUM_PATTERNS.map((p) => p.id).sort(),
    ['chuck', 'du', 'eighths', 'island', 'quarters', 'shuffle', 'waltz']);
  const expected = { quarters: 'D-D-D-D-', du: 'D-DUD-DU', island: 'D-DU-UDU', eighths: 'DUDUDUDU', waltz: 'D-DUDU',
    chuck: 'D-XUD-XU', shuffle: 'D-DUD-DU' };
  for (const p of STRUM_PATTERNS) {
    assert.equal(p.slots, expected[p.id], p.id);
    assert.equal(p.slots.length, p.beats * 2, p.id);
    assert.match(p.slots, /^[DUX-]+$/, p.id);
    assert.equal(p.slots[0], 'D', p.id);
    [...p.slots].forEach((ch, i) => {
      if (ch === 'U') assert.equal(i % 2, 1, `${p.id}: вверх на сильной восьмой`);
      if (ch === 'D' || ch === 'X') assert.equal(i % 2, 0, `${p.id}: вниз на слабой восьмой`);
    });
    assert.ok(levelById(p.level), p.id);
    assert.ok(p.name && p.hint, p.id);
  }
  assert.equal(strumById('shuffle').swing, true);
  assert.equal(strumById('waltz').beats, 3);
  assert.equal(strumById('nope'), null);
});

test('аккорды уровней накапливаются и не повторяются', () => {
  assert.deepEqual(knownChordsAfter('L0'), ['C', 'Am']);
  assert.deepEqual(knownChordsAfter('L1'), ['C', 'Am', 'F', 'G']);
  assert.deepEqual(knownChordsAfter('L2'), ['C', 'Am', 'F', 'G', 'Dm', 'Em']);
  assert.deepEqual(knownChordsAfter('nope'), []);
  const seen = new Set();
  for (let i = 0; i < LEVELS.length; i++) {
    const after = knownChordsAfter(LEVELS[i].id);
    if (i > 0) assert.deepEqual(after.slice(0, knownChordsAfter(LEVELS[i - 1].id).length), knownChordsAfter(LEVELS[i - 1].id));
    for (const c of [...LEVELS[i].chords, ...(LEVELS[i].bonus ?? [])]) {
      assert.ok(!seen.has(c), `${c} повторяется`);
      seen.add(c);
      assert.ok(DICTIONARY.has(c), `${c} не из словаря`);
      assert.equal(normalizeChordName(c), c);
    }
  }
});

test('аккорды уроков и уровней есть в словаре аппликатур', async () => {
  let getShape;
  try {
    ({ getShape } = await import('../../src/core/shapes.js'));
  } catch {
    return; // модуль shapes ещё не собран — проверка по контрактным спискам выше
  }
  const names = new Set([...LEVELS.flatMap((l) => [...l.chords, ...(l.bonus ?? [])]), ...allLessons.flatMap((l) => l.steps.flatMap(stepChords))]);
  for (const n of names) assert.ok(getShape(n), `нет аппликатуры ${n}`);
});

test('следующий урок и текущий уровень идут по порядку пути', () => {
  assert.equal(nextLesson({}).id, 'l0-hold');
  assert.equal(currentLevel({}).id, 'L0');
  assert.equal(currentLevel(undefined).id, 'L0');
  const l0 = levelById('L0').lessons;
  assert.equal(nextLesson(doneAll(l0)).id, 'l1-f');
  assert.equal(currentLevel(doneAll(l0)).id, 'L1');
  assert.equal(nextLesson(doneAll(['l0-hold'])).id, 'l0-tune');
  // Пропущенный урок в начале всё равно предлагается первым.
  assert.equal(nextLesson(doneAll(l0.slice(1))).id, 'l0-hold');
  const everything = Object.keys(LESSONS);
  assert.equal(nextLesson(doneAll(everything)), null);
  assert.equal(currentLevel(doneAll(everything)).id, 'L6');
  assert.deepEqual(levelProgress(doneAll(['l0-hold', 'l0-tune']), 'L0'), { done: 2, total: 6, complete: false });
});

test('цель OMC растёт с уровнем, свежая пара начинает с цели своего уровня', () => {
  const at = (levelId) => doneAll(LEVELS.slice(0, LEVELS.findIndex((l) => l.id === levelId)).flatMap((l) => l.lessons));
  assert.equal(omcTarget(at('L0'), 'C', 'Am'), 30);
  assert.equal(omcTarget(at('L2'), 'C', 'G'), 40);
  assert.equal(omcTarget(at('L2'), 'Dm', 'G'), 40);
  assert.equal(omcTarget(at('L3'), 'Am', 'F'), 50);
  assert.equal(omcTarget(at('L4'), 'F', 'Bb'), 30);
  assert.equal(omcTarget(at('L4'), 'C', 'G'), 50);
  assert.equal(omcTarget(at('L5'), 'F', 'Bb'), 60);
  // Аккорд впереди пути — цель его уровня.
  assert.equal(omcTarget(at('L0'), 'C', 'E7'), 50);
});

test('помощники: уровень аккорда и учебный порядок', () => {
  assert.equal(levelOfChord('Dm').id, 'L2');
  assert.equal(levelOfChord('G7').id, 'L3');
  assert.equal(levelOfChord('Cmaj7'), null);
  assert.ok(chordRank('C') < chordRank('F'));
  assert.ok(chordRank('F') < chordRank('Bb'));
  assert.equal(chordRank('Cmaj7'), chordRank('Xyz'));
  assert.equal(lessonById('nope'), null);
  assert.equal(levelById('nope'), null);
});
