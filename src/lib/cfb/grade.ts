import { decFromAmerican } from "@/engine2/devig";
import { CFB_LEAGUE } from "@/lib/cfb/rules";
import type { CfbFinals, CfbGrade, CfbLedgerEntry, CfbTicketLeg } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * CFB GRADING (INSTRUCTION 38, 2026-09-05) — pure, from ESPN final scores to ticket results.
 * A leg is graded exactly the way the book settles it: moneyline by the winner, spread by
 * the side's margin plus its line (> 0 won, = 0 push, < 0 lost), total by the sum against
 * the number. A ticket wins only when every non-push leg wins; a pushed leg drops out of the
 * payout (stake × Π dec of the legs that stood); every leg pushing hands the stake back.
 * Pending while any leg's game is not final; ungradable when a leg is STILL pending 48 hours
 * after its kickoff, whatever ESPN last said about the game — a void, never a guess. The score
 * is ESPN's; nothing here invents one.
 *
 * ONE EXCEPTION TO THE 48 HOURS (2026-09-06, INSTRUCTION 45, DEFECT C1): a leg whose game IS
 * final but whose score is unreadable waits CFB_VOID_RECHECK_MS instead, because there the result
 * exists and only our read of it failed. See `voidWindowMs` below for the measurement and the
 * money. And a void, whichever window produced it, is PROVISIONAL rather than terminal: a real
 * final arriving later grades the leg from the score, at any distance past the window.
 *
 * "UNREADABLE" IS DECIDED BY `readScore`, NOT BY `Number` (2026-09-06, INSTRUCTION 45, DEFECT C1,
 * SECOND HALF). `Number(null)` and `Number("")` are both 0, so a null- or blank-scored final used
 * to grade as a genuine nil-all TIE and PUSH — the one wrong verdict neither overlay will ever
 * replace. A finite number (0 INCLUDED — a real 0-0 is a real tie) or a numeric string is a score;
 * everything else is a failed read. See `readScore` for the measurement and the money.
 *
 * ONE GRADER, TWO LEAGUES (2026-09-08, the NFL build). The two windows above are read from the
 * league config handed to `gradeCfbEntry` — `cfg.ungradableMs` (48 h on both desks today) and
 * `cfg.voidRecheckMs` (7 d on both) — with CFB_LEAGUE as the default for the component layer. The
 * void detail prints the window it applied ("48h" / "7d") from the number, so a league that moves
 * its window prints the window it actually used. CFB_UNGRADABLE_MS stays exported for the callers
 * that pin the CFB constant.
 */

export type CfbLegResult = { result: "won" | "lost" | "push" | "pending" | "ungradable"; detail: string };

