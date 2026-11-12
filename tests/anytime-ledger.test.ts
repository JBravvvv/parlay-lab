import { describe, expect, it } from "vitest";
import { decide } from "@/lib/anytime/engine";
import { excludedBy } from "@/lib/az/exclusions";
import { memoryKv } from "@/lib/anytime/kv";
import {
  K, acquireLease, addExclusion, healthOf, loadEventStates, logRun, readHeartbeat, readLedger, readOpen, readPick, readStoredExclusions, recentRuns, releaseLease,
  removeExclusion, writeClose, writeGrade, writeHeartbeat, writePicks, writeVoid, type EventState, type Heartbeat,
} from "@/lib/anytime/ledger";
import { ANYTIME_RULES } from "@/lib/anytime/rules";
import type { CloseRecord, PickRecord } from "@/lib/anytime/types";
import { cand, clockAt, KICK, T0 } from "./helpers/anytime";

/* THE ANY-TIME LEDGER: append-only by construction. */

const pickOf = (over: Parameters<typeof cand>[0] = {}, now = T0): PickRecord =>
  decide({ candidates: [cand({ fetchedAt: now - 1_000, ...over })], now, runId: "r1", trigger: "manual-api", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];

describe("a pick is written once and never again", () => {
  it("records the pick, indexes it by Pacific day, and marks it open", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    const states = new Map<string, EventState>();
    const w = await writePicks(kv, [p], clock, states);
    expect(w.written).toEqual([p]);
    expect(await readPick(kv, p.id)).toEqual(p);
    expect(await kv.smembers(K.day("2026-11-15"))).toEqual([p.id]);
    expect(await kv.smembers(K.open)).toEqual([p.id]);
    expect(states.get("nfl|ev1")?.families[p.family]).toMatchObject({ id: p.id, seq: 1 });
    expect(states.get("nfl|ev1")?.kellyOpen).toBe(p.stakeKelly);
  });

  it("a second write of the same pick id changes nothing: the first record stands", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    await writePicks(kv, [p], clock, new Map());
    const forged = { ...p, price: +500, dec: 6, stakeKelly: 99, runId: "r2" };
    const w = await writePicks(kv, [forged], clock, new Map());
    expect(w.written).toEqual([]);
    expect(w.rejects[0]).toMatchObject({ reason: "lost_race", detail: p.id });
    expect(w.adopted).toEqual([p]);
    expect(await readPick(kv, p.id)).toEqual(p);
  });

  it("no code path overwrites or deletes a pick or a grade: across writes, grades, closes and voids the store sees only create-once on those keys", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const a = pickOf();
    const b = pickOf({ eventId: "ev2" });
    await writePicks(kv, [a, b], clock, new Map());
    await writePicks(kv, [a], clock, new Map());
    await writeClose(kv, { id: a.id, at: new Date(T0).toISOString(), snapshotId: "s", books: { fanduel: { price: -108, opp: -112, line: -2.5 } }, fairP: 0.5, fairN: 1, final: false });
    await writeGrade(kv, { id: a.id, result: "won", gradedAt: new Date(T0).toISOString(), source: "espn" });
    await writeGrade(kv, { id: a.id, result: "lost", gradedAt: new Date(T0).toISOString(), source: "espn" });
    await writeVoid(kv, { id: b.id, reason: "not_available_az", at: new Date(T0).toISOString(), by: "ui" });
    const onRecords = kv.writes.filter((w) => /^pl:at:(pick|grade|void):/.test(w.key));
    expect(onRecords.length).toBeGreaterThan(0);
    expect(onRecords.every((w) => w.op === "setNx")).toBe(true);
  });

  it("the write re-checks the clock: a pick whose event started between decision and write is not recorded", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf({ commence: new Date(T0 + 90_000).toISOString() });
    clock.set(T0 + 45_000);
    const w = await writePicks(kv, [p], clock, new Map());
    expect(w.written).toEqual([]);
    expect(w.rejects[0]).toMatchObject({ reason: "started", detail: "at write time" });
    expect(await readPick(kv, p.id)).toBeNull();
  });

  it("the write re-checks the snapshot age", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    clock.set(T0 + ANYTIME_RULES.freshnessMs + 1);
    const w = await writePicks(kv, [p], clock, new Map());
    expect(w.rejects[0].reason).toBe("stale_snapshot");
    expect(await kv.smembers(K.open)).toEqual([]);
  });

  it("refuses to store a pick at any book but the two", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    for (const bad of [{ book: "williamhill_us" }, { book: "pinnacle" }, { otherBook: "betmgm" }]) {
      await expect(writePicks(kv, [{ ...pickOf(), ...(bad as object) } as PickRecord], clock, new Map())).rejects.toThrow(/NOT A TWO-BOOK PICK/);
    }
    expect(Object.keys(kv.dump())).toEqual([]);
  });

  it("two triggers writing the same decision at once: exactly one record, the other adopts it", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    const [x, y] = await Promise.all([writePicks(kv, [p], clock, new Map()), writePicks(kv, [{ ...p, runId: "r2" }], clock, new Map())]);
    expect(x.written.length + y.written.length).toBe(1);
    expect(x.adopted.length + y.adopted.length).toBe(1);
    expect((await readLedger(kv)).length).toBe(1);
    expect(await kv.smembers(K.open)).toEqual([p.id]);
  });
});

