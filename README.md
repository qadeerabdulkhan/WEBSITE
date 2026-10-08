# ZAQA: Fragrances by Zaqa

A cinematic 3D perfume store with customer accounts, an admin dashboard and Pakistani payment gateways (JazzCash, Easypaisa, NayaPay and Mastercard cards). Cash on delivery is deliberately not offered.

- **Storefront:** Node.js, Express and SQLite on the server; plain HTML, CSS and Three.js in the browser. There is no build step.
- **3D on every page except cart and checkout:** the home page hero, the category carousel, the shop and account banners, the product viewer (drag to rotate), the sign-in page and the admin emblem.
- **Procedural bottles:** each product's 3D bottle is generated from its shape, liquid colour and cap colour, so the store looks finished before you have product photos. When you upload a photo, the product page offers both a 3D view and a photo view.

## Quick start

Requires **Node.js 22.13 or newer**.

```bash
npm install
cp .env.example .env      # set ADMIN_EMAIL / ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

On first start the database is created in `data/zaqa.db` and filled with 10 categories, 24 products, testimonials and a `WELCOME10` coupon. If you didn't set `ADMIN_PASSWORD`, a random admin password is printed in the console.

- **Customers** open the site, sign in or create an account with an **email or a mobile number**, and land on the home page. You can turn off the sign-in requirement under Admin → Store settings. Checkout and My Account always need sign-in.
- **You (admin)** sign in at `/login` with the admin email and are taken to `/admin`.

Run the tests with `npm test`.

## Admin dashboard (`/admin`)

| Section | What you can do |
|---|---|
| Overview | See revenue, orders to fulfil, customers, a 14-day revenue chart, low-stock alerts and recent orders |
| Orders | Filter and search orders; open one to change its status (paid → processing → shipped → delivered, cancelled or refunded), add a courier tracking number and timeline notes, or mark it paid manually |
| Products & prices | Add, edit or delete products; edit price, discount and stock directly in the table; change prices in bulk by a percentage; upload photos; choose the 3D bottle shape and colours |
| Categories | Add, edit, reorder, hide or delete categories, each with its own colour |
| Discounts | Run a store-wide sale with banner text, and manage coupon codes (percentage or fixed amount, minimum order, expiry, usage limit) |
| Hero & content | Edit the hero headline, sub-headline and button, the announcement bar and the "Our story" section |
| Testimonials | Add, edit, hide or delete testimonials |
| Customers | See every account with its order count and total spent |
| Payment accounts | Receive payments in your own JazzCash, Easypaisa, NayaPay or bank account (no merchant account needed) and check each transfer |
| Store settings | Set the delivery fee, the free-delivery threshold, the sign-in requirement and contact details |

## Customer dashboard (`/account`)

Customers can follow each order on a live status timeline (Placed → Paid → Shipped → Delivered) and see its tracking number. They can also pay or cancel an unpaid order, edit their profile and saved address, change their password, and sign out.

## Payments

All four methods use the provider's own **hosted payment page**, so card numbers and wallet PINs never touch this server. An order is marked paid only after the server has verified the provider's response.

`PAYMENT_MODE` in `.env` controls this:

- `simulate` (default): a built-in test checkout with *Approve* and *Decline* buttons. Use it to try the full flow. No money moves.
- `sandbox`: the providers' test servers with your sandbox keys.
- `live`: real payments.

In `sandbox` and `live` mode, checkout only shows the methods whose keys are filled in.

| Method | What you need | Notes |
|---|---|---|
| **JazzCash** | Merchant ID, password, integrity salt from the JazzCash merchant portal | Page-redirection integration with HMAC-SHA256 secure hash; the response hash and amount are verified on return. Set the return URL in the portal to `BASE_URL/pay/jazzcash/return`. |
| **Easypaisa** | Store ID and hash key (Easypay); API username, password and account number for verification | Easypay hosted checkout (AES-encrypted request). Payments are confirmed with the Inquire Transaction API. Without the API credentials, orders wait as "awaiting verification" until you mark them paid in the dashboard. |
| **NayaPay** | NayaPay merchant onboarding | NayaPay gives its checkout API documentation to merchants when they are onboarded. The adapter in `server/payments.js` (`nayapay`) has the hook points; fill in the two calls from their docs and set `implemented: true`. Until then NayaPay works in `simulate` mode and is hidden from checkout in live mode. |
| **Mastercard / Visa** | A Mastercard Payment Gateway Services (MPGS) merchant account from your bank (for example HBL, Bank Alfalah or Meezan) | Hosted Checkout: the server creates a session, the customer pays on the bank's page, and the server checks the success indicator and looks the order up before marking it paid. Set `MPGS_GATEWAY_URL` to the host your bank gives you. |

Before going live, run one real low-value payment per method and confirm it arrives in your merchant account.

### Without a merchant account: bank / wallet transfer

Under **Admin → Payment accounts**, switch on "Bank / wallet transfer" and enter your own JazzCash, Easypaisa or NayaPay number and/or bank IBAN. At checkout, customers then:

1. place the order and see your account details and the exact amount;
2. send the money from their own app;
3. enter the transaction ID (TID) and upload a screenshot.

The order shows as *awaiting verification* in **Orders**, with the TID and the screenshot. Screenshots are stored privately next to the database and only admins can open them. Check that the money arrived in your app, then tick **Mark as paid**. A TID can only be used for one order. While transfers are on, the simulated test gateways are hidden from customers. Personal wallets have monthly limits and their terms may not allow regular business use, so move to merchant accounts as orders grow.

## Deploying

Any host that runs Node 22 works, such as a VPS, Railway, Render or Fly.io. It needs persistent disk for `data/` and `public/uploads/`.

1. Set `NODE_ENV=production`, `BASE_URL=https://your-domain` and a strong `ADMIN_PASSWORD`.
2. Serve the site over **HTTPS**; payment gateways require it, and session cookies are marked `Secure` in production.
3. Back up `data/zaqa.db` regularly.

## Project layout

```
server/
  index.js      app setup, security headers, page access rules
  api.js        auth, catalog, cart pricing, orders, customer account
  admin.js      admin API (orders, products, categories, coupons, content, customers)
  payments.js   JazzCash, Easypaisa, NayaPay, Mastercard + test-mode checkout
  shop.js       pricing, discounts, order helpers
  auth.js       sessions, password hashing, rate limiting
  db.js seed.js SQLite schema and starter data
public/
  *.html        pages (home, categories, shop, product, cart, checkout, account, login, admin)
  css/          storefront and dashboard styles
  js/pages/     one script per page
  js/three/     3D engine: stage, bottle generator, effects, scenes, thumbnails
  vendor/three/ Three.js r160 (MIT)
test/           end-to-end API tests
```

## Security notes

- Prices, discounts and stock are always calculated on the server; the cart in the browser holds only product IDs and quantities.
- Passwords are hashed with bcrypt. Sessions use random tokens in httpOnly, SameSite cookies, with only a hash of each token stored. Sign-in attempts are rate-limited.
- API changes must be JSON requests from your own domain (CSRF protection). The site sends a strict Content-Security-Policy and other security headers.
- Everything admins edit is HTML-escaped before it reaches the page.
