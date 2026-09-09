import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { validateLedger, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { buildLockEntry, needsLockAction, writeLock, LEDGER_STORE_KEY } from "@/lib/server/lock-card";
import { CORE_RULES, PAPER, slotMaxDec } from "@/lib/paper-mode";
import { SHAPE_TICKETS, shapeById, type ShapeCalibration } from "@/lib/core-shapes";
import { readFileSync } from "node:fs";
import { stripComments } from "./helpers/source";

/* INSTRUCTION 48 (2026-09-09): `writeLock` is exercised below against an in-memory Redis. Nothing
   else in this file reaches the store (buildLockEntry is pure; the shape-calibration cases are
   source scans), so the mock is inert for every other describe. */
vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), storeEnv: vi.fn() };
});
import { redis } from "@/lib/server/store";

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
       08-22 card reached 14 because only the forced pass honored the ceiling.
       PIN UPDATED 2026-09-08 (INSTRUCTION 46): the ceiling is the day's shape — at most
       SHAPE_TICKETS.max (5) slots on the menu, one ticket per slot. */
    expect(core.length, "the core card exceeded the shape's slot count").toBeLessThanOrEqual(SHAPE_TICKETS.max);
    expect(String((entry as { shapeLine?: string }).shapeLine)).toMatch(/^shape: /);
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

/**
 * INSTRUCTION 46 — SLOT FILLING (2026-09-08, "Parlay Lab Baseball 1", Josh's word,
 * verbatim: "Should consider doing some higher $ 2 team parlays. Hypothetically could be 2
 * $60 2 leg parlays one day w/ 3 $10 3-4 leg parlays one day, 5 $30 2 leg parlays the
 * next, …"). The 2026-08-22 RESIDUE TOP-UP suite that lived here (a $12 pick carrying a
 * $34 residue under the 7-ticket window, then the 09-03 $25 cap) is RETIRED by this ship,
 * not deleted from the record: its two mechanisms — the count window and the per-ticket
 * cap — are replaced by the slot. The mock engine below is shaped like the allocator's
 * contract: one pick per call from the pool it is handed, sized to `amount` (or the
 * Kelly-style `kelly` ceiling when set), refusing tickets flagged gated:false unless the
 * call is the probability (forced) pass.
 */
