"use client";

import { useQuery } from "@tanstack/react-query";
import { shapeLineups, type PostedLineups, type ScheduleWithLineups } from "./lineup-check";

/**
 * Today's posted lineups for the Board's OUT check (INSTRUCTION 28). Keyless statsapi read
 * through the /api/stats proxy (180 s data cache); refetches every 2 min while the page is
 * open so a lineup posting mid-session scratches its absent batters without a reload.
 */
export function useLineups(date: string | null | undefined) {
  return useQuery<PostedLineups>({
    queryKey: ["lineups", date ?? null],
    enabled: !!date,
    queryFn: async () => {
      const u = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=lineups`;
      const r = await fetch(`/api/stats?u=${encodeURIComponent(u)}`);
      if (!r.ok) throw new Error(`lineups ${r.status}`);
      return shapeLineups((await r.json()) as ScheduleWithLineups);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
