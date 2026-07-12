> **REPO NOTE (added 2026-07-12):** This is the ORIGINAL quant-engine spec that drove
> builds 23–44 — preserved verbatim below. It was a chat attachment during those
> sessions and is now archived in the repo as the canonical founding document.
> The engine code references it as "the doc" (e.g. "doc Phase 4", "doc 3D").
> Implementation status and everything built SINCE (Statcast priors, Savant
> percentiles, Shin de-vig + Pinnacle-weighted consensus, ump/weather/bullpen
> context, line-history archive) lives in ENGINE2.md. This project is 100%
> sports — no code or data source is shared with any stock/equity tool.

# PARLAY LAB — Build "The Sharp" Quantitative Betting Engine

You are the lead quant developer for Parlay Lab, an MLB betting analytics app. Your job is to design and build a professional-grade probabilistic betting engine that projects player props, moneylines, run lines, totals, and first-5-inning markets — then compares those projections against live sportsbook prices to surface only positive-expected-value opportunities.

Operate like a betting syndicate's engineering team, not a picks tout. The core principle of everything you build: **an edge only exists when our probability beats the market's de-vigged probability by more than our uncertainty.** The market consensus is the smartest baseline on earth — we anchor to it and only deviate when the model has demonstrated, out-of-sample, that its deviations are profitable. The measurable definition of "best handicapper in the world" is sustained positive Closing Line Value (CLV). That is our north star metric, above short-term ROI.

---

## STEP 0 — Audit before you build

Before writing any new code:

1. Read the entire existing Parlay Lab repo. Summarize the current architecture, stack, existing features (parlay odds calculator, void-leg repricing, any existing "The Sharp" prompt integration), and data sources already wired up (The Odds API key exists).
2. Propose an integration plan: what gets kept, what gets refactored, where the new engine modules live, and how the UI consumes engine output.
3. Present the plan and the phase roadmap below for approval BEFORE writing implementation code. Use plan mode for this.

---

## ARCHITECTURE OVERVIEW

Build a pipeline, not a monolith:

```
[Ingest] → [Feature Store] → [Projection Models] → [Game Simulator]
                                      ↓                    ↓
[Odds Snapshots] → [Market Layer: de-vig + consensus] → [Edge Engine]
                                                            ↓
                            [Parlay Engine (joint sims)] → [Bet Card + Kelly Sizing]
                                                            ↓
                                  [Bet Logger → Backtest / CLV / Calibration Reports]
                                                            ↓
                                  [The Sharp LLM layer: rationale + news flags only]
```

Suggested module layout (adapt to existing repo conventions):

```
/engine
  /ingest        # stats, odds, lineups, weather, park, umpire feeds
  /market        # odds math, de-vig, consensus, line shopping, snapshots
  /features      # rate estimation, matchup features, opportunity models
  /models        # per-market projection models
  /sim           # Monte Carlo game engine (the heart of the system)
  /edge          # blend, EV, thresholds, pick generation
  /parlay        # joint-probability parlay & SGP pricing
  /bankroll      # Kelly sizing, exposure caps, bet logging
  /backtest      # walk-forward evaluation, CLV, calibration
  /tests         # every math function unit-tested
```

Language: Python for the engine (pandas/numpy/scipy; scikit-learn or LightGBM where useful). Storage: SQLite to start (upgrade path to Postgres). Expose engine output as JSON so the existing Parlay Lab UI can render it.

---

## PHASE 1 — Data layer

Wire up free/cheap sources first. Every record gets an `as_of` timestamp — this is non-negotiable for backtesting integrity.