export const CFB_UNGRADABLE_MS = 48 * 3600_000;

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/**
 * READING ONE SCORE OFF A FINALS ENTRY (INSTRUCTION 45, 2026-09-06, DEFECT C1 — the money critic's
 * pass). The only place in this file a value that came from OUTSIDE the desk is turned into a
 * number, and the reason it is a function rather than a `Number()` call.
 *
 * WHAT WENT WRONG. `gradeCfbLeg` read the score as `Number(f.home)` and accepted it when
 * `Number.isFinite` said yes. `Number(null)` is 0 and 0 is finite, so a final whose scores are
 * JSON null graded as a genuine nil-all TIE. MEASURED (the probe in tests/cfb-grade.test.ts, "C1:
 * JSON-null scores are UNREADABLE, not a real 0-0"): a $25 core moneyline single with `{ home:
 * null, away: null, final: true, status: "final" }` at kickoff + 1 h returned the leg `{ result:
 * "push", detail: "0-0 · tie" }` and the ticket `{ result: "push", payout: 25, dec: 1 }`, `done`
 * true.
 *
 * WHY A PUSH WAS THE WORST OF THE WRONG ANSWERS — it was the one that could never be corrected.
 * `push` is a member of the SETTLED set on BOTH overlays (`SETTLED` in src/lib/cfb/store.ts and
 * the one in src/lib/cfb/lock-server.ts, each `new Set(["won", "lost", "push"])`), and a SETTLED
 * verdict is never overwritten, so no later grading could replace it. `done` true with no void in
 * the day made `cfbSettleCandidate` (src/lib/cfb/lock-server.ts) return false — its window then
 * only opened for a ticket whose result is `ungradable` — so the server never read that date
 * again, and `gradeCfbPending` (src/components/cfb/CfbLedger.tsx) filters `!e.grading?.done`, so
 * the phone never revisits it either. `ticketPL` (src/lib/bankroll.ts) pays out only `won` and
 * `lost` and returns 0 for everything else. A real winner or loser was therefore booked at $0 P/L
 * PERMANENTLY, and cfbBankroll — which Kelly-sizes every later day — was low by that amount for
 * ever. The 48-hour void at least stayed a candidate; this shape closed the door behind it.
 *
 * (THE TENSE ABOVE IS DELIBERATE — CORRECTED 2026-09-06, DEFECT C1, THE CORRECTION HALF. The fix
 * in THIS file is forward-only: nothing will book the verdict again, and every day already booked
 * stayed mis-scored under exactly the rule just described. The SERVER rail now carries one narrow
 * exception to it — `zeroReadTicket` in src/lib/cfb/lock-server.ts lets a CORROBORATED later final
 * replace a stored `push` whose LEG line records the 0-0 read, and `cfbSettleCandidate` keeps such
 * a date readable for CFB_VOID_RECHECK_MS so something still asks for that final. The DEVICE
 * overlay in src/lib/cfb/store.ts has NO such exception, so every sentence above still describes
 * the phone exactly; the corrected verdict reaches it from the cloud on sync. Nothing in this file
 * changed for it: the exception is keyed to the stored bytes of a booked verdict, which is not
 * something a grader reads.)
 *
 * THE SAME BLIND SPOT SAT INSIDE THE GUARD BUILT FOR IT. `voidWindowMs` below tested
 * `Number.isFinite(Number(f.home))`, which is TRUE for null, so the seven-day window written for
 * exactly the meaning "the result exists and our read of it failed" did not cover the null shape
 * next to it. Both call sites now go through this function, which is why it exists: one reading
 * of "is this a score" cannot drift away from the other.
 *
 * WHAT COUNTS AS READABLE. A finite `number` — INCLUDING 0, because a real 0-0 final is a real
 * tie and must still push — or a non-blank string that parses finite, because ESPN's
 * `competitor.score` is a string upstream. Everything else is UNREADABLE and produces the pending
 * "score unavailable" verdict: null, undefined, `""` and whitespace (`Number("")` is 0, the same
 * silent zero as `Number(null)`), NaN, ±Infinity, booleans, arrays, objects. Falsiness is not the
 * test — readability is.
 *
 * LIVE REACH, stated honestly rather than assumed away: `finalsOf` (src/lib/cfb/slate-server.ts)
 * already skips a final whose `homeScore` or `awayScore` is null, so the ESPN path narrows this —
 * but a persisted, merged or hand-built finals map reaches `gradeCfbEntry` directly, and the
 * `CfbFinals` type declaring `home: number` (src/lib/cfb/types.ts) is documentation, not
 * enforcement. The grader is the last line, so the grader checks.
 */
