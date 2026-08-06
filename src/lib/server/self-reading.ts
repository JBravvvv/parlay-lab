import type { SyncEntry } from "@/lib/ledger-merge";
import { redis } from "@/lib/server/store";

/**
 * SELF-READING (2026-08-06, operator requirement: nothing waits on a human paste).
 *
 * The run that writes the board and the locked card also writes the card's READING —
 * the same analysis the session performed by hand on 08-05's fixtures — so Josh opens
 * ONE URL (/api/board?date=...) and sees the card AND its reading, no session involved.
 * Empty-gate and reason-record days self-read the same way: the artifact explains itself.
 *
 * A READER, NOT A WRITER: buildReading never throws on what it finds — a violation
 * (placed set, a mispriced single) becomes a LOUD field in the artifact. Only writers
 * (buildLockEntry's TWO-ALLOCATORS check) throw. buildReadingSafe wraps the builder so a
 * generator failure yields a PARTIAL with a named continuation, never nothing — the
 * no-silent-days rule extended to no-unread-days.
 *
 * VACUITY RULE, encoded: any check over an empty population declares itself VACUOUS in
 * the output instead of passing silently — the lesson of the vacuous lock-mechanics
 * tests (ev_gated clears zero on the fixture) and reading 31's own vacuity clause.
 *
 * WHAT REMAINS HUMAN, permanently: Josh places and marks (placed/actualStake — real
 * money, his thumb). The reading only ever reports placed:null as UNANSWERED.
 */

export const READING_KEY = (date: string) => `pl:reading:${date}`;
/** matches the board TTL (EX 259200) — the reading rides /api/board into the daily archive */
const TTL = 259200;

export const CHECKLIST =
  "pl_selmode reads ev_gated last before placing · no slip above $50 · stake <= the allocator's locked number · place, then mark placed and actualStake";

const EPS = 1e-9;

type Gen = { slate?: { total: number; started: number; ready: number; unstarted: number } | null } & Record<string, unknown>;

export type Reading = {
  date: string;
  at: number;
  kind: "fire" | "backfill" | "reason-record" | "repair";
  reading31: {
    lockPresent: boolean;
    lockedTrue: boolean;
    sourceServerLock: boolean;
    trigger: string | null;
    selMode: string | null;
    placedNullAll: boolean;
    actualStakeNullAll: boolean;
    daily: number | null;
    bankroll: number | null;
    allocSum: number | null;
    ticketCount: number;
    emptyGate: boolean;
    blockedReasons: Record<string, number>;
    refusals: { lockMaxAgeMin: string; exposureCap: string };
    note: string | null;
    violations: string[];
  };
  slate: Gen["slate"] | null;
  structureMix: {
    singles: number;
    parlays: number;
    singleStake: number;
    parlayStake: number;
    stakeShareSingles: number | null;
    allocatorOrder: { name: string | null; type: string | null; legs: number; stake: number; czEv: number | null }[];
    vacuous?: string;
  };
  singlesVsLeg: {
    checked: number;
    mismatches: { name: string | null; ticketDec: number | null; legCz: number | null }[];
    impossibleBranchFired: boolean;
    flag?: string;
    uncheckable?: number;
    vacuous?: string;
  };
  m14: {
    capBinding: boolean | null;
    allocSum: number | null;
    daily: number | null;
    unallocated: number | null;
    blockedTotal: number;
    nonMonotoneStakePairs: number;
    note: string;
    vacuous?: string;
  };
  checklist: string;
  partial?: boolean;
  error?: string;
  continuation?: string;
};

type LegView = { lkey?: string | null; label?: string | null; prop?: string | null; cz?: number | null };
type TicketView = {
  id?: string;
  stake?: number;
  czDec?: number | null;
  czEv?: number | null;
  name?: string | null;
  type?: string | null;
  legs?: LegView[];
  placed?: unknown;
  actualStake?: unknown;
};

