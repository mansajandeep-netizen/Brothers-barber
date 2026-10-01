import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestScheduler } from './helpers.js';
import { zonedToUtc, zonedNow } from '../server/lib/time.js';

// Monday, October 5 2026, 10:00 AM in Grande Prairie (MDT, UTC−6).
const NOW = '2026-10-05T16:00:00Z';
const customer = (n = 1) => ({ name: `Customer ${n}`, phone: `780555${String(1000 + n).slice(-4)}`, email: `c${n}@example.com` });

let t;
beforeEach(() => {
  t = createTestScheduler(NOW);
});

const slotsOf = (opts) => t.scheduler.slotsFor({ serviceId: 1, barberId: null, ...opts });
const times = (res, onlyAvailable = true) => res.slots.filter((s) => !onlyAvailable || s.available).map((s) => s.time);

describe('time helpers', () => {
  test('converts shop time to UTC across the DST change', () => {
    assert.equal(zonedToUtc('2026-10-05', 600, 'America/Edmonton').toISOString(), '2026-10-05T16:00:00.000Z');
    // DST ends Nov 1, 2026 — Mountain Standard Time is UTC−7.
    assert.equal(zonedToUtc('2026-11-02', 540, 'America/Edmonton').toISOString(), '2026-11-02T16:00:00.000Z');
  });

  test('reads the current wall clock in the shop timezone', () => {
    assert.deepEqual(zonedNow('America/Edmonton', new Date(NOW)), { date: '2026-10-05', minutes: 600 });
  });
});

describe('availability', () => {
  test('today only offers times after the minimum notice, and the last slot ends by closing', () => {
    const res = slotsOf({ date: '2026-10-05' });
    assert.equal(res.open, true);
    assert.equal(times(res)[0], '11:00'); // 10:00 now + 60 min notice
    assert.equal(times(res).at(-1), '18:30'); // 30-min default length, closes 7 PM
  });

  test('Sunday uses Sunday hours (9 AM – 5 PM)', () => {
    const res = slotsOf({ date: '2026-10-11' });
    assert.equal(times(res)[0], '09:00');
    assert.equal(times(res).at(-1), '16:30');
  });

  test('past dates and dates beyond the booking window are not bookable', () => {
    assert.equal(slotsOf({ date: '2026-10-04' }).open, false);
    assert.equal(slotsOf({ date: '2026-11-10' }).open, false);
  });

  test('closed days have no slots', () => {
    const hours = t.store.hours.list().map((h) => (h.day === 3 ? { ...h, isOpen: false } : h));
    t.store.hours.save(hours);
    const res = slotsOf({ date: '2026-10-07' });
    assert.equal(res.open, false);
    assert.equal(res.slots.length, 0);
  });

  test('a longer service blocks the overlapping half-hours', () => {
    const fade = t.store.services.get(2);
    t.store.services.update(2, { ...fade, durationMin: 60 });
    t.scheduler.book({ serviceId: 2, barberId: 1, date: '2026-10-06', time: '13:00', customer: customer() });
    const res = t.scheduler.slotsFor({ serviceId: 1, barberId: 1, date: '2026-10-06' });
    const byTime = Object.fromEntries(res.slots.map((s) => [s.time, s.available]));
    assert.equal(byTime['12:30'], true);
    assert.equal(byTime['13:00'], false);
    assert.equal(byTime['13:30'], false);
    assert.equal(byTime['14:00'], true);
    // A 60-minute service can't start later than 6 PM.
    assert.equal(times(t.scheduler.slotsFor({ serviceId: 2, barberId: 2, date: '2026-10-06' })).at(-1), '18:00');
  });

  test('shop-wide and per-barber blocks remove times', () => {
    t.store.blocks.create({ barberId: null, dateFrom: '2026-10-08', dateTo: '2026-10-08', allDay: false, startMin: 720, endMin: 780, reason: 'Lunch' });
    const shop = slotsOf({ date: '2026-10-08' });
    assert.ok(!times(shop).includes('12:00'));
    assert.ok(!times(shop).includes('12:30'));
    assert.ok(times(shop).includes('13:00'));

    t.store.blocks.create({ barberId: 1, dateFrom: '2026-10-09', dateTo: '2026-10-10', allDay: true, reason: 'Vacation' });
    assert.equal(times(t.scheduler.slotsFor({ serviceId: 1, barberId: 1, date: '2026-10-09' })).length, 0);
    assert.ok(times(slotsOf({ date: '2026-10-09' })).length > 0, 'another barber is still available');
  });

  test('barbers are only offered on the days they work', () => {
    const b2 = t.store.barbers.get(2);
    t.store.barbers.update(2, { ...b2, workDays: [0, 1, 3, 4, 5, 6] }); // off Tuesdays
    const res = t.scheduler.slotsFor({ serviceId: 1, barberId: 2, date: '2026-10-06' });
    assert.equal(res.slots.length, 0);
  });

  test('calendar summarises availability per day', () => {
    const cal = t.scheduler.calendar({ serviceId: 1, from: '2026-10-01', to: '2026-10-31' });
    assert.equal(cal.today, '2026-10-05');
    assert.equal(cal.days[0].date, '2026-10-05', 'past days are excluded');
    assert.ok(cal.days.every((d) => d.open && d.available > 0));
  });
});

