<!-- Part of AUDIT.md (repo root). Split out for size; content unchanged. -->

# Appendix B. Baseline working paper, complete

The full text of `/private/tmp/claude-501/audit-out/baseline.md`. Section numbers inside this appendix are the working paper's own.

**Performance baselines from on-disk history**

Written 2026-11-11. Read-only phase. Every number below was produced by a script under
`/private/tmp/claude-501/audit-out/baseline/` that was actually run; the script and its output file are
named beside each table. Paths are relative to `/private/tmp/claude-501/pl-audit` (code) or written as
`HIST/...` for `/private/tmp/claude-501/pl-history/...`.

Paper trading only. Informational, not betting advice.

---

### 0. Bottom line

**Neither baseline can be completed from disk.** The live ledger, the graded prediction store and the
stored closing-line records live in Upstash and no export of any of them is on disk. What is on disk is:

| Needed for a baseline | On disk? |
|---|---|
| Pick-level rows that were actually locked (tickets, legs, stakes) | **No.** Only doc aggregates and 15 hand-audited legs. |
| Per-pick outcomes (won / lost) | **No**, apart from those 15 legs and a 21-row fixture micro-sample. |
| DraftKings and FanDuel prices at the time a pick was made | **Partial, MLB only**: the engine's daily board archives carry a DK/FD basis price per row (2026-07-26, 2026-08-06..10-17) and both books' own quotes from 2026-09-14. |
| Closing prices | **Partial, MLB only**: game lines 2026-07-12..07-30; props 2026-07-12..10-28 (two-sided markets only; home runs have no usable close). |
| Recorded closing line value | **No.** No CLV number is recorded anywhere on disk. |
| Calibration against outcomes | **No**, apart from one 70-row table quoted in a doc. |
| Football (CFB, NFL) prices, closes, graded picks | **Nothing.** One ungraded, synthetic NFL Week 1 replay only. |

Headline numbers that do exist:

1. **As recorded (doc aggregates, MLB, 2026-07-17..07-22):** 38 tickets, 6-32 (15.8% win rate), $850.00
   staked, $473.09 returned, **-$376.91, ROI -44.3%** (-16.85 units at 1 unit = the $22.37 mean stake).
   Source: `docs/settlement-audit.md:66-71`. This is six days and is the only recorded money result on disk.
2. **DK/FD repricing of the only pick-level legs on disk** (15 audited ML/RL legs, 14 priceable, as flat
   1-unit singles at the last archived pre-start price): DraftKings 5-9, -5.69u (-40.7%); FanDuel 5-9, -5.58u
   (-39.9%); best of the two 5-9, -5.56u (-39.7%); Caesars 5-9, -5.71u (-40.8%). The book makes ~1 point of
   difference; the record is the same. Fourteen legs is not a sample.
3. **Closing-line substitute (engine board rows, not locks):** on 1,713 pre-game prop rows where the engine
   claimed positive EV at the DK/FD price (mean claimed edge +5.11%), the entry price valued at the archived
   closing no-vig fair was **-5.00%** (95% CI -5.16 to -4.82; 3.4% of rows beat the closing fair). Against the
   same book's own closing price the entry price was **+0.21%** better (CI +0.09 to +0.35): 18.0% better,
   69.0% identical, 13.0% worse. The closing market does not confirm the claimed edge.
4. **Calibration substitute (model vs closing fair, 14,343 rows):** the board's own consensus fair predicts
   the close with RMSE 0.72 points; the engine's blended model probability with RMSE 3.05; the raw model
   probability (category rows) with RMSE 13.17. When the model disagrees with the market, the close moves
   only **2.3%** of the way toward the model (slope +0.023, se 0.002).
5. **DraftKings vs FanDuel on the same line:** on game lines (July archive, 1,256 sides) FanDuel was better
   on 49.8%, DraftKings on 40.4%, tie 9.9%; on moneylines FanDuel was better 62.4% to 29.0%. On props stored
   by both books on the engine's boards (2,006 rows from 2026-09-14) DraftKings was better on 56.2%, FanDuel
   40.1%. Taking the better of the two instead of DraftKings alone is worth about +0.9% (game lines) to
   +1.2% (props) in price; instead of FanDuel alone +0.6% to +2.5%.

---

### 1. Data used

| # | Dataset | Path | Dates | What it holds | What it lacks |
|---|---|---|---|---|---|
| R1 | Settlement audit | `docs/settlement-audit.md:34-48, 66-72` | 2026-07-17..07-22 | Daily staked/returned/P&L; 15 audited ML/RL legs with results | Tickets, stakes per leg, prices, props legs |
| R2 | Calibration table | `docs/pitcher-outs-audit.md:212-219` | not dated in the table | 8 markets, n=70, predicted, actual, model Brier, consensus Brier (quoted from the public `/api/calibration`) | Rows, log loss, buckets |
| R3 | Narrative aggregates | `ENGINE2.md:488-520`, `docs/session-handoff.md:1957-1960`, `docs/progress.md:429` | July-Sept | "2-leg -0.7% on $464; 3+ legs 1-25; fun 0-13, -$220"; "619 graded ... outs unders 20-28"; "16,322 graded board rows" | The rows behind them |
| A | MLB game lines | `HIST/data/2026-07-12.json` .. `2026-07-30.json` | 19 days, 77 snapshots, 227 events with a pre-start snapshot | Per-book moneyline, run line, total (DraftKings, FanDuel, Caesars `williamhill_us`, Pinnacle, others) | Outcomes; nothing after 07-30 |
| B | MLB props | `HIST/data/props/*.json` | 2026-07-12..10-28, 941 events with a pre-start snapshot | Per player/line: consensus fair, book list, per-book over/under where both sides are posted | Outcomes; alternate lines; any per-book price for home runs |
| C | MLB engine boards | `HIST/data/boards/<date>.{latest,best}.json.gz` | 71 dates: 2026-07-26, 2026-08-06..10-17 | Every row the engine ranked: blended prob, raw model prob, market implied, DK/FD basis price `bs`/`bsBook`, settlement-book price `cz`, engine build, selection mode; from 2026-09-14 each book's own quote (`bookQuotes`) | Which rows were locked; outcomes; lock-time prices |
| D | HR aggregate | `HIST/data/hr_overround.json` | 87 days | One stored aggregate of implied vs realised home-run hitters | Rows |
| E | Fixtures | `tests/fixtures/**` | scattered | 4 player game logs (40 game rows), a few box scores, scoreboards | Almost everything; see section 6.3 and 7 |
| F | NFL replay | `src/lib/nfl/week1-replay.json` | 2026-09-13 | 10 forced $35 singles (6 spread, 4 ML), `grading: null` | Results; real prices (see section 7) |

