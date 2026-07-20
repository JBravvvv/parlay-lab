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
     the overview stamps "ENGINE V2 INTEGRATED".
   - **Phase 2b sim upgrades DONE 2026-07-12** (all SH_V2.sim-gated; dormant = parity):
     - **log5/odds-ratio batter×pitcher** (`shLog5`): batter rate × pitcher xBA-against
       anchored at league xBA; when it fires the WHIP/percentile proxies come OFF the hit
       channel (no double counting). HR channel: pitcher xISO-against, sqrt-dampened
       (`shPitIsoF`, 0.75–1.30), replaces the ERA/WHIP power proxy.
     - **Platoon** (`shPlatoon`): league-average magnitude by handedness (individual splits
       too noisy in-season) — same-hand h×0.98/hr×0.94, opposite h×1.02/hr×1.06, switch
       h×1.01/hr×1.03. stands/throws added to priors.json via a statsapi people batch
       (595/595 batters, 744/744 pitchers covered).
     - **Park×handedness** (`shParkF`): Savant park factor for the batter's side, dampened
       50% (single-season noise), capped 0.85–1.18; replaces the Coors-only hack when armed.
     - **Bullpen chains** (`shPenF`): weighted 3-day pen workload (day weights 1/0.6/0.3)
       vs the slate average → vBP vectors scaled 0.96–1.05 (gassed pen = opposing boost).
     - **TTO + manager hook** (inside `shSimGames`): 2nd pass h×1.02/hr×1.03, 3rd pass
       h×1.045/hr×1.07 vs the starter; the hook pulls a starter at 6 runs allowed or 29
       batters faced even before the outs-based leash.
     - **10,000 sims** when armed (SH_V2.simN; dormant stays SH_SIM_N=4000).
     - **Totals / F5 / team-total pricing**: armed odds parsing keeps per-book O/U prices at
       the modal total point (Shin + weighted-median fair, Caesars quote captured); the sim
       counts game totals, F5 result (home/away/tie), F5 totals 4.5/5.5 and team totals
       3.5/4.5 per run → `d.simMarkets` → Board "SIM PRICING" desk (totals blended 30/70
       model/market with EV at the CZ quote when the points match; F5/TT are model-fair
       only and say so). DISPLAY-ONLY: not fed into parlays, the allocator, or ledger
       grading — those markets have no auto-grade path yet. 27 tests green.
   - Correlation note: totals/F5 could enter the sim's joint-legs machinery for SGP pricing
     later; kept out until grading exists.

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

## HR Derby desk — REMOVED 2026-07-13 (done for the year)
All derby code (engine2/derby.ts, lib/useDerby.ts, components/derby/, /derby
route, derby-odds.json seed, tests) was deleted after the event; recover from git
history (commits up to 5cd4fb4) if it returns next July. UFC was hidden the same
day behind `src/lib/features.ts` `UFC_ENABLED` (false) — it comes back the day
before each card (Fridays) by flipping that one flag; the UFC components and
/api/ufcprops stay in the tree. The historical derby design notes below are kept
only as reusable lessons (market-scale calibration, one-sided-market anchoring).

