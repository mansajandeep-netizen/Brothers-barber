import { get, post, setCsrf, onSessionExpired, ApiError } from './api.js';
import { state, loadCatalog, isOwner } from './state.js';
import { h, icon, brand, button, toast, field, readForm, showFieldErrors, withBusy, initials, clear, errorState } from './ui.js';
import { openAppointmentEditor } from './views/appointment-editor.js';

const ROUTES = [
  { path: 'overview', title: 'Overview', icon: 'grid', load: () => import('./views/overview.js') },
  { path: 'appointments', title: 'Appointments', icon: 'calendar', load: () => import('./views/appointments.js') },
  { path: 'customers', title: 'Customers', icon: 'users', load: () => import('./views/customers.js') },
  { section: 'Shop setup' },
  { path: 'services', title: 'Services & Prices', icon: 'scissors', load: () => import('./views/services.js') },
  { path: 'barbers', title: 'Barbers', icon: 'user', load: () => import('./views/barbers.js') },
  { path: 'availability', title: 'Hours & Availability', icon: 'clock', load: () => import('./views/availability.js') },
  { path: 'reviews', title: 'Reviews', icon: 'star', owner: true, load: () => import('./views/reviews.js') },
  { path: 'settings', title: 'Business Info', icon: 'store', owner: true, load: () => import('./views/settings.js') },
  { path: 'team', title: 'Team & Access', icon: 'lock', owner: true, load: () => import('./views/team.js') },
  { path: 'account', title: 'My Account', icon: 'user', hidden: true, load: () => import('./views/account.js') },
];

const app = document.getElementById('app');
let shell = null;
let renderSeq = 0;

/* ------------------------------------------------------------------ */
/* Boot & auth                                                         */
/* ------------------------------------------------------------------ */

async function boot() {
  try {
    const me = await get('/me');
    if (!me.user) return renderLogin();
    setCsrf(me.csrf);
    state.user = me.user;
    await startApp();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) renderLogin();
    else renderFatal(err);
  }
}

onSessionExpired(() => {
  if (!state.user) return;
  state.user = null;
  shell = null;
  toast('Your session expired. Please sign in again.', 'error');
  renderLogin();
});

function renderFatal(err) {
  app.removeAttribute('aria-busy');
  app.className = 'app-loading';
  app.replaceChildren(errorState(err, () => location.reload()));
}

function renderLogin() {
  app.removeAttribute('aria-busy');
  app.className = '';
  document.title = 'Sign in | Brothers Barber Shop';
  const submit = button('Sign in', { variant: 'primary', type: 'submit' });
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field({ label: 'Email', name: 'email', type: 'email', attrs: { autocomplete: 'username', required: true, autocapitalize: 'off', spellcheck: 'false' } }),
    field({ label: 'Password', name: 'password', type: 'password', attrs: { autocomplete: 'current-password', required: true } }),
    submit,
  );
  const alertBox = h('div', { class: 'alert alert--danger', role: 'alert', hidden: true });
  form.prepend(alertBox);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    const fields = {};
    if (!data.email.trim()) fields.email = 'Enter your email.';
    if (!data.password) fields.password = 'Enter your password.';
    showFieldErrors(form, fields);
    if (Object.keys(fields).length) return;
    alertBox.hidden = true;
    await withBusy(submit, async () => {
      try {
        const res = await post('/login', { email: data.email.trim(), password: data.password });
        setCsrf(res.csrf);
        state.user = res.user;
        await startApp();
      } catch (err) {
        alertBox.hidden = false;
        alertBox.replaceChildren(icon('alert'), h('p', null, err.message));
        form.querySelector('[name=password]').select();
      }
    });
  });

  app.replaceChildren(
    h(
      'main',
      { class: 'login' },
      h(
        'div',
        { class: 'login__card' },
        h('div', { class: 'login__brand' }, brand()),
        h('h1', null, 'Staff sign in'),
        h('p', null, 'Manage appointments, services and availability.'),
        form,
        h('p', { class: 'login__foot' }, h('a', { href: '/' }, '← Back to website')),
      ),
    ),
  );
  form.querySelector('[name=email]').focus();
}

