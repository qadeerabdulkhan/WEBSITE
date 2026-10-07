// Cart lives in localStorage as [{ slug, qty }]; prices always come from the server.
const KEY = 'zaqa_cart_v1';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((i) => i && typeof i.slug === 'string' && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable (private mode); cart lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
}

export const cart = {
  items: read,
  count: () => read().reduce((n, i) => n + i.qty, 0),
  add(slug, qty = 1) {
    const items = read();
    const it = items.find((i) => i.slug === slug);
    if (it) it.qty = Math.min(it.qty + qty, 20);
    else items.push({ slug, qty: Math.min(qty, 20) });
    write(items);
  },
  set(slug, qty) {
    let items = read();
    if (qty <= 0) items = items.filter((i) => i.slug !== slug);
    else items.forEach((i) => i.slug === slug && (i.qty = Math.min(qty, 20)));
    write(items);
  },
  remove(slug) {
    write(read().filter((i) => i.slug !== slug));
  },
  clear() {
    write([]);
  },
  coupon: {
    get: () => {
      try { return localStorage.getItem('zaqa_coupon') || ''; } catch { return ''; }
    },
    set: (c) => {
      try { c ? localStorage.setItem('zaqa_coupon', c) : localStorage.removeItem('zaqa_coupon'); } catch { /* ignore */ }
    },
  },
};
