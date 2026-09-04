import { describe, expect, it } from "vitest";
import fs from "node:fs";

/**
 * CLICK-ANY-PLAYER — integration wiring (2026-09-03). The player lane shipped the
 * profile sheet and wired Stats / Board / Builder / Sharp; this pass wires the
 * rebuilt Parlay Builder and the new Games surfaces. Source-scan pins: each
 * surface must import the tappable name and render it where the player's name
 * prints, and the surfaces that have MLB ids must pass them (a boxscore player
 * carries person.id; a propBoard row does not, so it falls back to name + team).
 */
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("player sheet wiring: Parlay Builder + Games", () => {
  it("every Games / Parlay Builder surface imports and renders PlayerName / BoardLabel", () => {
    for (const f of [
      "app/games/page.tsx",
      "src/components/games/BoxHeader.tsx",
      "src/components/games/BattingBox.tsx",
      "src/components/games/PitchingBox.tsx",
      "src/components/props/PlayerRow.tsx",
      "src/components/props/Slip.tsx",
    ]) {
      expect(read(f), `${f} must import the tappable name`).toMatch(/from "@\/components\/player\/PlayerName"/);
      expect(read(f), `${f} must render it`).toMatch(/<(PlayerName|BoardLabel)\b/);
    }
  });

  it("box score names pass the feed's MLB id (batters, pitchers, W/L/S, probables)", () => {
    expect(read("src/components/games/BattingBox.tsx")).toMatch(/<PlayerName id=\{b\.id\} name=\{b\.name\}>/);
    expect(read("src/components/games/PitchingBox.tsx")).toMatch(/<PlayerName id=\{p\.id\} name=\{p\.name\}>/);
    expect(read("src/components/games/PitchingBox.tsx")).toMatch(/<PlayerName id=\{t\.probable\.id\} name=\{t\.probable\.name\}/);
    const header = read("src/components/games/BoxHeader.tsx");
    for (const k of ["w", "l", "s"]) expect(header).toMatch(new RegExp(`<PlayerName id=\\{d\\.${k}\\.id\\} name=\\{d\\.${k}\\.name\\}>`));
    expect(header).toMatch(/<PlayerName id=\{p\.id\} name=\{p\.name\} \/>/);
  });

  it("games list: probables and W/L/S decisions are tappable by id", () => {
    const page = read("app/games/page.tsx");
    expect(page).toMatch(/const pitcherLine = \(p: \{ id: number; name: string;/);
    expect(page).toMatch(/<PlayerName id=\{p\.id\} name=\{p\.name\}>/);
    expect(page).toMatch(/<PlayerName id=\{g\.decisions\.s\.id\} name=\{g\.decisions\.s\.name\}>/);
    // the list card is a <Link>; the name must not also navigate
    expect(read("src/components/player/PlayerName.tsx")).toMatch(/e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*fire\(\);/);
  });

  it("Parlay Builder: the player row passes name + team (propBoard rows carry no MLB id); slip legs use BoardLabel", () => {
    expect(read("src/components/props/PlayerRow.tsx")).toMatch(/<PlayerName name=\{r\.p\} team=\{r\.tm\}/);
    expect(read("src/components/props/Slip.tsx")).toMatch(/<BoardLabel label=\{l\.label\} \/>/);
  });
});
