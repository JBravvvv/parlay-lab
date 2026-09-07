import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers, type SyncEntry } from "@/lib/ledger-merge";
import { validateBankStore, type BankStore } from "@/lib/bankroll";
import { cronHeaderAuthed, redis, storeEnv } from "@/lib/server/store";
import { prevPtDates, ptToday } from "@/lib/server/pt-date";
import { CFB_BANK_BASE, CFB_LOCK, CFB_ODDS_GAP_TTL_SEC, CFB_PAPER, CFB_RULES, CFB_SETTLE, CFB_SWEEP_DAYS, type CFB_REDIS } from "@/lib/cfb/rules";
import { cfbBankroll } from "@/lib/cfb/ledger";
import {
  applyCfbTopUp,
  claimCfbTopUp,
  buildCfbLockEntry,
  buildCfbSweepEntry,
  cfbCoreGamesOf,
  cfbPricedAhead,
  cfbSettleCandidate,
  cfbSettleReady,
  cfbStakeOf,
  decideCfbLock,
  decideCfbTopUp,
  overlayCfbGrading,
  planCfbTopUp,
  releaseCfbTopUp,
  type CfbMissCause,
} from "@/lib/cfb/lock-server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { gradeCfbEntry } from "@/lib/cfb/grade";
import { espnEvents, finalsFromEspn, slateFromEspn } from "@/lib/cfb/slate-server";
import type { CfbBoard, CfbLedgerEntry, CfbSlate, CfbTicket } from "@/lib/cfb/types";

