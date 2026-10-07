// Escaping helpers. All dynamic text goes through html`` so admin-edited content can't inject markup.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(v) { this.v = v; }
  toString() { return this.v; }
}
export const raw = (v) => new Raw(v);

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.v : esc(x))).join('');
    else out += v instanceof Raw ? v.v : v == null || v === false ? '' : esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}

export const rs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const params = () => new URLSearchParams(location.search);
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Only allow same-site relative links or https URLs from admin-edited content.
export const safeHref = (u) => (/^\/(?!\/)/.test(u || '') || /^https:\/\//.test(u || '') ? u : '/');

export function setHTML(el, content) {
  el.innerHTML = String(content);
}

let toastWrap;
export function toast(message, { error = false, action } = {}) {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    toastWrap.setAttribute('role', 'status');
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.append(toastWrap);
  }
  const t = document.createElement('div');
  t.className = `toast${error ? ' err' : ''}`;
  setHTML(t, html`<span>${message}</span>${action ? html`<a href="${safeHref(action.href)}">${action.label}</a>` : ''}`);
  toastWrap.append(t);
  setTimeout(() => t.remove(), 4200);
}

export function statusLabel(s) {
  return {
    pending_payment: 'Awaiting payment',
    paid: 'Paid',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    payment_failed: 'Payment failed',
  }[s] || s;
}

export function formatDate(s) {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
}

// Adds a "reveal" entrance when elements scroll into view.
export function revealOnScroll(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (!('IntersectionObserver' in window) || reducedMotion) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
    { threshold: 0.12 }
  );
  els.forEach((e) => io.observe(e));
}

// Subtle 3D tilt that follows the pointer.
export function tilt(el, max = 8) {
  if (reducedMotion || matchMedia('(hover: none)').matches) return;
  el.style.transition = 'transform 0.5s cubic-bezier(.2,.7,.2,1)';
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * max}deg) rotateX(${(0.5 - y) * max}deg) translateZ(0)`;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  });
  el.addEventListener('pointerleave', () => (el.style.transform = ''));
}