`docs/rebaseline-2026-07-25.md` and `docs/singles-vs-parlays.md` were read and contain no graded results
(the first is an engine-digest rebaseline after a time-zone bug; the second is an EV-harness design doc).
`docs/clv.md` defines how CLV is stored but records no CLV figure. No file named like a ledger export exists
in either checkout. No `.env*` file was opened.

Row datasets built for the substitutes (`baseline/b_build_rows.py`):
`baseline/rows.jsonl` (16,006 unique engine rows; 11,526 generated before first pitch) and
`baseline/pb_rows.jsonl` (28,071 pre-game prop-board rows carrying a model probability). "Close" for a row
means the last props-archive snapshot before first pitch that is later than the board's own timestamp and
carries the same player and line.

---

### 2. Baseline 1 - full history as recorded

#### 2.1 What exists (script `baseline/a_recorded.py`, output `baseline/a_recorded.out.md`)

Daily P&L as recorded (`docs/settlement-audit.md:66-71`):

| day | staked | returned | P/L | ROI |
|---|---|---|---|---|
| 2026-07-17 | 300.00 | 198.33 | -101.67 | -33.9% |
| 2026-07-18 | 300.00 | 244.87 | -55.13 | -18.4% |
| 2026-07-19 | 125.00 | 0.00 | -125.00 | -100.0% |
| 2026-07-20 | 43.00 | 0.00 | -43.00 | -100.0% |
| 2026-07-21 | 42.00 | 29.89 | -12.11 | -28.8% |
| 2026-07-22 | 40.00 | 0.00 | -40.00 | -100.0% |
| **total** | **850.00** | **473.09** | **-376.91** | **-44.3%** |

| metric | value | status |
|---|---|---|
| Pick count | 38 tickets (6 won, 32 lost) | recorded, `docs/settlement-audit.md:3-4` |
| Win rate | 15.8% of tickets | computed from the above |
| Units won | -16.85u at 1u = $22.37 mean stake | computed; the bankroll at the time is not on disk |
| ROI | -44.34% on $850 | computed from the recorded totals |
| Closing line value | **not recorded anywhere on disk** | missing |
| Calibration | one 70-row table (below); no log loss, no buckets | partial |
| Split by sport | MLB only (football did not exist yet) | - |
| Split by market | ML legs 4-3 (57.1%), RL legs 1-7 (12.5%) among the 15 audited legs; prop legs not itemised | partial |
| Split by book | none recorded (Caesars was the settlement book then) | missing |
| Split by model version | none recorded | missing |

The 15 audited legs are parlay legs, so "4-3 / 1-7" is a leg record, not a ticket record, and the legs'
stakes are not on disk.

Calibration as recorded (`docs/pitcher-outs-audit.md:212-219`, "graded: 70"). This is the prediction
store (every board row the engine stated), a different population from the ledger legs above:

| market | n | predicted | actual | model Brier | consensus Brier |
|---|---|---|---|---|---|
| pitcher_outs | 5 | 0.532 | 0.000 | 0.285 | 0.215 |
| pitcher_strikeouts | 5 | 0.547 | 0.400 | 0.230 | 0.218 |
| batter_total_bases | 9 | 0.660 | 0.444 | 0.293 | 0.284 |
| ml | 15 | 0.550 | 0.600 | 0.234 | 0.235 |
| rl | 15 | 0.615 | 0.533 | 0.246 | 0.246 |
| batter_hits | 7 | 0.686 | 1.000 | 0.099 | 0.109 |
| batter_hits_runs_rbis | 7 | 0.639 | 0.714 | 0.206 | 0.218 |
| batter_home_runs | 7 | 0.220 | 0.000 | 0.049 | 0.053 |
| ALL (n-weighted, computed here) | 70 | 0.566 | 0.500 | 0.2127 | 0.2085 |

Read: predicted 56.6% against 50.0% realised, and the model's Brier is slightly worse than the consensus
market's (0.2127 vs 0.2085). On 70 rows this is direction only.

Other recorded aggregates (quoted, not recomputable): `docs/session-handoff.md:1957-1960` reports 619
graded picks over three served days with pitcher-outs unders 20-28 (41.7% against 49.6% modelled);
`docs/progress.md:429` reports 16,322 graded board rows in the live store as of 2026-09-12 and "five of
eight market-level model Brier point estimates are worse than consensus". The rows are not on disk.

#### 2.2 What cannot be computed for Baseline 1

