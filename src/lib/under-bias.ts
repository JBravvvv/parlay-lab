/**
 * THE UNDER BIAS (2026-08-16, Josh's word: outs unders "not included very often";
 * "overs to have a 75% bias for use vs 25% bias to unders for use in parlays. I don't
 * want as many unders").
 *
 * THE DATA (3 served days, 619 graded picks, read 2026-08-16): outs unders 20-28
 * (41.7% vs 49.6% model), 48 of 58 outs picks; unders as a class 5–9 points below
 * model while overs run at/above. The weekly calibration fit is PER-MARKET — side-blind
 * by construction — so outs already carried the maximum shrink (mult 0.143) and unders
 * still cleared the gate. This module is the side-aware layer the fit cannot be.
 *
 * Pure functions; lock-card composes them: pruneOutsUnder shapes the paper pool
 * (outs-under tickets out unless the slate cannot otherwise seat the day's minimum),
 * underStats measures the staked card's under share for the ≤25% quota loop.
 * Side comes from the leg's own prop text ("Hits U 1.5" — the production vocabulary,
 * pinned by the live-vocabulary guards); market from the 3-part `player|market|line`
 * lkey. ML/RL legs have no side and never enter the denominator.
 */

export const UNDER_BIAS = { overShare: 0.75, since: "2026-08-16" } as const;

export type BiasLeg = { lkey?: string | null; prop?: string | null; label?: string | null };
export type BiasTicket = { name?: string | null; czEv?: number | string | null; legs: BiasLeg[] };

/** "o" / "u" for sided prop legs; null for ML/RL and anything sideless. */
export function legSide(l: BiasLeg): "o" | "u" | null {
  const lk = String(l.lkey ?? "");
  if (lk.split("|").length !== 3) return null; // props are player|market|line; ml_/rl_ are not
  const prop = ` ${String(l.prop ?? "")} `;
  if (prop.includes(" U ")) return "u";
  if (prop.includes(" O ")) return "o";
  return null;
}

export function legMarket(l: BiasLeg): string | null {
  const parts = String(l.lkey ?? "").split("|");
  return parts.length === 3 ? parts[1] : null;
}

const isOutsUnder = (l: BiasLeg) => legMarket(l) === "pitcher_outs" && legSide(l) === "u";

const underCount = (t: BiasTicket) => t.legs.filter((l) => legSide(l) === "u").length;

/** The quota's measurement: unders over SIDED prop legs, across the whole card. */
export function underStats(tickets: BiasTicket[]): { propLegs: number; underLegs: number; share: number } {
  let propLegs = 0;
  let underLegs = 0;
  for (const t of tickets) {
    for (const l of t.legs) {
      const s = legSide(l);
      if (s == null) continue;
      propLegs++;
      if (s === "u") underLegs++;
    }
  }
  return { propLegs, underLegs, share: propLegs > 0 ? underLegs / propLegs : 0 };
}

/**
 * Rule 1 — outs unders leave the pool; "not very often" means they return ONLY when
 * the remainder cannot seat `minSeats` tickets, least-under-heavy first (deterministic
 * tiebreaks: fewer unders, higher czEv, name).
 */
export function pruneOutsUnder<T extends BiasTicket>(
  pool: T[],
  minSeats: number,
): { pool: T[]; dropped: number; readmitted: number } {
  const clean = pool.filter((t) => !t.legs.some(isOutsUnder));
  const cut = pool.filter((t) => t.legs.some(isOutsUnder));
  if (!cut.length) return { pool: clean, dropped: 0, readmitted: 0 };
  let out = clean;
  let readmitted = 0;
  if (clean.length < minSeats) {
    const ranked = [...cut].sort(
      (a, b) =>
        underCount(a) - underCount(b) ||
        (Number(b.czEv ?? -999) || -999) - (Number(a.czEv ?? -999) || -999) ||
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
    );
    readmitted = Math.min(minSeats - clean.length, ranked.length);
    out = [...clean, ...ranked.slice(0, readmitted)];
  }
  return { pool: out, dropped: cut.length - readmitted, readmitted };
}

/** The quota loop's eviction choice: most under legs, then lowest czEv, then name. */
export function worstUnderTicket<T extends BiasTicket>(tickets: T[]): T | null {
  const carriers = tickets.filter((t) => underCount(t) > 0);
  if (!carriers.length) return null;
  return carriers.sort(
    (a, b) =>
      underCount(b) - underCount(a) ||
      (Number(a.czEv ?? 999) || 999) - (Number(b.czEv ?? 999) || 999) ||
      String(a.name ?? "").localeCompare(String(b.name ?? "")),
  )[0];
}
