import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CFB GAME CARD + BUILDER TICKETS ON THE CAESARS GRAMMAR (INSTRUCTION 40, 2026-09-05).
 * Source-level pins, the nav-flat style: the Games card is built on the shared OddsGrid, the
 * Builder lays its tickets out as a .carousel, none of the four files carry a per-item blur
 * (the iOS freeze rule), every <Link> is replace-only, and the card draws its marks at "md"
 * or "sm" — never the 18px "xs" Josh called disproportionate.
 */

const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const FILES = {
  card: "src/components/cfb/CfbGameCard.tsx",
  games: "src/components/cfb/CfbGames.tsx",
  builder: "src/components/cfb/CfbBuilder.tsx",
  ticket: "src/components/cfb/CfbTicketCard.tsx",
} as const;

const BLUR = /backdrop-filter|backdrop-blur/;

describe("cfb-card-ui — the game card is built on the shared OddsGrid", () => {
  const src = read(FILES.card);
  it("imports OddsGrid from the shared primitive and renders it in the CFB tone", () => {
    expect(src).toMatch(/import \{[^}]*\bOddsGrid\b[^}]*\} from "@\/components\/ui\/OddsGrid"/);
    expect(src).toMatch(/<OddsGrid\s[^>]*tone="cfb"/);
    expect(src).toMatch(/columns=\{\["Spread", "Money", "Total"\]\}/);
  });
  it("keeps the card's public surface (props + the helpers other CFB views import)", () => {
    for (const name of ["bookShort", "timeLabelPT", "fmtSigned", "pctOrDash", "numOrDash", "marketSides", "orderedRows", "cellLabel", "quoteText", "StatusMark", "CfbGameCard"]) {
      expect(src, `export ${name}`).toMatch(new RegExp(`export (?:function|const) ${name}\\b`));
    }
    for (const prop of ["expanded", "onToggle", "onPick", "isPicked"]) expect(src, `prop ${prop}`).toContain(prop);
  });
  it("lights a +EV Caesars cell with the \"ev\" tone and lists the grade chip inline", () => {
    expect(src).toMatch(/"ev"/);
    expect(src).toMatch(/<GradeChip/);
  });
  it("draws the live pill with the pulsing dot", () => {
    expect(src).toMatch(/pulse-dot/);
  });
  it("renders TeamMark at md or sm — never xs", () => {
    const sizes = [...src.matchAll(/<TeamMark\b[^>]*\bsize="([a-z]+)"/g)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(["md", "sm"]).toContain(s);
    expect(src).not.toMatch(/<TeamMark\b[^>]*\bsize="xs"/);
  });
});

describe("cfb-card-ui — the Builder lays its tickets out as a carousel with hero prices", () => {
  it("CfbBuilder uses the .carousel strip", () => {
    expect(read(FILES.builder)).toMatch(/className="carousel[\s"]/);
  });
  it("CfbTicketCard carries the hero-price and the favorites parlay is the amber card", () => {
    const src = read(FILES.ticket);
    expect(src).toMatch(/hero-price/);
    expect(src).toMatch(/is-cfb/);
    expect(src).toMatch(/to hit/);
    expect(src).toMatch(/pays/);
    expect(src).toMatch(/ticketPayout\(/);
  });
});

describe("cfb-card-ui — no per-item blur, no history-pushing Link", () => {
  for (const [k, f] of Object.entries(FILES)) {
    it(`${k} (${f}) carries no backdrop-filter / backdrop-blur`, () => {
      expect(read(f)).not.toMatch(BLUR);
    });
    it(`${k} (${f}) has no <Link> without replace and no router.push`, () => {
      const src = read(f);
      const links = [...src.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]);
      for (const tag of links) expect(tag, tag).toMatch(/\breplace\b/);
      expect(src).not.toMatch(/router\.push\(/);
    });
  }
});
