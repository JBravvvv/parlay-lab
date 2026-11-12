import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "../app/api/sharp/route";
import { stripComments } from "./helpers/source";

/* AUDIT G2-1 — /api/sharp spends the Anthropic key. Its gate applied only when APP_PASSCODE was
   set, so with it unset anyone could spend, and the body had no size limit. These tests hold the
   gate shut. The model call is a stub throughout: nothing here reaches Anthropic. */

const KEY = "test-key-never-logged";
const PHRASE = "test-phrase";
const PASS = "test-pass-1234";
const BOARD = { overview: "o", picks: [], parlays: [], trap: { prop: "p", reason: "r" } };

type Call = { url: string; headers: Record<string, string>; body: string };
const calls: Call[] = [];
let upstream: { status: number; body: unknown } = { status: 200, body: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(BOARD) }] } };

const post = (headers: Record<string, string> = {}, body = "{}") =>
  POST(new NextRequest("http://localhost/api/sharp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));

const SLATE = JSON.stringify({ slate: { games: [{ away: "A", home: "B" }] } });
/** a body of exactly n characters that parses and carries a slate */
const sized = (n: number) => {
  const head = '{"slate":"';
  const tail = '"}';
  return head + "x".repeat(n - head.length - tail.length) + tail;
};

beforeEach(() => {
  calls.length = 0;
  upstream = { status: 200, body: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(BOARD) }] } };
  process.env.ANTHROPIC_API_KEY = KEY;
  delete process.env.LEDGER_SYNC_KEY;
  delete process.env.APP_PASSCODE;
  vi.stubGlobal("fetch", async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), headers: init?.headers ?? {}, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(upstream.body), { status: upstream.status, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LEDGER_SYNC_KEY;
  delete process.env.APP_PASSCODE;
});

describe("G2-1 — the key is not configured", () => {
  it("answers 501 first, with or without a credential (the Settings probe reads this)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.LEDGER_SYNC_KEY = PHRASE;
    expect((await post()).status).toBe(501);
    expect((await post({ "x-pl-sync": PHRASE }, SLATE)).status).toBe(501);
    expect(calls).toEqual([]);
  });
});

describe("G2-1 — no gate credential configured on the server (the old open door)", () => {
  it("a slate with no credential is refused with 503 and the model is never called", async () => {
    const r = await post({}, SLATE);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/locked/);
    expect(calls).toEqual([]);
  });

  it.each([
    ["a guessed passcode", { "x-pl-pass": PASS }],
    ["a guessed phrase", { "x-pl-sync": PHRASE }],
    ["an empty passcode", { "x-pl-pass": "" }],
    ["both guessed", { "x-pl-pass": PASS, "x-pl-sync": PHRASE }],
  ])("%s is refused too", async (_n, headers) => {
    expect((await post(headers, SLATE)).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("the app's own probe (an empty object, no credential) no longer reads as 501", async () => {
    const r = await post();
    expect(r.status).not.toBe(501);
    expect(r.status).toBe(503);
  });
});

describe("G2-1 — sync phrase set, passcode unset", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
  });

  it("no credential is 401 with a plain reason, and the model is never called", async () => {
    const r = await post({}, SLATE);
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.error).toMatch(/sync phrase/);
    expect(Object.keys(body), "the refusal carries its reason and nothing the caller sent").toEqual(["error"]);
    expect(calls).toEqual([]);
  });

  it("a refusal never repeats what the caller sent", async () => {
    const sent = { "x-pl-sync": "sent-phrase-zz", "x-pl-pass": "sent-pass-zz" };
    const text = await (await post(sent, SLATE)).text();
    expect(text).not.toContain("sent-phrase-zz");
    expect(text).not.toContain("sent-pass-zz");
  });

  it.each([
    ["any passcode, since the server has none", { "x-pl-pass": PASS }],
    ["the phrase sent as the passcode", { "x-pl-pass": PHRASE }],
    ["a wrong phrase", { "x-pl-sync": "test-phras" }],
    ["the phrase with one more character", { "x-pl-sync": `${PHRASE}e` }],
    ["the phrase as a Bearer", { authorization: `Bearer ${PHRASE}` }],
  ])("%s is 401", async (_n, headers) => {
    expect((await post(headers, SLATE)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("the phrase passes: the model is called once with the server's key and the board comes back", async () => {
    const r = await post({ "x-pl-sync": PHRASE }, SLATE);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ board: BOARD });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].headers["x-api-key"]).toBe(KEY);
    expect(calls[0].body).toContain('\\"away\\":\\"A\\"');
    expect(calls[0].body).not.toContain(PHRASE);
    expect(Object.keys(calls[0].headers).sort(), "the model call carries the three fixed headers only").toEqual(["anthropic-version", "content-type", "x-api-key"]);
    expect(JSON.stringify(calls[0].headers)).not.toContain(PHRASE);
  });

  it("the phrase with no slate is 400 and the model is not called", async () => {
    const r = await post({ "x-pl-sync": PHRASE });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "missing slate" });
    expect(calls).toEqual([]);
  });

  it("a body that is not JSON is 400", async () => {
    const r = await post({ "x-pl-sync": PHRASE }, "{not json");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "bad request" });
    expect(calls).toEqual([]);
  });
});

