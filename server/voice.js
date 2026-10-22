// "Talk to ZAQA": a voice shopping assistant powered by Claude.
// The browser does speech-to-text and text-to-speech; this module runs the conversation
// and gives Claude a small set of store tools. Conversations are kept in memory on the
// server so the browser can't rewrite what the assistant said or saw.
import crypto from 'node:crypto';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { all, one, run, getContent } from './db.js';
import { HttpError, rateLimit } from './auth.js';
import { findProducts, findProduct, shapeOrder, addHistory, settings } from './shop.js';
import { availableMethods } from './payments.js';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 40;
const MAX_INPUT = 600;
const IDLE_MS = 30 * 60e3;
const MAX_TOOL_ROUNDS = 6;

let client;
const anthropic = () => (client ||= new Anthropic());

const conversations = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of conversations) if (c.updated + IDLE_MS < now) conversations.delete(id);
}, 60e3).unref();

const rs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const canPay = (o) => o.payment_status !== 'paid' && o.payment_status !== 'awaiting_verification' && ['pending_payment', 'payment_failed'].includes(o.status);
const isConfirmed = (o) => JSON.parse(o.history || '[]').some((h) => h.note?.startsWith('Order details confirmed by customer'));

// Unpaid orders from the last 7 days and paid orders whose details the customer hasn't confirmed yet.
export function followUps(userId) {
  if (!userId) return { unpaid: [], toConfirm: [] };
  const recent = all("SELECT * FROM orders WHERE user_id = ? AND created_at >= datetime('now', '-7 days') ORDER BY id DESC", userId);
  return {
    unpaid: recent.filter(canPay),
    toConfirm: recent.filter((o) => ['paid', 'processing'].includes(o.status) && !isConfirmed(o)),
  };
}

function briefProduct(p) {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category?.name || null,
    concentration: p.concentration,
    sizeMl: p.sizeMl,
    price: p.finalPrice,
    originalPrice: p.finalPrice < p.price ? p.price : undefined,
    notes: p.notes,
    inStock: p.stock > 0,
  };
}

function briefOrder(o) {
  const s = shapeOrder(o);
  return {
    ref: s.ref,
    placed: s.createdAt,
    status: s.status,
    paymentStatus: s.paymentStatus,
    paymentMethod: s.paymentMethod,
    items: s.items.map((i) => `${i.qty} x ${i.name} ${i.sizeMl}ml`),
    total: s.total,
    tracking: s.tracking || null,
    deliverTo: [s.shippingAddress.fullName, s.shippingAddress.line1, s.shippingAddress.line2, s.shippingAddress.city].filter(Boolean).join(', '),
    deliveryPhone: s.shippingAddress.phone,
    canPayNow: canPay(o),
    detailsConfirmed: isConfirmed(o),
  };
}

const TOOLS = [
  {
    name: 'search_products',
    description: 'Search the ZAQA catalog. Use for any question about which perfumes we sell, recommendations, prices or notes. Returns up to 8 matches. Leave both fields empty to list featured products.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to match in name, description or notes, e.g. "oud", "rose", "fresh".' },
        category: { type: 'string', description: 'Optional category slug from list_categories.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_product',
    description: 'Full details of one product by slug: description, notes, size, price and stock.',
    input_schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
  },
  {
    name: 'list_categories',
    description: 'List the store categories with their slugs.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'store_info',
    description: 'Delivery fee, free-delivery threshold, current sale, accepted payment methods and contact details.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_my_orders',
    description: "The signed-in customer's 5 most recent orders with status, payment status, tracking and delivery address.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'confirm_order',
    description: 'Record that the customer has confirmed the items and delivery address of one of their orders. Only call after reading the details back and hearing a clear yes.',
    input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'], additionalProperties: false },
  },
  {
    name: 'add_to_cart',
    description: "Add a product to the customer's cart on this website. Only when the customer asks for it.",
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string' }, qty: { type: 'integer', minimum: 1, maximum: 5 } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_page',
    description: 'Open a page for the customer after you finish speaking: a product page, the cart, checkout, their account, or the payment page of an unpaid order.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: ['product', 'cart', 'checkout', 'account', 'pay_order', 'shop'] },
        slug: { type: 'string', description: 'Product slug, for page "product".' },
        ref: { type: 'string', description: 'Order reference, for page "pay_order".' },
      },
      required: ['page'],
      additionalProperties: false,
    },
  },
];

const SIGN_IN = { error: 'The customer is not signed in. Ask them to sign in from the account icon, then try again.' };

