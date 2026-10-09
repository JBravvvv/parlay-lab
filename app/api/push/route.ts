import { NextRequest, NextResponse } from "next/server";
import { syncAuthed, storeEnv } from "@/lib/server/store";
import { addSub, readSubs, removeSub, validSub, vapid } from "@/lib/server/push";

/**
 * BET ALERTS — this device's subscription (2026-10-09). GET says whether alerts are configured and hands
 * out the PUBLIC key a browser subscribes with (public by design). POST stores this device's push
 * subscription and DELETE removes it — both behind the same sync phrase the Ledger uses, so only Josh's
 * devices can sign up for his alerts.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const v = vapid();
  const authed = syncAuthed(req);
  return NextResponse.json({
    configured: !!v && !!storeEnv(),
    publicKey: v?.publicKey ?? null,
    ...(authed ? { devices: (await readSubs().catch(() => [])).length } : {}),
  });
}

export async function POST(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  if (!vapid()) return NextResponse.json({ error: "alerts-not-configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null;
  if (!validSub(body?.subscription)) return NextResponse.json({ error: "bad-subscription" }, { status: 400 });
  const devices = await addSub(body!.subscription as never, Date.now(), req.headers.get("user-agent") ?? undefined);
  return NextResponse.json({ ok: true, devices });
}

export async function DELETE(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "bad-endpoint" }, { status: 400 });
  return NextResponse.json({ ok: true, devices: await removeSub(body.endpoint) });
}
