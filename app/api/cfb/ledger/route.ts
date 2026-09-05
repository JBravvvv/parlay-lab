import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, validateLedger, type SyncEntry } from "@/lib/ledger-merge";
import { mergeBankStores, validateBankStore, type BankStore } from "@/lib/bankroll";
import { redis, redisGetJson, redisSetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";
import type { CFB_REDIS } from "@/lib/cfb/rules";

/**
 * COLLEGE FOOTBALL LEDGER SYNC (INSTRUCTION 38, 2026-09-05, Josh: "Ledger & Allotted $ for
 * College Football should be separate"). The CFB season record and the CFB bank log live under
 * their OWN two blobs in the same Upstash store the MLB ledger uses, behind the same sync
 * phrase, with the same pull → merge → push contract: GET returns the record, PUT merges the
 * sender's copy INTO it server-side (never replaces), so two devices can never race each other
 * into losing a locked Saturday.
 *
 * What this route deliberately does NOT carry: the MLB paper-epoch machinery (the CFB desk was
 * born after the 2026-08-15 clear and has no season to archive) and the NO-PLAY verdict log
 * (a CFB no-play day is a locked entry with `noPlay: true` and an empty core, on the ledger
 * itself). Every entry must declare `sport: "cfb"` — an MLB day can never land here.
 */

export const dynamic = "force-dynamic";

/* The literals are pinned here on purpose (tests/cfb-route.test.ts scans for them) and
   type-checked against the shared contract so they can never drift from CFB_REDIS. */
const STORE_KEY: typeof CFB_REDIS.ledger = "pl:cfb:ledger:v1";
const BANK_STORE_KEY: typeof CFB_REDIS.bank = "pl:cfb:bank:v1";

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

/** Every entry on the CFB rails must say so. Returns the offending date, or null when clean. */
function nonCfbDate(entries: SyncEntry[]): string | null {
  for (const e of entries) if (e.sport !== "cfb") return e.date;
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
  const foreign = nonCfbDate(v.entries);
  if (foreign) return NextResponse.json({ error: `entry ${foreign} is not a cfb entry (sport must be "cfb")` }, { status: 400 });
  // bank is optional on the wire but validated when sent
  let sentBank: BankStore | null = null;
  if (body.bank != null) {
    const vb = validateBankStore(body.bank);
    if (!vb.ok) return NextResponse.json({ error: vb.error }, { status: 400 });
    sentBank = vb.store;
  }
  try {
    const cur = await readStore();
    const merged = mergeLedgers(cur?.ledger ?? [], v.entries);
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
