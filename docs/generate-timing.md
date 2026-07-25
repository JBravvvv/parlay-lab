# When to generate — the free win (2026-07-25)

**Phase 1a's entire purpose, achieved by clicking later. Zero credits: you already
spend ~120 on one generate a day; this only changes *when*.**

## The finding

You generate and lock around 9–9:30 AM PT (16:00–16:30 UTC), right after the cron.
MLB posts lineups ~3 hours before first pitch, so at that hour almost nothing on the
evening slate is posted — and the Monte Carlo path requires a confirmed 9-man lineup on
both sides. Everything else falls to the closed-form path, which carries the documented
H+R+RBI PA-conditioning weakness (`docs/hrr-recalibration.md`).

Measured over 141 games / 10 real slate days (2026-07-11 → 07-24). "Live" = still
bettable (not started) **and** lineup posted:

| you generate | PT | still bettable | of those, real lineups | **live games/day** |
|---|---|---|---|---|
| 16:00 UTC | 9 AM | 100% | 11% | **1.5** |
| 18:00 UTC | 11 AM | 94% | 25% | 3.3 |
| 20:00 UTC | 1 PM | 83% | 29% | 3.3 |
| 21:00 UTC | 2 PM | 70% | 56% | 5.4 |
| **22:00 UTC** | **3 PM** | **69%** | **82%** | **7.8** |
| 23:00 UTC | 4 PM | 59% | 92% | 7.5 |

*(weekday rows — Sundays are a different animal, below)*

## Weekdays: generate at ~3 PM PT

**7.8 live games versus 1.5 — a 5× improvement, for free.** 22:00 UTC is the peak:
21:00 has the same bettable share with far fewer lineups posted, and by 23:00 you're
losing more games than you're gaining lineups.

Your 1 PM PT target is better than 9 AM but well short of it: 20:00 UTC still only has
29% of the bettable slate confirmed, because the evening lineups have not posted yet.
The curve is steep between 20:00 and 22:00 — that two-hour wait is worth 4.5 live games.

**The cost, stated plainly:** at 3 PM PT about 31% of the day's games have already
started and are off the card. Your rule has been "the card must span the whole day."
This trades day games for real lineups on night games. Given that a projected-lineup
price is the weaker instrument, the trade looks strongly positive — but it is a real
trade, and it is your call.

## Sundays: keep 9–10 AM PT

Sunday slates are early-heavy and the picture inverts completely:

| you generate | PT | still bettable | real lineups | live games/day |
|---|---|---|---|---|
| **16:00 UTC** | **9 AM** | **100%** | **71%** | **11.0** |
| 17:00 UTC | 10 AM | 90% | 71% | 10.0 |
| 18:00 UTC | 11 AM | 55% | 94% | 8.0 |
| 20:00 UTC | 1 PM | 26% | 88% | 3.5 |
| 22:00 UTC | 3 PM | 3% | 100% | 0.5 |

**Sunday at 9 AM PT gives 11.0 live games — the best number on this page.** Your current
habit is not wrong; it is optimised for Sunday and applied to every day. Keep it on
Sundays, move it on weekdays.

## The rule

- **Mon–Sat: generate and lock at ~3 PM PT (22:00 UTC).**
- **Sun: generate and lock at ~9–10 AM PT (16:00–17:00 UTC), as you do now.**

Costs nothing. Needs no cron, no scheduler, no secret. It is strictly larger than
anything Phase 1a's second pass would have bought, because it improves the board you
actually *bet*, not just the one that gets logged.

## Caveat, and how it stops being one
"Lineup posted" is **modelled** at pitch − 3h; statsapi does not retain posting
timestamps. First-pitch times are measured. The ranking is stable across 2h/3h/4h
assumptions, but the absolute percentages are not. `luCoverage` (Phase 1b) now stamps
real coverage on every board — after a week, re-derive this table from measured data.
That costs zero credits.
