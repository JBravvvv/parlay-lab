# CLAUDE.md — Parlay Lab

Context for continuing development of **PARLAY//LAB**, a single-file multi-sport stat desk + parlay/bet-slip tool (MLB · NFL · NCAAF).

> ## ⚠️ THIS BRANCH (`frontend-rebuild`): full frontend rebuild in progress
> Per `parlay_lab_frontend_rebuild_prompt.md` (plan approved 2026-07-11): the app is being rebuilt as a
> **Next.js (App Router) + TypeScript + Tailwind v4** terminal-style product, deployed to **Vercel** with API keys
> server-side. The quant engine is being extracted **verbatim** into `src/engine/` (pure TS) — the math must not
> change; parity is proven against `tests/fixtures/baseline43.json` via the harness preserved in `tests/legacy-harness/`.
> - **The old single-file app now lives in `legacy/`** — unchanged and still what `main`/GitHub Pages serves.
>   Everything below this box describes that legacy app; its golden rules apply only to `legacy/` until cutover.
> - Node **is** installed now (nvm, `~/.nvm/versions/node/v24.18.0/bin`); validation = `npm run build`,
>   `npm run typecheck`, `npm run test` (vitest). jsc is no longer needed for the new app.
> - Phase status: **ALL PHASES (0–6) COMPLETE** on this branch. Pages: / (dashboard), /stats (MLB/NFL/NCAAF
>   live stat browser, ported from the legacy Stats tab; + UFC card view), /board (MLB|UFC sport tabs — UFC
>   desk in src/lib/ufc.ts + src/components/ufc/: 7-book de-vig consensus vs CZ moneyline, ESPN records,
>   deterministic parlay tickets, started fights excluded; NOT part of the parity-locked MLB engine), /builder,
>   /ledger, /sharp, /simulator, /settings, /design (design-system review page). Server routes: /api/odds
>   (host-whitelisted proxy, ODDS_API_KEY env, ~4-min Next data cache, quota headers, fresh=1 passcode-gated),
>   /api/stats (host-whitelisted proxy for statsapi.mlb.com + site.web.api.espn.com, keyless, 3-min cache),
>   and /api/sharp (ANTHROPIC_API_KEY env, APP_PASSCODE gate, legacy SH_SCHEMA contract, prompt file traced).
>   Engine facade: src/engine (get/set into the sandboxed legacy scope; shSimGames instrumented in
>   src/lib/engine-client.ts to capture sim outputs — zero math impact). Same localStorage keys as legacy
>   (pl_bankroll/pl_daily/pl_fun/pl_ledger/pl_sharp_ai/pl_board_r1/pl_pass/pl_quota). PWA: public/manifest +
>   public/sw.js (network-first shell). Commands: `npm run dev` (port 3600), `npm run build:local` for local
>   verification (writes .next-build — NEVER let a local build share .next with a running dev server;
>   plain `npm run build` is for Vercel, which requires the default .next), `npm run typecheck`,
>   `npm run test` (11 tests incl. the byte-identical baseline43 parity digest — run after ANY engine change).
> - **Deploy**: Vercel (Josh's account), production branch `frontend-rebuild`; env vars ODDS_API_KEY (rotate
>   the legacy public key at cutover), ANTHROPIC_API_KEY, APP_PASSCODE. Cutover checklist: deploy → set envs →
>   rotate Odds key → export ledger from the old app on the phone → Import on /ledger → add new URL to home
>   screen → merge to main and retire GitHub Pages.
> - Rules that carry over regardless of stack: never fabricate prices/stats/grades; locked product rules
>   (overs-only, HR isolation, no-repeat card, exact-sum allocator); ledger append-only after lock;
>   thresholds in config not code.
> - **July 2026 overhaul (fix-file, all 6 phases deployed):** default selection mode = **EV-gated @ CZ**;
>   settlement floor czEv ≥ 0 on core locks (override-proof, "nv_tax" blocked reason); HRR O1.5+ and
>   HR-anytime-parlay suspended from auto-selection; <100-graded-leg markets need consensus-fair EV ≥ −1%;
>   CORE max 3 legs / FUN max 4 legs, 1 FUN ticket, FUN $5/day default; **managed bankroll** ($2,500 base,
>   localStorage `pl_bank2`, computed = base + logged deposits/withdrawals + graded P/L, no free edits;
>   10% daily exposure cap at lock); unders enabled in disciplined modes with per-market direction prefs
>   (`pl_dirpref`); grading renders scores [bet team]–[opponent] (grading.v=2 migration). Full per-phase
>   record: **ENGINE2.md** + `docs/progress.md` + `docs/settlement-audit.md` + `docs/hrr-recalibration.md`.
>   None of these protections may be weakened without Josh's explicit sign-off.

## What it is
A self-contained web app and installable PWA. A top sport bar switches between **MLB / NFL / NCAAF**; each sport has a live stat desk and a betting odds board. A bottom tab bar switches **Stats / Odds / Slip** (the bet slip with parlay math is shared across sports). Deployed to **GitHub Pages: https://jbravvvv.github.io/parlay-lab/** (repo `JBravvvv/parlay-lab`, public) — push to `main` and Pages redeploys. Tested live on iPhone via Add to Home Screen.

