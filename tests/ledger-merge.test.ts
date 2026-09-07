import { describe, expect, it } from "vitest";
import { mergeLedgers, unionCore, unionFun, validateLedger, type SyncEntry } from "../src/lib/ledger-merge";
import { PAPER } from "@/lib/paper-mode";
import { CFB_PAPER } from "@/lib/cfb/rules";
import { computeBankroll, realizedPL, todayExposure, type BankStore } from "@/lib/bankroll";
import { decideTopUp } from "@/lib/server/blocks";

const day = (date: string, over: Partial<SyncEntry> = {}): SyncEntry => ({
  date,
  locked: true,
  daily: 40,
  fun: 10,
  core: [
    { id: "t1", bucket: "core", name: "Mixed · 3 legs", stake: 25, confirmed: null },
    { id: "t2", bucket: "core", name: "Hits parlay · 2 legs", stake: 15, confirmed: null },
  ],
  funT: [{ id: "f1", bucket: "fun", name: "HR parlay · 3 legs", stake: 10, confirmed: null }],
  ...over,
});

describe("validateLedger", () => {
  it("accepts a clean locked ledger and rejects the broken shapes", () => {
    expect(validateLedger([day("2026-07-16")]).ok).toBe(true);
    expect(validateLedger("nope").ok).toBe(false);
    expect(validateLedger([{ date: "2026-07-16" }]).ok).toBe(false); // not locked
    expect(validateLedger([day("2026-07-16", { locked: false })]).ok).toBe(false);
    expect(validateLedger([day("bad-date" as never)]).ok).toBe(false);
    expect(validateLedger([day("2026-07-16"), day("2026-07-16")]).ok).toBe(false); // dup date
  });
});

describe("mergeLedgers", () => {
  it("unions distinct days from both devices — nothing is ever lost", () => {
    const phone = [day("2026-07-15"), day("2026-07-16")];
    const desktop = [day("2026-07-14")];
    const m = mergeLedgers(desktop, phone);
    expect(m.map((e) => e.date)).toEqual(["2026-07-14", "2026-07-15", "2026-07-16"]);
  });

  it("an empty device pulls everything and clobbers nothing", () => {
    const phone = [day("2026-07-15"), day("2026-07-16")];
    expect(mergeLedgers([], phone)).toEqual(mergeLedgers(phone, []));
    expect(mergeLedgers([], phone).length).toBe(2);
  });

  it("same day: the graded copy wins, and the other side's accruals overlay", () => {
    // done:true always comes with a grade for EVERY ticket (shGrade writes all
    // of them before setting done) — a done flag over a partial map would be
    // reopened by the merge so the auto-grader covers the missing tickets
    const graded = day("2026-07-16", {
      grading: {
        done: true,
        tickets: { t1: { result: "won", payout: 50 }, t2: { result: "lost", payout: 0 }, f1: { result: "lost", payout: 0 } },
        legs: {},
      },
    });
    const withClv = day("2026-07-16", {
      clv: { t2: { am: -120, at: 1752700000000 } },
      core: [
        { id: "t1", bucket: "core", name: "Mixed · 3 legs", stake: 25, confirmed: null },
        { id: "t2", bucket: "core", name: "Hits parlay · 2 legs", stake: 15, confirmed: -118 },
      ],
    });
    for (const m of [mergeLedgers([graded], [withClv]), mergeLedgers([withClv], [graded])]) {
      expect(m).toHaveLength(1);
      expect(m[0].grading?.done).toBe(true); // graded base kept
      expect(m[0].clv?.t2.am).toBe(-120); // CLV sighting carried over
      expect(m[0].core.find((t) => t.id === "t2")?.confirmed).toBe(-118); // NV confirm carried over
    }
  });

  it("is symmetric and idempotent (devices converge no matter who syncs first)", () => {
    const a = [day("2026-07-14"), day("2026-07-16", { grading: { done: true, tickets: {}, legs: {} } })];
    const b = [day("2026-07-15"), day("2026-07-16", { clv: { t1: { am: 100, at: 1 } } })];
    const ab = mergeLedgers(a, b);
    const ba = mergeLedgers(b, a);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, b))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
  });

  it("unlocked drafts never sync", () => {
    const m = mergeLedgers([day("2026-07-16", { locked: false }) as never], [day("2026-07-15")]);
    expect(m.map((e) => e.date)).toEqual(["2026-07-15"]);
  });
});

describe("2026-07-18 doubleheader repair (Mangum graded vs the wrong game)", () => {
  type GameRef = { pk: number | null; start?: string };
  const GK = "pittsburghpirates@clevelandguardians";
  const games = (e: SyncEntry) => e.games as Record<string, GameRef>;
  const staleDay = (): SyncEntry =>
    day("2026-07-18", {
      games: {
        [GK]: { pk: 824412, start: "2026-07-18T23:10:00Z" }, // game 2 — Mangum 1-for-5
        "tampabayrays@boston": { pk: 555001, start: "2026-07-18T20:10:00Z" },
      },
      grading: { done: true, tickets: { t1: { result: "won", payout: 80 } }, legs: {} },
      gradedAt: 1752900000000,
    });

  it("re-points the pk at game 1 and clears the stale grading, whichever side it arrives on", () => {
    const cases = [
      mergeLedgers([staleDay()], []),
      mergeLedgers([], [staleDay()]),
      mergeLedgers([staleDay()], [staleDay()]),
    ];
    for (const m of cases) {
      expect(games(m[0])[GK].pk).toBe(824414); // game 1 — Mangum 0-for-5, the game the card priced
      expect(games(m[0])[GK].start).toBe("2026-07-18T17:10:00Z");
      expect(m[0].grading).toBeNull();
      expect(games(m[0])["tampabayrays@boston"].pk).toBe(555001); // other legs untouched
    }
  });

  it("a corrected, re-graded copy outranks every stale copy in both merge orders", () => {
    const corrected = day("2026-07-18", {
      games: { [GK]: { pk: 824414, start: "2026-07-18T17:10:00Z" } },
      grading: { done: true, tickets: { t1: { result: "lost", payout: 0 } }, legs: {} },
    });
    for (const m of [mergeLedgers([corrected], [staleDay()]), mergeLedgers([staleDay()], [corrected])]) {
      const t = (m[0].grading?.tickets as Record<string, { result: string }>).t1;
      expect(t.result).toBe("lost");
      expect(games(m[0])[GK].pk).toBe(824414);
    }
  });

  it("touches nothing else — other days keep their grading even with the same pk", () => {
    const other = day("2026-07-17", {
      games: { anything: { pk: 824412 } },
      grading: { done: true, tickets: {}, legs: {} },
    });
    const m = mergeLedgers([other], []);
    expect(games(m[0]).anything.pk).toBe(824412);
    expect(m[0].grading?.done).toBe(true);
  });
});

/* ============================================================================================
 * THE CORE UNION — INSTRUCTION 45 (2026-09-06)
 *
 * Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical Core
 * money and $25 Fun money per day". The CFB server lock deploys what it can at the lock instant
 * and a bounded TOP-UP (src/lib/cfb/lock-server.ts planCfbTopUp / applyCfbTopUp) APPENDS core
 * tickets later in the day to reach the $150. That makes CORE exactly what the funT union above
 * already exists for: the two sides of a merge can hold different ticket SETS for one date.
 *
 * WHAT WENT WRONG (measured before this block was written): mergeDay unioned funT and never
 * core. Josh pulls the $75 server entry at noon and the CFB Ledger tab grades it, so his copy
 * gains grading richness; the server tops the day up to $150 at 1pm; his app pushes at 2pm;
 * pickBase prefers his graded $75 copy (gradeScore beats everything) and the three appended
 * core tickets are DELETED from durable state — the day silently reverts to $75 while the
 * ledger keeps calling it a full paper day and cfbBankroll sizes every later day off it.
 *
 * WHY THE UNION IS GUARDED RATHER THAN BLIND. CFB core ids are POSITIONAL
 * (src/lib/cfb/card.ts: `cfb-<date>-core-<i>`), not content-addressed the way MLB's are
 * (shTicketId = type + hash of the sorted legs). Two independent locks of one date — Josh's
 * Builder lock on a device that has not synced, and the server's — therefore both mint
 * `cfb-<date>-core-1`, holding DIFFERENT bets, and a blind union would append the loser's
 * surplus tickets on top of a full $150 card. So the union fires only when the two sides AGREE
 * on the tickets they share (same ids ⇒ same legs) and never past the day's own `daily`
 * allotment. tests/cfb-lock-route.test.ts already pins the rival case ("a device copy of the
 * SAME date outranks the server's"); the cases below pin the rule from this side.
 * ========================================================================================== */

type Leg = Record<string, unknown>;
const cfbLeg = (gkey: string, side: string): Leg => ({
  gkey,
  lkey: `${gkey}:${side}`,
  label: `${side} ML`,
  prop: "ML",
  market: "ml",
  side,
  line: null,
  cz: -150,
});
const cfbTix = (id: string, gkey: string, side: string, stake: number) => ({
  id,
  bucket: "core",
  name: `SINGLE · ${side} ML`,
  stake,
  czOdds: -150,
  confirmed: null,
  legs: [cfbLeg(gkey, side)],
});

const CD = "2026-09-06";
const LOCK_CORE = () => [
  cfbTix(`cfb-${CD}-core-1`, "g1", "ALA", 25),
  cfbTix(`cfb-${CD}-core-2`, "g2", "UGA", 25),
  cfbTix(`cfb-${CD}-core-3`, "g3", "OSU", 25),
];
const TOPUP_CORE = () => [
  cfbTix(`cfb-${CD}-topup1-core-1`, "g4", "LSU", 25),
  cfbTix(`cfb-${CD}-topup1-core-2`, "g5", "TEX", 25),
  cfbTix(`cfb-${CD}-topup1-core-3`, "g6", "USC", 25),
];
const cfbFun = () => [{ id: `cfb-${CD}-fun-1`, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, confirmed: null, legs: [cfbLeg("g1", "ALA"), cfbLeg("g2", "UGA"), cfbLeg("g3", "OSU")] }];

const cfbDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
  ({
    sport: "cfb",
    date: CD,
    locked: true,
    daily: 150,
    fun: 25,
    source: "server-lock",
    trigger: "cfb-lock",
    lockedAt: 1_757_000_000_000,
    core: LOCK_CORE(),
    funT: cfbFun(),
    games: {},
    grading: null,
    ...over,
  }) as SyncEntry;

/** the phone's noon pull of the $75 lock, graded in the CFB Ledger tab — rich, and STALE */
const staleGraded = (): SyncEntry =>
  cfbDay({
    grading: {
      done: true,
      tickets: {
        [`cfb-${CD}-core-1`]: { result: "won", payout: 41.67 },
        [`cfb-${CD}-core-2`]: { result: "lost", payout: 0 },
        [`cfb-${CD}-core-3`]: { result: "lost", payout: 0 },
        [`cfb-${CD}-fun-1`]: { result: "lost", payout: 0 },
      },
      legs: {},
    },
    gradedAt: 1_757_100_000_000,
  });

/** the server's 1pm top-up: the same lock plus three appended core tickets, the day at $150 */
const toppedUp = (): SyncEntry =>
  cfbDay({
    core: [...LOCK_CORE(), ...TOPUP_CORE()],
    topUps: [{ at: 1_757_050_000_000, core: 3, stake: 75 }],
    note: "Top-up 1: 3 core tickets for $75 — the day now carries $150 of the $150.",
  });

const stakeOf = (tix: { stake?: unknown }[]) => tix.reduce((s, t) => s + Number(t.stake ?? 0), 0);
const idsOf = (tix: { id?: unknown }[]) => tix.map((t) => String(t.id)).sort();

describe("core union — the CFB top-up survives a stale graded push (INSTRUCTION 45)", () => {
  it("keeps all six core tickets, sums to $150 exactly once, and keeps the stale copy's grading", () => {
    const [m] = mergeLedgers([staleGraded()], [toppedUp()]);
    expect(m.core).toHaveLength(6);
    expect(idsOf(m.core)).toEqual(idsOf([...LOCK_CORE(), ...TOPUP_CORE()]));
    expect(new Set(idsOf(m.core)).size, "a ticket id was appended twice — the day would be double-staked").toBe(6);
    expect(stakeOf(m.core), "the merged day is not the $150 Josh asked for").toBe(150);
    // the grading Josh's device earned is still there, and the appended tickets reopen it
    const g = m.grading?.tickets as Record<string, { result: string }>;
    expect(g[`cfb-${CD}-core-1`].result).toBe("won");
    expect(g[`cfb-${CD}-core-2`].result).toBe("lost");
    expect(m.grading?.done, "an ungraded appended ticket must reopen grading for the auto-grader").toBe(false);
    expect(m.funT).toHaveLength(1);
    expect(stakeOf(m.funT ?? [])).toBe(25);
  });

  it("is commutative — the phone and the server converge whichever pushes first", () => {
    const ab = mergeLedgers([staleGraded()], [toppedUp()]);
    const ba = mergeLedgers([toppedUp()], [staleGraded()]);
    expect(JSON.stringify(ab), "merge(a,b) !== merge(b,a) — the devices would not converge").toBe(JSON.stringify(ba));
    // and re-merging either side changes nothing
    expect(JSON.stringify(mergeLedgers(ab, [toppedUp()]))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [staleGraded()]))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
  });

  it("a duplicate id is never appended twice — the base's own copy of a shared ticket stands", () => {
    // the other side raised a shared ticket's stake (MLB's withTopUp does exactly this);
    // the id is shared, so it is NOT an append and the base's stake decides, as it always has
    const other = toppedUp();
    other.core[0] = { ...other.core[0], stake: 40 };
    const [m] = mergeLedgers([staleGraded()], [other]);
    expect(m.core).toHaveLength(6);
    expect(m.core.filter((t) => t.id === `cfb-${CD}-core-1`)).toHaveLength(1);
    expect(m.core.find((t) => t.id === `cfb-${CD}-core-1`)?.stake).toBe(25);
    expect(stakeOf(m.core)).toBe(150);
  });

  it("REFUSES the union when the two sides disagree about a shared id — rival locks are never mixed", () => {
    // Josh's Builder lock and the server's lock both mint `cfb-<date>-core-1` from different
    // boards. Appending the surplus of one onto the other would stake a day twice.
    const device = cfbDay({
      source: undefined,
      core: [cfbTix(`cfb-${CD}-core-1`, "g9", "MICH", 20)],
      grading: { done: false, tickets: {}, legs: {} },
    });
    const server = toppedUp();
    for (const m of [mergeLedgers([device], [server]), mergeLedgers([server], [device])]) {
      expect(m[0].core, "a rival lock's tickets were merged into the device's card").toEqual(device.core);
      expect(stakeOf(m[0].core)).toBe(20);
    }
  });

  it("never appends past the day's own allotment — a seventh $25 ticket on a full $150 day is refused", () => {
    // the FULL day is the graded copy, so it wins pickBase and the seventh ticket can only
    // arrive through the append path this block adds — which must refuse it for want of room
    const full = { ...toppedUp(), grading: { done: true, tickets: {}, legs: {} } } as SyncEntry;
    const over = cfbDay({
      core: [...LOCK_CORE(), ...TOPUP_CORE(), cfbTix(`cfb-${CD}-topup2-core-1`, "g7", "ORE", 25)],
      grading: null,
    });
    for (const m of [mergeLedgers([full], [over]), mergeLedgers([over], [full])]) {
      expect(stakeOf(m[0].core), "the merge staked the day past its $150 allotment").toBe(150);
      expect(m[0].core).toHaveLength(6);
    }
  });

  /* ------------------------------------------------------------------------------------------
   * REWRITTEN PIN (INSTRUCTION 45, defect E, 2026-09-06).
   *
   * BEFORE, this case was titled "an entry with no `daily` unions unbounded — legacy days predate
   * the field" and asserted only that two `daily`-less copies of the $75 lock and the $150
   * topped-up day union to 6 tickets / $150. Both of those numbers are BELOW the ceiling, so the
   * old case never actually exercised the unbounded branch it named — it passed identically with
   * or without a cap. The deliberate behaviour it DID name ("unions unbounded") is now wrong:
   * measured synthetically by the critic, two copies of one date with `daily` deleted, one graded
   * at $75 and one carrying two $100 tickets, merged to a core sum of 275 on a day whose ceiling
   * is $150 — and no guard runs on a merge result, so nothing downstream would ever catch it.
   *
   * AFTER, the case pins the new bound: with neither side carrying `daily`, the union falls back
   * to the DESK'S OWN allotment (CFB_PAPER.daily for a `sport:"cfb"` entry, PAPER.daily
   * otherwise) instead of to no bound at all. That is a REWRITE, not a weakening: the old
   * assertions (6 tickets, $150) are re-asserted below in the case that still fits under the
   * fallback, and the new case adds a bound where there was none. Nothing that passed for a real
   * reason stopped being asserted.
   *
   * WHY A FALLBACK RATHER THAN A REJECTION: the critic could not reach the unbounded branch with
   * real entries — lockCfbCard (src/lib/cfb/ledger.ts) and buildLockEntry
   * (src/lib/server/lock-card.ts) both stamp `daily` unconditionally, and the one writer that
   * omits it, buildReasonRecord (src/lib/server/lock-card.ts), emits `core: []` so it has nothing
   * to union. The hazard is latent, and the fix is the one that cannot break a legacy day.
   * ---------------------------------------------------------------------------------------- */
  it("with no `daily` on either side the union falls back to the DESK'S OWN allotment, not to unbounded", () => {
    const a = cfbDay({ daily: undefined, grading: { done: true, tickets: {}, legs: {} } }); // $75, wins pickBase
    const b = cfbDay({
      daily: undefined,
      core: [...LOCK_CORE(), cfbTix(`cfb-${CD}-topup1-core-1`, "g4", "LSU", 100), cfbTix(`cfb-${CD}-topup1-core-2`, "g5", "TEX", 100)],
    });
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(stakeOf(m[0].core), "a `daily`-less merge staked the day past the CFB desk's own allotment").toBeLessThanOrEqual(CFB_PAPER.daily);
      expect(stakeOf(m[0].core), "neither $100 ticket fits over the $75 base under a $150 ceiling").toBe(75);
      expect(m[0].core).toHaveLength(3);
    }
  });

  it("with no `daily`, an append that FITS under the desk allotment still lands (the old case, re-asserted)", () => {
    const a = cfbDay({ daily: undefined, grading: { done: true, tickets: {}, legs: {} } });
    const b = cfbDay({ daily: undefined, core: [...LOCK_CORE(), ...TOPUP_CORE()] });
    const [m] = mergeLedgers([a], [b]);
    expect(m.core).toHaveLength(6);
    expect(stakeOf(m.core)).toBe(150);
    expect(stakeOf(m.core)).toBeLessThanOrEqual(CFB_PAPER.daily);
  });
});

describe("core union — the MLB desk (block fires append the same way)", () => {
  // MLB core ids are shTicketId(type + hash of the sorted legs) — content-addressed, so the same
  // bet always carries the same id and two different bets never collide. Block fires APPEND to
  // the date's entry (src/lib/server/lock-card.ts: "block fires APPEND … dedupe by id"), so an
  // MLB day is the same shape of merge as the CFB top-up.
  const mlbLeg = (lkey: string, label: string) => ({ lkey, label, prop: "batter_hits", cz: -130 });
  const mlbTix = (id: string, lkey: string, stake: number) => ({
    id,
    stake,
    name: `MIXED · ${lkey}`,
    type: "MIXED",
    confirmed: null,
    placed: false,
    actualStake: 0,
    legs: [mlbLeg(lkey, `${lkey} over`)],
  });
  const B1 = () => [mlbTix("MIXED_a1", "l1", 40), mlbTix("MIXED_b2", "l2", 35)];
  const B2 = () => [mlbTix("MIXED_c3", "l3", 40), mlbTix("MIXED_d4", "l4", 35)];
  const mlbDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ date: "2026-09-06", locked: true, daily: 150, fun: 25, core: B1(), funT: [{ id: "HR_z", stake: 25, confirmed: null, legs: [mlbLeg("h1", "HR over")] }], ...over }) as SyncEntry;

  /* ------------------------------------------------------------------------------------------
   * EXTENDED PIN (INSTRUCTION 45, defect K2, 2026-09-06).
   *
   * BEFORE, this case asserted ticket count (4), core stake sum (150), the surviving grade and
   * commutativity — and NOTHING about the day's money METADATA, so it passed green over a merged
   * entry whose `allocSum` still read the base's stale 75. The fixtures carried no allocSum /
   * gatedSum at all and only the loser carried `blocks`, so the defect had nothing to show up in.
   *
   * AFTER, the fixtures carry the money metadata a real `buildLockEntry` stamps (allocSum,
   * gatedSum, blocks, paper) and the case reads all three back. Every assertion that was here is
   * still here, verbatim; this is an EXTENSION, not a rewrite of anything.
   *
   * WHY IT MATTERS: `decideTopUp` (src/lib/server/blocks.ts) computes `owed = daily - allocSum`.
   * A merged day carrying the full $150 of core but a stale `allocSum: 75` reads owed = $75 and
   * fires another top-up generate run — roughly 120 Odds credits — deploying a THIRD block on top
   * of a full allotment. Nothing downstream catches it: lock-card.ts's money guards are the TWO
   * ALLOCATORS pair and the ledger validator, none of which compares core stake sum to `daily`.
   * The second case below drives `decideTopUp` over the merged entry and pins owed at 0.
   * ---------------------------------------------------------------------------------------- */
  it("a graded block-1 copy merged with the block-1+2 entry keeps all four tickets and $150", () => {
    const graded = mlbDay({ paper: true, allocSum: 75, gatedSum: 75, blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 } }, grading: { done: true, tickets: { MIXED_a1: { result: "won", payout: 70 } }, legs: {} } });
    const both = mlbDay({ paper: true, allocSum: 150, gatedSum: 150, core: [...B1(), ...B2()], blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 }, b2: { budget: 75, tickets: 2, firedAt: 2 } } });
    const ab = mergeLedgers([graded], [both]);
    const ba = mergeLedgers([both], [graded]);
    expect(ab[0].core).toHaveLength(4);
    expect(stakeOf(ab[0].core)).toBe(150);
    expect((ab[0].grading?.tickets as Record<string, { result: string }>).MIXED_a1.result).toBe("won");
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    // the money metadata must describe the UNITED core, not the base's stale half of the day
    expect((ab[0] as { allocSum?: number }).allocSum, "the merged day still reads the base's stale allocSum — decideTopUp would buy a third block").toBe(150);
    expect((ab[0] as { allocSum?: number }).allocSum).toBe(stakeOf(ab[0].core));
    expect((ab[0] as { gatedSum?: number }).gatedSum, "the appended tickets' gated sizing was not carried").toBe(150);
    expect(Object.keys((ab[0] as { blocks?: Record<string, unknown> }).blocks ?? {}).sort(), "block 2's own fire record was dropped by the merge").toEqual(["b1", "b2"]);
  });

  it("and `decideTopUp` over the merged entry owes NOTHING — no third block on a full day", () => {
    const graded = mlbDay({ paper: true, allocSum: 75, gatedSum: 75, blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 } }, grading: { done: true, tickets: {}, legs: {} } });
    const both = mlbDay({ paper: true, allocSum: 150, gatedSum: 150, core: [...B1(), ...B2()], blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 }, b2: { budget: 75, tickets: 2, firedAt: 2 } } });
    for (const m of [mergeLedgers([graded], [both]), mergeLedgers([both], [graded])]) {
      const d = decideTopUp({
        entry: m[0] as unknown as Record<string, unknown>,
        blocks: [],
        registry: {},
        starts: [Date.UTC(2026, 8, 6, 23, 0)],
        now: Date.UTC(2026, 8, 6, 20, 0),
        daily: PAPER.daily,
        max: 2,
      });
      expect(d.owed, "a day already carrying the whole $150 was priced as still owing money").toBe(0);
      expect(d.fire, "the sweep would have fired a third block over a full allotment").toBe(false);
      expect(d.reason).toMatch(/fully deployed/);
    }
  });

  it("the fill-only accrual rules are untouched by the union", () => {
    // the appended tickets arrive with their own placed/actualStake, and a SHARED ticket still
    // fills field-by-field from the loser without ever overwriting an answer
    const laptop = mlbDay({
      grading: { done: true, tickets: {}, legs: {} },
      // b2 is UNANSWERED on the laptop (placed:null), so the phone's answer fills it
      core: [{ ...mlbTix("MIXED_a1", "l1", 40), placed: true, actualStake: 25 }, { ...mlbTix("MIXED_b2", "l2", 35), placed: null, actualStake: null }],
    });
    const phone = mlbDay({ core: [{ ...mlbTix("MIXED_a1", "l1", 40), placed: false, actualStake: 0, confirmed: -125 }, { ...mlbTix("MIXED_b2", "l2", 35), placed: true, actualStake: 35 }, ...B2()] });
    const [m] = mergeLedgers([laptop], [phone]);
    expect(m.core).toHaveLength(4);
    const a1 = m.core.find((t) => t.id === "MIXED_a1");
    expect(a1?.placed, "an existing answer was overwritten").toBe(true);
    expect(a1?.actualStake).toBe(25);
    expect(a1?.confirmed, "the loser's NV confirm was dropped").toBe(-125);
    expect(m.core.find((t) => t.id === "MIXED_b2")?.placed, "a null took no answer").toBe(true);
    expect(m.core.find((t) => t.id === "MIXED_c3")?.placed, "an appended ticket lost its own placement").toBe(false);
  });

  /* ------------------------------------------------------------------------------------------
   * REWRITTEN PIN (INSTRUCTION 45, defect N2, 2026-09-06).
   *
   * BEFORE, the fixture was `a.funT = [HR_z $25]` against `b.funT = [HR_z $25, HR_y $10]`, and the
   * assertion was `expect(idsOf(m.funT ?? [])).toEqual(["HR_y", "HR_z"])` — i.e. the $10 append
   * lands on top of a bucket already holding $25, for a merged fun total of $35 on a day whose own
   * `fun` field says 25 and whose desk allotment (PAPER.fun) is 25. The funT union had NO bound at
   * the time, so that number was simply not being looked at; the case was written to pin that an
   * append SURVIVES the merge, and the $35 was incidental to it.
   *
   * AFTER, the same assertion runs on a fixture that respects the day's own fun allotment: the
   * ladder ticket at $15 plus the HR ticket at $10, which is the shape `buildLockEntry` actually
   * mints (src/lib/server/lock-card.ts: `hrAmount = ladder ? PAPER.fun - FUN_LADDER.amount :
   * PAPER.fun` — the bucket sums to PAPER.fun across however many tickets it holds). The pin's
   * MEANING is untouched: both ids are still asserted present, so an append on one device still
   * has to survive a merge with a copy that predates it. What changed is that the fixture no
   * longer quietly asserts $35 of fun money on a $25 day.
   *
   * This is a REWRITE, not a loosening. The old fixture's numbers are not discarded — they are
   * re-asserted immediately below as the REFUSAL they now are, so the exact case that used to pass
   * is still exercised and its outcome is now pinned deliberately instead of incidentally.
   * ---------------------------------------------------------------------------------------- */
  it("the funT union still works beside the core union", () => {
    const a = mlbDay({ funT: [{ id: "HR_z", stake: 15, confirmed: null, legs: [mlbLeg("h1", "HR over")] }], grading: { done: true, tickets: {}, legs: {} } });
    const b = mlbDay({ funT: [{ id: "HR_z", stake: 15, confirmed: null, legs: [mlbLeg("h1", "HR over")] }, { id: "HR_y", stake: 10, confirmed: null, legs: [mlbLeg("h2", "HR over")] }] });
    const [m] = mergeLedgers([a], [b]);
    expect(idsOf(m.funT ?? [])).toEqual(["HR_y", "HR_z"]);
    expect(stakeOf(m.funT ?? []), "the fun bucket is $25 a day, whole").toBe(PAPER.fun);
    expect(m.core).toHaveLength(2);
  });

  it("a funT append that would breach the day's fun allotment is refused (the old fixture, re-asserted)", () => {
    const a = mlbDay({ grading: { done: true, tickets: {}, legs: {} } }); // funT [HR_z $25] — already the whole bucket
    const b = mlbDay({ funT: [{ id: "HR_z", stake: 25, confirmed: null, legs: [mlbLeg("h1", "HR over")] }, { id: "HR_y", stake: 10, confirmed: null, legs: [mlbLeg("h2", "HR over")] }] });
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(stakeOf(m[0].funT ?? []), "the merge staked $35 of fun money on a $25 day").toBe(25);
      expect(idsOf(m[0].funT ?? [])).toEqual(["HR_z"]);
    }
  });

  /* ==========================================================================================
   * THE SHARED-ID RAISE — INSTRUCTION 45, defect D (2026-09-06).
   *
   * WHAT WENT WRONG. The core union closed only half the hazard: it appends tickets carrying NEW
   * ids, but the pickBase winner is deep-copied wholesale and `fill` copies only ACCRUAL_FIELDS,
   * so a stake RAISED under an EXISTING id was still discarded. MLB's residue top-up
   * (src/lib/server/lock-card.ts `withTopUp`: `{ ...t, stake: Number(t.stake) + tu[t.id],
   * topUp: tu[t.id] }`) raises a shared ticket's stake under its existing id — deliberately
   * excluded from the AGREEMENT comparison, which compares LEG IDENTITY and never price or stake,
   * and then never carried anywhere.
   *
   * MEASURED (critic's probe, verbatim shape, reproduced as the first case below): the phone's
   * copy of 2026-09-05 core `[MIXED_a1 $40, MIXED_b2 $35]` with `grading:{done:false}`
   * (gradeScore 1) and the server's copy after the 2pm residue fire `[MIXED_a1 $60 (topUp:20),
   * MIXED_b2 $35]` with no grading (gradeScore 0). pickBase takes the phone; coreAppends finds no
   * new ids; the merged day carried `MIXED_a1.stake === 40`, `topUp === undefined` and a core sum
   * of 75. The $20 the desk actually deployed was deleted from durable state, and ledgerStats /
   * realizedPL / computeBankroll all scored the smaller day.
   *
   * WHY LARGER-WINS IS SAFE. No writer on either desk lowers a stake under a fixed id:
   *   · MLB  `withTopUp` only ADDS (`+ tu[t.id]`, and only when `tu[t.id] > 0`); carried tickets
   *          come through byte for byte; the browser's `shLockCard` refuses a locked date outright
   *          ("no retroactive edits, ever").
   *   · CFB  `planCfbTopUp` mints NEW ids (`cfb-<date>-topup<n>-core-<i>`) and `applyCfbTopUp`
   *          states it: "a top-up never re-stakes a game, never lowers a stake"; `lockCfb` /
   *          `upsertCfbEntry` keep an already-locked date's "core / funT / stakes / lockedAt".
   * So a raise is MONOTONE, and bounded by the day's own ALLOTMENT it is also idempotent and
   * order-independent — both proved below.
   * ======================================================================================== */
  const RD = "2026-09-05";
  /** the phone's copy: the lock as it stood before the 2pm residue fire, graded but not finished */
  const rPhone = (): SyncEntry => mlbDay({ date: RD, grading: { done: false, tickets: { MIXED_b2: { result: "lost", payout: 0 } }, legs: {} } });
  /** the server's copy: the residue top-up RAISED MIXED_a1 by $20 under its existing id */
  const rServer = (): SyncEntry => mlbDay({ date: RD, core: [{ ...mlbTix("MIXED_a1", "l1", 60), topUp: 20 }, mlbTix("MIXED_b2", "l2", 35)] });

  it("a stake RAISED on a SHARED id survives a stale graded push (defect D)", () => {
    const [m] = mergeLedgers([rPhone()], [rServer()]);
    const a1 = m.core.find((t) => t.id === "MIXED_a1");
    expect(a1?.stake, "the $20 the residue top-up actually deployed was deleted from durable state").toBe(60);
    expect(a1?.topUp, "stake − topUp no longer recovers the allocator's own sizing").toBe(20);
    expect(m.core, "the raise must never fork the ticket into a second copy").toHaveLength(2);
    expect(stakeOf(m.core), "the merged day is not the money the desk deployed").toBe(95);
    expect((m.grading?.tickets as Record<string, { result: string }>).MIXED_b2.result, "the phone's grading was dropped").toBe("lost");
  });

  it("the raise is symmetric and idempotent — merging in either order, or twice, is one result", () => {
    const ab = mergeLedgers([rPhone()], [rServer()]);
    const ba = mergeLedgers([rServer()], [rPhone()]);
    expect(JSON.stringify(ab), "merge(a,b) !== merge(b,a) — the devices would not converge on a raise").toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab)), "merging twice != merging once").toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rServer()]))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rPhone()]))).toBe(JSON.stringify(ab));
  });

  /* REWRITTEN (INSTRUCTION 45, defect C2, 2026-09-06) — a REWRITE, not a loosening: it asserts
     MORE than it did (the conflict marker and the withdrawn verdict as well as the stake), and it
     asserts the OPPOSITE number because the behaviour it pinned is now deliberately different.
     Verbatim as it stood, under the title "a SMALLER stake on the other side never lowers the base
     — the raise is monotone":
         const rich = mlbDay({ grading: { done: true, tickets: {}, legs: {} } }); // MIXED_a1 at $40
         const lower = mlbDay({ core: [mlbTix("MIXED_a1", "l1", 12), mlbTix("MIXED_b2", "l2", 35)] });
         for (const m of [mergeLedgers([rich], [lower]), mergeLedgers([lower], [rich])]) {
           expect(m[0].core.find((t) => t.id === "MIXED_a1")?.stake, "a merge LOWERED a locked stake").toBe(40);
           expect(stakeOf(m[0].core)).toBe(75);
         }
     WHY THE CLAIM IT ENCODED IS GONE. Its justification is the WHY LARGER-WINS IS SAFE list above
     — "No writer on either desk lowers a stake under a fixed id" — and defect N3's own docblock
     WITHDREW that claim on this rail: `buildModeCard` (src/lib/server/lock-card.ts) can re-pick a
     bet an earlier fire already staked and re-mint the SAME content-addressed id at a smaller
     pro-rata stake, and `const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id))`
     lets the new copy REPLACE the carried one. N3 closed that on the append/raise path only, by
     demanding a receipt; the pickBase clone was still free to launder the stale $40 back in, which
     is defect C2. A stake with no receipt on either side is unexplained money in BOTH directions,
     so the smaller one stands and the day says so. A receipted lowering is impossible by
     construction (`withTopUp` only adds), and a receipted RAISE is unaffected — the four pins
     above this one all still land on the larger stake. */
  it("a receiptless DISAGREEMENT lands on the smaller stake, and the day says so", () => {
    const rich = mlbDay({ grading: { done: true, tickets: { MIXED_a1: { result: "won", payout: 76 } }, legs: {} } }); // MIXED_a1 at $40
    const lower = mlbDay({ core: [mlbTix("MIXED_a1", "l1", 12), mlbTix("MIXED_b2", "l2", 35)] });
    for (const m of [mergeLedgers([rich], [lower]), mergeLedgers([lower], [rich])]) {
      expect(m[0].core.find((t) => t.id === "MIXED_a1")?.stake, "a stake no receipt explains survived the merge").toBe(12);
      expect(stakeOf(m[0].core)).toBe(47);
      expect(
        (m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        "the merge chose between two stakes for one ticket and left no record of the other",
      ).toEqual({ MIXED_a1: { kept: 12, refused: 40 } });
      expect(
        (m[0].grading?.tickets as Record<string, unknown>).MIXED_a1,
        "a payout priced against $40 survived beside a $12 stake — the N1 corruption, downward",
      ).toBeUndefined();
      expect(m[0].grading?.done, "the day must reopen so the grader re-prices the ticket").toBe(false);
    }
  });

  it("a raise that would breach the day's own allotment is refused", () => {
    // the full $150 day is the graded copy, so it wins pickBase; the other side claims $90 on a
    // shared id, a $50 raise the day has no room for
    const full = mlbDay({ core: [...B1(), ...B2()], grading: { done: true, tickets: {}, legs: {} } });
    const over = mlbDay({ core: [mlbTix("MIXED_a1", "l1", 90), mlbTix("MIXED_b2", "l2", 35), ...B2()] });
    for (const m of [mergeLedgers([full], [over]), mergeLedgers([over], [full])]) {
      expect(stakeOf(m[0].core), "the merge staked the day past its $150 allotment through a raise").toBe(150);
      expect(m[0].core.find((t) => t.id === "MIXED_a1")?.stake).toBe(40);
    }
  });

  it("with no `daily` a raise is bounded by PAPER.daily — the MLB desk's own allotment (defect E)", () => {
    const a = mlbDay({ daily: undefined, core: [...B1(), ...B2()], grading: { done: true, tickets: {}, legs: {} } }); // $150
    const b = mlbDay({ daily: undefined, core: [mlbTix("MIXED_a1", "l1", 140), mlbTix("MIXED_b2", "l2", 35), ...B2()] });
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(stakeOf(m[0].core), "a `daily`-less merge raised the day past the MLB desk's own allotment").toBeLessThanOrEqual(PAPER.daily);
      expect(stakeOf(m[0].core)).toBe(150);
    }
  });
});

