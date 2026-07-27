# Singles vs parlays — structural counterfactual (2026-07-26)

**REPORT ONLY. Nothing shipped, no parameter touched.** Harness:
`tests/singles-counterfactual.test.ts`, run with `PL_BOARD=<persisted board>`.

## What this does and does not answer

**Not the NO-PLAY window.** That is already settled and singles do not solve it: **1 of 205**
playable board rows clears `consMinEv` (−1%) as a single, best row **−0.60%**. A singles card
is empty today for the same reason the parlay card is.

The question here is purely structural: **once the counters rebuild (~08-06+), is
singles-first better than parlays-first at the same dollar exposure?**

## How the gate is "disabled" — by config, not by code

`cfg.mktN` is set to a proven count for every market, so the `small` test is false and the
consensus branch never fires. That is not a modified engine: it is exactly the state the
engine reaches on its own once `mktN >= consMinN`. **`consMinN` and `consMinEv` are
untouched.** The counterfactual is the real ~08-06 engine.

## What had to be constructed, and what did not

`buildParlaySet` **refuses to build a one-leg ticket** — `if(!sel||sel.length<2)return null`
(L2640). **A single is not merely unselected today; it is unconstructible.** So the ticket
object is built in the harness, using the n=1 evaluation of that function's *own*
expressions (L2641–2712) — `czEv = prob*czDec − 1`, `consCzEv = (imp/100)*czDec − 1`,
`simJoint`/`posCorr`/`negCorr` all false since each requires ≥2 legs.

Everything after that is the production function called directly: `shCoreEligible`, the EV
floor, `nv_tax`, `booksInd`, the consensus branch, greedy selection, leg/game dedupe, the
K's rules, ¼-Kelly sizing, the caps and the rounding.

---

## A. THE SINGLES SHADOW CARD

Bankroll $2,500 · daily $250 · `ev_gated` · `perParlayCap` 0.25 · `dailyBankrollCap` 0.10 ·
`kellyStakeMult` 4. Board 2026-07-26: 293 rows → 17 `noParlay` excluded → **276 playable**.

### A1 — the 37 selected legs as singles, gate OPEN

| | |
|---|---|
| pool | 37 one-leg tickets |
| picks | **6** |
| staked | **$250**, unallocated $0 |
| stake-weighted EV | **5.92%** |
| blocked | none |

| stake | ticket | czEv | hit | consCzEv |
|---|---|---|---|---|
| $46 | Outs · Framber Valdez (DET) | 13.5% | 70.7% | −4.8% |
| $43 | H+R+RBI · Jazz Chisholm Jr. (NYY) | 10.9% | 68.6% | −7.5% |
| $41 | H+R+RBI · Jackson Holliday (BAL) | 2.7% | 65.1% | −7.1% |
| $40 | H+R+RBI · Nicky Lopez (TEX) | 2.6% | 64.6% | −5.7% |
| $40 | Total Bases · Bo Bichette (NYM) | 2.2% | 63.5% | −3.9% |
| $40 | Total Bases · JJ Bleday (CIN) | 2.2% | 63.5% | −5.8% |

### A2 — the same 37, gate ENABLED, evaluated PER LEG

> **picks 0 · staked $0 · blocked `{"consensus": 24}`**

**None of the wall is compounding.** 24 of the 37 legs reach the consensus branch as singles
(13 die earlier at the EV floor or `nv_tax`), and **all 24 are blocked**. A single faces the
full −1% bar rather than the −0.50%/−0.33% per-leg equivalent a 2- or 3-leg ticket implies,
and the per-leg `consCzEv` distribution does not come close:

| min | p25 | median | p75 | max | clearing −1% |
|---|---|---|---|---|---|
| −22.20% | −7.00% | −5.60% | −5.00% | **−0.60%** | **1 of 205** |

(71 of the 276 playable rows have no Caesars quote at all and cannot be a single.)

### Parlays-first, same allocator, same dollars

| | gate OPEN | gate ENABLED (today) |
|---|---|---|
| pool | 67 | 67 |
| picks | **6** | 0 |
| staked | **$250** | $0 |
| stake-weighted EV | **15.08%** | — |
| blocked | none | `{"consensus": 18}` |

