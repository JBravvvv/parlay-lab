import { describe, expect, it } from "vitest";
import { memoryKv, type Kv } from "@/lib/anytime/kv";
import { K, healthOf, readHeartbeat, readLedger, recentRuns } from "@/lib/anytime/ledger";
import { bankOf, clvAtOwnBook, reportOf } from "@/lib/anytime/report";
import { ANYTIME_RULES } from "@/lib/anytime/rules";
import { movedSince, runPicks, type Adapter, type AdapterCtx, type OddsMeter, type OddsSpend, type RunDeps, type RunResult, type ScoreProvider } from "@/lib/anytime/run";
import type { Candidate } from "@/lib/anytime/types";
import { cand, clockAt, KICK, T0 } from "./helpers/anytime";

/* THE ONE FUNCTION EVERY TRIGGER CALLS. */

type Shape = (ctx: AdapterCtx) => Partial<Candidate>[] | Error;

/** An adapter whose quotes a test can change between runs. Counts how often it was asked. */
function adapterOf(sport: string, shape: Shape) {
  const a = {
    sport,
    calls: 0,
    shape,
    async candidates(ctx: AdapterCtx) {
      a.calls++;
      const s = a.shape(ctx);
      if (s instanceof Error) throw s;
      const id = `${sport}-${ctx.runId}`;
      const candidates = s.map((over) => cand({ sport, marketType: `${sport}:spread`, snapshotId: id, fetchedAt: ctx.now - 500, ...over }));
      const events = [...new Map(candidates.map((c) => [c.eventId, { sport, eventId: c.eventId, commence: c.commence }])).values()];
      return { candidates, events, notes: [], snapshot: { id, fetchedAt: ctx.now - 500, events: events.length } };
    },
  };
  return a satisfies Adapter & { calls: number; shape: Shape };
}

function world(adapters: Adapter[], over: Partial<RunDeps> = {}) {
  const clock = clockAt();
  const kv = memoryKv(clock);
  let n = 0;
  const alerts: RunResult[] = [];
  const deps: RunDeps = { kv, adapters, clock, newRunId: () => `run${++n}`, alert: async (r) => void alerts.push(r), ...over };
  return { clock, kv, deps, alerts };
}

describe("any trigger, any time, the same function", () => {
  it("records the pick, the snapshot it came from, a heartbeat and a run record", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps } = world([nfl]);
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(r).toMatchObject({ status: "ok", runId: "run1", trigger: "manual-ui", candidates: 1, events: 1, errors: [] });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0]).toMatchObject({ book: "fanduel", price: -105, otherBook: "draftkings", otherPrice: -110, snapshotId: "nfl-run1", trigger: "manual-ui", runId: "run1" });
    expect(r.snapshots).toEqual([{ id: "nfl-run1", sport: "nfl", fetchedAt: new Date(T0 - 500).toISOString(), events: 1 }]);
    expect((await readLedger(kv)).map((x) => x.pick)).toEqual(r.picks);
    expect(await readHeartbeat(kv)).toMatchObject({ runId: "run1", ok: true, status: "ok", picks: 1, candidates: 1 });
    expect((await recentRuns<{ runId: string; picks: string[] }>(kv))[0]).toMatchObject({ runId: "run1", picks: [r.picks[0].id] });
  });

  it("triggered five times in a row with nothing changed: one pick, four runs that record nothing", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps } = world([nfl]);
    const out: RunResult[] = [];
    for (const trigger of ["manual-ui", "manual-api", "cli", "manual-ui", "manual-api"] as const) out.push(await runPicks(deps, { trigger }));
    expect(out.map((r) => r.picks.length)).toEqual([1, 0, 0, 0, 0]);
    expect(out.slice(1).every((r) => r.status === "ok" && r.rejects.duplicate === 1)).toBe(true);
    expect(await readLedger(kv)).toHaveLength(1);
    expect(nfl.calls).toBe(5);
  });

  it("the same run works at 3 am, at noon and one minute before kickoff", async () => {
    for (const at of ["2026-11-15T10:00:00Z", "2026-11-15T19:00:00Z", "2026-11-15T21:23:30Z"]) {
      const { clock, deps } = world([adapterOf("nfl", () => [{}])]);
      clock.set(Date.parse(at));
      expect((await runPicks(deps, { trigger: "manual-api" })).picks, at).toHaveLength(1);
    }
  });

  it("a better price later is a second, separate entry; the first is untouched", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, kv, deps } = world([nfl]);
    const first = (await runPicks(deps, { trigger: "manual-api" })).picks[0];
    clock.add(20 * 60_000);
    nfl.shape = () => [{ quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: +102, opp: -122 } } }];
    const second = (await runPicks(deps, { trigger: "manual-api" })).picks;
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ seq: 2, reentryOf: first.id, price: 102, book: "fanduel" });
    const rows = await readLedger(kv);
    expect(rows.map((x) => x.pick.id)).toEqual([first.id, second[0].id]);
    expect(rows[0].pick).toEqual(first);
  });

  it("only the sports asked for are priced", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const cfb = adapterOf("cfb", () => [{ eventId: "c1" }]);
    const { deps } = world([nfl, cfb]);
    const r = await runPicks(deps, { trigger: "manual-api", sports: ["cfb"] });
    expect([nfl.calls, cfb.calls]).toEqual([0, 1]);
    expect(r.picks.map((p) => p.sport)).toEqual(["cfb"]);
  });
});

