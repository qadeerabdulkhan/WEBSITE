// Payment gateways: JazzCash, Easypaisa, NayaPay and Mastercard (MPGS hosted checkout).
// Card and wallet details are always entered on the gateway's own page, never on this site.
import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { one, run, getContent } from './db.js';
import { HttpError } from './auth.js';
import { markOrderPaid, markOrderFailed, addHistory } from './shop.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const sandbox = () => config.paymentMode !== 'live';

// Gateway timestamps are in Pakistan time (UTC+5).
function pkTime(date, withSeconds = true) {
  const d = new Date(date.getTime() + 5 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  const time = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return withSeconds ? base + time : [base, time];
}

function saveAttempt(order, data) {
  const existing = JSON.parse(order.payment_data || '{}');
  run('UPDATE orders SET payment_data = ? WHERE id = ?', JSON.stringify({ ...existing, ...data }), order.id);
}

// ---------------- JazzCash (Page Redirection v1.1) ----------------
export function jazzcashHash(fields, salt) {
  const keys = Object.keys(fields)
    .filter((k) => k.startsWith('pp') && k !== 'pp_SecureHash' && fields[k] !== '' && fields[k] != null)
    .sort();
  const message = [salt, ...keys.map((k) => fields[k])].join('&');
  return crypto.createHmac('sha256', salt).update(message, 'utf8').digest('hex').toUpperCase();
}

const jazzcash = {
  id: 'jazzcash',
  label: 'JazzCash',
  configured: () => !!(config.jazzcash.merchantId && config.jazzcash.password && config.jazzcash.integritySalt),
  start(order, _req, res) {
    const jc = config.jazzcash;
    const now = new Date();
    const txnRef = `T${order.ref}${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const fields = {
      pp_Version: '1.1',
      pp_TxnType: jc.txnType,
      pp_Language: 'EN',
      pp_MerchantID: jc.merchantId,
      pp_SubMerchantID: '',
      pp_Password: jc.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: txnRef,
      pp_Amount: String(order.total * 100),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: pkTime(now),
      pp_BillReference: order.ref,
      pp_Description: `ZAQA order ${order.ref}`,
      pp_TxnExpiryDateTime: pkTime(new Date(now.getTime() + 864e5)),
      pp_ReturnURL: `${config.baseUrl}/pay/jazzcash/return`,
      ppmpf_1: order.ref,
    };
    fields.pp_SecureHash = jazzcashHash(fields, jc.integritySalt);
    saveAttempt(order, { gateway: 'jazzcash', txnRef });
    const url = sandbox()
      ? 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/'
      : 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
    autoPost(res, url, fields, 'JazzCash');
  },
};

function jazzcashReturn(req, res) {
  const b = req.body || {};
  const ref = b.pp_BillReference || b.ppmpf_1;
  const order = ref && one("SELECT * FROM orders WHERE ref = ? AND payment_method = 'jazzcash'", ref);
  if (!order) return res.redirect('/account?payment=unknown');
  if (!b.pp_SecureHash || jazzcashHash(b, config.jazzcash.integritySalt) !== String(b.pp_SecureHash).toUpperCase()) {
    return res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=invalid`);
  }
  const data = { gateway: 'jazzcash', responseCode: b.pp_ResponseCode, message: b.pp_ResponseMessage, txnRef: b.pp_TxnRefNo };
  if (b.pp_ResponseCode === '000' && Number(b.pp_Amount) === order.total * 100) {
    markOrderPaid(order.ref, { paymentRef: b.pp_TxnRefNo, data, note: 'Paid with JazzCash' });
    return res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=success`);
  }
  if (b.pp_ResponseCode === '124') {
    // Voucher / pending: payment will be completed later at a JazzCash shop.
    saveAttempt(order, { ...data, pending: true });
    return res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=pending`);
  }
  markOrderFailed(order.ref, { data, note: `JazzCash: ${b.pp_ResponseMessage || 'payment failed'}` });
  res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=failed`);
}

// ---------------- Easypaisa (Easypay hosted checkout) ----------------
const easypaisaHost = () => (sandbox() ? 'https://easypaystg.easypaisa.com.pk' : 'https://easypay.easypaisa.com.pk');

export function easypaisaHash(fields, hashKey) {
  const message = Object.keys(fields)
    .filter((k) => fields[k] !== '' && fields[k] != null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(hashKey, 'utf8'), null);
  return Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]).toString('base64');
}

const easypaisa = {
  id: 'easypaisa',
  label: 'Easypaisa',
  configured: () => !!(config.easypaisa.storeId && config.easypaisa.hashKey && config.easypaisa.hashKey.length === 16),
  start(order, _req, res) {
    const ep = config.easypaisa;
    const ship = JSON.parse(order.shipping_address);
    const [d, t] = pkTime(new Date(Date.now() + 864e5), false);
    const fields = {
      amount: order.total.toFixed(1),
      autoRedirect: '1',
      emailAddr: ship.email || '',
      expiryDate: `${d} ${t}`,
      mobileNum: (ship.phone || '').replace(/^\+92/, '0'),
      orderRefNum: order.ref,
      paymentMethod: 'MA_PAYMENT_METHOD',
      postBackURL: `${config.baseUrl}/pay/easypaisa/confirm`,
      storeId: ep.storeId,
    };
    fields.merchantHashedReq = easypaisaHash(fields, ep.hashKey);
    saveAttempt(order, { gateway: 'easypaisa' });
    autoPost(res, `${easypaisaHost()}/easypay/Index.jsf`, fields, 'Easypaisa');
  },
};

// Step 2 of Easypay: the gateway sends the shopper back with an auth_token that we confirm.
function easypaisaConfirm(req, res) {
  const token = req.query.auth_token || req.body?.auth_token;
  if (!token) return res.redirect('/account?payment=failed');
  autoPost(res, `${easypaisaHost()}/easypay/Confirm.jsf`, { auth_token: token, postBackURL: `${config.baseUrl}/pay/easypaisa/return` }, 'Easypaisa');
}

async function easypaisaReturn(req, res) {
  const q = { ...req.query, ...(req.body || {}) };
  const order = q.orderRefNumber && one("SELECT * FROM orders WHERE ref = ? AND payment_method = 'easypaisa'", String(q.orderRefNumber));
  if (!order) return res.redirect('/account?payment=unknown');
  const back = (state) => res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=${state}`);
  if (q.status && q.status !== '0000' && q.status !== 'Success') {
    markOrderFailed(order.ref, { data: { gateway: 'easypaisa', status: q.status, desc: q.desc }, note: 'Easypaisa payment not completed' });
    return back('failed');
  }
  // The redirect itself can be forged, so the payment is only trusted after a server-side inquiry.
  const ep = config.easypaisa;
  if (!(ep.username && ep.password && ep.accountNum)) {
    saveAttempt(order, { gateway: 'easypaisa', awaitingVerification: true, status: q.status });
    run(
      "UPDATE orders SET payment_status = 'awaiting_verification', history = ?, updated_at = datetime('now') WHERE id = ?",
      addHistory(order, 'pending_payment', 'Easypaisa reported success; awaiting verification'),
      order.id
    );
    return back('pending');
  }
  try {
    const r = await fetch(`${easypaisaHost()}/easypay-service/rest/v4/inquire-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Credentials: Buffer.from(`${ep.username}:${ep.password}`).toString('base64'),
      },
      body: JSON.stringify({ orderId: order.ref, storeId: ep.storeId, accountNum: ep.accountNum }),
    });
    const data = await r.json();
    if (data.transactionStatus === 'PAID' && Math.round(Number(data.transactionAmount)) === order.total) {
      markOrderPaid(order.ref, { paymentRef: data.transactionId, data: { gateway: 'easypaisa', ...data }, note: 'Paid with Easypaisa' });
      return back('success');
    }
    markOrderFailed(order.ref, { data: { gateway: 'easypaisa', ...data }, note: 'Easypaisa payment not confirmed' });
    back('failed');
  } catch (err) {
    console.error('Easypaisa inquiry failed', err);
    back('pending');
  }
}

// ---------------- NayaPay ----------------
// NayaPay issues its merchant checkout API documentation to onboarded merchants.
// Fill in createCheckout() and verify() below from those docs; until then NayaPay
// works in simulate mode and is hidden from checkout in sandbox/live mode.
const nayapay = {
  id: 'nayapay',
  label: 'NayaPay',
  implemented: false,
  configured: () => nayapay.implemented && !!(config.nayapay.merchantId && config.nayapay.apiKey && config.nayapay.apiBase),
  start() {
    throw new HttpError(503, 'NayaPay is not available yet.');
  },
};

// ---------------- Mastercard (MPGS Hosted Checkout) ----------------
function mpgsRequest(method, path, body) {
  const mc = config.mastercard;
  return fetch(`${mc.gateway}/api/rest/version/${mc.apiVersion}/merchant/${mc.merchantId}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`merchant.${mc.merchantId}:${mc.apiPassword}`).toString('base64'),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

const mastercard = {
  id: 'mastercard',
  label: 'Mastercard / Visa card',
  configured: () => !!(config.mastercard.merchantId && config.mastercard.apiPassword),
  async start(order, _req, res) {
    const gatewayOrderId = `${order.ref}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const session = await mpgsRequest('POST', '/session', {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: `${config.baseUrl}/pay/mastercard/return?ref=${encodeURIComponent(order.ref)}`,
        merchant: { name: 'ZAQA — Fragrances by Zaqa' },
        displayControl: { billingAddress: 'HIDE', shipping: 'HIDE' },
      },
      order: { id: gatewayOrderId, amount: order.total.toFixed(2), currency: 'PKR', description: `ZAQA order ${order.ref}` },
    });
    if (!session?.session?.id) {
      console.error('MPGS session error', session);
      throw new HttpError(502, 'Could not start card payment. Please try another method.');
    }
    saveAttempt(order, { gateway: 'mastercard', gatewayOrderId, successIndicator: session.successIndicator });
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' ${config.mastercard.gateway}; connect-src 'self' ${config.mastercard.gateway}; frame-src ${config.mastercard.gateway}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:`
    );
    res.send(
      shell(
        'Card payment',
        `<p class="pay-note">Opening the secure Mastercard payment page…</p>
         <div id="mpgs" data-session="${esc(session.session.id)}"></div>
         <script src="${esc(config.mastercard.gateway)}/static/checkout/checkout.min.js" data-error="mpgsError" data-cancel="/account?payment=cancelled"></script>
         <script src="/js/pay-mpgs.js"></script>`
      )
    );
  },
};

