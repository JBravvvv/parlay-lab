import { reopenDays } from "@/lib/gate-rebuild";

/**
 * DAILY FULL-POPULATION GRADING — labels, cadence, progress (2026-08-06, operator
 * requirement: 150+/market in days, not months).
 *
 * Three pure pieces the routes share, each guarded by tests/daily-grading.test.ts:
 *
 *  - labelPopulation: selected / unselected / shadow. The HRR lesson encoded — fits and
 *    reviews read LABELED populations, never pooled silently. SHADOW OUTRANKS SELECTED:
 *    a suspended market's row is shadow even when an lkey collision matches a locked leg
 *    (suspension is a property of the market, not of the match).
 *  - decideGradePass: the scheduler's grading ticks — the FIRST tick of hour 15 UTC
 *    (next morning: everything settled) and hour 2 UTC (same night: east-coast finals).
 *    Two passes/day x MAX_BOX_FETCHES=14 covers a full slate; the fire path is untouched.
 *  - buildProgress: the LEARNING PROGRESS artifact — per-market graded n, hit rate vs
 *    implied, by-population split, days-to-150 at the measured 7-day rate. Vacuity rule:
 *    an empty settled population declares itself. Contradictions (a stored grade a fresh
 *    boxscore disagrees with — the impossible branch) ride the artifact LOUDLY.
 */

export const PROGRESS_KEY = "pl:grade:progress";
/** the operator's threshold: 150+ graded per market before the fit is trusted */
export const MARKET_MIN_N = 150;
/** first tick of these UTC hours runs a grade-only pass (ticker: every 15 min, hours 15-23,0-2) */
export const GRADE_HOURS = [15, 2] as const;

export type Pop = "selected" | "unselected" | "shadow";

export type SelectedMatcher = (lkey: string | null | undefined, label: string | null | undefined) => boolean;

type LockLike = { core?: { legs?: { lkey?: string | null; label?: string | null }[] }[] } | null;

/** Build a matcher from the day's locked card. ML/RL lkeys (`ml_home` form) collide
 *  across games, so those require the LABEL to match as well; prop lkeys carry the
 *  player name and match alone. */
export function makeSelectedMatcher(lock: LockLike): SelectedMatcher {
  const propKeys = new Set<string>();
  const gameKeys = new Set<string>(); // `${lkey}|${label}` for ml_/rl_
  for (const t of lock?.core ?? []) {
    for (const l of t.legs ?? []) {
      const k = l.lkey ?? "";
      if (!k) continue;
      if (k.startsWith("ml_") || k.startsWith("rl_")) gameKeys.add(`${k}|${l.label ?? ""}`);
      else propKeys.add(k);
    }
  }
  return (lkey, label) => {
    const k = lkey ?? "";
    if (!k) return false;
    if (k.startsWith("ml_") || k.startsWith("rl_")) return gameKeys.has(`${k}|${label ?? ""}`);
    return propKeys.has(k);
  };
}

export function labelPopulation(
  rec: { lkey?: string | null; label?: string | null; susp?: boolean },
  selected: SelectedMatcher,
): Pop {
  if (rec.susp) return "shadow"; // outranks selected, by design
  return selected(rec.lkey, rec.label) ? "selected" : "unselected";
}

/** The scheduler's grading cadence — pure, so the guard exercises it without a server. */
export function decideGradePass(nowMs: number): { fire: boolean; reason: string } {
  const d = new Date(nowMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if ((GRADE_HOURS as readonly number[]).includes(h) && m < 15) {
    return { fire: true, reason: `first tick of grading hour ${h}:00Z` };
  }
  return { fire: false, reason: `not a grading tick (grading runs on the first tick of hours ${GRADE_HOURS.join("/")} UTC)` };
}

type PickLike = { market: string; res: "won" | "lost"; pMkt?: number | null; p?: number; pop?: string };
type PerDay = { date: string; byMarket: Record<string, number>; n: number };

export type Progress = {
  at: number;
  /** which code wrote it — the stale-summary class; stamped by the calibrate route */
  rev?: string;
  need: number;
  perMarket: Record<
    string,
    {
      n: number;
      hits: number;
      hitRate: number | null;
      /** mean implied probability (0-1): pMkt where logged, model p as fallback — source counted */
      impliedMean: number | null;
      impliedFromPMkt: number;
      byPop: { selected: number; unselected: number; shadow: number };
      hitRateByPop: { selected: number | null; unselected: number | null; shadow: number | null };
      perDay7: number;
      need: number;
      daysTo150: number | null;
    }
  >;
  rateDays: number;
  contradictions: number;
  flag?: string;
  vacuous?: string;
};

export function buildProgress(picks: PickLike[], perDay: PerDay[], today: string, now: number, contradictions: number): Progress {
  const out: Progress = { at: now, need: MARKET_MIN_N, perMarket: {}, rateDays: 0, contradictions };
  if (contradictions > 0) {
    out.flag = `🔴 IMPOSSIBLE BRANCH: ${contradictions} graded row(s) contradict a fresh statsapi boxscore — stored grades were NOT overwritten; both readings are in the calibrate log. STOP AND READ.`;
  }
  if (!picks.length) {
    out.vacuous = "VACUOUS — zero settled graded rows; every per-market check below has no population";
    return out;
  }
  const complete = perDay.filter((d) => d.date < today);
  const window7 = complete.slice(-7);
  out.rateDays = window7.length;

  const markets = new Map<string, PickLike[]>();
  for (const p of picks) {
    if (!markets.has(p.market)) markets.set(p.market, []);
    markets.get(p.market)!.push(p);
  }
  for (const [m, rows] of markets) {
    const hits = rows.filter((r) => r.res === "won").length;
    const withImplied = rows.map((r) => ({ v: r.pMkt ?? r.p ?? null, fromPMkt: r.pMkt != null })).filter((x) => x.v != null);
    const byPop = { selected: 0, unselected: 0, shadow: 0 };
    const hitsByPop = { selected: 0, unselected: 0, shadow: 0 };
    for (const r of rows) {
      const pop = (r.pop === "selected" || r.pop === "unselected" || r.pop === "shadow" ? r.pop : null) as Pop | null;
      if (pop) {
        byPop[pop]++;
        if (r.res === "won") hitsByPop[pop]++;
      }
    }
    const rate = out.rateDays ? window7.reduce((a, d) => a + (d.byMarket[m] ?? 0), 0) / out.rateDays : 0;
    out.perMarket[m] = {
      n: rows.length,
      hits,
      hitRate: rows.length ? hits / rows.length : null,
      impliedMean: withImplied.length ? withImplied.reduce((a, x) => a + (x.v as number), 0) / withImplied.length / 100 : null,
      impliedFromPMkt: withImplied.filter((x) => x.fromPMkt).length,
      byPop,
      hitRateByPop: {
        selected: byPop.selected ? hitsByPop.selected / byPop.selected : null,
        unselected: byPop.unselected ? hitsByPop.unselected / byPop.unselected : null,
        shadow: byPop.shadow ? hitsByPop.shadow / byPop.shadow : null,
      },
      perDay7: Math.round(rate * 100) / 100,
      need: MARKET_MIN_N,
      daysTo150: reopenDays(rows.length, rate, MARKET_MIN_N),
    };
  }
  return out;
}
