import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";
import { buildCfbBoard } from "@/lib/cfb/model";
import { parseEventProps } from "@/lib/cfb/props";
import { CFB_PROP_MARKETS, type CfbPropRow } from "@/lib/cfb/props-types";
import type { CfbBoard, CfbGame } from "@/lib/cfb/types";
import { propLegOf, propQuote } from "@/components/cfb/CfbProps";
import type { CfbSlipLeg } from "@/components/cfb/CfbSlip";
import { FOOTBALL_GEN_MARKETS, footballGenPool, footballSide, type FootballPriceMode } from "@/lib/football/gen-pool";
import { addCfbLegs } from "@/components/cfb/CfbProps";
import { GenSheet, genFailLine } from "@/components/props/GenSheet";
import { bandDec, generate, specSeed, type GenPool, type GenResult, type GenSpec } from "@/lib/parlay-gen";
import { amFmt, amToDec } from "@/lib/ticket-math";

/**
 * THE PARLAY GENERATOR ON FOOTBALL — INSTRUCTION 52 (2026-09-12), Josh's word, verbatim:
 * "Parlay Generator should be on CFB & NFL just like it is on MLB".
 *
 * ONE adapter for both football desks, because there is one football board: CfbProps is the
 * shared surface and NflProps is an 18-line wrapper around it (INSTRUCTION 47). So this file
 * tests the CFB board and the NFL desk inherits every line of it.
 *
 * EVERY NUMBER BELOW IS THE FIXTURE'S OWN. The board is the repo's 2026-09-05 ESPN/odds slate
 * with the synthetic per-event props payload the CFB prop tests already use
 * (tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json — invented retail shapes, never
 * captured quotes, and the same 27 rows tests/cfb-props.test.ts reads). Nothing here quotes a
 * price the fixture does not post; where a test needs a state the fixture lacks (a FINAL game,
 * a second game on the slate) it CLONES a real row and changes that one field, leaving the
 * posted price untouched.
 *
 * A PURE READER: no fetch, no extra market on any pull, not one Odds credit, no money seated,
 * no ledger row. The node test runtime has no jsdom, so the rendering claims are made on
 * `renderToStaticMarkup` output and on source pins.
 */
vi.stubGlobal("React", React);

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
const ODDS = readJson("odds-ncaaf-2026-09-05.json") as unknown[];
const FPI = readJson("espn-fpi.json") as unknown;
const EVENT = readJson("odds-ncaaf-event-props.synthetic.json") as Record<string, unknown>;
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";

const board: CfbBoard = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
const ala = board.games.find((g) => g.home.abbr === "ALA") as CfbGame;
const rows: CfbPropRow[] = parseEventProps(EVENT, ala, { now: NOW, bankroll: 2500 });
/** the fixture's one priced game, 16:00Z kickoff, every row still `upcoming` */
const GAME = "401856634";
const KICKOFF = "2026-09-05T16:00:00Z";

const root = path.join(__dirname, "..");
const readSrc = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const rowsIn = (market: string, rs: readonly CfbPropRow[] = rows) => rs.filter((r) => r.market === market);
const find = (market: string, player: string, side: string): CfbPropRow => {
  const r = rows.find((x) => x.market === market && x.player === player && x.side === side);
  if (!r) throw new Error(`no row ${market} ${player} ${side}`);
  return r;
};
const clone = (): CfbPropRow[] => JSON.parse(JSON.stringify(rows)) as CfbPropRow[];

/** the CFB desk's default generator spec (CfbProps.tsx), every knob explicit */
const spec = (o: Partial<GenSpec> = {}): GenSpec => {
  const legs = o.legs ?? 4;
  return {
    market: "anytime_td",
    legs,
    legMinAm: -250,
    legMaxAm: 250,
    payout: null,
    sides: "o",
    onePerGame: true,
    czOnly: false,
    includeStarted: false,
    modelOnly: false,
    pinned: new Array(legs).fill(null),
    ...o,
  };
};

/** the pool exactly as the desk builds it: the board's own quote picker and its own leg minter */
const poolFor = (
  s: GenSpec,
  mode: FootballPriceMode = "best",
  nowMs = 0,
  rs: readonly CfbPropRow[] = rows,
): GenPool<CfbSlipLeg> =>
  footballGenPool<CfbSlipLeg>(rs, s, {
    mode,
    nowMs,
    teamOf: (row) => row.teamAbbr ?? row.team,
    quoteOf: propQuote,
    legOf: propLegOf,
  });

const ok = (r: GenResult<CfbSlipLeg>) => {
  if (!r.ok) throw new Error(`expected a ticket, got ${JSON.stringify(r.fail)}`);
  return r.ticket;
};
const fail = (r: GenResult<CfbSlipLeg>) => {
  if (r.ok) throw new Error(`expected a failure, got ${r.ticket.legs.map((l) => l.id).join(", ")}`);
  return r.fail;
};

