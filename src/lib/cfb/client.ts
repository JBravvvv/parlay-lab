"use client";

import type { CfbPropsBoard } from "./props-types";
import { CFB_PROPS, CFB_ROUTES } from "./rules";
import type { CfbFinals, CfbSlate } from "./types";

/**
 * Browser side of the CFB slate feed. One GET to /api/cfb per (date, bankroll) — the route
 * serves the odds off the Next data cache (4-minute TTL), so the query's staleTime mirrors it
 * and a tab that refetches inside the window never spends quota. The quota headers the route
 * forwards are stored under the same keys src/lib/fetcher.ts uses (`pl_quota` / `pl_quota_at`),
 * so the Settings page's API-status row reads one number for both desks.
 */

/** matches the route's Odds API revalidate window */
export const CFB_STALE_MS = 240_000;

export function cfbQueryKey(date: string | null | undefined, bankroll: number) {
  return ["cfb", "slate", date ?? "today", bankroll] as const;
}

/** the FALLBACK staleTime — the props route's pre-kick window (CFB_PROPS.revalidateSec, 2 h since 2026-09-05).
    The board's own `ttlSec` (CFB_PROPS.liveRevalidateSec = 600 while any priced game is live) is what
    CfbProps / CfbPicksBoard actually read for staleness once a board is loaded — the query never polls */
export const CFB_PROPS_STALE_MS = CFB_PROPS.revalidateSec * 1000;

export function cfbPropsQueryKey(date: string | null | undefined, bankroll: number) {
  return ["cfb", "props", date ?? "today", bankroll] as const;
}

/**
 * The props query's staleTime for a loaded board: what is LEFT of the board's window, not the
 * whole window from the moment the query resolved — the route serves a Redis board with its
 * ORIGINAL generatedAt, so a board that arrives 9 min into a 10-min window is stale in 1 min,
 * not 10 (2026-09-05 review fix: it used to be held for up to twice its window). No board yet →
 * CFB_PROPS_STALE_MS. Still never polled — this only aligns a focus / remount with the route's own window.
 */
export function cfbPropsStaleMs(board: Pick<CfbPropsBoard, "ttlSec" | "generatedAt"> | undefined, now: number = Date.now()): number {
  const s = board?.ttlSec;
  const winMs = typeof s === "number" && Number.isFinite(s) && s > 0 ? s * 1000 : CFB_PROPS_STALE_MS;
  if (!board) return winMs;
  const age = now - Date.parse(board.generatedAt);
  return Number.isFinite(age) && age >= 0 ? Math.max(0, winMs - age) : winMs;
}

/** "2 h" / "10 min" — the window the board itself says it was cached for (never hardcoded) */
export function cfbCacheLabel(board: Pick<CfbPropsBoard, "ttlSec">): string {
  const s = board.ttlSec ?? CFB_PROPS.revalidateSec;
  return s >= 3600 ? `${Math.round((s / 3600) * 10) / 10} h` : `${Math.round(s / 60)} min`;
}

/** "9:41 AM" — when a (stale) board's lines were last priced, in the viewer's own zone */
export function cfbPricedAtLabel(board: Pick<CfbPropsBoard, "generatedAt">): string {
  const t = Date.parse(board.generatedAt);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
}

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

async function getJson<T extends object>(url: string): Promise<{ res: Response; body: T }> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body == null) {
    throw new Error(body?.error ?? `cfb feed ${res.status}`);
  }
  return { res, body };
}

/** The full slate for a Pacific date (today when omitted): board + finals + quota. */
export async function loadCfbSlate(date?: string, opts?: { bankroll?: number }): Promise<CfbSlate> {
  const p = new URLSearchParams();
  if (date) p.set("date", date);
  const bankroll = opts?.bankroll;
  if (bankroll != null && Number.isFinite(bankroll) && bankroll > 0) p.set("bankroll", String(Math.round(bankroll)));
  const qs = p.toString();
  const { res, body } = await getJson<CfbSlate>(`/api/cfb${qs ? `?${qs}` : ""}`);
  rememberQuota(res, body);
  return body;
}

/** Scores only — the grader's feed. Never touches the odds quota. */
export async function loadCfbFinals(date: string): Promise<{ date: string; finals: CfbFinals }> {
  const p = new URLSearchParams({ date, mode: "finals" });
  const { body } = await getJson<{ date: string; finals: CfbFinals }>(`/api/cfb?${p.toString()}`);
  return body;
}

/** The player-props board for a Pacific date (today when omitted). One GET per (date, bankroll);
    the route serves the board off Redis / a data cache whose window is the board's `ttlSec`
    (CFB_PROPS.revalidateSec pre-kick, liveRevalidateSec while live), so `staleTime` mirrors
    that value (CFB_PROPS_STALE_MS is only the fallback before a board loads) and there is NO refetchInterval anywhere — a fresh pull was measured at ~31 credits
    per event (2026-09-05), and the route holds a daily budget it will not spend past. */
export async function loadCfbProps(date?: string, opts?: { bankroll?: number }): Promise<CfbPropsBoard> {
  const p = new URLSearchParams();
  if (date) p.set("date", date);
  const bankroll = opts?.bankroll;
  if (bankroll != null && Number.isFinite(bankroll) && bankroll > 0) p.set("bankroll", String(Math.round(bankroll)));
  const qs = p.toString();
  const { res, body } = await getJson<CfbPropsBoard>(`${CFB_ROUTES.props}${qs ? `?${qs}` : ""}`);
  rememberQuota(res, body);
  return body;
}
