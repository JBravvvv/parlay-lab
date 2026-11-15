import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { decide } from "@/lib/anytime/engine";
import type { LedgerRow } from "@/lib/anytime/ledger";
import type { Candidate, GradeResult } from "@/lib/anytime/types";
import { excludedBy } from "@/lib/az/exclusions";
import { cand, T0 } from "./helpers/anytime";

(globalThis as { React?: typeof React }).React = React;
vi.mock("next/navigation", () => ({ usePathname: () => "/builder" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children) }));

import { ENGINE_PICKS_URL, EnginePicksView, loadEnginePicks } from "@/components/anytime/EnginePicks";
import { CARD_BANKROLL, MAX_BET_DOLLARS, SETTLED_SHOWN, UNIT_DOLLARS, UNIT_TEXT, cardDays, dayLabel, engineCard, isCardPath, isCardSport, stakeDollarsOf } from "@/lib/anytime/card";
import { MARK_DAYS_MAX, fallbackAbbr, markDays, parseMarks, pickMark, type MarksById } from "@/lib/anytime/marks";
import { MARKS_TTL, handleMarks, marksUrl } from "@/lib/server/anytime-marks";

/**
 * THE ENGINE'S PICKS ON THE CARD (2026-11-15, Josh: "Nothing is locking on the card. Picks should lock at any
 * point in time ... add new bets 24/7 while never removing locked bets"). The engine had 25 picks locked and
 * the card pages showed none of them, because those pages read the older ledgers. Made-up games only.
 */