> ### THE CARD IS SIX TICKETS EITHER WAY
> `maxCoreTickets = 6` binds in every scenario — a 276-ticket singles pool and a 67-ticket
> parlay pool both produce exactly 6 picks and exactly $250. **Structure does not change
> exposure; it changes what the exposure is placed on.**

**On the EV gap (15.08% vs 5.92%): this is not evidence parlays are better.** A multiplicative
structure produces a larger ticket EV from the *same* leg edges — that is arithmetic, not
edge. It is precisely the "compounded model error" that `coreMaxDec`, `coreMaxLegs` and
`coreNoHR` exist to bound. The honest reading is that parlays convert the same leg-level
disagreement into a higher-variance, higher-nominal-EV object.

---

---

## IS THE PARLAY ADVANTAGE REAL, OR MANUFACTURED BY THE FIXED +2% FLOOR?

`coreEvMin` is a **fixed ticket-level floor**, so it filters more weakly the more legs a
ticket has: three legs at +2% each compound to `1.02³ − 1` = **+6.1%**, so a 3-legger clears
a +2% ticket floor on legs averaging only **+0.7%**. Three checks.

### 1. Per-leg czEv behind each card — the pools are the same quality

| card | n legs | min | p25 | median | p75 | max | **mean** |
|---|---|---|---|---|---|---|---|
| singles | 6 | 2.07% | 2.60% | 2.88% | 10.95% | 13.55% | **5.80%** |
| parlay | 14 | **−3.58%** | 1.93% | 2.60% | 10.66% | 23.12% | **5.76%** |

**The hypothesis is not confirmed at the card level.** Mean per-leg czEv is 5.80% vs 5.76% —
indistinguishable. The parlay card is 4 two-leg and 2 three-leg tickets, and **one leg is at
−3.58%**, riding on a ticket that clears +2% — exactly the predicted mechanism, but 1 of 14,
not a systematic dilution.

**The floor IS mis-scaled, though, and here is the size of it:** of the **18** tickets
clearing the fixed +2% floor, **14** also clear a leg-equivalent floor. **4 of 18 (22%) are
admitted only because the floor does not scale with leg count.** They just weren't good
enough to make the top 6.

### 2. Leg-equivalent floor — the advantage survives, and grows

Ticket floor `1.02^n − 1`, applied as an upstream **pool restriction** with the real
allocator run afterwards (the gate itself untouched):

| | tickets surviving | picks | staked | stake-wtd EV |
|---|---|---|---|---|
| fixed +2% floor | 67 pool | 6 | $250 | 15.08% |
| **leg-equivalent floor** | **17 of 67** | 6 | $250 | **16.45%** |

### 3. Expected log-growth — the scoreboard EV cannot be

Exact over all 2⁶ card outcomes, at the actual ¼-Kelly stakes under the 2%/10% caps,
bankroll $2,500. (Tickets are leg-disjoint by the allocator's no-repeat rule; residual
same-game dependence across tickets makes this an approximation.)

| card | E[ln(B′/B)] | P(0-for-6) |
|---|---|---|
| singles | **+55.3 bp** | 0.0012 |
| parlay | **+126.6 bp** | 0.0949 |
| parlay, leg-equivalent floor | **+139.1 bp** | 0.1001 |

> **Parlays win by 2.3× on log-growth, and the advantage survives — indeed improves under —
> a leg-equivalent floor. The EV gap is not a selection artifact.**
>
> **But the parlay card is 79× more likely to lose everything staked** (9.5% vs 0.12% of
> days going 0-for-6, i.e. −$250 on a $2,500 bankroll).

### ⚠️ 4. AND THE RANKING INVERTS AT −3 pp OF OVERCONFIDENCE

Every number above is computed **at the model's own probabilities**. A parlay is
multiplicatively more sensitive to probability error than a single. Given
`docs/pitcher-outs-audit.md` and the H+R+RBI history, systematic overconfidence is a live
hypothesis, so the ranking is re-run under it rather than asserted robust — each leg's true
probability shaded down by δ, propagated through the ticket:

| per-leg shade | singles | parlay | parlay (leg-equiv) |
|---|---|---|---|
| −0 pp | +55.3 bp | **+126.6 bp** | **+139.1 bp** |
| −1 pp | +39.5 bp | +86.5 bp | +98.2 bp |
| −2 pp | +23.7 bp | +47.0 bp | +58.0 bp |
| **−3 pp** | **+7.9 bp** | **+8.2 bp** | +18.5 bp |
| −5 pp | **−23.7 bp** | **−67.3 bp** | −58.4 bp |

