import { AZ_BOOKS, type AzBook } from "@/lib/az/books";
import { devig, type DevigMethod } from "@/engine2/devig";

/**
 * TWO-BOOK MARKET MATH. Market probability, vig removal, line shopping and edge, computed from
 * DraftKings and FanDuel prices ONLY. No consensus, no average and no "best line" here can include
 * a third book, because the only inputs this file accepts are keyed by `AzBook`.
 *
 * Everything is per SELECTION AT ONE EXACT LINE. A book that hangs a different number (DraftKings
 * -2.5 while FanDuel has -3) is not quoting the same bet, so it is not in that selection's quotes:
 * it is a separate selection of its own.
 *
 * Pure. No fetch, no store, no clock.
 */

/** How the hold is taken out of one book's two-way price. Shin is the existing MLB engine's
    per-book method; with two outcomes it sits between proportional and additive. It is a stated
    assumption, NOT a fitted one: nothing here has been tuned on DraftKings or FanDuel history. */
export const AZ_DEVIG: DevigMethod = "shin";

export const isAm = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) >= 100;
export const amDec = (am: number): number => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
export const amImplied = (am: number): number => 1 / amDec(am);

/** One book's quote on a selection: its price, and its price on the opposite side at the same line. */
export type AzSideQuote = {
  /** American price on this selection. */
  price: number;
  /** American price on the opposite side at the SAME line; null when the book posts one side only. */
  opp: number | null;
  /** The book's own last-update time for this market (ISO), when the feed carries one. */
  at?: string | null;
};
export type AzQuotes = Partial<Record<AzBook, AzSideQuote>>;

export type NoVig = { p: number; hold: number };

/** One book's no-vig probability for a two-way price. Null when either side is missing or invalid:
    a one-sided market (anytime TD, a yes-only HR) has no no-vig price and is never guessed at. */
export function noVig(price: number | null | undefined, opp: number | null | undefined, method: DevigMethod = AZ_DEVIG): NoVig | null {
  if (!isAm(price) || !isAm(opp)) return null;
  const a = amImplied(price);
  const b = amImplied(opp);
  const hold = a + b - 1;
  /* a book paying out more than it takes is an arbitrage or a broken quote; refuse it */
  if (hold < -0.02) return null;
  const [p] = devig([a, b], method);
  return Number.isFinite(p) && p > 0 && p < 1 ? { p, hold } : null;
}

export type AzFair = {
  /** No-vig probability of the selection (conditional on no push), from the two books only. */
  p: number;
  /** How many of the two books had a two-sided price at this line: 1 or 2. */
  n: 1 | 2;
  byBook: Partial<Record<AzBook, NoVig>>;
};

/**
 * The market's no-vig probability: the MEAN of DraftKings' and FanDuel's own no-vig numbers when
 * both post both sides, else the one book's. (The old weighted median over many books returns the
 * LOWER of two values when only two books are left; a mean is the honest two-book consensus.)
 */
export function azFair(quotes: AzQuotes, method: DevigMethod = AZ_DEVIG): AzFair | null {
  const byBook: Partial<Record<AzBook, NoVig>> = {};
  let sum = 0;
  let n = 0;
  for (const book of AZ_BOOKS) {
    const q = quotes[book];
    if (!q) continue;
    const nv = noVig(q.price, q.opp, method);
    if (!nv) continue;
    byBook[book] = nv;
    sum += nv.p;
    n++;
  }
  if (!n) return null;
  return { p: sum / n, n: n as 1 | 2, byBook };
}

export type AzBest = {
  book: AzBook;
  price: number;
  dec: number;
  /** The other book's price on the same selection at the same line, when it has one. */
  otherBook: AzBook;
  otherPrice: number | null;
};

/** Line shopping between the two books: the higher payout wins; DraftKings on a tie. */
export function azBest(quotes: AzQuotes): AzBest | null {
  let best: AzBook | null = null;
  for (const book of AZ_BOOKS) {
    const q = quotes[book];
    if (!q || !isAm(q.price)) continue;
    if (best == null || amDec(q.price) > amDec(quotes[best]!.price)) best = book;
  }
  if (!best) return null;
  const otherBook: AzBook = best === "draftkings" ? "fanduel" : "draftkings";
  const o = quotes[otherBook];
  return { book: best, price: quotes[best]!.price, dec: amDec(quotes[best]!.price), otherBook, otherPrice: o && isAm(o.price) ? o.price : null };
}

