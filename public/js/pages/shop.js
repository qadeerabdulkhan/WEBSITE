import { mountLayout } from '../layout.js';
import { api } from '../api.js';
import { html, setHTML, $, revealOnScroll, params, toast } from '../util.js';
import { productCard, enhanceGrid, decorateGrid } from '../components.js';
import { guardWebGL } from '../three/core.js';

async function init() {
  mountLayout();
  const slug = params().get('category') || '';
  const [categories, products] = await Promise.all([api('/categories'), api(`/products${slug ? `?category=${encodeURIComponent(slug)}` : ''}`)]).catch((e) => {
    toast(e.message, { error: true });
    return [[], []];
  });
  const cat = categories.find((c) => c.slug === slug);
  if (cat) {
    $('#shop-title').textContent = cat.name;
    $('#shop-sub').textContent = cat.tagline;
    document.title = `${cat.name} — ZAQA`;
  }

  if (guardWebGL()) {
    const colors = cat ? [cat.color, '#c9a96e', cat.color] : categories.map((c) => c.color).slice(0, 6);
    import('../three/scenes.js').then(({ floatingScene }) =>
      floatingScene($('#stage'), { colors: colors.length ? colors : ['#c9a24d'], count: 6, products: products.filter((p) => !p.imageUrl).slice(0, 6) })
    );
  }

  setHTML(
    $('#chips'),
    html`<a class="chip" href="/shop" aria-current="${!slug}">All</a>${categories.map(
      (c) => html`<a class="chip" href="/shop?category=${encodeURIComponent(c.slug)}" aria-current="${c.slug === slug}">${c.name}</a>`
    )}`
  );

  const grid = $('#grid');
  const search = $('#search');
  const sort = $('#sort');
  search.value = params().get('q') || '';
  function render() {
    const q = search.value.trim().toLowerCase();
    let list = products.filter((p) => !q || [p.name, p.description, p.notes.top, p.notes.heart, p.notes.base].join(' ').toLowerCase().includes(q));
    if (sort.value === 'price-asc') list = [...list].sort((a, b) => a.finalPrice - b.finalPrice);
    if (sort.value === 'price-desc') list = [...list].sort((a, b) => b.finalPrice - a.finalPrice);
    if (sort.value === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setHTML(grid, list.length ? html`${list.map(productCard)}` : html`<p class="empty">No fragrances match your search.</p>`);
    revealOnScroll(grid);
  }
  render();
  enhanceGrid(grid, products);
  search.addEventListener('input', () => (render(), decorateGrid(grid, products)));
  sort.addEventListener('change', () => (render(), decorateGrid(grid, products)));
}
init();
