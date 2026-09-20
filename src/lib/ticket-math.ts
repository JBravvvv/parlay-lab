/**
 * Parlay Builder sandbox (2026-07-24) — pure ticket math for the "mess around"
 * builder. Prices are the engine board's captured selected-book quotes; probabilities
 * are the engine's blended true win % per leg. The combined true % is the
 * NAIVE product (legs treated independent — same-game correlation is NOT
 * modeled here; the real Builder's sim-joint pricing stays the honest one).
 * Nothing here writes anywhere: sandbox tickets never enter the ledger.
 */

export type SandboxLeg = {
  cross?: import("./cross-sport").CrossLeg;
  quoteAt?: string;
  phase?: "pregame" | "live";
  id: string; // gkey|lkey|side — dedupe key
  label: string;
  sub: string;
  game: string;
  cz: number; // american — the Caesars price when posted, else the best price in the feed
  prob: number;
  /** Push probability in percentage points; a push returns this leg’s stake. */
  push?: number; // percent
  market: string;
  susp?: boolean;
  /** which book the price came from — "CZ" whenever Caesars posts it */
  book?: string | null;
  /** where `prob` came from: the engine's model, or the de-vigged market fair */
  src?: "model" | "market";
};

export const amToDec = (am: number): number => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);

export const decToAm = (dec: number): number =>
  dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1));

export const amFmt = (am: number): string => (am > 0 ? `+${am}` : String(am));

export type TicketCalc = {
  n: number;
  dec: number; // combined decimal odds
  am: number; // combined american
  trueProb: number; // 0–1, naive product of leg probs
  impProb: number; // 0–1, what the combined price implies
  ev: number; // independent expected return minus stake, including push refunds
  payout: (stake: number) => number; // total return incl. stake
};

export function combineTicket(legs: { cz: number; prob: number; push?: number }[]): TicketCalc | null {
  if (!legs.length) return null;
  let dec = 1;
  let p = 1;
  let expectedReturn = 1;
  const hasPush = legs.some(l => (l.push ?? 0) > 0);
  for (const l of legs) {
    dec *= amToDec(l.cz);
    const win = Math.min(1, Math.max(0, l.prob / 100));
    p *= win;
    expectedReturn *= win * amToDec(l.cz) + Math.min(1 - win, Math.max(0, (l.push ?? 0) / 100));
  }
  return {
    n: legs.length,
    dec,
    am: decToAm(dec),
    trueProb: p,
    impProb: 1 / dec,
    ev: (hasPush ? expectedReturn : p * dec) - 1,
    payout: (stake: number) => stake * dec,
  };
}
