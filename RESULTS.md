# RESULTS.md — before and after

Parlay Lab, branch `az-two-book-anytime`, written 2026-11-12. Paper trading only. Informational, not betting advice.

**Read this first.** The branch is built and tested but it has not been pushed, so it has never run against
live odds. Every "after" figure below is therefore one of three things, and each row says which:

- **measured** — a number a script or a test produced on this machine;
- **by arithmetic** — follows from the provider's published pricing or from the code, not yet observed live;
- **not available** — cannot be known until the branch is live, or until the stored record is exported.

Nothing here is tuned to look good. Where the evidence says there is no edge, it says so.

## 1. The one-paragraph answer

The system is now built to do what was asked: DraftKings and FanDuel only, a pick at any moment on any open
game it can price, an append-only record, automatic grading and closing-line tracking. What it cannot yet show
is that it wins. The stored history says the old model's claimed edge was not real at these two books (section
3), and the new engine has no live record. The honest position is: the plumbing is better and provable; the
edge is unproven and, on the evidence so far, comes from price shopping between the two books and not from the
model.

## 2. Pick volume

| | Before (base `8ab9e46`) | After (this branch) | Kind |
|---|---|---|---|
| When a pick can be made | Only inside scheduled passes: MLB hourly 08:00 to 18:00 PT, football every 15 minutes 08:00 to 18:45 PT, one pass per named slot per day | Any moment: the app button, the command line, or the scheduler, all calling one run | measured (tests) |
| Daily ceiling | $2,500 per sport per day plus that day's winnings | None. Stakes are per pick: flat 1 unit and fractional Kelly side by side | measured (tests) |
| Sports the new engine prices | n/a | NFL, college football, college basketball (game lines). MLB has no adapter in the new engine and is out of season | measured |
| Picks recorded by the new engine | n/a | 0 — it has not run live | not available |
| Replay of stored odds through the new engine | n/a | **Not done.** The only stored odds history is MLB (71 board days), and the new engine has no MLB adapter; there is no stored football or basketball odds history at all | not available |

What a replay would need: an MLB adapter that reads archived board rows as candidates. That is a next step,
and it would still be engine output replayed, not real locks.

## 3. ROI, win rate and units — by book

**Recorded history (Baseline 1).** The only money result on disk:

| Window | Tickets | Record | Staked | Profit | ROI |
|---|---|---|---|---|---|
| MLB 2026-07-17 to 07-22 | 38 | 6-32 | $850.00 | -$376.91 | -44.3% |

**The same legs at the two books (Baseline 2).** 14 priceable legs, flat 1 unit, near-close prices:

| Book | Legs | W-L | Units | ROI |
|---|---|---|---|---|
| DraftKings | 14 | 5-9 | -5.692 | -40.7% |
| FanDuel | 14 | 5-9 | -5.582 | -39.9% |
| Better of the two | 14 | 5-9 | -5.563 | -39.7% |

Fourteen legs is not a sample. The book makes about one point of difference; the record is the same.

**After.** Not available: no live picks. The report that will fill this table exists and is tested
(`GET /api/anytime`, or `node tools/run-picks.mjs --report`): DraftKings, FanDuel and combined, with profit and
ROI side by side, sample size and a confidence interval, split by sport, market, trigger and model version.

**Everything after 2026-07-22 is missing** from both baselines because the live ledger is in the store and no
export is on disk. `AUDIT.md` section 1.6 lists the five read-only exports that would complete them.

## 4. Closing line value — the main evidence of edge

No CLV was ever recorded on disk. Substitutes from the archived boards (MLB props, date-clustered bootstrap):

| Rows | n | CLV vs closing no-vig fair | Same-book price CLV | Engine's claimed EV |
|---|---|---|---|---|
| All board rows | 5,525 | -5.84% | +0.09% | -1.45% |
| EV-positive rows | 1,713 | -5.00% | +0.21% | +5.11% |

Read with care: a price that never moves scores about minus the vig against a no-vig fair, so -5.00% is
essentially the vig. The plain statement is that **the engine claimed +5.11% and the closing market ratified
about +0.2% of it.**

On the 61 bets found mode would actually have taken (from 2026-09-17, DraftKings price):

