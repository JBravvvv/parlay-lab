import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fixtureEngine } from "./helpers/fixture-env";

/**
 * M25's DOLLAR RATIO, RE-MEASURED ON AN ARCHIVED PRODUCTION BOARD (2026-07-31, owner's item 4).
 *
 * The bundle's M25 row carried "$500 staked against $13 of computed ceiling = 38.5x" under the
 * sentence that legacy modes place negative-EV bets by construction. That figure came from the
 * ARMED FIXTURE (collection-period L7323-24, "DAILY $250, bankroll $750") — a fixture whose own
 * harness says its numbers answer "did my change move something", never "is this number correct".
 *
 * This re-runs the same quantity on `data/boards/2026-07-26.best.json.gz` from the line-history
 * branch — a REAL captured production board. Archive, not fixture. Zero Odds credits.
 *
 * WHAT IT MEASURES: for each ticket the engine's own allocator emits in a LEGACY mode, the stake
 * against that ticket's OWN belief-sized ceiling, `round(kellyStakeMult x bankroll x
 * max(0, min(0.25 x kelly, 0.02)))` — the ceiling the disciplined path applies and the legacy
 * path computes and discards (M24).
 *
 * WHAT IT DOES NOT MEASURE: anything realized. No money was placed off this board in a legacy
 * mode. The realized version is reading 15's overstake query against the ledger export.
 *
 * PL_BOARD-gated: skips without a board, exactly like the other analysis harnesses.
 */

const BOARD = process.env.PL_BOARD || "";
const BANKROLL = 750; // M25's stated parameters, so the two numbers are comparable
const DAILY = 250;
const KELLY_STAKE_MULT = 4;

type Row = Record<string, unknown>;

/** the engine's own shKellyFrac, floor included */
function kellyFrac(prob: unknown, czDec: unknown): number | null {
  const p = Number(prob) / 100;
  const d = Number(czDec);
  if (!Number.isFinite(p) || !(d > 1)) return null;
  return Math.max(0, Math.min(0.25 * ((p * d - 1) / (d - 1)), 0.02));
}

describe("M25 dollar ratio on an ARCHIVED board (analysis harness, report only)", () => {
  it("legacy-mode stakes against their own computed ceilings", () => {
    if (!BOARD || !fs.existsSync(BOARD)) {
      // eslint-disable-next-line no-console
      console.log("\n[skipped] set PL_BOARD=/path/to/board.json to run this analysis\n");
      expect(true).toBe(true);
      return;
    }
    const d = JSON.parse(fs.readFileSync(path.resolve(BOARD), "utf8")).board.data as Record<string, Row[]>;
    const eng = fixtureEngine();
    const alloc = eng.get<(p: unknown[], a: number, c: unknown) => Record<string, unknown>>("shAllocate");
    const baseCfg = eng.get<Record<string, unknown>>("SH_CFG");
    const SH = eng.get<Record<string, unknown>>("SH");
    eng.set("SH", { ...SH, bankroll: BANKROLL, daily: DAILY });

    const parlays = [
      ...((d.parlays as Row[]) ?? []),
      ...((d.parlaysMixed as Row[]) ?? []).filter((p) => !(((p.legs as Row[]) ?? []).some((l) => l.live))),
    ].filter((p) => p.czDec != null);
    const pool = parlays.map((pl, idx) => ({ pl, src: "p", idx }));
    const PROVEN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );

    const lines: string[] = [`\nM25 RE-MEASURED — ARCHIVED 2026-07-26 BOARD (not the fixture)`,
      `pool: ${pool.length} tickets, bankroll $${BANKROLL}, daily $${DAILY}`];
    for (const mode of ["probability", "caesars_ev", "ev_gated"]) {
      const a = alloc(pool, DAILY, { ...baseCfg, selMode: mode, mktN: PROVEN });
      const picks = ((a.picks as Row[]) ?? []).map((p) => ({ pl: (p.w as Row).pl as Row, stake: Number(p.stake) }));
      let staked = 0, ceil = 0, over = 0, zero = 0, negEv = 0;
      for (const t of picks) {
        staked += t.stake;
        const f = kellyFrac(t.pl.prob, t.pl.czDec);
        const c = f == null ? null : Math.round(KELLY_STAKE_MULT * BANKROLL * f);
        if (c != null) { ceil += c; if (t.stake > c + 0.001) over++; if (c === 0) zero++; }
        if (Number(t.pl.czEv) < 0) negEv++;
      }
      const ratio = ceil > 0 ? staked / ceil : Infinity;
      lines.push(
        `  ${mode.padEnd(11)} tickets ${String(picks.length).padStart(2)}  staked $${String(staked).padStart(4)}` +
        `  ceiling $${String(ceil).padStart(4)}  ratio ${ceil > 0 ? ratio.toFixed(1) + "x" : "INF"}` +
        `  over-ceiling ${over}  $0-ceiling ${zero}  negative-czEv ${negEv}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n") + "\n");
    expect(pool.length).toBeGreaterThan(0);
  });
});