## Golden rules
1. **`index.html` is the entire app and the only source of truth.** All HTML, CSS, JS, and the baked-in MLB snapshot live inside it. No framework, no build step. Keep it that way.
2. **Bump the build number on every change.** Footer reads `build N · YYYY-MM-DD` (current: **build 44**). After deploying, confirm the footer number in the live app — stale cache is always the first suspect, not a code bug. **Also bump `CACHE` in `sw.js`** (current `parlay-lab-v25`) whenever `index.html` or any shell asset changes, or installed apps keep serving the old build.
3. **Validate before handing off.** Extract the inline script and parse-check it. **Node is not installed on this machine** — use JavaScriptCore instead:
   `jsc -e "try{new Function(readFile('script.js'));print('OK')}catch(e){print(e)}"` where `jsc` = `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`.
4. **Preserve live data.** Must be served over http(s) — `file://` breaks all fetches. Local dev: run `serve.command` (or `python3 -m http.server 8790`) → http://localhost:8790.
5. **Never fabricate stats or odds.** Test any new endpoint with curl before wiring it in.

## Files
- `index.html` — the app.
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon*.png` — PWA shell (added build 20).
- `serve.command` — one-click local dev server.

## Architecture (inside index.html)
Vanilla JS. Key state:
- `SPORT` — `'mlb'|'nfl'|'cfb'`, persisted in localStorage `pl_sport`. The `SPORTS` registry holds each sport's label, Odds-API key, stat groups, seasons, prop markets, and odds-board modes. `switchSport()` resets sport-specific state (bet slip persists).
- `S` — stat desk: `scope` (`ind`|`team`), `group`, `season`, `team`, `timeframe` (MLB only), `position`, `minVal`, `sort`, `picked`, `query`, `cache` keyed by `ckey()` = `sport-scope-group-timeframe-season`.
- `OB` — odds board: `mode` (`ml`|`spread`|`props`), `games`, `game`, `market`, `rows`, `ncaa` (the game-card rows for ML/spread views — legacy name), `seq` (stale-response guard).

### Stat desk
- Groups: MLB = Hitting/Pitching; NFL/NCAAF = Passing/Rushing/Receiving. Individual + Team scopes for all sports. Football is season-scope only (timeframe select hidden); seasons 2026/25/24/23 — each sport's `defSeason` (football: 2025, the last completed season) is the default; seasons above it are labeled "· upcoming" and show a "hasn't kicked off yet" empty state until ESPN starts returning rows (verified: ESPN returns HTTP 200 with 0 athletes/teams for 2026 pre-kickoff).
- **MLB data** — MLB Stats API (`statsapi.mlb.com`), season + byDateRange; individual 2026 has baked snapshot fallback (`SNAP_HIT`/`SNAP_PIT`); team mode live-only.
- **Football data** — ESPN (no key):
  - Athletes: `site.web.api.espn.com/apis/common/v3/sports/football/{nfl|college-football}/statistics/byathlete?...&category=offense:{group}&sort={group}.{group}Yards:desc&season=YYYY&seasontype=2&isqualified=true&limit=350`
  - Teams: same host `/statistics/byteam?...season=YYYY&seasontype=2` — **NCAAF byteam requires `&group=80`** (FBS) or it 500s.
  - Parsing: `parseFootball()`/`fbZip()` zip each entity category's `totals` against the response's top-level `labels` by category name; team categories come as Own/Opponent pairs — we use "Own"; duplicate labels resolve last-wins. Columns in `FB_COLS` are label-keyed; values are ESPN's preformatted strings, so sorting/min-filter go through `statNum()` (strips commas).
- Fetches try direct then allorigins/corsproxy (`fetchSeq`), with a parse fn captured per request.
- Team logos: MLB + NFL via ESPN CDN (`logoImg`); NCAAF text-only (130+ programs).

### Odds board (The Odds API; NCAA **baseball** was removed in build 21)
- Modes per sport: MLB = ML | Props; NFL/NCAAF = ML | **Spreads** | Props. `obLoadML(mode)` is the generalized game-card loader (`h2h` or `spreads` markets; spread points shown next to team, included in the slip leg as "Spread +3.5 vs Opp").
- Sport keys: `baseball_mlb`, `americanfootball_nfl`, `americanfootball_ncaaf`.
- Props: per-event endpoint; markets per sport — MLB: HR/Hits/TB/H+R+RBI/Ks; football: Anytime TD (`player_anytime_td`, yes/no like Anytime HR), Pass Yds/TDs, Rush Yds, Receptions, Rec Yds. Caesars (`williamhill_us`) preferred, **falls back to any US book** with a note. Default game skips already-started events (started games 404 on the props endpoint). Off-season/far-out games: ML+spreads post early; player props post near kickoff — the empty-state note says so.
- Key embedded as `ODDS_KEY_DEFAULT` (overridable via gear → `pl_oddskey`). It is public in the source (accepted trade-off); rotate if quota drains. `x-requests-remaining` response header shows quota.

### App shell (build 20)
Sticky glass app bar (status pill + spinning refresh) · top sport bar (build 21) · bottom tab bar Stats/Odds/Slip with leg-count badge · safe-area insets · service worker caches the shell (network passthrough for all API calls).

### Bet slip
Legs persist in `pl_legs`; combined parlay odds/payout/EV; Nevada book quick-links. Shared across sports.

### The Sharp (builds 23–44) — daily MLB prop board · quant engine
Fourth bottom tab. Two engines share one slate collector (`shCollectSlate`: statsapi schedule with `hydrate=probablePitcher,weather,lineups,venue,linescore`, Odds API h2h+spreads+totals + 6 prop markets per eligible game, 7/15/30-day player form + **league aggregates** (`slate.league`, summed pre-filter → shrinkage priors), **BvP career matchups** (`pullBvp`: `people?personIds=…&hydrate=stats(type=vsPlayer,opposingPlayerId=SP)`, 2 calls/game), gaps disclosed in `data_gaps`; never fabricate) and one renderer:
- **Built-in quant engine (default, free, no key)** — `shAnalyzeLocal()` (build 39, board schema v9): returns `{overview, categories, categoriesLive, parlays, parlaysMixed, parlaysLive, liveGames, trap, passes}`. Market-anchored (methodology adapted in-browser from `parlay_lab_quant_engine_prompt.md`):
  - **Market layer**: every posted book de-vigged multiplicatively (`shDevig2`), consensus = median (`shMedian`) — game odds carry `home_fair`/`home_rl_fair`/`ml_books`, prop rows carry `fair`/`books`; displayed/EV prices are the **best across books** (line shopping: `oBook`/`uBook`/`*_book`).
  - **Projections**: rates recency-blended 7/15/30 (`shBlendN` returns sample n) then **empirical-Bayes shrunk** to league means (`shShrink`; k=60 AB hits/TB, 150 HR, 4 starts pitchers). **BvP hard caps**: <15 career PA ignored (context-only on the card), 15–30 tiny nudge, 30+ modest, total effect ±10%.
  - **Monte Carlo sim** (`shSimGames`: 4000/game, seeded `shMulberry` → deterministic): per-PA vectors {BB,1B,2B,3B,HR,OUT} from shrunk rates + starter factors; base-out machine with league constants (`SH_ADV` incl. sacFly/GIDP/ROE); starter leash → league bullpen tail; bottom-9 truncation, walk-offs, extras placed runner. Calibrated ~4.4 runs/team (untruncated), 50.0% home at equal teams. Powers **ML/RL** and **H+R+RBI** (joint, teammate-dependent) for pregame games with confirmed lineups; closed-form fallback (live games / no lineup) is stated on the card. Also emits per-leg marginals + same-game pairwise **correlations** (`SIMS[gkey].corr`) for parlay flags.
  - **Edge engine**: `final = SH_W·model + (1−SH_W)·consensus` (`SH_W={props:.35,ml:.15,rl:.15}`); **EV at best price** on every pick; **EDGE badge** when EV ≥ `SH_EDGE_MIN` (4% props / 2% ML-RL) AND ≥ sample band (`shBand`); conviction A/B/C from EV (`shConv2`). **TOP 50 ranks by EV**; category tabs rank by win prob (the high-floor parlay pool). **¼-Kelly stakes** (`shKelly`, capped 2%/bet) from `SH.bankroll` (localStorage `pl_bankroll`, default $750, header input; re-renders on change). Edge-source **tag chips** on cards; **passes strip** (with trap, parlays tab) explains what's off the board and why.
  - **Locked rules (user)**: hitter props overs-only, never unders; HR 0.5 line only; **HR props never mix with any other prop type — an HR leg only rides with other HR legs, in every set** (build 43: `batter_home_runs` excluded from `mixPool` in `buildParlaySet`); MIXED PARLAYS exclude HR/ML/RL entirely; player cap 3 per board; general board pre-7th inning, in-game board to the final out; parlays may reuse solo picks (but never within one day's card — see allocator).
  Claude mode still returns the legacy 15-pick shape — `shRender()` branches on `data.picks` vs `data.categories`.
- **Claude mode (optional)** — system prompt **`prompts/mlb_prop_handicapper_prompt.md`** (fetched at runtime; sw serves `/prompts/` network-first) + slate as user message to `claude-opus-4-8` (adaptive thinking, `output_config.format` json_schema). **Key is user-supplied via ⚙ (localStorage `pl_claudekey`) — never embed one in source**; browser calls need the `anthropic-dangerous-direct-browser-access: true` header; handle `stop_reason` `refusal`/`max_tokens`. ~$0.30–0.60/run.
Both produce the same JSON shape → `shRender()`; board persists per-day in `pl_sharp` (schema **v10**); picks add to the slip with model probability pre-filled as EST WIN % to drive the EV math.
- **Caesars-only + bankroll + ledger layer (build 40, board v10 — per `parlay_lab_caesars_bankroll_update_prompt.md`; HARD CONSTRAINT: generation untouched, proven by byte-identical baseline diff on real fixtures):**
  - **Caesars-only playable card**: ingestion additively captures Caesars (`CAESARS_KEY`=`williamhill_us`) ML/RL/prop prices (`*_cz`, `row.cz`; RL only at the engine's modal ±1.5); rows carry `cz/czOdds/czEv/czEdge/czKellyF/czBadge`; parlay legs carry `cz`, tickets `czOdds/czDec/czEv/posCorr/negCorr`. Cards display/stake Caesars prices only (probabilities stay multi-book consensus); picks/tickets Caesars doesn't price sit in collapsed "Not at Caesars" strips (`unavailable_at_book`); slip adds use Caesars prices; one-time NV-feed caveat note (`pl_czNote`). **Milestone ladders (build 44):** Caesars posts hits/Ks as "1+, 2+" ladders → The Odds API `SH_PROP_ALT` (`batter_hits_alternate,pitcher_strikeouts_alternate`, +2 credits/event; verified live — Caesars absent from the standard keys). Alternates fill ONLY `row.cz` on rows the consensus books created (`altCz` diversion in the merge loop — never fairs/line-shopping/new rows; standard Caesars quote wins over the ladder); pick cards show the ladder equivalence ("O 0.5 · 1+").
  - **Daily allocator** `shAllocate` (pure/deterministic/idempotent): DAILY $ (`pl_daily`) spread over `shCardPool` (pregame Caesars-playable PARLAYS+MIXED tickets, wrappers `{pl,src,idx}`) — **¼-Kelly-proportional weights (edge ÷ odds, build 42)**, shared-game greedy dampening (0.5/leg), **HARD RULES (user): no pick may appear on two card tickets** (exact-leg duplicates skipped in core AND FUN via `alloc.legs`); **core NEVER takes HR props** (`coreNoHR` — ticket type or any leg lkey `batter_home_runs`) **and never odds past `coreMaxDec`** (15 ≈ +1400) — longshot parlay "EV" is compounded model error (`shCoreEligible`); HR/longshot tickets remain browsable + FUN-eligible only. Per-ticket cap `SH_CFG.perParlayCap` (relaxed to 1/n), whole-dollar water-fill, remainder→highest EV, **sum always exact**; negative-EV slate still allocates fully + thin-slate banner. **FUN bucket** `shFunPick`: FUN $ (`pl_fun`) selects 1–3 longshots from the same generated pool by Caesars-odds tier (BIG/MASSIVE/MOONSHOT), posCorr-first, `funMinProb` 0.1% floor, "≈1 hit every N slates" transparency. All knobs in `SH_CFG`. TODAY'S CARD renders atop the PARLAYS tab; DAILY/FUN inputs re-allocate live (debounced), same tickets.
  - **Lock + ledger**: `shLockCard` freezes tickets/prices/stakes/`gameInfo` (pk+first pitch, additive engine output) into `pl_ledger` (seeded `SH_LEDGER_SEED` 2026-07-10). `shLedgerSave` guard: locked entries append-only — only `grading/gradedAt/clv` merge; NV price-confirm (`shConfirmPrice`) allowed until that ticket's first pitch; inputs freeze after lock or first pitch (`shCardStarted`).
  - **Auto-grading** `shGrade` (on open + GRADE button, re-runnable/idempotent): schedule-by-date for status/linescore + boxscore-by-pk; legs graded via `lkey` (`pnorm(player)|mkt|ln` or `ml_/rl_ home/away`); **Caesars void rules**: batter not in starting lineup (battingOrder %100≠0 or substitute) → VOID, pitcher didn't start → VOID, postponed/suspended → VOID; voids/pushes divide out of the ticket decimal (`shGradeTicket`), all-void → push, any lost → lost, missing data → `ungradable` with reason (never fabricated). TB = H + 2B + 2·3B + 3·HR.
  - **LEDGER tab** (6th subnav chip, board-independent): P/L, ROI, W-L-P, max drawdown chips (ALL/CORE/FUN scopes via `shLedgerStats`), daily ROI table, equity/cum-ROI SVG sparklines, hit-rate by ticket size, biggest FUN hit, export/import backup (import never overwrites locked days). **CLV honest version** (`shClvSight`): last Caesars price seen pre-pitch, refreshed free on any slate pull + "📸 snapshot" button (paid); coverage disclosed. **Projection** `shProjection`: 2000 seeded MC paths replaying the locked-ticket profile at current amounts through `SH_CFG.seasonEnd`, ruin-aware (busted paths stop betting), 10/50/90th-percentile fan only — never a single number.
  - localStorage keys added: `pl_daily`, `pl_fun`, `pl_ledger`, `pl_czNote`.

## Deploy workflow
Edit `index.html` → bump footer build number → bump `sw.js` CACHE if shell changed → validate JS (jsc) → commit → `git push` → wait ~1 min → open https://jbravvvv.github.io/parlay-lab/ → **confirm footer build number**. (Legacy Netlify drag-and-drop target `parlaylab-jbravvv.netlify.app` still exists but Pages is primary.)

---

# Next.js rebuild (`frontend-rebuild`) — collection-period facts, 2026-07-24/25

Live: https://parlay-lab-six.vercel.app · repo `JBravvvv/parlay-lab` · production branch
**`frontend-rebuild`** (`main` and `line-history` have Vercel deploys disabled in `vercel.json`).
The quant engine runs **verbatim** inside a sandbox facade: `legacy/index.html` →
`node tools/extract-engine.mjs` → `src/engine/legacy-src.gen.ts`. **Every engine edit
requires re-running the extractor and the full suite** (`npx vitest run --no-file-parallelism`;
Node via nvm: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`).

