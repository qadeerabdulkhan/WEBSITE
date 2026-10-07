// Static product images for pages without 3D (cart, checkout, admin tables):
// a photo, a bottle render cached earlier in this session, or a simple colour swatch.
import { safeHref } from './util.js';

export function staticProductImage(p) {
  if (p.imageUrl) return safeHref(p.imageUrl);
  const b = p.bottle || {};
  try {
    const hit = sessionStorage.getItem(`zq_thumb:${b.shape}|${b.liquid}|${b.cap}|${p.name}`);
    if (hit) return hit;
  } catch {
    // Ignore.
  }
  const c = /^#[0-9a-f]{6}$/i.test(b.liquid) ? b.liquid : '#c9a96e';
  const cap = /^#[0-9a-f]{6}$/i.test(b.cap) ? b.cap : '#c9a96e';
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 100"><defs><radialGradient id="g" cx=".5" cy=".4"><stop offset="0" stop-color="#2a241d"/><stop offset="1" stop-color="#0c0b0a"/></radialGradient></defs><rect width="84" height="100" fill="url(#g)"/><rect x="22" y="36" width="40" height="50" rx="7" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".25"/><rect x="26" y="48" width="32" height="34" rx="4" fill="${c}"/><rect x="37" y="28" width="10" height="8" fill="#fff" fill-opacity=".2"/><rect x="31" y="14" width="22" height="15" rx="2" fill="${cap}"/></svg>`
  )}`;
}

export const PAYMENT_LABELS = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', nayapay: 'NayaPay', mastercard: 'Card (Mastercard)' };
export const paymentLabel = (id) => PAYMENT_LABELS[id] || id;