async function logout() {
  try {
    await post('/logout');
  } catch {
    /* ignore */
  }
  state.user = null;
  shell = null;
  setCsrf('');
  history.replaceState(null, '', '/admin');
  renderLogin();
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

async function startApp() {
  app.className = '';
  app.setAttribute('aria-busy', 'true');
  try {
    await loadCatalog();
  } catch (err) {
    renderFatal(err);
    return;
  }
  app.removeAttribute('aria-busy');
  renderShell();
  if (!location.hash) history.replaceState(null, '', '#/overview');
  route();
}

function renderShell() {
  const navItems = [];
  for (const r of ROUTES) {
    if (r.section) {
      navItems.push(h('li', { class: 'nav__label', role: 'presentation' }, r.section));
      continue;
    }
    if (r.hidden || (r.owner && !isOwner())) continue;
    navItems.push(h('li', null, h('a', { href: `#/${r.path}`, dataset: { route: r.path } }, icon(r.icon), h('span', null, r.title))));
  }

  const sidebar = h(
    'aside',
    { class: 'sidebar', id: 'sidebar', 'aria-label': 'Dashboard navigation' },
    h('a', { class: 'sidebar__brand', href: '#/overview', style: { textDecoration: 'none' } }, brand()),
    h('nav', { 'aria-label': 'Sections' }, h('ul', { class: 'nav' }, navItems)),
    h(
      'div',
      { class: 'sidebar__foot' },
      h(
        'div',
        { class: 'user-card' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(state.user.name)),
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'user-card__name' }, state.user.name), h('div', { class: 'user-card__role' }, state.user.role)),
      ),
      h(
        'div',
        { class: 'sidebar__links' },
        h('a', { href: '#/account' }, icon('lock'), 'My account'),
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, icon('external'), 'View website'),
        h('button', { type: 'button', onClick: logout }, icon('logout'), 'Sign out'),
      ),
    ),
  );
  const scrim = h('div', { class: 'scrim', onClick: () => toggleSidebar(false) });
  const menuBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--plain topbar__menu', 'aria-label': 'Open navigation', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onClick: () => toggleSidebar() }, icon('menu'));
  const title = h('h1', { class: 'topbar__title' }, '');
  const actions = h('div', { class: 'topbar__actions' });
  const newBtn = button('New appointment', {
    variant: 'primary',
    size: 'sm',
    iconName: 'plus',
    onClick: () => openAppointmentEditor({ onSaved: () => route() }),
  });
  const content = h('main', { class: 'content', id: 'content', tabindex: '-1' });

  shell = { sidebar, scrim, menuBtn, title, actions, content, newBtn };
  app.replaceChildren(
    h('div', { class: 'shell' }, sidebar, scrim, h('div', { class: 'main' }, h('header', { class: 'topbar' }, menuBtn, title, actions, newBtn), content)),
  );
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a[href^="#"]')) toggleSidebar(false);
  });
}

function toggleSidebar(force) {
  if (!shell) return;
  const open = force ?? !shell.sidebar.classList.contains('is-open');
  shell.sidebar.classList.toggle('is-open', open);
  shell.scrim.classList.toggle('is-open', open);
  shell.menuBtn.setAttribute('aria-expanded', String(open));
  if (open) shell.sidebar.querySelector('a')?.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shell?.sidebar.classList.contains('is-open')) toggleSidebar(false);
});

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return { segments, query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

export function navigate(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  const next = `#/${path}${qs ? `?${qs}` : ''}`;
  if (location.hash === next) route();
  else location.hash = next;
}

/** Updates the query string without re-rendering (for view-local state like filters). */
export function replaceQuery(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  history.replaceState(null, '', `#/${path}${qs ? `?${qs}` : ''}`);
}

async function route() {
  if (!shell) return;
  const { segments, query } = parseHash();
  const def = ROUTES.find((r) => r.path === segments[0]) ?? ROUTES[0];
  const seq = ++renderSeq;

  for (const a of shell.sidebar.querySelectorAll('[data-route]')) {
    if (a.dataset.route === def.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  shell.title.textContent = def.title;
  document.title = `${def.title} | Brothers Barber Shop`;
  clear(shell.actions);

  if (def.owner && !isOwner()) {
    shell.content.replaceChildren(h('div', { class: 'page' }, errorState(new Error('Only the shop owner can open this page.'))));
    return;
  }

  shell.content.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'card' }, h('div', { class: 'skeleton-line' }), h('div', { class: 'skeleton-line', style: { width: '60%' } }))));
  try {
    const mod = await def.load();
    if (seq !== renderSeq) return;
    const page = h('div', { class: 'page' });
    shell.content.replaceChildren(page);
    await mod.render({
      el: page,
      params: segments.slice(1),
      query,
      navigate,
      replaceQuery,
      setActions: (...nodes) => shell.actions.replaceChildren(...nodes.flat().filter(Boolean)),
      refresh: route,
      isCurrent: () => seq === renderSeq,
    });
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error(err);
    shell.content.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'card' }, errorState(err, route))));
  }
  if (seq === renderSeq && document.activeElement === document.body) shell.content.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  route();
});

boot();
