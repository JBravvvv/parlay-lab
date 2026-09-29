import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/football/positions/route";
import { footballPosition, positionLookup, rosterPositions } from "@/lib/football/positions";
import { loadPositionFeed } from "@/lib/football/positions-client";

const roster = (teamId: string, position: string = "WR") => ({ team: { id: teamId }, athletes: [{ position: "offense", items: [
  { id: `${teamId}-1`, displayName: "Demo Receiver", position: { abbreviation: position } },
  { id: `${teamId}-2`, displayName: "Demo Mystery", position: { abbreviation: "ATH" } },
] }] });
afterEach(() => vi.unstubAllGlobals());

describe("verified football positions", () => {
  it("covers an 80-team college slate without truncation and keeps batches bounded", async () => {
    const seen: string[] = [];
    const request = vi.fn(async (url: string | URL | Request) => {
      const ids = new URL(String(url), "https://example.test").searchParams.get("teams")!.split(",");
      expect(ids.length).toBeLessThanOrEqual(32);
      seen.push(...ids);
      return Response.json({ players: ids.flatMap((id) => rosterPositions(roster(id), id)), missingTeams: [] });
    });
    const teams = Array.from({length:80}, (_, i) => String(i + 1));
    const result = await loadPositionFeed("cfb", teams, undefined, request as typeof fetch);
    expect(new Set(seen)).toEqual(new Set(teams));
    expect(seen).toHaveLength(80);
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.players).toHaveLength(160); /* each roster's receiver + its name-only ATH */
  });
  it("preserves successful batches and reports the failed batch's teams", async () => {
    const teams = Array.from({length:40}, (_, i) => String(i + 1));
    const request = vi.fn().mockResolvedValueOnce(new Response(null, {status:503})).mockImplementation(async (url: string) => {
      const ids = new URL(url, "https://example.test").searchParams.get("teams")!.split(",");
      return Response.json({players:ids.flatMap(id=>rosterPositions(roster(id),id)), missingTeams:[]});
    });
    const result = await loadPositionFeed("nfl", teams, undefined, request);
    expect(result.missingTeams).toHaveLength(32);
    expect(result.players).toHaveLength(16);
  });
  it("reads positions from the matching roster and normalizes known running-back labels", () => {
    /* the ATH comes back name-only (no position, no headshot): it can make a name ambiguous, never answer */
    expect(rosterPositions(roster("1"), "1")).toEqual([
      { athleteId: "1-1", player: "Demo Receiver", teamId: "1", position: "WR" },
      { athleteId: "1-2", player: "Demo Mystery", teamId: "1", position: null },
    ]);
    expect(rosterPositions(roster("2"), "1")).toEqual([]);
    expect(footballPosition("hb")).toBe("RB");
    expect(footballPosition("ATH")).toBeNull();
  });
  it("does not match a foreign roster or ambiguous same-named players", () => {
    const lookup = positionLookup([...rosterPositions(roster("1"), "1"), ...rosterPositions(roster("2", "RB"), "2")]);
    expect(lookup("Demo Receiver", ["1", "3"])).toBe("WR");
    expect(lookup("Demo Receiver", ["3", "4"])).toBeNull();
    expect(lookup("Demo Receiver", ["1", "2"])).toBeNull();
    /* a name-only listing never answers, alone or against itself */
    expect(lookup("Demo Mystery", ["1", "3"])).toBeNull();
  });
  it("an own-roster ATH makes the other side's same-named receiver ambiguous — never the one match (2026-09-28)", () => {
    const withAth = { team: { id: "7" }, athletes: [{ items: [{ id: "7-1", displayName: "Jordan Davis", position: { abbreviation: "ATH" } }] }] };
    const withWr = { team: { id: "8" }, athletes: [{ items: [{ id: "8-1", displayName: "Jordan Davis", position: { abbreviation: "WR" }, headshot: { href: "https://a.espncdn.com/x.png" } }] }] };
    const players = [...rosterPositions(withAth, "7"), ...rosterPositions(withWr, "8")];
    expect(players.find((p) => p.teamId === "7")).toEqual({ athleteId: "7-1", player: "Jordan Davis", teamId: "7", position: null });
    const lookup = positionLookup(players);
    expect(lookup("Jordan Davis", ["7", "8"])).toBeNull();
    expect(lookup("Jordan Davis", ["8"])).toBe("WR");
    expect(lookup("Jordan Davis", ["7"])).toBeNull();
  });
  it("rejects unknown leagues, malformed team IDs and excessive requests before fetching", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const query of ["league=mlb&teams=1", "league=nfl&teams=../1", "league=cfb", `league=nfl&teams=${Array.from({length:33}, (_, i) => i + 1).join(",")}`]) {
      expect((await GET(new NextRequest(`https://example.test/api/football/positions?${query}`))).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the league's ESPN roster with a cache and reports partial failures without invented positions", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("/teams/1/") ? Response.json(roster("1")) : new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    for (const [league, path] of [["nfl", "nfl"], ["cfb", "college-football"]]) {
      const response = await GET(new NextRequest(`https://example.test/api/football/positions?league=${league}&teams=1,2,1`));
      expect(await response.json()).toEqual({ players: rosterPositions(roster("1"), "1"), missingTeams: ["2"] });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(fetcher).toHaveBeenCalledWith(`https://site.api.espn.com/apis/site/v2/sports/football/${path}/teams/1/roster`, expect.objectContaining({ next: { revalidate: 3600 } }));
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
