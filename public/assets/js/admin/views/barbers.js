import { get, post, patch, del } from '../api.js';
import { isOwner, loadCatalog } from '../state.js';
import { h, icon, button, empty, modal, confirmDialog, field, switchField, readForm, showFieldErrors, withBusy, toast, initials, DAY_SHORT, WEEK_ORDER } from '../ui.js';

const PLACEHOLDER = /^(Barber|Stylist) \d+$/;

export async function render(ctx) {
  const { el, setActions } = ctx;
  const { barbers } = await get('/barbers');
  if (!ctx.isCurrent()) return;
  const owner = isOwner();
  const reload = async () => {
    await loadCatalog();
    ctx.refresh();
  };
  if (owner) setActions(button('Add stylist', { variant: 'secondary', size: 'sm', iconName: 'plus', onClick: () => openEditor(null, barbers.length, reload) }));

  const hasPlaceholders = barbers.some((b) => PLACEHOLDER.test(b.name));

  el.replaceChildren(
    h('div', { class: 'page__head' }, h('div', null, h('h2', null, 'Stylists'), h('p', null, 'Who customers can book with, and which days each stylist works.'))),
    hasPlaceholders
      ? h(
          'div',
          { class: 'alert alert--warn', style: { marginBottom: '16px' } },
          icon('info'),
          h('p', null, h('strong', null, 'Placeholder names in use. '), 'Customers see these names when booking — rename each chair to the real stylist (or remove extras).'),
        )
      : null,
    barbers.length
      ? h(
          'div',
          { class: 'people' },
          barbers.map((b) =>
            h(
              'article',
              { class: 'card person' },
              h(
                'div',
                { class: 'person__top' },
                h('span', { class: 'avatar avatar--light', style: { width: '46px', height: '46px', fontSize: '15px' } }, initials(b.name)),
                h('div', { style: { minWidth: 0, flex: 1 } }, h('h2', { class: 'person__name' }, b.name), h('p', { class: 'person__title' }, b.title || 'No title')),
                b.isActive ? h('span', { class: 'badge badge--ok' }, 'Bookable') : h('span', { class: 'badge badge--cancelled' }, 'Not bookable online'),
              ),
              h(
                'div',
                { class: 'person__days', 'aria-label': 'Working days' },
                WEEK_ORDER.map((d) => h('span', { class: b.workDays.includes(d) ? 'is-on' : '', title: b.workDays.includes(d) ? 'Works' : 'Off' }, DAY_SHORT[d])),
              ),
              owner
                ? h(
                    'div',
                    { class: 'person__actions' },
                    button('Edit', { variant: 'secondary', size: 'sm', iconName: 'edit', onClick: () => openEditor(b, barbers.length, reload) }),
                    button('Remove', {
                      variant: 'ghost',
                      size: 'sm',
                      iconName: 'trash',
                      onClick: async () => {
                        const ok = await confirmDialog({
                          title: `Remove ${b.name}?`,
                          message: 'They’ll no longer appear for booking. Past appointments are kept. Stylists with upcoming appointments can’t be removed until those are moved or cancelled.',
                          confirmLabel: 'Remove stylist',
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await del(`/barbers/${b.id}`);
                          toast(`${b.name} removed.`);
                          reload();
                        } catch (err) {
                          toast(err.message, 'error');
                        }
                      },
                    }),
                  )
                : null,
            ),
          ),
        )
      : h('div', { class: 'card' }, empty({ iconName: 'user', title: 'No stylists yet', text: 'Add at least one stylist to accept bookings.' })),
  );
}

function openEditor(barber, count, onDone) {
  const b = barber;
  const days = h(
    'div',
    { class: 'day-picks', role: 'group', 'aria-label': 'Working days' },
    WEEK_ORDER.map((d) =>
      h('label', { class: 'day-pick' }, h('input', { type: 'checkbox', name: 'workDays', value: String(d), dataset: { multi: '1' }, checked: b ? b.workDays.includes(d) : true }), h('span', null, DAY_SHORT[d])),
    ),
  );
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Name', name: 'name', value: b?.name ?? '', attrs: { maxlength: 60 } }), field({ label: 'Title (optional)', name: 'title', value: b?.title ?? '', attrs: { maxlength: 80, placeholder: 'e.g. Barber, Stylist, Colorist' } })),
    h('div', { class: 'field', dataset: { field: 'workDays' } }, h('span', { class: 'field__label' }, 'Works on'), days, h('p', { class: 'field__hint' }, 'Online booking only offers days this stylist works and the shop is open.'), h('p', { class: 'field__error', hidden: true })),
    h(
      'div',
      { class: 'form-row form-row--2' },
      switchField({ label: 'Customers can book online', name: 'isActive', checked: b?.isActive ?? true }),
      field({ label: 'Sort order', name: 'sortOrder', type: 'number', value: b?.sortOrder ?? (count + 1) * 10, attrs: { min: 0, step: 10 } }),
    ),
  );
  const save = button(b ? 'Save' : 'Add stylist', { variant: 'primary', onClick: () => submit() });
  const m = modal({ title: b ? `Edit ${b.name}` : 'Add a stylist', body: form, actions: [button('Cancel', { variant: 'ghost', onClick: () => m.close() }), save] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  async function submit() {
    const d = readForm(form);
    const body = { ...d, workDays: (d.workDays || []).map(Number), sortOrder: d.sortOrder || 0 };
    await withBusy(save, async () => {
      try {
        if (b) await patch(`/barbers/${b.id}`, body);
        else await post('/barbers', body);
        toast(b ? 'Stylist saved.' : 'Stylist added.');
        m.close();
        onDone();
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        m.setError(err.message);
      }
    });
  }
}
