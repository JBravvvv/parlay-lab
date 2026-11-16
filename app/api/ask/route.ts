import { NextRequest, NextResponse } from "next/server";
import { askKv, handleAsk, handleRead, type AskAccess, type Out } from "@/lib/server/ask-mailbox";
import { redis, storeEnv, syncAuthed } from "@/lib/server/store";

/**
 * ASK CLAUDE, the page's side (2026-11-16). Behind the sync phrase.
 *
 *   POST /api/ask        x-pl-sync + x-pl-ask (the device's pairing code); body = the question
 *   GET  /api/ask?id=…   x-pl-sync; the answer, or null while Claude is still choosing
 *
 * No key and no call to Claude from here: the question waits in a mailbox that the owner's own
 * Claude chat collects (app/api/ask/answerer). Spends no Odds API credit.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (o: Out) => NextResponse.json(o.body, { status: o.status, headers: { "cache-control": "no-store" } });
const access = (req: NextRequest): AskAccess => ({ synced: syncAuthed(req), configured: !!storeEnv() && !!process.env.LEDGER_SYNC_KEY, code: req.headers.get("x-pl-ask") });

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    const raw = await req.text();
    if (raw.length <= 16_000) body = JSON.parse(raw);
  } catch {
    body = null;
  }
  try {
    return json(await handleAsk(access(req), body, askKv(redis), Date.now()));
  } catch {
    return json({ status: 502, body: { ok: false, error: "store" } });
  }
}

export async function GET(req: NextRequest) {
  try {
    return json(await handleRead(access(req), req.nextUrl.searchParams.get("id"), askKv(redis)));
  } catch {
    return json({ status: 502, body: { ok: false, error: "store" } });
  }
}
