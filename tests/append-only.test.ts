import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appendOnlyViolation, assertAppendOnly, restoreShrunkDays, type AoDay } from "@/lib/append-only";

/**
 * APPEND ONLY — INSTRUCTION 48 (2026-09-09, Josh's word, verbatim: "The Card for today is
 * 'locked' which is fine, but it only played $25 today. I understand thats all it had meeting
 * the criteria at this time which is completely fine. Throughout the rest of the day refresh,
 * if it analyzes more picks/parlays that meet the betting criteria, it can continue to add to
 * the card up to the daily allotted amount. It can lock multiple times per day, but it can
 * never remove a pick it can only add to it").
 *
 * The pure module under test compares id + stake only: every ticket id in prev.core ∪ prev.funT
 * must be present in next.core ∪ next.funT at a numerically equal stake. A raised stake is a
 * violation too — a resize is neither "add" nor "keep". The four server write sites (lock-card
 * buildLockEntry + writeLock, cfb lock-server applyTopUp, football-lock topUpDate) are pinned by
 * source scan at the bottom so the contract cannot silently leave any of them.
 */

const day = (core: { id: string; stake: number }[], funT: { id: string; stake: number }[] = []): AoDay => ({ core, funT });

describe("appendOnlyViolation — id + stake, nothing else", () => {
  const prev = day([{ id: "a", stake: 30 }, { id: "b", stake: 10 }], [{ id: "f", stake: 25 }]);

  it("identical → null", () => {
    expect(appendOnlyViolation(prev, day([{ id: "a", stake: 30 }, { id: "b", stake: 10 }], [{ id: "f", stake: 25 }]))).toBeNull();
  });
  it("prev null/undefined → null (a first lock has nothing to preserve)", () => {
    expect(appendOnlyViolation(null, day([{ id: "z", stake: 5 }]))).toBeNull();
    expect(appendOnlyViolation(undefined, day([]))).toBeNull();
  });
  it("a dropped id names the id", () => {
    const v = appendOnlyViolation(prev, day([{ id: "a", stake: 30 }], [{ id: "f", stake: 25 }]));
    expect(v).toMatch(/\bb\b/);
    expect(v).toMatch(/missing/);
  });
  it("a LOWERED stake (30 → 20) names the id and both stakes", () => {
    const v = appendOnlyViolation(prev, day([{ id: "a", stake: 20 }, { id: "b", stake: 10 }], [{ id: "f", stake: 25 }]));
    expect(v).toMatch(/\ba\b/);
    expect(v).toMatch(/30/);
    expect(v).toMatch(/20/);
  });
  it("a RAISED stake (20 → 30) is a violation too — a resize is neither add nor keep", () => {
    const p = day([{ id: "a", stake: 20 }]);
    const v = appendOnlyViolation(p, day([{ id: "a", stake: 30 }]));
    expect(v).not.toBeNull();
    expect(v).toMatch(/\ba\b/);
    expect(v).toMatch(/20/);
    expect(v).toMatch(/30/);
  });
  it("a funT id moved to core at the same stake → null (the union is what is compared)", () => {
    expect(appendOnlyViolation(prev, day([{ id: "a", stake: 30 }, { id: "b", stake: 10 }, { id: "f", stake: 25 }], []))).toBeNull();
  });
  it("new ids appended → null — growth is the whole point", () => {
    expect(
      appendOnlyViolation(prev, day([{ id: "a", stake: 30 }, { id: "b", stake: 10 }, { id: "c", stake: 60 }, { id: "d", stake: 10 }], [{ id: "f", stake: 25 }, { id: "g", stake: 5 }])),
    ).toBeNull();
  });
  it("stake equality is numeric within 1e-9 — a float that rounds the same is not a resize", () => {
    expect(appendOnlyViolation(day([{ id: "a", stake: 0.1 + 0.2 }]), day([{ id: "a", stake: 0.3 }]))).toBeNull();
  });
  it("the FIRST violation is reported, in prev's own order", () => {
    const v = appendOnlyViolation(day([{ id: "a", stake: 1 }, { id: "b", stake: 2 }]), day([]));
    expect(v).toMatch(/\ba\b/);
    expect(v).not.toMatch(/\bb\b/);
  });
});

describe("assertAppendOnly — throws with the site's name in front", () => {
  it("throws `APPEND ONLY (<where>): …` on a violation", () => {
    expect(() => assertAppendOnly(day([{ id: "a", stake: 30 }]), day([]), "x")).toThrow(/^APPEND ONLY \(x\)/);
    expect(() => assertAppendOnly(day([{ id: "a", stake: 30 }]), day([{ id: "a", stake: 20 }]), "writeLock/stored")).toThrow(/^APPEND ONLY \(writeLock\/stored\): .*\ba\b/);
  });
  it("does not throw when the card only grew, and not on a first lock", () => {
    expect(() => assertAppendOnly(day([{ id: "a", stake: 30 }]), day([{ id: "a", stake: 30 }, { id: "b", stake: 5 }]), "x")).not.toThrow();
    expect(() => assertAppendOnly(null, day([{ id: "a", stake: 30 }]), "x")).not.toThrow();
  });
});