/* ============================================================================================
 * THE RAISE INVALIDATES THE VERDICT IT WAS PRICED UNDER — INSTRUCTION 45, defect N1
 * (2026-09-06), Josh verbatim: "Parlay Lab CFB should've been running the same $150 per day
 * theoretical Core money and $25 Fun money per day".
 *
 * WHAT WENT WRONG. The shared-id RAISE this instruction added rewrites `stake` and nothing else.
 * A verdict already in `grading.tickets` was PRICED UNDER THE OLD STAKE — the graders compute
 * `payout` from the stake (src/lib/cfb/grade.ts `settle`: `const payout = Math.round(stake * dec * 100) / 100;`)
 * — so a raise leaves a stake and a payout that were never the same bet, with `done: true` telling
 * every grader the day is finished and nothing to recompute. `realizedPL`
 * (src/lib/bankroll.ts `ticketPL`: won -> payout - stake) then reads the new stake against the old
 * payout. The reopen rule in `mergeDay` does not catch it: it fires on a MISSING id, and a raised
 * id is PRESENT.
 *
 * MEASURED on the MLB PUT rail (app/api/ledger/route.ts). The phone pulls 2026-09-01 between
 * block fires holding core [p:abc $40, p:def $50], grades it locally (p:abc won, payout 76 =
 * 40 x 1.90; p:def lost) and sets done. The server's residue top-up
 * (src/lib/server/lock-card.ts `withTopUp`) has meanwhile raised p:abc to $60, topUp 20. The
 * phone PUTs; `pickBase` takes the phone (gradeScore 2 > 0); the raise sets stake 60 and leaves
 * payout 76 and done: true. realizedPL scored -34 and computeBankroll 2466 against the honest
 * +4 / 2504 -- a $38 permanent error on ONE ticket, flowing into ticketKelly and every stake
 * sized after it.
 *
 * THE FIX IS TO DELETE THE VERDICT, NOT TO RESCALE THE PAYOUT. Rescaling would need the ticket's
 * settling decimal, and the record does not reliably hold it:
 *   - `dec` is stored on SOME grades only. src/lib/cfb/grade.ts `settle` returns it on `won` and
 *     on the all-legs-pushed `push`, and NEVER on `lost`, `pending` or `ungradable`; the MLB
 *     ticket grade type says so too (src/lib/useLedger.ts `TicketGrade`: `dec?: number`).
 *   - A PUSH payout is not stake x dec at all: `settle` returns `{ result: "push", payout: stake }`
 *     -- the stake handed back. Scaling that by a price would invent money.
 *   - A won ticket's `dec` is the product of the legs THAT STOOD (pushed legs drop out of the
 *     parlay), so it is not recoverable from the ticket's own czOdds/czDec either.
 * Deleting hands the recomputation back to the grader, which reads finals and the NEW stake and
 * writes a payout that matches it. Between the merge and that re-grade the ticket scores 0 --
 * "not yet known", which is what `ticketPL` already returns for an ungraded ticket, and is the
 * honest state: nobody has priced a $60 winner yet.
 *
 * THE LEGS. Leg verdicts are stake-INDEPENDENT, so they are not wrong after a raise, and both
 * overlays refuse to overwrite a SETTLED leg (src/lib/cfb/store.ts `overlayGrading`,
 * src/lib/cfb/lock-server.ts `overlayCfbGrading`). They are dropped anyway for the raised ticket
 * -- but ONLY the ones no surviving ticket still references -- so the invalidated ticket does not
 * leave a half-present grading record behind it, which is the shape that bred this defect.
 * ========================================================================================== */
describe("a raise invalidates the verdict priced under the old stake (INSTRUCTION 45, N1)", () => {
  const pLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -110 });
  const pTix = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id,
    stake,
    name: `MIXED · ${lkey}`,
    type: "MIXED",
    confirmed: null,
    placed: false,
    actualStake: 0,
    legs: [pLeg(lkey)],
    ...over,
  });
  const RD = "2026-09-01";
  /** the phone's pull between block fires: p:abc at $40, graded and DONE */
  const phone = (): SyncEntry =>
    ({
      date: RD,
      locked: true,
      daily: 150,
      fun: 25,
      core: [pTix("p:abc", "l1", 40), pTix("p:def", "l2", 50)],
      funT: [],
      grading: {
        done: true,
        tickets: { "p:abc": { result: "won", payout: 76 }, "p:def": { result: "lost", payout: 0 } },
        legs: { l1: { result: "won", detail: "2 hits" }, l2: { result: "lost", detail: "0 hits" } },
      },
    }) as SyncEntry;
  /** the server after the residue top-up: the SAME id raised to $60, carrying its topUp */
  const server = (): SyncEntry =>
    ({
      date: RD,
      locked: true,
      daily: 150,
      fun: 25,
      core: [pTix("p:abc", "l1", 60, { topUp: 20 }), pTix("p:def", "l2", 50)],
      funT: [],
      grading: null,
    }) as SyncEntry;
  const bank: BankStore = { base: 2500, asOf: "2026-08-15", log: [] };

  it("drops the stale verdict, reopens grading, and stops realizedPL scoring the old payout", () => {
    const [m] = mergeLedgers([phone()], [server()]);
    expect(m.core.find((t) => t.id === "p:abc")?.stake, "the raise itself must still land").toBe(60);
    const g = m.grading?.tickets as Record<string, unknown>;
    expect(g["p:abc"], "a payout priced against a $40 stake survived a raise to $60").toBeUndefined();
    expect(g["p:def"], "an UNRAISED ticket's verdict must not be touched").toEqual({ result: "lost", payout: 0 });
    expect(m.grading?.done, "done:true tells every grader there is nothing left to recompute").toBe(false);
    // p:abc scores 0 until the grader re-runs; p:def is a real -$50. Nothing is invented.
    expect(realizedPL([m], "2026-08-15"), "realizedPL read the new stake against the old payout").toBe(-50);
    expect(computeBankroll(bank, [m]), "the corrupt P/L flowed straight into the bankroll").toBe(2450);
    // the legs of the raised ticket go with it; a leg another ticket still owns does not
    const legs = m.grading?.legs as Record<string, unknown>;
    expect(legs.l1, "the raised ticket's own leg verdict was left behind").toBeUndefined();
    expect(legs.l2, "an unraised ticket's leg verdict was collateral damage").toBeDefined();
  });

  it("and the re-grade the reopen invites lands on the HONEST number", () => {
    const [m] = mergeLedgers([phone()], [server()]);
    // what the grader writes next time it runs: payout = stake x dec = 60 x 1.90
    (m.grading as { tickets: Record<string, unknown>; done: boolean }).tickets["p:abc"] = { result: "won", payout: 114 };
    (m.grading as { done: boolean }).done = true;
    expect(realizedPL([m], "2026-08-15"), "the honest day is +$4, not the -$34 the stale payout scored").toBe(4);
    expect(computeBankroll(bank, [m])).toBe(2504);
  });

  it("the same corruption on the CFB rail — stake 15 -> 25 with a payout priced at 15", () => {
    const cf = (id: string, stake: number, over: Record<string, unknown> = {}) => ({
      id,
      bucket: "core",
      name: "SINGLE · ALA ML",
      stake,
      czOdds: -111,
      confirmed: null,
      legs: [cfbLeg("g1", "ALA")],
      ...over,
    });
    const base = {
      sport: "cfb",
      date: "2026-09-05",
      locked: true,
      daily: 150,
      fun: 25,
      core: [cf("cfb-2026-09-05-core-1", 15)],
      funT: [],
      grading: { done: true, tickets: { "cfb-2026-09-05-core-1": { result: "won", payout: 28.5, dec: 1.9 } }, legs: {} },
    } as unknown as SyncEntry;
    const raised = {
      ...base,
      core: [cf("cfb-2026-09-05-core-1", 25, { topUp: 10 })],
      grading: null,
    } as unknown as SyncEntry;
    const [m] = mergeLedgers([base], [raised]);
    expect(m.core[0].stake).toBe(25);
    expect((m.grading?.tickets as Record<string, unknown>)["cfb-2026-09-05-core-1"]).toBeUndefined();
    expect(realizedPL([m], "2026-09-05"), "a $25 stake scored against a payout priced at $15").toBe(0);
  });
});

/* ============================================================================================
 * THE FUN UNION HAS AN ALLOTMENT TOO — INSTRUCTION 45, defect N2 (2026-09-06).
 *
 * Josh's instruction is BOTH halves: "$150 per day theoretical Core money and $25 Fun money per
 * day". The core union is bounded by the day's `daily`; the funT union above it was bounded by
 * NOTHING. That was harmless only by accident: every CFB copy's fun ticket was the single id
 * `cfb-<date>-fun-1`, so the union could never find a new id to append. `planCfbTopUp`
 * (src/lib/cfb/lock-server.ts) now mints a SECOND distinct id, `cfb-<date>-topup<n>-fun-1`, and
 * the append became reachable.
 *
 * MEASURED. 2026-09-05 locks with funT []. Two pokes overlap: A SETs the blob with
 * funT [cfb-2026-09-05-topup1-fun-1, $25]; B, whose `cur` read predates A's SET, SETs again with
 * funT [cfb-2026-09-05-topup2-fun-1, $25] — last-write-wins on the blob, so A's ticket is gone
 * from the store, but a phone that pulled in between still holds it. The phone syncs and mergeDay
 * appends the id the base lacks: merged funT sum $50 against CFB_PAPER.fun = $25.
 * `assertCfbCardMoney`'s funSum guard runs only on the server WRITE paths, and `validateLedger`
 * checks dates and placed/actualStake shapes only — nothing on the merge rail looks at stakes, so
 * the $50 lands in todayExposure and realizedPL.
 * ========================================================================================== */
describe("the fun union is bounded by the day's own fun allotment (INSTRUCTION 45, N2)", () => {
  const funTix = (id: string, stake: number) => ({
    id,
    bucket: "fun",
    name: "FAVORITES PARLAY",
    stake,
    confirmed: null,
    legs: [cfbLeg("g1", "ALA"), cfbLeg("g2", "UGA")],
  });
  /** the phone still holds poke A's fun ticket, and has graded the day (so it wins pickBase) */
  const phone = (): SyncEntry =>
    cfbDay({
      date: "2026-09-05",
      funT: [funTix("cfb-2026-09-05-topup1-fun-1", 25)],
      grading: { done: true, tickets: {}, legs: {} },
    } as Partial<SyncEntry>);
  /** the store after poke B's last-write-wins SET: a DIFFERENT fun id, same $25 */
  const store = (): SyncEntry =>
    cfbDay({ date: "2026-09-05", funT: [funTix("cfb-2026-09-05-topup2-fun-1", 25)] } as Partial<SyncEntry>);

  it("refuses a second $25 fun ticket on a day whose fun allotment is already spent", () => {
    for (const m of [mergeLedgers([phone()], [store()]), mergeLedgers([store()], [phone()])]) {
      expect(stakeOf(m[0].funT ?? []), "the merge staked the day past its $25 fun allotment").toBeLessThanOrEqual(CFB_PAPER.fun);
      expect(stakeOf(m[0].funT ?? [])).toBe(25);
      expect(m[0].funT).toHaveLength(1);
    }
  });

  it("with no `fun` on either side the bound falls back to the desk's own allotment", () => {
    const a = cfbDay({ date: "2026-09-05", fun: undefined, funT: [funTix("cfb-2026-09-05-topup1-fun-1", 25)], grading: { done: true, tickets: {}, legs: {} } } as Partial<SyncEntry>);
    const b = cfbDay({ date: "2026-09-05", fun: undefined, funT: [funTix("cfb-2026-09-05-topup2-fun-1", 25)] } as Partial<SyncEntry>);
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(stakeOf(m[0].funT ?? [])).toBeLessThanOrEqual(CFB_PAPER.fun);
    }
  });
});

/* ============================================================================================
 * A RAISE NEEDS EVIDENCE THAT THE LARGER STAKE WAS DEPLOYED — INSTRUCTION 45, defect N3
 * (2026-09-06).
 *
 * LARGER-WINS was justified as "no writer on either desk ever LOWERS a stake under a fixed id".
 * That is not true on the MLB rail. `buildModeCard` (src/lib/server/lock-card.ts) runs
 * `shAllocate` over the whole slate pool, and the ids/legs exclusion built from `carriedTix` is
 * applied only to the FORCED pass's `rest` — so a later block fire re-picks a bet an earlier fire
 * already staked. MLB ids are content-addressed, so it re-mints the SAME id at a smaller pro-rata
 * stake, and `const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id))`
 * lets the new copy REPLACE the carried one. The stored day then holds p:abc at $12 where an
 * earlier fire recorded $40.
 *
 * MEASURED: a device that pulled before block 2 still holds $40 and PUTs it. The merge raised the
 * stored $12 back to $40 — merged core sum 90 on a day whose own `allocSum` records 62, and
 * nothing anywhere reconciles the two. Before this round `mergeDay` never touched core, so the
 * stored value was authoritative and this could not happen.
 *
 * THE GATE: raise only on EVIDENCE. The one writer that legitimately raises a shared id is
 * `withTopUp` (`{ ...t, stake: Number(t.stake) + tu[t.id], topUp: tu[t.id] }`), which stamps the
 * delta it added. So a raise is honoured only when the larger side's own `topUp` EXACTLY explains
 * the difference — i.e. the smaller stake is that very ticket's pre-top-up allocator sizing. A
 * stale copy of a differently-sized fire carries no such receipt and is refused.
 *
 * NOT FIXED HERE: the lock-card double-pick itself. That is a pre-existing MLB allocator defect
 * outside this file; it is reported as a carry-forward.
 * ========================================================================================== */
describe("a raise is refused without a topUp receipt that explains it (INSTRUCTION 45, N3)", () => {
  const pLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -110 });
  const pTix = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, legs: [pLeg(lkey)], ...over,
  });
  /** the STORED day after block 2 re-picked p:abc at a smaller pro-rata stake */
  const stored = (): SyncEntry =>
    ({
      date: "2026-09-04",
      locked: true,
      daily: 150,
      allocSum: 62,
      core: [pTix("p:abc", "l1", 12), pTix("p:ghi", "l3", 50)],
      funT: [],
      grading: { done: false, tickets: {}, legs: {} },
    }) as unknown as SyncEntry;
  /** the device's stale pull from before block 2 — $40 on the same id, and no receipt for it */
  const stale = (): SyncEntry =>
    ({
      date: "2026-09-04",
      locked: true,
      daily: 150,
      allocSum: 62,
      core: [pTix("p:abc", "l1", 40), pTix("p:ghi", "l3", 50)],
      funT: [],
      grading: null,
    }) as unknown as SyncEntry;

  it("a stale larger stake with no topUp receipt cannot resurrect money the server re-sized", () => {
    for (const m of [mergeLedgers([stored()], [stale()]), mergeLedgers([stale()], [stored()])]) {
      expect(m[0].core.find((t) => t.id === "p:abc")?.stake, "a stake the server lowered was resurrected by a stale copy").toBe(12);
      expect(stakeOf(m[0].core), "the merged core no longer matches the day's own allocSum").toBe(62);
      expect(stakeOf(m[0].core)).toBe(Number((m[0] as { allocSum?: unknown }).allocSum));
    }
  });

  it("a receipt that does NOT explain the delta is refused too", () => {
    // block 2 re-minted p:abc at $12 and residue-topped it to $60 (topUp 48); the device's $40 is
    // block 1's sizing, so 60 - 40 is not the 48 the receipt records — different fires, not a raise
    const withReceipt = () =>
      ({ ...stale(), core: [pTix("p:abc", "l1", 60, { topUp: 48 }), pTix("p:ghi", "l3", 50)] }) as unknown as SyncEntry;
    const base = () => ({ ...stored(), core: [pTix("p:abc", "l1", 40), pTix("p:ghi", "l3", 50)] }) as unknown as SyncEntry;
    const [m] = mergeLedgers([base()], [withReceipt()]);
    expect(m.core.find((t) => t.id === "p:abc")?.stake, "a topUp that does not explain the delta was accepted as a receipt").toBe(40);
  });
});

/* ============================================================================================
 * THE RECEIPT IS A DIFFERENCE OF TWO RECEIPTS — INSTRUCTION 45, defect K1 (2026-09-06), a
 * REGRESSION of the N3 gate directly above.
 *
 * WHAT WENT WRONG. N3's gate compared the merge's stake delta to the OTHER copy's per-fire
 * `topUp` as if that number were the day's cumulative top-up on the ticket. It is not.
 * `withTopUp` (src/lib/server/lock-card.ts) stamps `topUp` as THAT FIRE's own addition —
 * `{ ...t, stake: Number(t.stake) + tu[t.id], topUp: tu[t.id] }` — and each fire recomputes its
 * residue from scratch, so a ticket re-picked in a later block carries a DIFFERENT `topUp` in
 * each stored copy. The gate therefore held only when the base carried NO topUp on that ticket,
 * which is exactly the single-fire case N3 was tested on.
 *
 * MEASURED twice on `unionCore` directly: base `{ id: "p:abc", stake: 22, topUp: 2 }` against
 * other `{ id: "p:abc", stake: 25, topUp: 5 }` — delta 3, tu 5, `Math.abs(delta - tu) < 1e-6`
 * false, the raise REFUSED, and the merged stake left at 22 against the 25 actually deployed. At
 * fire-1/fire-2 scale: base `{ stake: 40, topUp: 10 }` against other `{ stake: 50, topUp: 20 }`
 * merged to stake 40 / topUp 10 — the day under-stated by $10, and realizedPL scoring -40 on a
 * lost ticket where the truth is -50.
 *
 * THE FIX. The receipt is the DIFFERENCE of the two receipts: `delta === m.topUp - t.topUp`. That
 * says exactly what N3 wanted it to say — the two copies share one allocator sizing
 * (`stake - topUp`) and differ only in how much residue each fire had added by the time it was
 * stored — and it degenerates to N3's own test when the base carries no topUp (prev 0). Both
 * refusals N3 exists for are unchanged and re-asserted below: a stale copy with NO receipt still
 * yields NaN and is refused, and a receipt that does not account for the difference is refused.
 * ========================================================================================== */
describe("a raise's receipt is the DIFFERENCE of the two copies' top-ups (INSTRUCTION 45, K1)", () => {
  const pLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -110 });
  const pTix = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, legs: [pLeg(lkey)], ...over,
  });
  /** a day carrying one shared ticket plus one untouched one; `over` supplies grading/core */
  const kDay = (core: ReturnType<typeof pTix>[], over: Record<string, unknown> = {}): SyncEntry =>
    ({ date: "2026-09-03", locked: true, daily: 150, fun: 25, core, funT: [], ...over }) as unknown as SyncEntry;
  /** the phone's copy, stored after fire 1 — it is the RICHER side, so it wins pickBase */
  const afterFire1 = (stake: number, topUp: number): SyncEntry =>
    kDay([pTix("p:abc", "l1", stake, { topUp }), pTix("p:ghi", "l3", 20)], { grading: { done: false, tickets: {}, legs: {} } });
  /** the server's copy, stored after fire 2 re-topped the SAME id from the same sizing */
  const afterFire2 = (stake: number, topUp: number | undefined): SyncEntry =>
    kDay([pTix("p:abc", "l1", stake, topUp === undefined ? {} : { topUp }), pTix("p:ghi", "l3", 20)], { grading: null });

  it("the critic's exact probe: 22/topUp 2 against 25/topUp 5 raises to 25, not stuck at 22", () => {
    for (const m of [mergeLedgers([afterFire1(22, 2)], [afterFire2(25, 5)]), mergeLedgers([afterFire2(25, 5)], [afterFire1(22, 2)])]) {
      const t = m[0].core.find((x) => x.id === "p:abc");
      expect(t?.stake, "a legitimate SECOND top-up was refused — the gate compared the delta to the wrong number").toBe(25);
      expect(t?.topUp, "the merged ticket must carry the NEWER receipt so a re-merge re-reads it").toBe(5);
      expect(stakeOf(m[0].core)).toBe(45);
    }
  });

  it("at fire-1/fire-2 scale: 40/topUp 10 against 50/topUp 20 lands the $10 the desk deployed", () => {
    const [m] = mergeLedgers([afterFire1(40, 10)], [afterFire2(50, 20)]);
    const t = m.core.find((x) => x.id === "p:abc");
    expect(t?.stake, "the $10 of residue the second fire deployed was deleted from durable state").toBe(50);
    expect(t?.topUp).toBe(20);
    expect(t!.stake as number, "stake − topUp must still recover the one allocator sizing both fires shared").toBe(30 + 20);
    expect(stakeOf(m.core)).toBe(70);
  });

  it("still refuses a stale copy that carries NO receipt at all (N3's first refusal, on a topUp base)", () => {
    for (const m of [mergeLedgers([afterFire1(40, 10)], [afterFire2(50, undefined)]), mergeLedgers([afterFire2(50, undefined)], [afterFire1(40, 10)])]) {
      expect(m[0].core.find((x) => x.id === "p:abc")?.stake, "a raise with no receipt was accepted").toBe(40);
      expect(m[0].core.find((x) => x.id === "p:abc")?.topUp).toBe(10);
    }
  });

  it("still refuses a receipt that does not account for the difference (N3's second refusal)", () => {
    // fire 2 recorded a SMALLER cumulative top-up than the base already holds: 20 - 10 != 5,
    // so these two stakes did not come from one shared allocator sizing — not a raise.
    const [m] = mergeLedgers([afterFire1(40, 10)], [afterFire2(50, 5)]);
    expect(m.core.find((x) => x.id === "p:abc")?.stake, "a receipt that does not explain the delta was accepted").toBe(40);
  });

  it("is still symmetric and idempotent across a second top-up", () => {
    const ab = mergeLedgers([afterFire1(40, 10)], [afterFire2(50, 20)]);
    const ba = mergeLedgers([afterFire2(50, 20)], [afterFire1(40, 10)]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [afterFire2(50, 20)]))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [afterFire1(40, 10)]))).toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A MERGED DAY MAY NOT CARRY TICKETS AND `noPlay` TOGETHER — INSTRUCTION 45, defect N4
 * (2026-09-06), and defect A1, a REGRESSION of N4, same instruction, same day.
 *
 * THE HEADING IS AN ABSOLUTE CLAIM, AND SINCE A1 IT IS TRUE OF BOTH MONEY BUCKETS. When N4 shipped
 * it was true only of the CORE bucket: the clear it added tested `out.core.length` alone, so the
 * fun-only case below violated the very invariant this describe is named for. The fix is not to
 * narrow the heading but to make the code keep it — a merged day may not carry noPlay beside ANY
 * money, core or fun.
 *
 * `applyCfbTopUp` (src/lib/cfb/lock-server.ts) drops the flag when a top-up seats the first money
 * of a day. That rule lives only on the entry the SERVER writes.
 *
 * CITATION CORRECTED (INSTRUCTION 45, defect A5, 2026-09-06): this paragraph quoted that line, "as
 * of this round ... verbatim", as
 * `if (next.noPlay && (core.length || funT.length)) delete next.noPlay;`. Grepped this turn, the
 * function reads `if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete
 * next.noPlay;` — it later adopted the KERNEL's staked-money test, so the quotation named a form
 * the file no longer has. Nothing about this describe's argument changes: both rails end the
 * no-play claim on the presence of money in EITHER bucket, which is the invariant pinned below. On the merge rail: the server records 2026-09-05 as a NO-PLAY (core
 * [], noPlay true); the phone pulls it and grades the empty day (`gradeCfbEntry`'s `every` over an
 * empty ticket list is true), so it carries grading {tickets:{}, legs:{}, done:true}; the server
 * then tops the day up. On the next merge the phone copy wins pickBase on gradeScore 2 > 0, so
 * `out` is the NO-PLAY copy and the union appends the server's tickets into it.
 *
 * MEASURED, core: noPlay true, 2 core tickets, $50 staked. The Builder renders that day as NO-PLAY
 * over $50 of live bets.
 * MEASURED, fun (defect A1): noPlay true, 0 core, 1 fun ticket, $25 staked — the board this round's
 * card fix newly creates, where nothing clears the core gate and only the $25 parlay is seated. See
 * the fun-only case below for why widening the clear in place would have been a no-op and why it
 * had to MOVE below the fun union instead.
 * ========================================================================================== */
describe("noPlay never survives beside real tickets (INSTRUCTION 45, N4)", () => {
  const noPlayDay = (): SyncEntry =>
    cfbDay({
      date: "2026-09-05",
      core: [],
      funT: [],
      noPlay: true,
      grading: { done: true, tickets: {}, legs: {} },
    } as Partial<SyncEntry>);
  const toppedUpDay = (): SyncEntry =>
    cfbDay({
      date: "2026-09-05",
      core: [cfbTix("cfb-2026-09-05-topup1-core-1", "g4", "LSU", 25), cfbTix("cfb-2026-09-05-topup1-core-2", "g5", "TEX", 25)],
      funT: [],
      noPlay: true,
    } as Partial<SyncEntry>);

  it("the flag is dropped once the union seats tickets, in both merge orders", () => {
    for (const m of [mergeLedgers([noPlayDay()], [toppedUpDay()]), mergeLedgers([toppedUpDay()], [noPlayDay()])]) {
      expect(m[0].core, "the top-up's tickets must still land").toHaveLength(2);
      expect(stakeOf(m[0].core)).toBe(50);
      expect(m[0].noPlay, "a day rendered as NO-PLAY over $50 of live bets").toBeUndefined();
    }
  });

  /* ------------------------------------------------------------------------------------------
   * THE FUN-ONLY NO-PLAY DAY (INSTRUCTION 45, defect A1 — a REGRESSION of N4, 2026-09-06).
   *
   * N4 shipped its clear as `if (out.noPlay && out.core.length) delete out.noPlay;`, testing the
   * CORE bucket alone. That was exact only while a no-play day could not hold fun money: the CFB
   * card returned from inside its core section when nothing cleared the +2% gate, so a NO-PLAY
   * card had an empty fun bucket by construction.
   *
   * THIS ROUND'S HEADLINE CHANGE CREATES EXACTLY THAT BOARD. The fun allotment is now gated
   * independently of the core, so a board where nothing clears the core gate still seats the $25
   * fun parlay, and `planCfbTopUp` can return a plan of ONE fun ticket and no core ticket at all.
   * `applyCfbTopUp` was widened for it (src/lib/cfb/lock-server.ts) — the merge rails were not.
   *
   * CITATION CORRECTED (INSTRUCTION 45, defect A5, 2026-09-06): the widening was quoted here as
   * reading, "verbatim today",
   * `if (next.noPlay && (core.length || funT.length)) delete next.noPlay;`. Grepped this turn, the
   * line reads `if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete
   * next.noPlay;` — the row count became a staked-money test in a later round of this same
   * instruction. The widening being cited (BOTH buckets, not the core alone) is still exactly what
   * that line does.
   *
   * MEASURED, both merge orders: base a = the no-play day the server locked and the phone graded
   * (core [], funT [], noPlay true, grading done — grading an EMPTY ticket list is vacuously done,
   * so this copy wins pickBase on gradeScore 2 > 0 and becomes the base); other b = the same date
   * carrying `cfb-2026-09-05-topup1-fun-1 @ $25`. Merged: core 0 · funT 1 · fun $25 · noPlay TRUE.
   * src/components/cfb/CfbBuilder.tsx `lockedLine` returns "NO-PLAY recorded — nothing staked. The
   * day stands in the CFB ledger." off that flag, and src/components/cfb/CfbLedger.tsx `DayCard`
   * puts a "No-play" pill in the day's summary row — which under the FUN scope sits directly above
   * the $25 ticket it denies, since `DayCard` lists `cfbTicketsOf(e, scope)` beneath it. The P/L
   * arithmetic is unaffected — this is a pure reporting lie over live money.
   *
   * WIDENING THE CONDITION IN PLACE WOULD HAVE BEEN A NO-OP HERE, which is why the fix MOVES the
   * clear: it used to run above `mergeDay`'s `unionFun` call and above the `out.funT = fu.funT`
   * assignment it feeds, so `out.funT` was still the base's own empty list at the moment the flag
   * was decided — the fun ticket that makes the day real had not been seated yet.
   * ---------------------------------------------------------------------------------------- */
  const funOnlyDay = (): SyncEntry =>
    cfbDay({
      date: "2026-09-05",
      core: [],
      funT: [
        {
          id: "cfb-2026-09-05-topup1-fun-1",
          bucket: "fun",
          name: "FAVORITES PARLAY",
          stake: 25,
          confirmed: null,
          legs: [cfbLeg("g1", "ALA")],
        },
      ],
      noPlay: true,
    } as Partial<SyncEntry>);

  it("the flag is dropped when the day's only money is the $25 FUN parlay, in both merge orders", () => {
    for (const m of [mergeLedgers([noPlayDay()], [funOnlyDay()]), mergeLedgers([funOnlyDay()], [noPlayDay()])]) {
      expect(m[0].core).toHaveLength(0);
      expect(m[0].funT, "the fun-only top-up's ticket must still land").toHaveLength(1);
      expect(stakeOf(m[0].funT ?? []), "the $25 the desk actually deployed").toBe(25);
      expect(
        "noPlay" in (m[0] as Record<string, unknown>),
        "a No-play pill rendered in the fun tab directly above the $25 ticket it denies",
      ).toBe(false);
    }
  });

  it("a genuinely empty day keeps its noPlay flag", () => {
    const [m] = mergeLedgers([noPlayDay()], [cfbDay({ date: "2026-09-05", core: [], funT: [], noPlay: true } as Partial<SyncEntry>)]);
    expect(m.core).toHaveLength(0);
    expect(m.noPlay).toBe(true);
  });
});

/* ============================================================================================
 * AN OVER-CAP DAY IS NOT LAUNDERED THROUGH THE MERGE IN SILENCE — INSTRUCTION 45, defect K3
 * (2026-09-06).
 *
 * `unionCore`'s ALLOTMENT gate bounds only what the union APPENDS or RAISES. `mergeDay` reaches
 * that gate only after deep-cloning `pickBase`'s winner WHOLESALE, with no allotment check on the
 * clone itself — so a stored blob that is already over the day's cap comes out of the merge
 * intact, and is then the authoritative record.
 *
 * MEASURED: a = 3 core @ $25 ($75), b = 7 core @ $25 ($175, already over CFB_PAPER.daily).
 * `unionCore(a, b)` correctly returns 6 tickets / $150 and `unionCore(b, a)` returns null — but
 * `pickBase` prefers b on the JSON-length tiebreak, so `mergeDay` clones b and returns 7 tickets
 * / $175. $25 over the allotment, with no error, no note and nothing anywhere to reconcile it.
 *
 * WHY THIS IS LOW AND WHY IT IS STILL FIXED. No current writer can mint an over-cap entry:
 * `assertCfbCardMoney` (src/lib/cfb/lock-server.ts) throws on `if (coreSum > CFB_PAPER.daily + MONEY_EPS) {` (read this turn), and
 * `buildLockEntry`'s TWO ALLOCATORS pair refuses a card the allocator did not size. So this is a
 * containment gap, not a live overstake. It is the one place a corrupt stored blob is laundered
 * INTO the ledger rather than caught, and the merge is the last thing to touch the record before
 * it is durable.
 *
 * THE FIX IS TO ASSERT RATHER THAN TRUST, AND NOT TO TRUNCATE. Dropping tickets to fit would
 * delete wagers a device still shows, which is exactly the silence defect K4 (below) is about.
 * The merge is kept whole and a `capBreach` marker naming the sums and the caps is attached, so
 * an over-cap day is VISIBLE instead of silently authoritative. The marker is recomputed on every
 * merge and removed when the breach is gone, so it stays symmetric and idempotent.
 * ========================================================================================== */
