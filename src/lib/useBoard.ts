"use client";

import {useSportsbook} from "@/lib/sportsbook/store";
import {priceMlbBoard} from "@/lib/sportsbook/mlb";
import { useEffect, useState, useMemo } from "react";
import { useSport, getSport } from "@/lib/sport";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bestBoard, generateBoard, type Board } from "./engine-client";
import { MLB_LIVE_QUERY_PREFIX } from "@/lib/mlb/live-client";

/**
 * Today's board, from the cheapest acceptable source: this device's cache, or the
 * board the Vercel cron already paid for (preferred only when its lineup coverage is
 * strictly better — never a downgrade), or failing both, a fresh engine run.
 */
export function useBoard() {
  const sport = useSport();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const query = useQuery<Board>({
    queryKey: ["board"],
    queryFn: () => { if (getSport() !== "mlb") throw new Error("MLB board is inactive"); return bestBoard(); },
    enabled: mounted && sport === "mlb",
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return { ...query, data: mounted && sport === "mlb" ? query.data : undefined };
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
    mutationFn: () => { if (getSport() !== "mlb") throw new Error("Switch to MLB to run the baseball engine"); return generateBoard(); },
    onSuccess: (b) => {
      qc.setQueryData(["board"], b);
      void qc.invalidateQueries({ queryKey: ["picks"] });
      /* INSTRUCTION 51 fix pass (2026-09-11): and the live overlay. A browser re-price replaces the
         pregame population the overlay re-anchors, so serving the old overlay against the new rows
         is how a row ends up graded against a line nobody is offering. Re-reading it is FREE — the
         route answers from Redis unless its own gate says a credit is warranted. */
      void qc.invalidateQueries({ queryKey: MLB_LIVE_QUERY_PREFIX });
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

/** Display projection only. Auto-allocation and ledger callers keep useBoard(). */
export function usePricedBoard(){const q=useBoard();const book=useSportsbook();const data=useMemo(()=>q.data?{...q.data,data:priceMlbBoard(q.data.data,book)}:undefined,[q.data,book]);return {...q,data};}
