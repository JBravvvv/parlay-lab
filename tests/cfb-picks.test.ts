import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard, evPct } from "@/lib/cfb/model";
import { buildCfbPicks, CFB_PICK_CATEGORIES, rankPicks } from "@/lib/cfb/picks";
import type { CfbPickRow } from "@/lib/cfb/props-types";
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
/** market −250 / +210 on the home ML, Caesars off-market at −180 → a ~70 % side priced +EV at Caesars */
const favEdge: Book[] = [
  { key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "draftkings", title: "DraftKings", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
  { key: "williamhill_us", title: "Caesars", h2h: [-180, 150], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },
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
  it("tickets in a view are distinct leg sets, at most perView per tier, ids numbered per view", () => {
    for (const [view, list] of [["parlays", picks.parlays], ["mixed", picks.mixed], ["live", picks.live]] as const) {
      const keys = list.map((t) => t.legs.map((l) => l.rowKey).sort().join("+"));
      expect(new Set(keys).size).toBe(keys.length);
      list.forEach((t, i) => {
        expect(t.id).toBe(`cfb-${DATE}-${view}-${i + 1}`);
        expect(t.view).toBe(view);
      });
      const perTier = new Map<string, number>();
      for (const t of list) perTier.set(t.tier, (perTier.get(t.tier) ?? 0) + 1);
      for (const n of perTier.values()) expect(n).toBeLessThanOrEqual(CFB_PARLAYS.perView);
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
    // the "parlays" view never carries a live leg, and live rows are not picks
    for (const t of p.parlays) expect(t.legs.every((l) => !liveIds.has(l.gameId))).toBe(true);
    expect(p.categories.all.some((r) => liveIds.has(r.gameId))).toBe(false);
  });
  it("games already kicked off (status upcoming but start ≤ now) never supply a leg", () => {
    const late = { ...board, games: board.games.map((g) => ({ ...g, start: new Date(NOW - 1000).toISOString() })) };
    const p = buildCfbPicks(late, props, OPTS);
    expect(allParlays(p)).toEqual([]);
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
