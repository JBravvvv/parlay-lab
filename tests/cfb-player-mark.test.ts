import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";
import { headshotThumb, initials, PairMark, PlayerMark, TeamMark } from "@/components/cfb/TeamMark";
import { CFB_LEG_CLOSED_TITLE, CfbTicketCard, cfbLegClosed, cfbLegHref, cfbLegLink, cfbLegSlug } from "@/components/cfb/CfbTicketCard";
import { cfbBoxTapToggles } from "@/components/cfb/CfbLedger";
import { cfbPropsLinkNav, cfbPropsLinkOf } from "@/components/cfb/CfbProps";
import type { CfbGame, CfbTeam, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";

/**
 * INSTRUCTION 46 (2026-09-08) — player headshot + HIS team's logo on every player pick, the pair
 * only on a total (points 1 and 3), and the ledger box that toggles on a tap anywhere except the
 * player's name, which is a replace-Link into the Builder while the bet is open (point 9).
 * The repo's test runtime is node (no jsdom), so the rendering claims are made on
 * `renderToStaticMarkup` output and the behaviour on the exported pure helpers + source pins.
 * vitest's esbuild transform compiles the app's .tsx with the classic JSX runtime under this
 * tsconfig (jsx: preserve), so a server render needs React on the global — stubbed once here.
 */
vi.stubGlobal("React", React);

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
/** an attribute value as the server render prints it (`&` → `&amp;`) */
const attr = (s: string) => s.replace(/&/g, "&amp;");

const HEADSHOT = "https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png";

const team = (id: string, abbr: string, name: string, color: string | null = "9e1b32"): CfbTeam =>
  ({ id, name, short: name, abbr, logo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`, rank: null, record: null, color, fpi: null, fpiRank: null }) as CfbTeam;
const ALA = team("333", "ALA", "Alabama");
const FSU = team("52", "FSU", "Florida State", "782f40");
const GAME = { id: "g1", home: ALA, away: FSU } as CfbGame;

describe("PlayerMark — headshot disc with the player's own team logo as the badge", () => {
  it("draws ONE headshot img and ONE team-logo badge, never a second team", () => {
    const out = html(createElement(PlayerMark, { player: "Ty Simpson", headshot: HEADSHOT, team: ALA, pos: "QB", size: "md" }));
    expect(count(out, /data-player-mark/g)).toBe(1);
    expect(count(out, /<img /g)).toBe(2); // the headshot + the badge logo
    expect(out).toContain(attr(headshotThumb(HEADSHOT)));
    expect(out).toContain(ALA.logo as string);
    expect(out).not.toContain(FSU.logo as string);
    expect(out).toContain('role="img"');
    expect(out).toContain('title="Ty Simpson · QB · ALA"');
  });
  it("no headshot → initials in the team colour, badge still the team logo", () => {
    const out = html(createElement(PlayerMark, { player: "Ty Simpson", headshot: null, team: ALA, size: "sm" }));
    expect(out).toContain(">TS<");
    expect(count(out, /<img /g)).toBe(1); // only the badge
    expect(out).toContain("#9e1b32");
  });
  it("no team → initials on the surface tone and no badge; no player → a plain TeamMark; neither → nothing", () => {
    const noTeam = html(createElement(PlayerMark, { player: "Ryan Williams", headshot: HEADSHOT, team: null }));
    expect(noTeam).not.toContain("data-team-badge");
    expect(count(noTeam, /<img /g)).toBe(1);
    const noPlayer = html(createElement(PlayerMark, { player: null, headshot: null, team: ALA }));
    expect(noPlayer).not.toContain("data-player-mark");
    expect(noPlayer).toContain(ALA.logo as string);
    expect(html(createElement(PlayerMark, { player: "", headshot: null, team: null }))).toBe("");
  });
  it("headshotThumb sizes an ESPN headshot through the combiner (the verified form) and passes other hrefs through", () => {
    expect(headshotThumb(HEADSHOT)).toBe(`https://a.espncdn.com/combiner/i?img=${encodeURIComponent("/i/headshots/college-football/players/full/4685454.png")}&w=96&h=70`);
    expect(headshotThumb("https://example.com/x.png")).toBe("https://example.com/x.png");
  });
  it("initials — moved from CfbProps unchanged", () => {
    expect(initials("Ty Simpson")).toBe("TS");
    expect(initials("Jalen Milroe Jr.")).toBe("JJ");
    expect(initials("")).toBe("?");
  });
});

