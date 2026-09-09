import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { addSeasonLeg, makeSeasonLeg, priceSeasonLeg, projectPlayerStat, type SeasonPlayer } from "@/lib/cfb/season";

/**
 * SEASON LAB UI PINS (INSTRUCTION 46, 2026-09-08) — source-level guards on /season plus a
 * server render of the page and the builder. The rules these pin: the page says in ONE line that
 * season lines are typed by hand (no feed carries them); every number comes from
 * src/lib/cfb/season.ts (the component never prices a leg itself); the ledger lives on its own
 * key (pl_cfb_season, never the daily CFB ledger key); no blur filter on any surface (iOS
 * freeze); no history-pushing navigation; the nav carries Season Lab in the CFB amber family;
 * the feature flag gates the page; and the builder adds a leg.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLUR = /backdrop-filter|backdrop-blur/;

const PAGE = "app/season/page.tsx";
const COMP = "src/components/cfb/CfbSeason.tsx";
const STORE = "src/lib/cfb/season-store.ts";
const SHELL = "src/components/shell/AppShell.tsx";

describe("Season Lab — source pins", () => {
  it("says plainly, once, that season lines are typed by hand because no feed carries them", () => {
    const src = stripComments(read(COMP));
    const hits = src.match(/typed by hand/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/no feed the desk may read carries season-long props or win totals/);
  });
  it("prices nothing itself — every figure comes from the season model and its store", () => {
    const src = stripComments(read(COMP));
    expect(src).toMatch(/from "@\/lib\/cfb\/season"/);
    expect(src).toMatch(/from "@\/lib\/cfb\/season-store"/);
    expect(src).toMatch(/priceSeasonLeg\(/);
    expect(src).toMatch(/priceSeasonParlay\(/);
    expect(src).toMatch(/projectionInputs\(/);
    expect(src).not.toMatch(/normCdf\(|Math\.exp\(|coverProb\(/);
  });
  it("the ledger key is pl_cfb_season and never the daily CFB ledger's", () => {
    const src = stripComments(read(STORE));
    expect(src).toMatch(/CFB_SEASON_KEY = "pl_cfb_season"/);
    expect(src).not.toMatch(/pl_cfb_ledger|CFB_KEYS/);
  });
  it("no blur filter, no history-pushing navigation, on any Season Lab surface", () => {
    for (const rel of [PAGE, COMP]) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(BLUR);
      expect(src, rel).not.toMatch(/router\.push|<Link\b/);
    }
  });
  it("the page is gated on CFB_SEASON_ENABLED and the flag is on", () => {
    expect(stripComments(read(PAGE))).toMatch(/CFB_ENABLED && CFB_SEASON_ENABLED/);
    expect(stripComments(read("src/lib/features.ts"))).toMatch(/export const CFB_SEASON_ENABLED = true;/);
  });
  it("the nav carries Season Lab at /season in the CFB amber family", () => {
    const src = stripComments(read(SHELL));
    expect(src).toMatch(/href: "\/season", label: "Season Lab"/);
    expect(src).toMatch(/"\/season".*tone: "#F5A524"/);
  });
  it("every builder input is a ≥44px box (h-11) and the stake is clamped to the fun-money cap", () => {
    const src = stripComments(read(COMP));
    expect((src.match(/h-11/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(src).toMatch(/clampSeasonStake\(/);
    expect(src).toMatch(/CFB_SEASON\.ticketMax/);
  });
  // fix round (2026-09-08): phone layout, board paging, return-vs-profit wording, abbr search
  it("on a phone the ticket builder sits ABOVE the board (CSS order, md restores the two-column grid) and choose() scrolls it into view", () => {
    const src = stripComments(read(COMP));
    expect(src).toMatch(/order-1 md:order-none/); // the builder column
    expect(src).toMatch(/order-2 md:order-none/); // the board
    expect(src).toMatch(/scrollIntoView\(/);
    // the phone top bar is sticky — the scroll target must clear it or the panel title hides under it
    expect(src).toMatch(/scroll-mt-\[calc\(env\(safe-area-inset-top\)\+3\.5rem\)\] md:scroll-mt-0/);
  });
  it("the board shows 15 rows on a phone (40 from md) with a Show more control, and the search reads the team abbreviation", () => {
    const src = stripComments(read(COMP));
    expect(src).toMatch(/const BOARD_ROWS_PHONE = 15;/);
    expect(src).toMatch(/const BOARD_ROWS_DESKTOP = 40;/);
    expect(src).toMatch(/Show \{?\w* ?more/);
    expect(src).toMatch(/p\.teamAbbr != null && norm\(p\.teamAbbr\)\.includes\(needle\)/);
    // the player row prints abbr + nickname ("USC Trojans"), never the nickname alone
    expect(src).toMatch(/teamLabel\(p\)/);
    expect(src).toMatch(/function teamLabel\(p: Pick<SeasonPlayer, "team" \| "teamAbbr">\)/);
  });
  it("the slip and the ledger never print a signed return as if it were profit: 'returns $X · to win +$Y'", () => {
    const src = stripComments(read(COMP));
    expect(src).not.toMatch(/pays \{fmtMoneyExact\(/);
    expect(src).not.toMatch(/pays <b[^>]*>\{fmtMoneyExact\(/);
    expect((src.match(/returnsLabel\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/function returnsLabel\(stake: number, dec: number\)/);
  });
  it("the season route is ESPN-only with an hour or longer on the cache", () => {
    const src = stripComments(read("app/api/cfb/season/route.ts"));
    expect(src).toMatch(/revalidate: SEASON_ROUTE_TTL/);
    expect(src).not.toMatch(/ODDS_API_KEY|the-odds-api/);
  });
});

describe("Season Lab — renders", () => {
  it("the page renders the header, the typed-by-hand line and the four panels on the server", async () => {
    (globalThis as { React?: typeof React }).React = React;
    const mod = await import("../app/season/page");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(createElement(QueryClientProvider, { client: qc }, createElement(mod.default)));
    expect(html).toContain("Season Lab");
    expect(html).toContain("typed by hand");
    for (const t of ["Season board", "Season ticket", "Season parlay", "Season ledger"]) expect(html).toContain(t);
    expect(html).toContain("Kelly bank");
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it("returnsLabel reads 'returns $12.50 · to win +$7.50' for $5 at 2.5 (return unsigned, profit signed)", async () => {
    const { returnsLabel, teamLabel } = await import("@/components/cfb/CfbSeason");
    expect(returnsLabel(5, 2.5)).toBe("returns $12.50 · to win +$7.50");
    expect(returnsLabel(25, 1.9091)).toBe("returns $47.73 · to win +$22.73");
    expect(teamLabel({ team: "Trojans", teamAbbr: "USC" })).toBe("USC Trojans");
    expect(teamLabel({ team: "Trojans", teamAbbr: null })).toBe("Trojans");
    expect(teamLabel({ team: null, teamAbbr: "USC" })).toBe("USC");
    expect(teamLabel({ team: null, teamAbbr: null })).toBe("—");
  });
  it("adds a leg to the season parlay the way the Add leg button does", () => {
    const p: SeasonPlayer = { slug: "ty-simpson", name: "Ty Simpson", teamId: "333", team: "Alabama Crimson Tide", teamAbbr: "ALA", pos: "QB", g: 5, stats: { pass_yds: 1357 } };
    const proj = projectPlayerStat(p, "pass_yds")!;
    const priced = priceSeasonLeg(proj, "over", 3250.5, -110)!;
    const leg = makeSeasonLeg(proj, priced);
    const legs = addSeasonLeg([], leg);
    expect(legs).toHaveLength(1);
    expect(legs[0].label).toBe("Ty Simpson Pass Yds O 3,250.5");
    expect(legs[0].inputs).toBe("5 G / 271.4 per G / 12 games / proj 3,257");
    expect(legs[0].book).toBe("Caesars");
  });
});
