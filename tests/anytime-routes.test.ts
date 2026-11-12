import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryKv, type Kv } from "@/lib/anytime/kv";
import { K, readLedger, readStoredExclusions } from "@/lib/anytime/ledger";
import { bankOf, reportOf } from "@/lib/anytime/report";
import { ANYTIME_RULES } from "@/lib/anytime/rules";
import { runPicks, type Adapter, type AdapterCtx, type RunDeps, type RunOpts, type RunResult, type ScoreProvider } from "@/lib/anytime/run";
import type { Candidate } from "@/lib/anytime/types";
import { accessOf, handleAction, handleHealth, handleReport, handleRun, scrub, triggerOf, type Access, type Runner } from "@/lib/server/anytime";
import { cand, clockAt, KICK } from "./helpers/anytime";

/* THE THREE TRIGGER PATHS' FRONT DOOR: who may run the engine, what they are recorded as, what
   comes back. No network and no store: the ledger is the in-memory one and every price is invented.
   The only secrets here are the two test values. */

const PHRASE = "test-phrase";
const CRON = "test-key-never-logged";

const OPEN: Access = { store: true, syncSet: true, cronSet: true, sync: false, cron: false };
const PERSON: Access = { ...OPEN, sync: true };
const MACHINE: Access = { ...OPEN, cron: true };

type Shape = (ctx: AdapterCtx) => Partial<Candidate>[] | Error;
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

function world(shape: Shape = () => [{}], over: Partial<RunDeps> = {}) {
  const clock = clockAt();
  const kv = memoryKv(clock);
  const nfl = adapterOf("nfl", shape);
  let n = 0;
  const asked: RunOpts[] = [];
  const deps: RunDeps = { kv, adapters: [nfl], clock, newRunId: () => `run${++n}`, ...over };
  const run: Runner = (opts) => {
    asked.push(opts);
    return runPicks(deps, opts);
  };
  return { clock, kv, nfl, deps, run, asked };
}

