import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { memoryKv, type Kv } from "@/lib/anytime/kv";
import { K, readLedger } from "@/lib/anytime/ledger";
import { runPicks, type Adapter, type AdapterCtx, type RunDeps, type RunResult } from "@/lib/anytime/run";
import type { Candidate, PickRecord } from "@/lib/anytime/types";
import { PICK_ALERT_LINES, pickAlert, pickAlertPayloadOf } from "@/lib/server/anytime-football";
import { cand, clockAt } from "./helpers/anytime";

/**
 * THE NEW-PICK ALERT. From the cutover the older desks' bet alerts stop, so the any-time engine
 * tells the phone itself: once per run that WROTE a pick, naming the book and the price.
 */

type Shape = (ctx: AdapterCtx) => Partial<Candidate>[] | Error;

function adapterOf(sport: string, shape: Shape) {
  const a = {
    sport,
    shape,
    async candidates(ctx: AdapterCtx) {
      const s = a.shape(ctx);
      if (s instanceof Error) throw s;
      const id = `${sport}-${ctx.runId}`;
      const candidates = s.map((over) => cand({ sport, marketType: `${sport}:spread`, snapshotId: id, fetchedAt: ctx.now - 500, ...over }));
      const events = [...new Map(candidates.map((c) => [c.eventId, { sport, eventId: c.eventId, commence: c.commence }])).values()];
      return { candidates, events, notes: [], snapshot: { id, fetchedAt: ctx.now - 500, events: events.length } };
    },
  };
  return a satisfies Adapter & { shape: Shape };
}

function world(adapters: Adapter[], over: Partial<RunDeps> = {}) {
  const clock = clockAt();
  const kv = memoryKv(clock);
  let n = 0;
  const told: RunResult[] = [];
  const alerts: RunResult[] = [];
  const deps: RunDeps = { kv, adapters, clock, newRunId: () => `run${++n}`, alert: async (r) => void alerts.push(r), notify: async (r) => void told.push(r), ...over };
  return { clock, kv, deps, told, alerts };
}

describe("when the run tells the phone", () => {
  it("a run that records a pick announces it once; the same run again, with nothing changed, says nothing", async () => {
    const { deps, told, kv } = world([adapterOf("nfl", () => [{}])]);
    const first = await runPicks(deps, { trigger: "cron" });
    expect(first.picks).toHaveLength(1);
    expect(told.map((r) => r.runId)).toEqual(["run1"]);
    expect(told[0].picks.map((p) => p.id)).toEqual(first.picks.map((p) => p.id));
    for (let i = 0; i < 4; i++) expect((await runPicks(deps, { trigger: "cron" })).picks).toEqual([]);
    expect(told).toHaveLength(1);
    expect(await readLedger(kv)).toHaveLength(1);
  });

  it("a run with no edge to take says nothing", async () => {
    const { deps, told } = world([adapterOf("nfl", () => [{ model: { win: 0.4, push: 0 } }])]);
    const r = await runPicks(deps, { trigger: "manual-ui" });
    expect(r.status).toBe("ok");
    expect(r.picks).toEqual([]);
    expect(told).toEqual([]);
  });

  it("a later, better price is a new entry and a new announcement", async () => {
    const nfl = adapterOf("nfl", () => [{}]);
    const { deps, told, clock } = world([nfl]);
    await runPicks(deps, { trigger: "manual-api" });
    clock.add(20 * 60_000);
    nfl.shape = () => [{ quotes: { draftkings: { price: -110, opp: -110 }, fanduel: { price: +102, opp: -122 } } }];
    await runPicks(deps, { trigger: "manual-api" });
    expect(told.map((r) => [r.runId, r.picks.length, r.picks[0].price])).toEqual([["run1", 1, -105], ["run2", 1, 102]]);
  });

  it("two runs deciding the same pick at once: one record, one announcement", async () => {
    const { kv, deps, told } = world([adapterOf("nfl", () => [{}])]);
    const noLease: Kv = { ...kv, setNx: (key, value, px) => (key === K.lease ? Promise.resolve(true) : kv.setNx(key, value, px)) };
    const [a, b] = await Promise.all([runPicks({ ...deps, kv: noLease }, { trigger: "manual-ui" }), runPicks({ ...deps, kv: noLease }, { trigger: "manual-api" })]);
    expect(a.picks.length + b.picks.length).toBe(1);
    expect(a.adopted.length + b.adopted.length).toBe(1);
    expect(told).toHaveLength(1);
    expect(told[0].picks).toHaveLength(1);
  });

  it("a busy run and a run with the store down say nothing", async () => {
    const { kv, deps, told } = world([adapterOf("nfl", () => [{}])]);
    const [a, b] = await Promise.all([runPicks(deps, { trigger: "manual-ui" }), runPicks(deps, { trigger: "cron" })]);
    expect([a.status, b.status].sort()).toEqual(["busy", "ok"]);
    expect(told).toHaveLength(1);
    const down: Kv = { ...kv, setNx: () => Promise.reject(new Error("Upstash 403")) };
    const r = await runPicks({ ...deps, kv: down }, { trigger: "cron" });
    expect(r.status).toBe("failed");
    expect(told).toHaveLength(1);
  });

  it("one sport down and the other with a pick: the failure alert and the pick alert both go out", async () => {
    const { deps, told, alerts } = world([adapterOf("nfl", () => [{}]), adapterOf("cfb", () => new Error("401"))]);
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r.status).toBe("partial");
    expect(alerts).toHaveLength(1);
    expect(told).toHaveLength(1);
  });

  it("an announcement that cannot be sent changes nothing: the pick is recorded and the run is ok", async () => {
    const { deps, kv } = world([adapterOf("nfl", () => [{}])], { notify: async () => Promise.reject(new Error("push down")) });
    const r = await runPicks(deps, { trigger: "cron" });
    expect(r).toMatchObject({ status: "ok", errors: [] });
    expect(r.picks).toHaveLength(1);
    expect(await readLedger(kv)).toHaveLength(1);
  });

  it("no announcer wired is fine", async () => {
    const { deps } = world([adapterOf("nfl", () => [{}])], { notify: undefined });
    expect((await runPicks(deps, { trigger: "cron" })).status).toBe("ok");
  });
});

