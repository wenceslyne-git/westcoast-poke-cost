# Change list

Items 6, 6b, 7, 9, 10, 11, 12: BUILT 2026-07-20 (local only, not committed). Awaiting user visual test behind login.
Build notes / deviations:
- Item 6 uses the existing Anthropic web-search endpoint instead of SerpAPI (no SerpAPI key or backend exists; same billing path as the rest of the app). Scheduled 15th/month-end samples surface as a "Market sample due" banner and run only after the user confirms + 10s countdown — the app is client-side only, so nothing can run unattended, and silent spend was ruled out anyway.
- Insights chat Send has no delay (deliberate typed action, not an accidental-press risk).
- Search-term field lives in the expanded row of priced ingredients (Menu → Ingredients).

## 6. Market price tracking (V1)
- Opt-in per-ingredient market tracking; all ingredients default to UNTICKED.
- Per-ingredient `search_term` + pack size field (e.g. "Kikkoman soy sauce 1L") so lookups are deterministic.
- SerpAPI price lookups on the 15th and last day of each month, per location postal code; store both raw samples, display the monthly average.
- Dashboard trend chart: average market price vs actual price paid (from receipts) per tracked ingredient.
- Location postal codes hardcoded: 463 W 8th Ave, Vancouver, BC V5Y 3Z5; 11666 Steveston Hwy #3030, Richmond, BC V7A 5J3.

## 6b. Free "buy it today" Google search (V1)
- Ingredient dropdown (reuses item 6's search term + pack size) + location picker → opens Google in a new tab with a pre-built query (e.g. "best price today Kikkoman soy sauce 1L near V5Y 3Z5").
- No API, no cost, nothing stored — results live in the Google tab.

## 7. Volatility insights (V1)
- Variance check on receipt prices (no API cost): flag ingredients whose paid price swings past a threshold (~10–15% between recent purchases or high variance over ~3 months).
- Surface as an insight card recommending market tracking, with one-click enable (tracking never auto-enables).

## 9. Cancellable API actions — 10s grace delay (V1)
- Every button that triggers a paid API call (analyse, market lookup, etc.) flips to a "working" state with a visible ✕ cancel.
- Pre-send grace delay (nothing leaves the browser during it, so cancelling in that window costs $0):
  - 10 seconds for any action that fires web search or SerpAPI calls (pre-send is the only free cancel there).
  - 3 seconds for plain Claude analyse/chat calls (pennies; mid-flight abort still saves output tokens).
- Scheduled 15th/month-end market lookups run automatically (no button, no delay) — controlled by the per-ingredient opt-in ticks.
- After send: AbortController cancels the request; streamed Claude calls abort early (partial cost), SerpAPI calls are already billed (UI still resets cleanly).
- No half-written data saved on cancel.
- Document this behaviour in the playbook/onboarding doc (doc doesn't exist yet — create it as part of this item).
- V2 (parked): tune delays if they feel sluggish.

## 10. Compact desktop density pass — all six tabs (V1)
- Desktop-width only (`isDesktop`); mobile unchanged.
- Shared rules: stat/summary cards → dense strip style (11px label, 18px number, one row); card padding ~24px → 12–14px; body text 13px; section gaps halved; long explainer paragraphs collapse to 2 lines with a "more" toggle.
- Dashboard: hero + 2026 target merged into one slim strip (thin progress bar, pace note inline); YTD tiles → one dense strip with per-location split on hover; cards in 2-col grid.
- Sales: Total/Food cost/Profit cards → one strip so table + chart fit the first screen.
- Menu: denser bowl cards, more columns, inline cost/margin figures.
- Suppliers: bordered list rows instead of cards.
- Insights: headline banner → normal alert card; insight cards two-up with 2-line collapse; slimmer ask box.
- Scan: inherits tighter padding only.

## 11. Confirm-before-refresh + control separation (V1)
- Any analyse/regenerate/refresh button: first click fires NOTHING — shows "Last updated <date, time>" with Refresh now / Cancel. Confirming starts item 9's 3s/10s cancellable countdown.
- Move the dark/light toggle away from action buttons (next to Sign out); give Regenerate a distinct accent + icon so the two stop reading as siblings (root cause of accidental presses).

## 12. Sales tab row reorder (V1, row 5 stub for V2)
- Row 1: monthly summary strip (per item 10).
- Row 2: Menu cost analysis (moved up).
- Row 3: Bowl COGS vs Sales trend + Top 3 sellers · net profit, side by side.
- Row 4: Units sold per bowl, full width (measures all bowls once populated).
- Row 5: Top 5 add-ons — placeholder/stub now; populates in V2 with detailed POS output integration.

## 8. In-app "buy it today" search (V2 — parked)
- In-dashboard version of 6b: pull search results/prices into the app via API instead of opening Google.
- User-facing note that the feature is experimental and may be deprecated unless users value it enough to pay for usage.
- BYO API key billing: users enter their own Anthropic API key (and possibly SerpAPI key) in settings, stored server-side; usage billed to their own account with their own spend caps.

## 5. Dashboard simplification + annual target (built 2026-07-20, uncommitted)
- Removed the monthly KPI card row (monthly detail lives in the Sales tab).
- YTD row promoted to hero-size cards (was small tiles), location splits kept.
- New "<year> target" card above the YTD row: owner enters annual sales target
  (stored via saveSetting key `target_<year>` in the existing Supabase settings
  table); progress bar of YTD sales vs target with an even-pace day-of-year
  marker and ahead/behind-pace readout. Editable inline. Target/progress always
  covers both locations combined.
- YTD cards now respect the location selector (single-location values when
  L1/L2 selected; split line shown only on All Locations).

All 3 items below: approved and BUILT 2026-07-20 (local only, not committed/pushed). Awaiting user visual test behind login.

## 1. Dashboard: year-to-date strip
- Keep current monthly KPI row as the hero, add a "This month · <Mon YYYY>" section label above it.
- Below it, a compact "Year to date · <YYYY>" row of 4 smaller tiles: YTD sales, YTD food cost ($ + %), YTD gross profit, YTD other revenue.
- Each tile shows the yearly total plus a one-line per-location split (real location names).
- YTD food cost % computed only over months that have bowl counts; footnote "based on N of M months with bowl data".

## 2. Dashboard: quick-win card treatment
- "Best price today" and "What to push" keep their placement.
- Add: "Quick win" badge, larger bold title with icon, one-line payoff subtitle ("Save on your next order" / "Today's highest-margin bowl"), accent border so they stand out from stat tiles.
- No animation/heavy styling.

## 4. Persist UI state across reloads (built 2026-07-20)
- Active tab, location filter (All/L1/L2), and dark/light mode saved to localStorage (`wp_tab`, `wp_loc`, `wp_dark`) and restored on load; invalid/missing values fall back to defaults.

## 3. Sales tab: default to last month
- Sales tab opens on the previous calendar month (historical analysis view) instead of the current one.
- Fallback: if last month has no data, open the most recent month that has data.
- Dashboard "latest month" logic unchanged.
