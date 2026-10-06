import { get, put, post, del } from '../api.js';
import { state, isOwner, today, loadCatalog } from '../state.js';
import {
  h,
  button,
  empty,
  field,
  switchField,
  checkField,
  readForm,
  showFieldErrors,
  withBusy,
  toast,
  confirmDialog,
  fmtDate,
  fmtTime,
  minToTime,
  DAY_NAMES,
  WEEK_ORDER,
} from '../ui.js';
import { cardWith } from './shared.js';

export async function render(ctx) {
  const { el } = ctx;
  const [hoursRes, rulesRes, blocksRes] = await Promise.all([get('/hours'), get('/booking-rules'), get('/blocks')]);
  if (!ctx.isCurrent()) return;
  const owner = isOwner();

  el.replaceChildren(
    h(
      'div',
      { class: 'page__head' },
      h('div', null, h('h2', null, 'Hours & Availability'), h('p', null, 'Control when customers can book online. Changes apply immediately.')),
    ),
    h(
      'div',
      { class: 'grid grid--2' },
      h('div', { class: 'stack' }, hoursCard(hoursRes.hours, owner), rulesCard(rulesRes.rules, owner)),
      blocksCard(blocksRes.blocks, ctx),
    ),
  );
}

/* ---------------- Business hours ---------------- */

function hoursCard(hours, owner) {
  const byDay = new Map(hours.map((x) => [x.day, x]));
  const rows = WEEK_ORDER.map((d) => {
    const x = byDay.get(d) ?? { day: d, isOpen: false, open: 540, close: 1140 };
    const openToggle = h('input', { type: 'checkbox', checked: x.isOpen, disabled: !owner, role: 'switch', 'aria-label': `${DAY_NAMES[d]} open` });
    const openIn = h('input', { class: 'input', type: 'time', step: 900, value: minToTime(x.open), disabled: !owner, 'aria-label': `${DAY_NAMES[d]} opening time` });
    const closeIn = h('input', { class: 'input', type: 'time', step: 900, value: minToTime(x.close), disabled: !owner, 'aria-label': `${DAY_NAMES[d]} closing time` });
    const times = h('div', { class: 'hours-edit__times' }, openIn, h('span', { class: 'muted' }, 'to'), closeIn);
    const closedLabel = h('span', { class: 'hours-edit__closed' }, 'Closed');
    const err = h('p', { class: 'field__error', hidden: true, style: { gridColumn: '1 / -1' } });
    const sync = () => {
      times.hidden = !openToggle.checked;
      closedLabel.hidden = openToggle.checked;
    };
    openToggle.addEventListener('change', sync);
    sync();
    const row = h(
      'div',
      { class: 'hours-edit__row' },
      h('span', { class: 'hours-edit__day' }, DAY_NAMES[d]),
      h('label', { class: 'switch' }, openToggle, h('span', { class: 'switch__track', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden' }, 'Open')),
      h('div', null, times, closedLabel),
      err,
    );
    row._read = () => ({ day: d, isOpen: openToggle.checked, open: openIn.value, close: closeIn.value });
    row._err = err;
    return row;
  });

  const save = button('Save hours', { variant: 'primary', size: 'sm' });
  save.addEventListener('click', async () => {
    const payload = rows.map((r) => r._read());
    rows.forEach((r) => (r._err.hidden = true));
    await withBusy(save, async () => {
      try {
        await put('/hours', { hours: payload });
        toast('Business hours saved. The website now shows the new hours.');
      } catch (err) {
        for (const r of rows) {
          const msg = err.fields?.[`day${r._read().day}`];
          if (msg) {
            r._err.hidden = false;
            r._err.textContent = msg;
          }
        }
        toast(err.message, 'error');
      }
    });
  });

  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'card__head' }, h('div', null, h('h2', { class: 'card__title' }, 'Business hours'), h('p', { class: 'card__sub' }, 'Shown on the website and used for online booking.'))),
    h('div', { class: 'card__body' }, h('div', { class: 'hours-edit' }, rows)),
    owner ? h('div', { class: 'card__foot' }, save) : null,
  );
}

/* ---------------- Booking rules ---------------- */

function rulesCard(rules, owner) {
  const noticeOptions = [
    [0, 'No minimum'],
    [15, '15 minutes'],
    [30, '30 minutes'],
    [60, '1 hour'],
    [120, '2 hours'],
    [240, '4 hours'],
    [720, '12 hours'],
    [1440, '1 day'],
  ];
  if (!noticeOptions.some(([v]) => v === rules.minNoticeMinutes)) noticeOptions.push([rules.minNoticeMinutes, `${rules.minNoticeMinutes} minutes`]);

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    switchField({ label: 'Accept online bookings', name: 'enabled', checked: rules.enabled, hint: 'When off, the website asks customers to call instead.' }),
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({
        label: 'Start times every',
        name: 'slotInterval',
        type: 'select',
        value: rules.slotInterval,
        options: [10, 15, 20, 30, 45, 60].map((v) => ({ value: v, label: `${v} minutes` })),
      }),
      field({ label: 'Default appointment length (min)', name: 'defaultDuration', type: 'number', value: rules.defaultDuration, attrs: { min: 5, max: 480, step: 5 }, hint: 'Used for services without their own length.' }),
    ),
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Minimum notice', name: 'minNoticeMinutes', type: 'select', value: rules.minNoticeMinutes, options: noticeOptions.map(([value, label]) => ({ value, label })), hint: 'How soon before a time it can still be booked online.' }),
      field({ label: 'Booking window (days ahead)', name: 'maxAdvanceDays', type: 'number', value: rules.maxAdvanceDays, attrs: { min: 1, max: 365 } }),
    ),
    field({ label: 'Online cancellation cutoff (hours before)', name: 'cancelCutoffHours', type: 'number', value: rules.cancelCutoffHours, attrs: { min: 0, max: 168 }, hint: 'After this, customers must call to cancel.' }),
  );
  if (!owner) form.querySelectorAll('input, select').forEach((x) => (x.disabled = true));

  const save = button('Save rules', { variant: 'primary', size: 'sm' });
  save.addEventListener('click', async () => {
    const d = readForm(form);
    await withBusy(save, async () => {
      try {
        await put('/booking-rules', d);
        await loadCatalog();
        showFieldErrors(form, {});
        toast('Booking rules saved.');
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        toast(err.message, 'error');
      }
    });
  });

  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'card__head' }, h('div', null, h('h2', { class: 'card__title' }, 'Online booking rules'), h('p', { class: 'card__sub' }, 'Fine-tune what customers can book.'))),
    h('div', { class: 'card__body' }, form),
    owner ? h('div', { class: 'card__foot' }, save) : null,
  );
}

