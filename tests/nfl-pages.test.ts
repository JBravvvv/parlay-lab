import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * NFL PAGES + THEME PINS (2026-09-08, builder H) — source-scan guards that the NFL desk is wired
 * into every page BELOW the pinned CFB branch (never inside it), wears its own blue accent
 * (`--color-nfl`, the `.is-nfl` twins, the widened tone unions), deep-links on `?nfl=1`, and never
 * carries a `cfb=1` href. Mirrors tests/cfb-separation.test.ts' PAGES loop for the third desk.
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** page → [NFL surface, its CFB twin]; the NFL branch must come after the CFB one */
const PAGES: Record<string, [nfl: string, cfb: string]> = {
  "app/board/page.tsx": ["NflPicksBoard", "CfbPicksBoard"],
  "app/builder/page.tsx": ["NflBuilder", "CfbBuilder"],
  "app/props/page.tsx": ["NflProps", "CfbProps"],
  "app/ledger/page.tsx": ["NflLedger", "CfbLedger"],
  "app/sharp/page.tsx": ["NflSharp", "CfbSharp"],
  "app/games/page.tsx": ["NflGames", "CfbGames"],
  "app/stats/page.tsx": ["NflFpiPanel", "CfbFpiPanel"],
  "app/settings/page.tsx": ["NflBankPanel", "CfbBankPanel"],
};

