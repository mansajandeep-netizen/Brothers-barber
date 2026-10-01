import { get, post, patch, del } from '../api.js';
import { isOwner, loadCatalog } from '../state.js';
import { h, icon, button, empty, modal, confirmDialog, field, switchField, checkField, readForm, showFieldErrors, withBusy, toast, fmtPrice, fmtDuration } from '../ui.js';
import { cardWith } from './shared.js';

export async function render(ctx) {
  const { el, setActions } = ctx;
  const data = await get('/services');
  if (!ctx.isCurrent()) return;
  const owner = isOwner();
  const reload = async () => {
    await loadCatalog();
    ctx.refresh();
  };

  if (owner) setActions(button('Add service', { variant: 'secondary', size: 'sm', iconName: 'plus', onClick: () => openEditor(null, data, reload) }));

  const missingPrice = data.services.filter((s) => s.isActive && s.priceCents == null).length;
  const missingDuration = data.services.filter((s) => s.isActive && !s.durationMin).length;

  const notes = [];
  if (missingPrice || missingDuration) {
    notes.push(
      h(
        'div',
        { class: 'alert alert--info', style: { marginBottom: '16px' } },
        icon('info'),
        h(
          'p',
          null,
          missingPrice ? `${missingPrice} service${missingPrice === 1 ? ' has' : 's have'} no price — prices only appear on the website once you add them. ` : '',
          missingDuration ? `${missingDuration} use${missingDuration === 1 ? 's' : ''} the default ${data.defaultDuration}-minute booking length.` : '',
        ),
      ),
    );
  }

  const groups = Object.entries(data.categories).map(([key, label]) => {
    const items = data.services.filter((s) => s.category === key);
    return cardWith(
      label,
      `${items.length} service${items.length === 1 ? '' : 's'}`,
      items.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table table--stack' },
              h('thead', null, h('tr', null, ['Service', 'Length', 'Price', 'Status', ''].map((t, i) => h('th', { scope: 'col', class: i === 4 ? 'actions' : '' }, t)))),
              h(
                'tbody',
                null,
                items.map((s) =>
                  h(
                    'tr',
                    { class: owner ? 'is-clickable' : '', onClick: owner ? (e) => !e.target.closest('button') && openEditor(s, data, reload) : null },
                    h('td', null, h('span', { class: 'cell-title' }, s.name), h('span', { class: 'cell-sub' }, s.description)),
                    h('td', { 'data-label': 'Length' }, s.durationMin ? fmtDuration(s.durationMin) : h('span', { class: 'muted' }, `Default (${data.defaultDuration} min)`)),
                    h('td', { 'data-label': 'Price' }, s.priceCents != null ? fmtPrice(s.priceCents, s.priceFrom) : h('span', { class: 'muted' }, 'Not set')),
                    h('td', null, s.isActive ? h('span', { class: 'badge badge--ok' }, 'On website') : h('span', { class: 'badge badge--cancelled' }, 'Hidden')),
                    h('td', { class: 'actions' }, owner ? button('Edit', { variant: 'ghost', size: 'xs', iconName: 'edit', onClick: () => openEditor(s, data, reload) }) : null),
                  ),
                ),
              ),
            ),
          )
        : empty({ iconName: 'scissors', title: 'No services in this category' }),
    );
  });

  el.replaceChildren(
    h(
      'div',
      { class: 'page__head' },
      h('div', null, h('h2', null, 'Services & Prices'), h('p', null, owner ? 'Edit names, descriptions, prices and booking lengths. Changes go live on the website immediately.' : 'Only the owner can edit services.')),
    ),
    ...notes,
    h('div', { class: 'stack' }, groups),
  );
}

function openEditor(service, data, onDone) {
  const s = service;
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Service name', name: 'name', value: s?.name ?? '', attrs: { maxlength: 60 } }),
      field({ label: 'Category', name: 'category', type: 'select', value: s?.category ?? 'haircuts', options: Object.entries(data.categories).map(([value, label]) => ({ value, label })) }),
    ),
    field({ label: 'Description', name: 'description', type: 'textarea', value: s?.description ?? '', attrs: { maxlength: 300, rows: 2 }, hint: 'One or two short sentences shown on the website.' }),
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({
        label: 'Price (optional)',
        name: 'price',
        type: 'money',
        value: s?.priceCents != null ? (s.priceCents / 100).toFixed(2).replace(/\.00$/, '') : '',
        hint: 'Leave blank to hide the price.',
      }),
      field({
        label: 'Booking length in minutes (optional)',
        name: 'durationMin',
        type: 'number',
        value: s?.durationMin ?? '',
        attrs: { min: 5, max: 480, step: 5, inputmode: 'numeric', placeholder: String(data.defaultDuration) },
        hint: `Blank uses the default ${data.defaultDuration} min. Shown to customers when set.`,
      }),
    ),
    checkField({ label: 'Show as a starting price (“From $35”)', name: 'priceFrom', checked: s?.priceFrom ?? false }),
    h(
      'div',
      { class: 'form-row form-row--2' },
      switchField({ label: 'Show on website & allow booking', name: 'isActive', checked: s?.isActive ?? true }),
      field({ label: 'Sort order', name: 'sortOrder', type: 'number', value: s?.sortOrder ?? (data.services.length + 1) * 10, attrs: { min: 0, step: 10 }, hint: 'Lower numbers appear first.' }),
    ),
  );

  const save = button(s ? 'Save service' : 'Add service', { variant: 'primary', onClick: () => submit() });
  const actions = [button('Cancel', { variant: 'ghost', onClick: () => m.close() }), save];
  if (s) {
    actions.unshift(
      button('Delete', {
        variant: 'danger',
        iconName: 'trash',
        onClick: async () => {
          const ok = await confirmDialog({
            title: `Delete “${s.name}”?`,
            message: 'It will be removed from the website and booking. Past appointments keep their service name. To hide it temporarily instead, switch off “Show on website”.',
            confirmLabel: 'Delete service',
            danger: true,
          });
          if (!ok) return;
          try {
            await del(`/services/${s.id}`);
            toast('Service deleted.');
            m.close();
            onDone();
          } catch (err) {
            m.setError(err.message);
          }
        },
      }),
      h('span', { class: 'spacer' }),
    );
  }
  const m = modal({ title: s ? `Edit ${s.name}` : 'Add a service', body: form, actions });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  async function submit() {
    const d = readForm(form);
    await withBusy(save, async () => {
      try {
        const body = { ...d, durationMin: d.durationMin || null, sortOrder: d.sortOrder || 0 };
        if (s) await patch(`/services/${s.id}`, body);
        else await post('/services', body);
        toast(s ? 'Service saved.' : 'Service added.');
        m.close();
        onDone();
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        m.setError(err.message);
      }
    });
  }
}

