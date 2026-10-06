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
  mens: 'Men’s cuts',
  womens: 'Women’s cuts & styling',
  color: 'Color',
  salon: 'The salon',
};

function stars(rating, cls = '') {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return html`<span class="stars ${cls}" role="img" aria-label="${rating} out of 5 stars">
    <span class="stars__base" aria-hidden="true">${[1, 2, 3, 4, 5].map(() => icon('star'))}</span>
    <span class="stars__fill" style="width:${pct.toFixed(1)}%" aria-hidden="true">${[1, 2, 3, 4, 5].map(() => icon('star'))}</span>
  </span>`;
}

/* ------------------------------------------------------------------ */

const hasRating = (b) => b.googleRating != null && b.googleReviewCount != null;

/** "Monday to Saturday" for a contiguous run of open days, otherwise "6 days a week". */
function openDaysLabel(hours) {
  const week = weekHours(hours);
  const open = week.filter((d) => d.isOpen);
  if (open.length === 7) return 'Open every day';
  if (!open.length) return 'Call for hours';
  const first = week.findIndex((d) => d.isOpen);
  const last = week.length - 1 - [...week].reverse().findIndex((d) => d.isOpen);
  const contiguous = week.slice(first, last + 1).every((d) => d.isOpen);
  return contiguous ? `${week[first].name} to ${week[last].name}` : `${open.length} days a week`;
}

const serviceIcon = (s) =>
  ({ 'hair-styling': 'comb', 'hair-coloring': 'droplet', 'facial-waxing': 'sparkles' })[s.slug] ??
  (/cut|trim|fade|shave/i.test(s.name) ? 'scissors' : 'sparkles');

/** Copy and photos for the two sides of the business (keys match the service categories). */
const SIDES = {
  barbershop: {
    title: 'The Barbershop',
    short: 'Barbershop',
    tagline: 'Men’s cuts &amp; styling',
    text: 'Classic and modern men’s cuts with traditional and trendy styling. Walk in, pull a ticket and take a seat.',
    points: ['Classic &amp; modern cuts', 'Traditional &amp; trendy styling', 'Walk-ins welcome'],
    hero: { src: 'hero', sizes: [480, 800, 1200], alt: 'Barber styling a client’s haircut' },
    alt: 'Barber detailing a high fade with a trimmer',
  },
  salon: {
    title: 'The Salon',
    short: 'Salon',
    tagline: 'Cuts, color &amp; waxing',
    text: 'Women’s cuts and restyles, styling for every occasion, color and facial waxing, all with high-quality professional products.',
    points: ['Women’s cuts &amp; restyles', 'Color &amp; facial waxing', 'Professional products'],
    hero: { src: 'hero-salon', sizes: [480, 800], alt: 'Stylist cutting a client’s long hair' },
    alt: 'Bright salon stations with round mirrors',
  },
};

