import { NextRequest, NextResponse } from "next/server";
import { createEngine } from "@/engine";
import { decide, MIN_READY, SCHED_T } from "@/lib/server/scheduler-decide";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { cronHeaderAuthed, redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { slateStarts } from "@/lib/server/slate";
import { BLOCKS_KEY, decideBlock, partitionBlocks, type BlockRegistry } from "@/lib/server/blocks";
import { buildLockEntry, buildReasonRecord, getLockEntry, lockExists, needsLockAction, readShapeCalibration, writeLock, LOCK_SEL_MODE } from "@/lib/server/lock-card";
import { buildReadingSafe, getReading, writeReading } from "@/lib/server/self-reading";
import { ensureLedgerEpoch } from "@/lib/server/ledger-epoch-server";
import { applySuspensionLift } from "@/lib/paper-mode";
import { applyEnvClosedForm } from "@/lib/env-adjust";
import { decideGradePass, decideRefillTick } from "@/lib/server/grading-progress";
import { decideMlbRefill, forwardMlbRefill, readMlbDay } from "@/lib/server/refill";
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
   the invocation before that abort can bind. SUPERSEDED (INSTRUCTION 49 fix round, 2026-09-09):
   the two football forwards now START TOGETHER WITH mlbTick (see GET), so the tick's worst case
   is max(cfb 25 s, nfl 25 s, ~60 s generate) ≈ 60 s — 30 s of headroom, and a slow generate no
   longer delays the football locks or their refill slot. What IS still guaranteed: /api/generate
   commits under its own 300 s budget, so a platform kill costs the poke its HTTP answer, never
   an MLB write; a football forward that already returned has already written its day. */

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
  /* THE GATE, BEFORE ANYTHING IS FORWARDED: the same two predicates as before (CRON_SECRET set,
     cronHeaderAuthed) — an unauthenticated poke never makes the server reach a lock route
     carrying the real secret. mlbTick still answers its own 503/401 for those pokes. */
  const authed = !!process.env.CRON_SECRET && cronHeaderAuthed(req);
  /* THE TWO FOOTBALL FORWARDS START WITH THE MLB TICK, NOT AFTER IT (INSTRUCTION 49 fix round,
     2026-09-09). They used to wait for mlbTick's answer; on a refill tick that answer includes a
     ~60 s generate, and the football routes decide the slot from their own clock — so a slow
     MLB generate (or a platform kill at maxDuration 90) silently cost CFB/NFL the whole slot,
     with no claim row and no retry until the next slot. Now: the slot is decided ONCE here, at
     the tick's clock, and forwarded as ?slot= so both desks agree about which slot this tick
     is; the forwards run concurrently with the MLB tick under allSettled (a REJECTED forward on
     either desk degrades to { forwarded: false, error } instead of escaping GET); and the
     tick's worst case is max(cfb 25 s, nfl 25 s, ~60 s generate), not their sum — see the
     BUDGET note above maxDuration. The gate is unchanged: nothing starts unless authed. */
  const secret = process.env.CRON_SECRET ?? "";
  const tickSlot = decideRefillTick(Date.now()).slot;
  const football = authed
    ? Promise.allSettled([forwardCfbLock(req.nextUrl.origin, secret, undefined, tickSlot), forwardNflLock(req.nextUrl.origin, secret, undefined, tickSlot)])
    : null;
  const res = await mlbTick(req);
  if (!football) return res;
  const [cfbR, nflR] = await football;
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
     because its run was cheap and idempotent. This route SPENDS a full generate a fire
     (114-150 Odds credits measured, app/api/generate/route.ts:46; a block fire prices the
     whole slate — collectSlate takes no scope), so an unset secret is a configuration error
     and nothing else: 503, before anything is read. */
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
  if (regDirty) {
    /* ADDITIVE, NOT A WRITE-BACK (INSTRUCTION 48 fix round, 2026-09-09, defect 10): writing the
       whole object read above would drop a `topup-N` row a concurrent generate wrote in between
       (a re-poke while the previous poke's forwarded sweep is still running) — under-counting
       `used` by one and losing the empty-sweep marker. Re-read and overlay only the orphan rows. */
    const orphanRows: BlockRegistry = {};
    for (const b of blocksArr) if (reg[b.key]?.reason && !reg[b.key]?.firedAt) orphanRows[b.key] = reg[b.key];
    const fresh = ((await redisGetJson<BlockRegistry>(BLOCKS_KEY(date))) ?? {}) as BlockRegistry;
    await redisSetJson(BLOCKS_KEY(date), { ...fresh, ...orphanRows });
  }
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
       pool. The decision (src/lib/server/refill.ts decideMlbRefill → decideTopUp) is
       pure and printed every poke; generate's run-cap headroom and TOPUP_MAX registry
       cap govern the actual spend.
       INSTRUCTION 48 (2026-09-09, Josh: "it can lock multiple times per day, but it can
       never remove a pick it can only add to it"): the card only grows — every fire
       carries the day's tickets verbatim and assertAppendOnly (src/lib/append-only.ts)
       throws before any write that would drop or resize one.
       INSTRUCTION 49 (2026-09-09, Josh: "It shouldn't be refreshing every 15 minutes. It
       should be 8am, 9:30am, 12pm, 3pm & 4:45pm"): the sweep fires ONLY on the first tick
       inside a REFILL_SLOTS_PT window (decideRefillTick — the grading calendar), up to
       TOPUP_MAX (6) a day; the slot is carried to generate (?slot=) and stamped on the
       registry row so a second poke in the same window is refused free. No cooldown any
       more (TOPUP_EMPTY_RETRY_MS is unwired). Josh's own Refresh (POST /api/refill) runs
       the identical pass with slot "manual" at any time. The free decision runs FIRST and
       the slot gate is applied to its answer, so an off-slot poke still prints the day's
       real refusal (no lock / owed / cap / …) when there is one. */
    const rt = decideRefillTick(now);
    /* readMlbDay re-reads the registry on purpose (not the `reg` above): the orphan overlay may
       have just written, and a generate can land between the two reads — the fresh copy is the
       one the same-slot / cap gates must see. One extra Redis GET a poke, deliberately. */
    const day = await readMlbDay(date, { starts });
    /* an off-slot tick prints the day's free reason with NO slot — never "manual", which would
       apply the manual-headroom gate (Josh's clicks only) to the ticker */
    const tu0 = decideMlbRefill({ ...day, now, ...(rt.slot ? { slot: rt.slot } : {}) });
    const topup: Record<string, unknown> = tu0.fire && !rt.fire ? { ...tu0, fire: false, slot: null, reason: rt.reason } : { ...tu0, slot: rt.slot };
    const refillFires = topup.fire === true;
    /* DAILY GRADING TICKS (2026-08-06; cadence re-pinned 2026-09-08, INSTRUCTION 46b): on the
       first tick after each GRADE_SLOTS_PT time — 08:00/09:30/12:00/15:00/16:45 Pacific, all
       inside the cron-job.org poke window (grading-progress.ts) — forward
       to /api/calibrate?grade=only — grades every board row + labels populations + writes
       the learning progress artifact, and touches NOTHING the engine reads (the mode's own
       write gate). Runs on no-fire pokes only (a block fire outranks it). Zero Odds credits.
       INSTRUCTION 49: the refill and the grading share the same slots, so the two forwards
       run TOGETHER (allSettled) — a refill no longer starves the grading pass. */
    const gp = decideGradePass(now);
    const [gen, cal] = await Promise.allSettled([
      refillFires ? forwardMlbRefill({ origin: req.nextUrl.origin, secret: process.env.CRON_SECRET, slot: rt.slot! }) : Promise.resolve(null),
      gp.fire ? gradeForward(req.nextUrl.origin, process.env.CRON_SECRET) : Promise.resolve(null),
    ]);
    const grading = await gradingReport(gp, cal);
    if (refillFires) {
      const g = gen.status === "fulfilled" && gen.value ? gen.value : { generateStatus: 0, generate: { error: gen.status === "rejected" ? (gen.reason as Error).message : "no forward" } };
      console.log(`[scheduler] REFILL ${rt.slot} fired for ${date}: owed $${tu0.owed}, generate ${g.generateStatus}`);
      return NextResponse.json({ fired: true, topup, grading, generateStatus: g.generateStatus, generate: g.generate, lock, ...body });
    }
    return NextResponse.json({ fired: false, topup, grading, lock, ...body });
  }

  /* Forward to the one spending route with the TARGET BLOCK, same header contract.
     Its own limiter, good-BLOCK-skip and run cap still apply — a race between two pokes
     is settled there, not here. One fire per poke; the next poke serves the next block. */
  /* A BLOCK FIRE ON A SLOT TICK NO LONGER EATS THAT SLOT'S GRADING (INSTRUCTION 49 fix round,
     2026-09-09): blocks become ready 3 h before first pitch, so a block target on the 08:00 or
     09:30 tick is the common weekend shape, and the next tick is outside the window. The grading
     forward runs beside the block generate under allSettled, exactly as in the no-target branch.
     The slot's REFILL is deliberately not run here — a block fire is itself a full re-price that
     appends, and decideTopUp would hold it anyway ("a block can still fire"). */
  const gp = decideGradePass(now);
  const [genR, calR] = await Promise.allSettled([
    fetch(new URL(`/api/generate?block=${encodeURIComponent(target.key)}`, req.nextUrl.origin), {
      headers: { "x-cron-key": process.env.CRON_SECRET },
      cache: "no-store",
    }),
    gp.fire ? gradeForward(req.nextUrl.origin, process.env.CRON_SECRET) : Promise.resolve(null),
  ]);
  const grading = await gradingReport(gp, calR);
  if (genR.status === "rejected") {
    return NextResponse.json({ fired: true, block: target.key, generateStatus: 0, generate: { error: (genR.reason as Error).message }, grading, lock, ...body });
  }
  const gen = genR.value;
  let genBody: unknown = null;
  try {
    genBody = await gen.json();
  } catch {
    genBody = { error: "generate returned non-JSON" };
  }
  return NextResponse.json({ fired: true, block: target.key, generateStatus: gen.status, generate: genBody, grading, lock, ...body });
}

/** the grade-only forward — /api/calibrate?grade=only with the Bearer spelling; zero Odds credits */
function gradeForward(origin: string, secret: string): Promise<Response> {
  return fetch(new URL("/api/calibrate?grade=only", origin), {
    headers: { authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
}

/** the `grading` field both mlbTick branches print, from the pass decision and the settled forward */
async function gradingReport(gp: { fire: boolean; reason: string }, cal: PromiseSettledResult<Response | null>): Promise<Record<string, unknown>> {
  if (!gp.fire) return { fired: false, reason: gp.reason };
  if (cal.status === "rejected") return { fired: true, error: (cal.reason as Error).message };
  const res = cal.value as Response;
  let gBody: unknown = null;
  try { gBody = await res.json(); } catch { gBody = null; }
  console.log(`[scheduler] grade-only pass: ${res.status}`);
  return { fired: true, status: res.status, result: gBody };
}
