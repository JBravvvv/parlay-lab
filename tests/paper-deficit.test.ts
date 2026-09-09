import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { effectiveBlockBudget, decideTopUp, openSlotStakes, type SlateBlock, type BlockRegistry } from "@/lib/server/blocks";
import { TOPUP_MAX, TOPUP_EMPTY_RETRY_MS, PAPER } from "@/lib/paper-mode";
import { CORE_SHAPES } from "@/lib/core-shapes";
import { buildLockEntry } from "@/lib/server/lock-card";

/**
 * THE $49 DAY (2026-08-19, Josh's word, verbatim: "There is only $49 of core money
 * invested today. I said $150 every day no matter what so we could track and calibrate
 * off of it over time").
 *
 * The 08-19 card deployed $49 of $150 ($26 gated + $23 forced). Three defects compounded:
 *   1. STATIC SHARES: each block got its fixed splitBudget share; a fire that could not
 *      seat its share STRANDED the difference — nothing later ever picked it up.
 *   2. WINDOW-ZEROED TOP-UP: the forced pass was capped by the block window's
 *      share-rounded maxNew — the $10 single-game block's window was 1 ticket, one gated
 *      pick made forcedMax 0, and the note read "deployed $9 of $10".
 *   3. NO RETRY: fires happen at lineup-readiness, but Caesars posts evening props near
 *      first pitch — a thin CZ-playable pool at fire time was final for the day.
 * (A fourth discovery from the same read: the 08-08 per-block pool filter compared
 * `p.w?.pl` on `{pl,src,idx}` wrappers — vacuously true, a NO-OP since it shipped. The
 * record was always built on the slate-wide pool; the dead filter is now deleted.)
 *
 * The fixes under test: effectiveBlockBudget (deficit carries forward, pending blocks
 * stay reserved), the forced pass capped by the DAY allowance, and decideTopUp (the
 * scheduler buys fresh prices for a short day while pregame games remain).
 */

const T = (s: string) => Date.parse(s);
// today's real shape: 4 + 1 + 10 games -> $40 / $10 / $100
const BLOCKS: SlateBlock[] = [
  { key: "A", starts: [T("2026-08-19T16:35:00Z"), T("2026-08-19T17:10:00Z"), T("2026-08-19T17:40:00Z"), T("2026-08-19T18:20:00Z")] },
  { key: "B", starts: [T("2026-08-19T20:10:00Z")] },
  { key: "C", starts: [T("2026-08-19T22:05:00Z"), T("2026-08-19T22:35:00Z"), T("2026-08-19T22:40:00Z"), T("2026-08-19T22:40:00Z"), T("2026-08-19T22:40:00Z"), T("2026-08-19T23:40:00Z"), T("2026-08-19T23:40:00Z"), T("2026-08-20T00:05:00Z"), T("2026-08-20T00:10:00Z"), T("2026-08-20T00:40:00Z")] },
];

describe("effectiveBlockBudget — the deficit carries forward, pending blocks stay reserved", () => {
  it("first fire of a fresh day gets its pro-rata share (nothing carried, the rest reserved)", () => {
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "A", registry: {}, now: T("2026-08-19T13:40:00Z"), allocSoFar: 0 });
    expect(r).toEqual({ budget: 40, reserved: 110 });
  });
  it("an earlier fire's shortfall FLOWS to the next fire instead of stranding", () => {
    // A fired but seated only $26 of its $40; B still alive and unfired -> reserved
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 } };
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "C", registry: reg, now: T("2026-08-19T19:00:00Z"), allocSoFar: 26 });
    expect(r).toEqual({ budget: 114, reserved: 10 }); // 150 - 10(B pending) - 26 = 114, not the static 100
  });
  it("a dead unfired block reserves nothing — its money is deployable now", () => {
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 } };
    // B's only game started without a fire (the orphan shape)
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "C", registry: reg, now: T("2026-08-19T21:00:00Z"), allocSoFar: 26 });
    expect(r).toEqual({ budget: 124, reserved: 0 });
  });
  it('currentKey "" prices a top-up: everything the day still owes (the 08-19 heal is $101)', () => {
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 } };
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "", registry: reg, now: T("2026-08-19T23:11:00Z"), allocSoFar: 49 });
    expect(r).toEqual({ budget: 101, reserved: 0 });
  });
  it("never negative: an over-deployed day prices to zero, and Σ deployed can never exceed daily", () => {
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "", registry: {}, now: T("2026-08-20T02:00:00Z"), allocSoFar: 200 });
    expect(r.budget).toBe(0);
  });
});

