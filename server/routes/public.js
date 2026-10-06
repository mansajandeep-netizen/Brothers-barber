import { HttpError } from '../lib/errors.js';
import { validate } from '../lib/validation.js';
import { appointmentIcs } from '../lib/ics.js';
import { cancellationEmail, confirmationEmail, shopNotificationEmail } from '../lib/mailer.js';
import { formatDateLong, formatTime12 } from '../lib/time.js';
import { rateLimiter } from '../http.js';
import { clientData } from '../views/home.js';

/** Fields of an appointment that are safe to show the customer who booked it. */
export function publicAppointment(appt, siteUrl) {
  return {
    reference: appt.reference,
    status: appt.status,
    serviceName: appt.serviceName,
    barberName: appt.barberName,
    date: appt.date,
    dateLabel: formatDateLong(appt.date),
    time: appt.start,
    timeLabel: formatTime12(appt.startMin),
    durationMin: appt.durationMin,
    customerName: appt.customer.name,
    customerEmail: appt.customer.email,
    manageUrl: `${siteUrl}/appointment/${appt.token}`,
    calendarUrl: `/api/bookings/${appt.token}/calendar.ics`,
  };
}

export function registerPublicRoutes(router, deps) {
  const { store, scheduler, mailer, config, site } = deps;
  const bookingLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: config.bookingRateLimit ?? 20 });
  const readLimiter = rateLimiter({ windowMs: 60 * 1000, max: 240 });
  const cancelLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

  const throttle = (limiter, key) => {
    const r = limiter.hit(key);
    if (!r.ok) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { retryAfter: r.retryAfter });
  };

  function shopInbox() {
    return config.mail.shopNotify || store.settings.business().email;
  }

  function notify(email) {
    // Fire and forget — a slow mail server must never hold up a booking.
    mailer.send(email).catch(() => {});
  }

  router.get('/api/health', () => ({ ok: true }));

  router.get('/api/booking/options', (ctx) => {
    throttle(readLimiter, ctx.ip);
    return clientData(site());
  });

  router.get('/api/availability/calendar', (ctx) => {
    throttle(readLimiter, ctx.ip);
    const q = Object.fromEntries(ctx.query);
    const v = validate(q);
    const serviceId = v.id('serviceId', { required: true, label: 'Service' });
    const barberId = v.id('barberId', { label: 'Stylist' });
    const from = v.date('from', { label: 'Start date' });
    const to = v.date('to', { label: 'End date' });
    v.done();
    return scheduler.calendar({ serviceId, barberId, from, to });
  });

  router.get('/api/availability/slots', (ctx) => {
    throttle(readLimiter, ctx.ip);
    const v = validate(Object.fromEntries(ctx.query));
    const serviceId = v.id('serviceId', { required: true, label: 'Service' });
    const barberId = v.id('barberId', { label: 'Stylist' });
    const date = v.date('date');
    v.done();
    return scheduler.slotsFor({ serviceId, barberId, date });
  });

  router.post('/api/bookings', async (ctx) => {
    const body = await ctx.body();
    if (body && typeof body.website === 'string' && body.website.trim()) {
      // Honeypot field filled in — almost certainly a bot.
      throw new HttpError(400, 'We couldn’t process this booking. Please call us to book.');
    }
    const v = validate(body);
    const serviceId = v.id('serviceId', { required: true, label: 'Service' });
    const barberId = v.id('barberId', { label: 'Stylist' });
    const date = v.date('date');
    const time = v.time('time');
    const name = v.text('name', { required: true, min: 2, max: 80, label: 'Full name' });
    const phone = v.phone('phone', { required: true });
    const email = v.email('email', { required: true });
    const notes = v.text('notes', { max: 500, multiline: true, label: 'Notes' });
    v.done();
    throttle(bookingLimiter, ctx.ip);

    const appt = scheduler.book({ serviceId, barberId, date, time, customer: { name, phone, email }, notes });
    const business = store.settings.business();
    notify({ to: appt.customer.email, ...confirmationEmail(appt, business, config.siteUrl) });
    const inbox = shopInbox();
    if (inbox) notify({ to: inbox, ...shopNotificationEmail(appt, business, config.siteUrl, 'new') });

    ctx.status = 201;
    return { appointment: publicAppointment(appt, config.siteUrl), emailQueued: mailer.canSend };
  });

  function findByToken(token) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'We couldn’t find that appointment.');
    const appt = store.appointments.getByToken(token);
    if (!appt) throw new HttpError(404, 'We couldn’t find that appointment.');
    return appt;
  }

  router.get('/api/bookings/:token', (ctx) => {
    throttle(cancelLimiter, ctx.ip);
    const appt = findByToken(ctx.params.token);
    return { appointment: publicAppointment(appt, config.siteUrl), ...scheduler.canSelfCancel(appt) };
  });

  router.post('/api/bookings/:token/cancel', (ctx) => {
    throttle(cancelLimiter, ctx.ip);
    findByToken(ctx.params.token);
    const appt = scheduler.cancelByToken(ctx.params.token);
    const business = store.settings.business();
    notify({ to: appt.customer.email, ...cancellationEmail(appt, business, config.siteUrl) });
    const inbox = shopInbox();
    if (inbox) notify({ to: inbox, ...shopNotificationEmail(appt, business, config.siteUrl, 'cancelled') });
    return { appointment: publicAppointment(appt, config.siteUrl) };
  });

  router.get('/api/bookings/:token/calendar.ics', (ctx) => {
    const appt = findByToken(ctx.params.token);
    const ics = appointmentIcs(appt, store.settings.business(), {
      timezone: config.timezone,
      siteHost: new URL(config.siteUrl).host,
    });
    ctx.res.setHeader('Content-Disposition', `attachment; filename="manhandler-${appt.reference}.ics"`);
    ctx.send(200, ics, 'text/calendar; charset=utf-8');
  });
}
