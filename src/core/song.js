// Разбор песен: ChordPro, разметка Ultimate Guitar и «аккорды над строками» → одна модель Song.
// Чистый модуль: без DOM, работает в браузере и в node --test.

import {
  parseChord, formatChord, transposeChord, normalizeChordName, isChordToken, normalizeChordText,
  noteName, preferFlatsForKey, QUALITY_FAMILY,
} from './chord.js';

/** @typedef {{chord: string|null, text: string}} Segment */
/**
 * @typedef {{type: 'lyrics', segments: Segment[]} | {type: 'chords', chords: string[]} | {type: 'comment', text: string}
 *   | {type: 'tab', lines: string[]} | {type: 'empty'}} Line
 */
/** @typedef {'verse'|'chorus'|'bridge'|'intro'|'outro'|'other'} SectionKind */
/** @typedef {{label: string|null, kind: SectionKind, lines: Line[]}} Section */
/**
 * @typedef {{title: string, artist: string, key?: string, capo?: number, bpm?: number, strum?: string,
 *   german?: boolean, sections: Section[]}} Song
 */

// ───────────────────────────── словари ─────────────────────────────

const SECTION_WORDS = {
  chorus: ['припев', 'chorus', 'refrain', 'рефрен', 'hook'],
  verse: ['куплет', 'verse', 'запев'],
  bridge: ['бридж', 'bridge', 'переход', 'middle 8'],
  intro: ['вступление', 'вступ', 'intro', 'интро'],
  outro: ['концовка', 'окончание', 'outro', 'аутро', 'coda', 'кода', 'ending'],
  other: ['проигрыш', 'pre-chorus', 'prechorus', 'предприпев', 'пред-припев', 'solo', 'соло', 'instrumental',
    'interlude', 'break', 'riff', 'рифф'],
};
const wordKey = (w) => w.toLowerCase().replace(/[\s-]+/g, ' ');
const KIND_BY_WORD = new Map(Object.entries(SECTION_WORDS).flatMap(([kind, ws]) => ws.map((w) => [wordKey(w), kind])));

// Слова, которые не мешают строке быть строкой аккордов.
const SERVICE_WORDS = new Set([
  'intro', 'outro', 'verse', 'chorus', 'bridge', 'coda', 'solo', 'riff', 'instrumental', 'interlude', 'ending',
  'refrain', 'repeat', 'n.c', 'nc', 'n/c', 'x', 'х', '×',
  'вступление', 'вступ', 'проигрыш', 'припев', 'куплет', 'бридж', 'кода', 'соло', 'концовка', 'интро', 'аутро',
  'раз', 'раза', 'повтор', 'повторить',
]);

const CYR3 = /\p{Script=Cyrillic}{3,}/u;
const ARROWS = '↓↑⇣⇡⬇⬆↡↟⇓⇑';
const ARROWS_ONLY = new RegExp(`^[${ARROWS}]+$`, 'u');
const REPEAT_TOKEN = /^(?:[xх×*]\s?\d{1,2}|\d{1,2}\s?[xх×])$/iu;
const REPEAT_LINE = /^[\s}\])|]*\(?\s*(?:[xх×*]\s?\d{1,2}|\d{1,2}\s?[xх×]|\d{1,2}\s+раза?|повтор\p{L}*(?:\s+\S+){0,3})\s*\)?[\s.!]*$/iu;
const CAPO_RE = /(?:^|[^\p{L}])(?:capo|каподастр\p{L}*|капо|кап\.)\s*[:\-–=]?\s*(?:(?:на|on|at)\s+)?(?:(\d{1,2})|([IVX]{1,4})(?![\p{L}\d]))/iu;
const KEY_RE = /^(?:тональность|key|tonality)\s*[:\-–=]\s*\(?\s*([A-HА-Я][^\s,;)]*)/iu;
const TEMPO_RE = /^(?:темп|tempo|bpm)\s*[:\-–=]?\s*(\d{2,3})(?!\d)|(?:^|\s)(\d{2,3})\s*bpm\b/iu;
const STRUM_RE = /^(?:бой|ритм|схема\s+боя|strum(?:ming)?(?:\s+pattern)?|pattern)\s*(?:([:\-–—=])\s*(.*)|\s+(.*))$/iu;
// Строка табулатуры: имя струны, «|» (или сразу «--»), дальше только символы табов.
const TAB_RE = /^\s*([A-Ga-g][#b]?)\s?(?:\|\|?|:|(?=[-–—]{2}))([-–—0-9|hpbrstvx~/\\().^*<>=\s]*)$/;
/** Строка таба: ≥4 тире и не «C | - - - |» (доли в схеме аккордов). */
function isTabLine(line) {
  const m = TAB_RE.exec(line);
  return !!m && (m[2].match(/[-–—]/g) ?? []).length >= 4 && !/(?:\s[-–—]){3}/.test(m[2]);
}
const DIRECTIVE_RE = /^\{\s*([A-Za-z_][\w-]*)\s*(?:[:\s]\s*(.*?))?\s*\}$/s;
const KNOWN_DIRECTIVE = /^(?:title|t|subtitle|st|artist|composer|lyricist|album|year|key|capo|tempo|time|duration|meta|comment|c|ci|cb|comment_italic|comment_box|highlight|chorus|so[cvbtg]|eo[cvbtg]|start_of_\w+|end_of_\w+|new_song|ns|x_[\w-]+)$/i;

// ───────────────────────────── текст и токены ─────────────────────────────

/** Табы → пробелы до ближайшей позиции, кратной 8 (как в <pre>). */
function expandTabs(line) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) out += ch === '\t' ? ' '.repeat(8 - (out.length % 8)) : ch;
  return out;
}

