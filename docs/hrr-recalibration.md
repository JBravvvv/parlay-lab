# H+R+RBI recalibration audit (fix-file Phase 2, 2026-07-24)

> # ⚠️ THE LADDER FINDING HAS EXACTLY ONE CONFIRMATION PATH, AND IT IS WEEKS OUT
>
> **Status as of 2026-07-27: ONE INSTRUMENT, ONE BOARD. Not settled fact.**
>
> The single-λ ladder result — the model drifts **+0.001** across O0.5 → O1.5 in closed form
> against the market's **+0.479** (n=5 pairs), and +0.356 vs +0.468 on the sim path (n=15) — is
> currently the strongest model-defect claim in this project. It rests on **one board**
> (2026-07-26), through **one instrument** (the ladder test on `propBoard`).
>
> **It cannot be checked on the fixture, ever.** The armed fixture's `propBoard` carries **14
> H+R+RBI rows against 304 on a real board — 21.7×** thin, and 133 of its 289 total rows are
> `batter_home_runs`. An IQR or a rung-drift comparison on 14 rows is not a measurement.
>
> **The archive series does not confirm it either.** Twenty boards give the same instrument
> twenty runs — precision, not independence. By this repo's own rule that is not a re-check.
>
> | the only independent test | Phase 2's rung-bucketed movement regression |
> |---|---|
> | why it is independent | different method (OLS on closing movement), different quantity (drift, not dispersion), different data (closing prices, not board prices) |
> | its prediction | `(pModel − open_fair)` must **change sign** between the O0.5 and O1.5 buckets, with the movement slope significantly positive at neither |
> | **needs the sync phrase** | **~2026-07-29** — and real close accrual after that |
> | **earliest readable** | **~2026-07-29** for O1.5 (a fat rung); O0.5 needs its own volume check on the first close-day |
>
> **Pre-committed and binding: no rung dependence in Phase 2 RETRACTS this finding, regardless
> of what the 20-board reading says.** A confirmation from the same instrument never outvotes a
> disconfirmation from a different one.
>
> **Until that date, every statement of this finding carries "one board, one instrument."** It
> is written here, beside the finding, specifically so it cannot harden into settled fact by
> repetition while its only test is pending.
>
> **`batter_total_bases` over-dispersion (ratio 2.30, n=108 pairs) sits under the same warning
> and is thinner still relative to production: 42 fixture rows against 391 real (9.3×).** It has
> the larger n of the two and no independent test scheduled at all.

