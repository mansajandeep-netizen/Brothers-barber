import { HttpError } from '../lib/errors.js';

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'service';
}

const mapService = (r) =>
  r && {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    durationMin: r.duration_min,
    priceCents: r.price_cents,
    priceFrom: !!r.price_from,
    isActive: !!r.is_active,
    sortOrder: r.sort_order,
  };

export function servicesRepo(db) {
  function uniqueSlug(name, exceptId = 0) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; db.get('SELECT 1 AS x FROM services WHERE slug = ? AND id <> ?', [slug, exceptId]); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  return {
    list({ activeOnly = false } = {}) {
      const where = activeOnly ? 'WHERE is_active = 1' : '';
      return db.all(`SELECT * FROM services ${where} ORDER BY sort_order, name`).map(mapService);
    },
    get: (id) => mapService(db.get('SELECT * FROM services WHERE id = ?', [id])),
    create(s) {
      const { lastInsertRowid } = db.run(
        `INSERT INTO services (slug, name, category, description, duration_min, price_cents, price_from, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uniqueSlug(s.name), s.name, s.category, s.description, s.durationMin, s.priceCents, s.priceFrom, s.isActive, s.sortOrder],
      );
      return this.get(Number(lastInsertRowid));
    },
    update(id, s) {
      const existing = this.get(id);
      if (!existing) throw new HttpError(404, 'Service not found.');
      const slug = s.name !== existing.name ? uniqueSlug(s.name, id) : existing.slug;
      db.run(
        `UPDATE services SET slug = ?, name = ?, category = ?, description = ?, duration_min = ?, price_cents = ?,
           price_from = ?, is_active = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`,
        [slug, s.name, s.category, s.description, s.durationMin, s.priceCents, s.priceFrom, s.isActive, s.sortOrder, id],
      );
      return this.get(id);
    },
    remove(id) {
      // Past appointments keep their service name snapshot (service_id is set to NULL).
      const { changes } = db.run('DELETE FROM services WHERE id = ?', [id]);
      if (!changes) throw new HttpError(404, 'Service not found.');
    },
  };
}

const mapBarber = (r) =>
  r && {
    id: r.id,
    name: r.name,
    title: r.title,
    workDays: r.work_days === '' ? [] : r.work_days.split(',').map(Number),
    isActive: !!r.is_active,
    sortOrder: r.sort_order,
  };

export function barbersRepo(db) {
  return {
    list({ activeOnly = false } = {}) {
      const where = activeOnly ? 'AND is_active = 1' : '';
      return db.all(`SELECT * FROM barbers WHERE is_deleted = 0 ${where} ORDER BY sort_order, name`).map(mapBarber);
    },
    /** Includes removed barbers — used to label historical appointments. */
    get: (id) => mapBarber(db.get('SELECT * FROM barbers WHERE id = ?', [id])),
    getLive: (id) => mapBarber(db.get('SELECT * FROM barbers WHERE id = ? AND is_deleted = 0', [id])),
    create(b) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO barbers (name, title, work_days, is_active, sort_order) VALUES (?, ?, ?, ?, ?)',
        [b.name, b.title, b.workDays.join(','), b.isActive, b.sortOrder],
      );
      return this.get(Number(lastInsertRowid));
    },
    update(id, b) {
      if (!this.getLive(id)) throw new HttpError(404, 'Barber not found.');
      db.run(
        `UPDATE barbers SET name = ?, title = ?, work_days = ?, is_active = ?, sort_order = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [b.name, b.title, b.workDays.join(','), b.isActive, b.sortOrder, id],
      );
      return this.get(id);
    },
    remove(id, today) {
      if (!this.getLive(id)) throw new HttpError(404, 'Barber not found.');
      const upcoming = db.get(
        "SELECT COUNT(*) AS n FROM appointments WHERE barber_id = ? AND status = 'booked' AND date >= ?",
        [id, today],
      ).n;
      if (upcoming > 0) {
        throw new HttpError(
          409,
          `This barber has ${upcoming} upcoming appointment${upcoming === 1 ? '' : 's'}. Reassign or cancel them first.`,
        );
      }
      db.run("UPDATE barbers SET is_deleted = 1, is_active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
    },
  };
}
