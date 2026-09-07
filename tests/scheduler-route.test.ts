import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { attachCfb, forwardCfbLock } from "@/lib/server/cfb-lock-forward";
import { CFB_LOCK } from "@/lib/cfb/rules";
import { LINEUP_LEAD_MS } from "@/lib/board-coverage";
import { decide, MIN_READY, SCHED_T } from "@/lib/server/scheduler-decide";
import { stripComments } from "./helpers/source";

/* The exported GET's behavioural describe (bottom of this file) drives the REAL mlbTick.
   Only its two edges are faked: the Upstash REST store (an in-memory Redis behind the same
   `redis(cmd)` the whole server side funnels through) and the keyless statsapi slate read.
   These two hoisted mocks are file-wide; nothing above this line touches either module, so
   the decide()/source describes are unaffected. `@/lib/server/cfb-lock-forward` is NOT
   mocked here — the static import above must stay REAL for the unit describe that pins
   forwardCfbLock's totality; the route's copy is swapped with vi.doMock at load time. */
vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  /* redisGetJson/redisSetJson are mocked ALONGSIDE redis: they call the module-internal
     `redis`, which a partial mock cannot intercept (observed 2026-09-05 — "Error: no store"
     out of the real store.ts:17 while the route's own direct redis() calls were faked). */
  return { ...real, redis: vi.fn(), redisGetJson: vi.fn(), redisSetJson: vi.fn(), storeEnv: vi.fn() };
});
vi.mock("@/lib/server/slate", async (orig) => {
  const real = await orig<typeof import("@/lib/server/slate")>();
  return { ...real, slateStarts: vi.fn() };
});

import { redis, redisGetJson, redisSetJson, storeEnv } from "@/lib/server/store";
import { slateStarts } from "@/lib/server/slate";

/**
 * /api/scheduler — THE BRAINS OF SELF-SCHEDULING, AS A VERCEL ROUTE (2026-08-02, owner's
 * architecture correction: scheduling runs through Vercel, not GitHub Actions).
 *
 * A dumb external ticker (cron-job.org, every 15 min) pokes the route all day. The route
 * evaluates the TWO-CONDITION window from statsapi (zero Odds credits) and fires /api/generate
 * exactly once, the first poke where both hold and no board exists. Idempotent by construction:
 * every other poke exits clean with the reason in the body.
 *
 * ── OBSERVED RED 2026-08-02 ──────────────────────────────────────────────────────────
 * This file ran before the module existed (module-not-found across the suite) and each decide()
 * branch was written against the spec, red, before the implementation made it green.
 *
 * ── THE FAILS-CLOSED GATE, AND THE ANTI-PATTERN IT REFUSES ───────────────────────────
 * `/api/calibrate` shipped `return !cron` — ALLOW when CRON_SECRET is unset — reasoning that the
 * run was idempotent and cheap. This route SPENDS (~50-91 credits a fire), so the same shape
 * here would let any stranger fire a board the day the env var slipped. The gate is therefore:
 * CRON_SECRET unset → 503, always, before anything else. Asserted on comment-stripped source
 * below, per the standing rule that a presence assertion over raw source is satisfiable by prose.
 */

const S = (h: number, m = 0) => Date.parse("2026-08-09T00:00:00Z") + (h * 60 + m) * 60_000;
/** A real Sunday shape: 7-game early block 16:15Z, then 19-20Z stragglers, 00:20Z night game. */
const SLATE = [S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(19, 10), S(19, 15), S(20, 5), S(20, 10), S(20, 10), S(24, 20)];