describe("wired at every server write site (source scans, comment-stripped)", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  const count = (src: string) => (src.match(/assertAppendOnly\(/g) ?? []).length;

  it("the module itself is pure: no imports at all", () => {
    const src = read("src/lib/append-only.ts");
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/require\(/);
  });
  it("src/lib/server/lock-card.ts asserts at least twice — buildLockEntry and writeLock (stored + fire)", () => {
    const src = read("src/lib/server/lock-card.ts");
    expect(src).toMatch(/from "@\/lib\/append-only"/);
    expect(count(src)).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/assertAppendOnly\([^)]*"buildLockEntry"\)/);
    expect(src).toMatch(/assertAppendOnly\([^)]*"writeLock\/stored"\)/);
    expect(src).toMatch(/assertAppendOnly\([^)]*"writeLock\/fire"\)/);
    /* the writeLock asserts sit BEFORE the SET */
    const wl = src.slice(src.indexOf("export async function writeLock"));
    expect(wl.indexOf("assertAppendOnly(")).toBeGreaterThan(-1);
    expect(wl.indexOf("assertAppendOnly(")).toBeLessThan(wl.indexOf('redis(["SET"'));
  });
  it("src/lib/cfb/lock-server.ts asserts in applyTopUp, before the money guard", () => {
    const src = read("src/lib/cfb/lock-server.ts");
    expect(count(src)).toBeGreaterThanOrEqual(1);
    const fn = src.slice(src.indexOf("export function applyTopUp"));
    const body = fn.slice(0, fn.indexOf("export const applyCfbTopUp"));
    expect(body).toMatch(/assertAppendOnly\(entry, next, "applyTopUp"\)/);
    expect(body.indexOf("assertAppendOnly(")).toBeLessThan(body.indexOf("assertEntryMoney(cfg, next)"));
  });
  it("src/lib/server/football-lock.ts asserts in topUpDate, before the SET", () => {
    const src = read("src/lib/server/football-lock.ts");
    expect(count(src)).toBeGreaterThanOrEqual(1);
    const fn = src.slice(src.indexOf("export async function topUpDate"));
    expect(fn).toMatch(/assertAppendOnly\(live, next, "topUpDate\/write"\)/);
    /* the claim row's own SET comes earlier in the function; the assert must sit between the
       applyTopUp that builds `next` and the ledger SET that stores it */
    const write = fn.slice(fn.indexOf("const next = applyTopUp("));
    expect(write.indexOf("assertAppendOnly(")).toBeGreaterThan(-1);
    expect(write.indexOf("assertAppendOnly(")).toBeLessThan(write.indexOf('redis(["SET"'));
  });
});

/* ── FIX ROUND (2026-09-09): the enforcement point that matters is the DEVICE SYNC ROUTE ────────
   The server rails only ever append, so their asserts are contracts. The writer that could shrink
   a locked day was a phone copy winning the merge; `restoreShrunkDays` runs in every ledger PUT. */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
type E = { date: string; locked?: boolean; source?: string; core?: { id: string; stake: number }[]; funT?: { id: string; stake: number }[]; extra?: string };
const isServer = (e: E) => e.source === "server-lock";

