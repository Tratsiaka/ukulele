import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIORITY_PAIRS, buildSession, chordSequence, leitner, pairKey, practiceDay, streak, weakPairs,
} from '../../src/core/practice.js';
import { LEVELS, LESSONS, STRUM_PATTERNS } from '../../src/core/curriculum.js';
import { applyChordKnown, applyLessonDone, applyOmc, defaultProgress } from '../../src/core/progress.js';
import { dailyReminderIcs, escapeIcsText, foldIcsLine } from '../../src/lib/ics.js';

const TODAY = '2026-11-18'; // среда

const song = (id, chords, extra = {}) => ({
  id, title: id, artist: '', chords, status: 'new', fav: false, level: 'L1',
  text: `{title: ${id}}\n${chords.map((c) => `[${c}]ла-ла`).join(' ')} ${chords.map((c) => `[${c}]`).join(' ')}`,
  createdAt: 1, updatedAt: 1, ...extra,
});
const LIBRARY = [
  song('starter-bratec-yakov', ['C', 'Am'], { level: 'L0' }),
  song('starter-row-boat', ['C', 'Am'], { level: 'L0' }),
  song('starter-oh-susanna', ['C', 'F', 'G']),
  song('starter-vo-sadu', ['C', 'F', 'G', 'Am']),
  song('starter-drunken-sailor', ['Am', 'G', 'Dm'], { level: 'L2' }),
  song('starter-chernyi-voron', ['Am', 'Dm', 'E7'], { level: 'L3' }),
  song('guitar-key', ['G', 'D', 'Em', 'C'], { level: undefined }), // играется сдвигом на +5: C G Am F
  song('hard', ['Bm', 'F#m', 'E', 'A'], { level: undefined }),
];
const knowing = (names, base = defaultProgress()) => names.reduce((p, c) => applyChordKnown(p, c, true, '2026-11-01'), base);
const L1_DONE = Object.fromEntries([...LEVELS[0].lessons, ...LEVELS[1].lessons].map((id) => [id, '2026-11-02']));
const total = (s) => s.blocks.reduce((sum, b) => sum + b.seconds, 0);

