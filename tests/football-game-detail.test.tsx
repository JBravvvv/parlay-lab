import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import nfl from "./fixtures/football/nfl-summary-401671793.json";
import cfb from "./fixtures/football/cfb-summary-401858425.json";
import { footballCoverageRefreshInterval, shapeFootballGameDetail } from "@/lib/football/game-detail";
import { FootballGameDetail } from "@/components/games/FootballGameDetail";
import { GET } from "../app/api/football/[sport]/games/[gameId]/route";

(globalThis as { React?: typeof React }).React = React;

const NOW = "2026-09-26T18:30:00.000Z";
const shape = () => shapeFootballGameDetail(nfl, "nfl", "401671793", NOW);

describe("football game coverage — real ESPN summaries", () => {
  it("maps NFL home/away by identity and preserves scores, quarters, and player statistics", () => {
    const g = shape();
    expect([g.away.abbr, g.home.abbr]).toEqual(["KC", "ATL"]);
    expect([g.away.score, g.home.score, g.phase]).toEqual(["22", "17", "final"]);
    expect(g.away.periods).toEqual(["0", "13", "9", "0"]);
    const passing = g.boxscore.away.find((group) => group.key === "passing")!;
    const mahomes = passing.players.find((player) => player.name === "Patrick Mahomes")!;
    expect(mahomes.stats[passing.labels.indexOf("YDS")]).toBe("217");
    expect(mahomes.stats[passing.labels.indexOf("TD")]).toBe("2");
    expect(g.teamStats.find((stat) => stat.key === "firstDowns")).toMatchObject({ away: "22" });
  });

  it("uses the same schema for CFB with actual player tables and play descriptions", () => {
    const g = shapeFootballGameDetail(cfb, "cfb", "401858425", NOW);
    const expected = cfb.header.competitions[0].competitors.find((team) => team.homeAway === "home")!;
    expect(g.home.score).toBe(expected.score);
    expect(g.home.id).toBe(expected.team.id);
    expect(g.boxscore.home.some((group) => group.key === "passing")).toBe(true);
    expect(g.plays.length).toBeGreaterThan(50);
    expect(g.scoringPlays.every((play) => play.scoring)).toBe(true);
  });

  it("shows the newest play first, without turning real zeroes into missing stats", () => {
    const g = shape();
    expect(g.plays[0].text).toBe("END GAME");
    expect(g.plays[0].period).toBe(4);
    expect(g.plays[0].clock).toBe("0:00");
    expect(g.away.periods[0]).toBe("0");
    expect(g.scoringPlays.at(-1)?.text).toContain("Drake London");
  });

  it("includes the active drive and replaces stale duplicates with the current play", () => {
    const raw = structuredClone(nfl) as any;
    raw.header.competitions[0].status = { type: { state: "in", completed: false, detail: "1:04 - 4th" } };
    raw.drives.current = { team: { id: "12" }, plays: [
      { id: "current", sequenceNumber: "999999", text: "Live pass complete", period: { number: 4 }, clock: { displayValue: "1:04" }, start: { shortDownDistanceText: "2nd & 4" } },
    ] };
    raw.drives.previous.push({ team: { id: "12" }, plays: [{ id: "current", sequenceNumber: "999999", text: "Stale play" }] });
    const g = shapeFootballGameDetail(raw, "nfl", "401671793", NOW);
    expect(g.phase).toBe("live");
    expect(g.plays.filter((play) => play.id === "current")).toHaveLength(1);
    expect(g.plays[0]).toMatchObject({ text: "Live pass complete", teamId: "12", downDistance: "2nd & 4" });
  });

  it("does not fabricate scores, player stats, or plays for an upcoming game", () => {
    const raw = structuredClone(nfl) as any;
    raw.header.competitions[0].status = { type: { state: "pre", description: "Scheduled" } };
    delete raw.boxscore; delete raw.drives; delete raw.scoringPlays;
    const g = shapeFootballGameDetail(raw, "nfl", "401671793", NOW);
    expect(g.phase).toBe("upcoming");
    expect(g.away.score).toBeNull();
    expect(g.boxscore).toEqual({ away: [], home: [] });
    expect(g.teamStats).toEqual([]); expect(g.plays).toEqual([]);
  });

  it("leaves one-sided/missing stats blank and matches team stats by name", () => {
    const raw = structuredClone(nfl) as any;
    raw.boxscore.teams[0].statistics = [{ name: "zeroStat", label: "Zero stat", displayValue: "0" }];
    raw.boxscore.teams[1].statistics = [{ name: "otherStat", label: "Other stat", displayValue: "12" }];
    raw.boxscore.players[0].statistics[0].athletes[0].stats = ["26/39"];
    const g = shapeFootballGameDetail(raw, "nfl", "401671793", NOW);
    expect(g.teamStats).toContainEqual({ key: "zeroStat", label: "Zero stat", away: "0", home: null });
    expect(g.teamStats).toContainEqual({ key: "otherStat", label: "Other stat", away: null, home: "12" });
    expect(g.boxscore.away[0].players[0].stats[1]).toBeNull();
  });

  it("rejects missing or mismatched event identity", () => {
    expect(() => shapeFootballGameDetail({}, "nfl", "401671793", NOW)).toThrow();
    expect(() => shapeFootballGameDetail(nfl, "nfl", "999999999", NOW)).toThrow();
  });

  it("polls live coverage every 30 seconds, upcoming every 2 minutes, and stops at final", () => {
    expect(footballCoverageRefreshInterval("live")).toBe(30_000);
    expect(footballCoverageRefreshInterval("upcoming")).toBe(120_000);
    expect(footballCoverageRefreshInterval("final")).toBe(false);
    expect(footballCoverageRefreshInterval("postponed")).toBe(false);
  });
});