> ### THE CROSSOVER IS AT −3 pp
> At the model's own numbers parlays win 2.3×. At **3 points** of per-leg overconfidence the
> two are equal. At 5 points **singles lose 24 bp and parlays lose 67 bp — 2.8× as much.**

**So this is not "parlays win". It is: parlays win iff per-leg overconfidence is under ~3
points, and that quantity has not been measured.** For scale, the board-wide raw model gap
is 7.6 pp and selected legs sit 16.2 pp from market; if even a fifth of that is model error
rather than information, the crossover is breached. The global reliability slope is
**1.70 (SE 0.41, n=70)** — above 1, which would favour parlays — but that is n=70 with the
clustering unit still unmeasured (`tools/icc.py` has not reported), and the H+R+RBI slope
criterion is precisely how this repo previously over-read a slope at small n.

**Recommendation: do not re-spec Phase 4 on this.** The decision reduces to one unmeasured
calibration parameter with a stated threshold — **−3 pp per leg** — which is exactly the
quantity Phase 2 and the calibration channel exist to produce. Re-run this table when they do.

---

## THE STANDING RULE

> # Parlays win if per-leg overconfidence is under ~3 pp.
>
> Everything else about card structure follows from that sentence. The recommendation is not
> the doctrine; **this** is, and the recommendation ("don't re-spec Phase 4") is what it
> implies while the quantity is unmeasured.

Running estimate of the crossover, one row per board:

| board | Kelly | crossover (correlated) | crossover (independent) | notes |
|---|---|---|---|---|
| 2026-07-26 | ¼ | **3.05 pp** | 3.10 pp | first measurement, n=1 |

## Crossover sensitivity — it is stable

### To the Kelly fraction

| Kelly | singles staked | parlay staked | g_singles | g_parlay | **crossover** |
|---|---|---|---|---|---|
| **1/8** | $250 | $250 | 55.3 bp | 133.0 bp | **3.35 pp** |
| **1/4** (production) | $250 | $250 | 55.3 bp | 126.6 bp | **3.05 pp** |
| **1/2** | $250 | $250 | 55.3 bp | 126.6 bp | **3.05 pp** |

**The crossover moves 0.30 pp across a 4× range of Kelly fraction. The two settings are not
materially coupled** — which was the thing worth checking, since ¼-Kelly was chosen for
parameter uncertainty and this shade models the same uncertainty.

**Two things fell out that were not asked for:**

1. **¼ and ½ Kelly are IDENTICAL.** Above roughly ¼ Kelly the Kelly ceiling stops binding
   and `perParlayCap` takes over: `kellyStakeMult × bankroll × 0.02` = 4 × 2500 × 0.02 =
   **$200**, far above `perParlayCap × daily` = 0.25 × 250 = **$62.50**. **The ¼-Kelly
   setting is load-bearing only on the downside** — raising it changes nothing at this
   bankroll/daily ratio.
2. **1/8 Kelly gives the parlay card HIGHER growth** (133.0 vs 126.6 bp) at the same $250
   total — followed up below.

### The 1/8-Kelly result, checked across card type and card size

| card | maxTix | picks 1/8 | staked | g 1/8 | picks 1/4 | staked | g 1/4 | **Δ** |
|---|---|---|---|---|---|---|---|---|
| singles | 6 | 6 | $250 | 55.3 | 6 | $250 | 55.3 | **+0.0** |
| singles | 10 | 10 | $250 | 48.0 | 10 | $250 | 48.0 | **+0.0** |
| singles | 15 | 15 | $250 | 61.5 | 15 | $250 | 61.5 | **+0.0** |
| **parlays** | 6 | 6 | $250 | **133.0** | 6 | $250 | 126.6 | **+6.4** |
| **parlays** | 10 | 9 | $250 | **141.3** | 9 | $250 | 136.2 | **+5.1** |
| **parlays** | 15 | 9 | $250 | **141.3** | 9 | $250 | 136.2 | **+5.1** |
| mixed | 6/10/15 | 6/10/15 | $250 | 55.3/48.0/61.5 | same | $250 | same | **+0.0** |