Everything after 2026-07-22: the whole MLB ledger from 07-23 through October (including the shaped
$150/$350 cards, found mode from 2026-10-03, straight-bets-only from 2026-10-06), every CFB and NFL card,
all placed/not-placed answers, all stored CLV sightings, and any split by book or model version.

---

### 3. Baseline 2 - DraftKings / FanDuel only

#### 3.1 Repricing the only pick-level legs on disk (`baseline/a_recorded.out.md`, section A2b)

Each of the 15 audited legs priced as a flat 1-unit single at the last archived pre-start snapshot
(`HIST/data/2026-07-1x.json`). These are near-close prices, not the prices at lock, and the legs were really
parlay legs, so this is a like-for-like book comparison and nothing more.

| book | legs priced | W-L | units won (flat 1u) | ROI |
|---|---|---|---|---|
| DraftKings | 14 | 5-9 | -5.692 | -40.7% |
| FanDuel | 14 | 5-9 | -5.582 | -39.9% |
| best of DK/FD | 14 | 5-9 | -5.563 | -39.7% |
| Caesars | 14 | 5-9 | -5.705 | -40.8% |
| Pinnacle | 13 | 5-8 | -4.509 | -34.7% |

DraftKings had the better price on 6 legs, FanDuel on 8, no ties. One leg (CLE run line vs PIT,
2026-07-18) could not be priced: it was a doubleheader with three archive candidates and the +1.5 side
exists on only one of them (see open questions).

#### 3.2 What the engine put on the board at DK/FD prices (substitute: board rows, not locks)

Script `baseline/c_inventory.py`, output `baseline/c_inventory.out.md`. Unit = one unique
(date, game, line, side) row generated before first pitch. "EVPOS" = rows where the engine's own claimed EV
at the DK/FD basis price is above zero; that is the closest on-disk proxy for "what a DK/FD-only book would
have been offered". It is the engine's forecast, not a result.

Counts: 11,526 pre-game rows on 68 of 71 board dates; 9,136 carry a DK/FD basis price (2,390 do not);
2,683 are EVPOS.

EVPOS rows by market:

| market | n | DK basis | FD basis | mean blended prob % | mean raw model % | mean market implied % | mean claimed EV % | mean dec price |
|---|---|---|---|---|---|---|---|---|
| ml | 39 | 48.7% | 51.3% | 55.7 | 65.6 | 53.9 | 1.15 | 1.834 |
| rl | 27 | 51.9% | 48.1% | 57.7 | 71.8 | 55.2 | 1.36 | 1.770 |
| batter_hits | 473 | 66.8% | 33.2% | 62.8 | 69.6 | 59.1 | 2.52 | 1.688 |
| batter_total_bases | 173 | 100.0% | 0.0% | 61.3 | 70.3 | 56.8 | 2.37 | 1.694 |
| batter_hits_runs_rbis | 548 | 100.0% | 0.0% | 60.8 | 73.3 | 55.5 | 3.56 | 1.715 |
| batter_home_runs | 487 | 53.2% | 46.8% | 17.7 | 20.6 | 16.8 | 7.25 | 6.701 |
| pitcher_strikeouts | 442 | 49.8% | 50.2% | 53.4 | 64.3 | 49.1 | 5.01 | 1.996 |
| pitcher_outs | 494 | 63.4% | 36.6% | 55.7 | 74.1 | 48.6 | 8.72 | 1.974 |
| ALL | 2,683 | 69.4% | 30.6% | 51.1 | 61.4 | 46.8 | 5.10 | 2.710 |

EVPOS rows by book and by engine build / selection mode:

| group | n | mean claimed EV % | mean dec price |
|---|---|---|---|
| DraftKings basis | 1,862 | 4.89 | 2.438 |
| FanDuel basis | 821 | 5.58 | 3.326 |
| 39fc8681 / ev_gated (08-06..08-16) | 601 | 5.18 | 3.157 |
| cb2cdebc / ev_gated | 271 | 6.31 | 2.892 |
| cb2cdebc / dk_fd | 380 | 5.91 | 2.531 |
| bb6be52d / dk_fd (08-28..09-17) | 768 | 4.87 | 2.340 |
| 52510d67 / dk_fd (09-18..10-17) | 559 | 3.73 | 2.786 |
| pre-echo board 07-26 | 104 | 7.63 | 2.632 |

The raw model sits 10 to 25 points above the market on every prop market (for example pitcher outs 74.1%
raw against 48.6% implied), and the blend pulls it most of the way back. Whether any of the claimed 5.10%
is real is exactly what the missing outcomes would decide; sections 4 and 5 are the only evidence on disk.

#### 3.3 Coverage: how much of the board DK and FD actually price

Boards that store both books' quotes (2026-09-14..10-17, 29 board dates, 4,215 pre-game rows;
`c_inventory.out.md` C7a):

| market | rows | DK quote | FD quote | both | neither |
|---|---|---|---|---|---|
| ml | 129 | 100.0% | 100.0% | 100.0% | 0.0% |
| rl | 131 | 96.9% | 97.7% | 96.2% | 1.5% |
| batter_hits | 841 | 96.0% | 67.4% | 66.7% | 3.3% |
| batter_total_bases | 868 | 25.5% | 0.0% | 0.0% | 74.5% |
| batter_hits_runs_rbis | 813 | 84.3% | 0.0% | 0.0% | 15.7% |
| batter_home_runs | 820 | 99.0% | 99.6% | 98.8% | 0.1% |
| pitcher_strikeouts | 265 | 93.2% | 91.7% | 89.1% | 4.2% |
| pitcher_outs | 348 | 61.5% | 45.7% | 41.4% | 34.2% |
| ALL | 4,215 | 76.9% | 48.5% | 47.6% | 22.2% |

