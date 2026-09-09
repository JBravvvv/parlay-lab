import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * GAME PREVIEW UI PINS (INSTRUCTION 46, 2026-09-08). Josh's word, verbatim:
 * "'Preview' should be named 'Game Preview' and has avg, ops stats but no AB, R, H,
 * RBI, etc. it should also have batter vs pitcher matchup data on that page".
 *
 * Source scans (vitest here has no JSX runtime — the tests/calc-ui.test.ts pattern)
 * on the box page, the two new preview components, the pregame pitching line and
 * the route. The shaping itself is tested on real fixtures in tests/boxscore.test.ts.
 */
const read = (rel: string) => stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

/** every `<th …>…</th>` text in a file */
const headerCells = (src: string) => [...src.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/\s+/g, " ").trim());

describe("Game Preview page — app/games/[gamePk]/page.tsx", () => {
  const page = read("app/games/[gamePk]/page.tsx");
  it("is titled 'Game Preview' until first pitch and 'Box Score' after", () => {
    expect(page).toMatch(/const pageTitle = g \? \(pregame \? "Game Preview" : "Box Score"\) : null;/);
    expect(page).toMatch(/<h1 [^>]*>\{pageTitle\}<\/h1>/);
  });
  it("pregame renders the PreviewBox (season AVG / OPS), otherwise the full BattingBox", () => {
    expect(page).toMatch(/import \{ PreviewBox \} from "@\/components\/games\/PreviewBox"/);
    expect(page).toMatch(/\{pregame \? <PreviewBox t=\{g\[side\]\} postponed=\{g\.status === "postponed"\} \/> : <BattingBox t=\{g\[side\]\} pregame=\{false\} \/>\}/);
  });
  it("has the Matchups section, following the away / home toggle, only when a probable is named", () => {
    expect(page).toMatch(/import \{ MatchupBox \} from "@\/components\/games\/MatchupBox"/);
    expect(page).toMatch(/const matchup = g\?\.matchups \? g\.matchups\[side\] : null;/);
    expect(page).toMatch(/const anyMatchup = !!\(g\?\.matchups && \(g\.matchups\.away \|\| g\.matchups\.home\)\);/);
    expect(page).toMatch(/\{anyMatchup && \(\s*<section className="glass min-w-0">\s*<h2 [^>]*>Matchups<\/h2>/);
    expect(page).toMatch(/<MatchupBox m=\{matchup\} abbr=\{g\[side\]\.abbr\} \/>/);
    // 2026-09-08 fix round: a null side means EITHER no probable OR the vsPlayer read failed;
    // the page must not claim "no probable" when one is named
    expect(page).toMatch(/const other = side === "away" \? "home" : "away";/);
    expect(page).toMatch(/\{g\[other\]\.probable\s*\?\s*"Matchup data unavailable right now\."\s*:\s*`\$\{g\[other\]\.abbr\} has not named a probable pitcher\.`\}/);
  });
  it("keeps the pregame 2-minute refetch so a lineup that posts shows up", () => {
    expect(page).toMatch(/s === "live" \? 30_000 : s === "upcoming" \? 120_000 : false/);
  });
});

describe("PreviewBox — the lineup with AVG / OPS and no in-game columns", () => {
  const src = read("src/components/games/PreviewBox.tsx");
  it("header cells are exactly the lineup label, AVG and OPS — no AB / R / H / RBI / BB / K", () => {
    const cells = headerCells(src);
    expect(cells).toEqual(['{t.lineupPosted ? "Lineup" : "Batters"}', "AVG", "OPS"]);
    for (const c of ["AB", "R", "H", "RBI", "BB", "K"]) expect(cells, c).not.toContain(c);
  });
  it("prints the season figures through dash() and never touches the in-game line", () => {
    expect(src).toMatch(/\{dash\(b\.avg\)\}/);
    expect(src).toMatch(/\{dash\(b\.ops\)\}/);
    expect(src).not.toMatch(/b\.(ab|r|h|rbi|bb|k)\b/);
  });
  it("says 'Lineup not posted' when the feed lists no batters, and keeps the tappable name by id", () => {
    expect(src).toMatch(/"Lineup not posted"/);
    expect(src).toMatch(/<PlayerName id=\{b\.id\} name=\{b\.name\}>/);
  });
});

describe("MatchupBox — batter vs pitcher career lines", () => {
  const src = read("src/components/games/MatchupBox.tsx");
  it("columns are AB H HR BB K AVG OPS", () => {
    expect(src).toMatch(/const COLS = \["AB", "H", "HR", "BB", "K", "AVG", "OPS"\] as const;/);
  });
  it("a hitter with no split prints 'no history' across the line — never a 0-for-0", () => {
    expect(src).toMatch(/<td colSpan=\{COLS\.length\}[^>]*>\s*no history\s*<\/td>/);
    expect(src).toMatch(/\{b\.history \? \(/);
  });
  it("names the pitcher (tappable by id) and flags an unposted lineup honestly", () => {
    expect(src).toMatch(/<PlayerName id=\{m\.pitcher\.id\} name=\{m\.pitcher\.name\}/);
    // 2026-09-08 fix round: the shaper now drops hitters no longer in the box's players map, so the caption says "on the roster"
    expect(src).toMatch(/Lineup not posted — \{abbr\} hitters on the roster with history vs this arm\./);
  });
});

describe("PitchingBox pregame — the probable's season line", () => {
  const src = read("src/components/games/PitchingBox.tsx");
  it("prints GS IP K BB HR WHIP from probableLine through dash()", () => {
    expect(src).toMatch(/const sl = t\.probableLine;/);
    for (const k of ["gs", "ip", "k", "bb", "hr", "whip"]) expect(src).toMatch(new RegExp(`dash\\(sl\\.${k}\\)`));
    expect(src).toMatch(/\["GS", dash\(sl\.gs\)\]/);
  });
});

describe("route — app/api/games/[gamePk]/route.ts fetches the two vsPlayer feeds pregame only, in parallel, free", () => {
  const src = read("app/api/games/[gamePk]/route.ts");
  it("gates on mapStatus(...) === 'upcoming' and awaits both sides together", () => {
    expect(src).toMatch(/if \(mapStatus\(game\.status\) === "upcoming"\) \{\s*const \[away, home\] = await Promise\.all\(\[vsFeed\(game, "away"\), vsFeed\(game, "home"\)\]\);/);
    expect(src).toMatch(/shapeBoxscore\(game, box, ls, vs\)/);
  });
  it("hits statsapi's vsPlayer endpoint with the OTHER club's probable vs this club, cached an hour", () => {
    expect(src).toMatch(/const pitcher = game\.teams\[side === "away" \? "home" : "away"\]\.probablePitcher;/);
    expect(src).toMatch(/\/people\/\$\{pitcher\.id\}\/stats\?stats=vsPlayer&group=pitching&opposingTeamId=\$\{teamId\}/);
    expect(src).toMatch(/const VS_REVALIDATE = 3600;/);
  });
  it("a failed matchup read returns null for that side instead of failing the box", () => {
    expect(src).toMatch(/catch \{[\s\S]*?return null;\s*\}\s*\}/);
  });
  it("talks to statsapi only — no paid API host", () => {
    const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(["statsapi.mlb.com"]));
  });
});
