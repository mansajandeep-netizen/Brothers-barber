import { get } from '../api.js';
import { state, today, nowMinutes } from '../state.js';
import {
  h,
  icon,
  button,
  empty,
  loading,
  errorState,
  statusBadge,
  fmtDate,
  fmtDateLong,
  fmtTime,
  addDays,
  startOfWeek,
  dayOfWeek,
  minToTime,
  initials,
  DAY_SHORT,
  STATUS_LABELS,
} from '../ui.js';
import { appointmentItem, cardWith } from './shared.js';
import { openAppointmentEditor } from './appointment-editor.js';

const PX_PER_MIN = 1.5;

export async function render(ctx) {
  const { el, query, navigate } = ctx;
  const view = ['day', 'week', 'list'].includes(query.view) ? query.view : 'day';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : today();
  const barber = query.barber || '';
  const status = query.status || '';
  const q = query.q || '';
  const go = (patch) => navigate('appointments', { view, date, barber, status, q, ...patch });

  /* ---------------- toolbar ---------------- */
  const seg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'View' },
    ['day', 'week', 'list'].map((v) =>
      h('button', { type: 'button', 'aria-pressed': String(v === view), onClick: () => go({ view: v }) }, v[0].toUpperCase() + v.slice(1)),
    ),
  );

  const step = view === 'week' ? 7 : 1;
  const label =
    view === 'week'
      ? `${fmtDate(startOfWeek(date), { month: 'short', day: 'numeric' })} – ${fmtDate(addDays(startOfWeek(date), 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
      : view === 'day'
        ? fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })
        : `From ${fmtDate(date, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const dateInput = h('input', { class: 'input', type: 'date', value: date, 'aria-label': 'Go to date', style: { width: 'auto' }, onChange: (e) => e.target.value && go({ date: e.target.value }) });

  const dateNav = h(
    'div',
    { class: 'date-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Previous ${view === 'week' ? 'week' : 'day'}`, onClick: () => go({ date: addDays(date, view === 'list' ? -30 : -step) }) }, icon('chevron-left')),
    button('Today', { variant: 'secondary', size: 'sm', onClick: () => go({ date: today() }) }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Next ${view === 'week' ? 'week' : 'day'}`, onClick: () => go({ date: addDays(date, view === 'list' ? 30 : step) }) }, icon('chevron-right')),
    h('span', { class: 'date-nav__label' }, label),
  );

  const barberSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Filter by stylist', style: { width: 'auto' }, onChange: (e) => go({ barber: e.target.value }) },
    h('option', { value: '' }, 'All stylists'),
    state.barbers.map((b) => h('option', { value: b.id, selected: String(b.id) === barber }, b.name)),
  );

  const extra = [];
  if (view === 'list') {
    extra.push(
      h(
        'select',
        { class: 'select', 'aria-label': 'Filter by status', style: { width: 'auto' }, onChange: (e) => go({ status: e.target.value }) },
        h('option', { value: '' }, 'All statuses'),
        Object.entries(STATUS_LABELS).map(([k, v]) => h('option', { value: k, selected: k === status }, v)),
      ),
    );
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search name, phone, email, ref…', value: q, 'aria-label': 'Search appointments', style: { width: '240px', maxWidth: '100%' } });
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => go({ q: search.value.trim() }), 350);
    });
    extra.push(search);
  }

  el.replaceChildren(
    h('div', { class: 'toolbar' }, seg, dateNav, h('span', { class: 'toolbar__spacer' }), dateInput, barberSelect, extra),
  );
  const body = h('div');
  el.append(body);
  body.append(h('div', { class: 'card' }, loading(4)));

  const refresh = () => ctx.refresh();
  try {
    if (view === 'day') await renderDay(body, { date, barber, refresh, go });
    else if (view === 'week') await renderWeek(body, { date, barber, refresh, go });
    else await renderList(body, { date, barber, status, q, refresh });
  } catch (err) {
    if (!ctx.isCurrent()) return;
    body.replaceChildren(h('div', { class: 'card' }, errorState(err, refresh)));
  }

  // Keep search focus when results re-render.
  if (view === 'list' && q) {
    const s = el.querySelector('input[type=search]');
    s?.focus();
    s?.setSelectionRange(s.value.length, s.value.length);
  }
}

/* ------------------------------------------------------------------ */
/* Day                                                                 */
/* ------------------------------------------------------------------ */

async function renderDay(body, { date, barber, refresh }) {
  const data = await get('/schedule', { date });
  const dow = dayOfWeek(date);
  const hours = data.hours.find((x) => x.day === dow);
  const appts = data.appointments.filter((a) => a.date === date && (!barber || String(a.barberId) === barber));
  const blocks = data.blocks.filter((b) => b.dateFrom <= date && b.dateTo >= date);
  let barbers = state.barbers.filter((b) => !barber || String(b.id) === barber);
  // Include removed barbers who still have appointments on this day.
  for (const a of appts) {
    if (!barbers.some((b) => b.id === a.barberId) && (!barber || String(a.barberId) === barber)) {
      barbers.push({ id: a.barberId, name: a.barberName, title: 'Removed', workDays: [] });
    }
  }

  const active = appts.filter((a) => a.status !== 'cancelled');
  const cancelled = appts.length - active.length;
  const newAt = (time, barberId) => openAppointmentEditor({ preset: { date, time, barberId }, onSaved: refresh });

  /* Mobile list */
  const mobile = h(
    'div',
    { class: 'day-mobile' },
    cardWith(
      fmtDateLong(date),
      hours?.isOpen ? `Open ${fmtTime(minToTime(hours.open))} – ${fmtTime(minToTime(hours.close))} · ${active.length} booked` : 'Closed',
      appts.length
        ? h('ul', { class: 'appt-list' }, appts.map((a) => appointmentItem(a, { onChange: refresh })))
        : empty({ title: 'No appointments', text: hours?.isOpen ? 'Nothing booked for this day yet.' : 'The shop is closed this day.', action: button('New appointment', { variant: 'primary', size: 'sm', iconName: 'plus', onClick: () => newAt('', barber ? Number(barber) : undefined) }) }),
    ),
  );

  /* Desktop timeline */
  const open = hours?.isOpen ? hours.open : 9 * 60;
  const close = hours?.isOpen ? hours.close : 17 * 60;
  let start = Math.min(open, ...active.map((a) => a.startMin));
  let end = Math.max(close, ...active.map((a) => a.endMin));
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  const height = (end - start) * PX_PER_MIN;
  const y = (min) => (min - start) * PX_PER_MIN;

  const hourLabels = h('div', { class: 'timeline__hours', style: { height: `${height}px` } });
  for (let m = start; m < end; m += 60) hourLabels.append(h('div', { class: 'timeline__hour' }, fmtTime(minToTime(m))));

  const isToday = date === today();
  const nowMin = nowMinutes();

  const columns = barbers.map((b) => {
    const col = h('div', { class: 'timeline__col', style: { height: `${height}px` } });
    const works = !b.workDays || b.workDays.length === 0 || b.workDays.includes(dow);
    // Closed / off overlays
    if (!hours?.isOpen || !works) col.append(h('div', { class: 'timeline__closed', style: { top: 0, height: `${height}px` } }));
    else {
      if (open > start) col.append(h('div', { class: 'timeline__closed', style: { top: 0, height: `${y(open)}px` } }));
      if (close < end) col.append(h('div', { class: 'timeline__closed', style: { top: `${y(close)}px`, height: `${(end - close) * PX_PER_MIN}px` } }));
    }
    // Click-to-book cells
    for (let m = start; m < end; m += 30) {
      col.append(
        h('button', {
          type: 'button',
          class: 'timeline__slot',
          style: { top: `${y(m)}px`, height: `${30 * PX_PER_MIN}px` },
          'aria-label': `New appointment with ${b.name} at ${fmtTime(minToTime(m))}`,
          onClick: () => newAt(minToTime(m), b.id),
        }),
      );
    }
    for (const bl of blocks.filter((x) => x.barberId == null || x.barberId === b.id)) {
      const s = Math.max(bl.startMin, start);
      const e = Math.min(bl.endMin, end);
      if (e <= s) continue;
      col.append(h('div', { class: 'timeline__block', style: { top: `${y(s)}px`, height: `${(e - s) * PX_PER_MIN - 2}px` } }, icon('ban'), ` ${bl.reason || 'Blocked'}`));
    }
    for (const a of active.filter((x) => x.barberId === b.id)) {
      col.append(
        h(
          'button',
          {
            type: 'button',
            class: `timeline__appt is-${a.status}`,
            style: { top: `${y(a.startMin) + 1}px`, height: `${Math.max(a.durationMin * PX_PER_MIN - 2, 24)}px` },
            onClick: () => openAppointmentEditor({ appointment: a, onSaved: refresh }),
            'aria-label': `${fmtTime(a.start)} ${a.customer.name}, ${a.serviceName}, ${STATUS_LABELS[a.status]}`,
          },
          h('strong', null, `${fmtTime(a.start)} · ${a.customer.name}`),
          h('span', null, a.serviceName),
          a.durationMin >= 45 ? h('span', null, a.customer.phone) : null,
        ),
      );
    }
    if (isToday && nowMin >= start && nowMin <= end) col.append(h('div', { class: 'timeline__now', style: { top: `${y(nowMin)}px` }, 'aria-hidden': 'true' }));
    return col;
  });

  const heads = barbers.map((b) => {
    const count = active.filter((a) => a.barberId === b.id).length;
    return h('div', { class: 'timeline__head' }, b.name, h('small', null, `${count} appointment${count === 1 ? '' : 's'}`));
  });

  const timeline = barbers.length
    ? h(
        'div',
        { class: 'timeline' },
        h('div', { class: 'timeline__corner' }),
        heads,
        hourLabels,
        columns,
      )
    : empty({ iconName: 'user', title: 'No stylists yet', text: 'Add a stylist to start taking bookings.' });
  if (barbers.length) {
    timeline.style.setProperty('--cols', barbers.length);
    timeline.style.setProperty('--slot-h', `${30 * PX_PER_MIN}px`);
  }

  const desktop = h(
    'div',
    { class: 'day-desktop' },
    cardWith(
      fmtDateLong(date),
      `${hours?.isOpen ? `Open ${fmtTime(minToTime(hours.open))} – ${fmtTime(minToTime(hours.close))}` : 'Closed'} · ${active.length} booked${cancelled ? ` · ${cancelled} cancelled` : ''} · click an empty slot to add an appointment`,
      h('div', { style: { overflowX: 'auto' } }, timeline),
    ),
  );

  body.replaceChildren(desktop, mobile);
  if (cancelled) {
    body.append(
      h(
        'div',
        { class: 'section-gap day-desktop' },
        cardWith('Cancelled', `${cancelled} on this day`, h('ul', { class: 'appt-list' }, appts.filter((a) => a.status === 'cancelled').map((a) => appointmentItem(a, { onChange: refresh })))),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Week                                                                */
/* ------------------------------------------------------------------ */

async function renderWeek(body, { date, barber, refresh, go }) {
  const data = await get('/schedule', { date });
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(data.from, i));
  const total = data.appointments.filter((a) => a.status !== 'cancelled' && (!barber || String(a.barberId) === barber)).length;

  const cols = days.map((d) => {
    const dow = dayOfWeek(d);
    const hours = data.hours.find((x) => x.day === dow);
    const list = data.appointments.filter((a) => a.date === d && (!barber || String(a.barberId) === barber));
    const activeCount = list.filter((a) => a.status !== 'cancelled').length;
    const dayBlocks = data.blocks.filter((b) => b.dateFrom <= d && b.dateTo >= d && (!barber || b.barberId == null || String(b.barberId) === barber));
    return h(
      'section',
      { class: `week__day${d === t ? ' is-today' : ''}${hours?.isOpen ? '' : ' is-closed'}`, 'aria-label': fmtDateLong(d) },
      h(
        'button',
        { type: 'button', class: 'week__head', onClick: () => go({ view: 'day', date: d }), 'aria-label': `Open ${fmtDateLong(d)}` },
        h('span', null, h('span', { class: 'week__dow' }, DAY_SHORT[dow]), ' ', h('span', { class: 'week__date' }, String(Number(d.slice(8))))),
        h('span', { class: 'week__count' }, hours?.isOpen ? `${activeCount} booked` : 'Closed'),
      ),
      h(
        'div',
        { class: 'week__list' },
        dayBlocks.map((b) => h('div', { class: 'week__empty' }, icon('ban'), ` ${b.barberName ? `${b.barberName}: ` : 'Shop: '}${b.reason || 'Blocked'}${b.allDay ? '' : ` (${fmtTime(b.start)}–${fmtTime(b.end)})`}`)),
        list.length
          ? list.map((a) =>
              h(
                'button',
                { type: 'button', class: `week__appt is-${a.status}`, onClick: () => openAppointmentEditor({ appointment: a, onSaved: refresh }) },
                h('b', null, fmtTime(a.start)),
                ` ${a.customer.name}`,
                h('br'),
                h('span', { class: 'muted' }, `${a.serviceName} · ${initials(a.barberName)}`),
              ),
            )
          : hours?.isOpen
            ? h('div', { class: 'week__empty' }, 'No bookings')
            : null,
      ),
    );
  });

  body.replaceChildren(
    h('p', { class: 'muted small', style: { margin: '0 0 12px' } }, `${total} appointment${total === 1 ? '' : 's'} this week. Click a day for the full timeline.`),
    h('div', { class: 'week' }, cols),
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

async function renderList(body, { date, barber, status, q, refresh }) {
  const to = addDays(date, 30);
  const data = await get('/appointments', { from: date, to, barberId: barber, status, q });
  const list = data.appointments;
  body.replaceChildren(
    cardWith(
      `${list.length} appointment${list.length === 1 ? '' : 's'}`,
      `${fmtDate(date, { month: 'long', day: 'numeric' })} – ${fmtDate(to, { month: 'long', day: 'numeric', year: 'numeric' })}${q ? ` · matching “${q}”` : ''}`,
      list.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table table--stack' },
              h('thead', null, h('tr', null, ['When', 'Customer', 'Service', 'Stylist', 'Status', ''].map((t) => h('th', { scope: 'col' }, t)))),
              h(
                'tbody',
                null,
                list.map((a) =>
                  h(
                    'tr',
                    { class: 'is-clickable', onClick: (e) => !e.target.closest('a,button') && openAppointmentEditor({ appointment: a, onSaved: refresh }) },
                    h('td', null, h('span', { class: 'cell-title' }, fmtDate(a.date)), h('span', { class: 'cell-sub' }, `${fmtTime(a.start)} · ${a.durationMin} min`)),
                    h('td', null, h('span', { class: 'cell-title' }, a.customer.name), h('span', { class: 'cell-sub' }, a.customer.phone)),
                    h('td', { 'data-label': 'Service' }, a.serviceName),
                    h('td', { 'data-label': 'Stylist' }, a.barberName),
                    h('td', null, statusBadge(a.status)),
                    h('td', { class: 'actions' }, button('Details', { variant: 'ghost', size: 'xs', iconName: 'edit', onClick: () => openAppointmentEditor({ appointment: a, onSaved: refresh }) })),
                  ),
                ),
              ),
            ),
          )
        : empty({ iconName: 'search', title: q ? 'No matches' : 'No appointments in this range', text: q ? 'Try a different name, phone number or reference.' : 'Try another date range or filter.' }),
    ),
  );
}