**Sources:**
- **MLB Stats API (statsapi)** — schedules, probable starters, confirmed lineups, box scores, play-by-play, player/team season & split stats. Free, official.
- **pybaseball** — Statcast (xBA, xwOBA, xSLG, barrel%, hard-hit%, EV, pitch-level data, pitch-type run values), FanGraphs (K%, BB%, wOBA, SIERA, xFIP, Stuff+ if available), Baseball-Reference logs.
- **The Odds API** (key exists) — multi-book lines for ML, spreads (run line), totals, and player props. Manage credits carefully: cache aggressively, snapshot on a schedule (e.g., morning open, post-lineup, and as close to first pitch as feasible for a "closing" snapshot). Store every snapshot — the odds timeline IS the CLV dataset.
- **Weather** — Open-Meteo (free): temp, wind speed/direction, humidity per ballpark at game time. Static table of park orientations to convert wind direction into out/in/cross.
- **Park factors** — static table (by handedness where possible: 1B/2B/3B/HR/R factors), refreshed periodically from Statcast park factors.
- **Umpires** — optional enhancement: home-plate ump K%/BB% tendencies from a static CSV or scrape. Mark as nice-to-have; degrade gracefully if absent.
- **Bullpen usage** — derive from recent game logs: reliever pitches thrown last 3 days → availability/fatigue flags.

**Schemas to design:** players, games, lineups (with slot), pitcher starts, statcast aggregates, odds_snapshots (book, market, line, price, timestamp), weather, park_factors, bets (our log), results/gradings.

**Deliverable:** a daily `ingest` job that populates today's slate end-to-end, plus a historical backfill script (target: at least the current season, ideally 2+ seasons for training/backtesting).

---

## PHASE 2 — Market layer (build this before any model)

All odds math must be exact and unit-tested:

- American ↔ decimal ↔ implied probability conversions.
- **De-vig** for two-way markets: multiplicative (normalize implied probs to sum to 1) as default; also implement the power method and compare — power/Shin handles favorite–longshot bias better on lopsided prices. For props, de-vig each Over/Under pair per book.
- **Consensus probability:** de-vig per book, then aggregate across books (median or weighted mean; make weighting configurable so sharper books can be up-weighted later).
- **Line shopping:** for any pick, report best available price across books, and the EV difference vs. worst price — this alone is a real, riskless edge and should be surfaced in the UI.
- **Snapshot discipline:** store open, current, and closing prices per market. CLV per bet = implied prob at close (de-vigged) minus implied prob at our bet price.

**Deliverable:** `market.consensus(game, market)` returns fair probability + per-book prices, fully tested against hand-computed fixtures.

---

## PHASE 3 — Projection models

### 3A. Rate estimation (shared foundation)
- Player skill rates (per-PA hit prob, K%, BB%, ISO, HR rate; pitcher K%, BB%, contact quality allowed) via **empirical-Bayes shrinkage**: blend recent (last 30 days), season, and prior-season rates with recency decay, shrunk toward league/handedness means. Small samples get pulled hard toward the prior — no chasing hot streaks.
- Use Statcast expected stats (xBA, xwOBA) to regress luck out of recent results: a hitter 12-for-25 with weak contact quality projects near his baseline, not his hot streak.
- Platoon splits estimated with shrinkage (splits are notoriously noisy — regress heavily, especially for hitters).
- **BvP (batter vs pitcher) discipline:** under 15 PA = ignore; 15–30 PA = tiny nudge; 30+ PA = modest weight. Never a primary driver. Encode this as a hard cap in the feature weighting.

### 3B. Matchup adjustment
Adjust per-PA rates for today's context: opposing starter's pitch mix vs. the batter's pitch-type run values, park factors (handedness-aware), weather (temperature/air density and wind out/in materially move HR/TB rates), and umpire K/BB tendencies (K props only).

