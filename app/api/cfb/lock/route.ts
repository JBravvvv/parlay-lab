import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers } from "@/lib/ledger-merge";
import type { BankStore } from "@/lib/bankroll";
import { cronHeaderAuthed, redis, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { decideRefillTick, REFILL_SLOTS_PT } from "@/lib/server/grading-progress";
import { CFB_BANK_BASE, CFB_LEAGUE, type CFB_REDIS } from "@/lib/cfb/rules";
import { cfbBankroll } from "@/lib/cfb/ledger";
import { buildLockEntry, cfbPricedAhead, decideCfbLock, type CfbMissCause } from "@/lib/cfb/lock-server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { espnEvents, finalsFromEspn, slateFromEspn } from "@/lib/cfb/slate-server";
import {
  FootballStoreUnreadable,
  isEntryOf,
  markOddsGap,
  missCauseOf,
  readLockBank,
  readLockStore,
  settlePass,
  sweepPrevDates,
  topUpDate,
  type LockFeeds,
  type LockKeys,
  type LockStored,
  type SettleResult,
  type Sweep,
} from "@/lib/server/football-lock";
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
 * poke then exited already-locked: one transient upstream blip cost the entire $150/$25 day
 * (the core is $250 since 2026-09-08 — CFB_PAPER.daily; the failure is the same),
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
 * a card that breaks the $250 / $25 allotment (CFB_PAPER, widened from $150 on 2026-09-08) or the
 * per-ticket band is a 502 with nothing written
 * rather than a quietly wrong day on Josh's ledger.
 *
 * ── INSTRUCTION 45, THE OTHER HALF (2026-09-06) ──────────────────────────────────
 *
 * Josh's sentence has two halves and this route was doing one. "The same $150 per day theoretical
 * Core money" is not a card that INTENDS $150; it is a day that DEPLOYS it and then SCORES. (On
 * 2026-09-08 he widened the CFB core to $250 — "1. Widen the CFB allocation to $250" — so the
 * figure the desk deploys today is CFB_PAPER.daily = 250; the $150 below is the history.)
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

/**
 * THE SHARED SHELL (2026-09-08). The sweep, the settle pass, the top-up and the store readers
 * live in src/lib/server/football-lock.ts, driven by CFB_LEAGUE and these three keys; /api/nfl/lock
 * drives the same code with NFL_LEAGUE. The FEEDS are this route's own CFB-bound slate-server
 * imports — `espnEvents`, `slateFromEspn`, `finalsFromEspn` — so the shell reads exactly what the
 * lock path below reads.
 */
const KEYS: LockKeys = { ledger: STORE_KEY, bank: BANK_STORE_KEY, oddsGapPrefix: ODDS_GAP_PREFIX };
const FEEDS: LockFeeds = { espnEvents, slateFromEspn, finalsFromEspn };

type Stored = LockStored;

/** The same default the device store sizes from before its first bank write. */
const DEFAULT_BANK: BankStore = { base: CFB_BANK_BASE, asOf: CFB_LEAGUE.paper.since, log: [] };

const isCfb = isEntryOf(CFB_LEAGUE);
const stakes = (tix: CfbTicket[]) => tix.reduce((s, t) => s + t.stake, 0);

