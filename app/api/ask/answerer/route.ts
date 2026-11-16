import { NextRequest, NextResponse } from "next/server";
import { askKv, handleAnswer, handleTake, type AskAccess, type Out } from "@/lib/server/ask-mailbox";
import { redis, storeEnv } from "@/lib/server/store";

/**
 * ASK CLAUDE, the answering chat's side (2026-11-16). Behind the pairing code (x-pl-ask), which the
 * owner's device made and the owner pasted into that chat; only its hash is ever stored.
 *
 *   GET  /api/ask/answerer   takes the waiting question, once: { q } or { q: null }
 *   POST /api/ask/answerer   { id, legIds, summary }: the answer to a question from this mailbox
 *
 * Without the code it answers 401 and says nothing else. Spends no Odds API credit.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (o: Out) => NextResponse.json(o.body, { status: o.status, headers: { "cache-control": "no-store" } });
const access = (req: NextRequest): AskAccess => ({ synced: false, configured: !!storeEnv(), code: req.headers.get("x-pl-ask") });

export async function GET(req: NextRequest) {
  try {
    return json(await handleTake(access(req), askKv(redis)));
  } catch {
    return json({ status: 502, body: { q: null, error: "store" } });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    const raw = await req.text();
    if (raw.length <= 8_000) body = JSON.parse(raw);
  } catch {
    body = null;
  }
  try {
    return json(await handleAnswer(access(req), body, askKv(redis), Date.now()));
  } catch {
    return json({ status: 502, body: { ok: false, error: "store" } });
  }
}