> ## 🔬 TWO MARKETS, OPPOSITE PREDICTED SIGNATURES, ONE INSTRUMENT
>
> `batter_total_bases` had **no independent test scheduled at all** — a worse position than
> H+R+RBI's. Phase 2's rung bucketing already covers every market carrying alternate lines, and
> TB has them, so adding it is free. Adding it also converts Phase 2 from a test of two findings
> into **a test of the instrument as well**, because the two markets predict *opposite* things.
>
> | | **H+R+RBI** | **`batter_total_bases`** |
> |---|---|---|
> | measured defect | **UNDER-dispersed** — model drift +0.001 vs market +0.479 across O0.5 → O1.5 (closed form, n=5); +0.356 vs +0.468 (sim, n=15) | **OVER-dispersed** — ratio **2.30**, n=108 pairs |
> | mechanism | a single λ across the ladder: it cannot reach the tail | too much spread across the ladder: it overshoots the tail |
> | **low rung** | model **HIGH** (measured +11.5 pp at O0.5) | model **LOW** |
> | **high rung** | model **LOW** (measured −1.4 pp at O1.5) | model **HIGH** |
> | `(pModel − open_fair)` sign, low → high rung | **+ → −** | **− → +** |
>
> ### The pre-commitment, written before the data
>
> | # | Phase 2 returns | reading |
> |---|---|---|
> | 1 | **HRR flips + → −, TB flips − → +** | **BOTH findings confirmed, and the instrument is validated** — a regression that reproduces two opposite signatures on two markets is not producing them by construction. The strongest available outcome, and stronger than either finding alone |
> | 2 | one flips as predicted, the other does not | the flipping one is confirmed; the other is **retracted**. No partial credit, no "directionally consistent" |
> | 3 | **both flip the SAME way** | **the instrument is suspect, not the findings.** Two markets with opposite measured dispersion cannot share a signature. Report it as an instrument failure and read neither market from it |
> | 4 | **HRR flips − → +, TB flips + → −** — *both opposite to prediction* | **THE INSTRUMENT IS SOUND AND BOTH DIAGNOSES ARE SIGN-INVERTED.** Rung dependence is real, per-market, and opposite in the two markets — everything the instrument must show — with the signs the wrong way round. That is not a retraction: it says the *dispersion measurements* (`shTbOver`'s 2.30, the single-λ drift) have a sign error, and both go **back to source** rather than being dropped |
> | 5 | neither flips | both retracted. A single-λ model cannot produce a rung-invariant gap, and neither can an over-dispersed one |
>
> **Branch 4 is the one that would otherwise be misfiled.** Under a four-branch table it reads as
> "neither flipped as predicted" and lands in branch 5 — retraction — when it is nearly the
> opposite: a clean, informative result carrying a specific, findable defect. A retraction throws
> away a sign error that a re-derivation would fix in an afternoon.
>
> **Branches 3 and 4 are the pair that makes this worth doing.** Branch 3 says the instrument
> failed; branch 4 says the instrument worked and the inputs are inverted. They are
> distinguishable only because two markets with *opposite* predictions are being read at once —
> with one market, both look identical.
>
> **Row 3 is the one worth having written down in advance.** Without it, "both markets show the
> same rung dependence" reads as a *strong confirmation* rather than what it is — evidence that
> the regression is picking up something common to the board rather than something per-market.
>
> **Fixture ratios, for the record:** TB **42 rows vs 391 real (9.3×)**; H+R+RBI **14 vs 304
> (21.7×)**. Neither can be checked on the fixture. TB has the larger n (108 pairs vs 5/15) and
> the thinner fixture ratio is HRR's — they are weak in different ways, which is another reason
> a shared instrument reading them oppositely is worth more than either alone.

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
  > ## SCOPED 2026-07-26 (same day): THE FINDING IS THE CLOSED FORM, NOT THE MODEL CLASS
  >
  > The n=5 measurement above is **correct and it held** — but it was a *subset*, and I
  > presented it as H+R+RBI-wide. **33 of 50 H+R+RBI rows carry the `sim` tag**: the sim
  > marginal replaces `pO` pregame for this market and only this market. Those 5 players were
  > exactly the ones the sim did not reach.
  >
  > Re-run on the uncapped `propBoard`, split by pricing path (`tools/hrr_ladder_audit.py`,
  > `tools/ladder_drift.py`):
  >
  > | path | pairs | market λ drift | model λ drift | **ratio** |
  > |---|---|---|---|---|
  > | **SIM marginal** | 15 | +0.468 | **+0.356** | **0.76** |
  > | **closed form (Poisson)** | 5 | +0.479 | **+0.001** | **0.00** |
  > | all | 20 | +0.474 | +0.317 | 0.67 |
  >
  > **The sim already reproduces 76% of the market's ladder dispersion. The closed form
  > reproduces 0% of it, exactly as a one-parameter family must.**
  >
  > ### So the fix shape is NOT a new distribution — it is routing
  > Negative binomial and a compound distribution were the candidates if this were a
  > model-class error. **It is not.** The engine already has a distribution that matches the
  > market's dispersion, and it already uses it for two thirds of H+R+RBI rows. **The defect is
  > the ~1/3 of rows that fall back to closed form** — the games with no confirmed lineup, so
  > no sim. The fix is to give those rows a dispersion-aware price, not to replace the family.
  >
  > ### AND THE FIX IS A SCHEDULING CHANGE, NOT A MODELLING ONE — measured
  >
  > The sim needs **both** lineups (`legacy/index.html` L2107: `lineup_away >= 9 && lineup_home
  > >= 9`), so its coverage is a property of the GAME, not the player. Confirmed on the
  > 2026-07-26 board:
  >
  > | | |
  > |---|---|
  > | games with **ALL** H+R+RBI rows sim-priced | **9** |
  > | games with **NONE** sim-priced | **3** |
  > | games **partially** sim-priced | **0** |
  >
  > **All-or-nothing per game, exactly as a game-level gate predicts.** The rows split
  > 33 sim (every one `lu=confirmed`) / 13 `lu=projected` / 4 `lu=confirmed` but unsimmed —
  > those last 4 are players whose *own* lineup was posted while their opponent's was not,
  > which is the difference between `lu` (the player's lineup) and the sim's requirement
  > (both lineups).
  >
  > **One game carries the defect.** `newyorkyankees@philadelphiaphillies` alone supplies
  > **11 of the 17** closed-form rows — 65% of the exposure is a single late-lineup game.
  >
  > `luCoverage` on this board was **13 of 15 games confirmed (86.7%)**. **A board generated
  > after all lineups post would carry the sim price on essentially every H+R+RBI row**, and
  > the ladder defect would disappear from the board without one line of model change.
  >
  > ### THE DEFECT HAS THREE SOURCES, NOT ONE
  > The retime addresses the first. The other two survive it and are separable:
  >
  > | source | example on 2026-07-26 | rows | reached by the retime? |
  > |---|---|---|---|
  > | **late lineups** | NYY@PHI, 6 h 34 m out at generation | 11 | **yes** — the 22:30 Sunday entry |
  > | **one-sided lineups** | 4 rows `lu=confirmed` but unsimmed — the player's own lineup posted, the opponent's had not; the sim needs **both** (L2107) | 4 | **partly** — a later fire raises the odds both are up, but never guarantees it |
  > | **live games** | CLE@TB was already in progress; the sim **ran**, as a *live* sim, and the H+R+RBI pregame marginal requires `!liveInit` | 3 | **no** — a later board makes this WORSE, not better |
  >
  > **The third is the interesting one and it cuts against the retime.** An in-progress game
  > silently loses ladder dispersion: the live sim exists and is arguably *better* informed
  > than the pregame one, and the H+R+RBI branch declines it on a flag. Every hour the board
  > moves later, more of the slate is live and more rows fall into this case. Not urgent —
  > 3 rows here — but it is the one source the retime cannot fix and can aggravate.
  >
  > **THE HONEST CLAIM IS "REMOVES ~65% OF THE LADDER-DEFECT EXPOSURE", NOT "ELIMINATES IT".**
  > Of the 18 rows (17 closed-form + the boundary case): the retime **fully solves 11**,
  > **partly solves 4** (one-sided lineups — a later fire raises the odds both are posted but
  > never guarantees it), and **worsens 3** (live games — every hour later, more of the slate
  > is in progress and more rows fall into the `!liveInit` branch). One-sided lineups and live
  > games stay open items with their own fixes.
  >
  > **So the H+R+RBI ladder fix is board TIMING, and it is worth more than the coverage
  > tables ever suggested.** `docs/board-timing.md` treats lineup coverage as a data-quality
  > metric; it is also the switch between a distribution that reproduces 76% of the market's
  > ladder dispersion and one that reproduces 0%. Scoped, unbuilt, and now cheap.
  >
  > ### AND IT IS NOT A CLASS DEFECT — total bases shows the OPPOSITE
  > `batter_total_bases` is also a correlated sum (1B + 2·2B + 3·3B + 4·HR), so it was the
  > natural place to look for the same signature. It is not there:
  >
  > | market | pairs | market drift | model drift | ratio | verdict |
  > |---|---|---|---|---|---|
  > | **TB** | 108 | +0.341 | **+0.785** | **2.30** | model MORE dispersed than market |
  > | HRR | 24 | +0.474 | +0.355 | 0.75 | partial (see split above) |
  > | hits | 18 | −0.035 | −0.001 | 0.04 | **uninterpretable — market drift ≈ 0** |
  > | K's | 8 | +0.162 | +0.002 | 0.01 | under-dispersed, but n=8 |
  > | outs | 12 | −0.005 | +0.010 | −1.91 | **uninterpretable — both drifts ≈ 0** |
  >
  > **TB's compound `shTbOver` over-disperses (2.30×), it does not under-disperse.** hits and
  > outs have market drift indistinguishable from zero, so their ratios have a near-zero
  > denominator and **must not be read** — flagged rather than reported as findings. K's is
  > suggestive at n=8 and is the only other candidate worth re-running.
  >
  > **Conclusion: this is an H+R+RBI closed-form defect, not a class defect across correlated
  > sums.** The scoping matters — a class defect would have implied a rewrite.
  >
  > **Caveats:** the closed-form arm is n = 5 pairs on one board, so the *magnitude* is thin. The
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
park-scoring term in the closed form. ⚠️ **SUPERSEDED 2026-07-27 — see "THE CLOSED FORM HAS NO
PARK FACTOR AT ALL" at the end of this file. The closed form has no real park term for ANY
component (only the Coors flag), and `shParkF` — 92% live — is sim-only. This wording was
written without knowledge that the factor existed.** The sim path prices runs/RBI through actual
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

# ⚠️ TRACED: THE CLOSED FORM HAS NO PARK FACTOR AT ALL (2026-07-27)

**Two corrections first, both mine.**

1. **`shPitIsoF` does NOT discard park and wind.** L2086 is
   `hrF = isoF*wind.f*parkHR*pl.hr` — `wind.f`, `parkHR` and the platoon term are all
   **retained**. What drops is `power`, `pq` and `bpF`, and L2076–2078 says why in the engine's
   own words: *"the pitcher's xBA-against enters through log5 (so the WHIP/percentile proxies
   come OFF the hit channel — no double counting); xISO-against replaces the power proxy."*
   **Documented, intentional, not a defect.** My "dead branch" framing was wrong.
2. **`shParkF` is 92% live but it is SIM-ONLY.** `parkH`/`parkHR` appear at exactly one place —
   **L2062, inside `batVec`.** They reach no closed-form price.

**And tracing that produced the actual finding.**

## The closed form's factors, L2326

```js
var pq=shPitPctF(pst);
var hrF = power*pq*wind.f*(coors?1.08:1)*luckF,
    tbF = power*pq*(wind.f>1?1.05:wind.f<1?0.96:1)*(coors?1.10:1)*luckF,
    hF  = contact*pq*(coors?1.07:1)*luckF
```

**There is no `shParkF` here. Park enters the closed form as a BINARY COORS FLAG and nothing
else** — every non-Coors venue is treated identically, and `SH_PRIORS.parks[L|R]`, which is 92%
populated, is not consulted.

| channel | park | wind | platoon |
|---|---|---|---|
| **sim** (`batVec` L2062 / L2086) | **`parkH`/`parkHR`** — real per-venue × handedness | `wind.f` | `pl.h` / `pl.hr` |
| closed form — hits (`hF`) | Coors flag only (×1.07) | **none** | **none** |
| closed form — TB (`tbF`) | Coors flag only (×1.10) | coarse (1.05 / 0.96) | **none** |
| closed form — HR (`hrF`) | Coors flag only (×1.08) | `wind.f` | **none** |
| **closed form — H+R+RBI** (L2358) | **Coors flag only (×1.08)** | **none** | **none** |

## H+R+RBI is thinner still: it does not even use `hF`/`hrF`/`tbF`

```js
lam = rate * (coors?1.08:1) * power      // L2358, and that is the whole thing
```

Its siblings at least carry `pq` and `luckF`. **H+R+RBI's closed-form λ is a per-game rate times
a binary Coors flag times `power`** — and `power` is the crude ERA/WHIP proxy that the sim path
deliberately *replaces* with xISO-against as inadequate (L2077).

> ### THIS IS A MECHANISM FOR BOTH OPEN HRR FINDINGS, TRACED TO A LINE
>
> **The ladder split.** Measured: closed-form drift across O0.5 → O1.5 was **+0.001** against a
> market drift of **+0.479** (ratio **0.00**, n=5); the sim path moved +0.356 against +0.468
> (ratio 0.76, n=15). A λ built from `rate × coorsFlag × power` has almost **no game-specific
> variation to move with** — no park, no wind, no platoon. It is not that the closed form
> under-disperses; it is that there is nearly nothing in it that could disperse.
>
> **The signature.** A λ that under-varies is too high where the market is low and too low where
> the market is high — which is exactly the measured **+11.5 pp at O0.5 / −1.4 pp at O1.5**.
>
> **The share.** On the 2026-07-26 board, **17 of 50 H+R+RBI rows (34%) were closed-form**, and
> NYY@PHI alone supplied 11 of those 17.

**This now outranks the PA-conditioning clamp as the leading candidate for the HRR residual.**
It is traced to lines, it predicts the sim/closed-form split that was already measured, and it
predicts the rung signature. It is still **a hypothesis until Phase 2's rung test** — the
standing rule is unchanged, and it stays inside the box at the top of this file.

**Nothing changed. No parameter touched.** The closed form is frozen and the fix shape (route
`shParkF` into the closed-form factors, give H+R+RBI the same `hF`/`tbF` treatment as its
siblings) is a freeze-exit amendment, not a collection-period edit.

## The doc's acceptance was half-right, and written without knowing the factor existed

The residual-gap acceptance below says *"no dedicated park-scoring term for the run/RBI
components."* **Corrected:** in the **closed form** there is no real park term for **any** H+R+RBI
component — hits and HR included — only the Coors flag. In the **sim** path all three components
get the full per-venue park factor through `batVec`.

So the true statement is a **path** split, not a **component** split, and the acceptance was
recorded without knowledge of a **92%-live, unmonitored `shParkF`** that reaches one path and
not the other. The acceptance is not thereby wrong — the sim prices most HRR rows — but it was
made against an input nobody had measured.

## THE CORRECTED λ — arithmetic only, freeze-exit amendment (2026-07-27)

### First, the sharpest version of the defect

**Colorado played AWAY at Milwaukee on 2026-07-26, so `coors` was `false` on all 15 games and
`(coors?1.08:1)` was exactly `1.00` everywhere.** The closed-form H+R+RBI λ that day was:

```
λ = rate × power
```

`power = shClamp((era2/4.20 + whip/1.30)/2, 0.85, 1.18)` varies **by opposing starter and by
nothing else**. So the λ had **zero site variation — not little, none.** On any non-Coors slate,
which is 29 parks in 30, that is the whole expression.

### What is sitting unused beside it

| available at L2326 | carries |
|---|---|
| `hF = contact*pq*(coors?1.07:1)*luckF` | pitcher contact quality, percentile, luck |
| `tbF = power*pq*(wind.f>1?1.05:…)*(coors?1.10:1)*luckF` | + coarse wind |
| `hrF = power*pq*wind.f*(coors?1.08:1)*luckF` | + full wind |

**And what is NOT available anywhere in the closed form: `shParkF`.** Its spread across the 29
parks in the priors is real and material:

| | min | median | max | **spread** |
|---|---|---|---|---|
| `parkH` (RHB) | 0.940 | 0.995 | 1.085 | **0.145** |
| `parkHR` (RHB) | 0.855 | 1.010 | 1.160 | **0.305** |

A ±14.5% hit-rate and ±30.5% HR-rate venue term, 92% populated, **reaching only the sim**.

### Mapping the components, and the double-counting constraint

| HRR component | share of mass¹ | natural factor |
|---|---|---|
| **H** | ~0.48 | `hF` — direct |
| **RBI** | ~0.26 | `tbF` — RBI tracks extra-base production, not hit count |
| **R** | ~0.26 | mostly `hF` (reaching base) + teammate context the model has no term for |

¹ league-typical ≈ 1.00 H / 0.55 R / 0.55 RBI per game.

> **⚠️ THEY CANNOT BE MULTIPLIED.** `power` and `pq` appear in all three, so `hF × tbF × hrF`
> **cubes the pitcher-quality term**. And `rate` is already a per-game H+R+RBI rate from the
> player's own history, which embeds his season-average park and lineup context — so any factor
> applied to it must be a **relative-to-his-average** adjustment, not an absolute one.
>
> The correct shape is **one mass-weighted blend**, e.g. `wH·hF + wRBI·tbF + wR·hF`, with the
> pitcher terms entering once. Not a product. The exact weights are a fitting question and this
> is arithmetic only — the point here is that the naive fix is wrong in a specific, statable way.

### The spread this would recover, and the honest limit

**Using the existing components is necessary and NOT sufficient.** All three carry only the Coors
flag for park, so blending them adds `pq`, `wind.f`, `contact` and `luckF` — pitcher quality,
weather, luck — and **still no venue term**. Against a market rung-drift of **+0.479**, the
achievable model drift from those alone is bounded by their own spread, which is small: `pq` is
clamped to [0.94, 1.06] and the wind term to [0.96, 1.05].

**Routing `shParkF` into the closed form is the part that actually adds site variation** — a
0.145–0.305 spread against the ~0.12 the blended existing components can supply. Two amendments,
and the second is the larger one.

### Does this SUPERSEDE the single-λ ladder diagnosis, or sit underneath it?

**Underneath — and it is the larger term.** They are different defects with different fixes:

| | single-λ ladder | **λ conditioning** |
|---|---|---|
| claim | one λ per player-game, so O0.5 and O1.5 are both Poisson transforms of it — the two rungs cannot be set independently | that λ **barely varies by site**; on a non-Coors slate it is `rate × power` |
| kind | **distributional family** — inherent to any single-λ Poisson model | **mis-conditioning** — the λ is wrong before the family is consulted |
| fix | a different distribution, or per-rung calibration | route the existing conditioned components + `shParkF` in |

A correctly-conditioned single λ would still be Poisson-constrained and would still produce
*some* rung drift — just possibly the wrong amount. **The measured closed-form drift was +0.001,
i.e. essentially zero**, which is what a λ with no site variation produces and is *not* what a
family limitation alone produces. So conditioning dominates on the evidence available.

### Which Phase 2 branch distinguishes them

Phase 2's rung test already buckets by market and rung. **Add the sim/closed-form tag as a third
bucket** — it is already on every row — and the two defects separate cleanly:

| Phase 2 shows | reading |
|---|---|
| **rung dependence in SIM rows, none in closed-form rows** | **conditioning is the story.** The closed form is flat because its λ is flat; the sim, which has park/platoon/iso, behaves |
| **rung dependence in BOTH** | the **family** limitation is real and independent of conditioning — a correctly-conditioned λ still cannot set two rungs |
| **rung dependence in NEITHER** | both retracted, per the standing five-branch table |
| closed-form only, not sim | neither diagnosis; something is wrong with the sim instead |

**Nothing changed. No parameter touched.** Both amendments are freeze-exit.

### The five-branch table's third bucket, and the asymmetry it implies

`sim` / `closed form` joins market and rung as a bucketing dimension. The two directions are
**not** symmetric, and that is worth having written down before the numbers land:

| observed | expected? | reading |
|---|---|---|
| **rung dependence in SIM rows, none in closed form** | **yes — this is the predicted result** | The sim carries park, platoon, xISO and bullpen; the closed form carries `rate × power`. Structure appearing where the inputs are and vanishing where they aren't is the conditioning defect confirming itself |
| **rung dependence in BOTH** | plausible | the single-λ **family** limitation is real and independent of conditioning |
| **rung dependence in CLOSED FORM ONLY** | **no — nobody would predict this** | **the SIM is wrong.** A path with strictly more information producing strictly less structure than one with almost none is not a conditioning story at all; it says the sim's joint machinery is introducing an error the flat closed form avoids by having nothing to get wrong |
| neither | — | both diagnoses retracted |

**Row 3 is the one to write down in advance**, for the same reason branch 4 of the TB/HRR table
was: without it, "the closed form showed rung dependence" reads as a partial confirmation
instead of as evidence against the richer path. And the sim currently prices **33 of 50 H+R+RBI
rows and nothing else on the board**, so an error in it is concentrated in exactly the market
under investigation.

### ⚠️ THE 0.0 HRR GAP IS A TAUTOLOGY, NOT EVIDENCE ABOUT THE SIM

A reasonable reading of *"sim − closed-form = 0.0 on H+R+RBI"* is that **the sim reproduces the
same flat λ**, and therefore that routing HRR through the sim would not fix its park problem.
**That inference does not hold, and the number cannot support it either way.**

`pO` for an H+R+RBI row **already is** the sim value (L2394 overwrites it). So `sim − pModel` is
`x − x`. The 0.0 is the **control that validates the join**, not a comparison — the closed-form
λ for those rows is computed and then overwritten, and was never in the comparison at all.

**What the evidence actually says, from the ladder measurement:**

| path | rung drift O0.5 → O1.5 | vs market +0.479 |
|---|---|---|
| **sim** (n=15 pairs) | **+0.356** | ratio **0.76** |
| **closed form** (n=5 pairs) | **+0.001** | ratio **0.00** |

**The sim has site and rung structure; the closed form has none.** That is consistent with
`batVec` carrying `parkH`/`parkHR`, platoon and xISO-against while the closed form carries
`rate × coorsFlag × power`. **So sim routing DOES address HRR's site variation** — for the 66%
of rows it already covers, it has been addressing it all along.

### Which separates the two amendments cleanly

| rows | what fixes their site variation |
|---|---|
| **33 of 50 (66%) — already sim-priced** | **nothing to fix.** They have park, platoon and xISO today |
| **17 of 50 (34%) — closed-form** | **either** a retime (get their lineups confirmed so the sim covers them) **or** `shParkF` + λ conditioning in the closed form |

**They are alternatives for those 17 rows, not complements** — and `shParkF` routing is the one
that also reaches `batter_hits` (which the external check says must stay closed-form),
`pitcher_strikeouts` (which the sim cannot price at all) and every game the sim misses. The
"residual after 1 and 2" label was right for the wrong reason: it is a residual because the other
two are partial, not because it is small.

### ⚠️ TB'S COLLAPSE VOIDS THE OPPOSITE-SIGNATURE ARM — Phase 2 no longer validates itself

The five-branch table's value came from **two markets predicting opposite signatures**, which made
Phase 2 a test of the instrument as well as of the findings. **If M8 explains TB's 2.30
over-dispersion, that arm is gone**: an artifact of one rung sharing a probability with the next
is not a model dispersion property, and it predicts nothing about closing movement.

| | before | after M8 |
|---|---|---|
| HRR arm | + → − (single λ, cannot reach the tail) | **unchanged** |
| **TB arm** | **− → +** (over-dispersed, ratio 2.30) | ⚠️ **VOIDED pending the re-run** |
| what the pair bought | a regression reproducing two *opposite* signatures is not producing them by construction | **gone** |

**Stated plainly: with the TB arm gone, HRR's rung test is a SINGLE-ARM result again**, and
branches 3 and 4 of the five-branch table — the two that distinguish an instrument failure from a
world result — **are unreachable, because both require two markets.**

## What replaces it — three candidates, none free

| candidate | opposite signature? | cost |
|---|---|---|
| **TB after the M8 fix** | **unknown** — re-run the ladder test post-fix. If a genuine over-dispersion survives, the arm comes back intact | one re-run, but **the fix is frozen** — so not before exit |
| `batter_hits` | **no** — the +0.3 pp production reading shows no rung structure to predict | — |
| **`pitcher_outs`** | **yes, plausibly** — the 0.140 defect pins the factor at the clamp floor on 35/35 rows, and its λ under-varies. Predicted **+ → −**, the same direction as HRR | **not opposite**, so it doubles the HRR arm rather than balancing it |

> **None of the three gives an opposite arm before freeze exit.** The honest position is that
> **Phase 2 tests the findings but no longer tests itself**, and the five-branch table drops to
> three reachable branches:
>
> | # | branch | status |
> |---|---|---|
> | 1 | HRR flips + → − | ✅ confirms the ladder finding |
> | ~~2~~ | one flips, one does not | **unreachable — needs two markets** |
> | ~~3~~ | both flip the same way (instrument suspect) | **unreachable** |
> | ~~4~~ | both flip opposite to prediction (signs inverted) | **unreachable** |
> | 5 | HRR does not flip | ✅ retracts it |
>
> **Not quietly dropped: recorded as a capability the project HAD and lost to a bug fix.** The
> instrument-validation branches return the moment a second market with a *predicted, opposite*
> rung signature exists — and the first place to look is TB after M8, which is a re-run, not a
> new instrument.

### ⚠️ SUPERSEDED SAME DAY — the second arm came back, measured (2026-07-27, later turn)

The "batter_hits — no rung structure" row above was written from the pooled +0.3 pp level.
The per-row measurement (`tools/rung_signature.py`, within-player rung deltas) found what the
pool hid: **hits carries a real rung signature, +1.4 mean / +2.0 median pp at O1.5 relative to
the same player's O0.5, t ≈ 3.6 (n=18 pairs)** — model increasingly HIGH up the ladder. That is
**− → + family, opposite in sign to HRR's + → −**, and it is *derived* (the Poisson tail) rather
than hypothesised, which is what TB's arm never was.

Two arms now exist, with different jobs:

| arm | signature | magnitude | powered by exit? |
|---|---|---|---|
| **hits rung arm** (M7-family) | − → + vs HRR's + → − — the instrument-validation pair is BACK | **+1.4–2.0 pp at O1.5** | **borderline**: ~35 model-priced O1.5 rows/day → ~2,030 graded by 09-22 → SE ≈ 0.96 pp → **2.1σ at +2.0, weaker at +1.4**. Confirmable as *market structure* from the board archive within weeks; thin as *graded truth* |
| **expAB-gradient arm** (M10) | same-signed in hits and closed-form HRR, ABSENT in sim-priced HRR — the diverse-lens check | **+7.39 pp/AB** (SE 1.73) → ≈ 6.3 pp between extreme expAB terciles | **yes, early**: 135 expAB-covered graded rows/day → **3σ by ~08-20**, ~4.7σ by exit |

So the five-branch table's branches 2–4 are **reachable again** via the hits arm, at its
*measured* magnitude (+1.4–2.0 — NOT the +5.7 the uniform interlock predicted; that
characterisation is refuted at t = 11.1, see `docs/collection-period.md`). And the arm that
actually decides something on a useful date is the expAB gradient: it has the magnitude the
rung arm lacks, a truth adjudication inside August, and its own instrument check (two pricing
paths, one showing the gradient, one not).

**The prior conclusion — "none of the three gives an opposite arm before freeze exit" — was
wrong within hours, and the reason is worth keeping: it was reached from a pooled median over a
population that mixed markets and λ values.** The per-row version of the same question had a
different answer. Same lesson as `categories` vs `propBoard`, one level down.