describe("the fixture board this file reasons about", () => {
  it("is one game, 27 rows across the six player markets, none of them started", () => {
    expect(rows).toHaveLength(27);
    expect(new Set(rows.map((r) => r.gameId))).toEqual(new Set([GAME]));
    for (const r of rows) {
      expect(r.status).toBe("upcoming");
      expect(Date.parse(r.kickoff)).toBe(Date.parse(KICKOFF));
    }
    expect(FOOTBALL_GEN_MARKETS.map((m) => m.key)).toEqual(CFB_PROP_MARKETS.map((m) => m.id));
    expect(FOOTBALL_GEN_MARKETS.map((m) => m.label)).toEqual(["Anytime TD", "Pass TDs", "Pass Yds", "Receptions", "Rush Yds", "Rec Yds"]);
    /* no football market is suspended — that flag is the MLB engine's own (hrrAltMax / outsSusp) */
    expect(FOOTBALL_GEN_MARKETS.some((m) => m.suspended)).toBe(false);
  });
});

describe("ONE leg per row, not two — and the side it actually is", () => {
  it("pass_yds: 4 board rows → 4 legs, each carrying that row's own key", () => {
    const s = spec({ market: "pass_yds", sides: "both" });
    const pool = poolFor(s);
    expect(rowsIn("pass_yds")).toHaveLength(4);
    /* the MLB adapter mints BOTH sides from one row; a football row IS one side already, so
       four rows must be four legs — five would mean a side was invented, three that one was lost */
    expect(pool.legs).toHaveLength(4);
    expect(pool.rows).toBe(4);
    expect(pool.games).toBe(1);
    expect(pool.legs.map((l) => l.id).sort()).toEqual(rowsIn("pass_yds").map((r) => r.key).sort());
    expect(pool.byId.size).toBe(4);
  });

  it("over → o, under → u, and anytime TD's \"yes\" is an OVER (there is no under to take)", () => {
    expect(footballSide("over")).toBe("o");
    expect(footballSide("under")).toBe("u");
    expect(footballSide("yes")).toBe("o");
    for (const market of CFB_PROP_MARKETS.map((m) => m.id)) {
      const pool = poolFor(spec({ market, sides: "both" }));
      expect(pool.legs.length).toBeGreaterThan(0);
      for (const l of pool.legs) {
        const row = rows.find((r) => r.key === l.id)!;
        expect(l.side, l.id).toBe(row.side === "under" ? "u" : "o");
        /* the trap this pin exists for: a football row key ENDS IN ITS LINE ("…|over|245.5"),
           so reading the side off the last character of the id called every leg an under */
        expect(l.id.endsWith(`|${l.side}`)).toBe(false);
      }
    }
  });

  it("the OVERS filter returns overs, the UNDERS filter unders — on rows whose ids say neither", () => {
    const both = poolFor(spec({ market: "rec_yds", sides: "both" }));
    expect(both.legs).toHaveLength(4);
    const overs = ok(generate(both, spec({ market: "rec_yds", sides: "o", legs: 2, onePerGame: false }), 7));
    for (const l of overs.legs) expect(rows.find((r) => r.key === l.id)!.side).toBe("over");
    const unders = ok(generate(both, spec({ market: "rec_yds", sides: "u", legs: 2, onePerGame: false }), 7));
    for (const l of unders.legs) expect(rows.find((r) => r.key === l.id)!.side).toBe("under");
  });

  it("the sub line is the bet as the board words it, and never carries the player's name", () => {
    const yes = poolFor(spec({ market: "anytime_td", sides: "both" }));
    for (const l of yes.legs) expect(l.sub).toBe("Anytime TD");
    const ou = poolFor(spec({ market: "pass_yds", sides: "both" }));
    const simpson = ou.legs.find((l) => l.id === find("pass_yds", "Ty Simpson", "over").key)!;
    expect(simpson.label).toBe("Ty Simpson");
    expect(simpson.sub).toBe("Pass Yds O 245.5");
    expect(ou.legs.find((l) => l.id === find("pass_yds", "Ty Simpson", "under").key)!.sub).toBe("Pass Yds U 245.5");
    for (const l of [...yes.legs, ...ou.legs]) expect(l.sub).not.toContain(l.label);
  });
});