/**
 * THE CFB SERVER LOCK (INSTRUCTION 45, 2026-09-05, Josh, verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day").
 *
 * The CFB card (src/lib/cfb/card.ts under CFB_RULES / CFB_PAPER) locked only when a person
 * tapped LOCK in the Builder; the prod CFB ledger held zero entries while the MLB desk's
 * scheduler wrote a 'server-lock' day every day. This route is the CFB desk's server lock:
 *
 *   GET /api/cfb/lock?date=YYYY-MM-DD&dry=1
 *
 * Gated EXACTLY like /api/scheduler: 503 when CRON_SECRET is unset (fail closed — this route
 * WRITES a locked day), 401 unless cronHeaderAuthed, 503 unless the store is configured. Poked
 * by the scheduler's self-forward on the ~15-min pulse (src/lib/server/cfb-lock-forward.ts);
 * there is no new external ticker. Per poke, for the date (default PT today):
 *
 *   already-locked  an entry for the date exists on pl:cfb:ledger:v1 → the day is never re-staked,
 *                   and a Builder lock that got there first stands (the same once-per-date rule as
 *                   upsertCfbEntry). The exit first attempts a bounded TOP-UP of the server's OWN
 *                   card (INSTRUCTION 45, the other half — see below and `topUpDate`), reported
 *                   under `topUp`; a device lock is never touched and costs no fetch.
 *   no-slate        the date has no kickoff at all → write nothing.
 *   waiting         now < first kickoff − CFB_LOCK.leadMs → write nothing; body says when.
 *   odds-missing    the window is open and games are still ahead, but the day cannot be PRICED
 *                   → write nothing, answer 502, retry on the next poke (DEFECT 1, below).
 *   locked          buildCfbCard over the slate (bankroll = the CFB bank + graded P/L, as the
 *                   Builder sizes) → lockCfbCard → stamped source "server-lock" → MERGED into
 *                   the stored ledger with mergeLedgers, the same contract PUT /api/cfb/ledger
 *                   uses, so a device's copy and the server's can never race. A NO-PLAY card
 *                   still locks. Past the last kickoff the entry is NO-PLAY with a "window
 *                   missed" note; past the first kickoff the note says how many games were
 *                   still ahead. ?dry=1 builds and returns the card without writing.
 *
 * Every answer past the gate also carries `sweep` — what the poke did about YESTERDAY (DEFECT 2) —
 * and `settle`, what it scored from ESPN finals (INSTRUCTION 45, the other half). Both are
 * suppressed by an explicit `?date`, which is a backfill about ONE day.
 *
 * DEFECT 1, FOUND IN REVIEW OF THE FIRST CUT (2026-09-05): an Odds API failure inside the window
 * permanently locked the day as NO-PLAY. `oddsPayload()` (src/lib/cfb/slate-server.ts) never
 * throws — a missing key, a 401, a 429, a non-array body and a network error ALL return
 * `{ events: [], missing: true }` — so `slateFromEspn` hands back a scores-only board, every row
 * is unpriced, `buildCfbCard` returns `{ noPlay: true }`, and the first cut wrote it. Every later
 * poke then exited already-locked: one transient upstream blip cost the entire $150/$25 day,
 * which is precisely what INSTRUCTION 45 asked for and did not get. So: when the window is open,
 * games are still ahead, and the day carries NO usable Caesars price — either `slate.oddsMissing`
 * (the fetch failed) or `cfbPricedAhead === 0` (the fetch "worked" but matched nothing, the same
 * hole wearing a different hat) — the route WRITES NOTHING and answers `odds-missing` with a 502
 * so the scheduler's forward reports it. Two NO-PLAYs are deliberately still written: the
 * missed-window one (`ahead === 0`, a record about the window being gone, not about the lines)
 * and the genuine one (prices present, nothing clearing +2% EV under CFB_RULES.maxDec) — that is
 * a real no-bet day and it belongs on the ledger.
 *
 * DEFECT 2, SAME REVIEW: a slate whose window opened after the last ticker poke was never locked
 * and never recorded. The forward passes no `?date`, so the date is `ptToday()`; the ticker
 * (docs/cron-jobs.md) covers roughly 08:00–19:45 PT, so a 21:00 PT kickoff answered `waiting` at
 * the 19:45 PT poke and by the next poke `ptToday()` had already rolled over — a SILENT day,
 * which both /api/scheduler and src/lib/server/lock-card.ts refuse to allow on the MLB rails.
 * So a poke that carried no explicit `?date` also SWEEPS the previous PT date: if the stored
 * ledger has no entry for it (device or server) and it really had a slate, the missed-window
 * NO-PLAY record is written for it, with trigger "cfb-lock-sweep". Every game on a CFB board for
 * PT date D kicks off on PT date D (src/lib/cfb/model.ts drops `g.date !== input.date`, where
 * `g.date` is `ptDateOf(start)`), so once we are inside D+1 the whole of D has kicked off by
 * definition — the record needs only the game list, and is built from ESPN alone with
 * `oddsEvents: []`, spending ZERO Odds API credits (the same trick `finalsFromEspn` uses). The
 * sweep can never cost the poke its answer: every failure is caught and reported under `sweep`,
 * and today's body and status code are untouched. An explicit `?date` (a backfill by hand)
 * suppresses the sweep entirely, so a manual poke touches only the date it was asked about.
 *
 * ── THE VERIFICATION PASS (2026-09-06) ───────────────────────────────────────────────────────
 *
 * DEFECT 1, DECIDE BEFORE YOU SPEND. The first cut called `slateFromEspn` BEFORE `decideCfbLock`,
 * and `slateFromEspn` calls `oddsPayload()` unconditionally. One fresh CFB game-lines pull costs
 * 6 credits (docs/cfb-desk.md, measured on prod 2026-09-05: the quota moved 17578 → 17572), the
 * odds data cache revalidates every 240 s and the ticker pokes every ~15 min, so EVERY poke was a
 * fresh billed call. On a date with no kickoff at all — every day February through July, and most
 * Mon/Tue/Wed in season — the route paid 6 credits and answered `no-slate` having written nothing,
 * ~48 times a day, forever; the long `waiting` stretch before a late kickoff did the same. None of
 * it is visible to the props rail (`CFB_PROPS.dailyBudget` 2500 and its spend key count PROPS
 * pulls only), so it silently ate the same monthly plan that makes a full Saturday refuse props.
 * Kickoff times come from ESPN alone, so the route now builds the ESPN-ONLY board first
 * (`buildCfbBoard` with `oddsEvents: []`, the same shape the sweep already uses), decides on ITS
 * games, and answers no-slate / waiting from that. `slateFromEspn` is reached only by a poke that
 * is actually going to lock. This is safe because `buildCfbBoard` builds `games` from
 * `input.espnEvents` alone (shape → drop `g.date !== date` → dedupe → sort) and an odds event only
 * ever fills `rows` and `slateDates` — it can never add, drop or shift a game (pinned in
 * tests/cfb-lock-route.test.ts).
 *
 * DEFECT 2, THE SWEEP IS FLOORED AT THE DESK'S START. `CFB_PAPER.since` is "2026-09-05" and the
 * forward passes no `?date`, so the first prod poke swept 2026-09-04 — a Friday with real FBS
 * kickoffs — and wrote a locked NO-PLAY for a day on which this route did not exist and the paper
 * card had not started. src/lib/cfb/store.ts rests on the opposite invariant, verbatim: the record
 * "cannot hold a day before CFB_PAPER.since, so this window is exact". A date before `since` is now
 * skipped, reported as `before-desk`, and never triggers an ESPN fetch.
 *
 * DEFECT 3, THE SWEEP WALKS A BOUNDED WINDOW. It reached back exactly one PT date. On CFB the
 * week's entire meaningful slate IS Saturday, so a two-day outage left the one day that carries the
 * money silent forever. It now walks `CFB_SWEEP_DAYS` (3) previous PT dates, newest first, and
 * stops at the first date that already carries a ledger entry. The FREE ledger check runs before
 * any fetch, so a swept-clean history — every normal day — costs nothing at all; the worst case is
 * three keyless ESPN scoreboard reads per poke and ZERO Odds API credits.
 *
 * DEFECT 4, A SWEPT RECORD STATES ONLY THE CAUSE IT CAN PROVE. The sweep's note claimed "because
 * no scheduler poke ever landed inside <date>'s lock window", and the odds-missing refusal
 * manufactures exactly the day where that is false: pokes landed all day INSIDE the window and
 * refused on purpose, for want of a price. Josh reads that string under the locked card
 * (src/components/cfb/CfbBuilder.tsx renders `locked.note`). So the refusal now leaves a dated
 * marker (`pl:cfb:oddsgap:v1:<date>`, EX past the sweep window), and both the sweep and the
 * same-day missed-window record read it to choose their wording AND their trigger — "cfb-lock-sweep"
 * vs "cfb-lock-sweep-odds", "cfb-lock" vs "cfb-lock-odds-gap" — so the two failures stay apart on
 * the ledger forever. The marker holds no money and no card; the ledger is still the only record.
 *
 * DEFECT 5 lives in `cfbPricedAhead` (src/lib/cfb/lock-server.ts): it now counts exactly the rows
 * `buildCfbCard` would consider, so a future-start game ESPN mislabels as live can no longer
 * inflate it and suppress the refusal.
 *
 * DEFECT 6, `maxDuration`. The route declared only `dynamic`; every peer declares a duration
 * (verified 2026-09-06: scheduler 90, generate 300, sharp 300, calibrate 60, clv 60, propsnap 60,
 * ufcprops 60). 60 s is sized to what this route actually does — 2 Redis GETs, up to three sweep
 * ESPN reads, `espnEvents` (2 fetches), `slateFromEspn` (FPI + odds in parallel), the card build,
 * a Redis GET + SET — and deliberately sits ABOVE the caller's 25 s `CFB_LOCK.forwardTimeoutMs`, so
 * the caller's abort is always the binding one and a poke the caller gave up on can still finish
 * writing the day.
 *
 * THE MONEY GUARD: `buildCfbLockEntry` now runs `assertCfbCardMoney` before anything is stamped, so
 * a card that breaks the $150 / $25 allotment or the per-ticket band is a 502 with nothing written
 * rather than a quietly wrong day on Josh's ledger.
 *
 * ── INSTRUCTION 45, THE OTHER HALF (2026-09-06) ──────────────────────────────────
 *
 * Josh's sentence has two halves and this route was doing one. "The same $150 per day theoretical
 * Core money" is not a card that INTENDS $150; it is a day that DEPLOYS it and then SCORES.
 *
 * A. THE TOP-UP (`topUpDate`, CFB_TOPUP_MAX). The lock fires an hour before the first kickoff,
 *    when the pool of posted Caesars prices is thinnest, and buildCfbCard says so out loud when it
 *    cannot spend the allotment — on the 2026-09-05 fixture it staked three $25 singles and noted
 *    "$75 of the $150 stayed undeployed". Every later poke hit the already-locked exit and
 *    returned, so the day ended permanently short while the ledger recorded it as a full paper
 *    day. Now the exit rebuilds the card over the games still ahead that the core is not already
 *    seated on and APPENDS, never replaces, at most CFB_TOPUP_MAX times per date.
 *
 * B. THE SETTLE PASS (`settlePass`, CFB_SETTLE). Nothing settled a server-locked CFB day: the
 *    grading chain is browser-only and the scheduler's grading tick forwards to
 *    /api/calibrate?grade=only, which has no CFB code. cfbLedgerStats reported 0-0 forever and
 *    cfbBankroll stayed pinned at CFB_BANK_BASE, so every later day was Kelly-sized off a bankroll
 *    that could never move. The pass grades stored days from the SAME keyless ESPN payload the
 *    sweep uses (finalsFromEspn builds with `oddsEvents: []`) — zero Odds API credits, ever.
 *
 * WHAT EACH POKE COSTS NOW. Unchanged on every branch that cannot lock: a poke on a kickoff-less
 * date, or before the window, still pays two ESPN scoreboard fetches and ZERO Odds credits, and a
 * poke that locks pays the same one game-lines pull it always did (6 credits). What is NEW: an
 * already-locked date that is short, still pregame, inside its top-up cap and later than its own
 * lock instant pays one more ESPN read plus one game-lines pull (6 credits) per attempt, at most
 * CFB_TOPUP_MAX attempts per date; and a poke carrying no `?date` pays at most
 * CFB_SETTLE.maxDatesPerPoke extra ESPN reads for grading, dropping to ZERO the moment the backlog
 * is scored. Every one of those costs is refused for FREE first — see decideCfbTopUp and the order
 * settlePass walks its candidates in.
 *
 * `sweepPrevDates` is still the only place that writes a date OTHER than the poke's own.
 *
 * ── THE MONEY-PATH CRITIC'S SECOND PASS (2026-09-06) ─────────────────────────────
 *
 * CRITIC 6, A TOP-UP CLAIM IS NOT IDENTIFIED BY ITS ORDINAL. `topUpDate` claimed `d.n`, the
 * ordinal decided over the copy the REQUEST read at its very start — and the sweep and the settle
 * pass run between that read and the top-up, so the window is the whole request. Two overlapping
 * pokes therefore both claimed ordinal 1; `decideCfbTopUp` excluded any row with that ordinal, so
 * the second read the first one's COMPLETED attempt as its own in-flight claim, erased it, re-fired
 * and re-minted ticket ids the first had already seated. MEASURED: six core tickets carrying five
 * distinct ids, `topUps` counting one attempt of two, the cap defeated — and because the ids key
 * the grading map, a losing bet read a winning bet's verdict, worth $47.70 of phantom realized P/L
 * on one day (bankroll 2520 where the honest figure was 2473, and route.ts feeds that bankroll into
 * every later day's card). The claim's ordinal is now derived from the FRESHLY-READ entry, a claim
 * is recognised as an UNFILLED row at that ordinal rather than any row with it, top-up ticket ids
 * count on from the entry's own core, and `assertCfbEntryMoney` throws on a duplicate ticket id.
 *
 * CRITIC 7, A TOP-UP ONTO A GRADED DAY REOPENS IT. `applyCfbTopUp` appended core tickets and never
 * touched `grading`, so tickets appended to a `done: true` entry were ungraded on a day that called
 * itself finished — and `cfbSettleCandidate` refuses a done date, forever. See applyCfbTopUp.
 *
 * CRITIC 8, AN ODDS OUTAGE IS NOT AN ATTEMPT. The top-up path never inspected `slate.oddsMissing`,
 * so an outage spent an attempt and armed the retry window while the LOCK path treats the identical
 * condition as a refusal. It now releases the claim and stamps the same dated marker. See the block
 * above `planCfbTopUp`'s probe.
 *
 * One odds call (240 s data cache) + ESPN (60 s) + Redis — cheap, no per-event props pull.
 */

