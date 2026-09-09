import { NextRequest, NextResponse } from "next/server";
import { createEngine } from "@/engine";
import { decide, MIN_READY, SCHED_T } from "@/lib/server/scheduler-decide";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { slateStarts } from "@/lib/server/slate";
import { BLOCKS_KEY, dayConsumed, decideBlock, decideTopUp, partitionBlocks, type BlockRegistry } from "@/lib/server/blocks";
import { buildLockEntry, buildReasonRecord, getLockEntry, lockExists, needsLockAction, readShapeCalibration, writeLock, LOCK_SEL_MODE } from "@/lib/server/lock-card";
import { buildReadingSafe, getReading, writeReading } from "@/lib/server/self-reading";
import { ensureLedgerEpoch } from "@/lib/server/ledger-epoch-server";
import { PAPER, TOPUP_MAX, applySuspensionLift } from "@/lib/paper-mode";
import { applyEnvClosedForm } from "@/lib/env-adjust";
import { decideGradePass } from "@/lib/server/grading-progress";
import { attachCfb, forwardCfbLock } from "@/lib/server/cfb-lock-forward";
import type { CfbForwardResult } from "@/lib/server/cfb-lock-forward";
import { attachNfl, forwardNflLock, type NflForwardResult } from "@/lib/server/nfl-lock-forward";

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
/* BUDGET, STATED HONESTLY (INSTRUCTION 45, 2026-09-06; the NFL forward added 2026-09-08): this
   90 s now also has to cover the TWO football forwards below. The generate forward is sent with
   NO signal and NO timeout at either call site, so ~60 s of generate plus the football forwards'
   25 s abort (CFB_LOCK.forwardTimeoutMs, NFL_LOCK.forwardTimeoutMs — both 25_000) is
   25_000 + 60_000 = 85_000 — FIVE seconds of headroom, and a generate slower than 65 s kills
   the invocation before that abort can bind. The 5 s headroom still holds with the NFL forward
   added because the two forwards run CONCURRENTLY (Promise.allSettled): the tick's worst case is
   max(cfb 25 s, nfl 25 s) + the ~60 s generate, not their sum. What IS guaranteed is that the
   forwards are the tick's LAST step, after mlbTick has answered and after /api/generate has
   committed under its own 300 s budget: a platform kill costs the poke its HTTP answer and that
   pulse's football locks, never an MLB write, and the next pulse retries. Closing the 5 s gap for
   real means timing the generate fetch, which this change does not touch. */

/* slateStarts moved to src/lib/server/slate.ts 2026-08-06 (one copy of the feed URL) so
   /api/generate's gen.slate scope stamp reads the same population this decision does.
   Failure semantics here are unchanged: [] -> decide() reads VACUOUS empty-schedule. */