/** Текст → строки: NFC, единые переводы строк, без невидимых символов, табы раскрыты, без хвостовых пробелов. */
function toLines(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿⁠­]/g, '')
    .replace(/[  -   　]/g, ' ')
    .split('\n')
    .map((l) => expandTabs(l).replace(/\s+$/u, ''));
}

const countOf = (s, ch) => s.split(ch).length - 1;

/** Снимает с токена пунктуацию по краям и непарные скобки; «(E7)» оставляет, «[Am]» разворачивает. */
function cleanToken(tok) {
  let s = tok;
  let prev;
  do {
    prev = s;
    s = s.replace(/^["'«„“‘*_~]+/u, '').replace(/["'»“”’*_~,;:.!?…]+$/u, '');
    const wrap = /^\[(.*)\]$/u.exec(s) || /^\{(.*)\}$/u.exec(s);
    if (wrap) s = wrap[1];
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      if (s.startsWith(open) && countOf(s, open) > countOf(s, close)) s = s.slice(1);
      if (s.endsWith(close) && countOf(s, close) > countOf(s, open)) s = s.slice(0, -1);
    }
  } while (s && s !== prev);
  return s;
}

const isService = (s) => {
  const low = s.toLowerCase();
  return SERVICE_WORDS.has(low) || SERVICE_WORDS.has(low.replace(/[:.]+$/, ''));
};

/** Склеенные аккорды без пробела: «GF», «AmG». Три голые буквы подряд (BAD, DEAD) не делим. */
function splitGlued(s) {
  if (s.length > 12 || !/^[A-H]/.test(s)) return null;
  const cuts = [];
  for (let i = 1; i < s.length; i++) if (/[A-H]/.test(s[i]) && s[i - 1] !== '/') cuts.push(i);
  cuts.push(s.length);
  const rec = (i) => {
    if (i === s.length) return [];
    for (let k = cuts.length - 1; k >= 0; k--) {
      const end = cuts[k];
      if (end <= i) break;
      const piece = s.slice(i, end);
      if (!isChordToken(piece)) continue;
      const tail = rec(end);
      if (tail) return [{ text: piece, offset: i }, ...tail];
    }
    return null;
  };
  const parts = rec(0);
  if (!parts || parts.length < 2) return null;
  if (parts.length > 2 && /^[A-H]+$/.test(s)) return null;
  return parts;
}

/** Несколько аккордов в одном токене: «Am-C-G», «Am/Dm», «GF». */
function splitChords(s) {
  if (/[-–,/]/.test(s)) {
    const parts = [...s.matchAll(/[^-–,/]+/g)];
    if (parts.length >= 2 && parts.every((p) => isChordToken(p[0]))) {
      return parts.map((p) => ({ text: p[0], offset: p.index }));
    }
  }
  return splitGlued(s);
}

/**
 * Что за токен в строке аккордов.
 * @returns {{kind: 'chord', pieces: {text: string, offset: number, glued?: boolean}[]} | {kind: 'repeat'|'service'|'punct'}
 *   | {kind: 'word', long: boolean}}
 */
function classifyToken(raw, next) {
  const clean = cleanToken(raw);
  if (!clean) return { kind: 'punct' };
  const at = Math.max(0, raw.indexOf(clean));
  if (isService(clean) || ARROWS_ONLY.test(clean)) return { kind: 'service' };
  if (CYR3.test(clean)) return { kind: 'word', long: true };
  if (isChordToken(clean)) return { kind: 'chord', pieces: [{ text: clean, offset: at }] };
  const inner = clean.replace(/^[([{]+|[)\]}]+$/g, '');
  if (REPEAT_TOKEN.test(inner)) return { kind: 'repeat' };
  const nextClean = next ? cleanToken(next).toLowerCase() : '';
  if (/^\d{1,2}$/.test(inner) && /^раза?$/.test(nextClean)) return { kind: 'repeat' };
  if (/^[xх×]$/i.test(inner) && /^\d{1,2}$/.test(nextClean)) return { kind: 'repeat' };
  if (!/\p{L}/u.test(clean)) return { kind: 'punct' };
  const pieces = splitChords(clean);
  if (pieces) return { kind: 'chord', pieces: pieces.map((p) => ({ text: p.text, offset: at + p.offset, glued: true })) };
  return { kind: 'word', long: /\p{L}{3,}/u.test(clean) };
}

/**
 * Разбирает строку как строку аккордов. null — это не строка аккордов.
 * Правило: ≥60 % значимых токенов — аккорды, нет слов из 3+ букв (кроме служебных: x2, раза, Intro, Припев, N.C., ↓↑).
 * @returns {{chords: {text: string, col: number, glued?: boolean}[], repeat: string|null}|null}
 */
function analyzeChordLine(line) {
  const s = String(line ?? '');
  if (!s.trim()) return null;
  const toks = [...s.matchAll(/[^\s|]+/g)];
  const chords = [];
  let words = 0;
  let repeatCol = -1;
  for (let i = 0; i < toks.length; i++) {
    const c = classifyToken(toks[i][0], toks[i + 1]?.[0]);
    if (c.kind === 'chord') {
      for (const p of c.pieces) chords.push({ text: p.text, col: toks[i].index + p.offset, ...(p.glued ? { glued: true } : {}) });
    } else if (c.kind === 'repeat') {
      if (repeatCol < 0) repeatCol = toks[i].index;
    } else if (c.kind === 'word') {
      if (c.long) return null;
      words++;
    }
  }
  if (!chords.length || chords.length / (chords.length + words) < 0.6) return null;
  const repeat = repeatCol < 0 ? null : cleanRepeat(s.slice(repeatCol));
  return { chords, repeat: repeat || null };
}

/** Строка состоит только из аккордов (и служебных пометок)? Строка с русским словом из 3+ букв — никогда (кроме служебных). */
export function isChordLine(line) {
  return analyzeChordLine(line) != null;
}

const cleanRepeat = (s) => s.trim().replace(/^[\s}\])(|:]+/u, '').replace(/[\s)\]|.!]+$/u, '').trim();
const isRepeatLine = (t) => REPEAT_LINE.test(t);

