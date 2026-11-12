import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { MAX_BYTES, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { LEDGER_EPOCH } from "@/lib/ledger-epoch";

/**
 * AUDIT G1-7 — the MLB lock writer refuses a merged ledger above the size every other writer refuses.
 *
 * Before this fix writeLock stored whatever the merge produced. The device route answers 413 to a
 * merged ledger above MAX_BYTES, so a lock that pushed the stored ledger over the line left a record
 * no device could ever save a grade or a bank change into again. Now the lock is refused with a
 * typed error BEFORE the SET, and the stored ledger is what it was.
 *
 * Every refusal below sits next to the case one character smaller that still writes, so "nothing
 * was written" is never true merely because nothing ran.
 */

const world = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets: unknown[][] = [];
  async function run(cmd: unknown[]): Promise<unknown> {
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    if (op === "GET") return kv.get(key) ?? null;
    if (op === "SET") {
      sets.push(cmd);
      if (rest.includes("NX") && kv.has(key)) return null;
      kv.set(key, String(rest[0]));
      return "OK";
    }
    throw new Error(`fake redis: ${op}`);
  }
  return { kv, sets, run };
});

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return {
    ...real,
    redis: vi.fn(world.run),
    redisGetJson: vi.fn(async (key: string) => {
      const raw = world.kv.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }),
    redisSetJson: vi.fn(async (key: string, value: unknown) => void (await world.run(["SET", key, JSON.stringify(value)]))),
    syncConfigMissing: vi.fn(() => []),
    syncAuthed: vi.fn((req: { headers: { get(k: string): string | null } }) => req.headers.get("x-pl-sync") === "test-phrase"),
  };
});

import { unreadableKeyOf } from "@/lib/server/ledger-read";
import { LEDGER_STORE_KEY, LedgerTooLarge, writeLock } from "@/lib/server/lock-card";
import { tickFailureOf } from "@/lib/server/tick-failure";
import * as route from "../app/api/ledger/route";

const KEY = LEDGER_STORE_KEY;

const ticket = (id: string, stake: number, labels: string[]) => ({
  id, stake, name: `T ${id}`, paper: true, placed: false, actualStake: 0,
  legs: labels.map((l) => ({ label: l, prop: "Hits O 0.5", lkey: `${l}|batter_hits|0.5`, cz: -110, gkey: "g-1" })),
});
const dayWith = (date: string, core: ReturnType<typeof ticket>[], extra: Record<string, unknown> = {}) =>
  ({ date, locked: true, paper: true, lockedAt: 1_700_000_000_000, trigger: "server-lock", daily: 150, allocSum: core.reduce((a, t) => a + t.stake, 0), core, funT: [], games: {}, ...extra }) as unknown as SyncEntry;

/** the lock every case fires: one small day */
const FIRE = dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"])]);
const sizeOf = (ledger: SyncEntry[]) => JSON.stringify(ledger).length;

/**
 * A stored ledger whose merge with `fire` is EXACTLY `target` characters. One earlier day carries a
 * filler string; the filler is sized from the real merge, and the result is checked, not assumed.
 */
function storedFor(target: number, fire: SyncEntry = FIRE, more: SyncEntry[] = []): SyncEntry[] {
  const build = (n: number) => [dayWith("2026-09-09", [ticket("A", 30, ["A1", "A2"])], { filler: "x".repeat(n) }), ...more];
  const base = sizeOf(mergeLedgers(build(0), [fire]));
  const stored = build(target - base);
  expect(sizeOf(mergeLedgers(stored, [fire]))).toBe(target);
  return stored;
}

function seed(ledger: SyncEntry[] | null): string | null {
  world.kv.clear();
  world.sets.length = 0;
  if (!ledger) return null;
  const raw = JSON.stringify({ epoch: 2, at: 1, ledger });
  world.kv.set(KEY, raw);
  return raw;
}
const setsTo = (key: string) => world.sets.filter((c) => c[1] === key);
const storedNow = () => JSON.parse(world.kv.get(KEY)!) as { epoch?: number; at?: number; ledger: SyncEntry[] };