describe("grades, closes and voids live beside the pick", () => {
  it("the first grade stands; a second is refused", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    await writePicks(kv, [p], clock, new Map());
    expect(await writeGrade(kv, { id: p.id, result: "won", gradedAt: "2026-11-16T01:00:00.000Z", source: "espn" })).toBe(true);
    expect(await writeGrade(kv, { id: p.id, result: "lost", gradedAt: "2026-11-16T02:00:00.000Z", source: "espn" })).toBe(false);
    const [row] = await readLedger(kv);
    expect(row.grade?.result).toBe("won");
    expect(row.pick).toEqual(p);
    expect(await readOpen(kv)).toEqual([]);
  });

  it("the close is the last look before the start; once final it is frozen", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    await writePicks(kv, [p], clock, new Map());
    const c = (price: number, final: boolean): CloseRecord => ({ id: p.id, at: new Date(clock()).toISOString(), snapshotId: "s", books: { fanduel: { price, opp: -112, line: -2.5 }, draftkings: { price: -112, opp: -108, line: -2.5 } }, fairP: 0.5, fairN: 2, final });
    expect(await writeClose(kv, c(-108, false))).toBe(true);
    expect(await writeClose(kv, c(-115, false))).toBe(true);
    expect(await writeClose(kv, c(-120, true))).toBe(true);
    expect(await writeClose(kv, c(+200, false))).toBe(false);
    expect((await readLedger(kv))[0].close?.books.fanduel?.price).toBe(-120);
    /* both books' closes are on the record */
    expect(Object.keys((await readLedger(kv))[0].close!.books).sort()).toEqual(["draftkings", "fanduel"]);
  });

  it("a void is recorded once and takes the pick out of the open set without touching it", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    await writePicks(kv, [p], clock, new Map());
    expect(await writeVoid(kv, { id: p.id, reason: "not_available_az", at: "2026-11-15T18:00:00.000Z", by: "ui", marketType: p.marketType })).toBe(true);
    expect(await writeVoid(kv, { id: p.id, reason: "other", at: "2026-11-15T19:00:00.000Z", by: "ui" })).toBe(false);
    const [row] = await readLedger(kv);
    expect(row.void?.reason).toBe("not_available_az");
    expect(row.pick).toEqual(p);
    expect(await readOpen(kv)).toEqual([]);
  });

  it("reads the ledger back in the order picks were made, filtered by Pacific day", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const a = pickOf();
    await writePicks(kv, [a], clock, new Map());
    clock.set(T0 + 24 * 3600_000);
    const b = pickOf({ eventId: "ev2", commence: "2026-11-17T01:15:00Z" }, clock());
    await writePicks(kv, [b], clock, new Map());
    expect((await readLedger(kv)).map((r) => r.pick.id)).toEqual([a.id, b.id]);
    expect((await readLedger(kv, { from: "2026-11-16" })).map((r) => r.pick.id)).toEqual([b.id]);
    expect((await readLedger(kv, { to: "2026-11-15" })).map((r) => r.pick.id)).toEqual([a.id]);
  });

  it("a damaged index entry never damages a pick: unreadable event state is treated as empty, the picks are untouched", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    const p = pickOf();
    await writePicks(kv, [p], clock, new Map());
    await kv.set(K.event("nfl", "ev1"), "{not json");
    const states = await loadEventStates(kv, [{ sport: "nfl", eventId: "ev1", commence: KICK }]);
    expect(states.get("nfl|ev1")?.families).toEqual({});
    /* the engine would decide the same pick again, and the write-once key still refuses it */
    const again = await writePicks(kv, [{ ...p, runId: "r9" }], clock, states);
    expect(again.written).toEqual([]);
    expect(again.adopted).toEqual([p]);
    expect(states.get("nfl|ev1")?.families[p.family]?.id).toBe(p.id);
    expect((await readLedger(kv)).map((r) => r.pick)).toEqual([p]);
  });
});

