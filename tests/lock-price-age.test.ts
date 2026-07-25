import { beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { Engine } from "@/engine";

/**
 * PRICE-AGE GUARD (2026-07-25)
 *
 * Locking uses the board's STORED prices — shCardCalc reads SH.board.data with no
 * re-fetch, and shTicketSnap writes czOdds/czDec straight into the append-only ledger.
 * The only prior guard was a whole-DAY date check, so a 9am board could be locked at
 * 4pm and the ledger would record prices that were never available; CLV would then
 * compare a real close against an `imp` that was never locked at.
 *
 * This is a CURRENT-STATE defect, not a precaution for a later-cron workflow.
 */

let eng: Engine;

beforeAll(async () => {
  vi.setSystemTime(FROZEN_NOW);
  eng = fixtureEngine();
  const slate = await eng.collectSlate();
  const data = eng.analyze(slate);
  const SH = eng.get<Record<string, unknown>>("SH");
  SH.board = { date: eng.get<() => string>("shToday")(), data, v: 10, at: Date.now() };
  SH.bankroll = 2500;
  SH.daily = 250;
}, 200000);

const status = () => {
  const calls: string[] = [];
  eng.set("shStatus", (m: string) => calls.push(m));
  return calls;
};
const lockWithBoardAgeMin = (min: number) => {
  const SH = eng.get<Record<string, unknown>>("SH");
  (SH.board as { at: number }).at = Date.now() - min * 60_000;
  const calls = status();
  eng.get<() => void>("shLockCard")();
  return calls.join(" | ");
};

describe("a card cannot be locked against stale prices", () => {
  it("blocks a board older than the limit, naming the age and the fix", () => {
    const msg = lockWithBoardAgeMin(180); // the 9am-board-locked-at-noon case
    expect(msg).toMatch(/Lock blocked/);
    expect(msg).toMatch(/180m old/);
    expect(msg).toMatch(/Generate/);
    expect(msg).toMatch(/Confirm price/); // the existing per-ticket correction path
  });

  it("blocks at the boundary + 1 and not at the boundary", () => {
    const cfg = eng.get<{ lockMaxAgeMin: number }>("SH_CFG");
    expect(cfg.lockMaxAgeMin).toBe(30);
    expect(lockWithBoardAgeMin(cfg.lockMaxAgeMin + 1)).toMatch(/Lock blocked/);
    expect(lockWithBoardAgeMin(cfg.lockMaxAgeMin)).not.toMatch(/Lock blocked/);
  });

  it("a fresh board is never blocked by this guard", () => {
    expect(lockWithBoardAgeMin(0)).not.toMatch(/Lock blocked/);
    expect(lockWithBoardAgeMin(5)).not.toMatch(/Lock blocked/);
  });

  it("the limit is one named constant, so revising it is one character", () => {
    const cfg = eng.get<{ lockMaxAgeMin: number }>("SH_CFG");
    cfg.lockMaxAgeMin = 90;
    expect(lockWithBoardAgeMin(60)).not.toMatch(/Lock blocked/);
    expect(lockWithBoardAgeMin(120)).toMatch(/Lock blocked/);
    cfg.lockMaxAgeMin = 30;
  });
});
