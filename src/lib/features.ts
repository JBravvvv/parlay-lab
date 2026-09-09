/* Feature flags — a single switch controls whether a sport's tabs appear.

   UFC runs on an event cadence: it's surfaced the day before each card
   (Fridays) and taken back down afterward. Flipping UFC_ENABLED to `true`
   re-adds the 🥊 UFC tab across the Board, The Sharp, the Builder and Stats;
   `false` hides them all. The UFC components stay in the tree either way, so
   this is the only edit needed to bring the sport back or put it away. */
export const UFC_ENABLED = false;

/* The MLB All-Star Game desk (⭐ ASG tab on Board / The Sharp / Builder).
   One-night event: flip to `true` on game day, back to `false` after — the
   components stay in the tree either way, this is the only edit. */
export const ASG_ENABLED = false;

/* The College Football desk (🏈 CFB on the global SportSwitch): Board / Builder /
   Parlay Builder / Ledger / The Sharp / Games / Stats route to the CFB surfaces, with
   their own bank and ledger keys (src/lib/cfb/rules.ts) — never the MLB ones. `false`
   pins every page to MLB; the CFB components stay in the tree either way. */
export const CFB_ENABLED = true;

/* SEASON LAB (INSTRUCTION 46, 2026-09-08, Josh: "Should be evaluating season long props and season
   long prop parlays so I can mess around and have fun with a bunch of season long tickets").
   The /season page (Season Lab in the rail) — season-long CFB player props, team win totals and
   season parlays on typed lines, with its own paper ledger key (pl_cfb_season). `false` turns the
   page into a plain notice; the nav entry and the components stay in the tree either way. */
export const CFB_SEASON_ENABLED = true;

/* THE NFL DESK (2026-09-08, Josh, verbatim: "NFL needs to be built NOW"; "Allocation should be set
   to $350"). 🏈 NFL on the global SportSwitch: Board / Builder / Parlay Builder / Ledger / The
   Sharp / Games / Stats route to the NFL wrappers (src/components/nfl/*), which render the shared
   football surfaces under an NFL LeagueContext with their own bank and ledger keys
   (src/lib/nfl/rules.ts) — never the CFB or MLB ones. `false` hides the pill and pins every page
   to the other desks; the components stay in the tree either way. NFL SEASON LAB IS CUT FOR THIS
   SHIP: Season Lab (/season) stays CFB-only under CFB_SEASON_ENABLED, and the nav's cfbOnly gate
   is unchanged. */
export const NFL_ENABLED = true;