const never: Runner = () => {
  throw new Error("the engine must not be reached");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("who may run the engine", () => {
  it("fails closed with no store, and with no secret at all to check a caller against", async () => {
    expect(await handleRun({ ...PERSON, store: false }, {}, never)).toEqual({ status: 503, body: { ok: false, error: "anytime unavailable", missing: ["store"] } });
    expect(await handleRun({ store: true, syncSet: false, cronSet: false, sync: false, cron: false }, {}, never)).toEqual({ status: 503, body: { ok: false, error: "anytime unavailable", missing: ["secret"] } });
  });

  it("refuses a caller with neither secret, without touching the engine", async () => {
    expect(await handleRun(OPEN, { hint: "manual-ui", force: "1" }, never)).toEqual({ status: 401, body: { ok: false, error: "sync phrase or cron key required" } });
  });

  it("one secret configured is enough for the caller who holds it", async () => {
    const w = world();
    const r = await handleRun({ store: true, syncSet: false, cronSet: true, sync: false, cron: true }, {}, w.run);
    expect(r.status).toBe(200);
    expect(w.asked).toEqual([{ trigger: "cron" }]);
  });

  it("reads both secrets from headers only, and an unset secret never matches", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://store.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "store-token-for-test");
    vi.stubEnv("LEDGER_SYNC_KEY", PHRASE);
    vi.stubEnv("CRON_SECRET", CRON);
    const req = (headers: Record<string, string>, qs = "") => new NextRequest(`https://x.test/api/anytime/run${qs}`, { method: "POST", headers });
    expect(accessOf(req({}))).toEqual(OPEN);
    expect(accessOf(req({ "x-pl-sync": PHRASE }))).toEqual(PERSON);
    expect(accessOf(req({ "x-cron-key": CRON }))).toEqual(MACHINE);
    expect(accessOf(req({ authorization: `Bearer ${CRON}` }))).toEqual(MACHINE);
    /* the wrong header, the wrong value, and a secret in the URL: all nobody */
    expect(accessOf(req({ "x-pl-sync": CRON }))).toEqual(OPEN);
    expect(accessOf(req({ "x-cron-key": PHRASE }))).toEqual(OPEN);
    expect(accessOf(req({}, `?key=${CRON}&sync=${PHRASE}`))).toEqual(OPEN);

    vi.stubEnv("LEDGER_SYNC_KEY", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(accessOf(req({ "x-pl-sync": "", "x-cron-key": "" }))).toEqual({ store: true, syncSet: false, cronSet: false, sync: false, cron: false });
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    expect(accessOf(req({})).store).toBe(false);
  });
});

describe("what a caller is recorded as", () => {
  it("the secret decides the family; a caller cannot name itself into the other one", () => {
    expect(triggerOf(PERSON, {})).toEqual({ trigger: "manual-api" });
    expect(triggerOf(PERSON, { hint: "manual-ui" })).toEqual({ trigger: "manual-ui" });
    expect(triggerOf(PERSON, { hint: "cli" })).toEqual({ trigger: "cli" });
    expect(triggerOf(PERSON, { hint: "cron" })).toEqual({ error: "x-pl-trigger must be manual-ui, manual-api or cli" });
    expect(triggerOf(PERSON, { hint: "event:line-move" })).toHaveProperty("error");
    /* a scheduler is a scheduler whatever it says about itself */
    expect(triggerOf(MACHINE, {})).toEqual({ trigger: "cron" });
    expect(triggerOf(MACHINE, { hint: "manual-ui" })).toEqual({ trigger: "cron" });
  });

  it("an event trigger is named by a short lower-case word and nothing else", () => {
    expect(triggerOf(MACHINE, { event: "line-move" })).toEqual({ trigger: "event:line-move" });
    expect(triggerOf(PERSON, { event: "lineup" })).toEqual({ trigger: "event:lineup" });
    for (const bad of ["Line Move", "x".repeat(31), "-x", "a:b", "a/b"]) expect(triggerOf(MACHINE, { event: bad })).toHaveProperty("error");
  });

  it("a malformed ask is a 400 and the engine is not reached", async () => {
    for (const ask of [{ hint: "robot" }, { event: "NOPE!" }, { sports: "nfl;drop" }, { sports: "," }, { force: "yes" }]) {
      const r = await handleRun(PERSON, ask, never);
      expect([r.status, r.body.ok]).toEqual([400, false]);
    }
  });

  it("passes sports and force through, and leaves force unset when the caller did not say", async () => {
    const w = world();
    await handleRun(PERSON, { hint: "cli", sports: "nfl, cfb,nfl", force: "0" }, w.run);
    await handleRun(MACHINE, { force: "1" }, w.run);
    await handleRun(MACHINE, {}, w.run);
    expect(w.asked).toEqual([{ trigger: "cli", sports: ["nfl", "cfb"], force: false }, { trigger: "cron", force: true }, { trigger: "cron" }]);
  });
});

describe("triggering the engine on demand", () => {
  it("the button, the command line and the scheduler reach the same function; each pick carries its trigger", async () => {
    const w = world();
    const first = await handleRun(PERSON, { hint: "manual-ui" }, w.run);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, status: "ok", trigger: "manual-ui" });
    expect((first.body.picks as { trigger: string; book: string }[]).map((p) => [p.trigger, p.book])).toEqual([["manual-ui", "fanduel"]]);

    /* asked again four more ways with nothing changed: nothing new, nothing doubled */
    for (const [access, ask] of [[PERSON, { hint: "cli" }], [PERSON, {}], [MACHINE, { force: "1" }], [MACHINE, { event: "line-move", force: "1" }]] as const) {
      const r = await handleRun(access, ask, w.run);
      expect([r.status, r.body.status, (r.body.picks as unknown[]).length]).toEqual([200, "ok", 0]);
    }
    expect((await readLedger(w.kv)).map((r) => r.pick.trigger)).toEqual(["manual-ui"]);
    expect(w.asked.map((o) => o.trigger)).toEqual(["manual-ui", "cli", "manual-api", "cron", "event:line-move"]);
  });

  it("three callers at the same moment: one record, the others told busy, all answered 200", async () => {
    const w = world();
    const out = await Promise.all([handleRun(PERSON, { hint: "manual-ui" }, w.run), handleRun(MACHINE, { force: "1" }, w.run), handleRun(PERSON, { hint: "cli" }, w.run)]);
    expect(out.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(out.map((r) => r.body.status).sort()).toEqual(["busy", "busy", "ok"]);
    expect(await readLedger(w.kv)).toHaveLength(1);
  });

  it("a failed run answers 500 so a scheduler's own failure notice fires; a partial one answers 200", async () => {
    const dead = world(() => new Error("Odds API 401 for nfl"));
    const r = await handleRun(MACHINE, { force: "1" }, dead.run);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ ok: false, status: "failed", errors: ["nfl: Odds API 401 for nfl"] });

    const half = world();
    half.deps.adapters.push(adapterOf("cfb", () => new Error("espn scoreboard 503 for cfb 2026-11-15")));
    const p = await handleRun(MACHINE, { force: "1" }, half.run);
    expect([p.status, p.body.ok, p.body.status]).toEqual([200, true, "partial"]);
  });

  it("an engine that throws is still a JSON answer, never a rethrow", async () => {
    const r = await handleRun(PERSON, { hint: "manual-ui" }, async () => {
      throw new Error("boom");
    });
    expect(r).toEqual({ status: 500, body: { ok: false, status: "failed", trigger: "manual-ui", error: "run: boom" } });
  });
});

