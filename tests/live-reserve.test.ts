import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { affordableEvents, liveReserveCredits } from "@/lib/cfb/props-store";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { NFL_PROPS } from "@/lib/nfl/rules";

/**
 * FIX 1 (2026-09-12) — WHY AN IN-GAME CFB/NFL PROP LINE FROZE, AND THE RESERVE THAT UNFREEZES IT.
 *
 * The defect, in one sentence: `footballPropsGet` sized ONE allowance for the whole pass with a
 * single `affordableEvents(need.length, spentToday, dailyBudget, perEvent)`, and that call returns
 * ZERO the moment the day's spend leaves less than one event of room — taking the in-play games
 * down with the pre-kick ones. A 60-game Saturday books 1,860 of the 2,500-credit rail before a
 * ball is thrown, so from mid-afternoon every live re-price was refused and the answer served
 * carried rows re-stamped `status: "live"`: on the phone, a frozen in-game line.
 *
 * The fix holds a LIVE-ONLY RESERVE out of the pre-kick half's reach. It lowers no budget — every
 * credit of `dailyBudget` is still spendable, and the live half is still sized against the FULL
 * budget. What changes is which pass gets the last slice.
 *
 * Every number below is a synthetic test value or a real config constant. No Odds API call is made
 * by this file and it spends no credits.
 */