describe("an over-cap stored day is kept but MARKED, never laundered silently (INSTRUCTION 45, K3)", () => {
  const over = (n: number, extra: Partial<SyncEntry> = {}): SyncEntry =>
    cfbDay({
      date: "2026-09-12",
      core: Array.from({ length: n }, (_, i) => cfbTix(`cfb-2026-09-12-core-${i + 1}`, `g${i + 1}`, `T${i + 1}`, 25)),
      funT: [],
      ...extra,
    } as Partial<SyncEntry>);

  it("the union itself is still correctly bounded in both directions", () => {
    const a = over(3);
    const b = over(7);
    const ab = unionCore(a, b);
    expect(stakeOf(ab!.core), "the union appended past the day's $150 allotment").toBe(150);
    expect(ab!.core).toHaveLength(6);
    expect(unionCore(b, a), "b already holds every id a has, so there is nothing to union").toBeNull();
  });

  it("the $175 blob survives the merge whole, and the merged day SAYS it is over cap", () => {
    for (const m of [mergeLedgers([over(3)], [over(7)]), mergeLedgers([over(7)], [over(3)])]) {
      expect(m[0].core, "the merge must not silently delete wagers a device still shows").toHaveLength(7);
      expect(stakeOf(m[0].core)).toBe(175);
      const b = (m[0] as { capBreach?: { core?: { sum: number; cap: number } } }).capBreach;
      expect(b?.core, "a day $25 over its allotment came out of the merge with no error and no note").toEqual({ sum: 175, cap: 150 });
    }
  });

  it("a day inside its allotment carries no marker, and the merge stays symmetric + idempotent", () => {
    const ab = mergeLedgers([over(3)], [over(6)]);
    expect(stakeOf(ab[0].core)).toBe(150);
    expect((ab[0] as { capBreach?: unknown }).capBreach, "an in-cap day was marked as a breach").toBeUndefined();
    const ba = mergeLedgers([over(6)], [over(3)]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    const over7 = mergeLedgers([over(3)], [over(7)]);
    expect(JSON.stringify(mergeLedgers(over7, over7)), "the marker is not idempotent").toBe(JSON.stringify(over7));
    expect(JSON.stringify(mergeLedgers(over7, [over(7)]))).toBe(JSON.stringify(over7));
  });
});

/* ============================================================================================
 * THE FUN CAP DROPS A TICKET — SAY SO — INSTRUCTION 45, defect K4 (2026-09-06).
 *
 * The capped funT loop does `if (sum + stake > cap + 1e-6) continue;`. A ticket that would push
 * the bucket past its allotment simply VANISHES: not counted, not flagged, no trace anywhere for
 * anyone reconciling the ledger against a device that still shows the bet.
 *
 * MEASURED (the N2 fixture above, read from the other side): the phone holds
 * `cfb-2026-09-05-topup1-fun-1 @ $25` and the store holds `cfb-2026-09-05-topup2-fun-1 @ $25`;
 * the merged day carries ONE $25 fun ticket, correctly — and says nothing at all about the other,
 * which the phone still renders.
 *
 * WHY LOW: no legitimate writer exceeds the cap today. MLB entries carry no top-level `fun`, so
 * the bound is PAPER.fun = 25 and `buildLockEntry` sizes the whole bucket to exactly that
 * (`hrAmount = ladder ? PAPER.fun - FUN_LADDER.amount : PAPER.fun`); CFB's `planCfbTopUp` breaks
 * out of its fun loop at `funStake + t.stake > CFB_PAPER.fun`. The cap is right and it STAYS —
 * what changes is that the drop is now OBSERVABLE: the dropped ids are returned on `unionFun`'s
 * own channel, recorded on the merged day as `funDropped`, and named in a console.warn with the
 * date. The day a writer does exceed the cap, the loss is legible instead of invisible.
 * ========================================================================================== */
describe("a fun ticket the cap drops is reported, not silently vanished (INSTRUCTION 45, K4)", () => {
  const funTix = (id: string, stake: number) => ({
    id, bucket: "fun", name: "FAVORITES PARLAY", stake, confirmed: null, legs: [cfbLeg("g1", "ALA")],
  });
  const phone = (): SyncEntry =>
    cfbDay({ date: "2026-09-05", funT: [funTix("cfb-2026-09-05-topup1-fun-1", 25)], grading: { done: true, tickets: {}, legs: {} } } as Partial<SyncEntry>);
  const store = (): SyncEntry =>
    cfbDay({ date: "2026-09-05", funT: [funTix("cfb-2026-09-05-topup2-fun-1", 25)] } as Partial<SyncEntry>);

  it("names the dropped id on the merged day, in both merge orders", () => {
    for (const m of [mergeLedgers([phone()], [store()]), mergeLedgers([store()], [phone()])]) {
      expect(stakeOf(m[0].funT ?? []), "the cap must still hold — this is about visibility, not about spending more").toBe(25);
      expect((m[0] as { funDropped?: string[] }).funDropped, "a $25 fun ticket vanished with no trace for anyone reconciling").toEqual([
        "cfb-2026-09-05-topup2-fun-1",
      ]);
    }
  });

  it("no drop, no marker — and a merge that drops one is still symmetric and idempotent", () => {
    const clean = mergeLedgers([phone()], [cfbDay({ date: "2026-09-05", funT: [funTix("cfb-2026-09-05-topup1-fun-1", 25)] } as Partial<SyncEntry>)]);
    expect((clean[0] as { funDropped?: unknown }).funDropped, "a merge that dropped nothing reported a drop").toBeUndefined();
    const ab = mergeLedgers([phone()], [store()]);
    const ba = mergeLedgers([store()], [phone()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [store()]))).toBe(JSON.stringify(ab));
  });

  /* ------------------------------------------------------------------------------------------
   * K5, the enabling half. When K5 was written, `src/lib/cfb/store.ts`'s `upsertCfbEntries` did
   * not union funT at all, so the $25 fun ticket the server seated was dropped on the phone
   * (measured: device funT [] / $0 against sync funT [topup1-fun-1 @ $25] / $25 for the same
   * pair). It now takes the whole merged day instead — read this turn (2026-09-06):
   * `const syncDay = (mergeLedgers([cur], [entry])[0] as CfbLedgerEntry | undefined) ?? cur;`
   * and `const kept: CfbLedgerEntry = { ...syncDay, grading };` — so the fun cap lives in exactly
   * one place, which is what K5 was for. These cases pin the exported contract itself.
   * ---------------------------------------------------------------------------------------- */
  it("`unionFun` is exported with the sync rail's own cap and fallback", () => {
    const seated = unionFun(cfbDay({ date: "2026-09-05", funT: [] } as Partial<SyncEntry>), store());
    expect(seated!.funT.map((t) => t.id), "the device rail must seat the fun ticket the server locked").toEqual([
      "cfb-2026-09-05-topup2-fun-1",
    ]);
    expect(seated!.dropped).toEqual([]);
    // nothing to append at all -> null, so an unchanged day is never needlessly rebuilt
    expect(unionFun(phone(), phone())).toBeNull();
    // the cap is the day's own `fun`; with neither side carrying one it falls back to the desk's
    const noFun = (funT: unknown[], extra: Partial<SyncEntry> = {}) =>
      cfbDay({ date: "2026-09-05", fun: undefined, funT, ...extra } as Partial<SyncEntry>);
    const capped = unionFun(noFun([funTix("cfb-2026-09-05-topup1-fun-1", 25)]), noFun([funTix("cfb-2026-09-05-topup2-fun-1", 25)]));
    expect(stakeOf(capped!.funT)).toBeLessThanOrEqual(CFB_PAPER.fun);
    expect(capped!.dropped).toEqual(["cfb-2026-09-05-topup2-fun-1"]);
  });
});

/* ============================================================================================
 * THE BLOCKS UNION MUST DEEP-COPY, THE WAY THE TICKET UNIONS DO — INSTRUCTION 45, defect A2
 * (2026-09-06).
 *
 * `mergeDay` unioned the per-block accrual map as `out.blocks = { ...(other.blocks ?? {}),
 * ...(out.blocks ?? {}) }`. That is a SHALLOW spread: it copies the map but not the block RECORDS
 * inside it, unlike `unionCore` / `unionFun`, which deep-clone every ticket they append
 * (`JSON.parse(JSON.stringify(t))`). The base's own records are safe — `mergeDay` clones the
 * pickBase winner wholesale — but a block present ONLY on the loser arrived on the merged day as
 * a LIVE REFERENCE into the losing input entry. THE LINE READS, VERBATIM, SINCE THIS FIX (re-read
 * this turn, 2026-09-06): `out.blocks = { ...(JSON.parse(JSON.stringify(other.blocks ?? {})) as
 * NonNullable<SyncEntry["blocks"]>), ...(out.blocks ?? {}) };` — the past tense above is the
 * defect, this is the fix the case below holds in place.
 *
 * WHY THIS IS LOW AND NOT A MONEY BUG. Keys are block ids and the base wins conflicts, so no
 * block can be double-counted: measured, a two-fire day merges to blocks {b1, b2} with allocSum
 * 150 and `decideTopUp` owed 0 in both orders.
 *
 * THE CONSEQUENCE THIS DESCRIBE ONCE NAMED WAS FALSE AND IS WITHDRAWN (INSTRUCTION 45, defect A4,
 * 2026-09-06). It read "the registry write in app/api/generate/route.ts edits a block record in
 * place". GREPPED AGAIN TODAY: no writer in this repo edits a block record in place — that line
 * assigns a FRESH object to the Redis block REGISTRY (`reg[k] = { firedAt: now, tickets:
 * (entry.blocks?.[k]?.tickets ?? 0), budget: blockBudget, at: now }`, reading `entry.blocks` only
 * for a number), and `buildLockEntry` (src/lib/server/lock-card.ts) rebuilds the map as a spread
 * plus a fresh record. What IS true is what the case below asserts and nothing more: aliasing
 * between the merged output and a losing input is a hazard the ticket unions already refuse — they
 * deep-clone every ticket they seat — so a map handing back live references into the loser was the
 * one place the merged day was not independent of its inputs. The sibling `games` union carried the
 * identical shape and is closed the same way this round (defect A3).
 *
 * MEASURED: `a` (graded, so it wins pickBase) carries blocks {b1}; `b` carries {b1, b2}. The
 * merged entry's `blocks.b2` was the SAME OBJECT as `b.blocks.b2` — setting `merged.blocks.b2
 * .tickets = 99` left `b.blocks.b2.tickets === 99`.
 * ========================================================================================== */
describe("the blocks union deep-copies the loser's records (INSTRUCTION 45, A2)", () => {
  const bLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const bTix = (id: string, lkey: string, stake: number) => ({
    id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, legs: [bLeg(lkey)],
  });
  const blkDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
    ({
      date: "2026-09-06",
      locked: true,
      daily: 150,
      fun: 25,
      core: [bTix("MIXED_a1", "l1", 40), bTix("MIXED_b2", "l2", 35)],
      funT: [],
      ...over,
    }) as SyncEntry;
  /** the graded block-1 copy — wins pickBase on gradeScore, so `b`'s b2 record is the appended one */
  const oneBlock = (): SyncEntry =>
    blkDay({ blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 } }, grading: { done: true, tickets: {}, legs: {} } });
  const twoBlocks = (): SyncEntry =>
    blkDay({ blocks: { b1: { budget: 75, tickets: 2, firedAt: 1 }, b2: { budget: 75, tickets: 2, firedAt: 2 } } });

  it("mutating a merged block record does not reach back into the input entry", () => {
    for (const order of [0, 1]) {
      const a = oneBlock();
      const b = twoBlocks();
      const [m] = order === 0 ? mergeLedgers([a], [b]) : mergeLedgers([b], [a]);
      const blocks = m.blocks as Record<string, { tickets: number }>;
      expect(Object.keys(blocks).sort(), "the loser's block fire must still survive the merge").toEqual(["b1", "b2"]);
      blocks.b2.tickets = 99;
      expect(
        (b.blocks as Record<string, { tickets: number }>).b2.tickets,
        "the merged day holds a live reference into the losing input entry's block record",
      ).toBe(2);
      blocks.b1.tickets = 98;
      expect((a.blocks as Record<string, { tickets: number }>).b1.tickets).toBe(2);
      expect((b.blocks as Record<string, { tickets: number }>).b1.tickets).toBe(2);
    }
  });

  it("the union itself is unchanged: both fires survive and the day is not double-counted", () => {
    const ab = mergeLedgers([oneBlock()], [twoBlocks()]);
    const ba = mergeLedgers([twoBlocks()], [oneBlock()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(Object.keys(ab[0].blocks ?? {}).sort()).toEqual(["b1", "b2"]);
  });
});

/* ============================================================================================
 * THE TWO NEW MERGE BEHAVIOURS ARE SPORT-AGNOSTIC — PIN THEM ON MLB TOO — INSTRUCTION 45,
 * defect A4 (2026-09-06).
 *
 * `capBreach` stamping (K3) and `funDropped` reporting (K4) were pinned EXCLUSIVELY on `cfbDay`
 * fixtures. `mergeDay` applies both to MLB days as well, and on an MLB day the bounds come from a
 * DIFFERENT branch of `allotmentCap` / `funCap`: those helpers pick the desk with
 * `sport === "cfb"` and fall back to PAPER.daily / PAPER.fun for everything else. Only the CFB
 * branch was exercised anywhere in this file — `mlbDay` appears solely in the core-union describe
 * above, which predates both behaviours.
 *
 * NOT A LIVE BUG TODAY, verified rather than assumed. `validateLedger` checks only date / locked /
 * core-array / placed / actualStake shapes, so the new keys survive the MLB PUT rail untouched;
 * and `buildLockEntry` mints the MLB fun bucket once per day (`if (funT.length === 0) { … }`) and
 * carries it byte for byte afterwards, so `unionFun` finds no new id on MLB and returns null. The
 * moment any MLB path mints a SECOND distinct fun ticket id — which is exactly what happened on
 * the CFB side this round, when `planCfbTopUp` started minting `cfb-<date>-topup<n>-fun-1` — MLB
 * fun tickets begin being dropped with nothing pinning the report.
 *
 * ON WHAT THESE CASES CAN AND CANNOT PROVE: PAPER.daily and CFB_PAPER.daily are both 150 today,
 * and PAPER.fun and CFB_PAPER.fun are both 25, so no assertion can distinguish the two constants
 * ARITHMETICALLY. These cases therefore pin which constant the bound FOLLOWS by naming it —
 * `allotmentCap`'s own docblock makes the same point ("this is about which constant the bound
 * FOLLOWS, not about today's arithmetic") — over fixtures that carry NO `daily` / `fun` of their
 * own and NO `sport`, so the fallback is the only path to the number.
 * ========================================================================================== */
describe("capBreach and funDropped are pinned on the MLB desk too (INSTRUCTION 45, A4)", () => {
  const aLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const aTix = (id: string, lkey: string, stake: number) => ({
    id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, legs: [aLeg(lkey)],
  });
  /** No `sport`, no `daily`, no `fun` — so both bounds can only come from the PAPER.* fallback. */
  const bareMlbDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ date: "2026-09-12", locked: true, core: [], funT: [], ...over }) as SyncEntry;

  it("an over-cap MLB day is kept whole and stamped capBreach against PAPER.daily, both orders", () => {
    const over = (n: number, extra: Partial<SyncEntry> = {}): SyncEntry =>
      bareMlbDay({
        core: Array.from({ length: n }, (_, i) => aTix(`MIXED_x${i + 1}`, `l${i + 1}`, 25)),
        ...extra,
      });
    for (const m of [mergeLedgers([over(3)], [over(7)]), mergeLedgers([over(7)], [over(3)])]) {
      expect((m[0] as { sport?: unknown }).sport, "the PAPER.* fallback is only reached off a non-CFB day").toBeUndefined();
      expect((m[0] as { daily?: unknown }).daily, "a day carrying its own `daily` would not exercise the fallback").toBeUndefined();
      expect(m[0].core, "the merge must not silently delete wagers a device still shows").toHaveLength(7);
      expect(stakeOf(m[0].core)).toBe(175);
      const b = (m[0] as { capBreach?: { core?: { sum: number; cap: number } } }).capBreach;
      expect(b?.core, "an MLB day over its allotment came out of the merge with no error and no note").toEqual({
        sum: 175,
        cap: PAPER.daily,
      });
    }
    // and an in-cap MLB day carries no marker, so the stamp is not just always-on
    expect((mergeLedgers([over(3)], [over(6)])[0] as { capBreach?: unknown }).capBreach).toBeUndefined();
  });

  it("an MLB fun ticket refused by PAPER.fun is NAMED on funDropped, not vanished, both orders", () => {
    const funTix = (id: string, lkey: string, stake: number) => ({
      id, bucket: "fun", name: `HR parlay · ${lkey}`, stake, confirmed: null, legs: [aLeg(lkey)],
    });
    // the graded copy holds the whole $25 bucket; the other side minted a SECOND distinct fun id
    const phone = (): SyncEntry =>
      bareMlbDay({ date: "2026-09-05", funT: [funTix("HR_z", "h1", 25)], grading: { done: true, tickets: {}, legs: {} } });
    const store = (): SyncEntry => bareMlbDay({ date: "2026-09-05", funT: [funTix("HR_y", "h2", 25)] });
    for (const m of [mergeLedgers([phone()], [store()]), mergeLedgers([store()], [phone()])]) {
      expect((m[0] as { fun?: unknown }).fun, "a day carrying its own `fun` would not exercise the fallback").toBeUndefined();
      expect(stakeOf(m[0].funT ?? []), "the cap must still hold — this is about visibility, not about spending more").toBe(PAPER.fun);
      expect(stakeOf(m[0].funT ?? [])).toBeLessThanOrEqual(PAPER.fun);
      expect(
        (m[0] as { funDropped?: string[] }).funDropped,
        "a $25 MLB fun ticket vanished with no trace for anyone reconciling against the device that shows it",
      ).toEqual(["HR_y"]);
    }
    // the exported union agrees, and reports the same drop off the same fallback
    const capped = unionFun(phone(), store());
    expect(capped!.dropped).toEqual(["HR_y"]);
    expect(stakeOf(capped!.funT)).toBeLessThanOrEqual(PAPER.fun);
    // symmetric + idempotent on the MLB rail as well
    const ab = mergeLedgers([phone()], [store()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(mergeLedgers([store()], [phone()])));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * THE FUN CAP MUST NOT DELETE MONEY THAT IS ALREADY SETTLED — INSTRUCTION 45, defect A1
 * (2026-09-06), a REGRESSION of this same round.
 *
 * `unionFun`'s cap collision decided which of two rival $25 fun tickets survived by `pickBase`
 * plus ticket-id byte order, with NO preference for a ticket that already carries a settled
 * verdict. Last round the CFB DEVICE rail was delegated to this same function
 * (src/lib/cfb/store.ts `upsertCfbEntries`: "THE FUN BUCKET IS THE SYNC RAIL'S OWN ANSWER" — it
 * runs `mergeLedgers` on the two copies and takes `funT` and `funDropped` off the merged day), so
 * the defect ran on BOTH rails.
 *
 * MEASURED, both fixtures dated 2026-09-05 / sport cfb / fun 25. STORED (the device copy) funT
 * [`cfb-2026-09-05-zfun-1` @ $25] graded {done:true, tickets:{zfun-1: won, payout 47.73},
 * legs:{"g1|ml|home|": won}}. INCOMING core [`cfb-2026-09-05-core-1` @ $25], funT
 * [`cfb-2026-09-05-afun-1` @ $25], grading carrying TWO graded tickets (both lost) — richer, so
 * `pickBase` makes the INCOMING the base. Result: funT [afun-1], funDropped [zfun-1], day P/L
 * −50.00, and `grading.tickets` still holding the ORPHANED `zfun-1: won` verdict for a ticket no
 * longer on the day. The settled winner was deleted from the copy the phone shows.
 *
 * REACHABLE IN PRODUCTION on the sync rail through the two overlapping top-up pokes `unionFun`'s
 * own N2 docblock measures, each minting a distinct `cfb-<date>-topup<n>-fun-1`.
 *
 * SECOND SHAPE OF THE SAME MECHANISM: `funCap` read `base.fun` FIRST, so an incoming copy carrying
 * a token positive `fun` (e.g. 1) shrank the merged day's whole fun allotment to $1 and refused a
 * real $25 ticket into an empty bucket.
 * ========================================================================================== */
describe("the fun cap prefers SETTLED money over byte order (INSTRUCTION 45, A1)", () => {
  const FD = "2026-09-05";
  const fLeg = (gkey: string, side: string) => ({
    gkey, lkey: `${gkey}|ml|${side}|`, label: `${side} ML`, prop: "ML", market: "ml", side, line: null, cz: -150,
  });
  const fTix = (id: string, gkey: string, side: string, stake: number, bucket = "fun") => ({
    id,
    bucket,
    name: bucket === "fun" ? "FAVORITES PARLAY" : `SINGLE · ${side} ML`,
    stake,
    czOdds: -150,
    confirmed: null,
    legs: [fLeg(gkey, side)],
  });
  /** the device's stored copy: one $25 fun ticket, already graded WON at $47.73 */
  const stored = (): SyncEntry =>
    ({
      sport: "cfb", date: FD, locked: true, daily: 150, fun: 25, note: "stored",
      core: [],
      funT: [fTix(`cfb-${FD}-zfun-1`, "g1", "home", 25)],
      games: {},
      grading: {
        done: true,
        tickets: { [`cfb-${FD}-zfun-1`]: { result: "won", payout: 47.73 } },
        legs: { "g1|ml|home|": { result: "won" } },
      },
    }) as SyncEntry;
  /** the incoming copy: a DIFFERENT $25 fun ticket plus a core ticket, both graded LOST */
  const incoming = (): SyncEntry =>
    ({
      sport: "cfb", date: FD, locked: true, daily: 150, fun: 25, note: "incoming",
      core: [fTix(`cfb-${FD}-core-1`, "g2", "away", 25, "core")],
      funT: [fTix(`cfb-${FD}-afun-1`, "g3", "home", 25)],
      games: {},
      grading: {
        done: true,
        tickets: {
          [`cfb-${FD}-core-1`]: { result: "lost", payout: 0 },
          [`cfb-${FD}-afun-1`]: { result: "lost", payout: 0 },
        },
        legs: {},
      },
    }) as SyncEntry;

  it("the SETTLED $25 winner survives the collision, in both merge orders", () => {
    for (const m of [mergeLedgers([stored()], [incoming()]), mergeLedgers([incoming()], [stored()])]) {
      expect((m[0] as { note?: string }).note, "the fixture's whole point is that the INCOMING copy wins pickBase").toBe("incoming");
      expect(idsOf(m[0].funT ?? []), "the cap deleted a ticket that already WON and seated a loser on byte order").toEqual([
        `cfb-${FD}-zfun-1`,
      ]);
      expect(stakeOf(m[0].funT ?? []), "the $25 fun allotment still holds — this is about WHICH ticket, not about spending more").toBe(25);
      expect(realizedPL(m, "2026-08-15"), "the day's P/L must include the settled winner").toBe(-2.27);
    }
  });

  it("and the ticket the cap still drops carries its verdict and payout, so no settled money is invisible", () => {
    for (const m of [mergeLedgers([stored()], [incoming()]), mergeLedgers([incoming()], [stored()])]) {
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual([`cfb-${FD}-afun-1`]);
      expect(
        (m[0] as { funDroppedPL?: Record<string, unknown> }).funDroppedPL,
        "a GRADED ticket the cap dropped left the money it represents nowhere on the day",
      ).toEqual({ [`cfb-${FD}-afun-1`]: { result: "lost", payout: 0, stake: 25 } });
      expect(
        (m[0].grading?.tickets ?? {})[`cfb-${FD}-zfun-1`],
        "the surviving winner's own verdict must still be on the day",
      ).toEqual({ result: "won", payout: 47.73 });
    }
  });

  it("the choice is order-free and stable under a re-merge", () => {
    const ab = mergeLedgers([stored()], [incoming()]);
    const ba = mergeLedgers([incoming()], [stored()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [stored()]))).toBe(JSON.stringify(ab));
    /* Re-merging with the INCOMING copy is compared on the MERGE'S OWN OUTPUT rather than on the
       whole JSON string: `mergeDay`'s fill-only grading map merge is, grepped in
       src/lib/ledger-merge.ts this turn, `out.grading.tickets = { ...(other.grading.tickets ?? {}),
       ...(out.grading.tickets ?? {}) };`, so a side whose verdict map is a strict subset re-emits
       the SAME verdicts in a different KEY ORDER. That is a pre-existing property of the grading
       merge (measured this turn: `zfun-1, core-1, afun-1` against `core-1, afun-1, zfun-1`, same
       three verdicts, same values), not of the fun union, and it is reported as a carry-forward
       rather than quietly widened into this round. */
    const re = mergeLedgers(ab, [incoming()]);
    expect(idsOf(re[0].funT ?? []), "a re-merge with the loser's copy re-seated the loser's ticket").toEqual(idsOf(ab[0].funT ?? []));
    expect((re[0] as { funDropped?: string[] }).funDropped).toEqual((ab[0] as { funDropped?: string[] }).funDropped);
    expect((re[0] as { funDroppedPL?: unknown }).funDroppedPL).toEqual((ab[0] as { funDroppedPL?: unknown }).funDroppedPL);
    expect(re[0].grading?.tickets, "the same three verdicts, whatever order they are keyed in").toEqual(ab[0].grading?.tickets);
  });

  it("a token `fun: 1` on the base cannot shrink the allotment and delete a real $25 ticket", () => {
    const thin = (): SyncEntry =>
      ({
        sport: "cfb", date: FD, locked: true, daily: 150, fun: 1, note: "thin",
        core: [fTix(`cfb-${FD}-core-1`, "g2", "away", 25, "core")],
        funT: [],
        games: {},
        grading: { done: true, tickets: { [`cfb-${FD}-core-1`]: { result: "lost", payout: 0 } }, legs: {} },
      }) as SyncEntry;
    const real = (): SyncEntry =>
      ({
        sport: "cfb", date: FD, locked: true, daily: 150, fun: 25,
        core: [],
        funT: [fTix(`cfb-${FD}-zfun-1`, "g1", "home", 25)],
        games: {},
        grading: null,
      }) as SyncEntry;
    for (const m of [mergeLedgers([thin()], [real()]), mergeLedgers([real()], [thin()])]) {
      expect((m[0] as { note?: string }).note, "the graded `fun: 1` copy is the base — that is what makes it the ceiling").toBe("thin");
      expect(idsOf(m[0].funT ?? []), "a `fun: 1` on one copy emptied the day's whole fun bucket").toEqual([`cfb-${FD}-zfun-1`]);
      expect(stakeOf(m[0].funT ?? [])).toBe(25);
      expect((m[0] as { funDropped?: unknown }).funDropped, "nothing was refused, so nothing may be reported as refused").toBeUndefined();
      expect((m[0] as { capBreach?: unknown }).capBreach, "the day sits exactly on the desk's own $25 fun allotment").toBeUndefined();
    }
  });
});

/* ============================================================================================
 * NO-PLAY IS ENDED BY STAKED MONEY, NOT BY A TICKET COUNT — INSTRUCTION 45, defect A2
 * (2026-09-06).
 *
 * The clear tested `out.core.length || (out.funT ?? []).length`, so a ZERO-STAKE ticket in either
 * bucket ended the no-play claim. `noPlay` is a claim about the CARD — "the day locked with
 * nothing staked" — and a $0 entry stakes nothing, so a day carrying only $0 entries is still
 * exactly the day the flag describes. The core half of the condition was inherited from N4; the
 * fun half was added this round.
 * ========================================================================================== */
describe("noPlay is ended by STAKED MONEY, not by a ticket count (INSTRUCTION 45, A2)", () => {
  const zLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const zTix = (id: string, gkey: string, stake: number, bucket: string) => ({
    id, bucket, name: bucket === "fun" ? "FAVORITES PARLAY" : "SINGLE · HOME ML", stake, confirmed: null, legs: [zLeg(gkey)],
  });
  const empty = (): SyncEntry =>
    ({
      sport: "cfb", date: "2026-09-05", locked: true, daily: 150, fun: 25,
      core: [], funT: [], games: {}, noPlay: true,
      grading: { done: true, tickets: {}, legs: {} },
    }) as SyncEntry;
  const withTicket = (bucket: string, stake: number): SyncEntry =>
    ({
      sport: "cfb", date: "2026-09-05", locked: true, daily: 150, fun: 25,
      core: bucket === "core" ? [zTix("cfb-2026-09-05-topup1-core-1", "g4", stake, "core")] : [],
      funT: bucket === "fun" ? [zTix("cfb-2026-09-05-topup1-fun-1", "g5", stake, "fun")] : [],
      games: {}, noPlay: true,
    }) as SyncEntry;

  it("a ZERO-STAKE core ticket does not end a no-play day", () => {
    for (const m of [mergeLedgers([empty()], [withTicket("core", 0)]), mergeLedgers([withTicket("core", 0)], [empty()])]) {
      expect(m[0].core, "the $0 entry must still land — this is about the FLAG, not about dropping tickets").toHaveLength(1);
      expect(stakeOf(m[0].core)).toBe(0);
      expect(m[0].noPlay, "a day that staked nothing stopped calling itself a no-play because a $0 row exists").toBe(true);
    }
  });

  it("a ZERO-STAKE fun ticket does not end a no-play day either", () => {
    for (const m of [mergeLedgers([empty()], [withTicket("fun", 0)]), mergeLedgers([withTicket("fun", 0)], [empty()])]) {
      expect(m[0].funT, "the $0 fun entry must still land").toHaveLength(1);
      expect(stakeOf(m[0].funT ?? [])).toBe(0);
      expect(m[0].noPlay, "a $0 fun row ended the no-play claim on a day with nothing staked").toBe(true);
    }
  });

  it("but real money in EITHER bucket still ends it, and an empty day still keeps it", () => {
    expect(mergeLedgers([empty()], [withTicket("core", 25)])[0].noPlay).toBeUndefined();
    expect(mergeLedgers([empty()], [withTicket("fun", 25)])[0].noPlay).toBeUndefined();
    expect(mergeLedgers([empty()], [empty()])[0].noPlay, "a genuinely empty day is still a no-play").toBe(true);
  });
});

/* ============================================================================================
 * THE GAMES UNION DEEP-COPIES TOO — INSTRUCTION 45, defect A3 (2026-09-06).
 *
 * The `blocks` union was deep-copied last round (defect A2 of that round); the `games` union
 * sitting beside it was left as a shallow spread with the identical shape, so a game record
 * present ONLY on the losing copy arrived on the merged day as a live reference into that input
 * entry. `unionCore` / `unionFun` deep-clone every ticket they seat; this is the same rule on the
 * map the tickets' legs point at.
 * ========================================================================================== */
describe("the games union deep-copies the loser's records (INSTRUCTION 45, A3)", () => {
  const gDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: "2026-09-13", locked: true, daily: 150, fun: 25, core: [], funT: [], ...over }) as SyncEntry;
  const one = (): SyncEntry =>
    gDay({ games: { g1: { pk: 1, start: "2026-09-13T16:00:00Z" } }, grading: { done: true, tickets: {}, legs: {} } });
  const two = (): SyncEntry =>
    gDay({ games: { g1: { pk: 1, start: "2026-09-13T16:00:00Z" }, g2: { pk: 2, start: "2026-09-13T20:00:00Z" } } });

  it("mutating a merged game record does not reach back into the input entry", () => {
    for (const order of [0, 1]) {
      const a = one();
      const b = two();
      const [m] = order === 0 ? mergeLedgers([a], [b]) : mergeLedgers([b], [a]);
      const games = m.games as Record<string, { pk: number }>;
      expect(Object.keys(games).sort(), "the loser's game record must still survive the merge").toEqual(["g1", "g2"]);
      games.g2.pk = 99;
      expect(
        (b.games as Record<string, { pk: number }>).g2.pk,
        "the merged day holds a live reference into the losing input entry's game record",
      ).toBe(2);
      games.g1.pk = 98;
      expect((a.games as Record<string, { pk: number }>).g1.pk).toBe(1);
      expect((b.games as Record<string, { pk: number }>).g1.pk).toBe(1);
    }
  });
});

/* ============================================================================================
 * THE HEADLINE DAY GETS MORE THAN ONE GUARD — INSTRUCTION 45, defect A5 (2026-09-06).
 *
 * Josh's sentence — "$150 per day theoretical Core money and $25 Fun money per day" — lands on
 * ONE board shape: nothing clears the core gate, and the $25 fun parlay is seated anyway. Both
 * mutants that behaviour was pinned against died on a SINGLE assertion inside a single `it()`
 * (the N4 describe's fun-only case), which is one point of failure for the thing that was asked
 * for. These three cases fail for THREE DIFFERENT REASONS:
 *   (1) the CONDITION covers the fun bucket — no union runs at all here, so only the condition
 *       is under test;
 *   (2) the clear's POSITION relative to the fun union is load-bearing — the base's entry carries
 *       NO `funT` key at all, so the only fun money on the day arrives from `other`;
 *   (3) `mergeLedgers` end to end over a multi-day ledger — a clear that fired unconditionally,
 *       or on the wrong day, passes (1) and (2) and dies here.
 * ========================================================================================== */
describe("the fun-only headline day is guarded more than once (INSTRUCTION 45, A5)", () => {
  const hLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const hFun = (id: string, gkey: string, stake = 25) => ({ id, bucket: "fun", name: "FAVORITES PARLAY", stake, confirmed: null, legs: [hLeg(gkey)] });
  const hDay = (over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: "2026-09-05", locked: true, daily: 150, fun: 25, core: [], games: {}, ...over }) as SyncEntry;

  it("(1) the CONDITION covers the fun bucket: a base already holding the $25 parlay clears its OWN flag", () => {
    // both sides hold the SAME fun id, so `unionFun` returns null and no ticket is seated by the
    // merge — the flag can only be cleared by the condition reading `out.funT`.
    const a = hDay({ funT: [hFun("cfb-2026-09-05-fun-1", "g1")], noPlay: true, grading: { done: true, tickets: {}, legs: {} } });
    const b = hDay({ funT: [hFun("cfb-2026-09-05-fun-1", "g1")], noPlay: true });
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) {
      expect(m[0].funT, "the day's own $25 parlay").toHaveLength(1);
      expect(stakeOf(m[0].funT ?? [])).toBe(25);
      expect(m[0].noPlay, "a NO-PLAY pill rendered over the day's own $25 fun parlay").toBeUndefined();
    }
  });

  it("(2) the clear's POSITION is load-bearing: the base carries NO funT key and the money arrives from `other`", () => {
    const bare = hDay({ noPlay: true, grading: { done: true, tickets: {}, legs: {} } }); // no `funT` key at all
    const fun = hDay({ funT: [hFun("cfb-2026-09-05-topup1-fun-1", "g2")], noPlay: true });
    for (const m of [mergeLedgers([bare], [fun]), mergeLedgers([fun], [bare])]) {
      expect(
        idsOf(m[0].funT ?? []),
        "the fun union must run BEFORE the flag is decided — otherwise the day is judged on an absent bucket",
      ).toEqual(["cfb-2026-09-05-topup1-fun-1"]);
      expect(m[0].noPlay).toBeUndefined();
    }
  });

  it("(3) end to end through mergeLedgers: the fun-only day clears, its neighbours are untouched", () => {
    const funOnly = hDay({ date: "2026-09-05", noPlay: true, funT: [], grading: { done: true, tickets: {}, legs: {} } });
    const funOnlyTopped = hDay({ date: "2026-09-05", noPlay: true, funT: [hFun("cfb-2026-09-05-topup1-fun-1", "g2")] });
    const trulyEmpty = (): SyncEntry => hDay({ date: "2026-09-04", noPlay: true, funT: [] });
    const played = (): SyncEntry =>
      hDay({ date: "2026-09-06", funT: [hFun("cfb-2026-09-06-fun-1", "g9")], core: [{ id: "cfb-2026-09-06-core-1", bucket: "core", name: "SINGLE", stake: 25, confirmed: null, legs: [hLeg("g8")] }] });
    const merged = mergeLedgers([trulyEmpty(), funOnly, played()], [funOnlyTopped, trulyEmpty()]);
    expect(merged.map((e) => e.date)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(merged[0].noPlay, "an untouched no-play neighbour lost its flag").toBe(true);
    expect(merged[1].noPlay, "the headline day: nothing cleared the core gate, the $25 parlay was seated anyway").toBeUndefined();
    expect(stakeOf(merged[1].funT ?? [])).toBe(25);
    expect(merged[2].noPlay, "a day that never claimed no-play must not gain one").toBeUndefined();
    expect(stakeOf(merged[2].core) + stakeOf(merged[2].funT ?? [])).toBe(50);
  });
});