/** the NFL branch of a page: from its gate to the NFL surface's open tag (settings/stats gate inline) */
function nflBranch(src: string, nfl: string): string {
  const gate = src.search(/if \((?:NFL_ENABLED && (?:desk|sport) === "nfl"|nflDesk)\) \{/);
  const open = src.indexOf(`<${nfl}`);
  expect(open, `<${nfl} must render`).toBeGreaterThan(-1);
  return src.slice(gate > -1 ? gate : Math.max(0, open - 1200), open + nfl.length + 200);
}

describe("every page is wired to the NFL desk, below the CFB branch", () => {
  for (const [file, [nfl, cfb]] of Object.entries(PAGES)) {
    const src = read(file);
    it(`${file} imports ${nfl} from @/components/nfl and gates it on NFL_ENABLED + the nfl desk`, () => {
      expect(src).toMatch(new RegExp(`import \\{[^}]*\\b${nfl}\\b[^}]*\\} from "@/components/nfl/${nfl}"`));
      expect(src).toMatch(new RegExp(`<${nfl}\\b`));
      expect(src).toMatch(/NFL_ENABLED/);
      expect(src).toMatch(/(?:desk|sport) === "nfl"/);
    });
    it(`${file}: the NFL branch renders AFTER the CFB branch (the CFB pins slice up to <${cfb} />)`, () => {
      const cfbAt = src.indexOf(`<${cfb}`);
      const nflAt = src.indexOf(`<${nfl}`);
      expect(cfbAt).toBeGreaterThan(-1);
      expect(nflAt).toBeGreaterThan(cfbAt);
      // the NFL surface never sits inside the CFB gate's block
      const cfbGate = src.search(/if \((?:CFB_ENABLED && (?:desk|sport) === "cfb"|cfbDesk)\) \{/);
      if (cfbGate > -1) expect(nflAt).toBeGreaterThan(src.indexOf(`<${cfb}`, cfbGate));
    });
    it(`${file} carries the National Football League eyebrow`, () => {
      expect(src).toMatch(/eyebrow=(?:"National Football League"|\{[^}]*"National Football League")/);
    });
    it(`${file}: no cfb=1 inside the NFL branch`, () => {
      expect(nflBranch(src, nfl)).not.toMatch(/cfb=1/);
    });
  }
  it("every page except settings/stats (inline gates) wears the 🏈 NFL chip in the NFL blue", () => {
    for (const file of Object.keys(PAGES)) {
      const src = read(file);
      expect(src, file).toMatch(/function NflChip\(\)/);
      expect(src, file).toMatch(/border-nfl\/40 bg-nfl\/10 [^"]*text-nfl">\s*🏈 NFL/);
      expect(src, file).toMatch(/<NflChip \/>/);
      // the CFB chip is untouched beside it
      expect(src, file).toMatch(/function CfbChip\(\)/);
    }
  });
  it("settings shows the NFL bank below the College Football bank, both gated on their own flag", () => {
    const src = read("app/settings/page.tsx");
    expect(src).toMatch(/\{CFB_ENABLED && \(\n\s*<Panel title="College Football bank">\n\s*<CfbBankPanel \/>/);
    expect(src).toMatch(/\{NFL_ENABLED && \(\n\s*<Panel title="NFL bank">\n\s*<NflBankPanel \/>/);
    expect(src.indexOf('<Panel title="NFL bank">')).toBeGreaterThan(src.indexOf('<Panel title="College Football bank">'));
  });
  it("games: the NFL desk never spends an MLB games fetch", () => {
    const src = read("app/games/page.tsx");
    expect(src).toMatch(/const nflDesk = NFL_ENABLED && sport === "nfl";/);
    expect(src).toMatch(/enabled: !cfbDesk && !nflDesk/);
  });
  it("props: ?nfl=1 flips the switch to NFL, beside the byte-identical ?cfb=1 lines", () => {
    const src = read("app/props/page.tsx");
    expect(src).toMatch(/const wantCfb = params\.get\("cfb"\) === "1"/);
    expect(src).toMatch(/if \(CFB_ENABLED && wantCfb\) setSport\("cfb"\)/);
    expect(src).toMatch(/const wantNfl = params\.get\("nfl"\) === "1"/);
    expect(src).toMatch(/if \(NFL_ENABLED && wantNfl\) setSport\("nfl"\)/);
  });
  it("stats: its own NFL slate query + a SEPARATE blue FPI overlay; the CFB overlay line is byte-identical and CfbFpiPanel appears once", () => {
    const src = read("app/stats/page.tsx");
    expect(src).toMatch(/const nflDesk = NFL_ENABLED && desk === "nfl";/);
    expect(src).toMatch(/import \{ useNflBankroll \} from "@\/lib\/nfl\/useNflDesk"/);
    expect(src).toMatch(/import \{ NFL_STALE_MS, nflQueryKey, loadNflSlate \} from "@\/lib\/nfl\/client"/);
    expect(src).toMatch(/import \{ NFL_BANK_BASE \} from "@\/lib\/nfl\/rules"/);
    expect(src).toMatch(/queryKey: nflQueryKey\(today, nflBankroll \?\? NFL_BANK_BASE\)/);
    expect(src).toMatch(/staleTime: NFL_STALE_MS/);
    expect(src).toMatch(/enabled: nflDesk && nflBankroll != null/);
    expect(src).toMatch(/<Overlay open=\{fpi\.open\} onClose=\{fpi\.hide\} size="sixty" tone="cfb" title="ESPN FPI">/);
    expect(src).toMatch(/\{nflDesk && \(\n\s*<Overlay open=\{fpi\.open\} onClose=\{fpi\.hide\} size="sixty" tone="nfl" title="ESPN FPI">/);
    expect([...src.matchAll(/<CfbFpiPanel\b/g)]).toHaveLength(1);
    expect([...src.matchAll(/<NflFpiPanel\b/g)]).toHaveLength(1);
    const nflTag = src.slice(src.indexOf("<NflFpiPanel"), src.indexOf("/>", src.indexOf("<NflFpiPanel")));
    expect(nflTag).toMatch(/\bbare\b/);
    expect(nflTag).toMatch(/\bsearchable\b/);
    expect(nflTag).toMatch(/limit=\{40\}/);
    expect(nflTag).toMatch(/teams=\{nflSlate\?\.games\.flatMap/);
    // the FPI pill opens for either football desk, in the desk's colour
    expect(src).toMatch(/\{\(cfbDesk \|\| nflDesk\) && \(/);
    expect(src).toMatch(/"border-nfl\/40 bg-nfl\/10 text-nfl hover:bg-nfl\/20 hover:border-nfl\/60"/);
    expect(src).toMatch(/nflDesk \? "ESPN NFL stats \+ FPI, live"/);
  });
  it("the NFL component tree carries no cfb=1 href", () => {
    const dir = path.join(ROOT, "src/components/nfl");
    for (const f of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/cfb=1/);
  });
});

describe("the landing page offers the NFL desk", () => {
  const src = read("app/page.tsx");
  it("DESKS lists mlb, cfb, nfl in order with a tone map (blue ring + text-nfl for the NFL card)", () => {
    expect(src).toMatch(/\{ sport: "mlb", blurb:/);
    expect(src).toMatch(/\{ sport: "cfb", blurb:/);
    expect(src).toMatch(/\{ sport: "nfl", blurb: "Consensus lines \+ ESPN FPI · ML, spread, total · own ledger & bank · Sundays, TNF, MNF" \}/);
    expect(src.indexOf('sport: "nfl"')).toBeGreaterThan(src.indexOf('sport: "cfb"'));
    expect(src).toMatch(/nfl: \{ ring: "shadow-\[inset_0_0_0_1px_rgba\(79,140,255,0\.55\)\]", text: "text-nfl" \}/);
    expect(src).not.toMatch(/const amber = d\.sport === "cfb"/);
  });
  it("three cards fit 375px as 2 + 1 (the last spans the row), three across from sm", () => {
    expect(src).toMatch(/grid-cols-2 gap-2\.5 \[&>\*:last-child\]:col-span-2 sm:grid-cols-3 sm:\[&>\*:last-child\]:col-span-1/);
  });
  it("the hero copy names all three desks", () => {
    expect(src).toMatch(/for MLB, College Football &amp; the NFL/);
  });
});

describe("theme — the NFL blue and its .is-nfl twins", () => {
  const css = read("app/globals.css");
  it("--color-nfl sits inside the @theme block beside --color-cfb (so text-nfl / bg-nfl / border-nfl utilities exist)", () => {
    const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}", css.indexOf("@theme {")));
    expect(theme).toMatch(/--color-cfb: #f5a524;/);
    expect(theme).toMatch(/--color-nfl: #4f8cff;/);
    // distinct from the CFB amber and the MLB lime
    expect(theme).not.toMatch(/--color-nfl: #f5a524/);
    expect(theme).not.toMatch(/--color-nfl: #b6ff3d/);
  });
  it("every .is-cfb rule has an .is-nfl twin", () => {
    for (const twin of [
      /\.segmented-thumb\.is-nfl \{ --seg-accent: var\(--color-nfl\); \}/,
      /\.stat-tile\.is-nfl \{ --tile-glint: rgba\(79, 140, 255, 0\.16\); \}/,
      /\.rail-glow\.is-nfl \{ --rail-accent: var\(--color-nfl\); \}/,
      /\.odds-grid\.is-nfl \{ --odds-accent: var\(--color-nfl\); \}/,
      /\.odds-grid\.is-nfl \.odds-cell \{ --odds-accent: var\(--color-nfl\); \}/,
      /\.hero-price\.is-nfl \{ color: var\(--color-nfl\); text-shadow: 0 0 24px rgba\(79, 140, 255, 0\.35\); \}/,
      /\.sheet-60\.is-nfl, \.sheet-full\.is-nfl \{ --sheet-accent: var\(--color-nfl\); \}/,
    ]) expect(css).toMatch(twin);
    // and the CFB originals are untouched
    expect(css).toMatch(/\.segmented-thumb\.is-cfb \{ --seg-accent: var\(--color-cfb\); \}/);
    expect(css).toMatch(/\.sheet-60\.is-cfb, \.sheet-full\.is-cfb \{ --sheet-accent: var\(--color-cfb\); \}/);
  });
  it("the tone unions of the shared primitives include \"nfl\"", () => {
    const seg = read("src/components/ui/Segmented.tsx");
    expect(seg).toMatch(/tone\?: "pos" \| "cfb" \| "nfl";/);
    expect(seg).toMatch(/tone === "nfl" \? "text-nfl"/);
    expect(seg).toMatch(/tone === "nfl" \? "is-nfl"/);
    const tile = read("src/components/ui/StatTile.tsx");
    expect(tile).toMatch(/export type StatTone = "pos" \| "neg" \| "gold" \| "cfb" \| "nfl" \| "muted";/);
    expect(tile).toMatch(/nfl: "text-nfl",/);
    expect(tile).toMatch(/nfl: "is-nfl"/);
    const grid = read("src/components/ui/OddsGrid.tsx");
    expect(grid).toMatch(/tone\?: "pos" \| "cfb" \| "nfl";/);
    expect(grid).toMatch(/tone === "nfl" \? "is-nfl"/);
    const meter = read("src/components/ui/EdgeMeter.tsx");
    expect(meter).toMatch(/tone\?: "pos" \| "cfb" \| "nfl";/);
    expect(meter).toMatch(/tone === "nfl" \? "bg-nfl"/);
    const overlay = read("src/components/ui/Overlay.tsx");
    expect(overlay).toMatch(/tone\?: "pos" \| "cfb" \| "nfl" \| "gold";/);
    expect(overlay).toMatch(/nfl: "is-nfl",/);
  });
  it("SportSwitch maps the nfl desk to the nfl tone", () => {
    expect(read("src/components/shell/SportSwitch.tsx")).toMatch(/sport === "nfl" \? "nfl"/);
  });
});