describe("decideTopUp — the sweep that makes 'no matter what' true while games remain", () => {
  const now = T("2026-08-19T23:11:00Z"); // five games still unstarted
  const allFired: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 } };
  const starts = BLOCKS.flatMap((b) => b.starts);
  it("fires on the exact 08-19 shape: short $101, no pending block, pregame games remain", () => {
    const d = decideTopUp({ entry: { paper: true, allocSum: 49 }, blocks: BLOCKS, registry: allFired, starts, now, daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire).toBe(true);
    expect(d.owed).toBe(101);
  });
  it("holds while a block can still fire — that block's own fire carries the deficit", () => {
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 } }; // C unfired, 10 unstarted >= floor 4
    const d = decideTopUp({ entry: { paper: true, allocSum: 49 }, blocks: BLOCKS, registry: reg, starts, now: T("2026-08-19T19:00:00Z"), daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/can still fire/);
  });
  it("THE OBSERVED DEADLOCK (2026-08-19 23:47Z, live): a burned-down block is NOT pending and reserves nothing", () => {
    // C never fired; at 23:47Z it has 3 unstarted games < its minReady floor of 4 — the
    // two-condition window is closed forever, yet 3 games are still seatable. An
    // aliveness-only check held the top-up until nothing was pregame (watched happen).
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 } };
    const late = T("2026-08-19T23:47:00Z");
    const d = decideTopUp({ entry: { paper: true, allocSum: 49 }, blocks: BLOCKS, registry: reg, starts, now: late, daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire, "the sweep must not wait on a block that can never fire").toBe(true);
    expect(d.owed).toBe(101);
    const r = effectiveBlockBudget({ daily: 150, blocks: BLOCKS, currentKey: "", registry: reg, now: late, allocSoFar: 49 });
    expect(r, "a never-fireable block must not reserve its share away from the sweep").toEqual({ budget: 101, reserved: 0 });
  });
  it("holds on a fully-deployed day, a day with no paper lock, and a day with nothing pregame", () => {
    expect(decideTopUp({ entry: { paper: true, allocSum: 150 }, blocks: BLOCKS, registry: allFired, starts, now, daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(false);
    expect(decideTopUp({ entry: null, blocks: BLOCKS, registry: allFired, starts, now, daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(false);
    expect(decideTopUp({ entry: { paper: true, allocSum: 49 }, blocks: BLOCKS, registry: allFired, starts, now: T("2026-08-20T02:00:00Z"), daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(false);
  });
  it("the cap is the registry's topup count — spent means spent (TOPUP_MAX rows, whatever TOPUP_MAX is)", () => {
    /* RE-PINNED 2026-09-09 (INSTRUCTION 48): was a literal two rows against a literal 2. */
    const reg: BlockRegistry = { ...allFired };
    for (let i = 1; i <= TOPUP_MAX; i++) reg[`topup-${i}`] = { firedAt: 3 + i, at: 3 + i };
    const d = decideTopUp({ entry: { paper: true, allocSum: 120 }, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/cap/);
    expect(d.used).toBe(TOPUP_MAX);
    /* one row short of the cap still fires (no coreShape on this entry → slot-fit skipped; rows carry no `tickets` → no cooldown) */
    const one: BlockRegistry = { ...allFired };
    for (let i = 1; i < TOPUP_MAX; i++) one[`topup-${i}`] = { firedAt: 3 + i, at: 3 + i };
    expect(decideTopUp({ entry: { paper: true, allocSum: 120 }, blocks: BLOCKS, registry: one, starts, now, daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(true);
  });
});

/**
 * INSTRUCTION 48 (2026-09-09, Josh's word, verbatim: "The Card for today is 'locked' which is
 * fine, but it only played $25 today. I understand thats all it had meeting the criteria at this
 * time which is completely fine. Throughout the rest of the day refresh, if it analyzes more
 * picks/parlays that meet the betting criteria, it can continue to add to the card up to the
 * daily allotted amount. It can lock multiple times per day, but it can never remove a pick it
 * can only add to it").
 *
 * What changed on the MLB rail is CADENCE, not the engine: TOPUP_MAX 2 → 4, and two FREE
 * refusals in decideTopUp that make four attempts worth having — an empty sweep (registry row
 * `tickets: 0`) holds the next off TOPUP_EMPTY_RETRY_MS, and a sweep whose budget (= owed) cannot
 * own any open slot of the day's shape is refused before it spends a full generate (114-150
 * credits) to deploy $0. The refusal ORDER above (no lock → fully deployed → pending block →
 * every game started → cap) is unchanged and re-asserted at the end.
 */
describe("INSTRUCTION 48/49 — the constants", () => {
  it("TOPUP_MAX is 6 (INSTRUCTION 49: five refill slots + one manual) and TOPUP_EMPTY_RETRY_MS keeps its 90-minute value for the pure helper", () => {
    expect(TOPUP_MAX).toBe(6);
    expect(TOPUP_EMPTY_RETRY_MS).toBe(90 * 60_000);
  });
});

/**
 * INSTRUCTION 49 (2026-09-09, Josh: "It shouldn't be refreshing every 15 minutes. It should be
 * 8am, 9:30am, 12pm, 3pm & 4:45pm. Other than that I can manually do it"). The slot a top-up ran
 * on is RECORDED on its registry row, and a second automatic sweep inside the same slot is
 * refused free. A manual sweep never trips the same-slot gate.
 */
describe("INSTRUCTION 49 — SAME-SLOT refusal (free, from the registry row's own `slot`)", () => {
  const now = T("2026-08-19T23:11:00Z");
  const starts = BLOCKS.flatMap((b) => b.starts);
  const entry = { paper: true, allocSum: 49 };
  const reg: BlockRegistry = {
    A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 },
    "topup-1": { firedAt: now - 5 * 60_000, at: now - 5 * 60_000, tickets: 1, slot: "12:00" } as BlockRegistry[string],
  };
  it("slot 12:00 with a topup-1 row already stamped 12:00 → refused, /already ran today/", () => {
    const d = decideTopUp({ entry, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX, slot: "12:00" });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/already ran today/);
    expect(d.reason).toBe("refill slot 12:00 PT already ran today — the next automatic refill is the next slot; Josh's own Refresh still runs any time");
  });
  it("slot 15:00 against the same row → not refused for that reason (fires)", () => {
    const d = decideTopUp({ entry, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX, slot: "15:00" });
    expect(d.reason).not.toMatch(/already ran today/);
    expect(d.fire).toBe(true);
  });
  it("slot manual against the same row → never the same-slot refusal (Josh's click is honoured)", () => {
    const d = decideTopUp({ entry, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" });
    expect(d.reason).not.toMatch(/already ran today/);
    expect(d.fire).toBe(true);
  });
});

/**
 * FIX ROUND (2026-09-09): the five slots and Josh's clicks draw from ONE pool of TOPUP_MAX attempts,
 * so a manual sweep is refused free when it would spend an attempt an automatic slot still ahead
 * today needs (used + unstamped slots ahead >= max). Named slots are never held this way.
 */
describe("INSTRUCTION 49 fix round — MANUAL HEADROOM (free): a click never spends a slot's attempt", () => {
  const starts = BLOCKS.flatMap((b) => b.starts);
  const entry = { paper: true, allocSum: 49 };
  const fired: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 } };
  const withTopups = (n: number, slots: (string | undefined)[] = []): BlockRegistry => {
    const r: BlockRegistry = { ...fired };
    for (let i = 1; i <= n; i++) r[`topup-${i}`] = { firedAt: 10 + i, at: 10 + i, tickets: 1, ...(slots[i - 1] ? { slot: slots[i - 1] } : {}) } as BlockRegistry[string];
    return r;
  };
  const morning = T("2026-08-19T16:00:00Z"); // 09:00 PT — four slots still ahead (09:30/12:00/15:00/16:45)
  const late = T("2026-08-19T23:11:00Z"); // 16:11 PT — one slot ahead (16:45)
  it("09:00 PT, one attempt used: 1 + 4 < 6 → the click fires", () => {
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(1), starts, now: morning, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" }).fire).toBe(true);
  });
  it("09:00 PT, two used: 2 + 4 >= 6 → refused with the exact headroom string, free", () => {
    const d = decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(2), starts, now: morning, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe("manual refill would spend a slot's attempt — 4 attempts left, 4 automatic slots still ahead today");
    expect(d.used).toBe(2);
  });
  it("a slot ahead that a row already stamps needs no reserve (a replayed day): rows 08:00 + 09:30 at 09:00 PT → 2 + 3 < 6 fires", () => {
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(2, ["08:00", "09:30"]), starts, now: morning, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" }).fire).toBe(true);
  });
  it("16:11 PT: five used + the 16:45 slot ahead → refused; four used → fires; a NAMED slot is never held for headroom", () => {
    const held = decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(5), starts, now: late, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" });
    expect(held.fire).toBe(false);
    expect(held.reason).toBe("manual refill would spend a slot's attempt — 1 attempt left, 1 automatic slot still ahead today");
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(4), starts, now: late, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" }).fire).toBe(true);
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(5), starts, now: late, daily: PAPER.daily, max: TOPUP_MAX, slot: "16:45" }).fire).toBe(true);
    // no slot at all (an off-slot ticker poke printing the day's reason) is never held either
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(5), starts, now: morning, daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(true);
  });
  it("the cap still answers first: six used → /cap/, not the headroom string", () => {
    const d = decideTopUp({ entry, blocks: BLOCKS, registry: withTopups(6), starts, now: morning, daily: PAPER.daily, max: TOPUP_MAX, slot: "manual" });
    expect(d.reason).toBe("top-up cap spent (6/6)");
  });
});

describe("INSTRUCTION 48 — the EMPTY-SWEEP COOLDOWN (free, from the registry's own rows)", () => {
  const now = T("2026-08-19T23:11:00Z");
  const allFired: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 } };
  const starts = BLOCKS.flatMap((b) => b.starts);
  const entry = { paper: true, allocSum: 49 };
  const run = (reg: BlockRegistry) => decideTopUp({ entry, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX, emptyRetryMs: TOPUP_EMPTY_RETRY_MS });

  it("a sweep that priced a board 30 min ago and seated nothing holds the next one off", () => {
    const d = run({ ...allFired, "topup-1": { firedAt: now - 30 * 60_000, tickets: 0, at: now - 30 * 60_000 } });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/seated nothing|waits/);
    expect(d.reason).toMatch(/topup-1/);
    expect(d.reason).toMatch(/30 min ago/);
    expect(d.reason).toMatch(/60 more min/);
    expect(d).toMatchObject({ owed: 101, used: 1 });
  });
  it("the same empty row 91 min ago no longer holds — the cooldown is a window, not a kill", () => {
    expect(run({ ...allFired, "topup-1": { firedAt: now - 91 * 60_000, tickets: 0, at: now - 91 * 60_000 } }).fire).toBe(true);
  });
  it("a sweep that SEATED something 20 min ago does not arm it — the board is moving", () => {
    expect(run({ ...allFired, "topup-1": { firedAt: now - 20 * 60_000, tickets: 2, at: now - 20 * 60_000 } }).fire).toBe(true);
  });
  it("only the LATEST topup row counts: an old empty one behind a fresh seated one does not hold", () => {
    const reg: BlockRegistry = {
      ...allFired,
      "topup-1": { firedAt: now - 80 * 60_000, tickets: 0, at: now - 80 * 60_000 },
      "topup-2": { firedAt: now - 20 * 60_000, tickets: 1, at: now - 20 * 60_000 },
    };
    expect(run(reg).fire).toBe(true);
    const flipped: BlockRegistry = {
      ...allFired,
      "topup-1": { firedAt: now - 80 * 60_000, tickets: 1, at: now - 80 * 60_000 },
      "topup-2": { firedAt: now - 20 * 60_000, tickets: 0, at: now - 20 * 60_000 },
    };
    expect(run(flipped).fire).toBe(false);
    expect(run(flipped).reason).toMatch(/topup-2/);
  });
  it("rows without a numeric `tickets` (the legacy fixtures) never arm it, and omitting emptyRetryMs is the pre-09-09 behaviour", () => {
    expect(run({ ...allFired, "topup-1": { firedAt: now - 5 * 60_000, at: now - 5 * 60_000 } }).fire).toBe(true);
    const reg: BlockRegistry = { ...allFired, "topup-1": { firedAt: now - 5 * 60_000, tickets: 0, at: now - 5 * 60_000 } };
    expect(decideTopUp({ entry, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX }).fire).toBe(true);
  });
});

describe("INSTRUCTION 48 — SLOT-FIT (free): a sweep must be able to OWN an open slot or it is refused", () => {
  const now = T("2026-08-19T23:11:00Z");
  const allFired: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 }, C: { firedAt: 3, at: 3 } };
  const starts = BLOCKS.flatMap((b) => b.starts);
  /* shape A: 2x$60 2-leg + 3x$10 3-4 leg (slots [60, 60, 10, 10, 10]) */
  const A = { id: "A", slots: CORE_SHAPES[0].slots };
  expect(CORE_SHAPES[0].id).toBe("A");
  const seat = (stake: number, shapeSlot: number) => ({ id: `t${shapeSlot}`, stake, shapeSlot });
  const run = (entry: Record<string, unknown>) => decideTopUp({ entry, blocks: BLOCKS, registry: allFired, starts, now, daily: PAPER.daily, max: TOPUP_MAX, emptyRetryMs: TOPUP_EMPTY_RETRY_MS });

  it("$60 in slot 0, allocSum 60 → owed 90, the other $60 slot fits → fires", () => {
    const d = run({ paper: true, allocSum: 60, slotUnderSum: 0, coreShape: A, core: [seat(60, 0)] });
    expect(d).toMatchObject({ fire: true, owed: 90 });
  });
  it("two $60s in slots 0 and 1, allocSum 120 → owed 30 ≥ the $10 slots → fires", () => {
    const d = run({ paper: true, allocSum: 120, coreShape: A, core: [seat(60, 0), seat(60, 1)] });
    expect(d).toMatchObject({ fire: true, owed: 30 });
  });
  it("every slot seated (allocSum 150) → 'fully deployed' — owed 0 precedes slot-fit", () => {
    const d = run({ paper: true, allocSum: 150, coreShape: A, core: [seat(60, 0), seat(60, 1), seat(10, 2), seat(10, 3), seat(10, 4)] });
    expect(d).toEqual({ fire: false, reason: "day fully deployed", owed: 0, used: 0 });
  });
  it("every slot seated under Kelly (allocSum 90 + slotUnderSum 60) → still 'fully deployed' by the 09-08 cap-at-Kelly rule", () => {
    const d = run({ paper: true, allocSum: 90, slotUnderSum: 60, coreShape: A, core: [seat(30, 0), seat(30, 1), seat(10, 2), seat(10, 3), seat(10, 4)] });
    expect(d).toEqual({ fire: false, reason: "day fully deployed", owed: 0, used: 0 });
  });
  it("every slot seated but the entry's sums are short (allocSum 140, no slotUnderSum) → 'every slot … is seated', not a $10 sweep", () => {
    const d = run({ paper: true, allocSum: 140, coreShape: A, core: [seat(60, 0), seat(60, 1), seat(10, 2), seat(10, 3), seat(10, 4)] });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/every slot of the day's shape is seated/);
    expect(d.owed).toBe(10);
  });
  it("THE 09-09 DAY: a $25 ticket in slot 0 (allocSum 25, slotUnderSum 35) → owed 90, open [60, 10, 10, 10] → fires", () => {
    const entry = { paper: true, allocSum: 25, slotUnderSum: 35, coreShape: A, core: [seat(25, 0)] };
    expect(openSlotStakes(entry)).toEqual([60, 10, 10, 10]);
    const d = run(entry);
    expect(d).toMatchObject({ fire: true, owed: 90 });
  });
  it("owed $5 with only $10 slots open → refused, naming the smallest open slot — the shortfall is Kelly sizing, not an empty seat", () => {
    const entry = { paper: true, allocSum: 100, slotUnderSum: 45, coreShape: A, core: [seat(50, 0), seat(40, 1), seat(10, 2)] };
    expect(openSlotStakes(entry)).toEqual([10, 10]);
    const d = run(entry);
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/smallest open slot/);
    expect(d.reason).toMatch(/\$5 /);
    expect(d.reason).toMatch(/\$10;/);
    expect(d).toMatchObject({ owed: 5, used: 0 });
  });
  it("owed exactly the smallest open slot fires (≤, not <)", () => {
    const entry = { paper: true, allocSum: 100, slotUnderSum: 40, coreShape: A, core: [seat(50, 0), seat(40, 1), seat(10, 2)] };
    expect(run(entry)).toMatchObject({ fire: true, owed: 10 });
  });
  it("a day without coreShape (pre-09-08) skips slot-fit entirely — behaves as before", () => {
    expect(run({ paper: true, allocSum: 145 })).toMatchObject({ fire: true, owed: 5 });
    expect(openSlotStakes({ paper: true, allocSum: 145 })).toBeNull();
    expect(openSlotStakes(null)).toBeNull();
  });
  it("coreShape with only an id resolves the slots off the menu", () => {
    expect(openSlotStakes({ coreShape: { id: "A" }, core: [seat(60, 1)] })).toEqual([60, 10, 10, 10]);
    expect(openSlotStakes({ coreShape: { id: "not-a-shape" }, core: [] })).toBeNull();
  });
  it("openSlotStakes seats a shapeSlot-less $30 legacy ticket into the SMALLEST fitting slot ($60) — exactly as lock-card's seatCarried", () => {
    expect(openSlotStakes({ coreShape: A, core: [{ id: "legacy", stake: 30 }] })).toEqual([60, 10, 10, 10]);
    /* two $10 legacy tickets take the $10 slots, not the $60s */
    expect(openSlotStakes({ coreShape: A, core: [{ id: "l1", stake: 10 }, { id: "l2", stake: 10 }] })).toEqual([60, 60, 10]);
    /* a $100 legacy ticket fits nowhere: stranded, ignored — every slot stays open */
    expect(openSlotStakes({ coreShape: A, core: [{ id: "big", stake: 100 }] })).toEqual([60, 60, 10, 10, 10]);
    /* an out-of-range shapeSlot falls back to best-fit; a duplicate shapeSlot too */
    expect(openSlotStakes({ coreShape: A, core: [{ id: "x", stake: 10, shapeSlot: 9 }] })).toEqual([60, 60, 10, 10]);
    expect(openSlotStakes({ coreShape: A, core: [seat(60, 0), { id: "dup", stake: 60, shapeSlot: 0 }] })).toEqual([10, 10, 10]);
  });
  it("the refusal ORDER still holds: no lock → fully deployed → pending block → every game started → cap → slot-fit → cooldown", () => {
    const tight = { paper: true, allocSum: 100, slotUnderSum: 45, coreShape: A, core: [seat(50, 0), seat(40, 1), seat(10, 2)] }; // slot-fit would refuse
    const base = { blocks: BLOCKS, starts, daily: PAPER.daily, max: TOPUP_MAX, emptyRetryMs: TOPUP_EMPTY_RETRY_MS };
    expect(decideTopUp({ ...base, entry: null, registry: allFired, now }).reason).toMatch(/no paper lock/);
    expect(decideTopUp({ ...base, entry: { ...tight, allocSum: 150 }, registry: allFired, now }).reason).toBe("day fully deployed");
    const pendingC: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 } };
    expect(decideTopUp({ ...base, entry: tight, registry: pendingC, now: T("2026-08-19T19:00:00Z") }).reason).toMatch(/can still fire/);
    expect(decideTopUp({ ...base, entry: tight, registry: allFired, now: T("2026-08-20T02:00:00Z") }).reason).toMatch(/every game started/);
    const capped: BlockRegistry = { ...allFired };
    for (let i = 1; i <= TOPUP_MAX; i++) capped[`topup-${i}`] = { firedAt: now - 5 * 60_000, tickets: 0, at: now - 5 * 60_000 };
    expect(decideTopUp({ ...base, entry: tight, registry: capped, now }).reason).toMatch(/cap/);
    const cooling: BlockRegistry = { ...allFired, "topup-1": { firedAt: now - 5 * 60_000, tickets: 0, at: now - 5 * 60_000 } };
    expect(decideTopUp({ ...base, entry: tight, registry: cooling, now }).reason).toMatch(/smallest open slot/);
    expect(decideTopUp({ ...base, entry: { ...tight, slotUnderSum: 30 }, registry: cooling, now }).reason).toMatch(/seated nothing/);
  });
});

