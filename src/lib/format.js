// Форматирование для интерфейса: русские числительные, длительности, дни, имена аккордов.
// Чистый модуль: без DOM, работает и в node --test.

const MONTHS_SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const DAY_MS = 24 * 60 * 60 * 1000;
// День занятий начинается в 04:00 — как practiceDay() в core/practice.js.
const DAY_START_HOUR = 4;

/**
 * Русская форма слова для числа: plural(5, ['день', 'дня', 'дней']) → 'дней'.
 * Дробные числа берут вторую форму («1,5 дня»).
 * @param {number} n
 * @param {[string, string, string]} forms форма для 1, для 2–4 и для 5–20
 * @returns {string} только слово, без числа
 */
export function plural(n, forms) {
  const abs = Math.abs(Number(n) || 0);
  if (!Number.isInteger(abs)) return forms[1];
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/**
 * Число со словом: countLabel(3, ['песня', 'песни', 'песен']) → '3 песни'.
 * @param {number} n
 * @param {[string, string, string]} forms
 * @returns {string}
 */
export function countLabel(n, forms) {
  return `${n} ${plural(n, forms)}`;
}

/**
 * Время как на часах: 65 → '1:05', 3725 → '1:02:05'.
 * @param {number} sec секунды (округляются вниз; отрицательные считаются нулём)
 * @returns {string}
 */
export function formatClock(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Длительность для людей: 45 → '45 с', 720 → '12 мин', 3900 → '1 ч 5 мин'.
 * С `{clock: true}` — как на часах: '1:05'.
 * @param {number} sec секунды
 * @param {{clock?: boolean}} [opts]
 * @returns {string}
 */
export function formatDuration(sec, { clock = false } = {}) {
  if (clock) return formatClock(sec);
  const total = Math.max(0, Math.round(Number(sec) || 0));
  if (total < 60) return `${total} с`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Дата → 'YYYY-MM-DD' по местному времени с началом дня в 04:00 (как в core/practice.js).
 * @param {Date|number} [date]
 * @returns {string}
 */
export function dayKey(date = new Date()) {
  const d = new Date(date instanceof Date ? date.getTime() : date);
  d.setHours(d.getHours() - DAY_START_HOUR);
  return ymd(d);
}

function ymd(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseDay(day) {
  if (day instanceof Date) return new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (typeof day === 'number') return parseDay(new Date(day));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * День по-человечески: 'сегодня', 'вчера', '14 нояб.'; другой год — '14 нояб. 2025'.
 * @param {string|Date|number} day 'YYYY-MM-DD' (день занятий), Date или timestamp
 * @param {{today?: string}} [opts] today — текущий день 'YYYY-MM-DD' (по умолчанию dayKey())
 * @returns {string} '' для нераспознанной даты
 */
export function formatDay(day, { today = dayKey() } = {}) {
  const d = typeof day === 'number' || day instanceof Date ? parseDay(dayKey(day)) : parseDay(day);
  const t = parseDay(today);
  if (!d || !t) return '';
  const diff = Math.round((t.getTime() - d.getTime()) / DAY_MS);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff === -1) return 'завтра';
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === t.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Красивое имя аккорда для экрана: 'Bb' → 'B♭', 'F#m' → 'F♯m'. В нотации H: 'B' → 'H', 'Bb' → 'B'.
 * Данные всегда хранят нормализованные имена; это только отображение.
 * @param {string} name нормализованное имя аккорда
 * @param {{notation?: 'B'|'H'}} [opts]
 * @returns {string}
 */
export function chordLabel(name, { notation = 'B' } = {}) {
  if (!name) return '';
  const pretty = (part) => {
    let m = /^([A-G])([#b]?)(.*)$/.exec(part);
    if (!m) return part;
    let [, root, acc, rest] = m;
    if (notation === 'H' && root === 'B') {
      if (acc === 'b') acc = '';
      else root = 'H';
    }
    return root + (acc === '#' ? '♯' : acc === 'b' ? '♭' : '') + rest;
  };
  const [main, bass] = String(name).split('/');
  return bass ? `${pretty(main)}/${pretty(bass)}` : pretty(main);
}
