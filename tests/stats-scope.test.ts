import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calibrationFor, scopedStatsSport, sportsFor, statsQueryEnabled } from "@/lib/stats-scope";

/**
 * STATS SCOPED PER SPORT + FPI OVERLAY (INSTRUCTION 40, 2026-09-05).
 *
 * Josh: "only that specific sports' stats need to be in the stats tab for that sport" and the
 * FPI board "can be put in a button that pops out into an overlay that covers 60% of the screen
 * and disappears when you click the 'x' in top right or click outside the borders".
 *
 * Half of this is a pure helper (src/lib/stats-scope.ts) — tested directly. The other half is
 * page wiring — pinned on the source the way tests/nav-flat.test.ts does.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("stats-scope: the desk decides which stat sports are reachable", () => {
  it("CFB desk → NCAAF only; MLB desk → MLB only", () => {
    expect(sportsFor("cfb")).toEqual(["cfb"]);
    expect(sportsFor("mlb")).toEqual(["mlb"]);
  });
  it("no desk exposes NFL or UFC today (kept wired for a future desk)", () => {
    for (const d of ["mlb", "cfb"] as const) {
      expect(sportsFor(d)).not.toContain("nfl");
      expect(sportsFor(d)).not.toContain("ufc");
    }
  });
  it("a remembered pill is honoured only inside the desk — a CFB user never lands on MLB stats", () => {
    expect(scopedStatsSport("cfb", "mlb")).toBe("cfb");
    expect(scopedStatsSport("cfb", "nfl")).toBe("cfb");
    expect(scopedStatsSport("cfb", "cfb")).toBe("cfb");
    expect(scopedStatsSport("mlb", "cfb")).toBe("mlb");
    expect(scopedStatsSport("mlb", "ufc")).toBe("mlb");
    expect(scopedStatsSport("mlb", "mlb")).toBe("mlb");
    expect(scopedStatsSport("mlb", null)).toBe("mlb");
    expect(scopedStatsSport("cfb", undefined)).toBe("cfb");
  });
  it("the MLB-model calibration view is MLB-desk only", () => {
    expect(calibrationFor("mlb")).toBe(true);
    expect(calibrationFor("cfb")).toBe(false);
  });
  it("statsQueryEnabled: off during hydration, off for UFC, off until the filters are re-cut for the table sport", () => {
    expect(statsQueryEnabled({ hydrated: false, sport: "mlb", filtersReady: true })).toBe(false);
    expect(statsQueryEnabled({ hydrated: true, sport: "ufc", filtersReady: true })).toBe(false);
    expect(statsQueryEnabled({ hydrated: true, sport: "cfb", filtersReady: false })).toBe(false);
    expect(statsQueryEnabled({ hydrated: true, sport: "cfb", filtersReady: true })).toBe(true);
    expect(statsQueryEnabled({ hydrated: true, sport: "mlb", filtersReady: true })).toBe(true);
  });
});

describe("stats page wiring", () => {
  const src = read("app/stats/page.tsx");

  it("reads the global desk and the scope helper", () => {
    expect(src).toMatch(/import \{ useSport \} from "@\/lib\/sport"/);
    expect(src).toMatch(/useSport\(\)/);
    expect(src).toMatch(/from "@\/lib\/stats-scope"/);
    expect(src).toMatch(/sportsFor\(desk\)/);
    // 2026-09-05 (review fix): the effective sport is DERIVED synchronously from the desk + the tapped pill —
    // no effect-driven re-scope, so the CFB desk never mounts the MLB feed for a frame
    expect(src).toMatch(/const \[chosen, setChosen\] = useState<SportId>\(\(\) => storedStatsSport\(\)\);/);
    expect(src).toMatch(/const sport: SportId = scopedStatsSport\(desk, chosen\);/);
    expect(src).not.toMatch(/setSport\(/);
    expect(src).not.toMatch(/applySport\(/);
    // the query waits for hydration (useSport() reports "mlb" there) and for the filters to match the table sport
    expect(src).toMatch(/enabled: statsQueryEnabled\(\{ hydrated, sport, filtersReady: filtersFor === tableSport \}\)/);
    expect(src).toMatch(/useEffect\(\(\) => setHydrated\(true\), \[\]\);/);
  });
  it("the sport pill row is derived from the desk, not a hard-coded list", () => {
    expect(src).toMatch(/deskSports\.map\(/);
    expect(src).not.toMatch(/\["mlb", "nfl", "cfb", "ufc"\]/);
  });
  it("imports the shared Overlay + useOverlay and opens it from an 'ESPN FPI' button", () => {
    expect(src).toMatch(/import \{ Overlay, useOverlay \} from "@\/components\/ui\/Overlay"/);
    expect(src).toMatch(/const fpi = useOverlay\(\)/);
    expect(src).toMatch(/onClick=\{fpi\.show\}/);
    expect(src).toMatch(/ESPN FPI<\/span>/);
    expect(src).toMatch(/<Overlay open=\{fpi\.open\} onClose=\{fpi\.hide\} size="sixty" tone="cfb" title="ESPN FPI">/);
  });
  it("CfbFpiPanel renders only inside the Overlay — never inline on the page", () => {
    const opens = [...src.matchAll(/<CfbFpiPanel\b/g)];
    expect(opens).toHaveLength(1);
    const overlayStart = src.indexOf("<Overlay ");
    const overlayEnd = src.indexOf("</Overlay>");
    expect(overlayStart).toBeGreaterThan(-1);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    expect(opens[0].index).toBeGreaterThan(overlayStart);
    expect(opens[0].index).toBeLessThan(overlayEnd);
    // the sheet body scrolls; the panel is mounted bare + searchable with the full list
    const tag = src.slice(opens[0].index, src.indexOf("/>", opens[0].index));
    expect(tag).toMatch(/\bbare\b/);
    expect(tag).toMatch(/\bsearchable\b/);
  });
  it("keeps the pl_stats_sport pill key off the global pl_sport key", () => {
    expect(src).toMatch(/"pl_stats_sport"/);
    expect(src).not.toMatch(/localStorage\.(get|set)Item\("pl_sport"/);
  });
  it("the MLB-only Pitcher vs Team tool is gated to the MLB table", () => {
    expect(src).toMatch(/\{pvtOpen && tableSport === "mlb" && <PitcherVsTeam \/>\}/);
  });
});

describe("CfbFpiPanel: bare + searchable modes, no blur", () => {
  const src = read("src/components/cfb/CfbFpiPanel.tsx");
  it("accepts bare and searchable, defaults off so The Sharp's glass panel is unchanged", () => {
    expect(src).toMatch(/bare = false/);
    expect(src).toMatch(/searchable = false/);
    expect(src).toMatch(/<Panel title=\{title\}/);
  });
  it("exports fmtFpiUpdated for the button's stamp sub-label", () => {
    expect(src).toMatch(/export function fmtFpiUpdated\(/);
  });
  it("carries no per-item blur", () => {
    expect(src).not.toMatch(/backdrop-(filter|blur)/);
  });
});
