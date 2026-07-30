# Collection period — the freeze (hardening Phase 4, effective 2026-07-24)

> ⚠️ **M18 (2026-07-29): THE FREEZE HAS HELD THE CODE VINTAGE AND FLOATED THE DATA
> VINTAGE FOR THE ENTIRE WINDOW.** The engine reads `public/model/priors.json` and
> `context.json` at REQUEST time on both surfaces, straight into the rate path
> (`shPriorH/HR/Kf`, L1582–1626 → `pModel`), and the priors change **7,240–10,041
> numeric fields per day** (mean |Δ| ~1.0, max ~30) — daily, BY DESIGN (live inputs,
> the same class as statsapi stats). **Every cross-day comparison in this window is
> cross-DATA-vintage, and 14 of 21 findings' measured effects sit downstream** (bundle,
> M18). Data vintage is TRACKED per day via the bot's own commit log — attribution is
> exact (e.g. the 07-26 board ran under priors `b75e905` + context `3e2b93c`) — never
> frozen; cross-day claims state the axis from now on.

> ⚠️ **THE FREEZE IS HOLDING A VINTAGE ASSEMBLED ALMOST ENTIRELY FROM UNMEASURED CHOICES
> (census v2, 2026-07-29 — v1's numbers were wrong and are corrected below): of 39
> frozen parameters, 0 were FITTED, 38 CHOSEN (11 with no stated rationale), 1 with
> stated arithmetic; 7 have been measured since — one vindicated (k=4), four condemned
> or weak.** The parameter exit is not a tune-up of a measured system; it is the first
> measurement pass over most of it. **(v2.1, 2026-07-29: the `simJoint` clamp bounds
> 0.25–4× join — CHOSEN, no stated rationale → 40 parameters / 39 chosen (12 no
> rationale) / 1 stated-arithmetic; 8 since-measured — the clamp measured
> NEVER-BINDING on the 07-26 archive, 0.564–1.192 across 19 ratios, n=1 board.)**
> **(v2.2, 2026-07-30: the `1/n` cap relax joins — CHOSEN, rationale stated
> ("when the pool is tiny"), consequence measured (the 10%/5%/3.33%/2.5% ladder)
> → 41 parameters / 40 chosen (12 no rationale) / 1 stated-arithmetic; 9
> since-measured. The relax is the FOURTH unmeasured parameter with a measured
> consequence, after `coreEvMin`, damping 0.5, and `SH_W`.)**
> **(v2.3, 2026-07-30 late: T = 0.80 joins — the lineup condition's threshold,
> CHOSEN by the owner before any board's number was known, rationale stated
> (separates the 22:45Z window from the 22:00Z design point) → 42 parameters /
> 41 chosen (12 no rationale) / 1 stated-arithmetic; 9 since-measured. And the
> relax's measured consequence NARROWS same-day: the disciplined path's Kelly
> ceilings bound n=1 at ≤ ~8% and under-deploy thin cards ($49 of $250 measured)
> — the 10% is reachable only in legacy/override modes.)**

> ⚠️ **REVIEW REACHABILITY WITHOUT A RESET (2026-07-29, owner's order — written above
> the credit sentence so 08-15 is not discovered on 08-15). From 1,676 remaining,
> reached-or-not per cadence:**
>
> | review | requirement | sweeps-only (~420/d · 4.0d · 0 boards) | board-only (~150/d · 11.2d · 11 boards) | both (~570/d · 2.9d · 2–3 boards) | Series-A-complete (~246/d · 6.8d · 6–7 boards) |
> |---|---|---|---|---|---|
> | **08-15 HRR suspension review** | ≥10 board-days by 08-15 | NOT reached | **REACHED (11, barely) — at the cost of Series A's close side and the pre↔close pairing** | NOT (2–3) | NOT (6–7) |
> | **08-08 HRR repair SPEC** | a DECISION must exist (A3 pattern); input = the 08-05 archive re-run — archive on `line-history`, zero credits, zero boards | **reached on every cadence, including total dark** | same | same | same |
> | **08-10 six-regression re-run** | board-independent (reviews table) | **reached everywhere** | same | same | same |
> | **08-17 fixture bar (homogeneous-20)** | 20 boards | NOT (0) | NOT (11 < 20) | NOT | NOT |
> | **08-20 crossover** | ~~20 boards~~ **RE-SCOPED 2026-07-29 to an archival mechanism check — ZERO boards** (block below) | reached (archival) | reached | reached | reached |
>
> **NO CADENCE REACHES BOTH the 08-15 suspension review AND keeps Series A alive** —
> board-only reaches the review only by killing the sweeps Series A needs; every
> sweep-keeping cadence fails the review. (The relayed "both-rationing reaches 14"
> matches no recorded rate: both ≈ 2–3 board-days at ~570/day — the three real rates
> stand in the table.) **IF NO RESET LANDS, what each starved review could become
> (options printed, NOT chosen)**: 08-15 suspension → (a) run at 11 board-days,
> board-only, as a floor check (no MDE exists for it — it is a threshold, not an
> estimate); (b) restate to "first 10 board-days whenever reached" — date slips,
> question intact, cost ~1,500 credits at ~150/board; (c) nothing — vacuous by its own
> threshold. Fixture bar → (a) hold 20 and wait for a reset; (b) an owner-lowered n
> with the MDE table attached (allocation-level ~15.2 bp at 20 / ~17.6 at 15 / ~20.5
> at 11; the row-level census consumer has NO power model at ANY n — lowering is
> unquantifiable for it); (c) nothing. **AND THE DIRECT ANSWER, PLAINLY: no cadence
> completes Series A by 09-22 on the quota on hand** — the floor is ~246/day × ~55
> days ≈ 13.5k against 1,676 (6.8 days). **Without a reset, the freeze's stated
> purpose — one engine vintage per measurement window — has no window to accumulate
> over.** Every dated review inherits this table; the ASPIRATIONAL stamp below stands.

> ⚠️ **THE PARAMETER EXIT DOES NOT FIT THIS CREDIT CYCLE (2026-07-28, measured):**
> Phase 2 Series A's own floor (~246 credits/day: one board ~150 + one close sweep ~96;
> requirement written at `docs/phase2-memo.md` L40–42) needs ~13.5k to 09-22 against
> **2,317 remaining** — the current cycle funds ~9 days at the floor and ~3 at the
> current cadence. Both derivations printed in THE CREDIT BUDGET section below; whether
> the PLAN fits depends on the reset date (pending, dashboard-only) and the burn plan.
>
> ⚠️ **AND THE 08-15 20-BOARD BAR IS NOT REACHABLE SEGMENTED (2026-07-29, restated now
> rather than discovered on the date):** vintage boundaries land 07-29 (batter-market
> `consMinEv` expiry), 07-31 (K's/outs) and 08-01 (ML/RL), so at one board/day starting
> today the largest HOMOGENEOUS whole-board segment by 08-15 is **08-01→08-15 = 15
> boards**, and even the hits-family market-level segment is **07-29→08-15 = 18** —
> both under 20, under EVERY cadence, before credits are even counted. Earliest
> homogeneous-20 dates: **08-17** (hits-family, counting from 07-29) / **08-20**
> (whole-board, from 08-01) — each slipping 1:1 per dark day. The unsegmented count
> reaches 20 sooner, but the vintage convention below says vintages never pool: **for
> the parameter exit, the vintage convention is load-bearing and the 08-15 date is
> not** — the review moves to the homogeneous-20 date; VINTAGE EVENTS census below.
>
> ✅ **DECIDED BY THE OWNER, 2026-07-29, BEFORE ANY FIXTURE-REPRESENTATIVENESS OUTPUT
> EXISTED: THE BAR HOLDS AT 20; THE DATE MOVES.** (b) is out — an unmeasured threshold
> is not lowered to fit a calendar; (c) does not rescue 08-15; (d) is (a) in costume.
> **The test's unit IS written** (`docs/harness-substitutions.md`, "PRE-COMMITTED: the
> fixture-representativeness reading" — the instruments are `clamp-activity`,
> `shrink-activity` and the range detector, all ROW-level over the whole board's rows),
> **and rows do not see the ticket-gate reopens** — the only row-level vintage boundary
> is M8 (07-27 night), so the row-homogeneous series runs 07-29 → 20 boards on
> **2026-08-17**. The allocation-level readings sharing the old date (the crossover
> doctrine review) segment at the reopen boundaries → **2026-08-20**. The
> harness-substitutions pre-commit's "2026-08-14 at the earliest" moves with this
> (dated here; that doc's date was written when 20-by-08-14 was arithmetic).
> **Both gating thresholds are CHOSEN and neither has computable power**: the 20-board
> bar feeds the fixture-representativeness verdict — no power model is written, so
> power-at-20 is as uncomputable as power-at-15 (said separately, per the rule); the
> ≥10-board-day suspension threshold feeds the 08-15 HRR suspension review — it is the
> retirement criterion's own board floor applied to shadow data, and no power statement
> exists for it either. Both are recorded in the frozen table as unmeasured
> calendar-gating parameters.

> **M18 vs THE BAR — DATA VINTAGE IS ORTHOGONAL TO THE FIXTURE-REPRESENTATIVENESS
> TEST, ARGUED NOT ASSUMED (2026-07-29, owner's item 3; the bar decision above
> stands, now with its reason written out).** The test's unit is clamp CALLS pooled
> PER SITE across the archived boards, compared against the frozen fixture's 95%
> Wilson intervals (`docs/harness-substitutions.md` L985–994; instruments
> `clamp-activity`, `shrink-activity`, the range detector). The question it answers
> is "is the frozen fixture — ONE static data snapshot (`fix45`) — representative of
> PRODUCTION boards?" — and production reads priors/context live at request time BY
> DESIGN (M18: tracked, never frozen). **The population the fixture must represent
> is therefore intrinsically data-vintage-mixed; day-to-day prior drift is part of
> the measurand, not a nuisance variable.** Drift adds VARIANCE to the pooled
> per-site pinned-fractions — which the disagreement criteria already price (outside
> the Wilson interval AND >10 pp, or a class change) — and no mechanism is on record
> by which nightly Statcast-percentile refreshes would BIAS archive fractions toward
> or away from a fixture built from one of them. Freezing the data vintage would
> validate the fixture against a single vintage — a WEAKER claim, not a cleaner one.
> What the bar does need homogeneous is row-level CODE behavior, and the only
> row-level boundary is M8 (07-27) — exactly as the decision above recorded.
> **→ ORTHOGONAL; the bar survives at 08-17 (hits-family) / 08-20 (whole-board) as
> decided.** The vintage convention below is untouched: vintage EVENTS are code,
> config, gate-crossings, cadence — the data axis is deliberately not in that class.
>
> **Maximum homogeneous board count, both regimes (the number for any re-decision)**:
> (a) **bot floating + data-vintage-as-segmentation** (the counterfactual convention,
> NOT adopted): boards are homogeneous only within one day — max homogeneous count
> **= 1** (context commits 2×/day at 17:00 + 22:30 UTC can even split two same-day
> generates) — the 20-bar would be unreachable at every count and every date,
> permanently. (b) **bot paused today**: the data axis freezes and stops
> constraining; the binding boundaries revert to the behavioral ones (07-31
> K's/outs, 08-01 ML/RL) → homogeneous-20 lands **08-17 / 08-20 — identical to the
> decided dates. Pausing buys the bar NOTHING and costs staleness.**
>
> **Which archived measurements survive M18 with a stamp (the distinction, stated
> plainly)**: everything internally consistent WITHIN one board and one data vintage
> survives stamped — the whole 07-26-board family (M14 sweeps + controls, A1
> level/floor/percentiles/shade, M16 per-pair, M19 emission census, placeability
> 0/64, range baselines), each under priors `b75e905` + context `3e2b93c`. What does
> NOT survive unstated: cross-day comparisons — M15's pooled populations (restated
> already), the 14-day CZ census (M13 — canonical-key AND cross-vintage stamped),
> Series A joins, the pre↔close pairing series, mktN/calibration accrual trends —
> these state the axis or segment, per M18's convention.
>
> **PAUSE INPUTS (no decision — the owner asked for inputs only)**: pausing stops
> `model.yml` (priors, nightly 09:30Z) and `context.yml` (context 2×/day; ump_k
> feeds it). Staleness bite: `pModel` consumes Savant percentiles + league rates —
> the DRIFT the bot would have applied stays measurable at ZERO Odds-credit cost
> (`tools/build_priors.py`/`build_context.py` run keyless off statsapi/Savant — run
> them without committing and diff against the frozen artifacts), but the EFFECT on
> prediction quality is NOT measurable without fresh boards (no rows to grade).
> Other consumers of the three paths: both live surfaces only (`armV2` →
> `SH_PRIORS`/`SH_CTX`; route L191–92); tests deliberately read the fix45 static
> snapshots, never the live artifacts; `tools/gate_activity.py` projections (ump
> self-arm ~08-04) assume accrual and stall under a pause. **Classification: a
> pause is a FREEZE ITEM (sign-off required — the MIN_GAP sole-exception precedent
> covers exactly this class) AND a vintage event (a cadence change stamps a
> boundary; the data axis would move from tracked-floating to frozen, a regime
> boundary of its own). It is not governance housekeeping.**

> **THE BOT PAUSE — DIFF READY, HELD FOR SIGN-OFF, NOTHING PAUSED (2026-07-29)**. The
> owner ordered the pause; the owner's own pre-committed reading routes it here:
> "pause is a freeze item → do not pause. Bring the diff and the sign-off request,
> and the bar decision stays pending one turn." The classification above (same day)
> is FREEZE ITEM + vintage event — so this is the diff and the request, and the bar
> decision stays pending one turn.
>
> **What the workflows do (so the pause touches ONLY the two ordered paths)**:
> `model.yml` = `priors.json` only (nightly 09:30Z) — disabling it IS the priors
> pause, whole. `context.yml` = THREE functions: the `context.json` build+commit,
> the **`data/ump_k.json` ACCUMULATOR** (the umpire-K database the ~08-04/08-08/08-13
> self-arm clocks count on), and a `data/pen_quality.json` stage (historically never
> materializes in a commit on this branch; `tests/bot-path-whitelist.test.ts` would
> flag it the day it does). **Pausing context.json must not stop ump_k accumulation.**
>
> **The diff (one commit on `main` — the scheduler copies live there, default branch,
> both files verified present on `origin/main`; the job checks out `frontend-rebuild`
> so no run-side script changes; `main` has Vercel deploys disabled, so the push
> deploys nothing)**:
> 1. `model.yml`: comment out the `schedule:` block (equivalently `gh workflow
>    disable engine-v2-priors` — zero-commit, reversible in one CLI call).
> 2. `context.yml`, "Commit if changed" step: drop `public/model/context.json` from
>    the `git add` line — `ump_k.json` keeps committing and accruing; production
>    context freezes at its last committed artifact.
>
> Reversible in one commit (revert) or one CLI call (re-enable). **Stamps if signed
> off**: the pause date = the homogeneous-window start on the DATA axis; **every
> pre-pause board is PRE-PAUSE, CROSS-VINTAGE, and the homogeneous count starts at
> ZERO on pause day — said out loud: the pre-pause boards (07-26 and everything
> before the pause) never join the homogeneous series.** Reachable homogeneous-20
> from a 07-30 pause: hits-family 20 on **08-18**; whole-board (code boundaries
> 07-31/08-01 still segment) 20 on **08-20** — **and either needs a reset: the quota
> caps boards at 11 board-only, so homogeneous-20 is credit-unreachable regardless
> of the pause** (reachability table at the top). Staleness: the forgone drift stays
> measurable at zero Odds credits (run the keyless builders uncommitted, diff against
> the frozen artifacts); the consequence on prediction quality is unmeasurable
> without fresh boards — **recorded as UNMEASURED, not zero**. The tension the
> sign-off decides: the orthogonality block above argues the fixture bar does NOT
> need data-vintage homogeneity (the pause moves neither 08-17 nor 08-20); what the
> pause buys is one data vintage for the PARAMETER EXIT's cross-day re-measurement
> paths (M18's fourteen downstream findings).
>
> **THE UNVERSIONED-INPUTS PREMISE, RESOLVED BY QUERY (2026-07-29 late, owner's
> items 2–3 — three independent queries, all printed on the run)**:
> `git check-ignore -v` on both model files exits 1 — **neither is ignored by any
> rule anywhere**; `git ls-files public/model/` lists **both as tracked**; and the
> bot's commits touch **the JSON itself** — priors nightly (3abc2ce 07-25 →
> b75e905 07-26 → ff2ad74 07-27 → 65e159a 07-28 → 671aed9 07-29 15:58Z), context
> 2×/day (latest 64c42ad 07-29 20:32Z), author `engine-v2-bot`. **M17 and M18 need
> NO correction — the claims that would have needed markers do not exist on disk.**
> The files are versioned with EVERY nightly vintage stored as a commit: the
> backup IS the git history; regeneration from live upstreams is not reproducible
> retroactively and does not need to be — the two-file backup spec is NOT needed,
> for the stated reason. **Production reads its own deployment's committed
> statics** (`selfBase()` fetch of `/model/*.json` — the deploy is built from
> origin, so the copy IS the committed copy at the deployed sha; if the fetch ever
> failed, `armV2` would run those factors dormant — a degrade path that exists and
> is not active). Local replays read the **fix45 STATIC snapshots** (tests-only,
> frozen 2026-07-26 — NOT the deployed copy); the archived-board sweeps consumed
> neither — they read the board's own stored rows, which embed production's 07-26
> vintage. **The echo hashes the TEXT production fetched from its own deployment —
> it attributes production's copy by construction.** Attribution: archived boards
> are attributable by M18's commit-log method (INFERRED — board `at` × bot commit
> times, e.g. 07-26 = `b75e905` + `3e2b93c`); tomorrow's board is the first
> DIRECTLY attributable one (hash pair ON the board). No archived board carries a
> hash pair (the echo shipped 07-29 night; no board has run since) — the
> impossible branch does not fire. **The window-start question DISSOLVES: "zero as
> of the pause" and "zero until an echoed board exists" COINCIDE, because 07-29
> produced no board — the first member is the 07-30 board under either
> definition, and every reachability figure in this doc STANDS unchanged.** The
> pause stands as governance; its justification is recorded as: freezing the
> committed data-vintage WRITERS (which the bot is — by query above), exactly as
> signed off.
>
> **EXECUTION STATUS (2026-07-29, owner's sign-off received)**: the pause commit is
> BUILT — `a46c1f` on a local `main` worktree, exactly the diff above; the two
> frozen-at hashes are IN ITS MESSAGE: priors
> `00994434be42196b67233ed1663ded2f0651b863434f537cd611da108ca0374e`, context
> `2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80` (local ≡ origin
> byte-identical at pause time — the uncommitted-drift impossible branch is SILENT).
> **The push to `main` is BLOCKED by this session's permission layer** (the
> frontend-rebuild push was allowed; default-branch pushes are not) — the owner runs
> ONE command: `git push origin a46c1f:main` from the repo. **Queued-run caveat,
> stated in advance**: today's 22:30Z context cron had already TRIGGERED before the
> pause could land (measured queue delay puts its run at ~06:19–08:30Z); a run
> triggered pre-pause may execute the pre-pause workflow file and commit ONE more
> context refresh. Tonight's board is unaffected either way (the curl precedes it;
> the deploy's statics are the hashes above). If that straggler commits, the
> homogeneous-window start SHIFTS to its context hash — the stamp is conditional and
> says so, rather than pretending the window opened at a file the straggler then
> moved. `data/ump_k.json` keeps accruing by design; the whitelist guard
> (`tests/bot-path-whitelist.test.ts`, WHITELIST = {ump_k.json, context.json,
> priors.json}) would flag `data/pen_quality.json` THE DAY it materializes — that
> file is NOT whitelisted, confirmed by reading the test's constant.
>
> **07-29 CLOSE-OUT RECORD (dated, owner's item 1)**: `consMinEv` expiry made four
> markets live on 07-29; **no server board was generated** (0 of 16 games unstarted
> at the 02:14Z go/no-go read; the protected slot NOT spent); **the behavioral
> vintage changed on a day that produced no board, and the reopen verification did
> not run.** **The homogeneous window opened at the pause at COUNT ZERO and is
> still at zero.**
>
> **TOMORROW'S WINDOW, PRICED FROM THE FEED AND THE RULE (2026-07-29 late — the
> 07-30 chain fully pre-committed tonight)**: the 07-30 slate is **10 games, SPLIT**
> — first pitch 16:10Z, then 17/18×2, and an evening block of 6 from ~23:05Z to
> 02:10Z (statsapi, free). The rule (`docs/board-timing.md` L18–20, L48–49): the MC
> path needs a confirmed 9-man lineup; MLB posts ~3h before first pitch; the
> lineup-window is modeled at FP−3h; **weekday peak confirmed-coverage hour is
> 22:00Z at 66%** (L66). Two windows: (a) full-slate ~13:10–16:10Z — all 10 games
> pregame but evening lineups PROJECTED (fringe rows noParlay); (b) **evening-6
> ~20:05–23:05Z — the 22:00Z design point, lineups largely confirmed, HRR rows
> present, pool ≈ 6-game scale (cap can still bind at 6)**. Cost: ~150 at a full
> slate; the evening-6 residue scales with events swept ≈ **~60–100**. **The cron
> (`0 22 * * 1-5`, entries 1–4) fires INSIDE window (b) once the header is fixed —
> the cron's board is the plan; the manual curl is the fallback.** Pre-committed
> (owner): cron board inside the window → slot stays unspent, the chain reads the
> cron's board (the stronger test — it exercises the path that actually runs);
> cron 401s or lands outside → manual curl inside window (b) on the owner's
> go/no-go, slate count printed first; window closes boardless → **second no-board
> day, recorded, and the outs flag still deploys Thursday as decided.**
>
> **POWER, NOW PARTLY COMPUTABLE (2026-07-29, owner's item 5 — for the owner's
> re-decision; the original decision stays on the record with its date)**: the
> within-board composition noise from price perturbation alone is **SD ≥ 24.3 bp** of
> card E[ln] (200 seeds, one board) — a LOWER bound on across-board noise. At that
> floor, the ALLOCATION-level review's minimum detectable effect (80% power, 5%
> two-sided): **~15.2 bp at 20 boards, ~17.6 at 15; a 10 bp MDE needs ~46 boards.**
> Against the known effect sizes: A1's level effect (+60.6 bp) is detectable even at
> 15; the two-book adoption magnitude (~26 bp) is detectable at 20, marginal at 15;
> anything under ~15 bp is invisible at either bar. **This prices the allocation-level
> (08-20) review only** — the row-level fixture-representativeness test still has no
> power model (its verdict is a census, not an effect estimate), so the 20-board bar
> remains unmeasured for its primary consumer. If the owner re-decides, the numbers
> above are the input; the 2026-07-29 bar-holds-at-20 decision stands dated either way.
>
> **EVERY CALENDARED REVIEW, POWERED OR NOT (2026-07-29, owner's item 5)**:
> | review | written target effect | reachable boards (see runway) | MDE at that count |
> |---|---|---|---|
> | fixture-representativeness (→08-17) | none written | ≤11 board-only / ~2–3 with sweeps | no power model (census-type test) |
> | crossover doctrine (→08-20) | none written — **RE-SCOPED 2026-07-29 to an archival mechanism check, ZERO boards (block below); doctrine stays UNDETERMINED PENDING M14 as ruled** | ~~same~~ n/a — archival | was ~15–17 bp; n/a after re-scope |
> | HRR retirement (repair+10) | **±3 pp over ≥300 rows/≥10 boards — the ONLY written target** | blocked on repair ship | binomial SE at n=300 ≈ 2.9 pp → **the ±3 pp bound is a ~1-SE statement — marginal by its own arithmetic** |
> | HRR suspension review (≥10 board-days) | none beyond the row/board floor — **and the review carries the SELECTED-vs-UNSELECTED limitation recorded 2026-07-29: the suspension was measured on selected legs, shadow rows are every HRR row unselected; the `cfSel` stamp (SHIPPED same day, below) is what makes the two populations separable when the review runs** | 11 board-only | — |
> | 08-10 six-regression re-run | SEs written per coefficient (licensing block) | board-independent | n/a |
> **Only one calendared review has a written target effect size; power is unassessable
> for the rest — the calendar is a schedule of unpowered checks** (the sentence, as
> ordered). A1's adoption effect (+1.9) needs **~1,400 boards** at 80% power — retired
> as UNMEASURABLE (bundle). **(RE-DERIVED 2026-07-29: the +1.9 was the superseded
> 60-seed estimate — at the paired-200 uniform +1.3 the requirement is ~3,000 boards,
> and the clustered point estimate is −0.4, NEGATIVE — sign not established at the
> clustered instrument. Retirement STRENGTHENED; bundle carries the arithmetic.)**

> **THE 08-20 CROSSOVER REVIEW — RE-SCOPED, DATED (2026-07-29, owner's order: cancel
> or re-scope the one review with no written target).** What it was designed to
> compare: singles-first vs parlays-first at the same dollars, decided by the
> crossover scalar (the per-leg overconfidence at which singles overtake) against 20
> boards' worth of card outcomes. Its board cost: it rode Series A's boards (no own
> credits) but REQUIRED 20 to exist — unreachable (11 max, table at top). What it
> could conclude at the reachable count: an allocation-level estimate at MDE ~20.5 bp
> (n=11) of a question **already ruled UNDETERMINED PENDING M14** — and M14's fix
> (A1) is exit-gated, so at ANY reachable count it would re-measure a question frozen
> behind M14. **It IS re-scopable to a mechanism check needing zero boards → per the
> pre-committed reading it is RE-SCOPED, not struck.** The new question: **"does the
> leg-equivalent floor (A2) keep the crossover stable under M14-class price shifts,
> where the fixed +2% floor does not?"** Instrument:
> `tests/singles-counterfactual.test.ts` sections 5–6 over archived boards
> (`PL_BOARD`, zero credits) — and the n=1 answer is already on the record:
> fixed-floor crossover **3.013 → 0.513** under the +1.07 shift; leg-equivalent
> **3.456 → 3.661** (`docs/singles-vs-parlays.md` table). The re-scope extends that
> across archived boards as they accumulate; **no board is spent for it; its boards
> are freed to Series A.** The doctrine question keeps its ruling: undetermined
> pending M14.

The system is in a **data-collection freeze through at least late August 2026.**

During the freeze, **no model weights, gate thresholds, market suspensions, structure
caps, or selection-mode defaults change.** The correct amount of new feature work is
zero. The scoreboard runs itself: the CLV report (docs/clv.md), the Discipline report,
the nightly calibration grader, and the auto-grading ledger accumulate evidence while
the humans and the code both sit still.

**Auto-calibration stays ON and is the only sanctioned mechanism for weight movement:**
shrink-only (it can only pull the model TOWARD the de-vigged consensus, never away),
capped at ±10% per week, requires 150+ graded picks in a market with statistically
significant miscalibration, and every adjustment is logged under Stats → Calibration.

## Exit conditions (whichever fires first)

1. **~150 graded H+R+RBI O0.5 legs actually bet** → triggers the deferred H+R+RBI sim
   recalibration project (its own instruction file, not this one). Scope sketch, for the
   record: condition the H+R+RBI distribution on projected PA by lineup slot, opposing
   starter quality and expected innings, and park; backtest against the graded set before
   any thought of reactivating O1.5+ alternates (see docs/hrr-recalibration.md).

   **Source: the LEDGER — graded CORE legs whose `lkey` line is 0.5, dated `CAL_START`
   (2026-07-25) or later. Threshold unchanged at 150.** Three filters, each for a reason:

   - *Ledger, not the calibration panel.* The panel counts **board rows** — every line
     the engine printed, including the O1.5+ alternates suspended from every ticket
     (~93% of that market's rows, 13 of 14 on the baseline board). Read there, this
     condition was satisfied within days of being written (403 rows against a threshold
     of 150) and would fire ~25× sooner than exit 2, making the 60-day condition dead
     letter. The 150 was calibrated on ledger accrual: this document's evidence base is
     19 O0.5 legs over six days (~3.2/day, `docs/hrr-recalibration.md`), which puts 150
     at ~47 days — commensurate with the 60-day alternative, as two comparable exits
     should be.
   - *From `CAL_START` forward.* One policy per population. Legs locked before
     2026-07-24 were picked under the hardcoded over-lean (fix-file Phase 5 made
     direction a choice; before it, hitter props were overs-only in every mode), so they
     answer a different question. The same boundary is applied in code to the
     calibration channel's ledger-join (`/api/calibrate`). **This is a correctness fix,
     not a numbers fix** — it discards roughly 20 legs (~6 days of accrual on a ~47-day
     clock), an estimate, since counting them exactly needs the ledger.
   - *CORE only, not FUN.* FUN legs are selected under a different policy: exempt from
     the EV gate, capped by structure, chosen by odds tier. This condition gates a CORE
     selection decision — whether the disciplined path may price H+R+RBI alternates —
     so a leg that never faced the EV gate is not evidence about it. FUN is not
     negligible here either (1 ticket/day up to 4 legs, against core's ~3 HRR legs/day),
     so it is excluded deliberately rather than waved through as immaterial. Cost: the
     counter fills slightly slower.

   **Projected trigger date: ~2026-09-15 (range 09-10 → 09-26).** Written down rather
   than inferred, with its assumptions, so drift is visible:

   | core-only rate | 150 legs reached |
   |---|---|
   | 3.2/day (the observed all-legs rate, i.e. FUN share ≈ 0) | 2026-09-10 |
   | 3.0/day | 2026-09-13 |
   | **2.9/day (central: ~10% of HRR O0.5 legs assumed FUN)** | **2026-09-15** |
   | 2.5/day (FUN share ≈ 20%) | 2026-09-23 |

   Add roughly 3 days: the first days after `CAL_START` run with `mktN` rebuilt from
   zero, so the small-sample consensus gate is strict and H+R+RBI is unlikely to be
   ticketed at all. Central estimate lands **~2026-09-18**, versus exit 2 at
   **2026-09-22**.

   **This threshold assumes OUTCOME-based power, and is expected to be superseded.**
   150 was chosen for detecting miscalibration from win/loss results, which is a weak
   instrument — a 2pp model bias needs ~2,400 graded legs to detect that way, so even
   150 is a compromise number. The Phase 2 model-vs-close instrument reaches
   significance at 20–50 legs by measuring bias against the closing consensus instead
   of against coin flips. **When Phase 2 lands, H+R+RBI readiness should be judged on
   its CLV bias estimate rather than on this count.** Until then 150 stands unchanged
   and this condition is live, not decorative.

   ⚠️ **The margin is thin and the low end crosses over.** At 2.5 legs/day (a 20% FUN
   share) exit 1 fires 2026-09-23 — *after* exit 2 — which would make it decorative.
   The underlying rate (19 O0.5 legs over six days, 2026-07-17 → 07-22) is a six-day
   sample that included FUN, from before the ev_gated default and before the consensus
   gate; the FUN share of those legs was never measured and cannot be recovered from
   here. **Recheck this date once ~2 weeks of core-only O0.5 legs exist**, and if the
   realized rate is under ~2.6/day, exit 1 is decorative and exit 2 is the real clock.
2. **60 days elapsed** (≈ 2026-09-22).

**A third exit condition is PROPOSED and UNSIGNED.** The original edge-instructions file
proposed: *a market accumulates enough legs for the model-vs-close bias estimate to reach
95% power on a 2pp effect (typically 20–50 legs), and the estimate is significant.* On
the numbers above that would fire **first, by weeks** — it is the only exit whose clock
runs on the efficient instrument rather than on outcome counting. It is not in force:
amending the exit conditions needs Josh's separate sign-off. **Raise it when Phase 2
lands**, since that is what makes the condition measurable in the first place.

Until one fires, requests to tune, loosen, or "just try" a parameter below are declined
by default; any change needs Josh's explicit sign-off against this document.

## Frozen parameters — current deployed values (drift detector)

Verified against `legacy/index.html` (SH_CFG et al.), `src/lib/engine-client.ts` and
`app/api/generate/route.ts`. If a live value ever differs from this table, something
moved during the freeze and that is itself a finding.

**Every generator counts.** Two surfaces arm the engine, and until 2026-07-24 this
table named only one of them — so `/api/generate` ran six days with no `selMode` at
all (i.e. the legacy overs-only board, ~30% of rows on a different side than the app's)
without the drift check being able to see it. A value is only "deployed" when it is
deployed on **both** surfaces; a row that differs between the two columns below is
drift, even when both values look reasonable on their own.

### Selection & gates
| parameter | value | meaning |
|---|---|---|
| selection mode default | `ev_gated` | EV-gated @ CZ (stored dk_fd / probability / caesars_ev respected) |
| `coreEvMin` | `2` (percent) | core EV floor at the selection price. ⚠️ **UNMEASURED PARAMETER (2026-07-28, M14 items); the "~95 bp below optimum" claim was WITHDRAWN 2026-07-29 as a SELF-GRADED artifact (owner's shade test)**: the value 2 was chosen (`06d3cbc`), never fitted. Extended sweep (07-26 board, in loop): 12 values → 8 distinct cards, rising to ce=30 (+221.9 at δ=0) then empty at 50 — but the δ=0 peak **collapses under shading: ce=30 → +24.0 at −3 pp (peak migrates to ce=20) and −96.4 at −5, the worst tested value**. E[ln]-at-model-probs rewards concentration into the model's own favorites — the exact exposure the shade table tests. Restated as distance from the MODEL'S OWN optimum; **NOT a candidate amendment**. The allocator enforced its Kelly ceilings in every sweep card (one bind at ce=1; the ce=20/30 $83 stakes are capG-limited, ceilings above capG — no contradiction with the $28 low-edge ceiling). Recorded observation, n=1, self-graded caveat: ce≈10–20 dominated ce=2 at all tested shades |
| shared-game damping `0.5` (in `eff = base/(1+0.5·sharedGames)`, L3082) | `0.5` | ⚠️ **UNMEASURED-AND-IMPLICATED (2026-07-29, owner's item — joins `coreEvMin`)**: chosen, not fitted; survives the A1 ranking swap; sweep 0/0.25/0.5/1.0 moves E[ln] MATERIALLY under prob ranking (+90.6/+122.0/+126.6/+130.5 — 40 bp range; EV ranking 11 bp, falling). **Unlike the withdrawn `coreEvMin` claim, the 40 bp SURVIVES SHADING** (owner's test, same day): range 40.0 / 40.2 / 40.0 bp at δ = 0/−3/−5, damp=1.0 best at all three — shade-robust, does NOT demote. n=1 board, no ship |
| **20-board fixture-representativeness bar** | `20` | ⚠️ **CHOSEN, not fitted (2026-07-29)** — the number fell out of the 07-27→08-15 calendar span; no power model exists to evaluate it at any other value. An unmeasured parameter gating a calendar decision (THE 08-15 DECISION table) |
| `coreCzEvMin` | `0` | settlement floor — never lock a core ticket negative-EV at Caesars (override-proof) |
| `consMinN` / `consMinEv` | `100` / `−1` (%) | markets under 100 graded legs also need consensus-fair EV ≥ −1% |
| `dailyBankrollCap` | `0.10` | CORE+FUN day exposure ≤ 10% of the managed bankroll, enforced at lock |

### Suspensions (until recalibration earns them back)
| parameter | value | meaning |
|---|---|---|
| `hrrAltMax` | ~~`0.5`~~ **`-1` (2026-07-27, signed off — reopening decision)** | ~~lines above O0.5~~ **every H+R+RBI rung** suspended from auto-selection; retirement criterion in THE REOPENING DECISION section. ⚠️ **Effect CONDITIONAL on `selMode ∈ {ev_gated, dk_fd}`** — the legacy posture is unfiltered by design (parity stance); the coupling to the production arming modes is TEST-ENFORCED (`tests/hrr-suspension-coupling.test.ts`, with a plant proving the legacy world stays visible) |
| `coreNoHR` | `true` | HR props never on core; HR-anytime parlays are FUN-only |
| **`penQFrozen`** | **`true`** | `shPenQF` pinned off for the collection period — see KNOWN-INERT below. |
| **`umpKFrozen`** | **`true`** | `shUmpKf` pinned off. Unlike `penQ` this factor would have **armed itself** across ~2026-08-04 → 08-13; pinning **preserves** current behaviour. |
| **ump `g >= 5` gate** | `5` (`tools/build_context.py` L189) | umpire plate-appearance count required before a `kFactor` is emitted. **No stated rationale — see the analysis below; it is ~7× too low.** |
| **ump kFactor clamp** | `[0.92, 1.08]` (`shUmpKf`) | ±8% cap on the umpire K adjustment. **No stated rationale; narrower than the sampling noise the gate admits.** |
| **`GAP_BUCKET_MIN_N`** | `150` | rows needed in a disagreement bucket before its calibration gap is read. **Fifth entry of the unexamined-constant class — and the only one with its arithmetic stated up front:** at n=150 SE(gap)=4.1 points, so the 12.9-point H+R+RBI miscalibration reads at 3.2σ. |

### `shShrink` k values — the SIXTH entry of the unexamined-constant class (added 2026-07-26)

`shShrink(rate, n, k, prior)` returns `(n*rate + k*prior)/(n+k)`, so **`k` is the number of
prior observations the estimator pretends to have** and the own-sample weight is `n/(n+k)`.
**Not one of these nine values is justified anywhere in the repo.** Own-sample weight is
measured at the `n` actually seen — `tests/shrink-activity.test.ts`, which snapshots them so
a change fails.

| line | k | typical n | own-sample weight | what it shrinks |
|---|---|---|---|---|
| L2066 | **150** | 80.5 | **0.349** | HR rate/AB (closed form) |
| L2357 | **150** | 89 | **0.372** | HR rate/AB (sim `batVec`) |
| **L2253** | **4** | **5** | **0.556** | **`pitcher_outs` IP/start — defect 3** |
| L2099 | 4 | 5 | 0.556 | `leashOf` — the sim's copy of the same estimator |
| L2274 | 4 | 5 | 0.556 | K's per start |
| L2065 | 60 | 80 | 0.571 | hits rate/AB (closed form) |
| L2349 | 60 | 80 | 0.586 | hits rate/AB (sim) |
| L2351 | 60 | 95 | 0.613 | hits rate/AB (sim, no-starter path) |
| L2359 | 10 | 26 | 0.722 | H+R+RBI per game |

### PROVENANCE CENSUS v2 — re-run 2026-07-29 after the owner caught v1 contradicting a recorded measurement

**The contradiction, resolved**: v1 copied the 07-26 sentence "not one of these nine
values is justified anywhere" over all nine `shShrink` k's — but the project record says
the condemned **k=4 was MEASURED on 2026-07-27 and found numerically right** ("k=4 was
numerically right; the cliff and the league target were the defects" — the M2 row), and
k=60 was measured WRONG (M11), k=10 measured weak (HRR). **The CENSUS was wrong** — it
conflated provenance-at-birth with measurement-status-today. v2 separates them: BORN is
permanent; MEASURED-SINCE is an overlay. v1's "~33 chosen vs 2 FITTED" was also wrong on
both numbers: `wBlend`/`mktN` are DYNAMIC STATE, not frozen-table parameters — they leave
the census.

**Denominator: 39 frozen parameters** (Selection & gates 8 · Suspensions 7 · `shShrink`
k's 9 · Structure caps 10 · Model blend & badges 5, counting `SH_W` and `SH_EDGE_MIN` as
one each). By BORN provenance:

| born | parameters | count |
|---|---|---|
| **FITTED** | none — nothing in the frozen table was fitted from data at birth | **0** |
| **CHOSEN with stated arithmetic** | `GAP_BUCKET_MIN_N` 150 | **1** |
| **CHOSEN, rationale in comments** | selMode · `coreEvMin` · damping 0.5 · 20-board bar · `coreCzEvMin` · `consMinN`/`consMinEv` · `dailyBankrollCap` · `hrrAltMax` (signed; value chosen) · `coreNoHR` · `penQFrozen`/`umpKFrozen` · `coreMaxLegs` · `coreMaxDec` · `maxCoreTickets`/`minCoreTickets` · `perParlayCap` · `funMaxTickets`/`funMaxLegs` · `FUN_DEFAULT` · `funMinProb` · `funTiers` · `SH_W` · `SH_EDGE_MIN` · `SH_OVER_LEAN` · Kelly ¼ + 2% cap | **27** |
| **CHOSEN, no stated rationale** | ump `g ≥ 5` · ump clamp [0.92, 1.08] · the nine `shShrink` k's | **11** |
| **INHERITED / UNKNOWN** | none in the table (the `0.140` outs constant is an ENGINE constant outside the frozen table — inherited, M2's defect; noted, not counted) | **0** |

**MEASURED-SINCE overlay (7 of 39)**: k=4 ×3 — measured RIGHT (M2, the vindication v1
erased) · k=60 ×3 — measured WRONG (M11) · k=10 — measured weak (HRR). Plus two
n=1-board implications short of measurement: `coreEvMin` (self-graded sweep) and damping
0.5 (40 bp, shade-robust).

**Count: 0 fitted / 38 chosen (11 with no stated rationale) / 7 since-measured — of
which one vindicated, four condemned or weak.** The sentence at the top of this doc now
carries these numbers. **(v2.1, 2026-07-29: +simJoint clamp → 40 / 39 chosen (12 no
rationale) / 8 since-measured; the clamp never binds on n=1 board — bundle.)**

**WHAT THE PARAMETER EXIT CAN AND CANNOT LICENSE (2026-07-29, owner's paragraph — both
halves stated)**: A positive Phase 2 result would establish that **this configuration's
disagreement with the market carried information over this window, on these markets,
under these 39 constants as set** — a valid, decision-relevant fact about the shipped
thing, sufficient to justify continuing to run IT. It would **not** establish that the
approach is sound in general, that any neighboring configuration (a different k, floor,
ranking or damping) would show the same, that the chosen constants are near any optimum
(the census says almost none was ever measured), or that the result transfers across
markets or seasons. A negative result is likewise about this configuration — with the
identification diagnostic as the binding qualifier either way. **The exit's own
measurement path touches 9 of the 39 directly** — the nine `shShrink` k values, which
shape `pModel` on every row the slope consumes (plus the pinned-off `penQ`/`umpK` pair
that would touch it if armed, and `GAP_BUCKET_MIN_N` on the calibration instrument's
side; the gates, caps, ranking and damping never reach `pModel`). **So the exit's answer
depends on 9 unmeasured choices — a count, not an adjective — and one of the nine
(k=60) is already measured wrong (M11), with its fix specced and frozen.**

### `consMinEv` IS A STRUCTURE FILTER WEARING A QUALITY FILTER'S NAME (2026-07-26)

`consCzEv` is **multiplicative**: `consP = Π(imp_i)` and `czDec = Π(czDec_i)`, so

```
consCzEv = Π (imp_i × czDec_i) − 1 = Π (1 + c_i) − 1        c_i = that leg's own consCzEv
```

**The per-leg bar therefore TIGHTENS with leg count.** To clear `consMinEv = −1%`:

| legs | required geometric-mean per-leg `consCzEv` |
|---|---|
| 1 | ≥ **−1.000%** |
| 2 | ≥ −0.501% |
| 3 | ≥ −0.334% |

Measured against the actual distribution (205 playable rows with a Caesars quote, board
2026-07-26): median **−5.60%**, p25 −7.00%, **max −0.60%**, and **1 of 205 clears −1% even
as a single**. At two legs that one row has no partner; at three, none.

**Mechanism:** the de-vigged consensus is priced against Caesars, whose measured overround is
**1.071**, so a typical leg starts ~5–6 points under water and the product only deepens it.
`consMinEv ≥ −1%` asks the consensus to price a ticket at near-zero vig against the
settlement book on *every leg simultaneously*.

> **At any leg count above one, `consMinEv` is not filtering on quality — the bar is
> unreachable regardless of merit. It admits by structure (leg count 1) and excludes the
> rest mathematically.** It only ever behaved like a quality filter because markets crossed
> `consMinN` fast enough that it rarely bound; `CAL_START` made it universal.

**Correction to the framing that prompted this section:** the *pass rate* is **1 of 205
rows (0.5%)** and **0 of 67 tickets**. The 15.08% figure is the parlay card's stake-weighted
**EV** with the gate open — not a pass rate. The structural conclusion is unaffected.

**And it pulls against the EV floor on the same axis.** `coreEvMin` is a *fixed* ticket
floor, so it filters **more weakly** as legs increase (a 3-legger clears +2% on legs
averaging +0.7%; measured over-admission **4 of 18 tickets, 22%**). `consMinEv` is a
*multiplicative* floor, so it filters **more strictly** as legs increase.

| gate | scaling with leg count | direction |
|---|---|---|
| `coreEvMin` (+2%) | fixed ticket-level | **looser** with more legs |
| `consMinEv` (−1%) | multiplicative | **stricter** with more legs |

**Neither was designed with the other in mind, and on leg count they point in opposite
directions.** Not a change request — both are frozen. Recorded so the interaction is not
rediscovered as two separate surprises. See `docs/singles-vs-parlays.md`.

**Seven of nine sit below 0.6 own-sample weight, and the flag is a prompt, not a verdict.**
A large `k` on a *rate* is defensible — HR/AB has enormous per-AB variance, so `k = 150` at
n≈80 is a real choice about a rare event. `pitcher_outs` is different in kind: `ipg` averages
~5.3 innings with small across-start variance, and no variance argument supports discarding
half of a starter's own workload. Justify each `k` on its own estimator; do not treat the
column as a list of bugs. Frozen; see `docs/pitcher-outs-audit.md` §8.

### Structure caps
| parameter | value | meaning |
|---|---|---|
| `coreMaxLegs` | `3` | core tickets max 3 legs |
| `coreMaxDec` | `15` | core odds ceiling ≈ +1400 |
| `simJoint` clamp | `0.25–4×` | ⚠️ **CHOSEN, no stated rationale (census v2.1, 2026-07-29)** — bounds on the joint/naive rescale (L2686–2706); measured NEVER-BINDING on the 07-26 archive (factors 0.564–1.192, 19 usable ratios; n=1 board); a clamp that binds replaces the dependence model with the clamp — the guard for the ungraded-group class is spec'd in the bundle |
| `maxCoreTickets` / `minCoreTickets` | `6` / `4` | core card size band |
| `perParlayCap` | `0.25` | max fraction of DAILY on one ticket |
| `funMaxTickets` / `funMaxLegs` | `1` / `4` | FUN: one ticket per day (supplementals count), max 4 legs |
| `FUN_DEFAULT` | `$5` | FUN daily default (day-scoped; field stays editable) |
| `funMinProb` | `0.1` (%) | FUN floor — worse than 1-in-1000 is a donation |
| `funTiers` | `800–2500 / 2500–10000 / 10000+` | BIG / MASSIVE / MOONSHOT (american odds) |

### Model blend & badges
| parameter | value | meaning |
|---|---|---|
| `SH_W` | `props .35 · ml .15 · rl .15` | model weight vs de-vigged consensus — **ANNOTATED 2026-07-29 (owner's item 3)**: swept in-loop on the archived board (`tests/blend-sweep.test.ts`); E[ln]-under-own-belief rises MECHANICALLY with model share (the evaluation prob amplifies with the parameter being tested — self-graded BY CONSTRUCTION, the 95-bp shape in its purest form) → **the sweep can neither withdraw nor vindicate the 0.35; SH_W stays CHOSEN-unmeasured**. What it did establish: at share 0.15 both rankings collapse to one 3-ticket card (gap +0.0); the exit is NOT narrowed by the blend — `phase2_series_b` regresses on **`pModel`, the raw model field** (its L9), while production GROWTH expresses only the blended ~35% — both halves stated. Effective share ≤ nominal (`shWm` calW·calG shrink-only, unarchived) |
| `SH_EDGE_MIN` | `props 4% · ml 2% · rl 2%` | EV needed for an EDGE badge |
| `SH_OVER_LEAN` | `0.25` | legacy-mode over-lean threshold (disciplined modes pick sides vs fair; `dirPref` default `{}` = both) |
| Kelly | ¼-Kelly, capped 2% of bankroll per bet | sizing |
| global shrink | `s = 1` (none) | pooled reliability slope 1.05 over 1,487 legs (2026-07-22 fit); per-market mults empty |
| **one-sided vig haircut** | **`1.06`** (`legacy/index.html` L2388) | the assumed overround when a row has no second side to de-vig: `fair = oneImp / 1.06`. **Added to this table 2026-07-25** — it was materially pricing rows and appeared in no table, the same omission `simN`/`simNHR` had. Measured overround is **1.071** (below). **Frozen; do not change during collection.** |

### Bankroll & ledger
| parameter | value | meaning |
|---|---|---|
| `BANK_BASE` | `$2,500` | managed bankroll base (asOf 2026-07-24); computed, never typed |
| ledger / bank log / NO-PLAY log | append-only, cloud-synced | locked days never rewritten; corrections are addenda |

### Engine arming — per generator (added Phase 0.5, 2026-07-24)

Both columns must match, field for field. The app arms in `armV2()`
(`src/lib/engine-client.ts`); the cron arms inline in `app/api/generate/route.ts`.

**Check the CALL SITE, not the value.** Two values agreeing today is not compliance —
`calW` agreed for six days and then didn't, because the two sides computed it
separately and only one side gained the nightly slope-fit merge. A row is compliant
only when both surfaces reach the value through the *same function*. `tests/arming-parity.test.ts`
enforces the call sites by reading the route sources, so this table can't quietly rot
into decoration.

| parameter | app (engine-client `armV2`) | cron (`/api/generate`) | shared call site |
|---|---|---|---|
| `SH_CFG.selMode` | `ev_gated` (`getSelectionMode()`, stored override respected) | `ev_gated` (`CRON_SEL_MODE` — no localStorage on the server) | two literals, guarded by test² |
| `SH_CFG.mktN` | graded legs/market from the calibration summary | same — hygiene only¹ | `effectiveCalibration()` |
| `calW` | `/api/calibration` `.mults` | same | `effectiveCalibration()` |
| `calG` | `/api/calibration` `.global.s` | same | `effectiveCalibration()` |
| `shin` · `sharpW` · `sim` · `projLineup` | `true` | `true` |
| `regions` — **GAME MARKETS ONLY** (`h2h,spreads,totals`, L1231) | `us,eu` | `us,eu` |
| **prop-market regions — HARDCODED, ignores `SH_V2.regions`** (L1335) | **`us`** | **`us`** |
| `priors` · `ctx` | `!!` the fetched artifact | `!!` the same artifact |
| **`simN` / `simNHR`** | **50,000 / 50,000** (`SIM_PATHS`) | **10,000 / 20,000** |

**The `regions` row described half of what it appeared to describe (fixed 2026-07-25).**
`SH_V2.regions` governs the **game-odds** pull only (L1231). The per-event **prop** pull
hardcodes `regions=us` (L1335) and ignores the setting entirely. Same omission class as
`simN`/`simNHR` and the `1.06` haircut: a real, behaviour-governing split that the table
implied did not exist.

**This settles the `booksInd` threshold at 1, more firmly than the argument that reached it.**
The case for instrumenting toward 2 was that a lone "independent" book might be a
placeholder-prone offshore key — the fat tail behind the p90 price-movement artifact
(coolbet, winamax_de, betfair_ex_eu, nordicbet, betclic_fr, betsson). **Those books are all
EU, and props never fetch EU.** For props the concern is structurally impossible. The p90
artifact and the 31-book ML consensus depth are properties of the *game* markets alone and
must not be carried across to prop reasoning. **Threshold 1 stands; the 1-vs-2 decision is
off the schedule** unless the `fb` keys show something surprising.

`fb` is still worth capturing — it is free, and knowing *which* US books actually quote props
is direct input to the Phase 5 multi-book work. It is no longer collecting evidence for a
pending threshold decision.

`calW`/`calG`/`mktN` come from one shared pure function (`effectiveCalibration` in
`src/engine2/calibration.ts`) called by both `/api/calibration` and `/api/generate`,
so those three cannot silently diverge again — a difference would take a code change
to a shared function, not two call sites drifting apart.

² **The cron's mode is a hardcoded literal on purpose — that is the mechanism, not a
limitation.** `tests/arming-parity.test.ts` asserts `CRON_SEL_MODE === "ev_gated"`, so
changing the app's selection mode at freeze exit **fails the build** until the cron's
constant is changed with it. A runtime-detected mode would have converged silently and
only revealed a mismatch after a wrong board had already shipped and been logged. Build
time beats board time: leave it hardcoded and let the test do the catching.

¹ **`mktN` on the cron is hygiene, not function.** It is read at exactly one place —
`shAllocate` (legacy/index.html, the small-sample consensus gate) — and the cron never
allocates. It is wired so that a future server-side caller can't inherit the old hole,
and it changes nothing about the board the cron logs today.

**`simN`/`simNHR` are KNOWINGLY UNEQUAL, and that is a decision, not a gap.** The
cron's sims produce leg-level marginals for the prediction log only: it never
allocates, so its joints price nothing, and it runs at 16:00 UTC when almost no lineup
is posted, so the sim path barely engages. Measured 2026-07-24 across 10k → 50k paths,
zero marginal rows changed side and no probability moved more than 0.10pp (the storage
rounding grain). Cron depth stays 10k/20k. Do not "converge" it upward.

That measurement covers **marginals only**, and it is not a licence to lower the APP.
The joint path — `jointAll()`, the same-game scaling factor clamped 0.25–4× that prices
every SGP — has never been measured across depths, and Monte Carlo noise on a joint
tail is far worse than on a marginal (a 0.3% joint sees ~30 hits at 10k, ~18% relative
SE; ~8% at 50k). `simNHR` exists for exactly that reason. **Any proposal to drop the app
from 50k requires that joint-stability measurement first** — per same-game group:
`jointAll()`, Π sim marginals, the resulting factor, its spread across 10k/20k/50k with
seeds held, split CORE vs FUN-tier near `funMinProb`, plus how many tickets change tier,
stake or gate outcome.

### Calibration guardrails (the one moving part)
| parameter | value |
|---|---|
| adjustment trigger | 150+ graded picks AND statistical significance |
| adjustment cap | ±10% per week, shrink-only (toward consensus) |
| tier ladder | MONITOR <50 · SOFT 50–99 · HARD 100–149 · ADJUST 150+ |
| training window start | `CAL_START` = **2026-07-25** (Phase 0.5) — load-bearing until ~2026-09-08, then inert. **Do not remove.**¹ |

**`CAL_START`.** Prediction rows dated before it are kept and still graded, but do not
train the channel: from 2026-07-17 to 2026-07-24 the store was written by two
generators running different selection policies, and no row recorded which wrote it.
No retroactive attribution is attempted — an under-side row is provably the app's, an
over-side row could be either, and guessing would be false precision. From this deploy
every row carries `src: "cron" | "client"` and the armed `selMode`, so the question is
never ambiguous again. Same no-backfill rule as CLV (`docs/clv.md`).

¹ **`CAL_START` goes inert on its own — that is expected, and it is still not dead code.**
Both consumers look back 45 days: the summary loop takes the last `SUMMARY_DAYS` (45)
*logged dates*, and the ledger-join takes a 45-day *date* window. From roughly
**2026-09-08** (2026-07-25 + 45; later if slates are ever missed, since the summary
counts entries rather than calendar days) the window start is always later than
`CAL_START`, so the filter excludes nothing and every row it sees is already clean.
It stays anyway: it is the only thing standing between the pre-restart rows — which are
deliberately kept, still stored and still graded — and the training set, should
`SUMMARY_DAYS` ever be raised, an old date be re-logged, or the window otherwise
lengthen. A constant that filters zero rows in September is doing its job, not
loitering. Deleting it re-admits a two-policy sample the moment anything widens.

#### ⚠️ …AND THE CONSEQUENCE THAT PARAGRAPH STOPPED ONE INFERENCE SHORT OF (2026-07-27)

"`CAL_START` goes inert around 2026-09-08" is correct and was written six weeks early. What
was never carried forward: **if the window start passes `CAL_START`, the summary stops
covering the beginning of the collection period.** At freeze exit it would read
**2026-08-09 → 09-22** — three quarters of the sample, presented as the freeze, with nothing
in the payload saying so. Recording a mechanism is not auditing it.

**Fixed by splitting the consumers, not by widening a frozen input.** `summary` keeps the
45-date window and still trains the blend weights (byte-identical, asserted in
`tests/arming-parity.test.ts`); **`summary.full`** covers every eligible date, never slides,
and is what the exit reading uses. Both stamp `.window`.

<!-- SYNCED-WINDOW: parsed by tests/calibration-window.test.ts and checked against
     SUMMARY_DAYS in app/api/calibrate/route.ts. Change the constant and this table must be
     recomputed in the same commit — the build breaks otherwise. Do not hand-edit one side. -->

| `SUMMARY_DAYS` | first caps | window start at freeze exit | logged dates dropped |
|---|---|---|---|
| 45 | 2026-09-08 | 2026-08-09 | 15 |

`allDays` counts **logged dates, not calendar days**, so a missed slate pushes "first caps"
later in calendar terms while the window still holds exactly `SUMMARY_DAYS` entries. The date
above is the earliest it can bite, not a fixed one.

**This is encoded rather than cautioned because a cautioned invariant is the failure mode
this project has now hit five times** — a warning in prose, sitting one function or one
paragraph away from the thing that ignored it.

### ⚠️ DO NOT "PASS UNGATED" TO PAD A THIN CARD (2026-07-25)

Measured: the "de-vigged multi-book consensus" behind a prop row is often thin, and on some
rows the settlement book is inside its own consensus — so the independent check on Caesars
is a de-vigged Caesars price. On those rows `consCzEv = f × czDec − 1 = 1/(1+h) − 1 ≈ −h`,
i.e. the gate is reading the **hold**, not disagreement.

#### The measurement, corrected against 12 real days (2026-07-25)

The first pass at this was taken off a **single fixture slate** with a proxy that counted a
Caesars *milestone-ladder* price as if Caesars had contributed to the fair. It reported
"44% of Caesars rows are Caesars-only" and "38% of total-bases rows lose eligibility".
**Both were wrong.** Re-measured against `line-history/data/props` — 12 archived days
(2026-07-12 → 07-25), last snapshot of each day, where `n` is the fair's book count and
`cz` is a standard two-sided Caesars quote only (ladders excluded), so
`n = 1 ∧ cz two-sided` identifies a Caesars-only fair **exactly**:

| market | rows | no fair at all (`n=0`) | Caesars **in** the fair | **Caesars-only fair** | ineligible if ≥1 independent book required |
|---|---|---|---|---|---|
| `batter_home_runs` | 4,524 | **4,524 (100%)** | 0 | 0 | **100%** |
| `batter_total_bases` | 2,363 | 381 (16.1%) | 1,336 (56.5%) | **16 (0.7%)** | **16.8%** |
| `batter_hits` | 1,901 | 41 (2.2%) | 0 | 0 | 2.2% |
| `batter_hits_runs_rbis` | 1,861 | 0 | 1,560 (83.8%) | 0 | 0% |
| `pitcher_outs` | 210 | 13 (6.2%) | 150 (71.4%) | 0 | 6.2% |
| `pitcher_strikeouts` | 213 | 0 | 0 | 0 | 0% |

Three things change because of this:

1. **Sole-sourcing is rare** (0.7% of total bases, zero everywhere else) and its per-day
   range is 0.0–1.8%. It is a real hole, but a small one.
2. **The dominant hole is `n = 0` — no consensus fair at all**, because the market is
   quoted one-sided. `batter_home_runs` is `n = 0` on **all 4,524 rows across 12 days**;
   there has never been a de-vigged HR consensus in this dataset. For those rows the engine
   falls back to `fair = oneImp / 1.06` (`legacy/index.html` L2388) — the same posted price
   with a flat 6% haircut, so the "independent consensus" for such a row is the row's own
   price. **CORRECTION (2026-07-25):** an earlier draft of this section said "HR is blocked
   today by arithmetic" because `consCzEv` on a one-sided Caesars leg reduces to the constant
   `1/1.06 − 1 = −5.66%`, below `consMinEv`. That constant is real, **but it never applies to
   HR**: the consensus gate lives in `shAllocate`, `coreNoHR` keeps HR off core, and FUN does
   not run through `shAllocate` at all (see the scope section below). **HR has never been
   touched by this gate.**
3. **Caesars is usually inside the fair rather than alone in it** — 56.5% of total-bases
   rows, 83.8% of H+R+RBI, 71.4% of outs. Requiring *two* independent books instead of one
   costs far more: 50.8% of total bases, 17.6% of hits, 15.0% of H+R+RBI. The rule below is
   written at **≥1 independent book**, which is what "you never price a book against
   itself" actually says.

**The fix is NOT to let those rows through.** A row with no independent market is the
weakest case available, not an exempt one — the same principle as the Phase 3 band rule
(*a missing sample size is never treated as certainty*). Owner's decision, 2026-07-25:
**no independent consensus ⇒ NOT ELIGIBLE in an unproven market.**

**The trap, written down before anyone reaches for it:** those rows already fail today,
so any card-fill count already excludes them. If a count comes back thin, "pass them
ungated" will look like a free way to pad it. It is not — it is loosening a shipped
protection to solve a volume problem, which this document forbids. A thin card is
information about the slate; it is not a bug to be tuned away.

### THE GATE'S COVERAGE IS A FUNCTION OF `mktN` — A MOVING PART NOBODY HAD WRITTEN DOWN

`consMinN` only bites while a market is **unproven**: `shAllocate` computes
`small = legs.some(l => !(mn && mk && mn[mk] >= minN))`, and `mn` is `SH_CFG.mktN`, which
is `summary.reliability[market].n` — graded legs **since `CAL_START`**.

So the gate's coverage moves on its own, in both directions, with no code change:

- **A counter reset silently WIDENS protection.** `CAL_START = 2026-07-25` zeroed every
  market. That is the only reason 100% of thin rows fail the gate today — every market is
  temporarily small. The protection is universal **by accident, not by design.**
- **A counter crossing silently NARROWS it.** The moment `mktN[m] ≥ 100`, the consensus
  check stops running for market `m` entirely, and every structurally-unchecked row in it
  (`n = 0` or Caesars-only) becomes selectable with nothing reading its fair.

Anyone reading a "the gate blocks these" measurement must first ask what `mktN` was when it
was taken. A measurement taken at `n = 0` describes the reset, not the rule.

### DEADLINE: the rule must ship before `batter_total_bases` crosses `consMinN`

Verified against production `/api/calibration` on 2026-07-25 22:20 PT:
`reliability = { all: { n: 0 } }`, `graded: 0` — no per-market entry exists yet, and an
absent entry counts as small (`undefined >= 100` is false). The first non-zero reading
lands on the **09:30 UTC `/api/calibrate` run of 2026-07-26**, grading the 07-25 slate.

Accrual is one board per day (generation-scoped replacement means a second generate
supersedes rather than doubles), and `/api/calibrate` grades **every pending prediction
record** off the statsapi boxscore — not just ledger legs — so `mktN` grows at the board's
own per-market row count. Measured on the fixture board: `batter_hits` 50, `batter_home_runs`
50 (both at the 50-row cap), `batter_total_bases` 41, `batter_hits_runs_rbis` 14,
`pitcher_strikeouts` 11, `pitcher_outs` 7, `ml` 15, `rl` 15 — 203 records/day.

Projected crossings (allowing ~10% attrition to void/ungradable; a real 16-event slate
lifts the uncapped markets, so these are the **late** end):

| market | records/day | crosses `n ≥ 100` on |
|---|---|---|
| `batter_hits`, `batter_home_runs` | ~45 | **2026-07-28** |
| `batter_total_bases` | ~43 | **2026-07-28** |
| `batter_hits_runs_rbis` | ~22 | ~2026-07-30 |
| `pitcher_strikeouts` | ~18 | ~2026-07-31 |
| `ml`, `rl` | ~15 | ~2026-08-01 |
| `pitcher_outs` | ~11 | ~2026-08-04 |

**Runway on total bases and HR: three calibrate runs.**

**Implementation (not yet built).** The row does not record *which* books formed the fair,
and it cannot be derived downstream — `fairs` at `legacy/index.html` L1398 drops the
per-book `cz` flag before the count is taken, and `finalizeCats` never carries `books`
onto the board row at all. Four touch points:

1. L1398 — keep the flag through the fair map, emit `booksInd` (fairs from non-Caesars
   books) alongside the existing `books`.
2. the cats-row push (~L2401) — carry `books` / `booksInd` onto `r`.
3. `finalizeCats` (~L2412) — emit both on the board row.
4. `legOf` (L2537) — carry `booksInd` onto the ticket leg, so the gate can read it.

Then the gate (L2877–2890) blocks, reason `no_ind_consensus`. This changes selection, so it
changes the parity digest: a deliberate, documented rebaseline — **not** a silencing one.

**Fallback if it cannot ship by 2026-07-28:** hold `batter_total_bases` (and
`batter_home_runs`, which is 100% `n = 0`) out of selection until it does. Owner's stated
preference, 2026-07-25: *"I'd rather lose a market for a week than run one ungated."*

### SCOPE CORRECTION — `booksInd == 0` blocks regardless of `mktN` (owner, 2026-07-25)

The rule was first written as "no independent consensus ⇒ not eligible **in an unproven
market**", inheriting `consMinN`'s structure. **That structure does not transfer.** "100
graded legs, so stop consulting the consensus" is coherent when a consensus *exists* and the
question is whether to trust the model over it. It is incoherent when none was ever posted:
graded volume cannot conjure a price nobody quoted. So the two cases separate:

| condition | scope | why |
|---|---|---|
| `booksInd == 0` — **no independent read exists** | blocks **always**, at any `mktN` | nothing about the market's graded history makes an unposted price appear |
| `booksInd >= 1` but the market is thin | gated only while `mktN < consMinN` | this is the "should we still consult it" question `consMinN` was built for |

Had it shipped at the unproven-only scope, on 2026-07-28 HR crosses 100, both gates lift,
and every HR row returns priced by `oneImp / 1.06` — a constant measured as a **floor**,
applied to the **least liquid** rows, in the one market where nothing could be measured.

#### The cost of the wider scope — measured, and CORRECTED 2026-07-26

> **The "12 of 99 pregame parlays" figure below overstates the gate's reach by an order of
> magnitude, and it was used to justify the rule's scope.** Corrected against the
> allocator's actual filter order: the pool `shAllocate` sees is 48 tickets, of which **12
> carry a `books == 0` leg and all 12 are `batter_home_runs`**. `shAllocate` filters
> `shCoreEligible` → basis → **+2% EV** → `nv_tax` → **consensus gate**, and `coreNoHR`
> drops every HR ticket at step 1. Measured: 29 of 48 pass `shCoreEligible` (**zero** of
> them `books == 0`), 1 passes the +2% EV gate (**zero** `books == 0`).
> **So on this fixture the gate blocks exactly zero tickets.** The `d.parlays` count of 12
> is a count of *generated* tickets, not of tickets that ever reach the gate.
>
> **The real-slate figure is unknown.** The gate's live scope is non-HR tickets carrying a
> `books == 0` leg that also clear +2% EV. On the fixture none can exist, because only HR
> rows have `books == 0` there. On a real slate they can: total-bases `n = 0` runs
> **9–26%** daily in the 12-day archive and **0%** on the fixture.

Fixture board (9 prop-priced events), board rows and pregame tickets, counting anything the
`books == 0` block would remove:

| market | board rows | rows removed | core-eligible |
|---|---|---|---|
| `batter_home_runs` | 50 | **50 (100%)** | no — `coreNoHR` |
| `batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`, `pitcher_strikeouts`, `pitcher_outs`, `ml`, `rl` | 138 | **0** | — |

| ticket set | total | removed |
|---|---|---|
| `parlays` (pregame) | 99 | **12 — all of type `batter_home_runs`** |
| `parlaysMixed` | 72 | **0** |

**On this fixture the wider scope costs nothing on core and does not change card fill** —
the entire cost is that FUN loses HR tickets, and FUN takes one ticket a day.

**But the fixture understates it, and the archive says by how much.** The fixture slate
happens to have zero `n = 0` total-bases rows. The 12-day archive has them on **every day
with real volume**:

| date | `batter_total_bases` `n=0` | `pitcher_outs` | `batter_hits` |
|---|---|---|---|
| 07-17 | 76/335 (23%) | 3/35 (9%) | 8/285 (3%) |
| 07-18 | 51/239 (21%) | 0/18 | 9/223 (4%) |
| 07-20 | 62/390 (16%) | 3/40 (8%) | 4/303 (1%) |
| 07-21 | 43/375 (11%) | 3/33 (9%) | 7/291 (2%) |
| 07-22 | 21/224 (9%) | 0/18 | 1/184 (1%) |
| 07-24 | 71/388 (18%) | 1/32 (3%) | 4/280 (1%) |
| 07-25 | 29/271 (11%) | 2/23 (9%) | 6/215 (3%) |

Range 9–26%, never absent. Region scope was checked and matches — both the engine
(`legacy/index.html` L1335) and `snapshot_props.py` fetch props at `regions=us`, so this is
not a denominator artifact. **So a real slate WILL have core-eligible total-bases rows that
this blocks, and the fixture's "zero core cost" must not be generalised.** How many reach the
top-50 board cut is not knowable until a real board is measured — first opportunity is the
2026-07-26 cron board.

### DOES THE GATE TOUCH FUN AT ALL? — No, and that is a bigger hole than the rule

**Answered by reading the call path, not inferred.** `shCardCalc` (L3177) computes
`alloc = shAllocate(pool, ...)` and then calls `shFunPick(pool, SH.fun, ...)` — **on the same
raw `pool`, not on the allocator's survivors.** `shFunPick` (L3027) filters on exactly five
things: not already used, `prob >= funMinProb` (0.1%), `legs <= funMaxLegs`, a priced ticket
in the selection mode, and an odds tier.

So the FUN bucket bypasses **every** discipline gate in `shAllocate`:

| gate | core | FUN |
|---|---|---|
| `coreEvMin` (+2% EV floor) | yes | **no** |
| `coreCzEvMin` (settlement floor, override-proof) | yes | **no** |
| `consMinN` / `consMinEv` (consensus gate) | yes | **no** |
| `coreNoHR` / `coreMaxLegs` / `coreMaxDec` | yes | **no** |

Consequences worth stating explicitly, because they are not obvious from any single file:
`coreNoHR` means HR can *only* land on FUN, and FUN is ungated — therefore **the consensus
gate has never evaluated a single HR ticket**, and the `−5.66%` constant that appeared to be
protecting HR was never in that path. A `booksInd` rule written into `shAllocate` alone
**documents a core protection and changes nothing for HR.**

#### DECISION (owner, 2026-07-25): `booksInd` does NOT apply at `shFunPick`

**FUN is by explicit design not EV-gated** — *"a lottery ticket is never +EV, that's what
makes it a lottery, so it is capped by structure instead."* Bolting an evidence gate onto it
is a category error; every FUN cap is in the frozen table, so it is a frozen-parameter
change; and it would be changing behaviour to solve a problem that has not been measured.
**The HR overround test lands ~2026-08-09. That is what decides it.**

**The hole is not opening on 2026-07-28 — it has always been open.** The 07-28 concern was
that HR crossing `consMinN` would lift its protection. It never had that protection:
`coreNoHR` keeps HR off core and `shFunPick` never runs the gate. Nothing changes on 07-28
for HR. The exposure is unchanged from the day HR-anytime shipped.

#### The exposure, precisely

Not just "FUN is ungated" — what the `1.06` constant can and cannot reach through FUN:

- **`funMinProb` (0.1%) is the ONLY probability-sensitive cap FUN has**, and probability is
  exactly what an inflated fair corrupts. It is therefore the one cap the constant can
  defeat: a ticket whose true joint probability is under the floor can be lifted over it by
  inflated leg fairs. At a **0.1%** floor the practical effect is marginal — the constant
  would have to inflate a sub-1-in-1000 ticket into a 1-in-1000 one — but it is a real
  channel and it is the only one.
- **Tier assignment is by AMERICAN ODDS, not probability** (`shFunPick`: `am = decToAm(tDec)`
  against `funTiers`). So inflation does **not** move a ticket between BIG / MASSIVE /
  MOONSHOT, does not change the split, and does not change stake. Anyone reading this later
  should not assume a larger effect than exists: the constant cannot reprice a FUN ticket,
  only (marginally) qualify one.
- **A `booksInd == 0` row blocked from core can still land on FUN. That is coherent, not an
  oversight.** Core is money the system claims an edge on, so a row with no independent read
  has no business there. FUN explicitly does not claim edge — it is capped by structure
  (one ticket, ≤4 legs, tier-split stake, 0.1% floor) precisely because its EV is not the
  thing being managed. Applying an evidence gate to a bucket that does not assert evidence
  would be inconsistent in the other direction.
- **NAMED TRIGGER — do not lose this.** At the HR overround reading (~2026-08-09): **if the
  measured overround is ≥ 1.20, reopen the FUN question with evidence.** At that level the
  constant is inflating HR fairs by ≥13% relative, `funMinProb` stops being a marginal
  channel, and the FUN 0-13 record acquires a mechanism. Below 1.20, this section stands as
  written and no change is warranted.

### IS `booksInd == 0` DISTINGUISHABLE FROM "NOT QUOTED TONIGHT"? — partly, and the gap is now instrumented

Three cases, and today only the first is cleanly separable:

1. **Market not quoted at all** — no row is created, so there is nothing to block. Not a
   false positive; it simply never enters the pipeline.
2. **Structural absence** — many books post an over, none posts an under (anytime HR is the
   pure case). `booksInd == 0`, correctly.
3. **Feed degradation** — a book that normally posts both sides is missing from this pull, so
   a row that is usually `n = 2` reads `n = 0` or `n = 1`.

**Cases 2 and 3 are indistinguishable from `books` alone**, which is exactly why `no` (books
posting an over at all) was added to `snapshot_props.py` tonight: structural absence shows
*many* overs and zero pairs, degradation shows *few* of everything. Until that series
accrues, the failure direction is at least the safe one — a hiccup makes a row **less**
eligible, never more, and no row is ever admitted by an absent read. That is the same
principle as the Phase 3 band rule.

**What is NOT protected against:** a hiccup on a *thin* day silently shrinking the card while
looking like structural absence. The mitigation is the same one this document already
insists on — a thin card is information, not a bug to tune away — plus the `no` series making
the two cases separable in ~2 weeks.

## THE `1.06` ONE-SIDED HAIRCUT — measured 2026-07-25, NOT changed

`legacy/index.html` L2388 assumes a flat 6% overround on every row with no second side to
de-vig: `fair = oneImp / 1.06`. That path prices **100% of HR rows, 16.1% of total bases,
6.2% of pitcher outs and 2.2% of hits** — and total bases and outs are core-eligible. It
was in no frozen table. It is now (above). **It has not been touched: this is a
freeze-class parameter and changing it is a freeze decision.**

### What the archive can measure

`line-history/data/props`, 12 days, using rows that carry **two** Caesars sides, so the
true overround is observable and the constant can be audited directly:

| market | n | p25 | **median** | p75 | p90 | fair overstated by | relative | czEV overstated by |
|---|---|---|---|---|---|---|---|---|
| `batter_total_bases` | 1,336 | 1.070 | **1.071** | 1.073 | 1.074 | +0.51 pp | +1.0% | **+0.63 pp** |
| `batter_hits_runs_rbis` | 1,560 | 1.070 | **1.071** | 1.073 | 1.074 | +0.54 pp | +1.1% | **+0.65 pp** |
| `pitcher_outs` | 150 | 1.070 | **1.072** | 1.075 | 1.081 | +0.59 pp | +1.2% | **+0.71 pp** |
| `batter_hits`, `pitcher_strikeouts`, `batter_home_runs` | 0 | — | — | — | — | — | — | Caesars posts no standard two-sided quote in these markets |

Against the **multi-book consensus fair** rather than Caesars' own de-vig (n ≥ 2 rows), the
overstatement is slightly larger because it also carries Caesars' offset from consensus:
total bases **+0.70 pp** median / +1.59 p90, H+R+RBI +0.63 / +1.40, outs +0.61 / +1.46.

**By price bucket it is flat** — 1.071 at ≤ −150, 1.072 at −149…+99, 1.071 at +100…+250.
There is no fat-tail-at-long-odds structure in the measurable range, and there is a reason:
the EV overstatement is `0.65 × Δfair × dec`, and `Δfair = fair × r` where `r = overround/1.06 − 1`,
so `ΔczEV ≈ 0.65 × r` **independently of the price**. The bias is *relative*, not absolute.

### So the premise "if the true figure is ~1.12" does not hold where we can see

Measured 1.071, not 1.12 — the constant is thin by ~1.1% relative, worth ~0.6 pp of czEV,
not the ~3 pp a 0.8 pp absolute probability error would manufacture. That is well under
`coreEvMin` (+2%). It is still a **systematic, one-directional** overstatement that pushes
rows *toward* the gate rather than away, on 16.1% of total bases and 6.2% of outs.

### Three limits, stated rather than buried

1. **This is a floor, not an estimate.** The measurement can only use two-sided rows, which
   are the *more* liquid ones. One-sided rows are less liquid, so their true overround is at
   least this fat and never thinner. The direction of the remaining error is known even
   though its size is not.
2. **The engine anchors to the BEST over price across books**, not to Caesars' — `oneImp = iO`
   at L2388, with the `dk_fd` basis branch inactive in `ev_gated`. Line-shopping shades `iO`
   *down*, partially offsetting the thin haircut. The magnitude is **unmeasured**: the archive
   dropped `bo`/`bu` before writing. Fixed 2026-07-25 (below).
3. **HR is entirely unmeasurable from this archive, so the hypothesis is untested — not
   refuted.** No book posted both sides of a HR line on any of 4,524 rows over 12 days, and
   props-history stored only `fair`/`n`/`cz` for them — all null. HR rows in the archive are
   **empty shells with no price in them at all.**

   **This is now scheduled rather than aspirational — see "The HR overround test" below.**

   The sensitivity is what matters, and it is wide:

   | if HR's true overround is… | czEV overstatement |
   |---|---|
   | 1.07 (like the measurable markets) | ≈ +0.7 pp |
   | 1.15 | ≈ +5.5 pp |
   | 1.25 | ≈ +11.7 pp |

   The second and third rows would each dwarf `coreEvMin` entirely. **Which row is true is
   exactly what cannot be determined today.**

### The FUN 0-13 connection — a hypothesis with a test, not a conclusion

HR-anytime parlays were suspended after FUN went 0-13, attributed to structure and variance.
An overstated HR fair is a **mechanistic candidate** for the same record. 0-13 at those odds
is unremarkable on its own — it is not evidence of anything by itself, and this section does
not claim it is. What makes it worth writing down is that the two explanations make
*different* predictions and one of them is now testable.

**The test that settles it** (needs the fields added 2026-07-25, ~2 weeks of accrual): sum
the de-vigged implied probabilities of every listed player's anytime-HR price in a game and
compare it against the **realized average number of distinct HR hitters per game**, counted
free from statsapi boxscores. The ratio *is* the field overround. Nothing in the current
archive supports it because HR prices were never stored.

### Should `1.06` be per-market?

**On the evidence, no — and per-market would be false precision.** The three measurable
markets are 1.071 / 1.071 / 1.072; they are indistinguishable from each other. The real gap
is not between markets, it is between the measurable two-sided rows (1.071) and the
one-sided rows that actually use the fallback (unmeasured, ≥ 1.071), with HR unmeasured
entirely. Splitting a constant by market would encode a difference the data does not show
while leaving the difference it does imply unaddressed.

**Recommendation for freeze exit, not now:** replace the constant with each market's *own
measured* overround, floored at the observed two-sided value, and only once the one-sided
rows can be audited directly. Do not guess a fatter number in the meantime — a guessed 1.12
would be as unevidenced as the 1.06 it replaced.

**"Once one-sided rows can be audited" now has a date, not an aspiration.** `bo`/`no` (added
below) make the one-sided rows auditable directly, and the HR overround test (next section)
is scheduled and self-gating. First reading ~**2026-08-09**; freeze exit is ~2026-09-22, so
the evidence lands with ~6 weeks to spare.

## THE HR OVERROUND TEST — built and scheduled 2026-07-25, first reading ~2026-08-09

`tools/hr_overround.py` + `.github/workflows/hr-overround.yml` (Sundays 15:00 UTC,
`--min-days 14`, so every run before ~2026-08-09 prints INSUFFICIENT and writes nothing).
**Zero Odds API credits** — numerator from the prop archive, denominator from keyless
statsapi box scores.

**The estimator is exact, not approximate.** By linearity of expectation, the sum of
P(player *i* hits ≥1 HR) over a set of players **is** E[distinct HR hitters in that set] —
no independence assumption required, which is what makes anytime-HR measurable this way:

```
overround_HR = Σ implied(bo_i) over listed players
             / realized distinct HR hitters AMONG THOSE SAME PLAYERS
```

`bo` (best over price across books) rather than any one book's price, because `bo` is what
the fallback actually consumes (`oneImp = iO`, L2388). The player set is restricted to the
same population on both sides.

**Scratches are excluded from the primary figure.** A listed player who never appears carries
posted probability and zero chance of a HR, so counting him inflates the estimate — and
Caesars voids those bets anyway. Both variants are reported; the gap between them *is* the
scratch effect (on 2026-07-24: 245 of 250 listed players appeared).

**A bug caught during validation, worth recording.** The archive carries HR at **three**
lines — on 2026-07-24: 0.5 × 250, 1.5 × 231, 2.5 × 210. Keying by player name without
filtering silently keeps whichever line iterated last, and the estimator is exact **only**
for P(≥1 HR): the 1.5/2.5 rows are P(≥2), P(≥3), which do not sum to E[distinct hitters].
A first plumbing test with a single constant fake price could not reveal this — the row
*count* came out right by construction. Re-running with line-distinct fake prices exposed it.
The script now filters `point == 0.5` explicitly, which is also the only HR line the engine
plays (locked rule).

**What 14 days can and cannot settle.** The denominator is realized HR hitters — 22 across
14 games on 2026-07-24, so ~300 by 2026-08-09, giving a Poisson SE of ~5.7% on the ratio.

- **1.07 vs 1.3–1.5 — settled decisively** (a 22–42% gap, 4–7σ). This is the case that
  matters: at 1.3–1.5 the constant is manufacturing double-digit phantom EV on every HR row.
- **1.07 vs 1.15 — NOT settled at 14 days** (a 7.5% gap, ~1.3σ). Separating those needs
  roughly four times the sample, i.e. ~8 weeks. Read the 2026-08-09 number with that in mind
  and do not treat a 1.12 point estimate as a finding.

**READ A NULL RESULT CORRECTLY.** If 2026-08-09 comes back near 1.07, that rules out the
**large** effect and nothing more. It does **not** establish "the constant is fine" — the
test has no power to separate 1.07 from 1.15 at that sample size, and a 1.15 overround would
still be overstating czEV by ~5.5pp, which is larger than `coreEvMin`. The honest reading of
a null at 14 days is: *"not 1.3–1.5; 1.07-to-1.15 remains open, revisit at ~8 weeks."*

Either decisive answer is worth the wait: at ~1.3–1.5 the FUN 0-13 HR record stops being
unremarkable and gets a mechanism; at ~1.07 the constant is fine and HR's problem is
elsewhere.

### Archive fields added 2026-07-25 (zero credits, effective from the next sweep)

`tools/snapshot_props.py` now records, alongside the existing `fair`/`n`/`cz`:

| field | what it answers |
|---|---|
| `fb` | **which** book keys are behind the fair — so "when `booksInd == 1`, is that book sharp or a placeholder-prone offshore key" becomes data instead of argument (the threshold-1-vs-2 decision) |
| `czf` | was the settlement book among them — the self-reference question, exactly |
| `bo` / `bu` | best over/under price across books — **already computed and then discarded**; these are what the one-sided fallback actually anchors to, so without them the 1.06 constant can only be audited at Caesars and not where it is applied |
| `no` | how many books posted an over at all — distinguishes "the best of one" from "the best of six", i.e. how much line-shopping is offsetting the thin haircut |

`n` is unchanged so the 12 days archived before this stay directly comparable. Owner
approved `czf` and `fb` on 2026-07-25; `bo`/`bu`/`no` were added in the same pass to make
the HR question answerable at all, and are called out here rather than slipped in.

### The censored window (2026-07-18 → 2026-07-25) — CENSORED, not corrupted

`CAL_START` **does not move for this.** From 2026-07-18 (first cron) to the 2026-07-25
timezone fix, every cron-written board was missing all games starting at or after
00:00 UTC — **~24% of each slate, west-coast and late-game shaped**
(`docs/rebaseline-2026-07-25.md`). The rows that exist are honest; rows are simply
absent. That is censoring, not contradiction, and it is a different defect from the one
`CAL_START` exists for (duplicated, contradictory statements — wrong numbers).

Moving the boundary again would cost ~7 days, likely push exit 1 past exit 2's
2026-09-22 and make exit 1 decorative, and — worse — establish that every newly found
defect slides the freeze boundary. Owner's call, 2026-07-25: **it stays.**

**OPEN ITEM, dated 2026-07-25 — do not lose this.** Once ~2 weeks of complete boards
exist (i.e. from ~2026-08-08), compare per-market reliability slopes for **post-8 PM ET**
games against **pre-8 PM ET** games. The specific mechanism to test: west-coast parks
skew pitcher-friendly, so the censored sample over-represents hitter-friendly eastern
parks — if the model carries park-conditional bias, the pooled slope was fitted on a
distorted distribution. If the two groups sit within noise, the censoring was harmless
and no cutoff was ever needed. If they differ, cut then, **with evidence**.

Expect the summary's `n` to collapse on the first run after the cutoff and rebuild at
roughly the board's daily row count. While it rebuilds, `mktN` is small, so the
small-sample consensus gate (`consMinN` 100) applies to more markets than usual —
selection tightens. That is the safe direction and it is temporary, but it is a real
change in which tickets clear the gate for the first few days.

## What "done" looks like

At freeze exit we read, in order: average CLV (prob points, with n and SE) overall and
by market · the Discipline report (override creep) · per-market calibration slopes ·
and only then P/L. Decisions come from that reading — not from any single week's
results, and not from feel.

## SILENT CONFIG SPLIT — `context.yml` diverged between `main` and `frontend-rebuild`

Found 2026-07-25 while checking whether the archive-producing workflows matched the code
being read. **GitHub only fires scheduled workflows from the default branch, so `main`'s copy
is the one that actually runs.** Audit of all four scheduled workflows:

| workflow | `main` vs `frontend-rebuild` |
|---|---|
| `line-history.yml` | identical |
| `props-history.yml` | identical — so the 12-day prop archive *is* produced by the code read here |
| `model.yml` | identical |
| **`context.yml`** | **DIVERGED** |

The whole diff is one line in the commit step:

```
-  git add public/model/context.json data/ump_k.json
+  git add public/model/context.json data/ump_k.json data/pen_quality.json
```

`main` — the copy that runs — **never commits `data/pen_quality.json`.**

### Consequence: `shPenQF` has been inert since it shipped

`update_pen_db()` (`tools/build_context.py` L105) is **incremental**: it loads
`data/pen_quality.json`, adds **yesterday only**, trims to the last 30 days, and writes back.
It does not backfill. With the file never committed, every scheduled run restarts from the
last hand-committed copy.

Measured: `data/pen_quality.json` on `frontend-rebuild` was last written by **`4cd1c5d`,
2026-07-20** — the commit that introduced the feature — and contains **exactly one day**
(`2026-07-20`), 26 teams, **2.0–6.0 IP each**.

`shPenQF` (`legacy/index.html` L1641) returns `1` — no effect — unless `row.ip >= 15`. At
runtime the DB is that one stale day plus yesterday: roughly 4–12 IP per team. **No team has
reached 15 IP, so the bullpen-quality factor has returned 1 for every team on every day since
2026-07-20.**

This is a **graceful** failure — the `ip >= 15` guard is doing exactly its job, refusing to
act on thin data — but the feature has never once acted, and nothing surfaced that.

### The fix is one line on `main`, and it is NOT a free fix

Adding `data/pen_quality.json` to `main`'s `git add` makes the DB accumulate; a pen throws
~3–4 IP/game, so teams cross 15 IP in roughly **5 days**, at which point `shPenQF` starts
moving prices for the first time. **That is a dormant engine input becoming live — a
selection change during the freeze, even though no parameter value changes.** It belongs to
the frozen class by effect, not by syntax.

**Not fixed. Owner's decision.** The options are: (a) leave it inert until freeze exit, which
keeps the collection window clean and costs a modeling input that has contributed nothing so
far anyway; (b) fix it now and treat the ~5-days-later activation as a dated, documented
behaviour change like any other. Recorded here rather than quietly repaired, because a config
fix that silently arms an engine input is exactly the kind of change this document exists to
prevent.

## FACTOR ACTIVITY — the drift check the frozen table structurally could not do

### The hole

The frozen-parameter table tracks parameter **values**. Seven engine factors are not
parameters at all — they are **data-availability outcomes**, each returning identity
(`1.0`) when its input is missing, stale, or under a guard threshold:

`shUmpKf` · `shTempF` · `shPitPctF` · `shOppWhiffF` · `shPenF` · `shLaborF` · `shPenQF`

**So an engine input can go inert → live or live → inert mid-freeze without a single
frozen value changing, and the drift detector reports clean.** That is precisely how
`shPenQF` spent its entire life returning 1.0 unnoticed. It is not a one-off: `shUmpKf`
is on course to switch itself **ON** during the freeze, by itself, with no code change.

`tools/factor_activity.py` closes it — zero API credits (committed artifacts + keyless
statsapi). **A material change in any factor's live share during the freeze is a finding
with the same standing as a parameter drift.**

### Baseline reading — real slate, 2026-07-25, 15 games

`context.json` generated 2026-07-25T20:16Z · `priors.json` 2026-07-25T14:43Z

| factor | live | applicable | share | status |
|---|---|---|---|---|
| `shTempF` | 15 | 15 games | **100%** | live |
| `shPenF` | 30 | 30 teams | **100%** | live |
| `shOppWhiffF` | 29 | 30 lineups | **97%** | live |
| `shPitPctF` | 26 | 30 pitchers | **87%** | live |
| `shLaborF` | 11 | 30 pitchers | **37%** | live — **by design**, see below |
| **`shUmpKf`** | 0 | 15 games | **0%** | **INERT — will self-activate ~2026-08-04** |
| **`shPenQF`** | 0 | 30 teams | **0%** | **INERT — pinned, see KNOWN-INERT** |

`shLaborF`'s 37% is **not** a defect: it returns identity for any starter between 85 and
96 pitches per start, which is a deliberate dead zone. Today's 30 probables span
72.0–188.0 ppg and 11 sit outside the band. Recorded so a future reader does not "fix" it.

### Why each zero is zero — different causes, don't conflate them

**`shPenQF` — upstream workflow gap.** `main`'s `context.yml` (the copy GitHub actually
schedules) omits `data/pen_quality.json` from its `git add`. `update_pen_db()` is
incremental, so the rolling DB restarts from the last hand-committed copy every run.
Measured on the **live** artifact 2026-07-25: per-team IP is **3.0–12.3** against a
15-IP guard. Never cleared, on any day, since 2026-07-20.

**`shUmpKf` — guard threshold not yet met, and NOT a workflow gap.** `data/ump_k.json`
*is* git-added and *is* accumulating correctly: 14 days tracked (2026-07-11 → 07-24),
141 league games, 77 umpires. The guard is `db["umps"][hp]["g"] >= 5`
(`tools/build_context.py` L189) and the games-per-umpire histogram is **{1: 29, 2: 36,
3: 12} — nobody has reached 5.** So every game today carries
`hpUmp: {name, g, kFactor: null}` and the factor returns 1.

⚠️ **This one arms itself.** HP duty rotates within a 4-umpire crew, so an umpire accrues
~1 plate appearance behind the dish every ~4 crew games — about 0.21/day at the observed
rate. The 12 umpires already at `g = 3` need two more each: **~2026-08-04**. The `g = 2`
group follows ~2026-08-08, the `g = 1` group ~2026-08-13. **`shUmpKf` therefore goes from
0% to a growing share of games in early-to-mid August — in the middle of the collection
window, silently, with no parameter change and no deploy.** It shifts strikeout-prop
pricing by up to ±8% (clamped 0.92–1.08).

This is the single strongest argument for the factor-activity check existing: nobody
decided this, nobody scheduled it, and without the check nobody would see it.

### `context.yml` git-add audit — `pen_quality.json` is the ONLY gap (confirmed)

`main`'s add list, read from `origin/main` directly:
`git add public/model/context.json data/ump_k.json`

| factor | reads | committed by `main`'s `context.yml`? |
|---|---|---|
| `shUmpKf` | `SH_CTX.games[].hpUmp` — inside `context.json`; its accumulating DB is `data/ump_k.json` | **yes**, both |
| `shPenF` | `SH_CTX.bullpen_last3` — inside `context.json`, recomputed fresh each run, no separate DB | **yes** |
| `shPenQF` | `SH_CTX.pen_quality` — inside `context.json`, but its accumulating DB is `data/pen_quality.json` | **NO** — the only gap |

**What made it invisible:** the `pen_quality` *aggregate* IS present in `context.json` and
IS committed — 30 teams, a `__league` row, plausible ERA/WHIP values. Inspecting
`context.json` shows a fully populated block. Only the *source DB* behind it is missing,
so the aggregate is computed from ~1–2 days of games instead of 30. Nothing looked broken.

### Since when are the live ones live? (is the collection window uniform for them)

| factor | source | live since |
|---|---|---|
| `shTempF` | `g.weather.temp` from the **statsapi slate** — never touches `context.json` | since `SH_V2.ctx` was armed; uniform |
| `shPitPctF`, `shOppWhiffF` | `priors.json` Savant percentiles, rebuilt nightly by `model.yml` | since priors first shipped, 2026-07-11; uniform |
| `shPenF` | `bullpen_last3`, recomputed each run — no accumulation to lose | since `context.yml` shipped, 2026-07-11; uniform |
| `shLaborF` | statsapi season `numberOfPitches`/`gamesStarted` in the slate | uniform; the 85–96 dead zone is by design |

**All four live factors have been live for the whole window.** The collection window is
uniform for them. The two zeros are the entire non-uniformity, and one of them
(`shUmpKf`) is scheduled to break that uniformity in early August unless it is pinned too.

## KNOWN-INERT INPUTS — declared, with dated activation plans

An input listed here contributes **nothing** today, deliberately. Anything that leaves
this list changes engine behaviour and must be dated and announced.

### `shPenQF` — bullpen quality. PINNED OFF (`SH_CFG.penQFrozen = true`, 2026-07-25)

**Owner's decision, 2026-07-25: leave it inert.** Fixing the workflow now would need a
third `CAL_START`-style cutoff, and that pattern is ruled out. Worse, this split is
**invisible to the drift detector** — no parameter value moves — and a silent two-policy
window is worse than a declared one; it would corrupt exactly the channel `CAL_START`
exists to protect.

It was inert *by luck* — a guard refusing thin data. `SH_CFG.penQFrozen` makes it inert
*by decision*, so the factor cannot come alive unannounced if that file ever accumulates
for any reason. Only the two direct unit tests needed an explicit `penQFrozen: false` to
keep exercising the formula. Those tests were **not** rebaselined to `1`: that would have
deleted the only coverage the calculation has, and one of them would then have passed for
the wrong reason (the freeze guard rather than the 15-IP guard it is named for).

> **CORRECTION (2026-07-25), and it applies to `umpKFrozen` too.** An earlier draft said
> setting the flag was *"provably a no-op — the full board suite passed unchanged."*
> **That proof is empty.** `tests/helpers/fixture-env.ts` has **no route for
> `context.json`**, so `SH_CTX` is absent in every full-board test and *both* factors
> already returned 1 there regardless of any flag. A green parity digest says nothing
> about either pin. This is the harness-substitution class again — the fixture cannot
> exercise the context-dependent factors at all, which is also why the seven-factor audit
> had to run against live artifacts.
>
> The real evidence that the pins change nothing today is the **measurement** in the
> factor-activity baseline: `shPenQF` 0/30 (per-team IP 3.0–12.3 against a 15-IP guard)
> and `shUmpKf` 0/15 (`kFactor` null on every game) on the real 2026-07-25 slate. That is
> good evidence, but it is a measurement of today's data, not a test — and it will stop
> being true for `shUmpKf` in early August, which is exactly why it is pinned.
> `tests/pinned-factors.test.ts` supplies the actual coverage by injecting `SH_CTX`
> directly, including an assertion that **unfrozen, the same input moves the factor 7%** —
> so the pin is provably load-bearing rather than merely coinciding with inertness.

**Activation plan — it has a LEAD TIME and needs scheduling, not just a decision:**

1. At freeze exit (~2026-09-22), decide whether to activate.
2. If yes: add `data/pen_quality.json` to `main`'s `context.yml` `git add`. **Nothing
   happens for ~5 days** — a bullpen throws ~3–4 IP/game, so teams need ~5 games to cross
   the 15-IP guard.
3. Then, and only then, flip `penQFrozen` to `false`. **Activation date = workflow fix +
   5 days**, so the two steps must be scheduled apart. Flipping the flag on the same day
   does nothing and would look like the feature failing.
4. Record the activation date; from that date the factor-activity baseline above is
   expected to change, and that change is planned rather than drift.

### `shUmpKf` — umpire K-factor. NOT pinned. **DECISION NEEDED before ~2026-08-04**

Inert today for an honest reason (no umpire has 5 plate-appearances of history) and it
will arm itself in early August with no action from anyone. The options are symmetric with
`shPenQF`: pin it now and activate deliberately at freeze exit, or let it come live
mid-window and record the date so the collection window is known to be non-uniform for
strikeout props from that point. **Not pinned unilaterally — this one changes behaviour
in the direction of doing more, and that is the owner's call.**

### `shUmpKf` — umpire K-factor. PINNED OFF (`SH_CFG.umpKFrozen = true`, 2026-07-25)

**Owner's decision, 2026-07-25: pin it, and the reasoning is stronger than `penQ`'s.**
`penQ` would flip. **This one SMEARS.** Three cohorts cross `g >= 5` across ~2026-08-04
(12 umpires), ~08-08 (36) and ~08-13 (29), so the collection window would have no clean
before or after — just a two-week ramp in the share of games carrying a K-factor. That is
uninterpretable, and it is a model change nobody decided, during a freeze whose entire
premise is that nothing moves.

**Framing corrected:** an earlier draft called activation "the conservative option, so
it's the owner's call." Backwards. **Pinning PRESERVES today's behaviour; letting it
activate is the intervention.** The pin is the conservative action and it needed no
special justification — only the shadow log (below) so nothing is lost by waiting.

**Activation plan, same shape as `penQ`:** decide at freeze exit (~2026-09-22), and by
then the shadow log answers empirically whether it is worth activating at all. No lead
time on this one — the DB is already accumulating correctly, so flipping the flag acts
immediately for whichever umpires have cleared the gate by then.

## THE `g >= 5` GATE AND THE ±8% CLAMP ARE UNEXAMINED — measured 2026-07-25

Both are now in the frozen table. Neither has a stated rationale anywhere in the repo.
**That is the fourth entry of this class**, after `simN`/`simNHR`, the `1.06` haircut,
and the props-regions split.

**The formula, read from `tools/build_context.py` L189–191 — it is a RAW RATIO with NO
shrinkage:**

```python
kFactor = round((u["k"] / u["g"]) / lg_kpg, 3)   # umpire K/game ÷ league K/game
```

So the owner's arithmetic assumption holds exactly. From the live DB (141 league games,
2,357 K → `lg_kpg` = **16.716** K/game, both teams combined):

| `g` | expected K behind the ratio | Poisson relative SE |
|---|---|---|
| **5 (the gate)** | 83.6 | **10.94%** |
| 9 | 150.4 | 8.15% |
| 20 | 334.3 | 5.47% |
| 37 | 618.5 | 4.02% |

**At the gate the 1σ sampling noise (±10.9%) is WIDER than the entire clamp (±8%).** So
on the day the factor activates it is noise saturated against its own bounds and the
clamp is doing all the work — the value carries essentially no umpire-specific signal.
SE equal to the *full* clamp arrives at g ≈ 9.3; SE equal to *half* the clamp needs
**g ≈ 37**, roughly 7× the current gate.

The clamp has the second problem: the owner's prior is that real HP-umpire effects on
K rate run ~3–5% for extreme umpires, which would mean **the permitted range already
exceeds the phenomenon** — a factor that can move a price 8% for something worth 3–5%.
That prior is not measured here and is not treated as established.

**Not changed.** Both are frozen-class, and this is the one section of this document that
would most tempt a "just fix the obviously-wrong number" edit. The shadow log answers it
properly instead: with `kRaw` and `g` recorded per game for the whole window, freeze exit
can ask directly **at what `g` the shadow factor starts predicting realized K totals** —
and set the gate and the clamp from that, with evidence, rather than from arithmetic
about what they cannot possibly support.

## SHADOW MODE — every pinned factor records its counterfactual

**The pattern is Phase 3c's, applied to dormant factors: compute it, log it beside the
row, never multiply by it.** Pinning alone would cost two months — flip the flag at
freeze exit, then wait for outcomes. Shadow logging converts freeze exit from *"flip and
see"* into *"we already know."* Zero credits, zero selection change.

| piece | what it does |
|---|---|
| `tools/build_context.py` | emits `kRaw` (the same ratio at **any** `g`) and `lgKpg` alongside the still-gated `kFactor`. The gate is untouched — `kFactor` remains null below `g = 5`. |
| `shUmpCtx` | one lookup shared by the live factor and the shadow reader, so the two can never drift apart (the pairs-that-should-be-identical rule) |
| `shUmpKfShadow` / `shPenQFShadow` | the value each factor *would* have returned, plus its sample size (`g`, `ip`) |
| `gameInfo[gkey].shadow` | where it is recorded, per game |
| `DayGames.shadow` in `pred-serialize.ts` | rides into the prediction store's `games` block, so **every graded leg can be joined by `gkey` to what the factor would have said** |

Shadow readers return **null** on missing context, never a fabricated `1` — "no reading"
and "reading of exactly no effect" must stay distinguishable, which is the whole lesson
of the silent-no-op class.

**Extend this to any future dormant factor where the input exists but the output is
suppressed.** A pinned factor with no shadow log is a two-month delay bought for nothing.

## WHAT THE PARITY DIGEST ACTUALLY COVERS — scope statement (2026-07-26)

"Parity digest unchanged" has been carrying commits for two days. It is a **much narrower
claim than it reads**, and this section exists so it is never read wider.

### Inputs present when `baseline43.json` is generated

`legacy/index.html` L1547 declares `var SH_V2=null, SH_PRIORS=null, SH_CTX=null;`.
The parity run is `fixtureEngine()` = `createEngine({ fetchJson, today })`
(`tests/helpers/fixture-env.ts`) and it **never calls `set()` on any of them**.

| input | in the parity run | in production |
|---|---|---|
| `SH_V2` | **null** — the entire v2 kernel dormant | armed by `armV2()` (`src/lib/engine-client.ts` L321–330) |
| `SH_PRIORS` | **null** | the real `priors.json` |
| `SH_CTX` | **null** — and the harness has no `context.json` route at all | the real `context.json` |

**So the baseline is a v2-DORMANT board by construction.** That is the documented design —
"dormant = byte-identical baseline43" — but its consequence has not been written down.

### Therefore the digest exercises ZERO of the seven identity factors

Every one is v2-gated, so with `SH_V2 = null` all seven return identity in the parity run:

| factor | gate | live share in PRODUCTION (2026-07-25) |
|---|---|---|
| `shTempF` | `SH_V2.ctx` | **100%** |
| `shPenF` | `shV2Sim()` | **100%** |
| `shOppWhiffF` | `SH_V2.priors` | 97% |
| `shPitPctF` | `SH_V2.priors` | 87% |
| `shLaborF` | `shV2Sim()` | 37% |
| `shUmpKf` | `SH_V2.ctx` | 0% (pinned) |
| `shPenQF` | `shV2Sim()` | 0% (pinned) |

**`shPenF` is 100% live in the real engine and identity in the parity baseline.** The
digest cannot see a change to it, in either direction.

### And there is no armed baseline either

`engine-v2-integration.test.ts` arms the kernel, but at L131 it asserts the armed digest
**`.not.toBe(baseline43)`** — it proves the armed board *differs*, never that it matches a
stored armed digest. Its L125 arming is also `ctx: false`, so even that full-board run
does not exercise the `SH_CTX` factors. `SH_CTX` appears only inside narrow unit blocks
(L216, L274). **There is no digest-level regression net for any armed path.** Armed code
is covered by unit assertions only.

### Where "parity green" was weaker evidence than it appeared

| commit | engine change | inside digest coverage? |
|---|---|---|
| `c5d0594` timezone slate fix | changed which games enter the slate | **YES** — and it was correctly rebaselined (`docs/rebaseline-2026-07-25.md`) |
| `68c5743` price-age lock guard | `shLockCard` — the lock path, not generation | **no** |
| `2ee13c5` `penQFrozen` | v2-gated factor | **no** |
| `29400d0` `umpKFrozen` + shadow readers + `gameInfo.shadow` | v2-gated factors; additive board key | **no** |
| `1d64f53` `propBoard` | additive top-level board key | **no** |

Four of the five engine-touching changes landed **outside** what the digest can see. None
is believed wrong — `pinned-factors.test.ts`, `prop-board.test.ts` and
`lock-price-age.test.ts` are their actual coverage — but "parity green" was not the
evidence it appeared to be for any of them.

### The digest's field scope, for completeness

`digest()` keeps `categories`, `categoriesLive`, `parlays`, `parlaysMixed`,
`parlaysLive` — and within those only `[label, sub, odds, prob, ev]` per row and
`{name, odds, prob, legs[label|prop|odds]}` per ticket. **New row or leg FIELDS are
invisible to it.** So is everything `analyze()` does not return: `shAllocate` and the whole
card path, `shLockCard`, `shFunPick`, `gameInfo`, `propBoard`, `simMarkets`, `luCoverage`.

### DO NOT regenerate the baseline with more inputs

Arming the parity run would invalidate every prior digest comparison in the repo's history
and destroy the one property the baseline has — that it pins the *legacy* math verbatim.
If armed coverage is wanted it must be a **second, separately-named** baseline, and that is
its own decision. Not taken here.

### Consequence for `booksInd`

**The `booksInd` change lands entirely OUTSIDE the digest**, and this needs saying before
it ships rather than after:

- adding `booksInd` to slate rows, cats rows and `legOf` adds **fields**, which the digest
  does not hash;
- the block itself is in `shAllocate`, which the digest does not cover at all — `parlays`
  is the *generated ticket list* from `buildParlaySet`, while the allocator runs later at
  card time.

**So the digest will be byte-identical before and after, and that is not evidence of
anything.** The earlier plan to record "old and new digest" was the wrong instrument. The
evidence to record instead, and what the delta report will contain: rows removed per
market, tickets removed from `shCardPool`, the allocator's `blocked` list with
`reason: "no_ind_consensus"`, and the card composition before/after on the same board.

## THE FUN BUCKET — WHAT DOES AND DOES NOT APPLY (written down 2026-07-26)

**This table exists because the same structural fact was rediscovered three times from
three directions in one week** — via the HR consensus question, via the `booksInd` scope
question, and via the allocator's filter order. Every FUN *cap* was tabled; the *absence*
of everything else never was. That is a documentation failure, and this is the fix.

`shCardCalc` (L3177) computes `alloc = shAllocate(pool, …)` and then calls
`shFunPick(pool, …)` **on the same raw pool — not on the allocator's survivors.** So no
filter inside `shAllocate` touches FUN.

| protection | CORE | FUN |
|---|---|---|
| `coreEvMin` (+2% EV floor) | ✅ | ❌ |
| `coreCzEvMin` (settlement floor, override-proof) | ✅ | ❌ |
| `consMinN` / `consMinEv` (small-sample consensus gate) | ✅ | ❌ |
| **`booksInd` (no independent consensus)** | ✅ | ❌ |
| `coreNoHR` | ✅ | ❌ (HR is FUN-only *because* of this) |
| `coreMaxLegs` (3) | ✅ | ❌ (`funMaxLegs` 4 instead) |
| `coreMaxDec` (15) | ✅ | ❌ (tiers go to +10000 and beyond) |
| `coreKsFillOnly` / `coreKsCap` / `coreKsLegMax` | ✅ | ❌ |
| `perParlayCap` / `minCoreTickets` / `maxCoreTickets` | ✅ | ❌ |
| `dailyBankrollCap` (10% combined exposure, at lock) | ✅ | ✅ |
| `hrrAltMax` (H+R+RBI O1.5+ suspension) | ✅ | ✅ — enforced in `buildParlaySet`, upstream of both |

**`shFunPick`'s complete filter list — all five of them** (L3027):

1. not already used by the core card (`excludeIds`) and leg-disjoint from it (`excludeLegs`)
2. `prob >= funMinProb` (0.1%)
3. `legs <= funMaxLegs` (4)
4. priced in the active selection mode (in `dk_fd`, needs both a basis and a CZ quote)
5. falls inside an odds tier (`funTiers`, by **american odds**, not probability)

Then: sort by posCorr → negCorr → EV, take `funMaxTickets` (1).

**This is not a bug and FUN is not being gated.** That decision stands and the reasoning
has not changed: *a lottery ticket is never +EV — that is what makes it a lottery — so it
is capped by structure instead.* An evidence gate on a bucket that asserts no evidence
would be a category error. What was wrong was that none of this was written down.

**Consequences that follow directly, so nobody has to re-derive them:**

- HR can only reach FUN, and FUN is ungated, so **no HR ticket has ever faced the EV gate,
  the settlement floor, the consensus gate, or `booksInd`.**
- The `−5.66%` one-sided `consCzEv` constant never protected HR — it lives in `shAllocate`.
- `funMinProb` is the **only** probability-sensitive FUN cap, so it is the only one an
  inflated fair can defeat. Tier assignment is by american odds, so inflation cannot move
  a ticket between tiers, change the split, or change the stake.

## READ CORE AND FUN SEPARATELY AT FREEZE EXIT

"What done looks like" reads CLV → Discipline → calibration slopes → P/L. **All four must
be split CORE vs FUN.** At $5/day FUN is **~$1,800/year of deliberately negative-EV
action** — the same order as the entire expected edge from core — and it must be priced
against evidence at exit, not carried on an assumption that it is small.

Instrument readiness, checked 2026-07-26:

| instrument | can it split CORE/FUN? |
|---|---|
| CLV panel | **yes** — `docs/clv.md` records a tier filter |
| Ledger P/L | **yes** — `shLedgerStats` takes ALL / CORE / FUN scopes |
| Receipts | **yes** — `ledger-segments.ts` already reports `funSplit.atLock` / `.supplemental` |
| Calibration slopes | **NO** — `fitReliability` groups by market only; nothing carries the bucket into `GradedPick` |
| Discipline report | **NO** — `discipline()` counts gated-vs-override days; FUN never faces the gate, so it is structurally absent rather than filtered |

### CORRECTION (2026-07-26) — I had the calibration gap wrong

An earlier draft said *"FUN legs are graded into the same reliability fit as core legs, so
FUN outcomes are already moving the per-market slopes that steer core weights."* **That
framing is wrong, and the fit population is why.** Traced through `app/api/calibrate`:

```
for (const date of allDays.slice(-SUMMARY_DAYS))     -> graded.push(...gradedFromBlob(blob))
```

`gradedFromBlob` returns **every settled row in the prediction blob**, and
`boardToPredictions` logs the **whole pregame board** (~203 records/day), not the rows that
reached a ticket. The ledger-join branch below it is explicitly skipped for any date the
prediction store covers (`dayset.has(e.date)`), so on a normal day it contributes nothing.

**So the fit population is ALL PREGAME BOARD ROWS.** A FUN leg is not an extra row in the
fit — it is a row that would have been in the fit whether or not it was ever bet. **Nothing
is contaminated by FUN; the rows are simply unlabelled.** The bucket is *diagnostic*, not
*corrective*.

**What the bucket actually buys**, stated properly: the ability to ask whether the model is
worse **in the probability region FUN operates in** — long-odds, low-probability legs — than
in the region core operates in. That is a real and useful question, and a different one from
"is FUN corrupting core's weights." It cannot be answered today because nothing marks which
rows those were.

**And it does NOT need a new captured field.** The join is fully reconstructible from data
already being captured: the ledger stores every locked leg's `lkey` under `core[]` vs
`funT[]` (`shTicketSnap`), the prediction blob stores every row's `lkey` for the same date,
and the leg-disjointness rule guarantees no `lkey` is in both buckets on one day. So the
bucket is a **query at freeze exit, not a capture during the window** — this is not a
CLV-style unrecoverable field, and adding one would be redundant schema.

### DESIGN INTENT — the fit is dominated by rows that were never bet

Stated because it is load-bearing and was never written down: **the reliability slopes that
steer core weights are fitted on ~203 board rows/day, of which only a handful are ever
backed.** That is calibrating *pricing*, not *betting*.

It is defensible, and it is the right default: the model's job is to price the board, the
sample is ~30× larger, and restricting the fit to bet rows would introduce a selection
effect — bet rows are exactly the rows where the model disagreed most with the market, which
is the least representative slice available for measuring calibration.

But the consequence has to be held in view: **a slope can move on rows the money never
touched.** Anyone reading a per-market slope should read it as "the model prices this market
X% too confidently," never as "this market lost money."

### The Discipline gap was a live misread, and it is FIXED (2026-07-26)

Not merely a reporting limitation. Traced: `overrode` is stamped only when the owner forces
an allocation (`alloc.overrode = force && disciplined mode`). A NO-PLAY day locked with FUN
only therefore produced an entry with `overrode: false`, and `addEntry` folded
`[...core, ...funT]` into ONE line. That day counted as an **honored NO-PLAY** *and* poured
its stake and P/L into the **`gated`** line — the line that is supposed to mean EV-gated core
action. **It read as discipline held while money moved**, and it inflated the gated ROI
denominator with action that never faced a gate. Worse than either of the two failure modes
that were anticipated.

Fixed additively in `src/lib/noplay.ts`: every `DiscLine` now carries `core` and `fun`
sub-lines (totals unchanged, so nothing that read the old shape breaks), and
`noPlay.funOnly` counts NO-PLAY days locked with FUN and no core. The panel shows four rows
(Gated · core / Gated · fun / Override · core / Override · fun) and a "fun-only" chip.
Three tests pin it, including that totals still equal core + fun.

### `booksInd` on ML/RL is a NO-OP in practice — written down, not left to be rediscovered

The gate reads `booksInd` on every leg regardless of market, which is right for symmetry.
On game markets it will essentially never fire, and that should be recorded rather than
turning up as a "finding" in six weeks.

Measured on the captured real slate (15 games, `tests/fixtures/fix39/odds.json`):

| market | `books` (pool) | `booksInd` min / median / max | rows at `booksInd == 0` |
|---|---|---|---|
| ML | 11 | **10 / 10 / 10** | **0** |
| RL | — | **6 / 10 / 10** | **0** |

Game markets are also the only ones fetched with `regions=us,eu` (L1231), so their pools are
the deepest in the system — the line-history archive puts the ML pool median at 31 books.
`ml_booksInd`/`rl_booksInd` reaching 0 would require every book except Caesars to stop
quoting a game. **The rule does no work on ML/RL. It is kept for symmetry and because a
market that silently loses its consensus should still be caught.**

`ml_books`/`rl_books` were deliberately NOT repurposed — they still mean pool size and drive
the "consensus of N books" tag on the board. Changing displayed board text to satisfy a gate
would have been the wrong trade.

## THE FIT POPULATION, THE FUN FRAMING, AND WHAT THE POOLED SLOPE CANNOT SEE

### CORRECTION (2026-07-26) — I had the calibration gap wrong

An earlier draft said *"FUN legs are graded into the same reliability fit as core legs, so
FUN outcomes are already moving the per-market slopes that steer core weights."* **Wrong.**
Traced through `app/api/calibrate/route.ts`:

```
for (const date of allDays.slice(-SUMMARY_DAYS))  ->  graded.push(...gradedFromBlob(blob))
```

`gradedFromBlob` returns **every settled row in the prediction blob**, and
`boardToPredictions` logs the **whole pregame board** (~203 records/day), not the rows that
reached a ticket. The ledger-join branch below it is skipped outright for any date the
prediction store covers (`dayset.has(e.date)`), so on a normal day it contributes nothing.

**The fit population is ALL PREGAME BOARD ROWS.** A FUN leg is not an extra row — it is a
row that would be in the fit whether or not it was ever bet. **Nothing is contaminated by
FUN; the rows are simply unlabelled.** The bucket is *diagnostic*, not *corrective*.

**No bucket field was added, and that is deliberate.** The join is fully reconstructible:
the ledger stores every locked leg under `core[]` vs `funT[]` with its `lkey` and `gkey`
(`shTicketSnap`), and the prediction blob stores the same keys for the same date. This is a
**query at freeze exit, not a capture during the window** — the CLV no-backfill rule does
not apply, and adding a field would be redundant schema.

### DESIGN INTENT — the fit is dominated by rows that were never bet

Recorded because it is load-bearing and was never written down: **the reliability slopes
that steer core weights are fitted on ~203 board rows/day, of which only a handful are ever
backed.** That is calibrating *pricing*, not *betting*.

It is defensible and it is the right default: the model's job is to price the board, the
sample is ~30× larger, and restricting the fit to bet rows would introduce a selection
effect — bet rows are exactly the rows where the model disagreed most with the market, the
least representative slice available for measuring calibration.

> **The consequence, which will matter at freeze exit: a per-market slope means "the model
> prices this market X% too confidently," never "this market lost money."** A slope can move
> on rows the money never touched.

### THE SELECTION EFFECT CUTS BOTH WAYS — disagreement-conditional slope added

The argument above justifies fitting on all rows. It does **not** justify reading only the
pooled number. The model is *used* at the tail: only rows where it disagrees with the market
enough to clear +2% EV are ever backed. A model can be well calibrated on the ~195 rows
nobody bets and badly calibrated on the ~8 that clear the gate. Pooled, that reads ~1.0,
nothing fires, and the bets keep losing.

**This already happened.** H+R+RBI hit **46.3% against 59.2% implied on BET legs** while the
pooled slope over all rows read **1.74**. Two populations, two answers — and the pooled
number is the one that could not see it.

So `fitByDisagreement` (`src/engine2/calibration.ts`) fits the same OLS slope inside fixed
buckets of `|p − pMkt|` — 0–2, 2–5, 5–10, 10–20, 20+ probability points — and
`/api/calibrate` writes it to `summary.disagreement` nightly. Edges are **fixed, not sample
quantiles**, so a bucket means the same thing week to week. Markets are pooled: per-market
slicing at current sample sizes would be powerless.

**Built for Phase 2 to reuse, not duplicate.** This is the same quantity Phase 2 will
measure against the closing line — outcome-graded here, close-graded there. `gapBucket` is
exported so Phase 2 swaps the grading input and keeps the bucketing.

### The Discipline gap was a live misread, and it is FIXED

`overrode` is stamped only when the owner forces an allocation. A NO-PLAY day locked with
FUN only therefore produced `overrode: false`, and `addEntry` folded `[...core, ...funT]`
into ONE line — so that day counted as an **honored NO-PLAY** *and* poured its stake and P/L
into the **`gated`** line, the line meant to represent EV-gated core action. **It read as
discipline held while money moved**, and inflated the gated ROI denominator with action that
never faced a gate. Worse than either anticipated failure mode.

Fixed additively in `src/lib/noplay.ts`: every `DiscLine` carries `core` and `fun` sub-lines
(totals unchanged, so nothing reading the old shape breaks) and `noPlay.funOnly` counts
NO-PLAY days locked with FUN and no core. The panel shows four rows plus a "fun-only" chip.

**On quantifying the historical damage:** the correction is **not forward-only**. `funOnly`
is computed from stored history — locked ledger entries with empty `core` and non-empty
`funT`, intersected with the existing `pl:noplay:v1` log — so opening the Discipline panel
now reports the count over every day already in the log. What remains forward-only is the
log's own start (2026-07-24), which the panel footnote already discloses. The count itself
cannot be computed from here: both the ledger and the no-play log are sync-phrase gated and
that phrase is the owner's to type.

### `booksInd` on ML/RL is a NO-OP in practice

Measured on the captured real slate (15 games, `tests/fixtures/fix39/odds.json`):

| market | pool | `booksInd` min / median / max | rows at 0 |
|---|---|---|---|
| ML | 11 | **10 / 10 / 10** | **0** |
| RL | — | **6 / 10 / 10** | **0** |

Game markets are the only ones fetched at `regions=us,eu` (L1231), so their pools are the
deepest in the system — line-history puts the ML pool median at 31 books. Reaching 0 would
require every book except Caesars to stop quoting a game.

**Note RL's min of 6 against ML's 10: run-line pools are measurably thinner.** Never zero,
so the conclusion stands, but if anything ever erodes these pools **RL is where it shows
first** — the run line is quoted at the modal point only, so a book disagreeing on the point
drops out of the fair entirely.

`ml_books`/`rl_books` were NOT repurposed — they still mean pool size and drive the
"consensus of N books" board tag. Changing displayed text to satisfy a gate is the wrong trade.

### WORKLIST PAIR #1 — RUN, and it found a real precondition

`boardToPredictions` vs `shTicketSnap` for the same leg (`tests/pair-pred-vs-lock.test.ts`).
Result: **the values agree — but `lkey` alone is NOT a safe join key.**

Prop lkeys are `player|market|line`, globally unique on a slate. **ML/RL lkeys are the
literals `ml_home` / `ml_away` / `rl_home` / `rl_away`, identical in every game.** A
freeze-exit reconstruction keyed on `lkey` alone collapses all 15 games' game-market rows
into one and silently mis-attributes them — the exact silent-undercount failure the join was
supposed to be checked for. My first version of the test did precisely this and produced 22
spurious mismatches, all `ml_*`/`rl_*`, none prop.

**The join key is `gkey|lkey`.** Both channels carry `gkey`, and the prediction record's own
primary key is already `gkey|lkey|sub`, so the store was never at risk — only a naive join
was. With the composite key: every ticket leg has a matching prediction row, and `est`/`p`
and `imp`/`pMkt` agree exactly. **Keys are clean, so no bucket field — confirmed by
measurement rather than by reading the code.**

**Supplemental locks preserve leg-disjointness.** `shSupplementalCalc` builds its exclusion
set from the *locked entry's* `core.concat(funT)` and passes it to `shFunPick` as
`excludeLegs`, so a supplemental cannot reuse a leg already on that day's card. No second
failure mode for the join.

## PAIR #5 — THE TYPESCRIPT SIDE. `lid` IS `label|prop`, AND CLV IS NOT WRONG

Checked because if `lid` were bare `lkey`, every ML/RL sighting on a multi-game day would
have been colliding and CLV — the freeze's primary scoreboard — would be the broken thing.
**It is not.** One key is used everywhere, and it is `label + "|" + prop`:

| site | line | use |
|---|---|---|
| `shAllocate` `lUse` | L3010, L3019 | card no-repeat |
| `shFunPick` `usedLegs` | L3115, L3149 | FUN disjointness |
| `shSupplementalCalc` / clash check | L3380, L3403–04 | supplemental disjointness |
| `shGrade` `legRes` | L3435, L3529, L3590–91 | grading |
| `clv-core.ts` | L74–82, L248–50 | sighting + write |
| `clv-report.ts` | L61–64 | aggregation |
| `ledger-segments.ts` | L113–127 | segments, CLV join, result join |

**No ML/RL cross-game collision**: `label` is the team and `prop` embeds the opponent
("Detroit Tigers" | "ML vs Philadelphia Phillies"), so game-market lids are unique per
matchup. The bare-`lkey` hazard found in pair #1 lives in the *prediction* channel, which
correctly uses the composite `gkey|lkey|sub`, and nowhere else.

### The doubleheader collision is real in principle — and prevented by the `lUse` quirk

On a doubleheader both games carry the same teams, so `label|prop` is **identical across
GM1 and GM2**. Left alone, that would mean a GM2 leg overwriting GM1's CLV sighting and its
grade.

It cannot happen, and the reason is item 4's "quirk": **the card's own no-repeat rule uses
the same colliding key**, so the second game's leg is dropped before it can ever be locked.
At most one leg per `lid` exists in any ledger entry, so grading and CLV have nothing to
collide.

> ⚠️ **THIS IS A LOAD-BEARING COUPLING, NOT TWO INDEPENDENT QUIRKS.** `lUse`'s
> `label|prop` dedupe looks over-restrictive — it drops a legitimately different bet (the
> same player in GM2). "Fixing" it to `gkey|lkey` would be correct in isolation and would
> **silently open a grading and CLV collision on doubleheaders the same day**. If that
> restriction is ever lifted, `lid` must become composite in `clv-core.ts`,
> `clv-report.ts`, `ledger-segments.ts` and `shGrade` **in the same change**.

Recorded as a restriction rather than fixed: it is conservative, it is rare, and the
freeze's rule is that a shipped protection is not loosened to solve a volume problem.

## `gnum` AUDIT — every `shGkey` call site supplies it (15 of 15)

The composite join key rests on `gkey` being doubleheader-unique, which rests on `gnum`
reaching every construction site. Audited:

| path | sites | gnum source |
|---|---|---|
| statsapi schedule | L1188, L1239 | `gameNumber` from the schedule hydrate |
| odds events | L1261, L1356, L1443 | `evGnum(away, home, commence_time)` — matched by closest start |
| analysis / sim / cats / gameInfo | L1462, 2015, 2030, 2105, 2154, 2188, 2452, 2588, 2796, 2823 | `g.gnum` carried on the slate game |

**No call site omits it.** The TypeScript side never reconstructs a `gkey` — both
`boardToPredictions` (`r.gkey`) and `shTicketSnap` (`l.gkey`) propagate the engine's value,
so there is no second construction to diverge from the first.

## THE DISAGREEMENT GAP IS SIGNED

`|p − pMkt|` alone pools "model above market" with "model below" — different failure modes,
and the case that motivated the instrument was directional (H+R+RBI over-stating on overs).
Pooled, a biased population averages with a clean one and dilutes precisely the signal.

`fitByDisagreement` now emits `dir: "high" | "low"` on every bucket — 5 gap bands × 2
directions = 10 rows. A test pins it: two populations that would cancel to "well
calibrated" under absolute bucketing stay separated at +20 points and −5 points.

**Documented exit for "markets pooled":** `GAP_BUCKET_MIN_N = 150` (corrected 2026-07-26 — this
paragraph said 300 after the constant had already been lowered; the stale figure is the kind
of drift the frozen table exists to catch, and it was caught by an audit rather than by me).
The slope's SE scales
as ~1/(σ_p·√n), and with the observed σ_p ≈ 0.08 separating a slope 0.15 from 1.0 at 2σ
needs ~300 graded rows **per bucket per market** — ~3,000 in one market across all ten
buckets, i.e. ~9 weeks for `batter_hits` at ~45/day and past a season for `pitcher_outs` at
~11/day. **Check the per-bucket `n`, never the market total**: the tail buckets are the thin
ones and the interesting ones at once, which is where a pooled-by-default habit costs most.

### The armed baseline broke within hours — and the cause was NOT code

Worth recording as its own finding, because the instrument worked and exposed a flaw in
how I built it.

`baseline-armed-v1` was written at ~00:30, and failed at ~05:50 on the `categories`
section. **No code touched the board in between.** The cause: `armedFixtureEngine()` read
**`public/model/priors.json` directly** — the artifact `model.yml` rewrites *every night*.
`b75e905 priors: nightly Statcast refresh` landed at 12:47 UTC, a rebase pulled it in, and
the armed board moved with it.

**A regression baseline wired to a moving input fails for reasons that are not
regressions.** Worse, the reflex it trains is to regenerate the baseline — which is exactly
the habit this freeze forbids, and which would have quietly absorbed a real regression the
first time one coincided with a nightly refresh.

Fixed: `priors.json` is now a frozen snapshot at `tests/fixtures/fix45/priors.json`, beside
the context fixture. Both armed inputs are static.

**The baseline was regenerated ONCE, and that is a legitimate regeneration** — it was six
hours old, had never gated a code change, and the purpose was to *remove* a moving
dependency, not to accommodate a diff. Any future regeneration needs the same standard:
say what changed, why the old value was wrong rather than merely different, and date it.

**General rule, added to the pairs discipline:** a fixture may read a committed artifact,
but never one a scheduled job rewrites. The candidates in this repo are `priors.json`
(`model.yml`, nightly), `context.json` (`context.yml`, 2×/day) and anything under
`line-history`. All three are now either snapshotted into `tests/fixtures/` or unused by
tests.

## MOVING INPUTS — what the freeze does NOT hold still

The frozen table lists parameter **values**. Two of the production engine's inputs are
**artifacts rewritten on a schedule**, so they are outside that table by construction —
the same structural hole the factor-activity check exists to cover. **Not frozen. Written
down**, so the freeze's scope is honest.

| input | rewritten by | schedule | read by production |
|---|---|---|---|
| `public/model/priors.json` | `model.yml` | **nightly**, 09:30 UTC | `armV2()` → `SH_PRIORS` |
| `public/model/context.json` | `context.yml` | **2×/day**, 17:00 + 22:30 UTC | `armV2()` → `SH_CTX` |
| `data/ump_k.json` | `context.yml` | same job | feeds `context.json`'s `hpUmp` |
| `data/pen_quality.json` | `context.yml` (**not committed on `main`**) | same job | feeds `pen_quality`; inert — see KNOWN-INERT |
| `line-history` branch (`data/`, `data/props/`) | `line-history.yml` (hourly), `props-history.yml` (2×/day) | — | **nothing live** — measurement only |

### `priors.json` is CUMULATIVE season-to-date, not a rolling window

Checked, because the two answers have different consequences. `tools/build_priors.py`
pulls every Savant leaderboard with `year=SEASON` (`SEASON = 2026`, L16) — expected stats,
custom skills, percentile rankings, park factors, framing. **No date range, no lookback
window.** Each nightly run is the full season to date.

So the drift is **convergence, not a moving window**: no old data leaves the sample, each
new day is a smaller fraction of a growing total, and a player's prior gets *more precise*
across the collection window rather than shifting to a different population.

**Stated as a design choice rather than left unexamined:** week-1 and week-8 rows ARE
priced by different-vintage priors, and that is intended — the model is meant to stay
current, and a frozen prior would be worse than a converging one by September. The
consequence to hold in view is narrow: **early-window rows carry noisier priors than
late-window rows**, so if a per-market slope is ever read across the whole window, the
early rows contribute more variance than the late ones. Nothing corrects for that today
and nothing needs to — but it is a reason to prefer the second half of the window if a
slope ever disagrees with itself across halves.

### The fixture rule, restated so both halves are visible

- **Tests**: a fixture may read a committed artifact, but **never one a scheduled job
  rewrites**. Enforced by snapshotting — `tests/fixtures/fix45/priors.json` and
  `.../context.json` are static copies. This was learned the hard way: the armed baseline
  broke six hours after it was written, on a nightly Statcast refresh and no code change.
- **Production**: reads them live, **by design**, per the above.

The two rules point in opposite directions and both are correct. The test must hold still
so a failure means a regression; production must move so the model stays current.

## LIFTING THE DOUBLEHEADER RESTRICTION — the ordered procedure

`lUse` drops the second game's leg on a doubleheader because leg identity is
`label + "|" + prop`, which is identical across GM1 and GM2. That looks over-restrictive
and it is — it drops a legitimately different bet. **It is also the only thing preventing a
grading and CLV collision**, because `lid` uses the same key. Encoded in
`tests/lid-coupling.test.ts`; changing either side alone fails the build.

If both games are wanted, this is the procedure — **one change, all six sites**:

1. `legacy/index.html` — `shAllocate`: `lUse` read + write, and `legSet`.
2. `legacy/index.html` — `shFunPick`: `legDup` read + the post-pick mark.
3. `legacy/index.html` — `shSupplementalCalc` exclusion map and the clash check in
   `shLockSupplemental`.
4. `legacy/index.html` — `shGrade`: `legRes` construction (3 sites), and `shTicketId`'s
   hash input, so ticket ids and leg ids stay derived from the same key.
5. `src/lib/server/clv-core.ts`, `src/lib/clv-report.ts`, `src/lib/ledger-segments.ts` —
   `const lid = ...`.
6. **Versioned read — REQUIRED, not one of two options.** Every reader of
   `entry.clv[lid]` and `grading.legs[lid]` must try the new key and then fall back to the
   old one. **Never rewrite stored entries.** New writes use the new shape; historical
   entries keep theirs and are still found. Concretely:
   `const s = clv[newLid] ?? clv[oldLid];` at each of the four read sites
   (`clv-core`, `clv-report`, `ledger-segments`, `shGrade`).
7. `tests/lid-coupling.test.ts` — update `ENGINE_KEY`/`TS_KEY` and the site table in the
   same commit, or the build stays red (which is the point). Add a case asserting the
   fallback read still resolves an old-shape entry.

Use `gkey + "|" + label + "|" + prop` — **not** `gkey|lkey`. `lkey` alone is not unique
either (`ml_home` repeats across games, pair #1), and `label|prop` already carries the
human-readable identity the ledger displays.

### Why the versioned read is mandatory, and how it ranks against no-backfill

An earlier draft of this procedure offered a choice: version the key, **or** accept that
pre-change days lose their CLV join. **That was wrong, and the two are not the same
severity.**

- **No-backfill** says: do not FABRICATE what you did not capture. It protects against
  inventing data.
- **Orphaning** DISCARDS what you *did* capture — sightings that were taken correctly, at
  the only moment they could ever be taken, against an append-only ledger that cannot be
  re-derived.

**Destroying real captured data is strictly worse than declining to invent absent data,
and unlike a missing capture it is self-inflicted and avoidable.** Ranked explicitly here
so a future reader does not treat the second option as equally legitimate: **there is no
second option.**

## THE SLOPE IS NOT USABLE AS A CRITERION — measured, and worse than estimated

Audited 2026-07-26 by three independent derivations (algebraic OLS variance, a 400,000-rep
Monte Carlo with the true Bernoulli DGP, and a GLM cross-check) plus a full repo scan.

### The arithmetic, confirmed

At σ_p = 0.08 and n = 100: **SE(slope) ≈ 0.61** (Monte Carlo; 0.625 analytic with
σ_resid = 0.5, a ~3% conservative upper bound). The `[0.85, 1.15]` band is **0.24 SE units**,
so a perfectly calibrated market lands inside it **19% of the time** and **fails ~81%**.
The estimator is fine — unbiased, simulated mean 0.9997 — **the band is the problem.**

### σ_p WAS AN ASSUMPTION. Measured, it is 2–4× smaller, and the criterion gets worse

`fitReliability` groups **by market**, so the σ_p that applies is the within-market spread of
stated probabilities, not the pooled one. Measured on a real board (199 rows):

| market | σ_p | SE(slope) @ n=100 | **P(pass \| perfectly calibrated)** | n for a 2σ test |
|---|---|---|---|---|
| `pitcher_outs` | 0.022 | 2.27 | **5.3%** | 91,827 |
| `batter_hits` | 0.032 | 1.56 | **7.6%** | 43,402 |
| `batter_home_runs` | 0.036 | 1.40 | 8.5% | 35,068 |
| `batter_total_bases` | 0.036 | 1.38 | 8.6% | 33,915 |
| `rl` | 0.045 | 1.11 | 10.7% | 22,045 |
| `ml` | 0.048 | 1.05 | 11.4% | 19,533 |
| **`batter_hits_runs_rbis`** | **0.058** | **0.86** | **13.9%** | **13,121** |
| `pitcher_strikeouts` | 0.064 | 0.78 | 15.2% | 10,953 |
| *(the assumed 0.08)* | 0.080 | 0.62 | 19.0% | 6,944 |

Pooled across all markets σ_p is 0.177 — but only because it mixes HR at ~13% with hits at
~65%. **That number must never be used here.**

**So for H+R+RBI the retirement criterion passes a perfectly calibrated market 13.9% of the
time. It fails ~86%.**

### The sharper indictment: the band barely discriminates AT ALL

Failing 86% of the time is not the worst of it. Acceptance probability at σ_p = 0.058,
n = 100, by **true** slope:

| true slope | passes |
|---|---|
| 1.00 (perfect) | 13.9% |
| 0.75 | 13.3% |
| 0.50 (badly overconfident) | 11.7% |
| 0.25 | 9.5% |
| 0.00 (no information at all) | 7.1% |

**A market carrying zero information passes half as often as a perfect one.** The test cannot
separate "calibrated" from "worthless". Passing it is near-meaningless evidence of
calibration — which is a worse defect than the failure rate, and the reason the criterion has
to be replaced rather than loosened.

### AND I WAS WRONG THAT THE SLOPE GATES NOTHING (2026-07-26)

An earlier report said *"fitReliability is computed and reported but never gates a weight."*
**False.** `slopeMults` (`src/engine2/calibration.ts:457–462`) reaches production: it is
min-merged into `mults` by `effectiveCalibration` (:498), handed to both arming paths
(`/api/generate` :181/:205 and `engine-client` :347) as `SH_V2.calW`, and lands in `shWm`
(`legacy/index.html:1744`). It acts at `SLOPE_MIN_N = 100` — **lower** than the weekly
channel's 150 — nightly with no rate limit, and its multiplier **is the slope itself**, not a
capped 10% step. On paper it is the looser-n and faster-acting of the two weight channels.

**But it is effectively unfireable.** Its gate is `slope + 1.96·se < 1`, so at the measured
σ_p it needs a fitted slope below:

| market | required fitted slope |
|---|---|
| `pitcher_strikeouts` | < −0.54 |
| `batter_hits_runs_rbis` | < −0.68 |
| `ml` | < −1.05 |
| `batter_total_bases` | < −1.71 |
| `batter_hits` | < −2.06 |
| `pitcher_outs` | < −3.45 |

A calibration slope that negative means higher stated probability predicting a *lower* hit
rate, strongly. **`slopeMults` has almost certainly never moved a weight and at achievable n
never will.** That is reassuring for the freeze — no unnoticed weight movement — but it is a
**fourth inert shipped protection**, after `shPenQF`, `shUmpKf`, and the HRR criterion itself.
Added to the factor-activity discipline: **a gate whose threshold is unreachable is inert in
exactly the way a missing input is, and neither shows up in a value-based drift check.**

### Two caveats that apply to the REPLACEMENT too, not just the thing being replaced

1. **Independence.** Every SE here assumes independent legs. Same-game and same-slate legs are
   correlated; at an average pairwise ρ ≈ 0.05 the 12.9-point H+R+RBI gap moves from ~2.7σ to
   **~1.1σ**. The gap test is the one being proposed as the replacement, so this must be
   checked with clustered SEs before it is relied on. **Not yet done.**
2. **Gap and slope measure different things.** The gap tests the LEVEL (mean bias); the slope
   tests RELIABILITY (whether stated confidence scales correctly). A book can have a zero gap
   and a slope of 0.4. Replacing one with the other **loses something real** — the honest
   position is that the slope is unmeasurable at any n this project will reach, not that it
   was never worth measuring.

### `summary.disagreement` HAS NO READER — my own gap

`fitByDisagreement` is written at `app/api/calibrate/route.ts:251` and read by **nothing** —
not the engine, not the API, not the UI. The instrument built specifically to catch the
failure the pooled slope missed currently gates nothing and displays nothing. Recorded rather
than quietly wired up: adding a consumer is a behaviour change and needs its own sign-off.

## THE EV RE-SCOPE — and two corrections to my own numbers

### Absolute probability points were the wrong axis

Clearing a +2% EV filter needs a probability edge of `0.02 / dec`, so the absolute gap
required **shrinks mechanically as odds lengthen**:

| price | dec | implied fair | min model p | **min gap** |
|---|---|---|---|---|
| −200 | 1.50 | 66.7% | 68.0% | **1.33 pts** |
| −110 | 1.91 | 52.4% | 53.4% | 1.05 |
| +250 | 3.50 | 28.6% | 29.1% | 0.57 |
| +1200 | 13.00 | 7.7% | 7.8% | **0.15 pts** |

Measured on a real board: of 199 rows, the **10 that clear +2% EV all sit in the 0–5 point
buckets** (|gap| median 2.3, max 4.8), while `high 10-20` and `high 20+` — the "tail"
buckets built to catch the failure — take **zero rows per day**. The axis anti-correlated
with the population it existed to isolate.

**EV is the relative gap** (`EV = p·dec − 1`, and with `dec ≈ 1/pMkt` that is `≈ p/pMkt − 1`),
so it is scale-free across prices and it is the axis the gate itself uses.

### Edges, from the measured distribution, with the gate ON an edge

135 priced rows: `<−10%` 46 · `−10..−5` 39 · `−5..−2` 25 · `−2..0` 13 · `0..+2` 2 ·
`+2..+5` 4 · `+5..+10` 3 · `>+10` 3.

```
EV_EDGES = [ <−10 | −10..−5 | −5..−2 | −2..0 | 0..+2 | +2..+5 | +5..+10 | >+10 ]
EV_GATE  = 0.02, on an edge by construction
```

Fixed, not sample quantiles. **Direction (`dir: high|low`) is kept and is NOT redundant with
the sign of EV** — EV is computed at the Caesars price, so a row can be model-high against
consensus and still negative-EV because Caesars is worse than consensus.

### How it feeds Phase 3 — the guessed shrink becomes a measured one

Phase 3 specifies shrinking measured EV by an uncertainty band whose size was to be
**assumed**. With the gate on an edge, the buckets above it are exactly the legs that were
selectable and those below are exactly the legs passed over, so the difference in their
calibration gaps **is the winner's curse in probability points**.

`evGapShrink(fits)` returns the factor Phase 3 should apply: `1` = no curse detected,
`0.6` = a stated +2% should be treated as +1.2%. It returns **`null`** when either side is
under `GAP_BUCKET_MIN_N` — an unmeasured curse must never be silently treated as zero,
which is the same rule as the band's own "absent evidence is not certainty".

### CORRECTION 1 (2026-07-26) — my accrual projection was ~6× too fast

The first real calibrate run since `CAL_START` landed: **`graded: 70`**, not the ~180 I
projected from 203 board rows. Per market: `ml` 15 · `rl` 15 · `batter_total_bases` 9 ·
`batter_hits` 7 · `batter_home_runs` 7 · `batter_hits_runs_rbis` 7 · `pitcher_strikeouts` 5 ·
`pitcher_outs` 5.

I projected from **board row counts** and applied a guessed 10% attrition. Real attrition is
~65% — most prop rows grade void (player not in the posted lineup) rather than won/lost.

**So the `mktN` crossing dates move out by ~6×:**

| market | rows/day (projected) | **graded/day (measured)** | crossing `n ≥ 100` |
|---|---|---|---|
| `batter_total_bases` | ~43 | **9** | ~2026-08-06 *(was 07-28)* |
| `batter_hits` | ~45 | **7** | ~2026-08-09 *(was 07-28)* |
| `ml` / `rl` | ~15 | **15** | ~2026-08-02 |
| `pitcher_outs` | ~11 | **5** | ~2026-09-13 |

**The `booksInd` urgency I asserted was overstated** — total bases crosses in ~11 days, not
3. The rule still shipped correctly and early; the deadline was simply not what I said.

### CORRECTION 2 (2026-07-26) — the weekly adjuster has NEVER fired

`/api/calibration` returns **`log: []`** and **`mults: {}`**. The adjustment log is
append-only in `pl:cal:weights` and survives `CAL_START`, so this is the lifetime record:
**`applyWeeklyAdjustment` has never moved a weight, and no per-market multiplier has ever
been set.** Combined with `slopeMults` being unfireable at the measured σ_p, **neither
weight channel has ever acted.**

That is a **fifth** inert protection, and it makes the count worth stating plainly:
`shPenQF`, `shUmpKf`, the HRR slope criterion, `slopeMults`, and `applyWeeklyAdjustment`.

### The live slopes, as a demonstration of the audit's point

First real fit, n=70 pooled:

| market | n | slope | se |
|---|---|---|---|
| pooled `all` | 70 | 1.697 | 0.412 |
| `ml` | 15 | 2.624 | 2.917 |
| `rl` | 15 | 3.048 | 3.057 |
| `batter_total_bases` | 9 | 0.509 | 6.106 |
| **`batter_hits_runs_rbis`** | 7 | **18.802** | **19.838** |

A fitted slope of **18.8 ± 19.8**. This is not a criticism of the estimator — it is the
audit's conclusion arriving as data on day one.

⚠️ **And one live hazard found in passing:** `pitcher_outs` reports `significant: true` at
**n = 5**. `computeCalibration` guards only `n > 0` (L191); the minimum-sample check lives
separately in `applyWeeklyAdjustment`'s `tier === "ADJUST"` test. **The flag is safe only
because a second, distant check catches it** — the same coupling shape as `lUse`/`lid`. Any
new consumer reading `perMarket.significant` without also checking `tier` would act on n=5.

## THE ATTRITION FINDING — my explanation was CONTRADICTED by the first real board

I said the ~65% attrition (203 board rows → 70 graded) was because *"the 16:00 UTC board
prices players who aren't in the lineup yet."* **The first persisted real board says
otherwise.**

Board for 2026-07-26, generated **16:46 UTC**, 1.35 MB, now retrievable via `/api/board`:

| market | rows | confirmed lineup | projected | projected % |
|---|---|---|---|---|
| `ml` / `rl` | 15 / 15 | 15 / 15 | 0 | **0%** |
| `batter_hits` | 50 | 45 | 5 | 10% |
| `batter_total_bases` | 50 | 44 | 6 | 12% |
| `batter_home_runs` | 50 | 47 | 3 | 6% |
| `batter_hits_runs_rbis` | 50 | 37 | 13 | 26% |
| `pitcher_strikeouts` | 35 | 35 | 0 | 0% |
| `pitcher_outs` | 38 | 38 | 0 | 0% |
| **TOTAL** | **303** | **276** | **27** | **9%** |

`luCoverage: {confirmed: 13, eligible: 15, pct: 0.867}` — **87% of games already had a
confirmed 9-man lineup at generation**, and only 9% of rows were projected. That cannot
produce 65% voids.

**So I do not know the cause of the attrition, and I am not going to supply a second
explanation to replace a contradicted first one.** What is now true:

- The 2026-07-25 board was **never persisted** (persistence shipped 13:05 PT that day,
  after the 16:00 UTC cron), so the 70 graded rows have **no denominator**. The ~65% was
  inferred against the *fixture's* row count, not the real board's.
- **The 2026-07-26 board IS persisted with a real per-market denominator.** Tomorrow's
  09:30 UTC calibrate run grades it, and that is the first true void rate per market.
- 2026-07-26 is a **Saturday** with day games, which is why lineups were up at 16:46 UTC.
  A weekday all-evening slate at the same hour would look nothing like this — which means
  the retime question cannot be answered from one board either.

**The re-derivation of the cron hour on graded rows per run therefore waits for that
measurement, and for at least one weekday board beside it.** Deciding it on this Saturday
board would repeat exactly the error being corrected: generalising from a slate that is not
representative.

## PHASE 2's PREMISE — partially true, and NOT enough to confirm a 3× speedup

The reasoning offered: a voided row has no outcome but does have a closing consensus price,
so close-grading works on the rows outcome-grading discards, accruing ~3× faster.

**The first half is right in principle; the archive says the close is often missing too.**
Measured across 12 archived days — of rows priced in the MORNING snapshot, how many still
carry a price in the day's LAST snapshot:

| | morning rows | also at close | **dropped** |
|---|---|---|---|
| 12-day total | 10,251 | 5,741 | **4,510 (44.0%)** |

Per-day range 0% to 100%. The 100% (07-19) and 88% (07-12) days are almost certainly failed
snapshots rather than real market removal; excluding them the median drop is **~20%**.

Two reasons this does not yet support the 3× claim:

1. **The close is not free.** Even for rows that existed in the morning, ~20% (median) have
   no closing price. A scratched player is exactly the case where the book *pulls* the
   market — so the population that voids and the population that loses its close **overlap
   by construction**, which is the opposite of the assumed independence.
2. **The system's close is `/api/clv`, not props-history** — a sighting within 45 minutes of
   first pitch, taken only for legs on the **locked card**. Phase 2's close-graded population
   is locked legs, not board rows, so the board-row arithmetic above is an upper bound on a
   different quantity.

**So: Phase 2's ~100× sample efficiency stands on its own and is not in question. The
additional ~3× from grading voided rows is unconfirmed, and the honest estimate is smaller —
somewhere between 1× and 3×, resolvable once `/api/clv` sightings can be joined against
voided rows.** I have not produced corrected Phase 2 timelines, because doing so would mean
multiplying a real number by an unverified one.

## FIVE — ACTUALLY EIGHT — PROTECTIONS THAT HAVE NEVER ACTED

`collection-period.md` opens by calling auto-calibration *"the only sanctioned mechanism for
weight movement"*. **The one moving part has never moved.** Written down plainly, because
the document currently implies a system that is actively self-correcting and it is not.

This does not change the freeze. A stationary weight channel during a collection window is
arguably ideal — nothing is contaminating the sample. But it should be a known fact rather
than an assumption.

### Gate enumeration — the full set, categorised

**A. Structurally unreachable at any achievable n** — will not fire, by arithmetic:

| gate | threshold | why it cannot fire |
|---|---|---|
| `slopeMults` | `slope + 1.96·se < 1` at n ≥ 100 | needs a fitted slope below −0.54 to −3.45 at measured σ_p |
| HRR retirement/failure band | slope in [0.85, 1.15] at n ≥ 100 | band is 0.17 SE wide; admits a perfect market 13.9% of the time |

**B. Deliberately pinned** — inert by decision, with dated activation plans:

| gate | flag |
|---|---|
| `shPenQF` | `SH_CFG.penQFrozen` |
| `shUmpKf` | `SH_CFG.umpKFrozen` |

**C. Configured to zero:**

| gate | value |
|---|---|
| `mayAutoRun` | `MAX_AUTO_RUNS_PER_DAY = 0` — prompt-only by design, so it can never auto-run |

**D. Not yet reached, but reachable** — these may well fire later, and are NOT defects:

| gate | needs | current |
|---|---|---|
| `applyWeeklyAdjustment` | ADJUST tier, n ≥ 150/market + Wilson significance + 7-day gap | **`log: []` lifetime — never fired**; n=5–15/market |
| `fitGlobalShrink` → `calG` | n ≥ 150 legs with a logged `pMkt` | `s = 1`, n = 70 |
| quarantine sanity-breaker | n ≥ 30 extreme-edge legs, realised < predicted/2 | `quarantine: []`, n too small |
| `evGapShrink` / `sig` | `GAP_BUCKET_MIN_N = 150` per bucket | far below |

**E. Firing routinely** — for contrast, so "inert" means something:
`coreNoHR` (12 HR tickets/board), `coreEvMin` (+2%: 29 → 1 on the fixture), `coreCzEvMin`,
`consMinN`, `coreMaxLegs`/`coreMaxDec`, the `kellyStakeMult` ceiling (capped $250 → $60),
`hrrAltMax` suspension, `lockMaxAgeMin` (by design, daily), the four live identity factors.

**F. Unknown:** `booksInd` — 0 fires on the fixture because every affected ticket is HR and
`coreNoHR` drops it first. Real-slate behaviour is not yet observed.

**The count is eight in categories A–D, not five.** A gate-activity check — fires per gate
over the window, flagging any at zero — is the natural extension of the factor-activity
check. **Not built; this list is the enumeration requested before building.**

## CLUSTERED SE — the measurement is BUILT, and here is when it reports

`tools/icc.py`. Computes the intraclass correlation of the calibration residual
`e = y − p` at **three** candidate units — game, day, player — and lets the data choose,
rather than defaulting. Negative ICC is reported as-is, never clamped to zero: clamping
would quietly bias every downstream SE upward.

Self-tested against a synthetic blob with an injected game-level ICC of 0.10 — the
estimator recovered **0.127** at 30 clusters, and correctly refused a verdict at 240 rows
(below the 300-row floor).

**Schedule, at the measured 70 graded rows/day:**

| unit | needs | reports from |
|---|---|---|
| **game** | ≥ 20 clusters (15/day) + ≥ 300 rows | **~2026-07-31** |
| **player** | same | ~2026-07-31 |
| **day** | ≥ 20 day-clusters at 1/day | **~2026-08-15** |

So the game-level answer — the unit with the identified mechanism — lands **~2026-07-31**,
and the day-level answer, which is the one that decides whether 2.7σ becomes 1.1σ, lands
**~2026-08-15**. **The HRR amendment stays unsigned until then.** It requires the owner's
sync phrase to run against the prediction store, so it is his to execute, not mine.

## KEPT VERBATIM — the audit's conclusion arriving as data

First real per-market reliability fit, 2026-07-26, n = 70 pooled:

> **`batter_hits_runs_rbis`: slope 18.802, se 19.838, n = 7.**

`batter_total_bases` 0.509 ± 6.106 · `ml` 2.624 ± 2.917 · `rl` 3.048 ± 3.057 · pooled
1.697 ± 0.412. This is not a criticism of the estimator — it is what "the slope needs
~13,100 legs per market" looks like on day one.

## `props-history.fair` IS NOT THE ENGINE'S FAIR — and Phase 2's design turns on it

**Flagged at the field level**, in `tools/snapshot_props.py` beside the field itself, because
the next reader will find the name reassuring. The stored `fair` is a **proportional**
de-vig; the engine runs **Shin** (`shShin2` via `shDevigPair`, armed in production).

### Was the archive's fair recomputable at the engine's de-vig? NO — and here is why

`bo`/`bu` are **cross-book bests**, from potentially different books. De-vigging that pair
prices something no book ever posted. Measured on a live archived row
(`Will Warren|14.5`, 2026-07-26):

| pair | overround |
|---|---|
| `bo` / `bu` (−115 / −109) — the cross-book best | **1.0564** |
| Caesars' own real pair (−115 / −113) | **1.0654** |

The best-of pair carries **0.90 points of vig that does not exist**. Shin's whole mechanism
is how it distributes the overround, so feeding it a fictitious overround produces a
fictitious fair. `fb` named the contributing books but not their prices.

### And a flat correction cannot rescue it — the bias is a PRODUCT, not a constant

| `p_prop` | S=1.02 | S=1.04 | S=1.06 | S=1.10 |
|---|---|---|---|---|
| 0.50 | +0.00 | +0.00 | +0.00 | +0.00 |
| 0.70 | +0.40 | +0.80 | +1.20 | +2.00 |
| 0.90 | +0.80 | +1.60 | +2.40 | **+4.00** |

Zero at an even market for **every** overround; grows with imbalance **and** with the
overround. The archive stored neither the per-book overround nor the pair, so the bias was
not even estimable per row. The owner's read was right.

### FIXED — `fp` captures the per-book pairs, from 2026-07-27

`snapshot_props.py` now emits `fp: {bookKey: [over, under]}` for every book behind the fair.
Verified end to end: from `fp` the per-book Shin fairs recompute to `[0.5022, 0.5099]`,
median **0.5060**, against the stored proportional **0.5057** — different numbers, as
documented.

**Consequence for Phase 2, which is the reason this mattered:** close-grading only the
**locked** legs via `entry.clv[lid]` is 3–8 rows/day. With `fp`, Phase 2 can close-grade the
**whole board at the engine's own de-vig, for zero credits**, from **2026-07-27** forward.
Days 2026-07-12 → 07-26 carry `fair`/`n`/`cz` only, so they support proportional
close-grading and Caesars-only Shin (via `cz`), not multi-book Shin.

## THE CRON HOUR — the model is VALIDATED; what remains is confirmation, not re-derivation

Stated plainly so this does not read as an open question for weeks. On the 2026-07-26 board
`pitch − 3h` was **exact**: 13 games past the window, 13 with confirmed lineups, **zero
anomalies in either direction** — no lineup posted early, none missing inside the window.
That is the assumption the whole 52-day table rests on, and it held on all 15 games.

**So `22:00 weekday / 18:00 Saturday / 17:00 Sunday` stands as derived.** What was broken
was a *field measuring something else*, now fixed. The residual uncertainty is
**slate-to-slate variance, not model error.**

**How many observed days before calling it: FIVE.** Each board is 15 independent
game-level checks of the lineup window, so five days ≈ **75 checks** — enough to catch a
model that is right, say, only 90% of the time (which would show ~7 misses) against a
current record of 15/15. Five days must include **at least one Saturday and one Sunday**,
since those are separate rows in the table with their own hours. At one board/day from
2026-07-26, that is **~2026-07-31**.

Five days confirms the *model*. It does **not** re-derive the *table* — that would need
~7 observations per day-type, i.e. seven Saturdays. The table already has 52 days behind
it and does not need re-deriving unless the model fails.

## GATE ACTIVITY — built, per category, and it caught something on its first run

`tools/gate_activity.py`. Reports **per category, never as one flat count**, because
"structurally unreachable", "deliberately pinned" and "not yet reached" are three different
states and a single never-fired number blurs them. Gates behind the sync phrase are listed
as **UNREADABLE rather than omitted** — an unmeasured gate must not look like a passing one.

First run, real board 2026-07-26 (303 rows, 196 tickets):

| category | gate | state |
|---|---|---|
| **A structural** ⚠ | `slopeMults` · HRR slope band | never / n-a |
| **B pinned** ✓ | `shPenQF` · `shUmpKf` | never, by decision |
| **C zeroed** ✓ | `mayAutoRun` | never, by design |
| **D pending** 👁 | `applyWeeklyAdjustment` · `fitGlobalShrink` · `quarantine` | never — n far below thresholds |
| **E firing** ✓ | `coreNoHR` 12/196 · `coreEvMin` 172/196 · `coreMaxLegs` 82/196 · `coreMaxDec` 15/196 · `hrrAltMax` 18/303 rows · **`booksInd` 2/196** | all firing |

### `booksInd` RESOLVED — category F is empty; it fires on a real board

| market | rows at `booksInd = 0` |
|---|---|
| `batter_home_runs` | **50 / 50 (100%)** |
| **`pitcher_outs`** | **4 / 38** — and outs is **core-eligible** |
| everything else | 0 |

54 of 303 rows. **16 of 196 tickets carry a `booksInd = 0` leg; 12 are HR and die at
`coreNoHR` first; 2 are non-HR and clear +2% EV — they reach the gate and are blocked.**

So the rule is **not** inert on a real slate, the fixture's zero was a fixture artifact
exactly as recorded, and **the never-fired count stays at eight.**

### The check's first run found a stale artifact

`significant` reported **FIRED** while every market sat at n = 5–15, far below
`SIG_MIN_N = 50`. Not a bug in the fix — the **stored summary predates it** (written
2026-07-26T10:23Z; `SIG_MIN_N` was committed after). Category D reads the stored summary,
so **a stale artifact and a live gate look identical unless the timestamp is checked**. The
tool now prints that timestamp on every run with exactly that warning.

## CARD FILL — answered from the persisted board, and the answer is NO-PLAY for a reason nobody named

Run against the real 2026-07-26 board through the **actual** `shAllocate` filter chain,
not a reconstruction of it:

| step | tickets |
|---|---|
| `shCardPool` | 67 |
| `shCoreEligible` (coreNoHR, coreMaxLegs 3, coreMaxDec 15) | 67 → **47** |
| `coreEvMin` (+2% at CZ) | 47 → **18** |
| `coreCzEvMin` (nv_tax) | 18 → 18 |
| **consensus gate (`consMinN`/`consMinEv`)** | **18 → 0** |
| `booksInd != 0` | 0 → 0 |
| **allocator** | **picks 0, sum $0, `noPlay: true`** |

`blocked by reason: {"consensus": 18}`.

**Eighteen tickets cleared the +2% EV floor and every one died at the small-sample
consensus gate.** The card is empty not because the model found no edge, but because
`CAL_START` reset `mktN` to zero, so **every market is "unproven" and every ticket must
also satisfy `consCzEv ≥ −1%`** — which none does, for the arithmetic reason already
recorded (a thin or self-referential consensus reads the hold, not disagreement).

This is exactly what this document predicted — *"while it rebuilds, `mktN` is small, so the
small-sample consensus gate applies to more markets than usual — selection tightens…
temporary"* — and it is now **measured rather than predicted**: the card is NO-PLAY for the
whole `mktN` rebuild, projected to clear around **2026-08-06** (total bases) to
**2026-08-09** (hits) at the measured 7–9 graded legs/day per market.

`minCoreTickets` is 4 and `maxCoreTickets` 6; neither is reachable today. A thinner
10-game slate changes nothing while this gate is universal — the binding constraint is
`mktN`, not slate size.

### CORRECTION to my own booksInd count (2026-07-26)

Last report I said 2 non-HR tickets carrying a `booksInd = 0` leg "reach the gate and are
blocked." **The real allocator run says `booksInd` blocks zero today.** I counted those 2
by applying `coreNoHR` and a `czEv ≥ 2` test directly to `d.parlays`, which is not the
filter chain — `shCoreEligible` also drops tickets on leg count and odds ceiling, and it
removes 20 of 67 before the EV floor is even reached. The 2 do not survive to the gate.

The row-level finding stands and is unchanged: **54 of 303 rows are at `booksInd = 0`,
including 4 of 38 core-eligible `pitcher_outs` rows.** What was wrong was the ticket-level
projection, and the lesson is the one this project keeps relearning: **a filter chain must
be run, not reconstructed.**

### THE 5 PM PT SLATE WAS EMPTY ON THIS DAY

Restricting the pool to games unstarted at **00:00 UTC (5 PM PT)**: **0 of 67 tickets.**
Every game on 2026-07-26 had first pitch before 23:20 UTC — the latest was NYY@PHI at
23:20, i.e. 4:20 PM PT. A 5 PM PT lock on this Saturday would have had **no games left at
all**.

That is a day-heavy-Saturday artifact, not a general result — but it is the first direct
evidence on the schedule question, and it points the same way as the coverage tables: the
Saturday hour (18:00 UTC) exists because Saturday slates start early, and a 5 PM PT lock
habit does not fit a Saturday at all.

## THE NO-PLAY DIAGNOSTIC — it is the second story, and it measures phantom edge

The question was whether the consensus gate is *structurally impossible for parlays*
(compounding, telling us nothing about edge) or whether *the consensus genuinely
disagrees*. Run on all 18 blocked tickets from the real 2026-07-26 board, at the ticket
level **and** leg by leg:

| | |
|---|---|
| individual legs across the 18 tickets | **46** |
| legs individually passing `consMinEv` (≥ −1%) | **0 of 46** |
| leg consensus EV | min −12.6% · p25 −7.6% · **median −7.1%** · p75 −5.7% · max −1.7% |
| tickets whose every leg would pass | **0** |

**It is not compounding.** Not one leg passes on its own. The per-leg bar for a ticket to
clear −1% is only −0.50% (2-leg) or −0.33% (3-leg), and the *best* leg on the board is
−1.7%. So the gate is not an artifact of multiplying legs together — **the de-vigged
consensus disagrees with the model on all 46 legs.**

### Decomposing the −7.1%: how much is hold, how much is disagreement

`consCzEv = p_consensus × czDec − 1`. A leg the consensus agrees with *exactly* still reads
negative, because `czDec` carries Caesars' vig. At the measured Caesars overround of
**1.071**, split evenly, a perfectly-agreeing leg reads **−3.43%**.

> **Measured median −7.10% − structural hold −3.43% = ~3.67 points of GENUINE consensus
> disagreement per leg.**

And the model's own claim on these legs is `czEv ≥ +2%`, so model-minus-consensus is
≥ **9.1 EV points**, which converts to model-over-consensus of:

| `czDec` | probability points |
|---|---|
| 1.8 | 5.06 |
| 2.0 | 4.55 |
| 2.5 | 3.64 |
| 3.0 | 3.03 |

**That is the winner's curse, measured directly, without waiting for a single outcome** —
roughly **3–5 probability points** of model-over-consensus on exactly the legs the +2% gate
selects. It is the quantity Phase 3 was specced to correct with a *guessed* shrink factor,
and it bears on Phase 4's sizing for the same reason.

⚠️ **Caveat, stated because it is load-bearing:** the even-split assumption on the overround
is an assumption. If Caesars loads more vig onto one side, the structural component differs
by side and the 3.67 is off by that amount. The `fp` field added 2026-07-27 makes the
per-side split measurable per row; until then this decomposition is an estimate and the
raw −7.10% median is the measurement.

**`consMinEv` and `consMinN` are NOT changed.** Frozen, and *"requests to loosen a
parameter are declined by default"* applies most exactly when the parameter is inconvenient.
The gate is doing what it was built to do; that it is currently universal is a separate
fact, below.

### THE COUPLING NOBODY INTENDED: a calibration cutoff silently disabled selection

`CAL_START` was a **calibration** boundary — one policy per training population. But
`mktN` is derived from the same graded set, and `mktN` gates **selection** through
`consMinN`. So resetting a calibration counter **turned the small-sample consensus gate on
for every market at once**, and the card has been NO-PLAY since.

Nobody intended that, and it was not written down anywhere before it happened.

> **NAMED CONSEQUENCE — any future cutoff does this again.** Anything that resets, filters
> or re-scopes the graded population resets `mktN` and therefore re-disables selection for
> the length of the rebuild. That includes: a second `CAL_START`-style boundary, a change to
> `calibrationEligible`, a change to `gradedFromBlob`'s filters, a Phase 2 re-scoping of the
> training set, and the ICC work if it ever excludes clustered rows. **Before any such
> change, state the projected NO-PLAY window it creates.**

### Projected reopening, from measured per-market accrual

| market | graded/day (measured) | reaches `mktN` ≥ 100 |
|---|---|---|
| `ml` / `rl` | 15 | **~2026-08-02** |
| `batter_total_bases` | 9 | **~2026-08-06** |
| `batter_hits` · `batter_home_runs` · `batter_hits_runs_rbis` | 7 | **~2026-08-09** |
| `pitcher_strikeouts` · `pitcher_outs` | 5 | ~2026-09-13 |

A ticket needs **every** leg's market proven, so a mixed ticket reopens on its slowest leg.
ML/RL-only tickets are the first to return, ~2026-08-02.

## THE RAW MODEL GAP — measured from stored `pModel`, not inferred

The 9.1 EV points is **post-blend**. `czEv` uses the blended probability, `consCzEv` uses
`imp`, and `p_blend − imp = w·(pModel − imp)`, so:

> **`pModel − imp = (czEv − consCzEv) / (w × czDec)`**

Algebra confirmed. At w = 0.35 and czDec 1.9 that predicts ~13.7 pp. **Measured directly
from the stored `pModel` field on the real 2026-07-26 board, it is larger:**

### Board-wide `|pModel − implied|`, probability points

| market | n | p25 | **median** | p75 | p90 |
|---|---|---|---|---|---|
| `rl` | 15 | 1.9 | **2.9** | 7.7 | 9.7 |
| `ml` | 15 | 0.9 | **4.2** | 10.1 | 11.7 |
| `batter_home_runs` | 50 | 2.0 | **4.8** | 7.5 | 9.1 |
| `batter_hits` | 50 | 2.1 | **5.6** | 8.9 | 10.5 |
| `batter_total_bases` | 50 | 4.2 | **6.6** | 12.7 | 18.2 |
| `batter_hits_runs_rbis` | 50 | 6.8 | **11.0** | 15.9 | 21.2 |
| `pitcher_strikeouts` | 35 | 6.0 | **12.6** | 17.6 | 24.1 |
| **`pitcher_outs`** | 38 | 18.1 | **23.5** | 28.9 | 37.2 |
| **ALL BOARD ROWS** | **303** | 3.6 | **7.6** | 14.8 | 22.8 |

### Selected legs — the tickets that cleared +2% EV

**Denominator correction (2026-07-26, same day):** the first pass reported **46**, which is
leg *instances* (10 three-leg + 8 two-leg tickets). A leg on two tickets was counted twice,
which weights toward legs that combine well. **37 legs are distinct** by `gkey|lkey`. Both
are reported; the distinct set is the one a selection effect must be measured on.

| market | n distinct | **median** | board median | ratio | 95% CI (game-clustered) |
|---|---|---|---|---|---|
| `batter_total_bases` | 6 | 11.9 | 6.5 | **1.81** | [0.82, 2.70] |
| `batter_hits_runs_rbis` | 5 | 15.0 | 11.0 | **1.36** | [0.36, 2.69] |
| `pitcher_strikeouts` | 9 | 12.6 | 12.6 | **1.00** | [0.68, 1.52] |
| **`pitcher_outs`** | **17** | 19.2 | 23.1 | **0.83** | [0.71, 1.22] |
| hits · HR · ml · rl | 0 | — | — | — | — |
| **ALL SELECTED** | **37** | **16.2** | **7.6** | **2.13** | [1.75, 2.78] |
| *(instances)* | *46* | *16.8* | *7.6* | *2.20* | *the first-pass 2.28 figure* |

### THE POOLED RATIO IS ALMOST ENTIRELY COMPOSITION

**No market reaches 2.1, and none has a CI excluding 1.** The pooled figure is what happens
when a gate draws 46% of its legs from the market with the highest baseline while selecting
*less* extreme rows inside it. Decomposed multiplicatively (game-clustered CIs, 4000
resamples, `tools/` scratch script reproduced below):

| term | value | 95% CI | what it is |
|---|---|---|---|
| **POOLED** | **2.13** | [1.75, 2.77] | 16.2 / 7.6 |
| AVAILABILITY | 1.59 | [1.36, 1.99] | 12.1 / 7.6 — which markets the gate can reach at all |
| MIX | 1.34 | [1.10, 1.61] | 16.2 / 12.1 — weighting *inside* those markets |
| **WITHIN** | **1.00** | **[0.90, 1.17]** | 16.2 / 16.2 — **the actual winner's curse** |

`AVAILABILITY × MIX × WITHIN = 2.13` exactly, by construction.

Note the decomposition is **three** terms, not two. "Reweight the selected legs back to the
board mix" is **undefined**: four of eight markets contribute zero selected legs (HR dies at
`coreNoHR`; hits/ml/rl never clear +2%), and you cannot standardise to a stratum with no
sampled units. A first attempt did exactly that and silently dropped those four markets,
reporting a "within" of 1.97 that was really "mix among the four survivors". Splitting the
market-set restriction into its own term (AVAILABILITY) is what makes the rest well-defined.

> ### PHASE 3 BAND: THE DEFAULT IS **NO SHRINK** (settled 2026-07-26)
> `WITHIN = 1.00 [0.90, 1.17]`, and **no market's CI excludes 1**. There is no measurable
> within-market winner's curse on this board; `AVAILABILITY × MIX` accounts for the whole
> 2.13. **Phase 3 applies no shrink**, revisited only when the per-market ratio has been
> re-measured across **≥ 20 boards**.
>
> Two superseded positions, both recorded so neither is re-derived:
> - the **original spec** derived the band from `shBand(nEff)` — a *sample-size proxy*, which
>   cannot see market mix at all and would have mis-set the band by the full 1.59 × 1.34;
> - the **per-market band** (this doc's previous position) is also wrong *as a default*: with
>   every per-market CI containing 1, a per-market band is fitting noise. Per-market is the
>   right SHAPE once it is estimable; it is not yet estimable.
>
> #### ⚠️ WITHIN = 1.00 DOES NOT CLOSE THE WINNER'S-CURSE QUESTION
> **This decomposition measures GAP-BASED selection. The winner's curse is EDGE-ESTIMATE
> ERROR.** They are not the same quantity, and the gate is what separates them: it selects
> on **EV**, and `EV = f(gap, price)`. At long odds a small gap clears +2%, so the gate can
> select *low*-gap rows — decoupling gap from selection entirely.
>
> So `WITHIN ≈ 1.00` establishes exactly one thing: **the gate is not picking extreme-gap
> rows within a market.** It says nothing about whether the selected legs' *true* edge
> matches their *measured* edge, which is the actual question. A reader who takes
> `WITHIN = 1.00` as "no winner's curse, question closed" has substituted the measurable
> quantity for the one that matters — the same substitution `shBand(nEff)` made.
>
> **Phase 2's movement slope is the test of the real quantity.** See `docs/phase2-memo.md`.

### The market-mix lift, stated directly

| market | board share | selected share | lift |
|---|---|---|---|
| **`pitcher_outs`** | 12.5% | **45.9%** | **3.66×** |
| `pitcher_strikeouts` | 11.6% | 24.3% | 2.11× |
| `batter_total_bases` | 16.5% | 16.2% | 0.98× |
| `batter_hits_runs_rbis` | 16.5% | 13.5% | 0.82× |
| hits · HR · ml · rl | 43.4% | 0% | 0 |

**`pitcher_outs` is 17 of the 37 selected legs (46%)** while being 38 of 303 board rows
(12.5%). Its board-wide median gap of **23.1 pp is 3× the board median and 8× `rl`'s**. That
level is a **model property, not selection** — see `docs/pitcher-outs-audit.md`, which finds
a specific defect behind it.

⚠️ **`pitcher_outs` is also the market that reopens LAST** (5 graded legs/day → `mktN` ≥ 100
around **2026-09-13**, essentially freeze exit). So the market driving nearly half the
selected legs will be gated for the entire collection period.

## THE RESTRICTED-MARKET WINDOW (~2026-08-02 → ~2026-09-13) — a named window

Like the censored west-coast window, this is a period whose sample is **not
market-neutral**, and any fit computed across it inherits the restriction.

Markets cross `mktN` ≥ 100 at different dates, and a ticket needs **every** leg's market
proven. Measured on the real board — core-eligible tickets that could actually form from
each proven set:

| from | proven markets | core-eligible tickets formable |
|---|---|---|
| **~08-02** | ml, rl | **8 of 47** |
| ~08-06 | + total bases | 13 of 47 |
| ~08-09 | + hits, H+R+RBI | 28 of 47 |
| ~09-13 | + K's, outs | 47 of 47 |

**Answering the sub-question directly: rarely.** At ~08-02 only **8 of 47** core-eligible
tickets can form, and those 8 must *still* clear +2% EV and the consensus gate on their own
merits. **The effective date for a card that reaches `minCoreTickets` (4) is ~2026-08-09,
not 08-02** — and even then it is drawn from a set with no K's and no outs.

**Consequence to carry:** from ~08-02 to ~09-13 the card is drawn from a **restricted market
set**, so any calibration slope, CLV mean or Discipline figure computed over August is
**not** market-neutral — it is a measurement of ml/rl/TB/hits/HRR only, and it
systematically excludes the two markets where the model sits furthest from the market.
Read August numbers with that stated, or split them at the reopening dates.

Not a change request: this follows from a frozen parameter behaving correctly.

### The schedule cuts BOTH ways — state both, always

`pitcher_outs` reopens ~09-13, i.e. **at freeze exit**. Since `docs/pitcher-outs-audit.md`
found a confirmed defect in that market, the schedule has two opposite effects and the
protective one must never be quoted without the other:

**PROTECTIVE.** The market that would have taken **46% of the selected legs** — every one of
them an UNDER, priced by a model measured at **−2.5 outs per start** against the same books
it is betting into — cannot take daily money for the whole window. The consensus gate is
blocking, by accident, exactly the exposure the audit says is defective. No money rides the
defect during collection. **This is luck, not design**: `consMinN` was set for small-sample
discipline and knows nothing about the outs model.

**COSTLY — but ONLY on the ledger channel. CORRECTED 2026-07-26 (owner-caught).**

> The first version of this section claimed Phase 2 loses "the high-`|pModel − open|` end of
> the regression's x-axis, which is where slope is identified". **That is wrong, and it was
> wrong in the direction that overstated the damage.** The correction and its proof follow;
> the retracted claim is left visible because it would otherwise be re-derived.

`consMinN`/`consMinEv` gate **tickets inside `shAllocate`**, which runs at *card time*. They
do not touch the board, and nothing between the board and the prediction store consults
them. The full path, verified end to end:

| step | what it drops | consults a gate? |
|---|---|---|
| `finalizeCats` (`legacy/index.html` L2461) | nothing gate-related; top 50/market by probability, one side per line | **no** |
| `boardToPredictions` (`src/lib/pred-serialize.ts:153`) | `market === "all"` (dupes), `r.live`, `r.prob == null`, key dupes | **no** |
| `mergeDayBlob` (same file) | rows whose game already started; generation-scoped supersede | **no** |
| `tools/snapshot_props.py` | nothing — it never sees the engine board, it sweeps the Odds API directly | **no** |

**Empirical confirmation, from public data:** `/api/calibration` reports `graded: 70` with
`pitcher_outs` at `n = 5`, while the ledger holds **zero locked cards** and `pitcher_outs`
has **never been ticketed**. Those five graded outs rows exist *because the prediction
channel logs board rows regardless of whether any ticket containing them can lock*. The
gate cannot have removed them; they were graded while the gate was blocking every ticket.

**So Phase 2 keeps its full x-axis.** All 38 outs rows/day continue to accrue, including the
entire high-`|pModel − open|` end — which, given `docs/pitcher-outs-audit.md`, is the most
informative part of the population, not the least.

**What the window DOES still bind:** the **ledger channel** — realised P/L, CLV-on-bets,
Discipline, ROI, and any per-market breakdown of them. All of which are dark anyway (zero
locked cards), so the practical cost in the window is close to zero.

**The one real limitation on the close-graded channel is different and smaller:**
`categories` is capped at **top 50 per market**, so the prediction side of Phase 2's join is
**303 rows/day, not the 1,207 rows `propBoard` carries**. TB (350 available), hits (267), HR
(246) and H+R+RBI (271) are truncated; **`pitcher_outs` (38) and K's (35) are under the cap
and therefore complete**. The positive control is unaffected by the cap.

So an August *ledger* number is not a smaller version of the September engine. An August
*close-graded* number is market-neutral in coverage and merely capped in the four big
markets. **State which channel a figure came from** — that distinction is what the first
version of this section collapsed.

## mktN IS THE GATE THAT DECIDES NO-PLAY — every input audited (2026-07-27)

`mktN[m]` = `summary.reliability[m].n` = graded legs in market *m*. Under `consMinN` (frozen
at **100**) every ticket touching that market must ALSO clear the de-vigged consensus — which
is what blocked all 18 tickets on 2026-07-26. So `mktN` is currently the difference between
NO-PLAY and a live card, and its accrual rate sets the reopening date per market.

### The chain, and what protects each link

| # | input | what it does to `mktN` | protection |
|---|---|---|---|
| 1 | the **window**, `allDays.slice(-45)` | a wider window inflates `n` and silently opens the gate | ✅ **TEST** — `tests/arming-parity.test.ts`, three value tests where the two windows carry deliberately different `reliability`/`globalShrink`/`mktN`, plus a source scan |
| 2 | the **source blob**, `pl:pred:{date}` | a prune would shrink `n` | ✅ **TEST** — `tests/calibration-window.test.ts` source-scans for `DEL`/`SREM`/`EXPIRE` on non-board keys |
| 3 | **`CAL_START`** | excludes pre-restart rows | ✅ **TEST** — `tests/arming-parity.test.ts` ("excludes the two-generator window and admits everything after it") |
| 4 | **`gradedFromBlob`** — the one door into the channel | settled rows only, superseded excluded, `hist` unreachable | ✅ **TEST** — `tests/prediction-idempotency.test.ts` |
| 5 | **`boardToPredictions` row count/day** | **sets the accrual rate** | ⚠️ **BEHAVIOUR ONLY.** Six test files exercise it; **none asserts volume.** A pass that logs 40 rows instead of 300 is behaviourally correct and silently multiplies every reopening date by 7 |
| 6 | **`GRADE_DAYS = 6`** | a row still `pending` after 6 days is never revisited | ❌ **NOTHING.** No test, no drift line. A calibrate outage longer than six days permanently strands those rows as ungraded — they stay in the store, they never reach `mktN` |
| 7 | **`MAX_RECORDS` 800 / `MAX_BYTES` 3 MB** | a day blob over the limit is rejected **413** and the whole day is lost | ❌ **NOTHING.** `hist` is capped at `HIST_MAX = 4`, so the four scheduler entries do *not* grow it without bound — the risk is real but bounded, and unmonitored |
| 8 | the **calibrate cron running at all** | nothing grades, `mktN` freezes | ⚠️ **PARTIAL** — `tools/gate_activity.py` prints the summary's `at` stamp and warns that category D reflects *that* run |

**Links 6 and 7 are the third column: nothing watches them, and both fail by producing a
smaller `n` than reality — i.e. they push the reopening dates out silently.** Neither is
speculative; both are ordinary outage/size failures with no alarm attached.

### The dates were stale, and by how much

Recomputed from actual accrual on 2026-07-27 (`graded = 70` over the two complete dates
2026-07-25 and 2026-07-26):

| market | `n` | measured /day | projected | **doc said** |
|---|---|---|---|---|
| ML · RL | 15 | 7.5 | 2026-08-08 | — |
| **Total Bases** | 9 | 4.5 | **2026-08-17** | **2026-08-06** |
| **Hits** | 7 | 3.5 | **2026-08-23** | **2026-08-09** |
| HR · H+R+RBI | 7 | 3.5 | 2026-08-23 | — |
| K's · Outs | 5 | 2.5 | 2026-09-03 | — |

**Eleven to fourteen days optimistic.** The doc's 08-06 for Total Bases implies ~9.1 legs/day,
double what the store actually shows.

**And the rate is about to change**, which is the argument for measuring it rather than fixing
it: those two dates were priced by the old 16:00 UTC pass, and the four cron-job.org entries
land 4–6 hours later with far more confirmed lineups. Expect the rate to rise and the dates
to pull in. A projection that cannot move would have kept reading 08-06.

### Now recomputed nightly and printed with its denominator

`/api/calibrate` writes `summary.reopen` on every run — per market `n`, `need`, measured
`perDay`, `days`, and the projected date — plus `rateDays` / `rateFrom` / `rateTo`, because a
rate over two complete dates is not a rate over seven and must not read like one. Only
**complete** dates set the rate; today is still grading and would drag it down.

`tools/gate_activity.py` prints it under `consMinN`, flags `<-- THIN` below five dates, and
says outright that a market at **0.0/day is a broken logging path, not a distant date** —
`reopenDays` returns `null` there rather than a far-future date that would read like a
schedule. `tests/gate-rebuild.test.ts` pins the arithmetic, including the measured 07-27 rates
and the doc's implied 9.1/day.

# THE FREEZE HAS TWO EXITS, NOT ONE (2026-07-27)

This replaces the earlier "what done looks like", which listed four exit readings without
saying that three of them will be empty. The accrual arithmetic changed what the freeze will
contain, and the honest structure is a **split**, not a list.

| market | consensus gate reopens |
|---|---|
| ML · RL | 2026-08-08 |
| **Total Bases** | **2026-08-17** |
| Hits · HR · H+R+RBI | **2026-08-23** |
| K's · Outs | **2026-09-03** |

Measured from actual accrual (`summary.reopen`, recomputed nightly). The card stays dark
through most of August; `pitcher_outs` — the positive control — reopens with under three weeks
of the window left.

> ## ⚠️ THE FAILURE MODE THIS SPLIT PREVENTS
>
> **Deciding both exits on one date means deciding the second on n=0 — which is the exact
> error this freeze exists to prevent.** It arrives from the other direction than expected:
> not by acting on too little data because nobody waited, but by acting on too little data
> because a *calendar date* was mistaken for a *sample*.

---

## EXIT 1 — THE PARAMETER EXIT · ~2026-09-22, on schedule

**Decides:** whether the model's disagreement with the market carries information, and
therefore whether the frozen parameter amendments should be applied.

**Evidence it needs:** Phase 2's rung-bucketed movement slope. Board-wide, close-graded, and
it does **not** require a bet to exist — every priced row counts. This is the only channel that
will have a full window in it.

**What a POSITIVE result licenses:**

> The model's disagreement carries information the closing market later confirms.

and, concretely, the freeze-exit amendment bundle — the leg-equivalent EV floor, the
`consMinEv` scaling, the edge-aware base weight, the H+R+RBI clamp. Those are corrections to
machinery that *assumes* an edge exists; a positive Phase 2 is what makes applying them
worthwhile rather than premature.

**What it explicitly does NOT license:** a bankroll increase · loosening `consMinN` ·
unfreezing anything not in the bundle · any claim about realised P/L. Phase 2 does not test
the +2% gate, `consMinEv`, the leg-equivalent floor, the edge-blind base weight, correlation
handling or stake sizing — **and four of those six are themselves on the amendment list.**

**What a NEGATIVE result licenses:**

> The disagreement is not information, and no staking rule fixes that.

Stop tuning selection and staking; go back to the model. `pitcher_outs` is what makes this
readable — it is *known* broken, so negative-on-outs alongside positive elsewhere is a working
instrument, while negative everywhere including markets with no known defect is a different
and worse finding.

> ### 🔒 THE QUALIFIER IS BINDING, NOT A HEDGE
>
> **An attenuated or collinear fit is NO RESULT, not a negative one.** Only a negative slope
> **accompanied by the identification diagnostic showing the fit had power** licenses the
> stopping conclusion. Series B already demonstrates why: its later reading is T-2.5 h or
> earlier, which attenuates any slope toward zero, and rung drift in `pitcher_outs` is nearly
> collinear with a one-signed gap. Either one manufactures a "negative" out of nothing.
>
> If the diagnostic shows the fit lacked power, the correct action is **Exit 1 does not
> happen yet** — not "the model failed".

---

## EXIT 2 — THE BANKROLL EXIT · UNSCHEDULED, and cannot be dated yet

**Decides:** whether the bets make money — sizing, bankroll, whether to keep betting at all.

**Evidence it needs:** the ledger channel. P/L, CLV-on-bets, Discipline (override rate,
sizing adherence). All three are ledger-derived, and the ledger only fills once a market
reopens **and** a card is actually locked.

**State at 2026-09-22:** ≈ **n = 0**. Total Bases will have ~5 weeks of possible bets, K's and
outs under 3, and several markets none at all. CLV-on-bets sights *locked legs only* and has
been dark the entire window.

**What it explicitly does NOT license — today:** any conclusion at all. There is no reading of
an empty ledger, and "no bets lost money" is not a result.

**When it can be dated:** it cannot, yet. The natural rule is the one already in the codebase:
apply `consMinN`-style logic to *bets* rather than graded legs, and set the date once the
post-reopening bet rate is observable — which is first measurable in mid-September, after the
markets reopen. **Do not pick a date before then.** Picking one now would be the same error in
a new place.

---

## What the two exits share, and the one number they both cost

Exit 1 exits **the parameter freeze**: the collection-period pins come off, the amendment
bundle applies, `docs/collection-period.md`'s frozen table stops being load-bearing. Exit 2
exits **nothing about parameters** — it is a capital decision on a separate clock.

> **Because Phase 2 is the entire evidence base for Exit 1, a day without a close is not a gap
> in a redundant record — it is a permanent subtraction from the only channel with anything in
> it.** `tools/close_capture.py`, read daily. That is the whole health story now.

This was not the design. It is what the accrual arithmetic produced, and stating it beats
arriving at 09-22 with four readings of which three are empty.

## Recompute the rates after seven days of the new schedule

The reopening dates above rest on **two complete dates**, both priced by the old 16:00 UTC
pass. The four cron-job.org entries fire four to six hours later with more confirmed lineups
and fewer projected-lineup voids, so accrual should **rise** and the dates pull in.

**Measure it, do not project it** — projecting is the mistake being corrected here. Re-read
`summary.reopen` on or after **2026-08-03**, once seven complete dates exist under the new
schedule, and revise this table from that reading.

# THE REOPENING DECISION — 2026-07-29 IS WEDNESDAY, AND IT OUTRANKS EVERYTHING (2026-07-27 night)

**The mechanism runs backwards from safe, stated plainly: reopening IS the consensus gate
turning off.** `consMinEv` applies only while `mktN < consMinN`; on 07-29 the batter markets
cross 100 and the check that has blocked 100% of tickets stops applying to them. Nothing
"turns on" — a guard expires.

## The 07-26 card under 07-29's gate — measured with the REAL allocator, not projected

The archived 07-26 board fed through `shCardPool` → `shAllocate` (the exact harness path),
three configs. Validation first: **as-was reproduces reality exactly — NO-PLAY, 18 tickets
blocked at `consensus`.**

| config | tickets | staked | card EV | blocked |
|---|---|---|---|---|
| as-was (07-26 real) | 0 — NO-PLAY | $0 | — | 18 @ consensus |
| **batters reopened (=07-29)** | **4** | **$64 of $250** | **+6.0%** | 14 (K's/outs/ml/rl still gated) |
| reopened − TB suspended | 2 | $50 | +6.9% | 14 |

**The card that forms: $33 + $17 on pure H+R+RBI O0.5 parlays (5 legs), $8 + $6 on TB
parlays (6 legs, one at O0.5). Eleven legs, 100% on rows with a catalogued defect:**

| legs | defect class |
|---|---|
| 5 | **HRR O0.5** — the k=10-toward-league shrink (weakest in the engine), the M12-sized sim residual (+10.0), the market whose O1.5+ is ALREADY suspended for losing |
| 5 | TB O1.5 — inherits the hits estimator (M11) + M10's volume noise |
| 1 | **TB O0.5 — M8 itself**: est 62.2 vs imp 55.6, a +6.6 pp "edge" computed from a P(TB≥2) masquerading as P(TB≥1), at Coors |

**The gate does not select randomly from the board — it concentrates on the two
worst-understood markets**, exactly the Phase 2 headline concern (the +2% gate sits 2.13×
further from consensus than the board) arriving with real money attached. And suspending
TB alone leaves a $50 card that is 100% HRR O0.5.

## BUG vs CALIBRATION — the classification, per the freeze's own sanction rule

Three grades, honest about where parameters live:

| grade | items | fix parameter |
|---|---|---|
| **BUG, parameter-free** | **M8** | none — `if(line<1)return 1-P0;` |
| **BUG / proven defect, measured-constant fix** | **M2-pair** (0.140 is a wrong league constant → 0.400 IS the league mean; the paired oo de-noise weight ≤0.1 is branch-4-measured; interlock enforced) · **M11** (intent-vs-behaviour proven; windowed weight ≤0.1 measured, CI includes 0 — the zero-parameter variant is "drop the window term") · **M10** (structural estimator noise; k=75 derived from the variance ratio) | measured, not tuned |
| **CALIBRATION** | M1 (routing + dampening choice) · M3 (weights to fit) · M4 (validation-gated) · M6 (new build) · M7+M9 (re-derivation open) · M12 (per-term choices) · A1/A2/A4 (policy) · A3 (decided-no) | judgment required |

**M8's ship-cost to Phase 2, itemised — the owner's read ("almost nothing") confirms, with
one real cost named:**
- the TB-O0.5 rung bucket splits into pre/post-ship vintages — **the rung-bucketed design
  already isolates it** (≈24 close-joined TB rows/day, ~2 pre-ship days in that one bucket);
- the shadow `m8` column carries the corrected price on BOTH sides of the ship date — the
  per-row comparison never breaks;
- the pinned-defect test swaps to its commented correct block — **failing at ship time is
  its design**;
- ⚠️ **the ONE real cost: `shTbOver` is pre-v2 shared code, so the fix changes the DORMANT
  path — `baseline43` requires a documented regeneration** (the legitimate-regeneration
  precedent; the alternative — gating arithmetic correctness behind SH_V2 — is rejected).

## The options, costed. RECOMMENDATION FOR SIGN-OFF — nothing ships without it.

| option | Phase 2 window | real-money exposure | cost |
|---|---|---|---|
| A: do nothing, reopen | clean | **$64/board-day, 100% defect legs, concentrated in HRR-O0.5** | ~8 weeks of bets the catalogue says are mispriced; the ledger channel fills with donations, not evidence |
| B: ship the whole bundle | **mixed — both engines lose a clean window** | unvalidated amendments live | the original veto reason, unchanged |
| C: suspend worst markets, rest reopens | clean (board rows accrue and close-grade regardless of locks — verified: prediction logging is board-wide) | ~$0 on THIS board's shape (the card was entirely HRR+TB) | the bankroll-exit channel stays dark; volume returns only where defects are small |
| **D (recommended): ship the parameter-free bug + suspend the calibration-defect market** | clean except one self-isolating rung bucket | hits/HR/TB reopen under the +2% gate with M8 fixed; **HRR O0.5 joins its own market's existing suspension** (extend `hrrAltMax`'s pattern down — board-visible, never ticketed) | M8's itemised cost above; K's/outs decided by Friday (M2-pair is bug-grade and ready-once-paired — separate sign-off) |

## D EXECUTED — 2026-07-27 night, on the conditional approval. Every condition answered.

**D's card, measured (item 1)**: 2 tickets, **$14, card EV +2.9%** — six TB-over legs. And the
Castro premise INVERTED under scrutiny: M8 *understates* the over (prices P(≥2) as P(≥1)), so
the +6.6 pp edge exists DESPITE the bug; the fix raises est ≥ 62.2 a fortiori and the leg
strengthens. Castro's over is the ONLY TB-O0.5 leg in the whole 67-ticket pool — no unders
exist to die. **D ≠ C: C is $0, D is $14 + the bug fixed.** Sold correctly: D's value is
mostly the fix, plus a small real card.

**The A2 number (item 5)**: under the leg-equivalent floor both D tickets die (+3.3%/+2.4%
vs the 3-leg +6.12%) → **D+A2 = $0 on this board. The mis-scaling is worth exactly 2 tickets
/ $14 on the first live board.** Noted for the reclassification argument — and A2 alone
(without the suspension) would have KEPT the HRR tickets (+7.0% > 4.04%; +6.6% > 6.12%) while
killing the TB ones: the floor and the suspension are complements, not substitutes.

**SHIPPED (both same-line, zero insertions above L2402):**
1. **M8**: `if(line<1)return 1-P0;` at L1548. The pinned-defect test fired at ship time as
   designed and was swapped to the fix assertions **with a reintroduction plant** (item 4):
   the old formula evaluated inline, proven to differ from truth by >0.15 and to equal the
   1.5 price — the assertions demonstrably catch a `line<2` regression. The fixture cannot
   see M8 at board level (zero priced TB-0.5 rows), so the pure-function test + plant IS the
   regression net; board-level confirmation = `tools/self_consistency.py` reading **zero**
   TB≥1==H≥1 violations on the first post-ship board (118/127 before).
2. **HRR O0.5 suspension**: `hrrAltMax: 0.5 → -1` — every H+R+RBI rung now susp-tagged and
   barred from tickets, board-visible. **Recorded as a REVERSAL, not an extension (item 2)**:
   `docs/hrr-recalibration.md` kept O0.5 active on the 12/19 evidence and the saturation
   argument; it is reversed on defects found since (M11, M10, M12, the +10.0 sim residual).
   **Retirement criterion — named, measurable, dated**: the owner's proposed shadow-based
   criterion cannot work (HRR carries NO shadow price — excluded by scope, no expected
   metric). The measurable equivalent through Phase 2's channel, no bets needed:
   > RETIRES when (a) the HRR pricing repair has shipped (M3 + the per-game estimator
   > disposition) — ⚠️ **that repair is UNSPECCED as of 2026-07-27: no owner, no date.
   > THE SPEC MUST EXIST BY 2026-08-08** (the A3 pattern — a decision must exist), informed
   > by the 08-05 archive re-run; failing that, this suspension is **OPEN-ENDED pending
   > it — stated plainly, not implied** — and the 08-15 review inherits the flag. AND (b) over the trailing **≥300 close-joined HRR O0.5 board rows across
   > ≥10 boards** (~25 close rows/day → ~2 weeks post-repair), **|median(pModel −
   > close_fair)| ≤ 3 pp** and the sim-priced subset's median residual **≤ 3 pp** (today:
   > +10.0). Review dated **08-15** alongside the ICC report either way.

**ITEM-1 COMPLETENESS CHECK (2026-07-27, post-push): the suspension DOES reach FUN — via
the pool, with one instructive scare.** `shFunPick` never consults `hrrAltMax` and never
needs to: both its ticket sources (`parlays`, `parlaysMixed`) are built by `buildParlaySet`,
where the bar removes HRR rows from the candidate set in both disciplined modes — no HRR
ticket exists for either allocator to pick. **Empirically verified under production's
`ev_gated`: pool 0 HRR legs, FUN 0.** The scare: the first scratch run showed 11 HRR legs in
the pool and 4 in FUN — because the bare sandbox runs `selMode` UNDEFINED (the legacy/parity
posture, where the bar intentionally does not apply). That posture is unreachable in
production (armV2 and the cron both set `ev_gated`; `CRON_SEL_MODE` is test-asserted), and
it is also exactly why the baselines never moved.One real edge, already covered:
a pre-deploy cached board carries old parlays — `lockMaxAgeMin:30` forces a fresh
new-engine board before any lock. Legacy modes remain unfiltered by design (parity posture,
manual Settings selection only — which also bypasses every other discipline gate).

**THE PARITY-GREEN CAVEAT (owner's item 3, recorded as instructed): the byte-identical
baselines are ZERO evidence about this deployment.** The fixture is blind to both changes —
no priced TB-0.5 row, no HRR ticket under its legacy posture. That is absence of coverage,
not confirmation — the same blindness class as the project's three false greens. **The only
real evidence is the verification chain in CLAUDE.md's outage block, and nothing locks
Wednesday until it completes.**

**The baseline statement (item 3, the insisted condition — and the event was cleaner than
the plan)**: NEITHER change moved either baseline. `baseline43` is **byte-identical before
and after — digest `e67eaad0ad34b99c5aa2050cdd27f2bc` both sides** (M8: the fixture prices
no TB-0.5 row; suspension: no fixture ticket carried an HRR-0.5 leg). The armed baseline
likewise. **Every prior "baseline43 unchanged" claim in this project was made against this
same file and remains valid against it; there is NO vintage split in the parity record.**
Had a regeneration been needed, the recorded conditions were: old+new digests, enumerated
row diff, dated, cause-named, with the not-a-silenced-test language.

**Outs (item 6, decision moved to WEDNESDAY)**: the full closed-form outs fix is three
parts — the **M2 pair** (0.140→0.400 + the `offense()` xSLG de-noise; bug-grade, constants
measured, the interlock guard enforces the pairing mechanically) and the **estimator
restructure** (kill the last-30 cliff, season-anchored `shShrink(season_ipg, gs, ~3.4,
Lipg)`; measured-constant grade). Correcting the item's premise: **k=4 is NOT one of the
defects — it measured RIGHT (optimum 3.4)**; the cliff and the league target are the
defects. The leash items are SIM-side only (the closed form never consumes `leashOf`) and
belong to M2′, not this fix. Timeline: build Tuesday, test + any regeneration Wednesday
(outs rows DO exist in the fixture, so baseline movement is expected there — the documented
regeneration lands then), sign-off Thursday morning, deploy before Friday's reopen. **If
Wednesday's review says not-ready, outs gets a suspension flag Thursday** on the HRR
pattern (a new flag; half-day).

**E, the zero-code option, and why it loses (item 7, recorded so the reasoning survives the
owner)**: letting everything reopen and simply not locking costs nothing and requires no
change — and it replaces a rule with a decision. This system exists to remove in-the-moment
judgment; a suspension is a pre-commitment, "I'll just not bet" is the thing that fails on a
Tuesday when the card looks good. D over E is the same argument as the discipline ledger's
existence.

**The re-derived sequencing argument**: the original sign-off assumed shipping nothing cost
nothing — true while the card was dark to ~09-22, false the moment reopening moved to
Wednesday. The premise "one engine vintage per measurement window" still holds — which is
why D ships ONLY the parameter-free bug whose vintage break self-isolates in one rung
bucket, and handles every other defect by suspension (which costs Phase 2 nothing) rather
than by amendment (which costs it the window). The full bundle still waits for the shadow
series and exit. **A is the only option with an unbounded downside; B still burns the
instrument; C is safe but leaves M8 mispricing a live market's board rows; D is C plus the
one fix whose correctness is arithmetic.**

# CONSENSUS DEPTH IS A FUNCTION OF TIME-TO-FIRST-PITCH (2026-07-27)

The snapshot-1-vs-snapshot-2 relabel (mean `n` 1.40 → 1.66, `czf` 2.2% → 0.3%) implied depth
grows as first pitch approaches. Measured directly across the props archive, 13 days, every
snapshot × every row, bucketed by hours-to-first-pitch:

| h to first pitch | rows | mean `n` | median | **`n ≤ 1`** | `czf` |
|---|---|---|---|---|---|
| 18–20 | 511 | 1.23 | 1.0 | **67%** | 0.0% |
| 16–18 | 1,156 | 1.23 | 1.0 | 65% | 0.0% |
| 14–16 | 3,169 | 1.41 | 1.0 | 57% | 0.8% |
| 12–14 | 2,385 | 1.48 | 1.0 | 54% | 1.3% |
| 10–12 | 1,757 | 1.41 | 1.0 | 56% | 3.5% |
| 8–10 | 2,053 | 1.39 | 1.0 | 56% | **6.3%** |
| 6–8 | 331 | 1.43 | 1.0 | 54% | 0.0% |
| 4–6 | 1,920 | 1.57 | 1.0 | 54% | 0.0% |
| **2–4** | 6,724 | **1.70** | 1.0 | 54% | 0.4% |
| 0–2 | 2,546 | 1.62 | 1.0 | 55% | 0.0% |

**Depth rises — 1.23 → 1.70, about +38% — but not monotonically** (a dip at 6–12 h, and 0–2 h
sits below 2–4 h). Directionally the hypothesis holds; "monotonic" does not, and the flat
`median n = 1.0` at every horizon is the number that matters more than the mean.

## What the retime actually buys, counted

A 16:00 UTC board against a 23:15 median first pitch is **~7 h out**; a 22:00 board is **~1.25 h
out**. Reading the table across that move:

| | 16:00 board (~7 h) | 22:00 board (~1.25 h) | change |
|---|---|---|---|
| mean books behind a fair | **1.43** | **1.62** | **+13%** |
| rows with `n ≤ 1` | 54% | 55% | **none** |
| `czf` — Caesars inside its own fair | 0–6% | ~0% | **effectively eliminated** |

> **Two of these are real and one is not.** `czf` — the pathology where the "independent"
> consensus check is a de-vigged Caesars price — is **a morning phenomenon**, peaking at 6.3%
> eight to ten hours out and vanishing inside four. The retime removes it. Depth improves 13%.
> **But `n ≤ 1` does not move at all: 54–55% of rows have one book or fewer at every horizon**,
> so the retime reduces the thinness problem without touching its core.

**Add to the retime's measured value: elimination of `czf`, +13% consensus depth. Do not claim
it fixes thin consensus — it does not.**

## `booksInd == 0` — baseline recorded, the comparison lands tomorrow

On the 2026-07-26 board (built 16:46 UTC, ~6.5 h out): **54 of 303 rows at `booksInd == 0`
(17.8%)**, carried by 16 of 196 tickets. Full distribution is long-tailed — 61 rows at 1, 66 at
3, 13 at 31.

**This cannot be compared across hours yet**: `booksInd` is a board field and exactly one board
exists. The first 22:00 UTC board answers it directly, and the props table above predicts the
rate should **fall** — but predicts it weakly, since `n ≤ 1` is flat. Recorded as a prediction
so it can be wrong.

# ⚠️ CORRECTION (2026-07-27) — shUmpKf IS NOT STRUCTURALLY INERT. THE WRITE PATH WAS ERASING ITS INPUT.

**Retracted, same day.** The earlier entry read `hpUmp: null` on 0 of 12 games in the current
`context.json` and concluded the factor was unreachable. That file was written by the **morning**
run. Git history says the opposite:

| commit | hpUmp resolved | commit | hpUmp resolved |
|---|---|---|---|
| 07-26 **20:32** | **15/15** | 07-27 07:48→10:55 | 0/12 |
| 07-25 **20:16** | **14/15** | 07-25 06:38 | 0/15 |
| 07-24 **20:50** | **14/15** | 07-24 07:42 | 0/15 |
| 07-23 **20:40** | **5/5** | 07-23 07:45 | 0/5 |
| 07-22 **20:49** | **14/17** | 07-22 07:43 | 0/17 |
| 07-21 **20:49** | 7/15 | 07-21 07:43 | 0/15 |
| 07-20 **20:55** | 11/15 | 07-20 08:30 | 0/15 |
| 07-19 **20:12** | **15/16** | 07-19 07:35 | 0/16 |

**Every evening run resolved 11–15 of 15 umpires. Every following morning run overwrote them
with nulls.** The input was never missing — it was being destroyed daily, and the reading that
called it "structurally inert" was taken from the wreckage.

Two errors in one, and they are different in kind: reading a **single artifact** instead of the
series, and then attributing to *arithmetic* a failure that was *a write*. The second is the
worse one — "unreachable by arithmetic" is a claim that no schedule change can fix, and it
would have closed the thread.

## The defect: replace, not merge

`tools/build_context.py` built a fresh object and wrote it over the file. `officials` are
published by statsapi only near first pitch (its own comment says so), so a run at 07:4x
resolves nothing and a run at 20:3x resolves nearly everything — and the loser was whichever
ran last.

**Fixed 2026-07-27 — `merge_prior()`, and the order was deliberate: the merge FIRST, the
cadence second.** Self-pacing alone would still leave a run that fails to resolve wiping good
data; a merge alone leaves the data safe even if every schedule change fails.

| rule | why |
|---|---|
| a populated field is never replaced by null | the actual defect |
| **scoped to the same `date`** | carrying yesterday's umpire onto today's game is a **fabricated** input, which is worse than a missing one |
| a run that DOES resolve always wins | otherwise the first reading of the day would freeze |
| `bullpen_last3` / `pen_quality` covered too | **`shPenF` is 100% live in production** — a null-overwrite there disables a working factor with no symptom anywhere |
| it logs what it preserved | "0 resolved, 15 preserved" and "0 resolved, 0 preserved" are different events |

`tools/test_build_context.py` — **7/7**, fixtured on the real 07-26 20:32 context.

## Nothing is unrecoverable — the whole window is in git

Every day from **2026-07-16** onward has one commit per day carrying resolved umpires. The
shadow log's collection window is fully reconstructible from `git log -- public/model/context.json`
by taking the **20:xx commit of each date**. No backfill has been run; recorded as available.

## EXCEPT: one captured-field gap — CZ hits/K's alternate quotes (M13, recorded 2026-07-28)

The heading above is true of the context pipeline and FALSE of the props archive: the
archive stores PARSED rows from a request that never included the `*_alternate` market
keys, and Caesars posts its entire hits and K's ladders (including the main lines) only
under those keys. **Every Caesars hits/K's quote for the archived fixture-days
2026-07-12 → 2026-07-28 is unrecoverable** — a field not captured is unrecoverable, the
same rule as closes. Raw payloads exist for exactly TWO events, both 2026-07-28 (one
canonical-keys, one alt-keys — the M13 evidence pair in `docs/multibook-memo.md` §2c);
nothing else can be reconstructed. The prospective fix (adding the three alt keys to the
sweep) is specced in the memo, guard-encoded as an OBSERVED-RED expected failure
(`tests/sweep-covers-engine.test.ts`, flips with the fix), and awaits the owner's
sign-off on the credit cost; the pre-fix days keep their canonical-key vintage forever.
(2026-07-28, later: the cross-instrument join to production boards was RUN before this
was restated — matched 36/27 hits/K's row keys on 07-26 and died on `fp` absent from
0/1,229 archive rows that day; boards exist only for 07-26, `fp` only from 07-27 — zero
days carry both. The join becomes feasible the first board+`fp` day. Memo §2c carries
the printed query.)

## THE CREDIT BUDGET DOES NOT REACH THE PARAMETER EXIT — collection-design defect (2026-07-28, owner's item)

**Measured aggregate** (the odds proxy passes The Odds API's own headers through, read
2026-07-28 evening): **2,317 remaining / 17,683 used** — a 20,000/cycle plan. The cycle's
reset date is on the dashboard only; it is the single decisive unknown below.

**Two burn derivations, printed because they contradict (the pre-committed branch):**
- **A — projected, sweep-only**: the sweep script's own budget note (6 cr/event × ~15
  events × 2 sweeps) ≈ **180/day**. This number was PROJECTED, never measured from a log,
  and covers ONE instrument.
- **B — aggregate-implied**: IF the cycle began 07-01, 17,683 over ~28 days ≈
  **~630/day** average. The contradiction resolves as: A is one instrument's share; the
  total includes `/api/generate` (~120/fire, up to 3 slots/day), game-lines sweeps, CLV
  sightings (1–6 cr/sighted game), and client generates. **B is the honest basis and its
  denominator (cycle start) is unverified from here.**

**Per-call costs**: manual generate curl ≈ 120; each cron generate slot ≈ 120/fire;
archive sweep ≈ 90–96/sweep; CLV sighting 1–6/game bounded by locked legs; the events
list is free.

**Runway**: the current cycle's 2,317 dies in **~3.7 days at rate B (~08-01)** or ~13
days at rate A (~08-10). The freeze runs to ~09-22 (56 days): 10,080 needed at A,
~35,000 at B — **the current cycle reaches neither; whether the PLAN does depends
entirely on the reset date and a burn plan.** If the reset is calendar-monthly (08-01),
the acute risk narrows to this week's overlap of reopen days with a near-empty cycle.

**THE DARK-WINDOW BURN, MEASURED (2026-07-28 late — owner's item; the pre-committed
"sweeps are the spender" branch fires):**
- Two quota readings ~2.2 h apart (evening, both printed verbatim from the proxy's
  passthrough): **2,317/17,683 → 2,317/17,683 — zero burn in that window**, and the
  headers carry **no reset/period field** (full header set on record; reset date stays
  PENDING, dashboard-only, nothing below depends on it). `/events` confirmed free (the
  carrier calls themselves moved nothing).
- **07-29 morning reading (owner's item 8): 1,676 / 18,324 — 641 spent since 05:15Z,
  ZERO of it this session's** (everything ran on archived boards). Attribution closes
  exactly: the 07-29 archive already holds 8 snapshots / 114 event-sweeps, 7 of them in
  the 08:04–10:49Z cluster since the reading ≈ ~670 computed vs 641 measured — the
  cadence defect, no unknown spender. **Runway at this rate: ~2.4 days (~07-31).**
- The burn arrives in BATCHES, visible in the public Actions log (last ~29 h: props-history
  **11 runs**, line-history 4, board-archive 2, context 2, priors 1 — all success) and
  counted exactly in the archive: **2026-07-28 holds 9 snapshots / 123 event-sweeps ≈
  ~738 credits in one day from the props sweeps alone** (vs 2 snapshots ≈ ~100/day on
  07-26 and 07-27). Generate: 0 (dark, 401). CLV: free exits (no locked card). Client
  generates: unknowable from here (device-side).
- **The mechanism is a collection-cadence defect, not mystery spend**: the snapshot
  clusters land at 08:02/08:05/08:07 and 10:04/10:14/10:16 — the redundant-cron lottery
  now DELIVERS clusters, and `_snapshot_kind` rate-limits only `close` (`MIN_GAP_S`);
  **a `pre` reading has NO gap — every landed tick pays a full ~16-event sweep** for
  three-minutes-apart duplicates carrying nothing. (This same clustering is what M15's
  duplication rode in on.)
- **Forward rate, measured on 07-28's composition: ~740–760/day → 2,317 dies ~07-31,
  BEFORE Friday's K's/outs reopen.** The aggregate-implied ~630/day reconciles as the
  average over lighter days — no unknown spender; the impossible branch does not fire.
- **MIN_GAP SHIPPED (2026-07-29 — the owner's SOLE authorized exception; supersedes the
  spec-only wording that stood here; all four conditions met)**: (1) guard
  `tests/min-gap.test.ts` observed RED before the script edit, GREEN after, same commit;
  (2) **VINTAGE STAMP: the props-archive cadence segments pre/post this commit** —
  snapshots before it were taken under the no-pre-gap cadence and are never
  reinterpreted under the new one (the CLV-decoupling rule verbatim); (3) the measured
  information cost, printed beside the change: the deduped 3-minute duplicates carried
  **3–5% changed rows at mean |Δfair| 0.014–0.042 pp** (08:02→08:05: 4%/0.042;
  08:05→08:07: 5%/0.014; 10:14→10:16: 3%/0.001) vs **20%/0.214 pp across the 14-minute
  gap**; (4) **every cron entry stays** — redundancy is the reliability property;
  MIN_GAP dedupes PAYMENT, not delivery (`_snapshot_kind` skips a `pre` within
  `MIN_GAP_S` of any paid snapshot; the close branch runs first and is never blocked).
  Replayed on 07-28's real firing times: **4 paid of 10**. **CONFIRMING INSTRUMENT,
  pre-committed (created ≠ fires ≠ landed)**: the next morning cluster's day-file must
  append **one paid snapshot per 40-minute window with the N−1 skips visible as
  "skipped: pre within MIN_GAP" lines in the other runs' Actions logs — two paid sweeps
  inside one 40-minute window means it did NOT land.** Per-fire generate cost, computed
  from its request URLs (no generate since 07-26): ~**150/fire**; each cron slot and
  the manual curl cost the same.
  **⚠️ CLUSTER-BLINDNESS, PRE-COMMITTED BEFORE THE 08:02Z TEST (2026-07-29, owner's
  item 5 — written so tomorrow is a confirmation, not a discovery)**: `_snapshot_kind`
  reads the LAST PAID TIMESTAMP from the COMMITTED day-file (`day["snapshots"]`,
  tools/snapshot_props.py L143–151), `props-history.yml` declares **NO concurrency
  group**, and its Commit step is a plain `git push` with no pull/retry. Three
  runners spaced ~3 min that all check out before any commits will each read the
  same stale state and ALL PAY — **MIN_GAP as shipped dedupes SPACED ticks, not
  overlapping clusters** — and a second overlapping pusher is REJECTED non-ff: its
  snapshot is PAID AND LOST, worse than a duplicate. The 4-of-10 replay was
  sequential-state and OVERSTATES cluster dedupe. **Expected reading tomorrow: two
  or three paid inside the 08:02–08:07Z window IF the runs overlap (checkout-to-
  commit latency > spacing) — that confirms the CONCURRENCY gap, not a MIN_GAP-code
  failure; the landed/not-landed reading stands as written. Fix, SPEC-ONLY (owner):
  a `concurrency:` group on props-history.yml (queue, not cancel) + a pull-rebase
  retry in the Commit step.** Impossible branch: one-paid-per-window with no
  concurrency group and a committed-state read → print the run timestamps —
  something else serialises (candidate: GitHub's own queue trickling starts —
  measured arrivals were spread 08:04–10:49Z). Both script copies verified
  IDENTICAL (line-history and frontend-rebuild both sha256 `01b8231b9fc43e3f05a14cb31203eb1c68dd9c243fee84b4fc095b381103b828` — the
  executing copy carries MIN_GAP; the doc-commit-wearing-a-fix's-name branch does
  not fire).
  **✅ THE FIX SHIPPED SAME NIGHT (owner's authorization, MIN_GAP conditions)**:
  queue-mode `concurrency:` group (`cancel-in-progress: false` — every cron entry
  stays, delivery serialised never dropped) + a pull-rebase ×3 retry around the
  push (the paid-and-lost mode's belt). Guard `tests/props-concurrency.test.ts`
  OBSERVED RED on both copies before the edits; the local (frontend-rebuild) copy
  is enforcing; **the origin/main half — the copy schedules actually fire — WARNS
  until the owner's push lands (main commit `53d007`, stacked on the pause
  `a46c1f`; one push carries both), pre-committed to flip enforcing in the landing
  commit.** Magnitude, derived from disk (not bought): ~96 credits/sweep (16
  events × 6) × the observed 3-runner window (08:02/05/07Z trio) → worst-case
  overlap overpay ≈ **(3−1) × 96 ≈ 192/day** on the morning window; whether any
  push was historically REJECTED is Actions-side and not derivable from local
  disk — skipped, not estimated. **The ration table STANDS on the fixed cadence**:
  its ~420/day was computed from the sequential replay, which is exactly the
  post-fix behavior; as-shipped-without-the-fix risked ~510–610/day.
  **THE FIRING COPY WAS THE PRE-REDESIGN ONE ALL ALONG (2026-07-30, the owner's
  impossible branch FIRED — the full diff printed on the run)**: schedules fire
  from the DEFAULT branch (`main`, printed), and **main's props-history.yml is the
  OLD TEN-CRON copy** — plain `python3 tools/snapshot_props.py`, no `--wait`, no
  `--fold-only`, no `timeout-minutes` — while the 2026-07-27 "TEN CRONS REPLACED
  BY ONE THAT WAITS" redesign exists ONLY on frontend-rebuild and **has never
  fired**. Consequences, recorded: (1) every measured cadence fact (the two-batch
  queue behavior, the 08:02–08:07Z trio, the morning clusters, the burn) describes
  MAIN's ten-cron copy — the measurements are RIGHT about reality and the design
  docs describe a workflow that never ran; (2) the MOVING INPUTS row
  "props-history.yml (2×/day)" is CORRECTED, dated: nominal TEN/day on the firing
  copy; (3) **the concurrency group + pull-rebase retry NOW LIVE ON THE FIRING
  COPY** (pushed `c2459c4..53d0076 → main` this night; the block printed from
  origin/main) — tomorrow's window tests the fix against exactly the schedule that
  produces clusters; (4) the executing SCRIPT is unambiguous — the workflow
  overwrites the checkout with origin/frontend-rebuild's `snapshot_props.py`
  (workflow L57–59), both copies hash `01b8231b9fc43e3f05a14cb31203eb1c68dd9c243fee84b4fc095b381103b828` identical, MIN_GAP marker
  present ×1; (5) **CONVERGENCE OF THE TWO WORKFLOW COPIES IS THE OWNER'S CALL,
  SPEC-ONLY**: (a) port the three-cron+wait redesign to main (the designed
  cadence, never yet exercised), or (b) keep ten-cron+concurrency (the measured
  cadence, now serialised). Neither ships without his word.**

  **THE LANDING TEST RESTATES (the fix consumes MIN_GAP's confirmation —
  tomorrow's 08:02–08:07Z window now tests the FIX)**: (a) ONE paid snapshot in
  the window, N−1 skips logged, NO rejected push → **landed**; (b) two or more
  paid, OR any rejected push → **not landed — MIN_GAP AND the fix revert to spec
  together** rather than staying live in a state that pays and loses; (c) ZERO
  paid in the window → **the queue starved the window — its own line, not a
  pass**.

- **07-29 CLOSE-OUT, ON DISK (owner's item 6)**: the chain did not run tonight
  (no-board day, recorded above). Concurrency fix: LIVE on the frontend-rebuild
  copy (guard enforcing), main copy `53d007` pending the owner's one push; landing
  test = the 08:02–08:07Z window, all three outcomes above incl. the
  starved-window line. Outs flag: **deploys Thursday regardless of any board
  reading** — recorded with the reason (`docs/pitcher-outs-audit.md`, DECIDED
  section: both branches pre-committed by the owner; the chain's failure modes are
  HRR/engine-string, not outs). Header fix: **the owner's, and still the gate.**
  **Quota: READ, not derived (2026-07-30 ~03:5xZ — the FREE instrument found on
  the owner's question): `/v4/sports` costs ZERO credits and the odds proxy passes
  the quota headers through (`app/api/odds/route.ts` L51–55; cached path, no
  passcode). READ: remaining 1,461 / used 18,539.** Delta vs the last read
  (1,676/18,324): **215 spent — attribution closes within 1 credit** (20:32Z pre
  sweep + 23:38Z close sweep ≈ ~192 + line-history ticks ~24 ≈ 216 computed; the
  read itself 0). The read lands at the very bottom of the derived 1,460–1,530
  band. **Board-days on the READ figure: 1,461 / 150 = 9.74 — UNDER 10. THE ≥10
  BOARD-DAY THRESHOLD IS NOT REACHABLE UNDER ANY CADENCE ON THE QUOTA ON HAND:
  the 08-15 HRR suspension review is UNREACHABLE WITHOUT A RESET — written
  tonight, per the owner's pre-committed branch, not discovered on 08-15.** (The
  reachability table above restates: the board-only cell's "REACHED (11, barely)"
  carries this dated supersession — at the READ quota it is 9.7, NOT reached.)
  Every future runway figure uses READS via the free instrument, not derivations.
  The reset date remains unread by the owner; every downstream date stays
  PENDING as stamped. **What tomorrow's board
  can support: the echo, the cfSel stamp reading, self_consistency, the
  greyed-row check, the replay + ParlayPred diff, and Control C's production
  predictions. What it cannot: any vintage claim about archived boards. It is
  board 1 of the homogeneous window — item 3 resolved with the echo attributing
  production's copy AND the window never having depended on it (the inputs were
  versioned throughout).**

- **THE $62.50 CEILING, RECORDED AS A BANKROLL-EXPOSURE FACT (2026-07-30, owner's
  item 2 — no change ships; recorded before a board emits it)**: the binding
  per-ticket ceiling is **`perParlayCap` = 0.25 × DAILY ($250) = $62.50 = 2.5% of
  the $2,500 bankroll — a STRUCTURE cap, belief-independent, in the census
  (chosen class)**. It is not Kelly-derived: the Kelly layer underneath
  (`shKellyFrac` = min(¼-Kelly, 2%-of-bankroll) × `kellyStakeMult` 4) sizes the
  WEIGHTS and is computed on BELIEF — the same quantity measured miscalibrated on
  the one settled market. **Independent caps exist and the structural one binds
  first**: on the replay cards the EV card's top ticket sits at $62 (perParlayCap,
  rounded) with the prob card's at $59 unbound; above the ticket, `dailyBankrollCap`
  = 0.10 bounds the locked day at $250 = 10% of bankroll, and `coreMaxDec`/
  `coreMaxLegs` bound structure. **The exposure statement: the worst single slip
  is bounded by a belief-free 2.5% of bankroll; BENEATH that cap the allocation is
  belief-proportional.** What boards on disk say: **no real card's stakes have
  ever been persisted** (the allocation-capture gap; the client's locked cards
  live in the off-disk ledger) — the $62/$59 figures are the deterministic replay
  of 07-26; the archived tickets' `stake` fields are display-tier suggestions
  (up to $100), NOT card stakes — the above-ceiling impossible branch does not
  fire on any persisted card stake, because none exists.

- **THE LINEUP-CONFIRMATION RULE HAS NO TESTABLE CONDITION (2026-07-30, owner's
  item 5 — the branch that fired)**: `docs/board-timing.md` L18–20 states the rule
  as a PER-GAME sim precondition ("the Monte Carlo path requires a confirmed 9-man
  lineup on both sides") with a designed fallback (closed-form + the
  projected-lineup `noParlay` rule) — **there is no board-level threshold anywhere
  in the doc**; the 22:00Z hour was chosen as the MEASURED weekday coverage peak
  (66%, L66), not against a bar. So 66% neither satisfies nor violates a rule —
  **a ranked defect was documented and never given a testable condition; that is
  the finding.** Boards DO record their coverage at generation (the gen stamp:
  `luConfirmed`, `luPct`, `achievable`, plus `data.luCoverage`) — the
  cannot-read-after-the-fact branch does not fire. **THE GUARD, SPEC'D NOT SHIPPED
  (no threshold is invented)**: encode `gen.luPct ≥ gen.achievable − ε` — "the
  board captured what was capturable at its hour" — both fields already computed
  in the route; a board violating it generated EARLIER than its own slate allowed,
  which is the original defect's testable form. Awaits sign-off. For tomorrow, FROM THE FEED
  (corrected 2026-07-30 — the earlier "~20:05Z" line used the hour approximation):
  evening-6 first pitches 23:10×2 / 23:15 / 01:40×2 / 02:10; FP−3h confirmed
  share: **0/6 at 20:05Z · 3/6 = 50% at 21:00Z · 3/6 = 50% at 22:00Z · 5/6 ≈ 83%
  only at ~22:40–23:05Z — and 6/6-before-first-pitch is IMPOSSIBLE for this slate
  shape** (the last game's FP−3h opens at 23:10, when the first games start). A
  22:00Z board would carry **gen.luPct ≈ 50 and gen.achievable ≈ 50** (both
  measured over the 6 unstarted) — guard-GREEN at ε = one game (≈17 pp on 6
  eligible, the spec'd ε). **The 22:00Z cron remains the plan**; the curl
  fallback, timed 22:40–23:05Z, out-covers it at 83%. **AFTER-THE-FACT
  READABILITY (the owner's question)**: YES for tomorrow — `data.gen` rides the
  board KV and the archive, so the guard's condition is readable without shipping
  it; the guard stays SPEC-ONLY and tomorrow's board is read against it. On-disk
  red check: the one archived board (07-26) carries `luCoverage` (13/15, .867)
  but NO `gen` block (backfill predates the stamp) — the full condition is
  retroactively computable from `gameInfo` starts + `at` via the route's own
  `achievableCoverage`, and **the guard has to date been observed neither red nor
  green on any real board; tomorrow is its first observable.**

- **TOMORROW'S ORDER, RECORDED (owner's item 6)**: slate count printed → the
  owner's go/no-go → quota READ (free instrument) → board (cron preferred, curl
  fallback) → quota READ → `gen=list` → **echo present in the response** → **cfSel
  stamp on every suspended row** → `self_consistency` with both population sizes
  printed → app-switcher double reopen → HRR rows present AND greyed → replay dump
  + ParlayPred membership diff → Control C's production predictions against the
  30 bp / 2–4% pre-commitments → ticket count against both pre-commits. **TWO DEADLINES, SEPARATED (2026-07-30, owner's item 1 — both fall on THURSDAY
  07-30 PT; they were never two days apart, but they gate different things and the
  doc now says so)**:
  1. **HEADER FIX (owner's) — by 2:45 PM PT Thursday** (the 22:00Z cron; cron-job.org
     edits take effect at the next fire, so the lead is only save-margin). Gates:
     the reopen-verification board. **Miss it → the manual curl inside the
     evening-6 window on the owner's go/no-go, slate count printed first — best
     slot 3:40–4:05 PM PT (22:40–23:05Z), where confirmed coverage reaches 5/6 ≈
     83% vs the cron's 3/6 = 50%** (the curl fallback out-covers the cron on this
     slate; feed-derived, table below). Both miss → **Friday's board carries TWO
     reopens' vintage at once** (hits/TB/HR/HRR day 3 + K's/outs day 1, the 07-31
     expiry) and every reading stamps two-vintage — said in advance.
     Consecutive live-but-unverified days: **2 as of tomorrow's window closing
     boardless (07-29, 07-30); 3 + K's/outs day 1 as of Friday's.**
  2. **OUTS-FLAG DEPLOY (decided) — Thursday, AFTER the board's readings, evening
     PT.** Gates: Friday's K's/outs reopen arrives flagged. Sequencing matters:
     deploying the flag BEFORE the 22:00Z cron would put a second engine change on
     the first verified board mid-chain — the flag deploys Thursday evening, after
     the chain reads the board, still before Friday. (The earlier single-clock
     line merging these is superseded by this block, dated.)
  Board 1 of the homogeneous window: CONFIRMED — the echo hashes the text
  production fetched from its own deployment (`grabText(selfBase())`, by
  construction, on disk). The outs flag deploys Thursday regardless of any board
  reading — recorded with its reason (`docs/pitcher-outs-audit.md`, DECIDED) —
  Thursday EVENING, after the board's readings, per deadline 2 above.

- **ITEM-1 RESOLUTION: THE CRON CAN REACH THE WINDOW, AND THE MOVE IS THE OWNER'S
  (2026-07-30)**: the generate entries live on cron-job.org — the owner's account.
  **The exact change: edit entry 1 from `0 22 * * 1-5` to `45 22 * * 1-5`** (or add
  a one-day `45 22 * * 4`); cron-job.org edits take effect at the next evaluation —
  no lead beyond saving; **do it in the same visit as the header fix, by 3:30 PM PT
  (the moved entry fires 22:45Z = 3:45 PM PT), and one board does everything at
  ~83% coverage for ~55–60 credits** (cost scales with the 6 eligible events —
  cheaper than the ~150 full-slate figure). The three paths, priced: (a)
  **moved-cron one-board** — ~55–60, slot unspent, the plan if the owner edits the
  hour; (b) **two-board day** — 22:00Z cron (~55–60, engine-verification half:
  echo, cfSel stamps, self_consistency, greyed rows, replay+join) + 22:45Z+ curl
  with `force=1` (~55–60, composition half at 83%; `force` bypasses the 45-min
  rate cap and the good-board skip, route L124–127; `MAX_RUNS_PER_DATE = 3`
  accommodates both) ≈ **~110–120 total — the owner decides on this printed
  cost**; (c) **curl-only** — 3:40–4:05 PM PT (22:40–23:05Z), slate count printed
  first (expected: 6 unstarted with posted props), ~55–60. **TWO BOARDS ON ONE DAY
  COUNT AS ONE BOARD-DAY against the ≥10 threshold — the clock counts BOARD-DAYS
  (the no-reset contingency's own definition) — the reachability table does not
  move.** The 22:00Z board's split, stated: at 50% coverage it SUPPORTS the echo,
  the cfSel stamp reading, self_consistency, the greyed-row check, the replay +
  ParlayPred diff, and the predictions×fp join; it CANNOT support the
  high-coverage composition readings or a meaningful cap-binding test (a
  3-confirmed-game pool is thin, and a non-binding cap is NOT evidence against
  M14, as recorded). Impossible branch armed: the 22:00Z board's own `gen.luPct`
  reads above 50 → the FP−3h projection was wrong and the window is wider — print
  both.

- **THE STAKE CAPS, MEASURED TO THEIR MAXIMUM — AND THE OWNER'S OPERATOR RULE
  (2026-07-30, owner's item 2; no change ships)**: the per-ticket cap is
  **`capG = max(perParlayCap, 1/n) × DAILY`** (L3107) and thin pools produce small
  n (`minN = min(minCoreTickets, scored.length)`, L3074) — so **the maximum
  emittable single-ticket share is NOT 2.5%: it is 10% of bankroll on a 1-ticket
  card** (100% × $250, `dailyBankrollCap` exactly co-binding), **5% at n=2, 3.33%
  at n=3, 2.5% only at n≥4** — the owner's impossible branch FIRED, and thin
  cards are real (the in-loop shade sweep produced 3-ticket cards). By legs:
  `coreMaxLegs = 3` → CORE tickets are 2–3 legs, both at the n-dependent cap
  (`coreMaxDec = 15` caps ODDS, not stake); 4–6-leg tickets exist only in FUN,
  bounded by the FUN budget (`pl_fun`, default $5 ≈ 0.2%). In the DISCIPLINED
  path each ticket also carries a HARD belief-sized Kelly ceiling
  (`kellyStakeMult` × ¼-Kelly; remainder stays unallocated) — it can only LOWER
  the belief-free cap. Governance on the replay cards (12 tickets across both):
  **1 of 12 structural-cap-bound** (the EV card's $62 top); the other 11 sit
  under Kelly-proportional weights — the belief layer (weight-vs-ceiling binding
  is not distinguishable from stakes alone; the harness can print it on demand).
  **Enforcement locus**: the caps are enforced IN `shAllocate` — engine code, at
  card computation, which runs ON-DEVICE for the real card; the server builds and
  stores NO card, and the archived `stake` fields are display-tier suggestions.
  So the engine enforces at computation; **the last mile — the slip at Caesars —
  is the operator**, and the exposure fact stands with the 10%/5%/3.33%/2.5%
  ladder beside it.
  **⚑ OPERATOR RULE (2026-07-30, THE OWNER'S OWN — above the engine, NOT an
  engine parameter, recorded so ledger readings can tell the operator's
  constraint from the engine's): NO SINGLE SLIP ABOVE 2% OF BANKROLL ($50 at
  $2,500), regardless of what the card suggests.** It binds BELOW every engine
  cap and below both replay cards' top tickets ($59/$62 — the rule would have
  trimmed both).

- **THE LINEUP GUARD'S FIRST REAL OBSERVATION IS RETROACTIVE AND IT PASSES
  (2026-07-30, owner's item 3)**: recomputed from `gameInfo` starts + `at` with
  the route's own formula on the one archived day (07-26; `.best`, the session's
  instrument): **unstarted 14, ready 12 → achievable 0.857; confirmed-lu among
  unstarted 12 → luPct 0.857; condition PASSES with margin +0.000 — at ε = 0,
  exactly** (the board captured exactly what was capturable at 16:46Z). Boards on
  disk for this check: **one archived day** (two snapshots of it). Tomorrow's
  falsifiable predictions, printed before any board exists: **22:00Z cron board →
  luPct ≈ 0.50, achievable ≈ 0.50, PASS; 22:45Z curl board → ≈ 0.83/0.83, PASS.**
  Per the owner's ruling and branch 2: **the guard has never been red on real
  data and stays SPEC-ONLY**; tomorrow's board is read against it either way.

- **THE 1/n RELAX INVERTS THE CAP'S PURPOSE — RECORDED WITH ITS HISTOGRAM
  (2026-07-30, owner's item 1; no change ships)**: `n` in `capG = max(perParlayCap,
  1/n) × DAILY` is **`picked.length`** (L3107) — the CLEAR count, not a floored
  count; `minCoreTickets = 4` (L1069) enters only as `minN = min(minCoreTickets,
  scored.length)` (L3074), so n < 4 occurs exactly when the SCORED POOL is thin —
  **the cap is largest precisely when the least corroboration exists.** The
  clear-count distribution across everything on disk: **no real production card
  exists** (allocation unpersisted — the recurring gap), so the histogram is
  HARNESS cards, labeled as such: at the SHIPPED belief the one archived day
  replays n=6 on both rankings; across the 36 stressed-belief counterfactual
  cards (shade/shrink/blend sweeps): **n=6 ×20 · n=5 ×2 · n=4 ×2 · n=3 ×8 ·
  NO-PLAY ×the rest — n ≤ 3 in 8 of 36 (22%), all under stressed beliefs.**
  Tomorrow's projection at 6 eligible events with four markets newly live and
  `coreEvMin = 2`: pool ≈ ~25 tickets, clears scaled from 07-26's 18-of-196 →
  point estimate **n ≈ 4–6, with n ≤ 3 a REAL tail** on a 6-game evening slate —
  **the exposure is OPERATIVE for tomorrow's card, and the owner's 2% operator
  rule is the only thing standing between the engine's suggestion and the slip —
  in those terms, as ordered.** No card on disk shows a stake above
  `dailyBankrollCap` (the impossible branch is silent). **THE INTENT, TRACED**:
  the relax comment reads "general cap relaxed to 1/n when the pool is tiny"
  (L3105) and the product rule it serves is the LOCKED "exact-sum allocator"
  (golden rules; the card note: "spreads it across the best N tickets — exact
  dollars") — **the relax exists to SPEND THE DAILY BUDGET, not to size a bet:
  the belief-free cap and the daily-deployment target are one knob doing two
  jobs — the project's recurring shape.** And the sharper residue: the
  DISCIPLINED path already half-retired exact-sum (hard Kelly ceilings leave
  remainder unallocated, L3105–06) while the relax survived — a budget-spending
  rule living inside a path that no longer promises to spend the budget. **The
  relax is CHOSEN (rationale stated, never measured) — it joins `coreEvMin`, the
  damping constant, and the blend weight as the FOURTH unmeasured parameter with
  a measured consequence (the 10%/5%/3.33%/2.5% ladder). Census v2.2: 41
  parameters / 0 fitted / 40 chosen (12 with no stated rationale) / 1
  stated-arithmetic; 9 since-measured.**

- **THE LINEUP GUARD, WITHDRAWN AS THE LINEUP GUARD (2026-07-30, owner's item 2 —
  the third reading: NOT an identity, but the WRONG DIRECTION)**: the two
  quantities have different inputs and CAN differ — `luPct` counts games with
  **`lu === true`** (actual posted lineups, data; `liveCoverageOf` L25–42) while
  `achievable` counts games past **FP−3h** (a schedule computation, L72–78); the
  separating input is REAL POSTING TIME vs the model — lineups posting early
  (luPct > achievable) or late (luPct < achievable) untie them. The 07-26 tie at
  0.857/0.857 was postings matching the model exactly at that hour; my two
  predicted ties were an artifact of MY projection (both quantities projected
  from the same FP−3h model — no posting data exists for the future), not of the
  guard. **BUT the owner's conclusion stands on the sharper ground: `luPct ≥
  achievable − ε` detects FEED-LAG, not early generation — a 13:00Z board with
  achievable = 0 and luPct = 0 PASSES while being maximally early. The condition
  cannot detect the ranked defect it was spec'd for. It is WITHDRAWN as the
  lineup guard and relabeled a feed-lag check (still useful, differently named).
  The ranked defect — early board generation before lineup confirmation — REMAINS
  WITHOUT A TESTABLE CONDITION.** The real detector, SPEC'D not shipped: **`gen.
  achievable ≥ T`** — an ABSOLUTE capturability threshold at build time,
  schedule-derived and compared against a constant rather than against its own
  set; **T is a threshold that must be CHOSEN (owner's sign-off; candidate
  anchor: the measured 22:00Z design point, 0.66)**. Tomorrow's board prints its
  measured pair either way — and it CAN untie.

- **TOMORROW'S CARD IS A CALIBRATION EXPERIMENT FUNDED WITH BANKROLL (2026-07-30,
  owner's item 3 — the framing recorded before anything is placed)**: settled
  outcome data on disk, per market: **HRR — the only prop market with any: 46.3%
  vs 59.2% implied (populations off-disk); ML/RL — 15 settled legs re-verified in
  `docs/settlement-audit.md` (a GRADING-correctness audit, not calibration, and
  ML/RL are not among tomorrow's four); hits, TB, HR — ZERO settled rows anywhere
  on disk** (whatever exists sits in the off-disk ledger, unread). **The
  sentence: tomorrow's board deploys real money into three markets with zero
  settled calibration on disk and one suspended market with a 12.9 pp measured
  miss.** What the first N settled tickets would need to show: **no written
  target exists for hits/TB/HR — N is underivable without choosing δ, and it is
  not invented here.** The anchored conditionals only: at HRR's own retirement
  standard (±3 pp, ≥300 rows) ≈ 6–10 board-days of settled legs at ~30–50
  legs/board; a 12.9-sized miss would show at ~100–120 legs ≈ 2–4 board-days.

- **force=1, THE FULL LIST (2026-07-30, owner's item 4 — three bypasses, not
  two)**: `force` appears at exactly two branch sites (route L125–126, L146) and
  the L146 block contains THREE protections — so force bypasses: **(1) the
  45-minute rate cap; (2) the good-board skip; (3) the DEAD-SLATE refusal**
  (`slateStarts` + `deadSlate` — the check that stops building on an
  all-started/empty slate lives inside `if (!force)`). No lineup gate, staleness
  gate, or market-availability gate exists anywhere in the route to bypass (the
  board builds regardless; coverage is stamped, not gated); **the pricing and
  allocation paths are untouched by force — the impossible branch is silent.**
  `MAX_RUNS_PER_DATE` counts every SPENDING run via `INCR` at L177 — forced runs
  count. **PROVENANCE GAP CONFIRMED, and wider than force**: the gen stamp
  carries no force/manual field AND the route hardcodes `src: "cron"` into the
  prediction records for every caller (L324) — a forced manual board is
  indistinguishable from a scheduled one in the archive AND in the prediction
  store. **THE MARK, SPEC'D TONIGHT (additive, zero credits, spec-only per the
  owner's list): `gen.trigger = "cron-ua" | "header" | "manual" | "manual-forced"`
  attached beside the existing gen fields, riding board + archive + echo; the
  pred-store `src` gains the same value instead of the hardcoded "cron".**
  OPERATIONALLY DISSOLVED FOR TOMORROW: a 401'd cron sets no `lastRun` (the SET
  sits after auth), no good board exists, and the evening-6 are unstarted at
  22:40–23:05Z — **the fallback curl needs NO force at all.**

- **THE OWNER'S CRON DECISION, PRE-COMMITTED WITH ITS FAILURE BRANCHES
  (2026-07-30, owner's item 5)**: he moves entry 1 to `45 22 * * 1-5` AND adds
  the `x-cron-key` header to entries 1–4, one cron-job.org visit, by 3:30 PM PT.
  Branches, on disk before the window: (a) **cron fires 22:45Z with the header →
  the fourteen-step chain runs on its board — no curl, no force**; (b) cron
  fires and 401s → header did not land → **curl 3:40–4:05 PM PT on the owner's
  go/no-go, slate count printed first, NO force** (none is needed — above); (c)
  cron fires, header good, board empty/malformed → **no second slot; report the
  response and stop**; (d) no fire at 22:45Z → the entry edit did not take — a
  cron-job.org fact, the owner's to check; (e) impossible: TWO boards for 07-30
  → the old entry did not clear — print both; **the chain reads the 22:45Z board
  (`latest` write wins at BOARD_KEY), `gen=list` shows both, and the day counts
  as ONE board-day.** The ~55–60 credit figure is **PROJECTED, not computed** —
  scaled from the measured ~150 at ~16 events (~8–9/event); the before/after
  quota READS settle it tomorrow. If the slate shrinks below 6 by 22:45Z: the
  board covers whatever unstarted remains and the slate count printed at the
  go/no-go is the record; at zero unstarted → a THIRD no-board day, recorded.

- **THE 10% CEILING, BOUNDED BY MEASUREMENT (2026-07-30 late, owner's item 1)**:
  realized top-ticket stakes across every stake-carrying card on disk (10 harness
  cards — no real card is persisted, the standing gap): **max $62 = 2.48% of
  bankroll**; full distribution [22, 22, 48, 52, 56, 58, 59, 62, 62, 62]. **At
  n=1 the belief-sized Kelly ceiling binds BELOW the structural $250: ceiling =
  kellyStakeMult(4) × min(¼-Kelly, 2%-of-bankroll) × B ≤ $200 = 8.0% of bankroll
  on the strongest ticket measured (typical tickets $107–200) — the 10% is
  UNREACHABLE in the disciplined path; the operative ceiling is ≤ 8%** (legacy /
  override modes lack the Kelly ceiling — there the 10% remains reachable;
  production default is ev_gated). Binding census across all 60 tickets on the 10
  cards: **capG-bound 3 · Kelly-bound 6 (the two λ-stressed thin cards) ·
  weight-governed 51.** **AND THE EXACT-SUM IMPOSSIBLE BRANCH FIRES, BY DESIGN**:
  the share-0.15 cards deployed **$49 of $250 — under-deployment is real** —
  "Ceilings are HARD; the remainder stays unallocated" (L3105–06) deliberately
  broke exact-sum in the disciplined path. **So the mechanism, stated plainly:
  exact-sum is the LEGACY rule; in ev_gated, thin cards do NOT concentrate by
  construction — the Kelly ceilings bound them and the remainder sits
  unallocated. The 1/n relax's measured consequence shrinks accordingly: it
  raises the belief-free cap, but the belief-sized ceiling underneath is what the
  disciplined path actually pays.** The freeze-doc exposure line restates to: the
  worst single slip in the disciplined path is bounded by min(structural ladder,
  ~8% Kelly ceiling); measured worst on any card: 2.48%.
  **THE OWNER'S 2%-BINDING SENTENCE, MEASURED AND NARROWED**: the $50 rule binds
  on **7 of the 10** measured cards (tops $52–62); on **3 of 10** the engine's
  own output already sat under $50 (the two λ-stressed cards at $22 and the
  share-1.0 prob card at $48) — the rule is the binding constraint on every
  STRONG-belief card measured, not on every card.

- **T = 0.80, SET BY THE OWNER BEFORE ANY BOARD EXISTS (2026-07-30 — chosen NOT
  fitted, the 42nd such parameter; census v2.3: 42 parameters / 41 chosen (12 no
  rationale) / 1 stated-arithmetic / 9 since-measured)**: reason, his: it sits
  below tomorrow's projected 0.833 curl/moved-cron window and above the 22:00Z
  design point (0.50–0.66), separating the two paths on the axis that matters,
  chosen while no board's number is known. **The curves it was chosen against
  (computable from gameInfo alone for ANY hour — confirmed)**: 07-26 hourly:
  0.0 (13Z) · 0.067 (14Z) · 0.533 (15Z) · **0.867 (16Z — build hour 16:46 =
  0.857)** · 0.857 (17–18Z) · 0.5 (19–20Z) · 1.0 over 1 unstarted (21–23Z, the
  small-n tail); tomorrow 20:00–23:30Z at 15-min steps: **0.0 → 0.50 (20:15
  through 22:30) → 0.833 from 22:45 → 1.0 over 3 from 23:15.** T-fail counts on
  disk: **0 of 1 board at every candidate (0.60/0.70/0.80/0.85** — 07-26's 0.857
  passes even 0.85). **The guard has never been red on real data → SPEC-ONLY
  under the standing rule.** Pre-committed for tomorrow: 22:45Z board carries
  achievable ≥ 0.80 → composition readings VALID on it; below → engine-half
  only, exactly as the 22:00Z-only branch was priced; impossible branch: 22:00Z
  ≥ 0.80 → the separation was wrong, re-derive before the window (the projected
  22:00Z value is 0.50 — the branch is not expected to fire).

- **THE N ANCHOR, UN-BORROWED (2026-07-30, owner's item 3)**: **no written target
  effect size exists for hits, TB, or HR — said explicitly; the 6–10 board-day
  anchor was HRR's retirement standard transferred, and it is now labeled as
  such.** Rows per board-day per market at tomorrow's 6-game slate, both
  channels: the LEDGER channel (the bankroll exit's SOLE instrument — placed
  legs): **~2–5 legs/market/day**; the GRADED-BOARD-ROWS channel (calibration,
  not the bankroll exit): hits ~19 · TB ~14 · HR ~19 per board-day (07-26 counts
  × 6/16). **The exit's test is POOLED — `shLedgerStats` scopes ALL/CORE/FUN,
  never per-market — so a miss in one market can be masked by two clean ones at
  the expected roughly-equal row split; that is the finding.** The honest N, per
  market: at the LEDGER rate, a 12-pp miss needs ~100–120 legs ≈ **~35–40
  board-days per market**; a 3-pp miss ≈ **~100+ board-days** — **both exceed
  the reachable board-days under every cadence (9.7 max). THE SENTENCE, BESIDE
  THE PARAMETER-EXIT SENTENCE: TWO EXITS, BOTH UNREACHABLE THIS CYCLE WITHOUT A
  RESET — the parameter exit for credits, the bankroll exit for settled-leg
  volume in the reopened markets.** (Via the graded-rows channel a 12-pp miss
  shows in ~6–8 board-days — reachable board-only — but that channel measures
  CALIBRATION, not the bankroll; the distinction is the point.)

- **force CONFIRMATIONS + THE SECOND-BOARD PATH (2026-07-30, owner's item 4)**:
  (1) **the 3:40–4:05 PM PT fallback curl runs WITHOUT force** — a 401'd cron
  returns before the `lastRun` SET, so no rate cap arms; no good board exists;
  the evening-6 are unstarted. (2) If the 22:45Z cron SUCCEEDS and a curl lands
  inside 45 minutes: the rate cap fires FIRST and returns `{skipped: "ran
  recently"}` — **no second build, no spend; the board itself is read from
  /api/board, free — the fallback is safe and costs nothing after a cron
  success.** (3) A second board after a T-fail **requires force=1** (rate cap +
  good-board skip both stand in the way), and force disables the dead-slate
  refusal with it — **that path exists, costs ~55–60, and is OFF unless the
  owner authorizes it explicitly in the moment with the disabled protections
  stated.** One leak named on the impossible branch: after 45 minutes, the
  good-board skip's own goodness test (coverage-based) could decline to skip a
  poorly-covered existing board — a no-force second build would then be possible;
  the window's closure (~23:05Z first pitches) and the dead-slate refusal bound
  it. **THE TRIGGER MARK SHIPPED** (`4c036ba`, pushed; guard
  `tests/trigger-mark.test.ts` observed RED on both halves first): `gen.trigger
  = "cron-ua" | "header" | "manual" | "manual-forced"` rides the board KV, the
  archive, the prediction store (gens[]), and the response. **Landing reading,
  pre-committed: tomorrow's board carries `gen.trigger === "header"` or the
  mark/deploy did not land.**

- **THE CLEAR-COUNT MIDDLE BRANCH, FIXED BEFORE THE BOARD EXISTS (2026-07-30,
  owner's item 5)**: clear count between 1 and 5 → **neither the gate nor the cap
  is binding, and the reading IS the blocked-reason histogram over ALL pool
  tickets, with the modal reason named — the histogram, not the ticket count.**
  And restated so nobody misreads tomorrow: **a non-binding cap is NOT evidence
  against M14** — the step-8 pre-commit already says it: cap does not bind → M14
  unobserved in production, the sweep stays archival.
- **THE TWO-BOOK JOIN'S STATUS FOR TOMORROW (owner's item 5)**: the archive has
  carried `fp` per-book prices since 07-26 ~21:39Z; tomorrow's board creates the
  first prediction rows that coexist with same-day `fp` sweeps → **the
  predictions×fp join RUNS TOMORROW EVENING** (the owner's authed read — sync
  phrase — per the memo's pre-committed curl and four branches). It would produce
  the first measured two-book magnitude on a same-day, pre-vintage population; it
  does NOT need another day of fp.
- **HRR, FOUR COUNTS AS FOUR SEPARATE READINGS (2026-07-30, owner's item 4 —
  tomorrow is the first board where HRR rows and HRR shadow rows coexist)**:
  (1) HRR rows PRESENT on the board (feed-dependent; **absent → the greyed-row
  check is VACUOUS for the third time, the reopen did not happen, and the 08-15
  review's population count restarts from the next board — recorded in advance**);
  (2) HRR rows GREYED (`susp`, display half); (3) HRR shadow/prediction rows with
  `susp:true` AND the `cfSel` stamp (the landed reading); (4) HRR legs in built
  tickets = **ZERO** (server half; **any >0 → `hrrAltMax` is not reaching the
  server path — an M-item the same day, and the suspension is cosmetic**). All
  four present-and-correct → **the suspension is verified end-to-end for the
  first time and the 08-15 review has a population.** Why 07-26 shows HRR legs in
  its replay cards: that vintage ran `hrrAltMax = 0.5` — O0.5 was ACTIVE and two
  O0.5 legs sit on each replay card; the full suspension (−1) shipped 07-27
  night, so tomorrow expects zero.
- **Runway with MIN_GAP live (2026-07-29, from 1,676 remaining)**: sweeps ≈ **~420/day**
  (4 pre + 1 close × ~16 events × 6 cr, slate-dependent). Days of runway: **sweeps+one
  board ≈ 2.9 · board-only ≈ 11.2 · sweeps-only ≈ 4.0.** Board-days reachable before
  exhaustion: **~2–3 with sweeps running; ~11 board-only.** **Without a reset, the
  ≥10-board-day suspension threshold is reachable ONLY under immediate board-only
  rationing (11 > 10, barely — sacrificing Series A's close side and the pre series);
  at any cadence that keeps the sweeps, the 08-15 HRR suspension review is UNREACHABLE
  — written today, not discovered on 08-15.** The owner reads the reset date: reset →
  restate runway, reprice the calendar; no reset → the ordered shutdown list executes
  in its stated order and the parameter exit does not fit this cycle.

- **THE RATIONING TABLE, PRINTED FOR THE OWNER'S CHOICE (2026-07-29, from 1,676
  remaining; every denominator recorded above)**:

  | cadence | credits/day | days to exhaustion | board-days banked | reviews reachable | series holed vs destroyed |
  |---|---|---|---|---|---|
  | sweeps-only | ~420 | **4.0** | 0 | none board-dependent; 08-10 six regressions unaffected (board-independent) | pre series + **pre↔close pairing ALIVE** while it lasts; every board-dependent series holed 1:1 daily (Series A row, shadow, BOTH suspension clocks, the M14 production check — ~6–7 series-days per dark day) |
  | board-only | ~150 | **11.2** | **11** | **HRR suspension review (≥10) — reachable ~08-09, BARELY; the ONLY cadence that reaches it.** 08-17/08-20 bars NOT reachable (need 20) | pre series holed daily; **pre↔close pairing DESTROYED at day level, daily** (the pairing is the unit); Series A loses its close side (= the series); CLV sightings lost once cards lock |
  | both | ~570 | **2.9** | ~2–3 | nothing reaches ≥10; everything else starved at ~3 days | all series alive ~3 days, then total dark — the worst of both |

  Footnote: Series-A-complete (board + one close-quality sweep, ~246/day) runs **6.8
  days ≈ 6–7 board-days** — misses the ≥10 threshold narrowly and both bars. And a
  dated reconciliation: the earlier "board-only ×2,317 ≈ 15 days" sentence below was
  computed at a prior quota reading; at the current 1,676 the figure is 11.2 — both
  stand with their reading dates, per the append-only rule.

- **MIN_GAP LANDING — THE CHAIN-DOC PRE-COMMIT RESTATED WITH ITS FIRST TEST NAMED
  (2026-07-29)**: delivery mechanics verified from the workflow — `props-history.yml`
  checks out `line-history` and pulls `tools/snapshot_props.py` from
  **`origin/frontend-rebuild`** (workflow L59), so the shipped `1617d1b` governs the
  next firing regardless of default-branch scheduling. **First test: the 07-30
  morning cluster** (nominal crons queue-delayed by GitHub; measured arrival
  08:04–10:49Z on 07-29). Read = the `data/props/2026-07-30.json` day-file plus the
  runs' Actions logs: **one paid snapshot per 40-minute window with the N−1 "skipped:
  pre within MIN_GAP" lines visible = LANDED; two paid sweeps inside one 40-minute
  window = NOT landed and the ship reverts to a spec** (dated marker on the MIN_GAP
  bullet, `created ≠ fires ≠ landed`). Today's remaining evening firings read only
  the close path, which MIN_GAP exempts by design — the morning cluster stays the
  committed test.
- **THE FLOOR COMES FROM PHASE 2'S REQUIREMENT (owner's rule — derived, file and line
  cited)**: Series A = archived board (open + pModel) × close fair joined by lkey+date —
  **`docs/phase2-memo.md` L40–42** (build items 2–4); the 20-board bar for 08-15 is in
  `docs/singles-vs-parlays.md` (REVIEW DATE) + the CLAUDE.md calendar. Requirement =
  **one server board/day (~150) + one close-quality sweep/day (~96) ≈ 246/day → ~13.5k
  to 09-22**. Pre sweeps are NOT a Series A requirement (bet-time vintage is the
  multibook memo's need). **Both derivations printed**: at the ~246 floor, 2,317 dies
  ~08-07; at the current ~740 cadence, ~07-31 — the cycle dies under EVERY cadence ≥
  the floor; hence the sentence at the top of this doc. CLV sightings separately:
  currently free exits (no locked card); a locked 6-ticket card ≈ 1–6 cr × ≤6 games ≈
  **≤ ~30/day**. Alt-key marginal at the POST-dedupe cadence: **+48–96/day** (+3 keys ×
  ~16 events × 1–2 sweeps — not the 123-event-sweep figure). **PROTECTED SPEND:
  Wednesday's manual generate curl (~150) gates the entire verification chain and
  produces the first board+`fp` day — NOT a rationing candidate.**

> ⚠️ **CONDITIONAL STAMP ON EVERY DATE IN THIS DOC AND THE CALENDAR (2026-07-29, owner's
> rule)**: 08-07, 08-08, 08-10, 08-15, 08-17, 08-20 and every reachability statement
> assume collection continues — **measured forward burn ends the current credit cycle
> ~07-31 and the reset date is not established. Until a reset lands, the calendar is
> ASPIRATIONAL.** (Same stamp in CLAUDE.md's calendar.)

## THE NO-RESET CONTINGENCY — one word when the owner reads the dashboard (2026-07-29, spec only)

**Ordered shutdown list** (each row: stop it → credits saved/day → what it holes):
1. **pre-sweep duplicates** (the MIN_GAP cadence, no sign-off needed to simply not fire
   redundant crons): ~480/day → holes nothing (measured 3–5%/≤0.042 pp duplicates).
2. **remaining pre sweeps** (keep close only): ~96–190/day → holes the pre-vintage
   series and DESTROYS the pre↔close pairing (day-level).
3. **line-history game sweeps**: ~24/day → holes the game-lines archive.
4. **CLV sightings** (only spends once cards lock): ≤~30/day → holes Exit 2's only
   instrument — LAST before boards.
5. **boards below 1/day**: ~150/board → holes Series A + both suspension clocks + the
   M14 production check, 1:1 — **the last thing to stop**.
**Minimum cadence that keeps the suspension-review clock running: one board/day = ~150**
(the clock counts BOARD-DAYS; closes are not required for the shadow-row count, though
stopping closes kills Series A alongside). **One board/day vs the deduped sweep cadence:
~150 vs ~192–286/day — the board is cheaper than the sweeps it is usually rationed
against; the tradeoff number is 150 : 246 for board-only vs Series-A-complete.**
**Does a board-day require the cron? NO — one manual curl per day writes
`pl:board:{date}` exactly as the cron does and COUNTS for the ≥10 threshold. The header
fix is on the critical path for CADENCE AND COST OF ATTENTION ONLY, not for the reviews'
existence.** Minimum viable vs remaining quota: board-only ~150/day × 2,317 ≈ **15
days** — reaches the ≥10-board suspension threshold (~08-07) but NOT the 08-17/08-20
bars with closes; **Series-A-complete (~246/day) ≈ 9 days — reaches neither bar.** The
aspirational-calendar stamp above is that sentence's consequence.

## THE LEDGER IS OFF-DISK AND UNBACKED — two things depend on it (2026-07-29, owner's item 4)

- **On-disk ledger artifacts: NONE EXIST.** The search hits are code and tests
  (`app/ledger` UI, `app/api/ledger` route, sync libs, `int40ledger.js` harness) — no
  rows, no export, anywhere in the repo or the scratch archives.
- **The HRR suspension's basis, quoted** (`docs/hrr-recalibration.md` L83–86): *"Graded
  ledger, 2026-07-17 → 07-22: H+R+RBI legs hit **46.3% vs 59.2% implied** overall, and
  **32% on O1.5+ alternate lines** specifically … O0.5 went **12/19 (63%)**."* The
  population behind those figures — the graded ledger rows of 07-17→07-22 — is
  **off-disk** (`pl:ledger:v1`, Upstash, sync-phrase-gated). **The finding is recorded;
  its data is not. Those are numbers we cannot re-examine**, and the 08-15 review says
  so in advance.
- **The 08-15 review compares TWO INSTRUMENTS, stated**: the baseline is graded-LEDGER
  hit-rate-vs-implied (bet legs — gate-selected, dollars-weighted); the new evidence is
  prediction-store SHADOW calibration (all board rows, unselected). Different
  populations, different selection, different metric — the comparison carries that
  caveat inline, not discovered later.
- **Retention: NOT WRITTEN ANYWHERE in the repo** — no TTL/eviction config for the key
  (only an app-level 3MB `MAX_BYTES`); Upstash's eviction policy is dashboard-side; **no
  backup exists anywhere. Append-only is a policy the storage does not enforce, and the
  bankroll exit rests on one unbacked key.** The pre-committed branch fires — **the
  READ-ONLY EXPORT, spec'd and held for the owner's run (zero credits, sync phrase
  only, no engine change)**:
  ```bash
  D=$(date +%F)
  curl -s -H "x-pl-sync: <phrase>" "https://parlay-lab-six.vercel.app/api/ledger"      > "ledger-export-$D.json"
  curl -s -H "x-pl-sync: <phrase>" "https://parlay-lab-six.vercel.app/api/predictions" > "pred-days-$D.json"
  # then per day listed: /api/predictions?date=<day> -> pred-<day>.json
  ```
  Committed to the repo (or any owner-chosen location) they become the backup; re-run
  cadence is the owner's call.
- **THE EXPORT'S READING, PRE-COMMITTED BEFORE THE OWNER RUNS IT (2026-07-29)**: headers
  `x-pl-sync: <phrase>`; response shapes `{ledger: SyncEntry[], at}` and `{days:[...]}`
  → per-day `{date, at, records, parlays, games}`; **zero credits** (redis reads only —
  verified in both routes). To be USEFUL the ledger export must show: total ticket
  count, date range, per-market LEG counts, and per-leg `{lkey, res, odds/cz, implied}`
  — **the 46.3%/59.2% HRR population is reconstructible IFF legs carry result + implied
  + market** (SyncEntry legs carry lkey/prop/cz/res via the grader). Branches:
  reconstructible → "cannot re-examine" WITHDRAWS with a dated marker and the
  suspension's basis becomes auditable; not → the absent fields get NAMED, not
  adjectival; export ticket-count vs the owner's 38 → both printed if they disagree.
  **ADDED 2026-07-29 (owner's item 7 — M19 can reach the ledger by hand)**: the
  triplicate-membership check joins this read's pre-committed list — any ledger
  ticket whose leg-set matches the K's pair
  (`drewrasmussen|pitcher_strikeouts|7.5` + `parkermessick|pitcher_strikeouts|4.5`)
  or the CLE@TB ML/RL pair → **M19 reached the ledger via manual slip-add** and its
  row restates from display-only; no match → the display-only classification is
  confirmed for this ledger. Not joinable without the export — stated, not guessed.
- **APPEND-ONLY, MADE ENFORCEABLE — SPEC ONLY (2026-07-29)**: content-addressed export
  snapshots (`ledger-export-<date>.json` + its sha256 in the filename or an index) plus
  a guard test that fails the build when any row key present in an earlier committed
  snapshot is absent from a later one (monotone-superset over `k`/ticket ids; plant: a
  synthetic later-snapshot missing a planted earlier row). Encoded when the first two
  snapshots exist; spec'd now.

## THE BURN DECISION AS OPTIONS (2026-07-29, owner's item — priced, NOT decided; the owner holds the reset date and the plan)

| option | credits saved/day | what it forecloses | which measurement dies |
|---|---|---|---|
| ration props sweeps to the floor (1 close/day) | **~640** (vs the 07-28 ~740) | pre-vintage rows | the bet-time two-book series and any pre-vs-close pairing going forward; Series A unharmed |
| cut CLV sightings | ≤ ~30 (only once cards lock) | the automated close on locked tickets | **Exit 2's only instrument** — the CLV series; unrecoverable per its own rule |
| drop the alt-key fix | +48–96 never spent | the archive stays CZ-blind on hits/K's | the playable-population re-measure; the memo's join stays archive-blocked |
| shorten the window (exit before ~09-22) | ~246 × days cut | statistical power; the ~09-08 `SUMMARY_DAYS` cap note | Series A's n; the crossover distribution reading |
| boards < 1/day | ~150 per skipped day | Series A rows 1:1 | each dark day pushes the 20-board bar 1:1 (already the floor rule) |

**Minimum viable Series A — the memo does NOT derive one, said rather than invented**:
`phase2-memo.md` specs the join, the WLS slope, and the binding qualifier (attenuated or
collinear = NO RESULT), but states no minimum board count for the slope itself; the
20-board bar is for FIXTURE-REPRESENTATIVENESS (a different question). A directional
slope answer may arrive at fewer boards IF the identification diagnostic passes — that
diagnostic, not a board count, is the written bar. Deriving a smaller design would be
invention; declined.

**Dark-gap recoverability (append-only rules applied)**: a dark day's server board is
UNRECOVERABLE (generation is live-only) and its close sweep is UNRECOVERABLE (the close
rule) — Series A simply loses those days and RESUMES (per-day join); the 20-board count
slips 1:1. Context/umpires: recoverable from git. Prediction grading: grades whatever
was logged — a dark day logs nothing server-side, so its rows never exist. CLV on locked
tickets: unrecoverable. **Series destroyed by a gap: none; series holed by a gap: all of
board-dependent ones, one row per dark day.**

**THE EXCEPTION, NAMED (2026-07-29, owner's item 5 — dependence census per series):**

| series | depends on | a dark day removes PERMANENTLY | merely delays |
|---|---|---|---|
| Series A (board × close fair) | board + CLOSE | that day's row — both sides unrecoverable | the 20-count, 1:1 |
| CLV on locked tickets | close sighting | that day's closes (the founding rule) | — |
| shadow-price series (`sh` columns) | board | that day's shadow row | — |
| HRR / outs suspension shadow accrual | board | that day's ~50 / ~37 shadow rows | the review thresholds, 1:1 |
| two-book pre-vintage series | PRE sweep | that day's pre rows | — |
| **pre↔close paired (vintage isolation, M15's instrument)** | **the PAIRing — both sweeps, same day** | **the day's PAIR — this series is DESTROYED at day level, not holed: no later day substitutes for a missing member of a pair** | — |
| fixture-representativeness board count | any N homogeneous boards | nothing specific | the bar date, 1:1 |
| six regressions (08-10) / context | statsapi / git | nothing | nothing |

**The 1:1 sentence with its exception inline**: board-dependent series are holed 1:1 —
EXCEPT the pre↔close pairing, which a dark day DESTROYS at day level (the pairing is
the unit, and a field not captured is unrecoverable). **Daily unrecoverable cost of
going dark, the ration currency: ~6–7 series-days per dark day** (Series A + shadow +
suspension accrual ×2 + pre series + the pair + **the M14 production check** — no board
→ no pool → no replay, added 2026-07-29; + CLV once cards lock).

## VINTAGE EVENTS SINCE WINDOW START — the census, and the convention FIXED (2026-07-29, owner's item)

| date | event | class |
|---|---|---|
| 07-24 | freeze start; Phase 0.5 provenance fields (`src`/`selMode`) | window start / instrument |
| 07-26 ~21:39Z | `fp` per-book prices enter the sweep (`28bbddf`) | instrument |
| 07-27 | board timing vintage 1 → 2 (16:xx era → 4-cron era; `phase2-memo.md` L41) | instrument/timing |
| 07-27 night | **M8 fix + `hrrAltMax: -1`** ship (`213e8e2`) | engine (code+config) |
| **07-29** | **`consMinEv` ceases to bind on hits/TB/HR/HRR** (`mktN` crosses `consMinN`) — behavior changes with NO code change | **engine (behavioral, date-conditional)** |
| 07-31 | same expiry, K's/outs | engine (behavioral) |
| 08-01 | same expiry, ML/RL | engine (behavioral) |
| **07-29** | **MIN_GAP ships** (`1617d1b`, pushed) — props-archive cadence segments pre/post | instrument |
| **07-29** | **cfSel stamps ship** (pushed `9753fb9` stack; additive `PredRecord.cfSel` on susp rows — prediction-record SCHEMA gains a field, live behavior unchanged, guard-proven byte-identical) | instrument |
| **07-29** | **sha+config echo ships** (same push — `data.echo` on every board + response body: engineSha, priors/ctx content hashes, gates, caps, selMode, damping, cfSelEnabled; write-only, guard-enforced) | instrument |
| **07-29 (pending the owner's one command)** | **bot pause** — priors.json + context.json writers stop; ump_k accrues; homogeneous data-vintage window opens at the pause | collection regime |
| **07-29 (same push)** | **props-history concurrency group + push retry** (main `53d007`; guard red-observed; landing test = the 07-30 08:02–08:07Z window, three outcomes pre-committed) | instrument |
| **07-29** | **the behavioral vintage changed on a day that produced NO server board** — 0 of 16 games unstarted at the 02:14Z go/no-go read; the protected slot NOT spent (owner's pre-committed branch); chain steps 4–12 move to the 07-30 slate, which becomes the first board of the new behavioral vintage AND (post-pause) of the data-vintage window | record |
| conditional | outs flag (**decided 2026-07-29: deploys Thursday 07-30**, pitcher-outs-audit) · alt keys · sha/config echo | engine (config) / instrument ×2 |

**The convention, fixed (it covered code changes only — today's behavioral change was
unstamped)**: a VINTAGE EVENT is any dated event that changes engine BEHAVIOR or
instrument SHAPE — **code, config, OR a date-conditional gate crossing its threshold,
OR a collection-cadence/schema change**. Every event above stamps a boundary; segments
never pool. Series A's segmentation as WRITTEN (`phase2-memo.md` L41) lists only the
TIMING vintages — the behavioral boundaries above are its needed extension (named here;
the memo edit rides the next Phase 2 build turn). Per-segment board counts are NOT
currently tracked (`tools/archive_boards.py` prints one unsegmented `BOARD SERIES n`);
the impossible branch does not fire.

## SUSPENSION SHADOW ACCRUAL — the reviews were designed non-vacuous; the OUTAGE is what starves them (2026-07-29, owner's item 2)

**Design, cited to lines**: suspended-market rows are STILL priced and tagged (the board
emits every category row with `suspRow`, `legacy/index.html` L2505–2514); STILL written
to the archive (board-archive workflow → `data/boards/`, line-history); STILL logged to
the prediction store WITH the marker (`boardToPredictions` serializes every pregame
category row — `...(r.susp ? { susp: true } : {})`, `src/lib/pred-serialize.ts` L227 —
the suspension bars TICKETS, never records); STILL settled (`/api/calibrate` grades
every pending record board-wide, `gradePrediction`, route L193). **The outs flag as
spec'd preserves accrual identically** (it edits the C2 ticket filter and the `suspRow`
tag only). So the "suspension seals itself" defect does NOT exist in the design — no
M-number.
**The counts, printed beside the review dates (owner's rule)**: HRR rows accrued since
the 07-27 suspension — **server-side 0** (no server board since 07-26 16:46Z);
client-side ≤ a handful (07-27 client generates; exact count needs the sync-phrase read,
same curl as the join). **The 08-15 HRR review reads**: graded HRR rows post-repair
against the retirement criterion (±3 pp over ≥300 rows / ≥10 boards — this doc, THE
REOPENING DECISION) via the prediction blob (`pl:pred:*`) / calibration buckets. **That
query returns ~0–3 rows today — the review is currently STARVED BY THE OUTAGE, not by
the suspension**; it becomes non-vacuous the day boards generate. Checked before it
runs, per the owner's rule: 08-15 arrives vacuous unless the header fix + credits
deliver ~10+ board-days first.

**THE SELECTED-vs-UNSELECTED MISMATCH — a NAMED LIMITATION of the review (2026-07-29,
owner's item)**: the suspension was measured on SELECTED legs (graded-ledger 46.3% vs
59.2% implied); shadow rows are EVERY HRR row, unselected — and selection is the whole
mechanism under M14. **No counterfactual-selection field exists in the shadow record**
(`PredRecord` carries `susp` only — checked). **THE FLAG, SPEC'D FOR SIGN-OFF BEFORE THE
CURL (additive; reads live state, writes new fields, branches nothing)** — in
`app/api/generate/route.ts` after `data` is built and before `boardToPredictions`:
```ts
// cfSel (2026-07-29): counterfactual selection under a lifted HRR bar — additive only
const cfgSaved = eng.get<Record<string, unknown>>("SH_CFG");
eng.set("SH_CFG", { ...cfgSaved, hrrAltMax: 99 });
const cfPool = eng.get<(b: unknown) => PoolTicket[]>("shCardPool")(data);
const cfAlloc = eng.get<AllocFn>("shAllocate")(cfPool, DAILY_DEFAULT, eng.get("SH_CFG"));
eng.set("SH_CFG", cfgSaved);                       // restore before anything else runs
// per suspended record: cfSel = { pool: row appears in any cfPool ticket,
//                                 card: row appears in the cfAlloc picks }
```
`boardToPredictions` then stamps `...(r.susp ? { susp: true, cfSel } : {})`. Zero
credits, CPU only; the LIVE pool/card are built exactly as today. **Held for the
owner's sign-off — boards resume in hours and a field not captured is unrecoverable.**

> ✅ **cfSel SHIPPED (2026-07-29 — owner's sign-off, same day, "ship it" with the
> byte-identity guard as the condition). THE SPEC ABOVE WAS CORRECTED AT
> IMPLEMENTATION — as written it was VACUOUS**: `hrrAltMax` has exactly two read
> sites (display tag L2514; the C2 filter INSIDE `buildParlaySet`, L2652), both of
> which run during `analyze` — re-running `shCardPool`+`shAllocate` over
> already-built tickets can never resurrect an HRR leg, so the spec'd diff would have
> stamped `{pool:false, card:false}` on every suspended row forever (the
> field-written-never-populated class, §5.2's own branch). And
> `buildParlaySet`/`omitCats` are closures inside `shAnalyzeLocal`, unreachable via
> `eng.get`. **The shipped construction**: a full counterfactual `analyze` on a
> DEEP-COPIED slate under a REPLACED `SH_CFG` binding (`{...saved, hrrAltMax: 99}`,
> restored in `finally`; the live cfg object is never mutated), then
> `shCardPool`+`shAllocate` at the `CFSEL_DAILY = 250` convention. Deterministic
> (seeded sim), zero credits, CPU only; runs AFTER the board KV writes; kill switch
> `PL_CFSEL=off`. Files: `src/lib/cfsel.ts` + `app/api/generate/route.ts` (insertion
> after the board persist, stamp after `boardToPredictions`) + the additive
> `PredRecord.cfSel` field. **Guard `tests/cfsel-guard.test.ts` — the owner's
> condition, met**: live board AND live card byte-identical with the flag on/off
> (both printed); reproduction (deep-copy + re-analyze) byte-identical; SH_CFG
> restore asserted; **de-vacuization asserted** (fixture: 52 HRR legs in
> counterfactual tickets, 10 reach the pool, cf card 4 tickets, all 14 suspended
> rows stamped); no-restore and flipped-field plants both observed red-by-value.
> The guard itself found two vacuities before going green: the armed fixture needed
> the frozen clock (batter stats route by date) and route-mirrored arming
> (`selMode`+`mktN`) — both discovered as red runs, recorded in the test header.
> **THE FIELD'S READING, PRE-COMMITTED (created ≠ fires ≠ landed)**: on the first
> post-fix board, **`cfSel` present on EVERY `susp:true` record in the day blob, or
> the flag did not land** — the response's `cfSel` counts are the fires-half only;
> the landed-half is the persisted records. A board whose susp rows carry no stamp
> reads "did not land", never "no counterfactual selection".

**THE NUMBERS AND THE THRESHOLDS, NAMED IN ADVANCE (2026-07-29, owner's item 3 — so
08-15 is a check, not an interpretation)**: server-side accrual RESUMES with boards for
both markets — cron generates log every category row (`src:"cron"`), so **the
client-side handful is a bridge, not the design** (the sentence, as ordered). Rows per
board at the current slate (07-26 board): **HRR ~50, outs ~35–38** — both markets'
shadow rows arrive at full board rate under their suspensions. Projection at one
board/day starting 2026-07-29 (counted): by 08-15 = 18 boards → **~900 HRR shadow rows /
~650 outs rows** — row thresholds clear easily IF boards generate. **The named
thresholds**: (i) the SUSPENSION-review half of 08-15 needs ≥300 rows/≥10 boards of
SHADOW data → reachable by **~08-07** if boards resume 07-30; **vacuous if fewer than
10 board-days exist by 08-15** — that is the number, stated before the date. (ii) the
RETIREMENT half needs the same ≥300/≥10 **POST-REPAIR** — the repair spec is due 08-08
and the re-run 08-10, so post-repair boards by 08-15 ≤ ~5 under every now-visible
schedule: **the retirement half of 08-15 WILL be vacuous; it restates to
first-repair-ship + 10 board-days.** Written before the review, per the rule.

## THE 08-15 DECISION — FOUR RESOLUTIONS, PRICED FOR THE OWNER (2026-07-29; the owner decides this week)

| option | what it costs | what it destroys / requires |
|---|---|---|
| **(a) move the review to 08-17 (hits-family) / 08-20 (whole-board)** | 2–5 days of delay, slipping 1:1 per dark day | destroys nothing — the date was already a floor. What else keys off 08-15: the ICC day-level report, the "HRR amendment stays UNSIGNED until it lands" note, the crossover doctrine review. **The HRR suspension review does NOT move with it** — its bar is its own (≥300/≥10 shadow, reachable ~08-07 per above); only the RETIREMENT half moves (to repair+10, later than either date) |
| **(b) lower the bar below 20** | unknown — **the power of the fixture-representativeness test at 15 vs 20 boards is NOT computable from anything written** (no formal test model exists in the docs; the 20 counts boards, it does not state power) | per the pre-committed branch: **option (b) cannot be evaluated — the owner chooses among three, not four.** And **20 is CHOSEN, not fitted** (it fell out of the 07-27→08-15 calendar span) → recorded in the frozen table beside `coreEvMin` and `0.5` as an unmeasured parameter gating a calendar decision |
| **(c) declare the 07-29 expiry a NON-VINTAGE for the row-level tests specifically** | the only option keeping 08-15 — and it has an ARGUMENT, not a preference: `consMinEv` blocks TICKETS in `shAllocate`; board ROWS (prices, clamps, factor activity) are computed upstream and gate-independent — **the clamp fixture-representativeness, range-detector and factor-share readings are row-level and cannot see the gate**. BUT: (i) the M8 fix WAS a row-level vintage (07-27 night), so the row-homogeneous series starts 07-29 anyway (no 07-27/28 boards exist) → **row-level 20 lands 08-17, not 08-15 — even (c) only rescues 18 by 08-15**; (ii) the CROSSOVER DOCTRINE REVIEW is allocation-level and segments regardless — it moves under every option | splits the 08-15 bundle: row-level tests at 18-by-08-15 / 20-on-08-17 with the argument recorded; allocation-level readings move to homogeneous-20 |
| **(d) heterogeneous 20 with vintage as a covariate** | **not written anywhere** — no tool or memo has a vintage-covariate design; with segment sizes (2, 1, 15) the covariate ≈ dropping the 3 early boards, i.e. (a) wearing a statistics costume | requires a design addendum nobody has specced; honest label: not available this week |

**Adjacent dates, checked (owner's ask)**: the **08-10 six-regression re-run** consumes
statsapi player-dates (n≈3,061 leak-free), **no board requirement — unaffected**. The
**08-08 HRR repair spec** consumes archive close-joined HRR rows (~25/day, sweep-based,
**board-independent** — accrues on credits alone); its requirement is the sweep
continuing, not boards. Each printed beside its input; neither shares the 15-vs-20
arithmetic.

**What breaks if collection stops mid-window**: Phase 2 Series A is the board×close
join — a credit stop kills BOTH sides at once (no server boards, no close sweeps). The
08-15 20-board fixture-representativeness bar and the HRR retirement criterion
(≥300 rows/≥10 boards) slip 1:1 per dark day, per the standing floor rule; a partial
series still gives direction at reduced power but does NOT clear the 20-board threshold
as specced. **The alt-key sign-off is SUBORDINATE to a burn plan** — it was raised to
inform collection and cannot be decided as if the instrument it extends were funded to
exit. Owner inputs needed: the reset date, and which spenders to ration (generate slots
vs sweeps vs CLV).

## What the schedule actually delivers, per day

The evening run lands 20:16–20:55Z — about 2.5 h before a weekday 23:15 first pitch, which is
why it resolves. Against the generate entries:

| generate entry | context it reads | umpires? |
|---|---|---|
| **Mon–Fri 22:00** | evening (committed 20:16–20:55) | **YES** |
| **Sun 22:30** | evening | **YES** |
| Sat 18:00 | morning | **no** |
| Sun 17:00 | morning | **no** |

Weekend first pitches are 18:00–20:10Z, so *both* existing runs land after those games start.
Added `0 12 * * *` (≈15:20–16:00Z after queueing) to cover them — safe to add only because the
write merges now. **This is shadow-log completeness, not pricing: `shUmpKf` remains pinned off,
so none of it changes a price today. It changes whether the freeze-exit activation question has
data behind it.**


# THE CONTEXT PIPELINE'S THREE WRITE PATHS — audited 2026-07-27

`context.yml` produces three files. The `context.json` defect prompted the question of whether
the other two share it.

| file | pattern | verdict |
|---|---|---|
| **`data/ump_k.json`** | `load_json` → `db["league"]["g"] += 1`, `db["umps"].setdefault(...)`, guarded by `if y in db["days"]: return db` and a 600-deep `pks` dedupe | ✅ **ACCUMULATOR — safe.** Append-only with two independent idempotence guards. A failed run adds nothing and destroys nothing. This is why `ump_db_games` reached 171 while `hpUmp` read 0 — the database was never the problem |
| **`data/pen_quality.json`** | `load_json` → `db["days"][y] = day` → keep last 30 | ⚠️ **PER-DAY MERGE, but same-day REPLACE.** Other days are safe. A re-run of the *same* day writes a fresh `day` over the old one — and the boxscore loop `continue`s on any fetch failure, so a partially-failing re-run replaces a complete day with a partial one. **Bounded to one day and never observed** (`pen_quality` went 0 → 27 → 29 → 31 over the window, monotone), but it is the same shape |
| **`public/model/context.json`** | fresh object written over the file | ❌ **WAS REPLACE — fixed.** `merge_prior()` |

**`bullpen_last3` was the live exposure and it never fired.** It feeds `shPenF`, which is 100%
production-active — unlike `shPenQF`/`shUmpKf`, it is not pinned. A null-overwrite there would
have silently zeroed a working factor. Measured across 18 context commits: **30 teams on every
single one**, never empty. It is now covered by `merge_prior` regardless.

**`pen_quality` same-day replace: recorded, not fixed.** The fix is to merge the per-team dict
instead of assigning the day, and the reason to hold is that a *partial* day and a *complete*
day are not distinguishable after the fact — merging them would silently double-count outs.
The correct fix is to write the day only when the boxscore loop had no failures, which needs a
failure counter the loop does not currently keep. Scoped, low priority: it needs a same-day
re-run *and* a fetch failure to bite, and the job runs 2–3× a day.

# THE TWO UNAUDITED FACTORS — what they multiply, and where they sit (2026-07-27)

| factor | live share | what it multiplies | ever examined? |
|---|---|---|---|
| **`shParkF`** | **92%** (11 of 12 venues) | **the hit rate AND the HR rate**: L2060 `parkH=pk?pk.h:(coors?1.07:1)`, `parkHR=pk?pk.hr:(coors?1.08:1)`, then `hF=contact*pq*parkH*pl.h*(bpF‖1)` and `hrF=power*pq*wind.f*parkHR*pl.hr*(bpF‖1)`. Feeds **hits, total bases, HR — and H+R+RBI through both** | **NO** — no audit, no drift line, no doc entry until today |
| **`shPitIsoF`** | **100%** (23 of 23 starters) | **REPLACES `hrF` outright**: L2086 `if(isoF!=null)hrF=isoF*wind.f*parkHR*pl.hr` | **NO** |
| `shPriorKf` | **87%** (20 of 23 starters) | the K's rate, `shClamp(pr.k_pct/lg.k_pct, 0.75, 1.35)` | **NO** |

### `shPitIsoF` at 100% live means a branch is dead

When it resolves, `hrF` is **overwritten**, so the `power*pq*wind.f*parkHR*pl.hr` expression
computed one line earlier is discarded. At 23 of 23 starters that is every row with a starter.
The `power` and `pq` terms — starter quality and pitcher percentile — **do not reach the HR rate
at all** on those rows. Whether that is intended is unexamined; it is recorded here because a
100% live share on a REPLACING factor is a different fact from 100% on a multiplying one.

### ⚠️ `shParkF` sits directly under an open finding

`docs/hrr-recalibration.md` L482–485 records that the closed form applies "a Coors bump (×1.08)
and the shared park×handedness factor", with **no park-scoring term for runs/RBI** — a residual
gap accepted for the collection period. That accepted gap was assessed **without anyone knowing
the park factor was 92% live and unmonitored.** It does not invalidate the acceptance; it means
the acceptance was made against an unmeasured input, and the H+R+RBI ladder finding — already
one-instrument — has a second unexamined term inside it.

**No change proposed under the freeze.** Recorded so the freeze-exit review of the HRR residual
has the park factor's live share in front of it.

### The corrected scan must run against the ARCHIVE, not the fixture

`shParkF` and `shPitIsoF` defeated a source scan **by spelling** — their identity is supplied at
the call site, so no scan of the function body could have found them. The only check that catches
that class is **measured live share on real slates**, which is what `tools/factor_activity.py`
now does for all ten.

**So the ten-factor share table joins the 2026-08-15 archive-series reading**, beside the clamp
comparison. A factor at 100% or 0% on the fixture and materially different across twenty real
boards is the same finding as a clamp whose pinned fraction moves — and the fixture cannot
answer it, for exactly the reason the clamp comparison could not.

# WHICH PATH CONSUMES EACH FACTOR — traced once, 2026-07-27

The liveness gap, stated once and bounded: `tools/factor_activity.py` measures whether a factor
**returns a real value**, never whether that value **reaches a price**. `shParkF` would read 92%
live on the day the closed form stopped consulting it. So, for all ten, from the call sites:

| factor | call site | **consumed by** | live share |
|---|---|---|---|
| **`shParkF`** | L2059 → `parkH`/`parkHR` → L2062 `batVec` | **SIM ONLY** | 92% |
| **`shPitIsoF`** | L2085 → L2086 `batVec` | **SIM ONLY** | 100% |
| **`shPenF`** | L2114 → `penH`/`penA` → `bpF` arg of `batVec` | **SIM ONLY** | — |
| `shPenQF` | L2114, same expression | **SIM ONLY** (pinned off) | 0% |
| **`shPitPctF`** | L2061 (`batVec`) **and** L2326 (closed form) | **BOTH** | 100% |
| **`shTempF`** | L2024 `windNote` → L2111 (sim) **and** L2237 (closed form) | **BOTH** | — |
| **`shPriorKf`** | L2274 — K's closed form | **CLOSED FORM ONLY** | 87% |
| **`shOppWhiffF`** | L2282 — K's closed form | **CLOSED FORM ONLY** | — |
| `shUmpKf` | L2282, same expression | **CLOSED FORM ONLY** (pinned off) | 0% |
| **`shLaborF`** | L2262 — `pitcher_outs` closed form | **CLOSED FORM ONLY** | 30% |

## What the table says, beyond HRR

**Only two of ten reach both paths.** The rest are path-exclusive, and the split is not arbitrary
— it follows the market:

* **Hitting markets are priced twice.** The sim gets park, platoon, xISO-against and bullpen
  fatigue; the closed form gets none of those. **Two prices for one market, built from
  materially different information**, and which one a row gets depends on whether its game had
  two confirmed lineups (measured: 9 of 12 games all-sim, 3 none).
* **Pitcher markets are priced once.** K's and outs never enter the sim, so `shPriorKf`,
  `shOppWhiffF`, `shUmpKf` and `shLaborF` being closed-form-only is correct rather than a gap.

> ### The finding generalises beyond H+R+RBI
>
> **`shParkF` and `shPitIsoF` — the two factors with the highest live shares, 92% and 100% — are
> both sim-only. Every closed-form hitting price is built without a venue term.** That is
> `batter_hits`, `batter_total_bases` and `batter_home_runs` as well as H+R+RBI, on whatever
> fraction of rows the sim does not cover.
>
> **`batter_total_bases` is the one to watch**: it carries the open 2.30 over-dispersion, and
> `tbF` uses only the Coors flag and a coarse three-valued wind term. A market whose closed-form
> factor cannot distinguish 29 of 30 parks, over-dispersing, is a coherent pairing — and it is
> now a second traced candidate sitting under a second open finding.

**Nothing changed.** `shLaborF` at 30% live is the only other number worth flagging: an
`pitcher_outs` factor inert on 70% of starts, in the market with the known 0.86-clamp defect.

# THE SIM PRICES ONE MARKET. EVERYTHING ELSE IS CLOSED-FORM. (2026-07-27)

Measured on the 2026-07-26 board — a row is sim-priced iff it carries the `sim` tag, which
L2393 applies **only** inside `if(simP && mkt==="batter_hits_runs_rbis")`:

| market | rows | sim | **closed form** |
|---|---|---|---|
| `batter_hits` | 50 | **0** | **100%** |
| `batter_total_bases` | 50 | **0** | **100%** |
| `batter_home_runs` | 50 | **0** | **100%** |
| `batter_hits_runs_rbis` | 50 | 33 | 34% |
| `pitcher_strikeouts` | 35 | **0** | **100%** |
| `pitcher_outs` | 38 | **0** | **100%** |
| **batter total** | 200 | 33 | **84%** |

> **The sim overrides exactly one market.** `shParkF` (92% live), `shPitIsoF` (100% live),
> `shPenF` and `shPenQF` reach **33 of 200 batter rows — 16.5%** — and no pitcher row ever.
> I had described this as "whatever fraction the sim does not cover"; the fraction is 84%.

## The magnitude, per venue, on that slate

A closed-form row uses `1.000` for park (no Coors game on 07-26). The park table matched all
15 venues:

| | median | p90 | max |
|---|---|---|---|
| **hit-rate error** | **1.5%** | 2.5% | 3.5% (Globe Life) |
| **HR-rate error** | **4.5%** | **11.0%** | **14.5%** (PNC Park) |

Worst single rows: PNC **−14.5%** HR, Busch **−11.0%**, loanDepot **−10.0%**, Oracle −8.5%,
Tropicana **+7.0%**.

**Which market bleeds most:** `batter_home_runs` — 100% closed-form, and HR is the channel with
the 4.5% median / 14.5% max error. `batter_total_bases` is next (a home run is 4 bases, so the
HR error propagates into TB) and it carries the open **2.30 over-dispersion**. Hits bleed least
in percentage terms (1.5% median) but on the most rows.

## Does the retime fix it? No — and this is the part that changes the amendment's size

**The closed-form share is NOT "the rows where lineups weren't confirmed."** `luCoverage` on
07-26 was **13 of 15 games with both lineups confirmed** and hits/TB/HR were *still* 100%
closed-form. The sim ran — 33 HRR rows prove it — and simply does not produce prices for those
markets.

| | today | after a perfect retime |
|---|---|---|
| batter rows closed-form | 84% | **~68%** (HRR's 17 unsimmed rows recovered; hits/TB/HR unchanged at 100%) |
| **pitcher rows closed-form** | **100%** | **100% — permanently** |

**So the retime is a small part of this fix, not most of it.** It recovers H+R+RBI's unsimmed
third and touches nothing else. Routing `shParkF` into the closed-form factors is the whole
remainder, and it is the only thing that reaches hits, TB, HR and every pitcher row.

# CAN PITCHER MARKETS BE ROUTED THROUGH THE SIM? — split answer (2026-07-27)

## `pitcher_outs`: **PLUMBING. The distribution already exists and is discarded.**

`halfInning` threads `outsBySPHome` / `outsBySPAway` through every half-inning of every
simulated game (L1854–1855 init, L1864–1871 carried), against `ctx.homeLeash` / `ctx.awayLeash`.
**The sim already simulates how many outs each starter records, `n` times per game, and the
value is never surfaced.**

Collecting it is the same shape as the existing `legP` map: accumulate per sim, emit
`P(outs > line)`. **No new simulation work, no new model.**

That matters because `pitcher_outs` carries four defects — the `0.140` constant, the `k=4`
compression, the leash ceiling and the 23.5 pp gap — all in a closed form that structurally
cannot use the leash machinery built to model exactly this. **The sim path already models the
hook.** It has been running all along and its answer is thrown away.

## `pitcher_strikeouts`: **RE-ARCHITECTURE. There is no K in the model.**

`batVec` returns `[pBB, p1·abFrac, p2·abFrac, p3·abFrac, hr·abFrac]` — walks, singles, doubles,
triples, home runs. **An out is whatever is left over, undifferentiated.** `halfInning` returns
`{runs, next, spOuts, spPA, spRuns}` and no strikeout count anywhere.

Routing K's through the sim needs a **sixth outcome** in the batter vector, a per-batter K rate
against the specific pitcher, and re-validation that the outcome probabilities still sum
correctly — every existing sim-priced number moves. That is model work under a freeze, not
plumbing.

> ### The correction this makes to the outs plan
>
> The `pitcher_outs` fix has been treated as a constant swap (`0.140` → `0.400`). **The constant
> swap repairs the closed form. Routing outs through the sim replaces it** — and the sim already
> has the answer. Those are alternative amendments, not sequential ones, and the second is
> cheaper than it looks and strictly better conditioned.
>
> **Both stay unshipped.** But the freeze-exit choice is now between two known options rather
> than one, and the one nobody had costed is the smaller change.

# `shLaborF`'s DEAD ZONE — checked against today's population (2026-07-27)

`function shLaborF(pst){if(!shV2Sim())return 1;var ppg=shLaborPpg(pst);
if(ppg==null)return 1;if(ppg>=97)return 0.96;if(ppg<=84)return 1.02;return 1;}`

Pitches-per-start over **141 distinct probable starters** (`gs >= 3`), 2026-07-21 → 07-26:

| min | p10 | p25 | **median** | p75 | p90 | max |
|---|---|---|---|---|---|---|
| 51.2 | 82.1 | **86.0** | **89.7** | **95.2** | 115.9 | 231.7¹ |

| band | factor | share |
|---|---|---|
| ≤ 84 | 1.02 | 17% |
| **84 – 97** | **1.00 — inert** | **62%** |
| ≥ 97 | 0.96 | 21% |

¹ the tail is dirty (231.7 ppg is impossible; a swingman with few starts clearing `gs>=3`).
Quartiles and the median are unaffected.

**The modal starter sits at 89.7 ppg, inside the dead zone, and the ENTIRE interquartile range
(86.0 – 95.2) is inside it.** So the factor fires only outside the IQR.

> **CLOSED — verdict, magnitude, and why it will not be re-raised.**
**Magnitude: a −4% / +2% lever on 38% of starts, against a 23.5 pp gap.** That is an order of
magnitude too small to be the `pitcher_outs` story even if it were miscalibrated, and it is not
miscalibrated. Both halves are recorded so the closure is checkable rather than a verdict.

**Verdict: by design, and the design is roughly centred on today's population.**
> 84 sits at ~p17 and 97 at ~p78, so the band is close to symmetric — 17% below, 21% above. It
> is **not** the `g >= 5` shape, where a threshold sat 7× below where the data had moved to.
> Recorded as checked rather than assumed, which is the point of asking.

**What is worth flagging is its SIZE, not its inertness.** `shLaborF` is closed-form-only and
lives in `pitcher_outs` — the market with a 23.5 pp gap, the `0.140` constant, the `k=4`
compression and the leash ceiling. Its lever is **−4% / +2% on 38% of starts.** Against a 23.5 pp
gap that is not a candidate mechanism and should not be pursued as one. **It is a small,
correctly-calibrated factor in a badly broken market**, and saying so closes it rather than
leaving it on the list.

# THE SIM COMPUTES FOUR MARKETS AND THE PRICING LOOP READS ONE (2026-07-27)

**It is a one-line market filter, not missing machinery.** Confirmed against the code:

```js
var SIM_STAT={batter_hits:"h",batter_total_bases:"tb",batter_home_runs:"hr",batter_hits_runs_rbis:"hrr"};  // L2045
...legs.push({key:shLegKey(row.p,mkt,row.ln),team,bat:bi,stat,ln:row.ln,base});                            // L2138
...if(simP&&mkt==="batter_hits_runs_rbis"&&!simP.liveInit){var sp=simP.legP[...];}                          // L2394
```

Legs are built for **all four** markets. `legP` is populated for all four. **L2394 reads one.**

## What the sim computes, and where each quantity goes

| quantity | computed | surfaces into a price? |
|---|---|---|
| per-batter **hits** | `hA` accumulator, `halfInning` | **DISCARDED** — in `legP`, never read |
| per-batter **total bases** | `tA` | **DISCARDED** |
| per-batter **home runs** | `hrA` | **DISCARDED** |
| per-batter **runs** | `rA` | feeds `hrr` only |
| per-batter **RBI** | `rbiA` | feeds `hrr` only |
| **H+R+RBI** | `legP[…hrr…]` | ✅ **read** — the only one |
| **starter outs** | `outsBySPHome/Away`, threaded L1854–1871 against the leash | **DISCARDED** |
| starter **PA / runs allowed** | `spPA`, `spRuns` | **DISCARDED** (used internally for the `V2` hook rule) |
| bullpen entry (`vsBP`) | `spOuts >= leash` | internal only |
| game runs / ML | `pHome` | ✅ read |
| RL cover | via `mapCover` | ✅ read |
| **strikeouts** | **not modelled at all** | — an out is undifferentiated |
| **pitch count** | not modelled | — |

**On the armed fixture, `legP` holds 96 HR, 57 hits, 30 TB and 13 H+R+RBI leg probabilities.
183 of 196 batter legs are simulated and thrown away every run.**

## How far apart the two paths actually are

Sim probability minus the shipped closed-form `pModel`, same row, oriented to the row's own side:

| market | n | **median** | p10 | p90 | mean abs | max abs |
|---|---|---|---|---|---|---|
| **`batter_hits`** | 38 | **+9.2 pp** | −0.3 | +12.8 | 8.4 | 14.3 |
| **`batter_total_bases`** | 30 | **+5.0 pp** | −4.0 | +11.1 | 5.9 | 14.8 |
| `batter_home_runs` | 37 | +1.2 | −2.5 | +5.2 | 2.4 | 7.6 |
| **`batter_hits_runs_rbis` — CONTROL** | 13 | **0.0** | −0.1 | 0.0 | **0.0** | **0.1** |

**The control is the point.** H+R+RBI rows already take the sim value, so sim − `pModel` must be
zero there, and it is (max 0.1 pp, rounding). The join and the over/under orientation are
therefore correct, and the other three rows are a real disagreement rather than a bookkeeping
artifact.

> ⚠️ **THIS SAYS THE PATHS DISAGREE. IT DOES NOT SAY THE CLOSED FORM IS WRONG BY 9.2 pp.**
> The direction is consistently *sim-higher*, which is as consistent with a sim bias as with a
> closed-form one — and the sim is exactly the path the closed-form-only branch of the rung
> table exists to suspect. Measured on the **fixture** (`SIM_PATHS_FIXTURE`, not production
> `simN`), so the magnitudes are indicative. **What is established is the size of the open
> question, not its answer.**

**Which makes the "why is the sim HRR-only" answer: a one-line filter.** The cost of routing the
other three is not machinery — it is that every hits/TB/HR price moves by a median 1.2–9.2 pp,
which is a freeze-class change needing its own validation, not a widening of a condition.

# FREEZE-EXIT AMENDMENT BUNDLE — ordered by evidence (2026-07-27)

## First: two axes, not one. Four amendments are not commensurable.

| | amendments | axis |
|---|---|---|
| **MODEL** — change model-minus-market | `shParkF` routing · sim routing · HRR λ conditioning · the `pitcher_outs` constant | measured in **pp of probability** |
| **ALLOCATION** — change what is bet, not what is believed | leg-equivalent EV floor · edge-aware base weight | measured in **bp of log-growth** |

**The allocation pair does not move model-minus-market at all.** Ranking all four on that axis
would have put two of them at zero and read as "no effect" rather than "wrong axis".

## MODEL amendments — and they OVERLAP, so they cannot be summed

> **Sim routing SUBSUMES `shParkF` routing for every market it covers.** A hits/TB/HR price that
> goes through the sim gets `parkH`/`parkHR` automatically, along with platoon, xISO-against,
> bullpen chains and teammate correlation. Adding park to the closed form and then routing the
> same market to the sim would be two solutions to one problem.

| rank | amendment | measured effect | reaches |
|---|---|---|---|
| ~~1~~ | ~~sim routing, batter markets~~ | **SUPERSEDED 2026-07-27 — see the external check below.** Refuted for `batter_hits` (sim mean-abs error 7.1 vs closed form 5.6); survives marginally for TB and HR | TB + HR only |
| **2** | **`pitcher_outs` → sim** (collect `outsBySP*`) | the closed form's gap is **23.5 pp**; the sim path already models the hook the closed form cannot use | 38 outs rows, 100% of them |
| **3** | **`shParkF` → closed form** | hit rate **1.5% median / 3.5% max**; **HR rate 4.5% median / 11.0% p90 / 14.5% max** | **the residual after 1 and 2** — pitcher K's permanently, plus any market left closed-form |
| **4** | **HRR λ conditioning** | closed-form λ has **zero** site variation on a non-Coors slate; recovers ~0.12 of spread against a market drift of +0.479 | 17 of 50 HRR rows (34%) |
| **5** | `pitcher_outs` constant `0.140`→`0.400` | gap −23.3 → **−11.5 pp**, above-market 0/38 → 11/38 | 38 rows — **alternative to 2, not additional** |

**Recommendation unchanged: the constant swap stays the shipped recommendation for outs** (small,
verified, reversible). Sim routing is the strictly better option and is now in the bundle **with
its cost stated** — every outs price moves, and it needs its own validation pass.

## `shParkF` → closed form: the spec

| | |
|---|---|
| **where** | L2326, the three closed-form factors. `hF` and `tbF` take **`parkH`**; `hrF` takes **`parkHR`** — the two are separate columns in `SH_PRIORS.parks[L\|R]` and must not be crossed |
| **handedness** | the table is keyed `L`/`R` by **batter stand**, which the closed form already has (it passes `stand` to `shParkF` in the sim path at L2059) |
| **⚠️ the Coors flag must be REMOVED in the same change** | `(coors?1.07:1)`, `(coors?1.10:1)`, `(coors?1.08:1)` are **park factors**. Coors Field is in the park table. Leaving both applies the venue twice — a **1.07 × 1.085 = 1.16 hit factor** where the table says 1.085. This is the double-counting check and it is not optional |
| **H+R+RBI** | L2358 must take the blended factor from amendment 4, not a raw `parkH` — its λ is a per-**game** rate, and a per-**AB** park factor applied to it is a units error |
| **projected effect** | closed-form batter rows move by the per-venue error above: hits ±1.5% median, HR ±4.5% median / 14.5% max. **Directionally it removes a known bias rather than adding an unknown one** — the current value is provably wrong at 29 of 30 parks |

## ALLOCATION amendments — ranked on their own axis

| rank | amendment | measured effect |
|---|---|---|
| 1 | **edge-aware base weight** (`base = max(ev,0)/(dec−1)` instead of `prob`) | log-growth **126.6 → 187.2 bp**; crossover **3.05 → 1.40 pp** |
| 2 | leg-equivalent EV floor | **4 of 18 tickets (22%)** over-admitted today; crossover 3.05 → 3.50 pp |

**Both stay unshipped and both are still gated on a positive Phase 2** — they are corrections to
machinery that assumes an edge exists.

# ⚠️ THE EXTERNAL CHECK INVERTS RANK 1 — sim routing is REFUTED for hits (2026-07-27)

`+9.2 pp` was a magnitude with no direction of correctness. Checked against the only external
reference available — the market's own de-vigged fair — on **`propBoard`** (both sides,
uncapped, not the ranked `categories` population):

| market | n | **sim − market** med / meanAbs | **closed form − market** med / meanAbs | closer to market |
|---|---|---|---|---|
| **`batter_hits`** | 57 | **+5.0 / 7.1** | **−4.3 / 5.6** | **CLOSED FORM** |
| `batter_total_bases` | 30 | **+1.0** / 5.7 | −2.6 / **6.3** | **SIM**, marginally |
| `batter_home_runs` | 61 | **+0.4** / 3.5 | −1.1 / 3.5 | **tie on error, sim better centred** |
| **HRR — CONTROL** | 13 | +5.7 / 5.4 | +5.7 / 5.4 | **identical, as it must be** |

The control is again the validation: HRR's `pO` *is* the sim value, so recovering the
closed-form model from `pO = W·pModel + (1−W)·fO` returns the sim. Identical columns prove the
recovery arithmetic, and the other three rows are real.

> ### THE EXACT FAILURE MODE THAT WAS ASKED ABOUT
>
> **On hits the closed form UNDERSHOOTS the market by −4.3 and the sim OVERSHOOTS it by +5.0.**
> Routing swaps one error for another **and makes it larger** — mean absolute error 5.6 → 7.1.
>
> **Rank 1 does not stand for `batter_hits`.** It survives, marginally, for TB (5.7 vs 6.3) and
> HR (tied at 3.5, better centred). The +9.2 pp figure measured the size of a disagreement and
> said nothing about who was right; against an external reference the closed form wins the
> largest of the three markets.

**Revised: sim routing is a per-market amendment, not a blanket one.** TB and HR only, and both
on thin margins from a fixture. Hits stays closed-form and its −4.3 undershoot becomes its own
open question — a bias the sim would not have fixed.

**Caveats, stated:** fixture slate at `SIM_PATHS_FIXTURE`; the market fair is the engine's own
de-vig, so it is not an independent instrument in the strict sense — it is simply the only
external one there is. Neither justifies acting on the margins in TB and HR without the archive
series behind them.

# SIZING `pitcher_strikeouts` → SIM: contained, with one trap (2026-07-27)

Read from the PA draw at L1918–1969. **Not building it; sizing it.**

## The logic is a SPLIT of a branch that already exists

The draw is one `u = rng()` against the cumulative vector `v = [BB, 1B, 2B, 3B, HR]`, then a
`rng() < SH_ADV.roe` for reached-on-error, and everything remaining falls into:

```js
}else{ /* out in play: sac fly scores R3 (<2 outs); GIDP with R1 (<2 outs) */
  if(b3>=0&&outs<2&&rng()<SH_ADV.sacFly){...}
  else if(b1>=0&&outs<2&&rng()<SH_ADV.gidp){...}
  outs++;if(!vsBP)spOuts++;
}
```

A strikeout is an out **with no ball in play**, so it splits that branch cleanly:

| | |
|---|---|
| **no sixth element in `v`** | K is conditional on "out": `pK_given_out = pK / (1 − Σv − roe)` |
| **semantically it FIXES a small existing error** | the branch currently lets a strikeout produce a **sac fly or a GIDP**. Both require contact |
| **the leg is on the PITCHER, not the batter** | accumulate `kBySPHome/Away` exactly as `outsBySPHome/Away` is already threaded |
| **inputs exist** | `kps` (the closed form's per-start K rate, L2274) and `shOppWhiffF`'s lineup whiff percentiles |
| **no cascade** | `spOuts`, `spPA`, `spRuns`, the leash, the V2 hook and the bullpen chain are all untouched — a K increments `outs`/`spOuts` exactly as any other out does |

**Size: ~10 lines in `halfInning`, one accumulator, one `SIM_STAT` entry, one leg-builder case.**

## ⚠️ The trap: RNG stream consumption

`rng` is `shMulberry`, seeded per game. **Inserting an `rng()` call inside the out-branch shifts
every subsequent draw**, so every existing sim number moves and **both baselines break** — a
change that looks like ten lines would rebaseline the entire sim.

**The fix makes it additive instead:** draw the K decision from a **second, independently seeded
generator**. The primary stream's consumption pattern is then untouched, existing sim outputs are
byte-identical, and K's arrive as a pure addition — **the same shape as `clampActivity`**, which
was proven byte-identical against both baselines by hashing the whole board minus the new key.

## Verdict

> **It belongs in the bundle, not in a post-freeze project — PROVIDED the second-stream design is
> used.** With it: contained, parity-checkable, ~10 lines. Without it: a full sim rebaseline, and
> then it is a post-freeze project.
>
> **The distinction is entirely in the RNG design, not in the modelling.** That is worth stating
> plainly, because "re-architecture" was the right word for what a naive implementation costs and
> the wrong word for what the change actually is.

# ⚠️ THE HITS BRACKET IS A THIRD FINDING — a DERIVED distributional error (2026-07-27)

Closed form **−4.3**, sim **+5.0**, same rows, bracketing the market. Decomposed as asked.

## They share the base EXACTLY

| step | closed form (L2348–2349) | sim (`batVec` L2065) |
|---|---|---|
| window blend | `shBlendN(st, s.h, "ab", 10)` | **identical** |
| EB shrink | `shShrink(bn.r, bn.n, **60**, shPriorH(st, Lh))` | **identical — same k, same prior** |

**The bases are the same function with the same arguments.** So the 9.3 pp disagreement is
entirely downstream, and four divergences produce it:

| | closed form | sim |
|---|---|---|
| pitcher adjustment | `contact` (WHIP proxy) × `pq` × **`bvpRate`** | **`shLog5(hitR, pBAx, lgXBA)`** — xBA-against. **No `bvpRate`** |
| park / platoon | Coors flag only | `parkH × pl.h` |
| **PA count** | **`expAB = pa·(1 − clamp(bbr,0,.25)·0.9)` — deterministic** | **SIMULATED — endogenous** |
| clamp | none on the rate | `shClamp(hitR·hF, 0.12, 0.42)` |
| **distribution** | **`shPOver(0.5, λ) = 1 − e^{−λ}` — POISSON** | empirical over *n* discrete PAs |

## The level error is DERIVED, not hypothesised

`shPOver` prices a 0.5 line as `1 − e^{−λ}` with `λ = rate × expAB × hF`. But λ is a **mean count
over `n` at-bats at per-AB rate `p`**, and the true process is `n` Bernoulli trials:

> **`(1−p)^n < e^{−np}` for every `p ∈ (0,1)`. So Poisson ALWAYS understates `P(≥1)` for the
> same mean** — it spends probability mass on two-or-more hits *in a single at-bat*, which cannot
> happen, and that mass comes straight out of `P(≥1)`.

| n (AB) | p | λ | Poisson | Binomial | **understated by** |
|---|---|---|---|---|---|
| 4.1 | 0.22 | 0.902 | 59.4% | 63.9% | **+4.5 pp** |
| 4.1 | 0.24 | 0.984 | 62.6% | 67.5% | **+4.9 pp** |
| 4.1 | 0.26 | 1.066 | 65.6% | 70.9% | **+5.3 pp** |

**Median across a realistic grid: +4.9 pp. Re-priced on the board's own 36 hits O0.5 rows,
inverting the engine's own λ: +6.3 pp median (p10 +5.8, p90 +6.8).**

**Measured closed-form-minus-market on `batter_hits`: −4.3 pp.** The family error alone accounts
for the whole level miss.

### The cross-market test, and it passes

The error scales with per-AB `p`, so it must be large for hits and near-zero for home runs:

| market | per-AB p | **predicted error** | **measured cf − market** |
|---|---|---|---|
| `batter_hits` | 0.240 | **+4.9 pp** | **−4.3 pp** |
| `batter_home_runs` | 0.040 | **+0.3 pp** | **−1.1 pp** |

**The ordering and the rough magnitudes both match**, on a prediction made from the arithmetic
rather than fitted to the data. That is an independent check the market-comparison alone could
not provide.

> ### What this means for the two paths
>
> **The sim uses the right family** — discrete at-bats — and its `+5.0` overshoot must come from
> elsewhere. The leading candidate is the **endogenous PA count**: a batter's plate appearances
> in the sim depend on how the whole lineup performs, so a marginally hot offence gives everyone
> extra PAs and raises `P(≥1 hit)` through *both* channels at once. `expAB` is exogenous and
> cannot do that. **Traced to the mechanism, not yet measured.**
>
> **The bracket is therefore not two conditioning errors.** It is one path with the wrong
> distributional family and another with a plausible endogeneity — which is why they miss in
> opposite directions and why **no blend of the two is the right answer**.

**Nothing changed.** This is a new model amendment (**M7**) and it outranks the others on hits:
it is derivable, it is one function call (`shPOver` → a binomial/`expAB`-aware form on 0.5
lines), and it needs no new data. **It also touches every 0.5-line market priced by `shPOver`**,
so its blast radius must be measured before it is proposed.

# ⚠️ `shTbOver` PRICES A 0.5 LINE WITH THE 1.5 FORMULA — a definite bug (2026-07-27)

```js
function shTbOver(line,lamH,s1,s2){
  var P0=shPoisPmf(0,lamH),P1=shPoisPmf(1,lamH),P2=shPoisPmf(2,lamH);
  if(line<2)return 1-(P0+P1*s1);   /* 1.5: ≤1 TB = 0 hits, or 1 single */
```

**The comment says the branch is for 1.5. `line<2` also catches 0.5.** `1−(P0+P1·s1)` subtracts
the probability that the batter's one hit was a single — correct for "≤1 total base", i.e.
**P(TB ≥ 2)**. Applied to an O0.5 line it answers the wrong question: **P(TB ≥ 1) is just
`1 − P0`**, because a single *is* one total base.

## Proven WITHOUT the market having to be right

**TB O0.5 and hits O0.5 are the same event** — at least one total base ⟺ at least one hit. So the
model's two prices for it must agree. Joined on the same player, **127 rows** on the real
2026-07-26 board:

| | model | market |
|---|---|---|
| **TB O0.5** | **33.6%** | 57.1% |
| **hits O0.5** | **58.1%** | 57.2% |
| **self-consistency** | **−24.4 pp** | **−0.1 pp** |

> **The market agrees with itself to 0.1 pp. The model disagrees with itself by 24.4 pp.**
> This is an internal-consistency failure: it needs no external reference, no assumption that the
> market is correct, and no fixture. `1 − P0` for a typical hitter is ~57%; `1 − (P0 + P1·s1)` is
> ~34%. That is the whole gap.

**Scope: 150 TB O0.5 rows on `propBoard` (5 reached `categories`, all shown as UNDER — which is
what a model saying 33.6% against a market at 57.1% must do).**

**The fix is one comparison**: `if(line<1) return 1-P0;` before the existing branch. Frozen —
this is a freeze-exit amendment (**M8**), not a collection-period edit.

## It probably collapses the TB over-dispersion finding

`batter_total_bases` carries an open **2.30 ladder-drift ratio** — the model's implied λ moving
2.3× the market's across rungs. **A rung priced as if it were the next one up is exactly what
produces that**: the O0.5 implied λ is far too low, so the apparent drift from O0.5 to O1.5 is
inflated. **The over-dispersion may be this bug and nothing else.**

Recorded as the leading candidate, **not confirmed** — the ratio was measured across rungs
including 1.5→2.5 pairs, and only the 0.5 rung is mis-mapped. Re-running the ladder test with the
0.5 rung excluded is the check, and it is cheap.


# M7 — DERIVABLE, BUT NOT OBSERVED IN PRODUCTION (2026-07-27)

M7's arithmetic stands: `(1−p)^n < e^{−np}` always, so Poisson understates `P(≥1)`. Its **rung
signature** follows, and it is the flip that was predicted:

| n=4, p=0.24, λ=0.96 | Poisson | binomial | **Poisson − binomial** |
|---|---|---|---|
| O0.5 | 61.7% | 66.6% | **−4.9 pp** — model LOW |
| O1.5 | 25.0% | 24.5% | **+0.5 pp** — model HIGH |
| O2.5 | 7.3% | 4.5% | **+2.8 pp** — model HIGH, a 62% relative overstatement |

**Signature: − → +**, flipping between the first and second rung and growing sharply after it.

## The production check says it is not happening

On the real 2026-07-26 board, `propBoard`, **both sides, unselected**, model-minus-market on the
over:

| | n | median | under-has-edge |
|---|---|---|---|
| `batter_hits` **O0.5** | 232 | **+0.3 pp** | **47%** |
| `batter_hits` O1.5 | 35 | −0.3 pp | 51% |
| **all 0.5 lines through `shPOver`** | 535 | **+0.6 pp** | **46%** |
| all higher rungs | 311 | +1.1 pp | 46% |

**M7 predicts −4.9 pp and a strong under skew at 0.5. Neither appears.** No level bias, no rung
flip, no side skew.

> ### ⚠️ AND THE −4.3 pp THAT MOTIVATED M7 WAS A FIXTURE ARTIFACT
> The `batter_hits` closed-form undershoot was measured on the **armed fixture**. The real board
> gives **+0.3 pp** on the same statistic. **The fixture and production disagree by 4.6 pp on the
> quantity M7 was built to explain** — which is the fixture-representativeness question arriving
> early, and unasked.
>
> **M7 is demoted from "rank 1 on hits" to DERIVABLE-BUT-DORMANT.** The arithmetic is not wrong;
> the net model output is evidently calibrated such that the family error does not surface. Fixing
> it in isolation would move 617 rows off a level they currently hit.

## The side-bias check nearly went wrong the same way

The first cut used `categories` and read **118 of 118 rows OVER at 0.5 lines, 0% unders** —
apparently a violent refutation. It is not evidence at all: `categories` is *"top 50 per market
ranked by win probability, one side per line"*, and at a 0.5 line the over is simply the
higher-probability side. **The fourth time that population has produced a confident wrong
reading.** The unselected `propBoard` numbers above are the answer.

## Blast radius, counted

| function | rows (propBoard, 07-26) |
|---|---|
| **`shPOver`** | **2,026** — of which **617 (30%) are 0.5 lines** |
| `shTbOver` | 391 — of which **150 are the mis-mapped 0.5 branch** |

**M7 sits BELOW M1 in the bundle**: 617 rows at an effect that production says is ~0, against
M1's per-row park error of up to 14.5% on HR across every closed-form row. **M8 — the `shTbOver`
0.5 branch — outranks both**: 150 rows, a definite bug, a one-line fix, and a 24.4 pp
self-inconsistency.

# THE SELF-CONSISTENCY SUITE — the independent instrument this project kept not having (2026-07-27)

`tools/self_consistency.py` + `tests/self-consistency.test.ts`. **A violation is a proof, not
evidence** — these are logical identities between two prices the model itself emits, so no
market, no fixture, no accrual and no assumption that the market is right.

## Results on the real 2026-07-26 board

| constraint | n | **MODEL bad** | med Δ | MARKET bad | med Δ |
|---|---|---|---|---|---|
| **TB ≥ 1 == H ≥ 1** | 127 | **118** | **−23.4** | 48 | **−0.5** |
| H ≥ 1 ≥ HR ≥ 1 | 229 | 0 | +46.9 | 0 | +46.4 |
| HRR ≥ 1 ≥ H ≥ 1 | 57 | 0 | +10.3 | 0 | +4.7 |
| HRR ≥ 1 ≥ HR ≥ 1 | 56 | 0 | +54.1 | 0 | +43.8 |
| HRR ≥ 3 ≥ HR ≥ 1 | 16 | 0 | +24.9 | 0 | +22.5 |
| TB ≥ 2 ≥ H ≥ 2 | 34 | 0 | +12.6 | 0 | +12.9 |
| monotone (all 6 markets) | 170 | **0** | — | 0 | — |

**One violation, and it is M8.** The market's 48 "violations" on the identity sit at a **−0.5 pp**
median — de-vig noise against a 1.0 pp tolerance — against the model's **−23.4**. Everything else
is clean on both sides, which is what makes the one hit meaningful rather than a detector that
flags everything.

### The cleanest statement of M8, from `monotone bases` reading exactly +0.0

On **108 players carrying both TB rungs**, the model's `P(TB≥1) − P(TB≥2)` is **+0.0** while the
market's is **+23.5 pp**. `if(line<2)` catches 0.5 *and* 1.5, so both evaluate `1−(P0+P1·s1)`:

> **`shTbOver` emits ONE NUMBER for TWO DIFFERENT QUESTIONS.**

That fully explains the open **2.30 ladder-drift ratio** — two rungs sharing a probability make
the inverted λ move absurdly between them. Confirm by re-running the ladder test after the fix.

## The boundary scan — complete, and it found exactly one

Every rung comparison in the pricing path:

| line | comparison | comment says | correct? |
|---|---|---|---|
| **L1548** | `if(line<2)` | **"1.5"** | ❌ **also catches 0.5 — M8** |
| L1549 | `if(line<3)` | "2.5" | ✅ 0.5/1.5 already returned above |
| L2241 | `row.ln!==0.5` | HR anytime only | ✅ exact equality |

**One mismatch in the whole pricing path, and it is the one found.** The scan is bounded and
complete rather than a sample.

## ⚠️ Encoding it caught the vacuous-pass rule catching ITSELF

The first version asserted the identity across the fixture's players. It **passed vacuously**:
**99 players, ZERO carrying both TB O0.5 and hits O0.5.** A loop over an empty intersection
asserts nothing and reports green — the exact defect the top rule in
`docs/harness-substitutions.md` describes, reproduced **one turn after writing it**.

Fixed by asserting on the **pure function** instead — `shTbOver` needs no board, no overlap and
no slate. `tools/self_consistency.py` runs the board-level version where the rows do exist.

**And the test now PINS THE DEFECT, not the fix.** M8 is unfixed under the freeze, so the suite
asserts current behaviour (`shTbOver(0.5) === shTbOver(1.5)` exactly, gap > 0.15) with the correct
assertions written beside it, commented. Same treatment `pitcher_outs` gets. **When M8 ships the
test fails, and that is the point.**

# M7's COMPENSATOR EXISTS BUT CANNOT BE LOCALISED YET — M9, interlocked (2026-07-27)

**The family error is real at the OBSERVED parameters, not just on a grid.** `expAB` recovered
from 45 hits `case` strings: min 3.5, **median 4.1**, p75 4.2, max 4.5. At λ = 0.958 and n = 4.1
the Poisson-vs-binomial error is **+4.8 pp** — my grid was right, so "wrong parameters" is
eliminated.

**Production reads +0.3 pp. So an offsetting term of ≈ +4.5 pp exists.** Expressed as λ: to make
Poisson emit the binomial answer at n=4.1, λ would have to be **1.092 instead of 0.958 — inflated
by +13.9%**.

## ⚠️ The obvious measurement is CIRCULAR and does not locate it

Backing λ out of both sides gives model **0.941** vs market **0.958** — model *low* by 1.8%,
apparently refuting the compensator. **That reading is worthless:** `λ = −ln(1−P)` is a monotone
transform of `P`, so "model λ minus market λ" is just "model P minus market P" in different
units. Both were converted through the *same* Poisson. The comparison cannot detect a family
error by construction.

**Recorded because it looked like a result for several minutes.** It is the same shape as
reconstructing a filter chain instead of running it.

## What can and cannot be said

| | |
|---|---|
| **established** | the family error is +4.8 pp at real parameters; the net error is +0.3 pp; therefore **≈ +4.5 pp of compensation exists somewhere in `λ = rate × expAB × hF`** |
| **not established** | which term. `rate`'s EB prior, `hF`'s multiplier chain, or `expAB` — the market gives a **probability**, not a mean, so no external estimate of true expected hits exists today |
| **what would localise it** | **graded outcomes.** The prediction store logs the stated `p` and the result, so realised hits-per-AB is measurable once hits rows accrue. That is the only non-circular reference |

> ### M7 AND M9 ARE AN INTERLOCKED PAIR — they ship together or not at all
>
> **Fixing either alone moves 617 rows about five points in the wrong direction.** Fix M7 and the
> output jumps +4.8 pp with the inflated λ still in place; fix M9 and the output drops ~4.5 pp
> with Poisson still understating.
>
> **And the cancellation is only known to hold over the observed λ and `expAB` range** — λ ≈ 0.96,
> `expAB` 3.5–4.5. The family error runs +5.7 pp at n=3.5 and +4.3 pp at n=4.5, so the offset is
> *not* flat in `expAB`; two defects cancelling to within 0.3 pp across that range is either
> calibration having absorbed it, or luck at the current parameters. Either way it is **fragile in
> a way one defect would not be.**
>
> Marked in `docs/freeze-exit-bundle.md` as **M7+M9, interlocked. Never separately.**

## THE UNIFORM COMPENSATOR IS REFUTED — measured, 2026-07-27

The interlock is derivable, so it was tested before waiting for accrual. **If M9 is a uniform
λ inflation calibrated to cancel M7 at the 0.5 rung, every rung above 0.5 must read ≈ +5 pp**
(binomial n=4, p=0.24 → 66.6/24.5/4.5; Poisson at λ×1.139 → 66.5/29.9/9.8; net −0.1/+5.4/+5.3
— arithmetic verified exactly).

Measured per row on the real 2026-07-26 board (`tools/rung_signature.py`; un-blend
`pModel = (pO − 0.65·fO)/0.35` validated by ladder self-consistency — 18 recovered hits
ladders, worst Poisson inconsistency **0.29 pp**, so the recovery chain is exact):

| quantity | value |
|---|---|
| Δmeasured — hits O1.5 residual minus the same player's O0.5 residual | **median +2.00 pp, mean +1.43** (n=18 pairs) |
| Δpredicted — each row's own λ̂ and case-string expAB | **median +5.72, mean +5.75** (n=17) |
| **paired shortfall (pred − meas)** | **+4.35 pp, SE 0.39, t = 11.1** |

**The uniform-inflation characterisation of M9 is dead.** And it takes the reference
distribution with it: within the (fixed-n binomial truth) × (uniform λ inflation) family, *no*
inflation fits both rungs — cancelling at 0.5 forces +5.4 at 1.5, and the board reads +1.4–2.0.
The market's own rung structure prices hits ~70% of the way from a fixed-n binomial toward a
Poisson — which is what a real hit distribution looks like once AB counts are random and p
varies by matchup. **M7's magnitude and M9's compensator were both computed against a
reference the market itself refutes.**

Rungs elsewhere: **TB** O2.5 carries n=1 model-priced row and O0.5 is M8 (−22.6 median on this
board, n=127 — consistent with the −23.4 measured by the suite) — no clean rung pair until M8
ships. **HR** has no model-priced rung above 0.5 at all (ALT ladder rungs carry no `pO`). The
rung-signature instrument lives entirely on hits today.

| | |
|---|---|
| **established** | the compensation is NOT a uniform λ scale; the net model-vs-market rung structure on hits is **+1.4–2.0 pp at O1.5**, t ≈ 3.6 — small, real, and opposite in sign to HRR's ladder |
| **still open** | whether the residual tail gap is the model's or the market's — the market is the reference here, and only graded outcomes remove that assumption |
| **caveat** | the within-player pairing kills player-level offsets, not rung-level market shading; a longshot-side shade at 1.5 would bias Δmeasured down. n=18 pairs, one board — the archive series re-measures this daily |

## THE RESIDUAL FIELD IS NOT A LEVEL — two gradients dwarf everything above (2026-07-27)

Regressing the hits O0.5 residual (`pModel − fO`) on each row's own inputs, 2026-07-26 board.
The slope survives a **common** market bias that the level cannot — but not a market bias
*correlated with the regressor*, so ownership still needs grading. expAB/avg30/xwOBA come from
the board's own case strings (input-side reads — a price-derived control would be rule-22
circular): coverage **135 of 232** hits O0.5 rows (the uncovered 97 are outside every cats
top-50, so the sample tilts toward higher-probability rows).

| gradient | slope | predicted by the interlock's non-flatness |
|---|---|---|
| **expAB** (simple) | **+7.39 pp/AB, SE 1.73** — n=135 | **−0.57 pp/AB** (computed per row at fixed +13.9%) |
| expAB (controlling avg30 + xwOBA pct, n=104) | **+6.16, SE 1.57** — survives quality controls | — |
| **avg30** (last-30 average, same regression) | **+0.79 pp per 10 points, SE 0.09, t ≈ 9** | — |
| xwOBA percentile (same regression) | −0.016/pct, SE 0.018 — **nothing** | — |

**The measured gradient is 13× the predicted magnitude and the opposite sign.** The
interlock's ±1.4 pp cancellation-drift concern is a rounding error next to this: across the
observed expAB range (3.0–4.6) the expAB gradient alone spans ~12 pp of residual.

Three structural readings, each pinned by a sub-measurement:

1. **It is not slot alone.** Decomposing expAB = pa(spot) × (1 − 0.9·bbr): pa(spot)
   +3.98 pp/AB (SE 2.48, weak) vs walk-discount **+3.97 pp per 0.1 (SE 0.99, 4 SE)** — the
   engine discounts a walker's hit λ harder than the market does. Candidate mechanisms: the
   0.9 coefficient, or errors-in-variables in the `bbr` blend (min denominator 10 AB — noise
   in the engine's own walk read produces exactly this slope against a market using truer
   rates). By-spot means are nearly flat (+3.5 at #1 to −3.1 at #9, nonmonotone, n 7–22).
2. **The hot-form gradient is separate and larger per unit of spread**: +0.79 pp per 10
   points of last-30 average means a .320-vs-.220 pair differ by ~8 pp of residual. The skill
   read (xwOBA pct) carries nothing — the model diverges from the market on *recency*, not
   quality. The mechanism candidate is `shShrink(bn.r, bn.n, 60, prior)`: k=60 shrinks
   last-30 form less than the market does.
3. **The sim does not show it.** HRR O0.5 splits by pricing path: sim-priced slope **+0.73
   (SE 2.54, n=22 — flat)**; closed-form n=8 (+18.1, SE 10.8 — noise-level but same sign as
   hits). The sim simulates PA volume lineup-slot by lineup-slot and never consumes expAB —
   and it agrees with the market along expAB while the closed form disagrees. Two independent
   volume models (sim, market) against one: the defect locus is **the closed form's
   λ = rate × expAB mapping**, not an input upstream of both paths.

**Status: PROVISIONAL — one board, cats-selected sample.** Pre-registered for two checks:
(a) the archive series re-runs `tools/rung_signature.py` daily — stability by ~08-05;
(b) graded outcomes bucket hit rate by expAB tercile (spread ≈ 6.3 pp predicted between
extreme terciles at 135 expAB-covered rows/day) — **3σ by ~08-20, decisive well before exit.**
That grading test is the non-circular reference the M9 hunt was waiting for, and it
adjudicates the avg30 gradient with the same rows.

Indexed as **M10** (closed-form expAB over-steepness) and **M11** (hot-form under-shrinkage)
in `CLAUDE.md` — both PROVISIONAL until (a) or (b) lands.

## M10'S MECHANISM: ERRORS-IN-VARIABLES IN `bbr`, three convergent signatures (2026-07-27)

`bbr` is `shBlend(st, bb, "ab", 10)` — the .25/.35/.40 recency blend with a 10-AB minimum per
window — so it carries large sampling noise, and `expAB = pa(spot)·(1−0.9·bbr)` inherits it.
Rows landing at high expAB are disproportionately rows where bbr was UNDERestimated, so λ is
too high exactly where expAB is high: a positive residual slope manufactured by measurement
error with the 0.9 coefficient perfectly correct. Discriminating prediction: the slope shrinks
as the bbr denominator grows; a wrong coefficient is denominator-invariant.

Measured (`tools/m10_eiv.py`, 128 hits O0.5 rows with spot+expAB+ab30; 15 players at the 0.09
default excluded from walk-dimension inference — zero bbr variance):

| ab30 quartile | n | **SD(bbr)** | walk-dim slope (per 0.1 wf) | pa-dim (pp/AB) |
|---|---|---|---|---|
| 26–53 | 28 | **0.0908** | **+4.91 (SE 1.98)** | −7.11 (SE 6.11) |
| 57–74 | 28 | 0.0733 | +4.87 (SE 2.42) | +11.15 (SE 5.87) |
| 75–85 | 28 | 0.0622 | +2.44 (SE 2.11) | +18.72 (SE 8.23) |
| 85–104 | 29 | **0.0545** | **+2.84 (SE 2.33)** | +2.70 (SE 5.22) |

1. **SD(bbr) declines monotonically with the denominator** — the variance signature of noise
   leaving. 2. **The walk-dimension slope roughly halves** thin→thick (~+4.9 → ~+2.6), though
   that decline alone is ~1σ. 3. **The magnitudes close**: the full-noise EIV slope is
   `e^{−λ}·λ/expAB` = **+9.4 pp/AB** at the board's λ=0.930/expAB=3.9, so the measured pooled
   +7.39 implies a ~79% noise share — consistent with the SD-derived shares (63–87% at a
   plausible true walk-rate spread ≈0.033). The pa-dimension bounces −7 to +19 with SEs 5–8:
   no stable slot effect anywhere.

**Verdict: EIV favoured on three convergent readings, not proven** — the quartile slope decline
is not individually significant, but the invariance alternative must call the SD decline a
coincidence.

> ### ⚠️ THE STRONGER FINDING IS THE ONE THE TEST COULD NOT RUN (2026-07-27)
>
> The discriminating design asked for a flat slope at 200+ AB. **That stratum cannot exist:
> the blend has no window longer than 30 days**, ab30 caps at ~104, and the estimator's
> effective n never exceeds ~60. This is not a limitation of the test — it is a property of
> the estimator: **`bbr` can never be measured well, by construction. Every player sits
> permanently in the noisy regime.** The EIV case does not need the flat limb, because the
> flat limb cannot exist — a perfectly correct 0.9 coefficient still produces the gradient,
> every day, for every player, as long as this estimator feeds expAB.
>
> **The spec that follows from that, beside it so they are read together:**
> `shShrink(bbr, n, k≈75, lgBB)` before expAB (k = binomial noise / true spread =
> 0.09·0.91/0.033²). A September reader should read "untestable" as **"the defect is
> permanent and structural"**, not as "unproven".

**The fix, if EIV holds: shrink `bbr` toward league before it enters expAB** —
`shShrink(bbr, n, k≈75, lgBB)` (k = binomial noise / true spread = 0.09·0.91/0.033²), the same
call shape the hit rate already goes through. An INPUT shrink, not a formula change; 0.9
untouched. Blast radius: expAB's four consumers (hits λ, TB lamH, HR λ, the HRR re-base
clamp) — every closed-form batter row, through one input line.

## M11 IS A BUG — the comment forbids what the code does (2026-07-27)

`shShrink`'s own comment (L1189): *"empirical-Bayes shrinkage (doc 3A): pull a small-sample
rate toward the league mean. **No hot-streak chasing.**"* The measurement says the model
diverges from the market on recency at t≈9 while carrying nothing on skill. The comment and
the behaviour cannot both be right, and reading the chain settles which:

| stage | what it does | k |
|---|---|---|
| 1 — `shBlendN(st, h, "ab", 10)` | its own comment: *"recency-weighted rate across 7/15/30-day windows"*, weights **.25/.35/.40**, min 10 AB per window, **no season window at all** | none |
| 2 — the same call's `n` | reports the **largest window's raw denominator** (last-30 AB) | — |
| 3 — `shShrink(bn.r, bn.n, 60, shPriorH)` | ONE shrink, applied to the **blended** rate, toward the player's **xBA skill prior** (v2 — the "league mean" of the comment is itself stale) | **60** (hits; HR uses 150) |
| 4 — `bvpRate` | BvP adjustment after the shrink | — |

Three compounding effects, all arithmetic:

1. **The windows are nested, so recency is double-loaded**: at the board's typical
   17/37/75 AB windows, a last-7-days AB carries **~5.5×** the per-AB weight of a
   day-16-to-30 AB (0.0295 vs 0.0053) — and 100% of the estimator is the last 30 days.
2. **`n` is overstated ~1.5×**: the blend's effective sample
   (Σw)²/Σw² ≈ **49** where `shBlendN` reports 75 — so the shrink under-shrinks even on its
   own terms.
3. **The shrink is pointed at the wrong problem.** Recency contamination lives in the
   estimator's *expectation*, not its variance — shrinking a recency-loaded estimate toward
   xBA yields a convex mix of "hot streak" and "skill", never "season rate". k=60 leaves
   ~56% of stage 1 in the price (would be ~45% at the honest n). That is exactly the
   measured shape: model≈market on xwOBA (both anchor on skill), +0.79 pp/10pts divergence
   on last-30 form.

**Verdict: the comment states the design intent and the implementation misses it — M11 is a
BUG by the intent-vs-behaviour standard, not a calibration.** Fourth instance of the class,
after `base = prob`, `shPitIsoF` and `shParkF`. The fix SHAPE is a season term and an honest
`n` — **the weights are NOT specced; see the recency-weight measurement below.** Choosing
them from intent is what produced the current blend, and "raise k just erases legitimate
form signal" is itself an assumption that measurement tests.

## M11 IS WHOLE-ENGINE — the sim's rate is the SAME estimator, verbatim (2026-07-27)

The provenance question was asked and the answer is the strong form. `batVec` (L2065-2067),
which builds the sim's per-PA outcome vectors `[BB, 1B, 2B, 3B, HR]`:

```
var hb=shBlendN(st,function(s){return Number(s.h);},"ab",10);if(hb)hitR=shShrink(hb.r,hb.n,60,shPriorH(st,Lh));
var hrb=shBlendN(st,function(s){return Number(s.hr);},"ab",25);if(hrb)hrR=shShrink(hrb.r,hrb.n,150,shPriorHR(st,Lhr));
bbAB=shBlend(st,function(s){return Number(s.bb);},"ab",10);
```

Compare the closed form (L2349, L2357): **identical calls — same `shBlendN`, same .25/.35/.40
nested 7/15/30 windows, same overstated `n`, same k=60/150, same xBA/xISO priors.** Not
analogous estimators — the same lines of arithmetic. The v2 log5 branch *starts from* the
contaminated `hitR` (`hitR=shLog5(hitR,pBAx,lgXBA)`), so it reweights but never cleans it.

Three consequences, in rank order:

1. **M11 is not a closed-form defect — it contaminates every batter rate in BOTH pricing
   paths, every batter market, every game.** The sim inherits it silently. Per the
   pre-commitment made when the question was posed: **M11 outranks everything in the bundle,
   including M8** — M8 remains the largest single-population magnitude (24.4 pp on 127 TB
   rows); M11 has the largest *reach* (every batter price the engine emits, through either
   path).
2. **The sim's walk channel carries M10's noise too**: `pBB = clamp(bbAB/(1+bbAB)+0.010, …)`
   consumes the same 10-AB-minimum `bbr` estimator that expAB does. ⚠️ **This narrows what
   "sim-priced HRR is flat on expAB (+0.73)" proved**: H+R+RBI is nearly walk-neutral by
   accounting (a walk costs an AB but feeds runs/RBI), so bbr noise largely self-cancels in
   HRR — the one market where the two-path discriminator was run. The sim is clean on SLOT
   volume (measured, −0.110 vs −0.11); it is NOT established clean on walk-rate noise for a
   walk-sensitive market like hits.
3. **"The sim agrees with the market" claims must now be scoped**: agreement was measured on
   volume (slot curve) and on HRR (walk-neutral). On per-PA rate the sim runs the indicted
   estimator plus its own additions on top.

## THE SIM'S +5.0 HITS ERROR DECOMPOSED — volume is the minor term (2026-07-27)

The proposed arithmetic verifies exactly: p=0.24/AB, 4.25 → 4.38 AB moves P(≥1) 0.6885 →
0.6994 = **+1.1 pp**. On the board's own parameters (λ median 0.930, sim PA overshoot +3.1
to +3.3%): **volume = e^{−λ}·λ·(ΔAB/AB) = +1.14 to +1.21 pp.**

| basis | total sim−market | volume | rate (+ PA-rate covariance) |
|---|---|---|---|
| as measured (fixture market) | **+5.0** | +1.2 (24%) | **+3.8 (76%)** → λ hot ≈ +10% |
| production-equivalent (sim−cf **+9.2** is market-free and stats-shared; + cf−market **+0.3** production) | **≈ +9.5** | +1.2 (13%) | **≈ +8.3 (87%)** → λ hot ≈ +23% |

The two bases exist because the fixture's market carries the −4.3 cf artifact; the sim−cf
bridge routes around it. **On either basis, rate dominates and volume is a quarter at most.**
The "rate" bucket includes the PA-rate covariance (the endogenous-PA mechanism proper — a
hot offence buys extra PAs *and* the extra PAs arrive in hot states), which a mean-shift
volume estimate cannot capture. And item 1 above bounds where the rate heat lives: the base
estimator is SHARED with the closed form, so it cancels in sim−cf — **the sim's excess rate
error is in the sim-path additions** (log5 with park+wind retained, TTO boosts, the
covariance), not in a different estimator.

**Ranking consequence, stated as asked**: a uniform +3% PA level would have been one
trivially correctable constant and no reason to rank sim-volume routing below the bbr
shrink. That is the MINOR term. The dominant term is rate — a real reason. The ranking
stands, now for the right reason. M4 (sim routing for TB/HR) inherits this caution: its
favourable numbers are fixture-market measurements of prices that ride the same rate path;
its archive-series gate now has one more thing to check.

## THE RECENCY-WEIGHT MEASUREMENT — scoped like the interlock reference (2026-07-27)

**Do not spec the M11 fix until this reports.** The regression: realized per-AB hit outcome
on (last-30 rate, season rate, xBA as-of-date), per player-date. It returns the true
predictive weight of each term — the number the .25/.35/.40 blend hard-codes from intent.

| | |
|---|---|
| **inputs** | statsapi game logs (public, full season — any window reconstructable for any date); xBA as-of-date from `priors.json` **git history** (nightly `model.yml` commits since ~2026-07-11) |
| **leak-free population** | player-dates 2026-07-11 → now: ~16 days × ~250 lineup hitters ≈ **4,000 obs**, growing ~250/day |
| **power now** | weight SEs ≈ **±0.11–0.13** → distinguishes recency-weight 0 from the blend's ~0.5 at ~4σ today; 0 vs 0.3 at ~2.3σ |
| **power ~08-10** | SE ≈ ±0.09 → 0 vs 0.3 at ~3σ |
| **full-season variant** | ~20–25k obs, SE ≈ ±0.04 — decisive on every contrast, but uses current xBA for pre-07-11 dates (look-ahead; state it if used) |
| **date** | runnable this week. The M11 fix spec is GATED on it, exactly as M7+M9's re-derivation is gated on the truth-dispersion measurement |

If recency carries ~zero true weight — as the market's behaviour implies at t=9 divergence —
the fix is *removing* the recency loading, not rebalancing it, and no form signal is erased
because there was none to erase. If it carries real weight, the regression returns the
coefficient to use. Either way the weights come out of a measurement, not out of intent.

**REPORTED THE SAME DAY — see "THE RECENCY REGRESSION HAS REPORTED" below. Branch 4 fired.**

## THE SIM'S RATE STACK, TERM BY TERM — and M12 (2026-07-27)

Ablation runs on the armed fixture (rule-23 pattern, switch variant: same-line-count runtime
switches `SH_ABL.tto` / `SH_ABL.log5`, reverted after four runs; ablations change downstream
draw *alignment*, not the per-PA primary draw — irrelevant at 10k sims, MC noise ~0.07 pp on
these medians). 55 hits O0.5 legs joined across all four runs + closed form + market:

| term | median pp | mean pp |
|---|---|---|
| sim (baseline A) − market | +5.00 | +4.46 |
| sim (A) − closed form | **+8.81** | +7.97 |
| TTO boosts (A−B) | +0.65 | +0.36 |
| **log5 branch with park+wind retained (A−C)** | **+2.70** | +2.15 |
| interaction (A−B−C+D) | −0.65 | −0.43 |
| stripped sim (D) − closed form | +4.79 | +5.03 |
| — of which pure dynamics (D − static-price of D's own vectors) | **−0.82** | — |
| — of which static factor-set gap (static(D) − cf, at sim volume) | **+5.48** | — |

The stack reconciles: additions (+4.0) + factor-set-at-volume (+5.5) + dynamics (−0.8) ≈
sim−cf (+8.8). Three verdicts:

1. ⚠️ **THE ENDOGENOUS-PA HYPOTHESIS IS REFUTED (2026-07-27).** The dynamics term — the PA-rate
   covariance plus hook/bullpen switching, everything emergent — reads **−0.82 pp**. The
   bundle's open-item row carried it as the leading candidate for the sim's overshoot; it is
   now measured, and it *costs* the sim rather than explaining it.
2. **The heat is static, not dynamic**: the log5 branch (+2.70 — "no double counting" holds
   for what it removes, yet the branch still nets hot vs the proxy channel it replaces) and
   the factor-set gap (+4.3 after removing the +1.2 volume share: platoon, park-vs-Coors,
   the missing `luckF`, clamp differences between `batVec` and the closed-form chain).
3. **This is M12** — the sim path's OWN rate heat, ~+8 pp on top of the shared M11 base,
   which cancels in sim−cf and is therefore none of this. **M11 at rank 1 does NOT assume
   the sim additions are neutral anymore — they are measured non-neutral, and fixing the
   base fixes both paths' shared term only.** M12 lives where HRR is priced: the sim-priced
   HRR residual reads **+10.0** on the real board, which is M12-sized. The open HRR residual
   now has a measured candidate. M4's gate must separate M12 heat from market vintage.

## EVERY CONSUMER OF THE WALK CHANNEL — mapped and bounded (2026-07-27)

The contaminated batter walk estimator `shBlend(st, bb, "ab", 10)` has exactly **two call
sites**: L2308 (`bbr` → expAB, the closed form — M10) and L2067 (`bbAB` → `pBB`, the sim).
`pBB`'s full downstream:

| consumer | path | magnitude |
|---|---|---|
| batter AB counts, all sim prices | `v[0]` per-PA draw | first-order per player — M10's twin |
| **manager hook + TTO thresholds** | walks count in `spPA` (L1967) → `spPA≥29` hook, `≥9/18` TTO | team-averaged noise σ ≈ 0.045/√9 ≈ 0.015 → ~±2% PA accrual — second-order |
| team PA totals | walks extend innings | inside the dynamics term measured above (−0.8 net) |
| **SGP joint pricing — LIVE in ticket construction** | sim bitsets → `jointAll`/Π marginals dependence ratio | common rate noise moves numerator and denominator together — cancels to first order; second-order residual |
| simMarkets panel | display-only | — |

**`pitcher_outs`: the contamination does NOT reach it today.** The sim's outs are discarded
(`outsBySP*` never surfaced), `leashOf` consumes innings-per-game only, `shLaborF` consumes
real pitch counts, and the pitcher stack's own walks enter through `shFip` — **season raw
counts, a different estimator with no recency blend**. The fifth-defect direction exists
only under M2′ (outs → sim), where it arrives through two doors (the `spPA` hook and inning
length) at the team-averaged magnitude above — **≈ ±0.2 outs at the hook margin, an order
below the 0.140 constant's −1.8 outs**. Recorded so M2′'s validation pass looks for it;
nothing to fix today.

## THE RECENCY REGRESSION HAS REPORTED — BRANCH 4 FIRES (2026-07-27)

`tools/recency_weights.py`: realized per-AB hit rate on date D regressed (AB-weighted WLS) on
the three as-of-D observables. **n = 3,061 player-dates**, 2026-07-11 → 07-26, 481 batters
(≥40 season AB; 144 dropped thin-ab30, 27 thin-season), xBA from 20 nightly `priors.json`
commits. Leak-free by construction: every window ends at D−1, and game logs are grouped by
date first so a doubleheader's games leave every window together — the same-day case is
excluded from **all** predictors, explicitly.

| predictor | full fit | drop-season | drop-xBA |
|---|---|---|---|
| last-30 rate | +0.126 (SE 0.096) | **+0.045 (SE 0.084)** | +0.125 (SE 0.096) |
| season rate | −0.360 (SE 0.207) | — | +0.082 (SE 0.159) |
| xBA prior | **+0.728 (SE 0.218)** | **+0.486 (SE 0.168)** | — |

corr(season, xBA) = 0.73 — season's negative raw coefficient is collinearity, not a signal.

**The pre-committed branch that fires is BRANCH 4: the xBA prior carries most of the weight
and the whole window blend is the wrong structure** — with branch 1's corollary attached:
windowed form carries **+0.05 ± 0.08 with xBA present** (zero), so removing the recency
loading erases nothing legitimate. The blend was measuring noise and calling it form.
Even season adds nothing once xBA is in the model. The engine's effective weight on windowed
form is ~0.56 — **4–11× the measured weight's upper bound**.

**The fix, specced against the measured weights and nothing else:** the rate estimator is
**xBA-primary**; the windowed-form term gets weight ≤ ~0.1 (point 0.05, 95% CI −0.12…+0.21)
as a single un-nested last-30 term. The .25/.35/.40 nested blend and k=60 both go — as does
the earlier "season term + honest n" fix shape, **which branch 4 shows was itself wrong**:
season is redundant against xBA. In `shShrink` terms the equivalent is k ≥ ~675 at n ≈ 75.

Caveats, pre-registered: 16 July days; SE 0.08 cannot exclude a small (<0.2) real form
weight; the intercept absorbs the July pool drift (realized 0.237 vs trailing 0.248).
**Re-run ~2026-08-10** (SE ≈ 0.07, cache makes it one command) and again at exit. Unshipped
under the freeze either way.

## PER MARKET: THE ANSWER IS ONE STRUCTURE — form is zero in all three (2026-07-27)

The plausible counter was home runs: power is a stabler skill, xISO stabilises faster, so HR
might carry a real recency term. Same leak-free design, same 3,061 player-dates (identical
filters), matching Statcast prior per market — xSLG *is* expected TB/AB; xISO derived
xslg−xba exactly as `shPriorHR` does, rescaled to HR/AB by the sample league ratio:

| market | windowed last-30 | season | expected-metric prior |
|---|---|---|---|
| hits | +0.126 (SE 0.096); **+0.045 (SE 0.084)** with xBA present | −0.360 (0.207), collinear | **xBA +0.728 (0.218)** |
| TB | **−0.002 (SE 0.089)** | −0.106 (0.209) | **xSLG +0.542 (0.196)** |
| HR | **−0.008 (SE 0.084)** | +0.240 (0.201) | **xISO′ +0.436 (0.257)** |

**The windowed form term is zero in every market, including HR** — the recency-for-power
hypothesis is refuted at the same SE that killed it for hits. The skill block (prior +
season) carries everything, with the expected metric the stronger half each time. **So the
M11 fix is ONE structure, not per-market**: expected-metric-primary, a single un-nested
last-30 term at weight ≤ ~0.1, per-market only in *which* prior anchors it. The ~08-10
re-run covers all three markets in one command (`--market hits|tb|hr`).

## M11'S REAL BLAST RADIUS — every `shBlendN`/`shBlend` call site (2026-07-27)

The window structure is generic, so the fix is to the estimator's consumers, not one call
site. The complete inventory (grep-complete, both functions):

| site | quantity | shrink → prior | expected-metric prior available? |
|---|---|---|---|
| L2348 closed hits | hits/AB | k=60 → xBA | ✓ xba |
| L2350 closed TB | **hits/AB — TB inherits the hits estimator wholesale**; only s1/s2 (last-30 XBH shares, unshrunk) are TB-specific | k=60 → xBA | ✓ xba; xslg available for the s1/s2 mix, unused |
| L2356 closed HR | HR/AB | k=150 → xISO (derived) | ✓ |
| L2358 closed HRR | (H+R+RBI)/**game**, min 3 g | **k=10 → league mean** — the weakest shrink in the engine, to the crudest prior | ✗ **no expected metric for R/RBI exists — needs its own answer** |
| L2065 sim hits | hits/AB | k=60 → xBA | ✓ |
| L2066 sim HR | HR/AB | k=150 → xISO | ✓ |
| L2067 sim `pBB` | BB/AB | **none** | ✗ stored priors carry no expected walk metric; the percentile store has season `bb_percent` (stable, not "expected") — M10's k≈75 league shrink is the interim |
| L2308 closed `bbr` → expAB | BB/AB | **none** | same as above |
| L2158 `offense()` | **lineup-average TB/AB** | none | ✓ xslg — ⚠️ consumers are the RL/total context (L2172) **and the outs model's opp-offense factor (L2257)**: lineup-averaging diversifies the noise but NOT the recency loading, so **the window structure reaches `pitcher_outs` after all** — through a different door than the walk channel cleared earlier |
| L2279 K's opp-lineup K rate | lineup-average K/AB | none (clamp .8–1.2) | ✓ k_percent / whiff_percent (note `shOppWhiffF` already consumes the Savant percentile separately — a fix here must not double-count) |

Ten sites, six quantities, all four batter markets plus K's and outs. Two call sites cannot
take the expected-metric-primary structure (HRR per-game, the walk channel) and are marked
above with their own answers. **Not in this table and not audited: the pitcher's own rates —
`shPitchBlend` (60/40 last-30/season, no shrink) and `leashOf`'s ipg (k=4). That is the
pitcher-side analogue of M11 and it is an open audit, now blocking M2's vintage (below).**

## WHAT THE THREE-MARKET RESULT LICENSES — AND WHAT IT DOES NOT (2026-07-27)

Three markets, zero recency, three priors carrying it, identical design, identical n: a
structural finding about the estimator, not a per-market calibration. Stated as license so a
clean result cannot over-generalise — this project has over-generalised twice from
single-population readings (the fixture's −4.3 into M7, `categories` into four wrong
findings):

- **LICENSED**: replacing the window blend **wherever an expected-metric prior anchors it** —
  hits, TB, HR, both pricing paths, ten call sites.
- **NOT licensed**: assuming zero recency **where no prior exists**. Closed HRR keeps its
  k=10-toward-league answer and the walk channel keeps its k≈75 league shrink — nothing has
  measured them, and "the other markets measured zero" is not a measurement of these.
- **NOT licensed, and now measured the other way**: exporting the batter structure to the
  pitcher side. The pitcher regressions below return a DIFFERENT answer — season-primary,
  with the expected-metric prior adding nothing for K's. Each estimator gets its own
  measured weights.

## THE PITCHER SIDE MEASURED — the cliff is wrong everywhere, and the answer DIFFERS (2026-07-27)

The structures as read from source are stronger recency loadings than anything on the batter
side: `kps` (K's, L2273) and `ipg` (outs, L2248) are **100/0 cliffs — last-30 exclusively
whenever 3+ recent starts exist, season only as a fallback** — then shrunk at k=4 (a 3–6
start mean keeps 43–60% weight). Same leak-free design, per-start outcomes, priors from the
`pitchers` section of the same 20 as-of commits:

| outcome | n | last-30 | season | expected-metric prior |
|---|---|---|---|---|
| hits allowed /BF | 265 | **−0.032 (SE 0.148)** | +0.196 (0.390) | xBA-against +0.264 (0.363) |
| K's /BF | 264 | +0.150 (SE 0.144) | **+0.814 (SE 0.291)** | whiff′ **−0.199 (0.283) — nothing** |
| outs /start | 266 | +0.083 (SE 0.151) | **+0.609 (SE 0.193)** | none exists (workload is managerial) |

**Form is zero in all three — six regressions now (three batter, three pitcher), form zero
in six.** But what replaces the cliff differs by side: for K's and outs the carrier is
**season actual**, and the whiff prior is a forced fit that measured to nothing — the
two-sites-can't-take-the-structure case, caught by measurement instead of assumption. The
n≈265 SEs are 2–3× the batter runs' — the season-primary readings are 2.8–3.2σ, the
form-zeros are consistent but individually looser; the ~08-10 re-run tightens all six.

**`leashOf`'s k=4, measured (172 pitchers with ≥8 starts):** within-pitcher single-start
outs SD **3.25**; between-pitcher season spread **1.76**. A 3–6 start ipg mean is therefore
**36–53% noise**, and k=4 keeps 43–60% of it — the pitcher analogue of M10's
estimator-noise problem, sitting directly under the outs leash ceiling. The regression says
the shrink target should be season ipg (+0.61) rather than league, and the cliff should not
exist.

## THE THIRD DOOR IS CLOSED TODAY — AND SWINGS OPEN WITH M2 (2026-07-27)

`of = shClamp(0.140/oo, 0.86, 1.12)` — and `oo` (lineup TB/AB) never drops below ~0.30, so
`0.140/oo` can never exceed ~0.47. **Measured on the fixture: `of` = 0.860 on every lineup.
The opp-offense factor is a constant today, and `offense()`'s noise has exactly 0.00 pp of
effect on any outs price — the door is welded shut by the very 0.140 defect M2 exists to
fix.** A defect masking a defect: the M7/M9 shape, now in the outs stack.

Post-M2 (`0.400/oo`): measured on the six fixture lineups (mean 0.4223, SD 0.0489, range
0.370–0.524), `of` spans **0.860–1.082** — fully live. The noise arithmetic: per-player
TB/AB blend noise ≈ √(0.55/60) ≈ 0.096 → lineup-averaged idiosyncratic component ≈ 0.032 →
**≈43% of the observed lineup spread is estimator noise**, and it maps to ±7.6% of λ ≈ ±1.2
outs at λ = 16.2 → **≈ ±11 pp of pure noise on P(over) once M2 ships.**

**Verdict: far over the 0.5 pp threshold — this JOINS M2's audit rather than sitting beside
it.** M2's spec must de-noise the `oo` input **in the same change** (the anchor exists:
lineup-average xSLG from the priors, or shrink each player's blend before averaging) — the
same land-together rule as M1's Coors double-count. Shipping `0.140→0.400` alone converts a
dead factor into an ±11 pp noise injector on the market with four known defects.

**ENCODED 2026-07-27**: M2 is now an INTERLOCKED PAIR in the bundle (the M7+M9 treatment),
enforced by `tests/m2-interlock.test.ts` — the 0.140 era is pinned; the moment the constant
changes, the test demands de-noise evidence inside `offense()` itself. De-noised residual at
the measured windowed weight (≤ ~0.1): **±1.2 pp**, under the 2 pp readiness bar.

## OUTS WITHOUT A PRIOR — what measured shrinkage buys the worst market (2026-07-27)

No expected metric exists for outs (workload is managerial), so the M1 structure cannot
apply — outs is the one market that must live on its own history. What the measured
variances license, exactly:

| estimator | model spread vs true (1.76) | noise share |
|---|---|---|
| **current**: last-30 cliff (3–6 starts), k=4 → league | **63–75%** — compressed AND noisy at once | **36–53%** |
| **proposed**: season ipg (n≈18–22 starts), k=3.4 → league | **92–93%** | **13–16%** |

The surprise in the arithmetic: **the optimal per-start k is 3.4 — k=4 was numerically right
all along.** The defects are the **cliff** (season discarded whenever 3 recent starts exist
— and the regression reads season at +0.609, last-30 at +0.083 ± 0.151) and the **league
target** where the carrier is the pitcher's own season. Honest bound: the last-30 CI
(−0.21…+0.38) cannot exclude a modest form term; the ~08-10 re-run tightens it.

**Verdict: outs is fixable inside the bundle — measured shrinkage (cliff removed,
season-anchored, k≈3.4) plus the M2 pair. It does not need the sim it structurally cannot
reach**; M2′ stays the strictly-better alternative, not a necessity, and outs is NOT a
post-freeze project. The compression the leash ceiling masks closes from −25…37% to −7…8%
by estimator repair alone.

## THE SIM'S VOLUME MODEL vs pa(spot) — the slot mapping is VINDICATED (2026-07-27)

The sim was instrumented directly (temporary same-line-count counters in `halfInning`,
reverted after one run; counters consume **no** rng() draws, so the primary stream was never
touched): 22,000 fresh sims / 44,000 team-games on the armed fixture slate. Both compared
objects — the sim's slot mechanics and the pa formula — are slate-independent structure.

| slot | sim PA/g | sim BB/g | sim AB/g | pa(spot) | closed-form expAB (same slate) |
|---|---|---|---|---|---|
| #1 | 4.817 | 0.480 | 4.337 | 4.68 | 4.17 |
| #5 | 4.385 | 0.447 | 3.938 | 4.24 | 3.79 |
| #9 | 3.936 | 0.350 | 3.587 | 3.80 | 3.47 |

- **The sim's slot slope is −0.110 PA/slot — the formula's −0.11 exactly.** Full 9-slot table
  in the tool run; every slot's Δ vs formula sits in +0.136…+0.148.
- **The divergence is a uniform level, concentrated at NO slot**: sim runs 39.43 PA/g
  (+0.14/slot ≈ +3% — the known endogenous-PA overshoot, the open sim-hits item), and sim
  AB/g sits ~+0.12 above closed-form expAB at every slot with the same shape.

So the slot mapping needs no fix, and the only per-player volume input left is the walk
discount — converging with the EIV finding above from an independent direction.

**Could the closed form consume the sim's volume where a sim exists?** Mechanically yes, and
parity-safely: per-batter PA/AB tallies are one array increment each inside `halfInning`
(additive, zero rng() draws — the second-stream rule is not even engaged), exported like
`legP`, consumed behind the same `simP && !liveInit` filter the HRR marginal uses. Reach:
**13 of 15 games, 1,916 of 2,206 batter rows (87%)** on 2026-07-26. **Ranked BELOW the bbr
shrink, and the provenance finding hardened the reason (2026-07-27)**: the +3% PA level is
one trivially correctable constant, but the sim's per-player AB derives from `pBB`, which
consumes **the same noisy `bbr` estimator expAB does** — sim-volume routing re-imports the
noise it was meant to escape. The bbr shrink fixes BOTH consumers (expAB and the sim's walk
channel) at the one input line. Order — bbr shrink first, unconditionally; sim-volume
routing is only worth revisiting after it, and after the sim's PA level is normalized.

## THE M7/M9 REFERENCE MEASUREMENT IS REACHABLE — scoped, not run (2026-07-27)

Re-derivation needs the truth distribution as an output: empirical `P(hits ≥ 2 | market-λ
band)` against the Poisson and binomial families, where market λ comes from the de-vigged
close and outcomes from boxscores. **Every input is public and already accruing**:
`line-history data/props` carries the close fair for hits rungs (~267 hits rows/day, 13+ days
archived ≈ 3,500 rows), and statsapi boxscores are permanent. No model, no secrets, no
prediction store. Power: ~800–1,000 rows per λ band resolves the ~5 pp Poisson-vs-binomial
tail gap at SE ≈ 1.5 pp; three bands ≈ 3,000 rows — **met on the archive already; the banded
version is runnable this week (~2026-08-01), not at exit.** The interlock therefore does NOT
stay unshipped for want of a reference — it stays unshipped only until this measurement and
the graded expAB terciles say what the compensator actually is.

## THE OUTS FLAG vs THE HOMOGENEOUS-20 BAR — THE ONE PAGE (2026-07-30, owner's item 2; arithmetic and options, NO decision taken)

**The classification (cited, not assumed): suspensions ARE frozen-table items.**
`hrrAltMax` sits IN the frozen table as a dated-reversal row (this doc's frozen
table: "`hrrAltMax` | ~~0.5~~ −1 (2026-07-27, signed off)"), the freeze scope names
"market suspensions" explicitly ("During the freeze, no model weights, gate
thresholds, market suspensions, structure..."), and `docs/pitcher-outs-audit.md`
(Vintage consequence) says it in one sentence: "a frozen-table item landing
mid-window — a dated reversal row in the frozen table (the `hrrAltMax` precedent),
a VINTAGE EVENT in the census (engine/config class), and a board-vintage boundary
at the flag date: **post-flag boards never pool with pre-flag boards for
outs-market readings**."

**But the branch-1 consequence does NOT follow — the flag does not reset the bar,
and the reason is the bar's own written unit, not an assumption.** The test's unit,
both lines printed verbatim (the third time the unit has mattered):
- The test spec itself (`docs/harness-substitutions.md` L987): "Pool all clamp
  calls across the 20 archived boards, per site." — the spec line carries NO
  vintage qualifier; the homogeneity requirement is imposed by this doc's vintage
  convention ("the vintage convention below says vintages never pool").
- The convention's unit line (this doc, the 07-29 bar decision): "the instruments
  are `clamp-activity`, `shrink-activity` and the range detector, all ROW-level
  over the whole board's rows ... and rows do not see the ticket-gate reopens —
  the only row-level vintage boundary is M8 (07-27 night), so the row-homogeneous
  series runs 07-29 → 20 boards on **2026-08-17**."
So the bar needs the 20 boards to share a row-level ENGINE (code) vintage — NOT a
data vintage (the orthogonality block above: "day-to-day prior drift is part of
the measurand"; "vintage EVENTS are code, config, gate-crossings, cadence — the
data axis is deliberately not in that class"). The outs FLAG is SELECTION-level by
construction: "outs legs stop entering TICKETS in the disciplined modes. Accrual
does NOT stop: rows stay priced + tagged" (pitcher-outs-audit). Rows price
identically through the flag → the row-level instruments see no boundary. The
boundary the flag stamps is scoped by its own doc to OUTS-MARKET READINGS, and its
first post-flag board (07-31) coincides with the K's/outs reopen boundary already
counted in the decided dates. **08-17 (hits-family, row-level, from 07-29) and
08-20 (whole-board/allocation-level, from 08-01) both STAND.** Thursday's board is
board 1 of the homogeneous window on every axis, and stays board 1 after the flag
for every reading except outs-market ones (which have no post-pause pre-flag board
to pool with anyway — the outs series simply starts at 07-31).

**Vintage events since window start (the pause, signed 07-29; pushed 07-30 in
`53d0076`), each dated**:
| when (2026) | event | class | splits which series |
|---|---|---|---|
| 07-30 ~03–04Z | pushes `0914eeb` (cfSel) · `9753fb9` (echo) · `4c036ba` (trigger mark) | code, by the convention's letter | none — zero boards between them (window count 0), and each is behaviorally inert on the instruments' unit BY GUARD: cfSel byte-identity-proven on board+card, echo/mark additive fields |
| 07-30 ~06–08:30Z (conditional) | the queued straggler context commit | DATA axis — not a vintage event under the convention | none; shifts the window-START stamp if it lands (pause block) |
| 07-30 evening (decided) | outs flag | engine/config — frozen-table item | outs-market readings only (its own doc's scope); row-level series unaffected |
| 07-31 | K's/outs reopen | gate-crossing | whole-board/allocation series (already counted in the decided dates) |
| 08-01 | ML/RL reopen | gate-crossing | whole-board/allocation series (already counted; the last scheduled boundary) |

**Longest run of consecutive boards under a single vintage achieved so far: 1.**
The board archive holds exactly ONE board-day (`origin/line-history`
`data/boards/index.json`: the single entry 2026-07-26, best ≡ latest). One board
is a run of 1 under every definition; the post-pause homogeneous count is 0 (07-29
produced no board). The impossible branch (run > 1) does not fire.

**Pending vintage events under the spec-only queue (each stamps a boundary IF
authorized): 7** — `coreEvMin`, the 1/n cap, A1 (monotonicity + penalty removal),
damping 0.5, `SH_W`, the ungraded-group fix (legP/jointAll), the `achievable ≥ T`
route gate. (Not boundaries: alt keys — archive-sweep tooling; the ledger
invariant — guard-only; the per-market ledger read — reporting; the
MIN_GAP/workflow-copy convergence — capture-cadence on the props axis, not the
board axis.) Plus tonight's outs flag (decided) and the two scheduled
gate-crossings above.

**Maximum reachable homogeneous run this cycle — QUOTA BINDS BEFORE SHIPPING
DOES.** At the READ quota (1,461): ~9.74 board-days at ~150/board (evening 6-event
boards run ~55–60 PROJECTED, but the background burn — props sweeps + line-history
ticks, ~190–215/day as measured 07-29→30 — drains the same pool). Row-level series
(from 07-29): max = every board bought ≈ 9–10 ≪ 20. Whole-board series (from
08-01): ≈ 7–8 ≪ 20. Each authorized ship can only shorten a segment further, but
even a TOTAL SHIP FREEZE does not reach 20 — the premise inverts: the bar is
unreachable this cycle because of QUOTA first; shipping cadence is a second,
independent ceiling on top of it.

**THE TWO OPTIONS, PRICED (printed for the owner's later decision; the standing
07-29 decision "THE BAR HOLDS AT 20; THE DATE MOVES" is untouched tonight):**
1. **Stop shipping entirely until 20 boards accumulate.** Cost: a reset is
   required regardless — 20 evening boards ≈ ~1,100–1,200 credits alone
   (PROJECTED, inside 1,461) but the background burn ~190–215/day × ~20 days ≈
   3,800–4,300 buries it, and killing the background starves Series A and the
   close/CLV record. Every spec-only boundary above (incl. the M19 ungraded-group
   fix and A1) waits ~3 weeks; earliest 20 stays 08-17/08-20, slipping 1:1 per
   dark day.
2. **The bar cannot be the parameter exit's gate.** Cost: every fixture-derived
   finding (the clamp census, the shrink k-table, the nine own-sample weights)
   keeps its single-instrument caveat PERMANENTLY; the 08-17 review restates to
   the starved-review options already printed above (run-at-N / date-slip /
   vacuous); the parameter exit then rests entirely on the per-market ledger
   series — ALSO unreachable this cycle (the TWO-EXITS sentence). Choosing 2 buys
   no boards; it re-labels the gate.
Neither option is chosen tonight. And the flag-specific finding stands on its own:
even under option 1, tonight's outs flag is not a ship that resets anything
row-level.

## SELECTION-MODE CENSUS — WHERE THE KELLY CEILING LIVES AND DIES (2026-07-30, owner's item 3; every line read from source this turn)

**The four modes** (`shAllocate`, legacy/index.html L2990–2998): `ev_gated`,
`dk_fd` (ev_gated discipline priced at the DK/FD basis), `probability`,
`caesars_ev` (the legacy ¼-Kelly-at-CZ ranking). Plus one orthogonal switch:
`force` (the override), available on any mode.

| mode | Kelly ceiling? | max single-ticket share of bankroll |
|---|---|---|
| `ev_gated` | ✓ — L3108 `disciplined=((mode==="ev_gated"||basisMode)&&!force)`, L3112–15 `min(capG, round(kMult×B×¼Kelly))` | min(ladder, Kelly): ≤ ~8% measured strongest ticket; realized max 2.48% |
| `dk_fd` | ✓ — same `disciplined` term; Kelly computed at the basis price | same structure as ev_gated |
| `probability` | ✗ | the ladder: 10% at n=1 (`capG=max(0.25,1/n)×amount`, L3107) |
| `caesars_ev` | ✗ — the legacy exact-sum (L3105–06) | the ladder: 10% at n=1 |
| any mode + `force` | ✗ — `&&!force` strips the ceiling; `overrode` stamped on the ledger entry (L3405) | the ladder: 10% at n=1 |

**The absolute roof no mode escapes**: the LOCK blocks any card where CORE+FUN
exceeds `dailyBankrollCap` (0.10) × bankroll (L3397–99) — 10% of bankroll is the
hard ceiling in every mode; the ceiling-free modes reach it at n=1, the
disciplined path stops at ~8% (measured) / 2.48% (realized).

**How a mode is selected**: persisted DEVICE state — localStorage `pl_selmode`,
written by the Settings page (`app/settings/page.tsx` `setSelectionMode`;
`src/lib/engine-client.ts` L46–68), ~2 taps (Settings → mode). Default when unset
or invalid: **`ev_gated`** (engine-client L49–52, comment "user rule 2026-07-22").
The server route NEVER reads it: `CRON_SEL_MODE = "ev_gated"` pinned since
`ca30d15` (2026-07-24 "restore frozen selection mode on the cron generator";
value "ev_gated" at introduction, verified this turn) — the route comment states
the serverless fn has "no localStorage to read pl_selmode from, so the frozen
default is stated here."

**Is the mode captured? YES — on every surface that records stakes or
predictions; no new field is needed:**
- server boards: the echo carries `selMode` (engine-echo.ts L79, shipped
  `9753fb9`) AND the pred records carry `selMode: CRON_SEL_MODE` (route L380);
- device cards: the LEDGER ENTRY carries `selMode` (legacy L3404 — "hardening
  Phase 2: CLV report slices by the mode that picked the card") and `overrode`
  (L3405) — every ceiling-free path that can touch money is stamped where the
  money is recorded;
- client prediction logs: `logBoardPredictions(..., getSelectionMode())`
  (engine-client L379) — src:"client" records carry the device mode.

**Boards/cards on disk built in a non-ev_gated mode: 0.** The archive holds one
board (07-26), built by the pinned route (pin 07-24 precedes it) → ev_gated by
pin-inference (M18's commit-log method; the board predates the echo, so this
attribution is INFERRED — tomorrow's board is the first STAMPED one). No
production card is persisted anywhere on disk (allocation unpersisted — the
standing fact); the 10 measured harness cards were armed `selMode="ev_gated"`
(route-mirrored arming, the cfSel-guard standard). Ledger cards are OFF-disk and
each carries its own `selMode` → the export (reading 15) additionally prints
selMode + overrode per entry. The impossible branch (a ceiling-free card on
disk) does not fire — no card is on disk at all.

**The pre-committed reading resolves on the middle path**: the mode IS
device-reachable (~2 taps) AND already captured everywhere it matters — the
branch-1 ship ("spec the mode into the echo tonight") was ALREADY SHIPPED as
`9753fb9` before the question was asked; the branch-2 pin holds for every server
board. The remaining exposure, stated exactly: a device user switching to
`probability`/`caesars_ev` (or forcing any mode) removes the Kelly ceiling up to
the 10% lock roof — stamped if locked, invisible if never locked — and the
operator rule (no slip above 2% = $50) is the human backstop there, as designed.

## LEDGER PER-MARKET RECOVERABILITY — THE IFF RESOLVES: RECOVERABLE (2026-07-30, owner's item 4; fields read from source this turn)

**Each ledger leg carries its market; each ticket carries its legs; grading is
PER LEG.** The fields, named (legacy/index.html):
- ticket (`shTicketSnap`, L3365–73): `{id, bucket, name, type, tier, stake,
  czOdds, czDec, prob, czEv, fair, bsOdds, bsDec, bsEv, confirmed, legs:[...]}`;
- leg (L3372–73): `{label, prop, cz, game, gkey, lkey, est, bs, bsBook}` —
  **`lkey` embeds the market** (`...|batter_total_bases|...`, `ml_home`, …) and
  `cz` is the leg's own settled-book price → implied prob is arithmetic;
- grading (L3673): `grading = {legs: legRes, tickets, done, v:2}` —
  `grading.legs` is keyed `label|prop` → `{result, detail}` **per leg**
  (`shGradeLeg` L3545; tickets are graded FROM it, L3605–07);
- the entry besides: `selMode`, `overrode`, `bankroll`, `daily`, `fun`, `games`,
  `clv`.

**Therefore the pooling is a REPORTING choice, not a data gap.**
`shLedgerStats(scope)` (L3862) slices ALL/CORE/FUN off `e.core`/`e.funT` and
reads ONLY ticket-level results — it never consults `grading.legs` or `lkey`. A
per-market read (join `legs[].lkey` × `grading.legs[label|prop].result` ×
implied-from-`cz`) is available from the SAME rows whenever the export runs. **No
new capture is needed before Thursday's board; nothing ships.** The 07-29
"reconstructible IFF legs carry result + implied prob" line above (the export
block) RESOLVES: they do — result per leg in `grading.legs`, implied from per-leg
`cz`. The 46.3/59.2 figure's source is consistent with exactly this join
(graded-ledger SELECTED HRR legs 07-17→07-22, `docs/hrr-recalibration.md` L83) —
the impossible branch does not fire.

**The bankroll exit's stated test**: as CODED it runs pooled only
(`shLedgerStats` has no market axis). As DATA it can be run per-market at export
time from the fields above. SPEC'D (no ship, no new capture): the export read
(reading 15) additionally prints, per market: legs, wins, implied-vs-hit gap —
and per entry: `selMode` + `overrode`. The exit's masking finding (one market's
miss hidden by two clean ones) therefore has a zero-cost cure AT READ TIME; the
POOLED test remains what the exit's sentence pre-committed, and any change to the
exit's own criterion stays the owner's call.

## SCOPE BY DIFF — THE OUTS FLAG'S BOUNDARY, MEASURED NOT SELF-DECLARED (2026-07-30, owner's item 1)

**The finding the owner's challenge exposed first: the flag is NOT YET IN THE
ENGINE.** `outsSusp` exists only in the echo's field list, and the echo guard
EXPECTS it null today (`tests/engine-echo.test.ts` L76); the two conditionals ship
Thursday evening ("three same-line edits", pitcher-outs-audit). So tonight's
on/off diff on the armed fixture slate (the coupling guard's substrate — the
archived board stores analyze's OUTPUT rows, not its input slate, so the diff
runs where analyze can run) prints the BASELINE, not the shipped scope:
**flag-on vs flag-off, the full analyze output is byte-identical — rows, tickets,
everything** (`outs-suspension-coupling.test.ts`, scope-by-diff invariant, run
2026-07-30, 5/5). That identity is the guard's documented red state ("the flag as
not yet applied"), NOT the owner's impossible branch — the impossible branch
("tickets identical with the shipped flag on → the flag does nothing → it does
not deploy") is now MECHANICAL: the ship commit must flip BOTH `it.fails` tests
green, and a do-nothing flag cannot.

**The scope, from the hrrAltMax precedent's own source (the mechanism the flag
mirrors)**: suspension touches exactly FIVE emitted row fields — `susp`, `watch`,
and the three badge booleans `bsBadge`/`czBadge`/`edgeBadge` (finalizeCats
L2509–14, L2538–49: each badge `&& !suspRow`) — and ticket/FUN membership.
Every pricing NUMBER (prob, implied, edge, ev, czEv, bsEv, kellyF, czKellyF,
bsKellyF, pModel, wBlend, odds, cz, bs) is computed upstream and untouched.

**Does any row-level instrument read a field the flag touches? NO — named:**
- `clamp-activity` reads `SH_CLAMP_LOG` (per-site `{bounds,n,lo,hi,mid}` from
  `shClamp` calls during pricing — L1540); pricing runs for suspended rows
  (accrual preserved), so the call stream is untouched;
- `shrink-activity` wraps `shShrink` calls (k, n distribution per site) — same;
- the range detector (`tools/range_compression.py`) reads `pModel`, `lkey`,
  `sub`, and propBoard `pO`/`fO`/`ln`/`alt` — no badge, no `susp`, no tickets.

**Does the convention state who scopes a boundary? NO — the gap is real.** The
convention's class line names WHAT is an event ("vintage EVENTS are code, config,
gate-crossings, cadence — the data axis is deliberately not in that class") and
never WHO establishes an event's scope. That gap is why the outs flag's boundary
was arguable from its own doc. **THE ENCODED RULE (owner's order — encoded, not
written)**: a boundary's scope is established by DIFF, not by the shipping
component's doc — encoded in `tests/outs-suspension-coupling.test.ts`
(scope-by-diff): (1) an invariant that must be green BEFORE and AFTER the ship —
flag on/off byte-identical outside the five-field tag set on `pitcher_outs` rows
only, over a verified non-empty outs population (zero-over-empty is not a pass);
(2) a comparator PLANT proving a single pricing-field change is visible through
the stripping; (3) the tag half `it.fails` until the ship commit flips it with
the pool half. If Thursday's ship touches ANY row-level field outside the tag
set, (1) goes red in the ship's own CI → the boundary is wider than claimed →
the flag resets the row-level window too and the vintage consequence restates —
the pre-committed wider-boundary branch, made mechanical. The narrow scope
becomes a MEASURED FACT only when (1) passes against the shipped flag.

## THE FIXTURE-REPRESENTATIVENESS CHECK — STRUCK AT 20 AS UNREACHABLE THIS CYCLE (2026-07-30, THE OWNER'S DECISION — neither priced option; the 08-20-review treatment)

**The act, recorded in the owner's words**: the bar is NOT lowered. The check is
RECORDED UNREACHABLE at 20 boards this cycle under every cadence and every
shipping policy, quota binding before shipping does — dated 2026-07-30, before
any fixture-representativeness output exists. The 07-29 "bar holds at 20; the
date moves" decision stays on the record with its date; this supersedes the
DATE's operational meaning the way the 08-20 crossover was re-scoped: the check
as specced cannot run this cycle, and pretending a calendar date for it spends
attention on an unpowered check.

**The estimand, from the spec (`docs/harness-substitutions.md` L985–994)**: pooled
clamp-call PINNED FRACTIONS per site (25 sites) across the archived boards,
compared per site against the frozen fixture's fraction — disagreement = outside
the fixture's 95% Wilson interval AND >10 pp, or a class change
(healthy/SATURATED/OFFSET); a site pooling <30 calls prints its count, no
statistic. **The decision it feeds (L998–1002)**: ≤2-of-25 → FIXTURE VALIDATED —
the frozen table's clamp and shrink numbers promote from single-instrument to
confirmed; ≥5-of-25 or L2258 class change → UNREPRESENTATIVE — three findings
re-run on the archive (the pitcher_outs clamp count, the H+R+RBI clamp-protection
table, the shShrink k table with its nine own-sample weights); 3–4 → AMBIGUOUS,
per-site report, no global verdict.

**What 20 buys that 9 does not — from the written criteria, not a power model**:
the >10 pp condition is FIXED, so the check's sensitivity is floored near ~10 pp
at EVERY board count; more boards shrink only the archive-side sampling noise
toward that floor. The real purchase of more boards is the COLD SITES: the ≥30
pooled-call minimum (L994) is what extra boards walk sites across. 20-vs-9 is
therefore mostly a question of which sites qualify, not of a finer rate estimate
at the sites that already do.

**The MDE at 7, 9, and 20 boards: NOT COMPUTABLE — from what is written OR from
disk, said plainly**: (i) written — "the row-level fixture-representativeness
test still has no power model (its verdict is a census, not an effect estimate)"
(POWER block, 07-29) and "NOT computable from anything written" (THE 08-15
DECISION, option (b)); (ii) disk — the only archived board (07-26) PREDATES the
clamp instrumentation (additive 2026-07-27) and carries NO `clampActivity`
(verified on the gunzipped archive tonight), so the per-site per-board call rate
K_s — the input an MDE needs — does not exist yet. It STARTS EXISTING tomorrow:
the production route arms `clampLog: true` (route L244), so board 1 is the first
to carry per-site counts, and the per-site MDE becomes arithmetic
(≈ 10 pp + z·√(p(1−p)/(K_s·B)) + the fixture's Wilson half-width) as soon as K_s
is measured. **The impossible branch (MDE at 9 already inside the check's needed
range) CANNOT BE EVALUATED tonight — stated, not silent.**

**The smaller question answerable at 9 boards, named, with its instrument —
THE RE-SCOPE**: **HOT-SITE FIDELITY** — "at every site whose pooled archive
calls reach ≥30 by board N, does the pooled pinned fraction sit inside the
fixture's 95% Wilson interval ∪ ±10 pp?" Instrument: `clamp-activity`'s per-site
log on real boards (now armed in the route) against the fixture's per-site table
— the SAME criteria, the SAME instrument, sites qualified by the spec's OWN ≥30
floor, cold sites printing counts exactly as L994 already mandates. Its MDE is
COMPUTED per site from the accrued K_s (pre-committed: from counts, never
assumed), not stated tonight. **This is a re-scope, not a weakening: the
20-board check is STRUCK AS UNREACHABLE, dated; nothing about the criteria
softened.** The freed difference: the 08-17 calendar expectation is released —
the hot-site read runs whenever accrued boards qualify sites, opportunistically.

**What the check gates — printed**: promotion of the fixture-derived findings
(the clamp census, the shrink k-table, the nine own-sample weights) from
single-instrument to confirmed, and the three-finding re-run on an
UNREPRESENTATIVE verdict. It is NOT a listed condition of the parameter exit —
the exit's own floor is Series A (~13.5k credits, phase2-memo L40–42). The
honest one-sentence consequence: **the parameter exit was already
credit-blocked; with the 20-board check struck, every fixture-derived number in
the frozen table additionally stays single-instrument through this cycle** —
both clauses together, as ordered. What the exit loses concretely: through this
cycle no fixture-derived clamp/shrink figure gains the "confirmed" stamp, and
every finding leaning on them keeps the caveat.

## 07-30 MORNING COLD READ — RECORDED (~16:4xZ, owner's item 1; raw outputs beside verdicts)

**STEP 1 — the landing test: LANDED.** Raw: in the pre-registered 06:30–09:30Z
window, exactly ONE commit touches `data/props/2026-07-30.json`: `ca80f02
2026-07-30T07:42:46Z "prop history: 2026-07-30T07:42Z"` (day-file ground truth:
`t 07:42:43Z, kind pre, events 10`). The Actions run list shows the cluster as
07:42:28 (paid) / 07:43:58, 07:56:17, 07:57:22 (skipped — no commits), ALL
`success` — **no rejected push**. One paid + N−1 skips + no rejected push = the
LANDED outcome as written. A SECOND paid landed at 09:37:48Z (`e414249`, pre,
10 events) — 115 min after the last paid, OUTSIDE the window, no two commits
inside any 40-min span: MIN_GAP-designed spacing ("delivery is never cancelled,
only serialised"), not a duplicate; the 09:46:42 and 10:02:13 runs skipped
behind it. The 07-29 all-paid trio precedent (08:02/08:05/08:07) is broken —
**MIN_GAP and the concurrency fix behave as shipped.**

**STEP 2 — the straggler: DID NOT COMMIT.** `git log origin/main --since
2026-07-30T05:00Z -- public/model/context.json` → empty (no main commits at all
since 05Z). **The homogeneous-window start stamp STANDS at the pause pair**
(priors `00994434be42196b67233ed1663ded2f0651b863434f537cd611da108ca0374e`,
context `2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80`).

**STEP 3 — quota READ 16:4xZ: 1,238 remaining / 18,762 used** (free `/v4/sports`
through the odds proxy, headers passed). Delta from the ~03:5xZ read
(1,461/18,539): **223 spent in ~12.8 h.**

**ITEMIZED, PER SPENDER (04:00→16:45Z, from the line-history log — 4 commits
total)**:
| spender | evidence | ≈credits |
|---|---|---|
| props pre sweep 07:42Z | day-file: 10 events × ~6 | ~60 |
| props pre sweep 09:37Z | day-file: 10 events × ~6 | ~60 |
| line ticks 06:13Z + 13:11Z | `data/2026-07-30.json` | ~6 |
| **known subtotal** | | **~126** |
| **RESIDUAL** | no git trail | **~97 — AMBIGUOUS** |

**The residual is AMBIGUOUS and is not resolved by judgment.** The likely
mechanism has no commit trail by design: the Vercel-side `/api/clv` close
captures (96×/day cron-job.org job) spend at CAPTURE time and only appear in
git when `snapshot_props.py` FOLDS them into the day-file later (the 00:14Z
`close/3 events` entry is exactly such a fold). Today's first pitch is 16:10Z,
so capture windows opened ~14:35Z — inside this read's span. **Disambiguators,
in order**: (1) tonight's fold — captured closes with `t` in 14:35–16:45Z in
the day-file attribute the residual to the CLV path; (2) Vercel function logs
(dashboard-only, §9); (3) the Odds dashboard usage log (owner-only).

**THE BAND, APPLIED HONESTLY**: the projection (≈1,325, band 1,290–1,360) is
anchored at 22:30Z; at 16:45Z the read already sits BELOW the floor — the
projection is breached early. Attribution splits the deviation: **~120 is
DESIGNED spend my projection under-modeled** (it assumed the cluster = ONE
paid; the delayed crons stretched 2.5 h and MIN_GAP correctly permitted a
second paid at ≥40 min — a projection error, not a spend anomaly), and **~97
is the AMBIGUOUS residual above** — so the pre-committed "below 1,290 =
un-designed spend" label can neither be confirmed nor cleared until the
disambiguators run. Said as AMBIGUOUS, per the owner's rule. Re-projection for
22:30Z from the 16:45Z read: ≤ ~1,180 (the 17Z sweep ~36–60 still to come, the
ambiguous spender still active). **Runway restates: 1,238/150 = 8.25
board-days** (was 9.74 at the 03:5xZ read).

## THE THURSDAY SHIP IS A BUILD, NOT A DEPLOY — WHAT IT ACTUALLY REQUIRES (2026-07-30, owner's item 2; stated BEFORE any build authorization)

**The exact diff, every file**:
1. `legacy/index.html` — the three same-line edits, all INSIDE the engine
   string: (a) `finalizeCats` L2512–14: the outs analog of `suspRow`
   (`lpq[1]==="pitcher_outs" && SH_CFG.outsSusp && dscpM` — dscpM covers BOTH
   disciplined modes, the hrrAltMax precedent); (b) the `buildParlaySet` leg
   filter (the L2652-analog site): outs legs never enter the pool under
   `outsSusp` + disciplined; (c) `shFunPick`: never picks outs. Plus the
   boolean itself: `SH_CFG` gains `outsSusp: true` in the engine literal
   (config-in-engine, exactly where `hrrAltMax` lives) — no route change
   needed; the echo picks it up from cfg automatically.
2. `src/engine/legacy-src.gen.ts` — REGENERATED (`tools/extract-engine.mjs`).
   **THE ENGINE STRING MOVES.**
3. `tests/outs-suspension-coupling.test.ts` — BOTH `it.fails` → `it` (pool half
   + tag half), same commit.
4. `src/lib/engine-echo.ts` — `SERVED_ENGINE_SHA_VERIFIED` — see the interlock.
   (`tests/engine-echo.test.ts` L76 does NOT flip: it tests null-serialization
   of an ABSENT cfg key on a literal, not production's value.)

**THE HASH MOVES — the pre-committed branch fires, stated before authorization**:
Thursday's 22:45Z board runs the CURRENT artifact (`f6cf1513…`); the evening
deploy changes the engine string; **Friday's board is a DIFFERENT engine
artifact** — the served-artifact verification RESTATES on Friday (re-extract
the chunk, match the new sha, update `SERVED_ENGINE_SHA_VERIFIED` beside that
fresh re-grep), and Friday's echo must carry the NEW engineSha. **A discovered
interlock, new with this ship (the first engine-string change since the sha
instrument shipped)**: `tests/engine-echo.test.ts` HARD-asserts
`ENGINE_SHA === SERVED_ENGINE_SHA_VERIFIED`, and the constant's own rule says
it updates "ONLY beside a fresh live verification, same commit" — but the live
artifact serves the NEW string only AFTER the ship deploys. The ship commit
therefore CANNOT satisfy the rule's letter: **the sequence must be — ship
commit updates the constant to the new runtime hash marked
PENDING-LIVE-VERIFICATION (a dated, one-time exception to the rule, recorded in
the commit), deploy, then the post-deploy re-grep either CONFIRMS (marker
lifted, same-day) or MISMATCHES (revert + stop).** Without this the ship's own
CI is red on a guard that cannot go green pre-deploy.

**Guard independence, answered**: the `it.fails` halves flip only with the ship
BY DESIGN — that is the observed-red standard, not circularity: the assertions
(zero outs legs in the pool; tags present over a non-empty population) are
defined independently of any implementation, the guard was RED on 07-28 against
the real defect, and its ability to see an unfiltered world is proven by the
legacy plant + the comparator plant, with arming extracted from source. What
the guard does NOT cover, named: (i) live-slate behavior — fixture-only until
Friday's board; (ii) **the dk_fd gap** — `productionModes()` extracts
{CRON_SEL_MODE, client default} = {ev_gated}; dk_fd is device-reachable
(Settings, ~2 taps) and the SPEC covers it via `dscpM`, but no test pins it —
the hrr coupling guard shares this same gap. A one-line guard extension closes
it; spec-only, owner's call.

**Wrong-wiring detectability BEFORE Friday — mostly yes, in the ship's own CI**:
wrong market key or a wider-than-claimed boundary → the scope-by-diff invariant
goes RED; broken accrual (rows vanish) → the population assertions go RED; a
no-op flag → the `it.fails` halves cannot flip → the ship cannot go green →
does not deploy (the owner's impossible branch, mechanical). Detectable ONLY on
Friday: the live-slate half — pre-committed as **the outs four-counts on
Friday's board** (rows PRESENT · GREYED · susp-stamped in predictions ·
ZERO outs legs in tickets — the HRR four-counts analog, plus cfSel stamps now
extending to outs shadow rows). The pre-committed "undetectable before Friday →
does not ship" branch therefore does NOT fire; the build/deploy authorization
stays the owner's, now with the hash statement and the interlock on the record.

**Config-only path: NONE EXISTS.** `outsSusp` has zero read sites today
(tonight's diff: on/off byte-identical, tickets included) and the builder
closures are engine-internal — no existing knob suspends a market. The
route-post-filter alternative is rejected with its costs stated: it DROPS
whole tickets after the build instead of substituting (thinner cards — the
builder would have picked replacements), tags no rows (the display and
prediction halves go missing unless the serializer diverges from the engine),
and it forks board-vs-engine semantics — the "engine ships verbatim" rule
exists to prevent exactly that fork. **Impossible branch, both facts printed**:
the flag is NOT already wired (`outsSusp` appears only in the echo reader and
its guard; the on/off diff is byte-identical), and the echo's null is the
DESIGNED pre-ship state ("absent config key echoes null"), not a wiring
accident.

## DATED CORRECTION TO "STRUCK AT 20" — ZERO USABLE BOARDS: THE INSTRUMENT DID NOT EXIST (2026-07-30, owner's item 3)

**The correction, stronger than quota**: the 07-26 archived board carries NO
`clampActivity` (verified on the gunzipped archive last night; `index.json`
lists exactly ONE board-day, best ≡ latest — so NO board on disk carries it;
the impossible branch is silent). The clamp instrumentation is ADDITIVE
2026-07-27 — every board that could have existed before it cannot carry the
measurement. **The check's usable-board count is ZERO, not 7 or 9: every
reachability figure for it was counting boards that cannot carry the
measurement. The STRUCK record stands, and its ground strengthens: unreachable
FIRST because its instrument did not exist, and SECOND because quota binds.**
The count starts at board 1 — today's 22:45Z board, the first built with
`clampLog: true` armed (route L244) — IF `clampActivity` rides it (reading 24,
pre-committed in the handoff).

**Clamp calls per board, MEASURED on the armed fixture slate (probe run and
deleted 2026-07-30; 15 games, 25 of 30 static sites executed, 5,183 total
calls)** — per-site n on 15 games, with boards-to-≥30 PROJECTED at a 6-game
evening slate (per-game rate × 6/board; label PROJECTED — the fixture is a full
07-09 slate, evening composition may differ):
| site (n on 15 games) | calls/6-game board | boards to ≥30 |
|---|---|---|
| 1647, 2089 (792) · 2069 (732) · 1591 (461) · 1757 (398) · 2088 (396) · 1624 (341) · 2309 (203) · 1660/2054/2055 (198) · 2318/2319 (161) | 64–317 | **1 — thirteen sites qualify at board 1** |
| 1615 (30) | 12 | 3 |
| 1669, 2114 (22) | ~9 | 4 |
| 1610 (15) · 2368 (14) | ~6 | 5–6 |
| 1594 (11) · 1629 (10) · 2280 (10) | ~4 | 7–8 |
| 2339 (7) | ~3 | 11 |
| 2258 (6) | ~2.4 | **13 — the load-bearing L2258 class check is a LOW-TRAFFIC site** |
| 2160 (4) | ~1.6 | 19 |
| 2371 (1) | ~0.4 | ~75 |
| the FIVE cold sites (0 calls of 30 static — incl. L1605) | no rate exists | their own pre-committed test (harness-substitutions) |

**Hot-site fidelity: yes, it reads the same instrument and starts at ZERO too.**
Its restatement in board-days from today: **first readable at board 1** (13
sites clear ≥30 in one 6-game board, IF clampActivity rides); ~18 sites by
board ~5–6; the tail (2339/2258/2160/2371) needs 11–75 six-game boards — with
8.25 board-days of quota, **the L2258 class check does not qualify this cycle
either**; the five cold sites remain their own test. The promotion criterion
(single-instrument → confirmed) accrues site-by-site as counts cross 30, never
as a calendar date.

## THE FOUR CRON-JOB.ORG GENERATE ENTRIES + THE COLLISION SEQUENCE (2026-07-30, owner's item 4; resolves before the 3:30 PM PT visit)

**All four entries call the SAME endpoint** — `GET
https://parlay-lab-six.vercel.app/api/generate` with header `x-cron-key` =
the `CRON_SECRET` env value on Vercel ("Josh types the secret"), timezone UTC,
failure = HTTP ≥ 400 (429 = the per-date cap of 3 spending runs). The docs'
schedule table (`docs/cron-jobs.md`; its "three entries" heading is stale — the
table has four rows):
| # | days | cron (UTC) | today (Thu)? |
|---|---|---|---|
| 1 | Mon–Fri | `0 22 * * 1-5` → owner edits to `45 22 * * 1-5` | **fires — the only weekday entry** |
| 2 | Saturday | `0 18 * * 6` | no |
| 3 | Sunday | `0 17 * * 0` | no |
| 4 | Sunday | `30 22 * * 0` | no |
**Entries 2–4 DO call /api/generate — but weekend-only. Today's edit is
ISOLATED: no second entry can hit generate near 22:45Z on a Thursday.** The
weekend consequence of adding the header to 2–4, priced now: Saturday 18:00Z
and Sunday 17:00Z + 22:30Z become SPENDING fires (~6 × unstarted events each,
~55–150); the two Sunday fires sit 5.5 h apart (no 45-min interaction) and
inside MAX_RUNS_PER_DATE = 3; Sunday's 22:30Z entry exists for the night game —
if the 17:00Z board already covers it the conditional skip returns free.
The fifth cron-job.org job (the `/api/clv` self-paced ticker, 96×/day) is
recorded in the docs (props-history.yml header) and is NOT among the four — no
undocumented entry; the impossible branch is silent.

**The collision sequence (22:45Z fire + a hypothetical 23:00Z second call),
from the route's own order**: auth → **45-min limiter** (`now − lastRun < 45
min → {ok:true, skipped:"ran recently"}` — L126 region) → conditional
good-board skip → INCR. A 23:00Z call 15 min after a 22:45Z spending run stops
at the LIMITER: it returns `{skipped:"ran recently"}` — it does NOT return the
board (the board reads free from `/api/board`), does NOT reach the good-board
skip, and does NOT increment the run count — `K_LASTGEN` and the INCR both sit
at the point of commitment, past every free exit ("a cap named for spend must
count spend", 2026-07-27). After 45 min the good-board skip takes over
(coverage-measured over unstarted games) — also free, also no INCR.
**Pre-committed reading resolved: only entry 1 fires today → the 3:30 PM visit
is two changes, isolated**; the weekend arming consequence above is the one
thing the header edit changes beyond Thursday, priced for the owner before the
visit.

## THE MODE-COVERAGE GAP — MEASURED, CLOSED, AND ONE M-ITEM (2026-07-30, owner's item 1; shipped before the board)

**The four modes, device-reachability, tap counts**:
| mode | device-reachable | taps | Kelly ceiling | suspension bars apply |
|---|---|---|---|---|
| `ev_gated` (default, cron pin) | ✓ Settings | ~2 | ✓ | ✓ |
| `dk_fd` | ✓ Settings | ~2 | ✓ | ✓ |
| `probability` | ✓ Settings | ~2 | ✗ | **✗** |
| `caesars_ev` | ✓ Settings | ~2 | ✗ | **✗** |
| any mode + override (`force`) | ✓ Builder "Allocate anyway" (NO-PLAY days) | 1 | ✗ | ✓ (the bar is upstream in `buildParlaySet`; force only reaches `shAllocate`) |

**THE EXTENDED HRR GUARD, RUN 2026-07-30 (armed fixture slate, per mode)**:
| mode | force | pool | HRR in pool | HRR in FUN | verdict |
|---|---|---|---|---|---|
| ev_gated | false | 50 | 0 | 0 | PASS |
| ev_gated | true | 50 | 0 | 0 | PASS |
| dk_fd | false | 36 | 0 | 0 | PASS |
| dk_fd | true | 36 | 0 | 0 | PASS |
| **probability** | false | 48 | **11** | **4** | **UNFILTERED** |
| **caesars_ev** | false | 48 | **11** | **4** | **UNFILTERED** |

**M20 — THE SUSPENSION IS UNENFORCED IN TWO DEVICE-REACHABLE MODES (the owner's
branch-1 reading, mode named, counts printed)**: `probability` and `caesars_ev`
are each ~2 taps from the device and carry **11 H+R+RBI legs into the pool and 4
into the FUN pick** — the exact numbers of the 2026-07-27 eleven-leg scare. This
is BY DESIGN (the parity stance: the bar sits inside `buildParlaySet`'s
disciplined branch, and the frozen table's `hrrAltMax` row already carries
"⚠️ Effect CONDITIONAL on `selMode ∈ {ev_gated, dk_fd}`") — **but the design's
premise, that those modes are not production-reachable, is FALSE on this
device.** Wherever the mode is switched, the suspension is cosmetic. The
consequence, stated at the owner's standard: the same holds for the outs flag
Thursday (measured: **10 outs legs** in the pool in each legacy mode today), and
for every future suspension — a suspension is a disciplined-mode property, not
a market property. **Today's device check runs in `probability` as well as
`ev_gated`** (the fifteenth chain step, below). Not shipped, not decided: making
the bars unconditional would end the parity stance — the legacy modes exist to
reproduce the historical engine — so this is an owner decision, spec-only,
recorded with its numbers.

**The gap is CLOSED as a coverage matter** (test-only ship today: no engine
string, no hash move, no vintage event): `tests/helpers/modes.ts` extracts the
WHOLE reachable domain from source — the `SelectionMode` union (every mode
Settings can persist), `CRON_SEL_MODE`, `getSelectionMode`'s default, and
override reachability read from the Builder's `shSetOverride(true)` control — so
a new mode joins every guard the day it is added. Both callers extended:
- `tests/hrr-suspension-coupling.test.ts`: disciplined modes × {force off, force
  on} must be ZERO (4 cells, all pass); the legacy pair is now a CENSUS pinning
  11/4 — a future change that silently extends OR removes the bar there fails
  here; the unset-posture plant kept.
- `tests/outs-suspension-coupling.test.ts`: same domain (its `it.fails` halves
  still flip in the ship commit); legacy census pins 10 outs legs per mode.
**No other guard calls `productionModes()`** — the list is exactly these two.

**Are the new instruments mode-aware? NO — all four have only ever run in
`ev_gated`** (stated plainly): cfSel's guard mirrors the cron arming
(`selMode = "ev_gated"`, guard L51) and the production path is the pinned route;
the echo RECORDS selMode but its guard exercises one literal; the trigger mark
is mode-independent by construction (route auth state); `self_consistency` is a
board-level archive check with no mode axis (it reads emitted rows). None is
WRONG in another mode — none has been EXERCISED in one. Spec-only follow-up,
owner's call. Impossible branch: **no mode is unexercisable by the harness** —
all four ran today.

## THE ECHO-GUARD EXCEPTION IS THE STANDING PROCEDURE — AND AN EXCEPTION-FREE FORM EXISTS (2026-07-30, owner's item 2; the build waits on this)

**The assertion, cited** (`tests/engine-echo.test.ts` L26–29): `expect(ENGINE_SHA,
"engine moved without a served-artifact re-verification").toBe(SERVED_ENGINE_SHA_VERIFIED)`.
`ENGINE_SHA` is computed at module load from the LIVE repo engine string
(`src/lib/engine-echo.ts`); `SERVED_ENGINE_SHA_VERIFIED` is a hand-updated
constant whose rule is "updates ONLY beside a fresh re-grep" of the SERVED
chunk. So it compares **repo-now vs served-as-of-the-last-manual-verification** —
and the owner is right that this can never be green in the same commit as an
engine change: the served artifact only carries the new string after a deploy,
and the deploy needs a green build. **It is the standing procedure for every
engine ship, not a one-time exception** — my "one-time dated exception" wording
is WITHDRAWN.

**The exception-free formulation, and it exists**: split the one blocking
assertion into two.
1. **BLOCKING — runtime vs COMMITTED SOURCE**: `ENGINE_SHA` (computed from
   `legacy/index.html`'s extracted string) must equal the sha of the CHECKED-IN
   generated artifact `src/engine/legacy-src.gen.ts`. Both exist pre-deploy, so
   an engine ship regenerates the artifact and the check is green in the SAME
   commit — no exception, ever. What it catches: the real historical failure
   mode — `legacy/index.html` edited without re-running `tools/extract-engine.mjs`,
   i.e. the repo shipping a stale engine to production.
2. **NON-BLOCKING — served vs committed**: a REPORT (not a gate) that re-greps
   the served chunk and prints match/mismatch with both hashes and the last
   verification date, red only in the post-deploy verification step.
**What that LOSES, named exactly**: the current form fails the build when
production is serving something other than what the repo says — i.e. it catches
a FAILED OR PARTIAL DEPLOY, a rollback, or an edge-cache serving a stale chunk,
without anyone running the re-grep. Under the split, that class becomes a report
someone must read; nothing blocks. **The mitigation that keeps it absolute**: a
RESOLUTION GUARD — if `SERVED_ENGINE_SHA_VERIFIED` differs from `ENGINE_SHA` AND
the marker `PENDING-LIVE-VERIFICATION` is present, the build fails once the
marker is older than N hours (N = 24, chosen — an engine deploy verifies same
day or it is a defect). That makes the marker self-expiring: **nothing today
enforces resolution — the owner's "permanent by default" reading is correct as
the code stands.**
**Pending queue items that would need the exception under the CURRENT
formulation: 6** — A1, `coreEvMin`, the 1/n cap, damping, `SH_W`, the
ungraded-group fix (all engine-string). Plus Thursday's outs flag = **7 with
it**. (The `achievable ≥ T` route gate is route-only — no engine string, no
exception.)
**Recommendation, not taken**: reformulate to the split + resolution guard
BEFORE Thursday's build — it is test/tooling-only (no engine string, no hash
move, no vintage event), it makes the ship exception-free, and it converts the
served-vs-repo check from "blocking but bypassable" to "reporting plus a
self-expiring gate". **Impossible branch checked: the guard has NEVER been
bypassed** — `git log 9753fb9..HEAD -- src/engine/legacy-src.gen.ts
legacy/index.html` is EMPTY; no engine-string change has occurred since the sha
instrument shipped, so Thursday's would be the first.

## WEEKEND ENTRIES: THE PREMISE CONFIRMED, AND THE NUMBERS FOR FRIDAY (2026-07-30, owner's item 3)

**Premise CONFIRMED — board-days are credit-limited, not calendar-limited.**
1,238 credits ÷ ~150 = 8.25 board-days against ~55 calendar days to 09-22; every
recorded rationing table prices cadence in credits/day, and the per-date cap
(MAX_RUNS_PER_DATE = 3) never binds at one board/day. Nothing calendar-limits
board-days: no per-week quota, no cooldown, no expiry before the reset. Adding
the header to entries 2–4 does not create board-days — it spends the same pool
at hours chosen in 2026-07 for coverage reasons, before T existed.
**DECISION RECORDED (owner's, 2026-07-30): header on ENTRY 1 ONLY; entries 2–4
stay unheadered and keep 401'ing at zero cost.** Reversible at zero cost; a
spent board-day is not.

**Projected coverage at the weekend hours** (from the schedule + the FP−3h rule;
PROJECTED — the real slates post later in the week):
| hour | typical slate shape | achievable (FP−3h) | luPct |
|---|---|---|---|
| Sat 18:00Z (entry 2) | split early/late; afternoon bulk ~20:05Z+ | **~0.2–0.4** — the 18:00Z fire precedes most first pitches by >3 h | ≈ achievable, feed-lag aside |
| Sun 17:00Z (entry 3) | bulk 17:35Z | **~0.6–0.8** (the bulk is 35 min out — well inside FP−3h) | ≈ achievable |
| Sun 22:30Z (entry 4) | the 23:20Z national game only | **~1.0 for that game**, but the bulk has STARTED — board covers 1 game | high on a tiny population |
Against **T = 0.80**: Saturday 18:00Z FAILS T on the projection; Sunday 17:00Z is
BORDERLINE; Sunday 22:30Z passes on a one-game population.

**The Sunday trap CONFIRMED — the good-board skip does NOT check T**: it computes
coverage over UNSTARTED games (`liveCoverage`) and skips on its own `cov.skip`
threshold; **T (`gen.achievable ≥ 0.80`) is not consulted anywhere in the route —
it is a spec'd reading, not shipped code.** So a sub-T 17:00Z board blocks the
22:30Z fire whenever the skip's coverage test is satisfied. Mechanism confirmed
as the owner described.

**Shadow-accrual value at those hours** (the only reason to want weekend boards —
the 08-15 review is shadow-fed): rows scale with events, ~30–50 HRR rows and
~250–300 prop rows per full slate (measured order from the archive); Sunday
17:00Z ≈ a full bulk → the best weekend accrual; Sat 18:00Z ≈ full slate rows but
sub-T composition; Sun 22:30Z ≈ ONE game → ~2–4 HRR rows, negligible accrual.
**Best-coverage hour**: Saturday ≈ **20:00–20:30Z** (3 h before the ~23:15Z
weekend evening cluster); Sunday ≈ **20:00Z** (after the 17:35Z bulk starts, 3 h
before the 23:20Z nighter — but it then misses the bulk entirely; the honest
Sunday answer is that no single hour serves both, which is why entries 3 and 4
exist). Cost of a new entry at either hour: one board ≈ ~150 at a full slate
(~6 × events), i.e. **~18% of the remaining pool per weekend board**.

## THE UNTRACEABLE SPENDER — BOUNDED IN ADVANCE, AND THE STAMP SPEC (2026-07-30, owner's item 4)

**Is CLV capture spend bounded and knowable in advance? PARTLY — and the
unbounded part is why the residual could not be reconciled in the moment.** The
`/api/clv` job is driven by cron-job.org at **96×/day (every 15 min)**; each
firing is self-paced (the same pattern as `snapshot_props.py`): it captures only
when a game's close window is open, so the number of PAID captures per day is
bounded by GAMES, not by firings — **~1 capture per game per day, ~6 credits per
capture** (one event × the market set). For today's 10-game slate that is
**~10 captures ≈ 60 credits, PRE-COMMITTED as today's expected CLV figure**;
tonight's fold reconciles against that number rather than explaining a residual
after the fact. What is NOT knowable in advance: WHICH firing pays (the window
opens on real first pitches) — so the spend is bounded but its TIMING is not,
and a quota read mid-window cannot attribute the delta without the fold.
**Therefore, per the owner's third branch, stated: any quota band anchored
mid-day is a LOWER BOUND on spend until the fold lands** — the bands stay usable,
labeled.

**THE SPEND STAMP, SPEC'D NOT SHIPPED (additive, zero credits)**: at capture
time, write a one-line stamp to the day-file's own structure —
`{t, kind:"clv", events:N, est:6*N}` appended to a `spend[]` array in
`data/props/<date>.json` (the file the capture already folds into), or to a
Redis key `pl:spend:<date>` the fold drains. Cost: zero Odds credits, one extra
write on a path that already writes. Effect: the quota read reconciles in the
moment instead of hours later. Owner's call; nothing shipped.

**Tonight's fold re-run is PENDING** — the fold runs with the evening props
sweep (~20:20Z measured); the re-reconciliation and the ~97's close/survive
verdict are reading 27 (handoff), to be printed when the fold lands. The
pre-committed branches stand as the owner wrote them.

## THE RE-SCOPED CHECK DOES NOT COVER L2258 — SAID PLAINLY (2026-07-30, owner's item 5)

**What L2258 gates**: it is the `shClamp(x, 0.86, 1.12, "2258")` call in the
`pitcher_outs` path — the clamp whose OFFSET class (pinned at the low bound
≥0.90 of calls) is the evidence that the outs model's opponent-offense factor
delivers a near-constant. The fixture's verdict there is load-bearing for M2/the
outs defect: **VALIDATED at ≥0.90 OFFSET → the fixture's clamp/shrink numbers
promote to confirmed and the outs finding keeps its second instrument;
UNREPRESENTATIVE / class change → the `pitcher_outs` clamp count, the H+R+RBI
clamp-protection table, and the `shShrink` k table (with all nine own-sample
weights) re-run on the archive.**

**Is any qualifying site a proxy? NO — and no correlation basis exists to call
one.** The 13 sites that clear ≥30 calls at board 1 are the high-traffic pricing
sites (1647/2089/2069 park+prior, 1591, 1757, 2088, 1624, 2309, 1660, 2054/2055,
2318/2319); L2258 is a low-traffic site (~6 calls per 15-game slate, ~2.4 per
6-game board) in a different code path with different bounds and a different
class. Nothing in the docs measures a correlation between any site's pinned
fraction and L2258's, and none is computable from a single fixture — **so no
proxy is claimed.**

**THE SENTENCE, for the record beside the STRUCK block**: *the re-scoped
hot-site-fidelity check will produce verdicts on sites that were not the reason
the check existed, and the load-bearing site (L2258) remains unmeasured this
cycle.* The re-scope is therefore **PARTIAL** — it is not a rescue of the
20-board check.

## DATED CORRECTION — THE STRAGGLER DID COMMIT, AND MY STEP-2 COMMAND READ THE WRONG BRANCH (2026-07-30 ~18Z)

**The morning cold read's STEP 2 said "the straggler DID NOT COMMIT (no main
commits since 05Z)". That verdict was produced by a command that could not have
seen it.** Discovered when a push was REJECTED: origin/frontend-rebuild had
moved to **`8f8e8c8` — author `engine-v2-bot`, 2026-07-30 07:43:07Z, "context:
refresh (weather/umps/bullpen)"**. The bot commits to **`frontend-rebuild`**
(main holds the workflow FILES; the job checks out the app branch to run) — my
step-2 command read `origin/main`, where a bot commit can never appear.

**What the straggler actually did — the reading that matters, unchanged in
outcome**: the commit touches **`data/ump_k.json` ONLY** (1 file, 1 line).
`public/model/context.json` is NOT in it. **The pause's git-add drop worked
exactly as designed: ump_k keeps accruing (the ~08-04/08-08/08-13 self-arm
clocks are intact), context.json stayed frozen.** So the pre-committed
conditional resolves the same way it was written: **the homogeneous-window start
stamp STANDS at the pause pair**
(`00994434be42196b67233ed1663ded2f0651b863434f537cd611da108ca0374e` /
`2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80`) — the right
answer, reached this time by evidence rather than by a blind command. Zero Odds
credits (keyless builders) — the quota reconciliation is unaffected.

**Two process consequences, recorded**:
1. The handoff's step-2 command is CORRECTED in place (branch + read the FILES,
   not the presence of a commit). A "none found" from a command pointed at the
   wrong branch is indistinguishable from a real absence — the failure mode the
   owner's "print the raw output beside the verdict" rule exists to catch, and
   it caught it: the raw output was an empty log, which is what sent me looking.
2. **The bot is an active writer on the branch this session pushes to** — every
   push must expect a non-fast-forward. Today's held stack was REBASED onto
   `8f8e8c8` (renaming it, exactly the event `tests/sha-references.test.ts` was
   written for after the last rebase orphaned nine citations); the one doc
   citation of a renamed id was updated in the same commit, and the guard is
   green. The props-history workflow already carries a pull-rebase ×3 retry for
   the same reason on `line-history`.