const read = (p: string) => stripComments(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
const FP = "src/lib/server/football-props.ts";

/** the exact formula the route runs (pinned against the source in the last describe below) */
function split(liveLen: number, restLen: number, spentBefore: number, budget: number, reserve: number, perEvent: number) {
  const allowedLive = affordableEvents(liveLen, spentBefore, budget, perEvent);
  const liveSpend = allowedLive * perEvent;
  const allowedRest = affordableEvents(restLen, spentBefore + liveSpend, budget - reserve, perEvent);
  return { allowedLive, allowedRest, total: allowedLive + allowedRest };
}

describe("FIX 1 — the live reserve lets an in-play pull through a spent pre-kick day", () => {
  it("CFB: a 60-game pre-kick Saturday used to refuse every live game; now it buys them", () => {
    const per = CFB_PROPS.measuredCreditsPerEvent;
    const reserve = liveReserveCredits(CFB_PROPS);
    // the pre-kick half may spend down to exactly dailyBudget - reserve and no further
    const spentAfterPrekick = CFB_PROPS.dailyBudget - reserve;
    // OLD BEHAVIOUR: one allowance over the whole pass, at that spend, for 2 in-play games
    expect(affordableEvents(2, spentAfterPrekick, CFB_PROPS.dailyBudget, per)).toBeGreaterThan(0); // room exists...
    // ...but the real pre-kick pass does not stop at that line without the reserve: it spends on
    // EVERY game it can afford, which is the whole rail.
    expect(affordableEvents(2, CFB_PROPS.dailyBudget, CFB_PROPS.dailyBudget, per)).toBe(0); // the frozen-line case
    // NEW BEHAVIOUR: the pre-kick half is capped at dailyBudget - reserve, so the live half still buys
    const s = split(2, 60, spentAfterPrekick - per * 0, CFB_PROPS.dailyBudget, reserve, per);
    expect(s.allowedLive).toBe(2);
  });

  it("the pre-kick half stops at dailyBudget - reserve, and the live half still reaches the last credit", () => {
    const per = CFB_PROPS.measuredCreditsPerEvent;
    const reserve = liveReserveCredits(CFB_PROPS);
    const fromZero = split(0, 60, 0, CFB_PROPS.dailyBudget, reserve, per);
    expect(fromZero.allowedRest).toBe(Math.floor((CFB_PROPS.dailyBudget - reserve) / per));
    // and with the pre-kick half already at its ceiling, the live half is sized on the FULL budget
    const spent = fromZero.allowedRest * per;
    const live = split(CFB_PROPS.liveMaxEvents, 0, spent, CFB_PROPS.dailyBudget, reserve, per);
    expect(live.allowedLive).toBe(Math.min(CFB_PROPS.liveMaxEvents, Math.floor((CFB_PROPS.dailyBudget - spent) / per)));
    expect(live.allowedLive).toBeGreaterThan(0);
  });

  it("NFL keeps its whole pre-kick slate — the reserve only refuses a SECOND full re-price", () => {
    const per = NFL_PROPS.measuredCreditsPerEvent;
    const reserve = liveReserveCredits(NFL_PROPS);
    const prekickRoom = Math.floor((NFL_PROPS.dailyBudget - reserve) / per);
    expect(prekickRoom).toBeGreaterThanOrEqual(NFL_PROPS.liveMaxEvents); // a full Sunday slate still prices
    const s = split(0, NFL_PROPS.liveMaxEvents, 0, NFL_PROPS.dailyBudget, reserve, per);
    expect(s.allowedRest).toBe(NFL_PROPS.liveMaxEvents);
  });

  it("live is sized against the FULL budget — an in-play re-price may spend the day's last credit", () => {
    const per = CFB_PROPS.measuredCreditsPerEvent;
    const reserve = liveReserveCredits(CFB_PROPS);
    const spent = CFB_PROPS.dailyBudget - per; // exactly one event of room left
    const s = split(3, 3, spent, CFB_PROPS.dailyBudget, reserve, per);
    expect(s.allowedLive).toBe(1);
    expect(s.allowedRest).toBe(0); // the pre-kick half is long past its ceiling
  });
});

describe("FIX 1 — at reserve 0 the split is byte-identical to the single allowance it replaced", () => {
  it("same count for every (live, rest, spent) case, so a config without liveReserveCredits is unchanged", () => {
    const per = 31;
    const budget = 2500;
    for (const spent of [0, 31, 100, 1240, 2000, 2469, 2470, 2499, 2500, 3000]) {
      for (let liveLen = 0; liveLen <= 4; liveLen++) {
        for (let restLen = 0; restLen <= 4; restLen++) {
          const old = affordableEvents(liveLen + restLen, spent, budget, per);
          const now = split(liveLen, restLen, spent, budget, 0, per).total;
          expect(now, `live=${liveLen} rest=${restLen} spent=${spent}`).toBe(old);
        }
      }
    }
  });

  it("never spends past the day's budget even with a reserve set", () => {
    const per = 31;
    const budget = 2500;
    for (const reserve of [0, 744, 1000, 2500]) {
      for (const spent of [0, 500, 1756, 2400, 2500]) {
        const s = split(12, 60, spent, budget, reserve, per);
        expect(spent + s.total * per).toBeLessThanOrEqual(Math.max(budget, spent));
      }
    }
  });
});

describe("FIX 1 — NO BUDGET, CAP OR ALLOTMENT WAS LOWERED", () => {
  it("every CFB props number Josh set is exactly what it was", () => {
    expect(CFB_PROPS.dailyBudget).toBe(2500);
    expect(CFB_PROPS.maxEvents).toBe(60);
    expect(CFB_PROPS.liveMaxEvents).toBe(24);
    expect(CFB_PROPS.measuredCreditsPerEvent).toBe(31);
  });

  it("every NFL props number Josh set is exactly what it was", () => {
    expect(NFL_PROPS.dailyBudget).toBe(1000);
    expect(NFL_PROPS.maxEvents).toBe(16);
    expect(NFL_PROPS.liveMaxEvents).toBe(16);
    expect(NFL_PROPS.measuredCreditsPerEvent).toBe(31);
  });

  it("the reserve is a slice OF the budget, never an addition to it or a cut of it", () => {
    expect(liveReserveCredits(CFB_PROPS)).toBe(CFB_PROPS.liveMaxEvents * CFB_PROPS.measuredCreditsPerEvent);
    expect(liveReserveCredits(NFL_PROPS)).toBe(NFL_PROPS.liveMaxEvents * NFL_PROPS.measuredCreditsPerEvent);
    expect(liveReserveCredits(CFB_PROPS)).toBeLessThan(CFB_PROPS.dailyBudget);
    expect(liveReserveCredits(NFL_PROPS)).toBeLessThan(NFL_PROPS.dailyBudget);
  });

  it("liveReserveCredits is OPTIONAL — a league that never sets it behaves exactly as today", () => {
    const noReserve = { ...CFB_PROPS } as Record<string, unknown>;
    delete noReserve.liveReserveCredits;
    expect(liveReserveCredits(noReserve as unknown as typeof CFB_PROPS)).toBe(0);
  });

  it("a nonsense or oversized reserve can never exceed the budget or go negative", () => {
    const mk = (v: unknown) => ({ ...CFB_PROPS, liveReserveCredits: v } as unknown as typeof CFB_PROPS);
    expect(liveReserveCredits(mk(-10))).toBe(0);
    expect(liveReserveCredits(mk(0))).toBe(0);
    expect(liveReserveCredits(mk(Number.NaN))).toBe(0);
    expect(liveReserveCredits(mk("744"))).toBe(0);
    expect(liveReserveCredits(mk(99999))).toBe(CFB_PROPS.dailyBudget);
    expect(liveReserveCredits(mk(744.9))).toBe(744);
  });
});

describe("FIX 1 — the route really runs that split", () => {
  const src = read(FP);

  it("partitions need into live and rest, preserving order", () => {
    /* ON STATUS, NOT ON `why`: why() ranks any game the stored board lacks as "unpriced", live or
       not, so a why-based split would leave an in-play game with NO rows — the most frozen case
       there is — in the pre-kick half. This is the one place this fix departs from the recipe it
       was handed, and it departs by widening the protected half, never narrowing it. */
    expect(src).toMatch(/const liveNeed = need\.filter\(\(g\) => g\.status === "live"\);/);
    expect(src).toMatch(/const restNeed = need\.filter\(\(g\) => g\.status !== "live"\);/);
    expect(src).toMatch(/if \(!stored \|\| !storedIds\.has\(g\.id\)\) return "unpriced";/); // the reason why

    expect(src).toMatch(/const toFetch = \[\.\.\.liveNeed\.slice\(0, allowedLive\), \.\.\.restNeed\.slice\(0, allowedRest\)\];/);
    expect(src).toMatch(/const refused = \[\.\.\.liveNeed\.slice\(allowedLive\), \.\.\.restNeed\.slice\(allowedRest\)\];/);
  });

  it("sizes live against the FULL dailyBudget and rest against dailyBudget - reserve", () => {
    expect(src).toMatch(/affordableEvents\(liveNeed\.length, spentBefore, cfg\.props\.dailyBudget, perEventCost\)/);
    expect(src).toMatch(/affordableEvents\(restNeed\.length, spentBefore \+ liveSpend, cfg\.props\.dailyBudget - reserve, perEventCost\)/);
    expect(src).toMatch(/const reserve = liveReserveCredits\(cfg\.props\);/);
  });

  it("keeps the budgeted flag and still reports it off the same counts", () => {
    expect(src).toMatch(/const allowed = toFetch\.length;/);
    expect(src).toMatch(/const budgeted = allowed < need\.length;/);
  });

  it("names the reserve in the note rather than claiming a budget is spent that is not", () => {
    expect(src).toMatch(/credits are held back for games already under way/);
  });

  it("changes no budget field: the route never assigns dailyBudget, maxEvents or liveMaxEvents", () => {
    expect(src).not.toMatch(/dailyBudget\s*[-+*/]?=\s*\d/);
    expect(src).not.toMatch(/liveMaxEvents\s*=\s*\d/);
  });
});
