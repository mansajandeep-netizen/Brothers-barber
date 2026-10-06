/** Admin UI toolkit: DOM builder, icons, modals, toasts, form fields and formatters. */

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate', 'hidden', 'multiple', 'required', 'readOnly']);

/** Safe DOM builder: text children are always text nodes, never parsed as HTML. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function logoMark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(SVG, 'rect');
  Object.entries({ x: 0, y: 0, width: 40, height: 40, rx: 11 }).forEach(([k, v]) => rect.setAttribute(k, v));
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M12.5 28V12.5l7.5 9 7.5-9V28');
  svg.append(rect, path);
  return svg;
}

export const brand = () =>
  h('span', { class: 'brand' }, logoMark(), h('span', null, h('span', { class: 'brand__name' }, 'Manhandler'), h('span', { class: 'brand__sub' }, 'Barbershop & Salon')));

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function button(label, { variant = 'secondary', size = '', iconName = null, onClick, type = 'button', ...rest } = {}) {
  return h(
    'button',
    { type, class: `btn btn--${variant}${size ? ` btn--${size}` : ''}`, onClick, ...rest },
    iconName ? icon(iconName) : null,
    label ? h('span', null, label) : null,
  );
}

/** Puts a button into a loading state while `fn` runs. */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const original = [...btn.childNodes];
  btn.disabled = true;
  btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, 'Saving…'));
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.replaceChildren(...original);
  }
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export function toast(message, type = 'ok') {
  const root = document.querySelector('[data-toasts]');
  if (!root) return;
  const el = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, icon(type === 'error' ? 'alert' : 'check'), h('span', null, message));
  root.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }, type === 'error' ? 6000 : 3200);
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

/**
 * Opens a modal dialog. Returns { el, body, foot, close, setError }.
 * `onClose` fires once after closing.
 */