let n = 0;
function row(over: Partial<Candidate>, opts: { at?: number; result?: GradeResult; voided?: boolean } = {}): LedgerRow {
  n++;
  /* the engine only locks a game that has not started, so a fixture for an earlier game is locked an hour before it */
  const kick = Date.parse(over.commence ?? "");
  const at = opts.at ?? (Number.isFinite(kick) && kick <= T0 + 120_000 ? kick - 3_600_000 : T0);
  const c = cand({ eventId: `e${n}`, event: `Away${n} @ Home${n}`, selection: `Home${n} -2.5`, fetchedAt: at - 1_000, ...over });
  const pick = decide({ candidates: [c], now: at, runId: "r", trigger: "cron", families: new Map(), excluded: excludedBy(), kellyBankroll: 100, kellyOpenByEvent: new Map() }).picks[0];
  if (!pick) throw new Error("fixture produced no pick");
  return {
    pick,
    grade: opts.result ? { id: pick.id, result: opts.result, gradedAt: "2026-11-16T05:00:00Z", source: "espn" } : null,
    close: null,
    void: opts.voided ? { id: pick.id, reason: "not_available_az", at: "2026-11-15T18:00:00Z", by: "ui" } : null,
  };
}
const SAT_NIGHT = Date.parse("2026-11-15T05:05:00Z"); // Saturday 9:05 PM Pacific
const SUN_EARLY = "2026-11-15T18:00:00Z"; // Sunday 10:00 AM Pacific
const SUN_LATE = "2026-11-15T21:25:00Z"; // Sunday 1:25 PM Pacific
const MON = "2026-11-17T01:15:00Z"; // Monday 5:15 PM Pacific
const THU = "2026-11-20T01:15:00Z"; // Thursday 5:15 PM Pacific

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the card model", () => {
  it("a pick locked on Saturday night for a Sunday game is on SUNDAY'S card, under Tomorrow, then Today", () => {
    const r = row({ commence: SUN_EARLY }, { at: SAT_NIGHT });
    expect(r.pick.ts.slice(0, 10)).toBe("2026-11-15"); // recorded Saturday evening Pacific = Sunday UTC
    const sat = engineCard([r], "nfl", SAT_NIGHT);
    expect(sat.days.map((d) => [d.date, d.label, d.picks.length])).toEqual([["2026-11-15", "Tomorrow", 1]]);
    const sun = engineCard([r], "nfl", Date.parse("2026-11-15T16:00:00Z"));
    expect(sun.days.map((d) => [d.date, d.label])).toEqual([["2026-11-15", "Today"]]);
    expect(sun.open).toBe(1);
  });

  it("groups open picks by the day the game is played in Pacific time, earliest first, games in kickoff order", () => {
    const late = row({ commence: SUN_LATE });
    const thu = row({ commence: THU });
    const early = row({ commence: SUN_EARLY });
    const mon = row({ commence: MON });
    const card = engineCard([late, thu, early, mon], "nfl", T0);
    expect(card.days.map((d) => [d.date, d.label, d.picks.map((p) => p.id)])).toEqual([
      ["2026-11-15", "Today", [early.pick.id, late.pick.id]],
      ["2026-11-16", "Tomorrow", [mon.pick.id]],
      ["2026-11-19", "Thu, Nov 19", [thu.pick.id]],
    ]);
    expect(card.open).toBe(4);
    expect(card.days[0].picks[0].kickoff).toBe("Sun 10:00 AM");
    expect(card.days[1].picks[0].gameDate).toBe("2026-11-16"); // 01:15Z Tuesday UTC is Monday in Pacific
  });

  it("a desk sees only its own sport, matched on the stored value", () => {
    const nfl = row({ sport: "nfl" });
    const cfb = row({ sport: "cfb", marketType: "cfb:spread" });
    const cbb = row({ sport: "ncaab", marketType: "ncaab:spread" });
    const rows = [nfl, cfb, cbb];
    expect(engineCard(rows, "nfl", T0).days.flatMap((d) => d.picks.map((p) => p.id))).toEqual([nfl.pick.id]);
    expect(engineCard(rows, "cfb", T0).days.flatMap((d) => d.picks.map((p) => p.id))).toEqual([cfb.pick.id]);
    expect(engineCard(rows, "ncaab", T0).days.flatMap((d) => d.picks.map((p) => p.id))).toEqual([cbb.pick.id]);
    expect(engineCard([row({ sport: "NFL" })], "nfl", T0).open).toBe(0);
    expect([isCardSport("nfl"), isCardSport("cfb"), isCardSport("ncaab"), isCardSport("mlb"), isCardSport("NFL"), isCardSport(null)]).toEqual([true, true, true, false, false, false]);
  });

  it("an open pick is never dropped for age: a game days past that is still ungraded stays listed", () => {
    const old = row({ commence: "2026-11-09T18:00:00Z" });
    const card = engineCard([old], "nfl", T0);
    expect(card.open).toBe(1);
    expect(card.days.map((d) => [d.date, d.label])).toEqual([["2026-11-09", "Mon, Nov 9"]]);
    const yesterday = engineCard([row({ commence: "2026-11-14T20:00:00Z" })], "nfl", T0);
    expect(yesterday.days[0].label).toBe("Yesterday");
  });

  it("graded picks leave the open list for the graded one, latest game first; a void is counted and not shown", () => {
    const won = row({ commence: SUN_EARLY }, { result: "won" });
    const lost = row({ commence: SUN_LATE }, { result: "lost" });
    const push = row({ commence: MON }, { result: "push" });
    const gradedVoid = row({ commence: MON }, { result: "void" });
    const marked = row({ commence: THU }, { voided: true });
    const open = row({ commence: THU });
    const card = engineCard([won, lost, push, gradedVoid, marked, open], "nfl", T0);
    expect(card.open).toBe(1);
    expect(card.settled.map((p) => [p.id, p.status])).toEqual([[push.pick.id, "push"], [lost.pick.id, "lost"], [won.pick.id, "won"]]);
    expect([card.settledTotal, card.voided]).toEqual([3, 2]);
  });

  it("the graded list is capped for the page, and the cap is said, never silent", () => {
    const many = Array.from({ length: SETTLED_SHOWN + 5 }, (_, i) => row({ commence: new Date(Date.parse(SUN_EARLY) - i * 3_600_000).toISOString() }, { result: "won" }));
    const card = engineCard(many, "nfl", T0);
    expect([card.settled.length, card.settledTotal]).toEqual([SETTLED_SHOWN, SETTLED_SHOWN + 5]);
    expect(card.settled[0].id).toBe(many[0].pick.id);
  });

  it("a row with an unreadable start time is left out, not thrown on", () => {
    const bad = row({});
    const rows = [{ ...bad, pick: { ...bad.pick, commence: "not a time" } }];
    expect(engineCard(rows, "nfl", T0).open).toBe(0);
  });

  it("day labels, and which pages are the card", () => {
    expect(["2026-11-15", "2026-11-16", "2026-11-14", "2026-11-22", "2026-12-01"].map((d) => dayLabel(d, "2026-11-15"))).toEqual(["Today", "Tomorrow", "Yesterday", "Sun, Nov 22", "Tue, Dec 1"]);
    expect(dayLabel("2027-01-01", "2026-12-31")).toBe("Tomorrow");
    expect(["/builder", "/builder/x", "/ledger", "/ledger/2026-11-15", "/games", "/board", "/anytime", "/", "/builders", "/settings"].map(isCardPath)).toEqual([true, true, true, true, false, false, false, false, false, false]);
  });
});

