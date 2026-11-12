import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { CFB_LEAGUE, CFB_PROPS } from "@/lib/cfb/rules";
import { finalsOf } from "@/lib/cfb/slate-server";
import { assembleStoredBoard, encodeBoard, propsBoardKey, propsSpendKey, storedChunkKeys, CFB_PROPS_REDIS } from "@/lib/cfb/props-store";
import type { CfbPropsBoard } from "@/lib/cfb/props-types";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * THE FOOTBALL PROPS SPEND GATE (2026-11-12, audit finding G1-2).
 *
 * The CFB and NFL props routes are public, and a cold request used to buy a whole slate of player
 * props for whoever sent it: 60 events x 31 credits = 1,860 credits for one anonymous GET on a CFB
 * Saturday, 16 x 31 = 496 on an NFL Sunday. The gate pinned here:
 *
 *   armed     — the server holds a sync phrase (LEDGER_SYNC_KEY). Only then does the gate apply.
 *   may pull  — the request carries that phrase in x-pl-sync, or it is the server's own lock pass
 *               (forceFresh). Josh's devices send the phrase on every props read.
 *   held      — anyone else gets what the store already holds: no provider call, no season tables,
 *               no spend tally, no board write. Rows are stamped with the current status and dated
 *               as old as they are; the answer says why in `note`.
 *   untouched — a fresh stored board still answers everybody (it costs nothing); a pass that had
 *               nothing to buy answers as it did; with no phrase configured the route behaves
 *               exactly as before.
 *
 * The slate is the real 2026-09-05 fixtures through the pure model; the per-event payload is the
 * SYNTHETIC props fixture. fetch is a vi.fn: no network. The phrase is the test phrase.
 */

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn() };
});
vi.mock("@/lib/cfb/props-context", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/props-context")>();
  return { ...real, loadPropsContext: vi.fn(async () => null) };
});

import { redis, storeEnv } from "@/lib/server/store";
import { espnEventsOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { loadPropsContext } from "@/lib/cfb/props-context";
import { footballPropsGet } from "@/lib/server/football-props";
import { GET } from "../app/api/cfb/props/route";
import { loadCfbProps, loadCfbSlate } from "@/lib/cfb/client";
import { loadNflProps, loadNflSlate } from "@/lib/nfl/client";

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-05T12:00:00Z"); // 05:00 PT — every fixture kickoff is still ahead
const DATE = "2026-09-05";
const PER = CFB_PROPS.measuredCreditsPerEvent;
const PHRASE = "test-phrase";
const GATE_NOTE = "showing the last stored prices: fresh prices are pulled only for a device that holds the sync phrase";
const HOUR = 3600_000;

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

function slate(): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}
const LIVE_ABBR = "OSU";
function liveSlate(): CfbSlate {
  const s = slate();
  const games = s.games.map((g) => (g.home.abbr === LIVE_ABBR ? { ...g, status: "live" as const, detail: "2nd 8:12", homeScore: 14, awayScore: 3 } : g));
  return { ...s, games, finals: finalsOf(games) };
}
const liveGameId = (): string => liveSlate().games.find((g) => g.home.abbr === LIVE_ABBR)!.id;

function eventResponse(used: number): Response {
  const headers = new Headers({ "content-type": "application/json", "x-requests-used": String(used), "x-requests-remaining": String(20000 - used) });
  return new Response(JSON.stringify(EVENT), { status: 200, headers });
}

/** an in-memory Redis behind the mocked `redis(cmd)` — records every command it was sent */
function fakeRedis(seed: Record<string, string> = {}) {
  const kv = new Map(Object.entries(seed));
  const calls: unknown[][] = [];
  vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
    calls.push(cmd);
    const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
    switch (op) {
      case "GET":
        return kv.get(key) ?? null;
      case "MGET":
        return [key, ...rest].map((k) => kv.get(String(k)) ?? null);
      case "SET":
        kv.set(key, String(rest[0]));
        return "OK";
      case "INCRBY": {
        const n = Number(kv.get(key) ?? 0) + Number(rest[0]);
        kv.set(key, String(n));
        return n;
      }
      case "EXPIRE":
        return 1;
      default:
        throw new Error(`fake redis: ${op}`);
    }
  });
  const board = (): CfbPropsBoard | null => {
    const raw = kv.get(propsBoardKey(DATE)) ?? null;
    return assembleStoredBoard(raw, storedChunkKeys(raw).map((k) => kv.get(k) ?? null));
  };
  /** every command that changes the store */
  const writes = () => calls.filter((c) => c[0] === "SET" || c[0] === "INCRBY" || c[0] === "EXPIRE");
  const put = (b: CfbPropsBoard) => {
    const { index, chunks } = encodeBoard(DATE, b);
    kv.set(propsBoardKey(DATE), index);
    for (const c of chunks) kv.set(c.key, c.value);
  };
  return { kv, calls, board, writes, put, spend: () => Number(kv.get(propsSpendKey(DATE)) ?? 0) };
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
type Ask = { phrase?: string; refresh?: boolean };
const req = (ask: Ask = {}) =>
  new NextRequest(`http://localhost/api/cfb/props?date=${DATE}${ask.refresh ? "&refresh=1" : ""}`, ask.phrase != null ? { headers: { "x-pl-sync": ask.phrase } } : undefined);