// ───────────────────────────── служебные строки ─────────────────────────────

function romanToInt(s) {
  const v = { I: 1, V: 5, X: 10 };
  const u = s.toUpperCase();
  let n = 0;
  for (let i = 0; i < u.length; i++) n += v[u[i]] < (v[u[i + 1]] ?? 0) ? -v[u[i]] : v[u[i]];
  return n;
}

function isStrumPattern(v) {
  const arrows = [...v].filter((ch) => ARROWS.includes(ch)).length;
  if (arrows >= 2 && new RegExp(`^[${ARROWS}\\s vV^xXхХ×*\\-.,|()\\d/:]+$`, 'u').test(v)) return true;
  const du = v.replace(/[^DUdu]/g, '');
  return /^[DUXdux\-\s|().]+$/.test(v) && du.length >= 3 && /[Dd]/.test(du) && /[Uu]/.test(du);
}

function strumOf(t) {
  const m = STRUM_RE.exec(t);
  if (m) {
    const value = (m[2] ?? m[3] ?? '').trim();
    if (value && (m[1] || isStrumPattern(value))) return value;
    return null;
  }
  return isStrumPattern(t) ? t : null;
}

/**
 * Метаданные из служебного текста: бой, каподастр, тональность, темп.
 * @returns {{strum?: string, capo?: number, key?: string, bpm?: number}|null}
 */
function analyzeMeta(text, german = false) {
  const t = text.trim();
  const out = {};
  const strum = strumOf(t);
  if (strum) out.strum = strum;
  if (t.length <= 80) {
    const c = CAPO_RE.exec(t);
    const capo = c ? (c[1] ? Number(c[1]) : romanToInt(c[2])) : 0;
    if (capo >= 1 && capo <= 12) out.capo = capo;
  }
  const k = KEY_RE.exec(t);
  const key = k && normalizeChordName(k[1], { german });
  if (key) out.key = key;
  const tm = TEMPO_RE.exec(t);
  const bpm = tm ? Number(tm[1] ?? tm[2]) : 0;
  if (bpm >= 30 && bpm <= 300) out.bpm = bpm;
  return Object.keys(out).length ? out : null;
}

// ───────────────────────────── заголовки секций ─────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD_ALT = [...KIND_BY_WORD.keys()]
  .sort((a, b) => b.length - a.length)
  .map((w) => escapeRe(w).replace(/ /g, '[\\s-]*'))
  .join('|');
const HEADER_RE = new RegExp(
  '^([\\[(*]*)\\s*'
  + '(?:(\\d{1,2})\\s*(?:-?\\s*(?:й|ый|ой|ий|th|st|nd|rd))?\\.?\\s+)?'
  + `(${WORD_ALT})(?![\\p{L}])`
  + '(?:\\s*[-#№]?\\s*(\\d{1,2}(?![\\dxх×])|[IVX]{1,4}(?![\\p{L}\\d])))?'
  + '\\s*([\\])*]*)'
  + '\\s*([:.])?'
  + '\\s*(.*)$',
  'iu',
);

function makeLabel(word, num) {
  let w = word.replace(/\s+/g, ' ');
  w = w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w[0].toUpperCase() + w.slice(1);
  return num ? `${w} ${String(num).toUpperCase()}` : w;
}

