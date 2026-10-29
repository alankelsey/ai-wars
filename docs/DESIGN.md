# AI WARS! — v1 design (resolves gaps in Market_mock.md)

Where this file and Market_mock.md differ, this file wins. All numbers live in `src/game/data/` so the
balance pass can change them without touching logic.

## Setup (new game)
- Player picks a company from the 14 company names. Optional checkbox: "Loan interest" (off by default).
- 6 of the 10 cities are picked at random and are fixed for the game. Player starts in a random one of them.
- 12 of the 13 chips are picked at random and are fixed for the game.
- Cash $5,500. Debt $5,500. Day 1.
- Every game has a numeric seed; all randomness comes from a seeded RNG (mulberry32) so a seed replays a game.

### Data fixes
- Chips (13): Buckwell, Flopster, Extinct, FakeASIC, Vera Ruine, Ironwoodworm, Drainium, Onchip,
  LowPerformanceUnit, Descend, FauxFoundry, ForgetfulMemory, Shreds.
  (Brain tech / Camelcon / outflame were company names pasted into the chip list; removed.)
- Cities (10): Santa Clara, California, USA · Hsinchu, Taiwan · Mountain View, California, USA ·
  Sunnyvale, California, USA · Seattle, Washington, USA · Suwon, South Korea · Hokkaido, Japan ·
  Shenzhen, China · Shanghai, China · Beijing, China. Buttons show the short name (text before the first comma).
- Companies (14): as listed in Market_mock.md.

## Units, prices and stock
- Chips trade in whole **pallets**. Prices are per pallet, integer dollars.
- Each chip has a price band `[min, max]` in three tiers so some are always affordable:
  - budget: roughly $15–$600 (4 chips), mid: $500–$6,000 (5 chips), premium: $4,000–$40,000 (4 chips).