/**
 * THE $9-OF-$10 REPRODUCTION. A mock engine replays today's failing block: the gated
 * pass seats one $9 ticket against a $10 budget. The old code's forcedMax was
 * win.maxNew(=1) − gated(1) = 0 — the dollar stranded and the note blamed the "10-ticket
 * day ceiling". RESTATED 2026-09-08 (INSTRUCTION 46): the $10 block now OWNS the day's
 * $10 slot (2026-08-19 is day index 20684 → shape C: 3x$40 2-leg + $20 3-leg + $10 4-5
 * leg, so the block's slot is the 4-5 leg one) and the gated $9 rides up to the slot's
 * $10 on the same ticket — the same "no stranding" pin, in slot form.
 */
function mockEng(pool: { pl: Record<string, unknown> }[]) {
  return {
    get<T>(k: string): T {
      if (k === "SH_CFG") return { selMode: "ev_gated" } as T;
      if (k === "SH") return { bankroll: 750 } as T;
      if (k === "shCardPool") return ((_b: unknown) => pool) as T;
      if (k === "shTicketId") return ((pl: { name?: string }) => String(pl.name)) as T;
      if (k === "shAllocate")
        return ((p: { pl: Record<string, unknown> }[], amount: number, cfg: { selMode?: string }) => {
          if (cfg.selMode === "probability") {
            // the forced pass: exact-sum onto the first remaining ticket — one seat is enough
            if (!p.length || amount <= 0) return { picks: [], sum: 0, blocked: [] };
            return { picks: [{ id: String(p[0].pl.name), stake: amount, w: { pl: p[0].pl } }], sum: amount, blocked: [] };
          }
          // the gated pass: one ticket clears at $9 (Kelly-sized), the rest is refused (the 08-19 B-block shape)
          const g = p.find((x) => x.pl.name === "Gated 9");
          return g ? { picks: [{ id: "Gated 9", stake: Math.min(9, amount), w: { pl: g.pl } }], sum: 9, blocked: [] } : { picks: [], sum: 0, blocked: [] };
        }) as T;
      return null as T;
    },
  };
}
const leg = (label: string, prop: string) => ({ label, prop, lkey: `${label}|x|1`, cz: -110 });
const carryTicket = (i: number) => ({
  id: `c${i}`, stake: 8, name: `Carried ${i}`, paper: true, placed: false, actualStake: 0,
  legs: [leg(`Carry${i} (T${i})`, "Hits O 0.5"), leg(`Carry${i}b (T${i})`, "Hits O 0.5")],
});

