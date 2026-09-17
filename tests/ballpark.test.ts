import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MLB_PARKS,
  PARK_DAILY,
  buildParkCards,
  findPark,
  parkDailyForGame,
  parkEnv,
  parkMarkets,
  parseWind,
  pnorm,
  type PriorsParks,
} from "@/lib/mlb/ballpark";

/**
 * DAILY BALLPARK FACTOR (INSTRUCTION 68, 2026-09-17, Josh's word, verbatim: "There should be a
 * tab titled 'Ballpark Factor' that shows daily ballpark factor for every stadium that is being
 * used in the engine to calculate bets. The engine should obviously know but it should take into
 * account temperature, elevation, wind mph, wind in/out/left/right, etc").
 *
 * The model is pure; these pin (1) the legacy rule is reproduced at its own thresholds, so the
 * continuous wind term is an extension and not a re-fit, (2) every direction MLB's feed writes
 * is read, (3) every park the engine prices at resolves, in the static table AND in the Savant
 * priors, (4) nothing is fabricated when the weather is not posted.
 */

const FIX = path.join(__dirname, "fixtures");
const priors = JSON.parse(fs.readFileSync(path.join(FIX, "fix45", "priors.json"), "utf8")) as { parks: PriorsParks };
const schedule = JSON.parse(fs.readFileSync(path.join(FIX, "fix39", "schedule.json"), "utf8")) as { dates: { games: unknown[] }[] };

describe("parseWind — every direction MLB statsapi writes", () => {
  it("out / in with a field direction", () => {
    expect(parseWind("10 mph, Out To CF")).toMatchObject({ mph: 10, dir: "out", toward: "CF", weight: 1 });
    expect(parseWind("7 mph, Out To LF")).toMatchObject({ mph: 7, dir: "out", toward: "LF", weight: PARK_DAILY.cornerWeight });
    expect(parseWind("9 mph, Out To RF")).toMatchObject({ mph: 9, dir: "out", toward: "RF", weight: PARK_DAILY.cornerWeight });
    expect(parseWind("11 mph, In From CF")).toMatchObject({ mph: 11, dir: "in", toward: "CF", weight: -1 });
    expect(parseWind("6 mph, In From LF")).toMatchObject({ mph: 6, dir: "in", toward: "LF", weight: -PARK_DAILY.cornerWeight });
  });
  it("cross winds, calm, varies and an empty string carry no HR weight", () => {
    expect(parseWind("6 mph, L To R")).toMatchObject({ mph: 6, dir: "cross", weight: 0 });
    expect(parseWind("5 mph, R To L")).toMatchObject({ mph: 5, dir: "cross", weight: 0 });
    expect(parseWind("0 mph, None")).toMatchObject({ mph: 0, dir: "calm", weight: 0 });
    expect(parseWind("13 mph, Varies")).toMatchObject({ mph: 13, dir: "varies", weight: 0 });
    expect(parseWind("")).toMatchObject({ mph: 0, dir: "unknown", weight: 0 });
    expect(parseWind(null)).toMatchObject({ mph: 0, dir: "unknown", weight: 0 });
  });
});

