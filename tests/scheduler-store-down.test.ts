import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { LedgerUnreadable } from "@/lib/server/ledger-read";
import { TICK_ALERT_TOKEN, tickDetailOf, tickFailureKindOf, tickFailureOf } from "@/lib/server/tick-failure";

/* AUDIT E1-1 — a store outage inside the scheduler's MLB tick used to escape the route as a
   bodyless 500 on every poke. These tests drive the REAL route with the store failing. Only the
   edges are faked: the store client, the keyless slate read, and the three forwards. */
vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, redis: vi.fn(), redisGetJson: vi.fn(), redisSetJson: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/server/slate", async (orig) => {
  const real = await orig<typeof import("@/lib/server/slate")>();
  return { ...real, slateStarts: vi.fn() };
});

import { redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { slateStarts } from "@/lib/server/slate";

describe("E1-1 — what a thrown tick is called", () => {
  it("the store client's own failures are a store outage", () => {
    for (const msg of ["store 403", "store 500", "store 429", "no store", "ERR max daily request limit exceeded", "WRONGPASS invalid or missing auth token", "NOPERM this user has no permissions", "READONLY You can't write against a read only replica"]) {
      expect(tickFailureKindOf(new Error(msg)), msg).toBe("store-unreachable");
    }
    expect(tickFailureKindOf("store 403"), "a thrown string").toBe("store-unreachable");
  });

  it("an unreadable ledger is named as that, not as an outage", () => {
    expect(tickFailureKindOf(new LedgerUnreadable("pl:ledger:v1", "not JSON"))).toBe("ledger-unreadable");
  });

  it("anything else is the tick's own failure — a word that merely contains 'store' is not an outage", () => {
    for (const msg of ["boom", "fetch failed", "statsapi 502", "storefront 403", "the store 403", "store 4030", "restore 403", "ERROR in slate", ""]) {
      expect(tickFailureKindOf(new Error(msg)), msg).toBe("mlb-tick-failed");
    }
    expect(tickFailureKindOf(undefined)).toBe("mlb-tick-failed");
    expect(tickFailureKindOf({ message: "store 403" }), "not an Error and not text").toBe("mlb-tick-failed");
  });

  it("a dependency being down is 503; the tick's own fault is 500; the body always says which", () => {
    expect(tickFailureOf(new Error("store 403"))).toEqual({ status: 503, body: { ok: false, error: "store-unreachable", detail: "store 403" } });
    const unreadable = tickFailureOf(new LedgerUnreadable("pl:ledger:v1", "not JSON"));
    expect(unreadable.status).toBe(503);
    expect(unreadable.body.error).toBe("ledger-unreadable");
    expect(unreadable.body.detail).toContain("pl:ledger:v1");
    expect(tickFailureOf(new Error("boom"))).toEqual({ status: 500, body: { ok: false, error: "mlb-tick-failed", detail: "boom" } });
  });

  it("the detail never carries a secret, is capped, and is never empty", () => {
    expect(tickDetailOf(new Error("store 500 key=test-key-never-logged and again test-key-never-logged"), ["test-key-never-logged"])).toBe("store 500 key=[redacted] and again [redacted]");
    expect(tickFailureOf(new Error("x test-key-never-logged"), ["test-key-never-logged"]).body.detail).toBe("x [redacted]");
    expect(tickDetailOf(new Error("store 403"), [undefined, null, "", "sto", "403"]), "an unset or tiny secret removes nothing").toBe("store 403");
    expect(tickDetailOf(new Error("y".repeat(900)))).toHaveLength(240);
    expect(tickDetailOf(new Error(""))).toBe("unknown error");
    expect(tickDetailOf(undefined)).toBe("unknown error");
    expect(tickDetailOf({ nope: 1 })).toBe("unknown error");
    expect(tickDetailOf("plain text")).toBe("plain text");
  });
});

describe("E1-1 — the exported GET, called with the store down", () => {
  const SECRET = "test-key-never-logged";
  const NOW = Date.parse("2026-09-05T18:27:00Z"); // 11:27 PT — not a grading tick, same clock scheduler-route.test.ts pins
  const cfbMock = vi.fn();
  const nflMock = vi.fn();
  const anyMock = vi.fn();
  let GET: (req: NextRequest) => Promise<Response>;
  let errors: ReturnType<typeof vi.spyOn>;
  let warns: ReturnType<typeof vi.spyOn>;

  const storeDown = (msg = "store 403") => {
    const fail = async () => {
      throw new Error(msg);
    };
    vi.mocked(redis).mockImplementation(fail);
    vi.mocked(redisGetJson).mockImplementation(fail);
    vi.mocked(redisSetJson).mockImplementation(fail);
  };
  const storeUp = () => {
    const kv = new Map<string, string>();
    vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
      const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
      if (op === "GET") return kv.get(key) ?? null;
      if (op === "SET") {
        kv.set(key, String(rest[0]));
        return "OK";
      }
      throw new Error(`fake redis: ${op}`);
    });
    vi.mocked(redisGetJson).mockImplementation(async (key: string) => (kv.has(key) ? JSON.parse(kv.get(key) as string) : null));
    vi.mocked(redisSetJson).mockImplementation(async (key: string, value: unknown) => {
      kv.set(key, JSON.stringify(value));
    });
  };

  beforeAll(async () => {
    vi.doMock("@/lib/server/cfb-lock-forward", async (orig) => {
      const real = await orig<typeof import("@/lib/server/cfb-lock-forward")>();
      return { ...real, forwardCfbLock: cfbMock };
    });
    vi.doMock("@/lib/server/nfl-lock-forward", async (orig) => {
      const real = await orig<typeof import("@/lib/server/nfl-lock-forward")>();
      return { ...real, forwardNflLock: nflMock };
    });
    vi.doMock("@/lib/server/anytime-forward", async (orig) => {
      const real = await orig<typeof import("@/lib/server/anytime-forward")>();
      return { ...real, forwardAnytimeRun: anyMock };
    });
    ({ GET } = await import("../app/api/scheduler/route"));
  });
  afterAll(() => {
    vi.doUnmock("@/lib/server/cfb-lock-forward");
    vi.doUnmock("@/lib/server/nfl-lock-forward");
    vi.doUnmock("@/lib/server/anytime-forward");
  });

  const CFB = { forwarded: false, error: "store unreachable" };
  const NFL = { forwarded: true, status: 502, result: { error: "store unreachable: store 403" } };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("CRON_SECRET", SECRET);
    cfbMock.mockReset().mockResolvedValue(CFB);
    nflMock.mockReset().mockResolvedValue(NFL);
    anyMock.mockReset().mockResolvedValue({ forwarded: true, status: 200 });
    vi.mocked(redis).mockReset();
    vi.mocked(redisGetJson).mockReset();
    vi.mocked(redisSetJson).mockReset();
    vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
    vi.mocked(slateStarts).mockReset().mockResolvedValue([]);
    storeDown();
    vi.spyOn(console, "log").mockImplementation(() => {});
    warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const call = async (headers: Record<string, string> = { "x-cron-key": SECRET }) => {
    const res = await GET(new NextRequest("https://parlay.test/api/scheduler", { headers }));
    const text = await res.text();
    return { status: res.status, text, body: (text ? JSON.parse(text) : null) as Record<string, unknown> | null };
  };

  it("the poke ANSWERS — it does not throw — with a reason in a JSON body and a failing status", async () => {
    const { status, body, text } = await call();
    expect(status, "a store outage must still read as a failed run to the cron provider").toBe(503);
    expect(text.length, "the bodyless 500 is back").toBeGreaterThan(0);
    expect(body).toEqual({ ok: false, error: "store-unreachable", detail: "store 403", cfb: CFB, nfl: NFL });
  });

  it("the football answers still ride on the body, in order, exactly as after any other tick", async () => {
    const { body } = await call();
    expect(Object.keys(body ?? {})).toEqual(["ok", "error", "detail", "cfb", "nfl"]);
    expect(cfbMock).toHaveBeenCalledTimes(1);
    expect(nflMock).toHaveBeenCalledTimes(1);
  });

  it("the rest of the poke still runs: the any-time forward is awaited and the alert retry is reached", async () => {
    await call();
    expect(anyMock).toHaveBeenCalledTimes(1);
    const said = warns.mock.calls.map((c) => String(c[0]));
    expect(said.some((s) => s.startsWith("[push] retry check failed")), "the alert retry was never reached").toBe(true);
  });

  it("the any-time engine still adds nothing to the answer, even when its own forward failed too", async () => {
    anyMock.mockResolvedValue({ forwarded: false, error: "The operation was aborted due to timeout" });
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body).not.toHaveProperty("anytime");
    expect(Object.keys(body ?? {})).toEqual(["ok", "error", "detail", "cfb", "nfl"]);
    const said = warns.mock.calls.map((c) => String(c[0]));
    expect(said.some((s) => s.startsWith("[scheduler] anytime run forward failed")), "a failed tick stopped waiting on the any-time run").toBe(true);
  });

  it("one log line, starting with the fixed token, names the reason — and never the secret", async () => {
    storeDown(`store 500 ${SECRET}`);
    const { body } = await call();
    expect(errors).toHaveBeenCalledTimes(1);
    const line = String(errors.mock.calls[0][0]);
    expect(line.startsWith(TICK_ALERT_TOKEN)).toBe(true);
    expect(line).toContain("store-unreachable");
    expect(line).toContain("store 500 [redacted]");
    expect(line).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(body?.detail).toBe("store 500 [redacted]");
  });

  it("a failure that is not the store is the tick's own: 500, named, and football still attached", async () => {
    storeUp();
    vi.mocked(slateStarts).mockRejectedValue(new Error("statsapi 502"));
    const { status, body } = await call();
    expect(status).toBe(500);
    expect(body).toEqual({ ok: false, error: "mlb-tick-failed", detail: "statsapi 502", cfb: CFB, nfl: NFL });
    expect(String(errors.mock.calls[0][0]).startsWith(TICK_ALERT_TOKEN)).toBe(true);
  });

  it("the gates still answer first: no header is 401, no secret is 503, and neither reaches a forward or the store", async () => {
    const wrong = await call({ "x-cron-key": "not-the-secret" });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "unauthorized" });
    const none = await call({});
    expect(none.status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    const unset = await call();
    expect(unset.status).toBe(503);
    expect(String(unset.body?.error)).toMatch(/^scheduler-not-configured/);
    expect(cfbMock).not.toHaveBeenCalled();
    expect(nflMock).not.toHaveBeenCalled();
    expect(anyMock).not.toHaveBeenCalled();
    expect(vi.mocked(redis)).not.toHaveBeenCalled();
    expect(errors, "a refused poke is not an alert").not.toHaveBeenCalled();
  });

  it("a healthy poke is untouched: 200, no failure keys, no alert line", async () => {
    storeUp();
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).not.toHaveProperty("ok");
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("detail");
    expect(body?.fired).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("E1-1 — as source", () => {
  const src = stripComments(readFileSync("app/api/scheduler/route.ts", "utf8"));
  const get = src.indexOf("export async function GET(");
  const tick = src.indexOf("async function mlbTick(");
  const inner = src.indexOf("async function mlbTickUnguarded(");

  it("GET still awaits the one tick, and the tick is the guarded one", () => {
    expect(get).toBeGreaterThan(0);
    expect(tick).toBeGreaterThan(get);
    expect(inner).toBeGreaterThan(tick);
    expect(src.slice(get, tick)).toMatch(/const res = await mlbTick\(req\);/);
    expect(src.slice(get, tick), "GET reaches past the guard").not.toMatch(/mlbTickUnguarded/);
  });

  it("the guard is a try around the whole tick, answering through tickFailureOf with the secret named for removal", () => {
    const guard = src.slice(tick, inner);
    expect(guard).toMatch(/try \{\s*return await mlbTickUnguarded\(req\);\s*\} catch \(e\) \{/);
    expect(guard).toMatch(/const f = tickFailureOf\(e, \[process\.env\.CRON_SECRET\]\);/);
    expect(guard).toMatch(/console\.error\(`\$\{TICK_ALERT_TOKEN\}: \$\{f\.body\.error\} — \$\{f\.body\.detail\}`\);/);
    expect(guard).toMatch(/return NextResponse\.json\(f\.body, \{ status: f\.status \}\);/);
    expect(guard, "the guard rethrows").not.toMatch(/throw /);
    expect(src.match(/mlbTickUnguarded\(/g), "the unguarded tick is called from somewhere else").toHaveLength(2);
  });

  it("the failure helper is pure: no store, no fetch, no env", () => {
    const helper = stripComments(readFileSync("src/lib/server/tick-failure.ts", "utf8"));
    expect(helper).not.toMatch(/import |fetch\(|process\.env|redis\(/);
  });
});