**Three answers, and they narrow the claim considerably:**

1. **It is a PARLAY-CARD-ONLY effect.** Singles show **+0.0 at every card size**; the Kelly
   ceiling never binds there. The mixed card is identical to the singles card because the
   singles dominate the ¼-Kelly weighting and take every slot — so "mixed" is not a third
   case on this board.
2. **It is not a small-card artifact.** It persists at 10 and 15 (+5.1 bp), though the parlay
   pool exhausts at **9** picks, so 10 and 15 produce the same card. Card size is therefore
   only tested up to 9 here, and that limit should be stated in any amendment.
3. **The total daily stake is $250 in every cell.** 1/8 Kelly **redistributes, it does not
   reduce**. The allocator always places the full daily; a tighter ceiling just forces a
   more even split.

> ### ⛔ CORRECTION: THE MECHANISM IS NOT OVER-CONCENTRATION EITHER
> I first framed this as "the allocator over-concentrates parlay stakes and 1/8 accidentally
> corrects for it." **That was wrong, and two measurements kill it.**
>
> **(a) Perfectly even is WORSE.** Same picks, stakes re-derived:
>
> | card | current | perfectly even | Δ |
> |---|---|---|---|
> | singles | 55.3 bp | 54.5 bp | −0.8 |
> | **parlays** | **126.6 bp** | **112.5 bp** | **−14.2** |
>
> **(b) 1/8 Kelly is MORE concentrated, not less** — max/min stake **4.14** vs **3.11**:
>
> | czEv of ticket | 7.0% | 12.9% | 25.5% | 26.5% | 3.3% | 6.6% |
> |---|---|---|---|---|---|---|
> | stake @ ¼ | $59 | $53 | $49 | $46 | $24 | $19 |
> | **stake @ 1/8** | $55 | **$58** | **$53** | **$49** | **$14** | $21 |
>
> **1/8 moves money toward the high-edge tickets and away from the 3.3% one.** Evenness has
> nothing to do with it.
>
> ### THE ACTUAL MECHANISM — the disciplined allocator weights by PROBABILITY, not edge
>
> `legacy/index.html` L2999:
> ```js
> base: probMode ? prob : ((dec>1) ? Math.max(ev,0)/(dec-1) : 0)
> ```
> with `probMode = mode==="probability" || mode==="ev_gated" || basisMode` — **true for every
> disciplined mode, including the production default.** So the stake weight is the ticket's
> **hit probability**, and *edge enters the allocation only through the Kelly ceiling*.
>
> **And the comment above it (L2934) describes the other branch:** *"stake weight =
> ¼-Kelly-proportional fraction: edge ÷ odds"*. That is the `caesars_ev` legacy path, which
> production never takes. **Comment and code diverge on the load-bearing line**, which is why
> this took three attempts to characterise.
>
> At ¼ Kelly the ceiling is slack (`4 × 2500 × 0.02` = $200, far above `perParlayCap`'s
> $62.50), so probability weighting dominates and the highest-edge tickets are under-staked.
> At 1/8 the ceiling binds and re-sorts toward edge. **1/8 Kelly is not a risk setting here —
> it is the only thing making the allocation edge-aware.**
>
> Singles show +0.0 because they sit in a narrow band on *both* axes (probability 63.5–70.7%,
> edge 2.1–13.5%), so probability-weighting and edge-weighting agree.
>
> ### ⚠️ base = prob IS DELIBERATE, NOT DRIFT — `2292b85`, 2026-07-17
> Git says so, and the commit message states the rationale outright:
>
> > *"Update 1 — **selection_mode (default: probability)**: Sharp plays + Builder card
> > selection rank by engine true % anchored to the multi-book consensus; **Caesars prices
> > and sizes, never chooses**; `caesars_ev` legacy ranking selectable in Settings."*
>
> **So the code follows a written spec (`update-calibration-and-selection`) and the COMMENT
> at L2934 is the stale artifact** — it describes the pre-2026-07-17 default, which is now a
> Settings option. This downgrades the finding from "production diverging from its documented
> intent" to "a deliberate design decision with a stale comment above it, whose growth cost
> was never measured".
>
> ### Measured cost of that decision — and it is not 5–6 bp
>
> `shAllocate`'s source patched at **exactly one expression** and re-evaluated in the sandbox
> scope, so every other line — gates, greedy pass, caps, rounding — is production code.
> (Switching `selMode` to `caesars_ev` would also give the edge weight but disables the EV
> floor and consensus gate at the same time, which confounds it.)
>
> | base weight | singles | parlays | mixed | **crossover** |
> |---|---|---|---|---|
> | **`prob`** (production) | 55.3 bp | 126.6 bp | 55.3 bp | **3.05 pp** |
> | `max(ev,0)/(dec−1)` | **149.7 bp** | **187.2 bp** | **149.7 bp** | **1.40 pp** |
> | `ev/(dec−1)` signed | 149.7 bp | 187.2 bp | 149.7 bp | 1.40 pp |
>
> Edge-aware weighting is worth **2.7× on singles** and **1.48× on parlays** — an order of
> magnitude more than the ~5–6 bp/day the Kelly-fraction observation suggested. Signed and
> clamped variants are identical because every selected ticket already has `ev > 0`.
>
> ### ⚠️ AND IT HALVES THE ROBUSTNESS — the owner's prediction, confirmed
>
> **The crossover falls from 3.05 pp to 1.40 pp.** Edge-aware weighting concentrates stake
> into the highest-edge tickets, which is exactly where overconfidence bites hardest. Against
> a board-wide raw model gap of **7.6 pp**, a 1.40 pp tolerance is a materially more fragile
> position than 3.05.
>
> **This reframes the 2026-07-17 decision as defensible.** "Rank by probability, let price
> size" buys robustness to model error at a large cost in face-value growth — and robustness
> to model error is the concern that motivated the entire freeze. The spec did not state that
> tradeoff, and now it is quantified in both directions.
>
> ### PROPOSED POST-FREEZE AMENDMENT (unsigned): decide the tradeoff explicitly
>
> Not "switch to edge-aware". The amendment is to **choose knowingly** between:
> - **`prob`** — 55.3/126.6 bp, tolerates 3.05 pp of per-leg overconfidence;
> - **`max(ev,0)/(dec−1)`** — 149.7/187.2 bp, tolerates 1.40 pp.
>
> **The right choice depends on the same unmeasured scalar as everything else in this
> document**, so it belongs in the same signature as the leg-equivalent floor and `consMinEv`
> — and it should be made *after* Phase 2 reports, not at freeze exit by default.
>
> **Fix the comment at L2934 regardless.** It is the only part of this that is unambiguously
> wrong, and it cost three attempts at characterising the code beneath it.