## The collection-period FREEZE (through ~2026-09-22)
Parameters are frozen; the frozen-parameter table in `docs/collection-period.md` is a drift
detector. Standing rules, learned the hard way: **never rebaseline a parity digest to silence
a test**, and **never loosen a shipped protection to solve a volume problem** (a thin card is
information about the slate).

## Date basis — three server-local date bugs, all now fixed
`src/lib/server/pt-date.ts` exports `ptToday()`; **no route may derive a calendar date from
the server clock** (Vercel runs `TZ=UTC`). `tests/server-date-basis.test.ts` scans every
`app/api/*/route.ts` — a hardcoded route list was itself the bug once. Pinned: `generate`,
`calibrate`, `clv`. The three defects were: `obSameDay` (dropped ~24% of every server board —
the late/west slate), `CAL_START`, and `/api/generate` (wrote board + prediction rows under
tomorrow's date after 00:00 UTC).

## Calibration channel
- `CAL_START = "2026-07-25"`; `calibrationEligible(date)` gates training. Self-cleaning — it
  goes inert once the window has passed.
- `gradedFromBlob()` in `src/lib/pred-serialize.ts` is the **one door** into the training
  channel; `hist` rows and `superseded` rows are structurally unreachable.
- `mergeDayBlob` does **generation-scoped replacement** — a second generate on a day
  supersedes, never doubles. So accrual is one board/day.
- `/api/calibrate` grades **every pending prediction record** off statsapi boxscores, not just
  ledger legs. `mktN[m] = summary.reliability[m].n`; `fitReliability` emits an entry at n ≥ 1.
- **`consMinN` (100) only bites while a market is unproven** — so the small-sample consensus
  gate's coverage silently widens on a counter reset and narrows on a crossing. Written up in
  `docs/collection-period.md` with the projected crossing dates (total bases ≈ 2026-07-28).

## Market microstructure — measured, don't re-derive
From `line-history` branch, `data/props/`, 12 days (2026-07-12 → 07-25), 11,072 rows:
- **`batter_home_runs` has `n = 0` (no de-vigged consensus) on 100% of 4,524 rows** — it is
  quoted one-sided, so the engine falls back to `fair = oneImp/1.06` (`legacy/index.html`
  L2388). `consCzEv` on a one-sided Caesars leg is therefore the constant **−5.66%**, which
  fails `consMinEv` (−1%) for every bet regardless of merit.
- `batter_total_bases`: 16.1% `n = 0`, Caesars **in** the fair on 56.5%, Caesars **alone**
  on only **0.7%** (16/2,363). Requiring ≥1 independent book costs 16.8% of rows; ≥2 costs 50.8%.
- Caesars in the fair: H+R+RBI 83.8%, outs 71.4%, hits 0%, K's 0% (Caesars quotes hits/K's/HR
  as milestone ladders, which never create fairs).
