import { NextRequest, NextResponse } from "next/server";
import { accessOf, handleAction, handleReport, type ActionBody } from "@/lib/server/anytime";
import { upstashKv } from "@/lib/server/anytime-kv";

/**
 * THE ANY-TIME LEDGER (2026-11-12). Behind the sync phrase, like /api/ledger.
 *
 *   GET  /api/anytime[?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200]
 *        The report, computed from the raw ledger: DraftKings, FanDuel and combined; flat and
 *        Kelly bankrolls; splits by sport, market, trigger and model; calibration; the newest
 *        rows; the heartbeat; the Arizona exclusion list; the last runs.
 *
 *   POST /api/anytime   { action: "not-in-az", id, exclude?: true }
 *        Mark a pick not available in Arizona: it leaves every result, and its market type joins
 *        the exclusion list. The pick itself is never rewritten.
 *   POST /api/anytime   { action: "allow-market", marketType }
 *        Take a market type back off the stored exclusion list.
 *
 * Neither verb spends an Odds API credit. Running the engine is POST /api/anytime/run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (out: { status: number; body: Record<string, unknown> }) =>
  NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return json(await handleReport(accessOf(req), { from: q.get("from"), to: q.get("to"), limit: q.get("limit") }, upstashKv(), Date.now()));
}

export async function POST(req: NextRequest) {
  let body: ActionBody | null = null;
  try {
    const raw = await req.text();
    if (raw.length <= 2000) body = JSON.parse(raw) as ActionBody;
  } catch {
    body = null;
  }
  return json(await handleAction(accessOf(req), body, upstashKv(), Date.now()));
}
