import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";

// vitest compiles JSX with the classic runtime — the component output references a global React
(globalThis as { React?: typeof React }).React = React;
import { bookTag, footballLeanIndex, footballPropLean, impliedPct, leanFromPair, leanPct, mlbLeanIndex, mlbPropLean } from "../src/lib/prop-lean";
import { LeanChip, LEAN_TITLE_PREFIX } from "../src/components/ui/LeanChip";
import type { CfbPropRow } from "../src/lib/cfb/props-types";

/**
 * PROP MARKET LEAN (2026-09-18). Josh: "Add bet %/money % to the player props too somehow." No
 * public source publishes ticket / handle splits on player props (scoresandodds carries NFL prop
 * LINES with no percentages; Covers and Action Network publish game-market consensus only), so the
 * props get the one thing a two-way price really encodes: the vig-free share of the over/under pair.
 * Every number below is arithmetic on a posted price — nothing is a bet count, and the chip says so.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("prop-lean — arithmetic on the posted pair", () => {
  it("impliedPct: −110 → 52.38, +150 → 40.0, 0 / NaN → NaN", () => {
    expect(impliedPct(-110)).toBeCloseTo(52.381, 2);
    expect(impliedPct(+150)).toBeCloseTo(40, 6);
    expect(impliedPct(+100)).toBeCloseTo(50, 6);
    expect(Number.isNaN(impliedPct(0))).toBe(true);
    expect(Number.isNaN(impliedPct(NaN))).toBe(true);
  });
  it("leanFromPair removes the vig: −110/−110 is 50/50 and 'even'; −140/+120 leans Over", () => {
    expect(leanFromPair(-110, -110)).toEqual({ over: 50, under: 50, side: "even", book: null });
    const l = leanFromPair(-140, +120, "DK")!;
    expect(l.over).toBeCloseTo(56.2, 1);
    expect(l.under).toBeCloseTo(43.8, 1);
    expect(l.over + l.under).toBeCloseTo(100, 6);
    expect(l.side).toBe("over");
    expect(l.book).toBe("DK");
    expect(leanFromPair(+130, -150)!.side).toBe("under");
  });
  it("a one-sided market (anytime HR / anytime TD) has no lean — there is no second price to de-vig against", () => {
    expect(leanFromPair(+330, null)).toBeNull();
    expect(leanFromPair(null, -110)).toBeNull();
    expect(leanFromPair(undefined, undefined)).toBeNull();
  });
  it("leanPct reads the pick's own side under either spelling", () => {
    const l = leanFromPair(-140, +120)!;
    expect(leanPct(l, "o")).toBe(l.over);
    expect(leanPct(l, "over")).toBe(l.over);
    expect(leanPct(l, "u")).toBe(l.under);
    expect(leanPct(l, "under")).toBe(l.under);
    expect(leanPct(l, "yes")).toBe(l.over);
  });
  it("bookTag folds book ids to the short tags the boards print", () => {
    expect(bookTag("draftkings")).toBe("DK");
    expect(bookTag("DraftKings")).toBe("DK");
    expect(bookTag("fanduel")).toBe("FD");
    expect(bookTag("caesars")).toBe("CZ");
    expect(bookTag(null)).toBeNull();
  });
});

describe("prop-lean — MLB rows", () => {
  const row = (o: number | null, u: number | null, cz: { o: number | null; u: number | null } | null) => ({ cz, o, u, oBook: "fanduel", uBook: "draftkings", settlementBook: "draftkings" });
  it("prefers the settlement-book pair and tags it", () => {
    const l = mlbPropLean(row(-105, -125, { o: -135, u: +110 }))!;
    expect(l.book).toBe("DK");
    expect(l.over).toBeCloseTo(leanFromPair(-135, +110)!.over, 6);
  });
  it("falls back to the best-price pair (untagged) when the settlement book posts one side only", () => {
    const l = mlbPropLean(row(-105, -125, { o: -135, u: null }))!;
    expect(l.book).toBeNull();
    expect(l.over).toBeCloseTo(leanFromPair(-105, -125)!.over, 6);
  });
  it("returns null on a one-sided row", () => {
    expect(mlbPropLean(row(+330, null, { o: +310, u: null }))).toBeNull();
  });
  it("mlbLeanIndex keys the board's rows `${gkey}|${lkey}` and skips one-sided rows", () => {
    const games = [
      { gkey: "NYY@BOS", markets: { hits: [{ ...row(-105, -125, { o: -135, u: +110 }), lkey: "hits|Aaron Judge|0.5" }, { ...row(+330, null, null), lkey: "hr|Aaron Judge|0.5" }] } },
      { gkey: null, markets: { tb: [{ ...row(-110, -110, null), lkey: "tb|X|1.5" }] } },
    ] as unknown as Parameters<typeof mlbLeanIndex>[0];
    const idx = mlbLeanIndex(games);
    expect(idx.get("NYY@BOS|hits|Aaron Judge|0.5")?.book).toBe("DK");
    expect(idx.has("NYY@BOS|hr|Aaron Judge|0.5")).toBe(false);
    expect(idx.get("|tb|X|1.5")?.side).toBe("even");
    expect(mlbLeanIndex(null).size).toBe(0);
  });
});

describe("prop-lean — football rows", () => {
  const q = (book: string, price: number, line: number | null) => ({ book, title: book, price, line, dec: 1 });
  const side = (side: CfbPropRow["side"], cz: ReturnType<typeof q> | null, best: ReturnType<typeof q> | null, line = 245.5): CfbPropRow =>
    ({ key: `g1|pass_yds|ty-simpson|${side}|${line}`, gameId: "g1", market: "pass_yds", side, player: "Ty Simpson", line, cz, best } as unknown as CfbPropRow);
  it("pairs the over and under at the selected book at ONE line", () => {
    const l = footballPropLean([side("over", q("draftkings", -130, 245.5), null), side("under", q("draftkings", +110, 245.5), null)], "cz")!;
    expect(l.book).toBe("DK");
    expect(l.over).toBeGreaterThan(52);
    expect(l.side).toBe("over");
    // −115 / −105 is inside the ±2-point band: a lean nobody should act on reads "even"
    expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 245.5), null)], "cz")!.side).toBe("even");
  });
  it("refuses a pair split across two lines (245.5 over vs 249.5 under is not a two-way market)", () => {
    expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 249.5), null)], "cz")).toBeNull();
  });
  it("a yes-only market (anytime TD) has no lean", () => {
    expect(footballPropLean([side("yes", q("draftkings", +140, null), null)], "cz")).toBeNull();
  });
  it("footballLeanIndex indexes both sides by their own row key with the pick's own share", () => {
    const rows = [side("over", q("draftkings", -140, 245.5), null), side("under", q("draftkings", +120, 245.5), null), side("yes", q("draftkings", +140, null), null)];
    const idx = footballLeanIndex(rows, "cz");
    const o = idx.get("g1|pass_yds|ty-simpson|over|245.5")!;
    const u = idx.get("g1|pass_yds|ty-simpson|under|245.5")!;
    expect(o.side).toBe("over");
    expect(o.pct).toBeCloseTo(o.lean.over, 6);
    expect(u.pct).toBeCloseTo(u.lean.under, 6);
    expect(o.pct + u.pct).toBeCloseTo(100, 6);
    expect(idx.has("g1|pass_yds|ty-simpson|yes|null")).toBe(false);
    expect(footballLeanIndex(null).size).toBe(0);
  });
});

describe("LeanChip — labelled as price-implied, never a bet count", () => {
  const lean = leanFromPair(-140, +120, "DK")!;
  it("renders nothing without a lean", () => {
    expect(renderToString(createElement(LeanChip, { lean: null }))).toBe("");
  });
  it("the full chip shows both shares; the side chip shows the pick's own share", () => {
    const full = renderToString(createElement(LeanChip, { lean }));
    expect(full).toContain("data-lean-chip");
    expect(full).toContain("56% O");
    expect(full).toContain("44% U");
    const own = renderToString(createElement(LeanChip, { lean, side: "u", compact: true }));
    expect(own).toContain("44%");
    expect(own).not.toContain("56%");
    expect(own).toContain("lean");
  });
  it("the tooltip opens with the disclaimer and names the book; the words bets / money never appear as a claim", () => {
    const html = renderToString(createElement(LeanChip, { lean, side: "o" }));
    expect(html).toContain(LEAN_TITLE_PREFIX);
    expect(LEAN_TITLE_PREFIX).toMatch(/^Price-implied lean, not a bet count/);
    expect(html).toContain("at DK");
    expect(html).toContain("do not publish ticket or money splits on player props");
    expect(html).not.toMatch(/% of bets|% of the money/);
  });
});

describe("prop-lean — wiring: every player-prop surface carries the chip, and only the props", () => {
  it("MLB rows, football rows, both ranked lists, both boards and both generator pools", () => {
    expect(read("src/components/props/PlayerRow.tsx")).toMatch(/<LeanChip lean=\{mlbPropLean\(r\)\}/);
    expect(read("src/components/cfb/CfbProps.tsx")).toMatch(/footballPropLean\(pl\.sides, mode\)/);
    expect(read("src/components/cfb/CfbProps.tsx")).toMatch(/splits: l\.lean \? <LeanChip lean=\{l\.lean\} side=\{l\.side\} compact \/> : undefined/);
    expect(read("app/props/page.tsx")).toMatch(/splits: l\.lean \? <LeanChip lean=\{l\.lean\} side=\{l\.side\} compact \/> : undefined/);
    expect(read("app/board/page.tsx")).toMatch(/mlbLeanIndex\(browseProps\.rows\)/);
    expect(read("app/board/page.tsx")).toMatch(/<LeanChip lean=\{leanIndex\.get\(`\$\{r\.gkey \?\? ""\}\|\$\{r\.lkey \?\? ""\}`\)\}/);
    expect(read("app/board/page.tsx")).toMatch(/<LeanChip lean=\{leanIndex\.get\(`\$\{p\.gkey \?\? ""\}\|\$\{p\.lkey \?\? ""\}`\)\} side=\{p\.side\}/);
    const fb = read("src/components/cfb/CfbPicksBoard.tsx");
    expect(fb).toMatch(/footballLeanIndex\(propRows, "cz"\)/);
    expect(fb).toMatch(/r\.kind === "prop" && leanIndex\.get\(r\.key\) && <LeanChip/);
    expect(read("src/components/props/mlb-gen-pool.ts")).toMatch(/lean: mlbPropLean\(r\),/);
    expect(read("src/lib/football/gen-pool.ts")).toMatch(/lean: leanIndex\.get\(row\.key\)\?\.lean \?\? null,/);
  });
  it("the SplitsChip is still never rendered for a prop — the two chips never swap meanings", () => {
    const fb = read("src/components/cfb/CfbPicksBoard.tsx");
    expect(fb).toMatch(/r\.kind === "side" && <SplitsChip/);
    expect(fb).not.toMatch(/r\.kind === "prop" && <SplitsChip/);
  });
});
