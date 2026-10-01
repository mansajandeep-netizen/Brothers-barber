import { html } from './html.js';
import { icon, iconSprite } from './icons.js';
import { fullAddress, groupedHours, telHref } from './format.js';

const NAV = [
  ['Home', 'top'],
  ['About', 'about'],
  ['Services', 'services'],
  ['Gallery', 'gallery'],
  ['Reviews', 'reviews'],
  ['Location', 'location'],
];

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Serif:ital@0;1&display=swap';

export function logo({ href = '/', tag = 'a' } = {}) {
  const inner = html`<span class="logo__mark" aria-hidden="true">
      <svg viewBox="0 0 40 40"><rect x="1" y="1" width="38" height="38" rx="3"></rect><path d="M14 11v18M14 11h7.2a4.4 4.4 0 0 1 0 8.8H14m0 0h8.4a4.6 4.6 0 0 1 0 9.2H14"></path></svg>
    </span>
    <span class="logo__text"><span class="logo__name">Brothers</span><span class="logo__sub">Barber Shop</span></span>`;
  return tag === 'a'
    ? html`<a class="logo" href="${href}" aria-label="Brothers Barber Shop — home">${inner}</a>`
    : html`<span class="logo">${inner}</span>`;
}

/** Link that opens the booking modal (falls back to /book without JS). */
export const bookLink = (label, { cls = 'btn btn--primary', service = '', arrow = true, ariaLabel = '' } = {}) =>
  html`<a class="${cls}" href="/book${service ? `?service=${encodeURIComponent(service)}` : ''}" data-book${
    service ? html` data-service="${service}"` : ''
  }${ariaLabel ? html` aria-label="${ariaLabel}"` : ''}><span>${label}</span>${arrow ? icon('arrow-right', 'btn__arrow') : ''}</a>`;

function header(site, { home }) {
  const href = (id) => (home ? `#${id}` : `/#${id}`);
  const b = site.business;
  return html`
<header class="site-header${home ? '' : ' is-solid'}" data-header>
  <div class="container site-header__inner">
    ${logo({ href: home ? '#top' : '/' })}
    <nav class="site-nav" aria-label="Main">
      <ul class="site-nav__list">
        ${NAV.map(([label, id]) => html`<li><a class="site-nav__link" href="${href(id)}" data-nav="${id}">${label}</a></li>`)}
      </ul>
    </nav>
    <div class="site-header__actions">
      <a class="site-header__phone" href="${telHref(b.phone)}">${icon('phone')}<span>${b.phone}</span></a>
      ${bookLink('Book Now', { cls: 'btn btn--primary btn--sm site-header__book', arrow: false })}
      <a class="icon-btn site-header__call" href="${telHref(b.phone)}" aria-label="Call ${b.name} at ${b.phone}">${icon('phone')}</a>
      <button class="icon-btn nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu" data-nav-toggle>
        <span class="nav-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
    </div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
  <nav class="mobile-menu__nav" aria-label="Mobile">
    <ul>
      ${NAV.map(
        ([label, id], i) =>
          html`<li style="--i:${i}"><a href="${href(id)}" data-mobile-link><span class="mobile-menu__num">0${i + 1}</span>${label}</a></li>`,
      )}
    </ul>
  </nav>
  <div class="mobile-menu__foot">
    ${bookLink('Book an Appointment', { cls: 'btn btn--primary btn--block btn--lg' })}
    <a class="btn btn--ghost btn--block btn--lg" href="${telHref(b.phone)}">${icon('phone')}<span>Call ${b.phone}</span></a>
    <p class="mobile-menu__addr">${fullAddress(b)}</p>
  </div>
</div>`;
}

function socialLinks(b) {
  const links = [
    ['instagram', 'Instagram', b.instagramUrl],
    ['facebook', 'Facebook', b.facebookUrl],
    ['tiktok', 'TikTok', b.tiktokUrl],
  ].filter(([, , url]) => url);
  if (!links.length) return '';
  return html`<ul class="socials">
    ${links.map(
      ([key, label, url]) =>
        html`<li><a class="icon-btn" href="${url}" target="_blank" rel="noopener" aria-label="${b.name} on ${label}">${icon(key)}</a></li>`,
    )}
  </ul>`;
}

