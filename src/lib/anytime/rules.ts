/**
 * THE ANY-TIME ENGINE'S RULES (2026-11-12). One place, every number named.
 *
 * WHAT IS NOT HERE, ON PURPOSE (Josh's brief: "Remove every time window, once-per-day guard, daily
 * or per-slate pick cap, and freeze"): there is no slot list, no "already ran today" flag, no daily
 * or per-slate pick count, no daily dollar ceiling and no freeze date. The engine may be called at
 * any minute and takes every pick that clears the guards below.
 *
 * WHAT IS HERE are the guards that make a paper result mean something.
 *
 * NONE OF THESE NUMBERS IS FITTED. Each is a stated starting assumption; the reports split results
 * so each can be judged on closing line value before anyone moves it.
 */
export const ANYTIME_RULES = {
  /** Stamped on every pick. Bump when any rule below changes, so results split by rule set. */
  version: "anytime-1",

  /** A pick must be on an event that starts LATER than now + this margin (server clock). */
  startMarginMs: 60_000,

  /** A pick must use an odds snapshot fetched in the same run and no older than this at write time. */
  freshnessMs: 120_000,

  /** Minimum expected profit per 1 staked, by the model's probability, at the better of the two books. */
  minEv: 0.01,

  /** Line shopping counts as "price" basis when the two books' own no-vig number makes the price +EV by this much. */
  priceBasisMinEv: 0,

  /**
   * RE-ENTRY. A second pick in the same family (same side, same market, same event) is allowed only
   * when the bet got better, and it is recorded as a separate entry that names the pick it follows:
   *   - the payout at the same line improved by at least `priceImprove` (relative, decimal odds), or
   *   - the model EV improved by at least `evImprove` (absolute, per 1 staked).
   */
  reentry: { priceImprove: 0.03, evImprove: 0.02 },

  /**
   * KELLY BANKROLL (runs beside the flat 1-unit bankroll on the same picks).
   *   start      the bankroll both books' results are measured on, in units
   *   fraction   the share of full Kelly staked (quarter Kelly)
   *   maxPct     the most one pick may stake, as a share of the current bankroll
   *   eventPct   the most all open picks on ONE event may stake together; a pick is trimmed to fit
   * These size the Kelly stake only. They never stop a pick being recorded: a pick trimmed to zero
   * Kelly still stands at its flat 1 unit.
   */
  kelly: { start: 100, fraction: 0.25, maxPct: 0.02, eventPct: 0.05 },

  /** Overlapping runs: one run holds this lease; a second trigger arriving inside it is told "busy". */
  leaseMs: 90_000,

  /** The heartbeat is stale, and an alert is raised, when no run has finished for this long. */
  heartbeatStaleMs: 45 * 60_000,

  /** Odds API credits one run may spend (null = no ceiling). Telemetry is always on. */
  creditBudgetPerRun: 400 as number | null,

  /**
   * POLLING BY TIME-TO-START. A scheduled run re-prices an event only when its last look is older
   * than the interval for how far away the start is. A manual run prices everything open.
   * First matching row wins.
   */
  cadence: [
    { withinMs: 60 * 60_000, everyMs: 5 * 60_000 },
    { withinMs: 3 * 3600_000, everyMs: 15 * 60_000 },
    { withinMs: 12 * 3600_000, everyMs: 60 * 60_000 },
    { withinMs: 48 * 3600_000, everyMs: 3 * 3600_000 },
    { withinMs: Number.POSITIVE_INFINITY, everyMs: 12 * 3600_000 },
  ],

  /** A line move at either book of at least this much (decimal odds, relative) since the last
      recorded look is an event trigger of its own. */
  lineMove: 0.04,

  /** The closing line is re-recorded on each look inside this long before the start (a pick with
      no close yet is always given one). The last look before the start is the close. */
  closeWindowMs: 3 * 3600_000,

  /** How far ahead a run looks for events to price. */
  horizonMs: 8 * 86_400_000,
} as const;

export type AnytimeRules = typeof ANYTIME_RULES;

/** How often an event this far from its start should be re-priced by a scheduled run. */
export function cadenceFor(msToStart: number, rules: AnytimeRules = ANYTIME_RULES): number {
  for (const row of rules.cadence) if (msToStart <= row.withinMs) return row.everyMs;
  return rules.cadence[rules.cadence.length - 1].everyMs;
}

/** Whether a scheduled run should look at an event now. */
export function dueForLook(now: number, commenceMs: number, lastLookMs: number | null, rules: AnytimeRules = ANYTIME_RULES): boolean {
  if (!(commenceMs > now)) return false;
  if (lastLookMs == null) return true;
  return now - lastLookMs >= cadenceFor(commenceMs - now, rules);
}
