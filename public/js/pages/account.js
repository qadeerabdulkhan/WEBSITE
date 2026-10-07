import { mountLayout } from '../layout.js';
import { api, logout } from '../api.js';
import { html, raw, setHTML, $, $$, rs, params, toast, statusLabel, formatDate } from '../util.js';
import { guardWebGL } from '../three/core.js';
import { paymentLabel } from '../swatch.js';

let user;
const panel = () => $('#panel');

const PAYMENT_MESSAGES = {
  success: ['ok', 'Payment received. Thank you! Your order is being prepared.'],
  failed: ['err', 'Your payment was not completed. You can try again below.'],
  pending: ['warn', 'Your payment is being confirmed. We’ll update your order as soon as the provider confirms it.'],
  invalid: ['err', 'We could not verify the payment response. If money was deducted, please contact us with your order number.'],
  cancelled: ['warn', 'Payment was cancelled.'],
  unknown: ['err', 'We could not find that order.'],
};

const STEPS = ['Placed', 'Paid', 'Shipped', 'Delivered'];
const stepIndex = (s) => ({ pending_payment: 0, payment_failed: 0, paid: 1, processing: 1, shipped: 2, delivered: 3 })[s] ?? 0;

function orderCard(o, highlight) {
  const step = stepIndex(o.status);
  const canPay = ['pending_payment', 'payment_failed'].includes(o.status) && o.paymentStatus !== 'paid' && o.paymentStatus !== 'awaiting_verification';
  const active = !['cancelled', 'refunded'].includes(o.status);
  return html`<article class="order-card" id="order-${o.ref}" ${highlight ? raw('style="border-color:var(--gold)"') : ''}>
    <div class="order-head">
      <div><strong>Order ${o.ref}</strong><div class="muted" style="font-size:.85rem">${formatDate(o.createdAt)} · ${paymentLabel(o.paymentMethod)}</div></div>
      <span class="status status-${o.status}">${statusLabel(o.status)}</span>
    </div>
    ${active ? html`<div class="progress-steps">${STEPS.map((_, i) => html`<div class="${i <= step ? 'done' : ''}"></div>`)}</div>
      <div class="progress-labels">${STEPS.map((s) => html`<span>${s}</span>`)}</div>` : ''}
    <div class="order-items">
      ${o.items.map((i) => html`<div><span>${i.name} × ${i.qty}</span><span>${rs(i.lineTotal)}</span></div>`)}
      ${o.discount ? html`<div class="muted"><span>Discount</span><span>− ${rs(o.discount)}</span></div>` : ''}
      <div class="muted"><span>Delivery</span><span>${o.shipping ? rs(o.shipping) : 'Free'}</span></div>
      <div><strong>Total</strong><strong>${rs(o.total)}</strong></div>
    </div>
    ${o.tracking ? html`<p class="notice" style="margin-top:1rem">Tracking: <strong>${o.tracking}</strong></p>` : ''}
    ${o.paymentStatus === 'awaiting_verification' ? html`<p class="notice warn" style="margin-top:1rem">Payment reported by the provider and awaiting confirmation.</p>` : ''}
    <details style="margin-top:1rem"><summary class="muted" style="cursor:pointer">Order history</summary>
      <ul class="timeline">${o.history.map((h) => html`<li><strong>${statusLabel(h.status)}</strong> · ${formatDate(h.at)}${h.note ? html`<br>${h.note}` : ''}</li>`)}</ul>
    </details>
    ${canPay ? html`<div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap"><a class="btn btn-sm" href="/pay/${encodeURIComponent(o.ref)}/start">Pay now</a><button class="btn btn-ghost btn-sm" data-cancel="${o.ref}">Cancel order</button></div>` : ''}
  </article>`;
}

async function showOrders() {
  setHTML(panel(), html`<p class="muted">Loading your orders…</p>`);
  const orders = await api('/orders');
  const p = params();
  const msg = PAYMENT_MESSAGES[p.get('payment')];
  setHTML(
    panel(),
    html`${msg ? html`<p class="notice ${msg[0]}" style="margin-bottom:1rem">${msg[1]}</p>` : ''}
    ${orders.length ? orders.map((o) => orderCard(o, o.ref === p.get('order'))) : html`<div class="empty"><h2>No orders yet</h2><p>When you place an order it will appear here with live status updates.</p><a class="btn" href="/shop" style="margin-top:1rem">Start shopping</a></div>`}`
  );
  if (p.get('order')) document.getElementById(`order-${p.get('order')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showProfile() {
  setHTML(
    panel(),
    html`<form class="card" id="profile-form"><h2>Profile</h2>
      <div class="form-grid">
        <div class="field full"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${user.name}" required></div>
        <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" name="email" type="email" value="${user.email || ''}"></div>
        <div class="field"><label for="p-phone">Mobile number</label><input class="input" id="p-phone" name="phone" value="${user.phone || ''}"></div>
      </div>
      <p class="form-error" id="p-err"></p>
      <button class="btn">Save profile</button></form>`
  );
  $('#profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      ({ user } = await api('/account/profile', { method: 'PUT', body: { name: f.name.value, email: f.email.value, phone: f.phone.value } }));
      $('#greeting').textContent = `Welcome, ${user.name.split(' ')[0]}`;
      toast('Profile saved');
    } catch (ex) {
      $('#p-err').textContent = ex.message;
    }
  };
}

function showAddress() {
  const a = user.address || {};
  const field = (k, label, extra = '') => html`<div class="field ${extra}"><label for="a-${k}">${label}</label><input class="input" id="a-${k}" name="${k}" value="${a[k] || ''}"></div>`;
  setHTML(
    panel(),
    html`<form class="card" id="addr-form"><h2>Delivery address</h2>
      <div class="form-grid">
        ${field('fullName', 'Full name', 'full')}${field('phone', 'Mobile number')}${field('email', 'Email')}
        ${field('line1', 'Address', 'full')}${field('line2', 'Apartment / landmark', 'full')}
        ${field('city', 'City')}${field('province', 'Province')}${field('postalCode', 'Postal code')}
      </div>
      <button class="btn" style="margin-top:1rem">Save address</button></form>`
  );
  $('#addr-form').onsubmit = async (e) => {
    e.preventDefault();
    const address = Object.fromEntries(new FormData(e.target));
    try {
      ({ user } = await api('/account/profile', { method: 'PUT', body: { address } }));
      toast('Address saved');
    } catch (ex) {
      toast(ex.message, { error: true });
    }
  };
}

function showSecurity() {
  setHTML(
    panel(),
    html`<form class="card" id="pw-form"><h2>Change password</h2>
      <div class="form-grid">
        <div class="field full"><label for="cur">Current password</label><input class="input" id="cur" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="np">New password</label><input class="input" id="np" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="np2">Confirm new password</label><input class="input" id="np2" type="password" autocomplete="new-password" minlength="8" required></div>
      </div>
      <p class="form-error" id="pw-err"></p>
      <button class="btn">Update password</button></form>`
  );
  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    if ($('#np').value !== $('#np2').value) return ($('#pw-err').textContent = 'New passwords do not match.');
    try {
      await api('/account/password', { method: 'PUT', body: { current: $('#cur').value, password: $('#np').value } });
      e.target.reset();
      $('#pw-err').textContent = '';
      toast('Password updated. Other devices have been signed out.');
    } catch (ex) {
      $('#pw-err').textContent = ex.message;
    }
  };
}

