import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { NFL_PROPS } from "@/lib/nfl/rules";

/**
 * 2026-09-19, Josh, verbatim: "Prop bets are not loading for CFP games that start in 6 hours 15
 * minutes." The two football props routes ran on the platform's default function duration: a cold
 * Saturday pull is up to `maxEvents` Odds API event calls at CONCURRENCY 4, tens of seconds, and a
 * function killed mid-pull answers the phone with nothing while the credits it spent are gone. The
 * routes now declare the 300 s ceiling every other spending route here declares. Nothing about the
 * pull, its rails or its windows changed — this pins the ceiling and the arithmetic behind it.
 */
const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

describe("the football props routes declare a duration ceiling (2026-09-19)", () => {
  for (const p of ["app/api/cfb/props/route.ts", "app/api/nfl/props/route.ts"]) {
    it(`${p} exports maxDuration 300 beside its force-dynamic`, () => {
      const src = readSrc(p);
      expect(src).toMatch(/export const maxDuration = 300;/);
      expect(src).toMatch(/export const dynamic = "force-dynamic";/);
    });
  }
  it("300 s covers the worst cold pull on either desk: maxEvents calls at CONCURRENCY, even at 10 s a call", () => {
    const m = readSrc("src/lib/server/football-props.ts").match(/const CONCURRENCY = (\d+);/);
    expect(m).not.toBeNull();
    const conc = Number(m![1]);
    expect(conc).toBe(4);
    for (const props of [CFB_PROPS, NFL_PROPS]) expect(Math.ceil((props.maxEvents + props.liveMaxEvents) / conc) * 10).toBeLessThanOrEqual(300);
  });
  it("the same ceiling the other spending routes declare — one number, not a new one", () => {
    expect(readSrc("app/api/generate/route.ts")).toMatch(/export const maxDuration = 300;/);
    expect(readSrc("app/api/refill/route.ts")).toMatch(/export const maxDuration = 300;/);
  });
});