### (archived) HR Derby desk design
`src/engine2/derby.ts` + `/derby` — a standalone special-event desk, zero contact
with the parity-locked game engine. Bracket/format/live HR counts come from MLB
statsapi `/v1/homeRunDerby/{eventId}` (event id discovered from the July events
schedule, excluding MLB's "Home Run Derby Test #N" rehearsal events); hitter
power from priors.json percentiles (brl .35 / xiso .30 / EV .20 / hard-hit .15,
mapped 0.55+0.9·pct to an HR-per-swing around base 0.27). Tournament Monte
Carlo (15k in-page): 20-swing pool → top-4 (longest-HR tiebreak proxied by
power) → re-seeded 15-swing semis/final, 3-swing swing-offs, final-swing
extension; lognormal day-form σ=0.16. The Odds API has NO derby key (verified
against the full sports list), so market prices paste in from the book
(winner / R1-pair H2H / player HR O/U with whole-derby-vs-R1 scope toggle),
Shin de-vigged, blended 25/75 model/market for EV + ¼-Kelly. Caesars'
API (api.americanwagering.com) is CloudFront-WAF'd — not scrapeable; the paste
flow is the design, not a fallback. New swing-limited format has no history: rankings are
the trustworthy output, absolute HR totals the weakest (stated in the UI).

**2026-07-13 (later, Josh's call): Derby is a first-class sport tab** (🏆) on
the Board, The Sharp and the Builder, via shared `src/lib/useDerby.ts`
(module-cached draws) + `src/components/derby/DerbySurfaces.tsx`. simDerby is
now derived from `simDerbyDraws` — compact per-tournament outcome arrays —
and `evalLegs` prices ANY leg set jointly by counting draws (push-excluded,
same convention as singles). `derbyParlays` = 2–3 leg combos, correlation
factor (sim joint ÷ Π marginals, clamped 0.2–5) applied to blended marginals.
UI honesty split: corr ≤ 1.15 → "book-friendly" (EV + ¼-Kelly at multiplied
odds); corr > 1.15 → "SGP territory" showing ONLY the fair price to beat
(books reprice/refuse correlated combos — multiplied-odds EV would be
fiction). Mutually exclusive slips price to zero and say so. Derby stays out
of the allocator and auto-graded ledger.

## UFC rankings desk (Stats tab) — added 2026-07-13
A pure STATS reference (no odds, no model, nothing invented), and deliberately
DECOUPLED from the UFC betting flag (`src/lib/features.ts` `UFC_ENABLED`): the
rankings are useful year-round, the betting board only shows on fight weeks.
`tools/build_ufc.py` (stdlib only) merges two authoritative live sources into
`public/model/ufc.json`, refreshed twice-weekly by `.github/workflows/ufc.yml`:
1. **ufc.com/rankings** — the official media-panel order: champion + #1..15 for
   all 11 divisions, plus Men's & Women's Pound-for-Pound (with weekly movement).
2. **Wikipedia "List of current UFC fighters"** — the full ACTIVE roster per
   division with MMA records / nicknames / ages (ufc.com's rankings table has no
   records). Rendered HTML tables (action=parse&prop=text) are parsed by header
   label, not column index.
Fuzzy name-match (accent-fold + Jr/Sr/III strip + order-independent token
containment, with a global fallback so a fighter ranked in one division but
rostered in another — e.g. Holloway at LW/FW — still resolves) overlays the rank
order onto the roster, so each division reads "champion, then #1..15, then
unranked (alphabetical)". A record the source doesn't carry shows "–" (never
faked; ~7 brand-new fighters lack a Wikipedia record). `src/components/ufc/
UfcRankings.tsx` reads the JSON, division/P4P pill selector, mounted-gated
localStorage for the last view. ESPN's `.../mma/ufc/rankings` endpoint was
rejected as STALE (listed retired fighters like Nunes as active) — do not use it.
The tool refuses to publish if <80 ranked fighters parse (markup-change guard).

## All-Star Game desk — added 2026-07-14 (game night)
A standalone special-event desk (`src/engine2/allstar.ts` + `src/lib/useAllStar.ts`
+ `src/components/allstar/AllStarSurfaces.tsx`), zero contact with the
parity-locked engine — the ASG is an exhibition (one-inning pitchers, rotating
lineups) so the season sim's assumptions don't hold. ⭐ ASG tab on Board / The
Sharp / Builder behind `ASG_ENABLED` in `src/lib/features.ts` (flip false after
the game, same pattern as UFC). Markets, per Josh: ML, F3, F5, HR props,
Correct Score. **STRAIGHT BETS ONLY — Caesars NV offers no ASG parlays**; the
Builder card is singles (exact-sum ¼-Kelly daily + FUN longshots ≥ +500, HR/
SCORE confined to FUN), and there is no combo UI at all.

Market reality (probed live 2026-07-14): The Odds API carries the ASG as the
only `baseball_mlb` event during the break — ML at 15 books (Pinnacle + Betfair
exchange in `eu`), F5 h2h/totals/spreads at ~6 books, **F3 only at Caesars**
(two-sided → de-vig its own prices, labeled "CZ-only"), `batter_home_runs` only
at Caesars and ONE-SIDED (Over 0.5) — the Derby's fantasy-EV trap, so HR props
are anchored to raw book-implied and the model (REAL season HR/PA from statsapi
feed/live × expected trips by announced batting slot) may only reorder.
**Correct Score is not in The Odds API for baseball** → pasted from the Caesars
app (field de-vig when ≥8 lines with a sane implied sum, raw anchor otherwise).
The sim (zero-inflated-geometric half-inning runs, walk-off bottom-9, ties →
swing-off deciding the WINNER only) is CALIBRATED to reproduce the consensus ML
fair and total fair — it never invents a different game; it only adds joint
structure: correct-score probabilities and F3/F5 cross-checks. statsapi
`/v1.1/game/{pk}/feed/live` supplies rosters (65 players incl. reserves) with
real season HR/PA + battingOrder. Event id discovered from the events list,
never hardcoded. 14 unit tests (`tests/engine2-allstar.test.ts`) incl. a
no-manufactured-EV bound on one-sided props and exact-sum/no-parlay card
invariants.

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

## Sizing & EV discipline + SGP joint pricing (2026-07-19, upgrade specs 01-02)

**Upgrade 01 — "no bet" is a first-class output.** Default selection mode `ev_gated`:
core-card tickets must clear `SH_CFG.coreEvMin` (percent, default 0 = breakeven) at the
Caesars price. Zero qualifiers → `shAllocate` returns `noPlay:true`, the Builder renders a
NO-PLAY card with $0 recommended, and staking anyway takes the explicit override
(`shSetOverride` → LS `pl_override`, `force` arg to shAllocate) which stamps `overrode:true`
on the locked ledger entry (file 03 reads it). Stakes allocate against
`min(entered DAILY, SH_CFG.dailyBankrollCap × bankroll)` (default 10%). `shKellyFrac(pl)` =
¼-Kelly at the CZ price capped at 2% of bankroll, floored at 0; `shCardCalc` returns
`kellyDaily` (Σ fractions × bankroll, capped) + per-pick `.kelly`; the card header shows
entered / Kelly-consistent / card EV, and tickets diverging >2× from ¼-Kelly wear the chip.
Legacy `probability` / `caesars_ev` modes stay selectable in Settings.

**Upgrade 02 — SGPs priced from joint sim paths.** Armed engines record per-leg hit
bitsets across every simulated game (`bits` Uint32Arrays inside shSimGames, V2-gated —
dormant allocates nothing) and expose `jointAll(keys) → hits/N`. In `build()`, each
same-game leg group's blended product is scaled by the sim's **dependence ratio**
`jointAll(group) ÷ Π sim-marginals`, clamped 0.25–4×. Deliberate deviation from the spec
text (which said replace the product with raw jointAll): leg marginals are the
market-anchored blend — swapping in raw sim numbers would unanchor marginal calibration,
so the sim contributes only the dependence it alone can see. Cross-game independence
stands; `prob`/`fair`/`ev`/`czEv` and shFunPick's floor + tiers flow from the corrected
number automatically. Tickets carry `simJoint` + `probNaive` ("naive X% → joint Y%" in
UI). Games with HR legs sim at `SH_V2.simNHR` (armed 20000) paths. Both upgrades are
armed-path only — the parity digest stays byte-identical.

## CLV automation + receipts (2026-07-19, upgrade spec 03)

**Sighting.** `/api/clv` (auth: `?key=CRON_SECRET` timing-safe, or the sync phrase; never
open — it spends odds quota) loads today's (Pacific-date) locked entry from the cloud
ledger, and for every still-pregame leg whose game starts within 45 minutes pulls the
current Caesars price + the de-vigged multi-book consensus fair
(`clv[lid] = {am, at, consensusFair}`). Odds go through our own `/api/odds` proxy (shared
4-min cache); ML/RL come from one slate call, props per event with only the needed
markets + `_alternate` ladders. The pure kernel `src/lib/server/clv-core.ts` can only
write `clv` — pregame-only, deduped, latest-pre-pitch wins, grading structurally
untouchable. Schedule: cron-job.org every 30 min 09:00–20:00 PT (both Vercel Hobby crons
are taken) + the in-app beacon (`clvTick` in ledgerSync, 15-min throttle, server
rate-cap 15 min) whenever a synced device has the app open.

**Receipts.** `src/lib/ledger-segments.ts` (pure): CLV in probability points
(implied(close) − implied(locked); `fairPts` grades vs the consensus close), segmented by
market / bucket / override days, per-market leg calibration (est vs realized, Wilson CI,
voids excluded, n always shown), coverage "sighted X/Y", 7-day receipt. Rendered by
`ReceiptsPanel` on the Ledger tab and `WeekReceipt` on the Dashboard (client-side over
the synced local ledger); `/api/digest` (sync-gated — staked/P/L are personal) serves the
same numbers + the weights-log drift.

**Loop closed.** `/api/calibrate` also trains on the cloud ledger's graded legs for dates
the prediction store never logged (deduped by date; ledger legs carry `p=est`,
`edge=null`, `pMkt=null`), and `GradedPick.pMkt` flows from prediction records into
`perMarket.mktCmp = {n, model, consensus}` — model vs consensus-only Brier over the SAME
records. The CalibrationPanel's "vs market" column marks (▲) any market where the model's
Brier beats the consensus: that's the earn-a-raise signal; until then shrink-only stands.

## Shadow card + supplemental fun locks (2026-07-19)

Fun-bucket-only additions; the core card stays one-lock-per-day and parity is untouched.

**Shadow card (display-only).** When today's card is locked, the Builder renders
"IF UNLOCKED — CURRENT CARD": `shCardCalc` (the exact shAllocate + shFunPick pipeline,
current SH_CFG + entered amounts) run against the freshly generated board. Clearly
labeled hypothetical, diff line vs the locked ticket ids, note that Board parlay tabs
sort by hit probability (not card order). No lock button; zero ledger writes — the
calc is a pure recompute, pinned by a byte-identity test on `pl_ledger`.

**Supplemental fun locks.** Engine: `shFunRemaining()` (budget = the locked entry's
`fun`, staked = Σ funT stakes), `shSupplementalCalc(d)` (pool = `shCardPool` of the
current board through `shFunPick` at the REMAINING budget, with excludeIds/excludeLegs
built from everything locked today — funMinProb floor, odds tiers, HR isolation, and
leg-disjointness all hold), `shLockSupplemental()` (re-checks budget + disjointness at
write time, appends funT tickets with `lockedAt` + `supplemental:true` — `late:true` if
past first pitch — merges new `games` keys, reopens `grading.done`, direct LS write like
shConfirmPrice). `shTicketSnap` is the shared snapshot builder (shLockCard's old local
`tkt`, extracted verbatim). Grading and CLV cover supplemental tickets for free: both
walk `core.concat(funT)` and key off `entry.games`.

**Merge kernel.** `mergeDay` now unions funT by ticket id (an append on one device
survives a merge with a richer-graded copy that predates it), unions `games` (base wins
conflicts), does a fill-only merge of grading.tickets/legs maps, and reopens
`grading.done` when any ticket id lacks a grade. Still symmetric + idempotent.
Invariant kept honest: `done:true` always implies a grade for every ticket.

**Receipts.** `ledger-segments` splits fun into `funSplit.atLock` vs
`funSplit.supplemental` (tickets/staked/settled/P-L + own CLV line); ReceiptsPanel
renders the split whenever a supplemental ticket exists. SUPP badges on Builder locked
panel and Ledger ticket rows.

Tests: `tests/supplemental.test.ts` (10) — budget exhaustion disables, disjointness vs
locked legs, append immutability (grades/core/stakes untouched, guard intact), shadow
zero-mutation, supplemental graded through real boxscore 822954 via shGrade + CLV
sighted via pendingLegs/sightProp/applySights, merge union symmetry/idempotence,
funSplit numbers. 128 tests total; parity digest unchanged.

## DK/FD selection basis — dk_fd, the default selection mode (2026-07-19)

**The idea:** shop at DraftKings/FanDuel, settle at Caesars NV. The basis price per
leg is the better OFFERED price between DK and FD only, line-shopped within the pair
(tie → DK; game lines at the modal point, props at the exact line), captured
additively at slate collection exactly like the cz layer (`shBasisPick`; fields
`bsN/bsBook` on rows → `bs/bsBook` on legs → `bsDec/bsOdds/bsEv` on tickets, all
additive and parity-safe). In dk_fd mode EVERY selection number computes at the
basis: the upgrade-01 EV gate, allocator weights and Kelly ceilings (`shKellyFrac`),
`coreMaxDec`, FUN tiers, and parlay building. Caesars is display + settlement only —
card legs need BOTH a basis and a CZ quote; the NV price-confirm stays the grading
price of record; locked tickets store both bases.

**The opinion is untouched:** the Pinnacle-weighted, Shin de-vigged, all-books
consensus remains the model's probability anchor. dk_fd swaps the price the model
shops at, not the opinion it holds.

**Two dk_fd-only deviations the NV-blindness test forced (both documented here on
purpose):**
1. One-sided markets (anytime HR — no opposite side to de-vig, so no true consensus
   exists) anchor their fair to the BASIS price instead of the all-books best price;
   with no basis they keep the legacy best-price anchor and are card-ineligible.
2. Parlay generation builds from the basis-priced universe only. Generation IS
   selection (the spec lists it), and a no-basis row's NV-anchored prob steering the
   builder's shared usage ledger would leak NV prices into which SELECTABLE tickets
   exist — the perturbation test catches exactly this. No-basis picks stay
   board-visible and manual-slip eligible (NO DK/FD BASIS tag); they just never
   enter generated tickets in dk_fd.

**The proof** (`tests/dkfd-basis.test.ts`): CZ + BetMGM quotes perturbed by scaling
both sides' decimal odds by the same factor — every pair's de-vigged fair is exactly
invariant, so the opinion is pinned while NV prices move wildly. Every pick, ranking
(market tabs; the TOP-50 "all" tab is an EV-at-best-price display ranking outside
selection), and card is byte-identical. Removing DK/FD entirely → everything
ineligible, no CZ-priced fallback, board still browsable.

**CLV + receipts:** each sighting stores both closes (`am` = CZ, `bsAm/bsBk` =
better DK/FD) so CLV is judged against the price that picked it AND the price that
paid it (Receipts "vs DK/FD close" column). "NV tax paid" = basis P/L − actual P/L
over settled basis-locked tickets, split by market — the running cost of settling
at the NV counter; void-repriced wins are excluded (a basis reprice would be a
guess) and the skip count disclosed. Stale guard: the Builder warns when basis
quotes are >20 min old. `caesars_ev`, `ev_gated` (@CZ), and `probability` stay in
Settings; existing explicit choices are honored, dk_fd is the fallback default.

## Board + Sharp at the basis (2026-07-20)
All three selection surfaces now present the SAME numbers in dk_fd. Engine rows gain
`bsKellyF` (¼-Kelly at the basis price, 2% cap) + `bsBadge` (edge badge at basis EV)
mirroring the cz layer — additive fields, parity digest is field-selective so the
baseline is untouched; the engine overview copy is mode-aware. Board (dk_fd): TOP 50
re-ranks by EV @ basis (the legacy "all" ranking is EV-at-best-price, a price dk_fd
forbids); Basis column with DK/FD tag; CZ column labeled "(settles)"; EV/Kelly/row
glow at the basis; no-basis rows flagged `NO DK/FD BASIS`, visible, never promoted.
The Sharp (dk_fd): plays replicate the allocator's discipline — basis + CZ quotes
both required, `coreEvMin` gate at the basis (read live from SH_CFG), ranked by
basis EV; gate-clearing picks with no CZ quote are disclosed with their basis price,
never substituted. SharpDesk v2 (`sharpBoard.ts`): DK/FD captured for ML + totals at
the consensus point, `basisPick` (better payout, tie → DK) shared rule, EV judged at
the basis in dk_fd with CZ kept gold as settlement. Tests: `basis-surfaces.test.ts`
(row Kelly/badge honesty, Sharp-selection replica invariants, basisPick pair rules).

## Calibration & self-correction module (2026-07-17 spec: "update-calibration-and-selection")
Additive layer; spec archived at Josh's iCloud (`parlay-lab-update-calibration-and-selection.md`).
- **3A logging:** every generated board's FULL pick set (all categories + suggested parlays,
  played or not, CZ-offered or not) is serialized client-side (`src/lib/predictions.ts`) and
  upserted to Upstash (`pl:pred:{date}`) via `/api/predictions` (sync-phrase gated). Rows carry
  `pModel` / `pMkt` / `wBlend` / `lu` (lineup_status) — additive engine fields, digest-safe.
  Freeze rules: graded records immutable; once a game starts its pre-start statement is frozen.