describe("overlapping triggers cannot double-record", () => {
  it("two triggers at the same moment: one runs, the other is told busy and does nothing", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps, alerts } = world([nfl]);
    const [a, b] = await Promise.all([runPicks(deps, { trigger: "manual-ui" }), runPicks(deps, { trigger: "cron" })]);
    expect([a.status, b.status].sort()).toEqual(["busy", "ok"]);
    expect(nfl.calls).toBe(1);
    expect(await readLedger(kv)).toHaveLength(1);
    expect(alerts).toEqual([]); // busy is not a failure
    /* the lease is released: the next trigger runs */
    expect((await runPicks(deps, { trigger: "cli" })).status).toBe("ok");
  });

  it("even with the lease broken, two runs deciding the same pick leave exactly one record", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps } = world([nfl]);
    const noLease: Kv = { ...kv, setNx: (key, value, px) => (key === K.lease ? Promise.resolve(true) : kv.setNx(key, value, px)) };
    const [a, b] = await Promise.all([runPicks({ ...deps, kv: noLease }, { trigger: "manual-ui" }), runPicks({ ...deps, kv: noLease }, { trigger: "manual-api" })]);
    expect(nfl.calls).toBe(2);
    expect(a.picks.length + b.picks.length).toBe(1);
    expect(a.adopted.length + b.adopted.length).toBe(1);
    expect((a.rejects.lost_race ?? 0) + (b.rejects.lost_race ?? 0)).toBe(1);
    expect(await readLedger(kv)).toHaveLength(1);
    expect(await kv.smembers(K.open)).toHaveLength(1);
  });
});

describe("polling follows time to start; a person asking is never told to wait", () => {
  it("a scheduled run skips a sport that is not due a look, a manual run prices it anyway", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, deps } = world([nfl]);
    await runPicks(deps, { trigger: "cron" }); // 4 h 25 min out: next scheduled look in 60 min
    clock.add(30 * 60_000);
    const early = await runPicks(deps, { trigger: "cron" });
    expect(early).toMatchObject({ status: "ok", skipped: ["nfl"], candidates: 0 });
    expect(nfl.calls).toBe(1);
    const asked = await runPicks(deps, { trigger: "manual-ui" });
    expect(asked.skipped).toEqual([]);
    expect(nfl.calls).toBe(2);
    clock.add(61 * 60_000);
    await runPicks(deps, { trigger: "cron" });
    expect(nfl.calls).toBe(3);
  });

  it("inside the last hour a scheduled run looks every five minutes", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, deps } = world([nfl]);
    clock.set(Date.parse(KICK) - 50 * 60_000);
    await runPicks(deps, { trigger: "cron" });
    clock.add(4 * 60_000);
    await runPicks(deps, { trigger: "cron" });
    expect(nfl.calls).toBe(1);
    clock.add(61_000);
    await runPicks(deps, { trigger: "cron" });
    expect(nfl.calls).toBe(2);
  });
});

