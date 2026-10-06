import { HttpError } from './errors.js';
import {
  addDays,
  dayOfWeek,
  diffDays,
  formatTime12,
  minutesToTime,
  timeToMinutes,
  zonedNow,
  zonedToUtc,
  DAY_NAMES,
} from './time.js';

const MAX_RANGE_DAYS = 62;

/**
 * The scheduling engine: computes bookable slots and creates, moves and
 * cancels appointments without ever double-booking a barber.
 *
 * Every write runs inside a BEGIN IMMEDIATE transaction that re-checks
 * availability, and a partial unique index on (barber, date, start) backs it up.
 */
export function createScheduler(store, { timezone, now = () => new Date() }) {
  /** Snapshot of everything slot computation needs, read once per request. */
  function context() {
    const rules = store.settings.booking();
    const { date: today, minutes: nowMin } = zonedNow(timezone, now());
    const hours = new Map(store.hours.list().map((h) => [h.day, h]));
    const barbers = store.barbers.list({ activeOnly: true });
    return { rules, today, nowMin, lastDate: addDays(today, rules.maxAdvanceDays), hours, barbers };
  }

  function durationFor(service, rules) {
    return service?.durationMin || rules.defaultDuration;
  }

  /**
   * Slots for one date.
   * @returns {{ open: boolean, slots: Array<{time, startMin, available, barberIds}> }}
   *   `open` is false when the shop is closed or the date is outside the booking window.
   */
  function daySlots(ctx, { date, duration, barberId = null, excludeId = 0, blocks = null, busy = null, admin = false }) {
    if (!admin && (date < ctx.today || date > ctx.lastDate)) return { open: false, slots: [] };
    const dow = dayOfWeek(date);
    const hours = ctx.hours.get(dow);
    if (!hours || !hours.isOpen) return { open: false, slots: [] };

    let barbers = admin ? store.barbers.list() : ctx.barbers;
    barbers = barbers.filter((b) => (barberId ? b.id === barberId : true) && (admin || b.workDays.includes(dow)));
    if (!barbers.length) return { open: true, slots: [] };

    const ids = barbers.map((b) => b.id);
    const taken = new Map(ids.map((id) => [id, []]));
    for (const a of busy ?? store.appointments.busyOn(date, ids, excludeId)) {
      if (a.id !== excludeId && (!a.date || a.date === date)) taken.get(a.barber_id)?.push([a.start_min, a.end_min]);
    }
    for (const bl of blocks ?? store.blocks.between(date, date)) {
      if (bl.dateFrom > date || bl.dateTo < date) continue;
      for (const id of ids) if (bl.barberId == null || bl.barberId === id) taken.get(id).push([bl.startMin, bl.endMin]);
    }

    const earliest = date === ctx.today && !admin ? ctx.nowMin + ctx.rules.minNoticeMinutes : -1;
    const step = Math.max(5, ctx.rules.slotInterval);
    const slots = [];
    for (let t = hours.open; t + duration <= hours.close; t += step) {
      if (t < earliest) continue;
      const free = ids.filter((id) => !taken.get(id).some(([s, e]) => s < t + duration && e > t));
      slots.push({ time: minutesToTime(t), startMin: t, available: free.length > 0, barberIds: free });
    }
    return { open: true, slots };
  }

  function requireService(serviceId, { allowInactive = false } = {}) {
    const service = store.services.get(serviceId);
    if (!service || (!service.isActive && !allowInactive)) {
      throw new HttpError(422, 'That service is no longer available. Please choose another.', { code: 'SERVICE_UNAVAILABLE' });
    }
    return service;
  }

  function requireBookableBarber(barberId) {
    const barber = store.barbers.getLive(barberId);
    if (!barber || !barber.isActive) {
      throw new HttpError(422, 'That stylist isn’t taking online bookings right now. Please choose another.', {
        code: 'BARBER_UNAVAILABLE',
      });
    }
    return barber;
  }

  /** Spread "any barber" bookings evenly: fewest appointments that day wins. */
  function pickBarber(candidateIds, date, ctx) {
    const load = new Map(candidateIds.map((id) => [id, 0]));
    for (const a of store.appointments.busyOn(date, candidateIds)) load.set(a.barber_id, load.get(a.barber_id) + 1);
    const order = new Map(ctx.barbers.map((b, i) => [b.id, i]));
    return [...candidateIds].sort((a, b) => load.get(a) - load.get(b) || order.get(a) - order.get(b))[0];
  }

  function insertSafely(fields) {
    try {
      return store.appointments.insert(fields);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw slotTaken();
      throw err;
    }
  }

  const slotTaken = () =>
    new HttpError(409, 'Sorry — that time was just booked. Please choose another time.', { code: 'SLOT_TAKEN' });

  return {
    context,
    durationFor,

    /** Public: slots for a date (no barber ids exposed). */
    slotsFor({ serviceId, barberId = null, date }) {
      const ctx = context();
      const service = requireService(serviceId);
      if (barberId) requireBookableBarber(barberId);
      const { open, slots } = daySlots(ctx, { date, duration: durationFor(service, ctx.rules), barberId });
      return {
        date,
        open,
        slots: slots.map((s) => ({ time: s.time, label: formatTime12(s.startMin), available: s.available })),
      };
    },

    /** Public: per-day availability summary for the booking calendar. */
    calendar({ serviceId, barberId = null, from, to }) {
      const ctx = context();
      const service = requireService(serviceId);
      if (barberId) requireBookableBarber(barberId);
      if (from < ctx.today) from = ctx.today;
      if (to > ctx.lastDate) to = ctx.lastDate;
      const days = [];
      if (from > to) return { today: ctx.today, lastDate: ctx.lastDate, days };
      if (diffDays(from, to) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS);
      const duration = durationFor(service, ctx.rules);
      const blocks = store.blocks.between(from, to);
      const busy = store.appointments.busyBetween(from, to);
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const dayBusy = busy.filter((a) => a.date === d);
        const { open, slots } = daySlots(ctx, { date: d, duration, barberId, blocks, busy: dayBusy });
        days.push({ date: d, open, available: slots.filter((s) => s.available).length });
      }
      return { today: ctx.today, lastDate: ctx.lastDate, days };
    },

    /** Admin: every start time on a date with availability, ignoring notice/window rules. */
    adminSlots({ serviceId, barberId, date, excludeId = 0, durationMin = null }) {
      const ctx = context();
      const service = requireService(serviceId, { allowInactive: true });
      const duration = durationMin || durationFor(service, ctx.rules);
      const { open, slots } = daySlots(ctx, { date, duration, barberId, excludeId, admin: true });
      return {
        date,
        open,
        duration,
        slots: slots.map((s) => ({ time: s.time, label: formatTime12(s.startMin), available: s.available })),
      };
    },

    /** Public booking. barberId null = any available barber. */
    book({ serviceId, barberId = null, date, time, customer, notes = '' }) {
      return store.db.tx(() => {
        const ctx = context();
        if (!ctx.rules.enabled) {
          throw new HttpError(503, 'Online booking is paused right now. Please call us to book.', { code: 'BOOKING_DISABLED' });
        }
        const service = requireService(serviceId);
        if (barberId) requireBookableBarber(barberId);
        const duration = durationFor(service, ctx.rules);
        const startMin = timeToMinutes(time);
        const { slots } = daySlots(ctx, { date, duration, barberId });
        const slot = slots.find((s) => s.startMin === startMin);
        if (!slot || !slot.available) throw slotTaken();

        const chosenBarber = barberId ?? pickBarber(slot.barberIds, date, ctx);
        const customerId = store.customers.upsert(customer);
        const id = insertSafely({
          customerId,
          serviceId: service.id,
          barberId: chosenBarber,
          serviceName: service.name,
          priceCents: service.priceCents,
          date,
          startMin,
          endMin: startMin + duration,
          notes,
          source: 'online',
        });
        return store.appointments.get(id);
      });
    },

    /**
     * Admin create/update. Overlapping another appointment is always refused.
     * Booking outside hours or over a blocked time needs `override: true`.
     */
    adminSave({ id = null, serviceId, barberId, date, time, durationMin = null, customer, notes = '', override = false }) {
      return store.db.tx(() => {
        const ctx = context();
        const existing = id ? store.appointments.get(id) : null;
        if (id && !existing) throw new HttpError(404, 'Appointment not found.');
        if (existing && existing.status === 'cancelled') {
          throw new HttpError(409, 'Cancelled appointments can’t be edited. Create a new appointment instead.');
        }
        const service = requireService(serviceId, { allowInactive: true });
        const barber = store.barbers.getLive(barberId) ?? (existing?.barberId === barberId ? store.barbers.get(barberId) : null);
        if (!barber) throw new HttpError(422, 'Please choose a stylist.', { code: 'VALIDATION', fields: { barberId: 'Choose a stylist' } });

        const duration = durationMin || durationFor(service, ctx.rules);
        const startMin = timeToMinutes(time);
        const endMin = startMin + duration;
        if (endMin > 24 * 60) {
          throw new HttpError(422, 'The appointment must finish before midnight.', { code: 'VALIDATION', fields: { time: 'Too late' } });
        }

        const clash = store.appointments.overlapping({ barberId, date, startMin, endMin, excludeId: id ?? 0 });
        if (clash) {
          const other = store.appointments.get(clash.id);
          throw new HttpError(
            409,
            `${barber.name} already has ${other.customer.name} booked at ${formatTime12(other.startMin)}. Choose another time or stylist.`,
            { code: 'BARBER_BUSY' },
          );
        }

        const moved =
          !existing ||
          existing.date !== date ||
          existing.startMin !== startMin ||
          existing.endMin !== endMin ||
          existing.barberId !== barberId;
        if (moved && !override) {
          const issues = availabilityIssues(ctx, { barber, date, startMin, endMin });
          if (issues.length) {
            throw new HttpError(422, issues.join(' '), { code: 'OUTSIDE_AVAILABILITY' });
          }
        }

        const customerId = store.customers.upsert(customer);
        const fields = {
          customerId,
          serviceId: service.id,
          barberId,
          serviceName: service.name,
          priceCents: existing && existing.serviceId === service.id ? existing.priceCents ?? service.priceCents : service.priceCents,
          date,
          startMin,
          endMin,
          notes,
          source: 'admin',
        };
        if (existing) {
          try {
            store.appointments.update(id, fields);
          } catch (err) {
            if (String(err.message).includes('UNIQUE')) throw slotTaken();
            throw err;
          }
          return store.appointments.get(id);
        }
        return store.appointments.get(insertSafely(fields));
      });
    },

    setStatus(id, status, by) {
      return store.db.tx(() => {
        const appt = store.appointments.get(id);
        if (!appt) throw new HttpError(404, 'Appointment not found.');
        if (appt.status === 'cancelled' && status !== 'cancelled') {
          // Re-activating a cancelled appointment must not create a double booking.
          const clash = store.appointments.overlapping({
            barberId: appt.barberId,
            date: appt.date,
            startMin: appt.startMin,
            endMin: appt.endMin,
            excludeId: id,
          });
          if (clash) throw new HttpError(409, 'That time has since been booked by someone else.', { code: 'SLOT_TAKEN' });
        }
        store.appointments.setStatus(id, status, by);
        return store.appointments.get(id);
      });
    },

    /** Customer self-service cancellation via the private link in their confirmation. */
    cancelByToken(token) {
      return store.db.tx(() => {
        const appt = store.appointments.getByToken(token);
        if (!appt) throw new HttpError(404, 'We couldn’t find that appointment.');
        if (appt.status !== 'booked') {
          throw new HttpError(409, `This appointment is already ${appt.status === 'no_show' ? 'closed' : appt.status}.`);
        }
        const check = canSelfCancel(appt);
        if (!check.ok) throw new HttpError(409, check.reason);
        store.appointments.setStatus(appt.id, 'cancelled', 'customer');
        return store.appointments.get(appt.id);
      });
    },

    canSelfCancel,

    /** Admin overview numbers. */
    overview() {
      const ctx = context();
      const todays = store.appointments.listRange({ from: ctx.today, to: ctx.today });
      let openSlots = 0;
      for (const b of ctx.barbers) {
        const { slots } = daySlots(ctx, { date: ctx.today, duration: ctx.rules.defaultDuration, barberId: b.id });
        openSlots += slots.filter((s) => s.available).length;
      }
      return {
        today: ctx.today,
        nowMin: ctx.nowMin,
        stats: {
          today: todays.filter((a) => a.status !== 'cancelled').length,
          todayCompleted: todays.filter((a) => a.status === 'completed').length,
          upcoming: store.appointments.countUpcoming(ctx.today, ctx.nowMin),
          total: store.appointments.countActive(),
          openSlotsToday: openSlots,
          customers: store.customers.count(),
        },
        todays,
        upcoming: store.appointments.upcoming(addDays(ctx.today, 1), 0, 8),
      };
    },
  };

  function canSelfCancel(appt) {
    if (appt.status !== 'booked') return { ok: false, reason: 'This appointment can no longer be changed online.' };
    const { cancelCutoffHours } = store.settings.booking();
    const startsAt = zonedToUtc(appt.date, appt.startMin, timezone).getTime();
    const hoursLeft = (startsAt - now().getTime()) / 3600000;
    if (hoursLeft < 0) return { ok: false, reason: 'This appointment has already started.' };
    if (hoursLeft < cancelCutoffHours) {
      return {
        ok: false,
        reason: `Online cancellations close ${cancelCutoffHours} hour${cancelCutoffHours === 1 ? '' : 's'} before your appointment. Please call the shop.`,
      };
    }
    return { ok: true };
  }

  function availabilityIssues(ctx, { barber, date, startMin, endMin }) {
    const issues = [];
    const dow = dayOfWeek(date);
    const hours = ctx.hours.get(dow);
    if (!hours?.isOpen) issues.push(`The shop is closed on ${DAY_NAMES[dow]}s.`);
    else if (startMin < hours.open || endMin > hours.close) {
      issues.push(`That’s outside business hours (${formatTime12(hours.open)}–${formatTime12(hours.close)}).`);
    }
    if (!barber.workDays.includes(dow)) issues.push(`${barber.name} doesn’t normally work ${DAY_NAMES[dow]}s.`);
    const blocked = store.blocks
      .between(date, date)
      .some((bl) => (bl.barberId == null || bl.barberId === barber.id) && bl.startMin < endMin && bl.endMin > startMin);
    if (blocked) issues.push('That time is blocked off.');
    return issues;
  }
}
