// Cart page: deliberately no 3D. Shows cached bottle renders or photos only.
import { mountLayout } from '../layout.js';
import { api } from '../api.js';
import { html, setHTML, $, rs, raw } from '../util.js';
import { cart } from '../cart.js';
import { staticProductImage } from '../swatch.js';

async function render() {
  const items = cart.items();
  const lines = $('#lines');
  const summary = $('#summary');
  if (!items.length) {
    setHTML(lines, html`<div class="empty"><h2>Your cart is empty</h2><p>Discover a fragrance you’ll love.</p><a class="btn" href="/shop" style="margin-top:1rem">Shop fragrances</a></div>`);
    setHTML(summary, html`<h2>Summary</h2><p class="muted">Add something to get started.</p>`);
    return;
  }
  let q;
  try {
    q = await api('/cart/quote', { method: 'POST', body: { items, coupon: cart.coupon.get() } });
  } catch (e) {
    setHTML(lines, html`<p class="notice err">${e.message}</p>`);
    return;
  }
  // Drop items the store no longer sells.
  const known = new Set(q.lines.map((l) => l.slug));
  items.filter((i) => !known.has(i.slug)).forEach((i) => cart.remove(i.slug));
  const problems = new Map(q.problems.map((p) => [p.slug, p.message]));

  setHTML(
    lines,
    html`<h2>${q.lines.reduce((n, l) => n + l.qty, 0)} item(s)</h2>
    ${q.lines.map(
      (l) => html`<div class="cart-line">
        <img src="${staticProductImage(l)}" alt="" width="84" height="100">
        <div>
          <a class="link" href="/product?slug=${encodeURIComponent(l.slug)}"><strong>${l.name}</strong></a>
          <div class="meta">${l.sizeMl} ml · ${rs(l.unitPrice)}${l.unitPrice < l.originalPrice ? raw(` <s>${rs(l.originalPrice)}</s>`) : ''}</div>
          ${problems.has(l.slug) ? html`<div class="warn">${problems.get(l.slug)}</div>` : ''}
        </div>
        <div class="line-actions">
          <strong>${rs(l.lineTotal)}</strong>
          <div class="qty"><button data-dec="${l.slug}" aria-label="Decrease">−</button><input value="${l.qty}" readonly aria-label="Quantity"><button data-inc="${l.slug}" aria-label="Increase">+</button></div>
          <button class="remove" data-remove="${l.slug}">Remove</button>
        </div>
      </div>`
    )}`
  );

  setHTML(
    summary,
    html`<h2>Summary</h2>
    <div class="summary-row"><span>Subtotal</span><span>${rs(q.subtotal)}</span></div>
    ${q.coupon ? html`<div class="summary-row"><span>Coupon ${q.coupon.code}</span><span class="ok">− ${rs(q.discount)}</span></div>` : ''}
    <div class="summary-row"><span>Delivery</span><span>${q.shipping ? rs(q.shipping) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span>${rs(q.total)}</span></div>
    <form class="coupon-form" id="coupon-form">
      <input class="input" id="coupon" placeholder="Coupon code" value="${q.coupon?.code || ''}" aria-label="Coupon code">
      <button class="btn btn-ghost btn-sm" type="submit">${q.coupon ? 'Update' : 'Apply'}</button>
    </form>
    ${q.couponError && cart.coupon.get() ? html`<p class="form-error">${q.couponError}</p>` : ''}
    ${q.coupon ? html`<button class="remove" id="clear-coupon">Remove coupon</button>` : ''}
    <a class="btn btn-block ${q.problems.length ? 'disabled' : ''}" href="/checkout" style="margin-top:1rem" ${q.problems.length ? raw('aria-disabled="true"') : ''}>Proceed to checkout</a>
    <p class="secure-line">🔒 Secure payment · JazzCash · Easypaisa · NayaPay · Mastercard</p>`
  );
  $('#coupon-form').onsubmit = (e) => {
    e.preventDefault();
    cart.coupon.set($('#coupon').value.trim());
    render();
  };
  $('#clear-coupon')?.addEventListener('click', () => (cart.coupon.set(''), render()));
}

document.addEventListener('click', (e) => {
  const t = e.target;
  const item = (slug) => cart.items().find((i) => i.slug === slug);
  if (t.dataset.inc) cart.set(t.dataset.inc, (item(t.dataset.inc)?.qty || 0) + 1);
  else if (t.dataset.dec) cart.set(t.dataset.dec, (item(t.dataset.dec)?.qty || 0) - 1);
  else if (t.dataset.remove) cart.remove(t.dataset.remove);
  else if (t.closest('[aria-disabled="true"]')) e.preventDefault();
  else return;
});
window.addEventListener('cart:change', render);

mountLayout({ solidHeader: true });
render();