describe("the block on the page", () => {
  const html = (load: Parameters<typeof EnginePicksView>[0]["load"], sport: "nfl" | "cfb" | "ncaab" = "nfl") => renderToStaticMarkup(React.createElement(EnginePicksView, { sport, load, now: T0 }));

  it("lists every open pick under its game day, with the book and price taken, the kickoff and the word locked", () => {
    const a = row({ commence: SUN_LATE });
    const b = row({ commence: MON });
    const out = html({ kind: "ready", rows: [b, a], count: 2, lastRun: new Date(T0 - 4 * 60_000).toISOString(), at: T0 });
    expect(out).toContain("Locked picks · NFL · 2 open");
    expect(out.indexOf('data-engine-day="2026-11-15"')).toBeLessThan(out.indexOf('data-engine-day="2026-11-16"'));
    expect(out).toContain("Today · 1");
    expect(out).toContain("Tomorrow · 1");
    expect(out).toContain(a.pick.selection);
    expect(out).toContain(">−105<");
    expect(out).toContain(">FanDuel<");
    expect(out).toContain("DraftKings −110");
    expect(out).toContain("Sun 1:25 PM PT");
    expect((out.match(/data-engine-pick="open"/g) ?? []).length).toBe(2);
    expect((out.match(/>locked</g) ?? []).length).toBe(2);
    expect(out).toContain("A locked pick is never removed or changed; new ones are added as they qualify.");
    expect(out).toContain("Engine last ran 4 min ago.");
    expect(out).not.toContain("data-engine-empty");
    expect(out).not.toContain("Showing the newest");
  });

  it("nothing locked for this desk says so in words, and still says when the engine last ran", () => {
    const other = row({ sport: "cfb", marketType: "cfb:spread" });
    const out = html({ kind: "ready", rows: [other], count: 1, lastRun: new Date(T0 - 60_000).toISOString(), at: T0 });
    expect(out).toContain("Locked picks · NFL · 0 open");
    expect(out).toContain("data-engine-empty");
    expect(out).toContain("No NFL pick is locked right now.");
    expect(out).toContain("Engine last ran");
    expect(out).not.toContain('data-engine-pick="');
  });

  it("is never blank without a reason: no phrase, a refused phrase, a failed read and loading each say so", () => {
    expect(html({ kind: "no-key" })).toContain("This device has no sync phrase, so it cannot read the locked picks.");
    expect(html({ kind: "no-key" })).toContain('href="/settings"');
    expect(html({ kind: "bad-key" })).toContain("The sync phrase on this device was refused");
    expect(html({ kind: "error", why: "the server answered 502" })).toContain("Couldn&#x27;t read the locked picks (the server answered 502). Nothing was changed.");
    expect(html({ kind: "loading" })).toContain("Reading the locked picks…");
    for (const k of ["no-key", "bad-key", "loading"] as const) expect(html({ kind: k })).toContain(`data-engine-picks="${k}"`);
  });

  it("graded picks sit in their own folded list with the result, and a cut-off ledger is said", () => {
    const won = row({ commence: SUN_EARLY }, { result: "won" });
    const open = row({ commence: THU });
    const out = html({ kind: "ready", rows: [won, open], count: 2500, lastRun: null, at: T0 });
    expect(out).toContain("Graded · 1");
    expect(out).toContain('data-engine-pick="won"');
    expect(out).toContain("Showing the newest 2 of 2500 picks across all desks.");
    expect(out).not.toContain("Engine last ran");
    expect(out).toContain('href="/anytime"');
  });

  it("names the desk it is for", () => {
    expect(html({ kind: "ready", rows: [], count: 0, lastRun: null, at: T0 }, "cfb")).toContain("Locked picks · CFB · 0 open");
    expect(html({ kind: "ready", rows: [], count: 0, lastRun: null, at: T0 }, "ncaab")).toContain("No CBB pick is locked right now.");
  });
});

