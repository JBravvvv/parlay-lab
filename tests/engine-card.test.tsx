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
import { SETTLED_SHOWN, dayLabel, engineCard, isCardPath, isCardSport } from "@/lib/anytime/card";

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
    expect(out).toContain("FanDuel −105");
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
    expect(src.split("fetch(").length - 1).toBe(1);
    expect(src).not.toMatch(/method:\s*"(POST|PUT|DELETE)"/);
    expect(src).not.toContain("/api/anytime/run");
  });

  it("the older desks still seat nothing new: one generator, not two", () => {
    expect(readFileSync("src/lib/az/cutover.ts", "utf8")).toContain('export const ANYTIME_SINCE: string | null = "2026-11-13";');
  });
});
