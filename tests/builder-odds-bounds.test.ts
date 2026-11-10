import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ODDS_NUDGE_STEP, ODDS_SLIDE_STEP, amToScale, nudgeAm, oddsScaleRange, scaleToAm } from "@/components/props/GenSheet";

/* 2026-11-09, Josh: Min/Max stacked, a slider under each, "+/- by 5 for a quick edit after sliding to
   -220 then press + once to -215"; bigger tick boxes; quicker dropdowns. */
describe("builder odds bounds", () => {
  it("the slider lands on 10s and the nudge moves 5", () => {
    expect(ODDS_SLIDE_STEP).toBe(10);
    expect(ODDS_NUDGE_STEP).toBe(5);
  });
  it("nudges cross the -100 / +100 gap without ever landing inside it", () => {
    expect(nudgeAm(-220, 5)).toBe(-215);
    expect(nudgeAm(-215, -5)).toBe(-220);
    expect(nudgeAm(-105, 5)).toBe(100);
    expect(nudgeAm(100, -5)).toBe(-105);
    expect(nudgeAm(100, 5)).toBe(105);
    expect(nudgeAm(-100, 5)).toBe(105);
    for (let am = -400; am <= 400; am += 5) {
      if (Math.abs(am) < 100) continue;
      const up = nudgeAm(am, 5);
      expect(Math.abs(up)).toBeGreaterThanOrEqual(100);
      expect(scaleToAm(amToScale(up))).toBe(up === -100 ? 100 : up);
    }
  });
  it("the slider spans the posted prices, rounded out to 10s and held inside ±1000", () => {
    expect(oddsScaleRange([])).toEqual([-400, 400]);
    expect(oddsScaleRange([-152, 110, 245])).toEqual([-60, 150]);
    expect(oddsScaleRange([-5000, 7500])).toEqual([-900, 900]);
    const [lo, hi] = oddsScaleRange([-110, -105]);
    expect(hi - lo).toBeGreaterThanOrEqual(100);
  });
  it("the sheet stacks Min over Max, each with its own slider and a −/+ pair", () => {
    const src = readFileSync("src/components/props/GenSheet.tsx", "utf8");
    expect(src).toContain('<OddsBound kind="min"');
    expect(src).toContain('<OddsBound kind="max"');
    expect(src.indexOf('<OddsBound kind="min"')).toBeLessThan(src.indexOf('<OddsBound kind="max"'));
    expect(src).toContain("odds down ${ODDS_NUDGE_STEP}");
    expect(src).toContain("odds up ${ODDS_NUDGE_STEP}");
  });
  it("the menus close before the page re-renders, and the tick boxes are 22px", () => {
    const ms = readFileSync("src/components/props/MultiSelect.tsx", "utf8");
    expect(ms).toContain("requestAnimationFrame(() => setTimeout(run, 0))");
    expect(ms.indexOf("close();", ms.indexOf("const commit"))).toBeLessThan(ms.indexOf("onChange(next)"));
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".discovery-option input { width:22px; height:22px;");
  });
});
