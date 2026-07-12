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
     - Weather (wind speed/direction vs stadium orientation, temp), umpire assignments
       (K-zone effects for K props), bullpen usage last 3 days, catcher framing, lineup-slot
       PA expectations (~4.7 leadoff → ~3.7 nine-hole) → daily `context.json` job. **TODO Phase 1b**
   - **Line history we own**: hourly snapshots (h2h/totals/spreads, us+eu regions) →
     `line-history` branch, `data/YYYY-MM-DD.json`, via `.github/workflows/line-history.yml`
     through the app's own /api/odds (no secrets). **DONE 2026-07-11.**
     Credit math: 6/run hourly ≈ 2.7k/month of a ~20k budget. Props snapshots deferred
     (expensive — needs per-event calls; revisit with a paid tier).

2. **Projection core — PA-level Monte Carlo**
   - The champion sim is already PA-level (base-out machine, starter leash, joint legs).
     v2 upgrades: skill-prior shrinkage (toward priors.json instead of league means),
     platoon splits, park×handedness multipliers, ump/weather effects, odds-ratio/log5
     batter×pitcher blending, manager-hook model (pitch count + times-through-order),
     bullpen chains by availability, 10k sims, and new outputs: totals, F5, team totals.
   - Ships as `src/engine2/` (TypeScript, unit-tested, seeded) — champion untouched.

3. **Market layer**
   - De-vig: power or Shin method (not proportional) — corrects favorite-longshot bias.
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
