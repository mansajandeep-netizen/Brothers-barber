# Manhandler Barbershop & Full Service Salon — Website & Booking Platform

Website, online booking and staff dashboard for **Manhandler Barbershop & Full Service Salon**, Prairie Mall, 11801 100 St #294, Grande Prairie, AB T8V 3Y2 — serving Grande Prairie since 1979.

- **Public site:** home page with hero, highlights, about, services, booking call-to-action, reviews, gallery and location sections. Walk-ins ("pull a ticket"), phone appointments and online booking are all promoted. It is mobile-first, server-rendered for SEO, and includes `BarberShop` + `HairSalon` structured data.
- **Online booking:** service → stylist (or "any available") → date → time → details → confirmation. It only offers times that are actually free, prevents double bookings, and supports email confirmations, calendar (.ics) downloads, and self-service cancellation by private link.
- **Admin dashboard (`/admin`):** overview, day timeline and week view, appointment create/edit/cancel/complete/no-show, customers, services and prices, stylists, business hours, blocked time, booking rules, reviews, business info, and team accounts with owner/staff roles.

It needs no runtime dependencies beyond Node.js. It uses Node's built-in HTTP server and SQLite (`node:sqlite`).

---

## Quick start

Requires **Node.js 22.13 or newer** (Node 24 recommended).

```bash
npm install                 # dev tools only (browser testing); the app itself has no dependencies
npm run create-admin -- --email you@example.com --name "Your Name"
npm start                   # http://localhost:3000   ·   dashboard: http://localhost:3000/admin
```

`npm run dev` restarts automatically when server files change.

On first run the database is created in `data/manhandler.db` and seeded with:

- five services split across the two sides of the business — **Barbershop:** Men’s Haircut; **Salon:** Women’s Haircut, Hair Styling, Hair Coloring and Facial Waxing — with **no prices or durations**, which the owner adds. Each service’s category (Barbershop or Salon) decides which side it appears under on the website and in booking.
- business hours of Mon–Fri 10 AM–7 PM, Sat 10 AM–6 PM, closed Sunday (taken from public listings — confirm them in the dashboard)
- two placeholder chairs named **"Stylist 1"** and **"Stylist 2"**, to rename in the dashboard

## First things to do in the dashboard

The **Overview** page shows a *Launch checklist* that tracks these:

1. **Stylists:** rename the placeholders to real names, set working days, and remove any extra chairs.
2. **Services & Prices:** add prices and booking lengths. Prices stay hidden on the site until set, and use "Show as a starting price" for "From $X" pricing. Add any services that are missing.
3. **Hours & Availability:** confirm the opening hours (saving them ticks the checklist item), slot spacing, minimum notice and booking window, then block holidays and days off.
4. **Business Info:** add the shop email for booking alerts, social links (footer icons appear only once added), and the exact Google reviews link. The Google rating and review count are optional; the rating stays hidden on the site until both are filled in.
5. **Reviews (optional):** paste a few genuine Google reviews to show them on the site.
6. **Email:** connect an email provider (see below) so customers receive confirmations.
7. **Photos:** replace the stock placeholder photos (see below).

## Email confirmations

Without configuration, emails are **logged to the server console** and listed under *Business Info → Email delivery*. Bookings still work.

To send real email, set `MAIL_FROM` plus one provider in `.env` (see `.env.example`):

