import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { NextRequest } from "next/server";
import type { SyncEntry } from "@/lib/ledger-merge";
import { EPOCH_ARCHIVE_KEY, LEDGER_EPOCH } from "@/lib/ledger-epoch";

/**
 * AUDIT D-1 — an unreadable stored MLB ledger is not an empty ledger.
 *
 * Before this fix a value at pl:ledger:v1 that would not parse (or parsed to something with no
 * `ledger` array) read as "nothing stored" in three places, and each then wrote over it:
 *   1. ensureLedgerEpoch reset it to an empty ledger with no archive;
 *   2. writeLock replaced it with a one-day ledger;
 *   3. the ledger route showed an empty ledger and stored the device's copy over it.
 * Now all three read through readStoredLedger, which copies the raw value aside once and throws.
 * Every refusal below is paired with the healthy case next to it, so "nothing was written" is
 * never true merely because nothing ran.
 */

const world = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets: unknown[][] = [];
  const fail: { get: Error | null; setOn: string | null } = { get: null, setOn: null };
  async function run(cmd: unknown[]): Promise<unknown> {
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    if (op === "GET") {
      if (fail.get) throw fail.get;
      return kv.get(key) ?? null;
    }
    if (op === "SET") {
      if (fail.setOn === key) throw new Error("store 403");
      sets.push(cmd);
      if (rest.includes("NX") && kv.has(key)) return null;
      kv.set(key, String(rest[0]));
      return "OK";
    }
    throw new Error(`fake redis: ${op}`);
  }
  return { kv, sets, fail, run };
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

import { LedgerUnreadable, parseStoredLedger, readStoredLedger, unreadableKeyOf } from "@/lib/server/ledger-read";
import { ensureLedgerEpoch } from "@/lib/server/ledger-epoch-server";
import { LEDGER_STORE_KEY, writeLock } from "@/lib/server/lock-card";
import * as route from "../app/api/ledger/route";

const KEY = LEDGER_STORE_KEY;
const ASIDE = unreadableKeyOf(KEY);

const ticket = (id: string, stake: number, labels: string[]) => ({
  id, stake, name: `T ${id}`, paper: true, placed: false, actualStake: 0,
  legs: labels.map((l) => ({ label: l, prop: "Hits O 0.5", lkey: `${l}|batter_hits|0.5`, cz: -110, gkey: "g-1" })),
});
const dayWith = (date: string, core: ReturnType<typeof ticket>[]) =>
  ({ date, locked: true, paper: true, lockedAt: 1_700_000_000_000, trigger: "server-lock", daily: 150, allocSum: core.reduce((a, t) => a + t.stake, 0), core, funT: [], games: {} }) as unknown as SyncEntry;

const HEALTHY = JSON.stringify({ epoch: 2, at: 1, ledger: [dayWith("2026-09-09", [ticket("A", 30, ["A1", "A2"])]), dayWith("2026-09-10", [ticket("X", 30, ["B1", "B2"])])] });
/** a real record cut off mid-write: 600 KB of season, unparseable */
const BROKEN = HEALTHY.slice(0, HEALTHY.length - 40);
const UNREADABLE: [string, string][] = [
  ["truncated JSON", BROKEN],
  ["plain text", "this is not a ledger"],
  ["a gzip stamp nothing unpacked", "gz1:H4sIAAAAAAAA"],
  ["an array at the root", JSON.stringify([dayWith("2026-09-10", [])])],
  ["JSON null", "null"],
  ["a number", "42"],
  ["an object with no ledger", JSON.stringify({ epoch: 2, at: 1 })],
  ["a ledger that is not an array", JSON.stringify({ epoch: 2, ledger: { "2026-09-10": {} } })],
];

function seed(raw: string | null) {
  world.kv.clear();
  world.sets.length = 0;
  world.fail.get = null;
  world.fail.setOn = null;
  if (raw != null) world.kv.set(KEY, raw);
}
const setsTo = (key: string) => world.sets.filter((c) => c[1] === key);

beforeEach(() => seed(null));

