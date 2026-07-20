# Change list

## 29. Reactive hover on header + regenerate buttons (approved via mockup + BUILT 2026-07-20, NOT committed)
- Two new classes in the global style block: wpHovG (ghost/outline) — 2px lift, blueL fill, blue border+text, soft blue shadow; wpHovS (solid blue) — 2px lift, deepens to blueDark, stronger shadow. 0.16s ease, :not(:disabled), colours via --wpBlue/--wpBlueL/--wpBlueDark CSS vars set on the app root so dark mode follows the theme.
- Applied to: Scan receipt (S), Help (G), Sign out (G), dark-mode toggle (G), unselected header location pills (G), "⟳ Refresh live prices" (S), "✦ Regenerate" insights button (S).

## 28. Header: Help button (mailto) (approved + BUILT 2026-07-20, NOT committed)
- "Help" pill button in the header, left of "Sign out", same style (border pill, ? icon, icon-only on mobile with "Email support" tooltip).
- Opens mailto:wenceslyne@elitelvlservices.com with subject "Westcoast Poke Support Request" and a pre-filled body ("Question about:" + the logged-in user's email) so the sender is identifiable.
- 28a (approved + BUILT 2026-07-20): button swapped to a real <a href="mailto:..."> styled identically (textDecoration none, same pill/hover/tooltip) so right-click offers the browser-native "Copy email address"; left-click redirect unchanged. Context: desktop Chrome without a registered mail handler silently drops mailto — worked on mobile; user advised on chrome://settings/handlers / default mail app.
- V2 (parked, see ROADMAP): in-app AI help chat via Edge Function + Claude API, with summarized transcripts, needs-action flags, and an owner inbox.

## 27. Target card: minimal fading gauge (approved + BUILT 2026-07-20, NOT committed)
- Size fix (approved): dial capped at 210px tall (was 420 — ballooned in the equal-height row); still centres in taller views with breathing room.
- Year-target grand celebration: stored celebrated_<year> flag REMOVED (user decision) — now replays on every below->above crossing in-session (saves, edits, target changes); never fires on plain page load.
- Post-test fixes (approved): readout line restored under the header ("$YTD of $target · year to date · ahead/behind pace by $X"); gauge vertically centred AND scales with card height (flex + svg height 100%, max 420px) so Month/Quarter/Year explorer heights all look balanced; legend stays pinned at the bottom.
- Item 21 tint softened to 75% opacity (blueL+BF) so the approved down-month fish (which swims BEHIND the narrative) shows through again — fish itself untouched.
Replaces the item 22 dial. Final agreed design:
- One continuous half-donut, radius widened to span the card (~98 in a 260-wide viewBox), stroke 30, rounded ends; single colour (the card's pace tint colour) fading Excel-style from solid at $0 to near-transparent at the target end (seamless linear gradient, no segments, no lines).
- Green needle #5CB85F: needle + hub drawn as ONE flat shape with a single shared opacity (~0.85) — even colour throughout, no darker hub overlap. Points at YTD share of target.
- Yellow pace dot #F5B93E, diameter = arc thickness (solid fill), white ring OUTSIDE it; sits on the arc at today's even-pace position.
- Centre: ONLY the big % (sales so far as % of target). All other text removed from the dial ($0/$target labels, to-go line, behind-pace row all gone).
- Legend row below a divider: "● Green needle — Sales so far | ● Yellow dot — Where you should be today".
- Hover tooltips (native SVG <title>): centre % "Sales so far: $YTD = N% of your <year> target" · needle "Sales so far — $YTD year to date" · arc "Your <year> target: $T · $X still to go" · dot "Where you should be today at even pace: $P — you're $X behind/ahead".
- Header stays "2026 target" + Edit target only. Card pace tint (item 22) unchanged. Past 100%: needle pins at full, dot hidden, centre may read "×N.N".


## 26. Data health donut (approved via mockups + BUILT 2026-07-20, NOT committed)
- HealthRing replaced: 3 concentric floating arcs (no tracks, no pad, no card border), stroke 11, white gaps, 128px desktop / 104px mobile, sized to match the legend height.
- Rings (vivid off-brand colours): outer red #FF3B30 = month entered (sales 50% + counts 50%) · mid green #34C759 = cost freshness (proportional, full at 80%) · inner blue #007AFF = market samples run.
- Legend right of the donut: "DATA HEALTH · score" header, one dot-row per ring with its status (checkmark / sales-counts split / %/due), existing hint line below. Scoring logic unchanged; supersedes the item 25 single-ring recolour.

## 25. Small polish round (approved + BUILT 2026-07-20, NOT committed)
- Location comparison speaks plain English: subtitle "How much of every bowl dollar goes to ingredients · target 30¢"; per-location line "N¢ of every $1 goes to ingredients — X¢ over target / on target ✓" (replaces "Δ +Npts vs target"); over 100% shows a data-sanity flag "Ingredients cost more than these bowls earned — check counts vs sales"; insight line reworded without pts/COGS jargon.
- Data health ring: vivid off-brand traffic scale (#FF3B30 red <50 · #FF9500 orange <80 · #34C759 green 80+), number matches ring colour, stroke thickened 6->7. Scoring logic unchanged.
- Sales header: "+ Enter monthly sales" (primary) now LEFT of "Edit month".

## 24. Global: hover lift on all boxes (approved + BUILT 2026-07-20, NOT committed)
- Every card/tile/tinted box (dashboard stats, quick wins, action cards, Insights headline/ask/focus/insight cards, Sales explorer + target + charts, supplier/menu cards) gets a hover lift: 3px rise + soft shadow, 0.18s ease. Pure CSS class wpLift, no layout shift.

## 23. Sales: month explorer + target card side by side (approved + BUILT 2026-07-20, NOT committed)
- Month explorer (Month/Quarter/Year card) LEFT · 2026 target card RIGHT, in a repeat(2, minmax(0,1fr)) desktop grid, equal height, splitting at the same line as the Bowl COGS / Top 3 sellers cards. Stacked on mobile.
- Title line ("Your numbers, straight up" + narrative) untouched above.
- Menu cost analysis card stays full width in its current position between this row and the charts row — nothing removed or reordered around the pair.
- Explorer slims to fit half width: toggle + month nav + food-cost chip + CSV chip on one wrapping header line; 3 compact stat tiles ("Food cost"/"Gross profit" labels, "Bowl" dropped); location rows unchanged.
- Target card uses the item 22 compact/tinted design.

## 22. Sales: annual target card rework (approved + BUILT 2026-07-20, NOT committed)
- Compact layout: title + trophy, big YTD figure, "of $target · % · ahead/behind pace by $X" readout and Edit target button all on one wrapping row; bar + two small labels below. ~half current height.
- Chart AS CURRENTLY BUILT (intermediate state): single-colour arc fading from solid at the needle position (gradient), dark tapered needle, black even-pace tick, % + "$X to go" in the bowl, $0/$target at the ends, behind/ahead-of-pace bottom row. SUPERSEDED by item 27's approved design (not yet built).
- Performance tint on the whole card: tealL ahead of pace · amberL behind · coralL when >20% behind pace; bar track white on tint; text in the matching dark ramp.

## 21. Sales narrative: resting tint after animation (approved + BUILT 2026-07-20, NOT committed)
- Sequence on load / narrative change: accent bar draws in → shimmer sweeps twice (item 17 behaviour unchanged) → then a borderless blueL tint fades in behind the narrative and stays permanently.
- Tint block: blueL background, no outline border, left accent bar kept, rounded right corners, text in the darker blue (blueDark).
- Down-month fish keeps swimming behind it, unaffected.

## 20. Insights page: paired + tinted top cards (approved + BUILT 2026-07-20, NOT committed)
- "Ask a question about your data" and "This month's focus" sit side by side on desktop in a repeat(2, minmax(0,1fr)) grid (stacked on mobile), equal height, splitting at the same point as the insight cards grid below.
- Ask a question card tinted blueL with faint blue border; headings in darker blues; input/chat bubbles stay on white so they read against the tint.
- Focus card tinted tealL with faint teal border (keeps its 4px teal accent bar); text in darker teals; ADVISORY tag on white.
- Content unchanged in both cards.
- Insight list defaults to List view instead of Cards (toggle unchanged).

## 19. Dashboard layout + accent polish (approved + BUILT 2026-07-20, NOT committed)
- Swap: "What to push" moves to the LEFT cell, "Location comparison" to the right (desktop grid; mobile stacking order follows).
- Action cards (bottom "ACTION" row): tinted background in each action's own light color (blueL scan / amberL pricing / coralL renegotiate), borderless (border removed after visual test); content unchanged.
- Top 4 "This month" stat cards: borderless flat tints (accent borders tried, then removed after visual test).
- Location comparison card: border in sales blue. Buy it today card: border in food-cost amber. (Best price blue + What to push teal already have theirs.)

## 18. AI refresh moves into the Insights page (approved + BUILT 2026-07-20, NOT committed)
- Also fixed in this pass: dark-mode nav tooltips were blank (white-on-white — tooltip text was hardcoded #fff on T.navy, which flips near-white in dark mode; now uses T.bg).
- Remove the blue AI-refresh circle from the header entirely (original accidental-press culprit; redundant with Insights' Regenerate).
- Insights nav icon keeps its coral stale-dot as the "new data" nudge.
- Insights page: when insights are stale, show a one-line hint near Regenerate — "your data has changed since these were generated" — preserving the context the header tooltip used to carry.

## 17. Narrative animation + sales form close (approved + BUILT 2026-07-20, NOT committed)
- 14b amendment (decided via mockups): Sales narrative line gets C's accent bar (draws in on load, stays permanently) + B's shimmer sweep (sheen crosses the text twice on load and whenever the narrative text changes, then rests — no perpetual motion).
- "Enter monthly sales" form gets an ✕ in its top-right corner (same style as the Edit month modal's ✕) that closes the form and clears unsaved parse state.

## 16. Notification bell in left nav (approved + BUILT 2026-07-20, NOT committed)
- Bell icon in the left nav with badge count of open "keep-up" items.
- Panel lists actionable nudges, each with a one-tap action: market sample due → Run sample (via confirm/countdown) · stale ingredient cost (item 15's 30-day check) → Scan receipt · bowl counts not uploaded for latest month → Go to Sales · price alert over threshold → Review.
- Banner treatment (recommended + approved): keep ONLY the amber sample-due banner (time-sensitive, twice monthly); price alerts and everything else move fully into the bell — no more stacked banners.
- Items self-clear when resolved (sample run, cost refreshed, counts uploaded); no manual mark-as-read.
- All computed frontend from loaded data — no backend, no API cost.

## 15. Gamified data health — score ring + streaks + celebrations (approved + BUILT 2026-07-20, NOT committed)
Goal: gamify data completeness (not time-in-app) — insights are only as good as the data fed in.
- Data health score: 0–100 ring on the dashboard, scored per month from: sales entered, bowl counts uploaded, ingredient costs FRESH (≥80% of recipe-used ingredients have a price entry within the last 30 days — ingredients not in any bowl ignored), both market samples run. Colour coral→amber→teal, with a one-line "what's missing to hit 100" hint.
- Staleness notice (amended 2026-07-20): no receipt-count quota — uploading isn't a "happy" target since it's money out; instead detect recipe-used ingredients with no cost recorded in the past 30 days (default, adjustable) and name them in the hint: "No cost recorded for X in 34 days — scan a recent invoice to refresh." Computed frontend from loaded data, no backend job. Per-ingredient threshold override = later, not v1.
- Streaks (stored in settings table): months-in-a-row sales entered, consecutive market samples, receipts this month. Shown in success toasts ("June sales entered — 6 months without a gap") and optionally in the sample-due banner ("don't break your 4-sample streak"). Never guilt-trip on broken streaks — show the new streak starting.
- Celebrations: pure-CSS micro-animations scaled by effort — full confetti for monthly sales entry and hitting 100, light sparkle + running counter on EVERY invoice upload (no quota — celebrate the habit, not the spend), quick check-pulse for samples. ~1–1.5s, no sound, never blocks UI.
- Added 2026-07-20 (amended): EVERY monthly sales save gets full-page confetti (~1.5–2s) — the habit is the win, celebrate it regardless of the numbers. Beating the previous month adds the comparison callout in the toast ("July saved · $3,400 — up 12% on June 📈"), same animation. Down months get an encouragement callout — always acknowledge the dip first, then the best TRUE silver lining, picked in order: margin held/improved → streak intact → still ahead of pace/last year → fallback "it's tracked, and tracked months are fixable months." Never fake positivity. DECIDED + BUILT (2026-07-20, superseded the full-screen leap): down-month animation = CHUBBY FISH weave — small cute fish (big eye, smile, brand colours) swims nose-first around/behind the Sales narrative line itself, no reserved lane, bubbles trail; encouragement toast with "Keep swimming." closer. Confetti stays for up/level months. Yearly target stays the grand tier: longer rain (~2.5–3s) + trophy banner, fires once via `celebrated_<year>` settings flag, target card wears 🏆 for the rest of the year.
- Deliberately excluded: points, levels, leaderboards, badge collections.

## 14. Headings pizzazz + dynamic Sales narrative (approved + BUILT 2026-07-20, NOT committed)
Visual direction approved via mockup.
- 14a: Tab headings get the dashboard treatment — short punchy line with one coloured italic word per tab (Sales "Your numbers, straight up." blue · Menu "Every bowl, costed." teal · Suppliers "Know who's cheapest." coral · Insights "What the data says." purple), small grey tab name beneath. Dashboard hero back up to ~32px desktop. Colours from existing theme palette.
- 14a: 2026 target card restored to hero style — "2026 *target*" accent heading, ~28–30px figure, ~11px progress bar with visible pace marker, pace line 13px bold.
- 14b: Rules-based (no API) dynamic one-liner under the Sales heading, always citing a real number; template picked by conditions: up vs last month / best month of year / down-but-margin-held / ahead of pace / behind-but-improving / no data yet. Encouraging but honest — no fake cheer on bad months.

## 13. Dashboard = act, Sales = review (approved + BUILT 2026-07-20)
- Annual target card moved from Dashboard to top of Sales tab (YTD strip removed entirely — redundant with Sales' month/quarter/year view).
- Dashboard now shows a current-month strip (sales, bowl food cost $ + %, bowl gross profit, other revenue) for the latest entered month, location-aware, splits on hover.
- Also: all side-by-side dashboard cards equal width/height, content fills the space (comparison rows spread, Buy-it-today controls pinned bottom); What to push limited to top 3.

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
