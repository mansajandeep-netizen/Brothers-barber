import { DEFAULT_BUSINESS, DEFAULT_BOOKING } from '../seed-data.js';

export function settingsRepo(db) {
  function read(key, defaults) {
    const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
    let stored = {};
    if (row) {
      try {
        stored = JSON.parse(row.value);
      } catch {
        stored = {};
      }
    }
    return { ...defaults, ...stored };
  }

  function write(key, value) {
    db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  return {
    business: () => read('business', DEFAULT_BUSINESS),
    saveBusiness: (patch) => write('business', { ...read('business', DEFAULT_BUSINESS), ...patch }),
    booking: () => read('booking', DEFAULT_BOOKING),
    saveBooking: (patch) => write('booking', { ...read('booking', DEFAULT_BOOKING), ...patch }),
  };
}

export function hoursRepo(db) {
  return {
    list() {
      return db
        .all('SELECT day, is_open, open_min, close_min FROM business_hours ORDER BY day')
        .map((r) => ({ day: r.day, isOpen: !!r.is_open, open: r.open_min, close: r.close_min }));
    },
    forDay(day) {
      const r = db.get('SELECT day, is_open, open_min, close_min FROM business_hours WHERE day = ?', [day]);
      return r ? { day: r.day, isOpen: !!r.is_open, open: r.open_min, close: r.close_min } : null;
    },
    save(days) {
      db.tx(() => {
        for (const d of days) {
          db.run(
            `INSERT INTO business_hours (day, is_open, open_min, close_min) VALUES (?, ?, ?, ?)
             ON CONFLICT (day) DO UPDATE SET is_open = excluded.is_open, open_min = excluded.open_min, close_min = excluded.close_min`,
            [d.day, d.isOpen, d.open, d.close],
          );
        }
      });
    },
  };
}
