import { isAzBook, type AzBook } from "@/lib/az/books";
import { amDec, isAm } from "@/lib/az/market";

/**
 * PARLAYS, UNDER THE TWO-BOOK RULE (pure).
 *
 *   1. Every leg must be offered at the SAME book, and the ticket is priced with THAT book's leg
 *      prices. A DraftKings leg is never combined with a FanDuel leg.
 *   2. Two legs from the same game are a SAME-GAME PARLAY. Each book prices those itself; the
 *      product of the leg prices is NOT what the book pays, and the legs are not independent, so
 *      the engine refuses to price one (no payout, no EV) unless the book's own quoted SGP price is
 *      supplied. The Odds API does not carry SGP prices, so today that means: not priced.
 *   3. Legs from different games are treated as independent: payout = product of the book's leg
 *      prices, probability = product of the leg probabilities.
 */

export type ParlayLeg = {
  /** Event the leg is on (legs sharing an event make a same-game parlay). */
  eventId: string;
  selection: string;
  /** Win probability of the leg given no push. */
  p: number;
  /** Each book's American price on this exact leg; absent = not offered there. */
  prices: Partial<Record<string, number | null>>;
};

export type ParlayPriced = {
  ok: true;
  book: AzBook;
  legs: number;
  dec: number;
  p: number;
  ev: number;
};

export type ParlayRefused = {
  ok: false;
  reason: "too_few_legs" | "foreign_book" | "leg_not_at_book" | "same_game_needs_book_price" | "bad_leg";
  detail?: string;
};

/** Price a parlay at ONE named book. `sgpDec` is that book's own quoted price for a same-game ticket. */
export function priceParlayAt(legs: ParlayLeg[], book: string, sgpDec?: number | null): ParlayPriced | ParlayRefused {
  if (!isAzBook(book)) return { ok: false, reason: "foreign_book", detail: String(book) };
  if (legs.length < 2) return { ok: false, reason: "too_few_legs" };
  for (const l of legs) {
    for (const k of Object.keys(l.prices)) if (!isAzBook(k)) return { ok: false, reason: "foreign_book", detail: k };
    if (!(l.p > 0 && l.p < 1)) return { ok: false, reason: "bad_leg", detail: l.selection };
    if (!isAm(l.prices[book])) return { ok: false, reason: "leg_not_at_book", detail: l.selection };
  }
  const sameGame = new Set(legs.map((l) => l.eventId)).size < legs.length;
  if (sameGame) {
    if (!(typeof sgpDec === "number" && sgpDec > 1)) return { ok: false, reason: "same_game_needs_book_price" };
    /* the book's own price is known, but the joint probability of correlated legs is not: no EV is claimed */
    return { ok: true, book, legs: legs.length, dec: sgpDec, p: Number.NaN, ev: Number.NaN };
  }
  const dec = legs.reduce((a, l) => a * amDec(l.prices[book] as number), 1);
  const p = legs.reduce((a, l) => a * l.p, 1);
  return { ok: true, book, legs: legs.length, dec, p, ev: p * dec - 1 };
}

/** The better of the two books for a parlay whose legs are ALL offered there. Never a mix. */
export function bestParlay(legs: ParlayLeg[]): ParlayPriced | ParlayRefused {
  const dk = priceParlayAt(legs, "draftkings");
  const fd = priceParlayAt(legs, "fanduel");
  if (dk.ok && fd.ok) return fd.dec > dk.dec ? fd : dk;
  if (dk.ok) return dk;
  if (fd.ok) return fd;
  /* report the more specific refusal */
  return dk.reason === "leg_not_at_book" && fd.reason !== "leg_not_at_book" ? fd : dk;
}
