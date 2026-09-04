/**
 * LEDGER ERAS (2026-09-04). Josh, verbatim: "Create a new net P/L for Core & Fun
 * money from today forward since things were changed. Don't remove the old data
 * just make the default view for each today forward (9/4/26) and create the
 * ability to click a tab that shows pre new ledger data which was 8/15-9/3".
 * Synthetic entries only — no number here is a real ledger figure.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ERA, LEDGER_ERAS, eraEntries, inEra, ledgerStats } from "../src/lib/ledger-stats";
import type { LedgerEntry } from "../src/lib/useLedger";

const tk = (id: string, bucket: "core" | "fun", stake: number) => ({ id, bucket, name: id, stake, legs: [] });
const day = (date: string, grades: Record<string, { result: string; payout: number }>, locked = true): LedgerEntry => ({
  date, locked, daily: 150, fun: 25,
  core: [tk(`${date}-c1`, "core", 25), tk(`${date}-c2`, "core", 25)],
  funT: [tk(`${date}-f1`, "fun", 10)],
  grading: { tickets: grades, legs: {}, done: true },
});
const E: LedgerEntry[] = [
  day("2026-08-15", { "2026-08-15-c1": { result: "won", payout: 47.5 }, "2026-08-15-c2": { result: "lost", payout: 0 }, "2026-08-15-f1": { result: "lost", payout: 0 } }),
  day("2026-09-03", { "2026-09-03-c1": { result: "lost", payout: 0 }, "2026-09-03-c2": { result: "push", payout: 25 }, "2026-09-03-f1": { result: "won", payout: 900 } }),
  day("2026-09-04", { "2026-09-04-c1": { result: "won", payout: 52 }, "2026-09-04-c2": { result: "pending", payout: 0 }, "2026-09-04-f1": { result: "ungradable", payout: 0 } }),
  day("2026-09-05", {}, false),
];

describe("era table", () => {
  it("defaults to today-forward and keeps the 8/15–9/3 record whole", () => {
    expect(DEFAULT_ERA).toBe("current");
    expect(LEDGER_ERAS.map((e) => [e.key, e.from, e.to])).toEqual([
      ["current", "2026-09-04", null],
      ["v1", "2026-08-15", "2026-09-03"],
    ]);
    expect(inEra("2026-09-03", LEDGER_ERAS[1])).toBe(true);
    expect(inEra("2026-09-04", LEDGER_ERAS[1])).toBe(false);
    expect(inEra("2026-09-04", LEDGER_ERAS[0])).toBe(true);
    expect(inEra("2026-10-01", LEDGER_ERAS[0])).toBe(true);
  });
  it("eraEntries filters by date and drops unlocked days", () => {
    expect(eraEntries(E, LEDGER_ERAS[0]).map((e) => e.date)).toEqual(["2026-09-04"]);
    expect(eraEntries(E, LEDGER_ERAS[1]).map((e) => e.date)).toEqual(["2026-08-15", "2026-09-03"]);
  });
});

describe("ledgerStats — pure port of the engine's shLedgerStats", () => {
  it("core, old era: won pays the grader payout, push returns the stake, drawdown from the peak", () => {
    const s = ledgerStats(eraEntries(E, LEDGER_ERAS[1]), "core");
    expect(s.w).toBe(1); expect(s.l).toBe(2); expect(s.push).toBe(1);
    expect(s.staked).toBe(100); expect(s.ret).toBe(72.5); expect(s.pl).toBe(-27.5);
    expect(s.days.map((d) => d.cumPl)).toEqual([-2.5, -27.5]);
    expect(s.dd).toBe(27.5);
    expect(s.bigHit).toEqual({ payout: 900, name: "2026-09-03-f1", date: "2026-09-03" });
  });
  it("fun, old era: its own net, never folded into core", () => {
    const s = ledgerStats(eraEntries(E, LEDGER_ERAS[1]), "fun");
    expect(s.staked).toBe(20); expect(s.ret).toBe(900); expect(s.pl).toBe(880);
    expect(s.w).toBe(1); expect(s.l).toBe(1);
  });
  it("current era: pending and ungradable tickets are counted, not staked", () => {
    const c = ledgerStats(eraEntries(E, LEDGER_ERAS[0]), "core");
    expect(c.pending).toBe(1); expect(c.staked).toBe(25); expect(c.pl).toBe(27); expect(c.roi).toBeCloseTo(1.08);
    const f = ledgerStats(eraEntries(E, LEDGER_ERAS[0]), "fun");
    expect(f.ungradable).toBe(1); expect(f.staked).toBe(0); expect(f.roi).toBeNull(); expect(f.days[0].n).toBe(1);
  });
  it("an empty era is all zeros with no days", () => {
    const s = ledgerStats([], "core");
    expect(s.days).toEqual([]); expect(s.pl).toBe(0); expect(s.roi).toBeNull(); expect(s.bigHit).toBeNull();
  });
});

describe("Ledger page wiring", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/ledger/page.tsx"), "utf8");
  it("stats, scoreboard, receipts and locked days all read the era-filtered list", () => {
    expect(src).toMatch(/useState<LedgerEra\["key"\]>\(DEFAULT_ERA\)/);
    expect(src).toMatch(/ledgerStats\(eraList, scope\)/);
    expect(src).toMatch(/<ProScoreboard entries=\{eraList\}/);
    expect(src).toMatch(/<ReceiptsPanel entries=\{eraList as never\}/);
    expect(src).toMatch(/\[\.\.\.eraList\]\.reverse\(\)/);
    expect(src).toMatch(/data-testid="ledger-eras"/);
    expect(src).not.toMatch(/api\.stats\(scope\)/);
  });
});
