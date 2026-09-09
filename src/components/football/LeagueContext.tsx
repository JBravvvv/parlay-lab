"use client";

/**
 * THE LEAGUE CONTEXT (2026-09-08, the NFL build — Josh: "NFL needs to be built NOW").
 *
 * The College Football surfaces under src/components/cfb/* ARE the shared football surfaces:
 * they read every league-specific handle — config, store, sync, client, hooks — through
 * `useLeague()` instead of importing the CFB modules by name. The context's DEFAULT is CFB_DESK,
 * so every existing CFB page keeps rendering exactly as it did with no provider at all; the NFL
 * pages are thin wrappers that mount the same surface under `<LeagueProvider desk={NFL_DESK}>`
 * (src/components/nfl/Nfl*.tsx). `useLeagueTone()` is the accent the shared ui primitives
 * (Segmented / StatTile / OddsGrid / EdgeMeter / Overlay) key their colour on.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { DeskHandles } from "@/lib/football/league";
import { CFB_DESK } from "@/lib/cfb/desk";

export const LeagueContext = createContext<DeskHandles>(CFB_DESK);

export function LeagueProvider({ desk, children }: { desk: DeskHandles; children: ReactNode }) {
  return <LeagueContext.Provider value={desk}>{children}</LeagueContext.Provider>;
}

export function useLeague(): DeskHandles {
  return useContext(LeagueContext);
}

/** the desk's accent: "cfb" (amber) or "nfl" (blue) */
export function useLeagueTone(): "cfb" | "nfl" {
  return useLeague().id;
}
