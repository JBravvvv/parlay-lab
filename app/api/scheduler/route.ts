import { NextRequest, NextResponse } from "next/server";
import { createEngine } from "@/engine";
import { decide, MIN_READY, SCHED_T } from "@/lib/server/scheduler-decide";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { slateStarts } from "@/lib/server/slate";
import { BLOCKS_KEY, decideBlock, partitionBlocks, type BlockRegistry } from "@/lib/server/blocks";
import { buildLockEntry, buildReasonRecord, getLockEntry, lockExists, needsLockAction, writeLock, LOCK_SEL_MODE } from "@/lib/server/lock-card";
import { buildReadingSafe, getReading, writeReading } from "@/lib/server/self-reading";
import { ensureLedgerEpoch } from "@/lib/server/ledger-epoch-server";
import { applySuspensionLift } from "@/lib/paper-mode";
import { decideGradePass } from "@/lib/server/grading-progress";

/**
 * /api/scheduler — the brains of self-scheduling (2026-08-02, owner's architecture call:
 * Vercel, not GitHub Actions — Actions delivery here is ~56-min median with a weekend
 * collapse; the route layer and cron-job.org have been minute-precise).
 *
 * A dumb ticker pokes this every 15 minutes. Each poke: evaluate the TWO-CONDITION window
 * from statsapi (keyless, zero Odds credits) — achievable >= 0.80 AND ready >= MIN_READY —
 * and print BOTH values in the body every time. The first poke where both hold and no board
 * exists forwards to /api/generate; every other poke exits clean with the reason. Idempotent
 * by construction: board-exists, the 45-min limiter, the conditional skip and
 * MAX_RUNS_PER_DATE all still gate the spend in /api/generate itself.
 *
 * WHY FORWARD OVER A SHARED FUNCTION: /api/generate is a signed-off SPENDING route. Extracting
 * its body into a shared module is exactly the edit-in-place-on-a-signed-off-artifact shape
 * M27 exists to forbid, and a self-HTTP call with the same header exercises the identical code
 * path with every protection intact. The engine string is untouched either way — verified by
 * hash in the ship record.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 90; // the generate forward can take ~60s on a full slate

/* slateStarts moved to src/lib/server/slate.ts 2026-08-06 (one copy of the feed URL) so
   /api/generate's gen.slate scope stamp reads the same population this decision does.
   Failure semantics here are unchanged: [] -> decide() reads VACUOUS empty-schedule. */

