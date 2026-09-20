import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";
import { OPEN_RANGE, RANKED_PAGE, RankedPicks, RankedViewTabs, inOddsRange, rangeText, sortRanked, type RankedPick } from "@/components/props/RankedPicks";
import { GRADE_CUTS, gradeFromEv } from "@/lib/grade";

/**
 * 2026-09-18, Josh's word, verbatim: "Below the Parlay Generator, the default view should be every
 * pick available for the day ranked from S down. So every S pick no matter if its a ML, prop, etc
 * is listed first, then all of the As, Bs & so on. There should be filters above it to sort by each
 * option (ex: ML, RL, HR, Hits, H+R+RBI, etc); when you select a filter (ie: H+R+RBI) it should
 * list every pick under that category for the entire day (every single prop under that category
 * for every single player in every single game) from S to A to B etc."
 *
 * The component is fed synthetic rows here (prices and EVs are inputs to a sorter, not claims about
 * any board) — the point is the ORDER, the chips, the counts, and the default view on both desks.
 */
vi.stubGlobal("React", React);
(globalThis as { React?: typeof React }).React = React;

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

type L = { id: string };
const row = (id: string, market: string, ev: number, over: Partial<RankedPick<L>> = {}): RankedPick<L> => ({
  id,
  market,
  label: id,
  sub: `${market} line`,
  am: -110,
  prob: 52.4,
  ev,
  leg: { id },
  mark: createElement("i", { "data-mark": id }),
  ...over,
});

/* one of each tier across three categories, deliberately fed in the WRONG order */
const PICKS: RankedPick<L>[] = [
  row("f-ml", "ml", GRADE_CUTS.D - 1),
  row("b-hrr", "batter_hits_runs_rbis", GRADE_CUTS.B + 0.5),
  row("s-hits", "batter_hits", GRADE_CUTS.S + 2),
  row("a-ml", "ml", GRADE_CUTS.A + 0.2),
  row("s-ml", "ml", GRADE_CUTS.S + 0.1),
  row("c-hrr", "batter_hits_runs_rbis", GRADE_CUTS.C + 0.5),
  row("d-hits", "batter_hits", GRADE_CUTS.D + 0.5),
];
const FILTERS = [
  { key: "ml", label: "ML" },
  { key: "rl", label: "RL" },
  { key: "batter_hits", label: "Hits" },
  { key: "batter_hits_runs_rbis", label: "H+R+RBI" },
];

const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(RankedPicks<L>, {
      picks: PICKS,
      filters: FILTERS,
      isSel: (id: string) => id === "a-ml",
      onToggle: () => {},
      ...over,
    } as Parameters<typeof RankedPicks<L>>[0]),
  );

const order = (out: string) => [...out.matchAll(/data-ranked-pick="([^"]+)"/g)].map((m) => m[1]);

