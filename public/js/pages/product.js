import { mountLayout } from '../layout.js';
import { api } from '../api.js';
import { html, setHTML, $, params, toast, raw, revealOnScroll, safeHref } from '../util.js';
import { cart } from '../cart.js';
import { productCard, enhanceGrid, priceHtml } from '../components.js';
import { guardWebGL } from '../three/core.js';

async function init() {
  mountLayout();
  const slug = params().get('slug');
  let data;
  try {
    data = await api(`/products/${encodeURIComponent(slug || '')}`);
  } catch (e) {
    setHTML($('#product'), html`<div class="empty" style="grid-column:1/-1"><h2>Fragrance not found</h2><p>${e.message}</p><a class="btn" href="/shop" style="margin-top:1rem">Back to shop</a></div>`);
    return;
  }
  const { product: p, related } = data;
  document.title = `${p.name} — ZAQA`;
  const off = Math.round((1 - p.finalPrice / p.price) * 100);

  setHTML(
    $('#info'),
    html`<p class="crumbs"><a href="/">Home</a> / ${p.category ? html`<a href="/shop?category=${encodeURIComponent(p.category.slug)}">${p.category.name}</a>` : html`<a href="/shop">Shop</a>`}</p>
    <p class="eyebrow">${p.category?.name || 'ZAQA'} · ${p.sizeMl} ml</p>
    <h1>${p.name}</h1>
    <div>${priceHtml(p)} ${off > 0 ? html`<span class="status status-paid" style="margin-left:.6rem">Save ${off}%</span>` : ''}</div>
    <p class="desc">${p.description}</p>
    <div class="notes-pyramid">
      ${p.notes.top ? html`<div class="note-row"><span>Top</span><span>${p.notes.top}</span></div>` : ''}
      ${p.notes.heart ? html`<div class="note-row"><span>Heart</span><span>${p.notes.heart}</span></div>` : ''}
      ${p.notes.base ? html`<div class="note-row"><span>Base</span><span>${p.notes.base}</span></div>` : ''}
    </div>
    <div class="buy-row">
      <div class="qty"><button type="button" id="minus" aria-label="Decrease quantity">−</button><input id="qty" type="number" min="1" max="${Math.max(1, Math.min(20, p.stock))}" value="1" aria-label="Quantity"><button type="button" id="plus" aria-label="Increase quantity">+</button></div>
      <button class="btn" id="add" ${p.stock <= 0 ? raw('disabled') : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to cart'}</button>
      <button class="btn btn-ghost" id="buy" ${p.stock <= 0 ? raw('disabled') : ''}>Buy now</button>
    </div>
    <p class="stock-line">${p.stock <= 0 ? 'Currently out of stock.' : p.stock <= 5 ? `Only ${p.stock} left.` : 'In stock · ships in 1–2 working days'}</p>
    <div class="perks"><div>Secure payment<br>JazzCash · Easypaisa · NayaPay · Card</div><div>Long-lasting<br>8–12 hour wear</div><div>Delivery<br>across Pakistan</div></div>`
  );

  const qty = $('#qty');
  const clamp = () => (qty.value = Math.max(1, Math.min(Number(qty.max), Math.floor(Number(qty.value) || 1))));
  $('#minus').onclick = () => ((qty.value = Number(qty.value) - 1), clamp());
  $('#plus').onclick = () => ((qty.value = Number(qty.value) + 1), clamp());
  qty.onchange = clamp;
  $('#add').onclick = () => {
    clamp();
    cart.add(p.slug, Number(qty.value));
    toast(`${p.name} added to your cart`, { action: { href: '/cart', label: 'View cart' } });
  };
  $('#buy').onclick = () => {
    clamp();
    cart.add(p.slug, Number(qty.value));
    location.href = '/cart';
  };

  const viewer = $('#viewer');
  if (guardWebGL()) {
    import('../three/scenes.js').then(async ({ productViewer }) => {
      await productViewer($('#stage'), p);
      viewer.classList.remove('skeleton');
    });
  } else if (!p.imageUrl) {
    viewer.classList.remove('skeleton');
    viewer.querySelector('.hint').textContent = '3D preview needs WebGL';
  }
  if (p.imageUrl) {
    const toggle = document.createElement('div');
    toggle.className = 'viewer-toggle';
    setHTML(toggle, html`<button class="chip" aria-current="true" data-mode="3d">3D</button><button class="chip" data-mode="photo">Photo</button>`);
    const img = document.createElement('img');
    img.className = 'photo';
    img.alt = p.name;
    img.src = safeHref(p.imageUrl);
    img.hidden = true;
    viewer.append(img, toggle);
    toggle.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode;
      if (!mode) return;
      img.hidden = mode !== 'photo';
      toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.mode === mode));
    });
  }

  if (related.length) {
    $('#related-section').hidden = false;
    setHTML($('#related'), html`${related.map(productCard)}`);
    enhanceGrid($('#related'), related);
    revealOnScroll();
  }
}
init();
