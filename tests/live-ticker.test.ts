import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { MLB_LIVE_PROPS } from "@/lib/mlb/live-props-rules";
import { MLB_LIST_CALL_CREDITS, mlbAffordableEvents } from "@/lib/mlb/live-props-store";
import { decideSlotTick, GRADE_SLOT_WINDOW_MIN, REFILL_SLOTS_PT } from "@/lib/server/grading-progress";

/**
 * FIX 2 (2026-09-12) — THE MLB LIVE IN-PLAY PULL FIRED ONLY WHEN NO BASEBALL WAS LIVE.
 *
 * INSTRUCTION 51 shipped `tickMode: "slots"`, which put the automatic in-play pull on the five
 * INSTRUCTION 49 stake slots: 08:00, 09:30, 12:00, 15:00 and 16:45 Pacific. A typical MLB evening
 * is first pitch 19:10 ET = 16:10 PT, middle innings from roughly 17:30 PT — i.e. every slot but one
 * lands before a pitch is thrown, and the 16:45 slot catches the first inning of the early games
 * only. So the pass that exists to buy IN-PLAY prices could barely ever fire while a game was in
 * play, which is the in-game half of Josh's "it's not updating with live odds".
 *
 * `tickMode` is now "ticker" and `liveSlotsPT` carries six evening Pacific times. The same
 * `decideSlotTick` function decides; there is no second slot matcher anywhere. INSTRUCTION 49's
 * refill calendar is untouched — this file asserts that too, because the live pull riding a
 * different calendar must not move the money ladder by one minute.
 *
 * Every number here is a real config constant or a synthetic clock. No Odds API call, no credits.
 */

