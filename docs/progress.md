# Progress — 2026-09-09 (INSTRUCTION 48: the card only grows)

## Every desk — LOCKED is the first lock, not the end of the day
- "Locked" now means the first lock happened, not that the day is closed: the desk keeps adding
  tickets across the day's refreshes until the daily allotment is placed (the Builder and the
  CFB/NFL card say "Still filling — $x of $y" while pregame games remain).
- MLB sweeps up to 4 times a day (was 2), 45 min apart, an empty sweep waiting 90 min; a sweep
  that could not own an open slot is refused for free. Football: 6 attempts per arm (was 2).
- A locked ticket is never removed or resized — enforced by `src/lib/append-only.ts` at every
  server write (MLB build + write, football top-up + write) and tested.
- Credits: MLB worst case 6 → 8 full runs a date (912–1,200 at 114–150 each), football ≤42
  lines credits a date (lock + at most 6 top-up boards); with the fixed rails (~231/day) September
  reads ≈ 29,300 realistic against a 20,000/month plan whose last reading (16,480 on 09-05) is
  stale — the month is already short on paper, so the props rails
  are the lever, not the caps. Not committed.

# Progress — 2026-09-08 (INSTRUCTION 47: CFB $250, the NFL desk, NFL $350)

## Football — one engine now runs two desks
- NFL is the third pill on the sport switch. Board, Builder, Parlay Builder, Ledger, The Sharp,
  Games, Stats and Settings bank all have an NFL surface; the server locks an NFL card once
  per slate date ($350 core + $25 fun, tickets $5–$50, 3–10 of them, one side per game) and
  grades it from ESPN finals at the Caesars line. Own ledger, bank and keys — nothing shared
  with CFB or MLB money.
- CFB core widened to $250 a day; ticket max $50 and up to 10 tickets so the money can
  actually deploy (7 × $25 could never hold $250).
- Not built: an NFL Season Lab (the CFB one stays). Not covered: London 13:30Z kickoffs —
  the scheduler ticker's hours would need widening on cron-job.org (Josh's account).
- First live NFL slate: Thursday 2026-09-10 (49ers at Rams). Nothing has been read from prod
  for the NFL yet; the props credit cost per game is the CFB figure until measured.

# Progress — 2026-09-08 (INSTRUCTION 46: shaped core, CFB headshots, Season Lab, ten UI fixes)

## Baseball — the core runs Josh's six $150 shapes and tilts on its own record
- `src/lib/core-shapes.ts`: his six examples verbatim, one per day in rotation; `lock-card.ts`
  seats one ticket per slot CAPPED at the slot's stake — Josh's same-day call: "Cap at Kelly,
  don't ride the full slot". What Kelly declines is retired (`slotUnderSum`), never re-bought.
- Self-calibration: trailing-30-day 2-leg vs 3+-leg ROI (≥ 20 graded each, ≥ 10-point gap)
  tilts the rotation toward the winning bucket; thinner records keep the full rotation.
- Grading passes now fire at Josh's five Pacific times — 8:00, 9:30, 12:00, 3:00, 4:45 —
  on the first ticker tick after each (INSTRUCTION 46b). No cron-job.org change: the existing
  window already covers them in PDT and PST. The fix round earlier caught a stranded-money
  double count that would have frozen legacy days at $0.
- Kelly sized off the legacy $750 default on the server (max $60/ticket, so $75/$90 slots
  could never fill). Paper bankroll is now $10,000 (Josh: "Bump the bankroll to $10,000"),
  seeded into the server engine; per-ticket ceiling $800, cap-at-Kelly rule unchanged.
- Games tab compact/collapsible, "Game Preview" with AVG/OPS + batter-vs-pitcher,
  Parlay Builder All/Away/Home filter, ledger tap-anywhere + player deep links.

## Football — headshot over own-team logo everywhere, phone Builder rebuilt, Season Lab
- ESPN byathlete headshot + teamId joined onto every prop row (gated to the game's two
  teams); `PlayerMark` replaces the two-logo `PairMark` on player picks.
- CFB Builder at 375px: money strip, stacked tickets, collapsed notes, sticky lock pill.
- `/season` Season Lab: typed season lines (no Odds API market exists), ESPN-projected
  fair numbers, ¼-Kelly on a $250 season bank, season parlays, own store.
- Parlay Calc left-aligned two-column from `lg`; Board overview collapsible.
GATE: tsc clean, 165 files / 2358 tests green after two pin fixes.

