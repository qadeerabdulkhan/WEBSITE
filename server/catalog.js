// Starter catalog: realistic ZAQA fragrances with notes, concentration, size and Pakistani prices.
// The owner edits or replaces all of this from the admin dashboard.
import { one, run, tx } from './db.js';

export const CONCENTRATIONS = ['Extrait de Parfum', 'Eau de Parfum', 'Eau de Toilette', 'Perfume Oil (Attar)', 'Body Mist', 'Gift Set'];
export const GLASS_STYLES = ['clear', 'frosted', 'black', 'smoked'];

export const categories = [
  ['men', 'For Him', 'Bold, magnetic signatures', '#7d95ad'],
  ['women', 'For Her', 'Graceful and luminous', '#e3a9b6'],
  ['unisex', 'Unisex', 'Beyond definitions', '#c9a96e'],
  ['oud-attar', 'Oud & Attar', 'The soul of the East', '#8a4a1c'],
  ['floral', 'Floral', 'Gardens in bloom', '#f0c2cd'],
  ['woody', 'Woody', 'Cedar, sandal and smoke', '#a07a4c'],
  ['fresh-citrus', 'Fresh & Citrus', 'Bright and effortless', '#e9d98a'],
  ['oriental-amber', 'Oriental & Amber', 'Warm, resinous depth', '#c4732a'],
  ['gift-sets', 'Gift Sets', 'Curated to be given', '#d9b878'],
  ['body-mists', 'Body Mists', 'Light, all-day veils', '#a9d4d8'],
];

const p = (o) => ({ discount: 0, featured: 0, stock: 25, glass: 'clear', ...o });

