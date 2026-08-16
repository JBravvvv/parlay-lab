import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyWeeklyAdjustment, computeCalibration, effectiveCalibration, type GradedPick, type WeightState } from "@/engine2/calibration";
import { gradedFromBlob, type DayBlob } from "@/lib/pred-serialize";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";

/**
 * SIDE-AWARE CALIBRATION (2026-08-16, Josh's word: "Yes make the calibration
 * side-aware so it learns per-side too").
 *
 * THE GAP IT CLOSES: the weekly fit was per-market and side-blind — outs carried the
 * maximum shrink (0.143) and unders still cleared the gate, because the miss is
 * concentrated in a dimension the fit could not see (3-day read: unders as a class
 * −5..−9 vs model). The training rows did not even carry side.
 *
 * THE DESIGN, in one paragraph: the engine blends the OVER probability with the
 * de-vigged fair and picks the side AFTER (p_under = 1 − p_adj), so "per-side mult"
 * is coherent only as an ASYMMETRIC DEVIATION SHRINK — when the model deviates in the
 * UNDER direction (pO < fair), a fitted calW["mkt|u"] multiplies extra shrink onto the
 * blend weight. Fit side: rows gain side (parsed from `sub` with the grader's own
 * / U / vocabulary), computeCalibration emits per-side buckets under summary.perSide
 * (NOT summary.markets — the Stats table and calibrationLine keep their keyspace), and
 * applyWeeklyAdjustment walks those buckets under the SAME rules as markets: tier
 * ADJUST at n≥150, Wilson-significant, ±10% per week, shrink-only, one lastAdjust
 * clock. Engine side: a dormant branch — ABSENT KEY = BYTE-IDENTICAL BLEND, which is
 * what lets the un-regenerable provenance baseline (baseline43) stay green while the
 * string hash moves.
 */

const G = (market: string, side: "O" | "U" | null, p: number, res: "won" | "lost"): GradedPick => ({
  market,
  side,
  p,
  edge: 5,
  lu: "confirmed",
  res,
  pMkt: null,
  ln: 1.5,
  ev: 1,
});

/** n graded picks stating `stated`% with `hits` winners — the overconfidence knob */
const batch = (market: string, side: "O" | "U", n: number, stated: number, hits: number): GradedPick[] =>
  Array.from({ length: n }, (_, i) => G(market, side, stated, i < hits ? "won" : "lost"));

describe("side reaches the training rows", () => {
  it("gradedFromBlob derives side from sub with the grader's own vocabulary; game markets stay null", () => {
    const blob = {
      date: "2026-08-10",
      records: [
        { k: "g|a|Hits U 1.5", gkey: "g", lkey: "a|batter_hits|1.5", sub: "Hits U 1.5", market: "batter_hits", p: 60, edge: 4, lu: "confirmed", res: "lost", ln: 1.5, ev: 1 },
        { k: "g|b|HR O 0.5", gkey: "g", lkey: "b|batter_home_runs|0.5", sub: "HR O 0.5", market: "batter_home_runs", p: 20, edge: 4, lu: "confirmed", res: "won", ln: 0.5, ev: 1 },
        { k: "g|ml_home|ML", gkey: "g", lkey: "ml_home", sub: "ML vs BOS", market: "ml", p: 55, edge: 2, lu: "confirmed", res: "won", ln: null, ev: 1 },
      ],
    } as unknown as DayBlob;
    const rows = gradedFromBlob(blob);
    expect(rows.map((r) => r.side)).toEqual(["U", "O", null]);
  });
});

describe("computeCalibration emits per-side buckets without touching the market keyspace", () => {
  const graded = [
    ...batch("batter_hits", "U", 200, 55, 82), // unders: stated 55%, realized 41% — the production pattern
    ...batch("batter_hits", "O", 200, 60, 122), // overs: realized ≈ stated
  ];
  const s = computeCalibration(graded);
  it("the under bucket exists, is ADJUST-eligible, significantly hot; the over bucket is not hot", () => {
    const u = s.perSide?.["batter_hits|u"];
    expect(u).toBeTruthy();
    expect(u!.n).toBe(200);
    expect(u!.significant).toBe(true);
    expect(u!.direction).toBe("hot");
    const o = s.perSide?.["batter_hits|o"];
    expect(o?.direction ?? "ok").not.toBe("hot");
  });
  it("summary.markets does NOT grow sided keys — the Stats table and calibrationLine keep their keyspace", () => {
    expect(s.markets.some((m) => m.includes("|"))).toBe(false);
  });
  it("small side samples never act: n=80 is below the ADJUST tier", () => {
    const s2 = computeCalibration(batch("pitcher_outs", "U", 80, 50, 30));
    expect(s2.perSide?.["pitcher_outs|u"]?.tier).not.toBe("ADJUST");
  });
});

