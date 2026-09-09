import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCfbBoard, fpiIndex } from "@/lib/cfb/model";
import { buildCfbCard } from "@/lib/cfb/card";
import { buildCfbPicks } from "@/lib/cfb/picks";
import { gradeCfbEntry } from "@/lib/cfb/grade";
import { lockCfbCard, validateCfbLedger } from "@/lib/cfb/ledger";
import { finalsFromEspnOf, finalsOf } from "@/lib/cfb/slate-server";
import { CFB_LEAGUE, CFB_MODEL } from "@/lib/cfb/rules";
import { NFL_LEAGUE, NFL_MODEL, NFL_PAPER, NFL_PARLAYS, NFL_RULES } from "@/lib/nfl/rules";
import { CFB_PARLAY_CATEGORIES } from "@/lib/cfb/props-types";
import type { CfbBoard, CfbCardOpts } from "@/lib/cfb/types";

/**
 * THE SHARED FOOTBALL ENGINE ON THE NFL FIXTURES (2026-09-08, the NFL build — Josh: "NFL needs
 * to be built NOW"). One model, one card builder, one picks engine, one grader, one ledger shape —
 * every league-specific number read through NFL_LEAGUE, every id minted `nfl-…`.
 *
 * FIXTURES. The ESPN captures are real (scoreboard 2026-09-13 week 1, scoreboard 2026-08-22
 * preseason finals, powerindex). The odds are SYNTHESIZED (tests/fixtures/nfl/odds-2026-09-13.json,
 * `_note` on every event): shaped like the CFB odds capture with ESPN's own team names and kickoffs,
 * spreads from FPI + 2.0 hfa, invented retail prices. Nothing asserted here is a market claim —
 * every number is a structural fact of the fixture or a rule of the engine.
 */

type Rec = Record<string, unknown>;
const FIX = path.join(process.cwd(), "tests", "fixtures", "nfl");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const ESPN = readJson("espn-scoreboard-2026-09-13.json") as { events: unknown[] };
const ODDS = readJson("odds-2026-09-13.json") as Array<Record<string, unknown>>;
const FPI = readJson("espn-fpi.json") as unknown;
const FINALS_0822 = readJson("espn-scoreboard-2026-08-22-final.json") as { events: unknown[] };
const NOW = Date.parse("2026-09-13T14:00:00Z");
const DATE = "2026-09-13";

const nflBoard = (over: Partial<Parameters<typeof buildCfbBoard>[0]> = {}): CfbBoard =>
  buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500, league: NFL_LEAGUE, ...over });
const NFL_CARD_OPTS: CfbCardOpts = { bankroll: 2500, daily: NFL_PAPER.daily, fun: NFL_PAPER.fun, now: NOW, rules: NFL_RULES, idPrefix: "nfl" };