function readScore(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


export function gradeCfbLeg(leg: CfbTicketLeg, f: CfbFinals[string] | undefined): CfbLegResult {
  if (!f) return { result: "pending", detail: "no final yet" };
  if (!f.final) return { result: "pending", detail: f.status === "postponed" ? "postponed" : "not final" };
  const home = readScore(f.home);
  const away = readScore(f.away);
  if (home === null || away === null) return { result: "pending", detail: "score unavailable" };
  const score = `${home}-${away}`;

  if (leg.market === "ml") {
    const margin = leg.side === "home" ? home - away : away - home;
    if (margin > 0) return { result: "won", detail: `${score} · won by ${margin}` };
    if (margin < 0) return { result: "lost", detail: `${score} · lost by ${-margin}` };
    return { result: "push", detail: `${score} · tie` };
  }

  if (leg.market === "spread") {
    if (leg.line == null) return { result: "ungradable", detail: `${score} · spread leg has no line` };
    const margin = leg.side === "home" ? home - away : away - home;
    const v = margin + leg.line;
    const detail = `${score} · margin ${signed(margin)} vs ${signed(leg.line)}`;
    if (v > 0) return { result: "won", detail: `${detail} · covered by ${v}` };
    if (v < 0) return { result: "lost", detail: `${detail} · short by ${-v}` };
    return { result: "push", detail: `${detail} · push` };
  }

  if (leg.line == null) return { result: "ungradable", detail: `${score} · total leg has no line` };
  const sum = home + away;
  const v = leg.side === "over" ? sum - leg.line : leg.line - sum;
  const detail = `${score} · total ${sum} vs ${leg.line}`;
  if (v > 0) return { result: "won", detail: `${detail} · ${leg.side} by ${v}` };
  if (v < 0) return { result: "lost", detail: `${detail} · ${leg.side} missed by ${-v}` };
  return { result: "push", detail: `${detail} · push` };
}

/**
 * HOW LONG THIS LEG'S PENDING IS ALLOWED TO LAST BEFORE IT IS A VOID (INSTRUCTION 45, 2026-09-06,
 * DEFECT C1 — the regression the 48-hour widening left behind).
 *
 * DEFECT I(a) widened the escalation in `gradeCfbEntry` from "absent or postponed" to "any leg
 * still pending past CFB_UNGRADABLE_MS". That was right and is not reverted here: it is what ends
 * the unbounded per-poke ESPN read on a game ESPN parks at `live` for ever. But it swept in a
 * FOURTH pending shape nobody re-read — the arm in `gradeCfbLeg` that returns `{ result:
 * "pending", detail: "score unavailable" }` when `f.final` is TRUE and `readScore(f.home)` /
 * `readScore(f.away)` come back null. Under the old status-based gate that leg stayed pending and
 * was simply re-graded on the next poke; under the clock-based gate it voids at 48 h.
 *
 * (CITATION CORRECTED 2026-09-06, DEFECT C1 SECOND HALF: this paragraph said "`Number(f.home)` /
 * `Number(f.away)` are not finite", which is what the code said then and no longer says. The test
 * moved to `readScore` precisely because `Number` called null and `""` finite zeros — and the
 * guard BELOW carried the same `Number.isFinite(Number(...))` test, so the long window this
 * docblock argues for did not actually cover the null shape. Both now ask `readScore`.)
 *
 * WHY THAT ONE CASE IS DIFFERENT. Every other pending shape means the result does not exist yet —
 * no entry, not final, postponed — and after two days "nothing will ever score this" is the honest
 * verdict, which is what the void is for. `final: true` with an unreadable score says the opposite:
 * the RESULT EXISTS and only our read of it failed. Voiding it at 48 h throws away a real P/L.
 *
 * MEASURED (the probe in tests/cfb-grade.test.ts, "C1: a game that IS final but whose score is
 * unreadable"): a $25 core single on G1 at kickoff + 49 h, with `{ home: undefined, away:
 * undefined, final: true, status: "final" }`, graded `{ result: "ungradable", detail: "score
 * unavailable · 48h past kickoff — void" }` and `done: true`. `done` is the trap: `ticketPL`
 * (src/lib/bankroll.ts) pays out only `won` and `lost` and falls through to `return 0` for
 * everything else, so an ungradable ticket books as a wash — and NOTHING asks again. The server
 * keeps a voided date readable only while `cfbSettleCandidate` (src/lib/cfb/lock-server.ts)
 * allows it, and the device path never revisits a done entry at all because `gradeCfbPending`
 * (src/components/cfb/CfbLedger.tsx — NOT store.ts, which only documents the rule) filters
 * `!e.grading?.done` before it will fetch finals for a date. So a game whose score ESPN publishes
 * correctly on day 8 is scored $0 permanently, and cfbBankroll — which Kelly-sizes every later
 * day — is low by that amount for ever.
 *
 * THE SHAPE OF THE FIX: keep the clock, change only the length of it for this one shape. The
 * final-but-unreadable leg gets CFB_VOID_RECHECK_MS (./rules), which is exactly the window the
 * server already holds a voided date open for, so the desk cannot be waiting for a result the
 * settle pass has stopped fetching. It still terminates — this is a longer bound, not the absence
 * of one — and every other pending shape keeps the 48 hours untouched.
 *
 * WHAT THE LONGER WINDOW COSTS, AND THE DECISION TO PAY IT (INSTRUCTION 45, 2026-09-06, DEFECT C2
 * — a cost this round introduced, not a defect). Returning CFB_VOID_RECHECK_MS instead of
 * CFB_UNGRADABLE_MS keeps a final-but-unreadable date `done: false` for FIVE EXTRA DAYS
 * (CFB_VOID_RECHECK_MS is 7 * 24 * 3600_000 in src/lib/cfb/rules.ts; CFB_UNGRADABLE_MS is
 * 48 * 3600_000 above), and two re-read queues hold it for exactly that long:
 *
 *   THE SERVER. `settlePass` (app/api/cfb/lock/route.ts) selects on `cfbSettleCandidate`
 *   (src/lib/cfb/lock-server.ts), whose FIRST test is `if (grading?.done !== true) return true` —
 *   unconditional, no window. So the date is a candidate for the whole five extra days. Each
 *   selected date costs at most ONE keyless ESPN scoreboard read — `finalsFromEspn`
 *   (src/lib/cfb/slate-server.ts) builds its board with `oddsEvents: []` — and ZERO Odds API
 *   credits; never a game-lines pull, which only the lock and top-up paths can buy. It is also
 *   capped: `CFB_SETTLE.maxDatesPerPoke` is 2 (src/lib/cfb/rules.ts).
 *
 *   THE PHONE. `gradeCfbPending` (src/components/cfb/CfbLedger.tsx) filters `!e.grading?.done`, so
 *   the date stays one more iteration of that queue's `for` loop for the same five days.
 *
 * THE ARITHMETIC, both bounds stated rather than the flattering one. vercel.json declares two
 * crons ("45 21 * * *" and "0 0 * * *"), so the guaranteed scheduled rail is 2 pokes/day → at most
 * 2 × 5 = 10 extra keyless ESPN reads per affected date, 0 credits. If the ~15-minute pulse
 * src/lib/cfb/rules.ts describes is driven by an external ticker as well, the ceiling is 96
 * pokes/day → at most 96 × 5 = 480 extra keyless reads per affected date, still 0 credits. And
 * only a date carrying this one rare shape pays anything: a date with no unreadable final reaches
 * `done` on its own schedule and is never re-read, which is the steady state for every ordinary
 * Saturday.
 *
 * DECIDED: ACCEPT THE COST, DO NOT THROTTLE. Two reasons. (1) The money is lopsided by orders of
 * magnitude — the ceiling is 480 keyless reads of a public scoreboard against a $25 core ticket
 * booked at $0 P/L for ever and a cfbBankroll that Kelly-sizes every later day off the wrong
 * number. (2) The queue that would carry a slower cadence is not this file's: the tier lives in
 * `settlePass`'s sort (app/api/cfb/lock/route.ts), which already sorts a date read on THIS poke to
 * the BACK on `attemptedAt` — so a date in the extended window is ALREADY the last thing reached
 * within the 2-date budget and cannot starve a fresher date. Adding a second throttle on top of
 * that tier would be a new front for a cost that is measured in free reads. The window itself is
 * untouchable in either direction: it exists to stop a real result being booked at $0.
 *
 * `status === "postponed"` is excluded from the long window deliberately: a payload claiming both
 * `final: true` and `postponed` is contradictory, and the desk resolves the contradiction the
 * conservative way — postponed is a game that did not happen, so it takes the short window.
 */
function voidWindowMs(f: CfbFinals[string] | undefined, cfg: LeagueConfig): number {
  const finalButUnreadable =
    !!f && f.final === true && f.status !== "postponed" && (readScore(f.home) === null || readScore(f.away) === null);
  return finalButUnreadable ? cfg.voidRecheckMs : cfg.ungradableMs;
}

/** "48h" for a window under three days, else whole days ("7d") — the detail string's window label. */
function fmtWindow(ms: number): string {
  const hours = ms / 3600_000;
  return hours < 72 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function kickoffOf(entry: CfbLedgerEntry, gkey: string): number {
  const start = entry.games?.[gkey]?.start;
  const t = start ? Date.parse(start) : Number.NaN;
  if (Number.isFinite(t)) return t;
  return Date.parse(`${entry.date}T23:59:59Z`);
}

/**
 * Grade every ticket of a locked day. `now` decides the ungradable window (`cfg.ungradableMs`,
 * 48 h) and defaults to the wall clock; tests pass it explicitly. `cfg` is the league the entry
 * belongs to (CFB_LEAGUE when omitted — the component layer; the server seams pass theirs).
 */
export function gradeCfbEntry(entry: CfbLedgerEntry, finals: CfbFinals, now: number = Date.now(), cfg: LeagueConfig = CFB_LEAGUE): NonNullable<CfbLedgerEntry["grading"]> {
  const tickets: Record<string, CfbGrade> = {};
  const legs: Record<string, { result: string; detail: string }> = {};
  for (const t of [...entry.core, ...entry.funT]) {
    const results: CfbLegResult[] = [];
    for (const leg of t.legs) {
      let r = gradeCfbLeg(leg, finals[leg.gkey]);
      /**
       * THE 48-HOUR VOID IS THE CLOCK, NOT THE STATUS (WIDENED 2026-09-06, INSTRUCTION 45 —
       * DEFECT I(a)). This used to escalate only when the game was ABSENT from the finals map or
       * carried `status === "postponed"`. `CfbStatus` has four values (src/lib/cfb/types.ts:
       * upcoming | live | final | postponed) and the two the old gate ignored are both reachable
       * and both terminal in practice: ESPN leaves a lightning-suspended or abandoned game sitting
       * at `live` — it is PRESENT in the finals map (finalsOf keeps any non-final game) and it is
       * NOT postponed — and a game whose event is rescheduled off the date can sit at `upcoming`.
       *
       * MEASURED before the change: a 2026-09-05 entry whose g1 came back `{ final: false, status:
       * "live" }` graded `pending` at `kickoff + 30 days`; `overlayCfbGrading(null, g, e).done` was
       * false, and `cfbSettleCandidate` / `cfbSettleReady` were both still true — a month later.
       * The date therefore burned one ESPN scoreboard read on every poke, for ever, and because
       * `CFB_SETTLE.maxDatesPerPoke` is 2, TWO such dates consumed the whole per-poke budget and
       * every newer date was deferred indefinitely, so its realized P/L never reached cfbBankroll.
       *
       * A leg still pending 48 hours after its kickoff is a void by the desk's own definition,
       * which is why the window exists at all. Nothing here shortens the wait for a game that is
       * genuinely still being played: the escalation cannot fire inside CFB_UNGRADABLE_MS, and a
       * leg that has actually settled is never `pending` to begin with.
       *
       * BOTH DESKS AGREE, because there is only one grader: the device path (`gradeCfb` in
       * src/lib/cfb/store.ts, `gradeCfbEntry(entry, finals)`) and the server settle pass
       * (`settlePass` in app/api/cfb/lock/route.ts, `gradeCfbEntry(e, finals, args.now)`) call
       * THIS function, so the widening lands on the phone and the cron at once and the two can
       * never disagree about whether a suspended game is a void. Their overlays already treat
       * `ungradable` as RESOLVED, so a voided ticket is a FINISHED ticket on both sides.
       *
       * CITATIONS CORRECTED 2026-09-06 (DEFECT S3). This block cited `route.ts:466` for the server
       * call; the only `gradeCfbEntry(` in that file is inside `settlePass`, and 466 had drifted
       * onto an unrelated comment fragment as the file above it grew. The substantive claim — one
       * grader, called from both paths — was verified by reading both files and is unchanged. Both
       * citations now name the ENCLOSING FUNCTION rather than a line, because a line number is a
       * fact about a neighbour's edits, not about the code it points at.
       *
       * ...AND "RESOLVED" IS NOT "CLOSED FOR EVER" (2026-09-06, DEFECT S1). An earlier revision of
       * this paragraph ended "so the void is terminal on both sides", which was true of the code
       * and wrong about the world: a game suspended for weather and resumed 50 hours later is
       * voided here at 48 h and then really does get a final. The server now keeps such a date
       * readable for a bounded window (CFB_VOID_RECHECK_MS, src/lib/cfb/rules.ts; the gate is
       * `cfbSettleCandidate` in src/lib/cfb/lock-server.ts), and the overlay accepts the late
       * result because `ungradable` is not in its SETTLED set. Nothing in THIS file changed for
       * that: a leg with a real final is graded from the final and never reaches the escalation
       * below. The device's own ledger view has no such window — see the note on
       * src/components/cfb/CfbLedger.tsx in `cfbSettleCandidate`.
       *
       * ...AND THE WINDOW IS NO LONGER ONE LENGTH (2026-09-06, DEFECT C1). The escalation below
       * asks `voidWindowMs` how long THIS leg's pending is allowed to last: 48 hours for every
       * shape that means "the result does not exist yet", and CFB_VOID_RECHECK_MS for the one
       * shape that means "the result exists and our read of it failed" — `final: true` with a
       * score `readScore` cannot read (null, undefined, blank or non-numeric; a finite number,
       * zero included, is always a score). Nothing above changes: the clock is still the rule, the
       * suspended-at-`live` game still voids at 48 h, and the escalation still fires only on a
       * leg that is `pending`.
       */
      const voidAfter = voidWindowMs(finals[leg.gkey], cfg);
      if (r.result === "pending" && now - kickoffOf(entry, leg.gkey) > voidAfter) {
        r = { result: "ungradable", detail: `${r.detail} · ${fmtWindow(voidAfter)} past kickoff — void` };
      }
      legs[leg.lkey] = r;
      results.push(r);
    }
    tickets[t.id] = settle(t.stake, t.legs, results);
  }
  const done = Object.values(tickets).every((g) => g.result !== "pending");
  return { tickets, legs, done };
}

function settle(stake: number, legs: CfbTicketLeg[], results: CfbLegResult[]): CfbGrade {
  if (results.some((r) => r.result === "lost")) return { result: "lost", payout: 0, detail: "a leg lost" };
  if (results.some((r) => r.result === "ungradable")) return { result: "ungradable", payout: 0, detail: "a leg is void" };
  if (results.some((r) => r.result === "pending")) return { result: "pending", payout: 0, detail: "awaiting a final" };
  let dec = 1;
  let stood = 0;
  for (let i = 0; i < legs.length; i++) {
    if (results[i].result === "push") continue;
    dec *= decFromAmerican(legs[i].cz);
    stood++;
  }
  if (stood === 0) return { result: "push", payout: stake, dec: 1, detail: "every leg pushed — stake returned" };
  const payout = Math.round(stake * dec * 100) / 100;
  const pushed = legs.length - stood;
  return { result: "won", payout, dec: Math.round(dec * 10000) / 10000, detail: pushed ? `won · ${pushed} leg${pushed === 1 ? "" : "s"} pushed and dropped out` : "won" };
}
