import { get, post, patch, del } from '../api.js';
import { h, icon, button, empty, modal, confirmDialog, field, switchField, readForm, showFieldErrors, withBusy, toast, fmtDate } from '../ui.js';

export async function render(ctx) {
  const { el, setActions } = ctx;
  const [{ reviews }, { business }] = await Promise.all([get('/reviews'), get('/business')]);
  if (!ctx.isCurrent()) return;
  const reload = () => ctx.refresh();
  setActions(button('Add review', { variant: 'secondary', size: 'sm', iconName: 'plus', onClick: () => openEditor(null, reviews.length, reload) }));

  const stars = (n) => h('span', { 'aria-label': `${n} out of 5 stars`, style: { color: '#b48a48', letterSpacing: '2px' } }, '★'.repeat(n) + '☆'.repeat(5 - n));

  el.replaceChildren(
    h(
      'div',
      { class: 'page__head' },
      h('div', null, h('h2', null, 'Reviews'), h('p', null, `Website shows your Google rating (${business.googleRating} from ${business.googleReviewCount} reviews) plus any reviews you feature here.`)),
      business.reviewsUrl ? h('a', { class: 'btn btn--secondary btn--sm', href: business.reviewsUrl, target: '_blank', rel: 'noopener' }, icon('external'), h('span', null, 'Open Google reviews')) : null,
    ),
    h(
      'div',
      { class: 'alert alert--info', style: { marginBottom: '16px' } },
      icon('info'),
      h('p', null, 'Only add genuine reviews, copied word-for-word from your Google Business Profile with the reviewer’s name as shown on Google. Update the rating and review count in ', h('a', { class: 'link', href: '#/settings' }, 'Business Info'), '.'),
    ),
    h(
      'div',
      { class: 'card' },
      reviews.length
        ? h(
            'ul',
            { class: 'appt-list' },
            reviews.map((r) =>
              h(
                'li',
                { class: 'appt', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
                h(
                  'div',
                  null,
                  h('div', { class: 'appt__top' }, h('strong', null, r.author), stars(r.rating), r.isPublished ? h('span', { class: 'badge badge--ok' }, 'On website') : h('span', { class: 'badge badge--cancelled' }, 'Hidden')),
                  h('div', { class: 'appt__meta' }, `${r.source}${r.reviewDate ? ` · ${fmtDate(r.reviewDate, { month: 'long', year: 'numeric' })}` : ''}`),
                  h('p', { style: { margin: '8px 0 0', whiteSpace: 'pre-line' } }, r.body),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px', alignItems: 'flex-start' } },
                  button('Edit', { variant: 'ghost', size: 'xs', iconName: 'edit', onClick: () => openEditor(r, reviews.length, reload) }),
                  button('', {
                    variant: 'ghost',
                    size: 'xs',
                    iconName: 'trash',
                    'aria-label': `Delete review by ${r.author}`,
                    onClick: async () => {
                      const ok = await confirmDialog({ title: 'Delete this review?', message: `The review by ${r.author} will be removed from the website.`, confirmLabel: 'Delete', danger: true });
                      if (!ok) return;
                      try {
                        await del(`/reviews/${r.id}`);
                        toast('Review deleted.');
                        reload();
                      } catch (err) {
                        toast(err.message, 'error');
                      }
                    },
                  }),
                ),
              ),
            ),
          )
        : empty({
            iconName: 'star',
            title: 'No featured reviews yet',
            text: 'The website already shows your Google rating. Add a few real reviews to show them on the page too.',
            action: button('Add review', { variant: 'primary', size: 'sm', iconName: 'plus', onClick: () => openEditor(null, 0, reload) }),
          }),
    ),
  );
}

function openEditor(review, count, onDone) {
  const r = review;
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Reviewer name (as shown on Google)', name: 'author', value: r?.author ?? '', attrs: { maxlength: 60 } }),
      field({ label: 'Rating', name: 'rating', type: 'select', value: r?.rating ?? 5, options: [5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} star${n === 1 ? '' : 's'}` })) }),
    ),
    field({ label: 'Review text', name: 'body', type: 'textarea', value: r?.body ?? '', attrs: { maxlength: 1200, rows: 5 } }),
    h(
      'div',
      { class: 'form-row form-row--3' },
      field({ label: 'Review date (optional)', name: 'reviewDate', type: 'date', value: r?.reviewDate ?? '' }),
      field({ label: 'Source', name: 'source', value: r?.source ?? 'Google', attrs: { maxlength: 30 } }),
      field({ label: 'Sort order', name: 'sortOrder', type: 'number', value: r?.sortOrder ?? (count + 1) * 10, attrs: { min: 0, step: 10 } }),
    ),
    switchField({ label: 'Show on website', name: 'isPublished', checked: r?.isPublished ?? true }),
  );
  const save = button(r ? 'Save review' : 'Add review', { variant: 'primary', onClick: () => submit() });
  const m = modal({ title: r ? 'Edit review' : 'Add a Google review', body: form, actions: [button('Cancel', { variant: 'ghost', onClick: () => m.close() }), save] });

  async function submit() {
    const d = readForm(form);
    await withBusy(save, async () => {
      try {
        const body = { ...d, rating: Number(d.rating), reviewDate: d.reviewDate || null, sortOrder: d.sortOrder || 0 };
        if (r) await patch(`/reviews/${r.id}`, body);
        else await post('/reviews', body);
        toast(r ? 'Review saved.' : 'Review added.');
        m.close();
        onDone();
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        m.setError(err.message);
      }
    });
  }
}
