// Checkout: deliberately no 3D. Creates the order, then hands off to the payment provider.
import { mountLayout } from '../layout.js';
import { api, site } from '../api.js';
import { html, setHTML, $, rs, toast } from '../util.js';
import { cart } from '../cart.js';

const PAY_META = {
  manual: { bg: '#8c6d3a', text: 'Transfer', note: 'Send to our JazzCash, Easypaisa, NayaPay or bank account, then share the transaction ID' },
  jazzcash: { bg: '#d6001c', text: 'Jazz\nCash', note: 'Pay from your JazzCash mobile account' },
  easypaisa: { bg: '#20b04b', text: 'easy\npaisa', note: 'Pay from your Easypaisa mobile account' },
  nayapay: { bg: '#ff6a13', text: 'Naya\nPay', note: 'Pay from your NayaPay wallet' },
  mastercard: { bg: '#1a1f71', text: 'CARD', note: 'Mastercard, Visa and UnionPay credit or debit cards' },
};

async function init() {
  const { user } = await mountLayout({ solidHeader: true });
  const items = cart.items();
  if (!items.length) {
    location.href = '/cart';
    return;
  }
  const [s, quote] = await Promise.all([site(), api('/cart/quote', { method: 'POST', body: { items, coupon: cart.coupon.get() } })]);

  // Prefill from the saved address.
  const a = user?.address || {};
  const form = $('#checkout');
  const fill = { fullName: a.fullName || user?.name, phone: a.phone || user?.phone?.replace(/^\+92/, '0'), email: a.email || user?.email, line1: a.line1, line2: a.line2, city: a.city, province: a.province, postalCode: a.postalCode };
  for (const [k, v] of Object.entries(fill)) if (v && form.elements[k]) form.elements[k].value = v;

  if (s.paymentMode === 'simulate' && !s.manualPayment) {
    setHTML($('#pay-mode'), html`<p class="notice warn" style="margin-bottom:1rem">Test mode: payments are simulated and no money is charged. The store owner switches this to live payments in the server settings.</p>`);
  }
  const methods = s.paymentMethods || [];
  setHTML(
    $('#pay-methods'),
    methods.length
      ? html`${methods.map(
          (m, i) => html`<label class="pay-option">
            <input type="radio" name="paymentMethod" value="${m.id}" ${i === 0 ? 'checked' : ''}>
            <span class="pay-logo" style="background:${PAY_META[m.id]?.bg || '#333'}">${(PAY_META[m.id]?.text || m.label).split('\n')[0]}</span>
            <span><strong>${m.label}</strong><small>${PAY_META[m.id]?.note || ''}</small></span>
          </label>`
        )}`
      : html`<p class="notice err">Online payments are temporarily unavailable. Please try again later.</p>`
  );

  setHTML(
    $('#summary'),
    html`<h2>Order summary</h2>
    ${quote.lines.map((l) => html`<div class="summary-row"><span>${l.name} × ${l.qty}</span><span>${rs(l.lineTotal)}</span></div>`)}
    <div class="summary-row" style="border-top:1px solid var(--line);margin-top:.5rem;padding-top:.8rem"><span>Subtotal</span><span>${rs(quote.subtotal)}</span></div>
    ${quote.coupon ? html`<div class="summary-row"><span>Coupon ${quote.coupon.code}</span><span class="ok">− ${rs(quote.discount)}</span></div>` : ''}
    <div class="summary-row"><span>Delivery</span><span>${quote.shipping ? rs(quote.shipping) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span>${rs(quote.total)}</span></div>
    ${quote.problems.length ? html`<p class="notice err">${quote.problems.map((p) => p.message).join(' ')} <a class="link" href="/cart">Review cart</a></p>` : ''}
    <p class="form-error" id="err" role="alert"></p>
    <button class="btn btn-block" id="pay" type="submit" ${quote.problems.length || !methods.length ? 'disabled' : ''}>Pay ${rs(quote.total)} securely</button>
    <p class="secure-line">🔒 Payments are processed by the provider. No cash on delivery.</p>`
  );

  // Wording depends on the chosen method: transfers are placed first and paid from the customer's own app.
  const NOTE_GATEWAY = $('#pay-note').textContent;
  const payLabel = () => (form.elements.paymentMethod?.value === 'manual' ? `Place order · ${rs(quote.total)}` : `Pay ${rs(quote.total)} securely`);
  function syncMethod() {
    const manual = form.elements.paymentMethod?.value === 'manual';
    $('#pay-note').textContent = manual
      ? 'Cash on delivery is not available. After placing your order you will see our account details. Send the total from your JazzCash, Easypaisa, NayaPay or bank app, then share the transaction ID.'
      : NOTE_GATEWAY;
    if (!$('#pay').disabled) $('#pay').textContent = payLabel();
  }
  form.addEventListener('change', (e) => e.target.name === 'paymentMethod' && syncMethod());
  syncMethod();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err');
    err.textContent = '';
    const fd = new FormData(form);
    const shipping = Object.fromEntries(['fullName', 'phone', 'email', 'line1', 'line2', 'city', 'province', 'postalCode'].map((k) => [k, String(fd.get(k) || '').trim()]));
    const missing = ['fullName', 'phone', 'line1', 'city'].find((k) => !shipping[k]);
    if (missing) {
      err.textContent = 'Please fill in your name, mobile number, address and city.';
      form.elements[missing].focus();
      return;
    }
    const paymentMethod = fd.get('paymentMethod');
    if (!paymentMethod) {
      err.textContent = 'Please choose a payment method.';
      return;
    }
    const btn = $('#pay');
    btn.disabled = true;
    btn.textContent = 'Creating your order…';
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: { items: cart.items(), coupon: cart.coupon.get(), shipping, paymentMethod, saveAddress: $('#saveAddress').checked },
      });
      cart.clear();
      cart.coupon.set('');
      location.href = order.payUrl;
    } catch (ex) {
      err.textContent = ex.message;
      toast(ex.message, { error: true });
      btn.disabled = false;
      btn.textContent = payLabel();
    }
  });
}
init();
