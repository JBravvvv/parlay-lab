import { assertAppendOnly } from "@/lib/append-only";
import { buildCfbCard } from "@/lib/cfb/card";
import { lockCfbCard, validateCfbLedger } from "@/lib/cfb/ledger";
import { CFB_LEAGUE, CFB_LOCK } from "@/lib/cfb/rules";
import type { CfbBoard, CfbCard, CfbGame, CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * THE CFB SERVER LOCK, PURE PART (INSTRUCTION 45, 2026-09-05). `/api/cfb/lock` is the HTTP
 * shell; the decision and the entry are built here so a test can drive every branch with a
 * pinned clock and no network.
 *
 *   decideCfbLock     no-slate (a Pacific date with no kickoff at all — docs/cfb-desk.md),
 *                     waiting (before first kickoff − CFB_LOCK.leadMs), or lock — with how many
 *                     of the date's games are still ahead of `now`.
 *   buildCfbLockEntry the locked day. On time or late: `buildCfbCard` over the slate (it only
 *                     prices games with kickoff after `now`, so a late poke naturally builds
 *                     from the games still ahead) → `lockCfbCard`, stamped `source: "server-lock"`
 *                     the way src/lib/server/lock-card.ts stamps the MLB day. Window missed
 *                     (nothing ahead): a NO-PLAY entry whose note says so — never a card on
 *                     lines that are gone. A NO-PLAY card (zero candidates) still locks: a
 *                     no-bet day stands on the ledger, exactly as the Builder's LOCK records it.
 *   cfbPricedAhead    how many Caesars quotes sit on games still ahead — the "can this day even
 *                     be priced" test the route refuses on (DEFECT 1, below).
 *   buildCfbSweepEntry the previous PT date's missed-window record (DEFECT 2, below).
 *   assertCfbCardMoney the money guard (2026-09-06): the $150 / $25 allotment, the per-ticket
 *                     band and the ticket cap, checked before anything is stamped — MLB's
 *                     "a crash, never a quietly wrong card", on the CFB rails.
 *
 * DEFECT 1 (found in review of the first cut, 2026-09-05): `oddsPayload()` in
 * src/lib/cfb/slate-server.ts NEVER throws — a missing ODDS_API_KEY, a 401, a 429, a non-array
 * body or a network error all return `{ events: [], missing: true }`. The board is then
 * scores-only, `priceGame` pushes no row at all, `buildCfbCard` finds zero candidates and
 * returns a NO-PLAY card — and the first cut of the route wrote that card and locked the date,
 * after which every later poke exited already-locked. One transient upstream blip cost the whole
 * $150 core / $25 fun day. `cfbPricedAhead` is the signal the route refuses on: with games still
 * ahead and nothing priced, the honest answer is to write NOTHING and let the next poke retry.
 *
 * DEFECT 2 (same review): the scheduler's forward passes no `?date`, so the route always means
 * `ptToday()`. The external ticker (docs/cron-jobs.md) covers roughly 08:00–19:45 PT, so a slate
 * whose lock window opens after the last poke of that PT day answered `waiting` at 19:45 PT and
 * was never seen again — by the next poke `ptToday()` had rolled over. The day was never locked
 * and never recorded: a SILENT day, the exact thing src/lib/server/lock-card.ts
 * `buildReasonRecord` exists to prevent on the MLB rails. `buildCfbSweepEntry` is the CFB
 * equivalent, written for the previous PT date on the next day's first poke, with its own
 * trigger so the ledger can tell a same-day missed window from a next-day sweep.
 *
 * THE LEAGUE SEAM (2026-09-08, Josh: "NFL needs to be built NOW"). Every function below that used
 * to read CFB_PAPER / CFB_RULES / CFB_TOPUP_* / CFB_SETTLE / CFB_VOID_RECHECK_MS is now a GENERIC
 * function taking `cfg: LeagueConfig` as its REQUIRED first argument, with NO default — this is a
 * server money seam, so a forgotten league is a type error, never a CFB card on an NFL ledger.
 * Every Cfb-named export keeps today's exact signature as a CFB_LEAGUE-bound wrapper, so nothing
 * that imports this file by its old names moves. `decideCfbLock` and `cfbPricedAhead` were
 * already league-free (a kickoff is a kickoff) and stay as they are; `overlayCfbGrading` reads no
 * knob at all. src/lib/server/football-lock.ts is the shell both /api/cfb/lock and /api/nfl/lock
 * drive these through.
 */

export const CFB_LOCK_SOURCE = "server-lock" as const;
export const CFB_LOCK_TRIGGER = "cfb-lock" as const;
/** ...and the same-day trigger when the window closed unlocked because the odds feed never priced
    the day (2026-09-06, DEFECT 4). This is the COMMON shape of an odds-outage day: the ticker
    usually does land a poke after the last kickoff, so this record — not the sweep's — is the one
    Josh reads under the card. Distinct on the ledger forever, like the sweep pair below. */
export const CFB_LOCK_ODDS_TRIGGER = "cfb-lock-odds-gap" as const;
/** the trigger on a record written for a PREVIOUS PT date — MLB's "self-check-reason" analogue */
export const CFB_SWEEP_TRIGGER = "cfb-lock-sweep" as const;
/**
 * ...and the trigger on a swept date that was LOST TO THE ODDS FEED rather than to the ticker
 * (2026-09-06, verification pass, DEFECT 4). Two different failures wrote one indistinguishable
 * record before this: a day no poke ever reached inside its lock window, and a day poked all day
 * inside the window whose every poke refused for want of a Caesars price. They stay apart on the
 * ledger forever, the same way the sweep trigger is already distinct from the same-day one.
 */
export const CFB_SWEEP_ODDS_TRIGGER = "cfb-lock-sweep-odds" as const;

/** why a missed-window record exists: the ticker never reached the window, or the odds feed
    never priced it (proved by the refusal's own dated marker — never guessed) */
export type CfbMissCause = "no-lock" | "odds-gap";

export type CfbLockDecision =
  | { kind: "no-slate" }
  | { kind: "waiting"; firstKickoff: number; locksAt: number }
  | { kind: "lock"; firstKickoff: number; locksAt: number; ahead: number; total: number };

/** The date's kickoff instants (ms epoch), unparseable starts dropped. */
export function kickoffsOf(games: { start: string }[]): number[] {
  return games.map((g) => Date.parse(g.start)).filter((t) => Number.isFinite(t));
}

export function decideCfbLock(games: { start: string }[], now: number, leadMs: number = CFB_LOCK.leadMs): CfbLockDecision {
  const starts = kickoffsOf(games);
  if (!starts.length) return { kind: "no-slate" };
  const firstKickoff = Math.min(...starts);
  const locksAt = firstKickoff - leadMs;
  if (now < locksAt) return { kind: "waiting", firstKickoff, locksAt };
  const ahead = starts.filter((t) => t > now).length;
  return { kind: "lock", firstKickoff, locksAt, ahead, total: starts.length };
}

/**
 * How many rows the card could actually price on games that have not kicked off yet. Zero here
 * with games still ahead means the DAY IS UNPRICEABLE RIGHT NOW, not that it is a no-bet day: an
 * odds outage and a slate where nothing clears the EV gate produce identical NO-PLAY cards, and
 * only this number tells them apart — which is why /api/cfb/lock refuses on it.
 *
 * IT MUST COUNT EXACTLY WHAT buildCfbCard COUNTS (fixed 2026-09-06, verification pass, DEFECT 5).
 * It used to count any row with `cz != null` on a game whose START is in the future. The card
 * requires more: src/lib/cfb/card.ts keeps `r.playable && r.cz != null && r.evCz != null` on
 * un-kicked games, and src/lib/cfb/model.ts sets `playable = !!sq.cz && upcoming`, where
 * `upcoming` ALSO demands `game.status === "upcoming"`. So a game ESPN flags live or final on a
 * FUTURE start — postponed and mislabeled events, which ESPN does produce — inflated this count,
 * suppressed the odds-missing refusal, and let the route lock a NO-PLAY it then described as the
 * genuine no-bet kind. That misdiagnosis was permanent: every later poke exits already-locked.
 * The filter below is character-for-character the one in `buildCfbCard`, on purpose.
 */
export function cfbPricedAhead(games: CfbGame[], now: number): number {
  let n = 0;
  for (const g of games) {
    const kicked = !(Date.parse(g.start) > now);
    if (kicked) continue;
    for (const r of g.rows) if (r.playable && r.cz != null && r.evCz != null) n++;
  }
  return n;
}

/**
 * THE MONEY GUARD (2026-09-06, verification pass). `/api/cfb/lock` writes unattended, daily, with
 * no operator watching, and `buildCfbLockEntry` validated only with `validateCfbLedger` — which
 * checks ledger SHAPE and the sport tag and nothing at all about the money. A card summing $200 of
 * core, a $40 ticket past CFB_RULES.maxStake, or an $80 fun parlay would have serialized cleanly
 * and been written to Josh's ledger.
 *
 * This is the CFB twin of the impossible branch in src/lib/server/lock-card.ts, whose docblock
 * says it plainly: "a crash, never a quietly wrong card". Every message prints BOTH numbers — what
 * the card carries and what the rules allow — because the only reader is a log line after the fact.
 * The route catches the throw and answers 502 having written nothing, so the next poke retries;
 * a genuinely broken sizer therefore costs a day, loudly, instead of silently mis-staking one.
 *
 * The epsilon is float slack only (stakes are computed, not typed), not a tolerance: a cent over
 * is not allowed, a rounding artifact of 1e-9 is not a defect.
 */
const MONEY_EPS = 1e-9;
export function assertCardMoney(cfg: LeagueConfig, card: CfbCard): void {
  const sum = (t: CfbTicket[]) => t.reduce((a, x) => a + x.stake, 0);
  const coreSum = sum(card.core);
  const funSum = sum(card.funT);
  /**
   * A DUPLICATE TICKET ID IS A MONEY DEFECT, NOT A COSMETIC ONE (INSTRUCTION 45, 2026-09-06, the
   * critic's second pass, CRITIC 6). The ids KEY THE GRADING MAP: `gradeCfbEntry`
   * (src/lib/cfb/grade.ts) writes `tickets[t.id]` per ticket, and `overlayCfbGrading` and
   * `mergeDay` both read it back by id. Two tickets sharing an id therefore produce ONE verdict
   * for TWO bets — measured on the two-poke race this pass fixed: six core tickets produced five
   * verdicts, a losing bet read the winner's payout, and realized P/L came out $47.70 high on a
   * single day. Nothing else on this rail catches it: `validateCfbLedger` checks ledger SHAPE and
   * `validateLedger` (src/lib/ledger-merge.ts) checks duplicate DATES, never duplicate ticket ids.
   *
   * It is checked HERE, over the whole card, rather than only over a merged entry, because both
   * write paths run through this function — `buildCfbLockEntry` for the lock and
   * `assertCfbEntryMoney` for a top-up — and the top-up is the only one that can currently mint a
   * collision. Core and fun share ONE id space because the grading map does.
   */
  const seen = new Set<string>();
  for (const t of [...card.core, ...card.funT]) {
    if (seen.has(t.id)) {
      throw new Error(
        `${cfg.short} MONEY GUARD: ticket id ${t.id} appears twice on ${card.date} — the ids key the grading map, so two bets would share one verdict. Nothing written. STOP.`,
      );
    }
    seen.add(t.id);
  }
  const { paper, rules } = cfg;
  if (coreSum > paper.daily + MONEY_EPS) {
    throw new Error(`${cfg.short} MONEY GUARD: the card deploys $${coreSum} of core but the day's core allotment is $${paper.daily}. Nothing written. STOP.`);
  }
  if (funSum > paper.fun + MONEY_EPS) {
    throw new Error(`${cfg.short} MONEY GUARD: the card deploys $${funSum} of fun money but the day's fun allotment is $${paper.fun}. Nothing written. STOP.`);
  }
  if (card.core.length > rules.tickets.max) {
    throw new Error(`${cfg.short} MONEY GUARD: the card carries ${card.core.length} core tickets but ${cfg.short}_RULES.tickets.max is ${rules.tickets.max}. Nothing written. STOP.`);
  }
  for (const t of card.core) {
    if (t.stake < rules.minStake - MONEY_EPS || t.stake > rules.maxStake + MONEY_EPS) {
      throw new Error(
        `${cfg.short} MONEY GUARD: core ticket ${t.id} carries $${t.stake}, outside the $${rules.minStake}–$${rules.maxStake} band ${cfg.short}_RULES sets. Nothing written. STOP.`,
      );
    }
  }
}
/** today's signature, CFB-bound */
export const assertCfbCardMoney = (card: CfbCard): void => assertCardMoney(CFB_LEAGUE, card);

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The NO-PLAY card for a window that closed with the day unlocked.
 *
 * TWO CAUSES, TWO SENTENCES (2026-09-06, verification pass, DEFECT 4). The single hard-coded note
 * said "every one of the N games ... had kicked off before the server could lock", which reads as
 * a timing failure — and on a day lost to the odds feed that is a misdiagnosis: the server COULD
 * have locked all day and deliberately refused, for want of a Caesars price. Josh reads this
 * string directly under the locked card (src/components/cfb/CfbBuilder.tsx renders `locked.note`),
 * so a record that names the wrong cause points the post-mortem at the ticker instead of at the
 * odds feed. The `odds-gap` wording is only ever chosen from the refusal's own dated marker, never
 * inferred.
 */
function missedWindowCard(board: CfbBoard, total: number, cause: CfbMissCause = "no-lock"): CfbCard {
  const note =
    cause === "odds-gap"
      ? `NO-PLAY — the day went unpriced: all ${plural(total, "game")} on ${board.date} kicked off with no Caesars price ever available on the games still ahead, so the server refused rather than stake a card it could not price. Nothing staked.`
      : `NO-PLAY — lock window missed: every one of the ${plural(total, "game")} on ${board.date} had kicked off before the server could lock. Nothing staked; no line that was already gone was priced.`;
  return { date: board.date, core: [], funT: [], coreSum: 0, funSum: 0, noPlay: true, notes: [note], benched: [] };
}

export type LockEntryOpts = { now: number; bankroll: number; ahead: number; total: number; firstKickoff: number; cause?: CfbMissCause };

export function buildLockEntry(cfg: LeagueConfig, board: CfbBoard, opts: LockEntryOpts): { entry: CfbLedgerEntry; card: CfbCard } {
  const { now, bankroll, ahead, total, firstKickoff } = opts;
  const missed = ahead === 0;
  const card = missed
    ? missedWindowCard(board, total, opts.cause ?? "no-lock")
    : buildCfbCard(board, { bankroll, daily: cfg.paper.daily, fun: cfg.paper.fun, now, rules: cfg.rules, idPrefix: cfg.idPrefix });
  /* THE MONEY, before anything is stamped or serialized (2026-09-06) — see assertCardMoney. */
  assertCardMoney(cfg, card);
  const late = !missed && firstKickoff <= now;
  const headline = missed
    ? card.notes[0]
    : late
      ? `locked after first kickoff — ${ahead} of ${total} games still ahead`
      : `locked by the server before the first kickoff — ${plural(total, "game")} on the slate`;
  /* THE NO-CORE NOTE IS ALSO A NOTE (2026-09-06, the card agent's report §8.2). `buildCfbCard` used
     to return from inside its core section when nothing cleared the gate, so `noPlay` and "no core
     ticket" were the same day and this test caught both. It no longer does: the fun parlay now
     survives a core-empty board, and such a day carries `noPlay: false` with a first note reading
     "No core ticket — …". Reading only `card.noPlay` dropped that note from `locked.note`, which is
     the line Josh reads under the card — so the day that staked $0 of the $150 said nothing about
     it. Widened to "no core ticket seated", which subsumes the no-play case. */
  const detail = !missed && (card.noPlay || !card.core.length) ? card.notes[0] : null;
  const entry: CfbLedgerEntry = {
    ...lockCfbCard(card, board, now, cfg),
    source: cfg.lockSource,
    trigger: missed && opts.cause === "odds-gap" ? cfg.triggers.oddsGap : cfg.triggers.lock,
    note: detail ? `${headline} · ${detail}` : headline,
  };
  const v = validateCfbLedger([entry], cfg);
  if (!v.ok) throw new Error(`server lock entry failed the ${cfg.short} ledger's own validator: ${v.error}`);
  return { entry, card };
}
/** today's signature, CFB-bound */
export const buildCfbLockEntry = (board: CfbBoard, opts: LockEntryOpts): { entry: CfbLedgerEntry; card: CfbCard } => buildLockEntry(CFB_LEAGUE, board, opts);

/**
 * THE PREVIOUS-DATE SWEEP RECORD (DEFECT 2, 2026-09-05). The same missed-window NO-PLAY card,
 * but written on a LATER PT date for a date the ticker never reached inside its window — the
 * CFB twin of `buildReasonRecord` in src/lib/server/lock-card.ts, which stamps MLB's
 * never-generated days `locked: true`, `source: "server-lock"`, empty core/funT and a note
 * saying why, so no day is ever silent.
 *
 * `lockedAt` is the sweeping poke's own instant, NOT a back-dated one: the record says when it
 * was written, and the note says which date it is about and that it was swept a day late.
 * `trigger` is CFB_SWEEP_TRIGGER rather than CFB_LOCK_TRIGGER so the ledger keeps the two apart
 * — a same-day poke that arrived after the last kickoff is a different failure from a PT day
 * whose whole window fell outside the ticker's hours.
 *
 * Nothing is priced here, so the caller can (and does) build the board from ESPN alone with
 * `oddsEvents: []` and spend ZERO Odds API credits on it.
 */
export type SweepEntryOpts = { now: number; total: number; cause?: CfbMissCause };

export function buildSweepEntry(cfg: LeagueConfig, board: CfbBoard, opts: SweepEntryOpts): CfbLedgerEntry {
  const cause = opts.cause ?? "no-lock";
  const card = missedWindowCard(board, opts.total, cause);
  /* WHAT THE NOTE MAY CLAIM (2026-09-06, DEFECT 4). The old text ended "because no scheduler poke
     ever landed inside <date>'s lock window" — an assertion the sweep cannot make: the odds-missing
     refusal produces exactly the day where pokes DID land inside the window and refused on purpose.
     Now the odds-gap wording is used only when that refusal left its own dated marker, and the
     other wording states what IS known — no lock landed, and no odds-outage refusal was recorded —
     instead of naming a cause nothing verified. */
  const tail =
    cause === "odds-gap"
      ? `Recorded by the sweep — swept on the following day's poke: ${board.date} was poked inside its lock window and every poke refused, because no Caesars price was ever available on the games still ahead. The day was lost to the odds feed, not to a gap in the ticker.`
      : `Recorded by the sweep — swept on the following day's poke: no lock ever landed for ${board.date} and no odds-outage refusal was recorded for it, so the day is recorded as missed rather than left silent.`;
  const entry: CfbLedgerEntry = {
    ...lockCfbCard(card, board, opts.now, cfg),
    source: cfg.lockSource,
    trigger: cause === "odds-gap" ? cfg.triggers.sweepOdds : cfg.triggers.sweep,
    note: `${card.notes[0]} ${tail}`,
  };
  const v = validateCfbLedger([entry], cfg);
  if (!v.ok) throw new Error(`sweep record failed the ${cfg.short} ledger's own validator: ${v.error}`);
  return entry;
}
/** today's signature, CFB-bound */
export const buildCfbSweepEntry = (board: CfbBoard, opts: SweepEntryOpts): CfbLedgerEntry => buildSweepEntry(CFB_LEAGUE, board, opts);

/* ==========================================================================================
 * INSTRUCTION 45, THE OTHER HALF (2026-09-06). Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day."
 *
 * The lock above does the first half. Two things the MLB desk does were missing, and both are
 * pure decisions, so both live here beside it:
 *
 *   A. THE TOP-UP.   The lock fires CFB_LOCK.leadMs before the FIRST kickoff, which is exactly
 *      when the pool of posted Caesars prices is thinnest, and buildCfbCard says so out loud when
 *      it cannot spend the allotment — on the 2026-09-05 fixture it staked three $25 singles and
 *      noted "$75 of the $150 stayed undeployed". Every later poke hit the already-locked exit and
 *      returned, so the day ended permanently $75 short while the ledger recorded it as a full
 *      paper day and cfbBankroll sized every later day off it. MLB solved this on Josh's own word
 *      (src/lib/paper-mode.ts TOPUP_MAX, quoting him: "I said $150 every day no matter what so we
 *      could track and calibrate off of it"); CFB_TOPUP_MAX is the CFB twin of that number.
 *
 *   B. THE SETTLE PASS. Nothing settled a server-locked CFB day: the grading chain is browser-only
 *      (gradeCfbEntry <- gradeCfb <- gradeCfbPending <- the Ledger tab's button) and the
 *      scheduler's grading tick forwards to /api/calibrate?grade=only, which has no CFB code. So
 *      cfbLedgerStats reported 0-0 forever and cfbBankroll stayed pinned at CFB_BANK_BASE.
 *      `overlayCfbGrading` is the rule that makes settling on the server safe.
 * ======================================================================================== */

/**
 * ONE TOP-UP ATTEMPT, stored on the entry itself (rewritten 2026-09-06 by the critic's pass).
 *
 * It used to record only an attempt that APPENDED MONEY, and `CFB_TOPUP_MAX` was read off the
 * length of the list — so the cap bounded successful WRITES, not attempts. A day that stays short
 * (the common case: this desk's own fixture slate locks $75 of the $150 and the rebuild then seats
 * nothing) never moved the counter, so every poke from the lock to the last kickoff ran the whole
 * top-up path and bought a priced game-lines board to learn the same "nothing to seat" again — 6
 * Odds credits a poke, ~40 pokes a Saturday, ~240 credits, none of it counted by
 * CFB_PROPS.dailyBudget, which counts props pulls only.
 *
 * An attempt that finds nothing has SPENT exactly what one that writes spends. So a record is now
 * CLAIMED before the priced board is bought, with `core: 0, stake: 0`, and FILLED IN by
 * `applyCfbTopUp` if the attempt seats anything — the MLB desk's own rule, where
 * app/api/generate/route.ts claims `topup-${used + 1}` before the fire and writes the registry row
 * afterwards whatever it seated, and src/lib/server/blocks.ts `decideTopUp` counts those keys.
 *
 * `n` is the attempt's ordinal, carried on the record rather than inferred from position, because
 * the write block re-reads the store and must recognise ITS OWN in-flight claim: without `n` it
 * would count its own claim as a spent attempt, refuse itself at the cap, and renumber the ticket
 * ids the plan already minted (`cfb-<date>-topup<n>-core-<i>`).
 *
 * THE ORDINAL IS NOT THE IDENTITY (2026-09-06, the critic's second pass, CRITIC 6). `n` alone was
 * read as "this is my claim", and two overlapping pokes derive the SAME ordinal from the same
 * stored snapshot — so the second read the first one's COMPLETED attempt as its own claim, erased
 * it and re-minted its ids. A claim is the pair (`n`, "this row is still unfilled"): the ordinal
 * says WHICH attempt, and the filled flag says whether it FINISHED. A finished attempt is terminal
 * and belongs to whoever wrote it.
 *
 * `filled` IS AN EXPLICIT FIELD, NOT `core === 0` (INSTRUCTION 45, 2026-09-06, DEFECT M(b)). Until
 * this change, "still in flight" was read off the money: `claimCfbTopUp` wrote `core: 0, stake: 0`
 * and only `applyCfbTopUp` could raise it, so `core === 0` meant "unfilled" exactly. That equality
 * broke the moment a top-up could complete having seated FUN money and no core ticket — the
 * completion Josh's other half asks for. Such a row records `core: 0, stake: 0` and is a FINISHED
 * attempt, and under the old reading every later poke would have treated it as a claim it could
 * replace, release or exclude from the cap: the very ambiguity CRITIC 6's race exploited, re-armed
 * by the fix to DEFECT M(a). So a row now says what it is. `fun` is carried beside `core` for the
 * same reason the note is: the row is the only record of what an attempt bought.
 *
 * A row written before either change carries no `n` and no `filled`. Nothing breaks. It is still
 * counted (the cap reads the LENGTH of the list); and for a row with no `filled` the old reading is
 * still EXACT rather than a guess, because `claimCfbTopUp` was the only writer that could ever
 * produce `core: 0, stake: 0` — every other row of that vintage was written on success and carries
 * `core > 0`. See `isClaimRow`.
 */
/**
 * `arms` SAYS WHICH ALLOTMENT'S BUDGET THE ATTEMPT SPENT (INSTRUCTION 45, 2026-09-06, L1).
 *
 * DEFECT M(a) made the core and the fun money INDEPENDENT gates — Josh's sentence names two pots,
 * "$150 per day theoretical Core money and $25 Fun money per day" — and then counted both arms'
 * attempts in one undifferentiated `used`. So a fun attempt consumed a CORE attempt: an entry
 * carrying two completed fun-only rows and $75 of core still owed answered "the top-up cap is
 * spent (2 of 2)" and left the core's own two chances unusable.
 *
 * The row now records which arms were OPEN when it fired, and `decideCfbTopUp` counts each arm
 * against its own allowance. This does NOT widen the spend, and the invariant rules.ts states —
 * "the worst case per date is unchanged at 2 boards" — still holds, because both arms only ever
 * CLOSE: core room and ticket slots only shrink, and a fun bucket that has been seated is never
 * empty again. So every attempt with the core arm open comes before every attempt without it, an
 * attempt with both arms open charges BOTH counters, and no interleaving can reach a third board.
 *
 * A row written before this change carries no `arms` and is counted against BOTH — the direction
 * that refuses MORE spending, never less — so an existing blob can never buy an extra priced board
 * on the deploy that ships this, exactly as a row with no `filled` keeps the old reading.
 */
export type CfbTopUpRecord = { at: number; n: number; core: number; stake: number; fun?: number; filled?: boolean; arms?: { core: boolean; fun: boolean } };

/**
 * `core` and `fun` say WHICH ALLOTMENT opened (INSTRUCTION 45, 2026-09-06, DEFECT M(a)). They are
 * two independent gates and at least one is true whenever `fire` is: the core arm is open when the
 * day has both room and a free ticket slot, the fun arm when the day carries no fun parlay at all.
 * The route reports them so the poke's own answer names the half of Josh's sentence it acted on.
 */
export type CfbTopUpDecision =
  | { fire: true; room: number; slots: number; used: number; funUsed: number; n: number; core: boolean; fun: boolean }
  | { fire: false; reason: string };

/**
 * WHICH ARM'S BUDGET A RECORDED ATTEMPT SPENT (2026-09-06, L1). A row that says nothing counts
 * against both, so the ledger's own history can only ever refuse more spending than it authorises.
 */
const spentCoreAttempt = (r: CfbTopUpRecord): boolean => r.arms?.core !== false;
const spentFunAttempt = (r: CfbTopUpRecord): boolean => r.arms?.fun !== false;

/**
 * IS THIS ROW AN ATTEMPT STILL IN FLIGHT (INSTRUCTION 45, 2026-09-06, DEFECT M(b))?
 *
 * Every filter that used to ask `r.core === 0` asks this instead — `decideCfbTopUp`'s claim lookup
 * and its empty-attempt retry gate, `claimCfbTopUp`, `releaseCfbTopUp` and `applyCfbTopUp` — so
 * there is exactly ONE place that decides what a claim is. A completed fun-only attempt records
 * `core: 0, stake: 0` and would otherwise be indistinguishable from a claim another poke may
 * replace, release, or leave out of the cap.
 *
 * The `filled === undefined` arm is the ledger's own history, not a fallback for new rows: rows
 * written before this change carry no flag, and for them `core === 0 && stake === 0` identifies a
 * claim EXACTLY, because `claimCfbTopUp` was the only writer that could produce those two zeroes.
 * A claim left over from the previous deploy therefore keeps behaving as a claim rather than
 * silently becoming a spent attempt.
 */
const isClaimRow = (r: CfbTopUpRecord): boolean => (r.filled === undefined ? r.core === 0 && r.stake === 0 : !r.filled);

export const cfbStakeOf = (tix: CfbTicket[]): number => tix.reduce((s, t) => s + t.stake, 0);

/**
 * The entry's own top-up log. It is read off the entry rather than any separate key on purpose:
 * the bound must survive a cold start, a redeploy and an overlapping poke, and the ledger blob is
 * the only thing all three share.
 *
 * THE CAST IS LOAD-BEARING, NOT A CONVENIENCE (note CORRECTED 2026-09-06, S3). This paragraph used
 * to say that CfbLedgerEntry extends SyncEntry, "whose index signature already admits the field, so
 * nothing in src/lib/cfb/types.ts had to change to carry it". BOTH HALVES ARE FALSE TODAY and were
 * re-read this turn: src/lib/cfb/types.ts declares NoIndex and builds CfbLedgerEntry from it, so the
 * inherited index signature is STRIPPED, and grepped this turn the string topUps does not occur in
 * that file at all. The cast below is therefore the ONLY way the log is reachable, every read of it
 * goes through this function, and every write goes through claimCfbTopUp / applyCfbTopUp. Declaring
 * a member instead would be a change to a file this round does not own.
 */
export function cfbTopUpsOf(entry: CfbLedgerEntry): CfbTopUpRecord[] {
  const v = (entry as Record<string, unknown>).topUps;
  return Array.isArray(v) ? (v as CfbTopUpRecord[]) : [];
}

/**
 * THE FUN WAGERS THIS DAY ALREADY MADE AND LOST TO THE MERGE (INSTRUCTION 45, 2026-09-06, S2).
 *
 * Both channels, deliberately. mergeDay records a refused fun ticket by NAME on funDropped and its
 * MONEY on funDroppedPL, and the two are written from different places: funDropped accrues from
 * both copies of the day, funDroppedPL from the union's own receipts. A blob written before the
 * receipt channel existed carries the id list alone; a blob whose id list was filtered away by a
 * later seat can still carry the receipt. Either one on its own says the same thing — this day put
 * fun money on the board and the merge refused it — so either one is enough to close the arm.
 *
 * Ids, not a boolean, so the refusal can name what it is refusing over.
 */
export function cfbFunRefusedOf(entry: CfbLedgerEntry): string[] {
  const e = entry as Record<string, unknown>;
  const list = Array.isArray(e.funDropped) ? (e.funDropped as unknown[]).map(String) : [];
  const pl = e.funDroppedPL;
  const keys = pl && typeof pl === "object" && !Array.isArray(pl) ? Object.keys(pl as Record<string, unknown>) : [];
  return [...new Set([...list, ...keys])].sort();
}

/**
 * The games the CORE already sits on. CORE ONLY, deliberately: `buildCfbCard` enforces one leg per
 * game inside the core set (CFB_RULES.oneLegPerGame) but builds the FUN parlay from every playable
 * row without consulting `usedGames`, so a fun leg and a core ticket may share a game on the very
 * first card the lock writes. Counting fun legs here would therefore let the base card's own
 * parlay veto a core top-up on a game the core never touched — a rule the desk does not have.
 */
export function cfbCoreGamesOf(entry: CfbLedgerEntry): Set<string> {
  const out = new Set<string>();
  for (const t of entry.core) for (const l of t.legs) out.add(l.gkey);
  return out;
}

/**
 * EVERY FREE REASON NOT TO TOP UP, in the order that spends the least (2026-09-06).
 *
 * Not one of these checks touches the network. That is the whole cost discipline: a top-up that
 * gets as far as pricing costs a game-lines pull (6 Odds credits, measured on prod 2026-09-05 —
 * the quota moved 17578 -> 17572), and the ticker pokes every ~15 minutes all Saturday, so the
 * refusals have to be free or the capability pays for itself several times over on days it can do
 * nothing. In order:
 *
 *   device lock       a Builder lock is Josh's own card. The desk's oldest rule (upsertCfbEntries:
 *                     "the lock is once per slate date") is that the first lock stands, and the
 *                     server has no business adding tickets to a card a person built. Only an
 *                     entry the server itself stamped CFB_LOCK_SOURCE is ever topped up.
 *   both buckets full ONE gate per ALLOTMENT, and they are independent (DEFECT M(a), below).
 *                     The CORE arm is open with at least one minimum stake of room AND a free
 *                     ticket slot; the FUN arm is open when `entry.funT` is EMPTY. The attempt is
 *                     refused for free only when NEITHER is, and the reason names both.
 *   cap spent         CFB_TOPUP_MAX attempts already recorded on this entry. ATTEMPTS, not
 *                     successful writes — see CfbTopUpRecord for the defect that distinction
 *                     fixed and for why the poke's own in-flight claim is excluded.
 *   retry window      the previous attempt bought a board within CFB_TOPUP_RETRY_MS and seated
 *                     nothing. Two attempts spent inside half an hour of the lock price the same
 *                     board twice; spreading them is what makes the second one worth having.
 *   no time passed    `now` is not after `lockedAt`. A top-up exists for prices that post AFTER
 *                     the lock; at the lock's own instant the board, the prices and the room are
 *                     the ones buildCfbCard just sized from, so a rebuild can only re-offer what
 *                     the lock already declined. Refusing here keeps the locking poke itself, and
 *                     any poke that lands in the same instant, at zero upstream cost.
 *
 * The one reason that is NOT free — every game has kicked off — needs the ESPN board and so lives
 * in the route, after this returns `fire: true`.
 */
export function decideTopUp(cfg: LeagueConfig, entry: CfbLedgerEntry, now: number, opts?: { claim?: number }): CfbTopUpDecision {
  if (entry.source !== cfg.lockSource) {
    return { fire: false, reason: `${entry.date} was locked on the device (Builder) — Josh's own card is his; the server never adds tickets to it.` };
  }
  const { paper, rules } = cfg;
  /* THE LOCAL NAME IS THE PIN'S (2026-09-08): tests/cfb-lock-route.test.ts D1 reads this file for
     the literal `last && isClaimRow(last) && now - last.at < CFB_TOPUP_RETRY_MS`, so the league's
     own cooldown is bound to that name here. It is cfg.topUp.retryMs — CFB_TOPUP_RETRY_MS for the
     CFB desk, NFL_TOPUP.retryMs for the NFL — and nothing else in this function reads the constant. */
  const CFB_TOPUP_RETRY_MS = cfg.topUp.retryMs;
  const staked = cfbStakeOf(entry.core);
  const room = paper.daily - staked;
  const slots = rules.tickets.max - entry.core.length;
  /**
   * TWO ALLOTMENTS, TWO GATES (INSTRUCTION 45, 2026-09-06, DEFECT M(a)). Josh's sentence, verbatim:
   * "the same $150 per day theoretical Core money and $25 Fun money per day". This function used to
   * answer it with ONE gate computed from `entry.core` alone — "the day is fully deployed" when the
   * core room fell under a minimum stake, and "the ticket cap is spent" at CFB_RULES.tickets.max —
   * and `planCfbTopUp`, the only thing that can seat a fun ticket, sits past that refusal.
   *
   * So the COMMONEST GOOD DAY threw the second half away. MEASURED on the 2026-09-05 fixture: a day
   * whose lock deployed all $150 of core with `funT: []` answered `fire: false`, "the day is fully
   * deployed — $150 of the $150 core is staked", and sat at $0 of its $25 for the life of the day.
   * The ticket-cap shape is worse: seven $5 tickets ($35 staked) answered "the ticket cap is spent
   * — 7 of 7 core tickets are already on the day", stranding $115 of core AND $25 of fun at once.
   * A day where the core allotment worked perfectly was exactly the day the fun money was lost.
   *
   * The arms are now independent: EITHER opens the attempt, NEITHER may exceed its own allotment,
   * and the decision reports which opened. The FUN arm is gated on the bucket being genuinely
   * EMPTY — not on "under $25" — so a day can never take a second parlay and a fun-only fire can
   * never repeat: the first one that seats anything closes the arm for the rest of the day.
   *
   * WHAT IT COSTS, stated rather than buried: a fun-only fire buys a priced board (one game-lines
   * pull, 6 Odds credits) for a day that needs no core money — days that used to refuse for free.
   * It is bounded by the SAME CFB_TOPUP_MAX attempts as everything else on this path (the two arms
   * share one budget; they do not each get their own), so the worst case per date is at most
   * CFB_TOPUP_MAX priced boards (2 → 6, INSTRUCTION 48 2026-09-09 — arms only close, so the two
   * counters cannot be played off against each other), and only the SET of dates that can reach
   * it widens.
   */
  /**
   * AN EMPTY BUCKET IS NOT ALWAYS A FREE BUCKET (INSTRUCTION 45, 2026-09-06, S2 — DECIDED, not
   * merely described). The fun arm was gated on emptiness alone, and emptiness has TWO causes.
   *
   * One is a day that never took its parlay: free money, and the arm should open on it. The other
   * is a day whose parlay the MERGE REFUSED — src/lib/ledger-merge.ts bounds the bucket at
   * `funCap(base, other)` and, read this turn, records what it refused as `out.funDropped` /
   * `out.funDroppedPL` and leaves `out.funT` short or EMPTY. That file's own note measures the
   * shape: a copy carrying a small recorded `fun` against a copy carrying a real $25 ticket merged
   * to "funT [] / $0, the $25 wager refused into an empty bucket and only named on `funDropped`".
   *
   * On that second day the emptiness IS the refusal. Reopening the arm there buys a priced board
   * (6 Odds credits), seats a fresh $25 parlay, and hands the next merge the very ticket its cap
   * just declined — which it declines again, on the same cap, leaving the same empty bucket and the
   * same receipt. That is not a top-up, it is a loop, and every turn of it costs credits.
   *
   * THE DECISION IS TO BAR THE REOPEN, on either channel. It cannot strand honest money: the money
   * is not free to begin with, since the day's own recorded ceiling is what refused it, and a day
   * whose bucket was emptied by anything OTHER than a refusal carries no receipt and still opens.
   * The bar is the receipt, not the emptiness — `cfbFunRefusedOf` above, and `planCfbTopUp` reads
   * the same helper so the seat cannot be taken past this decision either.
   */
  const funRefused = cfbFunRefusedOf(entry);
  const coreOpen = room >= rules.minStake && slots > 0;
  const funOpen = entry.funT.length === 0 && funRefused.length === 0;
  if (!coreOpen && !funOpen) {
    const why =
      room < rules.minStake
        ? `the day is fully deployed — $${staked} of the $${paper.daily} core is staked, less than one $${rules.minStake} minimum short`
        : `the ticket cap is spent — ${entry.core.length} of ${rules.tickets.max} core tickets are already on the day`;
    /* THE FUN HALF SAYS WHICH KIND OF SHUT IT IS. Saying "already on a parlay" over an EMPTY
       bucket would be a false report of the day's own money — the parlay was refused, not placed. */
    const funWhy = entry.funT.length
      ? `the day's $${paper.fun} fun money is already on a parlay`
      : `the day's fun parlay was refused by the merge and its receipt still stands (${funRefused.join(", ")}), so that $${paper.fun} is spent rather than free`;
    return { fire: false, reason: `${why}, and ${funWhy} — neither allotment has room, so no board is bought.` };
  }
  /**
   * THE POKE'S OWN CLAIM IS NOT SOMEONE ELSE'S ATTEMPT — AND AN ORDINAL ALONE DOES NOT IDENTIFY IT
   * (rewritten 2026-09-06, the critic's second pass, CRITIC 6).
   *
   * The write block re-reads the store and runs this whole decision again over the stored copy,
   * which by then carries the claim this same poke wrote before it bought its board; counting it
   * would refuse the attempt in flight and renumber ids the plan already minted. That much is
   * unchanged. What was WRONG is how the claim was recognised: `r.n !== opts.claim`, by ORDINAL
   * ONLY. Two pokes overlapping on one date read the same stored snapshot at their GET (the window
   * is the whole request — the sweep and the settle pass run between the read and the top-up), so
   * both derived ordinal 1; the second then treated the FIRST poke's COMPLETED attempt as its own
   * in-flight claim, erased it from the count, re-fired at the same ordinal and re-minted ticket
   * ids the first poke had already seated. MEASURED: six core tickets carrying five distinct ids,
   * `topUps` counting one of two attempts, the cap defeated, and — because the ids key the grading
   * map — a losing bet reading a winning bet's verdict, worth $47.70 of phantom realized P/L on
   * one day and a bankroll 2520 where the honest figure was 2473.
   *
   * A CLAIM IS A ROW THAT IS STILL UNFILLED. `claimCfbTopUp` writes `filled: false` and
   * `applyCfbTopUp` replaces the same ordinal with `filled: true`, so a FILLED row is an attempt
   * that COMPLETED and must always count, whoever wrote it. Only an UNFILLED row at this poke's
   * ordinal is its own claim.
   *
   * THE TEST IS `filled`, NOT `core === 0` (2026-09-06, DEFECT M(b)): since a top-up may now
   * complete having seated the day's FUN parlay and no core ticket, `core === 0` no longer means
   * "in flight" — see `isClaimRow` and `CfbTopUpRecord`. MEASURED against the old reading: an entry
   * carrying a completed fun-only row at ordinal 1 and one further attempt answered `fire: true` to
   * a poke passing `{ claim: 1 }`, handing out a THIRD attempt past CFB_TOPUP_MAX = 2.
   */
  const rows = cfbTopUpsOf(entry);
  const held = opts?.claim == null ? undefined : rows.find((r) => r.n === opts.claim && isClaimRow(r));
  const others = held ? rows.filter((r) => r !== held) : rows;
  /**
   * ONE CAP PER ALLOTMENT, NOT ONE CAP FOR BOTH (INSTRUCTION 45, 2026-09-06, L1). Josh's sentence
   * names two pots of money and DEFECT M(a) gave them two independent GATES; the counting stayed
   * single, so a fun attempt spent a core attempt. MEASURED on a synthetic day carrying two
   * completed fun-only rows (`arms: { core: false, fun: true }`) and $75 of core still owed: the
   * old counting answered `{"fire":false,"reason":"the top-up cap is spent (2 of 2) — $75 stays
   * undeployed…"}` and the core's own two chances were gone without ever having been offered.
   *
   * Each arm now counts the attempts that could have served IT. An attempt is refused only when
   * every arm that is OPEN is also SPENT, and the fire reports each arm as "open and not spent",
   * so the route's `buckets` still names exactly the halves of the instruction it may act on.
   *
   * THE TOTAL SPEND IS UNCHANGED at CFB_TOPUP_MAX priced boards per date — see CfbTopUpRecord for
   * why the two counters cannot be played off against each other: both arms only ever close, so an
   * attempt that charges only the fun counter can never be followed by one that charges only the
   * core's.
   *
   * `used` keeps its name and its place in the answer — it is the CORE's figure — and `funUsed` is
   * reported beside it. The REFUSAL below no longer belongs to either of them: it names both
   * allotments (D2, below).
   */
  const used = others.filter(spentCoreAttempt).length;
  const funUsed = others.filter(spentFunAttempt).length;
  const coreSpent = used >= cfg.topUp.max;
  const funSpent = funUsed >= cfg.topUp.max;
  /**
   * THE REFUSAL NAMES BOTH ALLOTMENTS (INSTRUCTION 45, 2026-09-06, D2 — the MONEY critic's pass).
   *
   * The CONDITION is untouched and deliberately so: an attempt is refused exactly when every arm
   * that is OPEN is also SPENT. What moved is what the sentence REPORTS. It read
   * "… $${room} stays undeployed", and `room` is `CFB_PAPER.daily - staked` — the CORE figure and
   * nothing else. So the shape this whole round exists for answered with the wrong money:
   * MEASURED on a day at the full $150 core whose $25 bucket was still EMPTY and whose two
   * fun-arm attempts were spent, the refusal read "the top-up cap is spent (2 of 2) — $0 stays
   * undeployed rather than grind the odds quota all day." True of the core, false of the day — the
   * day had stranded its entire $25, which is the second half of Josh's sentence, and a reader of
   * the poke's own answer could not see it. A joint stranding said "$75 stays undeployed" and was
   * silent about the $25 in exactly the same way.
   *
   * Both figures are stated now, each against its own allotment, so the reader can tell WHICH pot
   * is stranded and by how much without cross-referencing the ledger. `funRoom` is computed from
   * the bucket's own stake rather than from `funOpen`, because `funOpen` is "the bucket is EMPTY"
   * — a bucket that carries its parlay has $0 undeployed, and saying so is the honest report on a
   * day refused for the core's sake alone.
   */
  const funRoom = paper.fun - cfbStakeOf(entry.funT);
  if ((!coreOpen || coreSpent) && (!funOpen || funSpent)) {
    const n = coreOpen ? used : funUsed;
    return {
      fire: false,
      reason: `the top-up cap is spent (${n} of ${cfg.topUp.max}) — $${room} of the $${paper.daily} core and $${funRoom} of the $${paper.fun} fun stay undeployed rather than grind the odds quota all day.`,
    };
  }
  /* AN EMPTY ATTEMPT HOLDS THE NEXT ONE OFF (CFB_TOPUP_RETRY_MS, the MLB desk's own 45 minutes).
     The attempts are only worth having if they are spread: two spent inside half an hour of the
     lock price the same board twice. This gates ONLY a predecessor that seated nothing — an
     attempt that found tickets says the board is moving, and the next may run on the next pulse. */
  /**
   * THE COOLDOWN IS ARM-AGNOSTIC ON PURPOSE, AND THAT IS WHAT BOUNDS THE FUN-ONLY SPEND
   * (INSTRUCTION 45, 2026-09-06, D1 — documented here, not changed).
   *
   * DEFECT M(a) let the FUN arm fire on its own, which is the second half of Josh's sentence —
   * "the same $150 per day theoretical Core money and $25 Fun money per day" — and it made a shape
   * reachable that had never existed: a day whose core is complete ($150, six tickets) and whose
   * fun bucket is EMPTY fires `{ core: false, fun: true }`, buys a priced board (6 Odds credits)
   * and seats nothing, because no 3-to-5-leg combination on that board clears CFB_RULES.fun
   * (decimal 4-40, EV >= -3%). The route's own free refusal above the pull (`!d.core && d.fun &&
   * openAhead < CFB_RULES.fun.legs.min`, in `topUpDate`) cannot catch it: that refusal is
   * arithmetic about DISTINCT GAMES, and such a day has six unseated games still ahead. The
   * concern was that a second poke fifteen minutes later would buy the identical board again.
   *
   * It does not, and this gate is why. The condition asks only whether the LAST recorded attempt
   * is an unfilled row inside the window — never which arm it served — and an attempt that seats
   * nothing leaves exactly that: `topUpDate` returns `skipped` on an empty probe WITHOUT calling
   * `applyCfbTopUp`, so the row `claimCfbTopUp` wrote before the pull stays `filled: false` and IS
   * the empty-attempt marker. A fun-only attempt therefore inherits the same cooldown the core arm
   * has, from the same line, with no second rule to keep in step with the first.
   *
   * MEASURED this turn on the 2026-09-05 fixture, driven end to end through the route: a full-core
   * empty-bucket day buys ONE board at 15:01Z and ZERO on the pokes at 15:16Z, 15:31Z and 15:45Z,
   * and the arm DOES buy its second board at 15:47Z, past the window — a cooldown, not a silent
   * kill. Both halves are pinned in tests/cfb-lock-route.test.ts under "D1"; narrowing this
   * condition to the core arm (`&& spentCoreAttempt(last)`) was planted as a mutant and killed by
   * the credit-count pin. `arms` stays what it is for — the per-allotment CAP counting above — and
   * is deliberately NOT consulted here.
   */
  const last = others[others.length - 1];
  if (last && isClaimRow(last) && now - last.at < CFB_TOPUP_RETRY_MS) {
    const mins = Math.max(1, Math.round((CFB_TOPUP_RETRY_MS - (now - last.at)) / 60_000));
    return {
      fire: false,
      reason: `top-up attempt ${last.n} priced a board ${Math.round((now - last.at) / 60_000)} min ago and found nothing to seat — the next attempt waits ${mins} more min rather than re-buy the same prices.`,
    };
  }
  if (!(now > entry.lockedAt)) {
    return { fire: false, reason: `no time has passed since the lock — the board and its prices are the ones buildCfbCard already sized this day from.` };
  }
  /**
   * THE ORDINAL A FRESH ATTEMPT TAKES (2026-09-06, CRITIC 6). `opts.claim` is honoured only when
   * the claim is actually HELD — i.e. an unfilled row with that ordinal is sitting on this entry.
   * A poke whose claim was consumed or replaced by a racing writer between the claim and the write
   * is NOT in flight any more; re-using its ordinal is exactly what re-minted a seated id. Such a
   * poke takes a fresh ordinal instead, one past both the number of attempts recorded and the
   * highest ordinal any row carries, so a fresh `n` can never equal a row that already exists —
   * including a legacy row from before `n` was carried at all (those parse as 0 and are counted by
   * `used`). Ordinals are never re-used, so `cfb-<date>-topup<n>-core-<i>` cannot be re-minted.
   */
  const maxN = rows.reduce((m, r) => (Number.isFinite(r.n) && r.n > m ? r.n : m), 0);
  /* AND THE ORDINALS THE TICKET IDS THEMSELVES CARRY (INSTRUCTION 48 fix round, 2026-09-09,
     defect 3): a `topUps` row lost to a device write-back (the merge kernel now unions the log, but
     a blob written before that fix may already lack rows) must never let a fresh ordinal re-mint
     `<prefix>-<date>-topup<n>-core-<i>` onto a ticket that is seated under it. */
  const idN = [...entry.core, ...(entry.funT ?? [])].reduce((m, t) => {
    const hit = /-topup(\d+)-/.exec(String(t.id ?? ""));
    const k = hit ? Number(hit[1]) : 0;
    return k > m ? k : m;
  }, 0);
  const attempts = others.length;
  return {
    fire: true,
    room,
    slots,
    used,
    funUsed,
    n: held ? (opts!.claim as number) : Math.max(attempts + 1, maxN + 1, idN + 1),
    core: coreOpen && !coreSpent,
    fun: funOpen && !funSpent,
  };
}
/** today's signature, CFB-bound */
export const decideCfbTopUp = (entry: CfbLedgerEntry, now: number, opts?: { claim?: number }): CfbTopUpDecision => decideTopUp(CFB_LEAGUE, entry, now, opts);

/**
 * CLAIM THE ATTEMPT BEFORE THE SPEND (2026-09-06) — pure; the route writes what this returns.
 *
 * Called at the POINT OF COMMITMENT: past every free refusal, immediately before `slateFromEspn`,
 * which is the only call on this path that touches the Odds API. That placement is the whole
 * point. Claiming earlier would spend attempts on refusals that cost nothing (a poke in the lock's
 * own instant, a Builder day, a day already at $150); claiming later — on success, which is what
 * the first cut did — is exactly the defect: the credits are gone whether or not a ticket seats.
 *
 * The record is the attempt with its money left blank; `applyCfbTopUp` replaces the record with
 * the same `n` if the attempt seats anything, so `topUps.length` is the number of attempts and
 * each entry says what that attempt actually bought. It carries no money, so no money guard runs
 * over it — but it IS a ledger write, and the route writes it the same way it writes a top-up:
 * re-read, replace this date's entry, SET. A claim lost to a racing writer is simply not counted,
 * which is the same outcome as the two pokes racing at all, and is bounded by the racing poke's
 * own claim.
 *
 * A ?dry=1 poke does NOT claim, and so does not consume an attempt while still pricing a board.
 * That is deliberate and stated rather than hidden: `dry` writes nothing at all by contract, and
 * it is reachable only by hand, with the cron secret — no ticker ever sends it.
 */
export function claimTopUp(cfg: LeagueConfig, entry: CfbLedgerEntry, n: number, now: number, arms: { core: boolean; fun: boolean }): CfbLedgerEntry {
  /* `cfg` reads no knob here (2026-09-08): it is the seam's contract — every top-up write on this
     rail names its league, so a caller cannot claim on one desk and apply on the other. The
     source gate itself lives in `decideTopUp`, which runs before any claim is written. */
  void cfg;
  const next: CfbLedgerEntry = { ...entry };
  /* ONLY AN UNFILLED ROW IS REPLACEABLE (2026-09-06, CRITIC 6). This used to filter `r.n !== n`,
     so claiming an ordinal another poke had already COMPLETED erased that poke's record — the
     money it seated stayed on the card while the attempt that seated it vanished from the count.
     A FILLED row is a finished attempt and is never touched by anyone but its own writer; the
     route derives `n` from the freshly-read entry, so a fresh ordinal cannot land on a finished
     row in the first place, and this filter is the guard that keeps that true.

     `isClaimRow` rather than `r.core === 0` since 2026-09-06 (DEFECT M(b)): a completed FUN-ONLY
     attempt carries `core: 0` and must never be erased by a claim at its ordinal. The row written
     here carries `filled: false` and no `fun` count — an attempt in flight has bought nothing yet,
     and the two money fields are filled in together by `applyCfbTopUp`. */
  /* `arms` IS STAMPED AT THE CLAIM, NOT AT THE FILL (2026-09-06, L1). The attempt's cost is the
     PRICED BOARD, and the board is bought one line after this — so the arms that opened the
     attempt are the arms that are charged for it, whatever it goes on to seat or fail to seat.
     Filling it in later would leave an abandoned claim (a crash between here and the write)
     charged to both arms, which is the wrong direction: it would refuse the core a chance it
     never actually spent. See `spentCoreAttempt` / `spentFunAttempt`. */
  (next as Record<string, unknown>).topUps = [
    ...cfbTopUpsOf(entry).filter((r) => !(r.n === n && isClaimRow(r))),
    { at: now, n, core: 0, stake: 0, filled: false, arms: { core: arms.core, fun: arms.fun } },
  ];
  return next;
}
/** today's signature, CFB-bound */
export const claimCfbTopUp = (entry: CfbLedgerEntry, n: number, now: number, arms: { core: boolean; fun: boolean }): CfbLedgerEntry =>
  claimTopUp(CFB_LEAGUE, entry, n, now, arms);

/**
 * GIVE THE ATTEMPT BACK (2026-09-06, the critic's second pass, CRITIC 8) — pure; the route writes
 * what this returns.
 *
 * The claim above is written BEFORE the priced board is bought, which is right: a pull that throws
 * has very probably been billed anyway, so an attempt must be spent by the COMMITMENT, not by the
 * answer. But `slateFromEspn` never throws on an odds outage — `oddsPayload()` maps a missing key,
 * a 401, a 429, a non-array body and a network error alike to `{ events: [], missing: true }` — so
 * an outage came back as a perfectly ordinary board with `oddsMissing: true`, the attempt was
 * charged, and the CFB_TOPUP_RETRY_MS window was armed. The LOCK path treats that exact condition
 * as a refusal (write nothing, 502, mark the odds gap, let the next poke retry); the top-up did
 * not, so TWO transient outages spent CFB_TOPUP_MAX and stranded the day's whole undeployed core
 * while Caesars prices were posted all afternoon.
 *
 * So an outage releases the claim: the unfilled row for this ordinal is removed, and only it — a
 * FILLED row is a completed attempt, another poke's record, and is never rolled back (`isClaimRow`
 * rather than `core === 0` since 2026-09-06, DEFECT M(b), because a completed fun-only attempt
 * carries `core: 0`). What is NOT released is a board that arrived and priced nothing this desk
 * wants: that attempt really did re-price the day, which is the spend `CFB_TOPUP_MAX` bounds.
 */
export function releaseTopUp(cfg: LeagueConfig, entry: CfbLedgerEntry, n: number): CfbLedgerEntry {
  /* same contract as claimTopUp — the league is named, no knob is read */
  void cfg;
  const kept = cfbTopUpsOf(entry).filter((r) => !(r.n === n && isClaimRow(r)));
  const next: CfbLedgerEntry = { ...entry };
  (next as Record<string, unknown>).topUps = kept;
  return next;
}
/** today's signature, CFB-bound */
export const releaseCfbTopUp = (entry: CfbLedgerEntry, n: number): CfbLedgerEntry => releaseTopUp(CFB_LEAGUE, entry, n);

/**
 * THE MONEY GUARD OVER A WHOLE ENTRY (2026-09-06). `assertCfbCardMoney` guards the card the lock
 * builds; a top-up's card is legal on its own ($75 of core is a fine card) and illegal only once
 * it is APPENDED to a day already carrying $75. So the guard that matters for a top-up runs over
 * the merged entry, not over either half — same thresholds, same messages, same "a crash, never a
 * quietly wrong card" contract as src/lib/server/lock-card.ts.
 *
 * The DUPLICATE-TICKET-ID check (2026-09-06, CRITIC 6) matters most here, and it is the reason
 * this function exists as more than a shim: a top-up is the only path that mints ids against an
 * entry it did not build, so a merged entry is the only place two tickets can end up sharing the
 * key the grading map is built on. It is implemented inside `assertCfbCardMoney` so the lock's own
 * card is held to it too, and so there is exactly one place that decides what a duplicate is.
 */
export function assertEntryMoney(cfg: LeagueConfig, entry: CfbLedgerEntry): void {
  assertCardMoney(cfg, {
    date: entry.date,
    core: entry.core,
    funT: entry.funT,
    coreSum: cfbStakeOf(entry.core),
    funSum: cfbStakeOf(entry.funT),
    noPlay: entry.noPlay === true,
    notes: [],
    benched: [],
  });
}
/** today's signature, CFB-bound */
export const assertCfbEntryMoney = (entry: CfbLedgerEntry): void => assertEntryMoney(CFB_LEAGUE, entry);

export type CfbTopUpPlan = {
  tickets: CfbTicket[];
  stake: number;
  /** the fun parlay this top-up would SEAT — at most one, and only onto a day whose fun bucket
      is empty. See planCfbTopUp for why an append here is not a re-stake. */
  fun: CfbTicket[];
  funStake: number;
  games: CfbLedgerEntry["games"];
  pricedAhead: number;
};

/**
 * WHAT A TOP-UP WOULD ADD — pure, and callable twice (2026-09-06).
 *
 * The board is narrowed to the games the CORE is not already on, and `buildCfbCard` is run over it
 * with `daily` set to the ROOM rather than the allotment, so the sizer's own greedy admit / raise
 * does the work and a top-up can never be sized by a different rule than the lock was. What comes
 * back is filtered again on the way out — never past the free ticket slots, never past the room,
 * never onto a game already seated (a game the rebuilt card and an earlier ticket could still
 * share if the board ever repeated a game id) — because this function's output is money.
 *
 * THE FUN BUCKET IS TOPPED UP TOO, ONCE, AND ONLY WHEN IT IS EMPTY (2026-09-06, INSTRUCTION 45 —
 * DEFECT J(a)). Josh's instruction is one sentence with two halves: "the same $150 per day
 * theoretical Core money and $25 Fun money per day". Only the first half had a top-up.
 *
 * THE OLD DOCBLOCK IS WITHDRAWN, not merely superseded. It said the rebuild's fun parlay "is
 * DISCARDED, and no top-up ever touches `funT`", justified as: the bucket is one ticket by
 * construction, so adding to it would mean REPLACING the locked parlay, which the once-per-date
 * lock rule forbids — "a short fun bucket stays short". The justification was sound about the case
 * it described and silently wrong about the case it did not. `buildCfbCard` mints
 * `cfb-<date>-fun-1` only when some 3-to-5-leg combination clears CFB_RULES.fun (decimal 4-40, EV
 * >= -3%); when nothing does, `funT` is EMPTY and there is no locked parlay to replace. Such a day
 * recorded $0 of the $25 for life while the ledger presented it as a complete paper day, and
 * nothing in the poke's answer said so.
 *
 * AN APPEND IS NOT A RE-STAKE. The once-per-date rule protects a bet that already stands: it
 * forbids re-pricing, re-sizing or replacing a ticket Josh's card already carries. Seating the
 * FIRST fun ticket on a day that carries none removes no bet, changes no stake and moves no lock
 * instant — it is the same operation the core top-up already performs, on the same board, under
 * the same money guard. So the rule is `entry.funT.length === 0`, not "top up the fun bucket
 * toward $25": a day that already has its parlay gets NOTHING here, for ever, because the only
 * way to give it more would be to replace what stands.
 *
 * The id is `cfb-<date>-topup<n>-fun-1`, minted in the same shape and from the same ordinal as the
 * core ids below, so the grading map (which is ONE id space across both buckets — see
 * assertCfbCardMoney) can never collide. The stake is whatever `buildCfbCard` sized against
 * `fun: CFB_PAPER.fun`, floored out if it is not positive and refused outright by
 * `assertCfbEntryMoney` if the merged day would ever exceed CFB_PAPER.fun.
 *
 * THAT GAP IS NOW CLOSED, and the paragraph that stood here is WITHDRAWN rather than left to rot
 * (2026-09-06, DEFECT M(a)). It said, correctly at the time: "a day whose CORE is fully deployed
 * but whose fun bucket is empty never reaches this function at all, because `decideCfbTopUp`
 * refuses for free on 'the day is fully deployed', which reads the CORE only" — i.e. the code above
 * could seat the fun money and the gate above it never let anything ask. `decideCfbTopUp` now runs
 * the two allotments as INDEPENDENT arms, so a full-core day with an empty bucket reaches this
 * function with `room` at or near $0 and `slots` possibly 0: `buildCfbCard`'s admit loop then seats
 * no core ticket (its admit loop breaks on `room() < R.minStake`, where `R` is that file's own
 * alias for CFB_RULES — grepped in src/lib/cfb/card.ts this turn) while its fun parlay, gated at
 * CFB_RULES.fun.minEvPct = -3 against the core's minEvPct = 2, still clears. A plan of NO core
 * tickets and ONE fun ticket is therefore an ordinary, expected outcome on this path — and it is
 * written, not discarded (DEFECT M(b), see the route's write block and `applyCfbTopUp`).
 *
 * IDS: `cfb-<date>-topup<n>-core-<i>`, where `i` counts on from the CORE THIS PLAN IS APPENDED TO
 * — `entry.core.length + tickets.length + 1` — not from 1 (CORRECTED 2026-09-06, the critic's
 * second pass, CRITIC 6).
 *
 * The old docblock claimed this was "stable and collision-free by construction … a collision would
 * silently overwrite a settled ticket's verdict", and the second half was the only true half. `i`
 * restarted at 1 on every plan, so the WHOLE of the collision-freedom rested on `n` never
 * repeating — and it did repeat: two overlapping pokes both derived ordinal 1 from the same stored
 * snapshot, and the second re-minted `cfb-<date>-topup1-core-1` onto a different game while the
 * first one's ticket of that name was already seated and settled. `decideCfbTopUp` now refuses to
 * re-use an ordinal at all, which is the real fix; counting `i` on from the entry's own core is
 * the belt to that braces. A repeat ordinal would now have to appear on an entry whose core is
 * ALSO the same length — i.e. one that does not yet carry the tickets it would collide with —
 * which is a contradiction, and `assertCfbEntryMoney` throws if it ever stops being one.
 */
export type TopUpPlanOpts = { now: number; bankroll: number; room: number; slots: number; n: number };

export function planTopUp(cfg: LeagueConfig, board: CfbBoard, entry: CfbLedgerEntry, opts: TopUpPlanOpts): CfbTopUpPlan {
  const seated = cfbCoreGamesOf(entry);
  const games = board.games.filter((g) => !seated.has(g.id));
  const pricedAhead = cfbPricedAhead(games, opts.now);
  if (!pricedAhead) return { tickets: [], stake: 0, fun: [], funStake: 0, games: {}, pricedAhead };

  const rest: CfbBoard = { ...board, games };
  const card = buildCfbCard(rest, { bankroll: opts.bankroll, daily: opts.room, fun: cfg.paper.fun, now: opts.now, rules: cfg.rules, idPrefix: cfg.idPrefix });
  const byId = new Map(games.map((g) => [g.id, g]));
  const tickets: CfbTicket[] = [];
  const gmap: CfbLedgerEntry["games"] = {};
  let stake = 0;
  for (const t of card.core) {
    if (tickets.length >= opts.slots) break;
    if (stake + t.stake > opts.room + MONEY_EPS) break;
    if (t.legs.some((l) => seated.has(l.gkey))) continue;
    tickets.push({ ...t, id: `${cfg.idPrefix}-${entry.date}-topup${opts.n}-core-${entry.core.length + tickets.length + 1}` });
    stake += t.stake;
    for (const l of t.legs) {
      seated.add(l.gkey);
      const g = byId.get(l.gkey);
      if (g && !gmap[l.gkey]) gmap[l.gkey] = { pk: Number(g.id), start: g.start, home: g.home.name, away: g.away.name };
    }
  }
  /* THE FUN BUCKET, at most one ticket and only onto a day that carries none. The games map is
     extended for its legs too — the grader keys the 48-hour void window off `entry.games`, so a
     fun leg on a game no core ticket sits on would otherwise have no recorded kickoff and fall
     back to the end of the date (src/lib/cfb/grade.ts `kickoffOf`). The board was narrowed to the
     games the seated core is not on, so a top-up fun leg can never land on an already-staked game;
     it CAN share a game with a core ticket THIS SAME plan is seating, exactly as it can on the
     lock's own card — `buildCfbCard` builds the parlay from every playable row without consulting
     `usedGames`, and CFB_RULES.oneLegPerGame is a rule about the CORE set (see cfbCoreGamesOf).

     ── THE DEAD CAP IS GONE (INSTRUCTION 45, mutation survivor R26, 2026-09-06) ───────────────
     The seat below used to be a `for (const t of card.funT)` loop carrying a running `funStake`
     and two breaks: `if (fun.length >= 1) break;` first, then `if (!(t.stake > 0) || funStake +
     t.stake > CFB_PAPER.fun + MONEY_EPS) break;`. The FIRST break bounds the loop to one
     iteration, so `funStake` is still 0 when the second is evaluated and the allotment half of it
     degrades to the per-ticket test `t.stake > CFB_PAPER.fun` — which no builder in this repo can
     fail, because `buildCfbCard` stakes the parlay at exactly the `fun` it is handed
     (src/lib/cfb/card.ts, the FUN section: `funT.push(finish(`cfb-${board.date}-fun-1`, "fun",
     name, d, opts.fun));`) and `planCfbTopUp` hands it `fun: CFB_PAPER.fun` above. A mutant that
     deleted the whole `funStake + t.stake > CFB_PAPER.fun + MONEY_EPS` clause survived the suite,
     which is the proof: nothing reaches it. A guard that cannot fire is worse than no guard,
     because it reads as the thing bounding the $25 and it is not.

     REMOVED, NOT MADE REACHABLE. Making it reachable would be theatre in the other direction:
     `card.funT` never holds more than one ticket (`buildCfbCard` pushes exactly one parlay, at
     the id `cfb-<date>-fun-1`), so a running sum over it would be a sum of one term forever. So
     the seat is written as what it actually is — ONE candidate, taken or not taken — and the $25
     is bounded by three live things, none of them dead:
       (i)   THE EMPTY-BUCKET GATE, which since 2026-09-06 (S2) also reads `cfbFunRefusedOf` — the
             candidate is taken only when the bucket is empty AND carries no merge refusal receipt
             — plus the fixed id `cfb-<date>-topup<n>-fun-1`. A second parlay on one date would
             collide in the grading map's id space, and `assertCfbCardMoney` throws `appears twice`
             for it. The refusal half is why the gate is read here as well as in `decideCfbTopUp`:
             the route calls this function whenever the decision FIRES, whichever arm opened it, so
             a core-only fire would otherwise seat a parlay the fun arm had just been barred from.
       (ii)  `buildCfbCard` sizing the parlay at `opts.fun`, i.e. `CFB_PAPER.fun`: the candidate's
             stake IS the allotment, not something measured against it.
       (iii) `assertCfbCardMoney`'s `if (funSum > CFB_PAPER.fun + MONEY_EPS) {` throw, reached
             from `assertCfbEntryMoney` at the END of `applyCfbTopUp` over the MERGED day — so it
             sees `entry.funT` and `plan.fun` together, which is the only place the real sum
             exists. That is the reachable, loud bound, and it is what the pin drives.
     `!(t.stake > 0)` STAYS, SPELLING AND ALL. It is a LIVE guard, not a dead one: a card builder
     can hand back a parlay the sizer floored to $0, and a $0 ticket is not money. The negated form
     is deliberate — it refuses NaN and undefined as well as zero — and it is pinned BY NAME in a
     file this round does not own (tests/cfb-lock-route.test.ts, "D3(c): A FUN PARLAY SIZED AT $0
     IS NEVER SEATED", whose closing assertion is `expect(readSrc("src/lib/cfb/lock-server.ts")).
     toMatch(/!\(t\.stake > 0\)/);`, grepped this turn). The candidate keeps the name `t` for the
     same reason. That pin is why `noStake` is written the long way round rather than as
     `t.stake <= 0`, and rewriting either would take a guard the desk relies on out of the source a
     test reads — so it stands exactly as it was. tests/cfb-grade.test.ts C4(c) pins the behaviour
     beside it. */
  const fun: CfbTicket[] = [];
  let funStake = 0;
  const t = entry.funT.length || cfbFunRefusedOf(entry).length ? undefined : card.funT[0];
  const noStake = !t || !(t.stake > 0);
  if (t && !noStake) {
    fun.push({ ...t, id: `${cfg.idPrefix}-${entry.date}-topup${opts.n}-fun-1` });
    funStake = t.stake;
    for (const l of t.legs) {
      const g = byId.get(l.gkey);
      if (g && !gmap[l.gkey]) gmap[l.gkey] = { pk: Number(g.id), start: g.start, home: g.home.name, away: g.away.name };
    }
  }

  return { tickets, stake, fun, funStake, games: gmap, pricedAhead };
}
/** today's signature, CFB-bound */
export const planCfbTopUp = (board: CfbBoard, entry: CfbLedgerEntry, opts: TopUpPlanOpts): CfbTopUpPlan => planTopUp(CFB_LEAGUE, board, entry, opts);

/**
 * THE APPENDED ENTRY (2026-09-06). Append only: `lockedAt`, `source`, `daily`, `fun` and every
 * existing ticket — core AND fun — come through byte for byte; a top-up never re-stakes a game,
 * never lowers a stake and never moves the lock instant. The games map is UNIONED with the
 * existing one winning, so the grader keeps the snapshot the day was locked against and still
 * gains the rows it needs for the new legs.
 *
 * `funT` was on that byte-for-byte list until 2026-09-06 (DEFECT J) because nothing could append
 * to it. It now gains AT MOST the day's FIRST fun parlay, and only when it was empty — an append,
 * never a replacement, which is why the once-per-date lock rule is untouched. See planCfbTopUp.
 *
 * HONESTY: the note is extended, not replaced. Josh reads `locked.note` straight under the card
 * (src/components/cfb/CfbBuilder.tsx), so a day that is $150 because a later poke added $75 must
 * say so — which top-up it was, when it ran, how many tickets and how much it added, and what the
 * day now carries. `noPlay` is dropped when the top-up seats the first ticket of the day, because
 * a day with money on it is not a no-play day whatever the morning looked like.
 *
 * The money guard runs over the MERGED entry, and the ledger's own validator runs after it, so a
 * broken top-up throws before anything can be written — the route catches it, reports it under
 * `topUp`, and the day keeps exactly the money it already had.
 *
 * `n` is the attempt's own ordinal, passed in rather than derived from `topUps.length`, because
 * since 2026-09-06 the record for this attempt was CLAIMED before the priced board was bought and
 * is REPLACED here, not appended to. It is the same `n` the plan minted its ids from, so the note
 * Josh reads, the ids on the ledger and the row in `topUps` all name the same attempt.
 */
export function applyTopUp(cfg: LeagueConfig, entry: CfbLedgerEntry, plan: CfbTopUpPlan, now: number, n: number): CfbLedgerEntry {
  /* REPLACE THIS POKE'S OWN CLAIM, don't append (2026-09-06): this attempt CLAIMED its record
     before it bought a board, so the row with this ordinal already exists and is being filled in.
     `topUps.length` is therefore the number of ATTEMPTS, which is what CFB_TOPUP_MAX bounds. The
     one case where the claim is not there to replace — a racing writer overwrote the blob between
     the claim and this write — is covered by appending, so an attempt is never lost from the count
     in the direction that would let it repeat.

     NARROWED 2026-09-06 (CRITIC 6) from `r.n !== n` to "an UNFILLED row with this ordinal": a
     FILLED row is a COMPLETED attempt, and erasing another poke's completed attempt is exactly how
     the two-poke race defeated the cap. "Unfilled" is `isClaimRow`, not `core === 0`, since
     2026-09-06 (DEFECT M(b)) — the row written just below may carry `core: 0` and still be a
     finished attempt, because a top-up may complete having seated only the day's fun parlay. The old filter was justified in part as making
     the write "idempotent under a retry"; that claim is withdrawn rather than left standing over
     code that no longer supports it. Applying twice at one ordinal now records two attempts, which
     over-counts — the direction that refuses MORE spending, never less — and cannot happen on this
     path anyway, because every request claims before it writes and `decideCfbTopUp` never hands
     out an ordinal that a row already carries. */
  /* THE ARMS COME FROM THE CLAIM THIS ROW REPLACES (2026-09-06, L1). The claim was written at the
     point of commitment and already says which allotments were open when the board was bought;
     the fill must not re-derive them from what was seated, or a fun-only attempt that happened to
     find a core ticket would rewrite its own cost. When there is no claim to replace — a racing
     writer overwrote the blob between the claim and this write — the row carries no `arms` and is
     therefore counted against BOTH, the direction that refuses more spending. */
  const rows = cfbTopUpsOf(entry);
  const claim = rows.find((r) => r.n === n && isClaimRow(r));
  const topUps = [
    ...rows.filter((r) => !(r.n === n && isClaimRow(r))),
    { at: now, n, core: plan.tickets.length, stake: plan.stake, fun: plan.fun.length, filled: true, ...(claim?.arms ? { arms: claim.arms } : {}) },
  ];
  const core = [...entry.core, ...plan.tickets];
  const staked = cfbStakeOf(core);
  /* THE FUN BUCKET (2026-09-06, DEFECT J). `plan.fun` is non-empty only when the day carried NO
     fun ticket at all (planCfbTopUp's own rule), so this appends the day's FIRST parlay and can
     never replace one that stands. `core` and `stake` on the row above go on meaning CORE tickets
     and CORE stake — nothing that reads an existing ledger row changes meaning — and the attempt's
     fun money is recorded ALONGSIDE them in `fun` rather than folded into either (2026-09-06,
     DEFECT M(b)). What DID change is how "an empty attempt" is read: it is `filled`, the row's own
     statement, not `core === 0`, which a completed fun-only attempt also satisfies. */
  const funT = [...entry.funT, ...plan.fun];
  const funStaked = cfbStakeOf(funT);
  const next: CfbLedgerEntry = {
    ...entry,
    core,
    funT,
    games: { ...plan.games, ...(entry.games ?? {}) },
    /* HONESTY, now for BOTH halves of the instruction: Josh reads `locked.note` straight under the
       card (src/components/cfb/CfbBuilder.tsx), so a day that gained fun money must say so — and a
       day that could not must say THAT, because the $0-of-$25 day is the one this defect lived on
       and its silence is what let it stand. */
    note: `${entry.note ?? ""} · Top-up ${n} at ${new Date(now).toISOString()}: ${plural(plan.tickets.length, "core ticket")} for $${plan.stake} — the day now carries $${staked} of the $${cfg.paper.daily}. Fun: ${plan.fun.length ? `+$${plan.funStake}` : "nothing added"} — $${funStaked} of the $${cfg.paper.fun}.`.trim(),
  };
  (next as Record<string, unknown>).topUps = topUps;
  /**
   * A DAY WITH MONEY ON IT IS NOT A NO-PLAY DAY — WHICHEVER BUCKET THE MONEY LANDED IN
   * (widened 2026-09-06, INSTRUCTION 45, L1/A15).
   *
   * The test was `core.length` alone, and until this round that was exact: `buildCfbCard` returned
   * from inside its CORE section when nothing cleared the +2% gate, so a NO-PLAY card had an empty
   * fun bucket by construction and only a core ticket could ever arrive on such a day.
   *
   * src/lib/cfb/card.ts changed that in this same round: the fun allotment is now gated
   * independently of the core, so a board with no +2% side and a grade-D pool seats the $25 and is
   * NOT a no-play — and, on the top-up path, `planCfbTopUp` can return a plan of ONE fun ticket and
   * no core ticket at all. Appending that to a locked NO-PLAY day left `noPlay: true` standing over
   * $25 of live money, and src/components/cfb/CfbBuilder.tsx renders a no-play banner off that
   * flag. The condition is now "did this attempt seat ANY money", which is what the flag has always
   * meant (src/lib/cfb/card.ts: "noPlay — nothing staked at all — no core ticket AND no fun
   * parlay"). A top-up that seats nothing still leaves the honest flag exactly where it was.
   *
   * ...AND THE TEST IS STAKED MONEY, NOT A ROW COUNT (INSTRUCTION 45, 2026-09-06, DEFECT C3 — a
   * REGRESSION against the kernel, which moved first). This read `(core.length || funT.length)`,
   * and `mergeDay` (src/lib/ledger-merge.ts) says, verbatim today:
   *
   *     if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete out.noPlay;
   *
   * Two rails, one flag, two rules: the same day could come back a no-play from the merge and a
   * played day from this write path. The kernel's reasoning is the right one and is simply adopted
   * here — `noPlay` is a claim about the CARD ("the day locked with nothing staked"), a $0 row
   * stakes nothing, so ending the claim on a row's EXISTENCE reports a day as played over $0.00 of
   * exposure. The two sums this needs were already computed three lines up for the note Josh reads,
   * so the flag and the money now answer off ONE number instead of two. MONEY_EPS is this file's
   * name for the kernel's literal 1e-9 (see `assertCfbCardMoney`), not a different tolerance.
   *
   * A $0 CORE ticket never reaches this line at all — `assertCfbEntryMoney` below throws on any
   * core stake outside the $CFB_RULES.minStake–$maxStake band — and a $0 FUN ticket is refused a
   * step earlier still, by `planCfbTopUp`'s own `!(t.stake > 0)` guard. Both are pinned in
   * tests/cfb-grade.test.ts under C3; this line is the rail that must agree with the kernel
   * whatever those two do, not the thing that stops a $0 ticket being written.
   */
  if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete next.noPlay;
  /**
   * A DAY THAT GAINS MONEY IS NOT A FINISHED DAY (2026-09-06, the critic's second pass, CRITIC 7).
   *
   * This function appended core tickets and never touched `grading`. If the entry already carried
   * `grading.done === true`, the appended tickets were ungraded on a day that called itself
   * finished — and `cfbSettleCandidate` refuses a date whose `grading.done` is true, so the settle
   * pass would never list it again and the server never graded the money it had just deployed.
   * MEASURED: $75 of freshly-deployed core scored "pending" forever by cfbLedgerStats, contributing
   * 0 to realizedPL — the exact bankroll freeze the settle pass exists to end. Reachable through a
   * zero-ticket no-play day graded on the phone (`gradeCfbEntry` over an empty ticket set returns
   * `done: true` via `[].every()`), synced up, and topped up later by the server.
   *
   * `mergeDay` (src/lib/ledger-merge.ts) has exactly this rule for exactly this reason — "any
   * ticket without a grade reopens grading so the auto-grader picks it up" — but the top-up write
   * path does not merge (the route replaces the date's entry with a raw `cur.map`), so nothing
   * reopened it server-side. Mirrored here rather than routed through mergeDay, which would have to
   * choose a base between two copies of one day.
   *
   * The grading object is DEEP-COPIED before `done` is lowered: `next` is a shallow spread of
   * `entry`, so mutating it in place would rewrite the caller's own entry — and the caller is the
   * route's write block, holding the copy it must fall back to if this throws.
   */
  const grading = next.grading;
  if (grading?.done) {
    const graded = grading.tickets ?? {};
    if ([...core, ...(next.funT ?? [])].some((t) => !(t.id in graded))) {
      next.grading = { ...grading, tickets: { ...graded }, legs: { ...(grading.legs ?? {}) }, done: false };
    }
  }
  /* INSTRUCTION 48 (2026-09-09): "it can never remove a pick it can only add to it". */
  assertAppendOnly(entry, next, "applyTopUp");
  assertEntryMoney(cfg, next);
  const v = validateCfbLedger([next], cfg);
  if (!v.ok) throw new Error(`topped-up entry failed the ${cfg.short} ledger's own validator: ${v.error}`);
  return next;
}
/** today's signature, CFB-bound */
export const applyCfbTopUp = (entry: CfbLedgerEntry, plan: CfbTopUpPlan, now: number, n: number): CfbLedgerEntry => applyTopUp(CFB_LEAGUE, entry, plan, now, n);

/* ---------- B. THE SETTLE PASS ---------- */

type CfbGrading = NonNullable<CfbLedgerEntry["grading"]>;

/* THE TWO SETS ARE DIFFERENT QUESTIONS, and conflating them was the bug (2026-09-06).
   SETTLED answers "may this verdict be overwritten": won / lost / push is a scored result and a
   server pass must never replace one the phone graded. RESOLVED answers "is this poke DONE with
   the ticket for now": that ALSO includes `ungradable` — the void ANY leg still pending 48 h past
   its kickoff becomes, whatever status ESPN last reported for the game (CFB_UNGRADABLE_MS,
   src/lib/cfb/grade.ts; widened 2026-09-06 from postponed-or-absent to the clock alone, DEFECT
   I(a)).

   A VOID IS PROVISIONAL, NOT TERMINAL — the claim that stood here, "no later read of any
   scoreboard will ever turn a void into a score", is WITHDRAWN (INSTRUCTION 45, 2026-09-06, L3).
   It was never true and DEFECT S1 is the proof: a game ESPN carried as postponed can be replayed
   and finalised days later, so the settle pass now re-reads a voided date for CFB_VOID_RECHECK_MS
   and a real final inside that window DOES replace the void (see `overlayCfbGrading` above, which
   also states what it demands of that late read before it will let it land). `ungradable` is in
   RESOLVED so a stuck date stops being poked and never starves a fresh one of the
   CFB_SETTLE.maxDatesPerPoke slots — that is ALL it means. It is not in SETTLED for the same
   reason it never was: if a later read, or the phone grading the rescheduled game and syncing it
   up, produces a real verdict, the overwrite guard must let it land. */
const SETTLED = new Set(["won", "lost", "push"]);
const RESOLVED = new Set(["won", "lost", "push", "ungradable"]);
const isSettled = (r: string | undefined) => r != null && SETTLED.has(r);
const isResolved = (r: string | undefined) => r != null && RESOLVED.has(r);

/**
 * A PUSH THE DESK BOOKED OFF A 0-0 READ (INSTRUCTION 45, 2026-09-06, DEFECT C1 — the correction
 * half; the grader's half shipped the same day).
 *
 * WHAT WENT WRONG, AND WHY THE GRADER'S FIX DID NOT FINISH IT. `gradeCfbLeg` read a score with
 * `Number()`, and `Number(null)` / `Number("")` are both a finite 0 — so a final whose scores were
 * JSON null or blank graded as a genuine nil-all TIE and the ticket as a PUSH with the stake
 * handed back. `readScore` (src/lib/cfb/grade.ts) now refuses those shapes, so NOTHING will book
 * this verdict again. That fix is FORWARD-ONLY, and the days already booked are the money: `push`
 * is in SETTLED, so `overlayCfbGrading` below refuses to overwrite it; `done` is true with no void
 * on the day, so `cfbSettleCandidate` refused the date and no later ESPN read was ever made for
 * it; and `ticketPL` (src/lib/bankroll.ts) pays out only `won` and `lost` and returns 0 for a push.
 * A real winner or loser is therefore booked at $0 P/L PERMANENTLY, and cfbBankroll — which
 * Kelly-sizes every later day — is low by that amount for ever, with no marker anywhere saying so.
 *
 * THE EVIDENCE IS THE STORED LEG LINE, because it is the only place the score survives. The
 * TICKET's own detail is `settle()`'s "every leg pushed — stake returned" and carries no score at
 * all; the LEG detail is `${score} · …` from `gradeCfbLeg`, so a leg pushed off a 0-0 read reads
 * "0-0 · tie" (moneyline), "0-0 · margin +0 vs +0 · push" (spread) or "0-0 · total 0 vs 0 · push"
 * (total). All three start "0-0 · ", which is what this matches.
 *
 * A REAL 0-0 FINAL IS INDISTINGUISHABLE FROM THE PHANTOM, AND THAT IS EXACTLY WHY THIS IS SAFE.
 * MEASURED (the pin "the phantom push is byte-identical to a REAL 0-0 push" in
 * tests/cfb-grade.test.ts): today's grader over `fin(0, 0)` produces the stored fixture byte for
 * byte — leg `{ result: "push", detail: "0-0 · tie" }`, ticket `{ result: "push", payout: 25,
 * dec: 1 }`, `done` true. So the two cases cannot be told apart from the ledger, and they do not
 * need to be: a later read of a game that really WAS 0-0 re-grades to that identical push, so the
 * replacement is a no-op. Only a game whose score was never really 0-0 changes, which is the whole
 * defect. The exception can correct; it cannot fabricate.
 *
 * IT IS NOT A GENERAL DOOR ONTO SETTLED VERDICTS. The settled guard is load-bearing — it is what
 * stops a server pass replacing a verdict the phone graded and synced up — and it is untouched for
 * every other shape: a win, a loss, and an ordinary push on a real score (a spread push at
 * "47-7 · margin +40 vs -40 · push") are all still refused by everything, pinned. This exception
 * needs BOTH halves: the stored shape above AND the SAME corroboration bar the void exception
 * already demands (every leg of the ticket settled in the INCOMING leg map — see
 * `overlayCfbGrading`). One rule, reused, rather than a second one to keep in step with the first.
 */
const ZERO_READ = /^0-0 · /;
const zeroReadPush = (r: { result?: string; detail?: string } | undefined): boolean =>
  r?.result === "push" && typeof r.detail === "string" && ZERO_READ.test(r.detail);

/** Does this ticket's STORED verdict look like one booked off a 0-0 read? A push over at least one
    leg whose recorded line carries the 0-0 score. Used by the overlay's exception and by
    `cfbSettleCandidate`, so the thing that may be corrected and the thing that keeps ASKING for the
    correction can never disagree about which days they are. */
function zeroReadTicket(g: CfbGrading | null | undefined, t: CfbTicket): boolean {
  if (g?.tickets?.[t.id]?.result !== "push") return false;
  return (t.legs ?? []).some((l) => zeroReadPush(g.legs?.[l.lkey]));
}

/**
 * THE OVERLAY RULE, SERVER SIDE (2026-09-06) — a deliberate twin of `overlayGrading` in
 * src/lib/cfb/store.ts, which is module-private AND lives in a `"use client"` file: importing it
 * here would drag the device's localStorage module into a server route. Copied rather than lifted
 * because moving it would edit a file this change does not own; this docblock exists so the two
 * can be kept honest against each other.
 *
 * PARITY, RE-VERIFIED 2026-09-06 BY READING src/lib/cfb/store.ts THIS TURN (INSTRUCTION 45 —
 * DEFECT L). An earlier revision of this block asserted, in the present tense, that the rule here
 * was IDENTICAL to the twin's — and for a while it was not: this copy had already dropped
 * `if (!cur) return inc;` and moved `done` onto the RESOLVED set while the device copy still
 * carried the bypass and still computed `done` with `settled(...)`. A parity claim is only worth
 * having if it is checked, so here is what the twin ACTUALLY holds, read rather than assumed:
 *
 *   its `SETTLED` / `RESOLVED`   the same two sets, same members: SETTLED = won/lost/push,
 *                                RESOLVED = won/lost/push/ungradable.
 *   `overlayGrading`, first line `if (!inc) return cur ?? null;` and NOTHING else before the
 *                                merge — the `if (!cur) return inc;` bypass is gone there too.
 *   its two merge loops          the same overwrite guard on BOTH maps: a ticket or leg whose
 *                                stored result is SETTLED is never replaced; anything else takes
 *                                the incoming verdict.
 *   its `done`                   recomputed from the ENTRY's own tickets with the RESOLVED set.
 *
 * (DE-LINE-IFIED 2026-09-06, DEFECT S3. Those four claims were cited as store.ts:141-142 /
 * 174-175 / 176-183 / 184; re-read this turn, all four still pointed at the right code, but that
 * file is edited by other work and a line number is a fact about a neighbour's edits rather than
 * about the code it names. The symbols above cannot drift.)
 *
 * A THIRD DIFFERENCE, AND THIS ONE DOES CHANGE A VERDICT (INSTRUCTION 45, 2026-09-06, DEFECT C1).
 * The body below now accepts a CORROBORATED final over a stored `push` whose leg line records a
 * 0-0 read — see `zeroReadTicket` above — and the device twin does NOT: it is a `"use client"`
 * file this change does not own, and its `overlayGrading` still refuses every settled verdict
 * without exception. The parity note says so rather than letting the paragraph above read as
 * though the two were still identical.
 *
 * IT IS THE MILDER HALF, the same shape DEFECT S1 left on the device and for the same reasons: the
 * SERVER writes the money and the bankroll, and the phone's sync pull takes the richer copy, so
 * a corrected verdict reaches the phone from the cloud. A phone that never syncs keeps the phantom
 * push. THAT PULL IS `syncCfbNow` (src/lib/cfb/sync.ts), which runs `cfbEntriesOf(mergeLedgers(
 * local, remote))` — the kernel's own `mergeLedgers` from src/lib/ledger-merge.ts, whose `mergeDay`
 * picks the richer copy with `pickBase` (grading richness first). NAMED CORRECTLY 2026-09-06
 * (INSTRUCTION 45, the closing round's defect C3): this sentence used to cite `mergeCfbLedger` as
 * "the device's own merge", and GREPPED THIS TURN there is no such symbol anywhere in the repo. A
 * citation is a claim; that one was false in both halves — the name, and the idea that the device
 * has a merge of its own rather than sharing the kernel's. Closing it there means the same exception in src/lib/cfb/store.ts (and the `!e.grading?.done`
 * queue in src/components/cfb/CfbLedger.tsx, which never revisits a done day at all), both outside
 * what this change owns; it is written down here rather than left for the next reader to find.
 *
 * So the rule is in step again apart from that. TWO FURTHER DIFFERENCES REMAIN and neither changes
 * a verdict, but naming them is the point of a parity note: the helpers are spelled `settled` / `resolved` there and
 * `isSettled` / `isResolved` here (this file already had `stakes`-style names in scope), and the
 * device writes `entry.funT ?? []` where this writes `entry.funT`. `funT` is required by
 * `CfbLedgerEntry` (src/lib/cfb/types.ts, the `funT: CfbTicket[]` field — de-line-ified from
 * `types.ts:212` on 2026-09-06, DEFECT S3, for the same reason as the four above), so the
 * device's coalesce is defence against a
 * hand-edited localStorage blob, which the server never reads — the server reads a validated
 * ledger and would rather throw than silently grade a day whose fun bucket it cannot see.
 *
 * A SETTLED result (won / lost / push) is NEVER overwritten — that is what protects a verdict the
 * phone graded and synced up from being replaced by a server pass reading a scoreboard that has
 * since changed. A pending, ungradable or missing verdict takes the incoming one. BOTH halves of
 * that rule are load-bearing and both are pinned: the ticket map is the record, and the leg map is
 * what src/components/cfb/CfbTicketCard.tsx prints under each ticket.
 *
 * `done` MEANS "nothing further can be learned about this day", and it is recomputed from the
 * ENTRY's own tickets so it can never claim more than the merged map holds. It counts a ticket
 * RESOLVED when it is won, lost, push OR ungradable — the same rule `gradeCfbEntry` applies with
 * `result !== "pending"` (src/lib/cfb/grade.ts), deliberately mirrored rather than invented.
 *
 * CORRECTED 2026-09-06, twice, and the two corrections are one defect wearing two hats:
 *
 *   (a) this docblock used to claim `done` was "strictly stricter than gradeCfbEntry's own done,
 *       which counts an ungradable ticket as finished; a day carrying a void is not a scored day
 *       here". That reads like a safety property; measured, it was a starvation bug. A postponed,
 *       cancelled, abandoned or otherwise never-finalised game grades `ungradable` 48 h after its
 *       kickoff, so such a date could never
 *       reach `done`, `cfbSettleCandidate` stayed true for it forever, and the settle pass spent
 *       one ESPN read per poke rewriting byte-identical grading. With CFB_SETTLE.maxDatesPerPoke
 *       = 2, TWO stuck dates consumed the entire per-poke budget and every newer date was
 *       deferred forever — so cfbBankroll stopped moving, which is the exact failure the settle
 *       pass was built to end, and it sizes every later card through ticketKelly. `done` over a
 *       void means what the device means by it: src/components/cfb/CfbLedger.tsx prints voids
 *       beside the record rather than waiting on them, so the pass stops poking the date. It does
 *       NOT mean the verdict is final — that claim is withdrawn (2026-09-06, INSTRUCTION 45, L3):
 *       DEFECT S1 re-reads a voided date for CFB_VOID_RECHECK_MS, and the block at the head of the
 *       body below says exactly what a late read must show before it may overwrite the void.
 *
 *   (b) `if (!cur) return inc` bypassed the whole rule on a first pass, so `done` came from
 *       `gradeCfbEntry` when no grading existed yet and from this function on every later pass.
 *       The same day was therefore finished or unfinished according to whether an earlier poke
 *       happened to run — an order-dependent verdict on money. The clause is gone: an absent
 *       `cur` is simply an empty one, the same rule runs on every pass, and overlaying twice
 *       equals overlaying once (pinned).
 */
export function overlayCfbGrading(cur: CfbGrading | null | undefined, inc: CfbGrading | null | undefined, entry: CfbLedgerEntry): CfbGrading | null {
  if (!inc) return cur ?? null;
  /**
   * A VOID IS REPLACED ONLY BY A CORROBORATED FINAL (INSTRUCTION 45, 2026-09-06, L2).
   *
   * DEFECT S1 reopened a voided date for CFB_VOID_RECHECK_MS so a game that finalises late can
   * still be scored — right for the money, and it opened a door that was shut before it. Inside
   * that seven-day window a SINGLE later ESPN read may overwrite a real 48-hour void with a win or
   * a loss; `ungradable` is deliberately not in SETTLED, so nothing refused it, and the replacement
   * IS settled, so nothing could ever correct it afterwards. Before this round a voided day was
   * closed for good and no later read could rewrite it at all.
   *
   * The shapes that produce a wrong verdict from one read are ordinary — a scoreboard correction, a
   * gkey resolving to the wrong game, a payload `finalsFromEspn` mis-parses — and `settle()`
   * (src/lib/cfb/grade.ts) carries two of its own: it returns "lost" as soon as ANY leg lost, with
   * the other legs still unread, and it hands a LEGLESS ticket a "push" with the stake back through
   * its `stood === 0` arm.
   *
   * So a stored `ungradable` may be replaced only when EVERY leg of that ticket was graded from a
   * game ESPN reported `final` with both scores finite — which is exactly the condition
   * `gradeCfbLeg` requires before it returns won / lost / push, so "every leg SETTLED in the
   * INCOMING leg map" is that test, read off what the grader itself computed rather than re-derived
   * here. A leg-level push IS corroboration: it comes from a real final. A ticket-level push over
   * NO legs is not, and neither is a verdict derived while a leg has no final at all.
   *
   * WHAT IT COSTS, stated rather than buried: a parlay with one genuinely lost leg and one leg that
   * never finalises stays a $0 void instead of being booked at −stake. That is the direction this
   * desk was already in before DEFECT S1 (the void was terminal), it is the conservative one, and
   * `ticketPL` scores it 0 either way until the missing game finalises — at which point the whole
   * ticket IS corroborated and the real verdict lands.
   *
   * Everything else about this function is unchanged: a stored result that is pending or missing
   * still takes the incoming verdict, and a SETTLED one is still never touched by anything. The LEG
   * map is deliberately NOT gated — a leg verdict is not money, it is what
   * src/components/cfb/CfbTicketCard.tsx prints, and a leg that reports a real final should say so
   * under a ticket the desk is still calling void.
   */
  const legsOf = new Map<string, CfbLedgerEntry["core"][number]["legs"]>();
  for (const t of [...entry.core, ...entry.funT]) legsOf.set(t.id, t.legs ?? []);
  const corroborated = (id: string): boolean => {
    const ls = legsOf.get(id);
    if (!ls?.length) return false;
    return ls.every((l) => isSettled(inc.legs?.[l.lkey]?.result));
  };
  /**
   * THE ONE SETTLED SHAPE THAT MAY BE CORRECTED (INSTRUCTION 45, 2026-09-06, DEFECT C1). A stored
   * `push` whose leg line records a 0-0 read — see `zeroReadTicket` above for what that is, why the
   * stored bytes are the only evidence, and why a genuine 0-0 re-grades to the identical push so
   * the exception cannot fabricate a verdict. It reuses `corroborated` rather than inventing a
   * second bar: the same every-leg-settled test the void exception demands.
   */
  const zeroRead = (id: string): boolean => {
    const ls = legsOf.get(id);
    if (!ls?.length) return false;
    return cur?.tickets?.[id]?.result === "push" && ls.some((l) => zeroReadPush(cur?.legs?.[l.lkey]));
  };
  const tickets = { ...(cur?.tickets ?? {}) };
  /* WHICH TICKETS THIS PASS ACTUALLY RE-DERIVED — the input to the leg bar below (INSTRUCTION 45,
     2026-09-06, DEFECT C2 of the closing round). An id lands here when its verdict was taken from
     `inc`, whether because nothing settled was stored or because the 0-0 exception let a
     correction through. A ticket whose stored verdict SURVIVED this pass is not in it. */
  const reGraded = new Set<string>();
  for (const [id, g] of Object.entries(inc.tickets ?? {})) {
    if (!g) continue;
    const stored = tickets[id]?.result;
    if (isSettled(stored) && !(zeroRead(id) && corroborated(id))) continue;
    if (stored === "ungradable" && !corroborated(id)) continue;
    tickets[id] = g;
    reGraded.add(id);
  }
  /* THE LEG MAP TAKES THE SAME EXCEPTION, and only it (2026-09-06, DEFECT C1). A leg is not money
     — it is what src/components/cfb/CfbTicketCard.tsx prints under the ticket — but a ticket
     corrected to "won" above a line still reading "0-0 · tie" is a report nobody can act on. The
     incoming verdict must itself be SETTLED, so a later PENDING read can never erase the stored
     one; every other settled leg is refused exactly as before.

     ── AND IT MAY NOT LEAVE A TICKET DISAGREEING WITH ITS OWN LEGS (INSTRUCTION 45, 2026-09-06,
     DEFECT C2 of the closing round, a REGRESSION of C1 above) ───────────────────────────────────
     The two exceptions shipped together and only the TICKET one was keyed to the ticket. `settle`
     (src/lib/cfb/grade.ts) drops a pushed leg out of the payout (`if (results[i].result === "push")
     continue;`) and returns `won` when every leg that STOOD won — so a two-leg parlay whose second
     leg pushed off an unreadable 0-0 read is booked `won · 1 leg pushed and dropped out`. That
     stored verdict is `won`, not the `push` `zeroReadTicket` looks for, so the ticket loop above
     rightly refuses to reopen it — and this loop corrected the leg underneath it anyway.

     MEASURED, reproduced twice, now pinned in tests/cfb-grade.test.ts ("the 0-0 leg correction
     never leaves a ticket contradicting its legs"): a parlay over G1 and G2 stored `won` with G2's
     leg reading `{ result: "push", detail: "0-0 · tie" }`; a later corroborated read of G2 at 10-38
     left `tickets.p1.result === "won"` standing over `legs[G2] = { result: "lost", detail: "10-38 ·
     lost by 28" }`. The ledger then says the parlay won and says one of its legs lost, and
     `ticketPL` (src/lib/bankroll.ts) goes on paying the win off the ticket map.

     A BAR, NOT A DOOR. Letting the correction reach the ticket instead would open the settled guard
     on a shape the desk has no evidence about — that guard is what stops a server pass replacing a
     verdict the phone graded and synced up, and it stays exactly as strict as it was. So the leg
     exception is refused whenever any ticket carrying that leg keeps a SETTLED stored verdict this
     pass did NOT re-derive (`legBarred`). Where the whole ticket IS corrected — the single whose own
     0-0 push was replaced — the id is in `reGraded` and the leg is corrected with it, which is the
     case C1 added this loop for. A leg no ticket on the entry carries has nothing to contradict and
     is left to the exception. The ORDINARY path is untouched: a leg whose stored verdict is not
     settled still takes the incoming one whatever its tickets did. */
  const ownersOf = new Map<string, string[]>();
  for (const t of [...entry.core, ...entry.funT]) {
    for (const l of t.legs ?? []) {
      const owners = ownersOf.get(l.lkey) ?? [];
      owners.push(t.id);
      ownersOf.set(l.lkey, owners);
    }
  }
  const legBarred = (key: string): boolean =>
    (ownersOf.get(key) ?? []).some((id) => isSettled(cur?.tickets?.[id]?.result) && !reGraded.has(id));
  const legs = { ...(cur?.legs ?? {}) };
  for (const [key, g] of Object.entries(inc.legs ?? {})) {
    if (!g) continue;
    const stored = legs[key];
    if (isSettled(stored?.result) && !(zeroReadPush(stored) && isSettled(g.result) && !legBarred(key))) continue;
    legs[key] = g;
  }
  const done = [...entry.core, ...entry.funT].every((t) => isResolved(tickets[t.id]?.result));
  return { tickets, legs, done };
}

/**
 * IS THIS ENTRY SOMETHING THE SERVER MAY GRADE AT ALL (2026-09-06)? Free, and run before any date
 * is even considered for a read.
 *
 * A ticket with NO LEGS is the trap this exists for. `settle()` in src/lib/cfb/grade.ts walks the
 * leg results, and an empty list has no lost leg, no ungradable leg and no pending leg — so it
 * falls through to `stood === 0` and returns a PUSH with the stake handed back. On a real Builder
 * ticket that can never happen (every ticket is minted from a draft with at least one leg), but the
 * server must not be the thing that discovers otherwise: a legless ticket would be scored as a
 * push, marked done, and never looked at again. So an entry is a settle candidate only when every
 * one of its tickets carries at least one leg, it carries money at all, and it is not already done.
 *
 * A VOID IS PROVISIONAL, NOT TERMINAL (2026-09-06, DEFECT S1 — the second critic's regression
 * pass). `done !== true` was the whole rule, and DEFECT I(a)'s widening made `done` reachable by
 * the CLOCK: a leg still pending 48 h past kickoff becomes `ungradable`, `overlayCfbGrading` counts
 * a void as RESOLVED, `done` flips true, and this function then refused the date FOR EVER — so no
 * later ESPN read was ever made for it.
 *
 * MEASURED: a game suspended for weather at 20:00 on 2026-09-05 and resumed 50 hours later, which
 * ESPN serves as `live` throughout. Pending at K+48h−1ms; `ungradable` with `done: true` at
 * K+48h+1ms; `cfbSettleCandidate` false from that instant on, so `settlePass` never selected the
 * date again and the real final — which the overlay would have ACCEPTED, since `ungradable` is not
 * in SETTLED — was never fetched. The cost is money, not tidiness: `ticketPL` (src/lib/bankroll.ts)
 * scores a void as 0, so a genuine winner is booked as a wash and cfbBankroll, which Kelly-sizes
 * every later day, stays low by that amount permanently.
 *
 * So a date whose ONLY unsettled verdicts are voids stays a candidate until CFB_VOID_RECHECK_MS
 * past its last kickoff, and is closed after that. The three cases are deliberately distinct:
 *   not done              → a candidate, exactly as before.
 *   done, and NO void     → not a candidate, exactly as before. Every ticket is won / lost / push,
 *                           and no scoreboard read can change a settled result (the overlay would
 *                           refuse it anyway), so an ordinary graded Saturday is never re-read.
 *   done, WITH a void     → a candidate while inside the window; refused past it.
 * The window is measured from the LAST kickoff on the entry's own games snapshot — the same source
 * `cfbSettleReady` uses and the same one `gradeCfbEntry` keys the 48-hour escalation off, so the
 * two windows can never be measured from different clocks.
 *
 * `now` defaults to the wall clock so every existing caller keeps working; the route passes its own
 * pinned instant, because a settle pass must decide the whole poke against one time.
 *
 * THE DEVICE NEEDS THE SAME WINDOW AND DOES NOT HAVE IT — FLAGGED, NOT FIXED HERE (2026-09-06,
 * DEFECT S1). `gradeCfbPending` in src/components/cfb/CfbLedger.tsx selects days with
 * `!e.grading?.done`, which is exactly the rule this function had before this change, so the phone
 * inherits the same terminality: once a suspended game is voided at 48 h, the Ledger tab stops
 * re-grading that day and the device copy keeps the void even after the game finalises. It is the
 * milder half of the defect — the SERVER writes the money and the bankroll, and the phone's sync
 * pull takes the richer copy, so the corrected verdict reaches the phone from the cloud — but a
 * phone that never syncs would show a void beside a settled record for ever. THE PULL IS
 * `syncCfbNow` (src/lib/cfb/sync.ts) and the merge it runs is the kernel's `mergeLedgers`
 * (src/lib/ledger-merge.ts), whose `pickBase` ranks grading richness first. NAMED CORRECTLY
 * 2026-09-06 (INSTRUCTION 45, the closing round's defect C3): this line used to cite "the device's
 * own `mergeCfbLedger`", a symbol that GREPPED THIS TURN does not exist anywhere in the repo — and
 * the device has no merge of its own to name, which is the point of the delegation
 * src/lib/cfb/store.ts describes at length.
 * Closing it there means the same window in that component (and its `applyCfbGrading` path in
 * src/lib/cfb/store.ts), both of which are outside what this change owns; it is written down here
 * rather than left for the next reader to rediscover.
 */
export function settleCandidate(cfg: LeagueConfig, entry: CfbLedgerEntry, now: number = Date.now()): boolean {
  const tix = [...entry.core, ...entry.funT];
  if (!tix.length) return false;
  if (tix.some((t) => !t.legs?.length)) return false;
  const grading = entry.grading;
  if (grading?.done !== true) return true;
  /* ...AND A THIRD REOPENABLE SHAPE (2026-09-06, DEFECT C1): a `push` this desk booked off a 0-0
     read. `overlayCfbGrading` will now accept a corroborated final over one — see `zeroReadTicket`
     — and that acceptance is worth nothing unless something still ASKS, which is this function.
     The window is the void's own CFB_VOID_RECHECK_MS off the same last kickoff, so the two shapes
     cannot be held open on different clocks. THE COST is the void's cost, on a rarer day: at most
     one KEYLESS ESPN scoreboard read per poke (`finalsFromEspn` builds with `oddsEvents: []`) and
     zero Odds credits, for at most seven days, and only on a date that actually carries a 0-0
     push. A day whose game really was 0-0 pays that too and re-grades to the same push; college
     football's overtime rules make a genuine 0-0 final essentially unreachable, so the ordinary
     Saturday is untouched. It is self-terminating in the good case as well: once the corrected
     verdict lands the ticket is won or lost, no shape here is reopenable, and the date closes. */
  const reopenable = tix.some((t) => grading.tickets?.[t.id]?.result === "ungradable" || zeroReadTicket(grading, t));
  if (!reopenable) return false;
  return now < cfbLastKickoffOf(entry) + cfg.voidRecheckMs;
}
/** today's signature, CFB-bound */
export const cfbSettleCandidate = (entry: CfbLedgerEntry, now: number = Date.now()): boolean => settleCandidate(CFB_LEAGUE, entry, now);

/**
 * IS THE DAY OVER (2026-09-06)? The kickoffs come from the entry's OWN games snapshot — free, and
 * the same source `gradeCfbEntry` keys its 48-hour ungradable window off, including its fallback to
 * the end of the entry's date when a game has no recorded start. A date is read only once every one
 * of its games has had CFB_SETTLE.finishMs to finish. Reading earlier is not unsafe (an unfinished
 * game grades `pending` and nothing settles on it) — it is simply a wasted upstream read on a day
 * that cannot yet score, and the point of this pass is that a settled desk costs nothing.
 */
export function settleReady(cfg: LeagueConfig, entry: CfbLedgerEntry, now: number, finishMs: number = cfg.settle.finishMs): boolean {
  return cfbLastKickoffOf(entry) + finishMs <= now;
}
/** today's signature, CFB-bound */
export const cfbSettleReady = (entry: CfbLedgerEntry, now: number, finishMs: number = CFB_LEAGUE.settle.finishMs): boolean => settleReady(CFB_LEAGUE, entry, now, finishMs);

/**
 * THE LAST KICKOFF THE ENTRY ITSELF RECORDS (extracted 2026-09-06, DEFECT S1). It was the body of
 * `cfbSettleReady`; `cfbSettleCandidate`'s void window needs the same instant, and two copies of a
 * "when did this day end" rule is how the two windows drift apart. The fallback — the end of the
 * entry's own date when a leg's game carries no parsable start — is `gradeCfbEntry`'s own fallback
 * (`kickoffOf`, src/lib/cfb/grade.ts), deliberately, so the 48-hour escalation and the windows that
 * bracket it are measured from one clock.
 */
export function cfbLastKickoffOf(entry: CfbLedgerEntry): number {
  const fallback = Date.parse(`${entry.date}T23:59:59Z`);
  const starts: number[] = [];
  for (const t of [...entry.core, ...entry.funT]) {
    for (const l of t.legs) {
      const raw = entry.games?.[l.gkey]?.start;
      const p = raw ? Date.parse(raw) : Number.NaN;
      starts.push(Number.isFinite(p) ? p : fallback);
    }
  }
  if (!starts.length) starts.push(fallback);
  return Math.max(...starts);
}
