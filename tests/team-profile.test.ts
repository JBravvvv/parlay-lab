import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/teams/[sport]/[teamId]/route";
import { espnTeamSchedule, espnTeamRoster, espnTeamStats, mlbTeamSchedule, mlbTeamStats, shapeEspnTeamProfile, shapeMlbTeamProfile, teamProfileSeason } from "@/lib/team-profile";

const footballTeam = { team: { id: "12", displayName: "Kansas City Chiefs", abbreviation: "KC", logos: [{ href: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png" }], record: { items: [{ type: "total", summary: "2-0" }] } } };
function footballEvent(id: string, state = "post", ownScore: unknown = { value: 31, displayValue: "31" }, opponentScore: unknown = { value: 10, displayValue: "10" }) {
  return { id, date: "2026-09-15T00:15Z", shortName: "DEN @ KC", season: { year: 2026 }, seasonType: { name: "Regular Season" }, competitions: [{ status: { type: { state, completed: state === "post", shortDetail: state === "in" ? "7:20 - 3rd" : "Final" } }, competitors: [
    { homeAway: "home", team: { id: "12", displayName: "Kansas City Chiefs", abbreviation: "KC" }, score: ownScore },
    { homeAway: "away", team: { id: "7", displayName: "Denver Broncos", abbreviation: "DEN" }, score: opponentScore },
  ] }] };
}
const mlbEvent = (over: Record<string, unknown> = {}) => ({ gamePk: 1, gameDate: "2026-09-15T02:00:00Z", season: "2026", gameType: "R", status: { abstractGameState: "Final", detailedState: "Final" }, teams: { home: { team: { id: 147, name: "New York Yankees", abbreviation: "NYY" }, score: 0, leagueRecord: { wins: 90, losses: 60 } }, away: { team: { id: 110, name: "Baltimore Orioles", abbreviation: "BAL" }, score: 2 } }, ...over });

describe("team profile provider shaping", () => {
  it("returns full football season without duplicated events and uses the selected team's score first", () => {
    const old = { ...footballEvent("old"), season: { year: 2025 } }, upcoming = footballEvent("next", "pre");
    const games = espnTeamSchedule([{ events: [footballEvent("first"), old, upcoming] }, { events: [footballEvent("first")] }], "12", 2026);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ id: "first", score: "31–10", result: "W", date: "2026-09-14", home: true, status: "final" });
    expect(games[1]).toMatchObject({ id: "next", score: null, result: null, status: "upcoming" });
  });
  it("preserves a real zero, a missing score, and live status without inventing a result", () => {
    const games = espnTeamSchedule([{ events: [footballEvent("zero", "in", { value: 0 }, { value: 7 }), footballEvent("missing", "post", null)] }], "12", 2026);
    expect(games[0]).toMatchObject({ score: "0–7", result: null, status: "live", detail: "7:20 - 3rd" });
    expect(games[1]).toMatchObject({ score: null, result: null, status: "final" });
    expect(espnTeamSchedule([{ events: [footballEvent("wrong")] }], "9", 2026)).toEqual([]);
  });
  it("marks delayed seasons honestly and deduplicates grouped roster players", () => {
    const player = { id: "15", displayName: "Player Name", jersey: "7", position: { abbreviation: "QB" }, headshot: { href: "https://example.com/player.png" }, status: { name: "Injured Reserve" } };
    expect(espnTeamRoster({ athletes: [{ position: "offense", items: [player] }, { position: "injuredReserveOrOut", items: [player] }] })).toEqual([expect.objectContaining({ id: "15", name: "Player Name", number: "7", position: "QB", status: "Injured Reserve" })]);
    const stats = { season: { year: 2025 }, results: { stats: { categories: [{ name: "passing", stats: [{ name: "passingYards", displayValue: "100" }] }] } } };
    expect(espnTeamStats(stats, 2026)).toEqual([]);
  });
  it("pairs own and opponent statistics and preserves missing opponent numbers", () => {
    const group = { name: "passing", displayName: "Passing", stats: [{ name: "passingYards", displayName: "Passing Yards", displayValue: "643" }, { name: "touchdowns", displayName: "Touchdowns", value: 0 }, { name: "passingYards", displayName: "Passing Yards", displayValue: "643" }] };
    const groups = espnTeamStats({ season: { year: 2026 }, results: { stats: { categories: [group] }, opponent: [{ ...group, stats: [{ name: "passingYards", displayValue: "410" }] }] } }, 2026);
    expect(groups[0].rows).toEqual([{ id: "passingYards", label: "Passing Yards", value: "643", opponent: "410" }, { id: "touchdowns", label: "Touchdowns", value: "0", opponent: null }]);
  });
  it("keeps MLB box-score identity, result and Pacific date", () => {
    const games = mlbTeamSchedule({ dates: [{ games: [mlbEvent()] }] }, "147", 2026);
    expect(games).toEqual([expect.objectContaining({ id: "1", score: "0–2", result: "L", label: "BAL @ NYY", date: "2026-09-14", phase: "Regular season" })]);
    expect(mlbTeamSchedule({ dates: [{ games: [mlbEvent({ season: "2025" })] }] }, "147", 2026)).toEqual([]);
    expect(mlbTeamSchedule({ dates: [{ games: [mlbEvent()] }] }, "999", 2026)).toEqual([]);
  });
  it("hides pregame MLB zeros and labels postponements", () => {
    const pending = mlbEvent({ status: { abstractGameState: "Preview", detailedState: "Scheduled" } });
    expect(mlbTeamSchedule({ dates: [{ games: [pending] }] }, "147", 2026)[0]).toMatchObject({ status: "upcoming", score: null, result: null });
    expect(mlbTeamSchedule({ dates: [{ games: [mlbEvent({ status: { abstractGameState: "Preview", detailedState: "Postponed" } })] }] }, "147", 2026)[0].status).toBe("postponed");
  });
  it("uses season-matched MLB statistics and provider team records", () => {
    const stats = { stats: [{ group: { displayName: "hitting" }, splits: [{ season: "2025", stat: { avg: ".250" } }, { season: "2026", stat: { avg: ".235", runs: 0, missing: null } }] }] };
    expect(mlbTeamStats(stats, 2026)[0].rows).toEqual([{ id: "avg", label: "Batting average", value: ".235", opponent: null }, { id: "runs", label: "Runs", value: "0", opponent: null }]);
    const profile = shapeMlbTeamProfile({ teamId: "147", season: 2026, team: { teams: [{ id: 147, name: "New York Yankees" }] }, schedule: { dates: [{ games: [mlbEvent()] }] }, roster: {}, stats });
    expect(profile).toMatchObject({ record: "90–60", sport: "mlb", source: "MLB Stats API" });
  });
  it("rejects an unrelated team response and computes football seasons across January", () => {
    expect(shapeEspnTeamProfile({ sport: "cfb", teamId: "8", season: 2026, team: footballTeam, schedules: [], roster: null, stats: null })).toBeNull();
    expect(teamProfileSeason("nfl", new Date("2027-01-10"))).toBe(2026);
    expect(teamProfileSeason("mlb", new Date("2027-01-10"))).toBe(2027);
  });
});

describe("public team profile route", () => {
  afterEach(() => vi.unstubAllGlobals());
  const request = (sport: string, teamId: string, extra = "") => GET(new NextRequest(`http://localhost/api/teams/${sport}/${teamId}${extra}`), { params: Promise.resolve({ sport, teamId }) });
  it("blocks unsupported sports, arbitrary identifiers and bad seasons before any fetch", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const input of [["tennis", "12"], ["nfl", "https://evil.com"], ["nfl", "12", "?season=x"]]) expect((await request(input[0], input[1], input[2])).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves schedule and statistics when one optional provider fails", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/roster")) throw new Error("timeout");
      if (url.includes("/schedule")) return Response.json({ events: [footballEvent("game")] });
      if (url.includes("/statistics")) return Response.json({ season: { year: 2026 }, results: { stats: { categories: [] } } });
      return Response.json(footballTeam);
    });
    vi.stubGlobal("fetch", fetcher);
    const res = await request("nfl", "12", "?season=2026"), data = await res.json();
    expect(res.status).toBe(200); expect(data.schedule).toHaveLength(1); expect(data.roster).toEqual([]);
    expect(data.notices).toContain("Roster is temporarily unavailable.");
    expect(fetcher.mock.calls.map(c => c[0]).filter(u => u.includes("/schedule"))).toHaveLength(3);
    expect(fetcher.mock.calls.every(c => c[0].startsWith("https://site.api.espn.com/"))).toBe(true);
  });
  it("reports a failed team provider without replacing it with empty success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect((await request("mlb", "147")).status).toBe(502);
  });
});
