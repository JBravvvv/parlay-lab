import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CFB_PROP_MARKETS } from "@/lib/cfb/props-types";
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
    expect(props).toMatch(/import \{ CFB_PROPS_STALE_MS, cfbPropsQueryKey, loadCfbProps \} from "@\/lib\/cfb\/client"/);
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
  it("the props query never polls (no refetchInterval) and is stale for the route's window", () => {
    expect(props).not.toMatch(/refetchInterval/);
    expect(props).toMatch(/staleTime: PROPS_STALE_MS/);
    expect(props).toMatch(/const PROPS_STALE_MS = CFB_PROPS_STALE_MS;/);
    expect(read("src/lib/cfb/client.ts")).toMatch(/CFB_PROPS_STALE_MS = CFB_PROPS\.revalidateSec \* 1000/);
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