Raw props archive at the last pre-start snapshot (941 events, 101,846 player/line rows;
`baseline/f_bookcompare.py`, output `f_bookcompare.out.md` F2a). "Two-sided" means the archive stored both
an over and an under for that book:

| market | rows | DK two-sided | FD two-sided | both two-sided |
|---|---|---|---|---|
| batter_hits | 17,969 | 73.8% | 0.0% | 0.0% |
| batter_hits_runs_rbis | 17,339 | 74.5% | 0.0% | 0.0% |
| batter_total_bases | 23,313 | 21.7% | 0.0% | 0.0% |
| batter_home_runs | 38,604 | 0.0% | 0.0% | 0.0% |
| pitcher_outs | 2,462 | 54.7% | 43.5% | 37.9% |
| pitcher_strikeouts | 2,159 | 64.1% | 65.1% | 55.9% |

Consequence for a two-book world: on disk, FanDuel never appears as a two-sided price on hits, total bases
or H+R+RBI, and neither book has a two-sided home-run price. A DK/FD-only closing-line check therefore
exists for DraftKings on batter props and for both books only on pitcher strikeouts and outs. Game lines
(July archive, 227 events): both books post ML on 226, run line on 225, totals on 226; both on the same
run line on 213 and the same total on 189 (`f_bookcompare.out.md` F1a).

#### 3.4 DraftKings vs FanDuel on the same line

Game lines, last pre-start snapshot, 2026-07-12..07-30 (`f_bookcompare.out.md` F1b, F1c):

| market | sides compared | DK better | FD better | tie | gain of best over DK-only | over FD-only |
|---|---|---|---|---|---|---|
| ml | 452 | 29.0% | 62.4% | 8.6% | +0.89% | +0.39% |
| rl | 426 | 46.9% | 48.4% | 4.7% | +1.10% | +0.75% |
| total | 378 | 46.6% | 36.2% | 17.2% | +0.51% | +0.69% |
| ALL | 1,256 | 40.4% | 49.8% | 9.9% | +0.85% | +0.60% |

Mean two-sided overround (sum of implied probabilities minus 1):

| market | DraftKings | FanDuel | best of DK/FD per side | Caesars | Pinnacle |
|---|---|---|---|---|---|
| ml | 4.61% | 4.00% | 3.65% | 4.34% | 2.03% |
| rl | 4.59% | 4.53% | 3.67% | 4.21% | 2.60% |
| total | 4.65% | 4.86% | 4.12% | 4.65% | 2.93% |

Props, engine boards 2026-09-14..10-17, rows quoted by both books (`c_inventory.out.md` C7b):

| market | n both | DK better | FD better | tie | gain of best over DK-only | over FD-only |
|---|---|---|---|---|---|---|
| ml | 129 | 24.8% | 65.1% | 10.1% | 1.02% | 0.36% |
| rl | 126 | 54.8% | 39.7% | 5.6% | 1.10% | 1.52% |
| batter_hits | 561 | 52.4% | 44.0% | 3.6% | 0.98% | 1.53% |
| batter_home_runs | 810 | 65.8% | 31.7% | 2.5% | 1.37% | 3.87% |
| pitcher_strikeouts | 236 | 49.6% | 46.2% | 4.2% | 1.49% | 1.83% |
| pitcher_outs | 144 | 56.9% | 40.3% | 2.8% | 1.09% | 1.79% |
| ALL | 2,006 | 56.2% | 40.1% | 3.7% | 1.21% | 2.45% |

Props, raw archive, pitcher markets where both books store both sides (`f_bookcompare.out.md` F2b, F2c):

| market / side | sides compared | DK better | FD better | tie |
|---|---|---|---|---|
| pitcher_strikeouts over | 1,207 | 34.4% | 60.5% | 5.1% |
| pitcher_strikeouts under | 1,207 | 59.6% | 35.3% | 5.1% |
| pitcher_outs over | 934 | 45.3% | 50.6% | 4.1% |
| pitcher_outs under | 934 | 57.0% | 38.7% | 4.4% |

Mean overround on those rows: strikeouts DraftKings 6.01%, FanDuel 6.01%, best-of-two 4.58%; outs
DraftKings 6.98%, FanDuel 7.29%, best-of-two 5.64%. DraftKings alone on batter props: hits 6.85%, H+R+RBI
6.98%, total bases 6.92%.

Pattern worth carrying into the redesign: FanDuel is usually the better moneyline and the better
strikeout over; DraftKings is usually the better under on both pitcher markets and the better home-run
price. Line-shopping the two cuts the hold by roughly 1 to 1.5 points on pitcher props.

#### 3.5 How many board rows clear EV > 0 under each pricing rule (`c_inventory.out.md` C7d)

Blended probability times decimal price minus 1, boards with both quotes, pre-game:

| rule | rows priced | rows with EV > 0 | share | mean EV % of those |
|---|---|---|---|---|
| DraftKings only | 3,242 | 800 | 24.7% | 4.56 |
| FanDuel only | 2,043 | 419 | 20.5% | 4.75 |
| best of DK/FD | 3,279 | 925 | 28.2% | 4.69 |
| Caesars only | 3,225 | 598 | 18.5% | 3.99 |

Mean EV over all priced rows: DraftKings -2.21%, FanDuel -3.33%, best of DK/FD -1.49%, Caesars -3.31%.
These are the engine's own claims at each book; they measure price, not truth.

#### 3.6 What cannot be computed for Baseline 2

