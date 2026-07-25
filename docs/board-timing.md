# Board timing — when the engine should generate (Phase 1, 2026-07-25)

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

## Coverage by candidate pass time

"Covered" = lineup posted **and** game not yet started, so the sim path can price it.

| pass (UTC) | alone | with 16:00 | weekday | Sunday |
|---|---|---|---|---|
| 19:30 | 18% | 42% | 27% | 94% |
| 20:00 | 23% | 48% | 35% | 94% |
| 21:00 | 31% | 55% | 50% | 74% |
| **22:00** | **45%** | **69%** | **67%** | **74%** |
| 23:00 | — | 67% | 65% | 74% |

**16:00 alone: 71% on Sundays, 11% on weekdays.** It is a Sunday-slate instrument, and
it stays — the `started(gkey)` freeze means a later pass cannot clobber early-game rows,
so the two passes are complementary rather than competing.

**Answer: 22:00 UTC.** It dominates every earlier candidate and coverage falls again
past it (23:30 + 16:00 → 52%) as the 23:00 bucket, the largest single group, starts
before being caught.

### The caveat that matters
First-pitch times are **measured**. "Lineup posted" is **modeled** at pitch − 3h,
because statsapi does not retain lineup-posting timestamps. The ranking is robust — 22:00
wins at 2h, 3h and 4h assumptions — but the absolute percentages are not.
**`luCoverage` (Phase 1b) makes this measurable.** After a week of stamped boards,
re-derive this table from real coverage and decide the pass on measured data. That
costs zero credits.

## No third pass
`16 + 20 + 23` reaches 91% against 69% for `16 + 22` — real coverage, but it costs
another ~120 Odds credits/day (~3,720/month) for +22 points. That is a bad trade at any
budget and an impossible one at this budget. Two passes is the ceiling.

## Status: SHELVED on cost, not on merit
The second pass is **not scheduled** — see `docs/credit-budget.md`. The plan is
structurally over-subscribed before adding anything, so the pass waits until the budget
is fixed. The engineering is done and dormant: `/api/generate` accepts an `X-Cron-Key`
header for an external scheduler, with a 4-runs-per-date cap. Only the schedule is
missing.
