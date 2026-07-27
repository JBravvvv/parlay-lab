# Freeze-exit amendment bundle — DRAFT, assembled 2026-07-27

**Nothing here is shipped.** This exists in draft now so 2026-09-22 is a decision rather than an
assembly job. Every item carries **its measured effect, its axis, and what it depends on** —
a verdict without a magnitude cannot be re-checked, and this project has reopened three closed
threads already.

> ## ⚠️ THE WHOLE BUNDLE IS GATED ON A POSITIVE PHASE 2
> Every model amendment corrects conditioning, and every allocation amendment corrects machinery
> that **assumes an edge exists**. A negative Phase 2 — *with* the identification diagnostic
> showing the fit had power — makes all nine irrelevant, and the correct action is to go back to
> the model rather than apply any of them. See `docs/collection-period.md`, "the two exits".

## Two axes. They are not commensurable and must not be merged into one list.

| axis | what it changes | unit |
|---|---|---|
| **MODEL** | model-minus-market | **pp of probability** |
| **ALLOCATION** | what gets bet, not what is believed | **bp of log-growth** |

Ranking all nine on "effect on model-minus-market" would put four at exactly zero and read as
"no effect" rather than "wrong axis".

---

## MODEL axis

| # | amendment | measured effect | depends on | status |
|---|---|---|---|---|
| **M1** | **`shParkF` → the closed-form factors** | **VARIANCE, not level.** Per-row error today: hit rate 1.5% median / 3.5% max; **HR rate 4.5% median / 11.0% p90 / 14.5% max**. But across the 07-26 venues the **mean** `parkH` is **1.0013** and `parkHR` **0.9720** — so routing moves the hits LEVEL by **+0.13%** and the HR level by **−2.80%**. **The −4.3 pp hits level error survives essentially untouched**; M7 is what addresses it | nothing. Self-contained | **ready to spec** |
| **M2** | **`pitcher_outs` constant `0.140` → `0.400`** | gap **−23.3 → −11.5 pp**; above-market rows **0/38 → 11/38**; median λ 13.7 → 15.3 | nothing | **the recommendation** |
| M2′ | *alternative:* `pitcher_outs` → sim (surface `outsBySP*`) | the sim already models the hook the closed form structurally cannot use; distribution exists and is discarded | a validation pass — **every outs price moves** | strictly better, **not** additional to M2 |
| **M3** | **H+R+RBI λ conditioning** (mass-weighted blend of `hF`/`tbF`, not a product) | closed-form λ is `rate × power` on a non-Coors slate — **zero site variation** against a market rung-drift of **+0.479**. Recovers ~0.12 of spread on its own; more with M1 | M1 for the park term. Weights need fitting | scoped |
| **M4** | sim routing, **TB and HR only** | vs market: TB sim **5.7** vs closed form **6.3** mean-abs; HR **3.5 vs 3.5**, sim better centred (+0.4 vs −1.1) | archive-series confirmation — fixture margins are thin | **conditional** |
| ~~M5~~ | ~~sim routing for `batter_hits`~~ | **REFUTED.** Sim overshoots market **+5.0**, closed form undershoots **−4.3**, and the sim's mean-abs error is **worse: 7.1 vs 5.6** | — | **rejected on evidence** |
| **M7** | **`shPOver` uses POISSON on 0.5 lines where the process is BINOMIAL** | **derived**: `(1−p)^n < e^{−np}` always, so `P(≥1)` is always understated. **+4.9 pp** median on a realistic grid, **+6.3 pp** re-priced on the board's own 36 hits O0.5 rows. Measured `batter_hits` cf−market: **−4.3 pp** — the family error accounts for the whole level miss. **Cross-market check passes**: predicted +0.3 pp for HR (tiny per-AB p), measured −1.1 | nothing. One function | **new, rank 1 on hits** |
| **M6** | `pitcher_strikeouts` → sim (sixth PA outcome) | K's are **169 rows**, core-eligible, priced with **no simulation of the quantity they are about** | the second-RNG-stream design (below) | **sized, see next section** |

**M1 is now the largest model amendment.** It was ranked third when sim routing looked like it
would subsume it; the external check removed hits from sim routing, so `shParkF` is the only
amendment that reaches hits, K's, outs and every game the sim misses.

### M1's double-counting check — not optional

`(coors?1.07:1)`, `(coors?1.10:1)` and `(coors?1.08:1)` **are park factors**, and Coors Field is
in the park table. **They must be removed in the same change**, or Coors is applied twice:
`1.07 × 1.085 = 1.16` where the table says `1.085`. `parkH` → `hF`/`tbF`; `parkHR` → `hrF`;
keyed on batter stand, which the closed form already has.

