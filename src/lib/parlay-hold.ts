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

/** how many legs on the ticket are no longer posted at the price it shows — the price or book moved, or the leg is gone */
export function movedLegs<P>(legs: readonly GenLeg<P>[], pool: GenPool<P>): number {
  let n = 0;
  for (const l of legs) {
    const cur = pool.byId.get(l.id);
    if (!cur || cur.am !== l.am || cur.book !== l.book) n++;
  }
  return n;
}
