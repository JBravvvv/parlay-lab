"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbSyncChip } from "@/components/cfb/CfbSyncChip";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL SYNC CHIP (2026-09-08): the shared football sync status (CfbSyncChip) on the NFL
 * desk's own loop (/api/nfl/ledger, its own blobs, the one sync phrase from Settings).
 */
export function NflSyncChip({ className = "" }: { className?: string }) {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbSyncChip className={className} />
    </LeagueProvider>
  );
}
