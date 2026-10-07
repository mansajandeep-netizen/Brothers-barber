import { $, $$, api, formatMinutes, prefersReducedMotion, shopNow } from './lib.js';
import { initBooking } from './booking.js';

const dataEl = $('#site-data');
const siteData = dataEl ? JSON.parse(dataEl.textContent) : null;
const reduceMotion = prefersReducedMotion();

/* ---------------------------------------------------------------------- */
/* Header: solid on scroll                                                */
/* ---------------------------------------------------------------------- */

const header = $('[data-header]');
function onScrollHeader() {
  header?.classList.toggle('is-scrolled', window.scrollY > 24);
}
onScrollHeader();

/* ---------------------------------------------------------------------- */
/* Mobile menu                                                            */
/* ---------------------------------------------------------------------- */

const menu = $('[data-mobile-menu]');
const toggle = $('[data-nav-toggle]');
let menuOpen = false;

function setInert(on) {
  for (const node of [$('main'), $('.site-footer'), $('[data-mobile-cta]')]) {
    if (node) node.inert = on;
  }
}

function openMenu() {
  if (!menu || menuOpen) return;
  menuOpen = true;
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('is-open'));
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close menu');
  header.classList.add('is-menu-open');
  document.documentElement.classList.add('is-locked');
  setInert(true);
  $('a', menu)?.focus({ preventScroll: true });
}

function closeMenu({ focusToggle = true } = {}) {
  if (!menu || !menuOpen) return;
  menuOpen = false;
  menu.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open menu');
  header.classList.remove('is-menu-open');
  document.documentElement.classList.remove('is-locked');
  setInert(false);
  setTimeout(() => {
    if (!menuOpen) menu.hidden = true;
  }, reduceMotion ? 0 : 350);
  if (focusToggle) toggle.focus({ preventScroll: true });
}

toggle?.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
menu?.addEventListener('click', (e) => {
  if (e.target.closest('a')) closeMenu({ focusToggle: false });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) closeMenu();
});
window.matchMedia('(min-width: 1100px)').addEventListener('change', (e) => {
  if (e.matches) closeMenu({ focusToggle: false });
});

/* ---------------------------------------------------------------------- */
/* Scroll reveal + number counters                                        */
/* ---------------------------------------------------------------------- */

const counters = $$('[data-count-to]');

function runCounter(node) {
  const target = Number(node.dataset.countTo);
  const decimals = Number(node.dataset.decimals || 0);
  const final = target.toFixed(decimals);
  if (reduceMotion) {
    node.textContent = final;
    return;
  }
  const duration = 1600;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    node.textContent = (target * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else node.textContent = final;
  };
  requestAnimationFrame(tick);
}

if ('IntersectionObserver' in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  $$('[data-reveal]').forEach((node) => revealObserver.observe(node));

  counters.forEach((node) => {
    node.textContent = (0).toFixed(Number(node.dataset.decimals || 0));
  });
  const counterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        runCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.6 },
  );
  counters.forEach((node) => counterObserver.observe(node));
} else {
  $$('[data-reveal]').forEach((node) => node.classList.add('is-visible'));
}

/* ---------------------------------------------------------------------- */
/* Parallax (pointer devices only, motion allowed)                        */
/* ---------------------------------------------------------------------- */

const heroMedia = $('[data-parallax]');
const softItems = $$('[data-parallax-soft]');
const bgPhotos = $$('[data-parallax-bg]');
const parallaxOn = !reduceMotion && window.matchMedia('(pointer: fine) and (min-width: 900px)').matches;

function updateParallax() {
  if (!parallaxOn) return;
  const y = window.scrollY;
  const vh = window.innerHeight;
  if (heroMedia && y < vh * 1.2) heroMedia.style.transform = `translate3d(0, ${(y * 0.28).toFixed(1)}px, 0)`;
  for (const node of softItems) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < -100 || rect.top > vh + 100) continue;
    const offset = (rect.top + rect.height / 2 - vh / 2) * -0.06;
    node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
  }
  // Background photos drift up to 10% of their height (the image is 24% taller than its frame).
  for (const node of bgPhotos) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > vh) continue;
    const progress = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - vh / 2) / vh));
    node.firstElementChild.style.transform = `translate3d(0, ${(progress * rect.height * 0.1).toFixed(1)}px, 0)`;
  }
}

/* Side panels: a soft colour spotlight follows the pointer. */
if (parallaxOn) {
  for (const panel of $$('.side')) {
    panel.addEventListener('pointermove', (e) => {
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
      panel.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
    });
  }
}