describe('booking', () => {
  test('"any barber" spreads bookings and the slot closes when everyone is booked', () => {
    const a = t.scheduler.book({ serviceId: 1, date: '2026-10-06', time: '10:00', customer: customer(1) });
    const b = t.scheduler.book({ serviceId: 1, date: '2026-10-06', time: '10:00', customer: customer(2) });
    assert.notEqual(a.barberId, b.barberId);
    assert.throws(
      () => t.scheduler.book({ serviceId: 1, date: '2026-10-06', time: '10:00', customer: customer(3) }),
      (err) => err.status === 409 && err.extra.code === 'SLOT_TAKEN',
    );
    const slot = slotsOf({ date: '2026-10-06' }).slots.find((s) => s.time === '10:00');
    assert.equal(slot.available, false);
  });

  test('the same barber can never be double-booked', () => {
    t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '11:00', customer: customer(1) });
    assert.throws(
      () => t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '11:00', customer: customer(2) }),
      (err) => err.status === 409,
    );
  });

  test('times that are not on the schedule grid are refused', () => {
    assert.throws(
      () => t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '11:10', customer: customer() }),
      (err) => err.status === 409,
    );
    assert.throws(
      () => t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-05', time: '10:30', customer: customer() }),
      (err) => err.status === 409,
      'inside the minimum-notice window',
    );
  });

  test('returning customers are matched by phone number', () => {
    const a = t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '09:00', customer: { name: 'Sam Lee', phone: '(780) 555-0101', email: 'sam@example.com' } });
    const b = t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-07', time: '09:00', customer: { name: 'Sam Lee', phone: '+1 780-555-0101', email: 'sam@example.com' } });
    assert.equal(a.customer.id, b.customer.id);
  });

  test('cancelling frees the time; restoring is refused if it was rebooked', () => {
    const a = t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '15:00', customer: customer(1) });
    t.scheduler.setStatus(a.id, 'cancelled', 'Owner');
    const b = t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-06', time: '15:00', customer: customer(2) });
    assert.equal(b.status, 'booked');
    assert.throws(() => t.scheduler.setStatus(a.id, 'booked', 'Owner'), (err) => err.status === 409);
  });

  test('paused online booking and hidden services are rejected', () => {
    const s = t.store.services.get(3);
    t.store.services.update(3, { ...s, isActive: false });
    assert.throws(() => t.scheduler.book({ serviceId: 3, date: '2026-10-06', time: '10:00', customer: customer() }), (err) => err.status === 422);

    t.store.settings.saveBooking({ enabled: false });
    assert.throws(() => t.scheduler.book({ serviceId: 1, date: '2026-10-06', time: '10:00', customer: customer() }), (err) => err.status === 503);
  });
});

describe('admin scheduling', () => {
  const base = { serviceId: 1, barberId: 1, customer: customer(9), notes: '' };

  test('overlaps are always refused, even with override', () => {
    t.scheduler.adminSave({ ...base, date: '2026-10-06', time: '16:00' });
    assert.throws(
      () => t.scheduler.adminSave({ ...base, date: '2026-10-06', time: '16:15', override: true }),
      (err) => err.status === 409 && err.extra.code === 'BARBER_BUSY',
    );
  });

  test('outside business hours needs confirmation (override)', () => {
    assert.throws(
      () => t.scheduler.adminSave({ ...base, date: '2026-10-06', time: '19:30' }),
      (err) => err.status === 422 && err.extra.code === 'OUTSIDE_AVAILABILITY',
    );
    const appt = t.scheduler.adminSave({ ...base, date: '2026-10-06', time: '19:30', override: true });
    assert.equal(appt.start, '19:30');
    // Editing notes later doesn't re-trigger the warning because the time didn't move.
    const edited = t.scheduler.adminSave({ ...base, id: appt.id, date: '2026-10-06', time: '19:30', notes: 'Walk-in' });
    assert.equal(edited.notes, 'Walk-in');
  });

  test('custom durations are respected', () => {
    const appt = t.scheduler.adminSave({ ...base, date: '2026-10-07', time: '10:00', durationMin: 90 });
    assert.equal(appt.end, '11:30');
    const res = t.scheduler.slotsFor({ serviceId: 1, barberId: 1, date: '2026-10-07' });
    assert.equal(res.slots.find((s) => s.time === '11:00').available, false);
    assert.equal(res.slots.find((s) => s.time === '11:30').available, true);
  });
});

describe('customer self-cancellation', () => {
  test('allowed until the cutoff, then refused', () => {
    const appt = t.scheduler.book({ serviceId: 1, barberId: 1, date: '2026-10-05', time: '13:00', customer: customer() });
    assert.equal(t.scheduler.canSelfCancel(appt).ok, true); // 3 hours ahead, cutoff 2 hours
    t.setNow('2026-10-05T17:30:00Z'); // 11:30 AM — 1.5 hours before
    assert.equal(t.scheduler.canSelfCancel(appt).ok, false);
    assert.throws(() => t.scheduler.cancelByToken(appt.token), (err) => err.status === 409);
  });

  test('cancels by private token', () => {
    const appt = t.scheduler.book({ serviceId: 1, barberId: 2, date: '2026-10-08', time: '10:00', customer: customer() });
    const cancelled = t.scheduler.cancelByToken(appt.token);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'customer');
    assert.throws(() => t.scheduler.cancelByToken(appt.token), (err) => err.status === 409);
  });
});
