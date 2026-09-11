# Progress — 2026-09-11 (INSTRUCTION 50: the Board's Refresh acts, a settled leg stops being graded, the Builder gets a generator)

## Board — the Refresh button always does something (item 1)
- Josh: "Refresh button not working on 'Board' tab; works if I refresh on 'The Sharp' tab"
- Four causes, all four fixed. The pill only fell back to a browser re-price on two of the nine
  refusal reasons the server can give; a 401/502/503 from the refill route came back as SUCCESS and
  the tap died in silence; the "Scanning slate…" label watched only the browser regenerate, so a
  refill in flight looked like a dead button; and the Board's pick rows came from a MOUNT-ONLY
  fetch — which is the real reason refreshing on The Sharp "worked". Leaving the tab and coming
  back remounts the page and refetches. Navigation was doing it, never the button.
- Now a tap always re-prices something: the server refill when the sync phrase is stored, otherwise
  the browser generate, and the browser generate as a fallback on ANY refusal, any non-2xx and any
  error. The picks list became a query that both paths refresh. Every tap prints its one-line reason
  plus what it spent (~114–150 Odds credits, estimate 140) — counted to keep the spend visible,
  never to block it. No budget, cap or slot lowered, and no cooldown added: nothing should stop a bet.

## Board — an 'S' grade on a leg that has already won (item 2)
- Josh: "It's not updating with live odds; it will show the player is top 4th w/ 3 H+R+RBI, but show
  them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5 H+R+RBI"
- Both halves were already on the same row and nothing compared them: the live-tally reader computed
  the number and returned only the text to print, and the grade is a pure threshold on one EV number
  with no line, no clock and no game state. The tally reader now returns the number as well, and a leg
  whose live tally has passed its line shows a dash and a SETTLED tag instead of a grade, saying in
  plain words that the price on that row is the PREGAME lock, not a live market. The row stays on
  screen and sinks to the bottom — nothing is hidden or deleted.
- Deliberately NOT claimed: a leg still under its line is never called settled (proving that needs a
  live re-pull), and no live line and no live price is invented anywhere. A real in-play price would
  cost a paid per-event pull that Josh has not authorised.
- Sequencing: this suppression ships WITH the refresh fix, never after it. A working refresh with no
  suppression would mint a real 'S' on every settled leg priced softer than about −1640.

## Parlay Builder — a generator you can pin and respin (items 3 and 4)
- Josh: "Parlay builder should have a generator that I can select # of legs, prop category, min & max
  odds then it will generate a parlay for me within those parameters; if I hit regenerate then it
  regenerates a new parlay; each slot is clickable to keep that player(s) in any round and spin the
  other slots"
- Josh's own example settles what the odds range means: his four legs (−145, −124, −137, −130)
  multiply out to +834, while the range he wrote is −152 → +110 and every one of the four sits inside
  it individually. So the range is PER LEG by default, with a combined-payout target as an optional
  extra. One question goes back to Josh to confirm that reading.
- Pin any slot and spin the rest; the same settings and the same spin give the same ticket on any
  phone; one leg per player always, one per game unless you turn it off; when it cannot fill the
  request it says so in one honest line instead of quietly loosening the rules. No price is ever
  invented — only sides the book actually posted. Sandbox only: nothing is tracked, nothing enters
  the ledger, no credits are spent.
- Josh: "Need player headshots for Parlay Builder etc or need team logo next to name" — every
  generated leg and every parlay leg now carries the player's headshot with his own team's logo
  badged on the corner, and his initials when there is no photo.

## Picks list — collapse a game by pressing its matchup box (item 5)
- Josh: "Need to be able to collapse list of picks for each individual game/prop by clicking/pressing
  in the top box that shows the team matchup"
- It already worked — the matchup bar was already the toggle. What was actually wrong: the bar was
  36px tall against this project's own 44px minimum, it gave no press feedback so a tap that DID work
  felt like nothing happened, and it forgot what you had collapsed the moment the list re-rendered.
  Now 44px, it presses, a collapsed market card still shows how many lines are inside it, and a
  collapse survives a reload.
- Not built, flagged for Josh: the Board tab has no per-game grouping to collapse at all, and games
  still default to open the first time you see them.
- Status: built on the shared tree, NOT committed, NOT deployed. The handoff's origin-sha claim was
  refreshed in the same work — it sat exactly at the currency guard's limit, so the next commit on
  this branch would have turned it red.

# Progress — 2026-09-09 (INSTRUCTION 49: refill on the five slots, or on Josh's own click)

## Every desk — the card refills five times a day, or when Josh presses Refresh
- Josh: "It shouldn't be refreshing every 15 minutes. It should be 8am, 9:30am, 12pm, 3pm & 4:45pm.
  Other than that I can manually do it." Top-ups now fire only on the first scheduler tick after
  08:00 / 09:30 / 12:00 / 15:00 / 16:45 PT — the same five slots grading already uses
  (`REFILL_SLOTS_PT` = `GRADE_SLOTS_PT`) — or when Josh presses Refresh with his sync phrase stored
  (`POST /api/refill?desk=mlb|cfb|nfl`, the identical server pass with slot `manual`).
- First locks are unchanged (MLB lineup/first-pitch blocks, football 60-min lead). Nothing changes
  on cron-job.org or in `vercel.json`; the 21:45Z / 00:00Z vercel crons never refill.
- `TOPUP_MAX` 4 → 6 (five slots + one manual); the 45-min / 90-min cooldowns are unwired — the slot
  calendar is the only pacing; a slot that already ran today is refused free (the slot is stamped
  on the top-up row). Football `retryMs` → 0.
- Budgets: none lowered, per Josh ("Don't lower any budgets") — the INSTRUCTION 48 props-budget
  lever is countermanded; Josh buys credits instead. MLB hard ceiling 9 runs / 1,026–1,350
  without a click, 10 runs / 1,140–1,500 with one, realistic 342–600; football slot-only
  ≤ 5 attempts = 30 lines credits, 6 with one manual = 36, 42 including the lock's own pull.
- Status: built on the shared tree, NOT committed, NOT deployed.

# Earlier — 2026-09-09 (INSTRUCTION 48: the card only grows)

## Every desk — LOCKED is the first lock, not the end of the day
- "Locked" now means the first lock happened, not that the day is closed: the desk keeps adding
  tickets across the day's refreshes until the daily allotment is placed (the Builder and the
  CFB/NFL card say "Still filling — $x of $y" while pregame games remain).
- MLB sweeps up to 4 times a day (was 2), 45 min apart, an empty sweep waiting 90 min; a sweep
  that could not own an open slot is refused for free. Football: 6 attempts per arm (was 2).
  (Cadence superseded the same day by INSTRUCTION 49 above: five PT slots + manual, TOPUP_MAX 6.)
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