async function mastercardReturn(req, res) {
  const order = req.query.ref && one("SELECT * FROM orders WHERE ref = ? AND payment_method = 'mastercard'", String(req.query.ref));
  if (!order) return res.redirect('/account?payment=unknown');
  const back = (state) => res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=${state}`);
  const pd = JSON.parse(order.payment_data || '{}');
  if (!pd.successIndicator || req.query.resultIndicator !== pd.successIndicator) {
    markOrderFailed(order.ref, { data: pd, note: 'Card payment not completed' });
    return back('failed');
  }
  try {
    const result = await mpgsRequest('GET', `/order/${encodeURIComponent(pd.gatewayOrderId)}`);
    const ok = result.result === 'SUCCESS' && ['CAPTURED', 'PURCHASED'].includes(result.status) && Number(result.amount) === order.total;
    if (ok) {
      markOrderPaid(order.ref, { paymentRef: pd.gatewayOrderId, data: { gateway: 'mastercard', status: result.status }, note: 'Paid by card' });
      return back('success');
    }
    markOrderFailed(order.ref, { data: { gateway: 'mastercard', status: result.status }, note: 'Card payment not confirmed' });
    back('failed');
  } catch (err) {
    console.error('MPGS order lookup failed', err);
    back('pending');
  }
}

// ---------------- Shared ----------------
export const gateways = { jazzcash, easypaisa, nayapay, mastercard };

// Manual transfer is usable when switched on and at least one account is filled in.
export function manualPayment() {
  const m = getContent('manualPayment', {}) || {};
  const ready = m.enabled && (m.jazzcashNumber || m.easypaisaNumber || m.nayapayNumber || m.bankIban);
  return ready ? m : null;
}

export function availableMethods() {
  const manual = manualPayment();
  // With manual transfers on, the simulated test gateways are hidden so real customers never see them.
  const showGateway = (g) => (config.paymentMode === 'simulate' ? !manual : g.configured());
  const methods = Object.values(gateways)
    .filter(showGateway)
    .map((g) => ({ id: g.id, label: g.label }));
  if (manual) methods.unshift({ id: 'manual', label: 'Bank / wallet transfer' });
  return methods;
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ZAQA</title><link rel="icon" href="/img/favicon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Manrope:wght@400;600&display=swap">
<link rel="stylesheet" href="/css/style.css"></head><body class="pay-page"><main class="pay-card">
<div class="pay-brand">ZAQA</div>${body}</main></body></html>`;
}

