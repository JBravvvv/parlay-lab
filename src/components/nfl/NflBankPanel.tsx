"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbBankPanel } from "@/components/cfb/CfbBankPanel";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL BANK (2026-09-08): the shared football bank panel (CfbBankPanel — Settings' managed
 * bankroll rows) on the NFL desk: $2,500 base + logged moves + graded NFL P/L, its own store
 * and its own sync loop.
 */
export function NflBankPanel() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbBankPanel />
    </LeagueProvider>
  );
}
