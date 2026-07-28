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

## 2. THE PRIZE — measured, and the shape is OPTION VALUE, not a better book

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
