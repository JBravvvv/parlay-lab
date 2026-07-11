/** Number formatting — numbers are the product; keep them consistent everywhere. */

/** American odds: +145 / -310. */
export function fmtAmerican(odds: number): string {
  const n = Math.round(odds);
  return n > 0 ? `+${n}` : `${n}`;
}

/** Probability 0..1 -> "31.4%". */
export function fmtPct(p: number, dp = 1): string {
  return `${(p * 100).toFixed(dp)}%`;
}

/** EV as a signed percentage: "+4.2%" / "-1.8%". */
export function fmtEv(evPct: number, dp = 1): string {
  const s = evPct.toFixed(dp);
  return evPct > 0 ? `+${s}%` : `${s}%`;
}

/** Whole-dollar money: "$37" / "-$12". Stakes are always whole dollars. */
export function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

/** Money with cents for P/L readouts: "+$41.20". */
export function fmtMoneyExact(n: number): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** American odds -> decimal. */
export function amToDec(am: number): number {
  return am > 0 ? 1 + am / 100 : 1 + 100 / -am;
}

/** American odds -> implied probability 0..1 (vig included). */
export function amToImplied(am: number): number {
  return am > 0 ? 100 / (am + 100) : -am / (-am + 100);
}
