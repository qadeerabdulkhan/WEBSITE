import { mountLayout } from '../layout.js';
import { api } from '../api.js';
import { html, setHTML, $, revealOnScroll, safeHref, raw, toast } from '../util.js';
import { logoSvg } from '../logo.js';
import { productCard, categoryTile, enhanceGrid } from '../components.js';
import { guardWebGL } from '../three/core.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

async function init() {
  setHTML($('#hero-logo'), logoSvg());
  const layoutP = mountLayout();
  const [{ site }, categories, featured, products] = await Promise.all([
    layoutP,
    api('/categories'),
    api('/products?featured=1'),
    api('/products'),
  ]).catch((err) => {
    toast(err.message, { error: true });
    return [{}, [], [], []];
  });

  if (guardWebGL()) {
    const signature = products.find((p) => p.slug === 'zaqa-signature') || featured[0];
    import('../three/scenes.js').then(({ heroScene }) => heroScene($('#stage'), { product: signature }));
  }

  const hero = site?.hero || {};
  if (hero.eyebrow) $('#hero-eyebrow').textContent = hero.eyebrow;
  if (hero.title) $('#hero-title').textContent = hero.title;
  $('#hero-sub').textContent = hero.subtitle || '';
  const cta = $('#hero-cta');
  if (hero.ctaText) cta.textContent = hero.ctaText;
  cta.href = safeHref(hero.ctaLink || '/categories');

  setHTML($('#cat-grid'), html`${categories.map(categoryTile)}`);
  const grid = $('#featured-grid');
  setHTML(grid, html`${featured.slice(0, 8).map(productCard)}`);
  enhanceGrid(grid, featured);
  enhanceGrid($('#cat-grid'), []);

  if (site?.story) {
    $('#story-title').textContent = site.story.title;
    $('#story-text').textContent = site.story.text;
  }
  const s = site?.settings || {};
  if (s.sitewideDiscount > 0) {
    $('#sale').hidden = false;
    $('#sale-title').textContent = s.sitewideDiscountLabel || `${s.sitewideDiscount}% off everything`;
    $('#sale-sub').textContent = 'Applied automatically at checkout. While stocks last.';
  }
  const t = site?.testimonials || [];
  $('#testimonials-section').hidden = !t.length;
  setHTML(
    $('#testimonials'),
    html`${t.map(
      (x, i) => html`<figure class="testimonial glass reveal reveal-d${(i % 3) + 1}">
        <span class="stars" aria-label="${x.rating} out of 5">${stars(x.rating)}</span>
        <blockquote>“${x.text}”</blockquote>
        <cite>${x.name}${x.location ? raw(` · `) : ''}${x.location}</cite>
      </figure>`
    )}`
  );
  // Let the camera dolly-in start before the hero copy fades up.
  setTimeout(() => revealOnScroll(), 600);
}
init();
