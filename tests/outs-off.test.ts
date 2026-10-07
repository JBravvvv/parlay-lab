import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { OUTS_OFF_SINCE, isOutsOff } from "@/lib/found-mode";
import { buildLockEntry } from "@/lib/server/lock-card";
import { assertAppendOnly } from "@/lib/append-only";

/**
 * PITCHER OUTS OFF THE CARD (2026-10-06, Josh, verbatim in src/lib/found-mode.ts: "Yes, keep pitcher
 * outs off the card until it's fixed"). From OUTS_OFF_SINCE the MLB found pass seats no bet with a
 * pitcher-outs leg; strikeouts and every other straight market are untouched, and days before the gate
 * keep the rule they ran under. Prices are the fixture's own; no network is reached.
 */

afterEach(() => vi.useRealTimers());

const legsOf = (t: Record<string, unknown>) => ((t.legs as Array<Record<string, unknown>>) ?? []);
const hasOuts = (t: Record<string, unknown>) =>
  String(t.id ?? "").startsWith("pitcher_outs") || legsOf(t).some((l) => JSON.stringify(l).includes("pitcher_outs"));

async function build() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  const eng = armedFixtureEngine();
  const d = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
  /* TEST DOUBLE (as tests/straight-only.test.ts): every straight row's model probability +20 points so
     the blended edge is positive and the gate, not the price, decides; prices untouched */
  const cats = (d.categories ?? {}) as Record<string, Array<Record<string, unknown>>>;
  /* only the two pitcher markets stay on the slate, so moneylines don't fill the day first and the
     gate — not the budget — is what keeps an outs bet off */
  for (const k of Object.keys(cats)) cats[k] = (cats[k] ?? []).filter((r) => /pitcher_(outs|strikeouts)/.test(JSON.stringify(r)));
  for (const rows of Object.values(cats)) for (const r of rows ?? []) if (r && r.prob != null) r.prob = Math.min(97, Number(r.prob) + 20);
  return { eng, d };
}

describe("pitcher outs off the card", () => {
  it("the gate starts 2026-10-06 and only on found days", () => {
    expect(OUTS_OFF_SINCE).toBe("2026-10-06");
    expect(isOutsOff("2026-10-05")).toBe(false);
    expect(isOutsOff("2026-10-06")).toBe(true);
    expect(isOutsOff("2026-11-01")).toBe(true);
    expect(isOutsOff("2026-09-30")).toBe(false);
    expect(isOutsOff(null)).toBe(false);
  });

  it("a found day from the gate seats no pitcher-outs bet; the day before still could", async () => {
    const { eng, d } = await build();
    const before = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-05", now: FROZEN_NOW, trigger: "test" });
    const beforeAll = [...before.core, ...(before.funT ?? [])] as Array<Record<string, unknown>>;
    expect(beforeAll.some(hasOuts), "the fixture must seat an outs bet without the gate, or the gate is untested").toBe(true);

    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-06", now: FROZEN_NOW, trigger: "test" });
    const all = [...e.core, ...(e.funT ?? [])] as Array<Record<string, unknown>>;
    expect(e.core.length, "strikeouts still seat").toBeGreaterThan(0);
    expect(e.core.every((t) => String(t.id).startsWith("pitcher_strikeouts"))).toBe(true);
    expect(all.some(hasOuts)).toBe(false);
    expect(Number((e.blockedReasons as Record<string, number>).found_outs_off)).toBeGreaterThan(0);
  });

  it("outs bets already locked today ride through; the later pass only appends non-outs bets", async () => {
    const { eng, d } = await build();
    const early = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-05", now: FROZEN_NOW, trigger: "test" });
    const outs = (early.core as Array<Record<string, unknown>>).filter(hasOuts);
    expect(outs.length).toBeGreaterThan(0);
    const carry = { ...early, date: "2026-10-06", core: outs, funT: [], allocSum: outs.reduce((a, t) => a + Number(t.stake), 0) };
    const e = buildLockEntry({ eng: eng as never, data: d, date: "2026-10-06", now: FROZEN_NOW + 60_000, trigger: "11am", carry: carry as never });
    expect(() => assertAppendOnly(carry as never, e as never, "outs-off carry")).not.toThrow();
    const ids = new Set(outs.map((t) => t.id));
    expect((e.core as Array<Record<string, unknown>>).filter((t) => ids.has(t.id)).length).toBe(outs.length);
    expect((e.core as Array<Record<string, unknown>>).filter((t) => !ids.has(t.id)).some(hasOuts)).toBe(false);
  });

  it("is wired in the MLB found pass behind the date gate", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/server/lock-card.ts"), "utf8");
    expect(src).toContain("const outsOff = isOutsOff(date);");
    expect(src).toMatch(/if \(outsOff && legs\.some\(\(l\) => legMarket\(l as never\) === "pitcher_outs"\)\) \{ reasons\.found_outs_off\+\+; continue; \}/);
  });
});
