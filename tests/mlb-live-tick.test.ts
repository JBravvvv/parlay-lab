import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/source";
import { decideSlotTick, GRADE_SLOT_WINDOW_MIN, REFILL_SLOTS_PT } from "@/lib/server/grading-progress";
import { MLB_LIVE_PROPS } from "@/lib/mlb/live-props-rules";

/**
 * INSTRUCTION 51 / WI-4 — THE TICK WIRING FOR THE MLB LIVE IN-PLAY PULL.
 *
 * Josh's order, verbatim (2026-09-11): "Authorize the live in-play odds pull for MLB". Authorizing
 * a PAID pull means authorizing a cadence, and a cadence is the part that spends money while nobody
 * is watching. INSTRUCTION 49 already cost a day to that lesson: the refill was firing every 15
 * minutes because the ticker's poke window and the desk's spending calendar were two different
 * things. So this file guards ONE claim above all others —
 *
 *   THE LIVE PULL HAS NO CALENDAR OF ITS OWN. It rides the refill's five Pacific slots, off the
 *   SAME decideSlotTick result, and the opt-in second calendar ships EMPTY.
 *
 * Everything here is either a pure-function assertion on decideSlotTick or a source pin. No route
 * is executed: /api/scheduler's behaviour is covered by tests/scheduler-route.test.ts, and running
 * it here would risk a second copy of that harness drifting from the first.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const SCHED = stripComments(read("app/api/scheduler/route.ts"));
const REFILL = stripComments(read("src/lib/server/refill.ts"));
const SHARP = stripComments(read("app/sharp/page.tsx"));

/** a Pacific wall clock, written with its offset so the test states its own timezone rather than
    inheriting one: September is PDT (-07:00), November 5th is PST (-08:00). */