const read = (p: string) => stripComments(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
const SCHED = "app/api/scheduler/route.ts";

/** a Pacific wall-clock instant. 2026-09-12 is PDT (-07:00); 2026-01-10 is PST (-08:00). */
const pdt = (hhmm: string, plusMin = 0) => Date.parse(`2026-09-12T${hhmm}:00-07:00`) + plusMin * 60_000;
const pst = (hhmm: string, plusMin = 0) => Date.parse(`2026-01-10T${hhmm}:00-08:00`) + plusMin * 60_000;
const liveTick = (ms: number) => decideSlotTick(ms, MLB_LIVE_PROPS.liveSlotsPT, GRADE_SLOT_WINDOW_MIN);

/* SIX, NOT THE SEVEN FIRST WRITTEN (review round, 2026-09-12). 12:00 was dropped because the
   worst-case arithmetic does not fit with it: if MLB bills like CFB's 31 an event a pass is 94, and
   seven automatic passes are 658 — past Josh's 600 rail, with nobody having touched the phone. The
   rail cannot save it: a pass is sized ONCE before it pulls, against the ASSUMED 6 credits an event,
   and the real x-requests-used delta is recorded only afterwards, so there is no mid-pass abort.
   Six passes are 564, inside 600 at either rate. Nothing Josh set was lowered to get there — these
   times are new in this build, `dailyBudget` is still 600 and the five stake slots are untouched. */
const EVENING = ["15:00", "16:45", "17:15", "17:45", "18:15", "18:45"] as const;

describe("FIX 2 — the live tick now fires on the evening slate", () => {
  it("ships tickMode ticker with the six evening Pacific times", () => {
    expect(MLB_LIVE_PROPS.tickMode).toBe("ticker");
    expect(MLB_LIVE_PROPS.liveSlotsPT).toEqual([...EVENING]);
  });

  it("fires at every one of the six slots, and keeps firing for the whole 15-minute window", () => {
    for (const slot of EVENING) {
      expect(liveTick(pdt(slot)), slot).toEqual({ fire: true, slot });
      expect(liveTick(pdt(slot, GRADE_SLOT_WINDOW_MIN - 1)), `${slot} late`).toEqual({ fire: true, slot });
      expect(liveTick(pdt(slot, -1)).slot, `${slot} early`).not.toBe(slot);
    }
  });

  it("fires on the evening slots in standard time too — the calendar is Pacific wall clock, not UTC", () => {
    for (const slot of EVENING) expect(liveTick(pst(slot)), slot).toEqual({ fire: true, slot });
  });

  it("THE DEFECT: under the old slots mode, the in-play hours got no automatic pass at all", () => {
    for (const t of ["17:15", "17:45", "18:15", "18:45"]) {
      expect(decideSlotTick(pdt(t), REFILL_SLOTS_PT, GRADE_SLOT_WINDOW_MIN).fire, t).toBe(false);
    }
  });

  it("does not fire between slots, so the spend is six passes and not a poll", () => {
    // 12:00 is on this list now: it was dropped from the calendar, so it must no longer fire
    for (const t of ["11:00", "12:00", "13:30", "16:30", "17:00", "19:45", "21:30", "23:30"]) {
      expect(liveTick(pdt(t)).fire, t).toBe(false);
    }
  });

  it("the scheduler reads liveSlotsPT through the SAME decideSlotTick, with no second matcher", () => {
    const src = read(SCHED);
    expect(src).toMatch(
      /const lt = MLB_LIVE_PROPS\.tickMode === "ticker" \? decideSlotTick\(now, MLB_LIVE_PROPS\.liveSlotsPT, GRADE_SLOT_WINDOW_MIN\) : rt;/,
    );
    expect(src).toMatch(/const liveSlot = lt\.fire \? lt\.slot : null;/);
    // one poke per fire, inside the same allSettled, and never on an off-slot tick
    expect(src).toMatch(/liveSlot \? forwardMlbLivePull\(/);
  });
});

describe("FIX 2 — INSTRUCTION 49's refill calendar did not move", () => {
  it("the five stake slots are exactly what they were", () => {
    expect([...REFILL_SLOTS_PT]).toEqual(["08:00", "09:30", "12:00", "15:00", "16:45"]);
  });

  it("MLB_LIVE_PROPS.slots is still the SAME ARRAY OBJECT as REFILL_SLOTS_PT — no copy to drift", () => {
    expect(MLB_LIVE_PROPS.slots).toBe(REFILL_SLOTS_PT);
  });

  it("the refill gate still reads rt off decideRefillTick, untouched by the live calendar", () => {
    const src = read(SCHED);
    expect(src).toMatch(/const rt = decideRefillTick\(now\);/);
    // and decideRefillTick is the five-slot calendar, by construction
    expect(decideSlotTick(pdt("08:00"), REFILL_SLOTS_PT, GRADE_SLOT_WINDOW_MIN)).toEqual({ fire: true, slot: "08:00" });
  });
});

describe("FIX 2 — what six passes actually cost, inside the live pull's OWN 600-credit day", () => {
  /* `probing = !cfg.rateMeasured || spentNow === 0` and `allowed = probing ? min(affordable,
     probeEvents) : affordable` (src/lib/server/mlb-live-quote.ts). `rateMeasured` is FALSE, so
     every pass is capped at probeEvents (3) — not liveMaxEvents (12). One pass is therefore the
     single events-list call plus three per-event pulls. */
  const perPass = MLB_LIST_CALL_CREDITS + MLB_LIVE_PROPS.probeEvents * MLB_LIVE_PROPS.measuredCreditsPerEvent;

  it("every pass is capped at probeEvents until a real credit reading lands", () => {
    expect(MLB_LIVE_PROPS.rateMeasured).toBe(false);
    const q = read("src/lib/server/mlb-live-quote.ts");
    expect(q).toMatch(/const probing = !cfg\.rateMeasured \|\| spentNow === 0;/);
    expect(q).toMatch(/const allowed = probing \? Math\.min\(affordable, cfg\.probeEvents\) : affordable;/);
    expect(MLB_LIVE_PROPS.probeEvents).toBe(3);
    expect(MLB_LIVE_PROPS.probeEvents).toBeLessThan(MLB_LIVE_PROPS.liveMaxEvents);
  });

  it("one pass is 19 credits, six automatic passes are 114 of the 600-credit day", () => {
    expect(perPass).toBe(19);
    expect(EVENING.length * perPass).toBe(114);
    expect(EVENING.length * perPass).toBeLessThan(MLB_LIVE_PROPS.dailyBudget);
  });

  it("six automatic passes plus five manual taps still fit, with room to spare", () => {
    const manual = 5;
    expect((EVENING.length + manual) * perPass).toBe(209);
    expect((EVENING.length + manual) * perPass).toBeLessThan(MLB_LIVE_PROPS.dailyBudget);
  });

  it("AT CFB'S RATE THE AUTOMATIC DAY STILL FITS — no fudge, and this is why there are six slots", () => {
    /* THE TEST THAT FORCED THE SLOT COUNT (review round, 2026-09-12). This assertion used to read
       `<= dailyBudget + 58`, and that 58 was the seventh pass crossing Josh's 600 rail: a fudge
       factor standing in for "the automatic day can overspend the budget". The arithmetic is fixed
       instead of the assertion — six passes at the worst rate are 564 — so the comparison is now
       plain and strict, and it fails the moment a slot is added back. */
    const worst = MLB_LIST_CALL_CREDITS + MLB_LIVE_PROPS.probeEvents * 31;
    expect(worst).toBe(94);
    expect(EVENING.length * worst).toBe(564);
    expect(EVENING.length * worst).toBeLessThanOrEqual(MLB_LIVE_PROPS.dailyBudget);
    // and the rail refuses rather than overspending once it IS at the line
    expect(mlbAffordableEvents(MLB_LIVE_PROPS.probeEvents, 600)).toBe(0);
  });

  it("WHAT THE RAIL DOES NOT DO: it sizes a pass once, on the ASSUMED rate, and cannot stop one part-way", () => {
    /* Stated as a test so nobody re-reads the rail as a worst-case guard again. At 564 spent — the
       end of a worst-case automatic day — the rail still reads "room for three events" because it
       divides by the assumed 6, so Josh's own tap is allowed and may bill 94. One pass of overshoot,
       the pre-existing property of a read-modify-write rail, and HIS tap: nothing here may block a
       bet. The cure is the measurement, not a smaller cap. */
    const worstDay = EVENING.length * (MLB_LIST_CALL_CREDITS + MLB_LIVE_PROPS.probeEvents * 31);
    expect(mlbAffordableEvents(MLB_LIVE_PROPS.probeEvents, worstDay)).toBe(MLB_LIVE_PROPS.probeEvents);
    const q = read("src/lib/server/mlb-live-quote.ts");
    // sized once, before the pass; the real delta is added after it returns
    expect(q).toMatch(/const affordable = mlbAffordableEvents\(sel\.events\.length, spentNow\);/);
    expect(q).toMatch(/mlbPullCredits\(used, fetched\)/);
  });

  it("NO BUDGET OR CAP WAS LOWERED — every MLB live number Josh set is unchanged", () => {
    expect(MLB_LIVE_PROPS.dailyBudget).toBe(600);
    expect(MLB_LIVE_PROPS.liveMaxEvents).toBe(12);
    expect(MLB_LIVE_PROPS.liveRevalidateSec).toBe(1800);
    expect(MLB_LIVE_PROPS.quoteMaxAgeSec).toBe(1800);
    expect(MLB_LIVE_PROPS.measuredCreditsPerEvent).toBe(6);
    expect(MLB_LIVE_PROPS.emptyHoldSec).toBe(7200);
    expect(MLB_LIVE_PROPS.cooldownDay).toBe(true);
  });
});