describe("nothing secret leaves in a reply", () => {
  it("scrubs every configured secret, plain or URL-encoded, and any apiKey value", () => {
    const env = { ODDS_API_KEY: "test-key-never-logged", CRON_SECRET: "cr+on/secret value", LEDGER_SYNC_KEY: PHRASE, VAPID_PRIVATE_KEY: 'q"uote\\d' };
    const dirty = {
      errors: [
        "fetch failed https://api.the-odds-api.com/v4/sports/x/odds?bookmakers=draftkings,fanduel&apiKey=test-key-never-logged&markets=h2h",
        `bad header x-cron-key: cr+on/secret value (${encodeURIComponent("cr+on/secret value")})`,
        "phrase was test-phrase",
        'vapid q"uote\\d',
        "someone else's apikey=abc123&x=1 and api_key=zzz",
      ],
      n: 3,
      nested: { ok: true, note: null },
    };
    const clean = scrub(dirty, env);
    const s = JSON.stringify(clean);
    for (const v of ["test-key-never-logged", "cr+on/secret value", encodeURIComponent("cr+on/secret value"), "test-phrase", 'q\\"uote', "abc123", "zzz"]) expect(s).not.toContain(v);
    expect(clean.errors[0]).toBe("fetch failed https://api.the-odds-api.com/v4/sports/x/odds?bookmakers=draftkings,fanduel&apiKey=[redacted]&markets=h2h");
    expect(clean.errors[4]).toBe("someone else's apikey=[redacted]&x=1 and api_key=[redacted]");
    expect([clean.n, clean.nested]).toEqual([3, { ok: true, note: null }]);
    /* short or unset values are not treated as secrets (they would shred ordinary text) */
    expect(scrub({ a: "abc ok" }, { ODDS_API_KEY: "abc", CRON_SECRET: "" })).toEqual({ a: "abc ok" });
  });

  it("an error that carries the Odds API key comes back without it", async () => {
    vi.stubEnv("ODDS_API_KEY", "test-key-never-logged");
    const w = world(() => new Error("request to https://api.the-odds-api.com/v4/x?apiKey=test-key-never-logged failed"));
    const r = await handleRun(MACHINE, { force: "1" }, w.run);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("test-key-never-logged");
    expect(r.body.errors).toEqual(["nfl: request to https://api.the-odds-api.com/v4/x?apiKey=[redacted] failed"]);
  });
});

/** One pick recorded, the game played to `home`-`away`, and graded. */
async function played(home: number, away: number) {
  const scores: ScoreProvider = async (picks) => new Map(picks.map((p) => [p.id, { home, away, final: true, status: "final", start: KICK }]));
  const w = world(() => [{}], {});
  w.deps.scores = scores;
  const first = await runPicks(w.deps, { trigger: "manual-ui" });
  w.clock.set(Date.parse(KICK) + 4 * 3600_000);
  w.nfl.shape = () => [];
  const after = await runPicks(w.deps, { trigger: "cron", force: true });
  return { ...w, pick: first.picks[0], after };
}