// Runs one tool for a conversation. Returns the result for Claude; browser actions are pushed to `actions`.
export function runTool(name, input, { userId, actions }) {
  const s = settings();
  switch (name) {
    case 'search_products': {
      const query = String(input.query || '').slice(0, 80);
      const category = String(input.category || '').slice(0, 80);
      let found = findProducts({ q: query, category, featured: !query && !category });
      // Fall back to matching any single word, so "something with rose and oud" still finds things.
      if (!found.length && query.includes(' ')) {
        const seen = new Map();
        for (const w of query.split(/\s+/).filter((x) => x.length > 2)) for (const p of findProducts({ q: w, category })) seen.set(p.id, p);
        found = [...seen.values()];
      }
      return { results: found.slice(0, 8).map(briefProduct), totalMatches: found.length };
    }
    case 'get_product': {
      const p = findProduct(String(input.slug || ''));
      if (!p || !p.active) return { error: 'No product with that slug.' };
      return { ...briefProduct(p), description: p.description, stockLeft: p.stock };
    }
    case 'list_categories':
      return all('SELECT slug, name, tagline FROM categories WHERE active = 1 ORDER BY sort, id');
    case 'store_info':
      return {
        currency: 'PKR',
        deliveryFee: Number(s.shippingFee) || 0,
        freeDeliveryOver: Number(s.freeShippingOver) || null,
        sale: s.sitewideDiscount ? `${s.sitewideDiscount}% off everything${s.sitewideDiscountLabel ? ` (${s.sitewideDiscountLabel})` : ''}` : null,
        paymentMethods: availableMethods().map((m) => m.label),
        cashOnDelivery: false,
        contactPhone: s.contactPhone || null,
        contactEmail: s.contactEmail || null,
        announcement: getContent('announcement')?.active ? getContent('announcement').text : null,
      };
    case 'get_my_orders':
      if (!userId) return SIGN_IN;
      return all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 5', userId).map(briefOrder);
    case 'confirm_order': {
      if (!userId) return SIGN_IN;
      const o = one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', String(input.ref || '').toUpperCase(), userId);
      if (!o) return { error: 'No order with that reference on this account.' };
      if (['cancelled', 'refunded', 'delivered'].includes(o.status)) return { error: `This order is ${o.status}; nothing to confirm.` };
      if (!isConfirmed(o)) {
        run("UPDATE orders SET history = ?, updated_at = datetime('now') WHERE id = ?", addHistory(o, o.status, 'Order details confirmed by customer (voice assistant)'), o.id);
      }
      return { ok: true, order: briefOrder(one('SELECT * FROM orders WHERE id = ?', o.id)) };
    }
    case 'add_to_cart': {
      const p = findProduct(String(input.slug || ''));
      if (!p || !p.active) return { error: 'No product with that slug.' };
      if (p.stock < 1) return { error: `${p.name} is out of stock.` };
      const qty = Math.min(Math.max(Math.floor(Number(input.qty) || 1), 1), 5);
      actions.push({ type: 'add_to_cart', slug: p.slug, qty, name: p.name });
      return { ok: true, added: `${qty} x ${p.name}` };
    }
    case 'open_page': {
      const paths = { cart: '/cart', checkout: '/checkout', account: '/account', shop: '/shop' };
      let href = paths[input.page];
      if (input.page === 'product') {
        const p = findProduct(String(input.slug || ''));
        if (!p || !p.active) return { error: 'No product with that slug.' };
        href = `/product?slug=${encodeURIComponent(p.slug)}`;
      }
      if (input.page === 'pay_order') {
        if (!userId) return SIGN_IN;
        const o = one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', String(input.ref || '').toUpperCase(), userId);
        if (!o) return { error: 'No order with that reference on this account.' };
        if (!canPay(o)) return { error: 'This order does not need paying now.' };
        href = `/pay/${encodeURIComponent(o.ref)}/start`;
      }
      if (!href) return { error: 'Unknown page.' };
      // Only the last page asked for is opened.
      const i = actions.findIndex((a) => a.type === 'navigate');
      if (i > -1) actions.splice(i, 1);
      actions.push({ type: 'navigate', href });
      return { ok: true, willOpen: href };
    }
    default:
      return { error: `Unknown tool ${name}.` };
  }
}

function systemPrompt(user) {
  const s = settings();
  return `You are the voice assistant for ZAQA (Fragrances by Zaqa), a luxury perfume and attar store in Pakistan. You are speaking with a customer through their browser, like a phone call: your words are read aloud and theirs are transcribed by speech recognition.

How to speak:
- Reply in English, in one to three short spoken sentences. No lists, markdown, emojis or URLs.
- Say prices like "Rs 4,500". Speech recognition makes mistakes; if something is unclear, ask.
- Be warm and concise, like a knowledgeable shop assistant. Ask one question at a time.

What you can do:
- Recommend fragrances and answer questions about notes, sizes, prices, stock, delivery and payment. Always use the tools for facts; never invent products, prices or policies.
- For a signed-in customer: tell them where their orders are, help them finish paying an unpaid order (open its payment page), and confirm the items and delivery address of a new order. Read the details back and only call confirm_order after a clear yes. If the address is wrong, tell them to update it under My Account or call ${s.contactPhone || 'the store'}.
- Add products to the cart or open a page when the customer asks.
- Cash on delivery is not offered. You cannot take card or wallet details by voice; payment always happens on the payment page.
- You cannot cancel, refund or change orders. For those, direct them to My Account or the store's contact details.

The customer is ${user ? `signed in as ${user.name}` : 'not signed in'}.`;
}

