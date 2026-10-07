// Shared header, announcement bar and footer for every storefront page.
import { html, setHTML, raw, $, safeHref } from './util.js';
import { site, me, logout } from './api.js';
import { cart } from './cart.js';
import { logoSvg } from './logo.js';

const ICONS = {
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
};

const NAV = [
  ['/', 'Home'],
  ['/categories', 'Categories'],
  ['/shop', 'Shop'],
  ['/account', 'My Account'],
];

export function brandHtml() {
  return raw(`<a class="brand" href="/" aria-label="ZAQA home">${logoSvg()}<span class="brand-word">ZAQA</span></a>`);
}

export async function mountLayout({ solidHeader = false } = {}) {
  const path = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const header = document.createElement('div');
  header.id = 'layout-header';
  const user = await me();
  setHTML(
    header,
    html`<div class="announcement" id="announcement" hidden></div>
    <header class="site-header ${solidHeader ? 'solid' : ''}">
      <div class="container">
        ${brandHtml()}
        <nav class="main-nav" id="main-nav" aria-label="Main">
          ${NAV.map(([href, label]) => html`<a href="${href}" ${path === href ? raw('aria-current="page"') : ''}>${label}</a>`)}
        </nav>
        <div class="header-actions">
          ${user?.role === 'admin' ? html`<a class="icon-btn hide-sm" href="/admin" title="Admin dashboard">${raw(ICONS.admin)}</a>` : ''}
          <a class="icon-btn hide-sm" href="/account" title="${user ? `Signed in as ${user.name}` : 'Sign in'}">${raw(ICONS.user)}</a>
          <a class="icon-btn" href="/cart" title="Cart">${raw(ICONS.bag)}<span class="badge-count" id="cart-count"></span></a>
          <button class="icon-btn menu-toggle" id="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="main-nav">${raw(ICONS.menu)}</button>
        </div>
      </div>
    </header>`
  );
  document.body.prepend(header);

  const updateCount = () => ($('#cart-count').textContent = cart.count() || '');
  updateCount();
  window.addEventListener('cart:change', updateCount);
  window.addEventListener('storage', updateCount);

  const nav = $('#main-nav');
  const toggle = $('#menu-toggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  nav.addEventListener('click', (e) => e.target.closest('a') && nav.classList.remove('open'));

  const siteHeader = $('.site-header');
  const onScroll = () => siteHeader.classList.toggle('scrolled', scrollY > 30);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  const data = await site().catch(() => null);
  if (data?.announcement?.active && data.announcement.text) {
    const bar = $('#announcement');
    bar.textContent = data.settings?.sitewideDiscount
      ? `${data.settings.sitewideDiscountLabel || `${data.settings.sitewideDiscount}% off everything`} · ${data.announcement.text}`
      : data.announcement.text;
    bar.hidden = false;
  }
  mountFooter(data, user);
  return { site: data, user };
}

function mountFooter(data, user) {
  const s = data?.settings || {};
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  setHTML(
    footer,
    html`<div class="container">
      <div class="footer-grid">
        <div>
          ${brandHtml()}
          <p class="muted" style="margin-top:1rem;max-width:22rem">Luxury perfumes and attars, crafted in small batches. Fragrances by Zaqa.</p>
        </div>
        <div><h4>Shop</h4><ul>
          <li><a href="/categories">All categories</a></li>
          <li><a href="/shop">All fragrances</a></li>
          <li><a href="/shop?category=gift-sets">Gift sets</a></li>
        </ul></div>
        <div><h4>Account</h4><ul>
          <li><a href="/account">My orders</a></li>
          <li><a href="/cart">Cart</a></li>
          ${user ? html`<li><a href="#" id="footer-logout">Sign out</a></li>` : html`<li><a href="/login">Sign in</a></li>`}
        </ul></div>
        <div><h4>Contact</h4><ul>
          ${s.contactEmail ? html`<li><a href="mailto:${s.contactEmail}">${s.contactEmail}</a></li>` : ''}
          ${s.contactPhone ? html`<li><a href="tel:${s.contactPhone.replace(/\s/g, '')}">${s.contactPhone}</a></li>` : ''}
          ${s.instagram ? html`<li><a href="${safeHref(s.instagram)}" rel="noopener" target="_blank">Instagram</a></li>` : ''}
        </ul></div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ZAQA — Fragrances by Zaqa. All rights reserved.</span>
        <div class="pay-logos" aria-label="Accepted payments">
          ${['JazzCash', 'Easypaisa', 'NayaPay', 'Mastercard'].map((m) => html`<span class="pay-chip">${m}</span>`)}
        </div>
      </div>
    </div>`
  );
  document.body.append(footer);
  footer.querySelector('#footer-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
}