beforeEach(() => void seed(null));

describe("G1-7 — the limit and the error", () => {
  it("the limit is the one every ledger writer shares: 900,000 characters", () => {
    expect(MAX_BYTES).toBe(900_000);
  });

  it("LedgerTooLarge is a named error that carries the size and says nothing was written", () => {
    const e = new LedgerTooLarge(900_001);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("LedgerTooLarge");
    expect(e.size).toBe(900_001);
    expect(e.message).toBe("merged ledger too large — nothing written: 900001 characters, limit 900000");
  });

  it("a scheduler backfill that hits it answers 500 with the reason, not a silent 200", () => {
    const f = tickFailureOf(new LedgerTooLarge(900_001), ["test-key-never-logged"]);
    expect(f.status).toBe(500);
    expect(f.body).toEqual({ ok: false, error: "mlb-tick-failed", detail: "merged ledger too large — nothing written: 900001 characters, limit 900000" });
  });
});

describe("G1-7 — writeLock at the line", () => {
  it("as before: a first lock and a lock onto a small ledger both write", async () => {
    expect(await writeLock(FIRE)).toEqual({ merged: 1, existedBefore: false });
    expect(setsTo(KEY)).toHaveLength(1);

    seed([dayWith("2026-09-09", [ticket("A", 30, ["A1", "A2"])]), dayWith("2026-09-10", [ticket("X", 30, ["B1", "B2"])])]);
    expect(await writeLock(FIRE)).toEqual({ merged: 3, existedBefore: false });
    expect(storedNow().epoch).toBe(2);
    expect(storedNow().ledger.map((e) => e.date).sort()).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
  });

  it("a merged ledger of exactly the limit writes — the limit itself is allowed", async () => {
    seed(storedFor(MAX_BYTES));
    expect(await writeLock(FIRE)).toEqual({ merged: 2, existedBefore: false });
    expect(setsTo(KEY)).toHaveLength(1);
    const out = storedNow();
    expect(sizeOf(out.ledger)).toBe(MAX_BYTES);
    expect(out.epoch).toBe(2);
    expect(out.at).toBe(1_700_000_000_000);
    expect(out.ledger.map((e) => e.date)).toEqual(["2026-09-09", "2026-09-11"]);
  });

  it("one character under the limit writes", async () => {
    seed(storedFor(MAX_BYTES - 1));
    expect(await writeLock(FIRE)).toEqual({ merged: 2, existedBefore: false });
    expect(sizeOf(storedNow().ledger)).toBe(MAX_BYTES - 1);
  });

  it("one character over the limit is refused before the SET — the stored value is byte-for-byte what it was", async () => {
    const raw = seed(storedFor(MAX_BYTES + 1));
    const err = await writeLock(FIRE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerTooLarge);
    expect((err as LedgerTooLarge).name).toBe("LedgerTooLarge");
    expect((err as LedgerTooLarge).size).toBe(MAX_BYTES + 1);
    expect((err as LedgerTooLarge).message).toMatch(/^merged ledger too large — nothing written: 900001 characters, limit 900000$/);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.sets).toEqual([]);
    expect(world.kv.has(unreadableKeyOf(KEY))).toBe(false);
    expect(storedNow().ledger.map((e) => e.date)).toEqual(["2026-09-09"]);
  });

  it.each([MAX_BYTES + 2, MAX_BYTES + 5_000, MAX_BYTES * 2, MAX_BYTES * 12])("%d characters is refused the same way", async (target) => {
    const raw = seed(storedFor(target));
    await expect(writeLock(FIRE)).rejects.toThrow(LedgerTooLarge);
    await expect(writeLock(FIRE)).rejects.toMatchObject({ size: target });
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.sets).toEqual([]);
  });

  it("the refusal repeats: a second and third try write nothing either, and a smaller lock still goes through", async () => {
    const stored = storedFor(MAX_BYTES + 1);
    const raw = seed(stored);
    for (let i = 0; i < 3; i++) await expect(writeLock(FIRE)).rejects.toThrow(LedgerTooLarge);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.sets).toEqual([]);

    /* the same stored ledger takes a lock two characters smaller: id "N" → "", label "C1" → "C" would
       change the shape, so shrink the name instead — `T N` is three characters, the day key is fixed */
    const smaller = dayWith("2026-09-11", [{ ...ticket("N", 20, ["C1", "C2"]), name: "T" }]);
    expect(sizeOf(mergeLedgers(stored, [smaller]))).toBe(MAX_BYTES - 1);
    expect(await writeLock(smaller)).toEqual({ merged: 2, existedBefore: false });
    expect(setsTo(KEY)).toHaveLength(1);
  });

  it("a first lock that is itself over the limit is refused, and the key stays absent", async () => {
    const huge = dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"])], { filler: "x".repeat(MAX_BYTES) });
    await expect(writeLock(huge)).rejects.toThrow(LedgerTooLarge);
    expect(world.kv.has(KEY)).toBe(false);
    expect(world.sets).toEqual([]);
  });

  it("a lock onto a date already stored is held to the same line", async () => {
    const more = [dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"])])];
    const grown = dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"]), ticket("Y", 10, ["D1", "D2", "D3"])]);

    seed(storedFor(MAX_BYTES, grown, more));
    expect(await writeLock(grown)).toEqual({ merged: 2, existedBefore: true });
    expect(sizeOf(storedNow().ledger)).toBe(MAX_BYTES);

    const raw = seed(storedFor(MAX_BYTES + 1, grown, more));
    await expect(writeLock(grown)).rejects.toMatchObject({ name: "LedgerTooLarge", size: MAX_BYTES + 1 });
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.sets).toEqual([]);
  });
});

