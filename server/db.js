import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_SERVICES, SEED_BARBERS, DEFAULT_HOURS } from './seed-data.js';

/**
 * Thin wrapper around node:sqlite with a statement cache, safe parameter
 * normalisation and an IMMEDIATE transaction helper (serialises writers,
 * which is what booking conflict prevention relies on).
 */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const norm = (params) => {
    if (params == null) return [];
    if (Array.isArray(params)) return params.map(normValue);
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = normValue(v);
    return [out];
  };

  let depth = 0;
  const db = {
    raw,
    all: (sql, params) => stmt(sql).all(...norm(params)).map(plain),
    get: (sql, params) => plain(stmt(sql).get(...norm(params))),
    run: (sql, params) => stmt(sql).run(...norm(params)),
    exec: (sql) => raw.exec(sql),
    /** Run fn inside a write transaction. Nested calls join the outer one. */
    tx(fn) {
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    close: () => raw.close(),
  };

  migrate(db);
  seed(db);
  return db;
}

function normValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function plain(row) {
  return row ? { ...row } : undefined;
}

const MIGRATIONS = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE business_hours (
    day       INTEGER PRIMARY KEY CHECK (day BETWEEN 0 AND 6), -- 0 = Sunday
    is_open   INTEGER NOT NULL DEFAULT 1,
    open_min  INTEGER NOT NULL,
    close_min INTEGER NOT NULL
  );

  CREATE TABLE services (
    id           INTEGER PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN ('haircuts', 'beard-grooming')),
    description  TEXT NOT NULL DEFAULT '',
    duration_min INTEGER,          -- NULL until the owner sets it
    price_cents  INTEGER,          -- NULL until the owner sets it
    price_from   INTEGER NOT NULL DEFAULT 0,
    is_active    INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE barbers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    work_days  TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    is_active  INTEGER NOT NULL DEFAULT 1,  -- takes bookings
    is_deleted INTEGER NOT NULL DEFAULT 0,  -- removed, kept for history
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE customers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    phone_key  TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE appointments (
    id           INTEGER PRIMARY KEY,
    reference    TEXT NOT NULL UNIQUE,
    manage_token TEXT NOT NULL UNIQUE,
    customer_id  INTEGER NOT NULL REFERENCES customers(id),
    service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
    barber_id    INTEGER NOT NULL REFERENCES barbers(id),
    service_name TEXT NOT NULL,
    price_cents  INTEGER,
    date         TEXT NOT NULL,     -- YYYY-MM-DD, shop local time
    start_min    INTEGER NOT NULL,  -- minutes after midnight, shop local time
    end_min      INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked', 'completed', 'cancelled', 'no_show')),
    notes        TEXT NOT NULL DEFAULT '',
    source       TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'admin')),
    cancelled_by TEXT,
    cancelled_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX ix_appt_date ON appointments (date, start_min);
  CREATE INDEX ix_appt_barber_date ON appointments (barber_id, date);
  CREATE INDEX ix_appt_customer ON appointments (customer_id);
  -- Last line of defence against double booking.
  CREATE UNIQUE INDEX ux_appt_barber_start ON appointments (barber_id, date, start_min)
    WHERE status <> 'cancelled';

  CREATE TABLE time_blocks (
    id         INTEGER PRIMARY KEY,
    barber_id  INTEGER REFERENCES barbers(id) ON DELETE CASCADE, -- NULL = whole shop
    date_from  TEXT NOT NULL,
    date_to    TEXT NOT NULL,
    start_min  INTEGER,  -- NULL = all day
    end_min    INTEGER,
    reason     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX ix_blocks_dates ON time_blocks (date_from, date_to);

  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY, -- SHA-256 of the cookie token
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    ip         TEXT,
    user_agent TEXT
  );

  CREATE TABLE reviews (
    id           INTEGER PRIMARY KEY,
    author       TEXT NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body         TEXT NOT NULL,
    review_date  TEXT,
    source       TEXT NOT NULL DEFAULT 'Google',
    is_published INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE email_log (
    id         INTEGER PRIMARY KEY,
    to_addr    TEXT NOT NULL,
    subject    TEXT NOT NULL,
    provider   TEXT NOT NULL,
    status     TEXT NOT NULL,
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // 2: service categories are now "haircuts" and "salon" (styling, color & waxing).
  // SQLite can't alter a CHECK constraint, so the table is rebuilt with keys preserved.
  {
    foreignKeysOff: true,
    sql: `
    CREATE TABLE services_new (
      id           INTEGER PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL CHECK (category IN ('haircuts', 'salon')),
      description  TEXT NOT NULL DEFAULT '',
      duration_min INTEGER,
      price_cents  INTEGER,
      price_from   INTEGER NOT NULL DEFAULT 0,
      is_active    INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO services_new
      SELECT id, slug, name, CASE category WHEN 'haircuts' THEN 'haircuts' ELSE 'salon' END,
             description, duration_min, price_cents, price_from, is_active, sort_order, created_at, updated_at
      FROM services;
    DROP TABLE services;
    ALTER TABLE services_new RENAME TO services;
    `,
  },
  // 3: the business has two sides, "barbershop" and "salon". Women's cuts move to the salon.
  {
    foreignKeysOff: true,
    sql: `
    CREATE TABLE services_new (
      id           INTEGER PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL CHECK (category IN ('barbershop', 'salon')),
      description  TEXT NOT NULL DEFAULT '',
      duration_min INTEGER,
      price_cents  INTEGER,
      price_from   INTEGER NOT NULL DEFAULT 0,
      is_active    INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO services_new
      SELECT id, slug, name,
             CASE WHEN category = 'haircuts' AND slug <> 'womens-haircut' THEN 'barbershop' ELSE 'salon' END,
             description, duration_min, price_cents, price_from, is_active, sort_order, created_at, updated_at
      FROM services;
    DROP TABLE services;
    ALTER TABLE services_new RENAME TO services;
    `,
  },
];

function migrate(db) {
  const { user_version: version } = db.get('PRAGMA user_version');
  for (let i = version; i < MIGRATIONS.length; i++) {
    const step = typeof MIGRATIONS[i] === 'string' ? { sql: MIGRATIONS[i] } : MIGRATIONS[i];
    // Table rebuilds must run with foreign keys off (it can't be toggled inside a transaction).
    if (step.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.tx(() => {
        db.exec(step.sql);
        if (step.foreignKeysOff && db.all('PRAGMA foreign_key_check').length) {
          throw new Error(`Migration ${i + 1} would break foreign keys`);
        }
        db.exec(`PRAGMA user_version = ${i + 1}`);
      });
    } finally {
      if (step.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

function seed(db) {
  db.tx(() => {
    if (!db.get('SELECT 1 AS x FROM business_hours LIMIT 1')) {
      for (const h of DEFAULT_HOURS) {
        db.run('INSERT INTO business_hours (day, is_open, open_min, close_min) VALUES (?, ?, ?, ?)', [
          h.day, h.isOpen, h.open, h.close,
        ]);
      }
    }
    if (!db.get('SELECT 1 AS x FROM services LIMIT 1')) {
      SEED_SERVICES.forEach((s, i) => {
        db.run(
          'INSERT INTO services (slug, name, category, description, sort_order) VALUES (?, ?, ?, ?, ?)',
          [s.slug, s.name, s.category, s.description, (i + 1) * 10],
        );
      });
    }
    if (!db.get('SELECT 1 AS x FROM barbers LIMIT 1')) {
      SEED_BARBERS.forEach((name, i) => {
        db.run('INSERT INTO barbers (name, sort_order) VALUES (?, ?)', [name, (i + 1) * 10]);
      });
    }
  });
}