/**
 * Заголовок секции: «Припев:», «[Verse 1]», «2 куплет», «Вступление: Am C G», «Припев x2».
 * mode: open — пустая строка после заголовка его не закрывает; soft — закрывает; ref — ссылка «спой припев», сразу закрыта.
 */
function matchHeader(raw) {
  const t = raw.trim();
  const lead = raw.length - raw.trimStart().length;
  const br = /^\[([^[\]]{1,40})\]$/.exec(t);
  if (br) {
    const inner = br[1].trim();
    if (!/\p{L}/u.test(inner) || isChordToken(inner) || isRepeatLine(inner)) return null;
    const m = HEADER_RE.exec(inner);
    if (m) return { type: 'header', label: makeLabel(m[3], m[2] || m[4]), kind: KIND_BY_WORD.get(wordKey(m[3])), mode: 'open' };
    return { type: 'header', label: inner, kind: 'other', mode: 'open' };
  }
  const m = HEADER_RE.exec(t);
  if (!m) return null;
  const head = { type: 'header', label: makeLabel(m[3], m[2] || m[4]), kind: KIND_BY_WORD.get(wordKey(m[3])) };
  const rest = m[7] ?? '';
  // «[Chorus]» и «Припев:» — заголовок следующего блока; «(Припев)» и «Припев.» обычно значат «спой припев».
  const square = m[5].includes(']') && m[1].includes('[');
  const paren = m[5].includes(')') && m[1].includes('(');
  const delim = m[6] || (square ? ']' : paren ? ')' : '');
  if (!rest) return { ...head, mode: delim === '.' ? 'ref' : delim === ':' || delim === ']' ? 'open' : 'soft' };
  const restRaw = ' '.repeat(lead + t.length - rest.length) + rest;
  if (isRepeatLine(rest)) return { ...head, mode: 'ref', rest: { type: 'comment', text: cleanRepeat(rest) } };
  const info = analyzeChordLine(restRaw);
  if (info) return { ...head, mode: 'soft', rest: { type: 'chords', info } };
  if (delim) return { ...head, mode: 'soft', rest: { type: 'text', raw: restRaw } };
  return null;
}

// ───────────────────────────── табулатуры ─────────────────────────────

/** Серия строк таба → массив систем укулеле (по 4 строки и меньше). Гитарные (B, D, ≥5 струн) → []. */
function tabSystems(lines) {
  const names = lines.map((l) => TAB_RE.exec(l)?.[1] ?? '');
  if (names.some((n) => /^[bdf]/i.test(n))) return [];
  const systems = [];
  let cur = [];
  let seen = new Set();
  lines.forEach((l, i) => {
    if (seen.has(names[i])) { systems.push(cur); cur = []; seen = new Set(); }
    cur.push(l);
    seen.add(names[i]);
  });
  if (cur.length) systems.push(cur);
  if (systems.some((s) => s.length > 4)) return [];
  return systems;
}

/** Содержимое {start_of_tab}: гитарный таб выбрасываем, остальное оставляем как есть. */
function tabBlock(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  const body = lines.slice(a, b);
  const tabLines = body.filter(isTabLine);
  const guitar = tabLines.some((l) => /^[bdf]/i.test(TAB_RE.exec(l)[1])) || tabSystems(tabLines).length === 0 && tabLines.length > 0;
  return guitar || !body.length ? null : body;
}

// ───────────────────────────── сборка песни ─────────────────────────────

const EMPTY = Object.freeze({ type: 'empty' });

/** Сегменты → строка: без пустого начала и хвостовых пробелов; одни аккорды над пробелами → 'chords'. */
function makeLine(segs) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (!s.chord && last && !last.chord) last.text += s.text;
    else out.push({ chord: s.chord, text: s.text });
  }
  // Отступ строки после слияния не нужен: колонки уже учтены.
  while (out.length) {
    out[0].text = out[0].text.replace(/^\s+/u, '');
    if (out[0].chord || out[0].text) break;
    out.shift();
  }
  if (out.length) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/u, '');
    if (!last.chord && !last.text) out.pop();
  }
  if (!out.length) return null;
  if (out.every((s) => s.chord && !s.text.trim())) return { type: 'chords', chords: out.map((s) => s.chord) };
  return { type: 'lyrics', segments: out };
}

const implicitKind = (lines) => (lines.some((l) => l.type === 'lyrics') ? 'verse' : 'other');

function tidyLines(lines) {
  const out = [];
  for (const l of lines) {
    if (l.type === 'empty' && (!out.length || out[out.length - 1].type === 'empty')) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1].type === 'empty') out.pop();
  return out.map((l) => (l.type === 'empty' ? { type: 'empty' } : l));
}

const BLOCK_KIND = { c: 'chorus', v: 'verse', b: 'bridge', t: 'tab', g: 'grid' };
const KIND_BY_BLOCK = { verse: 'verse', chorus: 'chorus', bridge: 'bridge', intro: 'intro', outro: 'outro' };

