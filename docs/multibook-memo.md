# Multi-book execution — SCOPING MEMO (2026-07-28, measured; nothing built)

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
number**; it is a small-sample point estimate. TB−HRR = +0.28 with SE ≈ 0.15 (z ≈ 1.9) —
suggestive, not conclusive at 95%.

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
empirical-dispersion variants agree. Full four-row evaluation table and both corrections in
`docs/singles-vs-parlays.md`.

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

**The HR/TB partials have a different, benign shape — the separator is the LINE LADDER**
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
