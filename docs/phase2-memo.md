# Phase 2 — model-vs-close, design memo (2026-07-26)

**Status: memo only. No code. Report-only during the freeze — no weight moves, and exit
condition 3 stays unsigned until the instrument produces numbers.**

## WHEN THE SYNC PHRASE BINDS — read this first

It binds in exactly one place, and less than has been assumed:

| half | needs the phrase? | why |
|---|---|---|
| **inputs accruing** (`fp`, `fair`, `cz` in `props-history`) | **NO** | a GitHub Actions archive on the `line-history` branch, public |
| **computing the close fair** for every board row | **NO** | pure arithmetic over that archive |
| ~~**joining close → model `p`**~~ | ~~YES~~ **NO (2026-07-27)** | ~~`p` lives behind `/api/predictions`, sync-gated~~ — the board archive carries `pO`/`fO` publicly; superseded, see below |
| ~~**the panel that displays it**~~ | ~~YES~~ **NO for the report** | the report reads public archives; only the in-app panel would need the phrase |

**So the instrument accumulates whether or not the owner acts, and only reporting requires
his key.** Nothing is lost by not running it; nothing accrues faster by running it. That is
the opposite posture from CLV, where the *capture* itself needed the phrase and a missed
sighting was gone forever.

> **SUPERSEDED IN THE ONE PLACE IT BOUND (2026-07-27): the sync phrase no longer binds at
> all for archive-covered dates.** The board archive (`data/boards/*.best.json.gz`, public)
> carries every row's `pO`/`fO` at generation time, and the un-blend
> `pModel = (pO − 0.65·fO)/0.35` is exact (validated to 0.29 pp by `tools/rung_signature.py`'s
> ladder self-consistency). The join is public arithmetic end to end. `/api/predictions`
> stays the richer source (per-generation history), never the required one.

## CRITICAL PATH — reported before building (2026-07-27)

