import { html, jsonScript, raw } from './html.js';
import { icon } from './icons.js';
import { bookLink, page } from './layout.js';
import {
  allSevenDaysOpen,
  directionsUrl,
  e164Display,
  formatDuration,
  formatPrice,
  fullAddress,
  mapEmbedUrl,
  telHref,
  weekHours,
} from './format.js';
import { CATEGORIES } from '../seed-data.js';

const GALLERY_LABELS = {
  fades: 'Fades',
  haircuts: 'Haircuts',
  beard: 'Beard Work',
  shop: 'Shop',
  grooming: 'Grooming',
};

function stars(rating, cls = '') {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return html`<span class="stars ${cls}" role="img" aria-label="${rating} out of 5 stars">
    <span class="stars__base" aria-hidden="true">${[1, 2, 3, 4, 5].map(() => icon('star'))}</span>
    <span class="stars__fill" style="width:${pct.toFixed(1)}%" aria-hidden="true">${[1, 2, 3, 4, 5].map(() => icon('star'))}</span>
  </span>`;
}

/* ------------------------------------------------------------------ */

function hero(site) {
  const b = site.business;
  return html`
<section class="hero" id="top" aria-labelledby="hero-title">
  <div class="hero__media" aria-hidden="true" data-parallax>
    <img src="/images/hero-1920.webp"
      srcset="/images/hero-800.webp 800w, /images/hero-1280.webp 1280w, /images/hero-1920.webp 1920w"
      sizes="(max-aspect-ratio: 1/1) 160vh, 100vw"
      width="1920" height="1280" alt="" fetchpriority="high" decoding="async">
  </div>
  <div class="hero__shade" aria-hidden="true"></div>
  <div class="container hero__inner">
    <p class="eyebrow hero__eyebrow" data-hero-item><span class="eyebrow__line" aria-hidden="true"></span><span class="hero__eyebrow-extra">Barber Shop · </span>${b.city}, Alberta</p>
    <h1 class="hero__title" id="hero-title">
      <span class="hero__line" data-hero-item>Sharp Cuts.</span>
      <span class="hero__line" data-hero-item>Clean Fades.</span>
      <span class="hero__line hero__line--accent" data-hero-item>Built Different.</span>
    </h1>
    <p class="hero__lead" data-hero-item>Professional barbering in ${b.city}. Walk out looking your best.</p>
    <div class="hero__actions" data-hero-item>
      ${bookLink('Book an Appointment', { cls: 'btn btn--primary btn--lg' })}
      <a class="btn btn--ghost btn--lg" href="#services"><span>View Services</span></a>
    </div>
    <ul class="hero__meta" data-hero-item>
      <li>${stars(b.googleRating, 'stars--sm')}<span><strong>${b.googleRating.toFixed(1)}</strong> on Google</span></li>
      <li data-open-status>${icon('clock')}<span>${allSevenDaysOpen(site.hours) ? 'Open 7 days a week' : 'See hours below'}</span></li>
      <li class="hero__meta-addr">${icon('pin')}<span>${b.streetAddress}</span></li>
    </ul>
  </div>
  <a class="hero__scroll" href="#rating" aria-label="Scroll to learn more"><span aria-hidden="true"></span></a>
</section>`;
}

function trust(site) {
  const b = site.business;
  return html`
<section class="trust" id="rating" aria-label="Google rating">
  <div class="container trust__inner">
    <div class="trust__rating" data-reveal>
      <p class="trust__score"><span data-count-to="${b.googleRating}" data-decimals="1">${b.googleRating.toFixed(1)}</span><span class="trust__out">/ 5</span></p>
      <div class="trust__detail">
        ${stars(b.googleRating, 'stars--lg')}
        <p><span data-count-to="${b.googleReviewCount}">${b.googleReviewCount}</span>+ Google Reviews</p>
      </div>
    </div>
    <ul class="trust__points">
      <li data-reveal style="--d:1">${icon('scissors')}<span><strong>Fades &amp; Precision Cuts</strong>Skin fades, tapers, scissor and razor work</span></li>
      <li data-reveal style="--d:2">${icon('razor')}<span><strong>Beard Work &amp; Shaves</strong>Trims, line-ups, conditioning and shaves</span></li>
      <li data-reveal style="--d:3">${icon('calendar')}<span><strong>${allSevenDaysOpen(site.hours) ? 'Open 7 Days a Week' : 'Book Online Anytime'}</strong>Book online in under a minute</span></li>
    </ul>
  </div>
</section>`;
}