- Each (city, chip) pair gets a fixed bias in [0.8, 1.2] at game start: some cities are cheap for some chips.
- On every arrival, each chip's price = round(uniform(min, max) × cityBias × permanentModifier[chip]),
  clamped to at least $1. Prices do not change while the player stays (buy/sell don't move the market).
- On every arrival, each chip's available stock = random integer 1–100 pallets. Buying reduces it.
  Selling is unlimited (the market absorbs anything).
- There is no inventory capacity limit in v1.

## Turns and days
- Day starts at 1. Travelling to a *different* city is the only action that advances the day (+1).
  The current city's button is disabled.
- On arrival: roll prices and stock, then roll at most one event (see below), then show its dialog if any.
- On day 30 (Normal difficulty only; Hard and Brutal give no warning) a banner warns: "Last day before the IPO — unsold chips are worth nothing." There is no
  automatic sell-off.
- Travelling from day 30 ends the game (this is "turn 31"). No event, no new prices — straight to the end screen.

## Loan interest (opt-in)
- `LOAN_APR = 0.12` (12% — a typical current personal-loan APR; constant in data).
- If enabled, debt grows each day by compounding daily: `debt = ceil(debt × (1 + APR/365))`.
- Shown above the market as "Debt $X". With interest off, debt stays $5,500.
- Note for balance: 12% APR over 30 days is only ~1% (≈$54). It is flavour, not pressure. The backlog loan
  (below) is where interest bites.

## Events (rolled once per arrival)
Roll order: 15% chance of a bad event, else 10% chance of a good event, else nothing.
Events that need inventory are skipped (re-rolled among the others) when the player holds no chips.
All percentage losses use `Math.ceil` on the amount lost ("round up").

Bad:
1. **Pallets go missing** in transit — lose ceil(10–50%) of one random held chip's pallets.
2. **Competitor 10× VRAM launch** — one random chip's permanentModifier ×= uniform(0.3, 0.6) for the rest of
   the game (applies to this arrival's prices too).
3. **50× quantization breakthrough** — local LLMs eat demand: every chip's permanentModifier ×= uniform(0.8, 0.9).
4. **Sanctioned by the local government** — one random chip cannot be bought in this city this visit, and a fine
   of ceil(cash × uniform(0.0001, 0.06)) — the spec's 0.01%–6% rule.
5. **Customs shakedown** — fine of ceil(cash × uniform(0.0001, 0.06)).

Good:
6. **Fell off a truck** — gain 1–5 pallets of a random chip (any chip in the game).
7. **Hype spike** — one chip's price in this city ×uniform(2, 4) this visit (great place to sell).
8. **Fire sale** — one chip's price in this city ×uniform(0.25, 0.5) this visit.

Each event has a message template, e.g. "Oh no! 7 pallets of Drainium vanished at customs."
Cash never goes below 0; inventory never below 0.

## End of game (on leaving day 30)
- `profit = cash − debt`.
- profit > 0: "Congrats, you are the alpha AI tech bro/bae and generated a profit of $<profit> for <company>.
  The first ever profitable AI company!"
- profit = 0: "You payed your loan off. Yay, no cement shoes! Unfortunately you will live a life of mockery for
  your poor decisions and bad luck."
- profit < 0: "You didn't pay your loan in time. It's not that you lost everything, it's not that you have
  nothing to show for your efforts, it's more coming to terms with not being able to itch your feet in cement shoes!"
- End screen also shows final cash, the high-score table, Start New Game and share links (placeholders).

## High scores
- Stored in `localStorage` key `aiwars.highscores.v1`: top 10 by final cash, each `{company, cash, profit, date}`.
- Read/write wrapped in try/catch; the game works with storage blocked.

## Screens
1. **Splash**: "AI WARS!" in pixel-art text, story hook ("You are an AI tech bro/bae at <company> trying to outfit your
   datacenters. You have $5,500 and 30 days to turn a profit before your IPO."), company picker + interest
   checkbox, Start New Game button, placeholder links (GitHub, X, Bluesky).
2. **Game**: header line `Day N/30 · <City> · Cash $X · Debt $Y`. Split pane:
   left = market (chip, price, stock, qty stepper ▲▼ + "max", Buy), right = your racks (chip, pallets held,
   current local price, qty stepper, Sell). Bottom bar = 5 travel buttons + current city (disabled);
   when an event fires the bottom bar is replaced by the event dialog with an OK button.
3. **End**: message, final numbers, high scores, Start New Game, share links.

Style: black background, green (#33ff33-ish) monospace, CRT feel; keyboard usable; works at 360 px wide
(panes stack on narrow screens).

## v1.1 additions (data center, net worth, tips, uptime)

### Average cost
- Each chip tracks the average price paid per pallet (`avgCost`). Buying q at price p:
  `avg = (avg × held + p × q) / (held + q)` (kept as a float; shown rounded). Selling never changes it.
- "Fell off a truck" pallets count as bought at $0 (they lower the average). When holdings reach 0, avg resets to 0.
- Shown under the chip's current price when you hold it.

### Data center (the bank)
- A second balance, `dataCenter`, start $0. Deposit/withdraw whole dollars from any city.
- It also stores chips (`dataCenterChips`, pallets per chip). Stored chips can't be sold; retrieve them first.
- **One data-center transaction per day** in total: cash or chips, deposit or withdrawal; travelling resets it.
- Risks never touch it: fines and token resets only take pocket cash, missing pallets only take on-hand chips. No interest.
- Chips (on hand or stored) are worth nothing until sold; only data center *cash* counts toward net worth.
- A chip's average cost covers all owned pallets, on hand and stored.

### Net worth
- `netWorth = cash + dataCenter − debt`. Can be negative (shown red) even with cash in hand.
- The final profit and the high-score "cash" use the same total (cash + data center). Unsold chips are worth $0.
- Held chips are deliberately left out, also during play: they only count once sold, because the market can crash
  and unsold chips are worthless at the IPO. A big negative net worth right after buying is intended — don't "fix" it.

### Market tips
- On every arrival (day 1 included), 35% chance of one tip: a random chip is cheap (price ×uniform(0.35, 0.6)) or at a
  premium (×uniform(1.8, 3)) in this city this visit, with a flavour message, e.g.
  "Hsinchu's fab overproduced Onchip — cheap Onchip everywhere!". Tips are dismissible banners, not dialogs.

### Uptime (replaces health)
- Uptime starts at 100%. On every arrival after the event roll, 12% chance of an uptime risk — **unless a bad event
  already fired that arrival (at most one risk per turn: money/market or uptime, never both)**. Good events can
  still be followed by an uptime risk:
  1. **GPU cluster meltdown** 2. **Ransomware attack** 3. **Viral launch traffic surge**.
  Each threatens a downtime of uniform int 15–35 percentage points.
- The risk dialog offers: **Give customers token resets** — costs ceil(3% of cash), 50% chance to avoid the downtime;
  at most 2 tries — or **Take the downtime**. If both tries fail, the downtime hits. Risks never cost money otherwise.
- While a risk is open you can't trade, bank or travel.
- Uptime 0% ends the game immediately: "Your service has become unreachable. Customers fled, the IPO is off, and
  the loan shark has come to collect — enjoy your new cement shoes!"

## Backlog (not v1)
- After game over, take a new loan and keep playing: higher APR, 25-day term.
- Inventory capacity / rack upgrades, sound effects, money count-up animation, price history.
- **Plan a landing page.** Several game mocks are coming to test, so the Pages site root
  (https://alankelsey.github.io/ai-wars/) should become a landing page that links to each mock, and the
  current game should move to its own path. Needs a plan first: URL layout per mock, how each mock builds into
  one Pages artifact, shared vs per-mock high scores (localStorage keys), and how players report feedback.

## Hosting
- GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main` (lint, typecheck, tests, then build).
- Built with `BASE_PATH=/ai-wars`; local dev and plain `npm run build` have no base path.