/* ============================================================================================
 * THE CAP MUST NEVER EVICT LIVE MONEY — INSTRUCTION 45, defect C1 (2026-09-06), a REGRESSION of
 * A1 above.
 *
 * A1 made `unionFun`'s cap collision prefer a SETTLED ticket, on the argument (its own docblock,
 * quoted from src/lib/ledger-merge.ts this turn) that "a WON ticket's payout is money the
 * settlement CREDITED … no re-grade can rebuild it once the ticket it was priced on is off the
 * day". That argument is TRUE OF A WIN AND OF NOTHING ELSE. A1 shipped it as `settled ? 1 : 0`
 * over `RESOLVED = won | lost | push`, so a ticket settled LOST at payout 0 — a verdict any
 * re-grade rebuilds from the surviving record — now displaces a live, PLACED, ungraded wager, and
 * the evicted wager leaves no verdict to record because it has none yet.
 *
 * MEASURED, both merge orders, on the shapes below (verbatim from this turn's runs against the
 * pre-fix kernel): the phone's `cfb-2026-09-05-fun-1 @ $25`, `placed: true`, `actualStake: 25`,
 * ungraded, against the server's `cfb-2026-09-05-topup1-fun-1 @ $25` graded LOST at payout 0.
 * Merged: funT [topup1-fun-1], funDropped [fun-1], funDroppedPL UNDEFINED, realizedPL −25.00 —
 * against +65.00 for the same day once the phone's own ticket is graded, a $90 swing on ONE
 * ticket that flows into computeBankroll and every Kelly stake sized after it.
 *
 * AND IT SHRINKS THE BUCKET ON THE MLB RAIL. The base's `mlb-hr-1 @ $25` (placed) against a
 * settled `mlb-supp @ $10` won at payout 30: the $10 winner is seated FIRST, the $25 wager then
 * does not fit under PAPER.fun, and the day comes out carrying $10 — $25 of placed money deleted
 * and $15 of the desk's own fun allotment left unstaked.
 *
 * THE RULE, and why it is not a tuning of the old ranking. A merge may drop a record whose story
 * is COMPLETE — its money is fully described by the receipt it leaves behind. It may never drop a
 * wager whose story is UNFINISHED, because no receipt can describe money nobody has determined
 * yet. So the ranking is that one predicate:
 *
 *     2  LIVE MONEY: `placed === true` with no resolved verdict on either side. Real money is at
 *        risk and there is nothing to write down; deleting the ticket deletes the only record
 *        that a verdict could ever be produced for.
 *     1  A SETTLED WIN with payout > 0 — complete, but the payout is the one number on the day a
 *        re-grade cannot rebuild once the ticket is gone (A1's own argument, now narrowed to the
 *        only verdict it is true of).
 *     0  EVERYTHING ELSE: `lost` / `push` (fully reconstructible by re-grading the survivor) and
 *        an unplaced, ungraded ticket (a sizing, not money). Ranked below both, and among
 *        themselves by the order the cap has always consumed — the base's bucket, then the extras
 *        in ticket-id order — so a day with nothing settled and nothing placed seats exactly what
 *        it seated before A1.
 *
 * THAT THREE-BAND LIST IS C1'S OWN, AND IT HAS BEEN SUPERSEDED TWICE SINCE — kept verbatim here
 * because it is the argument these cases were written against. D3 found `placed === true` to be a
 * dead key on the CFB rail; F1 then found that promoting EVERY ungraded ticket above a settled win
 * let a landing verdict EVICT the day's own winner. `funRank` in src/lib/ledger-merge.ts reads
 * FOUR bands today — read this turn: `if (!v) return t.placed === true ? 3 : 1; return v.result
 * === "won" && v.payout > 0 ? 2 : 0;` — i.e. live money 3, settled win 2, unplaced ungraded
 * sizing 1, settled lost/push 0. Every case below still holds under it, and the reasons are
 * unchanged: this file's `mlb-hr-1` fixture carries `placed: true` and so still sits above a
 * settled winner, and C1's SAME-pair cases are ties resolved by the same key (3).
 *
 * AND EVERY EVICTION LEAVES A RECEIPT, not only the settled ones (A1 recorded `droppedPL` only
 * `if (c.v)`). An unsettled drop records `result: "pending"` with its stake, and its `placed` /
 * `actualStake` answers when it has them, so a deleted wager's money is on the day whichever
 * direction the cap cut.
 * ========================================================================================== */
describe("the fun cap never evicts LIVE money (INSTRUCTION 45, C1)", () => {
  const LD = "2026-09-05";
  const cLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const cFun = (id: string, gkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "fun", name: "FAVORITES PARLAY", stake, czOdds: -150, confirmed: null, legs: [cLeg(gkey)], ...over,
  });
  /** the phone: its own $25 fun parlay, PLACED, real money at risk, nobody has graded it yet */
  const livePhone = (): SyncEntry =>
    ({
      sport: "cfb", date: LD, locked: true, daily: 150, fun: 25, note: "phone",
      core: [], funT: [cFun(`cfb-${LD}-fun-1`, "g1", 25, { placed: true, actualStake: 25 })], games: {}, grading: null,
    }) as SyncEntry;
  /** the server: a DIFFERENT $25 fun id, already settled LOST — richer, so it wins pickBase */
  const settledServer = (): SyncEntry =>
    ({
      sport: "cfb", date: LD, locked: true, daily: 150, fun: 25, note: "server",
      core: [], funT: [cFun(`cfb-${LD}-topup1-fun-1`, "g2", 25)], games: {},
      grading: { done: true, tickets: { [`cfb-${LD}-topup1-fun-1`]: { result: "lost", payout: 0 } }, legs: {} },
    }) as SyncEntry;

  it("a LOST verdict never displaces a placed, ungraded wager — both merge orders", () => {
    for (const m of [mergeLedgers([livePhone()], [settledServer()]), mergeLedgers([settledServer()], [livePhone()])]) {
      expect((m[0] as { note?: string }).note, "the SETTLED copy is the base — that is what makes this a displacement").toBe("server");
      expect(idsOf(m[0].funT ?? []), "a lost ticket at payout 0 deleted a live, placed $25 wager").toEqual([`cfb-${LD}-fun-1`]);
      expect(stakeOf(m[0].funT ?? []), "the $25 fun allotment still holds — this is about WHICH ticket").toBe(25);
      expect((m[0].funT ?? [])[0].placed, "the seated wager must still carry its own placement answer").toBe(true);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual([`cfb-${LD}-topup1-fun-1`]);
      expect(
        (m[0] as { funDroppedPL?: Record<string, unknown> }).funDroppedPL,
        "the dropped verdict is fully reconstructible, and it is recorded anyway",
      ).toEqual({ [`cfb-${LD}-topup1-fun-1`]: { result: "lost", payout: 0, stake: 25 } });
      expect(realizedPL(m, "2026-08-15"), "the day scored a loss for a ticket the desk never placed").toBe(0);
    }
  });

  it("and the SAME pair is stable once the live wager's own verdict arrives (+65.00, not −25.00)", () => {
    /* A1's ranking made the day's ticket set a function of GRADING STATE at merge time: this pair
       seated topup1-fun-1 while fun-1 was ungraded and flipped back to fun-1 the moment fun-1's
       verdict landed. Under the rule above the same ticket is seated in both states. */
    const graded = (): SyncEntry =>
      ({ ...livePhone(), grading: { done: true, tickets: { [`cfb-${LD}-fun-1`]: { result: "won", payout: 90 } }, legs: {} } }) as SyncEntry;
    for (const m of [mergeLedgers([graded()], [settledServer()]), mergeLedgers([settledServer()], [graded()])]) {
      expect(idsOf(m[0].funT ?? [])).toEqual([`cfb-${LD}-fun-1`]);
      expect(realizedPL(m, "2026-08-15"), "the settled winner's own P/L").toBe(65);
    }
    // the ungraded state seats the SAME ticket — the card, not the grading clock, decides
    expect(idsOf(mergeLedgers([livePhone()], [settledServer()])[0].funT ?? [])).toEqual(
      idsOf(mergeLedgers([graded()], [settledServer()])[0].funT ?? []),
    );
  });

  it("the A1 fixture still holds: a WON payout does beat a lost rival, at both ends of the byte order", () => {
    /* The narrowing must not undo A1. `zfun-1` (won @ 47.73) sorts AFTER `afun-1` (lost @ 0), so
       byte order alone would seat the loser; the rank-1 win is the only thing that seats it. */
    const won = (id: string): SyncEntry =>
      ({
        sport: "cfb", date: LD, locked: true, daily: 150, fun: 25,
        core: [], funT: [cFun(id, "g1", 25)], games: {},
        grading: { done: true, tickets: { [id]: { result: "won", payout: 47.73 } }, legs: {} },
      }) as SyncEntry;
    const lost = (id: string): SyncEntry =>
      ({
        sport: "cfb", date: LD, locked: true, daily: 150, fun: 25,
        core: [], funT: [cFun(id, "g3", 25)], games: {},
        grading: { done: true, tickets: { [id]: { result: "lost", payout: 0 } }, legs: {} },
      }) as SyncEntry;
    for (const [w, l] of [[`cfb-${LD}-zfun-1`, `cfb-${LD}-afun-1`], [`cfb-${LD}-afun-1`, `cfb-${LD}-zfun-1`]]) {
      for (const m of [mergeLedgers([won(w)], [lost(l)]), mergeLedgers([lost(l)], [won(w)])]) {
        expect(idsOf(m[0].funT ?? []), `the settled winner ${w} lost its seat to ${l}`).toEqual([w]);
      }
    }
  });

  /* ---------------------------------------------------------------------------------------- *
   * THE SAME RULE ON THE MLB DESK (INSTRUCTION 45, defect A4's carry-forward). Every fixture that
   * pinned A1's ranking carried `sport: "cfb"`; the rule is sport-agnostic and it changes MLB
   * behaviour, so it is pinned here off a day carrying NO `sport` and NO `fun` — the PAPER.fun
   * fallback is the only path to the ceiling.
   * ---------------------------------------------------------------------------------------- */
  const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const mFun = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "fun", name: `HR parlay · ${lkey}`, stake, confirmed: null, legs: [mLeg(lkey)], ...over,
  });
  const liveMlb = (): SyncEntry =>
    ({ date: LD, locked: true, note: "phone", core: [], funT: [mFun("mlb-hr-1", "h1", 25, { placed: true, actualStake: 25 })], grading: null }) as SyncEntry;
  const settledMlb = (): SyncEntry =>
    ({
      date: LD, locked: true, note: "server", core: [], funT: [mFun("mlb-supp", "h2", 10)],
      grading: { done: true, tickets: { "mlb-supp": { result: "won", payout: 30 } }, legs: {} },
    }) as SyncEntry;

  it("the MLB rail: a settled $10 winner does not shrink a $25 placed bucket, both orders", () => {
    for (const m of [mergeLedgers([liveMlb()], [settledMlb()]), mergeLedgers([settledMlb()], [liveMlb()])]) {
      expect((m[0] as { fun?: unknown }).fun, "a day carrying its own `fun` would not exercise the PAPER.fun fallback").toBeUndefined();
      expect((m[0] as { sport?: unknown }).sport, "the PAPER.* fallback is only reached off a non-CFB day").toBeUndefined();
      expect(idsOf(m[0].funT ?? []), "$25 of placed money was deleted to seat a settled $10 ticket").toEqual(["mlb-hr-1"]);
      expect(stakeOf(m[0].funT ?? []), "the merged bucket shrank and left the desk's allotment unstaked").toBe(25);
      expect(stakeOf(m[0].funT ?? [])).toBe(PAPER.fun);
      expect(todayExposure(m, LD), "todayExposure follows the bucket the merge seated").toBe(25);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual(["mlb-supp"]);
      expect((m[0] as { funDroppedPL?: Record<string, unknown> }).funDroppedPL).toEqual({
        "mlb-supp": { result: "won", payout: 30, stake: 10 },
      });
    }
  });

  it("an UNSETTLED eviction leaves a receipt too — a wager is never deleted in silence", () => {
    /* A1 recorded `droppedPL` only when the dropped ticket carried a verdict, so exactly the
       eviction with no verdict — the live one — left nothing behind. */
    const held = (id: string, over: Record<string, unknown> = {}): SyncEntry =>
      ({
        sport: "cfb", date: LD, locked: true, daily: 150, fun: 25,
        core: [], funT: [cFun(id, "g1", 25, over)], games: {}, grading: { done: true, tickets: {}, legs: {} },
      }) as SyncEntry;
    const other = (id: string, over: Record<string, unknown> = {}): SyncEntry =>
      ({ sport: "cfb", date: LD, locked: true, daily: 150, fun: 25, core: [], funT: [cFun(id, "g2", 25, over)], games: {} }) as SyncEntry;
    for (const m of [
      mergeLedgers([held(`cfb-${LD}-topup1-fun-1`)], [other(`cfb-${LD}-topup2-fun-1`, { placed: false, actualStake: 0 })]),
      mergeLedgers([other(`cfb-${LD}-topup2-fun-1`, { placed: false, actualStake: 0 })], [held(`cfb-${LD}-topup1-fun-1`)]),
    ]) {
      expect(idsOf(m[0].funT ?? [])).toEqual([`cfb-${LD}-topup1-fun-1`]);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual([`cfb-${LD}-topup2-fun-1`]);
      expect(
        (m[0] as { funDroppedPL?: Record<string, unknown> }).funDroppedPL,
        "an ungraded ticket the cap dropped left no record of the money it represents",
      ).toEqual({ [`cfb-${LD}-topup2-fun-1`]: { result: "pending", payout: 0, stake: 25, placed: false, actualStake: 0 } });
    }
  });

  it("the whole rule is order-free and idempotent on every shape above", () => {
    for (const [a, b] of [
      [livePhone(), settledServer()],
      [liveMlb(), settledMlb()],
    ] as [SyncEntry, SyncEntry][]) {
      const ab = mergeLedgers([a], [b]);
      const ba = mergeLedgers([b], [a]);
      expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
      expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [b]))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [a]))).toBe(JSON.stringify(ab));
    }
  });
});

/* ============================================================================================
 * THE CLONE IS RECONCILED, NOT TRUSTED — INSTRUCTION 45, defect C2 (2026-09-06). This is the root
 * every round of this session has been patching downstream of.
 *
 * `mergeDay` deep-clones `pickBase`'s winner WHOLESALE and treats it as fact; `unionCore` only
 * ever bounded what it APPENDS or RAISES. So every money rule the append path enforces is
 * bypassed entirely whenever the offending copy happens to win pickBase.
 *
 * MEASURED, three shapes, verbatim from this turn's runs against the pre-fix kernel:
 *
 *   (a) TWO COPIES OF ONE ID AT DIFFERENT STAKES, NO RECEIPT. `cfb-2026-09-05-core-1` at $10 and
 *       at $25, both entries 213 bytes, so `pickBase` exhausts gradeScore / clv / confirmed /
 *       length and falls through to the raw JSON byte comparison — which seats "$25" because "2"
 *       sorts after "1". `unionCore` returns null in BOTH directions, correctly refusing the
 *       receiptless raise (N3), and the clone raises the phone's recorded stake anyway. THIS IS
 *       THE PRE-EXISTING RED IN tests/cfb-store.test.ts ("expected 25 to be 10", two cases):
 *       src/lib/cfb/store.ts `upsertCfbEntries` takes its core off `mergeLedgers([cur],[entry])`,
 *       so a re-lock the device rail REFUSES still raises the stored stake through the clone.
 *
 *   (b) OVER CAP BY THE CLONE. Six shared ids at $25 ($150) against the same six at $30 ($180),
 *       no `topUp` anywhere: merged coreSum 180, $30 over CFB_PAPER.daily, on stakes NO writer
 *       ever raised — the K3 marker then reports a breach that the merge itself manufactured.
 *
 *   (c) A WAGER SWALLOWED WITH NO MARKER AT ALL. A phone holding its own PLACED $25 ticket merged
 *       against six different server ids at $25 comes back as the six server ids with the phone's
 *       ticket GONE and nothing anywhere naming it, because `unionCore` has no `dropped` channel
 *       the way `unionFun` does.
 *
 * THE FIX. After the base is chosen, the merged day is RECONCILED against the same money rules
 * the append path already enforces, as a function of the unordered PAIR so the answer does not
 * depend on which copy won pickBase:
 *
 *   · a shared id at two different stakes keeps the SMALLER stake unless the two copies' `topUp`
 *     stamps account for the difference exactly (N3/K1's receipt, unchanged). A raise without a
 *     receipt is unexplained money; the refusal is recorded on the day as `stakeConflict`
 *     { id: { kept, refused } }, beside `capBreach`.
 *   · `unionCore` gains `unionFun`'s receipt channel, surfaced as `coreDropped` / `coreDroppedPL`,
 *     so a core wager the allotment refuses is never swallowed silently.
 * ========================================================================================== */
describe("the pickBase clone is reconciled against the money rules (INSTRUCTION 45, C2)", () => {
  const XD = "2026-09-05";
  const xLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const xTix = (id: string, gkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, czOdds: -110, confirmed: null, legs: [xLeg(gkey)], ...over,
  });
  const xDay = (core: ReturnType<typeof xTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: XD, locked: true, daily: 150, fun: 25, core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;

  it("(a) a receiptless raise cannot ride in on the clone — the SMALLER stake stands, both orders", () => {
    const ID = `cfb-${XD}-core-1`;
    const small = () => xDay([xTix(ID, "g1", 10)]);
    const big = () => xDay([xTix(ID, "g1", 25)]);
    expect(JSON.stringify(small()).length, "the two copies must tie on every pickBase key so the byte comparison decides").toBe(
      JSON.stringify(big()).length,
    );
    /* the union itself, both ways round: the smaller stake and the SAME conflict marker, whichever
       copy is handed to it as the base — the reconciliation is a function of the unordered pair. */
    for (const u of [unionCore(small(), big()), unionCore(big(), small())]) {
      expect(u?.core.map((t) => t.stake), "the union kept a stake no `topUp` receipt explains").toEqual([10]);
      expect(u?.conflict, "the refusal must be recorded, not silent").toEqual({ [ID]: { kept: 10, refused: 25 } });
      expect(u?.dropped, "nothing was refused by the allotment here").toEqual([]);
    }
    for (const m of [mergeLedgers([small()], [big()]), mergeLedgers([big()], [small()])]) {
      expect(m[0].core[0].stake, "a refused re-lock raised the stored stake by JSON byte order").toBe(10);
      expect(stakeOf(m[0].core)).toBe(10);
      expect(
        (m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        "the merge silently picked one of two stakes for one ticket and said nothing",
      ).toEqual({ [ID]: { kept: 10, refused: 25 } });
      expect((m[0] as { capBreach?: unknown }).capBreach).toBeUndefined();
    }
  });

  it("(b) six shared ids at $25 against the same six at $30 merge to $150, not $180", () => {
    const six = (stake: number) => xDay(Array.from({ length: 6 }, (_, i) => xTix(`cfb-${XD}-core-${i + 1}`, `g${i + 1}`, stake)));
    for (const m of [mergeLedgers([six(25)], [six(30)]), mergeLedgers([six(30)], [six(25)])]) {
      expect(stakeOf(m[0].core), "the clone staked the day $30 past CFB_PAPER.daily on stakes nobody raised").toBe(150);
      expect(m[0].core.map((t) => t.stake)).toEqual([25, 25, 25, 25, 25, 25]);
      expect(Object.keys((m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict ?? {})).toHaveLength(6);
      expect((m[0] as { stakeConflict?: Record<string, { kept: number; refused: number }> }).stakeConflict?.[`cfb-${XD}-core-1`]).toEqual({
        kept: 25,
        refused: 30,
      });
      expect((m[0] as { capBreach?: unknown }).capBreach, "the breach the merge itself manufactured").toBeUndefined();
    }
  });

  it("(c) a core wager the allotment refuses is NAMED and carries its money, both orders", () => {
    const phone = () => xDay([xTix(`cfb-${XD}-core-9`, "g9", 25, { placed: true, actualStake: 25 })]);
    const server = () => xDay(Array.from({ length: 6 }, (_, i) => xTix(`cfb-${XD}-core-${i + 1}`, `g${i + 1}`, 25)));
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect(stakeOf(m[0].core), "the $150 allotment still holds — this is about visibility").toBe(150);
      expect(idsOf(m[0].core)).toEqual([1, 2, 3, 4, 5, 6].map((i) => `cfb-${XD}-core-${i}`));
      expect(
        (m[0] as { coreDropped?: string[] }).coreDropped,
        "a PLACED $25 core wager vanished with no trace for anyone reconciling against the device that shows it",
      ).toEqual([`cfb-${XD}-core-9`]);
      expect((m[0] as { coreDroppedPL?: Record<string, unknown> }).coreDroppedPL).toEqual({
        [`cfb-${XD}-core-9`]: { result: "pending", payout: 0, stake: 25, placed: true, actualStake: 25 },
      });
    }
  });

  it("the reconciliation is order-free, idempotent, and leaves no stale marker behind", () => {
    const ID = `cfb-${XD}-core-1`;
    for (const [a, b] of [
      [xDay([xTix(ID, "g1", 10)]), xDay([xTix(ID, "g1", 25)])],
      [xDay([xTix(ID, "g1", 25, { placed: true })]), xDay(Array.from({ length: 6 }, (_, i) => xTix(`cfb-${XD}-core-${i + 1}`, `g${i + 1}`, 25)))],
    ] as [SyncEntry, SyncEntry][]) {
      const ab = mergeLedgers([a], [b]);
      const ba = mergeLedgers([b], [a]);
      expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
      expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [b]))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [a]))).toBe(JSON.stringify(ab));
    }
    // two copies that AGREE carry no marker at all
    const same = () => xDay([xTix(ID, "g1", 25)]);
    const clean = mergeLedgers([same()], [same()])[0] as { stakeConflict?: unknown; coreDropped?: unknown; coreDroppedPL?: unknown };
    expect(clean.stakeConflict).toBeUndefined();
    expect(clean.coreDropped).toBeUndefined();
    expect(clean.coreDroppedPL).toBeUndefined();
  });

  it("the money metadata follows the reconciliation down as well as up (K2 both ways)", () => {
    const six = (stake: number, extra: Partial<SyncEntry> = {}) =>
      xDay(Array.from({ length: 6 }, (_, i) => xTix(`cfb-${XD}-core-${i + 1}`, `g${i + 1}`, stake)), { allocSum: stake * 6, ...extra });
    for (const m of [mergeLedgers([six(25)], [six(30)]), mergeLedgers([six(30)], [six(25)])]) {
      expect((m[0] as { allocSum?: number }).allocSum, "allocSum kept the stale over-cap total the reconciliation removed").toBe(150);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
    }
  });
});

/* ============================================================================================
 * A STORED BLOB MAY NOT RAISE ITS OWN CEILING — INSTRUCTION 45, defect C3 (2026-09-06), a
 * REGRESSION of A1's second half.
 *
 * A1 moved `funCap` from `base.fun ?? other.fun` to `Math.max(desk, ...recorded)` to stop a token
 * `fun: 1` shrinking a real $25 day. That is right about the FLOOR and wrong about the CEILING: it
 * also lets the LARGER of two recorded claims raise the merged day's limit, and `validateLedger`
 * (src/lib/ledger-merge.ts, read this turn) checks dates, `placed` and `actualStake` shapes and
 * NOTHING about `fun` — so a copy carrying an inflated `fun` is simply believed.
 *
 * MEASURED against the pre-fix kernel: a copy claiming `fun: 100` with one $25 fun ticket, merged
 * with a copy claiming the desk's own `fun: 25` and a DIFFERENT $25 fun ticket, seats both — funT
 * sum $50 on a desk that deploys $25 of fun money a day, with no capBreach because the inflated
 * claim also became the thing the breach is measured against.
 *
 * THE CEILING IS THE DESK'S OWN ALLOTMENT (CFB_PAPER.fun / PAPER.fun), which a recorded `fun` may
 * only LOWER and never raise — and only when it is the largest claim on the day, so A1's token
 * `fun: 1` still cannot shrink a bucket the other copy sized at the desk's own number.
 * ========================================================================================== */
describe("a copy's own `fun` cannot raise the merged ceiling (INSTRUCTION 45, C3)", () => {
  const FD3 = "2026-09-05";
  const gLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const gFun = (id: string, gkey: string) => ({ id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, confirmed: null, legs: [gLeg(gkey)] });
  const claim = (fun: number, id: string, over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: FD3, locked: true, daily: 150, fun, core: [], funT: [gFun(id, "g1")], games: {}, grading: null, ...over }) as SyncEntry;

  it("an inflated `fun: 100` does not buy a second $25 fun ticket, both orders", () => {
    const rich = () => claim(100, `cfb-${FD3}-afun-1`, { grading: { done: true, tickets: {}, legs: {} } });
    const honest = () => claim(CFB_PAPER.fun, `cfb-${FD3}-zfun-1`);
    for (const m of [mergeLedgers([rich()], [honest()]), mergeLedgers([honest()], [rich()])]) {
      expect(stakeOf(m[0].funT ?? []), "a stored blob raised its own fun limit and the merge believed it").toBe(CFB_PAPER.fun);
      expect(m[0].funT).toHaveLength(1);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual([`cfb-${FD3}-zfun-1`]);
    }
  });

  it("the MLB desk is bounded by PAPER.fun the same way", () => {
    const bare = (fun: number | undefined, id: string, over: Partial<SyncEntry> = {}): SyncEntry =>
      ({ date: FD3, locked: true, core: [], funT: [{ id, bucket: "fun", stake: 25, confirmed: null, legs: [{ lkey: id, label: "HR over", prop: "batter_hits" }] }], ...(fun === undefined ? {} : { fun }), ...over }) as SyncEntry;
    for (const m of [
      mergeLedgers([bare(100, "HR_a", { grading: { done: true, tickets: {}, legs: {} } })], [bare(undefined, "HR_z")]),
      mergeLedgers([bare(undefined, "HR_z")], [bare(100, "HR_a", { grading: { done: true, tickets: {}, legs: {} } })]),
    ]) {
      expect(stakeOf(m[0].funT ?? [])).toBe(PAPER.fun);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual(["HR_z"]);
    }
  });
});

/* ============================================================================================
 * THE SPORT-AGNOSTIC RULES, PINNED ON THE MLB DESK — INSTRUCTION 45, defect C4 (2026-09-06).
 *
 * Two rules `mergeDay` applies to every entry it merges were pinned ONLY over `sport: "cfb"`
 * fixtures: the fun-cap collision rule (C1 above, now pinned on a bare MLB day in that describe)
 * and the STAKED-MONEY `noPlay` clear (defect A2: `stakeSum(out.core) > 1e-9 ||
 * stakeSum(out.funT ?? []) > 1e-9`, read from src/lib/ledger-merge.ts this turn). Both run before
 * `sport` is ever consulted, so both change MLB behaviour, and neither had an MLB fixture.
 *
 * The days below carry NO `sport`, NO `daily` and NO `fun`, so `allotmentCap` / `funCap` can only
 * reach their bound through the PAPER.* fallback, and the assertions read that bound back.
 * ========================================================================================== */
describe("noPlay and the allotments on the MLB desk (INSTRUCTION 45, C4)", () => {
  const ND = "2026-09-05";
  const nLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const nTix = (id: string, lkey: string, stake: number, bucket: "core" | "fun") => ({
    id, bucket, name: `${bucket} · ${lkey}`, stake, confirmed: null, legs: [nLeg(lkey)],
  });
  /** no sport, no daily, no fun: every bound below can only come from PAPER.* */
  const nDay = (over: Partial<SyncEntry> = {}): SyncEntry => ({ date: ND, locked: true, core: [], funT: [], ...over }) as SyncEntry;

  it("a ZERO-STAKE MLB ticket in either bucket does not end a no-play day, both orders", () => {
    const flagged = () => nDay({ noPlay: true, grading: { done: true, tickets: {}, legs: {} } });
    for (const zero of [nDay({ core: [nTix("MIXED_z", "l1", 0, "core")] }), nDay({ funT: [nTix("HR_z", "h1", 0, "fun")] })]) {
      for (const m of [mergeLedgers([flagged()], [zero]), mergeLedgers([zero], [flagged()])]) {
        expect((m[0] as { daily?: unknown }).daily, "a day carrying its own `daily` would not exercise the fallback").toBeUndefined();
        expect(stakeSumOf(m[0]), "the day stakes nothing, so it is still exactly the day the flag describes").toBe(0);
        expect(m[0].noPlay, "a $0 row ended a no-play claim on the MLB desk").toBe(true);
      }
    }
  });

  it("real MLB money in either bucket ends it, and the PAPER.* allotments are what bound the day", () => {
    const flagged = () => nDay({ noPlay: true, grading: { done: true, tickets: {}, legs: {} } });
    const coreMoney = nDay({ core: Array.from({ length: 7 }, (_, i) => nTix(`MIXED_${i + 1}`, `l${i + 1}`, 25, "core")) });
    const funMoney = nDay({ funT: [nTix("HR_a", "h1", 25, "fun"), nTix("HR_b", "h2", 25, "fun")] });
    for (const m of [mergeLedgers([flagged()], [coreMoney]), mergeLedgers([coreMoney], [flagged()])]) {
      expect(m[0].noPlay, "a no-play pill over real MLB core money").toBeUndefined();
      expect(stakeOf(m[0].core), "the seventh $25 ticket must not fit — PAPER.daily is the only bound on this day").toBe(PAPER.daily);
      expect((m[0] as { coreDropped?: string[] }).coreDropped, "the refused MLB core wager must be named").toEqual(["MIXED_7"]);
    }
    for (const m of [mergeLedgers([flagged()], [funMoney]), mergeLedgers([funMoney], [flagged()])]) {
      expect(m[0].noPlay, "a no-play pill over a real MLB fun parlay").toBeUndefined();
      expect(stakeOf(m[0].funT ?? []), "PAPER.fun is the only bound on this day").toBe(PAPER.fun);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual(["HR_b"]);
    }
  });

  it("a genuinely empty MLB day keeps its flag on both rails of the merge", () => {
    const a = nDay({ noPlay: true, grading: { done: true, tickets: {}, legs: {} } });
    const b = nDay({ noPlay: true });
    for (const m of [mergeLedgers([a], [b]), mergeLedgers([b], [a])]) expect(m[0].noPlay).toBe(true);
  });
});

const stakeSumOf = (e: SyncEntry): number => stakeOf(e.core) + stakeOf(e.funT ?? []);

/* ============================================================================================
 * A STORED COPY MAY NOT RAISE THE $150 CORE CEILING — INSTRUCTION 45, defect D1 (2026-09-06), a
 * REGRESSION of defect C3, which closed exactly this hole on the FUN rail and left the CORE rail
 * open. Josh verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical
 * Core money and $25 Fun money per day".
 *
 * `allotmentCap` read `base.daily ?? other.daily` and BELIEVED it, while `funCap` two functions
 * below already bounds any recorded claim by the DESK'S OWN allotment. A stored blob could
 * therefore write a bigger number into itself and buy the room with it.
 *
 * MEASURED against the pre-fix kernel, both merge orders: a 2026-09-05 CFB copy claiming
 * `daily: 500` and carrying eight $25 core tickets (graded, so it wins pickBase on gradeScore)
 * merged with an honest `daily: 150` copy carrying one more $25 ticket gave 9 tickets, core sum
 * 225, `capBreach` UNDEFINED and `coreDropped` UNDEFINED — and the merged day carried `daily: 500`
 * forward, so every later merge inherited the raised ceiling. The identical `fun: 500` shape is
 * correctly refused today (C3), which is what makes this a regression rather than a gap.
 *
 * NOTHING DOWNSTREAM RE-GUARDS IT. `writeCfbLedger` (src/lib/cfb/store.ts) runs no money guard;
 * the PUT rail's `validateLedger` (src/lib/ledger-merge.ts, read this turn) checks the date shape,
 * `locked`, the `core` array, duplicate dates, the `placed` shape and the `actualStake` shape and
 * nothing about money; and the CFB Ledger card renders nothing at all without `capBreach`.
 *
 * THE CEILING IS THE DESK'S OWN ALLOTMENT, exactly as `funCap` already has it: a recorded `daily`
 * may only LOWER the bound, and only when it is the largest claim on the day, so C3's floor
 * argument (a token claim on one copy cannot shrink a day the other copy sized honestly) is kept
 * intact on this rail too.
 * ========================================================================================== */
