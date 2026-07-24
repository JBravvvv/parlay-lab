import { afterEach, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, fixtureEngine } from "./helpers/fixture-env";
import type { BoardData } from "@/engine";

/* Fix-file Phase 5 (2026-07-24): both sides of every two-sided line flow through
   the same de-vig → fair → edge pipeline in the disciplined modes. The historical
   "hitter props: overs only" lean survives ONLY in the legacy modes (parity). A
   direction filter exists solely as SH_CFG.dirPref — a Settings choice. */

async function board(mode: string | null, dirPref: Record<string, string> = {}): Promise<BoardData> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
  const eng = fixtureEngine();
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  if (mode) cfg.selMode = mode;
  cfg.dirPref = dirPref;
  const d = eng.analyze(await eng.collectSlate());
  vi.useRealTimers();
  return d;
}
afterEach(() => vi.useRealTimers());

const HITTER = ["batter_hits", "batter_total_bases", "batter_hits_runs_rbis"] as const;
const isU = (r: { sub?: string }) => / U /.test(r.sub ?? "");

describe("unders flow through the disciplined modes", () => {
  it("ev_gated: hitter-prop unders exist, ranked by the same p ordering as everything else", async () => {
    const d = await board("ev_gated");
    let unders = 0;
    for (const k of HITTER) {
      const rows = (d.categories?.[k] ?? []) as { sub?: string; p?: number; prob?: number }[];
      unders += rows.filter(isU).length;
      // ranking is side-blind: rows are sorted by prob desc regardless of O/U
      const probs = rows.map((r) => Number(r.prob));
      expect([...probs].sort((a, b) => b - a)).toEqual(probs);
    }
    expect(unders).toBeGreaterThan(0);
  });

  it("legacy mode: the historical overs-only hitter lean stands (parity posture)", async () => {
    const d = await board(null);
    for (const k of HITTER) {
      const rows = (d.categories?.[k] ?? []) as { sub?: string }[];
      expect(rows.filter(isU)).toHaveLength(0);
    }
  });

  it('dirPref "over" removes unders for that market only; "under" the reverse', async () => {
    const dOver = await board("ev_gated", { batter_hits: "over" });
    expect(((dOver.categories?.batter_hits ?? []) as { sub?: string }[]).filter(isU)).toHaveLength(0);

    const dUnder = await board("ev_gated", { batter_hits: "under" });
    const rows = (dUnder.categories?.batter_hits ?? []) as { sub?: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(isU(r)).toBe(true); // rows lacking a posted under price drop out, never fabricate
  });

  it("an under can top its market — the #1 slot is decided by p, not by side", async () => {
    const d = await board("ev_gated", { batter_hits: "under" });
    const rows = (d.categories?.batter_hits ?? []) as { sub?: string; rank?: number }[];
    expect(rows[0]?.rank).toBe(1);
    expect(isU(rows[0]!)).toBe(true);
  });
});
