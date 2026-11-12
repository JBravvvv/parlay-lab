import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { NextRequest } from "next/server";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * AUDIT D-1, the football half — an unreadable stored CFB or NFL ledger is not an empty ledger.
 *
 * The two football ledger routes (the phone's pull and push) read a stored value that would not
 * parse, or that held no `ledger` array, as "nothing stored". GET then showed an empty season and
 * PUT wrote the phone's copy over the whole record. The lock routes already refused; these two did
 * not. Both now read through readStoredLedger: the raw value is copied aside once and the read
 * throws, so each handler answers 502 and writes nothing. Every refusal below sits beside the
 * healthy case, so "nothing was written" is never true merely because nothing ran.
 */

const world = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets: unknown[][] = [];
  const gets: string[] = [];
  const fail: { get: Error | null; setOn: string | null } = { get: null, setOn: null };
  async function run(cmd: unknown[]): Promise<unknown> {
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    if (op === "GET") {
      gets.push(key);
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
  return { kv, sets, gets, fail, run };
});

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return {
    ...real,
    redis: vi.fn(world.run),
    redisGetJson: vi.fn(async (key: string) => {
      world.gets.push(key);
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
import * as cfbRoute from "../app/api/cfb/ledger/route";
import * as nflRoute from "../app/api/nfl/ledger/route";

type Desk = { sport: "cfb" | "nfl"; key: string; bankKey: string; other: string; route: typeof cfbRoute; file: string };
const DESKS: Desk[] = [
  { sport: "cfb", key: "pl:cfb:ledger:v1", bankKey: "pl:cfb:bank:v1", other: "pl:nfl:", route: cfbRoute, file: "app/api/cfb/ledger/route.ts" },
  { sport: "nfl", key: "pl:nfl:ledger:v1", bankKey: "pl:nfl:bank:v1", other: "pl:cfb:", route: nflRoute, file: "app/api/nfl/ledger/route.ts" },
];

const day = (sport: string, date: string, stake = 50) =>
  ({ date, locked: true, sport, source: "server-lock", daily: 250, fun: 25, core: [{ id: `${sport}-${date}-core-1`, stake, legs: [] }], funT: [] }) as unknown as SyncEntry;

const BANK = { base: 2500, asOf: "2026-09-05", log: [{ ts: 1_700_000_000_000, kind: "deposit", amt: 100, note: "seed" }] };
const SENT_BANK = { base: 2500, asOf: "2026-09-06", log: [{ ts: 1_700_000_500_000, kind: "deposit", amt: 40, note: "phone" }] };

describe.each(DESKS)("D-1 football — the $sport ledger route", (d) => {
  const KEY = d.key;
  const ASIDE = unreadableKeyOf(KEY);
  const HEALTHY = JSON.stringify({ at: 1, ledger: [day(d.sport, "2026-09-05"), day(d.sport, "2026-09-12")] });
  const BROKEN = HEALTHY.slice(0, HEALTHY.length - 40);
  const UNREADABLE: [string, string][] = [
    ["truncated JSON", BROKEN],
    ["plain text", "this is not a ledger"],
    ["a gzip stamp nothing unpacked", "gz1:H4sIAAAAAAAA"],
    ["an array at the root", JSON.stringify([day(d.sport, "2026-09-12")])],
    ["JSON null", "null"],
    ["a number", "42"],
    ["an object with no ledger", JSON.stringify({ at: 1 })],
    ["a ledger that is not an array", JSON.stringify({ at: 1, ledger: { "2026-09-12": {} } })],
  ];
  const STORED_BANK = JSON.stringify({ bank: BANK, at: 1 });
  const H = { "x-pl-sync": "test-phrase", "content-type": "application/json" };
  const url = `https://x.test/api/${d.sport}/ledger`;
  const get = (headers: Record<string, string> = H) => d.route.GET(new NextRequest(url, { headers }));
  const put = (body: unknown, headers: Record<string, string> = H) => d.route.PUT(new NextRequest(url, { method: "PUT", headers, body: JSON.stringify(body) }));
  const device = [day(d.sport, "2026-09-19", 20)];
  const setsTo = (key: string) => world.sets.filter((c) => c[1] === key);

  function seed(raw: string | null) {
    world.kv.clear();
    world.sets.length = 0;
    world.gets.length = 0;
    world.fail.get = null;
    world.fail.setOn = null;
    if (raw != null) world.kv.set(KEY, raw);
    world.kv.set(d.bankKey, STORED_BANK);
  }
  beforeEach(() => seed(null));

  it("as before: nothing stored reads as an empty record, and a first push is stored", async () => {
    const g = await get();
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ ledger: [], at: null });
    const p = await put({ ledger: device });
    expect(p.status).toBe(200);
    expect((JSON.parse(world.kv.get(KEY)!) as { ledger: SyncEntry[] }).ledger.map((e) => e.date)).toEqual(["2026-09-19"]);
    expect(world.kv.has(ASIDE)).toBe(false);
  });

  it("as before: an empty string stored reads as nothing stored", async () => {
    seed("");
    expect((await get()).status).toBe(200);
    expect(world.kv.has(ASIDE)).toBe(false);
  });

  it("as before: a healthy record is served, and a push merges into it with the bank", async () => {
    seed(HEALTHY);
    const g = await get();
    expect(g.status).toBe(200);
    const shown = (await g.json()) as { ledger: SyncEntry[]; at: number };
    expect(shown.ledger.map((e) => e.date)).toEqual(["2026-09-05", "2026-09-12"]);
    expect(shown.at).toBe(1);
    const p = await put({ ledger: device, bank: SENT_BANK });
    expect(p.status).toBe(200);
    expect((JSON.parse(world.kv.get(KEY)!) as { ledger: SyncEntry[] }).ledger.map((e) => e.date).sort()).toEqual(["2026-09-05", "2026-09-12", "2026-09-19"]);
    expect(setsTo(KEY)).toHaveLength(1);
    expect(setsTo(d.bankKey)).toHaveLength(1);
    expect(world.kv.has(ASIDE)).toBe(false);
  });

  it("as before: days a phone locked itself (no server stamp) are kept by the merge alone", async () => {
    const own = [day(d.sport, "2026-09-05"), day(d.sport, "2026-09-12")].map((e) => {
      const { source: _drop, ...rest } = e as unknown as Record<string, unknown>;
      return rest;
    });
    seed(JSON.stringify({ at: 1, ledger: own }));
    expect((await put({ ledger: device })).status).toBe(200);
    expect((JSON.parse(world.kv.get(KEY)!) as { ledger: SyncEntry[] }).ledger.map((e) => e.date).sort()).toEqual(["2026-09-05", "2026-09-12", "2026-09-19"]);
  });

  it("as before: a phone copy that would resize a server-locked ticket is put back as stored", async () => {
    seed(HEALTHY);
    const id = `${d.sport}-2026-09-12-core-1`;
    const resized = { date: "2026-09-12", locked: true, sport: d.sport, daily: 250, fun: 25, core: [{ id, stake: 20, legs: [], name: "x".repeat(300) }], funT: [] };
    const r = await put({ ledger: [resized] });
    expect(r.status).toBe(200);
    const kept = (JSON.parse(world.kv.get(KEY)!) as { ledger: { date: string; core: { id: string; stake: number }[] }[] }).ledger.find((e) => e.date === "2026-09-12")!;
    expect(kept.core).toEqual([{ id, stake: 50, legs: [] }]);
  });

  it("the phrase is still required first, before anything is read", async () => {
    seed(BROKEN);
    const g = await get({ "x-pl-sync": "wrong" });
    expect(g.status).toBe(401);
    const p = await put({ ledger: device }, { "x-pl-sync": "wrong", "content-type": "application/json" });
    expect(p.status).toBe(401);
    expect(world.gets).toEqual([]);
    expect(world.sets).toEqual([]);
  });

  it.each(UNREADABLE)("%s: GET answers 502 with the reason, not an empty season", async (_name, raw) => {
    seed(raw);
    const r = await get();
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error?: string; ledger?: unknown };
    expect(body.error).toMatch(/^store unreachable: /);
    expect(body.error).toMatch(/unreadable value/);
    expect(body.error).toContain(KEY);
    expect(body).not.toHaveProperty("ledger");
    expect(world.kv.get(KEY)).toBe(raw);
    expect(setsTo(KEY)).toEqual([]);
    expect(world.kv.get(ASIDE)).toBe(raw);
  });

  it.each(UNREADABLE)("%s: PUT answers 502 and stores nothing — not the ledger, not the bank", async (_name, raw) => {
    seed(raw);
    for (const body of [{ ledger: device }, { ledger: device, bank: SENT_BANK }, { ledger: [] }]) {
      const r = await put(body);
      expect(r.status).toBe(502);
      const out = (await r.json()) as { error: string; ok?: boolean };
      expect(out.error).toMatch(/unreadable value/);
      expect(out).not.toHaveProperty("ok");
    }
    expect(world.kv.get(KEY)).toBe(raw);
    expect(world.kv.get(d.bankKey)).toBe(STORED_BANK);
    expect(world.sets.every((c) => c[1] === ASIDE)).toBe(true);
    expect(world.kv.get(ASIDE)).toBe(raw);
  });

  it("the copy aside is made once: a later, different unreadable value never replaces the first", async () => {
    seed(BROKEN);
    expect((await get()).status).toBe(502);
    world.kv.set(KEY, "second bad value");
    expect((await put({ ledger: device })).status).toBe(502);
    expect(world.kv.get(ASIDE)).toBe(BROKEN);
    expect(world.kv.get(KEY)).toBe("second bad value");
  });

  it("the refusal does not depend on the copy: with the copy failing, the push is still refused", async () => {
    seed(BROKEN);
    world.fail.setOn = ASIDE;
    const r = await put({ ledger: device, bank: SENT_BANK });
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/unreadable value/);
    expect(world.kv.get(KEY)).toBe(BROKEN);
    expect(world.sets).toEqual([]);
  });

  it("a store outage is still a store outage: 502 with the store's own message, and no copy aside", async () => {
    seed(HEALTHY);
    world.fail.get = new Error("store 403");
    const g = await get();
    expect(g.status).toBe(502);
    expect(((await g.json()) as { error: string }).error).toBe("store unreachable: store 403");
    const p = await put({ ledger: device });
    expect(p.status).toBe(502);
    expect(world.sets).toEqual([]);
    expect(world.kv.get(KEY)).toBe(HEALTHY);
  });

  it("a body the route would refuse is still refused 400 before the store is read", async () => {
    seed(BROKEN);
    const foreign = await put({ ledger: [day(d.sport === "cfb" ? "nfl" : "cfb", "2026-09-19")] });
    expect(foreign.status).toBe(400);
    const badBank = await put({ ledger: device, bank: { nope: 1 } });
    expect(badBank.status).toBe(400);
    expect(world.gets).toEqual([]);
    expect(world.sets).toEqual([]);
  });

  it("only this desk's keys are touched", async () => {
    seed(BROKEN);
    await get();
    await put({ ledger: device, bank: SENT_BANK });
    seed(HEALTHY);
    await get();
    await put({ ledger: device, bank: SENT_BANK });
    const touched = [...world.gets, ...world.sets.map((c) => String(c[1]))];
    expect(touched.length).toBeGreaterThan(4);
    for (const k of touched) {
      expect(k.startsWith(`pl:${d.sport}:`), k).toBe(true);
      expect(k.startsWith(d.other), k).toBe(false);
    }
  });

  it("as source: the route reads through the one reader and parses nothing itself", () => {
    const src = fs.readFileSync(d.file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toMatch(/import \{ readStoredLedger \} from "@\/lib\/server\/ledger-read";/);
    expect(src).toMatch(/return \(\(await readStoredLedger<SyncEntry>\(STORE_KEY\)\)\?\.stored as Stored \| undefined\) \?\? null;/);
    expect(src).not.toMatch(/JSON\.parse\(/);
    expect(src).not.toMatch(/redis\(\["GET"/);
    expect(src).not.toMatch(/catch \{\s*return null;/);
    expect(src.match(/redis\(\["SET", STORE_KEY/g)).toHaveLength(1);
    const putAt = src.indexOf("export async function PUT(");
    const body = src.slice(putAt);
    expect(body.indexOf("const cur = await readStore();")).toBeGreaterThan(-1);
    expect(body.indexOf("const cur = await readStore();")).toBeLessThan(body.indexOf("redisSetJson(BANK_STORE_KEY"));
    expect(body.indexOf("const cur = await readStore();")).toBeLessThan(body.indexOf('redis(["SET", STORE_KEY'));
  });
});