describe("the report", () => {
  it("is behind the sync phrase, with the two answers /api/ledger gives", async () => {
    const kv = memoryKv(clockAt());
    expect(await handleReport({ ...PERSON, store: false }, {}, kv, 0)).toEqual({ status: 503, body: { error: "sync-not-configured", missing: ["store"] } });
    expect(await handleReport({ ...PERSON, syncSet: false, sync: false }, {}, kv, 0)).toEqual({ status: 503, body: { error: "sync-not-configured", missing: ["key"] } });
    /* the cron secret runs the engine; it does not read the ledger */
    expect(await handleReport(MACHINE, {}, kv, 0)).toEqual({ status: 401, body: { error: "bad-sync-key" } });
    expect(await handleReport(OPEN, {}, kv, 0)).toEqual({ status: 401, body: { error: "bad-sync-key" } });
  });

  it("every number in it is a from-scratch recomputation of the raw ledger, split DraftKings / FanDuel / combined", async () => {
    const w = await played(24, 21);
    const r = await handleReport(PERSON, {}, w.kv, w.clock());
    const rows = await readLedger(w.kv);
    expect(r.status).toBe(200);
    expect(r.body.report).toEqual(JSON.parse(JSON.stringify(reportOf(rows, w.clock()))));
    const rep = r.body.report as ReturnType<typeof reportOf>;
    expect(Object.keys(rep.byBook).sort()).toEqual(["combined", "draftkings", "fanduel"]);
    expect(rep.bank).toEqual(bankOf(rows));
    expect([rep.byBook.fanduel.picks, rep.byBook.draftkings.picks, rep.byBook.combined.won]).toEqual([1, 0, 1]);
    expect(r.body).toMatchObject({ ok: true, engine: ANYTIME_RULES.version, books: ["draftkings", "fanduel"], count: 1 });
    expect((r.body.rows as { pick: { id: string }; grade: { result: string } }[]).map((x) => [x.pick.id, x.grade.result])).toEqual([[w.pick.id, "won"]]);
    expect(r.body.health).toMatchObject({ state: "ok" });
    expect((r.body.runs as { runId: string; trigger: string; picks: number; graded: number }[]).map((x) => [x.runId, x.trigger, x.picks, x.graded])).toEqual([["run2", "cron", 0, 1], ["run1", "manual-ui", 1, 0]]);
    expect((r.body.exclusions as { defaults: { marketType: string }[] }).defaults.map((x) => x.marketType)).toContain("cfb:player_prop");
  });

  it("rows come newest first and limit cuts the rows, never the report", async () => {
    const w = world((ctx) => [{ eventId: `ev-${ctx.runId}`, selection: `Home -2.5 ${ctx.runId}` }]);
    for (let i = 0; i < 3; i++) {
      await runPicks(w.deps, { trigger: "manual-api" });
      w.clock.add(60_000);
    }
    const all = await handleReport(PERSON, {}, w.kv, w.clock());
    expect((all.body.rows as { pick: { eventId: string } }[]).map((x) => x.pick.eventId)).toEqual(["ev-run3", "ev-run2", "ev-run1"]);
    const one = await handleReport(PERSON, { limit: "1" }, w.kv, w.clock());
    expect((one.body.rows as { pick: { eventId: string } }[]).map((x) => x.pick.eventId)).toEqual(["ev-run3"]);
    expect([one.body.count, (one.body.report as ReturnType<typeof reportOf>).byBook.combined.picks]).toEqual([3, 3]);
    expect((await handleReport(PERSON, { limit: "0" }, w.kv, w.clock())).body.rows).toEqual([]);
    expect((await handleReport(PERSON, { from: "2027-01-01" }, w.kv, w.clock())).body.count).toBe(0);
  });

  it("rejects a malformed range or limit, and reports an unreachable store as 502 without throwing", async () => {
    const kv = memoryKv(clockAt());
    for (const ask of [{ from: "yesterday" }, { to: "2026-11-1" }, { limit: "lots" }, { limit: "-1" }, { limit: "2001" }]) expect((await handleReport(PERSON, ask, kv, 0)).status).toBe(400);
    const down: Kv = { ...kv, smembers: async () => Promise.reject(new Error("store 403")) };
    expect(await handleReport(PERSON, {}, down, 0)).toEqual({ status: 502, body: { error: "store unreachable: store 403" } });
  });
});