function about(site) {
  const b = site.business;
  return html`
<section class="section section--light about" id="about" aria-labelledby="about-title">
  <div class="container about__grid">
    <div class="about__media" data-reveal>
      <figure class="about__main">
        <img src="/images/about-main-900.webp" srcset="/images/about-main-600.webp 600w, /images/about-main-900.webp 900w"
          sizes="(min-width: 960px) 40vw, 90vw" width="900" height="1125" loading="lazy" decoding="async"
          alt="Barber detailing a client's haircut with a fresh fade">
      </figure>
      <figure class="about__detail" data-parallax-soft>
        <img src="/images/about-detail-600.webp" width="600" height="720" loading="lazy" decoding="async"
          alt="Barber shaping a full beard with scissors">
      </figure>
      <div class="about__badge" aria-hidden="true">
        <span class="about__badge-num">${b.googleRating.toFixed(1)}</span>
        ${stars(b.googleRating, 'stars--sm')}
        <span class="about__badge-label">Google rating</span>
      </div>
    </div>
    <div class="about__copy">
      <p class="eyebrow" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>About Brothers</p>
      <h2 class="section-title" id="about-title" data-reveal>More Than Just <em>a Haircut</em></h2>
      <p class="lead" data-reveal>
        Brothers Barber Shop is ${b.city}’s spot for sharp, professional barbering — precision cuts,
        clean fades, beard work, shaves and grooming, done properly.
      </p>
      <p data-reveal>
        Good barbering is in the details: a fade that blends without a line, a neckline that stays sharp,
        a beard shaped to suit your face. Tell us what you’re after and we’ll take the time to get it right,
        whether it’s a quick shape-up or a full cut and beard trim. Kids are welcome too.
      </p>
      <ul class="about__list">
        <li data-reveal style="--d:1">${icon('check')}Precision fades &amp; custom cuts</li>
        <li data-reveal style="--d:2">${icon('check')}Beard trims, shaping &amp; shaves</li>
        <li data-reveal style="--d:3">${icon('check')}Cuts for kids &amp; adults</li>
        <li data-reveal style="--d:4">${icon('check')}Easy online booking</li>
      </ul>
      <div class="about__actions" data-reveal>
        ${bookLink('Book Your Cut', { cls: 'btn btn--dark' })}
        <a class="link-arrow" href="${telHref(b.phone)}">${icon('phone')}<span>${b.phone}</span></a>
      </div>
    </div>
  </div>
</section>`;
}

function serviceCard(s, i) {
  const price = formatPrice(s.priceCents, s.priceFrom);
  const duration = formatDuration(s.durationMin);
  return html`
<article class="service-card" data-reveal style="--d:${i % 3}">
  <div class="service-card__top">
    <span class="service-card__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
    ${price ? html`<span class="service-card__price">${price}</span>` : ''}
  </div>
  <h3 class="service-card__name">${s.name}</h3>
  <p class="service-card__desc">${s.description}</p>
  <div class="service-card__foot">
    ${duration ? html`<span class="service-card__meta">${icon('clock')}${duration}</span>` : html`<span></span>`}
    ${bookLink('Book Now', { cls: 'service-card__book', service: s.slug, ariaLabel: `Book ${s.name}` })}
  </div>
</article>`;
}

function services(site) {
  const groups = Object.entries(CATEGORIES)
    .map(([key, label]) => ({ key, label, items: site.services.filter((s) => s.category === key) }))
    .filter((g) => g.items.length);
  return html`
<section class="section services" id="services" aria-labelledby="services-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>Services</p>
        <h2 class="section-title" id="services-title" data-reveal>Haircuts, Fades <em>&amp; Beard Work</em></h2>
      </div>
      <p class="section-head__text" data-reveal>From a quick shape-up to a full cut and beard trim — pick your service and book a time that works for you.</p>
    </header>
    <div class="tabs" data-tabs>
      <div class="tabs__list" role="tablist" aria-label="Service categories" data-reveal>
        ${groups.map(
          (g, i) => html`<button class="tabs__tab" role="tab" type="button" id="tab-${g.key}" aria-controls="panel-${g.key}"
            aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}">${g.label}<span class="tabs__count">${g.items.length}</span></button>`,
        )}
        <span class="tabs__indicator" aria-hidden="true"></span>
      </div>
      ${groups.map(
        (g, gi) => html`<div class="tabs__panel" role="tabpanel" id="panel-${g.key}" aria-labelledby="tab-${g.key}" tabindex="0" ${gi === 0 ? '' : raw('hidden')}>
          <h3 class="visually-hidden">${g.label}</h3>
          <div class="services__grid">${g.items.map((s, i) => serviceCard(s, i))}</div>
        </div>`,
      )}
    </div>
    <div class="services__note" data-reveal>
      <p>${icon('info')}<span>Not sure what to book? Choose <strong>Custom Cut</strong> and talk it through with your barber.</span></p>
      ${bookLink('Book Now', { cls: 'btn btn--primary' })}
    </div>
  </div>