describe("G2-1 — passcode set", () => {
  beforeEach(() => {
    process.env.APP_PASSCODE = PASS;
  });

  it("the passcode passes on its own, with no sync phrase on the server", async () => {
    const r = await post({ "x-pl-pass": PASS }, SLATE);
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["no header", {}],
    ["a wrong passcode", { "x-pl-pass": "test-pass-123" }],
    ["the passcode with one more character", { "x-pl-pass": `${PASS}5` }],
    ["the passcode sent as the sync phrase", { "x-pl-sync": PASS }],
    ["a phrase, since the server has none", { "x-pl-sync": PHRASE }],
  ])("%s is 401", async (_n, headers) => {
    expect((await post(headers, SLATE)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("with both configured, either one passes and neither is needed twice", async () => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    expect((await post({ "x-pl-sync": PHRASE }, SLATE)).status).toBe(200);
    expect((await post({ "x-pl-pass": PASS }, SLATE)).status).toBe(200);
    expect((await post({ "x-pl-sync": PASS, "x-pl-pass": PHRASE }, SLATE)).status).toBe(401);
    expect(calls).toHaveLength(2);
  });
});

describe("G2-1 — the body limit", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
  });
  const H = { "x-pl-sync": PHRASE };

  it("a body at the limit is read; one character over is 413 and the model is not called", async () => {
    expect((await post(H, sized(500_000))).status).toBe(200);
    expect(calls).toHaveLength(1);
    const r = await post(H, sized(500_001));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "slate too large" });
    expect(calls).toHaveLength(1);
  });

  it("a body far over the limit is 413", async () => {
    expect((await post(H, sized(2_000_000))).status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("an oversized body that is not even JSON is 413, not 400", async () => {
    expect((await post(H, "x".repeat(500_001))).status).toBe(413);
  });

  it("an oversized body with no credential is 401, and the body is never read", async () => {
    const req = new NextRequest("http://localhost/api/sharp", { method: "POST", body: sized(900_000) });
    const r = await POST(req);
    expect(r.status).toBe(401);
    expect(req.bodyUsed).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("G2-1 — what comes back", () => {
  beforeEach(() => {
    process.env.LEDGER_SYNC_KEY = PHRASE;
    process.env.APP_PASSCODE = PASS;
  });

  it("an upstream refusal of the key is a 502 that names no secret", async () => {
    upstream = { status: 401, body: { error: { message: `invalid x-api-key ${KEY}` } } };
    const r = await post({ "x-pl-sync": PHRASE }, SLATE);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: "Anthropic key on the server is invalid." });
  });

  it("no answer carries the key, the phrase or the passcode", async () => {
    const tries: [Record<string, string>, string][] = [
      [{}, SLATE],
      [{ "x-pl-sync": "wrong" }, SLATE],
      [{ "x-pl-pass": "wrong" }, SLATE],
      [{ "x-pl-sync": PHRASE }, "{}"],
      [{ "x-pl-sync": PHRASE }, SLATE],
      [{ "x-pl-pass": PASS }, sized(500_001)],
    ];
    for (const [h, b] of tries) {
      const text = await (await post(h, b)).text();
      for (const secret of [KEY, PHRASE, PASS]) expect(text).not.toContain(secret);
    }
  });
});

describe("G2-1 — as source", () => {
  const src = stripComments(readFileSync("app/api/sharp/route.ts", "utf8"));
  const post = src.slice(src.indexOf("export async function POST("));

  it("no plain string compare of a secret is left", () => {
    expect(src).not.toMatch(/!== pass\b|=== pass\b/);
    expect(src).not.toMatch(/if \(pass && /);
    expect(src).toMatch(/timingSafeEqual\(h\(want\), h\(got\)\)/);
  });

  it("the gate comes before the body is read, and the body before the model call", () => {
    const gate = post.indexOf("if (!syncAuthed(req) && !passAuthed(req))");
    const body = post.indexOf("await req.text()");
    const model = post.indexOf('fetch("https://api.anthropic.com/v1/messages"');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body);
    expect(body).toBeLessThan(model);
    expect(post).not.toMatch(/await req\.json\(\)/);
  });

  it("there is one model call and the limit is a named constant", () => {
    expect(src.match(/api\.anthropic\.com/g)).toHaveLength(1);
    expect(src).toMatch(/const SH_MAX_BODY = 500_000;/);
  });
});