**Kelly fraction stays frozen at ¼.** This is specified, not proposed.

### To whether the bias is correlated or independent

**Correction to the premise: the original table was already the CORRELATED case.** Section 4
subtracts the same δ from every leg deterministically — one common optimism bias, which is
the harder case for parlays. The independent case had not been modelled.

Running it anyway, with the same **mean** bias delivered as an independent per-leg draw
(uniform on [0, 2δ], 4000 draws):

| | crossover |
|---|---|
| correlated (common δ, deterministic) | **3.05 pp** |
| independent (per-leg draw, same mean) | **3.10 pp** |

**Identical to within 0.05 pp, and that is algebra rather than luck:** under independence
`E[Π(pᵢ − εᵢ)] = Π(pᵢ − δ)`, so the ticket's *expected* probability is the same either way.
Only the dispersion the log sees differs, and at these leg counts that is second-order.
**Correlated bias does not hit parlays harder than independent bias of the same mean.**

## PROPOSED POST-FREEZE AMENDMENT — scale the EV floor by leg count

**Not a change request. Frozen. This is the arithmetic laid out so freeze exit is a signed
decision rather than a rediscovery.**

### The defect

`coreEvMin` is a **fixed** ticket-level floor of +2%. Ticket EV compounds, so the implied
per-leg bar *falls* as legs are added, while `consMinEv` — being multiplicative — *rises*:

| legs | `coreEvMin` implied per-leg bar | `consMinEv` implied per-leg bar |
|---|---|---|
| 1 | +2.00% | −1.000% |
| 2 | +1.00% | −0.501% |
| 3 | **+0.66%** | **−0.334%** |

**Two gates, opposite directions, on the same axis. Neither was designed with the other in
mind.** A floor that means a different thing at each leg count is a defect independent of
which way the EV comparison lands.

