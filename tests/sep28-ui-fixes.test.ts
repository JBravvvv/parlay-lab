import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";

/**
 * The September 28 bug pass over the last four releases — the parts a node render cannot click: the phone zoom on the
 * in-content sticky bars, the football Board's category following the market choice, and the By-game counters.
 */
const read = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

describe("in-content sticky bars divide the measured shell insets by the MEASURED content zoom", () => {
  const insets = read("src/components/props/useShellInsets.ts");
  it("the zoom is read from the content box's computed style, 1 when there is none", () => {
    expect(insets).toMatch(/export function useContentZoom\(\): number/);
    expect(insets).toMatch(/document\.querySelector<HTMLElement>\("\.desk-content"\)/);
    expect(insets).toMatch(/getComputedStyle\(box\)\.getPropertyValue\("zoom"\)/);
    expect(insets).toMatch(/Number\.isFinite\(z\) && z > 0 \? z : 1/);
    /* re-read when the viewport crosses the phone breakpoint */
    expect(insets).toMatch(/window\.addEventListener\("resize", read\)/);
    /* never a hard-coded 0.7 */
    expect(insets).not.toMatch(/0\.7|\.7\b/);
  });
  it("the three in-content consumers use it; the portaled slips keep the raw insets", () => {
    expect(read("app/props/page.tsx")).toMatch(/top=\{ins\.top \/ zoom\}/);
    expect(read("app/props/page.tsx")).toMatch(/bottom=\{ins\.bottom\}/);
    const cfb = read("src/components/cfb/CfbProps.tsx");
    expect(cfb).toMatch(/const zoom = useContentZoom\(\);/);
    expect(cfb).toMatch(/\{position:"sticky",top:top\/zoom,zIndex:20\}/);
    expect(cfb).toMatch(/bottom=\{bottom\}/);
    expect(read("src/components/cfb/CfbBuilder.tsx")).toMatch(/style=\{\{ bottom: \(insets\.bottom \+ 8\) \/ zoom \}\}/);
    expect(read("src/components/mlb/MyParlayBar.tsx")).not.toMatch(/useContentZoom/);
  });
});

describe("football By-game bar", () => {
  const cfb = read("src/components/cfb/CfbProps.tsx");
  it("sticks on the page's own background, so rows never scroll visibly through it", () => {
    expect(cfb).toMatch(/className=\{`props-browse-search mb-2 \$\{view==="games"\?"-mx-4 border-b border-white\/\[0\.06\] bg-bg\/95 px-4 md:mx-0 md:px-0":""\}`\}/);
  });
  it("its line/game counter shows only in the By-game view — the ranked list counts itself", () => {
    expect(cfb).toMatch(/\{view === "games" && <span className="num shrink-0 text-\[10\.5px\] text-faint">\s*\{lineCount\} line/);
    expect(read("app/props/page.tsx")).toMatch(/count=\{view !== "ranked" \? \{ lines: totalRows, games: propGames\.length \} : undefined\}/);
    const nav = read("src/components/props/MarketNav.tsx");
    expect(nav).toMatch(/count\?: \{ lines: number; games: number \};/);
    expect(nav).toMatch(/\{lines != null && games != null && \(/);
  });
});

describe("football Board: the category select names the list it shows", () => {
  const board = read("src/components/cfb/CfbPicksBoard.tsx");
  it("a Customize change keeps a one-category market set's category; any other set is 'all' underneath, which the select shows as Custom markets unless it is the default board", () => {
    expect(board).toMatch(/onChange=\{v=>\{setDiscovery\(v\);setCat\(v\.markets\.length===1&&CATS\.some\(c=>c\.key===v\.markets\[0\]\)\?v\.markets\[0\] as Cat:"all"\);\}\}/);
    expect(board).toContain("const catValue = boardCategoryValue(cat, discovery.markets, ALL_MARKETS, discovery.sports);");
    expect(board).toContain('<MultiSelect single label="Pick category" value={[catValue]} options={[...(catValue==="custom"?[{key:"custom",label:`Custom markets · ${picks?.categories.all.filter(r=>discovery.markets.includes(r.market)).length ?? 0}`}]:[]),...CATS.map(');
    expect(board).toContain('onChange={v=>{if(v[0]==="custom")return;const next=v[0] as typeof cat;setCat(next);');
  });
  it("Generated Parlays keeps its set through every change that leaves Markets alone, and through a Markets change that is exactly that set's market", () => {
    expect(board).toMatch(/if\(v\.markets!==discovery\.markets&&!\(picked&&v\.markets\.length===1&&v\.markets\[0\]===picked\)\)setPicked\(null\);/);
  });
});