class Builder {
  constructor(german) {
    this.german = german;
    this.sawH = false;
    this.sections = [];
    this.cur = null;
    this.pending = null;
    this.inBlock = false;
    this.meta = {};
    this.locked = new Set();
  }

  chordName(text, glued = false) {
    const t = normalizeChordText(text);
    if (!glued && /(?:^|\/)\(?H/.test(t)) this.sawH = true;
    return normalizeChordName(t, { german: this.german });
  }

  setMeta(key, value, fromDirective) {
    if (value == null || value === '') return;
    if (fromDirective) { this.meta[key] = value; this.locked.add(key); } else if (!(key in this.meta)) this.meta[key] = value;
  }

  section() {
    if (!this.cur) {
      this.cur = { label: null, kind: null, lines: [], mode: 'implicit' };
      this.sections.push(this.cur);
    }
    return this.cur;
  }

  push(line) { if (line) this.section().lines.push(line); }

  flushPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    const chords = p.info.chords.map((c) => this.chordName(c.text, c.glued)).filter(Boolean);
    if (chords.length) this.push({ type: 'chords', chords });
    if (p.info.repeat) this.push({ type: 'comment', text: p.info.repeat });
  }

  closeSection() {
    this.flushPending();
    this.cur = null;
  }

  blank() {
    this.flushPending();
    if (this.inBlock) { if (this.cur) this.cur.lines.push(EMPTY); return; }
    if (this.cur && this.cur.mode === 'open' && !this.cur.lines.length) return;
    this.cur = null;
  }

  chords(info) {
    this.flushPending();
    this.pending = { info };
  }

  /** Строка текста; если над ней висит строка аккордов — слияние по колонкам. */
  text(raw, pend = this.pending) {
    if (pend === this.pending) this.pending = null;
    if (!pend) { this.push(makeLine([{ chord: null, text: raw }])); return; }
    const cols = pend.info.chords
      .map((c) => ({ col: c.col, name: this.chordName(c.text, c.glued) }))
      .filter((c) => c.name);
    if (!cols.length) { this.push(makeLine([{ chord: null, text: raw }])); return; }
    const maxCol = cols[cols.length - 1].col;
    const lyric = raw.length < maxCol ? raw.padEnd(maxCol, ' ') : raw;
    const segs = [];
    if (cols[0].col > 0) segs.push({ chord: null, text: lyric.slice(0, cols[0].col) });
    cols.forEach((c, i) => segs.push({ chord: c.name, text: lyric.slice(c.col, cols[i + 1]?.col) }));
    this.push(makeLine(segs));
    if (pend.info.repeat) this.push({ type: 'comment', text: pend.info.repeat });
  }

  comment(text) {
    const t = text.trim();
    if (!t) return;
    this.flushPending();
    this.push({ type: 'comment', text: t });
    const meta = analyzeMeta(t, this.german);
    if (meta) for (const [k, v] of Object.entries(meta)) this.setMeta(k, v, false);
  }

  tabs(systems) {
    this.flushPending();
    for (const lines of systems) if (lines.length) this.push({ type: 'tab', lines });
  }

  header(h, rawLine) {
    if (this.inBlock) { this.comment(rawLine); return; }
    const pend = h.rest?.type === 'text' ? this.pending : null;
    if (pend) this.pending = null;
    this.closeSection();
    this.cur = { label: h.label, kind: h.kind, lines: [], mode: h.mode };
    this.sections.push(this.cur);
    if (h.rest?.type === 'text') this.text(h.rest.raw, pend);
    else if (h.rest?.type === 'chords') { this.chords(h.rest.info); this.flushPending(); } // «Вступление: Am C G» — отдельная строка
    else if (h.rest?.type === 'comment') this.comment(h.rest.text);
    if (h.mode === 'ref') this.closeSection();
  }

  /** Строка ChordPro с аккордами в квадратных скобках. */
  bracketLine(raw) {
    this.flushPending();
    const parts = raw.split(/\[([^[\]]*)\]/);
    const segs = [{ chord: null, text: parts[0] }];
    for (let i = 1; i < parts.length; i += 2) {
      const name = isChordToken(parts[i].trim()) ? this.chordName(parts[i].trim()) : null;
      if (name) segs.push({ chord: name, text: parts[i + 1] });
      else segs[segs.length - 1].text += `[${parts[i]}]${parts[i + 1]}`;
    }
    this.push(makeLine(segs));
  }

