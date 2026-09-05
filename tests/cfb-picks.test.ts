import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard, evPct } from "@/lib/cfb/model";
import { buildCfbPicks, CFB_PICK_CATEGORIES, legFits, rankPicks, setBandOf } from "@/lib/cfb/picks";
import { CFB_PARLAY_CATEGORIES, type CfbParlayCategory, type CfbPickRow } from "@/lib/cfb/props-types";
import { CFB_PARLAYS } from "@/lib/cfb/rules";
import type { CfbBoard, CfbGame } from "@/lib/cfb/types";
import type { CfbParlay, CfbPropRow } from "@/lib/cfb/props-types";
import { gradeFromEv, gradeRank } from "@/lib/grade";
import { amToDec, decToAm } from "@/lib/ticket-math";

/**
 * THE CFB PICKS + PARLAYS ENGINE (2026-09-05): categories and the three parlay views under
 * CFB_PARLAYS. The board is the real 2026-09-05 fixture through the real model; the prop
 * rows are SYNTHETIC — hand-made test inputs on the fixture's games with prices chosen to
 * exercise the longshot and mix bands, not market claims.
 *
 * INSTRUCTION 42 (2026-09-05): the categories admit live rows (graded, kelly null) and the
 * engine adds twelve category sets of up to CFB_PARLAYS.perCategory tickets — see the
 * "INSTRUCTION 42" describe blocks and the fixture-scaled benchmark at the end.
 */

const FIX = path.join(process.cwd(), "tests", "fixtures", "cfb");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const NOW = Date.parse("2026-09-05T12:00:00Z");
const DATE = "2026-09-05";
const OPTS = { now: NOW, bankroll: 2500 };

function fixtureBoard(): CfbBoard {
  const espn = readJson("espn-scoreboard-2026-09-05.json") as { events: unknown[] };
  return buildCfbBoard({ date: DATE, espnEvents: espn.events, oddsEvents: readJson("odds-ncaaf-2026-09-05.json"), fpi: readJson("espn-fpi.json"), now: NOW, bankroll: 2500 });
}

/* ---------- synthetic props on the fixture's games ---------- */

type Spec = { g: number; market: CfbPropRow["market"]; side: CfbPropRow["side"]; player: string; line: number | null; fair: number; cz: number };
const SPECS: Spec[] = [
  { g: 0, market: "pass_yds", side: "over", player: "QB Alpha", line: 245.5, fair: 0.6, cz: -110 },
  { g: 0, market: "pass_yds", side: "under", player: "QB Alpha", line: 245.5, fair: 0.4, cz: -110 },
  { g: 0, market: "anytime_td", side: "yes", player: "RB Bravo", line: null, fair: 0.55, cz: -105 },
  { g: 1, market: "rush_yds", side: "over", player: "RB Charlie", line: 80.5, fair: 0.62, cz: -115 },
  { g: 1, market: "receptions", side: "over", player: "WR Delta", line: 4.5, fair: 0.57, cz: -105 },
  { g: 2, market: "rec_yds", side: "over", player: "WR Echo", line: 60.5, fair: 0.58, cz: -110 },
  { g: 2, market: "pass_tds", side: "over", player: "QB Foxtrot", line: 1.5, fair: 0.66, cz: -140 },
  { g: 3, market: "anytime_td", side: "yes", player: "WR Golf", line: null, fair: 0.42, cz: 140 },
  { g: 3, market: "rush_yds", side: "over", player: "RB Hotel", line: 95.5, fair: 0.5, cz: -105 },
  { g: 4, market: "anytime_td", side: "yes", player: "TE India", line: null, fair: 0.3, cz: 210 },
  // an F-grade prop (never a leg) and one with no Caesars price (never a pick)
  { g: 4, market: "receptions", side: "over", player: "WR Juliet", line: 6.5, fair: 0.4, cz: -130 },
  { g: 5, market: "pass_yds", side: "over", player: "QB Kilo", line: 300.5, fair: 0.55, cz: 0 },
];

function syntheticProps(board: CfbBoard): CfbPropRow[] {
  const games = board.games.filter((g) => g.rows.length > 0);
  return SPECS.map((s) => {
    const g = games[s.g % games.length];
    const dec = s.cz === 0 ? null : amToDec(s.cz);
    const cz = dec == null ? null : { book: "williamhill_us", title: "Caesars", price: s.cz, line: s.line, dec };
    const ev = dec == null ? null : evPct(s.fair, 0, dec);
    return {
      key: `${g.id}|${s.market}|${s.player.toLowerCase().replace(/\s+/g, "-")}|${s.side}|${s.line ?? ""}`,
      gameId: g.id,
      oddsEventId: g.oddsEventId ?? "",
      market: s.market,
      side: s.side,
      player: s.player,
      team: g.home.name,
      teamId: g.home.id,
      teamAbbr: g.home.abbr,
      opp: g.away.abbr,
      kickoff: g.start,
      status: g.status,
      label: `${s.player} ${s.side === "yes" ? "Anytime TD" : `${s.side === "over" ? "O" : "U"} ${s.line} ${s.market}`}`,
      sub: `${g.home.abbr} vs ${g.away.abbr}`,
      line: s.line,
      fair: s.fair,
      fairAm: Math.round(s.fair >= 0.5 ? -100 * s.fair / (1 - s.fair) : 100 * (1 - s.fair) / s.fair),
      books: 3,
      cz,
      best: cz,
      dk: null,
      fd: null,
      evCz: ev,
      evBest: ev,
      grade: gradeFromEv(ev),
      kelly: null,
      playable: cz != null && g.status === "upcoming",
      ctx: null,
    };
  });
}

/** the fixture with the first N priced games flipped to live (kickoff an hour ago) */
function withLive(board: CfbBoard, n: number): CfbBoard {
  let flipped = 0;
  const games: CfbGame[] = board.games.map((g) => {
    if (flipped >= n || g.rows.length === 0) return g;
    flipped++;
    return { ...g, status: "live", start: new Date(NOW - 3600_000).toISOString(), rows: g.rows.map((r) => ({ ...r, playable: false })) };
  });
  return { ...board, games };
}

/* ---------- a synthetic slate through the real model (the SAFER tier needs likely +EV sides;
   the fixture has none — see the SAFER test) ---------- */

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
/** market −250 / +210 on the home ML, Caesars off-market at −180 → a ~70 % side priced +EV at Caesars.
    Caesars' spread / total at even money (2026-09-05, INSTRUCTION 42 benchmark): at −110 those legs
    grade about −4.5 % (pure vig) and never qualify, so the SPREAD / TOTAL sets had nothing to build from. */
const favEdge: Book[] = [
  { key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "draftkings", title: "DraftKings", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "williamhill_us", title: "Caesars", h2h: [-180, 150], spread: [-6.5, 100, 100], total: [50.5, 100, 100] },
];
function synthBoard(n: number): CfbBoard {
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  return buildCfbBoard({ date: DATE, espnEvents: idx.map((i) => espnEvent(i)), oddsEvents: idx.map((i) => oddsEvent(i, favEdge)), fpi: null, now: NOW, bankroll: 2500 });
}