function hero(site) {
  const b = site.business;
  return html`
<section class="hero" id="top" aria-labelledby="hero-title">
  <div class="hero__glow" aria-hidden="true"></div>
  <div class="container hero__grid">
    <div class="hero__copy">
      <p class="hero__badge" data-hero-item>${
        hasRating(b)
          ? html`${stars(b.googleRating, 'stars--sm')}<span><strong>${b.googleRating.toFixed(1)}</strong> from ${b.googleReviewCount}+ Google reviews</span>`
          : html`${icon('pin')}<span><strong>Inside ${b.building || b.city}</strong>${b.foundedYear ? html` · since ${b.foundedYear}` : ''}</span>`
      }</p>
      <h1 class="hero__title" id="hero-title">
        <span class="hero__line" data-hero-item>Walk in<span class="hero__dot">.</span></span>
        <span class="hero__line" data-hero-item>Sit down<span class="hero__dot">.</span></span>
        <span class="hero__line hero__line--accent" data-hero-item>Look sharp<span class="hero__dot">.</span></span>
      </h1>
      <p class="hero__lead" data-hero-item>Men’s and women’s haircuts, styling, color and facial waxing — no appointment needed.${
        b.foundedYear ? ` ${b.city}’s barbershop and full service salon since ${b.foundedYear}.` : ''
      }</p>
      <div class="hero__actions" data-hero-item>
        ${bookLink('Book an appointment', { cls: 'btn btn--primary btn--lg' })}
        <a class="btn btn--soft btn--lg" href="${telHref(b.phone)}">${icon('phone')}<span>Call ${b.phone}</span></a>
      </div>
      <ul class="hero__meta" data-hero-item>
        <li data-open-status>${icon('clock')}<span>${openDaysLabel(site.hours)}</span></li>
        <li>${icon('check')}<span>Walk-ins welcome — pull a ticket</span></li>
      </ul>
    </div>
    <nav class="hero__sides" aria-label="Our two sides" data-hero-item>
      ${Object.entries(SIDES).map(([key, side], i) => {
        const { src, sizes, alt } = side.hero;
        const largest = sizes.at(-1);
        return html`<a class="hero-side hero-side--${key}" href="#${key}">
          <img src="/images/${src}-800.webp" srcset="${sizes.map((w) => `/images/${src}-${w}.webp ${w}w`).join(', ')}"
            sizes="(min-width: 960px) 270px, 46vw" width="${largest}" height="${largest * 1.25}" ${raw(i === 0 ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async" alt="${alt}">
          <span class="hero-side__num" aria-hidden="true">0${i + 1}</span>
          <span class="hero-side__go" aria-hidden="true">${icon('arrow-right')}</span>
          <span class="hero-side__title">${side.short}</span>
          <span class="hero-side__sub">${raw(side.tagline)}</span>
        </a>`;
      })}
    </nav>
  </div>
</section>`;
}

/** Scrolling strip of what the shop offers. Decorative — the same facts appear in the sections below. */
function ticker(site) {
  const b = site.business;
  const items = [
    'Walk-ins welcome',
    ...site.services.map((s) => s.name),
    ...(b.foundedYear ? [`Since ${b.foundedYear}`] : []),
    ...(b.building ? [`Inside ${b.building}`] : []),
  ];
  const list = html`<ul class="ticker__list">${items.map((t) => html`<li>${t}</li>`)}</ul>`;
  return html`
<div class="ticker" aria-hidden="true">
  <div class="ticker__track">${list}${list}</div>
</div>`;
}

function trust(site) {
  const b = site.business;
  const items = [];
  if (hasRating(b)) {
    items.push(html`<p class="trust__score"><span data-count-to="${b.googleRating}" data-decimals="1">${b.googleRating.toFixed(1)}</span><span class="trust__out">/5</span></p>
      <p class="trust__label">${stars(b.googleRating, 'stars--sm')} ${b.googleReviewCount}+ Google reviews</p>`);
  }
  if (b.foundedYear) {
    items.push(html`<p class="trust__big"><small class="trust__pre">Since</small>${b.foundedYear}</p>
      <p class="trust__label">A ${b.city} original</p>`);
  }
  items.push(html`<p class="trust__big">Walk-ins</p>
    <p class="trust__label">No appointment needed — pull a ticket</p>`);
  items.push(html`<p class="trust__big"><span data-count-to="${site.services.length}">${site.services.length}</span></p>
    <p class="trust__label">Services for men and women</p>`);
  const openDays = site.hours.filter((h) => h.isOpen).length;
  items.push(html`<p class="trust__big">${openDays} day${openDays === 1 ? '' : 's'}</p>
    <p class="trust__label">Open ${openDaysLabel(site.hours).replace(/^Open /, '')}</p>`);
  return html`
<section class="trust" id="highlights" aria-label="Highlights">
  <div class="container">
    <ul class="trust__grid">
      ${items.slice(0, 4).map((content, i) => html`<li class="trust__item" data-reveal style="--d:${i}">${content}</li>`)}
    </ul>
  </div>
</section>`;
}

function about(site) {
  const b = site.business;
  return html`
<section class="section about" id="about" aria-labelledby="about-title">
  <div class="container about__grid">
    <div class="about__media" data-reveal>
      <figure class="about__main">
        <img src="/images/about-main-900.webp" srcset="/images/about-main-600.webp 600w, /images/about-main-900.webp 900w"
          sizes="(min-width: 960px) 40vw, 90vw" width="900" height="1125" loading="lazy" decoding="async"
          alt="Barber detailing a client's haircut">
      </figure>
      <figure class="about__detail" data-parallax-soft>
        <img src="/images/about-detail-600.webp" width="600" height="720" loading="lazy" decoding="async"
          alt="Stylist curling a client’s long hair">
      </figure>
      ${
        hasRating(b)
          ? html`<div class="about__badge" aria-hidden="true">
              <span class="about__badge-num">${b.googleRating.toFixed(1)}</span>
              <span>${stars(b.googleRating, 'stars--sm')}<span class="about__badge-label">Google rating</span></span>
            </div>`
          : ''
      }
    </div>
    <div class="about__copy">
      <p class="eyebrow" data-reveal>About us</p>
      <h2 class="section-title" id="about-title" data-reveal>A ${b.city} <em>original</em></h2>
      <p class="lead" data-reveal>
        ${b.name} has been looking after ${b.city}${b.foundedYear ? ` since ${b.foundedYear}` : ''}${b.building ? ` — right inside ${b.building}` : ''}.
      </p>
      <p data-reveal>
        Everything happens under one roof: men’s and women’s haircuts, traditional and trendy styling, color and facial
        waxing, done with high-quality professional hair and grooming products. Walk in anytime — no appointment
        needed, just pull a ticket — or call ahead to book a time that suits you.
      </p>
      <ul class="about__list">
        <li data-reveal style="--d:1">${icon('check')}Men’s &amp; women’s haircuts</li>
        <li data-reveal style="--d:2">${icon('check')}Traditional &amp; trendy styling</li>
        <li data-reveal style="--d:3">${icon('check')}Hair coloring &amp; facial waxing</li>
        <li data-reveal style="--d:4">${icon('check')}Walk-ins welcome — pull a ticket</li>
      </ul>
      <div class="about__actions" data-reveal>
        ${bookLink('Book an appointment', { cls: 'btn btn--primary' })}
        <a class="link-arrow" href="${telHref(b.phone)}">${icon('phone')}<span>${b.phone}</span></a>
      </div>
    </div>
  </div>
</section>`;
}

function serviceCard(s) {
  const price = formatPrice(s.priceCents, s.priceFrom);
  const duration = formatDuration(s.durationMin);
  return html`
<article class="service-card">
  <div class="service-card__top">
    <span class="service-card__icon" aria-hidden="true">${icon(serviceIcon(s))}</span>
    ${price ? html`<span class="service-card__price">${price}</span>` : ''}
  </div>
  <h4 class="service-card__name">${s.name}</h4>
  <p class="service-card__desc">${s.description}</p>
  <div class="service-card__foot">
    ${duration ? html`<span class="service-card__meta">${icon('clock')}${duration}</span>` : html`<span></span>`}
    ${bookLink('Book', { cls: 'service-card__book', service: s.slug, ariaLabel: `Book ${s.name}` })}
  </div>
</article>`;
}

function side(key, items, i) {
  const s = SIDES[key];
  // With a single service on a side, its button books that service directly.
  const book = bookLink(`Book the ${s.short.toLowerCase()}`, {
    cls: 'btn btn--primary side__book',
    ...(items.length === 1 ? { service: items[0].slug } : {}),
  });
  return html`
<article class="side side--${key}" id="${key}" aria-labelledby="side-${key}-title" data-reveal style="--d:${i}">
  <figure class="side__media">
    <img src="/images/side-${key}-640.webp" srcset="/images/side-${key}-640.webp 640w, /images/side-${key}-1100.webp 1100w"
      sizes="(min-width: 960px) 580px, 92vw" width="1100" height="733" loading="lazy" decoding="async" alt="${s.alt}">
    <span class="side__num" aria-hidden="true">0${i + 1}</span>
  </figure>
  <div class="side__body">
    <h3 class="side__title" id="side-${key}-title">${s.title}</h3>
    <p class="side__text">${s.text}</p>
    <ul class="side__points">${s.points.map((p) => html`<li>${icon('check')}<span>${raw(p)}</span></li>`)}</ul>
    <div class="side__list">${items.map((svc) => serviceCard(svc))}</div>
    <div class="side__foot">${book}</div>
  </div>
</article>`;
}

function services(site) {
  const b = site.business;
  const sides = Object.keys(CATEGORIES)
    .map((key) => ({ key, items: site.services.filter((s) => s.category === key) }))
    .filter((g) => g.items.length);
  return html`
<section class="section section--soft services" id="services" aria-labelledby="services-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal>Services</p>
        <h2 class="section-title" id="services-title" data-reveal>Two sides. <em>One roof.</em></h2>
      </div>
      <p class="section-head__text" data-reveal>A barbershop and a full service salon side by side${b.building ? ` in ${b.building}` : ''}. Pick your side, or walk in and we’ll take care of you.</p>
    </header>
    <div class="sides">${sides.map((g, i) => side(g.key, g.items, i))}</div>
    <div class="services__note" data-reveal>
      <p>${icon('info')}<span><strong>Walk-ins welcome.</strong> No appointment needed — just pull a ticket when you arrive.</span></p>
      <a class="btn btn--outline" href="${telHref(b.phone)}">${icon('phone')}<span>Call ${b.phone}</span></a>
    </div>
  </div>
</section>`;
}

function ctaBand(site) {
  return html`
<section class="section cta-band" id="book-cta" aria-labelledby="cta-title">
  <div class="container">
    <div class="cta-band__panel" data-reveal>
      <div class="cta-band__content">
        <p class="eyebrow eyebrow--on-accent">Book ahead</p>
        <h2 class="cta-band__title" id="cta-title">Skip the wait. Book ahead.</h2>
        <p class="cta-band__text">Walk-ins are always welcome. Prefer a set time? Choose your service and pick a time that suits you.</p>
        <ol class="cta-band__steps">
          <li><span>1</span>Choose a service</li>
          <li><span>2</span>Pick a time</li>
          <li><span>3</span>You’re booked</li>
        </ol>
        <div class="cta-band__actions">
          ${bookLink('Book your appointment', { cls: 'btn btn--white btn--lg' })}
          <a class="cta-band__call" href="${telHref(site.business.phone)}">${icon('phone')}<span>or call ${site.business.phone}</span></a>
        </div>
      </div>
      <figure class="cta-band__visual" aria-hidden="true">
        <img src="/images/cta-pole-600.webp" srcset="/images/cta-pole-600.webp 600w, /images/cta-pole-900.webp 900w"
          sizes="(min-width: 960px) 360px, 1px" width="600" height="600" alt="" loading="lazy" decoding="async">
      </figure>
    </div>
  </div>
</section>`;
}

function reviews(site) {
  const b = site.business;
  const list = site.reviews;
  const summary = hasRating(b)
    ? html`<div class="reviews__summary" data-reveal>
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
            <span>Read our reviews</span>${icon('arrow-up-right', 'btn__arrow')}<span class="visually-hidden"> (opens Google in a new tab)</span>
          </a>
        </div>
      </div>`
    : html`<div class="reviews__summary reviews__summary--plain" data-reveal>
        <span class="reviews__quote" aria-hidden="true">${icon('quote')}</span>
        <p class="reviews__plain-text">See what clients say about ${b.name} on Google — and leave a review after your next visit.</p>
        <div class="reviews__actions">
          <a class="btn btn--dark" href="${b.reviewsUrl}" target="_blank" rel="noopener">
            <span>Read our reviews</span>${icon('arrow-up-right', 'btn__arrow')}<span class="visually-hidden"> (opens Google in a new tab)</span>
          </a>
        </div>
      </div>`;
  return html`
<section class="section section--soft reviews" id="reviews" aria-labelledby="reviews-title">
  <div class="container">
    <header class="section-head section-head--center">
      <p class="eyebrow" data-reveal>Reviews</p>
      ${
        hasRating(b)
          ? html`<h2 class="section-title" id="reviews-title" data-reveal>Rated <em>${b.googleRating.toFixed(1)}</em> on Google</h2>
            <p class="section-head__text" data-reveal>Real ratings from real clients on our Google Business Profile.</p>`
          : html`<h2 class="section-title" id="reviews-title" data-reveal>What our clients <em>say</em></h2>
            <p class="section-head__text" data-reveal>Real reviews from real clients, on our Google Business Profile.</p>`
      }
    </header>
    ${summary}
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

/**
 * Tile shape: `shape` in gallery.json ("feature" 2×2, "tall", "wide" or "normal"),
 * otherwise inferred from the photo's proportions.
 */
function galleryShape(g) {
  const shape = g.shape ?? (g.feature ? 'feature' : g.height > g.width * 1.15 ? 'tall' : g.width > g.height * 1.2 ? 'wide' : 'normal');
  return shape === 'normal' ? '' : ` is-${shape}`;
}

function gallery(site) {
  const items = site.gallery;
  const cats = Object.keys(GALLERY_LABELS).filter((c) => items.some((g) => g.category === c));
  return html`
<section class="section gallery" id="gallery" aria-labelledby="gallery-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal>Gallery</p>
        <h2 class="section-title" id="gallery-title" data-reveal>Fresh cuts <em>&amp; new looks</em></h2>
      </div>
      <p class="section-head__text" data-reveal>Men’s cuts, women’s styles, color and the salon. Tap any photo for a closer look.</p>
    </header>
    <div class="gallery__filters" role="group" aria-label="Filter gallery by category" data-reveal>
      <button type="button" class="chip is-active" aria-pressed="true" data-filter="all">All</button>
      ${cats.map((c) => html`<button type="button" class="chip" aria-pressed="false" data-filter="${c}">${GALLERY_LABELS[c]}</button>`)}
    </div>
    <ul class="gallery__grid" data-gallery>
      ${items.map(
        (g, i) => html`<li class="gallery__item${galleryShape(g)}" data-category="${g.category}" data-reveal style="--d:${i % 4}">
          <button type="button" class="gallery__btn" data-lightbox="${i}" data-large="${g.srcLarge}" data-caption="${g.alt}" aria-label="View larger photo: ${g.alt}">
            <img src="${g.src}" srcset="${g.src} 640w, ${g.srcLarge} 1400w" sizes="${/is-(feature|wide)/.test(galleryShape(g)) ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 900px) 25vw, 50vw'}"
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
<section class="section section--soft location" id="location" aria-labelledby="location-title">
  <div class="container">
    <header class="section-head section-head--split">
      <div>
        <p class="eyebrow" data-reveal>Visit us</p>
        <h2 class="section-title" id="location-title" data-reveal>Find us${b.building ? html` <em>in ${b.building}</em>` : html` <em>in ${b.city}</em>`}</h2>
      </div>
      <p class="section-head__text" data-reveal>${b.building ? `${b.building}, ` : ''}${b.streetAddress}, ${b.city}. Walk in anytime during opening hours, or call to book.</p>
    </header>
    <div class="location__grid">
      <div class="location__card" data-reveal>
        <div class="location__row">
          <span class="location__icon">${icon('pin')}</span>
          <div>
            <h3 class="location__label">Address</h3>
            <address class="location__value">${b.name}<br>${b.building ? html`${b.building}<br>` : ''}${b.streetAddress}<br>${b.city}, ${b.region} ${b.postalCode}</address>
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
            <h3 class="location__label">Business hours <span class="status-pill" data-open-pill hidden></span></h3>
            <table class="hours">
              <caption class="visually-hidden">Opening hours</caption>
              <tbody>
                ${weekHours(site.hours).map(
                  (d) => html`<tr data-day="${d.day}"><th scope="row">${d.name}</th><td>${d.value}</td></tr>`,
                )}
              </tbody>
            </table>
            <p class="location__note">${icon('users')}<span>Walk-ins welcome — pull a ticket when you arrive.</span></p>
          </div>
        </div>
        <div class="location__actions">
          <a class="btn btn--outline" href="${directionsUrl(b)}" target="_blank" rel="noopener">${icon('navigation')}<span>Get directions</span></a>
          <a class="btn btn--outline" href="${telHref(b.phone)}">${icon('phone')}<span>Call now</span></a>
          ${bookLink('Book appointment', { cls: 'btn btn--primary location__book' })}
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
    '@type': ['BarberShop', 'HairSalon'],
    '@id': `${site.siteUrl}/#business`,
    name: b.name,
    description: `Barbershop and full service salon${b.building ? ` inside ${b.building}` : ''} in ${b.city}, ${b.region}: men’s and women’s haircuts, styling, color and facial waxing. Walk-ins welcome.`,
    ...(b.foundedYear ? { foundingDate: String(b.foundedYear) } : {}),
    ...(b.building ? { containedInPlace: { '@type': 'ShoppingCenter', name: b.building } } : {}),
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
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Barbershop and salon services', itemListElement: offers },
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site.siteUrl}/book`, inLanguage: 'en-CA' },
      result: { '@type': 'Reservation', name: 'Appointment' },
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
    title: `${b.name} | ${b.building ? `${b.building}, ` : ''}${b.city}`,
    description: `Men’s and women’s haircuts, styling, color and facial waxing${b.building ? ` inside ${b.building}` : ''}, ${b.city}, AB.${
      b.foundedYear ? ` Serving ${b.city} since ${b.foundedYear}.` : ''
    } Walk-ins welcome — or book online or by phone.`,
    preloadImage: raw(
      '<link rel="preload" as="image" href="/images/hero-800.webp" imagesrcset="/images/hero-480.webp 480w, /images/hero-800.webp 800w, /images/hero-1200.webp 1200w" imagesizes="(min-width: 960px) 270px, 46vw" fetchpriority="high">',
    ),
    head: html`<script type="application/ld+json">${jsonScript(structuredData(site))}</script>
<script type="application/json" id="site-data">${jsonScript(clientData(site))}</script>`,
    content: html`${hero(site)}${ticker(site)}${trust(site)}${about(site)}${services(site)}${ctaBand(site)}${reviews(site)}${gallery(site)}${location(site)}`,
  });
}

export { clientData };