Win rate, units and ROI at DK/FD prices for anything beyond those 14 legs (no outcomes on disk); DK/FD
prices at lock time (boards are generation-time, not lock-time); anything for football; any FanDuel close
on batter props; any close at all for home runs; any game-line close after 2026-07-30.

---

### 4. Closing line value - substitute

Script `baseline/d_clv.py` (output `d_clv.out.md`) and `baseline/h_clvsplit.py` (output
`h_clvsplit.out.md`). Unit = a pre-game engine prop row with a DK/FD basis price, joined to the last
archived pre-start snapshot later than the board. Not locks. Confidence intervals are date-clustered
bootstraps (2,000 resamples).

Coverage: 8,273 pre-game prop rows with a basis price; 5,525 with a later pre-start snapshot of the same
player/line; 4,015 with a consensus closing fair; 3,467 where the same book is two-sided at the close
(DraftKings 3,038, FanDuel 429); 53 dates, 2026-07-26..10-16. The close snapshot is a median 45 minutes
before first pitch (85.1% within 95 minutes) and a median 51 minutes after the board. Home runs: 2,156 rows
with a basis price, 0 with a closing fair. ML/RL: 875 rows, no close on disk for board dates.

Two measures:

- **CLV vs closing fair** = decimal entry price x closing no-vig probability of the side - 1. A price that
  never moves scores about minus the vig, so zero is the bar for "beat the market", and about -6% is "took
  the posted price".
- **Same-book price CLV** = decimal entry price / the same book's closing price for the same line and side - 1.

| universe | rows | CLV vs closing fair | 95% CI | beat closing fair | same-book price CLV | 95% CI | price better / equal / worse | claimed EV at board |
|---|---|---|---|---|---|---|---|---|
| all rows with a basis price | 5,525 | -5.84% | -5.92, -5.77 | 1.5% | +0.09% | +0.03, +0.15 | 15.0 / 71.6 / 13.4% | -1.45% |
| top-50-by-EV list | 1,444 | -5.69% | -5.85, -5.50 | 1.9% | +0.08% | -0.02, +0.20 | 15.8 / 69.6 / 14.6% | +2.85% |
| **EVPOS (claimed EV > 0)** | **1,713** | **-5.00%** | **-5.16, -4.82** | **3.4%** | **+0.21%** | **+0.09, +0.35** | **18.0 / 69.0 / 13.0%** | **+5.11%** |

EVPOS by market:

| market | rows | CLV vs closing fair | same-book price CLV | price better than close | claimed EV |
|---|---|---|---|---|---|
| batter_hits | 294 | -4.41% | +0.37% | 18.4% | 2.49% |
| batter_total_bases | 107 | -5.79% | +0.08% | 10.6% | 2.55% |
| batter_hits_runs_rbis | 372 | -5.95% | +0.08% | 18.8% | 3.91% |
| batter_home_runs | 295 | n/a (no close) | n/a | n/a | 6.88% |
| pitcher_strikeouts | 302 | -3.62% | +0.32% | 25.0% | 4.75% |
| pitcher_outs | 343 | -5.46% | +0.23% | 13.8% | 8.25% |

EVPOS by book:

| basis book | rows | CLV vs closing fair | same-book price CLV | 95% CI | price better than close |
|---|---|---|---|---|---|
| DraftKings | 1,206 | -5.18% | +0.28% (n 999) | +0.14, +0.44 | 19.8% |
| FanDuel | 507 | -4.51% | -0.04% (n 250) | -0.24, +0.19 | 10.8% |

Per-book, using each book's own stored board quote (2026-09-14 on, `d_clv.out.md` D4): DraftKings rows with
EV > 0 at DraftKings n 395, +0.28%, 25.8% better than close; FanDuel rows with EV > 0 at FanDuel n 152,
+0.10%, 14.5% better.

EVPOS by engine build / selection mode:

| build / mode | rows | CLV vs closing fair | same-book price CLV | price better than close | claimed EV |
|---|---|---|---|---|---|
| 39fc8681 / ev_gated | 381 | -5.30% | +0.08% | 12.2% | 5.23% |
| cb2cdebc / ev_gated | 151 | -5.44% | +0.27% | 24.8% | 6.62% |
| cb2cdebc / dk_fd | 248 | -5.25% | +0.05% | 8.9% | 6.14% |
| bb6be52d / dk_fd | 529 | -4.97% | +0.23% | 19.2% | 5.02% |
| 52510d67 / dk_fd | 395 | -4.53% | +0.38% | 24.4% | 3.90% |

EVPOS by claimed-edge bucket: 0-2% claimed gives -5.33% / +0.11%; 2-5% gives -4.96% / +0.17%; 5-10% gives
-5.09% / +0.17%; 10%+ (254 rows, mean claimed 14.88%) gives -4.08% / +0.66%. Over 1,088 rows -4.83% / +0.26%;
under 625 rows -5.22% / +0.17%.

Reading: about 70% of prices are unchanged between board and close, and the average move is in the engine's
favour by a fifth of a percent. Rows the engine rates highest move slightly more (0.66% at 10%+ claimed),
which is a real but very small signal. Against the closing no-vig fair every group sits near minus the
vig. A claimed +5.1% edge that the closing market values at -5.0% is, on this evidence, mostly not there.
Limits: the "close" is on average 45 minutes early, the window between board and close is under an hour,
and these are board rows rather than the bets that were locked.

---

### 5. Calibration - substitutes

No Brier score, log loss or reliability table against outcomes can be computed from disk except the 21-row
micro-sample in 5.3. The substitute is "does the model's disagreement with the market predict where the
market closes".

#### 5.1 Model vs closing fair (`baseline/e_calibration.py`, output `e_calibration.out.md` E1)

