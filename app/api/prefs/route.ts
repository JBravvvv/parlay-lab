import { NextRequest, NextResponse } from "next/server";
import {
  CZ_MAX_BYTES,
  mergeCzHidden,
  pruneCzHidden,
  validateCzHidden,
  type CzHiddenMap,
} from "@/lib/cz-hidden-merge";
import { redis, redisGetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";

/**
 * Device preference sync — one tiny record in Upstash Redis, shared by every
 * device Josh signs in with the sync phrase (the SAME phrase as ledger sync;
 * he types it once per device in Settings — it is never entered for him).
 * Today it carries exactly one preference: the Caesars ⓘ toggle map.
 *
 * GET returns it; PUT merges the sender's copy INTO it server-side (never
 * replaces — last-write-wins per key by `at`, see cz-hidden-merge.ts), so two
 * devices can never race each other into resurrecting a hidden pick or losing
 * an unhide. Display-only: nothing here reaches the engine, card, or record.
 */

export const dynamic = "force-dynamic";

const STORE_KEY = "pl:prefs:v1";
type Stored = { czHidden: CzHiddenMap; at: number };

function gate(req: NextRequest): NextResponse | null {
  const missing = syncConfigMissing();
  if (missing.length) {
    return NextResponse.json({ error: "sync-not-configured", missing }, { status: 503 });
  }
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  return null;
}

async function readStore(): Promise<Stored | null> {
  const s = await redisGetJson<Stored>(STORE_KEY);
  if (!s?.czHidden) return null;
  const v = validateCzHidden(s.czHidden);
  return v.ok ? { czHidden: v.map, at: s.at } : null;
}

export async function GET(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  try {
    const s = await readStore();
    return NextResponse.json({ czHidden: s?.czHidden ?? {}, at: s?.at ?? null });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  let body: { czHidden?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const v = validateCzHidden(body.czHidden);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const cur = await readStore();
    const merged = pruneCzHidden(mergeCzHidden(cur?.czHidden ?? {}, v.map), Date.now());
    if (JSON.stringify(merged).length > CZ_MAX_BYTES) {
      return NextResponse.json({ error: "merged prefs too large" }, { status: 413 });
    }
    const at = Date.now();
    await redis(["SET", STORE_KEY, JSON.stringify({ czHidden: merged, at } satisfies Stored)]);
    return NextResponse.json({ ok: true, czHidden: merged, at });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
