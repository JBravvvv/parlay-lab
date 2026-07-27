# `pitcher_outs` — model defect audit (2026-07-26)

**Status: FINDING. Nothing changed. Frozen-parameter question, owner's to sign off.**

Opened because `pitcher_outs` supplied **46% of the selected legs** on the 2026-07-26 board
while being 12.5% of board rows, at a board-wide median disagreement of **23.1 pp** — 3× the
board median, 8× `rl`'s — in a market the books price competently.

The mechanism was already written down in a different document. `docs/hrr-recalibration.md`
says of the closed form: *"Expected innings: not explicitly in the closed form — there is no
hook-timing term."* **Pitcher outs IS expected innings.** That audit found the hole while
looking at H+R+RBI and never checked the market it most directly governs. This is the
fourth instance of the class in `docs/harness-substitutions.md`: a finding recorded against
the wrong subject.

---

## The model, verbatim

`legacy/index.html` L2246–2267, the `isOuts` branch:

```js
ipg = ip30 / g30                              // IP per game, last 30 days (needs g30 >= 3)
ipg = shShrink(ipg, nOut, 4, Lipg)            // empirical-Bayes toward the league starter mean
var of = 1, oo = offense(oppL);               // offense() returns TB/AB — slugging
if (oo != null) of = shClamp(0.140/oo, 0.86, 1.12);
lam = ipg * 3 * of;
lam *= shLaborF(st);                          // pitch-count efficiency
```
then `shPOver(line, lam) = 1 - shPoisCdf(floor(line), lam)`.

---

## 1. UNIT CHECK — the model prices the right quantity

**The outs/innings factor-of-three hypothesis is DISCONFIRMED.** Traced end to end on a
real row (Framber Valdez, DET, 2026-07-26):

| step | value | check |
|---|---|---|
| `st.last30` | 18.7 IP over 4 starts | innings |
| `ipg` raw | 4.67 IP/start | innings |
| `ipg` shrunk | (4.67 + 5.60)/2 = **5.14** | innings — `Lipg ≈ 5.60`, correct for a starter |
| `× 3` | 15.42 | **outs** — the conversion is present and correct |
| `× of` (0.86) | 13.26 | outs |
| published `lam` | **13.3** | ✓ reproduces |
| `shPOver(17.5, 13.3)` | `1 − PoisCdf(17, 13.3)` = 12.7% | P(outs ≥ 18) — line semantics correct |
| board `pModel` | **12.7%** | ✓ |

`Lipg = LP.ip / LP.gs` was the suspect (league *total* innings over league *starts* would
be the whole staff attributed to the starter, ≈ 8.8). **Solved from the data instead of
assumed**: three rows have no opposing-lineup read, so `of = 1.00` and `Lipg` is recoverable
in closed form. Cristopher Sanchez, `ipg` raw 5.67, published `lam` 16.9 →
`Lipg = 2×(16.9/3) − 5.67 = 5.60`. Cross-checks on Gilbert (predicted 15.93, published 15.9)
and Rasmussen (13.13 before `labF`, published 13.4 after an "efficient" tag). **`Lipg` is
correct and is not the defect.** Units are right throughout.

---

## 2. SIGN — one-sided, on the side-neutral population

The first sign reading was taken on `categories` and was **an artifact**. `categories` is,
in the engine's own words, *"top 50 per market ranked by win probability, **ONE side per
line (the side the model favors)**"*. `|gap|` is side-invariant so magnitudes survive that
selection; **the sign cannot**. `propBoard` carries `pO`/`fO` both oriented to the OVER for
every priced line, uncapped — that is the population the sign question needs.

One further correction inside that fix: `propBoard.pO` is the **blended** probability
(`modelBy` reads `r.p`, not `r.pModel`). Verified on a **273-row join** against `categories`
— 0 fair mismatches, ratio `(pO−fO)/(pModel−fair)` median **0.350** = `wBlend`. Raw model
gaps below are the blended figure ÷ `wBlend`.

**Signed raw model gap (`pModel_over − fair_over`), side-neutral, alt ladders excluded:**

| market | n | median | mean | **% above market** |
|---|---|---|---|---|
| **`pitcher_outs`** | **38** | **−23.1** | −24.3 | **0%** |
| `batter_total_bases` | 350 | −4.6 | −6.6 | 36% |
| `batter_home_runs` | 246 | −0.6 | +0.3 | 45% |
| `batter_hits` | 267 | +0.3 | +0.9 | 51% |
| `batter_hits_runs_rbis` | 271 | +4.6 | +4.6 | 66% |
| `pitcher_strikeouts` | 35 | +8.3 | +4.9 | 71% |
| ALL | 1207 | −0.6 | −1.4 | 48% |

