import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { validateLedger, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { buildLockEntry, needsLockAction, LEDGER_STORE_KEY } from "@/lib/server/lock-card";
import { readFileSync } from "node:fs";
import { stripComments } from "./helpers/source";

/**
 * LOCK-AT-GENERATION (2026-08-05, operator requirement: EVERY day produces a locked card).
 *
 * ── THE LEDGERED ASTERISK THIS CLOSES ────────────────────────────────────────────────
 * Lock-at-generation was AUTHORIZED 2026-08-02, asterisked as unshipped on 08-02 evening and
 * again on 08-03, and was still absent when the 08-03/08-04/08-05 audit found three slate days
 * with zero boards and zero locks. A promise carried as an asterisk is not a ship; this file
 * and src/lib/server/lock-card.ts are the ship. OBSERVED RED 2026-08-05: this file ran before
 * the module existed (module-not-found), then each case against the spec.
 *
 * ── THE DESIGN, in one paragraph ─────────────────────────────────────────────────────
 * The generate path itself writes the locked card as part of board creation — one artifact,
 * one commit of the run, not a separate step that can silently not ship again. Empty-gate days
 * lock a ZERO-TICKET card carrying the blocked-reason histogram: a no-bet day is data. The
 * scheduler self-checks every poke: board-without-lock → backfill from the stored board;
 * dead slate with neither → a reason record in the lock's place. No silent days: every date
 * carries either a locked card or a named reason.
 */

const T9 = 300_000;

/**
 * MEASURED BEFORE THESE TESTS WERE TRUSTED: on the armed fixture with the engine's default
 * (selMode undefined -> ev_gated, coreEvMin 2), shAllocate returns ZERO picks at daily 75 AND
 * 250 — the disciplined gate clears nothing, so every "stakes equal" assertion would pass over
 * an EMPTY card (a vacuous green, the exact standing-rule failure). The mechanics tests
 * therefore run in probability mode, which fills the card; the ev_gated empty card is tested
 * on its own as the decision-record path, which is ALSO production's common case initially.
 */
async function fixtureLock(mode: string | null = "probability") {
  vi.setSystemTime(FROZEN_NOW);
  const eng = armedFixtureEngine();
  if (mode) eng.get<Record<string, unknown>>("SH_CFG").selMode = mode;
  const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
  return { eng, d, entry: buildLockEntry({ eng: eng as never, data: d, date: "2026-07-10", now: Date.parse("2026-07-10T03:30:00Z"), trigger: "test" }) };
}

describe("buildLockEntry — the card the system locks for itself", () => {
  it("locks the allocator's card: every pick becomes a ticket, stakes EQUAL element-wise", async () => {
    const { entry } = await fixtureLock();
    expect(entry.locked).toBe(true);
    expect(entry.date).toBe("2026-07-10");
    expect(Array.isArray(entry.core)).toBe(true);
    /* IMPOSSIBLE BRANCH, encoded where it can actually fire: locked stakes differing from the
       allocator's computed stakes = two allocators. buildLockEntry THROWS on any mismatch, so
       the branch is a crash with both numbers printed, never a quietly wrong card. Here we
       assert the constructive half: the entry's stakes are the alloc's, by value. */
    const stakes = (entry.core as { stake: number }[]).map((t) => t.stake);
    expect(stakes.length, "ZERO picks — this test is vacuous; use a mode that fills the card").toBeGreaterThan(0);
    expect(stakes.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
    expect((entry as { allocSum?: number }).allocSum).toBe(stakes.reduce((a, b) => a + b, 0));
  }, T9);

  it("PAPER EPOCH (2026-08-15, Josh's standing word): every ticket is born placed:false, actualStake:0, paper:true", async () => {
    /* EPOCH-1 FORM OF THIS CASE (kept for the record): placed:null / actualStake:null
       THROUGHOUT — null meant UNANSWERED and the system never answered for Josh.
       OBSERVED RED 2026-08-15 against the paper implementation, then flipped: Josh's
       word "I will not be taking ANY of the bets" IS the answer, given once, standing —
       so paper tickets are born placed:false (a decision on record), not null. */
    const { entry } = await fixtureLock();
    expect((entry as { paper?: boolean }).paper).toBe(true);
    for (const t of [...(entry.core as { placed?: unknown; actualStake?: unknown; paper?: unknown }[]), ...(entry.funT as { placed?: unknown; actualStake?: unknown; paper?: unknown }[])]) {
      expect(t.placed, "a paper ticket without the standing not-placed answer").toBe(false);
      expect(t.actualStake).toBe(0);
      expect(t.paper).toBe(true);
    }
  }, T9);

  it("carries lockedAt, trigger, selMode, the daily amount used, and the games map for the grader", async () => {
    const { entry } = await fixtureLock();
    expect(entry.lockedAt).toBe(Date.parse("2026-07-10T03:30:00Z"));
    expect(entry.trigger).toBe("test");
    expect(typeof entry.daily).toBe("number");
    const games = entry.games as Record<string, { pk?: number | null }>;
    expect(Object.keys(games).length, "no games map — the grader keys off entry.games").toBeGreaterThan(0);
    expect(Object.values(games).some((g) => g.pk != null)).toBe(true);
  }, T9);

  it("GATE-CLEARS-NOTHING day under PAPER: the forced top-up deploys anyway — every ticket forced:true, gatedSum 0", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    /* EPOCH-1 FORM (kept for the record): the engine default (ev_gated) clears NOTHING on
       this fixture, and the day locked a ZERO-ticket decision record. OBSERVED RED
       2026-08-15: the paper implementation filled this exact card with 5 forced tickets —
       "$150 every single day no matter what" (Josh's word) means the gated no-bet verdict
       is recorded (gatedSum 0, forced flags) but hypothetical money still deploys. */
    const entry = buildLockEntry({ eng: eng as never, data: d, date: "2026-07-10", now: FROZEN_NOW, trigger: "test" });
    expect(entry.locked).toBe(true);
    const core = entry.core as { stake: number; forced?: boolean }[];
    expect(core.length, "the paper top-up deployed nothing on a pool the probability mode fills").toBeGreaterThan(0);
    expect(core.every((t) => t.forced === true), "a gate-cleared-nothing day produced an unforced ticket — two allocators disagree about the gate").toBe(true);
    expect((entry as { gatedSum?: number }).gatedSum).toBe(0);
    const deployed = core.reduce((a, t) => a + t.stake, 0);
    expect((entry as { allocSum?: number }).allocSum).toBe(deployed);
    expect(deployed, "caesars_ev top-up broke its exact-sum guarantee").toBe(entry.daily);
    const hist = (entry as { blockedReasons?: Record<string, number> }).blockedReasons;
    expect(hist, "the gated no-bet verdict lost its reasons — the decision record must survive the top-up").toBeTruthy();
    expect(typeof hist).toBe("object");
  }, T9);

  it("the entry VALIDATES and MERGES: a re-lock of the same day cannot clobber or duplicate", async () => {
    const { entry } = await fixtureLock();
    const v = validateLedger([entry as SyncEntry]);
    expect(v.ok, `the lock entry fails the ledger's own validator: ${v.ok ? "" : v.error}`).toBe(true);
    const merged = mergeLedgers([entry as SyncEntry], [entry as SyncEntry]);
    expect(merged.length).toBe(1);
    /* and a graded copy outranks a fresh re-lock — append-only accrual survives.
       FIRST DRAFT OF THIS CASE WAS WRONG, and the merge caught it: `grading.done:true` with an
       EMPTY tickets map over a card with real ids is exactly what mergeDay's reopen rule
       flips back to false — ungraded tickets reopen grading BY DESIGN. The graded copy must
       actually grade its tickets for "done" to survive, so it does. */
    const graded = JSON.parse(JSON.stringify(entry)) as SyncEntry;
    const tix: Record<string, unknown> = {};
    /* paper epoch: funT is staked at lock now too — "done" must grade EVERY ticket,
       core AND fun, or the reopen rule flips it back by design */
    for (const t of [...graded.core, ...(graded.funT ?? [])]) if (t.id) tix[t.id] = { result: "won" };
    graded.grading = { done: true, tickets: tix, legs: {} };
    const m2 = mergeLedgers([graded], [entry as SyncEntry]);
    expect(m2[0].grading?.done, "a fresh re-lock clobbered a graded day").toBe(true);
  }, T9);

  it("PLANT (invalid-by-value): a stake mismatch is a THROW naming two allocators", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    eng.get<Record<string, unknown>>("SH_CFG").selMode = "probability"; // a card must EXIST to skew
    const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    expect(() =>
      buildLockEntry({ eng: eng as never, data: d, date: "2026-07-10", now: FROZEN_NOW, trigger: "test", __plantStakeSkew: true }),
    ).toThrow(/two allocators/i);
  }, T9);
});

