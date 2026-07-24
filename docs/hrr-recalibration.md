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
Raise `hrrAltMax` (or delete it) when, over a rolling window of ≥100 graded H+R+RBI
legs that include O1.5+ lines priced by the PA-conditioned model, the market's
reliability slope sits inside [0.85, 1.15] and the O1.5+ subset's realized hit rate is
within the Wilson 95% CI of prediction. The calibration panel (Stats → 📐) carries the
live slope and n.