const board = fixtureBoard();
const props = syntheticProps(board);
const picks = buildCfbPicks(board, props, OPTS);
const sideOnly = buildCfbPicks(board, null, OPTS);
const allParlays = (p: { parlays: CfbParlay[]; mixed: CfbParlay[]; live: CfbParlay[] }) => [...p.parlays, ...p.mixed, ...p.live];
const rowIndex = new Map<string, { evCz: number | null }>();
for (const g of board.games) for (const r of g.rows) rowIndex.set(r.key, r);
for (const r of props) rowIndex.set(r.key, r);

describe("cfb picks — categories", () => {
  it("every category key exists and a row never lands under the wrong market", () => {
    for (const k of CFB_PICK_CATEGORIES) expect(Array.isArray(picks.categories[k])).toBe(true);
    for (const [k, rows] of Object.entries(picks.categories)) {
      if (k === "all") continue;
      for (const r of rows) expect(r.market, `${r.key} under ${k}`).toBe(k);
    }
  });
  it("'all' is every playable side + prop with a Caesars price, and nothing else", () => {
    const sides = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz)).length;
    const propsN = props.filter((r) => r.playable && r.cz).length;
    expect(sides).toBeGreaterThan(0);
    expect(picks.categories.all.length).toBe(sides + propsN);
    expect(picks.categories.all.every((r) => r.cz != null && r.playable)).toBe(true);
    // the un-priced synthetic prop is not a pick
    expect(picks.categories.pass_yds.some((r) => r.label.startsWith("QB Kilo"))).toBe(false);
    expect(sideOnly.categories.all.length).toBe(sides);
    for (const k of ["anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"]) expect(sideOnly.categories[k]).toEqual([]);
  });
  it("each category is ranked S → F, then EV at Caesars descending", () => {
    for (const rows of Object.values(picks.categories)) {
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1];
        const b = rows[i];
        const g = gradeRank(a.grade) - gradeRank(b.grade);
        expect(g).toBeGreaterThanOrEqual(0);
        if (g === 0) expect((a.evCz ?? -Infinity) >= (b.evCz ?? -Infinity)).toBe(true);
      }
    }
  });
  it("prob is the row's fair probability; the 'all' view mixes sides and props", () => {
    for (const r of picks.categories.all) expect(r.prob).toBe(r.fair);
    expect(picks.categories.all.some((r) => r.kind === "prop")).toBe(true);
    expect(picks.categories.all.some((r) => r.kind === "side")).toBe(true);
  });
});

describe("cfb parlays — every ticket", () => {
  const tickets = allParlays(picks);
  it("the fixture yields parlays", () => {
    expect(picks.parlays.length).toBeGreaterThan(0);
  });
  it("ev = 100·(Π prob · dec − 1), am from dec, dec = Π Caesars decimals", () => {
    for (const t of tickets) {
      const prob = t.legs.reduce((p, l) => p * l.prob, 1);
      const dec = t.legs.reduce((d, l) => d * l.dec, 1);
      expect(t.prob).toBeCloseTo(prob, 9);
      expect(t.dec).toBeCloseTo(dec, 3);
      expect(t.ev).toBeCloseTo(100 * (prob * dec - 1), 1);
      expect(t.am).toBe(decToAm(t.dec));
      for (const l of t.legs) expect(l.dec).toBeCloseTo(amToDec(l.cz), 9);
    }
  });
  it("never two legs on the same player, at most maxPerGame legs per game, never both sides of a market", () => {
    for (const t of tickets) {
      const players = t.legs.map((l) => l.player).filter((p): p is string => !!p);
      expect(new Set(players).size).toBe(players.length);
      const perGame = new Map<string, number>();
      const markets = new Set<string>();
      for (const l of t.legs) {
        perGame.set(l.gameId, (perGame.get(l.gameId) ?? 0) + 1);
        if (l.kind === "side") {
          const k = `${l.gameId}|${l.market}`;
          expect(markets.has(k), `${t.id} doubles ${k}`).toBe(false);
          markets.add(k);
        }
      }
      for (const n of perGame.values()) expect(n).toBeLessThanOrEqual(CFB_PARLAYS.maxPerGame);
      expect(new Set(t.legs.map((l) => l.rowKey)).size).toBe(t.legs.length);
    }
  });
  it("every leg is a Caesars-priced row with EV ≥ minLegEvPct (never an F)", () => {
    for (const t of tickets)
      for (const l of t.legs) {
        const r = rowIndex.get(l.rowKey);
        expect(r, l.rowKey).toBeTruthy();
        expect(r!.evCz ?? -Infinity).toBeGreaterThanOrEqual(CFB_PARLAYS.minLegEvPct);
      }
    // the F-grade synthetic prop is never a leg
    expect(tickets.some((t) => t.legs.some((l) => l.player === "WR Juliet"))).toBe(false);
  });
  it("tickets in a view are distinct leg sets, at most perView per tier in the legacy view (mixed / live now hold up to perCategory — INSTRUCTION 42, 2026-09-05), ids numbered per view", () => {
    const liveP = buildCfbPicks(withLive(board, 3), props, OPTS);
    for (const [view, list] of [["parlays", picks.parlays], ["mixed", liveP.mixed], ["live", liveP.live]] as const) {
      const keys = list.map((t) => t.legs.map((l) => l.rowKey).sort().join("+"));
      expect(new Set(keys).size).toBe(keys.length);
      list.forEach((t, i) => {
        expect(t.id).toBe(`cfb-${DATE}-${view}-${i + 1}`);
        expect(t.view).toBe(view);
      });
      if (view === "parlays") {
        const perTier = new Map<string, number>();
        for (const t of list) perTier.set(t.tier, (perTier.get(t.tier) ?? 0) + 1);
        for (const n of perTier.values()) expect(n).toBeLessThanOrEqual(CFB_PARLAYS.perView);
      } else {
        // 2026-09-05 INSTRUCTION 42: the mixed / live views ARE the mixed / live category sets (up to 50 each)
        expect(list.length).toBeLessThanOrEqual(CFB_PARLAYS.perCategory);
      }
    }
  });
});