describe("DUAL-MODE TRACKING (2026-08-21, Josh's word, verbatim: \"Change it to 'DK/FD' basis but track bets for both internally so it can calibrate either selection.\")", () => {
  it("every entry carries the OTHER disciplined selection's card as `alt`, same paper stamps, own money lane", async () => {
    const { entry } = await fixtureLock(); // probability primary → alt is dk_fd
    const alt = (entry as SyncEntry).alt;
    expect(alt, "the alt selection's card is missing from the entry").toBeTruthy();
    expect(alt!.selMode).toBe("dk_fd");
    for (const t of alt!.core) {
      expect(t.paper, "an alt ticket without the paper stamp").toBe(true);
      expect(t.placed).toBe(false);
      expect(t.actualStake).toBe(0);
    }
    expect(alt!.gatedSum).toBeLessThanOrEqual(alt!.allocSum);
    /* the alt world NEVER leaks into the day's money: allocSum is exactly the sum of
       core stakes, with the alt card's stakes nowhere in it */
    const coreSum = (entry.core as { stake: number }[]).reduce((s, t) => s + t.stake, 0);
    expect((entry as { allocSum?: number }).allocSum).toBe(coreSum);
  }, T9);

  it("a dk_fd primary (production since 2026-08-21) tracks ev_gated as the alt", async () => {
    const { entry } = await fixtureLock("dk_fd");
    expect((entry as SyncEntry).alt?.selMode).toBe("ev_gated");
  }, T9);

  it("merge preserves `alt` when a graded pre-ship client copy wins pickBase", async () => {
    const { entry } = await fixtureLock();
    /* the client copy: pulled before the dual-mode ship (no alt), then graded — grading
       richness makes it the pickBase winner, and it must NOT drop the server's alt */
    const client = JSON.parse(JSON.stringify(entry)) as SyncEntry;
    delete (client as Record<string, unknown>).alt;
    const tix: Record<string, unknown> = {};
    for (const t of [...client.core, ...(client.funT ?? [])]) if (t.id) tix[t.id] = { result: "won" };
    client.grading = { done: true, tickets: tix, legs: {} };
    for (const order of [[client, entry as SyncEntry], [entry as SyncEntry, client]] as const) {
      const m = mergeLedgers([order[0]], [order[1]]);
      expect(m[0].alt, "the graded client copy dropped the server's alt record").toBeTruthy();
      expect(m[0].grading?.done, "preserving alt cost the grading accrual").toBe(true);
    }
  }, T9);
});

