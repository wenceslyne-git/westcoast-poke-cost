# Status

## Done
- **Add-ons in sales template + AI insights (2026-07-20):** The Excel product-mix template now includes an "Add-on" row for every priced add-on from `CATALOG` (`addon: true`, `addonPrice > 0`) after the sides/drinks — no parser change needed, counts land in `mix.other`. `buildDataSummary` now splits extras into sides / drinks / addOns, computes estimated add-on revenue (units × addonPrice), attach rate per 100 bowls, and passes the latest receipt cost per add-on ingredient; insights prompt asks for one add-on attach-rate insight, with add-on figures always labeled estimates and never folded into total sales. All in `src/App.jsx`. Not yet user-tested (needs a template download → fill → upload → insights run).
- **2026-07-20:** Dark-mode fix — "GENERATED ..." label in the AI Insights headline banner was hardcoded white and invisible in dark mode; now uses `T.bg` at 55% opacity (src/App.jsx, Insights component).
- **2026-07-20:** AI Insights now persist across reloads via localStorage key `wp_insights` (insights + generatedAt). Only overwritten when the user clicks Generate/Regenerate. Banner shows the stored generation date. Not yet pushed to GitHub/Vercel — local only.
- **CL-3 (fixed 2026-07-19):** Ingredient tickboxes (plus custom-ingredients-without-price and size mix) weren't persisting because the `settings` table was missing from Supabase. Fixed by creating the table directly in Supabase SQL Editor (`key text primary key`, `value jsonb`, RLS with authenticated all-access policy). No app code changed — `saveSetting` in `src/db.js` works as-is. User confirmed fixed.

## Notes
- Repo cloned to `/Users/wenceslyne/Westcoast`, connected to `origin` (github.com/wenceslyne-git/westcoast-poke-cost). Push access not yet tested.
- Standing rule: Supabase schema changes run as SQL in the dashboard, not via GitHub uploads.
- Standing rule (see CLAUDE.md): discuss and get explicit approval before making any code changes or commits.

## Done (cont.)
- **CHANGELIST.md items built (2026-07-20):** (1) Dashboard YTD strip — 4 compact tiles under the monthly KPI row with per-location splits; food cost %/profit computed only over months with bowl counts, footnoted. (2) Quick-win treatment on "Best price today" / "What to push" cards — badge, bigger title, payoff subtitle, accent border. (3) Sales tab defaults to last month, falling back to most recent month with data. All in src/App.jsx. Compiles (esbuild check); NOT visually tested (app is behind owner login) and NOT committed — awaiting user test + commit approval.

- **UI state persistence (2026-07-20):** Active tab, location filter, and dark mode now persist across reloads via localStorage (`wp_tab`, `wp_loc`, `wp_dark`) in src/App.jsx. Compiles; not visually tested (behind login), not committed.

## Next
- User to visually test the 4 changes (YTD strip, quick-win cards, Sales default month, UI state persistence), then approve commit/push.
- Open question for user: July 2026 sales has a $210 total but no bowl counts entered, so food cost/gross profit show $0 — they need to enter July's bowl mix on the Sales tab.
