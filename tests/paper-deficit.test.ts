import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { effectiveBlockBudget, decideTopUp, type SlateBlock, type BlockRegistry } from "@/lib/server/blocks";
import { TOPUP_MAX, PAPER } from "@/lib/paper-mode";
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
  it("the cap is the registry's topup count — spent means spent", () => {
    const reg: BlockRegistry = { ...allFired, "topup-1": { firedAt: 4, at: 4 }, "topup-2": { firedAt: 5, at: 5 } };
    const d = decideTopUp({ entry: { paper: true, allocSum: 120 }, blocks: BLOCKS, registry: reg, starts, now, daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/cap/);
    expect(d.used).toBe(2);
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
  it("scheduler: decideTopUp printed every no-fire poke, ?topup=1 forwarded on fire", () => {
    const src = read("app/api/scheduler/route.ts");
    expect(src).toMatch(/decideTopUp\(/);
    expect(src).toMatch(/generate\?topup=1/);
    expect(src).toMatch(/topup/);
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
