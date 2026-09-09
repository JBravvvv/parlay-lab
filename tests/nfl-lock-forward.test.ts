import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { attachNfl, forwardNflLock } from "@/lib/server/nfl-lock-forward";
import { NFL_LOCK } from "@/lib/nfl/rules";
import { CFB_LOCK } from "@/lib/cfb/rules";
import { stripComments } from "./helpers/source";

/**
 * THE SCHEDULER'S NFL SELF-FORWARD (2026-09-08, Josh: "2. NFL needs to be built NOW") — the
 * mirror of the forwardCfbLock / attachCfb cases in tests/scheduler-route.test.ts, on the NFL
 * rails. src/lib/server/nfl-lock-forward.ts is the sibling of cfb-lock-forward.ts: it POSTs
 * nothing, sends the same `x-cron-key` header the generate forward sends, aborts at
 * NFL_LOCK.forwardTimeoutMs, and NEVER throws — a thrown fetch, a non-JSON answer and a 5xx all
 * become a value under `nfl`. `attachNfl` copies the body and status it is handed through
 * untouched and adds ONE key, `nfl` — so the NFL desk can never change an MLB (or CFB) outcome.
 *
 * The concurrency of the two forwards and the scheduler's wiring are pinned in
 * tests/scheduler-route.test.ts (cases f/g/h); this file pins the helper alone.
 */

describe("src/lib/server/nfl-lock-forward.ts, comment-stripped — the NFL mirror of the CFB forward", () => {
  const fwd = stripComments(readFileSync("src/lib/server/nfl-lock-forward.ts", "utf8"));

  it("forwards to /api/nfl/lock with the cron header, aborts at NFL_LOCK.forwardTimeoutMs, and never names the sync header", () => {
    expect(fwd).toMatch(/"\/api\/nfl\/lock"/);
    expect(fwd).toMatch(/"x-cron-key": secret/);
    expect(fwd).toMatch(/AbortSignal\.timeout\(NFL_LOCK\.forwardTimeoutMs\)/);
    expect(fwd).toMatch(/cache: "no-store"/);
    expect(fwd).not.toMatch(/x-pl-sync/);
    // it reads the NFL knob, never the CFB one, and never points at the CFB path
    expect(fwd).toMatch(/from "@\/lib\/nfl\/rules"/);
    expect(fwd).not.toMatch(/CFB_LOCK/);
    expect(fwd).not.toMatch(/\/api\/cfb/);
    // the non-JSON marker names the NFL desk
    expect(fwd).toMatch(/"nfl lock returned non-JSON"/);
  });

  it("NFL_LOCK.forwardTimeoutMs is 25 s — the same abort as the CFB forward it runs beside", () => {
    expect(NFL_LOCK.forwardTimeoutMs).toBe(25_000);
    expect(NFL_LOCK.forwardTimeoutMs).toBe(CFB_LOCK.forwardTimeoutMs);
    // concurrent with the CFB forward: max(25 s, 25 s) + the ~60 s generate = 85 s under the 90 s budget
    expect(Math.max(CFB_LOCK.forwardTimeoutMs, NFL_LOCK.forwardTimeoutMs) + 60_000).toBe(85_000);
  });
});

