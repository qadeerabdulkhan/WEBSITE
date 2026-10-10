// End-to-end API tests: start the real server on a temp database and drive it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaqa-test-'));
const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
let server;
// The signing test imports server modules directly; keep their database in the temp dir too.
process.env.DB_FILE = path.join(dir, 'unit.db');

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(dir, 'test.db'), ADMIN_PASSWORD: 'admin-pass-123', PAYMENT_MODE: 'simulate' },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/categories`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
});

after(() => {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Minimal cookie-keeping client.
function client() {
  let cookie = '';
  return async (method, url, body, { json = true, headers = {} } = {}) => {
    const res = await fetch(BASE + url, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined && json ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON.
    }
    return { status: res.status, data, headers: res.headers };
  };
}

const shipping = { fullName: 'Test Buyer', phone: '03001112233', line1: '1 Mall Road', city: 'Lahore' };

test('storefront pages require sign-in, login page is public', async () => {
  const c = client();
  assert.equal((await c('GET', '/shop')).status, 302);
  assert.match((await c('GET', '/shop')).headers.get('location'), /^\/login\?next=/);
  assert.equal((await c('GET', '/login')).status, 200);
  assert.equal((await c('GET', '/admin')).status, 302);
});

test('register with phone number, then sign in with the other format', async () => {
  const c = client();
  const r = await c('POST', '/api/auth/register', { name: 'Sara', identifier: '+92 333 4445566', password: 'longenough' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.phone, '+923334445566');
  assert.equal((await c('GET', '/shop')).status, 200);
  const c2 = client();
  const login = await c2('POST', '/api/auth/login', { identifier: '03334445566', password: 'longenough' });
  assert.equal(login.status, 200);
  const bad = await client()('POST', '/api/auth/login', { identifier: '03334445566', password: 'wrong-password' });
  assert.equal(bad.status, 401);
});

test('rejects duplicate accounts and short passwords', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { name: 'A', identifier: 'a@b.pk', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { name: 'A', identifier: 'a@b.pk', password: 'longenough' })).status, 201);
  assert.equal((await client()('POST', '/api/auth/register', { name: 'A', identifier: 'A@B.pk', password: 'longenough' })).status, 409);
});

test('cart is priced on the server and coupons apply', async () => {
  const c = client();
  const q = await c('POST', '/api/cart/quote', { items: [{ slug: 'noir-absolu', qty: 2, price: 1 }], coupon: 'welcome10' });
  assert.equal(q.status, 200);
  assert.equal(q.data.subtotal, 17900); // 2 × Rs 8,950, ignoring the client's price
  assert.equal(q.data.discount, 1790);
  assert.equal(q.data.shipping, 0);
  assert.equal(q.data.total, 16110);
  const bad = await c('POST', '/api/cart/quote', { items: [{ slug: 'noir-absolu', qty: 1 }], coupon: 'NOPE' });
  assert.equal(bad.data.couponError, 'This coupon code is not valid.');
});

test('state-changing API calls must be JSON from the same origin', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', 'identifier=x&password=y', { json: false, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await c('POST', '/api/auth/login', { identifier: 'x', password: 'y' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('customers cannot reach admin APIs', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { name: 'Eve', identifier: 'eve@x.pk', password: 'longenough' });
  assert.equal((await c('GET', '/api/admin/orders')).status, 403);
  assert.equal((await c('PUT', '/api/admin/products/1', { price: 1 })).status, 403);
  assert.equal((await c('GET', '/admin')).status, 302);
});

test('full purchase: order, simulated payment, stock and admin tracking', async () => {
  const buyer = client();
  await buyer('POST', '/api/auth/register', { name: 'Buyer', identifier: 'buyer@x.pk', password: 'longenough' });
  const admin = client();
  assert.equal((await admin('POST', '/api/auth/login', { identifier: 'admin@zaqa.pk', password: 'admin-pass-123' })).status, 200);
  const before = (await admin('GET', '/api/admin/products')).data.find((p) => p.slug === 'santal-noir').stock;

  assert.equal((await buyer('POST', '/api/orders', { items: [{ slug: 'santal-noir', qty: 1 }], shipping, paymentMethod: 'cod' })).status, 400);
  const order = await buyer('POST', '/api/orders', { items: [{ slug: 'santal-noir', qty: 2 }], shipping, paymentMethod: 'easypaisa' });
  assert.equal(order.status, 201);
  assert.equal(order.data.total, 16900);

  const start = await buyer('GET', order.data.payUrl);
  assert.equal(start.status, 302);
  assert.equal(start.headers.get('location'), `/pay/sim/${order.data.ref}`);
  // Another user can't pay or see this order.
  assert.equal((await client()('GET', `/pay/sim/${order.data.ref}`)).status, 302);

  const pay = await buyer('POST', `/pay/sim/${order.data.ref}`, 'outcome=success', { json: false, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(pay.status, 302);
  const mine = await buyer('GET', `/api/orders/${order.data.ref}`);
  assert.equal(mine.data.status, 'paid');
  assert.equal(mine.data.paymentStatus, 'paid');

  const after = (await admin('GET', '/api/admin/products')).data.find((p) => p.slug === 'santal-noir').stock;
  assert.equal(after, before - 2);

  const upd = await admin('PUT', `/api/admin/orders/${order.data.ref}`, { status: 'shipped', tracking: 'TCS 1234' });
  assert.equal(upd.data.status, 'shipped');
  const seen = await buyer('GET', `/api/orders/${order.data.ref}`);
  assert.equal(seen.data.tracking, 'TCS 1234');
  assert.deepEqual(seen.data.history.map((h) => h.status), ['pending_payment', 'paid', 'shipped']);
});

test('gateway callbacks are disabled in simulate mode', async () => {
  const c = client();
  const r = await c('POST', '/pay/jazzcash/return', 'pp_BillReference=X&pp_ResponseCode=000', { json: false, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 404);
});

test('admin manages products, discounts and homepage content', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@zaqa.pk', password: 'admin-pass-123' });
  const created = await admin('POST', '/api/admin/products', { name: 'Test Musk', price: 5000, discountPercent: 20, stock: 3, liquidColor: '#123456' });
  assert.equal(created.status, 201);
  assert.equal(created.data.finalPrice, 4000);
  const edited = await admin('PUT', `/api/admin/products/${created.data.id}`, { price: 6000 });
  assert.equal(edited.data.finalPrice, 4800);

  await admin('PUT', '/api/admin/content', { settings: { sitewideDiscount: 25 }, hero: { title: 'New headline', ctaLink: '//evil.example' } });
  const site = await client()('GET', '/api/site');
  assert.equal(site.data.hero.title, 'New headline');
  assert.equal(site.data.hero.ctaLink, '/categories');
  const p = await admin('GET', '/api/products/test-musk');
  assert.equal(p.data.product.finalPrice, 4500); // site-wide 25% beats the product's 20%
  await admin('PUT', '/api/admin/content', { settings: { sitewideDiscount: 0 } });

  const coupon = await admin('POST', '/api/admin/coupons', { code: 'eid500', type: 'fixed', value: 500, minOrder: 5000 });
  assert.equal(coupon.data.code, 'EID500');
  const q = await client()('POST', '/api/cart/quote', { items: [{ slug: 'test-musk', qty: 2 }], coupon: 'EID500' });
  assert.equal(q.data.discount, 500);

  assert.equal((await admin('DELETE', `/api/admin/products/${created.data.id}`)).status, 200);
});

test('JazzCash and Easypaisa request signing', async () => {
  const { jazzcashHash, easypaisaHash } = await import('../server/payments.js');
  // Reference: sorted non-empty pp_ values joined with "&" behind the salt, HMAC-SHA256 keyed by the salt.
  const crypto = await import('node:crypto');
  const fields = { pp_Amount: '100', pp_BankID: '', pp_TxnRefNo: 'T1', pp_MerchantID: 'MC1' };
  const expected = crypto.createHmac('sha256', 'salt').update('salt&100&MC1&T1').digest('hex').toUpperCase();
  assert.equal(jazzcashHash(fields, 'salt'), expected);
  const enc = easypaisaHash({ storeId: '1', amount: '10.0' }, '0123456789abcdef');
  const d = crypto.createDecipheriv('aes-128-ecb', Buffer.from('0123456789abcdef'), null);
  assert.equal(Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString(), 'amount=10.0&storeId=1');
});

test('manual transfer: own accounts, TID + screenshot, admin confirms', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@zaqa.pk', password: 'admin-pass-123' });
  // Turning it on needs no merchant keys.
  await admin('PUT', '/api/admin/content', { manualPayment: { enabled: true, jazzcashNumber: '03001234567', jazzcashTitle: 'Zaqa Owner' } });
  const site = await client()('GET', '/api/site');
  assert.deepEqual(site.data.paymentMethods.map((m) => m.id), ['manual']); // simulated gateways hidden
  assert.equal(site.data.manualPayment.accounts[0].number, '03001234567');

  const buyer = client();
  await buyer('POST', '/api/auth/register', { name: 'Transfer Buyer', identifier: 'transfer@x.pk', password: 'longenough' });
  const order = await buyer('POST', '/api/orders', { items: [{ slug: 'mint-verde', qty: 1 }], shipping, paymentMethod: 'manual' });
  assert.equal(order.status, 201);
  const start = await buyer('GET', order.data.payUrl);
  assert.equal(start.headers.get('location'), `/transfer?order=${order.data.ref}`);

  // 1x1 PNG
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal((await buyer('POST', `/api/orders/${order.data.ref}/transfer`, { tid: '12345678', paidTo: 'jazzcash' })).status, 400);
  const sent = await buyer('POST', `/api/orders/${order.data.ref}/transfer`, { tid: '1234 5678', paidTo: 'jazzcash', sender: 'Ali', receipt: png });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.paymentStatus, 'awaiting_verification');

  // The same TID can't be reused for another order.
  const order2 = await buyer('POST', '/api/orders', { items: [{ slug: 'mint-verde', qty: 1 }], shipping, paymentMethod: 'manual' });
  assert.equal((await buyer('POST', `/api/orders/${order2.data.ref}/transfer`, { tid: '12345678', receipt: png })).status, 409);

  // Admin sees the details and the private screenshot, then confirms.
  const detail = await admin('GET', `/api/admin/orders/${order.data.ref}`);
  assert.equal(detail.data.paymentData.tid, '12345678');
  assert.equal((await admin('GET', `/api/admin/receipts/${detail.data.paymentData.receipt}`)).status, 200);
  assert.equal((await buyer('GET', `/api/admin/receipts/${detail.data.paymentData.receipt}`)).status, 403);
  const paid = await admin('PUT', `/api/admin/orders/${order.data.ref}`, { markPaid: true });
  assert.equal(paid.data.paymentStatus, 'paid');
  assert.equal(paid.data.paymentRef, '12345678');

  await admin('PUT', '/api/admin/content', { manualPayment: { enabled: false } });
});
