import React, { createElement, useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import cfbSummary from "./fixtures/football/cfb-summary-401858425.json";
import { stripComments } from "./helpers/source";
import GamesPage from "../app/games/page";
import { CfbGames, heldSlate } from "@/components/cfb/CfbGames";
import { LeagueProvider } from "@/components/football/LeagueContext";
import { FootballGameDetail } from "@/components/games/FootballGameDetail";
import { TeamProfile } from "@/components/games/TeamProfile";
import { CFB_DESK } from "@/lib/cfb/desk";
import type { CfbSlate } from "@/lib/cfb/types";
import { shapeFootballGameDetail } from "@/lib/football/game-detail";
import { shapeGames, type ApiGame } from "@/lib/games";
import { DEFAULT_BOOK } from "@/lib/sportsbook/books";
import { buildCfbBoard } from "@/lib/cfb/model";
import { priceFootballSlate, resizeFootballStakes } from "@/lib/sportsbook/football";
import { swapSettleBook } from "./helpers/settle-book";
import { espnTeamSchedule, isUpcomingTeamGame, mlbTeamSchedule, type TeamProfileData, type TeamScheduleGame } from "@/lib/team-profile";

/**
 * GAMES COVERAGE FIXES (2026-09-28) — the six findings of the games-coverage review, one block each.
 *
 *   C0  app/games/page.tsx — the MLB sheet (live play-by-play, Game Preview, team page) lived inside the card, and each status
 *       has its own <Section> grid, so a status change remounted the card and closed the sheet mid-read; a failed background
 *       refetch swapped the whole list for an error although TanStack still held the slate.
 *   C1  mlbTeamSchedule repeated a postponed game (original date + makeup, one gamePk) and Upcoming was "anything not final".
 *   C2  CfbGames went to skeletons whenever a ledger sync moved the bankroll half of the slate key (every card, and its sheet,
 *       unmounted); the error panel also replaced a list it still had.
 *   C3  ESPN posts STATUS_POSTPONED / STATUS_CANCELED with state "post": coverage called it "final", the team row read 0–0.
 *   C4  neutral-site games rendered "@" on the team page.
 *   C5  the team page painted wins/live emerald and used *-accent classes that compile to nothing (theme scan in
 *       tests/theme-cerulean.test.ts).
 *
 * No DOM here (node env, no jsdom): component state cannot be driven, so structure is pinned on the source and the render
 * paths are exercised with renderToStaticMarkup over seeded query caches. Every fixture is hand-built in the provider's own
 * shape (statsapi / ESPN) or is the repo's captured ESPN summary.
 */

(globalThis as { React?: typeof React }).React = React;

/* the page's one sheet, stubbed as a visible marker: the real Overlay renders nothing until mounted, which a static render
   never is — the marker is how a render can count the sheets and prove where the page mounts them */
vi.mock("@/components/ui/Overlay", async () => {
  const { createElement: h } = await import("react");
  return {
    Overlay: ({ open, title, children }: { open: boolean; title: unknown; children: unknown }) =>
      h("div", { "data-sheet": open ? "open" : "closed", "data-sheet-title": typeof title === "string" ? title : "" }, open ? (children as React.ReactNode) : null),
  };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("date=2026-09-20") }));