| Kind of bet | n | Mean CLV |
|---|---|---|
| All | 61 | -2.29% (95% CI -3.09 to -1.49) |
| Model-driven (the model disagreed with the market) | 50 | -2.89% |
| Price-driven (positive EV on the two books' own fair number) | 11 | +0.45% |

That is the reason the new engine records the *basis* of every pick (model or price) and reports them apart,
and the reason the College Basketball desk was built market-only. Eleven bets is still far too few to call
+0.45% an edge.

**After.** Not available. Every new pick stores the close at both books and computes CLV at its own book
automatically; the first live week is the first real CLV this system will ever have.

## 5. Calibration

| Measure | Before | After |
|---|---|---|
| Brier, 70 graded rows in a doc: model / consensus | 0.2127 / 0.2085 (the market's number was better) | not available |
| Markets where the model beat consensus on Brier (16,322 graded rows, quoted in a doc) | 3 of 8 | not available |
| How well each number predicts the close (14,343 rows): two-book fair / blended model / raw model, RMSE in points | 0.72 / 3.05 / 13.17 | unchanged — the model was not retuned |
| How far the close moves toward the model when they disagree | 2.3% of the way | unchanged |

**Said plainly, as the brief requires: on the stored evidence the MLB model does not beat the no-vig price of
these two books.** It was not tuned until it looked better. The football model's only independent input (ESPN
FPI) has never been back-tested (finding B2-1). Both are reported, not fixed.

## 6. Odds API credits

| Call | Before | After | Kind |
|---|---|---|---|
| Game-lines slate, 3 markets | 6 credits (two regions, about 40 books returned) | 3 credits (the two books count as one region) | by arithmetic |
| One event's player props | about 31 credits, measured 2026-09-05 | unchanged: it was already one region; fewer books come back, the price is the same | by arithmetic |
| College Basketball slate | n/a | 3 credits a call; the page makes at most one call per 240 seconds for all visitors, and none when nothing is left to tip | measured (tests) |
| Any-time run | n/a | one slate call per sport per priced run; never the same market twice in a run | measured (tests) |
| Anonymous cold request to the football props routes | up to 1,860 credits (CFB) or 496 (NFL), no daily ceiling, for anyone | 0 once the sync phrase is set on the server | measured (tests) |
| Anonymous request to `/api/odds` | any sport, any endpoint, including the 10x historical one | allow-listed paths only; a fresh pull needs a credential | measured (tests) |

**Credits per day, before and after: not available.** It needs the provider's `x-requests-used` header read on
live calls, which this work was not allowed to make. The any-time run records that header on every call it
makes and reports credits per run, so the first live day produces the number.

One fact to weigh: the football props daily cap was set to unlimited in an earlier commit (`dfcb1fb`), so the
"2,500 a day" described in older notes is not in force. The spend gate above is now the only bound besides the
per-game re-price window.

## 7. Run time

Not available for a live run. The run is bounded by one slate call per sport plus ESPN schedule reads, with a
lock so two triggers at once cannot double-record. The full test suite, 5,083 tests, runs in a few minutes on
this machine.

## 8. Tests

| | Base `8ab9e46` | This branch |
|---|---|---|
| Tests | 4,089 | 5,083 |
| Passing | 3,961 | 4,944 |
| Failing | 128 | 139 |

The 139 are the same 128 by name, plus 11 that pin `regions=us` in a request and went red when every request
began naming the two books. No pre-existing test was edited. Changing those 11 is Josh's decision.

**New tests: 994, in 30 new test files.** Every guard they claim was broken on purpose to check a test notices:
909 deliberate breaks, 909 caught.

| Area | New tests | Deliberate breaks caught |
|---|---|---|
| Two-book layer and the one Odds client | 30 | — |
| Decision rules and the append-only ledger (start-time guard, freshness guard, duplicates, re-entry) | 57 | — |
| Grading by the pick's own book; one-book parlays | 19 | — |
| The run, concurrent triggers, the report | 48 | — |
| Football game lines from the two books | 24 | — |
| Store, live feeds, scores | 31 | — |
| The three routes | 29 | 18 of 18 |
| Scheduler as a caller | 12 | 13 of 13 |
| Command line | 25 | 16 of 16 |
| The `/anytime` page and "Run picks now" | 28 | 37 of 37 |
| Two-book fetch on every request; the other-book guard | 12 | 26 of 26 |
| History tagged by book, legacy not counted | 30 | 28 of 28 |
| Cutover | 11 | 17 of 17 |
| Push alert on new picks | 15 | 21 of 21 |
| Audit fixes D-1, E1-1, E3-1, G1-5, G2-1, E2-2, G1-7, G1-6, G1-2 | 451 | 503 of 503 |
| MLB archive and the College Basketball desk | 172 | 198 of 198 |

(The first six rows' guards were broken on purpose when those commits were made: 32 breaks, all caught. They complete the 909.)

The brief's named tests, and where they are: start-time guard, freshness guard, duplicate and re-entry rules —
`tests/anytime-engine.test.ts`; concurrent triggers — `tests/anytime-run.test.ts`; grading edge cases and
same-book parlays — `tests/anytime-grade-parlay.test.ts`; ledger immutability — `tests/anytime-ledger.test.ts`
and `tests/anytime-server.test.ts`; no other book in a fetch, a calculation or a stored pick —
`tests/az-two-book-guard.test.ts`.

## 9. Not done, and why

| Item from the brief | State | Why |
|---|---|---|
| Trigger the engine several times against live data | Not done | It spends credits on a deployment that does not exist yet. Needs the push, then Josh's sync phrase. |
| Recompute profit from the raw ledger against every number the UI shows | Done for the new ledger in tests; not done for the old ledgers | The old ledgers are in the store and were not exported. |
| Replay stored odds through the new engine | Not done | Section 2. |
| Re-tune thresholds on two-book prices | Not done on purpose | There is no outcome data at these two books to tune on; tuning on the substitutes would be fitting to noise. |
| Footer "build N" tag | Not applicable | The Next app has no such tag; its version is the commit id at `/api/version`. |
| Remove every other book from the code | Partly | Requests, the new engine and the report are two-book. 403 lines in 93 older files still name another book (mostly the parity-locked MLB engine and stored field names); a ratchet test stops that number rising. |
