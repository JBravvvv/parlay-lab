# Parlay Lab audit report

Written 2026-11-12. Code read: `/private/tmp/claude-501/pl-audit`, branch `az-two-book-anytime`, HEAD `8ab9e46` (a clone of the production branch `frontend-rebuild`). Stored history read: `/private/tmp/claude-501/pl-history` (the `line-history` branch). Working papers, scripts and their outputs: `/private/tmp/claude-501/audit-out`.

Second pass, same day: a completeness critic listed 17 gaps and five more read-only passes closed them (section 9). The three bulky appendices and the five gap reports were moved to the `audit/` folder; nothing was cut. The full test suite was then run once on the untouched branch as a yardstick: 4,089 tests, 3,961 pass, 128 fail (section 9.8).

Rules this audit ran under: read-only; no code change; no network call of any kind; no `.env*` file opened; no secret value read or written; no mutating git command; the full test suite was not run. Claims about code or data cite a `path:line` relative to the checkout (or `pl-history/...` / `HIST/...` for the history branch). Where something was not found, it says so.

Owner constraint being audited: Arizona, can bet only DraftKings and FanDuel. The system is paper trading only. This document is informational and is not betting advice.

### The short version

1. **There is no usable performance baseline on disk.** The only recorded money result is six days in July: 38 tickets, 6-32, -$376.91 on $850.00 (ROI -44.3%). Everything since, and all of football, is in the live store and was not readable. Section 1.
2. **The closing market does not confirm the edge the engine claims.** On 1,713 board rows the engine called positive-EV (mean claimed +5.11%), the entry price beat the same book's close by +0.21%. On the bets found mode would have taken, stake-weighted CLV was -0.77% (interval -2.01 to +0.27) against a claimed +4.19%. Sections 1.3 and 4 (B1-1, B3-1).
3. **Every bet is priced, staked and settled at DraftKings. FanDuel is never a bet price**, even when it is better. The "market" that edges are measured against is a multi-book consensus that includes books the owner cannot bet. Sections 4 (C1-2, B2-4) and 6.
4. **Sizing is full Kelly on a constant $10,000**, up to $800 a bet and $2,500 a day per sport, labelled quarter Kelly. The July sizing protections do not run on the live path. Section 4 (P-2, C1-3, B2-7).
5. **Picks are limited to 07:00-18:45 PT by an outside ticker and two slot tables**, not by anything that protects the record. Of 80 limits, 11 should be removed as artificial and 11 as dead code; 7 more are split. Section 3.
6. **The MLB ledger can be silently overwritten** when the stored value cannot be read, and a store outage turns every scheduler poke into an unalerted 500. Section 4 (D-1, E1-1).
7. **Most of the prior audit's fixes never shipped**: of 56 rows, 16 are in place, 25 missing, 11 partial. Section 5.
8. **Three routes spend money for anyone who finds them** while one environment variable is unset: the football props routes (Odds credits) and `/api/sharp` (model credits). Section 9 (G1-1, G1-2).
9. **Football can only be bet on its own day**, and the football graders void what they cannot read (a player who did not play, any market outside eight). Section 9 (G4-14, G4-2, G4-3).
10. **Only two of the high findings touch a bet placed this week** (B2-1, P-2). MLB is out of season; six of the high findings are dormant until spring. Section 9.2.
11. **A free two-book MLB baseline exists and was never graded**: 71 archived board-days. Section 9 (G3-B1).

### Contents

1. Baselines
2. How the system works today
3. Every limit on when and how many picks are made
4. Findings (140 from the first pass; table, then detail for the ten high findings)
5. Prior audit regression table
6. Sportsbook references
7. Refuted findings
8. Not covered / could not verify
9. Gap closure: 65 more findings, corrected verdicts, what is live today, the repo map, test impact
- Appendix A. Full record of every medium and low finding, and the refuted findings' reviewer notes: [`audit/appendix-a-findings.md`](audit/appendix-a-findings.md)
- Appendix B. Baseline working paper, complete: [`audit/appendix-b-baseline.md`](audit/appendix-b-baseline.md)
- Appendix C. Sportsbook reference sweep, complete (about 7,900 hits, one per line): [`audit/appendix-c-book-sweep.md`](audit/appendix-c-book-sweep.md)
- Gap reports: [`audit/gaps/`](audit/gaps/)

---

## 1. Baselines

Source: `audit-out/baseline.md` (written 2026-11-11; reproduced in full as Appendix B). Every number in this
section was produced by a script under `audit-out/baseline/` that was run against files on disk. Paths written
`HIST/...` mean `/private/tmp/claude-501/pl-history/...`.

**Neither baseline can be completed from disk.** The live ledger, the graded prediction store and the stored
closing-line records live in Upstash, and no export of any of them is on disk. No network call was allowed in
this phase, so they were not read. What follows is what exists, and each table says what it is not.

| Needed for a baseline | On disk? |
|---|---|
| Pick-level rows that were actually locked (tickets, legs, stakes) | No. Only doc aggregates and 15 hand-audited legs. |
| Per-pick outcomes (won / lost) | No, apart from those 15 legs and a 21-row fixture micro-sample. |
| DraftKings and FanDuel prices at the time a pick was made | Partial, MLB only: daily board archives carry a DK/FD basis price per row (2026-07-26, 2026-08-06..10-17) and both books' own quotes from 2026-09-14. |
| Closing prices | Partial, MLB only: game lines 2026-07-12..07-30; props 2026-07-12..10-28 (two-sided markets only; home runs have no usable close). |
| Recorded closing line value | No. No CLV number is recorded anywhere on disk. |
| Calibration against outcomes | No, apart from one 70-row table quoted in a doc. |
| Football (CFB, NFL) prices, closes, graded picks | Nothing. One ungraded, synthetic NFL Week 1 replay only. |

### 1.1 Baseline 1 — full history as recorded

The only recorded money result on disk is six days of MLB in July (`docs/settlement-audit.md:66-71`).

| Window | Tickets | Record | Staked | Returned | Profit | ROI |
|---|---|---|---|---|---|---|
| MLB 2026-07-17..07-22 | 38 | 6-32 (15.8%) | $850.00 | $473.09 | -$376.91 | -44.3% |

That is -16.85 units at 1 unit = the $22.37 mean stake. By day (staked / returned / profit / ROI):
07-17 $300.00 / $198.33 / -$101.67 / -33.9%; 07-18 $300.00 / $244.87 / -$55.13 / -18.4%;
07-19 $125.00 / $0 / -$125.00 / -100%; 07-20 $43.00 / $0 / -$43.00 / -100%;
07-21 $42.00 / $29.89 / -$12.11 / -28.8%; 07-22 $40.00 / $0 / -$40.00 / -100%.

Among the 15 hand-audited legs (parlay legs; their stakes are not on disk): moneyline legs 4-3 (57.1%),
run-line legs 1-7 (12.5%).

Calibration as recorded (`docs/pitcher-outs-audit.md:212-219`, 70 graded rows):

| Market | n | Predicted | Actual | Brier (model) | Brier (consensus) |
|---|---|---|---|---|---|
| pitcher_outs | 5 | .532 | .000 | .285 | .215 |
| pitcher_strikeouts | 5 | .547 | .400 | .230 | .218 |
| batter_total_bases | 9 | .660 | .444 | .293 | .284 |
| ml | 15 | .550 | .600 | .234 | .235 |
| rl | 15 | .615 | .533 | .246 | .246 |
| batter_hits | 7 | .686 | 1.000 | .099 | .109 |
| batter_hits_runs_rbis | 7 | .639 | .714 | .206 | .218 |
| batter_home_runs | 7 | .220 | .000 | .049 | .053 |
| ALL | 70 | .566 | .500 | 0.2127 | 0.2085 |

Other aggregates quoted in docs (not recomputable from disk): 619 graded picks over three days with pitcher-outs
unders 20-28, 41.7% against 49.6% modelled (`docs/session-handoff.md:1957-1960`); 16,322 graded board rows as of
2026-09-12 with five of eight market Brier scores worse than consensus (`docs/progress.md:429`); "2-leg -0.7% on
$464; 3+ legs 1-25; fun 0-13, -$220" (`ENGINE2.md:488-520`).

**Gaps in Baseline 1 (stated plainly):**

- Nothing after 2026-07-22 can be computed: the whole MLB ledger from 07-23 through October (the shaped
  $150/$350 cards, found mode from 2026-10-03, straight-bets-only from 2026-10-06), every CFB and NFL card, all
  placed/not-placed answers, and all stored CLV sightings.
- No recorded CLV. No split by sportsbook or by model version.
- The 38 tickets are July parlays on an older engine and an older stake rule. They say nothing about the
  found-mode straight bets the system makes today.
- Sample sizes for anything with outcomes are 38 tickets, 15 legs, 70 rows and 21 rows.

### 1.2 Baseline 2 — DraftKings / FanDuel only

**Pick-level repricing (the only pick-level legs on disk).** The 15 audited legs, 14 priceable, as flat 1-unit
singles at the last archived pre-start price (`HIST/data/2026-07-1x.json`). These are near-close prices, not lock
prices, and the legs were really parlay legs. This is a like-for-like book comparison and nothing more.

| Book | Legs priced | W-L | Units (flat 1u) | ROI |
|---|---|---|---|---|
| DraftKings | 14 | 5-9 | -5.692 | -40.7% |
| FanDuel | 14 | 5-9 | -5.582 | -39.9% |
| Best of DK/FD | 14 | 5-9 | -5.563 | -39.7% |
| Caesars | 14 | 5-9 | -5.705 | -40.8% |
| Pinnacle | 13 | 5-8 | -4.509 | -34.7% |

DraftKings had the better price on 6 legs, FanDuel on 8. One leg (CLE run line vs PIT, 2026-07-18, a
doubleheader) could not be priced. Fourteen legs is not a sample; the book makes about one point of difference
and the record is the same.

**Board-row substitute (engine output, not locked bets).** 11,526 pre-game board rows on 68 of 71 board dates;
9,136 carry a DK/FD basis price (2,390 do not); 2,683 were positive-EV at that price by the engine's own number.

| Market (EV-positive rows) | n | DK basis % | FD basis % | Blended prob | Raw model | Implied | Claimed EV % | Mean decimal |
|---|---|---|---|---|---|---|---|---|
| ml | 39 | 48.7 | 51.3 | 55.7 | 65.6 | 53.9 | 1.15 | 1.834 |
| rl | 27 | 51.9 | 48.1 | 57.7 | 71.8 | 55.2 | 1.36 | 1.770 |
| batter_hits | 473 | 66.8 | 33.2 | 62.8 | 69.6 | 59.1 | 2.52 | 1.688 |
| batter_total_bases | 173 | 100 | 0 | 61.3 | 70.3 | 56.8 | 2.37 | 1.694 |
| batter_hits_runs_rbis | 548 | 100 | 0 | 60.8 | 73.3 | 55.5 | 3.56 | 1.715 |
| batter_home_runs | 487 | 53.2 | 46.8 | 17.7 | 20.6 | 16.8 | 7.25 | 6.701 |
| pitcher_strikeouts | 442 | 49.8 | 50.2 | 53.4 | 64.3 | 49.1 | 5.01 | 1.996 |
| pitcher_outs | 494 | 63.4 | 36.6 | 55.7 | 74.1 | 48.6 | 8.72 | 1.974 |
| ALL | 2,683 | 69.4 | 30.6 | 51.1 | 61.4 | 46.8 | 5.10 | 2.710 |

**How many board rows clear EV > 0 under each pricing rule** (rows priced / EV > 0 / share / mean EV of those):
DraftKings only 3,242 / 800 / 24.7% / 4.56; FanDuel only 2,043 / 419 / 20.5% / 4.75; best of DK/FD 3,279 / 925 /
28.2% / 4.69; Caesars only 3,225 / 598 / 18.5% / 3.99. Mean EV over all priced rows: DraftKings -2.21%, FanDuel
-3.33%, best of the two -1.49%, Caesars -3.31%.

**Coverage: how much of the board the two books price** (boards 2026-09-14..10-17, 29 dates, 4,215 pre-game rows;
DK quote / FD quote / both / neither, %): ml 100/100/100/0; rl 96.9/97.7/96.2/1.5; batter_hits 96.0/67.4/66.7/3.3;
batter_total_bases 25.5/0/0/74.5; batter_hits_runs_rbis 84.3/0/0/15.7; batter_home_runs 99.0/99.6/98.8/0.1;
pitcher_strikeouts 93.2/91.7/89.1/4.2; pitcher_outs 61.5/45.7/41.4/34.2; ALL 76.9/48.5/47.6/22.2.

**DraftKings vs FanDuel on the same line.** Game lines 2026-07-12..07-30, 1,256 sides: DraftKings better 40.4%,
FanDuel better 49.8%, tie 9.9% (moneylines: FanDuel better 62.4% to 29.0%). Props on boards 2026-09-14..10-17
quoted by both, 2,006 rows: DraftKings better 56.2%, FanDuel 40.1%, tie 3.7%. Taking the better of the two instead
of DraftKings alone is worth about +0.85% (game lines) to +1.21% (props) in price; instead of FanDuel alone +0.60%
to +2.45%. Pattern: FanDuel is usually better on moneylines and strikeout overs; DraftKings is usually better on
pitcher-market unders and home-run prices; shopping both cuts the hold by about 1 to 1.5 points on pitcher props.

**Gaps in Baseline 2 (stated plainly):**

- No win rate, units or ROI at DK/FD prices for anything beyond those 14 legs: there are no outcomes on disk.
- No DK/FD price at lock time. Boards are stamped when generated, not when a card locked.
- Nothing for football: `HIST/data` holds 0 football files. The one NFL Week 1 replay
  (`src/lib/nfl/week1-replay.json`) is 10 forced $35 singles with `grading: null`, built on a fixture whose 13
  events are all marked "SYNTHETIC".
- No FanDuel close on batter props, no close at all for home runs, no game-line close after 2026-07-30.
- The board rows are engine output. Which of them became tickets is only in the ledger.

### 1.3 Closing-line value — substitute only (board rows, not locks)

No CLV is recorded on disk. As a substitute, board rows were compared with the archived close (date-clustered
bootstrap, 2,000 resamples). Coverage: 8,273 pre-game prop rows with a basis price; 5,525 with a later pre-start
snapshot; 4,015 with a consensus closing fair; 53 dates 2026-07-26..10-16. The close is a median 45 minutes
before first pitch and a median 51 minutes after the board. Home runs (2,156 rows) have no closing fair;
moneyline and run line (875 rows) have no close.

| Rows | n | CLV vs closing no-vig fair | 95% CI | Beat the fair | Same-book price CLV | 95% CI | Claimed EV |
|---|---|---|---|---|---|---|---|
| All | 5,525 | -5.84% | -5.92 to -5.77 | 1.5% | +0.09% | +0.03 to +0.15 | -1.45% |
| Top 50 by EV | 1,444 | -5.69% | -5.85 to -5.50 | 1.9% | +0.08% | -0.02 to +0.20 | +2.85% |
| EV-positive | 1,713 | -5.00% | -5.16 to -4.82 | 3.4% | +0.21% | +0.09 to +0.35 | +5.11% |

Read this carefully. A price that never moves scores about minus the vig (roughly -6%) against a no-vig fair, so
-5.00% on EV-positive rows is essentially the vig, not adverse selection. The useful statement is: the engine
claimed +5.11% and the closing market ratified about +0.2% of it. Against the same book's own closing price the
entry was better on 18.0% of rows, identical on 69.0% and worse on 13.0%.

Reviewer replay on the bets found mode would actually have taken (finding B1-1 reviewer note; scripts
`audit-out/verify-b1-1/clv_found.py`, `clv_found_sw.py`): 78 eligible bets from 2026-09-17, 61 with a closing
fair; mean CLV at the DraftKings price -2.29% (date-clustered 95% CI -3.09 to -1.49); 13.1% beat the closing
fair; stake-weighted CLV -0.77% (CI -2.01 to +0.27) against a stake-weighted claimed EV of +4.19%. Price-driven
bets (positive EV on the market's own fair) averaged +0.45% (n = 11); model-driven bets -2.89% (n = 50).

### 1.4 Calibration — substitute only (model vs closing fair, not outcomes)

14,343 rows on 51 dates (2026-08-06..10-16). The board's own consensus fair predicts the close with RMSE 0.72
points; the engine's blended probability with RMSE 3.05; the raw model probability (5,431 category rows) with
RMSE 13.17. When the model disagrees with the market, the close moves 2.3% of the way toward the blended number
(slope +0.023, se 0.002) and 0.4% of the way toward the raw model (slope +0.004, se 0.001). Per market (n / RMSE
fair / RMSE blended model / slope): hits 4,237 / 0.67 / 2.56 / +0.021; total bases 4,594 / 0.68 / 2.73 / +0.020;
H+R+RBI 4,349 / 0.73 / 3.01 / +0.025; strikeouts 550 / 0.76 / 3.76 / +0.006; outs 613 / 1.12 / 6.36 / +0.003.

Limits of this test, from the B3-1 reviewer note: the board-to-close gap is a median 87 minutes and the
DraftKings close is identical to the board price on 1,479 of 2,097 rows, so "the market beats the model on RMSE"
is close to tautological; the slope rises with horizon (+0.009 under 60 minutes, +0.031 at 60-180, +0.197 at
180-480 on one date, n = 146). It shows the market does not ratify the model's edge within about 90 minutes. It
does not show the model has zero information.

Outcome micro-sample (21 fixture rows, four pitchers, 2026-08-25, 08-31, 09-01): model mean 0.442, actual over
rate 0.143 (3 of 21), Brier 0.2096; board fair 0.474, Brier 0.2163. Home runs (`HIST/data/hr_overround.json`):
87 days, 423 games, 7,581 rows, implied sum 1071.54 against 923 realised, overround 1.1609; the engine's
hard-coded 1.06 overstates home-run EV by about 6.2 points.

### 1.5 Caveats that apply to every substitute above

1. Board rows are engine output, not locked bets. Which rows became tickets is only in the ledger.
2. A board's `latest` file is often written after first pitch; only rows generated before first pitch are used
   (11,526 of 16,006), which drops whole late-generated dates.
3. The board price is the price when the board was generated, not when a card locked.
4. `cz` means Caesars through 2026-09-16 and DraftKings from 2026-09-17; the two are never pooled.
5. The stored DK/FD basis price `bs` equals the better of the two stored book quotes on only 2,426 of 3,276 rows
   (74.1%). On 524 rows (16.0%) `bs` is the FanDuel quote while the stored DraftKings quote is better (466 are
   home runs, DraftKings a median 4.87% better). On 322 rows (9.8%) `bs` matches neither quote; for moneyline (36
   rows) and run line (24 rows) the stored quote is a median 6.7% and 7.2% away. Cause not determined.
6. The props archive stores a book's price only when that book posts both sides, uses US-facing books only, has
   no alternate lines, and has no per-book home-run price.
7. The archive's `fb` list shows FanDuel on 0.0% of batter-hits rows while the boards' own `bookQuotes` show a
   FanDuel quote on 67.4% of batter-hits rows. The two pulls evidently request different markets. Not resolved.
8. The archive's consensus fair is a proportional de-vig median; the engine's is Shin. They differ by about half
   a point.
9. Sample sizes for anything involving outcomes are 38 tickets, 15 legs, 70 rows and 21 rows.

### 1.6 What the owner must export to complete both baselines

All are read-only GETs behind the sync key. The owner runs them and saves each response body unmodified. No
secret value should be pasted anywhere.

- `GET /api/ledger` (`app/api/ledger/route.ts:77`) — the MLB ledger. Required for Baseline 1 and for pick-level
  Baseline 2.
- `GET /api/predictions` and `GET /api/predictions?date=YYYY-MM-DD` (`app/api/predictions/route.ts:32-42`) — the
  graded prediction store. This is the largest single gain: it turns the calibration substitute into a real
  calibration against outcomes.
- `GET /api/cfb/ledger` and `GET /api/nfl/ledger` (`app/api/cfb/ledger/route.ts:70`,
  `app/api/nfl/ledger/route.ts:71`) — the only football record that exists.
- `GET /api/calibration` — the live calibration summary and weights.
- Every page of `GET /api/taken` (`app/api/taken/route.ts:6-11, 42-47`).
- Optional, costs Odds API credits (owner decision): provider-history DK/FD closing prices for the locked legs.

---

## 2. How the system works today

### 2.1 Compact end-to-end description

Parlay Lab is a Next.js app on Vercel with one Upstash Redis store. It paper-trades three desks: MLB, college
football (CFB) and NFL. Every ticket is stamped `placed: false, actualStake: 0`
(`src/lib/server/lock-card.ts:1222-1228`). The code read is branch `az-two-book-anytime` at HEAD `8ab9e46`.

**What makes a pick happen.** Nothing picks on its own clock. A pick is made only when something calls a route:

- an outside 15-minute ticker (cron-job.org) calling `/api/scheduler` during UTC hours 15-23 and 0-2
  (`docs/cron-jobs.md:19-22`; the account itself is not in the repo);
- four Vercel crons (`vercel.json:8-25`);
- the owner's Refresh tap (`POST /api/refill`, `app/api/refill/route.ts:46-79`).

The scheduler runs the MLB pass itself and forwards to the two football lock routes on every poke
(`app/api/scheduler/route.ts:129-140`).

**Found mode.** Since 2026-10-03 every date is a "found day" (`src/lib/found-mode.ts:53`). On a found day each
pass appends every bet that qualifies to that day's card, until the day's dollar room is used. The older
selection machinery (shaped slots, top-up caps, block budgets, ticket caps) is bypassed. Since 2026-10-06 every
found bet is a one-leg straight (`src/lib/found-mode.ts:103`) and pitcher outs are off the card (`:146`). Since
2026-11-01 the football EV floor is +1% (`:130-135`).

**Odds.** No request names a sportsbook. Every pull is region-scoped: `regions=us` for player props and
`regions=us,eu` for game lines, so every book in the region arrives. The "market fair" is a weighted median
across all of them: MLB uses Shin de-vig with weights Pinnacle 3, Betfair 2, Matchbook 2, BetOnline 1.5
(`legacy/index.html:1557-1558, 1570-1580`); football uses proportional de-vig with Pinnacle weighted 2 and a
two-book minimum (`src/lib/cfb/model.ts:328, 377-383`).

**Which book a bet is priced at.** DraftKings, always. `SETTLE_BOOK = 'draftkings'`
(`src/lib/sportsbook/books.ts:12`). The MLB engine's variable is still called `CAESARS_KEY` and the fields are
still called `cz*`, but they hold DraftKings prices (`src/engine/index.ts:296-300`). Fields starting `bs` are the
better of DraftKings and FanDuel (`legacy/index.html:1563-1568`); they are used by MLB only as a "must exist"
test and are never the recorded price. Football never reads a FanDuel price for selection or sizing.

**MLB probability.** The legacy engine (`legacy/index.html`, shipped as the generated
`src/engine/legacy-src.gen.ts`) builds its own model probability, then blends it toward the market fair:
`SH_W = {props: 0.35, ml: 0.15, rl: 0.15}` times calibration multipliers with a 0.05 floor
(`legacy/index.html:1738, 1743-1754, 2453-2464`). At lock the blended number is shrunk half-way to the market
again (`shrinkW: 0.5`, `src/lib/paper-mode.ts:192`; `src/lib/shrink.ts:55-87`). Net:
`p_lock = market + 0.5 x w x (model - market)`.

**Football probability.** There is no independent model beyond ESPN FPI. Margin is 0.75 market consensus + 0.25
FPI; moneyline is 0.60 de-vigged moneyline + 0.25 spread-implied + 0.15 FPI (`src/lib/cfb/model.ts:409-463`;
weights `src/lib/cfb/rules.ts:73-74`). Fixed sigma 13.5 (NFL) / 16.5 (CFB) for margin. Player props have no
model at all: the fair is the median of every US book's de-vigged price. Football probabilities are not shrunk
at lock.

**Selection.** MLB: a row must have a DraftKings price, a DK/FD basis price and positive EV at DraftKings after
the shrink (`src/lib/server/lock-card.ts:1149`); home runs, H+R+RBI overs, pitcher outs, started games and
duplicates are dropped (`:1137-1151`); there is no minimum EV and no price cap. Football: EV at DraftKings must
be at least +1%, the price must be no longer than 2.6 decimal (+160), and the game must be ahead
(`src/lib/cfb/found.ts:131-147`).

**Stake.** One formula for all three desks (`src/lib/found-mode.ts:154-172`):
`stake = round(4 x $10,000 x min(0.25 x f*, 0.02))`, minimum $5, maximum $800, trimmed to the day's room. The
4 and the 0.25 cancel, so below the cap this is full Kelly on a constant $10,000. Day room per sport is $2,500
plus that day's profit on tickets already won.

**Storage.** Each desk's whole ledger is one JSON value in Redis (`pl:ledger:v1`, `pl:cfb:ledger:v1`,
`pl:nfl:ledger:v1`), written read-modify-write with a plain SET under a 5-minute lease. Cards are append-only
(`src/lib/append-only.ts:10-43`). The MLB prediction log goes to `pl:pred:<date>`.

**Closing line.** MLB only, and only when a browser with the app open sends a beacon
(`src/lib/ledgerSync.ts:276-289`) or an outside cron calls `/api/clv`; the route is not in `vercel.json`.
Football has no closing-line capture.

**Grading.** Football is settled on the server from ESPN finals (`src/lib/server/football-lock.ts:257-380`).
MLB money tickets are graded only in a browser that has the Ledger tab open (`app/ledger/page.tsx:450-480`),
then synced up. The server never grades them.

**What the owner sees.** Record, profit and ROI are recomputed in the browser from the synced ledger
(`src/lib/ledger-stats.ts:37-83`; football `src/lib/football/store.ts:875-882`).

The two traces below follow one real-shaped pick on each engine, step by step, with the file and line for every
step. They are reproduced from `audit-out/pick-trace.md`, where every cited line was opened.

### 2.2 Life of a pick (trace)

Two picks are followed:

- **MLB**: a pitcher-strikeouts single (stored type `pitcher_strikeouts`, name "K's single").
- **Football**: an NFL game-line single (a spread side), with the college (CFB) and player-prop differences noted.

Audit date is 2026-11-11, so every date switch is ON: found mode (`src/lib/found-mode.ts:53`, 2026-10-03), straight bets only (`:103`, 2026-10-06), pitcher outs off (`:146`, 2026-10-06), football EV floor of 1% (`:130-135`, 2026-11-01).

Naming trap that matters for the whole trace: the engine variable `CAESARS_KEY` and every field starting `cz` (`cz`, `czDec`, `czEv`, `czOdds`) hold the **DraftKings** price. `SETTLE_BOOK = 'draftkings'` (`src/lib/sportsbook/books.ts:12`) is written over the engine's `CAESARS_KEY` at boot (`src/engine/index.ts:296-300`; the engine default is `"williamhill_us"` at `legacy/index.html:888`). Fields starting `bs` are the "basis": the better of DraftKings and FanDuel, DraftKings on a tie (`legacy/index.html:1563-1568`).

#### Part 1. MLB: one pitcher-strikeouts single

##### 1.0 What starts the run

| Step | Evidence |
|---|---|
| An outside 15-minute ticker calls `/api/scheduler`; it is authorised only by the cron header | `app/api/scheduler/route.ts:118,161-168` |
| On a found day the tick uses the found slot list (MLB hourly list) | `app/api/scheduler/route.ts:321-322`; `src/lib/server/grading-progress.ts:191,202` |
| The refill gate fires when the day still has room, a game is still ahead, and that named slot has not run | `src/lib/server/blocks.ts:272-284` |
| The scheduler forwards to `/api/generate?topup=1&slot=<slot>` | `app/api/scheduler/route.ts:370-374`; `src/lib/server/refill.ts:83,90` |
| Second entry point: a manual refresh from the app (sync-key auth) | `app/api/generate/route.ts:117-141,209` |
| Third entry point: the scheduler's "self-check backfill" when no lock exists (see 1.12 item S3) | `app/api/scheduler/route.ts:225-294` |

##### 1.1 Odds fetch

| What | Evidence | Book(s) |
|---|---|---|
| Clock for the whole run is taken once at request start | `app/api/generate/route.ts:144` | n/a |
| Engine is created with the settlement book and a fetcher that calls the Odds API with `cache: "no-store"` | `app/api/generate/route.ts:391-396,81-101` (`:95`) | n/a |
| Slate from MLB statsapi (probable pitchers, lineups, weather, linescore); game phase `pre` / `live` / `done` | `legacy/index.html:1218,1228-1237,1243` | n/a |
| Game lines: one call, `regions=us,eu`, markets `h2h,spreads,totals`, **no `bookmakers=` filter** | `legacy/index.html:1257`; region set at `app/api/generate/route.ts:397-425` | every US and EU book the API returns |
| Props: one call per event (at most 16 events), `regions=us`, markets = standard + alternate lists, plus two extra batter markets appended by the route | `legacy/index.html:1350-1359,1366,1157,1162`; `src/lib/mlb/browse-markets.ts:7-16` | every US book the API returns |
| Each book's `last_update` is copied only into a side table (`bookQuotes`) | `src/lib/sportsbook/mlb.ts:16-73` (`:34`) | all |

The lock code never reads that timestamp: `src/lib/server/lock-card.ts` has no reference to `last_update` or `bookQuotes`, and `legacy/index.html` has no `last_update` (both greps empty). A DraftKings quote that DraftKings itself has not refreshed is treated as live.

##### 1.2 Feature build (pitcher strikeouts)

`legacy/index.html:2268-2284`:

- Strikeouts per start from the last 30 days when there are at least 3 starts, else the season when at least 8 (`:2271-2272`).
- Shrunk toward league rate times a prior (`:2274`), effective sample `nK*20` (`:2275`).
- Opposing lineup strikeout-rate factor, clamped to 0.8 to 1.2 around 0.235, needs at least 5 hitters (`:2279-2280`).
- Umpire, opponent whiff, park and weather factors (`:2282`).
- Result: an expected strikeout count `lam`.

A row is only built when the stats lookup succeeds (`legacy/index.html:2243-2244`). No sportsbook price is used in this step.

##### 1.3 Model probability

`pO = shPOver(row.ln, lam)` (`legacy/index.html:2389`), a Poisson tail: `1 - PoissonCdf(floor(line), lam)` (`:1543`). The game simulation replaces this only for H+R+RBI and for live rows (`:2392-2404`), so a pregame strikeout row is plain Poisson. No sportsbook price is used.

##### 1.4 Market (no-vig) probability

| What | Evidence | Book(s) |
|---|---|---|
| For each book quoting both sides at the row's line, a two-way fair probability by the Shin method | `legacy/index.html:1414,1570-1574` | every book in the pull |
| Row fair = weighted median of those per-book fairs. Weights: pinnacle 3, betfair_ex_eu 2, matchbook 2, betonlineag 1.5, everything else 1 | `legacy/index.html:1431-1435,1557-1558,1576-1580` | every book in the pull, DraftKings and FanDuel count 1 each |
| `nv = row.fair` (falls back to a plain two-way de-vig of the best prices) | `legacy/index.html:2451` | consensus |

So the "market probability" is **not** a DraftKings/FanDuel number. It is a consensus of all books returned, in which DraftKings and FanDuel are two voices among several. For props the pull is `regions=us`, so the sharp-weighted names only count if the API returns them in the US region (not determined from disk).

##### 1.5 Blend, side, edge and EV

| What | Evidence | Book |
|---|---|---|
| Blend weight for props starts at 0.35 and can only be shrunk by calibration, floor 0.05 | `legacy/index.html:1738,1743-1754,2453` | n/a |
| `pAdj = w*pO + (1-w)*nv`, with an extra shrink on the under side | `legacy/index.html:2459-2464` | consensus |
| Side chosen by which side the blended probability favours | `legacy/index.html:2471-2477` | consensus |
| `edge = p - imp` (blended probability minus consensus fair) | `legacy/index.html:2493` | consensus |
| Row carries the best price across all books (`odds`, `book`), the DraftKings price (`cz`), and the DK/FD basis (`bs`, `bsBook`) | `legacy/index.html:2478,2497-2506` | best-of-all, DraftKings, DK/FD |
| `ev`, `kellyF` at the best price; `czEv`, `czKellyF` at DraftKings; `bsEv` at the basis | `legacy/index.html:2513-2573` (`:2526-2527,2530-2533,2537-2539`) | as named |
| **Only the top 50 rows per market by win probability are kept** (not by EV) | `legacy/index.html:2517-2518` | n/a |
| Board row book stamp | `src/lib/sportsbook/mlb.ts:71-72` | DraftKings |

Stored example (real archived row, `data/boards/2026-10-15.latest.json.gz`, board stamp `at = 1792105213228`): `label "Tyler Glasnow (LAD)"`, `sub "Pitcher K's O 6.5"`, `lkey "tylerglasnow|pitcher_strikeouts|6.5"`, `pModel 72.7`, `implied 41.7`, `wBlend 0.167`, `prob 46.9`, best price `+125` at `BetOnline.ag`, `cz 126` (DraftKings), `czEv 6`, `bs 114` with `bsBook "FD"`, `bsEv 0.3`, `settlementBook "draftkings"`; `gameInfo` for that game: `pk 849810`, `start 2026-10-16T00:00:00Z`. Two things this row shows on its own:

1. The blend weight in production was 0.167, not 0.35. The model said 72.7%, the market 41.7%, the board row 46.9%.
2. DraftKings (+126) was better than the "best price" column (+125). The DraftKings quote can come from the alternate ladder when the standard market is missing (`legacy/index.html:1418-1419`), so "best" and "DraftKings" are not always read from the same market.

##### 1.6 Selection (which rows become bets)

All in `src/lib/server/lock-card.ts`:

| Rule | Evidence | Book |
|---|---|---|
| Pool of straight candidates from the board rows; live and suspended rows dropped; needs a DraftKings price **and** a DK/FD basis | `:147-206` (`:152,158`) | DraftKings + DK/FD |
| Ticket EV recomputed at the DraftKings price (`czEv = evAt(prob, czDec)`), DraftKings decimal rounded to 2 places | `:181,194`; `src/lib/shrink.ts:50-53` | DraftKings |
| Every candidate is shrunk again halfway to the market: `p2 = 0.5*p + 0.5*imp` | `:1106-1116`; `src/lib/shrink.ts:55-87` (`:63`); weight at `src/lib/paper-mode.ts:191-192` | consensus |
| Dropped if: id already on today's card, started or live or no game key, home runs, H+R+RBI overs, pitcher outs, `czEv <= 0`, missing DraftKings or basis price | `:1137-1151` | DraftKings |
| "Started" means the stored start time is unknown or `<= now` (the request-start clock) | `:1099-1103` | n/a |
| Day-level duplicate guards: same leg text (`label|prop`), same `player|market`, same game for ML/RL | `:1006-1013,1119-1132` | n/a |
| Order: EV at DraftKings, then probability, then id | `:1152` | DraftKings |
| Under-share cap and fit-the-day checks | `:1155-1172`; `src/lib/under-bias.ts:20` | n/a |

Net effect on the probability that decides a strikeout bet: `p_lock = market + 0.5 * w * (model - market)` with `w` at most 0.35 (0.167 in the archived row). The model's own opinion moves the number by at most 17.5% of its disagreement with the market; the rest of any positive EV comes from the DraftKings price being longer than the consensus fair.

##### 1.7 Stake

`src/lib/found-mode.ts`:

- `f* = (p*dec - 1)/(dec - 1)` (`:154-158`).
- `stake = round(4 * 10000 * min(0.25*f*, 0.02))`, trimmed to the day's room, zero if under $5 (`:165-172`; constants `:55-73`). Maximum $800 (`:76`).
- Day ceiling $2,500 per sport plus same-day won profit (`:295-297`; MLB won profit read at `app/api/generate/route.ts:634` via `src/lib/server/mlb-day-won.ts:58-84,122-140`).
- Called at `src/lib/server/lock-card.ts:1183,1190-1193` with the shrunk probability and the **DraftKings** decimal.

Illustration only (my arithmetic applying the cited formulas to the archived row above; there is no ledger export on disk, so whether this ticket was actually written could not be determined): shrunk probability `0.5*46.9 + 0.5*41.7 = 44.3`; DraftKings decimal 2.26; EV `0.443*2.26 - 1 = +0.1%`; `f* = 0.00094`; stake `round(40000 * 0.25 * 0.00094) = $9`. The board showed +6% EV at DraftKings; the lock-time number was +0.1%.

##### 1.8 Storage

| What | Evidence |
|---|---|
| Lease `pl:found:lease:<date>` (SET NX, 300,000 ms) taken before the lock; the run throws if it is held | `src/lib/server/found-lease.ts:14-33`; `app/api/generate/route.ts:582-587,689-692` |
| Ticket id is a hash of the sorted leg texts only: no date, no game key, no price | `legacy/index.html:2985-2987` |
| Stored ticket: `{id, stake, prob, probRaw, czDec, czEv, czEvRaw, bsDec, bsEv, bsEvRaw, name, type, tier, legs:[{lkey, label, prop, cz, gkey}], paper:true, settlementBook, found:true, foundAt: now, paperPolicy, placed:false, actualStake:0}` | `src/lib/server/lock-card.ts:1207-1229` (`:1221` leg shape, `:1096` book) |
| Entry: one object per date with `core`, `games {gkey: {pk, start}}`, `lockedAt` (first lock of the day), `trigger` (overwritten each run), `source:"server-lock"`, `selMode:"found"` | `src/lib/server/lock-card.ts:1258-1294` |
| Write: GET the whole ledger blob, merge, plain SET to key `pl:ledger:v1` (no compare-and-set) | `src/lib/server/lock-card.ts:63,1301-1324` |
| Append-only guard compares ticket id and stake only | `src/lib/append-only.ts:10-16,28-43` |
| Second, separate record of the same pick: every board row is also written to `pl:pred:<date>` and the date added to `pl:pred:days` | `app/api/generate/route.ts:71-73,738-764` |
| Third copy: the whole board (with the row) is stored under the board keys | `app/api/generate/route.ts:518-552` |

Stored price: DraftKings (`cz` per leg in American odds, `czDec` per ticket rounded to 2 decimals). The FanDuel/basis price is stored only as `bsDec` and `bsEv`. **Not stored on the ticket leg**: the consensus fair (`imp`), the model probability, the quote timestamp, the number of books.

##### 1.9 Closing line capture

| What | Evidence | Book |
|---|---|---|
| Route `/api/clv`: today's locked entry only; legs whose game starts within the next 45 minutes | `app/api/clv/route.ts:37,74-78`; `src/lib/server/clv-core.ts:63-91` | n/a |
| Rate limit: one run per 25 minutes, the stamp is written **before** the work | `app/api/clv/route.ts:41,66-70` | n/a |
| Fetches through the app's own odds proxy, which caches 240 seconds | `app/api/clv/route.ts:48-55`; `app/api/odds/route.ts:20-21,46-54` | n/a |
| Per-event call asks for `<market>` and `<market>_alternate` for every pending prop leg | `src/lib/server/clv-core.ts:96-107`; `app/api/clv/route.ts:107-108` | n/a |
| Sighting = the settlement book's price (`am`), a consensus fair (plain proportional de-vig, plain median, at least 2 books) and the DK/FD basis | `src/lib/server/clv-core.ts:19-30,49-56,131-209` | DraftKings for `am`; all US books for the fair |
| Saved into `entry.clv[label|prop]` by GET, merge, plain SET; silently skipped when the blob is too large | `app/api/clv/route.ts:120,131-139` | n/a |
| Callers found in code: only the browser beacon (every 15 minutes while the app is open) | `src/lib/ledgerSync.ts:276-289` | n/a |

Not in `vercel.json`, not forwarded by the scheduler. A document mentions an outside 30-minute cron for it (`docs/session-handoff.md:2016`); that is a document claim, not code.

Defects on this step (all read from code):

- The odds proxy only allows three alternate markets (`src/lib/server/odds-shape.ts:20-41,49-55`: hits, strikeouts, home runs). The CLV request adds `_alternate` to every prop market, so a game with any pending total-bases, H+R+RBI or outs leg sends a market the proxy rejects with 403, and **no prop leg in that game gets a close**. A strikeout-only game is not affected.
- The lock-time fair uses Shin plus sharp weights (`legacy/index.html:1570-1580`); the closing fair uses proportional plus a plain median (`src/lib/server/clv-core.ts:49-56`). The two are not the same measurement.
- The fair-probability CLV needs the locked leg's `imp` (`src/lib/clv-report.ts:66-68`), which found tickets do not store (`src/lib/server/lock-card.ts:1221`). For found tickets only the DraftKings price CLV (`czCents`, `src/lib/clv-report.ts:69`) can be computed.
- When two copies of a day are merged, the base copy's sighting wins per leg; a later sighting does not reliably replace an earlier one (`src/lib/ledger-merge.ts:1499-1509,1589-1591`). "Closing" can therefore be a price from up to 45 minutes before first pitch.

##### 1.10 Grading

| What | Evidence |
|---|---|
| Nothing on the server grades a locked MLB ticket (stated in code) | `src/lib/server/mlb-day-won.ts:9-13` |
| The scheduler's grade forward is for the prediction store, not the money ledger | `app/api/scheduler/route.ts:340,417-422` |
| Grading runs **on the device** when the Ledger page is opened and an entry is not done | `app/ledger/page.tsx:450-480`; `src/lib/useLedger.ts:109` |
| `shGrade`: statsapi schedule, boxscore per final game, one result per `label|prop` | `legacy/index.html:3677-3713` (`:3699-3701`) |
| Strikeout leg: the pitcher must have started, else void; `strikeOuts` against the line, push on equality | `legacy/index.html:3578-3637` (`:3616-3621`) |
| Game id for the box comes from `entry.games[leg.gkey].pk`; missing id makes the leg ungradable | `legacy/index.html:3579-3580` |
| Payout = `stake * czDec` (or a user-confirmed price), 2-decimal rounding | `legacy/index.html:3638-3655` (`:3645,3654`) |
| Result reaches the store only through the device's `PUT /api/ledger` | `src/lib/ledgerSync.ts:155-274`; `app/api/ledger/route.ts:83-150` |

Settle price: the stored DraftKings decimal (2 places).

##### 1.11 Profit in the UI

| What | Evidence |
|---|---|
| `ledgerStats`: pending and ungradable tickets are not counted as staked; won adds the stored payout; push returns the stake | `src/lib/ledger-stats.ts:37-83` |
| Ledger page tiles: Net P/L, ROI, CLV average and "legs sighted" | `app/ledger/page.tsx:433-434,653-662,679-683` |
| Bankroll = base + moves + realised P/L | `src/lib/bankroll.ts:30,101-124` |
| CLV panel | `src/lib/clv-report.ts:50-87`; `src/components/stats/ClvPanel.tsx:65-80` |

Everything is paper (`paper:true, placed:false, actualStake:0`, `src/lib/server/lock-card.ts:1207-1229`). Profit is recomputed at render from stored grades at the stored DraftKings price.

##### 1.12 MLB: where a pick can be recorded twice, after the start, or at a stale price

**Recorded twice**

- T1. Ticket id has no date, game or price (`legacy/index.html:2985-2987`). A moved line gives a new id and a new leg text; the only thing stopping a second bet on the same player and market is the `player|market` guard (`src/lib/server/lock-card.ts:1006-1011`).
- T2. The top-up claim is GET then SET, described in code as not atomic (`app/api/generate/route.ts:245-269`, comment at `:263`).
- T3. The found lease lasts 300,000 ms and the route may run 300 seconds (`src/lib/server/found-lease.ts:14`; `app/api/generate/route.ts:42`). A run that outlives its lease can overlap the next.
- T4. Three writers rewrite the whole ledger blob with a plain SET and no version check: the lock (`src/lib/server/lock-card.ts:1301-1324`), `/api/clv` (`app/api/clv/route.ts:131-139`) and the device PUT (`app/api/ledger/route.ts:126-149`). A write landing between another writer's read and write is lost or re-merged.
- T5. The same pick also lives in `pl:pred:<date>` (`app/api/generate/route.ts:738-764`). Any report that reads both stores counts it twice.
- T6. `label|prop` is the key for grading and for CLV and has no game key (`legacy/index.html:3639,3699-3701`; `src/lib/server/clv-core.ts:78-79`). In a doubleheader the same pitcher/line text in both games shares one result. The day-level leg guard prevents two such tickets on one date.
- T7. A later run overwrites `games[gkey]` (`src/lib/server/lock-card.ts:1284`), so the game id the grader uses can change after the bet is stored.

**Recorded after the event started**

- S1. `now` is taken at request start (`app/api/generate/route.ts:144`) and used for the started test and `foundAt` after the full odds collection (`:445`, up to the 300-second budget). A game that starts during the run is still treated as pregame, and `foundAt` is earlier than the real write time.
- S2. The engine's own "pre" flag counts warmup, delayed start and "inning < 1" as pregame (`legacy/index.html:1232`).
- S3. Backfill path: when no lock exists, the scheduler builds the card from the **stored board** with no new fetch, as long as the board is at most 30 minutes old (`app/api/scheduler/route.ts:234-243,247-269`). Start times and prices are those of the stored board.
- S4. Started-game boards are "Recorded, never enforced" at the generate route (`app/api/generate/route.ts:454-462`); enforcement is only the per-ticket test in S1.

**Recorded at a stale price**

- P1. No check of the book's own `last_update` anywhere in the MLB lock (section 1.1).
- P2. S3 above: a bet can be written at a DraftKings price up to 30 minutes old.
- P3. The stored price is the DraftKings quote at collection time; the write happens later in the same run (up to minutes on a long slate). No re-quote before the write.
- P4. The DraftKings quote may come from the alternate ladder (`legacy/index.html:1418-1419`); see the archived row where DraftKings beat the "best price" column.
- P5. `czDec` is rounded to 2 decimals before it is stored and is the settle price (`src/lib/server/lock-card.ts:194`; `legacy/index.html:3645`).

---

#### Part 2. Football: one NFL spread single

##### 2.0 What starts the run

| Step | Evidence |
|---|---|
| The scheduler forwards to the CFB and NFL lock routes on every tick, before the MLB tick | `app/api/scheduler/route.ts:129-140`; `src/lib/server/nfl-lock-forward.ts:25-44` |
| Two extra Sunday crons call the NFL lock route directly (`vercel.json`: `0 16 * * 0` and `0 17 * * 0`) | `vercel.json` |
| Route auth: cron header | `app/api/nfl/lock/route.ts:105-112` |
| Clock for the whole run taken once at request start | `app/api/nfl/lock/route.ts:119` (CFB: `app/api/cfb/lock/route.ts:295`) |
| Before any locking: previous-date sweep and the settle pass | `app/api/nfl/lock/route.ts:138,143` |
| Found day with an existing entry: `foundPassDate` on the football found slot (15-minute list) | `app/api/nfl/lock/route.ts:153-187`; `src/lib/server/grading-progress.ts:192,202` |
| Found day with no entry yet: `foundFirstLock` | `app/api/nfl/lock/route.ts:206-226`; `src/lib/server/football-lock.ts:794-888` |
| Route budget 60 seconds | `app/api/nfl/lock/route.ts:76`; `app/api/cfb/lock/route.ts:225` |

##### 2.1 Odds fetch

| What | Evidence | Book(s) |
|---|---|---|
| ESPN scoreboard (date and next date), cached 60 seconds | `src/lib/cfb/slate-server.ts:46,64-78` | n/a |
| ESPN FPI team ratings, cached 6 hours | `src/lib/cfb/slate-server.ts:47,85-93` | n/a |
| Odds API: one call, `regions=us,eu`, markets `h2h,spreads,totals`, no `bookmakers=` filter | `src/lib/nfl/rules.ts:170,294-295`; `src/lib/cfb/rules.ts:367` | every US and EU book returned |
| The fetch is `cache:"no-store"` only when `fresh` is passed; otherwise it uses the framework data cache with `revalidate: 240` | `src/lib/cfb/slate-server.ts:48,107-120` (`:111`) | n/a |
| **The lock path never passes `fresh`**: the feed wrapper takes no options | `src/lib/server/football-lock.ts:69-75` (`:72`), used at `:710` and `:810` | n/a |
| Only the board-view routes pass `fresh` (on a manual refresh) | `app/api/nfl/route.ts:66`; `app/api/cfb/route.ts:61` | n/a |
| ESPN game joined to the odds event by team names, then nearest kickoff, within a 3-hour window for the fuzzy tier | `src/lib/cfb/model.ts:598-604`; `src/lib/cfb/names.ts:145-187`; `src/lib/nfl/rules.ts:70` | n/a |
| A book's `last_update` is parsed but never read by the model | `src/lib/cfb/names.ts:22,62` (only hits for `last_update` under `src/lib/cfb`, `src/lib/football`, `src/lib/nfl`, `football-lock.ts`, `football-props.ts`) | n/a |
| Each slate build also overwrites a snapshot key `pl:discovery:<sport>:<date>` (expires after 129,600 s) | `src/lib/cfb/slate-server.ts:160` | all |

##### 2.2 Feature build

There is no team-stat model. The inputs are the market itself and ESPN FPI (`src/lib/cfb/model.ts:409-463`):

- Per book: moneyline home probability; spread turned into an implied margin `mu = -line + sigma * normInv(p)`; total into an implied total (`:339-375`).
- Consensus = weighted median, Pinnacle weight 2, all others 1, at least 2 books (`:328,377-383,415-419`; `src/lib/nfl/rules.ts:66-67`).
- FPI margin = home FPI minus away FPI plus home-field (2.0 NFL, 2.6 CFB) unless neutral site (`:420`; `src/lib/nfl/rules.ts:63`; `src/lib/cfb/rules.ts:72`).
- Expected margin = 0.75 market + 0.25 FPI (`:440-455`; `src/lib/nfl/rules.ts:65`; `src/lib/cfb/rules.ts:74`).
- Home win probability = 0.60 de-vigged moneyline + 0.25 spread-implied + 0.15 FPI, over whatever exists (`:422-438`; `src/lib/nfl/rules.ts:64`; `src/lib/cfb/rules.ts:73`).
- Expected total = the market consensus total only (`:458`).

Books: every book in the pull feeds the consensus, DraftKings and FanDuel included.

##### 2.3 Model probability

Normal margin model: `coverProb(mu, sigma, line)` with a push band on whole-number lines (`src/lib/cfb/model.ts:76-83,100-113`). Sigma 13.5 NFL (`src/lib/nfl/rules.ts:61-62`), 16.5 margin / 18 total CFB (`src/lib/cfb/rules.ts:70-71`).

For a spread, the probability is evaluated **at DraftKings' own line** when pricing DraftKings (`src/lib/cfb/model.ts:510-516`).

##### 2.4 Market (no-vig) probability

- Per book: proportional de-vig of the two prices (`src/lib/cfb/model.ts:352,359,367`; `src/engine2/devig.ts:17-20`). Not Shin (MLB uses Shin).
- Row field `mkt` = cover probability from the consensus margin at the consensus line (`src/lib/cfb/model.ts:479-484,545`).
- It is shown on the board but **does not enter the bet's EV**: EV is the blended model probability against the DraftKings price.

##### 2.5 Edge and EV

- `evCz = evPct(win, push, DraftKings decimal)` (`src/lib/cfb/model.ts:116-119,510-516`).
- `playable = DraftKings quote exists && game upcoming && kickoff > now` (`src/lib/cfb/model.ts:465-466,518`).
- The row also carries `best` (best price across all books at that line), `dk`, `fd`, `pin` (`:393-407,548-552`).
- Because the expected margin is 75% market consensus, a positive EV at DraftKings comes from two sources only: DraftKings' line or price sitting off the consensus median, and the 25% FPI share.

Book: DraftKings (`settleBook: "draftkings"`, `src/lib/nfl/rules.ts:68`, `src/lib/cfb/rules.ts:77`; a stale comment at `src/lib/cfb/rules.ts:33` still says Caesars). **FanDuel is never used to price, select, stake or settle a football bet.** It is only displayed.

##### 2.6 Selection

`src/lib/cfb/found.ts`:

| Rule | Evidence |
|---|---|
| Rows of games with kickoff after `now`, `playable`, a DraftKings quote, not a first-half market, `evCz >= min(rules floor, 1)%`, DraftKings decimal at most 2.6 | `:131-147` (`:138`); `src/lib/found-mode.ts:133-135`; `src/lib/nfl/rules.ts:38,41` |
| Straight days: one leg only | `:143` |
| Sorted by EV, then probability, then leg key | `:146`; `src/lib/cfb/card.ts:168` |
| One bet per game and "family": spread and moneyline share the family "side"; totals are their own; props are `player|market` | `:49-60,181` |
| Player-prop singles (NFL): DraftKings price, half-point lines, the props pull stamp at most 30 minutes old | `:84-126` (`:90,95-99`) |
| Props are attached only in the day's first found lock, not on later passes | `src/lib/server/football-lock.ts:834`; `app/api/nfl/lock/route.ts:220-222` |

No shrink toward the market is applied at lock (MLB applies 0.5).

##### 2.7 Stake

Same found-mode formula as MLB: `foundStake(d.prob, d.dec, room)` (`src/lib/cfb/found.ts:178-185`; `src/lib/found-mode.ts:154-172`). `d.dec` is the DraftKings decimal and `d.prob` is `win / (1 - push)` from the leg (`src/lib/cfb/card.ts:124-138`). Ceiling $2,500 per sport per day plus same-day won profit (`src/lib/cfb/found.ts:173-176`; `src/lib/server/football-lock.ts:691-694`).

Small inconsistency: the candidate filter uses the push-aware `evCz`, while the stored EV and the stake use the push-conditional probability (`src/lib/cfb/card.ts:135,137`), which is slightly higher on whole-number lines.

##### 2.8 Storage

| What | Evidence |
|---|---|
| Lease `pl:<sport>:found:lease:<date>` (SET NX, 300,000 ms) | `src/lib/server/football-lock.ts:644-663,704-707` |
| Ledger re-read under the lease before planning | `src/lib/server/football-lock.ts:724-736` |
| Ticket id is ordinal: `<prefix>-<date>-found-<n>` | `src/lib/cfb/found.ts:187-194` |
| Stored ticket: `{id, bucket:"core", name, stake, czOdds, czDec (4 decimals), prob, czEv, legs:[{label, prop, cz, gkey, lkey, market, side, line, teamId, prob, push}], found:true, foundAt: now, paperPolicy}` | `src/lib/cfb/card.ts:93-122,154-166`; `src/lib/cfb/found.ts:195-200` |
| Entry games map `{pk, start, home, away}`; an existing game record wins over the new one | `src/lib/cfb/found.ts:215-223,310` |
| Write on later passes: the date's entry is replaced in the array and the blob is written with a plain SET to `pl:nfl:ledger:v1` (CFB: `pl:cfb:ledger:v1`) | `src/lib/server/football-lock.ts:755-759`; `app/api/nfl/lock/route.ts:82-85` |
| First lock of the day: re-read, merge, SET | `src/lib/server/football-lock.ts:869-875` |

Stored price: DraftKings American odds per leg (`cz`) and the line DraftKings offered. **Not stored**: a book name on the ticket (no `settlementBook` anywhere under `src/lib/cfb`, `src/lib/football`, `src/lib/nfl`; grep empty), the consensus probability, the FanDuel price, the time the quote was fetched.

##### 2.9 Closing line capture

**Not found.** There is no closing-line or CLV capture for football. A search for `clv` / `closing` under `src/lib/cfb`, `src/lib/nfl`, `src/lib/football`, `app/api/nfl`, `app/api/cfb`, `src/components/cfb`, `src/components/football` returns only comments and the generic entry type's field name. `/api/clv` reads only the MLB key (`app/api/clv/route.ts:36`).

The snapshot key in 2.1 is overwritten on each build and expires; nothing reads it back against a ticket (its only reader is `app/api/discovery/route.ts:18`). There is no football archive in `pl-history` (no file name under `data/` contains nfl, cfb or football). With no stored consensus, no stored quote time and no close, a football bet's price quality cannot be measured after the fact from anything on disk.

##### 2.10 Grading

| What | Evidence |
|---|---|
| Server: `settlePass` runs on every lock-route call, at most 2 dates per call, from ESPN finals | `src/lib/server/football-lock.ts:257-380` (`:303,314-318,374`); `src/lib/nfl/rules.ts:131` |
| NFL player-prop finals attached for prop legs | `src/lib/server/football-lock.ts:316` |
| Spread: `margin + line`, push at zero; moneyline tie is a push | `src/lib/cfb/grade.ts:140-165` |
| A leg still pending past the void window becomes ungradable | `src/lib/cfb/grade.ts:335-338` |
| Payout = stake times the product of the standing legs' stored DraftKings prices | `src/lib/cfb/grade.ts:348-363` (`:356`) |
| Device: the Ledger view also grades pending entries and syncs them up | `src/components/cfb/CfbLedger.tsx:571-592,865-880`; `src/lib/football/store.ts:1110-1114`; `app/api/nfl/ledger/route.ts:77-121` |

Settle price: the stored DraftKings price and line.

##### 2.11 Profit in the UI

`compute` builds the snapshot (`src/lib/football/store.ts:875-882`) from the shared `ledgerStats` (`src/lib/cfb/ledger.ts:56-63`; `src/lib/ledger-stats.ts:37-83`) and the bankroll helper (`src/lib/bankroll.ts:119-124`). Rendered as Net P/L, ROI, Record, Max drawdown and bankroll tiles (`src/components/cfb/CfbLedger.tsx:856-863,955-962`). No CLV tile exists for football.

##### 2.12 Football: where a pick can be recorded twice, after the start, or at a stale price

**Recorded twice**

- T1. Ids are ordinal (`src/lib/cfb/found.ts:190`). Two writers working from the same stored state would mint the same id for different bets; the lease is the only guard.
- T2. Later passes write by replace-and-SET (`src/lib/server/football-lock.ts:757-759`). A device PUT (`app/api/nfl/ledger/route.ts:98-116`) or a settle write (`src/lib/server/football-lock.ts:374`) landing between the re-read and the SET is overwritten.
- T3. The NFL lock route has three callers on a Sunday (ticker forward plus two Vercel crons). All go through the same lease.
- T4. Spread and moneyline on one game count as one family, so a second "side" bet is blocked; a total and player props on the same game are allowed by design (`src/lib/cfb/found.ts:49-60`).
- T5. Fun-bucket legs are not counted in the used set (`src/lib/cfb/found.ts:63-67`).

**Recorded after the event started**

- S1. `now` is the request-start clock (`app/api/nfl/lock/route.ts:119`), used for the kickoff test and `foundAt` (`src/lib/cfb/found.ts:134,198`) after the sweep, the settle pass, the ESPN read and the odds read. The write can land up to the 60-second budget later.
- S2. ESPN status and kickoff time can be 60 seconds old (`src/lib/cfb/slate-server.ts:46,66`).

**Recorded at a stale price**

- P1. Game-line prices in the lock path come from the cached odds call (`revalidate: 240`), never a fresh one (2.1). By the code's own TTL that is up to 240 seconds old. Whether the cache can serve an older copy than its TTL when no other request has refreshed it depends on the framework's cache behaviour in production and was not measured.
- P2. No check of the book's own `last_update` (2.1).
- P3. Player-prop quotes are accepted up to 30 minutes old (`src/lib/cfb/found.ts:99`).
- P4. No quote time is stored on the ticket, so staleness cannot be audited afterwards.

---

#### Part 3. Which sportsbook's price is used, step by step

| Step | MLB | Football |
|---|---|---|
| Odds fetch | all books in `us,eu` (lines) / `us` (props), no filter | all books in `us,eu`, no filter |
| Market fair | Shin per book, weighted median (Pinnacle 3, Betfair 2, Matchbook 2, BetOnline 1.5) | proportional per book, weighted median (Pinnacle 2) |
| Model probability | own model, blended toward the consensus fair, then shrunk again at lock | 75% market consensus + 25% FPI |
| Edge/EV that decides the bet | DraftKings price | DraftKings price |
| Second-book requirement | a DK/FD basis must exist (in practice always true when DraftKings exists) | none |
| Stake | DraftKings decimal | DraftKings decimal |
| Stored price | DraftKings (`cz`, `czDec`), basis kept as `bsDec` | DraftKings (`cz`, line) |
| Closing line | DraftKings price + all-US-book fair (MLB only) | not captured |
| Settle | stored DraftKings decimal | stored DraftKings price |

Against the Arizona constraint (DraftKings and FanDuel only): every recorded bet is priced, staked and settled at DraftKings. FanDuel is never the recorded price on either engine, even when it is better (MLB keeps the better of the two only as an unused "basis"; football ignores it). The "market" the bets are judged against is a multi-book consensus that includes offshore and exchange books.

---

## 3. Every limit on when and how many picks are made

Source: `audit-out/map-selection-staking-limits.md` (80 numbered limiters, each opened in the code at HEAD
`8ab9e46`). The cron-job.org account is not in the repo; its schedule is cited from the repo's docs and comments
only.

How to read the verdict column:

- **KEEP (integrity)** — protects the record or the money invariants: auth, double-spend, double-lock,
  append-only, no bets on started games, hard money assertions.
- **KEEP (policy)** — a deliberate owner risk or model-trust choice. It is not an integrity guard, but removing
  it is not an "artificial limit" call either. The number is the owner's to set. Where a finding says the number
  is wrong, the finding ID is given.
- **REMOVE (artificial)** — a historical or arbitrary restriction on when or how many picks are made. Nothing
  about integrity depends on it.
- **REMOVE (inert)** — still in the code, has no effect on a found day (bypassed, set to infinity, or never
  wired). Dead code that makes the system read as more restricted than it is, and that would silently re-arm if
  found mode were ever switched off.
- **SPLIT** — one rule with an integrity part and an artificial part; both are named.
- **N/A** — listed in the map for completeness; not a limiter on picks.

Tally of the 80 limiters as first written: 31 KEEP (integrity), 13 KEEP (policy), 11 REMOVE (artificial), 11 REMOVE (inert), 7 SPLIT, 7 N/A. Section 9.5 corrects row 76 and adds limiters 81 and 82.

### 3.1 The staking rule the limits sit around

`src/lib/found-mode.ts:154-172`: `stake = round(kellyMult x bankroll x min(kellyFrac x f*, kellyCap))` with
`kellyMult 4`, `kellyFrac 0.25`, `kellyCap 0.02`, `bankroll 10000`, `minStake 5`, maximum $800
(`found-mode.ts:63-76`). The 4 cancels the 0.25, so below the cap the stake is full Kelly on a constant $10,000.
Day room = $2,500 + that day's profit on won tickets - stakes already on the card (`found-mode.ts:58, 175-178,
295-297`). There is no cap on the number of tickets on a found day; the only count limits are dollars, the
dedupe rules below, and what the board offers.

The same function is fed differently by sport:

| Path | Probability fed in | Edge gate | Price cap |
|---|---|---|---|
| MLB found (`lock-card.ts:1183`) | blended model probability shrunk 50% toward market (`lock-card.ts:1106-1116`) | `czEv > 0`, no minimum (`lock-card.ts:1149`) | none |
| Football found (`cfb/found.ts:180`) | model / fair probability, not shrunk | EV at DraftKings >= +1% since 2026-11-01, +2% before (`found-mode.ts:130-135`) | 2.6 decimal (`cfb/rules.ts:49`, `nfl/rules.ts:41`) |

### 3.2 Triggers (limiters 1-9)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 1 | Outside ticker runs only UTC hours 15-23 and 0-2, every 15 minutes (07:00-18:45 PT in standard time) | `docs/cron-jobs.md:19-22, 850-870, 63-65`; comment `src/lib/server/grading-progress.ts:20-22` | Every automatic pick outside that window (overnight, early morning). The doc says widening is an account setting, not a code change, and that the job count sits just under the free tier's 100/day. | REMOVE (artificial) |
| 2 | Exactly four Vercel crons: scheduler 21:45 and 00:00 UTC daily; NFL lock 16:00 and 17:00 UTC Sundays. No CFB cron. | `vercel.json:8-25` | Nothing by itself; they are backups inside the ticker's own window. | KEEP (integrity: safety net). As a schedule they add no cadence; see E1-5. |
| 3 | Scheduler forwards to both football lock routes on every poke; slot name only on the five refill slots; 25 s forward timeout | `app/api/scheduler/route.ts:134-137`; `src/lib/cfb/rules.ts:127`; `src/lib/nfl/rules.ts:106` | Nothing | KEEP (integrity) |
| 4 | Manual Refresh with the sync phrase runs a real found pass; never refused on "slot already ran" | `app/api/refill/route.ts:46-53, 68-79`; `src/lib/server/blocks.ts:280` | Nothing. This is the "any time" path that already exists. | KEEP (integrity) |
| 5 | Auth fails closed: secret unset -> 503, wrong key -> 401, store env missing -> 503 | `app/api/scheduler/route.ts:118, 161-168`; `app/api/cfb/lock/route.ts:281-288`; `app/api/nfl/lock/route.ts:105-110`; `app/api/generate/route.ts:119-141`; `app/api/refill/route.ts:46-48` | Unauthenticated spending or locking | KEEP (integrity) |
| 6 | No odds key -> 503 on generate | `app/api/generate/route.ts:141` | A pass with no prices | KEEP (integrity) |
| 7 | Device locks refused on found days | `src/lib/football/store.ts:1094` | The owner hand-locking a football card from the phone | KEEP (integrity: one writer). Side effect: the Builder cannot add to the record. |
| 8 | Board-only MLB re-price (`?live=1`) never locks | `app/api/generate/route.ts:199, 577-580` | Nothing by design | KEEP (integrity) |
| 9 | Deploys do not come from git | `vercel.json:3-6` | Not a pick limiter. A change to any limit below needs a manual deploy. | N/A |

### 3.3 Slot tables and time windows (limiters 10-20)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 10 | Legacy refill/grade slots 08:00, 09:30, 12:00, 15:00, 16:45 PT with a 15-minute window | `src/lib/server/grading-progress.ts:55, 57, 116, 119-131, 154-167` | No longer paces picks on found days. Still paces grading and decides whether the scheduler passes a slot name to football. | REMOVE (inert) as a pick limit; the grading use stays (see E1-6 for its no-catch-up window). |
| 11 | MLB found slots: hourly 08:00-18:00 PT, 11 passes a day | `src/lib/server/grading-progress.ts:191`; used `app/api/scheduler/route.ts:322` | MLB picks between the hours and before 08:00 / after 18:15 PT. Stated reason is cost: a full generate is 114-150 Odds credits (`grading-progress.ts:169-185`). | REMOVE (artificial). Replace with a cadence tied to time-to-start (E2-3). |
| 12 | Football found slots: every 15 minutes 08:00-18:45 PT, 44 passes | `src/lib/server/grading-progress.ts:192`; `app/api/cfb/lock/route.ts:353-360`; `app/api/nfl/lock/route.ts:169-176` | Football adds before 08:00 PT and after 19:00 PT even if the ticker were widened. In standard time the 07:00-07:45 PT pokes cannot add to an open card. | REMOVE (artificial) |
| 13 | Routes reject a slot name that is not in the tables | `app/api/generate/route.ts:212-214`; `app/api/cfb/lock/route.ts:352`; `app/api/nfl/lock/route.ts:168` | Bad input | KEEP (integrity: input validation). Must be changed together with 10-12. |
| 14 | Football first lock only within 60 minutes of first kickoff, or on a found day when an opener exists; otherwise "waiting". No slate -> nothing. | `src/lib/cfb/lock-server.ts:94-102`; `src/lib/cfb/rules.ts:126`; `src/lib/nfl/rules.ts:105`; `app/api/cfb/lock/route.ts:393-420`; `app/api/nfl/lock/route.ts:206-225`; `src/lib/server/football-lock.ts:896-902` | An early first card | SPLIT: REMOVE (artificial) the 60-minute rule; KEEP (integrity) "no slate -> nothing". |
| 15 | NFL London/Germany 13:30 UTC kickoffs are before the first ticker poke (15:00 UTC) | `docs/cron-jobs.md:872-900`; `app/api/nfl/lock/route.ts:56-61` | Any pick on those games | REMOVE (artificial); follows from limiter 1. See E1-10. |
| 16 | MLB first board of a block fires only when achievable coverage >= 0.8 and ready games >= 4; "ready" = within 3 hours of first pitch | `src/lib/server/scheduler-decide.ts:18, 20, 43-47`; `src/lib/board-coverage.ts:48`; `src/lib/server/blocks.ts:69-71` | An MLB board (and so picks) until lineups are near | KEEP (policy: lineups matter for MLB props). The thresholds are hand-set. |
| 17 | MLB block partition: 90-minute gap, at most 4 blocks | `src/lib/server/blocks.ts:32-33` | Block budgets are not used on found days; blocks still time the block-fire generate. | REMOVE (inert) for the budget part |
| 18 | A block fire on a tick pre-empts that tick's found pass | `app/api/scheduler/route.ts:329-331, 392-401` | More than one MLB spending run per tick | KEEP (integrity: double-spend guard) |
| 19 | Plain generate skips when a stored board covers >= 70%, achievable < 0.15, dead slate, or no games left | `src/lib/server/board-store.ts:133, 140, 159-181`; `app/api/generate/route.ts:270-289` | Nothing on found passes (not applied to top-up, force or board-only) | KEEP (integrity: credit guard) |
| 20 | Live MLB props slots (six times, 12 events, 3 probe events) | `src/lib/mlb/live-props-rules.ts:108, 130, 221` | Display only | N/A. See E2-10 for the 3-event cap. |

### 3.4 "Already ran" guards and leases (limiters 21-33)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 21 | 45-minute limiter on plain generate | `app/api/generate/route.ts:215-217` | Not applied to found passes or forced taps | KEEP (integrity: credit guard) |
| 22 | A block fires once | `app/api/generate/route.ts:240-244` | A second fire of the same block | KEEP (integrity) |
| 23 | One MLB found pass per named slot per day; manual exempt | `src/lib/server/blocks.ts:280-282` | A re-poke of the same slot. With limiter 11 this is what caps MLB at 11 automatic passes a day. | KEEP (integrity: re-poke guard). The cap goes away when 11 goes. |
| 24 | MLB claim-before-spend: an in-flight row younger than 5 minutes makes another caller yield | `app/api/generate/route.ts:264-269` | Two paid runs at once | KEEP (integrity). See C1-5: the yield is reported as dead code on the found path. |
| 25 | MLB found lease, 300,000 ms, `pl:found:lease:<date>` | `src/lib/server/found-lease.ts:14-33`; `app/api/generate/route.ts:582-587`; `app/api/scheduler/route.ts:237-241` | Two writers on one card | KEEP (integrity). See C1-5: it is taken after the paid pull. |
| 26 | Scheduler backfill will not lock from a stored board older than 30 minutes | `app/api/scheduler/route.ts:234-236` | A lock from a stale board | KEEP (integrity). 30 minutes is still stale for a price; see C1-7. |
| 27 | Football found lease, 300,000 ms; card re-read under the lease | `src/lib/server/football-lock.ts:644-650, 704-707, 724-731, 805, 870-872` | Two writers on one card | KEEP (integrity) |
| 28 | Football found pass free skips: no games ahead; room under $5; odds missing; nothing found | `src/lib/server/football-lock.ts:696-702, 711-719, 749-751` | A wasted or wrong write | KEEP (integrity). Defect: `funOpen` at `:699` ignores that fun is off, so the "room spent" skip never triggers (C1-8). |
| 29 | Football first lock never writes on missing odds (502, nothing stored) | `src/lib/server/football-lock.ts:815-833`; `app/api/cfb/lock/route.ts:433-455` | A false "no play" record | KEEP (integrity) |
| 30 | MLB "day fully deployed": refuse when owed < $5 or every game has started | `src/lib/server/blocks.ts:277-279` | A pass that cannot add anything | KEEP (integrity) |
| 31 | Legacy top-up attempt caps (`TOPUP_MAX = 6`, `CFB_TOPUP_MAX = 6`, `NFL_TOPUP.max 6`) | `src/lib/paper-mode.ts:100`; `app/api/generate/route.ts:251`; `src/lib/cfb/rules.ts:233`; `src/lib/nfl/rules.ts:123` | Nothing on found days | REMOVE (inert) |
| 32 | `MAX_RUNS_PER_DATE = Number.POSITIVE_INFINITY` | `app/api/generate/route.ts:68, 312, 347` | Nothing; the checks can never trip | REMOVE (inert) |
| 33 | Never-wired or zeroed cooldowns (`TOPUP_EMPTY_RETRY_MS`, `CFB_TOPUP_RETRY_MS = 0`, legacy "cannot fill further") | `src/lib/paper-mode.ts:107`; `src/lib/server/refill.ts:22, 69-77`; `src/lib/cfb/rules.ts:257` | Nothing | REMOVE (inert) |

### 3.5 Dollar ceilings, pick caps, stake bounds, Kelly settings (limiters 34-49)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 34 | Found daily ceiling: $2,500 per sport per day plus that day's won profit; hard throw if exceeded | `src/lib/found-mode.ts:58, 295-297`; `src/lib/server/lock-card.ts:1075-1077, 1132, 1246-1248`; `src/lib/cfb/found.ts:176`; `src/lib/cfb/lock-server.ts:182-184` | Bets once the day's room is used | KEEP (policy for the number; integrity for the assertion). $7,500 a day across three sports on a $10,000 notional bankroll is not a 10% daily exposure cap; see P-2. |
| 35 | Stake bounds: whole dollars, $5 to $800; asserted | `src/lib/found-mode.ts:70, 76`; `src/lib/server/lock-card.ts:1204-1206`; `src/lib/cfb/lock-server.ts:196-200` | Stakes outside the range | KEEP (policy for the numbers; integrity for the assertion) |
| 36 | Kelly settings: multiplier 4, fraction 0.25, cap 0.02, bankroll $10,000 = full Kelly capped at 8% | `src/lib/found-mode.ts:63-68` | Not a limiter on count. It sets size. | KEEP (policy), but the label "quarter Kelly" is wrong and the size is aggressive: P-2, C1-3, B2-7. |
| 37 | Constant bankroll: stakes never rescale to results | `src/lib/found-mode.ts:63`; `src/lib/server/lock-card.ts:1271-1274` | Nothing; it is the absence of a limit. Kelly on a bankroll that never moves is not Kelly. | REMOVE (artificial): replace the constant with the managed bankroll (P-2). |
| 38 | Max legs: 6, overridden to 1 from 2026-10-06; asserted | `src/lib/found-mode.ts:72, 114-116`; `src/lib/cfb/found.ts:143`; `src/lib/server/lock-card.ts:1201-1203`; `src/lib/cfb/lock-server.ts:192-194` | Parlays on the paper card | KEEP (policy: straight bets only; integrity for the assertion) |
| 39 | Fun parlay: $25 once a day, $0 from 2026-10-06 | `src/lib/found-mode.ts:60, 119-121`; `src/lib/server/lock-card.ts:1238, 1249-1251`; `src/lib/cfb/found.ts:204`; `src/lib/cfb/lock-server.ts:185-187` | Fun tickets | KEEP (policy; currently off) |
| 40 | Football price cap 2.6 decimal (+160) | `src/lib/cfb/rules.ts:49`; `src/lib/nfl/rules.ts:41`; applied `src/lib/cfb/found.ts:95-99, 135-141` | Every football bet longer than +160: most underdog moneylines, alternate lines, longer props | REMOVE (artificial): written for the legacy two-leg card. Caution from refuted finding B2-8: this cap is currently the only thing blocking inflated longshot moneyline EV from the proportional de-vig, so fix the de-vig first. |
| 41 | Football EV floor: 2%, lowered to 1% from 2026-11-01 | `src/lib/cfb/rules.ts:46`; `src/lib/nfl/rules.ts:38`; `src/lib/found-mode.ts:130-135` | Football bets under the floor | KEEP (policy). +1% is inside the model's own measured error: B2-6. |
| 42 | MLB EV floor: none on the found path (only EV > 0 after shrink). The engine's own gates (`coreEvMin:2`, `coreMaxDec:15`, `maxCoreTickets:6`, `dailyBankrollCap:0.10`, ...) do not govern the found card. | `src/lib/server/lock-card.ts:1149`; engine `SH_CFG` in `src/engine/legacy-src.gen.ts` line 5 | Nothing: a +0.1% edge is seated at $5-$15 | REMOVE (inert) for the engine values on this path. The missing floor is a gap, not a limit; see 3.9. |
| 43 | Legacy MLB daily $350 / $150 | `src/lib/paper-mode.ts:27-35, 68-71`; `app/api/generate/route.ts:616, 624` | Nothing; the found builder never reads it | REMOVE (inert) |
| 44 | Legacy MLB core rules (`maxLegs 2`, `maxDec 2.6`, `maxStake 25`, `noHrrOver`, `shrinkW 0.5`, ...) | `src/lib/paper-mode.ts:190-204` | Only `shrinkW` (and the H+R+RBI-over idea, re-implemented) reach the found path | SPLIT: REMOVE (inert) all but `shrinkW`; KEEP (policy) `shrinkW`. |
| 45 | Legacy shapes A-F, P, V, tilt constants, parlay variety | `src/lib/core-shapes.ts:61, 69-125, 170-174`; `src/lib/server/lock-card.ts:222`; `src/lib/env-adjust.ts:66` | Nothing on found days | REMOVE (inert) |
| 46 | Legacy football caps (tickets 3-10, max stake $50, max legs 2, one leg per game, paper daily CFB $250 / NFL $350) | `src/lib/cfb/rules.ts:39, 44-66`; `src/lib/nfl/rules.ts:30, 35-56`; `src/lib/cfb/lock-server.ts:205-222` | Nothing on found days | REMOVE (inert) |
| 47 | Block budgets | `src/lib/server/blocks.ts:74-89, 142-160`; `app/api/generate/route.ts:616-646` | Nothing; ignored by the found builder | REMOVE (inert) |
| 48 | Football props event caps: CFB 60 (live 24), NFL 16; daily budgets infinite | `src/lib/cfb/rules.ts:462, 467, 479`; `src/lib/nfl/rules.ts:188, 199` | Which CFB games get prop prices on the board. Does not reach the CFB found card because CFB found takes no props (limiter 62). | SPLIT: REMOVE (artificial) the 60 cap; REMOVE (inert) the infinite budgets. |
| 49 | Payload size caps: generate 3,000,000 bytes, ledger merge 900,000, stored board 2,000,000, football 413 on oversize | `app/api/generate/route.ts:73`; `src/lib/ledger-merge.ts:111`; `src/lib/server/board-store.ts:48`; `src/lib/server/football-lock.ts:758, 874` | A very large card | KEEP (integrity). The 900 KB single-blob cap is itself a risk: D-4. |

### 3.6 Market allowlists, exclusions, dedupe (limiters 50-66)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 50 | MLB straight-bet market allowlist: ml, rl, hits, total bases, H+R+RBI, strikeouts, outs; rows that are live, suspended or missing a price / probability / key are skipped | `src/lib/server/lock-card.ts:135-143, 152-159` | Any other market; incomplete rows | SPLIT: KEEP (integrity) data completeness; KEEP (policy) the market list. |
| 51 | Home-run legs excluded from the found card | `src/lib/server/lock-card.ts:1143` | Every home-run bet | KEEP (policy: model trust). The home-run fair uses a 1.06 overround against a measured 1.16 (B3-13, P-6); do not lift until that is fixed. |
| 52 | H+R+RBI overs excluded | `src/lib/server/lock-card.ts:1144`; `src/lib/paper-mode.ts:190-204` | Every H+R+RBI over | KEEP (policy: model trust) for now. A blanket side ban with no expiry or re-test hook; C1-11. |
| 53 | Pitcher outs off since 2026-10-06 | `src/lib/found-mode.ts:136-151`; `src/lib/server/lock-card.ts:1145` | Every pitcher-outs bet | KEEP (integrity: protects the record from a model with confirmed unfixed defects; B1-2, P-1). |
| 54 | Live, started or unknown-start legs dropped (unknown start = started) | `src/lib/server/lock-card.ts:1099-1103, 1142` | Bets on games in progress | KEEP (integrity) |
| 55 | "Two cards one game" throw | `src/lib/server/lock-card.ts:1085-1093` | Double-carding a game | KEEP (integrity) |
| 56 | One use per leg per day | `src/lib/server/lock-card.ts:1119-1130, 1164` | Duplicate exposure to the same leg | KEEP (integrity) |
| 57 | One bet per player + market; one of moneyline / run line per game | `src/lib/server/lock-card.ts:1006-1011, 1166` | A second line on the same player and market; both sides of a game | KEEP (policy: correlation control). It is not an exposure cap: C1-12. |
| 58 | Under-bias cap: unders at most 25% of prop legs; the first prop of a day can never be an under | `src/lib/under-bias.ts:20, 45-57`; `src/lib/server/lock-card.ts:1155, 1170` | Positive-EV unders, by count | REMOVE (artificial): a portfolio-shape rule from the parlay era. |
| 59 | A bet needs both a DraftKings price and a DK/FD "basis" price | `src/lib/server/lock-card.ts:69, 1149`; `app/api/generate/route.ts:52` | A bet with no DraftKings price | SPLIT: KEEP (integrity) "a bettable price must exist"; REMOVE (artificial) the separate basis requirement and replace it with pricing at the better of DraftKings and FanDuel (C1-2). |
| 60 | Football game-line candidates: playable, DraftKings quote and EV present, not a first-half market, EV floor, price cap, game ahead | `src/lib/cfb/found.ts:135-141` | Rows failing any test | SPLIT: KEEP (integrity) playable / ahead; KEEP (policy) EV floor; REMOVE (artificial) price cap and the first-half exclusion. |
| 61 | Football prop allowlist: `pass_yds`, `pass_tds`, `rush_yds`, `receptions`, `rec_yds`; no yes/no markets; half-point lines only; DraftKings line must equal the row line; price stamp no older than 30 minutes | `src/lib/cfb/found.ts:81, 95-99` | Anytime-TD and every other prop market | SPLIT: KEEP (integrity) line match, freshness, not kicked; REMOVE (artificial) the five-market list and the yes/no ban. The one-sided 1.08 hold constant is unmeasured (B2-9); measure it before opening yes/no markets. |
| 62 | CFB found never takes props | `app/api/cfb/lock/route.ts:395-407`; `src/lib/server/football-lock.ts:672-770`; `src/lib/cfb/found.ts:86-87` | Every CFB player prop | REMOVE (artificial). See C1-9. |
| 63 | NFL props are attached only on the day's first lock | `app/api/nfl/lock/route.ts:220-221`; `src/lib/server/football-lock.ts:834`; cost note `src/lib/cfb/rules.ts:481` (`measuredCreditsPerEvent: 31`) | A prop that becomes positive-EV later in the day | REMOVE (artificial; cost-driven). See C1-9, B2-10. |
| 64 | One football bet per (game, family): spread and moneyline share a family; total; prop by player and market | `src/lib/cfb/found.ts:49-60, 181` | Both spread and moneyline in one game; re-betting a total after it moves | KEEP (policy: correlation control) |
| 65 | Distinct games inside a ticket | `src/lib/cfb/found.ts:144` | Nothing on straight days | REMOVE (inert) |
| 66 | Settlement-book-only pricing: football props and game lines are selected and sized at DraftKings only; FanDuel is collected and never used | `src/lib/cfb/found.ts:90`; `src/lib/cfb/card.ts:249-251`; `src/lib/cfb/rules.ts:77, 476`; `src/lib/nfl/rules.ts:68, 197`; `src/lib/cfb/model.ts:397`; `src/lib/cfb/props.ts:347` | A better FanDuel price; any bet available only at FanDuel | REMOVE (artificial) for an owner who can bet both. See B2-4, C1-2. |

### 3.7 Hard-coded dates, flags, freezes (limiters 67-80)

| # | Limit | Where | What it blocks | Verdict |
|---|---|---|---|---|
| 67 | `FOUND_SINCE = "2026-10-03"` | `src/lib/found-mode.ts:53`; read by `src/lib/ledger-merge.ts:27` | Nothing; permanently true as a gate | KEEP (integrity: record boundary) |
| 68 | `STRAIGHT_SINCE = "2026-10-06"` | `src/lib/found-mode.ts:103` | Parlays | KEEP (policy switch) |
| 69 | `EV1_SINCE = "2026-11-01"` | `src/lib/found-mode.ts:130` | See limiter 41 | KEEP (policy switch) |
| 70 | `OUTS_OFF_SINCE = "2026-10-06"` | `src/lib/found-mode.ts:146` | See limiter 53 | KEEP (integrity) until the model fix is signed off |
| 71 | Legacy MLB date switches (`PAPER_ACTION_SINCE`, `VARIETY_SINCE`, `PAPER.since`, `SUSPENSIONS_LIFTED.since`, `CORE_RULES.since`, `shapedSince`, `CORE_SHAPES_SINCE`) | `src/lib/paper-mode.ts:17, 27, 30, 133-137, 190-204`; `src/lib/core-shapes.ts:58` | Nothing today | KEEP (integrity: needed to read old records). Inert as pick rules. |
| 72 | Football since-dates (`CFB_PAPER.since`, `fullPaperSince`, `NFL_PAPER.since`, `sundayPaperSince`, `variedPaperSince`) | `src/lib/cfb/rules.ts:37, 44`; `src/lib/nfl/rules.ts:29, 35, 36`; `src/lib/server/football-lock.ts:185` | Nothing today; they bound the sweep and bank defaults | KEEP (integrity: record boundaries). Inert as pick rules. |
| 73 | `UNDER_BIAS.since = "2026-08-16"` | `src/lib/under-bias.ts:20` | See limiter 58 | REMOVE (artificial), with 58 |
| 74 | Ledger epoch `LEDGER_EPOCH = 2`, archive key `pl:ledger:archive:e1` | `src/lib/ledger-epoch.ts:18-39`; `app/api/scheduler/route.ts:220` | Merging across epochs | KEEP (integrity). The archive key is hard-coded to e1: D-11. |
| 75 | Engine freezes inside `SH_CFG`: `penQFrozen`, `umpKFrozen`, `coreKsFillOnly`, `coreKsCap 0.15`, `coreKsLegMax 1`, `lockMaxAgeMin 30`, `seasonEnd "2026-09-27"`, `outsSusp`, `hrrAltMax -1`; server runs override the last two | `src/engine/legacy-src.gen.ts` line 5; `src/lib/paper-mode.ts:139-143`; `app/api/scheduler/route.ts:252-259` | Model scope, not pick count. Not every use inside the one-line blob could be determined. | N/A here; see B1-10, P-4, P-12 for the frozen inputs and the lifted suspensions. |
| 76 | Env var `PL_CFSEL` (name only) | `app/api/generate/route.ts:511, 728` | Corrected in section 9.5: not a switch and limits no pick; dead measurement code | REMOVE (inert) |
| 77 | Calibration and gate constants not on the pick path | `src/lib/gate-rebuild.ts:8-9, 29`; `src/lib/server/grading-progress.ts:34, 45, 267`; `src/engine2/calibration.ts:657` | Nothing | N/A |
| 78 | No-play log (`NOPLAY_MAX = 500`) | `src/lib/noplay.ts:21-22` | Nothing | N/A |
| 79 | Push alerts since 2026-10-09 | `src/lib/server/push.ts:34`; `app/api/generate/route.ts:650`; `src/lib/server/football-lock.ts:761, 880` | Nothing | N/A |
| 80 | UI date switch for the NFL props query | `src/components/cfb/CfbBuilder.tsx:397` | Display only | N/A |

### 3.8 Integrity guards to keep, as one list

- Auth fail-closed on every spending or locking route (5, 6).
- Leases and claim-before-spend (24, 25, 27); block fires once (22); same-slot refusal (23).
- Append-only card: `assertAppendOnly` on MLB (`src/lib/server/lock-card.ts:1253`) and football
  (`src/lib/server/football-lock.ts:755-756`); definition `src/lib/append-only.ts:28-48`.
- Money assertions: day ceiling, fun ceiling, whole-dollar $5-$800 stake, straight = one leg, duplicate ticket id
  (`src/lib/server/lock-card.ts:1201-1206, 1246-1251`; `src/lib/cfb/lock-server.ts:147-223`).
- Started / unknown-start exclusion (54); football "not kicked" (`src/lib/cfb/found.ts:95-99`).
- Two cards one game (55); one use per leg (56).
- Odds missing never becomes a no-play record (28, 29); store unreadable -> 502, no write, on football
  (`src/lib/server/football-lock.ts:96-101`). MLB does not have this guard: D-1, C1-4, E1-4.
- Football settle never grades forward and is bounded per poke (`maxDatesPerPoke: 2`, `src/lib/cfb/rules.ts:290`,
  `src/lib/nfl/rules.ts:131`).
- Ledger epoch (74); size caps (49); device-lock refusal on found days (7).
- Pitcher outs off (53, 70) until the model fix is signed off.

### 3.9 Limits that are missing and should exist

These are not in the code today. Each comes from a finding in section 4.

- **A price gate on the market's own fair.** The MLB found gate is `czEv > 0` on a model-shrunk probability; no
  consensus or book-count test runs (found straights are built with `booksInd: 0`). B1-1, P-3.
- **A minimum EV on MLB.** Football has +1%; MLB has none. Limiter 42.
- **Sizing on a managed bankroll with a daily exposure cap.** Today: full Kelly on a constant $10,000, up to
  $2,500 a day per sport. P-2, C1-3, B2-7.
- **A per-game and per-player exposure cap.** Correlated full-Kelly singles can stack on one game or one player.
  C1-12.
- **A quote-age gate at lock, and the quote time stored on the ticket.** Football locks read a 240-second
  stale-while-revalidate cache; the MLB backfill locks from a board up to 30 minutes old. A-2, C1-7, E2-1.
- **A credit floor.** Every in-app Odds credit ceiling is infinite and nothing alerts on low credits. E2-6.

### 3.10 Order of removal, by effect on "picks at any time"

1. Ticker hours (1) and the found slot tables (11, 12, with 13, 15).
2. Football price cap 2.6 (40) and the five-market prop list / yes-no ban (61) — after the de-vig and hold
   constants are fixed.
3. Props on every football found pass, and props for CFB at all (62, 63).
4. FanDuel as a selectable and sizing price (66) and the MLB basis requirement (59).
5. Under-bias on straights (58, 73). The H+R+RBI-over ban (52) and home-run ban (51) are model-trust calls: lift
   only after the model is validated on those markets.
6. MLB hourly cadence and one-pass-per-slot (11, 23) — cost-driven, 114-150 credits a pass.
7. Delete the inert set (10, 17, 31-33, 42-47, 65).

Do not remove anything in 3.8.

---

## 4. Findings

There are 140 kept findings: 0 critical, 10 high, 66 medium, 64 low. Five findings were raised as critical by the area auditors (B1-1, B2-1, B3-1, D-1, E1-1); the second reviewer confirmed each mechanism and downgraded each to high, mainly because the system is paper-only and the measured effect is smaller than first stated. Three more findings were refuted and are in section 7.

Verification: 103 were re-opened and confirmed by a second reviewer; 21 low-severity findings were not re-verified; 16 come from the prior-audit regression table and were not re-verified.

Order: by severity first. Within a severity the order is the report writer's judgement of expected effect on profit and then on reliability: selection and pricing first, then model quality, stale prices, calibration, measurement, ledger integrity, scheduler reliability, credits, front end. Low findings are in the area auditors' order. The row order is the rank.

The Evidence, Impact and Proposed fix cells are shortened at a sentence boundary where the original is long ("[...]"). The full text of every finding, and the reviewer's corrections, is in section 4.2 (high) or Appendix A (medium and low). The unshortened records are also in `/private/tmp/claude-501/audit-out/findings.json`. Where the reviewer corrected a number, the reviewer's number is the one to use. All citations are `path:line` relative to the checkout.

| Area | High | Medium | Low | Total |
|---|---|---|---|---|
| prior audit regression | 5 | 7 | 4 | 16 |
| calibration and backtest | 1 | 10 | 3 | 14 |
| MLB model quality | 1 | 9 | 3 | 13 |
| football model quality | 1 | 8 | 1 | 10 |
| scheduler and reliability | 1 | 5 | 7 | 13 |
| grading and ledger | 1 | 4 | 8 | 13 |
| API credits and efficiency | 0 | 7 | 6 | 13 |
| selection and staking | 0 | 6 | 7 | 13 |
| front end | 0 | 4 | 12 | 16 |
| data integrity | 0 | 4 | 7 | 11 |
| parlay pricing | 0 | 2 | 6 | 8 |
| All | 10 | 66 | 64 | 140 |

### 4.1 Findings table

| ID | Severity | Area | Title | Evidence | Impact | Proposed fix | Verification | Status |
|---|---|---|---|---|---|---|---|---|
| [B1-1](#f-b1-1) | high | MLB model quality | Found-mode MLB bets are created by model disagreement, not by price: 84-93% of eligible bets are negative-EV on the market's own fair and the stake concentrates where the model is furthest from the market | Gate: src/lib/server/lock-card.ts:1149 (`!(ev > 0)` on the shrunk czEv is the only edge test); src/lib/shrink.ts:63 (`p2 = wc*p + (1-wc)*imp`, wc = CORE_RULES.shrinkW 0.5 at src/lib/paper-mode.ts:192) [...] | Paper profit: the card is sized at full Kelly on an edge the closing market values at roughly minus the vig, so expected paper ROI on found stakes is about -5% of roughly $590/day (current rule) rather than the +1.9% the card claims. [...] | Split the edge into its two parts and gate on the price part. (1) Require consensus-fair EV at the bet book >= 0 (or within a small tolerance) before the model may add anything; rank by that. [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED mechanism, but the headline impact number is overstated; I downgrade critical -> high. | open |
| [B3-1](#f-b3-1) | high | calibration and backtest | The model does not beat the no-vig DraftKings price in any MLB prop market, yet the engine gives it 0.35 weight and books phantom EV | Command: python3 -I /private/tmp/claude-501/audit-out/areaB/dk_novig_vs_model.py (propBoard rows from audit-out/baseline/pb_rows.jsonl dated >= 2026-09-17 when cz = DraftKings, both DK sides at board time, later pre-start close [...] | Every stated probability and EV on the board is biased toward the model by roughly 10x the weight the closing market supports. The +EV ranking is therefore mostly a ranking of model error, which is why positive-EV rows show about -5% CLV. [...] | Set the default model weight to what the data supports until a held-out test says otherwise: props w = 0.05 (or 0) in SH_W at legacy/index.html:1738, and treat 'EV' as price-shopping EV only (best DK/FD price vs sharpest no-vig fair). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Core claim confirmed, but the evidence is mislabelled and the numbers are softer than stated. Downgraded from critical to high: paper trading only, partial guards exist, and the test cannot prove the model is worthless. | open |
| [B2-1](#f-b2-1) | high | football model quality | Football side bets have one independent signal, ESPN FPI, and it is unvalidated: on the only real slate on disk, 4 of 4 auto candidates were FPI-driven and 0 survive without it | Code: ML = 0.6 market + 0.25 spread-implied + 0.15 FPI, spread margin = 0.75 market + 0.25 FPI (src/lib/cfb/model.ts:420-455; weights at src/lib/cfb/rules.ts:73-74, src/lib/nfl/rules.ts:64-65). Totals are 100% consensus (model.ts:458); 1H has no FPI (src/lib/cfb/h1.ts:46-58) [...] | The stated +2.6% to +6.1% 'edges' against a 22-23 book market are a rating-difference margin being applied linearly to blowout spreads; the card systematically takes big underdogs plus the points. [...] | Treat FPI as unproven until back-tested: set spreadBlend.fpi and blend.fpi to 0 for staking (keep it as a displayed lean), or cap its pull at about 1 point and shrink it with spread size. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed, but I rate it high, not critical: the system is paper-only and the proof is a single week-1 slate. | open |
| [P-2](#f-p-2) | high | prior audit regression | Live found-mode path bypasses the July sizing protections: stake is full Kelly up to 8% of a constant $10,000, no managed bankroll, no 10% daily exposure cap | src/lib/server/lock-card.ts:260 `if (isFoundDay(args.date)) return buildFoundLockEntry(args);` so every date >= 2026-10-03 never calls shAllocate. Stake: src/lib/found-mode.ts:154-172 `round(kellyMult * bankroll * min(kellyFrac*f, kellyCap))` with kellyMult 4 (:65), kellyFrac 0.25 (:66), kellyCap [...] | The prior audit's ceiling formula became the stake itself: 4 x quarter-Kelly = full Kelly, up to $800 a ticket (16x the $50 operator rule), $2,500+ a day per sport (25% of the notional bankroll versus the documented 10%), on a bankroll [...] | Size found stakes off the managed bankroll (base + realised P/L, src/lib/bankroll.ts) instead of the constant; drop kellyMult to 1 (true quarter-Kelly, 2% cap) or state full Kelly explicitly as the owner's choice [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-3](#f-p-3) | high | prior audit regression | Consensus and EV gates added by the prior audit do not run on the live path; found straights are built with booksInd 0, the exact condition the audit made ineligible | Engine gates live only inside shAllocate: +2% EV gate legacy/index.html:3039 (coreEvMin:2 at :1075), `no_ind_consensus` hard block legacy/index.html:3050-3065 (`booksInd===0` -> not eligible, dated 2026-07-26), small-sample consensus gate :3068-3079 (consMinN:100, consMinEv:-1 at :1087). [...] | Every straight bet on the MLB found card is one the July rule classed as having no independent price check (the model checked against the book it is betting into). [...] | Carry the real per-row booksInd from the board row into buildStraightPool instead of 0, and require at least one independent book (or, for the Arizona case, require both DraftKings and FanDuel to post the line and use the other book's [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [D-1](#f-d-1) | high | grading and ledger | An unreadable ledger blob is silently replaced by an empty or one-day ledger (no archive, no abort) | src/lib/server/ledger-epoch-server.ts:16-28: JSON.parse failure sets stored=null; src/lib/ledger-epoch.ts:30-32 then returns {migrate:true, archive:false}, so line 28 SETs pl:ledger:v1 to {ledger:[], epoch:2} with no archive. [...] | One bad read of the single season blob (a platform rollback past b29961e, a hand edit in the store console, any future encoding change) erases the whole MLB paper record on the next 15-minute poke, and the football ledgers on their next [...] | Treat `raw != null && parse failed` as a hard error everywhere: throw before any SET in ensureLedgerEpoch, writeLock, the three ledger routes' readStore and football readLockStore. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The MLB core of the finding is real, but "critical" is overstated and the football part is partly wrong. I rate it high. | resolved 7291624, 647ebdb (section 10) |
| [E1-1](#f-e1-1) | high | scheduler and reliability | A store failure (the Oct-2026 Upstash 403 mode) turns every scheduler poke into an uncaught 500 and nothing in the system notices or alerts | app/api/scheduler/route.ts:138 `const res = await mlbTick(req);` is not inside any try/catch. Inside mlbTick the store reads at :173 (`redis(["GET", BOARD_KEY(date)])`), :183 (`redisGetJson(BLOCKS_KEY(date))`), :225 (`await lockExists(date)`) and :326 (`readMlbDay`) are all outside the try blocks [...] | Silent total outage: no cards locked, no grading, no refills, no alerts for as long as the store refuses calls (two weeks in Oct 2026). [...] | 1) In GET wrap `mlbTick` in try/catch and return a JSON body `{ ok:false, error:'store-unreachable', detail }` with status 503 so the cron provider's failure mail carries a reason. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real; I could not refute the code path, but critical is overstated for a paper-only system, so I rate it high. | resolved 9abd079 (section 10) |
| [P-1](#f-p-1) | high | prior audit regression | Pitcher-outs model: all three audited defects (M2, M2', shrinkage k=4) are still in the code, and the engine-wide suspension that covered them was lifted | legacy/index.html:2258 still `of=shClamp(0.140/oo,0.86,1.12,"2258")` (documented fix 0.140 -> 0.400 plus offense() de-noise, docs/freeze-exit-bundle.md:31, docs/pitcher-outs-audit.md:432-470); legacy/index.html:2253 still `ipg=shShrink(ipg,nOut,4,Lipg)` [...] | The audit measured every outs row on the clamp floor (35 of 35) and a median model-vs-market gap of -23.3 pp. Those probabilities, grades and EVs are still shown untagged on the Board, the Builder generator, the Sharp page and /api/picks [...] | Ship the pre-written interlocked pair (0.400 constant + offense() de-noise, tests/m2-interlock.test.ts already guards the pairing), refit the innings shrinkage k against starts, and add a hook term or route outs to the simulator's [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-4](#f-p-4) | high | prior audit regression | M18/M23: model inputs frozen at 2026-07-29 with no staleness check; bullpen fatigue from July 29 is applied to every later slate; pen_quality.json still never committed | .github/workflows/model.yml:7-10 schedule commented out (PAUSED 2026-07-29); .github/workflows/context.yml:30-33 context.json commit paused, only `git add data/ump_k.json`. Command `git log -1 --format='%h %ad' --date=iso -- public/model/priors.json` -> 671aed9 2026-07-29 15:58:41 +0000 [...] | Every MLB board from 2026-07-30 through the end of the season was priced on Statcast priors (xBA/xSLG, park index, framing) three-plus months stale, and the bullpen-fatigue factor (0.96-1.05 on opposing offence in the sim) used the pitch [...] | Re-enable the nightly priors and context writers before the next MLB slate; add a staleness guard in the loader (if context.date != slate date, null out bullpen_last3/weather/umpire and add a data_gaps entry [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-5](#f-p-5) | high | prior audit regression | M11: hot-form (last-30-day) weighting, measured at 4-11x too strong, was never changed | docs/freeze-exit-bundle.md:36 specifies an xBA-primary rate with a single un-nested last-30 term at weight <= ~0.1. Current code still uses the nested shBlendN -> shShrink(...,60,...) form: legacy/index.html:2349, :2351, :2357 (closed form) and :2065-2066 (sim) [...] | Hits, total-bases and H+R+RBI probabilities over-react to a hitter's recent streak, which systematically manufactures apparent edges on hot hitters (overs) and cold hitters (unders). [...] | Implement the specified rate (season xBA primary, one last-30 term at ~0.1 weight, drop the nested blend and k=60) behind a config flag, replay it on the archived boards in pl-history/data/boards, and arm it on all three generators the [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [C1-2](#f-c1-2) | medium | selection and staking | FanDuel is never the lock price on any path: EV gate, stake and settlement all use DraftKings even when FanDuel is better (owner can bet both) | MLB: src/lib/server/lock-card.ts:158 (row needs czDec AND bsDec), :1149 (`!(ev > 0)` where ev is the DraftKings czEv -> found_no_edge), :1183 (`foundStake(c.prob/100, c.dec, room)` at the cz price), :1207-1229 stored ticket carries settlementBook + czDec [...] | Paper profit and volume: about 24% more qualifying straights (77 vs 62) are left unlocked, 11 FanDuel-only rows can never lock, and on roughly 27% of two-book rows the paper record is graded at a worse price than the owner could actually [...] | Evaluate EV and Kelly at max(DK, FD) per selection, stamp the chosen book and its unrounded price on the ticket (per-ticket settlementBook = the chosen book), and settle at that price. Allow a row with only one of the two books priced. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but the impact is overstated; I rate it medium, not high. | open |
| [B2-4](#f-b2-4) | medium | football model quality | FanDuel is never a bet price in football although the owner can bet it; it had the better price on 26 of 57 rows | playable and evCz are tied to the settle book only (src/lib/cfb/model.ts:516-518); found game-line filter reads r.cz / r.evCz (src/lib/cfb/found.ts:138); found props are priced at the literal "draftkings" (found.ts:90); FanDuel is carried only as a reference quote (model.ts:397 [...] | Line shopping across the two legal books is worth about two-thirds of a point of EV per bet on this slate, which is larger than most of the stated edge at a +1% floor, and it is free. [...] | Price every row at both draftkings and fanduel, bet the better of the two (same leave-one-out fair), and store the book on the ticket so grading and any closing-line check use the right price. | Re-opened by a second reviewer (confirmed). Reviewer: Structural claim confirmed; impact claim overstated, so high -> medium. | open |
| [B2-3](#f-b2-3) | medium | football model quality | With only DraftKings and FanDuel there is no independent consensus: game-line 'fair' becomes the lower of two numbers and prop 'fair' is half DraftKings | Consensus = weightedMedian over every bookmaker in the response, settle book included (src/lib/cfb/model.ts:345, 380-383, 415-419); minBooks 2 (src/lib/cfb/rules.ts:76, src/lib/nfl/rules.ts:67). [...] | Stated plainly: in a DK+FD-only feed the model has no signal on totals, 1H or props, and on sides only FPI. The two-book median hands away/under rows 1.3-1.7 pp of EV relative to home/over purely from the lower-middle rule. [...] | Keep the wide feed for the fair price and never narrow it to the two bettable books. Build fair leave-one-out (exclude the book being bet), require at least 3 non-settle books at the line for a bet, and use a true median (average the two [...] | Re-opened by a second reviewer (confirmed). Reviewer: The code facts and probe numbers are confirmed, but the headline scenario (a DK+FD-only feed) does not occur in the current code, so I rate this medium, not high. | open |
| [B1-11](#f-b1-11) | medium | MLB model quality | Consensus 'market' for batter props is a median of about three US books that includes the bet book itself; FanDuel contributes no two-sided batter price | legacy/index.html:1366 props pulled at regions=us; :1557-1558 sharp weights (pinnacle, betfair, matchbook) cannot apply to props; :1576-1580 weighted median of per-book Shin fairs with no exclusion of the settlement book [...] | Accuracy: for a DraftKings/FanDuel-only bettor the fair value on batter props is largely DraftKings' own line plus two other recreational books, so 'edge against consensus' at DraftKings is thin and noisy, and total bases has a two-sided [...] | Re-specify the fair value for the two-book world: compute it from books other than the one being bet (leave-one-out), require at least three such books, add the eu region or a sharp props source if credits allow and otherwise drop the [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code and data, with three corrections. I could not refute it; no guard elsewhere prevents it in the live found-straight path. | open |
| [C1-1](#f-c1-1) | medium | selection and staking | MLB found pool is cut to the top 50 rows per market BY WIN PROBABILITY before EV is ever tested, so most +EV straights never become candidates | legacy/index.html:2516-2518 (`cats[k].filter(pred).slice().sort(function(a,b){return b.p-a.p;})` then `rows.slice(0,50)`); legacy/index.html:2584-2588 comment: categories is 'deliberately narrow: top 50 per market ranked by win probability, ONE side per line'. [...] | Paper profit: on full slates the selection universe is the 50 heaviest favourites per market, where book hold is highest and EV thinnest [...] | Build the found straight pool from the uncapped priced rows (the propBoard / pre-slice cats) rather than from `categories` [...] | Re-opened by a second reviewer (confirmed). Reviewer: The mechanism is real and I could not refute it, but the severity is overstated: the cap has not yet bound on any archived found-mode day. | open |
| [B1-5](#f-b1-5) | medium | MLB model quality | The Board lists only the side the model favours and only the top 50 by probability, so most price-driven value at DraftKings never reaches the found pool | legacy/index.html:2471 `sideCh=(pAdj>=nv)?"O":"U"` (one side per line, the model's side); :2186 moneyline lists only the more likely side; :2517-2518 rows sorted by blended probability then `rows.slice(0,50)` [...] | Paper profit and accuracy: the only edges the closing market supports (the book is off-market against consensus) are mostly invisible to the selector, while the visible pool is the model-favoured side. [...] | Build the straight pool from the uncapped propBoard (both sides of every priced line, DraftKings and FanDuel quotes from bookQuotes) and from both moneyline/run-line sides, compute EV per side per book, and apply the filters there [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed: I could not refute it. The code behaves as described and the headline numbers reproduce exactly, with a few corrections. | open |
| [B2-2](#f-b2-2) | medium | football model quality | No key-number handling: the smooth normal reads the standard -2.5 (-120) / -3 (+100) equivalence as a +1.39% edge, above the +1% floor | coverProb is a pure normal with a +/-0.5 continuity band (src/lib/cfb/model.ts:76-83); each book's line and juice become an implied margin by mu = -point + sigma*normInv(p) (model.ts:361) and total by model.ts:369. [...] | Any time DraftKings hangs the other side of 3 (or 7) from the median book at the customary juice, the NFL card sees a bet that clears the +1% floor with no real price difference [...] | Replace the normal push/cover step with an empirical margin distribution per league (push probabilities for 3, 7, 6, 10, 14 and half-point values across them), fitted on historical finals. [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code and reproduced end to end; severity lowered from high to medium because the trigger frequency is unproven and the one real NFL snapshot on disk shows zero occurrences. | open |
| [B2-7](#f-b2-7) | medium | football model quality | Football stakes are full Kelly on an unshrunk, uncalibrated probability | FOUND.kellyMult 4 x kellyFrac 0.25, cap 0.02, bankroll 10000 (src/lib/found-mode.ts:55-73, comment at :64 '4 x quarter-Kelly = full Kelly on the bankroll'); FOUND_MAX_STAKE = 800 (:76); foundStake (:165-172) is called with the raw model probability (src/lib/cfb/found.ts:180 [...] | Full Kelly is only correct when the probability is right. Here the probability carries the FPI, key-number and median errors above, so every overstatement becomes an over-bet: up to $800 (8% of the stated bankroll, 32% of the day) on one [...] | Shrink football probabilities toward the no-vig market before staking (at least the MLB 0.5 until football has its own calibration), drop kellyMult to 1 for football (true quarter Kelly), and cap any one ticket at 2% of bankroll. | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real: I could not refute any of the cited evidence. I rate it medium rather than high. | open |
| [C1-3](#f-c1-3) | medium | selection and staking | Found staking is full Kelly on a constant $10,000, and the two desks feed it different probabilities and gates (MLB shrunk 50% to market, football raw model) | src/lib/found-mode.ts:53-76: `FOUND = { daily: 2500, ..., bankroll: 10000, kellyMult: 4, kellyFrac: 0.25, kellyCap: 0.02, minStake: 5 }`, FOUND_MAX_STAKE 800; foundStake :165-172 = round(4 * 10000 * min(0.25*f*, 0.02)) => 1.0x Kelly capped at 8% of a fixed $10,000. [...] | Bankroll risk and record accuracy: full Kelly on probabilities already measured as over-confident is over-betting by construction (single bets up to $800 = 8% of a nominal bankroll that never shrinks after losses or grows after wins). [...] | One shared sizing function for all desks: fractional Kelly (kellyMult 1, i.e. quarter Kelly) on the ledger's live bankroll, applied to a probability shrunk by a per-market calibrated weight on both desks [...] | Re-opened by a second reviewer (confirmed). Reviewer: The mechanics are confirmed in code, but three parts of the framing are wrong and the severity is overstated; medium, not high. | open |
| [B2-6](#f-b2-6) | medium | football model quality | Every threshold was set before any football game was graded, and the EV floor was cut to +1% to produce volume; +1% is inside the model's own measured error | git log -S: minEvPct 2, maxDec 2.6 and sigma 16.5 first appear in fb0e983 (2026-09-05, the desk's first commit); NFL sigma 13.5 in 10b6a63 (2026-09-08); ATD_YES_ONLY_OVERROUND 1.08 in fbe95af (2026-09-05). [...] | None of minEvPct, maxDec, sigma, hfa, the blend weights or the +1% floor is out of sample or even in sample; the floor was moved in the direction that admits more noise. [...] | Restore +2% (or higher) until a football closing-line record exists; start storing the consensus probability, book, quote time and closing price for every football ticket; then set the floor from realised CLV by EV bucket. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The core evidence is confirmed, but the severity is overstated and two of the four "error sizes" do not support the claim as worded. | open |
| [B2-5](#f-b2-5) | medium | football model quality | Consensus is a one-book-one-vote median over 22-26 mostly soft and duplicated books; Pinnacle is about 8% of the weight and quote age is ignored | No bookmakers= filter; feed is regions=us,eu (src/lib/cfb/rules.ts:367, src/lib/nfl/rules.ts:170). Weight is 2 for pinnacle, 1 for everything else (src/lib/cfb/model.ts:328; rules.ts:75). Real capture tests/fixtures/cfb/odds-ncaaf-2026-09-05.json holds 26 distinct keys [...] | The 'fair' price is the middle of the recreational market, with one platform's odds counted up to four times, not a sharp no-vig line. A stale book cannot be told from a fresh one. [...] | Use an explicit allowlist and weights for the fair: pinnacle, betfair_ex_eu, matchbook and the low-hold books weighted heavily; one vote per platform family [...] | Re-opened by a second reviewer (confirmed). Reviewer: The mechanics are confirmed, but the impact on game lines is overstated, so I rate this medium, not high. | open |
| [B1-2](#f-b1-2) | medium | MLB model quality | Pitcher outs model is still the broken one (0.140 anchor pinned at its 0.86 floor on every row, shrink k=4, no hook term) and is still priced on the Board at full model weight | legacy/index.html:2253 `ipg=shShrink(ipg,nOut,4,Lipg)`; :2258 `of=shClamp(0.140/oo,0.86,1.12,"2258")` where oo = lineup TB/AB (league slugging in public/model/priors.json league.slg = 0.4028); :2260 `lam=ipg*3*of`; Poisson via :1543. [...] | Accuracy: every posted-lineup outs projection is cut a flat 14% regardless of opponent, so the model is roughly 2.5 outs short and one-sided; the Board, ranked lists and any parlay or manual use still show these as the highest-EV rows. [...] | Replace 0.140 with the league TB/AB from the same pull (Ltb at legacy/index.html:2011, about 0.40) and recentre the clamp (0.93-1.07) [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code and data; severity lowered from high to medium because the defect is already documented, owner-acknowledged and gated off the auto card, and two details of the finding are overstated. | open |
| [B1-3](#f-b1-3) | medium | MLB model quality | Calibration loop put pitcher outs back to full model weight on 2026-08-16 and left hits and total bases untouched; it tests the blended probability and moves 10% a week | src/engine2/calibration.ts:118-133 and :267-277 test `x.p` (the blended, market-anchored probability) against outcomes with a Wilson interval; :683-706 weekly step STEP 0.10, shrink-only, drift back +10% when not significant; :596-603 slope multipliers need n >= 100 and CI significance. [...] | Accuracy and paper profit: the loop that is supposed to take weight away from a failing market gave the worst market (outs) the maximum weight for nine weeks, and reacts to a failing market at 10% a week. [...] | Score the raw model (pModel) against the consensus on the same rows by log loss / Brier and set each market's weight from that comparison: weight = 0 when the model does not beat consensus out of sample, fitted slope otherwise, applied [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code and data, with three corrections and a severity downgrade. | open |
| [B1-4](#f-b1-4) | medium | MLB model quality | Game simulator is mis-calibrated: 1.36 runs per game above the market total, no home-field advantage, and half the market's moneyline spread | Sim constants hand-set, not fitted: legacy/index.html:1770 SH_ADV; :1923 manager hook; :1927-1928 times-through-order multipliers; outcomes are BB/1B/2B/3B/HR/out only. Moneyline uses the sim directly with no home term: legacy/index.html:2169 `model=sim.pHome` [...] | Accuracy: the run environment is inflated by about a sixth, which is the mechanical source of the H+R+RBI over bias that CORE_RULES.noHrrOver (src/lib/paper-mode.ts:197) patches by banning the side [...] | Calibrate the sim before it prices anything: scale per-PA on-base/extra-base rates (or the bullpen tail and advancement constants) so the mean simulated total matches the de-vigged market total and league runs per game on the archive [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real, but two of its three headline claims are overstated and the severity should be medium, not high. | open |
| [B1-6](#f-b1-6) | medium | MLB model quality | Strikeout opponent factor is anchored at 0.235 against a per-at-bat rate, hits its +20% cap on a fifth of rows, and stacks a second lineup-strikeout factor on top | legacy/index.html:2279-2280 lineup rate = mean of `shBlend(hs, k, "ab", 10)` (strikeouts per at-bat, 7/15/30-day blend, not shrunk), `f=shClamp((kr/c)/0.235,.8,1.2,"2280")`; same line block `lam=kps*f*uf*wf` with `wf=shOppWhiffF(...)` (legacy/index.html:1626-1629, lineup whiff percentile, +/-7%) [...] | Accuracy: strikeout overs are inflated by about 3 pts raw whenever a lineup is posted, and a noisy nine-man small-sample average swings the mean by up to 20%; this market is now the second-largest share of found stake. | Anchor on the league K/AB from the same pull (LH.k/LH.ab, already summed at legacy/index.html:1483) instead of 0.235; shrink each hitter's K rate toward his prior before averaging; tighten the clamp to about +/-10% [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED, with the framing corrected: the problem is mostly noise and over-application of the lineup factor, not a unit error, and the mean bias in the final probability is under 1 pt. | open |
| [B1-7](#f-b1-7) | medium | MLB model quality | Hot-form and walk-rate amendments (M10/M11) are computed as shadows on every row but never used; the shadow is measurably closer to the market | legacy/index.html:2308-2309 walk rate is an unshrunk 7/15/30-day blend per at-bat feeding expected at-bats; hit rate shrink k=60 against about 80 last-30 at-bats (legacy/index.html:2348-2349, batVec :2050-2093) [...] | Accuracy: about a fifth of the raw model's distance from the market on hits and total bases is recent-form noise the engine already knows how to remove. Those gaps are what the found filter converts into stakes. [...] | Grade the stored shadow series against outcomes in the prediction store (the data exist remotely), and if `all` beats live on log loss, promote m11 and m10 into the live path behind one config flag with a parity test [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code and data; I could not refute it, but several parts need correcting. | open |
| [B1-9](#f-b1-9) | medium | MLB model quality | Every tuned threshold was set in sample on small Caesars-era samples or by hand; none was fitted out of sample or on DraftKings/FanDuel prices | legacy/index.html:1735-1738 comment that the blend weights are recommended ranges that could not be fitted out of sample, `var SH_W={props:0.35,ml:0.15,rl:0.15}`; :1755 SH_EDGE_MIN [...] | Accuracy and profit: overfitting risk on all selection rules; rules such as the under cap and the HRR-over ban encode symptoms of model defects found on a few days, and the consensus weights assume sharp books that the props pull does not [...] | Flag all of the above for re-tuning on DraftKings/FanDuel: export the graded prediction store and ledger, split by date into fit and hold-out, re-fit blend weights, shrink constants and the found gate against outcomes at DraftKings and [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in substance, but the "all Caesars-era, none on DraftKings/FanDuel prices" framing is overstated and needs four corrections. Medium is at the upper end: this is paper trading, and most of the rules only pull toward the market or restrict the card. | open |
| [B1-10](#f-b1-10) | medium | MLB model quality | Model inputs frozen at 2026-07-29 are still fed to every board: Statcast priors, bullpen workload and pen quality | public/model/priors.json generated_at 2026-07-29T15:58:41+00:00 (last commit 671aed9, 2026-07-29); public/model/context.json date 2026-07-29 (last commit 64c42ad). .github/workflows/model.yml:7-10 schedule commented out ('PAUSED 2026-07-29') [...] | Accuracy: by October the skill priors are ten weeks stale (no player called up or changed after July has a current prior), and the simulator's bullpen-fatigue factor is computed from three specific July days for every game. [...] | Resume the nightly priors build and the context commit now that the collection window has closed, or have the engine ignore context older than one day (return 1 from shPenF and the ump/pen factors when SH_CTX.date is not today) and show [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in substance, with two corrections. The title overstates it: the pen-quality factor is pinned off, so only the Statcast priors and the bullpen-fatigue factor are live stale inputs. | open |
| [A-1](#f-a-1) | medium | data integrity | MLB player stats are looked up by normalized NAME ONLY: the Dodgers' Max Muncy was modelled on the Athletics' Max Muncy's stats on 26 of 36 archived board-days | legacy/index.html:2007-2008 builds lookupStats/lookupPit/lookupTeam keyed by pnorm(name) only (`var n=pnorm(k.split(" (")[0]);lookupStats[n]=slate.player_stats[k];var t=shTeamOf(k);if(t)lookupTeam[n]=t;`) although the source key is "name (team)" (legacy/index.html:1491-1492) [...] | Accuracy and paper profit: a wrong player's season stats drive pModel, producing large false edges (30+ points of model-vs-market gap) that pass the EV gate and can be locked and staked up to the $800 found cap. [...] | Resolve each Odds API prop player inside the matchup: look up by `pnorm(name)+"\|"+teamAbbr` restricted to the two teams of the row's game (the stats key already carries the team), or map to the MLB personId from that game's roster/lineup. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed as real; I could not refute it. Severity lowered from high to medium because the blast radius is narrow and no locked bet is shown. | open |
| [B2-9](#f-b2-9) | medium | football model quality | Prop fair prices rest on unmeasured assumptions: 1.08 hold on one-sided markets, proportional de-vig, equal book weights | ATD_YES_ONLY_OVERROUND = 1.08, described in the file header as 'a stated ASSUMPTION ... not a measured figure' (src/lib/cfb/props.ts:21-26, 65, applied at :179-180). [...] | Anytime-TD and ladder EVs shown on the Board are overstated by however much the true one-sided hold exceeds 8%; if football resembles MLB that is several points of EV. Two-way props on short and long prices are biased toward the longshot. [...] | Measure the one-sided overround from stored two-sided anytime-TD pairs where a book posts both, store it like hr_overround.json, and use power or Shin de-vig for props away from even money. Show no EV on a one-sided row until measured. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, with corrections. Severity medium holds only conditionally: the football one-sided hold is unmeasured, so the size (and strictly the direction) of the bias is not proven from disk. | open |
| [B2-10](#f-b2-10) | medium | football model quality | Props freshness: 2-hour board window, 30-minute quote acceptance, per-book quote time never checked, and props reach the card only on the NFL lock | revalidateSec 7200, liveRevalidateSec 600, czMissingRevalidateSec 1800 inside a 4 h window (src/lib/cfb/rules.ts:462-473; NFL at src/lib/nfl/rules.ts:188-197). Found props accept a pricedAt stamp up to 30 minutes old (src/lib/cfb/found.ts:99). [...] | A prop can be locked at a DraftKings price up to 30 minutes old against a consensus of the same age, and the Board can show props EV up to 2 hours old pre-kick. [...] | Stamp each prop row with the settle book's own last_update and refuse a found prop older than about 5 minutes; pass fresh:true on the lock path's game-lines pull [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every cited fact checks out in the code, but the stale-price-at-lock impact is overstated and the proposed fix's credit claim is wrong. | open |
| [B3-13](#f-b3-13) | medium | calibration and backtest | Home-run fair value uses a 1.06 overround constant against a measured 1.16 | legacy/index.html:2491 one-sided HR fair = oneImp/1.06. pl-history/data/hr_overround.json: 87 days, 423 games, appeared sum_implied 1071.54 vs realized_hr_hitters 923 -> overround 1.1609 (all listed 1.1763); file's own verdict 'overround 1.161 vs the hardcoded 1.06 -> czEV overstated ~6.2pp'. | Every home-run row's fair probability is about 9% too high relative to realised frequency, so HR EV is overstated by roughly 6 points and HR rows look +EV when they are not. [...] | Replace 1.06 with the measured value (1.16), recomputed monthly by tools/hr_overround.py and stored as a config value rather than a literal. | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED; I could not refute it. | open |
| [A-2](#f-a-2) | medium | data integrity | Football found/lock passes price game lines from the 240-second stale-while-revalidate Next data cache, with no quote-age gate and no quote time stored on the ticket | src/lib/cfb/slate-server.ts:46-48 `ODDS_TTL=240`; :111 `fetch(..., opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } })`. src/lib/server/football-lock.ts:69-75 `slateFromEspn: (date, espn, now, bankroll) => slateFromEspnOf(cfg, date, espn, now, bankroll)` [...] | Record integrity and paper profit: with pokes every 15 minutes the first request after the TTL is answered with the body fetched at the PREVIOUS request, so a recorded DraftKings price can be ~15 minutes old (older after a quiet gap) and [...] | Pass `{fresh:true}` from feedsOf for every lock and found pass (the credit cost is already governed by the poke cadence). [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code; I could not refute the mechanism. Severity lowered from high to medium. | open |
| [C1-7](#f-c1-7) | medium | selection and staking | Locks can be written from stale prices: football lock path never bypasses the 240 s odds cache, and the MLB self-check backfill locks from a stored board up to 30 minutes old | Football: src/lib/server/football-lock.ts:68-75 feedsOf binds `slateFromEspn: (date, espn, now, bankroll) => slateFromEspnOf(cfg, date, espn, now, bankroll)` with no opts [...] | Record accuracy: bets recorded at prices that have already moved; with full-Kelly sizing a stale favourable price inflates both the EV gate and the stake. [...] | Pass `{ fresh: true }` through feedsOf for every lock/found pull. For the backfill, accept only a board <= ~2 minutes old or drop any ticket whose game starts within the board's age, otherwise wait for the next priced pass. | Re-opened by a second reviewer (confirmed). Reviewer: Both halves confirmed in code; I could not refute it. One correction makes the football half worse than reported, not milder. | open |
| [E2-1](#f-e2-1) | medium | API credits and efficiency | Football lock / found / top-up passes price paper bets off a stale-while-revalidate game-lines cache (and the 2 h props re-pull re-stamps an old body as fresh) | src/lib/cfb/slate-server.ts:111 fetches the game lines with `opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } }` (ODDS_TTL = 240, :48). [...] | Each found/lock pass is answered with the body fetched by the PREVIOUS caller (>= 15 min old; the first 08:00 PT poke can receive the last body of the previous evening unless a page load refreshed it), while the fresh pull it triggers is [...] | Pass `{ fresh: true }` from `feedsOf` (and the CFB route's FEEDS) so every lock/found/top-up pull is `cache: "no-store"` [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code; could not refute. Not observed on production (no network), so real-world staleness depends on Vercel keeping the stale data-cache entry. | open |
| [A-4](#f-a-4) | medium | data integrity | Calibration shrink is fitted on probabilities that already contain the previous shrink, then applied as an absolute factor; its quality check is in-sample | The logged probability is already blended with the armed weights: legacy/index.html:1743-1752 `shWm(base,mkt)=base*calW[mkt]*calG` (floor 0.05), used at :2184 (ML), :2213 (RL), :2453 (props) [...] | Accuracy of every MLB probability: the fitted s is relative to a history generated under a mix of earlier s values, but is applied as if relative to the raw model. [...] | Fit on the raw statement: reconstruct p_raw = pMkt + SH_W_base*(pModel-pMkt) from the stored pModel/pMkt (or store the armed calG and calW on each PredRecord and divide them out), then fit s and the per-market slopes on p_raw. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Mechanism CONFIRMED in code; severity downgraded from high to medium because the loop is latent, not running. | open |
| [B3-2](#f-b3-2) | medium | calibration and backtest | No walk-forward or out-of-sample backtest exists; blend weights are unfitted constants and the 'backtest search' is in-sample | PARLAY_LAB_QUANT_ENGINE.md:146 'the model must beat de-vigged consensus on held-out data or it earns w = 0'; :148 'Walk-forward evaluation: train on past, predict forward, roll. No random shuffles, ever.' [...] | Nothing in the system can tell whether any model input adds information beyond the market price, so losing weights persist indefinitely (see the critical finding). Every calibration number reported to the owner is in-sample and optimistic. | Build tools/walkforward.py (or /api/backtest) over the prediction store: for each date D, fit per-market w on dates < D by regressing (y - pMkt) on (pModel [...] | Re-opened by a second reviewer (confirmed). Reviewer: Core claim confirmed, but the impact is overstated, so I rate it medium rather than high. | open |
| [B3-3](#f-b3-3) | medium | calibration and backtest | Calibration regresses outcomes on the already-calibrated blended probability and uses the slope as the multiplier, producing a feedback loop and unstable weights | src/lib/pred-serialize.ts:246-249 stores p (post-calibration blend), pModel, pMkt and w; gradedFromBlob at :425-448 passes only market, p, edge, lu, res, pMkt, ev, ln, side, susp, pop and drops pModel and w. src/engine2/calibration.ts:385-399 fitReliability is OLS of outcome on stated p [...] | This week's fit input already contains last week's multiplier, so the adjuster chases its own output. Weights swing on a significance flip, not on evidence; stakes and EV on H+R+RBI moved accordingly. | Carry pModel and w through gradedFromBlob (pred-serialize.ts:425-448) and refit on the raw deviation: beta_m = sum((y - pMkt)(pModel - pMkt)) / sum((pModel - pMkt)^2) per market, with date-clustered se, shrunk toward 0 (e.g. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code and on disk; I could not refute it. Severity lowered from high to medium because the channel is shrink-only, floored, and paper-only. | open |
| [B3-4](#f-b3-4) | medium | calibration and backtest | Weekly adjuster restores model weight whenever a test is merely non-significant; pitcher outs went back to full weight | src/engine2/calibration.ts:706-707: `if (pm.significant && pm.direction === "hot") after = Math.max(MULT_FLOOR, cur * (1 - STEP)); else if (!pm.significant && cur < 1) after = Math.min(1, cur * (1 + STEP));`. Significance is 'predicted outside Wilson 95% CI' (:133) with SIG_MIN_N = 50 (:70). [...] | Absence of proof is treated as proof of calibration. The adjuster cannot converge to a low weight: any week the test lacks power, 10% of weight comes back. [...] | Remove the recovery branch. Weight should only rise when an out-of-sample estimate of beta (previous finding) is above the current weight by more than 2 se. Until that exists, pin outs at 0. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in substance, but the headline outs evidence is misattributed and the severity is overstated. | open |
| [B3-5](#f-b3-5) | medium | calibration and backtest | Calibration is fitted on the top-50-by-probability board rows with all populations pooled, not on the bets actually taken | legacy/index.html:2517-2518: rows=cats[k].filter(pred).slice().sort(function(a,b){return b.p-a.p;}); out[k]=rows.slice(0,50). src/lib/pred-serialize.ts:222-262 logs only those category rows (skips 'all' and live rows). [...] | Rows are selected on the model's own preferred side and highest probability, then pooled with rows that were never bettable. The pooled fit reads well calibrated (slope 1.74) while the bet tail loses 12.9 points to implied. [...] | Log every priced line and both sides (not top 50 by p) to the prediction store, tag the bet population, and fit weights on rows with ev above the lock threshold (pop = selected plus the counterfactual shadow at the same threshold). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but the severity is overstated: this is a documented, deliberately deferred design state, not an unknown defect. I did not re-derive the 46.3% / 59.2% / 1.74 figures from pl-history; they are quoted from code comments dated 2026-07-26. | open |
| [B3-11](#f-b3-11) | medium | calibration and backtest | All calibration standard errors assume independent legs; the clustering measurement was never completed | src/engine2/calibration.ts:547-549: 'every SE here assumes INDEPENDENT legs ... Not yet measured on real graded data'. docs/singles-vs-parlays.md:392: 'clustering unit still unmeasured (tools/icc.py has not reported)'; docs/session-handoff.md:7821-7824 ICC rows marked STOPPED. [...] | Significance flags that move weights (Wilson CI at calibration.ts:133, slope + 1.96*se at :596-604) are overstated by an unknown factor, so the adjuster reacts to noise in both directions. | Compute all standard errors clustered by game date (or game), or bootstrap by date. Run tools/icc.py once against exported day blobs and record rho in the docs. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed; I could not refute it. Medium is defensible but sits at the low end, because the adjuster is shrink-only. | open |
| [B3-12](#f-b3-12) | medium | calibration and backtest | Football (CFB and NFL) has no calibration, no closing-line record and no fitted weights | docs/progress.md:429 and docs/session-handoff.md:1560-1562: 'Grading football tickets is not learned football weights; current reviewed game weights are configured constants.' app/api/clv/route.ts:81 is MLB only. [...] | Football carries the larger daily paper allocations yet its probabilities have never been scored against outcomes or against the market. No edge claim for football can be supported or refuted. | Log football board rows to a prediction store with pModel, pMkt (DK/FD no-vig), and result; capture closes; set football model weight to 0 (price-shop only) until a walk-forward test passes. | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in substance; severity lowered to medium and two parts of the impact/evidence need correcting. | open |
| [A-3](#f-a-3) | medium | data integrity | CLV capture is silently lost for whole games (alternate-market allow-list mismatch) and can read the stale cached price instead of the close | (a) src/lib/server/clv-core.ts:95-107 `marketsFor` appends `${market}_alternate` for every prop market on a ticket. src/lib/server/odds-shape.ts:20-56 lists only batter_hits_alternate, pitcher_strikeouts_alternate and batter_home_runs_alternate, and `shapeAllowed` requires `requested.every((x) => [...] | Accuracy of the one metric that validates the model: closing-line value is missing for every prop leg in any game that also has a TB / H+R+RBI / outs leg (and for those legs themselves), biasing the CLV sample toward hits/Ks/HR. [...] | In marketsFor only request `_alternate` for markets present in odds-shape.ts (or add the three missing ladders to the allow-list deliberately). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Could not refute; all three parts confirmed by reading the code. Downgraded high -> medium because CLV is reporting-only. | open |
| [B3-6](#f-b3-6) | medium | calibration and backtest | CLV is not tracked for every pick: MLB only, 45-minute window, no backfill, and locked legs drop the fields needed for fair-value CLV | app/api/clv/route.ts:81 sport key baseball_mlb only; :37 WINDOW_MS = 45 * 60_000; :41 RATE_MS = 25 * 60_000; :139 write skipped when the blob exceeds MAX_BYTES; docs/clv.md:56-61 'No backfill — ever'. src/lib/clv-report.ts:50-87: fairPts = s.consensusFair*100 - lockedFair where lockedFair = l.imp [...] | The one unbiased, fast-converging measure of edge is missing for football entirely and reduced to a price-only number for MLB. A leg whose close snapshot is missed (cron gap, rate limiter, oversize blob) is lost permanently. [...] | Persist imp, est/prob, pModel and w on the stored leg at lock-card.ts:729 and :1221. Add the same close capture to the CFB and NFL props pulls (they already run per event). [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real: every cited line checks out. I downgraded it from high to medium because one claim in the evidence and impact is overstated, and because this is a measurement gap on a paper-only system, not a wrong number or a money path. | open |
| [E2-7](#f-e2-7) | medium | API credits and efficiency | CLV sighting requests an _alternate market the proxy allow-list rejects, so any game with a total-bases, H+R+RBI or outs leg gets no prop closing line at all | src/lib/server/clv-core.ts:96-107 `marketsFor` adds `${market}_alternate` for every prop leg; app/api/clv/route.ts:108 sends that list through `/api/odds` (viaProxy :48-55, returns null on non-2xx). [...] | For every MLB game whose locked legs include total bases, H+R+RBI or pitcher outs, the per-event CLV pull is 403 before reaching the Odds API and `sightProp` never runs for ANY prop leg in that game (including hits / strikeouts / HR legs [...] | In marketsFor add the `_alternate` key only for the three markets that have one in PROP_MARKETS (or share one exported constant between odds-shape.ts and clv-core.ts), and make /api/clv call the Odds API directly with the server key like [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code; could not refute. The finding is understated in scope and slightly overstated in severity. | open |
| [B3-7](#f-b3-7) | medium | calibration and backtest | The owner's model-vs-no-vig-price comparison against real outcomes cannot be run from disk because graded results are never archived | pl-history contains boards, odds and props archives but no per-row outcomes: pl-history/data/hr_overround.json holds aggregates only (days 87, games 423, rows 7581, realized_hr_hitters 923 vs sum_implied 1071.54, overround 1.1609). [...] | The single most important question (does the model beat the price) depends on a store that hit a 403 outage on 2026-10-18 and has a size cap. [...] | In the daily grade-only pass, write each fully graded day blob (with res, pModel, pMkt, w, and DK/FD two-sided prices at log time) to the line-history branch next to the board archive. Then run the walk-forward script on that archive. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed, with the impact partly overstated and the fix needing one correction. | open |
| [C2-1](#f-c2-1) | medium | parlay pricing | Same-game correlation model is side-blind: UNDER legs are priced with the OVER event's joint frequency, so over+under pairs are scaled the wrong way | legacy/index.html:1907 sim grades every prop leg as an over only (`v=val+(lg.base\|\|0)>=Math.floor(lg.ln)+1`); legacy/index.html:2047 `shLegKey(player,mkt,ln)` has no side [...] | Wrong ticket probability on about a third of jointly priced same-game tickets. For teammates whose overs are positively correlated, an over+under pair is negatively dependent, yet the ticket is scaled up and flagged as positively [...] | Give the sim a side-aware key: register each prop leg twice in the sim leg list (over = current test, under = its complement) under a separate `simKey = lkey + '\|O'/'\|U'`, and have build() pass simKey to `jointAll`/`corr` (keep `lkey` [...] | Re-opened by a second reviewer (confirmed). Reviewer: Could not refute: the defect is real and the evidence reproduces, but I rate it medium, not high. | open |
| [C2-2](#f-c2-2) | medium | parlay pricing | Same-game parlays are priced, EV'd and paid as the product of straight leg prices everywhere; DraftKings/FanDuel SGP pricing is not modelled anywhere, and the correlation boost is booked as free edge | Engine: headline dec legacy/index.html:2699, EV :2738, fair :2739, settlement-book product czDec :2743-2746, basis product :2749-2752; up to 2 legs from one game allowed on auto tickets (src/lib/env-adjust.ts:66 `parlayGameCap: 2`; legacy/index.html:2685-2687 second pass relaxes distinct-game). [...] | A same-game ticket cannot be placed at the product of the straight prices: the books price SGPs themselves and pay less on positively correlated legs. [...] | Treat any ticket with 2+ legs from one game as an SGP with price unknown: do not compute EV/Kelly or a paper payout from the leg product; show 'SGP [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code, severity lowered from high to medium. | open |
| [C1-12](#f-c1-12) | medium | selection and staking | No per-game or per-player exposure cap: correlated full-Kelly singles stack on one player or one game | MLB dedupe key is player\|market, or gkey\|mlrl for ML/RL (src/lib/server/lock-card.ts:1006-1013); usedMarkets/usedLegs are the only cross-ticket constraints in :1104-1200 (no game or player stake limit). [...] | Bankroll risk: Hits, Total Bases and H+R+RBI on the same batter, or a team ML plus that team's batters, or side plus total plus several props in one football game, can each take up to $800 as if independent. [...] | Add a per-game and per-player stake cap (for example the max single stake across the correlated group, or a group Kelly haircut) inside pickFound's admit/commit step on both desks. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed: every cited line is accurate and I found no guard elsewhere. Medium holds only as a sizing-model defect; on paper money with an owner-set ceiling it is arguably low-medium. | open |
| [C1-4](#f-c1-4) | medium | selection and staking | MLB writeLock/getLockEntry treat an unparseable ledger blob as an empty ledger and overwrite it (football already guards this) | src/lib/server/lock-card.ts:1304-1310 (`try { JSON.parse(...) } catch { cur = []; }`) then mergeLedgers(cur,[entry]) and a plain SET at :1322 `{ ledger: merged, at: entry.lockedAt, ...(epoch != null ? { epoch } : {}) }` [...] | Record integrity (latent, catastrophic when it fires): one bad read (truncated value, gzip marker mismatch after a rollback, partial write) silently replaces the entire MLB paper ledger with today's entry, drops the resurrection epoch, and [...] | Mirror the football guard: in writeLock and getLockEntry throw a named error when the stored value is non-null but fails to parse (or is not an object with an array ledger); never SET over it. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but I would rate it medium rather than high: the trigger is narrower than the finding says, and the fix scope is wider. | open |
| [E1-4](#f-e1-4) | medium | scheduler and reliability | MLB writeLock treats an unparseable ledger blob as an empty ledger and overwrites it (and drops the epoch); the scheduler self-check reaches that path automatically | src/lib/server/lock-card.ts:1302-1311: `try { const s = raw ? JSON.parse(raw) ... ; if (s && Array.isArray(s.ledger)) cur = s.ledger; epoch = s?.epoch; } catch { cur = []; }` then :1322 `await redis(["SET", LEDGER_STORE_KEY, JSON.stringify({ ledger: merged, ... [...] | One unreadable read (rollback, truncated value, a non-array `ledger`) replaces the entire MLB paper ledger - the whole betting record - with a single day's entry, silently, on an automatic poke. | Mirror the football reader: in writeLock and getLockEntry throw a `LedgerUnreadable` error when `raw` is non-null and either JSON.parse fails or `ledger` is not an array; never SET in that state. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real, but the mechanism on the scheduler path is described wrongly, the proposed fix is incomplete, and "high" is overstated; I rate it medium. | open |
| [D-2](#f-d-2) | medium | grading and ledger | MLB money tickets are graded only in the browser; the server never grades or verifies them | src/lib/server/mlb-day-won.ts:9-11: "An MLB ticket's grading on the shared ledger is written by the DEVICE ... nothing on the server grades a locked MLB ticket." app/ledger/page.tsx:450-480 runs the grader only when the Ledger page is open [...] | MLB tickets stay ungraded until someone opens the Ledger tab on a device holding the sync phrase. Result and payout are whatever that device computed, so the MLB record cannot be reproduced or checked server-side. [...] | Add a server MLB settle pass on the scheduler tick that reuses gradePrediction (src/engine2/grade.ts:62-136) plus the ticket rule in legacy shGradeTicket, writes grading with the same overlay rule football uses (overlayCfbGrading), and [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed, but high is overstated; medium. | open |
| [E3-2](#f-e3-2) | medium | front end | MLB money ledger is graded only when a device has the Ledger tab open; the server never grades it, so /taken, record, P/L and bankroll stall | src/lib/server/mlb-day-won.ts:5-21 comment: an MLB ticket's `grading` on the shared ledger is written by the DEVICE and nothing on the server grades a locked MLB ticket. [...] | Reliability and accuracy of the record: if the owner does not open the MLB Ledger tab, finished MLB bets stay 'live' on /taken forever, the stored ledger carries no result, and every figure built on it (P/L, ROI, record, drawdown, bankroll [...] | Add a server grading pass to the scheduler (night poke and the next morning) that grades pending MLB tickets from final box scores using the same grading function the device uses, writes `grading` to pl:ledger:v1, and leaves the device [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but high is overstated; I rate it medium. | open |
| [D-3](#f-d-3) | medium | grading and ledger | Every ledger write is read-modify-write with a plain SET (no compare-and-set), so concurrent writers can drop each other's records | src/lib/server/lock-card.ts:1302-1322 (GET, merge, SET); app/api/ledger/route.ts:126-149; app/api/nfl/ledger/route.ts:99-117; src/lib/server/football-lock.ts:482-495 (claim), :515-521 (rollback), :754-759 (found write), :340-374 (settle); app/api/clv/route.ts:133-139. [...] | Scheduler found passes, the settle pass, CLV and device syncs all hit the same key on the same :00/:15/:30 minutes. A lost update removes freshly locked tickets or a just-written grade with no error. [...] | Store a version counter in the blob and write through one Lua EVAL that SETs only if the stored version still equals the one read (retry on mismatch), or take a short SET NX PX lease per ledger key around every read-merge-write. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but the finding misses a partial guard and overstates severity; I rate it medium, not high. | open |
| [D-4](#f-d-4) | medium | grading and ledger | 900 KB single-blob cap is a hard ceiling; past it MLB grading can never sync and football locks and settles stop | src/lib/ledger-merge.ts:110-111 (MAX_ENTRIES 500, MAX_BYTES 900_000) and :140 (validateLedger rejects a device ledger over the cap with 400). app/api/ledger/route.ts:135-137 returns 413. MLB writeLock has no size check at all (src/lib/server/lock-card.ts:1301-1324 [...] | Found mode appends tickets on every pass (hourly MLB, every 15 minutes football), each carrying full leg objects, a games map and grading. When a ledger crosses 900,000 characters, grading and CLV for that sport stop with no alert. [...] | Split storage per day (pl:ledger:v1:<date> plus an index) or roll settled days older than N into a monthly archive key before the cap check. Add the size check and a push alert at 70% to writeLock and all football writers. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Verdict: the finding is real and every cited line checks out, but I rate it medium, not high. It is a slow, fail-closed, paper-only ceiling with a one-line stopgap, and nobody has measured how close any ledger is. | open |
| [D-5](#f-d-5) | medium | grading and ledger | The ledger can be changed after the fact by any holder of the sync phrase; validation is shape-only | src/lib/ledger-merge.ts:114-142: validateLedger checks only the date pattern, locked===true, core being an array, placed/actualStake types and size. It does not check stakes, prices, legs, grades, payouts, or whether the date's games had started. [...] | A device copy that already carries grading wins the merge, so its prices, leg text, games map, verdicts and payouts become the stored record. Whole back-dated days can be added. [...] | Have the server stamp each server-locked ticket with a content hash over legs, price and stake, and refuse or restore any device copy whose hash differs. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed by reading the cited code and by running the real merge kernel against synthetic days (probe at /private/tmp/claude-501/audit-out/d5/t.ts, bundled with the repo's esbuild; nothing written to the checkout). | open |
| [E1-2](#f-e1-2) | medium | scheduler and reliability | redis() discards the store's error body and has no timeout, retry or failure accounting | src/lib/server/store.ts:50-58: `const r = await fetch(env.url, {... cache: "no-store" }); if (!r.ok) throw new Error(`store ${r.status}`);` - no AbortSignal, no retry, the response text (where Upstash states the reason, e.g. a plan/bandwidth limit) is never read. [...] | Diagnosis of the two-week outage was guesswork; a hung Upstash connection holds a function until its maxDuration (90 s scheduler, 60 s lock routes) instead of failing fast; a single transient 5xx fails a whole poke. | In redis(): `signal: AbortSignal.timeout(8000)`; on !r.ok read `(await r.text()).slice(0,300)` and throw a typed `StoreError{status, body}`; retry once (200 ms backoff) for network errors/5xx on idempotent reads (GET/MGET/SMEMBERS) [...] | Re-opened by a second reviewer (confirmed). Reviewer: The code evidence is real, but "high" is overstated; this is an observability and resilience gap, not a correctness defect, so I rate it medium. | open |
| [E1-3](#f-e1-3) | medium | scheduler and reliability | board-archive workflow fails green: a store outage (or a missing board) silently ends the permanent board archive | app/api/board/route.ts:75-78 returns HTTP 200 `{ board: null, reason: `store-unreachable: ...` }` ('never a hard failure'); :27 does the same for store-not-configured. [...] | Every MLB board from 2026-10-18 through the end of the postseason is permanently missing from the history branch (unrecoverable after the 3-day TTL) [...] | Make tools/archive_boards.py exit non-zero when any fetched reason starts with `store-unreachable` or `store-not-configured`, and when fetch() returns None after its 3 tries [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed the mechanism and the gap; downgraded from high because the causal part of the impact is unproven and the system is paper-only. | open |
| [E1-5](#f-e1-5) | medium | scheduler and reliability | One external free-tier scheduler drives everything, with no watchdog; the two Vercel backup pokes cannot reach any grading/refill slot | vercel.json crons are only `/api/scheduler?poke=evening` 45 21 * * *, `/api/scheduler?poke=night` 0 0 * * *, and two Sunday `/api/nfl/lock` pokes (0 16 * * 0, 0 17 * * 0); there is no cron for /api/calibrate, /api/clv or a health route. [...] | If the cron-job.org row is disabled, rate-limited, deleted or its secret goes stale, MLB grading and refills stop entirely, football found-mode gets at most 2 passes a day, the weekly model fit never runs, and nobody is told. [...] | Add a second, independent trigger plus a watchdog (see notes): a GitHub Actions workflow on main with `*/15 15-23,0-2 * * *` that calls /api/scheduler with the secret from a GitHub secret (the route is idempotent per slot/block), and a [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code, with corrections; severity downgraded high -> medium. | open |
| [E1-9](#f-e1-9) | medium | scheduler and reliability | Store traffic is unmetered and grows without bound: the grade pass re-reads every prediction day ever logged 5 times a day, year-round, and every poke reads three full ledgers | app/api/calibrate/route.ts:128 `SMEMBERS DAYS_SET`, :302-307 `for (const date of allDays) { ... const blob = await redisGetJson<DayBlob>(dayKey(date));` - one GET per logged date on EVERY run, grade-only included (:387 'written on EVERY run, grade-only or full') [...] | Daily store bandwidth/commands rise linearly with season length and never fall, which is the failure mode behind the Oct-2026 plan-limit outage [...] | Cache per-date graded rows once a date is fully settled and older than GRADE_DAYS (one compact `pl:pred:graded:<date>` or a single rolled-up key) and read raw day blobs only for the grade window [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, with corrections. Paths relative to /private/tmp/claude-501/pl-audit. | open |
| [E2-2](#f-e2-2) | medium | API credits and efficiency | /api/odds proxy is an unauthenticated credit-drain: only the host and the markets x regions pair are validated, so any sport, the 10x historical endpoint and cache-busting params all pass | app/api/odds/route.ts:33-38 checks only `url.hostname === ALLOWED_HOST` and `shapeAllowed(url)`; :47-55 an unauthenticated call is served via `next: { revalidate: 240 }` keyed on the full caller-supplied URL (no auth is required for the cached path [...] | Anyone who knows the URL can spend the account's Odds API credits: every distinct query string is a new cache key and a new billed upstream call (6 credits for a us,eu 3-market pull [...] | In /api/odds: require the sync phrase / passcode for ANY upstream-reaching call, allow-list the path (`/v4/sports/(baseball_mlb\|americanfootball_ncaaf\|americanfootball_nfl)/(odds\|events\|events/<id>/odds)` only, never `/historical/`), and [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code; I could not refute the mechanism. Severity lowered from high to medium on impact grounds. | resolved adc3d1a (section 10) |
| [E2-3](#f-e2-3) | medium | API credits and efficiency | Found-mode polling ignores time-to-start: football re-buys the game lines every 15 minutes all day and MLB re-buys the full props slate hourly | src/lib/server/grading-progress.ts:191-192 `FOUND_MLB_SLOTS_PT = everyMinutes(8, 19, 60)` (11 passes) and `FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8, 19, 15)` (44 passes). app/api/scheduler/route.ts:134-136 forwards both football locks on every authed poke [...] | ESTIMATES (formula markets x regions; the 6-credit football pull was measured, football-lock.ts:404). Football: up to 44 x 6 = 264 credits/league/day [...] | Cadence by time-to-start: one pass at open, then hourly until T-3h, then every 15-30 min inside T-3h, and only for events inside that window (per-event `commenceTimeFrom/To` or event-level calls). [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code; severity lowered from high to medium because the cadence is owner-authorised and the cost figures are upper bounds. | open |
| [E2-5](#f-e2-5) | medium | API credits and efficiency | x-requests-last is never read and three spending routes read no quota header at all, so every per-call cost in the repo is an out-of-date estimate | `grep -rn "x-requests-last" src app tools` -> no hit in code (only prose at docs/credit-budget.md:184). app/api/generate/route.ts:81-101 `serverFetchJson` returns only `{ ok, body }` (fetch at :95); app/api/propsnap/route.ts:46-58 `oddsFetch` returns only the JSON [...] | Nobody can state what a day costs: the largest spender (MLB generate) logs nothing, the football tally over- or under-counts by an unknown factor (31 vs a formula ceiling of 15 per event), and budgeting decisions (found cadence [...] | Wrap every Odds API fetch in one helper that reads x-requests-last / -used / -remaining and appends `{at, route, sport, markets, cost, remaining}` to a per-day Redis list (one RPUSH); sum x-requests-last instead of delta-of-used [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed by opening every cited file; I could not refute the core claim, but two parts of the impact are overstated and one path is wrong. | open |
| [E2-6](#f-e2-6) | medium | API credits and efficiency | The quota instrument is dead on the current plan and nothing alerts on low credits while every in-app ceiling is infinite | tools/quota.mjs:84 `export const PLAN_SIZE = 20_000;`, :85-90 `violatesIdentity` rejects any reading where remaining + used != 20,000, :114-115 'quota identity violated — NOTHING IS APPENDED'. docs/credit-budget.md:1-3 states the plan is 100,000 credits since Sept 19. [...] | There has been no recorded quota reading for ~98 days. If the month's credits run out (or the key is drained through the public proxy), every desk degrades to 'odds missing' and keeps poking every 15 minutes with no alert [...] | Set PLAN_SIZE from the first reading of the period (or 100_000) so the tool appends again; run the free `/v4/sports` read on the existing scheduler once a day and store it [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real; I could not refute any of the cited evidence, but severity is overstated and two details need correcting. | open |
| [E2-9](#f-e2-9) | medium | API credits and efficiency | Passive football props re-pricing is driven by page loads with no finite budget: live games re-buy up to 24 events every 10 minutes | src/lib/cfb/rules.ts CFB_PROPS (:460-515): `maxEvents: 60`, `revalidateSec: 7200`, `liveRevalidateSec: 600`, `liveMaxEvents: 24`, `dailyBudget: Number.POSITIVE_INFINITY`, `measuredCreditsPerEvent: 31`. src/lib/server/football-props.ts:250 answers from Redis only while the board is fresh [...] | ESTIMATE (formula ceiling 15 markets x 1 region per event; the repo's own constant is 31): one full CFB Saturday pre-kick pass = 60 x 15 = 900 credits (1,860 at 31) [...] | Restore a finite daily ceiling sized to the plan (e.g. 100,000/30 minus the scheduled spend) with the existing live-reserve split; scale the upcoming-game window by time to kickoff (e.g. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed: every cited constant and code path is as described, and I found no guard that caps football props spend. The credit totals are unverifiable ceilings, and the proposed ceiling reverses a deliberate owner decision. | open |
| [B3-10](#f-b3-10) | medium | calibration and backtest | Every calibrate run, including the five daily grade-only ticks, re-reads every day blob since 2026-07-25 inside a 60-second function | app/api/calibrate/route.ts:42 maxDuration = 60; :302-333 loops `for (const date of allDays)` and calls redisGetJson<DayBlob>(dayKey(date)) for every calibration-eligible date (CAL_START = '2026-07-25', src/engine2/calibration.ts:657) [...] | Redis reads and bandwidth grow linearly with the season (about 85 day blobs by mid-October, several times a day). This is the same store that hit the bandwidth problem fixed in b29961e and the 403 outage of 2026-10-18 [...] | Once a date has no pending rows, write a compact per-date graded projection (or per-market sufficient statistics) to its own key and read only that; read full blobs only for the last GRADE_DAYS dates and stranded retries. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed from the code; the evidence lines are exact. One impact claim is overstated and the size of the problem is unmeasured. | open |
| [E3-1](#f-e3-1) | medium | front end | Ledger 'Pro scoreboard' never counts a graded ticket: it tests for "win"/"loss" but stored results are "won"/"lost" | src/components/mlb/ProScoreboard.tsx:93 `if (res.includes("win") \|\| res.includes("loss") \|\| res === "w" \|\| res === "l")` and :95 `const won = res.includes("win") \|\| res === "w"`. [...] | Accuracy of the record: the panel's 'Graded tickets' (ProScoreboard.tsx:163-165) is always 0, 'Verdict maturity' (:169) always 0%, and the calibration buckets (:174-192) never render, directly beneath tiles that show the true W-L. [...] | Replace the substring test with exact matches: `const won = res === "won"; const lost = res === "lost"; if (won \|\| lost) { graded++; ... }`. Add a unit test feeding one won and one lost ticket and asserting graded === 2. | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED the defect; severity overstated (medium, not high). | resolved d928a55 (section 10) |
| [E3-3](#f-e3-3) | medium | front end | Every MLB Ledger number is recomputed in the browser from localStorage, and the CLV tile/projection ignore the era and core/fun filter the other tiles use | app/ledger/page.tsx:433-434 `eraList = eraEntries(api.entries, era)`, `stats = ledgerStats(eraList, scope)`; :435-436 `proj = api.projection`, `clv = api.clv` (not filtered). [...] | Accuracy: P/L, ROI, record and drawdown come from the device's local mirror, so two devices (or a device that has not synced) can show different records for the same stored ledger. [...] | Add one server report endpoint (e.g. /api/report) that reads the three stored ledgers and returns staked, returned, P/L, ROI, W-L-P, pending, CLV per sport, per book (DK / FD / combined) and per era. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The cited evidence is real, but "high" is overstated and one supporting claim is wrong. I rate it medium, and only the CLV tile part carries that. | open |
| [E3-4](#f-e3-4) | medium | front end | 'Beat the CZ close' compares a DraftKings locked price with a Caesars close fetched in the browser from an archive that stopped on 2026-10-28 | src/components/mlb/ProScoreboard.tsx:17 `RAW = "https://raw.githubusercontent.com/.../line-history/data/props"` fetched client-side per entry date (:73); :50 closeFor reads the archive row's `cz`; caption 'Beat the CZ close' (:158); footer says 'your locked DraftKings price' (:195) [...] | Accuracy: the closing-line-value figure in this panel is cross-book (DraftKings entry vs Caesars close), which is not CLV, and for any card after 2026-10-28 there is no close to compare so coverage is zero. [...] | Stop reading the raw GitHub archive from the browser. Serve closes from the server's own CLV sightings for the book the bet was recorded at (DraftKings or FanDuel), label the column with that book, and show the coverage count (n legs with [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but severity is overstated and one impact claim is wrong. | open |
| [P-6](#f-p-6) | medium | prior audit regression | HR one-sided fair price still uses a hard-coded 1.06 overround against a measured 1.161 | legacy/index.html:2491 `var fair=oneImp/1.06` and :2605 `iO/1.06`; /private/tmp/claude-501/pl-history/data/hr_overround.json: days 87, rows 7581, appeared overround 1.1609, verdict "overround 1.161 vs the hardcoded 1.06 -> czEV overstated ~6.2pp". [...] | Every HR-anytime row's fair probability and EV is overstated by roughly 6 points wherever it is displayed (Board, generator, manual slips). [...] | Replace the constant with the measured value read from data/hr_overround.json (refreshed by the existing Sunday hr-overround workflow), with 1.16 as the fallback, and store the value used on the row. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-7](#f-p-7) | medium | prior audit regression | M10 walk-rate shrinkage was specified and built only in the shadow path; live expected-AB is still unshrunk | Live: legacy/index.html:2308-2309 `var bbr=shBlend(st,...,"ab",10)\|\|0.09; var expAB=pa*(1-shClamp(bbr,0,.25,"2309")*0.9);`. Specified fix `shShrink(bbr, n, k~75, lgBB)` (docs/freeze-exit-bundle.md:58) exists only in the shadow block at legacy/index.html:2434. | The audit measured about 12 pp of residual span across expected at-bats 3.0-4.6 on the hits board, the largest structure on that board. Hits and total-bases overs for low-walk hitters stay overpriced and high-walk hitters underpriced. | Move the shadow's shrunk walk rate into the live expAB line behind a flag, replay on archived boards, then arm it. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-8](#f-p-8) | medium | prior audit regression | M4, M6, M7+M9, M12 simulator-routing and distribution defects never shipped | legacy/index.html:2389-2396: the pregame sim marginal replaces the closed form only for batter_hits_runs_rbis (M4 TB/HR routing absent; M12 sim-vs-closed-form heat unresolved). No strikeout-count outcome in the sim (M6); the only per-starter sim output is outsBySP* at :1854-1871. [...] | Pitcher strikeouts, a market the found card bets, is priced with no simulation of the quantity and its same-game combinations fall back to a naive product [...] | Take these in the register's own order after M2/M10/M11: add strikeouts as a sixth plate-appearance outcome with a second RNG stream, then route TB to the sim, and settle the Poisson-vs-binomial question from graded outcomes by expected-AB [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-9](#f-p-9) | medium | prior audit regression | M13: props archive still omits alternate lines and still records Caesars as the settlement book | tools/snapshot_props.py:24 MARKETS = six standard keys, no *_alternate; :27 `CZ = "williamhill_us"`; request at :323 `regions=us`; identical lines in /private/tmp/claude-501/pl-history/tools/snapshot_props.py. Settlement book in the app is DraftKings (src/lib/sportsbook/books.ts:12). [...] | The stored history cannot answer what DraftKings and FanDuel offered on the alternate ladders the engine prices, and the archive's settlement-price fields (cz/czf) describe a book the owner cannot use, so any backtest or closing-line study [...] | Add the three alternate keys to MARKETS, change CZ to draftkings (or store DraftKings and FanDuel explicitly as named fields), stamp a schema version on each file, and add the register's guard that the sweep list is a superset of the [...] | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-10](#f-p-10) | medium | prior audit regression | M28 passcode is still write-only, and /api/calibrate still allows any caller when CRON_SECRET is unset | app/settings/page.tsx:328 and :361-362 read/write localStorage `pl_pass`; grep for `pl_pass\|passHeader\|x-pl-pass` in app and src returns only those plus the two server readers app/api/odds/route.ts:49 and app/api/sharp/route.ts:70 - no client sends the header and src/lib/pass.ts does not exist. [...] | If APP_PASSCODE is set, the app's own fresh-odds and Sharp requests are refused (the client can never present it); if it is not set, those endpoints, which spend Odds API credits, are open to anyone with the URL. [...] | Add the specified passHeader() helper and spread it into the six fetch sites, or remove the passcode UI and document the endpoints as open. Make /api/calibrate fail closed like the scheduler. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-11](#f-p-11) | medium | prior audit regression | Weekly calibration refit depends on an external scheduler that cannot be seen from the repo; the in-repo scheduler only grades | vercel.json has no /api/calibrate cron (four crons only: scheduler evening/night, nfl lock sunday-early/standard). docs/cron-jobs.md:22 lists the full fit as a cron-job.org job (Sundays 10:00) the owner was creating on 2026-08-06. [...] | If the external job was never created or has stopped, the calibration summary and blend weights silently stop updating while grading continues, and the engine keeps blending with stale multipliers. [...] | Stamp the last full-fit time into the board echo and alert when it is older than eight days; or move the Sunday fit into vercel.json so its schedule is version-controlled. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-12](#f-p-12) | medium | prior audit regression | H+R+RBI suspension (autopsy fix 3 / Phase 2) lifted on all three generators; the suspended-market tagging is now inert | Engine default `hrrAltMax:-1` (whole market suspended, legacy/index.html:1087) is overridden to 99 by src/lib/paper-mode.ts:133-143 at app/api/generate/route.ts:438, app/api/scheduler/route.ts:255, src/lib/engine-client.ts:125; tagging site legacy/index.html:2524 therefore never tags an HRR row. [...] | The market the prior audit called its most mispriced is back in the engine's parlay pool, the generator and the ranked lists without a suspended tag, and HRR unders can be seated on the found card. [...] | Either restore the tag for HRR overs (so they show as suspended everywhere, matching what the found card already enforces) or record an explicit retirement of the suspension with the current graded numbers by side. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [A-5](#f-a-5) | low | data integrity | Model context and priors frozen at 2026-07-29 were applied for the rest of the season with no vintage check; the bullpen-fatigue factor is still live on that stale file | public/model/context.json: `generated_at 2026-07-29T20:31:58+00:00`, `date 2026-07-29`, `bullpen_last3` for 30 teams; public/model/priors.json: `generated_at 2026-07-29T15:58:41+00:00`. .github/workflows/context.yml commits only `data/ump_k.json` ("context.json commit PAUSED 2026-07-29"). [...] | Accuracy: every MLB board after 2026-07-29 adjusted run expectation by up to -4%/+5% per team from bullpen workloads of 27-29 July - noise presented as signal [...] | In the loader, compare `ctx.date` to the slate date and drop `bullpen_last3` (factor 1) and per-game context when they differ [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real but the impact is overstated, so I downgrade it from medium to low. The staleness is the direct result of an owner-signed-off pause, and the bullpen factor reaches far less of the board than claimed. | open |
| [A-6](#f-a-6) | low | data integrity | MLB lock uses the request-START clock for board time, ticket time and the started-game test, and has no quote-age gate | app/api/generate/route.ts:144 `const now = Date.now();` taken before the odds pull; :442-443 `collectSlate()` then `analyze`; :518 `encodeBoard({ date, at: now, data })`; :635-639 `buildLockEntry` with the same `now`; :454-468 started-game stamp is "Recorded, never enforced". [...] | Record integrity, bounded: a game that starts while the slate is being collected still tests as not-started and can be locked at a price that is already in-play or suspended, labelled pregame; `foundAt` understates when the price was seen. [...] | Re-read `Date.now()` after `collectSlate()` and use it for board `at`, `foundAt` and `startedGkey`; require start > lockNow + a safety margin (e.g. 2 min) [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but I would downgrade to low: the race is real and unguarded, yet the window is about a minute, no archived board shows it happening, and this is paper trading. | open |
| [A-7](#f-a-7) | low | data integrity | NFL prop grading turns a real zero into a wash: a player missing from an ESPN box category stays pending, then is washed after 48 hours | src/lib/football/prop-settlement.ts: `PAPER_PROP_STATS` maps pass_yds/pass_tds/rush_yds/receptions/rec_yds to ESPN box labels with the comment "Only explicitly posted, numeric final stat cells count [...] | Record accuracy: an active player with no carry / no catch is absent from that category, so an over that lost and an under that won are both booked as washes. [...] | Treat a missing category as 0 when the player appears anywhere in that game's box score (any category) or in the played roster; void only when the player is absent from the whole box (true inactive). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code; could not refute the mechanism, but severity is overstated and several citations are off. | open |
| [A-8](#f-a-8) | low | data integrity | Per-book quote index lets DraftKings' alternate-ladder price overwrite its standard over/under price for the same line | src/lib/sportsbook/mlb.ts:31-34 folds `_alternate` markets onto the standard key (`lk=...m.key.replace(/_alternate$/,'')`, point-0.5) and writes `[b.key]={am:o.price,...}` to `${gkey}\|${lk}\|${side}` - last market iterated wins. [...] | Small price error (median 0.17%) in anything that reads `bookQuotes` - per-book display, reprice-by-book, and any future two-book (DK vs FD) line-shopping built on this index. [...] | Keep standard and alternate quotes under separate keys, or let the standard market win when both exist for the same book/line/side; if the alternate is genuinely the better bettable price, record which market it came from. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [A-9](#f-a-9) | low | data integrity | Grading, CLV and found-dedupe keys are `label\|prop` with no game key (doubleheader collision) | legacy/index.html:3639 `legRes[l.label+"\|"+l.prop]` and :3698-3701 `var lid=l.label+"\|"+l.prop; if(!legRes[lid])legRes[lid]=shGradeLeg(...)` - first graded result is reused for any later leg with the same label and prop. src/lib/server/clv-core.ts:78-79 `lid = `${l.label}\|${l.prop}``. [...] | On doubleheader days an identical leg in game 2 is rejected as `found_leg_used` (a missed bet), and where two tickets do hold the same label+prop in different games the second would inherit the first game's grade and CLV. [...] | Key all three maps by `gkey\|lkey\|side` (the leg already carries gkey at src/lib/server/lock-card.ts:1196-1222) with a fallback to the old key for legacy tickets without gkey. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [A-10](#f-a-10) | low | data integrity | Football odds-event matching: exact and alias tiers have no kickoff/date window | src/lib/cfb/names.ts:84-187 `matchOddsEvent`: tiers 1 (exact normalized names) and 2 (alias) pick the event with the nearest commence time with no bound (:162-168); only tier 3 (fuzzy token overlap) requires `\|t-kickoff\|<=windowMs` and the same PT date. | If the same two teams appear twice in the Odds API window (rematch, conference title game, rescheduled game, NFL divisional rematch listed early) and the current week's event is missing or not yet priced, the other game's lines are [...] | Apply the same time window and same-PT-date test to tiers 1 and 2; when no event passes, return unmatched and count it. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [A-11](#f-a-11) | low | data integrity | HR overround study uses the day's last snapshot as 'the close', which covers only the late games | /private/tmp/claude-501/pl-history/tools/hr_overround.py (~line 143) `snap = snaps[-1] # last read before the slate = the close`. `python3 /private/tmp/claude-501/audit-out/areaA/props_poststart.py` over pl-history/data/props/*.json (103 days): the last snapshot of each day holds 523 HR events [...] | Accuracy of a fitted constant: the measured anytime-HR overround that informs the HR de-vig is estimated on a time-of-day-selected ~56% of events (late/west-coast games) and at varying distances from first pitch, so the constant may not [...] | For each event take its own last snapshot with snapshot time < event start (per-event close), and report the overround by hours-to-start so the dependence is visible. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [B1-8](#f-b1-8) | low | MLB model quality | One-sided markets are de-vigged with a hard-coded 1.06 while the stored measurement says 1.16; the same haircut is applied to over-only total-base, hits and outs rows | legacy/index.html:2491 `var fair=oneImp/1.06` (any row with no two-sided fair), :2605 `iO/1.06` for the browse fair. /private/tmp/claude-501/pl-history/data/hr_overround.json: days 87, games 423, rows 7,581, sum_implied 1071.54, realized_hr_hitters 923, overround 1.1609 (all_listed 1.1763), with [...] | Accuracy: every home-run EV on the Board is overstated by roughly 6 pts of probability-relative edge, and over-only milestone prices in other markets get the same too-small haircut. [...] | Replace 1.06 with a per-market, per-book overround measured from the archive (home runs about 1.16 on the stored aggregate [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed, but the practical impact is display-only for home runs and the non-home-run part is overstated, so I rate it low rather than medium. | open |
| [B1-12](#f-b1-12) | low | MLB model quality | Integer prop lines are priced without a push: the under is credited with the push probability | legacy/index.html:1543 `shPOver(line,lam){return 1-shPoisCdf(Math.floor(line),lam);}` and the under is taken as 1 minus that (:2472). `python3 -I /private/tmp/claude-501/audit-out/areaB/b5_tests.py` (T7): 69 pre-game pitcher_outs rows carry an integer line (1,088 half lines) [...] | Accuracy on about 6% of outs rows, in the direction (unders) the outs model already over-selects; no effect on other markets in the archive. | For integer lines compute P(over) = P(X > line), P(push) = P(X = line), and compare prices on the no-push conditional (or grade EV with the push as a refund); add a unit test at an integer line. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [B1-13](#f-b1-13) | low | MLB model quality | Total-bases formula is wrong at 2.5 and 3.5+ (latent: almost no such rows are priced today) | legacy/index.html:1549-1550: the 2.5 branch counts every one-hit game that is not a single or a home run as <= 2 TB (a triple is 3) and the 3.5+ branch `1-(P0+P1+P2*(s1+s2)*(s1+s2))` counts every one-hit game as an under, including a home run (4 TB), and ignores three-hit games [...] | None on today's card; wrong probabilities the moment alternate total-base ladders (a DraftKings/FanDuel staple) are turned into rows. | Replace the branch table with an exact compound sum over hit count and per-hit base distribution (single/double/triple/home-run shares, shrunk), valid for any line [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [B2-11](#f-b2-11) | low | football model quality | First-half sigma of sigma/sqrt(2) is an assumption with no tie or key-number handling | H1_SIGMA_SCALE = Math.SQRT1_2 (src/lib/cfb/markets.ts:37), described at :12-16 as a 'documented assumption' of independent equal-variance halves; applied at src/lib/cfb/h1.ts:35-36; 1H ML blends market and spread-implied only (h1.ts:46-58). [...] | Display-only today: 1H grades and EVs on the Board and in hand-built parlays rest on an unfitted scale, and half-time ties (a real outcome for 1H ML) and 1H key numbers are not modelled. No paper money is staked on it. | Fit the 1H margin and total spread from ESPN linescores already used for grading, model the half-time tie explicitly, and keep 1H off the card until then. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [B3-8](#f-b3-8) | low | calibration and backtest | Slope-band criteria the project's own docs call unusable still drive live weights; the global shrink never fired | src/engine2/calibration.ts:473-475: 'at the measured within-market sigma_p (0.022-0.064) its SE at n=100 is 0.78-2.27, so a [0.85,1.15] band admits a perfectly calibrated market only 5-15% of the time'; :544-545 'The SLOPE needs ~13,100 legs in that market for a 2-sigma test'. [...] | The global shrink is a no-op in practice (a pooled slope dominated by market variance always lands in band at s = 1), and per-market slope multipliers fire or release on noise. [...] | Replace both with the deviation regression from the feedback-loop finding; drop the [0.85, 1.15] band. If a pooled fallback is wanted, fit one pooled beta on (y - pMkt) vs (pModel [...] | Re-opened by a second reviewer (confirmed). Reviewer: Partly confirmed, partly mischaracterised; severity is overstated. | open |
| [B3-9](#f-b3-9) | low | calibration and backtest | Full refit depends on one external cron job, the route fails open without the secret, and the 45-logged-date window shrinks and goes stale | vercel.json has no /api/calibrate cron; docs/cron-jobs.md:22 lists the calibrate job as an external one ('Josh creating 2026-08-06 ... Sundays 10:00'); app/api/scheduler/route.ts:416-418 forwards only /api/calibrate?grade=only. [...] | If the external job stops, weights freeze silently. The window will carry late-season/postseason multipliers into next April unchanged. A board cannot be reproduced after the fact because the multipliers in force are not stamped. | Add a Vercel cron for the Sunday full fit (or have the scheduler run it when lastRun is older than 8 days). Make authed() fail closed like the scheduler (scheduler/route.ts:156). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every piece of cited evidence checks out, but the impact is overstated; I would rate this low, not medium. | open |
| [B3-14](#f-b3-14) | low | calibration and backtest | Audit tools are not reproducible and a known under-shrinkage result remains unfixed | tools/hrr_clamp_audit.py and tools/hrr_ladder_audit.py hard-code input /private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/43a0f1e0-7096-4c57-aa94-4cc966766115/scratchpad/b-2026-07-26.json; `ls` of that path returned 'No such file or directory'. [...] | Past audit conclusions cannot be re-run or checked; a documented model defect sits unaddressed; a whole-number run line that lands exactly would grade as a loss. | Point the two HRR tools at pl-history/data/boards/2026-07-26.latest.json.gz via an argument; add a held-out split to recency_weights.py; add the push case to grade.ts:86; correct the comment. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [C1-5](#f-c1-5) | low | selection and staking | MLB found lease is taken AFTER the paid slate pull, a failed/busy lock burns the hourly slot, and the in-flight top-up yield is dead code | app/api/generate/route.ts:445 eng.collectSlate() (114-150 Odds credits per the refill route comment) runs before the found lease at :582-587 (busy -> throws 'FOUND LEASE HELD ... this pass locked nothing'). [...] | Credits and reliability: two overlapping triggers (ticker + manual Refresh, or a double tap) each buy a full slate; the loser throws after spending and, if it was the scheduled slot, marks that slot fired with zero tickets so no bets are [...] | Claim before spending: take the found lease (or a SET NX claim row keyed by date+slot) before collectSlate and release in finally. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The cited code is all real, but the impact is overstated and one causal claim is wrong; I rate it low, not high. | open |
| [C1-6](#f-c1-6) | low | selection and staking | Commence-time check and foundAt use the request-start clock, up to 300 s (MLB) / 60 s (football) stale, with no safety margin | MLB: app/api/generate/route.ts:144 `const now = Date.now()` once at request start, maxDuration 300 (:42); the same `now` is passed to buildLockEntry (:635-646) after collectSlate and the board write; lock-card.ts:1099-1103 startedGkey compares game start to that `now` [...] | Record accuracy: a pass that begins shortly before first pitch/kickoff can record a bet after commence_time while stamping it as pre-game, at a pre-game price that may no longer be offered. [...] | Take a fresh Date.now() immediately before candidate filtering (after the slate pull, inside the lease) and require start - now >= a margin (e.g. 2 minutes). Stamp foundAt with that fresh clock. | Re-opened by a second reviewer (confirmed). Reviewer: The code facts are confirmed, but the impact is overstated and the ":00 slots" claim is backwards; I rate this low, not medium. | open |
| [C1-8](#f-c1-8) | low | selection and staking | Football found pass keeps buying a priced board every 15 minutes after the day's ceiling is reached (funOpen ignores that fun is off on straight days) | src/lib/server/football-lock.ts:699 `const funOpen = !entry.funT.length && !cfbFunRefusedOf(entry).length && ahead >= cfg.rules.fun.legs.min;` and :700-702 `if (base.room < FOUND.minStake && !funOpen) return skipped`. [...] | Credits: once room is exhausted the free early-exit never triggers, so every remaining poke (up to 44/day per desk) spends an Odds API game-lines pull to lock nothing. | `const funOpen = foundFunOf(date) > 0 && !entry.funT.length && ...` so the room check short-circuits on straight days. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but the severity is overstated: this is a bounded credit inefficiency that only bites on a day a football desk actually hits its ceiling, and I could not find evidence that has happened. | open |
| [C1-9](#f-c1-9) | low | selection and staking | Football props are attached only on NFL's first found lock and never on CFB or on any append pass, while the UI preview plans props against a null entry | src/lib/server/football-lock.ts:834 `if (args.attachProps && args.ahead > 0) await args.attachProps(slate)` is the only props attach on a found path (foundFirstLock); foundPassDate :710-736 plans without props. [...] | Profit and UI honesty: +EV NFL props that appear after the morning lock, and all CFB props, can never be locked; the Builder preview shows prop bets and a full $2,500 of room that the server will not act on (it also ignores the day's [...] | On append passes read the stored props board (found.ts already enforces a 30-minute stamp) and attach it before planFound, for both desks; or remove props from the preview. Pass the stored day entry to previewFootballCard instead of null. | Re-opened by a second reviewer (confirmed). Reviewer: Half confirmed, half refuted; severity overstated. | open |
| [C1-10](#f-c1-10) | low | selection and staking | Room exhaustion silently drops +EV bets and is mislabelled; greedy EV% order plus first-come passes; football 2.6 decimal cap on singles | src/lib/found-mode.ts:186-207 pickFound: `if (room < FOUND.minStake) break;` ends selection. src/lib/server/lock-card.ts:1196 `for (const c of cands) if (!picked.has(c.id) && !blockedBy.has(c.id)) reasons.found_under_min_stake++` counts every candidate left after the break as 'under min stake'. [...] | Profit and diagnosability: as few as 4 max-stake bets fill the day, so later, better +EV bets (evening slates, late line moves) are dropped and the refusal log reports the wrong reason. [...] | Add a distinct `found_no_room` reason. Size all day candidates jointly (or cap any one bet at a share of remaining room / reserve room per pass) instead of first-come full Kelly. [...] | Re-opened by a second reviewer (confirmed). Reviewer: I opened every cited file. The code evidence is accurate, but only the mislabel is a defect; the other two parts are documented owner decisions, so medium is overstated. | open |
| [C1-11](#f-c1-11) | low | selection and staking | Historical allowlists and off-switches still gate straight bets (under quota, HRR-over ban, HR ban, outs off, narrow market lists) | Under quota: src/lib/under-bias.ts:1-20 (UNDER_BIAS.overShare 0.75; header quotes the owner's rule as scoped to 'use in parlays', from 3 days of data) [...] | Profit and model learning: +EV unders are refused purely by count, MLB game totals and whole prop families never reach the candidate list, and blanket bans prevent collecting the outcomes needed to recalibrate those markets. [...] | Replace count quotas and blanket bans with per-market, per-side calibrated shrink weights (a weight of 0 where evidence says so), add totals to the MLB straight markets, and log refused candidates as shadow bets so the bans can be tested [...] | Re-opened by a second reviewer (confirmed). Reviewer: The cited code is real and the under-quota arithmetic is right, but two parts of the impact are wrong and the severity is overstated. I rate it low, not medium. | open |
| [C1-13](#f-c1-13) | low | selection and staking | Low-severity items: 2-decimal price rounding on straights, carried game start overwritten, non-atomic lease release, unfenced football ledger SET, early end of cadence | (a) lock-card.ts:194 `czDec: r2(czDec)` and :197 `bsDec: r2(bsDec)`; settlement uses czDec (src/lib/ticket-payout.ts:34-43), so e.g. -103 (1.9709) settles as 1.97. (b) lock-card.ts:1284 `games: { ...(carry?.games ?? {}), ...games }` lets a later run replace a carried game's {pk,start} [...] | Small systematic payout rounding error on every straight; possible wrong start time for a carried game after a reschedule; theoretical lost-update windows on the football ledger; no found pass for late West-coast games after the last slot. | Store and settle at the unrounded decimal (or the American price); keep the earliest-known start unless the feed marks a reschedule; release the lease with a compare-and-delete Lua script and add a version field checked before SET [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [C2-4](#f-c2-4) | low | parlay pricing | Engine parlay headline price, EV, fair and 'to win' use best-of-any-book per leg, and the 'basis' ticket price mixes DraftKings and FanDuel legs | legacy/index.html:2699 `dec` is the product of each leg's best price at any book; :2738 `evT=prob*dec-1`; :2759-2760 stake ladder and `toWin=Math.round(stake*(dec-1))` from that dec; :2749-2752 `bsDec` is the product of per-leg better-of-DK/FD. [...] | The 'basis' EV on 38% of tickets is the EV of a ticket that cannot be placed (half at DraftKings, half at FanDuel), and the headline odds/EV/to-win describe a price built from books outside DK/FD. [...] | Compute two whole-ticket prices in build(): dkDec (all legs at DraftKings) and fdDec (all legs at FanDuel), null if any leg is missing at that book; set the basis to the larger and record which book. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in part: the engine fields are as described, but the two cited page paths are dead and nothing ranks or selects on these prices today, so medium is overstated. I downgrade to low. | open |
| [C2-5](#f-c2-5) | low | parlay pricing | MLB parlay grading checks pending and ungradable before lost, so a ticket with a losing leg can sit outside the record | legacy/index.html:3634-3637 order is pending -> ungradable -> lost (football checks lost first: src/lib/cfb/grade.ts:349-351). src/lib/ledger-stats.ts:48-49 skips pending and ungradable tickets entirely (not staked, not lost). [...] | A multi-leg ticket that already has a lost leg plus one leg that can never be graded (postponed game, missing box score row) is recorded as ungradable: its stake never enters staked or losses, so parlay ROI and the prediction-parlay hit [...] | Reorder both graders to lost -> pending -> ungradable (a lost leg decides the ticket regardless of the others), then re-grade stored multi-leg tickets once and report how many flip from ungradable/pending to lost. | Re-opened by a second reviewer (confirmed). Reviewer: The ordering is real, but the impact is overstated and both worked examples in the finding are wrong. Downgrade to low. | open |
| [C2-6](#f-c2-6) | low | parlay pricing | Void leg handling differs by sport: football voids the whole parlay (payout 0, not counted), MLB divides the leg out | src/lib/cfb/grade.ts:350 any ungradable leg -> ticket `ungradable`, payout 0 (pushes are dropped and repriced at :354-358; a leg pending past the void window is turned into ungradable at :335-338). MLB: legacy/index.html:3640-3651 divides void and push legs out of the ticket price. [...] | A football double or 3-5 leg fun parlay with one cancelled/void leg and the rest winning drops out of the paper record instead of paying at the reduced price, which is what a sportsbook does with a void leg. [...] | In settle(), treat an ungradable (void) leg like a push: skip it, multiply the remaining leg prices, return the stake if no leg stood. Keep 'ungradable' only for a ticket where no leg price is stored. | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real: I opened all three cited files and the behaviour is as described, but I would rate it low, not medium, and the proposed fix is too broad. | open |
| [C2-7](#f-c2-7) | low | parlay pricing | Fun HR longshot and H+R+RBI ladder tickets allow same-game legs and multiply raw, unshrunk probabilities | src/lib/fun-hr.ts:101 the only exclusion is one-per-team, so two hitters from opposing teams in one game can share a ticket; price and probability are plain products at :121-122 and EV at :131 (header :24-26 says naive multiplication). [...] | Each HR leg's probability is overstated by the too-small de-vig and that error compounds across 3-8 legs, so the stored probability and EV of every fun ticket are too high [...] | Add a one-leg-per-game rule (gkey) to buildFunHrTickets and cut the ladder to one leg per game; feed both composers the shrunk probability [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but severity is overstated: this is dormant, paper-only, small-stake code, so low rather than medium. | open |
| [C2-8](#f-c2-8) | low | parlay pricing | Parlay sets still contain duplicate tickets, and same-game groups the sim cannot grade are priced as independent with no flag | Tickets are pushed without a duplicate check at legacy/index.html:2798, :2809, :2819. Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_parlay_probe.py`: 1884 duplicate tickets (same set, same leg list) on 125 of 142 boards [...] | Duplicates take list slots and per-player cap room from distinct tickets. Two pitchers' strikeout or outs legs from one game (opposing starters share the game's length and run environment) are multiplied as independent and the ticket [...] | De-duplicate by sorted leg-key string before each push. Stamp `jointUnpriced: true` on any ticket with a same-game group the sim could not grade and exclude it from EV ranking (or add K/outs legs to the sim). | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [C2-9](#f-c2-9) | low | parlay pricing | Small payout-maths edge cases in parlay code | (a) legacy/index.html:3647-3649 a void/push leg whose stored `cz` is null is not divided out, so the ticket pays as if that leg had won. (b) legacy/index.html:3598 run-line leg is `(margin+pt>0)?"won":"lost"`, an exact-margin result on a whole-number line grades lost instead of push. [...] | Each is a cents-to-few-percent error on rare tickets: an overpaid ticket when a void leg has no stored price, a mis-graded whole-number run-line push, a display glitch, and a slightly generous football EV/stake on spread and total legs [...] | (a) grade the ticket ungradable when a void/push leg has no stored price; (b) add `margin+pt===0 -> push`; (c) guard decToAm for dec <= 1; (d) store 4 decimals; (e) compute EV as win x dec + push [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [D-6](#f-d-6) | low | grading and ledger | NFL player-prop legs with no ESPN stat row are voided at 48 hours instead of settled, then vanish from the record; CFB props can never settle | src/lib/football/prop-settlement.ts:4 ("absent athletes are never zero") and :12-19: a player is recorded only if he has a row in the ESPN stat group that carries that key. src/lib/cfb/grade.ts:126-128: missing stat gives pending "final player statistic unavailable" [...] | An active player with zero carries or zero targets has no row, so an Over that lost (or an Under that won) is recorded as a void and drops out of staked, W-L and ROI. [...] | Read the ESPN summary roster/participation data to tell did-not-play (void per sportsbook rules) from played-with-no-stat (settle at 0). Match by ESPN athlete id stored on the leg at lock rather than by display name. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The code path is confirmed, but the finding overstates its reach and visibility; I rate it low, not medium. | open |
| [D-7](#f-d-7) | low | grading and ledger | MLB run line and moneyline grading ignores shortened games and has no run-line push; suspended games are voided permanently | legacy/index.html:3583-3584 and src/engine2/grade.ts:69-71: any state matching /final\|game over\|completed/ grades, which includes rain-shortened "Completed Early" games; /postpon\|suspend\|cancel\|forfeit/ returns void. [...] | On a shortened game a run-line ticket is graded won or lost where sportsbook rules I recall (not verifiable offline) void run lines and totals short of 9 innings (8.5 with the home side ahead). [...] | Carry innings played from the linescore into GameStatus. Void RL (and any future totals) when fewer than 9 innings (8.5, home ahead) were played; keep ML action after 5 (4.5). Add `margin+pt===0` as push. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Could not refute the code claims: every cited line is as described. Severity is overstated (low, not medium), and the suspended-game half is weaker than the shortened-game half. | open |
| [D-8](#f-d-8) | low | grading and ledger | Doubleheader handling is fragile: leg results and ticket ids ignore the game, the stored game reference can be overwritten, and one real mis-pointing needed a hard-coded repair | legacy/index.html:3639 and :3699-3701: leg results are stored and looked up by `label\|prop` with no gkey, first leg with that text wins. legacy/index.html:2985-2987: shTicketId hashes only type plus sorted `label\|prop`, so the same side in game 2 of a doubleheader produces the id already on the [...] | A locked leg can be graded against the other game of a doubleheader (it happened once and was fixed by hand in code). The second game's identical bet can never be recorded. Any future recurrence needs another code change to repair. | Store gamePk and scheduled start on every leg at lock time and grade from the leg's own pk. Key leg results by `gkey\|lkey`. Include gkey in the ticket-id hash. Never overwrite an existing games[gkey] that a locked ticket references [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every citation checks out, but the impact is overstated and the proposed fix is unsafe as written; I rate this low, not medium. | open |
| [D-9](#f-d-9) | low | grading and ledger | MLB payouts are computed from a decimal price rounded to two places, not the locked American price | src/lib/server/lock-card.ts:145 (`r2 = Math.round(x*100)/100`) and :194 (`czDec: r2(czDec)`). legacy/index.html:3645 (`baseDec = confirmed != null ? amToDec(confirmed) : t.czDec`) and :3654 (`payout: Math.round(t.stake*eff*100)/100`). [...] | The booked return differs from the real DraftKings return by up to 0.005 x stake per winning ticket. Worked example: $800 at -140 pays $1,371.43 at the book; 800 x 1.71 books $1,368.00, a $3.43 understatement. [...] | Settle MLB tickets from the leg's stored American price (`cz`) via amToDec at full precision, or store czDec at 4+ decimals. Keep rounding to cents only on the final payout. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code; severity overstated (low, not medium). | open |
| [D-10](#f-d-10) | low | grading and ledger | MLB stats silently exclude ungradable and merge-dropped tickets; an ungradable MLB ticket never resolves | src/lib/ledger-stats.ts:48-49: pending and ungradable tickets are counted but excluded from staked and return; only e.core and e.funT are iterated (:42), so tickets the merge moved to coreDropped/funDropped with a settled receipt (coreDroppedPL / funDroppedPL, src/lib/ledger-merge.ts:722-738) are [...] | A ticket that cannot be graded sits outside the record indefinitely, and a settled ticket dropped by a merge loses its P/L on the MLB desk. [...] | Show ungradable tickets as an explicit open-exposure line with age, alert when one is older than 48 hours, and add coreDroppedPL/funDroppedPL receipts to MLB ledgerStats and realizedPL the way CfbLedger does. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [D-11](#f-d-11) | low | grading and ledger | Epoch archive key is hard-coded to e1, so a future epoch bump would clear the ledger with no new archive | src/lib/ledger-epoch.ts:21 (`EPOCH_ARCHIVE_KEY = "pl:ledger:archive:e1"`); src/lib/server/ledger-epoch-server.ts:25-28 writes the archive with SET ... NX and then resets the live ledger. [...] | The next deliberate "clear the ledger" would destroy the paper-era record instead of archiving it. | Derive the archive key from the epoch being retired (pl:ledger:archive:e<cur>) and refuse to reset unless the archive write returned OK or an identical archive already exists. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [D-12](#f-d-12) | low | grading and ledger | CLV sightings on the ledger keep the base copy's value rather than the latest, and oversized CLV writes are skipped silently | src/lib/ledger-merge.ts:1589-1591: `out.clv = {...other.clv, ...out.clv}`, so the base copy's sighting wins per leg regardless of each sighting's `at`. app/api/clv/route.ts:139: `if (blob.length <= MAX_BYTES) await redis(["SET", ...])` with no else branch or log. [...] | The closing-line record, which is the main honesty check on the model, can hold an earlier sighting than the true close and can stop updating without notice. | Merge CLV per leg by greatest `at`. Log and alert when the write is skipped. Key sightings by gkey plus lkey. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [D-13](#f-d-13) | low | grading and ledger | Score-orientation repair rewrites stored grade detail strings in place with no prior value kept | legacy/index.html:3661-3676 (shGradeOrientFix overwrites g.detail). Prior audit item M22 lists this as still missing in /private/tmp/claude-501/audit-out/prior-audit-regression.md. | A stored settlement detail can change after the fact with no trace, which weakens any later audit of how a ticket was graded. | Keep the original string under detailPrev with a timestamp, or apply the orientation fix at render only. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E1-6](#f-e1-6) | low | scheduler and reliability | Slot ticks have a hard 15-minute window and no catch-up: one late or missed poke skips that grade/refill/found slot for the day | src/lib/server/grading-progress.ts:119-131 `decideSlotTick` fires only when the Pacific minute-of-day is in [slot, slot+15) (GRADE_SLOT_WINDOW_MIN = 15 at :57) and the ticker cadence is also 15 minutes, so exactly one poke can land in each window. [...] | A single dropped cron-job.org execution, a 500 from a store blip, or a deploy in progress at :00 loses a refill slot (bets not placed) or a grading slot (record stale until the next slot, up to ~15 h after 16:45 PT). [...] | Persist `pl:slot:<date>:<kind>:<slot>` (SET NX, EX 2 days) when a slot's work succeeds; in decideSlotTick fire for the most recent slot of today that has no success stamp and is less than e.g. [...] | Re-opened by a second reviewer (confirmed). Reviewer: The mechanism is real, but the impact is overstated; I would rate it low, not medium. | open |
| [E1-7](#f-e1-7) | low | scheduler and reliability | Missing/rotated CRON_SECRET: lock routes fail closed with only a response body, /api/calibrate fails OPEN, and CLV carries the secret in the URL | Fail closed, silent: app/api/scheduler/route.ts:161-163 (503 'scheduler-not-configured: CRON_SECRET unset - failing closed'), app/api/cfb/lock/route.ts:281-283, app/api/nfl/lock/route.ts:105-107; a wrong secret is 401 + console.warn (scheduler :164-167, cfb :284-287). [...] | An emptied or rotated secret produces a complete silent outage (every poke 503/401) while leaving /api/calibrate callable by anyone, who can trigger grading/fit writes. The secret also sits in request logs for the CLV row. | Use cronHeaderAuthed in calibrate and return 503 when CRON_SECRET is unset (same wording as the other routes); accept header auth on /api/clv and switch the cron-job.org row to a header [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every cited fact is in the code, but the impact is overstated and the finding bundles four small items; I rate it low, not medium. | open |
| [E1-8](#f-e1-8) | low | scheduler and reliability | Timeouts do not line up: the 90 s scheduler awaits un-timed forwards into a 300 s generate; football forwards abort at 25 s while the callee keeps running | app/api/scheduler/route.ts:45 `maxDuration = 90`; block fire fetch at :396-399 and gradeForward at :417-422 have no signal/timeout; src/lib/server/refill.ts:83-101 forwardMlbRefill likewise [...] | A generate longer than ~85 s gets the scheduler killed by the platform: the poke returns a timeout/500, the generate result (including lock errors) is never logged by the scheduler, and repeated timeouts are what makes external cron [...] | Give every forward `AbortSignal.timeout(80_000)` and report `pending` rather than failure on abort; better, use `waitUntil`/`after()` to detach the generate and return 202 with a run id, and let the next poke read the outcome from a [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every cited piece of evidence checks out, but the stated impact is overstated: this is a reporting gap, not a data or card-correctness problem, so I rate it low rather than medium. | open |
| [E1-10](#f-e1-10) | low | scheduler and reliability | Coverage gaps in the poke window: London/Europe NFL kickoffs are never reachable, nothing runs after 02:45Z, and a statsapi outage is indistinguishable from an off day | Ticker = every 15 min, UTC hours 15-23 and 0-2 (docs/cron-jobs.md:17). London/Germany kickoffs: docs/cron-jobs.md:889-894 'London / Germany 13:30Z kickoffs are NOT reached ... Open item for Josh'; app/api/nfl/lock/route.ts:56-61 (lock one hour before the first kickoff [...] | International NFL games (several Sundays a season) are never bet; a statsapi outage on a game day silently produces no MLB card and no record of why; overnight results and the win/loss record lag by up to ~10-12 hours. | Add two Sunday pokes for the early-window lock (`45 12 * * 0` and `45 13 * * 0` to /api/nfl/lock, covering EDT and EST) via Vercel cron or the GitHub backup ticker [...] | Re-opened by a second reviewer (confirmed). Reviewer: The finding is real: every cited line matches the checkout. I rate it low rather than medium, because each gap is small on a paper-trading system and the largest ones are already documented open items. | open |
| [E1-11](#f-e1-11) | low | scheduler and reliability | GitHub Actions workflows cannot fail loudly: no timeouts, no failure notification, push steps that lose work, and a daily no-op commit to the production branch in the off-season | `grep -c timeout-minutes .github/workflows/*.yml` = 0 for all seven files (board-archive, context, hr-overround, line-history, model, props-history, ufc); `grep -n "if: failure()\|secrets\.\|continue-on-error"` returns nothing. [...] | A hung step can burn up to the 6 h default; lost snapshots and stale model inputs are invisible; production is redeployed daily for a no-information file change, each deploy being a window in which a poke can fail. | Add `timeout-minutes: 10` to every job; add a shared final step `if: failure()` that creates/updates an issue labelled `automation-failure` [...] | Re-opened by a second reviewer (confirmed). Reviewer: The cited facts are real, but the title and impact are overstated; this is low-severity ops hygiene on a paper-trading system, not medium. | open |
| [E1-12](#f-e1-12) | low | scheduler and reliability | Cron guard test contradicts vercel.json (standing red or dead guard), and the scheduler docs/comments still describe a two-cron, scheduler-only setup | tests/vercel-cron-pokes.test.ts:61 requires every cron path to start with `/api/scheduler` and :70 `expect((cfg.crons ?? []).length).toBeLessThanOrEqual(2)` ('Hobby plan cap'). Static evaluation with node against vercel.json: `crons 4 allScheduler false <=2 false` - both assertions fail as written. [...] | Either the suite has a permanent red that hides new failures, or the guard is being ignored; and if the Hobby cap comment is still true, whether the two NFL Sunday crons are actually registered cannot be known from the repo. | Update the guard to the real invariant (allowed path prefixes `/api/scheduler`, `/api/nfl/lock`, `/api/health`; distinct paths [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E1-13](#f-e1-13) | low | scheduler and reliability | Errors swallowed without a log on the lock and alert paths | app/api/nfl/lock/route.ts:221 and :274 `catch { /* Side picks remain available if props fail. */ }` around attachProps - no log, no field in the response [...] | A props-feed outage silently narrows the football card to sides; undelivered bet alerts are permanent with no summary; corrupt registry keys read as 'nothing there'. | Return `propsError` in the lock body and console.warn it; count terminal `no-config`/`no-device`/`gave-up` alerts per day into the health record; log the calibrate ledger-read failure [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E2-4](#f-e2-4) | low | API credits and efficiency | Every game-lines call uses regions=us,eu (2 regions) to fetch books the owner cannot bet; a <=10-book bookmakers= list halves it, while strict bookmakers=draftkings,fanduel would break the consensus rules | src/lib/cfb/rules.ts:366-367 CFB_ODDS_URL and src/lib/nfl/rules.ts:169-170 NFL_ODDS_URL: `regions=us,eu&markets=h2h,spreads,totals`; MLB engine legacy/index.html:1257 with `regions: "us,eu"` from app/api/generate/route.ts:404 and src/lib/engine-client.ts:362; src/engine2/sharpBoard.ts:10 [...] | ESTIMATE: every game-lines call costs 3 markets x 2 regions = 6 instead of 3 x 1 = 3 (Odds API rule: up to 10 bookmakers = 1 region-equivalent). Per found day that is 264 -> 132 (CFB Saturday), 228 -> 114 (NFL), 2 -> ... [...] | Replace `regions=us,eu` with one curated list of <= 10 keys that contains the two bettable books plus the sharp anchors the consensus needs, e.g. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed real, but it is a cost optimisation rather than a defect, and the saving is a small share of the plan, so I rate it low rather than medium. | open |
| [E2-8](#f-e2-8) | low | API credits and efficiency | Redundant paid pulls of the same market: NFL first lock buys the game lines twice in one request, and three MLB routes ask for the same lines under different cache keys | NFL first found lock: src/lib/server/football-lock.ts:810 `slateFromEspn` (game lines), then :834 `args.attachProps(slate)` -> app/api/nfl/lock/route.ts:220-221 `footballPropsGet(NFL_LEAGUE, ..., { forceFresh: true })` -> src/lib/server/football-props.ts:185 `espnEventsOf` again and :192 [...] | ESTIMATE: 6 wasted credits plus two ESPN reads and one extra store write on every NFL first lock; up to 6 + 4 extra credits whenever the Board/Sharp page and CLV land inside the same 4-minute window as a generate [...] | Let `footballPropsGet` accept an already-built slate (skip espnEventsOf/slateFromEspnOf when the caller supplies one). Normalise the MLB game-lines URL to one canonical string shared by engine, SharpDesk and CLV. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Evidence confirmed in code, but the impact is overstated; medium should be low. | open |
| [E2-10](#f-e2-10) | low | API credits and efficiency | Artificial limits left from the 20,000-credit era: MLB live pulls capped at 3 events per pass and MLB props capped at the first 16 events | src/lib/mlb/live-props-rules.ts:136-144 'EVERY pass is capped at `probeEvents`' while `rateMeasured: false`; src/lib/server/mlb-live-quote.ts:661 `const allowed = probing ? Math.min(affordable, cfg.probeEvents) : affordable;` and :779 'every pull is capped at ${cfg.probeEvents} events until a real [...] | On an MLB day with more than three games in play at a live slot, only three get in-play prop lines, so live bets/found passes see a fraction of the board even though the daily budget is now infinite. [...] | Run the 3-event probe once with x-requests-last logged, write the measured rate, flip `rateMeasured`, and remove the probe cap [...] | Re-opened by a second reviewer (confirmed). Reviewer: The evidence is real at HEAD 8ab9e46, but I rate it low rather than medium: the live cap is a documented, deliberately retained guard with a manual bypass, and the 16-event cap almost never binds. | open |
| [E2-11](#f-e2-11) | low | API credits and efficiency | Store traffic: every football slate build writes the whole slate to Redis, and one lock poke re-reads the whole ledger several times over one-command-per-request REST | src/lib/cfb/slate-server.ts:160 `await redis(["SET", `pl:discovery:${cfg.id}:${date}`, JSON.stringify(slate), "EX", 129600])` runs inside `slateFromEspnOf` on every call [...] | With 2 leagues x 44 found pokes a day plus page loads, that is on the order of 100+ full-slate writes and several hundred whole-ledger transfers a day. [...] | Write `pl:discovery` only when the slate content hash changed (or only from the scheduled lock path, not from public GETs). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Partly confirmed, but the ledger half is overstated and cites a dead path. Severity should be low, not medium. | open |
| [E2-12](#f-e2-12) | low | API credits and efficiency | The paid props archive keeps one-sided prices only for Caesars, a book the owner cannot bet | tools/snapshot_props.py:27 `CZ = "williamhill_us"`; :67-68 `is_cz = bk["key"] == CZ`; per-book prices (`fp`) are stored only when a book posts BOTH sides (`if "o" in pair and "u" in pair` block), and the only one-sided per-book record is `if is_cz: r["cz"] = {...}` [...] | For one-sided markets (HR 'Yes' ladders and other milestone lines) the archive on the line-history branch cannot say what DraftKings or FanDuel were offering at the open or close, so closing-price and overround studies for the only two [...] | Store `dk` and `fd` one-sided records alongside `cz` in `compact()` (zero extra credits - the keys are already in the response), and make the settlement-book constant read from the same source as src/lib/sportsbook/books.ts (SETTLE_BOOK = [...] | Re-opened by a second reviewer (confirmed). Reviewer: CONFIRMED in code and in the stored data; severity lowered from medium to low and two details corrected. | open |
| [E2-13](#f-e2-13) | low | API credits and efficiency | Dead and duplicated code: 16 tracked iCloud conflict copies, two odds desks that can only 403, and market lists copied by hand across files | `git ls-files \| grep -E " [2-9]\.[a-z]+$"` -> tests/timezone-parity.test 3.ts, tools/build_ufc 3.py, tools/build_ufc 4.py, tools/burn-report 3.mjs, tools/burn-report 5.mjs, tools/guard-diff-audit 3.mjs, tools/guard-diff-audit 4.mjs, tools/hr-pair-dependence 3.mjs, tools/m10_eiv 3.py [...] | No credit cost. The conflict copies can be picked up by test globs or type checks (the project already had a local build broken by such copies), the UFC/All-Star surfaces are shipped but cannot load odds, and hand-copied market lists are [...] | Remove the conflict copies from the index in one commit and add a `* [2-9].*` ignore rule; either add the UFC/All-Star shapes to the allow-list or remove those desks from the nav [...] | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E3-5](#f-e3-5) | low | front end | DraftKings prices are labelled 'CZ' or shown with no book tag; Caesars/Nevada wording remains on money screens | app/props/page.tsx:374 `const book = r.displayBook ? bookName(String(r.displayBook)) : "CZ"` while :255 defaults the same data to "DK"; src/lib/sportsbook/mlb.ts:83 returns the row with no displayBook when the selected book is the settlement book, so the default DraftKings view takes the "CZ" [...] | Accuracy of what the owner reads: on moneyline/run-line rows the price shown carries no book name at all, prop rows say DK, and several screens still say CZ or NV for a DraftKings number. [...] | Remove the 'hide the tag when it is CZ' rule and always render the short tag of the book the price came from (row.displayBook ?? row.settlementBook ?? SETTLE_BOOK). [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every cited line exists and reads as quoted, and the behaviour is as described, but the number shown is always the right book's price, so this is a labelling defect and I rate it low, not medium. | open |
| [E3-6](#f-e3-6) | low | front end | Book selector offers seven books with Caesars first, and unstamped data silently falls back to Caesars in four places | src/lib/sportsbook/books.ts:1-9 BOOKS = Caesars (williamhill_us), DraftKings, FanDuel, BetMGM, BetRivers, Fanatics, Pinnacle. src/components/sportsbook/SportsbookSelector.tsx:8 renders all seven. [...] | Accuracy: five of the seven selectable books cannot be bet in Arizona, yet selecting one re-prices EV, grade and Kelly in the browser (src/lib/sportsbook/football.ts:14-20, mlb.ts:84-89) and blanks the board's trap/pass notes (mlb.ts:107). [...] | Restrict the selector to DraftKings, FanDuel and 'Best of DK/FD'. Change the four fallbacks to SETTLE_BOOK. Keep the other books only as a read-only sharp reference (Pinnacle) that never drives EV, grade or stake. | Re-opened by a second reviewer (confirmed). Reviewer: Partly real, overstated; the second half of the proposed fix is wrong. | open |
| [E3-7](#f-e3-7) | low | front end | Day card prints '$X of $NaN' for server-locked MLB days | app/ledger/page.tsx:317 renders `${tix.length} tickets · $... of ${e.daily + e.fun}`. Server found entries are written without a top-level `fun`: src/lib/server/lock-card.ts:1266-1296 (entry literal has daily, bankroll, paperCfg{daily,fun,since} but no fun) and src/lib/ledger-merge.ts:811 comment [...] | Accuracy of a money figure on every found-mode day card since 2026-10-03; the day's ceiling (which is $2,500 plus that day's wins) is not shown correctly anywhere on the card. | Compute the ceiling as `(e.daily ?? 0) + (e.fun ?? 0)` for legacy days and, for found days, show the real room: daily + sum of foundWonBy profit. [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed real by reading the code; I could not refute it. Severity is overstated: this is a broken label, not a wrong number that could mislead. | open |
| [E3-8](#f-e3-8) | low | front end | Collapsed MLB ticket rows show a blank price for found-mode bets and no book | app/ledger/page.tsx:261-263 prints `t.confirmed != null ? amSign(t.confirmed) + ' (NV)' : String(t.czOdds ?? "")`. The stored found ticket (src/lib/server/lock-card.ts:1207-1229) has czDec, bsDec, legs[].cz and settlementBook but no czOdds. Nothing in the ticket row reads settlementBook. | Accuracy: the price the bet was recorded at is not visible on the ledger row for every bet since found mode began, and the book is never shown, so the stored record cannot be checked against a sportsbook slip from this screen. | Derive the American price from czDec (or the single leg's cz) when czOdds is absent and append the book tag from t.settlementBook. For the two-book system store `book` and `price` on the ticket explicitly and render those. | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code, but the impact is overstated, so I rate it low rather than medium. | open |
| [E3-9](#f-e3-9) | low | front end | The Card page shows the legacy allocator's hypothetical card and pre-found instructions, not what the server will lock | app/builder/page.tsx:516-520 `card = shCardCalc(d)` when unlocked and :553-558 `shadow = shCardCalc(d)` when locked (the old daily/fun multi-leg allocator); :913-960 'If unlocked — current card ... Hypothetical' [...] | Accuracy: the page headed as today's card can show tickets, stakes and a bankroll that have no relation to what the paper system actually bets. The owner cannot preview the next found pass from the UI. | On found days, replace the shCardCalc card/shadow with the server's own candidate list (same filter and foundStake the lock pass uses) plus the already-locked bets; show remaining room as daily + wins − staked [...] | Re-opened by a second reviewer (confirmed). Reviewer: Confirmed in code; I could not refute it, but I downgrade it from medium to low. It is display-only on the MLB desk, and the locked panel at the top of the page shows the real server bets. | open |
| [E3-10](#f-e3-10) | low | front end | No visible build indicator, and the self-update compares commit SHA only, reloads once per SHA per session, and is a no-op when the SHA is empty | Command: `grep -rn 'BUILD_SHA\\|api/version' src app next.config.ts` returns only src/components/shell/SwRegister.tsx:6,19,24,28 and next.config.ts:10-11 — no component renders the SHA. SwRegister.tsx:19 `if (!BUILD_SHA) return false` [...] | Reliability: the owner has no way to confirm which build the phone is running. Two deployments of the same commit (redeploy after an env change, or a CLI deploy of an uncommitted tree) share a SHA so the installed app never reloads [...] | Expose a deployment identity (env NAME VERCEL_DEPLOYMENT_ID, plus build time) through /api/version and NEXT_PUBLIC_*, compare that instead of the commit SHA, and print 'build <short sha> · <time>' in the Settings Data panel and the rail [...] | Re-opened by a second reviewer (confirmed). Reviewer: Evidence confirmed by opening the files; severity overstated (low, not medium). | open |
| [E3-11](#f-e3-11) | low | front end | Service worker cache name is a fixed literal, so nothing is ever purged; icons and fonts are cache-first forever; offline fallback points at a redirect | public/sw.js:4 `const CACHE = 'parlay-lab-next-v1'`; :10-16 activate deletes only caches whose name differs from CACHE (never true); :38-49 cache-first for /_next/static/ and any .png/.woff/.woff2 with no revalidation [...] | Reliability and speed: every deployment's hashed chunks accumulate on the phone indefinitely; a replaced icon or font under the same URL is never picked up; the offline fallback for an uncached route is likely a miss. [...] | Name the cache with the build id so activate actually purges old entries, use stale-while-revalidate for png/woff, and fall back to the cached '/games' document. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E3-12](#f-e3-12) | low | front end | /taken feed and push alerts carry no book name, no loss amount and no totals; ungradable bets are shown as 'void' | src/lib/bet-alert.ts:93-96 alertBody is `ticket words + American price + ($stake)` with no book; :129 void, ungradable and cancelled all map to 'void'. app/taken/page.tsx:193 prints an amount only for wins (`+$${Math.round(r.payout - r.stake)}`); the page has no P/L, ROI, record or book column. [...] | Accuracy: the one screen that lists every bet the system took cannot tell the owner which book to place it at, shows losses without an amount, and has no running result. [...] | Store `book` on every found ticket in all three sports; add it to alertBody ('DK' / 'FD') and to each /taken row; show −$stake on losses; add a header strip with today's and all-time staked, P/L, ROI and W-L split DK / FD / combined [...] | Re-opened by a second reviewer (confirmed). Reviewer: Every code claim checks out, but the impact is overstated; I rate it low, not medium. | open |
| [E3-13](#f-e3-13) | low | front end | Profit and ROI are adjacent on the ledgers but there is no staked tile on MLB, no book split, no combined core+fun or all-sport view | MLB: app/ledger/page.tsx:653-657 Net P/L, :659-663 ROI, :665-670 Record, :672-675 Max drawdown, :677-685 CLV; scope is core or fun only (comment :397-399 rules out a combined net). [...] | Accuracy of reporting: ROI is shown without its denominator on MLB, results cannot be compared by book, and there is no single number for the whole paper account across MLB, CFB and NFL. | Add a Staked tile beside Net P/L and ROI on every ledger; add a three-way DK / FD / Combined segmented control that drives all tiles from the server report; add an 'All sports' summary row at the top of the Ledger. | Re-opened by a second reviewer (confirmed). Reviewer: Evidence confirmed by opening the files, but this is a presentation gap and partly a feature request, not a wrong number, so I rate it low rather than medium. | open |
| [E3-14](#f-e3-14) | low | front end | The only 'not offered' control is a Caesars-era, display-only, per-device hide that never reaches the lock pass or the record | src/lib/cz-offered.ts:9-17 header 'IS THIS PICK OFFERED AT CAESARS RIGHT NOW?' and states it is display-only and never touches the engine, the card or the record; storage key `pl_cz_hidden_v2` (:35); keys scoped `book:${book}:${k}` unless Caesars (:171-173). [...] | Paper profit accuracy: a market that Arizona DraftKings/FanDuel does not offer can still be locked by the server and counted in the record; marking it on the Board only hides the row on that device. | Add a server-stored 'not available in AZ' list (sport, market, book, optional player/game) written from a control on each Board row and each /taken row [...] | Re-opened by a second reviewer (confirmed). Reviewer: Core claim confirmed, but one part of the description is wrong and the impact is unproven, so I downgrade from medium to low. | open |
| [E3-16](#f-e3-16) | low | front end | Settings 'Device passcode' is a dead control: saved to localStorage and never sent or checked | Command: `grep -rn 'pl_pass' src app` returns only app/settings/page.tsx:328 (read into state), :361 (setItem) and :362 (removeItem). The panel at app/settings/page.tsx:454-465 says it gates spend-money actions and must match the APP_PASSCODE environment variable. | Reliability/credits: the UI promises a spend gate that does not exist in the client; the real gate is the sync phrase header. Misleading, and a prior-audit item still open (prior-audit-regression.md M28). | Remove the panel, or send the value as a header on the credit-spending routes and verify it server-side. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [E3-17](#f-e3-17) | low | front end | Rest-of-season projection simulates with the model's own win probabilities and a season end that has passed | legacy/index.html:3974-4004 shProjection draws each stored ticket as a win with probability t.prob/100 and runs to SH_CFG.seasonEnd; seasonEnd is "2026-09-27", so days is 0 and the function returns null today. Rendered at app/ledger/page.tsx:723-744 when non-null. [...] | Accuracy: when it is shown it projects bankroll growth from the model's unverified edge rather than from realised results. Currently hidden only because of a stale date constant. | Either delete the panel or bootstrap from realised per-ticket returns (resample settled tickets), and label it as such. | Not independently re-verified (low severity; area auditor's evidence only). | open |
| [P-13](#f-p-13) | low | prior audit regression | M14/A1/A2/A4 allocator amendments never shipped; A3 decision due 2026-09-22 not found | legacy/index.html:3083 `base:probMode?prob:...` with probMode true for ev_gated and dk_fd (:3032) - price-blind ranking unchanged; fixed EV floor :3033/:3039 (A2); perParlayCap 0.25 at :1069 and :3138 (A4) [...] | None on the money path today because found mode does not call the allocator (src/lib/server/lock-card.ts:260). It still shapes the device Builder's card preview and would re-arm unchanged if found mode were switched off. | Either delete the dead allocator path from the lock flow or ship A1 (edge-aware base weight) before any return to engine-allocated cards; record the A3 decision. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-14](#f-p-14) | low | prior audit regression | M20/M24/M26: legacy selection modes still selectable and the Kelly ceiling and oversizing banner are still mode-gated | app/settings/page.tsx:74 and :77 still offer `probability` and `caesars_ev`; src/lib/engine-client.ts:58 persists them. Kelly ceiling applied only when `disciplined` (legacy/index.html:3139-3146) while p.kelly is stamped in every mode (:3377-3381). [...] | The Builder can still display a card sized far above its own computed Kelly ceiling with the warning suppressed. It cannot be locked from the device while found mode is on, so this is display-only today. | Remove the two legacy modes from Settings (or apply the ceiling in all modes) and drop the positivity gate on the banner as the register specified. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-15](#f-p-15) | low | prior audit regression | M19 and M22 spec-only fixes never shipped (duplicate ticket emission; grade-detail rewrite keeps no prior value) | buildParlaySet pushes without ticket-level dedupe at legacy/index.html:2798, :2809, :2819; probNaive is set only when simJoint succeeded (:2764). shGradeOrientFix overwrites g.detail in place and stamps v=2 with no copy kept (legacy/index.html:3661-3676). | Duplicate and naive-priced tickets can still appear in the displayed parlay sets (the found card dedupes by id at src/lib/server/lock-card.ts:1107-1116, so no double stake there). [...] | Dedupe emitted tickets by leg-set id inside buildParlaySet and tag naive-priced same-game groups; keep the prior detail string in a `detailV1` field when rewriting. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |
| [P-16](#f-p-16) | low | prior audit regression | The audit register itself is stale: M1 and M3 are listed as unshipped but shipped on 2026-08-27 | docs/freeze-exit-bundle.md:30 and :33 and CLAUDE.md:824-845 still describe M1/M3 as specs; code shows them live under SH_CFG.envCf: legacy/index.html:1643-1648, :2326, :2359 [...] | Anyone planning model work from the register will mis-state what is live, and the freeze is nowhere recorded as ended even though model changes shipped during it. | Update the register rows with shipped dates and commit references, and record the freeze's actual end state. | Not independently re-verified. Taken from the prior-audit regression table (section 5); evidence lines opened by the regression auditor only. | open |

### 4.2 Detail: high findings

No finding is rated critical after review. The ten high findings follow, in rank order.

<a id="f-b1-1"></a>
#### B1-1 — Found-mode MLB bets are created by model disagreement, not by price: 84-93% of eligible bets are negative-EV on the market's own fair and the stake concentrates where the model is furthest from the market

- Severity: high. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Gate: src/lib/server/lock-card.ts:1149 (`!(ev > 0)` on the shrunk czEv is the only edge test); src/lib/shrink.ts:63 (`p2 = wc*p + (1-wc)*imp`, wc = CORE_RULES.shrinkW 0.5 at src/lib/paper-mode.ts:192); stake = full Kelly capped at $800 (src/lib/found-mode.ts:55-68, kellyMult 4 x kellyFrac 0.25, kellyCap 0.02); straight pool hard-codes `booksInd: 0` and has no minimum-book or maximum-gap test (src/lib/server/lock-card.ts:147-181). Replay of that exact filter on archived boards: `python3 -I /private/tmp/claude-501/audit-out/areaB/b6_found.py` -> DraftKings-settlement boards 2026-09-17..10-17 with the current rule (outs excluded): 80 eligible bets on 27 dates; only 13 (16.2%) are +EV at DraftKings on the consensus fair alone; raw model minus consensus on the bet side mean +15.3 pts (72.5% of bets >= 10 pts); 80.5% of stake sits on bets with a raw gap >= 10 pts; mean stake $199, $589/day. Found-mode dates 2026-10-03..10-17: 15 bets, 1 price-driven, mean raw gap +20.1 pts, 87.2% of stake on gaps >= 20 pts. With outs still allowed (pre 2026-10-06): 124 bets, 17 price-driven, 59.5% of stake on gaps >= 20 pts. Market check from the baseline scripts (/private/tmp/claude-501/audit-out/baseline/d_clv.out.md D1g ALL row; e_calibration.out.md E1f ALL row): 1,713 pre-game rows with claimed EV > 0 (mean claimed +5.11%) are worth -5.00% against the closing no-vig fair (95% CI -5.16..-4.82); the raw model's disagreement predicts the later close with slope +0.004 (se 0.001) on 5,431 rows, raw-model RMSE vs close 13.17 pts against 0.77 for the board's own consensus.

**Impact.** Paper profit: the card is sized at full Kelly on an edge the closing market values at roughly minus the vig, so expected paper ROI on found stakes is about -5% of roughly $590/day (current rule) rather than the +1.9% the card claims. It is also a winner's-curse selector: the larger the model error, the larger the stake. No outcomes are on disk, so realised ROI could not be computed; the closing-line evidence is the only test available.

**Proposed fix.** Split the edge into its two parts and gate on the price part. (1) Require consensus-fair EV at the bet book >= 0 (or within a small tolerance) before the model may add anything; rank by that. (2) Cap the model's contribution: reject any row whose raw model is more than about 8 pts from the de-vigged consensus (treat as a model error, log it) and require >= 3 two-sided books other than the bet book. (3) Until a market's raw model beats consensus on log loss against graded outcomes out of sample, set its model weight to the floor. (4) Size at quarter Kelly (kellyMult 1) on the shrunk probability, not full Kelly. Add a regression test that replays archived boards and asserts the share of stake on raw gaps >= 10 pts stays under a fixed bound.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED mechanism, but the headline impact number is overstated; I downgrade critical -> high.

What I checked (all opened/run myself):
- Gate: src/lib/server/lock-card.ts:1149 is exactly as cited: the only edge test in buildFoundLockEntry is `!(ev > 0)` on the shrunk czEv (plus czDec/bsDec present). No shCoreEligible call, no books/booksInd test, no gap cap anywhere in the found path (lines 1105-1151). grep for "market-gap" in src (outside the generated engine copy) returns nothing, so the engine's own >=10-pt "market-gap" tag (legacy/index.html:2465) is never used as a gate.
- Shrink: src/lib/shrink.ts:63 and CORE_RULES.shrinkW 0.5 at src/lib/paper-mode.ts:192 as cited. Note the row `prob` fed in is ALREADY the engine blend wPr*pO+(1-wPr)*fair with SH_W.props 0.35 (legacy/index.html:1738, 2459), so the raw model's effective weight is about 0.175, not 0.5. The finding's wording could be read as 0.5 on the raw model; the replay script handles it correctly (uses r.prob then halves again, gap measured on pModel).
- Stake: src/lib/found-mode.ts:55-68 and foundStake at :165-172: 4 x 10,000 x min(0.25 f*, 0.02) = full Kelly on the shrunk probability, $800 cap. Correct.
- Straight pool: src/lib/server/lock-card.ts:147-181; `booksInd: 0` hard-coded at :171; no min-book or max-gap test. Correct. found-mode.ts:26-30 documents that the engine's strict gate passed zero bets and was deliberately bypassed.
- Replay: ran `python3 -I audit-out/areaB/b6_found.py`; every cited figure reproduces (80 eligible / 27 dates, 13 = 16.2% price-driven, mean raw gap +15.3, 72.5% >= 10 pts, 80.5% of stake on gaps >= 10, mean stake $199, $589/day; found dates 15 bets / 1 price-driven / 87.2% of stake on gaps >= 20; outs-included 124 / 17 / 59.5%). d_clv.out.md D1g ALL row (1,713 rows, -5.00%, CI -5.16..-4.82, claimed +5.11) and e_calibration.out.md E1f ALL row (5,431 rows, slope +0.004 se 0.001, RMSE 13.17 vs 0.77) are as quoted.

Corrections / weaknesses:
1. The -5.00% figure is NOT measured on the found-eligible bets. It is the D1g universe: every board row with unshrunk bsEv > 0 at the DK/FD basis price. I applied the found filter itself to audit-out/baseline/rows.jsonl (which carries the close join) in audit-out/verify-b1-1/clv_found.py and clv_found_sw.py. Current rule, 2026-09-17 on: 78 eligible, 61 with a close fair; mean CLV at the DraftKings price vs closing no-vig fair = -2.29% (date-clustered 95% CI -3.09..-1.49), only 13.1% beat the close fair; STAKE-WEIGHTED CLV = -0.77% (CI -2.01..+0.27) against a stake-weighted claimed EV of +4.19%. So the claimed edge is not supported by the close, but the honest impact is roughly -1% to -2% of stake (stake-weighted interval touches zero), not -5%, and "about -5% of $590/day" should be withdrawn.
2. The "winner's curse: larger model error -> larger stake" claim is only partly right. Stake scales with shrunk EV = model part + price part, and the largest replayed stakes ($800, $708, $649, $637) all had POSITIVE CLV (+1.4 to +10.8%) because they coincide with an off-market DraftKings price. Split in my replay: price-driven rows (consensus-fair EV > 0 at DK) mean CLV +0.45% (n=11); model-driven rows -2.89% (n=50). That supports the proposed fix (gate/rank on the price part) more cleanly than the finding's own impact statement does.
3. "84-93% negative-EV on the market's own fair" is close to tautological for any model-driven selector betting into a vigged book; it is the E1f/CLV evidence (market does not move toward the model; slope ~0) that carries the argument. That evidence is market-vs-market over a short window (board->close median ~100 min on the found set, close ~42 min before first pitch, median 3 books in the close), so it shows the model's disagreement is not validated, not that it is proven wrong. Independent support exists in the repo's own outcome diagnosis at src/lib/shrink.ts:6-10 (higher claimed edge hit worse).
4. Small samples: found-mode dates give 13-15 replayed bets; no graded outcomes are on disk, as the finding itself says. The replay also ignores the started-game filter, one-bet-per-player-market, under-bias and the $2,500 room, and merges best+latest boards, so counts and $/day are approximate.
5. Partial guards already present: pitcher_outs off from 2026-10-06 (found-mode.ts:146-150), HR and H+R+RBI overs excluded (lock-card.ts:1144-1145), and two blends (0.35 then 0.5). None is a price gate or gap cap, so they do not refute the finding.

Severity: high rather than critical. It is the central selection defect for MLB found mode and the card's stated EV is unverified (and contradicted unweighted), but it is paper-only, MLB-only (football uses src/lib/cfb/found.ts), MLB is out of season, and the directly measured stake-weighted shortfall is small with an interval that includes zero.

Fix: the proposal is sound in direction. Items (1) consensus-fair price gate and (4) quarter Kelly are well supported. For (2), the ">= 3 two-sided books other than the bet book" requirement would have rejected a large share of the replayed set (booksInd <= 2 on 43 of 80), which is acceptable but should be stated; with the owner limited to DK/FD, define the fair from books other than the bet book so the test is not DK pricing itself. The 8-pt gap cap is not fitted to anything on disk; treat it as a placeholder.

<a id="f-b3-1"></a>
#### B3-1 — The model does not beat the no-vig DraftKings price in any MLB prop market, yet the engine gives it 0.35 weight and books phantom EV

- Severity: high. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Command: python3 -I /private/tmp/claude-501/audit-out/areaB/dk_novig_vs_model.py (propBoard rows from audit-out/baseline/pb_rows.jsonl dated >= 2026-09-17 when cz = DraftKings, both DK sides at board time, later pre-start close; accounting {'pre_0917': 22997, 'used': 2135, 'dk_not_two_sided': 2447, 'no_close': 492}, 21 dates 2026-09-17..2026-10-16). RMSE in probability points vs closing DraftKings no-vig, ALL n=2097: DK no-vig at board time 0.82, all-book consensus fair 1.26, board model probability 3.06. Per market (DKnv / consensus / model): hits 0.78/1.41/2.81, total bases 0.66/1.16/2.86, H+R+RBI 0.76/1.02/2.91, strikeouts 1.33/1.68/3.51, outs 1.36/1.59/5.57. Slope of (close - DKnv) on (model - DKnv): +0.035 (se 0.006) all; outs +0.033 (se 0.029), Ks +0.062 (se 0.041), TB +0.021 (se 0.014) are not distinguishable from zero. Model error grows with its disagreement: |pO-DKnv| 6+ points n=128 model RMSE 7.27 vs DKnv 0.93. Command: python3 -I /private/tmp/claude-501/audit-out/areaB/dk_novig_two_var.py: weight the DK close puts on the board's model deviation (pO - fO) = +0.026 (se 0.007); vs all-book close +0.034 (se 0.006). Engine weight is SH_W={props:0.35,ml:0.15,rl:0.15} at legacy/index.html:1738, then halved once at lock (src/lib/paper-mode.ts:192 shrinkW: 0.5). Corroborated by audit-out/baseline.md E1 (14,343 rows, 51 dates): slope of (close - fair) on (model - fair) +0.023 (se 0.002); raw model RMSE vs close 13.17, outs raw model 71.42 vs close fair 49.10 (RMSE 25.19); EVPOS rows claimed EV +5.11% vs CLV against closing no-vig fair -5.00% (95% CI -5.16, -4.82). Recorded outcomes agree: docs/progress.md:429 'Five of eight market-level model Brier point estimates are worse than consensus' on 16,322 graded rows; docs/pitcher-outs-audit.md:212-219 n=70 model Brier 0.2127 vs consensus 0.2085; docs/settlement-audit.md:66-71 38 tickets 6-32, $850.00 staked, -$376.91, ROI -44.3%.

**Impact.** Every stated probability and EV on the board is biased toward the model by roughly 10x the weight the closing market supports. The +EV ranking is therefore mostly a ranking of model error, which is why positive-EV rows show about -5% CLV. There is no evidence of edge in hits, total bases, H+R+RBI, strikeouts or outs; home runs cannot be tested two-sided; moneyline/run line have no closes after 2026-07-30; football has no data at all. Target here is the closing line (a proxy), because outcomes are not on disk.

**Proposed fix.** Set the default model weight to what the data supports until a held-out test says otherwise: props w = 0.05 (or 0) in SH_W at legacy/index.html:1738, and treat 'EV' as price-shopping EV only (best DK/FD price vs sharpest no-vig fair). Re-earn weight per market only through the walk-forward test in the next finding. Outs and strikeouts should be w = 0 now (slopes within one se of zero).

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Core claim confirmed, but the evidence is mislabelled and the numbers are softer than stated. Downgraded from critical to high: paper trading only, partial guards exist, and the test cannot prove the model is worthless.

CONFIRMED
- Both scripts re-run and reproduce every quoted figure (accounting 22997 / 2135 / 2447 / 492; ALL n=2097 RMSE 0.82 / 1.26 / 3.06; slope +0.035 se 0.006; two-variable b2 +0.026 and +0.034).
- legacy/index.html:1738 is `SH_W={props:0.35,ml:0.15,rl:0.15}`. The comment at 1735-1737 admits the weights were never fitted out of sample.
- src/lib/paper-mode.ts:192 is `shrinkW: 0.5`, applied once at lock (src/lib/shrink.ts:55-66; src/lib/server/lock-card.ts:312 and 1115).
- docs/progress.md:429, docs/pitcher-outs-audit.md:212-219 (the 0.2127 / 0.2085 Brier figures are a correct n-weighted aggregate of that table) and docs/settlement-audit.md:66-71 say what is quoted.
- The settlement book is DraftKings on every board row from 2026-09-17 (5,083 of 5,083 category rows).

CORRECTIONS TO THE EVIDENCE
1. `pO` is not the model probability. It is the already-blended probability: legacy/index.html:2598 sets modelBy.pO from r.p, which is pAdj = w*model + (1-w)*fair (line 2464); the comment at 2592 says so. My join (audit-out/verify-b3-1/join_po.py) finds a mean absolute difference of 1e-16 between `pO` and the blended `prob` on 2,517 rows; baseline.md:389-391 already says the same.
   - The "model RMSE 3.06" is therefore the published blended number.
   - The raw model is far worse: RMSE 12.25 against the DK close on 1,010 joined rows, slope on (raw - DK) +0.005 (se 0.002). baseline.md:434 gives +0.004 (se 0.001).
   - The baseline "+0.023" slope is also on the blended deviation, not the raw model.
   - "10x too much weight" therefore understates the gap on this test, and "w = 0.05 is what the data supports" does not follow; on this test the supported raw weight is about 0.005 to 0.01.
2. The engine does not apply 0.35 uniformly. Stored wBlend on boards from 09-17 is 0.35 for hits and total bases and 0.347-0.35 for outs, but 0.168-0.253 for H+R+RBI, 0.167-0.23 for strikeouts and 0.151-0.186 for home runs. The shrink-only calW/calG calibration (legacy/index.html:1743-1754; src/engine2/calibration.ts:592-617) is already active, and the finding does not mention it. After the lock-time halving, effective raw weight on tickets is about 0.085-0.175.
3. The closing-line test is weak (audit-out/verify-b3-1/gap.py, gap2.py).
   - The gap from board to close is a median 87 minutes (p90 126); the DK close price is identical to the DK board price on 1,479 of 2,097 rows. "DK no-vig beats the model on RMSE" is close to tautological.
   - The slope is horizon-attenuated: +0.009 (under 60 min), +0.031 (60-180 min), +0.197 (180-480 min, n=146, one date). On the 14,343-row set: +0.012, +0.031, +0.070.
   - On the 618 rows where DK moved at all, the slope is +0.108 (se 0.019), and DK moved toward `pO` on 355 of 618.
   - Per-date slopes average 0.023 with sd 0.063; rows cluster by date, so the quoted standard errors are too small.
   - The test shows the market does not ratify the edge within about 90 minutes. It does not show the model has zero information.
4. "Positive-EV rows show about -5% CLV" is misleading. -5% against the closing no-vig fair is just the vig: all rows score -5.84%, positive-EV rows -5.00%, and same-book price CLV is +0.21% against +0.09% (baseline.md:331-334). The claimed +5.11% EV is unratified, but there is no adverse selection; positive-EV rows are marginally better than average.
5. Outcome evidence is thin. progress.md:429 itself says "no independent-sample significance claimed"; n=70 is tiny; the 38 tickets are July parlays on an older engine. The strongest in-repo outcome evidence is not cited: src/lib/shrink.ts:6-10 and src/lib/paper-mode.ts:154-155 (129 core tickets, model said 56.0 wins and 46 landed; H+R+RBI edge 10-20 bucket predicted .671, actual .443).

OTHER GUARDS
- Pitcher outs are off the card (src/lib/found-mode.ts:141).
- Straight bets only since 2026-10-06 (src/lib/found-mode.ts:103).

FIX CORRECTION
- Setting SH_W.props to 0 does not give 0 where calW is below 1: shWm returns Math.max(0.05, base*f) (legacy/index.html:1754), and the under-side path has the same 0.05 floor (line 2462).
- SH_W has one `props` key, so "outs and strikeouts w = 0" needs a per-market code change or a calW route with the floors removed.
- Editing legacy/index.html moves the engine hash and provenance baseline (comment at 2456-2458).
- Any refit should use outcomes or closes at least 3 hours after the board, with date-clustered errors, not the 90-minute close slope.

<a id="f-b2-1"></a>
#### B2-1 — Football side bets have one independent signal, ESPN FPI, and it is unvalidated: on the only real slate on disk, 4 of 4 auto candidates were FPI-driven and 0 survive without it

- Severity: high. Area: football model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** Code: ML = 0.6 market + 0.25 spread-implied + 0.15 FPI, spread margin = 0.75 market + 0.25 FPI (src/lib/cfb/model.ts:420-455; weights at src/lib/cfb/rules.ts:73-74, src/lib/nfl/rules.ts:64-65). Totals are 100% consensus (model.ts:458); 1H has no FPI (src/lib/cfb/h1.ts:46-58); props are a book median (src/lib/cfb/props.ts:204-215). Probe: /private/tmp/claude-501/audit-out/b-football/probe.ts runs the real buildCfbBoard on the real capture tests/fixtures/cfb/odds-ncaaf-2026-09-05.json plus espn-fpi.json; output in probe.out.txt. Production shape (all books + FPI): 4 candidates >= +1%, all spread:away. FPI removed: 0 candidates. Each of the four flips negative without FPI: ECU +27.5 evCz 3.6 -> -1.98; Coastal +21 2.6 -> -4.44; North Texas +40.5 6.07 -> -3.21; Ohio +23.5 3.14 -> -2.42. FPI margin minus market margin on the 8 games with both: -4.62, -2.96, -6.11, -8.07, -4.60, +1.99, -0.29, -1.85 (mean |gap| 3.81 pts); FPI sits below the market on every spread of 20+. Sensitivity from the engine's own sigma: 1.15% EV per FPI point (CFB), 1.41% (NFL). docs/progress.md:417 says football calibration is 'planned, not implemented'.

**Impact.** The stated +2.6% to +6.1% 'edges' against a 22-23 book market are a rating-difference margin being applied linearly to blowout spreads; the card systematically takes big underdogs plus the points. Selection is by highest EV, so the largest FPI-vs-market disagreements are bet first. Stakes are full Kelly on that probability: by the foundStake formula (src/lib/found-mode.ts:165-172) the +6.07% row at -110 stakes about $668 of the $2,500 day (my arithmetic). Whether FPI was right on these games could not be determined: no football results archive or ledger is on disk, and the slate is a week-1 (preseason FPI) capture, so the gap may be smaller later in the season.

**Proposed fix.** Treat FPI as unproven until back-tested: set spreadBlend.fpi and blend.fpi to 0 for staking (keep it as a displayed lean), or cap its pull at about 1 point and shrink it with spread size. Back-test FPI-vs-close on stored closing lines before restoring any weight. Until a calibrated signal exists, football sides should be bet only on a price gap against a sharp, settle-book-excluded reference (see the consensus findings), and totals/props should say plainly that they carry no model signal.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed, but I rate it high, not critical: the system is paper-only and the proof is a single week-1 slate.

**What I checked**
- **Blend code:** the cited weights and formulas are as described. `fpiMargin = home.fpi - away.fpi + hfa` at src/lib/cfb/model.ts:420; ML blend at :422-438; margin blend at :440-452; weights at src/lib/cfb/rules.ts:73-74 and src/lib/nfl/rules.ts:64-65. There is no cap, shrink or guard on the FPI-vs-market gap anywhere in `priceGame`.
- **Other markets:** totals take the market figure directly (`model.muTotal = mktTotal`, model.ts:458); 1H drops the FPI term (src/lib/cfb/h1.ts:44-58); props use a book median (src/lib/cfb/props.ts:204-215).
- **Production path:** FPI is fetched live for both leagues (src/lib/cfb/slate-server.ts:85-97, :156; src/lib/nfl/rules.ts:174, :299).
- **Candidate gate:** the probe's filter matches the real one in `foundCandidates` (src/lib/cfb/found.ts:163-180).
- **Independent re-run:** I bundled my own script against `buildCfbBoard` and `foundCandidates` (/private/tmp/claude-501/audit-out/verify-b2-1/v.ts) rather than trusting probe.out.txt. Same result: 4 candidates with FPI, all spread:away, and 0 with `fpi: null`.
  - North Texas +40.5: EV 6.07, stake $668.
  - East Carolina +27.5: EV 3.60, stake $360.
  - Ohio +23.5: EV 3.14, stake $314.
  - Coastal +21: EV 2.6 on the board row, 2.67 as the found candidate; stake $293.
- **Stakes:** the $668 figure is reproduced by the real `foundStake`. The four together are $1,635 of the $2,500 day.
- **FPI gaps:** market and FPI margins match the finding on the four candidate games (e.g. UNT@IU 40.21 vs 32.14). I did not re-run the per-game gap table or the 3.81 mean, but probe.out.txt section G shows FPI below market on all six spreads of 20+.
- **Fixture provenance:** docs/cfb-desk.md:119 says the fixtures are captures cut from the raw feeds on 2026-09-04/05; the board reports `fpiUpdated` 2026-09-04T08:00Z.
- **Calibration status:** docs/progress.md:417-418 says football calibration remains "planned, not implemented".
- **No results to test against:** pl-history/data holds only dated JSON plus boards/ and props/; no football ledger or results archive.

**Corrections**
1. **Severity.** Paper trading only, and the evidence is one slate with 8 games carrying both FPI and a market margin, on preseason FPI. It shows the mechanism and that FPI is unvalidated; it does not show FPI is wrong.
2. **Scope of "0 survive".** This covers full-game rows only. On found days NFL prop singles are also candidates (found.ts:83-98, :181) and could seat without FPI. The finding does say "side bets", so it holds, but FPI is not the only route onto the football card.
3. **The floor has since dropped.** From 2026-11-01 the football found floor is +1%, not +2% (src/lib/found-mode.ts:130-134). By the probe's own sensitivity figure that needs an FPI gap of roughly 4.8 points in CFB at -110, so FPI-driven bets seat more often now than on the fixture date.
4. **Missed detail.** With FPI removed, long-dog moneylines still show large positive EV (Ohio ML +10.48 at dec 15), but the 2.60 max-price cap excludes them, so they never reach the card.
5. **Proposed fix.** Zeroing the FPI weight for staking is sound, but on this slate it leaves football sides with no candidates at all. That is the honest outcome, and the owner should expect it.

<a id="f-p-2"></a>
#### P-2 — Live found-mode path bypasses the July sizing protections: stake is full Kelly up to 8% of a constant $10,000, no managed bankroll, no 10% daily exposure cap

- Severity: high. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** src/lib/server/lock-card.ts:260 `if (isFoundDay(args.date)) return buildFoundLockEntry(args);` so every date >= 2026-10-03 never calls shAllocate. Stake: src/lib/found-mode.ts:154-172 `round(kellyMult * bankroll * min(kellyFrac*f, kellyCap))` with kellyMult 4 (:65), kellyFrac 0.25 (:66), kellyCap 0.02 (:68), bankroll 10000 constant (:63), daily 2500 (:58), FOUND_MAX_STAKE = $800 (:76), ceiling = 2500 + same-day won profit (:295-297); applied at src/lib/server/lock-card.ts:1183. Documented protections: quarter-Kelly capped 2% used as a CEILING on a share of the daily amount (legacy/index.html:3356-3363, :3139-3146), daily amount capped at dailyBankrollCap 0.10 of the managed bankroll (legacy/index.html:1075, :3373-3374, :3428-3432; ENGINE2.md:576-594), operator rule no slip above 2% / $50 (CLAUDE.md:429-431). src/lib/bankroll.ts is not imported by found-mode.ts or lock-card.ts.

**Impact.** The prior audit's ceiling formula became the stake itself: 4 x quarter-Kelly = full Kelly, up to $800 a ticket (16x the $50 operator rule), $2,500+ a day per sport (25% of the notional bankroll versus the documented 10%), on a bankroll that never shrinks after losses. Full Kelly on probabilities the system's own review found worse than the market consensus in five of eight markets (docs/session-handoff.md:1560-1568) maximises drawdown and makes the paper P/L a poor guide to what real DraftKings/FanDuel staking would produce.

**Proposed fix.** Size found stakes off the managed bankroll (base + realised P/L, src/lib/bankroll.ts) instead of the constant; drop kellyMult to 1 (true quarter-Kelly, 2% cap) or state full Kelly explicitly as the owner's choice; restore a combined daily exposure cap as a fraction of the managed bankroll. Stamp the sizing rule on each ticket (paperPolicy already exists) so pre- and post-change records can be split.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-3"></a>
#### P-3 — Consensus and EV gates added by the prior audit do not run on the live path; found straights are built with booksInd 0, the exact condition the audit made ineligible

- Severity: high. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** Engine gates live only inside shAllocate: +2% EV gate legacy/index.html:3039 (coreEvMin:2 at :1075), `no_ind_consensus` hard block legacy/index.html:3050-3065 (`booksInd===0` -> not eligible, dated 2026-07-26), small-sample consensus gate :3068-3079 (consMinN:100, consMinEv:-1 at :1087). Found path: pool built at src/lib/server/lock-card.ts:1105-1116, candidate filter :1134-1151 admits anything with `czEv > 0` and non-null czDec/bsDec (:1149); straights are composed with `booksInd: 0` hard-coded (src/lib/server/lock-card.ts:177). src/lib/found-mode.ts:24-30 records that the strict gate passed zero bets on 2026-09-30, 10-01 and 10-03, which is why it was bypassed.

**Impact.** Every straight bet on the MLB found card is one the July rule classed as having no independent price check (the model checked against the book it is betting into). The minimum edge fell from +2% to anything above zero after a 50% shrink, so tiny, noise-level edges are seated at $5-$15 and inflate ticket counts. Selection quality on the money path is now governed by none of the audited gates.

**Proposed fix.** Carry the real per-row booksInd from the board row into buildStraightPool instead of 0, and require at least one independent book (or, for the Arizona case, require both DraftKings and FanDuel to post the line and use the other book's de-vigged price as the check). Restore a minimum EV at the settlement price on MLB (football already uses +1%, src/lib/found-mode.ts:130-135) so both sports share one bar.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-d-1"></a>
#### D-1 — An unreadable ledger blob is silently replaced by an empty or one-day ledger (no archive, no abort)

- Severity: high. Area: grading and ledger. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/ledger-epoch-server.ts:16-28: JSON.parse failure sets stored=null; src/lib/ledger-epoch.ts:30-32 then returns {migrate:true, archive:false}, so line 28 SETs pl:ledger:v1 to {ledger:[], epoch:2} with no archive. This runs on every authed /api/ledger GET/PUT (app/api/ledger/route.ts:75,93) and every scheduler poke (app/api/scheduler/route.ts:221). src/lib/server/lock-card.ts:1305-1311: writeLock `catch { cur = [] }` then plain SET at :1322 of only today's entry, with epoch dropped (which makes the next ensureLedgerEpoch reset it again); `stored` is undefined so assertAppendOnly at :1320 cannot fire. app/api/ledger/route.ts:60-69 and app/api/nfl/ledger/route.ts:42-51: readStore returns null on parse failure, PUT then merges against [] and SETs (:149 / :117). The hazard is acknowledged in src/lib/server/store.ts:28-32: "a build that predates this file would read a 'gz1:' ledger as unparseable and could write it back as empty ... NEVER roll production back to a build older than b29961e".

**Impact.** One bad read of the single season blob (a platform rollback past b29961e, a hand edit in the store console, any future encoding change) erases the whole MLB paper record on the next 15-minute poke, and the football ledgers on their next write. Nothing alerts; the epoch-1 archive key is NX so it does not capture the lost data.

**Proposed fix.** Treat `raw != null && parse failed` as a hard error everywhere: throw before any SET in ensureLedgerEpoch, writeLock, the three ledger routes' readStore and football readLockStore. Before every ledger SET, copy the previous value to a rotating backup key (e.g. pl:ledger:bak:<weekday>). Migrate only when the blob parsed AND its epoch is lower.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The MLB core of the finding is real, but "critical" is overstated and the football part is partly wrong. I rate it high.

**Confirmed in code**
- `src/lib/server/ledger-epoch-server.ts:16-28`: a `JSON.parse` failure sets `stored=null`; `src/lib/ledger-epoch.ts:30-32` then returns `{migrate:true, archive:false}` and line 28 SETs `{ledger:[], epoch:2}`. I ran `decideEpochMigration(null)` in node (`/private/tmp/claude-501/audit-out/d1_epoch_check.mjs`) and got exactly that.
- Call sites are `app/api/ledger/route.ts:75,93` and `app/api/scheduler/route.ts:220` (the finding says :221). The scheduler only logs it as "LEDGER EPOCH MIGRATED ... was empty".
- `src/lib/server/lock-card.ts:1305-1311,1322`: `writeLock` does `catch { cur = [] }` and then a plain SET of today's entry with no epoch. `stored` is undefined, so `assertAppendOnly` at :1320 cannot fire. A blob without an epoch makes the next `ensureLedgerEpoch` return `{migrate:true, archive:true}`, and the `SET NX` on `pl:ledger:archive:e1` is a no-op if that key already exists.
- `app/api/ledger/route.ts:60-69,126-149`, `app/api/nfl/ledger/route.ts:42-51,117` and `app/api/cfb/ledger/route.ts:41-50,115`: `readStore` returns null on a parse failure and PUT merges against `[]` and SETs.
- `src/lib/server/store.ts:28-32` carries the quoted rollback warning.
- No backup key exists: the only ledger keys in `app/` and `src/` are v1 and `archive:e1`. `pl-history` holds only odds snapshots (`README.md`).

**Corrections to the evidence and fix**
1. Football `readLockStore` already throws. `src/lib/server/football-lock.ts:96-113` raises `FootballStoreUnreadable` ("a blob nothing can parse is not an empty ledger"), and every server lock, sweep and top-up write reads through it (`football-lock.ts:198,340,482,515,570,725,869`; `app/api/cfb/lock/route.ts:500`; `app/api/nfl/lock/route.ts:306`). Drop that item from the proposed fix. On football only the device-sync PUT routes are exposed, so "football ledgers on their next write" is true only for a device PUT.
2. No trigger exists in the current build on its own. A corrupt `gz1:` value makes `gunzipSync` throw inside `redis()` (`store.ts:40-43,59`), and a store 403 or error throws at `store.ts:56-58`, so no SET follows. Every writer writes `JSON.stringify` output. The wipe needs an outside event: a rollback past b29961e, a console hand-edit, or a future encoding or epoch change.
3. The finding ignores a partial automatic recovery. The client keeps the full merged ledger in localStorage (`src/lib/ledgerSync.ts:232-236`). On the next app open it GETs, merges local over the empty remote (:189) and PUTs with epoch 2 (:201-208), which the server accepts and stores. The loss is therefore bounded to server-side locks, CLV and grades written since the device last synced. It becomes permanent only if no device holds a copy.
4. It is paper trading only.

**Related hazard for the Arizona work**
`EPOCH_ARCHIVE_KEY` is hard-coded to `pl:ledger:archive:e1` with NX (`ledger-epoch.ts:21`, `ledger-epoch-server.ts:26`). Bumping `LEDGER_EPOCH` to 3 for an Arizona era would reset the epoch-2 paper ledger while the NX archive silently no-ops if the e1 key exists. I could not check whether it exists in production (no network).

**Fix, adjusted**
- Throw on `raw != null` with a parse failure or missing `ledger` array in `ensureLedgerEpoch`, `writeLock` and the three ledger routes' `readStore`, mirroring `FootballStoreUnreadable`.
- Give `getLockEntry` (`lock-card.ts:1331-1335`) the same treatment so an unreadable blob does not read as "no lock".
- Make the archive key per-epoch.
- A rotating backup key before each ledger SET is still worthwhile.

<a id="f-e1-1"></a>
#### E1-1 — A store failure (the Oct-2026 Upstash 403 mode) turns every scheduler poke into an uncaught 500 and nothing in the system notices or alerts

- Severity: high. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/scheduler/route.ts:138 `const res = await mlbTick(req);` is not inside any try/catch. Inside mlbTick the store reads at :173 (`redis(["GET", BOARD_KEY(date)])`), :183 (`redisGetJson(BLOCKS_KEY(date))`), :225 (`await lockExists(date)`) and :326 (`readMlbDay`) are all outside the try blocks that start at :226 and :244. src/lib/server/store.ts:56 throws `store <status>` on any non-2xx. So with Upstash answering 403, GET rejects before :143 `retryFailedAlerts()` and before the football results (:144-150) are ever reported: the cron caller gets a bodyless platform 500 on all 48 pokes/day. The football forwards themselves return 502 `store unreachable` (app/api/cfb/lock/route.ts:302-309, app/api/nfl/lock/route.ts:124-133) which is only a response body. No health surface exists: the route list under app/api has no health/heartbeat route, `grep -rn "pl:sched|lastPoke|pl:hb|pl:health" app src` returns nothing, and the only failure output anywhere is console.warn. Data evidence of the unnoticed outage: in /private/tmp/claude-501/pl-history `git log` shows 'board archive' commits daily through 2026-10-18T15:27Z and none after; last files in data/boards are 2026-10-17.best/latest.json.gz.

**Impact.** Silent total outage: no cards locked, no grading, no refills, no alerts for as long as the store refuses calls (two weeks in Oct 2026). The paper record has a hole that is indistinguishable from 'no bets found', and the only way it was discovered was a human opening the app.

**Proposed fix.** 1) In GET wrap `mlbTick` in try/catch and return a JSON body `{ ok:false, error:'store-unreachable', detail }` with status 503 so the cron provider's failure mail carries a reason. 2) Add the heartbeat + watchdog described in notes (a store-independent path is required, because push subscriptions and every status key live in the same Redis that is down). 3) Count consecutive store failures in module memory / a Vercel log line with a fixed token (e.g. `[ALERT] store-down`) so a log drain or the GitHub watchdog can key on it.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real; I could not refute the code path, but critical is overstated for a paper-only system, so I rate it high.

**Confirmed in code**
- `app/api/scheduler/route.ts:138` is a bare `const res = await mlbTick(req);` with no try/catch in GET (:119-153).
- Inside `mlbTick`, the first store call is :173 `redis(["GET", BOARD_KEY(date)])`, which is unguarded. :183, :203, :225 and :326 are also outside the try blocks at :219, :226 and :244, but :173 throws first so they never run.
- `src/lib/server/store.ts:56` throws `store <status>` on any non-2xx.
- `storeEnv()` at :168 only checks that the env vars exist, so a 403 gets past it.
- Net effect: a 403 rejects `mlbTick`, the rejection escapes GET as a bodyless 500, and :143-152 (alert retry, football result attach) never run.
- The route's own docblock (:86-88) and `tests/scheduler-route.test.ts:759-760` acknowledge that a throw inside the tick renders as a bodyless 500. The tests cover the `storeEnv()` null 503 (case d2) but I found no case for a store call that throws.
- Football routes return 502 `store unreachable` as a body only (`app/api/cfb/lock/route.ts:299-309`, `app/api/nfl/lock/route.ts:123-132`).
- There is no health or heartbeat route under `app/api`, and no `pl:sched`, `lastPoke`, `pl:hb` or `pl:health` key in `app` or `src`. The only "heartbeat" hits are client ledger-sync comments.
- 48 pokes/day is right: `docs/cron-jobs.md:21` and :829 give every 15 min for UTC hours 15-23 and 0-2, i.e. 12 h x 4. `vercel.json` adds two more scheduler crons.

**Corrections to the evidence**
1. "No health surface" is slightly overstated. `app/api/board/route.ts:75-77` returns 200 with `reason: "store-unreachable: store 403"`. That is a read-side signal the app or a person can see, but nothing pushes it.
2. A point the finder missed that strengthens it: `tools/archive_boards.py` `main()` always returns 0 (:141-171) and prints "nothing stored" when the board is missing. So the board-archive GitHub workflow stays green through the outage and sends no failure mail.
3. History data is confirmed: the last "board archive" commit in pl-history is 2026-10-18T15:27:19Z, and the last files in `data/boards` are `2026-10-17.best/latest.json.gz`. Prop-history commits continue to 2026-10-28 and hr-overround to 2026-11-01 (clone HEAD), so the store-independent jobs kept running.
4. "Two weeks" is not provable from disk. History only shows that no board was archived from 10-18 to the clone head on 11-01; whether or when it recovered could not be determined.
5. "Indistinguishable from no bets found" is overstated. A normal no-bet day gets a reason record (scheduler :266-271), so an outage day shows as a missing day, not a reason-record day.

**Corrections to the fix**
- Fix 1 (catch and return a 503 JSON body) is cosmetic. The cron provider already sees a failure status on a 500, and whether cron-job.org failure mail is enabled is not determinable from the repo. It restores no function.
- The substantive gap is fix 2: a watchdog that does not depend on the store. The cheapest version is a GitHub workflow that calls `/api/board` and fails on `reason` starting `store-unreachable`, or making `archive_boards.py` exit non-zero in that case.

**Severity**
High, not critical. It is a real, already-experienced silent total outage of locking, grading and alerts, but this is paper trading: no money is at risk and nothing is corrupted, only missing days.

<a id="f-p-1"></a>
#### P-1 — Pitcher-outs model: all three audited defects (M2, M2', shrinkage k=4) are still in the code, and the engine-wide suspension that covered them was lifted

- Severity: high. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** legacy/index.html:2258 still `of=shClamp(0.140/oo,0.86,1.12,"2258")` (documented fix 0.140 -> 0.400 plus offense() de-noise, docs/freeze-exit-bundle.md:31, docs/pitcher-outs-audit.md:432-470); legacy/index.html:2253 still `ipg=shShrink(ipg,nOut,4,Lipg)`; legacy/index.html:2260 + :1543 plain Poisson with no hook-timing term and no sim routing (outsBySP* exist only in the sim at :1854-1871). Suspension: engine default `outsSusp:true` at legacy/index.html:1087 is overridden to false by src/lib/paper-mode.ts:133-143 (SUSPENSIONS_LIFTED since 2026-08-15), applied at app/api/generate/route.ts:438, app/api/scheduler/route.ts:255, src/lib/engine-client.ts:125. The only remaining guard is a date switch on the found card: src/lib/found-mode.ts:146-151, src/lib/server/lock-card.ts:1082 and :1145. STRAIGHT_MARKETS still lists pitcher_outs (src/lib/server/lock-card.ts:142). With outsSusp false the susp tag at legacy/index.html:2524 and the pool bars at :2670 and :3229 never fire.

**Impact.** The audit measured every outs row on the clamp floor (35 of 35) and a median model-vs-market gap of -23.3 pp. Those probabilities, grades and EVs are still shown untagged on the Board, the Builder generator, the Sharp page and /api/picks, still enter the engine's parlay pool, and still feed the prediction store. Money is protected only by one constant (OUTS_OFF_SINCE) on one path; removing or bypassing it puts a known-wrong model straight back on the card at full-Kelly sizing.

**Proposed fix.** Ship the pre-written interlocked pair (0.400 constant + offense() de-noise, tests/m2-interlock.test.ts already guards the pairing), refit the innings shrinkage k against starts, and add a hook term or route outs to the simulator's outsBySP* distribution. Until then set outsSusp back to true in applySuspensionLift so outs rows are tagged susp everywhere (shown, never ticketed, shadow cohort) instead of relying on the found-card date switch.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-4"></a>
#### P-4 — M18/M23: model inputs frozen at 2026-07-29 with no staleness check; bullpen fatigue from July 29 is applied to every later slate; pen_quality.json still never committed

- Severity: high. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** .github/workflows/model.yml:7-10 schedule commented out (PAUSED 2026-07-29); .github/workflows/context.yml:30-33 context.json commit paused, only `git add data/ump_k.json`. Command `git log -1 --format='%h %ad' --date=iso -- public/model/priors.json` -> 671aed9 2026-07-29 15:58:41 +0000; same for public/model/context.json -> 64c42ad 2026-07-29 20:32:00 +0000; data/pen_quality.json -> 4cd1c5d 2026-07-20. context.json fields: generated_at 2026-07-29T20:31:58+00:00, date 2026-07-29; priors.json generated_at 2026-07-29T15:58:41+00:00. Consumers with no date comparison: app/api/generate/route.ts:364-366, src/lib/engine-client.ts:351-352; shPenF reads SH_CTX.bullpen_last3 keyed by team name with no date check (legacy/index.html:1663-1669).

**Impact.** Every MLB board from 2026-07-30 through the end of the season was priced on Statcast priors (xBA/xSLG, park index, framing) three-plus months stale, and the bullpen-fatigue factor (0.96-1.05 on opposing offence in the sim) used the pitch counts of July 26-28 for every game since. Nothing on the board or in the echo flags it. The same stale files will be used on opening day 2027 unless the writers are resumed. The pen-quality factor cannot be safely unfrozen because its database restarts from a July 20 base every run.

**Proposed fix.** Re-enable the nightly priors and context writers before the next MLB slate; add a staleness guard in the loader (if context.date != slate date, null out bullpen_last3/weather/umpire and add a data_gaps entry; if priors.generated_at is older than N days, disclose it on the board); add data/pen_quality.json to the context.yml commit list and add the finite-value guard to shPenQFShadow.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-5"></a>
#### P-5 — M11: hot-form (last-30-day) weighting, measured at 4-11x too strong, was never changed

- Severity: high. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** docs/freeze-exit-bundle.md:36 specifies an xBA-primary rate with a single un-nested last-30 term at weight <= ~0.1. Current code still uses the nested shBlendN -> shShrink(...,60,...) form: legacy/index.html:2349, :2351, :2357 (closed form) and :2065-2066 (sim); shShrink defined at :1191, shBlend :1707, shBlendN :1714.

**Impact.** Hits, total-bases and H+R+RBI probabilities over-react to a hitter's recent streak, which systematically manufactures apparent edges on hot hitters (overs) and cold hitters (unders). These are three of the six markets the found card can bet.

**Proposed fix.** Implement the specified rate (season xBA primary, one last-30 term at ~0.1 weight, drop the nested blend and k=60) behind a config flag, replay it on the archived boards in pl-history/data/boards, and arm it on all three generators the same way envCf was armed.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

---

## 5. Prior audit regression table

Source: `audit-out/prior-audit-regression.md`, reproduced below without change. Every defect catalogued by the prior audit (July 24 to August 1, 2026) was checked against the current code. Of 56 rows: 16 IN PLACE, 25 MISSING, 11 PARTIAL, 2 CANNOT VERIFY, 2 N/A. "MISSING" includes "never shipped". No test was executed; "test present" means the file exists. The findings drawn from this table are P-1 to P-16 in section 4. Section numbers inside the reproduced text (0 to 4) are the working paper's own.

**Prior-audit regression check (Parlay Lab, read-only phase, 2026-11-11)**

Scope: every defect catalogued by the prior audit, with its documented fix, checked against the
current code in `/private/tmp/claude-501/pl-audit` (branch `az-two-book-anytime`, HEAD `8ab9e46`).
All paths are relative to that checkout unless prefixed `pl-history/`.

### 0. Which record is "the prior audit"

- The register is the **freeze-exit amendment bundle**: `docs/freeze-exit-bundle.md:28-59`
  (M1..M29, M2', the M7+M9 pair) and `docs/freeze-exit-bundle.md:624-630` (A1..A4). `CLAUDE.md:824-845`
  mirrors M1..M19 + A1..A4. That is 29 M rows + M2' + 4 A rows = 34 register rows (33 distinct IDs).
- Companion records from the same July 24 - Aug 1 2026 audit: ledger-autopsy fixes 1-5
  (`ENGINE2.md:488-520`), fix-file Phases 1, 2, 5, 6 (`ENGINE2.md:522-594`), the timezone
  rebaseline (`docs/rebaseline-2026-07-25.md`), the pitcher-outs audit (`docs/pitcher-outs-audit.md`,
  three defects), the settlement audit (`docs/settlement-audit.md`, zero misgraded), the
  calibration and self-correction module (`ENGINE2.md:462-486`, `src/engine2/calibration.ts`).
- No document uses the phrase "calibration overhaul". The closest items are the calibration module,
  the Phase 0.5 training-window restart (`CAL_START`), and the calibrate scheduling changes. They are
  listed in section 3.
- The docs' own register is stale in one direction: it still lists M1 and M3 as unshipped, but both
  shipped on 2026-08-27 (see rows M1, M3).

Status vocabulary: IN PLACE / MISSING / PARTIAL / CANNOT VERIFY. "MISSING" includes "never shipped".

### 1. Register M1..M29 (docs/freeze-exit-bundle.md)

| ID | Defect (doc line) | Documented fix | Status today | Evidence |
|---|---|---|---|---|
| M1 | Park factor applied as Coors flags, not routed to the closed-form props (`:30`) | Route `shParkF` into closed-form factors | IN PLACE (shipped 2026-08-27 behind `SH_CFG.envCf`) | `legacy/index.html:1643-1648` (`shParkCf`, `shParkKf`, `shWxTrim`, `shOutsEnvF`), `:2326`; armed by `src/lib/env-adjust.ts:24-27`, called at `app/api/generate/route.ts:439`, `app/api/scheduler/route.ts:256`, `src/lib/engine-client.ts:126` |
| M2 | `pitcher_outs` offense factor uses `0.140/oo` (a lineup-posted flag worth a flat -14%; 35 of 35 rows on the clamp floor) (`:31`) | `0.140 -> 0.400` plus `offense()` de-noise, shipped as an interlocked pair | MISSING | `legacy/index.html:2258` still `of=shClamp(0.140/oo,0.86,1.12,"2258")`; no `0.400` site in the file; `tests/m2-interlock.test.ts` exists (guards the pair, does not ship it) |
| M2' | `pitcher_outs` priced by closed-form Poisson, not the simulator (`:32`) | Route outs to the sim (`outsBySP*`) | MISSING | `legacy/index.html:2260` (`lam=ipg*3*of`), Poisson via `shPOver` `:1543`; `outsBySPHome/Away` exist only inside the sim `:1854-1871` and are not read by pricing |
| M3 | HRR lambda not blended by hit/TB factor mass (`:33`) | Mass-weighted blend of hF / tbF | IN PLACE (under `envCf`) | `legacy/index.html:2359` `rate*(0.74*hF+0.26*tbF)` when `SH_CFG.envCf` |
| M4 | Sim routing for TB and HR (conditional) (`:34`) | Route TB and HR marginals to the sim | MISSING (never shipped) | `legacy/index.html:2389-2396`: pregame sim marginal replaces the closed form only for `batter_hits_runs_rbis` |
| M5 | (refuted) (`:35`) | none | N/A | refuted in the register itself |
| M6 | `pitcher_strikeouts` has no simulation of the quantity it prices (`:59`) | K as a sixth PA outcome in the sim, second RNG stream | MISSING | no K-count outcome in the sim; only `outsBySP*` at `legacy/index.html:1854-1871` |
| M7+M9 | Poisson used where the process was assumed binomial, plus a compensating term (`:57`) | Re-derive together; held | MISSING (held by design) | `legacy/index.html:1543` `shPOver(line,lam){return 1-shPoisCdf(Math.floor(line),lam);}` unchanged |
| M8 | `shTbOver` priced a 0.5 line with the 1.5 formula (`:56`) | `if(line<1)return 1-P0;` | IN PLACE | `legacy/index.html:1546-1551` |
| M10 | Closed-form expected-AB too steep: walk rate `bbr` unshrunk (errors-in-variables) (`:58`) | `shShrink(bbr, n, k~75, lgBB)` before expAB | MISSING (shadow only) | live path `legacy/index.html:2308-2309` unshrunk; the shrunk form exists only in the shadow block `:2434` |
| M11 | Hot-form (last-30) weight is 4-11x the measured value; nested blend + `k=60` (`:36`) | xBA-primary rate, one un-nested last-30 term at weight <= ~0.1 | MISSING | `legacy/index.html:2349`, `:2351`, `:2357`, sim `:2065-2066` still `shBlendN` -> `shShrink(...,60,...)` |
| M12 | Sim rate runs ~+8.8 hot vs the closed form (`:37`) | none specced | MISSING (open, no fix exists) | same sites as M4 |
| M13 | Props archive omits the three `*_alternate` markets; same-line quotes not folded; no vintage stamp (`:38`) | Add alt keys to the sweep, fold, stamp, guard sweep-list >= engine-list | MISSING | `tools/snapshot_props.py:24` MARKETS has no `_alternate` key; `:27` `CZ = "williamhill_us"` (the archive's settlement-book fields are still Caesars); identical in `pl-history/tools/snapshot_props.py` |
| M14 | Allocator is non-monotone in price because ranking is price-blind (`:39`) | A1 (edge-aware base weight) | MISSING | `legacy/index.html:3083` `base:probMode?prob:...` and `probMode` is true for `ev_gated` and `dk_fd` (`:3032`) |
| M15 | Snapshot-vintage error in a measurement (`:40`) | Corrected; rule recorded | IN PLACE (documentation rule; nothing in code to regress) | `docs/freeze-exit-bundle.md:40` |
| M16 | Cross-ticket same-game dependence priced nowhere; `0.5` damping never fitted (`:41`) | Documented, no ship | MISSING (by decision) | `legacy/index.html:3119` `shared+=(gUse[l.game]||0)*0.5` |
| M17 | Bot path whitelist / sha references (`:43`) | Guards `tests/bot-path-whitelist.test.ts`, `tests/sha-references.test.ts` | IN PLACE (tests present; not run in this read-only phase) | both files exist under `tests/` |
| M18 | Model-input vintage is tracked, not frozen; writers paused 07-29 (`:42`) | Track vintage; resume writers at freeze exit | MISSING / worse: still paused, no staleness check | `.github/workflows/model.yml:7-10` schedule commented out; `.github/workflows/context.yml:30-33` context.json commit paused; `git log -1` on `public/model/priors.json` -> `671aed9 2026-07-29`, on `public/model/context.json` -> `64c42ad 2026-07-29`; `context.json` `date` = `2026-07-29`; `shPenF` reads `SH_CTX.bullpen_last3` with no date check `legacy/index.html:1663-1669`; loaders `app/api/generate/route.ts:364-366`, `src/lib/engine-client.ts:351-352` do not compare dates |
| M19 | `buildParlaySet` emits duplicate tickets; K same-game groups priced as a naive product (`:44`) | Ticket-level dedupe + naive-price disclosure tag | MISSING | pushes are unconditional at `legacy/index.html:2798`, `:2809`, `:2819`; `probNaive` is emitted only when `simJoint` succeeds (`:2764`), so a naive-priced group still carries `probNaive:null` |
| M20 | Market suspensions are unenforced in the two legacy selection modes reachable from Settings (`:45-46`) | Measured, guarded (`tests/helpers/modes.ts`), not fixed | PARTIAL: the modes are still two taps away (`app/settings/page.tsx:74`, `:77`; `src/lib/engine-client.ts:58`), but the device lock is refused on every found day | `app/builder/page.tsx:600-607` refuses `shLockCard` when `isFoundDay`; note the suspensions themselves were lifted on 2026-08-15 (section 2, row S1) |
| M21 | A count-armed parameter (`shUmpKf`) crossed its threshold unstamped (`:55`) | `tests/self-arm-stamp.test.ts` | IN PLACE (test present); factor still pinned | `tests/self-arm-stamp.test.ts` exists; `legacy/index.html:1604-1605` returns 1 under `umpKFrozen` |
| M22 | `shGradeOrientFix` rewrites `grading.legs[].detail` in place with no prior value kept (`:53`) | Retain the prior string (spec-only) | MISSING | `legacy/index.html:3661-3676` overwrites `g.detail`, stamps `v=2`, keeps no copy |
| M23 | `shPenQF` computed and discarded; `data/pen_quality.json` never committed by the bot; NaN in the shadow (`:54`) | Commit `data/pen_quality.json`; finite guard before any unfreeze | MISSING | `.github/workflows/context.yml:30-33` adds only `data/ump_k.json`; `git log -1 -- data/pen_quality.json` -> `4cd1c5d 2026-07-20`; factor pinned by `penQFrozen:true` (`legacy/index.html:1690`) |
| M24 | Kelly ceiling computed in every mode, applied in two (`:52`) | Apply the ceiling in all modes | MISSING in the engine; not reachable on a found day | `legacy/index.html:3139-3146` (`if(disciplined&&kMult>0)` at `:3143`); `shCardCalc` still stamps `p.kelly` for every pick `:3377-3381` |
| M25 | Eleven July protections hang off one predicate (`selMode in {ev_gated, dk_fd}` and `!force`) (`:51`) | Measured (`tests/m25-archive.test.ts`); no fix | PARTIAL / superseded: the live path no longer calls the allocator at all, so the predicate protects nothing on the money path (section 2) | `src/lib/server/lock-card.ts:236-260` returns `buildFoundLockEntry` for every date >= 2026-10-03; `tests/m25-archive.test.ts` exists |
| M26 | Oversizing banner suppressed when `kellyDaily` is 0, exactly where every ticket is overstaked; second site hides `RebuildNote` when no picks (`:47`) | Drop the positivity gates | MISSING | `app/builder/page.tsx:1069` still `kellyGuide && card.kellyDaily > 0 && ...`; `:1041` still `card.alloc.picks.length > 0 && <RebuildNote` |
| M27 | `originRefs()` widened to include `HEAD` (`:48`) | Owner decision | IN PLACE (narrowed 2026-07-31) | `tests/sha-references.test.ts:53`, `:80-85` (HEAD only when a held stack exists) |
| M28 | Passcode UI writes `localStorage.pl_pass`; nothing reads or sends it (`:49`) | `src/lib/pass.ts` `passHeader()` + six request spreads | MISSING | writers `app/settings/page.tsx:328`, `:361-362`; the only `x-pl-pass` references are the two server readers `app/api/odds/route.ts:49`, `app/api/sharp/route.ts:70`; no `src/lib/pass.ts`, no `passHeader` |
| M29 | `dirPref` half-wired (no callers, absent from the board echo) (`:50`) | Add to `BoardEcho`, wire or delete | IN PLACE | `src/lib/engine-echo.ts:108`, `:155`; `app/settings/page.tsx:34`, `:94`; `src/lib/engine-client.ts:94-106`, `:123` |

### 2. Register A1..A4 and the July protections (ENGINE2.md autopsy + fix-file phases)

| ID | Defect / protection | Documented fix | Status today | Evidence |
|---|---|---|---|---|
| A1 | Price-blind stake weight (`docs/freeze-exit-bundle.md:626`) | `base = max(ev,0)/(dec-1)` | MISSING | `legacy/index.html:3083` |
| A2 | EV floor does not scale with legs (`:627`) | `1.02^n - 1` | MISSING | fixed `evMin` at `legacy/index.html:3033`, applied `:3039` |
| A3 | `consMinEv` multiplicative structure; a decision was required by 2026-09-22 (`:628`, `:632-642`) | Decision | CANNOT VERIFY the decision; the structure is unchanged | `legacy/index.html:1087` (`consMinN:100,consMinEv:-1`), `:3068-3079` |
| A4 | Stake concentration under `perParlayCap` (`:630`) | Re-measure after A1 | MISSING | `legacy/index.html:1069` `perParlayCap:0.25`, `:3138` |
| Autopsy 1 | Grading orientation (`ENGINE2.md:488-520`) | `shGradeOrientFix`, `grading.v=2` | IN PLACE | `legacy/index.html:3661-3676`; `tests/grade-orientation.test.ts` exists |
| Autopsy 2 / Phase 1 | Settlement floor: never stake below 0 EV at the settling book, override-proof | `coreCzEvMin:0`, reason `nv_tax`, checked on the force path | IN PLACE in the engine; on the live found path the equivalent is `czEv > 0` | `legacy/index.html:1087`, `:3041-3049`; `src/lib/server/lock-card.ts:1149` |
| Autopsy 3 | H+R+RBI alternate lines suspended; HRR PA re-basing clamp | `hrrAltMax` (later -1 = whole market), clamp +-15% | PARTIAL: clamp in place; the suspension was lifted on all three generators | clamp `legacy/index.html:2368`; engine default `hrrAltMax:-1` `:1087` overridden to 99 by `src/lib/paper-mode.ts:133-143`, called at `app/api/generate/route.ts:438`, `app/api/scheduler/route.ts:255`, `src/lib/engine-client.ts:125`; the found card blocks HRR overs only (`src/lib/server/lock-card.ts:1144`) |
| Autopsy 4 | Unproven markets need the consensus on side | `consMinN:100`, `consMinEv:-1` | PARTIAL: in the engine, bypassed by the live path | `legacy/index.html:3068-3079` sits inside `shAllocate`, which found mode never calls (`src/lib/server/lock-card.ts:1105-1116`, `:1134-1151`) |
| 2026-07-26 gate | No independent consensus -> not eligible (`booksInd === 0`) | Hard block `no_ind_consensus` | PARTIAL: in the engine, bypassed by the live path, and found straights are built with `booksInd: 0` | `legacy/index.html:3050-3065`; `src/lib/server/lock-card.ts:177` |
| Autopsy 5 | Structure cap and FUN size | `coreMaxLegs:3`, FUN default $5 | IN PLACE / stricter (found card is one-leg only; fun is 0 on straight days) | `legacy/index.html:1087`, `:3009`; `src/lib/found-mode.ts` (`STRAIGHT_SINCE`, `foundFunOf`) |
| Phase 1 | FUN limited | `funMaxTickets:1`, `funMaxLegs:4` | IN PLACE | `legacy/index.html:1093` (config), `:3484-3486` |
| Phase 2 | Suspended-market tagging (`susp`), HR-anytime parlay ban on the core | `susp` rows shown, never ticketed; `coreNoHR` | PARTIAL: mechanism in place, but with the lift no `pitcher_outs` or HRR row is tagged any more | `legacy/index.html:2524`, `:2670`, `:3229`; `coreNoHR` `:3005-3006`; found card blocks HR `src/lib/server/lock-card.ts:1143` |
| Phase 5 | Unders enabled in the disciplined modes, `dirPref` | as documented | IN PLACE | `tests/unders.test.ts` exists; row M29 |
| Phase 6 | Managed bankroll ($2,500 base + deposits - withdrawals + realized P/L); combined 10% daily exposure cap at lock | `src/lib/bankroll.ts`; cap in `shLockCard` / `shLockSupplemental` | PARTIAL: in place for the device lock, bypassed by the live path | cap `legacy/index.html:3428-3432`, `:3373-3374`; live path sizes off a constant `bankroll: 10000` with `daily: 2500` plus same-day wins (`src/lib/found-mode.ts:55-76`, `:154-172`, `:295-297`); `src/lib/bankroll.ts` is not imported by `src/lib/found-mode.ts` or `src/lib/server/lock-card.ts` |
| Kelly sizing | Quarter-Kelly, 2% cap, used as a CEILING on a share of the capped daily amount; operator rule "no slip above 2% of bankroll ($50)" (`CLAUDE.md:429-431`) | `shKellyFrac` + `kellyStakeMult` ceiling | PARTIAL: the ceiling formula became the stake itself | engine `legacy/index.html:3356-3363`, `:3141-3146`; found `src/lib/found-mode.ts:154-172` (`4 x 10000 x min(0.25 f*, 0.02)` = full Kelly up to $800) |
| EV gate | `coreEvMin: 2` (+2% at the selection price) | hard gate, no-play is a first-class result | PARTIAL: replaced on MLB by `czEv > 0` after a 50% shrink toward the market; football found uses +1% since 2026-11-01 | `legacy/index.html:1075`, `:3039`; `src/lib/server/lock-card.ts:1149`; `src/lib/paper-mode.ts:190-204` (`shrinkW 0.5`); `src/lib/found-mode.ts:130-135` |
| Price-age guard | Lock refused when the board is older than 30 minutes | `lockMaxAgeMin:30` | IN PLACE for the device lock | `legacy/index.html:3412-3423` |
| Rebaseline | `obSameDay` dropped every game at or after 00:00 UTC on a UTC host (24% of the slate) | Slate membership (`slate.eligible`), `data_gaps` disclosure | IN PLACE | `legacy/index.html:1262-1271`, `:1357-1358`; `tests/timezone-parity.test.ts` exists. Residual `obSameDay` use at `:924` is the legacy odds-browser game list only |
| Settlement audit | Zero misgraded | none | N/A | `docs/settlement-audit.md` |

### 3. Pitcher-outs audit and calibration items

| ID | Defect | Documented fix | Status today | Evidence |
|---|---|---|---|---|
| Outs 1 | Offense factor constant `0.140` should be about `0.400` | = M2 | MISSING | `legacy/index.html:2258` |
| Outs 2 | No hook-timing term (lines >= 16.5 still -2.57 outs after the constant fix) | Hook term / sim routing (= M2') | MISSING | `legacy/index.html:2260`, `:1543` |
| Outs 3 | Innings shrinkage `k = 4` against `n ~ 4` starts | Refit `k` | MISSING | `legacy/index.html:2253` `ipg=shShrink(ipg,nOut,4,Lipg)` |
| Outs mitigation | Market suspended pending the fix (`outsSusp:true`, 2026-07-31) | keep suspended until M2 ships | PARTIAL: engine suspension lifted 2026-08-15; only the found card excludes outs since 2026-10-06 | `legacy/index.html:1087`; `src/lib/paper-mode.ts:133-143`; `src/lib/found-mode.ts:137-151`; `src/lib/server/lock-card.ts:1082`, `:1145`. Outs rows are therefore untagged, graded and priced on the Board, Builder generator, Sharp page and `/api/picks`, and `STRAIGHT_MARKETS` still lists `pitcher_outs` (`src/lib/server/lock-card.ts:142`) |
| HR one-sided haircut | One-sided HR fair = implied / 1.06, hard-coded; measured overround 1.161 | none shipped ("measured, NOT changed", `docs/collection-period.md:1217`) | MISSING | `legacy/index.html:2491`, `:2605`; `pl-history/data/hr_overround.json` (87 days, 7,581 rows, overround 1.1609, "czEV overstated ~6.2pp"); mitigated only by HR being barred from the core and the found card |
| Cal 1 | Calibration training window polluted by two generators | `CAL_START = "2026-07-25"` | IN PLACE | `src/engine2/calibration.ts:657-662` |
| Cal 2 | Weekly full fit | external cron-job.org job, Sundays 10:00 (`docs/cron-jobs.md:22`) | CANNOT VERIFY (external scheduler; no Vercel cron for `/api/calibrate` in `vercel.json`) | the scheduler only forwards `?grade=only` (`app/api/scheduler/route.ts:416-418`), which by design does not refit (`app/api/calibrate/route.ts:138-147`) |
| Cal 3 | `/api/calibrate` auth | "fails closed" on the scheduler | PARTIAL: `/api/calibrate` itself still allows any caller when `CRON_SECRET` is unset | `app/api/calibrate/route.ts:76-84` (`return !cron`); scheduler comment `app/api/scheduler/route.ts:156` |

### 4. Not determined

- Live Redis state (`pl:cal:summary`, `pl:cal:weights`, the ledger) was not read (no network); whether
  the weekly fit actually runs, and the current calibration multipliers, cannot be determined from disk.
- Whether `CRON_SECRET` is set in production cannot be determined (no env files opened).
- No test was executed; "test present" means the file exists, not that it passes.
- iCloud conflict copies exist (for example `tests/timezone-parity.test 3.ts`, `tools/outs_audit 3.py`);
  not analysed.

---

## 6. Sportsbook references

Source: `audit-out/book-sweep.md` (script `audit-out/scripts/book_sweep.py`; machine copy of every hit
`audit-out/scripts/book_sweep_hits.json`). The sweep covered 894 of 920 tracked files: 16 iCloud conflict copies
were skipped and not analysed, one env-named file (`tools/handoff-state.env`) was never opened, and binary files
were excluded. Matching is case-insensitive, one hit per line per term.

**The complete list of every hit, one line per hit with `path:line`, is Appendix C of this document** (the full
text of `/private/tmp/claude-501/audit-out/book-sweep.md`, about 7,900 lines). This section summarises it.

### 6.1 What the sweep found, in plain terms

1. **The bet price is already DraftKings everywhere.** `SETTLE_BOOK = 'draftkings'`
   (`src/lib/sportsbook/books.ts:12`). The MLB engine still declares `var CAESARS_KEY="williamhill_us"`
   (`legacy/index.html:888`) but the wrapper rebinds it to the settlement book (`src/engine/index.ts:296-300`).
   Every field named `cz*` (`czOdds`, `czEv`, `czDec`, `evCz`, ...) now holds a DraftKings number. The 2,951
   lines that carry a `cz` identifier are therefore a naming problem, not a pricing problem, except for the
   places listed in 6.5 where `cz` still literally resolves to Caesars.
2. **FanDuel is never a bet price.** It arrives in every response because no request filters by book, and the
   parsers read it, but it is only ever the second half of the MLB "basis" (`bs*`) or a display quote. It is
   never the settlement book, never stamped on a ticket, and never the price a grade, EV or stake is computed
   at. Football has no DK/FD basis at all. No config key, rule or gate names FanDuel.
3. **No request names a book.** There is no `bookmakers=` request parameter in the repo. Props are pulled with
   `regions=us`, game lines with `regions=us,eu`, so every book in the region arrives and every parser loops
   over all of them.
4. **The probability side is not DK/FD-only.** The "market fair" that every edge is measured against is a
   weighted median across all returned books, with Pinnacle, Betfair, Matchbook and BetOnline over-weighted in
   MLB (`legacy/index.html:1557`) and Pinnacle weighted 2 in football (`src/lib/cfb/rules.ts:75`,
   `src/lib/nfl/rules.ts:66`). Keeping sharp books as a reference is defensible. It is implicit today, and the
   gates were tuned for a many-book world.
5. **A "best price across all books" layer still exists** and still drives headline odds, EV, Kelly, badges and
   the top-50 sort in the MLB engine, the Games-tab grade, and the prediction log's stored `ev` / `odds` / `book`.
   A price the owner cannot bet is shown as, or substituted for, a bettable price.
6. **False positives, excluded from the counts below:** "Wynn" (7 lines, all player names) and "Underdog" (7
   lines, all the generic word or ESPN's flag). **Zero hits anywhere:** PointsBet, Barstool, Fliff, PrizePicks,
   "best line".

### 6.2 Counts per term (from the sweep, unchanged)

Lines = matching lines; Files = files with at least one matching line; Occurrences = total matches. Role columns count matching lines.

| Term | Lines | Files | Occurrences | fetch code | config | caches | calculations | stored-data fields | UI | tests | docs | tools |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Caesars (word) | 1166 | 198 | 1445 | 30 | 34 | 8 | 191 | 28 | 110 | 527 | 232 | 6 |
| William Hill / williamhill_us | 148 | 55 | 282 | 0 | 4 | 1 | 12 | 2 | 4 | 106 | 18 | 1 |
| czr (whole word) | 8 | 6 | 13 | 0 | 1 | 0 | 3 | 0 | 2 | 2 | 0 | 0 |
| cz identifier fragment | 2951 | 263 | 5409 | 39 | 13 | 90 | 499 | 98 | 343 | 1496 | 330 | 43 |
| BetMGM | 50 | 23 | 242 | 1 | 1 | 0 | 3 | 0 | 3 | 35 | 7 | 0 |
| mgm outside 'betmgm' | 41 | 10 | 45 | 0 | 1 | 0 | 1 | 0 | 3 | 9 | 27 | 0 |
| Circa | 22 | 5 | 25 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 20 | 0 |
| Westgate | 3 | 3 | 3 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| SuperBook | 4 | 4 | 7 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 1 | 0 |
| South Point | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| STN / Station | 5 | 5 | 8 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 3 | 0 |
| Pinnacle | 135 | 41 | 148 | 0 | 7 | 0 | 15 | 1 | 11 | 81 | 18 | 2 |
| Bovada | 62 | 16 | 258 | 0 | 0 | 0 | 0 | 0 | 3 | 57 | 2 | 0 |
| BetOnline | 35 | 11 | 65 | 0 | 0 | 0 | 3 | 0 | 3 | 26 | 3 | 0 |
| BetRivers | 33 | 8 | 215 | 1 | 1 | 0 | 0 | 0 | 3 | 28 | 0 | 0 |
| PointsBet | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Wynn | 7 | 7 | 9 | 0 | 0 | 0 | 0 | 4 | 0 | 3 | 0 | 0 |
| ESPN Bet | 5 | 5 | 60 | 0 | 0 | 0 | 0 | 0 | 3 | 2 | 0 | 0 |
| Fanatics | 76 | 17 | 273 | 0 | 1 | 0 | 0 | 0 | 3 | 72 | 0 | 0 |
| Hard Rock | 3 | 3 | 4 | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 |
| bet365 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Unibet | 46 | 3 | 47 | 0 | 0 | 0 | 0 | 0 | 2 | 44 | 0 | 0 |
| Barstool | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| BetUS | 20 | 5 | 50 | 0 | 0 | 0 | 0 | 0 | 3 | 17 | 0 | 0 |
| LowVig | 26 | 5 | 56 | 0 | 0 | 0 | 0 | 0 | 3 | 23 | 0 | 0 |
| MyBookie | 28 | 5 | 58 | 0 | 0 | 0 | 0 | 0 | 3 | 25 | 0 | 0 |
| Betfair | 30 | 12 | 30 | 0 | 0 | 0 | 5 | 0 | 2 | 18 | 5 | 0 |
| Fliff | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PrizePicks | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Underdog | 7 | 7 | 36 | 0 | 0 | 0 | 2 | 0 | 0 | 3 | 2 | 0 |
| DraftKings | 520 | 112 | 1214 | 1 | 10 | 0 | 47 | 4 | 59 | 364 | 30 | 5 |
| FanDuel | 153 | 55 | 485 | 1 | 1 | 0 | 17 | 0 | 11 | 114 | 9 | 0 |
| SETTLE_BOOK / settleBook / settlementBook | 117 | 42 | 151 | 2 | 13 | 0 | 59 | 8 | 5 | 18 | 12 | 0 |
| bookmakers | 133 | 48 | 157 | 23 | 0 | 0 | 11 | 0 | 0 | 89 | 6 | 4 |
| regions= / regions: / regions | 129 | 42 | 150 | 13 | 18 | 0 | 6 | 0 | 1 | 35 | 51 | 5 |
| consensus | 667 | 124 | 1069 | 18 | 9 | 0 | 131 | 17 | 98 | 180 | 211 | 3 |
| best line | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bestPrice / best price | 27 | 24 | 28 | 0 | 0 | 0 | 6 | 3 | 8 | 5 | 4 | 1 |
| median | 369 | 72 | 423 | 1 | 1 | 0 | 72 | 3 | 13 | 47 | 194 | 38 |

Files scanned: 894. Conflict copies skipped (not analysed): 16. Env files skipped (never opened): 1.

Conflict copies present:
- tests/timezone-parity.test 3.ts
- tools/build_ufc 3.py
- tools/build_ufc 4.py
- tools/burn-report 3.mjs
- tools/burn-report 5.mjs
- tools/guard-diff-audit 3.mjs
- tools/guard-diff-audit 4.mjs
- tools/hr-pair-dependence 3.mjs
- tools/m10_eiv 3.py
- tools/outs_audit 3.py
- tools/phase2_series_b 3.py
- tools/phase2_series_b 4.py
- tools/price-path 3.mjs
- tools/price-path 4.mjs
- tools/price-path 5.mjs
- tools/self_consistency 3.py

Env-named files skipped:
- tools/handoff-state.env

False-positive verdicts for the low-count terms (every hit was read):

- Wynn: 7 lines, ALL player names (Kerwynn Williams, Austin Wynns). No Wynn sportsbook reference.
- Underdog: 7 lines, ALL the generic word or ESPN's `underdog` flag. No Underdog-app reference.
- Hard Rock: 2 real (display-label maps), 1 venue name in a fixture.
- ESPN Bet: 3 real (display-label maps), 2 ESPN logo URLs in fixtures.
- STN / Station: 1 real code site (Nevada bookmark list, legacy/index.html:529) plus its generated copy, 1 doc row; 2 doc hits are the word "stationary".
- Circa, Westgate, SuperBook, South Point: the only code site is the same Nevada bookmark list `DEFAULT_BOOKS` at legacy/index.html:529 (a list of sportsbook web links, not prices); the rest is docs (docs/multibook-memo.md) and one test of a label abbreviator.
- czr: `CZR` as a UI label at app/builder/page.tsx:1179 and app/design/page.tsx:286; alias in `bookKey()` at src/lib/sportsbook/books.ts:18; a local variable at legacy/index.html:1325-1326.
- Zero hits anywhere: PointsBet, Barstool, Fliff, PrizePicks, "best line".

### 6.3 Non-DraftKings/FanDuel references by file role

Matching lines, counted once per term per line (a line naming two books counts twice). "Caesars" = Caesars, William Hill, czr. "cz identifier" = any `cz*` token (now meaning DraftKings; see 6.1). "Nevada books" = Circa, Westgate, SuperBook, South Point, STN/Station (the STN pattern also matches two doc lines with the word "stationary"). "Other books" = BetMGM, MGM, Pinnacle, Bovada, BetOnline, BetRivers, ESPN Bet, Fanatics, Hard Rock, bet365, Unibet, BetUS, LowVig, MyBookie, Betfair. A file is filed under the role where most of its hits fall. Counts are generated from `audit-out/scripts/book_sweep_hits.json`.

| Role | Files | Caesars lines | cz identifier lines | Nevada book lines | Other book lines |
|---|---|---|---|---|---|
| tests | 161 | 635 | 1496 | 1 | 439 |
| docs | 21 | 250 | 330 | 26 | 62 |
| calculations | 53 | 208 | 500 | 8 | 27 |
| UI | 48 | 116 | 343 | 0 | 47 |
| config | 7 | 39 | 13 | 0 | 11 |
| stored-data fields | 9 | 30 | 98 | 0 | 1 |
| fetch code | 7 | 28 | 38 | 0 | 2 |
| caches | 6 | 9 | 90 | 0 | 0 |
| tools | 12 | 7 | 43 | 0 | 2 |
| All | 324 | 1322 | 2951 | 35 | 591 |

### 6.4 Non-DraftKings/FanDuel references by file

Every file with at least one hit (324 files), grouped by role, most named-book lines first. The line-by-line list is Appendix C.

**calculations** (53 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `legacy/index.html` | 77 | 133 | 4 | Pinnacle 2, Circa 1, Westgate 1, SuperBook 1, STN/Station 1, BetMGM 1, BetOnline 1, Betfair 1 | 86 |
| `src/engine2/allstar.ts` | 15 | 20 | 0 | Pinnacle 1 | 16 |
| `src/lib/cfb/props.ts` | 12 | 22 | 0 | Pinnacle 1 | 13 |
| `src/lib/cfb/picks.ts` | 12 | 25 | 0 | - | 12 |
| `src/lib/server/clv-core.ts` | 11 | 13 | 0 | - | 11 |
| `src/engine/legacy-src.gen.ts` | 3 | 1 | 4 | Circa 1, Westgate 1, SuperBook 1, STN/Station 1, BetMGM 1, Pinnacle 1, BetOnline 1, Betfair 1 | 11 |
| `src/lib/server/mlb-live-quote.ts` | 9 | 11 | 0 | - | 9 |
| `src/lib/cfb/card.ts` | 7 | 20 | 0 | - | 7 |
| `src/lib/sportsbook/mlb.ts` | 6 | 12 | 0 | - | 6 |
| `src/engine2/sharpBoard.ts` | 1 | 26 | 0 | Pinnacle 3, Betfair 1 | 5 |
| `src/lib/cfb/lock-server.ts` | 5 | 4 | 0 | - | 5 |
| `src/lib/engine-client.ts` | 4 | 1 | 0 | Pinnacle 1 | 5 |
| `src/engine2/devig.ts` | 0 | 0 | 0 | Pinnacle 2, Betfair 2, BetOnline 1 | 5 |
| `src/lib/server/lock-card.ts` | 4 | 53 | 0 | - | 4 |
| `src/lib/fun-hr.ts` | 4 | 13 | 0 | - | 4 |
| `src/lib/ufc.ts` | 4 | 12 | 0 | - | 4 |
| `src/lib/cfb/model.ts` | 1 | 10 | 0 | Pinnacle 3 | 4 |
| `src/lib/prop-lean.ts` | 1 | 9 | 0 | BetMGM 1, MGM 1 | 3 |
| `src/lib/board-order.ts` | 3 | 4 | 0 | - | 3 |
| `src/lib/football/gen-pool.ts` | 3 | 1 | 0 | - | 3 |
| `app/api/cfb/lock/route.ts` | 3 | 0 | 0 | - | 3 |
| `src/lib/sportsbook/football.ts` | 2 | 8 | 0 | - | 2 |
| `src/lib/ticket-math.ts` | 2 | 5 | 0 | - | 2 |
| `src/lib/ledger-segments.ts` | 2 | 4 | 0 | - | 2 |
| `src/engine2/calibration.ts` | 2 | 2 | 0 | - | 2 |
| `src/lib/cfb/useCfbDesk.ts` | 2 | 1 | 0 | - | 2 |
| `src/lib/sportsbook/useLivePrices.ts` | 2 | 1 | 0 | - | 2 |
| `src/lib/clv-report.ts` | 1 | 9 | 0 | - | 1 |
| `src/lib/parlay-gen.ts` | 1 | 7 | 0 | - | 1 |
| `src/lib/ticket-payout.ts` | 1 | 6 | 0 | - | 1 |
| `src/lib/cfsel.ts` | 1 | 1 | 0 | - | 1 |
| `src/lib/grade.ts` | 1 | 1 | 0 | - | 1 |
| `app/api/calibrate/route.ts` | 1 | 0 | 0 | - | 1 |
| `app/api/clv/route.ts` | 1 | 0 | 0 | - | 1 |
| `src/engine2/grade.ts` | 1 | 0 | 0 | - | 1 |
| `src/lib/cfb/h1.ts` | 0 | 0 | 0 | Pinnacle 1 | 1 |
| `src/lib/cfb/props-context.ts` | 1 | 0 | 0 | - | 1 |
| `src/lib/lineup-check.ts` | 1 | 0 | 0 | - | 1 |
| `src/lib/nfl/first-sunday-six.ts` | 1 | 0 | 0 | - | 1 |
| `src/lib/server/self-reading.ts` | 0 | 16 | 0 | - | 0 |
| `src/lib/shrink.ts` | 0 | 8 | 0 | - | 0 |
| `src/lib/cfb/found.ts` | 0 | 7 | 0 | - | 0 |
| `src/lib/bet-alert.ts` | 0 | 6 | 0 | - | 0 |
| `src/lib/cross-sport.ts` | 0 | 6 | 0 | - | 0 |
| `src/lib/under-bias.ts` | 0 | 5 | 0 | - | 0 |
| `src/lib/games.ts` | 0 | 4 | 0 | - | 0 |
| `src/lib/server/mlb-day-won.ts` | 0 | 4 | 0 | - | 0 |
| `src/lib/cross-adapters.ts` | 0 | 2 | 0 | - | 0 |
| `src/lib/mlb/market-board.ts` | 0 | 2 | 0 | - | 0 |
| `src/lib/parlay-gen-setup.ts` | 0 | 2 | 0 | - | 0 |
| `src/lib/cfb/grade.ts` | 0 | 1 | 0 | - | 0 |
| `src/lib/leg-settled.ts` | 0 | 1 | 0 | - | 0 |
| `src/lib/my-parlay.ts` | 0 | 1 | 0 | - | 0 |

**fetch code** (7 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `src/lib/server/football-props.ts` | 19 | 24 | 0 | - | 19 |
| `app/api/ufcprops/route.ts` | 2 | 6 | 0 | BetMGM 1, BetRivers 1 | 4 |
| `src/lib/useAllStar.ts` | 4 | 0 | 0 | - | 4 |
| `src/lib/mlb/live-client.ts` | 1 | 6 | 0 | - | 1 |
| `app/api/cfb/props/route.ts` | 1 | 0 | 0 | - | 1 |
| `app/api/nfl/props/route.ts` | 1 | 0 | 0 | - | 1 |
| `app/api/picks/route.ts` | 0 | 2 | 0 | - | 0 |

**config** (7 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `src/lib/cfb/rules.ts` | 24 | 5 | 0 | Pinnacle 2 | 26 |
| `src/lib/sportsbook/books.ts` | 6 | 2 | 0 | BetMGM 1, MGM 1, Pinnacle 1, BetRivers 1, Fanatics 1 | 11 |
| `src/lib/nfl/rules.ts` | 5 | 3 | 0 | Pinnacle 3 | 8 |
| `src/lib/paper-mode.ts` | 2 | 0 | 0 | - | 2 |
| `src/lib/football/league.ts` | 0 | 2 | 0 | Pinnacle 1 | 1 |
| `src/lib/mlb/live-props-rules.ts` | 1 | 1 | 0 | - | 1 |
| `src/lib/server/odds-shape.ts` | 1 | 0 | 0 | - | 1 |

**caches** (6 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `src/lib/cfb/props-store.ts` | 4 | 10 | 0 | - | 4 |
| `src/lib/cz-offered.ts` | 3 | 25 | 0 | - | 3 |
| `src/lib/cz-hidden-merge.ts` | 1 | 29 | 0 | - | 1 |
| `app/api/prefs/route.ts` | 1 | 20 | 0 | - | 1 |
| `src/lib/useLedger.ts` | 0 | 4 | 0 | - | 0 |
| `src/lib/ledger-merge.ts` | 0 | 2 | 0 | - | 0 |

**stored-data fields** (9 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `src/engine/index.ts` | 11 | 16 | 0 | - | 11 |
| `src/lib/cfb/types.ts` | 7 | 9 | 0 | Pinnacle 1 | 8 |
| `src/lib/mlb/live-quote-types.ts` | 5 | 3 | 0 | - | 5 |
| `src/lib/cfb/props-types.ts` | 4 | 9 | 0 | - | 4 |
| `src/lib/nfl/first-sunday-six-prices.json` | 2 | 0 | 0 | - | 2 |
| `src/lib/pred-serialize.ts` | 1 | 11 | 0 | - | 1 |
| `src/lib/nfl/week1-replay.json` | 0 | 40 | 0 | - | 0 |
| `src/lib/server/card-view.ts` | 0 | 8 | 0 | - | 0 |
| `src/lib/engine-echo.ts` | 0 | 2 | 0 | - | 0 |

**UI** (48 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `src/components/cfb/CfbGameCard.tsx` | 8 | 13 | 0 | Pinnacle 2, BetMGM 1, MGM 1, Bovada 1, BetOnline 1, BetRivers 1, ESPN Bet 1, Fanatics 1, Hard Rock 1, Unibet 1, BetUS 1, LowVig 1, MyBookie 1 | 22 |
| `src/components/cfb/CfbProps.tsx` | 6 | 23 | 0 | BetMGM 1, MGM 1, Pinnacle 1, Bovada 1, BetOnline 1, BetRivers 1, ESPN Bet 1, Fanatics 1, Hard Rock 1, Unibet 1, BetUS 1, LowVig 1, MyBookie 1 | 19 |
| `src/components/props/props-model.ts` | 4 | 7 | 0 | BetMGM 1, MGM 1, Pinnacle 1, Bovada 1, BetOnline 1, BetRivers 1, ESPN Bet 1, Fanatics 1, BetUS 1, LowVig 1, MyBookie 1, Betfair 1 | 16 |
| `src/components/allstar/AllStarSurfaces.tsx` | 16 | 1 | 0 | - | 16 |
| `app/board/page.tsx` | 15 | 54 | 0 | - | 15 |
| `app/sharp/page.tsx` | 12 | 17 | 0 | - | 12 |
| `src/components/cfb/CfbPicksBoard.tsx` | 8 | 27 | 0 | - | 8 |
| `src/components/nfl/FirstSundaySix.tsx` | 6 | 0 | 0 | - | 6 |
| `app/builder/page.tsx` | 5 | 34 | 0 | - | 5 |
| `src/components/cfb/CfbSharp.tsx` | 1 | 16 | 0 | Pinnacle 4 | 5 |
| `src/components/cfb/CfbTicketCard.tsx` | 4 | 11 | 0 | - | 4 |
| `src/components/mlb/SharpDesk.tsx` | 0 | 7 | 0 | Pinnacle 3, Betfair 1 | 4 |
| `app/design/page.tsx` | 3 | 13 | 0 | - | 3 |
| `app/globals.css` | 3 | 0 | 0 | - | 3 |
| `src/components/ui/OddsCell.tsx` | 3 | 0 | 0 | - | 3 |
| `app/props/page.tsx` | 2 | 9 | 0 | - | 2 |
| `src/components/cfb/CfbGames.tsx` | 2 | 0 | 0 | - | 2 |
| `src/components/ufc/UfcSharp.tsx` | 1 | 10 | 0 | - | 1 |
| `src/components/ufc/UfcBoard.tsx` | 1 | 9 | 0 | - | 1 |
| `src/components/ufc/UfcBuilder.tsx` | 1 | 9 | 0 | - | 1 |
| `src/components/mlb/ProScoreboard.tsx` | 1 | 8 | 0 | - | 1 |
| `src/components/mlb/SimDesk.tsx` | 1 | 5 | 0 | - | 1 |
| `src/components/stats/ClvPanel.tsx` | 1 | 5 | 0 | - | 1 |
| `app/settings/page.tsx` | 1 | 4 | 0 | - | 1 |
| `src/components/cfb/CfbSlip.tsx` | 1 | 4 | 0 | - | 1 |
| `app/ledger/page.tsx` | 1 | 3 | 0 | - | 1 |
| `src/components/cfb/CfbBuilder.tsx` | 1 | 3 | 0 | - | 1 |
| `src/components/ufc/UfcCard.tsx` | 1 | 2 | 0 | - | 1 |
| `src/components/ufc/UfcProps.tsx` | 1 | 2 | 0 | - | 1 |
| `src/components/props/PlayerRow.tsx` | 1 | 1 | 0 | - | 1 |
| `src/components/calc/CalcHero.tsx` | 1 | 0 | 0 | - | 1 |
| `src/components/cfb/CfbSeason.tsx` | 1 | 0 | 0 | - | 1 |
| `src/components/cfb/TeamMark.tsx` | 1 | 0 | 0 | - | 1 |
| `src/components/ui/OddsGrid.tsx` | 1 | 0 | 0 | - | 1 |
| `src/components/ui/StatTile.tsx` | 1 | 0 | 0 | - | 1 |
| `src/components/ufc/UfcLiveProps.tsx` | 0 | 10 | 0 | - | 0 |
| `src/components/mlb/ParlaysSection.tsx` | 0 | 9 | 0 | - | 0 |
| `src/components/props/GameCard.tsx` | 0 | 6 | 0 | - | 0 |
| `src/components/props/GenSheet.tsx` | 0 | 5 | 0 | - | 0 |
| `src/components/mlb/LiveOpportunities.tsx` | 0 | 3 | 0 | - | 0 |
| `src/components/cfb/GameSuggestedPicks.tsx` | 0 | 2 | 0 | - | 0 |
| `src/components/props/RankedPicks.tsx` | 0 | 2 | 0 | - | 0 |
| `src/components/props/Slip.tsx` | 0 | 2 | 0 | - | 0 |
| `src/components/props/mlb-gen-pool.ts` | 0 | 2 | 0 | - | 0 |
| `src/components/props/useSlotDrag.ts` | 0 | 2 | 0 | - | 0 |
| `src/components/ledger/ReceiptsPanel.tsx` | 0 | 1 | 0 | - | 0 |
| `src/components/props/CrossBoardResults.tsx` | 0 | 1 | 0 | - | 0 |
| `src/components/ui/CzInfo.tsx` | 0 | 1 | 0 | - | 0 |

**tools** (12 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `tools/snapshot_props.py` | 3 | 9 | 0 | - | 3 |
| `tools/hr_overround.py` | 3 | 5 | 0 | - | 3 |
| `.github/workflows/line-history.yml` | 0 | 0 | 0 | Pinnacle 1 | 1 |
| `tools/board-report.mjs` | 1 | 0 | 0 | - | 1 |
| `tools/snapshot_odds.py` | 0 | 0 | 0 | Pinnacle 1 | 1 |
| `tools/ledger-report.mjs` | 0 | 15 | 0 | - | 0 |
| `tools/phase2_series_b.py` | 0 | 4 | 0 | - | 0 |
| `tools/selection_effect.py` | 0 | 4 | 0 | - | 0 |
| `tools/gate_activity.py` | 0 | 2 | 0 | - | 0 |
| `tools/price-path.mjs` | 0 | 2 | 0 | - | 0 |
| `.github/workflows/board-archive.yml` | 0 | 1 | 0 | - | 0 |
| `tools/archive_boards.py` | 0 | 1 | 0 | - | 0 |

**docs** (21 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `docs/multibook-memo.md` | 18 | 78 | 22 | MGM 26, Circa 18, BetMGM 4, Westgate 1, SuperBook 1, South Point 1, STN/Station 1 | 70 |
| `docs/collection-period.md` | 60 | 73 | 1 | Pinnacle 2, STN/Station 1, Betfair 1 | 64 |
| `docs/session-handoff.md` | 54 | 51 | 0 | Bovada 2, BetOnline 2, BetMGM 1, Pinnacle 1 | 60 |
| `ENGINE2.md` | 21 | 26 | 1 | Pinnacle 7, Betfair 2, Circa 1, BetMGM 1 | 32 |
| `CLAUDE.md` | 18 | 21 | 1 | Circa 1, BetMGM 1, Pinnacle 1, Betfair 1 | 22 |
| `docs/cfb-desk.md` | 17 | 9 | 0 | Pinnacle 2 | 19 |
| `docs/progress.md` | 15 | 3 | 0 | Pinnacle 1 | 16 |
| `docs/phase2-memo.md` | 7 | 11 | 0 | Pinnacle 1, BetOnline 1, Betfair 1 | 10 |
| `docs/freeze-exit-bundle.md` | 8 | 14 | 1 | STN/Station 1 | 9 |
| `docs/auto-lock-memo.md` | 6 | 14 | 0 | - | 6 |
| `docs/singles-vs-parlays.md` | 5 | 12 | 0 | MGM 1 | 6 |
| `docs/nfl-desk.md` | 3 | 2 | 0 | Pinnacle 1 | 4 |
| `docs/harness-substitutions.md` | 4 | 1 | 0 | - | 4 |
| `docs/first-sunday-six.md` | 4 | 0 | 0 | - | 4 |
| `docs/clv.md` | 2 | 4 | 0 | - | 2 |
| `docs/branch-firing-audit.md` | 2 | 3 | 0 | - | 2 |
| `docs/hrr-recalibration.md` | 2 | 2 | 0 | - | 2 |
| `docs/credit-budget.md` | 1 | 1 | 0 | Pinnacle 1 | 2 |
| `PARLAY_LAB_QUANT_ENGINE.md` | 1 | 0 | 0 | Pinnacle 1 | 2 |
| `docs/pitcher-outs-audit.md` | 2 | 0 | 0 | - | 2 |
| `docs/cron-jobs.md` | 0 | 5 | 0 | - | 0 |

**tests** (161 files)

| File | Caesars | cz identifier | Nevada | Other books (lines per book) | Named-book total |
|---|---|---|---|---|---|
| `tests/fixtures/cfb/odds-ncaaf-2026-09-05.json` | 48 | 0 | 0 | Unibet 44, BetRivers 26, Pinnacle 24, Bovada 24, BetOnline 24, MyBookie 24, Fanatics 22, LowVig 22, BetMGM 16, BetUS 16, Betfair 16 | 306 |
| `tests/fixtures/gen-pool.json` | 197 | 289 | 0 | Fanatics 36, Bovada 23 | 256 |
| `tests/fixtures/nfl/odds-2026-09-13.json` | 26 | 0 | 0 | Pinnacle 26 | 52 |
| `tests/cfb-model.test.ts` | 32 | 34 | 0 | Pinnacle 17 | 49 |
| `tests/cfb-props.test.ts` | 22 | 33 | 0 | MGM 6, BetMGM 3 | 31 |
| `tests/cfb-props-route.test.ts` | 28 | 67 | 0 | - | 28 |
| `tests/cfb-card.test.ts` | 22 | 32 | 0 | Pinnacle 4 | 26 |
| `tests/cfb-picks.test.ts` | 22 | 59 | 0 | Pinnacle 1 | 23 |
| `tests/sportsbook.test.ts` | 12 | 21 | 0 | BetMGM 4, Pinnacle 1 | 17 |
| `tests/cfb-lock-route.test.ts` | 15 | 22 | 0 | - | 15 |
| `tests/mlb-live-props-route.test.ts` | 9 | 16 | 0 | Fanatics 3 | 12 |
| `tests/legacy-harness/int40cz.js` | 11 | 24 | 0 | - | 11 |
| `tests/engine2-allstar.test.ts` | 6 | 2 | 0 | Pinnacle 3, Betfair 2 | 11 |
| `tests/props-model.test.ts` | 6 | 20 | 1 | SuperBook 1, BetMGM 1, MGM 1, bet365 1 | 10 |
| `tests/fixtures/fix39/odds.json` | 2 | 0 | 0 | BetMGM 1, Bovada 1, BetOnline 1, BetRivers 1, Fanatics 1, BetUS 1, LowVig 1, MyBookie 1 | 10 |
| `tests/clv-core.test.ts` | 9 | 6 | 0 | - | 9 |
| `tests/football-gen.test.ts` | 8 | 50 | 0 | - | 8 |
| `tests/dkfd-basis.test.ts` | 4 | 22 | 0 | BetMGM 3, Pinnacle 1 | 8 |
| `tests/nfl-engine.test.ts` | 8 | 6 | 0 | - | 8 |
| `tests/fixtures/mlb/odds-event-live-props.synthetic.json` | 6 | 0 | 0 | Fanatics 2 | 8 |
| `tests/cfb-picks-ui.test.ts` | 7 | 7 | 0 | - | 7 |
| `tests/board-scope.test.ts` | 5 | 2 | 0 | Bovada 1, BetOnline 1 | 7 |
| `tests/cfb-props-ui.test.ts` | 6 | 10 | 0 | - | 6 |
| `tests/mlb-market-phases.test.ts` | 6 | 8 | 0 | - | 6 |
| `tests/fixtures/nfl-live-2026-09-20.json` | 2 | 1 | 0 | BetMGM 1, Bovada 1, BetRivers 1, Fanatics 1 | 6 |
| `tests/helpers/settle-book.ts` | 6 | 0 | 0 | - | 6 |
| `tests/board-settled.test.ts` | 5 | 21 | 0 | - | 5 |
| `tests/parlay-gen.test.ts` | 5 | 15 | 0 | - | 5 |
| `tests/nfl-lock-route.test.ts` | 5 | 13 | 0 | - | 5 |
| `tests/prop-board.test.ts` | 5 | 11 | 0 | - | 5 |
| `tests/sizing-discipline.test.ts` | 4 | 12 | 0 | - | 4 |
| `tests/chain-tools.test.ts` | 4 | 6 | 0 | - | 4 |
| `tests/board-selmode.test.ts` | 4 | 2 | 0 | - | 4 |
| `tests/nfl-props-route.test.ts` | 4 | 2 | 0 | - | 4 |
| `tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json` | 2 | 0 | 0 | BetMGM 2 | 4 |
| `tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json` | 2 | 0 | 0 | Bovada 1, Fanatics 1 | 4 |
| `tests/fixtures/nfl/odds-event-props-401872925.json` | 2 | 0 | 0 | BetMGM 2 | 4 |
| `tests/paper-epoch.test.ts` | 4 | 0 | 0 | - | 4 |
| `tests/singles-counterfactual.test.ts` | 3 | 35 | 0 | - | 3 |
| `tests/games.test.ts` | 1 | 10 | 0 | MGM 2 | 3 |
| `tests/engine2-devig.test.ts` | 0 | 0 | 0 | Pinnacle 3 | 3 |
| `tests/board-live-anchor.test.ts` | 2 | 15 | 0 | - | 2 |
| `tests/supplemental.test.ts` | 2 | 14 | 0 | - | 2 |
| `tests/ticket-payout.test.ts` | 2 | 14 | 0 | - | 2 |
| `tests/fun-ladder.test.ts` | 2 | 11 | 0 | - | 2 |
| `tests/engine-units.test.ts` | 2 | 8 | 0 | - | 2 |
| `tests/legacy-harness/int40card.js` | 2 | 6 | 0 | - | 2 |
| `tests/parlay-gen-ui.test.ts` | 2 | 5 | 0 | - | 2 |
| `tests/picks-surface.test.ts` | 2 | 5 | 0 | - | 2 |
| `tests/cfb-card-ui.test.ts` | 2 | 0 | 0 | - | 2 |
| `tests/first-sunday-six-ui.test.tsx` | 2 | 0 | 0 | - | 2 |
| `tests/cz-sync.test.ts` | 1 | 47 | 0 | - | 1 |
| `tests/autopsy-floors.test.ts` | 1 | 31 | 0 | - | 1 |
| `tests/books-ind-gate.test.ts` | 1 | 10 | 0 | - | 1 |
| `tests/cfb-h1.test.ts` | 0 | 10 | 0 | BetMGM 1 | 1 |
| `tests/prop-lean.test.ts` | 1 | 10 | 0 | - | 1 |
| `tests/basis-surfaces.test.ts` | 1 | 8 | 0 | - | 1 |
| `tests/cfb-store-convergence.test.ts` | 1 | 6 | 0 | - | 1 |
| `tests/legacy-harness/unit40grade.js` | 1 | 6 | 0 | - | 1 |
| `tests/m25-archive.test.ts` | 1 | 6 | 0 | - | 1 |
| `tests/discovery-release.test.ts` | 0 | 5 | 0 | BetMGM 1 | 1 |
| `tests/football-ladders.test.ts` | 1 | 5 | 0 | - | 1 |
| `tests/cfb-store.test.ts` | 1 | 4 | 0 | - | 1 |
| `tests/nfl-store.test.ts` | 1 | 4 | 0 | - | 1 |
| `tests/paper-deficit.test.ts` | 1 | 4 | 0 | - | 1 |
| `tests/helpers/fixture-env.ts` | 1 | 3 | 0 | - | 1 |
| `tests/board-overview-toggle.test.ts` | 1 | 2 | 0 | - | 1 |
| `tests/doubleheader.test.ts` | 1 | 2 | 0 | - | 1 |
| `tests/fun-hr.test.ts` | 1 | 2 | 0 | - | 1 |
| `tests/grade.test.ts` | 1 | 2 | 0 | - | 1 |
| `tests/legacy-harness/int40lock.js` | 1 | 1 | 0 | - | 1 |
| `tests/sweep-covers-engine.test.ts` | 1 | 1 | 0 | - | 1 |
| `tests/calibration.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/engine-v2-integration.test.ts` | 0 | 0 | 0 | Pinnacle 1 | 1 |
| `tests/fixtures/nfl/espn-scoreboard-2026-08-22-final.json` | 0 | 0 | 0 | Hard Rock 1 | 1 |
| `tests/fixtures/nfl/espn-scoreboard-2026-09-10.json` | 0 | 0 | 0 | ESPN Bet 1 | 1 |
| `tests/fixtures/nfl/espn-scoreboard-2026-09-13.json` | 0 | 0 | 0 | ESPN Bet 1 | 1 |
| `tests/hrr-suspension-coupling.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/legacy-harness/README.md` | 1 | 0 | 0 | - | 1 |
| `tests/legacy-harness/baseline40_env.js` | 1 | 0 | 0 | - | 1 |
| `tests/odds-hardening.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/scheduler-route.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/sha-references.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/shadow-prices.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/ui-overlay.test.ts` | 1 | 0 | 0 | - | 1 |
| `tests/ledger-merge.test.ts` | 0 | 58 | 0 | - | 0 |
| `tests/board-teamless-row.test.ts` | 0 | 55 | 0 | - | 0 |
| `tests/cfb-grade.test.ts` | 0 | 31 | 0 | - | 0 |
| `tests/clv-report.test.ts` | 0 | 17 | 0 | - | 0 |
| `tests/a1-shrink.test.ts` | 0 | 13 | 0 | - | 0 |
| `tests/shrink.test.ts` | 0 | 13 | 0 | - | 0 |
| `tests/found-football.test.ts` | 0 | 12 | 0 | - | 0 |
| `tests/self-reading.test.ts` | 0 | 12 | 0 | - | 0 |
| `tests/bet-alerts.test.ts` | 0 | 10 | 0 | - | 0 |
| `tests/lock-card.test.ts` | 0 | 10 | 0 | - | 0 |
| `tests/found-winnings.test.ts` | 0 | 9 | 0 | - | 0 |
| `tests/legacy-harness/int40ledger.js` | 0 | 9 | 0 | - | 0 |
| `tests/parity.test.ts` | 0 | 8 | 0 | - | 0 |
| `tests/variety-core.test.ts` | 0 | 8 | 0 | - | 0 |
| `tests/paper-card-view.test.ts` | 0 | 6 | 0 | - | 0 |
| `tests/a1-shade.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/blend-sweep.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/gen-hold-drag.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/ledger-segments.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/legacy-harness/unit40.js` | 0 | 5 | 0 | - | 0 |
| `tests/lid-coupling.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/live-board-reason.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/sgp-joint.test.ts` | 0 | 5 | 0 | - | 0 |
| `tests/ticket-math.test.ts` | 0 | 4 | 0 | - | 0 |
| `tests/board-category-sync.test.tsx` | 0 | 3 | 0 | - | 0 |
| `tests/board-hit-teamless.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/board-refresh-full.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/gen-moved-note.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/my-parlay.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/outs-suspension-coupling.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/prediction-idempotency.test.ts` | 0 | 3 | 0 | - | 0 |
| `tests/cfb-player-mark.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/defense-imagery.test.tsx` | 0 | 2 | 0 | - | 0 |
| `tests/engine-echo.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/finite-prices.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/live-production-proof.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/mirrored-constants.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/mlb-live-rules.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/nfl-sunday-paper.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/nfl-variety-paper.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/parlay-gen-team.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/pick-positions.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/predictions.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/props-team-filter.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/props-ui.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/straight-only.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/under-bias.test.ts` | 0 | 2 | 0 | - | 0 |
| `tests/board-compact.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/board-sort.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/builder-speed-reveal.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/desktop-density.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/first-sunday-six.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/fixtures/baseline-armed-v1.json` | 0 | 1 | 0 | - | 0 |
| `tests/fixtures/baseline-armed-v2-singles.json` | 0 | 1 | 0 | - | 0 |
| `tests/found-mode.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/guard-wiring.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/hr-line-rule.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/ledger-ticket-tap.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/leg-settled.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/lock-price-age.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/mlb-live-tick.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/mobile-density.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/nfl-money-ui.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/parlay-exclusions.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/parlay-gen-mix.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/parlay-gen-multi.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/parlay-gen-reorder.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/parlay-gen-setup.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/singles-vintage.test.ts` | 0 | 1 | 0 | - | 0 |
| `tests/ticketstack-markets.test.tsx` | 0 | 1 | 0 | - | 0 |

### 6.5 Calculation paths that must change

Reproduced from the sweep. "P1" to "P19" refer to the numbered calculation paths in section 3 of the sweep (Appendix C), where each path is described with its lines.

Must change (a price the owner cannot bet is shown as, or substituted for, a bettable price):
1. P3 best-price layer in the MLB engine: `odds`/`book`/`ev`/`kellyF`/`edgeBadge`/`conviction`/TOP-50 sort at the best all-book price (legacy/index.html:1298-1301, :1320-1323, :1415-1417, :2526-2527, :2559, :2570-2571), the Games-tab grade at best price (src/lib/games.ts:190-196), and the prediction log's best-price `ev`/`odds`/`book` (src/lib/pred-serialize.ts:251-253). Should be best of DK/FD.
2. P10 the manual slip / Props fallback to "the feed's best" price (src/components/props/props-model.ts:276-284; src/lib/ticket-math.ts:18).
3. P9 and P14 the display-book list and repricing at Caesars, BetMGM, BetRivers, Fanatics, Pinnacle (src/lib/sportsbook/books.ts:1-9; src/lib/sportsbook/mlb.ts:82-124; src/lib/sportsbook/football.ts:11-48) and the football "best" price mode (src/lib/football/gen-pool.ts:39; src/lib/prop-lean.ts:86-99).
4. FanDuel can never be the settlement price. Selection uses the better of DK/FD (`bs*`), but grading, EV, Kelly and the ledger are DraftKings only (src/lib/sportsbook/books.ts:12; football `playable = !!cz`, src/lib/cfb/props.ts:316, src/lib/cfb/model.ts `sideRow`). A leg where FanDuel is the better (or only) Arizona price is still priced, gated and recorded at DraftKings, or dropped when DraftKings does not post it. Football has no DK/FD basis at all.
5. The one-sided anchor and the best-price de-vig fallbacks (legacy/index.html:2165, :2207, :2451, :2483-2491, :2605) when they use a non-DK/FD price.
6. Caesars defaults for unstamped data and the hard-coded Caesars paths in section 6 (src/lib/server/clv-core.ts:44; src/lib/sportsbook/mlb.ts:77; src/lib/sportsbook/football.ts:10; src/lib/sportsbook/useLivePrices.ts:7; src/engine2/allstar.ts:148-151, :485; tools/snapshot_props.py:27).

Must be re-decided (other books feed the probability, not the price; keeping them as a reference is defensible, but today it is implicit and the gates were tuned for a many-book world):
7. P1 MLB game-line consensus and its sharp weights (legacy/index.html:1297, :1319, :1340, :1557; blend at :2184-2185, :2214).
8. P2 MLB prop consensus (legacy/index.html:1414, :1431-1435, :2451, :2459-2464, :2493).
9. P4 `booksInd` / `no_ind_consensus` / consensus gate (legacy/index.html:1296, :1318, :3063-3079) and P5 `consEvT`/`consCzEvT` (:2757-2758).
10. P6 sim totals 0.30/0.70 blend (legacy/index.html:2876-2877).
11. P7 the 0.5 market shrink toward the all-book `imp` (src/lib/shrink.ts:13-14; src/lib/server/lock-card.ts:312, :1115) that sits directly in front of the bet gate and stakes.
12. P8 the calibration loop on `pMkt` (src/lib/pred-serialize.ts:248; src/engine2/calibration.ts:167-169, :342; app/api/generate/route.ts:423).
13. P11 MLB live modal line / `minBooks` / `fO` (src/lib/server/mlb-live-quote.ts:248-257, :282, :700-735).
14. P12 football game-line consensus with Pinnacle x2 (src/lib/cfb/model.ts:328, :415-419) and P13 football prop fair = all-US-book median with `minBooks: 2` and the 1.08 yes-only constant (src/lib/cfb/props.ts:65, :204-215, :267-268). With only DK + FD as inputs, `minBooks: 2` would require both to post the exact line.
15. P15 CLV `consensusFair` (src/lib/server/clv-core.ts:199, :243), P16 sharp desk, P17 UFC (src/lib/ufc.ts:148; app/api/ufcprops/route.ts:18, :68-75).
16. P19 the archive tools, if pl-history is to be used to validate a DK/FD world.

### 6.6 Where DraftKings and FanDuel are used today

DraftKings (520 lines / 112 files):
- The settlement book everywhere: `SETTLE_BOOK`, `SETTLE_BOOK_SHORT`, `DEFAULT_BOOK` (src/lib/sportsbook/books.ts:12-14); engine rebind (src/engine/index.ts:296-300); football `settleBook` (src/lib/cfb/rules.ts:77, :476; src/lib/nfl/rules.ts:68, :197); MLB live `settleBook` (src/lib/mlb/live-props-rules.ts:150). Every `cz*` number is the DraftKings quote.
- Stamped on every locked ticket as `settlementBook` (src/lib/server/lock-card.ts:707-709, :731, :1096, :1223).
- One half of the DK/FD selection basis in the MLB engine (legacy/index.html:1306, :1328, :1372, :1394, :1423-1426, :1560-1568), in CLV (src/lib/server/clv-core.ts:21, :25-30) and in MLB live (src/lib/server/mlb-live-quote.ts:120, :162-167).
- Named reference quote on football rows: `dk: find("draftkings")` (src/lib/cfb/model.ts:397; src/lib/cfb/props.ts:346). The paper card and found mode price explicitly at `"draftkings"` (src/lib/cfb/card.ts:249; src/lib/cfb/found.ts:90).
- Default book argument on the sharp desk and UFC (src/engine2/sharpBoard.ts:74, :102, :134; src/lib/ufc.ts:129).
- A member of every consensus median, like any other book.
- Because `CAESARS_KEY` is now `draftkings`, the engine's alternate-ladder capture sends DraftKings ladders to the settlement slot (`altCz`, legacy/index.html:1381-1398), so the "basis" ladder fallback is in practice FanDuel-only.
- UI and copy: about 59 UI lines (labels, tooltips, "EV at DraftKings", "DraftKings void rules", app/ledger/page.tsx:545) and the handoff generator (tools/sync-handoff.sh:256-263, :639).

FanDuel (153 lines / 55 files):
- Only ever the second half of the DK/FD basis: `bs`, `bsOdds`, `bsBook`, `bsEv`, `bsKellyF`, `bsBadge` in the MLB engine (legacy/index.html:1306, :1328, :1372, :1394, :1423, :1427-1428), `basisOf` in CLV (src/lib/server/clv-core.ts:22, :25-30) and MLB live (src/lib/server/mlb-live-quote.ts:121, :162-167), the sharp board's DK/FD basis (src/engine2/sharpBoard.ts:67, :91, :124). The basis picks the bet under `dk_fd` (production cron mode, `CRON_SEL_MODE = "dk_fd"`, app/api/generate/route.ts:52) and sizes Kelly at the basis price; the bet is still graded and recorded at DraftKings.
- Named reference quote on football rows: `fd: find("fanduel")` (src/lib/cfb/model.ts:397; src/lib/cfb/props.ts:347). Football has no DK/FD basis; FanDuel never selects, gates or prices a football bet.
- A selectable display book (src/lib/sportsbook/books.ts:4) and a display label (src/components/cfb/CfbGameCard.tsx:38; src/components/cfb/CfbProps.tsx:111; src/components/props/props-model.ts:69; src/lib/prop-lean.ts:73).
- A member of every consensus median and of the `booksInd` count.
- In `REAL_BOOKS` on the UFC props scraper (app/api/ufcprops/route.ts:18).
- Never a settlement book, never stamped on a ticket, never the price a grade/EV/stake is computed at. No config key, rule or gate names FanDuel.

### 6.7 Are FanDuel prices fetched at all today?

Yes, but only incidentally. No request filters by book, so FanDuel arrives inside every `regions=us` and `regions=us,eu` response whenever FanDuel posts the market, and the parsers read it (the `bk.key==="fanduel"` branches cited in section 4). Nothing requests FanDuel specifically, and nothing fails or warns when FanDuel is absent.

How often it actually posts (measured read-only on the stored archive with /private/tmp/claude-501/audit-out/hist-books.py; these archives are MLB player props):
- pl-history/data/props/2026-10-28.json: 570 rows; two-sided pairs by book: betmgm 289, betonlineag 267, draftkings 218, bovada 184, williamhill_us 170, mybookieag 109, fanatics 25, fanduel 19.
- pl-history/data/props/2026-09-20.json: 1,411 rows; betmgm 789, draftkings 627, betonlineag 568, williamhill_us 353, bovada 285, mybookieag 225, fanatics 72, fanduel 50.

So on those two days FanDuel posted a two-sided MLB prop pair on about 3 % of rows and DraftKings on about 38-44 %. Whether FanDuel posts one-sided prices (for example anytime-TD "yes") more often could not be determined from these archive fields, which record two-sided pairs. This sweep did not check whether pl-history holds football prop archives.

### 6.8 Stale Caesars / Nevada wording and defaults

Code defaults that still resolve to Caesars:
- `export const CAESARS_KEY = "williamhill_us"` as the settlement book for unstamped ledger legs (src/lib/server/clv-core.ts:44; comment :72).
- Fallbacks `?? 'williamhill_us'` for unstamped boards/rows (src/lib/sportsbook/mlb.ts:77; src/lib/sportsbook/football.ts:10; src/lib/sportsbook/useLivePrices.ts:7).
- `bookKey()` maps `cz`, `czr`, `caesars` to `williamhill_us` (src/lib/sportsbook/books.ts:18) while every `cz` field now means DraftKings.
- Label fallback `"CZ"` (src/components/props/props-model.ts:279; src/lib/prop-lean.ts:74) and `book="caesars"` on the design page's DraftKings column (app/design/page.tsx:56).
- Hard-coded Caesars: All-Star desk (src/engine2/allstar.ts:148-151, :485), `tools/snapshot_props.py:27`.
- Selection-mode name `caesars_ev` still in use (src/lib/engine-client.ts:50, :58; src/lib/board-order.ts:48; src/lib/paper-mode.ts:159, :198; src/components/stats/ClvPanel.tsx:33).
- Nevada bookmark list `DEFAULT_BOOKS` (Circa Sports, BetMGM NV, Caesars NV, STN Sports, Westgate SuperBook) at legacy/index.html:529.
- Config field names `czMissingRevalidateSec` / `czMissingWindowSec` and the whole "Caesars-missing" re-check rule (src/lib/cfb/rules.ts:471-476; src/lib/nfl/rules.ts:193-197; src/lib/cfb/props-store.ts:197-218; src/lib/server/football-props.ts:58-80, :233-300) now key on DraftKings.
- The "offered at Caesars right now?" per-pick toggle and its synced store (src/lib/cz-offered.ts:10; src/lib/cz-hidden-merge.ts:1-5; app/api/prefs/route.ts).

Comments that still say Caesars where the code means the settlement book (examples, all in the hit list): src/engine/index.ts:135, :141; src/lib/cfb/model.ts:34-38; src/lib/cfb/props.ts (header and :363-428); src/lib/ufc.ts:5-6, :28, :40, :178; src/engine2/sharpBoard.ts:4; src/engine2/grade.ts:3; app/api/calibrate/route.ts:35; src/lib/ticket-math.ts:18, :24; src/lib/ticket-payout.ts:11; src/lib/fun-hr.ts; src/lib/cfb/lock-server.ts:26, :75, :235, :338, :876; src/lib/nfl/rules.ts:22; src/lib/mlb/live-client.ts:109; src/lib/server/odds-shape.ts:31.

House rules: the grader is described as using "Caesars void rules" (src/engine2/grade.ts:3; app/api/calibrate/route.ts:35) while the Ledger page says "DraftKings void rules" (app/ledger/page.tsx:545). Whether the coded void logic matches DraftKings and FanDuel house rules was not determined by this sweep.

---

## 7. Refuted findings

Three findings were raised by an area auditor and refuted by the independent reviewer. They are listed so they
are not raised again. Each left a small residue that is real; the residue is stated. The reviewer's full note for
each is at the end of Appendix A.

| ID | Claim as raised | Why it was refuted | What remains true (low) |
|---|---|---|---|
| B2-8 | A fixed sigma does not fit blowout spreads, so the football model misprices large favourites and underdogs. | The numbers reproduce, but the cause is the proportional moneyline de-vig, not sigma. Neither DraftKings nor FanDuel posts a moneyline on the four 34+ point games, and the sigma that reconciles the market is 14.63-17.45, around the configured value. Scripts: `audit-out/verify-b2-8/ml.py`, `v.ts`. | Proportional de-vig inflates longshot moneylines (EV at DraftKings +7.86 to +20.88 on ECU, ORST, CCU, OHIO). Today only the 2.6 price cap blocks them, so the cap must not be lifted before the de-vig is fixed. Sigma has never been backtested. |
| C2-3 | The Parlay Generator fills legs with prices from books the owner cannot bet. | Rows are repriced to the selected book before the pool is built (`src/lib/sportsbook/mlb.ts:91-97`; `src/lib/mlb/useBrowseProps.ts:15`; football is hard-coded to "cz" at `src/components/cfb/CfbProps.tsx:809`). With DraftKings selected, 39,704 raw sides became 32,346 legs, all DraftKings (7,358 dropped); with FanDuel, 13,245 legs, all FanDuel. | A latent `sidePrice` fallback to the feed's best price exists; the selector still lists books the owner cannot bet; 18.5% of sides are dropped with no FanDuel fallback. |
| E3-15 | There is no "Run picks now" control. | The Refresh buttons already run the found / lock pass: `POST /api/refill?desk=mlb` -> `/api/generate?topup=1&slot=manual`; football `/api/cfb/lock?manual=1`. | UX only: the label does not say it locks bets; without the sync phrase the tap is browser-only; no next-pass time is shown. |

---

## 8. Not covered / could not verify

This was a read-only audit of files on disk. The limits below are real and some of them are large.

### 8.1 Limits imposed by the rules of this phase

- **No network.** Nothing was fetched from production, the Odds API, ESPN, MLB, Upstash or cron-job.org. Every
  statement about production behaviour is a reading of the code, not an observation.
- **No env files.** No `.env*` file was opened, including `tools/handoff-state.env`. Whether `CRON_SECRET`,
  `LEDGER_SYNC_KEY`, `APP_PASSCODE`, `ODDS_API_KEY` or `PL_CFSEL` are set in production is unknown (names only).
- **No test run.** The full suite was not run. "A test exists" in this document means the file exists, not that
  it passes. Small read-only scripts were run; they are under `audit-out/`.
- **No code change.** Nothing in the checkout or the history branch was modified. Every proposed fix is
  unimplemented and untested.
- **iCloud conflict copies** (16 tracked files whose names end in " 2" to " 5" before the extension) exist and
  were not analysed.
- **Untracked files that appeared while this report was being written.** The audit describes the tracked files
  at HEAD `8ab9e46`. When the report was assembled (2026-11-12, about 01:13 local time), read-only `git status`
  showed untracked paths in the checkout that this audit did not create and did not read: `src/lib/az/`
  (`books.ts`, `market.ts`, `odds-url.ts`), `src/lib/anytime/` (`engine.ts`, `kv.ts`, `rules.ts`, `types.ts`),
  `src/lib/server/odds-client.ts`, `tests/az-two-book-core.test.ts`, and a `node_modules` symlink. Their
  modification times are between 01:01 and 01:13 that morning, so another process was writing to the checkout
  at the same time. Nothing in this document describes, verifies or relies on them. The only file this audit
  wrote inside the checkout is `AUDIT.md`.

### 8.2 The live record was not readable

- The live MLB, CFB and NFL ledgers (`pl:ledger:v1`, `pl:cfb:ledger:v1`, `pl:nfl:ledger:v1`), the graded
  prediction store (`pl:pred:<date>`), the calibration state (`pl:cal:summary`, `pl:cal:weights`, `pl:cal:auto`)
  and all stored CLV sightings are in Upstash. None is on disk.
- Consequences: no profit, ROI, win rate or CLV after 2026-07-22 could be computed; no football result of any
  kind; no real stored ticket could be read, so stored-record shapes come from the code that writes them; the
  current calibration multipliers are unknown; whether any CFB ticket ever carried a prop leg, or any parlay was
  written after 2026-10-06, is unknown.
- The owner exports listed in section 1.6 close most of this gap.

### 8.3 Outside systems that could not be seen

- The cron-job.org account: whether the 15-minute ticker, the CLV job, the weekly calibrate job and any
  `/api/propsnap` job exist, and at what cadence. Cited from repo docs and comments only.
- The Odds API plan: real quota, plan and per-call cost. The last logged figure on disk is from 2026-08-06; docs
  disagree (20,000 vs 100,000 credits a month).
- Whether production `/api/odds` returns 403 for the UFC, All-Star and CLV-alternate request shapes.
- Whether the legacy GitHub Pages / Netlify sites are still live.
- How old the cached football odds actually are when a lock pass reads them in production (the code allows 240
  seconds plus revalidation; not measured).
- Whether the sharp-weighted books (Pinnacle, Betfair, Matchbook) actually appear in the `regions=us` prop pull.
- iOS installed-app self-update behaviour at runtime.

### 8.4 Code read only in part

- `src/engine2/allstar.ts` and `src/lib/cfsel.ts` (partly read); the exact effect of the `PL_CFSEL` switch on the
  pool was not traced.
- `src/lib/server/mlb-live-quote.ts:680-750` and most of `docs/credit-budget.md` (skimmed).
- `src/lib/ledger-merge.ts:856-1406` (`unionCore` / `unionFun`, partly read).
- The legacy engine's `shAllocate` after `legacy/index.html:3175`; the `czOnly` UI switch; the default mode of
  `quoteOf` (`src/components/cfb/CfbProps.tsx:928`); output of `tools/icc.py`.
- `app/games`, `app/stats`, `app/simulator`, `app/calc`, `app/ballpark` (skimmed only).
- Every use of `seasonEnd` and the other `SH_CFG` freezes inside the one-line engine blob
  (`src/engine/legacy-src.gen.ts` line 5) could not be enumerated.
- The TTL of `pl:pred:<date>` was not determined.

### 8.5 Data gaps in the history branch

- Football: nothing. No prices, no closes, no graded picks. Whether the football sigma, home-field and blend
  weights were ever fitted to anything could not be determined; no fit was found.
- Game-line snapshots stop on 2026-07-30 and board archiving stops after 2026-10-17. Why was not determined.
- Boards are missing for 2026-07-27..08-05, 09-28, 10-02 and 10-09; props for 2026-07-13, 07-15, 08-06, 10-21,
  10-22 and 10-25.
- Which board generation any locked card was built from is not recorded.
- Why the stored DK/FD basis price disagrees with the stored book quotes on 26% of rows (caveat 5 in section 1.5)
  was not determined.
- Whether FanDuel posts one-sided prices (for example anytime-TD "yes") more often than two-sided pairs could
  not be determined from the archive fields.
- Whether the coded void rules match DraftKings and FanDuel house rules was not determined.

### 8.6 Findings that were not independently re-verified

Of the 140 kept findings, 103 were re-opened and confirmed by a second reviewer. The other 37 were not:

- 21 low-severity findings (marked "not-verified (low)") rest on the area auditor's evidence alone.
- 16 findings in the "prior audit regression" area (P-1 to P-16, including five rated high) come from the
  regression table in section 5 and were not put through the reviewer. Their file and line evidence was opened
  by the regression auditor, but the severity has not been challenged the way B1-1, B2-1, B3-1, D-1 and E1-1
  were (all five of those were downgraded from critical to high on review).

### 8.7 What the documents do not say

- No document records that the owner moved to Arizona, that FanDuel is a settlement or co-settlement book, or
  any two-book decision. The branch name `az-two-book-anytime` has no counterpart in the docs. The last recorded
  book decision is DraftKings as settlement book on 2026-09-17 (`docs/progress.md:264-273`). An older memo says
  the opposite of today's constraint: "DraftKings and FanDuel are not playable from Nevada"
  (`docs/multibook-memo.md:80-87`).
- The collection-period freeze took effect on 2026-07-24 (`docs/collection-period.md:1, 510-516`). No document
  records it ending, and the freeze-exit bundle is still marked DRAFT (`docs/freeze-exit-bundle.md:1`), while
  found mode, straight-only and the other October changes shipped.
- The documents disagree with each other in at least 22 places (credit caps, run caps, settlement book, bankroll
  $750 / $2,500 / $10,000, and others). Where code and docs disagree, this audit reports the code.

### 8.8 Nature of the evidence

- Every profit-related conclusion about the model rests on market-vs-market comparisons over a short window
  (board to close, median under two hours) or on samples of 14 to 80 bets. They show that the closing market does
  not confirm the claimed edge. They do not prove the model has no information.
- Paper trading only. Nothing here is betting advice.

---

## 9. Gap closure (second pass, 2026-11-12)

A completeness critic read sections 1 to 8 and listed 17 things the first pass had not covered. Five read-only
passes closed them. Their full reports are in `audit/gaps/` (`g1-inventory.md`, `g2-spend-security-frontend.md`,
`g3-ledger-football-season-time.md`, `g4-prior-limiters-grading.md`, `g5-test-impact.md`). This section is the
summary; where it and section 3, 4 or 5 disagree, this section is the later reading and is the one to use.

Same rules as the first pass: no network, no `.env*` file, no secret value, no code change. These 65 findings
were each read against the code by the pass that raised them. They did **not** go through the second-reviewer
step that the 140 in section 4 did, so treat each as "raised, evidence cited", not "independently confirmed".

### 9.1 Count

| Pass | High | Medium | Low to medium | Low | Total |
|---|---|---|---|---|---|
| G1 inventory (routes, schedulers, store keys, env names, hosts, book names missed) | 3 | 5 | 0 | 8 | 16 |
| G2 spend, security, front end | 1 | 9 | 0 | 14 | 24 |
| G3 ledger archive, football device ledger, Season Lab, Arizona time | 0 | 2 | 0 | 9 | 11 |
| G4 prior audit re-check, missing limiters, grading against book rules | 0 | 5 | 2 | 7 | 14 |
| All raised | 4 | 21 | 2 | 38 | 65 |

Three overlap with something already counted: G1-1 and G2-1 are the same route (`/api/sharp`); G1-4 is the
same mechanism as E2-2 (`/api/odds`); G1-5 is part of P-10. Distinct new findings: 62. With section 4's 140
the audit holds **202 findings: 0 critical, 13 high, 87 medium (the two "low to medium" counted here), 102 low**.
(High 10 + 4 less the one shared route; medium 66 + 21 + 2 less the two overlaps; low 64 + 38. Corrected 2026-11-12: this line first read 86 and 103.)

### 9.2 What is live today, and what is dormant

It is mid-November. MLB is out of season (last archived board 2026-10-17). CFB and NFL are the only desks
making picks. Section 4 ranks by severity alone; this is the same list cut by whether it touches a bet placed
this week. Work in this order.

**Touches football picks now**

- High: B2-1 (the only independent signal is ESPN FPI, unvalidated), P-2 (full Kelly on a constant $10,000, up
  to $800 a bet; the same `foundStake` sizes football, `src/lib/cfb/found.ts:180`).
- Medium: A-2, B2-2, B2-3, B2-4, B2-5, B2-6, B2-7, B2-9, B2-10, B3-12, C1-2, C1-3, C1-7, C1-12 (football
  half), C2-2 (hand-built football parlays), E2-1, E2-3 (football half), E2-9, and from this pass G4-1, G4-2,
  G4-3, G4-4, G4-8, G4-14.

**Sport-independent infrastructure, live every day**

- High: D-1, E1-1, G1-1 / G2-1, G1-2, G1-3.
- Medium: D-3, D-4, D-5, E1-2, E1-5, E2-2, E2-5, E2-6, P-10, P-11, G1-4 to G1-8, G2-6, G2-12, G2-19.
- MLB code that still runs daily off-season and costs something: B3-10, E1-9, P-9, G4-13.

**MLB only, dormant until spring**

- High: B1-1, B3-1, P-1, P-3, P-4, P-5. Of the five "high" prior-audit rows, only P-2 touches a bet placed
  today.
- Medium: A-1, A-3, A-4, B1-2 to B1-7, B1-9 to B1-11, B3-2 to B3-7, B3-11, B3-13, C1-1, C1-4, C2-1, D-2,
  E1-3, E1-4, E2-7, E3-1 to E3-4, P-6, P-7, P-8, P-12, G2-4, G2-5, G4-5 to G4-7, G4-9 to G4-12.

**Dead weight**: UFC and All-Star. Both feature flags are false (`src/lib/features.ts:8, :13`). The one
reachable piece is `app/api/ufcprops/route.ts` (no auth, scrapes another site, spends no Odds credits, nothing
calls it).

### 9.3 Prior-audit rows P-1 to P-16, re-verified

Each was re-opened with the aim of refuting it. Corrections to section 5 and to the P rows in section 4:

| ID | Verdict | Corrected severity | Live today |
|---|---|---|---|
| P-1 | Confirmed. The only thing keeping pitcher outs off the money card is `OUTS_OFF_SINCE` (`src/lib/found-mode.ts:146-151`) | medium while that guard holds, high if lifted | No |
| P-2 | Confirmed | high | **Yes, football** |
| P-3 | Confirmed (`src/lib/server/lock-card.ts:177` `booksInd: 0`; found filter tests only `ev > 0`, `:1149`) | high for MLB | No |
| P-4 | **Title wrong.** `data/pen_quality.json` is tracked (one commit, 2026-07-20) but no job re-commits it; inputs frozen 2026-07-29 with no staleness check | medium now, high before opening day | No |
| P-5 | Confirmed | medium | No |
| P-6 | Confirmed: 1.06 overround hard-coded against 1.161 measured. Home runs are barred from the found card | medium | No |
| P-7 | Confirmed | medium | No |
| P-8 | Partly: M6 confirmed; M7 and M9 refuted as specified; M4 conditional | low to medium | No |
| P-9 | Confirmed: `tools/snapshot_props.py:27` still keys Caesars; six props-history crons fire daily off-season | medium | Cost only |
| P-10 | Partly: the passcode is write-only. `/api/odds` falls back to cache rather than opening; `/api/sharp` and `/api/calibrate` are covered by G1-1 and G1-5 | low to medium | Yes |
| P-11 | Cannot be verified from the repo: the weekly refit exists only as a row in the owner's cron-job.org account | low to medium | Yes |
| P-12 | Confirmed | low to medium | No |
| P-13 | Confirmed | low | Yes (UI) |
| P-14 | Confirmed | low | No |
| P-15 | Confirmed | low | No |
| P-16 | Confirmed: no A3 decision record dated 2026-09-22 exists in `docs/` | low | docs |

### 9.4 New findings, one line each

Evidence is `path:line`. Full text, impact and proposed fix for each is in the named file under `audit/gaps/`.

**G1 (`g1-inventory.md`)**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| G1-1 | high | `/api/sharp` is an open paid-model proxy when `APP_PASSCODE` is unset; the app itself never sends the passcode header, so setting it locks the owner out | `app/api/sharp/route.ts:69-71`; `app/sharp/page.tsx:727` |
| G1-2 | high | `/api/cfb/props` and `/api/nfl/props` spend Odds credits for anyone, no cap (about 31 credits an event, up to 60 CFB or 16 NFL events a call) | `app/api/cfb/props/route.ts:25`; `app/api/nfl/props/route.ts:34`; `src/lib/server/football-props.ts:179, :364` |
| G1-3 | high | Other books' prices still reach calculations, stored fields and labels beyond what section 6 lists | `app/api/propsnap/route.ts:51`; `app/api/clv/route.ts:90, :108`; `src/lib/server/clv-core.ts:44`; `src/engine2/devig.ts:65-70`; `src/lib/ticket-payout.ts:10, :33`; `src/lib/ledger-segments.ts:70-72, :208` |
| G1-4 | medium | `/api/odds?fresh=1` is an uncached paid pull for anyone while `APP_PASSCODE` is unset; the props-history job depends on that | `app/api/odds/route.ts:47-49`; `tools/snapshot_props.py:30` |
| G1-5 | medium | `/api/calibrate` is open when `CRON_SECRET` is unset, plain string compare | `app/api/calibrate/route.ts:76-84` |
| G1-6 | medium | `/api/clv` takes the cron secret in the query string | `app/api/clv/route.ts:60`; `docs/cron-jobs.md:24` |
| G1-7 | medium | The MLB ledger writer has no size check; every other writer refuses above 900,000 bytes | `src/lib/server/lock-card.ts:1301-1323` against `src/lib/ledger-merge.ts:110-111` |
| G1-8 | medium | The job that drives everything (one cron-job.org row) is neither visible from the repo nor monitored | `docs/cron-jobs.md:7-30` |
| G1-9 | low | `vercel.json` has four crons; its own test allows two | `tests/vercel-cron-pokes.test.ts:61, :69-70` |
| G1-10 | low | Store keys with no expiry that grow without bound, up to 3 MB a prediction day | `src/lib/server/blocks.ts:36`; `app/api/generate/route.ts:763-764` |
| G1-11 | low | Anonymous callers create store keys | `src/lib/cfb/slate-server.ts:160` |
| G1-12 | low | Legacy page: third-party CORS relays and API keys in browser storage | `legacy/index.html:680-681, :893-896, :1063-1064, :2960` |
| G1-13 | low | Sync phrase kept in plain browser storage; the passcode is stored and never used | `src/lib/ledgerSync.ts:19`; `app/settings/page.tsx:361` |
| G1-14 | low | Public scrape and proxy routes with no gate | `app/api/ufcprops/route.ts:35-38`; `app/api/splits/route.ts:17-26`; `app/api/stats/route.ts:9` |
| G1-15 | low | The handoff generator describes a DraftKings-only system; FanDuel is never mentioned | `tools/sync-handoff.sh:256-263, :639` |
| G1-16 | low | 16 cloud-sync conflict copies are tracked in git. Do not delete them without the owner | e.g. `tools/build_ufc 3.py` |

Book names the first sweep missed (section 6 addendum): matchbook, 24 lines in 8 files, 5 code sites; ballybet,
2 label-map lines; BetWay, `app/api/ufcprops/route.ts:18`; "Nevada", 5 real lines; "NV", 84 lines in 28 files
(UI, ledger maths, legacy). Eleven more book keys appear only in test fixtures. No tracked file names Arizona.

**G2 (`g2-spend-security-frontend.md`)**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| G2-1 | high | Same route as G1-1: unbounded input, 16,000 output tokens, no working in-app caller | `app/api/sharp/route.ts:69-80, :93-108` |
| G2-2 | low | Error order reveals which secrets are configured; plain compare | `app/api/sharp/route.ts:62-80`; `app/api/odds/route.ts:49` |
| G2-3 | low | Legacy page calls the model API and relays Odds URLs from the browser | `legacy/index.html:2957-2975, :893-896` |
| G2-4 | medium | The phone's un-slotted MLB live read is a paid pass with no slot stamp or ceiling | `src/lib/mlb/live-client.ts:341-343, :362-378`; `src/lib/server/mlb-live-quote.ts:524, :660` |
| G2-5 | medium | Manual Refresh buys up to 12 events and wipes the priced-at and empty-at stamps | `src/lib/server/mlb-live-quote.ts:583, :660-661` |
| G2-6 | medium | Every credit rail on the live-props route fails open on a store error | `src/lib/server/mlb-live-quote.ts:496, :524-528, :603, :768` |
| G2-7 | low | Stale doc comments on the live-props route | `app/api/mlb/live-props/route.ts:26, :44` |
| G2-8 | low | Sequential upstream reads with no timeout inside a 60-second function | `src/lib/server/mlb-live-state.ts:188-195, :235-263` |
| G2-9 | medium | The splits chip can show the opponent's bet and money percentages on a swapped-pair match | `src/lib/splits.ts:177, :189-196` |
| G2-10 | medium | The splits scrape is a positional pattern that fails silently; 50-minute-old numbers are stamped with the response time | `src/lib/splits.ts:76-108`; `app/api/splits/route.ts:25-40` |
| G2-11 | low | Doubleheader and no-kickoff lookups take the first card | `src/lib/splits.ts:154-162, :180, :201-222` |
| G2-12 | medium | A bet alert is lost when the store errors mid-pass | `src/lib/server/push.ts:169, :183, :187, :193-196, :213` |
| G2-13 | low | Alert record written after the send; partial delivery marked sent | `src/lib/server/push.ts:76-87, :95, :122-125, :177` |
| G2-14 | medium | Anonymous callers can trigger large fan-outs to the free stats API | `app/api/mlb/hit-rates/route.ts:21, :59-73`; `app/api/stats/window/route.ts:56-68`; `app/api/pvt/route.ts:27-55` |
| G2-15 | low | Season year 2026 hard-coded in four places | `src/lib/mlb/player-index.ts:10`; `app/api/pvt/route.ts:15`; `app/api/player/route.ts:15` |
| G2-16 | low | One failed chunk of 40 ids fails the whole board's hit rates | `app/api/mlb/hit-rates/route.ts:66, :105-107` |
| G2-17 | low | One failed schedule read blanks the live numbers | `src/lib/liveNow.ts:72-79, :133-137, :179-183` |
| G2-18 | low | UTC date fallback; "Delayed Start" reads as live; postponed games poll forever | `src/lib/liveNow.ts:114, :145-146, :181` |
| G2-19 | medium | No security headers, no middleware, sync phrase in browser storage | `next.config.ts:15-22`; `src/lib/ledgerSync.ts:50-52` |
| G2-20 | low | The 299 KB engine source runs through `new Function` and `eval` | `src/engine/index.ts:276-289`; `src/lib/engine-client.ts:109-111` |
| G2-21 | low | A 5.34 MB video is shipped and referenced nowhere | `next.config.ts:16-21`; `src/components/shell/VideoBackdrop.tsx:5` |
| G2-22 | low | Parlay Calc leg ids restart after reload; "0.9" parses as 90% but "1.5" as 1.5% | `app/calc/page.tsx:59-60, :179`; `src/lib/calc-math.ts:145-146` |
| G2-23 | low | The Calc EV tile multiplies leg confidences as independent | `src/lib/calc-math.ts:70-74` |
| G2-24 | low | Ballpark copy disagrees with the weather it shows | `app/ballpark/page.tsx:249`; `app/api/mlb/ballpark/route.ts:33, :63` |

Checked and clean: the calculator's arithmetic; the three auth helpers (`src/lib/server/store.ts:78-123`,
hashed, constant-time, fail closed); the push routes; the service worker (never caches `/api/`).

**G3 (`g3-ledger-football-season-time.md`)**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| G3-A1 | medium | The pre-paper (epoch 1) ledger archive is written once, never read by any route, never verified, and the write's reply is ignored. A reset can happen with no archive at all | `src/lib/server/ledger-epoch-server.ts:25-27`; `src/lib/ledgerSync.ts:87`; `tests/paper-epoch.test.ts:101` |
| G3-A2 | low | A device whose archive copy fails keeps the old season and pushes it under the new epoch (derived from the code, not observed) | `src/lib/ledgerSync.ts:83-93, :188-189, :208` |
| G3-B1 | medium | **A free two-book MLB baseline is sitting on disk and was never graded**: 71 archived board-days, about 12,800 priced rows, each with a game id. Grading needs only the free stats API | `pl-history/data/boards/*.best.json.gz` |
| G3-B2 | low | The public cohort record is counts only with a 10-day tail; no price, no book | `src/lib/server/grading-progress.ts:361-381, :414` |
| G3-B3 | low | `/api/digest` is MLB-only and has no caller; its "7-day" block is 7 or 8 days depending on the hour | `app/api/digest/route.ts:17, 23`; `src/lib/ledger-segments.ts:273` |
| G3-C1 | low | Football's first settled verdict is permanent, and the phone can be the one that writes it | `src/lib/football/store.ts:273-276`; `src/lib/ledger-merge.ts:1962` |
| G3-C2 | low | Leg results merge base-wins even when the base is pending and the other side is settled | `src/lib/ledger-merge.ts:1968` |
| G3-C3 | low | The append-only guard restores the whole stored day and silently drops the device's other fields | `src/lib/append-only.ts:68-75` |
| G3-D1 | low | Season Lab is an orphaned live page with a hand-settled, editable, device-only record; reachable only by typing its address | `src/lib/features.ts:26`; `src/lib/cfb/season-store.ts:28, 85-87` |
| G3-E1 | low | Football kickoff times are shown in Pacific with no zone label, next to "updated" stamps in the device's zone: one hour off for Arizona from November to mid-March | `src/lib/cfb/dates.ts:12, 20-24`; `src/components/cfb/CfbProps.tsx:165, 318, 648` against `:1023` |
| G3-E2 | low | The whole schedule moves an hour twice a year for an Arizona owner; the docs describe daylight time only | `src/lib/server/grading-progress.ts:55, 191-192`; `docs/cron-jobs.md:57` |

Arizona does not change its clocks. In winter it is one hour ahead of Pacific, so today the card day rolls at
01:00 Arizona, the grade slots are 09:00 / 10:30 / 13:00 / 16:00 / 17:45, and football found passes run
09:00 to 19:45. Recommendation: keep the day key Pacific (changing it would split the record) and fix the display.

**G4 (`g4-prior-limiters-grading.md`)**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| G4-1 | medium (low on today's straight-only card) | A football parlay with one void leg is voided whole; MLB reprices it | `src/lib/cfb/grade.ts:350` against `legacy/index.html:3647-3650` |
| G4-2 | medium, live | The NFL prop grader cannot tell "did not play" from "played and recorded zero"; both void after 48 hours | `src/lib/football/prop-settlement.ts:12-19`; `src/lib/cfb/grade.ts:128, :336-337` |
| G4-3 | medium | Football markets outside moneyline, spread, total and five props never grade and void at 48 hours | `src/lib/cfb/grade.ts:132`; `src/lib/football/prop-settlement.ts:2` |
| G4-4 | low to medium | Football treats any game in the feed's "post" state as a full final | `src/lib/cfb/model.ts:210-211` |
| G4-5 | low | The MLB run line has no push branch | `legacy/index.html:3598`; `src/engine2/grade.ts:86` |
| G4-6 | low to medium | MLB suspended games are voided at once and never re-read; a game called early is graded as complete | `legacy/index.html:3583-3584, :3705` |
| G4-7 | low | MLB leg results are keyed without the game: a doubleheader collides | `legacy/index.html:3639, :3700-3701`; `src/lib/server/lock-card.ts:1013` |
| G4-8 | medium | One hard-coded settlement ruleset per sport, labelled "Caesars void rules", while the settlement book is DraftKings. No grader is keyed by book | `legacy/index.html:3570`; `src/engine2/grade.ts:3-4`; `src/lib/sportsbook/books.ts:12` |
| G4-9 | low | An MLB ticket tests pending before lost | `legacy/index.html:3640-3643` |
| G4-10 | low | An MLB void leg with no stored leg price is not divided out | `legacy/index.html:3649-3650` |
| G4-11 | low | The MLB grader exists as two hand-kept copies | `src/engine2/grade.ts:2-4`; `src/lib/server/mlb-day-won.ts:15-17` |
| G4-12 | low | `PL_CFSEL` is dead measurement code that doubles the MLB analyze work on every generate | `app/api/generate/route.ts:511, :727-743` |
| G4-13 | low | Off-season jobs still run and commit daily | `.github/workflows/context.yml`; `.github/workflows/props-history.yml` |
| G4-14 | medium, live | Football can only be bet on its own Pacific date, from 08:00 PT. Thursday's game cannot be taken on Tuesday | `app/api/cfb/lock/route.ts:291-292`; `app/api/nfl/lock/route.ts:115-116`; `app/api/scheduler/route.ts:170` |

Grading that was checked and is right: whole-number football spreads and totals push; full-game football
includes overtime and first-half legs use periods 1 and 2 only; a tied NFL moneyline is refunded; an MLB
scratched pitcher or non-starting batter is void. Every comparison with "what the book does" in that report is
general industry convention. Neither book's current house rules were read in this audit.

### 9.5 Corrections to section 3 (limits)

- **Row 76 (`PL_CFSEL`) was wrong.** It is not an operator switch and limits no pick. It stamps a counterfactual
  onto rows tagged suspended; nothing is tagged suspended any more, so it stamps nothing while re-running a full
  analyze on every MLB generate. Verdict: REMOVE (inert). See G4-12. The tally becomes 30 KEEP (integrity),
  12 REMOVE (inert).
- **Limiter 81, slate horizon (missing from the first pass).** Each desk only looks at today's Pacific date.
  Verdict: REMOVE (artificial) for football, KEEP for MLB (its model needs the day's lineups). See G4-14.
- **Limiter 82, universe (missing from the first pass).** CFB reads FBS games only (`src/lib/cfb/rules.ts:609`),
  NFL the regular feed (`src/lib/nfl/rules.ts:298`), MLB the major league only. Verdict: KEEP all three; FBS-only
  is a model-trust limit because the rating is the only independent signal.

With 81 and 82 the list is 82 limiters: 30 KEEP (integrity), 14 KEEP (policy), 12 REMOVE (artificial),
12 REMOVE (inert), 7 SPLIT, 7 N/A.

### 9.6 Additions to section 1.6 (what to export for a real baseline)

Beyond the routes already listed: every page of `GET /api/taken`, `GET /api/picks`, `GET /api/digest`, and the
pre-paper archive key `pl:ledger:archive:e1`, which no route reads (the store console, or a device's browser
storage item `pl_ledger_archive_e1`). The full pre-paper record also needs `pl:bank:v1`, `pl:noplay:v1`, the
`pl:pred:<date>` values and the `pl:cal:*` keys. Separately, and needing no export: grade the 71 archived
boards (G3-B1).

### 9.7 Repo map (Phase 0)

The complete tables are in `audit/gaps/g1-inventory.md`: all 51 route files (methods, auth, what happens when
the secret is unset, maximum duration, outside hosts, store keys, spend); the three schedulers; 44 store-key
patterns with writer, reader and expiry; about 60 browser storage keys; environment variable names; every
outside host. The points that matter:

- Three routes fail **open** when an environment variable is missing: `/api/sharp` and `/api/odds?fresh=1`
  (`APP_PASSCODE`), `/api/calibrate` (`CRON_SECRET`). The scheduler, both football lock routes and refill fail
  closed.
- Six routes can spend money with no credential: `/api/cfb/props`, `/api/nfl/props`, `/api/cfb`, `/api/nfl`,
  `/api/odds` (Odds credits) and `/api/sharp` (model credits) while `APP_PASSCODE` is unset.
- Whether `APP_PASSCODE`, `ANTHROPIC_API_KEY`, `CRON_SECRET` and the push keys are set in production cannot be
  known from disk. The owner has to look.

### 9.8 What the two-book change will break in the existing tests

From `audit/gaps/g5-test-impact.md`. Baseline measured on the untouched branch (`8ab9e46`), full suite:
**4,089 tests, 3,961 pass, 128 fail** in 37 files. Those 128 were red before any change in this branch.

Existing tests that pin behaviour the owner's rule overrides, by group: (1) requests by region rather than by
book, 11 files, of which 4 break on the fetch change alone (`tests/mlb-live-props-route.test.ts:434-440`,
`tests/nfl-props-route.test.ts:252-259`, `tests/cfb-props-route.test.ts:283-284, :1113`,
`tests/odds-hardening.test.ts:159-165`); (2) multi-book consensus fair value, 23 files; (3) price taken at the
settlement book only, 22 files; (4) Caesars fields and the book selector, about 42 files; (5) parlays priced
across books, 11 files; (6) slots, windows and caps, about 41 files. No existing test asserts "all legs at one
book".

Guards that go red when something is **added**: any new or edited workflow file (`workflow-branch-sync`,
`workflow-timing`), any new file under `docs/` (`read-first-index` and four more), any link without `replace`
or any `router.push` (`nav-flat`), a new API route with its own date formatter (`server-date-basis`).

One behaviour change with no source change: fed two books only, the parity-locked MLB engine sees at most one
independent book, and blocks tickets as `no_ind_consensus` when FanDuel lacks the line
(`legacy/index.html:3063`). That needs an owner decision before spring.

### 9.9 The new engine code was not audited by this audit

Sections 1 to 8 were written from HEAD `8ab9e46`, before any code in this branch existed. Nothing in them
describes `src/lib/az/`, `src/lib/anytime/` or `src/lib/server/odds-client.ts`. That code is covered by its own
tests (178 at the time of writing; each of 23 guards was broken on purpose and the tests caught all 23). One
point from D-1 is worth stating: the new ledger cannot repeat it. A pick is written once with a
set-if-absent, an unreadable index falls back to empty state without touching any pick record, and both are
pinned by tests.

## 10. Status on the branch (2026-11-12)

This section is the later reading of every "open" in sections 4 and 9. A finding not named here is still open.
Every commit named is on branch `az-two-book-anytime`; none is pushed, so none is live.

### 10.1 Resolved, with the commit and its test

| Finding | Severity | What changed | Commit | New tests | Guards broken on purpose, caught |
|---|---|---|---|---|---|
| D-1 (MLB) | high | An unreadable stored MLB ledger is refused, never replaced | `7291624` | 63 | 29 of 29 |
| D-1 (football) | high | The same for the stored CFB and NFL ledgers | `647ebdb` | 56 | 65 of 65 |
| E1-1 | high | A store outage in the scheduler tick answers 503 with a reason | `9abd079` | 16 | 35 of 35 |
| G1-1 / G2-1 | high | `/api/sharp` fails closed when neither secret is set | `5c8b495` | 69 (with G1-5) | 62 of 62 |
| G1-2 | high | A football props pull is bought only for a device that holds the sync phrase, or the server's own lock pass | `a6f0e0a` | 30 | 35 of 35 |
| G1-5 | medium | `/api/calibrate` fails closed and compares in constant time | `5c8b495` | (above) | (above) |
| E2-2 / G1-4 | medium | `/api/odds` builds its own upstream request from an allow-list; a fresh pull needs a credential | `adc3d1a` | 122 | 128 of 128 |
| G1-7 | medium | The MLB lock writer refuses a merged ledger above the shared size limit | `b3cbbd0` | 26 | 45 of 45 |
| E3-1 | medium | The Ledger scoreboard counts won and lost tickets | `d928a55` | 21 | 42 of 42 |
| E3-15 | (refuted as a defect, built anyway) | A "Run picks now" control, on the `/anytime` page | `35a6803` | 28 | 37 of 37 |

### 10.2 Resolved in part

| Finding | What is done | What is left |
|---|---|---|
| G1-6 | `/api/clv` accepts the cron secret in the `x-cron-key` header and marks the URL form (`6e6ca73`) | The cron-job.org row still sends the secret in the URL. Moving it is Josh's: he types the secret. |
| G1-3 | Every Odds API request names the two books (`1852f06`); the any-time engine prices and grades at the two books only; older tickets are tagged with their book and legacy ones are not counted (`1a198e7`) | 403 lines in 93 files still name another book, mostly the parity-locked MLB engine, stored field names and tests. A ratchet test stops the count rising. |
| E1-1 (alert half) | The poke answers with a reason, and the any-time engine has a heartbeat | The heartbeat is only checked when something calls the route; a round-the-clock poke row is Josh's to create. |

### 10.3 A fact found while fixing G1-2

The football props daily credit cap is not 2,500 (CFB) or 1,000 (NFL) as sections 2 and 3 describe. Commit
`dfcb1fb` set `dailyBudget` to unlimited on both leagues, before this audit's base. The two-rail split and the
"budget is used up" note are therefore unreachable today, and the only bound on props spend is the per-game
window (2 hours before kickoff, 10 minutes in play). That makes G1-2 worse than first written: an anonymous
request had no ceiling at all. The gate in `a6f0e0a` closes it once the sync phrase is set on the server.
Whether to restore a finite cap is an owner decision and is not made here.

### 10.4 New on the branch, outside the audit's findings

- The any-time pick engine and its three triggers (endpoint, command line, "Run picks now"), an append-only
  ledger, two bankrolls, and a three-way report (commits `c479bf0` to `15ce15e`).
- The cutover: from the 2026-11-13 card, only the any-time engine records new picks (`9091001`).
- MLB archived and a College Basketball desk added at Josh's request (`adcf94f`). The desk has no model of
  its own: its fair number is the two books' no-vig price, so an edge there is line shopping. Its overtime and
  24-hour postponement rules are assumptions, not rules that were read.

### 10.5 One new low finding

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| N-1 | low | The CLV writer skips its store write without a log or a field in the answer when the merged value is over the size limit | `app/api/clv/route.ts`, the `MAX_BYTES` branch |

### 10.6 Still open, highest first

- High: G1-3 (remainder), B1-1, B2-1, B3-1, P-2 (model quality: reported, not tuned, as the brief requires).
- Medium: E1-2 (store timeout and retry), E1-5, D-3 to D-5, E2-5, E2-6, G1-8, G2-6, G2-12, G2-19, G4-2, G4-8, G4-14.
- Low: everything else, as backlog.

### 10.7 Tests on the branch

Full suite: 5,083 tests, 4,944 pass, 139 fail. The 139 are the 128 that already failed on the base commit, by
name, plus 11 that pin `regions=us` in an Odds API request and turned red when every request began naming the
two books (section 9.8 predicted them). No pre-existing test was edited; changing those 11 needs Josh's OK.