describe("needsLockAction — the self-check, every branch", () => {
  it("board without lock → backfill; neither on a dead slate → reason record; locked → nothing", () => {
    expect(needsLockAction({ boardExists: true, lockExists: false, deadSlate: false })).toBe("backfill");
    expect(needsLockAction({ boardExists: true, lockExists: false, deadSlate: true })).toBe("backfill");
    expect(needsLockAction({ boardExists: false, lockExists: false, deadSlate: true })).toBe("reason-record");
    expect(needsLockAction({ boardExists: false, lockExists: false, deadSlate: false })).toBe(null);
    expect(needsLockAction({ boardExists: true, lockExists: true, deadSlate: false })).toBe(null);
    expect(needsLockAction({ boardExists: false, lockExists: true, deadSlate: true })).toBe(null);
  });
});

describe("the store key mirror", () => {
  it("LEDGER_STORE_KEY matches the ledger route's own literal", () => {
    const route = stripComments(readFileSync("app/api/ledger/route.ts", "utf8"));
    const m = route.match(/const STORE_KEY = "([^"]+)"/);
    expect(m?.[1], "the ledger route's STORE_KEY literal moved").toBeTruthy();
    expect(LEDGER_STORE_KEY, "lock-card writes a DIFFERENT redis key than the ledger reads — locks would vanish").toBe(m?.[1]);
  });
});
