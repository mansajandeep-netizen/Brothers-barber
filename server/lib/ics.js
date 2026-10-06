import { zonedToUtc } from './time.js';

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/** iCalendar file for one appointment (times exported in UTC). */
export function appointmentIcs(appt, business, { timezone, siteHost }) {
  const start = zonedToUtc(appt.date, appt.startMin, timezone);
  const end = zonedToUtc(appt.date, appt.endMin, timezone);
  const address = `${business.building ? `${business.building}, ` : ''}${business.streetAddress}, ${business.city}, ${business.region} ${business.postalCode}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(business.name)}//Online Booking//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appt.reference}@${siteHost}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${appt.serviceName} — ${business.name}`)}`,
    `LOCATION:${esc(address)}`,
    `DESCRIPTION:${esc(`With ${appt.barberName}. Booking reference ${appt.reference}. Questions? Call ${business.phone}.`)}`,
    `STATUS:${appt.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment reminder',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