- A single-fixture version of this measurement was **wrong by ~20×**. Fixture slates are not a
  substitute for the archive; `tools/snapshot_props.py` stores `n` + `cz` per row.
- Game lines (`line-history/data/`) gave the price-movement percentiles behind `lockMaxAgeMin`
  and the p90 offshore-book artifact (fat tail = coolbet, winamax_de, betfair_ex_eu, nordicbet,
  betclic_fr, betsson — not the US books).

## Model quality — two open findings (measured 2026-07-26, nothing changed)

**`pitcher_outs` has a confirmed defect. `docs/pitcher-outs-audit.md` is the record;
`tools/outs_audit.py` reproduces every figure from any persisted board.**
1. `of = shClamp(0.140/oo, 0.86, 1.12)` (L2258) divides **0.140** into `offense()`, which
   returns **TB/AB — slugging, league ≈ 0.40**. `0.140` occurs **once in the whole engine**;
   the same file uses `/0.40` for the bvp adjustment and `/0.235` for K/AB. Result: the factor
   is **pinned at the 0.86 clamp floor on 35 of 35 rows** with a lineup read — reaching the
   1.12 cap needs `oo ≤ 0.125` TB/AB, physically impossible. It is a **flag for "lineup
   posted" worth a flat −14%**, not a factor.
