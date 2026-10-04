import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stripComments } from "./helpers/source";
import { buildIndex, propRowLabel, resolvePlayer } from "@/lib/player-card";
import { mlbLabelPosition, mlbLeadingName, mlbPickPosition, positionResolver, type PositionRow } from "@/lib/mlb/positions";
import { LabelWithPos, PosTag, cleanPos } from "@/components/player/PosTag";
import { MlbLeadText, MlbPosTag } from "@/components/player/MlbPosTag";
import { BoardLabel } from "@/components/player/PlayerName";
import { GenSheet } from "@/components/props/GenSheet";
import { MLB_GEN_MARKETS, buildPool } from "@/components/props/mlb-gen-pool";
import { generate, specSeed, type GenSpec } from "@/lib/parlay-gen";
import { shownFootballPosition, useRosterPositions } from "@/lib/football/useRosterPositions";
import { answeredTeams, gamePosition, positionLookup, type PositionFeed } from "@/lib/football/positions";
import type { PropBoardGame } from "@/engine";

/**
 * 2026-09-28 — Josh, verbatim: "Add players position to every pick on parlay lab".
 *
 * The position is the sport's own data (MLB's primary position from the season index; ESPN's athlete position for
 * football) and an ambiguous or unknown player shows NO tag — never a guess.
 */
(globalThis as { React?: typeof React }).React = React;
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/mlb-visuals", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb-visuals")>()),
  useHeadshots: () => ({}),
}));

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

/* a synthetic index with every collision the resolver has to survive */
const DOC = {
  people: [
    { id: 1, fullName: "Aaron Judge", currentTeam: { id: 147 }, primaryPosition: { abbreviation: "RF" } },
    { id: 2, fullName: "José Ramírez", currentTeam: { id: 114 }, primaryPosition: { abbreviation: "3B" } },
    { id: 3, fullName: "Ronald Acuña Jr.", currentTeam: { id: 144 }, primaryPosition: { abbreviation: "RF" } },
    { id: 4, fullName: "Luis García", currentTeam: { id: 120 }, primaryPosition: { abbreviation: "2B" } },
    { id: 5, fullName: "Luis Garcia", currentTeam: { id: 135 }, primaryPosition: { abbreviation: "P" } },
    { id: 6, fullName: "Will Smith", currentTeam: { id: 119 }, primaryPosition: { abbreviation: "C" } },
    { id: 7, fullName: "Shohei Ohtani", currentTeam: { id: 119 }, primaryPosition: { abbreviation: "TWP" } },
    { id: 8, fullName: "Josh Smith", currentTeam: { id: 140 }, primaryPosition: { abbreviation: "SS" } },
    { id: 9, fullName: "Jake Smith", currentTeam: { id: 147 }, primaryPosition: { abbreviation: "P" } },
    { id: 10, fullName: "Tarik Skubal", currentTeam: { id: 116 }, primaryPosition: { abbreviation: "P" } },
    { id: 11, fullName: "Free Agent", primaryPosition: { abbreviation: "LF" } },
  ],
};
const INDEX = buildIndex(DOC);
const ROWS: PositionRow[] = INDEX.map((e) => [e.fullName, e.team, e.pos]);
const RESOLVE = positionResolver(ROWS);