describe("G1-7 — what is measured", () => {
  it("the merged ledger array, not the stored wrapper: at the limit the stored text is longer than the limit and still writes", async () => {
    seed(storedFor(MAX_BYTES));
    await writeLock(FIRE);
    expect(world.kv.get(KEY)!.length).toBeGreaterThan(MAX_BYTES);
    expect(sizeOf(storedNow().ledger)).toBe(MAX_BYTES);
  });

  it("the whole merged ledger, not the day being locked: a lock of a few hundred characters is refused when the total is over", async () => {
    expect(sizeOf([FIRE])).toBeLessThan(500);
    seed(storedFor(MAX_BYTES + 1));
    await expect(writeLock(FIRE)).rejects.toThrow(LedgerTooLarge);
  });

  it("the merged ledger, not what was stored before: a stored ledger under the limit is refused when the lock takes it over", async () => {
    const stored = storedFor(MAX_BYTES + 1);
    expect(sizeOf(stored)).toBeLessThan(MAX_BYTES);
    seed(stored);
    await expect(writeLock(FIRE)).rejects.toThrow(LedgerTooLarge);
  });
});

describe("G1-7 — the lock writer and the device route draw the same line", () => {
  const H = { "x-pl-sync": "test-phrase", "content-type": "application/json" };
  const put = (body: unknown) => route.PUT(new NextRequest("https://x.test/api/ledger", { method: "PUT", headers: H, body: JSON.stringify(body) }));

  it("at the limit both write", async () => {
    seed(storedFor(MAX_BYTES));
    const r = await put({ ledger: [FIRE], epoch: LEDGER_EPOCH });
    expect(r.status).toBe(200);
    expect(sizeOf(storedNow().ledger)).toBe(MAX_BYTES);

    seed(storedFor(MAX_BYTES));
    await writeLock(FIRE);
    expect(sizeOf(storedNow().ledger)).toBe(MAX_BYTES);
  });

  it("one character over, the route answers 413 and the lock throws — neither writes the ledger", async () => {
    const raw = seed(storedFor(MAX_BYTES + 1));
    const r = await put({ ledger: [FIRE], epoch: LEDGER_EPOCH });
    expect(r.status).toBe(413);
    expect(((await r.json()) as { error: string }).error).toBe("merged ledger too large");
    expect(world.kv.get(KEY)).toBe(raw);

    await expect(writeLock(FIRE)).rejects.toThrow(LedgerTooLarge);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(setsTo(KEY)).toEqual([]);
  });

  it("what the lock stores, a device can still save into: the day after an at-the-limit lock, an identical push is 200", async () => {
    seed(storedFor(MAX_BYTES));
    await writeLock(FIRE);
    const r = await put({ ledger: [FIRE], epoch: LEDGER_EPOCH });
    expect(r.status).toBe(200);
  });
});

