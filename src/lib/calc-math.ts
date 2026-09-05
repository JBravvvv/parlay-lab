/**
 * PARLAY CALC MATH (INSTRUCTION 40, 2026-09-05). Pure functions behind app/calc — the
 * redesigned Parlay Calc instrument. Every number on that page comes from here, on the
 * user's OWN prices; nothing here quotes a price, so the never-fabricate rule has
 * nothing to touch.
 *
 * Conventions:
 *   - American odds are whole numbers with |x| ≥ 100 (books never post -99..+99).
 *   - Decimal odds are > 1 (1.00 is a push / void, not a price).
 *   - A PUSHED leg is removed from the parlay (the book voids it and the ticket pays on
 *     the remaining legs) — `activeLegs` drops decimals ≤ 1 and non-finite values.
 *   - Money is rounded to cents ONCE at the end, never per leg.
 */

/** +150 → 2.5 · -110 → 1.9091 · ±100 → 2 */
export function americanToDecimal(am: number): number {
  if (!Number.isFinite(am) || am === 0) return NaN;
  return am > 0 ? 1 + am / 100 : 1 + 100 / -am;
}

/** 2.5 → +150 · 1.9091 → -110 · 2 → +100. Decimal ≤ 1 has no American price → NaN. */
export function decimalToAmerican(dec: number): number {
  if (!Number.isFinite(dec) || dec <= 1) return NaN;
  return dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1);
}

/** The legs that still count: pushes (≤ 1) and junk are removed. */
export function activeLegs(decimals: readonly number[]): number[] {
  return decimals.filter((d) => Number.isFinite(d) && d > 1);
}

/** Product of the active leg decimals; empty → 1 (a ticket with no live legs pays the stake back). */
export function parlayDecimal(decimals: readonly number[]): number {
  return activeLegs(decimals).reduce((a, d) => a * d, 1);
}

/** Implied (vig-included) probability of a price, 0..1. Accepts a decimal price. */
export function impliedProb(dec: number): number {
  if (!Number.isFinite(dec) || dec <= 0) return NaN;
  return 1 / dec;
}

/** Implied probability straight from an American number. */
export function impliedProbAmerican(am: number): number {
  return impliedProb(americanToDecimal(am));
}

/** Total return if every leg hits — stake included — to the cent. */
export function payout(stake: number, dec: number): number {
  if (!(stake > 0) || !Number.isFinite(dec) || dec < 1) return 0;
  return Math.round(stake * dec * 100) / 100;
}

/** Profit if every leg hits — payout minus stake — to the cent. */
export function profit(stake: number, dec: number): number {
  if (!(stake > 0) || !Number.isFinite(dec) || dec < 1) return 0;
  return Math.round((stake * dec - stake) * 100) / 100;
}

/**
 * Expected value per $1 staked, as a percent, given the bettor's own probability that
 * the whole ticket hits: (p × dec − 1) × 100. p = 1/dec (the implied line) → 0%.
 */
export function evPct(trueProb: number, dec: number): number {
  if (!Number.isFinite(trueProb) || !Number.isFinite(dec) || trueProb < 0 || trueProb > 1 || dec <= 0) return NaN;
  return (trueProb * dec - 1) * 100;
}

/** Product of per-leg confidences (0..1). Empty → NaN (nothing to multiply). */
export function jointProb(confidences: readonly number[]): number {
  if (confidences.length === 0) return NaN;
  if (confidences.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) return NaN;
  return confidences.reduce((a, c) => a * c, 1);
}

export type LadderRung = {
  /** how many legs are on this rung */
  legs: number;
  decimal: number;
  american: number;
  pays: number;
  wins: number;
};

/**
 * Payout ladder: the ticket at 2, 3, 4 … N legs (cumulative, in the order the legs were
 * entered — the same legs the bettor typed, nothing reordered). Pushes are removed first.
 * Fewer active legs than `minLegs` → an empty ladder.
 */
export function ladder(stake: number, decimals: readonly number[], minLegs = 2): LadderRung[] {
  const live = activeLegs(decimals);
  const out: LadderRung[] = [];
  let acc = 1;
  for (let i = 0; i < live.length; i++) {
    acc *= live[i];
    const n = i + 1;
    if (n < minLegs) continue;
    out.push({ legs: n, decimal: acc, american: decimalToAmerican(acc), pays: payout(stake, acc), wins: profit(stake, acc) });
  }
  return out;
}

export type ParsedOdds = {
  american: number;
  decimal: number;
  /** which spelling the user typed */
  kind: "american" | "decimal";
};

/**
 * One box, either spelling: "+150" / "-110" / "150" (American) or "2.50" / "1.91"
 * (decimal — anything with a point, or a signless whole number that cannot be American).
 * Rules:
 *   - a sign, or a signless whole number ≥ 100, is American (|x| ≥ 100 only)
 *   - a number with a decimal point is decimal (must be > 1.00; capped at 1000)
 *   - a signless whole number under 100 is incomplete typing, not a price → null
 */
export function parseOdds(raw: string): ParsedOdds | null {
  const t = raw.trim();
  if (t === "") return null;
  if (/^[+-]?\d+$/.test(t)) {
    const v = Number(t);
    if (Math.abs(v) < 100) return null;
    return { american: v, decimal: americanToDecimal(v), kind: "american" };
  }
  if (/^\d+\.\d*$/.test(t) || /^\.\d+$/.test(t)) {
    const d = Number(t);
    if (!Number.isFinite(d) || d <= 1 || d > 1000) return null;
    return { american: decimalToAmerican(d), decimal: d, kind: "decimal" };
  }
  return null;
}

/**
 * "45" or "45%" → 0.45 (a per-leg confidence). The field is a PERCENT: every number 0..100 is
 * read as a percent — "1" is one percent, "1.5" is 1.5 % — so the first keystroke of "15" never
 * reads as a certainty. Only a value spelt as a fraction with a leading "0." or "." ("0.45",
 * ".45") is taken as-is. Anything outside 0..100 → null.
 */
export function parseConfidence(raw: string): number | null {
  const t = raw.trim().replace(/%$/, "");
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  if (/^0?\.\d+$/.test(t)) return v; // "0.45" / ".45" — an explicit fraction, already 0..1
  if (v >= 0 && v <= 100) return v / 100;
  return null;
}

/** "2.50" — decimal odds to two places. */
export function fmtDecimal(dec: number): string {
  return Number.isFinite(dec) ? dec.toFixed(2) : "—";
}

/** "$36.45" — cents always shown. */
export function fmtCents(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "+264" / "-110" from a possibly-fractional American number. */
export function fmtAmericanOdds(am: number): string {
  if (!Number.isFinite(am)) return "—";
  const n = Math.round(am);
  return n > 0 ? `+${n}` : `${n}`;
}

/** The share/copy text — plain, book-style, nothing but the user's own numbers. */
export function summaryText(input: {
  stake: number;
  legs: readonly { label: string; american: number }[];
  decimal: number;
  american: number;
  pays: number;
  wins: number;
  impliedProb: number;
}): string {
  const lines = [
    `Parlay Lab · ${input.legs.length}-leg parlay`,
    ...input.legs.map((l, i) => `Leg ${i + 1}: ${l.label ? `${l.label} ` : ""}${fmtAmericanOdds(l.american)}`),
    `Odds: ${fmtAmericanOdds(input.american)} (${fmtDecimal(input.decimal)}x) · implied ${(input.impliedProb * 100).toFixed(1)}%`,
    `Stake ${fmtCents(input.stake)} → pays ${fmtCents(input.pays)} (wins ${fmtCents(input.wins)})`,
  ];
  return lines.join("\n");
}
