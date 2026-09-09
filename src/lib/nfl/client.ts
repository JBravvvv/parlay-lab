"use client";

import { makeClient } from "@/lib/football/client";
import { NFL_LEAGUE } from "./rules";

/**
 * Browser side of the NFL slate and props feeds (2026-09-08): one GET to NFL_ROUTES.slate per
 * (date, bankroll) and one to NFL_ROUTES.props, with react-query keys under the "nfl" prefix so
 * an NFL refresh never invalidates a CFB query. The body is src/lib/football/client.ts
 * `makeClient`; the quota it remembers is the ONE shared pool (`pl_quota` / `pl_quota_at`).
 */

const C = makeClient(NFL_LEAGUE);

/** matches the NFL slate route's Odds API revalidate window */
export const NFL_STALE_MS = C.STALE_MS;
/** the FALLBACK props staleTime — NFL_PROPS.revalidateSec before a board loads */
export const NFL_PROPS_STALE_MS = C.PROPS_STALE_MS;
export const nflQueryKey = C.queryKey;
export const nflPropsQueryKey = C.propsQueryKey;
export const loadNflSlate = C.loadSlate;
export const loadNflFinals = C.loadFinals;
export const loadNflProps = C.loadProps;
export const nflPropsStaleMs = C.propsStaleMs;
export const nflCacheLabel = C.cacheLabel;
export const nflPricedAtLabel = C.pricedAtLabel;