describe("line movement is an event", () => {
  const flat = { model: { win: 0.5, push: 0 }, quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: -110, opp: -110 } } };
  const movedQ = { model: { win: 0.5, push: 0 }, quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: +110, opp: -130 } } };

  it("a scheduled look that finds a moved price stamps the pick it creates as a line-move event", async () => {
    const nfl = adapterOf("nfl", () => [flat]);
    const { clock, deps } = world([nfl]);
    expect((await runPicks(deps, { trigger: "cron" })).picks).toEqual([]);
    clock.add(61 * 60_000);
    nfl.shape = () => [movedQ];
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0]).toMatchObject({ trigger: "event:line-move", book: "fanduel", price: 110 });
  });

  it("a pick a person asked for keeps that person's trigger", async () => {
    const nfl = adapterOf("nfl", () => [flat]);
    const { clock, deps } = world([nfl]);
    await runPicks(deps, { trigger: "cron" });
    clock.add(61 * 60_000);
    nfl.shape = () => [movedQ];
    expect((await runPicks(deps, { trigger: "manual-ui" })).picks[0].trigger).toBe("manual-ui");
  });

  it("the threshold: 4% of the decimal price, or any change of line, at either book", () => {
    const ref = { draftkings: { dec: 2, line: -2.5 }, fanduel: { dec: 2, line: -2.5 } };
    expect(movedSince(ref, { draftkings: { dec: 2.079, line: -2.5 }, fanduel: { dec: 2, line: -2.5 } })).toBe(false);
    expect(movedSince(ref, { draftkings: { dec: 2.08, line: -2.5 }, fanduel: { dec: 2, line: -2.5 } })).toBe(true);
    expect(movedSince(ref, { draftkings: { dec: 2, line: -2.5 }, fanduel: { dec: 1.92, line: -2.5 } })).toBe(true);
    expect(movedSince(ref, { draftkings: { dec: 2, line: -3 }, fanduel: { dec: 2, line: -2.5 } })).toBe(true);
    expect(movedSince(undefined, ref)).toBe(false);
    expect(movedSince(ref, {})).toBe(false);
  });
});

