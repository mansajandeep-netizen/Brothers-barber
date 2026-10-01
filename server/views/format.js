import { DAY_NAMES, DAY_SHORT, formatTime12, minutesToTime } from '../lib/time.js';

export const fullAddress = (b) => `${b.streetAddress}, ${b.city}, ${b.region} ${b.postalCode}`;

export function telHref(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function e164Display(phone) {
  const d = String(phone).replace(/\D/g, '');
  const n = d.length === 10 ? `1${d}` : d;
  return n.length === 11 ? `+${n[0]}-${n.slice(1, 4)}-${n.slice(4, 7)}-${n.slice(7)}` : `+${n}`;
}

export const directionsUrl = (b) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.name}, ${fullAddress(b)}`)}`;

export const mapEmbedUrl = (b) => `https://www.google.com/maps?q=${encodeURIComponent(`${b.name}, ${fullAddress(b)}`)}&output=embed`;

export function formatPrice(cents, from = false) {
  if (cents == null) return '';
  const dollars = cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  return from ? `From ${dollars}` : dollars;
}

export function formatDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Collapses identical consecutive days: [{ label: "Monday – Saturday", value: "9 AM – 7 PM" }] */
export function groupedHours(hours) {
  const byDay = new Map(hours.map((h) => [h.day, h]));
  const rows = WEEK_ORDER.map((d) => {
    const h = byDay.get(d);
    return { day: d, value: h?.isOpen ? `${formatTime12(h.open)} – ${formatTime12(h.close)}` : 'Closed' };
  });
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.value === r.value) last.days.push(r.day);
    else groups.push({ value: r.value, days: [r.day] });
  }
  return groups.map((g) => ({
    label: g.days.length === 1 ? DAY_NAMES[g.days[0]] : `${DAY_NAMES[g.days[0]]} – ${DAY_NAMES[g.days[g.days.length - 1]]}`,
    short: g.days.length === 1 ? DAY_SHORT[g.days[0]] : `${DAY_SHORT[g.days[0]]} – ${DAY_SHORT[g.days[g.days.length - 1]]}`,
    value: g.value,
  }));
}

export function weekHours(hours) {
  const byDay = new Map(hours.map((h) => [h.day, h]));
  return WEEK_ORDER.map((d) => {
    const h = byDay.get(d);
    return {
      day: d,
      name: DAY_NAMES[d],
      isOpen: !!h?.isOpen,
      value: h?.isOpen ? `${formatTime12(h.open)} – ${formatTime12(h.close)}` : 'Closed',
      opens: h?.isOpen ? minutesToTime(h.open) : null,
      closes: h?.isOpen ? minutesToTime(h.close) : null,
    };
  });
}

export const allSevenDaysOpen = (hours) => hours.length === 7 && hours.every((h) => h.isOpen);
