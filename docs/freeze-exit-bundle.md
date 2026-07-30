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
| **M2** | ⚠️ **INTERLOCKED PAIR — the constant AND the `offense()` de-noise, together or not at all** (see the block below; enforced by `tests/m2-interlock.test.ts`) | gap **−23.3 → −11.5 pp**; above-market rows **0/38 → 11/38**; median λ 13.7 → 15.3 — all PROVISIONAL pending the corrected pitcher estimator | **each other** — 0.140→0.400 alone injects ≈ ±12 pp of estimator noise into outs | **ready once paired** — de-noise residual ≈ ±1.2 pp, under the 2 pp bar |
| M2′ | *alternative:* `pitcher_outs` → sim (surface `outsBySP*`) | the sim already models the hook the closed form structurally cannot use; distribution exists and is discarded | a validation pass — **every outs price moves** | strictly better, **not** additional to M2 |
| **M3** | **H+R+RBI λ conditioning** (mass-weighted blend of `hF`/`tbF`, not a product) | closed-form λ is `rate × power` on a non-Coors slate — **zero site variation** against a market rung-drift of **+0.479**. Recovers ~0.12 of spread on its own; more with M1 | M1 for the park term. Weights need fitting | scoped |
| **M4** | sim routing, **TB and HR only** | vs market: TB sim **5.7** vs closed form **6.3** mean-abs; HR **3.5 vs 3.5**, sim better centred (+0.4 vs −1.1) | archive-series confirmation — fixture margins are thin. ⚠️ 2026-07-27: these are fixture-market readings of prices riding the shared M11 rate estimator plus the sim-path additions (hits rate heat +3.8 to +8.3 pp depending on basis); the gate must separate market vintage from rate heat | **conditional** |
| ~~M5~~ | ~~sim routing for `batter_hits`~~ | **REFUTED.** Sim overshoots market **+5.0**, closed form undershoots **−4.3**, and the sim's mean-abs error is **worse: 7.1 vs 5.6** | — | **rejected on evidence** |
| **M11** | **hot-form under-shrinkage** — residual +0.79 pp per 10 points of last-30 average (SE 0.09, t≈9) while xwOBA pct carries **nothing**: the model diverges from the market on recency, not skill. Candidate: `shShrink(…, 60, prior)` k=60 too weak | ~8 pp residual between a .320 and a .220 last-30 hitter | same grading rows adjudicate it (bucket by avg30 tercile) | **RANK 1 — WHOLE-ENGINE (2026-07-27).** A BUG (intent-vs-behaviour): `shShrink`'s comment forbids hot-streak chasing, but the rate it shrinks is 100% last-30, nested-recency-weighted (a last-week AB ≈ 5.5× a week-3/4 AB) with `n` overstated ~1.5×. **And the sim's per-PA rate is the IDENTICAL `shBlendN`→`shShrink` chain (`batVec` L2065-67)** — the contamination reaches every batter price through BOTH paths, which is the pre-committed condition for outranking M8. **Fix SPECCED 2026-07-27 from the measured weights** (`tools/recency_weights.py`, n=3,061 leak-free player-dates — BRANCH 4: xBA carries the weight +0.73/+0.49, windowed form **+0.05 SE 0.08**, season redundant at corr 0.73): rate = **xBA-primary**, single un-nested last-30 term at weight ≤ ~0.1; the nested blend and k=60 both go. The earlier 'season term' shape was itself wrong. Engine's current effective form weight ~0.56 = 4–11× measured. Re-run ~08-10 pre-registered. Magnitude per-market still PROVISIONAL — one board |
| **M12** | **the sim path's OWN rate heat** — ablated term by term on 55 fixture hits legs (`SH_ABL` runs): log5-with-park/wind **+2.70**, TTO +0.65, interaction −0.65, static factor-set gap **+4.3** (platoon / park-vs-Coors / missing `luckF` / clamps), dynamics **−0.82** (⚠️ the endogenous-PA hypothesis is REFUTED — measured, it *costs* the sim), volume +1.2 → **≈ +8.8 vs closed form on the same rows** | independent of M11 (the shared base cancels in sim−cf) — fixing M11 does NOT fix this. **Lives where HRR is priced**: the sim-priced HRR residual (+10.0) is M12-sized — the open HRR residual now has a measured candidate | archive-series + graded confirmation; M4's gate must separate M12 heat from market vintage | **NEW 2026-07-27 — fixture-slate magnitudes, structure robust** |
| **M13** | **the props ARCHIVE sweep is blind to an input the engine uses** — `tools/snapshot_props.py` requests only the six canonical market keys while Caesars posts its entire hits/K's ladders under `*_alternate` (incl. the main lines; raw-verified NYY@CWS 07-28: `batter_hits_alternate` 48 outcomes at 0.5/1.5/2.5, `pitcher_strikeouts_alternate` 2.5–9.5). 14 archive days read **hits 0/7,033 and K's 0/830 CZ-present**, and the multibook memo misread that as feed coverage — "the unlock", retracted same day (§2c) | a COLLECTION defect, not engine: the engine (L1366 `SH_PROP_ALT`, build 44) and `sightProp` already read the alternates; every archive-based CZ-coverage or both-priced-population number carries the canonical-key stamp | fix = add the 3 alt keys to the sweep (+~3 credits/event), fold same-line quotes, vintage-stamp the archive change; guard = sweep list ⊇ engine list, extracted from source | **NEW 2026-07-28 — awaits owner sign-off (credit cost); memo §2c carries the full chain** |
| **M14** | **the allocator is NON-MONOTONE IN PRICE, and the mechanism is RANKING — isolated by controls (2026-07-28, owner's two rounds, all free)**. In-loop sweep: +126.6 → +129.0 → +117.3 → +110.4 → **+70.5** → +74.4 bp at 0…+2.0 pp. **⚠️ Control A is an IDENTITY, not a control (owner's catch, same day)**: it carried the bump=0 stakes (no allocator run, no ceiling touched), so fixed probs + fixed stakes + strictly better payouts can only rise — it EXCLUDES an arithmetic defect in the E[ln] instrument and LOCATES nothing. The gap table (in-loop − identity) is M14's magnitude: **−0 / +0 / −14.1 / −25.7 / −70.4 / −71.2 bp** at 0/+0.25/+0.5/+1.0/+1.5/+2.0. **THE MECHANISM, SEPARATED (second round)**: cap sweep 6/8/10/uncapped — non-monotonicity SURVIVES uncapped (+136.2 → +99.0, 9 → 12 tickets), so the cap is not it; **ranking swap (base → `max(ev,0)/(dec−1)`, cap held at 6): non-monotonicity VANISHES (+187.2 → +198.2, monotone)** — **price-blind ranking is SUFFICIENT for the defect; the cap is innocent; admission merely supplies the candidates**. Rank order at +1.5 uncapped: the entrants sit at ranks 1, 2, 6 and deGrom/Freeland at 7 — admitted-and-ranked-above, not cap-promoted. Control C census: newcomer stake $0 → $133, card legs 24 → 16, the +1.0→+1.5 cliff = two 2-leg newcomers (incl. `Hits O0.5 + Hits O0.5`) displacing the outs parlay. `prob` is MODEL probability (L2641–2712, L3053–55) — no feedback loop. **Control B, stated at its measured size (CORRECTION to the owner's pre-committed wording, applied 2026-07-28 — the wording was broader than the numbers)**: base +126.6; −0.5 → +121.2; −1.0 → +117.8; −1.5 → +124.9 — every negative bump sits BELOW base; the rise is LOCAL, −1.0 → −1.5, **+7.1 bp**. The measured sentence: *a locally worse price set produced a locally better card; worse-than-observed never beat observed on this board* | **THE ADOPTION NUMBER (owner's item — evaluated at the MEASURED gain, +1.07 pp/leg, inside the (+1.0,+1.5) cliff interval)**: uniform +1.07 in-loop = +111.6 → **net −15.0 bp vs base**; empirical dispersion (54%-zero gain distribution, 5 seeds: 138.5/90.6/110.2/94.8/66.7) mean +100.1 → **net −26.5 bp** — same sign, uniform is a valid proxy. **Adding the second book under the shipped allocator is NEGATIVE on this board; ~~multi-book adoption is blocked behind A1~~ (CORRECTED 2026-07-29, owner's pre-committed reading at the paired 200: "blocked behind A1" implied adoption follows A1 — under A1, adoption is +1.3 [−0.7, +3.3] uniform / −0.4 [−2.3, +1.5] clustered, sign NOT established and the clustered point estimate NEGATIVE; A1 removes the penalty and does not establish a gain — adoption is unsupported either way, not sequenced behind anything).** `coreEvMin = 2` remains an UNMEASURED parameter (raised by `06d3cbc`, never fitted) in the admission path — but the ranking swap shows the floor is not the mechanism | **NO ALLOCATOR CHANGE SHIPS — freeze.** n=1 board; reruns gated on credits (the burn plan). **A1 (price-aware ranking) is THE M14 fix on this evidence; A2 is innocent of M14** and keeps only its own independent floor-scaling argument — both at exit sign-off | **NEW 2026-07-28, mechanism ISOLATED same day — ranking; magnitude −70 bp at +1.5, −15 to −27 bp at the measured +1.07** |
| **M15** | **a measurement population double-counted snapshot vintages** — the multibook "n=511 both-priced rows" pooled the day's pre AND close snapshots as independent rows (**362 unique, ~1.4× duplication**); every original two-book number (+1.01/+1.60/+1.58, the per-market table, TB−HRR z≈1.9) was computed on it. Deduped + game-clustered: headline **+1.08** (pre-vintage +1.07 [+0.88,+1.33], the operative bet-time number), TB−HRR collapses to z≈0.96 | a MEASUREMENT defect (instrument, not engine): pooling pre+close is pooling vintages — the exact error class the sb/vintage rules exist to prevent, committed by the measurement itself. All corrected same day, multibook memo §2b | the correction is applied; the standing rule it leaves: **any population built from the props archive states its snapshot-vintage rule (pre / close / dedupe-last) beside its n** | **NEW 2026-07-28 — corrected same day; rule recorded** |
| **M16** | **cross-ticket same-game dependence is priced NOWHERE in production** — within-ticket dependence IS priced (`simJoint` reprices same-game groups inside a ticket, L2641–2712; 22 of 25 groups on the 07-26 board), but the CARD's joint distribution across tickets has no code path; the sole compensation is the shared-game damping constant `0.5` in the greedy ranking — **chosen, never fitted** (frozen table), **and measured NOT to compensate: under ρ-stress the damp ordering is unchanged and pair counts barely move (4/3/3/3) — its 40 bp range is SELECTION quality; the name/comment describe correlation protection it does not deliver (the intent-vs-behavior shape, recorded here per the owner's rule)**. Measured magnitude, restated PER PAIR: **~1–1.5 bp per cross-ticket same-game pair at ρ≈0.1** (MC-noise-limited); the 07-26 card carries 3 pairs (≤ ~4 bp) — the archived-board pair-count distribution is **n=1 board**; today's board joins it once it exists | the E[ln] evaluation instruments inherit the same across-ticket independence (harness comment; validated) — the ρ-stress is the charge: A1's paired advantage survives it (+22.7/+23.4/+22.8 at ρ=0.05/0.10/0.20) and the damping peak stays at 1.0 under it | n=1 card; a card with more same-game overlap carries more; re-measure on live cards when boards resume | **NEW 2026-07-29 — documented, small measured magnitude on this card; no ship** |
| **M18** | **THE FREEZE HELD THE CODE VINTAGE AND FLOATED THE DATA VINTAGE FOR THE ENTIRE WINDOW** — the engine reads `public/model/priors.json` + `context.json` at REQUEST time on BOTH surfaces (client `engine-client.ts` L324–25; server `generate/route.ts` L191–92 → `eng.set("SH_CTX",…)` L205) and consumes them in the RATE path (`shPriorH`/`shPriorHR`/`shPriorKf`/`shPct`/`shOppWhiffF`, L1582–1626 → `pModel` on every batter/pitcher row). Measured drift: **priors change 7,240–10,041 numeric fields PER DAY (mean abs-Δ ~1.0, max ~30); context ~85–94 per boundary; ump_k ~20–32** — daily, by design (Statcast/weather/umps are live inputs, the same class as the statsapi season stats fetched live). **So "one engine vintage" was never something the freeze could hold across days, and no doc said so — every cross-day comparison in this window is cross-DATA-vintage** | the cross-day comparisons that inherit the axis: **14 of 21 findings' measured effects sit downstream of priors/context** (M1 M2 M3 M4 M5 M7+M9 M10 M11 M12 M14 M16 A1 A2 A4; NOT downstream: M8 identity, M6 count, M13 request-list, M15 snapshot-dedupe, M17 process, A3 analytic). **(AMENDED 2026-07-29, owner's arithmetic: the itemized lists count 14 + 6 = 20 of 21 — the 21st is M18 ITSELF, the SEVENTH not-downstream item: the axis is measured FROM the bot's git history, not through floating priors, so it cannot be downstream of itself.)** **Fidelity replay is NOT runnable** (07-26's construction inputs — odds/stats — are unrecoverable; the impossible branch cannot fire). **Attribution IS possible, explicitly**: each archived board's `at` maps to the prior/context version live at generation via the bot's own commit timestamps — e.g. the 07-26 16:46Z board ran under priors `b75e905` (12:47Z) + context `3e2b93c` (07:48Z) | the convention extension: the VINTAGE EVENTS census gains a DATA-VINTAGE axis — per-day, tracked by the bot's commit log (which is exactly what makes attribution possible), never frozen. **The whitelist answer: the whitelist STAYS (the paths are designed inputs) and M17's guard is correctly named for what it guards — CODE vintage via paths; DATA vintage is M18's axis, tracked not frozen** | **NEW 2026-07-29 — first line of the freeze doc; no ship (the inputs are supposed to move; the DOCS were not saying so)** |
| **M17** | **an automated writer (`engine-v2-bot`) held `contents: write` to the production branch through the entire freeze with NO path enforcement** — 15 commits since 07-24 (daily, BY DESIGN: the shadow log depends on its context/priors commits); whole-window file census: exactly `public/model/context.json` + `public/model/priors.json` + `data/ump_k.json`, zero code paths — but that census was inspection, not a guard; a workflow bug or compromised action could have written engine code onto the branch Vercel builds and nothing would have fired | vintage-control axis, orthogonal to model and allocation; companion gap found by the same audit: doc-cited shas had NO resolution check (format only) — a rebase left 3 dangling citations silently | **GUARDED same day (the guard IS the fix)**: `tests/bot-path-whitelist.test.ts` (every bot commit since freeze start ⊆ the 3-path whitelist, extracted from git, invalid-by-value plant; GREEN on the real history) + `tests/sha-references.test.ts` (every doc-cited sha reachable from an origin ref or allowlisted-with-reason; **observed RED on the 3 real danglings**, fixed in the same commit) | **NEW 2026-07-29 — guards enforcing; no process change beyond them** |
| **M19** | **duplicate ticket emission in `parlaysLive`, plus sim-gap naive pricing on the same entries** — `buildParlaySet` has NO ticket-level dedupe (L2777/L2788 push unconditionally; the only pressure is the per-player usage cap, L2663–73, which does not prevent identical leg-sets). 07-26 archive: `parlaysLive` holds **22 entries, 19 unique leg-sets** — the K's parlay (Rasmussen U7.5 + Messick U4.5) **×3** and a CLE@TB Mixed (RL away + ML home) **×2** (the ×2 found 2026-07-29, same instrument, same board). The K's triplicate is also the board's ONLY naive-priced same-game group (`probNaive` null — the CAUSE is M6: the sim carries no K-count outcome, so `legP` has no `pitcher_strikeouts` entries and `jointAll` refuses the group at L2700; the displayed 36.4% is a pure product; ρ-bound ±~2.2 pp per 0.1 of ρ, unmeasured because the sim cannot grade it). **AMENDED 2026-07-29 (owner's item 7): display-only is NOT ledger-proof — manual slip-add is a path into the ledger, the bankroll exit's only instrument; the triplicate-membership check is added to the authed export's pre-committed reading (collection-period)** | magnitude: **3 redundant entries and 3 naive-priced entries = 1.38% of 218 emitted tickets, 1.40% of notional stake, 0% of allocated card dollars** — `shCardPool` (L2957–65) admits only `parlays`+`parlaysMixed`, so `parlaysLive` never reaches `shAllocate` or the card; `pred-serialize.ts` L232 skips it too (live tickets never logged as predictions) | **the blanket "the live path has no sim" is CORRECTED (2026-07-29, owner's trace order)**: all three ticket sets share one `build()` path (L2795–97) and the sim-joint upgrade (L2686–2706) fires wherever `SIMS[gkey].jointAll` grades the group — `parlaysLive` is all-same-game by construction and **19 of 22 live tickets ARE sim-priced**; naive product fires only where the sim lacks the game or a leg's marginal | **NEW 2026-07-29 — display-surface defect, measured on the 07-26 archive (n=1 board); no ship (freeze); the dedupe fix and a naive-price disclosure tag are exit items** |
| **M8** | **`shTbOver` prices a 0.5 line with the 1.5 formula** — `if(line<2)` catches both, and `1−(P0+P1·s1)` is `P(TB≥2)` | **a DEFINITE bug, proven with no external reference.** TB O0.5 and hits O0.5 are the same event; the market prices them **0.1 pp** apart and the model **24.4 pp** apart (33.6% vs 58.1%), on 127 joined rows of the real board | nothing. **One comparison**: `if(line<1)return 1-P0;` | ✅ **SHIPPED 2026-07-27 night** under the reopening decision (bug-grade, sign-off D): same-line fix at L1548, pinned test swapped WITH a reintroduction plant, `baseline43` byte-identical (fixture prices no TB-0.5 row). Board-level confirmation pending: zero TB≥1==H≥1 violations expected on the first post-ship board |
| **M7+M9** | ⚠️ **INTERLOCKED PAIR — ship together or not at all.** M7: `shPOver` uses Poisson where the process was assumed binomial. M9: the compensating term hiding it | ⚠️ **M9-AS-UNIFORM-λ-INFLATION REFUTED 2026-07-27** (`tools/rung_signature.py`): uniform +13.9% predicts **+5.7 pp** at hits O1.5; measured within-player **+1.4–2.0**; paired shortfall **+4.35 pp, t = 11.1** (n=17). The fixed-n binomial *reference* fails with it — the market prices hits ~70% of the way to Poisson, so **both magnitudes were computed against a reference the market refutes**. Net real rung structure: **+1.4–2.0 pp at O1.5** | **each other, still** — swapping `shPOver` to binomial alone still moves 617 rows ~5 pp regardless of what truth is. Re-derivation needs the reference distribution as an output, not an assumption: **graded outcomes** (the expAB-tercile grading test, 3σ ~08-20, doubles as the reference) | **needs re-derivation — held, demoted below M10** |
| **M10** | **closed-form expAB over-steepness** — hits O0.5 residual climbs **+7.39 pp/AB (SE 1.73, n=135/232)**; survives quality controls (+6.16, SE 1.57); walk-discount component 4 SE; **sim-priced HRR is FLAT (+0.73, SE 2.54)** — two independent volume models (sim, market) agree against the closed form's `λ = rate × expAB` | ~12 pp of residual span across expAB 3.0–4.6 — the largest structure on the hits board | grading by expAB tercile (135 covered rows/day, **3σ ~08-20**) decides who owns the gradient; the archive series re-measures daily | **PROVISIONAL — one board; mechanism traced 2026-07-27: errors-in-variables in `bbr`** (three convergent signatures — SD(bbr) 0.0908→0.0545 across ab30 quartiles, walk-dim slope ~halves, full-noise slope +9.4 vs measured +7.39; `tools/m10_eiv.py`). **Specified fix: `shShrink(bbr, n, k≈75, lgBB)` before expAB — 0.9 untouched.** The blend has no window past 30 days, so the noise floor is structural — the flat limb of the EIV test cannot exist, which is the stronger form of the finding. ⚠️ The sim's `pBB` consumes the SAME `bbr` (2026-07-27), narrowing the HRR-flat discriminator (HRR is walk-neutral by accounting) and killing sim-volume routing as an escape — the shrink fixes both consumers at one line |
| **M6** | `pitcher_strikeouts` → sim (sixth PA outcome) | K's are **169 rows**, core-eligible, priced with **no simulation of the quantity they are about** | the second-RNG-stream design (below) | **sized, see next section** |

**M1 is the largest amendment on the FACTOR axis** (superseded 2026-07-27 as overall leader by
M11, whose estimator reaches every batter price in both paths). It was ranked third when sim
routing looked like it would subsume it; the external check removed hits from sim routing, so
`shParkF` is the only amendment that reaches hits, K's, outs and every game the sim misses.

## THE SHADOW SERIES — running, with the reading PRE-COMMITTED before any data (2026-07-27)

Signed off: Phase 2 first, bundle at exit, shadow prices in between. LIVE in the engine from
this commit: every armed closed-form batter row carries `sh:{m8,m11,m10,m1,all}` (percent,
2dp) — M8's corrected TB 0.5, M11's expected-metric-primary rate (windowed weight 0.1, the
measured branch-4 spec), M10's bbr-shrunk volume (k=75), M1's park factors, and `all` = the
four together, the bundle engine's price. The archive carries them from the first armed board
after deploy, so at exit the comparison is close-graded on BOTH engines over the same rows,
same closes, **no vintage split**.

Conditions honoured, verifiably: additive and SH_V2-gated (the dormant board is
byte-identical — dormant whole-board digest UNCHANGED at `942ab102…`; armed re-pinned
`935704d7…` → `c06b3afe…`, armed baseline propBoard `c8c520…` → `135f58…`, all documented at
the pin sites); **null on any missing input** — the `shadow.umpKf` rule, so "no reading"
stays distinguishable from "reading of no effect". OUT OF SCOPE BY NAME rather than bent
into the pattern: **H+R+RBI** (no expected metric), **pitcher rows** (M2 ships as its own
pair), and **the sim path** (a shadow there requires a second sim run).

**Coverage, measured and bounded BEFORE the first report (2026-07-27, on the real 07-26
board):** shadow-eligible = hits+TB+HR rows the closed form priced = **863/day = 76% of the
1,134 priced batter rows** (the other 24% is H+R+RBI, excluded by name — 39% of the 2,206
raw batter rows, most of which are unpriced ALT/no-model rows and were never in anyone's
population). ⚠️ **The population is STABLE across the window, and here is why the
start-time-selection concern does not bite**: routing is FROZEN — the sim only ever replaces
H+R+RBI's price, so improving lineup coverage moves rows *within the already-excluded
market*, never out of the shadow population. The path stamp is structural: **`sh` present ⟺
the live price is closed-form** (enforced by `tests/shadow-prices.test.ts` — HRR and pitcher
rows carry none). The one real generation-time effect (lineup posting deciding which batters
get priced at all) hits live and shadow identically.

**Expected n at exit, stated now**: close-gradeable shadow = hits+TB (**HR has no two-sided
close fair** — one-sided market; its shadow series reads only against the /1.06 anchor and
is reported separately). Board-side 617/day (267 hits + 350 TB); close-side 280 on the
6-event Sunday sample, ~600–650/day at weekday coverage → intersection ~300–500/day →
**≈ 16–27k close-graded pairs by 09-22, thousands per market**. The first true same-date
join (07-27 board × 07-27 close) is computable the moment tomorrow's archive run lands.

**HR's shadow: KEEP, and here is the verified reason (2026-07-27, owner's question)**:
~220 HR shadow rows/day have no two-sided close — but they are NOT inert. With HRR excluded,
the shadow engine still enters three cross-market identities plus its own ladders:
`H≥1 ≥ HR≥1` (n≈229/day on the real board — both sides shadowed), `TB≥4 ≥ HR≥1` (currently
n=0 on real boards — TB 3.5 is never model-priced; the tool now prints that absence instead
of omitting it), `TB≥2 ≥ H≥2`, and — the free win — **`TB≥1 == H≥1` must HOLD EXACTLY on the
shadow `all` column** (the M8-corrected formula makes them the same number by construction),
where the live engine carries its known 118/127 violation. **THE PRIMARY INTERNAL CHECK OF THE SHADOW SERIES — above the ladder constraints, stated
as such (2026-07-27, owner's call): `TB≥1 == H≥1` on the shadow `all` column.** It is an
exact identity, not an inequality; it needs no market, no grading, no accrual; the
M8-corrected engine satisfies it **by construction** and the live engine violates it **118
of 127 rows** on the same boards — a daily proof-of-correctness for the shadow pipeline from
its first row, with the live violation as the standing contrast. If the shadow column ever
breaks it, the shadow implementation (not the market, not the fixture) is wrong, localised
to one formula. A shadow-engine violation of any of the other constraints with the live
engine clean is a bundle defect found pre-ship — the third branch's purpose, available
daily, no external reference. The three HRR-involving constraints cannot
run on the shadow engine and are stated as out. `tools/self_consistency.py --shadow [col]`
runs the whole table per amendment column.

> ### THE PRE-COMMITTED READING — written before a single shadow row exists
>
> | at exit, close-graded on the same rows | reading |
> |---|---|
> | shadow predicts the close BETTER than live | **confirms the bundle** — ship with validation in hand |
> | equally well | the amendments are **neutral on this axis**; their case rests on the defect arguments alone (M8 is still arithmetic, M11 still contradicts its comment) — shipping is a judgment call, not a validated upgrade |
> | **WORSE than live** | **something in the bundle is wrong and was found BEFORE it shipped** — the whole point of running the series. Back to source, amendment by amendment, using the per-amendment columns (`m8`/`m11`/`m10`/`m1`) to localise which one |

## MEASUREMENT VINTAGE AND DEPENDENCY ORDER (2026-07-27)

Every magnitude below was asked one question: *was it measured on boards priced by the
contaminated rate estimator (M11) and the noisy volume input (M10), and does its number
move when they ship?* The expectation being tested was "most of the model axis is
downstream of M11 and the allocation axis isn't" — **partially confirmed, with corrections:
about half the model axis is independent, and M2's blocker is the pitcher-side analogue,
not M11 itself.**

| item | pre-M10/M11 vintage? | verdict |
|---|---|---|
| M1 | park-factor tables — no rate input | **independent — speccable now** |
| **M2 / M2′** | pitcher-side, so not downstream of the *batter* estimator — but the outs board rests on `shPitchBlend` (60/40 recency, no shrink), `leashOf` (k=4), and the `offense()` opp-lineup factor, which IS window-blended | ⚠️ **PROVISIONAL — audit HALF-RESOLVED 2026-07-27.** Measured: the K's/outs recency cliffs are wrong (form zero, **season-primary** +0.81/+0.61; whiff prior adds nothing), and a 3–6 start ipg mean is **36–53% noise** with k=4 keeping 43–60%. ⚠️ **NEW HARD DEPENDENCY: `of` is a constant 0.860 today (0.140 pins the clamp) — shipping 0.140→0.400 alone un-pins it and injects ≈ ±11 pp of `offense()` noise into outs. The oo de-noise (lineup xSLG anchor) must land IN THE SAME CHANGE.** Gap re-measures after the corrected estimator re-prices |
| M3 | the zero-site-variation *diagnosis* is structural | diagnosis stands; **the weights spec waits for M11** (its inputs change) |
| M4 | fixture-market prices riding M11's base + M12 | **PROVISIONAL — re-measure after M11 ships and M12 is dispositioned** |
| ~~M5~~ | refuted on the same vintage | stays refuted (the refutation direction only strengthens post-M11) |
| M8 | arithmetic identity | **independent — speccable now (one line)** |
| M7+M9 | the rung structure (+1.4–2.0) is the *contaminated model's* shape | truth-dispersion reference (~08-01) is model-free and unaffected; **the rung numbers re-measure after M11** |
| M10 | sibling of M11 (same input family) | the bbr-shrink spec (k≈75) is estimator arithmetic — **speccable now**; the +7.39 slope re-measures after M11 |
| M11 | specced from the truth-side regression — **model-free by construction** | **specced, done** |
| M12 | sim−cf, the shared base cancels | **independent of M11 by construction**; fixture magnitudes gate on the archive series |
| M6 | a row count | independent; its *value* is contingent on M12's cleanup |
| M13 (2026-07-28) | a collection-request gap, not a model quantity — no rate input, orthogonal to M10/M11 | **independent — fixable now (owner's sign-off, credit cost).** Its DEPENDENTS carry the stamp instead: every archive-based CZ-coverage / both-priced number (multibook memo §2b) is canonical-key vintage, and the post-fix archive is a NEW vintage that never pools with the 14 pre-fix days |
| M14 (2026-07-28) | allocation-axis, orthogonal to the rate estimators — but it CONTAMINATES any fixed-card price-response measurement | **frozen defect, no ship.** Dependency: the multi-book adoption decision and every future price-improvement claim must run allocator-in-loop; **A1's exit sign-off inherits the M14 evidence (ranking isolated as sufficient; cap innocent; A2 innocent of M14, its floor-scaling case stands on its own)** |
| M15 (2026-07-28) | an instrument-population defect — no engine dependency at all | **corrected same day.** Its rule is the dependency: archive-based populations state their snapshot-vintage rule beside n; pre is the bet-time vintage, close belongs to CLV |
| M16 (2026-07-29) | allocation-axis, orthogonal to the rate estimators; couples to the damping constant (nominally its compensation — measured NOT to compensate: the 40 bp is selection quality, the intent-vs-behavior shape) | **documented; magnitude restated PER PAIR: ~1–1.5 bp per cross-ticket same-game pair at ρ≈0.1 (07-26 card: 3 pairs; archived-board distribution is n=1 board — today's board joins it); no ship.** Dependency: any card-level E[ln] claim carries the across-ticket-independence caveat unless ρ-stressed; A1's evidence already is (ρ=0.20-robust) |
| M18 (2026-07-29) | the DATA-vintage axis itself — touches every cross-day comparison (14 of 21 findings) | **tracked, never frozen**: per-day data vintage attributed via the bot commit log; cross-day claims state the axis |
| M17 (2026-07-29) | process/vintage-control axis — orthogonal to model and allocation; the guard is the fix | **guarded same day** (`bot-path-whitelist` + `sha-references`, both with plants, the sha guard observed RED on real danglings). Dependency: any new bot workflow extends the whitelist in its own commit |
| M19 (2026-07-29) | display/emission axis — orthogonal to the rate estimators AND to the card path (`parlaysLive` never enters `shCardPool`) | **documented; no ship.** Dependency: any `parlaysLive`-based ticket count states the duplicate-emission caveat; M16's pair census is unaffected (card-side only) |

**A1 ROBUSTNESS — the second argument, priced (2026-07-29, owner's item; separate from
the mean effect, which remains an interval containing zero)**: across the 200 shared
seeds, E[ln] percentiles (bp) — prob: min 27.1 / p5 64.0 / p50 103.2 / p95 137.1, SD
24.3; EV: **min 147.5 / p5 161.6 / p50 189.4 / p95 210.2, SD 14.2**. **EV ranking
RAISES THE FLOOR — its minimum exceeds prob's p95 — and relative to each base the worst
draw costs −39.7 (EV) vs −99.5 (prob).** Not mean-preserving noise reduction: level,
floor and dispersion all move together. Stated as an independent A1 argument; the
ADOPTION effect (the price-gain benefit) is unchanged — still [−0.7, +3.3]/[−2.3, +1.5].

**THE RECONCILIATION (2026-07-29, owner's arithmetic challenge — all from the same
dispersed arrays; his derivation was consistent, the quantities differ)**: raw LEVEL gap
mean(EV) − mean(prob) = 188.5 − 100.5 = **+88.0 = the +60.6 base gap + the +27.4 paired
adoption difference — exactly**. Adoption is defined against each ranking's OWN bump-0
base (+1.3 = 188.5 − 187.2; −26.1 = 100.5 − 126.6); the owner's ~+58/+85 measured both
against the prob base — a LEVEL quantity, not adoption. Percentiles and adoption numbers
come from the SAME 200-seed dispersed arrays (full tables printed in the record); both
mins sit below their means. **Three figures, three quantities, zero contradiction — the
floor-rises conclusion stands.**

**A1'S ADOPTION EFFECT IS RETIRED AS UNMEASURABLE (2026-07-29, owner's rule — retired,
not pending)**: detecting +1.9 bp at 80% power against the per-board paired-diff SD
(~25.4) needs **~1,400 boards** — beyond anything reachable this cycle or the next.
**RE-DERIVED same day (owner's catch: the +1.9 fed to the power calc was the superseded
60-seed dispersed estimate)**: at the paired-200 uniform point estimate **+1.3**, same
SD ~25.4 and 80% power: **~3,000 boards** ((2.80 × 25.4 / 1.3)² ≈ 2,996 — more than
double the printed 1,400). At the clustered instrument the point estimate is **−0.4 —
NEGATIVE: A1's adoption effect is not established in sign there, let alone magnitude**
(a magnitude-blind calc at |−0.4| would need ~31,700 boards). **The retirement is
STRENGTHENED, not weakened; the number that travels is ~3,000.**

**A1 LEVEL-GAP SHADE TEST (2026-07-29, owner's item — the +60.6 was A1's strongest
claim and had never been shade-tested; same standard as the coreEvMin "95 bp"
withdrawal, because E[ln] under the model's own probabilities is self-graded)**:
instrument `tests/a1-shade.test.ts` — production `shAllocate`, the section-5e
one-expression base patch (`max(ev,0)/(dec−1)`), per-leg correlated shade propagated
through each ticket by the naive-product ratio, exact E[ln] at production stakes.
Reproduction check passed: shade 0 reprints **+126.6 / +187.2** exactly. The gaps
(EV − prob): **+60.6 at 0 · +45.5 at −3 pp · +36.6 at −5 pp** (levels: prob
+126.6 → +8.2 → −67.3; EV +187.2 → +53.8 → −30.8). **The gap attenuates and never
inverts — it SURVIVES at −5**, unlike the coreEvMin peak, which migrated and flipped
sign under the same shade. Per the pre-committed reading: **the +60.6 is A1's
OPERATIVE argument**, stamped one board (07-26) + one data vintage (priors `b75e905`
+ context `3e2b93c`), with the +2.0 break traveling beside it wherever it is cited.

**FULL GRID REPRINT (same day — the owner read a sign flip into the curve; the
record shows none)**: shade / g(prob) / g(EV) / gap, with card composition
(tickets/legs/cross-ticket-pairs/within-ticket-groups) printed at EVERY step:
−0: +126.6 / +187.2 / **+60.6** · −0.5: +106.5 / +164.4 / **+58.0** · −1: +86.5 /
+141.8 / **+55.4** · −2: +47.0 / +97.4 / **+50.4** · −3: +8.2 / +53.8 / **+45.5** ·
−4: −29.9 / +11.1 / **+40.9** · −5: −67.3 / −30.8 / **+36.6**. Composition:
**6/14/2/0 on BOTH cards at ALL seven steps** — constant BY CONSTRUCTION (both cards
are built ONCE at shade 0; the shade is applied to an evaluation copy only — the
admission gate, the ranking key and the prices are never shaded; instrument lines in
`tests/a1-shade.test.ts`, the evaluation-of-chosen-stakes design of the M14-audit
row) — and constant empirically, as printed. **The gap is monotone decreasing and
never crosses zero; both LEVELS go negative between −3 and −5 while the gap stays
positive** — the relayed "+52.8 at −1" and "−36.6 at −5" match no recorded value
(nearest actuals: gap +55.4 at −1; gap **+36.6** — positive — at −5, where the
LEVELS are −67.3/−30.8; the −3 point +45.5 sits exactly on the monotone path).
Per the owner's own branch 3: shading is est-only, the curve is monotone → the
coreEvMin withdrawal stands, this level claim stands, and the misread was the read,
not the record. No step showed E[ln] rising under a worse shade (the impossible
branch stayed silent on the run's own output).

**⚠️ SHRINK-TO-MARKET TEST — THE UNIFORM-SHADE RESTORATION IS ITSELF WITHDRAWN
(2026-07-29, same day, owner's item 3: "the shade test cannot see the overconfidence
that would punish EV ranking" — CONFIRMED).** The uniform shade subtracts equally
from high- and low-edge legs and is structurally blind to selection-on-edge; the
non-blind instrument shrinks each leg's est toward its OWN market-implied
probability (p′ = (1−λ)p + λ·imp — the correction proportional to the claimed edge;
`tests/a1-shrink.test.ts`, archived board, free). **EVALUATION-ONLY (cards fixed —
grading exposure)**: gap +60.6 / +51.9 / +38.4 / +18.3 / **−0.5 / −17.2** at
λ = 0/.1/.25/.5/.75/1 — **crosses zero at λ ≈ 0.74**. **IN-LOOP (gate + ranking +
Kelly read the shrunk belief — selection exposure)**: gap +59.7 / +43.9 / +10.6 /
**+0.0 at λ=0.5, where both rankings CONVERGE TO THE IDENTICAL CARD** (composition
columns equal), and the pool goes **NO-PLAY at λ ≥ 0.75** (`coreEvMin=2` clears
nothing — the gate empties before the gap can invert; the two exposures do not
disagree in sign, they end differently: grading inverts, selection converges then
empties — both named, neither summarised by the other). λ=1 census printed on the
run: 0 of 67 pool tickets carry czEv > 0 (max −5.5%) — at full agreement the
remaining EVs are consensus-at-CZ (vig), the shrink target IS the market-implied
probability, and the impossible branch does not fire. Context: leg est is ALREADY
35% model / 65% consensus for props (`SH_W`) — λ composes on top; λ=1 ≡ pure
consensus fair. The nine `shShrink` k's implement a DIFFERENT shrinkage — player
RATES toward LEAGUE means, upstream of the est — none of them shrinks toward
market-implied and none is in this path. (In-loop λ=0 reprints differ from the base
instrument by ≤ 0.9 bp — the r1 re-rounding pass in the shrink wrapper; stated.)
**PER THE PRE-COMMITTED BRANCH 1: the +60.6 is EDGE-FRAGILE; the uniform-shade
retraction of the withdrawal is itself withdrawn; A1's case returns to restored
monotonicity + penalty removal (price-axis results the shrink does not touch) —
the LEVEL effect and the FLOOR/percentile argument are λ=0-conditional claims from
here on. Both instruments stay on the record with their names: `a1-shade`
(uniform, location) and `a1-shrink` (edge-proportional, selection).**

**THE ENGINE'S OVERCONFIDENCE TOLERANCE, AND THE ONE MARKET WITH DATA (2026-07-29,
owner's item 4)**: the evaluation-only zero crossings interpolate to **−3.2 pp/leg
(prob ranking: +8.2 at −3 → −29.9 at −4)** and **−4.3 pp/leg (EV: +11.1 at −4 →
−30.8 at −5)** — but an evaluation-side tolerance is NOT the engine's own, because
real overconfidence also changes selection (the owner's branch fired). **The
IN-LOOP tolerance — selection responding, tickets dropping 6→5→4→3 as the gate
tightens — stays positive through the whole grid: prob +126.6 → +8.3 at −5,
zero-crossing EXTRAPOLATED ≈ −5.4 pp/leg; EV ranking converges to the identical
card from −3 on.** The calibration table, every settled per-leg gap on record:

| market | measured gap | file:line | n / population |
|---|---|---|---|
| **H+R+RBI** | **46.3% hit vs 59.2% implied = −12.9 pp** (O1.5+ subset 32%; O0.5 12/19 = 63%) | `docs/hrr-recalibration.md` L83–86 | graded ledger 07-17→07-22, SELECTED legs; row count OFF-DISK (the ledger key) — an adversely-selected population, not per-leg-uniform |
| pitcher outs | λ_model − λ_market **−2.48 outs (−0.83 IP) median, negative 38 of 38** | `docs/pitcher-outs-audit.md` L100 | 38 rows, one board — a RATE gap in outs units, sign-decisive, not convertible to prob-pp without the line distribution (not converted) |
| every other market | **no settled calibration data exists** (server store starved: `eligibleLogged: 3`) | CLAUDE.md L420 | — |

**HRR's −12.9 pp exceeds the in-loop tolerance (≈5.4) by ~2.4× and the
evaluation-only one (≈3.2) by ~4× — a bankroll-exit-relevant fact visible today,
from calibration data, with no ledger read. In the same breath: one market, small
off-disk n, SUSPENDED, and a selected-legs population against a per-leg-uniform
tolerance — the two are not directly commensurable and this entry does not answer
the bankroll exit. And the sentence that stands beside it: THE ENGINE'S TOLERANCE
IS UNTESTED ON EVERY MARKET THAT IS ABOUT TO REOPEN.**

**TOLERANCE RECONCILIATION — ONE TABLE, ONE AXIS (2026-07-29, owner's item 4: three
figures read as incompatible; two were crossings, one was a RATIO)**:

| instrument | ranking | crossing (pp/leg) | method |
|---|---|---|---|
| evaluation-only (cards fixed) | prob | **−3.2** | interpolated (+8.2 at −3 → −29.9 at −4) |
| evaluation-only | EV | **−4.3** | interpolated (+11.1 at −4 → −30.8 at −5) |
| in-loop (selection responds) | prob | **≈ −5.4** | EXTRAPOLATED one step past the grid (still +8.3 at −5) |
| in-loop | EV | **≈ −5.4** | converges to prob's card from −3 on; same extrapolation |

**There is no −2.4 tolerance and never was**: the "~2.4×" was the exceedance RATIO
12.9 ÷ 5.4 in the sentence "exceeds the in-loop tolerance (≈5.4) by ~2.4×" — the
parenthetical adjacency bred the misread; the figure set above is the record.

**THE HRR −12.9 MAPPED THROUGH THE SHRINKAGE INSTRUMENT (owner's item 4 — the axis
that can carry a selected-legs number)**: the λ=0 cards' selected legs carry a mean
claimed gap (p − imp) of **+6.66 pp (prob card, 14 legs)** / **+8.30 pp (EV card,
14 legs)**; a mean of **−12.9 pp requires λ = 2.94 / 2.55 — OUTSIDE [0,1] by nearly
2×** (est−imp = (1−λ)(p−imp) can never go negative for p>imp inside the axis).
**Per the pre-committed branch 2: the observed HRR gap lies outside anything the
shrinkage axis spans — the finding, about HRR and nothing else: its selected legs
settled below the PRICE-IMPLIED probability itself, i.e. below both the model and
the market. Shrinking the model fully to market would NOT have saved those bets;
the failure is adverse selection into market-overpriced lines (consistent with the
O1.5+ 32% tail), not model-vs-market disagreement. Caveat carried: the ledger's
59.2% is price-implied and vig-inclusive — de-vig shaves ~3–5 pp off the gap and
moves nothing above.**

**BLEND-WEIGHT SWEEP (2026-07-29, owner's item 3 — the λ axis run toward the model;
`tests/blend-sweep.test.ts`, in-loop, both rankings)**: shares 0.15 / 0.35 / 0.50 /
0.75 / 1.00 → prob **+2.7 / +102.4 / +142.6 / +192.4 / +567.0**, EV **+2.7 /
+186.3 / +352.4 / +603.7 / +902.4**, gap +0.0 / +83.9 / +209.8 / +411.3 / +335.4;
cards move at every share (3t/7l at 0.15 — BOTH rankings collapse to one card —
through 6t/12–14l above; the blend-does-not-reach-selection impossible branch does
NOT fire; zero clamped legs). **THE VERDICT IS SELF-LABELED: E[ln]-under-own-belief
rises MECHANICALLY with model share — the evaluation probability amplifies with the
parameter under test. This is the 95-bp shape in its purest form, and per the
owner's own branch the rise gets no reading unless it survives the shrinkage
instrument — which is the SAME axis run the other way, where the gap collapses
(a1-shrink). The sweep can neither withdraw nor vindicate the shipped 0.35; SH_W
stays CHOSEN-unmeasured in the census.** What it does establish: **ONE AXIS** —
model share s = w0·(1−λ); the shipped configuration sits at s = 0.35 (props) /
0.15 (ml-rl); the eval-only gap's zero crossing λ ≈ 0.74 maps to s ≈ 0.09; the
shrink sweep spans s ∈ [0, 0.35], the blend sweep extends it to 1.0. **And the
exit's question is NOT narrowed by the blend**: `phase2_series_b.py` regresses on
**`pModel` — the model-only field** (its L9: "(pModel − open_fair)"), so the exit
reads the raw disagreement; what expresses only ~35% of it is production's GROWTH
(selection and stakes run on the blended `p`) — both halves stated, each on its
own axis. Effective share ≤ nominal everywhere above (`shWm`: calW·calG
shrink-only, not archived — the echo does not yet carry calW; noted).

**WITHIN-TICKET PRICING MAGNITUDE, MEASURED ON THE 07-26 ARCHIVE (2026-07-29,
owner's item 6 — the magnitude before the reopen, not the description)**:
- **The pricing line**: naive product at legacy L2684–85; sim-joint rescale
  L2686–2706 (clamped 0.25–4×) wherever `SIMS[gkey].jointAll` grades the group —
  bare product ONLY where the sim lacks the game or a leg marginal.
- **Share that scales it**: same-game tickets **25 of 218 emitted = 11.5%** (group
  sizes: 2-leg ×14, 3 ×8, 4 ×2, 5 ×1).
- **ρ-repricing of all 25** (first-order pairwise, ticket-level): adjustment
  magnitude mean **1.17 / 2.33 / 4.67 pp**, max **2.32 / 4.64 / 9.27 pp** at
  ρ = 0.05 / 0.10 / 0.20. Sign per pair is event-level and unmeasured without the
  sim; where the sim DID grade (22 of 25), its own signed answer: emitted − naive
  mean **−1.06 pp** (min −16.70, max +3.80; 2 of 22 negative — two large negative
  repricings dominate the mean).
- **THE GATE ANSWER (the pre-committed branch that fired: the gate uses a different
  quantity)**: `czEv` is computed from the EMITTED prob — sim-adjusted wherever a
  group was graded. Allocator pool census: 67 tickets, **3 same-game (all HR
  parlays), ALL sim-graded, ZERO bare-product tickets in the pool** — on this board
  the EV gate never read a naive same-game price, so the M14 admission channel was
  NOT fed by this path here. The exposure class exists structurally (the ungraded
  fallback inside a pool ticket) at **n = 0 on this board** — said rather than
  reported as zero risk.
- **The triplicate's channels**: `czDec`/`czEv`/`czOdds` all **null** — it cannot
  enter the pool, the card, the EV math, or the ledger (`pred-serialize` skips
  `parlaysLive`); display + manual slip-add only. Its bare product verified from its
  own legs (63.9% × 57.0% = 36.4% as displayed); ρ-bound **+1.19 / +2.38 / +4.76 pp**
  at ρ = 0.05/0.10/0.20 — an UNDERSTATEMENT if the two Unders are positively
  correlated. Its number is **M19** (row above); no additional M-number is minted —
  the gate-coupling branch did not fire.
- **CLEAN REPRINT (2026-07-29, owner's item 6 — the earlier print mixed two
  populations)**: emitted tickets **218**; tickets containing a within-ticket
  same-game pair: **25**; same-game GROUPS: **25** (exactly one per ticket);
  simJoint-graded: **22**; tickets containing an UNGRADED group: **3** (the
  triplicate's entries). The "0" that sat beside "25" in the earlier line was the
  allocated CARD's within-ticket group count (6 tickets, 0 groups, 2 cross-ticket
  pairs) — a different population, now separated. **Sign convention restated**: the
  ρ-repricing figures are adjustment MAGNITUDES |Δ| on the ticket probability
  (mean 1.17/2.33/4.67 pp, max 2.32/4.64/9.27 pp at ρ=+0.05/+0.10/+0.20); with
  positive event-level correlation the product UNDERSTATES the joint by Δ, with
  negative it OVERSTATES by the same Δ; per-pair sign is unmeasured without the
  sim. Where the sim graded, its signed answer is emitted − naive: mean −1.06 pp,
  min −16.70, max +3.80, 2 of 22 negative.
- **THE CLAMP (2026-07-29, owner's item 6; denominator restated same day)**: the
  simJoint rescale is clamped **0.25–4×** (L2686–2706). On the 07-26 archive the
  realized factors span **0.564–1.192** (quartiles 1.000/1.029/1.067) over **19
  USABLE ratios of the 22 graded — and the other 3 are UNDEFINED, which is NOT the
  same as unbinding**: those HR-parlay tickets round `probNaive` to 0 at the
  archive's 1-decimal storage, so their clamp state is UNOBSERVABLE from the
  archive. The claim is exactly: **0 binds among the 19 observable; 3 unobservable;
  n=1 board.**
- **THE THREE UNGRADED-GROUP TICKETS, ANSWERED (2026-07-29, owner's item 6 — "n=3,
  not n=0")**: both counts, both populations: **3 ungraded-group tickets among the
  218 EMITTED** (the K's triplicate, all in `parlaysLive`) and **0 among the
  POOL-ELIGIBLE population the spec'd invariant guards** (czDec non-null,
  `parlays`/`parlaysMixed`, no live legs). What makes the group ungradable: **M6 —
  the sim carries no K-count outcome**, so `legP` (built only for simmed legs,
  L1979) has no entry for a `pitcher_strikeouts` lkey and the grading gate
  `if(!(mp>0))ok=false` (L2700) refuses the group — the price falls to the bare
  product BY THE FALLBACK the comment documents. Their dependence treatment: bare
  product, ρ-bound ±2.38 pp per 0.1ρ. **Their czEv is computed from NOTHING —
  `czDec`/`czEv`/`czOdds` are all null (no Caesars quote), so the gate never read
  them: excluded before the gate on TWO independent grounds (czEv null; parlaysLive
  never pooled, L2957–65).** Stake share: 3 × $50 display-tier = 1.40% of emitted
  notional; **not in any allocated card** (the card excludes `parlaysLive`). Per
  the pre-committed branch: **all three are excluded before the gate → the
  invariant stays ENCODABLE and SPEC-ONLY — its population (pool-eligible) is
  genuinely at n=0; the branch-did-not-fire conclusion needed no narrowing, and
  the M14-admission-fed-by-unpriced-dependence coupling remains unobserved on this
  board.** Provenance: the
  bounds are **CHOSEN — no stated rationale in the comment** → they join the census:
  **v2.1 restates 40 parameters / 0 fitted / 39 chosen (12 with no stated
  rationale) / 1 stated-arithmetic** (frozen table row added,
  `docs/collection-period.md`). **Spec'd, NOT shipped (owner's order — encodable
  only while the class is at n=0)**: an invariant failing the build when a
  POOL-ELIGIBLE ticket (czDec non-null, `parlays`/`parlaysMixed`, no live legs)
  contains a same-game group `simJoint` did not grade — today that population is
  empty, so the guard would encode the invariant rather than mask a defect.

**A1's case rests on: penalty removal (paired +27.4/+24.5, ρ=0.20-robust), restored
monotonicity (≤ +1.5, one board), the level effect (+60.6, detectable at 15 boards),
and the floor (min +147.5 vs +27.1). The adoption effect size is OUT OF REACH, not
awaiting boards** — stated wherever A1 is cited. **(RESTATED 2026-07-29, after the
shrink test: the case is penalty removal + restored monotonicity — the price-axis
pair the shrink does not touch. The level effect and the floor are λ=0-conditional:
edge-fragile under shrink-to-market, gap zero-crossing at λ ≈ 0.74 eval-only,
rankings convergent in-loop at λ = 0.5 — SHRINK block below.)**

**M14 ADDENDUM 2 (2026-07-29, owner's variance decomposition — written into the row per
the pre-committed branch)**: on 200 IDENTICAL draws, the two rankings' card outcomes
correlate at only **r = +0.212** (Var(prob) 592.0, Var(EV) 202.0, Var(D) 647.2, Cov
73.4 — the identity closes exactly; SEs 1.72/1.00/1.80). **Identical price draws produce
nearly independent card outcomes: COMPOSITION IS CHAOTIC WITH RESPECT TO PRICE.** Every
interval measured on this board is dominated by composition noise, not price noise — the
pairing bought little precisely because M14's mechanism scrambles the card under either
ranking. Note also Var(EV) ≈ ⅓ Var(prob): EV ranking is not just higher, it is far less
composition-volatile.
| A1–A4 | log-growth measured on ticket sets built from contaminated probabilities | **structural comparisons are belief-generic and stand** (edge-aware > prob, floor scaling, concentration mechanism); **magnitudes are belief-dependent — re-measure post-M11 before applying**. A3 stays a decided-no |

### M14 AUDIT — which measured effects had the allocator in the loop (2026-07-28, owner's item; nothing re-measured)

| finding | how its effect was measured | inherits M14's fixed-card failure mode? |
|---|---|---|
| M1–M13 | row-level (regressions, identities, censuses — no cards built) | **No** — no allocator involved |
| A1 (edge-aware base) | allocator re-run with the patched expression | No — in-loop |
| A2 (leg-equivalent floor) | pool restriction, then the real allocator re-run | No — in-loop |
| A3 (`consMinEv` structure) | analytic (per-leg bar arithmetic, no cards) | No |
| A4 (1/8-vs-1/4 concentration) | allocator re-run at each `kMult` | No — in-loop |
| doctrine δ-shade tables (3.05 etc.) | fixed cards, but the shade changes PROBABILITIES, not prices — evaluation-of-chosen-stakes by design | No (not a price response) |
| two-book crossover shift (+0.10 / 3.15) | **fixed cards under a PRICE change** | **YES — the one affected family; corrected same day (Corrections 3–4), in-loop numbers stand beside it** |

**Count: one fixed-card price-response family existed, and it is the one that exposed M14.**

### M14 ADDENDUM (2026-07-29, owner's items — the adoption number at 200 seeds, A1's own sweep, the damping parameter)

- **Adoption at 200 seeds** (row-uniform draws): net **−26.1 bp, SD 24.3, SE 1.72, CI
  [−29.4, −22.7]** — excludes zero; **game-clustered: −24.9 [−28.2, −21.6]** (both
  printed). 200-seed mean sits inside the 5-seed range (generator stationary — the
  impossible branch does not fire; mulberry32, seeds 7919·s). The uniform −15.0 lies
  OUTSIDE the CI: uniform is a sign-valid, magnitude-understating proxy (~11 bp short).
  Regression of E[ln] on realized per-seed gain: **β = −12.7 bp/pp** (residual SD 24.0
  of 24.3) — magnitude variance explains almost nothing; the spread is composition
  lottery, and the negative β is M14 inside the draws.
- **A1 under its own microscope**: EV-ranking full sweep −1.5→+2.0:
  175.1 / 179.4 / 183.1 / **187.2 (bump 0)** / 188.5 / 190.5 / 194.1 / 194.2 (+1.07) /
  198.2 / **188.3 at +2.0 — NON-MONOTONE**. So per the pre-committed branch **A1 is NOT
  sufficient everywhere; the claim narrows to "sufficient at ≤ +1.5 on one board."**
  At bump 0 EV ranking is HIGHER than prob (+187.2 vs +126.6, +60.6 bp) — on the
  observed board it is not a trade-down, but the +2.0 break and n=1 travel with the
  number wherever A1 is cited. **EV-ranking dispersed adoption: +1.9 [−1.2, +5.0]** —
  the M14 cost vanishes under EV ranking~~; multi-book is blocked SPECIFICALLY behind
  A1~~ **(CORRECTED 2026-07-29: the +1.9 was 60 DIFFERENT seeds — superseded by the
  paired 200 (+1.3 [−0.7, +3.3] uniform / −0.4 [−2.3, +1.5] clustered — includes zero,
  clustered point NEGATIVE; memo lead). The sequencing phrase comes out: A1 removes the
  penalty; it does not make adoption positive — nothing is "blocked behind" A1 waiting
  to proceed.)**
- **The damping constant 0.5 in `eff = base/(1+0.5·sharedGames)` survives the ranking
  swap and is CHOSEN, not fitted** — sweep at 0/0.25/0.5/1.0: prob ranking
  **+90.6 / +122.0 / +126.6 / +130.5** (40 bp range — MATERIAL, monotone rising) vs EV
  ranking +192.6 / +189.5 / +187.2 / +181.5 (11 bp, falling). Per the pre-committed
  branch **0.5 joins `coreEvMin` in the frozen table as unmeasured-and-implicated**
  (annotated there); under prob ranking the chosen value is ~4 bp below damp=1.0 on
  this board. n=1 board throughout.
- **The `coreEvMin` "95 bp below optimum" is WITHDRAWN as a candidate amendment —
  self-graded artifact (owner's shade test)**: the δ=0 peak (ce=30, +221.9) collapses
  under shading — **+24.0 at −3 pp (peak migrates to ce=20, +63.6) and −96.4 at −5
  (worst of all tested values)**. E[ln] under the model's own probabilities rewards
  concentration into the model's own favorite tickets — exactly what overconfidence
  punishes. Restated as: distance from the MODEL'S OWN optimum, not from an optimum.
  Ceiling census beside it: the allocator ENFORCED its ceilings in every sweep card
  (they are its output); one bind at ce=1 ($35 vs $34.7); the ce=20/30 $83 stakes are
  `capG = 250/3` limited with Kelly ceilings ABOVE capG — no contradiction with the
  $28 ceiling, which belonged to a 3.3%-edge ticket absent from high-floor cards (both
  derivations printed). Secondary observation, recorded not promoted: ce≈10–20
  dominates ce=2 at every tested shade (0/−3/−5) on this board — n=1, self-graded
  caveat applies to it too.

### LEVEL vs DERIVATIVE — every card/slip/bankroll-level number, classified (2026-07-28, owner's item; the distinction: LEVEL claims survive M14, PRICE-derivative claims do not)

| number(s) | doc | class | frame | verdict under M14 |
|---|---|---|---|---|
| +55.3 / +126.6 / +139.1 bp; P(0-for-6) 0.0012/0.0949 | singles doc §3 | **LEVEL** | in-loop-built cards, observed prices | **STAND** |
| δ-shade tables and one-book crossovers 3.05 / 3.10 / 3.50 | §4–5 | derivative in PROBABILITY | fixed-card BY DESIGN (the allocator never sees true probs — the card genuinely would not re-select) | stand as evaluations of the shipped card; the TWO-BOOK crossover is separately ruled undetermined |
| 1/8-vs-¼ Kelly (133.0/126.6, +6.4/+5.1) | §5b | LEVEL comparison | in-loop at each `kMult` | STAND |
| A1 149.7/187.2 bp, crossover 1.40 | correction block | level + prob-derivative | in-loop | STAND |
| A2 16.45%, +139.1, 3.50 | §2 | level + prob-derivative | in-loop | STAND |
| D-card $14/+2.9%; counterfactual $64/11 legs | collection doc | LEVEL | in-loop configs | STAND |
| slip capture +1.45/+1.74/+1.95 pp per dollar (M15-corrected) | multibook memo | LEVEL price fact (EV capture; no allocator involved) | population measurement | stand, canonical-key + vintage stamps |
| first-order +10.1/+15.8 bp | memo/addendum | derivative in PRICE | flat-stake | retired (Correction 1) |
| two-book 3.15, four-row 2bk columns, +0.125 CI | correction block | **derivative in PRICE** | **fixed-card** | **hypothetical-allocator only, both marks** |
| in-loop two-book 0.513 / −2.50 / +70.3 | correction block | derivative in PRICE | in-loop THROUGH the defect | M14 evidence, not a measurement |

**Direct answer to the owner's question: NO doc attributes a bankroll/growth (bp) effect
to a row-level M-item.** The two-axis rule at the top of this bundle (MODEL = pp,
ALLOCATION = bp, "not commensurable") prevented exactly that; grep-checked 2026-07-28.
The one pp-to-crossover mapping ("7.6 pp board-wide gap vs the ~3 pp crossover", singles
doc) is unit-consistent by construction — the crossover is DEFINED in per-leg pp — and it
now inherits "crossover undetermined" for the two-book case rather than a marker of its
own.

**Speccable now:** M8, M11, M10's bbr shrink, M1. **Must wait:** M4 and M3's weights (for
M11), M7+M9's rung numbers (for M11 + the reference), M2's magnitude (for the pitcher-blend
audit — a NEW open item this table created), every allocation magnitude (cheap re-runs
post-M11). This ordering is what "assembled in draft so 09-22 is a decision" requires and
did not previously carry.

### ⚠️ M2 IS AN INTERLOCKED PAIR — a defect masking a defect (2026-07-27)

`of = shClamp(0.140/oo, 0.86, 1.12)` is a **constant 0.860 today**: `oo` (lineup TB/AB)
never drops below ~0.30, so the ratio can never escape the floor. **A defect masking a
defect** — the 0.140 error welds shut the door its own noise would flood through. Measured:
`of` = 0.860 on every fixture lineup; `offense()`'s noise has **exactly 0.00 pp** of effect
on any outs price today.

Ship `0.140→0.400` alone and the door opens: `of` spans 0.860–1.082 on the same lineups, and
the `offense()` estimator noise (per-player TB/AB blend ≈ 0.096, lineup-averaged ≈ 0.032)
maps to **≈ ±12 pp of pure noise on P(over)** at λ ≈ 16.2. A fix that makes the market worse
— the third instance of the class (M11's first spec, the retime-without-server-boards), and
the first one known IN ADVANCE.

**The pair, specced:**
1. the constant: `0.140 → 0.400` (league TB/AB);
2. the de-noise, SAME change: `offense()` anchors each player on **xSLG** (expected TB/AB,
   in priors) with the windowed term at weight ≤ ~0.1 — the weight the three-market
   regression measured, not assumed. **Residual noise ≈ ±1.2 pp** — under the ~2 pp bar, so
   M2 is ready once paired; above it, it would not have been ready regardless of the
   constant.

**Enforced, not noted**: `tests/m2-interlock.test.ts` pins the 0.140 era and, the moment the
constant changes, demands de-noise evidence inside `offense()` itself — the lid-coupling
pattern. A future session cannot ship half.

**And the leash ceiling was doing the same thing (2026-07-27)**: the outs compression it
appeared to bound was an ESTIMATOR defect (the cliff + league target, model spread 63–75% of
true), not a real ceiling effect — **the second instance of a defect masking a defect in
this one market**. Estimator repair alone reopens the spread to 92–93%.

**And the outs estimator itself, from the same measurement pass** (within-start SD 3.25,
between-pitcher 1.76, n=172 pitchers): the optimal per-start k is **3.4 — k=4 was
numerically right all along; the defects are the CLIFF (season discarded whenever 3 recent
starts exist) and the LEAGUE shrink target** (the regression says season carries +0.61).
Season-anchored `ipg = shShrink(season_ipg, gs, ~3.4, Lipg)`: model spread goes from
**63–75% of true (36–53% noise)** to **92–93% of true (13–16% noise)** — the compression
mostly closes by measured shrinkage alone. **Outs is fixable inside the bundle: measured
shrinkage + this pair. It does not need the sim** — M2′ stays the strictly-better
alternative, not a necessity, and outs is NOT a post-freeze project.

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
| **A2** | **leg-equivalent EV floor** — `1.02^n − 1` instead of a fixed +2% | **4 of 18 tickets (22%)** admitted only because the floor does not scale; crossover 3.05 → **3.50 pp**. ⚠️ **A2 SELECTS INTO THE WORST MARKET (measured 2026-07-27, owner's finding)**: on the 07-26 counterfactual the floor alone keeps both HRR-O0.5 tickets (+7.0%, +6.6%) and kills both TB tickets (+3.3%, +2.4%) — it is an EV-quality filter, and HRR's EV is highest precisely BECAUSE it is the most mispriced market. **A2 is not a safety measure on defect grounds and must not be reasoned about as one**; it corrects an over-admission asymmetry, and unaccompanied it concentrates exposure toward defects. Floor and suspension are complements, never substitutes | nothing |
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
| ~~the sim's +5.0 hits OVERSHOOT~~ | **MEASURED AND DECOMPOSED 2026-07-27 — now M12.** The endogenous-PA candidate is REFUTED (dynamics read **−0.82 pp**); the heat is the log5 branch (+2.70) and the static factor set (+4.3). See the M12 row above |

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
