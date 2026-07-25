# H+R+RBI recalibration audit (fix-file Phase 2, 2026-07-24)

## Why this market is suspended above O0.5
Graded ledger, 2026-07-17 → 07-22: H+R+RBI legs hit **46.3% vs 59.2% implied** overall,
and **32% on O1.5+ alternate lines** specifically. Reliability slope (nightly calibration,
n=273): **1.74** — noisy, but the ledger's O1.5+ subset is where the dollars actually
bled. O0.5 went 12/19 (63%) and stays active, tagged **watch**.

`SH_CFG.hrrAltMax = 0.5` suspends every H+R+RBI line above O0.5 from all auto-built
tickets in both disciplined selection modes, and Phase 2 renders those rows greyed with
"Suspended — sim recalibration" on the Board; The Sharp and the manual slip exclude them
outright. The suspension retires by raising/removing `hrrAltMax` once the market's
calibration earns it back.

## What the audit found (the fix file's three questions)

**(a) Lineup slot / projected plate appearances — THE defect, confirmed.**
Two pricing paths exist:
- **Simulation path** (pregame game with a confirmed lineup): per-PA lineup simulation —
  every batter bats in his actual slot, so PA volume is conditioned correctly. No defect.
- **Closed-form path** (no sim available): the λ for H+R+RBI was the player's blended
  **per-game** rate (`shBlendN(..., "g", 3)`) shrunk toward league, times park and
  starter-quality factors — and **nothing about tonight's batting-order slot**. Hits, TB
  and HR all scale by `expAB` (slot-implied ABs, `pa = 4.68 − 0.11·(spot−1)` less walks);
  H+R+RBI did not. A #8 hitter (~3.7 PA) and a leadoff hitter (~4.7 PA) shared one
  probability model — exactly the overconfidence signature the ledger shows, and it binds
  hardest on O1.5+ where the tail matters (O0.5 ≈ P(X≥1) saturates and mostly survives
  the error).

  **Status: fixed 2026-07-22** (before this phase was formalized, under the owner's
  direct instruction): the closed-form λ is now re-based by `expAB / (last-30 AB per
  game)`, clamped ±15%, SH_V2-gated (parity-neutral when v2 is off), disclosed in the
  pick's case line ("H+R+RBI rate re-based to #7 spot PA"). The suspension stays until
  the graded record proves the fix.

**(b) Opposing starter quality and expected innings — partially conditioned.**
Starter quality: yes — the `power` factor (ERA/FIP 50-50 blend + WHIP, clamped
0.85–1.18) multiplies the λ, plus xERA-luck fade and pitch-count-efficiency factors.
Expected innings: **not explicitly** in the closed form — there is no hook-timing term;
the per-game historical rate implicitly averages over typical starter/bullpen splits.
The sim path models the hook explicitly (outs leash, pitch-efficiency λ adjustment,
bullpen chains). Residual gap accepted for the closed form; the sim is the primary path.

**(c) Park factors for the run/RBI components — partially conditioned.**
The closed form applies a Coors bump (×1.08) and the shared park×handedness factor
enters through the hit channel, but the **run/RBI components** have no dedicated
park-scoring term in the closed form. The sim path prices runs/RBI through actual
run-scoring dynamics in the simulated park environment. Residual gap accepted for the
closed form; documented here rather than papered over.

## Retirement criteria
Raise `hrrAltMax` when, over a rolling window of **≥100 graded H+R+RBI legs** that
include O1.5+ lines priced by the PA-conditioned model, the market's reliability slope
sits inside **[0.85, 1.15]** and the O1.5+ subset's realized hit rate is within the
**Wilson 95% CI** of prediction. Thresholds unchanged.

**Source: the BOARD SAMPLE (the prediction store), filtered `market =
batter_hits_runs_rbis`, `susp = true`, `ln ≥ 1.5`. Not the ledger — and that cannot
change.** The suspension means no O1.5+ leg is ever wagered, so the ledger can never
contain one. This population is **counterfactual by construction**: priced, printed and
graded against real box scores, but never executed — no fill, no CLV, no settlement.
That is what the staged return below exists to handle.

**The window opens at the Phase 0.6 deploy — 2026-07-25 — not at the 2026-07-22
PA-conditioning fix.** `susp` did not exist as a stored field until 0.6, so rows from
07-22 to the deploy carry no flag and a `susp = true` filter excludes them anyway. The
code's start date is the doc's start date; writing 07-22 here when the data begins 07-25
is precisely the failure this phase series exists to correct.

**The filter is self-cleaning — do not bolt a `CAL_START`-style cutoff onto it.** `susp`
is computed only in the disciplined selection modes (`dscpM` in `finalizeCats`), so a
legacy-mode row can never carry it. Any row written by a generator running the wrong
policy is excluded automatically by the same condition that selects the population.

The calibration panel (Stats → 📐) carries the live slope, but its per-market count is
**board rows** across all lines — it does not yet split O0.5 from O1.5+. The `ln`/`susp`
fields land in the graded set from 2026-07-25; until a split view exists, the panel's
H+R+RBI figures answer neither this criterion nor `collection-period.md` exit 1.

## Staged return
The criterion above fires on a counterfactual population: prices nobody took, with no
execution, no CLV and no settlement behind them. A model that predicts an unbet line
well has not been shown to produce a bettable edge at Caesars. So the suspension does
not simply lift:

1. **Stage 1 — `hrrAltMax` → 1.5 only.** O1.5 becomes eligible; O2.5+ stays suspended.
   Exposure is reduced: FUN-eligible, or core capped, at the owner's election at the time.
2. **Stage 2 — full reinstatement** requires **ledger confirmation on real graded O1.5+
   legs**: enough executed legs to satisfy the same slope and Wilson tests on bets that
   actually settled, with their CLV visible in the receipts.
3. **Stage 0 — the failure path.** If the real graded O1.5+ legs from Stage 1 come in
   below prediction — slope outside [0.85, 1.15], **or** realized hit rate below the
   Wilson 95% CI — `hrrAltMax` returns to **0.5**, and **the counterfactual criterion
   does not fire again on its own**. Re-entry then requires a **new model change**, not
   merely more board rows: the board sample already said yes once and the money said no,
   so more of the same evidence is not evidence.

Written 2026-07-24/25, while nothing is at stake, precisely so none of it — least of all
the failure path — is decided in the moment the criterion fires and the number looks
exciting.
