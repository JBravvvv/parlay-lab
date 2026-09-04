/**
 * PLAYER PROFILE SHEET — pure shaping + resolution pins (2026-09-03).
 *
 * Operator Josh, verbatim: "On the Stats tab and any other tab that lists a
 * players name, you should be able to click on that players name & pull up a
 * page that is identical to their Roster Lab profile."
 *
 * Fixtures under tests/fixtures/player-*.json are TRIMMED REAL statsapi.mlb.com
 * responses captured 2026-09-03 (Ronald Acuña Jr. 660670 hitting, Paul Skenes
 * 694973 pitching, a 10-player slice of the season index). Every expected value
 * below is read off those files, not typed from memory. Plus source checks:
 * the provider is mounted in app/providers.tsx, both routes only talk to
 * statsapi.mlb.com, and every listed click surface imports PlayerName.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  batLogCells,
  buildIndex,
  canonicalAbbr,
  espnLogoCode,
  ipToOuts,
  isIntId,
  isPitcherPos,
  normalizeName,
  parseBoardLabel,
  pickSplit,
  pitLogCells,
  resolvePlayer,
  shapeCard,
  statusFromPerson,
  windowDates,
  type PersonDoc,
} from "@/lib/player-card";

const fx = (name: string) => JSON.parse(fs.readFileSync(path.join("tests/fixtures", name), "utf8"));
const TODAY = "2026-09-03";

/* ---------------- names ---------------- */
describe("player-card: name normalisation", () => {
  it("strips accents, punctuation and generational suffixes", () => {
    expect(normalizeName("Ronald Acuña Jr.")).toBe("ronald acuna");
    expect(normalizeName("José Ramírez")).toBe("jose ramirez");
    expect(normalizeName("A.J. Ewing")).toBe("a j ewing");
    expect(normalizeName("  Bobby   Witt Jr ")).toBe("bobby witt");
    expect(normalizeName("Vladimir Guerrero Jr.")).toBe(normalizeName("Vladimir Guerrero"));
  });
  it("maps book abbreviations onto MLB's", () => {
    expect(canonicalAbbr("OAK")).toBe("ATH");
    expect(canonicalAbbr("chw")).toBe("CWS");
    expect(canonicalAbbr("NYY")).toBe("NYY");
    expect(canonicalAbbr(null)).toBeNull();
  });
  it("parses engine labels — 'Name (TEAM)' is a player, a club name is not", () => {
    expect(parseBoardLabel("A.J. Ewing (NYM)")).toEqual({ name: "A.J. Ewing", team: "NYM" });
    expect(parseBoardLabel("Colson Montgomery (CWS)")).toEqual({ name: "Colson Montgomery", team: "CWS" });
    expect(parseBoardLabel("Boston Red Sox")).toBeNull();
    expect(parseBoardLabel("Seattle Mariners")).toBeNull();
    expect(parseBoardLabel("(NYM)")).toBeNull();
  });
});

/* ---------------- resolution against the real index slice ---------------- */
describe("player-card: name → MLB id", () => {
  const index = buildIndex(fx("player-index.json"));

  it("indexes the season list with team abbreviations and positions", () => {
    expect(index).toHaveLength(10);
    expect(index.find((e) => e.id === 660670)).toEqual({ id: 660670, fullName: "Ronald Acuña Jr.", teamId: 144, team: "ATL", pos: "RF" });
  });
  it("exact match survives accents and the Jr.", () => {
    expect(resolvePlayer(index, "Ronald Acuna Jr", "ATL")).toMatchObject({ id: 660670, via: "exact", team: "ATL", position: "RF" });
    expect(resolvePlayer(index, "Ronald Acuña Jr.")).toMatchObject({ id: 660670 });
    expect(resolvePlayer(index, "Jose Ramirez")).toMatchObject({ id: 608070, team: "CLE" });
    expect(resolvePlayer(index, "Pete Alonso")).toMatchObject({ id: 624413, team: "BAL", position: "1B" });
    expect(resolvePlayer(index, "Paul Skenes", "PIT")).toMatchObject({ id: 694973, position: "P" });
  });
  it("two Acuñas: the initial fallback needs the team to break the tie", () => {
    // "R. Acuña" — only Ronald starts with R, so it resolves alone
    expect(resolvePlayer(index, "R. Acuña")).toMatchObject({ id: 660670, via: "initial" });
    // "L Acuna" → Luisangel, CWS
    expect(resolvePlayer(index, "L Acuna", "CWS")).toMatchObject({ id: 682668, via: "initial" });
  });
  it("misses honestly: unknown names and single tokens return null", () => {
    expect(resolvePlayer(index, "Nobody Real", "ATL")).toBeNull();
    expect(resolvePlayer(index, "Ohtani")).toBeNull();
    expect(resolvePlayer(index, "")).toBeNull();
  });
  it("an exact duplicate without a team is ambiguous → null, with the team → resolved", () => {
    const dup = [...index, { id: 1, fullName: "Pete Alonso", teamId: 121, team: "NYM", pos: "1B" }];
    expect(resolvePlayer(dup, "Pete Alonso")).toBeNull();
    expect(resolvePlayer(dup, "Pete Alonso", "NYM")).toMatchObject({ id: 1, via: "team" });
    expect(resolvePlayer(dup, "Pete Alonso", "BAL")).toMatchObject({ id: 624413, via: "team" });
  });
});

