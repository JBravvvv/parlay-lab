"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_HIT_WINDOW, hitKey, isHitWindow, type HitWindow, type PlayerLog } from "@/lib/prop-hit-rate";

/**
 * The board's hit-rate game logs, one request per board (2026-09-18). Keyed by the sorted name
 * list so a market change on the same board is a cache hit, not a refetch; the route itself
 * caches per id for 10 minutes. Free statsapi — no Odds credit, ever.
 */
export type HitLogMap = ReadonlyMap<string, PlayerLog>;
const EMPTY: HitLogMap = new Map();

export function useHitRates(players: readonly { name: string; team: string | null }[], enabled = true) {
  const list = useMemo(() => {
    const seen = new Map<string, { name: string; team: string | null }>();
    for (const p of players) {
      const k = hitKey(p.name);
      if (k.length >= 2 && !seen.has(k)) seen.set(k, p);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400);
  }, [players]);
  const q = useQuery({
    queryKey: ["mlb-hit-rates", list.map((p) => `${p.name}|${p.team ?? ""}`).join(",")],
    enabled: enabled && list.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/mlb/hit-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ players: list }),
        signal,
      });
      if (!r.ok) throw new Error(`hit-rates ${r.status}`);
      const doc = (await r.json()) as { players?: Record<string, PlayerLog> };
      return new Map(Object.entries(doc.players ?? {})) as HitLogMap;
    },
  });
  return { logs: q.data ?? EMPTY, loading: q.isPending && enabled && list.length > 0, error: q.isError };
}

/** the hit-rate window (L7…L120), remembered on the device — read after mount, never in an initializer */
const WINDOW_KEY = "pl:props:hit-window";
export function useHitWindow(): [HitWindow, (w: HitWindow) => void] {
  const [w, setW] = useState<HitWindow>(DEFAULT_HIT_WINDOW);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(WINDOW_KEY));
      if (isHitWindow(n)) setW(n);
    } catch {}
  }, []);
  const set = useCallback((next: HitWindow) => {
    setW(next);
    try {
      localStorage.setItem(WINDOW_KEY, String(next));
    } catch {}
  }, []);
  return [w, set];
}
