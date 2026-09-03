/**
 * THE H+R+RBI LADDER (INSTRUCTION 18, 2026-09-03, operator Josh, verbatim: "Could maybe
 * look into taking like. 8-15 leg H+R+RBI etc as one or more of the fun tickets daily as
 * well. Could be other props or longshots as well." and "I dont want to change that $25
 * fun money hypothetical per day").
 *
 * One 8–12 leg (target 10) ladder of the likeliest H+R+RBI O 0.5 / Hits O 0.5 rows with a
 * Caesars price, ≤2 legs per team, one leg per player, leg-disjoint from everything
 * staked; $10 of the $25, the HR composer takes the other $15 with one fewer seat; a thin
 * pool falls back to the full $25 of HR tickets. Fun total == PAPER.fun, every day.
 * OBSERVED RED 2026-09-03 before buildFunLadderTicket / FUN_LADDER existed.
 */
import { describe, expect, it } from "vitest";
import { FUN_LADDER, FUN_SHAPE, buildFunHrTickets, buildFunLadderTicket, type FunLegSrc } from "@/lib/fun-hr";
import { PAPER } from "@/lib/paper-mode";
import { buildLockEntry } from "@/lib/server/lock-card";

const L = (player: string, team: string, prob: number, cz: number, prop = "H+R+RBI O 0.5", extra: Partial<FunLegSrc> = {}): FunLegSrc => ({
  player,
  team,
  label: `${player} (${team})`,
  prop,
  prob,
  dec: cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz),
  cz,
  lkey: `${player}|${prop.startsWith("Hits") ? "batter_hits" : "batter_hits_runs_rbis"}|0.5`,
  gkey: `g_${team}`,
  ...extra,
});

/** 30 hitters over 10 teams, 3 per team, probs descending — a healthy board */
const WIDE = Array.from({ length: 30 }, (_, i) => L(`h${String(i).padStart(2, "0")}`, `T${i % 10}`, 80 - i, -300 + i * 5));

