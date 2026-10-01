import { get } from '../api.js';
import { state, isOwner, nowMinutes } from '../state.js';
import { h, icon, button, empty, fmtDateLong, fmtDate, fmtTime } from '../ui.js';
import { appointmentItem, cardWith } from './shared.js';
import { openAppointmentEditor } from './appointment-editor.js';

function greeting() {
  const m = nowMinutes();
  if (m < 12 * 60) return 'Good morning';
  if (m < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}

function stat(label, value, meta, iconName, accent = false) {
  return h(
    'div',
    { class: `card stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, icon(iconName), label),
    h('p', { class: 'stat__value' }, String(value)),
    h('div', { class: 'stat__meta' }, meta),
  );
}

export async function render(ctx) {
  const { el, navigate } = ctx;
  const data = await get('/overview');
  if (!ctx.isCurrent()) return;
  const refresh = () => ctx.refresh();
  const s = data.stats;

  const head = h(
    'div',
    { class: 'page__head' },
    h('div', null, h('h2', null, `${greeting()}, ${state.user.name.split(' ')[0]}`), h('p', null, fmtDateLong(data.today))),
    button('View schedule', { variant: 'secondary', size: 'sm', iconName: 'calendar', onClick: () => navigate('appointments', { view: 'day', date: data.today }) }),
  );

  const remaining = data.todays.filter((a) => a.status === 'booked' && a.startMin >= data.nowMin).length;
  const stats = h(
    'div',
    { class: 'stats' },
    stat("Today's appointments", s.today, s.todayCompleted ? `${s.todayCompleted} completed · ${remaining} still to come` : `${remaining} still to come`, 'calendar', true),
    stat('Upcoming', s.upcoming, 'booked from now on', 'clock'),
    stat('Total bookings', s.total, `${s.customers} customer${s.customers === 1 ? '' : 's'}`, 'users'),
    stat('Open slots today', s.openSlotsToday, `across ${state.barbers.filter((b) => b.isActive).length} barber${state.barbers.filter((b) => b.isActive).length === 1 ? '' : 's'}`, 'check'),
  );

  const notices = [];
  if (!data.mail.canSend && isOwner()) {
    notices.push(
      h(
        'div',
        { class: 'alert alert--warn' },
        icon('mail'),
        h('p', null, h('strong', null, 'Confirmation emails aren’t being sent yet. '), 'Bookings still work — connect an email provider (see README) so customers get confirmations automatically.'),
      ),
    );
  }

  const todayList = data.todays.length
    ? h('ul', { class: 'appt-list' }, data.todays.map((a) => appointmentItem(a, { onChange: refresh, compactActions: true })))
    : empty({
        title: 'No appointments today',
        text: 'Online bookings and appointments you add will show up here.',
        action: button('New appointment', { variant: 'primary', size: 'sm', iconName: 'plus', onClick: () => openAppointmentEditor({ onSaved: refresh }) }),
      });

  const upcomingList = data.upcoming.length
    ? h(
        'ul',
        { class: 'appt-list' },
        data.upcoming.map((a) =>
          h(
            'li',
            { class: 'appt' },
            h('div', { class: 'appt__time' }, h('small', null, fmtDate(a.date)), fmtTime(a.start)),
            h(
              'div',
              { class: 'appt__main' },
              h('button', { type: 'button', class: 'appt__name', onClick: () => openAppointmentEditor({ appointment: a, onSaved: refresh }) }, a.customer.name),
              h('div', { class: 'appt__meta' }, `${a.serviceName} · ${a.barberName}`),
            ),
          ),
        ),
      )
    : empty({ iconName: 'clock', title: 'Nothing booked ahead yet', text: 'Share your website so customers can book online.' });

  const side = [cardWith('Coming up', 'Next appointments after today', upcomingList, button('All', { variant: 'ghost', size: 'xs', onClick: () => navigate('appointments', { view: 'list' }) }))];

  if (data.checklist.length) {
    const done = data.checklist.filter((c) => c.done).length;
    if (done < data.checklist.length) {
      side.unshift(
        cardWith(
          'Launch checklist',
          `${done} of ${data.checklist.length} complete`,
          h(
            'div',
            null,
            h('div', { style: { padding: '0 20px 6px' } }, h('div', { class: 'progress' }, h('span', { style: { width: `${(done / data.checklist.length) * 100}%` } }))),
            h(
              'ul',
              { class: 'checklist' },
              data.checklist.map((c) =>
                h(
                  'li',
                  { class: c.done ? 'is-done' : '' },
                  h('span', { class: 'checklist__mark', 'aria-hidden': 'true' }, c.done ? icon('check') : null),
                  h('span', null, h('span', { class: 'checklist__label' }, c.label, h('span', { class: 'visually-hidden' }, c.done ? ' (done)' : ' (to do)')), !c.done && c.hint ? h('span', { class: 'checklist__hint' }, c.hint) : null),
                  !c.done && c.link ? h('a', { class: 'btn btn--secondary btn--xs', href: c.link }, 'Open') : h('span'),
                ),
              ),
            ),
          ),
        ),
      );
    }
  }

  el.replaceChildren(
    head,
    ...notices.map((n) => h('div', { style: { marginBottom: '16px' } }, n)),
    stats,
    h('div', { class: 'grid grid--2-1' }, cardWith("Today's schedule", fmtDateLong(data.today), todayList), h('div', { class: 'stack' }, side)),
  );
}
