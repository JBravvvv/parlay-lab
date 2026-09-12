"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { todayStr } from "@/lib/engine-client";
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
/* WHAT THIS PASS COST, ON THE SAME FOOTING AS THE BROWSER ONE (review round, 2026-09-12). The
   refresh note's spend line counted ONLY browser re-prices (engine-client's pl_gencount), so the
   passes that cost the most — a full server generate, the same 114-150 credits — were the invisible
   half of the day's bill, and a night of taps could read "1 browser re-price today" while six server
   generates had been bought. Same shape as generatesToday(), same Pacific day, same rule: this
   counts to be SEEN, it never blocks a tap.

   localStorage is read before todayStr() on purpose — on the server render the read throws, the
   catch returns 0, and the engine singleton is never built during SSR. */
const SERVER_REPRICE_KEY = "pl_livegencount"; // {date, n} — board-only server passes today

/** Board-only server re-prices billed to today (Pacific). 0 in private mode or before any tap. */
export function serverRepricesToday(): number {
  try {
    const v = JSON.parse(localStorage.getItem(SERVER_REPRICE_KEY) ?? "{}") as { date?: string; n?: number };
    if (!v.date) return 0;
    return v.date === todayStr() ? Number(v.n) || 0 : 0;
  } catch {
    return 0;
  }
}

function noteServerReprice() {
  try {
    localStorage.setItem(SERVER_REPRICE_KEY, JSON.stringify({ date: todayStr(), n: serverRepricesToday() + 1 }));
  } catch {
    /* private mode — the counter just stays at 0 */
  }
}

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
      noteServerReprice();
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["picks"] });
      void qc.invalidateQueries({ queryKey: MLB_LIVE_QUERY_PREFIX });
    },
    onError: () => {
      /* EVERY FAILURE FALLS BACK — INCLUDING "ran recently" (review round, 2026-09-12). The first
         cut returned early on the 45-minute limiter, which re-created the exact defect INSTRUCTION
         50 item 1 exists to kill: a Refresh tap that buys nothing, stores nothing and re-prices
         nothing, on the one slate Josh is actually watching. The limiter is the SERVER's pacing on
         the STORED board and it still holds — no second server generate is bought inside the window.
         What it must not do is cancel the device re-price the tap has always produced: the browser
         pass is the one engine-client deliberately never gates ("this counter exists to make the
         spend VISIBLE, never to block it ... nothing should stop a bet"). So the server declines to
         re-buy, the note says exactly that, and Josh still gets fresh numbers in front of him. */
      onFallback();
    },
  });
}