describe("a stored copy's own `daily` cannot raise the merged CORE ceiling (INSTRUCTION 45, D1)", () => {
  const DD = "2026-09-05";
  const dLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const dTix = (n: number, stake = 25) => ({
    id: `cfb-${DD}-core-${n}`, bucket: "core", name: "SINGLE · HOME ML", stake, czOdds: -110, confirmed: null, legs: [dLeg(`g${n}`)],
  });
  const claim = (daily: number, ns: number[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: DD, locked: true, daily, fun: 25, core: ns.map((n) => dTix(n)), funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const GRADED = { grading: { done: true, tickets: {}, legs: {} } } as Partial<SyncEntry>;

  it("a `daily: 500` copy carrying eight $25 tickets cannot buy a ninth, in both merge orders", () => {
    const rich = () => claim(500, [1, 2, 3, 4, 5, 6, 7, 8], GRADED);
    const honest = () => claim(CFB_PAPER.daily, [9]);
    for (const m of [mergeLedgers([rich()], [honest()]), mergeLedgers([honest()], [rich()])]) {
      expect(m[0].core, "the merge believed a stored blob's own $500 claim and seated a ninth ticket").toHaveLength(8);
      expect(stakeOf(m[0].core), "$225 of core money on a $150 desk").toBe(200);
      expect(
        (m[0] as { coreDropped?: string[] }).coreDropped,
        "the refused wager must be named — the desk's own allotment is what refused it",
      ).toEqual([`cfb-${DD}-core-9`]);
      expect(
        (m[0] as { capBreach?: unknown }).capBreach,
        "the breach must be measured against the DESK's $150, not against the blob's own claim",
      ).toEqual({ core: { sum: 200, cap: CFB_PAPER.daily } });
    }
  });

  it("and the merged day does not carry the raised ceiling forward into the NEXT merge", () => {
    const merged = mergeLedgers([claim(500, [1, 2, 3, 4, 5, 6, 7, 8], GRADED)], [claim(CFB_PAPER.daily, [9])]);
    const later = mergeLedgers(merged, [claim(CFB_PAPER.daily, [10])]);
    expect(stakeOf(later[0].core), "a tenth $25 ticket rode in on the ceiling the first merge inherited").toBe(200);
    expect((later[0] as { coreDropped?: string[] }).coreDropped).toEqual([`cfb-${DD}-core-10`, `cfb-${DD}-core-9`]);
    expect((later[0] as { capBreach?: { core?: { cap: number } } }).capBreach?.core?.cap).toBe(CFB_PAPER.daily);
  });

  it("a legitimate LOWER `daily` still binds — the fix only removes the upward direction", () => {
    const a = () => claim(50, [1], { ...GRADED });
    const b = () => claim(50, [1, 2, 3]);
    for (const m of [mergeLedgers([a()], [b()]), mergeLedgers([b()], [a()])]) {
      expect(stakeOf(m[0].core), "a day that recorded a $50 allotment was staked past it").toBe(50);
      expect((m[0] as { coreDropped?: string[] }).coreDropped).toEqual([`cfb-${DD}-core-3`]);
    }
  });

  it("the MLB desk is bounded by PAPER.daily the same way", () => {
    const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
    const mTix = (n: number) => ({ id: `MIXED_${n}`, stake: 25, name: `MIXED · l${n}`, type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [mLeg(`l${n}`)] });
    const bare = (daily: number | undefined, ns: number[], over: Partial<SyncEntry> = {}): SyncEntry =>
      ({ date: DD, locked: true, core: ns.map(mTix), funT: [], ...(daily === undefined ? {} : { daily }), ...over }) as SyncEntry;
    const rich = () => bare(500, [1, 2, 3, 4, 5, 6, 7], GRADED);
    const honest = () => bare(undefined, [8]);
    for (const m of [mergeLedgers([rich()], [honest()]), mergeLedgers([honest()], [rich()])]) {
      expect(stakeOf(m[0].core), "an inflated MLB `daily` bought an eighth $25 ticket past PAPER.daily").toBe(175);
      expect((m[0] as { coreDropped?: string[] }).coreDropped).toEqual(["MIXED_8"]);
      expect((m[0] as { capBreach?: { core?: { cap: number } } }).capBreach?.core?.cap).toBe(PAPER.daily);
    }
  });
});

/* ============================================================================================
 * ONE LEG'S SHAPE MAY NOT DISABLE THE WHOLE DAY'S RECONCILIATION — INSTRUCTION 45, defect D2
 * (2026-09-06), a REGRESSION of defect C2 (the reconciliation itself).
 *
 * `unionCore` opened with `if (!agreeOnShared(base.core, other.core)) return null;` — one test,
 * over the ENTIRE core, evaluated BEFORE anything was reconciled. `mergeDay` then kept the
 * untrusted pickBase clone whole, so a single ticket's leg-shape drift silently switched the
 * money reconciliation off for the whole date.
 *
 * AND THE DRIFT IS BUILT IN. `toTicket` in src/lib/server/lock-card.ts writes its legs as, read
 * this turn:
 *
 *     legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null,
 *       prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),
 *
 * — `gkey` is CONDITIONALLY PRESENT, so one copy of a ticket can carry the key and another copy of
 * the same ticket not carry it, with neither copy wrong. `LEG_IDENTITY` includes `gkey`, so the
 * old projection read that as two different bets.
 *
 * MEASURED against the pre-fix kernel, both merge orders. Day A = [core-1 @ $10, core-2 @ $25 with
 * legs [{lkey:"g2|l"}]]; day B = [core-1 @ $25, core-2 @ $25 with legs [{lkey:"g2|l", gkey:"g2"}]].
 * core-2's gkey present-vs-absent made the whole agreement test false, the union returned null and
 * the merge kept B's clone: core-1 @ $25, core sum 50, `stakeConflict` UNDEFINED, `coreDropped`
 * UNDEFINED, no warning — a receiptless $15 raise riding in on JSON byte order, through a ticket
 * that is not even the one in dispute. The CONTROL, the identical pair with core-2's legs matching
 * byte for byte, reconciles to core-1 @ $10 with stakeConflict {"core-1":{kept:10, refused:25}}.
 *
 * THE FIX IS TWO RULES, and both are needed:
 *
 *   1. THE BET IDENTITY IS A POSITIVE DISAGREEMENT, not a byte comparison. Two copies of one leg
 *      disagree on a field only when BOTH record a value and the values differ; a field one side
 *      simply does not carry is not evidence of a different bet. That is exactly the conditional
 *      `gkey` above, and it is why the drift stops being a disagreement at all.
 *   2. THE TEST IS PER-ID, not whole-entry. Every id the two sides agree on is reconciled and the
 *      appends still run; a shared id they genuinely disagree about keeps the BASE's ticket and is
 *      named on `betConflict` with a warning, and the appends are refused for that date because
 *      two copies minting one id from different boards are RIVAL CARDS — mixing their surpluses
 *      would stake the day twice. That refusal is the standing behaviour of the pin "REFUSES the
 *      union when the two sides disagree about a shared id — rival locks are never mixed" above,
 *      which is unchanged; what changes is that the silence around it ends and the ids the two
 *      sides DO agree on are reconciled instead of abandoned.
 * ========================================================================================== */
describe("a leg-shape drift no longer disables the whole reconciliation (INSTRUCTION 45, D2)", () => {
  const ED = "2026-09-05";
  const bare = (lkey: string) => ({ lkey });
  const full = (lkey: string, gkey: string) => ({ lkey, gkey });
  const eTix = (id: string, stake: number, legs: Record<string, unknown>[]) => ({
    id, bucket: "core", name: "MIXED · 1 leg", stake, confirmed: null, legs,
  });
  const eDay = (core: ReturnType<typeof eTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: ED, locked: true, daily: 150, fun: 25, core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const ID1 = `cfb-${ED}-core-1`;
  const ID2 = `cfb-${ED}-core-2`;
  /** day A: the smaller stake on the disputed id, and core-2's leg carrying NO gkey */
  const dayA = (): SyncEntry => eDay([eTix(ID1, 10, [full("g1|l", "g1")]), eTix(ID2, 25, [bare("g2|l")])]);
  /** day B: the larger stake with no receipt anywhere, and core-2's leg carrying the gkey */
  const dayB = (): SyncEntry => eDay([eTix(ID1, 25, [full("g1|l", "g1")]), eTix(ID2, 25, [full("g2|l", "g2")])]);

  it("the receiptless raise is still refused when ANOTHER ticket's legs drift, in both merge orders", () => {
    for (const m of [mergeLedgers([dayA()], [dayB()]), mergeLedgers([dayB()], [dayA()])]) {
      expect(m[0].core.find((t) => t.id === ID1)?.stake, "a $15 raise with no receipt rode in past the reconciliation").toBe(10);
      expect(stakeOf(m[0].core), "the day was staked $50 on a pair that agrees on $35").toBe(35);
      expect(
        (m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        "one ticket's leg shape switched the whole day's money reconciliation off, in silence",
      ).toEqual({ [ID1]: { kept: 10, refused: 25 } });
      expect((m[0] as { betConflict?: unknown }).betConflict, "a conditionally-present `gkey` is not a different bet").toBeUndefined();
    }
  });

  it("the CONTROL — the identical pair with matching leg shapes — gives the same answer", () => {
    const a = () => eDay([eTix(ID1, 10, [full("g1|l", "g1")]), eTix(ID2, 25, [full("g2|l", "g2")])]);
    for (const m of [mergeLedgers([a()], [dayB()]), mergeLedgers([dayB()], [a()])]) {
      expect(m[0].core.find((t) => t.id === ID1)?.stake).toBe(10);
      expect(stakeOf(m[0].core)).toBe(35);
      expect((m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict).toEqual({ [ID1]: { kept: 10, refused: 25 } });
    }
  });

  it("the union itself agrees in BOTH argument orders — the drift is not a disagreement at all", () => {
    for (const u of [unionCore(dayA(), dayB()), unionCore(dayB(), dayA())]) {
      expect(u, "the union abandoned the whole date over one leg's shape").not.toBeNull();
      expect(u?.conflict).toEqual({ [ID1]: { kept: 10, refused: 25 } });
      expect(stakeOf(u?.core ?? []), "the reconciled pair is $35 whichever copy is the base").toBe(35);
    }
  });

  it("a GENUINE disagreement still refuses to mix rival cards, and now SAYS so", () => {
    /* the same id minted from two different boards: both sides record `lkey`, and they differ.
       The base's ticket stands, the rival's surplus is refused, and the silence ends. */
    const device = () => eDay([eTix(ID1, 20, [full("g9|MICH", "g9")])], { grading: { done: false, tickets: {}, legs: {} } });
    const server = () => eDay([eTix(ID1, 25, [full("g1|ALA", "g1")]), eTix(ID2, 25, [full("g2|l", "g2")])]);
    for (const m of [mergeLedgers([device()], [server()]), mergeLedgers([server()], [device()])]) {
      expect(m[0].core, "a rival lock's ticket was appended onto the device's card").toEqual(device().core);
      expect(stakeOf(m[0].core)).toBe(20);
      expect(
        (m[0] as { betConflict?: string[] }).betConflict,
        "the two copies mean different bets by one id and the merged day said nothing about it",
      ).toEqual([ID1]);
    }
  });

  it("the whole D2 rule is order-free and idempotent", () => {
    for (const [a, b] of [
      [dayA(), dayB()],
      [eDay([eTix(ID1, 20, [full("g9|MICH", "g9")])], { grading: { done: false, tickets: {}, legs: {} } }), eDay([eTix(ID1, 25, [full("g1|ALA", "g1")]), eTix(ID2, 25, [full("g2|l", "g2")])])],
    ] as [SyncEntry, SyncEntry][]) {
      const ab = mergeLedgers([a], [b]);
      const ba = mergeLedgers([b], [a]);
      expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
      expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [b]))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [a]))).toBe(JSON.stringify(ab));
    }
  });
});

/* ============================================================================================
 * THE LIVE-MONEY RANK MUST READ A FACT THE DESK ACTUALLY RECORDS — INSTRUCTION 45, defect D3
 * (2026-09-06), a REGRESSION of defect C1.
 *
 * C1 shipped `unionFun`'s seating ranking on the stated principle that "a merge may drop a record
 * whose story is COMPLETE; it may never drop a wager whose story is UNFINISHED", and keyed rank 2
 * — the protected one — on `t.placed === true`. GREPPED WORD-BOUNDARY THIS TURN (2026-09-06):
 * `placed` is never written on the CFB rail at all — across all of src/lib/cfb/ the word appears
 * on FIVE lines, none of them a ticket: two types.ts docblocks restating the merge's own
 * `DroppedPL`, the `CfbMergeDropPL` type that restates it, and two store.ts docblocks about the
 * dropped-ticket receipt and the ledger validator. (The count read "exactly one place" until this
 * turn; the conclusion did not change.) MLB's own `toTicket` (src/lib/server/lock-card.ts) writes
 * `placed: false`; and `buildReading` (src/lib/server/self-reading.ts) records a VIOLATION for any
 * PAPER ticket whose `placed !== false` — "the standing not-placed answer is missing". So rank 2
 * was DEAD CODE for every ticket this desk creates and the headline fix could not fire at all.
 *
 * MEASURED against the pre-fix kernel, the real production shape, both merge orders: the phone's
 * ungraded `cfb-2026-09-05-fun-1 @ $25` (no `placed` key at all) against the server's
 * `cfb-2026-09-05-topup1-fun-1 @ $25` already graded LOST at payout 0. Both ranked 0, the seat was
 * decided by `seq` — i.e. by which copy won pickBase — and the LIVE wager was dropped. That is the
 * original defect C1 exists to close, unchanged.
 *
 * THE FIX: an UNGRADED ticket IS the unfinished story, whatever any writer stamped about
 * placement. D3 answered that by collapsing the protected band to "no side has settled it" — and
 * defect F1 below then had to SPLIT it again, because promoting every ungraded ticket above a
 * settled win let a landing verdict evict the day's own winner. What survives D3 unchanged, and is
 * what these cases pin, is the half that was actually wrong: an ungraded ticket carrying NO
 * `placed` answer must still outrank a settled loser. It does — band 1 over band 0 in `funRank`,
 * read this turn: `if (!v) return t.placed === true ? 3 : 1; return v.result === "won" &&
 * v.payout > 0 ? 2 : 0;`.
 * ========================================================================================== */
