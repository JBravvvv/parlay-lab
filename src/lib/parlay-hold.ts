import type { GenLeg, GenPool, GenResult } from "./parlay-gen";

/**
 * THE TICKET ON SCREEN HOLDS (2026-09-26, Josh, verbatim: "After parlay generator spins and rolls out the picks, it
 * waits to finish loading 'the board' I guess? And then it changes the picks. It shouldn't change anything after it
 * rolls them out one by one").
 *
 * Pure helpers for src/components/props/useParlayGen.ts, kept here so the rules are testable without a DOM.
 */

/** the ticket being shown, the request it answered, and whether the board had finished its first load when it was drawn */
export type HeldTicket<P> = { key: string; result: GenResult<P>; firm: boolean } | null;

/**
 * The ticket for request `key`. A FIRM ticket already drawn for the same request is handed back untouched — a new
 * pool alone (a live-price poll, the game logs landing, a clock tick, a quote refresh) never replaces it. Anything
 * else is drawn afresh by `draw`: a new request, a failure (a failure is not a ticket, so it still follows the pool),
 * or a ticket drawn while the board was still on its first load (`ready` false — provisional until the board is full).
 */
export function holdTicket<P>(
  held: HeldTicket<P>,
  key: string,
  ready: boolean,
  draw: () => GenResult<P>,
): { held: HeldTicket<P>; result: GenResult<P> } {
  if (held?.firm && held.result.ok && held.key === key) return { held, result: held.result };
  const result = draw();
  return { held: { key, result, firm: ready }, result };
}

/**
 * Whether a ticket drawn now is FIRM (it holds) or provisional (it follows the pool until it is). Provisional while the
 * board is still on its first load, while another sport's legs are on their way, and — only for a draw THROUGH a
 * position filter — while the rosters that filter reads are loading (2026-09-28: a draw without a filter never reads a
 * position, and holding it provisional let a pool rebuild inside the roster wait swap the ticket after its reveal).
 */
export function drawIsFirm(o: { ready: boolean; crossPending: boolean; positionFilter: boolean; positionsPending: boolean }): boolean {
  return o.ready && !o.crossPending && !(o.positionFilter && o.positionsPending);
}

/** the same bet at the same price: every number a slip or a grade reads is identical */
export const samePrice = <P,>(a: GenLeg<P>, b: GenLeg<P>) =>
  a.am === b.am && a.book === b.book && a.prob === b.prob && (a.push ?? 0) === (b.push ?? 0) && (a.quoteAt ?? null) === (b.quoteAt ?? null);

/**
 * The held ticket as the board draws it NOW. A leg the board still posts at the very same price is shown as the board's
 * own copy of it — so the game-log chip that landed after the spin, a new hit-rate window (L10 → L20), a headshot or a
 * position the roster filled in all appear. A leg whose price moved, or that left the board, keeps exactly what was
 * spun (and `movedLegs` counts it). Never a different leg, never a new price. The same object comes back when nothing
 * changed, so a quiet pool rebuild causes no churn.
 */
export function withBoard<P>(r: GenResult<P>, pool: GenPool<P>): GenResult<P> {
  if (!r.ok) return r;
  let changed = false;
  const legs = r.ticket.legs.map((l) => {
    const cur = pool.byId.get(l.id);
    if (!cur || cur === l || !samePrice(cur, l)) return l;
    changed = true;
    return cur;
  });
  return changed ? { ok: true, ticket: { ...r.ticket, legs } } : r;
}

/**
 * Whether "Add to slip" refuses a leg on the clock alone: a pregame leg whose first pitch or kickoff has passed, or a
 * started leg whose live quote is missing or older than its desk allows (30 min MLB, 10 min football). `sport` is the
 * desk's own, for a leg that carries none.
 */
export function legExpired<P>(l: GenLeg<P>, nowMs: number, sport?: string): boolean {
  if (!l.started) return !!l.start && Date.parse(l.start) <= nowMs;
  const cap = l.sport === "mlb" || (sport === "mlb" && !l.sport) ? 1_800_000 : 600_000;
  return !l.quoteAt || nowMs - Date.parse(l.quoteAt) > cap;
}

/**
 * How many legs on the ticket are no longer posted at the price it shows — the leg is gone, or anything `samePrice`
 * reads moved (2026-09-28: it counted only the price and the book, so a re-priced win % or a new live quote left the
 * sheet with no "moved" note while "Add to slip" — which compares every one of them — refused the ticket). With a
 * `clock`, a leg Add refuses on the clock (`legExpired`) counts too, each leg once: the pool is rebuilt only when its
 * inputs change, so a first pitch that passed read as nothing for up to five minutes while Add already refused.
 */
export function movedLegs<P>(legs: readonly GenLeg<P>[], pool: GenPool<P>, clock?: { nowMs: number; sport?: string }): number {
  let n = 0;
  for (const l of legs) {
    const cur = pool.byId.get(l.id);
    if (!cur || !samePrice(cur, l)) n++;
    else if (clock && legExpired(l, clock.nowMs, clock.sport)) n++;
  }
  return n;
}