  directive(name, value) {
    const n = name.toLowerCase();
    const v = (value ?? '').trim();
    const startEnd = /^(?:start_of_(\w+)|so([cvbtg]))$/.exec(n);
    const end = /^(?:end_of_\w+|eo[cvbtg])$/.test(n);
    if (n === 'title' || n === 't') this.setMeta('title', v, true);
    else if (n === 'artist') this.setMeta('artist', v, true);
    else if (n === 'subtitle' || n === 'st') { if (!this.locked.has('artist')) this.setMeta('artist', v, false); }
    else if (n === 'key') this.setMeta('key', normalizeChordName(v, { german: this.german }) ?? v, true);
    else if (n === 'capo') { const c = parseInt(v, 10); if (c >= 1 && c <= 12) this.setMeta('capo', c, true); }
    else if (n === 'tempo') { const b = Math.round(Number.parseFloat(v)); if (b >= 20 && b <= 400) this.setMeta('bpm', b, true); }
    else if (n === 'x_strum') this.setMeta('strum', v, true);
    else if (n === 'x_german') { if (/^(?:1|true|yes|да|h)$/i.test(v)) this.setMeta('german', true, true); }
    else if (n === 'meta') { const m = /^(\S+)\s+(.*)$/.exec(v); if (m) this.directive(m[1], m[2]); }
    else if (/^(?:comment|c|ci|cb|comment_italic|comment_box|highlight)$/.test(n)) this.comment(v);
    else if (n === 'chorus') {
      this.closeSection();
      this.inBlock = false;
      this.sections.push({ label: v || null, kind: 'chorus', lines: [], mode: 'ref' });
    } else if (startEnd) {
      const kind = startEnd[1] ?? BLOCK_KIND[startEnd[2]];
      const label = /label\s*=\s*"([^"]*)"/i.exec(v)?.[1] ?? v;
      this.closeSection();
      this.cur = { label: label.trim() || null, kind: KIND_BY_BLOCK[kind] ?? 'other', lines: [], mode: 'block' };
      this.sections.push(this.cur);
      this.inBlock = true;
    } else if (end) {
      this.closeSection();
      this.inBlock = false;
    }
  }

  finish() {
    this.flushPending();
    const sections = [];
    for (const s of this.sections) {
      const lines = tidyLines(s.lines);
      if (s.mode === 'implicit') { if (lines.length) sections.push({ label: null, kind: implicitKind(lines), lines }); continue; }
      if (!lines.length && s.label == null && s.kind !== 'chorus') continue;
      sections.push({ label: s.label, kind: s.kind, lines });
    }
    const m = this.meta;
    /** @type {Song} */
    const song = { title: m.title ?? '', artist: m.artist ?? '' };
    if (m.key) song.key = m.key;
    if (m.capo) song.capo = m.capo;
    if (m.bpm) song.bpm = m.bpm;
    if (m.strum) song.strum = m.strum;
    if (this.german || m.german) song.german = true;
    song.sections = sections;
    return song;
  }
}

const hasBracketChord = (t) => [...t.matchAll(/\[([^[\]]*)\]/g)].some((m) => isChordToken(m[1].trim()));

/** Одна строка без ChordPro-разметки → что это. */
function classifyPlain(raw) {
  const head = matchHeader(raw);
  if (head) return head;
  const info = analyzeChordLine(raw);
  if (info) return { type: 'chords', info };
  const t = raw.trim();
  if (isRepeatLine(t)) return { type: 'comment', text: cleanRepeat(t) || t };
  if (analyzeMeta(t)) return { type: 'comment', text: t };
  return { type: 'text', raw };
}

function run(text, { chordpro, german }) {
  const lines = toLines(text);
  const b = new Builder(german);
  let tabBuf = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (tabBuf) {
      const d = DIRECTIVE_RE.exec(t);
      if (d && /^(?:end_of_tab|eot)$/i.test(d[1])) {
        const body = tabBlock(tabBuf);
        if (body) b.push({ type: 'tab', lines: body });
        tabBuf = null;
      } else tabBuf.push(raw);
      continue;
    }
    if (!t) { b.blank(); continue; }
    if (chordpro) {
      if (raw.startsWith('#')) continue; // комментарий ChordPro
      const d = DIRECTIVE_RE.exec(t);
      // Неизвестные директивы с начала строки ({define}, {columns}) пропускаем; « {x}» с отступом — это текст.
      if (d && (KNOWN_DIRECTIVE.test(d[1]) || raw.startsWith('{'))) {
        if (/^(?:start_of_tab|sot)$/i.test(d[1])) { b.flushPending(); tabBuf = []; } else b.directive(d[1], d[2]);
        continue;
      }
      if (hasBracketChord(t)) { b.bracketLine(raw); continue; }
    }
    if (isTabLine(raw)) {
      let j = i;
      while (j < lines.length && isTabLine(lines[j])) j++;
      b.tabs(tabSystems(lines.slice(i, j)));
      i = j - 1;
      continue;
    }
    const c = classifyPlain(raw);
    if (c.type === 'header') b.header(c, t);
    else if (c.type === 'chords') b.chords(c.info);
    else if (c.type === 'comment') b.comment(c.text);
    else b.text(raw);
  }
  if (tabBuf) { const body = tabBlock(tabBuf); if (body) b.push({ type: 'tab', lines: body }); }
  return b;
}

/** Разбор с автоматической немецкой нотацией: встретили H — разбираем всё заново, где B = Bb. */
function parseWith(text, chordpro) {
  const first = run(text, { chordpro, german: false });
  return (first.sawH ? run(text, { chordpro, german: true }) : first).finish();
}

