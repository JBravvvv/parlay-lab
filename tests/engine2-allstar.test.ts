import { describe, expect, it } from "vitest";
import {
  asgCard,
  asgFairs,
  calibrateSim,
  expPA,
  hrModelProb,
  matchPlayer,
  parseAsgOdds,
  parseCaesarsBoard,
  parseHrLines,
  parseScoreLines,
  priceAsgLegs,
  type AsgPlayer,
  type OddsEventJson,
} from "../src/engine2/allstar";

/* Fixture cut from the real 2026 ASG odds pull (2026-07-14 22:27Z) — four
   books that exercise every path: consensus, CZ-only F3, modal-point split,
   one-sided HR props. */
const FIXTURE: OddsEventJson = {
  commence_time: "2026-07-15T00:01:00Z",
  home_team: "National League",
  away_team: "American League",
  bookmakers: [
    {
      key: "fanduel",
      title: "FanDuel",
      markets: [
        { key: "h2h", outcomes: [{ name: "American League", price: 116 }, { name: "National League", price: -134 }] },
        { key: "totals", outcomes: [{ name: "Over", price: -104, point: 8.5 }, { name: "Under", price: -118, point: 8.5 }] },
        { key: "h2h_1st_5_innings", outcomes: [{ name: "American League", price: 106 }, { name: "National League", price: -132 }] },
        { key: "totals_1st_5_innings", outcomes: [{ name: "Over", price: 108, point: 4.5 }, { name: "Under", price: -140, point: 4.5 }] },
      ],
    },
    {
      key: "pinnacle",
      title: "Pinnacle",
      markets: [
        { key: "h2h", outcomes: [{ name: "American League", price: 116 }, { name: "National League", price: -125 }] },
        { key: "totals", outcomes: [{ name: "Over", price: 101, point: 8.5 }, { name: "Under", price: -114, point: 8.5 }] },
      ],
    },
    {
      key: "williamhill_us",
      title: "Caesars",
      markets: [
        { key: "h2h", outcomes: [{ name: "American League", price: 115 }, { name: "National League", price: -135 }] },
        { key: "totals", outcomes: [{ name: "Over", price: -120, point: 8.0 }, { name: "Under", price: 100, point: 8.0 }] },
        { key: "h2h_1st_3_innings", outcomes: [{ name: "American League", price: 105 }, { name: "National League", price: -135 }] },
        { key: "totals_1st_3_innings", outcomes: [{ name: "Over", price: 110, point: 2.5 }, { name: "Under", price: -140, point: 2.5 }] },
        { key: "h2h_1st_5_innings", outcomes: [{ name: "American League", price: 100 }, { name: "National League", price: -130 }] },
        { key: "totals_1st_5_innings", outcomes: [{ name: "Over", price: -130, point: 4.0 }, { name: "Under", price: 100, point: 4.0 }] },
        {
          key: "batter_home_runs",
          outcomes: [
            { name: "Over", description: "Kyle Schwarber", price: 360, point: 0.5 },
            { name: "Over", description: "Yordan Alvarez", price: 550, point: 0.5 },
            { name: "Over", description: "Bobby Witt Jr.", price: 900, point: 0.5 },
          ],
        },
      ],
    },
    {
      key: "betfair_ex_eu",
      title: "Betfair",
      markets: [
        { key: "h2h", outcomes: [{ name: "American League", price: 120 }, { name: "National League", price: -125 }] },
      ],
    },
  ],
};

const PLAYERS: AsgPlayer[] = [
  { id: 1, name: "Kyle Schwarber", side: "NL", order: 1, hr: 35, pa: 470 },
  { id: 2, name: "Yordan Alvarez", side: "AL", order: 2, hr: 25, pa: 420 },
  { id: 3, name: "Bobby Witt Jr.", side: "AL", order: 5, hr: 17, pa: 450 },
  { id: 4, name: "Pete Alonso", side: "NL", order: null, hr: 22, pa: 400 },
];

