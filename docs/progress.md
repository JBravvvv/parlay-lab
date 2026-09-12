# Progress — 2026-09-11 (INSTRUCTION 51: the live in-play line and price are really pulled, for MLB)

## Board — "over 3.5 at −145" instead of a dash
- Josh: "Authorize the live in-play odds pull for MLB"
- This is the second half of the last fix. His complaint was: "It's not updating with live odds; it
  will show the player is top 4th w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI
  when their live over/under is 3.5 H+R+RBI". The last ship fixed the half that was free — a leg the
  live tally has already carried past its line stops being graded and says so. It could not do the
  other half, because the other half costs money: knowing what the book is charging RIGHT NOW needs a
  paid per-event pull, and that had not been authorised. Now it has.
- What changed: the live line and the live price come from a real, budgeted, per-event in-play pull
  of the six MLB prop markets — the same six the app already prices — asked one game at a time, only
  for games that are actually under way, and only for the games worth paying for. Which games those
  are is decided FREE before a single credit is spent: the app already knows every player's live
  tally from the free MLB feed and can already run the rest of the game through its own simulator, so
  it buys the games where the line has provably been cleared first, the games the sim says have
  genuinely moved second, and the quiet ones last or not at all.
- What a re-priced row looks like: the line the book is posting now, the price beside it with the
  book's name and the minute it was pulled, a pulsing LIVE pill so it can never be mistaken for the
  pregame lock, a real grade computed on THAT price at THAT line, and the live probability. The
  probability is the engine's own live-resume sim where the sim can price the rest of the game; where
  it cannot, it is derived from the book's own two-sided price and is labelled "market fair" rather
  than shown as a model number; where neither exists, the row shows the price and no grade at all.
  The pregame number is never run against the new price — that would produce a confident, wrong edge,
  which is worse than the dash it replaces.
- No ¼-Kelly stake on a live row, deliberately, and this is the one that matters for the bankroll: a
  fair price worked out FROM the market has, by construction, zero edge over that market, so a stake
  sized off it is sizing a bet with no edge in it. And the pregame Kelly on the row was sizing a
  different bet at a different line. A stake chip on an in-play line would be an instruction to bet a
  phantom, so there is no stake chip. The football desks already work this way; MLB now matches them.
- When no live line comes back — the book has taken the market down, the game just ended, the budget
  is spent, the pull errored, or the quote on file is too old to trust — the row falls back to
  EXACTLY what it showed yesterday: the dash, the SETTLED tag, and a plain sentence saying the price
  on that row is the pregame lock. The only thing added on those rows is one clause saying WHY no
  live line was obtained. The protection did not get weaker in any failure case; it is the default in
  all of them.
- Nothing is invented anywhere. Every number on screen came from the book, the free live game feed,
  or the engine's own simulator, and the one that came from the market is labelled as such. Every new
  test fixture is synthesized from the real response shape with invented numbers and marked as
  synthetic in the file — the paid feed is never called to build one.
- What is NOT claimed: that this refreshes itself all evening. It fires automatically on the same
  five Pacific slots as everything else, and four of those five see zero live baseball — the 16:45
  one catches about nine games, and the busiest stretch of the night is after it. The rest is Josh's
  own Refresh, which runs the identical pass, exactly as he asked for on 09-09. An opt-in that would
  cover the evening peak is built and shipped switched OFF, one constant away, and turning it on is
  his call, not ours. No budget, cap or slot was lowered to pay for any of this, and the new spend has
  its own counter so it can never eat the football desks' allowance.
- Also NOT claimed, and it is the gate on the whole thing: nobody has yet proved the feed even posts
  MLB prop markets on a game in progress. One small three-game probe against a live game settles it.
  If it comes back empty, the honest answer is that the authorisation bought a measurement rather
  than a board, and what stays on screen is the protection that already shipped.

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
- AMENDED 2026-09-11 (INSTRUCTION 51, and the sentence above is kept as the dated record): Josh
  authorised that spend the same day — "Authorize the live in-play odds pull for MLB". What it bought
  is a budgeted per-event in-play re-pull for MLB only, so a row whose line has moved now shows the
  line the book is posting NOW and the price beside it, instead of a dash. The first half of the
  sentence above did not change and was not weakened: a leg still under its line is still never
  called settled, and when the paid pull brings nothing back the dash and the SETTLED tag are exactly
  what they were. One thing is claimed at model tier and only under one condition — the live
  probability is the engine's own live-resume sim when that sim can price the rest of the game, and
  in that case only. When it cannot, the number shown is derived from the book's own two-sided price
  and is labelled "market fair" on screen, never dressed up as a model edge, and if neither is
  available the row shows the price with no grade at all.
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
