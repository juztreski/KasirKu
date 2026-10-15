# AGENTS.md

KasirKu — POS app: **Bun + TypeScript** backend, **Svelte 5 (runes) + Vite** SPA frontend, **Drizzle ORM** over SQLite/MySQL/PostgreSQL. No test suite, no linter, no CI.

## Commands

- `bun install` — once at repo root (backend deps only; frontend has its own `package.json`).
- `bun run index.ts` — backend. Loads root `.env` via `loadEnvFile()` (line 313); **missing any required key → process exits silently**. Current port: `APP_LISTEN_PORT=8080`.
- `bun run dev` — backend with `--watch`.
- `bun run frontend:build` — Vite build → **root `dist/`** (`outDir: '../dist'`). The backend serves `./dist` with SPA fallback, so a frontend change is invisible to `bun run index.ts` until you rebuild.
- `bun run frontend:dev` — Vite on :5173. **Gotcha:** its proxy targets `http://localhost:3000` while `.env` uses 8080 — run the backend as `APP_LISTEN_PORT=3000 bun run index.ts` or fix `frontend/vite.config.ts`.
- `bun run drizzle:generate -- <name>` — generates migrations for **all three dialects** (`database/migrations/{sqlite,mysql,postgresql}/`) plus a hook template under `database/migrations/hooks/`. Migrations apply automatically on boot (`src/database/migrate.ts`).

### Verification (there is no lint/test command)

- `bunx tsc --noEmit` fails with many **pre-existing** cross-dialect errors (`.returning()` on MySQL typings, schema union in `index.ts`, etc.) — it is not a gate. Only ensure you add no *new* errors: `bunx tsc --noEmit 2>&1 | grep <your file>`.
- Practical E2E check without disturbing a running instance: `bun run frontend:build`, then `APP_LISTEN_PORT=3999 bun run index.ts` and curl. Auth via `token` header (sessions are rows in `user_sessions`, insertable directly into `database/<DB_NAME>.db`); `/api/public_info` and `/api/katalog` need no token.
- Keep user data clean: the SQLite file is shared with any running server — create/delete only your own test rows.

## Architecture

- **File-based router.** Every `src/method_function/{METHOD}/{route}.ts` with a default export is registered as `` `${METHOD}:${route}` `` (`load_methods` in `index.ts:23`). `/api` is stripped before lookup, so `src/method_function/DELETE/penjualan.ts` serves `DELETE /api/penjualan`; folders nest (`GET/settings/struk.ts` → `/api/settings/struk`). No file → 404. Handler signature: `export default async function(req: Request, token: string) => Response`.
- **Auth is per-handler, not middleware.** Each handler calls `global.user_sessions.get(token)` → `401`, then a permission-bitmask check. Body conventions the frontend depends on (`frontend/src/lib/api/api.ts:46`):
  - `403` body `"0"` → frontend **throws** `ApiError` + dispatches `auth:forbidden`.
  - `403` body `"1"` → frontend **does not throw**; it returns the text to the caller. Use for business-rule rejections (e.g. "sudah ada pembayaran piutang").
- **Public endpoints must be whitelisted** in `src/server.ts:144` — `/api/*` requires a token unless it is `/public_info` or `/katalog`. Extend that condition for new public routes.
- **Permissions are a bitmask duplicated in two files** — edit both: `src/global.ts:48` and `frontend/src/lib/stores/auth.svelte.ts:22` (`ADMINISTRATOR=1`, `MANAGE_BARANG=2`, `KASIR=4`, `MANAGE_PEMBUKUAN=8`, `DASHBOARD=16`). Frontend route gating: `getRequiredPermissionForPath()` in the same file. No separate superadmin role: admin = `ADMINISTRATOR` bit.
- **Realtime = SSE.** Handlers broadcast `global.sse_clients.broadcast(JSON.stringify({type, code, data}))`. Types in use: 1 = users/roles (handled centrally in `sse.svelte.ts`), 2 = barang, 4 = penjualan, 5 = pengeluaran, 6 = pembayaran piutang/barang masuk, 8 = settings. Frontend consumers subscribe per-page via `sse.subscribe(cb)` (returns unsubscribe) — a new event needs a listener in the page component too.

## Data gotchas

- **Money is integer `sen` (cents)** — `500000` = Rp5.000,00. Every `harga_*` / `jumlah_*` / `total_*` column is sen; format with `formatRupiah()` (`frontend/src/lib/utils/format.ts`). Never store rupiah floats.
- **SQLite foreign keys are OFF at runtime** — the connection created in `index.ts:248` never sets `PRAGMA foreign_keys`, so `ON DELETE CASCADE` in the schema is **not enforced**. Delete child rows explicitly inside the same transaction (see `src/method_function/DELETE/penjualan.ts`). Orphans are actively dangerous: SQLite reuses rowids after deletes (no AUTOINCREMENT), so an orphan child attaches to the next row with the same id and corrupts stock restores etc.
- **Schema exists three times** — `src/database/schema/{sqlite,mysql,postgresql}.ts`. Change all three for any table change, then `bun run drizzle:generate -- <name>` so all dialects get a migration.
- **Images**: base64 in a URL-encoded body → validate magic bytes (`check_image_type`) → `Bun.write` to `./barang_img` or `./profile_img` (dirs created in `prepare()`, `index.ts:227`) → DB stores path `/barang_img/{id}.{ext}`. Served by static branches in `src/server.ts`; dev proxy entry lives in `frontend/vite.config.ts`.

## Frontend notes

- Svelte 5 runes, Tailwind 4, own router store (`frontend/src/lib/stores/router.svelte`), `$lib` alias. Pages: `frontend/src/lib/routes/**`, mounted in `frontend/src/App.svelte`.
- Path → permission mapping and the login redirect chain live in `auth.svelte.ts`; route-level permission checks live in `App.svelte`. **A new page needs both:** a `<svelte:component>`/if-branch with `auth.can(Permissions.X)` in the `App.svelte` template *and* an entry in `getRequiredPermissionForPath()` — forget one and the page 404s or silently redirects.
- `.env`, `database/*.db`, `profile_img/`, `cert/` are gitignored — never commit them.
- New backend files (under `src/`, `index.ts`) start with the repo's license banner comment; frontend `.svelte` files do not use it.
