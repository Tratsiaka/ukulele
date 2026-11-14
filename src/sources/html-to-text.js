// HTML страницы песни (content.rendered из WP REST) → текст «аккорды над строками» с сохранёнными колонками.
// Работает с DOMParser браузера и с DOMParser из linkedom в тестах. Скрипты не выполняются: документ не вставляется в страницу.

import { isChordToken } from '../core/chord.js';

// Что выбрасываем целиком: медиа, встраивания, формы, служебные блоки.
const DROP_SELECTOR = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'figure', 'img', 'picture', 'video', 'audio', 'canvas', 'map',
  'form', 'button', 'input', 'select', 'textarea', 'template', 'object', 'embed', 'nav', 'aside', 'header', 'footer',
].join(',');
// Блоки с аккордами: <pre> (dieza.net) и p.chords (akkords.pro, там переносы и пробелы — обычный текст).
const SONG_BLOCKS = 'pre, .chords';
const PARA_TAGS = new Set(['P', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'HR', 'SECTION', 'ARTICLE', 'DETAILS']);
const LINE_TAGS = new Set(['DIV', 'LI', 'TR', 'DT', 'DD', 'SUMMARY', 'CAPTION', 'ADDRESS', 'CENTER', 'MAIN', 'FIGCAPTION']);
const LABEL_TAGS = new Set(['B', 'STRONG', 'EM', 'I', 'U']);

// Подписи частей песни (ru, be, uk, en). После слова не должна идти буква: «Куплет 1», но не «Куплетик».
const LABEL_RE = /^\[?\s*(куплет|припев|при-в|пр-в|проигрыш|вступление|вступ|интро|кода|концовка|окончание|финал|бридж|бриж|переход|соло|аутро|запев|речитатив|рэп|прыпеў|уступ|пройгрыш|приспів|програш|chorus|verse|bridge|intro|outro|solo|pre-?chorus|interlude|instrumental|refrain|coda|ending|hook|break|rap)(?!\p{L})/iu;
// Служебные пометки, которые остаются в одной строке со значением: «Бой: ↓↑↓↑», «Каподастр: 2».
const META_RE = /^(бой|ритм|ритмика|перебор|каподастр|капо|capo|тональность|темп|строй|strum|strumming|tuning|key|tempo|bpm)(?!\p{L})/iu;
// Значки, которые встречаются в строках аккордов: такты, повторы, стрелки боя.
const DECOR_RE = /^(?:\|+:?|:?\|+|[{}()[\]]+|[-–—/%*.,~]+|\}?\s*[xх×]\s*\d+|\d+\s*[xх×]|\(?[xх×]?\d+[xх×]?\)?|[↓↑]+)$/iu;

/**
 * Строка состоит только из аккордов (и значков тактов/повторов)?
 * @param {string} line
 */
export function looksLikeChordLine(line) {
  const parts = String(line ?? '').trim().split(/\s+/).filter(Boolean);
  let chords = 0;
  for (const raw of parts) {
    if (DECOR_RE.test(raw)) continue;
    const tok = raw.replace(/^[|(]+|[|),.;:]+$/g, '');
    if (!tok) continue;
    if (isChordToken(tok)) { chords++; continue; }
    // «Am-G», «C/G-F»: несколько аккордов через дефис
    if (/-/.test(tok) && tok.split('-').every((p) => p && isChordToken(p))) { chords++; continue; }
    return false;
  }
  return chords > 0;
}

/** Это подпись части песни («Припев:», «[Verse 1]», «Куплет 2»), а не строка текста? */
export function isLabelText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40 || looksLikeChordLine(t)) return false;
  if (LABEL_RE.test(t)) return true;
  return /:\s*$/.test(t) && t.length <= 25 && /\p{L}/u.test(t) && !META_RE.test(t);
}

/** Подпись в единый вид «Припев:» (без квадратных скобок, с двоеточием). */
function normalizeLabel(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  const br = /^\[([^\]]+)\]\s*:?\s*$/.exec(t);
  if (br) t = br[1].trim();
  t = t.replace(/[\s.:;,–—-]+$/u, '');
  return `${t}:`;
}

function resolveParser(parser) {
  if (parser && typeof parser.parseFromString === 'function') return parser;
  if (typeof parser === 'function') {
    if (parser.prototype && typeof parser.prototype.parseFromString === 'function') return new parser();
    const made = parser();
    if (made && typeof made.parseFromString === 'function') return made;
  }
  if (typeof globalThis.DOMParser === 'function') return new globalThis.DOMParser();
  throw new Error('Нет DOMParser: передай parser');
}

// Накопитель текста. В режиме pre пробелы и переносы сохраняются, иначе схлопываются, как в браузере.
class Out {
  constructor() { this.s = ''; this.skipSpaces = false; }
  get atLineStart() { return !this.s || this.s.endsWith('\n'); }
  text(str, pre) {
    let t = String(str).replace(/\r\n?/g, '\n');
    if (!pre) {
      t = t.replace(/[ \t\n\f]+/g, ' ');
      if (t.startsWith(' ') && (this.atLineStart || this.s.endsWith(' '))) t = t.slice(1);
    }
    if (this.skipSpaces) {
      t = t.replace(/^[ \t ]+/, '');
      if (!t) return;
      this.skipSpaces = false;
    }
    this.s += t;
  }
  newline() { this.s += '\n'; this.skipSpaces = false; }
  breakLine() { if (!this.atLineStart) this.s += '\n'; }
  breakPara() {
    this.breakLine();
    if (this.s && !this.s.endsWith('\n\n')) this.s += '\n';
  }
  label(text) {
    this.breakLine();
    this.s += normalizeLabel(text) + '\n';
    this.skipSpaces = true;
  }
}