describe("an ungraded wager outranks a settled loser with no `placed` key anywhere (INSTRUCTION 45, D3)", () => {
  const GD = "2026-09-05";
  const gLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const gFun = (id: string, gkey: string, over: Record<string, unknown> = {}) => ({
    id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, czOdds: -150, confirmed: null, legs: [gLeg(gkey)], ...over,
  });
  /** the phone's own copy: the day's fun parlay, ungraded, and carrying NO `placed` key — the shape `lockCfbCard` mints */
  const phone = (over: Record<string, unknown> = {}): SyncEntry =>
    ({ sport: "cfb", date: GD, locked: true, daily: 150, fun: 25, note: "phone", core: [], funT: [gFun(`cfb-${GD}-fun-1`, "g1", over)], games: {}, grading: null }) as SyncEntry;
  /** the server's: a DIFFERENT fun id, already settled LOST — richer, so it wins pickBase */
  const server = (): SyncEntry =>
    ({
      sport: "cfb", date: GD, locked: true, daily: 150, fun: 25, note: "server",
      core: [], funT: [gFun(`cfb-${GD}-topup1-fun-1`, "g2")], games: {},
      grading: { done: true, tickets: { [`cfb-${GD}-topup1-fun-1`]: { result: "lost", payout: 0 } }, legs: {} },
    }) as SyncEntry;

  it("a settled LOSS cannot evict the desk's own UNGRADED wager — no `placed` key anywhere, both orders", () => {
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect((m[0] as { note?: string }).note, "the SETTLED copy must be the base — that is what makes this a displacement").toBe("server");
      expect(
        Object.prototype.hasOwnProperty.call(phone().funT![0], "placed"),
        "the fixture must carry NO placed key — that is the whole shape of the defect",
      ).toBe(false);
      expect(idsOf(m[0].funT ?? []), "a settled loser at payout 0 deleted the day's own live $25 parlay").toEqual([`cfb-${GD}-fun-1`]);
      expect(stakeOf(m[0].funT ?? [])).toBe(CFB_PAPER.fun);
      expect((m[0] as { funDropped?: string[] }).funDropped).toEqual([`cfb-${GD}-topup1-fun-1`]);
      expect((m[0] as { funDroppedPL?: Record<string, unknown> }).funDroppedPL).toEqual({
        [`cfb-${GD}-topup1-fun-1`]: { result: "lost", payout: 0, stake: 25 },
      });
    }
  });

  it("and the MLB-minted shape — `placed: false`, the standing not-placed answer — is protected too", () => {
    /* `toTicket` (src/lib/server/lock-card.ts) writes `placed: false` on every paper ticket, and
       `buildReading` (src/lib/server/self-reading.ts) flags `placed !== false` as a violation — so
       `placed === true` never occurs on a ticket either desk mints. */
    for (const m of [
      mergeLedgers([phone({ placed: false, actualStake: 0 })], [server()]),
      mergeLedgers([server()], [phone({ placed: false, actualStake: 0 })]),
    ]) {
      expect(idsOf(m[0].funT ?? []), "the desk's own not-placed answer read as 'droppable'").toEqual([`cfb-${GD}-fun-1`]);
      expect((m[0].funT ?? [])[0].placed).toBe(false);
    }
  });

  it("the rule is order-free and idempotent on the production shape", () => {
    const ab = mergeLedgers([phone()], [server()]);
    const ba = mergeLedgers([server()], [phone()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [server()]))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [phone()]))).toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A REFUSED STAKE MAY NOT MANUFACTURE FRESH `owed` — INSTRUCTION 45, defect D4 (2026-09-06), a
 * REGRESSION of defect C2 (the reconciliation) crossed with defect K2 (the money metadata carry).
 *
 * C2 made a receiptless raise deterministically LOWER a disputed stake. K2 then moves the day's
 * money metadata by the union's stake delta — INCLUDING downward — so a refusal shrank `allocSum`,
 * and `decideTopUp` (src/lib/server/blocks.ts, read this turn: `const owed = daily -
 * Number(entry.allocSum ?? 0);`) then reads the day as SHORT and buys more.
 *
 * MEASURED against the pre-fix kernel, both merge orders. The phone holds `p:abc @ $10` with
 * `allocSum: 10` from block 1; the server holds `p:abc @ $25` with `allocSum: 25` after block 2
 * re-picked the same id with no residue, so `withTopUp` (src/lib/server/lock-card.ts:
 * `t.id && tu[t.id] > 0 ? { ...t, stake: Number(t.stake) + tu[t.id], topUp: tu[t.id] } : t`)
 * stamped no receipt. Merged: p:abc @ $10, allocSum 10, stakeConflict {"p:abc":{kept:10,
 * refused:25}}, stable under a third merge — and `decideTopUp` then reads owed = 150 − 10 = 140 on
 * a date where $25 is already at risk, and fires a further generate run to deploy it.
 *
 * D4's ANSWER WAS A FLOOR, AND THE FLOOR WAS THE NEXT DEFECT (see F3 below, 2026-09-06). Holding
 * `allocSum` above the seated core makes the day UNDER-report what it owes and never reach Josh's
 * $150. THE PINS BELOW ARE REWRITTEN, NOT LOOSENED: they still assert an exact number in both
 * merge orders, and the number they assert is now the seated core sum instead of the stale
 * pre-merge total. What is DELETED is D4's doctrine that `owed` may never grow — which was the
 * defect, not a guarantee. VERBATIM, BEFORE and AFTER:
 *
 *   before  expect((m[0] as { allocSum?: number }).allocSum, "a disputed stake un-deployed $15 the
 *             desk had already put at risk").toBe(25);
 *           expect(owedOf(m[0]), "the merge manufactured $15 of fresh `owed` and would buy a
 *             further block with it").toBeLessThanOrEqual(before);
 *   after   expect((m[0] as { allocSum?: number }).allocSum, …).toBe(10);
 *           expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
 *           expect(owedOf(m[0]), …).toBe(140);
 *
 *   before  expect((m[0] as { allocSum?: number }).allocSum).toBe(47);
 *           expect(owedOf(m[0])).toBeLessThanOrEqual(before);
 *   after   expect((m[0] as { allocSum?: number }).allocSum).toBe(25);
 *           expect(owedOf(m[0])).toBe(125);
 *
 * The rewrite is STRICTLY STRONGER on the money: `toBeLessThanOrEqual(before)` admitted every
 * value from −∞ to 125, and `toBe(140)` admits one. D4's OTHER two pins — K2's over-cap case and
 * the receipted raise — are byte-unchanged and still green, because Σ of the seated core answers
 * both of them with the same numbers the delta carry did.
 * ========================================================================================== */
describe("a refused stake is reconciled on the TICKET, and `allocSum` follows the ticket (D4/F3)", () => {
  const PD = "2026-09-01";
  const pLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const pTix = (stake: number, over: Record<string, unknown> = {}) => ({
    id: "p:abc", stake, name: "MIXED · l1", type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [pLeg("l1")], ...over,
  });
  const pDay = (stake: number, allocSum: number, over: Record<string, unknown> = {}): SyncEntry =>
    ({ date: PD, locked: true, paper: true, daily: 150, fun: 25, allocSum, core: [pTix(stake, over)], funT: [] }) as SyncEntry;
  const owedOf = (e: SyncEntry): number =>
    decideTopUp({
      entry: e as unknown as Record<string, unknown>,
      blocks: [],
      registry: {},
      starts: [Date.UTC(2026, 8, 1, 23, 0)],
      now: Date.UTC(2026, 8, 1, 20, 0),
      daily: PAPER.daily,
      max: 2,
    }).owed;

  it("a receiptless re-size leaves the day owing exactly what its own tickets are short, both orders", () => {
    const phone = () => pDay(10, 10);
    const server = () => pDay(25, 25);
    const before = Math.min(owedOf(phone()), owedOf(server()));
    expect(before, "the server copy already had $25 deployed — 150 − 25").toBe(125);
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect(m[0].core[0].stake, "the receipt rule still decides the STAKE — that half is unchanged").toBe(10);
      expect((m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict).toEqual({ "p:abc": { kept: 10, refused: 25 } });
      expect(
        (m[0] as { allocSum?: number }).allocSum,
        "`allocSum` stood above the card it describes — the day would under-report what it owes",
      ).toBe(10);
      expect((m[0] as { allocSum?: number }).allocSum, "the ledger must restate the seated core, not a stale total").toBe(stakeOf(m[0].core));
      expect(owedOf(m[0]), "a day holding $10 of its $150 owes $140 — `before` was the stale copy's own answer").toBe(140);
    }
  });

  it("the same over a receipt that does not account for the difference (sizing 20 -> 22)", () => {
    const phone = () => pDay(25, 25, { topUp: 5 });
    const server = () => pDay(47, 47, { topUp: 25 });
    const before = Math.min(owedOf(phone()), owedOf(server()));
    expect(before, "the server copy had $47 deployed").toBe(103);
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect(m[0].core[0].stake, "22 != 20, so the receipt does not explain the difference and the raise is refused").toBe(25);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(25);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
      expect(owedOf(m[0]), "a day holding $25 of its $150 owes $125").toBe(125);
    }
  });

  it("K2's own case is untouched: a reconciliation that removes an OVER-CAP total still moves allocSum down", () => {
    const gLeg = (n: number) => ({ gkey: `g${n}`, lkey: `g${n}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
    const six = (stake: number): SyncEntry =>
      ({
        sport: "cfb", date: PD, locked: true, daily: 150, fun: 25, allocSum: stake * 6,
        core: Array.from({ length: 6 }, (_, i) => ({ id: `cfb-${PD}-core-${i + 1}`, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [gLeg(i + 1)] })),
        funT: [], games: {}, grading: null,
      }) as SyncEntry;
    for (const m of [mergeLedgers([six(25)], [six(30)]), mergeLedgers([six(30)], [six(25)])]) {
      expect((m[0] as { allocSum?: number }).allocSum, "an over-cap $180 total survived the reconciliation that removed it").toBe(150);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
    }
  });

  it("a raise WITH a receipt still moves allocSum up — the seated stake is $50 and so is the ledger", () => {
    const phone = () => pDay(40, 40, { topUp: 10 });
    const server = () => pDay(50, 50, { topUp: 20 });
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect(m[0].core[0].stake, "50 − 40 === 20 − 10, so the receipt explains the raise").toBe(50);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(50);
      expect((m[0] as { stakeConflict?: unknown }).stakeConflict).toBeUndefined();
    }
  });
});

/* ============================================================================================
 * THE RECONCILIATION IS PINNED ON THE MLB DESK AND ON ORDER FREEDOM — INSTRUCTION 45, defect D6
 * (2026-09-06).
 *
 * The pickBase-clone reconciliation (defect C2) is sport-agnostic — it runs before `sport` is ever
 * consulted — but every pin C2 left behind is a `sport: "cfb"` fixture, and the one case that
 * exercises MLB money metadata through it is itself CFB-shaped. And the order-freedom claim the
 * reconciliation rests on ("which ticket wins a scarce allotment is a pure function of the two
 * inputs and not of the order the loser happened to store its tickets in") was defended only from
 * outside this file, so making the reconciliation order-dependent left every pin here green.
 *
 * The days below carry NO `sport`, NO `daily` and NO `fun`, so the bound can only be reached
 * through the PAPER.* fallback, and the assertions read it back.
 * ========================================================================================== */
describe("the clone reconciliation on the MLB desk, and its order freedom (INSTRUCTION 45, D6)", () => {
  const RD = "2026-09-04";
  const rLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const rTix = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [rLeg(lkey)], ...over,
  });
  const rDay = (core: ReturnType<typeof rTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ date: RD, locked: true, core, funT: [], ...over }) as SyncEntry;

  it("(a) a receiptless MLB raise cannot ride in on the clone — the SMALLER stake stands, both orders", () => {
    const small = () => rDay([rTix("MIXED_a1", "l1", 40)]);
    const big = () => rDay([rTix("MIXED_a1", "l1", 50)]);
    for (const m of [mergeLedgers([small()], [big()]), mergeLedgers([big()], [small()])]) {
      expect((m[0] as { daily?: unknown }).daily, "a day carrying its own `daily` would not exercise the PAPER fallback").toBeUndefined();
      expect(m[0].core[0].stake, "an MLB raise no `topUp` receipt explains rode in on the pickBase clone").toBe(40);
      expect((m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict).toEqual({ MIXED_a1: { kept: 40, refused: 50 } });
    }
  });

  it("(b) an MLB core wager PAPER.daily refuses is NAMED and carries its money, both orders", () => {
    const phone = () => rDay([rTix("MIXED_z9", "l9", 25, { placed: true, actualStake: 25 })]);
    const server = () => rDay(Array.from({ length: 6 }, (_, i) => rTix(`MIXED_${i + 1}`, `l${i + 1}`, 25)));
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect(stakeOf(m[0].core), "PAPER.daily is the only bound on this day").toBe(PAPER.daily);
      expect((m[0] as { coreDropped?: string[] }).coreDropped, "a placed MLB wager vanished with no trace").toEqual(["MIXED_z9"]);
      expect((m[0] as { coreDroppedPL?: Record<string, unknown> }).coreDroppedPL).toEqual({
        MIXED_z9: { result: "pending", payout: 0, stake: 25, placed: true, actualStake: 25 },
      });
    }
  });

  it("(c) the reconciliation ignores the order the LOSING copy stored its tickets in", () => {
    /* Seven $25 ids against a $150 ceiling: exactly one append must be refused, and WHICH one is a
       fact about the two inputs — never about the array order the loser happened to serialise. */
    const base = () => rDay([rTix("MIXED_1", "l1", 25)], { grading: { done: true, tickets: {}, legs: {} } });
    const ids = [2, 3, 4, 5, 6, 7];
    const tix = () => ids.map((i) => rTix(`MIXED_${i}`, `l${i}`, 25));
    const forward = mergeLedgers([base()], [rDay(tix())]);
    const reversed = mergeLedgers([base()], [rDay(tix().reverse())]);
    const shuffled = mergeLedgers([base()], [rDay([tix()[3], tix()[0], tix()[5], tix()[1], tix()[4], tix()[2]])]);
    expect(stakeOf(forward[0].core), "seven $25 ids against a $150 ceiling seat exactly six").toBe(PAPER.daily);
    expect(JSON.stringify(reversed), "the loser's storage order changed which ticket the allotment refused").toBe(JSON.stringify(forward));
    expect(JSON.stringify(shuffled), "the loser's storage order changed which ticket the allotment refused").toBe(JSON.stringify(forward));
    expect((forward[0] as { coreDropped?: string[] }).coreDropped, "the refusal must fall on the last id in TICKET-ID order").toEqual(["MIXED_7"]);
  });

  it("(d) `unionCore` answers with the same reconciled money in BOTH argument orders", () => {
    const a = () => rDay([rTix("MIXED_a1", "l1", 40), rTix("MIXED_b2", "l2", 35), rTix("MIXED_c3", "l3", 25)]);
    const b = () => rDay([rTix("MIXED_a1", "l1", 50), rTix("MIXED_b2", "l2", 35), rTix("MIXED_d4", "l4", 25)]);
    const ab = unionCore(a(), b());
    const ba = unionCore(b(), a());
    const money = (u: typeof ab) => Object.fromEntries((u?.core ?? []).map((t) => [String(t.id), Number(t.stake)]));
    expect(money(ab), "the reconciled stakes are a function of the unordered pair").toEqual(money(ba));
    expect(ab?.conflict).toEqual({ MIXED_a1: { kept: 40, refused: 50 } });
    expect(ba?.conflict).toEqual({ MIXED_a1: { kept: 40, refused: 50 } });
  });
});

/* ============================================================================================
 * GRADING A TICKET A WINNER IS WHAT EVICTS IT — INSTRUCTION 45, defect F1 (2026-09-06), a
 * REGRESSION of defect D3. (This round's critic list numbers it A1; the letters A–E are already
 * spent in this file, so the round's four defects are pinned here as F1–F4.)
 *
 * D3 was right that `placed === true` was a dead key on the CFB rail and the wrong question on
 * MLB, and it replaced the whole rank-2 predicate with "no side has settled it". `funRank` then
 * read, verbatim from src/lib/ledger-merge.ts before this round:
 *
 *     function funRank(t: SyncTicket, v: Verdict | null): number {
 *       void t;
 *       if (!v) return 2;
 *       return v.result === "won" && v.payout > 0 ? 1 : 0;
 *     }
 *
 * So "nobody has settled it" (2) outranks a SETTLED WIN (1), and the seat is NOT MONOTONE across a
 * grading sequence: the day's own winner is DEMOTED the moment its verdict lands, and an ungraded
 * rival takes the seat.
 *
 * MEASURED through this kernel, both merge orders, on the two ids `planCfbTopUp` actually mints
 * (src/lib/cfb/lock-server.ts, grepped this turn: `fun.push({ ...t, id: `cfb-${entry.date}-topup${
 * opts.n}-fun-1` });`): the phone holds `cfb-2026-09-05-topup1-fun-1 @ $25` ungraded, the server
 * holds `cfb-2026-09-05-topup2-fun-1 @ $25` ungraded, both rank 2, the tiebreak seats topup2.
 * topup2 then grades WON at payout 150. The server copy — still holding the ungraded topup1 —
 * syncs again, and the $150 winner is EVICTED: seated `topup1-fun-1`, funDropped
 * `[topup2-fun-1]`, funDroppedPL `{"result":"won","payout":150,"stake":25}`. `grading.done` is
 * forced false by the reopen loop, so the card renders as pending with no P/L and `realizedPL`
 * drops the win. If topup1 is never graded (a void, an unmatched final) the eviction is PERMANENT.
 *
 * THE FIX IS AN EXPLICIT MONOTONE BAND, so a verdict landing can PROMOTE a ticket but never
 * demote the day's own winner:
 *
 *     3  LIVE MONEY   — `placed === true` and nobody has settled it. Real money is at risk and
 *                       there is nothing yet to write down.
 *     2  A SETTLED WIN with payout > 0 — the payout is the one number a re-grade cannot rebuild
 *                       once the ticket it was priced on is off the day.
 *     1  AN UNPLACED UNGRADED SIZING — the shape both desks actually mint. Still above a settled
 *                       loser, which is what D3 was right about.
 *     0  A SETTLED `lost` / `push` — fully reconstructible by re-grading the survivor.
 *
 * Every ticket either desk mints sits at 1 while ungraded (CFB stamps no `placed` key at all; MLB
 * `toTicket` stamps `placed: false`), so for every real ticket a WIN moves 1 -> 2 and holds the
 * seat. The pins below are therefore SEQUENCES, not pairs: a pair-only pin is what let this
 * through.
 * ========================================================================================== */
describe("a verdict landing never evicts the ticket it settles (INSTRUCTION 45, F1)", () => {
  const SD = "2026-09-05";
  const sLeg = (gkey: string) => ({ gkey, lkey: `${gkey}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const sFun = (id: string, gkey: string, over: Record<string, unknown> = {}) => ({
    id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, czOdds: -150, confirmed: null, legs: [sLeg(gkey)], ...over,
  });
  /** the two ids `planCfbTopUp` mints for one date — the production shape, no `placed` key */
  const cfbSide = (note: string, id: string, gkey: string): SyncEntry =>
    ({ sport: "cfb", date: SD, locked: true, daily: 150, fun: 25, note, core: [], funT: [sFun(id, gkey)], games: {}, grading: null }) as SyncEntry;
  const TOP1 = `cfb-${SD}-topup1-fun-1`;
  const TOP2 = `cfb-${SD}-topup2-fun-1`;

  /** the MLB shape: no `sport`, no `fun` (PAPER.fun is the only ceiling), `placed: false` */
  const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
  const mlbSide = (note: string, id: string, lkey: string): SyncEntry =>
    ({
      date: SD, locked: true, note, core: [],
      funT: [{ id, bucket: "fun", name: `HR parlay · ${lkey}`, stake: 25, confirmed: null, placed: false, actualStake: 0, legs: [mLeg(lkey)] }],
      grading: null,
    }) as SyncEntry;

  /**
   * The whole point of this describe: merge two ungraded rivals, grade WHICHEVER ONE the cap
   * seated a WINNER, then let the rival sync again. The seated id must not move.
   */
  const gradeThenRemerge = (a: SyncEntry, b: SyncEntry, payout: number) => {
    const first = mergeLedgers([a], [b])[0];
    const seated = String((first.funT ?? [])[0].id);
    const graded: SyncEntry = JSON.parse(JSON.stringify(first));
    graded.grading = { done: true, tickets: { [seated]: { result: "won", payout } }, legs: {} };
    const rival = String((a.funT ?? [])[0].id) === seated ? b : a;
    return { seated, graded, rival, payout };
  };

  it("CFB: the $150 winner keeps its seat when the ungraded rival syncs again — both orders", () => {
    for (const [a, b] of [
      [cfbSide("phone", TOP1, "g1"), cfbSide("server", TOP2, "g2")],
      [cfbSide("server", TOP2, "g2"), cfbSide("phone", TOP1, "g1")],
    ] as [SyncEntry, SyncEntry][]) {
      const { seated, graded, rival, payout } = gradeThenRemerge(a, b, 150);
      for (const m of [mergeLedgers([graded], [rival]), mergeLedgers([rival], [graded])]) {
        expect(idsOf(m[0].funT ?? []), `grading ${seated} a WINNER is what evicted it`).toEqual([seated]);
        expect(stakeOf(m[0].funT ?? []), "the $25 fun allotment still holds — this is about WHICH ticket").toBe(CFB_PAPER.fun);
        expect(m[0].grading?.done, "the reopen loop forced the settled day back open over a ticket it no longer holds").toBe(true);
        expect(realizedPL([m[0]], "2026-08-15"), "the day's own $150 winner survives only as a dropped-ticket note").toBe(payout - 25);
        expect((m[0] as { funDroppedPL?: Record<string, { result: string }> }).funDroppedPL?.[seated], "the winner was written to the drop receipt").toBeUndefined();
      }
    }
  });

  it("MLB: the same sequence on the pure sync rail, with a $92.50 winner — both orders", () => {
    for (const [a, b] of [
      [mlbSide("phone", "HR_a", "h1"), mlbSide("server", "HR_z", "h2")],
      [mlbSide("server", "HR_z", "h2"), mlbSide("phone", "HR_a", "h1")],
    ] as [SyncEntry, SyncEntry][]) {
      const { seated, graded, rival, payout } = gradeThenRemerge(a, b, 92.5);
      for (const m of [mergeLedgers([graded], [rival]), mergeLedgers([rival], [graded])]) {
        expect((m[0] as { fun?: unknown }).fun, "a day carrying its own `fun` would not exercise the PAPER.fun fallback").toBeUndefined();
        expect(idsOf(m[0].funT ?? []), `grading ${seated} a WINNER is what evicted it`).toEqual([seated]);
        expect(stakeOf(m[0].funT ?? [])).toBe(PAPER.fun);
        expect(realizedPL([m[0]], "2026-08-15")).toBe(payout - 25);
      }
    }
  });

  it("the band itself, top to bottom: live > settled win > unplaced sizing > settled loser", () => {
    /* four one-ticket copies of one date, each carrying a DIFFERENT band, merged pairwise: the
       higher band must take the single $25 seat whichever copy pickBase happens to choose. */
    const band = (id: string, gkey: string, kind: "live" | "won" | "open" | "lost"): SyncEntry => {
      const over = kind === "live" ? { placed: true, actualStake: 25 } : {};
      const grading =
        kind === "won" ? { done: true, tickets: { [id]: { result: "won", payout: 47.73 } }, legs: {} }
          : kind === "lost" ? { done: true, tickets: { [id]: { result: "lost", payout: 0 } }, legs: {} }
            : null;
      return ({ sport: "cfb", date: SD, locked: true, daily: 150, fun: 25, core: [], funT: [sFun(id, gkey, over)], games: {}, grading }) as SyncEntry;
    };
    const beats = (hi: "live" | "won" | "open" | "lost", lo: "live" | "won" | "open" | "lost") => {
      /* both id orders, so no answer can come from the `a` < `z` byte tiebreak */
      for (const [hid, lid] of [[`cfb-${SD}-afun-1`, `cfb-${SD}-zfun-1`], [`cfb-${SD}-zfun-1`, `cfb-${SD}-afun-1`]]) {
        const H = () => band(hid, "g1", hi);
        const L = () => band(lid, "g2", lo);
        for (const m of [mergeLedgers([H()], [L()]), mergeLedgers([L()], [H()])]) {
          expect(idsOf(m[0].funT ?? []), `a ${lo} ticket took the seat from a ${hi} one`).toEqual([hid]);
        }
      }
    };
    beats("live", "won");
    beats("live", "open");
    beats("live", "lost");
    beats("won", "open");
    beats("won", "lost");
    beats("open", "lost");
  });

  it("the whole rule is order-free and idempotent across the grading sequence", () => {
    const { graded, rival } = gradeThenRemerge(cfbSide("phone", TOP1, "g1"), cfbSide("server", TOP2, "g2"), 150);
    const ab = mergeLedgers([graded], [rival]);
    const ba = mergeLedgers([rival], [graded]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rival])), "a third sync of the ungraded rival re-opened the question").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A RIVAL CARD'S RECEIPTED RAISE PUSHES A STAKE PAST THE $150 CAP — INSTRUCTION 45, defect F2
 * (2026-09-06), a REGRESSION of defect A2's second rule. Josh verbatim: "Parlay Lab CFB should've
 * been running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * A2 made `unionCore`'s AGREEMENT test per-id rather than per-entry, so one ticket's leg drift
 * could no longer switch the whole date's money reconciliation off. It went one id too far. The
 * APPEND pass is still refused wholesale for a pair that disputes any shared id — grepped in
 * src/lib/ledger-merge.ts this turn, `const unseen = other.core.filter((t) => t.id &&
 * !ids.has(t.id)).sort(byId);` feeding `const appendable = betConflict.length ? [] : unseen;` (one
 * expression when F2 shipped; CLOSING K3 below split the filter out so the refused tickets can be
 * named on `dropped`/`droppedPL`, and the refusal itself is byte-for-byte the same test) — on the
 * stated ground that two copies
 * minting one id from different boards are RIVAL CARDS whose surpluses must never be mixed. But
 * the STAKE RECONCILIATION kept running across that same pair, so a rival lock's receipted `topUp`
 * raised THIS card's ticket.
 *
 * MEASURED against the pre-fix kernel, both merge orders, every copy inside its own allotment:
 * the phone holds six agreed $25 core tickets ($150); the server holds `cfb-2026-09-05-core-1`
 * priced off a DIFFERENT game (rival), `core-2 @ $50 topUp 25` and three more at $25 ($150). The
 * merge named core-1 on `betConflict`, refused every append — and then took the rival's $50 for
 * core-2 because its `topUp` stamp happened to explain the difference. Merged coreSum 175 against
 * CFB_PAPER.daily 150, capBreach `{"core":{"sum":175,"cap":150}}`, on a $25 raise no writer of
 * THIS card ever made.
 *
 * THE RULE. A receipt is a claim by ONE allocator about ONE card. Once the two copies are shown to
 * be different cards, the rival's `topUp` explains nothing about this card's ticket, so the whole
 * reconciliation is refused for that pair: the base's ticket and the base's own stake stand, and
 * each refusal is recorded on the marker channel that already exists — `stakeConflict {id: {kept,
 * refused}}`, `kept` being the stake that is actually seated, so `mergeDay`'s own
 * "still seated AT THE STAKE IT NAMES" filter keeps the marker exactly while it is true.
 * ========================================================================================== */
describe("a rival card's receipted raise is refused, not seated (INSTRUCTION 45, F2)", () => {
  const RD = "2026-09-05";
  const rLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const rTix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [rLeg(g)], ...over,
  });
  const ID = (n: number) => `cfb-${RD}-core-${n}`;
  const rDay = (note: string, core: ReturnType<typeof rTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: RD, locked: true, daily: 150, fun: 25, note, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /** this card: six agreed $25 tickets, exactly the desk's $150 */
  const mine = () => rDay("phone", [1, 2, 3, 4, 5, 6].map((n) => rTix(ID(n), `g${n}`, 25)));
  /** the RIVAL card: core-1 priced off a different game, and core-2 raised WITH a receipt */
  const rival = () =>
    rDay("server", [
      rTix(ID(1), "g99", 25),
      rTix(ID(2), "g2", 50, { topUp: 25 }),
      rTix(ID(3), "g3", 25),
      rTix(ID(4), "g4", 25),
      rTix(ID(5), "g5", 25),
    ]);

  it("the rival's $50 never reaches this card, and the day stays inside CFB_PAPER.daily — both orders", () => {
    for (const m of [mergeLedgers([mine()], [rival()]), mergeLedgers([rival()], [mine()])]) {
      expect(stakeOf(m[0].core), "a rival lock's receipted raise staked this card past its own allotment").toBeLessThanOrEqual(CFB_PAPER.daily);
      expect(stakeOf(m[0].core)).toBe(150);
      expect((m[0] as { capBreach?: unknown }).capBreach, "the merge manufactured the breach it then reported").toBeUndefined();
      expect((m[0] as { betConflict?: string[] }).betConflict, "the id the two copies mean different bets by must still be named").toEqual([ID(1)]);
      expect(
        (m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        "the refused rival stake left no marker at all",
      ).toEqual({ [ID(2)]: { kept: 25, refused: 50 } });
      expect(m[0].core.find((t) => t.id === ID(2))?.stake, "the rival's stake belongs to a different wager").toBe(25);
      expect(m[0].core.find((t) => t.id === ID(2))?.topUp, "and so does the receipt that explains it").toBeUndefined();
    }
  });

  it("the MLB desk is bounded by PAPER.daily the same way", () => {
    const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
    const mTix = (id: string, lkey: string, stake: number, over: Record<string, unknown> = {}) => ({
      id, stake, name: `MIXED · ${lkey}`, type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [mLeg(lkey)], ...over,
    });
    const bare = (note: string, core: ReturnType<typeof mTix>[]): SyncEntry =>
      ({ date: RD, locked: true, note, allocSum: stakeOf(core), core, funT: [] }) as SyncEntry;
    const phone = () => bare("phone", [1, 2, 3, 4, 5, 6].map((n) => mTix(`MIXED_${n}`, `l${n}`, 25)));
    const server = () =>
      bare("server", [
        mTix("MIXED_1", "l99", 25),
        mTix("MIXED_2", "l2", 50, { topUp: 25 }),
        mTix("MIXED_3", "l3", 25),
        mTix("MIXED_4", "l4", 25),
        mTix("MIXED_5", "l5", 25),
      ]);
    for (const m of [mergeLedgers([phone()], [server()]), mergeLedgers([server()], [phone()])]) {
      expect((m[0] as { daily?: unknown }).daily, "a day carrying its own `daily` would not exercise the PAPER.daily fallback").toBeUndefined();
      expect(stakeOf(m[0].core)).toBeLessThanOrEqual(PAPER.daily);
      expect((m[0] as { capBreach?: unknown }).capBreach).toBeUndefined();
      expect((m[0] as { betConflict?: string[] }).betConflict).toEqual(["MIXED_1"]);
      expect(m[0].core.find((t) => t.id === "MIXED_2")?.stake).toBe(25);
    }
  });

  /* ── REWRITTEN, NOT LOOSENED — INSTRUCTION 45, FINAL K1 (2026-09-06) ─────────────────────────
     BEFORE, this test was one `it` named "a pair with NO bet conflict still reconciles a receipted
     raise exactly as before", and it read, verbatim:
         expect(m[0].core.find((t) => t.id === ID(2))?.stake, "a receipted raise on a card the two
           copies agree about is money the desk deployed").toBe(50);
         expect((m[0] as { betConflict?: unknown }).betConflict).toBeUndefined();
         expect((m[0] as { stakeConflict?: unknown }).stakeConflict).toBeUndefined();
     Its base card is `mine()` — SIX agreed $25 tickets, exactly CFB_PAPER.daily — so it required
     the merged day to seat $175 on Josh's $150 desk, uncapped AND unmarked, and it passed only
     because the ordinary reconciliation path had no allotment bound at all. That is the defect
     FINAL K1 fixes ("Parlay Lab CFB should've been running the same $150 per day theoretical Core
     money"), so the pin is rewritten to the behaviour the instruction asks for.

     IT IS NOT A LOOSENING: it now requires MORE than it did — the day held inside $150, AND the
     refusal NAMED with {kept, refused} where the old line required silence. And the half of its
     intent that was about the receipt rule (a receipted raise on an AGREEING pair is honoured, and
     carries no marker) is kept whole in the second `it` below, on a card that has the room for the
     raise — which is the case the old fixture meant to exercise and, at $150 of $150, could not. */
  /** the control: the same two cards with core-1 agreeing, so nothing here is a rival card. */
  const agreed = () =>
    rDay("server", [
      rTix(ID(1), "g1", 25),
      rTix(ID(2), "g2", 50, { topUp: 25 }),
      rTix(ID(3), "g3", 25),
    ]);

  it("a pair with NO bet conflict is bounded by the allotment too — refused and MARKED, both orders", () => {
    for (const m of [mergeLedgers([mine()], [agreed()]), mergeLedgers([agreed()], [mine()])]) {
      expect(stakeOf(m[0].core), "a receipted raise carried a full $150 card to $175 with no rival id anywhere").toBe(150);
      expect(m[0].core.find((t) => t.id === ID(2))?.stake, "this card's own stake stands when the day has no room for the lift").toBe(25);
      expect((m[0] as { betConflict?: unknown }).betConflict).toBeUndefined();
      expect(
        (m[0] as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        "the money the allotment refused left no receipt on any channel",
      ).toEqual({ [ID(2)]: { kept: 25, refused: 50 } });
      expect((m[0] as { capBreach?: unknown }).capBreach, "the breach the merge itself manufactured").toBeUndefined();
    }
  });

  it("a receipted raise the day HAS room for is still honoured, unmarked — both orders", () => {
    /* the same receipt on a card carrying $100 of its $150: 125 is inside the desk, so the wager
       the two copies agree about keeps every dollar the desk deployed on it. */
    const room = () => rDay("phone", [1, 2, 3, 4].map((n) => rTix(ID(n), `g${n}`, 25)));
    for (const m of [mergeLedgers([room()], [agreed()]), mergeLedgers([agreed()], [room()])]) {
      expect(m[0].core.find((t) => t.id === ID(2))?.stake, "a receipted raise on a card the two copies agree about is money the desk deployed").toBe(50);
      expect(m[0].core.find((t) => t.id === ID(2))?.topUp, "and the receipt travels with the stake it explains").toBe(25);
      expect(stakeOf(m[0].core)).toBe(125);
      expect((m[0] as { betConflict?: unknown }).betConflict).toBeUndefined();
      expect((m[0] as { stakeConflict?: unknown }).stakeConflict).toBeUndefined();
      expect((m[0] as { capBreach?: unknown }).capBreach).toBeUndefined();
    }
  });

  it("the refusal is order-free and idempotent", () => {
    const ab = mergeLedgers([mine()], [rival()]);
    const ba = mergeLedgers([rival()], [mine()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rival()])), "a second sync of the rival card raised the stake after all").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * `allocSum` IS THE MONEY THE DESK ACTUALLY COMMITTED — INSTRUCTION 45, defect F3 (2026-09-06), a
 * REGRESSION of defect D4.
 *
 * D4 stopped a refused stake shrinking `allocSum` with a downward clamp, which read verbatim from
 * src/lib/ledger-merge.ts before this round:
 *
 *     rec[key] = money(Math.max(cur + delta, Math.min(cur, cap)));
 *
 * That holds `allocSum` ABOVE the day's own seated core sum, and `decideTopUp`
 * (src/lib/server/blocks.ts, read this turn: `const owed = daily - Number(entry.allocSum ?? 0);`)
 * reads exactly that field as "how much of today's allotment is already deployed". So the day
 * UNDER-reports what it owes by the refused difference and NEVER TOPS UP TO $150 — the exact
 * opposite failure to the one the clamp was added to prevent, and a direct miss of the
 * instruction. MEASURED, both merge orders: `p:abc @ $10` / allocSum 10 against `p:abc @ $25` /
 * allocSum 25, no receipt — merged stake 10, allocSum 25, owed 125, so the sweep buys $125 onto a
 * day holding $10 and the date settles at $135 of its $150.
 *
 * THE INVARIANT IS THE ONE THE WRITE PATH ALREADY KEEPS. `buildLockEntry`
 * (src/lib/server/lock-card.ts, read this turn: `allocSum: Number(carry?.allocSum ?? 0) +
 * deployed,` where `const deployed = newCore.reduce((a, t) => a + Number(t.stake), 0);` and
 * carried tickets pass through byte for byte) makes `allocSum === Σ core stake` on every entry it
 * writes. So the merged day derives it from the SEATED SET rather than patching a delta: never
 * inflated by a refused rival stake, never deflated by one either, and never contradicting the
 * card it sits on.
 * ========================================================================================== */
describe("`allocSum` is derived from the seated core (INSTRUCTION 45, F3)", () => {
  const FD = "2026-09-05";
  const fLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const fTix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [fLeg(g)], ...over,
  });
  const FID = (n: number) => `cfb-${FD}-core-${n}`;
  const fDay = (note: string, core: ReturnType<typeof fTix>[]): SyncEntry =>
    ({ sport: "cfb", date: FD, locked: true, daily: 150, fun: 25, note, paper: true, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null }) as SyncEntry;
  const owedOf = (e: SyncEntry): number =>
    decideTopUp({
      entry: e as unknown as Record<string, unknown>,
      blocks: [],
      registry: {},
      starts: [Date.UTC(2026, 8, 5, 23, 0)],
      now: Date.UTC(2026, 8, 5, 20, 0),
      daily: CFB_PAPER.daily,
      max: 2,
    }).owed;

  /* ONE fixture, both directions: a rival card's raise is refused on a day that is $50 short.
     `mine` CONFIRMS ITS FOUR TICKETS so `pickBase` seats it in BOTH argument orders — read this
     turn, `confirmedCount` counts `t.confirmed != null` over core+funT and outranks both the JSON
     length and the byte compare, and `sameBet` reads ONLY `legs`, so the field decides the base
     without touching the bet identity. Without it the rival's extra `topUp: 25` makes ITS json
     longer, the rival is seated as the base, and the pinned number below would be describing
     whichever card won a byte comparison rather than the rule under test. */
  const mine = () => fDay("phone", [1, 2, 3, 4].map((n) => fTix(FID(n), `g${n}`, 25, { confirmed: 1757100000000 + n })));
  const rival = () =>
    fDay("server", [fTix(FID(1), "g99", 25), fTix(FID(2), "g2", 50, { topUp: 25 }), fTix(FID(3), "g3", 25), fTix(FID(4), "g4", 25)]);

  /* A RAISE THE SAME $150 CANNOT AFFORD. `mine` already holds $100; lifting core-2 from 25 to 125
     is a lift of 100, and 100 + 100 = 200 against Josh's $150, so `unionCore`'s per-id cap gate
     refuses THIS id and records the receipt for it. Used by (1b) below, which is the half of the
     original (1) that CLOSING K2 did not change. */
  const overRival = () =>
    fDay("server", [fTix(FID(1), "g99", 25), fTix(FID(2), "g2", 125, { topUp: 100 }), fTix(FID(3), "g3", 25), fTix(FID(4), "g4", 25)]);

  /* ------------------------------------------------------------------------------------------
     THIS IS A REWRITE, NOT A LOOSENING — INSTRUCTION 45, 2026-09-06, CLOSING K2.
     (1) previously read, verbatim:

         it("(1) a refused rival raise manufactures no fresh `owed` — both orders", () => {
           expect(owedOf(mine()), "this card holds $100 of its $150").toBe(50);
           for (const m of [mergeLedgers([mine()], [rival()]), mergeLedgers([rival()], [mine()])]) {
             expect((m[0] as { allocSum?: number }).allocSum, "the refused rival stake moved the day's recorded money").toBe(100);
             expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
             expect(owedOf(m[0]), "the merge invented owed out of a stake it refused").toBe(50);
           }
         });

     The number 100 in that pin was not a fact about `allocSum`. It was a fact about F2's refusal
     SCOPE — F2 refused every reconciliation on a date carrying any rival id at all, so core-2's
     receipted $25 raise died because core-1 was disputed. CLOSING K2 is the finding that this is
     wrong: a disagreement about core-1 is a fact about core-1. The raise on core-2 is receipted
     and the day can afford it, so it is now honoured and the seated core really is $125.

     WHAT F3 ACTUALLY PINS IS UNTOUCHED, and is still asserted below on every branch: `allocSum`
     equals `stakeOf(core)` of the day the merge seated, and seated core + `owed` still lands on
     Josh's $150 exactly. Both of those hold at 125/25 as they held at 100/50. NOTHING WAS
     DELETED: the refusal case the old (1) exercised is preserved verbatim as (1b) below, on a
     fixture where the raise genuinely breaches the day's $150 — so the merge still may not invent
     `owed` out of a stake it refused, and that is still pinned at 100/50.
     ------------------------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------------------------
     REWRITTEN AGAIN — INSTRUCTION 45, FINAL2 K2 (2026-09-06). Between CLOSING K2's rewrite above
     and this one, (1) read verbatim:

         expect((m[0] as { allocSum?: number }).allocSum, "the rival on core-1 stranded core-2's receipted raise").toBe(125);
         expect(owedOf(m[0]), "the merge invented owed out of a stake it honoured").toBe(25);
         expect((m[0] as { stakeConflict?: unknown }).stakeConflict, "a stake refusal was booked against an id the merge did not refuse").toBeUndefined();

     The 125 was a fact about CLOSING K2's carve-out: on a RIVAL pair a receipted lift was seated
     whenever it fitted under the allotment. FINAL2 K2 is the finding that a rival's `topUp` is a
     claim by ANOTHER allocator about ANOTHER card at EVERY size — the rule `unionCore`'s own F2
     docblock states, and the rule FINAL K4 already applied to the rival pair's smaller stake — so
     the lift is refused and NAMED instead of absorbed in silence. What F3 actually pins is again
     untouched and still asserted on every branch: `allocSum` equals `stakeOf(core)` of the day the
     merge seated, and seated core + `owed` still lands on Josh's $150 exactly (asserted by (2)
     below, which needs no change at 100/50 either). NOTHING WEAKENED: this `it` now requires MORE
     than the version it replaces — the refusal must appear on `stakeConflict`, where the old line
     required silence.
     ------------------------------------------------------------------------------------------ */
  it("(1) a rival's receipted raise on ANOTHER id is refused and named — both orders", () => {
    expect(owedOf(mine()), "this card holds $100 of its $150").toBe(50);
    for (const m of [mergeLedgers([mine()], [rival()]), mergeLedgers([rival()], [mine()])]) {
      expect((m[0] as { allocSum?: number }).allocSum, "the rival stake moved the day's recorded money").toBe(100);
      expect((m[0] as { allocSum?: number }).allocSum, "allocSum stopped being the seated core").toBe(stakeOf(m[0].core));
      expect(owedOf(m[0]), "the merge invented owed out of a stake it refused").toBe(50);
      expect((m[0] as { betConflict?: string[] }).betConflict, "the refusal named an id nobody disputed").toEqual([FID(1)]);
      expect(
        (m[0] as { stakeConflict?: unknown }).stakeConflict,
        "a rival lock's stake was refused with no receipt on any channel",
      ).toEqual({ [FID(2)]: { kept: 25, refused: 50 } });
    }
  });

  it("(1b) a refused rival raise manufactures no fresh `owed` — both orders", () => {
    expect(owedOf(mine()), "this card holds $100 of its $150").toBe(50);
    for (const m of [mergeLedgers([mine()], [overRival()]), mergeLedgers([overRival()], [mine()])]) {
      expect((m[0] as { allocSum?: number }).allocSum, "the refused rival stake moved the day's recorded money").toBe(100);
      expect((m[0] as { allocSum?: number }).allocSum).toBe(stakeOf(m[0].core));
      expect(owedOf(m[0]), "the merge invented owed out of a stake it refused").toBe(50);
      expect((m[0] as { stakeConflict?: unknown }).stakeConflict, "the money the merge refused left no receipt").toEqual({ [FID(2)]: { kept: 25, refused: 125 } });
      expect((m[0] as { betConflict?: string[] }).betConflict).toEqual([FID(1)]);
    }
  });

  it("(2) and the same short day still reaches the FULL $150 — owed is what the card is missing", () => {
    for (const m of [mergeLedgers([mine()], [rival()]), mergeLedgers([rival()], [mine()])]) {
      expect(stakeOf(m[0].core) + owedOf(m[0]), "the day can no longer be topped up to Josh's $150").toBe(CFB_PAPER.daily);
    }
  });

  it("(3) a receiptless re-size leaves the day owing exactly what it is short — the D4 shape", () => {
    const pLeg = { lkey: "l1", label: "l1 over", prop: "batter_hits", cz: -130 };
    const pDay = (stake: number): SyncEntry =>
      ({
        date: "2026-09-01", locked: true, paper: true, daily: 150, fun: 25, allocSum: stake,
        core: [{ id: "p:abc", stake, name: "MIXED · l1", type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [pLeg] }],
        funT: [],
      }) as SyncEntry;
    for (const m of [mergeLedgers([pDay(10)], [pDay(25)]), mergeLedgers([pDay(25)], [pDay(10)])]) {
      expect(m[0].core[0].stake, "the receipt rule still decides the STAKE — that half is unchanged").toBe(10);
      expect((m[0] as { allocSum?: number }).allocSum, "allocSum stood above the card it describes").toBe(10);
      expect(stakeOf(m[0].core) + 140, "a $10 day was priced as owing anything but $140").toBe(PAPER.daily);
    }
  });
});

/* ============================================================================================
 * THE MERGED DAY RECORDS THE `daily` THE CAP ACTUALLY USED — INSTRUCTION 45, defect F4
 * (2026-09-06), a REGRESSION of defect D1.
 *
 * D1 made `allotmentCap` clamp an inflated stored claim to the desk's own allotment, so a blob
 * writing `daily: 500` into itself can no longer buy a ninth ticket. It clamped the CAP and left
 * the FIELD. MEASURED, both merge orders: a `daily: 500` copy carrying eight $25 tickets merged
 * with an honest `daily: 150` copy comes back reading `daily: 500` beside `capBreach {"core":{
 * "sum":200,"cap":150}}` — one record contradicting itself about the same number.
 *
 * TWO CONSUMERS READ THE FIELD RATHER THAN THE CAP, both grepped this turn:
 * `buildReading` (src/lib/server/self-reading.ts) computes
 * `capBinding: entry.daily != null && entry.allocSum != null ? Math.abs((entry.allocSum as number)
 * - (entry.daily as number)) < 0.5 : null`, so the self-reading reports a $150 day as NOT cap-
 * binding against a $500 fiction; and app/ledger/page.tsx renders the day header as
 * `<span className="num">{tix.length} tickets · ${e.daily + e.fun}</span>`.
 *
 * Mutation survivor W2b: nothing pinned the merged day's own `daily` at all.
 * ========================================================================================== */
describe("the merged day's `daily` is the cap the merge used (INSTRUCTION 45, F4)", () => {
  const WD = "2026-09-05";
  const wLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const wTix = (n: number) => ({ id: `cfb-${WD}-core-${n}`, bucket: "core", name: "SINGLE · HOME ML", stake: 25, confirmed: null, legs: [wLeg(`g${n}`)] });
  const claim = (daily: number, ns: number[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: WD, locked: true, daily, fun: 25, core: ns.map(wTix), funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const GRADED = { grading: { done: true, tickets: {}, legs: {} } } as Partial<SyncEntry>;

  it("CFB: an inflated `daily: 500` is not carried onto the merged day, in both merge orders", () => {
    const rich = () => claim(500, [1, 2, 3, 4, 5, 6, 7, 8], GRADED);
    const honest = () => claim(CFB_PAPER.daily, [9]);
    for (const m of [mergeLedgers([rich()], [honest()]), mergeLedgers([honest()], [rich()])]) {
      expect((m[0] as { daily?: number }).daily, "the merged day records a ceiling the merge itself refused to use").toBe(CFB_PAPER.daily);
      expect((m[0] as { daily?: number }).daily, "the day's own `daily` contradicts the cap the breach was measured against").toBe(
        (m[0] as { capBreach?: { core?: { cap: number } } }).capBreach?.core?.cap,
      );
    }
  });

  it("MLB: the same, off a copy carrying no `daily` at all", () => {
    const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
    const mTix = (n: number) => ({ id: `MIXED_${n}`, stake: 25, name: `MIXED · l${n}`, type: "MIXED", confirmed: null, placed: false, actualStake: 0, legs: [mLeg(`l${n}`)] });
    const bare = (daily: number | undefined, ns: number[], over: Partial<SyncEntry> = {}): SyncEntry =>
      ({ date: WD, locked: true, core: ns.map(mTix), funT: [], ...(daily === undefined ? {} : { daily }), ...over }) as SyncEntry;
    for (const m of [
      mergeLedgers([bare(500, [1, 2, 3, 4, 5, 6, 7], GRADED)], [bare(undefined, [8])]),
      mergeLedgers([bare(undefined, [8])], [bare(500, [1, 2, 3, 4, 5, 6, 7], GRADED)]),
    ]) {
      expect((m[0] as { daily?: number }).daily).toBe(PAPER.daily);
      expect((m[0] as { daily?: number }).daily).toBe((m[0] as { capBreach?: { core?: { cap: number } } }).capBreach?.core?.cap);
    }
  });

  it("a legitimate LOWER `daily` is still the number recorded, and a day with none gains none", () => {
    for (const m of [mergeLedgers([claim(50, [1], GRADED)], [claim(50, [1, 2, 3])]), mergeLedgers([claim(50, [1, 2, 3])], [claim(50, [1], GRADED)])]) {
      expect((m[0] as { daily?: number }).daily, "the day's own $50 allotment was overwritten with the desk's").toBe(50);
    }
    const mLeg = (lkey: string) => ({ lkey, label: `${lkey} over`, prop: "batter_hits", cz: -130 });
    const noDaily = (id: string): SyncEntry =>
      ({ date: WD, locked: true, core: [{ id, stake: 25, name: "MIXED · l1", type: "MIXED", confirmed: null, legs: [mLeg("l1")] }], funT: [] }) as SyncEntry;
    const m = mergeLedgers([noDaily("MIXED_1")], [noDaily("MIXED_2")]);
    expect(Object.prototype.hasOwnProperty.call(m[0], "daily"), "the merge minted a `daily` onto a day that never carried one").toBe(false);
  });
});

/* ============================================================================================
 * THE CLOSING ROUND — INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * NAMING. This file already carries describes labelled K1 / K3 / K4 / K5 from an EARLIER pass of
 * the same instruction (the difference-of-receipts rule, the over-cap blob kept and marked, the
 * named fun drop, the exported `unionFun`). The closing round re-used those letters for DIFFERENT
 * defects, so every block below is labelled CLOSING K1 … CLOSING K7 to keep the two sets apart.
 *
 * ONE SENTENCE RUNS THROUGH ALL OF THEM. A DISAGREEMENT ABOUT ONE TICKET IS A FACT ABOUT THAT
 * TICKET — never about the date, the entry, or any other id. Every refusal the kernel writes is
 * scoped to the id actually in dispute, and every refusal leaves a receipt naming the money it
 * refused.
 * ========================================================================================== */

/* ============================================================================================
 * A REFUSED WAGER MAY NOT BOOK ITS VERDICT AS A WIN — INSTRUCTION 45, CLOSING K1 (2026-09-06).
 *
 * WHAT WENT WRONG. `mergeDay` withdraws the verdict of every ticket whose stake MOVED
 * (`united.restaked`), because a payout is priced off the stake it was graded against. A
 * RIVAL-CARD id never enters `restaked` — `unionCore`'s pre-pass pushes it onto `betConflict` and
 * seats the BASE's ticket byte-unchanged — so the withdrawal never fired for it. Two blocks
 * above, the fill-only grading merge `out.grading.tickets = { ...(other.grading.tickets ?? {}),
 * ...(out.grading.tickets ?? {}) }` had ALREADY copied the RIVAL copy's verdict in under that
 * same id.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before this fix, on the fixture below:
 *   {"seatedGkey":"g1","verdict":{"result":"won","payout":47.73},"done":true,
 *    "legKeys":["g2|spread|home|-3","g2b|spread|home|-3"],
 *    "betConflict":["cfb-2026-09-05-core-1"],"realizedPL":-2.27,"coreSum":50}
 * The day seats core-1 on g1 and books a $47.73 payout the merge REFUSED, off a ticket priced on
 * g2 that is nowhere on the card; `grading.legs` keeps an orphan `g2|spread|home|-3` key for a
 * game the day does not seat; `won` is in RESOLVED so no overlay may overwrite it, and
 * `done: true` stops every grader recomputing — the day is closed on a fiction, permanently.
 *
 * THE FIX: the withdrawal is driven off `restaked` UNION `betConflict`. Both are lists of ids in
 * dispute and the remedy is the same for both — delete that ticket's verdict, drop the leg keys no
 * SURVIVING ticket owns (the rival copy's legs included, which is how the orphan goes), and set
 * `done: false` so the grader re-runs from finals and the SEATED legs. The refusal stays scoped to
 * the disputed id: core-2's own `lost` verdict and its leg key are untouched.
 * ========================================================================================== */
describe("a REFUSED wager may not book its verdict as a WIN (INSTRUCTION 45, CLOSING K1)", () => {
  const KD = "2026-09-05";
  const kLeg = (g: string) => ({ gkey: g, lkey: `${g}|spread|home|-3`, label: "HOME -3", prop: "SPREAD", market: "spread", side: "home", line: -3, cz: -110 });
  const kTix = (id: string, g: string, stake: number) => ({ id, bucket: "core", name: "SINGLE · HOME -3", stake, confirmed: null, legs: [kLeg(g)] });
  const KC1 = `cfb-${KD}-core-1`;
  const KC2 = `cfb-${KD}-core-2`;
  const kDay = (core: ReturnType<typeof kTix>[], grading: SyncEntry["grading"]): SyncEntry =>
    ({ sport: "cfb", date: KD, locked: true, daily: 150, fun: 25, core, funT: [], games: {}, grading }) as SyncEntry;
  /** the card the ledger seats: core-1 on g1, core-2 graded LOST and done — gradeScore 2, the base */
  const seated = (): SyncEntry =>
    kDay([kTix(KC1, "g1", 25), kTix(KC2, "g2b", 25)], {
      done: true,
      tickets: { [KC2]: { result: "lost", payout: 0 } },
      legs: { "g2b|spread|home|-3": { result: "lost" } },
    });
  /** the RIVAL lock: the same positional id on a DIFFERENT game, graded a $47.73 WINNER */
  const rival = (): SyncEntry =>
    kDay([kTix(KC1, "g2", 25), kTix(KC2, "g2b", 25)], {
      done: false,
      tickets: { [KC1]: { result: "won", payout: 47.73 } },
      legs: { "g2|spread|home|-3": { result: "won" } },
    });
  const orders = () => [
    [mergeLedgers([seated()], [rival()])[0], "seated,rival"],
    [mergeLedgers([rival()], [seated()])[0], "rival,seated"],
  ] as const;

  it("the verdict of the ticket the merge refused is WITHDRAWN, not credited — both orders", () => {
    for (const [m, order] of orders()) {
      expect((m.core.find((t) => t.id === KC1) as { legs?: { gkey?: string }[] } | undefined)?.legs?.[0]?.gkey, order).toBe("g1");
      expect(
        (m.grading?.tickets as Record<string, unknown> | undefined)?.[KC1],
        `${order}: a $47.73 payout is booked on a wager the merge REFUSED`,
      ).toBeUndefined();
      expect(m.grading?.done, `${order}: done:true closes the day on that fiction permanently`).toBe(false);
      expect(
        Object.keys((m.grading?.legs ?? {}) as Record<string, unknown>).sort(),
        `${order}: an orphan leg key survives for a game the day does not seat`,
      ).toEqual(["g2b|spread|home|-3"]);
      expect(realizedPL([m], KD), `${order}: the day's P/L still credits the refused payout`).toBe(-25);
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([KC1]);
    }
  });

  it("the withdrawal is scoped to the DISPUTED id — core-2's own lost verdict stands", () => {
    for (const [m, order] of orders()) {
      expect((m.grading?.tickets as Record<string, { result?: string }>)[KC2]?.result, order).toBe("lost");
      expect(stakeOf(m.core), order).toBe(50);
      expect(m.core.map((t) => String(t.id)), order).toEqual([KC1, KC2]);
    }
  });

  it("and the re-grade the reopen invites lands on the honest −50.00 for the two-ticket $50 day", () => {
    const m = mergeLedgers([seated()], [rival()])[0];
    const regraded = {
      ...m,
      grading: { done: true, tickets: { ...(m.grading?.tickets ?? {}), [KC1]: { result: "lost", payout: 0 } }, legs: {} },
    } as SyncEntry;
    expect(realizedPL([regraded], KD), "the honest answer for the day the merge actually seats").toBe(-50);
  });

  it("the withdrawal is order-free and idempotent", () => {
    const ab = mergeLedgers([seated()], [rival()]);
    const ba = mergeLedgers([rival()], [seated()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rival()])), "a second sync of the rival card re-credited its payout").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A RIVAL ON ONE ID MUST NOT STRAND A RECEIPTED RAISE ON ANOTHER — INSTRUCTION 45, CLOSING K2
 * (2026-09-06), a REGRESSION of defect F2 above.
 *
 * F2 was right that a RIVAL card's receipt explains nothing about THIS card, and it wrote the
 * refusal as a whole-date branch: `if (rivals) { … }` inside the reconciliation loop refused every
 * shared id's reconciliation because SOME id was disputed. That is the same shape of error A2 had
 * just fixed one level down (a whole-entry agreement bail), reintroduced one level up.
 *
 * MEASURED as a matched pair through `mergeLedgers`, BOTH ORDERS, before this fix. Two
 * server-locked copies of 2026-09-05, one field apart. Both hold core-1 @ $25 (g1), core-2 (g2),
 * core-3 @ $25 (g3) and topup1-core-4 @ $25; the server copy's core-2 was legitimately topped up
 * to $50 carrying `topUp: 25`, a receipt that passes the difference test EXACTLY.
 *   CONTROL  topup1-core-4 names gA on BOTH copies:
 *            {"stakes":[25,50,25,25],"sum":125,"allocSum":125}
 *   DEFECT   the ONLY change — topup1-core-4 names gA on one copy and gB on the other:
 *            {"stakes":[25,25,25,25],"sum":100,"allocSum":100,
 *             "stakeConflict":{"cfb-2026-09-05-core-2":{"kept":25,"refused":50}},
 *             "betConflict":["cfb-2026-09-05-topup1-core-4"]}
 * So an UNRELATED ticket's drift deleted $25 of deployed money from the record and handed the desk
 * $25 of fresh room to stake again — up to $175 on a $150 day.
 *
 * THE FIX narrows the refusal to what the rival's receipt could actually corrupt: on a rival pair
 * a receipted raise is honoured only while the merged core stays inside the day's own allotment,
 * and is otherwise refused with the marker F2 measured. F2's own fixture is six agreed $25 tickets
 * ($150, the whole desk) against a rival raise of $25 — 175 > 150, still refused, still marked;
 * this fixture's card carries $100 and the raise lands at $125, inside the desk, so the wager the
 * two copies AGREE about keeps the money the desk deployed on it.
 * ========================================================================================== */
describe("a rival on ONE id no longer strands a receipted raise on ANOTHER (INSTRUCTION 45, CLOSING K2)", () => {
  const RD2 = "2026-09-05";
  const r2Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const r2Tix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [r2Leg(g)], ...over,
  });
  const R2 = (n: number) => `cfb-${RD2}-core-${n}`;
  const R2T4 = `cfb-${RD2}-topup1-core-4`;
  const r2Day = (core: ReturnType<typeof r2Tix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: RD2, locked: true, daily: 150, fun: 25, source: "server-lock", allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /** the copy the phone graded — core-2 still at its lock stake, so gradeScore seats it as the base */
  const phone = (g4: string): SyncEntry =>
    r2Day([r2Tix(R2(1), "g1", 25), r2Tix(R2(2), "g2", 25), r2Tix(R2(3), "g3", 25), r2Tix(R2T4, g4, 25)], { grading: { done: false, tickets: {}, legs: {} } });
  /** the server copy after the residue fire: core-2 topped up to $50 WITH the receipt that explains it */
  const server = (g4: string): SyncEntry =>
    r2Day([r2Tix(R2(1), "g1", 25), r2Tix(R2(2), "g2", 50, { topUp: 25 }), r2Tix(R2(3), "g3", 25), r2Tix(R2T4, g4, 25)]);
  const pairs = (gp: string, gs: string) => [
    [mergeLedgers([phone(gp)], [server(gs)])[0], "phone,server"],
    [mergeLedgers([server(gs)], [phone(gp)])[0], "server,phone"],
  ] as const;

  /* ------------------------------------------------------------------------------------------
     REWRITTEN, NOT LOOSENED — INSTRUCTION 45, FINAL2 K2 (2026-09-06). This `it` was named "the
     CONTROL and the DEFECT differ by ONE field and must merge to the same $125" and required BOTH
     fixtures to answer identically, verbatim:

         expect(m.core.map((t) => Number(t.stake)), where).toEqual([25, 50, 25, 25]);
         expect(stakeOf(m.core), `${where}: an UNRELATED ticket's drift deleted $25 of deployed money`).toBe(125);
         expect((m as { stakeConflict?: unknown }).stakeConflict, `${where}: a wager the two copies AGREE about was marked refused`).toBeUndefined();

     Requiring the DEFECT fixture to match the CONTROL is what carved the rival pair out of the
     rule `unionCore`'s F2 docblock states and FINAL K4 applied to the same pair's smaller stake:
     a rival's `topUp` is a claim by ANOTHER allocator about ANOTHER card, so its stake may not
     cross at any size. Seating it, with no marker, put $25 the device never placed onto the phone's
     card with nothing to disclose it — FINAL2 K2's measured red. THE CONTROL IS UNCHANGED and is
     still asserted at $125, unmarked, below: CLOSING K2's real finding — that a disagreement about
     ONE id must not strand a legitimate raise on ANOTHER — is delivered on the ORDINARY path,
     which is where a receipt is evidence, and FINAL2 K1's floor is what makes it reach $150 there.
     The DEFECT fixture now requires MORE than silence: this card's own stake, AND the refusal
     named with {kept, refused}.
     ------------------------------------------------------------------------------------------ */
  it("the CONTROL — no rival id anywhere — still merges to $125, unmarked", () => {
    for (const [m, order] of pairs("gA", "gA")) {
      expect(m.core.map((t) => Number(t.stake)), order).toEqual([25, 50, 25, 25]);
      expect(stakeOf(m.core), `${order}: an UNRELATED ticket's drift deleted $25 of deployed money`).toBe(125);
      expect((m as { stakeConflict?: unknown }).stakeConflict, `${order}: a wager the two copies AGREE about was marked refused`).toBeUndefined();
      expect(Number((m as { allocSum?: unknown }).allocSum), order).toBe(125);
      expect(CFB_PAPER.daily - stakeOf(m.core), `${order}: the desk was handed room to stake money it had already deployed`).toBe(25);
    }
  });

  it("the DEFECT — one rival id — keeps this card's own stake and NAMES the refusal", () => {
    for (const [m, order] of pairs("gA", "gB")) {
      expect(m.core.map((t) => Number(t.stake)), order).toEqual([25, 25, 25, 25]);
      expect(stakeOf(m.core), `${order}: a rival lock's stake crossed onto this card because it fit`).toBe(100);
      expect(
        (m as { stakeConflict?: unknown }).stakeConflict,
        `${order}: money that moved between two rival locks left no receipt on any channel`,
      ).toEqual({ [R2(2)]: { kept: 25, refused: 50 } });
      expect(Number((m as { allocSum?: unknown }).allocSum), order).toBe(100);
    }
  });

  it("the disputed id is still named — and only it", () => {
    for (const [m, order] of pairs("gA", "gB")) {
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([R2T4]);
      expect(m.core.find((t) => t.id === R2T4)?.stake, `${order}: the base's own ticket must stand on the disputed id`).toBe(25);
      expect((m.core.find((t) => t.id === R2T4) as { legs?: { gkey?: string }[] } | undefined)?.legs?.[0]?.gkey, order).toBe("gA");
    }
    for (const [m, order] of pairs("gA", "gA")) {
      expect((m as { betConflict?: unknown }).betConflict, order).toBeUndefined();
    }
  });

  it("the narrowed refusal is order-free and idempotent", () => {
    for (const [gp, gs] of [["gA", "gA"], ["gA", "gB"]] as const) {
      const ab = mergeLedgers([phone(gp)], [server(gs)]);
      const ba = mergeLedgers([server(gs)], [phone(gp)]);
      expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
      expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [server(gs)])), "a second sync moved the stake again").toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [phone(gp)]))).toBe(JSON.stringify(ab));
    }
  });
});

/* ============================================================================================
 * A CORE TICKET DISCARDED FROM A RIVAL LOCK LEAVES A RECEIPT — INSTRUCTION 45, CLOSING K3
 * (2026-09-06).
 *
 * WHAT WENT WRONG. On a rival date `unionCore` empties `appendable` outright — the standing rule
 * that two locks sharing an id namespace must never have their surpluses mixed. The refusal is
 * right; the SILENCE was not. Every core ticket only the losing copy held was discarded with no
 * receipt of any kind: not on `coreDropped`, not on `coreDroppedPL`, nothing for anyone
 * reconciling the ledger against a device that still shows the bet.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before this fix, on the fixture below:
 *   {"ids":["cfb-2026-09-05-core-1"],"sum":20,"allocSum":20,
 *    "betConflict":["cfb-2026-09-05-core-1"]}
 * — `coreDropped` and `coreDroppedPL` both ABSENT over two $25 wagers the merge threw away.
 *
 * THE DECISION: REFUSE, WITH A RECEIPT — not append. Appending a rival lock's surplus onto this
 * card would stake the Saturday twice, which is what the pin "REFUSES the union when the two sides
 * disagree about a shared id — rival locks are never mixed" has required since this union shipped.
 * And the refused money is not this card's exposure: it is a wager on a card the ledger does not
 * keep, so `allocSum` — DERIVED from the seated core (defect F3) — correctly reports the $20 this
 * card actually carries, and the top-up decider is offered only the room THIS card is genuinely
 * short. Suppressing that room instead would leave the day under the $150 Josh asked for, which is
 * the same instruction missed from the other side. What changes is only that the loss is legible.
 * ========================================================================================== */
describe("a core ticket refused from a rival lock leaves a receipt (INSTRUCTION 45, CLOSING K3)", () => {
  const KD3 = "2026-09-05";
  const k3Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const k3Tix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) =>
    ({ id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [k3Leg(g)], ...over });
  const K3C = (n: number) => `cfb-${KD3}-core-${n}`;
  const k3Day = (core: ReturnType<typeof k3Tix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: KD3, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /* Josh's Builder lock: one CONFIRMED $20 ticket on g9, ungraded. The confirmation is what seats
     this card as the base in BOTH argument orders and in BOTH tests below — read this turn,
     `pickBase` orders on gradeScore, then `clvCount`, then `confirmedCount`, then JSON length. An
     ungraded `grading` object alone only wins while the rival has none: the moment the rival copy
     carries a verdict (the settled test below) both sides score 1, the key falls through to JSON
     length, and the rival's three tickets make ITS json longer — the merge would then be seating
     the rival lock and the receipt under test would never be written at all. `confirmedCount`
     outranks that byte length and `sameBet` reads ONLY `legs`, so the field decides the base
     without touching the bet identity. */
  const device = (): SyncEntry =>
    k3Day([k3Tix(K3C(1), "g9", 20, { confirmed: 1757100000000 })], { grading: { done: false, tickets: {}, legs: {} } });
  /** the server's rival lock: the same positional id from a different board, plus two of its own */
  const serverLock = (grading: SyncEntry["grading"] = null): SyncEntry =>
    k3Day([k3Tix(K3C(1), "g1", 25), k3Tix(K3C(2), "g2", 25), k3Tix(K3C(3), "g3", 25)], { grading });
  const both3 = (s: SyncEntry) => [
    [mergeLedgers([device()], [s])[0], "device,server"],
    [mergeLedgers([s], [device()])[0], "server,device"],
  ] as const;

  it("the tickets only the rival lock holds are NAMED with their money, both orders", () => {
    for (const [m, order] of both3(serverLock())) {
      expect(m.core, `${order}: a rival lock's tickets were staked onto this card`).toEqual(device().core);
      expect(stakeOf(m.core), order).toBe(20);
      expect((m as { coreDropped?: string[] }).coreDropped, `${order}: $50 of wagers left durable state with no receipt`).toEqual([K3C(2), K3C(3)]);
      expect((m as { coreDroppedPL?: Record<string, unknown> }).coreDroppedPL, order).toEqual({
        [K3C(2)]: { result: "pending", payout: 0, stake: 25 },
        [K3C(3)]: { result: "pending", payout: 0, stake: 25 },
      });
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([K3C(1)]);
      expect(Number((m as { allocSum?: unknown }).allocSum), `${order}: allocSum is the money THIS card carries`).toBe(20);
    }
  });

  it("a SETTLED ticket the rival lock holds carries its verdict and payout onto the receipt", () => {
    const graded = serverLock({ done: false, tickets: { [K3C(2)]: { result: "won", payout: 61.25 } }, legs: {} });
    for (const [m, order] of both3(graded)) {
      expect((m as { coreDroppedPL?: Record<string, unknown> }).coreDroppedPL, order).toEqual({
        [K3C(2)]: { result: "won", payout: 61.25, stake: 25 },
        [K3C(3)]: { result: "pending", payout: 0, stake: 25 },
      });
    }
  });

  it("the receipt is order-free and idempotent, and clears if the id is ever seated", () => {
    const ab = mergeLedgers([device()], [serverLock()]);
    const ba = mergeLedgers([serverLock()], [device()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [serverLock()]))).toBe(JSON.stringify(ab));
    /* an AGREEING copy of the same date seats core-2 and core-3, and the receipt must not outlive
       the loss it names — the same "still dropped" filter `funDropped` has always had. */
    const agreeing = k3Day([k3Tix(K3C(1), "g9", 20), k3Tix(K3C(2), "g2", 25), k3Tix(K3C(3), "g3", 25)]);
    const later = mergeLedgers(ab, [agreeing])[0];
    expect(idsOf(later.core)).toEqual([K3C(1), K3C(2), K3C(3)]);
    expect((later as { coreDropped?: unknown }).coreDropped, "a receipt outlived the loss it named").toBeUndefined();
    expect((later as { coreDroppedPL?: unknown }).coreDroppedPL).toBeUndefined();
  });
});

/* ============================================================================================
 * THE FUN SEAT IS MONOTONE ACROSS THE FULL GRADING SEQUENCE — INSTRUCTION 45, CLOSING K4
 * (2026-09-06), a REGRESSION of defect F1 above.
 *
 * F1's rank band fixed the UNGRADED-versus-SETTLED case: a ticket's own win promotes it from band
 * 1 to band 2 and can no longer cost it its seat. It did not fix SETTLED-versus-SETTLED. Once both
 * rivals settle, both sit at band 2 and the `q.payout - p.payout` tiebreak EVICTS the winner the
 * day already seated in favour of whichever paper ticket won more — and the day's recorded P/L
 * moves with it.
 *
 * MEASURED THROUGH `mergeLedgers` over the FULL four-step sequence, BOTH ORDERS, before this fix:
 *   {"seat":"cfb-2026-09-05-topup2-fun-1",
 *    "s1":["cfb-2026-09-05-topup2-fun-1"],"s2":["cfb-2026-09-05-topup2-fun-1"],
 *    "s3":["cfb-2026-09-05-topup1-fun-1"],"s4":["cfb-2026-09-05-topup1-fun-1"],
 *    "pl2":125,"pl3":175}
 * — step 3 is the rival's own verdict landing, and it takes the seat off a settled winner the day
 * had already recorded, moving realizedPL from +125.00 to +175.00 on $25 of fun money.
 *
 * THE FIX: a ticket the merged day ALREADY SEATS outranks an equally-banded rival before the
 * payout is consulted. Two candidates the day does not yet seat are still separated by the money
 * and not by a byte, which is what the payout key was added for.
 * ========================================================================================== */
describe("the fun seat is monotone across the FULL grading sequence (INSTRUCTION 45, CLOSING K4)", () => {
  const KD4 = "2026-09-05";
  const k4Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const k4Tix = (id: string, g: string) => ({ id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, confirmed: null, legs: [k4Leg(g)] });
  const K4T1 = `cfb-${KD4}-topup1-fun-1`;
  const K4T2 = `cfb-${KD4}-topup2-fun-1`;
  const k4Day = (id: string, g: string, grading: SyncEntry["grading"]): SyncEntry =>
    ({ sport: "cfb", date: KD4, locked: true, daily: 150, fun: 25, core: [], funT: [k4Tix(id, g)], games: {}, grading }) as SyncEntry;
  const wonAt = (id: string, payout: number): SyncEntry["grading"] => ({ done: true, tickets: { [id]: { result: "won", payout } }, legs: {} });

  const sequence = (order: "ab" | "ba") => {
    const merge = (x: SyncEntry, y: SyncEntry) => (order === "ab" ? mergeLedgers([x], [y]) : mergeLedgers([y], [x]))[0];
    const s1 = merge(k4Day(K4T1, "g1", null), k4Day(K4T2, "g2", null));
    const seat = String((s1.funT ?? [])[0]?.id);
    const rivalId = seat === K4T1 ? K4T2 : K4T1;
    const rivalG = seat === K4T1 ? "g2" : "g1";
    const s2 = merge({ ...s1, grading: wonAt(seat, 150) } as SyncEntry, k4Day(rivalId, rivalG, null));
    const s3 = merge({ ...s2, grading: wonAt(seat, 150) } as SyncEntry, k4Day(rivalId, rivalG, wonAt(rivalId, 200)));
    const s4 = merge(s3, k4Day(rivalId, rivalG, wonAt(rivalId, 200)));
    return { seat, rivalId, steps: [["1 both ungraded", s1], ["2 the seat settles", s2], ["3 the rival settles too, for MORE", s3], ["4 re-merged", s4]] as const };
  };

  it("a settled winner the day already seats is never displaced by a rival that merely won more", () => {
    for (const order of ["ab", "ba"] as const) {
      const { seat, steps } = sequence(order);
      for (const [what, m] of steps) {
        expect((m.funT ?? []).map((t) => String(t.id)), `${order} · step ${what}`).toEqual([seat]);
        expect(stakeOf(m.funT ?? []), `${order} · step ${what}`).toBe(CFB_PAPER.fun);
      }
    }
  });

  it("and the day's recorded P/L does not move when the rival's verdict lands", () => {
    for (const order of ["ab", "ba"] as const) {
      const { steps } = sequence(order);
      const pl = steps.map(([, m]) => realizedPL([m], KD4));
      expect(pl[1], `${order}: the seated $25 winner pays 150 − 25`).toBe(125);
      expect(pl[2], `${order}: the rival's bigger payout took the seat and rewrote the day`).toBe(125);
      expect(pl[3], order).toBe(125);
    }
  });

  it("two candidates the day does NOT yet seat are still separated by the money, not by a byte", () => {
    /* both extras arrive from the losing copy in one merge: the base's fun bucket is EMPTY, so
       neither is "already seated" and the payout key is what has to decide. */
    const empty = { sport: "cfb", date: KD4, locked: true, daily: 150, fun: 25, core: [], funT: [], games: {}, grading: { done: true, tickets: {}, legs: {} } } as SyncEntry;
    const two = {
      sport: "cfb", date: KD4, locked: true, daily: 150, fun: 25, core: [], games: {},
      funT: [k4Tix(K4T1, "g1"), k4Tix(K4T2, "g2")],
      grading: { done: false, tickets: { [K4T1]: { result: "won", payout: 90 }, [K4T2]: { result: "won", payout: 210 } }, legs: {} },
    } as SyncEntry;
    for (const m of [mergeLedgers([empty], [two])[0], mergeLedgers([two], [empty])[0]]) {
      expect((m.funT ?? []).map((t) => String(t.id)), "the bigger settled winner must take the scarce seat").toEqual([K4T2]);
    }
  });
});

/* ============================================================================================
 * `allocSum` IS AN ABSOLUTE RESTATEMENT, NOT A DELTA CARRY — INSTRUCTION 45, CLOSING K5
 * (2026-09-06). A MUTATION SURVIVOR, not a live defect.
 *
 * Replacing the absolute restate in `carryMoneyMeta` (`rec[key] = money(sum)` for `allocSum`) with
 * the generic delta carry beside it (`rec[key] = money(cur + delta)`) left all 826 tests green,
 * because every fixture in this file stores an `allocSum` that already EQUALS its own seated core
 * sum — so both implementations answer the same number and no pin can tell them apart.
 *
 * THE FIXTURE BELOW MAKES THEM DIVERGE: a stored `allocSum: 999` on a card carrying $50 of
 * tickets, merged with a copy holding a third $25 ticket. MEASURED this turn against the shipped
 * kernel: `{"ids":[core-1,core-2,core-3],"sum":75,"allocSum":75}` in both orders — the absolute
 * restate. The delta carry would answer 999 + (75 − 50) = 1024, and `decideTopUp`'s
 * `const owed = daily - Number(entry.allocSum ?? 0);` would read a day $874 over its own allotment
 * and never top up again.
 * ========================================================================================== */
describe("`allocSum` is restated from the seated core, not carried by a delta (INSTRUCTION 45, CLOSING K5)", () => {
  const KD5 = "2026-09-05";
  const k5Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const k5Tix = (id: string, g: string, stake: number) => ({ id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [k5Leg(g)] });
  const K5C = (n: number) => `cfb-${KD5}-core-${n}`;
  const k5Day = (core: ReturnType<typeof k5Tix>[], allocSum: number, over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: KD5, locked: true, daily: 150, fun: 25, allocSum, core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /** the base: $50 of tickets under a stored allocSum of 999 — the two DISAGREE */
  const stale = (): SyncEntry => k5Day([k5Tix(K5C(1), "g1", 25), k5Tix(K5C(2), "g2", 25)], 999, { grading: { done: false, tickets: {}, legs: {} } });
  const fuller = (): SyncEntry => k5Day([k5Tix(K5C(1), "g1", 25), k5Tix(K5C(2), "g2", 25), k5Tix(K5C(3), "g3", 25)], 75);

  it("a stored allocSum that contradicts the tickets is RESTATED to the seated core, both orders", () => {
    for (const [m, order] of [
      [mergeLedgers([stale()], [fuller()])[0], "stale,fuller"],
      [mergeLedgers([fuller()], [stale()])[0], "fuller,stale"],
    ] as const) {
      expect(idsOf(m.core), order).toEqual([K5C(1), K5C(2), K5C(3)]);
      expect(stakeOf(m.core), order).toBe(75);
      expect(
        Number((m as { allocSum?: unknown }).allocSum),
        `${order}: the delta carry answers 999 + (75 − 50) = 1024 here; the restatement answers 75`,
      ).toBe(75);
      expect(CFB_PAPER.daily - Number((m as { allocSum?: unknown }).allocSum), `${order}: what the day is owed`).toBe(75);
    }
  });
});

/* ============================================================================================
 * THE MERGED DAY RECORDS THE FUN CEILING THE MERGE ACTUALLY USED — INSTRUCTION 45, CLOSING K6
 * (2026-09-06). The identical twin of defect F4, which `mergeDay` fixed for `daily` and
 * explicitly REPORTED, unfixed, for `fun`: "`fun` HAS THE IDENTICAL TWIN DEFECT and is
 * deliberately NOT fixed here … Out of scope this round; reported, not touched."
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before this fix, on C3's own inflated fixture:
 *   {"fun":100,"daily":150,"funSum":25,"funDropped":["cfb-2026-09-05-zfun-1"]}
 * — `funCap` refused the `fun: 100` claim (the bucket is bounded at CFB_PAPER.fun and the second
 * $25 ticket is on `funDropped`), and the merged day went on publishing `fun: 100` beside the
 * refusal. Every later reader that trusts the field rather than recomputing the cap reads a $100
 * fun day.
 *
 * THE FIX IS F4's, VERBATIM, ON THE OTHER BUCKET: a day that already carries a positive `fun` is
 * restated to the number the cap used; a day that carries none gains no key.
 * ========================================================================================== */
describe("the merged day records the FUN ceiling the merge used (INSTRUCTION 45, CLOSING K6)", () => {
  const KD6 = "2026-09-05";
  const k6Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });
  const k6Fun = (id: string) => ({ id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, confirmed: null, legs: [k6Leg("g1")] });
  const claim6 = (fun: number, id: string, over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: KD6, locked: true, daily: 150, fun, core: [], funT: [k6Fun(id)], games: {}, grading: null, ...over }) as SyncEntry;

  it("an inflated `fun: 100` is not carried onto the merged day, in both merge orders", () => {
    const rich = () => claim6(100, `cfb-${KD6}-afun-1`, { grading: { done: true, tickets: {}, legs: {} } });
    const honest = () => claim6(CFB_PAPER.fun, `cfb-${KD6}-zfun-1`);
    for (const [m, order] of [
      [mergeLedgers([rich()], [honest()])[0], "rich,honest"],
      [mergeLedgers([honest()], [rich()])[0], "honest,rich"],
    ] as const) {
      expect(Number((m as { fun?: unknown }).fun), `${order}: the day published a ceiling the merge refused`).toBe(CFB_PAPER.fun);
      expect(stakeOf(m.funT ?? []), order).toBe(CFB_PAPER.fun);
      expect((m as { funDropped?: string[] }).funDropped, order).toEqual([`cfb-${KD6}-zfun-1`]);
    }
  });

  it("a legitimate LOWER `fun` is still the number recorded, and a day with none gains none", () => {
    const low = () => claim6(10, `cfb-${KD6}-afun-1`, { funT: [{ id: `cfb-${KD6}-afun-1`, bucket: "fun", stake: 10, confirmed: null, legs: [k6Leg("g1")] }], grading: { done: true, tickets: {}, legs: {} } });
    const low2 = () => claim6(10, `cfb-${KD6}-zfun-1`, { funT: [{ id: `cfb-${KD6}-zfun-1`, bucket: "fun", stake: 10, confirmed: null, legs: [k6Leg("g2")] }] });
    for (const m of [mergeLedgers([low()], [low2()])[0], mergeLedgers([low2()], [low()])[0]]) {
      expect(Number((m as { fun?: unknown }).fun), "a lower claim than the desk's own allotment still binds").toBe(10);
    }
    const bare = (id: string, over: Partial<SyncEntry> = {}): SyncEntry =>
      ({ date: KD6, locked: true, core: [], funT: [{ id, bucket: "fun", stake: 25, confirmed: null, legs: [{ lkey: id, label: "HR over", prop: "batter_hits" }] }], ...over }) as SyncEntry;
    const m = mergeLedgers([bare("HR_a", { grading: { done: true, tickets: {}, legs: {} } })], [bare("HR_z")])[0];
    expect(Object.prototype.hasOwnProperty.call(m, "fun"), "the merge minted a `fun` onto a day that never carried one").toBe(false);
  });

  it("the restatement is idempotent", () => {
    const rich = () => claim6(100, `cfb-${KD6}-afun-1`, { grading: { done: true, tickets: {}, legs: {} } });
    const honest = () => claim6(CFB_PAPER.fun, `cfb-${KD6}-zfun-1`);
    const ab = mergeLedgers([rich()], [honest()]);
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [rich()])), "a second sync of the inflated copy raised the ceiling back").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * THE TWO MARKER CHANNELS ARE EXCLUSIVE — INSTRUCTION 45, CLOSING K7 (2026-09-06).
 *
 * `betConflict` and `stakeConflict` answer two different questions — "the two copies mean
 * DIFFERENT BETS by this id" against "the two copies agree about the bet and disagree about the
 * stake" — and `unionCore`'s reconciliation loop `continue`s on a disputed id BEFORE any stake is
 * compared, so a disputed id can never also collect a stake marker. That exclusivity was never
 * pinned, and it is exactly what a reader of the ledger UI relies on: a ticket reported on BOTH
 * channels would be described as a stake refusal on a wager the day does not even hold.
 *
 * The fixture disputes core-1 AND gives its two copies different stakes ($20 against $25), so both
 * channels are live on one id at once.
 * ========================================================================================== */
describe("a rival-disputed id collects NO stake marker (INSTRUCTION 45, CLOSING K7)", () => {
  const KD7 = "2026-09-05";
  const k7Leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const k7Tix = (id: string, g: string, stake: number) => ({ id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [k7Leg(g)] });
  const K7C = (n: number) => `cfb-${KD7}-core-${n}`;
  const k7Day = (core: ReturnType<typeof k7Tix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: KD7, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const device = (): SyncEntry => k7Day([k7Tix(K7C(1), "g9", 20)], { grading: { done: false, tickets: {}, legs: {} } });
  const rival7 = (): SyncEntry => k7Day([k7Tix(K7C(1), "g1", 25), k7Tix(K7C(2), "g2", 25)]);

  it("an id that is BOTH rival-disputed and stake-disagreeing is reported on `betConflict` alone", () => {
    for (const [m, order] of [
      [mergeLedgers([device()], [rival7()])[0], "device,rival"],
      [mergeLedgers([rival7()], [device()])[0], "rival,device"],
    ] as const) {
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([K7C(1)]);
      expect(
        (m as { stakeConflict?: unknown }).stakeConflict,
        `${order}: a disputed id also collected a stake marker — the UI would report a stake refusal on a wager the day does not hold`,
      ).toBeUndefined();
      expect(m.core.find((t) => t.id === K7C(1))?.stake, order).toBe(20);
    }
  });
});

/* ============================================================================================
 * TWO COPIES THAT ARE EACH EXACTLY $150 MERGE TO $170 — INSTRUCTION 45, FINAL K1 (2026-09-06),
 * a REGRESSION of CLOSING K2. Josh verbatim: "Parlay Lab CFB should've been running the same $150
 * per day theoretical Core money and $25 Fun money per day".
 *
 * WHAT WENT WRONG. CLOSING K2 gave the RIVAL branch of the reconciliation an allotment bound —
 * a receipted lift is honoured only while the projected core stays inside `cap` — and left the
 * ORDINARY path unbounded. So the guard became a property of "did some UNRELATED id drift" rather
 * than a property of the ALLOTMENT, which is the thing Josh's sentence is about. Two copies that
 * carry NO rival id anywhere never reach the bound at all.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on the fixture below — two plausible overlapping
 * top-up copies of one date that BOTH sum to exactly CFB_PAPER.daily:
 *   copy A  core-1 g1 $25 (topUp 0) · core-2 g2 $25 (topUp 20, raised from $5) · core-3..6 $25
 *   copy B  core-1 g1 $45 (topUp 20, raised from $25) · core-2 g2 $5 (topUp 0) · core-3..6 $25
 * core-1's pair passes the difference receipt (45 − 25 === 20 − 0) so $45 is seated unbounded, and
 * core-2's pair passes it too (25 − 5 === 20 − 0) so $25 stands and nothing is given back:
 *   {"coreSum":170,"allocSum":170,"capBreach":{"core":{"sum":170,"cap":150}},"stakeConflict":undefined}
 * $20 over Josh's desk with no rival card anywhere, and the ASSERT THE ALLOTMENT block only MARKS
 * the breach after the fact.
 *
 * THE FIX: `projected` is hoisted out of the rival branch and the same bound applies on BOTH paths
 * — a receipted lift is honoured only while `projected + lift <= cap + 1e-6`, and otherwise this
 * card's own stake stands and the refusal is recorded on `conflict` with {kept, refused} exactly as
 * the rival branch records it. The guard is now a property of the allotment.
 * ========================================================================================== */
describe("a receipted raise is bounded by the allotment on the ORDINARY path too (INSTRUCTION 45, FINAL K1)", () => {
  const FD = "2026-09-05";
  const fLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const fTix = (id: string, g: string, stake: number, topUp: number) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, topUp, confirmed: null, legs: [fLeg(g)],
  });
  const C = (n: number) => `cfb-${FD}-core-${n}`;
  const rest = () => [3, 4, 5, 6].map((n) => fTix(C(n), `g${n}`, 25, 0));
  const fDay = (core: ReturnType<typeof fTix>[]): SyncEntry =>
    ({ sport: "cfb", date: FD, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null }) as SyncEntry;
  /** copy A — the residue landed on core-2, raised from $5 to $25. Exactly CFB_PAPER.daily. */
  const copyA = (): SyncEntry => fDay([fTix(C(1), "g1", 25, 0), fTix(C(2), "g2", 25, 20), ...rest()]);
  /** copy B — the same date and the same $150, with the residue on core-1 instead. */
  const copyB = (): SyncEntry => fDay([fTix(C(1), "g1", 45, 20), fTix(C(2), "g2", 5, 0), ...rest()]);
  const orders = () => [
    [mergeLedgers([copyA()], [copyB()])[0], "A,B"],
    [mergeLedgers([copyB()], [copyA()])[0], "B,A"],
  ] as const;

  it("both copies are $150 before the merge", () => {
    expect(stakeOf(copyA().core)).toBe(CFB_PAPER.daily);
    expect(stakeOf(copyB().core)).toBe(CFB_PAPER.daily);
  });

  it("the merged day is still $150, and the refusal is recorded — both orders", () => {
    for (const [m, order] of orders()) {
      expect(stakeOf(m.core), `${order}: the merge staked the day past Josh's $150 with no rival card anywhere`).toBeLessThanOrEqual(
        CFB_PAPER.daily,
      );
      expect(stakeOf(m.core), order).toBe(CFB_PAPER.daily);
      expect((m as { capBreach?: unknown }).capBreach, `${order}: the breach the merge itself manufactured`).toBeUndefined();
      expect((m as { betConflict?: unknown }).betConflict, `${order}: no id names two different bets on this pair`).toBeUndefined();
      const sc = (m as { stakeConflict?: Record<string, { kept: number; refused: number }> }).stakeConflict ?? {};
      expect(Object.keys(sc).length, `${order}: money was refused with no receipt on any channel`).toBe(1);
      const [only] = Object.values(sc);
      expect(only.refused > only.kept, `${order}: the marker must name the larger stake as the refused one`).toBe(true);
      expect(Number((m as { allocSum?: unknown }).allocSum), `${order}: allocSum must restate the seated core`).toBe(stakeOf(m.core));
    }
  });

  it("the bound is order-free and idempotent", () => {
    const ab = mergeLedgers([copyA()], [copyB()]);
    const ba = mergeLedgers([copyB()], [copyA()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [copyA()])), "a second sync moved the stake again").toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [copyB()])), "a second sync moved the stake again").toBe(JSON.stringify(ab));
  });

  /* THE MLB RAIL, the same shape on content-addressed ids and PAPER.daily (INSTRUCTION 45, FINAL
     K5 — the rival machinery's pins were all CFB-shaped). */
  it("the MLB desk is bounded the same way — both orders", () => {
    const MD = "2026-09-01";
    const mLeg = (l: string) => ({ lkey: l, label: "OVER 1.5", prop: "batter_hits", market: "hits", side: "over", line: 1.5, cz: -110 });
    const mTix = (id: string, l: string, stake: number, topUp: number) => ({
      id, bucket: "core", name: "HITS · OVER", stake, topUp, confirmed: null, legs: [mLeg(l)],
    });
    const mRest = () => [3, 4, 5, 6].map((n) => mTix(`p:x${n}`, `l${n}`, 25, 0));
    const mDay = (core: ReturnType<typeof mTix>[]): SyncEntry =>
      ({ date: MD, locked: true, daily: 150, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null }) as SyncEntry;
    const a = (): SyncEntry => mDay([mTix("p:abc", "l1", 25, 0), mTix("p:def", "l2", 25, 20), ...mRest()]);
    const b = (): SyncEntry => mDay([mTix("p:abc", "l1", 45, 20), mTix("p:def", "l2", 5, 0), ...mRest()]);
    expect(stakeOf(a().core)).toBe(PAPER.daily);
    expect(stakeOf(b().core)).toBe(PAPER.daily);
    for (const [m, order] of [
      [mergeLedgers([a()], [b()])[0], "a,b"],
      [mergeLedgers([b()], [a()])[0], "b,a"],
    ] as const) {
      expect(stakeOf(m.core), `${order}: the MLB day was staked past PAPER.daily by an unbounded receipted raise`).toBe(PAPER.daily);
      expect((m as { capBreach?: unknown }).capBreach, order).toBeUndefined();
      expect(Object.keys(((m as { stakeConflict?: Record<string, unknown> }).stakeConflict ?? {})).length, order).toBe(1);
    }
  });
});

