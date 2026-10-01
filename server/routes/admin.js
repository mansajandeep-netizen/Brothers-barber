import { HttpError } from '../lib/errors.js';
import { validate } from '../lib/validation.js';
import { burnPasswordCheck, MIN_PASSWORD_LENGTH, verifyPassword } from '../lib/auth.js';
import { cancellationEmail } from '../lib/mailer.js';
import { addDays, diffDays, startOfWeek, timeToMinutes, zonedNow } from '../lib/time.js';
import { rateLimiter, serializeCookie } from '../http.js';
import { CATEGORIES, PLACEHOLDER_BARBER_NAME } from '../seed-data.js';

export const SESSION_COOKIE = 'bb_session';
const STATUSES = ['booked', 'completed', 'cancelled', 'no_show'];

export function registerAdminRoutes(router, deps) {
  const { store, scheduler, mailer, config, gallery, invalidate } = deps;
  const ipLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const emailLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 6 });

  /* -------------------------------- guards -------------------------------- */

  const auth = (role = null) => (ctx) => {
    const token = ctx.cookies[SESSION_COOKIE];
    const session = token ? store.sessions.lookup(token) : null;
    if (!session) throw new HttpError(401, 'Please sign in.', { code: 'UNAUTHENTICATED' });
    if (ctx.method !== 'GET' && ctx.req.headers['x-csrf-token'] !== session.csrf) {
      throw new HttpError(403, 'Your session has expired. Please refresh the page.', { code: 'CSRF' });
    }
    if (role && session.user.role !== role) {
      throw new HttpError(403, 'Only the shop owner can change this.', { code: 'FORBIDDEN' });
    }
    ctx.session = session;
    ctx.user = session.user;
  };
  const staff = auth();
  const owner = auth('owner');

  const today = () => zonedNow(config.timezone).date;
  const id = (ctx) => {
    const n = Number(ctx.params.id);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found.');
    return n;
  };

  // Any successful change can affect the public site (hours, prices, names...).
  const mutate = (fn) => async (ctx) => {
    const result = await fn(ctx);
    invalidate();
    return result;
  };

  /* ----------------------------- authentication ---------------------------- */

  router.post('/api/admin/login', async (ctx) => {
    const v = validate(await ctx.body());
    const email = v.email('email', { required: true });
    const password = v.text('password', { required: true, max: 200, label: 'Password' });
    v.done();

    const ipCheck = ipLimiter.hit(ctx.ip);
    const emailCheck = emailLimiter.hit(email);
    if (!ipCheck.ok || !emailCheck.ok) {
      throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }

    const row = store.users.getForLogin(email);
    const ok = row ? await verifyPassword(password, row.password_hash) : (await burnPasswordCheck(password), false);
    if (!ok) throw new HttpError(401, 'That email and password don’t match.', { code: 'BAD_CREDENTIALS' });

    emailLimiter.reset(email);
    store.users.touchLogin(row.id);
    store.sessions.purgeExpired();
    const { token, csrf } = store.sessions.create(row.id, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.res.setHeader(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE, token, {
        maxAge: store.sessions.ttlMs / 1000,
        secure: config.secureCookies,
        sameSite: 'Strict',
      }),
    );
    return { user: store.users.get(row.id), csrf };
  });

  router.post('/api/admin/logout', (ctx) => {
    const token = ctx.cookies[SESSION_COOKIE];
    const session = token ? store.sessions.lookup(token) : null;
    if (session) store.sessions.destroy(session.sessionId);
    ctx.res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: config.secureCookies, sameSite: 'Strict' }));
    return { ok: true };
  });

  router.get('/api/admin/me', (ctx) => {
    const token = ctx.cookies[SESSION_COOKIE];
    const session = token ? store.sessions.lookup(token) : null;
    return session ? { user: session.user, csrf: session.csrf } : { user: null };
  });

  router.post('/api/admin/me/password', staff, async (ctx) => {
    const v = validate(await ctx.body());
    const current = v.text('currentPassword', { required: true, max: 200, label: 'Current password' });
    const next = v.text('newPassword', { required: true, min: MIN_PASSWORD_LENGTH, max: 200, label: 'New password' });
    v.done();
    const row = store.users.getForLogin(ctx.user.email);
    if (!(await verifyPassword(current, row.password_hash))) {
      throw new HttpError(422, 'Your current password is incorrect.', {
        code: 'VALIDATION',
        fields: { currentPassword: 'Incorrect password' },
      });
    }
    await store.users.setPassword(ctx.user.id, next);
    store.sessions.destroyForUser(ctx.user.id, ctx.session.sessionId);
    return { ok: true };
  });

  /* -------------------------------- overview ------------------------------- */

  router.get('/api/admin/overview', staff, (ctx) => {
    const data = scheduler.overview();
    data.checklist = ctx.user.role === 'owner' ? setupChecklist() : [];
    data.mail = { provider: mailer.provider, canSend: mailer.canSend };
    return data;
  });

  function setupChecklist() {
    const barbers = store.barbers.list();
    const services = store.services.list({ activeOnly: true });
    const business = store.settings.business();
    const rules = store.settings.booking();
    const noPrice = services.filter((s) => s.priceCents == null).length;
    const noDuration = services.filter((s) => !s.durationMin).length;
    const placeholders = gallery().filter((g) => g.placeholder).length;
    return [
      {
        id: 'barbers',
        done: barbers.length > 0 && !barbers.some((b) => PLACEHOLDER_BARBER_NAME.test(b.name)),
        label: 'Add your barbers’ real names',
        hint: 'Placeholder names like “Barber 1” are shown to customers when they book.',
        link: '#/barbers',
      },
      {
        id: 'prices',
        done: noPrice === 0,
        label: 'Add service prices',
        hint: noPrice ? `${noPrice} service${noPrice === 1 ? ' has' : 's have'} no price yet — prices stay hidden until you add them.` : '',
        link: '#/services',
      },
      {
        id: 'durations',
        done: noDuration === 0,
        label: 'Set service durations',
        hint: noDuration ? `${noDuration} service${noDuration === 1 ? ' uses' : 's use'} the default ${rules.defaultDuration}-minute booking length.` : '',
        link: '#/services',
      },
      {
        id: 'email',
        done: mailer.canSend,
        label: 'Connect email for booking confirmations',
        hint: 'Add RESEND_API_KEY or SMTP settings and MAIL_FROM to the server environment (see README).',
        link: null,
      },
      {
        id: 'gallery',
        done: placeholders === 0,
        label: 'Replace stock gallery photos with your own work',
        hint: placeholders ? `${placeholders} placeholder photo${placeholders === 1 ? '' : 's'} — see content/gallery.json.` : '',
        link: null,
      },
      {
        id: 'reviews',
        done: store.reviews.list().length > 0,
        label: 'Feature a few Google reviews (optional)',
        hint: 'Copy your favourite reviews from Google so they appear on the site.',
        link: '#/reviews',
      },
      {
        id: 'social',
        done: !!(business.instagramUrl || business.facebookUrl || business.tiktokUrl),
        label: 'Add social media links (optional)',
        hint: 'Icons appear in the footer once a link is added.',
        link: '#/settings',
      },
    ];
  }

  /* ------------------------------ appointments ----------------------------- */

  router.get('/api/admin/appointments', staff, (ctx) => {
    const v = validate(Object.fromEntries(ctx.query));
    let from = v.date('from', { required: false }) ?? today();
    let to = v.date('to', { required: false }) ?? from;
    const barberId = v.id('barberId');
    const status = v.oneOf('status', STATUSES, { required: false });
    const q = v.text('q', { max: 80 });
    v.done();
    if (to < from) [from, to] = [to, from];
    if (diffDays(from, to) > 92) to = addDays(from, 92);
    return { from, to, appointments: store.appointments.listRange({ from, to, barberId, status, q }) };
  });

  router.get('/api/admin/appointments/:id', staff, (ctx) => {
    const appt = store.appointments.get(id(ctx));
    if (!appt) throw new HttpError(404, 'Appointment not found.');
    return { appointment: appt };
  });

  function readAppointment(body) {
    const v = validate(body);
    const data = {
      serviceId: v.id('serviceId', { required: true, label: 'Service' }),
      barberId: v.id('barberId', { required: true, label: 'Barber' }),
      date: v.date('date'),
      time: v.time('time'),
      durationMin: v.int('durationMin', { min: 5, max: 480, label: 'Duration' }),
      customer: {
        name: v.text('customerName', { required: true, min: 2, max: 80, label: 'Customer name' }),
        phone: v.phone('customerPhone', { required: true }),
        email: v.email('customerEmail'),
      },
      notes: v.text('notes', { max: 1000, multiline: true, label: 'Notes' }),
      override: v.bool('override'),
    };
    v.done();
    return data;
  }

  router.post('/api/admin/appointments', staff, mutate(async (ctx) => {
    const appt = scheduler.adminSave(readAppointment(await ctx.body()));
    ctx.status = 201;
    return { appointment: appt };
  }));

  router.patch('/api/admin/appointments/:id', staff, mutate(async (ctx) => {
    return { appointment: scheduler.adminSave({ id: id(ctx), ...readAppointment(await ctx.body()) }) };
  }));

  router.post('/api/admin/appointments/:id/status', staff, mutate(async (ctx) => {
    const v = validate(await ctx.body());
    const status = v.oneOf('status', STATUSES, { label: 'Status' });
    const notifyCustomer = v.bool('notify');
    v.done();
    const before = store.appointments.get(id(ctx));
    const appt = scheduler.setStatus(id(ctx), status, ctx.user.name);
    if (status === 'cancelled' && before?.status !== 'cancelled' && notifyCustomer && appt.customer.email) {
      mailer.send({ to: appt.customer.email, ...cancellationEmail(appt, store.settings.business(), config.siteUrl) }).catch(() => {});
    }
    return { appointment: appt };
  }));

  router.get('/api/admin/slots', staff, (ctx) => {
    const v = validate(Object.fromEntries(ctx.query));
    const serviceId = v.id('serviceId', { required: true, label: 'Service' });
    const barberId = v.id('barberId', { required: true, label: 'Barber' });
    const date = v.date('date');
    const excludeId = v.id('excludeId') ?? 0;
    const durationMin = v.int('durationMin', { min: 5, max: 480, label: 'Duration' });
    v.done();
    return scheduler.adminSlots({ serviceId, barberId, date, excludeId, durationMin });
  });

  router.get('/api/admin/schedule', staff, (ctx) => {
    // Week grid helper: appointments plus open/closed info for each day.
    const v = validate(Object.fromEntries(ctx.query));
    const start = startOfWeek(v.date('date', { required: false }) ?? today());
    v.done();
    const end = addDays(start, 6);
    return {
      from: start,
      to: end,
      hours: store.hours.list(),
      blocks: store.blocks.between(start, end),
      appointments: store.appointments.listRange({ from: start, to: end }),
    };
  });

  /* -------------------------------- customers ------------------------------ */

  router.get('/api/admin/customers', staff, (ctx) => {
    const v = validate(Object.fromEntries(ctx.query));
    const q = v.text('q', { max: 80 });
    const page = v.int('page', { min: 1, max: 10000 }) ?? 1;
    v.done();
    const limit = 25;
    const result = store.customers.list({ q, limit, offset: (page - 1) * limit });
    return { ...result, page, pageSize: limit };
  });

  router.get('/api/admin/customers/:id', staff, (ctx) => {
    const customer = store.customers.get(id(ctx));
    if (!customer) throw new HttpError(404, 'Customer not found.');
    return { customer, appointments: store.appointments.forCustomer(customer.id) };
  });

  router.patch('/api/admin/customers/:id', staff, async (ctx) => {
    const v = validate(await ctx.body());
    const data = {
      name: v.text('name', { required: true, min: 2, max: 80, label: 'Name' }),
      phone: v.phone('phone', { required: true }),
      email: v.email('email'),
      notes: v.text('notes', { max: 2000, multiline: true, label: 'Notes' }),
    };
    v.done();
    return { customer: store.customers.update(id(ctx), data) };
  });

  /* -------------------------------- services ------------------------------- */

  function readService(body) {
    const v = validate(body);
    const data = {
      name: v.text('name', { required: true, max: 60, label: 'Service name' }),
      category: v.oneOf('category', Object.keys(CATEGORIES), { label: 'Category' }),
      description: v.text('description', { max: 300, multiline: true, label: 'Description' }),
      durationMin: v.int('durationMin', { min: 5, max: 480, label: 'Duration' }),
      priceCents: v.money('price'),
      priceFrom: v.bool('priceFrom'),
      isActive: v.has('isActive') ? v.bool('isActive') : true,
      sortOrder: v.int('sortOrder', { min: 0, max: 100000, label: 'Sort order' }) ?? 0,
    };
    v.done();
    return data;
  }

  router.get('/api/admin/services', staff, () => ({
    services: store.services.list(),
    categories: CATEGORIES,
    defaultDuration: store.settings.booking().defaultDuration,
  }));
  router.post('/api/admin/services', owner, mutate(async (ctx) => {
    ctx.status = 201;
    return { service: store.services.create(readService(await ctx.body())) };
  }));
  router.patch('/api/admin/services/:id', owner, mutate(async (ctx) => ({
    service: store.services.update(id(ctx), readService(await ctx.body())),
  })));
  router.delete('/api/admin/services/:id', owner, mutate((ctx) => {
    store.services.remove(id(ctx));
    return { ok: true };
  }));

  /* --------------------------------- barbers ------------------------------- */

  function readBarber(body) {
    const v = validate(body);
    const workDays = Array.isArray(body?.workDays)
      ? [...new Set(body.workDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [0, 1, 2, 3, 4, 5, 6];
    const data = {
      name: v.text('name', { required: true, max: 60, label: 'Name' }),
      title: v.text('title', { max: 80, label: 'Title' }),
      workDays,
      isActive: v.has('isActive') ? v.bool('isActive') : true,
      sortOrder: v.int('sortOrder', { min: 0, max: 100000, label: 'Sort order' }) ?? 0,
    };
    v.done();
    return data;
  }

  router.get('/api/admin/barbers', staff, () => ({ barbers: store.barbers.list() }));
  router.post('/api/admin/barbers', owner, mutate(async (ctx) => {
    ctx.status = 201;
    return { barber: store.barbers.create(readBarber(await ctx.body())) };
  }));
  router.patch('/api/admin/barbers/:id', owner, mutate(async (ctx) => ({
    barber: store.barbers.update(id(ctx), readBarber(await ctx.body())),
  })));
  router.delete('/api/admin/barbers/:id', owner, mutate((ctx) => {
    store.barbers.remove(id(ctx), today());
    return { ok: true };
  }));

  /* ------------------------------ availability ----------------------------- */

  router.get('/api/admin/hours', staff, () => ({ hours: store.hours.list() }));
  router.put('/api/admin/hours', owner, mutate(async (ctx) => {
    const body = await ctx.body();
    if (!Array.isArray(body?.hours) || body.hours.length !== 7) throw new HttpError(422, 'Please provide hours for all 7 days.');
    const fields = {};
    const hours = body.hours.map((h, i) => {
      const day = Number(h?.day);
      const isOpen = !!h?.isOpen;
      const open = timeToMinutes(String(h?.open ?? ''));
      const close = timeToMinutes(String(h?.close ?? ''));
      if (!Number.isInteger(day) || day < 0 || day > 6) fields[`day${i}`] = 'Invalid day';
      if (isOpen && (Number.isNaN(open) || Number.isNaN(close) || close <= open)) fields[`day${day}`] = 'Closing time must be after opening time.';
      return { day, isOpen, open: Number.isNaN(open) ? 540 : open, close: Number.isNaN(close) ? 1140 : close };
    });
    if (new Set(hours.map((h) => h.day)).size !== 7) fields.hours = 'Each day must appear once.';
    if (Object.keys(fields).length) throw new HttpError(422, 'Please check the highlighted days.', { code: 'VALIDATION', fields });
    store.hours.save(hours);
    return { hours: store.hours.list() };
  }));

  router.get('/api/admin/booking-rules', staff, () => ({ rules: store.settings.booking() }));
  router.put('/api/admin/booking-rules', owner, mutate(async (ctx) => {
    const v = validate(await ctx.body());
    const rules = {
      enabled: v.bool('enabled'),
      slotInterval: v.int('slotInterval', { required: true, min: 5, max: 120, label: 'Time slot interval' }),
      defaultDuration: v.int('defaultDuration', { required: true, min: 5, max: 480, label: 'Default appointment length' }),
      minNoticeMinutes: v.int('minNoticeMinutes', { required: true, min: 0, max: 7 * 24 * 60, label: 'Minimum notice' }),
      maxAdvanceDays: v.int('maxAdvanceDays', { required: true, min: 1, max: 365, label: 'Booking window' }),
      cancelCutoffHours: v.int('cancelCutoffHours', { required: true, min: 0, max: 168, label: 'Cancellation cutoff' }),
    };
    v.done();
    store.settings.saveBooking(rules);
    return { rules: store.settings.booking() };
  }));

  router.get('/api/admin/blocks', staff, () => ({ blocks: store.blocks.listFrom(today()) }));
  router.post('/api/admin/blocks', staff, mutate(async (ctx) => {
    const v = validate(await ctx.body());
    const barberId = v.id('barberId');
    const dateFrom = v.date('dateFrom', { label: 'Start date' });
    const dateTo = v.date('dateTo', { required: false, label: 'End date' }) ?? dateFrom;
    const allDay = v.bool('allDay');
    const start = allDay ? null : v.time('start', { label: 'Start time' });
    const end = allDay ? null : v.time('end', { label: 'End time' });
    const reason = v.text('reason', { max: 120, label: 'Reason' });
    if (dateFrom && dateTo && dateTo < dateFrom) v.fail('dateTo', 'End date must be on or after the start date.');
    if (start && end && timeToMinutes(end) <= timeToMinutes(start)) v.fail('end', 'End time must be after the start time.');
    if (dateFrom && dateTo && diffDays(dateFrom, dateTo) > 366) v.fail('dateTo', 'Blocks can be at most one year long.');
    v.done();
    if (barberId && !store.barbers.getLive(barberId)) throw new HttpError(422, 'Barber not found.');
    const blockId = store.blocks.create({
      barberId,
      dateFrom,
      dateTo,
      allDay,
      startMin: start ? timeToMinutes(start) : null,
      endMin: end ? timeToMinutes(end) : null,
      reason,
    });
    // Let the owner know about existing bookings inside the blocked time.
    const affected = store.appointments
      .listRange({ from: dateFrom, to: dateTo, status: 'booked', barberId })
      .filter((a) => allDay || (a.startMin < timeToMinutes(end) && a.endMin > timeToMinutes(start)));
    ctx.status = 201;
    return { id: blockId, affected };
  }));
  router.delete('/api/admin/blocks/:id', staff, mutate((ctx) => {
    store.blocks.remove(id(ctx));
    return { ok: true };
  }));

  /* -------------------------------- reviews -------------------------------- */

  function readReview(body) {
    const v = validate(body);
    const data = {
      author: v.text('author', { required: true, max: 60, label: 'Reviewer name' }),
      rating: v.int('rating', { required: true, min: 1, max: 5, label: 'Rating' }),
      body: v.text('body', { required: true, max: 1200, multiline: true, label: 'Review text' }),
      reviewDate: v.date('reviewDate', { required: false, label: 'Review date' }),
      source: v.text('source', { max: 30, label: 'Source' }) || 'Google',
      isPublished: v.has('isPublished') ? v.bool('isPublished') : true,
      sortOrder: v.int('sortOrder', { min: 0, max: 100000, label: 'Sort order' }) ?? 0,
    };
    v.done();
    return data;
  }

  router.get('/api/admin/reviews', staff, () => ({ reviews: store.reviews.list() }));
  router.post('/api/admin/reviews', owner, mutate(async (ctx) => {
    ctx.status = 201;
    return { review: store.reviews.create(readReview(await ctx.body())) };
  }));
  router.patch('/api/admin/reviews/:id', owner, mutate(async (ctx) => ({
    review: store.reviews.update(id(ctx), readReview(await ctx.body())),
  })));
  router.delete('/api/admin/reviews/:id', owner, mutate((ctx) => {
    store.reviews.remove(id(ctx));
    return { ok: true };
  }));

  /* ------------------------------ business info ---------------------------- */

  router.get('/api/admin/business', staff, () => ({ business: store.settings.business() }));
  router.put('/api/admin/business', owner, mutate(async (ctx) => {
    const v = validate(await ctx.body());
    const rating = Number(v.text('googleRating', { required: true, max: 4, label: 'Google rating' }));
    if (!(rating >= 1 && rating <= 5)) v.fail('googleRating', 'Rating must be between 1 and 5.');
    const business = {
      name: v.text('name', { required: true, max: 80, label: 'Business name' }),
      phone: v.phone('phone', { required: true }),
      email: v.email('email'),
      streetAddress: v.text('streetAddress', { required: true, max: 120, label: 'Street address' }),
      city: v.text('city', { required: true, max: 60, label: 'City' }),
      region: v.text('region', { required: true, max: 30, label: 'Province' }),
      postalCode: v.text('postalCode', { required: true, max: 12, label: 'Postal code' }).toUpperCase(),
      googleRating: Math.round(rating * 10) / 10,
      googleReviewCount: v.int('googleReviewCount', { required: true, min: 0, max: 1000000, label: 'Review count' }),
      reviewsUrl: v.url('reviewsUrl', { label: 'Google reviews link' }),
      instagramUrl: v.url('instagramUrl', { label: 'Instagram link' }),
      facebookUrl: v.url('facebookUrl', { label: 'Facebook link' }),
      tiktokUrl: v.url('tiktokUrl', { label: 'TikTok link' }),
    };
    v.done();
    store.settings.saveBusiness(business);
    return { business: store.settings.business() };
  }));

  router.get('/api/admin/email-log', owner, () => ({
    provider: mailer.provider,
    canSend: mailer.canSend,
    emails: store.emailLog.recent(25),
  }));

  /* ---------------------------------- team --------------------------------- */

  router.get('/api/admin/users', owner, () => ({ users: store.users.list() }));

  router.post('/api/admin/users', owner, async (ctx) => {
    const v = validate(await ctx.body());
    const data = {
      name: v.text('name', { required: true, max: 60, label: 'Name' }),
      email: v.email('email', { required: true }),
      role: v.oneOf('role', ['owner', 'staff'], { label: 'Role' }),
      password: v.text('password', { required: true, min: MIN_PASSWORD_LENGTH, max: 200, label: 'Password' }),
    };
    v.done();
    ctx.status = 201;
    return { user: await store.users.create(data) };
  });

  router.patch('/api/admin/users/:id', owner, async (ctx) => {
    const userId = id(ctx);
    const v = validate(await ctx.body());
    const data = {
      name: v.text('name', { required: true, max: 60, label: 'Name' }),
      email: v.email('email', { required: true }),
      role: v.oneOf('role', ['owner', 'staff'], { label: 'Role' }),
    };
    const password = v.text('password', { min: MIN_PASSWORD_LENGTH, max: 200, label: 'Password' });
    v.done();
    const existing = store.users.get(userId);
    if (!existing) throw new HttpError(404, 'User not found.');
    if (existing.role === 'owner' && data.role !== 'owner' && store.users.ownerCount() <= 1) {
      throw new HttpError(409, 'There must always be at least one owner account.');
    }
    const user = store.users.update(userId, data);
    if (password) {
      await store.users.setPassword(userId, password);
      store.sessions.destroyForUser(userId, userId === ctx.user.id ? ctx.session.sessionId : '');
    }
    return { user };
  });

  router.delete('/api/admin/users/:id', owner, (ctx) => {
    const userId = id(ctx);
    if (userId === ctx.user.id) throw new HttpError(409, 'You can’t remove your own account.');
    const existing = store.users.get(userId);
    if (!existing) throw new HttpError(404, 'User not found.');
    if (existing.role === 'owner' && store.users.ownerCount() <= 1) {
      throw new HttpError(409, 'There must always be at least one owner account.');
    }
    store.users.remove(userId);
    return { ok: true };
  });
}