describe("cfb parlays — the tiers", () => {
  const safer = picks.parlays.filter((t) => t.tier === "SAFER");
  const longshot = picks.parlays.filter((t) => t.tier === "LONGSHOT");
  const mix = picks.parlays.filter((t) => t.tier === "MIX");
  it("SAFER on the fixture: no SIDE is ≥ 58 % to hit AND ≥ −3 % EV at Caesars (the −1700 favorites sit near −5 %), so every SAFER leg is a prop (pool widened to props 2026-09-05 — Caesars posts no moneyline on big favorites, sides-only SAFER was empty on the opening slate)", () => {
    const qualifying = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz && (r.evCz ?? -Infinity) >= CFB_PARLAYS.minLegEvPct && r.fair >= CFB_PARLAYS.safer.minLegProb));
    expect(qualifying).toEqual([]);
    expect(safer.length).toBeGreaterThan(0);
    for (const t of safer) {
      expect(t.type).toBe("PROPS");
      for (const l of t.legs) {
        expect(l.kind).toBe("prop");
        expect(l.prob).toBeGreaterThanOrEqual(CFB_PARLAYS.safer.minLegProb);
      }
      expect(t.dec).toBeLessThanOrEqual(CFB_PARLAYS.safer.maxDec + 1e-6);
    }
    const noProps = buildCfbPicks(board, null, OPTS);
    expect(noProps.parlays.filter((t) => t.tier === "SAFER")).toEqual([]);
  });
  it("SAFER (synthetic slate, props null): 2–3 side legs, each ≥ minLegProb, dec ≤ maxDec, ranked by combined probability, perView cap", () => {
    const synth = buildCfbPicks(synthBoard(5), null, OPTS);
    const safer = synth.parlays.filter((t) => t.tier === "SAFER");
    expect(safer.length).toBe(CFB_PARLAYS.perView); // C(5,2) = 10 pairs qualify; triples price past maxDec
    for (const t of safer) {
      expect(t.legs.length).toBeGreaterThanOrEqual(CFB_PARLAYS.safer.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(CFB_PARLAYS.safer.legs.max);
      expect(t.dec).toBeLessThanOrEqual(CFB_PARLAYS.safer.maxDec + 1e-6);
      expect(t.type).toBe("SIDES");
      expect(t.name).toBe(`SAFER · ${t.legs.length} legs`);
      for (const l of t.legs) {
        expect(l.kind).toBe("side");
        expect(l.prob).toBeGreaterThanOrEqual(CFB_PARLAYS.safer.minLegProb);
      }
    }
    for (let i = 1; i < safer.length; i++) expect(safer[i - 1].prob).toBeGreaterThanOrEqual(safer[i].prob);
  });
  it("LONGSHOT: 4–6 legs, dec inside the longshot band, ranked by EV", () => {
    expect(longshot.length).toBeGreaterThan(0);
    for (const t of longshot) {
      expect(t.legs.length).toBeGreaterThanOrEqual(CFB_PARLAYS.longshot.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(CFB_PARLAYS.longshot.legs.max);
      expect(t.dec).toBeGreaterThanOrEqual(CFB_PARLAYS.longshot.minDec - 1e-6);
      expect(t.dec).toBeLessThanOrEqual(CFB_PARLAYS.longshot.maxDec + 1e-6);
      expect(t.name).toBe(`LONGSHOT · ${t.legs.length} legs`);
    }
    for (let i = 1; i < longshot.length; i++) expect(longshot[i - 1].ev).toBeGreaterThanOrEqual(longshot[i].ev);
  });
  it("MIX: 3–5 legs, dec inside the mix band, at least one side and one prop, ranked by EV", () => {
    expect(mix.length).toBeGreaterThan(0);
    for (const t of mix) {
      expect(t.legs.length).toBeGreaterThanOrEqual(CFB_PARLAYS.mix.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(CFB_PARLAYS.mix.legs.max);
      expect(t.dec).toBeGreaterThanOrEqual(CFB_PARLAYS.mix.minDec - 1e-6);
      expect(t.dec).toBeLessThanOrEqual(CFB_PARLAYS.mix.maxDec + 1e-6);
      expect(t.legs.some((l) => l.kind === "side")).toBe(true);
      expect(t.legs.some((l) => l.kind === "prop")).toBe(true);
      expect(t.type).toBe("MIXED");
      expect(t.name).toBe(`MIX · ${t.legs.length} legs`);
    }
    for (let i = 1; i < mix.length; i++) expect(mix[i - 1].ev).toBeGreaterThanOrEqual(mix[i].ev);
  });
  it("with props null there is no MIX tier and no prop leg anywhere", () => {
    expect(sideOnly.parlays.some((t) => t.tier === "MIX")).toBe(false);
    expect(allParlays(sideOnly).every((t) => t.legs.every((l) => l.kind === "side"))).toBe(true);
  });
});

describe("cfb parlays — mixed and live views", () => {
  it("nothing live → mixed and live are empty", () => {
    expect(board.games.some((g) => g.status === "live")).toBe(false);
    expect(picks.mixed).toEqual([]);
    expect(picks.live).toEqual([]);
  });
  it("with live games: live tickets use only live rows; mixed tickets pair live with upcoming", () => {
    const liveBoard = withLive(board, 3);
    const liveIds = new Set(liveBoard.games.filter((g) => g.status === "live").map((g) => g.id));
    const p = buildCfbPicks(liveBoard, props, OPTS);
    expect(p.live.length).toBeGreaterThan(0);
    for (const t of p.live) {
      expect(t.legs.length).toBeGreaterThanOrEqual(2);
      expect(t.legs.every((l) => liveIds.has(l.gameId))).toBe(true);
      expect(t.type).toBe("LIVE");
      expect(t.name).toBe(`LIVE · ${t.legs.length} legs`);
    }
    expect(p.mixed.length).toBeGreaterThan(0);
    for (const t of p.mixed) {
      expect(t.legs.some((l) => liveIds.has(l.gameId))).toBe(true);
      expect(t.legs.some((l) => !liveIds.has(l.gameId))).toBe(true);
      expect(t.name).toBe(`MIXED · ${t.legs.length} legs`);
      expect(["SAFER", "LONGSHOT", "MIX"]).toContain(t.tier);
    }
    // the "parlays" view never carries a live leg
    for (const t of p.parlays) expect(t.legs.every((l) => !liveIds.has(l.gameId))).toBe(true);
    // 2026-09-05 INSTRUCTION 42: live rows used to be excluded from the categories ("live rows
    // are not picks"); Josh asked for every pick on the board to be graded, so they are admitted
    // now — see "INSTRUCTION 42 — live rows in the categories"
    expect(p.categories.all.some((r) => liveIds.has(r.gameId))).toBe(true);
  });
  it("games already kicked off (status upcoming but start ≤ now) never supply a leg", () => {
    const late = { ...board, games: board.games.map((g) => ({ ...g, start: new Date(NOW - 1000).toISOString() })) };
    const p = buildCfbPicks(late, props, OPTS);
    expect(allParlays(p)).toEqual([]);
    // INSTRUCTION 42 (2026-09-05): nor a ticket in any category set, nor a pick row
    for (const k of CFB_PARLAY_CATEGORIES) expect(p.sets[k]).toEqual([]);
    expect(p.categories.all).toEqual([]);
    expect(p.liveRows).toBe(0);
  });
});

describe("cfb picks — determinism", () => {
  it("the same inputs build the same output, byte for byte", () => {
    const a = JSON.stringify(buildCfbPicks(board, props, OPTS));
    const b = JSON.stringify(buildCfbPicks(board, [...props].reverse(), OPTS));
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify(picks));
  });
  it("two null-EV rows rank the same in either input order (prob desc, then key) — no NaN short-circuit", () => {
    // (-Infinity) - (-Infinity) is NaN; a subtracting comparator returned NaN there, which sort reads as
    // "equal", so the prob / key tiebreaks never ran and the order followed the input.
    const base = picks.categories.all[0];
    const mk = (key: string, prob: number | null): CfbPickRow => ({ ...base, key, grade: null, evCz: null, prob });
    const a = mk("a", 0.4);
    const b = mk("b", 0.6);
    const c = mk("c", 0.6);
    expect(rankPicks([a, b, c]).map((r) => r.key)).toEqual(["b", "c", "a"]);
    expect(rankPicks([c, b, a]).map((r) => r.key)).toEqual(["b", "c", "a"]);
    expect(rankPicks([b, a, c]).map((r) => r.key)).toEqual(["b", "c", "a"]);
    // a priced row still outranks an unpriced one; two priced rows go by EV
    const d = { ...mk("d", 0.1), evCz: -20 };
    const e = { ...mk("e", 0.1), evCz: -25 };
    expect(rankPicks([a, e, d]).map((r) => r.key)).toEqual(["d", "e", "a"]);
    // categories on the real board are input-order independent too
    const rev = { ...board, games: [...board.games].reverse().map((g) => ({ ...g, rows: [...g.rows].reverse() })) };
    const p2 = buildCfbPicks(rev, [...props].reverse(), OPTS);
    for (const k of CFB_PICK_CATEGORIES) expect(p2.categories[k].map((r) => r.key)).toEqual(picks.categories[k].map((r) => r.key));
  });
  it("carries the slate date and the build instant", () => {
    expect(picks.date).toBe(DATE);
    expect(picks.generatedAt).toBe(new Date(NOW).toISOString());
  });
});

