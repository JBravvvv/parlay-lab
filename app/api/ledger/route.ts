import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, validateLedger, type SyncEntry } from "@/lib/ledger-merge";
import { mergeBankStores, validateBankStore, type BankStore } from "@/lib/bankroll";
import { mergeNoPlayLogs, validateNoPlayLog, type NoPlayLog } from "@/lib/noplay";
import { redis, redisGetJson, redisSetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";
import { LEDGER_EPOCH, mergeAllowed } from "@/lib/ledger-epoch";
import { ensureLedgerEpoch } from "@/lib/server/ledger-epoch-server";

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
/* Hardening Phase 1: the bankroll adjustment log rides the same sync (same
   gate, same durability) under its own blob. Merging is append-only union —
   the server never replaces the log, so no device can erase another's entry. */
const BANK_STORE_KEY = "pl:bank:v1";
type StoredBank = { bank: BankStore; at: number };

async function readBank(): Promise<BankStore | null> {
  const s = await redisGetJson<StoredBank>(BANK_STORE_KEY);
  if (!s?.bank) return null;
  const v = validateBankStore(s.bank);
  return v.ok ? v.store : null;
}

/* Hardening Phase 3: the NO-PLAY verdict log — the "honored" half of override
   accountability — syncs on the same rails. Append-only union by date. */
const NOPLAY_STORE_KEY = "pl:noplay:v1";
type StoredNoPlay = { noplay: NoPlayLog; at: number };

async function readNoPlay(): Promise<NoPlayLog | null> {
  const s = await redisGetJson<StoredNoPlay>(NOPLAY_STORE_KEY);
  if (!s?.noplay) return null;
  const v = validateNoPlayLog(s.noplay);
  return v.ok ? v.log : null;
}

function gate(req: NextRequest): NextResponse | null {
  const missing = syncConfigMissing();
  if (missing.length) {
    return NextResponse.json({ error: "sync-not-configured", missing }, { status: 503 });
  }
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  return null;
}

type Stored = { ledger: SyncEntry[]; at: number; epoch?: number };

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
    await ensureLedgerEpoch(); // PAPER EPOCH: lazy one-time archive-then-reset (idempotent)
    const [s, bank, noplay] = await Promise.all([readStore(), readBank(), readNoPlay()]);
    return NextResponse.json({ ledger: s?.ledger ?? [], bank, noplay, at: s?.at ?? null, epoch: s?.epoch ?? LEDGER_EPOCH });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  let body: { ledger?: unknown; bank?: unknown; epoch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  try {
    await ensureLedgerEpoch();
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
  /* RESURRECTION GATE (2026-08-15): a sender that does not know the current epoch — a
     stale cached bundle, or a device that has not pulled since the clear — gets the
     current state back and its LEDGER entries are NOT merged (bank/noplay below are
     append-only logs and still merge). Without this, one old phone heartbeat would
     push the whole cleared season straight back into the store. */
  if (!mergeAllowed(body.epoch)) {
    try {
      const [s, bank, noplay] = await Promise.all([readStore(), readBank(), readNoPlay()]);
      return NextResponse.json({ ledger: s?.ledger ?? [], bank, noplay, at: s?.at ?? null, epoch: s?.epoch ?? LEDGER_EPOCH, staleEpoch: true });
    } catch (e) {
      return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
    }
  }
  const v = validateLedger(body.ledger);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // bank is optional on the wire (older clients omit it) but validated when sent
  let sentBank: BankStore | null = null;
  if (body.bank != null) {
    const vb = validateBankStore(body.bank);
    if (!vb.ok) return NextResponse.json({ error: vb.error }, { status: 400 });
    sentBank = vb.store;
  }
  let sentNoPlay: NoPlayLog | null = null;
  if ((body as { noplay?: unknown }).noplay != null) {
    const vn = validateNoPlayLog((body as { noplay?: unknown }).noplay);
    if (!vn.ok) return NextResponse.json({ error: vn.error }, { status: 400 });
    sentNoPlay = vn.log;
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
    let noplay = await readNoPlay();
    if (sentNoPlay) {
      noplay = noplay ? mergeNoPlayLogs(noplay, sentNoPlay) : sentNoPlay;
      await redisSetJson(NOPLAY_STORE_KEY, { noplay, at } satisfies StoredNoPlay);
    }
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at, epoch: LEDGER_EPOCH } satisfies Stored)]);
    return NextResponse.json({ ok: true, ledger: merged, bank, noplay, at, epoch: LEDGER_EPOCH });
  } catch (e) {
    return NextResponse.json({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