describe("a cell the board draws as an untappable dash is never offered", () => {
  it("Caesars alone at 249.5 against a 245.5 consensus: no fair at that line, so no leg", () => {
    /* the fixture's real shape: Caesars posts -110 at 249.5 while the consensus line is 245.5,
       and the model's `fair` exists ONLY at the row's own line — the board prints EV "—" there */
    const row = find("pass_yds", "Ty Simpson", "over");
    expect(row.line).toBe(245.5);
    const cz = propQuote(row, "cz")!;
    expect(cz.price).toBe(-110);
    expect(cz.line).toBe(249.5);
    expect(propLegOf(row, cz)).toBeNull();
    const best = propQuote(row, "best")!;
    expect(best.line).toBe(245.5);
    expect(propLegOf(row, best)).not.toBeNull();
  });

  it("a player with no Caesars quote at all is never invented one", () => {
    const row = find("pass_yds", "Katin Houser", "over");
    expect(row.cz).toBeNull();
    expect(propQuote(row, "cz")).toBeNull();
    expect(propQuote(row, "best")!.price).toBe(-110);
  });

  it("so the whole Caesars pass_yds column is empty — 4 rows scanned, 0 legs, an honest no-rows", () => {
    const s = spec({ market: "pass_yds", sides: "both" });
    const cz = poolFor(s, "cz");
    expect(cz.rows).toBe(4); // the board drew four cells
    expect(cz.legs).toHaveLength(0); // all four were dashes
    expect(fail(generate(cz, s, 1)).code).toBe("no-rows");
    /* and the same four rows at the best posted price are four real legs */
    expect(poolFor(s, "best").legs).toHaveLength(4);
  });

  it("a row with no model fair is refused in BOTH price columns (prob 0 is not a price)", () => {
    /* Katin Houser's 22.5 rush_yds pair has a Caesars quote AT ITS OWN LINE and still no fair —
       so the quote is not the test; the fair is */
    const row = find("rush_yds", "Katin Houser", "over");
    expect(row.fair).toBeNull();
    expect(propQuote(row, "cz")!.line).toBe(22.5);
    expect(propLegOf(row, propQuote(row, "cz")!)).toBeNull();
    expect(propLegOf(row, propQuote(row, "best")!)).toBeNull();
    expect(rowsIn("rush_yds")).toHaveLength(6);
    for (const mode of ["cz", "best"] as FootballPriceMode[]) {
      const pool = poolFor(spec({ market: "rush_yds", sides: "both" }), mode);
      expect(pool.rows).toBe(6);
      expect(pool.legs).toHaveLength(4);
      expect(pool.legs.some((l) => l.id.includes("katin-houser"))).toBe(false);
      for (const l of pool.legs) expect(l.prob).toBeGreaterThan(0);
    }
  });

  it("every leg's price and win % are the desk's own leg, byte for byte", () => {
    for (const mode of ["cz", "best"] as FootballPriceMode[]) {
      for (const market of CFB_PROP_MARKETS.map((m) => m.id)) {
        for (const l of poolFor(spec({ market, sides: "both" }), mode).legs) {
          const row = rows.find((r) => r.key === l.id)!;
          const q = propQuote(row, mode)!;
          expect(l.am).toBe(q.price);
          expect(l.prob).toBe(row.fair! * 100);
          expect(l.prob).toBe(l.leg.prob);
          expect(l.am).toBe(l.leg.cz);
          expect(l.book).toBe(l.leg.book);
          expect(l.dec).toBe(amToDec(q.price));
          expect(l.ev).toBeCloseTo((l.prob / 100) * l.dec - 1, 12);
          /* market-sourced, every one of them: the win % is the de-vigged consensus of the books
             that posted the line, never a simulation */
          expect(l.src).toBe("market");
        }
      }
    }
  });

  it("the team tag is the row's own or null — this fixture carries none, so nothing says ALA", () => {
    for (const market of CFB_PROP_MARKETS.map((m) => m.id)) {
      for (const l of poolFor(spec({ market, sides: "both" })).legs) {
        expect(rows.find((r) => r.key === l.id)!.teamAbbr).toBeNull();
        expect(l.team).toBeNull();
        expect(l.label).not.toContain("ALA");
        expect(l.sub).not.toContain("ALA");
      }
    }
  });
});

