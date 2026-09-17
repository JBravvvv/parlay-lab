import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { evPct, parseAm, readMyParlay, MY_PARLAY_MAX } from "@/lib/my-parlay";
import { MyParlayBar, MyToggle } from "@/components/mlb/MyParlayBar";
import { combineTicket } from "@/lib/ticket-math";

/**
 * MY PARLAY (INSTRUCTION 71, 2026-09-17, Josh: "there should be an option there or parlay generator
 * to see the edge % on any parlay that i personally generate/create using the metrics used by the
 * engine to generate its own parlays"). The bar prices a tapped leg list with the engine's own
 * ticket arithmetic — prob × dec − 1 — and says out loud what it cannot do (same-game correlation).
 * Node runtime, renderToStaticMarkup, React on the global (see tests/player-mark.test.ts).
 */
vi.stubGlobal("React", React);
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// a real ticket off the 2026-09-17 production board: Hits parlay · 2 legs, -102 @ book, EV +3%
const PENA = { key: "Jeremy Pena (HOU)|Hits O 0.5", label: "Jeremy Pena (HOU)", sub: "Hits O 0.5", gkey: "kansascityroyals@houstonastros", odds: -273, prob: 73.9 };
const OTHER = { key: "Bobby Witt Jr. (KC)|Hits O 0.5", label: "Bobby Witt Jr. (KC)", sub: "Hits O 0.5", gkey: "kansascityroyals@houstonastros", odds: -240, prob: 70.4 };
const TIGER = { key: "Detroit Tigers|ML", label: "Tigers ML", sub: "ML", gkey: "detroittigers@clevelandguardians", odds: 120, prob: 48.5 };

describe("readMyParlay — the engine's ticket math on a hand-built leg list", () => {
  it("EV is prob × dec − 1 over the priced legs, exactly combineTicket", () => {
    const r = readMyParlay([PENA, OTHER]);
    const c = combineTicket([{ cz: -273, prob: 73.9 }, { cz: -240, prob: 70.4 }])!;
    const { payout: _p, ...cf } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { payout: _q, ...rf } = r.calc!; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(rf).toEqual(cf);
    expect(r.calc!.payout(100)).toBe(c.payout(100));
    expect(r.calc!.ev).toBeCloseTo(0.739 * 0.704 * c.dec - 1, 12);
    expect(r.priced).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
    expect(r.fairAm).not.toBeNull();
  });
  it("names the same-game pair and flags a third leg from one game against the engine's cap", () => {
    expect(readMyParlay([PENA, OTHER, TIGER]).sameGame).toEqual([{ gkey: "kansascityroyals@houstonastros", n: 2 }]);
    expect(readMyParlay([PENA, OTHER, TIGER]).overCap).toEqual([]);
    const third = { ...TIGER, key: "x", gkey: "kansascityroyals@houstonastros" };
    expect(readMyParlay([PENA, OTHER, third]).overCap).toEqual([{ gkey: "kansascityroyals@houstonastros", n: 3 }]);
  });
  it("a leg without a price at the book, or without a model %, is named and left out of the math — never invented", () => {
    const r = readMyParlay([PENA, { ...TIGER, odds: null }, { ...OTHER, prob: null }]);
    expect(r.priced.map((l) => l.key)).toEqual([PENA.key]);
    expect(r.skipped.map((s) => s.why)).toEqual(["no price at this book", "no model probability"]);
    expect(r.calc!.n).toBe(1);
    expect(readMyParlay([]).calc).toBeNull();
    expect(readMyParlay([{ ...PENA, odds: null }]).calc).toBeNull();
  });
  it("parseAm reads the board's price strings the way the Odds column does", () => {
    expect(parseAm("+150")).toBe(150);
    expect(parseAm("-102")).toBe(-102);
    expect(parseAm(-273)).toBe(-273);
    expect(parseAm(null)).toBeNull();
    expect(parseAm("")).toBeNull();
    expect(parseAm("—")).toBeNull();
  });
  it("evPct writes EV the way the engine's ticket notes do", () => {
    expect(evPct(0.03)).toBe("+3%");
    expect(evPct(-0.075)).toBe("-7.5%");
    expect(evPct(0)).toBe("0%");
  });
});

