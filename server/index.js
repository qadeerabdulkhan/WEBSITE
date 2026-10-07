import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { seed } from './seed.js';
import { loadUser, HttpError } from './auth.js';
import { apiRoutes } from './api.js';
import { adminRoutes } from './admin.js';
import { paymentRoutes } from './payments.js';
import { settings } from './shop.js';

seed();

const app = express();
app.disable('x-powered-by');
if (config.production) app.set('trust proxy', 1);

const GATEWAY_FORM_HOSTS = [
  'https://sandbox.jazzcash.com.pk',
  'https://payments.jazzcash.com.pk',
  'https://easypaystg.easypaisa.com.pk',
  'https://easypay.easypaisa.com.pk',
].join(' ');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      `form-action 'self' ${GATEWAY_FORM_HOSTS}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});

app.use(loadUser);

// Large JSON only for image uploads; everything else stays small.
app.use('/api/admin/upload', express.json({ limit: '6mb' }));
app.use('/api', express.json({ limit: '200kb' }));

// CSRF defence: state-changing API calls must be JSON from this origin.
app.use('/api', (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // HTML forms can't send DELETE, so it only needs the origin check below.
    if (req.method !== 'DELETE' && !req.is('application/json')) return next(new HttpError(415, 'Expected JSON.'));
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return next(new HttpError(403, 'Cross-origin request blocked.'));
      } catch {
        return next(new HttpError(403, 'Cross-origin request blocked.'));
      }
    }
  }
  next();
});

// Express 4 does not catch rejected promises from async handlers.
function catchAsync(router) {
  for (const layer of router.stack) {
    for (const l of layer.route?.stack || []) {
      const fn = l.handle;
      if (fn.length < 4) {
        l.handle = (req, res, next) => {
          try {
            const p = fn(req, res, next);
            if (p && typeof p.catch === 'function') p.catch(next);
          } catch (err) {
            next(err);
          }
        };
      }
    }
  }
  return router;
}

app.use('/api/admin', catchAsync(adminRoutes()));
app.use('/api', catchAsync(apiRoutes()));
app.use(catchAsync(paymentRoutes()));

// Page access: shoppers sign in first (configurable), the dashboard is admin-only.
const PAGES = ['index', 'categories', 'shop', 'product', 'cart', 'checkout', 'account', 'admin', 'login'];
const pageFile = (name) => path.join(config.root, 'public', `${name}.html`);

app.get(['/', ...PAGES.map((p) => `/${p}`), ...PAGES.map((p) => `/${p}.html`)], (req, res) => {
  const name = req.path === '/' ? 'index' : req.path.slice(1).replace(/\.html$/, '');
  const next = encodeURIComponent(req.originalUrl);
  if (name === 'login') {
    if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/');
    return res.sendFile(pageFile('login'));
  }
  if (name === 'admin') {
    if (!req.user) return res.redirect(`/login?next=${next}`);
    if (req.user.role !== 'admin') return res.redirect('/');
    return res.sendFile(pageFile('admin'));
  }
  const needsLogin = ['checkout', 'account'].includes(name) || settings().requireLogin;
  if (needsLogin && !req.user) return res.redirect(`/login?next=${next}`);
  res.sendFile(pageFile(name));
});

app.use('/uploads', express.static(config.uploadsDir, { maxAge: config.production ? '7d' : 0 }));
app.use(express.static(path.join(config.root, 'public'), { index: false, maxAge: config.production ? '1h' : 0 }));

app.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 && !(err instanceof HttpError) ? 'Something went wrong. Please try again.' : err.message;
  if (req.path.startsWith('/api')) return res.status(status).json({ error: message });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.status(status).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZAQA</title><link rel="icon" href="/img/favicon.png"><link rel="stylesheet" href="/css/style.css"></head>
<body class="pay-page"><main class="pay-card"><div class="pay-brand">ZAQA</div>
<h1 class="pay-title">${status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
<p class="pay-note">${esc(status === 404 ? 'The page you are looking for does not exist.' : message)}</p>
<a class="btn" href="/">Back to ZAQA</a></main></body></html>`);
});

app.listen(config.port, () => {
  console.log(`ZAQA running at ${config.baseUrl} (payments: ${config.paymentMode})`);
});