describe("buildLockEntry — the block owns its slot; the slot top-up carries the rest (was: the window caps the fire; was: forced pass capped by the day)", () => {
  /* shape C's $10 slot is 4-5 legs, so the block's candidates are 4-leg tickets priced
     under the 16.41 ceiling (1.75^5) — 2026-09-08 restatement of the 1-leg originals */
  const four = (p: string) => [leg(`${p}1 (GGG)`, "TB O 1.5"), leg(`${p}2 (GGG)`, "TB O 1.5"), leg(`${p}3 (GGG)`, "TB O 1.5"), leg(`${p}4 (GGG)`, "TB O 1.5")];
  const pool = [
    { pl: { name: "Gated 9", czEv: 2, type: "parlay", prob: 10, czDec: 8, bsDec: 8, legs: four("Gate") } },
    { pl: { name: "Forced seat", czEv: 1, type: "parlay", prob: 9, czDec: 8, bsDec: 8, legs: four("Force") } },
  ];
  /* three carried $8 2-leg tickets, legacy carry (no shapeSlot). RE-PINNED fix round
     2026-09-08: legacy tickets now seat BY MONEY, best fit — the smallest free slot whose
     stake holds the ticket — so $8 → the $10 4-5 leg slot, the $20 3-leg slot, one $40 slot.
     They used to seat "in order" into C's three $40 slots, which parked $24 across $120 of
     slots: the day could never pass $54 and decideTopUp kept buying top-ups that rebuilt the
     same seating (the stranding this file exists to catch, from the other side). */
  const carry3 = {
    date: "2026-08-19", locked: true, lockedAt: 1, core: [1, 2, 3].map(carryTicket),
    funT: [{ id: "fun1", stake: 25, name: "HR Longshot", paper: true, placed: false, actualStake: 0, legs: [leg("HR (HHH)", "HR O 0.5")] }],
    games: {}, allocSum: 24, gatedSum: 17, blockedReasons: {},
  };
  it("replays the 08-19 $10 block: with the legacy carry seated by money the open slots are two $40s, the block owns nothing, and the day's room ($126) is DEFERRED to a bigger fire — never stranded behind small tickets in big slots", () => {
    /* OBSERVED RED (expected 34, got 24) when the seating rule changed under the old pin;
       re-pinned to the money-first outcome on purpose — see the carry3 comment. */
    const entry = buildLockEntry({
      eng: mockEng(pool) as never,
      data: { gameInfo: {}, categories: {} },
      date: "2026-08-19",
      now: T("2026-08-19T20:00:00Z"),
      trigger: "test",
      dailyOverride: 10,
      blockKey: "B-test",
      carry: carry3 as never,
    });
    const carried = (entry.core as { id: string; stake: number; shapeSlot?: number }[]).filter((t) => t.id.startsWith("c"));
    expect(carried.map((t) => t.stake)).toEqual([8, 8, 8]);
    /* seated best-fit at read time (stamps are not written onto carried tickets): the day's
       open slots after this fire are the two $40 2-leg slots the small tickets did not need */
    expect((entry as { slotsOpen?: number[] }).slotsOpen).toEqual([1, 2]);
    expect(entry.allocSum).toBe(24);
    const fresh = (entry.core as { id: string }[]).filter((t) => !t.id.startsWith("c"));
    expect(fresh).toEqual([]);
    expect(entry.blocks?.["B-test"]).toMatchObject({ budget: 10, tickets: 0, slots: [] });
    expect(String(entry.note)).toMatch(/no open slot fits inside this fire's budget \(open: \$40 2-leg slot, \$40 2-leg slot\)/);
    /* nothing is `cannot fill further` — the $126 of room is real, a $40+ fire can take it */
    expect((entry as { slotsUnfilled?: { reason: string }[] }).slotsUnfilled ?? []).toEqual([]);
  });
  it("the $10 slot is a CEILING (cap at Kelly, Josh 2026-09-08): the $9 gated pick seats at $9, the $1 the slot had left is retired — no top-up, no shortfall note", () => {
    /* the original 08-19 mechanics, on a carry that leaves the $10 slot free: two legacy
       $8 tickets → the $10 and $20 slots… so use $30 tickets, which best-fit into the $40s */
    const carry30 = { ...carry3, core: [1, 2, 3].map((i) => ({ ...carryTicket(i), stake: 30 })), allocSum: 90, gatedSum: 90 };
    const entry = buildLockEntry({
      eng: mockEng(pool) as never,
      data: { gameInfo: {}, categories: {} },
      date: "2026-08-19",
      now: T("2026-08-19T20:00:00Z"),
      trigger: "test",
      dailyOverride: 10,
      blockKey: "B-test",
      carry: carry30 as never,
    });
    expect(entry.allocSum, "the slot seated (90 carried + $9 Kelly-sized) — the stranding defect is back if this is 90").toBe(99);
    const fresh = (entry.core as { id: string; stake: number; forced?: boolean; topUp?: number; shapeSlot?: number }[]).filter((t) => !t.id.startsWith("c"));
    expect(fresh.map((t) => [t.id, t.stake, t.forced === true, t.topUp ?? 0, t.shapeSlot])).toEqual([["Gated 9", 9, false, 0, 4]]);
    expect(entry.blocks?.["B-test"]).toMatchObject({ budget: 10, tickets: 1, slots: [4] });
    expect((entry as { slotUnderSum?: number }).slotUnderSum, "the $1 Kelly declined is recorded, not re-bought").toBe(1);
    expect(entry.note, "a seated slot is a consumed slot — no shortfall note for Kelly sizing under it").toBeUndefined();
  });
  it("a FULL day (every slot of the shape carried) gives a fire no slot and no new ticket: nothing deploys, and the note says so honestly", () => {
    const carry5 = { ...carry3, core: [1, 2, 3, 4, 5].map(carryTicket), allocSum: 40 };
    const entry = buildLockEntry({
      eng: mockEng(pool) as never,
      data: { gameInfo: {}, categories: {} },
      date: "2026-08-19",
      now: T("2026-08-19T20:00:00Z"),
      trigger: "test",
      dailyOverride: 10,
      blockKey: "B-test",
      carry: carry5 as never,
    });
    /* 2026-08-22 form: "the 7-ticket day ceiling left this fire no seat". 2026-09-08 form:
       the shape's five slots are all held, so there is nowhere honest for money to go */
    expect((entry.core as unknown[]).length).toBe(5);
    expect(entry.allocSum).toBe(40);
    expect(String(entry.note)).toMatch(/every slot of the day's shape is seated/);
  });
});

describe("wired — the sweep and the yield are in the routes (source scans, comment-stripped)", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  it("refill helper: decideTopUp is called from src/lib/server/refill.ts and the forward carries ?topup=1&slot= (INSTRUCTION 49)", () => {
    const src = read("src/lib/server/refill.ts");
    expect(src).toMatch(/decideTopUp\(/);
    expect(src).toMatch(/generate\?topup=1&slot=/);
    expect(src).not.toMatch(/emptyRetryMs/);
  });
  it("scheduler: decideMlbRefill printed every no-fire poke; the cooldown is unwired and decideTopUp is no longer called there", () => {
    const src = read("app/api/scheduler/route.ts");
    expect(src).toMatch(/decideMlbRefill\(/);
    expect(src).not.toMatch(/decideTopUp\(/);
    expect(src).not.toMatch(/emptyRetryMs/);
    expect(src).toMatch(/topup/);
  });
  it("generate (fix round 2026-09-09): topup is CRON-PATH ONLY, the vercel-cron user-agent fallback is gone, and the topup-N row is claimed in flight BEFORE collectSlate", () => {
    const src = read("app/api/generate/route.ts");
    expect(src, "the keyless user-agent fallback is back — a forged header could burn the top-up headroom").not.toMatch(/vercel-cron/);
    expect(src).toMatch(/const topup = !blockKey && scheduled && req\.nextUrl\.searchParams\.get\("topup"\) === "1";/);
    expect(src).toMatch(/if \(!force && !topup && now - lastRun < 45 \* 60_000\)/);
    expect(src).toMatch(/reason: "in flight"/);
    expect(src).toMatch(/skipped: "topup-claimed"/);
    expect(src.indexOf('reason: "in flight"'), "the in-flight claim must be written before the run-cap INCR and collectSlate").toBeLessThan(src.indexOf('["INCR", runsKey]'));
  });
  it("generate: topup param honored, registry-capped, run-cap headroom exactly TOPUP_MAX, carry loaded on every fire", () => {
    const src = read("app/api/generate/route.ts");
    expect(src).toMatch(/searchParams\.get\("topup"\)/);
    expect(src).toMatch(/topup-cap/);
    expect(src).toMatch(/MAX_RUNS_PER_DATE \+ \(topup \? TOPUP_MAX : 0\)/);
    expect(src).toMatch(/const carry = await getLockEntry\(date\)/);
  });
  it("lock-card: budget-over-bias rerun exists and stamps yieldedToBudget (the $150 outranks the under preference)", () => {
    const src = read("src/lib/server/lock-card.ts");
    /* 2026-08-21: the rerun moved inside buildModeCard with the dual-mode ship — the
       pre-eviction pool is `basePool` and the rerun is `run(basePool)`; same semantics,
       now applied to BOTH selection worlds identically. */
    expect(src).toMatch(/cur = run\(basePool\)/);
    expect(src).toMatch(/yieldedToBudget/);
  });
});