describe("closing line at both books, graded with no manual step", () => {
  const scoresOf = (home: number, away: number): ScoreProvider => async (picks) => new Map(picks.map((p) => [p.id, { home, away, final: true, status: "final", start: p.commence }]));

  async function played(home: number, away: number) {
    const nfl = adapterOf("nfl", () => [{}]);
    const w = world([nfl], { scores: scoresOf(home, away) });
    const pick = (await runPicks(w.deps, { trigger: "manual-api" })).picks[0];
    /* 30 minutes before kickoff both books have shortened the price */
    w.clock.set(Date.parse(KICK) - 30 * 60_000);
    nfl.shape = () => [{ quotes: { draftkings: { price: -125, opp: +105 }, fanduel: { price: -120, opp: +100 } } }];
    const near = await runPicks(w.deps, { trigger: "cron" });
    /* after the game the feed no longer lists it */
    w.clock.set(Date.parse(KICK) + 4 * 3600_000);
    nfl.shape = () => [];
    const after = await runPicks(w.deps, { trigger: "cron" });
    return { ...w, pick, near, after };
  }

  it("the pick gets a close as soon as it exists, the last look before kickoff replaces it, and the start freezes it", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, kv, deps } = world([nfl]);
    const r1 = await runPicks(deps, { trigger: "manual-api" });
    expect(r1.closes).toBe(1);
    expect((await readLedger(kv))[0].close).toMatchObject({ final: false, fairN: 2, books: { fanduel: { price: -105, opp: -115, line: -2.5 }, draftkings: { price: -110, opp: -110, line: -2.5 } } });
    /* hours out and unchanged: not rewritten */
    clock.add(10 * 60_000);
    expect((await runPicks(deps, { trigger: "manual-api" })).closes).toBe(0);
    /* hours out and changed: still not rewritten (outside the close window) */
    nfl.shape = () => [{ quotes: { draftkings: { price: -118, opp: -102 }, fanduel: { price: -112, opp: -108 } } }];
    clock.add(10 * 60_000);
    expect((await runPicks(deps, { trigger: "manual-api" })).closes).toBe(0);
    /* inside the window: rewritten */
    clock.set(Date.parse(KICK) - ANYTIME_RULES.closeWindowMs + 60_000);
    expect((await runPicks(deps, { trigger: "manual-api" })).closes).toBe(1);
    expect((await readLedger(kv))[0].close?.books.fanduel?.price).toBe(-112);
  });

  it("CLV is measured at the pick's own book; the other book's close is kept beside it", async () => {
    const { kv, pick, near, after } = await played(24, 21);
    expect(near.closes).toBe(1);
    const [row] = await readLedger(kv);
    expect(row.close).toMatchObject({ final: true, snapshotId: "nfl-run2", books: { fanduel: { price: -120, opp: 100, line: -2.5 }, draftkings: { price: -125, opp: 105, line: -2.5 } } });
    const c = clvAtOwnBook(row);
    /* taken at FanDuel -105 (1.9524); FanDuel closed -120 (1.8333) */
    expect(pick.book).toBe("fanduel");
    expect(c.priceClv).toBeCloseTo((1 + 100 / 105) / (1 + 100 / 120) - 1, 9);
    expect(c.otherPriceClv).toBeCloseTo((1 + 100 / 105) / (1 + 100 / 125) - 1, 9);
    expect(c.clv).toBeGreaterThan(0);
    expect(c.lineMoved).toBe(false);
    expect(after.graded).toEqual([{ id: pick.id, result: "won" }]);
  });

  it("a book that moved off the pick's line is recorded with its new line, and that pick is left out of the CLV mean", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, kv, deps } = world([nfl]);
    await runPicks(deps, { trigger: "manual-api" });
    clock.set(Date.parse(KICK) - 20 * 60_000);
    nfl.shape = () => [{ line: -3.5, selection: "Home -3.5", model: { win: 0.4, push: 0 }, quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: -108, opp: -112 } } }];
    await runPicks(deps, { trigger: "cron" });
    const [row] = await readLedger(kv);
    expect(row.close?.books.fanduel).toEqual({ price: -108, opp: -112, line: -3.5 });
    expect(row.close?.fairN).toBe(0);
    expect(clvAtOwnBook(row)).toMatchObject({ clv: null, priceClv: null, lineMoved: true });
    expect(reportOf(await readLedger(kv), clock()).byBook.combined).toMatchObject({ lineMoved: 1, clv: null });
  });

  it("grades a win, and both bankrolls equal a from-scratch recomputation of the raw ledger", async () => {
    const { kv, pick, after, clock } = await played(24, 21);
    const rows = await readLedger(kv);
    expect(rows[0].grade).toMatchObject({ result: "won", source: "espn", detail: "21-24 (away-home)" });
    const dec = 1 + 100 / 105;
    expect(after.bank.flat).toBeCloseTo(dec - 1, 4);
    expect(after.bank.kelly).toBeCloseTo(100 + pick.stakeKelly * (dec - 1), 2);
    expect({ kelly: after.bank.kelly, flat: after.bank.flat, graded: after.bank.graded }).toEqual(bankOf(rows));
    const rep = reportOf(rows, clock());
    expect(rep.bank).toEqual(bankOf(rows));
    expect(rep.byBook.fanduel).toMatchObject({ picks: 1, graded: 1, won: 1, lost: 0, open: 0 });
    expect(rep.byBook.fanduel.flatProfit).toBeCloseTo(dec - 1, 9);
    expect(rep.byBook.draftkings.picks).toBe(0);
    expect(rep.byBook.combined.flatProfit).toBe(rep.byBook.fanduel.flatProfit);
    expect(await kv.smembers(K.open)).toEqual([]);
  });

  it("grades a loss and a push", async () => {
    const lost = await played(21, 24);
    expect(lost.after.graded[0].result).toBe("lost");
    expect(lost.after.bank).toMatchObject({ flat: -1, kelly: Math.round((100 - lost.pick.stakeKelly) * 100) / 100, graded: 1 });
    const nfl = adapterOf("nfl", () => [{ line: -3, selection: "Home -3", model: { win: 0.56, push: 0.03 } }]);
    const w = world([nfl], { scores: scoresOf(24, 21) });
    await runPicks(w.deps, { trigger: "manual-api" });
    w.clock.set(Date.parse(KICK) + 4 * 3600_000);
    nfl.shape = () => [];
    const after = await runPicks(w.deps, { trigger: "cron" });
    expect(after.graded[0].result).toBe("push");
    expect(after.bank).toMatchObject({ flat: 0, kelly: 100, graded: 1 });
  });

  it("is graded once: a later run with a different score changes nothing", async () => {
    const { kv, deps, clock } = await played(24, 21);
    clock.add(3600_000);
    const again = await runPicks({ ...deps, scores: scoresOf(0, 50) }, { trigger: "cron" });
    expect(again.graded).toEqual([]);
    expect((await readLedger(kv))[0].grade?.result).toBe("won");
  });

  it("a game still in progress stays open, with its close frozen", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const live: ScoreProvider = async (picks) => new Map(picks.map((p) => [p.id, { home: 14, away: 7, final: false, status: "live" }]));
    const { clock, kv, deps } = world([nfl], { scores: live });
    await runPicks(deps, { trigger: "manual-api" });
    clock.set(Date.parse(KICK) + 3600_000);
    nfl.shape = () => [];
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.graded).toEqual([]);
    const [row] = await readLedger(kv);
    expect(row.grade).toBeNull();
    expect(row.close?.final).toBe(true);
  });

  it("no pick is ever recorded on a game that has started, whatever the feed says", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { clock, kv, deps } = world([nfl]);
    clock.set(Date.parse(KICK) + 1);
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(r.picks).toEqual([]);
    expect(r.rejects.started).toBe(1);
    expect(await readLedger(kv)).toEqual([]);
  });
});