describe("buildCfbBoard with league: NFL_LEAGUE — the 2026-09-13 week-1 slate", () => {
  const b = nflBoard();

  it("13 games, every one matched to an odds event through the empty alias table (pass-through names)", () => {
    expect(b.date).toBe(DATE);
    expect(b.games).toHaveLength(13);
    expect(b.unmatched).toBe(0);
    expect(NFL_LEAGUE.aliases).toEqual({});
    for (const g of b.games) {
      expect(g.oddsEventId).not.toBeNull();
      expect(g.date).toBe(DATE);
    }
    // each odds event is used at most once
    expect(new Set(b.games.map((g) => g.oddsEventId)).size).toBe(13);
    // the synthesized odds carry the ESPN id they were shaped from — the join agrees with it
    const espnIdOf = new Map(ODDS.map((e) => [e.id as string, e._espnId as string]));
    for (const g of b.games) expect(espnIdOf.get(g.oddsEventId!)).toBe(g.id);
    // the Monday-night-shaped late game (00:20Z) sits on the SAME Pacific date and is on the slate
    expect(b.games.map((g) => g.id)).toContain("401872930");
  });

  it("FPI is joined by name on both sides of every game; the map holds all 32 clubs (the Rams included, off the slate)", () => {
    const { index } = fpiIndex(FPI);
    expect(index.size).toBe(32);
    expect(index.get("14")).toEqual({ fpi: 5.854, fpiRank: 1 });
    expect(b.games.some((g) => g.home.id === "14" || g.away.id === "14")).toBe(false);
    for (const g of b.games) {
      expect(g.home.fpi).not.toBeNull();
      expect(g.away.fpi).not.toBeNull();
      expect(g.model.parts.fpiMargin).not.toBeNull();
    }
  });

  it("model parameters are the NFL's: sigma 13.5 on every game, hfa 2.0 inside the FPI margin — and a CFB build of the same input differs", () => {
    expect(NFL_MODEL.hfa).toBe(2.0);
    expect(NFL_MODEL.sigma).toBe(13.5);
    expect(CFB_MODEL.hfa).toBe(2.6);
    expect(CFB_MODEL.sigma).toBe(16.5);
    const cfb = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500, league: CFB_LEAGUE });
    expect(cfb.games).toHaveLength(13);
    for (let i = 0; i < b.games.length; i++) {
      const n = b.games[i];
      const c = cfb.games[i];
      expect(c.id).toBe(n.id);
      expect(n.neutral).toBe(false);
      expect(n.model.sigma).toBe(13.5);
      expect(n.model.sigmaTotal).toBe(13.5);
      expect(c.model.sigma).toBe(16.5);
      expect(n.model.parts.fpiMargin!).toBeCloseTo(n.home.fpi! - n.away.fpi! + 2.0, 9);
      expect(c.model.parts.fpiMargin!).toBeCloseTo(n.home.fpi! - n.away.fpi! + 2.6, 9);
      expect(c.model.parts.fpiMargin! - n.model.parts.fpiMargin!).toBeCloseTo(0.6, 9);
      // the priced fair line moves with it: the blended margin and the spread-implied probability differ
      expect(n.model.muMargin).not.toBe(c.model.muMargin);
      expect(n.model.parts.spread).not.toBe(c.model.parts.spread);
    }
  });

  it("every game has Caesars on spread and total (playable rows) and the ML from four books; kelly ≤ 2 % of the bankroll", () => {
    for (const g of b.games) {
      expect(g.model.books).toEqual({ ml: 4, spread: 4, total: 4 });
      expect(g.rows.length).toBe(6);
      for (const r of g.rows) {
        expect(r.cz).not.toBeNull();
        expect(r.playable).toBe(true);
        expect(r.cz!.book).toBe(NFL_MODEL.settleBook);
        expect(Number.isInteger(r.kelly)).toBe(true);
        expect(r.kelly).toBeLessThanOrEqual(50);
      }
    }
  });

  it("without a league the same input builds a CFB board (the component-layer default)", () => {
    const d = buildCfbBoard({ date: DATE, espnEvents: ESPN.events, oddsEvents: ODDS, fpi: FPI, now: NOW, bankroll: 2500 });
    expect(d.games[0].model.sigma).toBe(CFB_MODEL.sigma);
    expect(d.games[0].model.parts.fpiMargin!).toBeCloseTo(d.games[0].home.fpi! - d.games[0].away.fpi! + CFB_MODEL.hfa, 9);
  });
});

