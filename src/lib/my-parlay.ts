/**
 * INSTRUCTION 71 (2026-09-17, Josh): "there should be an option there or parlay generator to see
 * the edge % on any parlay that i personally generate/create using the metrics used by the engine
 * to generate its own parlays."
 *
 * The engine prices a ticket as prob × decimal − 1 with each leg's blended true win % and the
 * selected book's American price (legacy buildParlaySet → evT; the Builder's combineTicket in
 * ticket-math.ts is the same arithmetic). This module is the pure half of the Board's "My parlay"
 * bar: a leg list assembled by tapping rows, priced with EXACTLY that arithmetic. The one thing
 * the engine does that this cannot is its sim-joint same-game repricing (armed runs only) — so
 * same-game pairs are named out loud on the bar instead of silently treated as independent, and
 * a third leg from one game is flagged against the engine's own cap (PARLAY_VARIETY.parlayGameCap).
 * Nothing here writes anywhere: a "my parlay" never enters the ledger.
 */
import { amToDec, combineTicket, decToAm, type TicketCalc } from "@/lib/ticket-math";

export type MyLeg = {
  /** dedupe key — the row's `${label}|${sub}` on the Board, the ticket leg's `${label}|${prop}` */
  key: string;
  label: string;
  sub: string;
  gkey?: string | null;
  /** American price at the selected sportsbook; null when the book doesn't post the leg */
  odds: number | null;
  /** the engine's blended true win %, in percent; null when the row carries none */
  prob: number | null;
};

export const MY_PARLAY_MAX = 10;

/** parse an American price the way the Board's Odds column does ("+150", "-102", 150, null) */
export function parseAm(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export type MyParlayRead = {
  n: number;
  /** legs the selected book prices AND the engine has a true % for — the only ones the math can use */
  priced: MyLeg[];
  /** legs left out of the math, with why */
  skipped: { leg: MyLeg; why: "no price at this book" | "no model probability" }[];
  calc: TicketCalc | null;
  /** fair American price of the priced legs, from the naive true % */
  fairAm: number | null;
  /** games contributing two legs (the engine's sim-joint correction is NOT applied here) */
  sameGame: { gkey: string; n: number }[];
  /** games contributing MORE legs than the engine's own cap allows on its tickets */
  overCap: { gkey: string; n: number }[];
};

export function readMyParlay(legs: MyLeg[], gameCap = 2): MyParlayRead {
  const priced: MyLeg[] = [];
  const skipped: MyParlayRead["skipped"] = [];
  for (const l of legs) {
    if (l.odds == null) skipped.push({ leg: l, why: "no price at this book" });
    else if (l.prob == null || !Number.isFinite(l.prob)) skipped.push({ leg: l, why: "no model probability" });
    else priced.push(l);
  }
  const calc = priced.length ? combineTicket(priced.map((l) => ({ cz: l.odds as number, prob: l.prob as number }))) : null;
  const byGame = new Map<string, number>();
  for (const l of legs) if (l.gkey) byGame.set(l.gkey, (byGame.get(l.gkey) ?? 0) + 1);
  const sameGame = [...byGame].filter(([, n]) => n >= 2).map(([gkey, n]) => ({ gkey, n }));
  return {
    n: legs.length,
    priced,
    skipped,
    calc,
    fairAm: calc && calc.trueProb > 0 ? decToAm(1 / calc.trueProb) : null,
    sameGame,
    overCap: sameGame.filter((g) => g.n > gameCap),
  };
}

/** what the engine writes on its own tickets: "EV +3%" / "EV −7.5%" — percent, one decimal when needed */
export function evPct(ev: number): string {
  const p = Math.round(ev * 1000) / 10;
  return `${p > 0 ? "+" : ""}${p}%`;
}

export { amToDec };
