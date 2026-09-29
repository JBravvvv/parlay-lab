"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadQueryClient } from "@/lib/use-read-query-client";
import { positionResolver, type PositionDoc, type PositionResolver } from "@/lib/mlb/positions";

/**
 * The MLB position index on the device (2026-09-28): one GET per session, shared by every surface through the query
 * cache, and one resolver per answer (the WeakMap) however many components ask. `null` until it lands — a pick simply
 * shows no tag until then. Free statsapi behind our own route; never an Odds credit.
 */
const resolvers = new WeakMap<PositionDoc, PositionResolver>();

export function useMlbPositions(enabled = true): PositionResolver | null {
  /* the app's client when mounted under it; an idle one otherwise, so a bare render (a test, a portal) never throws */
  const client = useReadQueryClient();
  const q = useQuery({
    queryKey: ["mlb-positions"],
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/mlb/positions", { signal });
      if (!r.ok) throw new Error(`positions ${r.status}`);
      const doc = (await r.json()) as PositionDoc;
      if (!Array.isArray(doc?.players)) throw new Error("positions: no players");
      return doc;
    },
  }, client);
  const doc = q.data;
  if (!doc) return null;
  let resolve = resolvers.get(doc);
  if (!resolve) {
    resolve = positionResolver(doc.players);
    resolvers.set(doc, resolve);
  }
  return resolve;
}
