# Security Sweep Log — Westcoast Poké

Running record of security sweeps. Cadence: **monthly** (on-demand, per SECURITY.md §7 — no automation by design).
Each entry: what was tested, result, actions taken. Newest first.

| Swept | Next due | Result |
|-------|----------|--------|
| 2026-07-21 | 2026-08-21 | ✅ Locked — 1 housekeeping fix |

---

## 2026-07-21 — full sweep (prod / dev / demo)

**Verdict: locked down.** Live-tested the public API, not just static source.

**Secrets (client-side)**
- Prod `dist/`: no source maps, zero hits for `sk-ant` / `service_role` / API-key / JWT patterns.
- Demo `dist/`: clean (only `.map` files were inside `node_modules`, never served).
- `src/`: no direct `api.anthropic.com` calls, no key literals. Only public value is the Supabase publishable key (safe — RLS backs it).
- No `.env` tracked or present; `.gitignore` covers `.env*`, `dist/`, `node_modules/`.

**Edge Function (anthropic-proxy)**
- Verifies caller JWT + server-side owner allow-list; API key stays in `Deno.env`.
- Live test, no auth → `HTTP 403 {"error":"Not authorized"}`. ✅

**Database RLS (live-tested, all 10 tables)**
- Anon reads (`alerts, discovered_suppliers, ingredient_prices, market_checks, menu_items, receipts, sales, settings, suppliers, usage_log`): all `[]` / `content-range: */0`. `menu_items` has seed data, so `[]` = RLS blocking. ✅
- Anon `INSERT` on `menu_items` → `HTTP 401`, `new row violates row-level security policy`. ✅

**Finding + fix**
- 🟡 `supabase/.temp/` (CLI cache, holds DB pooler connection string — no password, project-ref already public) was untracked but not gitignored. **Fixed:** added `supabase/.temp/` to `.gitignore`.

**Not machine-checkable — review manually (unchanged since last):**
- 2FA on Supabase / GitHub / Vercel / Anthropic.
- Anthropic monthly spend cap set.
- Temporary/demo access still needed?

---

## How to run a sweep

1. `./security-check.sh` — static checks (bundle secrets, git hygiene, npm audit).
2. Build fresh (`npx vite build`) in prod **and** demo, then grep both `dist/` for secrets.
3. Live-test RLS: anon `GET` + `POST` against each table via the REST API with the publishable key — reads must return `[]`, writes must be rejected.
4. Live-test the Edge Function with no auth → expect `403`.
5. Manual items above.
6. Add a dated entry here and update the cadence table's **Next due**.
