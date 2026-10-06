import { html } from './html.js';
import { iconSprite } from './icons.js';

export function renderAdminShell(site) {
  return html`<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Dashboard | ${site.business.name}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<link rel="stylesheet" href="${site.asset('/assets/css/admin.css')}">
<script type="module" src="${site.asset('/assets/js/admin/app.js')}"></script>
</head>
<body>
${iconSprite}
<div id="app" class="app-loading" aria-busy="true">
  <div class="boot-spinner" role="status"><span class="spinner"></span><span class="visually-hidden">Loading dashboard…</span></div>
</div>
<div class="toasts" aria-live="polite" aria-atomic="false" data-toasts></div>
<noscript><p class="noscript">The dashboard needs JavaScript enabled.</p></noscript>
</body>
</html>`;
}
