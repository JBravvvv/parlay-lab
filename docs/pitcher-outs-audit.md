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

## Verdict

Two defects, both in the direction the ledger observed, neither previously recorded:

1. **`0.140` should be ≈ `0.400`.** The opposing-offense factor is pinned at its clamp floor
   on 100% of rows, applying a flat −14% to every start and conveying zero information about
   the opponent. Accounts for ~half the gap and all of the one-sidedness.
2. **No hook-timing / earned-workload term.** A shrunk 30-day IP/G mean is structurally
   incapable of projecting a 6+ IP start, so the model is short by −2.6 outs on exactly the
   pitchers the market expects to go deep. Survives fix (1). Same failure as H+R+RBI O1.5+.

**Both are frozen parameters. Nothing has been changed and nothing should be until the owner
signs off** — a mid-window change to `of` would move every outs price and break the frozen
parameter table's role as a drift detector.

**Exposure while it stands:** none in daily money. `pitcher_outs` is gated by `consMinN`
until ~09-13 (see the restricted-market window in `docs/collection-period.md`), so the
defect cannot take a stake during the collection period. That protection is **accidental** —
`consMinN` is a small-sample rule and knows nothing about this. It also expires within days
of freeze exit, which is when a decision is actually required.

**Re-measure on ≥ 2 more boards before acting.** The mechanism (the clamp arithmetic) is
board-independent and needs no confirmation; the magnitudes (−2.48 outs, −23.1 pp) are one
board.