describe("MyParlayBar — renders the read, with a mark on every leg", () => {
  it("two priced legs: odds, true %, implied, EV and both legs with headshot marks", () => {
    const s = html(createElement(MyParlayBar, { legs: [PENA, OTHER], onRemove: () => {}, onClear: () => {}, bottom: 0 }));
    const c = combineTicket([{ cz: -273, prob: 73.9 }, { cz: -240, prob: 70.4 }])!;
    expect(s).toContain('data-testid="my-parlay-bar"');
    expect(s).toContain("My parlay");
    expect(s).toContain(`${(c.trueProb * 100).toFixed(1)}%`);
    expect(s).toContain(evPct(c.ev));
    expect((s.match(/data-testid="my-parlay-leg"/g) ?? []).length).toBe(2);
    expect((s.match(/data-player-mark/g) ?? []).length).toBe(2);
    expect(s).toContain('data-testid="my-parlay-same-game"');
    expect(s).toContain("correlation is not modelled");
  });
  it("a team leg draws the club logo; an unpriced leg is listed and named as left out", () => {
    const s = html(createElement(MyParlayBar, { legs: [TIGER, { ...PENA, odds: null }], onRemove: () => {}, onClear: () => {}, bottom: 0 }));
    expect((s.match(/data-team-mark/g) ?? []).length).toBe(1);
    expect(s).toContain("left out of the math");
    expect(s).toContain("no price at this book");
  });
  it("no legs → nothing rendered", () => {
    expect(html(createElement(MyParlayBar, { legs: [], onRemove: () => {}, onClear: () => {}, bottom: 0 }))).toBe("");
  });
  it("MyToggle states", () => {
    expect(html(createElement(MyToggle, { on: false, onClick: () => {}, label: "x" }))).toContain('data-my-toggle="off"');
    expect(html(createElement(MyToggle, { on: true, onClick: () => {}, label: "x" }))).toContain('data-my-toggle="on"');
    expect(MY_PARLAY_MAX).toBe(10);
  });
});

describe("Board + ParlaysSection wiring (source pins)", () => {
  it("both board tables carry the + column and the page renders the bar", () => {
    const s = read("app/board/page.tsx");
    expect((s.match(/key: "mine",\n\s*header: "\+",/g) ?? []).length).toBe(2);
    expect(s).toContain("const mine = useMyParlay();");
    expect(s).toContain("<MyParlayBar legs={mine.legs} onRemove={mine.remove} onClear={mine.clear} />");
    expect(s).toMatch(/<ParlaysSection[\s\S]*?mine=\{mine\}/);
    // the toggle reads the row's model % and the SELECTED book's price (live first), never another book's
    expect(s).toContain("odds: liveAmOf(r) ?? parseAm(r.czOdds),");
    expect(s).toContain("odds: parseAm(p.odds),");
  });
  it("ParlaysSection pages instead of stopping at 24, and every ticket leg can be tapped in", () => {
    const s = read("src/components/mlb/ParlaysSection.tsx");
    expect(s).toContain("const SHOW_CAP = 24;");
    expect(s).toContain("const SHOW_STEP = 48;");
    expect(s).toContain("playable.slice(0, cap)");
    expect(s).toContain('data-testid="parlays-more"');
    expect(s).toContain("setCap((c) => c + SHOW_STEP)");
    expect(s).toContain("setCap(playable.length)");
    expect(s).not.toContain("narrow with the filters above");
    expect(s).toContain('data-testid="ticket-to-mine"');
    expect(s).toContain("mine.addAll(t.legs.map(legOfTicket))");
    expect(s).toMatch(/<MyToggle on=\{mine\.has\(ml\.key\)\} onClick=\{\(\) => mine\.toggle\(ml\)\}/);
  });
});