export const dynamic = "force-dynamic";
/** DEFECT 6 (2026-09-06) — see the header. Above CFB_LOCK.forwardTimeoutMs on purpose. */
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The literals are pinned here on purpose (tests/cfb-lock-route.test.ts scans for them) and
   type-checked against the shared contract so they can never drift from CFB_REDIS. */
const STORE_KEY: typeof CFB_REDIS.ledger = "pl:cfb:ledger:v1";
const BANK_STORE_KEY: typeof CFB_REDIS.bank = "pl:cfb:bank:v1";
/** DEFECT 4's marker PREFIX — one short-lived key per date, never a blob. */
const ODDS_GAP_PREFIX: typeof CFB_REDIS.oddsGap = "pl:cfb:oddsgap:v1";
const oddsGapKey = (date: string) => `${ODDS_GAP_PREFIX}:${date}`;

type Stored = { ledger: SyncEntry[]; at: number };
type StoredBank = { bank: BankStore; at: number };

/** The same default the device store sizes from before its first bank write. */
const DEFAULT_BANK: BankStore = { base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] };

/**
 * A BLOB NOTHING CAN READ IS NOT AN EMPTY LEDGER (INSTRUCTION 45, 2026-09-06 — the critic's pass).
 *
 * Both readers used to map a JSON parse failure, or a value of the wrong shape, to `null` — the
 * SAME answer they give for a key that does not exist. Every write path here then read that as
 * "the ledger is empty", merged the day's one entry into nothing and SET the blob, which would
 * have replaced the ENTIRE CFB season with a single entry. The blast radius is the whole paper
 * record: cfbLedgerStats, cfbBankroll and every later Kelly-sized card come off it, and the
 * device's own copy would then merge the truncation back down onto the phone on the next sync.
 *
 * A missing key IS an empty ledger — the desk's first poke ever must lock normally. A value that
 * will not parse is evidence of exactly one thing: that nothing here knows what the ledger holds.
 * So the two cases are now distinguished, and the second one throws. The route answers 502, writes
 * NOTHING, and the next poke retries — a day retried is cheap; a season overwritten is not
 * recoverable from anything this server holds.
 */
class CfbStoreUnreadable extends Error {
  constructor(key: string, why: string) {
    super(`${key} holds an unreadable value (${why}) — refusing to write, because a blob nothing can parse is not an empty ledger`);
    this.name = "CfbStoreUnreadable";
  }
}

async function readStore(): Promise<Stored | null> {
  const raw = (await redis(["GET", STORE_KEY])) as string | null;
  if (!raw) return null;
  let s: Stored;
  try {
    s = JSON.parse(raw) as Stored;
  } catch (e) {
    throw new CfbStoreUnreadable(STORE_KEY, `${(e as Error).message}`);
  }
  if (!Array.isArray(s?.ledger)) throw new CfbStoreUnreadable(STORE_KEY, "no `ledger` array on the stored object");
  return s;
}

async function readBank(): Promise<BankStore | null> {
  const raw = (await redis(["GET", BANK_STORE_KEY])) as string | null;
  if (!raw) return null;
  let s: StoredBank;
  try {
    s = JSON.parse(raw) as StoredBank;
  } catch (e) {
    throw new CfbStoreUnreadable(BANK_STORE_KEY, `${(e as Error).message}`);
  }
  if (!s?.bank) throw new CfbStoreUnreadable(BANK_STORE_KEY, "no `bank` on the stored object");
  const v = validateBankStore(s.bank);
  /* the bank is money too: a card silently sized off CFB_BANK_BASE because the stored bankroll
     failed its own validator is a wrong stake, not a missing one. */
  if (!v.ok) throw new CfbStoreUnreadable(BANK_STORE_KEY, `failed validateBankStore: ${v.error}`);
  return v.store;
}

/**
 * DEFECT 4's marker (2026-09-06). The odds-missing refusal stamps the date it refused; the sweep
 * and the same-day missed-window record read it back to say WHY the day went unlocked instead of
 * guessing. Neither direction may ever fail the poke: a marker is a diagnosis, not a record, so a
 * store hiccup writing it is swallowed, and a store hiccup reading it degrades to the conservative
 * "no-lock" wording rather than an invented cause.
 */
async function markOddsGap(date: string, now: number): Promise<void> {
  try {
    await redis(["SET", oddsGapKey(date), new Date(now).toISOString(), "EX", CFB_ODDS_GAP_TTL_SEC]);
  } catch {
    /* the refusal still stands; only its future explanation is lost */
  }
}
async function missCauseOf(date: string): Promise<CfbMissCause> {
  try {
    return (await redis(["GET", oddsGapKey(date)])) != null ? "odds-gap" : "no-lock";
  } catch {
    return "no-lock";
  }
}

const isCfb = (e: SyncEntry): e is CfbLedgerEntry => e.sport === "cfb" && e.locked === true && Array.isArray(e.core);
const stakes = (tix: CfbTicket[]) => tix.reduce((s, t) => s + t.stake, 0);
const lockedOn = (ledger: SyncEntry[], date: string) => ledger.some((e) => e.date === date && e.locked);

type Sweep = Record<string, unknown>;
type SweepDay = Record<string, unknown> & { date: string; action: string };
type SweepArgs = { date: string; now: number; dry: boolean; ledger: SyncEntry[]; bankroll: number };

/**
 * THE SWEEP — one PAST date (DEFECT 2 of the first review, floored and re-caused 2026-09-06).
 * Unable to throw, and unable to spend an Odds API credit: the board is built from ESPN alone
 * with `oddsEvents: []`, the same trick `finalsFromEspn` uses.
 *
 * The order is the cost discipline, and every step above the fetch is FREE:
 *   1. before CFB_PAPER.since → the desk did not exist; skip, and STOP the walk (DEFECT 2).
 *   2. already on the ledger (device OR server) → nothing to do, and STOP the walk (the history
 *      behind a recorded day was swept when that day was recorded).
 *   3. only now, one keyless ESPN scoreboard read.
 */
async function sweepOneDate(prev: string, args: SweepArgs): Promise<{ day: SweepDay; stop: boolean }> {
  try {
    if (prev < CFB_PAPER.since) return { day: { date: prev, action: "before-desk", since: CFB_PAPER.since }, stop: true };
    if (lockedOn(args.ledger, prev)) return { day: { date: prev, action: "already-recorded" }, stop: true };
    const espn = await espnEvents(prev);
    const board = buildCfbBoard({ date: prev, espnEvents: espn, oddsEvents: [], fpi: null, now: args.now, bankroll: args.bankroll });
    if (!board.games.length) return { day: { date: prev, action: "no-slate" }, stop: false };
    const d = decideCfbLock(board.games, args.now, CFB_LOCK.leadMs);
    /* Cannot happen while `now` is inside a LATER PT date (see the header's PT-bucketing note),
       but if it ever did, a day with a game still ahead is TODAY's problem, not the sweep's. */
    if (d.kind !== "lock" || d.ahead !== 0) return { day: { date: prev, action: "not-missed", kind: d.kind }, stop: false };
    /* DEFECT 4: the cause is READ, never guessed — the refusal's own marker or nothing. */
    const cause = await missCauseOf(prev);
    const entry = buildCfbSweepEntry(board, { now: args.now, total: d.total, cause });
    if (args.dry) return { day: { date: prev, action: "would-record", cause, games: d.total, note: entry.note ?? null }, stop: false };
    const cur = (await readStore())?.ledger ?? [];
    if (lockedOn(cur, prev)) return { day: { date: prev, action: "already-recorded", raced: true }, stop: false };
    const merged = mergeLedgers(cur, [entry]);
    if (JSON.stringify(merged).length > MAX_BYTES) return { day: { date: prev, action: "error", error: "merged ledger too large" }, stop: false };
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at: args.now } satisfies Stored)]);
    console.log(`[cfb-lock] SWEPT ${prev} (${cause}): NO-PLAY recorded over ${d.total} games — ${entry.note}`);
    return { day: { date: prev, action: "recorded", cause, games: d.total, note: entry.note ?? null }, stop: false };
  } catch (e) {
    /* NEVER throws: today's answer is the important one. */
    return { day: { date: prev, action: "error", error: (e as Error).message }, stop: false };
  }
}

