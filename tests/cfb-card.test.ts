import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { CFB_PAPER, CFB_RULES } from "@/lib/cfb/rules";
import type { CfbBoard, CfbCard, CfbTicket } from "@/lib/cfb/types";

/**
 * THE CFB PAPER CARD (INSTRUCTION 38, 2026-09-05): $150 core + $25 fun per slate day, under
 * CFB_RULES. Two boards drive the checks — the real 2026-09-05 fixture (three +2% sides at
 * Caesars, so a thin card) and a SYNTHETIC slate built through the real model with prices
 * chosen to exercise doubles, the ticket cap, the allotment stop and the top-up. Synthetic
 * prices are test inputs, not market claims.
 */

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
const OPTS = { bankroll: 2500, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now: NOW };

function fixtureBoard(): CfbBoard {
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  return buildCfbBoard({ date: DATE, espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
}

/* ---------- a synthetic slate through the real model ---------- */

type Book = { key: string; title: string; h2h?: [number, number]; spread?: [number, number, number]; total?: [number, number, number] };
function espnEvent(i: number, start = "2026-09-05T16:00Z") {
  const home = `Home${i} Hosts`;
  const away = `Away${i} Guests`;
  const team = (id: string, loc: string, nick: string, abbr: string) => ({ id, location: loc, name: nick, abbreviation: abbr, displayName: `${loc} ${nick}`, shortDisplayName: loc, color: "000000", logo: null });
  return {
    id: `9${String(i).padStart(4, "0")}`,
    date: start,
    name: `${away} at ${home}`,
    shortName: `A${i} @ H${i}`,
    status: { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false, shortDetail: "9/5 - 12:00 PM EDT" }, period: 0, displayClock: "0:00" },
    competitions: [
      {
        id: `9${String(i).padStart(4, "0")}`,
        date: start,
        neutralSite: false,
        venue: { fullName: `Stadium ${i}` },
        competitors: [
          { id: `h${i}`, homeAway: "home", score: "0", curatedRank: { current: 99 }, records: [{ summary: "0-0" }], team: team(`h${i}`, `Home${i}`, "Hosts", `H${i}`) },
          { id: `a${i}`, homeAway: "away", score: "0", curatedRank: { current: 99 }, records: [{ summary: "0-0" }], team: team(`a${i}`, `Away${i}`, "Guests", `A${i}`) },
        ],
        broadcasts: [],
        odds: [],
      },
    ],
  };
}
function oddsEvent(i: number, books: Book[], commence = "2026-09-05T16:00:00Z") {
  const home = `Home${i} Hosts`;
  const away = `Away${i} Guests`;
  return {
    id: `odds-${i}`,
    sport_key: "americanfootball_ncaaf",
    commence_time: commence,
    home_team: home,
    away_team: away,
    bookmakers: books.map((b) => ({
      key: b.key,
      title: b.title,
      last_update: commence,
      markets: [
        ...(b.h2h ? [{ key: "h2h", outcomes: [{ name: home, price: b.h2h[0] }, { name: away, price: b.h2h[1] }] }] : []),
        ...(b.spread ? [{ key: "spreads", outcomes: [{ name: home, price: b.spread[1], point: b.spread[0] }, { name: away, price: b.spread[2], point: -b.spread[0] }] }] : []),
        ...(b.total ? [{ key: "totals", outcomes: [{ name: "Over", price: b.total[1], point: b.total[0] }, { name: "Under", price: b.total[2], point: b.total[0] }] }] : []),
      ],
    })),
  };
}
/** market at −250 / +210 on the home ML, Caesars off-market at −180 → the home ML is a short-priced +EV side */
const favEdge = (czHome = -180): Book[] => [
  { key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "draftkings", title: "DraftKings", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "williamhill_us", title: "Caesars", h2h: [czHome, 150], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
];
/** fair-priced everywhere: no side clears +2% at Caesars */
const flat: Book[] = [
  { key: "pinnacle", title: "Pinnacle", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },
  { key: "draftkings", title: "DraftKings", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },
  { key: "williamhill_us", title: "Caesars", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },
];
function synthBoard(n: number, books: (i: number) => Book[]): CfbBoard {
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  return buildCfbBoard({ date: DATE, espnEvents: idx.map((i) => espnEvent(i)), oddsEvents: idx.map((i) => oddsEvent(i, books(i))), fpi: null, now: NOW, bankroll: 2500 });
}

/* ---------- invariants every card must satisfy ---------- */

function checkCore(card: CfbCard, daily = CFB_PAPER.daily) {
  const R = CFB_RULES;
  expect(card.coreSum).toBe(card.core.reduce((s, t) => s + t.stake, 0));
  expect(card.coreSum).toBeLessThanOrEqual(daily);
  expect(card.core.length).toBeLessThanOrEqual(R.tickets.max);
  const games = new Set<string>();
  card.core.forEach((t, i) => {
    expect(t.id).toBe(`cfb-${card.date}-core-${i + 1}`);
    expect(t.bucket).toBe("core");
    expect(Number.isInteger(t.stake)).toBe(true);
    expect(t.stake).toBeGreaterThanOrEqual(R.minStake);
    expect(t.stake).toBeLessThanOrEqual(R.maxStake);
    expect(t.legs.length).toBeGreaterThanOrEqual(1);
    expect(t.legs.length).toBeLessThanOrEqual(R.maxLegs);
    expect(t.czDec).toBeLessThanOrEqual(R.maxDec + 1e-9);
    expect(t.prob).toBeGreaterThan(0);
    expect(t.prob).toBeLessThanOrEqual(100); // PERCENT
    expect(t.czEv).toBeGreaterThanOrEqual(R.forcedMinEvPct);
    const legGames = new Set(t.legs.map((l) => l.gkey));
    expect(legGames.size).toBe(t.legs.length); // one leg per game per ticket
    for (const g of legGames) {
      expect(games.has(g), `game ${g} on two core tickets`).toBe(false);
      games.add(g);
    }
    expect(t.name.startsWith(t.legs.length === 1 ? "SINGLE · " : "DOUBLE · ")).toBe(true);
    for (const l of t.legs) {
      expect(t.name).toContain(l.label);
      expect(["ML", "Spread", "Total"]).toContain(l.prop);
      expect(Math.abs(l.cz)).toBeGreaterThanOrEqual(100);
      expect(l.prob).toBeGreaterThan(0);
      expect(l.prob + l.push).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
}
/** a leg's % EV at the Caesars price it was captured at (prob/push are already at Caesars' line) */
function legEv(l: CfbTicket["legs"][number]): number {
  const dec = l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz;
  return 100 * (l.prob * (dec - 1) - (1 - l.prob - l.push));
}
function checkFun(card: CfbCard, fun = CFB_PAPER.fun) {
  const R = CFB_RULES;
  expect(card.funT.length).toBeLessThanOrEqual(1);
  expect(card.funSum).toBe(card.funT.reduce((s, t) => s + t.stake, 0));
  for (const t of card.funT) {
    expect(t.id).toBe(`cfb-${card.date}-fun-1`);
    expect(t.bucket).toBe("fun");
    // named for what it holds: FAVORITES when ≥ half the legs are favorites at Caesars' line
    const favs = t.legs.filter((l) => l.prob / Math.max(1e-9, 1 - l.push) >= 0.5).length;
    expect(t.name).toBe(favs * 2 >= t.legs.length ? "FAVORITES PARLAY" : "FUN PARLAY");
    for (const l of t.legs) expect(legEv(l)).toBeGreaterThanOrEqual(R.fun.minEvPct - 1e-9);
    expect(t.stake).toBe(fun);
    expect(t.legs.length).toBeGreaterThanOrEqual(R.fun.legs.min);
    expect(t.legs.length).toBeLessThanOrEqual(R.fun.legs.max);
    expect(new Set(t.legs.map((l) => l.gkey)).size).toBe(t.legs.length);
    expect(t.czDec).toBeLessThanOrEqual(R.fun.maxDec);
  }
}

describe("the 2026-09-05 fixture card", () => {
  const board = fixtureBoard();
  const card = buildCfbCard(board, OPTS);
  it("core: sum ≤ $150, stakes in [$5,$25], no two tickets share a game, ids in order", () => {
    checkCore(card);
    expect(card.noPlay).toBe(false);
    expect(card.core.length).toBeGreaterThan(0);
    expect(card.date).toBe(DATE);
  });
  it("only +2% sides under 2.60 at Caesars are on the card, and each is that game's best", () => {
    for (const t of card.core) {
      for (const l of t.legs) {
        const g = board.games.find((x) => x.id === l.gkey)!;
        const r = g.rows.find((x) => x.key === l.lkey)!;
        expect(r.evCz!).toBeGreaterThanOrEqual(CFB_RULES.minEvPct);
        expect(r.cz!.dec).toBeLessThanOrEqual(CFB_RULES.maxDec);
        expect(r.playable).toBe(true);
        expect(l.cz).toBe(r.cz!.price);
        expect(l.line).toBe(r.market === "ml" ? null : r.cz!.line); // the leg settles at Caesars' OWN line
        const best = Math.max(...g.rows.filter((x) => x.playable && x.cz!.dec <= CFB_RULES.maxDec).map((x) => x.evCz ?? -Infinity));
        expect(r.evCz).toBe(best);
      }
    }
  });
  it("fun: exactly one $25 FAVORITES PARLAY with 3–5 legs across distinct games, dec ≥ 4 when reachable", () => {
    checkFun(card);
    expect(card.funT).toHaveLength(1);
    expect(card.funSum).toBe(25);
    const t = card.funT[0];
    expect(t.czDec).toBeGreaterThanOrEqual(CFB_RULES.fun.minDec);
    // the legs are the slate's likeliest fair-or-better sides, in descending probability
    const probs = t.legs.map((l) => l.prob / (1 - l.push));
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeLessThanOrEqual(probs[i - 1] + 1e-12);
    for (const l of t.legs) {
      const r = board.games.find((g) => g.id === l.gkey)!.rows.find((x) => x.key === l.lkey)!;
      expect(r.evCz!).toBeGreaterThanOrEqual(0);
    }
  });
  it("what could not deploy is written into notes, never forced past the rules", () => {
    if (card.coreSum < CFB_PAPER.daily) {
      expect(card.notes.some((n) => n.includes(`$${CFB_PAPER.daily - card.coreSum} of the $${CFB_PAPER.daily} stayed undeployed`))).toBe(true);
    }
    if (card.core.length < CFB_RULES.tickets.min) expect(card.notes.some((n) => /minimum 3/.test(n))).toBe(true);
  });
  it("ticket arithmetic: prob is Π(p/(1−push)) in PERCENT, dec is Π dec, ev = 100·(prob·dec − 1)", () => {
    for (const t of [...card.core, ...card.funT]) {
      let dec = 1;
      let p = 1;
      for (const l of t.legs) {
        dec *= l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz;
        p *= l.prob / (1 - l.push);
      }
      expect(t.czDec).toBeCloseTo(dec, 3);
      expect(t.prob).toBeCloseTo(p * 100, 1);
      expect(t.czEv).toBeCloseTo(100 * (p * dec - 1), 1);
      expect(t.czOdds).toBe(dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)));
    }
  });
});

describe("synthetic slates through the real model", () => {
  it("NO-PLAY on an empty board: empty core, empty fun, nothing staked, the note says so", () => {
    const empty: CfbBoard = { date: DATE, slateDates: [DATE], games: [], unmatched: 0, fpiUpdated: null, generatedAt: NOW };
    const card = buildCfbCard(empty, OPTS);
    expect(card.noPlay).toBe(true);
    expect(card.core).toEqual([]);
    expect(card.funT).toEqual([]);
    expect(card.coreSum).toBe(0);
    expect(card.funSum).toBe(0);
    expect(card.notes[0]).toMatch(/^NO-PLAY/);
  });
  it("NO-PLAY when every side is fair-priced (no +2% at Caesars), even with 8 games", () => {
    const card = buildCfbCard(synthBoard(8, () => flat), OPTS);
    expect(card.noPlay).toBe(true);
    expect(card.core).toEqual([]);
    expect(card.funT).toEqual([]);
  });
  it("12 edged games: doubles ≤ 2.60 rank first, the $150 deploys exactly, ≤ 7 tickets, no game twice", () => {
    const board = synthBoard(12, () => favEdge());
    // every home ML clears the gate: fair ≈ 0.70 vs Caesars −180
    const homeMl = board.games.map((g) => g.rows.find((r) => r.market === "ml" && r.side === "home")!);
    for (const r of homeMl) {
      expect(r.evCz!).toBeGreaterThan(CFB_RULES.minEvPct);
      expect(r.cz!.dec).toBeLessThan(1.6);
    }
    const card = buildCfbCard(board, OPTS);
    checkCore(card);
    checkFun(card);
    expect(card.noPlay).toBe(false);
    expect(card.coreSum).toBe(CFB_PAPER.daily);
    expect(card.core.every((t) => t.legs.length === 2)).toBe(true); // two −180s = 2.42 ≤ 2.60, and the EV compounds
    expect(card.core.length).toBe(6); // 6 × $25 = $150
    expect(card.notes.some((n) => n.includes("undeployed"))).toBe(false);
    // EV-ranked: non-increasing czEv down the card
    for (let i = 1; i < card.core.length; i++) expect(card.core[i].czEv).toBeLessThanOrEqual(card.core[i - 1].czEv + 1e-9);
    // fun: favorites in descending probability until the parlay pays ≥ 4×
    const fun = card.funT[0];
    expect(fun.czDec).toBeGreaterThanOrEqual(CFB_RULES.fun.minDec);
    expect(fun.legs.every((l) => l.market === "ml" && l.side === "home")).toBe(true);
  });
  it("3 edged games: three singles, stakes raised to the $25 max, the rest honestly undeployed", () => {
    const card = buildCfbCard(synthBoard(3, () => favEdge()), OPTS);
    checkCore(card);
    expect(card.core.length).toBeGreaterThanOrEqual(2);
    expect(card.core.length).toBeLessThanOrEqual(3);
    expect(card.coreSum).toBeLessThan(CFB_PAPER.daily);
    expect(card.core.every((t) => t.stake === CFB_RULES.maxStake)).toBe(true);
    expect(card.notes.some((n) => n.includes(`$${CFB_PAPER.daily - card.coreSum} of the $${CFB_PAPER.daily} stayed undeployed`))).toBe(true);
    expect(card.notes.some((n) => /minimum 3/.test(n))).toBe(card.core.length < 3);
  });
  it("the forced top-up adds short-priced ≥ 0% EV tickets by probability when the +2% pool runs dry", () => {
    // two edged games, five fair-priced games (every side −EV at Caesars) and ONE game where Caesars is a hair
    // better than the −250 market on the favorite: pHome ≈ 0.678 (ML 0.689 ×0.6, spread Φ(6.5/16.5) ×0.25) vs
    // −205 (dec 1.4878) → EV ≈ +0.9%: above 0, under the +2% gate, under 1.75 — exactly the forced pool.
    const nearFair: Book[] = [
      { key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
      { key: "draftkings", title: "DraftKings", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
      { key: "williamhill_us", title: "Caesars", h2h: [-205, 175], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
    ];
    const board = synthBoard(8, (i) => (i <= 2 ? favEdge() : i === 3 ? nearFair : flat));
    const g3 = board.games[2].rows.find((r) => r.market === "ml" && r.side === "home")!;
    expect(g3.evCz!).toBeGreaterThanOrEqual(0);
    expect(g3.evCz!).toBeLessThan(CFB_RULES.minEvPct);
    expect(g3.cz!.dec).toBeLessThanOrEqual(CFB_RULES.forcedMaxDec);
    const card = buildCfbCard(board, OPTS);
    checkCore(card);
    const forced = card.core.find((t) => t.legs.some((l) => l.gkey === board.games[2].id));
    expect(forced).toBeDefined();
    expect(card.notes.some((n) => n.startsWith("Top-up:"))).toBe(true);
    expect(card.benched.every((b) => typeof b.reason === "string" && b.reason.length > 0)).toBe(true);
  });
  it("a smaller bankroll shrinks Kelly but the floor and ceiling hold", () => {
    const card = buildCfbCard(synthBoard(12, () => favEdge()), { ...OPTS, bankroll: 300 });
    checkCore(card);
    expect(card.core.every((t: CfbTicket) => t.stake >= CFB_RULES.minStake && t.stake <= CFB_RULES.maxStake)).toBe(true);
  });
  it("a kicked-off slate is NO-PLAY — the card honours opts.now even on a board priced earlier", () => {
    const card = buildCfbCard(synthBoard(4, () => favEdge()), { ...OPTS, now: Date.parse("2026-09-05T17:00:00Z") });
    expect(card.noPlay).toBe(true);
    expect(card.core).toEqual([]);
    expect(card.funT).toEqual([]);
  });
});
