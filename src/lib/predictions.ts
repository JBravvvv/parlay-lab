"use client";

import type { BoardData } from "@/engine";
import { boardToPredictions } from "./pred-serialize";
import { getSyncKey } from "./ledgerSync";

/**
 * Client write-side of calibration 3A: after an on-device board generate,
 * push the serialized board to /api/predictions. The serializer itself lives
 * in pred-serialize.ts (pure) so /api/generate — the Vercel-side daily
 * generation — shares it byte for byte.
 *
 * Fail-silent by contract: if anything here throws or the store is missing,
 * board generation proceeds exactly as it does today.
 */

export type { DayBlob, DayGames, ParlayPred, PredRecord } from "./pred-serialize";
export { boardToPredictions } from "./pred-serialize";

/** Fire-and-forget push after a board generates. Never throws. */
export async function logBoardPredictions(date: string, d: BoardData): Promise<void> {
  try {
    const key = getSyncKey();
    if (!key) return; // no sync phrase on this device — the Vercel cron still logs daily
    const payload = boardToPredictions(d);
    if (!payload.records.length) return;
    await fetch("/api/predictions", {
      method: "PUT",
      headers: { "x-pl-sync": key, "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ date, ...payload }),
    });
  } catch {
    /* fail-silent by spec — the board is never blocked by calibration */
  }
}
