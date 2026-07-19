import { NextRequest, NextResponse } from "next/server";
import type { SyncEntry } from "@/lib/ledger-merge";
import { ledgerSegments } from "@/lib/ledger-segments";
import type { WeightState } from "@/engine2/calibration";
import { redis, redisGetJson, storeEnv, syncAuthed } from "@/lib/server/store";

/**
 * Upgrade 03 — the weekly receipt. One payload answers "is the engine earning
 * or am I paying for variance?": 7-day staked / P/L, CLV by segment, override
 * P/L, coverage, and calibration drift (the weights log). Computed from the
 * cloud ledger on demand; sync-phrase gated — staked dollars and P/L are
 * personal records, not public aggregates.
 */

export const dynamic = "force-dynamic";

const STORE_KEY = "pl:ledger:v1";

export async function GET(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  try {
    const raw = (await redis(["GET", STORE_KEY])) as string | null;
    const ledger: SyncEntry[] = raw ? ((JSON.parse(raw) as { ledger?: SyncEntry[] }).ledger ?? []) : [];
    const seg = ledgerSegments(ledger);
    const weights = await redisGetJson<WeightState>("pl:cal:weights");
    return NextResponse.json({
      ok: true,
      at: Date.now(),
      days: ledger.length,
      ...seg,
      drift: (weights?.log ?? []).slice(-5),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