const call = async (ask: Ask = {}): Promise<{ status: number; body: CfbPropsBoard }> => {
  const res = await GET(req(ask));
  return { status: res.status, body: (await res.json()) as CfbPropsBoard };
};
/** every provider answer costs the measured rate, so the tally moves like the real one */
const priceEveryEvent = () => {
  let used = 1000;
  fetchMock.mockImplementation(async () => eventResponse((used += PER)));
};
const arm = () => vi.stubEnv("LEDGER_SYNC_KEY", PHRASE);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(redis).mockReset();
  vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
  vi.mocked(espnEventsOf).mockReset().mockResolvedValue(ESPN.events);
  vi.mocked(slateFromEspnOf).mockReset().mockResolvedValue(slate());
  vi.mocked(loadPropsContext).mockClear();
  vi.stubEnv("ODDS_API_KEY", "test-key-never-logged");
  vi.stubEnv("LEDGER_SYNC_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("no phrase configured on the server: the route is as it was", () => {
  it("an anonymous cold request still prices the slate, writes the board and books the spend", async () => {
    const r = fakeRedis();
    priceEveryEvent();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.source).toBe("fetch");
    expect(body.events).toBeGreaterThan(0);
    expect(body.fetched).toBe(body.events);
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
    expect(body.note).toBeUndefined();
    expect(r.board()!.rows.length).toBe(body.rows.length);
    expect(r.spend()).toBe(body.events * PER);
  });
});

describe("armed, and the request does not hold the phrase", () => {
  it("a cold request buys nothing: no provider call, no season tables, no store write, and the answer says why", async () => {
    arm();
    const r = fakeRedis();
    priceEveryEvent();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadPropsContext).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(body.rows).toEqual([]);
    expect(body.fetched).toBe(0);
    expect(body.events).toBeGreaterThan(0);
    expect(body.source).toBe("none");
    expect(body.oddsMissing).toBe(false);
    expect(body.budgeted).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.spentToday).toBe(0);
    expect(body.priced).toEqual([]);
    expect(body.note).toBe(GATE_NOTE);
  });

  it("the answer never carries the phrase or the provider key", async () => {
    arm();
    fakeRedis();
    const res = await GET(req());
    const text = await res.text();
    expect(text).not.toContain(PHRASE);
    expect(text).not.toContain("test-key-never-logged");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a wrong phrase is no phrase", async () => {
    arm();
    const r = fakeRedis();
    priceEveryEvent();
    const { body } = await call({ phrase: "not-the-phrase" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(body.note).toBe(GATE_NOTE);
  });

  it("an empty phrase is no phrase", async () => {
    arm();
    fakeRedis();
    priceEveryEvent();
    const { body } = await call({ phrase: "" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.note).toBe(GATE_NOTE);
  });

  it("asking for a refresh without the phrase buys nothing either", async () => {
    arm();
    const r = fakeRedis();
    priceEveryEvent();
    const { body } = await call({ refresh: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(body.note).toBe(GATE_NOTE);
  });

  it("with no store at all the cold request is still held", async () => {
    arm();
    vi.mocked(storeEnv).mockReturnValue(null as never);
    fakeRedis();
    priceEveryEvent();
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.rows).toEqual([]);
    expect(body.spentToday).toBeNull();
    expect(body.note).toBe(GATE_NOTE);
  });
});

describe("armed, and the request holds the phrase", () => {
  it("an ordinary read (no refresh asked) prices the slate, exactly as an unarmed route would", async () => {
    arm();
    const r = fakeRedis();
    priceEveryEvent();
    const { body } = await call({ phrase: PHRASE });
    expect(body.source).toBe("fetch");
    expect(body.fetched).toBe(body.events);
    expect(fetchMock).toHaveBeenCalledTimes(body.events);
    expect(body.note).toBeUndefined();
    expect(r.board()!.rows.length).toBe(body.rows.length);
    expect(r.spend()).toBe(body.events * PER);
    /* an ordinary read rides the pull's window; it is not a forced refresh */
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ next: { revalidate: CFB_PROPS.revalidateSec } });
  });

  it("a refresh with the phrase still re-pulls everything, past the cache", async () => {
    arm();
    fakeRedis();
    priceEveryEvent();
    const { body } = await call({ phrase: PHRASE, refresh: true });
    expect(body.source).toBe("fetch");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ cache: "no-store" });
  });

  it("the server's own lock pass (forceFresh) pulls with no phrase on the request", async () => {
    arm();
    const r = fakeRedis();
    priceEveryEvent();
    const res = await footballPropsGet(CFB_LEAGUE, req(), { forceFresh: true, storeKeys: CFB_PROPS_REDIS });
    const body = (await res.json()) as CfbPropsBoard;
    expect(body.source).toBe("fetch");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(r.board()).not.toBeNull();
    expect(body.note).toBeUndefined();
  });
});