/* ====================================================================================
   INSTRUCTION 42 (2026-09-05, Josh, verbatim): "Its only showing ANYTIME TD picks for 3 games
   under 'ALL' button on 'Board'. There are a ton of games live and a ton of games the rest of
   the day. It should be grading every possible pick available on the board that falls under
   those props and displaying them. If they aren't top 50 that's fine but they should but under
   the 'ALL' tab. * Under the 'generated parlays' on board tab, there needs to be A TON more.
   There should be 50 parlay options under each category (ML, spread, Anytime TD, Pass TD, Pass
   Yards, Receiving Yards, Combos, etc) The live parlay section and combo section (that has
   live & pregame picks on the same ticket) should still be generating picks as well"
   ==================================================================================== */

const SINGLE_MARKET_CATS = CFB_PARLAY_CATEGORIES.filter((k) => k !== "combo" && k !== "mixed" && k !== "live");
const SET_LABELS: Record<CfbParlayCategory, string> = { ml: "ML", spread: "SPREAD", total: "TOTAL", anytime_td: "ANYTIME TD", pass_tds: "PASS TDS", pass_yds: "PASS YDS", receptions: "RECEPTIONS", rush_yds: "RUSH YDS", rec_yds: "REC YDS", combo: "COMBO", mixed: "MIXED", live: "LIVE" };
const legKey = (t: CfbParlay) => t.legs.map((l) => l.rowKey).sort().join("+");
/** the EV floor a set ticket's legs must clear: the −3 gate when `gated`, else the tier-2 floor (single-market sets only) */
const legFloor = (t: CfbParlay) => (t.gated ? CFB_PARLAYS.minLegEvPct : CFB_PARLAYS.setFloorEvPct);

describe("INSTRUCTION 42 — live rows in the categories", () => {
  const liveBoard = withLive(board, 3);
  const liveIds = new Set(liveBoard.games.filter((g) => g.status === "live").map((g) => g.id));
  const p = buildCfbPicks(liveBoard, props, OPTS);
  const liveRows = p.categories.all.filter((r) => liveIds.has(r.gameId));
  it("live sides and live props (status adopted from the slate game) are admitted, counted in liveRows", () => {
    expect(liveRows.length).toBeGreaterThan(0);
    expect(p.liveRows).toBe(liveRows.length);
    expect(liveRows.some((r) => r.kind === "side")).toBe(true);
    // the synthetic props carry status "upcoming" from the pre-flip board; the engine reads the slate game's status
    expect(liveRows.some((r) => r.kind === "prop")).toBe(true);
    expect(picks.liveRows).toBe(0);
  });
  it("live rows are graded on the EV at Caesars like any row, with kelly null and playable false, status live, a Caesars price always", () => {
    for (const r of liveRows) {
      expect(r.cz).not.toBeNull();
      expect(r.kelly).toBeNull();
      expect(r.playable).toBe(false);
      expect(r.status).toBe("live");
      expect(r.grade).toBe(gradeFromEv(r.evCz));
    }
    // and they sit in the rank order with everyone else (S → F, then EV)
    for (const rows of Object.values(p.categories)) {
      for (let i = 1; i < rows.length; i++) {
        const g = gradeRank(rows[i - 1].grade) - gradeRank(rows[i].grade);
        expect(g).toBeGreaterThanOrEqual(0);
        if (g === 0) expect((rows[i - 1].evCz ?? -Infinity) >= (rows[i].evCz ?? -Infinity)).toBe(true);
      }
    }
  });
  it("a live row only ever lands under its own market; upcoming rows are unchanged; final games never appear", () => {
    for (const [k, rows] of Object.entries(p.categories)) if (k !== "all") for (const r of rows) expect(r.market).toBe(k);
    const upcomingKeys = p.categories.all.filter((r) => !liveIds.has(r.gameId)).map((r) => r.key).sort();
    const beforeKeys = picks.categories.all.filter((r) => !liveIds.has(r.gameId)).map((r) => r.key).sort();
    expect(upcomingKeys).toEqual(beforeKeys);
    const finalBoard: CfbBoard = { ...liveBoard, games: liveBoard.games.map((g) => (g.status === "live" ? { ...g, status: "final" } : g)) };
    const f = buildCfbPicks(finalBoard, props, OPTS);
    expect(f.liveRows).toBe(0);
    expect(f.categories.all.some((r) => liveIds.has(r.gameId))).toBe(false);
  });
});