/** American → decimal → American, the price improved for the bettor by `pct` percent of the decimal. */
function betterPrice(am: number, pct: number): number {
  const dec = (am > 0 ? 1 + am / 100 : 1 + 100 / -am) * (1 + pct / 100);
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

/** The synthetic odds with every Caesars (williamhill_us) price improved by `pct` % — a TEST
    transform: the raw synthetic slate is priced at the consensus and seats NO core ticket (a read
    fact, asserted below), so the staking rules need a slate with something to stake. */
function sharpenCaesars(events: Array<Record<string, unknown>>, pct: number): Array<Record<string, unknown>> {
  return events.map((raw) => {
    const ev = JSON.parse(JSON.stringify(raw)) as Rec;
    for (const bk of ev.bookmakers as Rec[]) {
      if (bk.key !== "williamhill_us") continue;
      for (const m of bk.markets as Rec[]) for (const o of m.outcomes as Rec[]) o.price = betterPrice(o.price as number, pct);
    }
    return ev;
  });
}

describe("buildCfbCard under NFL_RULES — $350 across ≤ 10 tickets of ≤ $50, ids nfl-…", () => {
  const raw = buildCfbCard(nflBoard(), NFL_CARD_OPTS);
  const b = nflBoard({ oddsEvents: sharpenCaesars(ODDS, 8) });
  const card = buildCfbCard(b, NFL_CARD_OPTS);

  it("the raw synthetic slate is priced at the consensus: no side clears +2 % EV, so no core ticket — only the $25 fun parlay", () => {
    expect(raw.core).toHaveLength(0);
    expect(raw.coreSum).toBe(0);
    expect(raw.noPlay).toBe(false);
    expect(raw.funT).toHaveLength(1);
    expect(raw.funT[0].id).toBe(`nfl-${DATE}-fun-1`);
    expect(raw.notes[0].startsWith("No core ticket")).toBe(true);
    expect(raw.notes[0]).toContain("$350");
    expect(raw.notes[0]).toContain("2.60");
  });

  it("with Caesars 8 % better than the consensus the engine seats core tickets and the fun parlay", () => {
    expect(card.noPlay).toBe(false);
    expect(card.core.length).toBeGreaterThan(0);
    expect(card.funT).toHaveLength(1);
    // every core leg is one of the board's playable rows at its Caesars price, with the model's probability at lock
    const rows = new Map(b.games.flatMap((g) => g.rows.map((r) => [r.key, r] as const)));
    for (const t of card.core) {
      for (const l of t.legs) {
        const r = rows.get(l.lkey)!;
        expect(r).toBeDefined();
        expect(r.playable).toBe(true);
        expect(l.cz).toBe(r.cz!.price);
        // prob is the model's win probability at the Caesars line (re-evaluated when cz's line differs from the consensus)
        expect(l.prob).toBeGreaterThan(0);
        expect(l.prob).toBeLessThan(1);
        expect(r.evCz!).toBeGreaterThanOrEqual(NFL_RULES.forcedMinEvPct);
      }
    }
  });

  it("every core id is nfl-2026-09-13-core-<i>, the fun id nfl-2026-09-13-fun-1", () => {
    card.core.forEach((t, i) => expect(t.id).toBe(`nfl-${DATE}-core-${i + 1}`));
    expect(card.funT[0].id).toBe(`nfl-${DATE}-fun-1`);
    for (const t of [...card.core, ...card.funT]) expect(t.id.startsWith("cfb-")).toBe(false);
  });

  it("coreSum ≤ 350, ≤ 10 core tickets, every stake in [5, 50], the fun ticket $25, one core ticket per game", () => {
    expect(card.coreSum).toBeLessThanOrEqual(NFL_PAPER.daily);
    expect(card.core.length).toBeLessThanOrEqual(NFL_RULES.tickets.max);
    for (const t of card.core) {
      expect(t.stake).toBeGreaterThanOrEqual(NFL_RULES.minStake);
      expect(t.stake).toBeLessThanOrEqual(NFL_RULES.maxStake);
      expect(t.czDec).toBeLessThanOrEqual(NFL_RULES.maxDec + 1e-9);
      expect(t.legs.length).toBeLessThanOrEqual(NFL_RULES.maxLegs);
    }
    const games = card.core.flatMap((t) => t.legs.map((l) => l.gkey));
    expect(new Set(games).size).toBe(games.length);
    expect(card.funSum).toBe(NFL_PAPER.fun);
    expect(card.funT[0].stake).toBe(25);
    expect(card.funT[0].legs.length).toBeGreaterThanOrEqual(NFL_RULES.fun.legs.min);
    expect(card.funT[0].legs.length).toBeLessThanOrEqual(NFL_RULES.fun.legs.max);
  });

  it("the notes name the NFL allotment, never the CFB one", () => {
    const text = card.notes.join("\n");
    expect(text).not.toMatch(/\$250\b/);
    expect(text).not.toMatch(/\$150\b/);
  });

  it("the same board under the CFB default mints cfb- ids and caps at the CFB daily", () => {
    const cfbCard = buildCfbCard(b, { bankroll: 2500, daily: 250, fun: 25, now: NOW });
    for (const t of cfbCard.core) expect(t.id.startsWith(`cfb-${DATE}-core-`)).toBe(true);
    expect(cfbCard.coreSum).toBeLessThanOrEqual(250);
    // an explicit NFL idPrefix with the NFL rules and daily is what separates the two, not the board
    const again = buildCfbCard(b, NFL_CARD_OPTS);
    expect(again).toEqual(card);
  });
});

describe("buildCfbPicks under NFL_PARLAYS — ids nfl-…, no set past perCategory 25", () => {
  const b = nflBoard();
  const picks = buildCfbPicks(b, null, { now: NOW, bankroll: 2500, parlays: NFL_PARLAYS, idPrefix: "nfl", rules: NFL_RULES });

  it("every parlay id starts with nfl-, per view and per category", () => {
    expect(picks.date).toBe(DATE);
    expect(picks.parlays.length).toBeGreaterThan(0);
    for (const p of picks.parlays) expect(p.id.startsWith(`nfl-${DATE}-`)).toBe(true);
    for (const c of CFB_PARLAY_CATEGORIES) {
      const set = picks.sets[c];
      expect(Array.isArray(set)).toBe(true);
      set.forEach((p, i) => expect(p.id).toBe(`nfl-${DATE}-${c}-${i + 1}`));
    }
  });

  it("no category set exceeds NFL_PARLAYS.perCategory (25); the sides-only sets fill", () => {
    expect(NFL_PARLAYS.perCategory).toBe(25);
    for (const c of CFB_PARLAY_CATEGORIES) expect(picks.sets[c].length).toBeLessThanOrEqual(25);
    expect(picks.sets.ml.length).toBe(25);
    expect(picks.sets.spread.length).toBe(25);
    expect(picks.sets.total.length).toBe(25);
    // props null → no prop legs anywhere, so the prop sets and combo are empty
    expect(picks.sets.anytime_td).toEqual([]);
    expect(picks.sets.combo).toEqual([]);
    for (const view of ["parlays", "mixed", "live"] as const) {
      for (const p of view === "parlays" ? picks.parlays : picks[view]) for (const l of p.legs) expect(l.kind).toBe("side");
    }
  });

  it("the CFB default on the same board mints cfb- ids and fills to CFB perCategory (50)", () => {
    const cfbPicks = buildCfbPicks(b, null, { now: NOW, bankroll: 2500 });
    for (const p of cfbPicks.parlays) expect(p.id.startsWith(`cfb-${DATE}-`)).toBe(true);
    expect(cfbPicks.sets.ml.length).toBe(50);
  });
});

describe("lockCfbCard / validateCfbLedger with NFL_LEAGUE", () => {
  const b = nflBoard();
  const card = buildCfbCard(b, NFL_CARD_OPTS);
  const entry = lockCfbCard(card, b, NOW, NFL_LEAGUE);

  it("stamps sport nfl, daily 350, fun 25, and the games the tickets sit on", () => {
    expect(entry.sport).toBe("nfl");
    expect(entry.daily).toBe(350);
    expect(entry.fun).toBe(25);
    expect(entry.locked).toBe(true);
    expect(entry.lockedAt).toBe(NOW);
    expect(entry.core).toBe(card.core);
    expect(entry.funT).toBe(card.funT);
    for (const t of [...card.core, ...card.funT]) for (const l of t.legs) expect(entry.games[l.gkey]).toBeDefined();
  });

  it("validateCfbLedger accepts it under NFL_LEAGUE and refuses it under CFB_LEAGUE (and the reverse)", () => {
    expect(validateCfbLedger([entry], NFL_LEAGUE).ok).toBe(true);
    const r = validateCfbLedger([entry], CFB_LEAGUE);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toBe(`entry ${DATE} is not a CFB entry (sport must be "cfb")`);
    const r2 = validateCfbLedger([entry]);
    expect(r2.ok).toBe(false);
    const cfbEntry = lockCfbCard(card, b, NOW);
    expect(cfbEntry.sport).toBe("cfb");
    expect(cfbEntry.daily).toBe(250);
    const r3 = validateCfbLedger([cfbEntry], NFL_LEAGUE);
    expect(r3.ok).toBe(false);
    expect(r3.ok ? "" : r3.error).toBe(`entry ${DATE} is not a NFL entry (sport must be "nfl")`);
  });
});

/* ==========================================================================================
   GRADING, ONE FLOW: the 2026-08-22 preseason finals are a REAL ESPN capture (10 STATUS_FINAL
   games). To grade a card against them the same events are first replayed as a PRE-KICK
   scoreboard (status rewritten to STATUS_SCHEDULED — a test transform of the real capture, the
   scores untouched but unread on an upcoming game) and priced with the 2026-09-13 synthetic odds
   re-labelled onto the 08-22 pairings. The card locks on that board; the finals come from the
   untouched capture through `finalsFromEspnOf(NFL_LEAGUE, …)`; the grader settles every leg.
   ========================================================================================== */
const DATE_0822 = "2026-08-22";
const NOW_0822 = Date.parse("2026-08-22T12:00:00Z");

function preKick(events: unknown[]): unknown[] {
  return events.map((raw) => {
    const ev = JSON.parse(JSON.stringify(raw)) as Rec;
    const pre = { type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail: "", shortDetail: "" } };
    ev.status = pre;
    for (const c of ev.competitions as Rec[]) c.status = pre;
    return ev;
  });
}