test('practiceDay: день начинается в 04:00 по местному времени', () => {
  assert.equal(practiceDay(new Date(2026, 10, 14, 3, 59)), '2026-11-13');
  assert.equal(practiceDay(new Date(2026, 10, 14, 4, 0)), '2026-11-14');
  assert.equal(practiceDay(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
  assert.equal(practiceDay(new Date(2026, 11, 1, 2, 30)), '2026-11-30');
  assert.equal(practiceDay(new Date(2027, 0, 1, 0, 15)), '2026-12-31');
  assert.equal(practiceDay(new Date(2026, 2, 1, 1, 0)), '2026-02-28');
  assert.match(practiceDay(), /^\d{4}-\d{2}-\d{2}$/);
});

test('leitner: 1, 3, 7, 14, 30 дней; провал — снова коробка 1', () => {
  assert.deepEqual(leitner(0, true), { box: 1, days: 1 });
  assert.deepEqual(leitner(1, true), { box: 2, days: 3 });
  assert.deepEqual(leitner(2, true), { box: 3, days: 7 });
  assert.deepEqual(leitner(3, true), { box: 4, days: 14 });
  assert.deepEqual(leitner(4, true), { box: 5, days: 30 });
  assert.deepEqual(leitner(5, true), { box: 5, days: 30 });
  assert.deepEqual(leitner(4, false), { box: 1, days: 1 });
  assert.deepEqual(leitner(0, false), { box: 1, days: 1 });
});

test('pairKey не зависит от порядка', () => {
  assert.equal(pairKey('G', 'C'), 'C|G');
  assert.equal(pairKey('C', 'G'), 'C|G');
  assert.equal(pairKey('Am', 'F'), pairKey('F', 'Am'));
});

test('streak: подряд, сегодня ещё не занимался, пусто', () => {
  assert.deepEqual(streak([], TODAY), { current: 0, best: 0, doneToday: false, frozen: [], freezesLeft: 1 });
  const s = streak(['2026-11-16', '2026-11-17', '2026-11-18'], TODAY);
  assert.equal(s.current, 3);
  assert.equal(s.doneToday, true);
  // Сегодня ещё не занимался — серия жива.
  const y = streak(['2026-11-16', '2026-11-17'], TODAY);
  assert.equal(y.current, 2);
  assert.equal(y.doneToday, false);
  assert.deepEqual(y.frozen, []);
  // Будущие дни и дубли не считаются.
  assert.equal(streak(['2026-11-17', '2026-11-17', '2026-11-25'], TODAY).current, 1);
});

test('streak: пропуск закрывается заморозкой, вторая за неделю — уже нет', () => {
  const one = streak(['2026-11-16', '2026-11-18', '2026-11-19'], '2026-11-19');
  assert.equal(one.current, 3);
  assert.deepEqual(one.frozen, ['2026-11-17']);
  assert.equal(one.freezesLeft, 0);

  // Два пропуска в одну неделю: второй рвёт серию.
  const two = streak(['2026-11-16', '2026-11-18', '2026-11-20'], '2026-11-20');
  assert.equal(two.current, 1);
  assert.equal(two.best, 2);
  // Два дня подряд в одну неделю — не закрываются, и заморозка не тратится зря.
  const gap = streak(['2026-11-16', '2026-11-19'], '2026-11-19');
  assert.equal(gap.current, 1);
  assert.deepEqual(gap.frozen, []);
  assert.equal(gap.freezesLeft, 1);
  // Без заморозок любой пропуск рвёт серию.
  assert.equal(streak(['2026-11-16', '2026-11-18'], '2026-11-18', { freezesPerWeek: 0 }).current, 1);
  // Две заморозки в неделю.
  assert.equal(streak(['2026-11-16', '2026-11-19'], '2026-11-19', { freezesPerWeek: 2 }).current, 2);
});

test('streak: воскресенье и понедельник — разные недели, обе заморозки срабатывают', () => {
  const s = streak(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-24'], '2026-11-24');
  assert.equal(s.current, 4);
  assert.deepEqual(s.frozen, ['2026-11-22', '2026-11-23']);
  // Тот же случай, но сегодня (вторник) ещё не занимался: хвост закрыт, серия жива.
  const open = streak(['2026-11-19', '2026-11-20', '2026-11-21'], '2026-11-24');
  assert.equal(open.current, 3);
  assert.deepEqual(open.frozen, ['2026-11-22', '2026-11-23']);
  assert.equal(open.freezesLeft, 0);
  // Хвост из двух дней внутри одной недели — серия обнуляется, рекорд остаётся.
  const broken = streak(['2026-11-16', '2026-11-17', '2026-11-18'], '2026-11-21');
  assert.equal(broken.current, 0);
  assert.equal(broken.best, 3);
});

test('buildSession: длительность совпадает, в конце всегда песня, 5 минут — не больше трёх блоков', () => {
  const states = [
    defaultProgress(),
    { ...knowing(['C', 'Am', 'F', 'G']), lessonsDone: L1_DONE },
    knowing(['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A']),
    { ...knowing(['C', 'Am']), lessonsDone: Object.fromEntries(Object.keys(LESSONS).map((id) => [id, '2026-11-02'])) },
  ];
  const libraries = [LIBRARY, [], [LIBRARY[7]]];
  for (const progress of states) {
    for (const songs of libraries) {
      for (const minutes of [5, 10, 18]) {
        for (const today of ['2026-11-18', '2026-11-19', '2026-12-01']) {
          const s = buildSession(progress, songs, { minutes, today });
          assert.equal(s.minutes, minutes);
          assert.ok(Math.abs(total(s) - minutes * 60) <= 60, `${minutes} мин: ${total(s)} с`);
          const last = s.blocks[s.blocks.length - 1];
          assert.equal(last.type, 'song');
          assert.ok(last.payload.songId);
          assert.ok(last.payload.speed > 0 && last.payload.speed <= 1);
          assert.equal(s.blocks[0].type, 'tuner');
          if (minutes === 5) assert.ok(s.blocks.length <= 3);
          for (const b of s.blocks) {
            assert.ok(b.title && b.seconds > 0, b.type);
            assert.equal(s.blocks.filter((x) => x.type === b.type).length, 1, `${b.type} дважды`);
          }
          const omc = s.blocks.find((b) => b.type === 'omc');
          assert.ok(omc, 'нет OMC');
          assert.ok(omc.payload.pairs.length >= 1 && omc.payload.pairs.length <= (minutes === 18 ? 3 : 2));
          assert.equal(new Set(omc.payload.pairs.map(([a, b]) => pairKey(a, b))).size, omc.payload.pairs.length);
          for (const [a, b] of omc.payload.pairs) assert.ok(a && b && a !== b);
        }
      }
    }
  }
});

test('buildSession: состав блоков по длительности', () => {
  const p = { ...knowing(['C', 'Am', 'F', 'G']), lessonsDone: L1_DONE };
  assert.deepEqual(buildSession(p, LIBRARY, { minutes: 5, today: TODAY }).blocks.map((b) => b.type), ['tuner', 'omc', 'song']);
  assert.deepEqual(buildSession(p, LIBRARY, { minutes: 10, today: TODAY }).blocks.map((b) => b.type),
    ['tuner', 'warmup', 'omc', 'strum', 'song']);
  const long = buildSession(p, LIBRARY, { minutes: 18, today: TODAY });
  assert.deepEqual(long.blocks.map((b) => b.type), ['tuner', 'warmup', 'new', 'omc', 'strum', 'song']);
  assert.equal(long.blocks.find((b) => b.type === 'omc').payload.pairs.length, 3);
  // Новинка — следующий урок: после L1 это Dm.
  assert.deepEqual(long.blocks.find((b) => b.type === 'new').payload, { chord: 'Dm', lessonId: 'l2-dm' });
  // OMC начинается с пары с новым аккордом.
  assert.ok(long.blocks.find((b) => b.type === 'omc').payload.pairs[0].includes('Dm'));
  // Нестандартная длительность приводится к ближайшей.
  assert.equal(buildSession(p, LIBRARY, { minutes: 7, today: TODAY }).minutes, 5);
  assert.equal(buildSession(p, LIBRARY, { minutes: 30, today: TODAY }).minutes, 18);
});

test('buildSession: разминка — 4–6 известных аккордов, бой — пройденный и на известных аккордах', () => {
  const p = knowing(['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7']);
  for (const today of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']) {
    const s = buildSession(p, LIBRARY, { minutes: 18, today });
    const warm = s.blocks.find((b) => b.type === 'warmup').payload.chords;
    assert.equal(warm.length, 6);
    for (const c of warm) assert.ok(p.knownChords[c], c);
    const strum = s.blocks.find((b) => b.type === 'strum').payload;
    assert.ok(STRUM_PATTERNS.some((x) => x.id === strum.patternId));
    assert.ok(strum.bpm >= 40 && strum.bpm <= 200);
    assert.ok(strum.chords.length >= 2 && strum.chords.length <= 4);
    for (const c of strum.chords) assert.ok(p.knownChords[c], c);
  }
  // Новичку нечего вспоминать: разминки нет, бой — «четыре вниз» на C и Am, песня не раздувается.
  const fresh = buildSession(defaultProgress(), LIBRARY, { minutes: 18, today: TODAY });
  assert.ok(!fresh.blocks.some((b) => b.type === 'warmup'));
  assert.deepEqual(fresh.blocks.find((b) => b.type === 'strum').payload, { patternId: 'quarters', bpm: 50, chords: ['C', 'Am'] });
  assert.ok(fresh.blocks.at(-1).seconds <= 420);
  assert.equal(total(fresh), 18 * 60);
});

test('buildSession: бой — последний пройденный, новый бой уровня не даётся до его урока', () => {
  const pattern = (p, today) => buildSession(p, LIBRARY, { minutes: 10, today }).blocks.find((b) => b.type === 'strum').payload.patternId;
  const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
  const afterL1 = { ...knowing(['C', 'Am', 'F', 'G']), lessonsDone: L1_DONE };
  const seen = new Set(days.map((d) => pattern(afterL1, d)));
  assert.ok(seen.has('du'));
  assert.ok([...seen].every((id) => ['du', 'quarters'].includes(id)), [...seen].join());
  // Урок «острова» пройден — бой становится основным.
  const island = { ...afterL1, lessonsDone: { ...L1_DONE, 'l2-island': '2026-11-03' } };
  assert.ok(days.map((d) => pattern(island, d)).includes('island'));
  // Знает аккорды L0–L2 без уроков (пришёл через песни) — «остров» тоже открыт.
  assert.ok(days.map((d) => pattern(knowing(['C', 'Am', 'F', 'G', 'Dm', 'Em']), d)).includes('island'));
  // Рекорд темпа поднимает стартовый темп.
  const fast = { ...afterL1, strum: { du: { bestBpm: 90, history: [] } } };
  const s = days.map((d) => buildSession(fast, LIBRARY, { minutes: 10, today: d }).blocks.find((b) => b.type === 'strum').payload)
    .find((x) => x.patternId === 'du');
  assert.equal(s.bpm, 85);
});

test('buildSession: один и тот же день — одинаковый план', () => {
  const p = knowing(['C', 'Am', 'F', 'G', 'Dm']);
  assert.deepEqual(buildSession(p, LIBRARY, { minutes: 18, today: TODAY }), buildSession(p, LIBRARY, { minutes: 18, today: TODAY }));
});

test('buildSession: песня — сначала «играю/учу», иначе ближайшая играбельная', () => {
  const p = knowing(['C', 'Am', 'F', 'G']);
  const lib = LIBRARY.map((s) => (s.id === 'starter-vo-sadu' ? { ...s, status: 'playing', lastPlayedAt: 5 }
    : s.id === 'starter-oh-susanna' ? { ...s, status: 'learning', lastPlayedAt: 9 } : s));
  // Обе в «играю сейчас» — та, что дольше не играли.
  assert.equal(buildSession(p, lib, { minutes: 10, today: TODAY }).blocks.at(-1).payload.songId, 'starter-vo-sadu');

  // Учу песню, где не хватает одного аккорда, — она важнее случайной играбельной.
  const learning = LIBRARY.map((s) => (s.id === 'starter-drunken-sailor' ? { ...s, status: 'learning' } : s));
  const pay = buildSession(p, learning, { minutes: 10, today: TODAY }).blocks.at(-1).payload;
  assert.equal(pay.songId, 'starter-drunken-sailor');
  assert.equal(pay.speed, 0.7);
  assert.equal(pay.missing.length, 1);

  // Нет активных — играбельная известными аккордами (с транспонированием).
  for (const today of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']) {
    const s = buildSession(p, LIBRARY, { minutes: 5, today }).blocks.at(-1).payload;
    assert.deepEqual(s.missing, [], `${today}: ${s.songId}`);
    assert.notEqual(s.songId, 'hard');
  }
  // Новичок — песня на C и Am.
  const first = buildSession(defaultProgress(), LIBRARY, { minutes: 5, today: TODAY }).blocks.at(-1).payload;
  assert.ok(['starter-bratec-yakov', 'starter-row-boat'].includes(first.songId), first.songId);
  // Песня в гитарной тональности подбирается со сдвигом.
  const only = buildSession(p, [LIBRARY[6]], { minutes: 5, today: TODAY }).blocks.at(-1).payload;
  assert.equal(only.songId, 'guitar-key');
  assert.deepEqual(only.missing, []);
  assert.notEqual(only.shift, 0);
  // Удалённые песни не выбираются; пустая библиотека — запасная стартовая песня.
  const del = buildSession(p, [{ ...LIBRARY[3], deleted: true }], { minutes: 5, today: TODAY }).blocks.at(-1).payload;
  assert.equal(del.songId, 'starter-bratec-yakov');
});

test('buildSession: пары по сроку Лейтнера и самая частая пара песни', () => {
  let p = { ...knowing(['C', 'Am', 'F', 'G']), lessonsDone: L1_DONE };
  // Am–F хорошо, срок через неделю; F–G просрочена.
  p = applyOmc(p, 'Am', 'F', 45, { today: '2026-11-10', target: 30 });
  p = { ...p, pairs: { ...p.pairs, 'Am|F': { ...p.pairs['Am|F'], due: '2026-11-25' } } };
  p = applyOmc(p, 'F', 'G', 35, { today: '2026-11-10', target: 30 });
  p = { ...p, pairs: { ...p.pairs, 'F|G': { ...p.pairs['F|G'], due: '2026-11-15' } } };
  const lib = [{ ...song('pop', ['C', 'G', 'Am', 'F']), status: 'playing',
    text: '[C]a [G]b [C]c [G]d [C]e [G]f [Am]g [F]h' }];
  const pairs = buildSession(p, lib, { minutes: 10, today: TODAY }).blocks.find((b) => b.type === 'omc').payload.pairs;
  assert.deepEqual(pairs.map(([a, b]) => pairKey(a, b)), ['F|G', 'C|G']);
});

test('weakPairs: нетренированные частые пары и слабые результаты впереди', () => {
  const p0 = knowing(['C', 'Am', 'F', 'G']);
  assert.deepEqual(weakPairs(p0, ['C', 'Am', 'F', 'G'], 3).map(([a, b]) => pairKey(a, b)), ['Am|C', 'C|G', 'C|F']);
  let p = p0;
  for (const [a, b, n] of [['C', 'Am', 50], ['C', 'G', 12], ['C', 'F', 40], ['Am', 'F', 33], ['F', 'G', 31], ['Am', 'G', 45]]) {
    p = applyOmc(p, a, b, n, { today: TODAY, target: 30 });
  }
  assert.deepEqual(weakPairs(p, ['C', 'Am', 'F', 'G'], 2), [['C', 'G'], ['F', 'G']]);
  // Пары с незнакомыми аккордами не предлагаются.
  assert.ok(weakPairs(p, ['C', 'G'], 5).every(([a, b]) => ['C', 'G'].includes(a) && ['C', 'G'].includes(b)));
  assert.deepEqual(weakPairs(p, [], 3), []);
  assert.ok(PRIORITY_PAIRS.every(([a, b]) => a !== b));
});

test('chordSequence берёт аккорды из ChordPro по порядку', () => {
  assert.deepEqual(chordSequence('{title: X}\n[Am]Ой, [Dm]мо[E7]роз\n{c: Припев}\n[Am] [H7]'), ['Am', 'Dm', 'E7', 'Am', 'B7']);
  assert.deepEqual(chordSequence(''), []);
  assert.deepEqual(chordSequence('[Verse 1]\n[Chorus]'), []);
});

test('уроки проходятся: после L0 занятие строится на C и Am', () => {
  let p = defaultProgress();
  for (const id of LEVELS[0].lessons) p = applyLessonDone(p, id, '2026-11-14');
  assert.deepEqual(Object.keys(p.knownChords).sort(), ['Am', 'C']);
  const s = buildSession(p, LIBRARY, { minutes: 18, today: TODAY });
  assert.deepEqual(s.blocks.find((b) => b.type === 'new').payload, { chord: 'F', lessonId: 'l1-f' });
  assert.deepEqual(s.blocks.find((b) => b.type === 'omc').payload.pairs[0].slice().sort(), ['Am', 'F']);
});

test('ics: ежедневное событие с напоминанием, CRLF и экранированием', () => {
  const ics = dailyReminderIcs({ hour: 19, minute: 30, title: 'Укулеле; 10 минут, сегодня', url: 'https://example.org/ukulele/#/practice',
    now: new Date(2026, 10, 14, 12, 0) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'голый LF');
  const unfolded = ics.replace(/\r\n /g, '');
  for (const line of ['VERSION:2.0', 'BEGIN:VEVENT', 'RRULE:FREQ=DAILY', 'DTSTART:20261114T193000', 'BEGIN:VALARM',
    'ACTION:DISPLAY', 'END:VALARM', 'END:VEVENT', 'SUMMARY:Укулеле\\; 10 минут\\, сегодня', 'URL:https://example.org/ukulele/#/practice']) {
    assert.ok(unfolded.split('\r\n').includes(line), line);
  }
  assert.match(unfolded, /\r\nUID:[^\r]+@uke\.local\r\n/);
  assert.match(unfolded, /\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(escapeIcsText('a\\b\nc'), 'a\\\\b\\nc');
  const long = `DESCRIPTION:${'ё'.repeat(100)}`;
  assert.equal(foldIcsLine(long).replace(/\r\n /g, ''), long);
});
