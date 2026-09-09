import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import { legPhase, type GameNow } from "@/lib/liveNow";
import { deepLinkHref, legDeepLink } from "@/components/props/props-model";

/**
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim):
 *  9. "On Ledger, when expanding/collapsing an individual parlay or pick it should collapse
 *     no matter where you click inside that singular box; besides clicking the players name
 *     in the bet which should take you to that bet if it is currently available pregame or
 *     live; even if the line has changed"
 *
 * The MLB half. Pure pins on legPhase (liveNow.ts) and the leg → href contract, plus
 * source scans on app/ledger/page.tsx's TicketRow / LegLine: one toggle on the box, a
 * keyboard-reachable header button with aria-expanded, the player link that stops
 * propagation, and plain text titled "game is final" once the game is over.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const ledger = read("app/ledger/page.tsx");
const code = stripComments(ledger);

const game = (over: Partial<GameNow> = {}): GameNow => ({
  pk: 1,
  state: "Scheduled",
  live: false,
  final: false,
  away: null,
  home: null,
  inning: null,
  ...over,
});

describe("legPhase — pregame / live / final from what the Ledger already knows", () => {
  it("no schedule answer yet, no grade → pregame (the link is offered)", () => {
    expect(legPhase(undefined)).toBe("pre");
    expect(legPhase(null, undefined, false)).toBe("pre");
    expect(legPhase(game(), "pending")).toBe("pre");
  });
  it("an in-progress game is live", () => {
    expect(legPhase(game({ live: true, state: "In Progress" }), "pending")).toBe("live");
  });
  it("a final game, a graded leg, or a fully graded day is final — no link", () => {
    expect(legPhase(game({ final: true, state: "Final" }))).toBe("final");
    expect(legPhase(game({ live: true }), "won")).toBe("final");
    expect(legPhase(game(), "lost")).toBe("final");
    expect(legPhase(game(), "push")).toBe("final");
    expect(legPhase(game(), "void")).toBe("final");
    expect(legPhase(game({ live: true }), "pending", true)).toBe("final");
  });
});

describe("the player link href — the /props deep-link contract, name-keyed (a moved line still lands)", () => {
  it("a prop leg on a pregame/live game links to its tab + market + game + player", () => {
    const leg = { label: "Jake Mangum (PIT)", prop: "Hits O 0.5", cz: -275, lkey: "jakemangum|batter_hits|0.5", gkey: "pittsburghpirates@cincinnatireds" };
    const d = legDeepLink(leg);
    expect(d).not.toBeNull();
    expect(deepLinkHref(d!)).toBe("/props?tab=batter&mkt=hits&game=pittsburghpirates%40cincinnatireds&player=Jake+Mangum");
    // the line is NOT in the link — "even if the line has changed"
    expect(deepLinkHref(d!)).not.toMatch(/0\.5/);
  });
  it("an ML leg links to the Games tab with the team as the player", () => {
    expect(deepLinkHref(legDeepLink({ label: "Cincinnati Reds", lkey: "ml_home", gkey: "pittsburghpirates@cincinnatireds" })!)).toBe(
      "/props?tab=games&mkt=ml&game=pittsburghpirates%40cincinnatireds&player=Cincinnati+Reds",
    );
  });
  it("a hand-typed leg with no engine key has no link at all", () => {
    expect(legDeepLink({ label: "HR over", lkey: null })).toBeNull();
  });
});

describe("TicketRow — the whole box toggles, keyboard kept, player link excepted", () => {
  it("the <details>/<summary> ticket is gone; the box is a stateful container with one click handler", () => {
    const ticket = code.slice(code.indexOf("function TicketRow("), code.indexOf("function DayCard("));
    expect(ticket).not.toMatch(/<details/);
    expect(ticket).not.toMatch(/<summary/);
    expect(ticket).toMatch(/const \[open, setOpen\] = useState\(false\)/);
    expect(ticket).toMatch(/const toggle = \(\) => setOpen\(\(o\) => !o\)/);
    expect(ticket).toMatch(/data-testid="ticket-row" data-open=\{open \? "1" : "0"\} onClick=\{toggle\}/);
    // exactly one onClick in the ticket box — the body needs none of its own, it bubbles to the box
    expect(ticket.match(/onClick=/g)?.length).toBe(1);
  });
  it("the header is a real button with aria-expanded — Enter/Space still toggle", () => {
    const ticket = code.slice(code.indexOf("function TicketRow("), code.indexOf("function DayCard("));
    expect(ticket).toMatch(/<button\s+type="button"\s+aria-expanded=\{open\}/);
    expect(ticket).toMatch(/\{open && \(\s*<div className="mt-2 space-y-1\.5/);
    expect(ticket).toMatch(/\{!open && \(/); // the collapsed one-line leg summary
    expect(ticket).not.toMatch(/group-open:/);
  });
  it("a leg's name is a Link to the deep link that stops propagation; a final game is plain text titled 'game is final'", () => {
    const leg = code.slice(code.indexOf("function LegLine("), code.indexOf("function TicketRow("));
    expect(ledger).toMatch(/import Link from "next\/link"/);
    expect(ledger).toMatch(/import \{ deepLinkHref, legDeepLink \} from "@\/components\/props\/props-model"/);
    expect(leg).toMatch(/const phase = legPhase\(game, r\?\.result, dayDone\)/);
    expect(leg).toMatch(/const deep = phase === "final" \? null : legDeepLink\(l\)/);
    // `replace` first: the nav-flat pin (iOS back-swipe never arms) requires every in-app Link to carry it
    expect(leg).toMatch(/<Link\s+replace\s+href=\{deepLinkHref\(deep\)\}\s+data-testid="leg-link"\s+onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
    expect(leg).toMatch(/<span title=\{phase === "final" \? "game is final" : undefined\}>\{l\.label\}<\/span>/);
  });
  it("the ticket reads the day's live schedule (the same useLiveNow the page already polls) and the day's graded flag", () => {
    expect(code).toMatch(/gameNow=\{\(pk\) => \(pk != null \? live\.games\[pk\] \?\? null : null\)\}/);
    expect(code).toMatch(/const dayDone = !!e\.grading\?\.done/);
    expect(code).toMatch(/game=\{gameNow \? gameNow\(pkOf\(l\.gkey\)\) : null\}/);
  });
  it("the day card itself is untouched — still a <details> that folds the whole day", () => {
    const day = code.slice(code.indexOf("function DayCard("), code.indexOf("export default function LedgerPage"));
    expect(day).toMatch(/<details className="glass px-4 py-3">/);
  });
});
