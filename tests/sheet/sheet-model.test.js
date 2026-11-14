import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseSong, songChords } from '../../src/core/song.js';
import {
  autoscrollSpeed, formatShift, isAtEnd, keyAdvice, keyNameAt, knownTester, lineText, lyricWords, nextScrollPos,
  normalizePrefs, playsMessage, prepareSong, sectionLabel, structureRows, transposeNames, hasChords,
} from '../../src/exercises/sheet-model.js';

const seg = (chord, text) => ({ chord, text });
/** Слова → строка для сравнения: [C]слово, пробел — '_'. */
const show = (items) => items.map((it) => (it.t === 's' ? '_' : it.parts.map((p) => (p.chord ? `[${p.chord}]` : '') + p.text).join(''))).join('');

test('lyricWords: аккорд крепится к первому слову сегмента, остальные слова идут отдельно', () => {
  const items = lyricWords([seg(null, 'I '), seg('C', 'come from Alabama '), seg('G', 'banjo')]);
  assert.equal(show(items), 'I_[C]come_from_Alabama_[G]banjo');
  assert.equal(items.filter((i) => i.t === 'w').length, 5);
});

test('lyricWords: слово с аккордом посередине не разрывается', () => {
  const items = lyricWords([seg(null, 'the '), seg('C', 'sun, Su'), seg('G', 'sanna, don\'t')]);
  const words = items.filter((i) => i.t === 'w');
  const susanna = words.find((w) => w.parts.some((p) => p.text === 'sanna,'));
  assert.deepEqual(susanna.parts, [{ chord: null, text: 'Su' }, { chord: 'G', text: 'sanna,' }]);
  assert.equal(show(items), 'the_[C]sun,_Su[G]sanna,_don\'t');
});

test('lyricWords: аккорд без текста или над пробелом получает свой пустой кусок', () => {
  const items = lyricWords([seg('Am', 'bim-bam-'), seg('C', 'bom '), seg('G', ' '), seg('F', '')]);
  assert.equal(show(items), '[Am]bim-bam-[C]bom_[G]_[F]');
  const g = items.filter((i) => i.t === 'w')[1];
  assert.deepEqual(g.parts, [{ chord: 'G', text: '' }]);
});

test('lyricWords: аккорд сразу после слова без пробела приклеен к слову', () => {
  const items = lyricWords([seg(null, 'end'), seg('C', ' next')]);
  assert.equal(show(items), 'end[C]_next');
  assert.equal(items.length, 3);
});

test('lyricWords: длинное слово помечено long, обычное нет', () => {
  const items = lyricWords([seg('C', 'Достопримечательностями '), seg('G', 'да')]);
  const words = items.filter((i) => i.t === 'w');
  assert.equal(words[0].long, true);
  assert.equal(words[1].long, false);
});

test('lyricWords: без пробелов по краям и без двойных пробелов; текст сохраняется', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ chord: fc.option(fc.constantFrom('C', 'Am', 'G7'), { nil: null }), text: fc.string({ maxLength: 12 }) }), { maxLength: 8 }),
      (segs) => {
        const items = lyricWords(segs);
        if (items.length) {
          assert.notEqual(items[0].t, 's');
          assert.notEqual(items[items.length - 1].t, 's');
        }
        for (let i = 1; i < items.length; i++) assert.ok(!(items[i].t === 's' && items[i - 1].t === 's'));
        // Все аккорды на месте и в том же порядке
        const chordsIn = segs.filter((s) => s.chord).map((s) => s.chord);
        const chordsOut = items.flatMap((it) => (it.t === 'w' ? it.parts.filter((p) => p.chord).map((p) => p.chord) : []));
        assert.deepEqual(chordsOut, chordsIn);
        // Непробельные символы на месте
        const textIn = segs.map((s) => s.text).join('').replace(/\s+/gu, '');
        const textOut = items.map((it) => (it.t === 'w' ? it.parts.map((p) => p.text).join('') : '')).join('');
        assert.equal(textOut, textIn);
      },
    ),
  );
});