describe("D-1 — what a stored value is", () => {
  it("nothing stored is absent, not unreadable", () => {
    for (const raw of [null, undefined, ""]) expect(parseStoredLedger(raw)).toEqual({ state: "absent" });
  });

  it("a stored ledger reads, with or without an epoch, empty or not", () => {
    expect(parseStoredLedger(HEALTHY)).toMatchObject({ state: "ok", stored: { epoch: 2 } });
    expect(parseStoredLedger('{"ledger":[]}')).toEqual({ state: "ok", stored: { ledger: [] } });
    const first = parseStoredLedger<{ date: string }>('{"ledger":[{"date":"2026-08-01"}]}');
    expect(first.state === "ok" && first.stored.epoch).toBe(undefined);
    expect(first.state === "ok" && first.stored.ledger).toEqual([{ date: "2026-08-01" }]);
  });

  it.each(UNREADABLE)("%s is unreadable, with a reason", (_name, raw) => {
    const p = parseStoredLedger(raw);
    expect(p.state).toBe("unreadable");
    expect(p.state === "unreadable" && p.why.length).toBeGreaterThan(5);
  });

  it("the reason says what is wrong: a list at the root is 'not an object', an object without one is missing its ledger", () => {
    expect(parseStoredLedger("[]")).toEqual({ state: "unreadable", why: "not an object" });
    expect(parseStoredLedger("null")).toEqual({ state: "unreadable", why: "not an object" });
    expect(parseStoredLedger("{}")).toEqual({ state: "unreadable", why: "no `ledger` array on the stored object" });
    expect(parseStoredLedger("{").state === "unreadable" && parseStoredLedger("{")).toMatchObject({ why: expect.stringMatching(/^not JSON: /) });
  });

  it("a value that is not text is unreadable", () => {
    expect(parseStoredLedger({ ledger: [] }).state).toBe("unreadable");
    expect(parseStoredLedger(0).state).toBe("unreadable");
  });
});

describe("D-1 — the one reader", () => {
  it("absent → null, readable → the stored object and its exact text; neither writes", async () => {
    expect(await readStoredLedger(KEY)).toBe(null);
    seed(HEALTHY);
    const r = await readStoredLedger<SyncEntry>(KEY);
    expect(r?.raw).toBe(HEALTHY);
    expect(r?.stored.ledger.map((e) => e.date)).toEqual(["2026-09-09", "2026-09-10"]);
    expect(world.sets).toEqual([]);
  });

  it.each(UNREADABLE)("%s: throws, names the key, copies the raw value aside, leaves the ledger key alone", async (_name, raw) => {
    seed(raw);
    const err = await readStoredLedger(KEY).catch((e) => e);
    expect(err).toBeInstanceOf(LedgerUnreadable);
    expect((err as Error).message).toContain(KEY);
    expect((err as Error).message).toMatch(/refusing to write/);
    expect(world.sets).toEqual([["SET", ASIDE, raw, "NX"]]);
    expect(world.kv.get(ASIDE)).toBe(raw);
    expect(world.kv.get(KEY)).toBe(raw);
  });

  it("the first copy wins: a later, different unreadable value never replaces it", async () => {
    seed(BROKEN);
    await expect(readStoredLedger(KEY)).rejects.toThrow(LedgerUnreadable);
    world.kv.set(KEY, "second damage");
    await expect(readStoredLedger(KEY)).rejects.toThrow(LedgerUnreadable);
    await expect(readStoredLedger(KEY)).rejects.toThrow(LedgerUnreadable);
    expect(world.kv.get(ASIDE)).toBe(BROKEN);
    expect(world.sets.every((c) => c[1] === ASIDE && c[3] === "NX")).toBe(true);
  });

  it("the copy failing does not turn the refusal into a pass, and a store that is down is not 'unreadable'", async () => {
    seed(BROKEN);
    world.fail.setOn = ASIDE;
    await expect(readStoredLedger(KEY)).rejects.toThrow(LedgerUnreadable);
    seed(HEALTHY);
    world.fail.get = new Error("store 403");
    const err = await readStoredLedger(KEY).catch((e) => e);
    expect(err).not.toBeInstanceOf(LedgerUnreadable);
    expect((err as Error).message).toBe("store 403");
    expect(world.sets).toEqual([]);
  });
});

