import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, validateLedger, type SyncEntry } from "@/lib/ledger-merge";
import { restoreShrunkDays } from "@/lib/append-only";
import { mergeBankStores, validateBankStore, type BankStore } from "@/lib/bankroll";
import { redis, redisGetJson, redisSetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";
import type { NFL_REDIS } from "@/lib/nfl/rules";

/**
 * NFL LEDGER SYNC (2026-09-08, Josh: "NFL needs to be built NOW  3. Allocation should be set to
 * $350"). The NFL twin of the College Football ledger route: the NFL season record and the NFL
 * bank log live under their OWN two blobs in the same Upstash store the other desks use, behind
 * the same sync phrase, with the same pull → merge → push contract: GET returns the record, PUT
 * merges the sender's copy INTO it server-side (never replaces), so two devices can never race
 * each other into losing a locked Sunday. The merge kernel (src/lib/ledger-merge.ts) caps each
 * NFL day at NFL_PAPER.daily by the entry's own `sport`.
 *
 * What this route deliberately does NOT carry: the MLB paper-epoch machinery and the NO-PLAY
 * verdict log (an NFL no-play day is a locked entry with `noPlay: true` and an empty core, on
 * the ledger itself). Every entry must declare `sport: "nfl"` — a College Football day or an MLB
 * day can never land here.
 */

export const dynamic = "force-dynamic";

/* The literals are pinned here on purpose (tests/nfl-routes.test.ts scans for them) and
   type-checked against the shared contract so they can never drift from NFL_REDIS. */
const STORE_KEY: typeof NFL_REDIS.ledger = "pl:nfl:ledger:v1";
const BANK_STORE_KEY: typeof NFL_REDIS.bank = "pl:nfl:bank:v1";

type Stored = { ledger: SyncEntry[]; at: number };
type StoredBank = { bank: BankStore; at: number };

function gate(req: NextRequest): NextResponse | null {
  const missing = syncConfigMissing();
  if (missing.length) {
    return NextResponse.json({ error: "sync-not-configured", missing }, { status: 503 });
  }
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  return null;
}

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

async function readBank(): Promise<BankStore | null> {
  const s = await redisGetJson<StoredBank>(BANK_STORE_KEY);
  if (!s?.bank) return null;
  const v = validateBankStore(s.bank);
  return v.ok ? v.store : null;
}

/** Every entry on the NFL rails must say so. Returns the offending date, or null when clean. */
function nonNflDate(entries: SyncEntry[]): string | null {
  for (const e of entries) if (e.sport !== "nfl") return e.date;
  return null;
}

export async function GET(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  try {
    const [s, bank] = await Promise.all([readStore(), readBank()]);
    return NextResponse.json({ ledger: s?.ledger ?? [], bank, at: s?.at ?? null });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  let body: { ledger?: unknown; bank?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const v = validateLedger(body.ledger);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const foreign = nonNflDate(v.entries);
  if (foreign) return NextResponse.json({ error: `entry ${foreign} is not an nfl entry (sport must be "nfl")` }, { status: 400 });
  // bank is optional on the wire but validated when sent
  let sentBank: BankStore | null = null;
  if (body.bank != null) {
    const vb = validateBankStore(body.bank);
    if (!vb.ok) return NextResponse.json({ error: vb.error }, { status: 400 });
    sentBank = vb.store;
  }
  try {
    const cur = await readStore();
    const merged0 = mergeLedgers(cur?.ledger ?? [], v.entries);
    /* INSTRUCTION 48 (2026-09-09, Josh: "it can never remove a pick it can only add to it"):
       a device copy that wins the merge must not shrink or resize a locked day the server
       wrote — see restoreShrunkDays. The reply carries the corrected ledger and the client
       adopts it, so the phone converges on the server card. */
    const guarded = restoreShrunkDays(cur?.ledger ?? [], merged0, (e) => e.source === "server-lock");
    for (const r of guarded.restored) console.warn(`[nfl-ledger] APPEND ONLY: kept the stored ${r.date} card over the device copy — ${r.violation}`);
    const merged = guarded.ledger;
    if (JSON.stringify(merged).length > MAX_BYTES) {
      return NextResponse.json({ error: "merged ledger too large" }, { status: 413 });
    }
    const at = Date.now();
    let bank = await readBank();
    if (sentBank) {
      bank = bank ? mergeBankStores(bank, sentBank) : sentBank;
      await redisSetJson(BANK_STORE_KEY, { bank, at } satisfies StoredBank);
    }
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at } satisfies Stored)]);
    return NextResponse.json({ ok: true, ledger: merged, bank, at });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