/* ============================================================================================
 * THE WITHDRAWAL DELETES THE DAY'S OWN HONEST VERDICT — INSTRUCTION 45, FINAL K2 (2026-09-06),
 * a REGRESSION of CLOSING K1.
 *
 * WHAT WENT WRONG. CLOSING K1 drove the verdict withdrawal off `restaked` UNION `betConflict`, and
 * the `betConflict` half is UNCONDITIONAL. It deletes the verdict standing under a disputed id
 * whoever produced it — including the day's OWN re-grade of the ticket it actually SEATS. So the
 * first merge is right (the rival's imported payout is withdrawn), the grader re-grades the seated
 * bet honestly, and the NEXT sync of the same rival copy deletes that honest verdict again. The day
 * is re-closed and re-opened forever and its `realizedPL` never holds the honest number.
 *
 * MEASURED, BOTH ORDERS, on the fixtures below. CFB 2026-09-05: six merge-after-grade cycles gave
 * done [false × 6] and realizedPL [−25 × 6] against the honest −50. MLB 2026-09-01: four cycles
 * gave −50 against the honest −5 — the whole day's P/L wrong by $45 per sync, flowing through
 * `computeBankroll` into `ticketKelly` and every stake sized after it.
 *
 * THE FIX: the withdrawal is scoped to the verdict actually IN DISPUTE. A `restaked` id is still
 * withdrawn unconditionally (its stake moved, so its own payout is stale). A `betConflict` id is
 * withdrawn only when the verdict now standing came from `other` — the base's OWN graded ticket ids
 * are captured BEFORE the fill-only grading merge, and an id already graded on the base keeps both
 * its verdict and the day's `done`. The rival copy's exclusive leg keys are still dropped in every
 * case; that half was already right.
 * ========================================================================================== */
