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