- **3B grading:** `/api/calibrate` (Vercel cron 09:30 UTC + manual `?force=1` with sync key)
  grades from statsapi schedule + boxscores via `src/engine2/grade.ts` — a tested port of the
  engine's shGradeLeg with identical Caesars void rules. Projected-lineup picks get
  `luRes`/`boAct` reconciliation (Update 2). Pinnacle-close CLV: NOT yet wired (needs the
  line-history reader) — reserved fields exist; panel copy stays silent rather than fake it.
- **3C analysis:** `src/engine2/calibration.ts` — prob/edge buckets per market per lineup_status,
  Brier, Wilson 95% CI; significance = predicted outside the CI. Stats → 📐 CALIBRATION panel.
- **3D self-correction:** shrink-ONLY per-market multipliers on the model blend weight
  (`shWm()` in the engine, fed via `SH_V2.calW` from `/api/calibration`). Tiers: <50 MONITOR,
  50–99 SOFT, 100–149 HARD, ≥150 ADJUST (CI-gated), ±10%/week cap, 5% absolute floor, ceiling
  = shipped defaults (35/15). Sanity breaker (n≥30, 30%+ edge, actual < half predicted) →
  market quarantined from The Sharp's plays, badged UNDER REVIEW. Kill switch `pl:cal:auto`
  (Settings; reporting runs regardless). Every adjustment logged and displayed.
- **Update 1 selection_mode:** `probability` (default) — Sharp plays + Builder card selection
  rank by engine true % (consensus-anchored); Caesars prices/sizes only, never chooses; picks
  CZ doesn't offer are listed separately, never substituted. `caesars_ev` = legacy ranking,
  in Settings. TOP 50 unchanged. Allocator: `SH_CFG.selMode` drives the base weight.
- Fail-silent contract: any calibration failure leaves board generation untouched.