14,343 pre-game prop-board rows, 51 dates (2026-08-06..10-16). `pO` is the board's blended probability of
the over (verified: mean absolute difference from the blended `prob` is 0.000 points over 6,439 matched
rows); `fO` is the board's consensus fair; target is the median per-book Shin fair at the close.

| market | n | mean pO | mean board fair | mean close fair | mean abs(pO - fO) | RMSE board fair vs close | RMSE model vs close | slope of (close - fO) on (pO - fO) |
|---|---|---|---|---|---|---|---|---|
| batter_hits | 4,237 | 57.05 | 57.01 | 57.04 | 2.02 | 0.67 | 2.56 | +0.021 (se 0.004) |
| batter_total_bases | 4,594 | 48.72 | 48.29 | 48.38 | 2.14 | 0.68 | 2.73 | +0.020 (se 0.004) |
| batter_hits_runs_rbis | 4,349 | 50.70 | 49.00 | 49.20 | 2.37 | 0.73 | 3.01 | +0.025 (se 0.004) |
| pitcher_strikeouts | 550 | 50.14 | 49.26 | 49.20 | 2.98 | 0.76 | 3.76 | +0.006 (se 0.009) |
| pitcher_outs | 613 | 46.39 | 50.37 | 50.38 | 5.09 | 1.12 | 6.36 | +0.003 (se 0.009) |
| ALL | 14,343 | 51.74 | 51.21 | 51.30 | 2.33 | 0.72 | 3.05 | +0.023 (se 0.002) |

By engine build / mode the slope is +0.022 (39fc8681 / ev_gated, n 3,079), +0.016 (cb2cdebc / ev_gated,
1,043), +0.015 (cb2cdebc / dk_fd, 2,076), +0.026 (bb6be52d / dk_fd, 5,448), +0.029 (52510d67 / dk_fd,
2,697). No build is distinguishable from another.

Reliability-style buckets against the close (not outcomes):

| pO bucket | n | mean pO | mean board fair | mean close fair | pO - close |
|---|---|---|---|---|---|
| 20-30% | 127 | 28.31 | 31.05 | 31.27 | -2.96 |
| 30-40% | 1,723 | 36.33 | 37.33 | 37.45 | -1.12 |
| 40-50% | 4,136 | 45.01 | 44.52 | 44.64 | +0.38 |
| 50-60% | 5,032 | 55.20 | 54.58 | 54.67 | +0.53 |
| 60-70% | 3,219 | 63.50 | 62.19 | 62.24 | +1.26 |
| 70-80% | 106 | 71.10 | 68.23 | 68.30 | +2.80 |

The model is more extreme than the close at both ends (overconfident shape), and the market at board time
is already where the close will be.

#### 5.2 Raw model probability (`e_calibration.out.md` E1f)

Category rows, side-adjusted, 5,431 rows:

| market | n | mean raw model | mean blend | mean board implied | mean close fair | RMSE implied vs close | RMSE blend vs close | RMSE raw model vs close |
|---|---|---|---|---|---|---|---|---|
| batter_hits | 1,344 | 66.49 | 62.80 | 60.81 | 60.83 | 0.64 | 2.52 | 7.04 |
| batter_total_bases | 1,438 | 65.06 | 60.36 | 58.09 | 58.08 | 0.63 | 2.87 | 8.56 |
| batter_hits_runs_rbis | 1,362 | 66.19 | 58.21 | 55.33 | 55.42 | 0.69 | 3.61 | 13.11 |
| pitcher_strikeouts | 605 | 60.62 | 53.02 | 50.12 | 50.11 | 0.76 | 3.69 | 13.05 |
| pitcher_outs | 682 | 71.42 | 54.10 | 49.13 | 49.10 | 1.26 | 6.35 | 25.19 |
| ALL | 5,431 | 66.00 | 58.82 | 56.06 | 56.08 | 0.77 | 3.69 | 13.17 |

The rows the engine chooses to show have a raw model probability 10 points above the close on average and
22 points above it on pitcher outs; the slope of the close on the raw model's disagreement is +0.004
(se 0.001). This is a selection effect as well as a model effect (the board shows the side the model
likes), but it means the listed "edge" on these rows is almost entirely model-minus-market disagreement
that the market does not ratify.

#### 5.3 The only outcome-joinable rows on disk (`e_calibration.out.md` E2)

Four player game logs in `tests/fixtures` (Adrian Houser, Paul Skenes, Ronald Acuna Jr., Yunior Marte)
join to 21 pre-game prop-board rows on 2026-08-25, 08-31 and 09-01: model mean predicted 0.442, over rate
0.143 (3 of 21), Brier 0.2096, log loss 0.6064; board fair mean 0.474, Brier 0.2163, log loss 0.6211. The
rows are nested ladders for three players. This proves the join works; it estimates nothing.

#### 5.4 Home-run aggregate as stored (`HIST/data/hr_overround.json`, echoed in `e_calibration.out.md` E3)

Stored by its own writer, not recomputed here: 87 days, 423 games, 7,581 rows; sum of implied
probabilities for players who appeared 1071.54 against 923 realised home-run hitters, overround 1.1609
(1.1763 over all listed). The file's own verdict string says the engine's hard-coded 1.06 home-run
overround overstates home-run EV by about 6.2 points. That is the only outcome-based calibration fact for
home runs on disk, and it is an aggregate.

---

### 6. Split matrix: what exists for each requested cut

