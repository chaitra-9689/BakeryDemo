# Crumb & Co. Bakery

Online bakery storefront: browse products, add to cart, sign in, place orders and track them.
React + TypeScript + Vite on the frontend, Supabase (Postgres, Auth, RLS) as the backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # type-check + production build into dist/
```

Configuration comes from `.env` (not committed):

| Variable | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | browser | Project API URL |
| `SUPABASE_PUBLISHABLE_KEY` | browser | Falls back to `SUPABASE_ANON_KEY` |
| `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` | `scripts/run-sql.mjs` only | Never bundled into the site |

Only the URL and publishable key reach the browser (see `vite.config.ts`).

## Database

- `supabase/migrations/20261019000001_bakery_schema.sql`: tables, RLS policies, `place_order` function
- `supabase/seed.sql`: 5 categories, 20 products
- `supabase/migrations/20261020000001_crm.sql`: `admins` table + `is_admin()`, `customer_notes`,
  `order_status_history` (filled by trigger), and admin RLS policies

Both are already applied to the project. To run SQL against it:

```bash
npm run db:sql -- path/to/file.sql
```

Tables: `categories`, `products` (public read), `profiles` (created on sign-up), `orders` and `order_items`
(each customer sees only their own). Orders can only be created through `place_order()`, which looks up
prices in `products`, so totals can't be tampered with from the browser.

Staff manage orders, customers and products in the CRM (see below).

## CRM (`/admin`)

Back office at `/admin`, with its own sign-in page at `/admin/login` (with "Forgot password?", which emails a link to
`/admin/reset-password`). Only accounts listed in `public.admins`
get in; everyone else is sent back to the sign-in page.

- **Dashboard**: revenue, order and customer counts, average order value, 14-day revenue chart, orders by status,
  recent orders, top products (cancelled orders don't count towards revenue)
- **Orders**: search, filter by status, change status inline; detail page with items, customer and status history
- **Customers**: search and sort by spend / orders / activity; detail page with contact info, order history
  and private staff notes
- **Products**: add, edit, toggle available / featured

Admins can change only an order's `status` (column-level grant); totals and items stay as placed.
To make another user an admin:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'someone@example.com';
```

## Pages

`/` home · `/shop` catalog with category filter, search, sort · `/product/:slug` · `/cart` ·
`/checkout` · `/orders` · `/orders/:id` · `/account` · `/login` ·
`/about` · `/faq`

`/admin` · `/admin/orders[/:id]` · `/admin/customers[/:id]` · `/admin/products` · `/admin/login` · `/admin/reset-password`

Interactive elements carry `data-testid` attributes for Playwright tests.

## End-to-end tests

```bash
npm run test:e2e
```

`tests/e2e.mjs` drives Chromium (Playwright) through 49 test cases covering the storefront, About us and FAQs pages, footer, cart, customer
accounts, checkout and every CRM screen, against `BASE_URL` from `.env` (the live site by default). It needs
`ADMIN_EMAIL` / `ADMIN_PASSWORD` and a non-admin `CUSTOMER_EMAIL` / `CUSTOMER_PASSWORD` in `.env`. Each run
replaces:

- `testing_ss/`: a screenshot of every step
- `testing_recording/`: MP4 recording of the whole run
- `TEST_CASES.md` and `test_results.xlsx`: test cases with steps, expected vs actual results and PASS / FAIL

Each run places one real order as the QA customer (note "Automated test order – please ignore"); product
changes and staff notes made during the run are reverted.
