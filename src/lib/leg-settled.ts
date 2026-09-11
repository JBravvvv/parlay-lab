import { lineOf } from "@/lib/pred-serialize";

/**
 * IS THIS LEG ALREADY DECIDED BY THE LIVE TALLY? (INSTRUCTION 50, 2026-09-11)
 *
 * Josh, verbatim: "It's not updating with live odds; it will show the player is top 4th
 * w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI when their live
 * over/under is 3.5 H+R+RBI".
 *
 * The app already held both halves of that sentence on the same render — the live tally
 * (`currentValue`/`useLiveNow`) and the leg's line (inside the lkey) — and never compared
 * them. The grade chip is `gradeFromEv(czEv)`: a pure threshold on a number computed
 * PREGAME, with no game-state, clock or line input. So a player three-for-three against a
 * 0.5 line still renders the pregame grade as if the bet were live and open.
 *
 * This module is the missing comparison, and nothing more. It is deliberately tiny, pure
 * and client-safe (no React, no fetch, no Date) so every surface can ask the same question
 * and get the same answer.
 *
 * WHAT IT CAN PROVE, AND WHAT IT REFUSES TO
 * All six MLB prop markets this app prices — hits, total bases, home runs, H+R+RBI,
 * pitcher strikeouts, pitcher outs — are monotone non-decreasing counting stats: the
 * number can only go up for the rest of the game. So `cur > line` is a PROOF, available
 * free at any moment of any game, that the Over has won and the Under has lost.
 *
 * The converse is NOT provable and is never claimed. `cur <= line` means undecided —
 * the player can still get there — so this returns null, always. `cur === line` is not a
 * push either (one more hit clears it); it is simply undecided. A leg the app has not
 * observed a number for (`val == null`) is likewise undecided, never treated as a zero.
 *
 * It also does NOT know the current market price. Saying "the live line is 3.5 at -145"
 * would need a paid per-event in-play re-pull; until Josh authorises that spend, the
 * honest statement is the one this enables: the number has cleared the line, and the
 * price on screen is the pregame lock, not a live market.
 */

/** The only verdict this module will ever return: the live tally is past the line. */
export type LegSettledCode = "over-cleared";

/** Which way the leg was taken, read exactly as the grader reads it. */
export type LegSide = "O" | "U";

/**
 * The markets whose stat is monotone non-decreasing, i.e. the ones `cur > line` decides.
 * This is exactly the set `currentValue` extracts a tally for in `src/engine2/grade.ts`
 * (ml_/rl_ legs have no counting stat and never reach here). `tests/leg-settled.test.ts`
 * re-reads that file and fails if the two ever drift apart, so the list cannot rot.
 */
export const MONOTONE_MARKETS: ReadonlySet<string> = new Set([
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
]);

/** The market segment of a prop lkey (`player|market|line`); null for ml_/rl_ and junk. */
function marketOf(lkey: string | null | undefined): string | null {
  const parts = String(lkey ?? "").split("|");
  return parts.length === 3 ? parts[1] : null;
}

export type LegSettledRead = {
  code: LegSettledCode;
  side: LegSide;
  line: number;
  val: number;
  /** Plain language for the surface that suppresses the pregame grade. */
  why: string;
};

/**
 * The full read: the verdict plus the numbers behind it, for copy that quotes real values.
 * Returns null whenever the leg is undecided — see the module note.
 */
export function settledRead(
  lkey: string | null | undefined,
  sub: string | null | undefined,
  val: number | null | undefined,
): LegSettledRead | null {
  const mkt = marketOf(lkey);
  if (!mkt || !MONOTONE_MARKETS.has(mkt)) return null; // ml_/rl_ and anything non-counting
  const ln = lineOf(lkey ?? null);
  if (ln == null) return null;
  if (val == null || !Number.isFinite(val)) return null; // no observed number → undecided
  if (!(val > ln)) return null; // at or under the line the leg can still go either way
  /* TWO SUB GRAMMARS, ONE READ (INSTRUCTION 50 fix pass). The grader and the board write
     " O " / " U " (`src/engine2/grade.ts`, gradePrediction; app/api/picks/route.ts emits
     `side: r.sub`), while `playerLeg` composes the Parlay Builder's subs as "H+R+RBI Under
     1.5" (src/components/props/props-model.ts). The narrow / U / test read that second
     grammar as an Over, which would have printed "this Over is decided won" over an Under.
     Both spellings are covered here.

     The side is used for WORDING ONLY — the verdict above does not depend on it, because a
     cleared line settles the Over won and the Under lost at the same instant. A misread side
     can therefore never turn an undecided leg into a settled one. */
  const side: LegSide = /(^|\s)U(nder)?(\s|$)/.test(String(sub ?? "")) ? "U" : "O";
  return {
    code: "over-cleared",
    side,
    line: ln,
    val,
    why: `already ${val} vs a ${ln} line — this ${side === "U" ? "Under is decided lost" : "Over is decided won"}`,
  };
}

/**
 * The predicate the surfaces call: "over-cleared" when the live tally has passed the
 * leg's line (so the pregame grade and price on screen are stale), null otherwise.
 */
export function legSettled(
  lkey: string | null | undefined,
  sub: string | null | undefined,
  val: number | null | undefined,
): LegSettledCode | null {
  return settledRead(lkey, sub, val)?.code ?? null;
}
