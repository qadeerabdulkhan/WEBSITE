import { html, raw, rs, safeHref, tilt, toast, $$ } from './util.js';
import { cart } from './cart.js';
import { hydrateThumbs } from './three/thumbs.js';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export function priceHtml(p) {
  return p.finalPrice < p.price ? html`<span class="price">${rs(p.finalPrice)}<s>${rs(p.price)}</s></span>` : html`<span class="price">${rs(p.price)}</span>`;
}

export function productCard(p) {
  const off = p.price > 0 ? Math.round((1 - p.finalPrice / p.price) * 100) : 0;
  const notes = [p.notes.top, p.notes.heart].filter(Boolean).join(' · ');
  return html`<article class="product-card reveal" data-slug="${p.slug}">
    <div class="media ${p.imageUrl ? '' : 'skeleton'}">
      ${p.stock <= 0 ? html`<span class="tag out">Sold out</span>` : off > 0 ? html`<span class="tag">−${off}%</span>` : p.featured ? html`<span class="tag">Signature</span>` : ''}
      <img src="${p.imageUrl ? safeHref(p.imageUrl) : PIXEL}" ${p.imageUrl ? '' : raw(`data-thumb="${p.slug}"`)} alt="${p.name} perfume bottle" loading="lazy" width="480" height="600">
      <span class="shine"></span>
    </div>
    <div class="info">
      ${p.category ? html`<span class="cat">${p.category.name}</span>` : ''}
      <h3><a href="/product?slug=${encodeURIComponent(p.slug)}">${p.name}</a></h3>
      <span class="spec">${p.concentration || 'Eau de Parfum'} · ${p.sizeMl} ml</span>
      ${notes ? html`<span class="notes">${notes}</span>` : ''}
      <div class="row">
        ${priceHtml(p)}
        <button class="btn btn-sm add" data-add="${p.slug}" ${p.stock <= 0 ? raw('disabled') : ''}>Add</button>
      </div>
    </div>
  </article>`;
}

export function categoryTile(c) {
  return html`<a class="cat-tile reveal" href="/shop?category=${encodeURIComponent(c.slug)}" style="--c:${/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#c9a96e'}">
    <span class="cat-orb"></span>
    <h3>${c.name}</h3>
    <p>${c.tagline}</p>
    <span class="count">${c.productCount} ${c.productCount === 1 ? 'fragrance' : 'fragrances'}</span>
  </a>`;
}

// Wires up add-to-cart buttons, tilt and 3D-rendered thumbnails inside a grid.
export function decorateGrid(root, products) {
  hydrateThumbs(root, new Map(products.map((p) => [p.slug, p])));
  $$('.product-card, .cat-tile', root).forEach((el) => tilt(el, 7));
}

export function enhanceGrid(root, products) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  decorateGrid(root, products);
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    const p = bySlug.get(btn.dataset.add);
    cart.add(btn.dataset.add, 1);
    toast(`${p?.name || 'Item'} added to your cart`, { action: { href: '/cart', label: 'View cart' } });
  });
}
