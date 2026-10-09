import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * BET ALERTS + TAKEN FEED (2026-10-09). Josh, verbatim in src/lib/bet-alert.ts: "send me a push notification every
 * time it adds a new + EV bet to the card ... Parlay Lab: NFL / Justin Jefferson Anytime TD +105 ($730)" and "a
 * notification page/tab/scroll ... from most recent ... to oldest".
 *
 * The store is an in-memory stand-in (GET/SET NX PX EX/DEL/MGET); the push transport is an injected fake. No
 * network, no real phrase ("test-phrase"), no real keys.
 */

const mem = new Map<string, string>();
async function fakeRedis(cmd: unknown[]): Promise<unknown> {
  const [op, ...a] = cmd as [string, ...string[]];
  if (op === "GET") return mem.get(a[0]) ?? null;
  if (op === "MGET") return a.map((k) => mem.get(k) ?? null);
  if (op === "DEL") return mem.delete(a[0]) ? 1 : 0;
  if (op === "SET") {
    if (a.includes("NX") && mem.has(a[0])) return null;
    mem.set(a[0], a[1]);
    return "OK";
  }
  throw new Error(`fake redis: ${op}`);
}
vi.mock("@/lib/server/store", () => ({
  redis: vi.fn((c: unknown[]) => fakeRedis(c)),
  redisGetJson: vi.fn(async (k: string) => (mem.has(k) ? JSON.parse(mem.get(k) as string) : null)),
  redisSetJson: vi.fn(async (k: string, v: unknown) => void mem.set(k, JSON.stringify(v))),
  storeEnv: vi.fn(() => ({ url: "x", token: "y" })),
  syncAuthed: vi.fn((req: NextRequest) => req.headers.get("x-pl-sync") === "test-phrase"),
}));

import { alertBody, alertTitle, relTime, sortTaken, takenRowsOf, type AlertEntry, type AlertTicket } from "@/lib/bet-alert";
import { MAX_ATTEMPTS, PUSH_SINCE, SUBS_KEY, notifyNewBets, recordKey, type Sender } from "@/lib/server/push";
import { GET as takenGet } from "../app/api/taken/route";

const NOW = PUSH_SINCE + 10 * 3600_000; // 2026-10-09 10:00 PT
const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" }, addedAt: 0 };

/* PRODUCTION-DERIVED: these two tickets are copied field for field from the public /api/board card of
   2026-10-05 (read 2026-10-09), and the ML leg from the armed fixture's found card */
const hits: AlertTicket = { id: "batter_hits_ieydqg", stake: 233, legs: [{ label: "Richie Palacios (TB)", prop: "Hits O 0.5", cz: 112 }] };
const ks: AlertTicket = { id: "pitcher_strikeouts_13n647u", stake: 73, legs: [{ label: "Gavin Williams (CLE)", prop: "Pitcher K's O 7.5", cz: -106 }] };
const ml: AlertTicket = { id: "ml_hcudgi", stake: 800, czDec: 1.83, legs: [{ label: "Miami Marlins", prop: "ML vs Cleveland Guardians", cz: -120 }] };

function mlbLedger(tickets: AlertTicket[], date = "2026-10-09"): string {
  return JSON.stringify({ ledger: [{ date, locked: true, lockedAt: NOW - 3600_000, core: tickets }] });
}
const found = (t: AlertTicket, foundAt: number): AlertTicket => ({ ...t, found: true, foundAt });

beforeEach(() => {
  mem.clear();
  mem.set(SUBS_KEY, JSON.stringify([SUB]));
});

describe("the alert line — Josh's format", () => {
  it("matches his example byte for byte and says MLB props his way", () => {
    expect(alertTitle("nfl")).toBe("Parlay Lab: NFL");
    expect(alertTitle("mlb")).toBe("Parlay Lab: MLB");
    expect(alertBody({ stake: 730, legs: [{ label: "Justin Jefferson Anytime TD", prop: "Anytime TD", cz: 105 }] })).toBe("Justin Jefferson Anytime TD +105 ($730)");
    expect(alertBody(hits)).toBe("Richie Palacios Hits over .5 +112 ($233)");
    expect(alertBody(ks)).toBe("Gavin Williams Pitcher K's over 7.5 -106 ($73)");
    expect(alertBody(ml)).toBe("Miami Marlins ML vs Cleveland Guardians -120 ($800)");
    expect(alertBody({ stake: 50, legs: [{ label: "Justin Jefferson O 74.5 Rec Yds", prop: "Receiving Yards", cz: -110 }] })).toBe("Justin Jefferson Rec Yds over 74.5 -110 ($50)");
    expect(alertBody({ stake: 40, legs: [{ label: "Indiana -3.5", prop: "Spread", cz: -105 }] })).toBe("Indiana -3.5 -105 ($40)");
  });
  it("an older multi-leg ticket reads as N-leg in the feed", () => {
    const t: AlertTicket = { stake: 40, czDec: 5.12, legs: [{ label: "A (NYY)", prop: "Hits O 0.5", cz: -150 }, { label: "B", prop: "ML vs C", cz: 120 }] };
    expect(alertBody(t)).toBe("2-leg: A Hits over .5 / B ML vs C +412 ($40)");
  });
});

