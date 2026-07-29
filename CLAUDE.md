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

# ⏱️ CURRENT STATE — read this first (as of 2026-07-27)

> **POST-COMPACTION POINTER (2026-07-29)**: the session memory of record is
> **`docs/session-handoff.md`** — read it before acting; this file holds the standing
> rules and the chain. One copy of the memory, not two that can diverge: durable session
> knowledge lives in the handoff and the docs it indexes, never re-summarized here or in
> any other project's files.

## Where the code is
| branch | state |
|---|---|
| `frontend-rebuild` (production) | pushed through **`5178476`** (2026-07-28 00:xx PT). Held: the PWA-answer + mode-coupling commit. **521 passing (60 files)** + 7/7, build clean |
| `main` | `c2459c4` pushed — scheduler copy of `board-archive.yml` (schedules only fire from the default branch) |
| `line-history` | `1e77c9d` pushed — the 2026-07-26 board backfill |
| `emergency/minimal-credits` | `874b8f2`, pushed, unmerged — **do not merge** |

Nightly bots push to `frontend-rebuild` (`context.yml`, `model.yml`). **Expect to rebase before
pushing**; that has happened four times (`b538365` context, `ff2ad74` priors, and twice since).

## cron-job.org entries — Josh creates them, Josh types `CRON_SECRET`
| # | when (UTC) | target | status |
|---|---|---|---|
| 1–4 | `0 22 * * 1-5` · `0 18 * * 6` · `0 17 * * 0` · `30 22 * * 0` | `/api/generate` | **created** |
| 5–6 | **`0 17 * * 0,6`** and **`30 18 * * 0,6`** | `/api/propsnap` | **being created** — these REPLACE the `0 16` I first gave, which measured **14.9% vs 52.9%**. `/api/propsnap` deployed with the 2026-07-27 push of `ab73291` |

**Free tier is 100/day and `/api/clv` uses 96.** Sunday = 2 generate + 2 propsnap = **exactly
100**. A third propsnap entry does not fit.

## 🚨 GENERATE OUTAGE (found 2026-07-27 late) — FIRST thing tomorrow
**No 07-27 board exists.** The retime removed Vercel's 16:00Z generate cron; the route's
scheduled path needs header **`x-cron-key: CRON_SECRET`** (`cronHeaderAuthed`, any hour) and
the cron-job.org entries 1–4 are evidently not presenting it. JOSH: add the custom header to
entries 1–4 (you type the secret); their execution history shows the failure mode (401 =
header, no executions = entries off); Vercel logs print "header-bad" vs "none". ~~Bridge: the normal morning app open generates on-device~~ **RETRACTED 2026-07-27, same
night, by trace**: the ONLY writer of `pl:board:{date}` is `/api/generate` L319 — `/api/board`
has no POST and the client's `pl_board_r1` is localStorage, pull-only. An on-device generate
logs prediction rows (the phrase is set) but **persists NO server board: no archive row, no
Series A board-side, no shadow carrier. The header fix is the ONLY path.**

**⚠️ WEDNESDAY'S ORDER, FIXED BY THE OWNER (2026-07-29; step 0 added same day)**: 0.
**post-push re-grep — CLEARED** (below) → 1. push — **DONE, landed `671aed9..33dd31b`
after rebasing over two bot commits** → 2. **header fix** (owner) → 3. **curl** (~150,
protected, item-6 capture wrapped, **quota read immediately BEFORE and AFTER, both
printed**) → 4. `gen=list` → 5. `self_consistency` (zero
TB≥1==H≥1 violations, zero HRR ticket legs, both population sizes printed) → 6.
app-switcher double reopen → 7. HRR rows present AND greyed → 8. **replay dump + the
ParlayPred membership diff**. The outs go/no-go and the burn plan are the owner's and
come AFTER the board reads clean. Nothing ships: MIN_GAP, sha+config echo, outs flag,
`coreEvMin`, cap, A1, damping, alt keys, ledger export all spec-only.
**STATUS (2026-07-29, post-compaction turn — supersedes the "nothing ships" list
above, each on the owner's own authorization)**: **MIN_GAP SHIPPED** (`1617d1b`,
pushed; landing pre-committed — **first test = the 07-30 morning cluster**: one paid
snapshot per 40-min window + N−1 "skipped: pre within MIN_GAP" lines = landed, two
paid in one window = NOT landed and the ship reverts to spec; `props-history.yml`
pulls the script from `origin/frontend-rebuild` at workflow L59, so the shipped edit
governs the next firing). **cfSel SIGNED OFF AND SHIPPED** (held commit —
`src/lib/cfsel.ts` + route + `PredRecord.cfSel`; the spec's re-pool construction was
vacuous and was corrected to a full counterfactual analyze, collection-period; guard
`tests/cfsel-guard.test.ts` byte-identity GREEN with plants; stamp reading
pre-committed: cfSel on EVERY susp record or the flag did not land). **OUTS: the
owner RULED (2026-07-29) — the FLAG deploys Thursday 07-30 regardless of the board
reading** (both branches pre-committed; accrual preserved from code structure, ~35
rows/board — pitcher-outs-audit, dated record). **Post-push re-grep RE-RUN this
turn**: chunk `256-171aff5d10da160d.js` still referenced; served engine string
280,466 chars, sha256 `f6cf1513…` = repo — **step-0 clearance HOLDS**. Still
spec-only: sha+config echo, `coreEvMin`, cap, A1, damping, alt keys, ledger export.
**NEXT BLOCKING STEP: 2 — the header fix (owner's).**
**STEP-0 CLEARANCE (2026-07-29, post-push re-grep — the owner's blocking gate)**: served
chunk **`256-171aff5d10da160d.js` still referenced by the served HTML**; extracted engine
string sha256 **`f6cf15130a8beddf87aa761db68aea9ca3b4ac8a0dd65b138cf11994e4d98e5b`** =
repo at HEAD = the recorded `f6cf1513…`. **Hash unchanged AND chunk name unchanged —
step 1's client half survives the push; the curl proceeds.** (Chunk names are
content-hashed, so future greps key on the STRING hash regardless.) The Vercel deploy
LIST (timestamps × commit) needs the dashboard — not readable from here; the served
artifact is the outside-observable evidence. **THE BOT, audited**: `engine-v2-bot` —
`context.yml` (3 daily crons) + `model.yml` (1 daily cron), both `permissions:
contents: write` to this branch; **15 commits since freeze start (daily, BY DESIGN —
the shadow log depends on them); whole-window file census: exactly
`public/model/context.json`, `public/model/priors.json`, `data/ump_k.json` — data
inputs, zero code paths.** The two commits under the push (`925f1c6`, `671aed9`)
touched 2+1 of those files. Per the owner's pre-committed branch this is still **M17**:
an automated writer with branch write-access had NO path enforcement for the whole
window — good behavior was inspection, not guard. **Now guarded:
`tests/bot-path-whitelist.test.ts`** (whitelist ⊇ check on every bot commit since
freeze start, with an invalid-by-value plant; green on the real history).
**STEP-1 CLEARANCE — THE HELD STACK IS DOC-AND-TEST ONLY (audited 2026-07-29; shas
rewritten same day after the rebase renamed them — the guard `tests/sha-references.test.ts`
now fails the build on a dangling citation)**: all
nine commits (b9ba57c → 33dd31b post-rebase) touch ONLY `CLAUDE.md`, `docs/*`, and two test files
(`sweep-covers-engine`, `outs-suspension-coupling` — both `it.fails`-encoded);
`git diff origin/frontend-rebuild..HEAD -- src/ app/ legacy/ public/ …` is EMPTY, and
the engine string at HEAD hashes **`f6cf1513…` — identical to the served chunk,
re-verified**. **Pushing the stack cannot change what production serves.** (Had any
runtime file been touched, the push would be an engine change mid-window needing a
vintage stamp and sign-off — it is not.)
**THE CAPTURE, READY TO RUN (2026-07-29, owner's item 6 — wrapped around steps 3–4;
"capture is a code change" was FALSE for the response body and the board):**
```bash
D=$(date +%F)
curl -s -H "x-cron-key: $CRON_SECRET" "https://parlay-lab-six.vercel.app/api/generate" | tee "gen-$D.json"
curl -s "https://parlay-lab-six.vercel.app/api/board?date=$D" > "board-$D.json"   # free, public — rows + the parlay POOL
python3 - <<'PY'
import json,datetime; d=json.load(open(f"gen-{datetime.date.today()}.json")); print(d.get("gen"))
PY
```
Field-by-field, what the generate response body contains of the four missing captures:
**picks NO · blocked-with-reasons NO · ranks NO · stakes-vs-ceilings NO** — it returns
`{ok, date, priced, parlays: COUNT, written, total, overview[:160], gen}` (route
L337–346), counts only. The board store/archive top-level keys: `{at, date, data:
{categories, categoriesLive, gameInfo, liveGames, luCoverage, overview, parlays,
parlaysLive, parlaysMixed, passes, propBoard, simMarkets, trap}}` — **`parlays` is the
emitted POOL (ticket composition pre-allocation), NOT the allocated card**; and the
prediction store DOES record leg-to-ticket membership for the pool (`ParlayPred.legs`
with lkey/gkey, `pred-serialize.ts` L66–76). **Resolution of the pre-committed
branches**: the POOL is persisted three ways (board KV, archive, ParlayPred) — so the
admitted set and the whole allocation are RECONSTRUCTIBLE BY DETERMINISTIC REPLAY for
any day that HAS a board; the four allocation fields themselves are genuinely
uncaptured (the replay-vs-persisted diff — the two-allocators check — stays impossible
until the sha/config-echo instrument ships). **Series-day currency: a dark day
additionally destroys that day's M14 production check (no board → no pool → no replay)
— the dark-gap cost rises to ~6–7 series-days per dark day.**
**STEP-8 PRE-COMMIT — the 07-29 board's M14 reading (written before the board
exists)**: what persists today: board ROWS and the parlay POOL (`categories`,
`parlays`, archived). **What is NOT persisted: the allocation** — picks, blocked list
with reasons, greedy ranks, stakes-vs-ceilings (named now, per the
field-not-captured rule; adding capture is a code change and stays spec-only). The
allocation is RECONSTRUCTIBLE deterministically: replay `shAllocate` on the archived
pool via the harness — the replay IS the record, and the "board's own admitted set vs
replay" diff cannot run until an admitted set is ever persisted (sha+config echo spec).
The dump = replay on today's archived board: admitted set, blocked-with-reasons
(`coreEvMin` binding count = the blocked-reason line), ranks (uncapped pick order),
stakes vs ceilings. **The falsifiable Control-C prediction, numbers stated in advance
(calibrated on 07-26, n=1)**: IF the cap binds, the prob-ranked 6 forgoes **≥ 30 bp**
E[ln] vs the same pool's EV-ranked 6, and rank-7+ displaced tickets carry HIGHER czEv
than same-rank entrants (07-26 signature: entrants ~2–4% czEv / ≥63% prob vs displaced
~7%). Readings: cap binds + displaced-higher-EV → **M14 confirmed in production**
(upgrades from n=1-archival); cap does not bind → **M14 unobserved in production, the
sweep stays archival — said plainly, not treated as confirmation.**

