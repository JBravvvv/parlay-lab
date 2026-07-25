import { CAL_START } from "@/engine2/calibration";

/**
 * SELECTION-TIGHTENING NOTICE (Phase 1, 2026-07-25)
 *
 * The Phase 0.5 cutoff restarted the calibration sample on CAL_START, so every
 * market's graded count began rebuilding from zero. `mktN` is the input to the
 * small-sample consensus gate (`consMinN`, frozen at 100): while a market sits
 * under that count, its tickets must ALSO clear the de-vigged consensus, so the
 * card gets quieter and NO-PLAY days get more common — roughly 2–3 days on the
 * prop markets, ~2 weeks on ML/RL, which were already under 100 before the
 * restart and are not evidence of anything.
 *
 * The risk is not the tightening. The risk is misreading it as the model losing
 * edge, overriding on that misread, and booking override creep into the
 * Discipline report — corrupting the very instrument the restart protects. So
 * the app says out loud, with counts, that this is a sample-size artifact and
 * not a model signal.
 *
 * Pure module: no fetch, no DOM, no engine.
 */

export type RebuildRow = { market: string; n: number; need: number };
export type GateRebuild = { rebuilding: boolean; rows: RebuildRow[]; daysIn: number };

/** How long "rebuilding" is an honest explanation. After the rolling summary
    window (45d) no pre-restart data is in scope at all, so a market still under
    the threshold then is simply a thin market, not a rebuilding one. */
export const REBUILD_WINDOW_DAYS = 45;

const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** Human label for the markets the card actually touches. */
export const MKT_SHORT: Record<string, string> = {
  ml: "ML",
  rl: "RL",
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_home_runs: "HR",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K's",
  pitcher_outs: "Outs",
};

/**
 * @param mktN     graded legs per market (null = no calibration store at all)
 * @param minN     SH_CFG.consMinN — the gate's threshold
 * @param today    YYYY-MM-DD
 * @param markets  the markets on today's card; empty/undefined = report every known market
 */
export function gateRebuild(
  mktN: Record<string, number> | null | undefined,
  minN: number,
  today: string,
  markets?: string[],
): GateRebuild {
  const start = dayNum(CAL_START);
  const daysIn = dayNum(today) - start;
  const inWindow = daysIn >= 0 && daysIn <= REBUILD_WINDOW_DAYS;
  const scope = markets?.length ? [...new Set(markets)] : Object.keys(MKT_SHORT);
  const rows = scope
    .filter((m) => MKT_SHORT[m])
    // a missing market is 0, not "unknown" — the engine treats it as small too
    .map((m) => ({ market: m, n: Math.max(0, Math.round(mktN?.[m] ?? 0)), need: minN }))
    .filter((r) => r.n < r.need)
    .sort((a, b) => b.n - a.n);
  return { rebuilding: inWindow && rows.length > 0, rows, daysIn };
}

/** "H+R+RBI 34/100 · Hits 51/100" */
export function rebuildCounts(rows: RebuildRow[]): string {
  return rows.map((r) => `${MKT_SHORT[r.market] ?? r.market} ${r.n}/${r.need}`).join(" · ");
}

/** The whole sentence, as it reads on the card and on the NO-PLAY banner. */
export function rebuildSentence(rows: RebuildRow[]): string {
  return `Market sample rebuilding since the 0.5 restart (${rebuildCounts(rows)}) — consensus gate temporarily strict; this is not a model signal.`;
}