describe("parseAsgOdds", () => {
  const book = parseAsgOdds(FIXTURE);
  it("collects every market family with AL/NL orientation", () => {
    expect(book.ml).toHaveLength(4);
    expect(book.ml.find((r) => r.book === "pinnacle")).toMatchObject({ al: 116, nl: -125 });
    expect(book.mlF3).toHaveLength(1); // Caesars only — real shape tonight
    expect(book.mlF5).toHaveLength(2);
    expect(book.total).toHaveLength(3);
    expect(book.hr).toHaveLength(3);
    expect(book.hr[0]).toMatchObject({ name: "Kyle Schwarber", odds: 360 });
  });
});

describe("asgFairs", () => {
  const fairs = asgFairs(parseAsgOdds(FIXTURE));
  it("ML consensus lands where the books say (AL a small dog)", () => {
    expect(fairs.ml).not.toBeNull();
    expect(fairs.ml!.n).toBe(4);
    expect(fairs.ml!.pAL).toBeGreaterThan(0.4);
    expect(fairs.ml!.pAL).toBeLessThan(0.5);
  });
  it("F3 exists as a CZ-only de-vig", () => {
    expect(fairs.mlF3).not.toBeNull();
    expect(fairs.mlF3!.n).toBe(1);
  });
  it("total uses the modal point (8.5 posted by 2 of 3 books)", () => {
    expect(fairs.total).not.toBeNull();
    expect(fairs.total!.point).toBe(8.5);
  });
});

describe("calibrateSim", () => {
  const sim = calibrateSim(0.46, 8.5, 0.5, 8000);
  it("reproduces the market it was given", () => {
    expect(Math.abs(sim.pAL - 0.46)).toBeLessThan(0.012);
    const ou = sim.pOver(8.5);
    const overEx = ou.over / (ou.over + ou.under);
    expect(Math.abs(overEx - 0.5)).toBeLessThan(0.02);
  });
  it("emits a coherent score distribution", () => {
    const mass = sim.scores.reduce((a, s) => a + s.p, 0);
    expect(mass).toBeGreaterThan(0.999);
    expect(sim.tie9).toBeGreaterThan(0.02); // ties happen, swing-off decides
    expect(sim.f5.al + sim.f5.nl + sim.f5.tie).toBeCloseTo(1, 5);
    // deterministic: same seed, same result
    expect(calibrateSim(0.46, 8.5, 0.5, 8000).pAL).toBe(sim.pAL);
  });
});

describe("paste parsers", () => {
  it("reads correct-score lines in the shapes the app shows", () => {
    const { quotes, unmatched } = parseScoreLines(
      "AL 5-4 +900\nNL 3 - 2 +850\nNational League 6-3 +1400\nAny other AL win +700\nAny Other +250\ngarbage line\n",
    );
    expect(quotes).toHaveLength(5);
    expect(quotes[0]).toMatchObject({ kind: "exact", side: "AL", win: 5, lose: 4, odds: 900 });
    expect(quotes[3]).toMatchObject({ kind: "other", side: "AL", odds: 700 });
    expect(quotes[4]).toMatchObject({ kind: "other", side: "tie", odds: 250 });
    expect(unmatched).toEqual(["garbage line"]);
  });
  it("reads HR prop lines", () => {
    const { quotes, unmatched } = parseHrLines("Pete Alonso +650\nShohei Ohtani over 0.5 HR +425\nnope\n");
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({ name: "Pete Alonso", odds: 650 });
    expect(unmatched).toEqual(["nope"]);
  });
  it("routes a raw one-paste Caesars board dump into the right markets", () => {
    const dump = [
      "Correct Score", // header, no odds — ignored silently
      "AL 5-4 +900",
      "NL 3-2 +850",
      "Any other AL win +700",
      "Any Other +250",
      "To Hit A Home Run", // header
      "Kyle Schwarber +360",
      "Pete Alonso +650",
      "Moneyline", // header
      "American League +115", // game market — already live from the feed
      "National League -135",
      "First 5 Innings Over 4.5 -130",
      "Total Runs Over 8.5 +100",
    ].join("\n");
    const b = parseCaesarsBoard(dump);
    expect(b.scores).toHaveLength(4);
    expect(b.hr.map((q) => q.name)).toEqual(["Kyle Schwarber", "Pete Alonso"]);
    expect(b.covered).toBe(4); // ML ×2 + F5 total + game total recognized, not dropped
    expect(b.unmatched).toEqual([]);
  });
});

