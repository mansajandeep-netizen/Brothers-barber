import { get, patch } from '../api.js';
import { h, icon, button, empty, field, readForm, showFieldErrors, withBusy, toast, statusBadge, fmtDate, fmtTime, fmtTimestamp, telHref, initials } from '../ui.js';
import { cardWith } from './shared.js';
import { openAppointmentEditor } from './appointment-editor.js';

export async function render(ctx) {
  if (ctx.params[0]) return renderDetail(ctx, Number(ctx.params[0]));
  return renderList(ctx);
}

async function renderList(ctx) {
  const { el, query, navigate, replaceQuery } = ctx;
  const q = query.q || '';
  const page = Math.max(1, Number(query.page) || 1);

  const search = h('input', {
    class: 'input',
    type: 'search',
    value: q,
    placeholder: 'Search by name, phone or email',
    'aria-label': 'Search customers',
    style: { maxWidth: '360px' },
  });
  const results = h('div');
  el.replaceChildren(
    h('div', { class: 'page__head' }, h('div', null, h('h2', null, 'Customers'), h('p', null, 'Everyone who has booked online or been added by staff.'))),
    h('div', { class: 'toolbar' }, search),
    results,
  );

  let seq = 0;
  async function load(term, pageNum) {
    const mySeq = ++seq;
    results.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'skeleton-line' }), h('div', { class: 'skeleton-line' })));
    const data = await get('/customers', { q: term, page: pageNum });
    if (mySeq !== seq || !ctx.isCurrent()) return;
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    results.replaceChildren(
      cardWith(
        `${data.total} customer${data.total === 1 ? '' : 's'}`,
        term ? `Matching “${term}”` : 'Most recently active first',
        data.customers.length
          ? h(
              'div',
              null,
              h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'table table--stack' },
                  h('thead', null, h('tr', null, ['Customer', 'Phone', 'Email', 'Visits', 'Last visit'].map((t, i) => h('th', { scope: 'col', class: i === 3 ? 'num' : '' }, t)))),
                  h(
                    'tbody',
                    null,
                    data.customers.map((c) =>
                      h(
                        'tr',
                        { class: 'is-clickable', onClick: (e) => !e.target.closest('a') && navigate(`customers/${c.id}`) },
                        h('td', null, h('a', { class: 'cell-title', href: `#/customers/${c.id}`, style: { textDecoration: 'none' } }, c.name), h('span', { class: 'cell-sub' }, `${c.bookings} booking${c.bookings === 1 ? '' : 's'}`)),
                        h('td', { 'data-label': 'Phone' }, h('a', { href: telHref(c.phone) }, c.phone)),
                        h('td', { 'data-label': 'Email' }, c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : h('span', { class: 'muted' }, '—')),
                        h('td', { class: 'num', 'data-label': 'Visits' }, String(c.visits)),
                        h('td', { 'data-label': 'Last visit' }, c.lastVisit ? fmtDate(c.lastVisit, { month: 'short', day: 'numeric', year: 'numeric' }) : h('span', { class: 'muted' }, '—')),
                      ),
                    ),
                  ),
                ),
              ),
              pages > 1
                ? h(
                    'div',
                    { class: 'pager' },
                    h('span', null, `Page ${pageNum} of ${pages}`),
                    h(
                      'div',
                      { style: { display: 'flex', gap: '6px' } },
                      button('Previous', { variant: 'secondary', size: 'sm', disabled: pageNum <= 1, onClick: () => navigate('customers', { q: term, page: pageNum - 1 }) }),
                      button('Next', { variant: 'secondary', size: 'sm', disabled: pageNum >= pages, onClick: () => navigate('customers', { q: term, page: pageNum + 1 }) }),
                    ),
                  )
                : null,
            )
          : empty({ iconName: 'users', title: term ? 'No matching customers' : 'No customers yet', text: term ? 'Try a different search.' : 'Customers appear here after their first booking.' }),
      ),
    );
  }

  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      replaceQuery('customers', { q: search.value.trim() });
      load(search.value.trim(), 1);
    }, 300);
  });
  await load(q, page);
}

async function renderDetail(ctx, id) {
  const { el, navigate } = ctx;
  const data = await get(`/customers/${id}`);
  if (!ctx.isCurrent()) return;
  const c = data.customer;
  const refresh = () => ctx.refresh();

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Name', name: 'name', value: c.name }), field({ label: 'Phone', name: 'phone', type: 'tel', value: c.phone })),
    field({ label: 'Email', name: 'email', type: 'email', value: c.email }),
    field({ label: 'Private notes', name: 'notes', type: 'textarea', value: c.notes, hint: 'Only visible to staff — e.g. usual cut, preferences.' }),
  );
  const saveBtn = button('Save customer', { variant: 'primary', type: 'submit' });
  form.append(h('div', null, saveBtn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(saveBtn, async () => {
      try {
        await patch(`/customers/${id}`, readForm(form));
        showFieldErrors(form, {});
        toast('Customer saved.');
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        toast(err.message, 'error');
      }
    });
  });

  const history = data.appointments.length
    ? h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table table--stack' },
          h('thead', null, h('tr', null, ['When', 'Service', 'Barber', 'Status'].map((t) => h('th', { scope: 'col' }, t)))),
          h(
            'tbody',
            null,
            data.appointments.map((a) =>
              h(
                'tr',
                { class: 'is-clickable', onClick: () => openAppointmentEditor({ appointment: a, onSaved: refresh }) },
                h('td', null, h('span', { class: 'cell-title' }, fmtDate(a.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })), h('span', { class: 'cell-sub' }, fmtTime(a.start))),
                h('td', { 'data-label': 'Service' }, a.serviceName),
                h('td', { 'data-label': 'Barber' }, a.barberName),
                h('td', null, statusBadge(a.status)),
              ),
            ),
          ),
        ),
      )
    : empty({ title: 'No appointments yet' });

  el.replaceChildren(
    h(
      'div',
      { class: 'page__head' },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        h('span', { class: 'avatar avatar--light', style: { width: '48px', height: '48px', fontSize: '16px' } }, initials(c.name)),
        h('div', null, h('h2', null, c.name), h('p', null, `${c.visits} completed visit${c.visits === 1 ? '' : 's'} · customer since ${fmtTimestamp(c.createdAt).split(',')[0]}`)),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        button('Back', { variant: 'ghost', size: 'sm', iconName: 'arrow-left', onClick: () => navigate('customers') }),
        h('a', { class: 'btn btn--secondary btn--sm', href: telHref(c.phone) }, icon('phone'), h('span', null, 'Call')),
        button('Book appointment', {
          variant: 'primary',
          size: 'sm',
          iconName: 'plus',
          onClick: () => openAppointmentEditor({ preset: { customer: { name: c.name, phone: c.phone, email: c.email } }, onSaved: refresh }),
        }),
      ),
    ),
    h('div', { class: 'grid grid--2-1' }, cardWith('Appointment history', `${data.appointments.length} total`, history), cardWith('Contact details', '', h('div', { class: 'card__body' }, form))),
  );
}