function walk(node, pre, out) {
  for (const child of Array.from(node.childNodes ?? [])) {
    if (child.nodeType === 3) { out.text(child.nodeValue ?? child.textContent ?? '', pre); continue; }
    if (child.nodeType !== 1) continue;
    const tag = String(child.nodeName).toUpperCase();
    if (tag === 'BR') { out.newline(); continue; }
    const childPre = pre || tag === 'PRE' || tag === 'TEXTAREA' || hasClass(child, 'chords');
    if (LABEL_TAGS.has(tag)) {
      const t = child.textContent ?? '';
      if (isLabelText(t) && !META_RE.test(t.trim())) { out.label(t); continue; }
    }
    if (PARA_TAGS.has(tag)) {
      out.breakPara();
      if (/^H[1-6]$/.test(tag) && isLabelText(child.textContent)) out.label(child.textContent);
      else if (tag !== 'HR') walk(child, childPre, out);
      out.breakPara();
      continue;
    }
    if (LINE_TAGS.has(tag)) {
      out.breakLine();
      walk(child, childPre, out);
      out.breakLine();
      continue;
    }
    walk(child, childPre, out);
  }
}

function hasClass(el, name) {
  const c = el.classList;
  if (c && typeof c.contains === 'function') return c.contains(name);
  return ` ${el.getAttribute?.('class') ?? ''} `.includes(` ${name} `);
}

function expandTabs(line, size = 8) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(size - (out.length % size));
    else out += ch;
  }
  return out;
}

// «см. табы и ноты» и подобные заглушки: на странице там картинка, у нас её нет.
const STUB_RE = /\(?[ \t]*(?:см\.?|смотри(?:те)?)[ \t]+(?:табы?|табулатур[уаы]|ноты|видео)(?:[ \t]+и[ \t]+(?:ноты|табы?|видео))?[ \t]*\)?\.?/giu;
const LABEL_LINE_RE = /^(\s*)\[([^\]\n]{1,30})\](?:\s*:)?(.*)$/;
const PLAIN_LABEL_RE = /^\s*([^\s:[\]][^:[\]]{0,24}?)\s*:(.*)$/;

// Подпись, приклеенная к строке: «[Куплет]:Bm     A», «Вступление: Am C G». Колонки остатка считаем от его начала.
function splitGluedLabel(line) {
  const br = LABEL_LINE_RE.exec(line);
  if (br && !isChordToken(br[2].trim()) && LABEL_RE.test(br[2].trim())) {
    const rest = br[3];
    if (!rest.trim()) return [normalizeLabel(br[2])];
    return [normalizeLabel(br[2]), looksLikeChordLine(rest) ? rest : rest.trimStart()];
  }
  const pl = PLAIN_LABEL_RE.exec(line);
  if (pl && LABEL_RE.test(pl[1]) && !META_RE.test(pl[1]) && pl[2].trim()) {
    return [normalizeLabel(pl[1]), pl[2].trimStart()];
  }
  return null;
}

/**
 * Чистка текста песни: неразрывные пробелы, табы, заглушки «см. табы», приклеенные подписи, лишние пустые строки.
 * Колонки (позиции аккордов над слогами) не сдвигаются.
 * @param {string} text
 * @returns {string}
 */
export function cleanSongText(text) {
  const src = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(STUB_RE, '');
  const lines = [];
  for (let line of src.split('\n')) {
    line = expandTabs(line).replace(/\s+$/, '');
    if (/^\s*[.,;:!?…]+$/.test(line)) continue; // «.» после «<em>Припев</em>.»
    const split = splitGluedLabel(line);
    if (split) lines.push(...split.map((l) => l.replace(/\s+$/, '')));
    else lines.push(line);
  }
  const out = [];
  let prevLabel = false;
  for (const line of lines) {
    const blank = !line.trim();
    if (blank && (prevLabel || !out.length || !out[out.length - 1].trim())) continue;
    out.push(line);
    if (!blank) prevLabel = isLabelText(line) && /:$/.test(line);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

/**
 * HTML песни → текст «аккорды над строками». Берёт блоки pre / .chords, если они есть, иначе весь документ
 * (абзацы и <br> — переносы, &nbsp; — пробелы). <b>/<em>/<strong> с подписью части выносятся на отдельную строку.
 * @param {string} html
 * @param {{parser?: DOMParser | (new () => DOMParser) | (() => DOMParser)}} [opts]
 * @returns {string}
 */
export function htmlToText(html, opts = {}) {
  const parser = resolveParser(opts.parser);
  const doc = parser.parseFromString(`<!DOCTYPE html><html><head></head><body>${String(html ?? '')}</body></html>`, 'text/html');
  const body = doc.body ?? doc.querySelector?.('body') ?? doc.documentElement;
  if (!body) return '';
  for (const el of Array.from(body.querySelectorAll(DROP_SELECTOR))) el.remove();
  const blocks = Array.from(body.querySelectorAll(SONG_BLOCKS)).filter((el) => !el.parentElement?.closest?.(SONG_BLOCKS));
  const chunks = [];
  if (blocks.length) {
    for (const el of blocks) {
      const out = new Out();
      walk(el, true, out);
      chunks.push(out.s);
    }
  } else {
    for (const el of Array.from(body.querySelectorAll('h1, h2'))) el.remove(); // заголовок страницы, не песня
    const out = new Out();
    walk(body, false, out);
    chunks.push(out.s);
  }
  return cleanSongText(chunks.join('\n\n'));
}