describe("RankedPicks — every pick today, S down", () => {
  it("renders the section and every row, sorted S → A → B → C → D → F regardless of category or input order", () => {
    const out = render();
    expect(out).toContain('data-testid="ranked-picks"');
    expect(order(out)).toEqual(["s-hits", "s-ml", "a-ml", "b-hrr", "c-hrr", "d-hits", "f-ml"]);
    expect([...out.matchAll(/data-grade="([A-FS])"/g)].map((m) => m[1])).toEqual(["S", "S", "A", "B", "C", "D", "F"]);
  });

  it("within a tier the higher EV sits first (s-hits at +2 over the cut beats s-ml at +0.1)", () => {
    expect(order(render()).slice(0, 2)).toEqual(["s-hits", "s-ml"]);
  });

  it("rows are numbered from 1 and carry the desk's own mark, the category tag, and a GradeChip", () => {
    const out = render();
    expect(out).toMatch(/text-\[9\.5px\] text-faint">1<\/span><i data-mark="s-hits">/);
    expect(count(out, /data-mark="/g)).toBe(7);
    expect(count(out, /title="Tier S on EV at the posted price/g)).toBe(2);
    expect(count(out, /title="Tier [A-FS] on EV at the posted price/g)).toBe(7);
    expect(out).toContain(">H+R+RBI</span>");
    expect(out).toContain(">ML</span>");
  });

  it("market dropdown has select all, clear, and checked options",()=>{
    const out=render();expect(out).toContain('aria-label="Markets"');expect(out).toContain("Markets: All");
    expect(out).toContain("Select All");expect(out).toContain(">Clear</button>");
    for(const f of FILTERS)expect(out).toContain(f.label.replace(/&/g,"&amp;"));
    expect(order(out)).toHaveLength(7);
  });

  it("the header counts picks per tier", () => {
    const out = render();
    expect(out).toMatch(/aria-label="Picks per tier"/);
    expect(out).toMatch(/<b class="text-text">S<\/b> 2/);
    expect(out).toMatch(/<b class="text-text">A<\/b> 1/);
    expect(out).toMatch(/<b class="text-text">F<\/b> 1/);
  });

  it("the selected leg's price button is pressed; the others are not", () => {
    const out = render();
    expect(count(out, /aria-pressed="true"/g)).toBe(1);
    expect(out).toMatch(/data-ranked-pick="a-ml"[\s\S]*?aria-pressed="true"/);
  });

  it("pages at RANKED_PAGE rows with a 'Show N more · M left' button", () => {
    const many = Array.from({ length: RANKED_PAGE + 25 }, (_, i) => row(`p${i}`, "ml", 1 + (i % 9)));
    const out = render({ picks: many });
    expect(count(out, /data-ranked-pick="/g)).toBe(RANKED_PAGE);
    expect(out).toContain(`Show 25 more · 25 left`);
    expect(render()).not.toContain("more ·");
  });

  it("empty and loading states", () => {
    expect(render({ picks: [], loading: true })).toContain("Loading the board…");
    expect(render({ picks: [], emptyBody: "nothing priced" })).toContain("nothing priced");
    expect(render({ picks: [] })).toContain("No priced picks on this board yet.");
  });

  it("the accent follows the desk (cfb amber / nfl blue) on the selected chip and the price", () => {
    expect(render({ accent: "nfl" })).toMatch(/class="[^"]*text-nfl/);
    expect(render({ accent: "cfb" })).toMatch(/class="[^"]*text-cfb/);
    expect(render()).toMatch(/class="[^"]*text-pos/);
  });
});

describe("RankedViewTabs — Ranked is a real tab pair", () => {
  it("renders Ranked · S → F and By game with the active one selected", () => {
    const out = renderToStaticMarkup(createElement(RankedViewTabs, { view: "ranked", onView: () => {} }));
    expect(out).toMatch(/role="tablist" aria-label="Board view"/);
    expect(out).toMatch(/aria-selected="true"[^>]*>Ranked · S → F</);
    expect(out).toMatch(/aria-selected="false"[^>]*>By game</);
  });
});

describe("wiring — the ranked list is the default view under the generator on every desk", () => {
  const props = readSrc("app/props/page.tsx");
  const cfb = readSrc("src/components/cfb/CfbProps.tsx");
  it("MLB /props defaults to ranked (a deep link still opens the game view it targets) and feeds ML + RL + every generator market", () => {
    expect(props).toMatch(/useState<"ranked" \| "games">\(link \? "games" : "ranked"\)/);
    expect(props).toMatch(/RANKED_FILTERS[\s\S]*?\{ key: "ml", label: "ML" \},\s*\{ key: "rl", label: "RL" \}/);
    expect(props).toMatch(/MLB_GEN_MARKETS\.map\(/);
    /* 2026-09-18 later: every pick that is priced NOW — upcoming games and fresh in-play rows */
    expect(props).toMatch(/markets: GEN_MARKETS, includeStarted: true, phase: "mixed"/);
    /* the rail drives the chips (Josh: "when I click a filter like 'H+R+RBI' it still shows washington
       nationals ML, anytime HR props etc" — he tapped the rail, and the list did not follow) */
    expect(props).toMatch(/<RankedPicks[\s\S]*?filter=\{rankedFilter\}\s+onFilter=\{setRankedFilter\}/);
    expect(props).toMatch(/onMarket=\{\(k\) => \{\s*setMktKey\(k\);\s*setRankedFilter\(rankedKeyOf\(tab, k\)\);/);
    expect(props).toMatch(/setMktKey\(hit\.key\);\s*setRankedFilter\(rankedKeyOf\(t, hit\.key\)\);/); // the generator's category taps move the rail, and now the list
    expect(props).toMatch(/view === "ranked" \?/);
    expect(props).toMatch(/<RankedPicks/);
    expect(props).toMatch(/<RankedViewTabs view=\{view\} onView=\{setView\}/);
  });
  it("football (CFB + NFL) defaults to ranked, keeps the props query alive for it, and feeds ML + spread + total + every football market", () => {
    expect(cfb).toMatch(/useState<"ranked" \| "games">\("ranked"\)/);
    expect(cfb).toMatch(/enabled: \(nav !== "sides" \|\| view === "ranked"\) && !!date/);
    expect(cfb).toMatch(/RANKED_FILTERS[\s\S]*?"ml"[\s\S]*?"spread"[\s\S]*?"total"/);
    expect(cfb).toMatch(/FOOTBALL_GEN_MARKETS/);
    expect(cfb).toMatch(/<RankedPicks/);
    expect(cfb).toMatch(/accent=\{L\.id === "nfl" \? "nfl" : "cfb"\}/);
  });
  it("the ranked EV is graded with the site's one grade scale (gradeFromEv) — no second ladder", () => {
    const src = readSrc("src/components/props/RankedPicks.tsx");
    expect(src).toMatch(/gradeFromEv\(p\.ev\)/);
    expect(src).not.toMatch(/ev >= \d+ \? "S"/);
  });
});

describe("controlled category (2026-09-18 later)", () => {
  it("a filter handed in from the page selects that chip and narrows the rows; the header names it", () => {
    const out = render({ filter: "batter_hits", onFilter: () => {} });
    expect(order(out)).toEqual(["s-hits", "d-hits"]);
    expect(out).toContain("Markets: Hits");
    expect(out).toMatch(/>Hits<\/span><input type="checkbox"[^>]*checked=""[^>]*\/>/);
    expect(out).toContain("· Hits");
  });
  it("without the props the list keeps its own state — the football desks are untouched", () => {
    expect(order(render())).toHaveLength(7);
    const cfb = readSrc("src/components/cfb/CfbProps.tsx");
    expect(cfb).not.toMatch(/onFilter=/);
  });
});

/**
 * ODDS RANGE + PRICE SORT — 2026-09-19, Josh, verbatim: "Need to be able to sort 'Every pick today'
 * underneath parlay builder by odds for example I should be able to go in under the CFB Anytime TD
 * filter and then filter between -200 to +250 for players or whatever other odds I want".
 * Synthetic rows again: the prices here are inputs to a filter and a sorter, not claims about a board.
 */
describe("odds range + price sort (2026-09-19)", () => {
  const PRICED: RankedPick<L>[] = [
    row("td-short", "anytime_td", GRADE_CUTS.A + 0.5, { am: -260 }),
    row("td-fav", "anytime_td", GRADE_CUTS.B + 0.5, { am: -200 }),
    row("td-even", "anytime_td", GRADE_CUTS.S + 0.5, { am: 105 }),
    row("td-edge", "anytime_td", GRADE_CUTS.C + 0.5, { am: 250 }),
    row("td-long", "anytime_td", GRADE_CUTS.S + 1, { am: 400 }),
    row("ml-mid", "ml", GRADE_CUTS.A + 0.1, { am: -150 }),
  ];
  const TD_FILTERS = [
    { key: "ml", label: "ML" },
    { key: "anytime_td", label: "Anytime TD" },
  ];
  const renderP = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(RankedPicks<L>, {
        picks: PRICED,
        filters: TD_FILTERS,
        isSel: () => false,
        onToggle: () => {},
        ...over,
      } as Parameters<typeof RankedPicks<L>>[0]),
    );

  it("inOddsRange reads American prices numerically — shorter is smaller — and an open bound is no bound", () => {
    const r = { min: -200, max: 250 };
    expect(inOddsRange(-200, r)).toBe(true);
    expect(inOddsRange(-150, r)).toBe(true);
    expect(inOddsRange(105, r)).toBe(true);
    expect(inOddsRange(250, r)).toBe(true);
    expect(inOddsRange(-260, r)).toBe(false);
    expect(inOddsRange(400, r)).toBe(false);
    expect(inOddsRange(400, { min: -200, max: null })).toBe(true);
    expect(inOddsRange(-260, { min: null, max: 250 })).toBe(true);
    expect(inOddsRange(NaN, OPEN_RANGE)).toBe(false);
  });
  it("rangeText names the range in the book's own notation", () => {
    expect(rangeText(OPEN_RANGE)).toBeNull();
    expect(rangeText({ min: -200, max: 250 })).toBe("-200 to +250");
    expect(rangeText({ min: -200, max: null })).toBe("-200 or longer");
    expect(rangeText({ min: null, max: 250 })).toBe("+250 or shorter");
  });
  it("sortRanked: grade is the S-down order; shortest / longest sort on the posted price, ties by grade", () => {
    const rows = PRICED.map((p) => ({ ...p, grade: gradeFromEv(p.ev) }));
    expect(sortRanked(rows, "grade").map((r) => r.id)).toEqual(["td-long", "td-even", "td-short", "ml-mid", "td-fav", "td-edge"]);
    expect(sortRanked(rows, "shortest").map((r) => r.am)).toEqual([-260, -200, -150, 105, 250, 400]);
    expect(sortRanked(rows, "longest").map((r) => r.am)).toEqual([400, 250, 105, -150, -200, -260]);
  });
  it("Anytime TD between -200 and +250: the range narrows the rows AND the chip counts, the header names it, S down inside it", () => {
    const out = renderP({ range: { min: -200, max: 250 }, onRange: () => {}, filter: "anytime_td", onFilter: () => {} });
    expect(order(out)).toEqual(["td-even", "td-fav", "td-edge"]);
    expect(out).toContain("Markets: Anytime TD");
    expect(order(out)).toHaveLength(3);
    expect(out).toContain("· -200 to +250");
    expect(out).toMatch(/data-testid="ranked-odds-min"[^>]*value="-200"/);
    expect(out).toMatch(/data-testid="ranked-odds-max"[^>]*value="\+250"/);
    expect(out).toContain('aria-label="Clear odds range"');
  });
  it("shortest / longest re-order the shown rows by price and retitle the header", () => {
    const s = renderP({ sort: "shortest", onSort: () => {} });
    expect(order(s)).toEqual(["td-short", "td-fav", "ml-mid", "td-even", "td-edge", "td-long"]);
    expect(s).toContain("Shortest price first");
    expect(s).not.toContain("Ranked S → F");
    const l = renderP({ sort: "longest", onSort: () => {} });
    expect(order(l)).toEqual(["td-long", "td-edge", "td-even", "ml-mid", "td-fav", "td-short"]);
    expect(l).toContain("Longest price first");
    expect(l).toMatch(/<option[^>]*selected[^>]*>Longest price first<\/option>/);
  });
  it("the controls render on the default open range: -200 / +250 placeholders, four sorts, no clear button, nothing narrowed", () => {
    const out = renderP();
    expect(out).toContain('data-testid="ranked-odds-row"');
    expect(out).toMatch(/placeholder="-200"/);
    expect(out).toMatch(/placeholder="\+250"/);
    expect(count(out, /<option /g)).toBe(4);
    expect(out).not.toContain("Clear odds range");
    expect(out).toContain("Markets: All");
    expect(order(out)).toHaveLength(6);
    expect(out).toContain("Ranked S → F");
  });
  it("a range that excludes every pick says so instead of the desk's empty text", () => {
    const out = renderP({ range: { min: 1000, max: null }, onRange: () => {} });
    expect(out).toContain("No pick is priced +1000 or longer — widen the odds range.");
    expect(out).not.toContain("No priced picks on this board yet.");
  });
  it("while the feed is still pricing behind rows already shown, the list says so (a cold Saturday pull is up to 60 event calls)", () => {
    expect(renderP({ loading: true })).toContain("Still pricing this slate");
    expect(renderP({ loading: false })).not.toContain("Still pricing this slate");
    expect(renderP({ loading: true, picks: [] })).toContain("Loading the board…");
  });
  it("wiring: the football ranked view shows a failed props pull with Retry (2026-09-19, 'Prop bets are not loading'); the desks still keep their own state", () => {
    const cfb = readSrc("src/components/cfb/CfbProps.tsx");
    expect(cfb).toMatch(/propsQ\.isError && \([\s\S]*?ranked-props-error[\s\S]*?Player props did not load[\s\S]*?propsQ\.refetch\(\)[\s\S]*?<RankedPicks/);
    expect(cfb).not.toMatch(/onFilter=/);
    expect(cfb).not.toMatch(/onRange=/);
    expect(readSrc("app/props/page.tsx")).not.toMatch(/onRange=/);
  });
});