describe("the per-leg band is measured in DECIMAL on the football price", () => {
  const ATD = { market: "anytime_td", sides: "both" as const };

  it("the desk's default -250 → +250 is 1.40 → 3.50, and Ty Simpson's +320 is outside it", () => {
    const b = bandDec(-250, 250);
    expect(b.lo).toBeCloseTo(1.4, 10);
    expect(b.hi).toBeCloseTo(3.5, 10);
    const pool = poolFor(spec(ATD), "cz");
    expect(pool.legs).toHaveLength(5); // five players, one "yes" row each
    expect(pool.legs.map((l) => l.am).sort((x, y) => x - y)).toEqual([-140, -125, 130, 165, 320]);
    const simpson = pool.legs.find((l) => l.id === find("anytime_td", "Ty Simpson", "yes").key)!;
    expect(simpson.am).toBe(320);
    expect(simpson.dec).toBeCloseTo(4.2, 10);
    expect(simpson.dec).toBeGreaterThan(b.hi);
    const inBand = pool.legs.filter((l) => l.dec >= b.lo && l.dec <= b.hi);
    expect(inBand).toHaveLength(4);
  });

  it("…so a 5-leg request reports short-pool have 4, and a 4-leg one never seats him", () => {
    const five = spec({ ...ATD, legs: 5, onePerGame: false });
    const pool = poolFor(five, "cz");
    const f = fail(generate(pool, five, 3));
    expect(f).toMatchObject({ code: "short-pool", have: 4, want: 5 });
    if (f.code !== "short-pool") return;
    /* one-per-game is already off and no other filter is engaged, so there is no relaxation to
       offer — the honest answer is "widen the band", never a silent relaxation */
    expect(f.relax).toBeNull();
    const four = spec({ ...ATD, legs: 4, onePerGame: false });
    const t = ok(generate(poolFor(four, "cz"), four, 3));
    expect(t.legs).toHaveLength(4);
    expect(t.legs.some((l) => l.id.includes("ty-simpson"))).toBe(false);
    for (const l of t.legs) expect(l.dec).toBeLessThanOrEqual(bandDec(-250, 250).hi);
    expect(t.outsideLegBand).toEqual([]);
  });

  it("widen the band to +400 and he is seatable — the band is a filter, never a price", () => {
    const s = spec({ ...ATD, legs: 5, onePerGame: false, legMinAm: -250, legMaxAm: 400 });
    const t = ok(generate(poolFor(s, "cz"), s, 3));
    expect(t.legs).toHaveLength(5);
    expect(t.legs.some((l) => l.id.includes("ty-simpson"))).toBe(true);
    /* the price is still the fixture's own +320 — widening admitted it, it did not reprice it */
    expect(t.legs.find((l) => l.id.includes("ty-simpson"))!.am).toBe(320);
  });

  it("each price column is filtered on ITS OWN price (Caesars +320 vs best +330)", () => {
    expect(poolFor(spec(ATD), "best").legs.map((l) => l.am).sort((x, y) => x - y)).toEqual([-130, -115, 140, 170, 330]);
    const s = spec({ ...ATD, legs: 5, onePerGame: false, legMinAm: -250, legMaxAm: 325 });
    /* +320 clears a +325 ceiling and +330 does not — same band, two columns, two answers */
    expect(ok(generate(poolFor(s, "cz"), s, 3)).legs).toHaveLength(5);
    expect(fail(generate(poolFor(s, "best"), s, 3))).toMatchObject({ code: "short-pool", have: 4, want: 5 });
  });
});

describe("pins — the slots Josh keeps, on football rows", () => {
  const WIDE = { market: "anytime_td", sides: "both" as const, legs: 3, onePerGame: false, legMinAm: -400, legMaxAm: 400 };

  it("a kept slot holds its leg and its slot across every re-roll, while the others move", () => {
    const base = spec(WIDE);
    const pool = poolFor(base, "cz");
    const first = ok(generate(pool, base, specSeed(base, DATE, 0)));
    const keep = first.legs[0].id;
    const pinned = spec({ ...WIDE, pinned: [keep, null, null] });
    const seen = new Set<string>();
    for (let roll = 0; roll < 8; roll++) {
      const t = ok(generate(poolFor(pinned, "cz"), pinned, specSeed(pinned, DATE, roll)));
      expect(t.legs[0].id).toBe(keep);
      expect(t.legs).toHaveLength(3);
      expect(new Set(t.legs.map((l) => l.id)).size).toBe(3);
      seen.add(t.legs.slice(1).map((l) => l.id).join(","));
    }
    expect(seen.size, "the unpinned slots must actually spin").toBeGreaterThan(1);
  });

  it("a kept slot outside the band rides along and is REPORTED, never silently dropped", () => {
    const simpson = find("anytime_td", "Ty Simpson", "yes").key;
    const s = spec({ market: "anytime_td", sides: "both", legs: 3, onePerGame: false, pinned: [simpson, null, null] });
    const t = ok(generate(poolFor(s, "cz"), s, 11));
    expect(t.legs[0].id).toBe(simpson);
    expect(t.outsideLegBand).toEqual([simpson]);
    /* and nothing ELSE breaks the band — only the slot he chose to keep */
    for (const l of t.legs.slice(1)) expect(l.dec).toBeLessThanOrEqual(bandDec(-250, 250).hi);
  });

  it("a kept slot the board no longer posts is pin-missing, never a quiet substitution", () => {
    const s = spec({ ...WIDE, pinned: [`${GAME}|anytime_td|nobody-here|yes|`, null, null] });
    expect(fail(generate(poolFor(s, "cz"), s, 1))).toMatchObject({ code: "pin-missing" });
  });
});

