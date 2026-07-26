import { describe, expect, it } from "vitest";
import { discipline, mergeNoPlayLogs, validateNoPlayLog, type NoPlayLog } from "@/lib/noplay";
import type { SyncEntry } from "@/lib/ledger-merge";

/* Hardening Phase 3: override accountability. Figures derive from the ledger's
   own overrode stamp + the synced NO-PLAY verdict log; nothing reconstructed. */

const day = (
  date: string,
  overrode: boolean,
  tickets: { stake: number; result?: string; payout?: number }[],
): SyncEntry =>
  ({
    date,
    locked: true,
    overrode,
    core: tickets.map((t, i) => ({ id: `${date}-t${i}`, stake: t.stake })),
    funT: [],
    grading: {
      done: true,
      tickets: Object.fromEntries(
        tickets.map((t, i) => [`${date}-t${i}`, t.result ? { result: t.result, payout: t.payout ?? 0 } : undefined]).filter(([, v]) => v),
      ),
    },
  }) as unknown as SyncEntry;

describe("NO-PLAY log merge (hardening Phase 3)", () => {
  it("union by date, earlier sighting wins, symmetric + idempotent", () => {
    const a: NoPlayLog = { "2026-07-20": { at: 100, mode: "ev_gated" } };
    const b: NoPlayLog = { "2026-07-20": { at: 50, mode: "dk_fd" }, "2026-07-21": { at: 200, mode: "ev_gated" } };
    const m = mergeNoPlayLogs(a, b);
    expect(m["2026-07-20"].at).toBe(50);
    expect(Object.keys(m)).toHaveLength(2);
    expect(mergeNoPlayLogs(b, a)).toEqual(m);
    expect(mergeNoPlayLogs(m, m)).toEqual(m);
  });

  it("validates the wire shape", () => {
    expect(validateNoPlayLog(null).ok).toBe(false);
    expect(validateNoPlayLog({ "not-a-date": { at: 1 } }).ok).toBe(false);
    expect(validateNoPlayLog({ "2026-07-20": { at: 0 } }).ok).toBe(false);
    expect(validateNoPlayLog({ "2026-07-20": { at: 1, mode: "ev_gated" } }).ok).toBe(true);
  });
});

describe("discipline report", () => {
  const today = "2026-07-24";
  const entries = [
    // this month: one gated day, one override day
    day("2026-07-20", false, [
      { stake: 20, result: "won", payout: 45 }, // +25
      { stake: 10, result: "lost" }, // −10
    ]),
    day("2026-07-22", true, [{ stake: 15, result: "lost" }]), // override, −15
    // last month: gated only (lifetime picks it up, month does not)
    day("2026-06-15", false, [{ stake: 10, result: "won", payout: 18 }]), // +8
  ];
  const noplay: NoPlayLog = {
    "2026-07-21": { at: 1, mode: "ev_gated" }, // honored — no lock that day
    "2026-07-22": { at: 2, mode: "ev_gated" }, // overridden — the override lock exists
    "2026-07-24": { at: 3, mode: "ev_gated" }, // TODAY — pending, not yet honored
  };

  it("an override ticket and a gated ticket land in the correct buckets with correct P/L (acceptance)", () => {
    const d = discipline(entries, noplay, today);
    expect(d.month.gated.tickets).toBe(2);
    expect(d.month.gated.staked).toBe(30);
    expect(d.month.gated.pl).toBeCloseTo(15);
    expect(d.month.gated.roi).toBeCloseTo(0.5);
    expect(d.month.override.tickets).toBe(1);
    expect(d.month.override.pl).toBeCloseTo(-15);
    expect(d.month.override.roi).toBeCloseTo(-1);
    expect(d.lifetime.gated.tickets).toBe(3);
    expect(d.lifetime.gated.pl).toBeCloseTo(23);
  });

  it("a NO-PLAY day with no override increments honored; today's verdict stays pending (acceptance)", () => {
    const d = discipline(entries, noplay, today);
    expect(d.month.noPlay.honored).toBe(1); // 07-21 only — 07-22 was overridden, 07-24 is today
    expect(d.month.noPlay.overridden).toBe(1);
    expect(d.lifetime.noPlay).toEqual(d.month.noPlay); // no NO-PLAY records outside the month
  });

  it("pending tickets stake but never settle — ROI denominator stays honest", () => {
    const d = discipline([day("2026-07-23", false, [{ stake: 12 }])], {}, today);
    expect(d.month.gated.tickets).toBe(1);
    expect(d.month.gated.staked).toBe(12);
    expect(d.month.gated.settled).toBe(0);
    expect(d.month.gated.roi).toBeNull();
  });

  it("history is never reconstructed: overridden counts come only from ledger stamps", () => {
    // an old override day with NO noplay record still counts as overridden;
    // an old gated day never becomes "honored" retroactively
    const d = discipline([day("2026-05-01", true, [{ stake: 5, result: "lost" }])], {}, today);
    expect(d.lifetime.noPlay.overridden).toBe(1);
    expect(d.lifetime.noPlay.honored).toBe(0);
  });
});

/* CORE/FUN split (2026-07-26) — the misread this fixes: a NO-PLAY day locked with FUN
   only used to count as an honored NO-PLAY *and* pour its stake and P/L into the `gated`
   line, which is meant to be EV-gated core action. Both halves are asserted here. */
describe("discipline — CORE and FUN are distinguishable", () => {
  const day = (date: string, core: unknown[], funT: unknown[], grading: unknown) =>
    ({ date, locked: true, core, funT, grading }) as never;
  const tkt = (id: string, stake: number) => ({ id, stake, legs: [] });
  const graded = (id: string, payout: number) => ({ tickets: { [id]: { result: payout > 0 ? "won" : "lost", payout } } });

  it("a FUN-only lock on a NO-PLAY day does not masquerade as gated core action", () => {
    const d = discipline(
      [day("2026-07-20", [], [tkt("f1", 5)], graded("f1", 0))],
      { "2026-07-20": { at: 1, mode: "ev_gated" } },
      "2026-07-26",
    );
    const m = d.lifetime;
    expect(m.noPlay.honored).toBe(1); // the CORE gate was honored — true, and still reported
    expect(m.noPlay.funOnly).toBe(1); // but the day was not action-free, and now it says so
    expect(m.gated.fun.tickets).toBe(1);
    expect(m.gated.fun.staked).toBe(5);
    expect(m.gated.core.tickets).toBe(0); // the number that used to be wrong
    expect(m.gated.core.staked).toBe(0);
  });

  it("totals still equal core + fun, so nothing that read the old shape breaks", () => {
    const d = discipline(
      [day("2026-07-21", [tkt("c1", 100)], [tkt("f1", 5)], graded("c1", 250))],
      {},
      "2026-07-26",
    );
    const g = d.lifetime.gated;
    expect(g.tickets).toBe(g.core.tickets + g.fun.tickets);
    expect(g.staked).toBe(g.core.staked + g.fun.staked);
    expect(g.pl).toBe(g.core.pl + g.fun.pl);
    expect(g.core.pl).toBe(150);
    expect(g.fun.pl).toBe(0); // ungraded FUN ticket contributes nothing to settled/pl
    expect(g.fun.settled).toBe(0);
  });

  it("a day with core action is NOT counted as funOnly", () => {
    const d = discipline(
      [day("2026-07-22", [tkt("c1", 100)], [tkt("f1", 5)], graded("c1", 0))],
      { "2026-07-22": { at: 1, mode: "ev_gated" } },
      "2026-07-26",
    );
    expect(d.lifetime.noPlay.funOnly).toBe(0);
  });
});