/* ---------- the ticket card: player → PlayerMark, side → TeamMark, total → PairMark ---------- */

const leg = (over: Partial<CfbTicketLeg>): CfbTicketLeg =>
  ({ label: "Alabama -6.5", prop: "Spread", cz: -110, gkey: "g1", lkey: `lk-${Math.random()}`, market: "spread", side: "home", line: -6.5, teamId: "333", prob: 0.55, push: 0, ...over }) as CfbTicketLeg;
const ticket = (legs: CfbTicketLeg[]): CfbTicket =>
  ({ id: "t1", bucket: "core", name: "Test ticket", stake: 25, czDec: 3.2, czOdds: 220, czEv: 4.1, prob: 31, legs }) as unknown as CfbTicket;

const PROP = leg({ lkey: "prop-1", label: "Ty Simpson O 245.5", prop: "Pass Yds", market: "spread", side: "home", player: "Ty Simpson", headshot: HEADSHOT, pos: "QB", teamId: "333" });
const SIDE = leg({ lkey: "side-1", label: "Florida State +6.5", side: "away", teamId: "52" });
const TOTAL = leg({ lkey: "total-1", label: "Over 51.5", prop: "Total", market: "total", side: "over", teamId: null });

describe("CfbTicketCard legs — one mark grammar", () => {
  const board = { games: [GAME] };
  it("a player leg is ONE headshot + HIS team's logo — never both team logos", () => {
    const out = html(createElement(CfbTicketCard, { t: ticket([PROP]), board }));
    expect(count(out, /data-player-mark/g)).toBe(1);
    expect(out).toContain(attr(headshotThumb(HEADSHOT)));
    expect(out).toContain(ALA.logo as string);
    expect(out).not.toContain(FSU.logo as string);
  });
  it("a side leg is that team's logo alone; a total is the pair (two role=img)", () => {
    const side = html(createElement(CfbTicketCard, { t: ticket([SIDE]), board }));
    expect(count(side, /role="img"/g)).toBe(1);
    expect(side).toContain(FSU.logo as string);
    expect(side).not.toContain(ALA.logo as string);
    const total = html(createElement(CfbTicketCard, { t: ticket([TOTAL]), board }));
    expect(count(total, /role="img"/g)).toBe(2);
    expect(total).toContain(FSU.logo as string);
    expect(total).toContain(ALA.logo as string);
  });
  it("a player leg prints the matchup under the name (INSTRUCTION 46 fix round); a side leg does not", () => {
    const prop = html(createElement(CfbTicketCard, { t: ticket([PROP]), board }));
    expect(prop).toContain('data-cfb-leg-matchup="true">FSU @ ALA<');
    const side = html(createElement(CfbTicketCard, { t: ticket([SIDE]), board }));
    expect(side).not.toContain("data-cfb-leg-matchup");
    // no slate → no matchup, and still one headshot with no second logo
    const noBoard = html(createElement(CfbTicketCard, { t: ticket([PROP]) }));
    expect(noBoard).not.toContain("data-cfb-leg-matchup");
    expect(count(noBoard, /data-player-mark/g)).toBe(1);
  });
  it("without legLink (the Builder) no leg is a link", () => {
    const out = html(createElement(CfbTicketCard, { t: ticket([PROP, SIDE, TOTAL]), board }));
    expect(out).not.toContain("<a ");
  });
});

/* ---------- point 9: the name is a link while the bet is open; plain text once it is gone ---------- */