describe("one player, one leg — and a name is only the same man inside one game", () => {
  it("both sides of one player's line cannot sit on one ticket (same-player pin conflict)", () => {
    const over = find("pass_yds", "Ty Simpson", "over").key;
    const under = find("pass_yds", "Ty Simpson", "under").key;
    const s = spec({ market: "pass_yds", sides: "both", legs: 2, onePerGame: false, pinned: [over, under] });
    expect(fail(generate(poolFor(s), s, 1))).toMatchObject({ code: "pin-conflict", why: "same-player" });
  });

  it("the SAME printed name in two different games is two different men", () => {
    /* a second game on the slate, cloned from the first so every price is still the fixture's:
       "Jam Miller" at two schools on one Saturday is not one player, and a global name key would
       refuse to put both on a ticket */
    const other = "401999999";
    const twin: CfbPropRow[] = [
      ...rows,
      ...clone().map((r) => ({ ...r, gameId: other, key: r.key.replace(GAME, other) })),
    ];
    const a = find("anytime_td", "Jam Miller", "yes").key;
    const b = a.replace(GAME, other);
    const s = spec({ market: "anytime_td", sides: "both", legs: 2, onePerGame: false, pinned: [a, b] });
    const pool = poolFor(s, "cz", 0, twin);
    expect(pool.games).toBe(2);
    expect(pool.legs).toHaveLength(10);
    const t = ok(generate(pool, s, 1));
    expect(t.legs.map((l) => l.id)).toEqual([a, b]);
    /* the per-game key is what makes that legal */
    expect(pool.byId.get(a)!.playerKey).toBe(`${GAME}|jam-miller`);
    expect(pool.byId.get(b)!.playerKey).toBe(`${other}|jam-miller`);
  });
});

describe("one leg per game, on a one-game slate", () => {
  it("asks for 2 and says only 1 fits — naming the one control that would open it up", () => {
    const s = spec({ market: "anytime_td", sides: "both", legs: 2 });
    const f = fail(generate(poolFor(s, "cz"), s, 1));
    expect(f).toMatchObject({ code: "short-pool", have: 1, want: 2, relax: "same-game" });
  });

  it("and with two-legs-from-one-game on, it fills and SAYS the legs are correlated", () => {
    const s = spec({ market: "anytime_td", sides: "both", legs: 2, onePerGame: false });
    const t = ok(generate(poolFor(s, "cz"), s, 1));
    expect(t.legs).toHaveLength(2);
    expect(t.sameGame).toEqual([GAME]);
  });
});

describe("a game under way, and a game that is over", () => {
  it("a started game is dropped by default and admitted only when Josh asks", () => {
    const s = spec({ market: "anytime_td", sides: "both", legs: 2, onePerGame: false });
    const mid = Date.parse("2026-09-05T17:00:00Z"); // an hour past the fixture's 16:00Z kickoff
    const dropped = poolFor(s, "cz", mid);
    expect(dropped.startedDropped).toBe(5);
    expect(dropped.rows).toBe(0);
    expect(dropped.legs).toHaveLength(0);
    const admitted = poolFor({ ...s, includeStarted: true }, "cz", mid);
    expect(admitted.legs).toHaveLength(5);
    expect(admitted.startedDropped).toBe(0);
    for (const l of admitted.legs) expect(l.started).toBe(true); // flagged, so the sheet can say "live"
    /* a row the feed marks live is started whatever the clock says */
    const live = clone().map((r) => ({ ...r, status: "live" as const }));
    expect(poolFor(s, "cz", 0, live).startedDropped).toBe(5);
  });

  it("a FINAL or POSTPONED game is never offered at any price, and includeStarted cannot reach it", () => {
    for (const status of ["final", "postponed"] as const) {
      const done = clone().map((r) => ({ ...r, status }));
      const s = spec({ market: "anytime_td", sides: "both", legs: 2, onePerGame: false, includeStarted: true });
      const pool = poolFor(s, "cz", Date.parse("2026-09-06T00:00:00Z"), done);
      /* ITS OWN COUNTER (INSTRUCTION 52 fix pass). These five used to be filed under
         `noParlayDropped`, which the sheet prints as "the book bars from parlays" — so a
         Saturday-evening board, where the morning games are final and the night games are not,
         told Josh Caesars had barred legs nobody barred. That counter is the BOOK's flag and
         football never sets it. */
      expect(pool.finishedDropped).toBe(5);
      expect(pool.noParlayDropped).toBe(0);
      expect(pool.rows).toBe(0);
      expect(pool.legs).toHaveLength(0);
      expect(pool.startedDropped).toBe(0); // the game is not "started", it is finished
    }
  });

  it("an unparseable kickoff is never guessed into started", () => {
    const vague = clone().map((r) => ({ ...r, kickoff: "" }));
    const s = spec({ market: "anytime_td", sides: "both" });
    const pool = poolFor(s, "cz", Date.parse("2030-01-01T00:00:00Z"), vague);
    expect(pool.startedDropped).toBe(0);
    expect(pool.legs).toHaveLength(5);
    for (const l of pool.legs) expect(l.started).toBe(false);
  });
});