/* Hero doors tilt gently toward the pointer, with a soft glare. */
if (parallaxOn) {
  for (const card of $$('.hero-side')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    });
  }
}

/* ---------------------------------------------------------------------- */
/* Sticky mobile CTA                                                      */
/* ---------------------------------------------------------------------- */

const mobileCta = $('[data-mobile-cta]');
const hero = $('.hero');
function updateMobileCta() {
  if (!mobileCta) return;
  const threshold = hero ? hero.offsetHeight * 0.6 : 200;
  mobileCta.classList.toggle('is-visible', window.scrollY > threshold);
}

let ticking = false;
window.addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScrollHeader();
      updateParallax();
      updateMobileCta();
      ticking = false;
    });
  },
  { passive: true },
);
updateParallax();
updateMobileCta();

/* ---------------------------------------------------------------------- */
/* Active nav link (scroll spy)                                           */
/* ---------------------------------------------------------------------- */

const navLinks = $$('[data-nav]');
if (navLinks.length && 'IntersectionObserver' in window) {
  const byId = new Map(navLinks.map((a) => [a.dataset.nav, a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach((a) => {
          const active = a.dataset.nav === entry.target.id;
          a.classList.toggle('is-active', active);
          if (active) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  });
}

/* ---------------------------------------------------------------------- */
/* Service tabs                                                           */
/* ---------------------------------------------------------------------- */

for (const tabs of $$('[data-tabs]')) {
  const tabList = $('[role="tablist"]', tabs);
  const tabButtons = $$('[role="tab"]', tabs);
  const indicator = $('.tabs__indicator', tabs);
  tabs.classList.add('is-enhanced');

  const moveIndicator = () => {
    const active = tabButtons.find((t) => t.getAttribute('aria-selected') === 'true');
    if (!active || !indicator) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  };

  const select = (tab, focus = false) => {
    tabButtons.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    moveIndicator();
  };

  tabButtons.forEach((tab) => tab.addEventListener('click', () => select(tab)));
  tabList.addEventListener('keydown', (e) => {
    const i = tabButtons.indexOf(document.activeElement);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = tabButtons[(i + 1) % tabButtons.length];
    if (e.key === 'ArrowLeft') next = tabButtons[(i - 1 + tabButtons.length) % tabButtons.length];
    if (e.key === 'Home') next = tabButtons[0];
    if (e.key === 'End') next = tabButtons[tabButtons.length - 1];
    if (next) {
      e.preventDefault();
      select(next, true);
    }
  });
  new ResizeObserver(moveIndicator).observe(tabList);
  document.fonts?.ready.then(moveIndicator);
  moveIndicator();
}

/* ---------------------------------------------------------------------- */
/* Gallery filter + lightbox                                              */
/* ---------------------------------------------------------------------- */

const gallery = $('[data-gallery]');
if (gallery) {
  const items = $$('.gallery__item', gallery);
  const chips = $$('[data-filter]');
  const empty = $('[data-gallery-empty]');

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      let shown = 0;
      items.forEach((item) => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.hidden = !match;
        item.classList.remove('is-filtered-in');
        if (match) {
          shown++;
          item.classList.add('is-visible');
          if (!reduceMotion) {
            void item.offsetWidth;
            item.classList.add('is-filtered-in');
          }
        }
      });
      if (empty) empty.hidden = shown > 0;
    }),
  );

  const dialog = $('[data-lightbox-dialog]');
  const img = $('[data-lightbox-img]');
  const caption = $('[data-lightbox-caption]');
  let current = 0;
  let opener = null;

  const visibleButtons = () => items.filter((i) => !i.hidden).map((i) => $('.gallery__btn', i));

  const show = (btn) => {
    const list = visibleButtons();
    current = list.indexOf(btn);
    img.src = btn.dataset.large;
    img.alt = btn.dataset.caption;
    caption.textContent = btn.dataset.caption;
    const multiple = list.length > 1;
    $('[data-lightbox-prev]', dialog).hidden = !multiple;
    $('[data-lightbox-next]', dialog).hidden = !multiple;
  };

  const step = (dir) => {
    const list = visibleButtons();
    if (list.length < 2) return;
    show(list[(current + dir + list.length) % list.length]);
  };

  gallery.addEventListener('click', (e) => {
    const btn = e.target.closest('.gallery__btn');
    if (!btn || !dialog) return;
    opener = btn;
    show(btn);
    dialog.showModal();
    document.documentElement.classList.add('is-locked');
  });

  dialog?.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    img.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  $('[data-lightbox-close]', dialog)?.addEventListener('click', () => dialog.close());
  $('[data-lightbox-prev]', dialog)?.addEventListener('click', () => step(-1));
  $('[data-lightbox-next]', dialog)?.addEventListener('click', () => step(1));
  dialog?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // Swipe between photos on touch screens.
  let touchX = null;
  dialog?.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  dialog?.addEventListener(
    'touchend',
    (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      touchX = null;
    },
    { passive: true },
  );
}