> **`pitcher_outs` is the only market that is 100% one-sided.** 0 of 38 rows have the model
> above the market. Under a null of symmetric noise that is p = 2⁻³⁸. Every other market
> straddles. **This is systematic, not noise and not line-matching.**

Downstream: **35 of 38** outs board rows are UNDERs, and **17 of 17** selected outs legs are
UNDERs. The engine's most-selected market is a one-way bet against the books.

---

## 3. MAGNITUDE IN OUTS — invert the market through the engine's own Poisson

Probability gaps confound the line's position with the mean. Solving `1 − PoisCdf(⌊line⌋,
λ) = fair_over` for `λ_market` puts both sides on the same scale **and cancels the
distributional assumption**, since the same Poisson is used for each.

> ### λ_model − λ_market = **−2.48 outs** (−0.83 IP) median. **Negative in 38 of 38.**
> Range −0.8 to −5.5 outs. Median λ_model 13.7 · λ_market 16.1.

---

## 4. THE PRIMARY DEFECT — `0.140` is the wrong league constant, and the factor is a flag

```js
var of = shClamp(0.140/oo, 0.86, 1.12);   // oo = offense(oppL) = TB/AB
```

`offense()` returns **TB/AB — slugging**, league mean **≈ 0.40**. The neutral point is set at
**0.140**. `0.140` appears **exactly once in the entire engine**; it has no sibling and no
comment. The same file uses the correct constant elsewhere — the batter-vs-pitcher
adjustment is `shClamp(1 + ((bvp.tb/bvp.ab)/0.40 − 1)*w2, 0.90, 1.10)` — and the K's market
uses the correctly-scaled `shClamp((kr/c)/0.235, .8, 1.2)` against league K/AB. **The engine
knows the right number in two other places.** (`0.140` is roughly league *ISO* — SLG minus
AVG ≈ 0.15 — which is a plausible origin for the slip.)

**Measured on all 38 rows:**

| | |
|---|---|
| rows with an opposing-lineup read | 35 of 38 |
| `0.140/oo` range | **0.285 – 0.462** |
| rows landing on the **0.86 clamp floor** | **35 of 35 (100%)** |
| rows reading *"trims the start"* | **35** |
| rows reading *"lets him go deeper"* | **0** |
| `oo` observed | 0.303 – 0.492 (median 0.428) |

To reach the upper clamp 1.12 requires `oo ≤ 0.125` TB/AB — **a physically unreachable
slugging percentage for a major-league lineup.** The factor therefore has exactly **two**
reachable states:

- **0.86** — an opposing lineup was read (any lineup, of any quality)
- **1.00** — it was not

**It is not a factor. It is a flag for "lineup posted", worth a flat −14% on expected outs.**
It carries no information about the opponent, which is the only thing it exists to carry.

The clean demonstration is already on the board: **Cristopher Sanchez (5.67 IP/start raw)
is projected at 16.9 outs while Logan Gilbert (6.75 IP/start raw) is projected at 15.9** —
the pitcher with the *worse* workload gets the *higher* projection, purely because
Sanchez's opponent had no posted lineup and Gilbert's did.

### Counterfactual (arithmetic on the published `lam`, not a re-run)

`of` is a pure multiplier, so substituting `0.400` for `0.140` and holding shrinkage and
`labF` fixed is exact:

| | as built | with `0.140 → 0.400` |
|---|---|---|
| median raw gap | **−23.3 pp** | **−11.5 pp** |
| rows with model above market | **0 of 38** | **11 of 38** |
| median λ | 13.7 outs | 15.3 outs |
| median λ − λ_market | −2.48 outs | **−1.13 outs** |
| `of` values taken | 0.86, 1.00 | 0.86 – 1.12, **the full range** |

**The constant accounts for roughly half the gap and all of the one-sidedness.**

---

## 5. SPLIT BY LINE — the tail failure is a SECOND, independent defect

| line | n | λ_model − λ_market | with `0.140 → 0.400` |
|---|---|---|---|
| 14.5 | 8 | −1.78 | −0.51 |
| 15 | 2 | −2.73 | −0.57 |
| 15.5 | 10 | −1.74 | −0.63 |
| 16.5 | 5 | −2.71 | −1.22 |
| 17.5 | 6 | **−4.06** | **−2.57** |
| 18.5 | 5 | −3.87 | −3.61 |
| 19.5 | 2 | −3.65 | −3.65 |
| **≤ 15.5** | 20 | −1.83 | **−0.51** |
| **≥ 16.5** | 18 | −3.03 | **−2.57** |

**The gap grows toward the tail, and the growth SURVIVES the constant fix.** Corrected, the
model is nearly right (−0.5 outs) on pitchers the market expects to go ≤ 5.2 IP and still
badly short (−2.6 outs) on pitchers the market expects to go 6+ IP.

**This is the H+R+RBI O1.5+ signature in a second market** — the same distributional
failure, as suspected. The mechanism is the one `hrr-recalibration.md` named: there is no
term by which a pitcher *earns* a long start. A 30-day IP/G mean shrunk toward
`Lipg = 5.60` **cannot produce a 6.5 IP expectation for anyone**; the estimator is bounded
near the league average by construction, so every ace is regressed to a workload the market
knows he beats.

---

## 6. SPLIT BY PRICING PATH — the split is degenerate, and that is the finding

**`pitcher_outs` has no sim path at all.** The pregame sim marginal replaces `pO` for
**`batter_hits_runs_rbis` only**; the live-sim branch covers batter markets. Confirmed on
the board: **0 of 38 outs rows carry a `sim` or `live-sim` tag** (tags present:
`opp-offense` 35, `market-gap` 34, `consensus` 27, `shrunk-to-mean` 24, `laboring` 6,
`efficient` 4).

So the localisation the split was meant to provide is unavailable — but the reason is worse
than the answer would have been. The sim **does** model the hook explicitly (L1921: *"v2
manager hook: shelled (6+ runs) or deep (29+ batters) starters get pulled"*). **The engine
contains a manager-hook model, and it never reaches the one market that is entirely about
when the manager pulls the starter.** The closed form prices outs; the sim that understands
hooks prices totals.

---

## 7. LEDGER

From the public `/api/calibration`, `graded: 70`:

| market | n | predicted | actual | model Brier | consensus Brier |
|---|---|---|---|---|---|
| **`pitcher_outs`** | **5** | **0.532** | **0.000** | **0.285** | **0.215** |
| `pitcher_strikeouts` | 5 | 0.547 | 0.400 | 0.230 | 0.218 |
| `batter_total_bases` | 9 | 0.660 | 0.444 | 0.293 | 0.284 |
| `ml` | 15 | 0.550 | 0.600 | 0.234 | 0.235 |
| `rl` | 15 | 0.615 | 0.533 | 0.246 | 0.246 |
| `batter_hits` | 7 | 0.686 | 1.000 | 0.099 | 0.109 |
| `batter_hits_runs_rbis` | 7 | 0.639 | 0.714 | 0.206 | 0.218 |
| `batter_home_runs` | 7 | 0.220 | 0.000 | 0.049 | 0.053 |

**`pitcher_outs` is 0 for 5** at a stated 53.2%, and is **the only market where the model's
Brier is materially worse than simply taking the consensus fair** (0.285 vs 0.215; every
other market is within ±0.012 either way). P(0 of 5 | 0.532) = 0.022.

**Two things this is NOT.** (1) **n = 5.** It is corroboration of a defect established on
mechanism and on 38 board rows, not evidence in its own right. (2) The `significant: true,
direction: "hot"` flag on this row **must not be quoted**: the summary was written
**2026-07-26T10:23:49Z**, *before* `SIG_MIN_N = 50` was committed, so the flag is the old
Wilson-only rule evaluated at n=5. This is the stale-summary trap `tools/gate_activity.py`
documents, and it fires here.

---

## 8. THE THIRD DEFECT — the shrinkage weight, which neither fix touches

Splitting the tail result by *why* each row is short isolates a mechanism I originally
mis-attributed. The residual after the `0.400` substitution is **not** mostly the missing
hook term:

| median (model − market), outs | ALL (38) | lines ≤15.5 (20) | lines ≥16.5 (18) |
|---|---|---|---|
| closed form, as built | −2.48 | −1.83 | −3.03 |
| with `0.140 → 0.400` | −1.13 | −0.51 | **−2.57** |
| sim leash (see §9) | +0.03 | +0.39 | −1.68 |

```js
ipg = shShrink(ipg, nOut, 4, Lipg)   //  (n*ipg + 4*Lipg) / (n + 4)
```

**`nOut` is the pitcher's starts in the last 30 days, and on this board it is 4 for almost
every pitcher.** With `k = 4` and `n = 4`, the weight on the pitcher's own workload is
`4/(4+4)` = **exactly 0.5. Every starter is priced as half himself, half league average.**

Measured consequence: the shrunk estimator spans **4.67 → 6.17 IP/start** (median 5.32), and
**only 2 of 38 rows exceed 6.0 IP**. The market's expectation for the deep-start group is
6.2–6.5 IP. The estimator's *range* is the binding constraint — it is compressed into a band
the market's own distribution exceeds at the top.

**This is why the tail survives the constant fix**, and it is a distinct defect from both
others: `of` is a wrong constant, the hook is a missing term, and this is a **mis-set
shrinkage weight for the sample size available**. A 30-day window yields n≈4 starts; `k = 4`
was presumably chosen against a larger implied n.

**Correction to §5 of this document as first written.** I attributed the residual tail
entirely to the missing hook term, carrying over `hrr-recalibration.md`'s framing. The
measurement says the dominant mechanism is the 50/50 shrinkage. The hook remains genuinely
absent, and §9 shows it is *also* not the fix — but it is not what the tail number is
measuring.

---

## 9. WOULD ROUTING OUTS THROUGH THE SIM FIX IT? Partly — and NOT the tail

### What the sim already produces per start

`legacy/index.html` L1913–1970. The sim threads a starter-workload triple through every half
inning and returns it to the game loop:

```js
function halfInning(bat,idx,inn,diff,need,spOuts,leash,...,spPA,spRuns,rs){
  var vsBP = spOuts >= leash;
  if (V2 && !vsBP && (spRuns>=6 || spPA>=29)) vsBP = true;   // shelled / deep -> pulled early
  ...
  outs++; if(!vsBP) spOuts++;                                 // <-- the settled quantity
```
and the caller (L1864–1871) keeps it alive for the whole simulated game:
```js
runsA+=res.runs; idxA=res.next; outsBySPHome=res.spOuts; paSPHome=res.spPA; runsSPHome=res.spRuns;
```

> **The sim already simulates `pitcher_outs` exactly, on every path, and throws the number
> away.** `out` carries `legP`, `pairP`, `v2m`, `pHome`, `avgHome`… and no starter-outs
> distribution. `outsBySPHome`/`outsBySPAway` die with the loop iteration.

### Is outs derivable without new simulation work? **Yes.**

No new simulation is required — only accumulation. Bucket the final `outsBySP*` per path into
a histogram on `out`, then `P(over line) = Σ_{k ≥ ⌊line⌋+1} h[k] / nSims`, read in
`shPropRow`/the `isOuts` branch the same way `simP.legP` is read for H+R+RBI. It is an
accumulator, an output field, and a read site.

### Would it fix the CONSTANT defect? **Yes, incidentally.**

`leashOf` (L2094) **never calls the `of` clamp**. The sim's leash carries no opposing-offense
haircut at all, so the 14% flat cut simply does not exist on that path.

### Would it fix the TAIL defect? **No — and the reason is decisive.**

```js
function leashOf(name){
  ...  ipg = ip30/g30  (or season)  ...
  ipg = shShrink(ipg, n, 4, Lipg);            // IDENTICAL to the closed form
  return Math.max(6, Math.round(ipg*3));      // IDENTICAL x3
}
```

**`leashOf` recomputes the closed form's estimator verbatim** — same 30-day IP/G, same
`shShrink(·, ·, 4, Lipg)`, same `×3`. So the sim inherits **defect 3 exactly**, which is the
one the tail number is actually measuring.

Worse, the leash is a **ceiling, not a centre**: `vsBP = spOuts >= leash` is a one-way early
exit, and `spRuns>=6` / `spPA>=29` only ever pull the starter *sooner*. Simulated starter
outs are therefore bounded above by ≈ `leash`, and the realised mean sits strictly **below**
it. The closed form's Poisson at least has an unbounded right tail; the sim would not.

So the +0.03 / −1.68 row in §8 is the sim's **best possible case**, not its expected value:

- overall, the leash ceiling is near-unbiased (**+0.03 outs**, 18 of 38 negative);
- at the deep end it is still **−1.68 outs** short before any early-hook mass is subtracted;
- and the realised sim mean is below that by however often the two early hooks fire.

**Verdict on the sim route.** It fixes defect 1 for free and improves the tail from −2.57 to
at best −1.68, but it **cannot fix defect 3, because it shares the estimator**. Routing outs
through the sim is worth doing for the hook realism, but *on its own it is not the fix* — and
the framing "the sim models the hook, so it should project the 6+ IP starts the closed form
can't" does not survive contact with `leashOf`. **The shrinkage weight has to change on both
paths regardless.**

**One number is missing and cannot be derived from a board:** the realised mean of
`outsBySP*`, i.e. how far below the leash the early hooks pull it. That needs an instrumented
sim run. It is the single measurement that decides whether the sim route beats the `0.400`
stopgap, and it is not attempted here — this section is investigation, not a build.

---

## THE FIX, PRE-WRITTEN

Ready to apply when the trigger fires (**Phase 2 reports on `pitcher_outs`, or freeze exit,
whichever is first** — see `docs/phase2-memo.md`, "The positive control").

**Change, `legacy/index.html` L2258 — one constant:**

```js
// as built
if(oo!=null){of=shClamp(0.140/oo,0.86,1.12); ...
// fixed
if(oo!=null){of=shClamp(0.400/oo,0.86,1.12); ...
```

`0.400` is the league TB/AB, and is already the constant this file uses for the same
quantity in the batter-vs-pitcher adjustment. Nothing else changes: `of` remains a pure
multiplier, the clamp bounds are untouched, and no other market reads this site.

**Measured effect (arithmetic on published λ — exact, since `of` is a pure multiplier):**

| | as built | fixed |
|---|---|---|
| median raw model gap | **−23.3 pp** | **−11.5 pp** |
| rows with model above market | **0 of 38** | **11 of 38** |
| median λ | 13.7 outs | 15.3 outs |
| median λ − λ_market | −2.48 outs | −1.13 outs |
| `of` values taken | 0.86, 1.00 only | 0.86 – 1.12, full range |
| median (lines ≥16.5) | −3.03 outs | **−2.57 outs** — residual, see §8 |

**Residual after this fix, stated so it is not mistaken for a complete repair:** the tail
remains −2.57 outs, driven by the 50/50 shrinkage (§8), and 5 of 38 rows still floor at 0.86
even with the corrected constant because their opponents genuinely slug above ~0.465.

**Mandatory when applied:** re-run `node tools/extract-engine.mjs`, the full vitest suite,
and `tests/clamp-activity.test.ts` — the last will fail at L2258 by design, and that failure
IS the confirmation the clamp stopped being degenerate. Update
`tests/fixtures/clamp-activity-v1.json` in the same commit and say so in the message.

---

## Verdict

Three defects, all in the direction the ledger observed, none previously recorded:

1. **`0.140` should be ≈ `0.400`.** The opposing-offense factor is pinned at its clamp floor
   on 100% of rows, applying a flat −14% to every start and conveying zero information about
   the opponent. Accounts for ~half the gap and all of the one-sidedness.
2. **Shrinkage weight `k = 4` against `n ≈ 4` starts** — every starter priced as half
   himself, half league average, compressing the estimator into 4.67–6.17 IP when the market
   spreads wider. Drives the residual tail (−2.57 outs at lines ≥16.5). **Survives fix (1),
   and is shared verbatim by `leashOf`, so the sim route does not fix it either.**
3. **No hook-timing / earned-workload term.** Genuinely absent from the closed form. Present
   in the sim — which never prices this market. Real, but *not* what the tail number
   measures; see §8's correction.

**All are frozen parameters. Nothing has been changed** — a mid-window change to `of` would
move every outs price and break the frozen parameter table's role as a drift detector, and
would split the outs prediction population (the `CAL_START` coupling in a new variable).

**DELIBERATELY LEFT BROKEN** as Phase 2's positive control — see `docs/phase2-memo.md`. The
fix is approved in principle and pre-written above; the trigger is *Phase 2 reports on
`pitcher_outs`, or freeze exit, whichever is first*.

**Exposure while it stands:** none in daily money. `pitcher_outs` is gated by `consMinN`
until ~09-13 (see the restricted-market window in `docs/collection-period.md`), so the
defect cannot take a stake during the collection period. That protection is **accidental** —
`consMinN` is a small-sample rule and knows nothing about this. It also expires within days
of freeze exit, which is when a decision is actually required.

**Re-measure on ≥ 2 more boards before acting.** The mechanisms (the clamp arithmetic, the
`n/(n+k)` weight, `leashOf`'s shared estimator) are board-independent and need no
confirmation; the magnitudes (−2.48 outs, −23.1 pp, −2.57 tail) are one board.