---

## ALLOCATION axis

| # | amendment | measured effect | depends on |
|---|---|---|---|
| **A1** | **edge-aware base weight** — `base = max(ev,0)/(dec−1)` instead of `prob` | log-growth **126.6 → 187.2 bp**; **crossover 3.05 → 1.40 pp** | nothing. `2292b85` made `prob` deliberate, so this is a reversal, not a bug fix |
| **A2** | **leg-equivalent EV floor** — `1.02^n − 1` instead of a fixed +2% | **4 of 18 tickets (22%)** admitted only because the floor does not scale; crossover 3.05 → **3.50 pp** | nothing |
| **A3** | **`consMinEv` multiplicative structure** | the per-leg bar **tightens** with leg count — **−1.000% / −0.501% / −0.334%** at 1/2/3 legs — driven by the **1.071** Caesars overround. A **structure filter wearing a quality filter's name**, running opposite to `coreEvMin` (+2.00 / +1.00 / +0.66%) | nothing. Josh's call: not changed — **but see the requirement below** |

| **A4** | **stake concentration under `perParlayCap`** | 1/8 vs 1/4 Kelly: **+6.4 bp** at 6 tickets, **+5.1** at 10/15; singles **+0.0 at every size**. Total staked **$250 in every cell**. The mechanism is **concentration, not the Kelly fraction** — the fraction stays at ¼ | A1. With edge-aware weighting the concentration profile changes and this must be re-measured before it is applied |

> ### 📅 A3 REQUIREMENT — a decision must EXIST on 2026-09-22
> `consMinEv` is currently blocking **100% of tickets**, and the reopening dates run to
> **2026-09-03**. So at freeze exit it will have blocked **the entire collection window** while
> remaining unproposed — a parameter that shaped every day of the freeze and was never decided.
>
> **By exit, one of two things must be on the record: a specified replacement, or an explicit
> re-affirmation with its reason.** "Still unproposed" is not an outcome.
>
> This is a requirement that the decision *exists*, not a decision now. **It is written down for
> exactly the reason the 22:45 cron spent fifteen days landing at 07:30** — an unrevisited
> temporary choice becomes permanent by inattention, and the only defence is a date.


**A3 and A4 are recorded-not-proposed.** A3 is a decided no; A4 is measured but its input changes
if A1 ships, so applying both without re-measuring would be acting on a stale number.

---

## What still has no measured effect

| open item | why it is not in the bundle |
|---|---|
| ~~`batter_hits` −4.3 pp undershoot~~ | **RESOLVED same day — see M7.** The Poisson-vs-binomial family error is +4.9 pp derived / +6.3 pp re-priced on the board, which accounts for the whole miss. Cross-market check passes |
| **the sim's +5.0 hits OVERSHOOT** | leading candidate is the **endogenous PA count** — a batter's plate appearances depend on how the lineup performs, so a hot offence raises `P(≥1)` twice over. Traced to the mechanism, **not measured** |
| `batter_total_bases` **2.30 over-dispersion** | mechanism candidate is M1 (`tbF` cannot distinguish 29 of 30 parks) but unconfirmed |
| HRR residual beyond the PA clamp | M3 is the leading traced candidate; **still a hypothesis until Phase 2's rung test** |
| `shUmpKf` / `shPenQF` activation | both pinned; `shUmpKf`'s input was being destroyed nightly until 2026-07-27, so its shadow log has no usable history yet |

## Closed, with magnitudes — so they stay closed

| item | verdict | **magnitude** |
|---|---|---|
| `shLaborF` dead zone | by design, band centred at ~p17/p78 of today's starters | **−4% / +2% on 38% of starts, against a 23.5 pp gap** — an order of magnitude too small to be the outs story |
| HRR range compression | retracted — an artifact of `categories`' probability rank | uncapped `propBoard` reads **1.78, WIDER**, not 0.50 |
| `expAB/abG` "denominator mismatch" | retracted — the algebra is correct | `(HRR/G) × expAB/(AB/G) = (HRR/AB) × expAB`; the units cancel |
| 1/8 Kelly as "over-concentration" | wrong — perfectly even is worse | **112.5 vs 126.6 bp**; 1/8 is *more* concentrated (max/min 4.14 vs 3.11) |
| `base = prob` as unintended | wrong — deliberate per `2292b85` | the **comment** is stale, not the code |
| Phase 3 per-market shrink band | no shrink; **no CI excludes 1** | WITHIN **1.00 [0.90, 1.17]**, n=37 legs — revisit at ≥20 boards (**2026-08-15**) |