/**
 * THE BOUNDED WALK (DEFECT 3, 2026-09-06). `CFB_SWEEP_DAYS` previous PT dates, newest first,
 * stopping at the first date that is before the desk's start or already carries a ledger entry.
 * The reported shape keeps the newest date's fields at the top level — that is the day a poke is
 * normally about, and every existing reader of `sweep.date` / `sweep.action` still reads it — with
 * the whole walk under `days` so a two-day outage is visible in one line of the poke's answer.
 *
 * COST, worst case, per poke: `CFB_SWEEP_DAYS` ESPN scoreboard reads and zero Odds API credits;
 * normal case (yesterday already recorded): one free ledger comparison and nothing else.
 */
async function sweepPrevDates(args: SweepArgs): Promise<Sweep> {
  const days: SweepDay[] = [];
  for (const prev of prevPtDates(args.date, CFB_SWEEP_DAYS + 1).slice(1)) {
    const { day, stop } = await sweepOneDate(prev, args);
    days.push(day);
    if (stop) break;
  }
  return { ...days[0], days };
}


/* ==========================================================================================
 * INSTRUCTION 45, THE OTHER HALF (2026-09-06). Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day."
 *
 * A. THE TOP-UP.  The lock fires an hour before the FIRST kickoff — exactly when the pool of
 *    posted Caesars prices is thinnest — and buildCfbCard says so when it cannot spend the
 *    allotment ("$75 of the $150 stayed undeployed", the 2026-09-05 fixture, docs/cfb-desk.md).
 *    Every later poke hit the already-locked exit above and returned, so the day ended
 *    permanently short while the ledger recorded it as a full paper day. The already-locked exit
 *    now tries a bounded top-up first (CFB_TOPUP_MAX), appending core tickets on games the card
 *    is not already on. It can never fail the poke: every failure is caught and reported under
 *    `topUp`, and the poke's own answer and status code are untouched.
 *
 * B. THE SETTLE PASS.  Nothing settled a server-locked CFB day: the grading chain is browser-only
 *    and the scheduler's grading tick forwards to /api/calibrate?grade=only, which has no CFB
 *    code, so cfbLedgerStats reported 0-0 forever and cfbBankroll stayed pinned at CFB_BANK_BASE.
 *    The pass grades stored days from the SAME keyless ESPN payload the sweep already uses
 *    (finalsFromEspn builds its board with `oddsEvents: []`) — zero Odds API credits, ever — and
 *    overlays the verdict so a richer device copy is never clobbered.
 * ======================================================================================== */

type SettleDay = Record<string, unknown> & { date: string; action: string };
type SettleArgs = { date: string; now: number; dry: boolean; ledger: SyncEntry[]; bankroll: number };
type SettleResult = { report: Record<string, unknown>; ledger: SyncEntry[] | null };

