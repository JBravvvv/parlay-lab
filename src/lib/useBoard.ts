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

export function useRegenerateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateBoard,
    onSuccess: (b) => qc.setQueryData(["board"], b),
  });
}
