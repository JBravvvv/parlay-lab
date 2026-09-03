import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { validateLedger, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { buildLockEntry, needsLockAction, LEDGER_STORE_KEY } from "@/lib/server/lock-card";
import { CORE_RULES, PAPER } from "@/lib/paper-mode";
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
    const core = entry.core as { stake: number; forced?: boolean; czDec?: number | null; bsDec?: number | null }[];
    /* INSTRUCTION 18 (2026-09-03): the forced pass now seats ONLY tickets priced ≤ 1.75
       (CORE_RULES.forcedMaxDec) by true probability. MEASURED on this fixture: the
       cheapest ≤2-leg pool ticket settles at 1.9091, so the forced pass legitimately
       finds nothing and the day is a $0 decision record with its histogram — the
       "deploys anyway" half of this pin is retired; the forced-only/gatedSum-0 half
       stays, asserted over whatever the pass seats (nothing here, by measurement). */
    expect(core.every((t) => t.forced === true), "a gate-cleared-nothing day produced an unforced ticket — two allocators disagree about the gate").toBe(true);
    for (const t of core) expect(Math.max(Number(t.czDec ?? 0), Number(t.bsDec ?? 0))).toBeLessThanOrEqual(1.75);
    expect((entry as { gatedSum?: number }).gatedSum).toBe(0);
    const deployed = core.reduce((a, t) => a + t.stake, 0);
    expect((entry as { allocSum?: number }).allocSum).toBe(deployed);
    expect(deployed + Number((entry as { capResidue?: number }).capResidue ?? 0), "deployed + the cap-stranded residue must account for the whole budget").toBe(entry.daily);
    expect(String((entry as { note?: string }).note), "a $0 day must say so").toMatch(/paper day/);
    /* 2026-08-22, Josh's word: "a max of 7 tickets for the daily core card" — the
       08-22 card reached 14 because only the forced pass honored the ceiling */
    expect(core.length, "the core card exceeded the 7-ticket day ceiling").toBeLessThanOrEqual(7);
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

describe("THE RESIDUE TOP-UP (2026-08-22 — the 08-22 card: 14 tickets, $132 of $150, 'the 10-ticket day ceiling was reached before the budget')", () => {
  /* A mock engine shaped like the failing fire: the disciplined allocator sizes ONE pick
     at $12 of a $46 budget (Kelly leaves the rest unallocated by design) and the forced
     pass finds no seat — six tickets are already carried, the window is 1. Before this
     ship the fire deployed $12 and stranded $34; now the residue rides that pick. */
  function mockEng(gatedStake: number) {
    const pl = { name: "Mock single", czEv: 3.1, czDec: 2.2, legs: [{ label: "A (NYY)", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", gkey: "g1" }] };
    return {
      get<T>(k: string): T {
        if (k === "SH_CFG") return { maxCoreTickets: 6, minCoreTickets: 4, selMode: "dk_fd" } as T;
        if (k === "SH") return { bankroll: 750 } as T;
        if (k === "shCardPool") return ((_b: unknown) => [{ pl, src: "p", idx: 0 }]) as T;
        if (k === "shTicketId") return ((x: { name?: string }) => `id-${x.name ?? "fun"}`) as T;
        if (k === "shAllocate") {
          return ((_p: unknown, amount: number, cfg: { selMode?: string; maxCoreTickets?: number }) => {
            if (cfg.selMode === "caesars_ev") return { picks: [], sum: 0, blocked: [] }; // no seat / nothing disjoint
            if ((cfg.maxCoreTickets ?? 0) < 1) return { picks: [], sum: 0, blocked: [] };
            const stake = Math.min(gatedStake, amount);
            return { picks: [{ id: "id-Mock single", stake, w: { pl } }], sum: stake, blocked: [], unallocated: amount - stake };
          }) as T;
        }
        return null as T;
      },
    };
  }
  const carry6 = {
    date: "2026-08-22", locked: true, lockedAt: 1, allocSum: 86, gatedSum: 86,
    core: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, stake: 10, legs: [{ label: `P${i} (BOS)`, prop: "Hits O 0.5" }], paper: true, placed: false, actualStake: 0 })),
    funT: [], games: {},
  };
  it("the fire deploys its WHOLE budget: the allocator's $12 pick carries the $34 residue as a stamped topUp", () => {
    const entry = buildLockEntry({
      eng: mockEng(12) as never,
      data: { gameInfo: { g1: { pk: 1, start: "2026-08-23T00:05:00Z" } }, categories: {} } as never,
      date: "2026-08-22", now: Date.parse("2026-08-22T23:40:00Z"), trigger: "test",
      dailyOverride: 46, carry: carry6 as never,
    });
    const fresh = (entry.core as { id: string; stake: number; topUp?: number; forced?: boolean }[]).filter((t) => t.id === "id-Mock single");
    expect(fresh.length, "the fire's new ticket is missing").toBe(1);
    /* INSTRUCTION 18 (2026-09-03, CORE_RULES.maxStake 25 — stakes ≥ $20 ran −33..−36%
       ROI over the 19 paper days): the residue rides the ticket only UP TO the $25
       ceiling ($12 + $13), and the $21 no ticket can absorb is stamped capResidue with
       a note — never a $46 ticket. Pin updated, not deleted. */
    expect(fresh[0].stake, "the residue breached the $25 ceiling").toBe(25);
    expect(fresh[0].topUp, "the allocator's own sizing must stay recoverable (stake − topUp)").toBe(13);
    expect((entry as { allocSum?: number }).allocSum).toBe(86 + 25);
    expect((entry as { gatedSum?: number }).gatedSum, "gatedSum records the allocator's sizing, not the top-up").toBe(86 + 12);
    expect((entry as { topUpSum?: number }).topUpSum).toBe(13);
    expect((entry as { capResidue?: number }).capResidue).toBe(21);
    expect(String((entry as { note?: string }).note)).toMatch(/\$21 left unallocated because the \$25 per-ticket ceiling/);
    expect((entry.core as unknown[]).length).toBeLessThanOrEqual(7);
  });
  it("a fire with NO seat and NO new ticket still cannot invent money — the shortfall note names it", () => {
    const carry7 = { ...carry6, core: [...carry6.core, { id: "c6", stake: 10, legs: [{ label: "P6 (BOS)", prop: "Hits O 0.5" }], paper: true, placed: false, actualStake: 0 }] };
    const entry = buildLockEntry({
      eng: mockEng(12) as never,
      data: { gameInfo: { g1: { pk: 1, start: "2026-08-23T00:05:00Z" } }, categories: {} } as never,
      date: "2026-08-22", now: Date.parse("2026-08-22T23:40:00Z"), trigger: "test",
      dailyOverride: 46, carry: carry7 as never,
    });
    expect((entry.core as unknown[]).length).toBe(7);
    expect(String((entry as { note?: string }).note)).toMatch(/7-ticket day ceiling left this fire no seat/);
  });
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

/**
 * INSTRUCTION 18 (2026-09-03, operator Josh, verbatim: "I would say change everything that
 * you think is necessary to optimize this engine/website and get it on track to start
 * making theoretical money. ... Lets make this app an UNSTOPPABLE theoretical money
 * makin' machine"). The CORE_RULES in paper-mode.ts carry the diagnosis figures; these
 * cases pin them on the armed fixture in "probability" mode (the mode that fills the
 * card — every assertion below refuses to pass over an empty one).
 * OBSERVED RED 2026-09-03 before the rules landed (3-leg tickets, dec 11.97, $150 singles).
 */
describe("INSTRUCTION 18 — the 2026-09-03 core rules on the locked card", () => {
  it("2 legs max · dec ≤ 2.6 · no HRR over · every stake ≤ $25 · forced ≤ 1.75 · shrunk numbers with raw beside them · fun == $25", async () => {
    const { entry } = await fixtureLock();
    const core = entry.core as { stake: number; forced?: boolean; czDec?: number | null; bsDec?: number | null; prob?: number | null; probRaw?: number | null; czEvRaw?: number | null; topUp?: number; legs: { lkey?: string | null; prop?: string | null }[] }[];
    expect(core.length, "ZERO picks — vacuous; the probability mode must fill the card").toBeGreaterThan(0);
    for (const t of core) {
      expect(t.legs.length, `${t.legs.length}-leg core ticket`).toBeLessThanOrEqual(CORE_RULES.maxLegs);
      const settling = t.bsDec ?? t.czDec;
      expect(Number(settling), "a core ticket priced above the 2.6 ceiling").toBeLessThanOrEqual(CORE_RULES.maxDec);
      expect(Number(t.czDec)).toBeLessThanOrEqual(CORE_RULES.maxDec);
      for (const l of t.legs) {
        const mkt = String(l.lkey ?? "").split("|")[1];
        expect(mkt === "batter_hits_runs_rbis" && String(l.prop ?? "").includes(" O "), `HRR over on core: ${l.prop}`).toBe(false);
      }
      expect(t.stake, "a core stake above $25").toBeLessThanOrEqual(CORE_RULES.maxStake);
      if (t.forced) expect(Math.max(Number(t.czDec ?? 0), Number(t.bsDec ?? 0))).toBeLessThanOrEqual(CORE_RULES.forcedMaxDec);
      expect(typeof t.probRaw, "probRaw missing — the pre-shrink number must stay recoverable").toBe("number");
      expect(typeof t.prob).toBe("number");
      expect("czEvRaw" in t).toBe(true);
    }
    /* the shrink moved the numbers: on this fixture at least one ticket's model prob sat
       above its market read, so its shrunk prob is strictly below probRaw */
    const moved = core.filter((t) => Number(t.prob) < Number(t.probRaw));
    expect(moved.length, "no ticket shrank — the pool was not mapped through shrinkTicket").toBeGreaterThan(0);
    const hist = (entry as { blockedReasons?: Record<string, unknown> }).blockedReasons ?? {};
    expect(typeof hist.hrr_over_suspended, "hrr_over_suspended must be a number on every record").toBe("number");
    expect(typeof hist.core_shape_rules).toBe("number");
    expect((entry as { coreRules?: unknown }).coreRules).toEqual(CORE_RULES);
    const fun = entry.funT as { type: string; stake: number }[];
    expect(fun.reduce((a, t) => a + t.stake, 0)).toBe(PAPER.fun);
    /* MEASURED on this fixture: the CZ-priced Hits O 0.5 rows span only 2 teams (WSH,
       NYY) and no HRR row carries a CZ price, so the ladder cannot seat and the $25
       falls back to the HR composer — the seated case is pinned in tests/fun-ladder.test.ts */
    expect(fun.every((t) => t.type === "fun_hr" || t.type === "fun_ladder")).toBe(true);
    /* the entry still validates with the extra fields */
    expect(validateLedger([entry as SyncEntry]).ok).toBe(true);
  }, T9);

  it("the alt world reads the same shrunk pool: every alt ticket carries probRaw too and obeys the same shape", async () => {
    const { entry } = await fixtureLock();
    const alt = (entry as SyncEntry).alt!;
    for (const t of alt.core as { stake: number; probRaw?: unknown; legs: unknown[] }[]) {
      expect(typeof t.probRaw).toBe("number");
      expect(t.legs.length).toBeLessThanOrEqual(CORE_RULES.maxLegs);
      expect(t.stake).toBeLessThanOrEqual(CORE_RULES.maxStake);
    }
  }, T9);

  it("HRR overs are counted out of the pool on this fixture (3 pool tickets carry one)", async () => {
    const { entry } = await fixtureLock();
    expect((entry as { blockedReasons?: Record<string, number> }).blockedReasons?.hrr_over_suspended).toBe(3);
  }, T9);
});
