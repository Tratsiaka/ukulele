// Синтетические фикстуры по образцу разметки akkords.pro и dieza.net. Тексты — народные (общественное достояние) или выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { htmlToText, cleanSongText, looksLikeChordLine, isLabelText } from '../../src/sources/html-to-text.js';

const h2t = (html) => htmlToText(html, { parser: DOMParser });
const col = (line, word) => line.indexOf(word);

// akkords.pro: p.chords, переносы — обычный текст, аккорды в <span> (иногда несколько в одном), подписи в <b>.
const AKKORDS = `<div class="fpm_start"></div>
<h2 class="wp-block-heading">Чёрный ворон: аппликатуры аккордов</h2>
<figure class="wp-block-image size-full"><img src="https://example.com/a.png" alt="Аккорды"><figcaption>Аппликатуры</figcaption></figure>
<h2 class="wp-block-heading">Чёрный ворон: аккорды, бой, текст песни</h2>
<p class="chords">
<b>Бой:</b> ↓↑↓↑

<b>Вступление:</b> <span>Am Dm E7 Am</span> }x2


<b>Куплет 1:</b>

<span>Am</span>            <span>Dm</span>
Чёрный ворон, чёрный ворон,
<span>E7                  Am</span>
Что ты вьёшься надо мной&#8230;

<b>Проигрыш:</b> см. табы и ноты
</p><script data-noptimize="">fpm_start( "true" );</script>
<figure class="wp-block-embed"><div class="wp-block-embed__wrapper"><a class="apx-yt" href="https://www.youtube.com/watch?v=x">Смотреть видео</a></div></figure>
<div class="fpm_end"></div>`;

test('akkords.pro: p.chords, подписи на своих строках, колонки сохраняются', () => {
  const text = h2t(AKKORDS);
  assert.equal(text, [
    'Бой: ↓↑↓↑',
    '',
    'Вступление:',
    'Am Dm E7 Am }x2',
    '',
    'Куплет 1:',
    'Am            Dm',
    'Чёрный ворон, чёрный ворон,',
    'E7                  Am',
    'Что ты вьёшься надо мной…',
    '',
    'Проигрыш:',
  ].join('\n'));
  const lines = text.split('\n');
  assert.equal(col(lines[6], 'Dm'), col(lines[7], 'чёрный'));
  assert.equal(col(lines[8], 'Am'), col(lines[9], 'мной'));
  assert.ok(!/fpm_start|видео|аппликатуры/i.test(text));
});

// dieza.net, вариант 1: <pre class="chords"> простым текстом; подпись бывает приклеена к строке аккордов.
const DIEZA_PLAIN = `<pre class="chords">[Куплет 1]:Am      Dm
Во поле берёза стояла,
E7                  Am
Во поле кудрявая стояла.

[Припев]:     Dm
Люли, люли, стояла.

Проигрыш: Am Dm E7 Am</pre>`;

test('dieza.net: pre, приклеенные подписи отделяются, колонки остатка считаются от его начала', () => {
  const lines = h2t(DIEZA_PLAIN).split('\n');
  assert.deepEqual(lines, [
    'Куплет 1:',
    'Am      Dm',
    'Во поле берёза стояла,',
    'E7                  Am',
    'Во поле кудрявая стояла.',
    '',
    'Припев:',
    '     Dm',
    'Люли, люли, стояла.',
    '',
    'Проигрыш:',
    'Am Dm E7 Am',
  ]);
  assert.equal(col(lines[1], 'Dm'), col(lines[2], 'берёза'));
});

// dieza.net, вариант 2: <pre> с аккордами в <strong> и подписями в <em>.
const DIEZA_STRONG = `<pre><strong>Am</strong>            <strong>Dm</strong>
Чёрный ворон, чёрный ворон,
<strong>E7                     Am</strong>
Что ты вьёшься надо мной?

<em>Припев:</em>
<strong>  Am</strong>
Ты добычи не дождёшься!

<em>Припев</em>.
<script>alert(1)</script></pre>`;

test('dieza.net: pre со <strong> и <em>', () => {
  const lines = h2t(DIEZA_STRONG).split('\n');
  assert.deepEqual(lines, [
    'Am            Dm',
    'Чёрный ворон, чёрный ворон,',
    'E7                     Am',
    'Что ты вьёшься надо мной?',
    '',
    'Припев:',
    '  Am',
    'Ты добычи не дождёшься!',
    '',
    'Припев:',
  ]);
});

// dieza.net, вариант 3: абзацы <p>, переносы <br />, отступы через &nbsp;.
const DIEZA_PARAGRAPHS = `<p><strong>C &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; G</strong><br />Row, row, row your boat<br /><strong>Am</strong><br />gently down the stream.</p>
<p>Merrily, merrily,<br />
life is but a dream &amp; more.</p>
<p>&nbsp;</p>`;

test('dieza.net: абзацы и &nbsp; → строки и пробелы', () => {
  const lines = h2t(DIEZA_PARAGRAPHS).split('\n');
  assert.deepEqual(lines, [
    'C           G',
    'Row, row, row your boat',
    'Am',
    'gently down the stream.',
    '',
    'Merrily, merrily,',
    'life is but a dream & more.',
  ]);
  assert.equal(col(lines[0], 'G'), 12);
});

test('UG-подобные подписи [Verse 1] и [Chorus] в pre', () => {
  const text = h2t('<pre>[Intro]\nC  G\n\n[Verse 1]\nC        G\nRow your boat\n[Am]Merrily</pre>');
  assert.deepEqual(text.split('\n'), ['Intro:', 'C  G', '', 'Verse 1:', 'C        G', 'Row your boat', '[Am]Merrily']);
});

test('parser: экземпляр, класс или фабрика', () => {
  const html = '<pre>Am\nla la</pre>';
  assert.equal(htmlToText(html, { parser: new DOMParser() }), 'Am\nla la');
  assert.equal(htmlToText(html, { parser: DOMParser }), 'Am\nla la');
  assert.equal(htmlToText(html, { parser: () => new DOMParser() }), 'Am\nla la');
  assert.equal(htmlToText('', { parser: DOMParser }), '');
});

test('cleanSongText: табы, пустые строки, заглушки', () => {
  assert.equal(cleanSongText('\n\nAm\tDm\r\nla  \n\n\n\nсм. табы\nlo\n\n'), 'Am      Dm\nla\n\nlo');
  assert.equal(cleanSongText('Припев:\n\n\nAm\nla'), 'Припев:\nAm\nla');
});

test('looksLikeChordLine и isLabelText', () => {
  for (const s of ['Am  Dm  E7', '|: F#m | C#m7 :| 2x', 'Am G }x2', '(E7)', 'Am-G C']) assert.ok(looksLikeChordLine(s), s);
  for (const s of ['Во поле берёза', 'A man', '', 'x2']) assert.ok(!looksLikeChordLine(s), s);
  for (const s of ['Припев:', 'Куплет 2', '[Verse 1]', 'Chorus', 'Прыпеў:']) assert.ok(isLabelText(s), s);
  for (const s of ['Am', 'Ой, мороз, мороз, не морозь меня', 'Куплетик']) assert.ok(!isLabelText(s), s);
});
