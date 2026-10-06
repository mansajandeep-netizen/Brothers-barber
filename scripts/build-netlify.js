#!/usr/bin/env node
/**
 * Builds the `dist/` folder that Netlify publishes (see netlify.toml).
 *
 * Netlify only serves files — it can't run the Node booking server or keep its
 * database. So this script has two modes:
 *
 *  • BACKEND_URL set (e.g. https://manhandler.onrender.com):
 *      Netlify forwards every request to the Node server, so the full site,
 *      booking and dashboard all work on the Netlify address.
 *
 *  • BACKEND_URL not set:
 *      A static preview of the website. Pages are pre-rendered from the default
 *      content; "Book" buttons ask customers to call until a server is connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT_DIR } from '../server/config.js';
import { createStaticHandler, CSP } from '../server/http.js';
import { DEFAULT_BUSINESS, DEFAULT_BOOKING, DEFAULT_HOURS, SEED_SERVICES, SEED_BARBERS } from '../server/seed-data.js';
import { renderHome } from '../server/views/home.js';
import { renderNotFound } from '../server/views/pages.js';
import { zonedNow } from '../server/lib/time.js';

const OUT = path.join(ROOT_DIR, 'dist');
const backend = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

if (backend) {
  if (!/^https:\/\//.test(backend)) {
    console.error(`BACKEND_URL must start with https:// (got "${backend}")`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT, '_redirects'), `/*  ${backend}/:splat  200!\n`);
  console.log(`Netlify will forward all requests to ${backend}`);
  process.exit(0);
}

// Netlify sets URL to the site's main address during builds.
const siteUrl = (process.env.SITE_URL || process.env.URL || 'http://localhost:8888').replace(/\/+$/, '');

fs.cpSync(config.publicDir, OUT, { recursive: true });

// Built straight from the default content (no database needed, so it runs on any Node version).
const statics = createStaticHandler(config.publicDir);
const site = {
  business: DEFAULT_BUSINESS,
  hours: DEFAULT_HOURS.map((h) => ({ day: h.day, isOpen: h.isOpen, open: h.open, close: h.close })),
  services: SEED_SERVICES.map((s, i) => ({ ...s, id: i + 1, durationMin: null, priceCents: null, priceFrom: false, isActive: true, sortOrder: (i + 1) * 10 })),
  barbers: SEED_BARBERS.map((name, i) => ({ id: i + 1, name, title: '', workDays: [0, 1, 2, 3, 4, 5, 6], isActive: true })),
  reviews: [],
  booking: { ...DEFAULT_BOOKING, enabled: false },
  gallery: JSON.parse(fs.readFileSync(path.join(config.contentDir, 'gallery.json'), 'utf8')),
  siteUrl,
  timezone: config.timezone,
  year: zonedNow(config.timezone).date.slice(0, 4),
  asset: (p) => `${p}?v=${statics.version(p)}`,
  preview: true,
};

fs.writeFileSync(path.join(OUT, 'index.html'), String(renderHome(site)));
fs.writeFileSync(path.join(OUT, '404.html'), String(renderNotFound(site)));
fs.writeFileSync(
  path.join(OUT, 'robots.txt'),
  ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n'),
);
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`,
);
// /book is a shareable link that opens the booking panel on the home page.
fs.writeFileSync(path.join(OUT, '_redirects'), '/book  /index.html  200\n');
fs.writeFileSync(
  path.join(OUT, '_headers'),
  `/*
  Content-Security-Policy: ${CSP}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()

/images/*
  Cache-Control: public, max-age=86400
`,
);
console.log(`Static preview built in dist/ for ${siteUrl}`);