/* ---------------------------------------------------------------------- */
/* Open / closed status (computed in the shop's timezone)                 */
/* ---------------------------------------------------------------------- */

function updateOpenStatus() {
  if (!siteData?.hours?.length) return;
  const { date, minutes } = shopNow(siteData.timezone);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const byDay = new Map(siteData.hours.map((h) => [h.day, h]));
  const today = byDay.get(dow);
  const isOpen = !!today?.isOpen && minutes >= today.open && minutes < today.close;

  let text;
  if (isOpen) {
    text = `Open now · until ${formatMinutes(today.close)}`;
  } else if (today?.isOpen && minutes < today.open) {
    text = `Closed · opens today at ${formatMinutes(today.open)}`;
  } else {
    text = 'Closed now';
    for (let i = 1; i <= 7; i++) {
      const d = byDay.get((dow + i) % 7);
      if (d?.isOpen) {
        const when = i === 1 ? 'tomorrow' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][(dow + i) % 7];
        text = `Closed · opens ${when} at ${formatMinutes(d.open)}`;
        break;
      }
    }
  }

  const status = $('[data-open-status]');
  if (status) {
    status.classList.toggle('is-open', isOpen);
    const label = $('span', status);
    if (label) label.textContent = text;
  }
  const pill = $('[data-open-pill]');
  if (pill) {
    pill.hidden = false;
    pill.textContent = isOpen ? 'Open now' : 'Closed now';
    pill.classList.toggle('is-closed', !isOpen);
  }
  $$('.hours tr[data-day]').forEach((row) => {
    const on = Number(row.dataset.day) === dow;
    row.classList.toggle('is-today', on);
    if (on) row.setAttribute('aria-current', 'date');
    else row.removeAttribute('aria-current');
  });
}
updateOpenStatus();
setInterval(updateOpenStatus, 60_000);

/* ---------------------------------------------------------------------- */
/* Booking                                                                */
/* ---------------------------------------------------------------------- */

const booking = initBooking({ data: siteData });

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-book]');
  if (!link || !booking) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  closeMenu({ focusToggle: false });
  booking.open({ service: link.dataset.service || null, trigger: link });
});

if (booking && (location.pathname === '/book' || location.hash === '#book')) {
  if (location.hash === '#book') history.replaceState(null, '', `${location.pathname}${location.search}`);
  booking.open({ service: new URLSearchParams(location.search).get('service') });
}

/* ---------------------------------------------------------------------- */
/* Manage-appointment page: cancel with confirmation                      */
/* ---------------------------------------------------------------------- */

const manage = $('[data-manage]');
const cancelBtn = $('[data-cancel-appointment]');
if (manage && cancelBtn) {
  const error = $('[data-cancel-error]');
  cancelBtn.addEventListener('click', () => {
    cancelBtn.hidden = true;
    const confirmRow = document.createElement('div');
    confirmRow.className = 'manage__confirm';
    confirmRow.innerHTML = `<button type="button" class="btn btn--danger" data-yes><span>Yes, cancel it</span></button>
      <button type="button" class="btn btn--outline" data-no><span>Keep my appointment</span></button>`;
    cancelBtn.after(confirmRow);
    $('[data-no]', confirmRow).focus();
    $('[data-no]', confirmRow).addEventListener('click', () => {
      confirmRow.remove();
      cancelBtn.hidden = false;
      cancelBtn.focus();
    });
    $('[data-yes]', confirmRow).addEventListener('click', async (e) => {
      const yes = e.currentTarget;
      yes.disabled = true;
      yes.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Cancelling…</span>';
      try {
        await api(`/api/bookings/${encodeURIComponent(manage.dataset.token)}/cancel`, { method: 'POST', body: {} });
        location.reload();
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
        yes.disabled = false;
        yes.innerHTML = '<span>Yes, cancel it</span>';
      }
    });
  });
}