describe("D-1 — the epoch check never resets what it cannot read", () => {
  it("as before: nothing stored → an empty paper-era ledger; a first-era ledger → archived once, then reset; the paper era → untouched", async () => {
    expect(await ensureLedgerEpoch()).toEqual({ migrated: true, archived: false });
    expect(JSON.parse(world.kv.get(KEY)!)).toMatchObject({ ledger: [], epoch: LEDGER_EPOCH });

    const era1 = JSON.stringify({ ledger: [dayWith("2026-08-01", [ticket("R", 50, ["A1", "A2"])])], at: 5 });
    seed(era1);
    expect(await ensureLedgerEpoch()).toEqual({ migrated: true, archived: true });
    expect(world.kv.get(EPOCH_ARCHIVE_KEY)).toBe(era1);
    expect(JSON.parse(world.kv.get(KEY)!)).toMatchObject({ ledger: [], epoch: LEDGER_EPOCH });

    seed(HEALTHY);
    expect(await ensureLedgerEpoch()).toEqual({ migrated: false, archived: false });
    expect(world.sets).toEqual([]);
    expect(world.kv.get(KEY)).toBe(HEALTHY);
  });

  it.each(UNREADABLE)("%s: refuses — no reset, no archive, the raw value still there and copied aside", async (_name, raw) => {
    seed(raw);
    await expect(ensureLedgerEpoch()).rejects.toThrow(LedgerUnreadable);
    await expect(ensureLedgerEpoch()).rejects.toThrow(/unreadable value/);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(setsTo(KEY)).toEqual([]);
    expect(world.kv.has(EPOCH_ARCHIVE_KEY)).toBe(false);
    expect(world.kv.get(ASIDE)).toBe(raw);
  });
});

describe("D-1 — writeLock never writes a one-day ledger over what it cannot read", () => {
  const fire = dayWith("2026-09-11", [ticket("N", 20, ["C1", "C2"])]);

  it("as before: a first lock writes; a lock onto a healthy ledger keeps every stored day and the epoch", async () => {
    expect(await writeLock(fire)).toEqual({ merged: 1, existedBefore: false });
    expect(setsTo(KEY)).toHaveLength(1);

    seed(HEALTHY);
    expect(await writeLock(fire)).toEqual({ merged: 3, existedBefore: false });
    const out = JSON.parse(world.kv.get(KEY)!) as { epoch?: number; ledger: SyncEntry[] };
    expect(out.epoch).toBe(2);
    expect(out.ledger.map((e) => e.date).sort()).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(world.kv.has(ASIDE)).toBe(false);
  });

  it.each(UNREADABLE)("%s: refuses before the SET — the stored value is byte-for-byte what it was", async (_name, raw) => {
    seed(raw);
    await expect(writeLock(fire)).rejects.toThrow(LedgerUnreadable);
    expect(world.kv.get(KEY)).toBe(raw);
    expect(setsTo(KEY)).toEqual([]);
    expect(world.sets).toEqual([["SET", ASIDE, raw, "NX"]]);
  });
});

describe("D-1 — the ledger route never shows, or stores over, what it cannot read", () => {
  const H = { "x-pl-sync": "test-phrase", "content-type": "application/json" };
  const get = () => route.GET(new NextRequest("https://x.test/api/ledger", { headers: H }));
  const put = (body: unknown) => route.PUT(new NextRequest("https://x.test/api/ledger", { method: "PUT", headers: H, body: JSON.stringify(body) }));
  const device = [dayWith("2026-09-12", [ticket("D", 10, ["E1", "E2"])])];
  const bank = { bank: { v: 1 }, at: 1 };

  it("as before: a healthy ledger is served, and a device push merges into it", async () => {
    seed(HEALTHY);
    const g = await get();
    expect(g.status).toBe(200);
    expect(((await g.json()) as { ledger: SyncEntry[] }).ledger.map((e) => e.date)).toEqual(["2026-09-09", "2026-09-10"]);
    const p = await put({ ledger: device, epoch: LEDGER_EPOCH });
    expect(p.status).toBe(200);
    expect((JSON.parse(world.kv.get(KEY)!) as { ledger: SyncEntry[] }).ledger.map((e) => e.date).sort()).toEqual(["2026-09-09", "2026-09-10", "2026-09-12"]);
  });

  it("the phrase is still required first", async () => {
    seed(BROKEN);
    const r = await route.GET(new NextRequest("https://x.test/api/ledger", { headers: { "x-pl-sync": "wrong" } }));
    expect(r.status).toBe(401);
    expect(world.sets).toEqual([]);
  });

  it.each(UNREADABLE)("%s: GET answers 502 with the reason, not an empty ledger", async (_name, raw) => {
    seed(raw);
    const r = await get();
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error?: string; ledger?: unknown };
    expect(body.error).toMatch(/unreadable value/);
    expect(body.error).toContain(KEY);
    expect(body).not.toHaveProperty("ledger");
    expect(world.kv.get(KEY)).toBe(raw);
    expect(setsTo(KEY)).toEqual([]);
  });

  it.each(UNREADABLE)("%s: PUT answers 502 and stores nothing — not the ledger, not the bank", async (_name, raw) => {
    seed(raw);
    world.kv.set("pl:bank:v1", JSON.stringify(bank));
    for (const body of [{ ledger: device, epoch: LEDGER_EPOCH }, { ledger: device }, { ledger: device, epoch: LEDGER_EPOCH, bank: { nope: 1 } }]) {
      const r = await put(body);
      expect(r.status).toBe(502);
      expect(((await r.json()) as { error: string }).error).toMatch(/unreadable value/);
    }
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.kv.get("pl:bank:v1")).toBe(JSON.stringify(bank));
    expect(world.sets.every((c) => c[1] === ASIDE)).toBe(true);
    expect(world.kv.get(ASIDE)).toBe(raw);
  });
});

