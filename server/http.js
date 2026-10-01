import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { HttpError } from './lib/errors.js';

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, ...handlers) {
    const keys = [];
    const source = pattern.replace(/\/:([a-zA-Z]+)/g, (_, key) => {
      keys.push(key);
      return '/([^/]+)';
    });
    this.routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handlers });
    return this;
  }

  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      const lookup = method === 'HEAD' ? 'GET' : method;
      if (r.method !== lookup) {
        pathMatched = true;
        continue;
      }
      const params = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge != null) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function readJson(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.includes('application/json')) {
      reject(new HttpError(415, 'Requests must be sent as JSON.'));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Malformed JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  'frame-src https://www.google.com https://maps.google.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(res, { hsts = false } = {}) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;

function negotiateEncoding(req) {
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return null;
}

function compress(buf, enc) {
  if (enc === 'br') {
    return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  }
  return zlib.gzipSync(buf, { level: 6 });
}

/** Sends a body with optional compression, ETag and 304 support. */
export function sendBody(req, res, status, body, { type, cache = 'no-store', etag = true, encoded = null } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  if (etag && status === 200) {
    const tag = `"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20)}"`;
    res.setHeader('ETag', tag);
    if (req.headers['if-none-match'] === tag) {
      res.statusCode = 304;
      res.end();
      return;
    }
  }
  let out = buf;
  const baseType = type.split(';')[0];
  if (buf.length > 1024 && COMPRESSIBLE.test(baseType)) {
    const enc = negotiateEncoding(req);
    res.setHeader('Vary', 'Accept-Encoding');
    if (enc) {
      out = encoded?.[enc] ?? compress(buf, enc);
      res.setHeader('Content-Encoding', enc);
    }
  }
  res.statusCode = status;
  res.setHeader('Content-Length', out.length);
  res.end(req.method === 'HEAD' ? undefined : out);
}

export function sendJson(req, res, status, data) {
  sendBody(req, res, status, JSON.stringify(data), {
    type: 'application/json; charset=utf-8',
    cache: 'no-store',
    etag: false,
  });
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Serves files from `root`. Files are cached in memory (with pre-compressed
 * variants) and refreshed when their mtime changes. Requests carrying a
 * `?v=` content hash are cached immutably by browsers.
 */
export function createStaticHandler(root) {
  const cache = new Map();
  const rootResolved = path.resolve(root);

  async function load(file) {
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat || !stat.isFile()) return null;
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
    const buf = await fs.promises.readFile(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const entry = { buf, type, mtimeMs: stat.mtimeMs, encoded: {} };
    if (buf.length > 1024 && COMPRESSIBLE.test(type.split(';')[0])) {
      entry.encoded.br = compress(buf, 'br');
      entry.encoded.gzip = compress(buf, 'gzip');
    }
    cache.set(file, entry);
    return entry;
  }

  async function serve(req, res, pathname, search) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    if (rel.includes('\0')) return false;
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(rootResolved, `.${path.posix.normalize(rel)}`);
    if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) return false;
    if (path.basename(file).startsWith('.')) return false;

    const entry = await load(file);
    if (!entry) return false;
    const versioned = /[?&]v=/.test(search);
    let cache = 'no-cache';
    if (versioned) cache = 'public, max-age=31536000, immutable';
    else if (/^image\/|^font\//.test(entry.type)) cache = 'public, max-age=604800';
    sendBody(req, res, 200, entry.buf, { type: entry.type, cache, encoded: entry.encoded });
    return true;
  }

  /** Short content hash for cache-busting asset URLs. */
  function version(publicPath) {
    try {
      const buf = fs.readFileSync(path.join(rootResolved, publicPath));
      return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
    } catch {
      return 'missing';
    }
  }

  return { serve, version };
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return {
    hit(key) {
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset <= now) {
        e = { count: 0, reset: now + windowMs };
        hits.set(key, e);
      }
      e.count++;
      return { ok: e.count <= max, retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
    },
    reset: (key) => hits.delete(key),
  };
}
