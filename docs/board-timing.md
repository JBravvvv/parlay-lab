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

## Coverage by pass hour — 8 weeks, 52 slate days, 710 games

> ⚠️ **THIS TABLE IS MODELLED, NOT MEASURED.** First-pitch times are real; "lineup
> posted" is *assumed* at pitch − 3h because statsapi does not retain posting
> timestamps. The perfect additivity across columns is a consequence of that
> assumption making the two sets disjoint by construction — it is not an empirical
> result. Good enough to choose a starting hour; not evidence of anything else.
> **`luCoverage` (Phase 1b) now stamps real coverage on every board — re-derive this
> from measured data after ~1 week (target: 2026-08-01).** That costs zero credits.

- **Denominator:** every game on the day's slate — constant across rows, so pairs are
  monotonic.
- **Numerator:** unstarted at the pass **and** past the assumed lineup window.

| day | days | games | 16:00 | 17:00 | 18:00 | 20:00 | 21:00 | 22:00 | 23:00 | best |
|---|---|---|---|---|---|---|---|---|---|---|
| Sun | 8 | 121 | 66% | **71%** | 51% | 17% | 5% | 6% | 7% | **17:00** |
| Mon | 7 | 76 | 1% | 1% | 1% | 21% | 57% | **71%** | 71% | **22:00** |
| Tue | 7 | 106 | 1% | 1% | 2% | 28% | 62% | **76%** | 68% | **22:00** |
| Wed | 7 | 107 | 21% | 28% | 18% | 21% | 45% | **56%** | 46% | **22:00** |
| Thu | 7 | 62 | 37% | 35% | 18% | 16% | 39% | **44%** | 39% | **22:00** |
| Fri | 8 | 117 | 3% | 3% | 3% | 15% | 52% | **74%** | 73% | **22:00** |
| Sat | 8 | 121 | 14% | 18% | **47%** | 36% | 19% | 26% | 31% | **18:00** |

### Saturday is a THIRD pattern, not a Sunday
The hypothesis was that Saturday might behave like Sunday and belong on the early
entry. It does not. Saturday's own best hour is **18:00 UTC (47%)** — 16:00 gives it
only 14% and 22:00 only 26%. Sunday peaks at 17:00, five points better than 16:00.

**So the split is three entries, not two.** They are mutually exclusive by day of week,
so the total is still ~1 call/day and ~1 board/day:

| cron-job.org entry | schedule (UTC) | coverage |
|---|---|---|
| weekdays | **22:00, Mon–Fri** | 66% |
| Saturday | **18:00, Sat** | 47% |
| Sunday | **17:00, Sun** | 71% |

Game-weighted that is ~62% of the season's slate, against ~51% for a single 22:00 daily
entry and ~44% for the current 16:00 daily cron.

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
