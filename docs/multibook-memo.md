# Multi-book execution — SCOPING MEMO (2026-07-28, measured; nothing built)

> ## ⚠️ ADDING THE SECOND BOOK UNDER THE SHIPPED ALLOCATOR IS NEGATIVE ON THIS BOARD
> (2026-07-28, owner's item — this sentence leads the memo, above every price number in it.)
> M14's composition cost at the MEASURED gain exceeds the gain: uniform +1.07 pp/leg in
> the loop lands E[ln] **+111.6 vs the no-second-book base +126.6 — net −15.0 bp**; the
> empirical-dispersion bump (the real ~54%-zero gain distribution, 5 seeds) lands mean
> +100.1 — **net −26.5 bp**, same sign. **Multi-book adoption is BLOCKED BEHIND A1/A2**
> (M14's fix), not behind price measurement. Every per-leg/per-slip number below is a
> GROSS price fact; **the net is negative until M14 is dispositioned, and this memo
> prints the net, never the gross, wherever adoption is discussed.** n=1 board.

Owner context: live BetMGM NV and Circa accounts exist. `PLAY_BOOKS` is a single-entry
config from Phase 5. This memo reports feed reality, the measured prize, the schema
surface, the gate's shape, and the freeze posture. **Report only.**

## 1. FEED REALITY — measured today (28 events; 1 event's props; regions us,us2,eu)

| book | game markets | props |
|---|---|---|
| **betmgm** | ✅ h2h, totals | ✅ **5 of 6** on the sampled event (hits, TB, HRR, K's, outs — no `batter_home_runs` there; single-event sample, re-check on a fuller day) |
| **circa** | ❌ absent | ❌ absent — confirms the standing memory |
| westgate / superbook | ❌ absent (the historical `superbook` key is gone) | ❌ |
| south point | ❌ absent | ❌ |
| STN / station | ❌ absent | ❌ |

39 bookmakers in the game census, 15 in the props census; the full lists are reproducible
via the proxy queries in this memo's history. **Only BetMGM of the five targets is in the
feed.** The absent books need the paste path: the ASG `parseCaesarsBoard` pattern — one box,
whole-board paste, a line router that prices rows at that book and marks them
basis-eligible. Operationally: open the Circa app pre-lock, paste the props board (~1–2
min); staleness is bounded by the lock guard's 30-minute freshness; the bet itself is
manual either way (this system prices, the owner executes). Feed-`betmgm` is the national
line — NV occasionally differs, which the existing at-lock confirm discipline covers.

## 2-CORRECTED (2026-07-28, owner's catch): THE ORIGINAL PRIZE WAS MEASURED OVER THE WRONG POPULATION

**The +1.70/leg headline below is SUPERSEDED for the decision** — it maximized over
{DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,
not assumed — DK has no NV book at all; FD's is a single in-person counter at the Fremont
(no online), and both companies' NV licensing collapsed in Nov 2025 over prediction-market
plans. Same class as the night-game and fixture-thinness selections: a measurement over a
population the decision does not apply to. The original numbers stay below for the record.

**THE PLAYABLE PRIZE — best-of-{CZ, MGM}, the set the owner can actually bet (n=511
both-priced rows, 07-27):**

| number | value |
|---|---|
| per LEG: max(CZ,MGM) − CZ | **+1.01 pp mean** (median +0.00, p75 +1.60), **44% of legs improved** — empirically confirming the owner's dispersion arithmetic (analytic ≈ +0.95): equal means with ±1.6 IQR is the textbook case where shopping pays. **The gain is dispersion, not a better book — realizable today with the existing MGM account** |
| per 3-leg SLIP, **one book per slip** (bootstrap 4,000 slips) | **+1.60 pp mean** (median +0.08 — tail value; p75 +2.66), **51% of slips improved**. The naive 3×-per-leg figure (+3.0) mixes books within a slip and is the WRONG number — stated in the headline because the per-leg number WILL be read as the ticket number by a skimmer |
| the 07-26 ticket-level restriction | **uncomputable** — per-book prices (`fp`) begin 07-27, so MGM's 07-26 prices are unrecoverable. The DK/FD-basis ticket numbers below (+3.20 median, 10 new clears) are unplayable-basis artifacts. **Follow-up, dated: the first day carrying BOTH a board and `fp` (07-28 onward) computes the exact per-ticket argmax gains and the +2%-new-clears count over {CZ, MGM}** |

## 2b. THE DECOMPOSITION, THE UNLOCK, AND THE CROSSOVER — measured (2026-07-28, later)

**Per-market per-leg gain (max(CZ,MGM) − CZ)** — the gain is IN the ticket markets:

| market | n | mean | 95% CI (bootstrap, 4k) | improved |
|---|---|---|---|---|
| H+R+RBI | 257 | +0.87 | [+0.68, +1.08] | 107/257 |
| total bases | 236 | **+1.15** | [+0.94, +1.36] | 106/236 |
| outs | 18 | +1.14 | **[+0.58, +1.83]** | 10/18 |

**CI reading (added 2026-07-28, owner's item)**: outs' CI at n=18 spans BOTH other means —
**+1.14 is not distinguishable from +0.87 and does not sit in this table as a peer
number**; it is a small-sample point estimate. ~~TB−HRR = +0.28 with SE ≈ 0.15 (z ≈ 1.9) —
suggestive, not conclusive at 95%.~~ *(superseded same day by the dedup correction below)*

**⚠️ CORRECTION (2026-07-28, later — owner's resampling-unit check): THE n=511 DOUBLE-
COUNTED, AND EVERY CI ABOVE WAS ROW-RESAMPLED ON CLUSTERED DATA.** The "511 both-priced
rows" pooled the day's TWO snapshots (pre + close), so the same physical row appears up to
twice: **the unique population is 362 rows across 11 game-clusters** (dedupe = last
snapshot wins). Corrected numbers, game-clustered bootstrap (cluster = odds-API event id,
the definition printed per the pre-committed branch):

| number | duplicated/unclustered (above) | deduped + game-clustered |
|---|---|---|
| per-leg mean | +1.01 | **+1.08** (n=362) |
| slips k=2/3/4 | +1.42 / +1.58 / +1.74 | **+1.45 / +1.74 / +1.95** |
| HRR | +0.87 [+0.68,+1.08] n=257 | **+1.00 [+0.74,+1.28]** n=181 |
| TB | +1.15 [+0.94,+1.36] n=236 | **+1.13 [+0.88,+1.43]** n=169 |
| outs | +1.14 [+0.58,+1.83] n=18 | **+1.55 [+0.80,+2.14]** n=12 — stays demoted, CI still spans HRR |
| TB−HRR | +0.28, z≈1.9 ("suggestive") | **+0.13 [−0.13,+0.38], z≈0.96 — INDISTINGUISHABLE; the 1.9 was duplicate-inflated** |

Outs' clustered CI is NARROWER than unclustered at the top end — investigated per the
impossible branch rather than shrugged at: within-game outs pairs are negatively
correlated (**r = −0.37 over 5 pairs** — both pitchers of one game), and negative
within-cluster correlation legitimately tightens cluster resampling. The definition is
right; the narrowing is measured structure. The 5:6 weights' claimed independence,
measured as overlap (owner's rule): the counterfactual card's pool (the 07-26 board's 69
HRR/TB parlay-pool leg keys) overlaps the 07-27 population **17% by exact row key, 46% by
player** — distinct but not disjoint; only the "uninformative" marking survives.

**Raw-payload census, stated exactly (owner's hygiene item)**: raw payloads on disk = **two
events, ONE fixture-day** (PIT@AZ canonical-keys + NYY@CWS alt-keys, both 2026-07-28).
The CLV probe's 38 lost-fair rows all came from the single canonical-keys event (PIT@AZ:
199 rows / 134 discards / 38; NYY@CWS: 246 / 185 / 0 — its payload was alt-heavy by
construction). Two events is not a history; the CLV numbers are a one-day prospective
probe and are labeled so above.

**M15 (2026-07-28, owner's item — the duplication IS a measurement defect, not a cleanup
note)**: the population that produced the ORIGINAL +1.01 / +1.60 / +1.58 and the §2b
tables pooled the day's pre and close snapshots as if they were independent rows —
**511 = 362 unique rows double-counted ~1.4×**. That is M-numbered (bundle) because it
biased every CI computed on it (TB−HRR's z≈1.9 was a duplication artifact) and it is the
same class of error as pooling vintages. **Bet-time vs close, measured separately per the
owner's rule** (execution happens at lock, not at close):

| vintage | n rows | games | headline gain | 95% CI (game-clustered) |
|---|---|---|---|---|
| **PRE (operative — bet time)** | 326 | 11 | **+1.07** | [+0.88, +1.33] ⚠️ FEW-CLUSTER (11) |
| CLOSE (filed under CLV) | 185 | 6 | +0.90 | [+0.63, +1.17] ⚠️ FEW-CLUSTER (6) |

Per-market pre: HRR +0.94 (168), TB +1.22 (146), outs +1.03 (12); close: HRR +0.74 (89),
TB +1.02 (90), outs +1.38 (6). The close snapshot covers only 6 of 11 games, so the
comparison is composition-confounded; within few-cluster intervals they agree, PRE is the
operative headline, and slip figures restate on pre when re-measured post-M13.

**⚠️ FEW-CLUSTER MARK (2026-07-28, owner's item 6 — applied to every interval in this
section)**: all clustered CIs here rest on **≤11 game-clusters** — outs' demotion on 7,
TB−HRR (z≈0.96) on 11, the pre/close split on 11/6, and the crossover-shift interval
[+0.033, +0.247] on 11. The outs within-game correlation r=−0.37 rests on **5 pitcher
pairs** (5 of 7 outs games carry two pitchers). An interval that excludes zero on 11
clusters is not the claim it would be on 200; none of these intervals graduates past
few-cluster until the multi-day series exists.

**PERMUTATION CHECK (2026-07-28, latest — owner's anti-conservatism item): TB−HRR exact
cluster sign-flip p = 0.308** (per-game difference of means, 11 games, all 2¹¹ flips) —
noise, full stop; the demotion is now permutation-backed, not just CI-backed.

**PRE vs CLOSE, PAIRED (owner's confounding fix — the only comparison isolating vintage
from composition)**: restricted to the 6 games carrying both snapshots, paired within row
key: **149 pairs, mean paired difference (close − pre) +0.082 pp, exact sign-flip p =
0.875, clustered CI [−0.191, +0.433]** (6 clusters, FEW-CLUSTER). **Pre and close are
indistinguishable on the shared population; the unpaired gap (+1.07 vs +0.90) was
COMPOSITION and is not a signal.** The 36 close rows without a pre counterpart are NOT
key instability: 22 existed pre and gained cz/MGM/fair coverage by close (coverage
churn), 14 are newly-posted lines — the join key is stable and the impossible branch does
not fire. Pre keeps the operative label by bet-time convention, not by measured
difference.

**THE SECOND PAIRING EXISTS — "unrecoverable" CONDITIONALLY WITHDRAWN, dated 2026-07-28
(fourth claim, owner's catch again)**: the prediction store's `PredRecord` carries **`cz`
per row** ("Caesars price if offered" — written by the ENGINE, which reads the
alternates), plus `lkey` (`player|market|line`), `p`, `pMkt`, `src: cron|client`
(`src/lib/pred-serialize.ts` L9–40). Client generates logged 2026-07-27. So
**prediction-records × archive-`fp` plausibly joins on 07-27/07-28 TODAY** — the store is
`pl:pred:<date>` behind `GET /api/predictions?date=` — **zero credits, only your sync
phrase** (`x-pl-sync` header). The withdrawal is conditional on one authed read showing
hits/K's rows with non-null `cz` in those blobs; the owner runs (typing his own secret):
```bash
curl -s -H "x-pl-sync: <sync phrase>" "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-27" > pred27.json
```
CLV sightings are NOT the pairing: they require a locked card (none) and live in the
same-gated ledger. **The fp one-day gap is a DEPLOY ARTIFACT, resolved**: `fp` entered
`compact()` in `28bbddf` at 2026-07-26 **21:39:41Z** — AFTER both of 07-26's sweeps
(07:55Z, 20:32Z); a backfill was never possible (no raw payloads stored; propsnap empty
— checked). Not an unrun backfill.

**PRE-COMMITTED, ON DISK BEFORE THE OWNER RUNS THE CURL (2026-07-28, owner's item 6):**
- **Substrate**: the one recorded contamination in this store is the two-generator /
  six-day provenance ambiguity — rows written before Phase 0.5 (2026-07-24) carry
  neither `src` nor `selMode`, and `CAL_START` excludes them (`src/lib/pred-serialize.ts`
  L35–40). 07-27/07-28 records post-date that deploy, so they carry both fields — their
  cleanliness on those axes is establishable FROM THE BLOB ITSELF when read. No recorded
  prediction-vs-ledger disagreement or leg-count misread touching 07-27/28 was found on
  disk (searched `misread`/`contaminat*` across the finding docs); beyond that, disk
  cannot establish more — the blob read is the establishment.
- **Vintage**: `cz` is the GENERATION-TIME price — merge rule is last-pre-start write
  wins, frozen at first pitch (`pred-serialize` L324–331) — so it pairs with the
  archive's **pre** snapshot. Anything else would be a vintage mismatch; none is named.
- **The read** (zero credits — the route only reads redis; sync phrase only):
  `curl -s -H "x-pl-sync: <phrase>" "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-27"`
  → response `{date, at, records: {k: PredRecord}, parlays, games}`;
  `records[k] = {k, label, sub, market, lkey, p, pModel, pMkt, cz, czEv, ln, susp, src, …}`.
- **The branches, committed now**: (1) rows join carrying both `cz` and `fp` → the hits
  two-book gain gets its first measured magnitude, **stamped one fixture-day +
  pre-vintage**, and "unrecoverable" withdraws with a dated marker — fourth claim,
  fourth outcome. (2) rows join but `cz` is null throughout hits/K's → **the field is
  written and never populated — an M-item, not a join failure**. (3) zero rows → the
  query and the keys actually present under `pl:pred:*` get printed (the same curl
  without `date` returns the day list). (4) impossible branch: pred rows exist for
  2026-07-26 → the boards={07-26} / fp={07-27,28} partition was wrong and the same-day
  join was available two turns ago — print both. (The public `/api/calibration` is
  aggregates-only and cannot pre-answer (4); the day-list read settles it.)

**⚠️ POPULATION STAMP (2026-07-28, post-M13)**: every two-book number in this section —
+1.01/leg, +1.42/+1.58/+1.74 per slip, this per-market table, and the crossover
recompute — is measured over the **canonical-key archive population** (§2c): CZ priced at
canonical keys only, and every CZ-alternate-only row (ALL hits and K's rows, deep HR/TB
rungs) excluded by construction. A post-M13 archive changes both the row universe and the
CZ price on existing rows; these numbers do not carry forward to it unre-measured.

The mix-weighted slip bootstrap (5 HRR : 6 TB) lands **+1.58 pp at k=3** vs uniform +1.60.
**Weight source and what the agreement is worth (2026-07-28)**: the weights come from the
07-26 counterfactual card's 11 legs (collection-period.md) — an independent construction,
not the both-priced population itself — BUT the comparison is **uninformative either way**:
the population's own shares (50% HRR / 46% TB) sit next to the card's (45/55), and with
per-market means only 0.28 apart, no nearby reweighting can move the slip number
materially. Recorded as arithmetic necessity, not validation.

**THE UNLOCK — ⚠️ RETRACTED same day, 2026-07-28 — see §2c (M13)**: the paragraph below
was this memo's biggest claim for ~half a day and is WRONG — the absence it reports is the
ARCHIVE SWEEP's request list, not the feed. Kept verbatim for the record:

> the feed's Caesars (`williamhill_us`) is missing from **100% of hits rows (369/369) and
> 100% of K's rows (37/37)** in the archive (HR 42%, TB 44% partial). Whole markets cannot
> settle at CZ from the feed today — which is why hits legs never reach the pool.
> **Multi-book does not just improve prices; MGM settlement UNLOCKS hits and K's as
> ticketable markets.** (Feed subset ≠ the physical book, per the ASG correction — but the
> pipeline can only settle what the feed quotes.)

**THE CROSSOVER AT TWO BOOKS — the per-dollar arithmetic runs OPPOSITE the forfeit
intuition (owner's item, answered with a sign flip):** the per-LEG forfeit is real and
grows with leg count (per-leg-equivalent capture +0.71/+0.53/+0.44 at k=2/3/4 → forfeit
+0.30/+0.48/+0.57 vs the singles' +1.01). **But the staking unit is the dollar, not the
leg**: a slip captures the max over its whole stake — +1.42/+1.58/+1.74 pp per dollar at
k=2/3/4 — MORE than a single's +1.01, and growing with k. **CORRECTED 2026-07-28 (owner's
frame + sign checks, both same day)**: the first-stated ≈ −3.2/−3.3 shift was flat-stake
first-order arithmetic in a different frame than the doctrine's Kelly log-growth number,
and mixed sign conventions besides. Recomputed IN the doctrine's frame (exact E[ln] over
2⁶, production stakes, $250/card both sides, harness-validated): **crossover 3.05 → 3.15 pp
of tolerated per-leg overconfidence (leg-equivalent card 3.50 → 3.60) — still in the
parlays' favor, but +0.10 pp, a third of the first-order figure.** Mean-shift and
empirical-dispersion variants agree. **CORRECTED AGAIN same day (Correction 3): the 3.15 is
a FIXED-CARD statement only** — CI on the fixed-card shift +0.125 [+0.033, +0.247]
(deduped, game-clustered; excludes zero) — but with the production ALLOCATOR in the loop
the fixed +2% floor admits price-improved marginal tickets, the prob-weighted greedy
displaces higher-growth ones, and the fixed-floor crossover collapsed 3.013 → 0.513.
**AND CORRECTED A FOURTH TIME (owner's monotonicity control): the collapse is NOT a
two-book property — the identical uniform bump in ONE book produces the same non-monotone
E[ln] curve (+126.6 → +129.0 → +117.3 → +110.4 → +70.5 → +74.4 bp at 0/+0.25/+0.5/+1.0/
+1.5/+2.0 pp), so this is M14, "allocator non-monotone in price" (threshold admission at
`coreEvMin: 2` — which does NOT expire at the reopens — plus price-blind prob-greedy
ranking), and Correction 3's two-book attribution is retracted as mis-attributed. The
multi-book adoption decision is downstream of M14, not of the books.** Full
four-correction chain in `docs/singles-vs-parlays.md`.

**Three leg-count forces now exist, each decided alone** — shopping rewards legs per
dollar (this memo), A2's leg-equivalent floor penalises them, `consMinEv`'s multiplicative
structure rewards them — flagged for a JOINT review at exit rather than three independent
knobs.

**THE CLV COST, CORRECTED (owner's catch, verified in `clv-core`)**: the sighting computes
`consensusFair` from all books and THEN discards everything on `if (cz == null) return
null` — the fair-points CLV (the PRIMARY number per `docs/clv.md`) does not need the
settlement book and is being thrown away with it. **As coded: a Circa/MGM-settled ticket
loses its whole close. After a one-guard decoupling: it loses only the cents column.** The
decoupling is necessary under multi-book anyway (every MGM-settled hits ticket would
otherwise lose CLV) and it also covers Caesars quotes the feed happens to miss — ~~which the
unlock finding shows is whole markets, not edge cases~~ *(clause voided 2026-07-28 by the
§2c retraction; the decoupling argument stands on the first two grounds alone)*.

**THE COUPLING, RUN — not just read (2026-07-28, owner's item; the real kernel over the
two on-disk raw payloads, probe test deleted after the run):**

| population | examined | sighted | cz-guard discarded | **discarded WITH a computable fair** |
|---|---|---|---|---|
| prop rows (2 events) | 445 | 126 | 319 | **38** |
| ML legs (28 events × 2) | 56 | 42 | 14 | **14 of 14** |

Both sightings (`sightProp`'s `am == null` and `sightGameLeg`'s `cz == null`) confirmed to
discard computed fairs. Two more instrument facts from the same run: (i) **the fair panel
SHIFTS row to row — 47 distinct book-set signatures across the 111 fair-bearing prop
rows**, and CZ sits INSIDE the consensus on 36 of 111 (in-panel where present, out where
not) — so fair-points is measured against a non-constant panel and is not strictly
comparable across rows; any cross-row CLV aggregation must state this. (ii) The de-vig
pair rule held on all 334 one-sided book-quotes encountered — zero fairs from pairs no
book posted (the `bo`/`bu` phantom-pair defect is NOT present in `clv-core`).

**The HISTORICAL count is not verifiable from here and is stated as such**: stored
sightings live in the auth-gated ledger (`pl:ledger:v1`, CRON_SECRET/sync-phrase — the
owner types his own secrets). Structurally the history is plausibly near-empty (sighting
requires a LOCKED card; the gate has blocked 100% of tickets; the pipeline is dark since
07-26) — in which case the earlier "verified in clv-core" was a code read over an empty
history, i.e. vacuous as a historical claim. The numbers above are the prospective
per-board measurement instead. N_total/N_lost over the stored ledger needs one authed
read (owner: Upstash console, count legs carrying `clv` and those with `consensusFair`
null) — `/api/clv` GET is NOT that read (it spends quota and fires a sighting).

**DECOUPLING = INSTRUMENT CHANGE, pre-committed handling (2026-07-28)**: when the
one-guard decoupling ships (own sign-off), it is a mid-window instrument change — the
sighting record gets a vintage stamp, the CLV series segments pre/post at that commit,
and pre-decoupling sightings are NEVER reinterpreted under the new guard. Corrections are
addenda; vintages never pool.

**⚠️ THE TICKET-LEVEL FOLLOW-UP IS BLOCKED, NOT SCHEDULED**: "the first day carrying both a
board and `fp`" requires a board, and none exists until the cron header is fixed and the
manual curl runs (CLAUDE.md's outage chain). Recorded as blocked-on-the-pipeline.

## 2c. M13 — THE "100%" WAS THE SWEEP'S REQUEST LIST, NOT THE FEED (2026-07-28, owner's raw-vs-parsed check)

The owner pre-committed the branches before the check ran: *"CZ entries present in raw
payload → this is a parser defect, not coverage. It takes an M-number, the memo's unlock
claim inverts, and the largest stated justification for the MGM account disappears."* That
is the branch the data chose. Evidence chain, in the order it landed:

1. **Reproduction with the query printed**: population = every `snapshot × event × market ×
   row` in `data/props/2026-07-27.json` (2 snapshots), row counted CZ-present iff `cz` is
   non-null. Hits 0/369, K's 0/37, HR 484/833 (58.1%), TB 267/473 (56.4%) — the §2b figures
   reproduce exactly. Not a wrong-population artifact.
2. **14 fixture-days of parsed archive** (`origin/line-history:data/props/`, 2026-07-12 →
   07-28): hits **0/7,033 CZ-present, zero on 14 of 14 days**; K's **0/830, zero on 14 of
   14**; the four CZ-present markets are present on **every** day at 60–79%. Perfectly
   all-or-nothing per market — but the parser is shared across days, so this could not
   settle raw-vs-parsed on its own.
3. **Parser audit** (`tools/snapshot_props.py compact()`): `cz` is set for ANY row where
   `williamhill_us` posted even ONE side (outside the two-sided fair gate); book match is
   exact string equality; no market-conditional cz logic exists. The only surface left was
   the REQUEST: `MARKETS` = the six canonical keys, no `_alternate`.
4. **Raw payload, canonical keys** (PIT@AZ 07-28, on disk): `williamhill_us` posts exactly
   4 market keys — HRR 34, HR 40, TB 34, outs 4 outcomes — no `batter_hits`, no
   `pitcher_strikeouts`, while 10+ books post `batter_hits` in the same response.
5. **Raw payload, alternate keys** (NYY@CWS 07-28, one fresh call, ~12 Odds-API credits
   incl. one empty far-out event): `williamhill_us` posts **`batter_hits_alternate` — 48
   outcomes at 0.5/1.5/2.5, INCLUDING the main line — and `pitcher_strikeouts_alternate`
   at 2.5–9.5**. Caesars is in the feed for hits and K's.
6. **The engine already knew** — `legacy/index.html` L1158–1162: *"Caesars posts hits and
   Ks as milestone ladders … exposes under the `*_alternate` market keys … Verified live:
   Caesars absent from batter_hits/pitcher_strikeouts but present in both alternates.
   These feed ONLY the Caesars playable price on existing rows"* — and L1366 requests
   `SH_PROP_MARKETS + SH_PROP_ALT`. **Production already prices hits/K's rows at CZ.**
   The §2b claim contradicted the engine's own documented, live-verified behavior.

**VERDICT — M13, a collection defect, not a feed fact**: `tools/snapshot_props.py`
requests only the canonical six keys while the engine requests canonical + three
alternates; 14 days of archive are blind to every CZ-alternate-only quote, and the memo
read that blindness as feed coverage. **The unlock claim is retracted (same day). Hits and
K's were never feed-unsettleable at CZ; the largest stated justification for the MGM
account disappears.** What remains for MGM is §2b's dispersion prize, now stamped (see the
population stamp below §2b's table) — plus two narrow residual facts, stated as facts and
not advocacy: CZ's hits/K's ladders are **Over-only milestone boards** (an Under hits/K's
leg still has no CZ price), and a one-sided quote can never make a row `czf` (two-sided
fair) — CZ contributes a playable price there, never a fair.

**§2c SCOPE AND COUNTS (2026-07-28, owner's item — what n the inversion actually rests
on)**: the fresh alternate-key evidence is **ONE event, ONE fixture-day** (NYY@CWS,
2026-07-28; the other alt-key call, SEA@LAD ~29h out, returned no prop markets at all —
props unposted, not CZ-specific). Per the pre-committed reading: **M13 stands as an
existence proof that CZ appears under the alternates, NOT as a coverage rate**; the
archive's 0/7,033 and 0/830 remain facts about the request list either way, and the
production-side join above (24/36 hits, 20/27 K's cz-present on 07-26) supplies the
multi-row, different-day corroboration through the engine's own alternate-reading path.
Observed CZ outcome counts in the raw alt payload — counted, not inferred:
`batter_hits_alternate` **48 Over / 0 Under** across **18 distinct players — 9 NYY + 9 CWS,
both lineups, all 18 matched to the statsapi boxscore rosters**; `pitcher_strikeouts_alternate`
**13 Over / 0 Under** across 2 pitchers (both probables). Over-only stands on observation.
The one-sided-cannot-czf mechanism, cited: `tools/snapshot_props.py` L69–72 (`fb` is
appended only inside the `"o" in pair and "u" in pair` branch) → L104 (`czf = CZ in fb`);
engine-side `legacy/index.html` L1419 (`czAlt` is a ladder FALLBACK for the playable price
only — "standard Caesars quote wins" — and never feeds fairs).

**The Over-only ceiling the retracted claim was always under (uncounted at the time,
counted now)**: the 07-26 counterfactual D-card contained **zero hits/K's legs** (its 11
legs were 5 HRR + 6 TB), so the ceiling is stated on the emitted-parlay pool instead: of
the 110 archived 07-26 parlays' hits/K's legs, **hits 68 O / 25 U, K's 25 O / 8 U — ~73–76%
Over**. Even before the retraction, at most ~three-quarters of the "unlocked" legs were
ever CZ-priceable (Over-only ladders); the ~26% Under side has no CZ price from any key.
(07-27 population): HR — CZ present on **100% of 0.5 rows (305/305), 64% of 1.5, 0% of
2.5**; TB — CZ posts **exactly one line per player** (267 one-line, 0 multi-line), and
cz-absent rows carry median 1 book behind the fair vs 4 for cz-present (thin alt rungs).
On the one alternate-probe event CZ posted nothing under HR-alt or TB-alt, so the deep
rungs there look genuinely unposted by CZ — one-event caveat. Partial absence = ladder
depth, not player coverage.

**Proposed fix — NOT built, owner's sign-off required (collection change with a credit
cost)**: add the engine's three `_alternate` keys to the sweep's `MARKETS` (~6 → ~9
credits/event, ≈ +45/sweep on a 15-game slate, ≈ +2.7k/month at twice daily), fold
alternate quotes into the same `player|line` rows (same-line quotes are the same
proposition; prefer canonical where both exist, flag `src:"alt"`), and **vintage-stamp the
archive change** so pre/post never pool (the script's own `n`-comparability precedent).
Guard candidate for encoding WITH the fix: a test extracting `SH_PROP_MARKETS`/`SH_PROP_ALT`
from source and asserting the sweep's list ⊇ the engine's — the archive exists to audit the
engine and is currently blind to an input the engine uses.

**SIGN-OFF PREREQUISITES, ALL FOUR MEASURED (2026-07-28, owner's item 7 — the sign-off is
NOT granted this turn and stays open). SUPERSEDING CONDITION (2026-07-28, later): the
sign-off now waits on the CREDIT BURN PLAN (`docs/collection-period.md`, "THE CREDIT
BUDGET DOES NOT REACH THE PARAMETER EXIT"), not on these four prerequisites — the
instrument the fix extends is not funded to exit, and that question outranks this one:**
1. **Nothing the engine reads sits downstream of the sweep** — audited: `data/props`
   consumers are `ProScoreboard.tsx` (a DISPLAY-only CLV/calibration panel reading
   raw.githubusercontent, no writes back to anything the engine reads), four analysis
   tools (`close_capture`, `close_fair`, `phase2_series_b`, `hr_overround`) and two
   workflows. Calibration/`mktN` come from the prediction store, consensus from the live
   feed, priors from the context pipeline — none touch the archive. **Instrument change,
   not an engine change wearing a costume** — with one named visible seam: the scoreboard's
   CLV display will show the vintage boundary (CZ hits/K's closes appearing post-fix).
2. **Credits, read live** (proxy passes the Odds-API headers through): **2,317 remaining /
   17,683 used** at 2026-07-28 evening. This turn's raw verification spent ~12. The fix
   costs **+3/event ≈ +90–96/day** (15–16 events × 2 sweeps) on top of the sweep's current
   ~180/day — at today's headroom that is ~8–9 days of quota unless the monthly reset
   lands first; **the reset date is on the dashboard, not readable from here, and the
   sign-off should price it**.
3. **The guard exists and has been OBSERVED RED**: `tests/sweep-covers-engine.test.ts` —
   run as a plain `it` it fails printing exactly the three missing alt keys; committed as
   `it.fails` (documents the open defect, keeps the build green) with a PLANT proving the
   check sees coverage where it exists. Flipping `it.fails` → `it` is part of the fix
   commit, per the teeth-test standard.
4. **The 14 archived days are UNRECOVERABLE for CZ hits/K's** — recorded in
   `docs/collection-period.md` as a captured-field gap with its date range
   (2026-07-12 → 2026-07-28; raw exists for two 07-28 events only).

**§2c-ADDENDUM (2026-07-28, owner's item — ARCHIVE vs PRODUCTION, the diff RUN, not read):**
the "only the archive is blind" sentence was a code read; here is the measurement. The
production-side per-row record is the **board archive** (`data/boards/<date>.{best,latest}
.json.gz`, `origin/line-history`, retention = git history; series began 07-27 with 07-26
backfilled). It records per row the CZ price (`cz`/`czOdds`), the DK/FD basis, and a book
COUNT (`books`) — **not book identities and no MGM price** (field census: `book, books,
booksInd, bs, bsBook…`). Most recent fixture-day carrying both instruments = **2026-07-26**.
Row-level join, key = `pnorm(player)|market|line`:

| market | board rows | joined | production cz-present | archive cz-present |
|---|---|---|---|---|
| hits | 50 | 36 | **24** | **0** |
| K's | 35 | 27 | **20** | **0** |

**"Only the archive is blind" HOLDS, measured on the same fixture-day and the same rows.**
The server path is confirmed by trace, not just the comment: `/api/generate` →
`eng.collectSlate()` (route L245) evaluates the extracted engine (`src/engine/index.ts` L11
→ `legacy-src.gen.ts`), which carries `SH_PROP_ALT` and the L1366 fetch — the deployed
server generation requests the alternates; the 07-26 board above IS that path's output.

**Population naming (owner's ask)**: +1.01 / +1.60 / +1.58 and the per-market
decomposition were ALL computed from the **archive sweep** (`data/props/2026-07-27.json`,
pooled snapshots) — none from the production log. The pre-committed "recompute from the
production log" branch cannot execute: the production record retains **no MGM per-row
price** (measured above), so no instrument currently on disk can price the true playable
population — the archive post-M13-fix is the only one that will. Until then the canonical-
key stamp is the population statement. Unlock-citation sweep: the retracted claim is cited
nowhere outside §2b (retracted in place) and the M13 entries that cite it AS retracted —
nothing load-bearing depends on it.

**THE CROSS-INSTRUMENT JOIN — RUN, per the owner's "there is a visible join" item
(2026-07-28, latest)**: production has CZ where the archive doesn't (hits/K's); the
archive has MGM where production doesn't. The join ran on 07-26 (the only board day),
key = `pnorm(player)|market|line`:

| market | board rows | matched | line-mismatch | player-absent | archive keys | archive-side unmatched |
|---|---|---|---|---|---|---|
| hits | 50 | 36 | 5 | 9 | 251 | 215 (board = top-50 by rank) |
| K's | 35 | 27 | 7 | 1 | 31 | 4 |

**Both-priced joined rows: ZERO. The failing field, named: `fp`** — per-book prices were
added to the sweep's `compact()` on 2026-07-26 but first appear in DATA on 07-27; the
07-26 archive carries `fp` on **0 of 1,229 rows** (0/1,111 morning + 0/118 evening,
printed from the archive itself). Boards exist for {07-26 only}; `fp` exists for
{07-27, 07-28}; **the intersection is empty — zero fixture-days carry both instruments.**
So "unrecoverable" is restated here ONLY with the failed join beside it, per the owner's
rule — and it is a *today* statement, not a forever one: **the join becomes feasible on
the first fixture-day with BOTH a server board and `fp`**, which is the day the header
fix lands. On that day this exact query prices the retracted unlock's residual.

**The residual, stated plainly (owner's item 4)**: production prices CZ on **24/36
matched hits rows and 20/27 matched K's rows** (35/50 and 25/35 of all board rows) —
CZ coverage on these markets is ~67–74%, not 100% and not 0%. **MGM's coverage argument
on hits/K's is therefore reduced, not nil** — its magnitude is the joined two-book gain
on the ~10–12 CZ-null matched rows plus the price increment on the CZ-priced ones, and
it is **not measurable until the join day above**. The memo does not imply the residual
is nil because the 100% was wrong.

## 3-CIRCA. ONE PASTE DAY TO MEASURE, THEN DECIDE — spec only, nothing built (2026-07-28)

- **What to paste**: the Circa app's MLB player-props listings per game (hits / TB / HRR /
  K's / outs), both sides of every line, plain text — one paste per game or one bulk paste;
  do it within ~15 minutes of a props snapshot hour so CZ/MGM comparisons are
  contemporaneous.
- **Storage**: `data/circa/<date>.txt` raw + a parsed JSON keyed exactly as the props
  archive keys rows (`pnorm(player)|market|line` with over/under american prices) — a
  lenient one-off parser (`tools/circa_sample.py`, ~an hour), NOT the app paste flow.
- **The analysis reports** (the scripts already exist in this memo's lineage):
  1. Circa's two-way hold per market vs Caesars' (per-line `iO + iU − 1`, median per
     market; CZ's measured baseline is the 1.071 overround);
  2. best-of-{CZ,MGM,Circa} vs best-of-{CZ,MGM} — Circa's marginal increment per leg and
     per bootstrap slip;
  3. Circa's coverage (which of the board's lines it posts at all).
- **Pre-committed decision rule**: hold ≤ ~half of Caesars' OR marginal increment ≥
  +0.5 pp/leg → the paste path earns its build. A wash → the memo simplifies to a
  two-book design and Circa drops out.
- ⚠️ **The CLV cost, flagged now and quantified by the same sample** (owner's addition): a
  Circa-settled ticket gets NO automated close — a real cost against Exit 2's only
  instrument. The sample day measures the share of slips where Circa is the argmax book;
  that share of the ledger loses its close. If the half-hold claim is true, that share is
  plausibly LARGE (a materially lower hold wins most argmaxes) — meaning the better the
  Circa result, the bigger the instrument cost. **The build decision must price both sides
  of the same measurement.**

## 2-ORIGINAL (superseded for the decision, kept for the record). THE PRIZE — measured, and the shape is OPTION VALUE, not a better book

**Head-to-head MGM vs CZ is a wash**: on 511 rows of 2026-07-27's props archive carrying
both prices, per-leg EV(MGM) − EV(CZ) at the row's fair: **median +0.00 pp, mean +0.08**,
IQR ±1.6. MGM better on 223, CZ on 245. The Circa "half the hold" claim is **unmeasurable
from the feed** (absent) — verifiable only by paste-sampling its board (one sample day
would answer it with the same script).

The real prize is best-of-N:

| measurement | n | per leg | per 3-leg ticket |
|---|---|---|---|
| best-of{DK,FD,MGM,CZ} vs settling blind at CZ | 511 | **+1.70 pp mean / +1.30 median**, 371 legs improved | ≈ **+5.1 pp** |
| **MGM's marginal increment over the current {DK,FD,CZ} basis** | 511 | **+0.75 pp mean** (median 0 — tail value), 170 legs improved | ≈ **+2.2 pp** |

**On the archived 07-26 board's built tickets (n=61 with both prices)**: ticket EV at the
DK/FD basis vs CZ: **median +3.20 pp, mean +7.13**. 17 tickets cleared +2% at CZ (they died
at consensus, not EV — so "would they clear at a better book" is a fortiori yes, 15/17 also
≥+2% at basis); **10 additional tickets clear +2% ONLY at the basis** — shopping grows the
playable card, not just its EV.

**Verdict on the owner's read: CONFIRMED.** +0.75–1.7 pp/leg is deterministic price
improvement with zero model risk; every model amendment's per-row effect is
uncertain-signed. The execution-side gain rivals or exceeds any single amendment. One
structural honesty note: **a parlay settles at ONE book**, so ticket-level gain is
best-single-book-per-ticket (the +3.20 median above respects that), not per-leg best (the
+1.70 is the singles bound).

## 3. THE SCHEMA — what assumes one book today, and the minimal addition

| module | one-book assumption (cited) |
|---|---|
| `shTicketSnap` (L3365) | writes `czOdds/czDec` "straight" plus `bs*` — settlement implicitly Caesars; **no settlement-book field exists** |
| grader | pays P/L from the ticket's cz price (NV-confirm overlays cz) |
| `clv-core` (L215–239) | the settlement close is hardwired `CAESARS_KEY`; `bsAm/bsBk` ride along informationally |
| `ledger-segments` (L70–74, 208, 241) | `nvTax` ≡ "what settling at Caesars cost vs the basis" — meaningless when settlement ≠ CZ |
| settlement-audit | outcome-grading is book-agnostic (statsapi); P/L reconstruction assumes cz |

**Minimal addition, versioned read, never rewrite (the lid-migration rule):** per-ticket
`sb` (settlement book key) + `sbOdds`/`sbDec` (the locked settlement price), read everywhere
as `sb ?? "cz"` — every historical entry stays valid on first write and forever. Downstream:
grader pays at `sbDec ?? czDec`; CLV sights the `sb` book's close (a Circa-settled ticket
gets NO automated close — sight is null WITH a reason, paste could supply manual closes);
`nvTax` generalizes to settlement-tax-by-book or retires under best-book settlement; the
at-lock confirm becomes per-book.

## 4. THE GATE'S SHAPE

- `coreCzEvMin` (the settlement floor) must apply **at the ticket's actual settlement
  book**: evaluated at `sbDec`, where `sb` = argmax over playable books of the ticket's
  whole-slip price (one book per parlay). CZ stops being special; it becomes one candidate.
- `consMinEv`'s consensus **excludes the settlement book per the booksInd rule** — and with
  two-plus settlement books the exclusion is **per-ticket**: same computation, different
  exclusion set for each candidate book. Circa (absent from the feed) is trivially
  settlement-independent — its rows' consensus is automatically clean.

## 5. FREEZE POSTURE — execution change, CONFIRMED, with two named conditions

The model prices identically: `pModel`/`fO` untouched, Phase 2 (the only live evidence
channel, board-wide model-vs-close) completely unaffected. **No frozen model parameter
moves.** Two frozen-adjacent touches, named rather than waved off: (i) the +2% gate's
**price basis** changes meaning (the value stays; the same class as dk_fd's sanctioned
deviations); (ii) the **ledger channel's vintage splits** — different prices build
different tickets, which is Exit 2's record. Conditions for parallel-with-the-bundle:
every locked ticket stamps its `sb` (the selMode-stamp precedent) so the ledger vintages
never pool, and the change ships under its own sign-off as a sanctioned execution
amendment. Under those two conditions this does **not** wait for exit.
