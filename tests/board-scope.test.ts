import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { gradeFromEv, gradeRank } from "@/lib/grade";

/**
 * INSTRUCTIONS 31–34 (2026-09-04), Josh's word, verbatim:
 *  31 "On 'Board' there should be two tabs next to each other 'Top 50' & 'ALL'; If I click on
 *     'Top 50' then click on one of the categories (ie: hits) then all top 50 picks in that
 *     category will show; If I click on 'ALL' then click on one of the categories (ie: hits)
 *     then it will show all daily hits props starting with S grade, then A, B, C, etc down"
 *  32 "('S' grade will now be the highest possible grade right above 'A' grade)"
 *  33 "There should be a search bar on right side of live tab on board to search for a player
 *     within the prop i have highlighted or all of their daily props if i search under 'All' tab"
 *  34 "Prop bets still aren't pulling up on 'Parlay Builder'. Daily odds should generate along
 *     with the 'Board' generating"
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("INSTRUCTION 32 — S sits above A in the order the ALL view sorts by", () => {
  it("S > A > B > C > D > F > ungraded", () => {
    const order = ["S", "A", "B", "C", "D", "F"] as const;
    for (let i = 1; i < order.length; i++) expect(gradeRank(order[i - 1])).toBeGreaterThan(gradeRank(order[i]));
    expect(gradeRank(null)).toBeLessThan(gradeRank("F"));
    expect(gradeFromEv(7.2)).toBe("S"); // the live Caballero-day H+R+RBI edge, for scale
    expect(gradeFromEv(4)).toBe("A");
  });
});

describe("INSTRUCTION 31/33 — Board page wiring (source scan)", () => {
  const src = read("app/board/page.tsx");
  it("carries the Top 50 / All scope control and builds the ALL view from the uncapped prop board", () => {
    expect(src).toMatch(/data-testid="board-scope"/);
    expect(src).toMatch(/useState<Scope>\("top"\)/); // Top 50 is the default
    expect(src).toMatch(/d\?\.propBoard/);
    expect(src).toMatch(/gradeRank\(gradeFromEv\(b\.edge\)\) - gradeRank\(gradeFromEv\(a\.edge\)\)/); // S → F order
    expect(src).toMatch(/EVERY MARKET/);
  });
  it("the search box filters by normalized player name in both scopes", () => {
    expect(src).toMatch(/aria-label="Search players"/);
    expect(src).toMatch(/normalizeName\(search\.trim\(\)\)/);
    expect(src).toMatch(/nameHit\(r\.label\)/); // live-board rows
    expect(src).toMatch(/nameHit\(p\.player\)/); // stamped / ALL rows
  });
  it("the former 'TOP 50' category label no longer collides with the scope name", () => {
    expect(src).not.toMatch(/all: "TOP 50"/);
  });
});

describe("INSTRUCTION 34 — the Parlay Builder never goes empty because a device board lost its props", () => {
  it("odds-shape admits the engine's alternate ladders (the 403 that emptied every device Refresh)", () => {
    const shape = read("src/lib/server/odds-shape.ts");
    for (const m of ["batter_hits_alternate", "pitcher_strikeouts_alternate", "batter_home_runs_alternate"]) expect(shape).toContain(`"${m}"`);
  });
  it("the props page falls back to the server-built prop board when the chosen board has none", () => {
    const props = read("app/props/page.tsx");
    expect(props).toMatch(/queryKey: \["server-props"/);
    expect(props).toMatch(/fromServer/);
    expect(props).toMatch(/showing the server-built prop board/);
  });
});