/** The price at ONE named book (same-book parlays, same-book closing line value). */
export function azAt(quotes: AzQuotes, book: AzBook): { price: number; dec: number } | null {
  const q = quotes[book];
  return q && isAm(q.price) ? { price: q.price, dec: amDec(q.price) } : null;
}

export type ModelProb = {
  /** Unconditional probability the selection wins. */
  win: number;
  /** Unconditional probability of a push (stake returned). 0 on half-point lines and moneylines. */
  push: number;
};

export type AzEdge = {
  fair: AzFair | null;
  best: AzBest;
  /** Model win probability conditional on no push (comparable with `fair.p`). */
  modelP: number;
  /** Model minus market, in probability points (0.031 = 3.1 points). Null without a two-sided market. */
  edge: number | null;
  /** Expected profit per 1 staked at the best price, by the MODEL's probability. */
  ev: number;
  /** Expected profit per 1 staked at the best price, by the two-book NO-VIG probability: the
      model-free line-shopping edge. Positive only when one book pays more than the two books'
      own fair number says it should. Null without a two-sided market. */
  priceEv: number | null;
  /** Full-Kelly fraction of bankroll by the model's probability at the best price (0 when EV <= 0). */
  kelly: number;
};

export function validModel(m: ModelProb | null | undefined): m is ModelProb {
  return !!m && Number.isFinite(m.win) && Number.isFinite(m.push) && m.win > 0 && m.win < 1 && m.push >= 0 && m.push < 1 && m.win + m.push <= 1.000001;
}

/** Expected profit per 1 staked: win pays dec-1, a push returns the stake, a loss costs 1. */
export function evOf(win: number, push: number, dec: number): number {
  return win * dec + push - 1;
}

/** Full Kelly for a win / push / lose bet: f* = (w*b - l) / (b * (w + l)), b = dec - 1. */
export function kellyOf(win: number, push: number, dec: number): number {
  const b = dec - 1;
  const lose = Math.max(0, 1 - win - push);
  if (!(b > 0) || !(win + lose > 0)) return 0;
  return Math.max(0, (win * b - lose) / (b * (win + lose)));
}

/** Everything a pick needs to know about one selection, at the better of the two books. */
export function azEdge(model: ModelProb, quotes: AzQuotes, method: DevigMethod = AZ_DEVIG): AzEdge | null {
  if (!validModel(model)) return null;
  const best = azBest(quotes);
  if (!best) return null;
  return azEdgeAt(model, quotes, best, method);
}

/** The same, at one NAMED book (used when a parlay must stay inside one book). */
export function azEdgeAtBook(model: ModelProb, quotes: AzQuotes, book: AzBook, method: DevigMethod = AZ_DEVIG): AzEdge | null {
  if (!validModel(model)) return null;
  const at = azAt(quotes, book);
  if (!at) return null;
  const otherBook: AzBook = book === "draftkings" ? "fanduel" : "draftkings";
  const o = quotes[otherBook];
  return azEdgeAt(model, quotes, { book, price: at.price, dec: at.dec, otherBook, otherPrice: o && isAm(o.price) ? o.price : null }, method);
}

function azEdgeAt(model: ModelProb, quotes: AzQuotes, best: AzBest, method: DevigMethod): AzEdge {
  const fair = azFair(quotes, method);
  const live = 1 - model.push;
  const modelP = model.win / live;
  return {
    fair,
    best,
    modelP,
    edge: fair ? modelP - fair.p : null,
    ev: evOf(model.win, model.push, best.dec),
    priceEv: fair ? evOf(fair.p * live, model.push, best.dec) : null,
    kelly: kellyOf(model.win, model.push, best.dec),
  };
}

/** Closing line value of a taken price against a closing no-vig probability: what the bet was
    worth, per 1 staked, at the close's own fair number. Positive = beat the close. */
export function clvOf(takenAm: number, closeFair: number): number | null {
  if (!isAm(takenAm) || !(closeFair > 0 && closeFair < 1)) return null;
  return closeFair * amDec(takenAm) - 1;
}

/** Price-only CLV: the taken payout against the same book's closing payout on the same selection. */
export function priceClvOf(takenAm: number, closeAm: number | null | undefined): number | null {
  if (!isAm(takenAm) || !isAm(closeAm)) return null;
  return amDec(takenAm) / amDec(closeAm) - 1;
}