/**
 * THE SETTLE PASS. Oldest date first, because the oldest unscored day is the one whose absence
 * has been distorting the bankroll longest and the one most likely to have finished.
 *
 * THE COST, in order, and every step above the fetch is FREE:
 *   1. only CFB entries that carry money, whose every ticket has a leg, dated on or after
 *      CFB_PAPER.since and NOT after the poke's own date — the pass never grades forward of today,
 *      so a clock skew or a hand-typed future date can never invent a result.
 *   2. already fully graded → not a candidate at all; a settled desk reads nothing, forever.
 *   3. the day is not over yet (CFB_SETTLE.finishMs past its last kickoff, off the entry's own
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
async function settlePass(args: SettleArgs): Promise<SettleResult> {
  const days: SettleDay[] = [];
  const verdicts: { date: string; grading: NonNullable<CfbLedgerEntry["grading"]> }[] = [];
  /* every date that consumed a read slot, whether or not it produced a verdict (DEFECT S2) */
  const attemptedDates = new Set<string>();
  let reads = 0;
  let wrote = false;
  let next: SyncEntry[] | null = null;

  const seen = new Set<string>();
  /**
   * THE ORDER IS THE FAIRNESS (2026-09-06, the critic's pass). Oldest-first alone is not a fair
   * budget: a date that has ALREADY been read and could not be finished — a day still waiting on
   * a scoreboard correction, say — sits at the front of the queue forever, and two of them
   * consume the whole CFB_SETTLE.maxDatesPerPoke budget on every poke, so a date that has NEVER
   * been attempted is deferred forever and the bankroll it would move never moves.
   *
   * So a date nobody has graded yet goes first, and oldest-first still decides within each tier
   * (the oldest unscored day has distorted the bankroll longest and is likeliest to have
   * finished). This costs NOTHING — `grading` is already on the entry, no read and no write —
   * and it cannot starve the older tier either: the never-attempted tier is drained in at most
   * one poke per two dates, after which the already-attempted dates get the whole budget back.
   */
  /**
   * WIDENED 2026-09-06 (INSTRUCTION 45 — DEFECT I(b)). The tier above was `grading ? 1 : 0`, a
   * flag that answers "has this date EVER been graded" — and once it is 1 it never changes again.
   * That fixes the never-attempted case the block above describes and nothing else: three dates
   * that all carry a grading object sit in ONE tier for ever, oldest-first hands the whole
   * two-date budget to the two oldest on every poke, and a third that could actually finish is
   * `deferred` for ever. MEASURED: 2026-09-05 and 2026-09-12 both stuck (a leg pending on a game
   * ESPN never finalised — DEFECT I(a), fixed in src/lib/cfb/grade.ts) with 2026-09-20 a normal
   * partially-graded day, `CFB_SETTLE.maxDatesPerPoke` = 2, and the sort yielded
   * [2026-09-05, 2026-09-12, 2026-09-20] on EVERY poke: both reads went to the stuck pair, the
   * re-grade was byte-identical so nothing was written, and 2026-09-20's realized P/L never
   * reached cfbBankroll.
   *
   * The tier is now the LAST ATTEMPT, not the fact of one: `gradedAt` — already stamped by this
   * pass's own write block — sorted ascending, so a date read on THIS poke goes to the back and
   * every candidate is reached in at most one poke per two dates. A date that has never been read
   * still sorts first (0 with no grading, 1 with a grading object it got from a device sync but
   * no server read), which keeps the CRITIC 2 ordering above intact, and oldest-first still
   * decides within a tier.
   *
   * BOTH STAMPS ARE READ THROUGH `stampOf` — a `Number(...) || 0` coercion — rather than with
   * `??`: a stored blob may carry a non-numeric or absent stamp, and `Number(undefined)` is NaN,
   * which would sort unpredictably. A falsy or unusable value degrades to the never-read tier —
   * the direction that reads a date sooner, never later.
   *
   * CITATION CORRECTED (INSTRUCTION 45, 2026-09-06, DEFECT C2). This paragraph quoted the tier
   * expression as `Number(e.gradedAt) || …` and said the field "is on SyncEntry's index signature,
   * not its shape". BOTH HALVES WERE FALSE and both are grepped this turn: no such expression
   * occurs in this file (the read goes through the `stampOf` helper below, which is why this note
   * now NAMES that symbol instead of quoting an expression), and `gradedAt` is a DECLARED optional
   * field on `CfbLedgerEntry` — src/lib/cfb/types.ts declares `gradedAt?: number | null;` and the
   * type is `NoIndex<SyncEntry> & {` …, i.e. the inherited index signature is closed. The coercion
   * is defence against the untrusted stored BLOB, not against an untyped field.
   *
   * `attemptedAt` IS THE TIER, AND `gradedAt` IS NOW ONLY ITS FALLBACK (2026-09-06, DEFECT S2 —
   * the second critic's regression pass). `gradedAt` is written in exactly ONE place on this
   * path, the write block below, and only for a date that produced a VERDICT. A date whose
   * `espnEvents` read THROWS pushes `{ action: "error" }` and no verdict, so it was never
   * stamped — while `reads++` had already fired for it, deliberately, because the upstream call
   * was made. MEASURED: an upstream 5xx pinned to two dates (or a payload `espnEvents` rejects)
   * left both of them at `attempted` 0 or 1, which sorts ahead of every successfully-read date
   * (whose figure is an epoch, ~1.78e12). With `CFB_SETTLE.maxDatesPerPoke` = 2 those two dates
   * consumed the ENTIRE per-poke read budget on every poke, for ever, and every newer date
   * answered `deferred` — the exact starvation the tier was added to end, re-entered through the
   * one door I(b) did not close.
   *
   * So the stamp records the ATTEMPT: every date that consumed a read slot gets `attemptedAt`,
   * success or throw. It is a SEPARATE field rather than an overloaded `gradedAt` because the two
   * are different facts and `gradedAt` has a second writer — src/lib/cfb/store.ts stamps it on the
   * phone when grading is applied — so widening its meaning here would have changed what the
   * device's own field claims. `gradedAt` stays in the expression as the fallback so a blob
   * written by the previous deploy (which carries `gradedAt` and no `attemptedAt`) keeps its
   * position in the queue instead of jumping to the front on the first poke after the ship; the
   * max of the two is taken because either writer may have been the more recent one.
   */
  const stampOf = (e: CfbLedgerEntry, k: string) => Number((e as Record<string, unknown>)[k]) || 0;
  const attempted = (e: CfbLedgerEntry) => Math.max(stampOf(e, "attemptedAt"), stampOf(e, "gradedAt")) || (e.grading ? 1 : 0);
  const todo = args.ledger
    .filter(isCfb)
    /* `args.now` (2026-09-06, DEFECT S1): candidacy now depends on the clock — a date whose only
       unsettled verdicts are 48-hour voids stays a candidate until CFB_VOID_RECHECK_MS past its
       last kickoff, so a game that finalises late can still be scored. The poke's own pinned
       instant is passed rather than letting the default wall clock in, so the whole pass decides
       against one time. */
    .filter((e) => e.date >= CFB_PAPER.since && e.date <= args.date && cfbSettleCandidate(e, args.now))
    .filter((e) => (seen.has(e.date) ? false : (seen.add(e.date), true)))
    .sort((a, b) => attempted(a) - attempted(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const e of todo) {
    try {
      if (!cfbSettleReady(e, args.now)) {
        days.push({ date: e.date, action: "immature" });
        continue;
      }
      if (reads >= CFB_SETTLE.maxDatesPerPoke) {
        days.push({ date: e.date, action: "deferred", why: `the ${CFB_SETTLE.maxDatesPerPoke}-date read budget for this poke is spent` });
        continue;
      }
      /* the budget is spent by the ATTEMPT, not by the success: a date whose scoreboard read
         throws still cost an upstream call, and must not hand its slot to the next date.
         ...AND SO IS THE QUEUE'S TIER (2026-09-06, DEFECT S2): the date is recorded here, one
         line above the call that may throw, so the write block below stamps `attemptedAt` on it
         whatever happens next. Recording it after the read would be the defect itself. */
      reads++;
      attemptedDates.add(e.date);
      const espn = await espnEvents(e.date);
      const { finals } = finalsFromEspn(e.date, espn, args.now, args.bankroll);
      const inc = gradeCfbEntry(e, finals, args.now);
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
      const cur = (await readStore())?.ledger ?? [];
      const byDate = new Map(verdicts.map((v) => [v.date, v.grading]));
      let changed = false;
      /**
       * A DATE THAT WAS READ IS STAMPED EVEN WHEN ITS VERDICT DID NOT MOVE (2026-09-06, DEFECT
       * I(b); the field the queue tiers on became `attemptedAt` in DEFECT S2, below, and the rule
       * this paragraph states is unchanged). The stamp has to record THE READ, not the
       * change: the byte-identical re-grade is precisely the case that starved the queue — a
       * stuck date is read, produces the same grading it already had, `changed` stayed false, no
       * write happened, `gradedAt` never moved, and the same two dates were first in the queue on
       * the next poke, for ever. Stamping only on a change is a tier that a stuck date can never
       * leave.
       *
       * THE COST is one extra SET on the poke that reads a date and learns nothing new — and only
       * on that poke, because `same && already stamped this instant` writes nothing. It buys the
       * budget's fairness, and it is a ledger write, never an upstream read: no ESPN call and no
       * Odds credit.
       *
       * `changed` (a VERDICT moved) is kept apart from `touched` (a read landed on a stored date
       * at all) because they are different facts and the code below needs the second one. The
       * reported `wrote` is `touched` — it has always meant "this pass wrote the ledger", and a
       * stamp is a ledger write. Nothing reads `changed` today; it is kept because "did any
       * verdict actually move" is the question the next reader of this block will ask, and
       * recovering it after the fact is impossible.
       *
       * ...AND A DATE THAT WAS READ IS STAMPED EVEN WHEN IT PRODUCED NO VERDICT AT ALL
       * (2026-09-06, DEFECT S2). The map used to be driven by `byDate` — the verdicts — so a date
       * whose `espnEvents` threw fell straight through and was never stamped, which is how two
       * persistently-failing dates held the whole read budget for ever. It is driven by
       * `attemptedDates` instead. `gradedAt` keeps EXACTLY the meaning and the write rule the
       * paragraph above gave it — stamped on every read that produced a verdict, byte-identical
       * re-grades included — and `attemptedAt` is stamped on every read, full stop; the only thing
       * that moved is which of them the queue tiers on. AN ERROR NEVER TOUCHES `grading` OR
       * `gradedAt`: with no `inc` there is no overlay, `same` is true by construction, and the
       * returned row is the stored row plus one number. A failing date therefore rotates through
       * the queue without its verdict, its stakes or its ids moving by a byte.
       */
      let touched = false;
      const merged = cur.map((raw) => {
        if (!attemptedDates.has(String(raw.date)) || !isCfb(raw)) return raw;
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
        await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at: args.now } satisfies Stored)]);
        wrote = true;
        next = merged;
        console.log(
          `[cfb-lock] SETTLED ${verdicts.map((v) => v.date).join(", ")} from ESPN finals — ${reads} scoreboard read(s), zero odds credits${changed ? "" : " (no verdict moved; the read was stamped so the queue rotates)"}`,
        );
      }
    } catch (err) {
      days.push({ date: args.date, action: "error", error: (err as Error).message });
    }
  }

  return { report: { reads, wrote, days }, ledger: next };
}

/**
 * THE TOP-UP, on the already-locked exit (2026-09-06).
 *
 * ORDER IS COST. `decideCfbTopUp` refuses for free on every reason that needs no network — a
 * device (Builder) lock, a day already fully deployed, the CFB_TOPUP_MAX cap, an empty attempt
 * still inside CFB_TOPUP_RETRY_MS, the ticket cap, and a poke that has not advanced past the lock
 * instant. Only past all of those does this spend one keyless ESPN read to learn whether anything
 * is still pregame, and only past THAT does it CLAIM the attempt and pay for a priced board (one
 * game-lines pull, 6 Odds credits, measured on prod 2026-09-05: the quota moved 17578 -> 17572).
 * The claim is what makes the cap bound spending rather than luck — see the block above the pull. The same `cfbPricedAhead` guard the lock refuses on runs again inside
 * `planCfbTopUp`, over the games the core is not already seated on.
 *
 * IDEMPOTENCE AND RACES. The plan built above the write is a PROBE. The stored entry is re-read
 * TWICE against the live copy — once to decide the ordinal this poke claims, and again inside the
 * write block, where the whole decision is recomputed from THAT copy: the room, the free ticket
 * slots, the cap and the ordinal all come from the live entry, and the card is rebuilt against it.
 * Nothing this poke does is decided by the snapshot the request opened with (2026-09-06, CRITIC 6 —
 * claiming an ordinal off that stale snapshot is what let two pokes mint one id twice). So two
 * pokes overlapping on one date can never push the day past CFB_PAPER.daily:
 * the loser sees a full day (or a spent cap) and reports `raced`. The money guard then runs over
 * the MERGED entry, so an appended ticket that would break the allotment or the per-ticket band is
 * a caught error with nothing written, exactly like the lock's own guard.
 *
 * It never throws: the already-locked answer, its status code and its sweep are untouched whatever
 * happens here.
 */