2. **No hook-timing / earned-workload term.** A 30-day IP/G mean shrunk toward
   `Lipg ≈ 5.60` cannot project a 6+ IP start, so the shortfall grows with the line and
   **survives** fix 1: corrected, −0.51 outs at lines ≤15.5 vs −2.57 at ≥16.5.

Measured: **λ_model − λ_market = −2.48 outs (−0.83 IP), negative in 38/38**; raw model gap
**−23.1 pp median, 0 of 38 above market** (the only 100%-one-sided market on the board);
35/38 board rows and **17/17 selected legs are UNDERs**. Ledger corroborates at n=5: **0 for 5**
at a stated 53.2%, the only market whose model Brier (0.285) is materially worse than the
consensus (0.215). `Lipg` was the prime suspect and is **exonerated** — recovered in closed
form as 5.59/5.59/5.58 from the three rows with no lineup read. Units are correct throughout
(the outs-vs-innings ×3 is present and right).

**Exposure is zero and the protection is accidental**: `consMinN` gates `pitcher_outs` until
~09-13. Do not change either parameter mid-freeze — the frozen table is the drift detector.

3. **Shrinkage weight `k = 4` against `n ≈ 4` starts** = every starter priced as **half
   himself, half league average**. Estimator compressed to 4.67–6.17 IP; only 2 of 38 rows
   exceed 6.0 IP. Drives the residual tail and **is shared verbatim by `leashOf`**, so the
   sim route does not fix it either.

