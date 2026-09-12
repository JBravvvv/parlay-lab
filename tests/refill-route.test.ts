import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";

/**
 * POST /api/refill (INSTRUCTION 49, 2026-09-09) — Josh's Refresh pill runs the SAME server pass the
 * five refill slots run, with slot "manual". It spends credits, so it is a POST behind the sync
 * phrase; the cron secret is forwarded server-side in x-cron-key and never leaves the server in a
 * URL or a body. Fails closed: 503 before anything when CRON_SECRET or the store is unset.
 */
vi.mock("@/lib/server/store", async (orig) => {
  const real = await orig<typeof import("@/lib/server/store")>();
  return { ...real, storeEnv: vi.fn() }; // syncAuthed stays REAL — the phrase gate is the thing under test
});
vi.mock("@/lib/server/refill", () => ({
  readMlbDay: vi.fn(),
  decideMlbRefill: vi.fn(),
  forwardMlbRefill: vi.fn(),
  /* INSTRUCTION 51 fix pass (2026-09-11): the Refresh pill now also pokes the live in-play pull.
     It has to be in the mock factory — the route imports it at module load, and an undefined
     import made every ?desk=mlb answer a 502 (which is how this amendment was found). */
  forwardMlbLivePull: vi.fn(),
}));

import { storeEnv } from "@/lib/server/store";
import { decideMlbRefill, forwardMlbLivePull, forwardMlbRefill, readMlbDay } from "@/lib/server/refill";
import { POST } from "../app/api/refill/route";

const SECRET = "cron-secret-for-this-test-only";
const PHRASE = "josh-sync-phrase-for-this-test-only";

