import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, mergeLedgers } from "@/lib/ledger-merge";
import type { BankStore } from "@/lib/bankroll";
import { cronHeaderAuthed, redis, storeEnv } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { NFL_BANK_BASE, NFL_LEAGUE, NFL_PAPER, type NFL_REDIS } from "@/lib/nfl/rules";
import { cfbBankroll } from "@/lib/cfb/ledger";
import { buildLockEntry, cfbPricedAhead, decideCfbLock, type CfbMissCause } from "@/lib/cfb/lock-server";
import { buildCfbBoard } from "@/lib/cfb/model";
import { espnEventsOf, slateFromEspnOf } from "@/lib/cfb/slate-server";
import {
  feedsOf,
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
 * /api/nfl/lock — THE NFL SERVER LOCK (2026-09-08, Josh, verbatim: "2. NFL needs to be built NOW
 * 3. Allocation should be set to $350").
 *
 * The NFL desk's copy of the College Football server lock, on the NFL rails: the same shared
 * shell (src/lib/server/football-lock.ts — the previous-date sweep, the settle pass, the bounded
 * top-up and the store readers) driven by NFL_LEAGUE and the three NFL Redis keys, and the same
 * lock path below, reading the NFL scoreboard and the NFL game lines through the league-aware
 * `…Of(NFL_LEAGUE, …)` feeds. Nothing in this file names a CFB key, sport key, ESPN path or
 * route (tests/nfl-separation.test.ts), and no NFL money can land on the CFB ledger: every
 * money seam takes the league config as a REQUIRED argument, so the ticket ids are
 * `nfl-<date>-core-*`, the entry's `sport` is "nfl", the allotment is NFL_PAPER ($350 / $25),
 * the band is NFL_RULES ($5–$50, 3–10 tickets) and the write lands on pl:nfl:ledger:v1.
 *
 * THE POKE. The MLB scheduler self-forwards here on every pulse, concurrently with its CFB
 * forward, with the same cron header and a 25 s abort (NFL_LOCK.forwardTimeoutMs), and reports
 * the answer under `nfl`. The gates are the CFB route's, in the same order: an unset
 * CRON_SECRET fails closed (503) before anything is read; a wrong or missing header is 401; a
 * missing sync store is 503. No Redis call on any refusal.
 *
 * THE WINDOW. decideCfbLock is league-free: the day locks one hour (NFL_LOCK.leadMs) before the
 * FIRST kickoff of the PT date, from whatever is still ahead. A Sunday poke at 18:00Z, after
 * the 17:00Z early window has kicked, locks from the late-afternoon and night games only — a
 * kicked game is never priced. After the LAST kickoff the day gets a NO-PLAY record whose note
 * says the window was missed (and, when the dated odds-gap marker says so, that the odds feed
 * lost the day rather than the ticker).
 *
 * DECIDE BEFORE YOU SPEND, as on CFB: the decision is made on the FREE board (ESPN only), and
 * the one Odds API pull is paid for only on a poke that is actually going to lock. A slate that
 * is still ahead but cannot be priced is refused (502 `odds-missing`) and retried on the next
 * poke — a day is never locked NO-PLAY for want of lines.
 *
 * ?date=YYYY-MM-DD backfills ONE day and suppresses the sweep and the settle pass, exactly as
 * on CFB; ?dry=1 builds and returns the card and writes nothing.
 *
 * One odds call (240 s data cache) + ESPN (60 s) + Redis — cheap, no per-event props pull.
 */

export const dynamic = "force-dynamic";
/** Above NFL_LOCK.forwardTimeoutMs on purpose — the caller's abort is the binding one. */
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The literals are pinned here on purpose (tests/nfl-lock-route.test.ts scans for them) and
   type-checked against the shared contract so they can never drift from NFL_REDIS. */
const STORE_KEY: typeof NFL_REDIS.ledger = "pl:nfl:ledger:v1";
const BANK_STORE_KEY: typeof NFL_REDIS.bank = "pl:nfl:bank:v1";
/** the odds-gap marker PREFIX — one short-lived key per date, never a blob. */
const ODDS_GAP_PREFIX: typeof NFL_REDIS.oddsGap = "pl:nfl:oddsgap:v1";

/**
 * THE SHARED SHELL. The sweep, the settle pass, the top-up and the store readers live in
 * src/lib/server/football-lock.ts, driven by NFL_LEAGUE and these three keys. The FEEDS are the
 * league-aware slate-server forms bound to NFL_LEAGUE — the same calls the lock path below makes.
 */
const KEYS: LockKeys = { ledger: STORE_KEY, bank: BANK_STORE_KEY, oddsGapPrefix: ODDS_GAP_PREFIX };
const FEEDS: LockFeeds = feedsOf(NFL_LEAGUE);

type Stored = LockStored;

/** The same default the device store sizes from before its first bank write. */
const DEFAULT_BANK: BankStore = { base: NFL_BANK_BASE, asOf: NFL_PAPER.since, log: [] };

const isNfl = isEntryOf(NFL_LEAGUE);
const stakes = (tix: CfbTicket[]) => tix.reduce((s, t) => s + t.stake, 0);

export async function GET(req: NextRequest) {
  /* FAILS CLOSED — the scheduler's gate, verbatim: an unset secret is a configuration error. */
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "nfl-lock-not-configured: CRON_SECRET unset — failing closed" }, { status: 503 });
  }
  if (!cronHeaderAuthed(req)) {
    console.warn(`[nfl-lock] unauthorized poke ip=${req.headers.get("x-forwarded-for") ?? "?"}`);
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
    /* TWO DIFFERENT 502s, worded apart: "store unreachable" is an upstream failure and the next
       poke will very likely succeed; "unreadable" means the blob arrived and could not be
       understood, which needs a person. Neither writes anything. */
    const err = e as Error;
    const label = err instanceof FootballStoreUnreadable ? "nfl store unreadable" : "store unreachable";
    return NextResponse.json({ error: `${label}: ${err.message}` }, { status: 502 });
  }
  let ledger = stored?.ledger ?? [];
  let bankroll = cfbBankroll(bank ?? DEFAULT_BANK, ledger.filter(isNfl));

  /* The previous dates first, and on EVERY branch below — a poke is never silent about them. */
  const sweep: Sweep | null = asked ? null : await sweepPrevDates(NFL_LEAGUE, KEYS, { date, now, dry, ledger, bankroll, feeds: FEEDS });

  /* The settle pass — after the sweep, so its own re-read at write time sees the record the
     sweep just wrote. Suppressed by an explicit ?date, like the sweep: a hand-typed date is a
     backfill about ONE day. */
  const settled: SettleResult | null = asked ? null : await settlePass(NFL_LEAGUE, KEYS, { date, now, dry, ledger, bankroll, feeds: FEEDS });
  const settle = settled?.report ?? null;
  if (settled?.ledger) {
    ledger = settled.ledger;
    bankroll = cfbBankroll(bank ?? DEFAULT_BANK, ledger.filter(isNfl));
  }

  const say = (body: Record<string, unknown>, init?: { status: number }) =>
    NextResponse.json({ ...body, ...(sweep ? { sweep } : {}), ...(settle ? { settle } : {}) }, init);

  const existing = ledger.find((e) => e.date === date && e.locked);
  if (existing) {
    /* THE TOP-UP: the $350 must DEPLOY, not just be intended. See topUpDate. */
    const topUp = isNfl(existing)
      ? await topUpDate(NFL_LEAGUE, KEYS, existing, { now, dry, bankroll, feeds: FEEDS })
      : { action: "skipped", reason: `the stored entry for ${date} is not an NFL card — nothing here may touch it.` };
    return say({ status: "already-locked", date, at, lockedAt: existing.lockedAt ?? null, source: existing.source ?? "device", dry, topUp });
  }

  let espn: unknown[];
  try {
    espn = await espnEventsOf(NFL_LEAGUE, date);
  } catch (e) {
    return say({ error: `espn unavailable: ${(e as Error).message}` }, { status: 502 });
  }

  /* DECIDE BEFORE YOU SPEND. Kickoff times come from ESPN alone, so the decision is made on the
     FREE board (no odds events, no FPI, no Odds API credit). */
  const free: CfbBoard = buildCfbBoard({ date, espnEvents: espn, oddsEvents: [], fpi: null, now, bankroll, league: NFL_LEAGUE });
  const d = decideCfbLock(free.games, now, NFL_LEAGUE.lock.leadMs);
  if (d.kind === "no-slate") return say({ status: "no-slate", date, at, dry });
  if (d.kind === "waiting") {
    return say({
      status: "waiting",
      date,
      at,
      firstKickoff: new Date(d.firstKickoff).toISOString(),
      locksAt: new Date(d.locksAt).toISOString(),
      leadMs: NFL_LEAGUE.lock.leadMs,
      dry,
    });
  }

  /* ...and only HERE, on a poke that is actually going to lock, is an odds pull paid for. */
  let slate: CfbSlate;
  try {
    slate = await slateFromEspnOf(NFL_LEAGUE, date, espn, now, bankroll);
  } catch (e) {
    return say({ error: `board failed: ${(e as Error).message}` }, { status: 502 });
  }

  /* The day is still ahead but cannot be priced — refuse and retry, never lock. */
  const pricedAhead = cfbPricedAhead(slate.games, now);
  if (d.ahead > 0 && (slate.oddsMissing || pricedAhead === 0)) {
    const why = slate.oddsMissing ? "the Odds API call failed or had no key" : "the odds feed matched none of the games still ahead";
    if (!dry) await markOddsGap(NFL_LEAGUE, KEYS, date, now);
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

  /* A same-day record for a window that closed unlocked reads the dated odds-gap marker, so
     the note can say the odds feed lost the day instead of blaming a ticker gap. */
  const cause: CfbMissCause = d.ahead === 0 ? await missCauseOf(KEYS, date) : "no-lock";
  let entry: CfbLedgerEntry;
  try {
    entry = buildLockEntry(NFL_LEAGUE, slate, { now, bankroll, ahead: d.ahead, total: d.total, firstKickoff: d.firstKickoff, cause }).entry;
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

  /* MERGE, never replace: re-read the store at write time so a device push that landed while
     the slate was building is kept, then the same kernel PUT /api/nfl/ledger runs. */
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
  console.log(`[nfl-lock] LOCKED ${date}: ${summary.core} core $${summary.coreStake}, ${summary.fun} fun $${summary.funStake}${summary.noPlay ? " (NO-PLAY)" : ""} — ${summary.note}`);
  return say(summary);
}
