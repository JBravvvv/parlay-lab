import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EV1_SINCE, FOUND, foundFootballMinEv } from "@/lib/found-mode";
import { CFB_RULES } from "@/lib/cfb/rules";
import { NFL_RULES } from "@/lib/nfl/rules";
import { landAtMs, ODDS_COUNT_MS, REEL_WINDOW_MS } from "@/components/props/ParlayReveal";

/* 2026-11-01, Josh: "Parlay Lab needs to be firing off more picks for NCAAF & NFL with the allotted money"
   — he chose the +1% bar (and removing the CFB 60-game cap, which is held for his sign-off on pinned tests). */
describe("football +1% found bar (EV1_SINCE)", () => {
  it("starts 2026-11-01", () => expect(EV1_SINCE).toBe("2026-11-01"));

  it("keeps +2% before the date and drops to +1% from it, for both desks", () => {
    for (const R of [CFB_RULES, NFL_RULES]) {
      expect(R.minEvPct).toBe(2);
      expect(foundFootballMinEv("2026-10-31", R.minEvPct)).toBe(2);
      expect(foundFootballMinEv("2026-11-01", R.minEvPct)).toBe(1);
      expect(foundFootballMinEv("2026-11-15", R.minEvPct)).toBe(1);
    }
  });

  it("never raises a floor already below 1, and pre-found dates are untouched", () => {
    expect(foundFootballMinEv("2026-11-01", 0.5)).toBe(0.5);
    expect(foundFootballMinEv("2026-09-01", 2)).toBe(2);
  });

  it("changes only the bar — stakes and the daily ceiling are unchanged", () => {
    expect(FOUND.daily).toBe(2500);
    expect(FOUND.kellyCap).toBe(0.02);
    expect(FOUND.minStake).toBe(5);
  });

  it("the found pass reads the dated floor at every gate, MLB untouched", () => {
    const src = readFileSync("src/lib/cfb/found.ts", "utf8");
    expect(src.match(/foundFootballMinEv\(board\.date, R\.minEvPct\)/g)?.length).toBe(2);
    expect(src).not.toMatch(/>= R\.minEvPct/);
    expect(readFileSync("src/lib/server/lock-card.ts", "utf8")).not.toMatch(/foundFootballMinEv/);
  });
});

describe("faster parlay reveal (2026-11-01)", () => {
  it("a 4-leg respin finishes in under 1.2 s, a 20-leg one under 1.7 s", () => {
    expect(landAtMs(3, 4) + ODDS_COUNT_MS + 300).toBeLessThan(1200);
    expect(landAtMs(19, 20) + ODDS_COUNT_MS + 300).toBeLessThan(1700);
    expect(REEL_WINDOW_MS).toBeLessThanOrEqual(810);
  });

  it("a football live respin inside a minute of the last pull reuses those quotes", () => {
    const src = readFileSync("src/components/cfb/CfbProps.tsx", "utf8");
    expect(src).toMatch(/const LIVE_RESPIN_REUSE_MS = 60_000;/);
    expect(src).toMatch(/Date\.now\(\)-lastLiveRefresh\.current\.at<LIVE_RESPIN_REUSE_MS\)\{gen\.spin\(\);return;\}/);
  });
});
