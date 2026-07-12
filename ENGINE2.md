# Engine v2 — the program

Goal: the most powerful honest baseball engine we can build on free data + The
Odds API + Caesars NV as the executable book. The champion engine (builds
23–44, verbatim in `src/engine/`, parity-locked by `npm run test`) keeps
producing the daily card until v2 **provably** beats it. Nothing here ever
fabricates a number; when a source is unavailable we say so and degrade.

## Architecture (agreed with Josh, 2026-07-11)

1. **Data spine (~70% of the power)**
   - Odds API = prices, not information. Information layer:
     - MLB Stats API: schedule, probables, confirmed lineups, boxscores (already wired).
     - Statcast (Baseball Savant leaderboards): xBA/xSLG/xwOBA, K%/BB%/whiff%/barrel%/hard-hit%,
       sprint speed → `tools/build_priors.py` → `public/model/priors.json`, nightly via
       `.github/workflows/model.yml`. **DONE 2026-07-11** (595 batters / 743 pitchers / 29 parks × R/L).
     - Park factors by batter handedness — in priors.json. **DONE**
     - Weather, HP umpires + self-building ump-K database (kFactor activates at 5+ games/ump),
       bullpen fatigue (reliever pitches last 3 days, gamePk-deduped) → `tools/build_context.py`
       → `public/model/context.json`, 2×/day via `.github/workflows/context.yml`. **DONE 2026-07-12.**
       Weather uses statsapi's park-relative wind strings ("Out To CF") — no azimuth table needed.
       Lineup-slot PA effects are already emergent from the PA-by-PA sim (no table needed).
       Catcher framing still TODO (Savant endpoint shape differs).
     - **Savant percentile ranks integrated 2026-07-12** (Josh's ask): `pct` per player in
       priors.json (544 batters / 580 pitchers). Orientation EMPIRICALLY verified: always
       100 = elite for the role (batter whiff/K inverted, pitcher BB/hard-hit/xwOBA inverted
       — correlation-checked vs raw skill data; Kwan 100th / Rooker 1st whiff pct anchor).
       Engine uses: pitcher xwOBA-pct quality nudge on opposing hit/TB/HR + sim vectors
       (capped 0.94–1.06), opposing-lineup contact-skill factor on K props (capped 0.93–1.07,
       needs 5+ known batters), batter percentile line in card bits, "sv-pct" tag when applied.
   - **Line history we own**: hourly snapshots (h2h/totals/spreads, us+eu regions) →
     `line-history` branch, `data/YYYY-MM-DD.json`, via `.github/workflows/line-history.yml`
     through the app's own /api/odds (no secrets). **DONE 2026-07-11.**
     Credit math: 6/run hourly ≈ 2.7k/month of a ~20k budget. Props snapshots deferred
     (expensive — needs per-event calls; revisit with a paid tier).

2. **Projection core — PA-level Monte Carlo**
   - The champion sim is already PA-level (base-out machine, starter leash, joint legs).
   - **INTEGRATED 2026-07-12 (Josh's call: ONE engine, no champion/challenger split).**
     The v2 kernel lives inside the engine source (legacy/index.html → regenerated gen file),
     gated by the runtime global `SH_V2` which the app always arms (`armV2()` in
     src/lib/engine-client.ts). Live now: skill-prior shrinkage at every rate site
     (xBA hits prior, barrel/ISO-indexed HR prior capped 0.4–2.8×, K%-scaled pitcher K prior
     capped 0.75–1.35×, incl. the sim vectors), HP-ump K factor (0.92–1.08, needs 5+ db games),
     temperature on HR (0.8%/°F vs 70°, capped 0.90–1.12), Shin de-vig + Pinnacle-weighted
     consensus for ML/RL/props, us+eu game-odds regions. Dormant = byte-identical to
     baseline43 (parity suite still passes); armed-on-fixtures test proves output moves and
     the overview stamps "ENGINE V2 INTEGRATED". 24 tests green.
     Still TODO from the spec: log5 batter×pitcher, platoon splits, park×handedness in the sim,
     bullpen chains by fatigue, manager hook/TTO, 10k sims, totals/F5/team-total pricing,
     platoon splits, park×handedness multipliers, ump/weather effects, odds-ratio/log5
     batter×pitcher blending, manager-hook model (pitch count + times-through-order),
     bullpen chains by availability, 10k sims, and new outputs: totals, F5, team totals.
   - Ships as `src/engine2/` (TypeScript, unit-tested, seeded) — champion untouched.

3. **Market layer**
   - De-vig: power or Shin method (not proportional) — corrects favorite-longshot bias.
     **DONE 2026-07-12**: `src/engine2/devig.ts` (proportional/power/Shin + sharp-weighted
     median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in
     `tests/engine2-devig.test.ts`. Live on the Board as the **Sharp Desk**
     (`src/engine2/sharpBoard.ts` + `src/components/mlb/SharpDesk.tsx`): per-game fair
     ML/totals vs the Caesars line, us+eu regions, comparability guard when CZ hangs a
     different total point.
   - Consensus weighted toward **Pinnacle** (confirmed available in the `eu` region for MLB;
     Circa is NOT in the feed — checked 2026-07-11).
   - Blend ~30% model / 70% market to start; the weight gets FIT from tracked results once
     the harness exists, not hand-tuned.
   - Surface only: ≥2–3% EV props, ≥1–1.5% EV mainlines, at the Caesars price.

4. **Correlation engine**
   - The PA-level sim gives joint distributions free: price same-game bundles honestly
     (K-over × team ML × under, etc.), replacing independence math in the Builder for
     same-game combos. Caesars SGP haircuts are crude — this is the Parlay Lab edge.

5. **Harness (what makes "most powerful" a fact, not a feeling)**
   - **Prop line history LIVE 2026-07-12**: `tools/snapshot_props.py` + `props-history.yml`
     (2 sweeps/day, 6 markets, ~90 credits/sweep) → line-history branch `data/props/`.
     Close = last snapshot before each game's first pitch.
   - **Pro Scoreboard v1 LIVE 2026-07-12** (`src/components/mlb/ProScoreboard.tsx`, Ledger page):
     per-leg CLV vs de-vigged cross-book close (raw.githubusercontent fetch of the archive),
     beat-the-CZ-close rate, ticket-probability calibration buckets, "verdict maturity" (n/500),
     all sample sizes disclosed. Verified end-to-end on live data (synthetic leg matched the
     real archive; CLV math hand-checked).
   - NEXT for the harness: store model-vs-consensus probability decomposition on locked legs
     (enables fitting the blend weight w from results), per-market CLV/log-loss breakdowns.
   - Archive: line history (running) + daily slate snapshots.
   - Score champion vs challenger daily: log-loss, calibration, CLV vs Pinnacle close, ROI
     by market. v2 becomes the default only when it wins on this scoreboard.

## Decisions log
- FanGraphs projections: Cloudflare-walled to scripts (403 page + API). NOT scraped.
  Savant xStats carry the skill layer; projections revisit later (manual CSV import is an option).
- Catcher framing endpoint returns a different shape — omitted until parsed properly.
- Odds snapshots go through the deployed proxy so the API key never leaves Vercel.
- Vercel builds disabled for `line-history` (and `main`) in vercel.json.

## Honest ceiling (told to Josh, stands)
Elite groups sustain ~52–55% vs the close. Edges come from softer prop markets, line
shopping, speed on lineup/weather news, and discipline. The engine's job is to be on the
right side of the closing line with honest sizing — not to promise more.
