"use client";

import type { ComponentProps } from "react";
import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbFpiPanel } from "@/components/cfb/CfbFpiPanel";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL FPI PANEL (2026-09-08): ESPN's Football Power Index list (CfbFpiPanel) under the NFL
 * provider — the blue bar, no FCS wording. Forwards every CfbFpiPanel prop (teams, updated,
 * title, limit, className, bare, searchable) unchanged.
 */
export function NflFpiPanel(props: ComponentProps<typeof CfbFpiPanel>) {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbFpiPanel {...props} />
    </LeagueProvider>
  );
}
