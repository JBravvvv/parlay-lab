import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ANYTIME_FORWARD_TIMEOUT_MS, forwardAnytimeRun, runLineOf } from "@/lib/server/anytime-forward";

/**
 * The scheduler as one caller of the any-time engine. Three things are held here:
 *   1. the forward is a POST to /api/anytime/run with the cron key in a header, never in the URL;
 *   2. it never throws, whatever the engine or the network does;
 *   3. the scheduler starts it under its own auth gate and puts nothing of it in its answer.
 */

const KEY = "test-key-never-logged";
const ORIGIN = "https://example.test";

type Call = { url: URL; init: RequestInit };
const recorder = (answer: (c: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const impl = async (url: URL, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return answer(c);
  };
  return { calls, impl };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the forward to the any-time run", () => {
  it("is one POST to /api/anytime/run on the same origin, the key in the x-cron-key header only", async () => {
    const { calls, impl } = recorder(() => json({ status: "ok", runId: "r1", picks: [], graded: [] }));
    const out = await forwardAnytimeRun(ORIGIN, KEY, impl);
    expect(out.forwarded).toBe(true);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/api/anytime/run");
    expect(url.search).toBe("");
    expect(url.href).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "x-cron-key": KEY });
    expect(init.cache).toBe("no-store");
    expect(init.body).toBeUndefined();
  });

  it("carries an abort signal, and the limit is 25 seconds", async () => {
    const { calls, impl } = recorder(() => json({ status: "ok" }));
    await forwardAnytimeRun(ORIGIN, KEY, impl);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].init.signal!.aborted).toBe(false);
    expect(ANYTIME_FORWARD_TIMEOUT_MS).toBe(25_000);
  });

  it("reports the engine's status code as it came, including a refusal and a failed run", async () => {
    for (const status of [200, 401, 500, 503]) {
      const { impl } = recorder(() => json({ ok: false, status: "failed", errors: ["nfl: Odds API 401 for nfl"] }, status));
      const out = await forwardAnytimeRun(ORIGIN, KEY, impl);
      expect(out).toMatchObject({ forwarded: true, status });
    }
  });

  it("never throws: a rejected fetch, a timeout and a non-JSON body all come back as values", async () => {
    const rejected = await forwardAnytimeRun(ORIGIN, KEY, async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(rejected).toEqual({ forwarded: false, error: "connect ECONNREFUSED" });

    const timedOut = await forwardAnytimeRun(ORIGIN, KEY, async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(timedOut).toEqual({ forwarded: false, error: "The operation was aborted due to timeout" });

    const html = await forwardAnytimeRun(ORIGIN, KEY, async () => new Response("<html>502</html>", { status: 502 }));
    expect(html).toEqual({ forwarded: true, status: 502, result: { error: "anytime run returned non-JSON" } });
  });

  it("never puts the key in what it returns", async () => {
    const { impl } = recorder(() => json({ status: "ok", runId: "r1" }));
    const ok = await forwardAnytimeRun(ORIGIN, KEY, impl);
    const bad = await forwardAnytimeRun(ORIGIN, KEY, async () => {
      throw new Error("boom");
    });
    expect(JSON.stringify([ok, bad])).not.toContain(KEY);
  });
});

describe("the one-line summary of a run", () => {
  it("keeps counts, not the picks themselves", () => {
    const line = runLineOf({
      status: "partial",
      runId: "at-1",
      picks: [{ id: "a", price: -105 }, { id: "b", price: 120 }],
      candidates: 44,
      graded: [{ id: "c", result: "won" }],
      skipped: ["cfb"],
      odds: { credits: 6, remaining: 91234 },
      errors: ["e1", "e2", "e3", "e4", "e5", "e6", "e7"],
    });
    expect(line).toEqual({
      status: "partial",
      runId: "at-1",
      picks: 2,
      candidates: 44,
      graded: 1,
      skipped: ["cfb"],
      credits: 6,
      remaining: 91234,
      errors: ["e1", "e2", "e3", "e4", "e5"],
    });
  });

  it("reads a refusal's single error, and fills what a body leaves out", () => {
    expect(runLineOf({ ok: false, error: "sync phrase or cron key required" })).toEqual({
      status: null,
      runId: null,
      picks: 0,
      candidates: null,
      graded: 0,
      skipped: [],
      credits: 0,
      remaining: null,
      errors: ["sync phrase or cron key required"],
    });
  });

  it("answers one fixed line for anything that is not a JSON object", () => {
    for (const body of [null, undefined, "text", 7, [1, 2]]) expect(runLineOf(body)).toEqual({ error: "anytime run returned non-JSON" });
  });
});

describe("the scheduler route, as source", () => {
  const src = readFileSync("app/api/scheduler/route.ts", "utf8");
  const get = src.slice(src.indexOf("export async function GET("));

  it("starts the forward only for an authenticated poke, with the origin and the secret it already holds", () => {
    expect(get).toMatch(/const anytime = authed \? forwardAnytimeRun\(req\.nextUrl\.origin, secret\) : null;/);
    expect(src.match(/forwardAnytimeRun\(/g)).toHaveLength(1);
  });

  it("starts it before the MLB tick and waits for it before answering", () => {
    const start = get.indexOf("const anytime = authed");
    const tick = get.indexOf("const res = await mlbTick(req);");
    const wait = get.indexOf("await anytime");
    const leave = get.indexOf("if (!football) return res;");
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(tick);
    expect(tick).toBeLessThan(wait);
    expect(wait).toBeLessThan(leave);
  });

  it("puts nothing of the run in its own answer", () => {
    expect(src).not.toMatch(/attachAnytime/);
    expect(get).not.toMatch(/anytime\s*[:,]\s*any\b|\{\s*anytime\b|\.\.\.any\b/);
    /* the only use of the awaited value is the warn line */
    expect(get.match(/\bany\.\w+/g)).toEqual(["any.forwarded", "any.error"]);
  });

  it("never reads the any-time route's secret from a query string", () => {
    const fwd = readFileSync("src/lib/server/anytime-forward.ts", "utf8");
    expect(fwd).not.toMatch(/searchParams|\?key=|key=\$\{/);
    expect(fwd).not.toMatch(/console\./);
  });
});
