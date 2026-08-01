import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * SELF-ARM STAMP GUARD (2026-07-30, owner's item 2 — "count-armed parameters fire on
 * data, not on dates, so their vintage events are unstampable in advance").
 *
 * THE GAP IT CLOSES: `consMinEv`'s expiry was DATE-armed and we caught it on the
 * calendar. `shUmpKf` is COUNT-armed — `tools/build_context.py` L232 emits a real
 * `kFactor` only for umpires with `g >= 5`, and that count accrues from the games being
 * played. Nobody can calendar the crossing, and on 2026-07-30 the first umpire (Lance
 * Barrett, g 4 → 5) crossed it FIVE DAYS AHEAD of the ~08-04 projection — silently, with
 * no parameter change and no deploy. It reached no board (two brakes: the frozen
 * `context.json` carrier and `SH_CFG.umpKFrozen`), but nothing recorded the crossing.
 *
 * THE ENCODED RULE (the owner's: "a self-arm writes its own stamp at fire time"): when
 * the accruing data crosses, this test goes RED, and the only way to green is to record
 * the crossing in docs/collection-period.md and append it here — i.e. the stamp is
 * written AT fire time, by the person who must then decide whether a vintage boundary
 * was crossed. Guessing at the date is replaced by being told.
 *
 * OBSERVED RED 2026-07-30 (planted ARMED = 0 against a live count of 1, the real
 * crossing) before this file was accepted.
 *
 * ── DEMOTED 2026-08-01 (owner's item 1; INSTRUMENT DEFECT #7) ────────────────────────
 * THE DEFECT IN THE ORIGINAL: the assertion was `live count === ARMED.umpKf`, and the
 * crossing record was PROSE in `ARMED.note` that nothing read. Deleting a crossing from
 * the record therefore left the guard GREEN — the live count comes from
 * `data/ump_k.json` and does not move when the prose does. It proved a number, and the
 * number was not the thing that had to survive.
 *
 * MEASURED 2026-08-01, on the original guard, before this file replaced it: Willie
 * Traynor's dated crossing deleted from `ARMED.note` while he remained armed in the data
 * at `{"g":5,"k":69}` → **3 passed, 0 failed.** The record lost a crossing and the
 * instrument said nothing.
 *
 * WHAT REPLACES IT:
 *   - the COUNT is INFORMATIONAL — printed, never equality-asserted. A count that only
 *     rises is not news; an UNRECORDED crossing is.
 *   - COMPLETENESS is the assertion: every umpire at g >= 5 must carry a dated entry,
 *     and the failure NAMES the umpire instead of reporting a delta.
 *   - APPEND-ONLY is a monotone FLOOR: CROSSINGS.length may rise, never fall.
 *   - the DOUBLE BRAKE stays a hard assertion, unchanged in strength.
 *
 * OBSERVED RED 2026-08-01, both run and printed before acceptance:
 *   (a) Traynor entry deleted → COMPLETENESS red naming "Willie Traynor", FLOOR red at
 *       3 < 4. Two failures, one edit. The original guard is GREEN on this same edit
 *       (measured above) — that is the capture this demotion buys.
 *   (b) `umpKFrozen: false` in legacy/index.html → the brake test red.
 *
 * ⚠️ THE RESIDUAL THIS DOES NOT CLOSE (owner's item 1, named rather than fixed): a
 * crossing that is RECORDED BUT WRONG. `date` is checked for SHAPE only (a regex), never
 * against the commit that carried it; `commit` is never resolved; `braked: true` asserts
 * only that the RECORD claims a brake, not that a brake held. A crossing entered with the
 * wrong date, the wrong sha, or `braked: true` when it actually reached a board is GREEN
 * here. Only `braked: false` is caught, and only because it contradicts the record's own
 * claim. Closing it needs a git join (resolve `commit`, assert it touches
 * `data/ump_k.json`, assert its author date equals `date`) — SPEC, NOT SHIPPED.
 */

/**
 * APPEND-ONLY CROSSING RECORD. APPEND entries; never edit or remove one. Each is written
 * AT fire time by whoever finds this red, beside the dated entry in
 * docs/collection-period.md (SELF-ARMING PARAMETERS block).
 */
const CROSSINGS = [
  {
    ump: "Lance Barrett",
    date: "2026-07-30",
    // NOT CAPTURED — this crossing predates the record. The DATE is the record; the
    // commit is not, and is left null rather than reconstructed.
    commit: null,
    kPerG: 18.0,
    braked: true,
    note: "FIRST EVER, ~5 days ahead of the ~08-04 projection.",
  },
  {
    ump: "Willie Traynor",
    date: "2026-07-31",
    commit: "200e40282380485b35a70c6a28b689c356cc7e3d",
    kPerG: 13.8,
    braked: true,
    note: "SECOND, one day later. Bot commit 08:21:47Z, ump_k.json only.",
  },
  {
    ump: "Malachi Moore",
    date: "2026-08-01",
    commit: "b68b1e361180fbdb62897884dddda5a4444499c6",
    kPerG: 14.8,
    braked: true,
    note:
      "THIRD. Same refresh as Derek Thomas — 07:37:59Z, `context: refresh`, ump_k.json " +
      "only, which added 2026-07-31 to `days`. The count went 2 -> 4 in ONE commit.",
  },
  {
    ump: "Derek Thomas",
    date: "2026-08-01",
    commit: "b68b1e361180fbdb62897884dddda5a4444499c6",
    kPerG: 19.8,
    braked: true,
    note: "FOURTH. Same commit as Malachi Moore.",
  },
] as const;

/** Monotone floor. RAISE it in the same commit that appends. NEVER lower it. */
const FLOOR = 4;

/** About the SERIES, not any one crossing — kept out of the per-entry notes. */
const RATE =
  "FOUR crossings in three days against a ~08-04 projection for the FIRST. THE PROJECTION " +
  "WAS NOT SLIGHTLY EARLY, IT WAS WRONG ABOUT THE RATE. Fourteen more sit at g=4. k/g at " +
  "arming still straddles the league mean (18.0 / 13.8 / 14.8 / 19.8 vs league 16.5): the " +
  "armed subpopulation is STILL NOT a high-K selection, now on n=4. All four double-braked " +
  "(context.json frozen at 2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80 " +
  "+ SH_CFG.umpKFrozen), so none reached a board and no series restates.";

function armedUmps(): string[] {
  const db = JSON.parse(readFileSync("data/ump_k.json", "utf8")) as {
    umps: Record<string, { g?: number; k?: number }>;
  };
  return Object.entries(db.umps)
    .filter(([, u]) => (u.g ?? 0) >= 5)
    .map(([name]) => name);
}

describe("self-arming parameters stamp themselves at fire time", () => {
  it("INFORMATIONAL: the shUmpKf arm count (asserts nothing about the number)", () => {
    const armed = armedUmps();
    console.log(
      `[self-arm] shUmpKf armed: ${armed.length} at g>=5 — ${armed.join(", ")}. ` +
        `Recorded crossings: ${CROSSINGS.length} (floor ${FLOOR}). ${RATE}`,
    );
    expect(Array.isArray(armed)).toBe(true);
  });

  it("COMPLETENESS: every armed umpire has a dated crossing entry", () => {
    const recorded = new Set<string>(CROSSINGS.map((c) => c.ump));
    const missing = armedUmps().filter((u) => !recorded.has(u));
    expect(
      missing,
      `A COUNT-ARMED parameter crossed on data, not on a date, and NOTHING RECORDED IT: ` +
        `${missing.join(", ")}. Record each in docs/collection-period.md WITH ITS DATE — ` +
        `including whether it reached a board (check SH_CFG.umpKFrozen and whether ` +
        `public/model/context.json is unfrozen) — then APPEND to CROSSINGS and RAISE FLOOR ` +
        `in the same commit.`,
    ).toEqual([]);
  });

  it("APPEND-ONLY: the record never shrinks and every entry carries a date", () => {
    expect(
      CROSSINGS.length,
      `the crossing record LOST entries (${CROSSINGS.length} < floor ${FLOOR}). A past ` +
        `crossing is a fact about a day that already happened; it cannot be un-recorded.`,
    ).toBeGreaterThanOrEqual(FLOOR);
    for (const c of CROSSINGS) {
      expect(c.date, `crossing for ${c.ump} carries no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the DOUBLE BRAKE that keeps the crossing off the boards is still in place", () => {
    /* STRIP COMMENTS FIRST — and this is a FALSE NEGATIVE, the dangerous direction.
       MEASURED 2026-08-01, on this guard, hours after it shipped: `umpKFrozen:false,`
       in the code with `/* was umpKFrozen:true *​/` beside it → **6 passed**. The brake
       was RELEASED and the brake guard said nothing, because it greps a raw string and a
       comment carries that string. A presence assertion over unstripped source is
       satisfiable by prose. Third instance of comment-read-as-code; the first two were
       false POSITIVES, which only cost noise. See tests/helpers/source.ts. */
    const engine = stripComments(readFileSync("legacy/index.html", "utf8"));
    expect(/umpKFrozen:\s*true/.test(engine), "umpKFrozen is no longer true — brake 1 released").toBe(true);
    expect(
      /function shUmpKf\(g\)\{if\(SH_CFG\.umpKFrozen\)return 1;/.test(engine),
      "shUmpKf's early return moved — re-point this check",
    ).toBe(true);
    // brake 2: the carrier is frozen by the pause (main's context.yml drops it from git add)
    // — asserted at its own guard (bot-path-whitelist); noted here so a reader sees both.
    expect(
      CROSSINGS.every((c) => c.braked),
      "a crossing is RECORDED as unbraked — it reached a board and a series may restate",
    ).toBe(true);
  });

  it("PLANT (invalid-by-value): an unrecorded armed umpire is NAMED, not just counted", () => {
    const recorded = new Set<string>(CROSSINGS.map((c) => c.ump));
    const missing = ["__NOT_AN_UMPIRE__", ...armedUmps()].filter((u) => !recorded.has(u));
    expect(missing, "the completeness check failed to name a planted unrecorded crossing").toContain(
      "__NOT_AN_UMPIRE__",
    );
  });

  it("PLANT (invalid-by-value): a shortened record fails the floor", () => {
    expect(
      CROSSINGS.slice(0, FLOOR - 1).length >= FLOOR,
      "the floor admitted a truncated record",
    ).toBe(false);
  });
});