describe("INSTRUCTION 42 — the category sets (fixture)", () => {
  const liveP = buildCfbPicks(withLive(board, 3), props, OPTS);
  const liveIds = new Set(withLive(board, 3).games.filter((g) => g.status === "live").map((g) => g.id));
  it("every category key exists, each set holds at most perCategory distinct tickets, ids numbered per category, category stamped", () => {
    for (const source of [picks, liveP]) {
      for (const k of CFB_PARLAY_CATEGORIES) {
        const list = source.sets[k];
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeLessThanOrEqual(CFB_PARLAYS.perCategory);
        const keys = list.map(legKey);
        expect(new Set(keys).size).toBe(keys.length);
        list.forEach((t, i) => {
          expect(t.category).toBe(k);
          expect(t.id).toBe(`cfb-${DATE}-${k}-${i + 1}`);
          const band = k === "combo" || k === "mixed" || k === "live" ? { legs: { min: 2, max: 6 }, minDec: 1.5, maxDec: 60 } : setBandOf(k);
          expect(t.legs.length).toBeGreaterThanOrEqual(band.legs.min);
          expect(t.legs.length).toBeLessThanOrEqual(band.legs.max);
          expect(t.dec).toBeLessThanOrEqual(band.maxDec + 1e-6);
          expect(["SAFER", "LONGSHOT", "MIX"]).toContain(t.tier);
          expect(typeof t.gated).toBe("boolean");
        });
      }
      expect(source.mixed).toBe(source.sets.mixed);
      expect(source.live).toBe(source.sets.live);
    }
    // the legacy tiered tickets carry a category read off their legs
    for (const t of picks.parlays) expect(CFB_PARLAY_CATEGORIES).toContain(t.category);
  });
  it("single-market sets: only that market, one leg per game, pregame legs only, dec inside the set's band, gated tickets first then each half ranked by EV then prob", () => {
    let any = 0;
    for (const k of SINGLE_MARKET_CATS) {
      const list = liveP.sets[k];
      const band = setBandOf(k);
      any += list.length;
      for (const t of list) {
        for (const l of t.legs) {
          expect(l.market).toBe(k);
          expect(liveIds.has(l.gameId)).toBe(false);
        }
        expect(new Set(t.legs.map((l) => l.gameId)).size).toBe(t.legs.length);
        expect(t.dec).toBeGreaterThanOrEqual(band.minDec - 1e-6);
        expect(t.name).toBe(`${SET_LABELS[k]} · ${t.legs.length} legs`);
      }
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        // tiered ranking (2026-09-05): a gated ticket never follows an ungated one; inside a tier, EV then prob
        expect(a.gated || !b.gated, `${t(a)} before ${t(b)}`).toBe(true);
        if (a.gated === b.gated) expect(a.ev).toBeGreaterThanOrEqual(b.ev);
      }
    }
    expect(any).toBeGreaterThan(0);
    // the fixture's synthetic anytime-TD rows: RB Bravo and WR Golf clear −3 (distinct games) → the one gated pair leads;
    // TE India (−7 % EV, an F) is a tier-2 leg (≥ −12) now that tier 1 cannot fill the set → three more tickets, all ungated,
    // all in the anytime-TD band (dec 4–250; the 2-leg Bravo + Golf prices 4.69)
    const atd = picks.sets.anytime_td;
    expect(atd.length).toBe(4);
    expect(atd[0].gated).toBe(true);
    expect(atd[0].legs.map((l) => l.player).sort()).toEqual(["RB Bravo", "WR Golf"]);
    for (const x of atd.slice(1)) {
      expect(x.gated).toBe(false);
      expect(x.legs.some((l) => l.player === "TE India")).toBe(true);
    }
    function t(x: CfbParlay) {
      return `${x.id}(${x.gated ? "gated" : "open"} ${x.ev})`;
    }
  });
  it("combo: pregame, at least one side AND one prop, 3–6 legs, dec 2–60", () => {
    expect(picks.sets.combo.length).toBeGreaterThan(0);
    for (const t of picks.sets.combo) {
      expect(t.legs.some((l) => l.kind === "side")).toBe(true);
      expect(t.legs.some((l) => l.kind === "prop")).toBe(true);
      expect(t.legs.length).toBeGreaterThanOrEqual(3);
      expect(t.dec).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(t.type).toBe("MIXED");
      expect(t.name).toBe(`COMBO · ${t.legs.length} legs`);
    }
    // props null → no combo, no prop set
    expect(sideOnly.sets.combo).toEqual([]);
    for (const k of ["anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"] as const) expect(sideOnly.sets[k]).toEqual([]);
    expect(sideOnly.sets.ml.length + sideOnly.sets.spread.length + sideOnly.sets.total.length).toBeGreaterThan(0);
  });
  it("mixed: every ticket pairs a live leg with a pregame leg; live: live legs only; both empty with nothing live", () => {
    expect(picks.sets.mixed).toEqual([]);
    expect(picks.sets.live).toEqual([]);
    expect(liveP.sets.mixed.length).toBeGreaterThan(0);
    for (const t of liveP.sets.mixed) {
      expect(t.legs.some((l) => liveIds.has(l.gameId))).toBe(true);
      expect(t.legs.some((l) => !liveIds.has(l.gameId))).toBe(true);
      expect(t.view).toBe("mixed");
    }
    expect(liveP.sets.live.length).toBeGreaterThan(0);
    for (const t of liveP.sets.live) {
      expect(t.legs.every((l) => liveIds.has(l.gameId))).toBe(true);
      expect(t.view).toBe("live");
      expect(t.type).toBe("LIVE");
    }
  });
  it("every set ticket obeys the leg rules: Caesars-priced, EV ≥ minLegEvPct when gated (else ≥ setFloorEvPct, single-market sets only), no doubled market on a game, no doubled player, per-game cap", () => {
    const all = CFB_PARLAY_CATEGORIES.flatMap((k) => liveP.sets[k]);
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) {
      const perGame = new Map<string, number>();
      const markets = new Set<string>();
      const players = t.legs.map((l) => l.player).filter((x): x is string => !!x);
      expect(new Set(players).size).toBe(players.length);
      if (t.category === "combo" || t.category === "mixed" || t.category === "live") expect(t.gated, t.id).toBe(true);
      // `gated` is exactly "every leg cleared −3"
      expect(t.gated).toBe(t.legs.every((l) => (rowIndex.get(l.rowKey)!.evCz ?? -Infinity) >= CFB_PARLAYS.minLegEvPct));
      for (const l of t.legs) {
        const r = rowIndex.get(l.rowKey);
        expect(r, l.rowKey).toBeTruthy();
        expect(r!.evCz ?? -Infinity).toBeGreaterThanOrEqual(legFloor(t));
        expect(l.dec).toBeCloseTo(amToDec(l.cz), 9);
        perGame.set(l.gameId, (perGame.get(l.gameId) ?? 0) + 1);
        // INSTRUCTION 42 (2026-09-05, review fix): one market per game for PROP legs too, not only sides
        const k = `${l.gameId}|${l.market}`;
        expect(markets.has(k), k).toBe(false);
        markets.add(k);
      }
      for (const n of perGame.values()) expect(n).toBeLessThanOrEqual(CFB_PARLAYS.maxPerGame);
      const prob = t.legs.reduce((p, l) => p * l.prob, 1);
      const dec = t.legs.reduce((d, l) => d * l.dec, 1);
      expect(t.prob).toBeCloseTo(prob, 9);
      expect(t.dec).toBeCloseTo(dec, 3);
      expect(t.am).toBe(decToAm(t.dec));
    }
  });
  it("deterministic: reversed inputs build the same sets, byte for byte", () => {
    const rev = { ...withLive(board, 3), games: [...withLive(board, 3).games].reverse().map((g) => ({ ...g, rows: [...g.rows].reverse() })) };
    const a = JSON.stringify(liveP);
    expect(JSON.stringify(buildCfbPicks(rev, [...props].reverse(), OPTS))).toBe(a);
    expect(JSON.stringify(buildCfbPicks(withLive(board, 3), props, OPTS))).toBe(a);
  });
});

