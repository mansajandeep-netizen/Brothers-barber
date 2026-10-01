/**
 * End-to-end browser tests. Starts the real server on a throwaway database and
 * drives it with Chrome/Edge via playwright-core.
 *
 *   npm run test:e2e            (set CHROME_PATH if Chrome/Edge isn't auto-detected)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 3555);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'e2e-owner@example.com', password: 'e2e-password-123' };
const TZ = 'America/Edmonton';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  \u2714 ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  \u2716 ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function shopDate(offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Collects console errors and failed same-origin requests for a page. */
function watch(page) {
  const problems = [];
  page.on('console', (m) => {
    const src = m.location()?.url || '';
    if (m.type() === 'error' && (src.startsWith(BASE) || !src)) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (r.url().startsWith(BASE) && !/calendar\.ics/.test(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function apiBook(body) {
  const res = await fetch(`${BASE}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

/** Opens the booking modal and walks to the time step for a service/barber/date. */
async function bookingToTimes(page, { service, barber, date }) {
  await page.locator('.service-card', { hasText: service }).locator('[data-book]').click();
  await page.locator('[data-booking-title]', { hasText: 'Choose a barber' }).waitFor();
  await page.locator('.option', { hasText: barber }).click();
  await page.locator('.cal__day[data-date]').first().waitFor();
  for (let i = 0; i < 3 && !(await page.locator(`.cal__day[data-date="${date}"]`).count()); i++) {
    await page.locator('[data-month="1"]').click();
    await page.locator('.cal__day[data-date]').first().waitFor();
  }
  await page.locator(`.cal__day[data-date="${date}"]`).click();
  await page.locator('.slot[data-time]').first().waitFor();
}

async function runAxe(page, label, { include = null } = {}) {
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules/axe-core/axe.min.js') });
  const result = await page.evaluate(async (ctx) => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(ctx || document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      iframes: false,
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  }, include);
  const serious = result.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  assert(!serious.length, `${label}: ${serious.map((v) => `${v.id} (${v.impact}) – ${v.help} – ${v.nodes.join(' | ')}`).join('\n')}`);
  return result;
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-e2e-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SITE_URL: BASE,
      DATABASE_PATH: path.join(dir, 'e2e.db'),
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_NAME: 'E2E Owner',
      BOOKING_RATE_LIMIT: '1000',
      MAIL_PROVIDER: 'console',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return { child, dir, log: () => log };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`Server did not start:\n${log}`);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome/Edge found. Set CHROME_PATH to run the browser tests.');
    process.exit(1);
  }
  const server = await startServer();
  const browser = await chromium.launch({ executablePath });
  const desktop = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
  // The site's CSP (correctly) blocks injected scripts; axe needs it bypassed in the test browser only.
  const auditable = () => browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const mobile = () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  console.log(`\nE2E against ${BASE} using ${path.basename(executablePath)}\n`);

  try {
    await check('home page loads with no console errors or failed requests', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      const problems = watch(page);
      const res = await page.goto(BASE, { waitUntil: 'networkidle' });
      assert(res.status() === 200, `status ${res.status()}`);
      await scrollThrough(page);
      await page.waitForTimeout(500);
      assert(!problems.length, problems.join('\n'));
      await ctx.close();
    });

    await check('SEO: title, description, canonical, Open Graph, one h1, BarberShop schema', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      const meta = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name=description]')?.content,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        ogImage: document.querySelector('meta[property="og:image"]')?.content,
        h1: document.querySelectorAll('h1').length,
        ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent),
        imgsWithoutAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
        lang: document.documentElement.lang,
      }));
      assert(/Grande Prairie/.test(meta.title), 'title mentions Grande Prairie');
      assert(meta.description.length >= 110 && meta.description.length <= 200, `description length ${meta.description.length}`);
      assert(meta.canonical === `${BASE}/`, `canonical ${meta.canonical}`);
      assert(meta.ogTitle && meta.ogImage, 'Open Graph tags');
      assert(meta.h1 === 1, `${meta.h1} h1 elements`);
      assert(meta.ld['@type'] === 'BarberShop' && meta.ld.address.addressLocality === 'Grande Prairie', 'schema');
      assert(meta.imgsWithoutAlt === 0, `${meta.imgsWithoutAlt} images missing alt`);
      assert(meta.lang === 'en-CA', 'lang');
      const og = await fetch(meta.ogImage.replace(/^https?:\/\/[^/]+/, BASE));
      assert(og.ok, 'og image reachable');
      await ctx.close();
    });

    await check('no horizontal scrolling from 320px to 1920px (page and booking modal)', async () => {
      for (const width of [320, 375, 414, 768, 1024, 1440, 1920]) {
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: width < 700 });
        const page = await ctx.newPage();
        await page.goto(BASE, { waitUntil: 'load' });
        await scrollThrough(page);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 0, `page overflows by ${over}px at ${width}px`);
        await page.locator('.hero [data-book]').first().click();
        await page.locator('.option').first().waitFor();
        const modalOver = await page.evaluate(() => {
          const body = document.querySelector('[data-booking-body]');
          return body.scrollWidth - body.clientWidth;
        });
        assert(modalOver <= 0, `booking modal overflows by ${modalOver}px at ${width}px`);
        await ctx.close();
      }
    });

    await check('all links resolve (anchors, internal pages, external links open safely)', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })));
      const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
      const checked = new Set();
      for (const l of links) {
        if (l.href.startsWith('#')) {
          assert(ids.includes(l.href.slice(1)), `missing anchor ${l.href}`);
        } else if (l.href.startsWith('/') && !checked.has(l.href)) {
          checked.add(l.href);
          const res = await fetch(`${BASE}${l.href}`);
          assert(res.ok, `${l.href} → ${res.status}`);
        } else if (/^https?:/.test(l.href)) {
          assert(l.target === '_blank' && /noopener/.test(l.rel), `external link without target/rel: ${l.href}`);
        } else if (l.href.startsWith('tel:')) {
          assert(l.href === 'tel:+17805050013', `unexpected phone link ${l.href}`);
        }
      }
      await ctx.close();
    });

    const dateA = shopDate(3);
    await check('booking flow from a service card, with validation and confirmation', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      const problems = watch(page);
      await page.goto(BASE);
      const trigger = page.locator('.service-card', { hasText: 'Fade Cut' }).locator('[data-book]');
      await bookingToTimes(page, { service: 'Fade Cut', barber: 'Barber 1', date: dateA });
      assert((await page.locator('[data-booking-summary]').textContent()).includes('Fade Cut'), 'service carried into summary');
      const slot = page.locator('.slot[data-time]:not([disabled])').first();
      const time = await slot.getAttribute('data-time');
      await slot.click();
      await page.locator('[data-booking-title]', { hasText: 'Your details' }).waitFor();

      await page.locator('[data-booking-next]').click();
      const errors = await page.locator('.field__error:not([hidden])').count();
      assert(errors === 3, `expected 3 field errors, got ${errors}`);
      assert((await page.evaluate(() => document.activeElement?.id)) === 'bk-name', 'focus moves to first invalid field');

      await page.fill('#bk-name', 'Taylor Brooks');
      await page.fill('#bk-phone', '(780) 555-0142');
      await page.fill('#bk-email', 'not-an-email');
      await page.locator('[data-booking-next]').click();
      assert((await page.locator('#bk-email-err').textContent()).includes('valid email'), 'email validation');
      await page.fill('#bk-email', 'taylor@example.com');
      await page.fill('#bk-notes', 'Low skin fade please');
      await page.locator('[data-booking-next]').click();
      await page.locator('.confirm__title', { hasText: 'Appointment Confirmed' }).waitFor();
      const text = await page.locator('.confirm').textContent();
      assert(/BB-[A-Z0-9]{6}/.test(text) && text.includes('Barber 1') && text.includes('Taylor Brooks'), 'confirmation details');
      const ics = await page.locator('.confirm a[download]').getAttribute('href');
      assert((await fetch(`${BASE}${ics}`)).ok, 'calendar file downloadable');

      await page.locator('[data-done]').click();
      await page.waitForFunction(() => !document.querySelector('[data-booking]').open);
      assert(await trigger.evaluate((el) => el === document.activeElement), 'focus returns to the Book Now that opened it');

      // The same slot is now unavailable for that barber.
      const slots = await (await fetch(`${BASE}/api/availability/slots?serviceId=2&barberId=1&date=${dateA}`)).json();
      assert(slots.slots.find((s) => s.time === time).available === false, 'slot is taken after booking');
      assert(!problems.length, problems.join('\n'));
      await ctx.close();
    });

    await check('taken times are shown disabled and cannot be selected', async () => {
      const dateB = shopDate(5);
      const booked = await apiBook({ serviceId: 1, barberId: 1, date: dateB, time: '10:00', name: 'Pat Example', phone: '7805550901', email: 'pat@example.com' });
      assert(booked.status === 201, `seed booking ${booked.status}`);
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      await bookingToTimes(page, { service: 'Custom Cut', barber: 'Barber 1', date: dateB });
      const taken = page.locator('.slot[data-time="10:00"]');
      assert(await taken.isDisabled(), '10:00 is disabled');
      assert((await taken.getAttribute('aria-label')).includes('unavailable'), 'announced as unavailable');
      await ctx.close();
    });

    await check('if someone else takes the slot first, the customer is sent back to pick another time', async () => {
      const dateC = shopDate(6);
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      await bookingToTimes(page, { service: 'Custom Cut', barber: 'Barber 2', date: dateC });
      const slot = page.locator('.slot[data-time="15:00"]');
      await slot.click();
      await page.locator('#bk-name').waitFor();
      // Another customer books 3 PM with Barber 2 in the meantime.
      const other = await apiBook({ serviceId: 1, barberId: 2, date: dateC, time: '15:00', name: 'Fast Finger', phone: '7805550902', email: 'fast@example.com' });
      assert(other.status === 201, 'competing booking');
      await page.fill('#bk-name', 'Slow Poke');
      await page.fill('#bk-phone', '7805550903');
      await page.fill('#bk-email', 'slow@example.com');
      await page.locator('[data-booking-next]').click();
      await page.locator('.notice--error', { hasText: 'just booked' }).waitFor();
      assert((await page.locator('[data-booking-title]').textContent()) === 'Pick a time', 'back on the time step');
      await page.locator('.slot[data-time="15:00"]').waitFor();
      assert(await page.locator('.slot[data-time="15:00"]').isDisabled(), '3 PM now disabled');
      await ctx.close();
    });

    await check('mobile: menu, click-to-call, sticky Book Now, full-screen booking, back button closes it', async () => {
      const ctx = await mobile();
      const page = await ctx.newPage();
      const problems = watch(page);
      await page.goto(BASE, { waitUntil: 'load' });
      const toggle = page.locator('[data-nav-toggle]');
      await toggle.click();
      assert((await toggle.getAttribute('aria-expanded')) === 'true', 'menu expanded');
      await page.locator('[data-mobile-menu] a', { hasText: 'Services' }).click();
      await page.waitForTimeout(500);
      assert((await toggle.getAttribute('aria-expanded')) === 'false', 'menu closes after navigation');
      assert(await page.locator('.site-header__call').isVisible(), 'header call button visible');
      assert((await page.locator('.site-header__call').getAttribute('href')) === 'tel:+17805050013', 'click-to-call');

      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(700);
      assert(await page.locator('[data-mobile-cta]').evaluate((el) => el.classList.contains('is-visible')), 'sticky CTA visible');
      const box = await page.locator('.mobile-cta__book').boundingBox();
      assert(box.height >= 48, `touch target ${box.height}px`);

      await page.locator('.mobile-cta__book').click();
      await page.locator('.option').first().waitFor();
      const panel = await page.locator('.booking__panel').boundingBox();
      assert(Math.round(panel.width) === 390, `panel width ${panel.width}`);
      await page.goBack();
      await page.waitForFunction(() => !document.querySelector('[data-booking]').open);
      assert(!problems.length, problems.join('\n'));
      await ctx.close();
    });

    await check('keyboard: skip link, booking via keyboard, Escape closes and restores focus', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.keyboard.press('Tab');
      assert((await page.evaluate(() => document.activeElement.className)) === 'skip-link', 'skip link is first');
      await page.keyboard.press('Enter');
      assert((await page.evaluate(() => document.activeElement.id)) === 'main', 'skip link moves focus to main');

      const hero = page.locator('.hero [data-book]');
      await hero.focus();
      await page.keyboard.press('Enter');
      await page.locator('.option input').first().waitFor({ state: 'attached' });
      await page.locator('.option input').first().focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      assert((await page.locator('[data-booking-title]').textContent()) === 'Choose a service', 'keyboard selection does not auto-advance');
      assert(!(await page.locator('[data-booking-next]').isDisabled()), 'Continue enabled after selection');
      await page.keyboard.press('ArrowDown');
      assert((await page.locator('.option.is-selected').count()) === 1, 'arrow keys move the selection');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-booking]').open);
      assert(await hero.evaluate((el) => el === document.activeElement), 'focus restored to trigger');
      await ctx.close();
    });

    await check('reduced motion: all content visible without animation', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(BASE);
      const hidden = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((el) => getComputedStyle(el).opacity !== '1').length);
      assert(hidden === 0, `${hidden} elements still hidden`);
      const counter = await page.locator('.trust__score [data-count-to]').textContent();
      assert(counter === '4.8', `rating shows ${counter}`);
      await ctx.close();
    });

    await check('animations: hero entrance, scroll reveal and rating counter run', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      const reveal = page.locator('#about [data-reveal]').first();
      assert((await reveal.evaluate((el) => getComputedStyle(el).opacity)) === '0', 'below-the-fold content starts hidden');
      await page.locator('#about').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1300);
      assert((await reveal.evaluate((el) => getComputedStyle(el).opacity)) === '1', 'content revealed on scroll');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2000);
      assert((await page.locator('.trust__score [data-count-to]').textContent()) === '4.8', 'counter finishes at 4.8');
      await ctx.close();
    });

    await check('services tabs and gallery filter + lightbox', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.locator('#tab-beard-grooming').click();
      assert(await page.locator('#panel-beard-grooming').isVisible(), 'beard panel visible');
      assert(!(await page.locator('#panel-haircuts').isVisible()), 'haircuts hidden');
      await page.keyboard.press('ArrowLeft');
      assert(await page.locator('#panel-haircuts').isVisible(), 'arrow keys switch tabs');

      await page.locator('[data-filter="beard"]').click();
      const visible = await page.locator('.gallery__item:not([hidden])').count();
      assert(visible === 3, `${visible} beard photos shown`);
      await page.locator('.gallery__item:not([hidden]) .gallery__btn').first().click();
      const img = page.locator('[data-lightbox-img]');
      await img.waitFor();
      const first = await img.getAttribute('src');
      await page.keyboard.press('ArrowRight');
      assert((await img.getAttribute('src')) !== first, 'next photo');
      await page.keyboard.press('Escape');
      assert(!(await page.locator('[data-lightbox-dialog]').evaluate((d) => d.open)), 'lightbox closed');
      await ctx.close();
    });

    await check('customer can view and cancel from the manage link', async () => {
      const dateD = shopDate(7);
      const booked = await apiBook({ serviceId: 1, barberId: 2, date: dateD, time: '11:00', name: 'Casey Cancel', phone: '7805550904', email: 'casey@example.com' });
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(booked.body.appointment.manageUrl);
      await page.locator('[data-cancel-appointment]').click();
      await page.locator('[data-yes]').click();
      await page.locator('.status-badge', { hasText: 'Cancelled' }).waitFor();
      await ctx.close();
    });

    await check('404 page', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      const res = await page.goto(`${BASE}/definitely-not-here`);
      assert(res.status() === 404, `status ${res.status()}`);
      assert(await page.locator('a[href="/"]', { hasText: 'Back to Home' }).isVisible(), 'home link');
      await ctx.close();
    });

    await check('accessibility (axe, WCAG 2.1 AA): no serious or critical issues', async () => {
      const ctx = await auditable();
      const page = await ctx.newPage();
      await page.goto(BASE);
      await scrollThrough(page);
      await page.waitForTimeout(1200);
      await runAxe(page, 'home');
      await page.locator('.hero [data-book]').click();
      await page.locator('.option').first().waitFor();
      await runAxe(page, 'booking: service step', { include: '[data-booking]' });
      await page.locator('.option').first().click();
      await page.locator('.option', { hasText: 'Any available' }).click();
      await page.locator('.cal__day[data-date]:not([disabled])').first().waitFor();
      await runAxe(page, 'booking: calendar', { include: '[data-booking]' });
      await page.locator('.cal__day[data-date]:not([disabled])').first().click();
      await page.locator('.slot[data-time]').first().waitFor();
      await runAxe(page, 'booking: times', { include: '[data-booking]' });
      await page.goto(`${BASE}/missing-page`);
      await runAxe(page, '404');
      await page.goto(`${BASE}/admin`);
      await page.locator('input[name=email]').waitFor();
      await runAxe(page, 'admin login');
      await ctx.close();
    });

    await check('admin: sign in, add an appointment from the dashboard, complete it', async () => {
      const ctx = await auditable();
      const page = await ctx.newPage();
      const problems = watch(page);
      await page.goto(`${BASE}/admin`);
      await page.fill('input[name=email]', ADMIN.email);
      await page.fill('input[name=password]', 'wrong-password-here');
      await page.click('button[type=submit]');
      await page.locator('.alert--danger', { hasText: 'don’t match' }).waitFor();
      await page.fill('input[name=password]', ADMIN.password);
      await page.click('button[type=submit]');
      await page.locator('.stats').waitFor();
      await runAxe(page, 'admin overview');

      const dateE = shopDate(2);
      await page.locator('.topbar .btn--primary', { hasText: 'New appointment' }).click();
      const modalEl = page.locator('dialog.modal[open]');
      await modalEl.locator('select[name=barberId]').selectOption({ label: 'Barber 2' });
      await modalEl.locator('input[name=date]').fill(dateE);
      await modalEl.locator('input[name=date]').dispatchEvent('change');
      await modalEl.locator('.time-chip:not([disabled])').first().waitFor();
      await modalEl.locator('.time-chip:not([disabled])', { hasText: '2 PM' }).click();
      await modalEl.locator('input[name=customerName]').fill('Morgan Walk-in');
      await modalEl.locator('input[name=customerPhone]').fill('780 555 0905');
      await modalEl.locator('.modal__foot .btn--primary').click();
      await page.locator('.toast', { hasText: 'Appointment booked' }).waitFor();

      await page.evaluate((d) => (location.hash = `#/appointments?view=day&date=${d}`), dateE);
      const block = page.locator('.timeline__appt', { hasText: 'Morgan Walk-in' });
      await block.waitFor();
      await block.click();
      await page.locator('dialog.modal[open] .btn--ok', { hasText: 'Mark completed' }).click();
      await page.locator('.toast', { hasText: 'Marked as completed' }).waitFor();
      await page.locator('.timeline__appt.is-completed', { hasText: 'Morgan Walk-in' }).waitFor();

      // The admin booking blocks that time online.
      const slots = await (await fetch(`${BASE}/api/availability/slots?serviceId=1&barberId=2&date=${dateE}`)).json();
      assert(slots.slots.find((s) => s.time === '14:00').available === false, 'online slot blocked by admin booking');
      assert(!problems.length, problems.join('\n'));
      await ctx.close();
    });

    await check('admin: prices and hours edited in the dashboard appear on the website', async () => {
      const ctx = await desktop();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/admin`);
      await page.fill('input[name=email]', ADMIN.email);
      await page.fill('input[name=password]', ADMIN.password);
      await page.click('button[type=submit]');
      await page.locator('.stats').waitFor();
      await page.evaluate(() => (location.hash = '#/services'));
      await page.locator('tr', { hasText: 'Beard Trim' }).locator('button', { hasText: 'Edit' }).click();
      const m = page.locator('dialog.modal[open]');
      await m.locator('input[name=price]').fill('25');
      await m.locator('input[name=durationMin]').fill('20');
      await m.locator('.modal__foot .btn--primary').click();
      await page.locator('.toast', { hasText: 'Service saved' }).waitFor();

      const site = await (await fetch(BASE)).text();
      assert(/Beard Trim<\/h3>[\s\S]{0,400}?/.test(site) && site.includes('$25') && site.includes('20 min'), 'price and duration on the site');
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.child.kill();
    try {
      fs.rmSync(server.dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold the file briefly */
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
