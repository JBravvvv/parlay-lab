import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * PARLAY BUILDER UI REBUILD (2026-09-03, Josh's word, verbatim: "We need a massive UI
 * rebuild on the 'parlay builder' tab. It looks EXTREMELY visually unappealing … The
 * tabs could be on two scrolls where you press on it still but can scroll the furthest
 * ones like 1st 3 innings & 1st 5 innings from right to left. Actual pick choices on
 * batter props tabs … are WAY TOO BIG.")
 *
 * These are source-scan pins on the rebuilt page + its components. They guard the two
 * things a UI rewrite can silently break: (1) the DATA path — the page must still read
 * the same engine types, the same ticket math and the same price/prob/label helpers,
 * so nothing gets invented on the way to the screen; (2) the DENSITY contract — small
 * headshots, 32px price buttons, a scrolling snap rail, and a slip that is a bottom
 * sheet handle rather than a fixed wall across the page.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const page = read("app/props/page.tsx");
const model = read("src/components/props/props-model.ts");
const nav = read("src/components/props/MarketNav.tsx");
const rows = read("src/components/props/PlayerRow.tsx");
const games = read("src/components/props/GameCard.tsx");
const slip = read("src/components/props/Slip.tsx");
const insets = read("src/components/props/useShellInsets.ts");
const all = [page, model, nav, rows, games, slip].join("\n");

describe("data path is unchanged — same engine types, ticket math and helpers", () => {
  it("the page still imports the board hook, engine types, ticket math and visuals", () => {
    expect(page).toMatch(/from "@\/lib\/useBoard"/);
    expect(page).toMatch(/import type \{[^}]*PropBoardGame[^}]*\} from "@\/engine"/);
    expect(page).toMatch(/import \{[^}]*combineTicket[^}]*\} from "@\/lib\/ticket-math"/);
    expect(page).toMatch(/import \{[^}]*useHeadshots[^}]*\} from "@\/lib\/mlb-visuals"/);
  });
  it("the price/prob/label helpers exist by name and are what the buttons read", () => {
    for (const fn of ["sidePrice", "sideProb", "sideLabel", "oppRow", "bothSides", "groupByGame", "legId"]) {
      expect(model, `${fn} missing from props-model`).toMatch(new RegExp(`export (function|const) ${fn}\\b`));
    }
    expect(rows).toMatch(/sidePrice\(r, side\)/);
    expect(rows).toMatch(/sideProb\(r, side\)/);
    expect(games).toMatch(/legId\(r\)/);
    expect(page).toMatch(/bothSides\(base\)/);
    expect(page).toMatch(/groupByGame\(gameRows\)/);
  });
  it("prices render through amFmt only — no hand-typed odds anywhere in the UI", () => {
    expect(rows).toMatch(/amFmt\(price\.am\)/);
    expect(games).toMatch(/amFmt\(cz\)/);
    expect(slip).toMatch(/amFmt\(calc\.am\)/);
    expect(slip).toMatch(/amFmt\(l\.cz\)/);
    // an american price literal in JSX text would be an invented number
    expect(all).not.toMatch(/>\s*[+-]\d{3}\s*</);
  });
  it("win % stays labelled by source: market-fair probs carry the italic mkt tag", () => {
    expect(rows).toMatch(/prob\.src === "market" \? " mkt" : ""/);
    expect(slip).toMatch(/l\.src === "market" \? "italic" : ""/);
  });
  it("the MARKETS / TABS tables are intact, including the far-right innings markets", () => {
    for (const label of [
      "Moneyline", "Run Line", "Run In 1st Inning", "First Pitch", "1st 3 Innings", "1st 5 Innings",
      "Anytime HR", "Hits", "Total Bases O/U", "Hits + Runs + RBI O/U", "RBI", "Batter Runs", "Extra-Base Hit", "Singles",
      "Pitcher Strikeouts O/U", "Outs Recorded O/U", "Earned Runs Allowed O/U", "Hits Allowed O/U", "Pitcher Walks O/U", "Most Strikeouts",
    ]) {
      expect(model, `market label "${label}" missing`).toContain(`label: "${label}"`);
    }
    expect(model).toMatch(/cat: "batter_total_bases"/);
    expect(model).toMatch(/cat: "pitcher_strikeouts"/);
    expect(model).toMatch(/\{ key: "games", label: "Games" \}/);
  });
  it("the sandbox ticket math is combineTicket's — naive product, EV, payout, untouched", () => {
    expect(page).toMatch(/combineTicket\(legs\)/);
    expect(slip).toMatch(/calc\.trueProb \* 100/);
    expect(slip).toMatch(/calc\.impProb \* 100/);
    expect(slip).toMatch(/calc\.ev \* 100/);
    expect(slip).toMatch(/calc\.payout\(stake\)/);
    expect(slip).toMatch(/naive product/);
  });
});