describe("INSTRUCTION 42 (2026-09-05, review fix): legFits blocks a doubled market on one game for props, and legs keep `live`", () => {
  const liveP = buildCfbPicks(withLive(board, 3), props, OPTS);
  type L = Parameters<typeof legFits>[0];
  const leg = (o: Partial<L>): L => ({ kind: "prop", rowKey: "k", gameId: "g1", label: "", sub: "", cz: -110, dec: 1.909, prob: 0.55, push: 0, market: "anytime_td", player: "RB One", teamId: null, evCz: 1, live: false, ...o });
  it("two players' anytime TDs from the same game do not fit on one ticket (maxPerGame 2)", () => {
    const a = leg({ rowKey: "a", player: "RB One" });
    const b = leg({ rowKey: "b", player: "RB Two" });
    expect(legFits(b, [a], 2)).toBe(false);
    // a different market on the same game still fits under the cap
    expect(legFits(leg({ rowKey: "c", player: "QB One", market: "pass_yds" }), [a], 2)).toBe(true);
    // a side beside a prop on the same game still fits
    expect(legFits(leg({ rowKey: "d", kind: "side", player: null, market: "ml" }), [a], 2)).toBe(true);
  });
  it("finished tickets carry `live` on each leg: MIXED tickets have both true and false legs, LIVE all true, pregame sets all false", () => {
    for (const t of liveP.sets.mixed) {
      expect(t.legs.some((l) => l.live === true)).toBe(true);
      expect(t.legs.some((l) => l.live === false)).toBe(true);
    }
    for (const t of liveP.sets.live) expect(t.legs.every((l) => l.live === true)).toBe(true);
    for (const t of liveP.sets.combo) expect(t.legs.every((l) => l.live === false)).toBe(true);
    expect(liveP.sets.mixed.length).toBeGreaterThan(0);
  });
});

/* ---------- a fixture-scaled Saturday: 68 games through the real model, ~3,000 synthetic prop rows ---------- */

/** a tiny deterministic LCG so the scaled slate is the same on every run */
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
const PROP_SHAPE: { market: CfbPropRow["market"]; ou: boolean; players: string[] }[] = [
  { market: "pass_yds", ou: true, players: ["QB1"] },
  { market: "pass_tds", ou: true, players: ["QB1", "QB2"] },
  { market: "rush_yds", ou: true, players: ["RB1", "RB2", "QB1", "WR1"] },
  { market: "rec_yds", ou: true, players: ["WR1", "WR2", "WR3", "TE1", "RB1"] },
  { market: "receptions", ou: true, players: ["WR1", "WR2", "WR3", "TE1", "RB1"] },
  { market: "anytime_td", ou: false, players: ["RB1", "RB2", "RB3", "WR1", "WR2", "WR3", "TE1", "TE2", "QB1", "WR4"] },
];
/** ~44 rows per game: every over/under pair plus the anytime-TD yes rows */
function scaledProps(board: CfbBoard, liveIds: Set<string>): CfbPropRow[] {
  const rnd = lcg(42);
  const rows: CfbPropRow[] = [];
  for (const g of board.games) {
    for (const shape of PROP_SHAPE) {
      for (const who of shape.players) {
        const player = `${who} ${g.home.abbr}`;
        const line = shape.ou ? Math.round(rnd() * 200) / 2 + 0.5 : null;
        const sides: CfbPropRow["side"][] = shape.ou ? ["over", "under"] : ["yes"];
        const fairOver = shape.ou ? 0.42 + rnd() * 0.16 : 0.2 + rnd() * 0.5;
        for (const side of sides) {
          const fair = side === "under" ? 1 - fairOver : fairOver;
          // Caesars' price: the fair price nudged ±6 % so the EV spreads across the grades
          const dec = Math.max(1.05, (1 / fair) * (0.94 + rnd() * 0.12));
          const cz = { book: "williamhill_us", title: "Caesars", price: decToAm(Math.round(dec * 1000) / 1000), line, dec };
          const ev = evPct(fair, 0, dec);
          const live = liveIds.has(g.id);
          rows.push({
            key: `${g.id}|${shape.market}|${player.toLowerCase().replace(/\s+/g, "-")}|${side}|${line ?? ""}`,
            gameId: g.id,
            oddsEventId: g.oddsEventId ?? "",
            market: shape.market,
            side,
            player,
            team: g.home.name,
            teamId: g.home.id,
            teamAbbr: g.home.abbr,
            opp: g.away.abbr,
            kickoff: g.start,
            status: g.status,
            label: `${player} ${side === "yes" ? "Anytime TD" : `${side === "over" ? "O" : "U"} ${line} ${shape.market}`}`,
            sub: `${g.home.abbr} vs ${g.away.abbr}`,
            line,
            fair,
            fairAm: decToAm(1 / fair),
            books: 3,
            cz,
            best: cz,
            dk: null,
            fd: null,
            evCz: ev,
            evBest: ev,
            grade: gradeFromEv(ev),
            kelly: null,
            playable: !live,
            ctx: null,
          });
        }
      }
    }
  }
  return rows;
}

