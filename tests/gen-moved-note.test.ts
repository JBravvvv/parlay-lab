import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { parseEventProps } from "@/lib/cfb/props";
import type { CfbPropRow } from "@/lib/cfb/props-types";
import type { CfbGame } from "@/lib/cfb/types";
import { propLegOf, propQuote } from "@/components/cfb/CfbProps";
import { footballGenPool } from "@/lib/football/gen-pool";
import { buildPool } from "@/components/props/mlb-gen-pool";
import type { PropBoardGame } from "@/engine";
import { generate, poolOf, specSeed, type GenLeg, type GenPool, type GenSpec } from "@/lib/parlay-gen";
import { legExpired, movedLegs, samePrice, withBoard } from "@/lib/parlay-hold";
import { priceFootballProp } from "@/lib/sportsbook/football";
import { swapSettleBook } from "./helpers/settle-book";

/**
 * THE GENERATOR'S "MOVED" NOTE SAYS WHAT ADD TO SLIP WILL DO (2026-09-28, review of the September 28 bug pass).
 *
 * 1. A football re-pull restamps every game it fetches (pricedAt = now) whether or not a price moved, and every football
 *    leg carried that stamp as its quote time — pregame legs too. So after a re-pull at the very same prices every held
 *    pregame leg read "moved", and Add to slip refused it. Only an in-play leg carries a quote time now, as on MLB.
 * 2. The note compared prices against the pool, which is rebuilt only when its inputs change, while Add also refuses on
 *    the clock (first pitch or kickoff passed, a live quote past its age cap). A first pitch that passed read as nothing
 *    for up to five minutes. The note now counts Add's clock rule (`legExpired`) too — the one rule both read.
 *
 * The football board is the repo's 2026-09-05 fixture slate with the synthetic per-event props payload the CFB prop tests
 * read (tests/football-gen.test.ts); the server parses the SAME event body at two pulls and stamps each pull's time.
 */