**THE FULL VERIFICATION CHAIN (owner's rule: NOTHING LOCKS WEDNESDAY UNTIL IT COMPLETES).**
Canonical numbering fixed 2026-07-28 (owner's item — the grep is STEP 1; the push that
preceded it is step 0, done 2026-07-27 night):
1. ⚠️ **Deployed-sha grep — CLIENT HALF DONE 2026-07-28, SERVER HALF NOT GREPPABLE**: served
   chunk `/_next/static/chunks/256-171aff5d10da160d.js` carries both
   `M8 fix, signed off 2026-07-27` and `hrrAltMax:-1` — **inside the engine SOURCE STRING**
   (the engine ships as a string literal evaluated at runtime, which is why a "comment"
   survived minification; string contents are data). `hrrAltMax` read sites, audited: BOTH
   are engine-source — the display/grey tag (L2514) and the `buildParlaySet` ticket bar
   (L2652) — one source string imported by BOTH the client (`engine-client.ts`) and the
   server route (`app/api/generate/route.ts` → `@/engine`). So the grep proves the deployed
   BUILD and the client half directly; **the server function's bundle is a named
   ungreppable artifact** — same commit, same import, but that is same-build inference, not
   a grep. **The instrument that closes the server half is step 5** (zero HRR legs in the
   server-built board's tickets). Until step 5, M8/suspension are "client-verified,
   server-inferred", not "live".
   **HASH EVIDENCE (2026-07-28, owner's one-string check)**: the engine string EXTRACTED
   from the served chunk ≡ the repo's `legacy-src.gen.ts` string — **sha256 `f6cf1513…`
   both sides, 280,466 chars, three deterministic fetches** (`git diff 263184c..HEAD` on
   the file is empty, so repo = deployed sha here). Extraction is BUILD-time (a committed
   static file, statically imported — not a request-time read), so client/server cannot
   diverge without a deploy; per the owner's rule identity is still NOT inferred from the
   import graph — the server-RUNTIME hash is unobtainable without a code change. **The
   change, named**: compute `sha256(LEGACY_SRC)` at module load, expose it in the
   `/api/generate` response meta + the board archive (which currently echoes NO engine
   config — verified: no `hrrAltMax`/`coreEvMin` anywhere in the archived 07-26 board), and
   parity-check client-vs-server sha in `self_consistency.py`. One instrument note for the
   record: the first hash comparison "found" a 2-char difference that was MY probe's bug
   (Buffer coercion splitting multi-byte chars) — the instrument nearly manufactured "two
   engines"; fixed with `setEncoding`, three clean fetches.
   **THE SHA INSTRUMENT — SPEC ONLY, approved to spec 2026-07-28, NOT shipped, returns
   for its own sign-off**: (i) **additive-only**: `engineSha = sha256(LEGACY_SRC)`
   computed once at module load, attached to the `/api/generate` response meta, the
   archived board, and a client `data-engine-sha` attribute — **nothing branches on the
   hash and no code path reads it**; an instrument that can alter behavior is not an
   instrument. (ii) **Bundled with a board config echo**: every board self-describes its
   vintage — `hrrAltMax`, `coreEvMin`, `coreCzEvMin`, `consMinN`/`consMinEv`,
   `coreMaxLegs`/`maxCoreTickets`, `perParlayCap`, `kellyStakeMult`, and the armed
   `selMode` — because two turns could not answer "what was this board built with"
   (verified: the archive echoes NONE of it today). (iii) **A guard test, written and
   OBSERVED RED before enforcement**, failing when served-chunk hash ≠ server-runtime
   hash (red-observation happens at implementation by planting a mismatch). (iv) Credit
   cost: **zero** — it rides existing responses; the burn plan gates only whether
   generate fires at all. **Wednesday does NOT wait for this**: it is unshipped, so
   Wednesday closes on `self_consistency.py` alone (step 5), as the chain already
   states.
2. **Add header `x-cron-key` to entries 1–4** (you type the secret; the Monday 3:00 PM PT
   401 in the execution history is the before-evidence). Free.
3. **Manual generate curl** (below) — ~120 credits → response `{ok, date, gen}`. Builds the
   first post-fix server board.
4. **Landed**: `gen=list` non-empty for the response's own date. Free.
5. **Board-level confirmation** (free): `python3 tools/self_consistency.py --date <that day>`
   → **TB>=1 == H>=1 MODEL bad = 0** (was 118/127) proves M8 live; zero HRR legs in the
   board's `parlays`/`parlaysMixed` proves the suspension live SERVER-SIDE (closes step 1's
   open half); `sh` present on closed-form batter rows proves the shadow series started.
   **WEDNESDAY'S READING — pre-committed 2026-07-28, before the board exists (owner's
   item; per-step costs: steps 1/2/4/5/6/7 FREE, step 3 ~150 credits — the protected
   spend):**
   - **A pass = zero TB≥1==H≥1 violations AND zero HRR legs in built tickets AND both
     population sizes printed on the run's own output** (the tool prints per-constraint
     n). A zero over an empty population is NOT a pass and the run says so itself.
   - **Zero HRR rows on the board** → the greyed-row check is VACUOUS and the reopen did
     not happen — **a reopen failure, not a suspension success**.
   - **HRR rows present but UNGREYED on device** → the display half fails (client bundle
     or SW staleness — step 6 re-run, then diagnose).
   - **HRR legs present in built tickets** → `hrrAltMax` is not reaching the server path
     — the server half closes in the WORST direction and **that is an M-item the same
     day**.
   - **Vintage claims Wednesday's board CAN support** (no config echo exists — verified):
     behavioral ones only — M8 live (TB identity), suspension live (zero HRR ticket legs),
     shadow series started (`sh` columns), and the served-bundle string identity (step 1's
     hash). **CANNOT support**: "built with `hrrAltMax=-1` / `coreEvMin=2` / which
     `selMode` was armed" as a direct record — those stay inferences until the sha+config
     echo instrument ships (spec'd below, own sign-off).
   - **⚠️ TODAY'S BOARD IS THE FIRST OF A NEW BEHAVIORAL VINTAGE (written 2026-07-29,
     before the board exists — owner's item)**: `consMinEv` stops binding on
     hits/TB/HR/HRR today. **No pre-07-29 board joins today's without segmentation**
     (vintage census: collection-period.md). Two ticket-count readings, pre-committed:
     **(a) zero tickets clear with `consMinEv` gone → `coreEvMin = 2` is the binding
     gate — a FINDING with a number (print the blocked-reason counts from the generate
     response), not a quiet board.** **(b) the card fills to `maxCoreTickets = 6` on day
     one → the cap is binding on the first live board and Control C's displacement
     mechanism (M14) is live in production, not just in the sweep — record which
     tickets sat at ranks 7+.**
6. **App-switcher double reopen** (device procedure below — SW network-first).
7. **On-device: HRR O0.5 rows PRESENT AND GREYED** with expected n from that day's board.
Violations ≠ 0 at step 5 → **DIAGNOSIS-THEN-DECIDE, never reflex-rollback**: (i) step-1
grep = 0 → stale deploy — redeploy, no engine question; (ii) deployed but violating →
check the tool's printed `wBlend` first (a changed blend weight breaks the un-blend, not
the engine); (iii) both clean and violations persist → a NEW defect surfaced — that is
information; hold Wednesday's locks and diagnose. The one-line revert exists but
arithmetic cannot violate its own identity — (iii) would implicate something else.

