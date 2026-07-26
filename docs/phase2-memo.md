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
**17.3 probability points** from the de-vigged market, against a board median of **7.6** —
a **2.28× winner's-curse ratio**. Two readings fit that, and they have opposite
consequences:

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