/* ==========================================================================================
 * INSTRUCTION 45, THE OTHER HALF (2026-09-06). Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day."
 * ...and on 2026-09-08, verbatim: "1. Widen the CFB allocation to $250" — so the core the desk
 * deploys today is CFB_PAPER.daily = $250 (the $25 fun is unchanged); the $150 in the quote and
 * in the measurements below is the history the top-up and the settle pass were built on.
 *
 * A. THE TOP-UP.  The lock fires an hour before the FIRST kickoff — exactly when the pool of
 *    posted Caesars prices is thinnest — and buildCfbCard says so when it cannot spend the
 *    allotment ("$75 of the $150 stayed undeployed", the 2026-09-05 fixture, docs/cfb-desk.md).
 *    Every later poke hit the already-locked exit and returned, so the day ended permanently
 *    short while the ledger recorded it as a full paper day. The already-locked exit now tries a
 *    bounded top-up first (CFB_TOPUP_MAX), appending core tickets on games the card is not
 *    already on. It can never fail the poke: every failure is caught and reported under `topUp`,
 *    and the poke's own answer and status code are untouched. `topUpDate` in football-lock.ts.
 *
 * B. THE SETTLE PASS.  Nothing settled a server-locked CFB day: the grading chain is browser-only
 *    and the scheduler's grading tick forwards to /api/calibrate?grade=only, which has no CFB
 *    code, so cfbLedgerStats reported 0-0 forever and cfbBankroll stayed pinned at CFB_BANK_BASE.
 *    The pass grades stored days from the SAME keyless ESPN payload the sweep already uses
 *    (finalsFromEspn builds its board with `oddsEvents: []`) — zero Odds API credits, ever — and
 *    overlays the verdict so a richer device copy is never clobbered. `settlePass` in
 *    football-lock.ts.
 * ======================================================================================== */

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
    [stored, bank] = await Promise.all([readLockStore(KEYS), readLockBank(KEYS)]);
  } catch (e) {
    /* TWO DIFFERENT 502s, deliberately worded apart (2026-09-06): "store unreachable" is an
       upstream failure and the next poke will very likely succeed; "unreadable" means the blob
       arrived and could not be understood, which needs a person and must never be mistaken in a
       log for a network blip. Neither writes anything. */
    const err = e as Error;
    const label = err instanceof FootballStoreUnreadable ? "cfb store unreadable" : "store unreachable";
    return NextResponse.json({ error: `${label}: ${err.message}` }, { status: 502 });
  }
  let ledger = stored?.ledger ?? [];
  let bankroll = cfbBankroll(bank ?? DEFAULT_BANK, ledger.filter(isCfb));

  /* DEFECT 2: yesterday first, and on EVERY branch below — a poke is never silent about it, not
     even when today is already locked (that is exactly the day a silent yesterday hides on). */
  const sweep: Sweep | null = asked ? null : await sweepPrevDates(CFB_LEAGUE, KEYS, { date, now, dry, ledger, bankroll, feeds: FEEDS });

  /* B (2026-09-06), THE SETTLE PASS — after the sweep, so its own re-read at write time sees the
     record the sweep just wrote and preserves it byte for byte.

     SUPPRESSED BY AN EXPLICIT ?date, exactly like the sweep and for the same reason: a hand-typed
     date is a backfill about ONE day, and a manual poke must touch nothing else. The scheduler's
     forward carries no ?date, so the unattended path — the only one that runs on its own — always
     settles. */
  const settled: SettleResult | null = asked ? null : await settlePass(CFB_LEAGUE, KEYS, { date, now, dry, ledger, bankroll, feeds: FEEDS });
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
    /* INSTRUCTION 49 (2026-09-09), Josh: "It shouldn't be refreshing every 15 minutes. It should be
       8am, 9:30am, 12pm, 3pm & 4:45pm. Other than that I can manually do it and it can function the
       same way whether I manually refresh it or it refreshes itself automatically". The refill runs
       only on the first tick inside a REFILL_SLOTS_PT window, decided from THIS route's own clock,
       or on ?manual=1 (POST /api/refill forwards Josh's Refresh here with the cron key, server-side)
       — the same pass, slot "manual". Any other pulse skips BEFORE any feed is touched: zero ESPN
       reads, zero Odds credits. Auth stays cron-only; ?date still suppresses sweep/settle. */
    const manual = q.get("manual") === "1";
    /* ?slot= (fix round, 2026-09-09): the scheduler decides the slot ONCE at its tick's clock and
       forwards it, so this route honours the same slot even when the forward lands past
       slot + 15 min; only a named REFILL_SLOTS_PT value is accepted (cron-authed callers only —
       this branch is behind cronHeaderAuthed), anything else falls back to this route's own clock. */
    const askedSlot = q.get("slot");
    const carried = askedSlot && (REFILL_SLOTS_PT as readonly string[]).includes(askedSlot) ? askedSlot : null;
    const rt = manual
      ? { fire: true, slot: "manual", reason: "manual refill — Josh's Refresh runs the same pass the slots run" }
      : carried
        ? { fire: true, slot: carried, reason: `refill slot ${carried} PT — the scheduler re-prices and appends on the first tick after each of ${REFILL_SLOTS_PT.join("/")} PT` }
        : decideRefillTick(now);
    /* A (2026-09-06), THE TOP-UP: the $250 must DEPLOY, not just be intended. See topUpDate. */
    const topUp = isCfb(existing)
      ? rt.fire
        ? await topUpDate(CFB_LEAGUE, KEYS, existing, { now, dry, bankroll, feeds: FEEDS, slot: rt.slot! })
        : { action: "skipped", reason: rt.reason, credits: 0 }
      : { action: "skipped", reason: `the stored entry for ${date} is not a CFB card — nothing here may touch it.` };
    return say({ status: "already-locked", date, at, lockedAt: existing.lockedAt ?? null, source: existing.source ?? "device", dry, topUp, refill: { trigger: manual ? "manual" : "slot", slot: rt.slot } });
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
  const free: CfbBoard = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll, league: CFB_LEAGUE });
  const d = decideCfbLock(free.games, now, CFB_LEAGUE.lock.leadMs);
  if (d.kind === "no-slate") return say({ status: "no-slate", date, at, dry });
  if (d.kind === "waiting") {
    return say({
      status: "waiting",
      date,
      at,
      firstKickoff: new Date(d.firstKickoff).toISOString(),
      locksAt: new Date(d.locksAt).toISOString(),
      leadMs: CFB_LEAGUE.lock.leadMs,
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
    if (!dry) await markOddsGap(CFB_LEAGUE, KEYS, date, now);
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
  const cause: CfbMissCause = d.ahead === 0 ? await missCauseOf(KEYS, date) : "no-lock";
  let entry: CfbLedgerEntry;
  try {
    entry = buildLockEntry(CFB_LEAGUE, slate, { now, bankroll, ahead: d.ahead, total: d.total, firstKickoff: d.firstKickoff, cause }).entry;
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
    const cur = (await readLockStore(KEYS))?.ledger ?? [];
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