| Metric | Baseline 1 (as recorded) | Baseline 2 (DK/FD) |
|---|---|---|
| Pick count | 38 tickets, 6 days, MLB | 14 repriced legs; otherwise board-row counts only (2,683 EVPOS rows) |
| Win rate | 15.8% of tickets; ML legs 57.1%, RL legs 12.5% (15 legs) | 5-9 on 14 legs |
| Units / ROI | -16.85u, -44.3% | DK -5.69u, FD -5.58u, best -5.56u on 14 flat singles |
| CLV | none recorded | substitute only: section 4 |
| Brier / log loss / buckets | Brier for 70 rows by market; no log loss, no buckets | substitute only: section 5 |
| By sport | MLB only | MLB only |
| By market | partial (ML/RL legs; 8-market Brier table) | substitutes split by market throughout |
| By book | none | DK vs FD throughout the substitutes |
| By model version | none | substitutes split by engine build and selection mode |

---

### 7. Football

Script `baseline/g_football.py`, output `g_football.out.md`.

- `HIST/data` contains 0 files with nfl, cfb, ncaaf or football in the path.
- `src/lib/nfl/week1-replay.json`: 10 forced $35 singles ($350; 6 spreads, 4 moneylines), `grading: null`,
  0 tickets clear the edge gate, mean stated EV -1.71%. Its own note says it was reconstructed after kickoff
  and is excluded from the live ledger.
- It cannot be repriced at DK/FD: the SHA-256 it records for its odds input does not match
  `tests/fixtures/nfl/odds-2026-09-13.json`, and all 13 events in that fixture carry a note beginning
  "SYNTHETIC" (invented prices). It cannot be graded: `tests/fixtures/nfl/espn-scoreboard-2026-09-13.json`
  has all 13 events still scheduled. The CFB scoreboard fixture (2026-09-05) is likewise all scheduled.

There is no football baseline of any kind on disk, recorded or substitute.

---

### 8. Caveats that apply to every substitute

1. Board rows are engine output, not locked bets. Which rows became tickets is only in the ledger.
2. A board's `latest` file is often written after first pitch; only rows generated before first pitch are
   used (11,526 of 16,006), which drops whole late-generated dates.
3. The board price is the price when the board was generated, not when a card locked.
4. `cz` means Caesars through 2026-09-16 and DraftKings from 2026-09-17 (`src/lib/sportsbook/books.ts:12`
   sets `SETTLE_BOOK = 'draftkings'`); the two are never pooled here.
5. The stored DK/FD basis price `bs` equals the better of the two stored book quotes on only 2,426 of 3,276
   rows (74.1%) (`baseline/i_bs_consistency.py`, output `i_bs_consistency.out.md`). On 524 rows (16.0%) `bs`
   is the FanDuel quote while the stored DraftKings quote is better; 466 of those are home runs, where the
   DraftKings quote is a median 4.87% better (for example 2026-09-17 Riley Greene: `bs` +285 FanDuel,
   DraftKings quote +300). On 322 rows (9.8%) `bs` matches neither quote; for batter hits (213 rows) and
   strikeouts (49) the gap is a fraction of a percent, consistent with quote timing, but for ML (36 rows)
   and RL (24 rows) the stored quote is a median 6.7% and 7.2% away. Cause not determined. A DK/FD-only
   engine should be checked for this before its home-run and game-line EV figures are trusted, and it means
   the home-run rows in section 3.2 are priced at a worse number than the board's own DraftKings quote.
6. The props archive stores a book's price only when that book posts both sides, uses US-facing books only,
   has no alternate lines, and has no per-book home-run price.
7. The archive's `fb` list shows FanDuel on 0.0% of batter-hits rows, while the boards' own `bookQuotes`
   show a FanDuel quote on 67.4% of batter-hits rows. The two pulls evidently request different markets;
   not resolved here.
8. The archive's consensus fair is a proportional de-vig median; the engine's is Shin. Both are reported in
   section 4 and differ by about half a point.
9. Sample sizes for anything involving outcomes are 38 tickets, 15 legs, 70 rows and 21 rows.

---

### 9. What the owner must export to complete both baselines

All of these are read-only GETs behind the sync key; the owner runs them and saves the JSON. No secret
value should be pasted anywhere. Save each response body unmodified.

#### 9.1 MLB ledger (required for Baseline 1 and for pick-level Baseline 2)

Source: `GET /api/ledger`, which returns `{ ledger, bank, noplay, at, epoch }` (`app/api/ledger/route.ts:77`).
`tools/ledger-report.mjs:77-94` rejects a bare array, an empty `ledger`, a non-ISO `date`, a non-array
`core`/`funT`, and a locked entry without a positive numeric `bankroll`. Needed shape:

```
{
  "ledger": [
    {
      "date": "YYYY-MM-DD", "locked": true, "bankroll": 10000, "lockedAt": 1789325567133,
      "selMode": "dk_fd", "lateLock": false, "overrode": false,
      "games":   { "<gkey>": { "pk": 0, "start": "ISO", "home": "", "away": "" } },
      "core":    [ <ticket>, ... ],
      "funT":    [ <ticket>, ... ],
      "grading": { "v": 0, "legs": { "<label>|<prop>": { "result": "won" | "lost" | <any other state the app stores> } } },
      "clv":     { "<leg id>": { "am": -110, "bsAm": -108, "bsBk": "DK", "consensusFair": 52.1, "at": 0 } }
    }
  ],
  "bank": ..., "noplay": ..., "at": ..., "epoch": ...
}
ticket = { "id": "", "bucket": "core"|"fun", "stake": 0, "prob": 0, "czOdds": 0, "czDec": 0, "czEv": 0,
           "bsOdds": 0, "placed": true|false|null, "actualStake": 0, "paperPolicy": "",
           "legs": [ { "label": "", "prop": "", "lkey": "", "gkey": "", "cz": -110, "bs": -108, "imp": 51.2 } ] }
```