function footer(site, { home }) {
  const b = site.business;
  const href = (id) => (home ? `#${id}` : `/#${id}`);
  return html`
<footer class="site-footer">
  <div class="container site-footer__top">
    <div class="site-footer__brand">
      ${logo({ href: home ? '#top' : '/' })}
      <p>Professional haircuts, fades, beard work and shaves in Grande Prairie, Alberta.</p>
      ${bookLink('Book Appointment', { cls: 'btn btn--primary' })}
      ${socialLinks(b)}
    </div>
    <div class="site-footer__col">
      <h2 class="site-footer__title">Visit</h2>
      <address>
        ${b.name}<br>${b.streetAddress}<br>${b.city}, ${b.region} ${b.postalCode}
      </address>
      <a class="site-footer__phone" href="${telHref(b.phone)}">${icon('phone')}${b.phone}</a>
    </div>
    <div class="site-footer__col">
      <h2 class="site-footer__title">Business Hours</h2>
      <dl class="site-footer__hours">
        ${groupedHours(site.hours).map((g) => html`<div><dt>${g.label}</dt><dd>${g.value}</dd></div>`)}
      </dl>
    </div>
    <div class="site-footer__col">
      <h2 class="site-footer__title">Quick Links</h2>
      <ul class="site-footer__links">
        ${NAV.map(([label, id]) => html`<li><a href="${href(id)}">${label}</a></li>`)}
        <li><a href="/book" data-book>Book Appointment</a></li>
      </ul>
    </div>
  </div>
  <div class="container site-footer__bottom">
    <p>© ${site.year} ${b.name}. All rights reserved.</p>
    ${site.preview ? '' : html`<p><a href="/admin" rel="nofollow">Staff login</a></p>`}
  </div>
</footer>`;
}

function mobileCta(site) {
  const b = site.business;
  return html`<div class="mobile-cta" data-mobile-cta>
  <a class="mobile-cta__call" href="${telHref(b.phone)}" aria-label="Call ${b.phone}">${icon('phone')}<span>Call</span></a>
  ${bookLink('Book Now', { cls: 'btn btn--primary mobile-cta__book' })}
</div>`;
}

function bookingDialog() {
  return html`<dialog class="booking" id="booking" aria-labelledby="booking-title" data-booking>
  <div class="booking__panel">
    <header class="booking__header">
      <button class="icon-btn booking__back" type="button" data-booking-back aria-label="Go back" hidden>${icon('arrow-left')}</button>
      <div class="booking__heading">
        <p class="booking__step" data-booking-step>Step 1 of 5</p>
        <h2 class="booking__title" id="booking-title" tabindex="-1" data-booking-title>Choose a service</h2>
      </div>
      <button class="icon-btn booking__close" type="button" data-booking-close aria-label="Close booking">${icon('close')}</button>
      <div class="booking__progress" aria-hidden="true"><span data-booking-progress></span></div>
    </header>
    <div class="booking__body" data-booking-body></div>
    <footer class="booking__footer" data-booking-footer>
      <div class="booking__summary" data-booking-summary aria-live="polite"></div>
      <button class="btn btn--primary booking__next" type="button" data-booking-next disabled><span>Continue</span>${icon('arrow-right', 'btn__arrow')}</button>
    </footer>
    <p class="visually-hidden" aria-live="assertive" data-booking-announcer></p>
  </div>
</dialog>`;
}

/**
 * Full HTML document.
 * @param {object} o
 */
export function page(site, o) {
  const {
    title,
    description,
    path = '/',
    robots = 'index, follow',
    home = false,
    bodyClass = '',
    head = '',
    content,
    booking = true,
    preloadImage = null,
  } = o;
  const canonical = `${site.siteUrl}${path}`;
  const ogImage = `${site.siteUrl}/images/og-image.jpg`;
  return html`<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#0c0c0d">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site.business.name}">
<meta property="og:locale" content="en_CA">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${site.business.name} — barber shop in ${site.business.city}, ${site.business.region}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
${preloadImage}
<link rel="stylesheet" href="${site.asset('/assets/css/site.css')}">
<script src="${site.asset('/assets/js/boot.js')}"></script>
<script type="module" src="${site.asset('/assets/js/site.js')}"></script>
${head}
</head>
<body class="${bodyClass}">
${iconSprite}
<a class="skip-link" href="#main">Skip to main content</a>
${header(site, { home })}
<main id="main" tabindex="-1">
${content}
</main>
${footer(site, { home })}
${mobileCta(site)}
${booking ? bookingDialog() : ''}
<noscript><div class="noscript">Online booking needs JavaScript. Call <a href="${telHref(site.business.phone)}">${site.business.phone}</a> to book.</div></noscript>
</body>
</html>`;
}