**`pitcher_outs` is DELIBERATELY LEFT BROKEN as Phase 2's positive control** (expected result
stated in advance: **slope ≈ 0**; a slope ≈ 1 there means Phase 2 itself doesn't work).
Trigger to fix: Phase 2 reports on outs, **or** freeze exit. The one-line change (`0.140` →
`0.400`) is pre-written in the audit doc with its measured effect.

**The sim already computes `pitcher_outs` and throws it away.** `outsBySPHome`/`outsBySPAway`
(L1864–1871) accumulate the exact settled quantity on every path and never reach `out`.
Deriving the market needs *accumulation only, no new simulation*. But `leashOf` (L2094)
recomputes the closed form's estimator verbatim — same `shShrink(ipg,n,4,Lipg)`, same ×3 —
and the leash is a **ceiling** (`vsBP = spOuts >= leash` is one-way), so the sim's realised
mean sits below it. Sim ceiling vs market: **+0.03 outs overall but −1.68 at lines ≥16.5**.
The sim route fixes the constant for free and cannot fix the shrinkage.

**Winner's curse is composition, not selection.** Pooled selected/board ratio **2.13**
[1.75, 2.77] decomposes exactly as **AVAILABILITY 1.59 × MIX 1.34 × WITHIN 1.00** [0.90, 1.17].
**No market's CI excludes 1**, so **Phase 3's default is NO SHRINK**, revisited at ≥20 boards.
Both a global band (`shBand(nEff)`, a sample-size proxy) and a per-market band are wrong as
defaults — per-market is the right shape but is not yet estimable. ⚠️ **`WITHIN = 1.00` does
NOT close the winner's-curse question**: it measures *gap-based* selection, while the curse is
*edge-estimate error*, and the gate selects on EV = f(gap, price) — at long odds a small gap
clears +2%. Phase 2's movement slope tests the real quantity. `tools/selection_effect.py`.
Denominator note: **37 distinct legs**, not the 46 leg *instances* first reported.

> ### STANDING RULE: parlays win if per-leg overconfidence is under ~3 pp.
> Crossover **3.05 pp** (board 2026-07-26, ¼-Kelly, correlated bias). **Stable**: 3.35/3.05/3.05
> at 1/8, 1/4, 1/2 Kelly; **3.10 pp** with the same mean bias delivered independently per leg
> (they agree because `E[Π(pᵢ−εᵢ)] = Π(pᵢ−δ)`, so correlated bias does NOT hit parlays harder).
> Under a leg-equivalent floor the crossover rises to **3.50 pp**. Running estimate lives in
> `docs/singles-vs-parlays.md`; add a row per board.
>
> Two by-products: **¼ and ½ Kelly are identical** — above ~¼ the Kelly ceiling stops binding
> and `perParlayCap` ($62.50) takes over from the 2% cap ($200), so the ¼ setting is
> load-bearing only downward; and **1/8 Kelly gives the parlay card HIGHER growth** (133.0 vs
> 126.6 bp), i.e. it is over-concentrated at ¼ relative to growth-optimal.

**Parlays beat singles on log-growth — conditional on calibration, with a stated threshold.**
At the model's own probabilities: **+126.6 bp vs +55.3 bp** (exact over 2⁶ card outcomes, ¼-Kelly
stakes, $2,500 bankroll), and the advantage **survives a leg-equivalent floor** (`1.02^n − 1` →
+139.1 bp). Per-leg czEv behind each card is indistinguishable (5.76% vs 5.80%), so the fixed
floor did **not** manufacture it — though it *is* mis-scaled: **4 of 18 tickets (22%) clear +2%
only because the floor doesn't scale with leg count**. ⚠️ **The ranking inverts at −3 pp of
per-leg overconfidence** (−3: +8.2 vs +7.9; −5: −67.3 vs −23.7, parlays lose 2.8× as much), and
the parlay card is **79× more likely to go 0-for-6** (9.5% vs 0.12%). **Do not re-spec Phase 4
on this** — it reduces to one unmeasured calibration parameter with a threshold Phase 2 and the
calibration channel exist to produce.

