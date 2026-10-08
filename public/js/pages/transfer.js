// Manual transfer: show the store's account details, then collect the TID and a screenshot.
// No 3D on this page (it's part of checkout).
import { mountLayout } from '../layout.js';
import { api, site } from '../api.js';
import { html, setHTML, $, rs, params, toast } from '../util.js';

async function init() {
  await mountLayout({ solidHeader: true });
  const ref = params().get('order');
  let order;
  let s;
  try {
    [order, s] = await Promise.all([api(`/orders/${encodeURIComponent(ref || '')}`), site()]);
  } catch (e) {
    setHTML($('#steps'), html`<p class="notice err">${e.message}</p><a class="btn" href="/account" style="margin-top:1rem">My orders</a>`);
    $('#summary').hidden = true;
    return;
  }

  setHTML(
    $('#summary'),
    html`<h2>Order ${order.ref}</h2>
    ${order.items.map((i) => html`<div class="summary-row"><span>${i.name} × ${i.qty}</span><span>${rs(i.lineTotal)}</span></div>`)}
    ${order.discount ? html`<div class="summary-row"><span>Discount</span><span class="ok">− ${rs(order.discount)}</span></div>` : ''}
    <div class="summary-row"><span>Delivery</span><span>${order.shipping ? rs(order.shipping) : 'Free'}</span></div>
    <div class="summary-row total"><span>Amount to send</span><span>${rs(order.total)}</span></div>`
  );

  if (order.paymentStatus === 'paid' || order.paymentStatus === 'awaiting_verification') {
    setHTML(
      $('#steps'),
      html`<p class="notice ${order.paymentStatus === 'paid' ? 'ok' : 'warn'}">${order.paymentStatus === 'paid' ? 'This order is paid. Thank you!' : 'We have your payment details and will confirm them shortly.'}</p>
      <a class="btn" href="/account?order=${encodeURIComponent(order.ref)}" style="margin-top:1rem">View my order</a>`
    );
    return;
  }

  const m = s.manualPayment;
  if (!m || !m.accounts.length) {
    setHTML($('#steps'), html`<p class="notice err">Transfers are not available right now. Please contact us.</p>`);
    return;
  }

  setHTML(
    $('#steps'),
    html`<h2>1. Send ${rs(order.total)}</h2>
    <p class="muted" style="margin-bottom:1rem">Send the exact amount to any one of these accounts from your JazzCash, Easypaisa, NayaPay or banking app. Write <strong>${order.ref}</strong> in the payment note if your app allows it.</p>
    <div class="pay-methods">
      ${m.accounts.map(
        (a) => html`<div class="pay-option" style="cursor:default">
          <span><strong>${a.label}</strong><small>${a.title ? `Account title: ${a.title}` : ''}</small></span>
          <span style="margin-left:auto;text-align:right"><strong style="font-size:1.05rem;letter-spacing:.04em">${a.number}</strong><br>
          <button type="button" class="remove" data-copy="${a.number}">Copy</button></span>
        </div>`
      )}
    </div>
    ${m.instructions ? html`<p class="notice" style="margin-top:1rem">${m.instructions}</p>` : ''}
    <h2 style="margin-top:1.6rem">2. Tell us about your payment</h2>
    <p class="muted">Fill in the form below after sending the money.</p>`
  );
  $('#steps').addEventListener('click', async (e) => {
    const v = e.target.dataset.copy;
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      toast('Copied');
    } catch {
      toast(v);
    }
  });

  const form = $('#transfer-form');
  form.hidden = false;
  setHTML($('#paidTo'), html`${m.accounts.map((a) => html`<option value="${a.type}">${a.label}</option>`)}`);

  let receipt = '';
  $('#receipt').addEventListener('change', (e) => {
    const file = e.target.files[0];
    receipt = '';
    $('#receipt-preview').hidden = true;
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return ($('#err').textContent = 'Screenshot must be under 4 MB.');
    const r = new FileReader();
    r.onload = () => {
      receipt = r.result;
      $('#receipt-preview').src = receipt;
      $('#receipt-preview').hidden = false;
      $('#err').textContent = '';
    };
    r.readAsDataURL(file);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err');
    err.textContent = '';
    const tid = $('#tid').value.trim();
    if (!tid) return (err.textContent = 'Please enter the transaction ID (TID).');
    if (!receipt) return (err.textContent = 'Please upload a screenshot of your payment.');
    const btn = $('#submit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      await api(`/orders/${encodeURIComponent(order.ref)}/transfer`, {
        method: 'POST',
        body: { tid, paidTo: $('#paidTo').value, sender: $('#sender').value.trim(), receipt },
      });
      location.href = `/account?order=${encodeURIComponent(order.ref)}&payment=submitted`;
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Submit payment details';
    }
  });
}
init();