describe("MLB — the position index resolves a pick's name exactly as the player sheet does", () => {
  it("matches resolvePlayer on every name form, with and without a team", () => {
    const names = [
      ...INDEX.map((e) => e.fullName),
      ...INDEX.map((e) => e.fullName.toUpperCase()),
      ...INDEX.map((e) => { const p = e.fullName.split(" "); return `${p[0][0]}. ${p.slice(1).join(" ")}`; }),
      "Jose Ramirez", "Ronald Acuna", "Ronald Acuna Jr", "R. Acuna Jr.", "J Smith", "L Garcia", "Nobody Here", "", "X",
    ];
    let checked = 0;
    for (const n of names) for (const t of [null, "NYY", "LAD", "CLE", "WSH", "WAS", "SEA", "TEX", "DET", "ATL", "OAK"]) {
      expect(RESOLVE(n, t), `${n} / ${t}`).toBe(resolvePlayer(INDEX, n, t)?.position ?? null);
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
  });
  it("an ambiguous name shows no position unless the pick's team settles it", () => {
    expect(RESOLVE("Luis Garcia", null)).toBeNull();
    expect(RESOLVE("Luis Garcia", "WSH")).toBe("2B");
    expect(RESOLVE("Luis Garcia", "WAS")).toBe("2B"); /* a book spelling folds to MLB's */
    expect(RESOLVE("Luis Garcia", "SD")).toBe("P");
    expect(RESOLVE("J Smith", null)).toBeNull(); /* Josh or Jake */
    expect(RESOLVE("J Smith", "NYY")).toBe("P");
    expect(RESOLVE("Nobody Here", "NYY")).toBeNull();
  });
  it("accents, suffixes and case never block a match", () => {
    expect(RESOLVE("Jose Ramirez", "CLE")).toBe("3B");
    expect(RESOLVE("RONALD ACUNA JR.", null)).toBe("RF");
    expect(RESOLVE("aaron judge")).toBe("RF");
  });
  it("the two-way player reads P on a pitcher market and DH on a hitter's; every other position is MLB's own", () => {
    expect(mlbPickPosition("TWP", "pitcher_strikeouts")).toBe("P");
    expect(mlbPickPosition("TWP", "batter_home_runs")).toBe("DH");
    expect(mlbPickPosition("TWP", null)).toBe("TWP"); /* no market to say which role — MLB's own label */
    expect(mlbPickPosition("RF", "pitcher_strikeouts")).toBe("RF");
    expect(mlbPickPosition(null, "batter_hits")).toBeNull();
  });
});

describe("the tag itself", () => {
  it("prints the abbreviation with its full name as the title, and nothing for an unknown position", () => {
    const out = renderToStaticMarkup(createElement(PosTag, { pos: "RF" }));
    expect(out).toMatch(/^<span data-pos-tag="RF" title="Right field" class="pos-tag [^"]*">RF<\/span>$/);
    expect(renderToStaticMarkup(createElement(PosTag, { pos: "qb" }))).toContain('title="Quarterback"');
    for (const bad of [null, undefined, "", "  ", "D/ST", "Quarterback", "12", "<b>"]) {
      expect(renderToStaticMarkup(createElement(PosTag, { pos: bad as string | null }))).toBe("");
    }
  });
  it("cleanPos keeps every MLB and football abbreviation the feeds send", () => {
    for (const p of ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "OF", "TWP", "QB", "RB", "WR", "TE", "FB", "ATH", "K", "PK"]) {
      expect(cleanPos(p)).toBe(p);
    }
    expect(cleanPos(" wr ")).toBe("WR");
  });
});

/* ------------------------------------------------------------------ the MLB data path */

/** the app's query cache with the position index already in it — what every MLB surface reads */
function withIndex(node: React.ReactElement, rows: readonly PositionRow[] = ROWS) {
  const qc = new QueryClient();
  qc.setQueryData(["mlb-positions"], { season: 2026, players: rows });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
}

