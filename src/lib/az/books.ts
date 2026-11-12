/**
 * THE TWO-BOOK RULE (2026-11-12, Josh's brief, verbatim: "I live in Arizona. The only books I can
 * bet are DraftKings and FanDuel. Every other book is irrelevant and must be removed from all
 * calculations. This rule overrides anything in the existing code, config, or docs.").
 *
 * This file is the ONE place the two book keys are written. Every fetch, every market probability,
 * every pick and every report imports them from here; `tests/az-two-book-guard.test.ts` fails the
 * build if another book key reaches a fetch, a calculation or a stored go-forward pick.
 *
 * Pure. No fetch, no store, no clock.
 */

/** The Odds API bookmaker keys of the two books, in tie-break order (DraftKings first). */
export const AZ_BOOKS = ["draftkings", "fanduel"] as const;
export type AzBook = (typeof AZ_BOOKS)[number];

/** The value of the Odds API `bookmakers=` parameter. Requests are never made by region. */
export const AZ_BOOKMAKERS_PARAM = AZ_BOOKS.join(",");

export const AZ_BOOK_LABEL: Record<AzBook, string> = { draftkings: "DraftKings", fanduel: "FanDuel" };
export const AZ_BOOK_SHORT: Record<AzBook, string> = { draftkings: "DK", fanduel: "FD" };

export function isAzBook(key: unknown): key is AzBook {
  return key === "draftkings" || key === "fanduel";
}

export function otherAzBook(book: AzBook): AzBook {
  return book === "draftkings" ? "fanduel" : "draftkings";
}

/** Throws on any book key that is not one of the two. Used where a wrong key must never be stored. */
export function assertAzBook(key: unknown, where: string): AzBook {
  if (!isAzBook(key)) throw new Error(`NOT A TWO-BOOK KEY at ${where}: ${String(key)}`);
  return key;
}

/**
 * Drop every bookmaker that is not DraftKings or FanDuel from an Odds API payload (one event or a
 * list of events). The request already asks for the two books only; this is the second fence, so a
 * cached pre-conversion body, a provider change or a test fixture can never leak a third book into
 * a calculation. Events and markets are returned as given; only the `bookmakers` array is filtered.
 */
export function onlyAzBookmakers<T>(body: T): T {
  const one = (e: unknown): unknown => {
    if (!e || typeof e !== "object") return e;
    const ev = e as { bookmakers?: unknown };
    if (!Array.isArray(ev.bookmakers)) return e;
    return { ...ev, bookmakers: ev.bookmakers.filter((b) => isAzBook((b as { key?: unknown } | null)?.key)) };
  };
  return (Array.isArray(body) ? body.map(one) : one(body)) as T;
}

/**
 * HISTORY TAGGING. Old picks are never deleted or rewritten; each one is classified by the book it
 * was priced and settled at. A pick taken at any book other than the two is `legacy` and stays out
 * of every go-forward metric, chart and bankroll.
 *
 *   stamp   the ticket's / entry's / board's own `settlementBook` when it carries one
 *   date    the pick's card date (YYYY-MM-DD). Rows written before the settlement-book stamp
 *           existed were priced at Caesars up to and including 2026-09-16 and at DraftKings from
 *           2026-09-17 (INSTRUCTION 67) — the same rule src/lib/sportsbook/mlb.ts applies.
 */
export const DRAFTKINGS_SINCE = "2026-09-17";

export type BookTag = { book: string; legacy: boolean; inferred: boolean };

export function bookTagOf(stamp: string | null | undefined, date: string | null | undefined): BookTag {
  if (stamp) return { book: stamp, legacy: !isAzBook(stamp), inferred: false };
  if (date && date >= DRAFTKINGS_SINCE) return { book: "draftkings", legacy: false, inferred: true };
  return { book: "williamhill_us", legacy: true, inferred: true };
}
