import { NextResponse } from "next/server";
import { handleHealth } from "@/lib/server/anytime";
import { upstashKv } from "@/lib/server/anytime-kv";
import { storeEnv } from "@/lib/server/store";

/**
 * IS THE PICK ENGINE ALIVE? (2026-11-12)
 *
 *   GET /api/anytime/health      public, read-only, free
 *
 * 200 { state: "ok" } while a run has finished inside the stale limit and the last one succeeded;
 * 503 with state "stale" | "failed" | "never" | "unconfigured" | "unreachable" otherwise. It tells
 * a stranger nothing but that: no pick, price, credit count or error text. Point any uptime
 * monitor at it and a dead scheduler is noticed within one missed run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out = await handleHealth(!!storeEnv(), upstashKv(), Date.now());
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
