import fs from 'node:fs';
import path from 'node:path';
import {
  Router,
  clientIp,
  createStaticHandler,
  parseCookies,
  readJson,
  securityHeaders,
  sendBody,
  sendJson,
} from './http.js';
import { HttpError } from './lib/errors.js';
import { zonedNow } from './lib/time.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerPageRoutes } from './routes/pages.js';

const PAGE_TTL_MS = 60 * 60 * 1000;

/** Builds the request handler. Kept free of I/O setup so tests can create isolated apps. */
export function createApp({ config, store, scheduler, mailer, logger = console }) {
  const router = new Router();
  const statics = createStaticHandler(config.publicDir);

  /* Gallery manifest (content/gallery.json), re-read whenever the file changes. */
  let galleryCache = { mtimeMs: -1, items: [] };
  function gallery() {
    const file = path.join(config.contentDir, 'gallery.json');
    try {
      const { mtimeMs } = fs.statSync(file);
      if (mtimeMs !== galleryCache.mtimeMs) {
        const items = JSON.parse(fs.readFileSync(file, 'utf8'));
        galleryCache = { mtimeMs, items: Array.isArray(items) ? items : [] };
      }
    } catch (err) {
      if (galleryCache.mtimeMs === -1) logger.warn('[gallery] Could not read content/gallery.json:', err.message);
      galleryCache.mtimeMs = 0;
    }
    return galleryCache.items;
  }

  const assetUrls = new Map();
  const asset = (p) => {
    if (config.isProd && assetUrls.has(p)) return assetUrls.get(p);
    const url = `${p}?v=${statics.version(p)}`;
    assetUrls.set(p, url);
    return url;
  };

  function site() {
    return {
      business: store.settings.business(),
      hours: store.hours.list(),
      services: store.services.list({ activeOnly: true }),
      barbers: store.barbers.list({ activeOnly: true }),
      reviews: store.reviews.list({ publishedOnly: true }),
      booking: store.settings.booking(),
      gallery: gallery(),
      siteUrl: config.siteUrl,
      timezone: config.timezone,
      year: zonedNow(config.timezone).date.slice(0, 4),
      asset,
    };
  }

  /* Rendered pages are cached in production and cleared whenever an admin saves a change. */
  const pageCache = new Map();
  function cached(key, render) {
    if (!config.isProd) return String(render());
    const hit = pageCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.html;
    const htmlText = String(render());
    pageCache.set(key, { html: htmlText, expires: Date.now() + PAGE_TTL_MS });
    return htmlText;
  }
  const invalidate = () => pageCache.clear();

  const deps = { store, scheduler, mailer, config, site, gallery, cached, invalidate };
  registerPublicRoutes(router, deps);
  registerAdminRoutes(router, deps);
  const pages = registerPageRoutes(router, deps);

  const publicHost = new URL(config.siteUrl).host;
  function checkSameOrigin(req) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new HttpError(403, 'Cross-site requests are not allowed.');
    }
    const origin = req.headers.origin;
    if (!origin) return;
    const host = (config.trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    if (originHost !== host && originHost !== publicHost) throw new HttpError(403, 'Cross-site requests are not allowed.');
  }

  return async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/');
    securityHeaders(res, { hsts: config.isProd && config.siteUrl.startsWith('https://') });

    let bodyPromise;
    const ctx = {
      req,
      res,
      url,
      method: req.method,
      path: pathname,
      query: url.searchParams,
      params: {},
      status: 200,
      ip: clientIp(req, config.trustProxy),
      cookies: parseCookies(req.headers.cookie),
      body: () => (bodyPromise ??= readJson(req)),
      html: (status, body) => sendBody(req, res, status, body, { type: 'text/html; charset=utf-8', cache: 'no-cache' }),
      send: (status, body, type, cache = 'no-store') => sendBody(req, res, status, body, { type, cache }),
    };

    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) checkSameOrigin(req);

      const match = router.match(req.method, pathname);
      if (match?.route) {
        ctx.params = match.params;
        let result;
        for (const handler of match.route.handlers) {
          result = await handler(ctx);
          if (res.writableEnded) break;
        }
        if (!res.writableEnded) sendJson(req, res, ctx.status, result ?? { ok: true });
        return;
      }
      if (match?.methodNotAllowed) throw new HttpError(405, 'Method not allowed.');
      if (isApi) throw new HttpError(404, 'Not found.');
      if ((req.method === 'GET' || req.method === 'HEAD') && (await statics.serve(req, res, pathname, url.search))) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      sendBody(req, res, 404, pages.notFound(), { type: 'text/html; charset=utf-8', etag: false });
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const known = err instanceof HttpError;
      if (!known) logger.error(`[error] ${req.method} ${pathname}`, err);
      const status = known ? err.status : 500;
      if (err.extra?.retryAfter) res.setHeader('Retry-After', String(err.extra.retryAfter));
      if (isApi || !String(req.headers.accept || '').includes('text/html')) {
        const { retryAfter, ...extra } = err.extra ?? {};
        sendJson(req, res, status, {
          error: known ? err.message : 'Something went wrong on our end. Please try again, or call us to book.',
          ...(known ? extra : {}),
        });
      } else if (status === 404) {
        sendBody(req, res, 404, pages.notFound(), { type: 'text/html; charset=utf-8', etag: false });
      } else {
        sendBody(req, res, status, `<!doctype html><title>Error</title><p>Sorry, something went wrong. Please <a href="/">return home</a>.</p>`, {
          type: 'text/html; charset=utf-8',
          etag: false,
        });
      }
    }
  };
}
