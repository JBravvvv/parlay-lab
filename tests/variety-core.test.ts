/**
 * INSTRUCTION 72 (2026-09-17, Josh's word, verbatim): "I like how CFB threw in one massive ticket
 * today for CFB with very limited game chances and hit big. MLB needs to have more variety. Almost
 * every day its just 2 team hits prop parlays. There needs to be more H+R+RBI, ML/RL, straight bets
 * etc. You can also increase daily money to be spent every single day no matter what by
 * builder/ledger for MLB to $350"
 *
 * What this pins: the $350 day from 2026-09-18 (and the $150 before it, by date), the nine-slot
 * market-typed VARIETY_SHAPE, the straight-bet pool composed from board rows, the slot-kind
 * admission rules, the distinct-market preference on the untyped slots, and the whole thing
 * running against the real fixture engine.
 */
import { describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, armedFixtureEngine } from "./helpers/fixture-env";
import { STRAIGHT_MARKETS, buildLockEntry, buildStraightPool } from "@/lib/server/lock-card";
import { PAPER, VARIETY_SINCE, paperDaily } from "@/lib/paper-mode";
import { ALL_SHAPES, CORE_SHAPES, SHAPE_TICKETS, VARIETY_SHAPE, VARIETY_TOTAL, legMarket, shapeById, shapeTotal, slotKindAdmits, slotName } from "@/lib/core-shapes";
import { CORE_RULES } from "@/lib/paper-mode";
import fs from "node:fs";

type Leg = { label: string; prop: string; lkey?: string | null };
type Tix = { id: string; stake: number; type?: string | null; shapeSlot?: number; forced?: boolean; paperPolicy?: string; legs: Leg[] };

