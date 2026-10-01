/**
 * Booking flow: Service → Barber → Date → Time → Details → Confirmation.
 * Renders into the <dialog data-booking> shell that the server includes on every page.
 */
import { $, $$, api, ApiError, esc, formatDate, formatDateLong, icon, prefersReducedMotion, wait } from './lib.js';

const STEP_META = {
  service: { title: 'Choose a service' },
  barber: { title: 'Choose a barber' },
  date: { title: 'Pick a date' },
  time: { title: 'Pick a time' },
  details: { title: 'Your details' },
  done: { title: 'You’re booked' },
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function initBooking({ data: embedded }) {
  const dialog = $('[data-booking]');
  if (!dialog) return null;

  const el = {
    panel: $('.booking__panel', dialog),
    body: $('[data-booking-body]', dialog),
    title: $('[data-booking-title]', dialog),
    step: $('[data-booking-step]', dialog),
    progress: $('[data-booking-progress]', dialog),
    back: $('[data-booking-back]', dialog),
    close: $('[data-booking-close]', dialog),
    footer: $('[data-booking-footer]', dialog),
    summary: $('[data-booking-summary]', dialog),
    next: $('[data-booking-next]', dialog),
    announcer: $('[data-booking-announcer]', dialog),
  };

  let data = embedded;
  let isOpen = false;
  let ignorePop = false;
  let trigger = null;
  let lastPointer = 0;
  let renderToken = 0;
  const calendarCache = new Map();

  const state = freshState();

  function freshState() {
    return {
      step: 'service',
      serviceId: null,
      barberId: undefined, // null = any barber
      date: null,
      time: null,
      timeLabel: '',
      month: null,
      details: { name: '', phone: '', email: '', notes: '' },
      touched: {},
      notice: '',
      result: null,
      emailQueued: false,
      submitting: false,
    };
  }

  const resetState = () => Object.assign(state, freshState());

  /* ------------------------------------------------------------------ */
  /* Data                                                               */
  /* ------------------------------------------------------------------ */

  async function ensureData() {
    if (data) return data;
    data = await api('/api/booking/options');
    return data;
  }

  const service = () => data?.services.find((s) => s.id === state.serviceId) ?? null;
  const barberName = () => {
    if (state.barberId === null) return 'Any available barber';
    return data?.barbers.find((b) => b.id === state.barberId)?.name ?? '';
  };
  const skipBarberStep = () => (data?.barbers.length ?? 0) <= 1;

  function steps() {
    return skipBarberStep() ? ['service', 'date', 'time', 'details'] : ['service', 'barber', 'date', 'time', 'details'];
  }

  function barberParam() {
    return state.barberId ? `&barberId=${state.barberId}` : '';
  }

  /* ------------------------------------------------------------------ */
  /* Open / close                                                       */
  /* ------------------------------------------------------------------ */

  async function open({ service: slug = null, trigger: from = null } = {}) {
    trigger = from || document.activeElement;
    if (!isOpen) {
      isOpen = true;
      if (!history.state?.bookingOpen) history.pushState({ bookingOpen: true }, '', `${location.pathname}${location.search}#book`);
      dialog.showModal();
      document.documentElement.classList.add('is-locked');
      requestAnimationFrame(() => dialog.classList.add('is-open'));
    }

    if (state.step === 'done') resetState();
    el.body.innerHTML = `<div class="state" role="status"><span class="spinner" aria-hidden="true"></span><p class="state__text">Loading…</p></div>`;
    try {
      await ensureData();
    } catch (err) {
      return renderFatal(err.message);
    }
    if (!data.booking.enabled) return renderPaused();
    if (!data.services.length || !data.barbers.length) return renderPaused();

    if (skipBarberStep()) state.barberId = data.barbers.length === 1 ? data.barbers[0].id : null;

    if (slug) {
      const match = data.services.find((s) => s.slug === slug);
      if (match) {
        if (match.id !== state.serviceId) clearAfterService();
        state.serviceId = match.id;
        go(steps()[1]);
        return;
      }
    }
    go(state.step);
  }

  async function close({ fromPop = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    dialog.classList.remove('is-open');
    if (!fromPop && history.state?.bookingOpen) {
      ignorePop = true;
      history.back(); // normalizeUrl() runs once the back navigation lands
    } else {
      normalizeUrl();
    }
    await wait(prefersReducedMotion() ? 0 : 280);
    dialog.close();
    document.documentElement.classList.remove('is-locked');
    if (state.step === 'done') resetState();
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }

  // /book is a shareable deep link; once the modal closes, show the clean home URL.
  function normalizeUrl() {
    if (location.pathname === '/book') history.replaceState(null, '', '/');
  }

  window.addEventListener('popstate', () => {
    if (ignorePop) {
      ignorePop = false;
      normalizeUrl();
      return;
    }
    if (isOpen) close({ fromPop: true });
  });

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  el.close.addEventListener('click', () => close());
  el.back.addEventListener('click', () => goBack());
  el.next.addEventListener('click', () => onNext());
  dialog.addEventListener('pointerdown', () => {
    lastPointer = Date.now();
  });

  const fromPointer = () => Date.now() - lastPointer < 700;

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */

  function go(step, { back = false } = {}) {
    state.step = step;
    const list = steps();
    const index = list.indexOf(step);
    const meta = STEP_META[step];
    el.title.textContent = meta.title;
    el.step.textContent = step === 'done' ? 'Confirmed' : `Step ${index + 1} of ${list.length}`;
    el.progress.style.width = step === 'done' ? '100%' : `${((index + 1) / (list.length + 1)) * 100}%`;
    el.back.hidden = index <= 0 || step === 'done';
    el.footer.hidden = step === 'done';
    renderToken++;
    // Step renderers attach delegated listeners to the body; drop the previous step's.
    el.body.removeEventListener('change', onServiceChange);
    el.body.removeEventListener('change', onBarberChange);
    const render = { service: renderService, barber: renderBarber, date: renderDate, time: renderTime, details: renderDetails, done: renderDone }[step];
    render({ back });
    bindRetry();
    updateFooter();
    el.body.scrollTop = 0;
    // Move focus to the step heading so keyboard and screen reader users land in the right place.
    el.title.focus({ preventScroll: true });
  }

  function goBack() {
    const list = steps();
    const i = list.indexOf(state.step);
    if (i > 0) go(list[i - 1], { back: true });
  }

  function canContinue() {
    switch (state.step) {
      case 'service':
        return state.serviceId != null;
      case 'barber':
        return state.barberId !== undefined;
      case 'date':
        return !!state.date;
      case 'time':
        return !!state.time;
      case 'details':
        return !state.submitting;
      default:
        return false;
    }
  }

  function onNext() {
    if (!canContinue()) return;
    if (state.step === 'details') {
      $('form', el.body)?.requestSubmit();
      return;
    }
    const list = steps();
    go(list[list.indexOf(state.step) + 1]);
  }

  function autoAdvance(expectedStep) {
    if (!fromPointer()) return;
    setTimeout(() => {
      if (state.step === expectedStep && isOpen && canContinue()) onNext();
    }, prefersReducedMotion() ? 0 : 320);
  }

  function updateFooter() {
    const s = service();
    const parts = [];
    if (state.barberId !== undefined && !skipBarberStep()) parts.push(state.barberId === null ? 'Any barber' : barberName());
    if (state.date) parts.push(formatDate(state.date));
    if (state.time) parts.push(state.timeLabel);
    el.summary.innerHTML = s
      ? `<strong>${esc(s.name)}</strong><span>${esc(parts.join(' · ') || [s.duration, s.price].filter(Boolean).join(' · ') || 'Select options to continue')}</span>`
      : `<span>Select a service to get started</span>`;
    const isDetails = state.step === 'details';
    el.next.disabled = !canContinue();
    el.next.classList.toggle('is-loading', state.submitting);
    el.next.innerHTML = state.submitting
      ? `<span class="spinner" aria-hidden="true"></span><span>Booking…</span>`
      : `<span>${isDetails ? 'Confirm Booking' : 'Continue'}</span>${icon(isDetails ? 'check' : 'arrow-right', 'btn__arrow')}`;
  }

  function stepWrap(inner, back) {
    return `<div class="step${back ? ' is-back' : ''}">${inner}</div>`;
  }

  function clearAfterService() {
    state.date = null;
    state.time = null;
    state.timeLabel = '';
    state.month = null;
  }

  function announce(msg) {
    el.announcer.textContent = '';
    setTimeout(() => {
      el.announcer.textContent = msg;
    }, 50);
  }

  /* ------------------------------------------------------------------ */
  /* Step 1 — Service                                                   */
  /* ------------------------------------------------------------------ */

  function renderService({ back }) {
    const groups = Object.entries(data.categories)
      .map(([key, label]) => ({ key, label, items: data.services.filter((s) => s.category === key) }))
      .filter((g) => g.items.length);
    el.body.innerHTML = stepWrap(
      `<p class="step__intro">What are you coming in for?</p>
      ${groups
        .map(
          (g) => `<div class="option-group" role="radiogroup" aria-labelledby="bk-grp-${g.key}">
            <h3 class="option-group__title" id="bk-grp-${g.key}">${esc(g.label)}</h3>
            <div class="option-list">
              ${g.items
                .map(
                  (s) => `<label class="option${s.id === state.serviceId ? ' is-selected' : ''}">
                    <input type="radio" name="bk-service" value="${s.id}"${s.id === state.serviceId ? ' checked' : ''}>
                    <span class="option__body">
                      <span class="option__name">${esc(s.name)}</span>
                      <span class="option__desc">${esc(s.description)}</span>
                      ${s.duration || s.price ? `<span class="option__meta">${s.duration ? `<span>${esc(s.duration)}</span>` : ''}${s.price ? `<span class="price">${esc(s.price)}</span>` : ''}</span>` : ''}
                    </span>
                    <span class="option__check">${icon('check')}</span>
                  </label>`,
                )
                .join('')}
            </div>
          </div>`,
        )
        .join('')}`,
      back,
    );
    el.body.addEventListener('change', onServiceChange);
  }

  function onServiceChange(e) {
    if (e.target.name !== 'bk-service') return;
    const id = Number(e.target.value);
    if (id !== state.serviceId) clearAfterService();
    state.serviceId = id;
    markSelected(e.target);
    updateFooter();
    autoAdvance('service');
  }

  function markSelected(input) {
    $$(`input[name="${input.name}"]`, el.body).forEach((r) => r.closest('.option')?.classList.toggle('is-selected', r.checked));
  }

  /* ------------------------------------------------------------------ */
  /* Step 2 — Barber                                                    */
  /* ------------------------------------------------------------------ */

  function renderBarber({ back }) {
    const initials = (name) =>
      name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const option = (value, name, desc, avatar, tag = '') => {
      const selected = state.barberId === value;
      return `<label class="option${selected ? ' is-selected' : ''}">
        <input type="radio" name="bk-barber" value="${value ?? 'any'}"${selected ? ' checked' : ''}>
        <span class="option__avatar" aria-hidden="true">${avatar}</span>
        <span class="option__body">
          <span class="option__name">${esc(name)}${tag ? `<span class="option__tag">${esc(tag)}</span>` : ''}</span>
          ${desc ? `<span class="option__desc">${esc(desc)}</span>` : ''}
        </span>
        <span class="option__check">${icon('check')}</span>
      </label>`;
    };
    el.body.innerHTML = stepWrap(
      `<p class="step__intro">Have a favourite? Pick them — or choose any barber for the most available times.</p>
      <div class="option-list" role="radiogroup" aria-label="Barbers">
        ${option(null, 'Any available barber', 'First available — the quickest way to get booked', icon('users'), 'Fastest')}
        ${data.barbers.map((b) => option(b.id, b.name, b.title, esc(initials(b.name)))).join('')}
      </div>`,
      back,
    );
    el.body.addEventListener('change', onBarberChange);
  }

  function onBarberChange(e) {
    if (e.target.name !== 'bk-barber') return;
    const id = e.target.value === 'any' ? null : Number(e.target.value);
    if (id !== state.barberId) clearAfterService();
    state.barberId = id;
    markSelected(e.target);
    updateFooter();
    autoAdvance('barber');
  }

  /* ------------------------------------------------------------------ */
  /* Step 3 — Date                                                      */
  /* ------------------------------------------------------------------ */

  const monthKey = (date) => date.slice(0, 7);
  const monthStart = (key) => `${key}-01`;
  const monthEnd = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  const shiftMonth = (key, n) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };

  function fetchMonth(key) {
    const cacheKey = `${state.serviceId}|${state.barberId ?? 'any'}|${key}`;
    if (!calendarCache.has(cacheKey)) {
      const promise = api(
        `/api/availability/calendar?serviceId=${state.serviceId}${barberParam()}&from=${monthStart(key)}&to=${monthEnd(key)}`,
      ).catch((err) => {
        calendarCache.delete(cacheKey);
        throw err;
      });
      calendarCache.set(cacheKey, promise);
    }
    return calendarCache.get(cacheKey);
  }

  async function renderDate({ back }) {
    const token = renderToken;
    const key = state.month ?? (state.date ? monthKey(state.date) : null);
    el.body.innerHTML = stepWrap(calendarMarkup(key, null), back);
    let result;
    try {
      // First load: find the current month from the server's idea of "today".
      if (!key) {
        const probe = await fetchMonth(new Date().toISOString().slice(0, 7));
        state.month = monthKey(probe.today);
        result = probe.today.slice(0, 7) === new Date().toISOString().slice(0, 7) ? probe : await fetchMonth(state.month);
      } else {
        state.month = key;
        result = await fetchMonth(key);
      }
    } catch (err) {
      if (token !== renderToken) return;
      el.body.innerHTML = stepWrap(errorState(err.message, 'retry-date'), false);
      bindRetry();
      return;
    }
    if (token !== renderToken) return;

    // If nothing is left this month, jump ahead once so customers see real options.
    if (!state.date && result.days.every((d) => !d.available) && monthStart(shiftMonth(state.month, 1)) <= result.lastDate && !back) {
      const nextKey = shiftMonth(state.month, 1);
      try {
        const next = await fetchMonth(nextKey);
        if (token !== renderToken) return;
        if (next.days.some((d) => d.available)) {
          state.month = nextKey;
          result = next;
        }
      } catch {
        /* keep the current month */
      }
    }
    el.body.innerHTML = stepWrap(calendarMarkup(state.month, result), back);
    bindCalendar(result);
  }

  function calendarMarkup(key, result) {
    const today = result?.today;
    const k = key ?? new Date().toISOString().slice(0, 7);
    const [y, m] = k.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const map = new Map((result?.days ?? []).map((d) => [d.date, d]));
    const canPrev = result && k > today.slice(0, 7);
    const canNext = result && monthStart(shiftMonth(k, 1)) <= result.lastDate;
    const firstAvailable = result?.days.find((d) => d.available);

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${k}-${String(d).padStart(2, '0')}`;
      if (!result) {
        cells += `<span class="cal__day is-loading" aria-hidden="true"></span>`;
        continue;
      }
      const info = map.get(date);
      const available = info?.available ?? 0;
      const disabled = !info || !info.open || available === 0;
      let label = formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' });
      if (!info) label += date < today ? ', past' : ', not yet bookable';
      else if (!info.open) label += ', closed';
      else if (!available) label += ', fully booked';
      else label += `, ${available} time${available === 1 ? '' : 's'} available`;
      const cls = ['cal__day', date === today ? 'is-today' : '', date === state.date ? 'is-selected' : ''].filter(Boolean).join(' ');
      cells += `<button type="button" class="${cls}" data-date="${date}" aria-label="${esc(label)}"${date === state.date ? ' aria-pressed="true"' : ''}${disabled ? ' disabled' : ''}>${d}</button>`;
    }

    return `
      ${firstAvailable && !state.date ? `<div class="notice">${icon('calendar')}<span>Next available: <strong>${esc(firstAvailable.date === today ? 'Today' : formatDate(firstAvailable.date, { weekday: 'long', month: 'short', day: 'numeric' }))}</strong> <button type="button" class="text-btn" data-date-pick="${firstAvailable.date}">Select</button></span></div>` : ''}
      <div class="cal" ${result ? '' : 'aria-busy="true"'}>
        <div class="cal__head">
          <h3 class="cal__month" aria-live="polite">${MONTHS[m - 1]} ${y}</h3>
          <div class="cal__nav">
            <button type="button" class="icon-btn" data-month="-1" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${icon('chevron-left')}</button>
            <button type="button" class="icon-btn" data-month="1" aria-label="Next month"${canNext ? '' : ' disabled'}>${icon('chevron-right')}</button>
          </div>
        </div>
        <div class="cal__grid" role="group" aria-label="${MONTHS[m - 1]} ${y}">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="cal__dow" aria-hidden="true">${d}</span>`).join('')}
          ${cells}
        </div>
        <p class="cal__legend"><span><i></i>Available</span><span><i class="is-off"></i>Closed or fully booked</span></p>
      </div>`;
  }

  function bindCalendar(result) {
    $$('[data-month]', el.body).forEach((btn) =>
      btn.addEventListener('click', () => {
        state.month = shiftMonth(state.month, Number(btn.dataset.month));
        renderToken++;
        renderDate({ back: Number(btn.dataset.month) < 0 });
      }),
    );
    const pick = (date) => {
      if (date !== state.date) {
        state.time = null;
        state.timeLabel = '';
      }
      state.date = date;
      $$('.cal__day', el.body).forEach((b) => b.classList.toggle('is-selected', b.dataset.date === date));
      updateFooter();
      setTimeout(() => state.step === 'date' && go('time'), prefersReducedMotion() ? 0 : 200);
    };
    $$('.cal__day[data-date]:not(:disabled)', el.body).forEach((btn) => btn.addEventListener('click', () => pick(btn.dataset.date)));
    $('[data-date-pick]', el.body)?.addEventListener('click', (e) => {
      const date = e.currentTarget.dataset.datePick;
      if (monthKey(date) !== state.month) state.month = monthKey(date);
      pick(date);
    });
    void result;
  }

  /* ------------------------------------------------------------------ */
  /* Step 4 — Time                                                      */
  /* ------------------------------------------------------------------ */

  async function renderTime({ back }) {
    const token = renderToken;
    const head = `<div class="slots__date">
        <div><strong>${esc(formatDateLong(state.date))}</strong><span>${esc(barberName())}</span></div>
        <button type="button" class="text-btn" data-change-date>Change</button>
      </div>`;
    const notice = state.notice ? `<div class="notice notice--error" role="alert">${icon('alert')}<span>${esc(state.notice)}</span></div>` : '';
    state.notice = '';
    const skeleton = `<div class="slots__group"><div class="slots__grid" aria-hidden="true">${'<span class="slot skeleton"></span>'.repeat(12)}</div></div>`;
    el.body.innerHTML = stepWrap(`${notice}${head}<div data-slots aria-busy="true">${skeleton}</div>`, back);
    bindChangeDate();

    let result;
    try {
      result = await api(`/api/availability/slots?serviceId=${state.serviceId}${barberParam()}&date=${state.date}`);
    } catch (err) {
      if (token !== renderToken) return;
      $('[data-slots]', el.body).outerHTML = errorState(err.message, 'retry-time');
      bindRetry();
      return;
    }
    if (token !== renderToken) return;

    const target = $('[data-slots]', el.body);
    const available = result.slots.filter((s) => s.available);
    if (state.time && !available.some((s) => s.time === state.time)) {
      state.time = null;
      state.timeLabel = '';
      updateFooter();
    }
    if (!available.length) {
      target.outerHTML = `<div class="state">
        <span class="state__icon">${icon('calendar')}</span>
        <p class="state__title">No times left on this day</p>
        <p class="state__text">${result.slots.length ? 'Every slot is booked.' : 'There are no bookable times on this day.'} Try another date${
          state.barberId ? ' or choose “Any available barber”' : ''
        }.</p>
        <div class="state__actions"><button type="button" class="btn btn--primary btn--sm" data-change-date>Choose another date</button></div>
      </div>`;
      bindChangeDate();
      return;
    }

    const groups = [
      ['Morning', (m) => m < 12 * 60],
      ['Afternoon', (m) => m >= 12 * 60 && m < 17 * 60],
      ['Evening', (m) => m >= 17 * 60],
    ];
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    target.outerHTML = `<div data-slots>${groups
      .map(([label, test]) => {
        const items = result.slots.filter((s) => test(toMin(s.time)));
        if (!items.length) return '';
        return `<div class="slots__group" role="group" aria-label="${label}">
          <h3 class="slots__group-title">${label}</h3>
          <div class="slots__grid">
            ${items
              .map(
                (s) =>
                  `<button type="button" class="slot${s.time === state.time ? ' is-selected' : ''}" data-time="${s.time}" data-label="${esc(s.label)}"
                    aria-pressed="${s.time === state.time}"${s.available ? '' : ` disabled aria-label="${esc(s.label)}, unavailable"`}>${esc(s.label)}</button>`,
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('')}
      <p class="slots__legend">${available.length} time${available.length === 1 ? '' : 's'} available · Times are local to ${esc(timezoneLabel())}</p>
    </div>`;

    $$('.slot[data-time]:not(:disabled)', el.body).forEach((btn) =>
      btn.addEventListener('click', () => {
        state.time = btn.dataset.time;
        state.timeLabel = btn.dataset.label;
        $$('.slot', el.body).forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-pressed', String(on));
        });
        updateFooter();
        autoAdvance('time');
      }),
    );
  }

  function timezoneLabel() {
    return data?.timezone === 'America/Edmonton' ? 'Grande Prairie (Mountain Time)' : 'the shop’s timezone';
  }

  function bindChangeDate() {
    $$('[data-change-date]', el.body).forEach((b) => b.addEventListener('click', () => go('date', { back: true })));
  }

  /* ------------------------------------------------------------------ */
  /* Step 5 — Details                                                   */
  /* ------------------------------------------------------------------ */

  function renderDetails({ back }) {
    const s = service();
    const d = state.details;
    const rows = [
      ['Service', s.name],
      ...(!skipBarberStep() || state.barberId ? [['Barber', barberName()]] : []),
      ['Date', formatDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' })],
      ['Time', state.timeLabel],
      ...(s.duration ? [['Duration', s.duration]] : []),
      ...(s.price ? [['Price', s.price]] : []),
    ];
    const field = (name, label, attrs, { full = false, optional = false, textarea = false } = {}) => `
      <div class="field${full ? ' field--full' : ''}">
        <label for="bk-${name}">${label}${optional ? ' <span class="field__opt">(optional)</span>' : ''}</label>
        ${
          textarea
            ? `<textarea class="input" id="bk-${name}" name="${name}" ${attrs} aria-describedby="bk-${name}-err">${esc(d[name])}</textarea>`
            : `<input class="input" id="bk-${name}" name="${name}" value="${esc(d[name])}" ${attrs} aria-describedby="bk-${name}-err">`
        }
        <p class="field__error" id="bk-${name}-err" hidden></p>
      </div>`;

    el.body.innerHTML = stepWrap(
      `<dl class="summary-card">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <form class="booking-form" novalidate>
        <div class="form-alert" data-form-alert hidden></div>
        <div class="form-grid form-grid--2">
          ${field('name', 'Full name', 'type="text" autocomplete="name" maxlength="80" required autocapitalize="words"', { full: true })}
          ${field('phone', 'Phone number', 'type="tel" inputmode="tel" autocomplete="tel" maxlength="30" required placeholder="(780) 555-0123"')}
          ${field('email', 'Email', 'type="email" inputmode="email" autocomplete="email" maxlength="254" required autocapitalize="off" spellcheck="false"')}
          ${field('notes', 'Notes', 'rows="3" maxlength="500" placeholder="Anything your barber should know?"', { full: true, optional: true, textarea: true })}
        </div>
        <div class="hp" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <p class="form-note">We’ll only use your details to confirm and manage this appointment.</p>
        <button type="submit" hidden></button>
      </form>`,
      back,
    );

    const form = $('form', el.body);
    form.addEventListener('input', (e) => {
      if (e.target.name in state.details) {
        state.details[e.target.name] = e.target.value;
        if (state.touched[e.target.name]) showFieldError(e.target.name, validateField(e.target.name));
      }
    });
    form.addEventListener(
      'blur',
      (e) => {
        if (!(e.target.name in state.details)) return;
        state.touched[e.target.name] = true;
        showFieldError(e.target.name, validateField(e.target.name));
      },
      true,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(form);
    });
  }

  function validateField(name) {
    const v = state.details[name].trim();
    switch (name) {
      case 'name':
        if (!v) return 'Please enter your full name.';
        if (v.length < 2) return 'Name must be at least 2 characters.';
        return '';
      case 'phone': {
        if (!v) return 'Please enter your phone number.';
        const digits = v.replace(/\D/g, '');
        if (!/^[+\d\s().-]+$/.test(v) || digits.length < 10 || digits.length > 15) return 'Please enter a valid phone number, including area code.';
        return '';
      }
      case 'email':
        if (!v) return 'Please enter your email for your confirmation.';
        if (!EMAIL_RE.test(v)) return 'Please enter a valid email address.';
        return '';
      case 'notes':
        return v.length > 500 ? 'Notes must be 500 characters or fewer.' : '';
      default:
        return '';
    }
  }

  function showFieldError(name, message) {
    const input = $(`[name="${name}"]`, el.body);
    const err = $(`#bk-${name}-err`, el.body);
    if (!input || !err) return;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    err.hidden = !message;
    err.innerHTML = message ? `${icon('alert')}<span>${esc(message)}</span>` : '';
  }

  function showFormAlert(message, { call = false } = {}) {
    const box = $('[data-form-alert]', el.body);
    if (!box) return;
    box.hidden = !message;
    box.className = 'notice notice--error';
    box.setAttribute('role', 'alert');
    box.innerHTML = message
      ? `${icon('alert')}<span>${esc(message)}${call && data?.phone ? ` You can also call us at <a href="tel:${esc(data.phone.replace(/[^\d+]/g, ''))}">${esc(data.phone)}</a>.` : ''}</span>`
      : '';
    if (message) box.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  async function submit(form) {
    if (state.submitting) return;
    const fields = ['name', 'phone', 'email', 'notes'];
    let firstInvalid = null;
    for (const f of fields) {
      state.touched[f] = true;
      const msg = validateField(f);
      showFieldError(f, msg);
      if (msg && !firstInvalid) firstInvalid = f;
    }
    if (firstInvalid) {
      showFormAlert('');
      $(`[name="${firstInvalid}"]`, form).focus();
      announce('Please fix the highlighted fields.');
      return;
    }

    state.submitting = true;
    showFormAlert('');
    updateFooter();
    try {
      const res = await api('/api/bookings', {
        method: 'POST',
        body: {
          serviceId: state.serviceId,
          barberId: state.barberId ?? 'any',
          date: state.date,
          time: state.time,
          name: state.details.name.trim(),
          phone: state.details.phone.trim(),
          email: state.details.email.trim(),
          notes: state.details.notes.trim(),
          website: form.elements.website?.value ?? '',
        },
      });
      state.result = res.appointment;
      state.emailQueued = res.emailQueued;
      state.submitting = false;
      calendarCache.clear();
      go('done');
      announce('Appointment confirmed.');
    } catch (err) {
      state.submitting = false;
      updateFooter();
      handleSubmitError(err);
    }
  }

  function handleSubmitError(err) {
    const code = err instanceof ApiError ? err.data.code : null;
    if (code === 'SLOT_TAKEN') {
      calendarCache.clear();
      state.time = null;
      state.timeLabel = '';
      state.notice = err.message;
      go('time', { back: true });
      announce(err.message);
      return;
    }
    if (code === 'SERVICE_UNAVAILABLE' || code === 'BARBER_UNAVAILABLE') {
      data = null; // refresh options next time
      showFormAlert(err.message, { call: true });
      return;
    }
    if (code === 'VALIDATION' && err.data.fields) {
      const known = ['name', 'phone', 'email', 'notes'];
      let focused = false;
      for (const [k, msg] of Object.entries(err.data.fields)) {
        if (known.includes(k)) {
          showFieldError(k, msg);
          if (!focused) {
            $(`[name="${k}"]`, el.body)?.focus();
            focused = true;
          }
        }
      }
      showFormAlert(err.message);
      return;
    }
    showFormAlert(err.message, { call: true });
  }

  /* ------------------------------------------------------------------ */
  /* Step 6 — Confirmation                                              */
  /* ------------------------------------------------------------------ */

  function renderDone() {
    const r = state.result;
    const first = r.customerName.split(' ')[0];
    const rows = [
      ['Service', r.serviceName],
      ['Barber', r.barberName],
      ['Date', r.dateLabel],
      ['Time', r.timeLabel],
      ['Name', r.customerName],
      ['Reference', r.reference],
    ];
    el.body.innerHTML = `<div class="step confirm">
      <div class="confirm__mark" aria-hidden="true">
        <svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="43"></circle><path d="M29 47.5l11.5 11.5L64 35.5"></path></svg>
      </div>
      <h3 class="confirm__title">Appointment Confirmed</h3>
      <p class="confirm__text">Thanks, ${esc(first)} — you’re booked in.${
        state.emailQueued ? ` A confirmation is on its way to <strong>${esc(r.customerEmail)}</strong>.` : ' Save your details below.'
      }</p>
      <dl class="detail-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="confirm__actions">
        <a class="btn btn--outline" href="${esc(r.calendarUrl)}" download>${icon('calendar')}<span>Add to Calendar</span></a>
        <a class="btn btn--outline" href="${esc(r.manageUrl)}">${icon('external')}<span>Manage Booking</span></a>
        <button type="button" class="btn btn--primary" data-done><span>Done</span></button>
      </div>
    </div>`;
    $('[data-done]', el.body).addEventListener('click', () => close());
  }

  /* ------------------------------------------------------------------ */
  /* Error / paused states                                              */
  /* ------------------------------------------------------------------ */

  function callLink() {
    return data?.phone
      ? `<a class="btn btn--outline btn--sm" href="tel:${esc(data.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span>Call ${esc(data.phone)}</span></a>`
      : '';
  }

  function errorState(message, action) {
    return `<div class="state" role="alert">
      <span class="state__icon">${icon('alert')}</span>
      <p class="state__title">Couldn’t load availability</p>
      <p class="state__text">${esc(message)}</p>
      <div class="state__actions"><button type="button" class="btn btn--primary btn--sm" data-retry="${action}">${icon('refresh')}<span>Try again</span></button>${callLink()}</div>
    </div>`;
  }

  function bindRetry() {
    $$('[data-retry]', el.body).forEach((b) => b.addEventListener('click', () => go(state.step)));
  }

  function renderFatal(message) {
    el.title.textContent = 'Book an appointment';
    el.step.textContent = '';
    el.footer.hidden = true;
    el.back.hidden = true;
    el.body.innerHTML = errorState(message, 'retry-open');
    $('[data-retry]', el.body).addEventListener('click', () => open());
  }

  function renderPaused() {
    el.title.textContent = 'Book an appointment';
    el.step.textContent = '';
    el.footer.hidden = true;
    el.back.hidden = true;
    el.body.innerHTML = `<div class="state">
      <span class="state__icon">${icon('phone')}</span>
      <p class="state__title">Online booking is paused</p>
      <p class="state__text">We’re not taking online bookings right now. Give us a call and we’ll get you in.</p>
      <div class="state__actions">${callLink()}</div>
    </div>`;
  }

  return { open, close };
}
