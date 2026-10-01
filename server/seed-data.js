/**
 * First-run data. Everything here can be edited from the admin dashboard.
 * Prices and durations are intentionally left empty — the owner sets them.
 */

export const DEFAULT_BUSINESS = {
  name: 'Brothers Barber Shop',
  phone: '(780) 505-0013',
  email: '',
  streetAddress: '9701 84 Ave #2',
  city: 'Grande Prairie',
  region: 'AB',
  postalCode: 'T8V 4Z8',
  country: 'CA',
  googleRating: 4.8,
  googleReviewCount: 154,
  reviewsUrl:
    'https://www.google.com/maps/search/?api=1&query=Brothers%20Barber%20Shop%2C%209701%2084%20Ave%20%232%2C%20Grande%20Prairie%2C%20AB%20T8V%204Z8',
  instagramUrl: '',
  facebookUrl: '',
  tiktokUrl: '',
};

export const DEFAULT_BOOKING = {
  enabled: true,
  slotInterval: 30, // minutes between start times
  defaultDuration: 30, // used for services without a duration set
  minNoticeMinutes: 60, // how soon before a slot it can still be booked online
  maxAdvanceDays: 30, // how far ahead customers can book
  cancelCutoffHours: 2, // customers can self-cancel up to this many hours before
};

// Monday–Saturday 9 AM–7 PM, Sunday 9 AM–5 PM. Minutes after midnight.
export const DEFAULT_HOURS = [
  { day: 0, open: 9 * 60, close: 17 * 60 },
  { day: 1, open: 9 * 60, close: 19 * 60 },
  { day: 2, open: 9 * 60, close: 19 * 60 },
  { day: 3, open: 9 * 60, close: 19 * 60 },
  { day: 4, open: 9 * 60, close: 19 * 60 },
  { day: 5, open: 9 * 60, close: 19 * 60 },
  { day: 6, open: 9 * 60, close: 19 * 60 },
];

// Placeholder chairs — rename them in Admin → Barbers.
export const SEED_BARBERS = ['Barber 1', 'Barber 2'];

export const PLACEHOLDER_BARBER_NAME = /^Barber \d+$/;

export const CATEGORIES = {
  haircuts: 'Haircuts',
  'beard-grooming': 'Beard & Grooming',
};

export const SEED_SERVICES = [
  {
    slug: 'custom-cut',
    name: 'Custom Cut',
    category: 'haircuts',
    description: 'A cut built around your hair type, head shape and the style you want — talk it through with your barber first.',
  },
  {
    slug: 'fade-cut',
    name: 'Fade Cut',
    category: 'haircuts',
    description: 'Low, mid, high, skin or taper — a clean, seamless fade blended to suit your look.',
  },
  {
    slug: 'buzz-cut',
    name: 'Buzz Cut',
    category: 'haircuts',
    description: 'A sharp, even all-over clipper cut. Simple, clean and low-maintenance.',
  },
  {
    slug: 'curly-hair',
    name: 'Curly Hair',
    category: 'haircuts',
    description: 'Cutting and shaping that works with your natural curl pattern, not against it.',
  },
  {
    slug: 'long-haircut',
    name: 'Long Haircut',
    category: 'haircuts',
    description: 'Trims and restyles for longer hair, keeping length and shape exactly where you want it.',
  },
  {
    slug: 'scissor-cut',
    name: 'Scissor Cut',
    category: 'haircuts',
    description: 'A classic cut done with shears for natural texture and a softer, tailored finish.',
  },
  {
    slug: 'razor-cut',
    name: 'Razor Cut',
    category: 'haircuts',
    description: 'Razor-cut texture and movement for a lighter, more defined style.',
  },
  {
    slug: 'kids-cuts',
    name: "Kids' Cuts",
    category: 'haircuts',
    description: 'Clean, comfortable haircuts for kids — classic styles, fades and everything in between.',
  },
  {
    slug: 'hair-shape-up',
    name: 'Hair Shape Up',
    category: 'haircuts',
    description: 'Crisp edges along the hairline, temples and neckline to keep your cut sharp between visits.',
  },
  {
    slug: 'head-shave',
    name: 'Head Shave',
    category: 'haircuts',
    description: 'A smooth, close head shave, finished with care for the skin.',
  },
  {
    slug: 'beard-trim',
    name: 'Beard Trim',
    category: 'beard-grooming',
    description: 'Length control and shaping with clean, defined lines.',
  },
  {
    slug: 'beard-maintenance',
    name: 'Beard Maintenance',
    category: 'beard-grooming',
    description: 'Regular upkeep to keep your beard’s shape, line-up and length on point.',
  },
  {
    slug: 'beard-conditioning',
    name: 'Beard Conditioning',
    category: 'beard-grooming',
    description: 'A conditioning treatment to soften the beard and care for the skin underneath.',
  },
  {
    slug: 'beard-dyeing',
    name: 'Beard Dyeing',
    category: 'beard-grooming',
    description: 'Beard color to blend grey or refresh your tone, matched to suit you.',
  },
  {
    slug: 'shave',
    name: 'Shave',
    category: 'beard-grooming',
    description: 'A traditional shave for a close, clean finish.',
  },
  {
    slug: 'hair-coloring',
    name: 'Hair Coloring',
    category: 'beard-grooming',
    description: 'Color services to cover grey, refresh your tone or try something new.',
  },
];
