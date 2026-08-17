import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { publicCardView } from "@/lib/server/card-view";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * THE PUBLIC PAPER CARD (2026-08-16, Josh: "Show me the fun money HR tickets for
 * today too"). The paper card is the system's own hypothetical output — the same
 * publicity class as /api/picks — so the board API now serves it leg-by-leg.
 *
 * THE ONE HARD RULE: ONLY PAPER ENTRIES ARE EVER SERVED. An epoch-1 real-money entry
 * (real stakes, Josh's placed/actualStake answers) must never reach the open route,
 * whatever the store happens to hold. publicCardView is the gate: entry.paper !== true
 * → null, unconditionally.
 */

const paperEntry = {
  date: "2026-08-16",
  locked: true,
  paper: true,
  daily: 150,
  allocSum: 150,
  gatedSum: 90,
  underShare: 0.2,
  core: [
    {
      id: "t1", stake: 35, name: "TB single", type: "batter_total_bases", czOdds: "-120", czDec: 1.83, prob: 62.1, czEv: 7.5,
      placed: false, actualStake: 0, paper: true,
      legs: [{ lkey: "p|batter_total_bases|1.5", label: "Judge (NYY)", prop: "TB O 1.5", cz: -120 }],
    },
    {
      id: "t2", stake: 10, name: "Hits parlay", type: "batter_hits", czOdds: "+140", czDec: 2.4, prob: 41, czEv: -12.8,
      placed: false, actualStake: 0, paper: true, forced: true,
      legs: [{ lkey: "a|batter_hits|0.5", label: "A (SEA)", prop: "Hits O 0.5", cz: -300 }],
    },
  ],
  funT: [
    {
      id: "f1", stake: 5, name: "HR Longshot · 4 hitters, 4 teams", type: "fun_hr", czOdds: "+2350", czDec: 24.5, prob: 0.9, czEv: -3,
      placed: false, actualStake: 0, paper: true,
      legs: [{ lkey: "x|batter_home_runs|0.5", label: "X (TEX)", prop: "HR O 0.5", cz: 320 }],
    },
  ],
  grading: { done: true, tickets: { t1: { result: "won", payout: 64 } }, legs: {} },
} as unknown as SyncEntry;

describe("publicCardView — the paper gate is unconditional", () => {
  it("PLANT: a real-money entry (epoch 1 shape, placed answers) returns NULL — never a field of it", () => {
    const real = {
      date: "2026-08-01", locked: true, daily: 75,
      core: [{ id: "r1", stake: 20, placed: true, actualStake: 20, legs: [] }],
      funT: [],
    } as unknown as SyncEntry;
    expect(publicCardView(real)).toBeNull();
    expect(publicCardView(null)).toBeNull();
  });
  it("a paper entry serves the whole card: stakes, prices, legs, forced flags, fun set, grading joins", () => {
    const v = publicCardView(paperEntry)!;
    expect(v).toBeTruthy();
    expect(v.paper).toBe(true);
    expect(v.daily).toBe(150);
    expect(v.gatedSum).toBe(90);
    expect(v.underShare).toBe(0.2);
    expect(v.core).toHaveLength(2);
    expect(v.core[0].legs[0].label).toBe("Judge (NYY)");
    expect(v.core[0].res).toBe("won"); // grading joined by ticket id
    expect(v.core[1].forced).toBe(true);
    expect(v.funT).toHaveLength(1);
    expect(v.funT[0].name).toMatch(/HR Longshot/);
    expect(v.funT[0].legs[0].prop).toBe("HR O 0.5");
  });
  it("what it serves NEVER includes the placement fields — even on paper they are the ledger's business", () => {
    const v = publicCardView(paperEntry)!;
    const flat = JSON.stringify(v);
    expect(flat).not.toMatch(/"placed"/);
    expect(flat).not.toMatch(/"actualStake"/);
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("the board route serves `card` through publicCardView on both paths", () => {
    const src = read("app/api/board/route.ts");
    expect(src).toMatch(/publicCardView\(/);
    expect((src.match(/card/g) ?? []).length).toBeGreaterThanOrEqual(2); // both responses carry it
  });
});
