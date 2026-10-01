import { get } from './api.js';

/** Shared, lightly cached data used across admin views. */
export const state = {
  user: null,
  timezone: 'America/Edmonton',
  services: [],
  categories: {},
  defaultDuration: 30,
  barbers: [],
};

export async function loadCatalog() {
  const [s, b] = await Promise.all([get('/services'), get('/barbers')]);
  state.services = s.services;
  state.categories = s.categories;
  state.defaultDuration = s.defaultDuration;
  state.barbers = b.barbers;
}

export const isOwner = () => state.user?.role === 'owner';

/** Today's date in the shop's timezone. */
export function today() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export function nowMinutes() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

export const serviceById = (id) => state.services.find((s) => s.id === Number(id));
export const barberById = (id) => state.barbers.find((b) => b.id === Number(id));
