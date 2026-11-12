/**
 * AUDIT G1-6 — /api/clv takes the cron secret in a header.
 *
 * The route used to accept the secret only as `?key=` in the URL, where the host's request log
 * and every proxy on the way record it. It now accepts the header the other scheduled rows
 * already send. The URL form still works (the owner's scheduled row uses it, and only the owner
 * can edit that row), but every answer to it is marked so the row can be moved.
 *
 * Nothing here reaches a network: the store is a fake, and every case stops at the rate limiter
 * or at "no locked card today", before any odds call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";

const world = vi.hoisted(() => ({
  calls: [] as unknown[][],
  store: true,
  fail: false,
  lastRun: 0,
}));

vi.mock("@/lib/server/store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    storeEnv: vi.fn(() => (world.store ? { url: "https://store.test", token: "t" } : null)),
    redis: vi.fn(async (cmd: unknown[]) => {
      world.calls.push(cmd);
      if (world.fail) throw new Error("store 500");
      if (cmd[0] === "GET" && cmd[1] === "pl:clv:lastRun") return String(world.lastRun);
      return null;
    }),
  };
});

import * as route from "../app/api/clv/route";

const KEY = "test-key-never-logged";
const PHRASE = "test-phrase";
const MARK = "x-pl-key-in-url";
const BASE = "https://x.test/api/clv";

type Ask = { query?: string; headers?: Record<string, string> };
const get = (a: Ask = {}) => route.GET(new NextRequest(BASE + (a.query ? "?" + a.query : ""), { headers: a.headers ?? {} }));

const saved: Record<string, string | undefined> = {};
const NAMES = ["CRON_SECRET", "LEDGER_SYNC_KEY", "ODDS_API_KEY"];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const n of NAMES) saved[n] = process.env[n];
  process.env.CRON_SECRET = KEY;
  process.env.LEDGER_SYNC_KEY = PHRASE;
  process.env.ODDS_API_KEY = "odds-key-for-this-test-only";
  world.calls.length = 0;
  world.store = true;
  world.fail = false;
  world.lastRun = Date.now(); // every case stops at "ran recently" unless it says otherwise
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
  warn.mockRestore();
});

const RAN = { ok: true, skipped: "ran recently" };

/** the four ways a caller may present a credential */
const HEADER_WAYS: [string, Ask][] = [
  ["x-cron-key", { headers: { "x-cron-key": KEY } }],
  ["Authorization: Bearer", { headers: { authorization: "Bearer " + KEY } }],
  ["the sync phrase", { headers: { "x-pl-sync": PHRASE } }],
];
const URL_WAY: Ask = { query: "key=" + KEY };

