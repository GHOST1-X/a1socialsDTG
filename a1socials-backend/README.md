# A1SOCIALS Custom Backend

Your own backend layer, giving you head control over pricing, wallet, orders,
and both SMM + game top-up products — while sourcing inventory from upstream
provider APIs (SMM panels, top-up aggregators like SEAGM/Yokcash/DigitalRC).

## How it works

1. Customer orders on your storefront → hits `POST /api/orders`
2. Wallet is debited immediately, order saved as `pending`
3. A scheduled job hits `POST/GET /api/cron/poll-orders` every few minutes
4. That job places `pending` orders with the correct upstream provider,
   then checks on `processing` orders until they complete
5. Failed orders auto-retry up to 3 times, then auto-refund to the customer's wallet

SMM and game top-ups share the same `master_services` table (separated by
`category`), same order table, same delivery engine — but you can build two
separate dashboard sections/UIs on top of the same API by filtering with
`?category=smm` or `?category=game_topup`.

## 1. Set up the database

Create a free Postgres database on **Supabase** (supabase.com) or **Neon**
(neon.tech) — both work fine on Vercel/Netlify's serverless model.

Run the schema:
```bash
psql "<your-connection-string>" -f db/schema.sql
```

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — from Supabase/Neon
- `CRON_SECRET` — any long random string (protects the polling endpoint)
- `ADMIN_API_KEY` — any long random string (protects admin routes)

When you deploy to Vercel/Netlify, add these same variables in their
dashboard under Project Settings → Environment Variables.

## 3. Run locally

```bash
npm install
npm run dev
```
Visit `http://localhost:3000/api/health` — should return `{"status":"ok"}`.

## 4. Add your first provider

Insert a row manually (or build an admin UI for this later):
```sql
INSERT INTO providers (name, base_url, api_key)
VALUES ('MyAggregator', 'https://api.myaggregator.com/v1', 'your-api-key-here');
```

**Important:** `lib/providers/genericAggregator.js` is a *template*. Every
aggregator (SEAGM, Yokcash, DigitalRC, or whichever SMM provider you use) has
its own request/response field names. Open that file and adjust the field
names (`sku`, `player_id`, `order_id`, status strings, etc.) to match the
actual API docs of the provider you sign up with. If you're integrating more
than one provider with different API shapes, copy `genericAggregator.js` into
a new file (e.g. `seagm.js`), adjust it, and register it in
`lib/providers/index.js`.

## 5. Add services (products)

```bash
curl -X POST http://localhost:3000/api/services \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <your ADMIN_API_KEY>" \
  -d '{
    "category": "game_topup",
    "name": "Free Fire 100 Diamonds",
    "provider_id": 1,
    "provider_sku": "FF100",
    "cost_price": 900,
    "sell_price": 1200,
    "requires_zone_id": false
  }'
```

## 6. Deploy to Vercel

```bash
npm install -g vercel
vercel
```
`vercel.json` is already configured to:
- Route all `/api/*` requests to the Express app
- Trigger `/api/cron/poll-orders` automatically every hour on Vercel's **Pro** plan

⚠️ **Vercel Hobby (free) plan only allows cron jobs once per day.** For
near-instant top-up delivery you have two options:
- Upgrade to Vercel Pro (cron as frequent as every minute), OR
- Keep Hobby and use a free external scheduler like **cron-job.org** to hit
  `https://yourapp.vercel.app/api/cron/poll-orders` every 1–2 minutes, sending
  header `Authorization: Bearer <CRON_SECRET>`

## Deploying to Netlify instead

Netlify Functions expect a different handler signature (AWS Lambda-style
`event`/`context`), unlike Vercel which accepts a plain Express app directly.
If you want to deploy to Netlify, you'd need a separate entry file using the
`serverless-http` package (already available if you `npm install` it) with a
`netlify.toml` pointing at it, instead of reusing `api/index.js` as-is. Ask if
you want this written out.

## What's included

**Backend (`/`, `/routes`, `/lib`)**
- `db/schema.sql` — Postgres schema: providers, master_services, customers, orders, wallet_transactions
- `routes/auth.js` — customer signup/login, issues JWT
- `routes/orders.js` — place orders (JWT-protected, uses the logged-in customer only)
- `routes/wallet.js` — Flutterwave wallet funding (initiate, verify, webhook)
- `routes/customers.js` — `GET /api/customers/me` (own profile only)
- `routes/services.js` — public service listing + admin CRUD (protected by `ADMIN_API_KEY`)
- `routes/providers.js` — admin CRUD for upstream provider records
- `routes/adminOrders.js` — admin order queue, manual status override, dashboard stats
- `routes/cron.js` — the delivery engine, triggered on a schedule

**Frontend (`/frontend`)**
- `index.html` — customer-facing app: login/signup, wallet balance + funding, browse services, place orders, view order history. Pure HTML/JS, no build step — open it directly or host it anywhere.
- `admin.html` — admin panel: dashboard stats, order queue with filters + manual override, services management, providers management. Gated by pasting your `ADMIN_API_KEY` in on first load.

Both frontend files have a `CONFIG.API_BASE` constant at the top of their `<script>` — point it at your deployed backend URL before using them for real.

## Security model

- Customers authenticate via JWT (`Authorization: Bearer <token>`), obtained from `/api/auth/login` or `/api/auth/signup`. All customer routes derive `customer_id` from the token — never from the request body — so one customer can't act on another's orders or wallet.
- Admin routes are protected by a single shared `ADMIN_API_KEY` header. This is fine for one admin; if you add a team, replace this with per-admin accounts before going live.



**Production-ready:** database schema, order flow with wallet debit/refund,
retry logic, stuck-order detection, service CRUD, customer auth (JWT),
Flutterwave wallet funding, admin panel with order override, both frontend UIs.

**You still need to add before going live:**
- The actual provider adapter tailored to your chosen aggregator's real API
  (`lib/providers/genericAggregator.js` is a template)
- Rate limiting / abuse protection on public endpoints (signup, login especially)
- Password reset flow for customers
- Multi-admin accounts if more than one person manages the panel
- HTTPS enforcement, and tightening CORS from `cors()` (open) to your specific
  storefront domain (`app.use(cors({ origin: 'https://yourdomain.com' }))`)
  before going live
