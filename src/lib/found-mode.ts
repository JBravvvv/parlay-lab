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
 * FOUND_SINCE — TODAY, NOT TOMORROW (2026-10-03, Josh's word, verbatim: "No. Lock the $350 today
 * as well as any other locked parlays then  increase the max for all sports to $2500 so more bets
 * can be added throughout the day. We can keep all the locked bets but more bets need to be made
 * constantly all day long. If a bet wins (Ie: $250 straight bet wins $200) then that is added on
 * top of what can be bet on the day. So you start with $2500 and if you win $600 you have an extra
 * $600 to bet if other money is tied up. If you go up $600 for the day, the next day you start with
 * $3100 total but only have $2500 to bet. Only way to get more money for that day is to hit a bet
 * THAT DAY."). The first cut started at 2026-10-04 and left Saturday 2026-10-03 on its $350 shaped
 * card; now 10-03 is a found day too. Everything already locked on it stays exactly as locked
 * (append only) and found bets are added on top. Every day before 10-03 keeps its own rules.
 *
 * THE DAY'S ROOM GROWS WITH THAT DAY'S WINS. room = $2,500 + the profit of every bet on the day's
 * card that has already WON − every stake on the card (open, won or lost). A $250 bet that wins
 * $200 adds $200; a loss adds nothing (its stake is already counted); a push or void adds nothing.
 * The next day starts at $2,500 again — the bankroll (10,000 + P/L, the ledger's own number) is
 * what carries; the per-day room never does.
 *
 * Pure constants and pure helpers. Must NOT import src/lib/paper-mode.ts (paper-mode imports this
 * file for paperDaily's found branch).
 */

export const FOUND_SINCE = "2026-10-03";

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

/* ============================================================================================
 * STRAIGHT BETS ONLY (2026-10-06, Josh's word, verbatim: "I want you to change all sports on parlay
 * tab to now only take +EV straight bets. Same rules apply with $2500 per day and can only bet more
 * if there is a win etc. The engine should be locking in & betting +EV bets every time one meets the
 * criteria & the engine can calculate how much will be placed. That means if it locks 3 bets at 9am;
 * those bets are locked for the day, but if there is a refresh at 11am that has 2 more bets that
 * qualify, the engine will lock and take those bets etc. Same if it updates again at 12pm, 1:30pm,
 * 3pm, etc until it doesn't have money to bet because all daily cash is pending").
 *
 * From STRAIGHT_SINCE, on MLB, CFB and NFL, every found pass seats ONE-LEG bets only — no parlay,
 * no double, and no $25 fun parlay. Everything else is the found rule unchanged: the same +EV gate
 * per desk, the same whole-dollar Kelly stake ($5–$800), the same $2,500 + that day's wins room,
 * the same all-day cadence, append only. Bets locked earlier on 2026-10-06 stay exactly as locked.
 * ========================================================================================== */

export const STRAIGHT_SINCE = "2026-10-06";

/** stamped on every bet a straights-only day locks — the money guards hold it to one leg */
export const STRAIGHT_POLICY = "found-straight-v1";

/** true when `date` is a found day that seats straight bets only */
export function isStraightDay(date: string | null | undefined): boolean {
  return isFoundDay(date) && (date as string) >= STRAIGHT_SINCE;
}

/** the most legs a found bet may carry on `date` (MLB; football passes it to its own drafter) */
export function foundMaxLegs(date: string | null | undefined): number {
  return isStraightDay(date) ? 1 : FOUND.maxLegs;
}

/** the fun money a found day may ADD on `date` — none on a straights-only day */
export function foundFunOf(date: string | null | undefined): number {
  return isStraightDay(date) ? 0 : FOUND.fun;
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

/* ============================================================================================
 * SAME-DAY WINNINGS (2026-10-03, Josh: "If a bet wins (Ie: $250 straight bet wins $200) then that
 * is added on top of what can be bet on the day … Only way to get more money for that day is to hit
 * a bet THAT DAY").
 * ========================================================================================== */

type WonTicket = { id?: unknown; stake?: unknown };
type WonEntry = {
  core?: readonly WonTicket[] | null;
  funT?: readonly WonTicket[] | null;
  grading?: { tickets?: Record<string, { result?: unknown; payout?: unknown } | undefined> | null } | null;
  foundWonBy?: unknown;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** the profit of one ticket graded WON (payout is the total return, stake included); 0 otherwise */
export function wonProfitOf(stake: unknown, g: { result?: unknown; payout?: unknown } | null | undefined): number {
  if (!g || g.result !== "won") return 0;
  const p = Number(g.payout) - (Number(stake) || 0);
  return Number.isFinite(p) && p > 0 ? cents(p) : 0;
}

/** the day's realized winnings from the grading the entry itself carries — core and fun alike */
export function dayWonProfit(entry: WonEntry | null | undefined): number {
  if (!entry) return 0;
  const g = entry.grading?.tickets ?? {};
  let won = 0;
  for (const t of [...(entry.core ?? []), ...(entry.funT ?? [])]) {
    const id = t?.id == null ? "" : String(t.id);
    if (id) won += wonProfitOf(t.stake, g[id]);
  }
  return cents(won);
}

/** a grade that has decided the ticket — anything but pending / absent */
const SETTLED = new Set(["won", "lost", "push", "void", "ungradable"]);

/**
 * THE DAY'S WINNINGS, TICKET BY TICKET (review round, 2026-10-03). A server read that runs ahead of
 * the grading (the MLB box-score read, the football in-memory read of the free ESPN finals) records
 * its win per ticket in `foundWonBy: { [ticketId]: profit }` — never as one running total, so:
 *   - only a ticket ON THE CARD counts (a refused or missing ticket carries no win);
 *   - a SETTLED grade on the entry always decides its ticket — a box-read win the grader later calls
 *     lost / void / push / ungradable counts nothing, so a corrected read takes its room back;
 *   - two copies of the day can never add their wins together: each ticket counts once.
 */
export function foundWonByOf(entry: WonEntry | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!entry) return out;
  const g = entry.grading?.tickets ?? {};
  const rec = entry.foundWonBy && typeof entry.foundWonBy === "object" ? (entry.foundWonBy as Record<string, unknown>) : {};
  for (const t of [...(entry.core ?? []), ...(entry.funT ?? [])]) {
    const id = t?.id == null ? "" : String(t.id);
    if (!id || id in out) continue;
    const grade = g[id];
    let p = 0;
    if (grade && SETTLED.has(String(grade.result))) p = wonProfitOf(t.stake, grade);
    else {
      const r = Number(rec[id]);
      p = Number.isFinite(r) && r > 0 ? cents(r) : 0;
    }
    if (p > 0) out[id] = p;
  }
  return out;
}

/** per-ticket union of recorded reads — the larger read of each ticket, never a sum across copies */
export function mergeWonBy(...maps: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) {
    if (!m || typeof m !== "object") continue;
    for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0 && !(out[id] >= n)) out[id] = cents(n);
    }
  }
  return out;
}

/** the winnings a found day may add to its room: Σ foundWonByOf the entry */
export function foundWonOf(entry: WonEntry | null | undefined): number {
  return cents(Object.values(foundWonByOf(entry)).reduce((a, b) => a + b, 0));
}

/** the day's core ceiling: $2,500 plus that day's winnings */
export function foundCeiling(won: number): number {
  return FOUND.daily + (Number.isFinite(won) && won > 0 ? won : 0);
}