describe("not available in AZ", () => {
  it("is behind the sync phrase and needs a known action", async () => {
    const kv = memoryKv(clockAt());
    expect((await handleAction(MACHINE, { action: "not-in-az", id: "abcd" }, kv, 0)).status).toBe(401);
    expect((await handleAction({ ...PERSON, store: false }, { action: "not-in-az", id: "abcd" }, kv, 0)).status).toBe(503);
    expect((await handleAction(PERSON, null, kv, 0)).status).toBe(400);
    expect((await handleAction(PERSON, { action: "delete-pick", id: "abcd" }, kv, 0)).status).toBe(400);
    expect((await handleAction(PERSON, { action: "not-in-az" }, kv, 0)).status).toBe(400);
    expect((await handleAction(PERSON, { action: "not-in-az", id: "abcd", exclude: "no" }, kv, 0)).status).toBe(400);
    expect(await handleAction(PERSON, { action: "not-in-az", id: "no-such-pick" }, kv, 0)).toEqual({ status: 404, body: { error: "no such pick" } });
    expect(kv.writes).toEqual([]);
  });

  it("voids the pick out of every result, adds its market type to the list, and the engine stops picking that market", async () => {
    const w = world((ctx) => [{ eventId: `ev-${ctx.runId}` }]);
    const first = await runPicks(w.deps, { trigger: "manual-ui" });
    const pick = first.picks[0];
    const stored = JSON.stringify(await w.kv.get(K.pick(pick.id)));

    const r = await handleAction(PERSON, { action: "not-in-az", id: pick.id }, w.kv, w.clock());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, id: pick.id, voided: true, alreadyVoid: false, excluded: "nfl:spread" });
    expect((await readStoredExclusions(w.kv)).map((x) => [x.marketType, x.by])).toEqual([["nfl:spread", "ui"]]);
    /* the pick itself is byte-for-byte what it was */
    expect(JSON.stringify(await w.kv.get(K.pick(pick.id)))).toBe(stored);
    const rep = reportOf(await readLedger(w.kv), w.clock());
    expect([rep.voided, rep.byBook.combined.picks]).toEqual([1, 0]);
    expect(await w.kv.smembers(K.open)).toEqual([]);

    /* the next run sees the same kind of market and records nothing */
    w.clock.add(60_000);
    const next = await runPicks(w.deps, { trigger: "manual-ui" });
    expect(next.picks).toEqual([]);
    expect(next.rejects.az_excluded).toBe(1);

    /* marked twice: the first mark stands, the list is not doubled */
    const again = await handleAction(PERSON, { action: "not-in-az", id: pick.id }, w.kv, w.clock());
    expect(again.body).toMatchObject({ ok: true, voided: false, alreadyVoid: true });
    expect(await readStoredExclusions(w.kv)).toHaveLength(1);
  });

  it("exclude:false voids only that pick; the market stays open", async () => {
    const w = world((ctx) => [{ eventId: `ev-${ctx.runId}` }]);
    const pick = (await runPicks(w.deps, { trigger: "manual-ui" })).picks[0];
    const r = await handleAction(PERSON, { action: "not-in-az", id: pick.id, exclude: false }, w.kv, w.clock());
    expect(r.body).toMatchObject({ voided: true, excluded: null });
    expect(await readStoredExclusions(w.kv)).toEqual([]);
    w.clock.add(60_000);
    expect((await runPicks(w.deps, { trigger: "manual-ui" })).picks).toHaveLength(1);
  });

  it("voiding a pick that was already graded takes it back out of both bankrolls", async () => {
    const w = await played(24, 21);
    expect(w.after.bank.graded).toBe(1);
    const r = await handleAction(PERSON, { action: "not-in-az", id: w.pick.id }, w.kv, w.clock());
    expect(r.body.bank).toEqual({ kelly: ANYTIME_RULES.kelly.start, flat: 0, graded: 0 });
    expect(JSON.parse((await w.kv.get(K.bank))!)).toMatchObject({ kelly: ANYTIME_RULES.kelly.start, flat: 0, graded: 0 });
    const rep = (await handleReport(PERSON, {}, w.kv, w.clock())).body.report as ReturnType<typeof reportOf>;
    expect([rep.bank.flat, rep.byBook.combined.graded, rep.voided]).toEqual([0, 0, 1]);
  });

  it("allow-market takes a market back off the stored list; a built-in Arizona rule cannot be lifted", async () => {
    const w = world((ctx) => [{ eventId: `ev-${ctx.runId}` }]);
    const pick = (await runPicks(w.deps, { trigger: "manual-ui" })).picks[0];
    await handleAction(PERSON, { action: "not-in-az", id: pick.id }, w.kv, w.clock());

    const lifted = await handleAction(PERSON, { action: "allow-market", marketType: "nfl:spread" }, w.kv, w.clock());
    expect(lifted.body).toMatchObject({ ok: true, removed: true });
    expect(await readStoredExclusions(w.kv)).toEqual([]);
    w.clock.add(60_000);
    expect((await runPicks(w.deps, { trigger: "manual-ui" })).picks).toHaveLength(1);
    expect((await handleAction(PERSON, { action: "allow-market", marketType: "nfl:spread" }, w.kv, w.clock())).body).toMatchObject({ removed: false });

    for (const m of ["cfb:player_prop", "cfb:player_prop:pass_yds", "cfb:prop"]) {
      const no = await handleAction(PERSON, { action: "allow-market", marketType: m }, w.kv, w.clock());
      expect(no.status).toBe(409);
    }
    expect((await handleAction(PERSON, { action: "allow-market", marketType: "NFL Spread" }, w.kv, w.clock())).status).toBe(400);
  });
});