/**
 * THE CFB SELF-FORWARD (INSTRUCTION 45, 2026-09-05, Josh verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day"). The
 * MLB tick below is unchanged, byte for byte, and runs FIRST; only once it has answered does the
 * poke forward to /api/cfb/lock with the same cron header (the pattern the generate forward
 * uses) and report that answer under `cfb`. Fire-and-report: a CFB failure of any kind becomes
 * `{ forwarded: false, error }` and never changes the MLB body or status.
 *
 * ── TWO DEFECTS FOUND IN REVIEW OF THE FIRST CUT (2026-09-06) ────────────────────────────────
 *
 * (1) THE FORWARD WAS NOT ACTUALLY CAUGHT. The first cut did a bare
 *     `const cfb = await forwardCfbLock(...)`. forwardCfbLock is total today — its own try/catch
 *     returns `{ forwarded: false, error }` — but the whole point of the fire-and-report contract
 *     is that the CFB desk can never cost the MLB poke its answer, and a bare await makes that
 *     property live in the OTHER file: one edit inside the helper (or an AbortSignal.timeout
 *     construction throwing before the try) and a rejection escapes GET, Next renders the poke as
 *     a bodyless 500, and the MLB tick's already-computed answer is destroyed by the CFB desk —
 *     exactly what this wrapper claims is impossible. tests/scheduler-route.test.ts case (b)
 *     pinned it and it FAILED with `Error: ECONNRESET`. The `.catch` below moves the guarantee
 *     into this file, where the claim is made.
 *
 * (2) THE GATE WAS THE MLB OUTCOME, NOT AUTHORISATION. The first cut read
 *     `if (res.status !== 200 || !process.env.CRON_SECRET) return res;`, so ANY non-200 from
 *     mlbTick returned before the forward was ever attempted — the MLB-SIDE OUTAGES among them,
 *     and those are the ones that must never cost the CFB day: mlbTick answers 503
 *     `sync-not-configured` when storeEnv() is false, and Next renders any unhandled throw inside
 *     it as a bodyless 500. vercel.json declares crons only for /api/scheduler, so there is
 *     NO other path to /api/cfb/lock: one MLB-side outage silently cost the CFB desk the entire
 *     $150/$25 day, nothing written, no CFB-side signal. That is the very failure INSTRUCTION 45
 *     exists to stop. The gate is therefore AUTHORISATION and nothing else:
 *       - CRON_SECRET unset  → return the tick's answer untouched; there is no secret to forward
 *         with, and the CFB route carries the identical fails-closed gate and would 503 anyway.
 *       - not cronHeaderAuthed → return untouched. THIS IS LOAD-BEARING: an unauthenticated public
 *         poke must never be able to make the SERVER reach /api/cfb/lock carrying the real secret.
 *
 *     CORRECTION (2026-09-06): an earlier draft of this docblock listed the tick's 401 among the
 *     MLB-SIDE outages above, which reads as though the new gate ought to forward a 401. It does
 *     not, and it MUST NOT. The tick's 401 (a header problem) and its CRON_SECRET-unset 503 are
 *     AUTHORISATION, not outage, and the gate refuses both BY NAME before the forward —
 *     cronHeaderAuthed(req) is false in the first case, process.env.CRON_SECRET is unset in the
 *     second — so the MLB answer returns untouched and the server never reaches /api/cfb/lock
 *     carrying the real secret off an unauthenticated public poke. Read the two bullets above as
 *     licence to "fix" the gate into letting a 401 through and you re-open precisely that attack.
 *     What now forwards that did not before is the MLB-SIDE 503 and the 500, and nothing else.
 *     Same correction, same day, in docs/cfb-desk.md (INSTRUCTION 45 bullet) and in the PIN
 *     REWRITTEN note in tests/scheduler-route.test.ts; all three say this.
 *
 *     Past that gate the forward runs whatever the MLB tick answered, and attachCfb copies the MLB
 *     status and every MLB field through untouched with `cfb` as the only added key — the 503
 *     JSON body gets `cfb` and keeps its status; the bodyless 500, which attachCfb cannot parse,
 *     is returned as-is.
 */
export async function GET(req: NextRequest) {
  const res = await mlbTick(req);
  if (!process.env.CRON_SECRET || !cronHeaderAuthed(req)) return res;
  const secret = process.env.CRON_SECRET;
  /* THE TWO FOOTBALL FORWARDS, CONCURRENT (2026-09-08): allSettled, so a REJECTED forward on
     either desk degrades to { forwarded: false, error } instead of escaping GET, and the tick's
     worst case stays max(cfb, nfl) + generate — see the BUDGET note above maxDuration. */
  const [cfbR, nflR] = await Promise.allSettled([forwardCfbLock(req.nextUrl.origin, process.env.CRON_SECRET), forwardNflLock(req.nextUrl.origin, secret)]);
  const cfb: CfbForwardResult = cfbR.status === "fulfilled" ? cfbR.value : { forwarded: false, error: (cfbR.reason as Error).message };
  const nfl: NflForwardResult = nflR.status === "fulfilled" ? nflR.value : { forwarded: false, error: (nflR.reason as Error).message };
  if (!cfb.forwarded) console.warn(`[scheduler] cfb lock forward failed: ${cfb.error}`);
  if (!nfl.forwarded) console.warn(`[scheduler] nfl lock forward failed: ${nfl.error}`);
  /* attach in order: `cfb` then `nfl`, each the only key its step adds; the MLB status rides through */
  const withCfb = await attachCfb(res, cfb);
  const base = withCfb ? NextResponse.json(withCfb.body, { status: withCfb.status }) : res;
  const out = await attachNfl(base, nfl);
  return out ? NextResponse.json(out.body, { status: out.status }) : base;
}