/* ---------- one pick, one card, with its team's logo ---------- */

const espnTeam = (id: string, name: string, abbr: string, extra: Record<string, unknown> = {}) => ({ id, displayName: name, shortDisplayName: name.split(" ").slice(-1)[0], abbreviation: abbr, logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`, color: "0b162a", ...extra });
const espnGame = (id: string, home: object, away: object) => ({ id, competitions: [{ competitors: [{ homeAway: "home", team: home }, { homeAway: "away", team: away }] }] });
const BEARS = espnTeam("3", "Chicago Bears", "CHI");
const PACKERS = espnTeam("9", "Green Bay Packers", "GB");
const MARKS: MarksById = parseMarks([espnGame("g1", BEARS, PACKERS)]);

describe("the team marks", () => {
  it("reads both teams of every game from ESPN's scoreboard events, keyed by the game's id", () => {
    expect(Object.keys(MARKS)).toEqual(["g1"]);
    expect(MARKS.g1.home).toEqual({ id: "3", name: "Chicago Bears", short: "Bears", abbr: "CHI", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", color: "0b162a", rank: null });
    expect(MARKS.g1.away.abbr).toBe("GB");
  });

  it("invents nothing: no logo, a non-https logo or an odd colour is null; a game missing a side or an id is left out; the first copy wins", () => {
    const bare = parseMarks([espnGame("g2", espnTeam("1", "A Team", "AT", { logo: undefined, logos: [{ href: "https://x.test/a.png" }], color: "zzz" }), espnTeam("2", "B Team", "BT", { logo: "http://x.test/b.png" }))]);
    expect([bare.g2.home.logo, bare.g2.home.color, bare.g2.away.logo]).toEqual(["https://x.test/a.png", null, null]);
    expect(parseMarks([espnGame("", BEARS, PACKERS), { id: "g3", competitions: [{ competitors: [{ homeAway: "home", team: BEARS }] }] }, null, "x", { id: "g4" }])).toEqual({});
    const twice = parseMarks([espnGame("g1", BEARS, PACKERS), espnGame("g1", PACKERS, BEARS)]);
    expect(twice.g1.home.abbr).toBe("CHI");
    expect(parseMarks([espnGame("g5", { id: "7", location: "Somewhere" }, PACKERS)]).g5.home).toMatchObject({ name: "Somewhere", abbr: "SOME", logo: null });
  });

  it("a side pick draws its own team, a total draws both, and no marks in hand draws none", () => {
    expect(pickMark({ side: "home", gameId: "g1" }, MARKS)).toEqual({ kind: "team", team: MARKS.g1.home });
    expect(pickMark({ side: "away", gameId: "g1" }, MARKS)).toEqual({ kind: "team", team: MARKS.g1.away });
    for (const side of ["over", "under"]) expect(pickMark({ side, gameId: "g1" }, MARKS)).toEqual({ kind: "pair", home: MARKS.g1.home, away: MARKS.g1.away });
    expect([pickMark({ side: "home", gameId: "nope" }, MARKS), pickMark({ side: "home", gameId: null }, MARKS), pickMark({ side: "home", gameId: "g1" }, null)]).toEqual([null, null, null]);
  });

  it("the stand-in is letters from the picked team, or from the matchup for a total", () => {
    const g = { home: "Chicago Bears", away: "Green Bay Packers", event: "Green Bay Packers @ Chicago Bears" };
    expect([fallbackAbbr({ side: "home", ...g }), fallbackAbbr({ side: "away", ...g }), fallbackAbbr({ side: "over", ...g })]).toEqual(["CB", "GBP", "GBP"]);
    expect(fallbackAbbr({ side: "home", home: null, away: null, event: "" })).toBe("?");
  });

  it("the days asked for are checked, de-duplicated, capped, and each brings the day after it", () => {
    expect(markDays(["2026-11-15", "2026-11-15", "bad", "2026-13-40", "", "2026-11-16"])).toEqual({ days: ["2026-11-15", "2026-11-16"], fetch: ["2026-11-15", "2026-11-16", "2026-11-17"] });
    expect(markDays(["2026-12-31"]).fetch).toEqual(["2026-12-31", "2027-01-01"]);
    const many = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(markDays(many).days.length).toBe(MARK_DAYS_MAX);
    expect(MARK_DAYS_MAX).toBe(10);
  });

  it("the card names the game days it shows, open and graded, for that lookup", () => {
    const open = row({ commence: THU });
    const won = row({ commence: SUN_EARLY }, { result: "won" });
    expect(cardDays(engineCard([open, won, row({ commence: THU })], "nfl", T0))).toEqual(["2026-11-15", "2026-11-19"]);
    expect(cardDays(engineCard([], "nfl", T0))).toEqual([]);
  });
});

describe("the marks route", () => {
  const ok = (events: unknown[]) => new Response(JSON.stringify({ events }), { status: 200 });

  it("reads ESPN's free scoreboard for each day and the day after, kept an hour, and sends no secret", async () => {
    const f = vi.fn(async (_u: string, _i: { next: { revalidate: number } }) => ok([espnGame("g1", BEARS, PACKERS)]));
    const r = await handleMarks("nfl", "2026-11-15", f);
    expect(r).toEqual({ status: 200, body: { sport: "nfl", days: ["2026-11-15"], games: MARKS, missed: [] } });
    expect(f.mock.calls.map((c) => c[0])).toEqual([marksUrl("nfl", "2026-11-15"), marksUrl("nfl", "2026-11-16")]);
    expect(f.mock.calls.every((c) => JSON.stringify(c[1]) === JSON.stringify({ next: { revalidate: 3600 } }))).toBe(true);
    expect(MARKS_TTL).toBe(3600);
    expect(marksUrl("nfl", "2026-11-15")).toBe("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=20261115");
    expect(marksUrl("cfb", "2026-11-15")).toContain("/college-football/scoreboard?groups=80&limit=400&dates=20261115");
    expect(marksUrl("ncaab", "2026-11-15")).toContain("/mens-college-basketball/scoreboard?groups=50&limit=400&dates=20261115");
    for (const s of ["nfl", "cfb", "ncaab"] as const) expect(marksUrl(s, "2026-11-15")).not.toMatch(/api\.the-odds-api|apiKey|key=/i);
  });

  it("a day ESPN fails on is named and the others still answer; a bad sport or no valid day is a 400 and asks nothing", async () => {
    const f = vi.fn(async (u: string) => (u.endsWith("20261116") ? new Response("no", { status: 503 }) : ok([espnGame("g1", BEARS, PACKERS)])));
    const r = await handleMarks("nfl", "2026-11-15", f);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ games: MARKS, missed: ["2026-11-16"] });
    const thrown = await handleMarks("nfl", "2026-11-15", async () => { throw new Error("offline"); });
    expect(thrown.body).toMatchObject({ games: {}, missed: ["2026-11-15", "2026-11-16"] });
    const none = vi.fn();
    for (const [s, d] of [["mlb", "2026-11-15"], [null, "2026-11-15"], ["nfl", ""], ["nfl", null], ["nfl", "tomorrow"]] as const) expect((await handleMarks(s, d, none)).status).toBe(400);
    expect(none).not.toHaveBeenCalled();
  });

  it("the route is public, read-only and touches neither the store nor the odds feed", () => {
    const route = readFileSync("app/api/anytime/marks/route.ts", "utf8");
    const lib = readFileSync("src/lib/server/anytime-marks.ts", "utf8");
    expect(route).toContain("export async function GET(req: NextRequest) {");
    expect(route).not.toMatch(/export async function (POST|PUT|DELETE)/);
    for (const srcText of [route, lib]) expect(srcText).not.toMatch(/redis\(|upstashKv|ODDS_API_KEY|oddsFetch|syncAuthed|CRON_SECRET/);
  });
});

describe("one pick, one card", () => {
  const view = (rows: LedgerRow[], marks: MarksById | null) => renderToStaticMarkup(React.createElement(EnginePicksView, { sport: "nfl", load: { kind: "ready", rows, count: rows.length, lastRun: null, at: T0 }, now: T0, marks }));
  const ref = { source: "espn" as const, league: "nfl", id: "g1", home: "Chicago Bears", away: "Green Bay Packers" };

  it("every pick is its own bordered card in a spaced list, never a run of text rows", () => {
    const out = view([row({ commence: SUN_LATE, gradeRef: ref }), row({ commence: SUN_LATE, gradeRef: ref, side: "away", selection: "Green Bay Packers +2.5" })], MARKS);
    expect((out.match(/<li class="rounded-\[14px\] border border-white\/\[0\.09\] bg-surface-2 p-3"/g) ?? []).length).toBe(2);
    expect(out).toContain('<ul class="grid gap-2 md:grid-cols-2">');
    expect(out).not.toContain("border-b border-white/[0.06] px-1"); // the old run-on row
  });

  it("a side pick shows the logo of the team picked: home for home, away for away", () => {
    const home = view([row({ commence: SUN_LATE, gradeRef: ref, side: "home" })], MARKS);
    expect(home).toContain('src="https://a.espncdn.com/i/teamlogos/nfl/500/chi.png"');
    expect(home).not.toContain("gb.png");
    expect(home).toContain('aria-label="Chicago Bears"');
    const away = view([row({ commence: SUN_LATE, gradeRef: ref, side: "away" })], MARKS);
    expect(away).toContain('src="https://a.espncdn.com/i/teamlogos/nfl/500/gb.png"');
    expect(away).not.toContain("chi.png");
  });

  it("a total shows both teams' logos", () => {
    const out = view([row({ commence: SUN_LATE, gradeRef: ref, market: "total", marketType: "nfl:total", side: "over", selection: "Over 44.5", line: 44.5 })], MARKS);
    expect(out).toContain("chi.png");
    expect(out).toContain("gb.png");
    expect((out.match(/data-team-mark/g) ?? []).length).toBe(2);
  });

  it("before the logos arrive, or for a game ESPN did not send, the card shows the team's letters and never a guessed logo", () => {
    for (const marks of [null, {} as MarksById]) {
      const out = view([row({ commence: SUN_LATE, gradeRef: ref, side: "away" })], marks);
      expect(out).toContain('data-engine-mark="letters"');
      expect(out).toContain(">GBP<");
      expect(out).not.toContain("<img");
    }
  });

  it("the price is set apart and large, with its book under it, and the other book's price is on the card", () => {
    const out = view([row({ commence: SUN_LATE, gradeRef: ref })], MARKS);
    expect(out).toMatch(/text-\[18px\] font-black leading-none text-pos tabular-nums">−105<\/div>/);
    expect(out).toMatch(/uppercase tracking-wide text-muted">FanDuel<\/div>/);
    expect(out).toContain(">DraftKings −110<");
    expect(out).toContain(">Sun 1:25 PM PT<");
  });

  it("a graded card says won or lost with its result in units; an open one says locked", () => {
    const wonRow = row({ commence: SUN_EARLY, gradeRef: ref }, { result: "won" });
    const stake = stakeDollarsOf(wonRow.pick.stakeKelly);
    const won = view([wonRow], MARKS);
    expect(won).toContain("bg-pos/15 text-pos\">won<");
    expect(won).toContain(`>+$${(stake * (wonRow.pick.dec - 1)).toFixed(2)}<`);
    const lost = view([row({ commence: SUN_EARLY, gradeRef: ref }, { result: "lost" })], MARKS);
    expect(lost).toContain("bg-neg/15 text-neg\">lost<");
    expect(lost).toContain(`>−$${stake.toFixed(2)}<`);
    const open = view([row({ commence: SUN_LATE, gradeRef: ref })], MARKS);
    expect(open).toContain("bg-pos/15 text-pos\">locked<");
    expect(open).not.toMatch(/>[+−]\$\d/);
    for (const html of [won, lost, open]) expect(html).not.toMatch(/\du flat|u Kelly/);
  });
});

describe("dollars on every bet", () => {
  const view = (rows: LedgerRow[]) => renderToStaticMarkup(React.createElement(EnginePicksView, { sport: "nfl", load: { kind: "ready", rows, count: rows.length, lastRun: null, at: T0 }, now: T0, marks: null }));
  const withStake = (r: LedgerRow, stakeKelly: number): LedgerRow => ({ ...r, pick: { ...r.pick, stakeKelly } });

  it("the largest bet is $250: one unit is $125 on a $12,500 bankroll, five times the old figures", () => {
    expect(MAX_BET_DOLLARS).toBe(250);
    expect(UNIT_DOLLARS).toBe(125);
    expect(CARD_BANKROLL).toBe(12500);
    expect(stakeDollarsOf(1.72)).toBe(215);
    expect(UNIT_TEXT).toBe("the engine's quarter-Kelly stake on a $12,500 bankroll, $250 at most on one bet");
  });

  it("the engine's Kelly units become whole dollars: rounded, never under $1 while anything was staked, and 0 stays 0", () => {
    expect([2, 1.24, 1.25, 0.62, 0.5, 0.05, 0.01, 0].map((u) => stakeDollarsOf(u))).toEqual([250, 155, 156, 78, 63, 6, 1, 0]);
    expect([-1, NaN, Infinity].map((u) => stakeDollarsOf(u))).toEqual([0, 0, 0]);
    expect(stakeDollarsOf(1, 100)).toBe(100);
  });

  it("every card states the bet in dollars and what it wins at the price taken", () => {
    const r = withStake(row({ commence: SUN_LATE }), 1.24); // FanDuel −105
    const card = engineCard([r], "nfl", T0).days[0].picks[0];
    expect([card.stakeDollars, card.bet, card.toWin, card.result, card.resultDollars]).toEqual([155, "$155", `$${(155 * (r.pick.dec - 1)).toFixed(2)}`, null, null]);
    const out = view([r]);
    expect(out).toContain("data-engine-bet");
    expect(out).toMatch(/Bet <span class="text-\[17px\] font-black text-text tabular-nums">\$155<\/span>/);
    expect(out).toContain(`to win <span class="font-bold text-text">$${(155 *(r.pick.dec - 1)).toFixed(2)}</span>`);
  });

  it("the header adds up the dollars on the open picks only", () => {
    const a = withStake(row({ commence: SUN_LATE }), 2);
    const b = withStake(row({ commence: MON }), 0.62);
    const graded = withStake(row({ commence: SUN_EARLY }, { result: "won" }), 2);
    const other = withStake(row({ commence: MON, sport: "cfb", marketType: "cfb:spread" }), 2);
    const card = engineCard([a, b, graded, other], "nfl", T0);
    expect([card.open, card.atRisk, card.atRiskText]).toEqual([2, 328, "$328"]);
    expect(view([a, b, graded, other])).toContain("Locked picks · NFL · 2 open · $328 staked");
    expect(engineCard([], "nfl", T0).atRiskText).toBe("$0");
    expect(engineCard(Array.from({ length: 30 }, () => withStake(row({ commence: MON }), 2)), "nfl", T0).atRiskText).toBe("$7,500");
  });

  it("a graded bet shows dollars won, lost or returned on that stake", () => {
    const base = row({ commence: SUN_EARLY });
    const pay = Number((250 * (base.pick.dec - 1)).toFixed(2));
    const money = (result: GradeResult) => {
      const r = withStake(row({ commence: SUN_EARLY }, { result }), 2);
      const p = engineCard([r], "nfl", T0).settled[0];
      return p ? [p.result, p.resultDollars] : null;
    };
    expect(money("won")).toEqual([`+$${pay.toFixed(2)}`, pay]);
    expect(money("lost")).toEqual(["−$250.00", -250]);
    expect(money("push")).toEqual(["$0.00", 0]);
    expect(money("void")).toBeNull();
  });

  it("a pick the engine trimmed to nothing shows $0 and says why, and adds nothing to the total", () => {
    const r = withStake(row({ commence: SUN_LATE }), 0);
    const card = engineCard([r], "nfl", T0);
    expect([card.days[0].picks[0].bet, card.days[0].picks[0].toWin, card.atRisk]).toEqual(["$0", "$0.00", 0]);
    const out = view([r]);
    expect(out).toContain("not staked: this game&#x27;s limit was already used");
    expect(view([withStake(row({ commence: SUN_LATE }), 1)])).not.toContain("not staked");
  });

  it("the card says in words how the dollars are set", () => {
    expect(view([row({ commence: SUN_LATE })])).toContain("Paper dollars: the engine&#x27;s quarter-Kelly stake on a $12,500 bankroll, $250 at most on one bet.");
  });
});

describe("the read", () => {
  const store = (key: string | null) => vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "pl_synckey" ? key : null), setItem: () => {} });

  it("no phrase on the device: no request is made", async () => {
    store(null);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await loadEnginePicks()).toEqual({ kind: "no-key" });
    expect(f).not.toHaveBeenCalled();
  });

  it("asks for the whole ledger once, with the phrase in the header and never in the address", async () => {
    store("test-phrase");
    const r = row({});
    const f = vi.fn(async () => new Response(JSON.stringify({ rows: [r], count: 1, health: { last: { finishedAt: "2026-11-15T16:45:00Z" } } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const out = await loadEnginePicks(() => T0);
    expect(out).toEqual({ kind: "ready", rows: [r], count: 1, lastRun: "2026-11-15T16:45:00Z", at: T0 });
    expect(f.mock.calls).toEqual([["/api/anytime?limit=2000", { headers: { "x-pl-sync": "test-phrase" }, cache: "no-store" }]]);
    expect(ENGINE_PICKS_URL).toBe("/api/anytime?limit=2000");
    expect(ENGINE_PICKS_URL).not.toContain("test-phrase");
  });

  it("a refused phrase, a server error, a bad body and a dropped request each have their own answer", async () => {
    store("test-phrase");
    const answer = async (res: Response | Error) => {
      vi.stubGlobal("fetch", vi.fn(async () => { if (res instanceof Error) throw res; return res; }));
      return loadEnginePicks(() => T0);
    };
    expect(await answer(new Response(JSON.stringify({ error: "bad-sync-key" }), { status: 401 }))).toEqual({ kind: "bad-key" });
    expect(await answer(new Response(JSON.stringify({ error: "store unreachable: store 403" }), { status: 502 }))).toEqual({ kind: "error", why: "store unreachable: store 403" });
    expect(await answer(new Response("<html>", { status: 500 }))).toEqual({ kind: "error", why: "the server answered 500" });
    expect(await answer(new Response(JSON.stringify({ ok: true }), { status: 200 }))).toEqual({ kind: "error", why: "the server answered 200" });
    expect(await answer(new Error("offline"))).toEqual({ kind: "error", why: "the request did not get through" });
  });
});

describe("as source", () => {
  const src = readFileSync("src/components/anytime/EnginePicks.tsx", "utf8");
  it("is mounted once, above the desk gate, and only on a live desk's card pages", () => {
    const tpl = readFileSync("app/template.tsx", "utf8");
    expect(tpl).toContain("      <EngineCardSlot />\n      <DeskGate>{children}</DeskGate>");
    expect(tpl.split("<EngineCardSlot />").length - 1).toBe(1);
    expect(src).toContain("if (!isCardPath(pathname) || !isCardSport(sport) || isArchived(sport)) return null;");
    expect(src).toContain("return <EnginePicks key={sport} sport={sport} />;");
  });

  it("reads on open, on return to the front and on a tap: no timer; and it writes nothing", () => {
    expect(src).not.toMatch(/setInterval|refetchInterval|setTimeout/);
    expect(src).toContain('document.addEventListener("visibilitychange", onShow);');
    expect(src).toContain('document.removeEventListener("visibilitychange", onShow);');
    /* two reads: the picks (with the phrase, in a header) and the team logos (no secret at all) */
    expect(src.split("fetch(").length - 1).toBe(2);
    expect(src).toContain("const r = await fetch(`/api/anytime/marks?sport=${sport}&dates=${days}`);");
    expect(src.split("x-pl-sync").length - 1).toBe(1);
    expect(src).not.toMatch(/method:\s*"(POST|PUT|DELETE)"/);
    expect(src).not.toContain("/api/anytime/run");
  });

  it("the older desks still seat nothing new: one generator, not two", () => {
    expect(readFileSync("src/lib/az/cutover.ts", "utf8")).toContain('export const ANYTIME_SINCE: string | null = "2026-11-13";');
  });
});