describe("the run lease", () => {
  it("one holder at a time; it expires on its own; only the holder can release it", async () => {
    const clock = clockAt();
    const kv = memoryKv(clock);
    expect(await acquireLease(kv, "a")).toBe(true);
    expect(await acquireLease(kv, "b")).toBe(false);
    await releaseLease(kv, "b");
    expect(await acquireLease(kv, "b")).toBe(false);
    clock.add(ANYTIME_RULES.leaseMs);
    expect(await acquireLease(kv, "b")).toBe(true);
    await releaseLease(kv, "a"); // a's lease is long gone; it must not free b's
    expect(await acquireLease(kv, "c")).toBe(false);
    await releaseLease(kv, "b");
    expect(await acquireLease(kv, "c")).toBe(true);
  });
});

describe("the Arizona list in the store", () => {
  it("adds once, removes, and survives a re-add", async () => {
    const kv = memoryKv(clockAt());
    const e = { marketType: "nfl:player_prop:pass_tds", reason: "not in the AZ app", at: "2026-11-15T17:00:00.000Z", by: "ui" };
    await addExclusion(kv, e);
    await addExclusion(kv, { ...e, reason: "again" });
    expect(await readStoredExclusions(kv)).toEqual([e]);
    expect(excludedBy(await readStoredExclusions(kv))("nfl:player_prop:pass_tds")).toBe(true);
    await removeExclusion(kv, e.marketType);
    expect(await readStoredExclusions(kv)).toEqual([]);
  });
});

describe("heartbeat: a dead scheduler shows within one missed run", () => {
  const hb = (over: Partial<Heartbeat> = {}): Heartbeat => ({ runId: "r1", trigger: "cron", startedAt: new Date(T0 - 5_000).toISOString(), finishedAt: new Date(T0).toISOString(), ok: true, status: "ok", picks: 2, candidates: 80, credits: 6, remaining: 90_000, ms: 5_000, errors: [], ...over });

  it("never run, ok, stale and failed are four different states", () => {
    expect(healthOf(null, T0).state).toBe("never");
    expect(healthOf(hb(), T0 + 60_000).state).toBe("ok");
    expect(healthOf(hb(), T0 + ANYTIME_RULES.heartbeatStaleMs).state).toBe("ok");
    const stale = healthOf(hb(), T0 + ANYTIME_RULES.heartbeatStaleMs + 1);
    expect(stale.state).toBe("stale");
    expect(stale.message).toMatch(/scheduler may be down/);
    const failed = healthOf(hb({ ok: false, status: "failed", errors: ["nfl: Odds API 401"] }), T0 + 60_000);
    expect(failed.state).toBe("failed");
    expect(failed.message).toContain("Odds API 401");
  });

  it("stale wins over failed, and a heartbeat with no finish time is stale", () => {
    expect(healthOf(hb({ ok: false, status: "failed" }), T0 + 3 * 3600_000).state).toBe("stale");
    expect(healthOf(hb({ finishedAt: "" }), T0).state).toBe("stale");
  });

  it("round-trips through the store, and the run log keeps the newest runs", async () => {
    const kv = memoryKv(clockAt());
    await writeHeartbeat(kv, hb());
    expect(await readHeartbeat(kv)).toEqual(hb());
    for (let i = 0; i < 5; i++) await logRun(kv, `r${i}`, { runId: `r${i}` });
    expect((await recentRuns<{ runId: string }>(kv, 3)).map((r) => r.runId)).toEqual(["r4", "r3", "r2"]);
  });
});
