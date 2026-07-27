# Collection period — the freeze (hardening Phase 4, effective 2026-07-24)

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
| `coreEvMin` | `2` (percent) | core EV floor at the selection price |
| `coreCzEvMin` | `0` | settlement floor — never lock a core ticket negative-EV at Caesars (override-proof) |
| `consMinN` / `consMinEv` | `100` / `−1` (%) | markets under 100 graded legs also need consensus-fair EV ≥ −1% |
| `dailyBankrollCap` | `0.10` | CORE+FUN day exposure ≤ 10% of the managed bankroll, enforced at lock |

### Suspensions (until recalibration earns them back)
| parameter | value | meaning |
|---|---|---|
| `hrrAltMax` | `0.5` | H+R+RBI alternate lines above O0.5 suspended from all auto-selection |
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
| `maxCoreTickets` / `minCoreTickets` | `6` / `4` | core card size band |
| `perParlayCap` | `0.25` | max fraction of DAILY on one ticket |
| `funMaxTickets` / `funMaxLegs` | `1` / `4` | FUN: one ticket per day (supplementals count), max 4 legs |
| `FUN_DEFAULT` | `$5` | FUN daily default (day-scoped; field stays editable) |
| `funMinProb` | `0.1` (%) | FUN floor — worse than 1-in-1000 is a donation |
| `funTiers` | `800–2500 / 2500–10000 / 10000+` | BIG / MASSIVE / MOONSHOT (american odds) |

### Model blend & badges
| parameter | value | meaning |
|---|---|---|
| `SH_W` | `props .35 · ml .15 · rl .15` | model weight vs de-vigged consensus |
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

### AND I WAS WRONG THAT THE SLOPE GATES NOTHING

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

### CORRECTION 1 — my accrual projection was ~6× too fast

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

### CORRECTION 2 — the weekly adjuster has NEVER fired

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

### CORRECTION to my own booksInd count

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

# ⚠️ CORRECTION — shUmpKf IS NOT STRUCTURALLY INERT. THE WRITE PATH WAS ERASING ITS INPUT.

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
