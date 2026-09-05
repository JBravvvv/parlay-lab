import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ALIASES, matchOddsEvent, normTeam, overlapTokens, toOddsEvent, type OddsEvent } from "@/lib/cfb/names";
import { ptDateOf } from "@/lib/cfb/dates";

/**
 * THE ESPN ↔ ODDS API NAME JOIN (INSTRUCTION 38, 2026-09-05).
 *
 * ALIAS RESEARCH — every entry below was read out of the raw, untrimmed 2026-09-05 capture
 * (scratchpad/odds-ncaaf.json, 158 events; 68 ESPN events, 136 team names) by comparing the
 * set of ESPN `displayName`s to the set of odds `home_team`/`away_team` strings. Ten ESPN
 * names had no exact match; the odds feed's spelling for each, and the game it appeared in:
 *
 *   ESPN "Sam Houston Bearkats"         → odds "Sam Houston State Bearkats"        (@ Troy Trojans, 9/5 23:00Z)
 *   ESPN "Southern Miss Golden Eagles"  → odds "Southern Mississippi Golden Eagles" (vs Alcorn State Braves, 9/5 21:00Z)
 *   ESPN "Houston Christian Huskies"    → odds "Houston Baptist Huskies"            (@ Rice Owls, 9/5 23:00Z)
 *   ESPN "App State Mountaineers"       → odds "Appalachian State Mountaineers"     (vs Maine Black Bears, 9/5 19:30Z)
 *   ESPN "SE Louisiana Lions"           → odds "Southeastern Louisiana Lions"       (@ South Alabama Jaguars, 9/5 23:00Z)
 *   ESPN "The Citadel Bulldogs"         → odds "Citadel Bulldogs"                   (@ Charlotte 49ers, 9/5 19:30Z)
 *   ESPN "Youngstown State Penguins"    → odds "Youngstown St Penguins"             (@ Kentucky Wildcats, 9/5 17:00Z)
 *   ESPN "Nicholls Colonels"            → odds "Nicholls State Colonels"            (@ Kansas State Wildcats, 9/5 23:00Z)
 *   ESPN "Louisiana Ragin' Cajuns"      → odds "Louisiana Ragin Cajuns"             (vs Lamar Cardinals, 9/6 00:00Z) — apostrophe only
 *   ESPN "Hawai'i Rainbow Warriors"     → odds "Hawaii Rainbow Warriors"            (vs UNLV Rebels, 9/6 02:00Z)    — apostrophe only
 *
 * Every one of the eight spec-listed misses IS in the odds feed under the spelling above —
 * none had to be left out. The two apostrophe cases are joined by `normTeam` alone and sit
 * in ALIASES only so the record is complete. The synthetic odds events in this file use
 * exactly those spellings (the trimmed fixture carries only the twelve games it carries).
 */

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));

type EspnGame = { id: string; home: string; away: string; start: string };
function espnGames(): EspnGame[] {
  const sb = readJson("espn-scoreboard-2026-09-05.json") as { events: Array<Record<string, unknown>> };
  return sb.events.map((ev) => {
    const comp = (ev.competitions as Array<Record<string, unknown>>)[0];
    const cs = comp.competitors as Array<{ homeAway: string; team: { displayName: string } }>;
    return {
      id: String(ev.id),
      home: cs.find((c) => c.homeAway === "home")!.team.displayName,
      away: cs.find((c) => c.homeAway === "away")!.team.displayName,
      start: String(ev.date),
    };
  });
}
function oddsEvents(): OddsEvent[] {
  return (readJson("odds-ncaaf-2026-09-05.json") as unknown[]).map(toOddsEvent).filter((e): e is OddsEvent => !!e);
}

const synth = (id: string, home: string, away: string, commence: string): OddsEvent => ({
  id,
  commence_time: commence,
  home_team: home,
  away_team: away,
  bookmakers: [],
});

