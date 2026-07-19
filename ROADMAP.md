# Westcoast Poké — Roadmap

_Food Cost Intelligence app. This file tracks parked work and the pre-launch checklist. Last updated: 19 Jul 2026._

---

## Pre-launch checklist (NOT V2 — do before go-live)

These are temporary testing values and final checks. They must be reverted/confirmed before production.

- [ ] **T1** — `DAILY_CAPS.discovery` → `1`/day (currently `10` for testing) — in `src/db.js`
- [ ] **T2** — `DISCOVERY_MAX_USES` → `2` (currently `6` for testing) — in `src/App.jsx`
- [ ] **T4** — `DAILY_CAPS.price_check` → `1`/day (currently `10`). Note: `price_check` is now unused after the actuals-vs-live rework — safe to tidy/remove entirely.
- [ ] **preferred_refresh cap** — set final launch value (likely `1`/day) in `DAILY_CAPS`, `src/db.js`. This now powers the dashboard "Refresh live prices".
- [ ] **T6** — `MODEL` → decide final model before go-live (currently `claude-haiku-4-5-20251001` for MVP cost testing; was `claude-sonnet-4-6`) — in `src/App.jsx` line 14. Single constant drives all 6 AI call sites. Watch **scan accuracy** (misread prices silently corrupt data) and **Insights reasoning** during the Haiku trial; revert wholesale, or carve those two back to Sonnet, if either degrades.
- [ ] **T6a — Insights fallback** — if Haiku underperforms on the **Insights** feature specifically (weak/vague insights, poor focus-bowl reasoning), revert **Insights back to Sonnet 4.6** even if Haiku is kept elsewhere. NB: selective revert needs a second model reference — introduce e.g. `INSIGHTS_MODEL` and use it on the insights call (`src/App.jsx` ~line 412) — because today the one `MODEL` constant can't be split per-endpoint.
- [ ] **T5** — Validate live pricing from a **Canadian IP**. UK testing cannot confirm Canadian-retailer scraping. Covers: "Best price today" refresh + the market-overlay on ingredient trend charts.
- [ ] **T3** — Final RLS review across all Supabase tables before go-live. They currently look correctly locked (`for all to authenticated using(true) with check(true)`); just confirm.

---

## Near-term (paused during model testing)

Not V2 — imminent, only held while the Haiku cost trial runs.

### Fan-out cap on "Refresh live prices"
Limit the refresh to the **top 3 preferred suppliers**, ranked by receipt spend, intersected with the ticked (price-checkable) ingredients — in `refreshPreferred`, `src/App.jsx`.

**Why:** the refresh loops one web-search call **per** preferred supplier (`max_uses:2` each), so N suppliers = up to 2N searches per press. The daily cap gates the button to 1/day but does **not** bound the fan-out. Each web search also drags ~10–14k tokens of page content back as billed **input** (~$0.04–0.05/search all-in, blowback + $0.01 fee), so an uncapped refresh over many suppliers is the dominant cost — e.g. 197 searches on 18 Jul ≈ $10.89 that day. Capping to 3 suppliers bounds both the search fee and the input blowback.

---

## V2 — Committed parks

Explicitly deferred during development.

### 1. Floating AI chat bubble
Global, collapsible chat accessible from every tab, so the user can ask about their data while scrolling any screen. Currently the "Ask a question about your data" chat lives inside the Insights tab only. Parked because it's a non-trivial lift: chat state must be lifted app-wide, plus mobile positioning and persistence work.

### 2. Sub-recipe / "made from" costing  ⭐ highest-value
Decompose prepared items (Crab Salad, Kimchi Cucumber, house sauces, etc.) into their raw components with quantities, so their cost is calculated from real ingredient prices instead of a static recipe estimate. This is what makes prepared-item costs truly accurate. Referenced by the "estimated cost" narrative already shown in the Ingredients tab, and by the price-check tickbox (prepared items are excluded from live checks precisely because they aren't bought raw).

---

## V2 — Strong follow-ons (implied by current build, not yet scoped)

### 3. Actuals "cheapest supplier" view
"Best price today" is now live-market-only (preferred suppliers). Consider a separate, clearly-labelled "cheapest you've actually paid" view, since that actuals view was removed from the dashboard in the rework. Decide if wanted.

### 4. Duplicate review / merge surface
A place to see and merge the rare duplicate discovered-suppliers or receipts that slip past the normalizer, rather than trusting dedup silently.

### 5. Bulk ingredient tick management
"Tick/untick all raw" or category-level toggles for the price-check tickbox, if per-row management gets tedious as the catalogue grows.

---

## V2 — Earlier parks (from prior sessions — re-confirm still wanted)

### 6. POS integration
### 7. Scheduled / automated price sweeps
Currently all AI/web calls are on-demand only (no background jobs). This would add scheduled sweeps.
### 8. Staff permission tiers
### 9. Custom domain
### 10. 30 / 90-day trend windows on charts
### 11. Full backup / data export
### 12. Per-drink bought-in cost UI

---

## Notes
- Working rhythm: discuss → propose → approve onto list → **build** → compile-check → stage → user commits. One consolidated commit per session.
- All AI/web calls are on-demand only; no background jobs.
- Actuals (receipts) drive all cost/margin/trend maths. Live market prices are advisory only and never blended into actuals.
- **Cost model (derived from July usage):** Sonnet 4.6 = $3/$15 per M in/out; Haiku 4.5 = $1/$5 (⅓ the price). Web search = $0.01/search, but the real cost is the ~10–14k input tokens of page content each search feeds back into context. Web-search endpoints are the whole bill — scans/chat are pennies. Levers, in order: (1) cap fan-out, (2) revert `max_uses` to 1, (3) Haiku on search endpoints cuts the input blowback ⅔. Prompt caching does **not** help search (results differ every call) — only the repeated chat data-summary, which is negligible.
