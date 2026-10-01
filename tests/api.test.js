import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, upcomingDate, json } from './helpers.js';

let srv;
before(async () => {
  srv = await startTestServer();
  await srv.store.users.create({ email: 'owner@example.com', name: 'Owner', password: 'owner-password-1', role: 'owner' });
  await srv.store.users.create({ email: 'staff@example.com', name: 'Staff', password: 'staff-password-1', role: 'staff' });
});
after(() => srv.close());

const url = (p) => `${srv.base}${p}`;
const postJson = (p, body, headers = {}) =>
  fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const booking = (overrides = {}) => ({
  serviceId: 2,
  barberId: 1,
  date: upcomingDate(srv.store, 3),
  time: '10:00',
  name: 'Jordan Smith',
  phone: '780-555-0199',
  email: 'jordan@example.com',
  notes: '',
  ...overrides,
});

async function login(email, password) {
  const res = await postJson('/api/admin/login', { email, password });
  const body = await json(res);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, body, cookie, csrf: body.csrf };
}

describe('public pages', () => {
  test('home page renders with SEO metadata and structured data', async () => {
    const res = await fetch(url('/'));
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Brothers Barber Shop \| Barber in Grande Prairie, AB/);
    assert.match(html, /<meta name="description" content="[^"]*Grande Prairie/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
    assert.match(html, /property="og:image"/);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld['@type'], 'BarberShop');
    assert.equal(ld.telephone, '+1-780-505-0013');
    assert.equal(ld.address.postalCode, 'T8V 4Z8');
    assert.equal(ld.openingHoursSpecification.length, 2);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1');
  });

  test('every service is listed, with no invented prices', async () => {
    const html = await (await fetch(url('/'))).text();
    for (const name of ['Hair Coloring', 'Beard Conditioning', 'Beard Dyeing', 'Beard Maintenance', 'Beard Trim', 'Buzz Cut', 'Curly Hair', 'Custom Cut', 'Fade Cut', 'Hair Shape Up', 'Head Shave', 'Kids’ Cuts', 'Long Haircut', 'Razor Cut', 'Scissor Cut', 'Shave']) {
      assert.ok(html.includes(name.replace('’', "'")) || html.includes(name.replace('’', '&#39;')) || html.includes(name), `missing ${name}`);
    }
    assert.ok(!/service-card__price/.test(html), 'no prices until the owner adds them');
  });

  test('prices added in the admin appear on the site', async () => {
    const s = srv.store.services.get(2);
    srv.store.services.update(2, { ...s, priceCents: 3500, durationMin: 45 });
    const html = await (await fetch(url('/'))).text();
    assert.match(html, /service-card__price">\$35</);
    assert.match(html, /45 min/);
    srv.store.services.update(2, { ...s });
  });

  test('unknown pages return a styled 404', async () => {
    const res = await fetch(url('/no-such-page'), { headers: { Accept: 'text/html' } });
    assert.equal(res.status, 404);
    assert.match(await res.text(), /too close a shave/);
  });

  test('security headers are set', async () => {
    const res = await fetch(url('/'));
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  test('robots.txt and sitemap.xml', async () => {
    const robots = await (await fetch(url('/robots.txt'))).text();
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Sitemap: .*\/sitemap\.xml/);
    const sitemap = await (await fetch(url('/sitemap.xml'))).text();
    assert.match(sitemap, /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/);
  });

  test('static assets are served compressed, with path traversal blocked', async () => {
    const res = await fetch(url('/assets/css/site.css?v=test'), { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /immutable/);
    const traversal = await fetch(url('/assets/..%2f..%2fpackage.json'));
    assert.equal(traversal.status, 404);
  });
});

describe('public booking API', () => {
  test('options expose services and barbers', async () => {
    const data = await json(await fetch(url('/api/booking/options')));
    assert.equal(data.services.length, 16);
    assert.equal(data.barbers.length, 2);
    assert.equal(data.services[0].price, '');
  });

  test('invalid submissions return field errors', async () => {
    const res = await postJson('/api/bookings', booking({ name: '', phone: '123', email: 'nope', time: '25:00' }));
    assert.equal(res.status, 422);
    const body = await json(res);
    assert.deepEqual(Object.keys(body.fields).sort(), ['email', 'name', 'phone', 'time']);
  });

  test('a booking succeeds once and the slot is then refused', async () => {
    const data = booking({ time: '11:00' });
    const ok = await postJson('/api/bookings', data);
    assert.equal(ok.status, 201);
    const body = await json(ok);
    assert.match(body.appointment.reference, /^BB-[A-Z0-9]{6}$/);
    assert.equal(body.appointment.barberName, 'Barber 1');
    assert.equal(body.emailQueued, false);

    const again = await postJson('/api/bookings', { ...data, name: 'Someone Else', phone: '7805550111' });
    assert.equal(again.status, 409);
    assert.equal((await json(again)).code, 'SLOT_TAKEN');

    const slots = await json(await fetch(url(`/api/availability/slots?serviceId=2&barberId=1&date=${data.date}`)));
    assert.equal(slots.slots.find((s) => s.time === '11:00').available, false);
  });

  test('simultaneous requests for one slot produce exactly one booking', async () => {
    const date = upcomingDate(srv.store, 4);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) => postJson('/api/bookings', booking({ date, time: '14:00', phone: `78055502${10 + i}`, name: `Racer ${i}` }))),
    );
    const statuses = attempts.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, 7);
  });

  test('bot honeypot submissions are rejected', async () => {
    const res = await postJson('/api/bookings', booking({ time: '12:00', website: 'http://spam.example' }));
    assert.equal(res.status, 400);
  });

  test('cross-site POSTs are blocked', async () => {
    const res = await postJson('/api/bookings', booking({ time: '12:30' }), { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
  });

  test('manage page, calendar file and self-cancellation', async () => {
    const res = await postJson('/api/bookings', booking({ date: upcomingDate(srv.store, 6), time: '16:00', phone: '7805550300' }));
    const { appointment } = await json(res);
    const token = appointment.manageUrl.split('/').pop();

    const page = await fetch(url(`/appointment/${token}`));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /You’re booked in/);
    assert.match(html, /noindex/);

    const ics = await fetch(url(appointment.calendarUrl));
    assert.equal(ics.headers.get('content-type'), 'text/calendar; charset=utf-8');
    assert.match(await ics.text(), /BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z/);

    const cancel = await postJson(`/api/bookings/${token}/cancel`, {});
    assert.equal(cancel.status, 200);
    assert.equal((await json(cancel)).appointment.status, 'cancelled');

    assert.equal((await fetch(url('/appointment/not-a-real-token-1234567890'))).status, 404);
  });

  test('confirmation emails are recorded', async () => {
    const log = srv.store.emailLog.recent(50);
    assert.ok(log.some((e) => e.to_addr === 'jordan@example.com' && /You’re booked/.test(e.subject)));
  });
});