/** Убирает разметку Ultimate Guitar: [ch]Am[/ch] → Am, [tab]…[/tab] → текст. Колонки сохраняются. */
function stripUgMarkup(text) {
  return String(text ?? '')
    .split(/\r\n?|\n/)
    .flatMap((line) => {
      const had = /\[\/?(?:ch|tab)\]/i.test(line);
      const s = line.replace(/\[\/?(?:ch|tab)\]/gi, '');
      return had && !s.trim() ? [] : [s];
    })
    .join('\n');
}

/**
 * Формат текста песни.
 * @param {string} text
 * @returns {'chordpro'|'ug'|'plain'}
 */
export function detectFormat(text) {
  const src = String(text ?? '');
  if (/\[\/?(?:ch|tab)\]/i.test(src)) return 'ug';
  for (const line of src.split(/\r\n?|\n/)) {
    const t = line.trim();
    const d = DIRECTIVE_RE.exec(t);
    if (d && KNOWN_DIRECTIVE.test(d[1])) return 'chordpro';
    if (hasBracketChord(t)) return 'chordpro';
  }
  return 'plain';
}

function withOpts(song, opts = {}) {
  const title = String(opts.title ?? '').trim();
  const artist = String(opts.artist ?? '').trim();
  if (title) song.title = title;
  if (artist) song.artist = artist;
  return song;
}

/**
 * Разбирает ChordPro: директивы, [Am] перед слогами, {soc}/{eoc} и другие блоки, {sot}/{eot}, {x_strum}, {x_german}.
 * Строки без скобок проходят те же правила, что и «аккорды над строками».
 * @param {string} text
 * @returns {Song}
 */
export function parseChordPro(text) {
  return parseWith(text, true);
}

/**
 * Разбирает «аккорды над строками» (в том числе текст с разметкой Ultimate Guitar).
 * @param {string} text
 * @returns {Song}
 */
export function parseChordsOverLyrics(text) {
  return parseWith(stripUgMarkup(text), false);
}

/**
 * Разбирает песню в любом поддерживаемом формате (ChordPro, Ultimate Guitar, «аккорды над строками»).
 * title/artist из opts важнее найденных в тексте.
 * @param {string} text
 * @param {{title?: string, artist?: string}} [opts]
 * @returns {Song}
 */
export function parseSong(text, opts = {}) {
  const song = detectFormat(text) === 'chordpro' ? parseChordPro(text) : parseChordsOverLyrics(text);
  return withOpts(song, opts);
}

// ───────────────────────────── ChordPro на выходе ─────────────────────────────

const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' ').trim();
const BLOCK_NAME = { verse: 'verse', chorus: 'chorus', bridge: 'bridge', intro: 'intro', outro: 'outro', other: 'part' };