**What exists:** both input archives, public — boards (07-26 backfill; daily IF
`board-archive` fires) and props snapshots (close-quality `kind` + first-pitch `fp` stamps
since the 07-27 sweep). The close-coverage reader (`tools/close_capture.py`). Every
pre-committed branch table. **What does not exist: the join, the slope fit, and the report —
no code has been written for any of them (this memo's own status line).**

| # | critical-path item | state |
|---|---|---|
| 1 | ~~`board-archive` must fire~~ **RESOLVED same day**: fired on its own, twice, both green (17:59Z, 22:38Z). 07-27's absence is BY DESIGN — targets are "PT yesterday and the 2 before, never today", so 07-27 archives on 07-28's runs with three attempts inside the TTL. Tomorrow's check reduces to "did 07-27.best/.latest land" | **✅ fires; capture pending 07-28** |
| 2 | close fairs per board row — `tools/close_fair.py`, keyed as board lkeys with `mins`-to-pitch and day/night stamps; **spot-checked**: stored fair = recomputed median de-vig to 4dp on all samples (07-27: 6 events, 434 rows, 0 post-pitch) | **✅ built + spot-checked** |
| 3 | `tools/phase2_slope.py`: join archived board (open + pModel) × close fair by lkey+date; WLS of (close−open) on (pModel−open), rung-bucketed, per market, **two vintages never pooled** (vintage 1 = the 16:xx-era board, 07-26 only; vintage 2 = the 4-cron era, 07-27→) | build |
| 4 | the first report: slope + SE + n per market × rung, **signed direction and the sign-flip column**, close-quality (`kind`) and day/night stamps, **the identification diagnostic in the same table** (x-spread, collinearity, attenuation — an attenuated or collinear fit is NO RESULT, the binding qualifier) | build |
| 5 | readings: the five-branch HRR table (hits rung arm restored, branches 1–5 reachable), **outs as the pre-committed positive control with its five branches**, the row-3 asymmetry table, **the M10 arm leading the rung arm per the power split** (3σ ~08-20 vs ~2σ at exit) | pre-committed, on disk |

**The un-blend error is NOT a measurement floor worth a term in the diagnostic — bounded
(2026-07-27):** worst-case 0.29 pp (typical ~0.1) on `pModel` against an x-spread of ~6–7 pp
gives attenuation < 0.1% of the slope — three orders below the slope SE at any usable n. It
is listed in the identification diagnostic as a stated floor with this bound, beside
collinearity, so nobody re-derives it.

**Build item 2 is DONE and spot-checked (2026-07-27)**: `tools/close_fair.py` extracts
per-row close fairs keyed as board lkeys, with `mins`-to-first-pitch and day/night stamps.
On 07-27's close snapshot (23:41Z, 6 events, 434 rows, none captured after first pitch):
stored `fair` equals the median per-book de-vig recomputed from the stored raw prices to
four decimals on all sampled rows (n=2–7 books, three markets). The join
(`tools/phase2_slope.py`) is the remaining build.

⚠️ **OUTAGE FOUND 2026-07-27 late: no 07-27 board exists — Series A's first joinable date
slips.** The retime removed Vercel's 16:00Z generate cron; the route's scheduled path wants
header `x-cron-key: CRON_SECRET` (any hour, rate-capped) — and every probe says the
cron-job.org entries 1–4 are not presenting it (the deployed gate 401s correctly; 07-27 has
zero generations). The board-archive lesson verbatim, on the other scheduler: **"created" is
not "fires" — external entries get a next-day verification check the same as workflows.**
Owner's checklist: cron-job.org → entries 1–4 → add custom header `x-cron-key` with the
CRON_SECRET value (typed by the owner, never by Claude); the entry execution history shows
response codes — 401s mean the header, zero executions mean the entries; the Vercel log line
distinguishes "header-bad" vs "none". ~~Bridge: an on-device generate writes the day's board through the client path~~
**RETRACTED 2026-07-27, same night, by trace — the exact trap this file's own 1a warning
documented**: the only `pl:board:{date}` writer is `/api/generate` L319; the client path is
localStorage + predictions only. **No server board without the header fix or a manual
header-authed curl (in CLAUDE.md's outage block).** ~~Series A's first joinable date = the
first date `/api/generate` actually runs~~ **CORRECTED same night: 07-27 is joinable after
all** — the prediction store holds its client-logged rows (pre-outcome, `pModel` + `pMkt`
per row = the join's exact inputs) behind the owner's sync phrase, with the 20:56Z props
snapshot (11/15 events) as the archive fallback. What 07-27 permanently lacks: a server
board blob and therefore shadow rows (that build predates the shadow deploy anyway). The
archive-covered no-phrase join starts with the first `/api/generate` board (earliest
07-28).

**Earliest dates**: first joinable date = ~~07-27~~ **the first date with BOTH a board and a
close — earliest 07-28** (on-device morning generate, or the fixed 22:00Z entry). First slope *number* (≥3 joined days): **~07-30 – 08-01**. First report
with every pre-committed column and the diagnostic: **~08-03**, aligned with the
reopening-rate recompute. Outs control readable **~08-06**; the M10 grading arm reaches 3σ
**~08-20**; the window's designed read-out stays **~09-22**.

## SEQUENCING UNDER M11 — the recommendation, for sign-off (2026-07-27)

Phase 2 measures whether the CURRENT engine's disagreement predicts closing movement, and
the bundle will change the engine structurally. The order question is real and it is the
owner's. The recommendation and its reasons:

**Phase 2 first. The bundle at exit, not before. Shadow-log the specced amendments in
between (itself gated on explicit sign-off — it is a code change under the freeze).**

1. **The freeze's design premise is one engine vintage per measurement window.** Shipping
   mid-window makes Phase 2 read a mixture — and then NEITHER engine has a clean window.
   M11 does not weaken that argument; it is the argument.
2. **Phase 2-first has option value in both directions; bundle-first has none.** A
   negative-with-power kills the premise for any engine of this family — better learned
   before shipping than after. A positive validates the channel and the market question,
   which transfers; what does not transfer is the specific engine's calibration, and that
   is what the shadow series covers.
3. **The honest-record argument**: the current engine is the one that ran the season. Its
   Phase 2 verdict is the record of what was deployed, whatever ships later.
4. **The carve-out that removes most of the cost**: compute the speccable-now amendments
   (M8, M11's estimator, M10's bbr shrink, M1) as dormant, parity-safe SHADOW prices logged
   beside the live board — the `shadow.umpKf` pattern. By exit the amended engine has weeks
   of its own close-graded series inside the current window without touching a price. Exit
   then reads both: the designed evidence (current-engine Phase 2) and the bundle's
   validation head start (the shadow series). If the shadow engine's disagreement predicts
   the close WORSE than the live one, the bundle is wrong somewhere and it was caught
   pre-ship.

Costs stated: shadow pricing is engine-adjacent work under the freeze (additive and dormant,
the clamp-instrumentation class, full parity discipline) and it is NOT free of M12-style
risk if done sloppily. If the sign-off is no, the fallback is unchanged: bundle at exit,
amended-engine validation runs 09-22 → mid-October on the accruing archive before real
weight is placed on its prices.

## WHY THIS IS NOW LOAD-BEARING, NOT MERELY VALUABLE

As of 2026-07-26 the card is **NO-PLAY**, and projected to stay that way until roughly
**2026-08-02** (ML/RL) → **2026-08-09** (most prop markets), because `CAL_START` reset
`mktN` and made the small-sample consensus gate universal. With zero locked cards:

| channel | state during the NO-PLAY window |
|---|---|
| ledger P/L | **dark** — no locks |
| `/api/clv` sightings | **dark** — sights locked legs only |
| Discipline report | **dark** — nothing to classify |
| receipts / NV-tax accounting | **dark** |
| outcome-graded calibration | thin — 70 legs/day of *board* rows, no bet rows at all |
| **Phase 2 board-wide close-grading** | **the only channel still measuring anything** |

**For roughly two weeks, Phase 2 is the evidence channel.** Everything else that reads the
freeze's scoreboard needs a bet to have been placed, and none will be.

## PHASE 2 IS THE DECISIVE TEST — this is the headline, the bias estimate is secondary

Measured on the real 2026-07-26 board: the legs the +2% gate selects sit a median of
**16.2 probability points** from the de-vigged market, against a board median of **7.6** —
a **2.13× ratio** (37 distinct legs; the first pass said 17.3/2.28 counting leg *instances*).
Two readings fit that, and they have opposite consequences:

1. the model holds ~17 pp of **real information** the consensus lacks, on ~46 legs a day; or
2. **the gate selects model error** — it concentrates wherever the model is furthest from
   the market, which is also wherever the model is most likely wrong.

Priors favour (2), and the H+R+RBI ledger agrees. **Priors do not settle it. This does:**

> **Conditional on the model disagreeing with the OPEN by X, how far does the CLOSE move
> toward the model?**
>
> `regression of (close_fair − open_fair) on (pModel − open_fair)`
>
> - **slope ≈ 1** → the model is early to real movement. Reading (1). Genuine edge.
> - **slope ≈ 0** → the market never comes to it. Reading (2). The disagreement is noise
>   and the gate is amplifying it.

**That single number answers whether this engine has edge**, and it needs **no outcomes and
no ledger** — which is decisive right now, because both are dark for ~2 weeks.

**So Series A's primary readout is the movement slope. The model-vs-close bias estimate is
secondary** — it says how wrong, the slope says whether the disagreement means anything at
all.

Both sides come from `props-history`: `open_fair` from the first snapshot of the day,
`close_fair` from the last before first pitch, both recomputed at the engine's own Shin
de-vig from `fp`. `pModel` comes from the prediction store, which is where the sync phrase
binds (below).

### Why the decomposition did NOT already answer this

`docs/collection-period.md` measures the gate's selection effect at
**`WITHIN = 1.00 [0.90, 1.17]`** — no measurable within-market winner's curse. **That does
not close reading (2), and must not be read as doing so.**

The decomposition measures **gap-based selection**. The winner's curse is **edge-estimate
error**. The gate is what separates them: it selects on **EV**, and `EV = f(gap, price)` —
at long odds a small gap clears +2%, so the gate can select *low*-gap rows and decouple gap
from selection entirely. `WITHIN ≈ 1.00` establishes only that the gate is not picking
extreme-*gap* rows within a market. Whether the selected legs' **true** edge matches their
**measured** edge is untouched by it, and is precisely what the movement slope tests.

## THE POSITIVE CONTROL — `pitcher_outs`, left broken on purpose

**Phase 2 had no validation criterion.** A slope near 0 could mean the model has no edge, or
that the instrument doesn't work; nothing distinguished them. `pitcher_outs` now does.

`docs/pitcher-outs-audit.md` establishes, on mechanism and on 38 board rows, that the outs
model is **confidently and one-sidedly wrong**: a constant off by ~3× (`0.140` where the
league value is ~`0.400`), a clamp pinned at its floor on **35 of 35** rows, a **0 of 38**
one-sided sign, and **λ_model − λ_market = −2.48 outs, negative in 38/38**. It is the
strongest known-bad signal available anywhere in this engine.

**The fix is approved in principle and DEFERRED, deliberately.** Reasons, in order:
1. `pitcher_outs` cannot take money before ~09-13 (`consMinN`), so leaving it broken costs
   nothing in realised P/L;
2. fixing mid-window **splits the outs prediction population** — the `CAL_START` coupling
   in a new variable, and that coupling has already fired once;
3. it is the only available way to validate Phase 2 itself.

> ### EXPECTED RESULT, STATED IN ADVANCE
> **Slope ≈ 0 on `pitcher_outs`.** The model's disagreement there is a constant error, not
> information, so the close should not move toward it.
>
> - **slope ≈ 0 on outs** → the instrument discriminates. Slopes on other markets can be read.
> - **slope ≈ 1 on outs** → **Phase 2 does not work.** A model this measurably wrong cannot
>   be predicting closing-line movement; a high slope means the regression is picking up
>   something structural — mean reversion in the open, a stale-open artifact, or the join
>   itself. Do not report any other market's slope until that is explained.
>
> Writing the expectation down *before* the data exists is the point. A control whose
> expected value is decided after the readout is not a control.

**Coverage check:** outs is 38 rows/day and `categories` caps at 50/market, so the control's
population is **complete** — unlike TB/hits/HR/H+R+RBI, which are truncated.

**TRIGGER FOR FIXING: Phase 2 reports on `pitcher_outs`, OR freeze exit — whichever comes
first.** The one-line change is written out in `docs/pitcher-outs-audit.md` under "THE FIX,
PRE-WRITTEN".

## A SECOND CONTROL, IN THE OPPOSITE DIRECTION

One control only proves the instrument can detect *absence* of signal. Two controls pointing
opposite ways is a materially stronger validation: an instrument that reports slope ≈ 0
everywhere passes the outs test for the wrong reason.

**Proposed positive-direction control: `batter_hits`.** It is the market where the graded
record says the model *beats* the market — model Brier **0.099** vs consensus **0.109**, the
largest favourable gap of any market (every other is within ±0.012, and `pitcher_outs` is
0.285 vs 0.215 against). If the engine has edge anywhere, hits is where the evidence points.

> **Expected result, stated in advance: `batter_hits` slope materially above 0**, and above
> `pitcher_outs`'s. If **both** come in near 0, the instrument is not discriminating and no
> market's slope may be read. If **hits** comes in near 0 while outs does too, that is the
> "no edge anywhere" reading — which is a *result*, but only once the instrument has shown it
> can produce a non-zero slope somewhere.

### PRE-COMMITTED INTERPRETATION — both branches, before the numbers arrive

`batter_hits` is a **thin** margin: Brier 0.099 vs 0.109 on a market where every row sits
within 0.012 of consensus. An ambiguous return is therefore the *expected* failure mode, and
it must not be allowed to look like a verdict either way. All four cells are fixed now:

| `pitcher_outs` | `batter_hits` | reading — **committed in advance** |
|---|---|---|
| ≈ 0 | **materially > 0** | **Instrument works.** Every market's slope is readable. |
| ≈ 0 | **≈ 0** | **NON-DISCRIMINATING.** No market's slope may be read, including outs'. |
| ≈ 0 | **ambiguous** (CI spans 0) | **Valid on outs, inconclusive on hits.** Outs' control passes on its own — it rests on mechanism. Report other markets' slopes with the caveat that the positive direction is unvalidated. **This is not an instrument failure; it is underpowered on that market.** |
| **< 0** (CI excludes 0, negative) | any | **EDGE IN REVERSE — the strongest possible reading, and the rarest.** The close moves systematically AWAY from the model, i.e. the model's disagreement carries information with the sign flipped. On a market with three confirmed defects this is coherent: a constant, one-sided error means the model is reliably wrong in a fixed direction, and the market's drift is reliably opposite. **Treat it as a validated instrument** (it discriminated) **and as a directional finding about outs**, not as a fault. Do not fade it into a bet — a reverse-signal strategy is out of scope, un-specced and un-risk-managed. Report it, re-run on a second vintage, and escalate the outs fix from "deferred" to "trigger met". |
| **≫ 0** | any | **PHASE 2 DOES NOT WORK.** A model this measurably wrong cannot predict closing-line movement; something structural is being picked up. Explain it before reading anything else. |

"Ambiguous" is defined before the fit: **the 95% CI on the hits slope contains 0 while its
point estimate is positive**. "Materially > 0" means the CI excludes 0.

**This control is weaker than the outs one, and that is stated deliberately.** `pitcher_outs`
rests on **mechanism** — a constant off by ~3×, a clamp pinned 35/35, 0-of-38 one-sidedness —
which is board-independent. `batter_hits` rests on **n = 7 graded legs** and a 0.010 Brier
gap. It is a directional prior, not a known-good market. Weight the two accordingly: outs
failing invalidates Phase 2; hits failing is a finding to investigate.

**H+R+RBI was considered as the second control and rejected.** The plan was to use a
denominator fix as a pre/post split with an expected slope improvement — but that fix was
**retracted before shipping** (the term is algebraically correct; see
`docs/hrr-recalibration.md`). No fix will land, so there is no post-fix population to compare.

## SERIES B IS BUILT — and three things it found before any slope was fit

`tools/phase2_series_b.py --dir data/props`. Everything except the `pModel` join, which needs
the sync phrase. Emits a join-ready table keyed `(date, market, player, line)`.

### 0. RESOLVED, AND FIXED THE SAME DAY — the cadence

**The Actions API answers it directly** (`/actions/workflows/311636390/runs`, 30 runs):
every run is `event: schedule`, and `run_started_at` matches the archive's `t` exactly. So
the timestamps ARE run times, and **GitHub is starting the scheduled workflow hours after
its cron**: `0 17` → ~20:20Z (**+3.3h**), `45 22` → ~07:30Z the **next day** (**+8.75h**).
Consistent across 15 days. Both branches have only ever had those two crons (`73087db` /
`ea520c6`, 2026-07-12), so nothing was misconfigured.

**The "near-close" sweep was landing nine hours late — after the games it was meant to price
had been played.** The 07:30 reading in each day file is the *previous* night's 22:45 cron,
arriving in time to be that day's *opener*.

> **A third cron would inherit the same queueing delay.** The trigger cannot be trusted, so
> the decision moves into the script — the `/api/clv` pattern.

**SHIPPED 2026-07-26:** `tools/snapshot_props.py` now decides from the slate.
`_snapshot_kind()` returns `close` when the next unstarted first pitch is within **95 min**
(at most one per **40 min**), `pre` otherwise, and `None` when every game has started. Each
snapshot carries `kind`. `props-history.yml` fires **hourly from 17:00Z through 01:00Z**, so
some firing lands in the window whatever the delay does. Unit-tested on six cases.

**Consequence for the vintages:** Series B (07-12 → 07-26) is **T−2.5h attenuated** and
labelled so. Series A (from 07-27) carries `kind: "close"` on true closes. The existing
never-pool rule already covers the difference; **this is now the biggest reason for it**,
larger than the de-vig change.

### 1. ⚠️ THERE WAS NO CLOSE IN THE ARCHIVE (Series B, permanently)

Snapshots land at **~07:30 and ~20:16 UTC**; first pitches run **22:40–23:20 UTC**. Every
"close" is a **T−2.5h reading at best**. The field is named `late_fair`, never `close_fair`.

**This attenuates any slope toward zero**, which is decisive because *slope ≈ 0 is a
pre-committed reading*. **A slope near 0 in Series B cannot be read as "no edge"** — it is
confounded with the fraction of the day's move that happens after 20:16. Only a genuine
close can support that branch.

**And the cadence is unexplained.** The configured cron is `0 17 * * *` and `45 22 * * *` on
**both** `main` and `frontend-rebuild` — unchanged since `73087db` (2026-07-12) — and the
observed timestamps match neither. Actions crons run *late*, not 9 hours early. **Resolve
this from the Actions run log before Series A's close definition is trusted**; if the runs
really are at 22:45, that is a near-close and the archive's `t` field is wrong instead, which
is its own defect. Either way it must be settled by reading the log, not inferred.

### 1b. THE 07-17 → 07-22 ATTENUATION BOUND — worth having, and NOT a correction factor

The only population with both a T−2.5h archive price and a true ~45-min pre-pitch CLV
sighting is the **07-17 → 07-22 locked legs**. Running `movement open→T−2.5h` against
`movement open→true close` on those legs gives the attenuation factor per market, which
would let Series B be *bounded* rather than discarded, and would also say how much of the
day's move happens in the final 2.5 hours — directly useful for the lock-guard threshold.

**Needs the ledger, so it is owner-executable.** And when it runs, it must be labelled:

> **That population is pre-`CAL_START`, pre-`booksInd`, pre-timezone-fix, and priced by a
> board generated at 16:00 UTC.** The ratio it produces describes *that* engine at *that*
> generation hour. Boards generated at 22:00 UTC (the new cron-job.org schedule, see
> `docs/cron-jobs.md`) sit a different distance from the close and will have a different
> attenuation. **It is a bound, not a standing correction factor**, and must never be applied
> to a 22:00-generated board.

### 2. 44% attrition, and it is not yet shown to be random

**3,637 of 6,535 open rows (56%) have a later reading.** Uniform across markets (52–56%).
**The comparison has now been run** — joined vs lost, on every dimension this vintage can
support:

| field | joined | lost | diff | ratio |
|---|---|---|---|---|
| books behind the fair | 2.2035 | 2.1636 | +0.040 | 1.018 |
| open fair (prob) | 0.5111 | 0.5042 | +0.007 | 1.014 |
| \|fair − 0.5\| (extremity) | 0.0770 | 0.0815 | −0.0045 | 0.945 |
| overround | — | — | — | **UNMEASURABLE** |
| Caesars-in-fair (`czf`) | — | — | — | **UNMEASURABLE** |

**Benign on what is measurable** — 1.8% more books, 1.4% higher fair, 5.5% less extreme.
None of that is large enough to make the movement distribution a different population.

**But two of the four requested dimensions cannot be checked at all**: `bo`/`bu` (overround)
and `czf` were added to `snapshot_props.py` on 2026-07-25/26 and are absent from this
vintage, so those columns read as zeros rather than as measurements.

> ### SERIES B CARRIES TWO CAVEATS, NOT ONE
> 1. **Attenuated close** — every reading is T−2.5h or earlier, so any slope is biased toward
>    zero and "slope ≈ 0" is uninterpretable in this vintage.
> 2. **Partially unbounded selection** — attrition is bounded on *books-behind-fair* and *fair
>    level* (both benign, ratios 1.018 and 1.014) and **unbounded on overround and Caesars
>    participation**.
>
> **The second caveat is worse than it looks, because `czf` IS the `booksInd` dimension.**
> Series B cannot rule out that its joined rows are systematically the ones where **Caesars
> quoted** — and Caesars participation is a variable this project has already measured as
> mattering (`docs/collection-period.md`: total bases 56.5% Caesars-in-fair, H+R+RBI 83.8%,
> hits and K's 0%). A selection on that variable is not a hypothetical.
>
> **Every Series B figure carries both labels.** Series A has all four fields plus a true
> close and can be checked properly — which is the third reason the vintages are never pooled.

`batter_home_runs` is absent entirely, by construction: quoted one-sided, `fair` null on 100%
of rows.

### 3. AN INTERCEPT IS MANDATORY — unconditional drift is collinear with the model gap on outs

Measured unconditional movement by rung (signed, pp):

| market | rung | n | median move | % up |
|---|---|---|---|---|
| `batter_hits` | 0.5 | 1187 | +0.05 | 51% |
| `batter_hits_runs_rbis` | 1.5 | 762 | +0.16 | 54% |
| `batter_total_bases` | 1.5 | 782 | +0.21 | 54% |
| **`pitcher_outs`** | 15.5 | 38 | **−1.01** | **32%** |
| **`pitcher_outs`** | 17.5 | 45 | **−0.66** | **29%** |
| **`pitcher_strikeouts`** | 3.5 | 35 | **−0.63** | **31%** |

Batter markets drift ~0. **`pitcher_outs` drifts systematically DOWN** — and the model's outs
gap is **one-signed on 100% of rows** (0 of 38 above market). A constant downward drift is
therefore nearly collinear with `sign(pModel − open_fair)` on that market, and **a regression
through the origin would attribute pure drift to the model.**

> **Fit `move = α + β·(pModel − open_fair)` with the intercept free, per market × rung, and
> report α alongside β.** The slope is identified only by *magnitude* variation in the gap,
> not its sign. **If α is significant and β is not, the market is drifting for reasons that
> have nothing to do with the model** — which on the positive control would otherwise read as
> the very edge the control exists to rule out.

This is recorded before the numbers exist, like the other branches.

## RUNG IS A DIMENSION, NOT A DETAIL — bucket Series A by ladder rung

**The H+R+RBI error is +11.5 pp at O0.5 and −1.4 pp at O1.5 — opposite signs inside one
market.** A market-level movement slope averages those toward zero and reports a well-behaved
market. That is the same pooling failure that has now produced three false readings in this
phase (side-selected signs, chain-position counts, probability-rank truncation), and here it
would hide the defect the ledger had to discover by losing money.

**Series A reports `slope × (market, rung)` wherever a market has alternate lines** — H+R+RBI,
TB, K's, outs, hits — each with its own `n`. The market-level number is reported *after* the
rung table and is explicitly secondary.

> ### PRE-COMMITTED INTERPRETATION — rung dimension
> - **rungs agree in sign and magnitude** → level effect. The pooled market slope is
>   interpretable and is the number to read.
> - **rungs have OPPOSITE-SIGNED slopes** → **distributional defect, and the pooled number for
>   that market is UNINTERPRETABLE.** Do not report it, do not average it, do not include that
>   market in any cross-market aggregate. Report the rungs.
> - **rungs agree in sign but differ ≥2× in magnitude** → partial dispersion error; pooled
>   number is reported with the ratio beside it.
>
> Committed before the data exists. `docs/hrr-recalibration.md` already shows what the second
> branch looks like when it fires: market λ drift +0.474 against a closed-form model drift of
> **+0.001**.

### The identification diagnostic ships WITH the first report, not after

A β whose SE nobody looked at is the exact shape of the `significant: true` at n=5 defect —
a number that reads as a result because nothing beside it says otherwise. So the first Series
A report carries, **per (market × rung) cell**:

| column | why |
|---|---|
| n | the cell's size |
| **spread of the regressor** (`pModel − open_fair`: p10/p90, SD) | β is identified only by *variance* in the gap; a cell where every row sits at a similar gap cannot identify it at any n |
| **corr(regressor, constant) after centring** | measures the collinearity the `pitcher_outs` one-signed drift creates |
| α and its SE | unconditional drift, which on outs is nearly collinear with the gap's sign |
| β and its SE | the slope |
| **`identified: yes/no`** | an explicit verdict |

> **A cell that cannot identify β reports "cannot identify" — not a number.** Same rule as
> the rung minimum below: a figure that will be quoted must not be produced when the data
> cannot support it.

**Minimum n per rung before a rung slope is read: 30.** Below that the rung is listed with its
count and no slope, rather than a slope with a wide interval that will be quoted anyway.

**This is plausibly the most valuable thing Phase 2 produces.** It is exactly the shape the
ledger caught on H+R+RBI *after* it cost money — model too high at the near rung, fine or low
at the far one — and the rung dimension catches it before a stake is placed.

## POPULATION STAMPS — H+R+RBI is already split, and it is not the only one

`CAL_START` taught this once: a cutoff mid-window splits a population silently, and the split
is invisible unless it is stamped on the rows. Three splits already exist in the H+R+RBI
record and **Series A must carry a stamp per row for each**:

| date | event | effect on H+R+RBI rows |
|---|---|---|
| **2026-07-22** | PA-conditioning re-basing shipped (`lam *= clamp(expAB/abG, .85, 1.15)`) | median **+4.8 pp** on O0.5, **+4.7 pp** on O1.5 — pre- and post- rows are different models |
| 2026-07-24 | `hrrAltMax = 0.5` suspension | O1.5+ rows stop being ticketed (board rows continue to accrue) |
| 2026-07-25 | `CAL_START` | the calibration counter resets |

**Rule: never pool H+R+RBI rows across 2026-07-22.** The measured +4.8 pp shift is larger
than most of the effects Phase 2 is trying to detect, so pooling would swamp the slope with a
step change. Report H+R+RBI as two vintages — as `props-history` Series A and B already are —
and if the post-07-22 vintage is too thin to fit, say so rather than pooling.

**The general form of the rule, since this is the second time:** any dated change to a
pricing term creates a vintage boundary in every market it touches. Stamp the row with the
engine commit that priced it; `docs/harness-substitutions.md` records the commit-stamp
obligation for persisted summaries, and this is the same obligation one level down.

## The problem it solves

Outcome-grading is a weak instrument: detecting a 2pp model bias from win/loss needs
~2,400 graded legs. Measuring bias against the **closing consensus** instead reaches
significance at 20–50 legs, because the close is a far lower-variance target than a coin
flip. That is the ~100× sample-efficiency claim, and it stands on its own.

What it is *not*: a claim that voided rows are free extra sample. That was examined and is
unconfirmed — a scratched player is exactly when the book pulls the market, so the rows
that void and the rows that lose their close overlap by construction. **No multiplier is
assumed.**

## Two vintages, NEVER pooled

A pooled number that is silently an average of two de-vig methods is the `CAL_START`
problem in a new variable.

| | **Series A — primary** | **Series B — secondary** |
|---|---|---|
| dates | **2026-07-27 →** | 2026-07-12 → 2026-07-26 |
| close fair | **multi-book Shin**, recomputed per book from `fp` | **proportional**, the stored `fair` |
| matches the engine? | **yes** — same `shShin2`, same weighted median | no |
| method stamp | `devig: "shin"` | `devig: "proportional"` |

Both are computed and stored; neither is ever averaged into the other. **If they agree, the
bias estimate is robust to de-vig choice. If they disagree, that disagreement is itself a
measurement — how much the de-vig method moves the answer — which nothing else in the
system can produce.**

Series B also supports a **Caesars-only Shin** variant via the stored `cz` pair
(two-sided rows only), which is a third method stamp and a useful cross-check on the
proportional series without waiting for Series A to accrue.

## What Series A computes

For each archived prop row, per snapshot:

1. **Close** = the last snapshot strictly before that game's first pitch (the existing
   convention).
2. **Close fair** = weighted median over `fp` of `shShin2(imp(o), imp(u))` per book,
   using the engine's own `SH_BOOKW` weights (`pinnacle` 3, `betfair_ex_eu` 2,
   `matchbook` 2, `betonlineag` 1.5, else 1). Same function, same aggregation — that is
   what makes it comparable to the model's own number.
3. **Model p** = the prediction store's `p` for the same `gkey|lkey|sub`.
4. **Bias** = `p − closeFair`, in probability points, signed.

Aggregated on the **EV axis already built** (`EV_EDGES`, `EV_GATE` on an edge), so the
bet population and the passed-over population never share a bucket — the same shape
`fitByEv` uses for outcome-grading, deliberately, so Phase 2 swaps the grading input
rather than rebuilding the bucketing.

## Fields it depends on, and where they come from

| field | source | available from |
|---|---|---|
| `fp` (per-book o/u) | `props-history` archive | **2026-07-27** |
| `fair`, `n`, `cz`, `czf`, `bo`, `bu`, `no` | same | 07-12 / 07-25 / 07-26 respectively |
| model `p`, `pMkt`, `ev`, `lkey`, `gkey` | prediction store | `CAL_START` = 07-25 |
| first pitch | `gameInfo[gkey].start`, in the prediction blob's `games` | 07-26 |

## Does board-wide close-grading depend on the sync phrase? **NO for the close; YES for the model side**

Stated explicitly because it decides who can run it:

- **The close half needs no phrase.** `props-history` is a GitHub Actions archive on the
  `line-history` branch, readable by anyone with the repo. `fp`, `fair`, `cz` are all
  there. Computing a close fair for every board row is entirely unauthenticated.
- **The model half does.** Model `p` lives in the prediction store behind
  `/api/predictions`, which is sync-phrase gated. Joining close→model therefore runs with
  the owner's key.

**Consequence for design:** the close-fair series can be built, archived and validated
independently — as a `line-history` artifact, like the HR overround reading — and the join
runs only when the owner executes it. That keeps the expensive, verifiable half public and
reproducible, and confines the gated step to a single join.

## What the panel shows

Report-only. Under Stats → Calibration, beside the existing CLV panel:

- bias in probability points by EV bucket, **signed**, with `n` and SE per bucket
- **Series A and Series B side by side, never merged**, each labelled with its de-vig stamp
- the `GAP_BUCKET_MIN_N` rule applied identically: below it, a bucket reads "unread", never
  "no bias"
- the join rate — how many board rows found a close — because a silently low join rate
  would look like a clean measurement

## What the freeze-exit read looks like

1. Series A bias by EV bucket, model-high and model-low separately.
2. Series A vs Series B on the overlapping metric — agreement means the estimate is
   de-vig-robust; disagreement is quantified and reported as its own number.
3. The bucket straddling `EV_GATE` is the winner's-curse estimate, and feeds
   `evGapShrink` — Phase 3's guessed shrink becomes measured.
4. Only then, exit condition 3 is drafted against real power, and signed or not.

## What stays unsigned

Exit condition 3 (*"a market reaches 95% power on a 2pp effect via model-vs-close"*) stays
unsigned until this instrument reports. Its 20–50-leg figure is a textbook number, not one
measured on this data, and the clustered-SE question (`tools/icc.py`, reporting ~2026-07-31
at game level and ~2026-08-15 at day level) applies to it exactly as it applies to the
H+R+RBI amendment.

---

# PHASE 2 — THE CRITICAL PATH (2026-07-27)

## Where it actually stands

| piece | state |
|---|---|
| Series B (the 07-12 → 07-26 vintage, proportional de-vig) | ✅ **built** — `tools/phase2_series_b.py`, 3,637 of 6,535 open rows joining (56%), attrition compared, two caveats recorded |
| the cadence question | ✅ **resolved** — Actions API, workflow `311636390`: `0 17` starts ~20:20Z (+3.3 h), `45 22` ~07:30Z next day (+8.75 h). Not a mystery, a queue |
| close capture | ✅ **built** — `tools/snapshot_props.py` decides `kind: "close" \| "pre"` from the slate, 10 crons so some firing lands in the window |
| **`fp` (per-book prices) and `kind` in the archive** | ⚠️ **not one snapshot yet.** The 2026-07-26 file has two snapshots, `kind: null` on both, and no `fp` on any row — both were written by the pre-self-pacing script. **Today's sweep is the first** |
| Series A reader | ❌ **not built** |
| the identification diagnostic | ❌ **not built** (agreed to ship *with* Series A's first report, not after) |
| rung bucketing | ⚠️ **designed, not ported** — Series B buckets by `(market, line)`; Series A inherits the design but the file does not exist |

## What remains to build for Series A

1. **`tools/phase2_series_a.py`** — Series B's structure with three differences: de-vig each
   snapshot's `fp` with **Shin** (the engine's own method) rather than proportional; select the
   `kind: "close"` snapshot as the close instead of taking the last one; carry `bo`/`bu`/`czf`,
   which exist in this vintage and did not in B's. **The two vintages are never pooled.**
2. **Rung bucketing** — ported from B, not re-derived. Non-negotiable: H+R+RBI is +11.5 pp at
   O0.5 and −1.4 pp at O1.5, and a market-level number that averages those two says nothing.
3. **The intercept** — mandatory, and pre-committed. Rung drift is nearly collinear with a
   one-signed gap in `pitcher_outs` (outs 15.5 moved −1.01 with 32% up; outs 17.5 −0.66 with
   29% up), so a no-intercept fit would attribute pure drift to the model.
4. **The identification diagnostic**, shipping in the first report: how much of the fitted
   slope survives when the intercept absorbs rung drift, and what the gap/drift collinearity is
   per rung. Without it a slope near zero is unreadable.
5. **The rung sign-flip test from `docs/harness-substitutions.md`** — H+R+RBI's
   `(pModel − open_fair)` must change sign between O0.5 and O1.5 for the ladder finding to
   survive. It is **not** in the build as specced; it is one extra column on the per-rung table
   (the gap's sign and its CI), so it goes in with #2 rather than later.

## The sync phrase: what it blocks, and exactly when

**Confirmed.** Everything accrues and computes publicly except one join:

| half | source | key needed? |
|---|---|---|
| open/close prices, Shin de-vig, movement, rung buckets, attrition, the close-existence check | `data/props/*.json` on the **public** `line-history` branch | **no** |
| `pModel` per `(date, market, player, line)` | `/api/predictions?date=` | **YES — sync phrase** |

`/api/predictions` GET is gated by `syncAuthed`. Nothing else in Phase 2 is.

**When it becomes the blocker: at the first rung-level slope fit, not before.** The headline is
`move ~ (pModel − open_fair)`, which does not exist without `pModel` — but every validation
step ahead of it does, and those are what the first days are for. Concretely, from Series B's
observed per-day rung volumes:

| rung | Series B rows/day | reaches `MIN_RUNG_N = 30` |
|---|---|---|
| `batter_hits` 0.5 | ~91 | **first close-day** |
| `batter_total_bases` 1.5 | ~60 | first close-day |
| `batter_hits_runs_rbis` 1.5 | ~59 | first close-day |
| `pitcher_outs` 15.5 / 17.5 | ~3 each | **~2026-08-06** |
| `pitcher_strikeouts` 3.5 | ~2.7 | ~2026-08-08 |

So: **act on the key around 2026-07-29**, once two close-days exist and the fat rungs are
already past `MIN_RUNG_N`. Before that there is nothing for it to unblock; after that the
project is idling on it. The thin rungs — which include `pitcher_outs`, the positive control —
are not readable until **~2026-08-06** whatever happens with the key.

## Earliest dates

| | date | what it is |
|---|---|---|
| first `fp` + `kind:"close"` rows | **2026-07-27** (tonight's sweep) | verify by re-reading `data/props/2026-07-27.json` for `kind` and `fp` |
| first mechanical Series A output | **2026-07-28** | one day: attrition, close-existence, movement distribution. **No slope** |
| **first rung-level slope** — the real first report | **~2026-07-29** | fat rungs only, and **this is where the sync phrase binds** |
| `pitcher_outs` readable — the positive control | **~2026-08-06** | ~3 rows/day at 15.5 and 17.5 |
| the ladder sign-flip test on H+R+RBI | **~2026-07-29** | O1.5 is a fat rung; O0.5 needs its own volume check on the first close-day |

**The one thing that can move all of these earlier or later is close CAPTURE RATE**, not row
volume — a day whose ten crons all miss the ~95-minute window yields a `pre` reading and no
close. That is the number to watch first, and it is readable tomorrow.

---

# SERIES B's DAY-LEVEL VOLUME — diagnosed 2026-07-27, and the answer inverts the worry

The suspicion was that 14 rows on 07-14 and 210 on 07-16 against 3,259 on 07-20 meant the
archive had failed on those days, which would make Series B selected on
days-the-archive-worked — a selection nobody had bounded. **It is not that.**

| day | events in snapshot 1 | **MLB slate** | verdict |
|---|---|---|---|
| 2026-07-14 | 1 | **1** | All-Star break — captured 1 of 1 |
| 2026-07-16 | 1 | **1** | break day — 1 of 1 |
| 2026-07-23 | 5 | **5** | 5 of 5 |
| every other day | 13–15 | 15–17 | |

**The snapshot ran on all 13 days and captured every game on the slate in its first reading.**
The near-empty days are near-empty slates. **There is no day-level archive selection, and that
caveat is disconfirmed rather than added.**

## But a much sharper selection is in the SECOND reading, and nobody had it either

The second snapshot fires ~20:08–20:55 UTC. Games that have already started are gone from the
odds API, so the "close" half keeps only games that had not started yet:

| | n | median first pitch (UTC) | p10 | p90 |
|---|---|---|---|---|
| **KEPT** into snapshot 2 | 88 | **22.68** | 0.10 | 23.27 |
| **DROPPED** | 65 | **18.18** | 17.18 | 20.13 |

**4.5 hours apart.** And the structure is day-of-week, because that is what sets first pitch:

| | games surviving into snapshot 2 |
|---|---|
| Mon | 15/15 = **100%** |
| Tue | 15/16 = 94% |
| Fri | 27/29 = 93% |
| Sat | 19/28 = 68% |
| Thu | 3/6 = 50% |
| Wed | 6/14 = 43% |
| **Sun** | **3/45 = 6.7%** |

**2026-07-19 kept 0 of 15** — that Sunday contributes nothing at all to Series B's movement
set. 07-12 kept 2 of 15; 07-26 kept 1 of 15.

> **Series B's movement population is night games.** The "56% of open rows join" figure is not
> 56% of a representative sample — it is *"we kept the ones that started late"*, and **Sunday is
> effectively absent**. Wednesday day games are half gone.

## What that costs Series B — two caveats, but the second one is bigger than stated

| caveat | status |
|---|---|
| **no true close** — the later reading is T-2.5 h or earlier, so any slope is attenuated toward 0 | unchanged |
| ~~day-level archive selection~~ | **disconfirmed** — the archive captured every game every day |
| **row attrition** | **restated and worse than "44%":** the surviving set is selected on **first-pitch time**, not missing at random. Sunday 6.7%, Wednesday 43%, Monday 100% |
| `bo`/`bu`/`czf` postdate the vintage | unchanged |

So the count is **still two substantive caveats**, not three — but "attrition" has to be
described as a **start-time selection** rather than a rate. A per-day-of-week breakdown is
mandatory in any Series B reading; a pooled Series B number is a number about night games.

## The new cadence is aimed exactly at this, which is checkable

The ten-cron schedule plus `_snapshot_kind`'s 95-minute window means a Sunday's close is taken
by the **17:00 UTC** firing, before the 17:35 bulk starts — which is the hole above. So:

**Series A's first Sunday (2026-08-02) is the test.** If the Sunday keep rate goes from 6.7% to
near 100%, the retime fixed the selection and Series A is not merely un-attenuated but
un-selected. If it does not, the two series share the defect and neither supports a pooled
movement claim. `tools/close_capture.py --dir data/props` reports it per day.

## WHICH EXISTING NUMBERS ARE NIGHT-GAME STATISTICS — measured, not inferred (2026-07-27)

The second-reading population is selected on first-pitch time (Sunday 6.7%, Wednesday 43%,
median first pitch 22.68 UTC kept vs 18.18 dropped). That does **not** make every archive-derived
number a night-game statistic — only the ones whose value correlates with start time. So each
was **recomputed on both populations** rather than reasoned about from provenance.

| statistic | population | night-game selected? |
|---|---|---|
| **Caesars overround 1.071** | `data/props`, rows with two Caesars sides | **NO.** Snapshot 1 vs snapshot 2: H+R+RBI **1.0713 / 1.0713**, TB 1.0708 / 1.0709, outs 1.0717 / 1.0725 (n=152). Invariant to three decimal places — a book's margin policy does not depend on first pitch |
| **movement percentiles behind `lockMaxAgeMin`** | `line-history` **game lines** (`data/*.json`), 4–5 snapshots/day 06:00–22:00 UTC | **NO.** Pair coverage is flat across first-pitch hour: mean readings 2.2–3.3, mean span 4.2–9.6 h, ≥6 h span 33–65% with no start-time gradient (hour 17 is 65%, hour 23 is 52%). A denser cadence starting at 06:00 reaches early games before they start |
| **0.26 pp w-recovery error** (range detector) | a live board's `propBoard` | **NO.** Not from the props archive at all |
| **consensus depth / `czf`** — "the de-vigged consensus behind a prop row is often thin" | `data/props` | **YES — relabelled.** Snapshot 1: mean `n` **1.40**, `czf` **2.2%**. Snapshot 2: mean `n` **1.66**, `czf` **0.3%** |

### The one that moves, and which way

**The later reading is DEEPER, not thinner** — 1.66 books vs 1.40, and `czf` (settlement book
inside its own consensus) falls 2.2% → 0.3%. So a thinness figure computed on the second reading
**understates** the problem:

> **The "consensus is often thin" finding is CONSERVATIVE, not overstated.** Measured on the
> whole-slate population the consensus is thinner and the settlement book is inside its own
> consensus **seven times more often**. Relabelled with its population, not retracted — and the
> direction means no decision built on it needs revisiting, because every one of them was made
> against the *smaller* version of the problem.

**Three of four cleared, one relabelled with a direction.** That is the point of measuring
instead of relabelling everything: a selection that exists does not bias every statistic drawn
through it, and blanket caveats destroy information as surely as missing ones do.

**This is the third time selection has produced a mislabelled number** (`categories`' probability
rank, the winner's-curse availability term, and now start time). The pattern is stable enough to
state as a habit: **when a population turns out to be selected, recompute the statistics on both
sides of the selection rather than caveating them** — most will be invariant, and the ones that
are not tell you which direction they were wrong in.

## RUNG DIMENSION — TWO MARKETS, NOT ONE (2026-07-27)

The rung bucketing was specced for H+R+RBI. **`batter_total_bases` is added explicitly**, and
its branch is pre-committed alongside HRR's in `docs/hrr-recalibration.md`.

| market | measured defect | predicted `(pModel − open_fair)` sign, low rung → high rung |
|---|---|---|
| `batter_hits_runs_rbis` | under-dispersed (single λ) | **+ → −** |
| `batter_total_bases` | over-dispersed (ratio 2.30, n=108) | **− → +** |

**Both signatures must appear, in opposite directions, or the reading is not clean.** Five
branches, pre-committed in `docs/hrr-recalibration.md`. Two of them exist only because two
markets are read at once and are indistinguishable with one:

* **both flip the SAME way** → the *instrument* is at fault, not the markets. Without this
  branch, agreement would read as confirmation.
* **both flip OPPOSITE to prediction** → the instrument is *sound* and both dispersion
  measurements are **sign-inverted**. Back to source, not retracted. Without this branch it
  would be misfiled as "neither flipped" and thrown away.

This costs one extra column on the per-rung table (the gap's sign and its CI) and no extra data:
TB carries alternate lines, so its rungs are already in the bucketing.

## CLOSE QUALITY IS A ROW STAMP, AND PHASE 2 NEVER POOLS ACROSS IT (2026-07-27)

Until `/api/propsnap` has a cron-job.org entry, Saturday and Sunday yield `pre` readings while
Mon/Tue/Fri yield true closes — a **day-of-week selection in close QUALITY**, on slates that
already differ (early-heavy, different game mix, different liquidity). Same rule as Series A vs B:
**never pooled**, and for the same reason.

### The three qualities

| stamp | meaning |
|---|---|
| **`close`** | captured inside `CLOSE_WINDOW_S` (95 min) of the next unstarted first pitch |
| **`pre`** | a real reading, but hours out — **attenuates any slope toward zero** |
| **absent** | no capture. Not a zero, not a null: the row does not exist |

`snapshot_props.py` already writes `kind` per snapshot, and the fold-in carries `src` as well, so
the stamp is on the data rather than inferred from the date. **Every Phase 2 table is bucketed by
`kind`, and a pooled slope is not reported at all** when the buckets disagree — the same rule the
memo already applies to rungs.

### How much of the window this is — measured, not assumed

Expected close coverage from a single 20:30Z fire, against the 52-day first-pitch distribution:

| dow | games | started before the fire | **true close reachable** | read |
|---|---|---|---|---|
| Mon | 67 | 1% | **99%** | true close |
| Tue | 92 | 2% | **98%** | true close |
| Fri | 117 | 4% | **96%** | true close |
| **Wed** | 92 | 35% | **65%** | night block only |
| **Thu** | 54 | 44% | **56%** | night block only |
| **Sat** | 121 | 51% | **49%** | night block only |
| **Sun** | 121 | 93% | **7%** | `pre` only |
| **POOLED** | 664 | | **64%** | |

> ### ⚠️ "Mon–Fri = true close" IS WRONG, and that was my framing
> Only **Mon/Tue/Fri** are near-total. **Wed and Thu lose their matinee block** exactly as the
> weekend does — 35% and 44% of their games have already started when the fire lands. So the
> gap is not "2 of 7 days ≈ 29%"; it is **36% of all games**, spread across four days.
>
> **And 0% is lost to the 300-minute wait cap.** The cap never binds on any day. Every loss is a
> game that had already started before the fire — so the constraint is the FIRE TIME, not the
> wait. An earlier batch would fix it; there isn't one, which is what `/api/propsnap` is for.

**With the Sat/Sun entry, coverage goes 64% → ~90%. With Wed/Thu as well, ~99%.** Both are one
cron-job.org entry each and no new secret.

## THE EVIDENCE BASE IS NIGHT GAMES UNTIL THE `/api/propsnap` ENTRY LANDS

Phase 2 is the entire evidence base for the parameter exit. **64% of games reach a true close**
from the single 20:30Z fire — so more than a third of the only channel with anything in it
carries an attenuated reading, and **it is not spread evenly**.

| | |
|---|---|
| what is missing | the **matinee block** on Wed/Thu/Sat and nearly all of Sunday |
| what that population is | **day games** — different lineups, different bullpen state, different liquidity |
| why it matters | 36% attenuation spread evenly is a **precision** problem. Concentrated on day games it is a **selection** |

> **This is the THIRD time start-time selection has shaped a measurement in this project.**
> First: Series B's second reading kept only games that had not started (Sunday 3/45 = 6.7%).
> Second: the `luCoverage` denominators, where "started" games silently changed what a ratio was
> over. Third: this. The pattern is now reliable enough to check for by default — **whenever a
> capture happens at a clock time and the population has start times, ask which games were gone
> before the capture ran.**

### What the entry recovers, and when

| coverage | pooled true close |
|---|---|
| today — one 20:30Z fire | **64%** |
| **+ `0 16 * * 0,6`** (Sat/Sun) | **~90%** |
| **+ `0 15 * * 3,4`** (Wed/Thu matinees) | **~99%** |

**Phase 2's usable window starts when the entry lands, not tonight.** Rows captured before then
are real and kept — but they are a night-game sample, stamped as such, and the slope fit over
them is a *different population* from the one that follows. Same rule as Series A vs B: **the
vintages are labelled and never pooled.**

### Every Phase 2 output carries two splits, not one

1. **by close quality** — `close` / `pre` (already stamped per snapshot by `kind`);
2. **by day game vs night game** — first pitch before/after 21:00 UTC.

**The second is the one that matters.** The first measures attenuation, which shrinks a slope
toward zero and is a known, statable bias. The second measures *which games are in the sample at
all*, and no amount of care with the first fixes it. **A pooled slope is not reported while the
day-game bucket is under-covered** — the memo's existing rung rule, applied to a second axis.

## CLOSE QUALITY IS NOW COMPUTED, NOT ASSERTED (2026-07-27)

`/api/propsnap`'s first version wrote `kind: "close"` unconditionally. A 16:00Z fire against a
20:10Z first pitch — **four hours out** — would have entered Phase 2's close bucket labelled as
a close.

> **A mislabelled close is worse than a missing one.** A missing close leaves a hole that
> `tools/close_capture.py` reports. A mislabelled one enters the bucket that is supposed to be
> clean and attenuates the slope **from inside it**, where no split by `kind` can find it —
> because it is on the right side of the split.

Both capture routes now derive `kind` from the slate:

| route | rule |
|---|---|
| `tools/snapshot_props.py` | `_snapshot_kind` — `close` only when the next unstarted first pitch is within `CLOSE_WINDOW_S` (95 min), at most one per 40 min |
| `app/api/propsnap` | the same 95-minute span, computed from `min(event.start) − now` |

**Vintage note:** no row with an *asserted* `kind` was ever written — the route had not been
deployed when the defect was found, and `snapshot_props.py` has computed `kind` from the slate
since it was introduced. **There is no contaminated vintage to exclude.** Recorded because the
absence of one is itself the fact worth having on the record, and because the next person to add
a capture route needs to know this is a computed field, not a caller-supplied one.
