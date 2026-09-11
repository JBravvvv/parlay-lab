import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerMark, mlbTeamLogo, playerInitials } from "@/components/player/PlayerMark";
import { teamLogo } from "@/lib/mlb-visuals";

/**
 * INSTRUCTION 50 (2026-09-11), Josh's word, verbatim: "Need player headshots for Parlay Builder
 * etc or need team logo next to name".
 *
 * The MLB twin of tests/cfb-player-mark.test.ts:39-67 — one headshot disc, HIS team's logo as the
 * corner badge, initials when no headshot resolved. The repo's test runtime is node (no jsdom), so
 * the rendering claims are made on renderToStaticMarkup output and the rest on pure helpers.
 * vitest compiles the app's .tsx with the classic JSX runtime under this tsconfig (jsx: preserve),
 * so a server render needs React on the global.
 *
 * NOTE ON THE HOOK: useHeadshots returns {} on the server (its state starts empty and the resolve
 * runs in an effect), so a server render of any surface that feeds it sees NO headshot — which is
 * why the initials path is the one asserted end-to-end, not an <img> that only exists in a browser.
 */
vi.stubGlobal("React", React);

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/* a real MLB headshot href — the shape src/lib/mlb-visuals.ts:68 builds from a statsapi personId */
const HEADSHOT = "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto/v1/people/670541/headshot/67/current";

describe("PlayerMark — headshot disc with the player's own team logo as the badge", () => {
  it("draws ONE headshot img and ONE team-logo badge, never a second club", () => {
    const out = html(createElement(PlayerMark, { player: "Yordan Alvarez", headshot: HEADSHOT, team: "HOU", size: "md" }));
    expect(count(out, /data-player-mark/g)).toBe(1);
    expect(count(out, /data-team-badge/g)).toBe(1);
    expect(count(out, /<img /g)).toBe(2); // the headshot + the badge logo
    expect(out).toContain(HEADSHOT);
    expect(out).toContain(teamLogo("hou"));
    expect(out).not.toContain(teamLogo("tex"));
    expect(out).toContain('role="img"');
    expect(out).toContain('title="Yordan Alvarez · HOU"');
  });

  it("no headshot → initials, badge still the team logo (the server-render path)", () => {
    const out = html(createElement(PlayerMark, { player: "Yordan Alvarez", headshot: null, team: "HOU", size: "sm" }));
    expect(out).toContain(">YA<");
    expect(count(out, /<img /g)).toBe(1); // only the badge
    expect(out).toContain(teamLogo("hou"));
    // the headshot map a server render actually gets is {} — a missing key must read the same way
    const undef = html(createElement(PlayerMark, { player: "Yordan Alvarez", headshot: undefined, team: "HOU" }));
    expect(undef).toContain(">YA<");
    expect(count(undef, /<img /g)).toBe(1);
  });

  it("no team → initials and NO badge; no player → the club mark alone; neither → nothing", () => {
    const noTeam = html(createElement(PlayerMark, { player: "Otto Lopez", headshot: HEADSHOT, team: null }));
    expect(noTeam).not.toContain("data-team-badge");
    expect(count(noTeam, /<img /g)).toBe(1);
    const noPlayer = html(createElement(PlayerMark, { player: null, headshot: null, team: "MIA" }));
    expect(noPlayer).not.toContain("data-player-mark");
    expect(noPlayer).toContain(teamLogo("mia"));
    expect(html(createElement(PlayerMark, { player: "", headshot: null, team: null }))).toBe("");
    expect(html(createElement(PlayerMark, { player: null, headshot: null, team: null }))).toBe("");
  });

  it("the ATH/OAK and CWS/CHW fold — every spelling of those two clubs finds its logo", () => {
    /* the engine tags rows ATH / CWS (props-model.ts:97); mlb-visuals' own table says OAK / CHW
       (mlb-visuals.ts:19,33). Both spellings, and the full club name, must land on one logo. */
    expect(mlbTeamLogo("ATH")).toBe(teamLogo("oak"));
    expect(mlbTeamLogo("OAK")).toBe(teamLogo("oak"));
    expect(mlbTeamLogo("Athletics")).toBe(teamLogo("oak"));
    expect(mlbTeamLogo("Oakland Athletics")).toBe(teamLogo("oak"));
    expect(mlbTeamLogo("CWS")).toBe(teamLogo("chw"));
    expect(mlbTeamLogo("CHW")).toBe(teamLogo("chw"));
    expect(mlbTeamLogo("Chicago White Sox")).toBe(teamLogo("chw"));
    /* PLANT: the naive lowercase (no fold) would ask ESPN for /ath.png and /cws.png, which is
       exactly the silent-loss this guard exists for. Assert those URLs are never produced. */
    expect(mlbTeamLogo("ATH")).not.toBe(teamLogo("ath"));
    expect(mlbTeamLogo("CWS")).not.toBe(teamLogo("cws"));
    /* and an ordinary club is untouched by the fold */
    expect(mlbTeamLogo("SF")).toBe(teamLogo("sf"));
    expect(mlbTeamLogo("San Francisco Giants")).toBe(teamLogo("sf"));
    expect(mlbTeamLogo(null)).toBeNull();
    expect(mlbTeamLogo("  ")).toBeNull();
  });

  it("the badge is rendered for an ATH row end-to-end, not just by the helper", () => {
    const out = html(createElement(PlayerMark, { player: "Lawrence Butler", headshot: null, team: "ATH" }));
    expect(out).toContain(teamLogo("oak"));
    expect(out).not.toContain(teamLogo("ath"));
    expect(out).toContain('title="Lawrence Butler · ATH"');
  });

  it("playerInitials — first + last, suffix-proof, never empty", () => {
    expect(playerInitials("Yordan Alvarez")).toBe("YA");
    expect(playerInitials("Ronald Acuna Jr.")).toBe("RJ");
    expect(playerInitials("Ichiro")).toBe("I");
    expect(playerInitials("")).toBe("?");
  });
});
