import { renderHome } from '../views/home.js';
import { renderManage, renderNotFound } from '../views/pages.js';
import { renderAdminShell } from '../views/admin-shell.js';

export function registerPageRoutes(router, deps) {
  const { store, scheduler, config, site, cached } = deps;

  const home = (ctx) => ctx.html(200, cached('home', () => renderHome(site())));
  router.get('/', home);
  router.get('/book', home);

  router.get('/appointment/:token', (ctx) => {
    const token = ctx.params.token;
    const appt = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? store.appointments.getByToken(token) : null;
    if (!appt) return ctx.html(404, cached('404', () => renderNotFound(site())));
    const check = scheduler.canSelfCancel(appt);
    ctx.res.setHeader('Referrer-Policy', 'no-referrer');
    return ctx.html(200, renderManage(site(), appt, { canCancel: check.ok, reason: check.reason }));
  });

  const admin = (ctx) => ctx.html(200, cached('admin', () => renderAdminShell(site())));
  router.get('/admin', admin);

  router.get('/robots.txt', (ctx) => {
    ctx.send(
      200,
      ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /appointment/', '', `Sitemap: ${config.siteUrl}/sitemap.xml`, ''].join('\n'),
      'text/plain; charset=utf-8',
      'public, max-age=3600',
    );
  });

  router.get('/sitemap.xml', (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    // /book renders the home page (canonical "/"), so only the home page is listed.
    const urls = [{ loc: `${config.siteUrl}/`, priority: '1.0', changefreq: 'weekly' }];
    ctx.send(
      200,
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`,
      'application/xml; charset=utf-8',
      'public, max-age=3600',
    );
  });

  return { notFound: () => cached('404', () => renderNotFound(site())) };
}
