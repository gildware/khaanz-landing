# Khaanz — Restaurant ordering PWA + Admin (single app)

One Next.js 15 app:

- **Customer:** `/` — menu (from API), cart, checkout with map, WhatsApp order.
- **Admin:** `/admin/*` — manage categories, items, variations, add-ons; saves to **`data/menu.json`** on disk.

Menu is served at **`GET /api/menu`** (no cache). The storefront uses **SWR** with a **~3s refresh** so changes from admin show up on the customer UI without a full reload.

## Requirements

- Node.js 20+
- npm 10+

## Install

```bash
npm install
cp .env.example .env.local   # optional: set secrets
npm run seed:menu            # creates data/menu.json from defaults if missing
```

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD` | Password for `/admin/login` (default in code: `khaanzadmin` if unset) |
| `ADMIN_SESSION_SECRET` | Signing key for the admin JWT cookie (must match everywhere; change in production) |

WhatsApp number is in `src/utils/whatsapp.ts`.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Dev server — [http://localhost:3000](http://localhost:3000) (webpack; stable) |
| `npm run dev:turbo` | Same with Turbopack (faster; if you see ENOENT / manifest errors, use `npm run dev` and `rm -rf .next`) |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm run seed:menu` | Write `data/menu.json` from `src/data/menu.ts` defaults (if file missing, repository helper does this too) |

**URLs**

| Area | Path |
|------|------|
| Menu & order | `/`, `/cart`, `/checkout`, `/success` |
| Admin | `/admin/login`, `/admin/dashboard`, `/admin/categories`, `/admin/items`, `/admin/addons` |

## How menu sync works

1. **Source of truth on disk:** `data/menu.json` (categories, globalAddons, items).
2. **`GET /api/menu`** reads that file (falls back to defaults from `getDefaultMenuPayload()` if missing).
3. **`PUT /api/admin/menu`** (requires admin cookie) overwrites the file.
4. **Customer UI** polls `/api/menu` every few seconds (SWR `refreshInterval`), so edits in admin appear on the shop quickly.

### Hosting note (important)

Writing to `data/menu.json` works on a **long‑running Node server** (Docker, VPS, `next start` on a VM). On **serverless** platforms (e.g. Vercel), the filesystem is often **read-only** or **ephemeral**, so persisting menu changes to a repo file may not work. For production serverless, use a database or object storage and point `readMenuPayload` / `writeMenuPayload` at that instead.

## PWA

- Service worker is disabled in development (`@ducanh2912/next-pwa`).
- Use production build + `npm start` to test install / offline.
- Offline fallback: `/offline`.

## API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/menu` | No | Current menu JSON |
| POST | `/api/admin/login` | No | Sets httpOnly `admin_token` cookie |
| POST | `/api/admin/logout` | No | Clears cookie |
| PUT | `/api/admin/menu` | Yes | Writes `data/menu.json` |

## Project layout

```
data/
  menu.json              # Live menu (git-tracked; updated by admin)
src/
  app/
    admin/               # Admin UI + login
    api/menu/            # Public menu API
    api/admin/           # Login, logout, menu PUT
  components/
  contexts/
    menu-data-context.tsx   # SWR → /api/menu
  data/menu.ts           # Default seed only (getDefaultMenuPayload)
  lib/menu-repository.ts # fs read/write
  middleware.ts          # Protects /admin/* (except /admin/login)
```

## Licence

Private / use as needed for your restaurant.
