import { get, post, patch } from '../api.js';
import { state, today, serviceById } from '../state.js';
import {
  h,
  button,
  modal,
  confirmDialog,
  field,
  readForm,
  showFieldErrors,
  withBusy,
  toast,
  statusBadge,
  fmtDateLong,
  fmtTime,
  fmtTimestamp,
  fmtDuration,
  fmtPrice,
  checkField,
} from '../ui.js';

/** Changes an appointment's status, confirming destructive changes first. Resolves to the updated appointment or null. */
export async function changeStatus(appt, status) {
  let notify = false;
  if (status === 'cancelled') {
    const box = appt.customer.email ? checkField({ label: `Email ${appt.customer.name.split(' ')[0]} that it’s cancelled`, name: 'notify', checked: true }) : null;
    const ok = await confirmDialog({
      title: 'Cancel this appointment?',
      message: `${appt.customer.name} — ${appt.serviceName}, ${fmtDateLong(appt.date)} at ${fmtTime(appt.start)}. The time slot will open up for other bookings.`,
      confirmLabel: 'Cancel appointment',
      danger: true,
      extra: box,
    });
    if (!ok) return null;
    notify = !!box?.querySelector('input')?.checked;
  }
  if (status === 'no_show') {
    const ok = await confirmDialog({
      title: 'Mark as no-show?',
      message: `${appt.customer.name} didn’t make it to their ${fmtTime(appt.start)} appointment.`,
      confirmLabel: 'Mark no-show',
      danger: true,
    });
    if (!ok) return null;
  }
  try {
    const res = await post(`/appointments/${appt.id}/status`, { status, notify });
    const msg = {
      completed: 'Marked as completed.',
      cancelled: notify ? 'Appointment cancelled and customer notified.' : 'Appointment cancelled.',
      no_show: 'Marked as no-show.',
      booked: 'Appointment restored.',
    }[status];
    toast(msg);
    return res.appointment;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

/**
 * Create / edit appointment modal.
 * @param {{ appointment?: object, preset?: object, onSaved?: Function }} opts
 */
export function openAppointmentEditor({ appointment = null, preset = {}, onSaved } = {}) {
  const editing = !!appointment;
  const a = appointment;
  const services = state.services;
  const barbers = state.barbers;

  if (!services.length || !barbers.length) {
    toast(!services.length ? 'Add a service first (Services & Prices).' : 'Add a stylist first (Stylists).', 'error');
    return;
  }

  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: `${s.name}${s.isActive ? '' : ' (hidden)'}`,
    group: state.categories[s.category] ?? s.category,
  }));
  const barberOptions = barbers.map((b) => ({ value: b.id, label: `${b.name}${b.isActive ? '' : ' (not taking online bookings)'}` }));
  if (editing && !barbers.some((b) => b.id === a.barberId)) barberOptions.push({ value: a.barberId, label: `${a.barberName} (removed)` });

  const initial = {
    serviceId: a?.serviceId ?? preset.serviceId ?? services.find((s) => s.isActive)?.id ?? services[0].id,
    barberId: a?.barberId ?? preset.barberId ?? barbers.find((b) => b.isActive)?.id ?? barbers[0].id,
    date: a?.date ?? preset.date ?? today(),
    time: a?.start ?? preset.time ?? '',
    durationMin: a ? a.durationMin : '',
    customerName: a?.customer.name ?? preset.customer?.name ?? '',
    customerPhone: a?.customer.phone ?? preset.customer?.phone ?? '',
    customerEmail: a?.customer.email ?? preset.customer?.email ?? '',
    notes: a?.notes ?? '',
  };

  const chips = h('div', { class: 'time-chips', role: 'group', 'aria-label': 'Available start times' });
  const chipsNote = h('p', { class: 'field__hint' });

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Service', name: 'serviceId', type: 'select', value: initial.serviceId, options: serviceOptions }),
      field({ label: 'Stylist', name: 'barberId', type: 'select', value: initial.barberId, options: barberOptions }),
    ),
    h(
      'div',
      { class: 'form-row form-row--3' },
      field({ label: 'Date', name: 'date', type: 'date', value: initial.date }),
      field({ label: 'Start time', name: 'time', type: 'time', value: initial.time, attrs: { step: 300 } }),
      field({ label: 'Length (minutes)', name: 'durationMin', type: 'number', value: initial.durationMin, attrs: { min: 5, max: 480, step: 5, inputmode: 'numeric' } }),
    ),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Available times'), chips, chipsNote),
    h(
      'div',
      { class: 'form-row form-row--2' },
      field({ label: 'Customer name', name: 'customerName', value: initial.customerName, attrs: { autocomplete: 'off', maxlength: 80 } }),
      field({ label: 'Phone', name: 'customerPhone', type: 'tel', value: initial.customerPhone, attrs: { autocomplete: 'off', inputmode: 'tel' } }),
    ),
    field({ label: 'Email (optional)', name: 'customerEmail', type: 'email', value: initial.customerEmail, attrs: { autocomplete: 'off' } }),
    field({ label: 'Notes (optional)', name: 'notes', type: 'textarea', value: initial.notes, attrs: { maxlength: 1000, rows: 3 } }),
  );

  const $ = (name) => form.querySelector(`[name="${name}"]`);
  const durationInput = $('durationMin');

  function syncDurationPlaceholder() {
    const s = serviceById($('serviceId').value);
    durationInput.placeholder = String(s?.durationMin || state.defaultDuration);
  }
  syncDurationPlaceholder();

  let slotSeq = 0;
  async function loadSlots() {
    const seq = ++slotSeq;
    chips.replaceChildren(h('span', { class: 'muted small' }, 'Checking availability…'));
    chipsNote.textContent = '';
    try {
      const res = await get('/slots', {
        serviceId: $('serviceId').value,
        barberId: $('barberId').value,
        date: $('date').value,
        excludeId: a?.id,
        durationMin: durationInput.value,
      });
      if (seq !== slotSeq) return;
      if (!res.open) {
        chips.replaceChildren(h('span', { class: 'muted small' }, 'The shop is closed on this day.'));
        chipsNote.textContent = 'You can still enter a time manually — you’ll be asked to confirm.';
        return;
      }
      const free = res.slots.filter((s) => s.available);
      chips.replaceChildren(
        ...res.slots.map((s) => {
          const chip = h(
            'button',
            {
              type: 'button',
              class: `time-chip${s.time === $('time').value ? ' is-selected' : ''}`,
              disabled: !s.available,
              'aria-pressed': String(s.time === $('time').value),
              'aria-label': `${s.label}${s.available ? '' : ', taken'}`,
              onClick: () => {
                $('time').value = s.time;
                markChips();
              },
            },
            s.label,
          );
          chip.dataset.time = s.time;
          return chip;
        }),
      );
      if (!res.slots.length) chips.replaceChildren(h('span', { class: 'muted small' }, 'No start times fit in today’s hours for this length.'));
      chipsNote.textContent = `${free.length} open · ${fmtDuration(res.duration)} appointment · crossed-out times are taken or blocked`;
    } catch (err) {
      if (seq !== slotSeq) return;
      chips.replaceChildren(h('span', { class: 'field__error' }, err.message));
    }
  }

  function markChips() {
    for (const c of chips.querySelectorAll('.time-chip')) {
      const on = c.dataset.time === $('time').value;
      c.classList.toggle('is-selected', on);
      c.setAttribute('aria-pressed', String(on));
    }
  }

  form.addEventListener('change', (e) => {
    if (['serviceId', 'barberId', 'date', 'durationMin'].includes(e.target.name)) {
      if (e.target.name === 'serviceId') syncDurationPlaceholder();
      loadSlots();
    }
    if (e.target.name === 'time') markChips();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });

  /* Header block for existing appointments */
  let header = null;
  if (editing) {
    const manageUrl = `${location.origin}/appointment/${a.token}`;
    const statusActions = h('div', { class: 'status-row' }, statusBadge(a.status), h('span', { class: 'badge badge--plain' }, a.source === 'online' ? 'Booked online' : 'Added by staff'));
    const actionBtns = [];
    const act = (label, status, variant, iconName) =>
      button(label, {
        variant,
        size: 'sm',
        iconName,
        onClick: async () => {
          const updated = await changeStatus(a, status);
          if (updated) {
            m.close();
            onSaved?.(updated);
          }
        },
      });
    if (a.status === 'booked') {
      actionBtns.push(act('Mark completed', 'completed', 'ok', 'check'), act('No-show', 'no_show', 'secondary', 'ban'), act('Cancel', 'cancelled', 'danger', 'close'));
    } else {
      actionBtns.push(act('Restore to booked', 'booked', 'secondary', 'undo'));
    }
    header = h(
      'div',
      null,
      statusActions,
      h(
        'dl',
        { class: 'detail-grid' },
        h('div', null, h('dt', null, 'Reference'), h('dd', null, a.reference)),
        h('div', null, h('dt', null, 'When'), h('dd', null, `${fmtDateLong(a.date)}, ${fmtTime(a.start)}–${fmtTime(a.end)}`)),
        a.priceCents != null ? h('div', null, h('dt', null, 'Price'), h('dd', null, fmtPrice(a.priceCents))) : null,
        h('div', null, h('dt', null, 'Created'), h('dd', null, fmtTimestamp(a.createdAt))),
        a.cancelledAt ? h('div', null, h('dt', null, 'Cancelled'), h('dd', null, `${fmtTimestamp(a.cancelledAt)} by ${a.cancelledBy || '—'}`)) : null,
      ),
      h('div', { class: 'appt__actions', style: { marginTop: 0, marginBottom: '16px' } }, actionBtns),
      h(
        'div',
        { class: 'field', style: { marginBottom: '16px' } },
        h('span', { class: 'field__label' }, 'Customer’s manage-booking link'),
        h(
          'div',
          { class: 'copy-row' },
          h('input', { class: 'input', readOnly: true, value: manageUrl, 'aria-label': 'Manage booking link' }),
          button('', {
            variant: 'secondary',
            iconName: 'copy',
            'aria-label': 'Copy link',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(manageUrl);
                toast('Link copied.');
              } catch {
                toast('Couldn’t copy — select the link and copy it manually.', 'error');
              }
            },
          }),
        ),
      ),
      a.status !== 'cancelled' ? h('h3', { style: { margin: '4px 0 12px', fontSize: '15px' } }, 'Edit details') : null,
    );
    if (a.status === 'cancelled') {
      form.querySelectorAll('input, select, textarea').forEach((el) => (el.disabled = true));
    }
  }

  const saveBtn = button(editing ? 'Save changes' : 'Book appointment', { variant: 'primary', type: 'button', onClick: () => save() });
  if (editing && a.status === 'cancelled') saveBtn.hidden = true;

  const m = modal({
    title: editing ? a.customer.name : 'New appointment',
    subtitle: editing ? `${a.serviceName} with ${a.barberName}` : 'Book a walk-in, phone or in-person appointment.',
    body: h('div', null, header, form),
    actions: [button(editing ? 'Close' : 'Cancel', { variant: 'ghost', onClick: () => m.close() }), saveBtn],
  });

  loadSlots();

  async function save(override = false) {
    const data = readForm(form);
    const fields = {};
    if (!data.date) fields.date = 'Choose a date.';
    if (!data.time) fields.time = 'Pick a time.';
    if (!data.customerName.trim()) fields.customerName = 'Enter the customer’s name.';
    if (!data.customerPhone.trim()) fields.customerPhone = 'Enter a phone number.';
    showFieldErrors(form, fields);
    if (Object.keys(fields).length) return;
    m.setError('');

    const payload = {
      serviceId: Number(data.serviceId),
      barberId: Number(data.barberId),
      date: data.date,
      time: data.time.slice(0, 5),
      durationMin: data.durationMin ? Number(data.durationMin) : null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      notes: data.notes,
      override,
    };
    await withBusy(saveBtn, async () => {
      try {
        const res = editing ? await patch(`/appointments/${a.id}`, payload) : await post('/appointments', payload);
        toast(editing ? 'Appointment updated.' : 'Appointment booked.');
        m.close();
        onSaved?.(res.appointment);
      } catch (err) {
        if (err.code === 'OUTSIDE_AVAILABILITY') {
          const ok = await confirmDialog({
            title: 'Outside normal availability',
            message: `${err.message} Book it anyway?`,
            confirmLabel: 'Book anyway',
          });
          if (ok) await save(true);
          return;
        }
        if (err.code === 'VALIDATION') showFieldErrors(form, err.fields);
        m.setError(err.message);
        if (err.code === 'BARBER_BUSY' || err.code === 'SLOT_TAKEN') loadSlots();
      }
    });
  }

  return m;
}

