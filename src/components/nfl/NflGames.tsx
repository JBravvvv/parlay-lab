"use client";

import { LeagueProvider } from "@/components/football/LeagueContext";
import { CfbGames } from "@/components/cfb/CfbGames";
import { NFL_DESK } from "@/lib/nfl/desk";

/**
 * THE NFL GAMES VIEW (2026-09-08): the shared football schedule-and-scores surface (CfbGames,
 * reading the desk hook, the finals loader and its copy through LeagueContext) mounted on the
 * NFL desk — ESPN's NFL scoreboard, the ["nfl","finals",date] poll, "No NFL games" copy.
 */
export function NflGames() {
  return (
    <LeagueProvider desk={NFL_DESK}>
      <CfbGames />
    </LeagueProvider>
  );
}