### Measured over-admission, board 2026-07-26

| legs | leg-equivalent floor `1.02ⁿ−1` | core-eligible in pool | pass fixed +2% | pass leg-equivalent | **over-admitted** |
|---|---|---|---|---|---|
| 2 | +4.04% | 28 | 8 | 7 | **1** (12.5%) |
| 3 | +6.12% | 19 | 10 | 7 | **3** (30.0%) |
| **total** | | **47** | **18** | **14** | **4 (22%)** |

**Over-admission scales with leg count exactly as the arithmetic predicts** — 12.5% at two
legs, 30% at three.

### What the amendment would do to the card, and to the decision variable

| | picks | staked | stake-wtd EV | E[ln(B′/B)] | **crossover** |
|---|---|---|---|---|---|
| fixed +2% floor | 6 | $250 | 15.08% | +126.6 bp | **3.05 pp** |
| **leg-equivalent floor** | 6 | $250 | **16.45%** | **+139.1 bp** | **3.50 pp** |

**The amendment improves the card on every axis and raises the crossover by 0.45 pp** — i.e.
it makes the parlay-first conclusion *more* robust to overconfidence, not less. That is the
opposite of what a tightening usually does, and it is because the tickets it removes are the
ones carrying sub-par legs.

### Proposed amendment text (unsigned)

> Replace the scalar `coreEvMin` comparison in `shAllocate` with a leg-count-scaled floor:
> `selEv >= (Math.pow(1 + coreEvMin/100, pl.legs.length) - 1) * 100`. At one leg this is
> identical to today's behaviour, so singles are unaffected. `coreEvMin` keeps its meaning as
> *the required EV per leg*, which is what it reads as and has never been.

**Not to be applied during the freeze**: it would move ticket selection, and the frozen
parameter table is the drift detector. **Sign at freeze exit or reject explicitly.**

> ### DECIDE THIS TOGETHER WITH `consMinEv` — one amendment, not two
> The two gates are functions of the **same variable**, leg count, and they move in opposite
> directions: `coreEvMin` under-filters as legs increase, `consMinEv` over-filters. Amending
> either alone changes the *net* leg-count preference by an amount that depends on the other,
> so two separate decisions would interact in a way neither was evaluated against.
>
> Concretely: scaling the EV floor removes 4 of 18 tickets — all multi-leg — which shifts the
> card toward fewer legs. `consMinEv` already shifts it that way, harder. A single amendment
> must state the **combined** implied per-leg bar it is choosing at each leg count:
>
> | legs | `coreEvMin` bar (scaled) | `consMinEv` bar | net effect on leg count |
> |---|---|---|---|
> | 1 | +2.00% | −1.000% | — |
> | 2 | +2.00% | −0.501% | tighter than today |
> | 3 | +2.00% | −0.334% | tighter than today |
>
> Scaling the EV floor makes the per-leg bar **flat** at +2%, which is the point. But
> `consMinEv`'s bar keeps rising, so the combined gate still penalises leg count — just less
> arbitrarily. **Whether that residual leg-count penalty is intended is the actual decision**,
> and it cannot be made by looking at either gate alone.

---

## B. INFORMATION YIELD — the premise needs correcting

The question assumed 46 unconfounded leg results vs 18 confounded ticket results, feeding the
projected dates. **The three named consumers do not read the ledger at all:**

| consumer | source | structure-dependent? |
|---|---|---|
| `mktN[m] = summary.reliability[m].n` | prediction store (`/api/calibrate` grades **every pending prediction record**, not just ledger legs) | **no** |
| `GAP_BUCKET_MIN_N` / `fitByEv` | `gradedFromBlob` → prediction store | **no** |
| ICC units (`tools/icc.py`) | the prediction blob's records | **no** |

**So none of the projected dates move** — not the `mktN` crossings, not
`GAP_BUCKET_MIN_N`, not the ICC. All three consume board rows, which accrue at ~70
graded/day regardless of what is bet. This is the same finding as the Phase 2 x-axis
correction in `docs/collection-period.md`: the gate does not reach the prediction store.

What *does* change is the **ledger channel**, and it is smaller than the question implies
because the card is 6 tickets either way:

