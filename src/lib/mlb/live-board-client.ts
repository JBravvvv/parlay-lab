"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSyncKey } from "@/lib/ledgerSync";
import { MLB_LIVE_QUERY_PREFIX } from "@/lib/mlb/live-client";

/**
 * THE LIVE POOL JOSH'S OWN TAP CAN BUILD (2026-09-12) — the browser half of /api/generate?live=1.
 *
 * WHAT WAS WRONG: the LIVE pill and the LIVE parlays read `d.categoriesLive`, which only the run
 * that built the board can fill. Every automatic route to a run taken WHILE games are in play is
 * refused (liveCoverage calls it dead-slate / low-ceiling, and the top-up ladder calls it "every
 * game started"), so the live pool was whatever the last PREGAME pass computed — nothing — even
 * when Josh tapped Refresh.
 *
 * The server route's board-only mode is what this calls: it re-prices and stores the board and its
 * live pool, and it NEVER enters the stake path — no claim, no allocation, no append — so
 * INSTRUCTION 48's locked card cannot move. It costs a full generate (114-150 Odds credits
 * measured), which is why it runs on HIS TAP and is not on any timer.
 *
 * WHY IT LIVES IN A MODULE AND NOT ON THE PAGE: tests/board-settled.test.ts counts the `fetch(`
 * calls written on app/board/page.tsx and requires exactly one (the free /api/picks read), so that
 * no priced read can be added to the page without going through a named, reviewable client — the
 * same rule src/lib/mlb/live-client.ts and src/lib/refill-client.ts already follow. That guard is
 * the reason a spend cannot appear in a page's JSX by accident, so the spend moved rather than the
 * guard. This module is pinned in the same file.
 *
 * The three invalidations are the same three the refill mutation does: a new board, the picks it
 * re-stamps, and the live-price overlay (serving the old overlay against new rows is how a row ends
 * up graded against a line nobody is offering).
 */
export function useLiveBoardReprice(opts: { onFallback: () => void }) {
  const qc = useQueryClient();
  const { onFallback } = opts;
  return useMutation({
    mutationFn: async (): Promise<Record<string, unknown>> => {
      const key = getSyncKey();
      if (!key) throw new Error("sync phrase required");
      const r = await fetch("/api/generate?live=1", { headers: { "x-pl-sync": key }, cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(typeof body.error === "string" ? body.error : `generate ${r.status}`);
      /* A 200 can still be a free refusal — "ran recently" (the 45-minute limiter, deliberately
         still in force) or the per-date run cap. That is not a success to report as a re-price. */
      if (typeof body.skipped === "string") throw new Error(`the server skipped it: ${body.skipped}`);
      return body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["picks"] });
      void qc.invalidateQueries({ queryKey: MLB_LIVE_QUERY_PREFIX });
    },
    onError: (e: Error) => {
      /* THE LIMITER REFUSING IS THE SYSTEM WORKING, NOT SOMETHING TO ROUTE AROUND. This mode keeps
         the 45-minute K_LASTGEN limiter, so a second tap inside that window answers
         `skipped: "ran recently"` for free. Spending ~140 browser credits to defeat our own pacing
         would be the opposite of what the limiter is for, so that ONE case re-prices nothing and the
         note says so. Every other failure still leaves the tap owing Josh a re-price. */
      if (/ran recently/.test(e.message)) return;
      onFallback();
    },
  });
}