describe("G1-7 — the order of the refusals", () => {
  it("a day that shrank is still an APPEND ONLY refusal, even when the ledger is also over the limit", async () => {
    const more = [dayWith("2026-09-11", [ticket("X", 30, ["A1", "A2"])])];
    const lower = dayWith("2026-09-11", [ticket("X", 20, ["A1", "A2"])]);
    const build = (n: number) => [dayWith("2026-09-09", [ticket("A", 30, ["A1", "A2"])], { filler: "x".repeat(n) }), ...more];
    const stored = build(MAX_BYTES);
    expect(sizeOf(mergeLedgers(stored, [lower]))).toBeGreaterThan(MAX_BYTES);
    const raw = seed(stored);
    const err = await writeLock(lower).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/APPEND ONLY \(writeLock/);
    expect(err).not.toBeInstanceOf(LedgerTooLarge);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.sets).toEqual([]);
  });

  it("an unreadable stored value is still the unreadable refusal: the size is never reached", async () => {
    world.kv.set(KEY, "this is not a ledger");
    const huge = dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"])], { filler: "x".repeat(MAX_BYTES) });
    const err = await writeLock(huge).catch((e: unknown) => e);
    expect((err as Error).name).toBe("LedgerUnreadable");
    expect(world.kv.get(KEY)).toBe("this is not a ledger");
    expect(setsTo(KEY)).toEqual([]);
  });
});

describe("G1-7 — as source", () => {
  const strip = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = strip("src/lib/server/lock-card.ts");
  const from = src.indexOf("export async function writeLock");
  const wl = src.slice(from, src.indexOf("export async function lockExists", from));

  it("the check sits after both append-only asserts and before the one SET", () => {
    const check = wl.indexOf("if (size > MAX_BYTES) throw new LedgerTooLarge(size);");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(wl.indexOf('"writeLock/stored"'));
    expect(check).toBeGreaterThan(wl.indexOf('"writeLock/fire"'));
    expect(check).toBeLessThan(wl.indexOf('redis(["SET", LEDGER_STORE_KEY'));
    expect(wl.match(/redis\(\["SET"/g)).toHaveLength(1);
    expect(wl.match(/throw new LedgerTooLarge\(/g)).toHaveLength(1);
  });

  it("the size is the merged ledger's, measured the way the device route measures it", () => {
    expect(wl).toMatch(/const size = JSON\.stringify\(merged\)\.length;/);
    expect(strip("app/api/ledger/route.ts")).toMatch(/if \(JSON\.stringify\(merged\)\.length > MAX_BYTES\)/);
  });

  it("the limit is the shared constant, never a number written here", () => {
    expect(src).toMatch(/import \{ MAX_BYTES, mergeLedgers, validateLedger, type SyncEntry, type SyncTicket \} from "@\/lib\/ledger-merge";/);
    expect(src).not.toMatch(/const MAX_BYTES\b|let MAX_BYTES\b/);
    expect(wl).not.toMatch(/900[_,]?000|9e5/);
    expect(strip("src/lib/ledger-merge.ts")).toMatch(/export const MAX_BYTES = 900_000;/);
  });

  it("the route that calls writeLock turns a throw into lock.error, so the refusal is seen", () => {
    const gen = strip("app/api/generate/route.ts");
    const call = gen.indexOf("const w = await writeLock(entry);");
    expect(call).toBeGreaterThan(-1);
    expect(gen.slice(call)).toMatch(/\} catch \(e\) \{\s*lock = \{ error: \(e as Error\)\.message \};/);
  });
});