/* the header is another lane's file and irrelevant to these paths */
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/motion/Reveal", () => ({ Reveal: ({ children }: { children: unknown }) => children }));

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const render = (qc: QueryClient, el: React.ReactElement) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, el));
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const sheets = (html: string) => html.match(/data-sheet="/g)?.length ?? 0;

/* ------------------------------------------------------------------ C0 */

const side = (id: number, name: string, abbr: string, extra: Record<string, unknown> = {}) => ({ team: { id, name, abbreviation: abbr, teamName: name.split(" ").pop() }, leagueRecord: { wins: 80, losses: 70 }, ...extra });
const LIVE: ApiGame = {
  gamePk: 776501, gameDate: "2026-09-20T20:05:00Z", status: { abstractGameState: "Live", detailedState: "In Progress" },
  teams: { away: side(137, "San Francisco Giants", "SF", { score: 2 }), home: side(134, "Pittsburgh Pirates", "PIT", { score: 1 }) },
  linescore: { currentInning: 6, currentInningOrdinal: "6th", inningState: "Top", innings: [{ num: 1, away: { runs: 2, hits: 3, errors: 0 }, home: { runs: 1, hits: 2, errors: 0 } }], teams: { away: { runs: 2, hits: 3, errors: 0 }, home: { runs: 1, hits: 2, errors: 0 } } },
};
const FINAL: ApiGame = {
  gamePk: 776502, gameDate: "2026-09-20T17:10:00Z", status: { abstractGameState: "Final", detailedState: "Final" },
  teams: { away: side(146, "Miami Marlins", "MIA", { score: 3 }), home: side(118, "Kansas City Royals", "KC", { score: 5 }) },
};
const LATER: ApiGame = {
  gamePk: 776503, gameDate: "2026-09-21T02:10:00Z", status: { abstractGameState: "Preview", detailedState: "Scheduled" },
  teams: { away: side(147, "New York Yankees", "NYY"), home: side(119, "Los Angeles Dodgers", "LAD") },
};
const PAYLOAD = shapeGames("2026-09-20", [LIVE, FINAL, LATER], {}, []);
const GAMES_KEY = ["games", "2026-09-20", DEFAULT_BOOK];

/** the page's slate query in each state TanStack can hold it in */
function gamesClient(state: "pending" | "success" | "error-with-data" | "error-no-data"): QueryClient {
  const qc = newClient();
  if (state === "pending") return qc;
  const query = qc.getQueryCache().build(qc, { queryKey: GAMES_KEY });
  if (state !== "error-no-data") qc.setQueryData(GAMES_KEY, PAYLOAD);
  if (state !== "success") query.setState({ ...query.state, status: "error", error: new Error("games 503"), fetchStatus: "idle" });
  return qc;
}

describe("C0 — the MLB game sheet lives on the page, keyed by gamePk", () => {
  const page = stripComments(read("app/games/page.tsx"));
  const games = page.slice(page.indexOf("function Games()"), page.indexOf("function Section("));
  const section = page.slice(page.indexOf("function Section("), page.indexOf("function GameCard("));
  const card = page.slice(page.indexOf("function GameCard("), page.indexOf("function TeamRow("));

  it("a desk switch closes the sheet (review: another tab flipping the desk and back re-opened the old game's sheet by itself)", () => {
    /* the page stays mounted across the CFB / NFL early returns and holds `sheet`; the reset is an effect ABOVE those returns,
       so the hook order never changes. Effects never run in a static render, so the wiring is pinned on the source. */
    const reset = games.search(/useEffect\(\(\) => \{\s*if \(cfbDesk \|\| nflDesk\) setSheet\(null\);\s*\}, \[cfbDesk, nflDesk\]\);/);
    expect(reset).toBeGreaterThan(games.indexOf("const [sheet, setSheet] = useState<Sheet | null>(null);"));
    expect(reset).toBeLessThan(games.indexOf("if (cfbDesk) {"));
    expect(reset).toBeLessThan(games.indexOf("if (nflDesk) {"));
  });

  it("one sheet, held by the page — the card and the section only ask to open it", () => {
    expect(page).toContain("type Sheet = { pk: number; team: GameTeam | null };");
    expect(games).toContain("const [sheet, setSheet] = useState<Sheet | null>(null);");
    expect(page.match(/<Overlay\b/g)?.length).toBe(1);
    expect(games).toMatch(/<Overlay open=\{!!sheet\} onClose=\{\(\) => setSheet\(null\)\}/);
    for (const [name, src] of [["Section", section], ["GameCard", card]] as const) {
      expect(src, name).not.toMatch(/<Overlay\b|<GameDetail\b|<TeamProfileExplorer\b/);
      expect(src, `${name} holds no sheet state`).not.toMatch(/useState\(/);
    }
    expect(section).toContain("open={sheet?.pk === g.pk && !sheet.team} onOpen={() => onSheet({ pk: g.pk, team: null })} onTeam={(team) => onSheet({ pk: g.pk, team })}");
    expect(card).toContain("function GameCard({ g, date, open, onOpen, onTeam }");
  });

  it("the sheet reads its game by pk and keeps the last one seen for that pk (a refetch that briefly lacks it keeps the title)", () => {
    expect(games).toContain("const sheetSeen = useRef<ShapedGame | null>(null);");
    expect(games).toContain("const sheetGame = sheet ? games.find((g) => g.pk === sheet.pk) ?? (sheetSeen.current?.pk === sheet.pk ? sheetSeen.current : null) : null;");
    expect(games).toContain("if (sheetGame) sheetSeen.current = sheetGame;");
    expect(games).toContain("title={sheet?.team?.name ?? (sheetGame ? `${sheetGame.away.abbr} @ ${sheetGame.home.abbr} · ${cardLinkLabel(sheetGame.status)}`");
    // a team page first, else the embedded game detail; each keyed so another game never inherits a sheet's state
    expect(games).toContain('{sheet && (sheet.team ? <TeamProfileExplorer key={`${sheet.pk}:${sheet.team.id}`} sport="mlb" teamId={String(sheet.team.id)} /> : <GameDetail key={sheet.pk} pk={String(sheet.pk)} qDate={date} embedded/>)}');
  });

  it("the full error shows only with nothing loaded; a failed refresh keeps the list", () => {
    expect(games).toMatch(/\{q\.isPending \? \([\s\S]*?\) : !q\.data \? \(\s*<ErrorState title="Couldn't load the slate"/);
    expect(games).not.toMatch(/\) : q\.isError \? \(/);
    expect(games).toMatch(/\{q\.isError && \(\s*<p role="status"[^>]*>\s*Refresh failed/);
  });

  it("render: a slate with a failed background refresh keeps every card and says so in one line", () => {
    const html = render(gamesClient("error-with-data"), createElement(GamesPage));
    expect(html).toContain("Refresh failed · showing the last loaded slate");
    expect(html).toContain(">Retry</button>");
    expect(html).not.toContain("Couldn&#x27;t load the slate");
    for (const abbr of ["SF", "PIT", "MIA", "KC", "NYY", "LAD"]) expect(html).toContain(`>${abbr}<`);
    for (const title of [">Live<", ">Upcoming<", ">Final<"]) expect(html).toContain(title);
    expect(sheets(html)).toBe(1); // one sheet for three cards, closed until a card asks
    expect(html).toContain('data-sheet="closed"');
  });

  it("render: a healthy slate has no refresh line; nothing loaded is the full error; the sheet is mounted through every state", () => {
    const ok = render(gamesClient("success"), createElement(GamesPage));
    expect(ok).not.toContain("Refresh failed");
    expect(ok).toContain(">SF<");
    expect(sheets(ok)).toBe(1);

    const failed = render(gamesClient("error-no-data"), createElement(GamesPage));
    expect(failed).toContain("Couldn&#x27;t load the slate");
    expect(failed).toContain("games 503");
    expect(failed).not.toContain("Refresh failed");
    expect(failed).not.toContain(">SF<");
    expect(sheets(failed)).toBe(1); // outside the list gate: an error or a reload never unmounts an open sheet

    const pending = render(gamesClient("pending"), createElement(GamesPage));
    expect(pending).not.toContain(">SF<");
    expect(sheets(pending)).toBe(1);
  });
});

/* ------------------------------------------------------------------ C1 */

const NYY = { id: 147, name: "New York Yankees", abbreviation: "NYY" }, BAL = { id: 110, name: "Baltimore Orioles", abbreviation: "BAL" };
/** a statsapi team-season schedule entry, Yankees at home */
const mlbGame = (pk: number, gameDate: string, abstractGameState: string, detailedState: string, score?: [home: number, away: number]) => ({
  gamePk: pk, gameDate, season: "2026", gameType: "R", status: { abstractGameState, detailedState },
  teams: { home: { team: NYY, ...(score ? { score: score[0] } : {}) }, away: { team: BAL, ...(score ? { score: score[1] } : {}) } },
});
const RAINOUT = mlbGame(746001, "2026-05-12T23:05:00Z", "Final", "Postponed");
const MAKEUP = mlbGame(746001, "2026-07-20T17:05:00Z", "Final", "Final", [5, 3]);
const NEXT1 = mlbGame(746100, "2026-09-28T23:05:00Z", "Preview", "Scheduled");
const NEXT2 = mlbGame(746101, "2026-09-29T23:05:00Z", "Preview", "Scheduled");
const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("C1 — one row per gamePk, and Upcoming is what is still to be played", () => {
  it("a made-up rainout is ONE row — the makeup, with its result — in either listing order", () => {
    for (const dates of [[{ games: [RAINOUT] }, { games: [MAKEUP] }, { games: [NEXT1] }, { games: [NEXT2] }], [{ games: [MAKEUP] }, { games: [NEXT1, NEXT2] }, { games: [RAINOUT] }]]) {
      const rows = mlbTeamSchedule({ dates }, "147", 2026);
      expect(rows.map((g) => g.id)).toEqual(["746001", "746100", "746101"]);
      expect(new Set(rows.map((g) => g.id)).size).toBe(rows.length); // no duplicate React keys
      expect(rows[0]).toMatchObject({ date: "2026-07-20", status: "final", score: "5–3", result: "W", detail: "Final", home: true, neutral: false });
      expect(rows.filter((g) => isUpcomingTeamGame(g, NOW)).map((g) => g.id)).toEqual(["746100", "746101"]);
    }
  });

  it("a postponement with no makeup yet keeps its single row; a suspended game keeps its resumed final", () => {
    const rows = mlbTeamSchedule({ dates: [
      { games: [mlbGame(746200, "2026-09-26T23:05:00Z", "Final", "Postponed")] },
      { games: [mlbGame(746300, "2026-08-01T23:05:00Z", "Live", "Suspended: Rain", [1, 1])] },
      { games: [mlbGame(746300, "2026-08-02T17:05:00Z", "Final", "Final", [2, 4])] },
    ] }, "147", 2026);
    expect(rows.map((g) => [g.id, g.date, g.status, g.score, g.result])).toEqual([
      ["746300", "2026-08-02", "final", "2–4", "L"],
      ["746200", "2026-09-26", "postponed", null, null],
    ]);
  });

  it("a game moved UP (made up BEFORE its original date) is one row — the played or scheduled makeup, never the later 'Postponed' listing (review)", () => {
    const ORIG = mlbGame(746900, "2026-09-27T17:35:00Z", "Final", "Postponed");
    const MADE_UP = mlbGame(746900, "2026-09-26T21:05:00Z", "Final", "Final", [6, 2]);
    for (const dates of [[{ games: [MADE_UP] }, { games: [ORIG] }], [{ games: [ORIG] }, { games: [MADE_UP] }]]) {
      const rows = mlbTeamSchedule({ dates }, "147", 2026);
      expect(rows.map((g) => [g.id, g.date, g.status, g.score, g.result])).toEqual([["746900", "2026-09-26", "final", "6–2", "W"]]);
      expect(isUpcomingTeamGame(rows[0], Date.parse("2026-09-26T23:30:00Z"))).toBe(false);
    }
    /* before the makeup is played it is the scheduled makeup that shows, on its own date */
    const ahead = mlbTeamSchedule({ dates: [{ games: [ORIG] }, { games: [mlbGame(746900, "2026-09-26T21:05:00Z", "Preview", "Scheduled")] }] }, "147", 2026);
    expect(ahead.map((g) => [g.date, g.status])).toEqual([["2026-09-26", "upcoming"]]);
    /* two called-off listings of one game: the later date stands */
    const twice = mlbTeamSchedule({ dates: [{ games: [mlbGame(746901, "2026-09-20T17:35:00Z", "Final", "Postponed")] }, { games: [mlbGame(746901, "2026-09-22T17:35:00Z", "Final", "Postponed")] }] }, "147", 2026);
    expect(twice.map((g) => [g.date, g.status])).toEqual([["2026-09-22", "postponed"]]);
  });

  it("isUpcomingTeamGame: upcoming and live always, a postponement only while its date is ahead, a final never", () => {
    const at = (status: string, start: string) => isUpcomingTeamGame({ status, start }, NOW);
    expect(at("upcoming", "2026-09-29T00:00:00Z")).toBe(true);
    expect(at("live", "2026-09-28T10:00:00Z")).toBe(true);
    expect(at("final", "2026-09-27T00:00:00Z")).toBe(false);
    expect(at("postponed", "2026-05-12T23:05:00Z")).toBe(false);
    expect(at("postponed", "2026-10-10T19:30:00Z")).toBe(true);
  });

  it("the Schedule's Upcoming view uses it (not `status !== \"final\"`)", () => {
    const src = stripComments(read("src/components/games/TeamProfile.tsx"));
    expect(src).toContain("future = data.schedule.filter(g => isUpcomingTeamGame(g, now))");
    expect(src).not.toContain('g.status !== "final"');
  });
});

/* --------------------------------------------------------- C1 / C4 / C5 render */

const row = (o: Partial<TeamScheduleGame> & Pick<TeamScheduleGame, "id" | "start" | "status" | "opponent">): TeamScheduleGame => ({
  date: o.start.slice(0, 10), label: "Game", opponentAbbr: "OPP", opponentLogo: null, home: true, neutral: false, score: null, result: null, detail: o.status, phase: "Regular Season", ...o,
});
const profile = (schedule: TeamScheduleGame[]): TeamProfileData => ({
  sport: "cfb", season: 2026, id: "84", name: "Indiana Hoosiers", abbr: "IU", logo: null, color: null, record: "4-0", standing: null,
  schedule, roster: [], stats: [], notices: [], source: "ESPN", updatedAt: "2026-09-28T12:00:00.000Z",
});
function renderTeam(data: TeamProfileData): string {
  const qc = newClient();
  qc.setQueryData(["team-profile", "cfb", "84", undefined], data);
  return render(qc, createElement(TeamProfile, { sport: "cfb", teamId: "84", onGameSelect: () => {} }));
}

describe("the team page render — theme tokens, neutral sites, the Upcoming fallback", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it("C5: a win is cerulean (pos), a loss coral (neg), a live score lavender (live); no emerald, no accent class", () => {
    const html = renderTeam(profile([
      row({ id: "w1", start: "2026-09-06T19:30:00Z", status: "final", opponent: "Kennesaw State Owls", score: "56–9", result: "W" }),
      row({ id: "l1", start: "2026-09-13T19:30:00Z", status: "final", opponent: "Notre Dame Fighting Irish", home: false, neutral: true, score: "20–27", result: "L" }),
      row({ id: "r1", start: "2026-09-20T19:30:00Z", status: "final", opponent: "Purdue Boilermakers", home: false, score: "31–17", result: "W" }),
      row({ id: "live1", start: "2026-09-27T19:30:00Z", status: "live", opponent: "Illinois Fighting Illini", home: false, score: "14–10", detail: "7:20 - 3rd" }),
    ]));
    expect(html.match(/font-bold (text-[a-z]+)"><span class="mr-1">W<\/span>56–9/)?.[1]).toBe("text-pos");
    expect(html.match(/font-bold (text-[a-z]+)"><span class="mr-1">L<\/span>20–27/)?.[1]).toBe("text-neg");
    expect(html.match(/font-bold (text-[a-z]+)">14–10/)?.[1]).toBe("text-live");
    /* a tie is neither a win nor a loss: plain text, never the win colour */
    const tie = renderTeam(profile([row({ id: "t1", start: "2026-09-06T19:30:00Z", status: "final", opponent: "Kennesaw State Owls", score: "20–20", result: "T" })]));
    expect(tie.match(/font-bold (text-[a-z]+)"><span class="mr-1">T<\/span>20–20/)?.[1]).toBe("text-text");
    expect(html).toContain("bg-pos/20 text-pos ring-1 ring-pos/40"); // the selected Schedule tab
    expect(html).toContain("border-pos/50 bg-pos/15 text-pos"); // the selected range pill
    expect(html).toContain("border-pos/20 bg-gradient-to-br from-pos/15");
    expect(html).not.toMatch(/emerald|accent|rose-300/);
  });

  it("C4: a neutral-site game reads \"vs\" even when ESPN filed the club as away; a true road game keeps \"@\"", () => {
    const html = renderTeam(profile([
      row({ id: "w1", start: "2026-09-06T19:30:00Z", status: "final", opponent: "Kennesaw State Owls", score: "56–9", result: "W" }),
      row({ id: "l1", start: "2026-09-13T19:30:00Z", status: "final", opponent: "Notre Dame Fighting Irish", home: false, neutral: true, score: "20–27", result: "L" }),
      row({ id: "r1", start: "2026-09-20T19:30:00Z", status: "final", opponent: "Purdue Boilermakers", home: false, score: "31–17", result: "W" }),
    ]));
    expect(html).toContain(">vs</span>Kennesaw State Owls");
    expect(html).toContain(">vs</span>Notre Dame Fighting Irish");
    expect(html).toContain(">@</span>Purdue Boilermakers");
  });

  it("C1: with nothing played yet the list is the Upcoming set — a May postponement no longer heads it", () => {
    const html = renderTeam(profile([
      row({ id: "p-old", start: "2026-05-12T23:05:00Z", status: "postponed", opponent: "Old Rainout Opponent", detail: "Postponed" }),
      row({ id: "u1", start: "2026-10-03T19:30:00Z", status: "upcoming", opponent: "Wisconsin Badgers" }),
      row({ id: "p-new", start: "2026-10-10T19:30:00Z", status: "postponed", opponent: "Maryland Terrapins", detail: "Postponed" }),
    ]));
    expect(html).toContain("Wisconsin Badgers");
    expect(html).toContain("Maryland Terrapins");
    expect(html).not.toContain("Old Rainout Opponent");
    expect(html).toContain("2026 · 2 games");
  });
});

/* ------------------------------------------------------------------ C2 */

const DAY = "2026-09-19";
const SLATE = { date: DAY, slateDates: [DAY], games: [], unmatched: 0, fpiUpdated: null, generatedAt: Date.parse("2026-09-19T12:00:00Z"), oddsMissing: false } as unknown as CfbSlate;
type Desk = ReturnType<typeof CFB_DESK.useDesk>;
function renderGames(q: Partial<Desk["q"]>, slate: CfbSlate | undefined): string {
  const desk = { today: DAY, date: DAY, rail: [DAY], pick: () => {}, bankroll: 2500, q: { isPending: false, isFetching: false, isError: false, error: null, refetch: () => {}, ...q }, slate } as unknown as Desk;
  const L = { ...CFB_DESK, useDesk: () => desk };
  return render(newClient(), createElement(LeagueProvider, { desk: L, children: createElement(CfbGames) }));
}

describe("C2 — CfbGames holds the day's slate through a bankroll re-key", () => {
  it("heldSlate: this key's own slate first, else the last one seen for the SAME date, never another day's", () => {
    const other = { ...SLATE, date: "2026-09-20" } as CfbSlate;
    expect(heldSlate(SLATE, { date: DAY, slate: other }, DAY)).toBe(SLATE);
    expect(heldSlate(undefined, { date: DAY, slate: SLATE }, DAY)).toBe(SLATE);
    expect(heldSlate(undefined, { date: DAY, slate: SLATE }, "2026-09-20")).toBeUndefined();
    expect(heldSlate(undefined, null, DAY)).toBeUndefined();
  });

  it("the source: the last slate is remembered per date with the bankroll it was sized at, re-sized when that moved, and gates loading and the error", () => {
    const src = stripComments(read("src/components/cfb/CfbGames.tsx"));
    expect(src).toContain("const lastSlate = useRef<{ date: string; bankroll: number; slate: CfbSlate } | null>(null);");
    expect(src).toContain("if (rawSlate) lastSlate.current = { date, bankroll: bank, slate: rawSlate };");
    expect(src).toContain("const held = heldSlate(rawSlate, lastSlate.current, date);");
    expect(src).toContain("const shownSlate = useMemo(() => (!rawSlate && held && heldAt !== bank ? resizeFootballStakes(held, Math.round(bank), L.rules) : held), [rawSlate, held, heldAt, bank, L.rules]);");
    expect(src).toContain("const slate=useFootballPrices(shownSlate,bank,L.rules);");
    expect(src).toContain("const loading = bankroll == null || (q.isPending && !shownSlate);");
    expect(src).toContain(") : q.isError && !shownSlate ? (");
    // scoped to Games: the shared desk hook stays without placeholderData (Board / Builder / Sharp act on the bankroll's stakes)
    expect(stripComments(read("src/lib/football/useDesk.ts"))).not.toMatch(/placeholderData/);
  });

  it("render: a failed refresh with a slate in hand keeps the list and says so; with nothing in hand it is the error panel", () => {
    const kept = renderGames({ isError: true, error: new Error("slate 503") }, SLATE);
    expect(kept).toContain("Refresh failed · showing the last loaded slate");
    expect(kept).toContain("No FBS games");
    expect(kept).not.toContain("Couldn&#x27;t load the slate");

    const none = renderGames({ isError: true, error: new Error("slate 503") }, undefined);
    expect(none).toContain("Couldn&#x27;t load the slate");
    expect(none).toContain("slate 503");
    expect(none).not.toContain("Refresh failed");

    const healthy = renderGames({}, SLATE);
    expect(healthy).toContain("No FBS games");
    expect(healthy).not.toContain("Refresh failed");
  });
});

/* ------------------------------------------------------------------ C3 / C4 (ESPN shapers) */

/** the repo's captured CFB summary (UNT @ IU) re-statused the way ESPN posts a called-off game: state "post", not completed, "0" scores */
function calledOff(name: string, detail: string) {
  const raw = structuredClone(cfbSummary) as { header: { competitions: { status: unknown; competitors: { score: unknown }[] }[] } };
  raw.header.competitions[0].status = { type: { name, state: "post", completed: false, description: detail, detail, shortDetail: detail } };
  for (const c of raw.header.competitions[0].competitors) c.score = "0";
  return raw;
}
/** an ESPN team-schedule event for Indiana (84) */
function espnEvent(id: string, o: { name: string; state: string; completed?: boolean; detail?: string; neutralSite?: boolean; homeAway?: "home" | "away"; own?: unknown; opp?: unknown }) {
  return { id, date: "2026-09-19T19:30Z", shortName: "UNT @ IU", season: { year: 2026 }, seasonType: { name: "Regular Season" }, competitions: [{
    ...(o.neutralSite === undefined ? {} : { neutralSite: o.neutralSite }),
    status: { type: { name: o.name, state: o.state, completed: o.completed ?? false, shortDetail: o.detail ?? "Final" } },
    competitors: [
      { homeAway: o.homeAway ?? "home", team: { id: "84", displayName: "Indiana Hoosiers", abbreviation: "IU" }, score: o.own ?? "0" },
      { homeAway: (o.homeAway ?? "home") === "home" ? "away" : "home", team: { id: "249", displayName: "North Texas", abbreviation: "UNT" }, score: o.opp ?? "0" },
    ] }] };
}
const FETCHED = "2026-09-28T18:30:00.000Z";

/* the real 2026-09-05 CFB fixture board, built at two bankrolls (swapSettleBook: the fixtures predate DraftKings settling) */
const CFB_FIX = (f: string) => swapSettleBook(JSON.parse(read(`tests/fixtures/cfb/${f}`)));
const CFB_DAY = "2026-09-05";
const buildAt = (bankroll: number) =>
  ({ ...(buildCfbBoard({ date: CFB_DAY, espnEvents: (CFB_FIX("espn-scoreboard-2026-09-05.json") as { events: unknown[] }).events, oddsEvents: CFB_FIX("odds-ncaaf-2026-09-05.json") as Array<Record<string, unknown>>, fpi: CFB_FIX("espn-fpi.json"), now: Date.parse("2026-09-05T12:00:00Z"), bankroll }) as object), slateDates: [CFB_DAY] }) as unknown as CfbSlate;
const kellyByKey = (s: CfbSlate) => new Map(s.games.flatMap((g) => g.rows.map((r) => [r.key, r.kelly] as const)));

describe("a held football slate shows stakes sized at the CURRENT bankroll (review: a sync that moved the bankroll left the default book's stakes at the old one)", () => {
  const OLD_B = 2500, NEW_B = 3000;
  const oldSlate = buildAt(OLD_B), freshSlate = buildAt(NEW_B);

  it("resizeFootballStakes gives every row the stake a fresh build at the new bankroll carries — without it, some stay stale", () => {
    expect(DEFAULT_BOOK).toBe("draftkings");
    const fresh = kellyByKey(freshSlate);
    const staleAsShipped = [...kellyByKey(priceFootballSlate(oldSlate, DEFAULT_BOOK, NEW_B))].filter(([k, v]) => fresh.get(k) !== v);
    expect(staleAsShipped.length).toBeGreaterThan(0);
    for (const [oldB, newB] of [[2500, 3000], [2500, 2375], [10000, 10350]] as const) {
      const want = kellyByKey(buildAt(newB));
      const got = kellyByKey(priceFootballSlate(resizeFootballStakes(buildAt(oldB), newB, CFB_DESK.rules), DEFAULT_BOOK, newB));
      expect(got.size).toBe(want.size);
      for (const [k, v] of want) expect(got.get(k), `${oldB}->${newB} ${k}`).toBe(v);
    }
    /* a row the server did not mark playable keeps its stake of 0, and an empty slate passes through */
    for (const g of resizeFootballStakes(oldSlate, NEW_B, CFB_DESK.rules).games) for (const r of g.rows) if (!r.playable) expect(r.kelly).toBe(0);
    expect(resizeFootballStakes(undefined, NEW_B)).toBeUndefined();
  });

  /* THE RE-KEY THROUGH THE REAL COMPONENT: pass 1 is the (date, 2500) key with its slate, which CfbGames stores in its lastSlate
     ref; a render-phase state update re-runs CfbGames with its hooks kept (refs included), and pass 2 is the sync's re-key —
     (date, 3000) with no data, pending or failed. */
  type Desk = ReturnType<typeof CFB_DESK.useDesk>;
  const base = { today: CFB_DAY, date: CFB_DAY, rail: [CFB_DAY], pick: () => {} };
  const okQ = { isPending: false, isFetching: false, isError: false, error: null, refetch: () => {} };
  const renderWith = (useDesk: () => Desk) => render(newClient(), createElement(LeagueProvider, { desk: { ...CFB_DESK, useDesk }, children: createElement(CfbGames) }));
  const renderReKey = (q2: Record<string, unknown>) =>
    renderWith(() => {
      const [phase, setPhase] = useState(0);
      if (phase === 0) setPhase(1);
      return (phase === 0 ? { ...base, bankroll: OLD_B, q: okQ, slate: oldSlate } : { ...base, bankroll: NEW_B, q: q2, slate: undefined }) as unknown as Desk;
    });
  /** label -> the ¼K stake printed on every card's edge list */
  const stakes = (html: string) => {
    const out = new Map<string, string>();
    for (const ul of html.match(/<ul class="game-edges[\s\S]*?<\/ul>/g) ?? [])
      for (const li of ul.match(/<li[\s\S]*?<\/li>/g) ?? []) {
        const label = li.match(/<span class="min-w-0 flex-1 truncate font-semibold text-text">([\s\S]*?)<\/span>/)?.[1] ?? "?";
        out.set(label, li.match(/¼K<\/span><span class="num text-\[11px\] font-semibold text-text">([^<]*)<\/span>/)?.[1] ?? "(none)");
      }
    return out;
  };

  it("render: while the new key loads, and after it fails, the held list prints the new bankroll's stakes", () => {
    const fresh = stakes(renderWith(() => ({ ...base, bankroll: NEW_B, q: okQ, slate: freshSlate }) as unknown as Desk));
    const old = stakes(renderWith(() => ({ ...base, bankroll: OLD_B, q: okQ, slate: oldSlate }) as unknown as Desk));
    expect(fresh.size).toBeGreaterThan(3);
    /* the fixture exercises it: some stake differs between the two bankrolls */
    expect([...fresh].some(([label, s]) => old.get(label) !== s)).toBe(true);
    const pending = renderReKey({ isPending: true, isFetching: true, isError: false, error: null, refetch: () => {} });
    const failed = renderReKey({ isPending: false, isFetching: false, isError: true, error: new Error("slate 503"), refetch: () => {} });
    expect(failed).toContain("Refresh failed · showing the last loaded slate");
    for (const html of [pending, failed]) {
      const held = stakes(html);
      expect(held.size).toBe(fresh.size);
      for (const [label, s] of fresh) expect(held.get(label), label).toBe(s);
    }
  });
});

describe("C3 — a postponed or canceled football game is never a played final", () => {
  it("coverage: STATUS_POSTPONED / STATUS_CANCELED with state \"post\" is phase postponed with no scores", () => {
    for (const [name, detail] of [["STATUS_POSTPONED", "Postponed"], ["STATUS_CANCELED", "Canceled"]]) {
      const g = shapeFootballGameDetail(calledOff(name, detail), "cfb", "401858425", FETCHED);
      expect(g.phase, name).toBe("postponed");
      expect(g.status).toBe(detail);
      expect([g.away.score, g.home.score]).toEqual([null, null]);
    }
    // a played final is untouched
    expect(shapeFootballGameDetail(cfbSummary, "cfb", "401858425", FETCHED).phase).toBe("final");
  });

  it("coverage render: a postponed game never prints \"Final game.\"", () => {
    const qc = newClient();
    qc.setQueryData(["football-game-detail", "cfb", "401858425"], shapeFootballGameDetail(calledOff("STATUS_POSTPONED", "Postponed"), "cfb", "401858425", FETCHED));
    const html = render(qc, createElement(FootballGameDetail, { sport: "cfb", gameId: "401858425" }));
    expect(html).toContain("Postponed");
    expect(html).not.toContain("Final game.");
    /* nothing polls a postponed game, so the footer never promises a kickoff check */
    expect(html).toContain("Postponed — not being played as scheduled.");
    expect(html).not.toContain("Checks for kickoff every 2 minutes.");
  });

  it("team schedule: the postponed / canceled row carries no 0–0 and no result; a real 0 on a played game survives", () => {
    const rows = espnTeamSchedule([{ events: [
      espnEvent("ppd", { name: "STATUS_POSTPONED", state: "post", detail: "Postponed" }),
      espnEvent("can", { name: "STATUS_CANCELED", state: "post", detail: "Canceled" }),
      espnEvent("fin", { name: "STATUS_FINAL", state: "post", completed: true, own: "0", opp: "3" }),
    ] }], "84", 2026);
    const byId = Object.fromEntries(rows.map((g) => [g.id, g]));
    expect(byId.ppd).toMatchObject({ status: "postponed", score: null, result: null, detail: "Postponed" });
    expect(byId.can).toMatchObject({ status: "postponed", score: null, result: null, detail: "Canceled" });
    expect(byId.fin).toMatchObject({ status: "final", score: "0–3", result: "L" });
  });
});

describe("C4 — the team schedule carries ESPN's neutralSite", () => {
  it("a neutral-site game filed as away is neutral; an ordinary road game is not; MLB rows are never neutral", () => {
    const rows = espnTeamSchedule([{ events: [
      espnEvent("neutral", { name: "STATUS_SCHEDULED", state: "pre", neutralSite: true, homeAway: "away" }),
      espnEvent("road", { name: "STATUS_SCHEDULED", state: "pre", neutralSite: false, homeAway: "away" }),
      espnEvent("unsaid", { name: "STATUS_SCHEDULED", state: "pre", homeAway: "home" }),
    ] }], "84", 2026);
    const byId = Object.fromEntries(rows.map((g) => [g.id, g]));
    expect(byId.neutral).toMatchObject({ home: false, neutral: true });
    expect(byId.road).toMatchObject({ home: false, neutral: false });
    expect(byId.unsaid).toMatchObject({ home: true, neutral: false });
    expect(mlbTeamSchedule({ dates: [{ games: [NEXT1] }] }, "147", 2026)[0].neutral).toBe(false);
    expect(stripComments(read("src/components/games/TeamProfile.tsx"))).toContain('{g.home || g.neutral ? "vs" : "@"}');
  });
});

describe("C2: the football team page is held by the Games page, beside the open game", () => {
  const src = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  it("CfbGames holds it per game and hands each card its own; a mount without the pair keeps the card's own state", () => {
    const games = src("src/components/cfb/CfbGames.tsx");
    expect(games).toMatch(/const \[profile, setProfile\] = useState<\{ gameId: string; team: CfbGame\["home"\] \} \| null>\(null\);/);
    expect(games).toMatch(/profileTeam=\{profile\?\.gameId === g\.id \? profile\.team : null\} onProfileTeam=\{\(t\) => setProfile\(t \? \{ gameId: g\.id, team: t \} : null\)\}/);
    const card = src("src/components/cfb/CfbGameCard.tsx");
    expect(card).toMatch(/const profileTeam = onProfileTeam \? heldTeam \?\? null : ownTeam;/);
    expect(card).toMatch(/const setProfileTeam: \(team: CfbGame\["home"\] \| null\) => void = onProfileTeam \?\? setOwnTeam;/);
  });
});