describe("one alert per locked bet", () => {
  it("a lock produces exactly one alert per new bet, in lock order, and a re-run sends nothing", async () => {
    mem.set("pl:ledger:v1", mlbLedger([found(hits, NOW - 60_000), found(ks, NOW - 60_000)]));
    const sent: string[] = [];
    const send: Sender = async (_s, p) => (sent.push(p), { statusCode: 201 });
    const [r1] = await notifyNewBets(["mlb"], NOW, send);
    expect(r1.sent).toBe(2);
    expect(sent.map((p) => JSON.parse(p))).toEqual([
      { title: "Parlay Lab: MLB", body: "Richie Palacios Hits over .5 +112 ($233)", url: "/taken", tag: "mlb:2026-10-09:batter_hits_ieydqg" },
      { title: "Parlay Lab: MLB", body: "Gavin Williams Pitcher K's over 7.5 -106 ($73)", url: "/taken", tag: "mlb:2026-10-09:pitcher_strikeouts_13n647u" },
    ]);
    const [r2] = await notifyNewBets(["mlb"], NOW + 5000, send);
    expect(r2.sent).toBe(0);
    expect(sent).toHaveLength(2);
    /* a later pass appends one more bet: only that one alerts */
    mem.set("pl:ledger:v1", mlbLedger([found(hits, NOW - 60_000), found(ks, NOW - 60_000), found(ml, NOW + 9000)]));
    const [r3] = await notifyNewBets(["mlb"], NOW + 10_000, send);
    expect(r3.sent).toBe(1);
    expect(JSON.parse(sent[2]).body).toBe("Miami Marlins ML vs Cleveland Guardians -120 ($800)");
  });

  it("only found bets from today's window alert: no pre-found tickets, nothing before the ship, nothing stale", async () => {
    mem.set("pl:ledger:v1", mlbLedger([hits, found(ks, PUSH_SINCE - 1), found(ml, NOW - 13 * 3600_000)]));
    const send = vi.fn<Sender>(async () => ({ statusCode: 201 }));
    const [r] = await notifyNewBets(["mlb"], NOW, send);
    expect(r.candidates).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("a failed send never touches the lock, is recorded, retries on the next poke, and stops after the cap", async () => {
    const ledger = mlbLedger([found(hits, NOW - 60_000)]);
    mem.set("pl:ledger:v1", ledger);
    const boom: Sender = async () => { throw Object.assign(new Error("push service down"), { statusCode: 503 }); };
    const [r1] = await notifyNewBets(["mlb"], NOW, boom);
    expect(r1.failed).toBe(1);
    expect(mem.get("pl:ledger:v1")).toBe(ledger);
    expect(JSON.parse(mem.get(recordKey("mlb:2026-10-09:batter_hits_ieydqg")) as string)).toMatchObject({ status: "failed", attempts: 1 });
    const ok = vi.fn<Sender>(async () => ({ statusCode: 201 }));
    const [r2] = await notifyNewBets(["mlb"], NOW + 60_000, ok);
    expect(r2.sent).toBe(1);
    expect(ok).toHaveBeenCalledTimes(1);

    mem.set("pl:ledger:v1", mlbLedger([found(ks, NOW - 60_000)]));
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await notifyNewBets(["mlb"], NOW + 120_000 + i, boom);
    expect(JSON.parse(mem.get(recordKey("mlb:2026-10-09:pitcher_strikeouts_13n647u")) as string)).toMatchObject({ status: "gave-up", attempts: MAX_ATTEMPTS });
  });

  it("a bet locked with no phone subscribed is closed out, so turning alerts on later replays nothing", async () => {
    mem.set(SUBS_KEY, JSON.stringify([]));
    mem.set("pl:ledger:v1", mlbLedger([found(hits, NOW - 60_000)]));
    const send = vi.fn<Sender>(async () => ({ statusCode: 201 }));
    await notifyNewBets(["mlb"], NOW, send);
    mem.set(SUBS_KEY, JSON.stringify([SUB]));
    const [r] = await notifyNewBets(["mlb"], NOW + 60_000, send);
    expect(r.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("an expired phone subscription (410) is dropped from the store", async () => {
    mem.set("pl:ledger:v1", mlbLedger([found(hits, NOW - 60_000)]));
    const gone: Sender = async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); };
    await notifyNewBets(["mlb"], NOW, gone);
    expect(JSON.parse(mem.get(SUBS_KEY) as string)).toEqual([]);
  });

  it("never throws — an unreachable store is reported, not raised", async () => {
    mem.set("pl:ledger:v1", "{not json");
    await expect(notifyNewBets(["mlb"], NOW, async () => ({ statusCode: 201 }))).resolves.toMatchObject([{ sport: "mlb", error: expect.any(String) }]);
  });
});

describe("the Taken feed", () => {
  const nfl: AlertTicket = { id: "nfl-2026-10-09-found-1", stake: 730, found: true, foundAt: NOW - 30_000, legs: [{ label: "Justin Jefferson Anytime TD", prop: "Anytime TD", cz: 105, gkey: "401" }] };
  const old: AlertEntry = { date: "2026-09-20", locked: true, lockedAt: NOW - 19 * 86400_000, core: [{ id: "old-1", stake: 20, legs: [{ label: "X", prop: "ML vs Y", cz: 110 }] }], grading: { tickets: { "old-1": { result: "won", payout: 42 } } } };

  it("lists every locked bet newest first, from the lock records — a bet whose alert failed is still there", async () => {
    mem.set("pl:ledger:v1", JSON.stringify({ ledger: [old, { date: "2026-10-09", locked: true, lockedAt: NOW - 3600_000, core: [found(hits, NOW - 3 * 3600_000), found(ks, NOW - 300_000)] }] }));
    mem.set("pl:nfl:ledger:v1", JSON.stringify({ ledger: [{ date: "2026-10-09", locked: true, lockedAt: NOW, core: [nfl] }] }));
    mem.set(recordKey("mlb:2026-10-09:pitcher_strikeouts_13n647u"), JSON.stringify({ status: "failed", at: NOW, attempts: 1 }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const res = await takenGet(new NextRequest("https://x.test/api/taken", { headers: { "x-pl-sync": "test-phrase" } }));
      const j = (await res.json()) as { rows: Array<{ text: string; at: number; status: string; alert: string | null; title: string }> };
      expect(j.rows.map((r) => r.text)).toEqual([
        "Justin Jefferson Anytime TD +105 ($730)",
        "Gavin Williams Pitcher K's over 7.5 -106 ($73)",
        "Richie Palacios Hits over .5 +112 ($233)",
        "X ML vs Y +110 ($20)",
      ]);
      expect(j.rows[0].title).toBe("Parlay Lab: NFL");
      expect(j.rows[1].alert).toBe("failed");
      expect(j.rows[3].status).toBe("won");
      for (let i = 1; i < j.rows.length; i++) expect(j.rows[i - 1].at).toBeGreaterThanOrEqual(j.rows[i].at);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is behind the sync phrase", async () => {
    const res = await takenGet(new NextRequest("https://x.test/api/taken"));
    expect(res.status).toBe(401);
  });

  it("pages through same-instant bets without repeating or skipping one", async () => {
    const many = Array.from({ length: 7 }, (_, i) => found({ id: `t${i}`, stake: 10, legs: [{ label: `P${i}`, prop: "Hits O 0.5", cz: 100 }] }, NOW - (i < 5 ? 1000 : 5000 * i)));
    mem.set("pl:ledger:v1", mlbLedger(many));
    const seen: string[] = [];
    let q = "";
    for (let guard = 0; guard < 10; guard++) {
      const res = await takenGet(new NextRequest(`https://x.test/api/taken?limit=2${q}`, { headers: { "x-pl-sync": "test-phrase" } }));
      const j = (await res.json()) as { rows: Array<{ id: string }>; next: { before: number; beforeKey: string } | null };
      seen.push(...j.rows.map((r) => r.id));
      if (!j.next) break;
      q = `&before=${j.next.before}&beforeKey=${encodeURIComponent(j.next.beforeKey)}`;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it("orders rows strictly by lock time and says the time Josh's way", () => {
    const rows = sortTaken(takenRowsOf("mlb", [{ date: "2026-10-09", locked: true, lockedAt: NOW, core: [found(hits, NOW - 5), found(ks, NOW - 1)] }], NOW));
    expect(rows.map((r) => r.id)).toEqual(["pitcher_strikeouts_13n647u", "batter_hits_ieydqg"]);
    expect(relTime(NOW - 30_000, NOW)).toBe("30s ago");
    expect(relTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relTime(NOW - 2 * 3600_000, NOW)).toBe("2h ago");
    expect(relTime(NOW - 12 * 3600_000, NOW)).toBe("12h ago");
    expect(relTime(NOW - 3 * 86400_000, NOW)).toBe("3d ago");
    expect(relTime(NOW - 19 * 86400_000, NOW)).toBe("Sep 20");
  });
});

describe("wiring — the alert runs where the lock is written", () => {
  const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("MLB generate + backfill, football found pass + first lock, and the scheduler retry", () => {
    expect(src("app/api/generate/route.ts")).toMatch(/const w = await writeLock\(entry\);[\s\S]{0,400}await notifyNewBets\(\["mlb"\]\);/);
    expect(src("app/api/scheduler/route.ts")).toMatch(/await writeLock\(entry\);\s*await notifyNewBets\(\["mlb"\]\);/);
    expect(src("app/api/scheduler/route.ts")).toMatch(/const \[cfbR, nflR\] = await football;[\s\S]{0,300}await notifyNewBets\(\);/);
    const fb = src("src/lib/server/football-lock.ts");
    expect(fb.match(/await notifyNewBets\(\[cfg\.id\]\)/g)?.length).toBe(2);
  });
  it("the service worker shows the alert and opens Taken", () => {
    const sw = src("public/sw.js");
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("showNotification(title");
    expect(sw).toContain("'/taken'");
  });
});
