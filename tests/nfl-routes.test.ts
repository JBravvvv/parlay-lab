import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { finalsOf } from "@/lib/cfb/slate-server";
import { NFL_BANK_BASE, NFL_LEAGUE, NFL_REDIS } from "@/lib/nfl/rules";
import type { CfbSlate } from "@/lib/cfb/types";

/**
 * THE NFL SLATE + LEDGER ROUTES (2026-09-08, the NFL build) — the mirror of tests/cfb-route.test.ts's
 * slate and ledger sections against app/api/nfl/route.ts and app/api/nfl/ledger/route.ts, on the
 * comment-stripped source so a comment about a rule can never satisfy the rule, plus behaviour:
 *
 *   /api/nfl          — Pacific date basis (ptToday), force-dynamic, no-store, builds ONLY through
 *                       the shared slate helper run on NFL_LEAGUE (`espnEventsOf(NFL_LEAGUE, date)`,
 *                       `slateFromEspnOf(NFL_LEAGUE, …)`, `finalsFromEspnOf(NFL_LEAGUE, …)`), finals
 *                       mode returns before the slate call, no fetch and no key of its own; with the
 *                       helper mocked over the REAL 2026-09-13 ESPN fixture (week 1, 13 games) and the
 *                       SYNTHESIZED odds fixture, GET answers 13 games.
 *   /api/nfl/ledger   — the same gate as the CFB route, the NFL blobs by their pinned literals,
 *                       validate → merge server-side, 413 over MAX_BYTES, every entry sport "nfl";
 *                       a PUT carrying a `sport: "cfb"` entry is refused 400 and nothing is written.
 */

vi.mock("@/lib/server/store", () => ({
  redis: vi.fn(),
  redisGetJson: vi.fn(),
  redisSetJson: vi.fn(),
  storeEnv: vi.fn(),
  syncAuthed: vi.fn(),
  syncConfigMissing: vi.fn(),
}));
vi.mock("@/lib/cfb/slate-server", async (orig) => {
  const real = await orig<typeof import("@/lib/cfb/slate-server")>();
  return { ...real, espnEventsOf: vi.fn(), slateFromEspnOf: vi.fn(), finalsFromEspnOf: vi.fn() };
});

import { redis, redisGetJson, redisSetJson, syncAuthed, syncConfigMissing } from "@/lib/server/store";
import { espnEventsOf, finalsFromEspnOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import { GET as slateGet } from "../app/api/nfl/route";
import { GET as ledgerGet, PUT as ledgerPut } from "../app/api/nfl/ledger/route";

const root = path.join(__dirname, "..");
const read = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const FIX = path.join(root, "tests", "fixtures", "nfl");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-13.json") as { events: unknown[] };
const ODDS = readJson("odds-2026-09-13.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const DATE = "2026-09-13";
const NOW = Date.parse("2026-09-13T12:00:00Z"); // 05:00 PT — every week-1 Sunday kickoff is still ahead

function slate(): CfbSlate {
  const board = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: NFL_BANK_BASE, league: NFL_LEAGUE });
  return { ...board, finals: finalsOf(board.games), quota: { remaining: 9000, used: 1000 }, oddsMissing: false };
}