describe("INSTRUCTION 42 — a 68-game Saturday (fixture-scaled benchmark)", () => {
  // 68 games: 20 in play, 48 still to kick — the real model prices every side row
  const LIVE_N = 20;
  const bigBoard = withLive(synthBoard(68), LIVE_N);
  const liveIds = new Set(bigBoard.games.filter((g) => g.status === "live").map((g) => g.id));
  const bigProps = scaledProps(bigBoard, liveIds);
  const big = buildCfbPicks(bigBoard, bigProps, OPTS);
  it("the slate is the size Josh described: 68 games, ~3,000 prop rows, 20 live", () => {
    expect(bigBoard.games.length).toBe(68);
    expect(liveIds.size).toBe(LIVE_N);
    expect(bigProps.length).toBeGreaterThanOrEqual(2900);
    expect(bigProps.length).toBeLessThanOrEqual(3100);
  });
  it("every category set fills to perCategory (50) with a spread of leg counts, and every ticket is distinct", () => {
    for (const k of CFB_PARLAY_CATEGORIES) {
      const list = big.sets[k];
      expect(list.length, k).toBe(CFB_PARLAYS.perCategory);
      expect(new Set(list.map(legKey)).size).toBe(list.length);
      // not fifty near-identical six-leggers: at least three different leg counts in the set
      expect(new Set(list.map((t) => t.legs.length)).size, k).toBeGreaterThanOrEqual(3);
    }
  });
  it("every pick on the board is graded: live rows counted, every Caesars-priced side and prop from a live or upcoming game is a pick", () => {
    const sides = bigBoard.games.filter((g) => g.status !== "final").flatMap((g) => g.rows.filter((r) => r.cz && (g.status === "live" || r.playable))).length;
    const propsN = bigProps.filter((r) => r.cz).length;
    expect(big.categories.all.length).toBe(sides + propsN);
    const live = big.categories.all.filter((r) => liveIds.has(r.gameId));
    expect(big.liveRows).toBe(live.length);
    expect(live.length).toBeGreaterThan(0);
    for (const r of live) {
      expect(r.kelly).toBeNull();
      expect(r.playable).toBe(false);
    }
  });
  it("set rules hold at scale: single-market sets are one market on distinct pregame games; combo has side + prop; mixed has live + pregame; live is live only", () => {
    for (const k of SINGLE_MARKET_CATS)
      for (const t of big.sets[k]) {
        const band = setBandOf(k);
        expect(t.legs.every((l) => l.market === k && !liveIds.has(l.gameId))).toBe(true);
        expect(new Set(t.legs.map((l) => l.gameId)).size).toBe(t.legs.length);
        expect(t.legs.length).toBeGreaterThanOrEqual(band.legs.min);
        expect(t.legs.length).toBeLessThanOrEqual(band.legs.max);
        expect(t.dec).toBeGreaterThanOrEqual(band.minDec - 1e-6);
        expect(t.dec).toBeLessThanOrEqual(band.maxDec + 1e-6);
        for (const l of t.legs) expect(l.dec).toBeGreaterThanOrEqual(1);
      }
    for (const t of big.sets.combo) {
      expect(t.legs.some((l) => l.kind === "side") && t.legs.some((l) => l.kind === "prop")).toBe(true);
      expect(t.legs.every((l) => !liveIds.has(l.gameId))).toBe(true);
      expect(t.legs.length).toBeGreaterThanOrEqual(3);
      expect(t.dec).toBeGreaterThanOrEqual(2 - 1e-6);
    }
    for (const t of big.sets.mixed) expect(t.legs.some((l) => liveIds.has(l.gameId)) && t.legs.some((l) => !liveIds.has(l.gameId))).toBe(true);
    for (const t of big.sets.live) expect(t.legs.every((l) => liveIds.has(l.gameId))).toBe(true);
    for (const t of CFB_PARLAY_CATEGORIES.flatMap((k) => big.sets[k])) {
      const players = t.legs.map((l) => l.player).filter((x): x is string => !!x);
      expect(new Set(players).size).toBe(players.length);
      const perGame = new Map<string, number>();
      for (const l of t.legs) perGame.set(l.gameId, (perGame.get(l.gameId) ?? 0) + 1);
      for (const n of perGame.values()) expect(n).toBeLessThanOrEqual(CFB_PARLAYS.maxPerGame);
    }
  });
  it("deterministic at scale: two runs deep-equal", () => {
    expect(buildCfbPicks(bigBoard, [...bigProps].reverse(), OPTS)).toEqual(big);
  });
  it("builds fast enough for the browser: best of 3 runs under 1000 ms (target ~150 ms in node)", () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      buildCfbPicks(bigBoard, bigProps, OPTS);
      best = Math.min(best, performance.now() - t0);
    }
    // eslint-disable-next-line no-console
    console.log(`buildCfbPicks × 68 games / ${bigProps.length} prop rows: best ${best.toFixed(1)} ms`);
    expect(best).toBeLessThan(1000);
  });
});

/* ====================================================================================
   TIERED LEG POOL (2026-09-05, Josh, verbatim): "It's also only showing 4 Anytime TD parlays in
   the generated parlays. It should be showing 50+ Anytime TD parlays"
   ==================================================================================== */

describe("CFB_PARLAYS — the pinned constants", () => {
  it("deep-equal pin: change the constant and this pin together", () => {
    expect(CFB_PARLAYS).toEqual({
      safer: { legs: { min: 2, max: 3 }, minLegProb: 0.58, maxDec: 3.5 },
      longshot: { legs: { min: 4, max: 6 }, minDec: 8, maxDec: 60 },
      mix: { legs: { min: 3, max: 5 }, minDec: 3, maxDec: 20 },
      minLegEvPct: -3,
      setFloorEvPct: -12,
      setBands: { anytime_td: { legs: { min: 2, max: 4 }, minDec: 4, maxDec: 250 } },
      maxPerGame: 2,
      perView: 6,
      perCategory: 50,
    });
  });
  it("setBandOf: anytime TD reads its own band, every other set the shared 2–6 / 1.5–60 band", () => {
    expect(setBandOf("anytime_td")).toEqual({ legs: { min: 2, max: 4 }, minDec: 4, maxDec: 250 });
    for (const k of CFB_PARLAY_CATEGORIES) if (k !== "anytime_td") expect(setBandOf(k)).toEqual({ legs: { min: 2, max: 6 }, minDec: 1.5, maxDec: 60 });
  });
});

/** 6 upcoming games × 12 Caesars anytime-TD rows. Games 0–2: players 0 and 1 clear the −3 gate —
    six tier-1 legs across three games, the prod shape (games 3–5 have none); the other players sit in the
    tier-2 band (−4 … −11 %, Caesars' anytime-TD shade); players 10–11 fall below the −12 floor and
    must never appear. Prices are the fair price shaded to hit those EVs, dec 1.3–8. */
function atdSlate(): { board: CfbBoard; rows: CfbPropRow[] } {
  const b = synthBoard(6);
  const rows: CfbPropRow[] = [];
  b.games.forEach((g, gi) => {
    for (let pi = 0; pi < 12; pi++) {
      const gated = gi < 3 && pi < 2;
      // target EV%: gated +1..+4, tier 2 −4..−11, below floor −14 / −20
      const ev = gated ? 1 + ((gi + pi) % 4) : pi >= 10 ? (pi === 10 ? -14 : -20) : -4 - ((gi * 3 + pi) % 8);
      const fair = 0.13 + ((gi * 7 + pi * 5) % 10) * 0.05; // 0.13 … 0.58
      const dec = (1 + ev / 100) / fair;
      const player = `P${pi} ${g.home.abbr}`;
      const cz = { book: "williamhill_us", title: "Caesars", price: decToAm(dec), line: null, dec };
      const evCz = evPct(fair, 0, dec);
      rows.push({
        key: `${g.id}|anytime_td|${player.toLowerCase().replace(/\s+/g, "-")}|yes|`,
        gameId: g.id,
        oddsEventId: g.oddsEventId ?? "",
        market: "anytime_td",
        side: "yes",
        player,
        team: g.home.name,
        teamId: g.home.id,
        teamAbbr: g.home.abbr,
        opp: g.away.abbr,
        kickoff: g.start,
        status: g.status,
        label: `${player} Anytime TD`,
        sub: `${g.home.abbr} vs ${g.away.abbr}`,
        line: null,
        fair,
        fairAm: decToAm(1 / fair),
        books: 3,
        cz,
        best: cz,
        dk: null,
        fd: null,
        evCz,
        evBest: evCz,
        grade: gradeFromEv(evCz),
        kelly: null,
        playable: true,
        ctx: null,
      });
    }
  });
  return { board: b, rows };
}

