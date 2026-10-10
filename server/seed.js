import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, run, tx, getContent, setContent } from './db.js';
import { insertCatalog } from './catalog.js';

const testimonials = [
  ['Ayesha K.', 'Lahore', 'ZAQA Signature is the most complimented perfume I own. It lasts all day and the bottle is stunning.', 5],
  ['Hamza R.', 'Karachi', 'Oud Al Layl is the real deal. Rich, deep oud that rivals anything from Dubai.', 5],
  ['Sana M.', 'Islamabad', 'Ordered the Discovery Set as a gift and ended up keeping one for myself. Beautiful packaging.', 5],
  ['Bilal A.', 'Faisalabad', 'Fast delivery, secure payment with JazzCash, and Noir Absolu smells incredible.', 4],
];

export const defaultContent = {
  hero: {
    eyebrow: 'Fragrances by Zaqa',
    title: 'Scent, sculpted in light.',
    subtitle: 'Luxury perfumes and attars crafted in Pakistan from the world’s rarest ingredients.',
    ctaText: 'Discover the collection',
    ctaLink: '/categories',
  },
  announcement: { text: 'Free delivery across Pakistan on orders over Rs 10,000', active: true },
  story: {
    title: 'The art of ZAQA',
    text: 'Every ZAQA fragrance begins with a memory: a garden at dusk, smoke from an oud burner, sea air on the Makran coast. Our perfumers blend precious oils by hand in small batches so each bottle carries a story worth wearing.',
  },
  // Manual transfers to the owner's own JazzCash / Easypaisa / NayaPay / bank account
  // (no merchant account needed); the owner verifies each payment and marks it paid.
  manualPayment: {
    enabled: false,
    jazzcashNumber: '',
    jazzcashTitle: '',
    easypaisaNumber: '',
    easypaisaTitle: '',
    nayapayNumber: '',
    nayapayTitle: '',
    bankName: '',
    bankTitle: '',
    bankIban: '',
    instructions: 'Send the exact total, then enter the transaction ID (TID) and upload a screenshot. We confirm payments within a few hours.',
  },
  settings: {
    shippingFee: 250,
    freeShippingOver: 10000,
    sitewideDiscount: 0,
    sitewideDiscountLabel: '',
    requireLogin: true,
    contactEmail: 'hello@zaqa.pk',
    contactPhone: '+92 300 0000000',
    instagram: 'https://instagram.com/',
  },
};

export function seed() {
  tx(() => {
    if (!one('SELECT 1 FROM categories LIMIT 1')) {
      insertCatalog();
      testimonials.forEach(([name, location, text, rating], i) =>
        run('INSERT INTO testimonials (name, location, text, rating, sort) VALUES (?, ?, ?, ?, ?)', name, location, text, rating, i)
      );
      run("INSERT INTO coupons (code, type, value, min_order) VALUES ('WELCOME10', 'percent', 10, 0)");
    }
    for (const [key, value] of Object.entries(defaultContent)) {
      const current = getContent(key);
      // Merge so new default fields appear without overwriting the admin's edits.
      setContent(key, { ...value, ...(current || {}) });
    }
  });

  if (!one("SELECT 1 FROM users WHERE role = 'admin'")) {
    const password = config.admin.password || crypto.randomBytes(9).toString('base64url');
    run(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      config.admin.name,
      config.admin.email.toLowerCase(),
      bcrypt.hashSync(password, 11)
    );
    console.log(`\n  Admin account created: ${config.admin.email}`);
    if (!config.admin.password) console.log(`  Generated admin password: ${password}\n  (set ADMIN_PASSWORD in .env to choose your own)\n`);
  }
}
