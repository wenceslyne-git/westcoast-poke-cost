# Change list

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
