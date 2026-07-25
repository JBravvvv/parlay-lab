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

   ⚠️ **The margin is thin and the low end crosses over.** At 2.5 legs/day (a 20% FUN
   share) exit 1 fires 2026-09-23 — *after* exit 2 — which would make it decorative.
   The underlying rate (19 O0.5 legs over six days, 2026-07-17 → 07-22) is a six-day
   sample that included FUN, from before the ev_gated default and before the consensus
   gate; the FUN share of those legs was never measured and cannot be recovered from
   here. **Recheck this date once ~2 weeks of core-only O0.5 legs exist**, and if the
   realized rate is under ~2.6/day, exit 1 is decorative and exit 2 is the real clock.
2. **60 days elapsed** (≈ 2026-09-22).

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
| `regions` | `us,eu` | `us,eu` |
| `priors` · `ctx` | `!!` the fetched artifact | `!!` the same artifact |
| **`simN` / `simNHR`** | **50,000 / 50,000** (`SIM_PATHS`) | **10,000 / 20,000** |

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