describe("forwardNflLock reports the NFL answer and NEVER throws", () => {
  it("ok: the JSON body rides under result with the status; the request carries the header, no-store and an abort signal", async () => {
    const ok = await forwardNflLock("https://parlay.test", "s", async (u, init) => {
      expect(String(u)).toBe("https://parlay.test/api/nfl/lock");
      expect((init.headers as Record<string, string>)["x-cron-key"]).toBe("s");
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      // GET, nothing posted
      expect(init.method).toBeUndefined();
      expect(init.body).toBeUndefined();
      return new Response(JSON.stringify({ status: "locked", date: "2026-09-13", core: 7 }), { status: 200 });
    });
    expect(ok).toEqual({ forwarded: true, status: 200, result: { status: "locked", date: "2026-09-13", core: 7 } });
  });

  it("thrown: a fetch that throws becomes { forwarded: false, error }", async () => {
    const thrown = await forwardNflLock("https://parlay.test", "s", async () => {
      throw new Error("ECONNRESET");
    });
    expect(thrown).toEqual({ forwarded: false, error: "ECONNRESET" });
  });

  it("503 non-JSON: forwarded with the status and the NFL non-JSON marker", async () => {
    const refused = await forwardNflLock("https://parlay.test", "s", async () => new Response("nope", { status: 503 }));
    expect(refused).toEqual({ forwarded: true, status: 503, result: { error: "nfl lock returned non-JSON" } });
  });

  it("a 502 refusal (odds-missing) rides through with every diagnostic key", async () => {
    const REFUSAL = { status: "odds-missing", date: "2026-09-13", oddsMissing: true, pricedAhead: 0, ahead: 13, games: 13 };
    const r = await forwardNflLock("https://parlay.test", "s", async () => new Response(JSON.stringify(REFUSAL), { status: 502 }));
    expect(r).toEqual({ forwarded: true, status: 502, result: REFUSAL });
  });

  it("the origin is honoured — a different deployment URL forwards to ITS /api/nfl/lock", async () => {
    let seen = "";
    await forwardNflLock("https://preview-abc.vercel.app", "k", async (u) => {
      seen = String(u);
      return new Response("{}", { status: 200 });
    });
    expect(seen).toBe("https://preview-abc.vercel.app/api/nfl/lock");
  });
});

describe("attachNfl: the body and status ride through unchanged, `nfl` added", () => {
  const mlb = { fired: false, date: "2026-09-13", reason: "board-exists", lock: { present: true }, blocks: [] };

  it("on success and on a failed forward", async () => {
    const good = await attachNfl(NextResponse.json(mlb, { status: 200 }), { forwarded: true, status: 200, result: { status: "waiting" } });
    expect(good).toEqual({ status: 200, body: { ...mlb, nfl: { forwarded: true, status: 200, result: { status: "waiting" } } } });

    const failed = await attachNfl(NextResponse.json(mlb, { status: 200 }), { forwarded: false, error: "The operation was aborted due to timeout" });
    expect(failed?.status).toBe(200);
    expect(failed?.body).toEqual({ ...mlb, nfl: { forwarded: false, error: "The operation was aborted due to timeout" } });
    // every MLB field is byte-identical to what the tick produced
    const { nfl: _nfl, ...rest } = failed!.body;
    expect(rest).toEqual(mlb);
    expect(JSON.stringify(rest)).toBe(JSON.stringify(mlb));
  });

  it("stacks after attachCfb: `cfb` is kept and `nfl` is appended, in that order, the status untouched", async () => {
    const withCfb = { ...mlb, cfb: { forwarded: true, status: 200, result: { status: "locked", core: 5 } } };
    const out = await attachNfl(NextResponse.json(withCfb, { status: 503 }), { forwarded: true, status: 502, result: { status: "odds-missing" } });
    expect(out?.status).toBe(503);
    expect(Object.keys(out!.body).filter((k) => !(k in mlb))).toEqual(["cfb", "nfl"]);
    expect(out!.body.cfb).toEqual({ forwarded: true, status: 200, result: { status: "locked", core: 5 } });
    expect(out!.body.nfl).toEqual({ forwarded: true, status: 502, result: { status: "odds-missing" } });
  });

  it("a non-object body (never, from NextResponse.json) is left alone rather than risk the answer", async () => {
    expect(await attachNfl(new Response("not json", { status: 200 }), { forwarded: false, error: "x" })).toBeNull();
    expect(await attachNfl(NextResponse.json([1, 2, 3], { status: 200 }), { forwarded: false, error: "x" })).toBeNull();
    expect(await attachNfl(NextResponse.json(null, { status: 200 }), { forwarded: false, error: "x" })).toBeNull();
  });
});