async function mlbTick(req: NextRequest): Promise<NextResponse> {
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
        applyEnvClosedForm(cfg);
      }
      /* INSTRUCTION 46 self-calibration (wired fix round 2026-09-08): same read as generate —
         fail-safe null → rotation only */
      const shapeCal = await readShapeCalibration(date).catch(() => null);
      const entry = buildLockEntry({ eng, data: board.data as unknown as Record<string, unknown>, date, now, trigger: "self-check-backfill", shapeCal });
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
    /* TOP-UP SWEEP (2026-08-19, Josh's word, verbatim: "I said $150 every day no matter
       what so we could track and calibrate off of it" — after the 08-19 card deployed
       $49). When every block has fired or died, the paper day is still short, and
       pregame games remain, forward a plain generate with ?topup=1 for fresh prices —
       evening props post late, which is exactly when the earlier fires found a thin
       pool. decideTopUp is pure and printed every poke; generate's 45-min limiter,
       run-cap headroom, and TOPUP_MAX registry cap govern the actual spend. */
    let topup: Record<string, unknown>;
    /* CANNOT FILL FURTHER IS TERMINAL (fix round 2026-09-08, INSTRUCTION 46 seating): when
       every open slot the day still carries is named `cannot fill further` — carried legacy
       money that no slot could seat is occupying their share of the $150 — a top-up would
       rebuild the same seating, deploy $0 and spend ~120 Odds credits doing it. The sweep
       stops here, before decideTopUp reads the shortfall as money it can still place. A day
       whose open slots include ordinary shortfalls (thin pool, gate) still sweeps as before. */
    const lockEntry = await getLockEntry(date);
    const unfilled = ((lockEntry as { slotsUnfilled?: { reason?: unknown }[] } | null)?.slotsUnfilled ?? []).filter((u) => u && typeof u === "object");
    const cannotFill = unfilled.length > 0 && unfilled.every((u) => String(u.reason ?? "").includes("cannot fill further"));
    const tu = cannotFill
      ? {
          fire: false,
          reason: `cannot fill further — the day's ${unfilled.length} open slot${unfilled.length === 1 ? "" : "s"} hold no seat for the carried money; a top-up would change nothing`,
          owed: Math.max(0, PAPER.daily - dayConsumed(lockEntry as Record<string, unknown> | null)),
          used: Object.keys(reg ?? {}).filter((k) => k.startsWith("topup-")).length,
        }
      : decideTopUp({
          entry: lockEntry,
          blocks: blocksArr,
          registry: reg,
          starts,
          now,
          daily: PAPER.daily,
          max: TOPUP_MAX,
        });
    if (tu.fire) {
      const gen = await fetch(new URL("/api/generate?topup=1", req.nextUrl.origin), {
        headers: { "x-cron-key": process.env.CRON_SECRET },
        cache: "no-store",
      });
      let genBody: unknown = null;
      try {
        genBody = await gen.json();
      } catch {
        genBody = { error: "generate returned non-JSON" };
      }
      console.log(`[scheduler] TOP-UP fired for ${date}: owed $${tu.owed}, generate ${gen.status}`);
      return NextResponse.json({ fired: true, topup: tu, generateStatus: gen.status, generate: genBody, lock, ...body });
    }
    topup = tu as unknown as Record<string, unknown>;
    /* DAILY GRADING TICKS (2026-08-06; cadence re-pinned 2026-09-08, INSTRUCTION 46b): on the
       first tick after each GRADE_SLOTS_PT time — 08:00/09:30/12:00/15:00/16:45 Pacific, all
       inside the cron-job.org poke window (grading-progress.ts) — forward
       to /api/calibrate?grade=only — grades every board row + labels populations + writes
       the learning progress artifact, and touches NOTHING the engine reads (the mode's own
       write gate). Runs only on no-fire pokes: a board fire outranks the grading tick, and
       the next grading slot covers it. Zero Odds credits (statsapi + Redis). */
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
    return NextResponse.json({ fired: false, topup, grading, lock, ...body });
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
