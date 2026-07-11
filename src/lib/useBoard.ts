"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cachedBoard, generateBoard, type Board } from "./engine-client";

/** Today's board: instant from localStorage when fresh, else a full engine run. */
export function useBoard() {
  return useQuery<Board>({
    queryKey: ["board"],
    queryFn: async () => cachedBoard() ?? (await generateBoard()),
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