**PROPOSED POST-FREEZE AMENDMENT (unsigned): scale the EV floor by leg count.** `coreEvMin`
is a fixed +2% ticket floor, so the implied per-leg bar FALLS with legs (+2.00 / +1.00 /
+0.66%) while `consMinEv` RISES (−1.000 / −0.501 / −0.334%). Measured over-admission scales
as predicted: **1 of 8 at 2 legs (12.5%), 3 of 10 at 3 legs (30%), 4 of 18 total**. Replacing
the scalar test with `selEv >= ((1+coreEvMin/100)^nlegs − 1)*100` is identity-preserving at
one leg and improves the card on every axis (EV 15.08→16.45%, growth +126.6→+139.1 bp,
crossover 3.05→**3.50 pp**). **Not during the freeze.** Sign or reject at exit —
`docs/singles-vs-parlays.md`.

**H+R+RBI: the PA fix does NOT explain the miss.** ⛔ **RETRACTED: it does NOT "run the wrong
way" — there is no denominator mismatch and the term must not be changed.** `bn.r` is HRR per
game *played* and `abG` is AB per game *played*; they cancel to `(HRR/AB) × expAB`, the same
per-AB shape hits/TB/HR use. The factor is upward on 86% of rows because `expAB > abG` is
normal for an everyday starter — the correction doing its job. What survives: the **bound**
(derived from the clamp limits, untouched by the retraction) — max downward effect **5.9 pp
(O0.5) / 7.2 pp (O1.5)** against a **27 pp** O1.5+ miss, so **a second defect exists and is
unidentified**; `hrrAltMax` stays. New: the clamp **truncates an algebraically-correct
correction on 21 of 44 rows** (raw ratio max 1.773) — conservative, no change proposed.
`tools/hrr_pa_audit.py`. Replaying graded legs
needs the sync phrase (owner-executable). Note the model's H+R+RBI disagreement now sits
**entirely on the ACTIVE line** — O0.5 +11.5 pp vs O1.5 −1.4 pp — i.e. `hrrAltMax` suspends
the lines where the model agrees with the market.

**`consMinEv` is a STRUCTURE filter wearing a quality filter's name.** `consCzEv` is
multiplicative — `Π(1+cᵢ)−1` — so the per-leg bar *tightens* with leg count: −1.000% at 1 leg,
−0.501% at 2, −0.334% at 3. Measured: median −5.60%, max −0.60%, **1 of 205 rows clears even as
a single**. Mechanism is the 1.071 Caesars overround compounding. **And it pulls against
`coreEvMin`**, a *fixed* ticket floor that gets **looser** with leg count. Two gates, opposite
directions on the same axis, neither designed with the other in mind. Both frozen.

**Singles do not solve NO-PLAY, and structure barely matters** (`docs/singles-vs-parlays.md`,
`tests/singles-counterfactual.test.ts`). **1 of 205** playable rows clears `consMinEv` as a
single (best −0.60%), and **none of the wall is compounding** — 24 of 24 gate-reaching singles
are blocked. `maxCoreTickets = 6` binds either way, so a 276-row singles pool and a 67-ticket
parlay pool both produce **6 picks / $250**. `buildParlaySet` refuses `legs.length < 2`, so a
single is *unconstructible* today, not merely unselected. Correlation justifies a parlay in
**4 of 218** tickets (max +19.2%), and **2 tickets are negatively correlated at 0.564 — the
engine detects `negCorr`, discloses it, and builds them anyway.** Singles-first would
*concentrate* the outs defect (Valdez is the top stake), so it must sequence after the fix.

**Gates do NOT reach the prediction store.** `consMinN`/`consMinEv` gate tickets inside
`shAllocate` at card time. `finalizeCats` → `boardToPredictions` → `mergeDayBlob` consult no
gate (they drop only `all`, live rows, dupes, and started games), and `snapshot_props.py`
never sees the board. Proof: `/api/calibration` shows `pitcher_outs n=5` graded with **zero
locked cards ever**. So Phase 2 keeps its full x-axis; the restricted-market window binds the
**ledger channel only**. The real limit on the close-graded channel is that `categories` caps
at **top 50/market** — outs (38) and K's (35) are complete, TB/hits/HR/HRR are truncated.

**Four drift checks now, all catching things a parameter table cannot show** — because in
every case the constants still read the same:
| check | catches | worst finding |
|---|---|---|
| `tools/factor_activity.py` | an input gone missing | 7 identity-returning factors |
| `tools/gate_activity.py` | a threshold that can't be reached | 5 inert protections |
| `tests/clamp-activity.test.ts` | a clamp pinned at a bound | L2258 100% low |
| `tests/shrink-activity.test.ts` | `k` too large for the `n` available | L2066 weight 0.349 |
| `tools/range_compression.py` | output range narrower than the market's | **outs 0.50, and nothing else** |
| `tools/hrr_pa_audit.py` | a "fix" that runs the wrong way | HRR PA correction upward on 86% of rows |

**`shShrink` k values are the SIXTH unexamined-constant entry** (after `simN`/`simNHR`,
`1.06`, props-`regions`, ump `g>=5`, `GAP_BUCKET_MIN_N`). 7 of 9 sites sit below 0.6
own-sample weight. **The flag is a prompt to justify each k, not a verdict** — `k=150` on
HR/AB is defensible for a rare event; `k=4` on `ipg` at n≈4 is not.