/* ---------------- windows ---------------- */
describe("player-card: date windows are calendar arithmetic", () => {
  it("N-day window ends today and starts N-1 days back, across a month edge", () => {
    expect(windowDates("2026-09-03", 7)).toEqual({ startDate: "2026-08-28", endDate: "2026-09-03" });
    expect(windowDates("2026-09-03", 30)).toEqual({ startDate: "2026-08-05", endDate: "2026-09-03" });
    expect(windowDates("2026-03-01", 15)).toEqual({ startDate: "2026-02-15", endDate: "2026-03-01" });
  });
  it("helpers", () => {
    expect(ipToOuts("149.2")).toBe(449);
    expect(ipToOuts("6.0")).toBe(18);
    expect(isPitcherPos("P")).toBe(true);
    expect(isPitcherPos("TWP")).toBe(false);
    expect(isIntId("660670")).toBe(true);
    expect(isIntId("66x")).toBe(false);
    expect(espnLogoCode("ATH")).toBe("oak");
    expect(espnLogoCode("CWS")).toBe("chw");
    expect(espnLogoCode("ATL")).toBe("atl");
  });
});

/* ---------------- the hitter card (Acuña, real responses) ---------------- */
describe("player-card: hitter card from real statsapi responses", () => {
  const person = fx("player-660670-person.json") as PersonDoc;
  const card = shapeCard({
    person, isPitcher: false, season: 2026, today: TODAY,
    seasonDoc: fx("player-660670-season.json"), last7: null, last15: null,
    last30: fx("player-660670-last30.json"), gameLog: fx("player-660670-gamelog.json"),
  })!;

  it("identity + roster status straight from the person doc", () => {
    expect(card.fullName).toBe("Ronald Acuña Jr.");
    expect(card.team).toEqual({ id: 144, abbr: "ATL", name: "Atlanta Braves" });
    expect(card.pos).toBe("RF");
    expect(card.number).toBe("13");
    expect(card.isPitcher).toBe(false);
    expect(card.status).toEqual({ code: "A", description: "Active", tone: "pos" });
  });
  it("tiles are OPS / HR / AVG from the season line (.761 / 14 / .243)", () => {
    expect(card.tiles).toEqual([{ label: "OPS", value: ".761" }, { label: "HR", value: "14" }, { label: "AVG", value: ".243" }]);
  });
  it("split rows: season + last 30 carry the feed's counts; missing windows are null, not zeros", () => {
    expect(card.splitHeaders).toEqual(["AB", "R", "H", "HR", "RBI", "BB", "SB", "AVG", "OBP", "SLG"]);
    expect(card.splits.map((s) => s.label)).toEqual(["2026", "Last 7", "Last 15", "Last 30"]);
    expect(card.splits[0]).toEqual({ label: "2026", games: 87, cells: ["329", "50", "80", "14", "39", "47", "20", ".243", ".345", ".416"] });
    expect(card.splits[1].cells).toBeNull();
    expect(card.splits[3]).toEqual({ label: "Last 30", games: 26, cells: ["104", "13", "26", "5", "15", "9", "5", ".250", ".310", ".423"] });
  });
  it("game log is newest first with @ for road games and per-game OBP/SLG from the game's own counts", () => {
    expect(card.logHeaders).toEqual(["H/AB", "R", "HR", "RBI", "SB", "OBP", "SLG", "K"]);
    expect(card.log).toHaveLength(6);
    expect(card.log[0].date).toBe("2026-09-02");
    expect(card.log[0].opp).toBe("@WSH");
    expect(card.log[0].win).toBe(true);
    // 3-5 | HR, K, 3 RBI, 2 R, 1 SB, 6 TB → OBP 3/5 = .600, SLG 6/5 = 1.200
    expect(card.log[0].cells).toEqual(["3/5", "2", "1", "3", "1", ".600", "1.200", "1"]);
    expect(card.log[5].date).toBe("2026-08-28");
  });
  it("chart: total bases per game over the last 30 days, chronological", () => {
    expect(card.chart.label).toMatch(/^Total bases by game/);
    expect(card.chart.points.map((p) => p.date)).toEqual(["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
    expect(card.chart.points[5].v).toBe(6);
    expect(card.chart.points[4].v).toBe(0);
  });
  it("a 0-for-0 line renders dashes for rates, never a fabricated .000", () => {
    expect(batLogCells({ atBats: 0, hits: 0 })).toEqual(["0/0", "0", "0", "0", "0", "—", "—", "0"]);
    // a walk with no AB is a real OBP of 1.000 and no SLG
    expect(batLogCells({ atBats: 0, hits: 0, baseOnBalls: 1 })).toEqual(["0/0", "0", "0", "0", "0", "1.000", "—", "0"]);
  });
});

/* ---------------- the pitcher card (Skenes, real responses) ---------------- */
describe("player-card: pitcher card from real statsapi responses", () => {
  const person = fx("player-694973-person.json") as PersonDoc;
  const card = shapeCard({
    person, isPitcher: true, season: 2026, today: TODAY,
    seasonDoc: fx("player-694973-season.json"), last7: null, last15: null,
    last30: fx("player-694973-last30.json"), gameLog: fx("player-694973-gamelog.json"),
  })!;

  it("tiles are ERA / K / WHIP (3.97 / 179 / 1.16)", () => {
    expect(card.isPitcher).toBe(true);
    expect(card.tiles).toEqual([{ label: "ERA", value: "3.97" }, { label: "K", value: "179" }, { label: "WHIP", value: "1.16" }]);
  });
  it("season split: G GS IP H ER BB K W-L SV ERA WHIP", () => {
    expect(card.splitHeaders).toEqual(["G", "GS", "IP", "H", "ER", "BB", "K", "W-L", "SV", "ERA", "WHIP"]);
    expect(card.splits[0].cells).toEqual(["28", "28", "149.2", "129", "66", "44", "179", "9-11", "0", "3.97", "1.16"]);
    expect(card.splits[3].games).toBe(5);
  });
  it("game log: IP H ER BB K + decision; QS only on 6+ IP with ≤3 ER", () => {
    expect(card.logHeaders).toEqual(["IP", "H", "ER", "BB", "K", "DEC"]);
    expect(card.log[0]).toMatchObject({ date: "2026-09-01", opp: "SF", home: true });
    expect(card.log[0].cells).toEqual(["4.2", "8", "5", "3", "4", "—"]);
    const aug25 = card.log.find((g) => g.date === "2026-08-25")!;
    expect(aug25.cells.slice(0, 5)).toEqual(["6.0", "3", "0", "0", "4"]);
    expect(aug25.cells[5]).toContain("QS");
  });
  it("chart is strikeouts by game", () => {
    expect(card.chart.label).toMatch(/^Strikeouts by game/);
    expect(card.chart.points.map((p) => p.v)).toEqual([6, 4, 5, 4, 4]);
  });
  it("decision cells from counts", () => {
    expect(pitLogCells({ inningsPitched: "7.0", hits: 3, earnedRuns: 1, baseOnBalls: 0, strikeOuts: 9, wins: 1, gamesStarted: 1 })).toEqual(["7.0", "3", "1", "0", "9", "W,QS"]);
    expect(pitLogCells({ inningsPitched: "1.0", saves: 1 })[5]).toBe("SV");
    expect(pitLogCells({ inningsPitched: "0.2", blownSaves: 1, losses: 1 })[5]).toBe("L,BS");
  });
});

/* ---------------- status tones ---------------- */
describe("player-card: traded-inside-window split (real Arraez byDateRange 2026-06-01..09-03)", () => {
  const win = fx("player-650333-window.json");
  it("prefers the combined split (numTeams 2, no team) over the first per-team partial", () => {
    const st = pickSplit(win)!;
    expect(st.gamesPlayed).toBe(76);
    expect(st.atBats).toBe(309);
    expect(st.homeRuns).toBe(4);
    expect(st.avg).toBe(".311");
    // statsapi lists the Phillies-only partial first — that must NOT be the pick
    expect(win.stats[0].splits[0].team.name).toBe("Philadelphia Phillies");
    expect(win.stats[0].splits[0].stat.atBats).toBe(107);
  });
  it("single-split docs and empty docs behave as before", () => {
    expect(pickSplit(fx("player-660670-season.json"))!.gamesPlayed).toBe(87);
    expect(pickSplit({ stats: [{ splits: [] }] })).toBeNull();
    expect(pickSplit(null)).toBeNull();
  });
  it("shapeCard's Last-window row reads the combined split, not the 27 G / 107 AB partial", () => {
    const card = shapeCard({
      person: fx("player-660670-person.json") as PersonDoc, isPitcher: false, season: 2026, today: TODAY,
      seasonDoc: fx("player-660670-season.json"), last7: null, last15: null, last30: win, gameLog: null,
    })!;
    const last30 = card.splits.find((r) => r.label === "Last 30")!;
    expect(last30.games).toBe(76);
    expect(last30.cells![0]).toBe("309"); // AB
    expect(last30.cells![3]).toBe("4"); // HR
    expect(last30.cells).not.toContain("107");
  });
});

describe("player-card: roster status tone", () => {
  const person = (desc: string, code = "X"): NonNullable<PersonDoc["people"]>[number] => ({
    id: 1, fullName: "x",
    rosterEntries: [
      { isActive: false, statusDate: "2026-09-01", status: { code: "A", description: "Active" } },
      { isActive: true, statusDate: "2026-02-10", status: { code, description: desc } },
    ],
  });
  it("Active is green, IL is red, rehab is gold, nothing posted is null", () => {
    expect(statusFromPerson(person("Active", "A"))).toEqual({ code: "A", description: "Active", tone: "pos" });
    expect(statusFromPerson(person("Injured 60-Day", "D60"))).toEqual({ code: "D60", description: "Injured 60-Day", tone: "neg" });
    expect(statusFromPerson(person("Rehab Assignment"))?.tone).toBe("gold");
    expect(statusFromPerson({ id: 1, fullName: "x" })).toBeNull();
    expect(statusFromPerson({ id: 1, fullName: "x", rosterEntries: [{ isActive: false, status: { description: "Active" } }] })).toBeNull();
  });
  it("shapeCard returns null on an empty person doc", () => {
    expect(shapeCard({ person: { people: [] }, isPitcher: false, season: 2026, today: TODAY, seasonDoc: null, last7: null, last15: null, last30: null, gameLog: null })).toBeNull();
  });
});

/* ---------------- source checks ---------------- */
describe("player-card: wiring", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  it("the sheet provider is mounted once in app/providers.tsx", () => {
    const src = read("app/providers.tsx");
    expect(src).toContain("PlayerSheetProvider");
    expect(src.match(/<PlayerSheetProvider>/g)).toHaveLength(1);
  });
  it("both routes only talk to statsapi.mlb.com", () => {
    for (const f of ["app/api/player/route.ts", "app/api/player/resolve/route.ts"]) {
      const src = read(f);
      const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
      expect(hosts.length).toBeGreaterThan(0);
      expect(new Set(hosts)).toEqual(new Set(["statsapi.mlb.com"]));
    }
  });
  it("every listed click surface renders PlayerName / BoardLabel", () => {
    for (const f of [
      "app/stats/page.tsx", "app/board/page.tsx", "app/builder/page.tsx", "app/sharp/page.tsx",
      "src/components/stats/PitcherVsTeam.tsx", "src/components/mlb/ParlaysSection.tsx",
    ]) {
      expect(read(f), `${f} must import the tappable name`).toMatch(/from "@\/components\/player\/PlayerName"/);
      expect(read(f), `${f} must render it`).toMatch(/<(PlayerName|BoardLabel)\b/);
    }
  });
});
