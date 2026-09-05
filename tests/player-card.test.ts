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
 * below is read off those files, not typed from memory. Since INSTRUCTION 37
 * (2026-09-04) the split rows are GAME windows summed from the game log — the
 * trimmed logs hold 6 games each, so "Last 7 games" = all 6 for Acuña and
 * "Last 3 starts" is Skenes' 08-19 / 08-25 / 09-01 starts. Plus source checks:
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

/* ---------------- helpers ---------------- */
describe("player-card: helpers", () => {
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
    seasonDoc: fx("player-660670-season.json"), gameLog: fx("player-660670-gamelog.json"),
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
  it("split rows: season from the feed; Last 7/15/30 GAMES summed from the log with rates recomputed", () => {
    expect(card.splitHeaders).toEqual(["AB", "R", "H", "HR", "RBI", "BB", "SB", "AVG", "OBP", "SLG"]);
    expect(card.splits.map((s) => s.label)).toEqual(["2026", "Last 7 games", "Last 15 games", "Last 30 games"]);
    expect(card.splits[0]).toEqual({ label: "2026", games: 87, cells: ["329", "50", "80", "14", "39", "47", "20", ".243", ".345", ".416"] });
    // the trimmed log holds 6 games: 22 AB, 6 R, 10 H, 1 HR, 4 RBI, 4 BB, 2 SB, 14 TB, 0 HBP/SF
    // → AVG 10/22 .455, OBP 14/26 .538, SLG 14/22 .636 — NOT the feed's season-to-date rates
    const six = ["22", "6", "10", "1", "4", "4", "2", ".455", ".538", ".636"];
    expect(card.splits[1]).toEqual({ label: "Last 7 games", games: 6, cells: six });
    expect(card.splits[3]).toEqual({ label: "Last 30 games", games: 6, cells: six });
  });
  it("a window is the last N games PLAYED, oldest→newest by date whatever order the feed sent", () => {
    const shuffled = { stats: [{ splits: [...fx("player-660670-gamelog.json").stats[0].splits].reverse() }] };
    const c = shapeCard({ person, isPitcher: false, season: 2026, today: TODAY, seasonDoc: fx("player-660670-season.json"), gameLog: shuffled })!;
    expect(c.splits[1].cells).toEqual(card.splits[1].cells);
    expect(c.chart.points.map((p) => p.date)).toEqual(card.chart.points.map((p) => p.date));
  });
  it("no game log → windows are null (no games in window), never zeros", () => {
    const c = shapeCard({ person, isPitcher: false, season: 2026, today: TODAY, seasonDoc: fx("player-660670-season.json"), gameLog: null })!;
    expect(c.splits[1]).toEqual({ label: "Last 7 games", games: 0, cells: null });
    expect(c.chart.points).toEqual([]);
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
  it("chart: total bases per game over the last 30 games, chronological", () => {
    expect(card.chart.label).toBe("Total bases by game — last 30 games");
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
    seasonDoc: fx("player-694973-season.json"), gameLog: fx("player-694973-gamelog.json"),
  })!;

  it("tiles are ERA / K / WHIP (3.97 / 179 / 1.16)", () => {
    expect(card.isPitcher).toBe(true);
    expect(card.tiles).toEqual([{ label: "ERA", value: "3.97" }, { label: "K", value: "179" }, { label: "WHIP", value: "1.16" }]);
  });
  it("season split: G GS IP H ER BB K W-L SV ERA WHIP", () => {
    expect(card.splitHeaders).toEqual(["G", "GS", "IP", "H", "ER", "BB", "K", "W-L", "SV", "ERA", "WHIP"]);
    expect(card.splits[0].cells).toEqual(["28", "28", "149.2", "129", "66", "44", "179", "9-11", "0", "3.97", "1.16"]);
  });
  it("a starter's windows are his last 3 / 5 / 10 STARTS, summed from the log", () => {
    expect(card.splits.map((s) => s.label)).toEqual(["2026", "Last 3 starts", "Last 5 starts", "Last 10 starts"]);
    // 08-19 (4.1 IP 3 ER 4 H 4 BB 5 K) + 08-25 (6.0, 0, 3, 0, 4) + 09-01 (4.2, 5, 8, 3, 4)
    // = 45 outs → 15.0 IP, 8 ER → ERA 4.80, 15 H, 7 BB → WHIP 1.47, 13 K, 0-0
    expect(card.splits[1]).toEqual({ label: "Last 3 starts", games: 3, cells: ["3", "3", "15.0", "15", "8", "7", "13", "0-0", "0", "4.80", "1.47"] });
    // last 5: + 08-05 (5.0, 3, 2, 4, 6, L) + 08-11 (5.0, 1, 5, 1, 4, L) → 75 outs, 12 ER → 4.32, 22 H, 12 BB → 1.36, 23 K, 0-2
    expect(card.splits[2]).toEqual({ label: "Last 5 starts", games: 5, cells: ["5", "5", "25.0", "22", "12", "12", "23", "0-2", "0", "4.32", "1.36"] });
    // last 10 = all 6 in the trimmed log: 87 outs → 29.0, 17 ER → 5.28
    expect(card.splits[3].games).toBe(6);
    expect(card.splits[3].cells!.slice(0, 3)).toEqual(["6", "6", "29.0"]);
    expect(card.splits[3].cells![9]).toBe("5.28");
  });
  it("a reliever's windows are appearances: Skenes' log re-labelled as a bullpen arm", () => {
    const rp = shapeCard({
      person, isPitcher: true, season: 2026, today: TODAY,
      seasonDoc: { stats: [{ splits: [{ stat: { gamesPlayed: 28, gamesStarted: 0, era: "3.97", strikeOuts: 179, whip: "1.16" } }] }] },
      gameLog: fx("player-694973-gamelog.json"),
    })!;
    expect(rp.splits.map((s) => s.label)).toEqual(["2026", "Last 3 games", "Last 5 games", "Last 10 games"]);
    expect(rp.splits[1].cells![2]).toBe("15.0");
    expect(rp.chart.label).toBe("Strikeouts by game — last 10 appearances");
  });
  it("game log: IP H ER BB K + decision; QS only on 6+ IP with ≤3 ER", () => {
    expect(card.logHeaders).toEqual(["IP", "H", "ER", "BB", "K", "DEC"]);
    expect(card.log[0]).toMatchObject({ date: "2026-09-01", opp: "SF", home: true });
    expect(card.log[0].cells).toEqual(["4.2", "8", "5", "3", "4", "—"]);
    const aug25 = card.log.find((g) => g.date === "2026-08-25")!;
    expect(aug25.cells.slice(0, 5)).toEqual(["6.0", "3", "0", "0", "4"]);
    expect(aug25.cells[5]).toContain("QS");
  });
  it("chart is strikeouts per start over the last 10 starts — the 07-31 start is in now (it was outside 30 days)", () => {
    expect(card.chart.label).toBe("Strikeouts by game — last 10 starts");
    expect(card.chart.points.map((p) => p.v)).toEqual([7, 6, 4, 5, 4, 4]);
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
  it("shapeCard's season row reads the combined split when a traded player's season doc lists per-team partials first", () => {
    const card = shapeCard({
      person: fx("player-660670-person.json") as PersonDoc, isPitcher: false, season: 2026, today: TODAY,
      seasonDoc: win, gameLog: null,
    })!;
    expect(card.splits[0].games).toBe(76);
    expect(card.splits[0].cells![0]).toBe("309"); // AB
    expect(card.splits[0].cells![3]).toBe("4"); // HR
    expect(card.splits[0].cells).not.toContain("107");
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
    expect(shapeCard({ person: { people: [] }, isPitcher: false, season: 2026, today: TODAY, seasonDoc: null, gameLog: null })).toBeNull();
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
  it("INSTRUCTION 37: the card route no longer asks for calendar windows — season + game log only", () => {
    const src = read("app/api/player/route.ts");
    expect(src).not.toMatch(/byDateRange/);
    expect(src).not.toMatch(/windowDates/);
    expect(src).toMatch(/stats\("season"\), stats\("gameLog"\)/);
    const sheet = read("src/components/player/PlayerSheet.tsx");
    expect(sheet).not.toMatch(/days/i);
    expect(sheet).toMatch(/windowTitle\(c\.splits\)/);
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