vi.stubGlobal("React", React);

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => swapSettleBook(JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8")));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const GAME = "401856634"; // kickoff 16:00Z
const KICK = Date.parse("2026-09-05T16:00:00Z");
const T1 = Date.parse("2026-09-05T11:40:00Z");
const T2 = Date.parse("2026-09-05T12:10:00Z");
const board = buildCfbBoard({ date: "2026-09-05", espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: T1, bankroll: 2500 });
const ala = board.games.find((g) => g.home.abbr === "ALA") as CfbGame;

/* the server parses the same upstream body at each pull; the client prices at the default book (useFootballPropsPrices) */
const pull = (at: number, status?: CfbPropRow["status"]) => ({
  rows: parseEventProps(EVENT, ala, { now: T1, bankroll: 2500 }).map((r) => priceFootballProp(status ? { ...r, status } : r, "draftkings", 2500)),
  pricedAt: { [GAME]: new Date(at).toISOString() } as Record<string, string>,
});
const MARKETS = ["anytime_td", "pass_yds", "rush_yds", "rec_yds", "receptions"] as const;
const SPEC = {
  market: "anytime_td", markets: [...MARKETS], legs: 3, legMinAm: -230, legMaxAm: 200, payout: null, sides: "both",
  onePerGame: false, onePerTeam: false, czOnly: false, includeStarted: true, modelOnly: false, phase: "mixed",
  pinned: [null, null, null], preferDiversity: true, spread: false,
} as unknown as GenSpec;
const build = (b: ReturnType<typeof pull>, nowMs: number): GenPool<unknown> =>
  footballGenPool(b.rows, { market: "anytime_td", markets: [...MARKETS], includeStarted: true, phase: "mixed" } as never, {
    mode: "cz", nowMs, pricedAt: b.pricedAt, liveMaxAgeMs: 600_000, teamOf: (r) => r.team, quoteOf: propQuote, legOf: propLegOf,
  }) as GenPool<unknown>;

describe("a football re-pull at the same prices is not a move (review: every held pregame leg read 'moved' and Add refused after a restamp)", () => {
  it("THE CASE: spun at 12:00Z, the 12:10Z re-pull restamps the game at identical prices — nothing moved, and the board's copies show", () => {
    const p1 = build(pull(T1), T1 + 20 * 60_000);
    const drawn = generate(p1, { ...SPEC, pricingBook: "DK" } as never, specSeed(SPEC, "2026-09-05", 0));
    if (!drawn.ok) throw new Error("the fixture must generate: " + JSON.stringify(drawn));
    const legs = drawn.ticket.legs;
    expect(legs.length).toBe(3);
    expect(legs.every((l) => !l.started)).toBe(true);
    /* a pregame leg carries no quote time */
    expect(p1.legs.filter((l) => !l.started).every((l) => l.quoteAt === undefined)).toBe(true);
    const p2 = build(pull(T2), T2 + 60_000);
    for (const l of legs) expect(samePrice(l, p2.byId.get(l.id)!)).toBe(true);
    expect(movedLegs(legs, p2)).toBe(0);
    expect(movedLegs(legs, p2, { nowMs: T2 + 60_000, sport: "cfb" })).toBe(0);
    const shown = withBoard(drawn, p2);
    if (!shown.ok) throw new Error("unreachable");
    shown.ticket.legs.forEach((l, i) => expect(l).toBe(p2.byId.get(legs[i].id)));
  });
  it("an in-play leg keeps its quote time: re-quoted at identical prices it still counts, and a pregame leg held past kickoff counts", () => {
    const q1 = KICK + 5 * 60_000, q2 = KICK + 12 * 60_000;
    const live = (at: number) => build(pull(at, "live"), at + 60_000);
    const p1 = live(q1), p2 = live(q2);
    const legs = p1.legs.slice(0, 3);
    expect(legs.length).toBe(3);
    expect(legs.every((l) => l.started && l.quoteAt === new Date(q1).toISOString())).toBe(true);
    expect(movedLegs(legs, p2)).toBe(3);
    const pre = build(pull(T1), T1 + 60_000).legs.slice(0, 3);
    expect(pre.every((l) => !l.started && l.quoteAt === undefined)).toBe(true);
    expect(movedLegs(pre, p2)).toBe(3);
  });
});

/* the MLB pool the hold tests build (tests/gen-hold-drag.test.ts): the repo's gen-pool fixture at nowMs 0, nothing started */
const FIXTURE = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "gen-pool.json"), "utf8")) as { propBoard: PropBoardGame[] };
const MLB_SPEC = { market: "batter_hits_runs_rbis", legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o", onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null] } as GenSpec;
const MLB_POOL = buildPool(FIXTURE.propBoard, MLB_SPEC, 0) as GenPool<unknown>;
const pool = (legs: GenLeg<unknown>[]) => poolOf(legs, { rows: 0, startedDropped: 0, noParlayDropped: 0 });

describe("the moved note counts what Add to slip refuses on the clock (review: a first pitch that passed read as nothing until the next pool rebuild)", () => {
  const base = { id: "x", am: -110, prob: 55, src: "model", side: "o", label: "A", sub: "", leg: null, dec: 1.91, gameKey: "g", playerKey: "g|a", book: "DK", ev: 0.05, market: "batter_hits", line: 0.5 } as unknown as GenLeg<unknown>;
  const at = Date.parse("2026-09-28T23:05:00Z");
  it("legExpired is Add's own clock rule: a passed start, a missing or aged live quote (30 min MLB, 10 min football)", () => {
    expect(legExpired({ ...base, started: false, start: "2026-09-28T23:05:00Z" }, at)).toBe(true);
    expect(legExpired({ ...base, started: false, start: "2026-09-28T23:05:00Z" }, at - 1)).toBe(false);
    expect(legExpired({ ...base, started: false, start: null }, at)).toBe(false);
    const quoted = (min: number) => new Date(at - min * 60_000).toISOString();
    expect(legExpired({ ...base, started: true }, at, "mlb")).toBe(true);
    expect(legExpired({ ...base, started: true, sport: "mlb", quoteAt: quoted(31) }, at)).toBe(true);
    expect(legExpired({ ...base, started: true, sport: "mlb", quoteAt: quoted(29) }, at)).toBe(false);
    /* a leg with no sport of its own reads the desk's */
    expect(legExpired({ ...base, started: true, quoteAt: quoted(29) }, at, "mlb")).toBe(false);
    expect(legExpired({ ...base, started: true, quoteAt: quoted(11) }, at, "nfl")).toBe(true);
    expect(legExpired({ ...base, started: true, sport: "cfb", quoteAt: quoted(9) }, at, "mlb")).toBe(false);
    expect(legExpired({ ...base, started: true, sport: "nfl", quoteAt: quoted(11) }, at, "mlb")).toBe(true);
  });
  it("THE CASE: the pool built before first pitch still holds the leg at its price; with the clock past first pitch the note counts it, once", () => {
    const withStart = MLB_POOL.legs.filter((l) => !l.started && l.start);
    expect(withStart.length).toBeGreaterThan(3);
    const legs = withStart.slice(0, 3);
    const P = pool(MLB_POOL.legs);
    const first = Math.min(...legs.map((l) => Date.parse(l.start!)));
    expect(movedLegs(legs, P)).toBe(0);
    expect(movedLegs(legs, P, { nowMs: first - 60_000, sport: "mlb" })).toBe(0);
    const after = legs.filter((l) => Date.parse(l.start!) <= first + 60_000).length;
    expect(after).toBeGreaterThan(0);
    expect(movedLegs(legs, P, { nowMs: first + 60_000, sport: "mlb" })).toBe(after);
    /* a leg that is both gone and past its start counts once */
    const gone = pool(MLB_POOL.legs.filter((l) => l.id !== legs[0].id));
    expect(movedLegs(legs, gone, { nowMs: Math.max(...legs.map((l) => Date.parse(l.start!))) + 60_000, sport: "mlb" })).toBe(3);
  });
  it("the source: Add and the note read one rule; the note re-reads on the live clock and on a refused Add, never on the server", () => {
    const hook = stripComments(fs.readFileSync(path.join(process.cwd(), "src/components/props/useParlayGen.ts"), "utf8"));
    expect(hook).toContain("return legExpired(l,now,sport) || !fresh||");
    expect(hook).not.toMatch(/1_800_000|600_000/);
    expect(hook).toContain("const clock = useLiveClock();");
    expect(hook).toContain("movedLegs(result.ticket.legs, pool, spec.phase && (clock || checkedAt) ? { nowMs: Math.max(clock, checkedAt), sport } : undefined)");
    expect(hook).toMatch(/setCheckedAt\(now\);\s*setSetupNotice\("These quotes changed or are no longer available\. Regenerate before adding to the slip\."\);return;/);
    const gp = stripComments(fs.readFileSync(path.join(process.cwd(), "src/lib/football/gen-pool.ts"), "utf8"));
    expect(gp).toContain("...(started && quotedAt ? { quoteAt: quotedAt } : {}),");
    expect(gp).not.toMatch(/\bquoteAt: quotedAt,/);
  });
});
