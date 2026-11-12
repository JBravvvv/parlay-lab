import { NextRequest, NextResponse } from "next/server";
import { accessOf, handleRun, runAnytime } from "@/lib/server/anytime";

/**
 * RUN PICKS NOW (any-time engine, 2026-11-12).
 *
 *   POST /api/anytime/run            header x-pl-sync: <phrase>     (the app button, the CLI, an API call)
 *   POST /api/anytime/run            header x-cron-key: <secret>    (a scheduler; Authorization: Bearer works too)
 *
 *   optional:  header x-pl-trigger: manual-ui | manual-api | cli    how a sync-phrase caller names itself
 *              ?event=line-move      what woke the engine, recorded as trigger "event:line-move"
 *              ?sports=nfl,cfb       only these sports
 *              ?force=1              price now, ignoring the time-to-start cadence (manual callers default to this)
 *
 * Every caller reaches the SAME function. There is no slot, no window, no once-a-day guard and no
 * pick cap in front of it: what stops a second pick is the ledger's own re-entry rule, and what
 * stops two callers at once is the run lease.
 *
 * POST only: a run can spend Odds API credits, so it is never a GET. Secrets travel in headers,
 * never in the URL. Fails closed (503) when the store or every secret is unset. Never rethrows.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const out = await handleRun(
    accessOf(req),
    { hint: req.headers.get("x-pl-trigger"), event: q.get("event"), sports: q.get("sports"), force: q.get("force") },
    runAnytime,
  );
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
