# Westcoast Poké — Playbook / onboarding

A quick guide to the app for owners and staff. Costs money = marked 💲.

## The golden rule on paid actions 💲
Some buttons call an AI or web-search API and cost real money (pennies each, but they add up).
Every one of them now follows the same safety flow:

1. **Confirm first** — clicking the button never fires anything. A small dialog shows
   *"Last updated <date, time> — Refresh now / Cancel"*. If the data is fresh, just Cancel.
2. **Countdown** — after confirming, a bar appears: *"…starting in Ns — ✕ Stop, costs $0"*.
   Nothing leaves the browser during the countdown, so stopping there is completely free.
   - **3 seconds** for plain AI calls (insights, receipt extraction).
   - **10 seconds** for anything that runs web searches (live prices, supplier discovery,
     market samples) — once those are sent they're billed, so the countdown is your only free out.
3. Accidental presses are harmless: the first click only opens the confirm dialog.

The theme (day/night) toggle now lives at the far right of the header, after Sign out,
so it can't be mistaken for the AI-refresh button (which is the blue-tinted circle).

## Market price tracking (opt-in) 💲
- Go to **Menu → Ingredients**. Every ingredient starts **unticked**. Tick only the ones
  worth watching — each tracked ingredient costs API calls twice a month.
- Open a tracked ingredient and set a **search term** with brand + pack size
  (e.g. "Kikkoman soy sauce 1L") — this makes market searches far more accurate.
- On the **15th** and the **last day of each month**, a blue banner appears:
  *"Market sample due"*. Click **Run sample** (goes through the confirm + 10s flow).
  It searches prices near each location's postal code (W 8th: V5Y 3Z5, Ironwood: V7A 5J3)
  and stores both raw samples. The ingredient's price chart then shows your **actual paid
  price vs the market trend**.
- Samples never overwrite your paid-price history — market data is advisory only.

## Volatility recommendations (free)
The dashboard watches your receipt prices. If an untracked ingredient's paid price swings
≥12% across recent purchases, an amber card appears recommending you track it — one click
enables tracking. Nothing is ever auto-enabled.

## "Buy it today" free search (free)
Ran out of something mid-service? On the dashboard, the **🛒 Buy it today** card:
pick the ingredient, pick the location, hit **Search Google ↗**. It opens a
"best price today near me" Google search in a new tab — zero cost, nothing stored.
An in-app version (results inside the dashboard) is planned for V2.

## Sales tab layout
Row 1: monthly summary strip · Row 2: Menu cost analysis · Row 3: Bowl COGS vs Sales
trend + Top 3 sellers side by side · Row 4: Units sold per bowl (all bowls) ·
Row 5: Top 5 add-ons (placeholder until the detailed POS report upload lands in V2).

## Everyday flows
- **Scan receipt** 💲 (~$0.02): header camera button → upload photo/PDF → confirm + 3s →
  review every line → Accept & save.
- **Monthly sales**: Sales → Enter monthly sales → type totals per location, download the
  Excel template, fill bowl counts from the POS report, upload.
- **AI insights** 💲: Insights tab → Generate/Regenerate (confirm + 3s). The chat box
  below is charged per question but sends immediately (typed questions are deliberate).
- **Live prices** 💲: dashboard "Best price today" → Refresh (confirm + 10s), sources only
  your ★ preferred suppliers over your tracked ingredients, 1 run/day.
