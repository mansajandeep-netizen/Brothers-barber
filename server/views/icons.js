import { html, raw } from './html.js';

const SYMBOLS = {
  phone:
    '<path d="M21.5 16.6v2.9a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6A19.6 19.6 0 0 1 1.8 4 2 2 0 0 1 3.8 1.8h2.9a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L7.7 9.6a15.5 15.5 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21.5s7-6.1 7-11.8a7 7 0 0 0-14 0c0 5.7 7 11.8 7 11.8z"/><circle cx="12" cy="9.7" r="2.6"/>',
  star: '<path fill="currentColor" stroke="none" d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/>',
  'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  check: '<path d="M20 6.5 9.2 17.3 4 12.1"/>',
  scissors:
    '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M20 4.5 8.3 15.4M14.6 14.2 20 19.5M8.3 8.6l3.4 3.2"/>',
  comb: '<rect x="2.5" y="6" width="19" height="4" rx="1"/><path d="M5 10v7.5M8.2 10v7.5M11.4 10v7.5M14.6 10v7.5M17.8 10v7.5"/>',
  razor: '<path d="M3 15.5 13.5 5l3.2 3.2L6.2 18.7H3z"/><path d="m15.3 6.7 2.3-2.3a1.6 1.6 0 0 1 2.3 0l.6.6a1.6 1.6 0 0 1 0 2.3l-2.3 2.3"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:
    '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0M16 4.5a3.6 3.6 0 0 1 0 7M17.8 14.2a6.5 6.5 0 0 1 3.7 6.3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
  'chevron-left': '<path d="M15 18.5 8.5 12 15 5.5"/>',
  'chevron-right': '<path d="M9 18.5 15.5 12 9 5.5"/>',
  'chevron-down': '<path d="M5.5 9 12 15.5 18.5 9"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M14.5 8.5H17V4.6h-2.8a4 4 0 0 0-4 4V11H7.5v3.9h2.7V22h4v-7.1H17l.6-3.9h-3.4V9a.5.5 0 0 1 .3-.5z"/>',
  tiktok: '<path d="M14.5 3v11.6a3.7 3.7 0 1 1-3.7-3.7M14.5 3c.4 2.7 2.4 4.6 5.2 4.8"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  navigation: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  expand: '<path d="M15 3.5h5.5V9M9 20.5H3.5V15M20.5 3.5 14 10M3.5 20.5 10 14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  alert: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 10v4.5M12 17.3v.1"/>',
  quote:
    '<path fill="currentColor" stroke="none" d="M9.6 6C6.5 7.2 4.5 9.9 4.5 13.4V18h6v-6h-3c0-1.9 1.1-3.4 2.9-4.2zm9 0c-3.1 1.2-5.1 3.9-5.1 7.4V18h6v-6h-3c0-1.9 1.1-3.4 2.9-4.2z"/>',
  download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4 20.5h16"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.8L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.8L20 16m0 4.5V16h-4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash:
    '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5L18.5 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  sliders:
    '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5V20h16V9.5M9.5 20v-5.5h5V20"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};

/** Inline SVG sprite — included once per page. */
export const iconSprite = raw(
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(SYMBOLS)
    .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('')}</svg>`,
);

export const icon = (name, cls = '') =>
  html`<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

export const ICON_NAMES = Object.keys(SYMBOLS);