function greeting(user) {
  if (!user) return "Hi, you're through to ZAQA. I can help you find a fragrance, or answer questions about delivery and payment. What are you looking for today?";
  const first = user.name.split(' ')[0];
  const { unpaid, toConfirm } = followUps(user.id);
  if (unpaid.length) {
    const o = unpaid[0];
    return `Hi ${first}, thanks for calling ZAQA. I can see order ${o.ref} for ${rs(o.total)} hasn't been paid yet. Would you like help finishing it, or is there something else I can do?`;
  }
  if (toConfirm.length) {
    const o = toConfirm[0];
    return `Hi ${first}, thanks for your order ${o.ref}. Before we ship it, would you like me to quickly confirm the items and delivery address with you?`;
  }
  return `Hi ${first}, you're through to ZAQA. How can I help you today?`;
}

async function reply(convo) {
  const actions = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      system: convo.system,
      tools: TOOLS,
      messages: convo.messages,
    });
    convo.messages.push({ role: 'assistant', content: response.content });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();

    if (response.stop_reason === 'refusal') {
      return { text: "Sorry, I can't help with that. Is there anything else about our fragrances I can help with?", actions };
    }
    if (response.stop_reason === 'pause_turn') continue;
    if (response.stop_reason !== 'tool_use') return { text: text || 'Sorry, could you say that again?', actions };

    const results = response.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        let content;
        let isError = false;
        try {
          content = JSON.stringify(runTool(b.name, b.input || {}, { userId: convo.userId, actions }));
        } catch (err) {
          console.error('voice tool failed', b.name, err);
          content = 'The tool failed. Apologise and suggest contacting the store.';
          isError = true;
        }
        return { type: 'tool_result', tool_use_id: b.id, content, is_error: isError };
      });
    convo.messages.push({ role: 'user', content: results });
  }
  return { text: "Sorry, that took longer than expected. Could you ask me again?", actions };
}

export const voiceEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.VOICE_AGENT !== 'off';

export function voiceRoutes() {
  const r = express.Router();
  const limit = rateLimit({ windowMs: 10 * 60e3, max: 80 });

  // Lets the widget know whether to show itself, and whether to nudge about an unpaid order.
  r.get('/status', (req, res) => {
    const f = followUps(req.user?.id);
    res.json({ enabled: voiceEnabled(), nudge: f.unpaid.length ? 'unpaid' : f.toConfirm.length ? 'confirm' : null });
  });

  r.post('/start', limit, (req, res) => {
    if (!voiceEnabled()) throw new HttpError(503, 'The voice assistant is not available right now.');
    const user = req.user;
    const id = crypto.randomBytes(16).toString('base64url');
    const text = greeting(user);
    conversations.set(id, {
      userId: user?.id || null,
      system: systemPrompt(user),
      // The API needs the conversation to start with the customer, so the call itself is the first turn.
      messages: [
        { role: 'user', content: '[The customer has opened the voice assistant.]' },
        { role: 'assistant', content: text },
      ],
      busy: false,
      updated: Date.now(),
    });
    res.json({ id, text });
  });

  r.post('/message', limit, async (req, res) => {
    if (!voiceEnabled()) throw new HttpError(503, 'The voice assistant is not available right now.');
    const convo = conversations.get(String(req.body.id || ''));
    // Conversations belong to whoever started them; signing in or out mid-call starts a new one.
    if (!convo || convo.userId !== (req.user?.id || null)) throw new HttpError(410, 'This call has ended. Please start a new one.');
    const text = String(req.body.text || '').trim().slice(0, MAX_INPUT);
    if (!text) throw new HttpError(400, 'Say something first.');
    if (convo.busy) throw new HttpError(409, 'Still answering your last question.');
    if (convo.messages.filter((m) => m.role === 'user').length > MAX_TURNS) throw new HttpError(429, 'This call is very long. Please start a new one.');
    convo.busy = true;
    const before = convo.messages.length;
    try {
      convo.messages.push({ role: 'user', content: text });
      const out = await reply(convo);
      convo.updated = Date.now();
      res.json(out);
    } catch (err) {
      // Drop the half-finished turn so the conversation stays valid for the next message.
      convo.messages.length = before;
      if (err instanceof Anthropic.APIError) {
        console.error('voice agent API error', err.status, err.message);
        throw new HttpError(502, 'The assistant is having trouble right now. Please try again in a moment.');
      }
      throw err;
    } finally {
      convo.busy = false;
    }
  });

  r.post('/end', (req, res) => {
    conversations.delete(String(req.body.id || ''));
    res.json({ ok: true });
  });

  return r;
}