describe("the public heartbeat", () => {
  const PUBLIC_KEYS = ["ageMinutes", "finishedAt", "lastStatus", "ok", "staleAfterMinutes", "state"];

  it("says never, then ok, then stale once a run is missed; only ok answers 200", async () => {
    const w = world();
    const none = await handleHealth(true, w.kv, w.clock());
    expect([none.status, none.body.state, none.body.ok]).toEqual([503, "never", false]);

    await runPicks(w.deps, { trigger: "cron", force: true });
    const ok = await handleHealth(true, w.kv, w.clock());
    expect(ok).toEqual({ status: 200, body: { ok: true, state: "ok", ageMinutes: 0, finishedAt: new Date(w.clock()).toISOString(), lastStatus: "ok", staleAfterMinutes: 45 } });

    w.clock.add(45 * 60_000);
    expect((await handleHealth(true, w.kv, w.clock())).status).toBe(200);
    w.clock.add(60_000);
    const stale = await handleHealth(true, w.kv, w.clock());
    expect([stale.status, stale.body.state, stale.body.ageMinutes]).toEqual([503, "stale", 46]);
  });

  it("a failed last run is a 503, and the reply carries no error text, pick, price or credit count", async () => {
    const w = world(() => new Error("Odds API 401 for nfl"));
    await runPicks(w.deps, { trigger: "cron", force: true });
    const r = await handleHealth(true, w.kv, w.clock());
    expect([r.status, r.body.state, r.body.lastStatus]).toEqual([503, "failed", "failed"]);
    expect(Object.keys(r.body).sort()).toEqual(PUBLIC_KEYS);
    expect(JSON.stringify(r.body)).not.toMatch(/Odds API|401|credit|pick|price/i);
  });

  it("no store configured, or a store that cannot be read, is a 503 and not a throw", async () => {
    const kv = memoryKv(clockAt());
    expect(await handleHealth(false, kv, 0)).toEqual({ status: 503, body: { ok: false, state: "unconfigured", staleAfterMinutes: 45 } });
    const down: Kv = { ...kv, get: async () => Promise.reject(new Error("store 403 token=abc")) };
    expect(await handleHealth(true, down, 0)).toEqual({ status: 503, body: { ok: false, state: "unreachable", staleAfterMinutes: 45 } });
  });
});

