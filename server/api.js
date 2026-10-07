import express from 'express';
import bcrypt from 'bcryptjs';
import { all, one, run, getContent } from './db.js';
import {
  HttpError,
  parseIdentifier,
  publicUser,
  hashPassword,
  verifyPassword,
  validatePassword,
  createSession,
  destroySession,
  destroyOtherSessions,
  requireUser,
  rateLimit,
} from './auth.js';
import { findProducts, findProduct, quote, newOrderRef, shapeOrder, addHistory, settings } from './shop.js';
import { availableMethods, gateways } from './payments.js';
import { config } from './config.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);

export const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

export function publicSettings() {
  const s = settings();
  return {
    shippingFee: s.shippingFee,
    freeShippingOver: s.freeShippingOver,
    sitewideDiscount: s.sitewideDiscount,
    sitewideDiscountLabel: s.sitewideDiscountLabel,
    requireLogin: s.requireLogin,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    instagram: s.instagram,
  };
}

function cleanAddress(a = {}) {
  return {
    fullName: str(a.fullName, 100),
    phone: str(a.phone, 30),
    email: str(a.email, 254),
    line1: str(a.line1, 200),
    line2: str(a.line2, 200),
    city: str(a.city, 80),
    province: str(a.province, 80),
    postalCode: str(a.postalCode, 20),
  };
}

