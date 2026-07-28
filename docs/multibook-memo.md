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

| market | n | mean | improved |
|---|---|---|---|
| H+R+RBI | 257 | +0.87 | 107/257 |
| total bases | 236 | **+1.15** | 106/236 |
| outs | 18 | +1.14 | 10/18 |

The mix-weighted slip bootstrap (the built card's 5 HRR : 6 TB mix) lands **+1.58 pp at
k=3** — within noise of the uniform +1.60, because the both-priced population already WAS
the ticket mix. The realizable slip gain on real tickets stands.

**THE UNLOCK — a finding bigger than the price improvement**: the feed's Caesars
(`williamhill_us`) is missing from **100% of hits rows (369/369) and 100% of K's rows
(37/37)** in the archive (HR 42%, TB 44% partial). Whole markets cannot settle at CZ from
the feed today — which is why hits legs never reach the pool. **Multi-book does not just
improve prices; MGM settlement UNLOCKS hits and K's as ticketable markets.** (Feed subset ≠
the physical book, per the ASG correction — but the pipeline can only settle what the feed
quotes.)

**THE CROSSOVER AT TWO BOOKS — the per-dollar arithmetic runs OPPOSITE the forfeit
intuition (owner's item, answered with a sign flip):** the per-LEG forfeit is real and
grows with leg count (per-leg-equivalent capture +0.71/+0.53/+0.44 at k=2/3/4 → forfeit
+0.30/+0.48/+0.57 vs the singles' +1.01). **But the staking unit is the dollar, not the
leg**: a slip captures the max over its whole stake — +1.42/+1.58/+1.74 pp per dollar at
k=2/3/4 — MORE than a single's +1.01, and growing with k. First-order on the doctrine's own
table ($250/$2,500 → 1 pp ticket EV ≈ 10 bp): singles +10.1 bp, 3-leg parlays +15.8 bp →
the −3 pp crossover moves to **≈ −3.2/−3.3 pp — DEEPER, in the parlays' favor** (k=2 ≈
−3.2, k=4 ≈ −3.3). Dated addendum in `docs/singles-vs-parlays.md`; the doctrine's ~3 pp
statement stands with the annotation. Caveats: first-order bp shift (no Kelly restake),
mean-shift not full dispersion.

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
otherwise lose CLV) and it also covers Caesars quotes the feed happens to miss — which the
unlock finding shows is whole markets, not edge cases.

**⚠️ THE TICKET-LEVEL FOLLOW-UP IS BLOCKED, NOT SCHEDULED**: "the first day carrying both a
board and `fp`" requires a board, and none exists until the cron header is fixed and the
manual curl runs (CLAUDE.md's outage chain). Recorded as blocked-on-the-pipeline.

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
