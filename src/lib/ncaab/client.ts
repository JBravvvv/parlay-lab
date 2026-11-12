"use client";

import { NCAAB_ODDS_TTL, NCAAB_QUERY_PREFIX, NCAAB_ROUTE } from "@/lib/ncaab/rules";
import type { NcaabSlate } from "@/lib/ncaab/slate";

/**
 * THE COLLEGE BASKETBALL FEED CLIENT. One request per date, kept for as long as the server keeps
 * its prices. NO POLLING: the prices are a paid feed, so the page asks when it opens, when the
 * date changes and when Refresh is tapped, and never on a timer.
 */

export const NCAAB_STALE_MS = NCAAB_ODDS_TTL * 1000;

export function ncaabQueryKey(date: string) {
  return [NCAAB_QUERY_PREFIX, "slate", date] as const;
}

export async function loadNcaabSlate(date: string): Promise<NcaabSlate> {
  const res = await fetch(`${NCAAB_ROUTE}?date=${encodeURIComponent(date)}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (NcaabSlate & { error?: string }) | null;
  if (!res.ok || body == null) throw new Error(body?.error ?? `college basketball feed ${res.status}`);
  /* the credits left are one shared pool across every desk; the Settings page reads these two keys */
  const left = res.headers.get("x-requests-remaining");
  if (left != null && left !== "") {
    try {
      localStorage.setItem("pl_quota", left);
      localStorage.setItem("pl_quota_at", String(Date.now()));
    } catch {
      /* private mode: the count is simply not remembered */
    }
  }
  return body;
}
