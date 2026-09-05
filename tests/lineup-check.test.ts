import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isBatterMarket, lineupStatus, marketOfLkey, shapeLineups } from "@/lib/lineup-check";

/**
 * INSTRUCTION 28 (2026-09-04) — Josh: "It keeps showing Jose Caballero on the board even
 * with a refresh yet he's not in the yankees starting lineup so there's no bets available
 * for him at any book".
 *
 * Fixture: the real statsapi schedule?hydrate=lineups read of 2026-09-04, trimmed to two
 * games — NYY@SD (pk 823256, both nines posted, Caballero absent) and DET@CLE gm2
 * (pk 824387) with its lineups STRIPPED to stand in for an unposted game.
 *
 * OBSERVED RED FIRST: with lineupStatus returning "unknown" for everything, the Caballero
 * assertion below fails ("out" expected).
 */
const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/lineups-2026-09-04.json"), "utf8"));
const L = shapeLineups(fx);

describe("posted-lineup cross-check", () => {
  it("THE CABALLERO CASE — a projected batter absent from the posted nine is OUT", () => {
    expect(L[823256].posted).toBe(true);
    expect(lineupStatus("Jose Caballero", "batter_hits_runs_rbis", 823256, L)).toBe("out");
  });
  it("a batter in the posted nine is IN — accents and suffixes do not break the match", () => {
    expect(lineupStatus("Ben Rice", "batter_hits", 823256, L)).toBe("in");
    expect(lineupStatus("Luis Garcia Jr.", "batter_total_bases", 823256, L)).toBe("in"); // feed says "Luis García Jr."
    expect(lineupStatus("Jazz Chisholm", "batter_home_runs", 823256, L)).toBe("in");
  });
  it("pitchers are never judged by a batting lineup", () => {
    expect(isBatterMarket("pitcher_strikeouts")).toBe(false);
    expect(lineupStatus("Max Fried", "pitcher_strikeouts", 823256, L)).toBe("unknown");
    expect(lineupStatus("Max Fried", "pitcher_outs", 823256, L)).toBe("unknown");
  });
  it("an unposted game (or an unknown pk, or no lineups at all) is UNKNOWN, never OUT", () => {
    expect(L[824387].posted).toBe(false);
    expect(lineupStatus("Kevin McGonigle", "batter_hits", 824387, L)).toBe("unknown");
    expect(lineupStatus("Kevin McGonigle", "batter_hits", 1, L)).toBe("unknown");
    expect(lineupStatus("Kevin McGonigle", "batter_hits", 824387, null)).toBe("unknown");
    expect(lineupStatus(null, "batter_hits", 823256, L)).toBe("unknown");
  });
  it("a one-sided lineup does not count as posted", () => {
    const half = shapeLineups({ dates: [{ games: [{ gamePk: 5, lineups: { awayPlayers: fx.dates[0].games.find((g: { gamePk: number }) => g.gamePk === 823256).lineups.awayPlayers, homePlayers: [] } }] }] });
    expect(half[5].posted).toBe(false);
    expect(lineupStatus("Jose Caballero", "batter_hits", 5, half)).toBe("unknown");
  });
  it("marketOfLkey reads the middle segment", () => {
    expect(marketOfLkey("josecaballero|batter_hits_runs_rbis|0.5")).toBe("batter_hits_runs_rbis");
    expect(marketOfLkey(null)).toBeNull();
  });
});

describe("Board page wiring (source scan)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
  it("reads posted lineups and hides OUT rows on both the live-board table and the stamped picks", () => {
    expect(src).toMatch(/useLineups\(/);
    expect(src).toMatch(/lineupStatus\(/);
    expect(src).toMatch(/showScratched/);
  });
  it("the Board's parlay cards get the same verdict per leg (a Caballero leg on a stored 3-leg ticket was the live case)", () => {
    expect(src).toMatch(/legOut=\{/);
    const ps = fs.readFileSync(path.join(process.cwd(), "src/components/mlb/ParlaysSection.tsx"), "utf8");
    expect(ps).toMatch(/SCRATCHED LEG/);
    expect(ps).toMatch(/legOut\?:/);
  });
  it("INSTRUCTION 30 — the column is 'Grade', 'Tier' is gone from the Board", () => {
    expect(src).toMatch(/header: "Grade"/);
    expect(src).not.toMatch(/"Tier"|>Tier</);
  });
  it("INSTRUCTION 29 — the stamped-picks table is a sortable DataTable, every column carries a sortValue", () => {
    expect(src).not.toMatch(/<th className="py-1\.5 pr-2">/);
    expect(src).toMatch(/pickColumns/);
  });
});