describe("normTeam — one canonical form for both feeds", () => {
  it("case, punctuation, diacritics, apostrophes, St. → State, & → and", () => {
    expect(normTeam("Miami (OH) RedHawks")).toBe("miami oh redhawks");
    expect(normTeam("Hawai'i Rainbow Warriors")).toBe("hawaii rainbow warriors");
    expect(normTeam("Louisiana Ragin' Cajuns")).toBe("louisiana ragin cajuns");
    expect(normTeam("Youngstown St Penguins")).toBe("youngstown state penguins");
    expect(normTeam("Youngstown St. Penguins")).toBe("youngstown state penguins");
    expect(normTeam("Texas A&M Aggies")).toBe("texas a and m aggies");
    expect(normTeam("  San   José State  Spartans ")).toBe("san jose state spartans");
    expect(normTeam("Louisiana-Monroe Warhawks")).toBe("louisiana monroe warhawks");
  });
  it("overlapTokens drops the nickname and generic words", () => {
    expect([...overlapTokens("Sam Houston State Bearkats")]).toEqual(["sam", "houston"]);
    expect([...overlapTokens("Nicholls Colonels")]).toEqual(["nicholls"]);
    expect([...overlapTokens("The Citadel Bulldogs")]).toEqual(["citadel"]);
    expect([...overlapTokens("Ohio State Buckeyes")]).toEqual(["ohio"]);
  });
});

describe("ALIASES — each ESPN spelling resolves to the odds feed's spelling", () => {
  const cases: Array<[string, string, string, string]> = [
    // [ESPN name, odds name, opponent (same in both feeds), commence]
    ["Sam Houston Bearkats", "Sam Houston State Bearkats", "Troy Trojans", "2026-09-05T23:00:00Z"],
    ["Southern Miss Golden Eagles", "Southern Mississippi Golden Eagles", "Alcorn State Braves", "2026-09-05T21:00:00Z"],
    ["Houston Christian Huskies", "Houston Baptist Huskies", "Rice Owls", "2026-09-05T23:00:00Z"],
    ["App State Mountaineers", "Appalachian State Mountaineers", "Maine Black Bears", "2026-09-05T19:30:00Z"],
    ["SE Louisiana Lions", "Southeastern Louisiana Lions", "South Alabama Jaguars", "2026-09-05T23:00:00Z"],
    ["The Citadel Bulldogs", "Citadel Bulldogs", "Charlotte 49ers", "2026-09-05T19:30:00Z"],
    ["Youngstown State Penguins", "Youngstown St Penguins", "Kentucky Wildcats", "2026-09-05T17:00:00Z"],
    ["Nicholls Colonels", "Nicholls State Colonels", "Kansas State Wildcats", "2026-09-05T23:00:00Z"],
  ];
  it("the table carries the eight spec-listed misses with the spellings found in the raw capture", () => {
    for (const [espn, odds] of cases) expect(ALIASES[espn]).toBe(odds);
    expect(Object.keys(ALIASES)).toHaveLength(10);
  });
  it.each(cases)("%s ↔ %s matches (alias tier), away or home", (espn, odds, opp, commence) => {
    // as the away team (the raw capture's orientation for six of the eight)
    const away = [synth("x1", opp, odds, commence), synth("decoy", opp, "Alabama Crimson Tide", "2026-09-12T19:30:00Z")];
    const used = new Set<string>();
    const m1 = matchOddsEvent({ home: opp, away: espn, start: commence.replace(":00Z", "Z") }, away, used);
    expect(m1?.id).toBe("x1");
    // as the home team
    const home = [synth("x2", odds, opp, commence)];
    const m2 = matchOddsEvent({ home: espn, away: opp, start: commence }, home, new Set());
    expect(m2?.id).toBe("x2");
  });
  it("the two apostrophe-only names join with or without the alias", () => {
    const evs = [synth("h", "Hawaii Rainbow Warriors", "UNLV Rebels", "2026-09-06T02:00:00Z"), synth("l", "Louisiana Ragin Cajuns", "Lamar Cardinals", "2026-09-06T00:00:00Z")];
    expect(matchOddsEvent({ home: "Hawai'i Rainbow Warriors", away: "UNLV Rebels", start: "2026-09-06T02:00Z" }, evs, new Set())?.id).toBe("h");
    expect(matchOddsEvent({ home: "Louisiana Ragin' Cajuns", away: "Lamar Cardinals", start: "2026-09-06T00:00Z" }, evs, new Set())?.id).toBe("l");
    expect(normTeam(ALIASES["Hawai'i Rainbow Warriors"])).toBe(normTeam("Hawai'i Rainbow Warriors"));
  });
});

