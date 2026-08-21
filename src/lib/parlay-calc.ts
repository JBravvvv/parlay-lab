import { amToDec } from "@/lib/format";

/**
 * PARLAY CALCULATOR MATH (2026-08-20, Josh's word: a tab where any stake plus a line
 * of American odds per leg computes what the ticket WINS (profit) and PAYS (total
 * return, stake included). Pure math on the user's own numbers — the calculator never
 * quotes a price of its own, so the never-fabricate rule has nothing to touch here.
 */

/**
 * "+150", "150", "-110" → the American number. Integers only (books quote whole
 * numbers), and nothing inside ±100 — no book posts a price between -99 and +99,
 * so those are typos, not odds.
 */
export function parseAmerican(raw: string): number | null {
  const t = raw.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const v = Number(t);
  if (Math.abs(v) < 100) return null;
  return v;
}

export type ParlayQuote = {
  /** combined decimal odds (product of leg decimals) */
  dec: number;
  /** the combined price as an American number */
  american: number;
  /** total return if every leg hits — stake included */
  pays: number;
  /** profit if every leg hits — pays minus stake */
  wins: number;
};

/** Stake × the product of leg decimals; cents rounded once at the end, never per leg. */
export function quoteParlay(stake: number, legs: number[]): ParlayQuote | null {
  if (!(stake > 0) || legs.length < 1) return null;
  const dec = legs.reduce((a, am) => a * amToDec(am), 1);
  const gross = stake * dec;
  const american = dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1);
  return {
    dec,
    american,
    pays: Math.round(gross * 100) / 100,
    wins: Math.round((gross - stake) * 100) / 100,
  };
}
