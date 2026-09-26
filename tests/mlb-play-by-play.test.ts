import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { shapeMlbPlays } from "@/lib/mlb-play-by-play";
import { GET } from "../app/api/games/[gamePk]/plays/route";

const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/mlb-play-by-play-822686.json"), "utf8"));
const at = "2026-09-26T20:00:00.000Z";

describe("MLB play-by-play from a captured official feed", () => {
  it("preserves innings, results, scoring, score and plate appearance identity", () => {
    const result = shapeMlbPlays(822686, fixture, at);
    expect(result.pk).toBe(822686);
    expect(result.fetchedAt).toBe(at);
    expect(result.plays).toHaveLength(3);
    expect(result.plays[0]).toMatchObject({ id: "at-bat-0", half: "top", inning: 1, complete: true, scoring: false, event: "Strikeout", awayScore: 0, homeScore: 0, batter: "Drake Baldwin", pitcher: "Brad Lord" });
    expect(result.plays[1]).toMatchObject({ id: "at-bat-40", inning: 6, scoring: true, event: "Home Run", awayScore: 3, homeScore: 0, batter: "Sean Murphy" });
    expect(result.current).toMatchObject({ id: "at-bat-74", half: "bottom", inning: 9, complete: true, awayScore: 9, homeScore: 0, batter: "CJ Abrams" });
  });
  it("keeps pitch order and measured velocity without treating timeout/status events as pitches", () => {
    const first = shapeMlbPlays(822686, fixture, at).plays[0];
    expect(first.pitches).toHaveLength(5);
    expect(first.pitches.map((pitch) => pitch.number)).toEqual([1, 2, 3, 4, 5]);
    expect(first.pitches[0]).toMatchObject({ result: "Foul", type: "Four-Seam Fastball", speed: 93.4, balls: 0, strikes: 1 });
    expect(first.pitches[1]).toMatchObject({ result: "Swinging Strike", type: "Slider", speed: 84.7 });
  });
  it("supports an in-progress at-bat that is absent from allPlays", () => {
    // Synthetic partial live response exercises fields that a final game cannot contain.
    const result = shapeMlbPlays(822686, { allPlays: [], currentPlay: { about: { atBatIndex: 2, halfInning: "bottom", inning: 1, isComplete: false }, count: { balls: 0, strikes: 1, outs: 0 }, matchup: { batter: { fullName: "Test batter" } }, playEvents: [{ isPitch: true, pitchNumber: 1, details: { call: { description: "Called Strike" } }, count: { balls: 0, strikes: 1 } }] } }, at);
    expect(result.plays).toEqual([]);
    expect(result.current).toMatchObject({ complete: false, balls: 0, strikes: 1, outs: 0, awayScore: null, homeScore: null, pitcher: null });
    expect(result.current?.pitches[0]).toMatchObject({ result: "Called Strike", type: null, speed: null });
  });
  it("does not invent scores, counts, inning or batter when provider fields are absent", () => {
    const result = shapeMlbPlays(822686, { allPlays: [{ result: { description: "Feed note" } }] }, at);
    expect(result.current).toBeNull();
    expect(result.plays[0]).toMatchObject({ inning: null, half: null, awayScore: null, homeScore: null, balls: null, strikes: null, batter: null, pitches: [] });
  });
  it("recognizes scoringPlays when the per-play flag is missing", () => {
    const result = shapeMlbPlays(822686, { allPlays: [{ about: { atBatIndex: 12 } }], scoringPlays: [12] }, at);
    expect(result.plays[0].scoring).toBe(true);
  });
  it("distinguishes an empty feed from an invalid or incomplete response", () => {
    expect(shapeMlbPlays(822686, { allPlays: [] }, at)).toMatchObject({ plays: [], current: null });
    expect(() => shapeMlbPlays(822686, {}, at)).toThrow("incomplete");
    expect(() => shapeMlbPlays(822686, null, at)).toThrow("incomplete");
  });
});

const request = (pk: string) => GET(new NextRequest(`http://localhost/api/games/${pk}/plays`), { params: Promise.resolve({ gamePk: pk }) });
afterEach(() => vi.unstubAllGlobals());

describe("MLB play-by-play route", () => {
  it("rejects invalid game ids before requesting an upstream feed", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await request("not-a-game");
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads only the official free MLB endpoint and returns shaped plays", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const response = await request("822686");
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe("https://statsapi.mlb.com/api/v1/game/822686/playByPlay");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ next: { revalidate: 15 } });
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect((await response.json()).plays).toHaveLength(3);
  });
  it("returns 404 for a missing game", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect((await request("822686")).status).toBe(404);
  });
  it("does not convert an upstream failure into an empty successful play list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const response = await request("822686");
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("503");
  });
  it("rejects a malformed success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    expect((await request("822686")).status).toBe(502);
  });
  it("handles network failures without throwing beyond the route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    const response = await request("822686");
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("network unavailable");
  });
});