**Range compression is a distinct pathology from bias** — a model centred right that can't
reach the tails. `tools/range_compression.py` was wrong **three** times first: wrong space
(probability transforms *(λ, line)*, and books set lines near their own λ, so any
probability-scale ratio flatters a biased model), wrong orientation (`categories` is the
UNDER on 35 of 38 outs rows), and **wrong population** — `categories` ranks on win
probability, which is a function of `pModel`, so the sample was selected on the model side of
the ratio. Population is now `propBoard` (uncapped, over-oriented), with `pModel` recovered
from the stored blend and the recovery **checked** (max error 0.26 pp over 223 rows).
**Result: `pitcher_outs` 0.50 and nothing else.** ⚠️ **The earlier H+R+RBI 0.50 is RETRACTED**
— on the uncapped population it is 1.78, *wider*; `--truncation-check` swings it 0.50 → 4.88.
`power`'s 60% saturation is real but has **no demonstrated downstream consequence**.

**Third drift check: `tests/clamp-activity.test.ts`.** Factor activity catches a missing
input, gate activity a threshold that can't be reached, and this a **clamp pinned at a bound**
— all three invisible to a parameter table because no value moves. Per `shClamp` call site it
reports low/high/in-range fractions and snapshots them, so a clamp that *starts or stops*
binding fails. Two pathologies: **OFFSET** (one bound — L2258 at 100% low, the outs defect) vs
**SATURATED** (both bounds — L1615 at 37/37, only 27% in range). It independently rediscovered
both pins (L1605 `shUmpKf`, L1696 `shPenQF` are cold). Cold sites are listed, never omitted —
L1617 `shTempF` is a **harness limitation** (fixture has no `g.weather.temp`), not an inert factor.

## Credits (The Odds API)
1 credit **per market per region**; `/v4/sports` and `/events` are free; statsapi is keyless.
A generate is **114–150 credits**, saturating at 150 (`slice(0,16)` caps the prop loop).
`docs/credit-budget.md` is the live budget — key correction: the lock guard makes a
**two-regenerate day** normal (look at 5, lock at 6:30), which puts a 16-game September day at
~712/day ≈ **107% of a 20K plan**. Free balance check:
`curl -sS -o /dev/null -D - "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY" | grep -i x-requests`
— there is **no reset-date header**; subtract two days' `x-requests-remaining` to get burn.

## Credentials — Josh types his own
Never enter his sync phrase, Odds API key, Claude key, or `CRON_SECRET` on his behalf; never
upgrade a paid plan or buy anything for him. `/api/generate` and `/api/calibrate` stay gated
(`X-Cron-Key`). `/api/board` (GET) is deliberately **not** sync-phrase gated.

## Scheduling
Vercel Hobby allows 2 crons and both are used (`/api/generate` `0 16 * * *`, `/api/calibrate`
`30 9 * * *`). The day-of-week generate split (weekday 22:00 / Sat 18:00 / Sun 17:00 UTC) moves
to **cron-job.org** (supports custom headers; free tier 100 executions/day, CLV job already uses
96). `/api/generate` comes out of `vercel.json` only once those entries exist.

## Reading the board JSON — traps that have each cost a wrong answer
- **`categories` is one-sided.** "Top 50 per market ranked by win probability, ONE side per
  line (the side the model favors)." `|pModel − implied|` is **side-invariant** so magnitudes
  are valid there; **signs, rates and shares are not**. Use `propBoard` (both sides oriented to
  the OVER, uncapped, `alt` = Caesars milestone ladders).
- **`propBoard.pO` is the BLENDED probability**, not the model's — `modelBy` reads `r.p`, not
  `r.pModel`. Divide by `wBlend` (0.35 props / 0.15 ml-rl) for the raw model gap, and recover
  the factor by joining to `categories` rather than assuming it.
- **The join key is `gkey|lkey`**, never `lkey` alone (ML/RL lkeys are the literals
  `ml_home`/`ml_away`/`rl_home`/`rl_away`).
- **Ticket legs repeat.** `d.parlays + d.parlaysMixed` gives leg *instances*; dedupe by
  `gkey|lkey` before any per-leg statistic.
- **Row `case` strings are the model's own inputs, verbatim** ("18.7 IP over 4 starts … → ~13.3
  outs"), so factors can be backed out arithmetically instead of re-running the engine.
- **A gap in probability confounds the mean with the line's position.** Invert the market fair
  through the engine's own distribution (`shPOver` = `1 − PoisCdf(⌊line⌋, λ)`) to compare means
  in the market's own units.

## Working rhythm with Josh
Report before pushing; stop at every phase gate; measure rather than model; state the
denominator of every number. He catches unreconciled tables — if two of your figures disagree
on the same cell, that is the finding, not a rounding issue. Five standing methodology rules
live in `docs/harness-substitutions.md`: diff two things that should be identical · anything
that can return an identity value must be observable · **a filter chain must be RUN, not
reconstructed** · **a directional claim needs a population that could have gone the other way** ·
**the test count comes from that run's output, and a red suite is reported first**.

**Test reporting:** run the suite, quote that run's numbers, and if anything is red say so at
the top of the message before any finding. Never loosen a strict assertion to make it pass —
`toEqual` catching an added field is the assertion working.