</section>`;
}

function ctaBand(site) {
  return html`
<section class="cta-band" id="book-cta" aria-labelledby="cta-title">
  <div class="cta-band__media" aria-hidden="true">
    <img src="/images/cta-1920.webp" srcset="/images/cta-960.webp 960w, /images/cta-1920.webp 1920w" sizes="100vw"
      width="1920" height="1275" alt="" loading="lazy" decoding="async" data-parallax-soft>
  </div>
  <div class="cta-band__shade" aria-hidden="true"></div>
  <p class="cta-band__word" aria-hidden="true">Brothers</p>
  <div class="container cta-band__inner">
    <p class="eyebrow eyebrow--center" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>Online Booking<span class="eyebrow__line" aria-hidden="true"></span></p>
    <h2 class="cta-band__title" id="cta-title" data-reveal>Ready for a <em>Fresh Cut?</em></h2>
    <p class="cta-band__text" data-reveal>Choose your service, pick a time, and you’re booked.</p>
    <ol class="cta-band__steps" data-reveal>
      <li><span>01</span>Choose a service</li>
      <li><span>02</span>Pick a time</li>
      <li><span>03</span>You’re booked</li>
    </ol>
    <div class="cta-band__actions" data-reveal>
      ${bookLink('Book Your Appointment', { cls: 'btn btn--primary btn--lg' })}
      <a class="link-arrow link-arrow--light" href="${telHref(site.business.phone)}">${icon('phone')}<span>or call ${site.business.phone}</span></a>
    </div>
  </div>
</section>`;
}

function reviews(site) {
  const b = site.business;
  const list = site.reviews;
  return html`
<section class="section section--light reviews" id="reviews" aria-labelledby="reviews-title">
  <div class="container">
    <header class="section-head section-head--center">
      <p class="eyebrow eyebrow--center" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>Reviews<span class="eyebrow__line" aria-hidden="true"></span></p>
      <h2 class="section-title" id="reviews-title" data-reveal>Rated <em>${b.googleRating.toFixed(1)}</em> on Google</h2>
      <p class="section-head__text" data-reveal>Real ratings from real clients on our Google Business Profile.</p>
    </header>
    <div class="reviews__summary" data-reveal>
      <div class="reviews__score">
        <span class="reviews__num" data-count-to="${b.googleRating}" data-decimals="1">${b.googleRating.toFixed(1)}</span>
        <div>
          ${stars(b.googleRating, 'stars--lg')}
          <p>Based on <strong>${b.googleReviewCount}</strong> Google reviews</p>
        </div>
      </div>
      <div class="reviews__bar" aria-hidden="true"><span style="width:${((b.googleRating / 5) * 100).toFixed(1)}%"></span></div>
      <div class="reviews__actions">
        <a class="btn btn--dark" href="${b.reviewsUrl}" target="_blank" rel="noopener">
          <span>Read Our Reviews</span>${icon('arrow-up-right', 'btn__arrow')}<span class="visually-hidden"> (opens Google in a new tab)</span>
        </a>
      </div>
    </div>
    ${list.length
      ? html`<ul class="reviews__grid" data-reviews>
          ${list.map(
            (r, i) => html`<li class="review-card" data-reveal style="--d:${i % 3}">
              ${icon('quote', 'review-card__quote')}
              ${stars(r.rating, 'stars--sm')}
              <blockquote class="review-card__body"><p>${r.body}</p></blockquote>
              <p class="review-card__author"><strong>${r.author}</strong><span>${r.source}${r.reviewDate ? html` · ${formatReviewDate(r.reviewDate)}` : ''}</span></p>
            </li>`,
          )}
        </ul>`
      : ''}
  </div>