export function apiRoutes() {
  const r = express.Router();
  const authLimit = rateLimit({ windowMs: 15 * 60e3, max: 20 });

  // ---------- Auth ----------
  r.post('/auth/register', authLimit, async (req, res) => {
    const name = str(req.body.name, 100);
    const id = parseIdentifier(req.body.identifier);
    if (!name) throw new HttpError(400, 'Please enter your name.');
    if (!id) throw new HttpError(400, 'Enter a valid email address or mobile number (e.g. 03001234567).');
    validatePassword(req.body.password);
    const exists = id.email ? one('SELECT 1 FROM users WHERE email = ?', id.email) : one('SELECT 1 FROM users WHERE phone = ?', id.phone);
    if (exists) throw new HttpError(409, 'An account with this email or phone already exists. Please sign in.');
    const hash = await hashPassword(req.body.password);
    const result = run('INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)', name, id.email || null, id.phone || null, hash);
    const user = one('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid));
    createSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  r.post('/auth/login', authLimit, async (req, res) => {
    const id = parseIdentifier(req.body.identifier);
    const user = id && (id.email ? one('SELECT * FROM users WHERE email = ?', id.email) : one('SELECT * FROM users WHERE phone = ?', id.phone));
    // Compare against a dummy hash when the user is missing so timing doesn't reveal which accounts exist.
    const ok = await verifyPassword(String(req.body.password || ''), user?.password_hash || DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Incorrect email/phone or password.');
    createSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  r.post('/auth/logout', (req, res) => {
    destroySession(req, res);
    res.json({ ok: true });
  });

  r.get('/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));

  // ---------- Account ----------
  r.put('/account/profile', requireUser, (req, res) => {
    const name = str(req.body.name, 100) || req.user.name;
    let email = req.user.email;
    let phone = req.user.phone;
    if (req.body.email !== undefined) {
      const v = str(req.body.email, 254);
      if (v) {
        const id = parseIdentifier(v);
        if (!id?.email) throw new HttpError(400, 'Enter a valid email address.');
        email = id.email;
      } else email = null;
    }
    if (req.body.phone !== undefined) {
      const v = str(req.body.phone, 30);
      if (v) {
        const id = parseIdentifier(v);
        if (!id?.phone) throw new HttpError(400, 'Enter a valid mobile number.');
        phone = id.phone;
      } else phone = null;
    }
    if (!email && !phone) throw new HttpError(400, 'Keep at least an email or a phone number on your account.');
    if (email && one('SELECT 1 FROM users WHERE email = ? AND id != ?', email, req.user.id)) throw new HttpError(409, 'That email is used by another account.');
    if (phone && one('SELECT 1 FROM users WHERE phone = ? AND id != ?', phone, req.user.id)) throw new HttpError(409, 'That phone is used by another account.');
    const address = req.body.address ? JSON.stringify(cleanAddress(req.body.address)) : req.user.address;
    run('UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?', name, email, phone, address, req.user.id);
    res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', req.user.id)) });
  });

  r.put('/account/password', requireUser, authLimit, async (req, res) => {
    if (!(await verifyPassword(String(req.body.current || ''), req.user.password_hash))) throw new HttpError(400, 'Your current password is incorrect.');
    validatePassword(req.body.password);
    run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(req.body.password), req.user.id);
    destroyOtherSessions(req.user.id, req);
    res.json({ ok: true });
  });

  // ---------- Catalog & content ----------
  r.get('/site', (_req, res) => {
    res.json({
      hero: getContent('hero'),
      announcement: getContent('announcement'),
      story: getContent('story'),
      settings: publicSettings(),
      testimonials: all('SELECT id, name, location, text, rating FROM testimonials WHERE active = 1 ORDER BY sort, id'),
      paymentMethods: availableMethods(),
      paymentMode: config.paymentMode,
    });
  });

  r.get('/categories', (_req, res) => {
    res.json(
      all(
        `SELECT c.id, c.slug, c.name, c.tagline, c.color,
          (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS productCount
         FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.id`
      )
    );
  });

  r.get('/products', (req, res) => {
    res.json(findProducts({ category: str(req.query.category, 80), q: str(req.query.q, 80), featured: req.query.featured === '1' }));
  });

  r.get('/products/:slug', (req, res) => {
    const p = findProduct(req.params.slug);
    if (!p || !p.active) throw new HttpError(404, 'Product not found.');
    const related = p.category ? findProducts({ category: p.category.slug }).filter((x) => x.id !== p.id).slice(0, 4) : [];
    res.json({ product: p, related });
  });

  // ---------- Cart & orders ----------
  r.post('/cart/quote', (req, res) => {
    res.json(quote(req.body.items, req.body.coupon));
  });

  r.post('/orders', requireUser, (req, res) => {
    const method = str(req.body.paymentMethod, 30);
    if (!availableMethods().some((m) => m.id === method)) throw new HttpError(400, 'Please choose a payment method. Cash on delivery is not available.');
    const q = quote(req.body.items, req.body.coupon);
    if (q.problems.length) throw new HttpError(409, q.problems.map((p) => p.message).join(' '));
    if (q.couponError) throw new HttpError(400, q.couponError);
    const ship = cleanAddress(req.body.shipping);
    for (const [k, label] of [['fullName', 'full name'], ['phone', 'phone number'], ['line1', 'address'], ['city', 'city']]) {
      if (!ship[k]) throw new HttpError(400, `Please enter your ${label}.`);
    }
    if (!parseIdentifier(ship.phone)?.phone) throw new HttpError(400, 'Enter a valid mobile number for delivery.');
    const ref = newOrderRef();
    const items = q.lines.map((l) => ({ productId: l.productId, slug: l.slug, name: l.name, sizeMl: l.sizeMl, unitPrice: l.unitPrice, qty: l.qty, lineTotal: l.lineTotal, bottle: l.bottle, imageUrl: l.imageUrl }));
    run(
      `INSERT INTO orders (ref, user_id, items, subtotal, discount, shipping, total, coupon_code, payment_method, shipping_address, history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ref, req.user.id, JSON.stringify(items), q.subtotal, q.discount, q.shipping, q.total, q.coupon?.code || null, method,
      JSON.stringify(ship), addHistory({ history: '[]' }, 'pending_payment', 'Order placed')
    );
    if (req.body.saveAddress) run('UPDATE users SET address = ? WHERE id = ?', JSON.stringify(ship), req.user.id);
    res.status(201).json({ ref, total: q.total, payUrl: `/pay/${ref}/start` });
  });

  r.get('/orders', requireUser, (req, res) => {
    res.json(all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', req.user.id).map((o) => shapeOrder(o)));
  });

  r.get('/orders/:ref', requireUser, (req, res) => {
    const o = one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', req.params.ref, req.user.id);
    if (!o) throw new HttpError(404, 'Order not found.');
    res.json(shapeOrder(o));
  });

  r.post('/orders/:ref/cancel', requireUser, (req, res) => {
    const o = one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', req.params.ref, req.user.id);
    if (!o) throw new HttpError(404, 'Order not found.');
    if (o.payment_status === 'paid' || !['pending_payment', 'payment_failed'].includes(o.status)) {
      throw new HttpError(400, 'Paid orders can only be cancelled by contacting us.');
    }
    run("UPDATE orders SET status = 'cancelled', history = ?, updated_at = datetime('now') WHERE id = ?", addHistory(o, 'cancelled', 'Cancelled by customer'), o.id);
    res.json(shapeOrder(one('SELECT * FROM orders WHERE id = ?', o.id)));
  });

  r.get('/payment-methods', (_req, res) => res.json({ methods: availableMethods(), mode: config.paymentMode, all: Object.values(gateways).map((g) => g.label) }));

  return r;
}
