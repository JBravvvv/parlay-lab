# Rebaseline — 2026-07-25 (bug fix, not a silenced test)

**This is a BUG-FIX REBASELINE.** The rule in the instruction file is *never rebaseline
to make a test pass*, and it still stands. This is the other case: a real defect was
corrected, the engine's output legitimately changed, and the digest had to follow. The
record below exists so a future reader can tell the two apart without having to trust
anyone's word for it.

## The defect

`obSameDay` compared an event's `commence_time` to the **host's local calendar day**,
and it gated both the game-odds loop (`shCollectSlate` L1218) and the props-event filter
(L1298). Vercel runs `TZ=UTC`. Every game starting at or after **00:00 UTC — 8 PM ET,
5 PM PT** — was therefore dropped from odds and props on every server board, while
remaining in `slate.games` and `gameInfo`. A Pacific browser kept the same games, so
client and server boards silently disagreed.

Measured over 10 real slate days: **34 of 141 games — 24% of an average slate**, ranging
0% to **57% in a single day (2026-07-17)**, entirely west-coast and late-game shaped.

It survived a 339-test, parity-verified suite because `createEngine` **replaces
`obSameDay`** with a UTC-string comparison whenever `today` is pinned — the harness was
simulating the bug rather than catching it. See `docs/harness-substitutions.md`.

## The fix

Slate membership instead of calendar date, which is timezone-independent: the schedule
pull has already run and already knows which games are today's.

- L1218 / L1298: `obSameDay(...)` removed; an event whose `gkey` is not in
  `slate.eligible` is dropped **and disclosed** through `data_gaps` (the failure mode of
  membership is a team-name mismatch between the odds feed and statsapi, and that must
  never be silent).
- The props filter's old `undefined` branch returned `commence_time > now`, which is
  exactly what would have admitted **tomorrow's** games once the calendar gate was gone.
  It now returns `false`.

## The digest

| | sha256 | bytes |
|---|---|---|
| OLD | `062e65538ca4d0b1f5cc2d4bdfc2b1e427c666b301b0f444eda7bea4669aea50` | 46,688 |
| NEW | `e3674507e3024fde2235018b183f6915c532ea36b9a2bdc1aebbf64a21928302` | 49,264 |

## The exact diff

```
categories.ml:   9 → 15   (+6)
categories.rl:   9 → 15   (+6)
parlays:        94 → 99   (+5)
```

Nothing was removed. Props are unchanged: the fixture set has prop files only for the
nine early events, so the recovered games have no prop data to contribute.

### The 6 recovered games — all late, all west/central

| game | first pitch (UTC) | ET |
|---|---|---|
| Houston Astros @ Texas Rangers | 2026-07-11T00:06Z | 8:06 PM |
| Los Angeles Angels @ Minnesota Twins | 2026-07-11T00:11Z | 8:11 PM |
| Atlanta Braves @ St. Louis Cardinals | 2026-07-11T00:16Z | 8:16 PM |
| Toronto Blue Jays @ San Diego Padres | 2026-07-11T01:41Z | 9:41 PM |
| Arizona Diamondbacks @ Los Angeles Dodgers | 2026-07-11T02:11Z | 10:11 PM |
| Colorado Rockies @ San Francisco Giants | 2026-07-11T02:16Z | 10:16 PM |

## Acceptance criterion — met

**A server run and a client run against the same fixture slate must produce the same
game set.** `tests/timezone-parity.test.ts` runs the production code path (no `today`
override) at `TZ=UTC` and `TZ=America/Los_Angeles` and asserts the game sets are
identical, that all six late games are present, and that the full 15-game slate is
priced.

Verified to **fail 3/3 on the pre-fix engine** (`expected 9 to be 15`) and pass 3/3
after — a regression test that provably catches the defect, not one that merely agrees
with the new code.