const pdt = (hhmm: string) => Date.parse(`2026-09-11T${hhmm}:00-07:00`);
const pst = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00-08:00`);

describe("INSTRUCTION 51 — the live pull rides the refill's calendar, it does not own one", () => {
  it("MLB_LIVE_PROPS.slots IS REFILL_SLOTS_PT — the same object, so the two cannot drift apart", () => {
    // toBe, not toEqual: a copied array would pass equality today and diverge the day one is edited.
    expect(MLB_LIVE_PROPS.slots).toBe(REFILL_SLOTS_PT);
    expect(REFILL_SLOTS_PT).toEqual(["08:00", "09:30", "12:00", "15:00", "16:45"]);
  });

  it("SHIPS ON 'ticker' WITH JOSH'S WORD — the live pull has its own calendar, and it is the live window", () => {
    /* INSTRUCTION 52 (2026-09-12, Josh verbatim: "I've always had in game live lines. It has live
       lines; they just went away this week"), read against his 2026-09-09 contract ("I can manually do
       it and it can function the same way whether I manually refresh it or it refreshes itself
       automatically"). The guard this replaces said no automatic live fire exists without his word.
       His word is now on the record, so what is asserted instead is WHEN it fires — and the half of
       the old guard that still matters, that the fire cannot reach the stake calendar, is below. */
    expect(MLB_LIVE_PROPS.tickMode).toBe("ticker");
    expect(MLB_LIVE_PROPS.liveSlotsPT).toEqual(["15:00", "16:45", "17:15", "17:45", "18:15", "18:45"]);
    // every one of the six fires, naming its own slot
    for (const t of MLB_LIVE_PROPS.liveSlotsPT) {
      expect(decideSlotTick(pdt(t), MLB_LIVE_PROPS.liveSlotsPT, GRADE_SLOT_WINDOW_MIN), t).toEqual({ fire: true, slot: t });
    }
    /* and NOTHING fires before baseball does or after the cron ticker's own window closes: 08:00 and
       09:30 PT are stake slots with zero live baseball, and the scheduler row that pokes this runs
       UTC hours 15-23 and 0-2 = 08:00-19:00 PT, so 19:00 onward cannot fire regardless. */
    /* 12:00 is on this list since the review round: it was dropped from the live calendar because
       seven automatic passes at CFB's unmeasured 31 a prop event are 658, past Josh's 600 rail. */
    for (const t of ["08:00", "09:30", "11:00", "12:00", "19:00", "20:30"]) {
      expect(decideSlotTick(pdt(t), MLB_LIVE_PROPS.liveSlotsPT, GRADE_SLOT_WINDOW_MIN).fire, t).toBe(false);
    }
    // THE STAKE CALENDAR IS NOT TOUCHED BY ANY OF IT — still INSTRUCTION 49's five, still by reference
    expect(MLB_LIVE_PROPS.slots).toBe(REFILL_SLOTS_PT);
    expect(REFILL_SLOTS_PT).toEqual(["08:00", "09:30", "12:00", "15:00", "16:45"]);
  });
});

describe("tickMode 'slots' — the poke fires on exactly the five PT slots and nothing else", () => {
  it("fires on each of the five, naming the slot it fired for", () => {
    for (const t of ["08:00", "09:30", "12:00", "15:00", "16:45"]) {
      expect(decideSlotTick(pdt(t), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN), t).toEqual({ fire: true, slot: t });
    }
  });

  it("does NOT fire at 17:00 / 18:00 / 19:00 PT — prime time is the expensive window, and it is off", () => {
    for (const t of ["17:00", "18:00", "19:00"]) {
      expect(decideSlotTick(pdt(t), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN), t).toEqual({ fire: false, slot: null });
    }
  });

  it("the window is [slot, slot+15) — the last minute inside fires, the first minute outside does not", () => {
    expect(decideSlotTick(pdt("08:14"), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: true, slot: "08:00" });
    expect(decideSlotTick(pdt("08:15"), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: false, slot: null });
    expect(decideSlotTick(pdt("07:59"), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: false, slot: null });
  });

  it("the calendar is PACIFIC, not UTC — the same slots hold after the clocks go back", () => {
    expect(decideSlotTick(pst("16:45"), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: true, slot: "16:45" });
    expect(decideSlotTick(pst("17:00"), MLB_LIVE_PROPS.slots, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: false, slot: null });
  });
});

describe("the opt-in 'ticker' mode calls the SAME function, never a second implementation", () => {
  it("a populated liveSlotsPT drives decideSlotTick itself — same window rule, same answer shape", () => {
    const opt = ["17:00", "18:30"] as const;
    expect(decideSlotTick(pdt("17:00"), opt, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: true, slot: "17:00" });
    expect(decideSlotTick(pdt("18:44"), opt, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: true, slot: "18:30" });
    expect(decideSlotTick(pdt("18:45"), opt, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: false, slot: null });
    expect(decideSlotTick(pdt("12:00"), opt, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: false, slot: null });
  });

  it("SOURCE PIN: the scheduler contains no second slot-matching implementation", () => {
    // one call, one calendar function. Two would be two calendars, which is INSTRUCTION 49's bug.
    expect(SCHED.match(/decideSlotTick\(/g)?.length ?? 0).toBe(1);
    expect(SCHED).toMatch(/decideSlotTick\(now, MLB_LIVE_PROPS\.liveSlotsPT, GRADE_SLOT_WINDOW_MIN\)/);
    // no hand-rolled Pacific minute comparison, and no slot times written out in the route
    expect(SCHED).not.toMatch(/ptMinutesOfDay/);
    expect(SCHED).not.toMatch(/\[\s*"\d{2}:\d{2}"/);
  });

  it("SOURCE PIN: under 'slots' the poke reuses `rt` — the refill tick's OWN result, not a re-decide", () => {
    expect(SCHED).toMatch(/const lt = MLB_LIVE_PROPS\.tickMode === "ticker" \? decideSlotTick\(.*\) : rt;/);
    expect(SCHED).toMatch(/const liveSlot = lt\.fire \? lt\.slot : null;/);
  });
});

describe("the poke cannot touch the refill's decision, its reason or its spend", () => {
  it("SOURCE PIN: the refill forward is untouched — same route, same header-borne secret", () => {
    expect(REFILL).toMatch(/\/api\/generate\?topup=1&slot=\$\{encodeURIComponent\(a\.slot\)\}/);
    expect(REFILL).toMatch(/headers: \{ "x-cron-key": a\.secret \}/);
    // the secret never rides in a query string, on either forward
    expect(REFILL).not.toMatch(/[?&](key|secret|cron)=/);
  });

  it("SOURCE PIN: the live pull is a SEPARATE exported function, not a widening of forwardMlbRefill", () => {
    expect(REFILL).toMatch(/export async function forwardMlbLivePull\(a: \{/);
    /* INSTRUCTION 51 fix pass (2026-09-11): the query string is assembled one line above the fetch
       because a HAND tap now rides the same function with manual=1 — the one flag that bypasses the
       route's NX slot stamp. The slot is still encoded, and the secret still travels only in the
       header, which is what this pin is actually for. */
    expect(REFILL).toMatch(/const qs = `slot=\$\{encodeURIComponent\(a\.slot\)\}\$\{a\.manual \? "&manual=1" : ""\}`;/);
    expect(REFILL).toMatch(/\/api\/mlb\/live-props\?\$\{qs\}`, a\.origin\)/);
    expect(REFILL).toMatch(/headers: \{ "x-cron-key": a\.secret \}/);
    expect(REFILL).not.toMatch(/live-props\?[^`]*(key|secret|cron)=/);
    // and it is TOTAL: every path returns a record, so the caller never has to branch to stay alive
    expect(REFILL).toMatch(/return \{ forwarded: false, error: \(e as Error\)\.message \};/);
    // the /api/generate forward takes no live-props parameter — the two forwards stay separate
    const fwd = REFILL.slice(REFILL.indexOf("export async function forwardMlbRefill"), REFILL.indexOf("export type MlbLivePullResult"));
    expect(fwd).not.toMatch(/live-props/);
  });

  it("SOURCE PIN: the live pull rides the SAME Promise.allSettled and reports itself as a field", () => {
    expect(SCHED).toMatch(/const \[gen, cal, lp\] = await Promise\.allSettled\(\[/);
    expect(SCHED).toMatch(/liveSlot \? forwardMlbLivePull\(\{[^}]*\}\) : Promise\.resolve\(null\)/);
    // added to the body ONLY when a poke was made, so an off-slot tick's body is byte-identical to
    // the one tests/scheduler-route.test.ts pinned before this ship
    expect(SCHED.match(/\.\.\.\(livePull \? \{ livePull \} : \{\}\)/g)?.length ?? 0).toBe(2);
    // a report, never a decision: the refill's own fields are still computed from `topup`/`rt`
    expect(SCHED).toMatch(/const refillFires = topup\.fire === true;/);
  });

  it("SOURCE PIN: the cron gates are untouched", () => {
    expect(SCHED).toMatch(/!!process\.env\.CRON_SECRET && cronHeaderAuthed\(req\)/);
    expect(SCHED).toMatch(/if \(!cronHeaderAuthed\(req\)\) \{/);
  });
});

describe("the Sharp tab still reads ONE comparison, now asked at the live line", () => {
  it("SOURCE PIN: settledRead is imported and never re-implemented", () => {
    /* legSideOf joined the import in the fix pass (2026-09-11): the side the row holds decides
       whether the live line may replace the stored one at all, and it is read from the SAME module
       that owns the rule — the Sharp tab still re-implements nothing. */
    expect(SHARP).toMatch(/import \{ legSideOf, settledRead, type LegSettledRead \} from "@\/lib\/leg-settled";/);
    expect(SHARP).toMatch(/if \(!q \|\| legSideOf\(r\.sub\) === "U"\) return settledRead\(r\.lkey, r\.sub, playNow\(r\)\?\.val\);/);
    expect(SHARP).not.toMatch(/val > line|cur > ln/);
  });

  it("SOURCE PIN: every live number on the page is SIDED, and a settled play has no live read", () => {
    /* fix pass (2026-09-11). `live.pLive` is always P(OVER) — the overlay key is
       `gkey|player|market|line` and carries no side — so the headline probability was showing an
       Under play the Over's number as its own. And a settled play has no live probability at all:
       `playSettled` refuses to re-anchor an Under, so a decided Under is read at the line Josh
       holds, and a live percentage printed above that verdict offers a live read on a lost bet. */
    expect(SHARP).toMatch(/const v = live && !settled \? mlbLiveView\(live, legSideOf\(r\.sub\)\) : null;/);
    expect(SHARP).toMatch(/\(v\.p \* 100\)\.toFixed\(1\)/);
    expect(SHARP, "the raw, unsided P(over) may not be rendered anywhere").not.toMatch(/live\.pLive \* 100/);
    // the three live cells all read the same sided view, built once per row
    expect(SHARP).toMatch(/const v = mlbLiveView\(live, legSideOf\(r\.sub\)\);/);
    expect(SHARP).not.toMatch(/live\.czAm|live\.evCz/);
  });

  it("SOURCE PIN: the re-anchor swaps the LINE segment only — the player segment never moves", () => {
    expect(SHARP).toMatch(/settledRead\(`\$\{player\}\|\$\{market\}\|\$\{q\.ln\}`, r\.sub, playNow\(r\)\?\.val\)/);
    // the same render-time age cap the Board enforces, off the same constant
    expect(SHARP).toMatch(/Date\.now\(\) - Date\.parse\(q\.at\) > MLB_LIVE_CLIENT\.quoteMaxAgeSec \* 1000/);
    // a live row carries no stake — the word Kelly appears only as the promise that there is none
    expect(SHARP).not.toMatch(/kellyStake|stakeFor|quarterKelly/);
  });
});

/* THE PLANTS. Each mutates a copy of the shipped source in the one way that would quietly start
   spending money, and asserts the checker above goes red. A guard with no plant is a guard nobody
   has ever seen fail. */
describe("PLANT: a live poke that escapes its gate is detected", () => {
  /** the shipped claim, as one predicate: the calendar is chosen by tickMode, and the poke only
      happens when that calendar actually fired. */
  const gated = (src: string) =>
    /const lt = MLB_LIVE_PROPS\.tickMode === "ticker" \? decideSlotTick\(/.test(src) &&
    /const liveSlot = lt\.fire \? lt\.slot : null;/.test(src) &&
    /liveSlot \? forwardMlbLivePull\(/.test(src);

  it("the shipped source is gated", () => {
    expect(gated(SCHED)).toBe(true);
  });

  it("stripping the tickMode gate is caught", () => {
    const planted = SCHED.replace(
      /const lt = MLB_LIVE_PROPS\.tickMode === "ticker" \? decideSlotTick\(now, MLB_LIVE_PROPS\.liveSlotsPT, GRADE_SLOT_WINDOW_MIN\) : rt;/,
      "const lt = decideSlotTick(now, MLB_LIVE_PROPS.liveSlotsPT, GRADE_SLOT_WINDOW_MIN);",
    );
    expect(planted, "the plant must actually change the source").not.toBe(SCHED);
    expect(gated(planted), "the checker cannot see the tickMode gate removed").toBe(false);
  });

  it("making the poke unconditional is caught", () => {
    const planted = SCHED.replace(/liveSlot \? forwardMlbLivePull\(/, "true ? forwardMlbLivePull(");
    expect(planted).not.toBe(SCHED);
    expect(gated(planted), "the checker cannot see the poke go unconditional").toBe(false);
  });

  it("a second hand-rolled calendar in the route is caught", () => {
    const planted = SCHED.replace(
      /const liveSlot = lt\.fire \? lt\.slot : null;/,
      'const liveSlot = ["17:00", "18:30"].find((s) => s === hhmm) ?? null;',
    );
    expect(planted).not.toBe(SCHED);
    expect(planted, "the checker cannot see a slot array literal appear in the route").toMatch(/\[\s*"\d{2}:\d{2}"/);
  });
});