describe("D-1 — as source", () => {
  const strip = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const between = (s: string, from: string, to: string) => {
    const a = s.indexOf(from);
    expect(a).toBeGreaterThan(-1);
    const b = s.indexOf(to, a + from.length);
    expect(b).toBeGreaterThan(a);
    return s.slice(a, b);
  };

  it("writeLock reads through the one reader, before its SET, and parses nothing itself", () => {
    const wl = between(strip("src/lib/server/lock-card.ts"), "export async function writeLock", "export async function lockExists");
    expect(wl).toMatch(/const read = await readStoredLedger<SyncEntry>\(LEDGER_STORE_KEY\);/);
    expect(wl.indexOf("readStoredLedger<SyncEntry>(LEDGER_STORE_KEY)")).toBeLessThan(wl.indexOf('redis(["SET", LEDGER_STORE_KEY'));
    expect(wl).not.toMatch(/JSON\.parse\(|catch \{|redis\(\["GET"/);
    expect(wl.match(/redis\(\["SET"/g)).toHaveLength(1);
  });

  it("the epoch check reads through the one reader and parses nothing itself", () => {
    const s = strip("src/lib/server/ledger-epoch-server.ts");
    expect(s).toMatch(/const read = await readStoredLedger<unknown>\(LEDGER_STORE_KEY\);/);
    expect(s).not.toMatch(/JSON\.parse\(|catch \{|redis\(\["GET"/);
    expect(s.indexOf("readStoredLedger<unknown>(LEDGER_STORE_KEY)")).toBeLessThan(s.indexOf('redis(["SET", LEDGER_STORE_KEY'));
  });

  it("the ledger route's reader is the one reader, with no fallback to null on a parse failure", () => {
    const s = strip("app/api/ledger/route.ts");
    const rs = between(s, "async function readStore()", "export async function GET");
    expect(rs).toMatch(/readStoredLedger<SyncEntry>\(STORE_KEY\)/);
    expect(rs).not.toMatch(/JSON\.parse\(|catch|redis\(\["GET"/);
    expect(s).not.toMatch(/redis\(\["GET", STORE_KEY\]\)/);
  });

  it("the reader itself can only GET the key and SET the copy with NX — it has no way to delete or rewrite a ledger", () => {
    const s = strip("src/lib/server/ledger-read.ts");
    expect(s.match(/run\(\[/g)).toHaveLength(2);
    expect(s).toMatch(/run\(\["GET", key\]\)/);
    expect(s).toMatch(/run\(\["SET", unreadableKeyOf\(key\), [^\]]+, "NX"\]\)/);
    expect(s).not.toMatch(/"DEL"|"UNLINK"|"FLUSH|"RENAME"|redisSetJson/);
    expect(s.indexOf('"NX"])')).toBeLessThan(s.indexOf("throw new LedgerUnreadable(key, p.why)"));
  });
});