describe("MLB — the tag on a printed label", () => {
  it("BoardLabel ends a player label with his position, and a club label with nothing", () => {
    const out = withIndex(createElement(BoardLabel, { label: "Aaron Judge (NYY)", market: "batter_hits" }));
    expect(out).toMatch(/Aaron Judge<\/span> \(NYY\)<span data-pos-tag="RF"/);
    expect(withIndex(createElement(BoardLabel, { label: "New York Yankees" }))).not.toContain("data-pos-tag");
    /* the team suffix is what settles a shared name */
    expect(withIndex(createElement(BoardLabel, { label: "Luis Garcia (WSH)" }))).toContain('data-pos-tag="2B"');
    expect(withIndex(createElement(BoardLabel, { label: "Luis Garcia (SD)" }))).toContain('data-pos-tag="P"');
    /* a bare name on a player market (the engine dropped the suffix) is still tagged when it is unambiguous */
    expect(withIndex(createElement(BoardLabel, { label: "Tarik Skubal", market: "pitcher_strikeouts" }))).toContain('data-pos-tag="P"');
    expect(withIndex(createElement(BoardLabel, { label: "Luis Garcia", market: "batter_hits" }))).not.toContain("data-pos-tag");
  });
  it("the two-way player reads P on his pitching line and DH on his hitting line", () => {
    expect(withIndex(createElement(BoardLabel, { label: "Shohei Ohtani (LAD)", market: "pitcher_strikeouts" }))).toContain('data-pos-tag="P"');
    expect(withIndex(createElement(BoardLabel, { label: "Shohei Ohtani (LAD)", market: "batter_home_runs" }))).toContain('data-pos-tag="DH"');
    /* an lkey that names no player market is dropped, never read as a hitter */
    expect(withIndex(createElement(BoardLabel, { label: "Shohei Ohtani (LAD)", market: "other" }))).toContain('data-pos-tag="TWP"');
  });
  it("the Board's team-less row is the bare name (the engine's own label since 2026-09-28), and it is tagged as it is", () => {
    const label = propRowLabel({ p: "Tarik Skubal", tm: null });
    expect(label).toBe("Tarik Skubal");
    expect(withIndex(createElement(BoardLabel, { label, market: "pitcher_strikeouts" }))).toMatch(/class="pick-identity-name">Tarik Skubal<\/span><span data-pos-tag="P"/);
    /* the old "Name (null)" string never resolved — which is why the label is bare now rather than stripped for display */
    expect(withIndex(createElement(BoardLabel, { label: "Tarik Skubal (null)", market: "pitcher_strikeouts" }))).not.toContain("data-pos-tag");
    /* a leg with no market (an old My parlay leg) still tags a "Name (TEAM)" label, with MLB's own label for the two-way player */
    expect(withIndex(createElement(BoardLabel, { label: "Shohei Ohtani (LAD)" }))).toContain('data-pos-tag="TWP"');
  });
  it("no index yet, or a game market, draws no tag — and a bare render needs no provider", () => {
    expect(renderToStaticMarkup(createElement(BoardLabel, { label: "Aaron Judge (NYY)", market: "batter_hits" }))).not.toContain("data-pos-tag");
    expect(withIndex(createElement(MlbPosTag, { label: "Aaron Judge (NYY)", market: "ml" }))).toBe("");
    expect(withIndex(createElement(MlbPosTag, { name: "Aaron Judge", market: "batter_hits", pos: "CF" }))).toContain('data-pos-tag="CF"');
  });
  it("mlbLabelPosition reads the printed label the same way", () => {
    expect(mlbLabelPosition(RESOLVE, "Aaron Judge (NYY)", "batter_total_bases")).toBe("RF");
    expect(mlbLabelPosition(RESOLVE, "Aaron Judge (NYY)", "ml")).toBeNull();
    expect(mlbLabelPosition(null, "Aaron Judge (NYY)", "batter_hits")).toBeNull();
    expect(mlbLabelPosition(RESOLVE, "Luis Garcia (WSH)", null)).toBe("2B");
  });
  it("an engine line that only opens with the name (The Sharp's trap / passes) tags an exact, unshared name only", () => {
    expect(mlbLeadingName(RESOLVE, "Aaron Judge Hits O 1.5 (-150)")).toEqual({ name: "Aaron Judge", pos: "RF", rest: "Hits O 1.5 (-150)" });
    expect(mlbLeadingName(RESOLVE, "Ronald Acuña Jr. TB O 1.5 (+120)")).toEqual({ name: "Ronald Acuña Jr.", pos: "RF", rest: "TB O 1.5 (+120)" });
    expect(mlbLeadingName(RESOLVE, "Luis Garcia Hits O 0.5 (-200)")?.pos).toBeNull();
    expect(mlbLeadingName(RESOLVE, "Nobody Special Hits O 0.5 (-110)")).toBeNull();
    expect(mlbLeadingName(RESOLVE, "Judge")).toBeNull();
    const out = withIndex(createElement(MlbLeadText, { text: "Aaron Judge Hits O 1.5 (-150)" }));
    expect(out).toBe('Aaron Judge<span data-pos-tag="RF" title="Right field" class="pos-tag inline-flex h-[14px] shrink-0 items-center rounded-[3px] border border-white/15 bg-white/[0.06] px-[3px] align-[1px] text-[8.5px] font-bold uppercase leading-none tracking-[0.04em] text-muted ml-1">RF</span> Hits O 1.5 (-150)');
    expect(withIndex(createElement(MlbLeadText, { text: "Luis Garcia Hits O 0.5 (-200)" }))).toBe("Luis Garcia Hits O 0.5 (-200)");
  });
  it("the route serves the season index from statsapi only — never the Odds API, no parameters, cached at the edge", () => {
    const src = [readSrc("app/api/mlb/positions/route.ts"), readSrc("src/lib/mlb/player-index.ts")].join("\n");
    const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(["statsapi.mlb.com"]));
    expect(src).not.toMatch(/api\.the-odds-api|ODDS_API|process\.env\./);
    const route = readSrc("app/api/mlb/positions/route.ts");
    expect(route).toMatch(/export async function GET\(\)/);
    expect(route).toMatch(/players: index\.map\(\(e\) => \[e\.fullName, e\.team, e\.pos\] as const\)/);
    expect(route).toMatch(/public, s-maxage=21600/);
  });
});