export async function GET(req: NextRequest) {
  /* FAILS CLOSED. /api/calibrate shipped `return !cron` — allow when the secret is unset —
     because its run was cheap and idempotent. This route SPENDS ~50-91 credits a fire, so an
     unset secret is a configuration error and nothing else: 503, before anything is read. */
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "scheduler-not-configured: CRON_SECRET unset — failing closed" }, { status: 503 });
  }
  if (!cronHeaderAuthed(req)) {
    console.warn(`[scheduler] unauthorized poke ip=${req.headers.get("x-forwarded-for") ?? "?"}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });

  const date = ptToday();
  const now = Date.now();
  const starts = await slateStarts(date);
  const board = decodeBoard((await redis(["GET", BOARD_KEY(date)])) as string | null);
  const d = decide({ starts, now, boardExists: board != null });

  /* PER-BLOCK LOCKING (2026-08-08, operator requirement — §12Z.15). The day partitions
     into start-blocks (derived 90-min gap); each block gets its own two-condition window,
     its own fire, its own card. The registry (pl:blocks:{date}) is the good-BLOCK-skip:
     one fire per block, ever. A block whose games all started without a fire gets its
     ORPHAN REASON written once — no silent blocks. The day-level decide() above still
     runs for the lock self-check and body back-compat; it no longer gates the fire. */
  const blocksArr = partitionBlocks(starts);
  const reg = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(date))) ?? {}) as BlockRegistry;
  let regDirty = false;
  const blockViews = blocksArr.map((b) => {
    const dec = decideBlock({ block: b, now });
    const locked = !!reg[b.key]?.firedAt;
    const orphaned = !!reg[b.key]?.reason;
    if (!locked && !orphaned && dec.reason.startsWith("dead-block")) {
      reg[b.key] = { reason: `orphaned — window passed unfired; last conditions: ready ${dec.ready}/${dec.unstarted} of size ${dec.size}`, at: now };
      regDirty = true;
      console.warn(`[scheduler] ORPHANED BLOCK ${date} ${b.key}: window passed unfired`);
    }
    return { ...dec, locked, orphaned: orphaned || (!locked && dec.reason.startsWith("dead-block")), fire: dec.fire && !locked };
  });
  if (regDirty) await redisSetJson(BLOCKS_KEY(date), reg);
  const target = blockViews.find((v) => v.fire) ?? null;

  // BOTH conditions in every response, fired or not, PER BLOCK — the standing rule.
  const body = { date, at: new Date(now).toISOString(), T: SCHED_T, minReady: MIN_READY, blocks: blockViews, ...d };

  /* THE SELF-CHECK (2026-08-05): every poke verifies the date carries a locked card. A board
     without a lock is backfilled FROM THE STORED BOARD (the exact 08-02..08-05 gap: boards
     could exist that nothing ever locked); a dead slate with neither gets a reason record in
     the lock's place. No silent days — every date ends with a locked card or a named reason.
     MAX_RUNS and the dead-slate refusal still govern the spending path; the self-check spends
     nothing (stored board + statsapi only). */
  /* PAPER EPOCH (2026-08-15): the one-time archive-then-reset runs on whichever authed
     touch arrives first — this poke or Josh's next app-open. Idempotent, reads-only after. */
  try {
    const mig = await ensureLedgerEpoch();
    if (mig.migrated) console.log(`[scheduler] LEDGER EPOCH MIGRATED: epoch-1 blob ${mig.archived ? "archived" : "was empty"}, store reset for the paper era`);
  } catch (e) {
    console.warn(`[scheduler] epoch migration check failed: ${(e as Error).message}`);
  }
  let lock: Record<string, unknown> = { present: await lockExists(date), action: null as string | null };
  try {
    const action = needsLockAction({ boardExists: board != null, lockExists: lock.present as boolean, deadSlate: d.reason === "dead-slate" });
    if (action === "backfill" && board) {
      const eng = createEngine({
        fetchJson: () => Promise.reject(new Error("backfill lock never fetches")),
        storage: (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; })(),
      });
      const cfg = eng.get<Record<string, unknown>>("SH_CFG");
      if (cfg) {
        cfg.selMode = LOCK_SEL_MODE;
        applySuspensionLift(cfg); // backfill locks re-run the allocator — same lift as generation
      }
      const entry = buildLockEntry({ eng, data: board.data as unknown as Record<string, unknown>, date, now, trigger: "self-check-backfill" });
      await writeLock(entry);
      await writeReading(buildReadingSafe({ entry, gen: ((board.data as Record<string, unknown>).gen as never) ?? null, date, now, kind: "backfill" }));
      lock = { present: true, action: "backfilled", tickets: (entry.core as unknown[]).length };
      console.log(`[scheduler] self-check BACKFILLED the lock for ${date}: ${(entry.core as unknown[]).length} tickets`);
    } else if (action === "reason-record") {
      const rr = buildReasonRecord(date, now, `dead slate before any fire — conditions never held (last: ${d.reason === "dead-slate" ? "dead-slate" : d.reason})`);
      await writeLock(rr);
      await writeReading(buildReadingSafe({ entry: rr, gen: null, date, now, kind: "reason-record" }));
      lock = { present: true, action: "reason-recorded" };
      console.log(`[scheduler] self-check wrote a REASON RECORD for ${date} — no card could exist`);
    } else if (lock.present && !(await getReading(date))) {
      /* READING REPAIR (2026-08-06): a locked day whose reading is missing — the deploy
         straddled the fire, or the generate-side write failed. Rebuild from the stored
         artifacts; no unread days. */
      const stored = await getLockEntry(date);
      if (stored) {
        await writeReading(buildReadingSafe({ entry: stored, gen: board ? (((board.data as Record<string, unknown>).gen as never) ?? null) : null, date, now, kind: "repair" }));
        lock = { ...lock, action: "reading-repaired" };
        console.log(`[scheduler] self-check REPAIRED the missing reading for ${date}`);
      }
    }
  } catch (e) {
    lock = { ...lock, error: (e as Error).message };
    console.warn(`[scheduler] self-check failed: ${(e as Error).message}`);
  }

  if (!target) {
    /* DAILY GRADING TICKS (2026-08-06): on the first tick of hours 15 and 2 UTC, forward
       to /api/calibrate?grade=only — grades every board row + labels populations + writes
       the learning progress artifact, and touches NOTHING the engine reads (the mode's own
       write gate). Runs only on no-fire pokes: a board fire outranks the grading tick, and
       the next grading hour covers it. Zero Odds credits (statsapi + Redis). */
    let grading: Record<string, unknown>;
    const gp = decideGradePass(now);
    if (gp.fire) {
      try {
        const res = await fetch(new URL("/api/calibrate?grade=only", req.nextUrl.origin), {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          cache: "no-store",
        });
        let gBody: unknown = null;
        try { gBody = await res.json(); } catch { gBody = null; }
        grading = { fired: true, status: res.status, result: gBody };
        console.log(`[scheduler] grade-only pass: ${res.status}`);
      } catch (e) {
        grading = { fired: true, error: (e as Error).message };
      }
    } else {
      grading = { fired: false, reason: gp.reason };
    }
    return NextResponse.json({ fired: false, grading, lock, ...body });
  }

  /* Forward to the one spending route with the TARGET BLOCK, same header contract.
     Its own limiter, good-BLOCK-skip and run cap still apply — a race between two pokes
     is settled there, not here. One fire per poke; the next poke serves the next block. */
  const gen = await fetch(new URL(`/api/generate?block=${encodeURIComponent(target.key)}`, req.nextUrl.origin), {
    headers: { "x-cron-key": process.env.CRON_SECRET },
    cache: "no-store",
  });
  let genBody: unknown = null;
  try {
    genBody = await gen.json();
  } catch {
    genBody = { error: "generate returned non-JSON" };
  }
  return NextResponse.json({ fired: true, block: target.key, generateStatus: gen.status, generate: genBody, lock, ...body });
}
