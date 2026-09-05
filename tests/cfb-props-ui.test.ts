import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CFB_PROP_MARKETS } from "@/lib/cfb/props-types";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { addCfbLeg, type CfbSlipLeg } from "@/components/cfb/CfbSlip";

/**
 * CFB PLAYER PROPS UI PINS (INSTRUCTION 39, 2026-09-05) — source scans on the sandbox
 * (CfbProps) and its slip (CfbSlip), plus a pure test of the slip's clash helper.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const props = read("src/components/cfb/CfbProps.tsx");
const slip = read("src/components/cfb/CfbSlip.tsx");

describe("CfbProps — wiring", () => {
  it("imports loadCfbProps (and the query key) from the CFB client", () => {
    expect(props).toMatch(/import \{ CFB_PROPS_STALE_MS, cfbCacheLabel, cfbPricedAtLabel, cfbPropsQueryKey, cfbPropsStaleMs, loadCfbProps \} from "@\/lib\/cfb\/client"/);
    expect(props).toMatch(/loadCfbProps\(date, \{ bankroll \}\)/);
  });
  it("imports CFB_PROP_MARKETS and builds the market nav from it", () => {
    expect(props).toMatch(/CFB_PROP_MARKETS[^\n]*from "@\/lib\/cfb\/props-types"/);
    expect(props).toMatch(/CFB_PROP_MARKETS\.map\(\(m\) => \(\{ key: m\.id, label: m\.label\.toUpperCase\(\) \}\)\)/);
  });
  it("renders SIDES plus every market label", () => {
    expect(props).toMatch(/label: "SIDES"/);
    /* the nav renders m.label.toUpperCase() for each entry — the six labels the contract names */
    const labels = CFB_PROP_MARKETS.map((m) => m.label);
    expect(labels).toEqual(["Anytime TD", "Pass TDs", "Pass Yds", "Receptions", "Rush Yds", "Rec Yds"]);
    expect(CFB_PROP_MARKETS.map((m) => m.odds)).toEqual([
      "player_anytime_td",
      "player_pass_tds",
      "player_pass_yds",
      "player_receptions",
      "player_rush_yds",
      "player_reception_yds",
    ]);
    /* the prop leg's market label and the empty state's market name both read the same table */
    expect(props).toMatch(/marketLabel: marketMeta\(row\.market\)\.label/);
  });
  it("the props query never polls (no refetchInterval) and is stale for the board's own window (ttlSec, else the route's 2 h)", () => {
    expect(props).not.toMatch(/refetchInterval/);
    // 2026-09-05 (INSTRUCTION 40): a live board says ttlSec 600 — the query must not sit on it for 2 h
    expect(props).toMatch(/staleTime: \(q\) => propsStaleMs\(q\.state\.data\)/);
    // 2026-09-05 (review fix): staleness is what is LEFT of the window — the board's ttlSec less its age since generatedAt
    expect(props).toMatch(/function propsStaleMs\(board: CfbPropsBoard \| undefined\): number \{\s*return board \? cfbPropsStaleMs\(board\) : PROPS_STALE_MS;/);
    expect(props).toMatch(/const PROPS_STALE_MS = CFB_PROPS_STALE_MS;/);
    const client = read("src/lib/cfb/client.ts");
    expect(client).toMatch(/CFB_PROPS_STALE_MS = CFB_PROPS\.revalidateSec \* 1000/);
    expect(client).toMatch(/Math\.max\(0, winMs - age\)/);
  });
  it("the props query is only enabled on a prop tab", () => {
    expect(props).toMatch(/enabled: nav !== "sides" && !!date/);
  });
  it("shows the empty state with the fetched / events counts", () => {
    expect(props).toMatch(/Caesars hasn(&apos;|')t posted player props for this slate yet/);
    expect(props).toMatch(/board\.fetched\} of \$\{board\.events\}/);
  });
  it("has a loading skeleton and a player search box", () => {
    expect(props).toMatch(/propsQ\.isPending \? \(\s*<PropSkeleton \/>/);
    expect(props).toMatch(/aria-label="Search players"/);
  });
  it("a prop leg exists only at the row's own line — a Caesars quote at another line is the dashed cell, never a slip EV", () => {
    // the row's fair lives only at row.line (props.ts point 4, nothing interpolated); the Board prints EV "—"
    // for CZ alone at 249.5 against a 245.5 consensus, so the slip must not price that leg either
    expect(props).toMatch(/function propLegOf\(row: CfbPropRow, q: CfbPropQuote\): CfbSlipLeg \| null \{\s*if \(row\.fair == null \|\| !sameLine\(q\.line, row\.line\)\) return null;/);
  });
  it("keeps the Caesars / Best price toggle on props", () => {
    expect(props).toMatch(/function propQuote\(row: CfbPropRow, mode: PriceMode\)/);
    expect(props).toMatch(/if \(mode === "cz"\) return row\.cz;\s*return row\.best \?\? row\.cz;/);
  });
});

/* INSTRUCTION 40 (2026-09-05) — Josh: "the logo sizes on the parlay builder page are so
   disproportionate to the boxes. The boxes should be smaller vertically and the logos should be
   slightly bigger". The SIDES card is now the shared OddsGrid (Caesars grammar); props are
   OddsCellButton pills. Source pins on the rebuilt file. */
describe("CfbProps — the Caesars-grammar cards (INSTRUCTION 40)", () => {
  it("builds the SIDES card on the shared OddsGrid with Spread / Money / Total columns, amber tone", () => {
    expect(props).toMatch(/import \{ OddsCellButton, OddsGrid, type OddsGridCell \} from "@\/components\/ui\/OddsGrid"/);
    expect(props).toMatch(/\{ key: "spread", label: "Spread" \},\s*\{ key: "ml", label: "Money" \},\s*\{ key: "total", label: "Total" \}/);
    expect(props).toMatch(/<OddsGrid\s+tone="cfb"\s+columns=\{COLUMN_LABELS\}/);
    // two rows per card: away then home, each through sideCell → a real leg or a muted "—"
    expect(props).toMatch(/team: <TeamBlock team=\{game\.away\}/);
    expect(props).toMatch(/team: <TeamBlock team=\{game\.home\}/);
    expect(props).toMatch(/function sideCell\(/);
    expect(props).toMatch(/onClick: \(\) => onPick\(legOf\(game, row, q\)\)/);
    expect(props).toMatch(/selected: picked === row\.key/);
  });
  it("logos are the 32 px 'md' mark on the card (no 'xs' anywhere) with the rank badge, abbreviation and record", () => {
    expect(props).toMatch(/<TeamMark team=\{team\} size="md" showRank showAbbr=\{false\} \/>/);
    expect(props).not.toMatch(/size="xs"/);
    expect(props).toMatch(/team\.record \? ` · \$\{team\.record\}` : ""/);
  });
  it("a live game carries the pulsing LIVE pill with ESPN's clock and score; a final game collapses to one line with the score and no grid", () => {
    expect(props).toMatch(/function LivePill\(/);
    expect(props).toMatch(/pulse-dot[^"]*bg-live/);
    expect(props).toMatch(/if \(game\.status === "final"\) return <FinalRow game=\{game\} \/>;/);
    expect(props).toMatch(/function FinalRow\(/);
    // the final row prints both scores and the word Final, and never mounts the grid
    const finalRow = props.slice(props.indexOf("function FinalRow("), props.indexOf("function SlipGameCard("));
    expect(finalRow).toMatch(/game\.awayScore/);
    expect(finalRow).toMatch(/game\.homeScore/);
    expect(finalRow).toMatch(/>Final</);
    expect(finalRow).not.toMatch(/OddsGrid/);
    // live pills stay tappable — only final / postponed cells are disabled
    expect(props).toMatch(/const closed = game\.status === "final" \|\| game\.status === "postponed";/);
    // live games sort first on the SIDES tab, finals last
    expect(props).toMatch(/g\.status === "live" \? 0 : g\.status === "final" \? 2 : 1/);
  });
  it("prop rows: initials avatar, name, team, context line, Over / Under two-button cells; anytime TD one YES pill", () => {
    expect(props).toMatch(/function Avatar\(/);
    expect(props).toMatch(/function initials\(name: string\): string/);
    expect(props).toMatch(/function propCell\(/);
    expect(props).toMatch(/<OddsCellButton key=\{r\.key\} cell=\{propCell\(r, mode, pickedKeys\.has\(r\.key\), onPick\)\} \/>/);
    expect(props).toMatch(/yes \? "w-\[74px\] grid-cols-1" : "w-\[150px\] grid-cols-2"/);
    expect(props).toMatch(/yes \? "YES" :/);
    // the empty-market game line, never a vanished card
    expect(props).toMatch(/No \{marketMeta\(market\)\.label\} lines priced for this game\./);
    expect(props).toMatch(/if \(!needle\) groupFor\(r\);/);
  });
  it("the cache footnote reads the board's own window (2 h / 10 min) and the in-play count — nothing hardcoded", () => {
    // the label is the SHARED client helper (the Board footnote reads the same one — the two surfaces can never disagree)
    expect(props).toMatch(/const cacheLabel = cfbCacheLabel;/);
    const client = read("src/lib/cfb/client.ts");
    expect(client).toMatch(/export function cfbCacheLabel\(board: Pick<CfbPropsBoard, "ttlSec">\): string/);
    expect(client).toMatch(/board\.ttlSec \?\? CFB_PROPS\.revalidateSec/);
    expect(props).toMatch(/cached \{cacheLabel\(board\)\}/);
    expect(props).toMatch(/board\.live \? ` · \$\{board\.live\} in play` : ""/);
    expect(props).not.toMatch(/PROPS_CACHE_H/);
    // a stale board says WHEN its lines were priced, never pretends they are fresh — and (2026-09-05
    // same-day follow-up, read on prod) blames the budget ONLY when the budget refused the pull
    expect(props).toMatch(/board\.stale \? ` · \$\{board\.live \|\| "some"\} in-play game[\s\S]*?show lines as priced at \$\{cfbPricedAtLabel\(board\)\}\$\{board\.budgeted \? " — today's props budget is used up" : ""\}`/);
  });
  it("phone tap floors: the market strips are the 30px Segmented with the 44px hit-44 region, the search box is 44px / 16px text (no iOS focus zoom)", () => {
    expect(props).toMatch(/<Segmented options=\{NAV_OPTIONS\}[^>]*size="md"/);
    expect(props).toMatch(/<Segmented options=\{PRICE_OPTIONS\}[^>]*size="md"/);
    expect(props).not.toMatch(/<Segmented[^>]*size="sm"/);
    expect(props).toMatch(/aria-label="Search players"[\s\S]*?className="h-11 [^"]*text-\[16px\]/);
    expect(read("src/components/ui/Segmented.tsx")).toMatch(/press hit-44 relative/);
    const css = read("app/globals.css");
    expect(css).toMatch(/\.hit-44::before \{[^}]*height: 44px/);
  });
  it("phone-first: the market strip is the shared chip-row (no page-level sideways scroll); every price is an .odds-cell (≥ 44 px by CSS)", () => {
    expect(props).toMatch(/className="chip-row -mx-4 px-4 md:mx-0 md:px-0"/);
    expect(props).not.toMatch(/overflow-x-auto/);
    const css = read("app/globals.css");
    expect(css).toMatch(/\.odds-cell \{[^}]*min-height: 44px/);
  });
  it("the 'capped at N' footnote reads CFB_PROPS.maxEvents, never a literal (INSTRUCTION 42, 2026-09-05: 12 → 60)", () => {
    expect(props).toMatch(/capped at \$\{CFB_PROPS\.maxEvents\}/);
    expect(props).not.toMatch(/capped at 12/);
    expect(CFB_PROPS.maxEvents).toBe(60);
    expect(CFB_PROPS.liveMaxEvents).toBe(24);
  });
  it("no history-pushing navigation and no blur filter anywhere in the file", () => {
    expect(props).not.toMatch(/router\.push/);
    expect(props).not.toMatch(/<Link/);
    expect(props).not.toMatch(/backdrop/);
  });
});

describe("CfbProps — prop rows use no backdrop-filter (iOS freeze rule)", () => {
  const start = props.indexOf("/* prop-rows:start");
  const end = props.indexOf("/* prop-rows:end */");
  it("the row section is bracketed", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });
  it("no glass / backdrop classes inside the row markup", () => {
    const rows = props.slice(start, end);
    expect(rows).not.toMatch(/backdrop/);
    expect(rows).not.toMatch(/\bglass\b/);
    expect(rows).toMatch(/function PropRow\(/);
    expect(rows).toMatch(/function PropGameGroup\(/);
  });
  it("the market nav bar carries no backdrop-blur either", () => {
    expect(props).not.toMatch(/backdrop-blur/);
  });
});

describe("CfbSlip — accepts prop legs", () => {
  it('the leg type has kind "side" | "prop" with player + market label', () => {
    expect(slip).toMatch(/kind: "side" \| "prop";/);
    expect(slip).toMatch(/player\?: string \| null;/);
    expect(slip).toMatch(/marketLabel\?: string;/);
  });
  it("renders the prop's market label on the leg line", () => {
    expect(slip).toMatch(/l\.kind === "prop" \? l\.marketLabel \?\? l\.market/);
  });
  it("exports addCfbLeg", () => {
    expect(slip).toMatch(/export function addCfbLeg\(/);
  });
});

const side = (over: Partial<CfbSlipLeg> = {}): CfbSlipLeg => ({
  kind: "side",
  key: "g1|spread|home|-3.5",
  gameId: "g1",
  label: "Alabama -3.5",
  sub: "ECU @ ALA · Sat 9:00 AM",
  market: "spread",
  cz: -110,
  book: "CZ",
  prob: 52.1,
  ...over,
});

const prop = (over: Partial<CfbSlipLeg> = {}): CfbSlipLeg => ({
  kind: "prop",
  key: "g1|pass_yds|ty-simpson|over|245.5",
  gameId: "g1",
  label: "Ty Simpson O 245.5",
  sub: "ECU @ ALA · Sat 9:00 AM",
  market: "pass_yds",
  marketLabel: "Pass Yds",
  player: "Ty Simpson",
  cz: -115,
  book: "CZ",
  prob: 55,
  ...over,
});

describe("addCfbLeg — the slip's clash rules", () => {
  it("adds a prop to an empty slip", () => {
    const r = addCfbLeg([], prop());
    expect(r.note).toBeNull();
    expect(r.legs.map((l) => l.key)).toEqual([prop().key]);
  });
  it("tapping the same leg again removes it (toggle)", () => {
    const r = addCfbLeg([prop()], prop());
    expect(r.note).toBeNull();
    expect(r.legs).toEqual([]);
  });
  it("refuses the same player twice — even the other side, or another market", () => {
    const under = prop({ key: "g1|pass_yds|ty-simpson|under|245.5", label: "Ty Simpson U 245.5" });
    const r1 = addCfbLeg([prop()], under);
    expect(r1.legs).toEqual([prop()]);
    expect(r1.note).toMatch(/Ty Simpson is already on the slip/);
    const tds = prop({ key: "g1|pass_tds|ty-simpson|over|1.5", market: "pass_tds", marketLabel: "Pass TDs", label: "Ty Simpson O 1.5" });
    const r2 = addCfbLeg([prop()], tds);
    expect(r2.legs).toEqual([prop()]);
    expect(r2.note).toMatch(/one leg per player/);
  });
  it("player match is case- and whitespace-insensitive", () => {
    const r = addCfbLeg([prop()], prop({ key: "other", player: "  ty simpson " }));
    expect(r.legs).toHaveLength(1);
    expect(r.note).not.toBeNull();
  });
  it("allows a prop and a side on the same game, in either order", () => {
    const a = addCfbLeg([prop()], side());
    expect(a.note).toBeNull();
    expect(a.legs.map((l) => l.kind)).toEqual(["prop", "side"]);
    const b = addCfbLeg([side()], prop());
    expect(b.note).toBeNull();
    expect(b.legs.map((l) => l.kind)).toEqual(["side", "prop"]);
  });
  it("a new side on a game replaces the old side but keeps that game's props", () => {
    const ml = side({ key: "g1|ml|away|", label: "East Carolina ML", market: "ml", cz: 240 });
    const r = addCfbLeg([prop(), side()], ml);
    expect(r.note).toBeNull();
    expect(r.legs.map((l) => l.key)).toEqual([prop().key, ml.key]);
  });
  it("two different players on one game are both allowed", () => {
    const rb = prop({ key: "g1|rush_yds|jam-miller|over|80.5", player: "Jam Miller", market: "rush_yds", marketLabel: "Rush Yds", label: "Jam Miller O 80.5" });
    const r = addCfbLeg([prop()], rb);
    expect(r.note).toBeNull();
    expect(r.legs).toHaveLength(2);
  });
  it("the same player name on a different game is a different leg", () => {
    const r = addCfbLeg([prop()], prop({ key: "g2|pass_yds|ty-simpson|over|200.5", gameId: "g2" }));
    expect(r.note).toBeNull();
    expect(r.legs).toHaveLength(2);
  });
  it("never mutates the previous slip", () => {
    const prev = [prop()];
    addCfbLeg(prev, side());
    addCfbLeg(prev, prop({ key: "x", player: "Ty Simpson" }));
    expect(prev).toHaveLength(1);
  });
});