describe("app/api/nfl/route.ts — the slate feed (source pins)", () => {
  const src = read("app/api/nfl/route.ts");

  it("derives its date from the shared Pacific helper", () => {
    expect(src).toMatch(/ptToday\(/);
    expect(src).toMatch(/from "@\/lib\/server\/pt-date"/);
    expect(src).not.toMatch(/new Date\([^)]*\)\.toISOString\(\)\.slice\(0, ?10\)/);
    expect(src).not.toMatch(/timeZone: ?"America\/Los_Angeles"/);
  });

  it("is force-dynamic, never cached by the browser, and exports only route config", () => {
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).toMatch(/"cache-control": "no-store"/);
    expect(src.match(/^export const /gm)).toEqual(["export const "]);
  });

  it("builds through the shared slate helper on NFL_LEAGUE only — no fetch of its own, no key", () => {
    expect(src).toMatch(/from "@\/lib\/cfb\/slate-server"/);
    expect(src).toMatch(/espnEventsOf\(NFL_LEAGUE, date\)/);
    expect(src).toMatch(/finalsFromEspnOf\(NFL_LEAGUE, /);
    expect(src).toMatch(/slateFromEspnOf\(NFL_LEAGUE, /);
    expect(src).not.toMatch(/\bespnEvents\(/);
    expect(src).not.toMatch(/\bslateFromEspn\(/);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/ODDS_API_KEY/);
    expect(src).not.toMatch(/status: 500/);
  });

  it("forwards the quota as body and headers", () => {
    expect(src).toMatch(/x-requests-remaining/);
    expect(src).toMatch(/x-requests-used/);
    expect(src).toMatch(/quota/);
  });

  it("validates the date and mode, and defaults the bankroll to NFL_BANK_BASE", () => {
    expect(src).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
    expect(src).toMatch(/status: 400/);
    expect(src).toMatch(/mode === "finals"/);
    expect(src).toMatch(/NFL_BANK_BASE/);
    expect(src).not.toMatch(/CFB_BANK_BASE/);
  });

  it("finals mode returns before the slate (odds) call", () => {
    const finalsBranch = src.indexOf('mode === "finals"');
    const slateCall = src.lastIndexOf("slateFromEspnOf(");
    expect(finalsBranch).toBeGreaterThan(0);
    expect(slateCall).toBeGreaterThan(finalsBranch);
  });
});

describe("app/api/nfl/route.ts — behaviour over the week-1 fixtures (slate helper mocked)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(espnEventsOf).mockReset().mockResolvedValue(ESPN.events);
    vi.mocked(slateFromEspnOf).mockReset().mockResolvedValue(slate());
    vi.mocked(finalsFromEspnOf).mockReset().mockImplementation((cfg, date, espn, now, bankroll) => {
      const board = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll, league: cfg });
      return { date, finals: finalsOf(board.games) };
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("GET /api/nfl?date=2026-09-13 answers the 13 week-1 games through NFL_LEAGUE, no-store, quota forwarded", async () => {
    expect(ESPN.events).toHaveLength(13);
    const res = await slateGet(new NextRequest(`http://localhost/api/nfl?date=${DATE}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CfbSlate;
    expect(body.date).toBe(DATE);
    expect(body.games).toHaveLength(13);
    expect(body.games.map((g) => g.id)).toContain("401872925"); // TB @ CIN
    expect(body.oddsMissing).toBe(false);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-requests-remaining")).toBe("9000");
    expect(res.headers.get("x-requests-used")).toBe("1000");
    // the helpers were asked for the NFL league, by reference, with the default NFL bankroll
    expect(vi.mocked(espnEventsOf)).toHaveBeenCalledWith(NFL_LEAGUE, DATE);
    const [cfg, date, espn, now, bankroll] = vi.mocked(slateFromEspnOf).mock.calls[0];
    expect(cfg).toBe(NFL_LEAGUE);
    expect(date).toBe(DATE);
    expect(espn).toBe(ESPN.events);
    expect(now).toBe(NOW);
    expect(bankroll).toBe(NFL_BANK_BASE);
  });

  it("mode=finals answers scores only through finalsFromEspnOf(NFL_LEAGUE, …) and never reaches the slate helper", async () => {
    const res = await slateGet(new NextRequest(`http://localhost/api/nfl?date=${DATE}&mode=finals`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; finals: Record<string, unknown> };
    expect(body.date).toBe(DATE);
    expect(Object.keys(body.finals)).toHaveLength(13);
    expect(vi.mocked(finalsFromEspnOf).mock.calls[0][0]).toBe(NFL_LEAGUE);
    expect(vi.mocked(slateFromEspnOf)).not.toHaveBeenCalled();
  });

  it("a bad date or mode is 400; an ESPN outage is 502, never 500", async () => {
    expect((await slateGet(new NextRequest("http://localhost/api/nfl?date=13-09-2026"))).status).toBe(400);
    expect((await slateGet(new NextRequest(`http://localhost/api/nfl?date=${DATE}&mode=lines`))).status).toBe(400);
    vi.mocked(espnEventsOf).mockRejectedValue(new Error("espn scoreboard 503"));
    const res = await slateGet(new NextRequest(`http://localhost/api/nfl?date=${DATE}`));
    expect(res.status).toBe(502);
    expect(vi.mocked(slateFromEspnOf)).not.toHaveBeenCalled();
  });
});

describe("app/api/nfl/ledger/route.ts — the NFL cloud record (source pins)", () => {
  const src = read("app/api/nfl/ledger/route.ts");

  it("shares the gate: config check then timing-safe phrase check", () => {
    expect(src).toMatch(/syncConfigMissing\(/);
    expect(src).toMatch(/syncAuthed\(/);
    expect(src).toMatch(/sync-not-configured/);
    expect(src).toMatch(/bad-sync-key/);
    expect(src).toMatch(/status: 503/);
    expect(src).toMatch(/status: 401/);
    expect(src.indexOf("sync-not-configured")).toBeLessThan(src.indexOf("bad-sync-key"));
  });

  it("stores under the NFL blobs by their pinned literals (and they equal NFL_REDIS)", () => {
    expect(src).toMatch(/"pl:nfl:ledger:v1"/);
    expect(src).toMatch(/"pl:nfl:bank:v1"/);
    expect(NFL_REDIS.ledger).toBe("pl:nfl:ledger:v1");
    expect(NFL_REDIS.bank).toBe("pl:nfl:bank:v1");
  });

  it("never touches the MLB or CFB blobs or the epoch machinery", () => {
    expect(src).not.toMatch(/pl:ledger:v1/);
    expect(src).not.toMatch(/pl:bank:v1/);
    expect(src).not.toMatch(/pl:noplay/);
    expect(src).not.toMatch(/pl:cfb/);
    expect(src).not.toMatch(/epoch/i);
  });

  it("validates, merges server-side, caps size, requires sport nfl on every entry, exports only route config", () => {
    expect(src).toMatch(/validateLedger\(/);
    expect(src).toMatch(/validateBankStore\(/);
    expect(src).toMatch(/mergeLedgers\(/);
    expect(src).toMatch(/mergeBankStores\(/);
    expect(src).toMatch(/MAX_BYTES/);
    expect(src).toMatch(/status: 413/);
    expect(src).toMatch(/sport !== "nfl"/);
    expect(src).not.toMatch(/sport !== "cfb"/);
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src.match(/^export const /gm)).toEqual(["export const "]);
  });
});

describe("app/api/nfl/ledger/route.ts — behaviour (store mocked)", () => {
  const authed = (body?: unknown) =>
    new NextRequest("http://localhost/api/nfl/ledger", body === undefined ? { method: "GET" } : { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const entry = (sport: string, date = DATE) => ({ date, locked: true, sport, core: [{ id: `${sport}-${date}-core-1`, stake: 50 }], funT: [], daily: 350, fun: 25 });

  beforeEach(() => {
    vi.mocked(redis).mockReset();
    vi.mocked(redisGetJson).mockReset().mockResolvedValue(null);
    vi.mocked(redisSetJson).mockReset().mockResolvedValue(undefined);
    vi.mocked(syncConfigMissing).mockReset().mockReturnValue([]);
    vi.mocked(syncAuthed).mockReset().mockReturnValue(true);
    vi.mocked(redis).mockResolvedValue(null);
  });

  it("gate order: missing config → 503 sync-not-configured before the phrase; bad phrase → 401", async () => {
    vi.mocked(syncConfigMissing).mockReturnValue(["UPSTASH_REDIS_REST_URL"]);
    vi.mocked(syncAuthed).mockReturnValue(false);
    const r1 = await ledgerGet(authed());
    expect(r1.status).toBe(503);
    expect((await r1.json()).error).toBe("sync-not-configured");
    vi.mocked(syncConfigMissing).mockReturnValue([]);
    const r2 = await ledgerGet(authed());
    expect(r2.status).toBe(401);
    expect((await r2.json()).error).toBe("bad-sync-key");
    expect(vi.mocked(redis)).not.toHaveBeenCalled();
  });

  it("GET reads the NFL ledger blob only", async () => {
    const res = await ledgerGet(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ledger: [], bank: null, at: null });
    expect(vi.mocked(redis)).toHaveBeenCalledWith(["GET", "pl:nfl:ledger:v1"]);
    expect(vi.mocked(redisGetJson)).toHaveBeenCalledWith("pl:nfl:bank:v1");
  });

  it("PUT of a sport 'cfb' entry is refused 400 and nothing is written", async () => {
    const res = await ledgerPut(authed({ ledger: [entry("cfb")] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sport must be "nfl"/);
    expect(vi.mocked(redis).mock.calls.filter((c) => c[0][0] === "SET")).toHaveLength(0);
    expect(vi.mocked(redisSetJson)).not.toHaveBeenCalled();
  });

  it("PUT of an MLB-shaped entry (no sport) is refused the same way", async () => {
    const { sport: _drop, ...mlbShaped } = entry("mlb");
    void _drop;
    const res = await ledgerPut(authed({ ledger: [mlbShaped] }));
    expect(res.status).toBe(400);
    expect(vi.mocked(redisSetJson)).not.toHaveBeenCalled();
  });

  it("PUT of a sport 'nfl' entry merges into the NFL blob under the pinned key", async () => {
    const res = await ledgerPut(authed({ ledger: [entry("nfl")] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ledger: { date: string; sport: string }[] };
    expect(body.ok).toBe(true);
    expect(body.ledger.map((e) => [e.date, e.sport])).toEqual([[DATE, "nfl"]]);
    const sets = vi.mocked(redis).mock.calls.filter((c) => c[0][0] === "SET");
    expect(sets).toHaveLength(1);
    expect(sets[0][0][1]).toBe("pl:nfl:ledger:v1");
    expect(String(sets[0][0][2])).toContain('"sport":"nfl"');
  });
});
