import { get, put } from '../api.js';
import { h, icon, field, readForm, showFieldErrors, withBusy, toast, button, fmtTimestamp } from '../ui.js';
import { cardWith } from './shared.js';

export async function render(ctx) {
  const { el } = ctx;
  const [{ business: b }, mail] = await Promise.all([get('/business'), get('/email-log')]);
  if (!ctx.isCurrent()) return;

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('h3', { class: 'card__title', style: { fontSize: '14px' } }, 'Shop details'),
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Business name', name: 'name', value: b.name }), field({ label: 'Phone', name: 'phone', type: 'tel', value: b.phone })),
    field({ label: 'Email for booking notifications (optional)', name: 'email', type: 'email', value: b.email, hint: 'New online bookings and cancellations are emailed here. Also listed in search-engine data.' }),
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Street address', name: 'streetAddress', value: b.streetAddress }), field({ label: 'City', name: 'city', value: b.city })),
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Province', name: 'region', value: b.region }), field({ label: 'Postal code', name: 'postalCode', value: b.postalCode })),
    h('h3', { class: 'card__title', style: { fontSize: '14px', marginTop: '8px' } }, 'Google rating'),
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Rating (1–5)', name: 'googleRating', type: 'number', value: b.googleRating, attrs: { min: 1, max: 5, step: 0.1 } }),
      field({ label: 'Number of reviews', name: 'googleReviewCount', type: 'number', value: b.googleReviewCount, attrs: { min: 0, step: 1 } }),
    ),
    field({ label: '“Read our reviews” link', name: 'reviewsUrl', type: 'url', value: b.reviewsUrl, hint: 'Paste the link to your Google reviews. Update the rating above whenever it changes on Google.' }),
    h('h3', { class: 'card__title', style: { fontSize: '14px', marginTop: '8px' } }, 'Social media'),
    h('p', { class: 'field__hint', style: { marginTop: '-8px' } }, 'Icons appear in the website footer once a link is added. Leave blank to hide.'),
    h(
      'div',
      { class: 'form-row form-row--3' },
      field({ label: 'Instagram', name: 'instagramUrl', type: 'url', value: b.instagramUrl, attrs: { placeholder: 'https://instagram.com/…' } }),
      field({ label: 'Facebook', name: 'facebookUrl', type: 'url', value: b.facebookUrl, attrs: { placeholder: 'https://facebook.com/…' } }),
      field({ label: 'TikTok', name: 'tiktokUrl', type: 'url', value: b.tiktokUrl, attrs: { placeholder: 'https://tiktok.com/@…' } }),
    ),
  );
  const save = button('Save business info', { variant: 'primary' });
  save.addEventListener('click', async () => {
    await withBusy(save, async () => {
      try {
        await put('/business', readForm(form));
        showFieldErrors(form, {});
        toast('Business info saved. The website has been updated.');
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        toast(err.message, 'error');
      }
    });
  });

  const providerLabel = { resend: 'Resend', smtp: 'SMTP', console: 'Not connected (logging only)' }[mail.provider] ?? mail.provider;
  const mailCard = cardWith(
    'Email delivery',
    `Provider: ${providerLabel}`,
    h(
      'div',
      null,
      h(
        'div',
        { class: 'card__body' },
        mail.canSend
          ? h('div', { class: 'alert alert--ok' }, icon('check'), h('p', null, 'Booking confirmations are being emailed to customers.'))
          : h(
              'div',
              { class: 'alert alert--warn' },
              icon('mail'),
              h('p', null, 'Emails are written to the server log instead of being sent. To send real confirmations, set ', h('code', null, 'RESEND_API_KEY'), ' or ', h('code', null, 'SMTP_HOST'), ' / ', h('code', null, 'SMTP_USER'), ' / ', h('code', null, 'SMTP_PASS'), ', plus ', h('code', null, 'MAIL_FROM'), ' on the server, then restart it.'),
            ),
      ),
      mail.emails.length
        ? h(
            'ul',
            { class: 'mail-log', 'aria-label': 'Recent emails' },
            mail.emails.map((e) =>
              h(
                'li',
                null,
                h('span', { class: 'mail-log__subject', title: e.subject }, e.subject),
                h('span', { class: `badge ${e.status === 'sent' ? 'badge--ok' : e.status === 'failed' ? 'badge--no_show' : 'badge--cancelled'}`, title: e.error || '' }, e.status),
                h('span', { class: 'mail-log__meta' }, `${e.to_addr} · ${fmtTimestamp(e.created_at)}`),
              ),
            ),
          )
        : h('p', { class: 'muted small', style: { padding: '0 20px 16px' } }, 'No emails yet.'),
    ),
  );

  el.replaceChildren(
    h('div', { class: 'page__head' }, h('div', null, h('h2', null, 'Business Info'), h('p', null, 'Details shown across the website, in search results and in emails.'))),
    h('div', { class: 'grid grid--2-1' }, h('section', { class: 'card' }, h('div', { class: 'card__body' }, form), h('div', { class: 'card__foot' }, save)), mailCard),
  );
}
