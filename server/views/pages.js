import { html } from './html.js';
import { icon } from './icons.js';
import { bookLink, page } from './layout.js';
import { formatPrice, telHref } from './format.js';
import { formatDateLong, formatTime12 } from '../lib/time.js';

export function renderNotFound(site) {
  return page(site, {
    path: '/404',
    robots: 'noindex',
    bodyClass: 'page-simple',
    title: `Page not found | ${site.business.name}`,
    description: 'The page you were looking for could not be found.',
    content: html`
<section class="simple-hero">
  <div class="container simple-hero__inner">
    <p class="simple-hero__code" aria-hidden="true">404</p>
    <p class="eyebrow eyebrow--center"><span class="eyebrow__line" aria-hidden="true"></span>Page not found<span class="eyebrow__line" aria-hidden="true"></span></p>
    <h1 class="simple-hero__title">This page got <em>too close a shave.</em></h1>
    <p class="simple-hero__text">The page you’re looking for doesn’t exist or has moved. Let’s get you back in the chair.</p>
    <div class="simple-hero__actions">
      <a class="btn btn--ghost btn--lg" href="/">${icon('arrow-left')}<span>Back to Home</span></a>
      ${bookLink('Book an Appointment', { cls: 'btn btn--primary btn--lg' })}
    </div>
  </div>
</section>`,
  });
}

const STATUS = {
  booked: ['Confirmed', 'is-ok'],
  completed: ['Completed', 'is-done'],
  cancelled: ['Cancelled', 'is-cancelled'],
  no_show: ['Missed', 'is-cancelled'],
};

export function renderManage(site, appt, { canCancel, reason }) {
  const b = site.business;
  const [statusLabel, statusClass] = STATUS[appt.status] ?? ['Unknown', ''];
  const rows = [
    ['Service', appt.serviceName],
    ['Barber', appt.barberName],
    ['Date', formatDateLong(appt.date)],
    ['Time', formatTime12(appt.startMin)],
    ...(appt.priceCents != null ? [['Price', formatPrice(appt.priceCents)]] : []),
    ['Name', appt.customer.name],
    ['Reference', appt.reference],
  ];
  return page(site, {
    path: `/appointment/${appt.token}`,
    robots: 'noindex, nofollow',
    bodyClass: 'page-simple',
    title: `Your appointment | ${b.name}`,
    description: `Manage your appointment at ${b.name}.`,
    content: html`
<section class="manage">
  <div class="container manage__inner">
    <p class="eyebrow"><span class="eyebrow__line" aria-hidden="true"></span>Your Appointment</p>
    <h1 class="manage__title">${appt.status === 'cancelled' ? 'Appointment cancelled' : appt.status === 'booked' ? 'You’re booked in' : 'Appointment details'}</h1>
    <div class="manage__card" data-manage data-token="${appt.token}">
      <div class="manage__status"><span class="status-badge ${statusClass}">${statusLabel}</span><span class="manage__ref">${appt.reference}</span></div>
      <dl class="detail-list">
        ${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
      </dl>
      <p class="manage__addr">${icon('pin')}<span>${b.name}, ${b.streetAddress}, ${b.city}, ${b.region} ${b.postalCode}</span></p>
      <div class="manage__actions">
        ${appt.status === 'booked'
          ? html`<a class="btn btn--outline" href="/api/bookings/${appt.token}/calendar.ics" download>${icon('calendar')}<span>Add to Calendar</span></a>`
          : ''}
        <a class="btn btn--outline" href="${telHref(b.phone)}">${icon('phone')}<span>Call ${b.phone}</span></a>
        ${appt.status === 'booked' ? '' : bookLink('Book Again', { cls: 'btn btn--primary' })}
      </div>
      ${appt.status === 'booked'
        ? canCancel
          ? html`<div class="manage__cancel">
              <p>Can’t make it? Cancel online so someone else can take the spot.</p>
              <button type="button" class="btn btn--danger" data-cancel-appointment>${icon('close')}<span>Cancel Appointment</span></button>
              <p class="form-error" role="alert" data-cancel-error hidden></p>
            </div>`
          : html`<p class="manage__note">${icon('info')}<span>${reason}</span></p>`
        : ''}
    </div>
  </div>
</section>`,
  });
}