describe("INSTRUCTION 72 — the $350 MLB day, by date", () => {
  it("paperDaily: $150 through 2026-09-17, $350 from 2026-09-18; PAPER carries both numbers", () => {
    expect(VARIETY_SINCE).toBe("2026-09-18");
    expect(PAPER.daily).toBe(350);
    expect(PAPER.dailyBefore).toBe(150);
    expect(paperDaily("2026-09-17")).toBe(150);
    expect(paperDaily("2026-09-13")).toBe(150);
    expect(paperDaily("2026-09-18")).toBe(350);
    expect(paperDaily("2026-10-01")).toBe(350);
    expect(paperDaily(null), "no date reads as the historic number, never the bigger one").toBe(150);
  });
  it("every daily consumer is date-aware: lock-card, refill, the generate route; the banner prints both numbers", () => {
    const lock = fs.readFileSync("src/lib/server/lock-card.ts", "utf8");
    expect(lock).toMatch(/const dayCeiling = paperDaily\(date\);/);
    expect(lock).toMatch(/paperCfg: \{ daily: dayCeiling,/);
    expect(lock).not.toMatch(/const dayCeiling = PAPER\.daily/);
    const refill = fs.readFileSync("src/lib/server/refill.ts", "utf8");
    expect(refill).toMatch(/paperDaily\(a\.date/);
    expect(refill).not.toMatch(/PAPER\.daily/);
    const gen = fs.readFileSync("app/api/generate/route.ts", "utf8");
    expect((gen.match(/effectiveBlockBudget\(\{ daily: paperDaily\(date\),/g) ?? []).length).toBe(2);
    expect(gen).not.toMatch(/effectiveBlockBudget\(\{ daily: PAPER\.daily/);
    const banner = fs.readFileSync("src/components/ui/PaperBanner.tsx", "utf8");
    expect(banner).toMatch(/PAPER\.dailyBefore/);
    expect(banner).toMatch(/PAPER\.dailySince/);
  });
});

describe("INSTRUCTION 72 — VARIETY_SHAPE: nine market-typed slots summing to $350", () => {
  it("is on the menu as V, sums to VARIETY_TOTAL, the six historic shapes still sum to $150", () => {
    expect(VARIETY_TOTAL).toBe(350);
    expect(shapeById("V")).toBe(VARIETY_SHAPE);
    expect(shapeTotal(VARIETY_SHAPE)).toBe(350);
    expect(VARIETY_SHAPE.slots.reduce((a, s) => a + s.stake, 0)).toBe(350);
    for (const sh of CORE_SHAPES) expect(shapeTotal(sh)).toBe(150);
    expect(shapeTotal(shapeById("P")!)).toBe(150);
    expect(ALL_SHAPES.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E", "F", "P", "V"]);
    expect(SHAPE_TICKETS).toEqual({ min: 3, max: 9 });
  });
  it("the slots, in fill order: H+R+RBI 2-leg, ML/RL 2-leg, two $50 2-leg, two straights, 3-leg, 4-5 leg, 5-6 leg", () => {
    expect(VARIETY_SHAPE.slots.map(slotName)).toEqual([
      "$40 H+R+RBI 2-leg slot",
      "$40 ML/RL 2-leg slot",
      "$50 2-leg slot",
      "$50 2-leg slot",
      "$40 straight slot",
      "$40 straight slot",
      "$40 3-leg slot",
      "$30 4-5 leg slot",
      "$20 5-6 leg slot",
    ]);
    expect(VARIETY_SHAPE.slots[0].kind).toBe("hrr");
    expect(VARIETY_SHAPE.slots[1].kind).toBe("team");
    expect(VARIETY_SHAPE.slots.slice(2).every((s) => s.kind === undefined)).toBe(true);
    /* the typed slots come first so an untyped slot cannot consume the day's only ML/RL ticket */
    expect(VARIETY_SHAPE.slots.findIndex((s) => s.kind === "team")).toBeLessThan(VARIETY_SHAPE.slots.findIndex((s) => !s.kind));
  });
  it("legMarket + slotKindAdmits: hrr needs one H+R+RBI leg; team needs every leg ML or RL; untyped admits anything", () => {
    expect(legMarket({ lkey: "ml_home" })).toBe("ml");
    expect(legMarket({ lkey: "rl_away" })).toBe("rl");
    expect(legMarket({ lkey: "johnrave|batter_hits_runs_rbis|0.5" })).toBe("batter_hits_runs_rbis");
    expect(legMarket({ lkey: null })).toBe("");
    const hrr = { lkey: "a|batter_hits_runs_rbis|1.5" };
    const hit = { lkey: "b|batter_hits|0.5" };
    const ml = { lkey: "ml_away" };
    const rl = { lkey: "rl_home" };
    expect(slotKindAdmits("hrr", [hrr, hit])).toBe(true);
    expect(slotKindAdmits("hrr", [hit, hit])).toBe(false);
    expect(slotKindAdmits("team", [ml, rl])).toBe(true);
    expect(slotKindAdmits("team", [ml, hit])).toBe(false);
    expect(slotKindAdmits("team", [])).toBe(false);
    expect(slotKindAdmits(undefined, [hit, hit])).toBe(true);
  });
});

describe("INSTRUCTION 72 — straight bets composed from the board's own rows", () => {
  const row = (o: Record<string, unknown>) => ({ prob: 60, cz: -150, czOdds: "-150", bs: -140, bsOdds: "-140", bsBook: "FD", implied: 58, lkey: "x|batter_hits|0.5", gkey: "a@b", label: "X (AAA)", sub: "Hits O 0.5", game: "A @ B · 7:05 PM", lu: "confirmed", ...o });
  it("one 1-leg ticket per priced pregame row across the seven straight markets; HR is not a market; live / unpriced / suspended rows are skipped", () => {
    expect(Object.keys(STRAIGHT_MARKETS)).toEqual(["ml", "rl", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"]);
    const data = {
      categories: {
        batter_hits: [row({}), row({ live: true, label: "L" }), row({ cz: null, label: "NoCz" }), row({ bs: null, label: "NoBs" }), row({ prob: null, label: "NoProb" }), row({ susp: true, label: "S" })],
        ml: [row({ label: "Houston Astros", sub: "ML vs Kansas City Royals", lkey: "ml_home", gkey: "kc@hou", prob: 56, cz: -156, czOdds: "-156", bs: -146, bsOdds: "-146", implied: 57.9 })],
        batter_home_runs: [row({ label: "HR guy", lkey: "h|batter_home_runs|0.5" })],
      },
    };
    const pool = buildStraightPool(data);
    expect(pool.map((w) => [w.pl.name, w.pl.type, w.src])).toEqual([
      ["ML single", "ml", "s"],
      ["Hits single", "batter_hits", "s"],
    ]);
    const ml = pool[0].pl as Record<string, unknown> & { legs: Record<string, unknown>[] };
    expect(ml.legs).toHaveLength(1);
    expect(ml.legs[0]).toMatchObject({ label: "Houston Astros", prop: "ML vs Kansas City Royals", lkey: "ml_home", gkey: "kc@hou", cz: -156, bs: -146, prob: 56, imp: 57.9, live: false, game: "A @ B" });
    expect(ml.czDec).toBe(1.64);
    expect(ml.bsDec).toBe(1.68);
    expect(ml.prob).toBe(56);
    expect(ml.czEv).toBe(-8.1); // 0.56 × 1.641 − 1, the board's own number for that row
    expect(ml.straight).toBe(true);
    expect(ml.tier).toBe("SAFER");
  });
});

/* a mock engine in the lock-card.test.ts style: the allocator takes the FIRST pool item it is
   handed, sized to the amount, so what lands in a slot is exactly what the slot's filter let through */
describe("INSTRUCTION 72 — slot kinds and the distinct-market preference on a mock pool", () => {
  const leg = (label: string, market: string, prop = "O 0.5") => ({ label, prop, lkey: /^(ml|rl)$/.test(market) ? `${market}_home` : `${label}|${market}|0.5`, cz: -110, gkey: `g-${label[0]}` });
  const tk = (name: string, type: string, legs: ReturnType<typeof leg>[], dec = 2.2, extra: Record<string, unknown> = {}) => ({
    pl: { name, type, prob: 45, probRaw: 50, czEv: 3, czEvRaw: 4, czDec: dec, bsDec: dec, legs, ...extra },
    src: "p",
    idx: 0,
  });
  const POOL = [
    tk("HitsA", "batter_hits", [leg("A1", "batter_hits"), leg("A2", "batter_hits")]),
    tk("HrrOver", "batter_hits_runs_rbis", [leg("B1", "batter_hits_runs_rbis", "H+R+RBI O 1.5"), leg("B2", "batter_hits")]),
    tk("Teams", "rl", [leg("Team1", "rl", "RL -1.5"), leg("Team2", "ml", "ML")]),
    tk("HitsB", "batter_hits", [leg("C1", "batter_hits"), leg("C2", "batter_hits")]),
    tk("HitsSingle", "batter_hits", [leg("D1", "batter_hits")]),
    tk("MlSingle", "ml", [leg("E1", "ml", "ML")]),
    tk("TbSingle", "batter_total_bases", [leg("F1", "batter_total_bases")]),
    tk("Three", "MIX", [leg("G1", "batter_hits"), leg("G2", "batter_total_bases"), leg("G3", "pitcher_strikeouts")], 4.0),
  ];
  type W = { pl: { name: string } };
  const mockEng = (pool = POOL) => ({
    get<T>(k: string): T {
      if (k === "SH_CFG") return { selMode: "dk_fd", perParlayCap: 0.25 } as T;
      if (k === "SH") return { bankroll: 10000 } as T;
      if (k === "shCardPool") return ((_b: unknown) => pool) as T;
      if (k === "shTicketId") return ((x: { name?: string }) => `id-${x.name ?? "fun"}`) as T;
      if (k === "shAllocate") {
        return ((p: W[], amount: number) => {
          const c = p[0];
          if (!c || amount <= 0) return { picks: [], sum: 0, blocked: [] };
          return { picks: [{ id: `id-${c.pl.name}`, stake: amount, w: { pl: c.pl } }], sum: amount, blocked: [], unallocated: 0 };
        }) as T;
      }
      return null as T;
    },
  });
  const DATA = { gameInfo: { "g-A": { pk: 1, start: "2026-09-18T23:05:00Z" } }, categories: {} } as never;
  const lock = (date: string, extra: Record<string, unknown> = {}) =>
    buildLockEntry({ eng: mockEng() as never, data: DATA, date, now: Date.parse(`${date}T20:00:00Z`), trigger: "test", ...extra } as never);

  it("2026-09-18: shape V, $350 day; the H+R+RBI-over ticket seats ONLY in the H+R+RBI slot; the ML/RL ticket takes the team slot; the second straight prefers an unseated market", () => {
    const e = lock("2026-09-18");
    expect(e.daily).toBe(350);
    expect((e as { coreShape?: { id: string; pick: string } }).coreShape).toMatchObject({ id: "V", pick: "variety" });
    expect((e as { paperPolicy?: string }).paperPolicy).toBe("variety-action-v1");
    expect((e as { paperCfg?: { daily: number } }).paperCfg?.daily).toBe(350);
    const core = e.core as unknown as Tix[];
    const bySlot = Object.fromEntries(core.map((t) => [t.shapeSlot, t.id]));
    expect(bySlot).toEqual({
      0: "id-HrrOver", // the H+R+RBI slot — the only place an H+R+RBI OVER may sit (rule 5 holds elsewhere)
      1: "id-Teams", // the ML/RL slot
      2: "id-HitsA", // untyped $50: hits, a fresh type
      3: "id-HitsB", // untyped $50 #2: hits again — the only 2-leg left; the preference falls back rather than leave money on the table
      4: "id-MlSingle", // straight #1: hits and rl are seated, ml is fresh → ML single before the hits single
      5: "id-TbSingle", // straight #2: TB is still fresh
      6: "id-Three", // the 3-leg slot
    });
    expect(core.every((t) => t.paperPolicy === "variety-action-v1" && t.forced === true)).toBe(true);
    expect(core.map((t) => t.stake)).toEqual([40, 40, 50, 50, 40, 40, 40]);
    expect(e.allocSum).toBe(300);
    const unfilled = (e as { slotsUnfilled?: { slot: number; name: string }[] }).slotsUnfilled ?? [];
    expect(unfilled.map((u) => u.slot)).toEqual([7, 8]);
    expect(String(e.note)).toMatch(/Variety day \(INSTRUCTION 72\): \$350 across market-typed slots/);
    expect((e as { blockedReasons?: Record<string, number> }).blockedReasons?.hrr_over_suspended).toBe(0);
  });
  it("2026-09-17 (the day before): still the $150 paper-action shape P, and the H+R+RBI over is dropped by rule 5 as before", () => {
    const e = lock("2026-09-17");
    expect(e.daily).toBe(150);
    expect((e as { coreShape?: { id: string } }).coreShape?.id).toBe("P");
    expect((e as { paperPolicy?: string }).paperPolicy).toBe("probability-action-v1");
    expect((e as { blockedReasons?: Record<string, number> }).blockedReasons?.hrr_over_suspended).toBe(1);
    expect((e.core as unknown as Tix[]).some((t) => t.id === "id-HrrOver")).toBe(false);
    expect(CORE_RULES.noHrrOver).toBe(true);
  });
  it("a locked variety day keeps its tickets and shape on a re-fire (append-only), and never passes $350", () => {
    const e1 = lock("2026-09-18");
    const e2 = lock("2026-09-18", { carry: e1, dailyOverride: 50 });
    expect((e2.core as unknown as Tix[]).map((t) => t.id)).toEqual((e1.core as unknown as Tix[]).map((t) => t.id));
    expect(e2.allocSum).toBe(e1.allocSum);
    expect(Number(e2.allocSum)).toBeLessThanOrEqual(350);
    expect((e2 as { coreShape?: { id: string } }).coreShape?.id).toBe("V");
  });
});

describe("INSTRUCTION 72 — the variety day against the real fixture engine", () => {
  it("2026-09-18 on the fixture slate: shape V, ≤ $350, every seated ticket obeys its slot's leg range, price ceiling and market kind; straights are in the pool", async () => {
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const data = eng.analyze(await eng.collectSlate()) as unknown as Record<string, unknown>;
    const straights = buildStraightPool(data);
    expect(straights.length, "the fixture board prices rows in more than one straight market").toBeGreaterThan(10);
    expect(new Set(straights.map((w) => w.pl.type)).size).toBeGreaterThan(1);
    const entry = buildLockEntry({ eng: eng as never, data, date: "2026-09-18", now: Date.parse("2026-07-10T03:30:00Z"), trigger: "test" });
    expect(entry.daily).toBe(350);
    expect((entry as { coreShape?: { id: string } }).coreShape?.id).toBe("V");
    expect(Number(entry.allocSum)).toBeLessThanOrEqual(350);
    const core = entry.core as unknown as Tix[];
    expect(core.length).toBeGreaterThanOrEqual(3);
    const seen = new Set<string>();
    for (const t of core) {
      const slot = VARIETY_SHAPE.slots[t.shapeSlot!];
      expect(slot, `ticket ${t.id} carries no slot`).toBeTruthy();
      expect(t.stake).toBeLessThanOrEqual(slot.stake);
      expect(t.legs.length).toBeGreaterThanOrEqual(slot.legs.min);
      expect(t.legs.length).toBeLessThanOrEqual(slot.legs.max);
      expect(slotKindAdmits(slot.kind, t.legs), `${t.id} in ${slotName(slot)} breaks the slot's market kind`).toBe(true);
      for (const l of t.legs) {
        const k = `${l.label}|${l.prop}`;
        expect(seen.has(k), `leg ${k} rides two tickets`).toBe(false);
        seen.add(k);
      }
    }
    /* the variety Josh asked for, on the record: more than one market type across the card */
    expect(new Set(core.map((t) => String(t.type))).size).toBeGreaterThanOrEqual(3);
    /* a straight bet seated when one existed for the slot */
    const singles = core.filter((t) => t.legs.length === 1);
    expect(singles.length).toBeGreaterThanOrEqual(1);
    /* re-fire keeps everything (append-only) */
    const again = buildLockEntry({ eng: eng as never, data, date: "2026-09-18", now: Date.parse("2026-07-10T03:30:00Z"), trigger: "test", carry: entry, dailyOverride: 0 });
    expect(again.core).toEqual(entry.core);
    /* the previous day is untouched by the change */
    const before = buildLockEntry({ eng: eng as never, data, date: "2026-09-17", now: Date.parse("2026-07-10T03:30:00Z"), trigger: "test" });
    expect(before.daily).toBe(150);
    expect((before as { coreShape?: { id: string } }).coreShape?.id).toBe("P");
  }, 300000);
});