test('hasChords и lineText', () => {
  assert.equal(hasChords([seg(null, 'la la')]), false);
  assert.equal(hasChords([seg(null, 'la '), seg('C', 'la')]), true);
  assert.equal(lineText([seg(null, 'la '), seg('C', 'la')]), 'la la');
});

test('prepareSong: без изменений возвращает тот же объект, иначе — новый', () => {
  const song = parseSong('{title: X}\n[Am]раз [Dm]два [E7]три');
  assert.equal(prepareSong(song, {}), song);
  assert.equal(prepareSong(song, { transpose: 12 }), song);
  const up = prepareSong(song, { transpose: 3 });
  assert.notEqual(up, song);
  assert.deepEqual(songChords(up), ['Cm', 'Fm', 'G7']);
  assert.deepEqual(songChords(song), ['Am', 'Dm', 'E7']);
});

test('prepareSong: упрощение не трогает исходную песню', () => {
  const song = parseSong('{title: X}\n[Am7]раз [Cmaj7]два\n[G9] [Dsus4]');
  const simple = prepareSong(song, { simplify: true });
  assert.deepEqual(songChords(simple), ['Am', 'C', 'G7', 'D']);
  assert.deepEqual(songChords(song), ['Am7', 'Cmaj7', 'G9', 'Dsus4']);
  assert.deepEqual(songChords(prepareSong(song, { simplify: true, transpose: 2 })), ['Bm', 'D', 'A7', 'E']);
});

test('sectionLabel: подпись, припев без подписи, запасное имя', () => {
  assert.equal(sectionLabel({ label: 'Куплет 1', kind: 'verse', lines: [] }), 'Куплет 1');
  assert.equal(sectionLabel({ label: null, kind: 'chorus', lines: [] }), 'Припев');
  assert.equal(sectionLabel({ label: null, kind: 'verse', lines: [] }), null);
  assert.equal(sectionLabel({ label: null, kind: 'verse', lines: [] }, true), 'Куплет');
});

test('structureRows: аккорды по строкам, повторы подряд сливаются', () => {
  const song = parseSong('{title: X}\n[C]раз [Am]два\n[C]три [Am]четыре\n[F]пять [G]шесть\nбез аккордов\n[C] [G]');
  const rows = structureRows(song.sections[0]);
  assert.deepEqual(rows, [
    { chords: ['C', 'Am'], times: 2 },
    { chords: ['F', 'G'], times: 1 },
    { chords: ['C', 'G'], times: 1 },
  ]);
});

test('knownTester: точное имя, упрощение и замены как в playable', () => {
  assert.equal(knownTester(undefined), null);
  const isKnown = knownTester(new Set(['C', 'Am', 'E7']));
  assert.equal(isKnown('C'), true);
  assert.equal(isKnown('Am7'), true);
  assert.equal(isKnown('Cmaj7'), true);
  assert.equal(isKnown('E'), true); // E играется как E7
  assert.equal(isKnown('F'), false);
  assert.equal(isKnown('Bb'), false);
  assert.equal(knownTester(['G'])('G7'), true); // 7 можно сыграть мажором
});

test('formatShift и normalizePrefs', () => {
  assert.equal(formatShift(2), '+2');
  assert.equal(formatShift(0), '0');
  assert.equal(formatShift(-3), '−3');
  assert.deepEqual(normalizePrefs(null), { transpose: 0, fontSize: 18, speed: 5, simplify: false });
  assert.deepEqual(normalizePrefs({ transpose: 40, fontSize: 4, speed: 99, simplify: 1 }), { transpose: 11, fontSize: 14, speed: 10, simplify: true });
  assert.deepEqual(normalizePrefs({ transpose: 'x', fontSize: 40, speed: 0 }), { transpose: 0, fontSize: 32, speed: 1, simplify: false });
});

