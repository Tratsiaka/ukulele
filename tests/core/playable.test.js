import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  simplifyName, songMasks, knownMasks, playableAt, bestKey, nextChordGains, songDifficulty,
} from '../../src/core/playable.js';

const bit = (pc) => 1 << pc;
const rot = (m, k) => {
  const s = ((k % 12) + 12) % 12;
  return ((m << s) | (m >>> (12 - s))) & 0xfff;
};
const rotAll = (m, k) => ({ maj: rot(m.maj, k), min: rot(m.min, k), dom7: rot(m.dom7, k) });

test('simplifyName: лестница упрощений', () => {
  const table = {
    Cmaj7: 'C', C6: 'C', 'C6/9': 'C', Csus2: 'C', Csus4: 'C', Cadd9: 'C', C5: 'C', Caug: 'C', Cmaj9: 'C',
    G9: 'G7', G11: 'G7', G13: 'G7', G7sus4: 'G7', G7b9: 'G7', 'G7#9': 'G7', G7b5: 'G7', 'G7#5': 'G7',
    Am7: 'Am', Am6: 'Am', Am9: 'Am', Amadd9: 'Am', Ammaj7: 'Am', Am11: 'Am',
    Bm7b5: 'Bdim', 'Am7-5': 'Adim', Bdim: 'Bdim', Cdim7: 'Cdim7',
    'C/G': 'C', 'Am/G': 'Am', 'D7/F#': 'D7', Bbmaj7: 'Bb', Dbmaj7: 'Db', 'A#m7': 'A#m', 'C#sus4': 'C#',
    C: 'C', Am: 'Am', E7: 'E7', '(E7)': 'E7', Hm7: 'Bm', 'Аm7': 'Am',
    xyz: 'xyz', '': '',
  };
  for (const [input, expected] of Object.entries(table)) assert.equal(simplifyName(input), expected, input);
});

test('songMasks и knownMasks: биты по корням и семействам', () => {
  assert.deepEqual(songMasks(['C', 'Am', 'F', 'G7', 'Cmaj7', 'Bm7b5', 'D9/F#']),
    { maj: bit(0) | bit(5), min: bit(9) | bit(11), dom7: bit(7) | bit(2) });
  assert.deepEqual(knownMasks(['C', 'xyz', null]), { maj: bit(0), min: 0, dom7: 0 });
  assert.deepEqual(songMasks([]), { maj: 0, min: 0, dom7: 0 });
});

test('playableAt: подстановки 7 → мажор и E/B → E7/B7', () => {
  const k = (names) => knownMasks(names);
  const s = (names) => songMasks(names);
  assert.ok(playableAt(s(['C7']), k(['C']), 0), 'C7 как C');
  assert.ok(!playableAt(s(['C']), k(['C7']), 0), 'C не через C7');
  assert.ok(playableAt(s(['E']), k(['E7']), 0), 'E через E7');
  assert.ok(playableAt(s(['B']), k(['B7']), 0), 'B через B7');
  assert.ok(!playableAt(s(['F']), k(['F7']), 0), 'F через F7 нельзя');
  assert.ok(!playableAt(s(['Am']), k(['A']), 0), 'минор не мажором');
  assert.ok(playableAt(s(['G']), k(['C']), 5), 'G + 5 = C');
  assert.ok(playableAt(s(['G']), k(['C']), -7));
  assert.ok(playableAt(s([]), k([]), 3), 'пустая маска');
});

const mask = fc.integer({ min: 0, max: 0xfff });
const masks = fc.record({ maj: mask, min: mask, dom7: mask });
const shift = fc.integer({ min: -24, max: 24 });

test('свойство: поворот обеих масок не меняет ответ (если подстановка E/B не участвует)', () => {
  // Подстановка E → E7, B → B7 привязана к конкретным нотам, поэтому без неё: у песни нет мажоров
  // или у известных нет септаккордов.
  fc.assert(fc.property(masks, masks, shift, fc.integer({ min: 0, max: 11 }), fc.boolean(), (song, known, k, r, noMaj) => {
    const s = noMaj ? { ...song, maj: 0 } : song;
    const kn = noMaj ? known : { ...known, dom7: 0 };
    return playableAt(s, kn, k) === playableAt(rotAll(s, r), rotAll(kn, r), k);
  }), { numRuns: 2000 });
});

test('свойство: сдвиг = поворот песни, период 12, больше известных — не хуже', () => {
  fc.assert(fc.property(masks, masks, masks, shift, (song, known, extra, k) => {
    const more = { maj: known.maj | extra.maj, min: known.min | extra.min, dom7: known.dom7 | extra.dom7 };
    return playableAt(song, known, k) === playableAt(rotAll(song, k), known, 0)
      && playableAt(song, known, k) === playableAt(song, known, k + 12)
      && (!playableAt(song, known, k) || playableAt(song, more, k));
  }), { numRuns: 2000 });
});

test('bestKey: G C D Em при C Am F G → +5', () => {
  assert.deepEqual(bestKey(['G', 'C', 'D', 'Em'], ['C', 'Am', 'F', 'G']), { shift: 5, missing: [], playable: true });
});

test('bestKey: русская минорная Am Dm E при знании E7 → 0 через E7', () => {
  assert.deepEqual(bestKey(['Am', 'Dm', 'E'], ['C', 'Am', 'F', 'G', 'Dm', 'E7']), { shift: 0, missing: [], playable: true });
});