describe("buildFunLadderTicket — the shape", () => {
  it("FUN_LADDER is the dated rule: $10, 8..12 legs targeting 10, team cap 2", () => {
    expect(FUN_LADDER).toEqual({ since: "2026-09-03", amount: 10, legs: { min: 8, target: 10, max: 12 }, teamCap: 2 });
  });

  it("seats 10 legs most-likely-first, at most 2 per team, one per player, with product dec/prob", () => {
    const t = buildFunLadderTicket(WIDE, FUN_LADDER.amount, new Set());
    expect(t, "a healthy board must seat the ladder").not.toBeNull();
    expect(t!.type).toBe("fun_ladder");
    expect(t!.stake).toBe(10);
    expect(t!.legs.length).toBeGreaterThanOrEqual(FUN_LADDER.legs.min);
    expect(t!.legs.length).toBeLessThanOrEqual(FUN_LADDER.legs.max);
    expect(t!.legs.length).toBe(FUN_LADDER.legs.target);
    const perTeam = new Map<string, number>();
    for (const l of t!.legs) perTeam.set(l.team!, (perTeam.get(l.team!) ?? 0) + 1);
    for (const n of perTeam.values()) expect(n).toBeLessThanOrEqual(FUN_LADDER.teamCap);
    expect(new Set(t!.legs.map((l) => l.player)).size).toBe(t!.legs.length);
    /* most-likely-first: the 10 seated are the 10 highest probs (teams 0..9 each once) */
    expect(t!.legs.map((l) => l.player)).toEqual(WIDE.slice(0, 10).map((l) => l.player));
    const dec = t!.legs.reduce((a, l) => a * Number(l.dec), 1);
    const p = t!.legs.reduce((a, l) => a * (Number(l.prob) / 100), 1);
    expect(t!.czDec).toBeCloseTo(dec, 9);
    expect(t!.prob).toBeCloseTo(p * 100, 9);
    expect(t!.czEv).toBeCloseTo((p * dec - 1) * 100, 9);
    expect(t!.czOdds).toBe(`+${Math.round((dec - 1) * 100)}`);
    expect(t!.name).toBe("H+R+RBI Ladder · 10 hitters");
  });

  it("the team cap actually bites: a 2-team board cannot seat 8", () => {
    const two = Array.from({ length: 20 }, (_, i) => L(`p${i}`, i % 2 ? "A" : "B", 70 - i, -200));
    expect(buildFunLadderTicket(two, 10, new Set())).toBeNull();
    const five = Array.from({ length: 20 }, (_, i) => L(`p${i}`, `T${i % 5}`, 70 - i, -200));
    const t = buildFunLadderTicket(five, 10, new Set());
    expect(t).not.toBeNull();
    expect(t!.legs.length).toBe(10); // 5 teams × cap 2
  });

  it("is leg-disjoint from everything staked, and a used-out pool returns null (never a fabricated seat)", () => {
    const used = new Set(WIDE.slice(0, 25).map((l) => `${l.label}|${l.prop}`));
    const t = buildFunLadderTicket(WIDE, 10, used);
    expect(t).toBeNull(); // 5 left < 8
    const used2 = new Set(WIDE.slice(0, 5).map((l) => `${l.label}|${l.prop}`));
    const t2 = buildFunLadderTicket(WIDE, 10, used2);
    expect(t2).not.toBeNull();
    for (const l of t2!.legs) expect(used2.has(`${l.label}|${l.prop}`)).toBe(false);
  });

  it("skips rows without a Caesars price, with prob ≤ 0, or with no team; seats 8 when only 8 qualify", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => L(`ok${i}`, `T${i}`, 60, -150)),
      L("noprice", "Z1", 90, 0, "H+R+RBI O 0.5", { dec: null, cz: null }),
      L("noprob", "Z2", 0, -150),
      L("noteam", "Z3", 70, -150, "H+R+RBI O 0.5", { team: null }),
    ];
    const t = buildFunLadderTicket(pool, 10, new Set());
    expect(t).not.toBeNull();
    expect(t!.legs.length).toBe(8);
    expect(t!.legs.map((l) => l.player).every((p) => p.startsWith("ok"))).toBe(true);
    expect(buildFunLadderTicket(pool.slice(0, 7), 10, new Set())).toBeNull();
  });

  it("the HR composer honors a reduced ticket ceiling so ladder + HR stay within FUN_SHAPE.tickets.max", () => {
    const hr = Array.from({ length: 20 }, (_, i) => ({ ...L(`hr${i}`, `H${i}`, 30 - i, 300 + i * 10, "HR O 0.5"), lkey: `hr${i}|batter_home_runs|0.5` }));
    const r = buildFunHrTickets(hr, PAPER.fun - FUN_LADDER.amount, new Set(), FUN_SHAPE.tickets.max - 1);
    expect(r.tickets.length).toBe(FUN_SHAPE.tickets.max - 1);
    expect(r.sum).toBe(15);
  });
});