async function topUpDate(entry: CfbLedgerEntry, args: { now: number; dry: boolean; bankroll: number }): Promise<Record<string, unknown>> {
  try {
    const d = decideCfbTopUp(entry, args.now);
    if (!d.fire) return { action: "skipped", reason: d.reason };

    const espn = await espnEvents(entry.date);
    const free: CfbBoard = buildCfbBoard({ date: entry.date, espnEvents: espn, oddsEvents: [], fpi: null, now: args.now, bankroll: args.bankroll });
    const w = decideCfbLock(free.games, args.now, CFB_LOCK.leadMs);
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
     *
     * Josh's instruction is that this desk runs "$150 per day theoretical Core money and $25 Fun
     * money per day", and `decideCfbTopUp` opens the fun arm on its own — `funOpen` does not need
     * `coreOpen`. That is right for the money and it created a way to burn credits for nothing: a
     * day whose core is full but whose $25 bucket is empty fires, pays 6 Odds credits for a priced
     * board, seats $0 because no fun parlay can be built, and burns an attempt; the retry window
     * then arms a second identical 6-credit pull. On a Saturday, against a quota that binds, that
     * is real money spent to learn nothing.
     *
     * The one thing that CAN be proved before paying is arithmetic: CFB_RULES.fun demands a parlay
     * of at least `legs.min` legs, `oneLegPerGame` makes those legs DISTINCT games, and a game the
     * core already sits on is spoken for. So if fewer than `legs.min` games with no core ticket are
     * still ahead, no fun parlay exists at any price and the board is not worth buying. Nothing
     * else about the fun arm is decided here — a board with enough games may still price nothing
     * inside the 4.0-40.0 band, and that refusal still costs its pull, because it cannot be known
     * without one.
     *
     * The count is deliberately an OVER-estimate (start time ahead of `now`, not `status`), so the
     * refusal fires only where seating is impossible rather than merely unlikely; and it is gated
     * on `!d.core` so a core arm that is still open is never held back by the fun bucket's
     * arithmetic. Placed ABOVE the claim and the pull, like every other free refusal on this path.
     */
    if (!d.core && d.fun && openAhead < CFB_RULES.fun.legs.min) {
      return {
        action: "skipped",
        reason: `the day's $${CFB_PAPER.fun} fun money is the only allotment still open on ${entry.date}, and only ${openAhead} game${openAhead === 1 ? "" : "s"} still ahead carr${openAhead === 1 ? "ies" : "y"} no core ticket — a fun parlay needs ${CFB_RULES.fun.legs.min} distinct games, so no priced board was paid for.`,
        ahead: w.ahead,
      };
    }

    /**
     * CLAIM THE ATTEMPT, THEN SPEND (2026-09-06, the critic's pass). This is the point of
     * commitment: past every free refusal, one line above the only call on this path that reaches
     * the Odds API. Before this, `CFB_TOPUP_MAX` bounded successful WRITES, so a day that stayed
     * short — the common case — bought a fresh priced board on every poke of the afternoon (6
     * credits each, ~40 pokes, ~240 credits a Saturday, invisible to CFB_PROPS.dailyBudget) to
     * learn the same "nothing to seat" over and over. An attempt that finds nothing has spent
     * exactly what one that writes spends, so it must consume exactly the same budget.
     *
     * The claim is a ledger write and it happens BEFORE the spend, never after, so a crash, a
     * platform kill or a lost answer between here and the write block still costs the attempt —
     * the failure mode a cap must have. `?dry=1` does not claim (it writes nothing at all, by
     * contract, and only a hand-typed poke can send it).
     *
     * The MLB desk does exactly this: app/api/generate/route.ts claims `topup-${used + 1}` and
     * writes its registry row whatever the fire seated, and src/lib/server/blocks.ts `decideTopUp`
     * counts those keys rather than the tickets they produced.
     */
    /* THE ORDINAL IS DERIVED FROM THE FRESHLY-READ ENTRY, NOT FROM THE GET SNAPSHOT (2026-09-06,
       the critic's second pass, CRITIC 6). `d` was decided over the copy this request read at its
       very start, and the sweep and the settle pass have run since — the window between them is
       the whole request, and it is long enough for an overlapping poke to complete a top-up in.
       Claiming `d.n` blind is how two pokes both claimed ordinal 1: the second then re-fired at
       that ordinal and re-minted ticket ids the first had already seated. Re-deciding here costs
       nothing (every check in `decideCfbTopUp` is free and the entry is already in hand) and makes
       the claim's ordinal a fact about the STORED day. */
    let n = d.n;
    if (!args.dry) {
      const pre = (await readStore())?.ledger ?? [];
      const held = pre.find((e) => e.date === entry.date && e.locked);
      if (!held || !isCfb(held)) {
        return { action: "skipped", reason: `${entry.date} no longer carries a locked CFB entry — another writer changed the day before this attempt was claimed.`, raced: true };
      }
      const fresh = decideCfbTopUp(held, args.now);
      if (!fresh.fire) return { action: "skipped", reason: fresh.reason, raced: true };
      n = fresh.n;
      /* THE CLAIM RECORDS WHICH ARMS IT SPENT (2026-09-06, L1) — and it takes them from `fresh`,
         the decision made over the LIVE entry one line above, never from `d`, which was decided
         over the snapshot this request opened with. */
      const claimed = claimCfbTopUp(held, n, args.now, { core: fresh.core, fun: fresh.fun }) as SyncEntry;
      const withClaim = pre.map((e) => (e.date === entry.date && e.locked ? claimed : e));
      if (JSON.stringify(withClaim).length > MAX_BYTES) return { action: "error", error: "merged ledger too large" };
      await redis(["SET", STORE_KEY, JSON.stringify({ ledger: withClaim, at: args.now } satisfies Stored)]);
    }

    /* ...and only HERE, on a top-up that could actually seat something, is an odds pull paid for. */
    const slate: CfbSlate = await slateFromEspn(entry.date, espn, args.now, args.bankroll);

    /**
     * AN OUTAGE IS NOT AN ATTEMPT (2026-09-06, the critic's second pass, CRITIC 8).
     *
     * `slateFromEspn` never throws on an odds failure: `oddsPayload()` maps a missing key, a 401, a
     * 429, a non-array body and a network error alike to `{ events: [], missing: true }`, so an
     * outage arrives as an ordinary board carrying `oddsMissing: true`. The top-up path never
     * looked at that flag, so an outage CHARGED the attempt (the claim was written above, before
     * the pull, deliberately) and armed the CFB_TOPUP_RETRY_MS window — while the LOCK path a few
     * hundred lines below treats the identical condition as a refusal: nothing written, 502, an
     * odds-gap marker, retry on the next poke. MEASURED: a day locked at $75 of $150, two outage
     * pokes 50 minutes apart, CFB_TOPUP_MAX spent, and every poke from then to the last kickoff
     * refused "the top-up cap is spent" though Caesars prices were posted all afternoon — the
     * ledger recording it as a full paper day with nothing saying the money was lost to the feed.
     *
     * So the claim is RELEASED and the same dated marker the lock path stamps is written, so the
     * sweep's cause-reading agrees with what actually happened. A release that itself fails leaves
     * the attempt charged — the safe direction, and the only one a store hiccup can produce here.
     * A board that DID arrive and priced nothing this desk wants still costs its attempt: that
     * attempt really re-priced the day, which is the spend the cap exists to bound.
     */
    if (slate.oddsMissing) {
      if (!args.dry) {
        const cur = (await readStore())?.ledger ?? [];
        const live = cur.find((e) => e.date === entry.date && e.locked);
        if (live && isCfb(live)) {
          const rolled = releaseCfbTopUp(live, n) as SyncEntry;
          const back = cur.map((e) => (e.date === entry.date && e.locked ? rolled : e));
          if (JSON.stringify(back).length <= MAX_BYTES) {
            await redis(["SET", STORE_KEY, JSON.stringify({ ledger: back, at: args.now } satisfies Stored)]);
          }
        }
        await markOddsGap(entry.date, args.now);
      }
      return {
        action: "skipped",
        oddsMissing: true,
        n,
        room: d.room,
        reason: `the Odds API call failed or had no key, so ${entry.date} could not be priced — the attempt is given back rather than spent, $${d.room} stays undeployed, and the next poke retries.`,
      };
    }

    const probe = planCfbTopUp(slate, entry, { now: args.now, bankroll: args.bankroll, room: d.room, slots: d.slots, n });
    /**
     * A FUN TICKET IS REASON ENOUGH TO WRITE (2026-09-06, DEFECT M(b)) — this gate used to demand
     * `probe.tickets.length`, a CORE ticket, and dropped `plan.fun` on the floor without it.
     *
     * THE OLD JUSTIFICATION IS WITHDRAWN, not merely superseded. It read: "a `topUps` row is read
     * as an IN-FLIGHT CLAIM exactly when `core === 0`, so a completed fun-only attempt would record
     * `{ core: 0, stake: 0 }` — indistinguishable from a claim another poke may replace or release,
     * which is the shape of the very race CRITIC 6 fixed". That was true of the row's OLD shape and
     * is the reason the shape changed: `CfbTopUpRecord` now carries `filled`, every claim filter
     * tests it (see `isClaimRow` in src/lib/cfb/lock-server.ts), and a fun-only completion is a
     * `filled: true` row that no poke will ever mistake for a claim.
     *
     * MEASURED before the change, and it is the second half of Josh's sentence: a plan carrying one
     * fun ticket and no core ticket answered `skipped` (or `raced` at the write block), the day kept
     * its $0 of the $25 — while the claim written before the pull stayed on the entry with
     * `core: 0`, counting against CFB_TOPUP_MAX and arming the 45-minute retry window. Two such
     * pokes spent the whole day's attempt budget and seated nothing at all.
     */
    if (!probe.tickets.length && !probe.fun.length) {
      return {
        action: "skipped",
        reason:
          probe.pricedAhead === 0
            ? `no Caesars price on any game still ahead that the core is not already on — $${d.room} of core and $${CFB_PAPER.fun - cfbStakeOf(entry.funT)} of fun stay undeployed and the next poke retries.`
            : `nothing on the ${probe.pricedAhead} priced sides still ahead clears the card's gate — $${d.room} of core and $${CFB_PAPER.fun - cfbStakeOf(entry.funT)} of fun stay undeployed rather than stake a ticket the rules refuse.`,
        pricedAhead: probe.pricedAhead,
        room: d.room,
        funRoom: CFB_PAPER.fun - cfbStakeOf(entry.funT),
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
        funRoom: CFB_PAPER.fun - (cfbStakeOf(entry.funT) + probe.funStake),
      };
    }

    /* THE WRITE: re-read, recompute the room from the STORED copy, rebuild against it. */
    const cur = (await readStore())?.ledger ?? [];
    const live = cur.find((e) => e.date === entry.date && e.locked);
    if (!live || !isCfb(live)) {
      return { action: "skipped", reason: `${entry.date} no longer carries a locked CFB entry — another writer changed the day while this poke was pricing it.`, raced: true };
    }
    /* `claim: n` — the ordinal THIS poke claimed above — so it does not count its own in-flight
       attempt against the cap. `decideCfbTopUp` honours it only while the claim is still HELD (an
       unfilled row at that ordinal): if a racing writer completed or replaced it, this poke is no
       longer in flight, takes a fresh ordinal and mints fresh ids from it (2026-09-06, CRITIC 6 —
       matching by ordinal ALONE is what let a second poke re-mint a seated ticket's id). */
    const again = decideCfbTopUp(live, args.now, { claim: n });
    if (!again.fire) return { action: "skipped", reason: again.reason, raced: true };
    const plan = planCfbTopUp(slate, live, { now: args.now, bankroll: args.bankroll, room: again.room, slots: again.slots, n: again.n });
    /* BOTH BUCKETS, as above (2026-09-06, DEFECT M(b)): a plan carrying only the day's first fun
       parlay is a plan worth writing, and dropping it here is what stranded the $25 on a day whose
       core was already whole. The money guard inside `applyCfbTopUp` runs over the MERGED entry, so
       the fun append is held to `funSum <= CFB_PAPER.fun` and to the one-id-space duplicate rule
       exactly as a core append is. */
    if (!plan.tickets.length && !plan.fun.length) {
      return {
        action: "skipped",
        reason: `nothing left to seat once the stored copy was re-read — the day carries $${cfbStakeOf(live.core)} of the $${CFB_PAPER.daily} core and $${cfbStakeOf(live.funT)} of the $${CFB_PAPER.fun} fun.`,
        raced: true,
      };
    }
    const next = applyCfbTopUp(live, plan, args.now, again.n);
    const merged = cur.map((e) => (e.date === next.date && e.locked ? (next as SyncEntry) : e));
    if (JSON.stringify(merged).length > MAX_BYTES) return { action: "error", error: "merged ledger too large" };
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at: args.now } satisfies Stored)]);
    const coreStake = cfbStakeOf(next.core);
    /**
     * BOTH HALVES OF THE INSTRUCTION ARE REPORTED (2026-09-06 — DEFECT J(b)). Josh, verbatim:
     * "the same $150 per day theoretical Core money and $25 Fun money per day". The answer named
     * only the core, so a day sitting at $0 of its $25 was invisible in the poke's own output as
     * well as in the ledger. `funStake` is what THIS attempt seated (0 when the day already had a
     * parlay, which is the common case) and `funRoom` is what the day still has undeployed — the
     * figure that is the whole defect when it stays at $25 all season.
     */
    const funStake = cfbStakeOf(next.funT);
    console.log(
      `[cfb-lock] TOPPED UP ${next.date} (#${again.n}): +${plan.tickets.length} core $${plan.stake}, +${plan.fun.length} fun $${plan.funStake} — the day now carries $${coreStake} of the $${CFB_PAPER.daily} core and $${funStake} of the $${CFB_PAPER.fun} fun`,
    );
    return {
      action: "topped-up",
      n: again.n,
      /* WHICH HALF OF JOSH'S SENTENCE OPENED THIS ATTEMPT (2026-09-06, DEFECT M(a)) — read off the
         RE-DECIDED live entry, not the request's opening snapshot, so it describes what was
         actually written. A fun-only fire reports `{ core: false, fun: true }` with `core: 0`. */
      buckets: { core: again.core, fun: again.fun },
      core: plan.tickets.length,
      stake: plan.stake,
      coreStake,
      room: again.room - plan.stake,
      fun: plan.fun.length,
      funStake: plan.funStake,
      funRoom: CFB_PAPER.fun - funStake,
    };
  } catch (e) {
    /* NEVER throws: the already-locked answer is the important one. */
    return { action: "error", error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  /* FAILS CLOSED — the scheduler's gate, verbatim: an unset secret is a configuration error. */
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "cfb-lock-not-configured: CRON_SECRET unset — failing closed" }, { status: 503 });
  }
  if (!cronHeaderAuthed(req)) {
    console.warn(`[cfb-lock] unauthorized poke ip=${req.headers.get("x-forwarded-for") ?? "?"}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });

  const q = req.nextUrl.searchParams;
  const asked = q.get("date");
  const date = asked || ptToday();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const dry = q.get("dry") === "1";
  const now = Date.now();
  const at = new Date(now).toISOString();

  let stored: Stored | null;
  let bank: BankStore | null;
  try {
    [stored, bank] = await Promise.all([readStore(), readBank()]);
  } catch (e) {
    /* TWO DIFFERENT 502s, deliberately worded apart (2026-09-06): "store unreachable" is an
       upstream failure and the next poke will very likely succeed; "unreadable" means the blob
       arrived and could not be understood, which needs a person and must never be mistaken in a
       log for a network blip. Neither writes anything. */
    const err = e as Error;
    const label = err instanceof CfbStoreUnreadable ? "cfb store unreadable" : "store unreachable";
    return NextResponse.json({ error: `${label}: ${err.message}` }, { status: 502 });
  }
  let ledger = stored?.ledger ?? [];
  let bankroll = cfbBankroll(bank ?? DEFAULT_BANK, ledger.filter(isCfb));

  /* DEFECT 2: yesterday first, and on EVERY branch below — a poke is never silent about it, not
     even when today is already locked (that is exactly the day a silent yesterday hides on). */
  const sweep: Sweep | null = asked ? null : await sweepPrevDates({ date, now, dry, ledger, bankroll });

  /* B (2026-09-06), THE SETTLE PASS — after the sweep, so its own re-read at write time sees the
     record the sweep just wrote and preserves it byte for byte.

     SUPPRESSED BY AN EXPLICIT ?date, exactly like the sweep and for the same reason: a hand-typed
     date is a backfill about ONE day, and a manual poke must touch nothing else. The scheduler's
     forward carries no ?date, so the unattended path — the only one that runs on its own — always
     settles. */
  const settled: SettleResult | null = asked ? null : await settlePass({ date, now, dry, ledger, bankroll });
  const settle = settled?.report ?? null;
  if (settled?.ledger) {
    /* the day's own card is sized off a bankroll that now includes what the pass just scored —
       the whole point of settling on the server (cfbBankroll was pinned at CFB_BANK_BASE forever) */
    ledger = settled.ledger;
    bankroll = cfbBankroll(bank ?? DEFAULT_BANK, ledger.filter(isCfb));
  }

  const say = (body: Record<string, unknown>, init?: { status: number }) =>
    NextResponse.json({ ...body, ...(sweep ? { sweep } : {}), ...(settle ? { settle } : {}) }, init);

  const existing = ledger.find((e) => e.date === date && e.locked);
  if (existing) {
    /* A (2026-09-06), THE TOP-UP: the $150 must DEPLOY, not just be intended. See topUpDate. */
    const topUp = isCfb(existing)
      ? await topUpDate(existing, { now, dry, bankroll })
      : { action: "skipped", reason: `the stored entry for ${date} is not a CFB card — nothing here may touch it.` };
    return say({ status: "already-locked", date, at, lockedAt: existing.lockedAt ?? null, source: existing.source ?? "device", dry, topUp });
  }

  let espn: unknown[];
  try {
    espn = await espnEvents(date);
  } catch (e) {
    return say({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  /* DEFECT 1 (2026-09-06) — DECIDE BEFORE YOU SPEND. Kickoff times come from ESPN alone, so the
     decision is made on the FREE board (no odds events, no FPI, no Odds API credit). The priced
     board below can never disagree about the game set: buildCfbBoard fills `games` from
     `espnEvents` only, and an odds event touches nothing but `rows` and `slateDates`. */
  const free: CfbBoard = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll });
  const d = decideCfbLock(free.games, now, CFB_LOCK.leadMs);
  if (d.kind === "no-slate") return say({ status: "no-slate", date, at, dry });
  if (d.kind === "waiting") {
    return say({
      status: "waiting",
      date,
      at,
      firstKickoff: new Date(d.firstKickoff).toISOString(),
      locksAt: new Date(d.locksAt).toISOString(),
      leadMs: CFB_LOCK.leadMs,
      dry,
    });
  }

  /* ...and only HERE, on a poke that is actually going to lock, is an odds pull paid for. */
  let slate: CfbSlate;
  try {
    slate = await slateFromEspn(date, espn, now, bankroll);
  } catch (e) {
    return say({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }

  /* DEFECT 1: the day is still ahead but cannot be priced — refuse and retry, never lock. This
     sits BEFORE the build so no card is ever assembled from an empty board, and before the `dry`
     branch so a dry probe reports exactly what a real poke would do. */
  const pricedAhead = cfbPricedAhead(slate.games, now);
  if (d.ahead > 0 && (slate.oddsMissing || pricedAhead === 0)) {
    const why = slate.oddsMissing ? "the Odds API call failed or had no key" : "the odds feed matched none of the games still ahead";
    /* DEFECT 4 (2026-09-06): stamp the date so whatever record this day eventually gets — the
       same-day missed-window one below, or tomorrow's sweep — can say the odds feed lost the day
       instead of blaming a ticker gap that did not happen. A dry probe writes nothing, here as
       everywhere, so the marker is left to the real poke that follows it. */
    if (!dry) await markOddsGap(date, now);
    return say(
      {
        status: "odds-missing",
        date,
        at,
        dry,
        oddsMissing: slate.oddsMissing,
        pricedAhead,
        ahead: d.ahead,
        games: d.total,
        note: `no Caesars price on any of the ${d.ahead} games still ahead (${why}) — nothing written, the next poke retries. A day is never locked NO-PLAY for want of lines.`,
      },
      { status: 502 },
    );
  }

  /* DEFECT 4 (2026-09-06): a same-day record for a window that closed unlocked reads the same
     marker the sweep does — this is the COMMON shape of an odds-outage day, because the ticker
     usually does land a poke after the last kickoff, so this branch (not the sweep) is what Josh
     will read under the card. One extra Redis GET, and only on the ahead === 0 branch. */
  const cause: CfbMissCause = d.ahead === 0 ? await missCauseOf(date) : "no-lock";
  let entry: CfbLedgerEntry;
  try {
    entry = buildCfbLockEntry(slate, { now, bankroll, ahead: d.ahead, total: d.total, firstKickoff: d.firstKickoff, cause }).entry;
  } catch (e) {
    return say({ error: `lock build failed: ${(e as Error).message}` }, { status: 502 });
  }
  const summary = {
    status: "locked" as const,
    date,
    at,
    dry,
    core: entry.core.length,
    coreStake: stakes(entry.core),
    fun: entry.funT.length,
    funStake: stakes(entry.funT),
    noPlay: entry.noPlay === true,
    ahead: d.ahead,
    games: d.total,
    oddsMissing: slate.oddsMissing,
    pricedAhead,
    bankroll,
    cause,
    note: entry.note ?? null,
    lockedAt: entry.lockedAt,
    source: entry.source,
    trigger: entry.trigger,
  };
  if (dry) return say({ ...summary, entry });

  /* THE SETTLE POINT (named 2026-09-06). The day's entry exists and is about to be written. Both
     passes that were missing when this comment was written now exist, and both run ABOVE this
     line rather than below it: the top-up on the already-locked exit (a date being locked for the
     FIRST time has nothing to top up), and the settle pass beside the sweep (so the bankroll this
     very card was sized from already carries whatever the pass scored).

     MERGE, never replace: re-read the store at write time so a device push that landed while
     the slate was building is kept, then the same kernel PUT /api/cfb/ledger runs. */
  try {
    const cur = (await readStore())?.ledger ?? [];
    if (cur.some((e) => e.date === date && e.locked)) {
      return say({ status: "already-locked", date, at, raced: true, dry });
    }
    const merged = mergeLedgers(cur, [entry]);
    if (JSON.stringify(merged).length > MAX_BYTES) {
      return say({ error: "merged ledger too large" }, { status: 413 });
    }
    await redis(["SET", STORE_KEY, JSON.stringify({ ledger: merged, at: now } satisfies Stored)]);
  } catch (e) {
    return say({ error: `store unreachable: ${(e as Error).message}` }, { status: 502 });
  }
  console.log(`[cfb-lock] LOCKED ${date}: ${summary.core} core $${summary.coreStake}, ${summary.fun} fun $${summary.funStake}${summary.noPlay ? " (NO-PLAY)" : ""} — ${summary.note}`);
  return say(summary);
}
