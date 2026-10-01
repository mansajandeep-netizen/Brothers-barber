import crypto from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { minutesToTime } from '../lib/time.js';

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function newReference() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += REF_ALPHABET[b % REF_ALPHABET.length];
  return `BB-${s}`;
}

export function phoneKey(phone) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

function likeParam(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const APPT_SELECT = `
  SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         b.name AS barber_name
  FROM appointments a
  JOIN customers c ON c.id = a.customer_id
  JOIN barbers b ON b.id = a.barber_id`;

export function mapAppointment(r) {
  if (!r) return undefined;
  return {
    id: r.id,
    reference: r.reference,
    token: r.manage_token,
    customer: { id: r.customer_id, name: r.customer_name, phone: r.customer_phone, email: r.customer_email },
    serviceId: r.service_id,
    serviceName: r.service_name,
    barberId: r.barber_id,
    barberName: r.barber_name,
    date: r.date,
    start: minutesToTime(r.start_min),
    end: minutesToTime(r.end_min),
    startMin: r.start_min,
    endMin: r.end_min,
    durationMin: r.end_min - r.start_min,
    priceCents: r.price_cents,
    status: r.status,
    notes: r.notes,
    source: r.source,
    cancelledBy: r.cancelled_by,
    cancelledAt: r.cancelled_at,
    createdAt: r.created_at,
  };
}

export function appointmentsRepo(db) {
  return {
    get: (id) => mapAppointment(db.get(`${APPT_SELECT} WHERE a.id = ?`, [id])),
    getByToken: (token) => mapAppointment(db.get(`${APPT_SELECT} WHERE a.manage_token = ?`, [token])),

    listRange({ from, to, barberId = null, status = null, q = '' }) {
      const where = ['a.date BETWEEN ? AND ?'];
      const params = [from, to];
      if (barberId) {
        where.push('a.barber_id = ?');
        params.push(barberId);
      }
      if (status) {
        where.push('a.status = ?');
        params.push(status);
      }
      if (q) {
        where.push("(c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR a.reference LIKE ? ESCAPE '\\')");
        const p = likeParam(q);
        params.push(p, p, p, p);
      }
      return db
        .all(`${APPT_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.date, a.start_min, b.sort_order`, params)
        .map(mapAppointment);
    },

    /** Active (non-cancelled) appointments for the given barbers on a date. */
    busyOn(date, barberIds, excludeId = 0) {
      if (!barberIds.length) return [];
      const marks = barberIds.map(() => '?').join(',');
      return db.all(
        `SELECT id, barber_id, start_min, end_min FROM appointments
         WHERE date = ? AND status <> 'cancelled' AND id <> ? AND barber_id IN (${marks})`,
        [date, excludeId, ...barberIds],
      );
    },

    /** Active appointments across a date range — used for the calendar month view. */
    busyBetween(from, to) {
      return db.all(
        `SELECT id, barber_id, date, start_min, end_min FROM appointments
         WHERE date BETWEEN ? AND ? AND status <> 'cancelled'`,
        [from, to],
      );
    },

    overlapping({ barberId, date, startMin, endMin, excludeId = 0 }) {
      return db.get(
        `SELECT id FROM appointments
         WHERE barber_id = ? AND date = ? AND status <> 'cancelled' AND id <> ?
           AND start_min < ? AND end_min > ?`,
        [barberId, date, excludeId, endMin, startMin],
      );
    },

    insert(a) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reference = newReference();
        if (db.get('SELECT 1 AS x FROM appointments WHERE reference = ?', [reference])) continue;
        const { lastInsertRowid } = db.run(
          `INSERT INTO appointments (reference, manage_token, customer_id, service_id, barber_id, service_name,
             price_cents, date, start_min, end_min, status, notes, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?)`,
          [
            reference,
            crypto.randomBytes(24).toString('base64url'),
            a.customerId,
            a.serviceId,
            a.barberId,
            a.serviceName,
            a.priceCents,
            a.date,
            a.startMin,
            a.endMin,
            a.notes,
            a.source,
          ],
        );
        return Number(lastInsertRowid);
      }
      throw new Error('Could not allocate a booking reference');
    },

    update(id, a) {
      db.run(
        `UPDATE appointments SET customer_id = ?, service_id = ?, barber_id = ?, service_name = ?, price_cents = ?,
           date = ?, start_min = ?, end_min = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [a.customerId, a.serviceId, a.barberId, a.serviceName, a.priceCents, a.date, a.startMin, a.endMin, a.notes, id],
      );
    },

    setStatus(id, status, by) {
      const cancelled = status === 'cancelled';
      const { changes } = db.run(
        `UPDATE appointments SET status = ?, cancelled_by = ?, cancelled_at = ${cancelled ? "datetime('now')" : 'NULL'},
           updated_at = datetime('now') WHERE id = ?`,
        [status, cancelled ? by : null, id],
      );
      if (!changes) throw new HttpError(404, 'Appointment not found.');
    },

    countActive: () => db.get("SELECT COUNT(*) AS n FROM appointments WHERE status <> 'cancelled'").n,
    countUpcoming: (fromDate, fromMin) =>
      db.get(
        "SELECT COUNT(*) AS n FROM appointments WHERE status = 'booked' AND (date > ? OR (date = ? AND start_min >= ?))",
        [fromDate, fromDate, fromMin],
      ).n,
    upcoming(fromDate, fromMin, limit = 8) {
      return db
        .all(
          `${APPT_SELECT} WHERE a.status = 'booked' AND (a.date > ? OR (a.date = ? AND a.start_min >= ?))
           ORDER BY a.date, a.start_min LIMIT ?`,
          [fromDate, fromDate, fromMin, limit],
        )
        .map(mapAppointment);
    },
    forCustomer: (customerId) =>
      db.all(`${APPT_SELECT} WHERE a.customer_id = ? ORDER BY a.date DESC, a.start_min DESC`, [customerId]).map(mapAppointment),
  };
}

export function customersRepo(db) {
  const STATS = `
    (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS visits,
    (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status <> 'cancelled') AS bookings,
    (SELECT MAX(a.date) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS last_visit`;

  const map = (r) =>
    r && {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      createdAt: r.created_at,
      visits: r.visits ?? 0,
      bookings: r.bookings ?? 0,
      lastVisit: r.last_visit ?? null,
    };

  return {
    /** Finds a customer by phone number, creating or refreshing their details. */
    upsert({ name, phone, email }) {
      const key = phoneKey(phone);
      const existing = db.get('SELECT id, email FROM customers WHERE phone_key = ?', [key]);
      if (existing) {
        db.run(
          "UPDATE customers SET name = ?, phone = ?, email = ?, updated_at = datetime('now') WHERE id = ?",
          [name, phone, email || existing.email, existing.id],
        );
        return existing.id;
      }
      const { lastInsertRowid } = db.run(
        'INSERT INTO customers (name, phone, phone_key, email) VALUES (?, ?, ?, ?)',
        [name, phone, key, email || ''],
      );
      return Number(lastInsertRowid);
    },

    list({ q = '', limit = 50, offset = 0 } = {}) {
      const params = [];
      let where = '';
      if (q) {
        const p = likeParam(q);
        const digits = phoneKey(q);
        where = "WHERE c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\'" + (digits ? ' OR c.phone_key LIKE ?' : '');
        params.push(p, p);
        if (digits) params.push(`%${digits}%`);
      }
      const total = db.get(`SELECT COUNT(*) AS n FROM customers c ${where}`, params).n;
      const rows = db.all(
        `SELECT c.*, ${STATS} FROM customers c ${where} ORDER BY c.updated_at DESC, c.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      return { total, customers: rows.map(map) };
    },

    get: (id) => map(db.get(`SELECT c.*, ${STATS} FROM customers c WHERE c.id = ?`, [id])),

    update(id, { name, phone, email, notes }) {
      const key = phoneKey(phone);
      const clash = db.get('SELECT id FROM customers WHERE phone_key = ? AND id <> ?', [key, id]);
      if (clash) throw new HttpError(409, 'Another customer already uses this phone number.');
      const { changes } = db.run(
        "UPDATE customers SET name = ?, phone = ?, phone_key = ?, email = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
        [name, phone, key, email, notes, id],
      );
      if (!changes) throw new HttpError(404, 'Customer not found.');
      return this.get(id);
    },

    count: () => db.get('SELECT COUNT(*) AS n FROM customers').n,
  };
}

export function blocksRepo(db) {
  const map = (r) => ({
    id: r.id,
    barberId: r.barber_id,
    barberName: r.barber_name ?? null,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    allDay: r.start_min == null,
    start: r.start_min == null ? null : minutesToTime(r.start_min),
    end: r.end_min == null ? null : minutesToTime(r.end_min),
    startMin: r.start_min ?? 0,
    endMin: r.end_min ?? 24 * 60,
    reason: r.reason,
  });

  return {
    between(from, to) {
      return db
        .all('SELECT * FROM time_blocks WHERE date_from <= ? AND date_to >= ?', [to, from])
        .map(map);
    },
    listFrom(from) {
      return db
        .all(
          `SELECT t.*, b.name AS barber_name FROM time_blocks t LEFT JOIN barbers b ON b.id = t.barber_id
           WHERE t.date_to >= ? ORDER BY t.date_from, t.start_min`,
          [from],
        )
        .map(map);
    },
    create(b) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO time_blocks (barber_id, date_from, date_to, start_min, end_min, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [b.barberId, b.dateFrom, b.dateTo, b.allDay ? null : b.startMin, b.allDay ? null : b.endMin, b.reason],
      );
      return Number(lastInsertRowid);
    },
    remove(id) {
      const { changes } = db.run('DELETE FROM time_blocks WHERE id = ?', [id]);
      if (!changes) throw new HttpError(404, 'Time block not found.');
    },
  };
}

export function reviewsRepo(db) {
  const map = (r) =>
    r && {
      id: r.id,
      author: r.author,
      rating: r.rating,
      body: r.body,
      reviewDate: r.review_date,
      source: r.source,
      isPublished: !!r.is_published,
      sortOrder: r.sort_order,
    };
  return {
    list({ publishedOnly = false } = {}) {
      const where = publishedOnly ? 'WHERE is_published = 1' : '';
      return db.all(`SELECT * FROM reviews ${where} ORDER BY sort_order, review_date DESC, id DESC`).map(map);
    },
    get: (id) => map(db.get('SELECT * FROM reviews WHERE id = ?', [id])),
    create(r) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO reviews (author, rating, body, review_date, source, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [r.author, r.rating, r.body, r.reviewDate, r.source, r.isPublished, r.sortOrder],
      );
      return this.get(Number(lastInsertRowid));
    },
    update(id, r) {
      const { changes } = db.run(
        'UPDATE reviews SET author = ?, rating = ?, body = ?, review_date = ?, source = ?, is_published = ?, sort_order = ? WHERE id = ?',
        [r.author, r.rating, r.body, r.reviewDate, r.source, r.isPublished, r.sortOrder, id],
      );
      if (!changes) throw new HttpError(404, 'Review not found.');
      return this.get(id);
    },
    remove(id) {
      const { changes } = db.run('DELETE FROM reviews WHERE id = ?', [id]);
      if (!changes) throw new HttpError(404, 'Review not found.');
    },
  };
}