describe("a yes-only market: the board is full of it, and there is no under to take", () => {
  /**
   * INSTRUCTION 52 fix pass. Anytime TD is the football board's FIRST prop market and a yes-only
   * one: every row is a "yes", which this adapter counts as an over. Asking for unders there used
   * to empty the eligible set and come back `no-rows`, which the sheet prints as "No Anytime TD
   * lines on this board" — a false statement about a board that was showing dozens of them, and
   * the diagnostic line directly above it said "eligible 0" while the pool line said otherwise.
   * No relaxation was offered either, so the Generate button went dead with nothing on screen
   * pointing at the control Josh had just pressed.
   */
  const UNDERS = spec({ market: "anytime_td", sides: "u", legs: 2, onePerGame: false });

  it("names the side, quotes the legs that ARE posted, and never calls the board empty", () => {
    const pool = poolFor(UNDERS, "cz");
    expect(pool.legs).toHaveLength(5); // the board HAS five anytime-TD legs
    const f = fail(generate(pool, UNDERS, 1));
    expect(f).toEqual({ code: "one-sided", want: "u", has: "o", rows: 5 });
    const line = genFailLine(f, { marketLabel: "Anytime TD", legs: 2, loAm: -250, hiAm: 250 });
    expect(line).toContain("No Anytime TD under is posted on this board");
    expect(line).toContain("all 5 Anytime TD legs here are overs");
    expect(line).toContain("Switch to overs");
    expect(line).not.toContain("nothing here to build a parlay from");
  });

  it("a market that really has no rows still says exactly what it said before", () => {
    /* the Caesars pass_yds column is four dashes — an empty pool, and `no-rows` is the truth */
    const s = spec({ market: "pass_yds", sides: "u" });
    const empty = poolFor(s, "cz");
    expect(empty.legs).toHaveLength(0);
    expect(fail(generate(empty, s, 1))).toEqual({ code: "no-rows" });
  });

  it("the overs on that same market build a ticket — the side filter was the whole problem", () => {
    const overs = { ...UNDERS, sides: "o" as const };
    expect(ok(generate(poolFor(overs, "cz"), overs, 1)).legs).toHaveLength(2);
  });
});

describe("determinism — same board, same spec, same spin, same ticket on any device", () => {
  it("is stable across calls and independent of the order the rows arrived in", () => {
    const s = spec({ market: "anytime_td", sides: "both", legs: 3, onePerGame: false });
    const seed = specSeed(s, DATE, 0);
    const a = ok(generate(poolFor(s, "cz"), s, seed));
    const b = ok(generate(poolFor(s, "cz"), s, seed));
    expect(b.legs.map((l) => l.id)).toEqual(a.legs.map((l) => l.id));
    expect(b.key).toBe(a.key);
    /* the fixture's pass_yds rows arrive AFTER anytime_td; poolOf's canonical id sort is what
       makes the answer the same on a device that received them in another order */
    const shuffled = [...rows].reverse();
    const c = ok(generate(poolFor(s, "cz", 0, shuffled), s, seed));
    expect(c.legs.map((l) => l.id)).toEqual(a.legs.map((l) => l.id));
  });
});