Field meanings are in `docs/clv.md:23-36` (`cz` executed price, `bs` DK/FD basis price, `imp` consensus
fair at lock; `entry.clv[leg]` the pre-pitch closing sighting) and `tools/ledger-report.mjs:143-150`
(grading), `:188-190` (lock time), `:206-211` (field census).

Two things the stored shape may not contain and which decide how complete Baseline 2 can be:

- **Per-leg DraftKings and FanDuel prices separately** at lock and at close. The stored shape has one basis
  price (`bs`, `bsAm` + `bsBk`). If only that exists, each leg can be repriced at the book that was the basis
  but not at the other one, except by joining to the board archive (possible for MLB props from 2026-09-14,
  not before).
- **Payout / settled amount per ticket.** If absent it is recomputed from `czDec` and leg results; pushes and
  voids must then be identifiable in `grading` (`tools/ledger-report.mjs:149` reads only "won" and "lost";
  which other states the app stores was not determined here).

#### 9.2 Graded prediction store (required for calibration; this is the largest gain)

Source: `GET /api/predictions` returns `{ days: [...] }`; `GET /api/predictions?date=YYYY-MM-DD` returns the
day blob `{ date, at, records, parlays, games }` (`app/api/predictions/route.ts:32-42`). One file per day
for every day in `days`. Each record (`src/lib/pred-serialize.ts:10-77`):

```
{ "k": "<gkey>|<lkey>|<sub>", "market": "", "gkey": "", "lkey": "", "sub": "Hits U 1.5", "ln": 1.5,
  "p": 0, "pModel": 0, "pMkt": 0, "w": 0, "edge": 0, "ev": 0, "odds": -110, "book": "", "cz": -110, "czEv": 0,
  "lu": "confirmed"|"projected", "selMode": "", "src": "cron"|"client",
  "pop": "selected"|"unselected"|"shadow", "superseded": true?, "stale": true?,
  "res": "won"|"lost"|"push"|"void"|"pending"|"ungradable", "gradedAt": 0 }
```

With `res` per record, joined by (date, gkey, lkey, sub) to the board archive already on disk, every table
in sections 3 to 5 becomes a real result: win rate, units and ROI at the DK/FD basis price, Brier, log loss
and reliability buckets for blended and raw model against outcomes, split by market, book, engine build and
selection mode, for 2026-08-06..10-17. This export alone would turn the substitutes into a baseline for
MLB. Note that the record carries the best price and the settlement price, not DK and FD separately; the
DK/FD prices come from the board archive.

#### 9.3 Football ledgers

Source: `GET /api/cfb/ledger` and `GET /api/nfl/ledger`, each returning `{ ledger, bank, at }`
(`app/api/cfb/ledger/route.ts:70`, `app/api/nfl/ledger/route.ts:71`). Entry and ticket shape as in
`src/lib/nfl/week1-replay.json` (`entry.sport`, `date`, `locked`, `lockedAt`, `core[]`, `funT[]`, `games`,
`grading`; leg `market`, `side`, `line`, `teamId`, `prob`, `push`, `cz`, `lkey`, `gkey`). Needed in addition,
if stored: the DraftKings and FanDuel price of each leg at lock, the closing price, and which book `cz`
refers to on each date. There is no football price archive on disk to fall back on, so anything not in
these ledgers cannot be reconstructed.

#### 9.4 Supporting exports

- `GET /api/calibration` response (summary, per-market multipliers, log) for the current fit and its window.
- Every page of `GET /api/taken` (`{ now, total, rows, next }`, paged with `?before=<ms>&limit=<n>`;
  `app/api/taken/route.ts:6-11, 42-47`), which lists every locked bet on every desk from the lock records
  themselves. It is the quickest cross-check that the three ledgers are complete.
- If available from the odds provider's history, DraftKings and FanDuel closing prices for the dates and
  markets the disk lacks: MLB game lines after 2026-07-30, home-run props, FanDuel batter props, and all
  football. This costs credits and is the owner's decision.

---

### 10. Reproduce

All under `/private/tmp/claude-501/audit-out/baseline/`, run with `python3 -I <script>`; each reads only
from the two checkouts and writes only beside itself.

| script | output | what |
|---|---|---|
| `common.py` | - | loaders, odds maths, de-vig |
| `a_recorded.py` | `a_recorded.out.md` | recorded P&L, 15 legs, DK/FD reprice, recorded calibration table |
| `b_build_rows.py` | `rows.jsonl`, `pb_rows.jsonl` | row datasets and close join |
| `c_inventory.py` | `c_inventory.out.md` | board inventory, DK vs FD on boards, EV under each pricing rule |
| `d_clv.py` | `d_clv.out.md` | closing-line substitute |
| `h_clvsplit.py` | `h_clvsplit.out.md` | better / equal / worse split of same-book price CLV |
| `e_calibration.py` | `e_calibration.out.md` | model vs close, raw model, fixture micro-sample, HR aggregate |
| `f_bookcompare.py` | `f_bookcompare.out.md` | DK vs FD and coverage from the raw archives |
| `g_football.py` | `g_football.out.md` | football material on disk |
| `i_bs_consistency.py` | `i_bs_consistency.out.md` | basis price `bs` vs the stored per-book quotes |

Exploration-only scripts in the same folder (`explore_*.py`, `join_check.py`, `grep_docs.py`,
`a_debug_cle.py`) produced no reported number.

---

<a id="appendix-c"></a>