describe("failures are loud", () => {
  it("one sport's feed down: the other still runs, the run is partial, the alert fires, the heartbeat says so", async () => {
    const nfl = adapterOf("nfl", () => new Error("Odds API 500"));
    const cfb = adapterOf("cfb", () => [{ eventId: "c1" }]);
    const { kv, deps, alerts, clock } = world([nfl, cfb]);
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("partial");
    expect(r.errors).toEqual(["nfl: Odds API 500"]);
    expect(r.picks.map((p) => p.sport)).toEqual(["cfb"]);
    expect(alerts.map((a) => a.runId)).toEqual(["run1"]);
    expect(await readHeartbeat(kv)).toMatchObject({ ok: false, status: "partial", errors: ["nfl: Odds API 500"] });
    expect(healthOf(await readHeartbeat(kv), clock()).state).toBe("failed");
  });

  it("every feed down: failed", async () => {
    const { deps, alerts } = world([adapterOf("nfl", () => new Error("401")), adapterOf("cfb", () => new Error("401"))]);
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("failed");
    expect(alerts).toHaveLength(1);
  });

  it("the store down: nothing is recorded, the run says failed and the alert still fires", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps, alerts } = world([nfl]);
    const down: Kv = { ...kv, setNx: () => Promise.reject(new Error("Upstash 403")) };
    const r = await runPicks({ ...deps, kv: down }, { trigger: "cron" });
    expect(r).toMatchObject({ status: "failed", errors: ["store: Upstash 403"], picks: [] });
    expect(nfl.calls).toBe(0);
    expect(alerts).toHaveLength(1);
    expect(Object.keys(kv.dump())).toEqual([]);
  });

  it("the store failing mid-run is a failed run, not a thrown one", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { kv, deps, alerts } = world([nfl]);
    const flaky: Kv = { ...kv, mget: () => Promise.reject(new Error("Upstash timeout")) };
    const r = await runPicks({ ...deps, kv: flaky }, { trigger: "manual-ui" });
    expect(r.status).toBe("failed");
    expect(r.errors.some((e) => e.startsWith("run: Upstash timeout"))).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(await readHeartbeat(kv)).toMatchObject({ ok: false, status: "failed" });
  });

  it("a scores feed that throws does not stop new picks", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const w = world([nfl], { scores: async () => Promise.reject(new Error("ESPN 503")) });
    await runPicks(w.deps, { trigger: "manual-api" });
    w.clock.set(Date.parse(KICK) + 4 * 3600_000);
    nfl.shape = () => [{ eventId: "ev2", commence: "2026-11-17T01:15:00Z" }];
    const r = await runPicks(w.deps, { trigger: "manual-api" });
    expect(r.status).toBe("partial");
    expect(r.errors).toEqual(["grade: ESPN 503"]);
    expect(r.picks).toHaveLength(1);
  });

  it("an alert that cannot be sent does not hide the failure", async () => {
    const { kv, deps } = world([adapterOf("nfl", () => new Error("down"))], { alert: async () => Promise.reject(new Error("push failed")) });
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("failed");
    expect((await readHeartbeat(kv))?.ok).toBe(false);
  });

  it("a healthy run raises no alert, and a missed run shows as stale", async () => {
    const { kv, deps, alerts, clock } = world([adapterOf("nfl", () => [{}])]);
    await runPicks(deps, { trigger: "cron" });
    expect(alerts).toEqual([]);
    expect(healthOf(await readHeartbeat(kv), clock()).state).toBe("ok");
    clock.add(ANYTIME_RULES.heartbeatStaleMs + 1);
    expect(healthOf(await readHeartbeat(kv), clock()).state).toBe("stale");
  });
});