describe("decide(): the two-condition fire decision, every branch", () => {
  it("fires when BOTH hold and no board exists — and reports both values", () => {
    const d = decide({ starts: SLATE, now: S(16, 0), boardExists: false });
    // 16:00Z: all 13 unstarted, early 7 within 3h lead... ready=7+? compute: games at 19:10+ are >3h out
    expect(d.unstarted).toBe(13);
    expect(d.ready).toBeGreaterThanOrEqual(7);
    if (d.achievable >= SCHED_T && d.ready >= MIN_READY) expect(d.fire).toBe(true);
  });

  it("holds on the RATIO trap: a burned-down slate at achievable 1.000 does not fire", () => {
    /* 2026-08-02 live: one unstarted game, lineup-ready, achievable 1.000. The ratio alone
       fires a one-game board; MIN_READY refuses it. The defect class of §12Z.3. */
    const d = decide({ starts: SLATE, now: S(21, 30), boardExists: false });
    expect(d.unstarted).toBe(1);
    expect(d.achievable).toBe(1);
    expect(d.fire, "a 1-of-1 leftover at achievable 1.000 was allowed to fire").toBe(false);
    expect(d.reason).toMatch(/burned down|MIN_READY|ready 1 < /i);
  });

  it("holds when lineups are not posted yet, and says which condition failed", () => {
    const d = decide({ starts: SLATE, now: S(10, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.achievable).toBeLessThan(SCHED_T);
    expect(d.reason).toMatch(/achievable/);
  });

  it("IDEMPOTENCE: a board already existing exits clean, whatever the conditions say", () => {
    const d = decide({ starts: SLATE, now: S(16, 0), boardExists: true });
    expect(d.fire, "a second board would have been bought for a date that has one").toBe(false);
    expect(d.reason).toBe("board-exists");
    // and the conditions are STILL reported — the standing rule: both values, every response
    expect(d.ready).toBeGreaterThanOrEqual(0);
    expect(d.unstarted).toBeGreaterThanOrEqual(0);
  });

  it("dead slate exits clean", () => {
    const d = decide({ starts: SLATE, now: S(25, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe("dead-slate");
  });

  it("empty schedule is VACUOUS and says so, not a clean zero", () => {
    const d = decide({ starts: [], now: S(16, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/no games|empty/i);
  });

  it("MIRROR: the constants match the engine's and the retired tool's derivation", () => {
    expect(SCHED_T, "T drifted from the pre-committed 0.80").toBe(0.8);
    expect(MIN_READY, "MIN_READY is no longer a positive floor > 1").toBeGreaterThan(1);
    expect(LINEUP_LEAD_MS).toBe(3 * 3600_000);
  });
});

describe("the route file, comment-stripped", () => {
  const src = stripComments(readFileSync("app/api/scheduler/route.ts", "utf8"));

  it("FAILS CLOSED: CRON_SECRET unset → 503 before anything else — NOT calibrate's `return !cron`", () => {
    expect(
      /if \(!process\.env\.CRON_SECRET\)[\s\S]{0,120}?503/.test(src),
      "the unset-secret branch no longer 503s — the calibrate failed-open shape is back on a route that SPENDS",
    ).toBe(true);
    expect(/return !cron/.test(src), "the calibrate anti-pattern appeared in this route").toBe(false);
  });

  it("gates on the header, never the query string, and never the sync phrase", () => {
    expect(/cronHeaderAuthed/.test(src)).toBe(true);
    expect(/searchParams\.get\(["']key["']\)/.test(src), "the secret moved to the query string — it lands in logs").toBe(false);
    expect(/x-pl-sync/.test(src), "the scheduler must never carry the sync phrase").toBe(false);
  });

  it("fires by forwarding to /api/generate — the spending path stays in ONE route", () => {
    expect(/\/api\/generate/.test(src)).toBe(true);
    expect(/x-cron-key/.test(src)).toBe(true);
  });

  it("PLANT (invalid-by-value): the fails-closed regex catches the failed-open shape", () => {
    expect(/return !cron/.test("function authed(){ const cron = process.env.CRON_SECRET; return !cron; }")).toBe(true);
  });
});

/**
 * INSTRUCTION 45 (2026-09-05): the poke also locks the CFB card, by self-forwarding to
 * /api/cfb/lock AFTER the MLB tick has answered, with the same cron header, and reporting the
 * answer under `cfb`. Fire-and-report: a CFB failure of any kind — thrown fetch, timeout,
 * non-JSON, a 5xx — never changes the MLB body or status.
 */
describe("the CFB self-forward rides under `cfb` and can never change the MLB outcome", () => {
  const src = stripComments(readFileSync("app/api/scheduler/route.ts", "utf8"));

  it("the route forwards to /api/cfb/lock only after the MLB tick, with the cron header, under `cfb`", () => {
    expect(src).toMatch(/import \{ attachCfb, forwardCfbLock \} from "@\/lib\/server\/cfb-lock-forward"/);
    const get = src.indexOf("export async function GET(");
    const tick = src.indexOf("async function mlbTick(");
    expect(get).toBeGreaterThan(0);
    expect(tick).toBeGreaterThan(get);
    const wrapper = src.slice(get, tick);
    // MLB first, always; the forward only after its answer, and only past the gate
    expect(wrapper).toMatch(/const res = await mlbTick\(req\);/);
    expect(wrapper.indexOf("mlbTick(req)")).toBeLessThan(wrapper.indexOf("forwardCfbLock("));
    /* PIN REWRITTEN 2026-09-06 (INSTRUCTION 45, task 2). This assertion used to read
           expect(wrapper).toMatch(/if \(res\.status !== 200[^\n]*return res;/);
       — it pinned "any non-200 MLB answer short-circuits before the forward is attempted".
       That gate WAS the defect, for the MLB-SIDE non-200s: mlbTick answers 503 when storeEnv()
       is false, and Next renders any unhandled throw inside it as a bodyless 500. vercel.json
       declares crons only for /api/scheduler, so there is NO other path to /api/cfb/lock, and
       one MLB blip therefore cost the CFB desk the whole $150/$25 day, silently, with nothing
       written and no CFB-side signal.
       CORRECTED 2026-09-06: an earlier draft of this note listed the tick's 401 among those
       MLB-SIDE outages, which reads as though the new gate forwards it. It does not. The tick's
       other non-200s — 401 on a header problem, 503 when CRON_SECRET is unset — are
       AUTHORISATION, not outage, and they still return without forwarding, because the
       replacement gate pinned below refuses them by name (CRON_SECRET / cronHeaderAuthed)
       rather than by status: an unauthenticated poke must never make the SERVER reach
       /api/cfb/lock carrying the real secret. The gate is now AUTHORISATION, never the MLB
       outcome, and this pin says exactly that. */
    expect(wrapper).toMatch(/if \(!process\.env\.CRON_SECRET \|\| !cronHeaderAuthed\(req\)\) return res;/);
    expect(wrapper, "the MLB outcome is gating the CFB forward again").not.toMatch(/res\.status !== 200/);
    expect(wrapper).toMatch(/forwardCfbLock\(req\.nextUrl\.origin, process\.env\.CRON_SECRET\)/);
    expect(wrapper).toMatch(/attachCfb\(res, cfb\)/);
    // the MLB tick itself is untouched: its fails-closed gate and generate forward still live in it
    const body = src.slice(tick);
    expect(/if \(!process\.env\.CRON_SECRET\)[\s\S]{0,120}?503/.test(body)).toBe(true);
    expect(body).toMatch(/\/api\/generate/);
    expect(body).not.toMatch(/cfb/i);
    // the forward helper sends the same header the generate forward sends, to the CFB lock path
    const fwd = stripComments(readFileSync("src/lib/server/cfb-lock-forward.ts", "utf8"));
    expect(fwd).toMatch(/"\/api\/cfb\/lock"/);
    expect(fwd).toMatch(/"x-cron-key": secret/);
    expect(fwd).toMatch(/AbortSignal\.timeout\(CFB_LOCK\.forwardTimeoutMs\)/);
    expect(fwd).not.toMatch(/x-pl-sync/);
  });

  it("forwardCfbLock reports the CFB answer and NEVER throws — a thrown fetch becomes { forwarded: false, error }", async () => {
    const ok = await forwardCfbLock("https://parlay.test", "s", async (u, init) => {
      expect(String(u)).toBe("https://parlay.test/api/cfb/lock");
      expect((init.headers as Record<string, string>)["x-cron-key"]).toBe("s");
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ status: "locked", date: "2026-09-05", core: 5 }), { status: 200 });
    });
    expect(ok).toEqual({ forwarded: true, status: 200, result: { status: "locked", date: "2026-09-05", core: 5 } });

    const thrown = await forwardCfbLock("https://parlay.test", "s", async () => {
      throw new Error("ECONNRESET");
    });
    expect(thrown).toEqual({ forwarded: false, error: "ECONNRESET" });

    const refused = await forwardCfbLock("https://parlay.test", "s", async () => new Response("nope", { status: 503 }));
    expect(refused).toEqual({ forwarded: true, status: 503, result: { error: "cfb lock returned non-JSON" } });
    expect(CFB_LOCK.forwardTimeoutMs).toBe(25_000);
  });

  it("attachCfb: the MLB body and status ride through unchanged, `cfb` added — on success and on a failed forward", async () => {
    const mlb = { fired: false, date: "2026-09-05", reason: "board-exists", lock: { present: true }, blocks: [] };
    const good = await attachCfb(NextResponse.json(mlb, { status: 200 }), { forwarded: true, status: 200, result: { status: "waiting" } });
    expect(good).toEqual({ status: 200, body: { ...mlb, cfb: { forwarded: true, status: 200, result: { status: "waiting" } } } });

    const failed = await attachCfb(NextResponse.json(mlb, { status: 200 }), { forwarded: false, error: "The operation was aborted due to timeout" });
    expect(failed?.status).toBe(200);
    expect(failed?.body).toEqual({ ...mlb, cfb: { forwarded: false, error: "The operation was aborted due to timeout" } });
    // every MLB field is byte-identical to what the tick produced
    const { cfb: _cfb, ...rest } = failed!.body;
    expect(rest).toEqual(mlb);

    // a non-object body (never, from NextResponse.json) is left alone rather than risk the MLB answer
    expect(await attachCfb(new Response("not json", { status: 200 }), { forwarded: false, error: "x" })).toBeNull();
  });
});

/**
 * INSTRUCTION 45 (2026-09-05) — THE BEHAVIOURAL HALF, and the gap it closes.
 *
 * The describe above pins the self-forward two ways: unit tests of forwardCfbLock/attachCfb,
 * and regexes over the comment-stripped route source. NOTHING in it ever imported and CALLED
 * the exported GET. Proved by mutant on 2026-09-05: inserting
 *
 *     if (!cfb.forwarded) return NextResponse.json({ error: cfb.error }, { status: 502 });
 *
 * into the exported GET — a CFB forward failure destroying the MLB answer and changing its
 * status, the exact thing the describe above claims is impossible — left 36 of 36 tests
 * GREEN. Both helpers were still correct in isolation and every source regex still matched,
 * because the mutant ADDS a line rather than removing one the regexes look for. A source
 * regex can only pin the shapes it was told to look for; the wiring between them needs the
 * real function called.
 *
 * So this describe calls the exported GET. The MLB tick underneath is the REAL one — its
 * fails-closed gate, the header check, the block partition, the epoch check, the lock
 * self-check, the top-up and grading decisions all execute — with exactly two edges faked:
 * `redis` (in-memory) and `slateStarts` (the keyless statsapi read). An EMPTY slate is used
 * deliberately: decide() reads it VACUOUS, so no block fires, no top-up fires, and the tick
 * cannot reach /api/generate — a poke that spends nothing and answers 200 identically every
 * time, which is what a byte-identity assertion needs. The clock is pinned to 18:07Z (11:07
 * PT, 2026-09-05) — not a grading hour, so the /api/calibrate forward is not reached either.
 *
 * MLB_BODY below is the tick's answer, pinned whole. Every case asserts the response body is
 * MLB_BODY plus one key, `cfb`, and the status is the tick's 200.
 */
describe("the exported GET, CALLED: the CFB forward rides along and can never change the MLB answer", () => {
  const SECRET = "cron-secret-for-this-test-only";
  const NOW = Date.parse("2026-09-05T18:07:00Z"); // 11:07 PT — not a grading hour, mid-day
  const forwardMock = vi.fn();
  let GET: (req: NextRequest) => Promise<Response>;

  /** an in-memory Redis behind the mocked `redis(cmd)` — the same shape tests/cfb-lock-route uses */
  function fakeRedis(seed: Record<string, string> = {}) {
    const kv = new Map(Object.entries(seed));
    const calls: unknown[][] = [];
    vi.mocked(redis).mockImplementation(async (cmd: unknown[]) => {
      calls.push(cmd);
      const [op, key, ...rest] = cmd as [string, string, ...unknown[]];
      switch (op) {
        case "GET":
          return kv.get(key) ?? null;
        case "SET":
          kv.set(key, String(rest[0]));
          return "OK";
        default:
          throw new Error(`fake redis: ${op}`);
      }
    });
    vi.mocked(redisGetJson).mockImplementation(async (key: string) => {
      calls.push(["GET", key]);
      const raw = kv.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    });
    vi.mocked(redisSetJson).mockImplementation(async (key: string, value: unknown) => {
      calls.push(["SET", key, JSON.stringify(value)]);
      kv.set(key, JSON.stringify(value));
    });
    return { kv, calls };
  }

  beforeAll(async () => {
    /* doMock, not the hoisted vi.mock: the file's own static import of forwardCfbLock (used by
       the unit describe above) must keep the REAL implementation. doMock registers the swap
       after that import has already bound, and the route — imported dynamically on the next
       line, so this is its first load — picks up the mocked copy. */
    vi.doMock("@/lib/server/cfb-lock-forward", async (orig) => {
      const real = await orig<typeof import("@/lib/server/cfb-lock-forward")>();
      return { ...real, forwardCfbLock: forwardMock }; // attachCfb stays REAL — it is the thing under test
    });
    ({ GET } = await import("../app/api/scheduler/route"));
  });
  afterAll(() => {
    vi.doUnmock("@/lib/server/cfb-lock-forward");
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("CRON_SECRET", SECRET);
    forwardMock.mockReset();
    vi.mocked(redis).mockReset();
    vi.mocked(redisGetJson).mockReset();
    vi.mocked(redisSetJson).mockReset();
    fakeRedis();
    vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
    vi.mocked(slateStarts).mockReset().mockResolvedValue([]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const call = async (headers: Record<string, string> = { "x-cron-key": SECRET }) => {
    const res = await GET(new NextRequest("https://parlay.test/api/scheduler", { headers }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  /** the MLB tick's whole answer on this pinned clock and empty slate — no CFB anywhere in it */
  const MLB_BODY = {
    fired: false,
    topup: { fire: false, reason: "no paper lock for the date yet — block fires come first", owed: 0, used: 0 },
    grading: { fired: false, reason: "not a grading tick (grading runs on the first tick of hours 15/2 UTC)" },
    lock: { present: false, action: null },
    date: "2026-09-05",
    at: "2026-09-05T18:07:00.000Z",
    T: 0.8,
    minReady: MIN_READY,
    blocks: [],
    fire: false,
    reason: "empty schedule — no games today; VACUOUS, not a clean zero",
    ready: 0,
    unstarted: 0,
    started: 0,
    achievable: 0,
    costEstimate: 0,
  };

  it("BASELINE: the tick answers 200 with no `cfb` of its own — the whole body, pinned", async () => {
    forwardMock.mockResolvedValue({ forwarded: true, status: 200, result: { status: "waiting" } });
    const { status, body } = await call();
    expect(status).toBe(200);
    const { cfb: _cfb, ...mlb } = body;
    expect(mlb).toEqual(MLB_BODY);
    // `cfb` is the ONLY key the wrapper adds
    expect(Object.keys(body).filter((k) => !(k in MLB_BODY))).toEqual(["cfb"]);
    expect(body.cfb).toEqual({ forwarded: true, status: 200, result: { status: "waiting" } });
  });

  it("(a) the forward FAILS (timeout/offline shape): still 200, MLB body byte-identical, `cfb` carries the error", async () => {
    const err = "The operation was aborted due to timeout";
    forwardMock.mockResolvedValue({ forwarded: false, error: err });
    const { status, body } = await call();
    expect(status, "a CFB forward failure changed the MLB status code").toBe(200);
    const { cfb, ...mlb } = body;
    expect(mlb, "a CFB forward failure changed the MLB body").toEqual(MLB_BODY);
    expect(JSON.stringify(mlb)).toBe(JSON.stringify(MLB_BODY)); // byte-identical, key order included
    expect(cfb).toEqual({ forwarded: false, error: err });
  });

  /* OBSERVED RED 2026-09-05, FIXED 2026-09-06. The exported GET did
     `const cfb = await forwardCfbLock(...)` with no catch, so a REJECTED forward propagated out
     of GET and Next turned the whole poke into an unhandled 500 with no body: the MLB tick's
     answer, already computed, destroyed by the CFB desk — precisely what the describe above
     claims is impossible. Failure seen, verbatim: `Error: ECONNRESET` at this file's
     forwardMock.mockRejectedValue line. The shipped forwardCfbLock is total (its own try/catch
     returns { forwarded: false, error }), so this could not fire in prod as written — it was one
     edit inside that helper away from firing, which is exactly the defence the fire-and-report
     contract is supposed to give, and the contract is asserted HERE so it must hold HERE. Fixed
     in app/api/scheduler/route.ts by a `.catch` on the forward that degrades to
     { forwarded: false, error }, keeping the guarantee in the file that makes the claim.
     Re-proved by mutant on 2026-09-06: deleting that .catch turns this case red again with the
     same `Error: ECONNRESET`. */
  it("(b) the forward REJECTS: the exported GET does not propagate the throw — 200, MLB body byte-identical", async () => {
    forwardMock.mockRejectedValue(new Error("ECONNRESET"));
    const { status, body } = await call();
    expect(status, "a thrown CFB forward escaped the wrapper and destroyed the MLB answer").toBe(200);
    const { cfb: _cfb, ...mlb } = body;
    expect(mlb).toEqual(MLB_BODY);
    expect(JSON.stringify(mlb)).toBe(JSON.stringify(MLB_BODY));
  });

  it("(c) the CFB route REFUSES (503): still 200, MLB body byte-identical, the refusal rides under `cfb`", async () => {
    forwardMock.mockResolvedValue({ forwarded: true, status: 503, result: { error: "cfb-not-configured" } });
    const { status, body } = await call();
    expect(status, "a CFB 503 was allowed to become the MLB status").toBe(200);
    const { cfb, ...mlb } = body;
    expect(mlb).toEqual(MLB_BODY);
    expect(JSON.stringify(mlb)).toBe(JSON.stringify(MLB_BODY));
    expect(cfb).toEqual({ forwarded: true, status: 503, result: { error: "cfb-not-configured" } });
  });

  it("every CFB outcome leaves the SAME MLB answer — the three cases cross-check each other", async () => {
    const outcomes: unknown[] = [
      { forwarded: true, status: 200, result: { status: "locked" } },
      { forwarded: false, error: "The operation was aborted due to timeout" },
      { forwarded: true, status: 503, result: { error: "cfb-not-configured" } },
    ];
    const bodies: string[] = [];
    for (const o of outcomes) {
      forwardMock.mockReset();
      forwardMock.mockResolvedValue(o);
      const { status, body } = await call();
      expect(status).toBe(200);
      const { cfb: _cfb, ...mlb } = body;
      bodies.push(JSON.stringify(mlb));
    }
    expect(new Set(bodies).size, "the MLB answer moved with the CFB outcome").toBe(1);
    expect(bodies[0]).toBe(JSON.stringify(MLB_BODY));
  });

  /**
   * (d1) + (d2) REPLACE THE OLD CASE (d), 2026-09-06 (INSTRUCTION 45, task 2).
   *
   * WHAT WAS DELETED. Exactly one case, titled:
   *
   *   it("(d) a non-200 MLB answer is returned UNTOUCHED and the CFB forward is never even
   *       attempted", ...)
   *
   * Its TITLE generalised to any non-200, but its BODY only ever exercised two AUTHORISATION
   * refusals, in this order, asserting for each that the forward never ran. Verbatim:
   *
   *   // wrong header → the tick's 401
   *   const wrong = await call({ "x-cron-key": "not-the-secret" });
   *   expect(wrong.status).toBe(401);
   *   expect(wrong.body).toEqual({ error: "unauthorized" });
   *   expect("cfb" in wrong.body, "a refused poke still forwarded to the CFB desk").toBe(false);
   *   expect(forwardMock, "the CFB desk was poked off an unauthorized MLB poke").not.toHaveBeenCalled();
   *
   *   // CRON_SECRET unset → the tick's fails-closed 503, before anything is read
   *   vi.stubEnv("CRON_SECRET", "");
   *   const unset = await call();
   *   expect(unset.status).toBe(503);
   *   expect(String(unset.body.error)).toMatch(/CRON_SECRET unset/);
   *   expect("cfb" in unset.body).toBe(false);
   *   expect(forwardMock).not.toHaveBeenCalled();
   *
   * CORRECTION, 2026-09-06. The first draft of this docblock said the second half was a
   * storeEnv()-false 503 and that "the 503 half encoded the defect". Both clauses were false:
   * the second half was the CRON_SECRET-unset 503 quoted above, and storeEnv() was never
   * touched by the deleted case at all. A justification that misquotes what it replaced is
   * worse than none — the next reader cannot audit the rewrite — so it is restated here from
   * the deleted source itself.
   *
   * WHAT SURVIVES, AND WHERE. BOTH halves survive, in (d1), assertion for assertion — nothing
   * the deleted case checked was dropped or loosened. `.not.toHaveBeenCalled()` is written as
   * the equivalent `expect(forwardMock.mock.calls.length).toBe(0)`, and (d1) adds two
   * hardenings: a third refusal (a poke with NO header at all), and a forwardMock
   * .mockResolvedValue at the top, so a stray call would return a well-formed result instead of
   * `undefined` — the case now passes on the never-called property rather than on the crash an
   * undefined result would have caused. What (d1) pins has nothing to do with the MLB status:
   * an unauthenticated public poke must never be able to make the SERVER reach /api/cfb/lock
   * carrying the real CRON_SECRET.
   *
   * WHAT WAS REWRITTEN, AND WHY. Not an assertion — the case's CLAIM. Its title said the
   * forward is never attempted after ANY non-200, and the first cut's gate
   * (`if (res.status !== 200 || !process.env.CRON_SECRET) return res;`) implemented exactly
   * that, while its assertions only ever covered authorisation. The uncovered ground was the
   * defect: mlbTick also answers 503 when storeEnv() is false, and Next renders any unhandled
   * throw inside it as a bodyless 500 — both purely MLB-SIDE. vercel.json declares crons only
   * for /api/scheduler, so there is no other path to /api/cfb/lock: under the old gate an
   * MLB-side outage cost the CFB desk the whole $150/$25 day, silently, with nothing written
   * and no CFB-side signal — the opposite of what INSTRUCTION 45 asked for ("the same $150 per
   * day theoretical Core money and $25 Fun money per day"). The gate is now AUTHORISATION and
   * nothing else, so the deleted title is no longer a true statement about this route and could
   * not be carried forward. (d2) is therefore a NEW case, over ground the deleted (d) never
   * asserted: an AUTHORISED poke whose MLB tick answers 503 STILL forwards, and the MLB status
   * and body still ride through untouched with `cfb` as the only added key.
   */
  it("(d1) an UNAUTHED poke answers 401 and the server NEVER reaches the CFB desk with the real secret", async () => {
    forwardMock.mockResolvedValue({ forwarded: true, status: 200, result: { status: "locked" } });

    // wrong header → the tick's 401
    const wrong = await call({ "x-cron-key": "not-the-secret" });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "unauthorized" });
    expect("cfb" in wrong.body, "a refused poke still forwarded to the CFB desk").toBe(false);
    expect(forwardMock.mock.calls.length, "the CFB desk was poked off an unauthorized MLB poke").toBe(0);

    // no header at all → the same refusal, and still no forward
    const bare = await call({});
    expect(bare.status).toBe(401);
    expect(bare.body).toEqual({ error: "unauthorized" });
    expect("cfb" in bare.body).toBe(false);
    expect(forwardMock.mock.calls.length, "a bare public poke reached the CFB desk").toBe(0);

    // CRON_SECRET unset → the tick's fails-closed 503; there is no secret to forward WITH
    vi.stubEnv("CRON_SECRET", "");
    const unset = await call();
    expect(unset.status).toBe(503);
    expect(String(unset.body.error)).toMatch(/CRON_SECRET unset/);
    expect("cfb" in unset.body).toBe(false);
    expect(forwardMock.mock.calls.length, "the forward ran with no configured secret").toBe(0);
  });

  it("(d2) an AUTHED poke whose MLB tick answers 503 STILL forwards — an MLB outage cannot cost the CFB day", async () => {
    vi.mocked(storeEnv).mockReturnValue(null); // the MLB-side outage: the sync store is not configured
    forwardMock.mockResolvedValue({ forwarded: true, status: 200, result: { status: "locked", core: 5 } });
    const { status, body } = await call();
    expect(status, "the CFB attach changed the MLB status code").toBe(503);
    const { cfb, ...mlb } = body;
    expect(mlb, "the MLB error body was not carried through byte-identical").toEqual({ error: "sync-not-configured" });
    expect(JSON.stringify(mlb)).toBe(JSON.stringify({ error: "sync-not-configured" }));
    expect(Object.keys(body), "`cfb` was not the only added key").toEqual(["error", "cfb"]);
    expect(forwardMock.mock.calls.length, "an MLB-side outage silently cost the CFB desk its $150/$25 day").toBe(1);
    expect(cfb).toEqual({ forwarded: true, status: 200, result: { status: "locked", core: 5 } });
  });

  /**
   * (e) ADDED 2026-09-06 (INSTRUCTION 45, task 3). Case (c) drives a 503 — a GATE refusal, the
   * one status the CFB route shares with the MLB tick. The CFB route also invents a status of
   * its own: its odds-missing refusal (DEFECT 1 in app/api/cfb/lock/route.ts — a transient Odds
   * API blip must never lock the day NO-PLAY for want of lines) answers HTTP 502 with a body
   * carrying status/oddsMissing/pricedAhead/ahead/games/note, plus the previous-date `sweep`
   * key that route's say() folds into the answers it builds whenever a sweep actually ran (it
   * is suppressed for a hand-typed ?date; this forward never carries one). None of that may leak into the poke's
   * status, and all of it must survive whole under `cfb` — that body is what a human reads off
   * the poke log to know the CFB day is still retryable rather than lost.
   *
   * The forward is MOCKED deliberately: this pins the SCHEDULER's handling of the refusal.
   * tests/cfb-lock-route.test.ts owns whether the CFB route produces it, and importing that
   * route here would drag its ESPN/Odds/Redis edges into this file.
   */
  it("(e) the CFB route's odds-missing 502 rides through under `cfb` whole — the poke stays the MLB 200", async () => {
    const REFUSAL = {
      status: "odds-missing",
      date: "2026-09-05",
      at: "2026-09-05T18:07:00.000Z",
      dry: false,
      oddsMissing: true,
      pricedAhead: 0,
      ahead: 11,
      games: 14,
      note: "no Caesars price on any of the 11 games still ahead (the Odds API call failed or had no key) — nothing written, the next poke retries. A day is never locked NO-PLAY for want of lines.",
      sweep: { date: "2026-09-04", action: "already-recorded" },
    };
    forwardMock.mockResolvedValue({ forwarded: true, status: 502, result: REFUSAL });
    const { status, body } = await call();
    expect(status, "the CFB route's invented 502 became the poke's status").toBe(200);
    const { cfb, ...mlb } = body;
    expect(mlb, "a CFB refusal changed the MLB body").toEqual(MLB_BODY);
    expect(JSON.stringify(mlb)).toBe(JSON.stringify(MLB_BODY));
    expect(cfb).toEqual({ forwarded: true, status: 502, result: REFUSAL });
    // every diagnostic key survives — oddsMissing/pricedAhead/ahead/games/sweep, unchanged
    expect((cfb as { result: Record<string, unknown> }).result).toEqual(REFUSAL);
  });
});