function autoPost(res, url, fields, label) {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  res.send(
    shell(
      label,
      `<p class="pay-note">Redirecting you to ${esc(label)} to complete your payment securely…</p>
       <form id="autopost" method="post" action="${esc(url)}">${inputs}
       <button class="btn" type="submit">Continue to ${esc(label)}</button></form>
       <script src="/js/pay-autopost.js"></script>`
    )
  );
}

const urlencoded = express.urlencoded({ extended: false, limit: '20kb' });

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function paymentRoutes() {
  const r = express.Router();

  function ownOrder(req) {
    if (!req.user) throw new HttpError(401, 'Please sign in.');
    const order = one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', req.params.ref, req.user.id);
    if (!order) throw new HttpError(404, 'Order not found.');
    return order;
  }

  r.get('/pay/:ref/start', async (req, res, next) => {
    try {
      if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      const order = ownOrder(req);
      if (order.payment_status === 'paid') return res.redirect(`/account?order=${encodeURIComponent(order.ref)}`);
      if (!['pending_payment', 'payment_failed'].includes(order.status)) throw new HttpError(400, 'This order can no longer be paid.');
      if (order.payment_method === 'manual') return res.redirect(`/transfer?order=${encodeURIComponent(order.ref)}`);
      const gateway = gateways[order.payment_method];
      if (!gateway) throw new HttpError(400, 'Unknown payment method.');
      if (config.paymentMode === 'simulate') return res.redirect(`/pay/sim/${encodeURIComponent(order.ref)}`);
      if (!gateway.configured()) throw new HttpError(503, `${gateway.label} is not available right now.`);
      await gateway.start(order, req, res);
    } catch (err) {
      next(err);
    }
  });

  // Gateway callbacks only exist for gateways that are really configured; in simulate mode
  // there is no secret to verify against, so a forged "paid" callback must not be accepted.
  const live = (gateway) => (req, _res, next) =>
    config.paymentMode !== 'simulate' && gateway.configured() ? next() : next(new HttpError(404, 'Not found'));
  r.post('/pay/jazzcash/return', live(jazzcash), urlencoded, jazzcashReturn);
  r.all('/pay/easypaisa/confirm', live(easypaisa), urlencoded, easypaisaConfirm);
  r.all('/pay/easypaisa/return', live(easypaisa), urlencoded, easypaisaReturn);
  r.get('/pay/mastercard/return', live(mastercard), mastercardReturn);

  // Simulated checkout, only in PAYMENT_MODE=simulate. Moves no real money.
  r.get('/pay/sim/:ref', (req, res, next) => {
    try {
      if (config.paymentMode !== 'simulate') throw new HttpError(404, 'Not found');
      if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      const order = ownOrder(req);
      const label = gateways[order.payment_method]?.label || order.payment_method;
      res.send(
        shell(
          `${label} test payment`,
          `<p class="pay-badge">Test mode — no real money moves</p>
           <h1 class="pay-title">${esc(label)}</h1>
           <p class="pay-note">Order <strong>${esc(order.ref)}</strong></p>
           <p class="pay-amount">Rs ${order.total.toLocaleString('en-PK')}</p>
           <p class="pay-note">On the live site the customer completes this step on the ${esc(label)} payment page.</p>
           <form method="post" class="pay-actions">
             <button class="btn" name="outcome" value="success">Approve payment</button>
             <button class="btn btn-ghost" name="outcome" value="fail">Decline</button>
           </form>`
        )
      );
    } catch (err) {
      next(err);
    }
  });

  r.post('/pay/sim/:ref', urlencoded, (req, res, next) => {
    try {
      if (config.paymentMode !== 'simulate') throw new HttpError(404, 'Not found');
      if (!sameOrigin(req)) throw new HttpError(403, 'Forbidden');
      const order = ownOrder(req);
      const label = gateways[order.payment_method]?.label || order.payment_method;
      if (req.body.outcome === 'success') {
        markOrderPaid(order.ref, { paymentRef: `SIM-${Date.now()}`, data: { gateway: 'simulate' }, note: `Paid with ${label} (test mode)` });
        return res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=success`);
      }
      markOrderFailed(order.ref, { data: { gateway: 'simulate' }, note: `${label} payment declined (test mode)` });
      res.redirect(`/account?order=${encodeURIComponent(order.ref)}&payment=failed`);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