/** the 09-13 synthetic odds re-labelled onto the 08-22 pairings: same books, same prices, new names / kickoffs / ids */
function relabelOdds(events: unknown[]): Rec[] {
  const out: Rec[] = [];
  events.forEach((raw, i) => {
    const ev = raw as Rec;
    const comp = (ev.competitions as Rec[])[0];
    const teams = comp.competitors as Rec[];
    const home = (teams.find((t) => t.homeAway === "home")!.team as Rec).displayName as string;
    const away = (teams.find((t) => t.homeAway === "away")!.team as Rec).displayName as string;
    const src = JSON.parse(JSON.stringify(ODDS[i % ODDS.length])) as Rec;
    const rename = (name: string) => (name === src.home_team ? home : name === src.away_team ? away : name);
    for (const bk of src.bookmakers as Rec[]) {
      for (const m of bk.markets as Rec[]) for (const o of m.outcomes as Rec[]) o.name = rename(o.name as string);
    }
    out.push({ ...src, id: `synth-0822-${ev.id as string}`, _espnId: ev.id, commence_time: ev.date, home_team: home, away_team: away });
  });
  return out;
}

describe("gradeCfbEntry on the 2026-08-22 finals (real capture) — every leg settles won / lost / push", () => {
  const pre = buildCfbBoard({ date: DATE_0822, espnEvents: preKick(FINALS_0822.events), oddsEvents: relabelOdds(FINALS_0822.events), fpi: FPI, now: NOW_0822, bankroll: 2500, league: NFL_LEAGUE });
  const card = buildCfbCard(pre, { ...NFL_CARD_OPTS, now: NOW_0822 });
  const entry = lockCfbCard(card, pre, NOW_0822, NFL_LEAGUE);
  const { finals } = finalsFromEspnOf(NFL_LEAGUE, DATE_0822, FINALS_0822.events, NOW_0822 + 12 * 3600_000, 2500);

  it("the pre-kick replay prices all 10 games as upcoming and the card stakes on them", () => {
    expect(pre.games).toHaveLength(10);
    expect(pre.unmatched).toBe(0);
    for (const g of pre.games) expect(g.status).toBe("upcoming");
    expect(card.core.length).toBeGreaterThan(0);
    expect(card.funT).toHaveLength(1);
    expect(entry.sport).toBe("nfl");
  });

  it("finalsFromEspnOf(NFL_LEAGUE) reads all 10 finals with ESPN's own scores (Lions 17–13 Commanders)", () => {
    expect(Object.keys(finals)).toHaveLength(10);
    expect(finals["401873601"]).toEqual({ home: 17, away: 13, final: true, status: "final" });
    expect(finals["401873293"]).toEqual({ home: 24, away: 21, final: true, status: "final" });
    // finalsOf over the same shaped games is the same map (one derivation, two entry points)
    const direct = buildCfbBoard({ date: DATE_0822, espnEvents: FINALS_0822.events, oddsEvents: [], fpi: null, now: NOW_0822, bankroll: 2500, league: NFL_LEAGUE });
    expect(finalsOf(direct.games)).toEqual(finals);
  });

  it("every leg and every ticket grades won / lost / push — nothing pending, nothing void — and the day is done", () => {
    const g = gradeCfbEntry(entry, finals, NOW_0822 + 12 * 3600_000, NFL_LEAGUE);
    expect(g.done).toBe(true);
    const legResults = Object.values(g.legs).map((l) => l.result);
    // legs are keyed by lkey, so a side shared by a core single and the fun parlay is one entry
    const lkeys = new Set([...entry.core, ...entry.funT].flatMap((t) => t.legs.map((l) => l.lkey)));
    expect(legResults.length).toBe(lkeys.size);
    for (const k of lkeys) expect(g.legs[k]).toBeDefined();
    for (const r of legResults) expect(["won", "lost", "push"]).toContain(r);
    for (const t of [...entry.core, ...entry.funT]) {
      const tg = g.tickets[t.id];
      expect(tg).toBeDefined();
      expect(["won", "lost", "push"]).toContain(tg.result);
      expect(t.id.startsWith(`nfl-${DATE_0822}-`)).toBe(true);
      if (tg.result === "lost") expect(tg.payout).toBe(0);
      if (tg.result === "won") expect(tg.payout).toBeGreaterThan(t.stake);
    }
    // the CFB default grades identically here: no window is reached, only scores are read
    expect(gradeCfbEntry(entry, finals, NOW_0822 + 12 * 3600_000)).toEqual(g);
  });

  it("the void window prints from the league's numbers: 48h / 7d on both leagues today", () => {
    // the window is measured from each leg's kickoff; the latest of the ten is 2026-08-23T02:00Z
    const lastKick = Math.max(...pre.games.map((g) => Date.parse(g.start)));
    expect(lastKick).toBe(Date.parse("2026-08-23T02:00:00Z"));
    for (const g of Object.values(entry.games)) expect(Date.parse(g.start)).toBeLessThanOrEqual(lastKick);
    const missing = gradeCfbEntry(entry, {}, lastKick + 49 * 3600_000, NFL_LEAGUE);
    for (const l of Object.values(missing.legs)) expect(l.detail).toBe("no final yet · 48h past kickoff — void");
    expect(missing.done).toBe(true);
    const unreadable: Record<string, { home: number; away: number; final: boolean; status: "final" }> = {};
    for (const id of Object.keys(finals)) unreadable[id] = { home: undefined as unknown as number, away: undefined as unknown as number, final: true, status: "final" };
    const late = gradeCfbEntry(entry, unreadable, lastKick + 8 * 24 * 3600_000, NFL_LEAGUE);
    for (const l of Object.values(late.legs)) expect(l.detail).toBe("score unavailable · 7d past kickoff — void");
    const early = gradeCfbEntry(entry, unreadable, lastKick + 49 * 3600_000, NFL_LEAGUE);
    for (const l of Object.values(early.legs)) expect(l.result).toBe("pending");
    expect(early.done).toBe(false);
    expect(NFL_LEAGUE.ungradableMs).toBe(48 * 3600_000);
    expect(NFL_LEAGUE.voidRecheckMs).toBe(7 * 24 * 3600_000);
  });
});