const post = async (qs: string, headers: Record<string, string> = { "x-pl-sync": PHRASE }) => {
  const res = await POST(new NextRequest(`https://parlay.test/api/refill${qs}`, { method: "POST", headers }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("POST /api/refill — the gate, in order: 503 (env) → 401 (phrase) → 400 (desk)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-09-05T18:27:00Z"), toFake: ["Date"] });
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("LEDGER_SYNC_KEY", PHRASE);
    vi.mocked(storeEnv).mockReset().mockReturnValue({ url: "https://store.test", token: "t" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "already-locked", topUp: { action: "skipped" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(readMlbDay).mockReset();
    vi.mocked(decideMlbRefill).mockReset();
    vi.mocked(forwardMlbRefill).mockReset();
    vi.mocked(forwardMlbLivePull).mockReset().mockResolvedValue({ status: 200, note: "2 live games re-priced" } as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("no x-pl-sync → 401 sync phrase required; nothing fetched", async () => {
    const { status, body } = await post("?desk=cfb", {});
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: "sync phrase required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the wrong phrase → 401 too", async () => {
    const { status } = await post("?desk=cfb", { "x-pl-sync": "not-the-phrase" });
    expect(status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CRON_SECRET unset → 503 refill unavailable, before the phrase is even read; the env is never echoed", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { status, body } = await post("?desk=cfb");
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, error: "refill unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("store env unset → 503 refill unavailable", async () => {
    vi.mocked(storeEnv).mockReturnValue(null);
    const { status, body } = await post("?desk=cfb");
    expect(status).toBe(503);
    expect(body.error).toBe("refill unavailable");
  });

  it("?desk=nhl → 400; no desk → 400", async () => {
    expect((await post("?desk=nhl")).status).toBe(400);
    const none = await post("");
    expect(none.status).toBe(400);
    expect(none.body).toEqual({ ok: false, error: "desk must be mlb|cfb|nfl" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("?desk=cfb: forwards to /api/cfb/lock?date=<PT today>&manual=1 with x-cron-key = the secret; the secret is nowhere in the answer", async () => {
    const { status, body } = await post("?desk=cfb");
    expect(status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
    expect(String(url)).toMatch(/\/api\/cfb\/lock\?date=\d{4}-\d{2}-\d{2}&manual=1$/);
    expect(String(url)).toMatch(/^https:\/\/parlay\.test\//);
    expect((init.headers as Record<string, string>)["x-cron-key"]).toBe(SECRET);
    expect(init.cache).toBe("no-store");
    expect(String(url)).not.toContain(SECRET);
    expect(body).toMatchObject({ ok: true, desk: "cfb", trigger: "manual", slot: "manual", at: "2026-09-05T18:27:00.000Z", status: 200 });
    expect(body.result).toEqual({ status: "already-locked", topUp: { action: "skipped" } });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("a forward that REJECTS answers 502 JSON with the message — never Next's HTML 500 — and the secret is absent (fix round 2026-09-09)", async () => {
    fetchMock.mockRejectedValueOnce(new Error(`fetch failed: ${SECRET} unreachable`));
    const { status, body } = await post("?desk=cfb");
    expect(status).toBe(502);
    expect(body).toMatchObject({ ok: false, desk: "cfb", trigger: "manual", slot: "manual" });
    expect(String(body.error)).toMatch(/fetch failed/);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    // the MLB forward too
    vi.mocked(readMlbDay).mockResolvedValue({ lockEntry: { paper: true }, blocksArr: [], reg: {}, starts: [] } as never);
    vi.mocked(decideMlbRefill).mockReturnValue({ fire: true, reason: "day short $90", owed: 90, used: 1 } as never);
    vi.mocked(forwardMlbRefill).mockRejectedValueOnce(new Error("aborted"));
    const mlb = await post("?desk=mlb");
    expect(mlb.status).toBe(502);
    expect(mlb.body).toMatchObject({ ok: false, desk: "mlb", error: "aborted" });
  });

  it("?desk=nfl: the NFL lock route, same shape", async () => {
    const { status, body } = await post("?desk=nfl");
    expect(status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/nfl\/lock\?date=\d{4}-\d{2}-\d{2}&manual=1$/);
    expect(body).toMatchObject({ ok: true, desk: "nfl", trigger: "manual", slot: "manual" });
  });

  it("?desk=mlb: the free decision first — a refusal answers fired:false and forwards NOTHING", async () => {
    vi.mocked(readMlbDay).mockResolvedValue({ lockEntry: null, blocksArr: [], reg: {}, starts: [] } as never);
    vi.mocked(decideMlbRefill).mockReturnValue({ fire: false, reason: "no paper lock for the date yet — block fires come first", owed: 0, used: 0 } as never);
    const { status, body } = await post("?desk=mlb");
    expect(status).toBe(200);
    expect(vi.mocked(decideMlbRefill).mock.calls[0]![0]).toMatchObject({ slot: "manual" });
    expect(body).toMatchObject({ ok: true, desk: "mlb", trigger: "manual", slot: "manual", fired: false });
    expect((body.topup as { reason: string }).reason).toMatch(/no paper lock/);
    expect(forwardMlbRefill).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    /* INSTRUCTION 51 fix pass — THE LIVE PULL IS NOT GATED ON THE TOP-UP DECISION. Josh's
       complaint is a price, not a ticket: "it will show the player is top 4th w/ 3 H+R+RBI, but
       show them as an 'S' grade for over .5 H+R+RBI". The top-up refuses for free most of the day,
       so behind it a tap could never re-price a line. It rides beside, reported under `live`. */
    expect(forwardMlbLivePull).toHaveBeenCalledWith({ origin: "https://parlay.test", secret: SECRET, slot: "manual", manual: true });
    expect(body.live).toMatchObject({ status: 200, note: "2 live games re-priced" });
  });

  it("?desk=mlb: a fire forwards through forwardMlbRefill with slot manual and the secret, and reports the generate answer", async () => {
    vi.mocked(readMlbDay).mockResolvedValue({ lockEntry: { paper: true }, blocksArr: [], reg: {}, starts: [] } as never);
    vi.mocked(decideMlbRefill).mockReturnValue({ fire: true, reason: "day short $90 with no pending block and pregame games remaining", owed: 90, used: 1 } as never);
    vi.mocked(forwardMlbRefill).mockResolvedValue({ generateStatus: 200, generate: { ok: true, topup: true } });
    const { status, body } = await post("?desk=mlb");
    expect(status).toBe(200);
    expect(forwardMlbRefill).toHaveBeenCalledWith({ origin: "https://parlay.test", secret: SECRET, slot: "manual" });
    expect(body).toMatchObject({ ok: true, desk: "mlb", trigger: "manual", slot: "manual", fired: true, generateStatus: 200, generate: { ok: true, topup: true } });
    expect(forwardMlbLivePull).toHaveBeenCalledWith({ origin: "https://parlay.test", secret: SECRET, slot: "manual", manual: true });
    expect(body.live).toMatchObject({ status: 200 });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("?desk=mlb: manual:true is what makes the live pull skip its own slot de-duplication", async () => {
    /* The route stamps `slot` under NX so a double cron poke cannot buy the same prices twice
       (src/lib/server/mlb-live-quote.ts RAIL 1b). A hand tap must NOT be swallowed by that stamp —
       manual=1 is the one flag that bypasses it — so this is pinned separately from the call above. */
    vi.mocked(readMlbDay).mockResolvedValue({ lockEntry: null, blocksArr: [], reg: {}, starts: [] } as never);
    vi.mocked(decideMlbRefill).mockReturnValue({ fire: false, reason: "fully deployed", owed: 0, used: 0 } as never);
    await post("?desk=mlb");
    expect(vi.mocked(forwardMlbLivePull).mock.calls[0]![0]).toMatchObject({ slot: "manual", manual: true });
  });

  it("?desk=mlb: a live pull that fails does NOT speak for the refill — the top-up answer still lands", async () => {
    /* forwardMlbLivePull is total by construction (src/lib/server/refill.ts) — it resolves a
       {status,error} shape instead of throwing — so a dead live pull can never turn a successful
       top-up into the 502 that the catch below produces. */
    vi.mocked(forwardMlbLivePull).mockResolvedValue({ status: 0, error: "aborted" } as never);
    vi.mocked(readMlbDay).mockResolvedValue({ lockEntry: { paper: true }, blocksArr: [], reg: {}, starts: [] } as never);
    vi.mocked(decideMlbRefill).mockReturnValue({ fire: true, reason: "day short $90", owed: 90, used: 1 } as never);
    vi.mocked(forwardMlbRefill).mockResolvedValue({ generateStatus: 200, generate: { ok: true, topup: true } });
    const { status, body } = await post("?desk=mlb");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, fired: true, generateStatus: 200, live: { status: 0, error: "aborted" } });
  });
});

describe("the route file, comment-stripped", () => {
  const src = stripComments(readFileSync("app/api/refill/route.ts", "utf8"));
  it("POST only; the secret never rides a query string; runtime/dynamic/maxDuration declared", () => {
    expect(src).toMatch(/export async function POST/);
    expect(src).not.toMatch(/export async function GET/);
    expect(src).not.toMatch(/export function GET/);
    expect(src).not.toMatch(/searchParams\.get\("key"\)/);
    expect(src).toMatch(/syncAuthed\(/);
    expect(src).toMatch(/"x-cron-key": secret/);
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).toMatch(/export const maxDuration = 300/);
    // fails closed, before the phrase: env unset → 503
    expect(src.indexOf("503")).toBeLessThan(src.indexOf("syncAuthed(req)"));
    expect(src).not.toMatch(/return !cron/);
  });
  it("never names an MLB ledger literal — the desk keys stay in their own routes", () => {
    for (const lit of ["pl_ledger", "pl:ledger:v1", "baseball_mlb"]) expect(src).not.toContain(lit);
  });
});