describe("the route files", () => {
  const src = (p: string) => readFileSync(p, "utf8");

  it("the run route is POST only, the health route is GET only, and both are never cached", async () => {
    const run = await import("../app/api/anytime/run/route");
    const health = await import("../app/api/anytime/health/route");
    const ledger = await import("../app/api/anytime/route");
    expect(Object.keys(run).sort()).toEqual(["POST", "dynamic", "maxDuration", "runtime"]);
    expect(Object.keys(health).sort()).toEqual(["GET", "dynamic", "runtime"]);
    expect(Object.keys(ledger).sort()).toEqual(["GET", "POST", "dynamic", "runtime"]);
    for (const m of [run, health, ledger]) expect([m.runtime, m.dynamic]).toEqual(["nodejs", "force-dynamic"]);
  });

  it("with nothing configured every route answers 503, and with secrets set an anonymous caller gets 401, all without a single outbound request", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (u: unknown) => {
      fetched.push(String(u));
      throw new Error("no network in this test");
    });
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "LEDGER_SYNC_KEY", "CRON_SECRET", "ODDS_API_KEY"]) vi.stubEnv(k, "");
    const run = await import("../app/api/anytime/run/route");
    const health = await import("../app/api/anytime/health/route");
    const ledger = await import("../app/api/anytime/route");
    const post = (path: string, headers: Record<string, string> = {}, body?: string) => new NextRequest(`https://x.test${path}`, { method: "POST", headers, body });

    expect((await run.POST(post("/api/anytime/run", { "x-pl-sync": PHRASE, "x-cron-key": CRON }))).status).toBe(503);
    expect((await ledger.GET(new NextRequest("https://x.test/api/anytime", { headers: { "x-pl-sync": PHRASE } }))).status).toBe(503);
    expect((await ledger.POST(post("/api/anytime", { "x-pl-sync": PHRASE }, JSON.stringify({ action: "not-in-az", id: "abcd" })))).status).toBe(503);
    const h = await health.GET();
    expect([h.status, await h.json()]).toEqual([503, { ok: false, state: "unconfigured", staleAfterMinutes: 45 }]);

    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://store.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "store-token-for-test");
    vi.stubEnv("LEDGER_SYNC_KEY", PHRASE);
    vi.stubEnv("CRON_SECRET", CRON);
    const anon = await run.POST(post("/api/anytime/run?force=1"));
    expect([anon.status, await anon.json(), anon.headers.get("cache-control")]).toEqual([401, { ok: false, error: "sync phrase or cron key required" }, "no-store"]);
    /* a secret in the URL is not a secret */
    expect((await run.POST(post(`/api/anytime/run?key=${CRON}`))).status).toBe(401);
    expect((await ledger.GET(new NextRequest("https://x.test/api/anytime"))).status).toBe(401);
    expect((await ledger.GET(new NextRequest("https://x.test/api/anytime", { headers: { "x-cron-key": CRON } }))).status).toBe(401);
    expect((await ledger.POST(post("/api/anytime", {}, JSON.stringify({ action: "not-in-az", id: "abcd" })))).status).toBe(401);
    expect(fetched).toEqual([]);
  });

  it("no route reads a secret from the URL or builds a date of its own", () => {
    for (const p of ["app/api/anytime/run/route.ts", "app/api/anytime/route.ts", "app/api/anytime/health/route.ts", "src/lib/server/anytime.ts"]) {
      const s = src(p);
      expect(s, p).not.toMatch(/searchParams\.get\(["'](key|secret|sync|token|pass)["']\)/);
      expect(s, p).not.toMatch(/cronKeyAuthed/);
      expect(s, p).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
      expect(s, p).not.toMatch(/timeZone:/);
      expect(s, p).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});
