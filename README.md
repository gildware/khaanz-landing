# Khaanz — Restaurant ordering PWA + Admin (single app)

One Next.js 15 app:

- **Customer:** `/` — menu (from API), cart, checkout with map, WhatsApp order.
- **Admin:** `/admin/*` — manage categories, items, variations, add-ons; **all data is stored in PostgreSQL** (menu, settings, users, orders).

Menu is served at **`GET /api/menu`** (no cache). The storefront uses **SWR** with a **~60s refresh** so changes from admin show up on the customer UI without a full reload.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 16+ (local Docker or hosted, e.g. Neon)

## Install

```bash
npm install
cp .env.example .env          # set DATABASE_URL and secrets (see below)
npx prisma migrate deploy     # apply migrations
npm run db:seed               # super admin + default menu + settings row (first time)
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (**required**) |
| `ADMIN_SESSION_SECRET` | Signing key for the admin JWT cookie (change in production) |
| `SEED_SUPER_ADMIN_EMAIL` | Used by `npm run db:seed` to upsert the super admin user |
| `SEED_SUPER_ADMIN_PASSWORD` | Plain password for that user (hashed with bcrypt in the DB) |
| `CUSTOMER_SESSION_SECRET` | Optional JWT signing for customer cookie (defaults to `ADMIN_SESSION_SECRET`) |
| `WHATSAPP_CLOUD_*` | When set, OTP is sent by WhatsApp to `91` + mobile; customer order updates use the same API |

Customer sign-in: **`/auth/phone`** (OTP). Checkout requires a signed-in customer. **`CUSTOMER_WHATSAPP_COUNTRY_CODE`** defaults to `91` (see `.env.example`).

WhatsApp Cloud / order formatting env vars are unchanged (see `src/lib/whatsapp-cloud.ts` and related).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Dev server — [http://localhost:3000](http://localhost:3000) |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Interactive migrations (dev) |
| `npm run db:push` | Push schema (prototyping only) |
| `npm run db:seed` / `npm run seed:menu` | Seed super admin, settings row, and menu from `src/data/menu.ts` if empty |

**URLs**

| Area | Path |
|------|------|
| Menu & order | `/`, `/cart`, `/checkout`, `/success`, `/auth/phone`, `/my-orders`, `/track/[orderId]` |
| Admin | `/admin/login`, `/admin/orders`, `/admin/dashboard`, `/admin/categories`, `/admin/items`, `/admin/addons` |

## How menu sync works

1. **Source of truth:** PostgreSQL tables (`categories`, `menu_items`, variations, add-ons, combos, etc.).
2. **`GET /api/menu`** reads from the DB. If nothing is seeded yet, the API returns an empty menu until you run `npm run db:seed`.
3. **`PUT /api/admin/menu`** (requires admin cookie) replaces menu rows in a transaction.
4. **Bundled defaults** in `src/data/menu.ts` are only used by **`prisma/seed.ts`** to populate an empty database — not read at runtime from disk.

## Admin auth

- Admin login is **email + password** against the **`users`** table (bcrypt hashes).
- Roles: **`SUPER_ADMIN`** (full system; seed creates this) and **`ADMIN`** (same admin UI for now; you can add more `ADMIN` rows via Prisma Studio or a future API).

## API routes (selected)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/menu` | No | Current menu JSON |
| POST | `/api/admin/login` | No | Body: `{ email, password }` — sets httpOnly `admin_token` |
| POST | `/api/admin/logout` | No | Clears cookie |
| PUT | `/api/admin/menu` | Yes | Replaces menu in DB |
| GET/PUT | `/api/admin/settings` | Yes | Restaurant settings in DB |

## Project layout

```
prisma/
  schema.prisma
  migrations/
  seed.ts                 # Super admin, settings, menu from src/data/menu.ts
data/
  .gitkeep                # Reserved for optional non-DB assets (e.g. invoices)
src/
  app/admin/              # Admin UI + login
  app/api/menu/           # Public menu API
  app/api/admin/          # Login, logout, menu, settings
  data/menu.ts            # Default menu used only by prisma seed
  lib/menu-repository.ts  # Prisma read/write of full MenuPayload
  lib/settings-repository.ts
  middleware.ts           # Protects /admin/* (except /admin/login)
```

## Licence

Private / use as needed for your restaurant.