test('transposeNames и keyNameAt', () => {
  assert.deepEqual(transposeNames(['Am', 'Dm', 'E7'], 0), ['Am', 'Dm', 'E7']);
  assert.deepEqual(transposeNames(['Am', 'Dm', 'E7'], -2), ['Gm', 'Cm', 'D7']);
  assert.equal(keyNameAt(['Am', 'Dm', 'E7', 'Am'], 0), 'Am');
  assert.equal(keyNameAt(['Am', 'Dm', 'E7', 'Am'], 3), 'Cm');
  assert.equal(keyNameAt(['G', 'C', 'D'], -2, 'G'), 'F');
});

test('keyAdvice: уже играбельно — null', () => {
  assert.equal(keyAdvice(['C', 'Am', 'F', 'G'], ['C', 'Am', 'F', 'G']), null);
  assert.equal(keyAdvice([], ['C']), null);
});

test('keyAdvice: лёгкая тональность со сдвигом', () => {
  // D, G, A → C, F, G при −2
  const a = keyAdvice(['D', 'G', 'A', 'D'], ['C', 'F', 'G', 'Am']);
  assert.equal(a.kind, 'easy');
  assert.equal(a.shift, -2);
  assert.equal(a.key, 'C');
  // Уже стоим в этой тональности — баннер не нужен
  assert.equal(keyAdvice(['D', 'G', 'A', 'D'], ['C', 'F', 'G', 'Am'], -2), null);
  assert.equal(keyAdvice(['D', 'G', 'A', 'D'], ['C', 'F', 'G', 'Am'], 10), null);
});

test('keyAdvice: чего не хватает и где не хватает меньшего', () => {
  const a = keyAdvice(['Bb', 'Gm', 'C', 'F'], ['C', 'F']);
  assert.equal(a.kind, 'missing');
  assert.deepEqual(a.missing.sort(), ['Bb', 'Gm']);
  const b = keyAdvice(['D', 'G', 'A', 'Bm'], ['C', 'F', 'G']);
  assert.equal(b.kind, 'missing');
  assert.ok(b.better);
  assert.ok(b.better.missing.length < b.missing.length);
});

test('autoscrollSpeed: 6 + 5·speed при 18 px, растёт со шрифтом и долей темпа', () => {
  assert.equal(autoscrollSpeed(1), 11);
  assert.equal(autoscrollSpeed(5), 31);
  assert.equal(autoscrollSpeed(10), 56);
  assert.equal(autoscrollSpeed(5, { fontSize: 36 }), 62);
  assert.equal(autoscrollSpeed(5, { factor: 0.5 }), 15.5);
  assert.equal(autoscrollSpeed(99), 56);
  assert.equal(autoscrollSpeed(-3), 11);
  fc.assert(fc.property(fc.integer({ min: 1, max: 9 }), (s) => autoscrollSpeed(s + 1) > autoscrollSpeed(s)));
});

test('nextScrollPos: копит дробные пиксели и уступает ручной прокрутке', () => {
  let wanted = null;
  let actual = 100;
  for (let i = 0; i < 60; i++) {
    wanted = nextScrollPos(wanted, actual, 30, 1000 / 60);
    actual = Math.round(wanted); // браузер округляет
  }
  assert.ok(Math.abs(actual - 130) <= 1, `за секунду при 30 px/s ушли на ${actual - 100}`);
  // Человек прокрутил на 200 px вниз — продолжаем оттуда
  assert.equal(nextScrollPos(130, 330, 30, 100), 333);
  // Долгий перерыв (вкладка спала) не даёт прыжка
  assert.equal(nextScrollPos(0, 0, 30, 5000), 3);
});

test('isAtEnd', () => {
  assert.equal(isAtEnd(0, 800, 2000), false);
  assert.equal(isAtEnd(1200, 800, 2000), true);
  assert.equal(isAtEnd(1199, 800, 2000), true);
  assert.equal(isAtEnd(0, 800, 600), true);
});

test('playsMessage', () => {
  assert.equal(playsMessage(1), 'Первая игра этой песни — записал');
  assert.equal(playsMessage(3), 'Записал. Уже 3 раза');
  assert.equal(playsMessage(11), 'Записал. Уже 11 раз');
  assert.equal(playsMessage(22), 'Записал. Уже 22 раза');
});
