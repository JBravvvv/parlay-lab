/**
 * Calibration & self-correction math (2026-07-17 spec, Update 3C/3D).
 * Pure functions — the cron route feeds graded predictions in and stores the
 * summary out; the UI only ever displays what this module computed.
 *
 * Honesty rules baked in:
 * - voids/pushes/pendings are EXCLUDED from calibration samples (they carry
 *   no information about whether a stated probability was right);
 * - flags and adjustments are decided by a 95% Wilson interval test, never a
 *   raw gap ("a 55% bucket hitting 51% over n=150 can be noise");
 * - the graduated tiers make small samples explicitly powerless.
 */

export type GradedPick = {
  market: string;
  p: number; // stated true probability, 0-100
  edge: number | null; // stated edge %, may be null
  lu: "confirmed" | "projected";
  res: "won" | "lost";
};

export const PROB_BUCKETS: [number, number][] = [
  [0, 30], [30, 40], [40, 50], [50, 55], [55, 60], [60, 65], [65, 70], [70, 80], [80, 101],
];
export const EDGE_BUCKETS: [number, number][] = [
  [-100, 0], [0, 5], [5, 10], [10, 20], [20, 1000],
];

export type Tier = "MONITOR" | "SOFT" | "HARD" | "ADJUST";

export function tierFor(n: number): Tier {
  if (n < 50) return "MONITOR";
  if (n < 100) return "SOFT";
  if (n < 150) return "HARD";
  return "ADJUST";
}

/** Wilson 95% score interval for a binomial proportion. */
export function wilson(won: number, n: number): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const phat = won / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export type BucketStat = {
  market: string;
  kind: "prob" | "edge";
  range: [number, number];
  lu: "all" | "confirmed" | "projected";
  n: number;
  predicted: number; // mean stated probability (0-1)
  actual: number; // realized hit rate (0-1)
  brier: number;
  ciLo: number;
  ciHi: number;
  tier: Tier;
  /* significant = predicted mean falls OUTSIDE the 95% CI of the actual rate */
  significant: boolean;
  direction: "hot" | "cold" | "ok"; // hot = overconfident (actual < predicted)
};

function bucketize(
  picks: GradedPick[],
  market: string,
  kind: "prob" | "edge",
  range: [number, number],
  lu: BucketStat["lu"],
): BucketStat | null {
  const sel = picks.filter((x) => {
    if (x.market !== market) return false;
    if (lu !== "all" && x.lu !== lu) return false;
    const v = kind === "prob" ? x.p : x.edge;
    if (v == null) return false;
    return v >= range[0] && v < range[1];
  });
  const n = sel.length;
  if (!n) return null;
  const won = sel.filter((x) => x.res === "won").length;
  const predicted = sel.reduce((a, x) => a + x.p, 0) / n / 100;
  const actual = won / n;
  const brier = sel.reduce((a, x) => {
    const y = x.res === "won" ? 1 : 0;
    const q = x.p / 100;
    return a + (q - y) * (q - y);
  }, 0) / n;
  const ci = wilson(won, n);
  const significant = predicted < ci.lo || predicted > ci.hi;
  return {
    market,
    kind,
    range,
    lu,
    n,
    predicted,
    actual,
    brier,
    ciLo: ci.lo,
    ciHi: ci.hi,
    tier: tierFor(n),
    significant,
    direction: !significant ? "ok" : actual < predicted ? "hot" : "cold",
  };
}

export type CalibrationSummary = {
  at: number;
  graded: number;
  markets: string[];
  buckets: BucketStat[];
  /* per-market rollup used for the one-line report + weights decision */
  perMarket: Record<
    string,
    { n: number; predicted: number; actual: number; brier: number; tier: Tier; significant: boolean; direction: "hot" | "cold" | "ok" }
  >;
  /* sanity breaker (any n>=30): stated edge 30%+ with actual below HALF the
     predicted rate → looks like a bug, not miscalibration. Quarantine. */
  quarantine: string[];
};