describe("the credit budget rides on every run", () => {
  it("runs the whole body under one odds tally with the run's budget, and records the spend", async () => {
    const seen: { runId: string; budget: number | null }[] = [];
    let spend: OddsSpend | null = null;
    const meter: OddsMeter = {
      async run(runId, budget, fn) {
        seen.push({ runId, budget });
        const out = await fn();
        spend = { calls: 2, cacheHits: 1, credits: 6, unmetered: 0, remaining: 91_234, used: 8_766, budget, refused: 0, errors: 0, regionFallback: false };
        return out;
      },
      spend: () => spend,
    };
    const { kv, deps } = world([adapterOf("nfl", () => [{}])], { odds: meter });
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(seen).toEqual([{ runId: "run1", budget: ANYTIME_RULES.creditBudgetPerRun }]);
    expect(r.odds).toMatchObject({ credits: 6, calls: 2, cacheHits: 1, remaining: 91_234 });
    expect(await readHeartbeat(kv)).toMatchObject({ credits: 6, remaining: 91_234 });
  });

  it("a budget refusal inside an adapter is that sport's error, not a crash", async () => {
    const { deps } = world([adapterOf("nfl", () => new Error("Odds API budget for this run is spent (400)")), adapterOf("cfb", () => [{ eventId: "c1" }])]);
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("partial");
    expect(r.errors[0]).toMatch(/budget/);
  });
});