describe("lock-card — the $25 fun day with the ladder seated (mock engine, synthetic rows)", () => {
  /* a mock engine whose board carries a CZ-priced HRR/Hits board wide enough to seat the
     ladder and an HR board for the composer; the core pool is empty so nothing else stakes */
  const row = (label: string, sub: string, prob: number, cz: number, market: string, extra: Record<string, unknown> = {}) => ({
    label, sub, prob, cz, noParlay: false, susp: false, lkey: `${label.split(" ")[0].toLowerCase()}|${market}|0.5`, gkey: "g1", ...extra,
  });
  /* team codes are 2-3 capitals, as the board labels them ("Name (TEAM)") */
  const code = (i: number) => "TEAM".charAt(0) + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26));
  const categories = {
    batter_hits_runs_rbis: Array.from({ length: 12 }, (_, i) => row(`Hrr${i} (${code(i % 6)})`, "H+R+RBI O 0.5", 75 - i, -250 + i * 5, "batter_hits_runs_rbis")),
    batter_hits: Array.from({ length: 12 }, (_, i) => row(`Hit${i} (${code(6 + (i % 6))})`, "Hits O 0.5", 70 - i, -220 + i * 5, "batter_hits")),
    batter_home_runs: Array.from({ length: 20 }, (_, i) => row(`Hr${i} (${code(30 + i)})`, "HR O 0.5", 25 - i * 0.5, 350 + i * 10, "batter_home_runs")),
  };
  function mockEng() {
    return {
      get<T>(k: string): T {
        if (k === "SH_CFG") return { maxCoreTickets: 6, minCoreTickets: 4, selMode: "dk_fd", perParlayCap: 0.25 } as T;
        if (k === "SH") return { bankroll: 750 } as T;
        if (k === "shCardPool") return ((_b: unknown) => []) as T;
        if (k === "shTicketId") return ((x: { type?: string; legs: { label: string }[] }) => `${x.type}-${x.legs.map((l) => l.label).join("+")}`) as T;
        if (k === "shAllocate") return ((_p: unknown, _a: number) => ({ picks: [], sum: 0, blocked: [] })) as T;
        return null as T;
      },
    };
  }
  it("funT sums to PAPER.fun, carries exactly one fun_ladder at $10, ≤5 fun tickets, HR tickets share the $15, all legs disjoint", () => {
    const entry = buildLockEntry({
      eng: mockEng() as never,
      data: { gameInfo: { g1: { pk: 1, start: "2026-09-04T00:05:00Z" } }, categories } as never,
      date: "2026-09-03", now: Date.parse("2026-09-03T20:00:00Z"), trigger: "test",
    });
    const fun = entry.funT as { type: string; stake: number; legs: { label: string; prop: string }[]; czDec: number; prob: number }[];
    expect(fun.length).toBeGreaterThan(1);
    expect(fun.length).toBeLessThanOrEqual(FUN_SHAPE.tickets.max);
    expect(fun.reduce((a, t) => a + t.stake, 0)).toBe(PAPER.fun);
    const ladders = fun.filter((t) => t.type === "fun_ladder");
    expect(ladders.length).toBe(1);
    expect(ladders[0].stake).toBe(FUN_LADDER.amount);
    expect(ladders[0].legs.length).toBeGreaterThanOrEqual(8);
    expect(ladders[0].legs.length).toBeLessThanOrEqual(12);
    expect(fun.filter((t) => t.type === "fun_hr").reduce((a, t) => a + t.stake, 0)).toBe(PAPER.fun - FUN_LADDER.amount);
    /* the ladder is leg-disjoint from every other fun ticket (HR tickets keep their own
       repeatCap-2 player rule among themselves — that is the 2026-08-15 shape, untouched) */
    const ladderLegs = new Set(ladders[0].legs.map((l) => `${l.label}|${l.prop}`));
    for (const t of fun) if (t.type !== "fun_ladder") for (const l of t.legs) expect(ladderLegs.has(`${l.label}|${l.prop}`), `ladder leg ${l.label} also rides an HR ticket`).toBe(false);
    expect(new Set(ladders[0].legs.map((l) => l.label)).size).toBe(ladders[0].legs.length);
    /* the ladder never mixes into core money */
    expect((entry as { allocSum?: number }).allocSum).toBe(0);
  });
  it("a board that cannot seat the ladder sends the whole $25 to the HR tickets exactly as before", () => {
    const thin = { ...categories, batter_hits_runs_rbis: [], batter_hits: categories.batter_hits.slice(0, 4) };
    const entry = buildLockEntry({
      eng: mockEng() as never,
      data: { gameInfo: { g1: { pk: 1, start: "2026-09-04T00:05:00Z" } }, categories: thin } as never,
      date: "2026-09-03", now: Date.parse("2026-09-03T20:00:00Z"), trigger: "test",
    });
    const fun = entry.funT as { type: string; stake: number }[];
    expect(fun.some((t) => t.type === "fun_ladder")).toBe(false);
    expect(fun.every((t) => t.type === "fun_hr")).toBe(true);
    expect(fun.reduce((a, t) => a + t.stake, 0)).toBe(PAPER.fun);
  });
});