export function computeCalibration(picks: GradedPick[]): CalibrationSummary {
  const markets = [...new Set(picks.map((x) => x.market))].sort();
  const buckets: BucketStat[] = [];
  for (const m of markets) {
    for (const r of PROB_BUCKETS) {
      for (const lu of ["all", "confirmed", "projected"] as const) {
        const b = bucketize(picks, m, "prob", r, lu);
        if (b) buckets.push(b);
      }
    }
    for (const r of EDGE_BUCKETS) {
      const b = bucketize(picks, m, "edge", r, "all");
      if (b) buckets.push(b);
    }
  }
  const perMarket: CalibrationSummary["perMarket"] = {};
  for (const m of markets) {
    const sel = picks.filter((x) => x.market === m);
    const n = sel.length;
    const won = sel.filter((x) => x.res === "won").length;
    const predicted = n ? sel.reduce((a, x) => a + x.p, 0) / n / 100 : 0;
    const actual = n ? won / n : 0;
    const brier = n
      ? sel.reduce((a, x) => {
          const y = x.res === "won" ? 1 : 0;
          const q = x.p / 100;
          return a + (q - y) * (q - y);
        }, 0) / n
      : 0;
    const ci = wilson(won, n);
    const significant = n > 0 && (predicted < ci.lo || predicted > ci.hi);
    perMarket[m] = {
      n,
      predicted,
      actual,
      brier,
      tier: tierFor(n),
      significant,
      direction: !significant ? "ok" : actual < predicted ? "hot" : "cold",
    };
  }
  const quarantine: string[] = [];
  for (const m of markets) {
    const extreme = picks.filter((x) => x.market === m && x.edge != null && x.edge >= 30);
    if (extreme.length >= 30) {
      const won = extreme.filter((x) => x.res === "won").length;
      const predicted = extreme.reduce((a, x) => a + x.p, 0) / extreme.length / 100;
      if (won / extreme.length < predicted / 2) quarantine.push(m);
    }
  }
  return { at: Date.now(), graded: picks.length, markets, buckets, perMarket, quarantine };
}

/* ---------- 3D: weight adjustment (shrink-only, capped, weekly) ---------- */

export type WeightState = {
  mults: Record<string, number>; // per-market multiplier on the MODEL blend weight
  lastAdjust: number; // ms epoch of the last applied cycle
  log: {
    at: number;
    market: string;
    before: number;
    after: number;
    bucket: { n: number; predicted: number; actual: number };
  }[];
};

export const WEEK_MS = 7 * 24 * 3600 * 1000;
const STEP = 0.10; // ±10% relative change per weekly cycle
const MULT_FLOOR = 0.05 / 0.35; // model weight never below 5% absolute (props default 35%)

/**
 * One weekly adjustment cycle. Only markets whose FULL-market rollup is at
 * ADJUST tier AND CI-significant move; overconfident ("hot") markets shrink
 * 10%, well-calibrated markets drift 10% back toward 1.0. Never above 1.0 —
 * this system can only make the engine MORE market-anchored, never less.
 */
export function applyWeeklyAdjustment(summary: CalibrationSummary, state: WeightState, now: number): WeightState {
  if (now - state.lastAdjust < WEEK_MS) return state;
  const next: WeightState = { mults: { ...state.mults }, lastAdjust: now, log: [...state.log] };
  for (const m of summary.markets) {
    const pm = summary.perMarket[m];
    if (!pm || pm.tier !== "ADJUST") continue;
    const cur = next.mults[m] ?? 1;
    let after = cur;
    if (pm.significant && pm.direction === "hot") after = Math.max(MULT_FLOOR, cur * (1 - STEP));
    else if (!pm.significant && cur < 1) after = Math.min(1, cur * (1 + STEP));
    if (Math.abs(after - cur) > 1e-9) {
      next.mults[m] = after;
      next.log.push({
        at: now,
        market: m,
        before: cur,
        after,
        bucket: { n: pm.n, predicted: pm.predicted, actual: pm.actual },
      });
    }
  }
  return next;
}

/** The one-line daily report for The Sharp's overview. */
export function calibrationLine(summary: CalibrationSummary | null): string | null {
  if (!summary || !summary.graded) return null;
  const parts: string[] = [];
  const label: Record<string, string> = {
    ml: "ML", rl: "RL", batter_hits: "Hits", batter_total_bases: "TB", batter_home_runs: "HR",
    batter_hits_runs_rbis: "H+R+RBI", pitcher_strikeouts: "K props", pitcher_outs: "Outs",
  };
  for (const m of summary.markets) {
    const pm = summary.perMarket[m];
    if (!pm || pm.n < 20) continue;
    const name = label[m] ?? m;
    if (!pm.significant) parts.push(`${name} well-calibrated (n=${pm.n})`);
    else {
      const gap = Math.round(Math.abs(pm.predicted - pm.actual) * 100);
      const state = pm.direction === "hot" ? "hot" : "cold";
      const act = pm.tier === "ADJUST" ? "adjusting" : "below adjustment threshold — monitoring";
      parts.push(`${name} running ${gap}pts ${state} (n=${pm.n}, ${act})`);
    }
  }
  return parts.length ? `Calibration: ${parts.join(". ")}.` : null;
}
