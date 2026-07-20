# Status

## Done
- **Template simplified to $ totals for sides/drinks (2026-07-20):** Supersedes the earlier per-item add-on rows (removed — user's Lightspeed POS sells add-ons as generic "Topping Add On"/"Add Protein" buttons, so per-ingredient counts were unfillable). Template = bowls with S/M/L counts + two "Totals" rows (Sides — total $ sold, Drinks — total $ sold, One-size column). Parser stores them in `mix.totals={sidesRevenue,drinksRevenue}` per location (money parser accepts $/commas); old per-unit months still work (`legacyPerItemUnits`). `buildDataSummary` extras now reports sides $, drinks $, and `impliedAddOnsAndFees` = other revenue − sides − drinks (all labeled indicative); insights prompt asks for one revenue-mix insight. Dashed "Upload POS report · V2" placeholder button added next to Upload counts (shows a coming-soon toast). `.claude/launch.json` now has `autoPort: true`. All in src/App.jsx; compiles, app boots clean. User confirmed 2026-07-20: template download + upload both work. NOT committed yet.
- **Supabase menu_items schema fixed (2026-07-20):** Table was missing `sizes` and `category` columns — this is why the template only showed 7 bowls and why the Resync button silently failed (`resyncMenu` never checks the supabase-js error; upsert with onConflict also needs a unique constraint on `name`). `add-missing-menu-items.sql` (repo root, not committed) adds both columns + inserts the 27 seed items guarded by `where not exists`. User has NOT yet confirmed running the final version. Follow-ups approved-in-principle but not built: surface errors in resyncMenu/seedIfEmpty; unique constraint on menu_items.name.
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

- **Committed & pushed (2026-07-20):** All 4 changes pushed to main (e8e0692) — Vercel redeploys from it. GitHub auth now works from this Mac: gh CLI at ~/.local/bin/gh, logged in as wenceslyne-git, git credential helper configured. .gitignore added (node_modules was previously unignored).

- **Dashboard simplification + annual target (2026-07-20):** Monthly KPI row removed; YTD cards promoted to hero size; new year-target card (inline entry, saved to settings key `target_<year>`) with progress bar + even-pace marker + ahead/behind readout. src/App.jsx. Also: YTD cards now respect the location selector (splits only on All). Committed & pushed 2026-07-20 (second batch); not yet visually verified by user.

## Next
- ~~Known issue: bowl count in One-size silently ignored~~ Fixed 2026-07-20: parser now warns per row ("X has a value in One-size — bowls use S/M/L, so it was ignored") whenever a bowl row has a nonzero One-size value; zero-fills stay silent. Value is still ignored (not imported). Untested by user.
- 2026-07-20 dashboard batches (both) deployed and user-verified. Nothing in flight.
- Reminder for user: July 2026 still has no bowl counts entered, so food cost/profit read $0 until the July mix is uploaded on the Sales tab. (YTD strip, quick-win cards, Sales default month, UI state persistence).
- Untracked, deliberately not committed: add-missing-menu-items.sql (Supabase SQL runs in dashboard per standing rule), package-lock.json (recommend committing to pin deps for Vercel — needs user OK).
- Open question for user: July 2026 sales has a $210 total but no bowl counts entered, so food cost/gross profit show $0 — they need to enter July's bowl mix on the Sales tab.
