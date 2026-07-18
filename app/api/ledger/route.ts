import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, validateLedger, type SyncEntry } from "@/lib/ledger-merge";
import { redis, syncAuthed, syncConfigMissing } from "@/lib/server/store";

/**
 * Ledger cloud sync — one tiny record ("the season ledger") in Upstash Redis,
 * shared by every device Josh signs in with the sync phrase. GET returns it,
 * PUT merges the sender's copy INTO it server-side (never replaces), so two
 * devices can never race each other into losing a locked day.
 *
 * Config (all in Vercel env): the Upstash pair (or KV_ pair) + LEDGER_SYNC_KEY;
 * requests carry the phrase as x-pl-sync. Missing config → 503
 * "sync-not-configured": the app shows setup steps instead of an error.
 */

export const dynamic = "force-dynamic";

const STORE_KEY = "pl:ledger:v1";

function gate(req: NextRequest): NextResponse | null {
  const missing = syncConfigMissing();
  if (missing.length) {
    return NextResponse.json({ error: "sync-not-configured", missing }, { status: 503 });
  }
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  return null;
}

type Stored = { ledger: SyncEntry[]; at: number };

async function readStore(): Promise<Stored | null> {
  const raw = (await redis(["GET", STORE_KEY])) as string | null;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Stored;
    return Array.isArray(s.ledger) ? s : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  try {
    const s = await readStore();
    return NextResponse.json({ ledger: s?.ledger ?? [], at: s?.at ?? null });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  let body: { ledger?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const v = validateLedger(body.ledger);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const cur = await readStore();
    const merged = mergeLedgers(cur?.ledger ?? [], v.entries);
    if (JSON.stringify(merged).length > MAX_BYTES) {
      return NextResponse.json({ error: "merged ledger too large" }, { status: 413 });
    }
    const at = Date.now();
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at } satisfies Stored)]);
    return NextResponse.json({ ok: true, ledger: merged, at });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
