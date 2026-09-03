/**
 * Pitcher vs Team — pure shaping + types (2026-09-03).
 *
 * Operator Josh: "On the stats tab, there should be a button called pitcher vs
 * team where you can select a pitcher as well as a separate MLB team and it
 * shows every active hitter on the roster with their career stats against that
 * pitcher."
 *
 * Everything here is derived from statsapi.mlb.com responses (active rosters +
 * the batter-vs-pitcher `vsPlayer` stat group). No numbers are invented: a
 * hitter with no history against the pitcher gets pa 0 and null rates, and
 * the team totals are recomputed from the summed counting stats.
 */

export const TEAM_ABBR: Record<number, string> = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC", 113: "CIN", 114: "CLE",
  115: "COL", 116: "DET", 117: "HOU", 118: "KC", 119: "LAD", 120: "WSH", 121: "NYM",
  133: "ATH", 134: "PIT", 135: "SD", 136: "SEA", 137: "SF", 138: "STL", 139: "TB",
  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI", 144: "ATL", 145: "CWS", 146: "MIA",
  147: "NYY", 158: "MIL",
};
export const TEAM_IDS = Object.keys(TEAM_ABBR).map(Number);

export type PvtHitter = { id: number; name: string; pos: string };
export type PvtPitcher = { id: number; name: string; team: string };

export type PvtRow = PvtHitter & {
  g: number; pa: number; ab: number; h: number; d2: number; d3: number; hr: number;
  rbi: number; bb: number; k: number; tb: number; hbp: number; sf: number;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
};

export type PvtTotals = Omit<PvtRow, "id" | "name" | "pos"> & { faced: number; hitters: number };

export type PvtResponse = {
  pitcher: { id: number; name: string };
  team: { id: number; abbr: string; name: string };
  rows: PvtRow[];
  totals: PvtTotals;
};

type RosterEntry = {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string; type?: string };
};
type RosterDoc = { roster?: RosterEntry[] };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rate = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-.--") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isIntId(v: string | null | undefined): boolean {
  return typeof v === "string" && /^\d{1,9}$/.test(v) && Number(v) > 0;
}

/** Active roster -> hitters (anyone not listed as a Pitcher; two-way players count). */
export function hittersFromRoster(doc: RosterDoc | null | undefined): PvtHitter[] {
  const list = Array.isArray(doc?.roster) ? doc!.roster! : [];
  return list
    .filter((e) => e?.person?.id != null && e.position?.type !== "Pitcher")
    .map((e) => ({ id: Number(e.person!.id), name: String(e.person!.fullName ?? ""), pos: String(e.position?.abbreviation ?? "") }));
}

/** Active roster -> pitchers, tagged with the club abbreviation (for the picker). */
export function pitchersFromRoster(doc: RosterDoc | null | undefined, teamId: number): PvtPitcher[] {
  const list = Array.isArray(doc?.roster) ? doc!.roster! : [];
  const team = TEAM_ABBR[teamId] ?? String(teamId);
  return list
    .filter((e) => e?.person?.id != null && e.position?.type === "Pitcher")
    .map((e) => ({ id: Number(e.person!.id), name: String(e.person!.fullName ?? ""), team }));
}

/**
 * The batter's `vsPlayer` stat doc -> one table row. The `vsPlayerTotal`
 * group is the career line across every team the batter faced the pitcher
 * with; `vsPlayer` is the per-team breakdown and is ignored here.
 */
export function rowFromVsPlayer(hitter: PvtHitter, doc: unknown): PvtRow {
  const empty: PvtRow = {
    ...hitter, g: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, bb: 0, k: 0, tb: 0, hbp: 0, sf: 0,
    avg: null, obp: null, slg: null, ops: null,
  };
  const stats = (doc as { stats?: unknown } | null)?.stats;
  if (!Array.isArray(stats)) return empty;
  const total = stats.find((s) => (s as { type?: { displayName?: string } })?.type?.displayName === "vsPlayerTotal") as
    | { splits?: { stat?: Record<string, unknown> }[] } | undefined;
  const st = total?.splits?.[0]?.stat;
  if (!st) return empty;
  const pa = num(st.plateAppearances);
  if (pa <= 0) return empty;
  return {
    ...hitter,
    g: num(st.gamesPlayed), pa, ab: num(st.atBats), h: num(st.hits), d2: num(st.doubles), d3: num(st.triples),
    hr: num(st.homeRuns), rbi: num(st.rbi), bb: num(st.baseOnBalls), k: num(st.strikeOuts), tb: num(st.totalBases),
    hbp: num(st.hitByPitch), sf: num(st.sacFlies),
    avg: rate(st.avg), obp: rate(st.obp), slg: rate(st.slg), ops: rate(st.ops),
  };
}

/** Team line vs the pitcher: counting stats summed over hitters with history, rates recomputed. */
export function pvtTotals(rows: PvtRow[]): PvtTotals {
  const faced = rows.filter((r) => r.pa > 0);
  const t = { g: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, bb: 0, k: 0, tb: 0, hbp: 0, sf: 0 };
  for (const r of faced) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k];
  const avg = t.ab > 0 ? t.h / t.ab : null;
  const slg = t.ab > 0 ? t.tb / t.ab : null;
  const obpDen = t.ab + t.bb + t.hbp + t.sf;
  const obp = obpDen > 0 ? (t.h + t.bb + t.hbp) / obpDen : null;
  const ops = obp != null && slg != null ? obp + slg : null;
  return { ...t, avg, obp, slg, ops, faced: faced.length, hitters: rows.length };
}

/** History first by OPS desc (PA breaks ties), then no-history alphabetically. */
export function sortRows(rows: PvtRow[]): PvtRow[] {
  return [...rows].sort((a, b) => {
    const ah = a.pa > 0, bh = b.pa > 0;
    if (ah !== bh) return ah ? -1 : 1;
    if (ah) return (b.ops ?? -1) - (a.ops ?? -1) || b.pa - a.pa || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}