</section>`;
}

function formatReviewDate(d) {
  const [y, m] = d.split('-').map(Number);
  if (!y || !m) return d;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Tile shape from the photo's proportions; `feature: true` makes a 2×2 hero tile. */
function galleryShape(g) {
  if (g.feature) return ' is-feature';
  if (g.height > g.width * 1.15) return ' is-tall';
  if (g.width > g.height * 1.2) return ' is-wide';
  return '';
}

function gallery(site) {
  const items = site.gallery;
  const cats = [...new Set(items.map((g) => g.category))].filter((c) => GALLERY_LABELS[c]);
  return html`
<section class="section gallery" id="gallery" aria-labelledby="gallery-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>Gallery</p>
        <h2 class="section-title" id="gallery-title" data-reveal>The Work <em>Speaks</em></h2>
      </div>
      <p class="section-head__text" data-reveal>Fades, cuts, beard work and the shop itself. Tap any photo for a closer look.</p>
    </header>
    <div class="gallery__filters" role="group" aria-label="Filter gallery by category" data-reveal>
      <button type="button" class="chip is-active" aria-pressed="true" data-filter="all">All</button>
      ${cats.map((c) => html`<button type="button" class="chip" aria-pressed="false" data-filter="${c}">${GALLERY_LABELS[c]}</button>`)}
    </div>
    <ul class="gallery__grid" data-gallery>
      ${items.map(
        (g, i) => html`<li class="gallery__item${galleryShape(g)}" data-category="${g.category}" data-reveal style="--d:${i % 4}">
          <button type="button" class="gallery__btn" data-lightbox="${i}" data-large="${g.srcLarge}" data-caption="${g.alt}" aria-label="View larger photo: ${g.alt}">
            <img src="${g.src}" srcset="${g.src} 640w, ${g.srcLarge} 1400w" sizes="${g.feature || g.width > g.height * 1.2 ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 900px) 25vw, 50vw'}"
              width="${g.width}" height="${g.height}" alt="${g.alt}" loading="lazy" decoding="async">
            <span class="gallery__tag">${GALLERY_LABELS[g.category] ?? g.category}</span>
            <span class="gallery__zoom" aria-hidden="true">${icon('expand')}</span>
          </button>
        </li>`,
      )}
    </ul>
    <p class="gallery__empty" data-gallery-empty hidden>No photos in this category yet.</p>
  </div>
  <dialog class="lightbox" data-lightbox-dialog aria-label="Photo viewer">
    <figure class="lightbox__figure">
      <img class="lightbox__img" alt="" data-lightbox-img>
      <figcaption class="lightbox__caption" data-lightbox-caption></figcaption>
    </figure>
    <button type="button" class="icon-btn lightbox__close" data-lightbox-close aria-label="Close photo viewer">${icon('close')}</button>
    <button type="button" class="icon-btn lightbox__prev" data-lightbox-prev aria-label="Previous photo">${icon('chevron-left')}</button>
    <button type="button" class="icon-btn lightbox__next" data-lightbox-next aria-label="Next photo">${icon('chevron-right')}</button>
  </dialog>
</section>`;
}

function location(site) {
  const b = site.business;
  return html`
