import crypto from 'node:crypto';
import { HttpError } from './auth.js';
import { all, one, run, tx, getContent } from './db.js';

export const ORDER_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'payment_failed'];

export function settings() {
  return getContent('settings', {});
}

export function effectivePrice(product, s = settings()) {
  const pct = Math.max(product.discount_percent || 0, Number(s.sitewideDiscount) || 0);
  return Math.round(product.price * (1 - Math.min(pct, 90) / 100));
}

export function shapeProduct(p, s = settings()) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category_slug ? { slug: p.category_slug, name: p.category_name, color: p.category_color } : null,
    categoryId: p.category_id,
    description: p.description,
    notes: { top: p.notes_top, heart: p.notes_heart, base: p.notes_base },
    sizeMl: p.size_ml,
    concentration: p.concentration,
    price: p.price,
    discountPercent: p.discount_percent,
    finalPrice: effectivePrice(p, s),
    stock: p.stock,
    bottle: { shape: p.bottle_shape, liquid: p.liquid_color, cap: p.cap_color, glass: p.glass_style },
    imageUrl: p.image_url,
    featured: !!p.featured,
    active: !!p.active,
  };
}

const PRODUCT_SELECT = `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.color AS category_color
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

export function findProducts({ category, q, featured, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('p.active = 1');
  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (featured) where.push('p.featured = 1');
  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ? OR p.notes_top LIKE ? OR p.notes_heart LIKE ? OR p.notes_base LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.featured DESC, p.id DESC`;
  const s = settings();
  return all(sql, ...params).map((p) => shapeProduct(p, s));
}

export function findProduct(slugOrId) {
  const p = one(`${PRODUCT_SELECT} WHERE p.slug = ? OR p.id = ?`, String(slugOrId), Number(slugOrId) || -1);
  return p ? shapeProduct(p) : null;
}

export function couponFor(code, subtotal) {
  if (!code) return null;
  const c = one('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', String(code).trim());
  if (!c || !c.active) throw new HttpError(400, 'This coupon code is not valid.');
  if (c.expires_at && new Date(c.expires_at) < new Date()) throw new HttpError(400, 'This coupon has expired.');
  if (c.usage_limit != null && c.used_count >= c.usage_limit) throw new HttpError(400, 'This coupon has reached its usage limit.');
  if (subtotal < c.min_order) throw new HttpError(400, `This coupon needs a minimum order of Rs ${c.min_order.toLocaleString('en-PK')}.`);
  const amount = c.type === 'percent' ? Math.round((subtotal * Math.min(c.value, 100)) / 100) : Math.min(c.value, subtotal);
  return { code: c.code, type: c.type, value: c.value, amount };
}

// Prices a cart from the database. Client-sent prices are never trusted.
export function quote(rawItems, couponCode) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Your cart is empty.');
  if (rawItems.length > 50) throw new HttpError(400, 'Too many items in cart.');
  const s = settings();
  const merged = new Map();
  for (const it of rawItems) {
    const qty = Math.floor(Number(it?.qty));
    if (!it?.slug || !Number.isFinite(qty) || qty < 1 || qty > 20) throw new HttpError(400, 'Invalid cart item.');
    merged.set(String(it.slug), (merged.get(String(it.slug)) || 0) + qty);
  }
  const lines = [];
  const problems = [];
  for (const [slug, qty] of merged) {
    const p = one(`${PRODUCT_SELECT} WHERE p.slug = ?`, slug);
    if (!p || !p.active) {
      problems.push({ slug, message: 'This product is no longer available.' });
      continue;
    }
    if (p.stock < qty) problems.push({ slug, message: p.stock > 0 ? `Only ${p.stock} left in stock.` : 'Out of stock.' });
    const unit = effectivePrice(p, s);
    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      sizeMl: p.size_ml,
      concentration: p.concentration,
      bottle: { shape: p.bottle_shape, liquid: p.liquid_color, cap: p.cap_color, glass: p.glass_style },
      imageUrl: p.image_url,
      unitPrice: unit,
      originalPrice: p.price,
      qty,
      lineTotal: unit * qty,
      stock: p.stock,
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  let coupon = null;
  let couponError = null;
  try {
    coupon = couponFor(couponCode, subtotal);
  } catch (err) {
    couponError = err.message;
  }
  const discount = coupon ? coupon.amount : 0;
  const afterDiscount = subtotal - discount;
  const freeOver = Number(s.freeShippingOver) || 0;
  const shipping = lines.length === 0 || (freeOver > 0 && afterDiscount >= freeOver) ? 0 : Number(s.shippingFee) || 0;
  return { lines, problems, subtotal, coupon, couponError, discount, shipping, total: afterDiscount + shipping };
}

export function newOrderRef() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ZQ${ymd}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function shapeOrder(o, { admin = false } = {}) {
  const out = {
    id: o.id,
    ref: o.ref,
    items: JSON.parse(o.items),
    subtotal: o.subtotal,
    discount: o.discount,
    shipping: o.shipping,
    total: o.total,
    couponCode: o.coupon_code,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    paymentRef: o.payment_ref,
    shippingAddress: JSON.parse(o.shipping_address),
    tracking: o.tracking,
    history: JSON.parse(o.history),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
  if (admin) {
    out.customer = o.user_name ? { name: o.user_name, email: o.user_email, phone: o.user_phone } : null;
    out.paymentData = JSON.parse(o.payment_data || '{}');
  }
  return out;
}

export function addHistory(order, status, note = '') {
  const history = JSON.parse(order.history || '[]');
  history.push({ status, note, at: new Date().toISOString() });
  return JSON.stringify(history);
}

// Marks an order paid exactly once: decrements stock and counts coupon use.
export function markOrderPaid(ref, { paymentRef, data, note }) {
  return tx(() => {
    const order = one('SELECT * FROM orders WHERE ref = ?', ref);
    if (!order) return null;
    if (order.payment_status === 'paid') return order;
    db_markPaid(order, paymentRef, data, note);
    return one('SELECT * FROM orders WHERE ref = ?', ref);
  });
}

function db_markPaid(order, paymentRef, data, note) {
  const items = JSON.parse(order.items);
  for (const it of items) run('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?', it.qty, it.productId);
  if (order.coupon_code) run('UPDATE coupons SET used_count = used_count + 1 WHERE code = ? COLLATE NOCASE', order.coupon_code);
  run(
    `UPDATE orders SET status = 'paid', payment_status = 'paid', payment_ref = ?, payment_data = ?, history = ?,
     updated_at = datetime('now') WHERE id = ?`,
    paymentRef || null,
    JSON.stringify(data || {}),
    addHistory(order, 'paid', note || 'Payment received'),
    order.id
  );
}

export function markOrderFailed(ref, { data, note }) {
  const order = one('SELECT * FROM orders WHERE ref = ?', ref);
  if (!order || order.payment_status === 'paid') return order;
  run(
    `UPDATE orders SET status = 'payment_failed', payment_status = 'failed', payment_data = ?, history = ?,
     updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(data || {}),
    addHistory(order, 'payment_failed', note || 'Payment was not completed'),
    order.id
  );
  return one('SELECT * FROM orders WHERE ref = ?', ref);
}
