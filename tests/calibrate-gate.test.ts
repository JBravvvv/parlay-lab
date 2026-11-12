import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";

/* AUDIT G1-5 — /api/calibrate let every caller in when CRON_SECRET was unset. The run rewrites the
   blend weights the engine reads, so that was an open door on the model. These tests hold the gate
   shut: a request passes only with the cron secret or the sync phrase, and with neither configured
   on the server nothing passes and nothing is read or written. */

const world = vi.hoisted(() => ({
  calls: [] as unknown[][],
  store: true,
  run(cmd: unknown[]): unknown {
    world.calls.push(cmd);
    /* the limiter key: "ran a moment ago", so a request that passes the gate stops right there */
    if (cmd[0] === "GET" && cmd[1] === "pl:cal:lastRun") return String(Date.now());
    return null;
  },
}));

vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return {
    ...real,
    storeEnv: () => (world.store ? { url: "https://store.invalid", token: "t" } : null),
    redis: async (cmd: unknown[]) => world.run(cmd),
    redisGetJson: async (key: string) => {
      world.calls.push(["GETJSON", key]);
      return null;
    },
    redisSetJson: async (key: string, value: unknown) => {
      world.calls.push(["SETJSON", key, value]);
    },
  };
});

import { GET } from "../app/api/calibrate/route";

const CRON = "test-key-never-logged";
const PHRASE = "test-phrase";
const fetched: string[] = [];

const ask = (headers: Record<string, string> = {}, query = "") =>
  GET(new NextRequest(`http://localhost/api/calibrate${query}`, { headers }));

const PASSED = { ok: true, skipped: "ran recently" };

beforeEach(() => {
  world.calls.length = 0;
  world.store = true;
  fetched.length = 0;
  delete process.env.CRON_SECRET;
  delete process.env.LEDGER_SYNC_KEY;
  vi.stubGlobal("fetch", async (url: unknown) => {
    fetched.push(String(url));
    throw new Error("no network in this test");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
  delete process.env.LEDGER_SYNC_KEY;
});

const untouched = () => {
  expect(world.calls, "the store was read or written").toEqual([]);
  expect(fetched, "something was fetched").toEqual([]);
};

describe("G1-5 — no credential configured on the server", () => {
  it("a bare request is refused with 503 and touches nothing (it used to run)", async () => {
    const r = await ask();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/^calibrate-not-configured: /);
    untouched();
  });

  it.each([
    ["an empty Bearer", { authorization: "Bearer " }],
    ["Bearer undefined", { authorization: "Bearer undefined" }],
    ["a guessed cron key", { "x-cron-key": CRON }],
    ["a guessed phrase", { "x-pl-sync": PHRASE }],
    ["every header at once", { authorization: `Bearer ${CRON}`, "x-cron-key": CRON, "x-pl-sync": PHRASE }],
  ])("%s is refused too", async (_n, headers) => {
    const r = await ask(headers);
    expect(r.status).toBe(503);
    untouched();
  });

  it("force=1 opens nothing", async () => {
    expect((await ask({}, "?force=1")).status).toBe(503);
    expect((await ask({}, "?grade=only")).status).toBe(503);
    untouched();
  });
});

describe("G1-5 — CRON_SECRET unset, sync phrase set (the old open door)", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
  });

  it("a bare request is 401 and touches nothing", async () => {
    const r = await ask();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    untouched();
  });

  it.each([
    ["a Bearer for a secret the server does not have", { authorization: `Bearer ${CRON}` }],
    ["an x-cron-key for a secret the server does not have", { "x-cron-key": CRON }],
    ["the phrase sent as a Bearer", { authorization: `Bearer ${PHRASE}` }],
    ["the phrase sent as the cron key", { "x-cron-key": PHRASE }],
    ["a wrong phrase", { "x-pl-sync": "test-phras" }],
    ["the phrase with one more character", { "x-pl-sync": `${PHRASE}e` }],
  ])("%s is 401", async (_n, headers) => {
    expect((await ask(headers)).status).toBe(401);
    untouched();
  });

  it("the sync phrase still passes", async () => {
    const r = await ask({ "x-pl-sync": PHRASE });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(PASSED);
    expect(world.calls).toEqual([["GET", "pl:cal:lastRun"]]);
  });
});