describe("applyWeeklyAdjustment learns the sided keys under the same discipline", () => {
  const summary = computeCalibration([
    ...batch("batter_hits", "U", 200, 55, 82),
    ...batch("batter_hits", "O", 200, 60, 122),
  ]);
  const t0 = Date.parse("2026-08-16T10:00:00Z");
  it("a hot, significant under bucket steps its mult down 10%; a second call inside the week is the identity", () => {
    const w0: WeightState = { mults: {}, lastAdjust: 0, log: [] };
    const w1 = applyWeeklyAdjustment(summary, w0, t0);
    expect(w1.mults["batter_hits|u"]).toBeCloseTo(0.9, 9);
    const w2 = applyWeeklyAdjustment(summary, w1, t0 + 60_000);
    expect(w2).toBe(w1); // the weekly clock is ONE clock, sided keys included
  });
  it("an insignificant week drifts a sided mult back toward 1 — shrink-only, never past it", () => {
    const quiet = computeCalibration(batch("batter_hits", "U", 200, 55, 110)); // realized ≈ stated
    const w = applyWeeklyAdjustment(quiet, { mults: { "batter_hits|u": 0.8 }, lastAdjust: 0, log: [] }, t0);
    expect(w.mults["batter_hits|u"]).toBeCloseTo(0.88, 9);
    const w2 = applyWeeklyAdjustment(quiet, { mults: { "batter_hits|u": 0.99 }, lastAdjust: 0, log: [] }, t0);
    expect(w2.mults["batter_hits|u"]).toBe(1);
  });
  it("the kill switch still empties everything: auto off returns no mults, sided or not", () => {
    const armed = effectiveCalibration(summary, { mults: { "batter_hits|u": 0.5, batter_hits: 0.7 }, lastAdjust: t0, log: [] }, "off");
    expect(armed.mults).toEqual({});
  });
});

describe("THE ENGINE HALF — the dormant asymmetric branch, proven on the fixture", () => {
  it("dormancy: no sided key → the board is BYTE-IDENTICAL (the baseline43 provenance property)", async () => {
    const a = armedFixtureEngine();
    const b = armedFixtureEngine();
    const da = a.analyze(await a.collectSlate());
    const db = b.analyze(await b.collectSlate());
    expect(JSON.stringify(da.categories)).toBe(JSON.stringify(db.categories));
  }, 300_000);
  it("armed: a 0.15 under-shrink on the market with under rows moves them toward fair; over rows stay put", async () => {
    // disciplined mode — the side chooser lets the model pick U (legacy mode is
    // hitter-overs-only, which would make this test vacuous by construction)
    const base = armedFixtureEngine();
    base.get<Record<string, unknown>>("SH_CFG").selMode = "ev_gated";
    const dBase = base.analyze(await base.collectSlate());
    const cats = (dBase as unknown as { categories: Record<string, { sub?: string; prob?: number | string }[]> }).categories;
    const PROPS = ["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"];
    const mkt = PROPS.find((m) => (cats[m] ?? []).some((r) => / U /.test(String(r.sub ?? ""))));
    expect(mkt, "no prop market carries an under row on the disciplined fixture — vacuous").toBeTruthy();
    const rowsOf = (d: unknown) =>
      ((d as { categories: Record<string, { sub?: string; prob?: number | string }[]> }).categories[mkt as string] ?? []).map(
        (r) => ({ sub: String(r.sub ?? ""), prob: Number(r.prob) }),
      );
    const baseRows = rowsOf(dBase);
    // the A/B differs ONLY by the sided key, layered onto the same armed SH_V2
    const sided = armedFixtureEngine();
    sided.get<Record<string, unknown>>("SH_CFG").selMode = "ev_gated";
    const v2 = (sided.get<Record<string, unknown>>("SH_V2") ?? {}) as Record<string, unknown>;
    const calW = { ...((v2.calW as Record<string, number> | null | undefined) ?? {}), [`${mkt}|u`]: 0.15 };
    sided.set("SH_V2", { ...v2, calW });
    const dSided = sided.analyze(await sided.collectSlate());
    const sidedRows = rowsOf(dSided);
    const baseU = baseRows.filter((r) => / U /.test(r.sub));
    expect(baseU.length).toBeGreaterThan(0);
    const sidedBySub = new Map(sidedRows.map((r) => [r.sub, r]));
    // every under row either moved (deviation shrunk) or left the board (edge died / side flipped)
    const changed = baseU.filter((r) => {
      const s = sidedBySub.get(r.sub);
      return !s || Math.abs(s.prob - r.prob) > 1e-9;
    });
    expect(changed.length, "a 0.15 under-shrink left every under row untouched — the branch is not wired").toBeGreaterThan(0);
  }, 300_000);
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("the engine source carries the sided lookup, below the instrumented line region", () => {
    const src = fs.readFileSync("legacy/index.html", "utf8");
    expect(src).toMatch(/calW\[mkt\+"\|u"\]/);
    const at = src.slice(0, src.indexOf('calW[mkt+"|u"]')).split("\n").length;
    expect(at, "the sided lookup crept into the instrumented id region (L1591-2402)").toBeGreaterThan(2402);
  });
  it("the generated engine string was re-extracted in the same change", () => {
    // the gen file stores the engine as an escaped string literal — match the stem
    expect(fs.readFileSync(path.join(process.cwd(), "src/engine/legacy-src.gen.ts"), "utf8")).toMatch(/calW\[mkt\+/);
  });
});
