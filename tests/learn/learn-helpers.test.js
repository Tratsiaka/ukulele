import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LESSON_ORDER, BEGINNER_CHORDS, SESSION_OPTIONS, levelNumber, levelCoverage, continueLesson, nextLessonAfter, pathModel,
  lessonChords, newChordsOf, lessonTags, stepLabel, paragraphs, createActiveClock, practiceSeconds, MAX_LESSON_SECONDS,
  libraryUnlocks, parseTime, practiceUrl,
} from '../../src/screens/learn-helpers.js';
import { LEVELS, LESSONS, lessonById } from '../../src/core/curriculum.js';

const done = (...ids) => ({ lessonsDone: Object.fromEntries(ids.map((id) => [id, '2026-11-14'])) });
const allOf = (levelId) => LEVELS.find((l) => l.id === levelId).lessons;

test('LESSON_ORDER: все уроки уровней по порядку, без дыр', () => {
  assert.equal(LESSON_ORDER.length, LEVELS.reduce((n, l) => n + l.lessons.length, 0));
  assert.equal(LESSON_ORDER[0], 'l0-hold');
  for (const id of LESSON_ORDER) assert.ok(LESSONS[id], id);
});

test('BEGINNER_CHORDS — основные аккорды L0–L3', () => {
  assert.deepEqual([...BEGINNER_CHORDS], ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A']);
});

test('SESSION_OPTIONS совпадают с допустимыми sessionMinutes', () => {
  assert.deepEqual(SESSION_OPTIONS.map((o) => o.minutes), [5, 10, 18]);
  assert.equal(SESSION_OPTIONS.filter((o) => o.recommended).length, 1);
});

test('levelNumber и levelCoverage', () => {
  assert.equal(levelNumber('L0'), 0);
  assert.equal(levelNumber({ id: 'L6' }), 6);
  assert.equal(levelNumber('x'), null);
  assert.equal(levelNumber(null), null);
  for (const l of LEVELS) assert.ok(levelCoverage(l.id)?.text, l.id);
  assert.equal(levelCoverage('L1').share, 20);
  assert.equal(levelCoverage('L9'), null);
});

test('continueLesson: новичок начинает с первого урока', () => {
  assert.equal(continueLesson({ lessonsDone: {} })?.id, 'l0-hold');
  assert.equal(continueLesson({})?.id, 'l0-hold');
});

test('continueLesson: следующий непройденный по порядку', () => {
  assert.equal(continueLesson(done('l0-hold', 'l0-tune'), ['C'])?.id, 'l0-c');
  assert.equal(continueLesson(done(...allOf('L0')), ['C', 'Am'])?.id, 'l1-f');
});

test('continueLesson: «уже играю» — уровни со знакомыми аккордами пропускаются', () => {
  assert.equal(continueLesson({ lessonsDone: {} }, ['C', 'Am', 'F', 'G'])?.id, 'l2-dm');
  assert.equal(continueLesson({ lessonsDone: {} }, ['C', 'Am'])?.id, 'l1-f');
  // занимается на L2, L0 и L1 не открывал, но аккорды знает → продолжаем на L2
  assert.equal(continueLesson(done('l2-dm'), ['C', 'Am', 'F', 'G', 'Dm'])?.id, 'l2-em');
});

test('continueLesson: подсмотренный урок впереди не уводит с текущего уровня', () => {
  const p = done(...allOf('L0'), 'l1-f', 'l4-bb');
  assert.equal(continueLesson(p, ['C', 'Am', 'F', 'Bb', 'Gm'])?.id, 'l1-g');
});

test('continueLesson: пропущенный уровень без знакомых аккордов не пропускается', () => {
  // открыл урок на L2, но C и Am не знает — возвращаем на L0
  assert.equal(continueLesson(done('l2-dm'), ['Dm'])?.id, 'l0-hold');
});

test('continueLesson: всё пройдено → null; пропущенные уроки возвращаются в конце', () => {
  assert.equal(continueLesson(done(...LESSON_ORDER)), null);
  const known = BEGINNER_CHORDS;
  const p = done(...LESSON_ORDER.filter((id) => !id.startsWith('l0-')));
  assert.equal(continueLesson(p, known)?.id, 'l0-hold', 'всё дальше пройдено — остаётся пропущенный L0');
});

test('nextLessonAfter: следующий по пути после пройденного', () => {
  assert.equal(nextLessonAfter(done('l0-hold'), 'l0-hold')?.id, 'l0-tune');
  assert.equal(nextLessonAfter(done(...allOf('L0')), 'l0-song')?.id, 'l1-f');
  // после урока впереди — следующий урок там же
  assert.equal(nextLessonAfter(done('l0-hold', 'l4-bb'), 'l4-bb')?.id, 'l4-waltz');
  // после последнего урока пути — дыра в начале
  assert.equal(nextLessonAfter(done('l6-e', 'l6-capo'), 'l6-capo')?.id, 'l0-hold');
  assert.equal(nextLessonAfter(done(...LESSON_ORDER), 'l6-capo'), null);
  assert.equal(nextLessonAfter({ lessonsDone: {} }, 'nope')?.id, 'l0-hold');
});

test('pathModel: состояния уровней', () => {
  const p = done(...allOf('L0'), 'l1-f', 'l4-bb');
  const m = pathModel(p, ['C', 'Am', 'F', 'Bb']);
  assert.equal(m.next?.id, 'l1-g');
  assert.equal(m.focusId, 'L1');
  const st = Object.fromEntries(m.levels.map((l) => [l.level.id, l.state]));
  assert.deepEqual(st, { L0: 'done', L1: 'current', L2: 'ahead', L3: 'ahead', L4: 'open', L5: 'ahead', L6: 'ahead' });
  const l1 = m.levels.find((l) => l.level.id === 'L1');
  assert.equal(l1.done, 1);
  assert.equal(l1.nextId, 'l1-g');
  assert.equal(m.done, allOf('L0').length + 2);
  assert.equal(m.total, LESSON_ORDER.length);
});

test('pathModel: пропущенные уровни позади текущего — open', () => {
  const m = pathModel({ lessonsDone: {} }, ['C', 'Am', 'F', 'G']);
  assert.equal(m.focusId, 'L2');
  assert.equal(m.levels[0].state, 'open');
  assert.equal(m.levels[1].state, 'open');
  assert.equal(m.levels[2].state, 'current');
});

test('pathModel: весь путь пройден', () => {
  const m = pathModel(done(...LESSON_ORDER));
  assert.equal(m.next, null);
  assert.equal(m.focusId, 'L6');
  assert.ok(m.levels.every((l) => l.state === 'done' && l.nextId === null));
});

test('lessonChords, newChordsOf, lessonTags', () => {
  assert.deepEqual(lessonChords(lessonById('l3-a7-d')), ['A7', 'D']);
  assert.deepEqual(lessonChords(lessonById('l0-hold')), []);
  assert.deepEqual(lessonChords(null), []);
  assert.deepEqual(newChordsOf(lessonById('l3-a7-d'), ['A7', 'C']), ['D']);
  assert.deepEqual(newChordsOf(lessonById('l3-a-sevenths'), new Set()), ['A', 'G7', 'C7', 'D7']);
  const t = lessonTags(lessonById('l0-change'));
  assert.deepEqual(t.chords, []);
  assert.deepEqual(t.parts, ['бой', 'смены']);
  assert.deepEqual(lessonTags(lessonById('l0-tune')).parts, ['тюнер']);
  assert.deepEqual(lessonTags(lessonById('l1-four')).parts, ['бой', 'смены', 'песня']);
});

test('stepLabel и paragraphs', () => {
  assert.equal(stepLabel({ type: 'text', title: 'Посадка', body: '' }), 'Посадка');
  assert.equal(stepLabel({ type: 'text', body: 'x' }), 'Коротко');
  assert.equal(stepLabel({ type: 'omc', pair: ['C', 'G'], target: 30 }), 'Смены за минуту');
  assert.equal(stepLabel({ type: 'weird' }), 'Шаг');
  assert.deepEqual(paragraphs('Раз.\n\nДва.\n \nТри.'), ['Раз.', 'Два.', 'Три.']);
  assert.deepEqual(paragraphs(''), []);
  assert.deepEqual(paragraphs(undefined), []);
  // у каждого текстового шага в уроках есть хотя бы один абзац
  for (const l of Object.values(LESSONS)) {
    for (const s of l.steps) if (s.type === 'text') assert.ok(paragraphs(s.body).length > 0, l.id);
  }
});

test('createActiveClock: считает только видимое время', () => {
  const c = createActiveClock(1000);
  assert.equal(c.running, true);
  assert.equal(c.elapsed(4000), 3000);
  c.pause(5000);
  assert.equal(c.running, false);
  assert.equal(c.elapsed(60_000), 4000);
  c.pause(70_000); // повторная пауза ничего не ломает
  c.resume(100_000);
  c.resume(101_000); // повторный resume не сдвигает начало
  assert.equal(c.elapsed(102_000), 6000);
  const hidden = createActiveClock(0, false);
  assert.equal(hidden.elapsed(5000), 0);
  hidden.resume(5000);
  assert.equal(hidden.elapsed(6500), 1500);
  assert.equal(createActiveClock(10).elapsed(5), 0, 'время назад не уходит в минус');
});

test('practiceSeconds: округление и потолок', () => {
  assert.equal(practiceSeconds(0), 0);
  assert.equal(practiceSeconds(1499), 1);
  assert.equal(practiceSeconds(-5000), 0);
  assert.equal(practiceSeconds(NaN), 0);
  assert.equal(practiceSeconds(10 * 3600 * 1000), MAX_LESSON_SECONDS);
});

test('libraryUnlocks: прирост по уровням с подбором тональности', () => {
  const u = libraryUnlocks([
    ['C', 'Am'],
    ['C', 'F', 'G'],
    ['D', 'G', 'A'], // сдвигом → C, F, G — L1
    ['Bb', 'Gm', 'Eb'], // сдвигом → C, Am, F — тоже L1
    ['Am', 'Dm', 'Em'], // три минора — только с Dm и Em (L2)
    ['Am', 'Dm', 'E7'], // нужен септаккорд — L3
    [],
    null,
  ]);
  assert.equal(u.L0.total, 6);
  assert.deepEqual(
    LEVELS.map((l) => u[l.id].gained),
    LEVELS.map((l) => ({ L0: 1, L1: 3, L2: 1, L3: 1, L4: 0, L5: 0, L6: 0 })[l.id]),
  );
  assert.equal(u.L1.playable, 4);
  assert.equal(u.L6.playable, 6);
  assert.deepEqual(libraryUnlocks([]).L3, { playable: 0, gained: 0, total: 0 });
});

test('parseTime и practiceUrl', () => {
  assert.deepEqual(parseTime('07:30'), { hour: 7, minute: 30 });
  assert.deepEqual(parseTime('19:05:00'), { hour: 19, minute: 5 });
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('7.30'), null);
  assert.equal(parseTime(''), null);
  assert.equal(practiceUrl('https://x.github.io/ukulele/#/onboarding'), 'https://x.github.io/ukulele/#/practice');
  assert.equal(practiceUrl('https://x.github.io/ukulele/'), 'https://x.github.io/ukulele/#/practice');
});
