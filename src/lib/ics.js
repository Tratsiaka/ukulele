// Файл .ics с ежедневным напоминанием: открываешь его — и событие встаёт в календарь телефона.
// RFC 5545: CRLF, свёртка строк по 75 октетов, экранирование текста. Время «плавающее» (местное, без TZ).

const CRLF = '\r\n';
const encoder = new TextEncoder();
const pad = (n) => String(n).padStart(2, '0');

/**
 * Экранирование значения TEXT: \ ; , и переводы строк.
 * @param {string} s
 * @returns {string}
 */
export function escapeIcsText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Свёртка строки длиннее 75 октетов (UTF-8): продолжение начинается с пробела. Символы не режутся пополам.
 * @param {string} line
 * @returns {string}
 */
export function foldIcsLine(line) {
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    const limit = parts.length ? 74 : 75; // у продолжения первый октет — пробел
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

const localStamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * Календарь с одним ежедневным событием (RRULE:FREQ=DAILY) и напоминанием в момент начала.
 * @param {{hour?: number, minute?: number, title?: string, url?: string, description?: string,
 *          durationMin?: number, now?: Date}} [opts]
 * @returns {string} текст .ics с CRLF
 */
export function dailyReminderIcs({
  hour = 19, minute = 0, title = 'Укулеле: 10 минут', url, description, durationMin = 15, now = new Date(),
} = {}) {
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  const m = Math.min(59, Math.max(0, Math.floor(minute)));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  const desc = description ?? 'Даже 5 минут засчитываются в серию.';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Uke//Daily reminder//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:uke-daily-${now.getTime().toString(36)}@uke.local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(start)}`,
    `DURATION:PT${Math.max(1, Math.round(durationMin))}M`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(url ? `${desc}\n${url}` : desc)}`,
    ...(url ? [`URL:${url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/**
 * Скачать .ics: на Android файл открывается в приложении календаря.
 * @param {string} text
 * @param {string} [filename]
 */
export function downloadIcs(text, filename = 'uke-reminder.ics') {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
