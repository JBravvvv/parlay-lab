import { describe, expect, it } from "vitest";
import {
  CORE_SHAPES,
  CORE_SHAPES_SINCE,
  SHAPE_TICKETS,
  SHAPE_TOTAL,
  TILT_MIN_GAP,
  TILT_MIN_N,
  bucketRecordFromLedger,
  dayIndexOf,
  legBucket,
  longMoney,
  shapeById,
  shapeForDay,
  shapeLine,
  slotName,
  tiltFor,
  tiltedMenu,
  type ShapeCalibration,
} from "@/lib/core-shapes";
import { CORE_RULES, PAPER, PAPER_TICKETS, slotMaxDec } from "@/lib/paper-mode";

/**
 * INSTRUCTION 46 (2026-09-08, "Parlay Lab Baseball 1", Josh's word, verbatim: "Core Money
 * should be calibrating itself more often. It is doing horrible. Should consider doing some
 * higher $ 2 team parlays. Hypothetically could be 2 $60 2 leg parlays one day w/ 3 $10 3-4
 * leg parlays one day, 5 $30 2 leg parlays the next, 3 $40 2 leg parlays w/ $20 3 leg parlay
 * & $10 4-5 leg parlay the next, 4 $30 2 leg parlays and a $30 3-4 leg parlay the next, $90
 * 2 leg parlay w/ $40 2 leg and $20 4 leg parlay the next, $75 2 leg parlay w/ $50 2 leg,
 * $15 3 leg and $10 5 leg parlay the next etc").
 *
 * The menu is his six examples verbatim; the rotation is by date; the tilt reads the
 * realized 2-leg vs 3+-leg record and walks half the menu when one bucket is clearly
 * better. Every case below pins a number that would otherwise be able to drift silently.
 */

const cal = (two: number | null, long: number | null, nTwo: number, nLong: number): ShapeCalibration => ({ bucketRoi: { two, long }, n: { two: nTwo, long: nLong } });

