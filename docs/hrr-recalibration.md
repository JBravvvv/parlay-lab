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

  > # ⛔ RETRACTED 2026-07-26 — "THE PA FIX RUNS THE WRONG WAY" WAS MY ERROR
  >
  > **There is no denominator mismatch. The correction term is algebraically correct and
  > must not be changed.** The owner approved a fix on this premise; the premise is wrong,
  > and the fix was not applied.
  >
  > ```
  > bn.r = shBlendN(st, H+R+RBI, "g", 3)   ->  HRR per game PLAYED
  > abG  = ab30 / g30                      ->  AB  per game PLAYED
  >
  > lam = (HRR/G) x expAB/(AB/G) = HRR x expAB / AB = (HRR/AB) x expAB
  > ```
  >
  > **Both terms are per-game-played and they cancel.** The correction converts a per-game
  > rate into a **per-AB** rate and rescales it to tonight's expected ABs — which is exactly
  > the right operation, and is the same shape `batter_hits`, `batter_total_bases` and
  > `batter_home_runs` already use explicitly (`lam = rate * expAB * ...`). H+R+RBI is the
  > one market whose base rate is per-game rather than per-AB, which is *why* it needs the
  > conversion at all.
  >
  > **How I got it wrong:** I inferred a units bug from the *sign* of the factor (upward on
  > 86% of rows) without ever checking the algebra. The factor is upward because `expAB` (ABs
  > in a game he starts) genuinely exceeds `abG` (ABs averaged over every game he appeared
  > in, including partial appearances) — **which is the correction doing its job**, not
  > evidence against it. This is the fourth methodology rule turned on its own author:
  > a directional reading was treated as a mechanism without a mechanism being checked.
  >
  > ### What the measurement actually shows, kept because it is real
  >
  > Raw `expAB/abG` before the clamp, 44 rows recovered from the board's own `case` string:
  >
  > | | min | p25 | median | p75 | max |
  > |---|---|---|---|---|---|
  > | raw ratio | 0.789 | 1.028 | **1.144** | 1.393 | **1.773** |
  >
  > | | count |
  > |---|---|
  > | **above the 1.15 cap** | **21 of 44** |
  > | inside the clamp | 22 of 44 |
  > | below the 0.85 floor | 1 of 44 |
  >
  > | lineup status | n | median `expAB` | median `abG` | median ratio |
  > |---|---|---|---|---|
  > | projected | 10 | 4.10 | 3.10 | **1.379** |
  > | posted spot | 34 | 3.80 | 3.40 | 1.118 |
  >
  > **The finding that survives is the opposite of the one I reported: the clamp is
  > TRUNCATING an algebraically-correct correction on 21 of 44 rows.** The model applies
  > *less* re-basing than its own logic implies — and since the truncated correction is
  > upward, the truncation is **conservative**, which is the safe direction for a market
  > with H+R+RBI's history. No change proposed.
  >
  > The one place worth watching: **projected-lineup rows carry a raw 1.379 uplift built on
  > an assumption** (`pa = 4.45` for a `projStar`) rather than a read slot. The clamp caps it
  > at 1.15. That is the correct conservative behaviour, and it is another reason the clamp
  > should not be widened.
  >
  > ## THE CLAMP IS NOT THE RESIDUAL — IT IS THE THING PROTECTING AGAINST IT
  >
  > The clamp was nominated as the leading candidate for the H+R+RBI residual. **Measured, it
  > runs the wrong way for that role: unclamping makes the model MORE overconfident, on
  > exactly the lines that bled.** Model-minus-market (over-oriented, board 2026-07-26):
  >
  > | line | n | gap @ 1.15 (today) | gap @ 1.40 | gap unclamped | **Δ 1.15 → ∞** |
  > |---|---|---|---|---|---|
  > | O0.5 | 28 | **+11.5** | +14.7 | +15.7 | **+4.2** |
  > | O1.5 | 13 | **−1.4** | +8.1 | +9.7 | **+11.1** |
  > | O2.5 | 3 | −4.2 | −4.2 | −4.2 | +0.0 |
  > | **O1.5+** | 16 | **−2.5** | +5.3 | +9.3 | **+11.8** |
  >
  > The 2026-07 miss was **the model too HIGH** (46.3% realised vs 59.2% implied). Widening
  > the clamp to 1.40 would add **+11.8 pp** of model-over-market to O1.5+ — the suspended
  > lines, the ones that took the money. **The clamp is currently the single largest thing
  > holding H+R+RBI down, and removing it would widen the miss rather than explain it.**
  >
  > ### Where the truncation binds — and the owner's hypothesis (b) is CONFIRMED
  >
  > | slot | n | median raw | max raw | rows > 1.15 |
  > |---|---|---|---|---|
  > | projected | 10 | 1.379 | 1.696 | **7** |
  > | #1 | 4 | 1.074 | 1.150 | 0 |
  > | #2–#5 | 12 | 1.026–1.138 | 1.265 | 1 |
  > | #6 | 3 | 1.320 | 1.393 | 2 |
  > | **#7** | 3 | **1.393** | **1.773** | **3 of 3** |
  > | **#8** | 9 | **1.348** | 1.542 | **6 of 9** |
  > | #9 | 3 | 1.172 | 1.391 | 2 |
  >
  > **It binds hardest exactly where PA conditioning matters most** — bottom-of-order and
  > projected rows, essentially never at #1–#5. (The max is **#7 Taylor Trammell at 1.773**,
  > not a leadoff hitter; top-of-order rows barely clamp at all.)
  >
  > But "defeating the fix in its highest-value cases" does not follow, because the correction
  > *there* is upward. The original audit's concern was that the closed form **overrated
  > bottom-of-order alt lines**; the re-basing as built **raises** them (median 1.35 at #8),
  > and only the clamp holds that to +15%.
  >
  > ### The candidate this leaves — labelled as inference, not measurement
  >
  > The algebra is right (`(HRR/AB) × expAB`), but `expAB` is **ABs in a full start**. For a
  > player whose `abG` is low *because he is regularly pinch-hit for or lifted*, the
  > correction imports a full-start assumption for tonight. That is strongest for exactly the
  > #7/#8/projected rows above. **Whether tonight is a full start is not knowable from the
  > board**, so this is a hypothesis about `expAB`'s applicability, not a measured defect —
  > and it is the better candidate for the residual than the clamp.
  >
  > **Nothing changes. The clamp stays at [0.85, 1.15] and should NOT be widened.** Recorded
  > as a specified freeze-exit item to be decided alongside the leg-equivalent floor and
  > `consMinEv` — all three touch the same card.
  >
  > ## THE FULL-START CANDIDATE FAILS ITS FIRST TEST
  >
  > The `expAB` full-start inference predicts the miss concentrates in batters who are
  > regularly lifted — low `abG`. **Measured on the board, it does not** (`tools/hrr_ladder_audit.py`):
  >
  > | `abG` band | n | median model−market gap | median `abG` |
  > |---|---|---|---|
  > | **< 3.0** (part-timer) | 20 | **+9.9 pp** | 2.70 |
  > | 3.0–3.5 | 6 | +14.2 pp | 3.40 |
  > | 3.5–4.0 | 11 | +6.8 pp | 3.60 |
  > | **≥ 4.0** (everyday) | 7 | **+15.2 pp** | 4.10 |
  >
  > Restricted to O0.5 to remove the line-mix confound: part-timer **+11.1**, 3.0–3.5 +14.2,
  > 3.5–4.0 **+8.0** — no monotone pattern, and if anything the gap is *larger* for everyday
  > batters. **The candidate is not supported and is demoted.** It is not eliminated — the
  > graded-leg version of this test still needs the ledger — but it no longer leads.
  >
  > ## THE LEAD IS NOW DISTRIBUTIONAL: ONE POISSON CANNOT PRICE THE LADDER
  >
  > The direction finding is the tell — the model is **+11.5 pp HIGH at O0.5** and **−1.4 pp
  > LOW at O1.5**. That is not a level error in either direction; it is the wrong
  > distribution shape. Testing it directly: a single Poisson has **one** λ, so if the
  > market's implied λ *changes* across rungs for the same player, no Poisson can fit both.
  >
  > Five players are quoted at both O0.5 and O1.5 on this board:
  >
  > | | λ @ O0.5 | λ @ O1.5 | **Δ** |
  > |---|---|---|---|
  > | **MARKET** | 0.929 | 1.397 | **+0.479** |
  > | **MODEL** | 1.178 | 1.308 | **+0.002** |
  >
  > **The market's implied λ rises in 5 of 5 players.** The model's is flat by construction —
  > it *is* one Poisson per player.
  >
  > | player | market | model |
  > |---|---|---|
  > | Gabriel Rincones Jr. (PHI) | 0.81 → 1.39 (**+0.58**) | 1.34 → 1.34 (+0.00) |
  > | LaMonte Wade Jr. (HOU) | 0.93 → 1.41 (+0.48) | 0.98 → 1.31 (+0.33) |
  > | Justin Crawford (PHI) | 0.93 → 1.41 (+0.48) | 1.26 → 1.26 (−0.00) |
  > | Trent Grisham (NYY) | 0.93 → 1.40 (+0.47) | 1.18 → 1.18 (+0.00) |
  > | Andres Gimenez (TOR) | 0.95 → 1.39 (+0.44) | 0.97 → 1.35 (+0.38) |
  >
  > **The market's H+R+RBI distribution is OVER-DISPERSED relative to Poisson** — more mass at
  > 0 *and* at 2+, less at exactly 1. Which is what the quantity actually is: H+R+RBI sums
  > hits, runs and RBI generated by the *same* plate-appearance sequence, so the components
  > are strongly positively correlated and the sum cannot be Poisson.
  >
  > **The engine prices the whole ladder from one λ through `shPOver`.** It can match one rung
  > and must miss the others, and it misses them in opposite directions — exactly the observed
  > +11.5 / −1.4 signature. **This is the leading candidate for the residual.**
  >
  > **Why the range detector said H+R+RBI was uncompressed and this is not a contradiction:**
  > `tools/range_compression.py` measures the spread of λ **across players at a given rung**
  > (1.78, wider than market). This measures the spread **across rungs for a given player**.
  > The model is fine on the first and structurally incapable on the second. **The compression
  > is in the ladder, not the level** — the owner's framing, confirmed.
  >
  > **Caveats:** n = 5 players with both rungs on one board, so the *magnitude* is thin. The
  > *mechanism* is not statistical — a one-parameter family cannot fit two rungs, and 5 of 5
  > in the same direction with a +0.48 λ shift is not a coin-flip. Re-run on ≥ 3 boards.
  > `hrrAltMax` stays at 0.5, and this makes the case for it stronger, not weaker: the
  > suspension covers exactly the rungs a single-λ model cannot price.
  >
  > ### STANDING QUESTION, left open by the retraction
  > **`hrrAltMax` stays at 0.5 because a second defect exists and is unidentified.** The clamp
  > was a candidate and is now excluded — it protects rather than causes. The `expAB`
  > full-start assumption is the current candidate and is unproven. Do not lift the suspension
  > on the strength of an eliminated candidate.
  >
  > ## ⚠️ WHAT STILL STANDS: THE FIX CANNOT EXPLAIN THE MISS. A SECOND DEFECT EXISTS.
  >
  > The bound below was derived from the **clamp limits**, not from the direction claim, so
  > the retraction does not touch it.
  >
  > The range-compression hypothesis for H+R+RBI was retracted (see
  > `docs/pitcher-outs-audit.md`), which left the PA-conditioning defect as the *only*
  > identified mechanism for a 46.3%-vs-59.2% miss. It does not carry that weight.
  >
  > **The fix** is `lam *= shClamp(expAB/abG, 0.85, 1.15)` (`legacy/index.html` L2368), where
  > `expAB` is slot-implied ABs and `abG = ab30/g30` is the player's actual ABs per game
  > *played* over 30 days. Both terms are recoverable from the board's own `case` string
  > ("H+R+RBI rate re-based to #N spot PA (~X AB vs Y AB/g)"), so the correction it applied
  > can be read off directly — **44 of 50 rows** on the 2026-07-26 board.
  >
  > ### It is an UPWARD correction on 86% of rows — correctly (see the retraction)
  >
  > | | |
  > |---|---|
  > | correction factor | min 0.850 · **median 1.144** · max 1.150 |
  > | at the **high** clamp (1.15) | **22 of 44** |
  > | at the low clamp (0.85) | **1 of 44** |
  > | factors **> 1** (fix RAISES the model's probability) | **38 of 44 (86%)** |
  > | factors < 1 (fix lowers it) | 3 of 44 |
  >
  > **Why the factor is upward (NOT a mismatch — see the retraction above).** `expAB` is ABs
  > in a game he starts; `abG` averages over every game he appeared in, including partial
  > appearances. `expAB > abG` is therefore the normal case for an everyday starter, and
  > scaling up is precisely what a per-AB rebasing should do.
  >
  > ### Effect on stated probabilities, by line
  >
  > | line | n | median correction | median p_pre-fix | median p_post-fix | **median effect** | range |
  > |---|---|---|---|---|---|---|
  > | O0.5 | 28 | 1.150 | 67.5% | 69.8% | **+4.8 pp** | −5.9 … +5.1 |
  > | O1.5 | 13 | 1.098 | 32.4% | 38.6% | **+4.7 pp** | −1.3 … +6.3 |
  > | O2.5 | 3 | 1.026 | 32.9% | 37.3% | +1.4 pp | −1.4 … +4.4 |
  >
  > ### The bound that settles it, without needing the ledger
  >
  > At its **maximum downward setting** (the 0.85 clamp floor, reached on 1 of 44 rows) the
  > fix can reduce a stated probability by at most **5.9 pp on O0.5** and **7.2 pp on O1.5**.
  > The observed miss is **12.9 pp overall** and **27 pp on O1.5+** (59.2% implied vs 32%
  > realised).
  >
  > **So the fix could not account for the miss even at its maximum downward setting on every
  > row. A second defect exists, and the O1.5+ suspension is protecting against something
  > that has not been identified.** This is the conclusion the retraction leaves standing,
  > and it is the reason `hrrAltMax` stays at 0.5.
  >
  > ### Where the model's disagreement now sits
  >
  > Model-minus-market: **O0.5 +11.5 pp**, O1.5 **−1.4 pp**, O2.5 −4.2 pp. O1.5+ is suspended
  > by `hrrAltMax`; **O0.5 is active and tagged `watch`**. So the model's H+R+RBI
  > disagreement is now concentrated entirely on the ACTIVE line, and is near zero on the
  > suspended ones. The re-basing contributes a median +4.8 pp of that — correctly, per the
  > retraction above, but it means **`hrrAltMax` is currently suspending the lines where the
  > model agrees with the market and leaving open the line where it does not.** That is a
  > statement about where to look next, not a case for lifting the suspension.
  >
  > **Two caveats, stated.** (1) This is one board and it is *post*-fix; the graded legs that
  > produced 46.3%/59.2% are pre-fix and sit behind the sync phrase, so the direct
  > recomputation the owner asked for — replay each graded leg through the PA-conditioned
  > model — **cannot be run without his key** and is listed as owner-executable below. (2) The
  > *mechanism* (an `expAB`/`abG` denominator mismatch) is board-independent; the magnitudes
  > are not. **Reproduce with `python3 tools/hrr_pa_audit.py <board>`.**
  >
  > **Nothing changed.** Frozen parameter, and `hrrAltMax` stays exactly where it is — this
  > finding strengthens the case for the suspension rather than weakening it.

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

> **AMENDED 2026-07-26 — this paragraph was filed against the wrong market.**
> "Expected innings" **is** the `pitcher_outs` market, and for `pitcher_outs` the last
> sentence is false in both halves: **the sim never prices it** (the pregame sim marginal
> replaces `pO` for `batter_hits_runs_rbis` only — 0 of 38 outs rows carry a `sim` tag), so
> the closed form is not the secondary path there, it is the **only** path; and the residual
> gap is not small — it is measured at **−2.6 outs per start** on pitchers the market expects
> to go 6+ IP, and **−23.1 pp median, 0 of 38 rows above market**, on the 2026-07-26 board.
> The engine contains a manager-hook model that never reaches the one market that is entirely
> about when the manager pulls the starter. See `docs/pitcher-outs-audit.md`, which also
> identifies a separate and larger defect (`0.140` used as the TB/AB neutral where the league
> mean is ≈ 0.40, pinning the opposing-offense factor at its clamp floor on 100% of rows).

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

---

## PROPOSED AMENDMENT — the slope criterion is not usable (2026-07-26, UNSIGNED)

**Not applied. This is a freeze-document amendment and needs the owner's sign-off.**

### The problem

The retirement criterion (L53–54), the stage-2 reinstatement bar (L89) and the stage-0
failure path (L92) all require the reliability slope to sit inside **[0.85, 1.15]** over
**≥100 graded legs**. Measured, that band is **0.175 SE units wide** for this market
(σ_p = 0.058 within `batter_hits_runs_rbis`, SE(slope) ≈ 0.86 at n = 100).

- A **perfectly calibrated** H+R+RBI market passes **13.9%** of the time — it fails ~86%.
- A market with **zero information** (true slope 0.00) still passes **7.1%** of the time.
- Making the band usable at 2σ needs **~13,100 graded legs** in this market alone.

So the suspension can currently only retire **by luck**, the stage-0 failure path fires on
~86% of perfectly healthy markets, and both look like real tests the entire time.
Full derivation and the per-market table: `docs/collection-period.md`, "The slope is not
usable as a criterion".

### The proposed replacement

Use the **predicted-vs-actual rate gap**, which is what the live weight gate already uses —
`applyWeeklyAdjustment` reads `perMarket.significant`, built at `calibration.ts:186` as a
Wilson-interval comparison of the mean stated probability against the realized hit rate. It
is the powered statistic here: SE(gap) = √(p(1−p)/n) ≈ **4.9 points at n=100**, so the
observed 12.9-point H+R+RBI miss reads at ~2.7σ.

| | current | proposed |
|---|---|---|
| retirement (L53–54) | slope in [0.85, 1.15] **and** O1.5+ hit rate within Wilson CI | **O1.5+ realized rate within the Wilson CI of the PA-conditioned model's stated rate**, at n ≥ 100. Slope reported as a point estimate **with its ±0.86 interval**, never as a pass/fail |
| stage-2 reinstatement (L89) | "same slope and Wilson tests" | Wilson test only, same wording as above |
| stage-0 failure (L92) | "slope outside [0.85, 1.15] **or** rate below prediction" | **rate below the Wilson CI** — drop the slope disjunct entirely, since it fires on ~86% of healthy markets |

### Two things the replacement does NOT fix, stated plainly

1. **It measures a different thing.** The gap tests the LEVEL of the model's probabilities;
   the slope tests whether stated confidence SCALES. A market can have a zero gap and a
   badly wrong slope. This amendment does not solve that — it concedes the slope is
   unmeasurable at any n this project will reach, and stops pretending otherwise.
2. **Clustered errors.** The Wilson interval assumes independent legs. Same-game and
   same-slate legs are correlated; at ρ ≈ 0.05 the 12.9-point gap falls from ~2.7σ to
   **~1.1σ**. **Before this criterion is relied on, the gap should be re-tested with
   clustered standard errors.** Not yet done, and it could change the verdict.
