"use client";

import type { DeskClient, LeagueConfig } from "@/lib/football/league";
import type { CfbPropsBoard } from "@/lib/cfb/props-types";
import type { CfbFinals, CfbSlate } from "@/lib/cfb/types";

/**
 * THE FOOTBALL FEED CLIENT FACTORY (2026-09-08, the NFL build) — the browser side of a desk's
 * slate and props feeds, with the routes, the react-query prefix and the props window taken off
 * `cfg`. This is src/lib/cfb/client.ts (which stays as it is — its source is pinned by name)
 * parameterised: one GET to `cfg.routes.slate` per (date, bankroll), the route serving the odds
 * off the Next data cache (4-minute TTL) so the query's staleTime mirrors it and a tab that
 * refetches inside the window never spends quota.
 *
 * THE QUOTA IS ONE SHARED POOL. The Odds API key is one key across every desk, so the quota
 * headers a route forwards are remembered under the SAME two keys src/lib/fetcher.ts and the CFB
 * client use (`pl_quota` / `pl_quota_at`) — the Settings page's API-status row reads one number
 * for every desk. Those two keys are deliberately not per-league.
 */

export type ClientConfig = Pick<LeagueConfig, "queryPrefix" | "routes" | "props">;

/** matches the slate route's Odds API revalidate window */
export const STALE_MS = 240_000;

function rememberQuota(res: Response, body: { quota?: { remaining: number | null } | null } | null) {
  const fromHeader = res.headers.get("x-requests-remaining");
  const remaining = fromHeader ?? (body?.quota?.remaining != null ? String(body.quota.remaining) : null);
  if (remaining == null) return;
  try {
    localStorage.setItem("pl_quota", remaining);
    localStorage.setItem("pl_quota_at", String(Date.now()));
  } catch {
    /* storage full / private mode — the quota display is best-effort */
  }
}

async function getJson<T extends object>(url: string, feed: string): Promise<{ res: Response; body: T }> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body == null) {
    throw new Error(body?.error ?? `${feed} feed ${res.status}`);
  }
  return { res, body };
}

export function makeClient(cfg: ClientConfig): DeskClient {
  const prefix = cfg.queryPrefix;

  /** the FALLBACK staleTime — the props route's pre-kick window (`props.revalidateSec`). The board's
      own `ttlSec` (`props.liveRevalidateSec` while any priced game is live) is what the props
      surfaces actually read for staleness once a board is loaded — the query never polls */
  const PROPS_STALE_MS = cfg.props.revalidateSec * 1000;

  function queryKey(date: string | null | undefined, bankroll: number) {
    return [prefix, "slate", date ?? "today", bankroll] as const;
  }

  function propsQueryKey(date: string | null | undefined, bankroll: number) {
    return [prefix, "props", date ?? "today", bankroll] as const;
  }

  /**
   * The props query's staleTime for a loaded board: what is LEFT of the board's window, not the
   * whole window from the moment the query resolved — the route serves a Redis board with its
   * ORIGINAL generatedAt, so a board that arrives 9 min into a 10-min window is stale in 1 min,
   * not 10. No board yet → PROPS_STALE_MS. Still never polled — this only aligns a focus / remount
   * with the route's own window.
   */
  function propsStaleMs(board: Pick<CfbPropsBoard, "ttlSec" | "generatedAt"> | undefined, now: number = Date.now()): number {
    const s = board?.ttlSec;
    const winMs = typeof s === "number" && Number.isFinite(s) && s > 0 ? s * 1000 : PROPS_STALE_MS;
    if (!board) return winMs;
    const age = now - Date.parse(board.generatedAt);
    return Number.isFinite(age) && age >= 0 ? Math.max(0, winMs - age) : winMs;
  }

  /** "2 h" / "10 min" — the window the board itself says it was cached for (never hardcoded) */
  function cacheLabel(board: Pick<CfbPropsBoard, "ttlSec">): string {
    const s = board.ttlSec ?? cfg.props.revalidateSec;
    return s >= 3600 ? `${Math.round((s / 3600) * 10) / 10} h` : `${Math.round(s / 60)} min`;
  }

  /** "9:41 AM" — when a (stale) board's lines were last priced, in the viewer's own zone */
  function pricedAtLabel(board: Pick<CfbPropsBoard, "generatedAt">): string {
    const t = Date.parse(board.generatedAt);
    return Number.isFinite(t) ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  }

  /** The full slate for a Pacific date (today when omitted): board + finals + quota. */
  async function loadSlate(date?: string, opts?: { bankroll?: number }): Promise<CfbSlate> {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    const bankroll = opts?.bankroll;
    if (bankroll != null && Number.isFinite(bankroll) && bankroll > 0) p.set("bankroll", String(Math.round(bankroll)));
    const qs = p.toString();
    const { res, body } = await getJson<CfbSlate>(`${cfg.routes.slate}${qs ? `?${qs}` : ""}`, prefix);
    rememberQuota(res, body);
    return body;
  }

  /** Scores only — the grader's feed. Never touches the odds quota. */
  async function loadFinals(date: string): Promise<{ date: string; finals: CfbFinals }> {
    const p = new URLSearchParams({ date, mode: "finals" });
    const { body } = await getJson<{ date: string; finals: CfbFinals }>(`${cfg.routes.slate}?${p.toString()}`, prefix);
    return body;
  }

  /** The player-props board for a Pacific date (today when omitted). One GET per (date, bankroll);
      the route serves the board off Redis / a data cache whose window is the board's `ttlSec`
      (`props.revalidateSec` pre-kick, `props.liveRevalidateSec` while live), so `staleTime` mirrors
      that value (PROPS_STALE_MS is only the fallback before a board loads) and there is NO
      refetchInterval anywhere — the route holds a daily budget it will not spend past. */
  async function loadProps(date?: string, opts?: { bankroll?: number }): Promise<CfbPropsBoard> {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    const bankroll = opts?.bankroll;
    if (bankroll != null && Number.isFinite(bankroll) && bankroll > 0) p.set("bankroll", String(Math.round(bankroll)));
    const qs = p.toString();
    const { res, body } = await getJson<CfbPropsBoard>(`${cfg.routes.props}${qs ? `?${qs}` : ""}`, prefix);
    rememberQuota(res, body);
    return body;
  }

  return {
    STALE_MS,
    PROPS_STALE_MS,
    queryKey,
    propsQueryKey,
    loadSlate,
    loadFinals,
    loadProps,
    propsStaleMs,
    cacheLabel,
    pricedAtLabel,
  };
}
