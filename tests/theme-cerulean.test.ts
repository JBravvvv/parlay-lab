import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CERULEAN ON GRAPHITE (2026-09-18). Josh: "Lets change the theme to Cerulean Blue. I think the neon
 * type of color with the green & pink is what makes it too much to look at with the black
 * background. Maybe we gray the background more than black as well to dilute it and make it look
 * less like a cosmic bowling screen." One cerulean accent, a real gray ground, no pink, no green,
 * no neon. The token NAMES (acc-teal / acc-green / acc-lime, pos) stay — classes and tests key on
 * them; only their VALUES moved. The NFL blue and the CFB amber are pinned elsewhere and unchanged.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const css = read("app/globals.css");
const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}", css.indexOf("@theme {")));

/** relative luminance of a hex colour, for the "is this actually blue" checks */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const isBlueish = (hex: string) => { const [r, g, b] = rgb(hex); return b > r && b >= g; };

describe("theme — the tokens are cerulean on graphite", () => {
  it("the ground is a gray at hue 216 with ≥ 12% lightness — never the 3% near-black", () => {
    const m = theme.match(/--color-bg: hsl\((\d+) (\d+)% (\d+)%\);/)!;
    expect(m, "bg is an hsl token").toBeTruthy();
    expect(Number(m[1])).toBe(216);
    expect(Number(m[2])).toBeLessThanOrEqual(12); // low saturation: gray, not navy
    expect(Number(m[3])).toBeGreaterThanOrEqual(12);
    for (const t of ["surface", "surface-2", "surface-3", "line", "line-2", "text", "hero-sub", "muted", "faint"]) {
      expect(theme, t).toMatch(new RegExp(`--color-${t}: hsl\\(216 `));
    }
  });
  it("pos and the three brand tokens are blue; no pink, purple or green value survives", () => {
    const pos = theme.match(/--color-pos: (#[0-9a-f]{6});/i)![1];
    expect(pos).toBe("#3ab0e8");
    for (const t of ["acc-teal", "acc-green", "acc-lime"]) {
      const v = theme.match(new RegExp(`--color-${t}: (#[0-9a-f]{6});`, "i"))![1];
      expect(isBlueish(v), `${t} = ${v}`).toBe(true);
    }
    expect(theme).not.toMatch(/#ff5fb8|#ec4899|#a855f7|#b6ff3d|#ff5c45/i);
    expect(theme).toMatch(/--color-neg: #f2664f;/);
    expect(theme).toMatch(/--color-live: #b794f6;/); // lavender — ice blue would vanish into cerulean
    expect(theme).toMatch(/--color-gold: #c79a3b;/);
    expect(theme).toMatch(/--color-cfb: #f5a524;/);
    expect(theme).toMatch(/--color-nfl: #4f8cff;/);
  });
  it("no pink literal is left anywhere in the stylesheet, and the brand gradient is blue", () => {
    expect(css).not.toMatch(/rgba\(255, ?95, ?184|#ff5fb8|#ec4899|#a855f7|hsl\(330|#ff8fd0|#ffbddf|#160a12/i);
    expect(css).toMatch(/\.text-gradient \{\n\s+background-image: linear-gradient\(to left, #2b8fd6, #3ab0e8, #8fd3f5\);/);
    expect(css).toMatch(/\.ev-glow \{\n\s+background: linear-gradient\(90deg, rgba\(58, 176, 232, 0\.13\)/);
    // the grade badge ring and the mark badges ring in the page ground, not a hard-coded near-black
    expect(css).not.toMatch(/rgba\(8, ?9, ?11/);
    expect(css).toMatch(/\.odds-cell-grade \{[^}]*box-shadow: 0 0 0 1\.5px var\(--color-bg\);/);
  });
  it("the generator studio is blue-graphite, not the pink studio", () => {
    expect(css).toMatch(/\.gen-studio \{ border-radius: 22px; background: #1a2028 !important; border-color: #3ab0e840;/);
    expect(css).toMatch(/\.gen-roll \{ gap:2px; background:linear-gradient\(110deg,#8fd3f5,#3ab0e8\);/);
  });
});

describe("theme — the surfaces around the stylesheet follow", () => {
  it("manifest + layout theme colour are the graphite ground", () => {
    expect(read("public/manifest.webmanifest")).toMatch(/"background_color": "#1e2126",\n\s+"theme_color": "#171e28"/);
    expect(read("app/layout.tsx")).toMatch(/themeColor: "#171e28"/);
  });
  it("the llama footage is hue-rotated to cerulean under a heavier scrim (the mp4 itself is untouched)", () => {
    const vb = read("src/components/shell/VideoBackdrop.tsx");
    expect(vb).toMatch(/const VIDEO_FILTER = "hue-rotate\(230deg\) saturate\(0\.8\)";/);
    expect(vb).toMatch(/style=\{\{ opacity: 0, filter: VIDEO_FILTER \}\}/);
    expect(vb).toMatch(/bg-bg\/62/);
    expect(vb).toMatch(/backdrop-llama\.mp4/);
  });
  it("no component keeps a pink rgba, the old near-black hex, or a hard-coded on-pos text colour", () => {
    for (const f of [
      "app/page.tsx", "src/components/ui/Glow.tsx", "src/components/ui/Pill.tsx", "src/components/props/MarketNav.tsx",
      "src/components/props/GenSheet.tsx", "src/components/cfb/TeamMark.tsx", "src/components/player/PlayerMark.tsx", "src/components/shell/AppShell.tsx",
    ]) {
      const s = read(f);
      expect(s, f).not.toMatch(/rgba\(255,95,184|rgba\(8,9,11|#08090b|#FF5FB8|#0b0408/i);
    }
    expect(read("src/components/cfb/TeamMark.tsx")).toMatch(/shadow-\[0_0_0_1\.5px_var\(--color-bg\)\]/);
    expect(read("src/components/player/PlayerMark.tsx")).toMatch(/shadow-\[0_0_0_1\.5px_var\(--color-bg\)\]/);
    expect(read("src/components/ui/Pill.tsx")).toMatch(/bg-pos text-bg font-bold/);
    expect(read("app/page.tsx")).toMatch(/rgba\(58,176,232,0\.55\)/);
    expect(read("src/components/shell/AppShell.tsx")).toMatch(/label: "Board", icon: IconBoard, group: "top", mobile: true, tone: "#A5B4FC"/);
  });
});
