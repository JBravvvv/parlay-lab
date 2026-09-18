"use client";

import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SplitsFeed, SplitsLeague } from "@/lib/splits";

/* A chip on a card must never be the reason a card cannot render: outside a QueryClientProvider
   (the static render tests mount CfbTicketCard / GameCard bare) the hook falls back to an idle
   client of its own — nothing fetches on a server render, the feed is simply null. */
let fallback: QueryClient | null = null;
function clientOrFallback(): QueryClient {
  try {
    return useQueryClient();
  } catch {
    fallback ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return fallback;
  }
}

/** the desk's own /api/splits feed — ten-minute cache, refetched on a ten-minute timer, silent on failure */
export function useSplits(league: SplitsLeague | "cfb" | null | undefined): SplitsFeed | null {
  const lg: SplitsLeague | null = league === "cfb" ? "ncaaf" : league ?? null;
  const client = clientOrFallback();
  const q = useQuery<SplitsFeed>({
    queryKey: ["splits", lg],
    enabled: !!lg,
    queryFn: async () => {
      const r = await fetch(`/api/splits?league=${lg}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`splits ${r.status}`);
      return (await r.json()) as SplitsFeed;
    },
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  }, client);
  const feed = q.data;
  return feed && Array.isArray(feed.games) ? feed : null;
}