describe("parkEnv — the legacy rule is reproduced at its own thresholds, then made continuous", () => {
  it("10 mph out to CF at 70 °F at a sea-level park = the legacy +10 % exactly; 10 mph in = −10 %", () => {
    expect(parkEnv("Citi Field", { temp: "70", wind: "10 mph, Out To CF" }).f).toBeCloseTo(1.1 * 1.012 * 0 + 1.1 * (1 + PARK_DAILY.elevPerKft * 0.01), 3);
    const out = parkEnv("Yankee Stadium", { temp: "70", wind: "10 mph, Out To CF" });
    const inn = parkEnv("Yankee Stadium", { temp: "70", wind: "10 mph, In From CF" });
    expect(out.terms.wind).toBeCloseTo(1.1, 6);
    expect(inn.terms.wind).toBeCloseTo(0.9, 6);
    expect(out.terms.temp).toBe(1);
  });
  it("wind is continuous in mph (5 mph out is +5 %, not 0 as the legacy step read it) and clamped", () => {
    expect(parkEnv("Citi Field", { temp: "70", wind: "5 mph, Out To CF" }).terms.wind).toBeCloseTo(1.05, 6);
    expect(parkEnv("Citi Field", { temp: "70", wind: "40 mph, Out To CF" }).terms.wind).toBe(PARK_DAILY.windClamp[1]);
    expect(parkEnv("Citi Field", { temp: "70", wind: "40 mph, In From CF" }).terms.wind).toBe(PARK_DAILY.windClamp[0]);
  });
  it("temperature is the engine's own +0.8 %/°F over 70, clamped 0.90–1.12", () => {
    expect(parkEnv("Citi Field", { temp: "80", wind: "0 mph, None" }).terms.temp).toBeCloseTo(1.08, 6);
    expect(parkEnv("Citi Field", { temp: "50", wind: "0 mph, None" }).terms.temp).toBeCloseTo(0.9, 6);
    expect(parkEnv("Citi Field", { temp: "110", wind: "0 mph, None" }).terms.temp).toBe(PARK_DAILY.tempClamp[1]);
  });
  it("a closed roof or a dome zeroes the wind term but keeps the reported temperature", () => {
    const closed = parkEnv("Globe Life Field", { condition: "Roof Closed", temp: "74", wind: "12 mph, Out To CF" });
    expect(closed.roofClosed).toBe(true);
    expect(closed.terms.wind).toBe(1);
    expect(closed.terms.temp).toBeCloseTo(1 + 0.008 * 4, 6);
    expect(parkEnv("Tropicana Field", { condition: "Dome", temp: "72", wind: "0 mph, None" }).roofClosed).toBe(true);
  });
  it("elevation: Coors carries +6.2 %, Chase / Truist ≈ +1.3 %, sea level ≈ 0, an unknown venue exactly 1", () => {
    expect(parkEnv("Coors Field", null).terms.elevation).toBeCloseTo(1 + 0.012 * 5.19, 3);
    expect(parkEnv("Chase Field", null).terms.elevation).toBeCloseTo(1.013, 3);
    expect(parkEnv("Truist Park", null).terms.elevation).toBeCloseTo(1.0126, 3);
    expect(parkEnv("Citi Field", null).terms.elevation).toBeCloseTo(1.0001, 3);
    expect(parkEnv("Some Spring Training Complex", null).terms.elevation).toBe(1);
  });
  it("hits take a quarter of the HR environment, total bases half — both clamped", () => {
    const e = parkEnv("Yankee Stadium", { temp: "90", wind: "15 mph, Out To CF" });
    expect(e.f).toBeGreaterThan(1.2);
    expect(e.h).toBe(PARK_DAILY.hitsClamp[1]);
    expect(e.tb).toBeCloseTo(Math.min(PARK_DAILY.tbClamp[1], 1 + (e.f - 1) * 0.5), 3);
    const c = parkEnv("Wrigley Field", { temp: "58", wind: "14 mph, In From CF" });
    expect(c.f).toBeLessThan(0.85);
    expect(c.h).toBeCloseTo(Math.max(PARK_DAILY.hitsClamp[0], 1 + (c.f - 1) * 0.25), 3);
  });
  it("no weather posted: wind and temp are 1, weatherPosted false, the card text says nothing false", () => {
    const e = parkEnv("Petco Park", null);
    expect(e.weatherPosted).toBe(false);
    expect(e.terms.temp).toBe(1);
    expect(e.terms.wind).toBe(1);
    expect(e.txt).toBeNull();
  });
});

describe("the static stadium table — every park the engine prices at", () => {
  it("has 30 parks, each with a positive elevation, a roof kind, a team and an abbreviation, no duplicate venue", () => {
    expect(MLB_PARKS.length).toBe(30);
    for (const p of MLB_PARKS) {
      expect(p.elevationFt, p.venue).toBeGreaterThanOrEqual(0);
      expect(["open", "retractable", "dome"]).toContain(p.roof);
      expect(p.team.length).toBeGreaterThan(3);
      expect(p.abbr).toMatch(/^[A-Z]{2,3}$/);
    }
    expect(new Set(MLB_PARKS.map((p) => pnorm(p.venue))).size).toBe(30);
    expect(new Set(MLB_PARKS.map((p) => p.abbr)).size).toBe(30);
  });
  it("every Savant park name in the frozen priors resolves to a static row, and Coors is the highest park", () => {
    for (const name of Object.keys(priors.parks!.R!)) expect(findPark(name), name).not.toBeNull();
    const top = [...MLB_PARKS].sort((a, b) => b.elevationFt - a.elevationFt)[0];
    expect(top.venue).toBe("Coors Field");
  });
  it("aliases and the old statsapi names resolve (Dodger Stadium, Guaranteed Rate Field, Minute Maid Park)", () => {
    expect(findPark("Dodger Stadium")?.abbr).toBe("LAD");
    expect(findPark("Guaranteed Rate Field")?.abbr).toBe("CWS");
    expect(findPark("Minute Maid Park")?.abbr).toBe("HOU");
    expect(findPark("Sutter Health Park")?.abbr).toBe("ATH");
    expect(findPark("")).toBeNull();
  });
});

