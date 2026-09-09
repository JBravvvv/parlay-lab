import { assertAppendOnly } from "@/lib/append-only";
import { MAX_BYTES, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { validateBankStore, type BankStore } from "@/lib/bankroll";
import { redis } from "@/lib/server/store";
import { prevPtDates } from "@/lib/server/pt-date";
import {
  applyTopUp,
  buildSweepEntry,
  cfbCoreGamesOf,
  cfbStakeOf,
  claimTopUp,
  decideCfbLock,
  decideTopUp,
  overlayCfbGrading,
  planTopUp,
  releaseTopUp,
  settleCandidate,
  settleReady,
  type CfbMissCause,
} from "@/lib/cfb/lock-server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { gradeCfbEntry } from "@/lib/cfb/grade";
import { espnEventsOf, finalsFromEspnOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import type { CfbBoard, CfbFinals, CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";

/**
 * THE FOOTBALL LOCK SHELL, SHARED (2026-09-08, Josh: "NFL needs to be built NOW"). Everything
 * /api/cfb/lock did between its gate and its own lock decision — the store readers, the odds-gap
 * marker, the previous-date SWEEP, the SETTLE pass and the already-locked TOP-UP — moved here
 * unchanged in behaviour and parameterised on TWO things a league route hands in:
 *
 *   cfg   the LeagueConfig (CFB_LEAGUE / NFL_LEAGUE): the paper allotment and its start date, the
 *         lock lead, the sweep depth, the settle budget, the top-up cap, the odds-gap TTL and the
 *         triggers. REQUIRED everywhere, NO default — this is a money seam.
 *   keys  the three Redis literals the route pins in its own source (tests scan the route file for
 *         them), typed against the league's `redis` block so they can never drift.
 *
 * ...and ONE thing it hands in about its feeds: `LockFeeds`, the three slate-server calls this
 * shell may make (`espnEvents`, `slateFromEspn`, `finalsFromEspn`), already bound to the league.
 * The CFB route passes its own CFB-bound imports — the exact functions tests/cfb-lock-route.test.ts
 * mocks — and the NFL route passes `feedsOf(NFL_LEAGUE)`, which binds the `…Of(cfg, …)` forms
 * below. The shell never chooses a feed by league id; the route that owns the feed chooses it.
 *
 * Every docblock that explained WHY a branch exists came across with the branch: the defects
 * named here (DEFECT 2, 3, 4, S1, S2, I(b), M(a), M(b), CRITIC 6, 8, L1, J) are the CFB desk's
 * own history, and the NFL desk inherits the fixes by construction rather than by re-discovery.
 *
 * NOTHING HERE LOGS beyond the three lines the CFB route already wrote (SWEPT, SETTLED, TOPPED UP),
 * prefixed `[${cfg.id}-lock]` so the two desks' lines stay apart in one log.
 */

export type LockKeys = { ledger: string; bank: string; oddsGapPrefix: string };

/** The three upstream calls the shell makes, bound to ONE league by the route that owns them. */
export type LockFeeds = {
  espnEvents: (date: string) => Promise<unknown[]>;
  slateFromEspn: (date: string, espn: unknown[], now: number, bankroll: number) => Promise<CfbSlate>;
  finalsFromEspn: (date: string, espn: unknown[], now: number, bankroll: number) => { date: string; finals: CfbFinals };
};

/** `LockFeeds` for a league, from the `…Of(cfg, …)` forms in src/lib/cfb/slate-server.ts. */
export function feedsOf(cfg: LeagueConfig): LockFeeds {
  return {
    espnEvents: (date) => espnEventsOf(cfg, date),
    slateFromEspn: (date, espn, now, bankroll) => slateFromEspnOf(cfg, date, espn, now, bankroll),
    finalsFromEspn: (date, espn, now, bankroll) => finalsFromEspnOf(cfg, date, espn, now, bankroll),
  };
}

export type LockStored = { ledger: SyncEntry[]; at: number };
export type LockStoredBank = { bank: BankStore; at: number };

/**
 * A BLOB NOTHING CAN READ IS NOT AN EMPTY LEDGER (INSTRUCTION 45, 2026-09-06 — the critic's pass).
 *
 * Both readers used to map a JSON parse failure, or a value of the wrong shape, to `null` — the
 * SAME answer they give for a key that does not exist. Every write path then read that as "the
 * ledger is empty", merged the day's one entry into nothing and SET the blob, which would have
 * replaced the ENTIRE season with a single entry. The blast radius is the whole paper record:
 * the ledger stats, the bankroll and every later Kelly-sized card come off it, and the device's
 * own copy would then merge the truncation back down onto the phone on the next sync.
 *
 * A missing key IS an empty ledger — the desk's first poke ever must lock normally. A value that
 * will not parse is evidence of exactly one thing: that nothing here knows what the ledger holds.
 * So the two cases are distinguished, and the second one throws. The route answers 502, writes
 * NOTHING, and the next poke retries — a day retried is cheap; a season overwritten is not
 * recoverable from anything this server holds.
 */
export class FootballStoreUnreadable extends Error {
  constructor(key: string, why: string) {
    super(`${key} holds an unreadable value (${why}) — refusing to write, because a blob nothing can parse is not an empty ledger`);
    this.name = "FootballStoreUnreadable";
  }
}

export async function readLockStore(keys: LockKeys): Promise<LockStored | null> {
  const raw = (await redis(["GET", keys.ledger])) as string | null;
  if (!raw) return null;
  let s: LockStored;
  try {
    s = JSON.parse(raw) as LockStored;
  } catch (e) {
    throw new FootballStoreUnreadable(keys.ledger, `${(e as Error).message}`);
  }
  if (!Array.isArray(s?.ledger)) throw new FootballStoreUnreadable(keys.ledger, "no `ledger` array on the stored object");
  return s;
}

export async function readLockBank(keys: LockKeys): Promise<BankStore | null> {
  const raw = (await redis(["GET", keys.bank])) as string | null;
  if (!raw) return null;
  let s: LockStoredBank;
  try {
    s = JSON.parse(raw) as LockStoredBank;
  } catch (e) {
    throw new FootballStoreUnreadable(keys.bank, `${(e as Error).message}`);
  }
  if (!s?.bank) throw new FootballStoreUnreadable(keys.bank, "no `bank` on the stored object");
  const v = validateBankStore(s.bank);
  /* the bank is money too: a card silently sized off the league's bankBase because the stored
     bankroll failed its own validator is a wrong stake, not a missing one. */
  if (!v.ok) throw new FootballStoreUnreadable(keys.bank, `failed validateBankStore: ${v.error}`);
  return v.store;
}

const oddsGapKey = (keys: LockKeys, date: string) => `${keys.oddsGapPrefix}:${date}`;

/**
 * DEFECT 4's marker (2026-09-06). The odds-missing refusal stamps the date it refused; the sweep
 * and the same-day missed-window record read it back to say WHY the day went unlocked instead of
 * guessing. Neither direction may ever fail the poke: a marker is a diagnosis, not a record, so a
 * store hiccup writing it is swallowed, and a store hiccup reading it degrades to the conservative
 * "no-lock" wording rather than an invented cause. The TTL is the league's `oddsGapTtlSec`
 * ((sweepDays + 1) days), so the marker outlives every sweep that could read it and no more.
 */
export async function markOddsGap(cfg: LeagueConfig, keys: LockKeys, date: string, now: number): Promise<void> {
  try {
    await redis(["SET", oddsGapKey(keys, date), new Date(now).toISOString(), "EX", cfg.oddsGapTtlSec]);
  } catch {
    /* the refusal still stands; only its future explanation is lost */
  }
}
export async function missCauseOf(keys: LockKeys, date: string): Promise<CfbMissCause> {
  try {
    return (await redis(["GET", oddsGapKey(keys, date)])) != null ? "odds-gap" : "no-lock";
  } catch {
    return "no-lock";
  }
}

/** "Is this stored row one of THIS league's locked days" — `e.sport === cfg.id`, locked, with a core. */
export const isEntryOf =
  (cfg: LeagueConfig) =>
  (e: SyncEntry): e is CfbLedgerEntry =>
    e.sport === cfg.id && e.locked === true && Array.isArray(e.core);

const lockedOn = (ledger: SyncEntry[], date: string) => ledger.some((e) => e.date === date && e.locked);

/* ---------- THE SWEEP ---------- */

export type Sweep = Record<string, unknown>;
export type SweepDay = Record<string, unknown> & { date: string; action: string };
export type SweepArgs = { date: string; now: number; dry: boolean; ledger: SyncEntry[]; bankroll: number; feeds: LockFeeds };

/**
 * THE SWEEP — one PAST date (DEFECT 2 of the first review, floored and re-caused 2026-09-06).
 * Unable to throw, and unable to spend an Odds API credit: the board is built from ESPN alone
 * with `oddsEvents: []`, the same trick `finalsFromEspn` uses.
 *
 * The order is the cost discipline, and every step above the fetch is FREE:
 *   1. before cfg.paper.since → the desk did not exist; skip, and STOP the walk (DEFECT 2).
 *   2. already on the ledger (device OR server) → nothing to do, and STOP the walk (the history
 *      behind a recorded day was swept when that day was recorded).
 *   3. only now, one keyless ESPN scoreboard read.
 */
async function sweepOneDate(cfg: LeagueConfig, keys: LockKeys, prev: string, args: SweepArgs): Promise<{ day: SweepDay; stop: boolean }> {
  try {
    if (prev < cfg.paper.since) return { day: { date: prev, action: "before-desk", since: cfg.paper.since }, stop: true };
    if (lockedOn(args.ledger, prev)) return { day: { date: prev, action: "already-recorded" }, stop: true };
    const espn = await args.feeds.espnEvents(prev);
    const board = buildCfbBoard({ date: prev, espnEvents: espn, oddsEvents: [], fpi: null, now: args.now, bankroll: args.bankroll, league: cfg });
    if (!board.games.length) return { day: { date: prev, action: "no-slate" }, stop: false };
    const d = decideCfbLock(board.games, args.now, cfg.lock.leadMs);
    /* Cannot happen while `now` is inside a LATER PT date (see the route header's PT-bucketing
       note), but if it ever did, a day with a game still ahead is TODAY's problem, not the sweep's. */
    if (d.kind !== "lock" || d.ahead !== 0) return { day: { date: prev, action: "not-missed", kind: d.kind }, stop: false };
    /* DEFECT 4: the cause is READ, never guessed — the refusal's own marker or nothing. */
    const cause = await missCauseOf(keys, prev);
    const entry = buildSweepEntry(cfg, board, { now: args.now, total: d.total, cause });
    if (args.dry) return { day: { date: prev, action: "would-record", cause, games: d.total, note: entry.note ?? null }, stop: false };
    const cur = (await readLockStore(keys))?.ledger ?? [];
    if (lockedOn(cur, prev)) return { day: { date: prev, action: "already-recorded", raced: true }, stop: false };
    const merged = mergeLedgers(cur, [entry]);
    if (JSON.stringify(merged).length > MAX_BYTES) return { day: { date: prev, action: "error", error: "merged ledger too large" }, stop: false };
    await redis(["SET", keys.ledger, JSON.stringify({ ledger: merged, at: args.now } satisfies LockStored)]);
    console.log(`[${cfg.id}-lock] SWEPT ${prev} (${cause}): NO-PLAY recorded over ${d.total} games — ${entry.note}`);
    return { day: { date: prev, action: "recorded", cause, games: d.total, note: entry.note ?? null }, stop: false };
  } catch (e) {
    /* NEVER throws: today's answer is the important one. */
    return { day: { date: prev, action: "error", error: (e as Error).message }, stop: false };
  }
}

/**
 * THE BOUNDED WALK (DEFECT 3, 2026-09-06). `cfg.sweepDays` previous PT dates, newest first,
 * stopping at the first date that is before the desk's start or already carries a ledger entry.
 * The reported shape keeps the newest date's fields at the top level — that is the day a poke is
 * normally about, and every existing reader of `sweep.date` / `sweep.action` still reads it — with
 * the whole walk under `days` so a two-day outage is visible in one line of the poke's answer.
 *
 * COST, worst case, per poke: `cfg.sweepDays` ESPN scoreboard reads and zero Odds API credits;
 * normal case (yesterday already recorded): one free ledger comparison and nothing else.
 */
export async function sweepPrevDates(cfg: LeagueConfig, keys: LockKeys, args: SweepArgs): Promise<Sweep> {
  const days: SweepDay[] = [];
  for (const prev of prevPtDates(args.date, cfg.sweepDays + 1).slice(1)) {
    const { day, stop } = await sweepOneDate(cfg, keys, prev, args);
    days.push(day);
    if (stop) break;
  }
  return { ...days[0], days };
}

/* ---------- THE SETTLE PASS ---------- */

export type SettleDay = Record<string, unknown> & { date: string; action: string };
export type SettleArgs = { date: string; now: number; dry: boolean; ledger: SyncEntry[]; bankroll: number; feeds: LockFeeds };
export type SettleResult = { report: Record<string, unknown>; ledger: SyncEntry[] | null };

/**
 * THE SETTLE PASS. Oldest date first, because the oldest unscored day is the one whose absence
 * has been distorting the bankroll longest and the one most likely to have finished.
 *
 * THE COST, in order, and every step above the fetch is FREE:
 *   1. only THIS league's entries that carry money, whose every ticket has a leg, dated on or
 *      after cfg.paper.since and NOT after the poke's own date — the pass never grades forward of
 *      today, so a clock skew or a hand-typed future date can never invent a result.
 *   2. already fully graded → not a candidate at all; a settled desk reads nothing, forever.
 *   3. the day is not over yet (cfg.settle.finishMs past its last kickoff, off the entry's own
 *      games snapshot) → `immature`, and no read.
 *   4. the per-poke read budget is spent → `deferred`, and no read. The next poke takes it.
 *   5. only now, ONE keyless ESPN scoreboard read for that date.
 *
 * THE WRITE re-reads the store and overlays onto the CURRENT stored copy, so a device push that
 * landed while ESPN was answering keeps its own richer verdict (overlayCfbGrading: a settled
 * result is never overwritten). It deliberately does NOT go through mergeLedgers: this pass adds
 * no entry, it annotates ones that already exist, and mergeLedgers' pickBase would have to choose
 * a base between two copies of the same day — exactly the choice this pass must not make.
 */
export async function settlePass(cfg: LeagueConfig, keys: LockKeys, args: SettleArgs): Promise<SettleResult> {
  const isMine = isEntryOf(cfg);
  const days: SettleDay[] = [];
  const verdicts: { date: string; grading: NonNullable<CfbLedgerEntry["grading"]> }[] = [];
  /* every date that consumed a read slot, whether or not it produced a verdict (DEFECT S2) */
  const attemptedDates = new Set<string>();
  let reads = 0;
  let wrote = false;
  let next: SyncEntry[] | null = null;

  const seen = new Set<string>();
  /**
   * THE ORDER IS THE FAIRNESS (2026-09-06, the critic's pass; widened for DEFECT I(b) and S2).
   * Oldest-first alone is not a fair budget: a date that has ALREADY been read and could not be
   * finished sits at the front of the queue forever, and two of them consume the whole
   * cfg.settle.maxDatesPerPoke budget on every poke, so a date that has NEVER been attempted is
   * deferred forever and the bankroll it would move never moves.
   *
   * The tier is the LAST ATTEMPT: `attemptedAt`, stamped by this pass's own write block on every
   * date that consumed a read slot — success OR throw (S2) — with `gradedAt` as the fallback for a
   * blob written before `attemptedAt` existed, and `grading ? 1 : 0` beneath both so a date that
   * has never been read still sorts first. Oldest-first decides within a tier. Both stamps are read
   * through `stampOf` (a `Number(...) || 0` coercion) rather than `??`, because a stored blob may
   * carry a non-numeric or absent stamp and `Number(undefined)` is NaN, which would sort
   * unpredictably; a falsy or unusable value degrades to the never-read tier — the direction that
   * reads a date sooner, never later.
   */
  const stampOf = (e: CfbLedgerEntry, k: string) => Number((e as Record<string, unknown>)[k]) || 0;
  const attempted = (e: CfbLedgerEntry) => Math.max(stampOf(e, "attemptedAt"), stampOf(e, "gradedAt")) || (e.grading ? 1 : 0);
  const todo = args.ledger
    .filter(isMine)
    /* `args.now` (2026-09-06, DEFECT S1): candidacy now depends on the clock — a date whose only
       unsettled verdicts are 48-hour voids stays a candidate until cfg.voidRecheckMs past its
       last kickoff, so a game that finalises late can still be scored. The poke's own pinned
       instant is passed rather than letting the default wall clock in, so the whole pass decides
       against one time. */
    .filter((e) => e.date >= cfg.paper.since && e.date <= args.date && settleCandidate(cfg, e, args.now))
    .filter((e) => (seen.has(e.date) ? false : (seen.add(e.date), true)))
    .sort((a, b) => attempted(a) - attempted(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const e of todo) {
    try {
      if (!settleReady(cfg, e, args.now)) {
        days.push({ date: e.date, action: "immature" });
        continue;
      }
      if (reads >= cfg.settle.maxDatesPerPoke) {
        days.push({ date: e.date, action: "deferred", why: `the ${cfg.settle.maxDatesPerPoke}-date read budget for this poke is spent` });
        continue;
      }
      /* the budget is spent by the ATTEMPT, not by the success: a date whose scoreboard read
         throws still cost an upstream call, and must not hand its slot to the next date.
         ...AND SO IS THE QUEUE'S TIER (2026-09-06, DEFECT S2): the date is recorded here, one
         line above the call that may throw, so the write block below stamps `attemptedAt` on it
         whatever happens next. Recording it after the read would be the defect itself. */
      reads++;
      attemptedDates.add(e.date);
      const espn = await args.feeds.espnEvents(e.date);
      const { finals } = args.feeds.finalsFromEspn(e.date, espn, args.now, args.bankroll);
      const inc = gradeCfbEntry(e, finals, args.now, cfg);
      const merged = overlayCfbGrading(e.grading, inc, e);
      if (!merged) {
        days.push({ date: e.date, action: "nothing" });
        continue;
      }
      if (args.dry) {
        days.push({ date: e.date, action: "would-settle", done: merged.done });
        continue;
      }
      verdicts.push({ date: e.date, grading: inc });
      days.push({ date: e.date, action: "settled", done: merged.done, tickets: Object.keys(merged.tickets).length });
    } catch (err) {
      /* one bad date never costs the others, and never costs the poke its answer */
      days.push({ date: e.date, action: "error", error: (err as Error).message });
    }
  }

  /* `!args.dry` is explicit now that the block runs on ATTEMPTS rather than on verdicts alone
     (2026-09-06, DEFECT S2): a dry poke reads and reports, and by contract writes nothing at all,
     so it must not stamp either — it never pushed a verdict, which is what used to keep it out. */
  if (!args.dry && attemptedDates.size) {
    try {
      const cur = (await readLockStore(keys))?.ledger ?? [];
      const byDate = new Map(verdicts.map((v) => [v.date, v.grading]));
      let changed = false;
      /**
       * A DATE THAT WAS READ IS STAMPED EVEN WHEN ITS VERDICT DID NOT MOVE (2026-09-06, DEFECT
       * I(b)) AND EVEN WHEN IT PRODUCED NO VERDICT AT ALL (DEFECT S2). The stamp records THE
       * READ, not the change: the byte-identical re-grade is precisely the case that starved the
       * queue, and a date whose `espnEvents` threw fell straight through the verdict-driven map
       * and was never stamped, which is how two persistently-failing dates held the whole read
       * budget for ever. So the map is driven by `attemptedDates`. `gradedAt` keeps EXACTLY its
       * meaning — stamped on every read that produced a verdict, byte-identical re-grades
       * included — and `attemptedAt` is stamped on every read, full stop. AN ERROR NEVER TOUCHES
       * `grading` OR `gradedAt`: with no `inc` there is no overlay, `same` is true by
       * construction, and the returned row is the stored row plus one number.
       *
       * `changed` (a VERDICT moved) is kept apart from `touched` (a read landed on a stored date
       * at all): the reported `wrote` is `touched` — it has always meant "this pass wrote the
       * ledger", and a stamp is a ledger write. THE COST is one extra SET on the poke that reads a
       * date and learns nothing new, and only on that poke, because `same && already stamped this
       * instant` writes nothing. No ESPN call and no Odds credit.
       */
      let touched = false;
      const merged = cur.map((raw) => {
        if (!attemptedDates.has(String(raw.date)) || !isMine(raw)) return raw;
        const inc = byDate.get(String(raw.date));
        const g = inc ? overlayCfbGrading(raw.grading, inc, raw) : null;
        const same = !g || JSON.stringify(g) === JSON.stringify(raw.grading ?? null);
        if (same && Number((raw as Record<string, unknown>).attemptedAt) === args.now) return raw;
        touched = true;
        if (!same) changed = true;
        return { ...raw, ...(same ? {} : { grading: g }), ...(inc ? { gradedAt: args.now } : {}), attemptedAt: args.now } as SyncEntry;
      });
      if (touched) {
        if (JSON.stringify(merged).length > MAX_BYTES) throw new Error("merged ledger too large");
        await redis(["SET", keys.ledger, JSON.stringify({ ledger: merged, at: args.now } satisfies LockStored)]);
        wrote = true;
        next = merged;
        console.log(
          `[${cfg.id}-lock] SETTLED ${verdicts.map((v) => v.date).join(", ")} from ESPN finals — ${reads} scoreboard read(s), zero odds credits${changed ? "" : " (no verdict moved; the read was stamped so the queue rotates)"}`,
        );
      }
    } catch (err) {
      days.push({ date: args.date, action: "error", error: (err as Error).message });
    }
  }

  return { report: { reads, wrote, days }, ledger: next };
}

/* ---------- THE TOP-UP ---------- */

export type TopUpArgs = { now: number; dry: boolean; bankroll: number; feeds: LockFeeds };

/**
 * THE TOP-UP, on the already-locked exit (2026-09-06).
 *
 * ORDER IS COST. `decideTopUp` refuses for free on every reason that needs no network — a device
 * (Builder) lock, a day already fully deployed, the cfg.topUp.max cap, an empty attempt still
 * inside cfg.topUp.retryMs, the ticket cap, and a poke that has not advanced past the lock
 * instant. Only past all of those does this spend one keyless ESPN read to learn whether anything
 * is still pregame, and only past THAT does it CLAIM the attempt and pay for a priced board (one
 * game-lines pull, 6 Odds credits, measured on prod 2026-09-05: the quota moved 17578 -> 17572).
 * The claim is what makes the cap bound spending rather than luck — see the block above the pull.
 * The same `cfbPricedAhead` guard the lock refuses on runs again inside `planTopUp`, over the
 * games the core is not already seated on.
 *
 * IDEMPOTENCE AND RACES. The plan built above the write is a PROBE. The stored entry is re-read
 * TWICE against the live copy — once to decide the ordinal this poke claims, and again inside the
 * write block, where the whole decision is recomputed from THAT copy: the room, the free ticket
 * slots, the cap and the ordinal all come from the live entry, and the card is rebuilt against it.
 * Nothing this poke does is decided by the snapshot the request opened with (2026-09-06, CRITIC 6 —
 * claiming an ordinal off that stale snapshot is what let two pokes mint one id twice). So two
 * pokes overlapping on one date can never push the day past cfg.paper.daily: the loser sees a full
 * day (or a spent cap) and reports `raced`. The money guard then runs over the MERGED entry, so an
 * appended ticket that would break the allotment or the per-ticket band is a caught error with
 * nothing written, exactly like the lock's own guard.
 *
 * It never throws: the already-locked answer, its status code and its sweep are untouched whatever
 * happens here.
 */
export async function topUpDate(cfg: LeagueConfig, keys: LockKeys, entry: CfbLedgerEntry, args: TopUpArgs): Promise<Record<string, unknown>> {
  const isMine = isEntryOf(cfg);
  const { paper, rules } = cfg;
  try {
    const d = decideTopUp(cfg, entry, args.now);
    if (!d.fire) return { action: "skipped", reason: d.reason };

    const espn = await args.feeds.espnEvents(entry.date);
    const free: CfbBoard = buildCfbBoard({ date: entry.date, espnEvents: espn, oddsEvents: [], fpi: null, now: args.now, bankroll: args.bankroll, league: cfg });
    const w = decideCfbLock(free.games, args.now, cfg.lock.leadMs);
    if (w.kind !== "lock" || w.ahead === 0) {
      return { action: "skipped", reason: `every game on ${entry.date} has kicked off — nothing pregame is left to seat, and no priced board was paid for.` };
    }
    const seated = cfbCoreGamesOf(entry);
    const openAhead = free.games.filter((g) => !seated.has(g.id) && Date.parse(g.start) > args.now).length;
    if (openAhead === 0) {
      return { action: "skipped", reason: `every game still ahead on ${entry.date} already carries a core ticket — one leg per game stands.`, ahead: w.ahead };
    }

    /**
     * A FUN ARM THAT PROVABLY CANNOT SEAT ANYTHING REFUSES FOR FREE (INSTRUCTION 45, 2026-09-06, L1).
     * `decideTopUp` opens the fun arm on its own, which created a way to burn credits for nothing:
     * a day whose core is full but whose fun bucket is empty fires, pays for a priced board, seats
     * $0 because no fun parlay can be built, and burns an attempt; the retry window then arms a
     * second identical pull. The one thing that CAN be proved before paying is arithmetic: the
     * fun rules demand a parlay of at least `legs.min` legs, `oneLegPerGame` makes those legs
     * DISTINCT games, and a game the core already sits on is spoken for. So if fewer than
     * `legs.min` games with no core ticket are still ahead, no fun parlay exists at any price and
     * the board is not worth buying. The count is deliberately an OVER-estimate (start time ahead
     * of `now`, not `status`), so the refusal fires only where seating is impossible rather than
     * merely unlikely; and it is gated on `!d.core` so a core arm that is still open is never held
     * back by the fun bucket's arithmetic. Placed ABOVE the claim and the pull.
     */
    if (!d.core && d.fun && openAhead < rules.fun.legs.min) {
      return {
        action: "skipped",
        reason: `the day's $${paper.fun} fun money is the only allotment still open on ${entry.date}, and only ${openAhead} game${openAhead === 1 ? "" : "s"} still ahead carr${openAhead === 1 ? "ies" : "y"} no core ticket — a fun parlay needs ${rules.fun.legs.min} distinct games, so no priced board was paid for.`,
        ahead: w.ahead,
      };
    }

    /**
     * CLAIM THE ATTEMPT, THEN SPEND (2026-09-06, the critic's pass). This is the point of
     * commitment: past every free refusal, one line above the only call on this path that reaches
     * the Odds API. Before this, the cap bounded successful WRITES, so a day that stayed short
     * bought a fresh priced board on every poke of the afternoon to learn the same "nothing to
     * seat" over and over. An attempt that finds nothing has spent exactly what one that writes
     * spends, so it must consume exactly the same budget. The claim is a ledger write and it
     * happens BEFORE the spend, never after, so a crash between here and the write block still
     * costs the attempt. `?dry=1` does not claim (it writes nothing at all, by contract).
     *
     * THE ORDINAL IS DERIVED FROM THE FRESHLY-READ ENTRY, NOT FROM THE GET SNAPSHOT (2026-09-06,
     * CRITIC 6): `d` was decided over the copy this request read at its very start, and the sweep
     * and the settle pass have run since. Claiming `d.n` blind is how two pokes both claimed
     * ordinal 1. Re-deciding here costs nothing and makes the claim's ordinal a fact about the
     * STORED day.
     */
    let n = d.n;
    if (!args.dry) {
      const pre = (await readLockStore(keys))?.ledger ?? [];
      const held = pre.find((e) => e.date === entry.date && e.locked);
      if (!held || !isMine(held)) {
        return { action: "skipped", reason: `${entry.date} no longer carries a locked ${cfg.short} entry — another writer changed the day before this attempt was claimed.`, raced: true };
      }
      const fresh = decideTopUp(cfg, held, args.now);
      if (!fresh.fire) return { action: "skipped", reason: fresh.reason, raced: true };
      n = fresh.n;
      /* THE CLAIM RECORDS WHICH ARMS IT SPENT (2026-09-06, L1) — and it takes them from `fresh`,
         the decision made over the LIVE entry one line above, never from `d`. */
      const claimed = claimTopUp(cfg, held, n, args.now, { core: fresh.core, fun: fresh.fun }) as SyncEntry;
      const withClaim = pre.map((e) => (e.date === entry.date && e.locked ? claimed : e));
      if (JSON.stringify(withClaim).length > MAX_BYTES) return { action: "error", error: "merged ledger too large" };
      await redis(["SET", keys.ledger, JSON.stringify({ ledger: withClaim, at: args.now } satisfies LockStored)]);
    }

    /* ...and only HERE, on a top-up that could actually seat something, is an odds pull paid for. */
    const slate: CfbSlate = await args.feeds.slateFromEspn(entry.date, espn, args.now, args.bankroll);

    /**
     * AN OUTAGE IS NOT AN ATTEMPT (2026-09-06, CRITIC 8). `slateFromEspn` never throws on an odds
     * failure: the odds loader maps a missing key, a 401, a 429, a non-array body and a network
     * error alike to `{ events: [], missing: true }`, so an outage arrives as an ordinary board
     * carrying `oddsMissing: true`. The LOCK path treats that condition as a refusal (nothing
     * written, 502, an odds-gap marker, retry on the next poke); the top-up did not, so TWO
     * transient outages spent the cap and stranded the day's whole undeployed core while prices
     * were posted all afternoon. So the claim is RELEASED and the same dated marker the lock path
     * stamps is written. A release that itself fails leaves the attempt charged — the safe
     * direction. A board that DID arrive and priced nothing this desk wants still costs its
     * attempt: that attempt really re-priced the day, which is the spend the cap exists to bound.
     */
    if (slate.oddsMissing) {
      if (!args.dry) {
        const cur = (await readLockStore(keys))?.ledger ?? [];
        const live = cur.find((e) => e.date === entry.date && e.locked);
        if (live && isMine(live)) {
          const rolled = releaseTopUp(cfg, live, n) as SyncEntry;
          const back = cur.map((e) => (e.date === entry.date && e.locked ? rolled : e));
          if (JSON.stringify(back).length <= MAX_BYTES) {
            await redis(["SET", keys.ledger, JSON.stringify({ ledger: back, at: args.now } satisfies LockStored)]);
          }
        }
        await markOddsGap(cfg, keys, entry.date, args.now);
      }
      return {
        action: "skipped",
        oddsMissing: true,
        n,
        room: d.room,
        reason: `the Odds API call failed or had no key, so ${entry.date} could not be priced — the attempt is given back rather than spent, $${d.room} stays undeployed, and the next poke retries.`,
      };
    }

    const probe = planTopUp(cfg, slate, entry, { now: args.now, bankroll: args.bankroll, room: d.room, slots: d.slots, n });
    /* A FUN TICKET IS REASON ENOUGH TO WRITE (2026-09-06, DEFECT M(b)) — this gate used to demand
       a CORE ticket and dropped `plan.fun` on the floor without it, so a plan carrying one fun
       ticket and no core ticket answered `skipped`, the day kept its $0 of the fun allotment, and
       the claim written before the pull still counted against the cap. */
    if (!probe.tickets.length && !probe.fun.length) {
      return {
        action: "skipped",
        reason:
          probe.pricedAhead === 0
            ? `no Caesars price on any game still ahead that the core is not already on — $${d.room} of core and $${paper.fun - cfbStakeOf(entry.funT)} of fun stay undeployed and the next poke retries.`
            : `nothing on the ${probe.pricedAhead} priced sides still ahead clears the card's gate — $${d.room} of core and $${paper.fun - cfbStakeOf(entry.funT)} of fun stay undeployed rather than stake a ticket the rules refuse.`,
        pricedAhead: probe.pricedAhead,
        room: d.room,
        funRoom: paper.fun - cfbStakeOf(entry.funT),
      };
    }
    if (args.dry) {
      return {
        action: "would-top-up",
        n,
        /* WHICH HALF OF JOSH'S SENTENCE OPENED THIS ATTEMPT (2026-09-06, DEFECT M(a)) — the two
           allotments are independent gates, and the answer says which one (or both) let it run. */
        buckets: { core: d.core, fun: d.fun },
        core: probe.tickets.length,
        stake: probe.stake,
        coreStake: cfbStakeOf(entry.core) + probe.stake,
        room: d.room,
        fun: probe.fun.length,
        funStake: probe.funStake,
        funRoom: paper.fun - (cfbStakeOf(entry.funT) + probe.funStake),
      };
    }

    /* THE WRITE: re-read, recompute the room from the STORED copy, rebuild against it. */
    const cur = (await readLockStore(keys))?.ledger ?? [];
    const live = cur.find((e) => e.date === entry.date && e.locked);
    if (!live || !isMine(live)) {
      return { action: "skipped", reason: `${entry.date} no longer carries a locked ${cfg.short} entry — another writer changed the day while this poke was pricing it.`, raced: true };
    }
    /* `claim: n` — the ordinal THIS poke claimed above — so it does not count its own in-flight
       attempt against the cap. `decideTopUp` honours it only while the claim is still HELD (an
       unfilled row at that ordinal): if a racing writer completed or replaced it, this poke is no
       longer in flight, takes a fresh ordinal and mints fresh ids from it (2026-09-06, CRITIC 6). */
    const again = decideTopUp(cfg, live, args.now, { claim: n });
    if (!again.fire) return { action: "skipped", reason: again.reason, raced: true };
    const plan = planTopUp(cfg, slate, live, { now: args.now, bankroll: args.bankroll, room: again.room, slots: again.slots, n: again.n });
    /* BOTH BUCKETS, as above (2026-09-06, DEFECT M(b)): a plan carrying only the day's first fun
       parlay is a plan worth writing. The money guard inside `applyTopUp` runs over the MERGED
       entry, so the fun append is held to `funSum <= cfg.paper.fun` and to the one-id-space
       duplicate rule exactly as a core append is. */
    if (!plan.tickets.length && !plan.fun.length) {
      return {
        action: "skipped",
        reason: `nothing left to seat once the stored copy was re-read — the day carries $${cfbStakeOf(live.core)} of the $${paper.daily} core and $${cfbStakeOf(live.funT)} of the $${paper.fun} fun.`,
        raced: true,
      };
    }
    const next = applyTopUp(cfg, live, plan, args.now, again.n);
    /* INSTRUCTION 48 (2026-09-09): a locked ticket is never dropped or resized — throw before the SET. */
    assertAppendOnly(live, next, "topUpDate/write");
    const merged = cur.map((e) => (e.date === next.date && e.locked ? (next as SyncEntry) : e));
    if (JSON.stringify(merged).length > MAX_BYTES) return { action: "error", error: "merged ledger too large" };
    await redis(["SET", keys.ledger, JSON.stringify({ ledger: merged, at: args.now } satisfies LockStored)]);
    const coreStake = cfbStakeOf(next.core);
    /* BOTH HALVES OF THE INSTRUCTION ARE REPORTED (2026-09-06, DEFECT J(b)): `funStake` is what
       THIS attempt seated and `funRoom` is what the day still has undeployed — the figure that is
       the whole defect when it stays at the full fun allotment all season. */
    const funStake = cfbStakeOf(next.funT);
    console.log(
      `[${cfg.id}-lock] TOPPED UP ${next.date} (#${again.n}): +${plan.tickets.length} core $${plan.stake}, +${plan.fun.length} fun $${plan.funStake} — the day now carries $${coreStake} of the $${paper.daily} core and $${funStake} of the $${paper.fun} fun`,
    );
    return {
      action: "topped-up",
      n: again.n,
      /* read off the RE-DECIDED live entry, not the request's opening snapshot, so it describes
         what was actually written. A fun-only fire reports `{ core: false, fun: true }`. */
      buckets: { core: again.core, fun: again.fun },
      core: plan.tickets.length,
      stake: plan.stake,
      coreStake,
      room: again.room - plan.stake,
      fun: plan.fun.length,
      funStake: plan.funStake,
      funRoom: paper.fun - funStake,
    };
  } catch (e) {
    /* NEVER throws: the already-locked answer is the important one. */
    return { action: "error", error: (e as Error).message };
  }
}
