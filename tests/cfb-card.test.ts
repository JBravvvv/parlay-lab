import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard } from "@/lib/cfb/model";
import { buildCfbCard, legOf } from "@/lib/cfb/card";
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
/** the market is fair, Caesars quotes -200 on BOTH sides of everything: every side is graded F
    (EV far under CFB_RULES.fun.minEvPct = -3), so neither bucket has anything to buy */
const heavyVig: Book[] = [
  { key: "pinnacle", title: "Pinnacle", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },
  { key: "draftkings", title: "DraftKings", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },
  { key: "williamhill_us", title: "Caesars", h2h: [-300, -200], spread: [-3, -200, -200], total: [48.5, -200, -200] },
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

/* ========================================================================================
 * INSTRUCTION 45 (2026-09-06), Josh, verbatim: "Parlay Lab CFB should've been running the same
 * $150 per day theoretical Core money and $25 Fun money per day". BOTH halves are money.
 *
 * THE DEFECT: THE CORE GATE THREW THE $25 AWAY BEFORE THE PARLAY WAS EVER BUILT. `buildCfbCard`
 * computed its candidate pool off the CORE gate alone — CFB_RULES.minEvPct (+2% EV at Caesars)
 * and CFB_RULES.maxDec (2.60) — and, when that pool came back empty, returned
 * `{ core: [], funT: [], noPlay: true }` from INSIDE the core section, above the fun section
 * entirely. The fun parlay is priced off a different and looser gate (CFB_RULES.fun.minEvPct
 * = -3, its own 4–40 decimal band, 3–5 legs across distinct games), so a board that offers the
 * core nothing can still carry a perfectly good $25 ticket. It never got the chance to.
 *
 * MEASURED on this repo's own real 2026-09-05 fixture, with no synthetic uplift: the lock's card
 * seats its core on three games, and the top-up path (`planCfbTopUp`, src/lib/cfb/lock-server.ts)
 * then re-prices exactly the games the core is NOT on — nine games, 46 priced sides, ZERO of them
 * clearing the +2% / 2.60 core gate, SIX of them clearing the -3% fun gate across FIVE distinct
 * games. Rebuilt with `daily: 0` and with `daily: 150` that board answered `noPlay` both times,
 * so it was never a room problem: the fun bucket simply sat behind the core's gate. Every such
 * attempt costs one CFB game-lines pull (6 Odds credits), up to CFB_TOPUP_MAX = 2 per date, for
 * $0 seated — repeating every Saturday against a 2500/day cap that already binds on Saturdays.
 *
 * THE RULE THESE TESTS PIN: the two allotments are gated INDEPENDENTLY. A day is NO-PLAY only
 * when the core AND the fun bucket are both empty; a core-empty day whose parlay clears seats the
 * $25 and says so honestly instead of claiming a no-play. This is the same independence
 * `decideCfbTopUp` already applies one level up (tests/cfb-lock-route.test.ts, DEFECT M) —
 * `buildCfbCard` was the half that still collapsed the two into one.
 * ======================================================================================== */
describe("the fun allotment is gated independently of the core (INSTRUCTION 45)", () => {
  const board = fixtureBoard();
  /** exactly the board `planCfbTopUp` prices: the fixture minus the games the lock's core sits on */
  const seated = new Set(buildCfbCard(board, OPTS).core.flatMap((t) => t.legs.map((l) => l.gkey)));
  const rest: CfbBoard = { ...board, games: board.games.filter((g) => !seated.has(g.id)) };
  const playable = rest.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null));

  it("the top-up board is real: no core side clears, and the fun pool spans enough games for a parlay", () => {
    expect(seated.size).toBe(3);
    expect(rest.games).toHaveLength(9);
    expect(playable).toHaveLength(46);
    expect(playable.filter((r) => (r.evCz ?? -Infinity) >= CFB_RULES.minEvPct && r.cz!.dec <= CFB_RULES.maxDec)).toHaveLength(0);
    const funPool = playable.filter((r) => (r.evCz ?? -Infinity) >= CFB_RULES.fun.minEvPct);
    expect(funPool.length).toBeGreaterThanOrEqual(1);
    expect(new Set(funPool.map((r) => r.gameId)).size).toBeGreaterThanOrEqual(CFB_RULES.fun.legs.min);
  });

  it("0 core-clearing rows + a clearing fun pool → the $25 is seated, the core is empty, and it is NOT a no-play", () => {
    const card = buildCfbCard(rest, OPTS);
    expect(card.core).toEqual([]);
    expect(card.coreSum).toBe(0);
    expect(card.funT).toHaveLength(1);
    expect(card.funSum).toBe(CFB_PAPER.fun);
    expect(card.noPlay).toBe(false);
    checkFun(card); // still inside CFB_RULES.fun's leg band, decimal band and -3% gate — nothing widened
  });

  it("the note tells the truth: no NO-PLAY claim on a day that staked the fun money", () => {
    const card = buildCfbCard(rest, OPTS);
    expect(card.notes.some((n) => /^NO-PLAY/.test(n))).toBe(false);
    expect(card.notes.some((n) => /no playable side clears \+2% EV at Caesars/.test(n))).toBe(true);
  });

  it("the fun bucket does not depend on the core's room: daily $0 and daily $150 both seat the parlay", () => {
    for (const daily of [0, CFB_PAPER.daily]) {
      const card = buildCfbCard(rest, { ...OPTS, daily });
      expect(card.core).toEqual([]);
      expect(card.funSum).toBe(CFB_PAPER.fun);
      expect(card.noPlay).toBe(false);
    }
  });
});

