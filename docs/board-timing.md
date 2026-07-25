# Board timing — when the engine should generate (Phase 1, 2026-07-25)

> ## ⚠️ PRESSING GENERATE IN THE APP DOES NOT WRITE A SERVER BOARD
> The in-app regenerate runs the engine **in the browser**. It writes `pl_board_r1`
> in that device's localStorage and posts prediction records to `/api/predictions`.
> It does **not** populate `pl:board:{date}`, so `/api/board` will still answer
> `{"board": null}` afterwards — that is correct behaviour, not a broken pipeline.
>
> Only `/api/generate` writes a server board: the Vercel cron, or a manual call with
> the `X-Cron-Key` header:
> ```
> curl -s -H "x-cron-key: <CRON_SECRET>" "https://parlay-lab-six.vercel.app/api/generate"
> ```
> Verify with `curl -s "https://parlay-lab-six.vercel.app/api/board?date=YYYY-MM-DD"`.

## The problem

The Monte Carlo path requires a confirmed 9-man lineup on both sides. Without one the
game falls to the closed-form path, which carries the documented H+R+RBI PA-conditioning
weakness (`docs/hrr-recalibration.md`). MLB posts lineups roughly 3 hours before first
pitch. The only scheduled generation runs at **16:00 UTC (9:00 AM PT)**, and the owner
generates and locks around **9–9:30 AM PT, right after it**.

So both the logged board *and the cards actually bet* are priced largely off projected
lineups. This is not only a calibration-channel problem.

## Measured: the slate (141 games, 10 real slate days, 2026-07-11 → 07-24)

| first pitch (UTC) | games | share |
|---|---|---|
| 16:00–18:59 | 34 | 24% |
| 19:00–21:59 | 30 | 21% |
| 22:00–23:59 | 43 | 31% |
| 00:00–02:59 | 34 | 24% |

Median first pitch **19:07 UTC**.

## Coverage by candidate pass time — ONE metric, defined once

Two earlier tables used different denominators and could not be reconciled (a pair
scored lower than one of its members). This is the single table. Everything else is
superseded.

- **Denominator:** every game on the day's official slate — constant across every row,
  which is what makes rows comparable and pairs monotonic.
- **Numerator:** games *live* at some pass — not started at that pass **and** lineup
  posted (modelled at pitch − 3h).
- **Post-fix**: since 2026-07-25 every scheduled game is priceable on a server board,
  so "priceable" and "scheduled" are the same set (`docs/rebaseline-2026-07-25.md`).

| pass(es) UTC | all | weekday | Sunday |
|---|---|---|---|
| 16:00 | 24% | 11% | **71%** |
| 20:00 | 23% | 24% | 23% |
| 21:00 | 31% | 39% | 3% |
| **22:00** | **45%** | **56%** | 3% |
| 23:00 | 43% | 55% | 3% |
| **16:00 + 22:00** | **69%** | **67%** | **74%** |
| 16:00 + 20:00 | 48% | 35% | 94% |
| 20:00 + 22:00 | 60% | 70% | 26% |

Monotonicity holds (24% ≤ 69% ≥ 45%), which is the check the previous tables failed.

**Answer: 22:00 UTC** as a single pass, and it is the best single hour on weekdays by a
wide margin (56% vs 11% at 16:00). **16:00 alone is a Sunday instrument** — 71% Sunday
against 11% weekday — because Sunday slates are early-heavy.

### The caveat that matters
First-pitch times are **measured**. "Lineup posted" is **modelled** at pitch − 3h,
because statsapi does not retain posting timestamps. The ranking is stable across
2h/3h/4h assumptions, but the absolute percentages are not. `luCoverage` (Phase 1b) now
stamps real coverage on every board — after a week, re-derive this table from measured
data. That costs zero credits.

## No third pass
`16 + 20 + 23` reaches 91% against 69% for `16 + 22` — real coverage, but it costs
another ~120 Odds credits/day (~3,720/month) for +22 points. That is a bad trade at any
budget and an impossible one at this budget. Two passes is the ceiling.

## The second pass may not need a second cron at all

Vercel Hobby allows 2 crons and both are used, which framed the second pass as "add an
external scheduler and pay for another 120 credits/day". That framing assumed the 16:00
run must stay. It probably must not:

- On **weekdays** the 16:00 board is 11% lineup-confirmed. It is a near-fully-projected
  board, and it is the *only* thing the calibration channel gets on days the app is not
  opened.
- Once the owner generates at 22:00 UTC on weekdays (`docs/generate-timing.md`), his own
  board scores 56% on the single table above against 16:00's 11% on weekdays — strictly better data, same cost,
  already being spent.

So the highest-value change is not a new cron, it is **retiming the existing one from
16:00 to 22:00 UTC**: no external scheduler, no `X-Cron-Key`, no extra credits, and the
cron becomes a genuine backstop that only matters on days the app is never opened.

The one thing 16:00 does well is **Sundays** (71% confirmed, and the Sunday slate is
mostly over by 22:00). That is also the day the owner already generates early himself,
so the cron's Sunday value is largely duplicated by his own routine.

## Status: SHELVED on cost, not on merit
The second pass is **not scheduled** — see `docs/credit-budget.md`. The plan is
structurally over-subscribed before adding anything, so the pass waits until the budget
is fixed. The engineering is done and dormant: `/api/generate` accepts an `X-Cron-Key`
header for an external scheduler, with a 4-runs-per-date cap. Only the schedule is
missing.