const TABS = { orders: showOrders, profile: showProfile, address: showAddress, security: showSecurity, logout };

async function init() {
  ({ user } = await mountLayout());
  if (!user) return (location.href = '/login?next=/account');
  $('#greeting').textContent = `Welcome, ${user.name.split(' ')[0]}`;
  if (guardWebGL()) import('../three/scenes.js').then(({ floatingScene }) => floatingScene($('#stage'), { colors: ['#c9a24d', '#e8a4b4', '#3a1f10'], count: 5 }));
  const nav = $('.account-nav');
  nav.addEventListener('click', (e) => {
    const tab = e.target.dataset.tab;
    if (!tab) return;
    $$('button', nav).forEach((b) => b.setAttribute('aria-current', b === e.target));
    Promise.resolve(TABS[tab]()).catch((ex) => toast(ex.message, { error: true }));
  });
  panel().addEventListener('click', async (e) => {
    const ref = e.target.dataset.cancel;
    if (!ref || !confirm(`Cancel order ${ref}?`)) return;
    try {
      await api(`/orders/${encodeURIComponent(ref)}/cancel`, { method: 'POST', body: {} });
      toast('Order cancelled');
      showOrders();
    } catch (ex) {
      toast(ex.message, { error: true });
    }
  });
  showOrders().catch((ex) => toast(ex.message, { error: true }));
}
init();
