"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbBuilder } from "@/components/cfb/CfbBuilder";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL BUILDER (2026-09-08, Josh: "NFL needs to be built NOW"): the shared football card
 * desk (CfbBuilder — the College Football surface, which reads every league handle through
 * LeagueContext) mounted on the NFL desk: $350 core + $25 fun per slate day, the NFL ledger and
 * bank (pl_nfl_ledger / pl_nfl_bank2), `nfl-…` ticket ids, the blue accent. Nothing here is a
 * second copy of the surface; app/builder/page.tsx early-returns this on the NFL desk.
 */
export function NflBuilder() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbBuilder />
    </LeagueProvider>
  );
}
