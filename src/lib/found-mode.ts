/**
 * FOUND MODE — THE CARD LOCKS BETS AS THE ENGINE FINDS THEM (2026-10-03, Josh's word, verbatim:
 * "For all sports on Parlay Lab, I no longer want the card to lock at a certain time. Since the
 * card is running paper/not my money, The engine should lock bets as it finds them. Whether its a
 * parlay, straight bet, etc; whether it auto refreshes or I manually refresh, any time it finds a
 * bet or a parlay, it can add that to the daily card and lock that pick/parlay on it. (I dont need
 * to be aware of the bets at the time & at a later point if I need to see them on time we can add
 * notifications) You can also increase the daily amount for each sport to $2500. Bets can be of
 * any amount. These are just examples not exacts: $250 straight bet, $500 straight bet $75 parlay,
 * $25 straight bet, $66 parlay, $128 parlay, $138 straight bet, etc. Any number is fine based on
 * what the engine determines").
 *
 * WHAT CHANGES ON A FOUND DAY (date >= FOUND_SINCE), on MLB, CFB and NFL alike:
 *   - no lock instant, no slot shape, no ticket count: every engine run — a scheduled fire, a
 *     refill slot, Josh's own Refresh — appends every qualifying bet it finds to the day's card,
 *     and the card stays APPEND ONLY (src/lib/append-only.ts) exactly as before;
 *   - $2,500 a day per sport is a CEILING, not a quota — a quiet board seats less, and nothing is
 *     forced onto the card to reach a number;
 *   - each stake is the engine's own Kelly size in whole dollars ($5 floor, $800 ceiling):
 *     kellyMult 4 × bankroll $10,000 × min(¼·f*, 2%) — the sizing rule the MLB allocator already
 *     ran on (shAllocate's kellyStakeMult 4 over PAPER.bankroll, INSTRUCTION 46b), now applied
 *     directly instead of being cut down to a slot.
 *
 * WHAT QUALIFIES. A bet the engine rates positive at the settlement price AFTER the market blend
 * (src/lib/shrink.ts, INSTRUCTION 18: the model said 56.0 wins where 46 landed, so every leg is
 * blended halfway to the de-vigged consensus). The engine's own strict gate passed ZERO bets on the
 * last three real MLB boards (2026-09-30, 10-01, 10-03 — straights carry no independent-book
 * consensus), so "lock what it finds" under that gate would lock nothing; the raw model number
 * over-selects (16 tickets / $6,408 on 10-03). The blended edge measured 2–7 bets and $336–$1,112
 * a day on those boards — inside the $2,500 ceiling with room for evening prices.
 *
 * FOUND_SINCE is the first FULL day under the rule: every day before it keeps the rules it was
 * locked under (the INSTRUCTION 72 date-gate precedent) — Saturday 2026-10-03 was already locked
 * as a $350 shaped day when the instruction arrived.
 *
 * Pure constants and pure helpers. Must NOT import src/lib/paper-mode.ts (paper-mode imports this
 * file for paperDaily's found branch).
 */

export const FOUND_SINCE = "2026-10-04";

export const FOUND = {
  since: FOUND_SINCE,
  /** the day's ceiling per sport — "increase the daily amount for each sport to $2500" */
  daily: 2500,
  /** fun money is unchanged: $25 once a day */
  fun: 25,
  /** the bankroll every found stake is priced off — a CONSTANT, never the engine's runtime
      bankroll (the scheduler's backfill engine boots unseeded at $750) */
  bankroll: 10000,
  /** shAllocate's kellyStakeMult — 4 × quarter-Kelly = full Kelly on the bankroll … */
  kellyMult: 4,
  kellyFrac: 0.25,
  /** … capped at 2% of the bankroll per quarter-Kelly unit (8% = $800 a ticket) */
  kellyCap: 0.02,
  /** the smallest bet the card writes — below this the edge is a rounding error */
  minStake: 5,
  /** the longest ticket a found day locks (MLB; football keeps its own leg rules) */
  maxLegs: 6,
} as const;

/** the largest single stake the rule can produce: kellyMult × bankroll × kellyCap */
export const FOUND_MAX_STAKE = FOUND.kellyMult * FOUND.bankroll * FOUND.kellyCap;

/** stamped on every found ticket and entry, so the record splits cleanly at FOUND_SINCE */
export const FOUND_POLICY = "found-v1";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true when `date` (YYYY-MM-DD) runs under the found rule */
export function isFoundDay(date: string | null | undefined): boolean {
  return typeof date === "string" && DATE_RE.test(date) && date >= FOUND.since;
}

/** full-Kelly fraction f* = (p·dec − 1)/(dec − 1); 0 when the edge is not positive or the inputs are not a bet */
export function kellyStar(p01: number, dec: number): number {
  if (!Number.isFinite(p01) || !Number.isFinite(dec) || p01 <= 0 || p01 >= 1 || dec <= 1) return 0;
  const f = (p01 * dec - 1) / (dec - 1);
  return f > 0 ? f : 0;
}

/**
 * The found stake in whole dollars: round(kellyMult × bankroll × min(kellyFrac·f*, kellyCap)),
 * trimmed to the day's remaining room (floored to a whole dollar). 0 when the result is under the
 * $5 floor, the edge is not positive, or the inputs are not numbers.
 */
export function foundStake(p01: number, dec: number, room: number): number {
  const f = kellyStar(p01, dec);
  if (f <= 0) return 0;
  const raw = Math.round(FOUND.kellyMult * FOUND.bankroll * Math.min(FOUND.kellyFrac * f, FOUND.kellyCap));
  const cap = Number.isFinite(room) ? Math.floor(Math.max(0, room) + 1e-9) : 0;
  const stake = Math.min(raw, cap);
  return stake >= FOUND.minStake ? stake : 0;
}

/** what is left of the day's ceiling after the stakes already on the card */
export function foundRoom(lockedStakes: readonly (number | string | null | undefined)[], daily: number = FOUND.daily): number {
  const used = lockedStakes.reduce<number>((a, s) => a + (Number(s) || 0), 0);
  return Math.max(0, daily - used);
}

/**
 * The greedy pass every desk runs: candidates in the caller's order (best first); a candidate
 * is taken when `admit` accepts it against what is already taken and its stake (trimmed to the
 * room left) clears the floor. `commit` records a taken candidate so later `admit` calls see it.
 * Returns the picks with their stakes and the room left.
 */
export function pickFound<T>(
  cands: readonly T[],
  o: {
    room: number;
    stakeOf: (c: T, room: number) => number;
    admit: (c: T) => boolean;
    commit: (c: T, stake: number) => void;
  },
): { picks: { c: T; stake: number }[]; room: number } {
  let room = Math.max(0, o.room);
  const picks: { c: T; stake: number }[] = [];
  for (const c of cands) {
    if (room < FOUND.minStake) break;
    if (!o.admit(c)) continue;
    const stake = o.stakeOf(c, room);
    if (!(stake >= FOUND.minStake) || stake > room + 1e-9) continue;
    o.commit(c, stake);
    picks.push({ c, stake });
    room -= stake;
  }
  return { picks, room };
}
