import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { all, one, run, tx, getContent, setContent } from './db.js';
import { HttpError, requireAdmin, publicUser } from './auth.js';
import { findProducts, findProduct, shapeOrder, addHistory, markOrderPaid, ORDER_STATUSES } from './shop.js';
import { str } from './api.js';
import { config } from './config.js';

const int = (v, { min = 0, max = 1e9, fallback = 0 } = {}) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const color = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : fallback);
const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
const SHAPES = ['classic', 'round', 'tall', 'flask', 'oud', 'mist'];

function uniqueSlug(table, base, exceptId = 0) {
  let slug = base || 'item';
  for (let i = 2; one(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`, slug, exceptId); i++) slug = `${base}-${i}`;
  return slug;
}

function imageUrl(v) {
  const s = str(v, 500);
  if (!s) return '';
  if (s.startsWith('/uploads/') || /^https:\/\//.test(s)) return s;
  throw new HttpError(400, 'Image must be an uploaded file or an https:// link.');
}

export function adminRoutes() {
  const r = express.Router();
  r.use(requireAdmin);

  // ---------- Overview ----------
  r.get('/stats', (_req, res) => {
    const paid = "payment_status = 'paid' AND status NOT IN ('cancelled','refunded')";
    res.json({
      revenue: one(`SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE ${paid}`).v,
      revenue30: one(`SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE ${paid} AND created_at >= datetime('now','-30 days')`).v,
      orders: one('SELECT COUNT(*) AS v FROM orders').v,
      toFulfil: one("SELECT COUNT(*) AS v FROM orders WHERE status IN ('paid','processing')").v,
      customers: one("SELECT COUNT(*) AS v FROM users WHERE role = 'customer'").v,
      products: one('SELECT COUNT(*) AS v FROM products WHERE active = 1').v,
      lowStock: all('SELECT id, slug, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock LIMIT 10'),
      byStatus: all('SELECT status, COUNT(*) AS count FROM orders GROUP BY status'),
      daily: all(
        `SELECT date(created_at) AS day, SUM(total) AS revenue, COUNT(*) AS orders FROM orders
         WHERE ${paid} AND created_at >= datetime('now','-13 days') GROUP BY day ORDER BY day`
      ),
      paymentMode: config.paymentMode,
    });
  });

  // ---------- Orders ----------
  const ORDER_SELECT = `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
    FROM orders o LEFT JOIN users u ON u.id = o.user_id`;

  r.get('/orders', (req, res) => {
    const where = [];
    const params = [];
    if (ORDER_STATUSES.includes(req.query.status)) {
      where.push('o.status = ?');
      params.push(req.query.status);
    }
    const q = str(req.query.q, 80);
    if (q) {
      where.push('(o.ref LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const rows = all(`${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 500`, ...params);
    res.json(rows.map((o) => shapeOrder(o, { admin: true })));
  });

  r.get('/orders/:ref', (req, res) => {
    const o = one(`${ORDER_SELECT} WHERE o.ref = ?`, req.params.ref);
    if (!o) throw new HttpError(404, 'Order not found.');
    res.json(shapeOrder(o, { admin: true }));
  });

  r.put('/orders/:ref', (req, res) => {
    const o = one('SELECT * FROM orders WHERE ref = ?', req.params.ref);
    if (!o) throw new HttpError(404, 'Order not found.');
    const note = str(req.body.note, 300);
    if (req.body.markPaid) {
      if (o.payment_status === 'paid') throw new HttpError(400, 'Order is already paid.');
      markOrderPaid(o.ref, { paymentRef: str(req.body.paymentRef, 80) || 'manual', data: { gateway: 'manual' }, note: note || 'Payment confirmed manually by admin' });
    } else {
      const status = ORDER_STATUSES.includes(req.body.status) ? req.body.status : o.status;
      const tracking = req.body.tracking !== undefined ? str(req.body.tracking, 120) : o.tracking;
      const history = status !== o.status || note ? addHistory(o, status, note) : o.history;
      run("UPDATE orders SET status = ?, tracking = ?, history = ?, updated_at = datetime('now') WHERE id = ?", status, tracking, history, o.id);
    }
    res.json(shapeOrder(one(`${ORDER_SELECT} WHERE o.id = ?`, o.id), { admin: true }));
  });

  // ---------- Products ----------
  r.get('/products', (_req, res) => res.json(findProducts({ includeInactive: true })));

  function productFields(b, existing = {}) {
    const name = str(b.name ?? existing.name, 120);
    if (!name) throw new HttpError(400, 'Product name is required.');
    const price = int(b.price ?? existing.price, { min: 0, max: 10_000_000 });
    if (!price) throw new HttpError(400, 'Price must be more than 0.');
    const categoryId = b.categoryId != null && b.categoryId !== '' ? int(b.categoryId) : existing.category_id ?? null;
    if (categoryId && !one('SELECT 1 FROM categories WHERE id = ?', categoryId)) throw new HttpError(400, 'Unknown category.');
    return {
      name,
      category_id: categoryId || null,
      description: str(b.description ?? existing.description, 3000),
      notes_top: str(b.notesTop ?? existing.notes_top, 200),
      notes_heart: str(b.notesHeart ?? existing.notes_heart, 200),
      notes_base: str(b.notesBase ?? existing.notes_base, 200),
      size_ml: int(b.sizeMl ?? existing.size_ml, { min: 1, max: 5000, fallback: 100 }),
      price,
      discount_percent: int(b.discountPercent ?? existing.discount_percent, { min: 0, max: 90 }),
      stock: int(b.stock ?? existing.stock, { min: 0, max: 1e6 }),
      bottle_shape: SHAPES.includes(b.bottleShape) ? b.bottleShape : existing.bottle_shape || 'classic',
      liquid_color: color(b.liquidColor, existing.liquid_color || '#d9a441'),
      cap_color: color(b.capColor, existing.cap_color || '#c9a96e'),
      image_url: b.imageUrl !== undefined ? imageUrl(b.imageUrl) : existing.image_url || '',
      featured: b.featured !== undefined ? bool(b.featured) : existing.featured || 0,
      active: b.active !== undefined ? bool(b.active) : existing.active ?? 1,
    };
  }

  r.post('/products', (req, res) => {
    const f = productFields(req.body);
    f.slug = uniqueSlug('products', slugify(req.body.slug || f.name));
    const cols = Object.keys(f);
    const result = run(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...Object.values(f));
    res.status(201).json(findProduct(Number(result.lastInsertRowid)));
  });

  r.put('/products/:id', (req, res) => {
    const existing = one('SELECT * FROM products WHERE id = ?', int(req.params.id));
    if (!existing) throw new HttpError(404, 'Product not found.');
    const f = productFields(req.body, existing);
    if (req.body.slug) f.slug = uniqueSlug('products', slugify(req.body.slug), existing.id);
    run(`UPDATE products SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(f), existing.id);
    res.json(findProduct(existing.id));
  });

  r.delete('/products/:id', (req, res) => {
    run('DELETE FROM products WHERE id = ?', int(req.params.id));
    res.json({ ok: true });
  });

  // Bulk price update, e.g. +10% across a category.
  r.post('/products/bulk-price', (req, res) => {
    const pct = int(req.body.percent, { min: -90, max: 500 });
    const categoryId = req.body.categoryId ? int(req.body.categoryId) : null;
    if (!pct) throw new HttpError(400, 'Enter a non-zero percentage.');
    const result = categoryId
      ? run('UPDATE products SET price = MAX(ROUND(price * (100 + ?) / 100.0), 1) WHERE category_id = ?', pct, categoryId)
      : run('UPDATE products SET price = MAX(ROUND(price * (100 + ?) / 100.0), 1)', pct);
    res.json({ updated: Number(result.changes) });
  });

  // ---------- Image upload ----------
  r.post('/upload', express.json({ limit: '6mb' }), (req, res) => {
    const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ''));
    if (!m) throw new HttpError(400, 'Upload a PNG, JPEG or WebP image.');
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 4 * 1024 * 1024) throw new HttpError(400, 'Image must be under 4 MB.');
    const sig = buf.subarray(0, 12);
    const valid =
      (m[2] === 'png' && sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (m[2] === 'jpeg' && sig[0] === 0xff && sig[1] === 0xd8) ||
      (m[2] === 'webp' && sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) throw new HttpError(400, 'That file is not a valid image.');
    const name = `${crypto.randomBytes(12).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadsDir, name), buf);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  // ---------- Categories ----------
  r.get('/categories', (_req, res) => {
    res.json(all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS productCount FROM categories c ORDER BY sort, id'));
  });

  function categoryFields(b, existing = {}) {
    const name = str(b.name ?? existing.name, 80);
    if (!name) throw new HttpError(400, 'Category name is required.');
    return {
      name,
      tagline: str(b.tagline ?? existing.tagline, 160),
      color: color(b.color, existing.color || '#c9a96e'),
      sort: int(b.sort ?? existing.sort, { min: -1000, max: 1000 }),
      active: b.active !== undefined ? bool(b.active) : existing.active ?? 1,
    };
  }

  r.post('/categories', (req, res) => {
    const f = categoryFields(req.body);
    f.slug = uniqueSlug('categories', slugify(req.body.slug || f.name));
    const result = run('INSERT INTO categories (slug, name, tagline, color, sort, active) VALUES (?, ?, ?, ?, ?, ?)', f.slug, f.name, f.tagline, f.color, f.sort, f.active);
    res.status(201).json(one('SELECT * FROM categories WHERE id = ?', Number(result.lastInsertRowid)));
  });

  r.put('/categories/:id', (req, res) => {
    const existing = one('SELECT * FROM categories WHERE id = ?', int(req.params.id));
    if (!existing) throw new HttpError(404, 'Category not found.');
    const f = categoryFields(req.body, existing);
    run('UPDATE categories SET name = ?, tagline = ?, color = ?, sort = ?, active = ? WHERE id = ?', f.name, f.tagline, f.color, f.sort, f.active, existing.id);
    res.json(one('SELECT * FROM categories WHERE id = ?', existing.id));
  });

  r.delete('/categories/:id', (req, res) => {
    run('DELETE FROM categories WHERE id = ?', int(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Coupons / discounts ----------
  r.get('/coupons', (_req, res) => res.json(all('SELECT * FROM coupons ORDER BY id DESC')));

  function couponFields(b, existing = {}) {
    const code = str(b.code ?? existing.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) throw new HttpError(400, 'Coupon code is required (letters and numbers).');
    const type = b.type === 'fixed' || b.type === 'percent' ? b.type : existing.type || 'percent';
    const value = int(b.value ?? existing.value, { min: 1, max: type === 'percent' ? 100 : 10_000_000 });
    if (!value) throw new HttpError(400, 'Discount value must be more than 0.');
    const expires = b.expiresAt !== undefined ? str(b.expiresAt, 30) : existing.expires_at;
    if (expires && Number.isNaN(Date.parse(expires))) throw new HttpError(400, 'Invalid expiry date.');
    const limit = b.usageLimit !== undefined ? b.usageLimit : existing.usage_limit;
    return {
      code,
      type,
      value,
      min_order: int(b.minOrder ?? existing.min_order, { min: 0 }),
      expires_at: expires || null,
      usage_limit: limit === '' || limit == null ? null : int(limit, { min: 1 }),
      active: b.active !== undefined ? bool(b.active) : existing.active ?? 1,
    };
  }

  r.post('/coupons', (req, res) => {
    const f = couponFields(req.body);
    if (one('SELECT 1 FROM coupons WHERE code = ? COLLATE NOCASE', f.code)) throw new HttpError(409, 'A coupon with that code already exists.');
    const result = run(
      'INSERT INTO coupons (code, type, value, min_order, expires_at, usage_limit, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      f.code, f.type, f.value, f.min_order, f.expires_at, f.usage_limit, f.active
    );
    res.status(201).json(one('SELECT * FROM coupons WHERE id = ?', Number(result.lastInsertRowid)));
  });

  r.put('/coupons/:id', (req, res) => {
    const existing = one('SELECT * FROM coupons WHERE id = ?', int(req.params.id));
    if (!existing) throw new HttpError(404, 'Coupon not found.');
    const f = couponFields(req.body, existing);
    if (one('SELECT 1 FROM coupons WHERE code = ? COLLATE NOCASE AND id != ?', f.code, existing.id)) throw new HttpError(409, 'A coupon with that code already exists.');
    run(
      'UPDATE coupons SET code = ?, type = ?, value = ?, min_order = ?, expires_at = ?, usage_limit = ?, active = ? WHERE id = ?',
      f.code, f.type, f.value, f.min_order, f.expires_at, f.usage_limit, f.active, existing.id
    );
    res.json(one('SELECT * FROM coupons WHERE id = ?', existing.id));
  });

  r.delete('/coupons/:id', (req, res) => {
    run('DELETE FROM coupons WHERE id = ?', int(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Testimonials ----------
  r.get('/testimonials', (_req, res) => res.json(all('SELECT * FROM testimonials ORDER BY sort, id')));

  function testimonialFields(b, existing = {}) {
    const name = str(b.name ?? existing.name, 80);
    const text = str(b.text ?? existing.text, 1000);
    if (!name || !text) throw new HttpError(400, 'Name and testimonial text are required.');
    return {
      name,
      text,
      location: str(b.location ?? existing.location, 80),
      rating: int(b.rating ?? existing.rating, { min: 1, max: 5, fallback: 5 }),
      sort: int(b.sort ?? existing.sort, { min: -1000, max: 1000 }),
      active: b.active !== undefined ? bool(b.active) : existing.active ?? 1,
    };
  }

  r.post('/testimonials', (req, res) => {
    const f = testimonialFields(req.body);
    const result = run('INSERT INTO testimonials (name, text, location, rating, sort, active) VALUES (?, ?, ?, ?, ?, ?)', f.name, f.text, f.location, f.rating, f.sort, f.active);
    res.status(201).json(one('SELECT * FROM testimonials WHERE id = ?', Number(result.lastInsertRowid)));
  });

  r.put('/testimonials/:id', (req, res) => {
    const existing = one('SELECT * FROM testimonials WHERE id = ?', int(req.params.id));
    if (!existing) throw new HttpError(404, 'Testimonial not found.');
    const f = testimonialFields(req.body, existing);
    run('UPDATE testimonials SET name = ?, text = ?, location = ?, rating = ?, sort = ?, active = ? WHERE id = ?', f.name, f.text, f.location, f.rating, f.sort, f.active, existing.id);
    res.json(one('SELECT * FROM testimonials WHERE id = ?', existing.id));
  });

  r.delete('/testimonials/:id', (req, res) => {
    run('DELETE FROM testimonials WHERE id = ?', int(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Site content (hero, announcement, story, settings) ----------
  r.get('/content', (_req, res) => {
    res.json({ hero: getContent('hero'), announcement: getContent('announcement'), story: getContent('story'), settings: getContent('settings') });
  });

  r.put('/content', (req, res) => {
    const b = req.body || {};
    tx(() => {
      if (b.hero) {
        const h = b.hero;
        setContent('hero', {
          eyebrow: str(h.eyebrow, 80),
          title: str(h.title, 120),
          subtitle: str(h.subtitle, 300),
          ctaText: str(h.ctaText, 40),
          ctaLink: /^\/(?!\/)/.test(str(h.ctaLink, 200)) ? str(h.ctaLink, 200) : '/categories',
        });
      }
      if (b.announcement) setContent('announcement', { text: str(b.announcement.text, 200), active: !!bool(b.announcement.active) });
      if (b.story) setContent('story', { title: str(b.story.title, 120), text: str(b.story.text, 2000) });
      if (b.settings) {
        const s = b.settings;
        const cur = getContent('settings', {});
        setContent('settings', {
          ...cur,
          shippingFee: int(s.shippingFee ?? cur.shippingFee, { min: 0, max: 100000 }),
          freeShippingOver: int(s.freeShippingOver ?? cur.freeShippingOver, { min: 0 }),
          sitewideDiscount: int(s.sitewideDiscount ?? cur.sitewideDiscount, { min: 0, max: 90 }),
          sitewideDiscountLabel: str(s.sitewideDiscountLabel ?? cur.sitewideDiscountLabel, 80),
          requireLogin: s.requireLogin !== undefined ? !!bool(s.requireLogin) : cur.requireLogin,
          contactEmail: str(s.contactEmail ?? cur.contactEmail, 254),
          contactPhone: str(s.contactPhone ?? cur.contactPhone, 40),
          instagram: /^https:\/\//.test(s.instagram || '') ? str(s.instagram, 200) : cur.instagram,
        });
      }
    });
    res.json({ hero: getContent('hero'), announcement: getContent('announcement'), story: getContent('story'), settings: getContent('settings') });
  });

  // ---------- Customers ----------
  r.get('/customers', (_req, res) => {
    const rows = all(
      `SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orderCount,
        (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS spent
       FROM users u ORDER BY u.id DESC LIMIT 1000`
    );
    res.json(rows.map((u) => ({ ...publicUser(u), createdAt: u.created_at, orderCount: u.orderCount, spent: u.spent })));
  });

  return r;
}