| | bets/day | legs covered | observations |
|---|---|---|---|
| singles-first | 6 | 6 | **6 unconfounded** |
| parlays-first | 6 | ~15 (2–3 per ticket) | 6 confounded |

Singles-first buys **cleaner** ledger observations, not more of them, and trades away leg
coverage (6 vs ~15). Since the learning channel is the prediction store and the ledger is
dark anyway, **information yield is close to a non-argument for this decision.**

---

## C. CORRELATION SELECTION — the only mechanical case for a parlay

Real board, no counterfactual. Of **218 tickets emitted**, **25 contain a same-game group**
(≥2 legs sharing a `gkey`) and **22 carry `simJoint = true`** — the sim actually repriced them
from joint paths. Four HR tickets round to 0.0% probability and yield no ratio, leaving **19**.

`jointAll / naive-product`:

| min | p25 | median | p75 | max |
|---|---|---|---|---|
| **0.564** | 1.000 | **1.029** | 1.067 | 1.192 |

| > 1.10 | > 1.25 | > 1.50 | **below 1.00** |
|---|---|---|---|
| **4** | **0** | **0** | **2** |

> ### The mechanical case for a parlay is present in 4 of 218 tickets — 1.8%
> The median same-game group is worth **+2.9%** over the naive product, and **nothing on the
> board exceeds +25%**. Correlation is not why this engine builds parlays; it builds them
> anyway and occasionally gets a small bonus.

**Two tickets are correlation-PENALISED at 0.564** — a 44% haircut, joint 21.6% against a
naive 38.3%. Both are `Mixed · 2 legs`, and the engine **correctly detected them**
(`negCorr: true`, and the note field warns the user). **They were still built as parlays.**
That is the answer to "flag any group below 1": the detection works and nothing acts on it —
a negatively-correlated pair should be two singles or one leg, never a ticket.

**Measurement caveat:** `prob` and `probNaive` are stored rounded to 0.1pp, so a ratio of
exactly 1.000 (4 of 19) means "no effect survived rounding", not necessarily "no effect".
The four ratios above 1.10 and the two below 1 are far outside rounding.

---

## D. TODAY'S CARD UNDER A SINGLES-FIRST RULE

Same board, same frozen parameters, gate OPEN (the ~08-06 state), full 276-row pool:

| stake | ticket | czEv | hit |
|---|---|---|---|
| $46 | Outs · Framber Valdez (DET) | 13.5% | 70.7% |
| $42 | H+R+RBI · Jazz Chisholm Jr. (NYY) | 10.9% | 68.6% |
| $41 | Hits · Cooper Pratt (MIL) | 2.1% | 67.7% |
| $41 | Total Bases · Masyn Winn (STL) | 2.9% | 66.4% |
| $40 | H+R+RBI · Jackson Holliday (BAL) | 2.7% | 65.1% |
| $40 | H+R+RBI · Nicky Lopez (TEX) | 2.6% | 64.6% |

$250 staked, stake-weighted EV **5.98%**. **With the gate enabled (today): 0 picks,
`{"consensus": 46}`.**

⚠️ **The top single is `Outs · Framber Valdez` — the market with three confirmed defects**
(`docs/pitcher-outs-audit.md`), taking the largest stake on the card in both A1 and D. A
singles-first rule concentrates rather than dilutes it: the parlay structure at least
required two other legs to co-operate. **Any singles-first proposal must be sequenced after
the outs fix, not before it.**

---

## Verdict

1. **Singles do not solve NO-PLAY.** 1 of 205 rows clears the bar; **none of the wall is
   compounding** — 24 of 24 gate-reaching singles are blocked.
2. **Exposure is identical.** 6 tickets, $250, in every scenario — `maxCoreTickets` binds.
3. **Information yield is a non-argument.** The learning channel is the prediction store,
   which is structure-independent; only the dark ledger channel changes, and only in
   cleanliness (6 unconfounded vs 6 confounded), not volume.
4. **Correlation justifies a parlay 1.8% of the time**, never by more than +19.2%, and the
   engine builds two tickets a day it has itself measured as *negatively* correlated.
5. **Singles-first would concentrate the outs defect**, not dilute it.

**No recommendation is made and no parameter is proposed.** The one item this surfaces that
is independent of the singles question: **`negCorr` is detected, disclosed and then ignored
by the builder.**
