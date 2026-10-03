/**
 * FOUND MODE — TODAY'S WINNINGS AND THE ALL-DAY CADENCE (2026-10-03, Josh: "Lock the $350 today as well
 * as any other locked parlays then increase the max for all sports to $2500 so more bets can be added
 * throughout the day … If a bet wins (Ie: $250 straight bet wins $200) then that is added on top of what
 * can be bet on the day … Only way to get more money for that day is to hit a bet THAT DAY.").
 *
 * The room of a found day is $2,500 + the profit of that day's tickets graded WON − every core stake on
 * the card. Losses, pushes and voids add nothing; the next day starts at $2,500 again. Every number
 * below is synthetic and pinned to that rule — no price is read from or written to any feed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stripComments } from "./helpers/source";
import { FOUND, dayWonProfit, foundCeiling, foundWonByOf, foundWonOf, mergeWonBy, wonProfitOf } from "@/lib/found-mode";
import {
  FOUND_FOOTBALL_SLOTS_PT,
  FOUND_MLB_SLOTS_PT,
  GRADE_SLOT_WINDOW_MIN,
  decideFoundTick,
  isFoundSlot,
} from "@/lib/server/grading-progress";
import { boxPksNeeded, mlbDayWon, mlbDayWonBy, mlbWonFrom } from "@/lib/server/mlb-day-won";
import { decideMlbRefill } from "@/lib/server/refill";
import { foundWonByFromFinals, foundWonFromFinals } from "@/lib/cfb/found";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import { mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import type { Boxscore, GameStatus } from "@/engine2/grade";
import type { CfbFinals, CfbLedgerEntry } from "@/lib/cfb/types";

const read = (p: string) => readFileSync(p, "utf8");

describe("the day's winnings — the shared helpers", () => {
  it("wonProfitOf counts only a WON grade's profit (payout is the total return)", () => {
    expect(wonProfitOf(250, { result: "won", payout: 450 })).toBe(200); // Josh's own example
    expect(wonProfitOf("100", { result: "won", payout: 190.91 })).toBe(90.91);
    expect(wonProfitOf(250, { result: "lost", payout: 0 })).toBe(0);
    expect(wonProfitOf(250, { result: "push", payout: 250 })).toBe(0);
    expect(wonProfitOf(250, { result: "pending", payout: 900 })).toBe(0);
    expect(wonProfitOf(250, null)).toBe(0);
    expect(wonProfitOf(250, { result: "won", payout: "x" })).toBe(0);
  });

  it("dayWonProfit sums core AND fun; foundWonOf counts each ticket on the card once — a settled grade decides it", () => {
    const e = {
      core: [
        { id: "a", stake: 250 },
        { id: "b", stake: 400 },
        { id: "c", stake: 100 },
      ],
      funT: [{ id: "f", stake: 25 }],
      grading: { tickets: { a: { result: "won", payout: 450 }, b: { result: "lost", payout: 0 }, f: { result: "won", payout: 425 } } },
    };
    expect(dayWonProfit(e)).toBe(600);
    expect(foundWonOf(e)).toBe(600);
    // a server read of an ungraded ticket counts until a grade settles it
    expect(foundWonOf({ ...e, foundWonBy: { c: 90 } })).toBe(690);
    expect(foundWonByOf({ ...e, foundWonBy: { c: 90 } })).toEqual({ a: 200, f: 400, c: 90 });
    // a settled grade outranks the read: b graded LOST counts nothing whatever was recorded
    expect(foundWonOf({ ...e, foundWonBy: { b: 500 } })).toBe(600);
    // a read for a ticket that is not on the card counts nothing; junk counts nothing
    expect(foundWonOf({ ...e, foundWonBy: { zzz: 900, c: -5 } })).toBe(600);
    expect(foundWonOf({ ...e, foundWonBy: 900 })).toBe(600);
    expect(foundWonOf(null)).toBe(0);
  });

  it("mergeWonBy keeps each ticket's larger read — two copies never add together", () => {
    expect(mergeWonBy({ a: 100, b: 50 }, { a: 80, c: 20 }, null, { d: -1, e: "x" })).toEqual({ a: 100, b: 50, c: 20 });
  });

  it("foundCeiling = $2,500 + that day's winnings (never less than $2,500)", () => {
    expect(foundCeiling(0)).toBe(FOUND.daily);
    expect(foundCeiling(600)).toBe(3100);
    expect(foundCeiling(-200)).toBe(FOUND.daily);
    expect(foundCeiling(Number.NaN)).toBe(FOUND.daily);
  });
});

describe("the MLB server read of the day's winnings (free statsapi box scores)", () => {
  const DATE = "2026-10-03";
  const final = (home: number, away: number): GameStatus => ({ state: "Final", home, away });
  const box = (name: string, strikeOuts: number): Boxscore => ({
    teams: { home: { players: { ID1: { person: { fullName: name }, stats: { pitching: { gamesStarted: 1, strikeOuts } } } } }, away: { players: {} } },
  });
  const entry = () => ({
    date: DATE,
    games: { g1: { pk: 101 }, g2: { pk: 102 }, g3: { pk: 103 } },
    core: [
      // a straight ML winner at +100 → $250 profit
      { id: "ml", stake: 250, czDec: 2, legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }] },
      // a K over that cleared: 7 > 5.5 at -125 → stake × 1.8 − stake
      { id: "k", stake: 100, czDec: 1.8, legs: [{ lkey: "garrettcrochet|pitcher_strikeouts|5.5", prop: "Garrett Crochet O 5.5 K", gkey: "g2" }] },
      // a two-leg parlay with one leg still in play → nothing yet
      { id: "par", stake: 50, czDec: 3.6, legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }, { lkey: "ml_away", prop: "ML", gkey: "g3" }] },
    ],
    funT: [],
    grading: null,
  });
  const statuses = new Map<number, GameStatus>([
    [101, final(5, 2)],
    [102, final(1, 3)],
    [103, { state: "In Progress", home: 1, away: 0 }],
  ]);

  it("boxPksNeeded asks only for final games behind a prop leg on an ungraded ticket", () => {
    expect(boxPksNeeded(entry(), statuses)).toEqual([102]);
    const graded = { ...entry(), grading: { tickets: { k: { result: "won", payout: 180 } } } };
    expect(boxPksNeeded(graded, statuses)).toEqual([]);
  });

  it("counts a ticket only when EVERY leg graded won, at its own locked price", () => {
    const boxes = new Map<number, Boxscore>([[102, box("Garrett Crochet", 7)]]);
    expect(mlbWonFrom(entry(), statuses, boxes)).toBe(250 + 80);
    // the K line missed → only the ML counts
    expect(mlbWonFrom(entry(), statuses, new Map([[102, box("Garrett Crochet", 5)]]))).toBe(250);
    // no box score → the prop leg is pending, never guessed
    expect(mlbWonFrom(entry(), statuses, new Map())).toBe(250);
    // a pitcher who never appeared voids the leg → counts nothing (the device's grade divides it out later)
    expect(mlbWonFrom(entry(), statuses, new Map([[102, box("Someone Else", 9)]]))).toBe(250);
    // only the locked price counts: a ticket with nothing but a czOdds string is not priced by the device grader
    const oddsOnly = { ...entry(), core: [{ id: "o", stake: 100, czOdds: "+150", legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }] }] };
    expect(mlbWonFrom(oddsOnly, statuses, new Map())).toBe(0);
  });

  it("a later read that sees a LOST leg cancels an earlier recorded win; an undecided ticket keeps its record", () => {
    const boxes = new Map<number, Boxscore>([[102, box("Garrett Crochet", 3)]]);
    const e = { ...entry(), foundWonBy: { k: 80, par: 130 } };
    expect(mlbWonFrom(e, statuses, boxes)).toBe(250 + 130);
  });

  it("a device grade outranks the server read in both directions", () => {
    const boxes = new Map<number, Boxscore>([[102, box("Garrett Crochet", 7)]]);
    const devLost = { ...entry(), grading: { tickets: { ml: { result: "lost", payout: 0 } } } };
    expect(mlbWonFrom(devLost, statuses, boxes)).toBe(80);
    const devWon = { ...entry(), grading: { tickets: { par: { result: "won", payout: 180 } } } };
    expect(mlbWonFrom(devWon, statuses, boxes)).toBe(250 + 80 + 130);
  });

  it("mlbDayWon reads the schedule and the box scores it needs, and never throws", async () => {
    const urls: string[] = [];
    const fake = async <T,>(url: string): Promise<T | null> => {
      urls.push(url);
      if (url.includes("/schedule")) {
        return {
          dates: [
            {
              games: [
                { gamePk: 101, status: { detailedState: "Final" }, teams: { home: { score: 5 }, away: { score: 2 } } },
                { gamePk: 102, status: { detailedState: "Final" }, teams: { home: { score: 1 }, away: { score: 3 } } },
                { gamePk: 103, status: { detailedState: "In Progress" }, teams: { home: { score: 1 }, away: { score: 0 } } },
              ],
            },
          ],
        } as T;
      }
      if (url.endsWith("/game/102/boxscore")) return box("Garrett Crochet", 7) as T;
      return null;
    };
    expect(await mlbDayWon(entry(), fake)).toBe(330);
    expect(urls).toEqual([`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`, "https://statsapi.mlb.com/api/v1/game/102/boxscore"]);
    const boom = async () => {
      throw new Error("statsapi down");
    };
    expect(await mlbDayWonBy(entry(), fake)).toEqual({ ml: 250, k: 80 });
    expect(await mlbDayWon({ ...entry(), foundWonBy: { par: 40 } }, boom)).toBe(40);
    expect(await mlbDayWon({ ...entry(), foundWonBy: { par: 130 } }, fake)).toBe(460);
    expect(await mlbDayWon(null, fake)).toBe(0);
  });

  it("decideMlbRefill: a full $2,500 day opens again by exactly what it won", () => {
    const now = Date.parse(`${DATE}T19:00:00Z`);
    // the carried morning card's allocation ($350 shape, $180 of it unseated) is not money on the card
    const lockEntry = { date: DATE, paper: true, allocSum: 2670, slotUnderSum: 180, core: [{ id: "x", stake: 2500 }], funT: [] } as Record<string, unknown>;
    const base = { date: DATE, lockEntry, blocksArr: [], reg: {}, starts: [now + 3_600_000], now, slot: "manual" };
    const shut = decideMlbRefill(base);
    expect(shut.fire).toBe(false);
    expect(shut.owed).toBe(0);
    const open = decideMlbRefill({ ...base, won: 600 });
    expect(open.fire).toBe(true);
    expect(open.owed).toBe(600);
    // a pre-found day never reads winnings
    const pre = decideMlbRefill({ ...base, date: "2026-10-02", lockEntry: { ...lockEntry, date: "2026-10-02", allocSum: 350, slotUnderSum: 0 }, won: 600 });
    expect(pre.owed).toBe(0);
    // what is open is $2,500 + won − the core actually staked
    const part = decideMlbRefill({ ...base, lockEntry: { ...lockEntry, core: [{ id: "x", stake: 170 }] }, won: 0 });
    expect(part.owed).toBe(2330);
  });
});

describe("the all-day cadence — no new cron rows, the 15-minute ticker carries it", () => {
  it("MLB: hourly 08:00–18:00 PT (11 passes); football: every 15 min 08:00–18:45 PT (44 passes)", () => {
    expect(FOUND_MLB_SLOTS_PT).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]);
    expect(FOUND_FOOTBALL_SLOTS_PT.length).toBe(44);
    expect(FOUND_FOOTBALL_SLOTS_PT[0]).toBe("08:00");
    expect(FOUND_FOOTBALL_SLOTS_PT.at(-1)).toBe("18:45");
    expect(new Set(FOUND_FOOTBALL_SLOTS_PT).size).toBe(44);
    expect(isFoundSlot("13:00", "mlb")).toBe(true);
    expect(isFoundSlot("13:15", "mlb")).toBe(false);
    expect(isFoundSlot("13:15", "football")).toBe(true);
    expect(isFoundSlot("19:00", "football")).toBe(false);
    expect(isFoundSlot("manual", "mlb")).toBe(false);
  });

  it("every found slot sits inside the cron-job.org ticker window (UTC 15–23 and 0–2) in PDT and in PST", () => {
    const tickerHoursUtc = new Set([15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2]);
    for (const offset of [7, 8]) {
      for (const s of [...FOUND_MLB_SLOTS_PT, ...FOUND_FOOTBALL_SLOTS_PT]) {
        const [h] = s.split(":").map(Number);
        expect(tickerHoursUtc.has((h + offset) % 24), `${s} PT (UTC−${offset}) falls outside the ticker`).toBe(true);
      }
    }
  });

  it("decideFoundTick fires inside a slot's window and names it; quiet between MLB hours", () => {
    const pdt = (hhmm: string) => Date.parse(`2026-10-03T${hhmm}:00-07:00`);
    const a = decideFoundTick(pdt("13:05"), "mlb");
    expect(a.fire).toBe(true);
    expect(a.slot).toBe("13:00");
    const b = decideFoundTick(pdt("13:35"), "mlb");
    expect(b.fire).toBe(false);
    const c = decideFoundTick(pdt("13:35"), "football");
    expect(c.fire).toBe(true);
    expect(c.slot).toBe("13:30");
    expect(decideFoundTick(pdt(`13:${String(GRADE_SLOT_WINDOW_MIN + 1).padStart(2, "0")}`), "mlb").fire).toBe(false);
    expect(decideFoundTick(pdt("19:10"), "football").fire).toBe(false);
    expect(decideFoundTick(pdt("07:50"), "football").fire).toBe(false);
  });

  it("the routes use the found cadence on found days (source pins)", () => {
    const gen = stripComments(read("app/api/generate/route.ts"));
    expect(gen).toContain('isFoundSlot(slot, "mlb")');
    expect(gen).toContain("mlbDayWonBy(carry");
    const sch = stripComments(read("app/api/scheduler/route.ts"));
    // MLB: the found calendar drives the refill decision; the live-props calendar keeps `rt`
    expect(sch).toContain('const ft = isFoundDay(date) ? decideFoundTick(now, "mlb") : rt;');
    expect(sch).toContain("decideMlbRefill({ ...day, now, ...(ft.slot ? { slot: ft.slot } : {}) })");
    // football: off a refill slot tickSlot is null, so the forward carries no ?slot= and the route's own clock decides
    expect(sch).toContain("const tickSlot = decideRefillTick(Date.now()).slot;");
    for (const p of ["app/api/cfb/lock/route.ts", "app/api/nfl/lock/route.ts"]) {
      const src = stripComments(read(p));
      expect(src, p).toContain('isFoundSlot(askedSlot, "football")');
      expect(src, p).toContain('decideFoundTick(now, "football")');
    }
  });
});

describe("football — today's wins read from the free ESPN finals on every pass", () => {
  const leg = (gkey: string, side: "home" | "away", cz = 100) => ({
    label: `${side} ML`,
    prop: "ML",
    cz,
    gkey,
    lkey: `${gkey}|ml|${side}`,
    market: "ml",
    side,
    line: null,
    teamId: null,
    prob: 0.55,
    push: 0,
  });
  const tix = (id: string, stake: number, czDec: number, legs: ReturnType<typeof leg>[]) => ({ id, bucket: "core", name: "x", stake, czOdds: 100, czDec, prob: 55, czEv: 3, legs });
  const entry = (over: Partial<CfbLedgerEntry> = {}) =>
    ({
      sport: "cfb",
      date: "2026-10-03",
      locked: true,
      daily: FOUND.daily,
      fun: 25,
      core: [tix("w", 250, 1.8, [leg("g1", "home", -125)]), tix("l", 300, 2, [leg("g2", "away")]), tix("p", 100, 2, [leg("g3", "home")])],
      funT: [],
      games: { g1: { start: "2026-10-03T16:00:00Z" }, g2: { start: "2026-10-03T16:00:00Z" }, g3: { start: "2026-10-03T23:00:00Z" } },
      grading: null,
      source: "server-lock",
      ...over,
    }) as unknown as CfbLedgerEntry;
  const finals: CfbFinals = {
    g1: { home: 31, away: 14, final: true, status: "final" },
    g2: { home: 28, away: 10, final: true, status: "final" },
    g3: { home: 7, away: 0, final: false, status: "in" },
  } as CfbFinals;
  const now = Date.parse("2026-10-03T20:30:00Z");

  it("counts the finished winner's profit at its locked price; a loser and a game in play add nothing", () => {
    expect(foundWonFromFinals(CFB_LEAGUE, entry(), finals, now)).toBe(200);
    expect(foundWonFromFinals(CFB_LEAGUE, entry(), {}, now)).toBe(0);
    // a recorded read of a ticket still in play stands; a recorded read of a ticket this read sees LOSE is cancelled
    expect(foundWonFromFinals(CFB_LEAGUE, entry({ foundWonBy: { p: 100 } } as never), finals, now)).toBe(300);
    expect(foundWonByFromFinals(CFB_LEAGUE, entry({ foundWonBy: { l: 500, p: 100 } } as never), finals, now)).toEqual({ w: 200, p: 100 });
  });

  it("the found pass reads it before deciding there is no room (source pin)", () => {
    const src = stripComments(read("src/lib/server/football-lock.ts"));
    const pass = src.slice(src.indexOf("export async function foundPassDate"), src.indexOf("export async function foundFirstLock"));
    const read1 = pass.indexOf("foundWonFromFinals(cfg, entry, finalsNow, args.now)");
    const gate = pass.indexOf("if (base.room < FOUND.minStake && !funOpen)");
    expect(read1).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(read1);
  });
});

describe("the merge honours a day's winnings — ticket by ticket, never a bare number", () => {
  const D = "2026-10-03";
  const t = (n: number, stake: number) => ({ id: `cfb-${D}-found-${n}`, bucket: "core", name: "x", stake, czOdds: 100, confirmed: null, found: true, legs: [] });
  const day = (core: ReturnType<typeof t>[], over: Record<string, unknown> = {}): SyncEntry =>
    ({ sport: "cfb", date: D, locked: true, daily: FOUND.daily, fun: 25, source: "server-lock", trigger: "cfb-lock", lockedAt: 1, core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const full = () => [t(1, 800), t(2, 800), t(3, 800), t(4, 100)];

  const won1 = { [`cfb-${D}-found-1`]: 300 };
  it("a $2,800 day after a $300 win merges whole in both orders, unmarked, foundWonBy kept", () => {
    const a = day(full(), { foundWonBy: won1 });
    const b = day([...full(), t(5, 300)], { foundWonBy: won1 });
    for (const [m] of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(m.core).toHaveLength(5);
      expect(m.core.reduce((s, x) => s + Number(x.stake), 0)).toBe(2800);
      expect((m as { capBreach?: unknown }).capBreach).toBeUndefined();
      expect((m as { foundWonBy?: unknown }).foundWonBy).toEqual(won1);
    }
  });

  it("a recorded win on a ticket NOT on the card, or one a settled grade calls lost, raises nothing", () => {
    const ghost = day([...full(), t(5, 300)], { foundWonBy: { "not-a-ticket": 300 } });
    const [g] = mergeLedgers([ghost], [ghost]);
    expect((g as { capBreach?: { core?: unknown } }).capBreach?.core).toEqual({ sum: 2800, cap: 2500 });
    expect((g as { foundWonBy?: unknown }).foundWonBy).toBeUndefined();
    const lost = day([...full(), t(5, 300)], { foundWonBy: won1, grading: { tickets: { [`cfb-${D}-found-1`]: { result: "lost", payout: 0 } }, legs: {}, done: false } });
    const [l] = mergeLedgers([lost], [lost]);
    expect((l as { capBreach?: { core?: unknown } }).capBreach?.core).toEqual({ sum: 2800, cap: 2500 });
  });

  it("without a recorded win the same $2,800 day is still kept whole — but MARKED over its cap", () => {
    const [m] = mergeLedgers([day([...full(), t(5, 300)])], [day([...full(), t(5, 300)])]);
    expect(m.core).toHaveLength(5);
    expect((m as { capBreach?: { core?: { sum: number; cap: number } } }).capBreach?.core).toEqual({ sum: 2800, cap: 2500 });
  });
});