describe("G1-5 — CRON_SECRET set", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON;
    process.env.LEDGER_SYNC_KEY = PHRASE;
  });

  it("the Bearer spelling passes (the scheduler's grade forward and the weekly cron row)", async () => {
    const r = await ask({ authorization: `Bearer ${CRON}` }, "?grade=only");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(PASSED);
  });

  it("the x-cron-key spelling passes", async () => {
    expect(await (await ask({ "x-cron-key": CRON })).json()).toEqual(PASSED);
  });

  it("the sync phrase passes", async () => {
    expect(await (await ask({ "x-pl-sync": PHRASE })).json()).toEqual(PASSED);
  });

  it.each([
    ["no header", {}],
    ["a wrong Bearer", { authorization: "Bearer test-key-never-logge" }],
    ["the secret with one more character", { authorization: `Bearer ${CRON}x` }],
    ["the secret with no scheme", { authorization: CRON }],
    ["a lower-case scheme", { authorization: `bearer ${CRON}` }],
    ["a Basic scheme", { authorization: `Basic ${CRON}` }],
    ["the secret as the sync phrase", { "x-pl-sync": CRON }],
    ["the phrase as the cron key", { "x-cron-key": PHRASE }],
    ["a wrong cron key", { "x-cron-key": "nope" }],
  ])("%s is 401 and touches nothing", async (_n, headers) => {
    const r = await ask(headers);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    untouched();
  });

  it("the secret in the URL is never a credential", async () => {
    expect((await ask({}, `?key=${CRON}`)).status).toBe(401);
    expect((await ask({}, `?secret=${CRON}&force=1`)).status).toBe(401);
    untouched();
  });

  it("force=1 with the cron secret is still held by the limiter; only the phrase may force", async () => {
    const r = await ask({ authorization: `Bearer ${CRON}` }, "?force=1");
    expect(await r.json()).toEqual(PASSED);
    expect(world.calls).toEqual([["GET", "pl:cal:lastRun"]]);
  });

  it("with the sync phrase unset on the server, the cron secret still passes and a sent phrase does not", async () => {
    delete process.env.LEDGER_SYNC_KEY;
    expect(await (await ask({ authorization: `Bearer ${CRON}` })).json()).toEqual(PASSED);
    world.calls.length = 0;
    expect((await ask({ "x-pl-sync": PHRASE })).status).toBe(401);
    untouched();
  });
});

describe("G1-5 — the order of the answers", () => {
  it("unauthorized comes before the store check; an authorized call with no store is 503", async () => {
    process.env.CRON_SECRET = CRON;
    world.store = false;
    expect((await ask()).status).toBe(401);
    const r = await ask({ authorization: `Bearer ${CRON}` });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "sync-not-configured" });
    untouched();
  });

  it("no answer carries a secret", async () => {
    process.env.CRON_SECRET = CRON;
    process.env.LEDGER_SYNC_KEY = PHRASE;
    for (const h of [{}, { authorization: "Bearer x" }, { authorization: `Bearer ${CRON}` }, { "x-pl-sync": PHRASE }]) {
      const text = await (await ask(h)).text();
      expect(text).not.toContain(CRON);
      expect(text).not.toContain(PHRASE);
    }
  });
});

describe("G1-5 — as source", () => {
  const raw = readFileSync("app/api/calibrate/route.ts", "utf8");
  const src = stripComments(raw);

  it("the open door is gone, comments included", () => {
    expect(raw).not.toMatch(/return !cron/);
    expect(src).not.toMatch(/return !process\.env\.CRON_SECRET;/);
  });

  it("the gate is the two shared constant-time checks and nothing else", () => {
    expect(src).toMatch(/function authed\(req: NextRequest\): boolean \{\s*return cronHeaderAuthed\(req\) \|\| syncAuthed\(req\);\s*\}/);
    expect(src).not.toMatch(/=== `Bearer/);
    expect(src).not.toMatch(/searchParams\.get\("(key|secret|token)"\)/);
  });

  it("GET checks the gate before it reads the store or the clock", () => {
    const get = src.slice(src.indexOf("export async function GET("));
    const unset = get.indexOf("if (gateUnset())");
    const auth = get.indexOf("if (!authed(req))");
    const store = get.indexOf("storeEnv()");
    const first = get.indexOf("redis(");
    expect(unset).toBeGreaterThan(-1);
    expect(unset).toBeLessThan(auth);
    expect(auth).toBeLessThan(store);
    expect(store).toBeLessThan(first);
  });

  it("the route still names no secret value", () => {
    expect(src).not.toMatch(/console\.(log|warn|error)\([^)]*CRON_SECRET/);
  });
});