describe("HR model", () => {
  it("expected trips fall with batting slot", () => {
    expect(expPA(1)).toBeGreaterThan(expPA(5));
    expect(expPA(9)).toBeGreaterThan(expPA(null)); // starters over reserves
  });
  it("real season rate over ~2-3 trips, never a fantasy number", () => {
    const p = hrModelProb(PLAYERS[0])!; // 35 HR / 470 PA, leadoff
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThan(0.25);
    expect(hrModelProb({ ...PLAYERS[0], pa: 40 })).toBeNull(); // sample too small
  });
  it("matches names loosely (suffixes, partials)", () => {
    expect(matchPlayer("Bobby Witt", PLAYERS)?.id).toBe(3);
    expect(matchPlayer("witt jr", PLAYERS)?.id).toBe(3);
  });
});

describe("pricing + card (straight bets only)", () => {
  const book = parseAsgOdds(FIXTURE);
  const fairs = asgFairs(book);
  const sim = calibrateSim(fairs.ml!.pAL, fairs.total!.point, fairs.total!.pOver, 8000);
  const legs = priceAsgLegs(book, fairs, sim, PLAYERS, parseScoreLines("AL 5-4 +900\nNL 3-2 +850").quotes, [
    { name: "Pete Alonso", odds: 650 },
  ]);

  it("prices every requested market family", () => {
    const groups = new Set(legs.map((l) => l.group));
    for (const g of ["ML", "F3", "F5", "TOTAL", "HR", "SCORE"]) expect(groups.has(g as never)).toBe(true);
  });
  it("'any other' buckets on a PARTIAL paste can never print positive EV", () => {
    // only 2 exact scores listed → the model would credit "any other" with
    // nearly the whole win mass; the cap must hold EV at ≤ 0
    const partial = parseScoreLines("NL 5-4 +1000\nAny other NL win +330\nAny other AL win +360").quotes;
    const priced = priceAsgLegs(book, fairs, sim, PLAYERS, partial, []);
    for (const l of priced.filter((x) => x.group === "SCORE" && x.label.startsWith("Any other"))) {
      expect(l.ev).toBeLessThanOrEqual(1e-9);
    }
  });
  it("one-sided HR props stay book-anchored (no manufactured EV)", () => {
    for (const l of legs.filter((x) => x.group === "HR")) {
      expect(l.market).toBeNull();
      expect(l.ev).toBeLessThan(0.02); // anchor keeps the vig — EV can't balloon
    }
  });
  it("the card is singles only, exact-sum, HR/SCORE confined to FUN", () => {
    const card = asgCard(legs, { daily: 40, fun: 15, bankroll: 750 });
    expect(card.daily.sum).toBe(card.daily.picks.length ? 40 : 0);
    expect(card.fun.sum).toBe(card.fun.picks.length ? 15 : 0);
    for (const p of card.daily.picks) {
      expect(["ML", "F3", "F5", "TOTAL"]).toContain(p.leg.group);
      // a pick is one leg at book odds — there is no combo type at all
      expect(p.leg.odds).toBeTypeOf("number");
    }
    const perGroup = new Map<string, number>();
    for (const p of card.daily.picks) perGroup.set(p.leg.group, (perGroup.get(p.leg.group) ?? 0) + 1);
    for (const n of perGroup.values()) expect(n).toBeLessThanOrEqual(2);
    for (const p of card.fun.picks) {
      expect(p.leg.odds).toBeGreaterThanOrEqual(500);
    }
  });
});
