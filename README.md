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

### Production Docker / slim runtime

The production image includes `prisma/`, `src/`, and `tsconfig.json` so you can run migrations and seed **inside the container** (after setting `DATABASE_URL` and optional `SEED_*` vars):

```bash
npx prisma migrate deploy
SEED_SUPER_ADMIN_EMAIL="you@example.com" SEED_SUPER_ADMIN_PASSWORD="…" npm run db:seed
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
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Phone Auth (client). Baked in at **`docker build`** / **`next build`**. |
| `FIREBASE_ADMIN_*` | Firebase Admin SDK (server). **Runtime only** — required for `/api/auth/firebase/verify`. |

Customer sign-in: **`/auth/phone`** (OTP). Checkout requires a signed-in customer. **`CUSTOMER_WHATSAPP_COUNTRY_CODE`** defaults to `91` (see `.env.example`).

### Firebase Phone Auth on production (Docker)

SMS **send** uses the browser + `NEXT_PUBLIC_FIREBASE_*` (build-time). **Verify** calls your server, which needs **`FIREBASE_ADMIN_PROJECT_ID`**, **`FIREBASE_ADMIN_CLIENT_EMAIL`**, and **`FIREBASE_ADMIN_PRIVATE_KEY`** on the **running container** — copying `.env` locally is not enough; the production image does not include it.

If verify returns *Invalid Firebase token* on live but SMS arrives, add these runtime env vars on the host and restart:

```bash
docker run -d \
  -e DATABASE_URL="…" \
  -e FIREBASE_ADMIN_PROJECT_ID="khaanz" \
  -e FIREBASE_ADMIN_CLIENT_EMAIL="firebase-adminsdk-…@khaanz.iam.gserviceaccount.com" \
  -e FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n" \
  … your-image:latest
```

Use the same service account as in Firebase Console → Project settings → Service accounts. Keep `\n` escapes inside the quoted private key. Do **not** set `FIREBASE_ADMIN_CREDENTIALS_PATH` in production unless you mount the JSON file into the container.

For CI builds, add GitHub Actions secrets: `NEXT_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

WhatsApp Cloud / order formatting env vars are unchanged (see `src/lib/whatsapp-cloud.ts` and related).

### Delivery distance & fees on production (Docker)

Locally, `.env` supplies `GOOGLE_MAPS_API_KEY`, `RESTAURANT_LATITUDE`, `RESTAURANT_LONGITUDE`, and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. **The production image does not include `.env`.** If these are missing on the server, checkout shows a flat base delivery fee instead of distance-based pricing.

**Option A — runtime env on the host** (recommended first deploy):

```bash
docker run -d \
  -e DATABASE_URL="…" \
  -e GOOGLE_MAPS_API_KEY="…" \
  -e RESTAURANT_LATITUDE="33.788755" \
  -e RESTAURANT_LONGITUDE="75.101721" \
  … your-image:latest
```

On the first distance request, lat/lng from env are saved into the database so they keep working even if env vars are removed later.

**Option B — Admin only (no server env for coordinates):**  
Open **Admin → Settings → Delivery charges**, set **Restaurant latitude / longitude**, save. Delivery fees use straight-line distance if `GOOGLE_MAPS_API_KEY` is unset, or driving distance when the server key is set.

**Build-time (checkout map):** pass `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as a Docker build-arg (see `.github/workflows/deploy-prod.yml`). Without it, checkout still works but uses OpenStreetMap tiles.

**Google Cloud:** enable Distance Matrix API + Places API on the server key; restrict the server key by your VPS IP. Restrict the browser key by your production HTTPS origin (e.g. `https://yourdomain.com/*`).

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
- Roles: **`SUPER_ADMIN`** (full access), **`ADMIN`**, and **`STAFF`** with per-module permissions (Inventory, Wastage, POS, Orders, etc.).
- Create staff logins and assign modules at **`/admin/staff`**.
- Order create / edit / status changes are recorded on each order’s activity trail.

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