/* ---------------- Time off / blocked times ---------------- */

function blocksCard(blocks, ctx) {
  const t = today();
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field({
      label: 'Who',
      name: 'barberId',
      type: 'select',
      value: '',
      options: [{ value: '', label: 'Whole shop (all stylists)' }, ...state.barbers.map((b) => ({ value: b.id, label: b.name }))],
    }),
    h('div', { class: 'form-row form-row--2' }, field({ label: 'From', name: 'dateFrom', type: 'date', value: t, attrs: { min: t } }), field({ label: 'To', name: 'dateTo', type: 'date', value: t, attrs: { min: t } })),
    checkField({ label: 'All day', name: 'allDay', checked: true }),
    h('div', { class: 'form-row form-row--2', dataset: { times: '1' }, hidden: true }, field({ label: 'Start time', name: 'start', type: 'time', value: '12:00', attrs: { step: 900 } }), field({ label: 'End time', name: 'end', type: 'time', value: '13:00', attrs: { step: 900 } })),
    field({ label: 'Reason (optional, staff only)', name: 'reason', attrs: { maxlength: 120, placeholder: 'e.g. Holiday, lunch, training' } }),
  );
  const times = form.querySelector('[data-times]');
  const allDay = form.querySelector('[name=allDay]');
  allDay.addEventListener('change', () => (times.hidden = allDay.checked));
  form.querySelector('[name=dateFrom]').addEventListener('change', (e) => {
    const to = form.querySelector('[name=dateTo]');
    if (to.value < e.target.value) to.value = e.target.value;
    to.min = e.target.value;
  });

  const add = button('Block time', { variant: 'primary', size: 'sm', iconName: 'ban' });
  add.addEventListener('click', async () => {
    const d = readForm(form);
    await withBusy(add, async () => {
      try {
        const res = await post('/blocks', { ...d, barberId: d.barberId || null });
        showFieldErrors(form, {});
        if (res.affected?.length) {
          await confirmDialog({
            title: 'Heads up: existing bookings',
            message: h(
              'div',
              null,
              h('p', { style: { marginTop: 0 } }, `The blocked time overlaps ${res.affected.length} existing appointment${res.affected.length === 1 ? '' : 's'}. They have not been cancelled — contact these customers or reschedule them:`),
              h('ul', null, res.affected.map((a) => h('li', null, `${fmtDate(a.date)} ${fmtTime(a.start)} — ${a.customer.name} (${a.customer.phone}), ${a.barberName}`))),
            ),
            confirmLabel: 'Got it',
          });
        } else toast('Time blocked. Online booking will skip it.');
        ctx.refresh();
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        toast(err.message, 'error');
      }
    });
  });

  const list = blocks.length
    ? h(
        'ul',
        { class: 'appt-list' },
        blocks.map((b) =>
          h(
            'li',
            { class: 'appt', style: { gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' } },
            h(
              'div',
              null,
              h('div', { class: 'appt__top' }, h('strong', null, b.barberName ?? 'Whole shop'), b.allDay ? h('span', { class: 'badge badge--warn badge--plain' }, 'All day') : null),
              h(
                'div',
                { class: 'appt__meta' },
                b.dateFrom === b.dateTo ? fmtDate(b.dateFrom, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : `${fmtDate(b.dateFrom)} – ${fmtDate(b.dateTo, { month: 'short', day: 'numeric', year: 'numeric' })}`,
                b.allDay ? '' : ` · ${fmtTime(b.start)}–${fmtTime(b.end)}`,
                b.reason ? ` · ${b.reason}` : '',
              ),
            ),
            button('', {
              variant: 'ghost',
              size: 'sm',
              iconName: 'trash',
              'aria-label': 'Remove block',
              onClick: async () => {
                const ok = await confirmDialog({ title: 'Remove this block?', message: 'Those times will become bookable again.', confirmLabel: 'Remove', danger: true });
                if (!ok) return;
                try {
                  await del(`/blocks/${b.id}`);
                  toast('Block removed.');
                  ctx.refresh();
                } catch (err) {
                  toast(err.message, 'error');
                }
              },
            }),
          ),
        ),
      )
    : empty({ iconName: 'ban', title: 'No blocked time coming up', text: 'Block holidays, days off, lunch breaks or training so they can’t be booked.' });

  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'card__head' }, h('div', null, h('h2', { class: 'card__title' }, 'Time off & blocked times'), h('p', { class: 'card__sub' }, 'Make specific times unavailable for booking.'))),
    h('div', { class: 'card__body' }, form),
    h('div', { class: 'card__foot' }, add),
    h('div', { class: 'card__head', style: { borderTop: '1px solid var(--line)' } }, h('h3', { class: 'card__title', style: { fontSize: '14px' } }, `Upcoming blocks (${blocks.length})`)),
    list,
  );
}

