import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * THE BUILDER'S MARKETS FILTER NARROWS OR WIDENS, NEVER BOTH (2026-09-28, review of the September 28 bug pass). The football
 * Builder's ticket list first started on the Board's 11 default markets and special-cased that untouched set as "pass every
 * leg", so the NFL card's staked Receptions O/U singles showed. But the menu drew Receptions O/U UNCHECKED the whole time,
 * and any tap that left the default set — even unchecking 1H ML, which no full-game card ticket carries, or checking an
 * extra market — hid every Receptions ticket ("Showing 5 of 10"). The list now starts on every football market checked and
 * is the plain subset test on the checked boxes.
 *
 * How a tap is driven with no DOM (node env): the real Markets MultiSelect's props are captured on each render, its onChange
 * (DiscoveryFilters' own closure) is called with exactly what MultiSelect's handler computes, and the object that reaches
 * TicketStack's setFilter is fed back as the next render's state. The card is a real NFL variety-v2 card built by
 * buildCfbCard from the repo's 2026-09-13 NFL fixtures; its five Receptions rows are the synthetic ones
 * tests/nfl-variety-paper.test.ts uses ("Player 0".."Player 4").
 */

let nextFilter: unknown = null;
let recorded: unknown = null;
vi.mock("react", async (orig) => {
  const actual = (await orig()) as typeof import("react");
  const useState = ((init: unknown) => {
    const v = typeof init === "function" ? (init as () => unknown)() : init;
    const isFilter = !!v && typeof v === "object" && ["markets", "timing", "strategies"].every((k) => Array.isArray((v as Record<string, unknown>)[k]));
    if (isFilter) {
      const [s] = actual.useState(nextFilter ?? v);
      return [s, (u: unknown) => { recorded = typeof u === "function" ? (u as (p: unknown) => unknown)(s) : u; }];
    }
    return actual.useState(init as never);
  }) as typeof actual.useState;
  return { ...actual, default: { ...actual, useState }, useState };
});
type Captured = { label: string; options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void };
const captured: Record<string, Captured> = {};
vi.mock("@/components/props/MultiSelect", async (orig) => {
  const actual = (await orig()) as typeof import("@/components/props/MultiSelect");
  const R = (await import("react")) as typeof import("react");
  return {
    MultiSelect: (p: Captured) => {
      captured[p.label] = p;
      return R.createElement(actual.MultiSelect as never, p as never);
    },
  };
});
vi.stubGlobal("React", React);

const readFx = (n: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/nfl", `${n}.json`), "utf8"));
const NOW = Date.parse("2026-09-13T16:00Z");

async function nflCard() {
  const { buildCfbBoard } = await import("@/lib/cfb/model");
  const { buildCfbCard } = await import("@/lib/cfb/card");
  const { NFL_LEAGUE, NFL_RULES } = await import("@/lib/nfl/rules");
  /* the variety card went live 2026-09-23; the fixture is 09-13, so the date gates move with it (as tests/nfl-variety-paper.test.ts does) */
  const rules = { ...NFL_RULES, sundayPaperSince: "2026-09-13", variedPaperSince: "2026-09-13" };
  const board = buildCfbBoard({ date: "2026-09-13", espnEvents: readFx("espn-scoreboard-2026-09-13").events, oddsEvents: readFx("odds-2026-09-13"), fpi: readFx("espn-fpi"), now: NOW, bankroll: 2500, league: NFL_LEAGUE });
  const rows = board.games.slice(0, 5).map((g, i) => ({ key: `${g.id}|receptions|player${i}|over|4.5`, gameId: g.id, market: "receptions", side: "over", player: `Player ${i}`, label: `Player ${i} O 4.5 Receptions`, teamId: g.home.id, line: 4.5, fair: 0.53, evCz: 6, cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 } }));
  const paperProps = { date: board.date, rows, pricedAt: Object.fromEntries(rows.map((r) => [r.gameId, new Date(NOW - 60_000).toISOString()])) };
  const slate = { ...board, paperProps, finals: {}, quota: { remaining: null, used: null }, oddsMissing: false };
  const card = buildCfbCard(slate as never, { now: NOW, bankroll: 2500, daily: 350, fun: 25, rules, idPrefix: "nfl" });
  return { slate, card };
}

const showing = (html: string) => html.match(/Showing (\d+) of (\d+) tickets/)?.slice(1).map(Number);
const optionState = (html: string, label: string) =>
  html.match(new RegExp(`data-selected="(true|false)"[^>]*><span[^>]*>${label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}</span>`))?.[1];
const badge = (html: string) => html.match(/<b>([^<]*)<\/b><span class="board-filter-chevron"/)?.[1];
const trigger = (html: string) => html.match(/data-filter="Markets"[\s\S]*?discovery-trigger-value">([^<]*)</)?.[1];

describe("the football Builder's Markets filter: every market starts checked and a tap only narrows or widens (review: an unrelated tap hid every Receptions ticket)", () => {
  it("untouched lists every ticket with every box checked; unchecking a market no ticket carries changes nothing; the count always equals the checked boxes", async () => {
    const { slate, card } = await nflCard();
    const { LeagueContext } = await import("@/components/football/LeagueContext");
    const { CFB_DESK } = await import("@/lib/cfb/desk");
    const { NFL_LEAGUE } = await import("@/lib/nfl/rules");
    const NFL = { ...CFB_DESK, ...NFL_LEAGUE };
    const { TicketStack } = await import("@/components/cfb/CfbBuilder");
    const tickets = card.core;
    const nRec = tickets.filter((t) => t.legs.some((l) => l.market === "receptions")).length;
    expect(nRec).toBeGreaterThan(0);
    expect(nRec).toBeLessThan(tickets.length);

    const render = (state: unknown) => {
      nextFilter = state;
      recorded = null;
      return renderToStaticMarkup(createElement(LeagueContext.Provider, { value: NFL as never }, createElement(TicketStack, { tickets, board: slate as never, label: "Core tickets" })));
    };
    type F = { markets: string[] };
    /* one checkbox tap, through the captured real onChange: MultiSelect's own handler body */
    const tap = (key: string) => {
      const m = captured.Markets;
      m.onChange(m.value.includes(key) ? m.value.filter((v) => v !== key) : [...m.value, key]);
      return recorded as F;
    };
    /* the count a plain subset test over the checked boxes gives */
    const truthful = (markets: readonly string[]) => tickets.filter((t) => t.legs.every((l) => markets.includes(l.market))).length;

    const h0 = render(null);
    const all = captured.Markets.options.map((o) => o.key);
    expect(all).toContain("receptions");
    expect(captured.Markets.value).toEqual(all);
    expect(showing(h0)).toEqual([tickets.length, tickets.length]);
    expect(optionState(h0, "Receptions O/U")).toBe("true");
    expect(trigger(h0)).toBe("All");
    /* untouched reads as untouched */
    expect(badge(h0)).toBe("Filters");

    /* THE CASE: unchecking 1H ML, which no full-game card ticket carries, hid every Receptions ticket */
    const s1 = tap("ml_1h");
    const h1 = render(s1);
    expect(showing(h1)).toEqual([tickets.length, tickets.length]);
    expect(badge(h1)).toBe("1 active");

    /* narrowing to props only leaves exactly the Receptions tickets; unchecking Receptions leaves exactly the rest */
    render(null);
    let s = tap("ml");
    render(s);
    s = tap("spread");
    render(s);
    s = tap("total");
    expect(showing(render(s))).toEqual([nRec, tickets.length]);
    render(null);
    const s4 = tap("receptions");
    expect(showing(render(s4))).toEqual([tickets.length - nRec, tickets.length]);

    /* every step is the checkbox-truthful count, and re-checking a box restores what unchecking it removed */
    for (const key of all) {
      render(null);
      const off = tap(key);
      const hOff = render(off);
      expect(showing(hOff)?.[0], `uncheck ${key}`).toBe(truthful(off.markets));
      const on = tap(key);
      expect(showing(render(on))?.[0], `re-check ${key}`).toBe(tickets.length);
    }
  });

  it("the source: the list starts on scopedMarkets and the 'pristine' special case is gone; the badge counts from that start", async () => {
    const { stripComments } = await import("./helpers/source");
    const src = stripComments(fs.readFileSync(path.join(process.cwd(), "src/components/cfb/CfbBuilder.tsx"), "utf8"));
    expect(src).toContain("const allKeys=scopedMarkets(ALL_MARKETS,[L.id]).map(m=>m.key);");
    expect(src).toContain('markets:allKeys,sports:[L.id]');
    expect(src).toContain("baseline={allKeys}");
    expect(src).not.toMatch(/pristine/);
    expect(src).not.toMatch(/defaultMarkets/);
  });
});
