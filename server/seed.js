import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, run, tx, getContent, setContent } from './db.js';

const categories = [
  ['men', 'For Him', 'Bold, magnetic signatures', '#4a6a8a'],
  ['women', 'For Her', 'Graceful and luminous', '#c97b8e'],
  ['unisex', 'Unisex', 'Beyond definitions', '#9c8cbf'],
  ['oud-attar', 'Oud & Attar', 'The soul of the East', '#7a4423'],
  ['floral', 'Floral', 'Gardens in bloom', '#e4a0b7'],
  ['woody', 'Woody', 'Cedar, sandal and smoke', '#8a6a43'],
  ['fresh-citrus', 'Fresh & Citrus', 'Bright and effortless', '#e8c547'],
  ['oriental-amber', 'Oriental & Amber', 'Warm, resinous depth', '#c76b29'],
  ['gift-sets', 'Gift Sets', 'Curated to be given', '#c9a96e'],
  ['body-mists', 'Body Mists', 'Light, all-day veils', '#8fcbd0'],
];

// [slug, name, category, price, discount%, size, shape, liquid, cap, top, heart, base, description, featured]
const products = [
  ['noir-absolu', 'Noir Absolu', 'men', 12500, 0, 100, 'classic', '#2b1d14', '#1a1a1a', 'Black pepper, bergamot', 'Leather, cardamom', 'Vetiver, tonka', 'A midnight signature of smoked leather and spice, made for evenings that linger.', 1],
  ['azure-gentleman', 'Azure Gentleman', 'men', 9800, 10, 100, 'tall', '#3d6f9e', '#c0c0c0', 'Sea salt, grapefruit', 'Lavender, geranium', 'Ambroxan, cedar', 'Crisp marine air over clean woods. Effortless from boardroom to coastline.', 0],
  ['royal-musk', 'Royal Musk', 'men', 14500, 0, 75, 'oud', '#5a3a22', '#c9a96e', 'Saffron, nutmeg', 'Rose absolute', 'White musk, oud', 'Regal musk wrapped in saffron and a whisper of oud.', 1],
  ['rose-eternelle', 'Rose Éternelle', 'women', 13800, 0, 100, 'round', '#e8a4b4', '#d4af7a', 'Lychee, pink pepper', 'Damask rose, peony', 'Musk, cashmere wood', 'A modern rose, dewy and luminous, that blooms for hours.', 1],
  ['velvet-orchid', 'Velvet Orchid', 'women', 11200, 15, 90, 'flask', '#7b3f72', '#c9a96e', 'Mandarin, honey', 'Black orchid, jasmine', 'Vanilla, suede', 'Sensual orchid on a velvet bed of vanilla and suede.', 0],
  ['petal-whisper', 'Petal Whisper', 'women', 8500, 0, 50, 'classic', '#f4c9cf', '#f2e6d8', 'Pear, freesia', 'Magnolia', 'White musk', 'Soft, airy and clean, like sunlight through linen.', 0],
  ['zaqa-signature', 'ZAQA Signature', 'unisex', 16500, 0, 100, 'classic', '#c9a24d', '#c9a96e', 'Saffron, pink pepper', 'Amber, jasmine', 'Oud, ambergris, cedar', 'The house signature: golden amber, saffron and precious oud in perfect balance.', 1],
  ['white-smoke', 'White Smoke', 'unisex', 10500, 0, 100, 'tall', '#d8d4cc', '#2a2a2a', 'Aldehydes, incense', 'Iris, papyrus', 'Cashmeran, musk', 'Cool incense and powdery iris. Quietly unforgettable.', 0],
  ['oud-al-layl', 'Oud Al Layl', 'oud-attar', 22000, 0, 50, 'oud', '#3a1f10', '#c9a96e', 'Saffron, rose', 'Cambodian oud', 'Sandalwood, amber', 'Deep, dark Cambodian oud for the night. A true collector’s attar.', 1],
  ['attar-mukhallat', 'Attar Mukhallat', 'oud-attar', 7500, 0, 12, 'flask', '#6b3a1f', '#c9a96e', 'Rose, saffron', 'Agarwood', 'Musk, amber', 'Concentrated oil blend, alcohol-free and long-lasting.', 0],
  ['amber-oud', 'Amber Oud', 'oud-attar', 18500, 10, 100, 'oud', '#8b4513', '#1a1a1a', 'Bergamot, cinnamon', 'Oud, labdanum', 'Amber, benzoin', 'Glowing amber meets smouldering oud.', 0],
  ['jasmine-nights', 'Jasmine Nights', 'floral', 9500, 0, 100, 'round', '#f3e3a2', '#d4af7a', 'Orange blossom', 'Sambac jasmine, tuberose', 'Sandalwood', 'Heady white florals inspired by summer evenings in Lahore.', 0],
  ['peony-bloom', 'Peony Bloom', 'floral', 8900, 0, 75, 'classic', '#f0b7c4', '#f2e6d8', 'Red berries', 'Peony, rose', 'Musk', 'Playful, fresh and rosy. A garden in full bloom.', 0],
  ['santal-noir', 'Santal Noir', 'woody', 13200, 0, 100, 'tall', '#6e4b2a', '#1a1a1a', 'Cardamom, violet', 'Sandalwood, papyrus', 'Cedar, leather', 'Creamy sandalwood with a smoky leather finish.', 1],
  ['cedar-trail', 'Cedar Trail', 'woody', 9900, 20, 100, 'classic', '#9c7a4a', '#c0c0c0', 'Juniper, elemi', 'Cedarwood', 'Vetiver, moss', 'A walk through mountain pines after rain.', 0],
  ['citrus-riviera', 'Citrus Riviera', 'fresh-citrus', 7900, 0, 100, 'tall', '#f2d14b', '#c0c0c0', 'Lemon, bergamot', 'Neroli, basil', 'White musk', 'Sparkling citrus and neroli. Bottled sunshine.', 0],
  ['mint-verde', 'Mint Verde', 'fresh-citrus', 6900, 0, 100, 'classic', '#a8d5a2', '#f2e6d8', 'Mint, lime', 'Green tea', 'Vetiver', 'Cool mint and green tea for hot summer days.', 0],
  ['amber-sultan', 'Amber Sultan', 'oriental-amber', 15500, 0, 100, 'round', '#c76b29', '#c9a96e', 'Cinnamon, plum', 'Amber, rose', 'Vanilla, patchouli', 'Opulent amber, dark plum and vanilla.', 1],
  ['vanilla-silk', 'Vanilla Silk', 'oriental-amber', 10800, 0, 90, 'flask', '#e9c79b', '#d4af7a', 'Bergamot', 'Tonka, heliotrope', 'Madagascar vanilla, benzoin', 'A silken vanilla, warm and enveloping.', 0],
  ['discovery-set', 'Discovery Set', 'gift-sets', 6500, 0, 50, 'classic', '#c9a24d', '#c9a96e', 'Five signatures', 'in 10 ml each', 'with gift box', 'Five ZAQA signatures in 10 ml vials. The perfect introduction.', 0],
  ['his-and-hers', 'His & Hers Duo', 'gift-sets', 24000, 15, 200, 'classic', '#8a5a6a', '#c9a96e', 'Noir Absolu', 'Rose Éternelle', 'in a keepsake box', 'Two signatures, one gift. Noir Absolu and Rose Éternelle in a keepsake box.', 1],
  ['coco-breeze', 'Coco Breeze', 'body-mists', 3500, 0, 250, 'mist', '#f6e7c9', '#f2e6d8', 'Coconut water', 'Frangipani', 'Vanilla', 'A light coconut veil for everyday.', 0],
  ['berry-blush', 'Berry Blush', 'body-mists', 3200, 0, 250, 'mist', '#e57a9a', '#f2e6d8', 'Raspberry', 'Rose petals', 'Sugared musk', 'Juicy berries and soft petals. Spray generously.', 0],
  ['ocean-mist', 'Ocean Mist', 'body-mists', 3200, 10, 250, 'mist', '#8fcbd0', '#c0c0c0', 'Sea spray', 'Water lily', 'Driftwood', 'Cool, clean and breezy.', 0],
];

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
      categories.forEach(([slug, name, tagline, color], i) =>
        run('INSERT INTO categories (slug, name, tagline, color, sort) VALUES (?, ?, ?, ?, ?)', slug, name, tagline, color, i)
      );
      for (const p of products) {
        const [slug, name, cat, price, discount, size, shape, liquid, cap, top, heart, base, desc, featured] = p;
        const catId = one('SELECT id FROM categories WHERE slug = ?', cat).id;
        run(
          `INSERT INTO products (slug, name, category_id, price, discount_percent, size_ml, bottle_shape, liquid_color,
            cap_color, notes_top, notes_heart, notes_base, description, featured, stock)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          slug, name, catId, price, discount, size, shape, liquid, cap, top, heart, base, desc, featured, 25
        );
      }
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