export function modal({ title, subtitle = '', size = '', body, actions = [], onClose } = {}) {
  const errorBox = h('div', { class: 'alert alert--danger', role: 'alert', hidden: true });
  const bodyEl = h('div', { class: 'modal__body' }, errorBox, body);
  const footEl = h('div', { class: 'modal__foot' }, actions);
  const closeBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--plain', 'aria-label': 'Close' }, icon('close'));
  const titleId = `m-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h(
    'dialog',
    { class: `modal${size ? ` modal--${size}` : ''}`, 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'modal__panel' },
      h('div', { class: 'modal__head' }, h('div', null, h('h2', { class: 'modal__title', id: titleId }, title), subtitle ? h('p', { class: 'modal__sub' }, subtitle) : null), closeBtn),
      bodyEl,
      actions.length ? footEl : null,
    ),
  );
  document.body.append(dialog);
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    document.documentElement.classList.remove('is-locked');
    onClose?.(result);
  };
  closeBtn.addEventListener('click', () => close());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('mousedown', (e) => {
    if (e.target === dialog) close();
  });
  dialog.showModal();
  document.documentElement.classList.add('is-locked');
  const firstField = dialog.querySelector('.modal__body input:not([type=hidden]):not([disabled]), .modal__body select, .modal__body textarea');
  if (firstField && window.matchMedia('(pointer: fine)').matches) firstField.focus();
  return {
    el: dialog,
    body: bodyEl,
    foot: footEl,
    close,
    setError(message) {
      errorBox.hidden = !message;
      errorBox.replaceChildren(...(message ? [icon('alert'), h('p', null, message)] : []));
      if (message) errorBox.scrollIntoView({ block: 'nearest' });
    },
  };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, extra = null }) {
  return new Promise((resolve) => {
    let result = false;
    const ok = button(confirmLabel, {
      variant: danger ? 'danger-solid' : 'primary',
      onClick: () => {
        result = true;
        m.close();
      },
    });
    const m = modal({
      title,
      size: 'sm',
      body: h('div', { class: 'stack stack--sm' }, typeof message === 'string' ? h('p', { style: { margin: 0 } }, message) : message, extra),
      actions: [button('Go back', { variant: 'ghost', onClick: () => m.close() }), ok],
      onClose: () => resolve(result),
    });
    ok.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

let fieldSeq = 0;

/**
 * Labelled control. type: text|email|tel|number|date|time|password|textarea|select|money
 * options (select): [{ value, label, group? }]
 */
export function field({ label, name, type = 'text', value = '', hint = '', required = false, options = [], attrs = {}, full = false }) {
  const id = `f-${name}-${++fieldSeq}`;
  let control;
  if (type === 'textarea') {
    control = h('textarea', { class: 'textarea', id, name, required, ...attrs });
    control.value = value ?? '';
  } else if (type === 'select') {
    control = h('select', { class: 'select', id, name, required, ...attrs });
    const groups = new Map();
    for (const o of options) {
      const opt = h('option', { value: o.value }, o.label);
      if (String(o.value) === String(value ?? '')) opt.selected = true;
      if (o.disabled) opt.disabled = true;
      if (o.group) {
        if (!groups.has(o.group)) {
          const g = h('optgroup', { label: o.group });
          groups.set(o.group, g);
          control.append(g);
        }
        groups.get(o.group).append(opt);
      } else control.append(opt);
    }
  } else if (type === 'money') {
    control = h('input', { class: 'input', id, name, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', ...attrs });
    control.value = value ?? '';
    control = h('div', { class: 'input-prefix' }, h('span', { 'aria-hidden': 'true' }, '$'), control);
  } else {
    control = h('input', { class: 'input', id, name, type, required, ...attrs });
    control.value = value ?? '';
  }
  const errId = `${id}-err`;
  const input = control.matches?.('input,select,textarea') ? control : control.querySelector('input');
  input.setAttribute('aria-describedby', errId);
  return h(
    'div',
    { class: 'field', style: full ? { gridColumn: '1 / -1' } : null, dataset: { field: name } },
    h('label', { for: input.id }, label, required ? null : null),
    control,
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    h('p', { class: 'field__error', id: errId, hidden: true }),
  );
}

export function switchField({ label, name, checked = false, hint = '' }) {
  const input = h('input', { type: 'checkbox', name, checked, role: 'switch' });
  return h(
    'div',
    { class: 'field', dataset: { field: name } },
    h('label', { class: 'switch' }, input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }), h('span', null, label)),
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    h('p', { class: 'field__error', hidden: true }),
  );
}

export function checkField({ label, name, checked = false }) {
  return h('label', { class: 'check', dataset: { field: name } }, h('input', { type: 'checkbox', name, checked }), h('span', null, label));
}

/** Reads named controls into a plain object (checkboxes → boolean). */
export function readForm(form) {
  const out = {};
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.type === 'checkbox') {
      if (el.dataset.multi) {
        out[el.name] ??= [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

export function showFieldErrors(form, fields = {}) {
  for (const box of form.querySelectorAll('[data-field]')) {
    const name = box.dataset.field;
    const err = box.querySelector('.field__error');
    const input = box.querySelector('input, select, textarea');
    const msg = fields[name];
    if (err) {
      err.hidden = !msg;
      err.textContent = msg || '';
    }
    if (input && input.type !== 'checkbox') input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const first = Object.keys(fields)[0];
  if (first) form.querySelector(`[data-field="${first}"] input, [data-field="${first}"] select, [data-field="${first}"] textarea`)?.focus();
}

/* ------------------------------------------------------------------ */
/* Empty / loading states                                              */
/* ------------------------------------------------------------------ */

export function empty({ iconName = 'calendar', title, text = '', action = null }) {
  return h('div', { class: 'empty' }, h('span', { class: 'empty__icon' }, icon(iconName)), h('p', { class: 'empty__title' }, title), text ? h('p', null, text) : null, action);
}

export const loading = (lines = 3) => h('div', { 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton-line', style: { width: `${90 - i * 15}%` } })));

export function errorState(err, retry) {
  return h(
    'div',
    { class: 'empty', role: 'alert' },
    h('span', { class: 'empty__icon' }, icon('alert')),
    h('p', { class: 'empty__title' }, 'Something went wrong'),
    h('p', null, err?.message || 'Please try again.'),
    retry ? button('Try again', { variant: 'secondary', size: 'sm', iconName: 'refresh', onClick: retry }) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const asUtc = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const fmtDate = (date, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  date ? asUtc(date).toLocaleDateString('en-CA', { ...opts, timeZone: 'UTC' }) : '';

export const fmtDateLong = (date) => fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export const minToTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const timeToMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function fmtPrice(cents, from = false) {
  if (cents == null) return '';
  const s = cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  return from ? `From ${s}` : s;
}

export function fmtDuration(min) {
  if (!min) return '';
  const hrs = Math.floor(min / 60);
  const m = min % 60;
  return hrs ? (m ? `${hrs} hr ${m} min` : `${hrs} hr`) : `${m} min`;
}

export function addDays(date, n) {
  const d = asUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayOfWeek = (date) => asUtc(date).getUTCDay();

export function startOfWeek(date) {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const STATUS_LABELS = { booked: 'Booked', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' };
export const statusBadge = (status) => h('span', { class: `badge badge--${status}` }, STATUS_LABELS[status] ?? status);

export function telHref(phone) {
  const d = String(phone).replace(/\D/g, '');
  return `tel:+${d.length === 10 ? `1${d}` : d}`;
}

/** "2026-10-01 18:20:00" (UTC from SQLite) → local readable string */
export function fmtTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(`${ts.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}
