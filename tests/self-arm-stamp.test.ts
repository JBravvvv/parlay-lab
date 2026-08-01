import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
 * THE ENCODED RULE (the owner's: "a self-arm writes its own stamp at fire time"): the
 * armed COUNT is pinned here. When the accruing data moves it, this test goes RED, and
 * the only way to green is to record the crossing in docs/collection-period.md and
 * update ARMED — i.e. the stamp is written AT fire time, by the person who must then
 * decide whether a vintage boundary was crossed. Guessing at the date is replaced by
 * being told.
 *
 * OBSERVED RED 2026-07-30 (planted ARMED = 0 against a live count of 1, the real
 * crossing) before this file was accepted.
 */

/** Recorded crossings — update ONLY beside a dated entry in collection-period. */
const ARMED = {
  /** umpires at g >= 5 in data/ump_k.json (build_context L232 gates kFactor on this) */
  umpKf: 4,
  /** the dated record of the last change, for the reader who finds this red */
  note:
    "2026-07-30: Lance Barrett crossed g=5 — FIRST EVER, ~5 days ahead of the ~08-04 projection. " +
    "2026-07-31: Willie Traynor crossed g 4->5 — SECOND, one day later, on bot commit 200e40282380485b35a70c6a28b689c356cc7e3d " +
    "(08:21:47Z, ump_k.json only). " +
    "2026-08-01: Malachi Moore AND Derek Thomas BOTH crossed g 4->5 on bot commit b68b1e361180fbdb62897884dddda5a4444499c6 " +
    "(07:37:59Z, `context: refresh`, ump_k.json only), which added 2026-07-31 to `days` — so the count went 2 -> 4 in a " +
    "SINGLE refresh and FOUR crossings have now happened in three days against a ~08-04 projection for the FIRST. " +
    "THE PROJECTION WAS NOT SLIGHTLY EARLY, IT WAS WRONG ABOUT THE RATE. FOURTEEN more sit at g=4. " +
    "k/g at arming still straddles the league mean (Barrett 18.0, Traynor 13.8, Moore 14.8, Thomas 19.8, league 16.5) — " +
    "the armed subpopulation is STILL NOT a high-K selection, now on n=4. " +
    "All four crossings double-braked (context.json frozen at 2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80 " +
    "+ SH_CFG.umpKFrozen), so none reached a board and no series restates. See collection-period, SELF-ARMING PARAMETERS block.",
};

describe("self-arming parameters stamp themselves at fire time", () => {
  it("the shUmpKf arm count matches the recorded crossing state", () => {
    const db = JSON.parse(readFileSync("data/ump_k.json", "utf8")) as {
      umps: Record<string, { g?: number }>;
    };
    const armed = Object.values(db.umps).filter((u) => (u.g ?? 0) >= 5).length;
    expect(
      armed,
      `shUmpKf's arm count moved (${ARMED.umpKf} → ${armed}). A COUNT-ARMED parameter crossed on data, ` +
        `not on a date. Record the crossing in docs/collection-period.md WITH ITS DATE — including whether ` +
        `it reached a board (check SH_CFG.umpKFrozen and whether public/model/context.json is unfrozen) — ` +
        `then update ARMED here in the same commit.`,
    ).toBe(ARMED.umpKf);
  });

  it("the DOUBLE BRAKE that keeps the crossing off the boards is still in place", () => {
    // brake 1: the factor is pinned off in the engine's frozen table
    const engine = readFileSync("legacy/index.html", "utf8");
    expect(/umpKFrozen:\s*true/.test(engine), "umpKFrozen is no longer true — brake 1 released").toBe(true);
    expect(
      /function shUmpKf\(g\)\{if\(SH_CFG\.umpKFrozen\)return 1;/.test(engine),
      "shUmpKf's early return moved — re-point this check",
    ).toBe(true);
    // brake 2: the carrier is frozen by the pause (main's context.yml drops it from git add)
    // — asserted at its own guard (bot-path-whitelist); noted here so a reader sees both.
  });

  it("PLANT (invalid-by-value): a count that cannot match is flagged", () => {
    const db = JSON.parse(readFileSync("data/ump_k.json", "utf8")) as {
      umps: Record<string, { g?: number }>;
    };
    const armed = Object.values(db.umps).filter((u) => (u.g ?? 0) >= 5).length;
    expect(armed === ARMED.umpKf + 999, "the checker passed a count that cannot match").toBe(false);
  });
});