export function buildReading(args: { entry: SyncEntry; gen: Gen | null; date: string; now: number; kind: Reading["kind"] }): Reading {
  const { entry, gen, date, now, kind } = args;
  /* SyncTicket's fields are loosely typed at the ledger boundary; the reading views them
     structurally and REPORTS what it finds rather than trusting the types. */
  const core = ((entry.core ?? []) as unknown as TicketView[]);
  const violations: string[] = [];

  for (const t of core) {
    if (t.placed !== null && t.placed !== undefined) violations.push(`ticket ${t.id}: placed=${String(t.placed)} at lock time — must be null (UNANSWERED)`);
    if (t.actualStake !== null && t.actualStake !== undefined) violations.push(`ticket ${t.id}: actualStake=${String(t.actualStake)} at lock time — must be null`);
  }

  const reading31: Reading["reading31"] = {
    lockPresent: true,
    lockedTrue: entry.locked === true,
    sourceServerLock: entry.source === "server-lock",
    trigger: (entry.trigger as string) ?? null,
    selMode: (entry.selMode as string) ?? null,
    placedNullAll: core.every((t) => t.placed == null),
    actualStakeNullAll: core.every((t) => t.actualStake == null),
    daily: (entry.daily as number) ?? null,
    bankroll: (entry.bankroll as number) ?? null,
    allocSum: (entry.allocSum as number) ?? null,
    ticketCount: core.length,
    emptyGate: core.length === 0 && kind !== "reason-record",
    blockedReasons: (entry.blockedReasons as Record<string, number>) ?? {},
    refusals: {
      lockMaxAgeMin: "n/a — prices fresh by construction on the generation path",
      exposureCap: `daily ceiling $${entry.daily ?? "?"} (dailyBankrollCap x bankroll, server-side)`,
    },
    note: (entry.note as string) ?? null,
    violations,
  };
  if (entry.locked !== true) violations.push("entry.locked is not true — a reading over an unlocked entry");

  const singles = core.filter((t) => (t.legs ?? []).length === 1);
  const parlays = core.filter((t) => (t.legs ?? []).length >= 2);
  const singleStake = singles.reduce((s, t) => s + (t.stake ?? 0), 0);
  const parlayStake = parlays.reduce((s, t) => s + (t.stake ?? 0), 0);
  const totalStake = singleStake + parlayStake;
  const structureMix: Reading["structureMix"] = {
    singles: singles.length,
    parlays: parlays.length,
    singleStake,
    parlayStake,
    stakeShareSingles: totalStake > 0 ? singleStake / totalStake : null,
    /* core is in allocator pick order (buildLockEntry maps alloc.picks in order) — the
       ranking the mix sits beside, per the first-ON card-level reading */
    allocatorOrder: core.map((t) => ({ name: t.name ?? null, type: t.type ?? null, legs: (t.legs ?? []).length, stake: t.stake ?? 0, czEv: (t.czEv as number) ?? null })),
  };
  if (core.length === 0) structureMix.vacuous = "VACUOUS — zero tickets; the mix has no population";

  const singlesVsLeg: Reading["singlesVsLeg"] = { checked: 0, mismatches: [], impossibleBranchFired: false };
  let uncheckable = 0;
  for (const s of singles) {
    const legCz = (s.legs?.[0]?.cz as number) ?? null;
    const tDec = (s.czDec as number) ?? null;
    if (legCz == null || tDec == null) { uncheckable++; continue; }
    singlesVsLeg.checked++;
    if (Math.abs(tDec - legCz) > EPS) singlesVsLeg.mismatches.push({ name: s.name ?? null, ticketDec: tDec, legCz });
  }
  if (uncheckable) singlesVsLeg.uncheckable = uncheckable;
  if (singlesVsLeg.mismatches.length) {
    singlesVsLeg.impossibleBranchFired = true;
    singlesVsLeg.flag =
      "🔴 IMPOSSIBLE BRANCH FIRED: a single is priced differently as a 1-leg ticket than its own leg — two pricers exist. STOP AND READ before placing (reading 32's pre-commitment).";
  }
  if (singles.length === 0) singlesVsLeg.vacuous = "VACUOUS — zero singles cleared the gate; the single-vs-leg check has no population";

  /* M14 beside the card: cap binding, the blocked census, and stake-vs-EV monotonicity
     counted (a lower-EV ticket carrying MORE stake than a higher-EV one above it) — the
     ranking-isolated non-monotonicity M14 measured; an observation here, never an error. */
  const blockedTotal = Object.values(reading31.blockedReasons).reduce((s, n) => s + n, 0);
  let nonMono = 0;
  for (let i = 1; i < core.length; i++) {
    const a = core[i - 1], b = core[i];
    if (a.czEv != null && b.czEv != null && (b.czEv as number) < (a.czEv as number) && (b.stake ?? 0) > (a.stake ?? 0)) nonMono++;
  }
  const m14: Reading["m14"] = {
    capBinding: entry.daily != null && entry.allocSum != null ? Math.abs((entry.allocSum as number) - (entry.daily as number)) < 0.5 : null,
    allocSum: (entry.allocSum as number) ?? null,
    daily: (entry.daily as number) ?? null,
    unallocated: (entry.unallocated as number) ?? null,
    blockedTotal,
    nonMonotoneStakePairs: nonMono,
    note: nonMono
      ? `M14 shape present: ${nonMono} adjacent pair(s) where a lower-EV ticket carries more stake — the structural substitution effect, named, not a regression`
      : "stakes monotone along the allocator order",
  };
  if (core.length === 0) m14.vacuous = "VACUOUS — zero tickets; cap/monotonicity checks have no population";

  return { date, at: now, kind, reading31, slate: gen?.slate ?? null, structureMix, singlesVsLeg, m14, checklist: CHECKLIST };
}

/** The partial-on-failure wrapper — no silent days extends to no UNREAD days. */
export function buildReadingSafe(args: Parameters<typeof buildReading>[0]): Reading {
  try {
    return buildReading(args);
  } catch (e) {
    return {
      date: args.date,
      at: args.now,
      kind: args.kind,
      partial: true,
      error: (e as Error).message,
      continuation: "the next scheduler poke's self-check rebuilds this reading from the stored board and locked card",
      checklist: CHECKLIST,
    } as Reading;
  }
}

export async function writeReading(r: Reading): Promise<void> {
  await redis(["SET", READING_KEY(r.date), JSON.stringify(r), "EX", TTL]);
}

export async function getReading(date: string): Promise<Reading | null> {
  try {
    const raw = (await redis(["GET", READING_KEY(date)])) as string | null;
    return raw ? (JSON.parse(raw) as Reading) : null;
  } catch {
    return null;
  }
}