describe("TIERED LEG POOL — 50 anytime TD parlays from six −3 legs", () => {
  const { board: atdBoard, rows: atdRows } = atdSlate();
  const p = buildCfbPicks(atdBoard, atdRows, OPTS);
  const atd = p.sets.anytime_td;
  const evOf = new Map(atdRows.map((r) => [r.key, r.evCz ?? -Infinity]));
  const band = setBandOf("anytime_td");
  it("the fixture is the prod shape: 72 Caesars ATD rows, exactly 6 clear −3, 60 sit in the tier-2 band, 12 are below the floor", () => {
    expect(atdRows.length).toBe(72);
    expect(atdRows.filter((r) => r.evCz! >= CFB_PARLAYS.minLegEvPct).length).toBe(6);
    expect(atdRows.filter((r) => r.evCz! < CFB_PARLAYS.minLegEvPct && r.evCz! >= CFB_PARLAYS.setFloorEvPct).length).toBe(54);
    expect(atdRows.filter((r) => r.evCz! < CFB_PARLAYS.setFloorEvPct).length).toBe(12);
    for (const r of atdRows) {
      expect(r.cz!.dec).toBeGreaterThanOrEqual(1.3);
      expect(r.cz!.dec).toBeLessThanOrEqual(8);
    }
  });
  it("the anytime TD set reaches perCategory (50), distinct tickets, ids numbered per category", () => {
    expect(atd.length).toBe(CFB_PARLAYS.perCategory);
    expect(new Set(atd.map(legKey)).size).toBe(atd.length);
    atd.forEach((t, i) => {
      expect(t.id).toBe(`cfb-${DATE}-anytime_td-${i + 1}`);
      expect(t.category).toBe("anytime_td");
      expect(t.name).toBe(`ANYTIME TD · ${t.legs.length} legs`);
    });
  });
  it("gated tickets (every leg ≥ −3) come first, EV-ranked; the ungated rest follow, EV-ranked; both kinds exist", () => {
    const firstOpen = atd.findIndex((t) => !t.gated);
    expect(firstOpen).toBeGreaterThan(0);
    for (let i = 0; i < atd.length; i++) expect(atd[i].gated).toBe(i < firstOpen);
    // the card's `ev` is rounded to 2 dp; ranking is on the unrounded figure, so the rounded one is monotone, never strictly ordered
    for (const half of [atd.slice(0, firstOpen), atd.slice(firstOpen)]) for (let i = 1; i < half.length; i++) expect(half[i - 1].ev).toBeGreaterThanOrEqual(half[i].ev);
    for (const t of atd) expect(t.gated).toBe(t.legs.every((l) => evOf.get(l.rowKey)! >= CFB_PARLAYS.minLegEvPct));
  });
  it("every ticket: 2–4 legs, dec within [4, 250], one leg per game, only anytime_td, no leg below the −12 floor", () => {
    for (const t of atd) {
      expect(t.legs.length).toBeGreaterThanOrEqual(band.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(band.legs.max);
      expect(t.dec).toBeGreaterThanOrEqual(band.minDec - 1e-6);
      expect(t.dec).toBeLessThanOrEqual(band.maxDec + 1e-6);
      expect(new Set(t.legs.map((l) => l.gameId)).size).toBe(t.legs.length);
      for (const l of t.legs) {
        expect(l.market).toBe("anytime_td");
        expect(l.live).toBe(false);
        expect(evOf.get(l.rowKey)!).toBeGreaterThanOrEqual(CFB_PARLAYS.setFloorEvPct);
      }
      expect(t.legs.some((l) => /^P1[01] /.test(l.label))).toBe(false);
    }
    // a spread of leg counts, not fifty of one size
    expect(new Set(atd.map((t) => t.legs.length)).size).toBeGreaterThanOrEqual(2);
  });
  it("the ungated half is not empty-handed EV: every ticket's ev is the honest product of its legs (negative on shaded legs)", () => {
    for (const t of atd) {
      const prob = t.legs.reduce((q, l) => q * l.prob, 1);
      const dec = t.legs.reduce((d, l) => d * l.dec, 1);
      expect(t.ev).toBeCloseTo(100 * (prob * dec - 1), 1);
      expect(t.am).toBe(decToAm(t.dec));
    }
    expect(atd.some((t) => !t.gated && t.ev < 0)).toBe(true);
  });
  it("the other single-market sets are unchanged in kind: side sets build from the same −3 legs first and never admit a leg below the floor; prop sets with no rows stay empty", () => {
    for (const k of ["pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"] as const) expect(p.sets[k]).toEqual([]);
    for (const k of ["ml", "spread", "total"] as const)
      for (const t of p.sets[k]) {
        expect(t.gated).toBe(true); // the synthetic board's Caesars sides all clear −3, so no tier-2 side ever enters
        expect(t.dec).toBeLessThanOrEqual(60 + 1e-6);
        expect(t.legs.length).toBeLessThanOrEqual(6);
      }
  });
  it("legacy views, combo, mixed and live keep tier 1 only: no leg below −3 anywhere outside the single-market sets", () => {
    const liveSlate = withLive(atdBoard, 2);
    const liveRowsAtd = atdRows.map((r) => ({ ...r, status: liveSlate.games.find((g) => g.id === r.gameId)!.status }));
    const lp = buildCfbPicks(liveSlate, liveRowsAtd, OPTS);
    const outside = [...p.parlays, ...p.sets.combo, ...lp.parlays, ...lp.sets.combo, ...lp.sets.mixed, ...lp.sets.live];
    expect(outside.length).toBeGreaterThan(0);
    expect(lp.sets.live.length + lp.sets.mixed.length).toBeGreaterThan(0);
    for (const t of outside) {
      expect(t.gated).toBe(true);
      for (const l of t.legs) if (l.market === "anytime_td") expect(evOf.get(l.rowKey)!).toBeGreaterThanOrEqual(CFB_PARLAYS.minLegEvPct);
    }
    // the tiered set is still tiered with games in play: live games' ATD legs never enter it
    const liveIds = new Set(liveSlate.games.filter((g) => g.status === "live").map((g) => g.id));
    for (const t of lp.sets.anytime_td) for (const l of t.legs) expect(liveIds.has(l.gameId)).toBe(false);
  });
  it("with tier 1 alone the set is small (the 4-ticket symptom): six −3 legs on three games cap at 12 pairs + 8 triples, one leg per game", () => {
    const strict = atdRows.filter((r) => r.evCz! >= CFB_PARLAYS.minLegEvPct);
    const s = buildCfbPicks(atdBoard, strict, OPTS);
    expect(s.sets.anytime_td.length).toBeGreaterThan(0);
    expect(s.sets.anytime_td.length).toBeLessThanOrEqual(20);
    expect(s.sets.anytime_td.every((t) => t.gated)).toBe(true);
    // the tiered build's gated half is exactly this set's tickets (same keys), so tier 2 only ever appends
    expect(new Set(atd.filter((t) => t.gated).map(legKey))).toEqual(new Set(s.sets.anytime_td.map(legKey)));
  });
  it("deterministic: reversed rows build the same tiered set, byte for byte", () => {
    expect(JSON.stringify(buildCfbPicks(atdBoard, [...atdRows].reverse(), OPTS).sets.anytime_td)).toBe(JSON.stringify(atd));
  });
});