describe("MLB — generated legs carry the position, and nothing else about them moves", () => {
  const FIXTURE = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/gen-pool.json"), "utf8")) as { propBoard: PropBoardGame[] };
  const SPEC: GenSpec = { market: "batter_hits_runs_rbis", legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o", onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null] };
  const names = [...new Set(FIXTURE.propBoard.flatMap((g) => Object.values(g.markets ?? {}).flat().map((r) => r.p)))];
  /* every fixture name indexed as a unique first baseman; one of them a two-way player */
  const rows: PositionRow[] = names.map((n, i) => [n, null, i === 0 ? "TWP" : "1B"]);
  const resolve = positionResolver(rows);

  it("with the index each leg is stamped; without it the pool is exactly what it was", () => {
    const bare = buildPool(FIXTURE.propBoard, SPEC, 0);
    const tagged = buildPool(FIXTURE.propBoard, SPEC, 0, undefined, resolve);
    expect(bare.legs.every((l) => !("position" in l))).toBe(true);
    expect(tagged.legs.length).toBe(bare.legs.length);
    expect(tagged.legs.every((l) => l.position === "1B" || l.position === "DH" || l.position === "P")).toBe(true);
    const strip = (xs: typeof bare.legs) => xs.map(({ position: _p, ...rest }) => JSON.stringify({ ...rest, leg: rest.leg }));
    expect(strip(tagged.legs)).toEqual(strip(bare.legs));
    /* the same seed draws the same ticket either way */
    const a = generate(bare, SPEC, specSeed(SPEC, "2026-07-10", 0));
    const b = generate(tagged, SPEC, specSeed(SPEC, "2026-07-10", 0));
    if (!a.ok || !b.ok) throw new Error("fixture must generate");
    expect(b.ticket.legs.map((l) => l.id)).toEqual(a.ticket.legs.map((l) => l.id));
  });
  it("the generator slot draws the tag right after the name, on its own line with the name", () => {
    const pool = buildPool(FIXTURE.propBoard, SPEC, 0, undefined, resolve);
    const result = generate(pool, SPEC, specSeed(SPEC, "2026-07-10", 0));
    const out = renderToStaticMarkup(createElement(GenSheet, {
      market: SPEC.market, marketLabel: "H+R+RBI", markets: MLB_GEN_MARKETS, pool, spec: SPEC, onSpec: () => {}, result,
      onGenerate: () => {}, onTogglePin: () => {}, onAdd: () => {}, canUndo: false, onUndo: () => {}, open: true, onOpen: () => {}, boardAt: null,
    } as Parameters<typeof GenSheet>[0]));
    const cards = out.split('data-gen-slot="').slice(1);
    expect(cards).toHaveLength(4);
    for (const c of cards) {
      const name = c.indexOf('<div class="gen-pick-name flex min-w-0 items-center">');
      const tag = c.indexOf("data-pos-tag=");
      const sub = c.indexOf('class="mt-[3px] flex items-center gap-1 truncate text-[9.5px] text-faint"');
      expect(name).toBeGreaterThan(-1);
      expect(tag).toBeGreaterThan(name);
      expect(tag).toBeLessThan(sub);
    }
    /* the old sub-line chip is gone — one tag per slot */
    expect(out).not.toContain("text-[8px] text-text\">");
    expect(cards.every((c) => (c.match(/data-pos-tag=/g) ?? []).length === 1)).toBe(true);
  });
  it("the simulator's leg keys are the board rows' own lkeys (the name squashed), so its tag reads the row's printed name", () => {
    /* the engine's pnorm + shLegKey, as the sim keys its legs */
    const pnorm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const byKey = new Map<string, { p: string; tm: string | null }>();
    let rowsSeen = 0;
    for (const g of FIXTURE.propBoard) for (const [mkt, rs] of Object.entries(g.markets ?? {})) for (const r of rs) {
      expect(r.lkey).toBe(`${pnorm(r.p)}|${mkt}|${r.ln}`);
      byKey.set(r.lkey, r);
      rowsSeen++;
    }
    expect(rowsSeen).toBeGreaterThan(50);
    /* a squashed key alone never resolves; the row it names does */
    const [key, row] = [...byKey.entries()][0];
    const idx = positionResolver([[row.p, row.tm, "SS"]]);
    expect(idx(key.split("|")[0])).toBeNull();
    expect(idx(row.p, row.tm)).toBe("SS");
  });
  it("a slot never stamped (spun before the index landed, or a held leg whose price moved) still tags from its label", () => {
    const pool = buildPool(FIXTURE.propBoard, SPEC, 0);
    const result = generate(pool, SPEC, specSeed(SPEC, "2026-07-10", 0));
    const sheet = createElement(GenSheet, {
      market: SPEC.market, marketLabel: "H+R+RBI", markets: MLB_GEN_MARKETS, pool, spec: SPEC, onSpec: () => {}, result,
      onGenerate: () => {}, onTogglePin: () => {}, onAdd: () => {}, canUndo: false, onUndo: () => {}, open: true, onOpen: () => {}, boardAt: null,
    } as Parameters<typeof GenSheet>[0]);
    /* no index on the device yet: nothing — never a guess */
    expect(renderToStaticMarkup(sheet)).not.toContain("data-pos-tag");
    const cards = withIndex(sheet, rows).split('data-gen-slot="').slice(1);
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => (c.match(/data-pos-tag="(1B|DH)"/g) ?? []).length === 1)).toBe(true);
  });
});

/* ------------------------------------------------------------------ football */