describe("parkMarkets — the engine's own damped season index × today's environment", () => {
  const env70 = parkEnv("Coors Field", { temp: "70", wind: "0 mph, None" });
  it("Coors, RHB, calm 70 °F: HR = damped index × elevation carry; K and outs take the inverse trim", () => {
    const m = parkMarkets(priors.parks, "Coors Field", "R", env70);
    const row = priors.parks!.R!["Coors Field"];
    expect(m.index).toEqual({ hr: row.hr, hits: row.hits, runs: row.runs, k: row.k, woba: row.woba });
    expect(m.hr).toBeCloseTo((1 + (row.hr! / 100 - 1) * 0.5) * env70.f, 2);
    expect(m.hits).toBeCloseTo((1 + (row.hits! / 100 - 1) * 0.5) * env70.h, 2);
    expect(m.k).toBeLessThanOrEqual(PARK_DAILY.kClamp[1]);
    expect(m.outs).toBeLessThan(1); // Coors' run environment trims the outs estimate
  });
  it("a park the priors do not carry shows index null and season terms of exactly 1", () => {
    const env = parkEnv("Sutter Health Park", { temp: "70", wind: "0 mph, None" });
    const m = parkMarkets(priors.parks, "Sutter Health Park", "R", env);
    expect(m.index).toBeNull();
    expect(m.hr).toBeCloseTo(env.f, 6);
    expect(m.k).toBeCloseTo(1, 6);
  });
  it("no priors at all → every season term is 1 and only the environment moves the markets", () => {
    const env = parkEnv("Yankee Stadium", { temp: "85", wind: "12 mph, Out To CF" });
    const m = parkMarkets(null, "Yankee Stadium", "L", env);
    expect(m.hr).toBeCloseTo(env.f, 6);
    expect(m.hits).toBeCloseTo(env.h, 6);
  });
});

describe("parkDailyForGame — the engine hook", () => {
  it("returns f / h / tb / txt for a game with posted weather and null for a game with no venue", () => {
    const r = parkDailyForGame({ venue: "Wrigley Field", weather: { condition: "Sunny", temp: "64", wind: "12 mph, In From CF" } });
    expect(r).not.toBeNull();
    expect(r!.f).toBeLessThan(1);
    expect(r!.h).toBeLessThan(1);
    expect(r!.tb).toBeLessThan(1);
    expect(r!.txt).toMatch(/12 mph, In From CF \(in\) · 64°F · 600 ft ×0\.\d\d/);
    expect(parkDailyForGame({ venue: null, weather: { temp: "80" } })).toBeNull();
    expect(parkDailyForGame(null)).toBeNull();
  });
  it("a sea-level park with no weather posted returns null — the blob keeps its legacy reading", () => {
    expect(parkDailyForGame({ venue: "Citi Field", weather: null })).toBeNull();
    // Coors with no weather still carries its elevation
    expect(parkDailyForGame({ venue: "Coors Field", weather: null })!.f).toBeGreaterThan(1.05);
  });
});

describe("buildParkCards — every stadium, today's games first", () => {
  const games = schedule.dates[0].games as Parameters<typeof buildParkCards>[0];
  it("today's parks lead in first-pitch order, every idle park follows alphabetically, 30 cards total", () => {
    const cards = buildParkCards(games, priors.parks);
    const withGame = cards.filter((c) => c.game);
    expect(withGame.length).toBeGreaterThan(5);
    expect(withGame.length + cards.filter((c) => !c.game).length).toBe(cards.length);
    expect(cards.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < withGame.length; i++) expect((withGame[i - 1].game!.start ?? "") <= (withGame[i].game!.start ?? "")).toBe(true);
    const idle = cards.filter((c) => !c.game).map((c) => c.venue);
    expect(idle).toEqual([...idle].sort((a, b) => a.localeCompare(b)));
    expect(cards.map((c) => c.venue).indexOf(withGame[0].venue)).toBe(0);
  });
  it("carries the feed's weather verbatim and both batter sides, and a dome reads roof closed", () => {
    const cards = buildParkCards(games, priors.parks);
    const trop = cards.find((c) => c.venue === "Tropicana Field")!;
    expect(trop.game).not.toBeNull();
    expect(trop.env.roofClosed).toBe(true);
    expect(trop.weather?.condition).toBe("Dome");
    const citi = cards.find((c) => c.venue === "Citi Field")!;
    expect(citi.weather).toEqual({ condition: "Cloudy", temp: 83, wind: "11 mph, In From CF" });
    expect(citi.env.wind.dir).toBe("in");
    expect(citi.R.index?.hr).toBe(priors.parks!.R!["Citi Field"].hr);
    expect(citi.L.index?.hr).toBe(priors.parks!.L!["Citi Field"].hr);
    expect(citi.env.terms.wind).toBeLessThan(1);
    expect(citi.env.f).toBeLessThan(1); // 83 °F lifts, 11 mph in from CF trims harder — the sky is a net pitcher's day
    expect(Number.isFinite(citi.lean)).toBe(true);
  });
  it("a doubleheader is one card (one sky)", () => {
    const twice = [...games, games[0]];
    expect(buildParkCards(twice, priors.parks).length).toBe(buildParkCards(games, priors.parks).length);
  });
});
