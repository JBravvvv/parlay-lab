import { NextRequest, NextResponse } from "next/server";
import { syncAuthed } from "@/lib/server/store";
import { sendToAll } from "@/lib/server/push";

/** BET ALERTS — "Send test alert" (2026-10-09): one test push to every subscribed device, behind the sync phrase. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  const r = await sendToAll({ title: "Parlay Lab: test", body: "Bet alerts are on — each new bet the engine locks will show up here.", url: "/taken", tag: "test" });
  return NextResponse.json({ ok: r.delivered > 0, ...r }, { status: r.delivered > 0 ? 200 : 502 });
}
