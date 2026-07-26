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

## THE CANONICAL COVERAGE METRIC — one definition, everything else superseded

Three separate tables in this project have disagreed on the same cell (22:00 weekday
has been quoted as 45%, 56%, 66% and 82%). Every one was computed on a different
denominator or a different sample, and none of them said so. **This is the definition.
Any number not computed this way is superseded and should be treated as wrong.**

> **Denominator:** every game on the day's *official MLB slate* (statsapi's date
> grouping), for the day types being averaged. Constant across every row, which is
> what makes rows comparable and pairs monotonic.
> **Numerator:** games that are **unstarted at the pass** AND **past the lineup-posting
> window** (modelled at first pitch − 3h).
> **Sample:** 52 slate days / 710 games (2026-05-31 → 2026-07-25).

This is also the *loggable* metric: the prediction store rejects live rows
(`boardToPredictions`: "calibration measures pregame statements only"), so a game that
has started contributes nothing whether or not its lineup is known.

| hour (UTC) | all | weekday | Saturday | Sunday |
|---|---|---|---|---|
| 17:00 | 23% | 12% | 18% | **71%** |
| 18:00 | 22% | 8% | **47%** | 51% |
| 19:00 | 15% | 5% | 40% | 27% |
| 20:00 | 23% | 21% | 36% | 17% |
| 21:00 | 38% | 52% | 19% | 5% |
| **22:00** | **49%** | **66%** | 26% | 6% |
| 23:00 | 46% | 61% | 31% | 7% |

**Weekday peak is 22:00 UTC at 66%** — confirmed by sweeping 16:00–24:00, not assumed.
The 21:00 → 22:00 → 23:00 shape (52 → 66 → 61) is a genuine peak, not a plateau edge.

### Superseded numbers, for the record
- "22:00 = 45% all / 56% weekday" — same metric, **10-day sample**. Superseded by the
  52-day figures above.
- "22:00 = 82% coverage" — different denominator (*unstarted games only*, not the whole
  slate). That denominator moves with the hour, so its rows are not comparable and pairs
  are not monotonic. Do not use it.
- "22:00 = 56% priceable" — the same 82% metric with the timezone bug's dropped games
  removed. Obsolete: the bug is fixed, so priceable == scheduled.

### Still modelled
"Lineup posted" is **assumed** at pitch − 3h; statsapi does not retain posting
timestamps. First-pitch times are measured. Re-derive from real `luCoverage` once ~1
week of stamped boards exists (target 2026-08-01) — free, no credits.

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