describe("CORE_SHAPES — Josh's six examples, verbatim, each exactly $150", () => {
  it("the menu is A..F in his order and every shape sums to SHAPE_TOTAL == PAPER.daily", () => {
    expect(CORE_SHAPES.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(SHAPE_TOTAL).toBe(150);
    expect(SHAPE_TOTAL).toBe(PAPER.daily);
    for (const sh of CORE_SHAPES) expect(sh.slots.reduce((a, s) => a + s.stake, 0), `${sh.id} does not sum to $150`).toBe(150);
    expect(CORE_SHAPES_SINCE).toBe("2026-09-08");
  });
  it("the slots are his numbers: stakes and leg ranges, big 2-leg slots first", () => {
    const flat = (id: string) => shapeById(id)!.slots.map((s) => `${s.stake}:${s.legs.min}-${s.legs.max}`);
    expect(flat("A")).toEqual(["60:2-2", "60:2-2", "10:3-4", "10:3-4", "10:3-4"]);
    expect(flat("B")).toEqual(["30:2-2", "30:2-2", "30:2-2", "30:2-2", "30:2-2"]);
    expect(flat("C")).toEqual(["40:2-2", "40:2-2", "40:2-2", "20:3-3", "10:4-5"]);
    expect(flat("D")).toEqual(["30:2-2", "30:2-2", "30:2-2", "30:2-2", "30:3-4"]);
    expect(flat("E")).toEqual(["90:2-2", "40:2-2", "20:4-4"]);
    expect(flat("F")).toEqual(["75:2-2", "50:2-2", "15:3-3", "10:5-5"]);
    expect(shapeById("A")!.label).toBe("2x$60 2-leg + 3x$10 3-4 leg");
    expect(shapeById("Z")).toBeNull();
  });
  it("SHAPE_TICKETS is derived from the menu (3..5) and PAPER_TICKETS reads it", () => {
    expect(SHAPE_TICKETS).toEqual({ min: 3, max: 5 });
    expect(PAPER_TICKETS).toEqual({ min: 3, max: 5 });
  });
  it("longMoney ranks the shapes by 3+-leg money: A 30, B 0, C 30, D 30, E 20, F 25", () => {
    expect(CORE_SHAPES.map((s) => longMoney(s))).toEqual([30, 0, 30, 30, 20, 25]);
    /* a 1-leg ticket is NOBODY's bucket (fix round 2026-09-08): Josh's shapes have no 1-leg
       slot, and `two` used to swallow singles and pollute the 2-leg ROI the tilt reads.
       OBSERVED RED against legBucket(1) === "two" before the fix. */
    expect(legBucket(0)).toBeNull();
    expect(legBucket(1)).toBeNull();
    expect(legBucket(2)).toBe("two");
    expect(legBucket(3)).toBe("long");
  });
  it("shapeLine / slotName print the way the ledger and the note read them", () => {
    expect(shapeLine(shapeById("A")!)).toBe("shape: 2x$60 2-leg + 3x$10 3-4 leg");
    expect(slotName({ stake: 20, legs: { min: 3, max: 3 } })).toBe("$20 3-leg slot");
    expect(slotName({ stake: 10, legs: { min: 3, max: 4 } })).toBe("$10 3-4 leg slot");
  });
});

describe("shapeForDay — deterministic rotation by date, full menu when there is no record", () => {
  it("dayIndexOf is the UTC day count; consecutive dates walk A→F and wrap", () => {
    expect(dayIndexOf("2026-09-10")).toBe(20706); // 20706 % 6 == 0 → A
    expect(dayIndexOf("not a date")).toBe(0);
    const ids = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"].map((d) => shapeForDay(d, null).shape.id);
    expect(ids).toEqual(["A", "B", "C", "D", "E", "F", "A"]);
  });
  it("is pure: the same date and record always give the same shape, with pick 'rotation' and the full menu", () => {
    const a = shapeForDay("2026-09-12", null);
    const b = shapeForDay("2026-09-12", undefined);
    expect(a.shape.id).toBe("C");
    expect(b.shape.id).toBe("C");
    expect(a.pick).toBe("rotation");
    expect(a.menu).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(a.reason).toMatch(/full rotation/);
  });
});

describe("the tilt — self-calibration off the realized 2-leg vs 3+-leg record", () => {
  it("thresholds: both buckets need ≥ 20 graded tickets and a ≥ 10-point ROI gap", () => {
    expect(TILT_MIN_N).toBe(20);
    expect(TILT_MIN_GAP).toBe(0.1);
    expect(tiltFor(null).tilt).toBeNull();
    expect(tiltFor(cal(0.2, -0.5, 19, 40)).tilt, "2-leg bucket under 20 must not tilt").toBeNull();
    expect(tiltFor(cal(0.2, -0.5, 40, 19)).tilt, "3+-leg bucket under 20 must not tilt").toBeNull();
    expect(tiltFor(cal(null, -0.5, 40, 40)).tilt, "a null ROI must not tilt").toBeNull();
    expect(tiltFor(cal(0.05, 0.0, 40, 40)).tilt, "a 5-point gap is inside the band").toBeNull();
    expect(tiltFor(cal(0.05, 0.0, 40, 40)).reason).toMatch(/inside the 10-point band/);
  });
  it("tilts toward the better bucket once the record is thick enough", () => {
    expect(tiltFor(cal(-0.18, -0.53, 50, 26)).tilt).toBe("two"); // the 09-03 diagnosis numbers
    expect(tiltFor(cal(-0.3, 0.1, 30, 30)).tilt).toBe("long");
    expect(tiltFor(cal(-0.18, -0.53, 50, 26)).reason).toMatch(/2-leg is running better by \+35%/);
  });
  it("tiltedMenu: 'two' walks B/E/F (least 3+-leg money), 'long' walks A/C/D (most), each in menu order", () => {
    expect(tiltedMenu("two").map((s) => s.id)).toEqual(["B", "E", "F"]);
    expect(tiltedMenu("long").map((s) => s.id)).toEqual(["A", "C", "D"]);
  });
  it("shapeForDay under a tilt walks the 3-shape menu by the same date index and says why", () => {
    const two = shapeForDay("2026-09-10", cal(0.1, -0.4, 30, 30)); // 20706 % 3 == 0 → B
    expect(two.shape.id).toBe("B");
    expect(two.pick).toBe("tilt:two");
    expect(two.menu).toEqual(["B", "E", "F"]);
    const long = shapeForDay("2026-09-11", cal(-0.4, 0.1, 30, 30)); // 20707 % 3 == 1 → C
    expect(long.shape.id).toBe("C");
    expect(long.pick).toBe("tilt:long");
    /* a thin record falls back to the full rotation, on the same date */
    expect(shapeForDay("2026-09-10", cal(0.1, -0.4, 5, 5)).shape.id).toBe("A");
  });
});

describe("bucketRecordFromLedger — the trailing realized record per leg bucket (ledger-stats money rules)", () => {
  const entry = (date: string, core: { id: string; stake: number; legs: number }[], grading: Record<string, { result: string; payout?: number }>, extra: Record<string, unknown> = {}) => ({
    date,
    locked: true,
    paper: true,
    core: core.map((t) => ({ id: t.id, stake: t.stake, legs: Array.from({ length: t.legs }, () => ({})) })),
    grading: { tickets: grading },
    ...extra,
  });
  it("won returns the grader's payout, lost returns 0, push returns the stake, pending/ungradable are not staked", () => {
    const rec = bucketRecordFromLedger([
      entry("2026-09-01", [{ id: "a", stake: 30, legs: 2 }, { id: "b", stake: 30, legs: 2 }, { id: "c", stake: 10, legs: 3 }, { id: "d", stake: 10, legs: 4 }, { id: "e", stake: 50, legs: 2 }], {
        a: { result: "won", payout: 66 },
        b: { result: "lost" },
        c: { result: "push" },
        d: { result: "lost" },
        e: { result: "pending" },
      }),
    ]);
    // two: staked 60, returned 66 → +10%; long: staked 20, returned 10 → −50%
    expect(rec.bucketRoi.two).toBeCloseTo(0.1, 6);
    expect(rec.bucketRoi.long).toBeCloseTo(-0.5, 6);
    expect(rec.n).toEqual({ two: 2, long: 2 });
    expect(rec.window).toBe("2026-09-01..2026-09-01");
  });
  it("honors the date window and skips non-paper, unlocked, and ungraded entries", () => {
    const rec = bucketRecordFromLedger(
      [
        entry("2026-08-01", [{ id: "old", stake: 10, legs: 2 }], { old: { result: "won", payout: 30 } }),
        entry("2026-08-20", [{ id: "in", stake: 10, legs: 2 }], { in: { result: "lost" } }),
        entry("2026-08-21", [{ id: "real", stake: 10, legs: 2 }], { real: { result: "won", payout: 30 } }, { paper: false }),
        entry("2026-08-22", [{ id: "open", stake: 10, legs: 2 }], { open: { result: "won", payout: 30 } }, { locked: false }),
        entry("2026-09-09", [{ id: "late", stake: 10, legs: 2 }], { late: { result: "won", payout: 30 } }),
      ],
      { from: "2026-08-10", to: "2026-09-08" },
    );
    expect(rec.n).toEqual({ two: 1, long: 0 });
    expect(rec.bucketRoi.two).toBe(-1);
    expect(rec.bucketRoi.long).toBeNull();
  });
  it("a 1-leg ticket never reaches the 2-leg record — singles are skipped, not bucketed as `two`", () => {
    /* OBSERVED RED before the fix: the $40 winning single landed in `two` and turned a
       losing 2-leg record (−100%) into a +40% one, which would have tilted the shape. */
    const rec = bucketRecordFromLedger([
      entry("2026-09-01", [{ id: "single", stake: 40, legs: 1 }, { id: "pair", stake: 30, legs: 2 }, { id: "trio", stake: 10, legs: 3 }], {
        single: { result: "won", payout: 98 },
        pair: { result: "lost" },
        trio: { result: "won", payout: 25 },
      }),
    ]);
    expect(rec.n).toEqual({ two: 1, long: 1 });
    expect(rec.bucketRoi.two).toBe(-1);
    expect(rec.bucketRoi.long).toBeCloseTo(1.5, 6);
  });
  it("an empty ledger is a null record — the picker then runs the full rotation", () => {
    const rec = bucketRecordFromLedger([]);
    expect(rec).toEqual({ bucketRoi: { two: null, long: null }, n: { two: 0, long: 0 }, window: null });
    expect(shapeForDay("2026-09-10", rec).pick).toBe("rotation");
  });
});

describe("slotMaxDec — the per-slot price ceiling (CORE_RULES, INSTRUCTION 46 override)", () => {
  it("2-leg slots keep 2.6 (gated) / 1.75 (forced); 3+-leg slots compound 1.75 per leg", () => {
    expect(CORE_RULES.shapedSince).toBe("2026-09-08");
    expect(CORE_RULES.longLegDec).toBe(1.75);
    expect(slotMaxDec({ min: 2, max: 2 })).toBe(2.6);
    expect(slotMaxDec({ min: 2, max: 2 }, "forced")).toBe(1.75);
    expect(slotMaxDec({ min: 3, max: 3 })).toBe(5.36);
    expect(slotMaxDec({ min: 3, max: 4 })).toBe(9.38);
    expect(slotMaxDec({ min: 4, max: 5 })).toBe(16.41);
    expect(slotMaxDec({ min: 5, max: 5 }, "forced")).toBe(16.41);
  });
});
