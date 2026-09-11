"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bestBoard, generateBoard, type Board } from "./engine-client";

/**
 * Today's board, from the cheapest acceptable source: this device's cache, or the
 * board the Vercel cron already paid for (preferred only when its lineup coverage is
 * strictly better — never a downgrade), or failing both, a fresh engine run.
 */
export function useBoard() {
  return useQuery<Board>({
    queryKey: ["board"],
    queryFn: bestBoard,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * INSTRUCTION 50 (2026-09-11): a browser re-price also invalidates ["picks"] — the day's stamped
 * picks feed every prop tab on the Board, and before this they only ever refreshed on a remount
 * (which is why Josh saw the refresh "work" on The Sharp and not on Board: navigating away and
 * back remounted the page). setQueryData on ["board"] stays exactly as it was.
 */
export function useRegenerateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateBoard,
    onSuccess: (b) => {
      qc.setQueryData(["board"], b);
      void qc.invalidateQueries({ queryKey: ["picks"] });
    },
  });
}

/**
 * INSTRUCTION 49: the manual refill mutation lives in src/lib/refill-client.ts (the Board page
 * imports it from there — tests/board-overview-toggle.test.ts mocks THIS module with only
 * useBoard / useRegenerateBoard, so the hook must not be one of this module's own exports the
 * page depends on). Re-exported here for callers that read the desk's hooks off one module.
 */
export { useRefillDesk } from "@/lib/refill-client";
