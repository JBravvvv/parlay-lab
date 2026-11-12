import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * THE COLLEGE BASKETBALL DESK, AS IT RENDERS (2026-11-12).
 *
 * No DOM (node env): each view is rendered with renderToStaticMarkup over a query cache seeded
 * with the slate the pure builder makes from the fixtures (real ESPN schedule rows, invented
 * prices). What is checked is that every number on the page is the slate's own, in the slate's own
 * words, and that the page says plainly what it does not have.
 */

(globalThis as { React?: typeof React }).React = React;

const state = vi.hoisted(() => ({ path: "/games", sport: "ncaab" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/lib/sport", async (orig) => ({ ...(await orig<typeof import("@/lib/sport")>()), useSport: () => state.sport }));

import { NcaabDesk } from "@/components/ncaab/NcaabDesk";
import { american, pct, prob } from "@/lib/anytime/view";
import { NCAAB_STALE_MS, loadNcaabSlate, ncaabQueryKey } from "@/lib/ncaab/client";
import { boardRows, buildNcaabSlate, type NcaabSlate } from "@/lib/ncaab/slate";
import type { NcaabView } from "@/lib/ncaab/view";

const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/ncaab", f), "utf8"));
const ESPN = [...fx("espn-scoreboard-2026-11-12.json").events, ...fx("espn-scoreboard-2026-11-11.json").events];
const ODDS = fx("odds-ncaab.synthetic.json");
const NOW = Date.parse("2026-11-12T21:00:00Z");
const slateOf = (date = "2026-11-12", oddsMissing = false): NcaabSlate => buildNcaabSlate({ date, espnEvents: ESPN, oddsEvents: ODDS, oddsMissing, quota: null, now: NOW, ttlSec: 240 });

function render(view: NcaabView, slate: NcaabSlate | null = slateOf(), pathname = `/${view}`) {
  state.path = pathname;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (slate) qc.setQueryData(ncaabQueryKey("2026-11-12"), slate);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NcaabDesk view={view} />
    </QueryClientProvider>,
  );
}
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** the text of the page, tags dropped */
const text = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  state.sport = "ncaab";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Games", () => {
  const s = slateOf();
  const html = () => render("games");

  it("shows every game of the date, sorted into in play and still to tip", () => {
    const h = html();
    expect(count(h, "data-ncaab-game=")).toBe(10);
    expect(count(h, 'data-ncaab-game="live"')).toBe(1);
    expect(count(h, 'data-ncaab-game="upcoming"')).toBe(9);
    const t = text(h);
    expect(t.indexOf("In play")).toBeLessThan(t.indexOf("Still to tip"));
    expect(t).not.toContain("Final|");
    expect(t).not.toContain("Called off");
    for (const g of s.games) {
      expect(t, g.id).toContain(g.home.short);
      expect(t, g.id).toContain(g.away.short);
    }
  });

  it("prints each row's two prices, fair number and edge exactly as the slate holds them", () => {
    const t = text(html());
    expect(count(html(), "data-ncaab-lines")).toBe(s.priced);
    const rows = s.games.flatMap((g) => g.rows);
    expect(count(html(), "data-ncaab-row=")).toBe(rows.length);
    for (const r of rows) {
      const cells = [r.selection, american(r.prices.draftkings), american(r.prices.fanduel), prob(r.fair), pct(r.ev)].join("|");
      expect(t.replace(/\|+/g, "|"), r.selection).toContain(cells);
    }
  });

  it("marks the better of the two prices, and colours an edge only when it is one", () => {
    const h = html();
    /* UC Riverside ML: +120 at DraftKings, +135 at FanDuel — FanDuel is the better price */
    expect(h).toMatch(/UC Riverside ML<\/span><span class="num text-right text-muted">\+120<\/span><span class="num text-right font-bold text-pos">\+135<\/span>/);
    const positive = s.games.flatMap((g) => g.rows).filter((r) => r.ev > 0).length;
    expect(positive).toBe(2);
    expect(count(h, "num text-right font-semibold text-pos")).toBe(positive);
    /* a book that does not post a line shows a dash, not a number */
    expect(h).toMatch(/Indiana -21\.5<\/span><span class="num text-right font-bold text-pos">−110<\/span><span class="num text-right text-faint">—<\/span>/);
  });

  it("a game with no line says why, in its own words", () => {
    const t = text(html());
    expect(t).toContain("In play — this desk prices before tip-off only.");
    expect(count(html(), "Neither book lists this game.")).toBe(4);
    expect(t).toContain("Neutral site");
  });

  it("shows a live score, and no score at all for a game that has not tipped", () => {
    const h = html();
    const live = h.slice(h.indexOf('data-ncaab-game="live"'), h.indexOf('data-ncaab-game="upcoming"'));
    expect(text(live)).toContain("|42|");
    expect(text(live)).toContain("|35|");
    /* nobody has won a game that is still being played: no side is set in bold */
    expect(live).not.toMatch(/font-bold text-text/);
    const first = h.slice(h.indexOf('data-ncaab-game="upcoming"'));
    expect(first.slice(0, first.indexOf("</li>"))).not.toMatch(/text-\[15px\]/);
  });

  it("a game still to tip shows its tip time in the reader's own zone, not ESPN's Eastern text", () => {
    const t = text(html());
    /* the suite runs on Pacific time: 23:30Z is 3:30 PM */
    expect(t).toContain("|3:30 PM|");
    expect(t).toContain("|7:00 PM|");
    expect(t).not.toContain("EST");
    expect(t).toContain("15:44 - 2nd");
  });

  it("yesterday: the finals with their scores, the winner in bold, and no price asked of anyone", () => {
    const y = slateOf("2026-11-11");
    state.path = "/games";
    const qc = new QueryClient();
    qc.setQueryData(ncaabQueryKey("2026-11-12"), { ...y, date: "2026-11-12" });
    const h = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <NcaabDesk view="games" />
      </QueryClientProvider>,
    );
    expect(count(h, 'data-ncaab-game="final"')).toBe(5);
    expect(count(h, "data-ncaab-lines")).toBe(0);
    /* USC 77, California 65: the winner's name and score are the bold ones */
    expect(h).toMatch(/font-bold text-text"><span class="num mr-1 text-\[10\.5px\] font-semibold text-faint">#21<\/span>USC<\/span>/);
    expect(h).toMatch(/text-\[15px\] font-bold text-text">77</);
    expect(h).toMatch(/text-\[15px\] font-semibold text-muted">65</);
  });

  it("with the prices missing it still shows the schedule and says the prices are not loaded", () => {
    const h = render("games", slateOf("2026-11-12", true));
    expect(count(h, "data-ncaab-game=")).toBe(10);
    expect(count(h, "data-ncaab-lines")).toBe(0);
    expect(count(h, "Prices are not loaded right now.")).toBe(9);
    expect(text(h)).toContain("10 games · prices are not loaded right now, schedule and scores only");
  });

  it("an empty date says so", () => {
    const h = render("games", slateOf("2026-11-20"));
    expect(text(h)).toContain("No games on this date");
    expect(text(h)).toContain("No Division I games on this date.");
  });

  it("before the slate arrives it shows a skeleton, not an empty day", () => {
    const h = render("games", null);
    expect(h).toContain("skeleton");
    expect(h).not.toContain("No games on this date");
    expect(count(h, "data-ncaab-game=")).toBe(0);
  });

  it("has the date strip, with today picked, and a Refresh control", () => {
    const h = html();
    for (const label of ["Yesterday", "Today", "Fri 13", "Sat 14", "Sun 15", "Mon 16", "Tue 17"]) expect(text(h)).toContain(`|${label}|`);
    expect(count(h, 'aria-pressed="true"')).toBe(1);
    expect(h).toMatch(/aria-pressed="true"[^>]*>Today</);
    expect(h).toContain('aria-label="Refresh the College Basketball slate"');
    expect(text(h)).toContain("10 games · 5 with a line at DraftKings or FanDuel");
  });
});

describe("Board", () => {
  it("lists the selections whose better price beats the fair number, best first, with the book named", () => {
    const s = slateOf();
    const h = render("board", s);
    const rows = boardRows(s);
    expect(rows).toHaveLength(2);
    expect(count(h, "data-ncaab-board-row")).toBe(2);
    const t = text(h).replace(/\|+/g, "|");
    expect(t).toContain("Best prices · 2");
    expect(t.indexOf(rows[0].selection)).toBeLessThan(t.indexOf(rows[1].selection));
    for (const r of rows) {
      expect(t).toContain(`${r.selection}|${r.event} · `);
      expect(t).toContain(`${american(r.best.price)} |FD|fair ${prob(r.fair)}|${pct(r.ev)}`);
    }
    expect(count(h, "data-ncaab-game=")).toBe(0);
  });

  it("an ordinary day with no such price is an honest empty list", () => {
    const s = slateOf();
    const flat = { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, ev: -0.02 })) })) };
    const t = text(render("board", flat));
    expect(t).toContain("No price beats the fair number on this date");
    expect(t).toContain("Most days that is a short list, and some days it is empty.");
    expect(text(render("board", slateOf("2026-11-12", true)))).toContain("Prices are not loaded right now");
  });
});

