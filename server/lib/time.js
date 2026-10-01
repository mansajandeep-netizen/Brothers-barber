/**
 * Date/time helpers. Appointments are stored as a local calendar date
 * (YYYY-MM-DD) plus minutes after midnight in the shop's timezone, so the
 * schedule always matches the wall clock in Grande Prairie.
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatterCache = new Map();
function partsFormatter(timeZone) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Current wall-clock date and minute-of-day in the given timezone. */
export function zonedNow(timeZone, at = new Date()) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTime(s) {
  return typeof s === 'string' && TIME_RE.test(s);
}

export function timeToMinutes(s) {
  const m = TIME_RE.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 13:30 → "1:30 PM" */
export function formatTime12(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "2026-10-03" → "Saturday, October 3, 2026" */
export function formatDateLong(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date) {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/**
 * Converts a shop-local wall-clock time to a UTC Date, honouring DST.
 * Used for calendar (.ics) exports and "hours until appointment" checks.
 */
export function zonedToUtc(date, minutes, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Find the offset at that instant, then correct once more for DST edges.
  let utc = guess - offsetMs(timeZone, new Date(guess));
  utc = guess - offsetMs(timeZone, new Date(utc));
  return new Date(utc);
}

function offsetMs(timeZone, at) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return asUtc - Math.floor(at.getTime() / 60000) * 60000;
}
