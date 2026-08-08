import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BLOCK_GAP_MS, blockMinReady, decideBlock, MAX_BLOCKS, partitionBlocks, splitBudget } from "@/lib/server/blocks";
import { buildLockEntry } from "@/lib/server/lock-card";

/**
 * PER-BLOCK LOCKING (2026-08-08, operator requirement: no game block orphaned by a single
 * fixed crossing — 9 games orphaned in the system's first two live days: 6/11 on 08-06,
 * 3/15 on 08-07).
 *
 * THE THRESHOLD IS DERIVED, NOT CHOSEN (§12Z.15): the season's successive-start gap
 * histogram (139 dates, 1,819 games) has its valley at 60-89 min; the getaway-day
 * separations measure 110-115 min; the lineup lead is 180. BLOCK_GAP_MS = 90 min sits
 * above the wave structure and below every real separation — at 120 min the 08-06
 * morning trio would NOT have been its own block (gaps 110/115) and the motivating case
 * would have been orphaned by the fix built for it. Season at 90 min: max 4 blocks/day,
 * hence MAX_BLOCKS = 4 = the raised MAX_RUNS_PER_DATE.
 *
 * PRODUCTION-DERIVED PLANTS (the tab-purity lesson): the partitions below are the REAL
 * 08-06 and 08-07 slates as read live this session, not synthetic shapes.
 */

const T = (s: string) => Date.parse(s);
// the real 2026-08-06 slate (11 games, live-read §12Z.11)
const SLATE_0806 = [
  "2026-08-06T16:35:00Z", "2026-08-06T16:40:00Z", "2026-08-06T17:10:00Z",
  "2026-08-06T18:10:00Z", "2026-08-06T18:20:00Z", "2026-08-06T20:10:00Z",
  "2026-08-06T22:05:00Z", "2026-08-06T23:10:00Z", "2026-08-06T23:15:00Z",
  "2026-08-06T23:40:00Z", "2026-08-07T01:40:00Z",
].map(T);
// the real 2026-08-07 slate (15 games, live-read §12Z.13)
const SLATE_0807 = [
  "2026-08-07T22:40:00Z", "2026-08-07T22:40:00Z", "2026-08-07T22:45:00Z",
  "2026-08-07T23:05:00Z", "2026-08-07T23:10:00Z", "2026-08-07T23:10:00Z",
  "2026-08-07T23:40:00Z", "2026-08-07T23:40:00Z", "2026-08-08T00:10:00Z",
  "2026-08-08T00:15:00Z", "2026-08-08T00:15:00Z", "2026-08-08T01:40:00Z",
  "2026-08-08T01:40:00Z", "2026-08-08T01:45:00Z", "2026-08-08T02:15:00Z",
].map(T);

describe("partitionBlocks — derived threshold, production-derived plants, deterministic", () => {
  it("the real 08-06 slate partitions [5,1,4,1] — the orphaned morning trio gets its own block", () => {
    const b = partitionBlocks(SLATE_0806);
    expect(b.map((x) => x.starts.length)).toEqual([5, 1, 4, 1]);
    expect(b[0].key).toBe("2026-08-06T16:35Z");
  });
  it("the real 08-07 slate partitions [15] — one-shot was CORRECT there; per-block must not fragment it", () => {
    const b = partitionBlocks(SLATE_0807);
    expect(b.map((x) => x.starts.length)).toEqual([15]);
  });
  it("determinism: shuffled input, identical partition and keys", () => {
    const shuffled = [...SLATE_0806].reverse();
    expect(partitionBlocks(shuffled)).toEqual(partitionBlocks(SLATE_0806));
  });
  it("more than MAX_BLOCKS coalesces at the smallest inter-block gap — the run cap stays meaningful", () => {
    const starts = ["10:00", "13:00", "16:00", "19:00", "21:00"].map((h) => T(`2026-08-08T${h}:00Z`));
    const b = partitionBlocks(starts);
    expect(b.length).toBe(MAX_BLOCKS);
    // the 19:00/21:00 pair (2h) is the smallest gap (others 3h) — they merge
    expect(b[MAX_BLOCKS - 1].starts.length).toBe(2);
  });
  it("BLOCK_GAP_MS is the derived 90 minutes", () => {
    expect(BLOCK_GAP_MS).toBe(90 * 60_000);
  });
});

describe("blockMinReady — scaled floor, never above the global 4", () => {
  it("the scaling rule: ceil(size/2) capped at 4, floor 1", () => {
    const want: [number, number][] = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [11, 4], [15, 4]];
    for (const [size, mr] of want) expect(blockMinReady(size), `size ${size}`).toBe(mr);
  });
});