| Provider | Variables |
| --- | --- |
| [Resend](https://resend.com) | `RESEND_API_KEY` |
| SMTP (Google Workspace, Gmail app password, Zoho, Outlook, Amazon SES…) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` |

Customers get a confirmation with an *Add to calendar* link and a private *Manage booking* link. They also get a cancellation notice when staff cancel with "notify" ticked. The shop gets an alert for every online booking and customer cancellation, sent to `SHOP_NOTIFY_EMAIL` or the email in Business Info.

## Photos

All photos are **royalty-free stock placeholders from Unsplash** and are **not** pictures of Manhandler. Replace them before launch.

| What | Where |
| --- | --- |
| Gallery | `content/gallery.json` + files in `public/images/gallery/`. Each entry has `src` (≈640px wide), `srcLarge` (≈1400px for the lightbox), `width`, `height`, `category` (`mens`, `womens`, `color` or `salon` — these drive the filter chips), `alt`, an optional `shape` (`feature` for a large 2×2 tile, `tall`, `wide` or `normal`; the order of entries plus shapes decides the mosaic, so keep the grid filled), and `placeholder` (set to `false` for real photos so the checklist clears). The site picks up changes without a restart. |
| Hero | Barbershop: `public/images/hero-480.webp`, `hero-800.webp`, `hero-1200.webp`. Salon: `hero-salon-480.webp`, `hero-salon-800.webp`. Both portrait 4:5. |
| Barbershop / Salon panels | `public/images/side-barbershop-640.webp` / `-1100.webp` and `side-salon-640.webp` / `-1100.webp` (landscape 3:2) |
| About | `public/images/about-main-600/900.webp` (4:5) and `about-detail-600.webp` |
| Booking banner | `public/images/cta-pole-600.webp`, `cta-pole-900.webp` (square, shown on large screens) |
| Social share image | `public/images/og-image.jpg` (1200×630) |

Use WebP at roughly 70% quality, and write honest `alt` text that describes the photo.

## Deployment

Any host that runs Node.js with a **persistent disk** for the SQLite file works, for example a small VPS, Render (with a disk), Railway (with a volume), or Fly.io (with a volume).

1. Set environment variables from `.env.example`. At minimum set `NODE_ENV=production`, `SITE_URL=https://your-domain`, `DATABASE_PATH` (on the persistent disk) and `TRUST_PROXY=true` behind a proxy.
2. Create the owner account. Either run `npm run create-admin -- --email …` on the server, or on hosts without shell access set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first start and then remove them.
3. Serve over **HTTPS**. Cookies become `Secure` automatically when `SITE_URL` starts with `https://`, and HSTS is enabled in production.
4. Back up the database regularly. `npm run backup` writes a consistent copy to `backups/` and is safe while the server runs. You can schedule it with cron or Task Scheduler.

Example Caddy reverse proxy (replace the domain with yours):

```
www.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

### Netlify

Netlify serves files only. It can't run the booking server or store bookings, so `netlify.toml` runs `npm run build:netlify` and publishes `dist/`:

- **No `BACKEND_URL` set:** you get a static preview of the full website built from the default content. Book buttons tell customers online booking is coming soon and offer the phone number, and the dashboard isn't available.
- **`BACKEND_URL` set:** set it under Netlify → Site configuration → Environment variables to the HTTPS address of the Node server running on Render, Railway, Fly.io or a VPS, then redeploy. Netlify then forwards every request to that server, so booking and `/admin` work on the Netlify address. On the Node server, set `SITE_URL` to the Netlify address and `TRUST_PROXY=true`.

After launch, add the site URL to the shop's **Google Business Profile** (website and booking link `https://your-domain/book`) and submit `https://your-domain/sitemap.xml` in Google Search Console.

## Testing

```bash
npm test          # 49 unit + API tests (scheduling, double-booking, validation, auth, CSRF, roles, email, .ics)
npm run test:e2e  # 19 browser tests in Chrome/Edge (set CHROME_PATH if not auto-detected)
```

The browser suite covers:

- the full booking flow with validation, loading states and network-error retry
- taken times being disabled, and the "someone else just booked it" case
- mobile menu, sticky CTA and back-button handling
- keyboard use and focus restoration
- reduced motion and the scroll animations
- the Google rating staying hidden until the owner adds it
- the service groups, gallery filter and lightbox
- customer cancellation and the 404 page
- the admin workflow
- no horizontal scrolling from 320px to 1920px
- link checking, SEO metadata, console errors
- **axe-core WCAG 2.1 AA** audits

## How it works

```
server/
  index.js              startup, first-owner bootstrap, graceful shutdown
  app.js                request handling, page cache, same-origin checks
  http.js               router, static files (compression, ETags, immutable caching), cookies, rate limiting, security headers
  db.js / seed-data.js  schema migrations and first-run data
  repos/                data access (services, barbers, appointments, customers, blocks, reviews, settings)
  lib/scheduling.js     availability engine and all booking writes
  lib/auth.js           scrypt password hashing, hashed session tokens
  lib/mailer.js         Resend / SMTP / console email, templates
  lib/ics.js            calendar files
  routes/               public API, admin API, pages (robots.txt, sitemap.xml, manage-booking page)
  views/                server-rendered HTML components (auto-escaping templates)
public/
  assets/css/site.css, admin.css
  assets/js/site.js, booking.js, lib.js     public site and booking modal
  assets/js/admin/                          dashboard (vanilla ES modules)
  images/
content/gallery.json
tests/                  node:test suites + tests/e2e/run.js (playwright-core)
```

Stylists are called "stylists" everywhere customers and staff see them, but the code and database still name them `barbers` (tables, API paths, `barberId`).

**Double-booking prevention.** Every booking write runs in an SQLite `BEGIN IMMEDIATE` transaction. The transaction recomputes availability (business hours, stylist working days, blocked time, existing appointments, minimum notice) before inserting. A partial unique index on `(barber, date, start)` is a second safeguard. The tests fire simultaneous requests at one slot and expect exactly one to succeed. Staff can book outside normal hours after confirming, but can never overlap another appointment.

**Times** are stored as shop-local dates and minutes (`America/Edmonton`), so the schedule always matches the wall clock in Grande Prairie, including across daylight-saving changes.

**Security:**

- scrypt password hashing
- session tokens stored only as SHA-256 hashes
- `HttpOnly`, `SameSite=Strict` cookies
- CSRF token on every admin change
- same-origin checks on all POSTs
- login and booking rate limits, plus a honeypot field
- strict Content-Security-Policy and other security headers
- input validation on every endpoint
- all output escaped
- role-based access: *owner* has everything; *staff* handles appointments, customers and blocked time

## Content notes

The site uses only the business details provided: name, Prairie Mall address, phone, year established (1979), the walk-in and phone-appointment policy, and the services offered. Opening hours come from public listings and should be confirmed by the owner. It invents no prices, durations, stylist names, ratings, testimonials, awards, history or social accounts. Those fields are editable placeholders or stay hidden until filled in.

Once added, the Google rating appears on the page but is intentionally **not** included as `aggregateRating` in structured data. Google doesn't show self-published ratings for local businesses, and marking them up can be treated as spam.

Photo credits: Unsplash contributors, used under the [Unsplash License](https://unsplash.com/license). Source links are in `content/gallery.json`.