describe("Ledger and the tabs this desk does not have", () => {
  it("Ledger says where the picks are recorded, links there, asks for no prices, and carries the archive shelf", () => {
    const h = render("ledger", null);
    const t = text(h);
    expect(t).toContain("Paper picks on this desk");
    expect(t).toContain("made and recorded by the any-time engine");
    expect(h).toMatch(/<a [^>]*href="\/anytime"/);
    expect(t).toContain("Open the MLB record");
    expect(h).not.toContain("skeleton");
    expect(h).not.toContain('aria-label="Refresh the College Basketball slate"');
    expect(h).not.toContain('aria-label="Date"');
  });

  it.each([
    ["/props", "Parlay Builder"],
    ["/builder", "The Card"],
    ["/sharp", "The Sharp"],
    ["/stats", "Stats"],
    ["/simulator", "Simulator"],
    ["/board/parlays", "Parlays"],
  ])("%s says %s is not on this desk yet, and leads to the two pages that are", (p, name) => {
    const h = render("other", null, p);
    const t = text(h);
    expect(t).toContain(`${name} is not on the College Basketball desk yet`);
    expect(h).toMatch(/<a [^>]*href="\/games"/);
    expect(h).toMatch(/<a [^>]*href="\/board"/);
    expect(h).not.toContain("skeleton");
  });

  it("only the two priced views ask for the slate", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/ncaab/NcaabDesk.tsx"), "utf8");
    expect(src).toMatch(/const priced = view === "games" \|\| view === "board";/);
    expect(src).toMatch(/useQuery\(\{ queryKey: ncaabQueryKey\(date\), queryFn: \(\) => loadNcaabSlate\(date\), staleTime: NCAAB_STALE_MS, enabled: priced, retry: 1 \}\)/);
  });

  it("says what the desk is and is not, on every view", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/ncaab/NcaabDesk.tsx"), "utf8");
    expect(src).toContain("There is no model of its own on this desk, so an edge here is line shopping and nothing more.");
    expect(src).toContain("Informational only, not betting advice.");
    expect(src).toContain("Prices refresh at most every four minutes.");
  });
});

