import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load a local .env file when present (Node 20.12+). Real environment variables win.
try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch {
  /* no .env file — fine */
}

const env = process.env;
const port = Number(env.PORT || 3000);
const siteUrl = (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

function mailProvider() {
  if (env.MAIL_PROVIDER) return env.MAIL_PROVIDER;
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_HOST) return 'smtp';
  return 'console';
}

export const config = {
  port,
  host: env.HOST || '0.0.0.0',
  isProd: env.NODE_ENV === 'production',
  siteUrl,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : siteUrl.startsWith('https://'),
  trustProxy: env.TRUST_PROXY === 'true',
  dbPath: env.DATABASE_PATH || path.join(ROOT_DIR, 'data', 'manhandler.db'),
  publicDir: path.join(ROOT_DIR, 'public'),
  contentDir: path.join(ROOT_DIR, 'content'),
  // Grande Prairie, AB observes Mountain Time.
  timezone: env.SHOP_TIMEZONE || 'America/Edmonton',
  sessionDays: Number(env.SESSION_DAYS || 7),
  // Online bookings allowed per IP address per hour (spam protection).
  bookingRateLimit: Number(env.BOOKING_RATE_LIMIT || 20),
  mail: {
    provider: mailProvider(),
    from: env.MAIL_FROM || '',
    replyTo: env.MAIL_REPLY_TO || '',
    shopNotify: env.SHOP_NOTIFY_EMAIL || '',
    resendApiKey: env.RESEND_API_KEY || '',
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT || 465),
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : true,
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
    },
  },
  bootstrapAdmin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Owner',
  },
};