export const products = [
  // For Him
  p({
    slug: 'noir-absolu', name: 'Noir Absolu', category: 'men', concentration: 'Eau de Parfum', size: 100, price: 8950,
    shape: 'classic', glass: 'black', liquid: '#3b2a1a', cap: '#1c1c1c', featured: 1,
    top: 'Black pepper, Calabrian bergamot, cardamom', heart: 'Leather, orris, violet leaf', base: 'Haitian vetiver, tonka bean, smoked woods',
    description: 'A smoky leather signature for evenings. It opens with a crack of black pepper and bergamot, settles into supple leather and orris, and dries down to vetiver and tonka. Lasts 8–10 hours with strong projection. Best for evenings, weddings and the cooler months.',
  }),
  p({
    slug: 'bleu-marine', name: 'Bleu Marine', category: 'men', concentration: 'Eau de Parfum', size: 100, price: 6950, discount: 10,
    shape: 'tall', liquid: '#9cc3e0', cap: '#c9c9c9',
    top: 'Sea salt, grapefruit, mint', heart: 'Lavender, geranium, sage', base: 'Ambroxan, cedarwood, white musk',
    description: 'Crisp, clean and versatile. Salty marine air and pink grapefruit over aromatic lavender, finished with ambroxan and cedar. An easy daily signature for office and travel. Lasts 6–8 hours.',
  }),
  p({
    slug: 'royal-musk', name: 'Royal Musk', category: 'men', concentration: 'Eau de Parfum', size: 100, price: 7450,
    shape: 'tall', glass: 'smoked', liquid: '#c08a4d', cap: '#c9a96e',
    top: 'Saffron, nutmeg, pink pepper', heart: 'Taif rose, cinnamon', base: 'White musk, oud accord, sandalwood',
    description: 'Regal and warm. Saffron and nutmeg lead into a spiced Taif rose, resting on soft white musk with a whisper of oud. Made for Jummah, Eid and formal evenings. Lasts 8–10 hours.',
  }),
  // For Her
  p({
    slug: 'rose-eternelle', name: 'Rose Éternelle', category: 'women', concentration: 'Eau de Parfum', size: 100, price: 8450, featured: 1,
    shape: 'round', liquid: '#f2c2c8', cap: '#d4af7a',
    top: 'Lychee, pink pepper, bergamot', heart: 'Damask rose, peony, magnolia', base: 'White musk, cashmere wood, ambrette',
    description: 'A modern, dewy rose. Juicy lychee and pink pepper lift a bouquet of Damask rose and peony, wrapped in soft musk and cashmere wood. Elegant from day to night. Lasts 7–9 hours.',
  }),
  p({
    slug: 'velvet-orchid', name: 'Velvet Orchid', category: 'women', concentration: 'Eau de Parfum', size: 100, price: 7950, discount: 15,
    shape: 'flask', liquid: '#d9a3c4', cap: '#d4af7a',
    top: 'Mandarin, honey, red berries', heart: 'Black orchid, jasmine sambac, tuberose', base: 'Madagascar vanilla, suede, patchouli',
    description: 'Sensual and enveloping. Honeyed mandarin opens onto a dark bouquet of orchid and jasmine, settling into vanilla and suede. A statement scent for evenings and celebrations. Lasts 8–10 hours.',
  }),
  p({
    slug: 'petal-whisper', name: 'Petal Whisper', category: 'women', concentration: 'Eau de Toilette', size: 50, price: 4450,
    shape: 'classic', glass: 'frosted', liquid: '#fadde2', cap: '#e8e2d8',
    top: 'Pear, freesia, bergamot', heart: 'Magnolia, lily of the valley', base: 'White musk, blonde woods',
    description: 'Soft, airy and clean, like sunlight through linen. Crisp pear and freesia over white flowers and musk. Perfect for university, the office and warm days. Lasts 4–6 hours.',
  }),
  // Unisex
  p({
    slug: 'zaqa-signature', name: 'ZAQA Signature', category: 'unisex', concentration: 'Extrait de Parfum', size: 100, price: 11500, featured: 1,
    shape: 'classic', liquid: '#d9a441', cap: '#c9a96e',
    top: 'Saffron, pink pepper, bergamot', heart: 'Amber, jasmine, Bulgarian rose', base: 'Cambodian oud, ambergris, Virginia cedar',
    description: 'The house signature. Golden saffron and amber meet jasmine and rose, resting on a base of precious oud, ambergris and cedar. Rich, radiant and long-lasting, at 25% perfume concentration. Lasts 10–12 hours.',
  }),
  p({
    slug: 'white-smoke', name: 'White Smoke', category: 'unisex', concentration: 'Eau de Parfum', size: 100, price: 7950,
    shape: 'tall', glass: 'frosted', liquid: '#efeae0', cap: '#2a2a2a',
    top: 'Aldehydes, frankincense, elemi', heart: 'Iris, papyrus, cashmeran', base: 'Musk, cedar, labdanum',
    description: 'Cool incense and powdery iris. A quiet, modern scent that sits close to the skin and lingers on clothes. Lasts 6–8 hours.',
  }),
  // Oud & Attar
  p({
    slug: 'oud-al-layl', name: 'Oud Al Layl', category: 'oud-attar', concentration: 'Extrait de Parfum', size: 50, price: 12500, featured: 1,
    shape: 'oud', liquid: '#5a2d0c', cap: '#c9a96e',
    top: 'Saffron, Taif rose', heart: 'Cambodian oud, guaiac wood', base: 'Mysore sandalwood, amber, leather',
    description: 'Deep, dark oud for the night. Saffron and Taif rose give way to resinous Cambodian oud, finished with sandalwood and amber. A collector’s fragrance for special occasions. Lasts 12+ hours.',
  }),
  p({
    slug: 'mukhallat-attar', name: 'Mukhallat Attar', category: 'oud-attar', concentration: 'Perfume Oil (Attar)', size: 12, price: 3250,
    shape: 'oud', glass: 'smoked', liquid: '#7a3e12', cap: '#c9a96e',
    top: 'Rose, saffron', heart: 'Agarwood, musk', base: 'Amber, sandalwood',
    description: 'A traditional, alcohol-free oil blend of rose, saffron and agarwood. A few dots on the wrists last all day. Lasts 12+ hours.',
  }),
  p({
    slug: 'amber-oud', name: 'Amber Oud', category: 'oud-attar', concentration: 'Eau de Parfum', size: 100, price: 9950, discount: 10,
    shape: 'oud', glass: 'smoked', liquid: '#a05a1c', cap: '#1c1c1c',
    top: 'Bergamot, cinnamon, cardamom', heart: 'Oud, labdanum, rose', base: 'Amber, benzoin, vanilla',
    description: 'Glowing amber meets smouldering oud. Sweet, spiced and warm, ideal for winter evenings and weddings. Lasts 9–11 hours.',
  }),
  // Floral
  p({
    slug: 'motia-nights', name: 'Motia Nights', category: 'floral', concentration: 'Eau de Parfum', size: 100, price: 6950,
    shape: 'round', liquid: '#f0e2a2', cap: '#d4af7a',
    top: 'Orange blossom, bergamot', heart: 'Motia (jasmine sambac), tuberose', base: 'Sandalwood, soft musk',
    description: 'Heady motia and tuberose inspired by garlands sold on summer evenings in Lahore. Creamy, white and joyful. Lasts 7–9 hours.',
  }),
  p({
    slug: 'peony-bloom', name: 'Peony Bloom', category: 'floral', concentration: 'Eau de Parfum', size: 50, price: 4950,
    shape: 'classic', liquid: '#f6cdd5', cap: '#e8e2d8',
    top: 'Red berries, mandarin', heart: 'Peony, rose, freesia', base: 'Musk, cedar',
    description: 'Playful, fresh and rosy: a garden in full bloom. Easy to wear every day. Lasts 5–7 hours.',
  }),
  // Woody
  p({
    slug: 'santal-noir', name: 'Santal Noir', category: 'woody', concentration: 'Eau de Parfum', size: 100, price: 8450, featured: 1,
    shape: 'tall', glass: 'black', liquid: '#6e4b2a', cap: '#c9a96e',
    top: 'Cardamom, violet', heart: 'Australian sandalwood, papyrus', base: 'Cedar, leather, iris',
    description: 'Creamy sandalwood with a smoky leather finish. Smooth, addictive and quietly confident. Lasts 8–10 hours.',
  }),
  p({
    slug: 'cedar-trail', name: 'Cedar Trail', category: 'woody', concentration: 'Eau de Toilette', size: 100, price: 5450, discount: 20,
    shape: 'tall', glass: 'smoked', liquid: '#c9a36a', cap: '#8f8f8f',
    top: 'Juniper, elemi, lemon', heart: 'Atlas cedarwood, cypress', base: 'Vetiver, oakmoss',
    description: 'A walk through the pines of Murree after rain. Green, woody and fresh. Lasts 5–7 hours.',
  }),
  // Fresh & Citrus
  p({
    slug: 'riviera-neroli', name: 'Riviera Neroli', category: 'fresh-citrus', concentration: 'Eau de Toilette', size: 100, price: 5250,
    shape: 'tall', liquid: '#f2e6a0', cap: '#c9c9c9',
    top: 'Sicilian lemon, bergamot, petitgrain', heart: 'Neroli, basil', base: 'White musk, ambrette',
    description: 'Sparkling citrus and neroli: bottled sunshine for hot Pakistani summers. Lasts 4–6 hours.',
  }),
  p({
    slug: 'mint-verde', name: 'Mint Verde', category: 'fresh-citrus', concentration: 'Eau de Toilette', size: 100, price: 4750,
    shape: 'classic', liquid: '#d8e8bd', cap: '#c9c9c9',
    top: 'Spearmint, lime', heart: 'Green tea, fig leaf', base: 'Vetiver, musk',
    description: 'Cool mint and green tea for the hottest days. Clean, light and refreshing. Lasts 4–6 hours.',
  }),
  // Oriental & Amber
  p({
    slug: 'amber-sultan', name: 'Amber Sultan', category: 'oriental-amber', concentration: 'Extrait de Parfum', size: 100, price: 10500, featured: 1,
    shape: 'round', liquid: '#b8601e', cap: '#c9a96e',
    top: 'Cinnamon, plum, saffron', heart: 'Amber, rose, incense', base: 'Bourbon vanilla, patchouli, benzoin',
    description: 'Opulent amber, dark plum and vanilla, trailing a soft cloud of incense. Rich and long-lasting. Lasts 10–12 hours.',
  }),
  p({
    slug: 'vanilla-silk', name: 'Vanilla Silk', category: 'oriental-amber', concentration: 'Eau de Parfum', size: 100, price: 7250,
    shape: 'flask', liquid: '#ebc68b', cap: '#d4af7a',
    top: 'Bergamot, pear', heart: 'Tonka bean, heliotrope', base: 'Madagascar vanilla, benzoin, musk',
    description: 'A silky vanilla, warm and enveloping but never too sweet. Lasts 7–9 hours.',
  }),
  // Gift sets
  p({
    slug: 'discovery-set', name: 'Discovery Set (5 × 10 ml)', category: 'gift-sets', concentration: 'Gift Set', size: 50, price: 4500,
    shape: 'tall', liquid: '#d9a441', cap: '#c9a96e',
    top: 'ZAQA Signature, Rose Éternelle', heart: 'Noir Absolu, Oud Al Layl', base: 'Bleu Marine',
    description: 'Five ZAQA bestsellers in 10 ml travel sprays, in a magnetic gift box. The perfect way to find your signature.',
  }),
  p({
    slug: 'his-and-hers', name: 'His & Hers Duo (2 × 100 ml)', category: 'gift-sets', concentration: 'Gift Set', size: 200, price: 15500, discount: 15, featured: 1,
    shape: 'classic', glass: 'black', liquid: '#3b2a1a', cap: '#c9a96e',
    top: 'Noir Absolu (100 ml)', heart: 'Rose Éternelle (100 ml)', base: 'Keepsake gift box',
    description: 'Two signatures, one gift: Noir Absolu and Rose Éternelle in a keepsake box with a hand-written card. Ideal for weddings and anniversaries.',
  }),
  // Body mists
  p({
    slug: 'coco-breeze', name: 'Coco Breeze', category: 'body-mists', concentration: 'Body Mist', size: 250, price: 1850,
    shape: 'mist', glass: 'frosted', liquid: '#f6ead2', cap: '#f0ebe3',
    top: 'Coconut water, lime', heart: 'Frangipani, tiare', base: 'Vanilla, musk',
    description: 'A light coconut veil for every day. Spray generously after a shower. Lasts 2–3 hours.',
  }),
  p({
    slug: 'berry-blush', name: 'Berry Blush', category: 'body-mists', concentration: 'Body Mist', size: 250, price: 1850,
    shape: 'mist', glass: 'frosted', liquid: '#f1b3c3', cap: '#e8a0b4',
    top: 'Raspberry, blackcurrant', heart: 'Rose petals', base: 'Sugared musk',
    description: 'Juicy berries and soft petals. Fun, sweet and easy to layer. Lasts 2–3 hours.',
  }),
  p({
    slug: 'ocean-mist', name: 'Ocean Mist', category: 'body-mists', concentration: 'Body Mist', size: 250, price: 1850, discount: 10,
    shape: 'mist', glass: 'frosted', liquid: '#bfe0e4', cap: '#9ccfd6',
    top: 'Sea spray, cucumber', heart: 'Water lily', base: 'Driftwood, musk',
    description: 'Cool, clean and breezy, like the sea air at Clifton. Lasts 2–3 hours.',
  }),
];

// Inserts the starter categories and products. Used on first start and by the admin "load catalog" action.
export function insertCatalog() {
  categories.forEach(([slug, name, tagline, color], i) =>
    run('INSERT INTO categories (slug, name, tagline, color, sort) VALUES (?, ?, ?, ?, ?)', slug, name, tagline, color, i)
  );
  for (const x of products) {
    const catId = one('SELECT id FROM categories WHERE slug = ?', x.category).id;
    run(
      `INSERT INTO products (slug, name, category_id, price, discount_percent, size_ml, concentration, bottle_shape, glass_style,
        liquid_color, cap_color, notes_top, notes_heart, notes_base, description, featured, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      x.slug, x.name, catId, x.price, x.discount, x.size, x.concentration, x.shape, x.glass,
      x.liquid, x.cap, x.top, x.heart, x.base, x.description, x.featured, x.stock
    );
  }
}

// Replaces all products and categories with the starter catalog. Orders keep their own copies of item details.
export function replaceCatalog() {
  tx(() => {
    run('DELETE FROM products');
    run('DELETE FROM categories');
    insertCatalog();
  });
}
