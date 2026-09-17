import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { BoardLabel } from "@/components/player/PlayerName";
import { clubFromLabel, teamLogo } from "@/lib/mlb-visuals";

/**
 * A MARK ON EVERY PICK (INSTRUCTION 70, 2026-09-17, Josh's word, verbatim: "It also ALWAYS needs
 * to show player headshot and/or team logo next to every single pick. If its a team ml.rl then it
 * only needs a team logo ie: Tigers ML. If its a player on the team it needs a player headshot and
 * team logo ie: Kevin McGonigle over 1.5 H+R+RBI (needs Kevins headshot and Tigers logo next to
 * pick)").
 *
 * Same runtime notes as tests/player-mark.test.ts: node, renderToStaticMarkup, React on the global;
 * useHeadshots / usePlayerImage resolve nothing on the server, so a player mark renders the initials
 * disc with the team badge — the badge and the club logo are the claims made here.
 */
vi.stubGlobal("React", React);
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("clubFromLabel — the club an ML/RL label names, or nothing", () => {
  it("full name, nickname, tag — Josh's 'Tigers ML' included", () => {
    expect(clubFromLabel("Detroit Tigers")).toBe("Detroit Tigers");
    expect(clubFromLabel("Tigers ML")).toBe("Detroit Tigers");
    expect(clubFromLabel("DET ML")).toBe("Detroit Tigers");
    expect(clubFromLabel("Boston Red Sox")).toBe("Boston Red Sox");
    expect(clubFromLabel("White Sox RL +1.5")).toBe("Chicago White Sox");
    expect(clubFromLabel("CWS ML")).toBe("Chicago White Sox");
    expect(clubFromLabel("ATH ML")).toMatch(/Athletics$/);
    expect(clubFromLabel("Blue Jays ML")).toBe("Toronto Blue Jays");
  });
  it("a player, a football side, a bare 'Sox', an empty label — nobody", () => {
    expect(clubFromLabel("Kevin McGonigle (DET)")).toBeNull();
    expect(clubFromLabel("Kevin McGonigle")).toBeNull();
    expect(clubFromLabel("Texas Longhorns")).toBeNull();
    expect(clubFromLabel("Sox ML")).toBeNull();
    expect(clubFromLabel("")).toBeNull();
    expect(clubFromLabel(null)).toBeNull();
    // a player whose surname is a club word is not a club: word-bounded, case-sensitive tag
    expect(clubFromLabel("Ari Smith")).toBeNull();
  });
});

describe("BoardLabel — a player pick draws headshot + his team's logo; a club pick draws the club's logo only", () => {
  it("'Kevin McGonigle (DET)' → one player mark with ONE Tigers badge, the tappable name, the suffix", () => {
    const out = html(createElement(BoardLabel, { label: "Kevin McGonigle (DET)" }));
    expect(count(out, /data-player-mark/g)).toBe(1);
    expect(count(out, /data-team-badge/g)).toBe(1);
    expect(out).toContain(teamLogo("det"));
    expect(out).toContain('title="Kevin McGonigle · DET"');
    expect(out).toContain("Kevin McGonigle");
    expect(out).toContain("(DET)");
    expect(out).not.toMatch(/data-team-mark/);
  });
  it("'Detroit Tigers' (an ML/RL leg) → the club's logo alone — no headshot disc, no badge", () => {
    const out = html(createElement(BoardLabel, { label: "Detroit Tigers" }));
    expect(count(out, /data-team-mark/g)).toBe(1);
    expect(out).toContain(teamLogo("det"));
    expect(out).not.toMatch(/data-player-mark/);
    expect(out).not.toMatch(/data-team-badge/);
    expect(out).toContain("Detroit Tigers");
  });
  it("the ATH / CWS spellings land on ESPN's oak / chw logos, never a broken href", () => {
    expect(html(createElement(BoardLabel, { label: "Athletics" }))).toContain(teamLogo("oak"));
    expect(html(createElement(BoardLabel, { label: "Chicago White Sox" }))).toContain(teamLogo("chw"));
  });
  it("showMark={false} keeps the text only (the parlay list draws its own mark) and an unknown label stays plain", () => {
    const off = html(createElement(BoardLabel, { label: "Detroit Tigers", showMark: false }));
    expect(off).not.toMatch(/data-team-mark|data-player-mark/);
    expect(off).toContain("Detroit Tigers");
    const none = html(createElement(BoardLabel, { label: "Over 8.5 runs" }));
    expect(none).not.toMatch(/data-team-mark|data-player-mark/);
  });
});

describe("every pick surface reaches a mark", () => {
  it("Board: the stamped / ALL-scope Pick cell draws through BoardLabel (mark + name), not a bare name", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/\{p\.player \? <BoardLabel label=\{p\.player\} \/> : null\}/);
    expect(src).not.toMatch(/<PlayerName name=\{parseBoardLabel\(p\.player\)/);
    // the live board's Pick cell already went through BoardLabel
    expect(src).toMatch(/<BoardLabel label=\{r\.label\} \/>/);
  });
  it("generated parlays: a player leg keeps its headshot mark, a club leg gets the club logo", () => {
    const src = read("src/components/mlb/ParlaysSection.tsx");
    expect(src).toMatch(/const club = who \? null : clubFromLabel\(String\(l\.label \?\? ""\)\);/);
    expect(src).toMatch(/\) : club \? \(\s*<PlayerMark player=\{null\} team=\{club\} headshot=\{null\} size="xs" className="mr-1 align-text-bottom" \/>\s*\) : null\}/);
  });
  it("Parlay Generator slots: the MLB mark draws a club logo for a club leg", () => {
    const src = read("src/components/props/GenSheet.tsx");
    expect(src).toMatch(/const club = team \? null : clubFromLabel\(name\);\s*if \(club\) return <PlayerMark player=\{null\} team=\{club\} headshot=\{null\} size="sm" \/>;/);
  });
  it("Ledger: a club leg draws the club logo beside the line", () => {
    const src = read("app/ledger/page.tsx");
    expect(src).toMatch(/const club = player \? null : clubFromLabel\(l\.label\);/);
    expect(src).toMatch(/\{club && <span className="mr-2 inline-flex py-1 align-middle"><PlayerMark player=\{null\} team=\{club\} headshot=\{null\} size="sm" \/><\/span>\}/);
  });
  it("Builder, The Sharp and the slip print picks through BoardLabel, so the club branch reaches them too", () => {
    for (const p of ["app/builder/page.tsx", "app/sharp/page.tsx", "src/components/props/Slip.tsx"]) {
      expect(read(p), p).toMatch(/<BoardLabel label=\{(l|r)\.label\} \/>/);
    }
  });
});