describe("two-row market nav — segmented control + scrolling snap rail", () => {
  it("the market rail scrolls horizontally with snap, hidden scrollbar and iOS momentum", () => {
    expect(nav).toMatch(/overflow-x-auto/);
    expect(nav).toMatch(/snap-x/);
    expect(nav).toMatch(/snap-start/);
    expect(nav).toMatch(/\[scrollbar-width:none\]/);
    expect(nav).toMatch(/-webkit-overflow-scrolling:touch/);
  });
  it("a right-edge fade tells the reader the rail keeps going", () => {
    // Tailwind v4 canonical gradient utility, same 85% alpha as the bar it sits on
    expect(nav).toMatch(/bg-linear-to-l from-bg\/85 to-transparent/);
    expect(nav).not.toMatch(/bg-gradient-to-l/);
    expect(nav).toMatch(/scrollLeft \+ el\.clientWidth < el\.scrollWidth/);
  });
  it("the nav is sticky and the segmented control has the three tabs", () => {
    expect(nav).toMatch(/className="sticky z-20/);
    expect(nav).toMatch(/grid h-\[34px\] grid-cols-3/);
    expect(nav).toMatch(/role="tablist"/);
  });
  it("the search field is compact (36px) and lives in the sticky area", () => {
    expect(nav).toMatch(/h-9 min-w-0 flex-1/);
    expect(nav).toMatch(/placeholder="Search players…"/);
  });
});

describe("density — small rows, small buttons, small headshots", () => {
  it("player headshots are h-7 w-7 (28px), never the old h-8", () => {
    expect(rows).toMatch(/size = "h-7 w-7"/);
    expect(rows).not.toMatch(/h-8 w-8/);
  });
  it("the Over/Under buttons are 32px tall (h-8), 80px wide, 10px label and 11.5px tabular price", () => {
    expect(rows).toMatch(/BTN_W = "w-\[80px\]"/);
    expect(rows).toMatch(/flex h-8 \$\{BTN_W\} flex-col/);
    expect(rows).toMatch(/truncate text-\[10px\]/);
    expect(rows).toMatch(/num shrink-0 text-\[11\.5px\] font-semibold text-pos/);
    expect(rows).not.toMatch(/py-1\.5/); // the old 6px-vertical-padding buttons
    expect(rows).not.toMatch(/w-\[86px\]/); // the 86px buttons that squeezed the name to ~107px
    expect(page).not.toMatch(/w-\[86px\]/);
  });
  it("a player row is one tight py-1 line: name 12px alone on its line, team on the 9.5px sub line", () => {
    expect(rows).toMatch(/border-t border-white\/\[0\.04\] py-1"/);
    expect(rows).toMatch(/truncate text-\[12px\] font-medium tracking-tight text-text">\{r\.p\}/);
    // the team tag is NOT a shrink-0 sibling beside the name (that is what cut "Gunnar Henderson")
    expect(rows).not.toMatch(/\{r\.p\}<\/span>\s*\{r\.tm &&/);
    expect(rows).toMatch(/text-\[9\.5px\] font-semibold text-muted">\{r\.tm\}/);
    // width budget on a 375px phone documented next to the row
    expect(rows).toMatch(/127px for the/);
    expect(rows).toMatch(/px-1\.5 pb-1/);
  });
  it("an unposted side renders the dashed 'not posted' pill, never a blank hole", () => {
    expect(rows).toMatch(/not posted/);
    expect(rows).not.toMatch(/<span key=\{side\} className="h-8/);
    expect(rows).toMatch(/selected=\{leg \? isSel\(leg\.id\) : false\}/);
  });
  it("a selected side is the pressed state: filled pos/10 + ring", () => {
    expect(rows).toMatch(/border-pos\/60 bg-pos\/10 ring-1 ring-pos\/50/);
    expect(games).toMatch(/border-pos\/60 bg-pos\/10 ring-1 ring-pos\/50/);
  });
  it("game card headers are compact: 20px logos, 11px matchup line, collapsible", () => {
    expect(games).toMatch(/size = "h-5 w-5"/);
    expect(games).toMatch(/text-\[11px\] font-semibold tracking-wide/);
    expect(games).toMatch(/aria-expanded=\{open\}/);
  });
  it("the loading skeleton matches the new row height", () => {
    expect(page).toMatch(/Skeleton className="h-7 w-7 rounded-full"/);
    expect(page).toMatch(/Skeleton className="h-8 w-\[80px\]/);
  });
});

describe("the slip is a bottom sheet, not a wall", () => {
  it("no fixed slip pinned across the page at bottom-[64px]", () => {
    expect(all).not.toMatch(/fixed inset-x-0 bottom-\[64px\]/);
  });
  it("collapsed by default, expands on tap, never taller than 45vh", () => {
    expect(slip).toMatch(/useState\(false\)/);
    expect(slip).toMatch(/max-h-\[45vh\]/);
    expect(slip).toMatch(/aria-expanded=\{open\}/);
  });
  it("the handle reads legs · odds · true %", () => {
    expect(slip).toMatch(/\{calc\.n\} leg\{calc\.n > 1 \? "s" : ""\} · <b className="text-pos">\{amFmt\(calc\.am\)\}<\/b>/);
    expect(slip).toMatch(/<span className="text-muted">true<\/span>/);
  });
  it("clear-all and per-leg remove are present, and Clear is a sibling button, not nested in the handle", () => {
    expect(slip).toMatch(/onClick=\{onClear\}/);
    expect(slip).not.toMatch(/role="button"/);
    expect(slip).not.toMatch(/stopPropagation/);
    expect(slip).toMatch(/onRemove\(l\.id\)/);
    expect(page).toMatch(/onClear=\{\(\) => setLegs\(\[\]\)\}/);
  });
  it("the sheet sits above the measured tab bar, not a hardcoded pixel offset", () => {
    expect(slip).toMatch(/style=\{\{ bottom \}\}/);
    expect(page).toMatch(/bottom=\{ins\.bottom\}/);
    expect(page).toMatch(/top=\{ins\.top\}/);
  });
  it("the insets are read in a layout effect so the first paint is already offset", () => {
    expect(insets).toMatch(/useLayoutEffect/);
    expect(insets).toMatch(/useIsoLayoutEffect\(\(\) =>/);
  });
  it("on md+ the sheet is aligned to the AppShell content column (200px rail + 2rem gutter, 1280px max)", () => {
    expect(slip).toMatch(/md:left-\[calc\(200px\+2rem\)\] md:right-8/);
    expect(slip).toMatch(/mx-auto w-full max-w-\[1280px\]/);
  });
  it("Fair is labelled as the true-% break-even, never a bare 'Fair' that reads like a quote", () => {
    expect(slip).toMatch(/label="Fair \(true\)"/);
    expect(slip).not.toMatch(/label="Fair"/);
    expect(slip).toMatch(/not a posted quote/);
    expect(slip).toMatch(/decToAm\(1 \/ calc\.trueProb\)/);
  });
  it("on-pos text uses the bg token, not a hard-coded hex", () => {
    expect(all).not.toMatch(/#08090b/i);
    expect(nav).toMatch(/bg-pos text-bg/);
    expect(slip).toMatch(/bg-pos px-1\.5 text-\[11px\] font-bold text-bg/);
  });
});

describe("copy that must survive the rebuild", () => {
  it("the empty / legacy / unpriced states keep their meaning", () => {
    expect(page).toMatch(/not in the feed mirror yet/);
    expect(page).toMatch(/prices are never invented/);
    expect(page).toMatch(/This board predates the full prop board/);
    expect(page).toMatch(/No player matches that search/);
    expect(page).toMatch(/No board yet/);
  });
  it("the explanatory footer is kept as a collapsible disclosure", () => {
    expect(page).toMatch(/<details/);
    expect(page).toMatch(/How to read this/);
    expect(page).toMatch(/de-vigged market fair/);
    expect(page).toMatch(/ALT = a Caesars/);
  });
  it("the sandbox framing stays on the page and the slip", () => {
    expect(page).toMatch(/nothing here is tracked or enters the ledger/i);
    expect(slip).toMatch(/Not tracked, never enters the ledger/);
  });
});