describe("matchOddsEvent on the fixtures — 12 of 12 match, the two 9/12 events stay unmatched", () => {
  const games = espnGames();
  const odds = oddsEvents();
  it("the fixture holds 12 ESPN games and 14 odds events", () => {
    expect(games).toHaveLength(12);
    expect(odds).toHaveLength(14);
  });
  it("every ESPN game finds its own odds event; no id is used twice", () => {
    const used = new Set<string>();
    const ids: string[] = [];
    for (const g of games) {
      const m = matchOddsEvent(g, odds, used);
      expect(m, `${g.away} @ ${g.home}`).not.toBeNull();
      expect(normTeam(m!.home_team)).toBe(normTeam(g.home));
      expect(normTeam(m!.away_team)).toBe(normTeam(g.away));
      expect(ptDateOf(m!.commence_time)).toBe(ptDateOf(g.start));
      ids.push(m!.id);
    }
    expect(new Set(ids).size).toBe(12);
    expect(used.size).toBe(12);
    const leftover = odds.filter((e) => !used.has(e.id));
    expect(leftover.map((e) => `${e.away_team} @ ${e.home_team}`).sort()).toEqual(["Cal Poly Mustangs @ San Jose State Spartans", "Missouri Tigers @ Kansas Jayhawks"]);
    for (const e of leftover) expect(e.commence_time).toBe("2026-09-12T00:00:00Z");
  });
});

describe("matchOddsEvent tiers and guards (synthetic names — the mechanism, not the feed)", () => {
  it("tier 3: one exact side + a non-generic token overlap inside the window", () => {
    const evs = [synth("f", "Kansas State Wildcats", "Nicholls Colonels FC", "2026-09-05T23:00:00Z")];
    const m = matchOddsEvent({ home: "Kansas State Wildcats", away: "Nicholls Colonels", start: "2026-09-05T23:00Z" }, evs, new Set());
    expect(m?.id).toBe("f");
  });
  it("tier 3 refuses a kickoff outside CFB_MODEL.matchWindowMs or on another Pacific date", () => {
    const far = [synth("far", "Kansas State Wildcats", "Nicholls Colonels FC", "2026-09-06T04:00:00Z")]; // 5 h later, still 9/5 PT
    expect(matchOddsEvent({ home: "Kansas State Wildcats", away: "Nicholls Colonels", start: "2026-09-05T23:00Z" }, far, new Set())).toBeNull();
    const nextDay = [synth("nd", "Kansas State Wildcats", "Nicholls Colonels FC", "2026-09-06T08:00:00Z")];
    expect(matchOddsEvent({ home: "Kansas State Wildcats", away: "Nicholls Colonels", start: "2026-09-06T06:30Z" }, nextDay, new Set())).toBeNull();
  });
  it("tier 3 needs a NON-generic token — a shared 'State' is not a match", () => {
    const evs = [synth("g", "Kansas State Wildcats", "Portland State Vikings", "2026-09-05T23:00:00Z")];
    expect(matchOddsEvent({ home: "Kansas State Wildcats", away: "Nicholls Colonels", start: "2026-09-05T23:00Z" }, evs, new Set())).toBeNull();
  });
  it("a used id is never handed out again", () => {
    const evs = [synth("only", "Alabama Crimson Tide", "East Carolina Pirates", "2026-09-05T16:00:00Z")];
    const used = new Set<string>(["only"]);
    expect(matchOddsEvent({ home: "Alabama Crimson Tide", away: "East Carolina Pirates", start: "2026-09-05T16:00Z" }, evs, used)).toBeNull();
  });
  it("among exact matches the nearest kickoff wins", () => {
    const evs = [synth("later", "A Team", "B Team", "2026-10-03T16:00:00Z"), synth("now", "A Team", "B Team", "2026-09-05T16:00:00Z")];
    expect(matchOddsEvent({ home: "A Team", away: "B Team", start: "2026-09-05T16:00Z" }, evs, new Set())?.id).toBe("now");
  });
  it("toOddsEvent rejects unusable shapes and keeps finite prices only", () => {
    expect(toOddsEvent(null)).toBeNull();
    expect(toOddsEvent({ id: "x" })).toBeNull();
    const e = toOddsEvent({
      id: "ok",
      commence_time: "2026-09-05T16:00:00Z",
      home_team: "H",
      away_team: "A",
      bookmakers: [{ key: "b", title: "B", markets: [{ key: "h2h", outcomes: [{ name: "H", price: -110 }, { name: "A", price: "bad" }] }] }],
    });
    expect(e?.bookmakers[0].markets[0].outcomes).toEqual([{ name: "H", price: -110 }]);
  });
});