**THE DEVICE ANSWER (owner's item 1, traced in `public/sw.js`)**: a service worker EXISTS
(`SwRegister.tsx`, production only). Strategy: **navigations are NETWORK-FIRST** — an online
open always fetches the newest deploy's HTML — and static chunks are cache-first BUT
content-hashed, so fresh HTML references new chunk URLs and stale cached chunks are never
served to it. **A stale engine requires an OFFLINE open (explicit fallback) or the known iOS
relaunch-from-memory quirk.** Device procedure, exact: close the app from the app switcher,
reopen ONCE while online; do it twice to defeat the relaunch quirk. No reinstall, no cache
clearing.
**ON-DEVICE VISUAL PROOF (this is also the item-2 client-board check): Board → H+R+RBI —
every O0.5 row greyed with the "Suspended" chip.** Config and code ship in ONE bundle, so a
greyed O0.5 row proves the running bundle and therefore M8 too — they cannot ship
separately. Optional M8-specific eyeball: any player carrying BOTH TB 0.5 and 1.5 rows —
pre-fix the two showed the SAME model %, post-fix 0.5 sits clearly higher. The client board
cannot be fed to `self_consistency` (localStorage, no export path) — the visual IS the
client-side confirmation, and it closes the loop because SW-network-first + the step-1
served-bundle grep + one fresh online open ⇒ the client engine equals the verified bundle.
**STEP 5b (owner's item 3; renumbered 2026-07-28): repeat ALL THREE confirmations on WEDNESDAY'S OWN BOARD —
`python3 tools/self_consistency.py --date 2026-07-29`, zero TB≥1==H≥1 model violations, zero
HRR legs in built tickets, `sh` present — BEFORE any lock. Tuesday's board proves the
engine; Wednesday's board is what forms the first live card. Nothing locks until the day's
own board passes.**

**THE MANUAL RUN (step 4):**
```
curl -s --max-time 320 "https://parlay-lab-six.vercel.app/api/generate" -H "x-cron-key: PASTE_CRON_SECRET"
```
then prove it LANDED (created → fires → landed, the whole chain):
```
curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-28&gen=list"
```
non-empty `gens` = the 07-28 board exists server-side, **with shadow columns** (the deploy is
live), archives on 07-29's runs, and is Series A's first joinable date. Notes: the header
path is hour-free; 45-min rate cap (a second run inside it returns `skipped`); 3 spending
runs/date. Then fix entries 1–4 with the same header and watch Monday 22:00Z fire on its own.

~~ACCRUAL OUTAGE~~ **CORRECTED 2026-07-27 late, by reading the deployed summary — the
accrual claim was WRONG twice over.** `/api/calibration` (public) shows `window.to =
2026-07-27, eligibleLogged: 3`: **Josh's client generates DID log 07-27 — accrual never
stopped**, so "no board ⇒ mktN frozen" was false, and the day-for-day shift applies only to
a date with NO generation from EITHER surface (so far: zero such dates). And the projected
reopening dates the shift was applied to were long stale — the LIVE `summary.reopen`
(rate window 07-25→26, 2 complete days):

| market | n | perDay | **reopens** |
|---|---|---|---|
| hits / TB / HR / HRR | 51–57 | 25.5–28.5 | **2026-07-29** |
| K's / outs | 35–38 | 17.5–19 | **2026-07-31** |
| ML / RL | 30 | 15 | **2026-08-01** |

The NO-PLAY window ends THIS WEEK, not mid-August — the old 08-17/08-23/09-03 table was
built on the first two thin dates. **The outage's real cost is the board artifacts: no
archive row, no Series A board-side, no shadow rows — not mktN.**

**07-27 IS RECOVERABLE FOR SERIES A** — "unrecoverable" was wrong a third time: the
prediction store holds 07-27's client-logged rows (pre-outcome, honest) carrying `pModel`
AND `pMkt` per row — exactly the join's two inputs — behind the sync phrase Josh holds.
Fallback: archive reconstruction (the 20:56Z props snapshot covers 11 of 15 events).
Genuinely gone, named: the 07-27 board blob, hence its shadow rows (impossible anyway —
that morning's client build predates the shadow deploy) and the 4 events absent from the
pre snapshot.

**ENTRY-SIDE PROOF (the curl proves the ROUTE; this proves the ENTRIES).**
~~Next fire Monday 22:00 UTC 07-28~~ **CORRECTED 2026-07-27 night (the sixth date-reasoning
instance — today IS Monday 07-27): Monday's 22:00Z entry ALREADY FIRED at 3:00 PM PT today
and 401'd — the entry-side evidence is in cron-job.org's execution history RIGHT NOW, no
waiting. Next fire: Tuesday 07-28, 22:00 UTC = 3:00 PM PT. The manual curl runs TUESDAY
PT morning (builds 07-28). Reopening 07-29 = WEDNESDAY.** Three checks, in order:
1. **cron-job.org execution history**, entry 1, ~3:05 PM PT: **200** = fired AND
   authenticated (rules out entry-disabled, wrong URL, missing/typo'd header — the route
   401s all of those). **401** = the entry's header (your curl already proved route+secret,
   so it localises there). **No execution row** = the entry never fired (schedule/enabled —
   not the header).
2. **Vercel log** (only if 401): the `[generate] unauthorized` line's `key=` field —
   `header-bad` = header arrived, value mismatched (typo); `none` = no header arrived
   (field not saved); `query-attempt` = it went in the query string, not a header.
3. **Landed**: `/api/board?date=2026-07-28&gen=list` non-empty — catches what a 200 can
   hide (rate-cap `skipped` if your manual curl ran within 45 min of 3:00 PM PT; run cap;
   a mid-run 502).

**MATCHED DATES for the manual pair**: `/api/generate` takes no date — it builds the PT
date at the moment it runs, and returns it as `date` in its JSON. Run it **Monday PT
morning (pre-slate, ~9–10 AM PT)** and verify with the `date` the response returns (it will
be 2026-07-28). Do NOT run it late PT evening — it would build that PT date's mostly-started
slate.

**CREDIT ACCOUNTING (verified in code)**: 401s and rate-cap skips return BEFORE the run
counter (L175) — **wrong-header retries are free**. An AUTHORIZED run consumes one of the
**3 run-slots/date** at L175 *before* spending (~120 credits at `collectSlate`) — even if it
later 502s. Manual curl (1) + Monday's cron (2) leaves one spare slot.

## ⚠️ FIRST CHECKS TOMORROW (2026-07-28) — updated order (Josh, 2026-07-27 late)
1. `2026-07-27.best/.latest` landed in `data/boards/` (the workflow FIRES — verified twice
   green; targeting is PT-yesterday by design, three TTL attempts).
2. Shadow columns on tonight's real deployed board: `sh` non-null on closed-form batter
   rows, null/absent where excluded (HRR, pitchers, unpriced rows).
3. First `close_capture` keep rate under the four-cron shape.
4. **Then the join build** (`tools/phase2_slope.py`) — first same-date join = 07-27 board ×
   07-27 close.

## ⚠️ superseded original list (kept for the trail)
1. **Did `board-archive` run at all?** It has never fired. 2 crons/day, and "designed sound" and
   "ran" are different claims. `data/boards/` on `line-history`. ⚠️ **Now with a deadline:
   `pl:board:{date}` has a 3-day TTL — if 07-27 did not archive, a manual backfill by 07-30
   is the difference between Phase 2's Series A starting 07-27 and starting late.**
2. **`props-history` fire count.** It is now **4 crons** (`0 17` with `--wait`, `0 13`, `0 23`
   fallbacks, `0 3` fold-only), down from 10. Expect 4; fewer means the queue is thinning them.
3. **Does `data/props/2026-07-27.json` carry `kind` and `fp`?** No snapshot has ever carried
   either. `python3 tools/close_capture.py --dir data/props`.
4. **Did `--wait` actually hold the runner?** The Actions log should show `waiting N min`.
5. **`shadow.umpKf` on the first 22:00 board** — non-null means `merge_prior` + the cadence
   worked; null means the context job still is not resolving umpires.

## Dated open items

> ⚠️ **CONDITIONAL STAMP (2026-07-29, owner's rule): every date below assumes collection
> continues. Measured forward burn ends the current credit cycle ~07-31 and the reset
> date is not established — until a reset lands, this calendar is ASPIRATIONAL.**
> (Same stamp atop the collection doc; the no-reset contingency is spec'd there.)
| date | item |
|---|---|
| **2026-07-29** | first bimodal-day close test (Wed). Does a split slate produce **two** closes? |
| ~~2026-07-29~~ | ~~Phase 2's sync phrase becomes the blocker~~ — **SUPERSEDED 2026-07-27: the board archive makes the join fully public** (un-blend validated to 0.29 pp). See phase2-memo's critical path |
| **2026-08-02** | Sunday keep rate: **≥90%** confirms the retime · **6–30%** means the cadence, not the hour · between = partial. Also the scheduler delay revisit (median **and spread**) |
| **~2026-07-30** | Phase 2's first slope number (≥3 joined archive days); build order in phase2-memo's critical path |
| **2026-08-03** | recompute reopening dates from 7 complete days of the new schedule · **Phase 2's first full report** (all pre-committed columns + the identification diagnostic) |
| **~2026-08-10** | re-run `tools/recency_weights.py` for ALL SIX regressions (`--market hits|tb|hr|p_h|p_k|p_outs`; 2026-07-27: form zero in all six; pitcher side season-primary at looser SEs) — cached, one command each |
| **2026-07-29 (WEDNESDAY)** | ⚠️ **BATTER MARKETS REOPEN** — D EXECUTED 2026-07-27 night (M8 shipped + HRR fully suspended): the D-card is 2 TB tickets / $14 / +2.9%. **Also Wednesday: the outs go/no-go** (build Tue, test Wed, ship Thu or suspend) |
| **~2026-08-01** | the M7/M9 reference measurement is runnable: `data/props` close fairs × statsapi boxscores → empirical `P(hits≥2 | λ band)` vs the Poisson/binomial families. ~3,500 rows already archived; no model, no secrets |
| **~2026-08-05** | re-run `tools/rung_signature.py` across the archive series — are the M10/M11 gradients and the +1.4–2.0 rung structure stable across boards? |
| **~2026-08-20** | expAB-tercile grading test reaches ~3σ (135 covered rows/day) — **decides who owns the M10 gradient** and doubles as M9's non-circular reference |
| **2026-08-06** | `pitcher_outs` first readable in Phase 2 (~3 rows/day) |
| **2026-08-09** | first HR-overround reading |
| **2026-08-14 / 15** | ~~20-board archive series~~ ⚠️ **RESTATED 2026-07-29 (before the date, not on it): the 20-board bar is NOT reachable SEGMENTED by 08-15** — vintage boundaries 07-29/07-31/08-01 cap the largest homogeneous whole-board segment at 15 (hits-family market-level: 18). Earliest homogeneous-20: **~08-17 (hits-family) / ~08-20 (whole-board)**, each slipping 1:1 per dark day; the vintage convention is load-bearing for the parameter exit, the date is not (collection-period.md, top). Clamp fixture-representativeness, range detector, ten-factor share table, crossover doctrine review move with it |
| **2026-08-15** | ICC day-level report; the HRR amendment stays **UNSIGNED** until it lands |
| **~2026-09-08** | `SUMMARY_DAYS` window first caps — any raise must land BEFORE this |
| **~2026-09-22** | parameter exit. **Bankroll exit is unscheduled and cannot be dated yet** |

## The model findings, one line each — full detail in `docs/freeze-exit-bundle.md`
| id | what | status |
|---|---|---|
| **M11** | residual +0.79 pp / 10 pts of last-30 avg (t≈9), xwOBA carries nothing — recency not skill | **RANK 1 — WHOLE-ENGINE (2026-07-27). The sim's per-PA rate is the IDENTICAL `shBlendN`→`shShrink` chain (`batVec` L2065-67), so this reaches every batter price in BOTH paths** — the pre-committed condition for outranking M8. A BUG, fourth intent-vs-behaviour instance: `shShrink`'s comment forbids hot-streak chasing but its input blend is 100% last-30 with nested recency weights (last-week AB ≈ 5.5×) and `n` overstated ~1.5× (effective 49 vs reported 75). **Fix SPECCED from measured weights (2026-07-27, branch 4)**: xBA-primary (+0.73/+0.49), windowed form **+0.05 SE 0.08** (zero), season redundant (corr 0.73 w/ xBA) — the nested blend and k=60 both go; the 'season term' shape was itself wrong. n=3,061 leak-free (`tools/recency_weights.py`); per-market re-run: form is zero in TB (−0.002) and **HR (−0.008)** too → ONE structure for batters, expected-metric-primary (xBA/xSLG/xISO). **Pitcher side (n≈265/outcome): form zero there too — SIX regressions, form zero in six — but the carrier is SEASON actual; each estimator gets its measured answer (licensing block, collection-period.md).** Blast radius = **ten `shBlendN`/`shBlend` call sites, six quantities, all four batter markets + K's + outs-via-`offense()`** (see collection-period.md); HRR-per-game and the walk channel need their own answers; re-run ~08-10 |
| **M12** | the sim path's OWN rate heat, ablated: log5+park/wind **+2.70**, TTO +0.65, static factor-set +4.3, **dynamics −0.82 (endogenous-PA hypothesis REFUTED)**, volume +1.2 → ≈ **+8.8 vs cf** on 55 fixture legs | **NEW 2026-07-27.** Independent of M11 (shared base cancels in sim−cf). HRR's +10.0 sim residual is M12-sized. M4's gate must separate it |
| **M13** | the props ARCHIVE sweep (`tools/snapshot_props.py`) requests only the six canonical keys while Caesars posts its whole hits/K's ladders under `*_alternate` (incl. the main lines) — 14 archive days read 0/7,033 (hits) + 0/830 (K's) CZ-present and the multibook memo misread that as feed coverage ("the unlock", retracted same day) | **NEW 2026-07-28, COLLECTION defect, not engine** — the engine (L1366, `SH_PROP_ALT`, and CLAUDE.md §build-44) and `sightProp` both read the alternates already; only the archive is blind. Fix = add the 3 alt keys to the sweep (+~3 credits/event), fold same-line quotes, **vintage-stamp the archive change** — awaits owner sign-off. Guard: `tests/sweep-covers-engine.test.ts`, **observed-red, NOT-YET-ENFORCING** (`it.fails`; flips with the fix). Full chain: `docs/multibook-memo.md` §2c |
| **M14** | **the allocator is NON-MONOTONE IN PRICE — mechanism ISOLATED: RANKING (owner's two control rounds, same day)**: the composition-frozen sweep is an IDENTITY (excludes an instrument defect, locates nothing — owner's catch); cap sweep: survives uncapped (+136.2→+99.0) — cap innocent; **ranking swap (`base=max(ev,0)/(dec−1)`, cap held): non-monotonicity VANISHES (+187.2→+198.2)** — price-blind ranking is sufficient, admission supplies candidates; entrants ranked 1/2/6 vs deGrom/Freeland at 7 (displacement, not cap-promotion). Negative bumps, measured wording (correction to the owner's pre-committed sentence): all below base (+121.2/+117.8/+124.9), the rise LOCAL (−1.0→−1.5, +7.1 bp). **THE ADOPTION NUMBER at the measured +1.07 gain: net −15.0 bp (uniform) / −26.5 (empirical dispersion, same sign) — the second book is NEGATIVE under the shipped allocator on this board**; the sentence leads the multibook memo. `coreEvMin=2` unmeasured (`06d3cbc`); ~~interior peak ce=30, frozen 2 ~95 bp below optimum~~ **WITHDRAWN 07-29 as SELF-GRADED** (δ=0 peak collapses under shading: ce=30 → +24.0 at −3, −96.4 at −5; peak migrates to ce=20; ceilings were enforced throughout — one bind at ce=1). **07-29 re-measures**: adoption at 200 seeds **net −26.1 [−29.4, −22.7]** (clustered −24.9 [−28.2, −21.6]; uniform −15.0 outside the CI — sign-valid, ~11 bp short; β on realized gain −12.7 bp/pp, spread = composition lottery); **adoption under A1 (paired 200, CORRECTED 2026-07-29 — the +1.9 was 60 superseded seeds, and "sequencing A1 → books" came out with it): +1.3 [−0.7, +3.3] uniform / −0.4 [−2.3, +1.5] clustered — includes zero, clustered point NEGATIVE. A1 removes the penalty; it does not establish a gain; nothing is sequenced behind it** (power at +1.3: ~3,000 boards — retirement STRENGTHENED, bundle); A1's own sweep **breaks at +2.0** (198.2 → 188.3) → narrowed to "sufficient at ≤+1.5 on one board" (bump-0: EV +187.2 > prob +126.6, **and the +60.6 gap SURVIVES SHADING 2026-07-29: +45.5 at −3, +36.6 at −5, never inverts — A1's OPERATIVE argument, `tests/a1-shade.test.ts`, one board one data vintage**); shared-game damping **0.5 chosen, unmeasured-and-implicated** (prob-ranking range 40 bp across 0→1.0) — joined the frozen table | **NEW 2026-07-28, documented defect, NO SHIP (freeze)** — n=1 board, rerun gated on credits. Fixed-card PRICE-response measurements inherit the failure mode (bundle audit). **A1 at exit sign-off carries the narrowing; A2 innocent of M14**. Multi-book adoption unsupported under either ranking (clustered −0.4) |
| **M15** | the multibook population "n=511" pooled pre+close snapshots as independent rows (362 unique, ~1.4× duplication) — TB−HRR's z≈1.9 was the artifact (deduped: 0.96); headline restates **+1.07 pre-vintage** [+0.88,+1.33] FEW-CLUSTER (11) | **NEW 2026-07-28, measurement defect, corrected same day.** Standing rule: archive populations state their snapshot-vintage rule (pre/close/dedupe) beside n. Pre = bet time (operative); close = CLV |
| **M16** | **cross-ticket same-game dependence is priced NOWHERE in production** — within-ticket IS (`simJoint`, 22/25 groups); the sole compensation is the CHOSEN damping 0.5. Measured **per pair, not as one number (owner's restatement)**: ~**1–1.5 bp per cross-ticket same-game pair at ρ≈0.1**, MC-noise-limited; the 07-26 card carries 3 pairs (≤ ~4 bp total) — the archived-board distribution is n=1 BOARD; today's board joins it. **And the damping constant does NOT compensate for dependence at all**: under ρ-stress the damp ordering is unchanged and pair counts barely move (4/3/3/3) — its 40 bp range is SELECTION quality; **its name and comment describe correlation protection it does not deliver — the recurring intent-vs-behavior shape, in the row as ordered.** A1's paired advantage survives ρ=0.20 (+22.8); on identical draws the rankings correlate at r=+0.212: composition is CHAOTIC with respect to price (M14 addendum 2) | **NEW 2026-07-29, documented, no ship** — n=1 card; re-measure on live cards when boards resume |
| **M18** | **the freeze held the CODE vintage and floated the DATA vintage all window**: priors/context read at REQUEST time on both surfaces into the rate path (L1582–1626 → `pModel`); priors move **7,240–10,041 numeric fields/day**; every cross-day comparison is cross-DATA-vintage — **14 of 21 findings downstream** (bundle). Attribution exact via the bot commit log (07-26 board = priors `b75e905` + context `3e2b93c`); fidelity replay NOT runnable (construction inputs unrecoverable). Whitelist answer: the whitelist STAYS (designed inputs); M17's guard guards CODE vintage; data vintage is tracked, never frozen | **NEW 2026-07-29 — first line of the freeze doc; no ship** |
| **M17** | **an automated writer (`engine-v2-bot`) held `contents: write` to the production branch for the entire freeze window with NO path enforcement** — 15 commits since 07-24 (daily, by design; the shadow log depends on them); whole-window census: exactly 3 data files, zero code — but that was inspection, not guard. A workflow bug or compromised action could have written engine code onto the branch Vercel builds | **NEW 2026-07-29, vintage-control defect per the owner's pre-committed branch — GUARDED same day**: `tests/bot-path-whitelist.test.ts` (bot commits ⊆ {context.json, priors.json, ump_k.json}, extracted from git, invalid-by-value plant; green on the real history). Companion: `tests/sha-references.test.ts` (doc-cited shas must resolve on origin — observed RED on 3 dangling refs the rebase left, fixed same commit) |
| **M19** | **duplicate ticket emission in `parlaysLive` + sim-gap naive pricing on the same entries** — `buildParlaySet` has no ticket-level dedupe; 07-26 archive: 22 live entries, 19 unique leg-sets (K's parlay ×3, CLE@TB Mixed ×2 — the ×2 found 07-29, same instrument); the triplicate is the board's only naive-priced same-game group (`probNaive` null, no `SIMS[gkey]`). Magnitude: 1.38% of 218 emitted tickets / 1.40% of notional / **0% of card dollars** (`shCardPool` excludes `parlaysLive`; `pred-serialize` skips it too). **Corrects the blanket "live path has no sim": 19 of 22 live tickets ARE sim-priced** — one shared `build()` path, naive only where the sim lacks the game | **NEW 2026-07-29 — display-surface defect, n=1 board, no ship (freeze)**; dedupe fix + naive-price disclosure tag are exit items (bundle row) |
| **M8** | `shTbOver` priced a 0.5 line with the 1.5 formula | ✅ **SHIPPED 2026-07-27 night** (bug-grade, sign-off D): `if(line<1)return 1-P0;` same-line at L1548; pinned test swapped WITH a reintroduction plant; `baseline43` byte-identical (`e67eaad0…` both sides — the fixture prices no TB-0.5 row). Confirm on the first post-ship board: TB≥1==H≥1 violations → 0 (were 118/127) |
| **M1** | `shParkF` never reaches the closed form — **variance not level** (+0.13% / −2.80%) | ready to spec |
| **M2 / M2′** | outs: ⚠️ **INTERLOCKED PAIR** — `0.140`→`0.400` AND the `offense()` xSLG de-noise, together or never (enforced: `tests/m2-interlock.test.ts`; `of` is a constant 0.860 today — a defect masking a defect, ±12 pp if shipped alone) | **ready once paired** (residual ±1.2 pp < 2 pp bar). Estimator specced from measured variances: cliff removed, season-anchored, **k=3.4 — k=4 was numerically right; the cliff and the league target were the defects**; spread 63–75% → 92–93% of true. Pitcher regressions (n≈265/outcome): form zero, SEASON-primary (K's +0.81, outs +0.61), whiff prior nothing. Outs needs no sim — NOT a post-freeze project; M2′ strictly-better, optional |
| **M3** | HRR λ = `rate × coorsFlag × power` — **zero site variation** | scoped |
| **M4** | sim routing, **TB and HR only** | conditional, fixture-thin |
| ~~M5~~ | sim routing for hits | **refuted** — sim mean-abs 7.1 vs closed form 5.6 |
| **M6** | K's → sim, a sixth PA outcome | contained IF the second RNG stream is used |
| **M7+M9** | Poisson-where-binomial + its compensator | ⚠️ **INTERLOCKED — never ship separately.** M9-as-uniform-λ **REFUTED 2026-07-27** (predicted +5.7 at hits O1.5, measured +1.4–2.0, shortfall t=11.1); the fixed-n binomial reference fails with it. Real rung structure **+1.4–2.0 pp**. Needs re-derivation; demoted below M10 |
| **M10** | closed-form hits residual climbs **+7.39 pp/AB of expAB** (SE 1.73); survives quality controls; **sim-priced HRR is flat** → defect locus is `λ = rate × expAB` | **PROVISIONAL — one board. Mechanism traced (2026-07-27): errors-in-variables in `bbr`** — SD(bbr) falls 0.0908→0.0545 with the denominator, full-noise slope +9.4 vs measured +7.39 (`tools/m10_eiv.py`). Fix specified: shrink `bbr` toward league (k≈75) before expAB; 0.9 untouched. Sim slot curve = pa(spot) exactly (−0.110 vs −0.11/slot), so the slot mapping is vindicated — but the sim's `pBB` consumes the SAME `bbr`, so the HRR-flat discriminator is narrowed (HRR ≈ walk-neutral) and sim-volume routing is no escape. Grading: 3σ ~08-20 |
| **A1–A4** | edge-aware base weight · leg-equivalent floor · `consMinEv` · concentration | allocation axis, own units |

## Shadow series (2026-07-27, signed off) — LIVE in the engine
Every armed closed-form batter row carries `sh:{m8,m11,m10,m1,all}` (percent 2dp; null on any
missing input; HRR/pitcher/sim-path OUT by name). Dormant board byte-identical (digest
unchanged); armed digests re-pinned with documentation (whole-board `935704…`→`c06b3a…`,
propBoard `c8c520…`→`135f58…`). The pre-committed three-branch reading is in the bundle —
written before any shadow data existed. The archive carries `sh` from the first deployed
armed board; Phase 2's exit comparison then runs both engines on the same rows, same closes.

## Deferred, written up, NOT shipped
**the pitcher-blend audit — measured 2026-07-27** (cliffs wrong, season-primary; leash noise 36–53%; remaining half = re-price outs/K's with the corrected estimator) · `pitcher_outs` `0.140`→`0.400` · everything in `docs/freeze-exit-bundle.md` · the board-archive
`gen=best`+`latest` is BUILT and running · `pen_quality` same-day replace (bounded, recorded) ·
`repository_dispatch` PAT route (**not needed** — `/api/propsnap` solved it).

## The docs, and what each is for
| file | holds |
|---|---|
| `tools/self_consistency.py` | **the independent instrument.** Logical identities on any board or the whole archive — a violation is a PROOF |
| `tools/m10_eiv.py` | the errors-in-variables stratification for M10 (slope + SD(bbr) by denominator quartile) |
| `tools/recency_weights.py` | **M11's fix gate, REPORTED**: AB-weighted WLS of realized per-AB hits on as-of (last-30, season, xBA); leak-free incl. doubleheaders; statsapi + priors git history |
| `tools/rung_signature.py` | **the rung/gradient instrument.** Un-blends any archived board (`pModel = (pO−0.65·fO)/0.35`, validated to 0.29 pp), recovers each row's λ̂, parses expAB/avg30/xwOBA from case strings, and reports the M7+M9 rung test + the M10/M11 gradients. Re-run on every archived board |
| `docs/freeze-exit-bundle.md` | **the 09-22 deliverable, in draft.** 6 model + 4 allocation amendments, each with measured effect, axis, dependencies; plus closed-with-magnitude |
| `docs/collection-period.md` | the frozen parameter table, the two exits, `mktN`, the sim/closed-form split, factor consumer table |
| `docs/harness-substitutions.md` | **the methodology rules.** Negative assertions, whole-symbol matching, guard-testing, detector blind spots, impossible branches |
| `docs/hrr-recalibration.md` | the H+R+RBI thread and its one-board/one-instrument warning |
| `docs/phase2-memo.md` | Series A/B, close quality, rung + day/night splits |
| `docs/cron-jobs.md` | every scheduler entry, the measured delays, the weekend route |
| `docs/multibook-memo.md` | **the multi-book scoping memo (2026-07-28, corrected three times same day)**: feed census (only BetMGM of five targets; DK/FD NOT playable from NV — verified); THE PLAYABLE PRIZE **+1.01 pp/leg / +1.60 pp per 3-leg slip** (one book per slip), 44%/51% improved — dispersion, not a better book, **stamped canonical-key population (pre-M13)**; §2c = **M13** (the "unlock" retracted — archive request-list gap, not feed coverage); the in-frame crossover correction (3.05 → **3.15**, `docs/singles-vs-parlays.md`); the CLV coupling RUN (38/319 props + 14/14 ML discards carried computable fairs; 47 panel signatures / 111 rows); Circa one-paste-day spec; sb schema; freeze posture execution-change |
| `docs/pitcher-outs-audit.md` · `docs/singles-vs-parlays.md` | the two completed audits |


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
`/api/generate` is **out of `vercel.json`** (as of `3a6ce68`); `/api/calibrate` `30 9 * * *`
remains. The generate split lives on **cron-job.org** (custom headers; free tier 100/day, CLV
job uses 96): weekday `0 22 * * 1-5`, Sat `0 18 * * 6`, Sun `0 17 * * 0`, Sun `30 22 * * 0`.
Josh creates and owns those entries — he types `CRON_SECRET` into the `x-cron-key` header
himself. Full rationale, hour-by-hour schedule sample and the dated revisit item:
`docs/cron-jobs.md`.

**GitHub Actions schedules are unreliable and it is measured, not suspected.** Over 15 days
via the Actions API (workflow `311636390`, 30 runs, all `event: schedule`): `0 17` actually
started ~20:20Z (**+3.3 h**) and `45 22` ~07:30Z the *next day* (**+8.75 h**). Single ticks are
also sometimes skipped. Any GitHub-scheduled job that must land in a window needs either
script-side self-pacing (`tools/snapshot_props.py`) or a window wide enough that punctuality
does not matter (`tools/archive_boards.py`). Never assume a cron fired when it says.

## Retention — what survives, and for how long
| store | retention |
|---|---|
| `pl:board:{date}` / `:{at}` / `:gens` | **3 days** (`EX 259200`) |
| `pl:pred:{date}` (index `pl:pred:days`) | **permanent — nothing is ever pruned** |
| `line-history` branch (git) | permanent |
| `pl:ledger:v1` | permanent |

**`SUMMARY_DAYS = 45` is a READ window, not a prune** — an earlier note in this file said
"prunes at 45 days" and that was wrong. `pl:pred:{date}` is a plain `SET` with no TTL; nothing
`DEL`s it or `SREM`s the day set. What slides is `allDays.slice(-45)` in `/api/calibrate`.
Collection period = 60 logged dates (`CAL_START` 2026-07-25 → freeze exit ~2026-09-22), so from
**2026-09-08** the summary stops covering the start of the period, and at exit it would read
**2026-08-09 → 09-22**, dropping 15 dates. Fixed 2026-07-27 by splitting the channels:
`summary` (45 dates) still trains the blend weights, byte-identical; **`summary.full`** covers
every eligible date and is the reading. Both stamp `.window`. Raising `SUMMARY_DAYS` itself is
a frozen-parameter call and, if ever taken, must land **before 09-08**, not at exit.
`tests/calibration-window.test.ts` pins all of it.

## The freeze has TWO exits — do not conflate them
**Exit 1, the PARAMETER exit, ~2026-09-22, on schedule.** Decided by Phase 2's rung-bucketed
movement slope (board-wide, close-graded, needs no bet). A positive result licenses the
amendment bundle — leg-equivalent EV floor, `consMinEv` scaling, edge-aware base weight, HRR
clamp — and **nothing about P/L, bankroll or `consMinN`**. Binding qualifier: **an attenuated or
collinear fit is NO RESULT, not a negative one**; only a negative *with the identification
diagnostic showing power* licenses stopping.
**Exit 2, the BANKROLL exit, UNSCHEDULED.** Needs the ledger (P/L, CLV-on-bets, Discipline),
which reaches 09-22 at **n≈0** because markets reopen 08-08 → 09-03. Cannot be dated until the
post-reopening bet rate is observable, mid-September at the earliest. **Deciding both on one
date means deciding the second on n=0 — the exact error this freeze exists to prevent.**
Consequence: **close-capture rate is the whole health story.** `tools/close_capture.py`.

## ⚠️ WHAT THE PARITY BASELINES ACTUALLY COVER
`digest()` (`tests/helpers/fixture-env.ts`) serialises **`categories`, `categoriesLive`,
`parlays`, `parlaysMixed`, `parlaysLive`** and nothing else. So `baseline43.json` and
`baseline-armed-v1` say nothing about **`gameInfo`, `propBoard`, `simMarkets`, `luCoverage`,
`overview`, `liveGames`, `trap`, `passes`** — a change to any of them passes both baselines
untouched. `propBoard` alone is 35% of the blob and is the population the ladder test and the
range detector run on. **Every "parity is byte-identical" claim in this phase is a claim about
picks and tickets, not about the board.** Only `tests/clamp-instrumentation.test.ts` hashes the
whole object.

## `clampActivity` — the board carries its own clamp audit (2026-07-27)
`shClamp(v,lo,hi,id)` takes a 4th arg = **the call site's LINE NUMBER**, so the ids aggregate
exactly as `tests/clamp-activity.test.ts`'s stack-based instrument does and the two can be
diffed (they agree on all 25 sites, every count). Inert unless `SH_V2.clampLog` — armed in
**`/api/generate` only**, so the app's board is unchanged. Emitted as `data.clampActivity =
{lineNo: {bounds,n,lo,hi,mid}}`.

**Never add or remove a line at or above `legacy/index.html` L2402** without re-baselining
`tests/fixtures/clamp-activity-v1.json` — the site keys ARE line numbers. All three structural
edits (L1540 `shClamp`, L2004 `shAnalyzeLocal`, L2880 the return object) were made **in place**;
the file is 4,205 lines before and after.

**Parity evidence** (`tests/clamp-instrumentation.test.ts`): `baseline43` and
`baseline-armed-v1` both identical, plus whole-board md5s minus the new key —
`942ab102372e369cff0e35bd729a6147` (dormant) / `935704d7c8656aa667b015b804b0778f` (armed),
captured from the pre-change engine. Those are the load-bearing ones: `digest()` covers only
`categories`/`categoriesLive`/`parlays*`, so a change to `gameInfo`/`propBoard`/`simMarkets`/
`luCoverage`/`overview` would pass both baselines untouched.

## `mktN` — the gate that decides NO-PLAY
`mktN[m] = summary.reliability[m].n`. Under `consMinN` (**100**, frozen) every ticket in that
market must also clear the de-vigged consensus — that is what blocked all 18 tickets on
2026-07-26. Eight inputs, audited 2026-07-27 (`docs/collection-period.md`): the window, the
blob, `CAL_START` and `gradedFromBlob` are test-covered; **`boardToPredictions` row VOLUME has
no assertion**, and **`GRADE_DAYS = 6`** + **`MAX_RECORDS 800`/`MAX_BYTES 3 MB`** have nothing
at all — all three fail by producing a smaller `n` than reality, i.e. they push reopening dates
out silently. (`hist` is capped at `HIST_MAX = 4`, so the four scheduler entries do not grow
the blob without bound.)

**Reopening dates are recomputed nightly** into `summary.reopen` and printed by
`tools/gate_activity.py` with `rateDays` as its denominator. Measured 2026-07-27 (graded=70
over 2 complete dates): ML/RL 08-08, **Total Bases 08-17**, Hits/HR/H+R+RBI 08-23, K's/Outs
09-03. The docs previously said TB 08-06 and Hits 08-09 — **11–14 days optimistic**, projected
once from an assumed rate. Never re-introduce a hand-projected date; `reopenDays()` returns
`null` (not a far-future date) when a market accrues 0/day, because 0/day is a broken logging
path, not a schedule.

**`/api/generate` gate order** (fixed 2026-07-27): `ptToday` → **conditional skip** →
`INCR` run cap → `K_LASTGEN` → arm → `collectSlate()`. The cap used to `INCR` *before* the
skip, so a skipped fire spent budget it spent no credits on and a day with two skips plus a
manual regenerate 429'd the third real fire. The `INCR` sits immediately **before**
`collectSlate()`, never after — `collectSlate()` can spend credits and then throw (60 s
`maxDuration`, ~15 games × 6 markets), so counting afterwards would leave the ceiling unbounded
exactly when it is needed. Both counters are pessimistic on purpose.

**Board archive** (`tools/archive_boards.py` + `.github/workflows/board-archive.yml`, built
2026-07-27) → `data/boards/YYYY-MM-DD.{best,latest}.json.gz` + `index.json` on `line-history`.
Runs `0 12` / `0 19` UTC targeting PT **yesterday and the two days before** — the 3-date window
is the delay tolerance, not the clock. Zero Odds credits, no secret (`/api/board` is ungated).
**1.36 MB raw → 150 KB gzipped** per board (an earlier 62 KB estimate was 2.4× low). Both
generations are archived because `latest` is what a bet was placed from and `best` is what
analysis needs; on single-generation days the two files are byte-identical and **git stores one
blob** — which only works because the script gzips with `mtime=0`. `2026-07-26` backfilled
(`1e77c9d`); **07-25 and 07-24 were already expired.** The ≥20-board threshold lands
**2026-08-14** at the earliest.

## context.json MERGES — never replace a populated field with null
`tools/build_context.py` used to write a fresh object over the file. `officials` post only near
first pitch, so the **evening** run resolves 11–15 of 15 umpires and the **next morning's** run
overwrote them with nulls — every day. Git history: 20:xx commits carry 15/15, 14/15, 5/5,
14/17…; each following 07:xx commit carries 0/N. **The input was never missing; the write was
destroying it.** Fixed by `merge_prior()` — populated never replaced by null, **scoped to the
same `date`** (carrying yesterday's umpire onto today's game would be a *fabricated* input,
worse than a missing one), covering `bullpen_last3`/`pen_quality` too because **`shPenF` is
100% live in production**. `tools/test_build_context.py` — 7/7. The whole window is recoverable
from the 20:xx commit of each date; no backfill run yet.
Under the new schedule **Mon–Fri 22:00 and Sun 22:30 read a populated context; Sat 18:00 and
Sun 17:00 do not** — hence the added `0 12` cron. `shUmpKf` stays **B PINNED** (I briefly and
wrongly reclassified it A STRUCTURAL off the morning file).
Write-path audit: `data/ump_k.json` is an accumulator with two idempotence guards (**safe**);
`data/pen_quality.json` merges per day but **replaces same-day** (bounded, recorded, unfixed).

## ⚠️ A NEGATIVE ASSERTION THAT MATCHES NOTHING PASSES SILENTLY
Positive assertions self-correct; negative ones fail silent. Every source-scanning negative is
`not.toMatch(/\bname\s*\(/)`, never `not.toContain("name(")`. **Every loop-based assertion
carries a non-empty guard IN PLACE**, not in a sibling test. **Strip comments by parsing**
(`/\/\*[\s\S]*?\*\//g`), never by sniffing line prefixes — a wrapped line in a block comment has
no leading `*`. Measured 2026-07-27: 7 whitespace-defeatable negatives across 4 guards, 3
vacuous loops, and `no arming path touches summary.full` had **iterated zero times since it was
written** — its file list omitted the only file containing a literal `.full`. It never worked,
and only a `mentions > 0` counter found that.
⚠️ **AND IT REPRODUCED ONE TURN LATER.** The first `tests/self-consistency.test.ts` asserted the
M8 identity across fixture players and passed green on **99 players, ZERO carrying both rows**.
Knowing the rule did not prevent writing the defect. **Assert on a PURE FUNCTION when one
exists** — `shTbOver` needs no board, no overlap and no slate.
**Stated plainly (2026-07-27, Josh's call): written rules have not been sufficient in this
project. What has stopped a defect class recurring, every time, is an encoded invariant (a test
that fails) or a measured check (a number that must be produced).** The rules 1–22 below are for
diagnosis speed; a finding is only CLOSED when it names its test or its measured number. Full
statement at the top of `docs/harness-substitutions.md`.

## Seven build-enforced guardrails — the build refuses unanswered questions
`tests/hrr-suspension-coupling.test.ts` (the suspension is MODE-CONDITIONAL: under every
production-reachable arming mode — extracted from source, never hardcoded — the pool and FUN
carry zero HRR legs; the PLANT proves the legacy posture still shows them, so the check can
see a bar-less world) ·
`tests/doc-structure.test.ts` (the docs ARE memory: every referenced amendment id has a bundle
row + vintage stamp, every bundle row a measured effect, every rule reference resolves, every
dated item a trigger. Its first scanner baked the valid ids into the regex and could not see a
planted unknown id — caught ONLY by the end-to-end break test, third guard to fail its teeth test) ·
`tests/m2-interlock.test.ts` (M2 ships whole or not at all: the 0.140 era is pinned; a changed
constant demands de-noise evidence inside `offense()` — the lid-coupling pattern) ·
`tests/retraction-markers.test.ts` (every retraction-marked paragraph in the five finding docs
carries a YYYY-MM-DD; the naive scan was 65% false positives, the enforced narrowed rule was
measured clean; 12 pre-existing undated retractions were dated from `git log -S`) ·
`tests/workflow-timing.test.ts` (every scheduled workflow classified SENSITIVE/INSENSITIVE with
a named, existing guard) · `tests/factor-classification.test.ts` (every identity-fallback factor
classified PINNED/DATA-DEPENDENT/STRUCTURAL, registry kept equal to `factor_activity.py`'s
`FACTORS`) · the stale-summary stamp in `tests/calibration-window.test.ts` (every persisted
aggregate carries `at` **and** `rev` = the commit sha). **The factor guard found the eighth
factor on its first run — `shPriorKf`, absent from every registry, doc and drift check.**
**When adding a guard, break the thing on purpose and watch it fire** — two of these three
initially passed against a deliberately broken input (substring matching, and a line-window
scan bleeding into the next function).

**PLUS ONE NOT-YET-ENFORCING (2026-07-28, owner's classification — it is not the eighth
guard yet)**: `tests/sweep-covers-engine.test.ts` (M13: sweep market list ⊇ engine's, both
extracted from source). Status: **observed-red** (run as a plain `it` it fails printing the
three missing alt keys) but committed as `it.fails` — it documents the open defect and does
NOT fail the build on it. **The condition that flips it to enforcing: the alt-key fix
commit edits `MARKETS` and flips `it.fails` → `it` in the same change** — which waits on
the burn plan (collection-period.md), not on its own four prerequisites.

## ⚠️ EVERY CRON IS LATE, AND HOURLY ONES ARE DROPPED — enforced by test
Every scheduled workflow carries a `# TIMING: SENSITIVE|INSENSITIVE` marker;
`tests/workflow-timing.test.ts` fails the build if one is missing, if a SENSITIVE workflow names
no guard, or if the named guard no longer exists in the file it claims. **A new scheduled
workflow fails until classified** — the fifteen-day miss happened because nobody was asked.
SENSITIVE: `props-history` (`_snapshot_kind`), `context` (`merge_prior`), `board-archive`
(`WINDOW_DAYS`). INSENSITIVE with stated reasons: `line-history`, `model`, `hr-overround`,
`ufc`. When adding a guard symbol to the registry, **include the trailing `(` or `= `** — without
it a rename still substring-matches and the check silently passes (found by testing the test).
**`props-history` is now 3 crons, not 10**: `0 17` runs `--wait` and holds the runner until the
close window opens (`MAX_WAIT_S` 300 min vs GitHub's 360-min job ceiling; `timeout-minutes: 330`).
**Weekend closes are unreachable from Actions** — windows open 16:00–18:35Z, between the two
batches, and the wait exceeds the job ceiling. **Solved without a PAT:** `/api/propsnap` stores
the RAW odds payload (cron-key gated, existing `CRON_SECRET`) and `snapshot_props.py --fold-only`
de-vigs it later through the SAME `compact()` — one implementation, not two. Read path ungated
like `/api/board`. Josh adds `0 16 * * 0,6` (and ideally `0 15 * * 3,4` for the Wed/Thu matinees).
⚠️ **`0 16 * * 0,6` was the WRONG placement** — measured 14.9% of weekend games. One fire covers
95 min; a weekend slate spreads 2.6 h. Correct entries: **`0 17` + `30 18` Sat/Sun = 52.9%**,
pooled 64% → **77%** (not the ~99% first projected). A third fire would exceed cron-job.org's
100/day free tier — CLV uses 96, Sunday's 2 generate + 2 propsnap = exactly 100.
`/api/propsnap` decides `kind` from the slate; the first version hardcoded `"close"`, which
would have put a 4-hour-out capture in Phase 2's clean bucket.
**Close coverage from the single 20:30Z fire is 64% of all games** — Mon/Tue/Fri 96–99%, Wed 65%,
Thu 56%, Sat 49%, Sun 7% — so "Mon–Fri = true close" is wrong and the gap is **36% of games, not
29% of days**. The 300-min wait cap never binds; every loss is a game already started at fire time.
**Phase 2 buckets every row by `kind` (close/pre) and never pools across it.**

**TEN identity-fallback factors, not seven.** `shPriorKf` returns 1 (**87% live**, K's rate);
`shParkF` (**92% live**) and `shPitIsoF` (**100% live**) return **null** and let the CALL SITE
supply identity, so no source scan could ever find them — only measured live share does. A scan
for `return 1` finds one spelling; match the CONTRACT. ## ⚠️ THE FIXTURE HAS ALREADY FAILED — relabel now, not on 08-15
`batter_hits` cf−market reads **−4.3 pp on the fixture** and **+0.3 pp on the real board** — a
4.6 pp disagreement on the exact quantity M7 was built to explain. Fixture propBoard vs real:
HR 5.8× · **outs 6.0×** · hits 9.2× · TB 9.3× · K's 14.1× · **HRR 21.7×** thin.
**PROVISIONAL (fixture-measured):** the sim-vs-closed-form disagreement, **the external check that
killed M5 and set M4**, the clamp audit, the shrink k audit.
**NOT provisional (real board):** M8, the ladder finding, the outs audit, the park and factor
consumer tables, `expAB` median 4.1. **Parity/byte claims are unaffected** — determinism is not
representativeness. The dividing line is *does the CONCLUSION depend on the fixture resembling
production*, not *was a fixture involved*.

## ⚠️ PHASE 2 NO LONGER VALIDATES ITSELF
M8 voids TB's over-dispersion, which was the **opposite-signature arm** that made the rung test a
test of the instrument. Branches 2–4 of the five-branch table are **unreachable — all three need
two markets**. Only "HRR flips + → −" (confirms) and "does not flip" (retracts) remain.
Candidates to restore it: **TB re-run after the M8 fix** (frozen, so post-exit), `batter_hits`
(no — +0.3 pp, no rung structure), `pitcher_outs` (predicts + → −, the SAME direction as HRR, so
it doubles the arm rather than balancing it). **Recorded as a capability the project had and lost
to a bug fix**, not quietly dropped.

## 🐛 `shTbOver` PRICES A 0.5 LINE WITH THE 1.5 FORMULA — a definite bug (M8, rank 1)
`if(line<2)return 1-(P0+P1*s1);` — the comment says the branch is for 1.5, and `line<2` catches
0.5 too. That expression is **P(TB≥2)**; P(TB≥1) is just `1−P0`, because a single IS one total
base. **Proven with NO external reference**: TB O0.5 and hits O0.5 are the same event, and on 127
joined rows of the real board the **market prices them 0.1 pp apart while the model prices them
24.4 pp apart** (33.6% vs 58.1%). 150 rows on `propBoard`. Fix is one comparison:
`if(line<1)return 1-P0;`. **Likely collapses the open TB 2.30 over-dispersion** — a rung priced as
the next one up inflates apparent λ-drift; confirm by re-running the ladder test without the 0.5
rung. Frozen: freeze-exit amendment.

## 🔬 SELF-CONSISTENCY — the independent instrument, and it is free
`tools/self_consistency.py` + `tests/self-consistency.test.ts`. Logical identities between two
prices the model itself emits: **TB≥1 == H≥1** · HRR≥1 ≥ H≥1 · HRR≥1 ≥ HR≥1 · **HRR≥3 ≥ HR≥1** ·
H≥1 ≥ HR≥1 · TB≥2 ≥ H≥2 · ladder monotonicity in all six markets. **A violation is a PROOF, not
evidence** — no market, no fixture, no accrual. On the real board: **one violation, and it is M8**
(118 of 127 at −23.4 pp model vs −0.5 market); everything else clean on both sides.
**Boundary scan complete: ONE mismatch in the whole pricing path** — L1548 `if(line<2)` with a
comment saying 1.5. L1549 and L2241 are correct.
⚠️ **Encoding it reproduced the vacuous-pass defect one turn after writing the rule** — the first
version looped over fixture players and found **99 players, ZERO with both rows**. Fixed by
asserting on the pure function. **The test PINS THE DEFECT, not the fix** (M8 is frozen), with the
correct assertions commented beside it — same treatment `pitcher_outs` gets.

## M7+M9 — AN INTERLOCKED PAIR, never ship separately
`shPOver(0.5, λ) = 1 − e^{−λ}` with `λ = rate × expAB × hF`. But λ is a MEAN COUNT over n at-bats
at per-AB rate p, and **`(1−p)^n < e^{−np}` for every p ∈ (0,1)** — Poisson spends mass on
two-or-more hits *in one at-bat*, which cannot happen, and it comes straight out of `P(≥1)`.
Rung signature: **−4.9 / +0.5 / +2.8 pp** at O0.5 / O1.5 / O2.5 — a **− → +** flip growing sharply
after the first rung.
⚠️ **BUT PRODUCTION SAYS IT IS NOT HAPPENING.** On the real board, `propBoard`, both sides
unselected: `batter_hits` O0.5 median **+0.3 pp**, under-has-edge **47%**; all 0.5 lines **+0.6 pp
/ 46%**; higher rungs **+1.1 / 46%**. No level bias, no flip, no side skew.
⚠️ **The −4.3 pp that motivated M7 was a FIXTURE ARTIFACT** — the real board reads +0.3 on the
same statistic. Fixture and production disagree by 4.6 pp on the exact quantity M7 explains.
`expAB` recovered from 45 `case` strings: median **4.1** (3.5–4.5), so the +4.8 pp error is at REAL
parameters, not a grid artifact. Net output +0.3 ⟹ **≈+4.5 pp of compensation exists**; as λ that
is **+13.9% inflation** — **M9**. ⚠️ **The obvious check is CIRCULAR**: `λ = −ln(1−P)` is a monotone
transform of P, so "model λ − market λ" is just "model P − market P" restated, and it read −1.8%
looking like a refutation. **M9 cannot be localised until graded hits accrue** — the market gives a
probability, not a mean. **M7 and M9 ship together or not at all**: fixing either alone moves 617
rows ~5 pp the wrong way, and the cancellation is only known over λ≈0.96, expAB 3.5–4.5 (the error
runs +5.7 at n=3.5, +4.3 at n=4.5 — not flat).
**PARTIALLY LOCALISED 2026-07-27 (`tools/rung_signature.py`): M9 is NOT a uniform λ inflation.**
Uniform +13.9% predicts +5.7 pp at hits O1.5; within-player Δmeasured is **+1.4–2.0**; paired
shortfall **+4.35 pp, t=11.1, n=17**. No uniform inflation fits both rungs over a fixed-n binomial
truth — so the *reference distribution* fails too: the market prices hits ~70% of the way from
fixed-n binomial to Poisson (random AB counts + p heterogeneity do exactly that). Both M7's −4.9
and M9's +13.9% were computed against a reference the market refutes. Re-derivation must treat
the truth distribution as an output of grading, not an assumption. The 617-row blast radius of
shipping either half alone is unchanged. Full write-up in `docs/collection-period.md`; the
residual's real structure is M10/M11 (the expAB and hot-form gradients), not a level.
⚠️ **The side-bias check nearly went wrong the same way:** the first cut used `categories` and read
118/118 OVER at 0.5 lines — meaningless, because `categories` ranks by win probability and the
over IS the likelier side at 0.5. **Fourth time that population has produced a confident wrong
reading.**
**The two paths bracket the market for DIFFERENT reasons**: the closed form has the wrong
distributional family; the sim uses the right one and overshoots +5.0, leading candidate being the
**endogenous PA count** (a batter's PAs depend on how the lineup performs, so a hot offence raises
`P(≥1)` twice over). **They share the base EXACTLY** — same `shBlendN(…,"ab",10)`, same
`shShrink(k=60, shPriorH)`. **So no blend of the two is the right answer.** This is M7 and it
touches every 0.5-line market priced by `shPOver`; blast radius unmeasured.

## ⚠️ ANY NEW DRAW INSIDE THE SIM USES A SECOND GENERATOR — NEVER THE PRIMARY STREAM
`rng = shMulberry(seed)` (L1829) is deterministic; every simulated outcome is a POSITION in it, so
one added `rng()` call shifts every subsequent draw and rebaselines the whole sim plus both parity
baselines. Draw new features from a **second, independently seeded generator**.
Pinned by `tests/sim-rng-stream.test.ts`: **11 generators, 3,379,570 primary draws** on the armed
fixture. Verified to fire — a planted draw reported 5,114,365. The warning is also **on L1829
itself**, edited IN PLACE (a test only fires when run; the comment is what the next editor sees).
⚠️ **Never add or remove a line at or above L2402** — `clampActivity` site ids ARE line numbers.
`legacy/index.html` was 4,205 lines through the audit phase; **4,247 as of 2026-07-27** (the shadow-price block). The REAL invariant is not the count: **never insert or remove a line at or above L2402** — clampActivity site ids ARE line numbers and the last site is L2402. Insertions strictly below it are safe and verified by the clamp tests.

## ⚠️ THE SIM COMPUTES FOUR MARKETS AND THE LOOP READS ONE
`SIM_STAT` (L2045) maps hits/TB/HR/HRR; legs are pushed for all four (L2138); `legP` is populated
for all four; **L2394 reads only `mkt==="batter_hits_runs_rbis"`.** On the armed fixture `legP`
holds **96 HR + 57 hits + 30 TB + 13 HRR — 183 of 196 batter legs simulated and discarded every
run.** The sim also threads **starter outs** (`outsBySP*`) against the leash and discards them.
It does **not** model strikeouts at all (an out is undifferentiated), so K's are re-architecture.
**Sim minus closed-form `pModel`:** hits +9.2 pp median, TB +5.0, HR +1.2, HRR 0.0 (control).
⚠️ **THE EXTERNAL CHECK INVERTS THIS.** Against the market fair on `propBoard` (both sides):
`batter_hits` sim **+5.0 / meanAbs 7.1** vs closed form **−4.3 / 5.6** → **CLOSED FORM CLOSER,
sim routing REFUTED for hits.** TB: sim 5.7 vs cf 6.3 (sim, marginal). HR: 3.5 vs 3.5, sim better
centred. **A magnitude is not a direction of correctness** — the closed form undershoots market
and the sim overshoots, so routing swaps one error for a larger one on the biggest market.
**The 0.0 HRR gap is a TAUTOLOGY** (`pO` already IS the sim value), not evidence the sim
reproduces the flat λ — the ladder split (sim 0.76, closed form 0.00) says the opposite.
**`pitcher_strikeouts` → sim is CONTAINED, not re-architecture** — a split of the existing
out-branch (`pK_given_out = pK/(1−Σv−roe)`, no sixth vector element), and it *fixes* a small
existing error (a K currently can produce a sac fly or GIDP). ~10 lines, no cascade into
leash/hook/bullpen. **The trap is RNG stream consumption**: a naive `rng()` inside that branch
shifts every downstream draw and rebaselines the whole sim. Use a **second independently seeded
generator** and it is additive and parity-checkable like `clampActivity`.
**Full draft bundle: `docs/freeze-exit-bundle.md`** — 6 model + 4 allocation items, each with
measured effect, axis and dependencies, plus the closed-with-magnitude list.

**Amendment bundle is on TWO axes** (model in pp, allocation in bp) and the model ones OVERLAP —
**sim routing subsumes `shParkF` routing** for any market it covers. Order in
`docs/collection-period.md`; the outs constant swap stays the recommendation with sim routing as
the strictly-better option, cost stated.

## ⚠️ THE SIM PRICES ONE MARKET — H+R+RBI, and only 33 of its 50 rows
L2393 applies the `sim` tag **only** inside `if(simP && mkt==="batter_hits_runs_rbis")`. Measured
07-26: hits 0/50 sim, TB 0/50, HR 0/50, HRR 33/50, K's 0/35, outs 0/38. **84% of batter rows and
100% of pitcher rows are closed-form**, so `shParkF`/`shPitIsoF`/`shPenF` reach **16.5% of batter
rows and no pitcher row ever**. This is NOT a lineup-coverage problem — `luCoverage` was 13/15
that day and hits/TB/HR were still 100% closed-form. **A perfect retime takes 84% → ~68% and
leaves pitcher markets at 100%.** Implied park error on a closed-form row: hit rate median 1.5%
/ max 3.5%; **HR rate median 4.5% / p90 11.0% / max 14.5% (PNC)**. `batter_home_runs` bleeds most.

## `pitcher_outs` CAN BE ROUTED THROUGH THE SIM — the answer already exists and is discarded
`halfInning` threads `outsBySPHome`/`outsBySPAway` through every half-inning against
`ctx.homeLeash`/`ctx.awayLeash` (L1854–1855, L1864–1871) and **never surfaces them**. Collecting
them is plumbing, the same shape as `legP`. **The sim already models the hook** — the machinery
the outs closed form structurally cannot use. So the outs amendment is a CHOICE between the
constant swap (`0.140`→`0.400`, repairs the closed form) and sim routing (replaces it), not a
sequence. **`pitcher_strikeouts` is the opposite: re-architecture.** `batVec` returns
`[pBB,p1,p2,p3,hr]` — an out is undifferentiated, there is no K anywhere, so K's would need a
sixth outcome and full re-validation.

**`shLaborF`'s dead zone is by design and correctly centred** — 141 starters, median 89.7 ppg,
bands at ~p17/p78, 62% inert. Not the `g>=5` shape. Its lever is −4%/+2% on 38% of starts, which
is too small to be an outs mechanism; checked and closed rather than left on the list.

**Ten factors, and only TWO reach both pricing paths** (`shPitPctF`, `shTempF`). SIM-ONLY:
`shParkF` 92%, `shPitIsoF` 100%, `shPenF`, `shPenQF`. CLOSED-FORM-ONLY: `shPriorKf` 87%,
`shOppWhiffF`, `shUmpKf`, `shLaborF` 30%. **Every closed-form HITTING price is built without a
venue term** — hits, TB, HR and HRR alike — and `batter_total_bases` (open 2.30 over-dispersion)
has a `tbF` that cannot distinguish 29 of 30 parks. `factor_activity` measures whether a factor
RETURNS a value, never whether it REACHES a price; that gap is the fifth blind-spot instance.
**Both are SIM-ONLY** — `parkH`/`parkHR` appear
at exactly one place, L2062 inside `batVec`. **The CLOSED FORM has no real park factor at all**
(L2326: only a binary Coors flag), and **H+R+RBI's closed-form λ is `rate × coorsFlag × power`**
— no park, no wind, no platoon, not even the `hF`/`hrF`/`tbF` its siblings use. On 2026-07-26 Colorado played AWAY, so `coors` was false on
all 15 games and the closed-form HRR λ was exactly **`rate × power`** — `power` varies by
opposing starter and by NOTHING else, so the λ had **zero** site variation. `shParkF`'s unused
spread is 0.145 (hits) / 0.305 (HR). The conditioning defect sits **underneath** the single-λ
ladder diagnosis and is the larger term — a family limitation produces *some* drift, a flat λ
produces the measured +0.001. Phase 2 separates them by bucketing on the sim/closed-form tag.
That is a traced mechanism for BOTH open HRR findings: it predicts the measured closed-form ladder drift of +0.001
vs the market's +0.479, and the +11.5 pp / −1.4 pp rung signature. 17 of 50 HRR rows (34%) are
closed-form. Hypothesis until Phase 2's rung test; nothing changed.
**Correction: `shPitIsoF` does NOT discard park/wind** — L2086 keeps `wind.f*parkHR*pl.hr` and
drops only `power`/`pq`/`bpF`, which L2077 documents as deliberate anti-double-counting. The ten-factor share table joins the 2026-08-15 archive
reading — the fixture cannot answer it.

Measured across all six scheduled workflows (Actions API, 14+ days). **Two properties, not
one:** low-frequency schedules (2/day — `context`, `props-history`) fire **every tick** but
**+3.1–3.9 h** on the daytime cron and **+7.8–10.0 h** on the late one; the **hourly**
`line-history` (`12 * * * *`) actually runs **3–5 times a day — ~17% of ticks**, minute ignored.
`model` (`30 9`) lands 12:09–17:24. **The configured hour has never been the observed hour on
any workflow** — any analysis using a cron time as a timestamp is wrong by +3 to +10 h.
`board-archive` is 2/day and window-based (targets PT yesterday + 2), so lateness is absorbed
by construction; the thing to verify is that it **ran at all**. `props-history` just went 2/day
→ 10/day and is untested against the dropping property — **expect 10 runs, under ~7 means the
redundancy is being eaten.**

## Consensus depth rises toward first pitch — but thinness does not move
Props archive, 13 days, by hours-to-first-pitch: mean `n` **1.23 (18–20 h out) → 1.70 (2–4 h)**,
and `czf` (Caesars inside its own fair) peaks at **6.3% at 8–10 h** and is ~0 inside 4 h. So the
16:00 → 22:00 retime buys **+13% depth and eliminates `czf`** — but **`n ≤ 1` is flat at 54–55%
at every horizon**, so it does not fix thin consensus. `booksInd == 0` baseline on the 16:46 UTC
board: **54 of 303 rows (17.8%)**, 16 of 196 tickets; the 22:00 comparison lands with the first
retimed board.

## Wed/Thu/Sat are BIMODAL, Sunday is SHIFTED — different fixes
First pitch by DOW, 52 days, **hours wrapped at 12:00 UTC** (an unwrapped column makes Monday
look 45% early when it is 1%): Mon/Tue/Fri are a single night block (1–4% started by 22:00);
**Wed 35%, Thu 46%, Sat 51%** started by 22:00 with a getaway-day matinee block at ~17:12 plus a
night block at ~23:00, separated by 1.1–2.4 h; **Sunday is 93% started by 22:00 in one tight
block** (p10 17.6 → p90 20.2). One earlier sweep fixes Sunday; **Wed/Thu/Sat need a second
sweep** — no single hour serves two blocks.

## The props archive is START-TIME SELECTED — check before using it
`data/props` takes two readings; the later one fires ~20:08–20:55 UTC and games already
underway are gone from the odds API. Kept games median first pitch **22.68 UTC** vs **18.18**
for dropped. Keep rate by day: Mon 100%, Tue 94%, Fri 93%, Sat 68%, Thu 50%, Wed 43%,
**Sun 3/45 = 6.7%** (2026-07-19 kept 0 of 15). **Series B's movement population is night games
and Sunday is effectively absent.** The near-empty days (07-14, 07-16, 07-23) are real
All-Star-break slates, not archive failures — snapshot 1 captured every game every day.

**Recompute a statistic on both populations before caveating it.** Measured: the 1.071
overround is invariant (1.0713 vs 1.0713), the `lockMaxAgeMin` movement percentiles come from
the denser game-lines archive and are unselected, the 0.26 pp recovery error is board-derived.
Only consensus depth moves — mean `n` 1.40 → 1.66, `czf` 2.2% → 0.3% — and it moves so that the
later reading **understates** the thinness, so that finding is conservative, not overstated.
2026-08-02 is the pre-committed test of whether the retime fixes Sunday
(`tools/close_capture.py` prints the branches).

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
denominator of every number. He catches unreconciled tables — if two of your figures disagree on
the same cell, that is the finding, not a rounding issue. **Each turn opens with "Push `<sha>`"**;
he pushes the previous commit, so commit and hold rather than pushing unasked.

**Test reporting:** run the suite, quote that run's numbers, and if anything is red say so at the
top of the message before any finding. Never loosen a strict assertion to make it pass —
`toEqual` catching an added field is the assertion working.

**Close an item with a VERDICT AND A MAGNITUDE, never a verdict alone.** A verdict cannot be
re-checked and this project has reopened three closed threads. `docs/freeze-exit-bundle.md` keeps
the closed list in that format.

## The methodology rules — full text in `docs/harness-substitutions.md`
1. **A negative assertion that matches nothing passes silently.** Positive assertions
   self-correct; negative ones do not. Anchor every symbol; guard every loop for non-emptiness
   IN PLACE. *(This is the top rule — it explains a whole class.)*
2. Diff two things that should be identical.
3. Anything that can return an identity value must be observable.
4. **A filter chain must be RUN, not reconstructed.**
5. **A directional claim needs a population that could have gone the other way.**
6. The test count comes from that run's output, and a red suite is reported first.
7. **A statistic on a SELECTED population measures the selection.**
8. Check a ratio's numerator and denominator describe the same population before reading its sign.
9. **A mechanism is a hypothesis until traced to a line — and the re-check must come from a
   DIFFERENT instrument.** More runs of the same instrument is precision, not independence.
10. **A confirmation from the same instrument never outvotes a disconfirmation from a different
    one.**
11. **Recording a mechanism is not auditing it.** Enumerate the consequences in the same sitting.
12. **Reading one artifact is not reading the series** — and never attribute to arithmetic what
    was a write.
13. **Run the audit after every confirmed INSTANCE, not every consequence.** The value of an
    audit is highest exactly where nothing is going wrong yet.
14. **A new guard's first test is whether it FAILS when it should.** Break it on purpose.
15. **A guard that scans source matches whole symbols and function bodies**, never substrings or
    line offsets. Match the CONTRACT, not the text.
16. **When the choice is between a hole and a lie, take the hole.** Record, do not enforce.
17. **Ask of every pre-committed branch: could the world produce this?** If not, label it
    diagnostic-of-the-instrument in the table itself.
18. **A narrow detector is indistinguishable from an absent one in its output.** Ask what shape
    of violation it structurally cannot see.
19. **When a population turns out to be selected, recompute the statistics on both sides** rather
    than caveating them — most are invariant, and the ones that move tell you the direction.
20. **A magnitude is not a direction of correctness.** Two paths disagreeing by 9.2 pp says
    nothing about which is right; check against something external.
21. **The model checked against ITSELF needs no external reference, and a violation is a PROOF.**
    Logical identities between two prices the model emits — `TB≥1 == H≥1`, `HRR≥3 ≥ HR≥1`, ladder
    monotonicity. No market, no fixture, no accrual, no waiting. This found M8 in one run after
    every other detector had been bottlenecked on lacking an independent check.
22. **Before comparing two quantities, check the comparison is not a monotone transform of the
    thing you are testing.** `λ = −ln(1−P)` makes "model λ − market λ" identical to
    "model P − market P", so it cannot detect a distributional error by construction. It read
    −1.8% and looked like a refutation.

23. **Instrumenting a seeded simulation (the STANDING pattern, Josh's call 2026-07-27):
    same-line-count appends only, counters that consume ZERO rng() draws, revert +
    re-extract + verify the tree before commit.** Appends keep `clampActivity`'s
    line-number ids valid; zero draws keeps the primary stream byte-identical (a counter is
    additive; a draw is a rebaseline). Enforcement, not just rule: any added draw trips the
    pinned draw count in `tests/sim-rng-stream.test.ts`, and a dirty tree shows in
    `git status` before the commit. First use: the sim volume-by-slot measurement
    (`docs/collection-period.md`, 44,000 team-games, five appended lines, reverted same
    turn).

