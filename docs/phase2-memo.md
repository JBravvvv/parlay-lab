# Phase 2 — model-vs-close, design memo (2026-07-26)

**Status: memo only. No code. Report-only during the freeze — no weight moves, and exit
condition 3 stays unsigned until the instrument produces numbers.**

## WHEN THE SYNC PHRASE BINDS — read this first

It binds in exactly one place, and less than has been assumed:

| half | needs the phrase? | why |
|---|---|---|
| **inputs accruing** (`fp`, `fair`, `cz` in `props-history`) | **NO** | a GitHub Actions archive on the `line-history` branch, public |
| **computing the close fair** for every board row | **NO** | pure arithmetic over that archive |
| **joining close → model `p`** | **YES** | `p` lives behind `/api/predictions`, sync-gated |
| **the panel that displays it** | **YES** | reads the joined result |

**So the instrument accumulates whether or not the owner acts, and only reporting requires
his key.** Nothing is lost by not running it; nothing accrues faster by running it. That is
the opposite posture from CLV, where the *capture* itself needed the phrase and a missed
sighting was gone forever.

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