<section class="section location" id="location" aria-labelledby="location-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal><span class="eyebrow__line" aria-hidden="true"></span>Visit Us</p>
        <h2 class="section-title" id="location-title" data-reveal>Find <em>the Shop</em></h2>
      </div>
      <p class="section-head__text" data-reveal>${b.streetAddress}, ${b.city}. Book ahead online, or call us with any questions.</p>
    </header>
    <div class="location__grid">
      <div class="location__card" data-reveal>
        <div class="location__row">
          <span class="location__icon">${icon('pin')}</span>
          <div>
            <h3 class="location__label">Address</h3>
            <address class="location__value">${b.name}<br>${b.streetAddress}<br>${b.city}, ${b.region}<br>${b.postalCode}</address>
          </div>
        </div>
        <div class="location__row">
          <span class="location__icon">${icon('phone')}</span>
          <div>
            <h3 class="location__label">Phone</h3>
            <a class="location__value location__phone" href="${telHref(b.phone)}">${b.phone}</a>
          </div>
        </div>
        <div class="location__row location__row--hours">
          <span class="location__icon">${icon('clock')}</span>
          <div class="location__hours-wrap">
            <h3 class="location__label">Business Hours <span class="status-pill" data-open-pill hidden></span></h3>
            <table class="hours">
              <caption class="visually-hidden">Opening hours</caption>
              <tbody>
                ${weekHours(site.hours).map(
                  (d) => html`<tr data-day="${d.day}"><th scope="row">${d.name}</th><td>${d.value}</td></tr>`,
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div class="location__actions">
          <a class="btn btn--outline" href="${directionsUrl(b)}" target="_blank" rel="noopener">${icon('navigation')}<span>Get Directions</span></a>
          <a class="btn btn--outline" href="${telHref(b.phone)}">${icon('phone')}<span>Call Now</span></a>
          ${bookLink('Book Appointment', { cls: 'btn btn--primary location__book' })}
        </div>
      </div>
      <div class="location__map" data-reveal style="--d:1">
        <iframe title="Map showing ${b.name} at ${fullAddress(b)}" src="${mapEmbedUrl(b)}" loading="lazy"
          referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        <a class="location__map-link" href="${directionsUrl(b)}" target="_blank" rel="noopener">${icon('external')}<span>Open in Google Maps</span></a>
      </div>
    </div>
  </div>
</section>`;
}

/* ------------------------------------------------------------------ */

function structuredData(site) {
  const b = site.business;
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const specs = [];
  for (const d of weekHours(site.hours).filter((h) => h.isOpen)) {
    const existing = specs.find((s) => s.opens === d.opens && s.closes === d.closes);
    if (existing) existing.dayOfWeek.push(DAY[d.day]);
    else specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: [DAY[d.day]], opens: d.opens, closes: d.closes });
  }
  const offers = Object.entries(CATEGORIES).map(([key, label]) => ({
    '@type': 'OfferCatalog',
    name: label,
    itemListElement: site.services
      .filter((s) => s.category === key)
      .map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.name, description: s.description },
        ...(s.priceCents != null && !s.priceFrom ? { price: (s.priceCents / 100).toFixed(2), priceCurrency: 'CAD' } : {}),
      })),
  }));
  const sameAs = [b.instagramUrl, b.facebookUrl, b.tiktokUrl].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'BarberShop',
    '@id': `${site.siteUrl}/#barbershop`,
    name: b.name,
    url: `${site.siteUrl}/`,
    telephone: e164Display(b.phone),
    ...(b.email ? { email: b.email } : {}),
    image: [`${site.siteUrl}/images/og-image.jpg`],
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.streetAddress,
      addressLocality: b.city,
      addressRegion: b.region,
      postalCode: b.postalCode,
      addressCountry: b.country,
    },
    areaServed: { '@type': 'City', name: `${b.city}, ${b.region}` },
    hasMap: directionsUrl(b),
    openingHoursSpecification: specs,
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Barber services', itemListElement: offers },
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site.siteUrl}/book`, inLanguage: 'en-CA' },
      result: { '@type': 'Reservation', name: 'Barber appointment' },
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** Data the booking widget and open/closed badge need, embedded to avoid an extra request. */
function clientData(site) {
  return {
    timezone: site.timezone,
    phone: site.business.phone,
    hours: site.hours,
    booking: {
      enabled: site.booking.enabled,
      maxAdvanceDays: site.booking.maxAdvanceDays,
      preview: !!site.preview,
    },
    services: site.services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      category: s.category,
      description: s.description,
      duration: formatDuration(s.durationMin),
      price: formatPrice(s.priceCents, s.priceFrom),
    })),
    categories: CATEGORIES,
    barbers: site.barbers.map((b) => ({ id: b.id, name: b.name, title: b.title })),
  };
}

export function renderHome(site) {
  const b = site.business;
  return page(site, {
    home: true,
    path: '/',
    title: `${b.name} | Barber in ${b.city}, AB — Fades, Haircuts & Beard Trims`,
    description: `${b.name} in ${b.city}, AB: professional men’s haircuts, skin fades, beard trims, shaves and kids’ cuts. Rated ${b.googleRating.toFixed(1)}★ from ${b.googleReviewCount}+ Google reviews. Book online in seconds.`,
    preloadImage: raw(
      '<link rel="preload" as="image" href="/images/hero-1920.webp" imagesrcset="/images/hero-800.webp 800w, /images/hero-1280.webp 1280w, /images/hero-1920.webp 1920w" imagesizes="(max-aspect-ratio: 1/1) 160vh, 100vw" fetchpriority="high">',
    ),
    head: html`<script type="application/ld+json">${jsonScript(structuredData(site))}</script>
<script type="application/json" id="site-data">${jsonScript(clientData(site))}</script>`,
    content: html`${hero(site)}${trust(site)}${about(site)}${services(site)}${ctaBand(site)}${reviews(site)}${gallery(site)}${location(site)}`,
  });
}

export { clientData };
