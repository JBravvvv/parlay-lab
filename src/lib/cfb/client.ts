"use client";

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

function rememberQuota(res: Response, body: { quota?: { remaining: number | null } } | null) {
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