describe("splitBudget — pro-rata by block size, conservation exact", () => {
  it("$75 over the Sunday shape [11,3,1] -> [55,15,5], sum exactly the daily", () => {
    const blocks = [
      { key: "A", starts: new Array(11).fill(T("2026-08-09T16:15:00Z")) },
      { key: "B", starts: new Array(3).fill(T("2026-08-09T20:05:00Z")) },
      { key: "C", starts: [T("2026-08-10T00:20:00Z")] },
    ];
    expect(splitBudget(75, blocks)).toEqual({ A: 55, B: 15, C: 5 });
  });
  it("CONSERVATION: rounding never exceeds the daily (remainder goes to the largest block)", () => {
    for (const daily of [75, 74, 10, 7]) {
      for (const sizes of [[5, 1, 4, 1], [15], [11, 3, 1], [2, 2, 3]]) {
        const blocks = sizes.map((n, i) => ({ key: `k${i}`, starts: new Array(n).fill(T("2026-08-08T20:00:00Z") + i) }));
        const split = splitBudget(daily, blocks);
        const sum = Object.values(split).reduce((a, v) => a + v, 0);
        expect(sum, `daily ${daily} sizes ${sizes}`).toBeLessThanOrEqual(daily);
      }
    }
  });
});

describe("decideBlock — the two conditions, per block", () => {
  const blk = { key: "2026-08-06T16:35Z", starts: SLATE_0806.slice(0, 5) }; // the morning-5 block
  it("fires when the block's own ready-share and scaled floor hold (the trio's block at 15:20Z)", () => {
    const d = decideBlock({ block: blk, now: T("2026-08-06T15:20:00Z") });
    expect(d).toMatchObject({ fire: true, ready: 5, unstarted: 5, started: 0, minReady: 3 });
    expect(d.achievable).toBe(1);
  });
  it("holds before the block's lineups post", () => {
    const d = decideBlock({ block: blk, now: T("2026-08-06T13:00:00Z") });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/achievable|ready/);
  });
  it("a burned-down block cannot fire on its ratio (the §12Z.3 class, per block)", () => {
    const d = decideBlock({ block: { key: "k", starts: SLATE_0806.slice(0, 5) }, now: T("2026-08-06T18:15:00Z") });
    // four of five started; the survivor reads 1/1 = 1.0 — the scaled floor refuses it? size-5 floor is 3
    expect(d.ready).toBeLessThanOrEqual(1);
    expect(d.fire).toBe(false);
  });
  it("a fully-started block is the orphan shape: dead-block reason, never a fire", () => {
    const d = decideBlock({ block: blk, now: T("2026-08-06T19:00:00Z") });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/dead-block/);
  });
});

describe("IMPOSSIBLE BRANCH — two cards containing the same game", () => {
  it("buildLockEntry THROWS when a new block's games intersect an already-locked block's games", () => {
    const eng = {
      get<T>(k: string): T {
        if (k === "SH_CFG") return { dailyBankrollCap: 0.1 } as T;
        if (k === "SH") return { bankroll: 750 } as T;
        if (k === "shCardPool") return ((_b: unknown) => []) as T;
        if (k === "shAllocate") return ((..._a: unknown[]) => ({ picks: [], sum: 0, blocked: [] })) as T;
        return null as T;
      },
    };
    const carry = {
      date: "2026-08-08",
      locked: true,
      core: [],
      funT: [],
      games: {},
      blocks: { "2026-08-08T17:05Z": { budget: 40, tickets: 2, gkeys: ["g1", "g2"] } },
    };
    expect(() =>
      buildLockEntry({
        eng: eng as never,
        data: { gameInfo: { g2: { pk: 2, start: "2026-08-08T21:00:00Z" }, g3: { pk: 3, start: "2026-08-08T21:05:00Z" } } } as never,
        date: "2026-08-08",
        now: Date.parse("2026-08-08T18:00:00Z"),
        trigger: "header",
        carry: carry as never,
        blockKey: "2026-08-08T21:00Z",
        blockGkeys: new Set(["g2", "g3"]), // g2 is already inside the 17:05Z block's card scope
      }),
    ).toThrow(/TWO CARDS ONE GAME/);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  it("scheduler: per-block evaluation in every body, orphan reasons written, block fire forwarded", () => {
    const src = read("app/api/scheduler/route.ts");
    expect(src).toMatch(/partitionBlocks\(/);
    expect(src).toMatch(/blocks:/);
    expect(src).toMatch(/orphan/i);
    expect(src).toMatch(/block=\$\{|block=" \+|block=/);
  });
  it("generate: block param honored, good-BLOCK-skip, MAX_RUNS raised to the observed cap", () => {
    const src = read("app/api/generate/route.ts");
    expect(src).toMatch(/searchParams\.get\("block"\)/);
    expect(src).toMatch(/block-already-locked/);
    expect(src).toMatch(/MAX_RUNS_PER_DATE = 4/);
  });
});
