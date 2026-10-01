import { h, button, statusBadge, fmtTime, fmtDate, telHref } from '../ui.js';
import { changeStatus, openAppointmentEditor } from './appointment-editor.js';

/** One appointment row with quick actions. `onChange` runs after any update. */
export function appointmentItem(appt, { onChange, showDate = false, compactActions = false } = {}) {
  const open = () => openAppointmentEditor({ appointment: appt, onSaved: onChange });
  const quick = async (status) => {
    const updated = await changeStatus(appt, status);
    if (updated) onChange?.(updated);
  };
  const actions = [];
  if (appt.status === 'booked') {
    actions.push(
      button('Complete', { variant: 'ok', size: 'xs', iconName: 'check', onClick: () => quick('completed') }),
      compactActions ? null : button('No-show', { variant: 'secondary', size: 'xs', onClick: () => quick('no_show') }),
      button('Cancel', { variant: 'danger', size: 'xs', onClick: () => quick('cancelled') }),
    );
  }
  actions.push(button('Details', { variant: 'ghost', size: 'xs', iconName: 'edit', onClick: open }));

  return h(
    'li',
    { class: `appt${appt.status === 'cancelled' ? ' is-cancelled' : ''}` },
    h(
      'div',
      { class: 'appt__time' },
      showDate ? h('small', null, fmtDate(appt.date)) : null,
      fmtTime(appt.start),
      h('small', null, `${appt.durationMin} min`),
    ),
    h(
      'div',
      { class: 'appt__main' },
      h('div', { class: 'appt__top' }, h('button', { type: 'button', class: 'appt__name', onClick: open }, appt.customer.name), statusBadge(appt.status)),
      h(
        'div',
        { class: 'appt__meta' },
        `${appt.serviceName} · ${appt.barberName} · `,
        h('a', { href: telHref(appt.customer.phone) }, appt.customer.phone),
        appt.source === 'online' ? h('span', { class: 'muted' }, ' · online') : null,
      ),
      appt.notes ? h('div', { class: 'appt__notes' }, appt.notes) : null,
      h('div', { class: 'appt__actions' }, actions),
    ),
  );
}

export function cardWith(title, subtitle, body, headExtra = null) {
  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'card__head' }, h('div', null, h('h2', { class: 'card__title' }, title), subtitle ? h('p', { class: 'card__sub' }, subtitle) : null), headExtra),
    body,
  );
}