describe("G1-6 — a header credential opens the route and is never marked", () => {
  it.each(HEADER_WAYS)("%s is accepted", async (_n, ask) => {
    const res = await get(ask);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RAN);
    expect(res.headers.get(MARK)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(HEADER_WAYS)("%s is accepted and unmarked even when the URL also carries the key", async (_n, ask) => {
    const res = await get({ ...ask, query: "key=" + KEY });
    expect(res.status).toBe(200);
    expect(res.headers.get(MARK)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(HEADER_WAYS)("%s is accepted and unmarked when the URL carries a wrong key", async (_n, ask) => {
    const res = await get({ ...ask, query: "key=wrong" });
    expect(res.status).toBe(200);
    expect(res.headers.get(MARK)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("the answer says nothing else about how the caller got in: the mark is the only header the gate adds", async () => {
    const own = async (ask: Ask) => {
      const names: string[] = [];
      (await get(ask)).headers.forEach((_v, k) => names.push(k));
      return names.sort();
    };
    const plain = await own({ headers: { "x-cron-key": KEY } });
    expect(plain.filter((k) => k.startsWith("x-"))).toEqual([]);
    for (const [, ask] of HEADER_WAYS) expect(await own(ask)).toEqual(plain);
    expect(await own(URL_WAY)).toEqual([...plain, MARK].sort());
  });

  it("a header credential reaches the work: with the limiter open it reads the ledger", async () => {
    world.lastRun = 0;
    const res = await get({ headers: { "x-cron-key": KEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, skipped: "no locked card today" });
    expect(world.calls.map((c) => [c[0], c[1]])).toEqual([
      ["GET", "pl:clv:lastRun"],
      ["SET", "pl:clv:lastRun"],
      ["GET", "pl:ledger:v1"],
    ]);
  });
});

describe("G1-6 — the URL form still works, and every answer to it is marked", () => {
  it("?key= is accepted, the answer carries the mark, and one line is logged", async () => {
    const res = await get(URL_WAY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RAN);
    expect(res.headers.get(MARK)).toBe("true");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual([
      "[clv] the cron secret arrived in the URL (?key=) — move it to the x-cron-key header and drop it from the URL",
    ]);
  });

  it("a wrong header beside a right URL key is still the URL form, and is marked", async () => {
    const res = await get({ query: "key=" + KEY, headers: { "x-cron-key": "wrong", "x-pl-sync": "wrong", authorization: "Bearer wrong" } });
    expect(res.status).toBe(200);
    expect(res.headers.get(MARK)).toBe("true");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("the mark rides on every kind of answer: a working run, a missing store, a missing odds key, a store failure", async () => {
    world.lastRun = 0;
    const worked = await get(URL_WAY);
    expect(worked.status).toBe(200);
    expect(worked.headers.get(MARK)).toBe("true");

    world.store = false;
    const noStore = await get(URL_WAY);
    expect(noStore.status).toBe(503);
    expect(await noStore.json()).toEqual({ error: "sync-not-configured" });
    expect(noStore.headers.get(MARK)).toBe("true");
    world.store = true;

    delete process.env.ODDS_API_KEY;
    const noOdds = await get(URL_WAY);
    expect(noOdds.status).toBe(503);
    expect(await noOdds.json()).toEqual({ error: "no ODDS_API_KEY" });
    expect(noOdds.headers.get(MARK)).toBe("true");
    process.env.ODDS_API_KEY = "odds-key-for-this-test-only";

    world.fail = true;
    const down = await get(URL_WAY);
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "store 500" });
    expect(down.headers.get(MARK)).toBe("true");

    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("the same four answers through a header carry no mark and log nothing", async () => {
    const H = { headers: { "x-cron-key": KEY } };
    world.lastRun = 0;
    expect((await get(H)).headers.get(MARK)).toBeNull();
    world.store = false;
    const noStore = await get(H);
    expect(noStore.status).toBe(503);
    expect(noStore.headers.get(MARK)).toBeNull();
    world.store = true;
    delete process.env.ODDS_API_KEY;
    const noOdds = await get(H);
    expect(noOdds.status).toBe(503);
    expect(noOdds.headers.get(MARK)).toBeNull();
    process.env.ODDS_API_KEY = "odds-key-for-this-test-only";
    world.fail = true;
    const down = await get(H);
    expect(down.status).toBe(502);
    expect(down.headers.get(MARK)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("G1-6 — the route stays closed", () => {
  const REFUSED: [string, Ask][] = [
    ["no credential at all", {}],
    ["a wrong x-cron-key", { headers: { "x-cron-key": "wrong" } }],
    ["a wrong bearer", { headers: { authorization: "Bearer wrong" } }],
    ["a wrong sync phrase", { headers: { "x-pl-sync": "wrong" } }],
    ["a wrong URL key", { query: "key=wrong" }],
    ["an empty URL key", { query: "key=" }],
    ["the key one character short, in the header", { headers: { "x-cron-key": KEY.slice(0, -1) } }],
    ["the key one character long, in the header", { headers: { "x-cron-key": KEY + "x" } }],
    ["the key one character short, in the URL", { query: "key=" + KEY.slice(0, -1) }],
    ["the key one character long, in the URL", { query: "key=" + KEY + "x" }],
    ["the key with no Bearer word", { headers: { authorization: KEY } }],
    ["a lower-case bearer word", { headers: { authorization: "bearer " + KEY } }],
    ["a Basic header", { headers: { authorization: "Basic " + KEY } }],
    ["the cron key in the sync header", { headers: { "x-pl-sync": KEY } }],
    ["the sync phrase in the cron header", { headers: { "x-cron-key": PHRASE } }],
    ["the sync phrase as a bearer", { headers: { authorization: "Bearer " + PHRASE } }],
    ["the sync phrase in the URL", { query: "key=" + PHRASE }],
    ["the key under another parameter name", { query: "secret=" + KEY }],
    ["the key under an upper-case parameter name", { query: "KEY=" + KEY }],
    ["the key in the passcode header", { headers: { "x-pl-pass": KEY } }],
    ["the key in a cookie", { headers: { cookie: "key=" + KEY } }],
  ];

  it.each(REFUSED)("%s is 401, unmarked, and touches nothing", async (_n, ask) => {
    const res = await get(ask);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get(MARK)).toBeNull();
    expect(world.calls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("the gate comes before the configuration answers: no credential is 401 even with no store and no odds key", async () => {
    world.store = false;
    delete process.env.ODDS_API_KEY;
    const res = await get();
    expect(res.status).toBe(401);
    expect(world.calls).toEqual([]);
  });

  it("with CRON_SECRET unset, no cron spelling opens it — header, bearer or URL — and the phrase still does", async () => {
    delete process.env.CRON_SECRET;
    for (const ask of [{ headers: { "x-cron-key": KEY } }, { headers: { authorization: "Bearer " + KEY } }, URL_WAY, { headers: { "x-cron-key": "" } }, { headers: { authorization: "Bearer " } }, { query: "key=undefined" }]) {
      expect((await get(ask)).status).toBe(401);
    }
    expect(world.calls).toEqual([]);
    const res = await get({ headers: { "x-pl-sync": PHRASE } });
    expect(res.status).toBe(200);
    expect(res.headers.get(MARK)).toBeNull();
  });

  it("with CRON_SECRET empty, an empty credential does not match it", async () => {
    process.env.CRON_SECRET = "";
    for (const ask of [{ headers: { "x-cron-key": "" } }, { headers: { authorization: "Bearer " } }, { query: "key=" }, {}]) {
      expect((await get(ask)).status).toBe(401);
    }
    expect(world.calls).toEqual([]);
  });

  it("with LEDGER_SYNC_KEY unset, the phrase opens nothing and the cron key still does", async () => {
    delete process.env.LEDGER_SYNC_KEY;
    expect((await get({ headers: { "x-pl-sync": PHRASE } })).status).toBe(401);
    expect((await get({ headers: { "x-pl-sync": "" } })).status).toBe(401);
    expect((await get({ headers: { "x-cron-key": KEY } })).status).toBe(200);
  });

  it("with neither secret set, nothing opens it", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.LEDGER_SYNC_KEY;
    for (const [, ask] of [...HEADER_WAYS, ["url", URL_WAY] as [string, Ask], ["none", {}] as [string, Ask]]) {
      expect((await get(ask)).status).toBe(401);
    }
    expect(world.calls).toEqual([]);
  });
});

describe("G1-6 — the secret is never repeated", () => {
  it("no answer and no log line carries the cron key or the phrase", async () => {
    const seen: string[] = [];
    const asks: Ask[] = [
      URL_WAY,
      { headers: { "x-cron-key": KEY } },
      { headers: { authorization: "Bearer " + KEY } },
      { headers: { "x-pl-sync": PHRASE } },
      { query: "key=" + KEY + "x" },
      { headers: { "x-cron-key": KEY + "x" } },
    ];
    for (const lastRun of [Date.now(), 0]) {
      for (const ask of asks) {
        world.lastRun = lastRun;
        const res = await get(ask);
        seen.push(await res.text());
        res.headers.forEach((v, k) => seen.push(k + ": " + v));
      }
    }
    world.fail = true;
    const down = await get(URL_WAY);
    seen.push(await down.text());
    for (const c of warn.mock.calls) seen.push(c.map(String).join(" "));
    const all = seen.join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(PHRASE);
    expect(all.length).toBeGreaterThan(100);
  });

  it("the store is never handed the credential", async () => {
    world.lastRun = 0;
    await get(URL_WAY);
    await get({ headers: { "x-cron-key": KEY } });
    const flat = JSON.stringify(world.calls);
    expect(world.calls.length).toBeGreaterThan(0);
    expect(flat).not.toContain(KEY);
    expect(flat).not.toContain(PHRASE);
  });
});

describe("G1-6 — as source", () => {
  const raw = readFileSync("app/api/clv/route.ts", "utf8");
  const src = stripComments(raw);

  it("the gate asks for the header first, then the phrase, and the URL key last", () => {
    expect(src).toMatch(/if \(cronHeaderAuthed\(req\) \|\| syncAuthed\(req\)\) return "header";\s*return cronKeyAuthed\(req\) \? "url" : null;/);
    expect(src).toMatch(/import \{ cronHeaderAuthed, cronKeyAuthed, redis, storeEnv, syncAuthed \} from "@\/lib\/server\/store";/);
  });

  it("the handler decides the credential once, before any work, and marks only the URL form", () => {
    const get = src.slice(src.indexOf("export async function GET("), src.indexOf("async function sight("));
    expect(get.length).toBeGreaterThan(100);
    const gate = get.indexOf("const via = credentialOf(req);");
    const refuse = get.indexOf('if (!via) return NextResponse.json({ error: "unauthorized" }, { status: 401 });');
    const work = get.indexOf("const res = await sight(req);");
    const mark = get.indexOf('if (via === "url") {');
    expect(gate).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(gate);
    expect(work).toBeGreaterThan(refuse);
    expect(mark).toBeGreaterThan(work);
    expect(get.match(/credentialOf\(/g)).toHaveLength(1);
    expect(get.match(/sight\(/g)).toHaveLength(1);
  });

  it("the work itself reads no credential", () => {
    const work = src.slice(src.indexOf("async function sight("));
    expect(work.length).toBeGreaterThan(1000);
    expect(work).not.toMatch(/Authed\(|CRON_SECRET|LEDGER_SYNC_KEY|searchParams\.get\("key"\)|x-cron-key|authorization/i);
  });

  it("the route never reads the secret itself, and never logs the request or its URL", () => {
    expect(src).not.toMatch(/CRON_SECRET|LEDGER_SYNC_KEY/);
    expect(src.match(/console\./g)).toHaveLength(1);
    expect(src).toMatch(/console\.warn\(KEY_IN_URL_NOTE\);/);
    const note = src.match(/const KEY_IN_URL_NOTE = ("[^"]*");/);
    expect(note).not.toBeNull();
    expect(src).not.toMatch(/KEY_IN_URL_NOTE\s*\+|\+\s*KEY_IN_URL_NOTE/);
  });

  it("nothing in the app builds a CLV URL with a key in it: the in-app nudge sends the phrase in a header", () => {
    const beacon = stripComments(readFileSync("src/lib/ledgerSync.ts", "utf8"));
    expect(beacon).toMatch(/fetch\("\/api\/clv", \{ headers: \{ "x-pl-sync": key \}, cache: "no-store" \}\)/);
    expect(beacon).not.toMatch(/api\/clv\?/);
  });
});
