import type { SyncEntry } from "./ledger-merge";
import { marketOf } from "./ledger-segments";

/**
 * Hardening Phase 2 — the CLV report. Closing line value is the scoreboard
 * that means something at our volume: W/L needs months, CLV needs weeks.
 *
 * Definitions (see docs/clv.md):
 * - fairPts  = 100 × (closing de-vigged consensus fair − locked de-vigged
 *   consensus fair), both for the side we bet. Positive = the market moved
 *   toward our side after lock — we beat the close.
 * - czCents  = locked Caesars price − closing Caesars price on a continuous
 *   cents scale (american odds with the ±100 seam removed: −105 ↦ 95,
 *   +105 ↦ 105). Positive = the price we locked was better than the close.
 *
 * The "close" is the last pre-pitch sighting the /api/clv job captured — the
 * job structurally cannot sight a started game, so every sighting is honestly
 * pre-close-or-earlier and is marked with its capture time. NOTHING is
 * backfilled: a leg enters a column only when both of that column's inputs
 * were stored live (locked fair + closing fair for fairPts; locked CZ +
 * closing CZ for czCents). Historical legs without them simply stay out.
 */

export type ClvLegRow = {
  date: string;
  lid: string;
  market: string;
  tier: "core" | "fun";
  dir: "O" | "U";
  mode: string | null; // entry.selMode — stamped at lock from this deploy on
  fairPts: number | null;
  czCents: number | null;
  closeAt: number; // when the closing snapshot was taken (last look pre-pitch)
};

export type ClvFilter = {
  market?: string | null;
  tier?: "core" | "fun" | null;
  dir?: "O" | "U" | null;
  mode?: string | null;
};

type Leg = { label?: string; prop?: string; lkey?: string | null; cz?: number | null; imp?: number | string | null };
type Ticket = { legs?: Leg[] };
type Sight = { am?: number | null; at?: number; consensusFair?: number | null };

/** American odds on a continuous cents scale: −100/+100 meet at 100. */
export const centsScale = (am: number): number => (am > 0 ? am : am + 200);

export function clvLegRows(entries: SyncEntry[]): ClvLegRow[] {
  const out: ClvLegRow[] = [];
  for (const e of entries) {
    if (!e.locked) continue;
    const clv = (e.clv ?? {}) as Record<string, Sight>;
    const mode = typeof (e as { selMode?: unknown }).selMode === "string" ? ((e as { selMode?: string }).selMode as string) : null;
    const seen = new Set<string>();
    for (const tier of ["core", "fun"] as const) {
      for (const t of ((tier === "core" ? e.core : e.funT) as Ticket[]) ?? []) {
        for (const l of t.legs ?? []) {
          if (!l.label || !l.prop || !l.lkey) continue;
          const lid = `${l.label}|${l.prop}`;
          if (seen.has(lid)) continue;
          seen.add(lid);
          const s = clv[lid];
          if (!s || typeof s.am !== "number") continue; // no closing snapshot → not in the dataset
          const lockedFair = l.imp != null && isFinite(Number(l.imp)) ? Number(l.imp) : null; // percent, side-oriented
          const fairPts =
            lockedFair != null && s.consensusFair != null ? s.consensusFair * 100 - lockedFair : null;
          const czCents = typeof l.cz === "number" ? centsScale(l.cz) - centsScale(s.am) : null;
          if (fairPts == null && czCents == null) continue;
          out.push({
            date: e.date,
            lid,
            market: marketOf(l.lkey),
            tier,
            dir: / U /.test(l.prop) ? "U" : "O",
            mode,
            fairPts: fairPts != null ? Math.round(fairPts * 100) / 100 : null,
            czCents: czCents != null ? Math.round(czCents * 10) / 10 : null,
            closeAt: s.at ?? 0,
          });
        }
      }
    }
  }
  return out;
}

export function filterClv(rows: ClvLegRow[], f: ClvFilter): ClvLegRow[] {
  return rows.filter(
    (r) =>
      (f.market == null || r.market === f.market) &&
      (f.tier == null || r.tier === f.tier) &&
      (f.dir == null || r.dir === f.dir) &&
      (f.mode == null || r.mode === f.mode),
  );
}

/** Mean, n and standard error — the spec's "simple significance note". */
export function meanSE(xs: number[]): { n: number; mean: number | null; se: number | null } {
  const n = xs.length;
  if (!n) return { n: 0, mean: null, se: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, se: null };
  const varS = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1);
  return { n, mean, se: Math.sqrt(varS / n) };
}

export type ClvMarketRow = {
  market: string;
  fair: { n: number; mean: number | null; se: number | null };
  cents: { n: number; mean: number | null; se: number | null };
};

export function clvByMarket(rows: ClvLegRow[]): ClvMarketRow[] {
  const markets = [...new Set(rows.map((r) => r.market))].sort();
  return markets.map((m) => {
    const sel = rows.filter((r) => r.market === m);
    return {
      market: m,
      fair: meanSE(sel.map((r) => r.fairPts).filter((x): x is number => x != null)),
      cents: meanSE(sel.map((r) => r.czCents).filter((x): x is number => x != null)),
    };
  });
}

export type ClvTrendPoint = { date: string; mean: number; n: number };

/** Per-day mean fairPts over the trailing `days` window (days with data only). */
export function clvTrend(rows: ClvLegRow[], today: string, days = 30): ClvTrendPoint[] {
  const cut = new Date(new Date(today + "T12:00:00Z").getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    if (r.fairPts == null || r.date < cut || r.date > today) continue;
    const xs = byDay.get(r.date) ?? [];
    xs.push(r.fairPts);
    byDay.set(r.date, xs);
  }
  return [...byDay.entries()]
    .map(([date, xs]) => ({ date, mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
