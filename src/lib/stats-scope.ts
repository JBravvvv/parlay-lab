import type { Sport } from "@/lib/sport";

/**
 * STATS SCOPE (INSTRUCTION 40, 2026-09-05). Josh: "Since we are separating sports betting
 * boards by using 'MLB', 'CFB' etc tabs on main dashboard, only that specific sports' stats
 * need to be in the stats tab for that sport."
 *
 * The Stats page keeps its full registry (MLB / NFL / NCAAF tables, the UFC card view) so no
 * code path breaks, but which of those a visitor can reach is decided HERE, from the global
 * SportSwitch desk (src/lib/sport.ts). Today each desk maps to exactly one stat sport; a
 * future desk (NFL, UFC) adds a row without touching the page. Pure — no React, no storage.
 */
export type StatsSportId = "mlb" | "nfl" | "cfb" | "ufc";

const DESK_STATS: Record<Sport, readonly StatsSportId[]> = {
  mlb: ["mlb"],
  cfb: ["cfb"],
};

/** the stat sports the current desk may show, first = the desk's default */
export function sportsFor(desk: Sport): readonly StatsSportId[] {
  return DESK_STATS[desk] ?? DESK_STATS.mlb;
}

/** the pill to open on: the remembered choice when the desk allows it, else the desk default */
export function scopedStatsSport(desk: Sport, wanted: StatsSportId | null | undefined): StatsSportId {
  const allowed = sportsFor(desk);
  return wanted && allowed.includes(wanted) ? wanted : allowed[0];
}

/** the MLB-model calibration view (CLV / discipline / reliability) belongs to the MLB desk only */
export function calibrationFor(desk: Sport): boolean {
  return desk === "mlb";
}

/**
 * May the stats table query fire? Only once the page is hydrated (useSport() reports "mlb" on
 * the server and during hydration, so a CFB-desk visit must not create an MLB observer on that
 * pass), never for the UFC card view, and only after the filter defaults have been re-cut for
 * the current table sport (a "hitting" group under the NCAAF feed is a bogus request).
 */
export function statsQueryEnabled(a: { hydrated: boolean; sport: StatsSportId; filtersReady: boolean }): boolean {
  return a.hydrated && a.sport !== "ufc" && a.filtersReady;
}