describe("INSTRUCTION 46 — slot filling on a mock pool (2026-09-08)", () => {
  const leg = (label: string, prop = "Hits O 0.5") => ({ label, prop, lkey: `${label}|batter_hits|0.5`, cz: -110, gkey: `g-${label[0]}` });
  const tk = (name: string, labels: string[], dec = 2.2, extra: Record<string, unknown> = {}) => ({
    pl: { name, type: "parlay", prob: 45, probRaw: 50, czEv: 3, czEvRaw: 4, czDec: dec, bsDec: dec, legs: labels.map((l) => leg(l)), ...extra },
    src: "p",
    idx: 0,
  });
  /* the pool: three 2-leg (one sharing a leg with the first), two 4-leg (one gate-refused),
     and three tickets that fit NO slot of shape A — a single, an over-priced 2-leg, an
     over-priced 3-leg */
  const POOL = [
    tk("T2a", ["A1", "A2"]),
    tk("T2b", ["B1", "B2"]),
    tk("T2c", ["C1", "A1"]), // shares A1 with T2a — never seatable beside it
    tk("T4a", ["D1", "D2", "D3", "D4"], 6.0),
    tk("T4b", ["E1", "E2", "E3", "E4"], 6.5, { gated: false }), // only the forced pass may seat it
    tk("T1", ["F1"]),
    tk("T2x", ["G1", "G2"], 3.0), // above the 2.6 two-leg ceiling
    tk("T3x", ["H1", "H2", "H3"], 12.0), // above the 9.38 3-4-leg ceiling
  ];
  type W = { pl: { name: string; gated?: boolean } };
  function mockEng(opts: { kelly?: number; over?: boolean; pool?: typeof POOL } = {}) {
    return {
      get<T>(k: string): T {
        if (k === "SH_CFG") return { maxCoreTickets: 6, minCoreTickets: 4, selMode: "dk_fd", perParlayCap: 0.25 } as T;
        if (k === "SH") return { bankroll: 750 } as T;
        if (k === "shCardPool") return ((_b: unknown) => opts.pool ?? POOL) as T;
        if (k === "shTicketId") return ((x: { name?: string }) => `id-${x.name ?? "fun"}`) as T;
        if (k === "shAllocate") {
          return ((p: W[], amount: number, cfg: { selMode?: string; maxCoreTickets?: number; coreMaxLegs?: number }) => {
            const forced = cfg.selMode === CORE_RULES.forcedSelMode;
            const c = p.find((x) => forced || x.pl.gated !== false);
            if (!c || amount <= 0) return { picks: [], sum: 0, blocked: p.filter((x) => x.pl.gated === false).map((x) => ({ name: x.pl.name, reason: "ev_gate" })) };
            const stake = opts.over ? amount + 5 : forced ? amount : Math.min(opts.kelly ?? amount, amount);
            return { picks: [{ id: `id-${c.pl.name}`, stake, w: { pl: c.pl } }], sum: stake, blocked: [], unallocated: amount - stake };
          }) as T;
        }
        return null as T;
      },
    };
  }
  const DATA = { gameInfo: { "g-A": { pk: 1, start: "2026-09-10T23:05:00Z" } }, categories: {} } as never;
  const DATE = "2026-09-10"; // day index 20706 → 20706 % 6 == 0 → shape A: 2x$60 2-leg + 3x$10 3-4 leg
  type Tix = { id: string; stake: number; shapeSlot?: number; topUp?: number; forced?: boolean; legs: { label: string }[] };
  const lock = (args: Partial<Parameters<typeof buildLockEntry>[0]> & { eng?: unknown } = {}) =>
    buildLockEntry({ eng: (args.eng ?? mockEng()) as never, data: DATA, date: DATE, now: Date.parse("2026-09-10T20:00:00Z"), trigger: "test", ...args } as never);
  const disjoint = (core: Tix[]) => {
    const seen = new Set<string>();
    for (const t of core) for (const l of t.legs) {
      if (seen.has(l.label)) return false;
      seen.add(l.label);
    }
    return true;
  };

  it("fills the right slots: 2-leg tickets take the $60 slots, 4-leg tickets the $10 3-4 leg slots, every stake == its slot, day ≤ $150, legs disjoint, the unfillable slot NAMED", () => {
    const entry = lock();
    const sh = shapeById("A")!;
    expect((entry as { coreShape?: { id: string; label: string; pick: string } }).coreShape?.id).toBe("A");
    expect((entry as { coreShape?: { label: string } }).coreShape?.label).toBe("2x$60 2-leg + 3x$10 3-4 leg");
    expect((entry as { coreShape?: { pick: string } }).coreShape?.pick).toBe("rotation");
    expect((entry as { shapeLine?: string }).shapeLine).toBe("shape: 2x$60 2-leg + 3x$10 3-4 leg");
    const core = entry.core as Tix[];
    expect(core.map((t) => [t.id, t.shapeSlot, t.stake, t.forced === true])).toEqual([
      ["id-T2a", 0, 60, false],
      ["id-T2b", 1, 60, false],
      ["id-T4a", 2, 10, false],
      ["id-T4b", 3, 10, true], // the gate refused it; the forced (probability) pass seated it in the same leg range
    ]);
    for (const t of core) {
      const slot = sh.slots[t.shapeSlot!];
      expect(t.stake, `${t.id} does not carry exactly its slot's stake`).toBe(slot.stake);
      expect(t.legs.length).toBeGreaterThanOrEqual(slot.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(slot.legs.max);
    }
    expect(disjoint(core), "two seated tickets share a leg").toBe(true);
    expect(entry.allocSum).toBe(140);
    expect(entry.allocSum).toBeLessThanOrEqual(PAPER.daily);
    expect((entry as { capResidue?: number }).capResidue).toBe(10);
    expect((entry as { slotsUnfilled?: { slot: number; name: string; reason: string }[] }).slotsUnfilled).toEqual([
      { slot: 4, name: "$10 3-4 leg slot", reason: "$10 3-4 leg slot unfilled — no leg-disjoint 3-4 leg ticket priced under 9.38 in the pool" },
    ]);
    expect((entry as { slotsOpen?: number[] }).slotsOpen).toEqual([4]);
    expect(String(entry.note)).toMatch(/\$10 3-4 leg slot unfilled/);
    expect(String(entry.note)).toMatch(/day at \$140 of \$150/);
    /* the three tickets that fit no slot left the pool up front, counted */
    expect((entry as { blockedReasons?: Record<string, number> }).blockedReasons?.core_shape_rules).toBe(3);
    expect((entry as { blockedReasons?: Record<string, number> }).blockedReasons?.ev_gate, "the gate's refusal is counted once per fire, not once per slot").toBe(1);
    expect(validateLedger([entry as SyncEntry]).ok).toBe(true);
  });

  it("CAP AT KELLY (Josh, 2026-09-08, verbatim: \"Cap at Kelly, don't ride the full slot\"): a Kelly-$12 pick in a $60 slot stays $12, topUp 0, the $48 the slot had left is retired (slotUnderSum), the slot still counts as consumed", () => {
    const entry = lock({ eng: mockEng({ kelly: 12 }) });
    const core = entry.core as Tix[];
    expect(core.map((t) => [t.id, t.stake, t.topUp ?? 0])).toEqual([
      ["id-T2a", 12, 0],
      ["id-T2b", 12, 0],
      ["id-T4a", 10, 0], // min(12, 10) — the slot is smaller than the Kelly ceiling
      ["id-T4b", 10, 0], // forced: exact-sum to the slot
    ]);
    expect(entry.allocSum).toBe(12 + 12 + 10 + 10);
    expect((entry as { gatedSum?: number }).gatedSum).toBe(12 + 12 + 10);
    expect((entry as { topUpSum?: number }).topUpSum).toBe(0);
    expect((entry as { slotUnderSum?: number }).slotUnderSum).toBe(48 + 48);
    // the seated $60 slots are consumed: only the genuinely unfilled slot is residue, so a top-up fire has nothing to buy here
    expect((entry as { capResidue?: number }).capResidue).toBe(10);
  });

  it("IMPOSSIBLE BRANCH: an allocator handing back more than the slot is a THROW naming two allocators — never a clamp", () => {
    expect(() => lock({ eng: mockEng({ over: true }) })).toThrow(/TWO ALLOCATORS.*never carry more than its slot/);
  });

  it("BLOCK FIRES own the unfilled slots that fit their budget share, in shape order; the day's shape is chosen once and reused; Σ never passes $150", () => {
    /* fire 1: a $70 block → walks A's slots: $60 fits (rem 10), the second $60 does not,
       the $10 3-4 leg slot fits (rem 0), the rest do not → owns [0, 2] */
    const e1 = lock({ dailyOverride: 70, blockKey: "blk-1", blockGkeys: new Set(["g-A", "g-D"]) });
    const c1 = e1.core as Tix[];
    expect(c1.map((t) => [t.id, t.shapeSlot, t.stake])).toEqual([["id-T2a", 0, 60], ["id-T4a", 2, 10]]);
    expect(e1.blocks?.["blk-1"]).toMatchObject({ budget: 70, tickets: 2, slots: [0, 2] });
    expect(e1.allocSum).toBe(70);
    expect((e1 as { capResidue?: number }).capResidue).toBe(0);
    expect(e1.note, "a fire that seated every slot it owns carries no shortfall note").toBeUndefined();
    /* fire 2: the rest of the day ($80), a different block, and a calibration that would
       have tilted a FRESH day to shape B — the day keeps A (carry.coreShape wins) */
    const tilt: ShapeCalibration = { bucketRoi: { two: 0.2, long: -0.5 }, n: { two: 40, long: 40 } };
    const e2 = lock({ dailyOverride: 80, blockKey: "blk-2", blockGkeys: new Set(["g-B", "g-E"]), carry: e1, shapeCal: tilt });
    expect((e2 as { coreShape?: { id: string; pick: string } }).coreShape).toMatchObject({ id: "A", pick: "rotation" });
    const c2 = e2.core as Tix[];
    expect(c2.map((t) => [t.id, t.shapeSlot, t.stake, t.forced === true])).toEqual([
      ["id-T2a", 0, 60, false], // carried, slot kept
      ["id-T4a", 2, 10, false], // carried, slot kept
      ["id-T2b", 1, 60, false],
      ["id-T4b", 3, 10, true],
    ]);
    expect(e2.blocks?.["blk-2"]).toMatchObject({ budget: 80, tickets: 2, slots: [1, 3, 4] });
    expect(e2.allocSum).toBe(140);
    expect(e2.allocSum).toBeLessThanOrEqual(PAPER.daily);
    expect(disjoint(c2)).toBe(true);
    expect((e2 as { slotsOpen?: number[] }).slotsOpen).toEqual([4]);
    expect(String(e2.note)).toMatch(/\$10 3-4 leg slot unfilled/);
    expect(validateLedger([e2 as SyncEntry]).ok).toBe(true);
  });

  it("a $10 block on a day whose open slots are all bigger deploys nothing and says which slots are open — money is never invented", () => {
    const e1 = lock({ dailyOverride: 70, blockKey: "blk-1", blockGkeys: new Set(["g-A"]) });
    const e2 = lock({ dailyOverride: 5, blockKey: "blk-2", blockGkeys: new Set(["g-B"]), carry: e1 });
    expect(e2.allocSum).toBe(70);
    expect(e2.blocks?.["blk-2"]).toMatchObject({ tickets: 0, slots: [] });
    expect(String(e2.note)).toMatch(/no open slot fits inside this fire's budget \(open: \$60 2-leg slot, \$10 3-4 leg slot, \$10 3-4 leg slot\)/);
  });

  it("carried tickets WITHOUT a shapeSlot (a day locked before 2026-09-08) seat BY MONEY — best fit, the smallest slot that holds the stake — so the fire can still fill the big slots", () => {
    /* FIX ROUND 2026-09-08. OBSERVED RED against in-order seating: the two $10 legacy
       tickets sat in the $60 slots 0 and 1, the fire could only seat the $10 3-4 leg slots,
       the day stranded $100 of its $150, and decideTopUp kept buying top-ups (~120 credits
       each) that rebuilt the same seating. Best fit: $10 → the $10 slots (2, 3); the fire
       owns 0, 1, 4 and the day reaches $150. */
    const carry = {
      date: DATE, locked: true, lockedAt: 1, allocSum: 20, gatedSum: 20,
      core: [
        { id: "old-1", stake: 10, legs: [leg("Z1"), leg("Z2")], paper: true, placed: false, actualStake: 0 },
        { id: "old-2", stake: 10, legs: [leg("Y1"), leg("Y2")], paper: true, placed: false, actualStake: 0 },
      ],
      funT: [], games: {},
    };
    const entry = lock({ carry: carry as never });
    const fresh = (entry.core as Tix[]).filter((t) => !t.id.startsWith("old"));
    expect(fresh.map((t) => [t.id, t.shapeSlot, t.stake])).toEqual([["id-T2a", 0, 60], ["id-T2b", 1, 60], ["id-T4a", 4, 10]]);
    expect(entry.allocSum).toBe(150);
    expect((entry as { slotsOpen?: number[] }).slotsOpen).toEqual([]);
    expect((entry as { slotsUnfilled?: unknown[] }).slotsUnfilled).toEqual([]);
  });

  it("a legacy ticket no slot can hold is STRANDED: its money still counts, the fire owns only what fits after it, and the displaced slots are named `cannot fill further`", () => {
    /* a $100 pre-shape ticket on shape A (biggest slot $60): no seat. rem = 150 − 100 = 50 →
       the $60 slots do not fit, the three $10 slots do. With T4c in the pool all three seat,
       so the ONLY open slots are the two the stranded money displaced — the terminal case
       the scheduler's top-up sweep reads. */
    const carry = {
      date: DATE, locked: true, lockedAt: 1, allocSum: 100, gatedSum: 100,
      core: [{ id: "old-big", stake: 100, legs: [leg("Z1"), leg("Z2")], paper: true, placed: false, actualStake: 0 }],
      funT: [], games: {},
    };
    const entry = lock({ eng: mockEng({ pool: [...POOL, tk("T4c", ["K1", "K2", "K3", "K4"], 5)] }), carry: carry as never });
    const core = entry.core as Tix[];
    expect(core.find((t) => t.id === "old-big")!.shapeSlot).toBeUndefined();
    // T4b is gate-refused, so the gated T4c takes slot 3 and the forced pass seats T4b in slot 4
    expect(core.filter((t) => t.id !== "old-big").map((t) => [t.id, t.shapeSlot, t.stake])).toEqual([["id-T4a", 2, 10], ["id-T4c", 3, 10], ["id-T4b", 4, 10]]);
    expect(entry.allocSum).toBe(130);
    expect(entry.allocSum).toBeLessThanOrEqual(PAPER.daily);
    const unfilled = (entry as { slotsUnfilled: { slot: number; name: string; reason: string }[] }).slotsUnfilled;
    expect(unfilled.map((u) => u.slot)).toEqual([0, 1]);
    for (const u of unfilled) {
      expect(u.name).toBe("$60 2-leg slot");
      expect(u.reason).toBe("$60 2-leg slot unfilled — cannot fill further: $100 of carried money sits outside the shape's slots (1 legacy ticket no slot could seat), so the day has no room left for it");
    }
    expect((entry as { slotsOpen?: number[] }).slotsOpen).toEqual([0, 1]);
    expect(String(entry.note)).toMatch(/cannot fill further/);
    expect(validateLedger([entry as SyncEntry]).ok).toBe(true);
    /* and a top-up fire against that day rebuilds the same answer: $0 more, same two names */
    const again = lock({ dailyOverride: 20, blockKey: "topup-1", carry: entry });
    expect(again.allocSum).toBe(130);
    expect((again as { slotsUnfilled: { reason: string }[] }).slotsUnfilled.every((u) => u.reason.includes("cannot fill further"))).toBe(true);
  });

  it("PRODUCTION SHAPE: a block fire whose dailyOverride already nets the stranded money (daily − allocSoFar) is not charged for it twice — it still seats the three $10 slots", () => {
    const carry = {
      date: DATE, locked: true, lockedAt: 1, allocSum: 100, gatedSum: 100,
      core: [{ id: "old-big", stake: 100, legs: [leg("Z1"), leg("Z2")], paper: true, placed: false, actualStake: 0 }],
      funT: [], games: {},
    };
    // generate/scheduler pass dailyOverride = 150 − 0 reserved − 100 allocSoFar = 50
    const entry = lock({ eng: mockEng({ pool: [...POOL, tk("T4c", ["K1", "K2", "K3", "K4"], 5)] }), dailyOverride: 50, blockKey: "topup-1", carry: carry as never });
    expect(entry.allocSum).toBe(130);
    const unfilled = (entry as { slotsUnfilled: { slot: number; reason: string }[] }).slotsUnfilled;
    expect(unfilled.map((u) => u.slot)).toEqual([0, 1]);
    expect(unfilled.every((u) => u.reason.includes("cannot fill further"))).toBe(true);
    expect((entry as { slotsOpen?: number[] }).slotsOpen).toEqual([0, 1]);
  });

  it("a stranded day whose OTHER open slots are ordinary shortfalls is NOT terminal — those slots keep their pool reason beside the terminal ones", () => {
    const carry = {
      date: DATE, locked: true, lockedAt: 1, allocSum: 100, gatedSum: 100,
      core: [{ id: "old-big", stake: 100, legs: [leg("Z1"), leg("Z2")], paper: true, placed: false, actualStake: 0 }],
      funT: [], games: {},
    };
    const entry = lock({ carry: carry as never }); // the base POOL has only two 4-leg tickets → slot 4 stays open for want of a ticket
    const unfilled = (entry as { slotsUnfilled: { slot: number; reason: string }[] }).slotsUnfilled;
    expect(unfilled.map((u) => [u.slot, u.reason.includes("cannot fill further")])).toEqual([[4, false], [0, true], [1, true]]);
    expect(entry.allocSum).toBe(120);
  });

  it("a FULL day (every slot carried) gives a fire nothing to fill: nothing deploys, and the note says so honestly", () => {
    const e1 = lock({ eng: mockEng({ pool: [...POOL, tk("T4c", ["K1", "K2", "K3", "K4"], 5)] }) });
    expect((e1.core as Tix[]).length).toBe(5);
    expect(e1.allocSum).toBe(150);
    const e2 = lock({ dailyOverride: 10, blockKey: "late", carry: e1 });
    expect((e2.core as Tix[]).length).toBe(5);
    expect(e2.allocSum).toBe(150);
    expect(String(e2.note)).toMatch(/every slot of the day's shape is seated/);
  });

  it("IMPOSSIBLE BRANCH: a carry that already holds more than the $150 day is a THROW, never a quietly over-deployed day", () => {
    const carry = {
      date: DATE, locked: true, lockedAt: 1, allocSum: 200, gatedSum: 200,
      core: [
        { id: "big-1", stake: 100, shapeSlot: 0, legs: [leg("Z1"), leg("Z2")], paper: true, placed: false, actualStake: 0 },
        { id: "big-2", stake: 100, shapeSlot: 1, legs: [leg("Y1"), leg("Y2")], paper: true, placed: false, actualStake: 0 },
      ],
      funT: [], games: {},
    };
    expect(() => lock({ carry: carry as never })).toThrow(/OVER THE DAY/);
  });

  /**
   * INSTRUCTION 48 (2026-09-09, Josh's word, verbatim: "It can lock multiple times per day, but it
   * can never remove a pick it can only add to it"). The engine already carried tickets verbatim
   * (`core = [...carried, ...newCore]`); what is new is that the contract is ASSERTED —
   * `assertAppendOnly` in buildLockEntry throws before the entry exists, and in writeLock before
   * the SET — so a racing writer or a rogue allocator can never shrink a locked day.
   */
  describe("INSTRUCTION 48 — the card only ever grows", () => {
    const carried = (id: string, stake: number, shapeSlot: number, labels: [string, string], blockKey: string) => ({
      id, stake, shapeSlot, name: `Carried ${id}`, paper: true, placed: false, actualStake: 0, blockKey,
      legs: [leg(labels[0]), leg(labels[1])],
    });
    /* three tickets locked by three earlier sweeps: $25 Kelly-sized in the $60 slot 0, $10 in slot 2, $10 in slot 3 */
    const carry3 = {
      date: DATE, locked: true, lockedAt: 1_700_000_000_000, trigger: "topup-1", allocSum: 45, gatedSum: 45, slotUnderSum: 35,
      coreShape: { id: "A", label: "2x$60 2-leg + 3x$10 3-4 leg", pick: "rotation", slots: shapeById("A")!.slots },
      core: [
        carried("old-1", 25, 0, ["Z1", "Z2"], "topup-1"),
        carried("old-2", 10, 2, ["Y1", "Y2"], "topup-2"),
        carried("old-3", 10, 3, ["X1", "X2"], "topup-3"),
      ],
      funT: [{ id: "fun-1", stake: 25, name: "HR Longshot", paper: true, placed: false, actualStake: 0, legs: [leg("W1")] }],
      games: {},
    };

    it("a FOURTH top-up (blockKey topup-4) appends: every carried ticket rides through byte-for-byte, lockedAt is the first lock's", () => {
      const entry = lock({ dailyOverride: 70, blockKey: "topup-4", carry: carry3 as never });
      const core = entry.core as Tix[];
      for (const t of carry3.core) {
        expect(core.find((x) => x.id === t.id), `${t.id} was dropped by the fourth sweep`).toEqual(t);
      }
      expect(core.slice(0, 3)).toEqual(carry3.core); // carried FIRST, in their own order
      expect(entry.lockedAt).toBe(carry3.lockedAt);
      expect(entry.funT).toEqual(carry3.funT);
      /* the sweep owned what fit its $70: the open $60 slot 1 and the $10 slot 4 */
      const fresh = core.filter((t) => !t.id.startsWith("old"));
      expect(fresh.map((t) => [t.id, t.shapeSlot, t.stake])).toEqual([["id-T2a", 1, 60], ["id-T4a", 4, 10]]);
      expect(entry.blocks?.["topup-4"]).toMatchObject({ budget: 70, tickets: 2, slots: [1, 4] });
      expect(entry.allocSum).toBe(45 + 70);
      expect((entry as { slotUnderSum?: number }).slotUnderSum).toBe(35);
      expect(validateLedger([entry as SyncEntry]).ok).toBe(true);
    });

    it("a rogue allocator that hands back a CARRIED id at a different stake is a THROW naming the site — never a quiet replace", () => {
      /* the pool filter `free` excludes carried ids and legs from BOTH passes, so a sound allocator
         cannot re-pick old-1; this mock ignores the pool it was handed and mints old-1 at the slot's
         $60 (the "TWO ALLOCATORS" shape). Before INSTRUCTION 48 `carried.filter(!newCore.has(id))`
         let the $60 copy REPLACE the locked $25 one — the exact ledger-merge.ts N3 story. */
      const rogue = {
        get<T>(k: string): T {
          if (k === "SH_CFG") return { maxCoreTickets: 6, minCoreTickets: 4, selMode: "dk_fd", perParlayCap: 0.25 } as T;
          if (k === "SH") return { bankroll: 750 } as T;
          if (k === "shCardPool") return ((_b: unknown) => POOL) as T;
          if (k === "shTicketId") return ((x: { name?: string }) => `id-${x.name ?? "fun"}`) as T;
          if (k === "shAllocate") {
            return ((p: W[], amount: number) => {
              const c = p[0];
              if (!c || amount <= 0) return { picks: [], sum: 0, blocked: [] };
              return { picks: [{ id: "old-1", stake: amount, w: { pl: c.pl } }], sum: amount, blocked: [] };
            }) as T;
          }
          return null as T;
        },
      };
      expect(() => lock({ eng: rogue, dailyOverride: 70, blockKey: "topup-4", carry: carry3 as never })).toThrow(/APPEND ONLY \(buildLockEntry\)/);
      expect(() => lock({ eng: rogue, dailyOverride: 70, blockKey: "topup-4", carry: carry3 as never })).toThrow(/old-1/);
    });

    it("a carry with a DROPPED ticket relative to nothing is fine — the first lock has nothing to preserve", () => {
      expect(() => lock({ dailyOverride: 70, blockKey: "topup-1" })).not.toThrow();
    });
  });

  it("a fresh day with a thick record TILTS: 2-leg running better walks B/E/F, and the entry records the pick and its reason", () => {
    const tilt: ShapeCalibration = { bucketRoi: { two: -0.18, long: -0.53 }, n: { two: 50, long: 26 }, window: "2026-08-09..2026-09-09" };
    const entry = lock({ shapeCal: tilt }); // 20706 % 3 == 0 → B: 5x$30 2-leg
    const cs = (entry as { coreShape?: { id: string; pick: string; reason: string; menu: string[]; calibration?: ShapeCalibration | null } }).coreShape!;
    expect(cs.id).toBe("B");
    expect(cs.pick).toBe("tilt:two");
    expect(cs.menu).toEqual(["B", "E", "F"]);
    expect(cs.reason).toMatch(/2-leg is running better/);
    expect(cs.calibration).toEqual(tilt);
    const core = entry.core as Tix[];
    /* only two leg-disjoint 2-leg tickets exist under 2.6 → two $30 seats, three named */
    expect(core.map((t) => [t.id, t.shapeSlot, t.stake])).toEqual([["id-T2a", 0, 30], ["id-T2b", 1, 30]]);
    expect((entry as { slotsUnfilled?: unknown[] }).slotsUnfilled).toHaveLength(3);
    expect(entry.allocSum).toBe(60);
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

/**
 * INSTRUCTION 48 — writeLock is the LAST gate before the SET. The merge kernel (ledger-merge.ts)
 * has lowering paths a verbatim carry can never trip; a racing second writer could. Both directions
 * are asserted: the STORED day may not lose a ticket to the merged result, and the FIRE's own entry
 * may not either. On a violation the SET is never issued.
 */
describe("INSTRUCTION 48 — writeLock refuses to store a day that shrank", () => {
  const ticket = (id: string, stake: number, labels: string[]) => ({
    id, stake, name: `T ${id}`, paper: true, placed: false, actualStake: 0,
    legs: labels.map((l) => ({ label: l, prop: "Hits O 0.5", lkey: `${l}|batter_hits|0.5`, cz: -110, gkey: "g-1" })),
  });
  const dayWith = (core: ReturnType<typeof ticket>[], extra: Record<string, unknown> = {}) => ({
    date: "2026-09-10", locked: true, paper: true, lockedAt: 1_700_000_000_000, trigger: "server-lock", daily: 150, allocSum: core.reduce((a, t) => a + t.stake, 0),
    core, funT: [], games: {}, ...extra,
  });
  function fakeStore(seed: unknown) {
    const kv = new Map<string, string>();
    if (seed) kv.set(LEDGER_STORE_KEY, JSON.stringify(seed));
    const sets: unknown[][] = [];
    vi.mocked(redis).mockReset().mockImplementation(async (cmd: unknown[]) => {
      const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
      if (op === "GET") return kv.get(key) ?? null;
      if (op === "SET") {
        sets.push(cmd);
        kv.set(key, String(rest[0]));
        return "OK";
      }
      throw new Error(`fake redis: ${op}`);
    });
    return { kv, sets };
  }

  it("stored X@$30 vs a fire carrying X@$20 → throws APPEND ONLY (writeLock/…) and redis SET is never called", async () => {
    const { sets } = fakeStore({ epoch: 2, ledger: [dayWith([ticket("X", 30, ["A1", "A2"])])] });
    const fire = dayWith([ticket("X", 20, ["A1", "A2"])]);
    await expect(writeLock(fire as unknown as SyncEntry)).rejects.toThrow(/APPEND ONLY \(writeLock/);
    await expect(writeLock(fire as unknown as SyncEntry)).rejects.toThrow(/\bX\b/);
    expect(sets).toEqual([]);
  });

  it("a fire that only ADDS to the stored day writes: the stored ticket and the new one both land, epoch intact", async () => {
    const { kv, sets } = fakeStore({ epoch: 2, ledger: [dayWith([ticket("X", 30, ["A1", "A2"])])] });
    const fire = dayWith([ticket("X", 30, ["A1", "A2"]), ticket("Y", 10, ["B1", "B2", "B3"])]);
    const r = await writeLock(fire as unknown as SyncEntry);
    expect(r.existedBefore).toBe(true);
    expect(sets).toHaveLength(1);
    const stored = JSON.parse(kv.get(LEDGER_STORE_KEY)!) as { epoch?: number; ledger: { date: string; core: { id: string; stake: number }[] }[] };
    expect(stored.epoch).toBe(2);
    const day = stored.ledger.find((e) => e.date === "2026-09-10")!;
    expect(day.core.map((t) => [t.id, t.stake])).toEqual(expect.arrayContaining([["X", 30], ["Y", 10]]));
    expect(day.core).toHaveLength(2);
  });

  it("a first lock (nothing stored for the date) writes — there is nothing to preserve", async () => {
    const { sets } = fakeStore({ epoch: 2, ledger: [] });
    const r = await writeLock(dayWith([ticket("X", 30, ["A1", "A2"])]) as unknown as SyncEntry);
    expect(r.existedBefore).toBe(false);
    expect(sets).toHaveLength(1);
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
  it("every core ticket sits inside its slot (legs in range, stake == slot, dec ≤ the slot ceiling) · no HRR over · forced ≤ the forced ceiling · shrunk numbers with raw beside them · fun == $25", async () => {
    /* PIN UPDATED 2026-09-08 (INSTRUCTION 46): the 09-03 "2 legs max · every stake ≤ $25"
       pins are RETIRED — Josh's shapes carry $60/$75/$90 2-leg slots and 3-5-leg slots.
       The binding limits are now the slot's: leg range, stake, and slotMaxDec. OBSERVED
       RED against the old pin before this update ("a core stake above $25: expected 90"). */
    const { entry } = await fixtureLock();
    const shape = shapeById(String((entry as { coreShape?: { id: string } }).coreShape?.id))!;
    expect(shape, "the entry carries no menu shape").toBeTruthy();
    const core = entry.core as { stake: number; shapeSlot?: number; forced?: boolean; czDec?: number | null; bsDec?: number | null; prob?: number | null; probRaw?: number | null; czEvRaw?: number | null; topUp?: number; legs: { lkey?: string | null; prop?: string | null }[] }[];
    expect(core.length, "ZERO picks — vacuous; the probability mode must fill the card").toBeGreaterThan(0);
    const seen = new Set<number>();
    for (const t of core) {
      expect(typeof t.shapeSlot, "a core ticket without its slot").toBe("number");
      expect(seen.has(t.shapeSlot!), "two tickets in one slot").toBe(false);
      seen.add(t.shapeSlot!);
      const slot = shape.slots[t.shapeSlot!];
      expect(t.legs.length, `${t.legs.length}-leg ticket in a ${slot.legs.min}-${slot.legs.max} leg slot`).toBeGreaterThanOrEqual(slot.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(slot.legs.max);
      expect(t.stake, "a ticket carrying other than its slot's stake").toBe(slot.stake);
      const ceil = slotMaxDec(slot.legs, t.forced ? "forced" : "gated");
      expect(Number(t.czDec), "a core ticket priced above its slot ceiling").toBeLessThanOrEqual(ceil);
      expect(Number(t.bsDec), "a core ticket priced above its slot ceiling").toBeLessThanOrEqual(ceil);
      for (const l of t.legs) {
        const mkt = String(l.lkey ?? "").split("|")[1];
        expect(mkt === "batter_hits_runs_rbis" && String(l.prop ?? "").includes(" O "), `HRR over on core: ${l.prop}`).toBe(false);
      }
      expect(typeof t.probRaw, "probRaw missing — the pre-shrink number must stay recoverable").toBe("number");
      expect(typeof t.prob).toBe("number");
      expect("czEvRaw" in t).toBe(true);
    }
    expect(core.reduce((a, t) => a + t.stake, 0)).toBeLessThanOrEqual(PAPER.daily);
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
    const shape = shapeById(String((entry as { coreShape?: { id: string } }).coreShape?.id))!;
    /* PIN UPDATED 2026-09-08 (INSTRUCTION 46): slot limits, not maxLegs/maxStake */
    for (const t of alt.core as { stake: number; shapeSlot?: number; probRaw?: unknown; legs: unknown[] }[]) {
      expect(typeof t.probRaw).toBe("number");
      const slot = shape.slots[Number(t.shapeSlot)];
      expect(slot, "an alt ticket outside the day's shape").toBeTruthy();
      expect(t.legs.length).toBeLessThanOrEqual(slot.legs.max);
      expect(t.stake).toBe(slot.stake);
    }
  }, T9);

  it("HRR overs are counted out of the pool on this fixture (3 pool tickets carry one)", async () => {
    const { entry } = await fixtureLock();
    expect((entry as { blockedReasons?: Record<string, number> }).blockedReasons?.hrr_over_suspended).toBe(3);
  }, T9);
});

describe("INSTRUCTION 46 — self-calibration is WIRED: both lock-writing routes read the record and hand it to buildLockEntry (fix round 2026-09-08)", () => {
  /* OBSERVED RED before the fix: readShapeCalibration was exported and never called — every
     day ran the plain rotation and the "calibrating itself" half of INSTRUCTION 46 was dead. */
  const read = (f: string) => stripComments(readFileSync(f, "utf8"));
  it("app/api/generate/route.ts computes shapeCal via readShapeCalibration and passes it into buildLockEntry", () => {
    const src = read("app/api/generate/route.ts");
    expect(src).toMatch(/readShapeCalibration\(date\)/);
    const call = src.slice(src.indexOf("const entry = buildLockEntry({"));
    expect(call.slice(0, call.indexOf("});"))).toMatch(/\bshapeCal\b/);
  });
  it("app/api/scheduler/route.ts (the backfill lock) does the same", () => {
    const src = read("app/api/scheduler/route.ts");
    expect(src).toMatch(/readShapeCalibration\(date\)/);
    const call = src.slice(src.indexOf("buildLockEntry({"));
    expect(call.slice(0, call.indexOf("})"))).toMatch(/\bshapeCal\b/);
  });
  it("the read is fail-safe: readShapeCalibration catches its own errors (an unreadable store is null → rotation)", () => {
    const src = read("src/lib/server/lock-card.ts");
    const fn = src.slice(src.indexOf("export async function readShapeCalibration"));
    expect(fn.slice(0, fn.indexOf("export function buildLockEntry"))).toMatch(/catch\s*\{\s*return null;/);
  });
});