describe("ledger leg links (INSTRUCTION 46, point 9)", () => {
  it("cfbLegHref is game + market + player slug — never the line", () => {
    expect(cfbLegHref(PROP, "2026-09-06")).toBe("/props?cfb=1&date=2026-09-06&game=g1&mkt=spread&player=ty-simpson");
    expect(cfbLegHref(SIDE, "2026-09-06")).toBe("/props?cfb=1&date=2026-09-06&game=g1&mkt=spread&player=florida-state");
    expect(cfbLegHref(TOTAL, "2026-09-06")).toBe("/props?cfb=1&date=2026-09-06&game=g1&mkt=total&player=over");
    expect(cfbLegHref(PROP, "2026-09-06")).not.toContain("245.5");
    /* the NFL desk flags its own query key and never carries cfb=1 (2026-09-08) */
    expect(cfbLegHref(PROP, "2026-09-13", "nfl")).toBe("/props?nfl=1&date=2026-09-13&game=g1&mkt=spread&player=ty-simpson");
    expect(cfbLegHref(PROP, "2026-09-13", "nfl")).not.toContain("cfb=1");
    expect(cfbLegLink(PROP, { date: "2026-09-13", today: "2026-09-13", verdict: { result: "pending" }, league: "nfl" }).href).toMatch(/^\/props\?nfl=1&date=2026-09-13/);
    expect(cfbLegLink(PROP, { date: "2026-09-13", today: "2026-09-13", verdict: { result: "pending" } }).href).toMatch(/^\/props\?cfb=1&/);
    expect(cfbLegSlug(leg({ label: "Indiana ML", player: null }))).toBe("indiana");
  });
  it("closed once graded, once the slate game is final / postponed, or once the slate day has passed", () => {
    const today = "2026-09-06";
    expect(cfbLegClosed({ verdict: { result: "won" }, date: today, today })).toBe(true);
    expect(cfbLegClosed({ verdict: { result: "ungradable" }, date: today, today })).toBe(true);
    expect(cfbLegClosed({ verdict: { result: "pending" }, date: today, today })).toBe(false);
    expect(cfbLegClosed({ verdict: null, date: today, today })).toBe(false);
    expect(cfbLegClosed({ verdict: null, date: "2026-09-13", today })).toBe(false);
    expect(cfbLegClosed({ verdict: null, date: "2026-09-05", today })).toBe(true);
    expect(cfbLegClosed({ verdict: null, date: today, today, status: "final" })).toBe(true);
    expect(cfbLegClosed({ verdict: null, date: today, today, status: "live" })).toBe(false);
  });
  it("renders the open leg's name as a replace-Link with the href and the closed leg as plain text with the title", () => {
    const today = "2026-09-06";
    const open = html(createElement(CfbTicketCard, { t: ticket([PROP]), board: { games: [GAME] }, legLink: (l) => cfbLegLink(l, { date: today, today, verdict: { result: "pending" } }) }));
    expect(open).toContain('href="/props?cfb=1&amp;date=2026-09-06&amp;game=g1&amp;mkt=spread&amp;player=ty-simpson"');
    expect(open).toContain("data-cfb-leg-link");
    expect(open).toContain(">Ty Simpson O 245.5</a>");
    const closed = html(createElement(CfbTicketCard, { t: ticket([PROP]), board: { games: [GAME] }, legLink: (l) => cfbLegLink(l, { date: today, today, verdict: { result: "lost" } }) }));
    expect(closed).not.toContain("<a ");
    expect(closed).toContain(`title="${CFB_LEG_CLOSED_TITLE}"`);
    expect(closed).toContain("Ty Simpson O 245.5");
  });
  it("the ticket's Link is replace-only and stops the tap reaching the box", () => {
    const src = readSrc("src/components/cfb/CfbTicketCard.tsx");
    expect(src).toMatch(/<Link\s+replace\s+href=\{link\.href\}/);
    expect(src).toMatch(/onClick=\{\(ev\) => ev\.stopPropagation\(\)\}/);
    expect(src).not.toMatch(/router\.push\(/);
  });
});

/* ---------- point 9: the box toggles on a tap anywhere inside it ---------- */

type FakeEl = { closest(sel: string): unknown };
/** a click target described by which selectors it sits inside; `box` is the day's own <details> */
const box = {};
const nested = {};
const target = (inside: Record<string, unknown>): FakeEl => ({
  closest: (sel: string) => {
    for (const s of sel.split(",").map((x) => x.trim())) if (s in inside) return inside[s];
    return null;
  },
});

describe("ledger day box — tap anywhere toggles (INSTRUCTION 46, point 9)", () => {
  it("a tap in the body toggles; on the summary it is the native toggle; on a link / button / the nested note it is not", () => {
    expect(cfbBoxTapToggles(target({ details: box }), box)).toBe(true);
    expect(cfbBoxTapToggles(target({ summary: {}, details: box }), box)).toBe(false);
    expect(cfbBoxTapToggles(target({ a: {}, details: box }), box)).toBe(false);
    expect(cfbBoxTapToggles(target({ button: {}, details: box }), box)).toBe(false);
    expect(cfbBoxTapToggles(target({ input: {}, details: box }), box)).toBe(false);
    expect(cfbBoxTapToggles(target({ details: nested }), box)).toBe(false);
  });
  it("DayCard is controlled, syncs the native toggle, routes body taps through the rule and hands the ticket its leg links", () => {
    const src = readSrc("src/components/cfb/CfbLedger.tsx");
    expect(src).toMatch(/const \[isOpen, setIsOpen\] = useState\(open\)/);
    expect(src).toMatch(/onToggle=\{\(ev\) => setIsOpen\(ev\.currentTarget\.open\)\}/);
    expect(src).toMatch(/if \(cfbBoxTapToggles\(ev\.target as Element, ev\.currentTarget\)\) setIsOpen\(\(v\) => !v\)/);
    /* `league` (the desk off LeagueContext) rides after the verdict so an NFL ledger's legs deep-link to /props?nfl=1 (2026-09-08) */
    expect(src).toMatch(/legLink=\{\(leg\) => cfbLegLink\(leg, \{ date: e\.date, today, verdict: g\?\.legs\?\.\[leg\.lkey\] \?\? null, league \}\)\}/);
  });
});

/* ---------- the Builder answers the link; the Board never draws the pair on a player ---------- */

describe("CfbProps deep link + Board marks", () => {
  it("cfbPropsLinkOf / cfbPropsLinkNav — a link without `game` is nothing; sides for ml / spread / total", () => {
    const get = (q: Record<string, string>) => ({ get: (k: string) => q[k] ?? null });
    expect(cfbPropsLinkOf(get({ mkt: "pass_yds" }))).toBeNull();
    expect(cfbPropsLinkOf(get({ cfb: "1", date: "2026-09-06", game: "g1", mkt: "pass_yds", player: "ty-simpson" }))).toEqual({ date: "2026-09-06", game: "g1", mkt: "pass_yds", player: "ty-simpson" });
    expect(cfbPropsLinkNav("pass_yds")).toBe("pass_yds");
    expect(cfbPropsLinkNav("anytime_td")).toBe("anytime_td");
    for (const m of ["ml", "spread", "total", null, "nope"]) expect(cfbPropsLinkNav(m)).toBe("sides");
  });
  it("CfbProps reads the query inside Suspense, scrolls by slug + market (never the line), and draws PlayerMark on rows", () => {
    const src = readSrc("src/components/cfb/CfbProps.tsx");
    expect(src).toMatch(/import \{ useSearchParams \} from "next\/navigation"/);
    expect(src).toMatch(/<Suspense fallback=\{null\}>\s*<PropsLinkReader onLink=\{onLink\} \/>\s*<\/Suspense>/);
    expect(src).toMatch(/data-prop-player=\{playerSlug\(pl\.player\)\}/);
    expect(src).toMatch(/playerSlug\(pl\.player\) === focusedSlug/);
    expect(src).toMatch(/el\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
    expect(src).not.toMatch(/<Link\b/);
    expect(src).not.toMatch(/router\.push\(/);
  });
  it("Board Mark: a prop with a player is PlayerMark; PairMark only for a side with no team (a total)", () => {
    const src = readSrc("src/components/cfb/CfbPicksBoard.tsx");
    expect(src).toMatch(/if \(kind === "prop" && player\) return <PlayerMark player=\{player\} headshot=\{headshot \?\? null\} team=\{team\} pos=\{pos \?\? null\} size=\{size\} \/>/);
    expect(src).toMatch(/if \(g && kind === "side" && teamId == null\) return <PairMark/);
    expect(count(src, /<Mark\b[^>]*player=\{/g)).toBe(3); // table pick column, featured strip, parlay card legs
    const slip = readSrc("src/components/cfb/CfbSlip.tsx");
    expect(slip).toMatch(/<SlipLegMark leg=\{l\} \/>/);
    expect(slip).toMatch(/if \(leg\.kind === "prop" && leg\.player\) return <PlayerMark/);
  });
});

/* ---------- the plain marks are unchanged ---------- */

describe("TeamMark / PairMark unchanged", () => {
  it("TeamMark is one role=img; PairMark two", () => {
    expect(count(html(createElement(TeamMark, { team: ALA, size: "sm" })), /role="img"/g)).toBe(1);
    expect(count(html(createElement(PairMark, { away: FSU, home: ALA, size: "sm" })), /role="img"/g)).toBe(2);
  });
});