describe("the day CONVERGES over repeated merge-after-grade cycles (INSTRUCTION 45, FINAL K2)", () => {
  /** the grader's stand-in: every seated ticket without a verdict gets one, then the day closes. */
  const regrade = (e: SyncEntry, verdicts: Record<string, { result: string; payout: number }>): SyncEntry => {
    const tix = { ...((e.grading?.tickets ?? {}) as Record<string, unknown>) };
    for (const t of [...e.core, ...(e.funT ?? [])]) {
      const id = String(t.id);
      if (!(id in tix)) tix[id] = verdicts[id] ?? { result: "lost", payout: 0 };
    }
    return { ...e, grading: { done: true, tickets: tix, legs: { ...((e.grading?.legs ?? {}) as Record<string, unknown>) } } } as SyncEntry;
  };

  describe("the CFB rail", () => {
    const KD = "2026-09-05";
    const kLeg = (g: string) => ({ gkey: g, lkey: `${g}|spread|home|-3`, label: "HOME -3", prop: "SPREAD", market: "spread", side: "home", line: -3, cz: -110 });
    const kTix = (id: string, g: string) => ({ id, bucket: "core", name: "SINGLE · HOME -3", stake: 25, confirmed: null, legs: [kLeg(g)] });
    const KC1 = `cfb-${KD}-core-1`;
    const KC2 = `cfb-${KD}-core-2`;
    const kDay = (core: ReturnType<typeof kTix>[], grading: SyncEntry["grading"]): SyncEntry =>
      ({ sport: "cfb", date: KD, locked: true, daily: 150, fun: 25, core, funT: [], games: {}, grading }) as SyncEntry;
    /** the device copy: core-1 on g1, core-2 graded LOST and done */
    const device = (): SyncEntry =>
      kDay([kTix(KC1, "g1"), kTix(KC2, "g2b")], { done: true, tickets: { [KC2]: { result: "lost", payout: 0 } }, legs: { "g2b|spread|home|-3": { result: "lost" } } });
    /** the server's RIVAL lock: the same positional core-1 on a DIFFERENT game, graded a WINNER */
    const rival = (): SyncEntry =>
      kDay([kTix(KC1, "g2"), kTix(KC2, "g2b")], { done: false, tickets: { [KC1]: { result: "won", payout: 47.73 } }, legs: { "g2|spread|home|-3": { result: "won" } } });

    for (const flip of [false, true]) {
      it(`six merge-after-grade cycles converge on the honest −50 (${flip ? "rival,device" : "device,rival"})`, () => {
        let cur = device();
        const seen: { cycle: number; done: unknown; pl: number }[] = [];
        for (let i = 1; i <= 6; i++) {
          const merged = (flip ? mergeLedgers([rival()], [cur]) : mergeLedgers([cur], [rival()]))[0];
          seen.push({ cycle: i, done: merged.grading?.done, pl: realizedPL([merged], KD) });
          cur = regrade(merged, {});
        }
        /* cycle 1 is CLOSING K1's own behaviour and must not change: the rival's imported $47.73
           verdict IS withdrawn and the day reopens on −25. */
        expect(seen[0], "cycle 1 must still withdraw the rival's imported payout").toEqual({ cycle: 1, done: false, pl: -25 });
        for (const s of seen.slice(1)) {
          expect(s.pl, `cycle ${s.cycle}: the merge deleted the day's OWN honest verdict for the ticket it SEATS`).toBe(-50);
          expect(s.done, `cycle ${s.cycle}: the day is re-opened forever and never holds the honest number`).toBe(true);
        }
        /* and the rival copy's orphan leg key never comes back */
        const last = cur;
        expect(Object.keys((last.grading?.legs ?? {}) as Record<string, unknown>).sort()).toEqual(["g2b|spread|home|-3"]);
        expect((last as { betConflict?: string[] }).betConflict, "the marker itself must survive every cycle").toEqual([KC1]);
      });
    }
  });

  describe("the MLB rail (INSTRUCTION 45, FINAL K5 — the rival machinery is reachable here too)", () => {
    const MD = "2026-09-01";
    const mLeg = (l: string) => ({ lkey: l, label: "OVER 1.5", prop: "batter_hits", market: "hits", side: "over", line: 1.5, cz: -110 });
    const mTix = (id: string, l: string) => ({ id, bucket: "core", name: "HITS · OVER", stake: 50, confirmed: null, legs: [mLeg(l)] });
    const mDay = (core: ReturnType<typeof mTix>[], grading: SyncEntry["grading"]): SyncEntry =>
      ({ date: MD, locked: true, daily: 150, core, funT: [], games: {}, grading }) as SyncEntry;
    const device = (): SyncEntry =>
      mDay([mTix("p:abc", "l1"), mTix("p:def", "l2")], { done: true, tickets: { "p:def": { result: "lost", payout: 0 } }, legs: { l2: { result: "lost" } } });
    const rival = (): SyncEntry =>
      mDay([mTix("p:abc", "l9"), mTix("p:def", "l2")], { done: false, tickets: { "p:abc": { result: "won", payout: 95 } }, legs: { l9: { result: "won" } } });

    for (const flip of [false, true]) {
      it(`four merge-after-grade cycles converge on the honest −5 (${flip ? "rival,device" : "device,rival"})`, () => {
        let cur = device();
        const seen: { cycle: number; done: unknown; pl: number }[] = [];
        for (let i = 1; i <= 4; i++) {
          const merged = (flip ? mergeLedgers([rival()], [cur]) : mergeLedgers([cur], [rival()]))[0];
          seen.push({ cycle: i, done: merged.grading?.done, pl: realizedPL([merged], MD) });
          cur = regrade(merged, { "p:abc": { result: "won", payout: 95 } });
        }
        expect(seen[0], "cycle 1 must still withdraw the rival's imported payout").toEqual({ cycle: 1, done: false, pl: -50 });
        for (const s of seen.slice(1)) {
          expect(s.pl, `cycle ${s.cycle}: the whole day's P/L is wrong by $45 on every sync`).toBe(-5);
          expect(s.done, `cycle ${s.cycle}: the day never closes on its own honest number`).toBe(true);
        }
        expect(Object.keys((cur.grading?.legs ?? {}) as Record<string, unknown>).sort(), "the rival's orphan leg key came back").toEqual(["l2"]);
      });
    }
  });
});

/* ============================================================================================
 * ONE SIGNAL, ONE MEANING — INSTRUCTION 45, FINAL K3 (2026-09-06). THE DECISION, PINNED.
 *
 * `betConflict` was being read two ways in one merge: the reconciliation treats it PER-ID (a rival
 * on one id is not a fact about another — CLOSING K2), while the append pass refuses the whole
 * date's unseen tickets. The two readings are reconcilable, and this is the reading chosen:
 *
 *     NO WAGER CROSSES FROM A DISPUTED COPY ONTO THIS CARD. Money on a wager BOTH copies hold is
 *     reconciled per id, under the allotment.
 *
 * A shared id that passes `sameBet` is ONE wager the two copies both hold, so reconciling its
 * stake moves no wager between cards — and FINAL K1 above now bounds that movement by the
 * allotment on every path, which is the only harm a rival's receipt could do. An id only the other
 * copy holds is a wager on a card the ledger does not keep; seating it would stake the Saturday
 * twice, which the pin "REFUSES the union when the two sides disagree about a shared id — rival
 * locks are never mixed" has required since this union shipped. So the append refusal STAYS, and
 * what makes it survivable is that every refused ticket leaves a receipt (CLOSING K3): named on
 * `coreDropped`, its money on `coreDroppedPL`.
 *
 * The alternative — a per-id append — was measured against the standing pins and rejected: it
 * would seat a rival lock's surplus onto this card, which line 282's pin forbids outright.
 * ========================================================================================== */
describe("one signal, one meaning: no WAGER crosses, money on a SHARED wager still reconciles (FINAL K3)", () => {
  const SD = "2026-09-05";
  const sLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const sTix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [sLeg(g)], ...over,
  });
  const S = (n: number) => `cfb-${SD}-core-${n}`;
  const sDay = (core: ReturnType<typeof sTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: SD, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /** the phone's copy: core-1 and core-2 agreed, core-3 is the drifted id, and nothing unseen */
  const phone = (): SyncEntry =>
    sDay([sTix(S(1), "g1", 25), sTix(S(2), "g2", 25), sTix(S(3), "gA", 25)], { grading: { done: false, tickets: {}, legs: {} } });
  /** the other copy: core-2 legitimately topped up with the receipt that explains it, core-3
      drifted onto another game, and one ticket the phone has never seen */
  const other = (): SyncEntry =>
    sDay([sTix(S(1), "g1", 25), sTix(S(2), "g2", 50, { topUp: 25 }), sTix(S(3), "gB", 25), sTix(`cfb-${SD}-topup1-core-4`, "g4", 25)]);
  const orders = () => [
    [mergeLedgers([phone()], [other()])[0], "phone,other"],
    [mergeLedgers([other()], [phone()])[0], "other,phone"],
  ] as const;

  it("the unseen wager is never seated, and it never leaves without a receipt", () => {
    for (const [m, order] of orders()) {
      expect(m.core.map((t) => String(t.id)), `${order}: a wager from a disputed copy was seated on this card`).toEqual([S(1), S(2), S(3)]);
      expect((m as { coreDropped?: string[] }).coreDropped, `${order}: the refused wager left no receipt`).toEqual([`cfb-${SD}-topup1-core-4`]);
      expect((m as { coreDroppedPL?: Record<string, unknown> }).coreDroppedPL, order).toEqual({
        [`cfb-${SD}-topup1-core-4`]: { result: "pending", payout: 0, stake: 25 },
      });
    }
  });

  /* ------------------------------------------------------------------------------------------
     REWRITTEN — INSTRUCTION 45, FINAL2 K2 (2026-09-06). This `it` was named "money on a wager BOTH
     copies hold is still reconciled, under the allotment" and read, verbatim:

         expect(m.core.find((t) => t.id === S(2))?.stake, `${order}: an unrelated ticket's drift deleted $25 of deployed money`).toBe(50);
         expect(stakeOf(m.core), order).toBe(100);

     on a RIVAL pair. The reading this describe block names — "NO WAGER CROSSES FROM A DISPUTED
     COPY ONTO THIS CARD" — is kept whole and is now applied to the MONEY as well as to the ticket:
     a rival's `topUp` is a claim by another allocator about another card, so its stake does not
     cross either, and the refusal is named on the channel that already exists. The half about
     reconciliation surviving a rival elsewhere is kept as its own `it` below, on the ORDINARY pair
     where a receipt is evidence about the card that wrote it.
     ------------------------------------------------------------------------------------------ */
  it("no MONEY crosses from a disputed copy either — this card's stake stands, and is named", () => {
    for (const [m, order] of orders()) {
      expect(m.core.find((t) => t.id === S(2))?.stake, `${order}: a rival lock's stake crossed onto this card`).toBe(25);
      expect(stakeOf(m.core), order).toBe(75);
      expect(stakeOf(m.core), `${order}: and the reconciliation never carries the card past Josh's $150`).toBeLessThanOrEqual(CFB_PAPER.daily);
      expect((m as { stakeConflict?: unknown }).stakeConflict, `${order}: the refused rival stake left no receipt`).toEqual({
        [S(2)]: { kept: 25, refused: 50 },
      });
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([S(3)]);
      expect(m.core.find((t) => t.id === S(3))?.stake, `${order}: the base's own ticket stands on the disputed id`).toBe(25);
    }
  });

  it("and on an ORDINARY pair the same receipted raise IS reconciled, under the allotment", () => {
    /* the identical fixture with core-3 agreeing, so nothing here is a rival card: the receipt is
       then evidence about THIS card, and every dollar the desk deployed keeps its seat. */
    const agreedPhone = (): SyncEntry =>
      sDay([sTix(S(1), "g1", 25), sTix(S(2), "g2", 25), sTix(S(3), "gA", 25)], { grading: { done: false, tickets: {}, legs: {} } });
    const agreedOther = (): SyncEntry =>
      sDay([sTix(S(1), "g1", 25), sTix(S(2), "g2", 50, { topUp: 25 }), sTix(S(3), "gA", 25)]);
    for (const [m, order] of [
      [mergeLedgers([agreedPhone()], [agreedOther()])[0], "phone,other"],
      [mergeLedgers([agreedOther()], [agreedPhone()])[0], "other,phone"],
    ] as const) {
      expect(m.core.find((t) => t.id === S(2))?.stake, `${order}: a receipted raise the two copies agree about was refused`).toBe(50);
      expect(stakeOf(m.core), order).toBe(100);
      expect((m as { stakeConflict?: unknown }).stakeConflict, order).toBeUndefined();
      expect((m as { betConflict?: unknown }).betConflict, order).toBeUndefined();
    }
  });

  it("the reading is order-free and idempotent", () => {
    const ab = mergeLedgers([phone()], [other()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(mergeLedgers([other()], [phone()])));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [other()]))).toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A RIVAL CARD'S SMALLER STAKE IS ALSO A REFUSAL, AND EVERY REFUSAL LEAVES A RECEIPT —
 * INSTRUCTION 45, FINAL K4 (2026-09-06).
 *
 * WHAT WENT WRONG. `unionCore`'s non-positive-`lift` branch kept this card's own (larger) stake
 * and wrote NOTHING to any marker channel naming the rival stake it refused, so no surface could
 * disclose it. Every other refusal on this rail has carried a receipt
 * since defect K4 of the earlier series: the receiptless disagreement writes `conflict`, the
 * cap-refused rival lift writes `conflict`, the allotment's append refusal writes `dropped` +
 * `droppedPL`, and the rival lock's discarded tickets write both. This branch had none.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on the fixture below (base core-1 @ $50 with
 * `topUp: 25`, the other copy's core-1 @ $25, core-2 naming a DIFFERENT game so the pair is a rival
 * pair): merged core-1 $50, `betConflict ["…core-2"]`, and `stakeConflict` UNDEFINED — $25 the
 * rival card records on the same id, refused in silence.
 *
 * THE RULE, AND WHY THE TWO PATHS DELIBERATELY DIFFER HERE. On an ORDINARY pair the receipt is
 * evidence: `stake − topUp` is one allocator sizing shared by both copies, so a smaller stale copy
 * is not a refusal at all and marking it would be false (and would make N3/CLOSING-K2's
 * idempotency pins report a refusal on every re-sync of a stale copy). On a RIVAL pair the F2
 * docblock at the head of `unionCore` already settles it — when a shared id names two different
 * bets the copies are two locks, not two views, and a stamp written by one is a claim by ANOTHER
 * allocator about ANOTHER card — so the two stakes are two cards' answers, this card's stands, and
 * the other is REFUSED and must be named. That is the same {kept, refused} shape the rival branch
 * already writes when the lift is positive and the allotment refuses it.
 * ========================================================================================== */
describe("a rival card's smaller stake is refused WITH a receipt (INSTRUCTION 45, FINAL K4)", () => {
  const QD = "2026-09-05";
  const qLeg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const qTix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [qLeg(g)], ...over,
  });
  const Q = (n: number) => `cfb-${QD}-core-${n}`;
  const qDay = (core: ReturnType<typeof qTix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: QD, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;

  /** the two fixtures differ in ONE field: whether core-2 names one game or two. */
  const big = (g2: string): SyncEntry =>
    qDay([qTix(Q(1), "g1", 50, { topUp: 25 }), qTix(Q(2), g2, 25)], { grading: { done: false, tickets: {}, legs: {} } });
  const small = (g2: string): SyncEntry => qDay([qTix(Q(1), "g1", 25), qTix(Q(2), g2, 25)]);
  const orders = (gb: string, gs: string) => [
    [mergeLedgers([big(gb)], [small(gs)])[0], "big,small"],
    [mergeLedgers([small(gs)], [big(gb)])[0], "small,big"],
  ] as const;

  it("on a RIVAL pair the refused stake is NAMED — both orders", () => {
    for (const [m, order] of orders("gA", "gB")) {
      expect(m.core.find((t) => t.id === Q(1))?.stake, `${order}: this card's own stake must stand on a rival pair`).toBe(50);
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([Q(2)]);
      expect(
        (m as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        `${order}: the rival card's $25 on this id was refused with nothing on any channel naming it`,
      ).toEqual({ [Q(1)]: { kept: 50, refused: 25 } });
      expect(stakeOf(m.core), order).toBe(75);
    }
  });

  it("on an ORDINARY pair the receipt EXPLAINS the gap, so there is no refusal to name", () => {
    for (const [m, order] of orders("g2", "g2")) {
      expect(m.core.find((t) => t.id === Q(1))?.stake, order).toBe(50);
      expect((m as { betConflict?: unknown }).betConflict, order).toBeUndefined();
      expect(
        (m as { stakeConflict?: unknown }).stakeConflict,
        `${order}: a stale smaller copy of ONE card's own ticket is not a refusal and must not be marked`,
      ).toBeUndefined();
      expect(stakeOf(m.core), order).toBe(75);
    }
  });

  it("the receipt is order-free and idempotent", () => {
    const ab = mergeLedgers([big("gA")], [small("gB")]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(mergeLedgers([small("gB")], [big("gA")])));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [small("gB")])), "a second sync of the rival copy moved the marker").toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [big("gA")]))).toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * THE ALLOTMENT BOUND MUST MEASURE THE MERGED DAY — INSTRUCTION 45, FINAL2 K1 (2026-09-06), a
 * REGRESSION of FINAL K1. Josh verbatim: "Parlay Lab CFB should've been running the same $150 per
 * day theoretical Core money and $25 Fun money per day".
 *
 * FINAL K1 bounded the ordinary receipted raise by the allotment, which was right in intent. It
 * measured the bound against a RUNNING value seeded with the base's own stakes — so an id the
 * reconciliation has not reached yet, and is about to LOWER, was still counted at its old stake
 * while an earlier id's lift was being judged. A raise the merged day plainly has room for was
 * therefore refused, and the day came out UNDER the $150 Josh asked for: the same instruction
 * missed from the other side.
 *
 * MEASURED THROUGH `mergeLedgers` before the fix, on two copies of 2026-09-05 that BOTH hold
 * exactly CFB_PAPER.daily and carry no rival id anywhere:
 *   {"coreSum":130,"stakes":[25,30,25,25,25],
 *    "stakeConflict":{"cfb-2026-09-05-core-1":{"kept":25,"refused":45},
 *                     "cfb-2026-09-05-core-2":{"kept":30,"refused":50}}}
 * — $20 of money the desk deployed, deleted from the record, and a refusal marker on core-1 that
 * names a raise the day could afford.
 *
 * THE FIX: the bound measures what the merged day will ACTUALLY hold. The reconciliation's floor —
 * the stake every shared id settles on if no lift is granted — is summed BEFORE the loop runs, and
 * each lift is judged against that floor plus the lifts already granted. Since a lift is the only
 * upward move the pass makes, that sum IS the merged core, so "refuse only when the final total
 * would breach" is exactly what the gate now asks.
 * ========================================================================================== */
describe("a receipted raise the MERGED day has room for is not refused (INSTRUCTION 45, FINAL2 K1)", () => {
  const D = "2026-09-05";
  const leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const tix = (id: string, g: string, stake: number, topUp: number) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, topUp, confirmed: null, legs: [leg(g)],
  });
  const C = (n: number) => `cfb-${D}-core-${n}`;
  const rest = () => [3, 4, 5].map((n) => tix(C(n), `g${n}`, 25, 0));
  const mk = (core: ReturnType<typeof tix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: D, locked: true, daily: 150, fun: 25, allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  /** the phone: core-2 still at the $50 its lock sized, and it GRADED the day — so it is the base */
  const phone = (): SyncEntry =>
    mk([tix(C(1), "g1", 25, 0), tix(C(2), "g2", 50, 0), ...rest()], { grading: { done: true, tickets: {}, legs: {} } });
  /** the server after the residue fire: core-1 lifted 25 -> 45 WITH the receipt, core-2 re-sized to 30 */
  const server = (): SyncEntry => mk([tix(C(1), "g1", 45, 20), tix(C(2), "g2", 30, 0), ...rest()]);
  const orders = () => [
    [mergeLedgers([phone()], [server()])[0], "phone,server"],
    [mergeLedgers([server()], [phone()])[0], "server,phone"],
  ] as const;

  it("both copies hold exactly the allotment before the merge", () => {
    expect(stakeOf(phone().core)).toBe(CFB_PAPER.daily);
    expect(stakeOf(server().core)).toBe(CFB_PAPER.daily);
  });

  it("the merged day is EXACTLY the allotment — neither over nor under, both orders", () => {
    for (const [m, order] of orders()) {
      expect(stakeOf(m.core), `${order}: the merged day is not the $150 both copies hold`).toBe(CFB_PAPER.daily);
      expect(m.core.find((t) => t.id === C(1))?.stake, `${order}: a raise the merged day has room for was refused`).toBe(45);
      expect(m.core.find((t) => t.id === C(1))?.topUp, `${order}: the receipt must travel with the stake it explains`).toBe(20);
      expect(m.core.find((t) => t.id === C(2))?.stake, `${order}: the receiptless disagreement must still settle on the smaller`).toBe(30);
      expect((m as { capBreach?: unknown }).capBreach, `${order}: the merge manufactured a breach`).toBeUndefined();
      expect(Number((m as { allocSum?: unknown }).allocSum), `${order}: allocSum must restate the seated core`).toBe(stakeOf(m.core));
    }
  });

  it("only the receiptless id is marked refused — the affordable raise is not", () => {
    for (const [m, order] of orders()) {
      expect((m as { stakeConflict?: Record<string, unknown> }).stakeConflict, order).toEqual({ [C(2)]: { kept: 30, refused: 50 } });
      expect((m as { betConflict?: unknown }).betConflict, `${order}: no id names two different bets on this pair`).toBeUndefined();
    }
  });

  it("the bound is order-free and idempotent", () => {
    const ab = mergeLedgers([phone()], [server()]);
    const ba = mergeLedgers([server()], [phone()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [phone()])), "a second sync moved the stake again").toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [server()])), "a second sync moved the stake again").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * A RIVAL LOCK'S STAKE NEVER CROSSES ONTO THIS CARD — INSTRUCTION 45, FINAL2 K2 (2026-09-06), a
 * REGRESSION of CLOSING K2.
 *
 * `unionCore`'s own F2 docblock states the rule this series has held since it shipped: when a
 * shared id names two different bets the two copies are two LOCKS and not two views of one card,
 * so nothing crosses between them and every refusal leaves a receipt. FINAL K4 made the rival
 * pair's SMALLER stake a marked refusal for exactly that reason. But CLOSING K2 had already
 * carved the LARGER stake out of the same rule: on a rival pair a receipted lift was seated
 * whenever it happened to fit under the allotment, and — because the seating branch writes no
 * marker — with nothing on any channel to disclose it.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before the fix, on CLOSING K2's own fixture (the
 * phone's card against a server lock whose `topup1-core-4` names a different game):
 *   {"stakes":[25,50,25,25],"sum":125,"stakeConflict":undefined,
 *    "betConflict":["cfb-2026-09-05-topup1-core-4"]}
 * — $25 the device never placed recorded on the phone's card, sourced from a `topUp` stamp written
 * by another lock's allocator about another card, and no surface anywhere says so.
 *
 * THE FIX IS THE RULE ALREADY WRITTEN DOWN: a rival pair reconciles NOTHING. This card's own stake
 * stands whichever way the difference points, and the refusal is named on `conflict` with the same
 * {kept, refused} shape the rival branch has recorded since F2 — so the disagreement is disclosed
 * instead of being settled silently in the rival's favour.
 *
 * CLOSING K2's CONTROL — the same two cards with no rival id at all — is UNCHANGED and still
 * required below: an ordinary receipted raise the day can afford is honoured, at $125, unmarked.
 * ========================================================================================== */
describe("a rival lock's receipted stake is refused and NAMED, not seated (INSTRUCTION 45, FINAL2 K2)", () => {
  const D = "2026-09-05";
  const leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const tix = (id: string, g: string, stake: number, over: Record<string, unknown> = {}) => ({
    id, bucket: "core", name: "SINGLE · HOME ML", stake, confirmed: null, legs: [leg(g)], ...over,
  });
  const C = (n: number) => `cfb-${D}-core-${n}`;
  const T4 = `cfb-${D}-topup1-core-4`;
  const mk = (core: ReturnType<typeof tix>[], over: Partial<SyncEntry> = {}): SyncEntry =>
    ({ sport: "cfb", date: D, locked: true, daily: 150, fun: 25, source: "server-lock", allocSum: stakeOf(core), core, funT: [], games: {}, grading: null, ...over }) as SyncEntry;
  const phone = (g4: string): SyncEntry =>
    mk([tix(C(1), "g1", 25), tix(C(2), "g2", 25), tix(C(3), "g3", 25), tix(T4, g4, 25)], { grading: { done: false, tickets: {}, legs: {} } });
  const server = (g4: string): SyncEntry =>
    mk([tix(C(1), "g1", 25), tix(C(2), "g2", 50, { topUp: 25 }), tix(C(3), "g3", 25), tix(T4, g4, 25)]);
  const pairs = (gp: string, gs: string) => [
    [mergeLedgers([phone(gp)], [server(gs)])[0], "phone,server"],
    [mergeLedgers([server(gs)], [phone(gp)])[0], "server,phone"],
  ] as const;

  it("on a RIVAL pair this card's own $25 stands and the refusal is named — both orders", () => {
    for (const [m, order] of pairs("gA", "gB")) {
      expect(m.core.find((t) => t.id === C(2))?.stake, `${order}: a rival lock's stake crossed onto this card because it fit`).toBe(25);
      expect(m.core.find((t) => t.id === C(2))?.topUp, `${order}: and so did the receipt that explains it`).toBeUndefined();
      expect(stakeOf(m.core), order).toBe(100);
      expect(
        (m as { stakeConflict?: Record<string, unknown> }).stakeConflict,
        `${order}: money that moved between two rival locks left no receipt on any channel`,
      ).toEqual({ [C(2)]: { kept: 25, refused: 50 } });
      expect((m as { betConflict?: string[] }).betConflict, order).toEqual([T4]);
      expect(Number((m as { allocSum?: unknown }).allocSum), order).toBe(stakeOf(m.core));
    }
  });

  it("the CONTROL is untouched: with no rival id the receipted raise is honoured, unmarked", () => {
    for (const [m, order] of pairs("gA", "gA")) {
      expect(m.core.find((t) => t.id === C(2))?.stake, `${order}: a receipted raise the two copies AGREE about is the desk's own money`).toBe(50);
      expect(stakeOf(m.core), order).toBe(125);
      expect((m as { stakeConflict?: unknown }).stakeConflict, order).toBeUndefined();
      expect((m as { betConflict?: unknown }).betConflict, order).toBeUndefined();
    }
  });

  it("the refusal is order-free and idempotent", () => {
    for (const [gp, gs] of [["gA", "gA"], ["gA", "gB"]] as const) {
      const ab = mergeLedgers([phone(gp)], [server(gs)]);
      const ba = mergeLedgers([server(gs)], [phone(gp)]);
      expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
      expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [server(gs)])), "a second sync of the rival card moved the stake after all").toBe(JSON.stringify(ab));
      expect(JSON.stringify(mergeLedgers(ab, [phone(gp)]))).toBe(JSON.stringify(ab));
    }
  });
});

/* ============================================================================================
 * A STALE VOID MUST NOT DESTROY A CORRECTED VERDICT — INSTRUCTION 45, FINAL2 K3 (2026-09-06),
 * inherited; found independently by two critics.
 *
 * `pickBase`'s last two tiebreaks are the SERIALISED BYTE LENGTH of the entry and then a raw JSON
 * byte comparison. Neither is a fact about how well-settled a day is. A copy graded
 * `{"result":"ungradable","payout":0}` serialises THREE BYTES LONGER than the same day graded
 * `{"result":"won","payout":47.73}`, so a stale 48-hour VOID copy is seated as the base — and the
 * fill-only ticket map — a bare spread of the other copy's tickets under ours — then keeps the
 * base's non-verdict over the honest one. The corrected grade is destroyed in BOTH merge orders,
 * because `pickBase` answers the same way in either.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before the fix:
 *   {"result":"ungradable","payout":0,"note":"stale"}
 * — the day is closed (`done: true`) on a void for a ticket another copy has settled as a $47.73
 * winner, and no later merge can recover it: `ungradable` re-wins the same tiebreak every time.
 *
 * THE FIX IS NOT IN `pickBase`. Reordering the base choice moves every merge in the tree; the harm
 * here is specific and so is the correction. `RESOLVED` is already this module's own name for the
 * three verdicts that are a SETTLEMENT ("`pending` / `ungradable` are the absence of one"), and the
 * ticket-map merge is the one place that reads a grading record as if a non-verdict were one. A
 * settlement now fills over the ABSENCE of a settlement, in either direction; two settlements that
 * disagree are still decided by the base, exactly as before. The ids in `betConflict` are excluded,
 * because importing a rival card's verdict is the harm CLOSING K1 exists to prevent.
 * ========================================================================================== */
describe("a stale VOID never destroys a corrected verdict (INSTRUCTION 45, FINAL2 K3)", () => {
  const D = "2026-09-05";
  const ID = `cfb-${D}-core-1`;
  const leg = { gkey: "g1", lkey: "g1|ml|home|", label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 };
  const mk = (note: string, verdict: Record<string, unknown>): SyncEntry =>
    ({
      sport: "cfb", date: D, locked: true, daily: 150, fun: 25, note, allocSum: 25,
      core: [{ id: ID, bucket: "core", name: "SINGLE · HOME ML", stake: 25, confirmed: null, legs: [leg] }],
      funT: [], games: {}, grading: { done: true, tickets: { [ID]: verdict }, legs: { "g1|ml|home|": { result: "won" } } },
    }) as SyncEntry;
  /** the 48-hour VOID copy — three bytes longer, so `pickBase` seats it as the base */
  const stale = () => mk("stale", { result: "ungradable", payout: 0 });
  /** the same day, corrected: the box score landed and the ticket settled a $47.73 winner */
  const fixed = () => mk("fixed", { result: "won", payout: 47.73 });
  const orders = () => [
    [mergeLedgers([stale()], [fixed()])[0], "stale,fixed"],
    [mergeLedgers([fixed()], [stale()])[0], "fixed,stale"],
  ] as const;

  it("the VOID copy really is the one `pickBase` seats — otherwise this fixture proves nothing", () => {
    for (const [m, order] of orders()) {
      expect(JSON.stringify(stale()).length, "the void copy must be the LONGER serialisation").toBeGreaterThan(JSON.stringify(fixed()).length);
      expect((m as { note?: string }).note, `${order}: the base is no longer the void copy`).toBe("stale");
    }
  });

  it("the corrected $47.73 verdict survives the stale void — both orders", () => {
    for (const [m, order] of orders()) {
      const v = (m.grading?.tickets ?? {})[ID] as { result?: string; payout?: number } | undefined;
      expect(v?.result, `${order}: a stale void destroyed a corroborated correction`).toBe("won");
      expect(v?.payout, order).toBe(47.73);
    }
  });

  it("two SETTLEMENTS that disagree are still decided by the base, not by this rule", () => {
    const won = () => mk("won", { result: "won", payout: 47.73 });
    const lost = () => mk("lost", { result: "lost", payout: 0 });
    for (const m of [mergeLedgers([won()], [lost()]), mergeLedgers([lost()], [won()])]) {
      const base = (m[0] as { note?: string }).note;
      const v = (m[0].grading?.tickets ?? {})[ID] as { result?: string } | undefined;
      expect(v?.result, "a settled verdict was overwritten by another settled verdict").toBe(base === "won" ? "won" : "lost");
    }
  });

  it("the correction is order-free and idempotent", () => {
    const ab = mergeLedgers([stale()], [fixed()]);
    const ba = mergeLedgers([fixed()], [stale()]);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
    expect(JSON.stringify(mergeLedgers(ab, ab))).toBe(JSON.stringify(ab));
    expect(JSON.stringify(mergeLedgers(ab, [stale()])), "a later sync of the stale copy re-voided the win").toBe(JSON.stringify(ab));
  });
});

/* ============================================================================================
 * THE GRADING LEG MAP MERGES IN THE SAME DIRECTION AS THE TICKET MAP — INSTRUCTION 45, FINAL2 K5
 * (2026-09-06). MUTATION SURVIVOR R8b: reversing the leg-map spread in `mergeDay`, so that the
 * OTHER copy's legs land last and win, passed the whole tree. The ticket-map direction is
 * pinned in several places; the LEG-map direction was pinned nowhere. The code is correct — this is
 * the missing pin, not a fix.
 *
 * The rule the code implements, and that these two assertions require together: a leg key BOTH
 * copies grade keeps the BASE's verdict, and a leg key only the OTHER copy holds still crosses.
 * The base is fixed by `clvCount`, which outranks the byte length and does not touch grading.
 * ========================================================================================== */
describe("the grading LEG map is base-over-other, and the loser's extra legs still cross (FINAL2 K5)", () => {
  const D = "2026-09-05";
  const ID = `cfb-${D}-core-1`;
  const leg = (g: string) => ({ gkey: g, lkey: `${g}|ml|home|`, label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });
  const mk = (note: string, legs: Record<string, unknown>, over: Partial<SyncEntry> = {}): SyncEntry =>
    ({
      sport: "cfb", date: D, locked: true, daily: 150, fun: 25, note, allocSum: 25,
      core: [{ id: ID, bucket: "core", name: "SINGLE · HOME ML", stake: 25, confirmed: null, legs: [leg("g1"), leg("g2")] }],
      funT: [], games: {}, grading: { done: false, tickets: { [ID]: { result: "pending", payout: 0 } }, legs },
      ...over,
    }) as SyncEntry;
  /** the base — one CLV sighting, which outranks every tiebreak below it and grades no leg */
  const base = () => mk("base", { "g1|ml|home|": { result: "won" } }, { clv: { "g1|ml|home|": { am: -110, at: 1757100000000 } } });
  /** the loser — the SAME leg key graded differently, plus one leg the base never saw */
  const loser = () => mk("loser", { "g1|ml|home|": { result: "lost" }, "g2|ml|home|": { result: "won" } });
  const orders = () => [
    [mergeLedgers([base()], [loser()])[0], "base,loser"],
    [mergeLedgers([loser()], [base()])[0], "loser,base"],
  ] as const;

  it("the CLV copy really is the base — otherwise this fixture proves nothing", () => {
    for (const [m, order] of orders()) expect((m as { note?: string }).note, order).toBe("base");
  });

  it("a leg BOTH copies grade keeps the base's verdict, and the loser's extra leg still crosses", () => {
    for (const [m, order] of orders()) {
      const legs = (m.grading?.legs ?? {}) as Record<string, { result?: string }>;
      expect(legs["g1|ml|home|"]?.result, `${order}: the leg map merged the wrong way round`).toBe("won");
      expect(legs["g2|ml|home|"]?.result, `${order}: a leg only the losing copy graded was dropped`).toBe("won");
    }
  });
});