describe('admin API', () => {
  test('requires a session', async () => {
    assert.equal((await fetch(url('/api/admin/overview'))).status, 401);
    const me = await json(await fetch(url('/api/admin/me')));
    assert.equal(me.user, null);
  });

  test('rejects wrong passwords without revealing which part was wrong', async () => {
    const a = await login('owner@example.com', 'wrong-password');
    const b = await login('nobody@example.com', 'wrong-password');
    assert.equal(a.res.status, 401);
    assert.equal(b.res.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  test('owner can sign in; session cookie is HttpOnly and SameSite=Strict', async () => {
    const { res, cookie } = await login('owner@example.com', 'owner-password-1');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
    assert.match(res.headers.get('set-cookie'), /SameSite=Strict/);
    const overview = await json(await fetch(url('/api/admin/overview'), { headers: { Cookie: cookie } }));
    assert.ok(overview.stats.total >= 1);
    assert.ok(Array.isArray(overview.checklist));
  });

  test('changes need the CSRF token', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    const body = JSON.stringify({ enabled: true, slotInterval: 30, defaultDuration: 30, minNoticeMinutes: 60, maxAdvanceDays: 30, cancelCutoffHours: 2 });
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const noToken = await fetch(url('/api/admin/booking-rules'), { method: 'PUT', headers, body });
    assert.equal(noToken.status, 403);
    const withToken = await fetch(url('/api/admin/booking-rules'), { method: 'PUT', headers: { ...headers, 'X-CSRF-Token': csrf }, body });
    assert.equal(withToken.status, 200);
  });

  test('owner manages services, prices and barbers', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const svc = await fetch(url('/api/admin/services/1'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Custom Cut', category: 'haircuts', description: 'Tailored cut.', price: '40', durationMin: 45, isActive: true, sortOrder: 10 }),
    });
    const { service } = await json(svc);
    assert.equal(service.priceCents, 4000);
    assert.equal(service.durationMin, 45);

    const barber = await fetch(url('/api/admin/barbers/2'), { method: 'PATCH', headers, body: JSON.stringify({ name: 'Alex', title: 'Barber', workDays: [1, 2, 3, 4, 5], isActive: true, sortOrder: 20 }) });
    assert.equal((await json(barber)).barber.name, 'Alex');

    const bad = await fetch(url('/api/admin/services/1'), { method: 'PATCH', headers, body: JSON.stringify({ name: '', category: 'nope', price: 'abc' }) });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys((await json(bad)).fields).sort(), ['category', 'name', 'price']);
  });

  test('admin bookings: overlap refused, outside-hours needs override', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const date = upcomingDate(srv.store, 8);
    const base = { serviceId: 1, barberId: 1, date, customerName: 'Walk In', customerPhone: '7805550444', customerEmail: '', notes: '' };
    const first = await fetch(url('/api/admin/appointments'), { method: 'POST', headers, body: JSON.stringify({ ...base, time: '10:00' }) });
    assert.equal(first.status, 201);
    const clash = await fetch(url('/api/admin/appointments'), { method: 'POST', headers, body: JSON.stringify({ ...base, time: '10:15', override: true }) });
    assert.equal(clash.status, 409);
    const late = await fetch(url('/api/admin/appointments'), { method: 'POST', headers, body: JSON.stringify({ ...base, time: '20:00' }) });
    assert.equal((await json(late)).code, 'OUTSIDE_AVAILABILITY');
    const forced = await fetch(url('/api/admin/appointments'), { method: 'POST', headers, body: JSON.stringify({ ...base, time: '20:00', override: true }) });
    assert.equal(forced.status, 201);
    const { appointment } = await json(forced);
    const done = await fetch(url(`/api/admin/appointments/${appointment.id}/status`), { method: 'POST', headers, body: JSON.stringify({ status: 'completed' }) });
    assert.equal((await json(done)).appointment.status, 'completed');
  });

  test('staff cannot change owner-only settings', async () => {
    const { cookie, csrf } = await login('staff@example.com', 'staff-password-1');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const res = await fetch(url('/api/admin/hours'), { method: 'PUT', headers, body: JSON.stringify({ hours: [] }) });
    assert.equal(res.status, 403);
    const users = await fetch(url('/api/admin/users'), { headers });
    assert.equal(users.status, 403);
    const appts = await fetch(url('/api/admin/appointments'), { headers });
    assert.equal(appts.status, 200);
  });

  test('blocking time reports affected bookings and hides the slots', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const date = upcomingDate(srv.store, 9);
    await postJson('/api/bookings', booking({ date, time: '13:00', barberId: 1, serviceId: 3, phone: '7805550555' }));
    const res = await fetch(url('/api/admin/blocks'), { method: 'POST', headers, body: JSON.stringify({ barberId: null, dateFrom: date, dateTo: date, allDay: false, start: '12:00', end: '14:00', reason: 'Training' }) });
    assert.equal(res.status, 201);
    assert.equal((await json(res)).affected.length, 1);
    const slots = await json(await fetch(url(`/api/availability/slots?serviceId=3&date=${date}`)));
    assert.ok(slots.slots.filter((s) => s.time >= '12:00' && s.time < '14:00').every((s) => !s.available));
  });

  test('business info edits flow to the public site', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const current = (await json(await fetch(url('/api/admin/business'), { headers }))).business;
    const res = await fetch(url('/api/admin/business'), { method: 'PUT', headers, body: JSON.stringify({ ...current, instagramUrl: 'https://instagram.com/example' }) });
    assert.equal(res.status, 200);
    const html = await (await fetch(url('/'))).text();
    assert.match(html, /on Instagram/);
    await fetch(url('/api/admin/business'), { method: 'PUT', headers, body: JSON.stringify({ ...current }) });
  });

  test('logout ends the session', async () => {
    const { cookie, csrf } = await login('owner@example.com', 'owner-password-1');
    await fetch(url('/api/admin/logout'), { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf } });
    assert.equal((await fetch(url('/api/admin/overview'), { headers: { Cookie: cookie } })).status, 401);
  });
});
