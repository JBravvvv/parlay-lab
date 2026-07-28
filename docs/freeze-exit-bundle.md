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
| **M4** | sim routing, **TB and HR only** | vs market: TB sim **5.7** vs closed form **6.3** mean-abs; HR **3.5 vs 3.5**, sim better centred (+0.4 vs −1.1) | archive-series confirmation — fixture margins are thin. ⚠️ 2026-07-27: these are fixture-market readings of prices riding the shared M11 rate estimator plus the sim-path additions (hits rate heat +3.8 to +8.3 pp depending on basis); the gate must separate market vintage from rate heat | **conditional** |
| ~~M5~~ | ~~sim routing for `batter_hits`~~ | **REFUTED.** Sim overshoots market **+5.0**, closed form undershoots **−4.3**, and the sim's mean-abs error is **worse: 7.1 vs 5.6** | — | **rejected on evidence** |
| **M11** | **hot-form under-shrinkage** — residual +0.79 pp per 10 points of last-30 average (SE 0.09, t≈9) while xwOBA pct carries **nothing**: the model diverges from the market on recency, not skill. Candidate: `shShrink(…, 60, prior)` k=60 too weak | ~8 pp residual between a .320 and a .220 last-30 hitter | same grading rows adjudicate it (bucket by avg30 tercile) | **RANK 1 — WHOLE-ENGINE (2026-07-27).** A BUG (intent-vs-behaviour): `shShrink`'s comment forbids hot-streak chasing, but the rate it shrinks is 100% last-30, nested-recency-weighted (a last-week AB ≈ 5.5× a week-3/4 AB) with `n` overstated ~1.5×. **And the sim's per-PA rate is the IDENTICAL `shBlendN`→`shShrink` chain (`batVec` L2065-67)** — the contamination reaches every batter price through BOTH paths, which is the pre-committed condition for outranking M8. Fix SHAPE = season term + honest n; **weights GATED on the recency-weight regression** (`docs/collection-period.md`) — never specced from intent. Magnitude per-market still PROVISIONAL — one board |
| **M8** | **`shTbOver` prices a 0.5 line with the 1.5 formula** — `if(line<2)` catches both, and `1−(P0+P1·s1)` is `P(TB≥2)` | **a DEFINITE bug, proven with no external reference.** TB O0.5 and hits O0.5 are the same event; the market prices them **0.1 pp** apart and the model **24.4 pp** apart (33.6% vs 58.1%), on 127 joined rows of the real board | nothing. **One comparison**: `if(line<1)return 1-P0;` | **RANK 2** (demoted 2026-07-27 — M11's reach is every batter price; M8 keeps the largest single-population magnitude). A bug, not a calibration |
| **M7+M9** | ⚠️ **INTERLOCKED PAIR — ship together or not at all.** M7: `shPOver` uses Poisson where the process was assumed binomial. M9: the compensating term hiding it | ⚠️ **M9-AS-UNIFORM-λ-INFLATION REFUTED 2026-07-27** (`tools/rung_signature.py`): uniform +13.9% predicts **+5.7 pp** at hits O1.5; measured within-player **+1.4–2.0**; paired shortfall **+4.35 pp, t = 11.1** (n=17). The fixed-n binomial *reference* fails with it — the market prices hits ~70% of the way to Poisson, so **both magnitudes were computed against a reference the market refutes**. Net real rung structure: **+1.4–2.0 pp at O1.5** | **each other, still** — swapping `shPOver` to binomial alone still moves 617 rows ~5 pp regardless of what truth is. Re-derivation needs the reference distribution as an output, not an assumption: **graded outcomes** (the expAB-tercile grading test, 3σ ~08-20, doubles as the reference) | **needs re-derivation — held, demoted below M10** |
| **M10** | **closed-form expAB over-steepness** — hits O0.5 residual climbs **+7.39 pp/AB (SE 1.73, n=135/232)**; survives quality controls (+6.16, SE 1.57); walk-discount component 4 SE; **sim-priced HRR is FLAT (+0.73, SE 2.54)** — two independent volume models (sim, market) agree against the closed form's `λ = rate × expAB` | ~12 pp of residual span across expAB 3.0–4.6 — the largest structure on the hits board | grading by expAB tercile (135 covered rows/day, **3σ ~08-20**) decides who owns the gradient; the archive series re-measures daily | **PROVISIONAL — one board; mechanism traced 2026-07-27: errors-in-variables in `bbr`** (three convergent signatures — SD(bbr) 0.0908→0.0545 across ab30 quartiles, walk-dim slope ~halves, full-noise slope +9.4 vs measured +7.39; `tools/m10_eiv.py`). **Specified fix: `shShrink(bbr, n, k≈75, lgBB)` before expAB — 0.9 untouched.** The blend has no window past 30 days, so the noise floor is structural — the flat limb of the EIV test cannot exist, which is the stronger form of the finding. ⚠️ The sim's `pBB` consumes the SAME `bbr` (2026-07-27), narrowing the HRR-flat discriminator (HRR is walk-neutral by accounting) and killing sim-volume routing as an escape — the shrink fixes both consumers at one line |
| **M6** | `pitcher_strikeouts` → sim (sixth PA outcome) | K's are **169 rows**, core-eligible, priced with **no simulation of the quantity they are about** | the second-RNG-stream design (below) | **sized, see next section** |

**M1 is the largest amendment on the FACTOR axis** (superseded 2026-07-27 as overall leader by
M11, whose estimator reaches every batter price in both paths). It was ranked third when sim
routing looked like it would subsume it; the external check removed hits from sim routing, so
`shParkF` is the only amendment that reaches hits, K's, outs and every game the sim misses.

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
| ~~`batter_hits` −4.3 pp undershoot~~ | **WITHDRAWN 2026-07-27 — it was a fixture artifact.** The real board reads **+0.3 pp** on the same statistic. There is no hits level error in production to explain |
| **`batter_total_bases` 2.30 over-dispersion** | **likely collapses into M8** — a rung priced as the next one up inflates apparent λ-drift. Re-run the ladder test with the 0.5 rung excluded to confirm |
| **the sim's +5.0 hits OVERSHOOT** | leading candidate is the **endogenous PA count** — a batter's plate appearances depend on how the lineup performs, so a hot offence raises `P(≥1)` twice over. Traced to the mechanism, **not measured** |

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
