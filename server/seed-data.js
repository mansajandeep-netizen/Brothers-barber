/**
 * First-run data. Everything here can be edited from the admin dashboard.
 * Prices and durations are intentionally left empty — the owner sets them.
 */

export const DEFAULT_BUSINESS = {
  name: 'Manhandler Barbershop & Full Service Salon',
  phone: '(780) 532-4678',
  email: '',
  building: 'Prairie Mall',
  streetAddress: '11801 100 St #294',
  city: 'Grande Prairie',
  region: 'AB',
  postalCode: 'T8V 3Y2',
  country: 'CA',
  foundedYear: 1979,
  // Not provided yet — the rating block stays hidden until the owner adds it.
  googleRating: null,
  googleReviewCount: null,
  reviewsUrl:
    'https://www.google.com/maps/search/?api=1&query=Manhandler%20Barbershop%2C%20Prairie%20Mall%2C%2011801%20100%20St%20%23294%2C%20Grande%20Prairie%2C%20AB',
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

// Monday–Friday 10 AM–7 PM, Saturday 10 AM–6 PM, closed Sunday. Minutes after midnight.
export const DEFAULT_HOURS = [
  { day: 0, isOpen: false, open: 10 * 60, close: 18 * 60 },
  { day: 1, isOpen: true, open: 10 * 60, close: 19 * 60 },
  { day: 2, isOpen: true, open: 10 * 60, close: 19 * 60 },
  { day: 3, isOpen: true, open: 10 * 60, close: 19 * 60 },
  { day: 4, isOpen: true, open: 10 * 60, close: 19 * 60 },
  { day: 5, isOpen: true, open: 10 * 60, close: 19 * 60 },
  { day: 6, isOpen: true, open: 10 * 60, close: 18 * 60 },
];

// Placeholder chairs — rename them in Admin → Stylists.
export const SEED_BARBERS = ['Stylist 1', 'Stylist 2'];

export const PLACEHOLDER_BARBER_NAME = /^(Barber|Stylist) \d+$/;

// The two sides of the business. Every service belongs to one of them.
export const CATEGORIES = {
  barbershop: 'Barbershop',
  salon: 'Salon',
};

export const SEED_SERVICES = [
  {
    slug: 'mens-haircut',
    name: 'Men’s Haircut',
    category: 'barbershop',
    description: 'Classic or modern — tell us the look you’re after and we’ll cut it to suit you.',
  },
  {
    slug: 'womens-haircut',
    name: 'Women’s Haircut',
    category: 'salon',
    description: 'Trims, fresh shapes and complete restyles, cut to suit your hair and your style.',
  },
  {
    slug: 'hair-styling',
    name: 'Hair Styling',
    category: 'salon',
    description: 'Traditional and trendy styling — for everyday, special occasions and everything in between.',
  },
  {
    slug: 'hair-coloring',
    name: 'Hair Coloring',
    category: 'salon',
    description: 'Color to cover grey, refresh your tone or try something new.',
  },
  {
    slug: 'facial-waxing',
    name: 'Facial Waxing',
    category: 'salon',
    description: 'Facial waxing for a clean, tidy finish.',
  },
];
