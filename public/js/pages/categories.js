import { mountLayout } from '../layout.js';
import { api } from '../api.js';
import { html, setHTML, $, revealOnScroll, toast } from '../util.js';
import { categoryTile, enhanceGrid } from '../components.js';
import { guardWebGL } from '../three/core.js';

async function init() {
  mountLayout();
  const [categories, products] = await Promise.all([api('/categories'), api('/products')]).catch((e) => (toast(e.message, { error: true }), [[], []]));
  // Represent each category in 3D by its featured (or first) product.
  for (const c of categories) {
    const own = products.filter((p) => p.category?.slug === c.slug);
    c.sample = own.find((p) => p.featured) || own[0] || null;
  }
  setHTML($('#cat-grid'), html`${categories.map(categoryTile)}`);
  enhanceGrid($('#cat-grid'), []);
  revealOnScroll();
  if (!categories.length) return;

  const dots = $('#car-dots');
  setHTML(dots, html`${categories.map((c, i) => html`<button aria-label="${c.name}" data-i="${i}"></button>`)}`);
  const show = (i) => {
    const c = categories[i];
    $('#car-name').textContent = c.name;
    $('#car-tag').textContent = c.tagline || '';
    $('#car-count').textContent = `${String(i + 1).padStart(2, '0')} / ${String(categories.length).padStart(2, '0')} · ${c.productCount} fragrances`;
    $('#car-open').href = `/shop?category=${encodeURIComponent(c.slug)}`;
    $('#car-open').textContent = `Explore ${c.name}`;
    dots.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', j === i));
  };
  show(0);

  let ctrl = null;
  if (guardWebGL()) {
    const { carouselScene } = await import('../three/scenes.js');
    ctrl = await carouselScene($('#stage'), categories, {
      onChange: show,
      onOpen: (i) => (location.href = `/shop?category=${encodeURIComponent(categories[i].slug)}`),
    });
  }
  let idx = 0;
  const go = (i) => {
    idx = (i + categories.length) % categories.length;
    if (ctrl) ctrl.go(idx);
    else show(idx);
  };
  $('#car-prev').addEventListener('click', () => go((ctrl?.index ?? idx) - 1));
  $('#car-next').addEventListener('click', () => go((ctrl?.index ?? idx) + 1));
  dots.addEventListener('click', (e) => e.target.dataset.i && go(Number(e.target.dataset.i)));
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') go((ctrl?.index ?? idx) + 1);
    if (e.key === 'ArrowLeft') go((ctrl?.index ?? idx) - 1);
  });
}
init();