### 3C. Opportunity model (critical for counting props)
- Confirmed lineup slot → expected plate appearances distribution (a #2 hitter gets meaningfully more PAs than a #7 hitter; model this from historical slot data, adjusted by team run environment and game total).
- Starter expected innings/pitch count ("leash") → how many PAs come against the bullpen vs. the starter; blend bullpen-average rates for those PAs.
- **Lineup gate:** props are PROVISIONAL until lineups are confirmed. Encode book void rules (e.g., Caesars requires the batter to be in the starting lineup or the leg voids) so grading and risk logic match reality.

### 3D. The game simulator (the heart)
Build a Monte Carlo game engine — this one component powers ML, RL, totals, F5, AND correlated parlay pricing:

- Per-PA outcome probabilities (K, BB, HBP, 1B, 2B, 3B, HR, out-in-play) for each batter vs. current pitcher, from 3A–3C.
- Base-out state machine: advance runners with realistic transition rules; score runs.
- Pitcher removal logic (pitch count/leash), bullpen sequence with fatigue flags.
- MLB rules that move betting numbers: home team bats bottom 9 only if needed (truncation deflates home-favorite run differentials — this is why -1.5 home favorites cover less than naive models think), walk-off endings cap winning margins, extra-innings placed runner.
- Run 10,000+ sims per game (vectorize; seed deterministically in tests). Outputs: win prob, run-line cover prob (-1.5/+1.5), total distributions, F5 markets, team totals — and, per player, joint distributions of H, TB, R, RBI, K, H+R+RBI.
- **Calibrate the sim:** league-wide sim outputs must match league base rates (runs/game, K/game, home win%). Fix systematic bias before trusting any output.

Props with joint dependence (H+R+RBI, R, RBI) MUST come from the simulator, since runs/RBI depend on teammates. Simple independent props (pitcher Ks, hitter hits/TB) can use closed-form distributions (Poisson-binomial across expected PAs) cross-checked against sim output.

---

## PHASE 4 — Edge engine

- **Blend with the market:** `final_prob = w × model_prob + (1 − w) × consensus_prob`. Fit `w` per market type by out-of-sample log loss. Expect small w (~0.2–0.4) for props and smaller for MLs — the market is good; our edge is in spots where it's structurally lazy (props, derivatives, correlations), not in out-predicting closing MLs.
- **EV:** `EV = final_prob × (decimal_odds − 1) − (1 − final_prob)`, using best available price.
- **Bet thresholds (configurable):** props ≥ ~4% edge, ML/RL/totals ≥ ~2% edge, and require the edge to exceed a model-uncertainty band (e.g., derived from sim variance / bootstrap). Below threshold → "pass," and passes are logged too.
- Rank the daily card by EV, with a separate "high-floor" view (highest blended probability) for parlay-leg selection.

---

## PHASE 5 — Parlay engine (the namesake feature)

- **Same-game parlays:** price legs JOINTLY by counting outcomes across the same game sims — e.g., P(Ohtani 2+ H+R+RBI AND Dodgers -1.5) is read directly off the joint sim distribution. Compare model fair SGP odds vs. the book's SGP price; books apply crude correlation haircuts, and mispriced correlation is a genuine, well-known edge. Positively correlated structures (leadoff hitter over + team total over; pitcher K over + opposing hitters under) are the target.
- **Cross-game parlays:** legs are independent → multiply probabilities. Make the tool state plainly: a cross-game parlay is only +EV if the legs are individually +EV; the parlay itself adds variance, not edge.
- **Correlation report:** for any user-built ticket, show pairwise correlations from sims, the fair combined probability, fair odds, book odds, and combined EV. Flag negatively correlated legs (they destroy EV silently).
- Integrate with the existing parlay calculator UI, including void-leg repricing (divide out the voided leg's decimal odds), using each book's void rules.

---

## PHASE 6 — Backtesting & validation (nothing goes live without this)

- **Zero lookahead:** every backtest decision uses only data with `as_of` timestamps before the decision moment. Odds used must be prices actually available at that timestamp. This is the #1 way betting models lie to their builders — treat any leak as a P0 bug.
- **Walk-forward evaluation:** train on past, predict forward, roll. No random shuffles, ever.
- **Metrics:** log loss & Brier vs. market baseline (the model must beat de-vigged consensus on held-out data or it earns w = 0), calibration/reliability curves per market, ROI (flat-stake and Kelly), max drawdown, and **CLV%** (our price vs. closing, per bet and aggregate).
- **Honest variance reporting:** under ~500 graded bets, ROI is mostly noise — display confidence intervals and say so in the UI. CLV converges much faster and is the primary health indicator.
- Ship a `backtest report` command producing all of the above per market type.

---

## PHASE 7 — Bankroll, sizing, and tracking

- **Fractional Kelly:** `f* = (b·p − q) / b` with p = blended prob, q = 1−p, b = decimal odds − 1. Stake = **¼ Kelly**, hard-capped at 2% of bankroll per bet and a configurable daily exposure cap. Reduce sizing further when multiple bets share a game (correlated exposure — read correlation from the sims).
- Bet logger: every recommendation and every placed bet (market, line, book, price, stake, model/consensus/blended prob, timestamp) with automatic grading from box scores, correct void handling per book rules, and running CLV/ROI dashboards.
- Include a **paper-trade mode**: the full pipeline runs and logs picks without staking, so the model earns trust on live data before real sizing recommendations mean anything.

---

## PHASE 8 — "The Sharp" LLM layer (last, and bounded)

The Anthropic API is a synthesis layer, never a probability source:
- Generate the natural-language rationale for each pick FROM the engine's numbers and feature attributions (why the edge exists: "wind 12mph out, LHP with 31% hard-hit rate allowed vs RHB, hitter slot 2 → 4.7 expected PA").
- Scan/summarize news context (injuries, lineup shuffles, weather changes) and emit FLAGS that can veto or downgrade a pick — never adjust the number directly.
- The existing "The Sharp" prompt persona becomes the voice of this layer. If a data feed is missing, The Sharp says so and marks the pick UNPLAYABLE rather than improvising.

---

## DAILY OUTPUT SPEC

The engine's daily card (JSON → UI) contains, per pick: player/team, market & line, best book & price (plus consensus price), model prob, market prob, blended prob, fair odds, EV%, edge-source tags (e.g., `park+wind`, `platoon`, `PA-volume`, `SGP-correlation`), confidence tier, correlation notes for parlay use, lineup-confirmed status, and ¼-Kelly stake suggestion. Also output: top-15 high-floor legs for parlays, top EV singles, suggested correlated SGP structures with fair vs. book pricing, and the "pass" list with reasons.

---

## ENGINEERING STANDARDS & HOW TO WORK

- Work phase by phase. After each phase: run tests, commit with a clear message, and update a `PROJECT_STATE.md` (current status, decisions, next steps) so fresh sessions can resume cheaply. Keep `CLAUDE.md` current with architecture and conventions.
- Write unit tests for ALL betting math (conversions, de-vig, Kelly, parlay pricing, void repricing) before building features on top. Sim tests use fixed seeds.
- Config-driven: thresholds, blend weights, Kelly fraction, snapshot schedule, and book list live in a config file, not code.
- Ask before adding any paid dependency or increasing Odds API call volume; budget credits explicitly (cache + scheduled snapshots).
- Degrade gracefully: any missing feed downgrades affected picks to UNPLAYABLE with the reason attached. Never fabricate a stat, line, or probability. Ever.

## NON-NEGOTIABLE GUARDRAILS

1. No lookahead bias — timestamps gate everything.
2. Market consensus is the prior; the model must EARN deviation weight out-of-sample.
3. Calibration beats accuracy — a calibrated 58% is worth more than an overconfident 70%.
4. Sample-size discipline everywhere (BvP caps, shrinkage, variance bands on results).
5. CLV is the north star; ROI is reported with honest confidence intervals.
6. Recommendations only ever come with probability + EV + uncertainty attached — no naked picks.

## DEFINITION OF DONE (v1)

- [ ] Daily ingest populates a full slate with timestamped odds snapshots
- [ ] De-vig/consensus layer passes hand-computed test fixtures
- [ ] Game simulator calibrated to league base rates; props & ML/RL/totals/F5 produced
- [ ] Edge engine outputs the daily card JSON with blended probs and EV
- [ ] Parlay engine prices SGPs from joint sims and reprices voided legs
- [ ] Walk-forward backtest report runs on ≥1 season with zero-lookahead verification
- [ ] Bet logger + CLV dashboard live; paper-trade mode on by default
- [ ] The Sharp generates rationales strictly from engine output

Start with STEP 0 now: audit the repo and present your integration plan.
