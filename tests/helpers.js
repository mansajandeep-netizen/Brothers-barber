import http from 'node:http';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createStore } from '../server/repos/index.js';
import { createScheduler } from '../server/lib/scheduling.js';
import { createMailer } from '../server/lib/mailer.js';
import { createApp } from '../server/app.js';
import { ROOT_DIR } from '../server/config.js';

export const silentLogger = { info() {}, warn() {}, error() {}, log() {} };

export function testConfig(overrides = {}) {
  return {
    port: 0,
    isProd: false,
    siteUrl: 'http://127.0.0.1',
    secureCookies: false,
    trustProxy: false,
    publicDir: path.join(ROOT_DIR, 'public'),
    contentDir: path.join(ROOT_DIR, 'content'),
    timezone: 'America/Edmonton',
    sessionDays: 7,
    bookingRateLimit: 1000,
    mail: { provider: 'console', from: '', replyTo: '', shopNotify: '', resendApiKey: '', smtp: {} },
    ...overrides,
  };
}

/** In-memory store + scheduler with an injectable clock. */
export function createTestScheduler(nowIso) {
  const db = openDatabase(':memory:');
  const store = createStore(db);
  let now = new Date(nowIso);
  const scheduler = createScheduler(store, { timezone: 'America/Edmonton', now: () => now });
  return { db, store, scheduler, setNow: (iso) => (now = new Date(iso)) };
}

/** Full HTTP app on a random port, backed by an in-memory database. */
export async function startTestServer() {
  const db = openDatabase(':memory:');
  const store = createStore(db);
  const config = testConfig();
  const scheduler = createScheduler(store, { timezone: config.timezone });
  const mailer = createMailer({ config, store, logger: silentLogger });
  const app = createApp({ config, store, scheduler, mailer, logger: silentLogger });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.siteUrl = base;
  return {
    base,
    store,
    scheduler,
    async close() {
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}

/** Next date (YYYY-MM-DD, shop time) at least `minDays` ahead that falls on the given weekday. */
export function upcomingDate(store, minDays = 2, weekday = null) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + minDays);
  while (weekday != null && d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
