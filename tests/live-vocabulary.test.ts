import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tabPure } from "@/lib/tab-purity";
import { boardToPredictions } from "@/lib/pred-serialize";
import { PROP_MARKETS } from "@/lib/server/grading-progress";
import { prevPtDates } from "@/lib/server/pt-date";

/**
 * LIVE VOCABULARY + THE MORNING DARK WINDOW (2026-08-07, third operator report:
 * "still not populating any prop bets").
 *
 * THE LIVE READ THAT SETTLED IT (this date, §12Z.13): the deployed surfaces were fetched
 * as the operator sees them. Verdict: KEYS MATCH — zero tabPure failures across every
 * market's live production rows — and the layer actually implicated is DATE LOGIC:
 * /api/picks and the client's board fetch default to PT-today, which has NO board until
 * the day's first fire (~afternoon PT), so every morning check correctly-and-uselessly
 * reads empty.
 *
 * TWO RULES ENCODED HERE:
 *  1. Guard fixtures for user-facing vocabulary derive from CAPTURED PRODUCTION ROWS
 *     (tests/fixtures/production-rows-2026-08-07.json — captured live 22:49Z, gen
 *     1786142706812), never from the code's own constants. The prior tab-purity plant
 *     used the code's vocabulary, which is why three fixture audits could not disagree
 *     with the code (§12Y.7: fixture-verified is not served-verified, page edition).
 *  2. /api/picks serves the LATEST AVAILABLE board inside the 3-day TTL when today has
 *     none, labeled servedDate + a stale note — the surface is never silently empty on
 *     a boardless morning, and never fabricates (it says whose board it shows).
 */

const FIXTURE = path.join(process.cwd(), "tests/fixtures/production-rows-2026-08-07.json");

describe("production-row vocabulary — captured live, not the code's constants", () => {
  const fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as {
    capturedAt: string;
    rows: Record<string, { lkey: string | null; label: string; sub: string; prob: number }[]>;
  };

  it("the fixture is a capture, not a synthesis: provenance stamped, every market present", () => {
    expect(fx.capturedAt).toMatch(/^2026-08-07T/);
    for (const m of [...PROP_MARKETS, "ml", "rl"]) {
      expect(fx.rows[m]?.length, `market ${m} missing from the capture`).toBeGreaterThan(0);
    }
  });

  it("every captured production row passes its own tab's purity — the live keys ARE the code's keys", () => {
    for (const [m, rows] of Object.entries(fx.rows)) {
      for (const r of rows) {
        expect(tabPure(m, r.lkey), `${m} row ${r.lkey} failed tabPure against live vocabulary`).toBe(true);
      }
    }
  });

  it("PLANT (invalid-by-value): a wrong-vocabulary key is REJECTED — the guard can see a mismatch", () => {
    expect(tabPure("batter_hits", "smith|hits|0.5")).toBe(false); // short segment
    expect(tabPure("ml", "moneyline_home")).toBe(false); // wrong game-market form
  });

  it("boardToPredictions ranks the captured rows under their live keys (mrank 1..n per market)", () => {
    const categories: Record<string, unknown[]> = {};
    for (const [m, rows] of Object.entries(fx.rows)) categories[m] = rows.map((r, i) => ({ ...r, gkey: `g${i}` }));
    const { records } = boardToPredictions({ categories } as never);
    for (const m of PROP_MARKETS) {
      const ranks = records.filter((r) => r.market === m).map((r) => r.mrank);
      expect(ranks, `market ${m} lost its ranks under live vocabulary`).toEqual([1, 2]);
    }
  });
});

describe("the morning dark window — /api/picks falls back inside the board TTL", () => {
  it("prevPtDates walks PT dates backward, TTL-bounded", () => {
    expect(prevPtDates("2026-08-07", 3)).toEqual(["2026-08-07", "2026-08-06", "2026-08-05"]);
    expect(prevPtDates("2026-08-01", 2)).toEqual(["2026-08-01", "2026-07-31"]);
    expect(prevPtDates("2026-01-01", 2)).toEqual(["2026-01-01", "2025-12-31"]); // year boundary
  });

  it("the route is wired: fallback loop + servedDate + stale labeling (source scan, comment-stripped)", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const src = strip(fs.readFileSync(path.join(process.cwd(), "app/api/picks/route.ts"), "utf8"));
    expect(src).toMatch(/prevPtDates\(/);
    expect(src).toMatch(/servedDate/);
    expect(src).toMatch(/staleNote|stale/);
  });
});