function lineToChordPro(line) {
  switch (line.type) {
    case 'lyrics': {
      const s = line.segments.map((g) => (g.chord ? `[${g.chord}]` : '') + g.text).join('');
      return /^[#{]/.test(s) ? ` ${s}` : s; // чтобы текст не стал директивой или комментарием
    }
    case 'chords': return line.chords.map((c) => `[${c}]`).join(' ');
    case 'comment': return `{comment: ${oneLine(line.text)}}`;
    case 'tab': return ['{start_of_tab}', ...line.lines, '{end_of_tab}'].join('\n');
    default: return '';
  }
}

/**
 * Песня → ChordPro. parseSong(toChordPro(song)) возвращает ту же модель для песен, полученных из parseSong.
 * @param {Song} song
 * @returns {string}
 */
export function toChordPro(song) {
  const head = [];
  if (song.title) head.push(`{title: ${oneLine(song.title)}}`);
  if (song.artist) head.push(`{artist: ${oneLine(song.artist)}}`);
  if (song.key) head.push(`{key: ${song.key}}`);
  if (song.capo) head.push(`{capo: ${song.capo}}`);
  if (song.bpm) head.push(`{tempo: ${song.bpm}}`);
  if (song.strum) head.push(`{x_strum: ${oneLine(song.strum)}}`);
  if (song.german) head.push('{x_german: true}');
  const blocks = (song.sections ?? []).map((s) => {
    const lines = s.lines ?? [];
    const body = lines.map(lineToChordPro);
    const bare = s.label == null && lines.length && s.kind === implicitKind(lines) && !lines.some((l) => l.type === 'empty');
    if (bare) return body.join('\n');
    const label = s.label ? `: ${oneLine(s.label)}` : '';
    if (!lines.length && s.kind === 'chorus') return `{chorus${label}}`;
    const name = BLOCK_NAME[s.kind] ?? 'part';
    return [`{start_of_${name}${label}}`, ...body, `{end_of_${name}}`].join('\n');
  });
  return [head.join('\n'), ...blocks].filter(Boolean).join('\n\n') + '\n';
}

// ───────────────────────────── аккорды песни ─────────────────────────────

function* chordStream(song) {
  for (const s of song.sections ?? []) {
    for (const l of s.lines ?? []) {
      if (l.type === 'lyrics') { for (const g of l.segments) if (g.chord) yield g.chord; }
      else if (l.type === 'chords') yield* l.chords;
    }
  }
}

/**
 * Уникальные аккорды песни в порядке появления.
 * @param {Song} song
 * @returns {string[]}
 */
export function songChords(song) {
  return [...new Set(chordStream(song))];
}

/**
 * Смены между соседними разными аккордами (по всей песне подряд). Пара без учёта порядка, по убыванию частоты.
 * a, b — в порядке первого появления пары.
 * @param {Song} song
 * @returns {Array<{a: string, b: string, count: number}>}
 */
export function songPairs(song) {
  const pairs = new Map();
  let prev = null;
  for (const c of chordStream(song)) {
    if (prev && prev !== c) {
      const key = [prev, c].sort().join('|');
      const p = pairs.get(key);
      if (p) p.count++;
      else pairs.set(key, { a: prev, b: c, count: 1 });
    }
    prev = c;
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count);
}

// ───────────────────────────── тональность и транспонирование ─────────────────────────────

/** Как писать знаки в тональности: true — бемоли, false — диезы (E, B, C#m, G#m), undefined — как обычно. */
function spellingForKey(root, minor) {
  if (preferFlatsForKey(root, minor)) return true;
  if (minor ? root === 1 || root === 8 : root === 4 || root === 11) return false;
  return undefined;
}

const keyName = (root, minor) => noteName(root, spellingForKey(root, minor), minor) + (minor ? 'm' : '');

// Ступени: интервал от тоники → какой аккорд там диатонический.
const MAJOR_STEPS = { 0: 'maj', 2: 'min', 4: 'min', 5: 'maj', 7: 'maj', 9: 'min', 11: 'dim' };
const MINOR_STEPS = { 0: 'min', 2: 'dim', 3: 'maj', 5: 'min', 7: 'any', 8: 'maj', 10: 'maj' };

function triadOf(chord) {
  if (chord.quality === 'dim' || chord.quality === 'dim7' || chord.quality === 'm7b5') return 'dim';
  return QUALITY_FAMILY[chord.quality] === 'min' ? 'min' : 'maj';
}

/**
 * Тональность песни: {key} из песни, иначе по совпадению аккордов с 24 тональностями (тоника, первый и последний аккорд важнее).
 * @param {Song} song
 * @returns {{root: number, minor: boolean, name: string}}
 */
export function guessKey(song) {
  const k = song.key && parseChord(song.key);
  if (k) {
    const minor = QUALITY_FAMILY[k.quality] === 'min';
    return { root: k.root, minor, name: keyName(k.root, minor) };
  }
  const chords = [...chordStream(song)].map((n) => parseChord(n)).filter(Boolean);
  if (!chords.length) return { root: 0, minor: false, name: 'C' };
  let best = null;
  for (const minor of [false, true]) {
    for (let root = 0; root < 12; root++) {
      const steps = minor ? MINOR_STEPS : MAJOR_STEPS;
      let score = 0;
      chords.forEach((c, i) => {
        const step = steps[(c.root - root + 12) % 12];
        const triad = triadOf(c);
        const fits = step === triad || (step === 'any' && triad !== 'dim');
        if (!fits) return;
        score += 1;
        const tonic = c.root === root && triad === (minor ? 'min' : 'maj');
        if (tonic) score += 0.5 + (i === 0 ? 2 : 0) + (i === chords.length - 1 ? 3 : 0);
        if (minor && step === 'any' && triad === 'maj') score += 1; // E7 в Am — признак минора
      });
      if (!best || score > best.score) best = { root, minor, score };
    }
  }
  return { root: best.root, minor: best.minor, name: keyName(best.root, best.minor) };
}

/**
 * Транспонирует песню на semitones полутонов. Новый объект; бемоли/диезы — по получившейся тональности,
 * если preferFlats не задан. Сдвиг, кратный 12, без preferFlats возвращает копию без изменений.
 * @param {Song} song
 * @param {number} semitones
 * @param {{preferFlats?: boolean}} [opts]
 * @returns {Song}
 */
export function transposeSong(song, semitones, opts = {}) {
  const shift = ((Math.round(Number(semitones) || 0) % 12) + 12) % 12;
  if (shift === 0 && opts.preferFlats === undefined) return structuredClone(song);
  const key = guessKey(song);
  const preferFlats = opts.preferFlats !== undefined ? opts.preferFlats : spellingForKey((key.root + shift) % 12, key.minor);
  const tx = (name) => {
    const c = parseChord(name);
    return c ? formatChord(transposeChord(c, shift), { preferFlats }) : name;
  };
  const out = structuredClone(song);
  if (out.key) out.key = tx(out.key);
  for (const s of out.sections ?? []) {
    for (const l of s.lines ?? []) {
      if (l.type === 'lyrics') for (const g of l.segments) { if (g.chord) g.chord = tx(g.chord); }
      else if (l.type === 'chords') l.chords = l.chords.map(tx);
    }
  }
  return out;
}