describe("what the phone is told", () => {
  async function picksOf(shapes: Partial<Candidate>[]): Promise<RunResult> {
    const { deps } = world([adapterOf("nfl", () => shapes)]);
    return runPicks(deps, { trigger: "cron" });
  }

  it("one pick: the count, the sport, the selection, the price, the book it was taken at, and the edge", async () => {
    const r = await picksOf([{}]);
    const p = r.picks[0];
    expect([p.book, p.price]).toEqual(["fanduel", -105]);
    expect(pickAlertPayloadOf(r)).toEqual({
      title: "Parlay Lab: 1 new paper pick",
      body: "NFL Home -2.5 −105 FD · +7.4%",
      url: "/anytime",
      tag: "anytime-picks:run1",
    });
  });

  it("a DraftKings pick says DK", async () => {
    const r = await picksOf([{ quotes: { draftkings: { price: +100, opp: -120 }, fanduel: { price: -105, opp: -115 } } }]);
    expect(pickAlertPayloadOf(r).body).toMatch(/^NFL Home -2\.5 \+100 DK · \+\d+\.\d%$/);
  });

  it("many picks: the first three spelled out, the rest counted, and the whole thing short", async () => {
    const five = [1, 2, 3, 4, 5].map((i) => ({ eventId: `ev${i}`, event: `Away${i} @ Home${i}`, selection: `Home${i} -2.5`, family: `nfl|ev${i}|spread|home` }));
    const r = await picksOf(five);
    expect(r.picks).toHaveLength(5);
    const a = pickAlertPayloadOf(r);
    expect(a.title).toBe("Parlay Lab: 5 new paper picks");
    const lines = a.body.split("\n");
    expect(lines).toHaveLength(PICK_ALERT_LINES + 1);
    expect(lines.at(-1)).toBe("+2 more");
    expect(a.body.length).toBeLessThanOrEqual(240);
    const long = { ...r, picks: r.picks.map((p) => ({ ...p, selection: "x".repeat(200) })) as PickRecord[] };
    expect(pickAlertPayloadOf(long).body.length).toBe(240);
  });

  it("the sender is called once with that payload; no picks means no send; a failed send is swallowed", async () => {
    const r = await picksOf([{}]);
    const sent: unknown[] = [];
    await pickAlert(async (p) => void sent.push(p))(r);
    expect(sent).toEqual([pickAlertPayloadOf(r)]);
    await pickAlert(async (p) => void sent.push(p))({ ...r, picks: [] });
    expect(sent).toHaveLength(1);
    await expect(pickAlert(async () => Promise.reject(new Error("push down")))(r)).resolves.toBeUndefined();
  });

  it("says paper, and carries nothing but the pick: no phrase, key, stake in dollars or link off the app", async () => {
    const a = pickAlertPayloadOf(await picksOf([{}]));
    expect(a.title).toMatch(/paper/);
    expect(JSON.stringify(a)).not.toMatch(/\$|https?:|sync|secret|key/i);
    expect(a.url).toBe("/anytime");
  });
});

describe("the wiring, as source", () => {
  const strip = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("the live engine sends the pick alert through the one push sender", () => {
    const s = strip("src/lib/server/anytime.ts");
    expect(s).toMatch(/notify: pickAlert\(\(p\) => sendToAll\(p\)\),/);
    expect(s).toMatch(/alert: runAlert\(\(p\) => sendToAll\(p\)\),/);
  });

  it("the run announces written picks only, after the record is safe, and never lets the announcer throw", () => {
    const s = strip("src/lib/anytime/run.ts");
    expect(s).toMatch(/if \(res\.picks\.length\) await announce\(deps, res\);/);
    expect(s).not.toMatch(/adopted\.length\) await announce/);
    expect(s.indexOf("await logRun(")).toBeLessThan(s.indexOf("await announce(deps, res)"));
    expect(s).toMatch(/async function announce[\s\S]{0,160}try \{\s*await deps\.notify\(res\);\s*\} catch \{/);
  });
});