describe("what a held request is shown", () => {
  /** a board priced by a device that holds the phrase, at NOW */
  const pricedBoard = async () => {
    const r = fakeRedis();
    priceEveryEvent();
    const first = await call({ phrase: PHRASE });
    fetchMock.mockClear();
    vi.mocked(loadPropsContext).mockClear();
    r.calls.length = 0;
    return { r, first: first.body };
  };

  it("a fresh stored board answers everybody, with no note: it costs nothing", async () => {
    arm();
    const { r, first } = await pricedBoard();
    vi.setSystemTime(NOW + 10 * 60_000);
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(body.source).toBe("redis");
    expect(body.rows).toEqual(first.rows);
    expect(body.note).toBeUndefined();
    expect(body.stale).toBe(false);
  });

  it("a stored board past its window is shown as it is — same rows, its own date, marked stale — and nothing is bought", async () => {
    arm();
    const { r, first } = await pricedBoard();
    const spent = r.spend();
    vi.setSystemTime(NOW + 2 * HOUR + 1000);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadPropsContext).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(r.spend()).toBe(spent);
    expect(body.source).toBe("redis");
    expect(body.fetched).toBe(0);
    expect(body.rows).toEqual(first.rows);
    expect(body.generatedAt).toBe(first.generatedAt);
    expect(Date.parse(body.generatedAt)).toBe(NOW);
    expect(body.stale).toBe(true);
    expect(body.budgeted).toBe(false);
    expect(body.spentToday).toBe(spent);
    expect([...body.priced!].sort()).toEqual([...first.priced!].sort());
    /* every game keeps the stamp of the pull that priced it — nothing is re-dated to now */
    for (const id of body.priced!) expect(body.pricedAt![id]).toBe(new Date(NOW).toISOString());
    expect(body.ttlSec).toBe(CFB_PROPS.revalidateSec);
    expect(body.note).toBe(GATE_NOTE);
  });

  it("the same expired board is re-priced for a device that holds the phrase", async () => {
    arm();
    const { r, first } = await pricedBoard();
    vi.setSystemTime(NOW + 2 * HOUR + 1000);
    const { body } = await call({ phrase: PHRASE });
    expect(fetchMock).toHaveBeenCalledTimes(first.events);
    expect(body.source).toBe("fetch");
    expect(body.note).toBeUndefined();
    expect(Date.parse(r.board()!.generatedAt)).toBe(NOW + 2 * HOUR + 1000);
  });

  it("a game that has kicked off since is shown live and not playable; the rest keep their rows", async () => {
    arm();
    const { first } = await pricedBoard();
    vi.mocked(slateFromEspnOf).mockResolvedValue(liveSlate());
    vi.setSystemTime(NOW + 20 * 60_000);
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.note).toBe(GATE_NOTE);
    expect(body.stale).toBe(true);
    expect(body.live).toBe(1);
    const id = liveGameId();
    const liveRows = body.rows.filter((r) => r.gameId === id);
    expect(liveRows.length).toBeGreaterThan(0);
    for (const r of liveRows) expect([r.status, r.playable]).toEqual(["live", false]);
    const rest = body.rows.filter((r) => r.gameId !== id);
    expect(rest).toEqual(first.rows.filter((r) => r.gameId !== id));
    expect(body.rows.length).toBe(first.rows.length);
    /* in play, the answer is good for the live window and no longer */
    expect(body.ttlSec).toBe(CFB_PROPS.liveRevalidateSec);
  });

  it("a game the stored board never priced is simply absent; the carried games inside their window are not called stale", async () => {
    arm();
    const { r, first } = await pricedBoard();
    const drop = first.priced![0];
    const kept = first.priced!.filter((id) => id !== drop);
    const stamp = new Date(NOW + 3 * HOUR - 10 * 60_000).toISOString();
    /* an old board whose remaining games were each re-priced ten minutes ago */
    r.put({ ...first, rows: first.rows.filter((x) => x.gameId !== drop), priced: kept, pricedAt: Object.fromEntries(kept.map((id) => [id, stamp])) });
    vi.setSystemTime(NOW + 3 * HOUR);
    r.calls.length = 0;
    const { body } = await call();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(body.note).toBe(GATE_NOTE);
    expect(body.rows.some((x) => x.gameId === drop)).toBe(false);
    expect(body.rows.length).toBe(first.rows.filter((x) => x.gameId !== drop).length);
    expect(body.priced).not.toContain(drop);
    expect(body.stale).toBe(false);
    expect(body.pricedAt![kept[0]]).toBe(stamp);
  });

  it("rows of a game that is no longer on the slate are not shown", async () => {
    arm();
    const { first } = await pricedBoard();
    const gone = first.priced![0];
    const s = slate();
    vi.mocked(slateFromEspnOf).mockResolvedValue({ ...s, games: s.games.filter((g) => g.id !== gone) });
    vi.setSystemTime(NOW + 2 * HOUR + 1000);
    const { body } = await call();
    expect(body.note).toBe(GATE_NOTE);
    expect(body.rows.some((x) => x.gameId === gone)).toBe(false);
    expect(body.rows.length).toBe(first.rows.filter((x) => x.gameId !== gone).length);
  });

  it("a pass with nothing to buy answers as it always did, phrase or not: there was nothing to hold", async () => {
    arm();
    const { r, first } = await pricedBoard();
    /* an old board every game of which was re-priced ten minutes ago: nothing is due */
    const stamp = new Date(NOW + 3 * HOUR - 10 * 60_000).toISOString();
    r.put({ ...first, pricedAt: Object.fromEntries(first.priced!.map((id) => [id, stamp])) });
    vi.setSystemTime(NOW + 3 * HOUR);
    r.calls.length = 0;
    const anonymous = await call();
    const holder = await call({ phrase: PHRASE });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.writes()).toEqual([]);
    expect(anonymous.body.source).toBe("redis");
    expect(anonymous.body.rows).toEqual(first.rows);
    expect(anonymous.body.stale).toBe(false);
    expect(anonymous.body.note).toBeUndefined();
    /* the phrase changes nothing where no purchase was going to be made */
    expect(holder.body).toEqual(anonymous.body);
  });

  it("with no provider key the unchanged odds-missing answer is given, armed or not", async () => {
    arm();
    vi.stubEnv("ODDS_API_KEY", "");
    fakeRedis();
    const { body } = await call();
    expect(body.oddsMissing).toBe(true);
    expect(body.note).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the phone: a props read names the device, and only a props read", () => {
  const mem = new Map<string, string>();
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  beforeEach(() => {
    mem.clear();
    sent.length = 0;
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    fetchMock.mockImplementation(async (input, init) => {
      sent.push({ url: String(input), init });
      return new Response(JSON.stringify({ rows: [], games: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
  });
  const LOADERS = [
    ["cfb", loadCfbProps, loadCfbSlate, "/api/cfb/props", "/api/cfb"],
    ["nfl", loadNflProps, loadNflSlate, "/api/nfl/props", "/api/nfl"],
  ] as const;

  for (const [name, props, slateOf, propsPath, slatePath] of LOADERS) {
    it(`${name}: with the phrase on the device, the props read carries it in the header and asks for no refresh`, async () => {
      mem.set("pl_synckey", PHRASE);
      await props(DATE, { bankroll: 2500 });
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe(`${propsPath}?date=${DATE}&bankroll=2500`);
      expect(sent[0].init).toEqual({ cache: "no-store", headers: { "x-pl-sync": PHRASE } });
      expect(sent[0].url).not.toContain(PHRASE);
    });

    it(`${name}: with no phrase on the device, the props read is the plain one it always was`, async () => {
      await props(DATE);
      expect(sent[0].url).toBe(`${propsPath}?date=${DATE}`);
      expect(sent[0].init).toEqual({ cache: "no-store" });
    });

    it(`${name}: the Refresh tap is unchanged — the header and the refresh flag together`, async () => {
      mem.set("pl_synckey", PHRASE);
      await props(DATE, { refresh: true });
      expect(sent[0].url).toBe(`${propsPath}?date=${DATE}&refresh=1`);
      expect(sent[0].init).toEqual({ cache: "no-store", headers: { "x-pl-sync": PHRASE } });
    });

    it(`${name}: the slate read does not carry the phrase unless it is a refresh`, async () => {
      mem.set("pl_synckey", PHRASE);
      await slateOf(DATE);
      expect(sent[0].url).toBe(`${slatePath}?date=${DATE}`);
      expect(sent[0].init).toEqual({ cache: "no-store" });
    });
  }
});

describe("as source", () => {
  const body = readSrc("src/lib/server/football-props.ts");
  const gateAt = body.indexOf("if (!mayPull && toFetch.length > 0) {");
  const nothingAt = body.indexOf("if (toFetch.length === 0) {");
  const gate = body.slice(gateAt, nothingAt);

  it("who may pull is decided once, from the server's phrase and the request's", () => {
    expect(body).toContain('const armed = !!process.env.LEDGER_SYNC_KEY;\n  const mayPull = deps.forceFresh === true || !armed || refresh || syncAuthed(req);');
    expect((body.match(/mayPull/g) ?? []).length).toBe(2);
    expect((body.match(/LEDGER_SYNC_KEY/g) ?? []).length).toBe(1);
  });

  it("the gate stands before every line that spends or writes", () => {
    expect(gateAt).toBeGreaterThan(0);
    expect(nothingAt).toBeGreaterThan(gateAt);
    for (const paid of ["loadPropsContext(cfg)", "eventOdds(", "store.addSpend(", "store.writeBoard(", "store.writeH1(", "store.readH1("]) {
      const at = body.indexOf(paid, body.indexOf("export async function footballPropsGet"));
      expect(at, paid).toBeGreaterThan(nothingAt);
      expect(gate, paid).not.toContain(paid);
    }
    /* both ways out of the gate are answers; nothing falls through to the pull */
    expect((gate.match(/return NextResponse\.json\(body, \{ headers \}\);/g) ?? []).length).toBe(2);
    expect(gate).not.toMatch(/budgetNote/);
  });

  it("the public routes never force a pull; only the lock pass does", () => {
    expect(readSrc("app/api/cfb/props/route.ts")).toContain("return footballPropsGet(CFB_LEAGUE, req, { storeKeys: CFB_PROPS_REDIS });");
    expect(readSrc("app/api/nfl/props/route.ts")).toContain("return footballPropsGet(NFL_LEAGUE, req, { storeKeys: STORE_KEYS });");
    const forced = ["app/api/cfb/props/route.ts", "app/api/nfl/props/route.ts"].filter((p) => readSrc(p).includes("forceFresh"));
    expect(forced).toEqual([]);
    const lock = readSrc("app/api/nfl/lock/route.ts");
    expect((lock.match(/forceFresh:true/g) ?? []).length).toBe(2);
  });

  it("the phrase rides in the header on both clients, on the props read only", () => {
    for (const p of ["src/lib/cfb/client.ts", "src/lib/football/client.ts"]) {
      const s = readSrc(p);
      expect(s, p).toContain('function syncHeaders(): Record<string, string> | undefined {\n  const key = getSyncKey();\n  return key ? { "x-pl-sync": key } : undefined;\n}');
      expect((s.match(/syncHeaders\(\)/g) ?? []).length, p).toBe(2);
      expect(s, p).toMatch(/getJson<CfbPropsBoard>\([^\n]*headers \?\? syncHeaders\(\)\);/);
      expect(s, p).not.toMatch(/p\.set\("(key|sync|phrase)"/);
    }
  });
});
