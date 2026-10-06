import http from 'node:http';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createStore } from './repos/index.js';
import { createScheduler } from './lib/scheduling.js';
import { createMailer } from './lib/mailer.js';
import { createApp } from './app.js';
import { MIN_PASSWORD_LENGTH } from './lib/auth.js';

const db = openDatabase(config.dbPath);
const store = createStore(db, { sessionDays: config.sessionDays });
const scheduler = createScheduler(store, { timezone: config.timezone });
const mailer = createMailer({ config, store });

// First run on a host without shell access: create the owner from env vars.
if (store.users.count() === 0) {
  const { email, password, name } = config.bootstrapAdmin;
  if (email && password && password.length >= MIN_PASSWORD_LENGTH) {
    await store.users.create({ email: email.toLowerCase(), password, name, role: 'owner' });
    console.log(`[setup] Created owner account for ${email}. You can now remove ADMIN_PASSWORD from the environment.`);
  } else {
    console.log('[setup] No admin account yet. Create one with:  npm run create-admin');
  }
}

const app = createApp({ config, store, scheduler, mailer });
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

server.listen(config.port, config.host, () => {
  console.log(`Manhandler website running at ${config.siteUrl}  (admin: ${config.siteUrl}/admin)`);
  console.log(`[mail] provider: ${mailer.provider}${mailer.canSend ? '' : ' — confirmation emails are logged, not sent'}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