describe("the sheet renders for the FOOTBALL market list", () => {
  const SPEC = spec({ market: "anytime_td", sides: "both", legs: 3, onePerGame: false, legMinAm: -400, legMaxAm: 400 });
  const POOL = poolFor(SPEC, "cz");
  const RESULT = generate(POOL, SPEC, specSeed(SPEC, DATE, 0));
  const NOTE = "Every win % here is the de-vigged consensus of the books that posted the line; the EV beside it is measured against the one price you would take.";
  const STUB = "The parlay generator builds PLAYER-prop parlays — pick a player market above and it appears here. Sides, totals and moneylines are game markets and have no player slots yet.";

  const sheet = (over: Record<string, unknown> = {}) =>
    html(
      createElement(GenSheet, {
        market: SPEC.market,
        marketLabel: "Anytime TD",
        markets: FOOTBALL_GEN_MARKETS,
        pool: POOL,
        renderMark: () => null,
        renderName: ({ name }: { name: string }) => createElement("span", { className: "truncate" }, name),
        spec: SPEC,
        onSpec: () => {},
        result: RESULT,
        onGenerate: () => {},
        onTogglePin: () => {},
        onAdd: () => {},
        canUndo: false,
        onUndo: () => {},
        open: true,
        onOpen: () => {},
        boardAt: null,
        showModelOnly: false,
        marketNote: NOTE,
        stubNote: STUB,
        ...over,
      } as Parameters<typeof GenSheet>[0]),
    );

  it("prints the six football categories and no MLB one", () => {
    const out = sheet();
    expect(RESULT.ok).toBe(true);
    for (const m of FOOTBALL_GEN_MARKETS) expect(out).toContain(m.label);
    for (const mlb of ["H+R+RBI", "Total Bases", "Strikeouts", "Home Runs"]) expect(out).not.toContain(mlb);
  });

  it("prints the fixture's own players, bets and prices — nothing invented", () => {
    const out = sheet();
    if (!RESULT.ok) return;
    expect(RESULT.ticket.legs).toHaveLength(3);
    for (const l of RESULT.ticket.legs) {
      expect(out).toContain(l.label); // the plain name the football desk renders
      expect(out).toContain(amFmt(l.am));
      expect(rows.some((r) => r.key === l.id)).toBe(true);
    }
    expect(out).toContain("Anytime TD");
    expect(out).toContain(">mkt<"); // every football leg is market-priced, and the sheet says so
    expect(out).toContain(NOTE);
    /* the MLB sentence would be plainly false here */
    expect(out).not.toContain("EV is ~0 by construction");
  });

  it("hides the model-only toggle on football and offers it on MLB", () => {
    expect(sheet()).not.toContain("Model-priced legs only");
    expect(sheet({ showModelOnly: true })).toContain("Model-priced legs only");
    /* the controls that DO apply are still there */
    expect(sheet()).toContain("Caesars-priced legs only");
    expect(sheet()).toContain("Two legs from one game");
  });

  it("on the Sides rail it is the stub, not an empty generator", () => {
    const out = sheet({ gameMarket: true });
    expect(out).toContain('data-testid="props-gen-stub"');
    expect(out).not.toContain('data-testid="props-gen"');
    expect(out).toContain("Sides, totals and moneylines are game markets");
    expect(out).not.toContain("Moneyline and run line"); // the MLB wording
  });

  it("offers no Unders control on Anytime TD, and says in one line why", () => {
    /* the control that was a guaranteed dead end on the football default market */
    const atd = sheet();
    expect(atd).not.toContain(">Unders<");
    expect(atd).not.toContain(">Overs<");
    expect(atd).toContain("Anytime TD has one side only");
    /* …and it is still there on a real over/under market */
    const pass = sheet({ market: "pass_yds", marketLabel: "Pass Yds" });
    expect(pass).toContain(">Unders<");
    expect(pass).toContain(">Overs<");
    expect(pass).not.toContain("has one side only");
  });

  it("an unders request on a yes-only market gets the one-tap fix, not a dead Generate button", () => {
    const u = spec({ market: "anytime_td", sides: "u", legs: 3, onePerGame: false, legMinAm: -400, legMaxAm: 400 });
    const out = sheet({ spec: u, result: generate(poolFor(u, "cz"), u, 1) });
    expect(out).toContain("Switch to overs");
    expect(out).not.toContain("Spinning again would return the same answer");
    expect(out).not.toContain("No Anytime TD lines on this board");
  });

  it("a finished game is reported as finished, never as a parlay the book barred", () => {
    const done = clone().map((r) => ({ ...r, status: "final" as const }));
    const pool = poolFor(SPEC, "cz", Date.parse("2026-09-06T00:00:00Z"), done);
    const out = sheet({ pool, result: generate(pool, SPEC, 1) });
    expect(out).toContain("5 in games that have finished");
    expect(out).not.toContain("the book bars from parlays");
    /* and the verdict says the same thing the counter does, in Josh's own words */
    expect(out).toContain("Every Anytime TD game on this board has finished");
    expect(out).not.toContain("No Anytime TD lines on this board");
  });

  it("says it is waiting for the board rather than calling the board empty", () => {
    const empty = poolFor(spec({ market: "pass_yds", sides: "both" }), "cz");
    const out = sheet({ pool: empty, result: generate(empty, SPEC, 1), loading: true });
    expect(out).toContain("Waiting for today&#x27;s board…");
    const answered = sheet({ pool: empty, result: generate(empty, SPEC, 1), loading: false });
    expect(answered).toContain("No Anytime TD lines on this board");
  });
});

