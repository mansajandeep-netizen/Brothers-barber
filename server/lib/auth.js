import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './errors.js';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

// Compared against when an email is unknown, so response timing doesn't reveal which accounts exist.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyHash);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const mapUser = (r) =>
  r && {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  };

export function usersRepo(db) {
  return {
    count: () => db.get('SELECT COUNT(*) AS n FROM users').n,
    list: () => db.all('SELECT * FROM users ORDER BY role, name').map(mapUser),
    get: (id) => mapUser(db.get('SELECT * FROM users WHERE id = ?', [id])),
    /** Includes the password hash — only for login. */
    getForLogin: (email) => db.get('SELECT * FROM users WHERE email = ?', [email]),
    async create({ email, name, password, role }) {
      if (db.get('SELECT 1 AS x FROM users WHERE email = ?', [email])) {
        throw new HttpError(409, 'A user with that email already exists.');
      }
      const hash = await hashPassword(password);
      const { lastInsertRowid } = db.run('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', [
        email,
        name,
        hash,
        role,
      ]);
      return this.get(Number(lastInsertRowid));
    },
    update(id, { email, name, role }) {
      if (db.get('SELECT 1 AS x FROM users WHERE email = ? AND id <> ?', [email, id])) {
        throw new HttpError(409, 'A user with that email already exists.');
      }
      const { changes } = db.run('UPDATE users SET email = ?, name = ?, role = ? WHERE id = ?', [email, name, role, id]);
      if (!changes) throw new HttpError(404, 'User not found.');
      return this.get(id);
    },
    async setPassword(id, password) {
      const hash = await hashPassword(password);
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    },
    remove(id) {
      const { changes } = db.run('DELETE FROM users WHERE id = ?', [id]);
      if (!changes) throw new HttpError(404, 'User not found.');
    },
    ownerCount: () => db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").n,
    touchLogin: (id) => db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [id]),
  };
}

export function sessionsRepo(db, { days }) {
  const ttl = days * 24 * 60 * 60 * 1000;
  return {
    ttlMs: ttl,
    create(userId, { ip, userAgent }) {
      const token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(24).toString('base64url');
      const now = Date.now();
      db.run(
        'INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sha256(token), userId, csrf, now + ttl, now, ip, String(userAgent || '').slice(0, 300)],
      );
      return { token, csrf };
    },
    /** Returns { sessionId, csrf, user } for a valid token, sliding the expiry forward. */
    lookup(token) {
      if (!token || token.length > 100) return null;
      const id = sha256(token);
      const row = db.get(
        `SELECT s.id AS sid, s.csrf_token, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`,
        [id],
      );
      if (!row) return null;
      const now = Date.now();
      if (row.expires_at < now) {
        db.run('DELETE FROM sessions WHERE id = ?', [id]);
        return null;
      }
      if (row.expires_at - now < ttl / 2) {
        db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', [now + ttl, id]);
      }
      return { sessionId: row.sid, csrf: row.csrf_token, user: mapUser(row) };
    },
    destroy: (sessionId) => db.run('DELETE FROM sessions WHERE id = ?', [sessionId]),
    destroyForUser: (userId, exceptSessionId = '') =>
      db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, exceptSessionId]),
    purgeExpired: () => db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]),
  };
}