describe("football — the verified position, else the feed's own, never a guess", () => {
  it("LabelWithPos seats the tag right after the name inside a label that starts with it", () => {
    expect(renderToStaticMarkup(createElement(LabelWithPos, { label: "Josh Allen Over 250.5", player: "Josh Allen", pos: "QB" }))).toMatch(/^<span class="pick-identity-name">Josh Allen<\/span><span data-pos-tag="QB"[^>]*>QB<\/span> Over 250\.5$/);
    expect(renderToStaticMarkup(createElement(LabelWithPos, { label: "Over 250.5", player: "Josh Allen", pos: "QB" }))).toMatch(/^<span class="pick-identity-name">Over 250\.5<\/span><span data-pos-tag="QB"/);
    expect(renderToStaticMarkup(createElement(LabelWithPos, { label: "Bills D/ST Anytime TD", player: "Bills D/ST", pos: "D/ST" }))).toBe('<span class="pick-identity-name">Bills D/ST</span> Anytime TD');
    expect(renderToStaticMarkup(createElement(LabelWithPos, { label: "Josh Allen Over 250.5", player: "Josh Allen", pos: null }))).toBe('<span class="pick-identity-name">Josh Allen</span> Over 250.5');
  });
  it("shownFootballPosition prefers the roster-verified position and keeps an ESPN abbreviation it cannot verify", () => {
    expect(shownFootballPosition("WR", "ATH")).toBe("WR");
    expect(shownFootballPosition(null, "ATH")).toBe("ATH");
    expect(shownFootballPosition(null, null)).toBeNull();
  });
  it("the roster fallback is one shared hook, loaded whenever player props are on screen — not only with the generator open", () => {
    const hook = readSrc("src/lib/football/useRosterPositions.ts");
    expect(hook).toMatch(/queryKey: \[league, "roster-positions", teams\]/);
    expect(hook).toMatch(/enabled: enabled && !!teams/);
    expect(hook).toMatch(/footballPosition\(row\.pos\) \?\? \(game \? gamePosition\(rosterPosition, answered, row\.player, row\.teamId, \[game\.home\.id, game\.away\.id\]\) : null\)/);
    /* a grown team list keeps the rosters in hand (same league only), and a final game's teams stay in the list */
    expect(hook).toMatch(/placeholderData: \(prev, prevQuery\) => \(prevQuery\?\.queryKey\[0\] === league \? prev : undefined\)/);
    expect(hook).not.toMatch(/status !== "final"|status !== "postponed"/);
    expect(hook).toMatch(/const pending = enabled && !!teams && \(q\.isPending \|\| q\.isPlaceholderData\);/);
    const props = readSrc("src/components/cfb/CfbProps.tsx");
    /* never gated on the view — the generator draws props from the Sides view, and its positions wait needs an answer */
    expect(props).toMatch(/const roster = useRosterPositions\(L\.id, board\?\.rows, games\);/);
    expect(props).toMatch(/positionsLoading=\{roster\.pending\}/);
    expect(props).toMatch(/\(!!gen\.spec\.positions\?\.length && roster\.pending\)/);
    expect(props).not.toMatch(/positionsQ|rosterTeams/);
    expect(props).not.toMatch(/loadRosterPositions/);
    expect(props).toMatch(/groupProps\(shownRows\.filter\(/);
    expect(props).toMatch(/pos: shownFootballPosition\(positionOf\(row\), row\.pos\)/);
    const board = readSrc("src/components/cfb/CfbPicksBoard.tsx");
    expect(board).toMatch(/const roster = useRosterPositions\(L\.id, pricedProps\?\.rows, current\?\.games \?\? NO_GAMES, propsOn\);/);
    expect(board).toMatch(/\.map\(r=>\{const pos=shownFootballPosition\(roster\.positionOf\(r\),r\.pos\);return pos===r\.pos\?r:\{\.\.\.r,pos\};\}\)/);
  });

  /* the feed keeps offensive players only: team 100's Jordan Davis is an ATH (dropped), team 200 has a WR namesake */
  const FEED: PositionFeed = {
    players: [
      { athleteId: "9", player: "Jordan Davis", teamId: "200", position: "WR" },
      { athleteId: "5", player: "Cole Hart", teamId: "100", position: "QB" },
      { athleteId: "6", player: "Sam Reed", teamId: "300", position: "TE" },
    ],
    missingTeams: ["400"],
  };
  const LOOKUP = positionLookup(FEED.players);
  it("gamePosition searches the pick's own team alone whenever the row names one of the game's two sides", () => {
    const answered = answeredTeams(FEED);
    expect([...answered].sort()).toEqual(["100", "200", "300"]);
    /* the namesake on the other side never lends his position */
    expect(gamePosition(LOOKUP, answered, "Jordan Davis", "100", ["100", "200"])).toBeNull();
    expect(gamePosition(LOOKUP, answered, "Jordan Davis", "200", ["100", "200"])).toBe("WR");
    expect(gamePosition(LOOKUP, answered, "Cole Hart", "100", ["100", "200"])).toBe("QB");
    /* unknown team: both sides, once both answered */
    expect(gamePosition(LOOKUP, answered, "Cole Hart", null, ["100", "200"])).toBe("QB");
    expect(gamePosition(LOOKUP, answered, "Sam Reed", null, ["300", "400"])).toBeNull(); /* 400's roster is missing */
    expect(gamePosition(LOOKUP, answered, "Sam Reed", "300", ["300", "400"])).toBe("TE"); /* his own side answered */
    expect(gamePosition(LOOKUP, answered, "Sam Reed", null, ["300", "500"])).toBeNull(); /* 500 never asked */
    /* a teamId outside the game is treated as unknown, never trusted */
    expect(gamePosition(LOOKUP, answered, "Cole Hart", "999", ["100", "200"])).toBe("QB");
    expect(answeredTeams(null).size).toBe(0);
  });
  it("useRosterPositions: the verified position, the own-team scope, final games kept, pending until the list answers", () => {
    type Row = { gameId: string; player: string; pos: string | null; teamId: string | null; headshot: string | null };
    const games = [
      { id: "g1", status: "final", home: { id: "100" }, away: { id: "200" } },
      { id: "g2", status: "upcoming", home: { id: "300" }, away: { id: "400" } },
    ];
    const rows: Row[] = [
      { gameId: "g1", player: "Jordan Davis", pos: "ATH", teamId: "100", headshot: null },
      { gameId: "g1", player: "Jordan Davis", pos: null, teamId: "200", headshot: null },
      { gameId: "g1", player: "Cole Hart", pos: null, teamId: null, headshot: null },
      { gameId: "g1", player: "Josh Allen", pos: "QB", teamId: "100", headshot: "https://x" },
      { gameId: "g2", player: "Sam Reed", pos: null, teamId: null, headshot: null },
    ];
    const run = (seed: boolean) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      if (seed) client.setQueryData(["cfb", "roster-positions", "100,200,300,400"], FEED);
      const out: { teams?: string; pending?: boolean; pos?: (string | null)[] } = {};
      function Probe() {
        const r = useRosterPositions("cfb", rows, games, false);
        out.teams = r.teams;
        out.pending = r.pending;
        out.pos = rows.map((row) => shownFootballPosition(r.positionOf(row), row.pos));
        return null;
      }
      renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
      return out;
    };
    const landed = run(true);
    expect(landed.teams).toBe("100,200,300,400"); /* the final game's teams stay in the list */
    expect(landed.pos).toEqual(["ATH", "WR", "QB", "QB", null]);
    expect(landed.pending).toBe(false); /* disabled here, so never "pending" */
    const empty = run(false);
    expect(empty.pos).toEqual(["ATH", null, null, "QB", null]);
  });
});

/* ------------------------------------------------------------------ every surface */

describe("every pick surface draws the tag", () => {
  const cases: [string, RegExp][] = [
    /* MLB */
    ["src/components/props/PlayerRow.tsx", /<MlbPosTag name=\{r\.p\} team=\{r\.tm\} market=\{cat\} \/>/],
    ["src/components/props/Slip.tsx", /<BoardLabel label=\{l\.label\} market=\{l\.market\} \/>/],
    ["src/components/props/Slip.tsx", /<PosTag pos=\{l\.cross\.position\}/],
    ["src/components/props/RankedPicks.tsx", /<span className="pick-identity-name">\{p\.label\}<\/span>\s*<PosTag pos=\{p\.position\} \/>/],
    ["app/props/page.tsx", /position: l\.position \?\? null,/],
    ["app/props/page.tsx", /at,hitSource,mlbPositions\)/],
    ["src/components/props/CrossBoardResults.tsx", /<b className="pick-identity-name">\{l\.label\}<\/b><PosTag pos=\{posOf\(l\)\}\/>/],
    ["src/components/props/CrossBoardResults.tsx", /const posOf=\(l:GenLeg<CrossLeg>\)=>l\.leg\.position\?\?l\.position\?\?null;/],
    ["src/components/props/ParkPickPreview.tsx", /position:l\.leg\.position\?\?l\.position\?\?null,/],
    ["src/components/props/RankedPicks.tsx", /position:l\.leg\.position\?\?l\.position\?\?null,/],
    /* the one place another sport's legs get their position: MLB's index; football's roster for the game */
    ["src/components/props/useCrossSports.ts", /const position=l\.leg\.position\?\?mlbLabelPosition\(mlbPositions,l\.label,l\.market\)/],
    ["src/components/props/useCrossSports.ts", /positionOf\(\{gameId:l\.leg\.gameId,player:l\.leg\.player,pos:l\.leg\.position\?\?null,teamId:teamIdOf\(l\)\}\)/],
    ["src/components/cfb/CfbTicketCard.tsx", /roster\.positionOf\(\{ gameId: leg\.gkey, player: leg\.player, pos: null, teamId: leg\.teamId \}\)/],
    ["src/components/props/useCrossSports.ts", /const nfl=useRosterPositions\("nfl",nflRows,q\.data\?\.data\.nfl\?\.slate\?\.games\?\?NO_GAMES,nflRows\.length>0\);/],
    ["src/components/props/useCrossSports.ts", /const cfb=useRosterPositions\("cfb",cfbRows,q\.data\?\.data\.cfb\?\.slate\?\.games\?\?NO_GAMES,cfbRows\.length>0\);/],
    ["src/components/mlb/ParlaysSection.tsx", /<BoardLabel showMark=\{false\} label=\{l\.label\} market=/],
    /* a team-less ALL-scope leg is the bare name since 2026-09-28, so the bar draws its label as it is */
    ["src/components/mlb/MyParlayBar.tsx", /<BoardLabel label=\{l\.label\} market=\{l\.market\} \/>/],
    ["src/components/mlb/ParlaysSection.tsx", /market: l\.market != null \? String\(l\.market\) : l\.lkey \? marketOf\(l\.lkey\) : null,/],
    ["app/board/page.tsx", /market: marketOfLkey\(r\.lkey\),\n\s*odds: liveAmOf\(r\)/],
    ["app/board/page.tsx", /market: p\.market \?\? cat,\n\s*odds: parseAm\(p\.odds\)/],
    ["src/components/mlb/LiveOpportunities.tsx", /<MlbPosTag name=\{r\.p\} team=\{r\.tm\} market=\{m\}\/>/],
    ["app/board/page.tsx", /<BoardLabel label=\{r\.label\} market=\{marketOfLkey\(r\.lkey\)\} \/>/],
    /* the ALL-scope player string is the engine's own label — a team-less row is the bare name since 2026-09-28 (its
       sportsbook-hide keys migrated by migrateCzHidden) — so the Pick cell draws it as it is and it gets its tag */
    ["app/board/page.tsx", /\{p\.player \? <BoardLabel label=\{p\.player\} market=\{p\.market \?\? cat\} \/> : null\}/],
    ["app/board/page.tsx", /rank: 0, player: propRowLabel\(r\), side: "o",/],
    ["app/builder/page.tsx", /<BoardLabel label=\{l\.label\} market=\{l\.lkey \? marketOf\(l\.lkey\) : null\} \/>/],
    ["app/builder/page.tsx", /\{r\.label\}<MlbPosTag label=\{r\.label\}/],
    ["app/builder/page.tsx", /<span className="text-text"><BoardLabel label=\{r\.label\} market=\{r\.lkey \? marketOf\(r\.lkey\) : null\} \/><\/span> <span className="text-muted">\{r\.sub\}<\/span>/],
    ["app/sharp/page.tsx", /<BoardLabel label=\{r\.label\} market=\{marketOfLkey\(r\.lkey\)\} \/>/],
    ["app/sharp/page.tsx", /<MlbLeadText text=\{trap\.prop\} \/>/],
    ["app/sharp/page.tsx", /<MlbLeadText text=\{p\.prop\} \/>/],
    /* ONE index observer for the whole Ledger — a closed day still mounts its tickets, a hook per leg went quadratic */
    ["app/ledger/page.tsx", /<LegPos label=\{l\.label\} market=\{legMarket\(l\.lkey\) \?\? \(player \? null : ""\)\} \/>\{" "\}/],
    ["app/ledger/page.tsx", /<LegPos label=\{l\.label\} market=\{legMarket\(l\.lkey\) \?\? \(parseBoardLabel\(l\.label\) \? null : ""\)\} \/>/],
    ["app/ledger/page.tsx", /function MlbLedgerPage\(\) \{\n  const \{ api, refresh \} = useLedger\(\);\n  const positions = useMlbPositions\(\);/],
    ["app/ledger/page.tsx", /<LedgerPositions\.Provider value=\{positions\}>/],
    ["app/ledger/page.tsx", /return <PosTag pos=\{mlbLabelPosition\(useContext\(LedgerPositions\), label, market\)\} \/>;/],
    /* the sim's keys squash the name ("aaronjudge|batter_hits|0.5"), so the tag reads the board row with that key */
    ["app/simulator/page.tsx", /for \(const g of board\?\.data\.propBoard \?\? \[\]\) for \(const rows of Object\.values\(g\.markets\)\) for \(const r of rows\) m\.set\(r\.lkey, r\);/],
    ["app/simulator/page.tsx", /\{rowByKey\.has\(k\) && <MlbPosTag name=\{rowByKey\.get\(k\)!\.p\} team=\{rowByKey\.get\(k\)!\.tm\} market=\{k\.split\("\|"\)\[1\]\} \/>\}/],
    /* shared + football */
    ["src/components/props/GenSheet.tsx", /<SlotPos gen=\{l\} \/>/],
    ["src/components/props/GenSheet.tsx", /const shown = gen\.position \?\? leg\.pos \?\? leg\.cross\?\.position;\n\s*return !shown && isMlbPlayerMarket\(gen\.market\) \? <MlbPosTag label=\{leg\.cross\?\.label \?\? gen\.label\} market=\{gen\.market\} \/> : <PosTag pos=\{shown\} \/>;/],
    ["src/components/cfb/CfbProps.tsx", /<span className="pick-identity-name">\{pl\.player\}<\/span>[\s\S]{0,200}<PosTag pos=\{pl\.pos\} \/>/],
    ["src/components/cfb/CfbProps.tsx", /position: l\.position \?\? l\.leg\.pos \?\? null,/],
    ["src/components/cfb/CfbSlip.tsx", /<LabelWithPos label=\{l\.label\} player=\{l\.player\} pos=\{posOf \? posOf\(l\) : l\.pos\} \/>/],
    ["src/components/cfb/CfbProps.tsx", /const shownPosByKey = useMemo\(\(\) => new Map\(\(shownRows \?\? \[\]\)\.map\(\(r\) => \[r\.key, r\.pos\]\)\), \[shownRows\]\);/],
    ["src/components/cfb/CfbProps.tsx", /posOf=\{\(l\) => shownPosByKey\.get\(l\.key\) \?\? l\.pos\}/],
    ["src/components/cfb/CfbTicketCard.tsx", /<LabelWithPos label=\{leg\.label\} player=\{leg\.player\} pos=\{legPos\(leg\)\} \/>/],
    /* the Board's width-capped single-line cells carry the tag on line two, before the market chip */
    ["src/components/cfb/CfbPicksBoard.tsx", /<div className="pick-identity-name text-text">\{r\.label\}<\/div>[\s\S]{0,400}\{r\.kind === "prop" && <PosTag pos=\{r\.pos\} className="mr-1" \/>\}\n\s*\{r\.kind === "prop" && <span/],
    ["src/components/cfb/CfbPicksBoard.tsx", /text-text">\{r\.label\}<\/div>\n\s*<div className="truncate text-\[10px\] leading-tight text-faint">\n\s*\{r\.kind === "prop" && <PosTag pos=\{r\.pos\} className="mr-1" \/>\}\n\s*<span className=\{`pick-market/],
    ["src/components/cfb/CfbPicksBoard.tsx", /<PosTag pos=\{top\.kind === "prop" \? top\.pos : null\} className="mr-1" \/>/],
    ["src/components/cfb/CfbPicksBoard.tsx", /<LabelWithPos label=\{leg\.label\} player=\{leg\.player\} pos=\{leg\.pos\} \/>/],
    ["src/components/cfb/CfbLedger.tsx", /<LabelWithPos label=\{leg\.label\} player=\{leg\.player\} pos=\{leg\.pos\} \/>/],
    ["src/components/cfb/GameSuggestedPicks.tsx", /<LabelWithPos label=\{r\.label\} player=\{r\.player\} pos=\{shownFootballPosition\(roster\.positionOf\(r\),r\.pos\)\}\/>/],
    ["src/components/nfl/FirstSundaySix.tsx", /<span><span className="pick-identity-name">\{r\.player\}<\/span><PosTag pos=\{r\.row\?shownFootballPosition\(positionOf\?\.\(r\.row\)\?\?null,r\.row\.pos\):null\}\/>/],
    ["src/components/cfb/CfbPicksBoard.tsx", /<FirstSundaySix date=\{date\} games=\{current\?\.games\?\?\[\]\} board=\{propsQ\.data\} now=\{liveClock\|\|Date\.now\(\)\} positionOf=\{roster\.positionOf\}\/>/],
    ["src/components/cfb/CfbSeason.tsx", /<SeasonLegLabel leg=\{l\} feed=\{data \?\? null\} \/>/],
    ["src/components/cfb/CfbSeason.tsx", /<SeasonLegLabel leg=\{l\} feed=\{feed\} \/>/],
  ];
  for (const [file, re] of cases) {
    it(`${file} ${re.source.slice(0, 48)}…`, () => {
      expect(readSrc(file)).toMatch(re);
    });
  }
  it("the Ledger holds no per-leg index hook, and the football Board's capped cells never seat the tag mid-label", () => {
    expect(readSrc("app/ledger/page.tsx")).not.toMatch(/<MlbPosTag/);
    expect(readSrc("src/components/cfb/CfbPicksBoard.tsx")).not.toMatch(/<LabelWithPos label=\{(r|top)\.label\}/);
  });
  it("BoardLabel — the shared MLB label on the slip, The Card, the Board and The Sharp — carries the tag itself", () => {
    const src = readSrc("src/components/player/PlayerName.tsx");
    expect(src).toMatch(/<MlbPosTag name=\{parsed\.name\} team=\{parsed\.team\} market=\{isMlbPlayerMarket\(market\) \? market : null\} \/>/);
    expect(src).toMatch(/if \(!parsed && isMlbPlayerMarket\(market\)\) return <>[\s\S]*?<span className="pick-identity-name">\{label\}<\/span><MlbPosTag name=\{label\} market=\{market\} \/><\/>;/);
  });
  it("the position never enters a copied ticket (labels and keys are proven unchanged by the pool comparison above)", () => {
    expect(readSrc("src/components/props/CrossBoardResults.tsx")).toMatch(/navigator\.clipboard\.writeText\(t\.legs\.map\(l=>`\$\{l\.sport\?\.toUpperCase\(\)\} \$\{l\.label\} \$\{l\.sub\}/);
  });
});
