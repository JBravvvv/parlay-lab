"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbProps } from "@/components/cfb/CfbProps";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL PROPS SANDBOX (2026-09-08): the shared football props surface (CfbProps, reading the
 * league through LeagueContext) mounted on the NFL desk — the NFL props feed, NFL_RULES' EV gate,
 * "NFL slip" copy, the blue accent. Untracked, like the CFB sandbox.
 */
export function NflProps() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbProps />
    </LeagueProvider>
  );
}