describe("football coverage route", () => {
  afterEach(() => vi.unstubAllGlobals());
  const call = (sport = "nfl", gameId = "401671793") => GET(new Request("http://localhost"), { params: Promise.resolve({ sport, gameId }) });

  it("validates the sport and game ID before accessing the provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await call("mlb")).status).toBe(400);
    expect((await call("nfl", "../401671793")).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([["nfl", "401671793", nfl, "nfl"], ["cfb", "401858425", cfb, "college-football"]] as const)("loads %s without an odds request", async (sport, gameId, payload, league) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload)); vi.stubGlobal("fetch", fetcher);
    const response = await call(sport, gameId);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(`https://site.api.espn.com/apis/site/v2/sports/football/${league}/summary?event=${gameId}`);
    expect((await response.json()).id).toBe(gameId);
  });

  it("reports unavailable/mismatched games honestly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect((await call()).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ header: { id: "other" } })));
    expect((await call()).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await call()).status).toBe(502);
  });
});

describe("football coverage view", () => {
  it("renders box score, coverage tabs, and scoring summary for a final game", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["football-game-detail", "nfl", "401671793"], shape());
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><FootballGameDetail sport="nfl" gameId="401671793" /></QueryClientProvider>);
    expect(html).toContain("Patrick Mahomes"); expect(html).toContain("Play-by-play"); expect(html).toContain("Team stats");
    expect(html).toContain("Scoring summary"); expect(html).toContain("Kansas City Chiefs"); expect(html).not.toContain("Latest play");
    client.clear();
  });

  it("shows a real latest-play strip when the game is live", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const game = shape(); game.phase = "live"; game.plays = [{ ...game.plays[0], text: "Example live play" }];
    client.setQueryData(["football-game-detail", "nfl", "401671793"], game);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><FootballGameDetail sport="nfl" gameId="401671793" /></QueryClientProvider>);
    expect(html).toContain("Latest play"); expect(html).toContain("Example live play"); expect(html).toContain("every 30 seconds");
    client.clear();
  });
});
