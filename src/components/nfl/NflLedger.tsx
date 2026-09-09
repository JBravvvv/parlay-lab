"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbLedger, CfbLedgerActions } from "@/components/cfb/CfbLedger";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL LEDGER (2026-09-08): the shared football ledger (CfbLedger) and its page-header
 * actions (CfbLedgerActions — grade / export / copy / import / wipe) mounted on the NFL desk:
 * the NFL entries, the NFL bank, ESPN's NFL finals, the /api/nfl/ledger sync loop. The page
 * hands `NflLedgerActions` to its PageHeader exactly as it hands the CFB pair.
 */
export function NflLedger() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbLedger />
    </LeagueProvider>
  );
}

export function NflLedgerActions() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbLedgerActions />
    </LeagueProvider>
  );
}