describe("restoreShrunkDays — a merged ledger may not shrink or resize a protected locked day", () => {
  const stored: E[] = [
    { date: "2026-09-05", locked: true, source: "server-lock", core: [{ id: "c1", stake: 25 }, { id: "c2", stake: 25 }, { id: "c3", stake: 25 }], funT: [{ id: "f1", stake: 25 }] },
    { date: "2026-09-04", locked: true, source: "server-lock", core: [{ id: "a1", stake: 50 }], funT: [] },
  ];
  it("puts the stored day back byte-for-byte when the merge dropped a server ticket (the 2026-09-05 phone-lock outcome)", () => {
    const merged: E[] = [
      { date: "2026-09-05", locked: true, source: "builder", core: [{ id: "c1", stake: 20 }], funT: [{ id: "f1", stake: 25 }], extra: "phone" },
      stored[1],
    ];
    const r = restoreShrunkDays(stored, merged, isServer);
    expect(r.restored).toHaveLength(1);
    expect(r.restored[0].date).toBe("2026-09-05");
    expect(r.restored[0].violation).toMatch(/c1|c2/);
    expect(r.ledger.find((e) => e.date === "2026-09-05")).toEqual(stored[0]);
    expect(r.ledger.find((e) => e.date === "2026-09-05")).not.toBe(stored[0]); // a deep copy, never the stored object
    expect(r.ledger.find((e) => e.date === "2026-09-04")).toBe(merged[1]);
  });
  it("leaves a day alone when the merge only ADDED to it", () => {
    const merged: E[] = [{ ...stored[0], core: [...stored[0].core!, { id: "c4", stake: 25 }] }, stored[1]];
    const r = restoreShrunkDays(stored, merged, isServer);
    expect(r.restored).toEqual([]);
    expect(r.ledger).toBe(r.ledger);
    expect(r.ledger[0]).toBe(merged[0]);
  });
  it("does not protect a day the predicate refuses (a device-locked day on the football rails)", () => {
    const dev: E[] = [{ date: "2026-09-06", locked: true, source: "builder", core: [{ id: "x", stake: 25 }] }];
    const merged: E[] = [{ date: "2026-09-06", locked: true, source: "builder", core: [] }];
    expect(restoreShrunkDays(dev, merged, isServer).restored).toEqual([]);
    /* MLB protects every locked day */
    expect(restoreShrunkDays(dev, merged, () => true).restored).toHaveLength(1);
  });
  it("an unlocked stored day is never protected; a protected day missing from the merge is put back", () => {
    const open: E[] = [{ date: "2026-09-07", locked: false, source: "server-lock", core: [{ id: "y", stake: 25 }] }];
    expect(restoreShrunkDays(open, [{ date: "2026-09-07", core: [] }], isServer).restored).toEqual([]);
    const r = restoreShrunkDays(stored, [stored[1]], isServer);
    expect(r.restored.map((x) => x.date)).toEqual(["2026-09-05"]);
    expect(r.ledger.map((e) => e.date).sort()).toEqual(["2026-09-04", "2026-09-05"]);
  });
});

describe("fix round — the routes that could shrink a locked day now guard it (source scans)", () => {
  for (const [rel, pred] of [
    ["app/api/ledger/route.ts", "() => true"],
    ["app/api/cfb/ledger/route.ts", '(e) => e.source === "server-lock"'],
    ["app/api/nfl/ledger/route.ts", '(e) => e.source === "server-lock"'],
  ] as const) {
    it(`${rel} runs restoreShrunkDays after mergeLedgers and before the SET, with ${pred}`, () => {
      const src = read(rel);
      const put = src.slice(src.indexOf("export async function PUT"));
      const merge = put.indexOf("mergeLedgers(cur?.ledger ?? [], v.entries)");
      const guard = put.indexOf(`restoreShrunkDays(cur?.ledger ?? [], merged0, ${pred})`);
      const set = put.indexOf('redis(["SET", STORE_KEY');
      expect(merge).toBeGreaterThan(-1);
      expect(guard).toBeGreaterThan(merge);
      expect(set).toBeGreaterThan(guard);
      expect(put).toContain("const merged = guarded.ledger;");
      expect(put).toContain("ledger: merged");
    });
  }
  it("app/api/clv/route.ts re-reads the store immediately before its merge and asserts the locked day only grew", () => {
    const src = read("app/api/clv/route.ts");
    const fresh = src.indexOf('const freshRaw = (await redis(["GET", STORE_KEY]))');
    const merge = src.indexOf("mergeLedgers(fresh?.ledger ?? [], [applied.entry])");
    const assert = src.indexOf('assertAppendOnly(before as unknown as AoDay, after as unknown as AoDay, "clv")');
    const set = src.indexOf('await redis(["SET", STORE_KEY, blob])');
    expect(fresh).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(fresh);
    expect(assert).toBeGreaterThan(merge);
    expect(set).toBeGreaterThan(assert);
    expect(src).not.toMatch(/mergeLedgers\(stored\?\.ledger/);
  });
  it("app/api/generate/route.ts records a top-up whose lock THREW as an empty fire (counts against TOPUP_MAX, arms the cooldown)", () => {
    const src = read("app/api/generate/route.ts");
    const c = src.indexOf("LOCK FAILED — the self-check will backfill");
    const tail = src.slice(c, c + 1500);
    expect(tail).toContain("if (topupKey) {");
    expect(tail).toContain("reg[topupKey] = { firedAt: now, tickets: 0, reason: `lock failed: ${(e as Error).message}`, at: now };");
    expect(tail).toContain("await redisSetJson(BLOCKS_KEY(dateNow), reg);");
  });
  it("app/api/scheduler/route.ts writes orphan rows additively — re-read then overlay, never a whole-object write-back", () => {
    const src = read("app/api/scheduler/route.ts");
    expect(src).not.toContain("if (regDirty) await redisSetJson(BLOCKS_KEY(date), reg);");
    expect(src).toContain("await redisSetJson(BLOCKS_KEY(date), { ...fresh, ...orphanRows });");
  });
});
