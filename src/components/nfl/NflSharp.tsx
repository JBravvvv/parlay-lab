"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbSharp } from "@/components/cfb/CfbSharp";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL SHARP (2026-09-08): the shared football read (CfbSharp) on the NFL desk — it prints
 * NFL_MODEL / NFL_RULES / NFL_PAPER (σ 13.5, HFA 2.0, the $350 card) from the one copy and reads
 * the NFL slate query, never the CFB constants by reference.
 */
export function NflSharp() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbSharp />
    </LeagueProvider>
  );
}