describe('"Add to slip" ADDS — the Sides rail survives a spin (INSTRUCTION 52 fix pass)', () => {
  /**
   * On football ONE slip carries the Sides rail's spreads and the prop rails' legs, and the
   * generator used to hand `setLegs` the generated legs alone — so three tapped spreads vanished
   * the moment Josh pressed a button labelled "Add to slip". Every other route into this slip
   * appends (`addCfbLeg`), and now this one does too.
   */
  const side = (gameId: string): CfbSlipLeg => ({
    kind: "side",
    key: `${gameId}|spread|home|-3.5`,
    gameId,
    label: "Alabama -3.5",
    sub: "ECU @ ALA · Sat 9:00 AM",
    market: "spread",
    cz: -110,
    book: "CZ",
    prob: 52.1,
  });
  const S = spec({ market: "anytime_td", sides: "both", legs: 3, onePerGame: false, legMinAm: -400, legMaxAm: 400 });
  const generated = ok(generate(poolFor(S, "cz"), S, specSeed(S, DATE, 0))).legs.map((l) => l.leg);

  it("three sides plus a three-leg spin is six legs, and the three sides are untouched", () => {
    const sides = [side("g1"), side("g2"), side("g3")];
    const r = addCfbLegs(sides, generated);
    expect(generated).toHaveLength(3);
    expect(r.legs).toHaveLength(6);
    expect(r.legs.slice(0, 3)).toEqual(sides); // in place, in order, same objects
    expect(r.note).toBeNull();
  });

  it("a leg already on the slip is KEPT, never toggled back off by the add", () => {
    const r = addCfbLegs([generated[0]], generated);
    expect(r.legs).toHaveLength(3);
    expect(r.legs.map((l) => l.key)).toContain(generated[0].key);
  });

  it("a player the slip already carries is refused BY NAME, never dropped in silence", () => {
    const twin: CfbSlipLeg = { ...generated[0], key: `${generated[0].key}|twin` };
    const r = addCfbLegs([twin], generated);
    expect(r.legs).toHaveLength(3); // the twin plus the two that fit
    expect(r.legs.map((l) => l.key)).not.toContain(generated[0].key);
    expect(r.note).toContain("one leg per player");
  });

  it("an empty slip gets exactly the generated legs — the plain case still works", () => {
    expect(addCfbLegs([], generated).legs).toEqual(generated);
  });
});

describe("the football desk is wired to the shared generator, and the NFL inherits it", () => {
  const cfb = readSrc("src/components/cfb/CfbProps.tsx");
  const nfl = readSrc("src/components/nfl/NflProps.tsx");
  const poolSrc = readSrc("src/lib/football/gen-pool.ts");

  it("CfbProps mounts the ONE GenSheet on the shared hook and the shared adapter", () => {
    expect(cfb).toContain('import { GenSheet } from "@/components/props/GenSheet"');
    expect(cfb).toContain('import { useParlayGen, blankPins } from "@/components/props/useParlayGen"');
    expect(cfb).toContain('import { FOOTBALL_GEN_MARKETS, footballGenPool } from "@/lib/football/gen-pool"');
    expect(cfb).toContain("markets={FOOTBALL_GEN_MARKETS}");
    expect(cfb).toContain("showModelOnly={false}");
    expect(cfb).toContain('gameMarket={nav === "sides"}');
    expect(cfb).toContain("quoteOf: propQuote");
    expect(cfb).toContain("footballGenPool<CfbSlipLeg>(board?.rows ?? [], sp, {");
    /* the remembered open/closed state is derived from the LEAGUE — one desk's state must not
       be the other's, and a league literal under src/components/cfb is what the separation
       tests forbid */
    expect(cfb).toContain("storageKey: `pl:${L.id}:props:gen-open`");
    expect(cfb).not.toContain("pl:cfb:props:gen-open");
  });

  it("NflProps is still the wrapper — the NFL gets the generator without a second copy", () => {
    expect(nfl).not.toContain("GenSheet");
    expect(nfl).not.toContain("useParlayGen");
    expect(nfl).toContain("<CfbProps />");
    expect(nfl.split("\n").filter((l) => l.trim()).length).toBeLessThan(25);
  });

  it("the generated legs go through the desk's adder, and the hook no longer overwrites the slip", () => {
    const hook = readSrc("src/components/props/useParlayGen.ts");
    expect(hook).toContain("setLegs(addLegs(legs, result.ticket.legs.map((l) => l.leg)));");
    /* the shape that wiped the slip — it must not come back in either desk */
    expect(hook).not.toMatch(/setLegs\(result\.ticket\.legs\.map/);
    expect(cfb).toContain("addLegs: (prev, add) => {");
    expect(cfb).toContain("const r = addCfbLegs(prev, add);");
    expect(cfb).toContain("if (r.note) showNote(r.note);");
  });

  it("the adapter is a PURE READER — no fetch, no api path, no credit, no ledger", () => {
    for (const re of [/fetch\(/, /\/api\//, /the-odds-api/, /Math\.random/, /ledger/i, /localStorage/]) {
      expect(poolSrc, String(re)).not.toMatch(re);
    }
    /* and it takes the clock as an argument rather than reading it */
    expect(poolSrc).not.toMatch(/Date\.now\(\)/);
    expect(poolSrc).toContain("nowMs");
  });
});
