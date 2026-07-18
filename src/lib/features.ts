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
