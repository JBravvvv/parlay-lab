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
  it("holds while a block is still pending — that block's own fire carries the deficit", () => {
    const reg: BlockRegistry = { A: { firedAt: 1, at: 1 }, B: { firedAt: 2, at: 2 } }; // C unfired, alive
    const d = decideTopUp({ entry: { paper: true, allocSum: 49 }, blocks: BLOCKS, registry: reg, starts, now: T("2026-08-19T19:00:00Z"), daily: PAPER.daily, max: TOPUP_MAX });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/pending/);
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
 * pass seats one $9 ticket against a $10 budget with 5 tickets already carried. The old
 * code's forcedMax was win.maxNew(=1) − gated(1) = 0 — the dollar stranded and the note
 * blamed the "10-ticket day ceiling" with 6 tickets on the day. The day allowance
 * (10 − 5 carried − 1 gated = 4) says the forced pass had four seats all along.
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
          if (cfg.selMode === "caesars_ev") {
            // exact-sum onto the first remaining ticket — the legacy guarantee, one seat is enough
            if (!p.length || amount <= 0) return { picks: [], sum: 0, blocked: [] };
            return { picks: [{ id: String(p[0].pl.name), stake: amount, w: { pl: p[0].pl } }], sum: amount, blocked: [] };
          }
          // the gated pass: one $9 ticket clears, the rest is refused (the 08-19 B-block shape)
          const g = p.find((x) => x.pl.name === "Gated 9");
          return g ? { picks: [{ id: "Gated 9", stake: 9, w: { pl: g.pl } }], sum: 9, blocked: [] } : { picks: [], sum: 0, blocked: [] };
        }) as T;
      return null as T;
    },
  };
}
const leg = (label: string, prop: string) => ({ label, prop, lkey: `${label}|x|1`, cz: -110 });
const carryTicket = (i: number) => ({
  id: `c${i}`, stake: 8, name: `Carried ${i}`, paper: true, placed: false, actualStake: 0,
  legs: [leg(`Carry${i} (T${i})`, "Hits O 0.5")],
});

describe("buildLockEntry — the forced pass is capped by the DAY, not the block window", () => {
  const pool = [
    { pl: { name: "Gated 9", czEv: 2, type: "parlay", prob: 60, legs: [leg("Gate (GGG)", "TB O 1.5")] } },
    { pl: { name: "Forced seat", czEv: 1, type: "parlay", prob: 55, legs: [leg("Force (FFF)", "Hits O 0.5")] } },
  ];
  const carry5 = {
    date: "2026-08-19", locked: true, lockedAt: 1, core: [1, 2, 3, 4, 5].map(carryTicket),
    funT: [{ id: "fun1", stake: 25, name: "HR Longshot", paper: true, placed: false, actualStake: 0, legs: [leg("HR (HHH)", "HR O 0.5")] }],
    games: {}, allocSum: 40, gatedSum: 17, blockedReasons: {},
  };
  it("replays the 08-19 $10 block and deploys ALL of it: $9 gated + $1 forced (old code stranded the $1)", () => {
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
    expect(entry.allocSum, "the block's budget did not fully deploy — the stranding defect is back").toBe(50); // 40 carried + 10
    const fresh = (entry.core as { id: string; stake: number; forced?: boolean }[]).filter((t) => !t.id.startsWith("c"));
    expect(fresh.map((t) => [t.id, t.stake, t.forced === true])).toEqual([
      ["Gated 9", 9, false],
      ["Forced seat", 1, true],
    ]);
    expect(entry.note, "a fully-deployed fire must not carry a shortfall note").toBeUndefined();
  });
  it("the 10-ticket day ceiling is the one thing that still stops the top-up — and the note says so honestly", () => {
    const carry10 = { ...carry5, core: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(carryTicket), allocSum: 80 };
    const entry = buildLockEntry({
      eng: mockEng(pool) as never,
      data: { gameInfo: {}, categories: {} },
      date: "2026-08-19",
      now: T("2026-08-19T20:00:00Z"),
      trigger: "test",
      dailyOverride: 10,
      blockKey: "B-test",
      carry: carry10 as never,
    });
    // gated still runs (the tracked system is never count-capped); forced has no seat
    expect((entry.core as unknown[]).length).toBe(11);
    expect(entry.allocSum).toBe(89); // 80 + the $9 gated; the forced $1 has no allowance
    expect(String(entry.note)).toMatch(/10-ticket day ceiling/);
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
    expect(src).toMatch(/poolBeforeQuota/);
    expect(src).toMatch(/yieldedToBudget/);
  });
});