describe("the feed client", () => {
  const mem = new Map<string, string>();
  function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
    const calls: [string, unknown][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: unknown) => (calls.push([String(url), init]), new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers }))),
    );
    vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => void mem.set(k, v), getItem: (k: string) => mem.get(k) ?? null });
    return calls;
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    mem.clear();
  });

  it("asks this app's own route for one date, uncached, with no credential and nothing else", async () => {
    const calls = stub(200, slateOf());
    const got = await loadNcaabSlate("2026-11-12");
    expect(calls).toEqual([["/api/ncaab?date=2026-11-12", { cache: "no-store" }]]);
    expect(got.priced).toBe(5);
    expect(ncaabQueryKey("2026-11-12")).toEqual(["ncaab", "slate", "2026-11-12"]);
    expect(NCAAB_STALE_MS).toBe(240_000);
  });

  it("remembers the credits left in the pool every desk shares, only when the server sent the count", async () => {
    stub(200, slateOf(), { "x-requests-remaining": "90000" });
    await loadNcaabSlate("2026-11-12");
    expect(mem.get("pl_quota")).toBe("90000");
    expect(Number(mem.get("pl_quota_at"))).toBe(NOW);
    mem.clear();
    stub(200, slateOf());
    await loadNcaabSlate("2026-11-12");
    expect(mem.size).toBe(0);
  });

  it("a refusal is thrown in the server's own words, and an unreadable answer by its status", async () => {
    stub(502, { error: "schedule unavailable: espn scoreboard 503 for ncaab 2026-11-12" });
    await expect(loadNcaabSlate("2026-11-12")).rejects.toThrow("schedule unavailable: espn scoreboard 503 for ncaab 2026-11-12");
    stub(500, "<html>");
    await expect(loadNcaabSlate("2026-11-12")).rejects.toThrow("college basketball feed 500");
    stub(200, "not json");
    await expect(loadNcaabSlate("2026-11-12")).rejects.toThrow("college basketball feed 200");
  });
});
