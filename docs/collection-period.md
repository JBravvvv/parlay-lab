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
| **`penQFrozen`** | **`true`** | `shPenQF` pinned off for the collection period. Setting it was **provably a no-op** — the factor already returned 1 for every team (see KNOWN-INERT below). Makes "inert" a decision instead of an accident. |

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

#### The cost of the wider scope — measured

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
for any reason. **Setting the flag was provably a no-op** (nothing clears the 15-IP guard
today), which is what made it safe to ship mid-freeze — and the full board suite passed
unchanged, with only the two direct unit tests needing an explicit `penQFrozen: false`
to keep exercising the formula. Those tests were **not** rebaselined to `1`: that would
have deleted the only coverage the calculation has, and one of them would then have
passed for the wrong reason (the freeze guard rather than the 15-IP guard it is named for).

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