test('bestKey: предел сдвига, missing и упрощение', () => {
  const r = bestKey(['G', 'C', 'D', 'Em'], ['C', 'Am', 'F', 'G'], { maxShift: 4 });
  assert.equal(r.playable, false);
  assert.equal(r.missing.length, 2);
  // Упрощение: Cmaj7, Am7, Fadd9, G7sus4 играются как C Am F G.
  assert.deepEqual(bestKey(['Cmaj7', 'Am7', 'Fadd9', 'G7sus4'], ['C', 'Am', 'F', 'G']), { shift: 0, missing: [], playable: true });
  // Не хватает и C, и C7 — достаточно выучить C.
  assert.deepEqual(bestKey(['C', 'C7'], [], { maxShift: 0 }).missing, ['C']);
  // Песня без аккордов не играбельна.
  assert.deepEqual(bestKey([], ['C']), { shift: 0, missing: [], playable: false });
});

test('bestKey: при равных |shift| побеждает меньшая суммарная сложность', () => {
  // C → D (+2, сложность 3) или Bb (−2, сложность 6).
  assert.equal(bestKey(['C'], ['D', 'Bb']).shift, 2);
  // D → C (−2, сложность 1) лучше, чем E (+2, сложность 5).
  assert.equal(bestKey(['D'], ['C', 'E']).shift, -2);
  // Меньший |shift| важнее сложности.
  assert.equal(bestKey(['C'], ['C#', 'D']).shift, 1);
});

test('nextChordGains: после C Am F G выгоднее Dm и Em, чем Bb', () => {
  // Частые последовательности в «гитарных» тональностях. Bb тоже кое-что открывает: C Em F G → F Am Bb C.
  const corpus = [
    ['C', 'Am', 'Dm', 'G'], ['G', 'Em', 'Am', 'D'], ['Am', 'Dm', 'G', 'C'], ['C', 'Em', 'Am', 'G'],
    ['Am', 'Em', 'G'], ['Am', 'Em', 'F', 'G'], ['C', 'Em', 'F', 'G'], ['C', 'F', 'G', 'Bb'],
    ['C', 'G', 'Am', 'F'], ['G', 'C', 'D', 'Em'], ['D', 'A', 'Bm', 'G'], // уже играбельны
    ['Am', 'Dm', 'E'], ['F#', 'C#', 'G#m', 'D#7', 'Bbm', 'Ebm'], // одним аккордом не открыть
  ];
  const gains = nextChordGains(corpus, ['C', 'Am', 'F', 'G']);
  const g = Object.fromEntries(gains.map((x) => [x.chord, x.gain]));
  assert.ok(g.Dm > g.Bb, JSON.stringify(g));
  assert.ok(g.Em > g.Bb, JSON.stringify(g));
  assert.ok(gains[0].chord === 'Dm' || gains[0].chord === 'Em');
  assert.equal(g.C, undefined, 'известные аккорды не предлагаем');
  assert.equal(g.Am7, undefined, 'Am7 после упрощения = Am');
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i - 1].gain >= gains[i].gain);
});

test('nextChordGains: E7 открывает русскую минорную песню', () => {
  const g = nextChordGains([['Am', 'Dm', 'E']], ['C', 'Am', 'F', 'G', 'Dm'], ['Bb', 'E7', 'E']);
  assert.deepEqual(g, [{ chord: 'E7', gain: 1 }, { chord: 'E', gain: 1 }, { chord: 'Bb', gain: 0 }]);
});

test('songDifficulty: звёзды растут вместе со сложностью', () => {
  const easy = songDifficulty(['C', 'Am', 'C', 'Am']);
  const four = songDifficulty(['C', 'G', 'Am', 'F']);
  const six = songDifficulty(['C', 'G', 'Am', 'F', 'Dm', 'Em']);
  const barre = songDifficulty(['C', 'F', 'G', 'Bb', 'Dm', 'Am']);
  const hard = songDifficulty(['Ab', 'C#m', 'F#', 'B', 'Ebm', 'Bbm', 'Fm', 'G#m', 'Db', 'Eb']);
  assert.equal(easy.stars, 1);
  assert.equal(four.stars, 1);
  assert.ok(six.stars >= 2 && six.stars <= 3);
  assert.equal(barre.stars, 4);
  assert.equal(hard.stars, 5);
  assert.ok(easy.score < four.score && four.score < six.score && six.score < barre.score && barre.score < hard.score);
  assert.equal(barre.bottleneck, 'Bb; 6 аккордов');
  assert.equal(easy.bottleneck, 'C; 2 аккорда');
});

test('songDifficulty: E считается через E7, темп и пустая песня', () => {
  assert.equal(songDifficulty(['Am', 'Dm', 'E']).score, songDifficulty(['Am', 'Dm', 'E7']).score);
  const slow = songDifficulty(['C', 'G', 'Am', 'F'], { bpm: 90 });
  const fast = songDifficulty(['C', 'G', 'Am', 'F'], { bpm: 140 });
  assert.ok(fast.score > slow.score);
  assert.equal(fast.bottleneck, 'G; 4 аккорда; быстрый темп');
  assert.deepEqual(songDifficulty([]), { stars: 1, score: 0, bottleneck: '' });
  assert.equal(songDifficulty(['G7/B']).bottleneck, 'G7; 1 аккорд');
  for (const n of [1, 2, 5, 11, 21, 22]) {
    const names = ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'E7', 'A7', 'D', 'A', 'G7', 'C7', 'D7', 'Bb', 'Gm', 'Bm', 'B7',
      'F#m', 'E', 'Cm', 'Fm', 'Eb', 'Ab', 'C#m'].slice(0, n);
    const r = songDifficulty(names);
    assert.ok(r.stars >= 1 && r.stars <= 5);
  }
});