/* INSTRUCTION 46 fix round (2026-09-08): a pick naming a player carries his identity onto the leg */
describe("legOf copies the pick's player identity onto the ticket leg (INSTRUCTION 46)", () => {
  const board = synthBoard(1, () => favEdge());
  const game = board.games[0];
  const row = game.rows.find((r) => r.market === "ml" && r.side === "home")!;
  it("a side row yields a leg with no player fields at all (byte-identical to before)", () => {
    const leg = legOf(row, game)!;
    expect(leg).not.toBeNull();
    expect("player" in leg).toBe(false);
    expect("headshot" in leg).toBe(false);
    expect("pos" in leg).toBe(false);
    expect("teamAbbr" in leg).toBe(false);
    expect(leg.teamId).toBe(row.teamId);
  });
  it("a row naming a player carries player / headshot / pos / teamAbbr onto the leg", () => {
    const hs = "https://a.espncdn.com/i/headshots/college-football/players/full/4685454.png";
    const leg = legOf({ ...row, player: "Ty Simpson", headshot: hs, pos: "QB", teamAbbr: "H1" }, game)!;
    expect(leg.player).toBe("Ty Simpson");
    expect(leg.headshot).toBe(hs);
    expect(leg.pos).toBe("QB");
    expect(leg.teamAbbr).toBe("H1");
    expect(leg.teamId).toBe(row.teamId);
    // unknown headshot / position are null, never undefined, so the ledger's `?? null` reads are honest
    const bare = legOf({ ...row, player: "Ty Simpson" }, game)!;
    expect(bare.headshot).toBeNull();
    expect(bare.pos).toBeNull();
    expect("teamAbbr" in bare).toBe(false);
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
  /* REWRITTEN 2026-09-06 (INSTRUCTION 45), from:
   *
   *   it("NO-PLAY when every side is fair-priced (no +2% at Caesars), even with 8 games", () => {
   *     const card = buildCfbCard(synthBoard(8, () => flat), OPTS);
   *     expect(card.noPlay).toBe(true);
   *     expect(card.core).toEqual([]);
   *     expect(card.funT).toEqual([]);
   *   });
   *
   * This is a REWRITE, not a loosening: the board did not change and neither did any gate, but the
   * verdict it pinned was the defect itself. MEASURED on this exact board: all 8 games carry an
   * away ML at -2.84% EV at Caesars (decimal 2.30) — INSIDE CFB_RULES.fun.minEvPct = -3, i.e.
   * grade D, exactly the pool the fun money is defined to ride — while nothing anywhere clears the
   * core's +2%. The old pin therefore froze "the core found nothing, so throw the $25 away", which
   * is the half of "$150 Core money and $25 Fun money per day" this ship exists to restore. The
   * rewrite asserts strictly MORE than the old one did about the same board: the core is still
   * empty AND still $0 (new), the fun ticket is seated at exactly CFB_PAPER.fun and still obeys
   * every fun rule via checkFun (new), and the day is no longer allowed to call itself a no-play.
   * The "both buckets empty → NO-PLAY" case the old pin was standing in for is now covered
   * directly, on a priced 8-game board, by the F-grade test immediately below. */
  it("no +2% side but a grade-D fun pool: empty core, the $25 still rides, and it is NOT a no-play", () => {
    const card = buildCfbCard(synthBoard(8, () => flat), OPTS);
    expect(card.core).toEqual([]);
    expect(card.coreSum).toBe(0);
    expect(card.noPlay).toBe(false);
    expect(card.funT).toHaveLength(1);
    expect(card.funSum).toBe(CFB_PAPER.fun);
    checkFun(card);
    expect(card.notes.some((n) => /^NO-PLAY/.test(n))).toBe(false);
    expect(card.notes.some((n) => /^No core ticket/.test(n))).toBe(true);
  });
  it("NO-PLAY when every side is graded F at Caesars: both buckets empty on a fully priced 8-game slate", () => {
    const board = synthBoard(8, () => heavyVig);
    const priced = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null));
    expect(priced.length).toBeGreaterThan(0); // the day IS priced — this is a no-bet day, not a no-price day
    expect(priced.every((r) => r.evCz! < CFB_RULES.fun.minEvPct)).toBe(true);
    const card = buildCfbCard(board, OPTS);
    expect(card.noPlay).toBe(true);
    expect(card.core).toEqual([]);
    expect(card.funT).toEqual([]);
    expect(card.coreSum).toBe(0);
    expect(card.funSum).toBe(0);
    expect(card.notes[0]).toMatch(/^NO-PLAY/);
  });
  it("12 edged games: doubles ≤ 2.60 rank first, the $250 deploys exactly, ≤ 10 tickets, no game twice", () => {
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
    expect(card.core.length).toBe(5); // 5 × $50 = $250 (2026-09-08: was 6 × $25 = $150)
    expect(card.notes.some((n) => n.includes("undeployed"))).toBe(false);
    // EV-ranked: non-increasing czEv down the card
    for (let i = 1; i < card.core.length; i++) expect(card.core[i].czEv).toBeLessThanOrEqual(card.core[i - 1].czEv + 1e-9);
    // fun: favorites in descending probability until the parlay pays ≥ 4×
    const fun = card.funT[0];
    expect(fun.czDec).toBeGreaterThanOrEqual(CFB_RULES.fun.minDec);
    expect(fun.legs.every((l) => l.market === "ml" && l.side === "home")).toBe(true);
  });
  it("3 edged games: three singles, stakes raised to the $50 max, the rest honestly undeployed", () => {
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
