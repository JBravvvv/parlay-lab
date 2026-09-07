"use client";

import { useSyncExternalStore } from "react";
import { todayExposure, validateBankStore, type BankStore } from "@/lib/bankroll";
import { mergeLedgers, validateLedger } from "@/lib/ledger-merge";
import { CFB_BANK_BASE, CFB_KEYS, CFB_PAPER } from "./rules";
import { cfbBankroll, cfbLedgerStats, lockCfbCard } from "./ledger";
import { gradeCfbEntry } from "./grade";
import type { CfbBoard, CfbCard, CfbFinals, CfbLedgerEntry, CfbTicket } from "./types";

/**
 * THE CFB DEVICE STORE (INSTRUCTION 38, 2026-09-05, Josh: "Ledger & Allotted $ for College
 * Football should be separate"). The College Football ledger and bank live under their OWN
 * two localStorage keys (CFB_KEYS) — never the MLB desk's — with the same shape rules the MLB
 * record follows: append-only by date, a lock is once per date, grades overlay, sync merges.
 *
 * Every storage access is guarded, so the pure helpers import cleanly on the server and under
 * vitest's node environment (no localStorage → read as empty, write reports false) and a
 * private-mode browser that throws on access behaves the same way.
 *
 * `useCfbLedger()` is a useSyncExternalStore hook with an EMPTY server snapshot: the first
 * client render matches the SSR HTML, then React swaps in the device's record (the mount gate).
 * Nothing here computes a price or a grade — locking and grading are the pure functions in
 * ./ledger and ./grade; this module only stores what they return.
 */

export const CFB_CHANGE_EVENT = "pl:cfb-ledger-change";
/** dispatched by ./sync after a cloud merge rewrote the device record */
export const CFB_SYNC_EVENT = "pl:cfb-ledger-sync";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CfbGrading = NonNullable<CfbLedgerEntry["grading"]>;
export type CfbStats = ReturnType<typeof cfbLedgerStats>;

/** The un-persisted bank: base $2,500 with P/L counted from the paper start. The CFB record
    cannot hold a day before CFB_PAPER.since, so this window is exact — a device that first
    opens the desk a week in still counts every graded Saturday (mergeBankStores keeps the
    EARLIER asOf anyway, so every synced device converges here). */
const DEFAULT_BANK: BankStore = { base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] };

/* ---------- guarded storage ---------- */

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function rawItem(key: string): string {
  const s = storage();
  if (!s) return "";
  try {
    return s.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function setRaw(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to remove, or storage sealed */
  }
}

/** The raw stored strings — ./sync's change detector compares these between ticks. */
export function readCfbRaw(): { ledger: string; bank: string } {
  return { ledger: rawItem(CFB_KEYS.ledger), bank: rawItem(CFB_KEYS.bank) };
}

let version = 0;
function bump(): void {
  version++;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CFB_CHANGE_EVENT));
}

/* ---------- entries ---------- */

export function isCfbEntry(x: unknown): x is CfbLedgerEntry {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const e = x as Partial<CfbLedgerEntry>;
  return e.sport === "cfb" && typeof e.date === "string" && DATE_RE.test(e.date) && e.locked === true && Array.isArray(e.core);
}

function sortByDate(entries: CfbLedgerEntry[]): CfbLedgerEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Only CFB entries, funT defaulted, ascending by date. Anything else on the wire is dropped. */
export function cfbEntriesOf(x: unknown): CfbLedgerEntry[] {
  if (!Array.isArray(x)) return [];
  return sortByDate(x.filter(isCfbEntry).map((e) => (Array.isArray(e.funT) ? e : { ...e, funT: [] })));
}

export function readCfbLedger(): CfbLedgerEntry[] {
  const raw = rawItem(CFB_KEYS.ledger);
  if (!raw) return [];
  try {
    return cfbEntriesOf(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Replaces the device record. Returns false when the device could not persist it. */
export function writeCfbLedger(entries: CfbLedgerEntry[]): boolean {
  const ok = setRaw(CFB_KEYS.ledger, JSON.stringify(cfbEntriesOf(entries)));
  bump();
  return ok;
}

export function findCfbEntry(date: string): CfbLedgerEntry | null {
  return readCfbLedger().find((e) => e.date === date) ?? null;
}

/* THE TWO SETS ARE DIFFERENT QUESTIONS (INSTRUCTION 45, 2026-09-06), and conflating them was the
   bug on this device path. SETTLED answers "may this verdict be overwritten": won / lost / push is
   a scored result and an incoming copy must never replace one this phone already graded. RESOLVED
   answers "can anything further be learned about this ticket": that ALSO includes `ungradable` —
   the void ANY leg still pending 48 h past its kickoff becomes, whatever status ESPN last
   reported for the game (CFB_UNGRADABLE_MS, ./grade). WIDENED 2026-09-06 (INSTRUCTION 45, DEFECT
   I(a)) and re-read in ./grade `gradeCfbEntry` this turn to say what is TRUE rather than what
   used to be: the escalation tests the CLOCK ALONE — `r.result === "pending" && now -
   kickoffOf(...) > CFB_UNGRADABLE_MS`, with no test on status at all — so a game ESPN leaves
   sitting at `live` after a suspension, or at `upcoming` after its event was rescheduled off the
   date, becomes a void exactly like a postponed or cancelled one.

   A VOID IS PROVISIONAL, NOT FINAL, and this paragraph used to say the opposite (INSTRUCTION 45,
   2026-09-06, defect V3): it read "no later read of any scoreboard turns a void into a score",
   which is a claim about the world and is false — a game suspended for weather and resumed 50
   hours later really does get a final. What is true is narrower and is what the code implements:
   a void is RESOLVED **for the purpose of stopping the poke**. `done` may finish over it, so the
   CFB Ledger tab stops re-grading a day it can learn nothing more from today and the server settle
   pass stops burning a scoreboard read on it every tick. It is NOT settled, and that is deliberate:
   `overlayGrading` below does NOT hold `ungradable` closed on the SETTLED set, so a later `won` /
   `lost` / `push` — from this device's own grader once ESPN posts the final, or from a copy
   syncing down — can still overwrite a void. WIDENED 2026-09-06 (INSTRUCTION 45, defect B3) from
   "guards on `settled(...)` alone", which is what this line used to say and is no longer true:
   that later verdict must now be CORROBORATED — every leg of the ticket settled in the incoming
   leg map — exactly as `overlayCfbGrading` (src/lib/cfb/lock-server.ts) already demanded of the
   server pass. A void is still provisional; what changed is the evidence it takes to end one. The server keeps such a date readable for a bounded window
   (CFB_VOID_RECHECK_MS, ./rules; the gate is `cfbSettleCandidate` in src/lib/cfb/lock-server.ts),
   which is the mechanism that gets that late verdict fetched at all. src/lib/cfb/lock-server.ts
   holds the same two sets for the server pass. */
const SETTLED = new Set(["won", "lost", "push"]);
const RESOLVED = new Set(["won", "lost", "push", "ungradable"]);
const settled = (r: string | undefined) => r != null && SETTLED.has(r);
const resolved = (r: string | undefined) => r != null && RESOLVED.has(r);

/**
 * THE OVERLAY RULE, DEVICE SIDE (INSTRUCTION 45, 2026-09-06). This is the phone's copy of the
 * rule; `overlayCfbGrading` in src/lib/cfb/lock-server.ts is the server's, and the two MUST stay
 * in step — the server writes the money, this decides what the CFB Ledger tab shows for it. They
 * are separate functions on purpose: this file is `"use client"` and owns localStorage, so a
 * server route importing it would drag the device store into a request handler.
 *
 * A SETTLED result is never overwritten; a pending or missing verdict takes the incoming one; an
 * `ungradable` one takes it only when the incoming copy CORROBORATES it (see the block inside the
 * body). `done` is recomputed from the ENTRY's own tickets, so it can never claim more than
 * the merged map holds — and it counts a ticket RESOLVED when it is won, lost, push OR ungradable,
 * the same rule `gradeCfbEntry` applies with `result !== "pending"` (./grade).
 *
 * WHAT WENT WRONG HERE, twice, and both halves were one defect wearing two hats:
 *
 *   (a) `done` used to be computed with `settled(...)`. A postponed game grades `ungradable`, and
 *       nothing this device can do — re-grading the same finals map, or grading it again tomorrow
 *       — turns that verdict into a scored one, so such a day could NEVER reach `done` on the
 *       phone: the CFB Ledger tab kept re-grading a day it could learn nothing more from, and the
 *       device's `done` permanently disagreed with the server's — the same starvation the settle
 *       pass hit server-side. The desk's own answer for a void is to print it beside the record
 *       (src/components/cfb/CfbLedger.tsx), not to wait on it.
 *
 *       THAT IS NOT THE SAME AS "the verdict can never change" — an earlier revision of this line
 *       said a void "can never become anything else", and the code says otherwise (INSTRUCTION 45,
 *       2026-09-06, defect V3). This function's overwrite guard is NOT `resolved(...)`: an
 *       `ungradable` sitting in the map is replaced when a `won` / `lost` / `push` arrives that
 *       the incoming copy CORROBORATES — every leg of that ticket settled in its leg map — whether
 *       from this device's grader once ESPN finally posts the score (./grade `gradeCfbEntry`
 *       grades a leg with a real final from the final and never reaches the 48-hour escalation) or
 *       from a synced copy. `done: true` over a void therefore means "nothing more to compute from
 *       what we hold now", not "closed for ever". (The bare `settled(...)` test this paragraph
 *       used to describe was defect B3 — see the corroboration block in the body.)
 *
 *   (b) `if (!cur) return inc` bypassed the whole rule on a first pass, so `done` came from
 *       `gradeCfbEntry` when no grading existed yet and from this function on every later pass.
 *       The same day was therefore finished or unfinished according to whether an earlier pass
 *       happened to have run — an order-dependent verdict on money. The clause is gone: an absent
 *       `cur` is simply an empty one, the same rule runs on every pass, and overlaying twice
 *       equals overlaying once (pinned in tests/cfb-store-convergence.test.ts).
 */
function overlayGrading(cur: CfbGrading | null | undefined, inc: CfbGrading | null | undefined, entry: CfbLedgerEntry): CfbGrading | null {
  if (!inc) return cur ?? null;
  /**
   * A VOID IS REPLACED ONLY BY A CORROBORATED FINAL — ON THE PHONE TOO (INSTRUCTION 45,
   * 2026-09-06, defect B3). A DUPLICATE, BY NAME: this is `overlayCfbGrading`'s own block in
   * src/lib/cfb/lock-server.ts, copied line for line rather than shared, for the reason that
   * function's docblock already gives for the whole overlay being a hand-kept twin — this file is
   * `"use client"` and owns localStorage, and lock-server.ts imports @/lib/cfb/card and
   * @/lib/cfb/ledger, so neither side can import the other without dragging a request handler into
   * the device store or the device store into a request handler. Carried forward as a KNOWN
   * duplication: the two copies are kept honest by tests/cfb-store-convergence.test.ts, which
   * drives PARTIAL, MISSING-key and FULL incomings past BOTH overlays and asserts they answer the
   * same thing, so a change to one that is not made to the other fails.
   *
   * WHAT WENT WRONG: the gate shipped on the SERVER overlay only, and this loop read
   * `if (g && !settled(tickets[id]?.result)) tickets[id] = g;` — `ungradable` is not in SETTLED,
   * so ANY incoming verdict overwrote a void with no leg corroboration at all. The asymmetry is
   * ONE-WAY PERMANENT, which is what makes it money: a two-leg ticket voids at 48 h (leg A
   * final-lost but not yet in the payload, leg B never final); the phone re-grades from a PARTIAL
   * finals payload and writes `lost`, which IS settled; the server's next settle pass then reads
   * `isSettled(stored)` true and its OWN corroborated final can never replace it. The stake is
   * scored against a verdict the server refused to accept from the same evidence.
   *
   * The test is the incoming LEG map, not a re-derivation: `gradeCfbLeg` (./grade) returns won /
   * lost / push only for a game ESPN reported `final` with both scores finite, so "every leg
   * settled in the incoming legs map" reads that condition off what the grader itself computed. A
   * leg-level push IS corroboration — it comes from a real final. A LEGLESS ticket is not
   * corroborated by anything (`settle` hands one a push through its `stood === 0` arm), which is
   * why an empty leg list returns false. What it costs, stated rather than buried: a parlay with
   * one genuinely lost leg and one leg that never finalises stays a $0 void instead of being
   * booked at −stake — the conservative direction, and `ticketPL` (src/lib/bankroll.ts) scores it
   * 0 either way until the missing game finalises, at which point the whole ticket IS corroborated
   * and the real verdict lands. The LEG map below is deliberately NOT gated: a leg verdict is not
   * money, it is what src/components/cfb/CfbTicketCard.tsx prints.
   */
  const legsOf = new Map<string, CfbLedgerEntry["core"][number]["legs"]>();
  for (const t of [...entry.core, ...(entry.funT ?? [])]) legsOf.set(t.id, t.legs ?? []);
  const corroborated = (id: string): boolean => {
    const ls = legsOf.get(id);
    if (!ls?.length) return false;
    return ls.every((l) => settled(inc.legs?.[l.lkey]?.result));
  };
  const tickets = { ...(cur?.tickets ?? {}) };
  for (const [id, g] of Object.entries(inc.tickets ?? {})) {
    if (!g) continue;
    const stored = tickets[id]?.result;
    if (settled(stored)) continue;
    if (stored === "ungradable" && !corroborated(id)) continue;
    tickets[id] = g;
  }
  const legs = { ...(cur?.legs ?? {}) };
  for (const [key, g] of Object.entries(inc.legs ?? {})) {
    if (g && !settled(legs[key]?.result)) legs[key] = g;
  }
  const done = [...entry.core, ...(entry.funT ?? [])].every((t) => resolved(tickets[t.id]?.result));
  return { tickets, legs, done };
}

/* ============================================================================================
 * THE CORE UNION ON THE DEVICE — INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab CFB
 * should've been running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * WHAT WENT WRONG, TWICE — and the second time was this file's own copy drifting.
 *
 * (1) THE UPSERT KEPT `cur.core` WHOLESALE, which was right while a locked CFB day could only ever
 *     gain grading. It cannot any more: the server's bounded TOP-UP (`planCfbTopUp` /
 *     `applyCfbTopUp` in src/lib/cfb/lock-server.ts) APPENDS core tickets to an already-locked day,
 *     hours later, to reach the $150 the lock instant could not deploy. So the phone pulls the $75
 *     copy at noon, the server tops the day up to $150 at 1pm, the phone upserts that copy — and
 *     kept its own $75. The three top-up tickets never appeared on the device, the CFB Ledger tab
 *     went on calling it a full paper day, and the phone's record disagreed with the money the
 *     server wrote. mergeLedgers (src/lib/ledger-merge.ts) learned the union; this path had not.
 *
 * (2) THE FIX FOR (1) WAS A PRIVATE SECOND COPY of that union — `coreAppends`, with its own
 *     `agreeOnShared` / `betOf` / `LEG_IDENTITY` / `stakeSum` — and the copy drifted from the
 *     original inside a single round. That is why it is gone rather than repaired. There are two
 *     places a CFB day is merged with another copy of itself: THIS rail (`upsertCfbEntries`,
 *     reached through `lockCfb`) and the SYNC rail (`mergeLedgers` -> `mergeDay` -> `unionCore`,
 *     which src/lib/cfb/sync.ts runs on every pull). Whichever card Josh happens to be looking at
 *     is the one he will believe, so they may not disagree about the money. MEASURED this turn,
 *     both reproduced twice, now pinned in tests/cfb-store-convergence.test.ts:
 *
 *       the RAISE     shared id cfb-2026-09-05-core-1, the device copy at $15 against the server's
 *                     at $25 carrying `topUp: 10` — the receipt `withTopUp` stamps. The sync rail
 *                     raised it to $25; this rail had NO raise pass at all and kept $15
 *                     ("expected 15 to be 25"). One ticket, two different stakes, two rails.
 *       the FALLBACK  `const bounded = Number.isFinite(cap) && cap > 0` SKIPPED the allotment bound
 *                     entirely whenever no side carried a numeric `daily`, where the kernel's
 *                     `allotmentCap` falls back to the DESK'S OWN allotment. Three $25 tickets
 *                     against a seven-ticket copy seated all seven here ($175) and six on the sync
 *                     rail ($150) — different core SETS, on exactly the legacy days the fallback
 *                     exists for.
 *
 * SO THERE IS ONE UNION AND ONE SET OF GATES NOW. That fix landed in two steps, and the first one
 * was only half of it. STEP ONE called the kernel's exported `unionCore(cur, entry)` from here, so
 * both rails ran the same AGREEMENT gate (the sides must mean the same wager by every id they
 * share, compared on LEG IDENTITY only), the same ALLOTMENT gate (the merged core may never pass
 * the day's own recorded `daily`, and the desk's own allotment when neither side records one) and
 * the same RECEIPT rule for a raise. STEP TWO — (B4) below — stopped calling it: `unionCore(cur,
 * entry)` forces the STORED copy to be the base, and the base choice is itself part of the answer.
 * This rail now takes the merged day whole from `mergeLedgers`, so the gates above are reached
 * through `mergeDay` exactly as the sync rail reaches them, and this file holds no copy of the
 * union, of the base choice or of the allotment decision. None of the kernel's reasoning is
 * restated here, because a restatement is the thing that drifted.
 *
 * IT IS IMPORT-SAFE FROM A `"use client"` FILE, checked rather than assumed: ledger-merge.ts has no
 * `"use client"` of its own and its only imports are @/lib/paper-mode and @/lib/cfb/rules, two
 * constant-only modules with no imports at all — and this file already pulled `mergeLedgers` and
 * `validateLedger` from it, which are now the only two symbols it takes.
 *
 * WHY THIS IS NOT A RE-LOCK, and why the docblock below still says the lock is once per date: a
 * re-lock would re-stake the Saturday — new ticket ids, a new `lockedAt`, a second full card. The
 * union adds tickets the day was already allotted and never touches `lockedAt`, `source`,
 * `trigger`, the fun bucket or anything else the lock instant decided; `refused` stays TRUE,
 * because the incoming card was still refused as a card. The ONE stake it may change is a shared
 * id the other side RAISED with a matching `topUp` receipt, which is the top-up money the desk
 * really deployed and not a second wager. A shared id is never a second copy, so the union is
 * idempotent (a raise is monotone: the second pass finds no positive delta) and no re-merge can
 * double-stake a day.
 * ========================================================================================== */

/** The leg keys a ticket's grading is filed under (`grading.legs` is keyed by lkey). */
function lkeysOf(t: CfbTicket | undefined): string[] {
  return (t?.legs ?? []).map((l) => String(l.lkey ?? "")).filter(Boolean);
}

/**
 * WHICH STORED VERDICTS WERE PRICED UNDER A STAKE THAT HAS SINCE MOVED (INSTRUCTION 45,
 * 2026-09-06, the closing round's CORE-RAIL defect — (B4) below `upsertCfbEntries`'s own block). The ids `cur` and the merged day SHARE whose stake is not the same
 * number on both — nothing else. Appended ids are not here (there was no stored verdict to
 * invalidate; the REOPEN block in `upsertCfbEntries` covers them), and neither are ids that
 * survived the merge unchanged.
 *
 * IT REPLACES THE ID LIST THIS RAIL USED TO READ OFF ITS OWN UNION CALL, and it is not merely a
 * re-spelling of it. That call was `unionCore(cur, entry)` and the list was its `raised` field —
 * a name that no longer exists: the kernel widened the same field to `restaked` this round when
 * the reconciliation began moving stakes DOWN as well as up (checked in src/lib/ledger-merge.ts
 * this turn; `unionCore` now returns SIX fields, `{ core, restaked, dropped, droppedPL, conflict,
 * betConflict }` — the sixth was `betConflict` and this line said FIVE until 2026-09-06, when the
 * kernel added it under its own defect A2 and this citation was not moved with it; re-read off
 * `CoreUnion` and off the function's own `return` statement in src/lib/ledger-merge.ts this turn).
 * Only `restaked` is consumed here. This
 * rail used to compute its own union with `cur` forced as the base, so the only way a shared stake
 * could move was the receipted RAISE, and that list named exactly those ids. Now the merged day comes from
 * `mergeLedgers`, whose base is `pickBase`'s choice — so a shared id can also come back carrying
 * the OTHER copy's stake because the other copy won the base. That is still a stored verdict
 * describing a bet the record no longer holds, and it must be withdrawn for the same reason a
 * raise must: `settle` (./grade) prices the payout FROM the stake, so a stake and the payout beside
 * it are one quote. Measuring the MOVE rather than naming the mechanism is what keeps this honest
 * when the mechanism changes again. The comparison is a money comparison, so it uses the same 1e-6
 * tolerance the kernel's own stake arithmetic does (`unionCore`, src/lib/ledger-merge.ts).
 */
function restakedIds(before: CfbTicket[], after: CfbTicket[]): string[] {
  const was = new Map<string, number>();
  for (const t of before) if (t.id) was.set(String(t.id), Number(t.stake) || 0);
  const out: string[] = [];
  for (const t of after) {
    const id = String(t.id ?? "");
    const prev = was.get(id);
    if (prev === undefined) continue;
    if (Math.abs((Number(t.stake) || 0) - prev) > 1e-6) out.push(id);
  }
  return out;
}

/**
 * A MOVED STAKE INVALIDATES THE VERDICT IT WAS PRICED UNDER (INSTRUCTION 45, 2026-09-06) — the
 * device twin of THE RAISE INVALIDATES ITS VERDICT in `mergeDay` (src/lib/ledger-merge.ts), and
 * the reason enabling the raise on this rail is not enough on its own.
 *
 * WIDENED FROM "RAISE" TO "MOVE" (the closing round's CORE-RAIL defect, same instruction, same
 * day): the ids handed in are
 * now `restakedIds(cur.core, core)` and no longer the id list off this rail's own `unionCore(cur,
 * entry)` call (the field was `raised` then and is `restaked` in the kernel today), because this rail no
 * longer runs its own union with the stored copy forced as the base — it takes the merged day
 * from `mergeLedgers`, whose base is `pickBase`'s choice. See `restakedIds` above for why the
 * MOVE is the honest test and the mechanism is not. The parameter is still called `raised`
 * because a receipted raise is what puts an id in that list on every path that exists today.
 *
 * A stake and the payout beside it are ONE quote: ./grade `settle` prices the payout FROM the
 * stake — `const payout = Math.round(stake * dec * 100) / 100;`, grepped in src/lib/cfb/grade.ts
 * this turn. The moment the union raises a shared id, a
 * verdict already in `grading.tickets` describes a bet that no longer exists, and `done: true`
 * tells every grader there is nothing left to recompute — `gradeCfbPending`
 * (src/components/cfb/CfbLedger.tsx) grades only days where `!e.grading?.done`. The REOPEN block
 * in `upsertCfbEntries` cannot catch it either: that fires on a ticket MISSING from the map, and a
 * raised ticket is PRESENT. The realized P/L would then read the NEW stake against the OLD payout
 * for ever, which is Instruction 45's own failure mode wearing the device's clothes.
 *
 * DELETE, NOT RESCALE, for the reasons the kernel's block sets out and which hold identically
 * here: `dec` is written on SOME grades only (./grade `settle` returns it on `won` and on the
 * all-legs-pushed `push`, never on `lost` / `pending` / `ungradable`; `CfbGrade` in ./types marks
 * it `dec?`), a PUSH payout is the stake handed back rather than stake x dec, and a won parlay's
 * `dec` is the product of the legs that STOOD. Deleting hands the arithmetic back to the grader,
 * which reads finals and the NEW stake; until it runs the ticket scores 0, which is what
 * `ticketPL` already returns for an ungraded ticket and the honest state.
 *
 * THE LEGS go with it, but only the ones no SURVIVING ticket still references. Leg verdicts are
 * stake-INDEPENDENT, so this is not required for the money; it is here so an invalidated ticket
 * does not leave a settled leg map standing behind it. A leg another ticket still owns belongs to
 * a verdict that still stands, and `overlayGrading` above would refuse to overwrite it anyway.
 */
function withdrawRaisedVerdicts(g: CfbGrading, raised: string[], entry: CfbLedgerEntry): CfbGrading {
  const tickets = { ...g.tickets };
  const legs = { ...g.legs };
  const all = [...entry.core, ...(entry.funT ?? [])];
  const gone = new Set(raised);
  const keep = new Set<string>();
  for (const t of all) if (!gone.has(String(t.id))) for (const k of lkeysOf(t)) keep.add(k);
  for (const id of raised) {
    delete tickets[id];
    for (const k of lkeysOf(all.find((t) => String(t.id) === id))) if (!keep.has(k)) delete legs[k];
  }
  return { tickets, legs, done: false };
}

/* ============================================================================================
 * THE OTHER TWO THIRDS OF THE CARD — INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab CFB
 * should've been running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * The union above fixed CORE. `upsertCfbEntries` builds its result as a spread of `cur`, so every
 * field the spread carries is the DEVICE's copy, unexamined — and two of those fields are money.
 * Both defects are the same shape: a rule that shipped into `mergeDay` (src/lib/ledger-merge.ts)
 * and never reached its twin on this rail, so the phone and the cloud answered differently about
 * one day. Whichever card Josh happens to be looking at is the one he will believe.
 *
 * (V1) THE FUN BUCKET WAS NEVER UNIONED HERE AT ALL — the whole $25 half of Josh's sentence. It
 *      was harmless while the only CFB fun ticket was the single lock-instant id
 *      `cfb-<date>-fun-1`, because a copy of the same day could never hold a fun id this one
 *      lacked. `planCfbTopUp` (src/lib/cfb/lock-server.ts) then started minting a SECOND distinct
 *      id, `cfb-<date>-topup<n>-fun-1`, and the append became reachable. MEASURED this turn, both
 *      rails on one pair — device core [`cfb-2026-09-05-core-1` @ $25] with funT [], server the
 *      same core plus funT [`cfb-2026-09-05-topup1-fun-1` @ $25]: `upsertCfbEntries` returned funT
 *      [] / $0 and a day exposure of $25, `mergeLedgers` returned funT [topup1-fun-1] / $25 and an
 *      exposure of $50. The phone dropped a real $25 wager, `cfbLedgerStats(entries, "fun")` never
 *      saw it, and `todayExposure` under-reported the day.
 *
 *      THE FIRST FIX CALLED THE KERNEL'S `unionFun` HERE — base's bucket plus the ids only the
 *      other side holds, deep-cloned, in TICKET-ID order, bounded by the day's own recorded `fun`
 *      and otherwise by CFB_PAPER.fun — with `cur` as the base. That closed the drop and opened
 *      defect B2 (below), so the fun bucket is no longer seated on this rail at all: it is TAKEN
 *      FROM THE SYNC RAIL'S OWN MERGED DAY. What the cap refuses is still NAMED on `funDropped` —
 *      a dropped ticket that leaves no trace is a wager a device still shows and the record does
 *      not — and that marker is taken from the same merged day, so the two rails cannot name
 *      different losses either.
 *
 * (B2) THE TWO RAILS SEATED DIFFERENT $25 FUN WAGERS. `mergeDay` picks its base SYMMETRICALLY
 *      (`pickBase`, src/lib/ledger-merge.ts: grading richness, then CLV count, then confirmed
 *      count, then byte length, then byte order); `unionFun(cur, entry)` here made the LOCALLY
 *      STORED copy the base unconditionally, and the $25 fun cap then refused whichever ticket the
 *      other side held. MEASURED twice this turn, two copies of 2026-09-05 with core [] and one
 *      distinct $25 fun ticket each — a.funT [`cfb-2026-09-05-fun-1`], b.funT
 *      [`cfb-2026-09-05-topup1-fun-1`]: `mergeLedgers` kept `topup1-fun-1` in BOTH argument orders
 *      (neither copy carries grading, so `pickBase` falls to its byte tiebreak and answers the
 *      same way either way), while `upsertCfbEntries(cur=a, inc=b)` kept `fun-1` and named
 *      `topup1-fun-1` as dropped — THE OPPOSITE BET, with `cur=b` agreeing with the sync rail
 *      again. Ticket ids key `grading.tickets`, so the phone and the cloud would carry a different
 *      $25 wager, a different verdict and a different day P/L for one date indefinitely, and
 *      whichever copy was pushed last would win. The V1 pins could not see it: they hand both
 *      sides the SAME base ticket, so no base choice is contested.
 *
 *      THE FIX IS DELEGATION, NOT IMITATION. Reproducing `mergeDay`'s base choice here would mean
 *      a second copy of `pickBase` — and a private second copy of a kernel rule drifting inside a
 *      single round is defect D1, the thing this whole block exists because of. `pickBase` is
 *      module-private to src/lib/ledger-merge.ts, so this rail runs `mergeLedgers` on the two
 *      copies and takes the FUN BUCKET AND `funDropped` off the day it returns. Equality with the
 *      sync rail is then by CONSTRUCTION rather than by imitation: the answer is not merely the
 *      same rule, it is the same call. The cost is one extra merge of a single day per upsert —
 *      `mergeDay` deep-copies its base and stringifies both copies once — which is a per-lock and
 *      per-pull cost on one entry, not a per-render one.
 *
 * (V2/B1) A STALE NO-PLAY SURVIVED OVER REAL STAKES. `noPlay` is a claim ABOUT THE CARD — "the day
 *      locked with an empty core, nothing staked" — so it cannot outlive the card being empty.
 *      `applyCfbTopUp` (src/lib/cfb/lock-server.ts) has always dropped it on the entry it writes,
 *      and `mergeDay` learned the same one-line rule this round; this rail spread `cur.noPlay`
 *      through untouched. MEASURED, both rails on one pair — device {noPlay: true, core: [],
 *      grading done} against the server's copy of the same date carrying two $25 top-up core
 *      tickets: this rail gave core 2 / stake 50 / **noPlay true**, `mergeLedgers` gave core 2 /
 *      stake 50 / noPlay undefined. With the flag standing the Builder renders "NO-PLAY recorded —
 *      nothing staked" (src/components/cfb/CfbBuilder.tsx) and the Ledger row renders "NO-PLAY —
 *      nothing staked" beside a No-play pill (src/components/cfb/CfbLedger.tsx), over $50 of live
 *      exposure.
 *
 *      AND IT CLEARED ON THE CORE ALONE (defect B1, the regression half of the same rule). The
 *      line read `if (kept.noPlay && kept.core.length) delete kept.noPlay;` while the server write
 *      path read `if (next.noPlay && (core.length || funT.length)) delete next.noPlay;`
 *      (`applyCfbTopUp`, src/lib/cfb/lock-server.ts). THAT QUOTE IS HISTORY, NOT TODAY'S FILE
 *      (checked this turn, the closing round): that line now reads
 *      `if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete next.noPlay;` —
 *      the server rail moved onto STAKED MONEY to match the kernel, and this rail no longer states
 *      the rule at all (see defect C1 below). A CFB day
 *      whose core stayed empty but whose FUN bucket now holds the $25 top-up ticket therefore kept
 *      the flag — and that is the HEADLINE DAY of this instruction, not a corner: a board where
 *      nothing clears the core gate still seats the $25 fun parlay. MEASURED twice: the upsert
 *      over a stale {core: [], funT: [], noPlay: true, grading done} copy against a copy carrying
 *      funT [`cfb-2026-09-05-topup1-fun-1` @ $25] gave core 0 / funT 1 / fun $25 / **noPlay true**,
 *      and the phone renders "NO-PLAY — nothing staked." (src/components/cfb/CfbLedger.tsx) over a
 *      live $25 wager. NO MOVE was needed with the widening, checked by reading the final file
 *      rather than assumed: `funT` is already united above this line, so `kept.funT` is the MERGED
 *      bucket by the time the flag is tested.
 *
 *      HONEST LATENCY NOTE. This branch is NOT reachable from production today: `lockCfb` below
 *      returns the existing entry before ever calling the upsert when the date is already locked,
 *      and the sync path (src/lib/cfb/sync.ts) runs `mergeLedgers`, not this function. So V2 was a
 *      latent divergence — in a rail whose own convergence suite CLAIMS it agrees with the sync
 *      rail, which is exactly the claim a future caller would rely on. It is fixed for the same
 *      reason the core union was: the two rails may not disagree about a day's money, and "it
 *      cannot be reached yet" is not a property of the code, only of today's call sites.
 *
 * (B4) THE RAIL WAS ONLY HALF DELEGATED, AND THE HALF LEFT BEHIND WAS THE ONE THAT DISAGREED.
 *      (B2) took `funT` and `funDropped` off the shared merge and left `core` coming from the
 *      private `unionCore(cur, entry)` call — and core is exactly where the two rails answer
 *      differently, because `unionCore(cur, entry)` FORCES the stored copy to be the base while
 *      `mergeDay` chooses one with `pickBase`. MEASURED twice this turn, both entries dated
 *      2026-09-05 with `daily` 150: a = 3 core tickets @ $25 ($75), b = 7 core tickets @ $25
 *      ($175) — the shape `mergeDay`'s own K3 docblock calls a stored blob already over cap.
 *      `upsertCfbEntries([a], b).entry.core` came back as 6 tickets / $150 (the union's allotment
 *      gate truncating the append) against `mergeLedgers([a], [b])[0].core` at 7 tickets / $175,
 *      because `pickBase` prefers b on the JSON-length tiebreak and `mergeDay` clones it wholesale
 *      before any gate runs. One date, two cards, $25 of staked money between them — and
 *      `cfbBankroll` sizes every later day off whichever card the reader happens to be shown.
 *      Worse, the sync rail at least MARKED it (`capBreach { core: { sum: 175, cap: 150 } }`)
 *      while `upsertCfbEntries([b], a)` produced the same 7 tickets / $175 with `capBreach`
 *      UNDEFINED — so this rail could carry the breach without the note that says so.
 *
 *      THE FIX IS THE SAME DELEGATION (B2) ALREADY ARGUED FOR, APPLIED TO THE BUCKET IT WAS NOT
 *      APPLIED TO: `core` now comes off the same `mergeLedgers` call `funT` does, so equality is
 *      by CONSTRUCTION on BOTH buckets rather than on one — the answer is not merely the same
 *      rule, it is the same call — and this file's second copy of the allotment decision is gone
 *      with the `unionCore` import.
 *
 *      WHAT IT CHANGES, STATED RATHER THAN BURIED. This rail's oldest claim was "an upsert on a
 *      locked date KEEPS the original core". That has not been literally true since the core union
 *      shipped (an append lands, and a receipted raise moves a shared stake), and it is now
 *      narrower still: the phone's own tickets stand when the phone's copy WINS `pickBase`, and
 *      otherwise the merged day is the incoming card's. That is not a new exposure — it is what
 *      the phone already converges on, because src/lib/cfb/sync.ts runs `mergeLedgers` on every
 *      pull and would rewrite the record that way regardless. What ends is the window in which the
 *      two rails disagreed. In the real shape the phone wins anyway: it grades what it pulled, and
 *      `gradeScore` outranks every byte tiebreak. `withdrawRaisedVerdicts` is fed `restakedIds`
 *      rather than an id list off a private `unionCore` call for the same reason — see its own
 *      block above, which also records what that field is called in the kernel today.
 *
 *      TWO PINS IN tests/cfb-store.test.ts ENCODE THIS RAIL'S OLDEST CLAIM, AND THEY WERE RIGHT
 *      ALL ALONG (INSTRUCTION 45, 2026-09-06, defect B1). Until this turn this paragraph ended
 *      "those two assertions need rewriting to 25, and that file was not this change's to edit".
 *      THAT READING IS WITHDRAWN. The pins are "pure: a second entry for a locked date keeps the
 *      original core and overlays grading + games" and "storage-backed: the refused re-lock never
 *      reaches the device record", both asserting `core[0].stake` is 10 against an incoming copy
 *      that stakes the same positional id at 25 with no `topUp` stamp anywhere. They went red when
 *      this rail started taking its core off `mergeLedgers` — but the honest reading of that red
 *      was never "the pin is stale": `mergeDay` DEEP-CLONED `pickBase`'s winner wholesale and so
 *      handed back a raise `unionCore` had just refused in BOTH directions, and the phone was
 *      being shown $25 the desk never staked. The kernel closed exactly that this round (STOP
 *      TRUSTING THE CLONE above `unionCore` in src/lib/ledger-merge.ts, whose own summary line for
 *      that function, read this turn, is "every shared id RECONCILED to one agreed stake, then
 *      `base`'s tickets plus the ones only `other` holds"; the receipt is unchanged, so a raise
 *      nothing stamps loses to the smaller stake — tests/ledger-merge.test.ts states the same rule
 *      as "a shared id at two different stakes keeps the SMALLER stake unless the two copies'
 *      `topUp` stamps account for the difference exactly"). Both pins are GREEN AS WRITTEN — measured this turn against the
 *      stabilised kernel, tests/cfb-store.test.ts "Tests 20 passed (20)" (re-measured 2026-09-06),
 *      with the kernel narrating a `[ledger-merge] <date>: N shared core id(s) disagreed on stake`
 *      warning naming the id on each. THE EXACT WARN WORDING IS DELIBERATELY NOT QUOTED HERE: the
 *      "with no topUp receipt" clause this line used to reproduce was DELETED from the kernel on
 *      2026-09-06 (that branch is also reached when a valid receipt is read and then overruled by
 *      the allotment, which made the clause false), and quoting a string this file does not own is
 *      what made this citation go stale in the first place. The emitter is the `united.conflict`
 *      warn in `unionCore`'s caller, src/lib/ledger-merge.ts. NOT ONE ASSERTION IN
 *      THAT FILE WAS EDITED. The lesson worth keeping: a pin that goes red under a delegation is
 *      evidence about the thing being delegated TO, not automatically a superseded claim.
 *
 * (B5) `capBreach` RODE ALONG ON THE `{ ...cur }` SPREAD while `funDropped` was taken off the
 *      merged day: two merge markers, one object literal, two different authorities. So the device
 *      could show a stale breach on a day that is no longer over cap, and none on a day that is.
 *      Both markers now come from the merged day, which recomputes the breach and deletes it when
 *      it is gone.
 *
 * ── EVERY (V…) AND (B…) FIX ABOVE IS NOW A CONSEQUENCE, NOT A LINE (INSTRUCTION 45, 2026-09-06,
 *    the closing round's defects C1/C2/C3) ────────────────────────────────────────────────────
 * Read the four fixes above together and the shape is one defect answered four times: each named
 * ONE field of the merged day and copied it across by hand. `upsertCfbEntries` now starts from the
 * merged day and takes back only `LOCK_INSTANT` — so `funT` (V1), the base choice (B2), the
 * no-play flag (V2/B1), `core` (B4) and `capBreach` (B5) are all carried by the DIRECTION rather
 * than by five statements, and the fifth field nobody remembered (`funDroppedPL`) is carried too.
 * THE LINES THOSE FIXES DESCRIBE ARE GONE, and each is quoted where it used to stand: there is no
 * `if (kept.noPlay && …)` in this file any more (see NO-PLAY IS NOT STATED HERE AT ALL ANY MORE in
 * the body) and no `kept.capBreach = …` / `kept.funDropped = …` assignment (see THE MERGED DAY IS
 * THE RECORD). What each block MEASURED still stands and is why the delegation is shaped this way;
 * only the mechanism moved. See THE DEFAULT WAS THE WRONG WAY ROUND below.
 *
 * The pins are RAIL-EQUALITY pins in tests/cfb-store-convergence.test.ts —
 * `upsertCfbEntries(...).entry.X` against `mergeLedgers(...)[0].X` for funT ids, fun sum,
 * `funDropped`, core, `capBreach` and `noPlay`, in BOTH argument orders for the contested pairs,
 * plus a legacy day carrying no numeric `daily` or `fun` — so neither rail can drift again without
 * a failure.
 * ========================================================================================== */

/* ============================================================================================
 * THE DEFAULT WAS THE WRONG WAY ROUND — INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab
 * CFB should've been running the same $150 per day theoretical Core money and $25 Fun money per
 * day". The closing round's defects C1, C2 and C3, and they are ONE defect.
 *
 * `upsertCfbEntries` built its result as `{ ...cur, core, funT, games, grading }` and then copied
 * back, BY HAND AND BY NAME, each field of the merged day it happened to remember: `funDropped`
 * last round, `capBreach` the round after (defect B5). So the DEFAULT for every field of a CFB day
 * was "whatever the phone already had", and the shared merge's answer reached the record only for
 * the fields somebody had listed. That default is the class this round removes, because the six
 * previous rounds each fixed one member of it and shipped the next:
 *
 * (C2) `funDroppedPL` NEVER REACHED THE PHONE. `mergeDay` records it beside `funDropped` — the
 *      receipt that stops a SETTLED fun ticket from being deleted in silence when the $25 cap has
 *      to drop one (`unionFun`'s `droppedPL`, src/lib/ledger-merge.ts, built by `receiptOf` and
 *      re-read there this turn: `{ result, payout, stake }` per dropped id, plus `placed` and
 *      `actualStake` when the ticket carries them — one more reason not to hand-list the shape).
 *      The hand-written carry beside it named `funDropped` only.
 *      MEASURED this turn, both orders, on two copies of 2026-09-05 each holding ONE settled $25
 *      fun ticket — stored `cfb-2026-09-05-fun-1` graded won at payout 47.73, incoming
 *      `cfb-2026-09-05-topup1-fun-1` graded won at payout 30: `mergeLedgers` returned
 *      `funDroppedPL {"cfb-2026-09-05-topup1-fun-1":{result:"won",payout:30,stake:25}}` and
 *      `upsertCfbEntries` returned `undefined`. The phone names a drop and cannot say what it was
 *      worth, which is precisely the silence the receipt was added to end.
 *
 * (C3) AND SO WOULD THE NEXT MARKER, AND THE ONE AFTER. `alt`, `clv`, `blocks` and the MLB money
 *      metadata (`allocSum` / `gatedSum` / `topUpSum`, moved by `carryMoneyMeta` in
 *      src/lib/ledger-merge.ts) were in the same position: unioned or recomputed by the shared
 *      merge, and then discarded by this rail's `{ ...cur }` default. Naming them one by one is
 *      what has failed six times.
 *
 * THE FIX IS TO INVERT THE DEFAULT, NOT TO LENGTHEN THE LIST. `kept` now STARTS as the merged day
 * and takes back from `cur` exactly the fields the ONCE-PER-DATE LOCK owns (`LOCK_INSTANT` below),
 * plus `grading`, which is this file's own rule and not the kernel's. Any field either side adds
 * from now on — a new marker, a stake-conflict record, a core drop channel — reaches the phone
 * with no edit here, because the merge's answer is the default and the exceptions are the short,
 * closed, motivated list. A field forgotten from that list now fails SAFE: it is the shared
 * merge's answer, which is what the sync rail (src/lib/cfb/sync.ts, `mergeLedgers` on every pull)
 * would write over the record anyway.
 *
 * THAT PREDICTION WAS PAID OUT INSIDE THE SAME ROUND, AND IT IS MEASURED RATHER THAN CLAIMED. The
 * kernel's own closing fix (STOP TRUSTING THE CLONE, src/lib/ledger-merge.ts) added THREE more
 * markers to a merged day while this file was open — `stakeConflict`, `coreDropped` and
 * `coreDroppedPL` — and NOT ONE OF THEM IS NAMED ANYWHERE IN THIS FILE. They reach the phone
 * because the merged day IS the record now. Pinned in tests/cfb-store-convergence.test.ts ("the
 * markers the kernel added this round reach the phone too"), whose key assertion is a union over
 * the merged day's own keys rather than a hand-written list, so marker number four needs no edit
 * here either. Reverting this inversion to the old `{ ...cur, core, funT, … }` construction was
 * re-run twice this turn against that pin and fails with all three markers on the sync rail and
 * absent from the device's.
 *
 * AND IT MAKES THE THIRD WRITE PATH LOOK LIKE THE OTHER TWO, checked in this file this turn rather
 * than assumed: `importCfbLedger` below writes `cfbEntriesOf(mergeLedgers(local, v.entries))` — the
 * merged day WHOLE, with nothing taken back — and `syncCfbNow` (src/lib/cfb/sync.ts) writes
 * `cfbEntriesOf(mergeLedgers(local, remote))`, likewise. Two of the three paths that can rewrite a
 * stored CFB day already trusted the shared merge with every field; the upsert was the odd one
 * out, and the only field it has ever had a reason to keep back is the lock instant it refuses a
 * second card for.
 *
 * THE LETTERS ARE FILE-LOCAL. C1/C2/C3 here number this file's own three faces of the closing
 * round; src/lib/cfb/lock-server.ts numbers its own list and its "DEFECT C3" is the SERVER twin of
 * C1 below, not of C3 below. Both are INSTRUCTION 45, 2026-09-06.
 *
 * THE NO-PLAY RULE IS NOT RESTATED (defect C1). `noPlay` is revised after the lock — the server's
 * `applyCfbTopUp` (src/lib/cfb/lock-server.ts) drops it on the entry it writes — so it is not a
 * lock-instant field and it now rides the merged day like every other field the merge owns. That
 * ends a three-way disagreement rather than patching it: `mergeDay` tests STAKED MONEY
 * (`if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete
 * out.noPlay;` — quoted from src/lib/ledger-merge.ts this turn) while this rail tested ROW COUNTS
 * (`kept.core.length || kept.funT.length`), so a writer emitting a $0 ticket would have had the
 * phone call a genuine no-play a played day. COPYING the kernel's line here would have made three
 * copies of one rule where two had already drifted; taking the kernel's ANSWER makes the rails
 * equal by construction, which is the same argument (B2) and (B4) above already made for the two
 * money buckets. Pinned in tests/cfb-store-convergence.test.ts with a $0 ticket in each bucket.
 * ========================================================================================== */

/**
 * The fields the LOCK INSTANT owns, taken back off the stored copy after the merged day is seated.
 *
 * MEMBERSHIP TEST, so this list does not grow by habit: a field belongs here only if the lock
 * DECIDES it and no writer revises it afterwards. `lockedAt`, `source`, `trigger`, `daily` and
 * `fun` are the five the `Pure upsert` docblock below has always named — the lock is once per date
 * and a second card is refused, so the phone's own instant, provenance and allotments stand.
 * `sport`, `date` and `locked` are identity: `upsertCfbEntries` only reaches this path for an
 * entry whose `date` already matches, and `isCfbEntry` fixes the other two, so they are the same
 * on both copies and are listed to say so rather than to change anything.
 *
 * DELIBERATELY ABSENT, each because a writer revises it after the lock: `noPlay` (`applyCfbTopUp`
 * drops it), `note` (`applyCfbTopUp` appends the top-up's own narration to it — read in
 * src/lib/cfb/lock-server.ts this turn), `core` / `funT` / `games` / `grading` / `clv` / `blocks` /
 * `alt` and every merge marker.
 */
const LOCK_INSTANT = ["sport", "date", "locked", "daily", "fun", "lockedAt", "source", "trigger"] as const;

/**
 * Pure upsert. A date that is already locked KEEPS its lockedAt — the LOCK is once per slate date
 * and `refused` says an existing one stood. Every LOCK-INSTANT field is still the phone's own:
 * `lockedAt`, `source`, `trigger`, `daily` and `fun` are taken back off `cur` by name
 * (`LOCK_INSTANT` above), and `refused` stays true because the incoming card was still refused AS
 * A CARD.
 *
 * WHAT THE INCOMING COPY MAY CONTRIBUTE IS EVERYTHING ELSE THE SHARED MERGE SEATS: both money
 * buckets (core and funT), the games map, the merge markers (`funDropped`, `funDroppedPL`,
 * `capBreach`) and every other accrual, taken whole from `mergeLedgers` so that the phone and the
 * cloud cannot answer differently about one date — see THE DEFAULT WAS THE WRONG WAY ROUND above.
 * The one exception is `grading`, which goes through `overlayGrading`, this file's own rule. The
 * server top-up's appended core tickets, a raise of a shared core stake carrying its own `topUp`
 * receipt, and the top-up's appended fun tickets all arrive that way, under the gates the kernel's
 * own docblocks describe. See (B2) and (B4) in the block above for the measured pairs.
 */
export function upsertCfbEntries(
  entries: CfbLedgerEntry[],
  entry: CfbLedgerEntry,
): { entries: CfbLedgerEntry[]; entry: CfbLedgerEntry; refused: boolean } {
  const i = entries.findIndex((e) => e.date === entry.date);
  if (i < 0) return { entries: sortByDate([...entries, entry]), entry, refused: false };
  const cur = entries[i];
  /* THE FUN BUCKET IS THE SYNC RAIL'S OWN ANSWER — AND SINCE THE CLOSING ROUND SO IS THE CORE
     (INSTRUCTION 45, 2026-09-06, defect B2 and the closing round's CORE-RAIL defect; the first
     half of that heading is cited by name from tests/ledger-merge.test.ts, so it is kept verbatim)
     — see (B2) and (B4) in the block above this function for the measured pairs. `mergeDay`
     chooses its base with `pickBase`, which is module-private to src/lib/ledger-merge.ts; rather
     than keep a second copy of that choice here (defect D1's own failure shape), this rail runs
     the sync merge on the two copies and takes the whole merged day's money off it. Neither input
     is mutated: `mergeDay` deep-copies its base and never writes to the other side. The `?? cur`
     fallback is unreachable by TYPE — `mergeLedgers` skips an entry whose `locked` is not true and
     `CfbLedgerEntry` declares `locked: true` (./types), which `isCfbEntry` above also enforces on
     everything read back from storage — and it keeps the STORED buckets whole, which is what this
     rail did before it unioned at all. */
  const syncDay = (mergeLedgers([cur], [entry])[0] as CfbLedgerEntry | undefined) ?? cur;
  const core = syncDay.core;
  /* THE MERGED DAY ITSELF is what `done` is measured over — `overlayGrading` and
     `withdrawRaisedVerdicts` both read the entry's two buckets, and a ticket the top-up appended
     to EITHER of them is part of the day, so a day that was done before the append is not done
     until the new ticket is graded too. This used to pass a `{ ...cur, core, funT }` stand-in
     built for exactly those two buckets; `syncDay` IS that day and holds no other reading. */
  let grading = overlayGrading(cur.grading, entry.grading, syncDay);
  /* RUNS AFTER the overlay, never beside `core`: the incoming copy may carry the SAME verdict the
     restake just invalidated, and the overlay would put it straight back. */
  const restaked = restakedIds(cur.core, core);
  if (grading && restaked.length) grading = withdrawRaisedVerdicts(grading, restaked, syncDay);
  /* THE MERGED DAY IS THE RECORD, AND ONLY THE LOCK INSTANT IS TAKEN BACK OFF `cur` (INSTRUCTION
     45, 2026-09-06, defects C2 and C3) — this line used to read
     `const kept: CfbLedgerEntry = { ...cur, core, funT, games: { ...(entry.games ?? {}), ...(cur.games ?? {}) }, grading };`
     followed by two hand-written patches that copied `funDropped` and `capBreach` across from
     `syncDay`. See THE DEFAULT WAS THE WRONG WAY ROUND above `LOCK_INSTANT` for why the direction
     is the defect and the missing markers were only its symptoms. `grading` is the ONE field this
     rail still decides for itself — `overlayGrading` above is the device's own rule, deliberately
     not `mergeDay`'s fill-only map merge. */
  const kept: CfbLedgerEntry = { ...syncDay, grading };
  const lockInstant = cur as unknown as Record<string, unknown>;
  const onto = kept as unknown as Record<string, unknown>;
  for (const k of LOCK_INSTANT) {
    if (k in lockInstant) onto[k] = lockInstant[k];
    else delete onto[k];
  }
  /* REOPEN (2026-09-06) — the twin of mergeDay's "any ticket without a grade reopens grading". It
     covers the one case `overlayGrading` cannot: the incoming copy carries NO grading at all, so
     the overlay returns `cur` untouched, and an append would otherwise leave a stale `done: true`
     standing over tickets that have never been graded. */
  const g = kept.grading;
  if (g?.done) {
    const graded = g.tickets ?? {};
    if ([...kept.core, ...(kept.funT ?? [])].some((t) => t.id && !(t.id in graded))) kept.grading = { ...g, done: false };
  }
  /* NO-PLAY IS NOT STATED HERE AT ALL ANY MORE (INSTRUCTION 45, 2026-09-06, defect C1) — see THE
     NO-PLAY RULE IS NOT RESTATED above `LOCK_INSTANT`. `noPlay` is not a lock-instant field (the
     server's own `applyCfbTopUp` revises it after the lock), so it is not in `LOCK_INSTANT` and it
     rides the merged day like every other field the shared merge owns. The line that used to sit
     here — `if (kept.noPlay && (kept.core.length || kept.funT.length)) delete kept.noPlay;` — was
     a third copy of a rule that already existed twice, and it was the copy that counted ROWS. */
  /* RECONCILE THE TAKEBACK (INSTRUCTION 45, 2026-09-06, the closing round's defect C1 — the DEVICE
     half of the desk-ceiling defect; src/lib/cfb/lock-server.ts numbers its own list).

     `daily` and `fun` are LOCK-INSTANT fields and are taken back off `cur` above — and they are
     also INPUTS to two of the merge's own answers. `mergeDay` (src/lib/ledger-merge.ts) closes
     with an allotment assertion that measures `stakeSum(out.core)` against `allotmentCap(out,
     other)` and `stakeSum(out.funT ?? [])` against `funCap(out, other)`, both of which read the
     MERGED day's `daily` / `fun`, and writes `capBreach` from them. So the marker was decided
     against one pair of numbers and the loop above then persisted a different pair.

     MEASURED WHEN THIS FIX WAS WRITTEN, on the `daily 150` against `daily 500` pair:
     `upsertCfbEntries([cur@daily 150], inc@daily 500)` with cur holding 3 core tickets at $25 and
     inc holding the same three plus six more gave `stored core=9 sum=225 daily=150
     capBreach=undefined`, against the sync rail's own merged day at `core=9 sum=225 daily=500
     capBreach=undefined`. The phone persisted a day staking $225 against its own recorded $150
     allotment with NO marker anywhere saying so.

     THAT PAIR NO LONGER REPRODUCES IT, AND THE DATED NUMBERS ABOVE ARE HISTORY (INSTRUCTION 45,
     2026-09-06, the closing round's defect C2). RE-MEASURED THIS TURN on the same fixture:
     `stored: {"n":9,"sum":225,"daily":150,"fun":25,"capBreach":{"core":{"sum":225,"cap":150}}}` and
     `sync: {"n":9,"sum":225,"daily":500,"capBreach":{"core":{"sum":225,"cap":150}}}` — the
     marker is now present on BOTH rails with or without this reconcile. The kernel is why:
     `allotmentCap` (src/lib/ledger-merge.ts, read this turn) is
     `recorded.length ? Math.min(desk, Math.max(...recorded)) : desk`, so an INFLATED foreign
     `daily` is clamped to the desk's own $150 and the cap the merge measured against is already
     the cap the phone keeps. An inflated claim can no longer make the two caps differ.

     WHAT STILL DOES, and what the pin was moved onto: a stored day whose own `daily` is LOWER than
     the merged day's. MEASURED THIS TURN, both runs identical, on `cur@daily 80` (3 core @ $25)
     against `inc@daily 150` (6 core @ $25) — with this reconcile removed,
     `stored: {"n":6,"sum":150,"daily":80,"fun":25}` and NO `capBreach` at all; with it,
     `stored: {"n":6,"sum":150,"daily":80,"fun":25,"capBreach":{"core":{"sum":150,"cap":80}}}`.
     That is the same defect the paragraph above describes, on the only pair that can still produce
     it, and it is what tests/cfb-lock-route.test.ts pins under "the stored day's coreSum, its
     daily and its markers agree".

     Nothing downstream re-guards either shape: `writeCfbLedger` above runs no money guard, and
     `validateLedger` (src/lib/ledger-merge.ts, the PUT rail's own check) tests the date, `locked`,
     `core`, duplicate dates and the `placed` / `actualStake` shapes and nothing about money.

     WHY THE TAKEBACK STAYS AND THE MARKER MOVES. The other choice was to drop `daily` and `fun`
     from LOCK_INSTANT so the merged day's own numbers stand. That is the worse answer: the
     allotment is what the lock DECIDED for the date — Josh's "$150 per day theoretical Core money
     and $25 Fun money per day" — and adopting a foreign copy's $500 would have the phone believe
     the desk deploys $500 a day, which `allotmentCap`'s own fallback then reads as the ceiling. So
     the phone keeps its allotment and the DAY is re-measured against it.

     BY THE SAME CALL, NOT BY A SECOND COPY OF THE RULE — the argument (B2) and (B4) above already
     made for the two money buckets, applied to the markers: `allotmentCap`, `funCap` and the
     breach block are all module-private to src/lib/ledger-merge.ts, and a private restatement of a
     kernel money rule drifting inside a single round is defect D1, the thing this whole file's
     delegation exists because of. Re-running the shared merge on the reconciled day AGAINST ITSELF
     recomputes every marker the merge owns off the numbers the stored day actually carries.

     IT SEATS AND DROPS NOTHING, checked by reading the kernel this turn rather than assumed. With
     both sides byte-identical `unionCore` reconciles every shared id to the stake it already holds
     and finds no id `other` holds that `base` lacks, so it returns null — re-read off
     src/lib/ledger-merge.ts THIS TURN, that guard is now four clauses, not three:
     `if (!changed && !dropped.length && !Object.keys(conflict).length && !betConflict.length) return null;`
     (the fourth arrived with the kernel's defect A2 and this citation was carrying the
     three-clause form). A day merged against ITSELF trips none of them: `sameBet` holds for every
     shared id, so `betConflict` stays empty too. No ticket is appended,
     raised or refused; `unionFun` returns null on its own first test (`if (!extras.length) return
     null;`). The breach is therefore KEPT AND MARKED, never truncated, which is the kernel's own
     stated direction for an over-cap day. The `games` / `blocks` / `grading` unions and the
     `noPlay` rule are all idempotent over one day and one copy of itself, which is the same
     idempotence `mergeDay` already claims and tests/ledger-merge.test.ts already pins.

     THE COST is one more merge of a single entry per upsert — a per-lock and per-pull cost on one
     day, the same bound (B2) accepted for the first one. The `?? kept` fallback is unreachable by
     TYPE for the same reason the `?? cur` fallback above is: `mergeLedgers` skips an entry whose
     `locked` is not true, and `CfbLedgerEntry` declares `locked: true`. */
  const reconciled = (mergeLedgers([kept], [kept])[0] as CfbLedgerEntry | undefined) ?? kept;
  const next = entries.slice();
  next[i] = reconciled;
  return { entries: next, entry: reconciled, refused: true };
}

export function upsertCfbEntry(entry: CfbLedgerEntry): { entries: CfbLedgerEntry[]; entry: CfbLedgerEntry; refused: boolean } {
  const r = upsertCfbEntries(readCfbLedger(), entry);
  writeCfbLedger(r.entries);
  return r;
}

/**
 * Store the grader's verdict for a date — THROUGH `overlayGrading`, exactly like the merge and
 * upsert rails (INSTRUCTION 45, 2026-09-06, defect B3).
 *
 * WHAT WENT WRONG. This function wrote the device grader's verdict WHOLESALE — its docblock said
 * "deterministic from finals — a re-run replaces" — so the phone's own grading pass was the one
 * path on this device that could overwrite a verdict with no rule applied to it at all. Defect
 * B3's earlier half had just hardened `overlayGrading` so a provisional `ungradable` yields only
 * to a CORROBORATED final (every leg of that ticket settled in the incoming leg map), and
 * `overlayCfbGrading` (src/lib/cfb/lock-server.ts) has demanded the same since L2 — but
 * `gradeCfb` below reaches the record through HERE, not through either overlay, so the gate was
 * bypassed by the one caller that runs on the phone every time the CFB Ledger tab opens.
 *
 * WHY THAT IS MONEY AND ONE-WAY PERMANENT. `gradeCfbPending` (src/components/cfb/CfbLedger.tsx)
 * fetches finals for every locked day that is not `done`, is on or before today, and carries at
 * least one ticket in either bucket — quoted from that file this turn — and calls `gradeCfb` on
 * each; it is the ONLY caller of `gradeCfb` outside this module, and nothing destructures `grade`
 * off `useCfbLedger()`. A two-leg
 * parlay voided at 48 h (leg A a real final-lost, leg B never final) re-grades from that PARTIAL
 * payload as `lost` — `settle` (./grade) returns lost as soon as ANY leg lost — and `lost` IS
 * settled, so the server's next settle pass reads `isSettled(stored)` true and its OWN
 * corroborated final can never replace it. The stake is then scored against a verdict the server
 * refused to accept from the same evidence, and `cfbBankroll` Kelly-sizes every later day off it.
 *
 * SHARED, NOT DUPLICATED: this calls the same module-private `overlayGrading` the upsert rail
 * calls, on the same three arguments, so there is now exactly ONE rule governing every path that
 * can overwrite a verdict on this device. No public signature changed — the function still takes
 * a date and a grading and still returns the stored entry, or null when the date is not locked.
 *
 * WHAT IT COSTS, stated rather than buried: a re-run no longer replaces a SETTLED verdict either,
 * which is the same trade `overlayCfbGrading` already makes on the server. A day whose tickets are
 * all resolved is `done` and `gradeCfbPending` filters it out anyway, so the re-grade this closes
 * is precisely the one that reaches a day the desk has not finished — where a settled verdict is
 * the phone's own earlier answer from a fuller payload, not something to be overwritten by a
 * thinner one.
 */
export function applyCfbGrading(date: string, grading: CfbGrading): CfbLedgerEntry | null {
  const entries = readCfbLedger();
  const i = entries.findIndex((e) => e.date === date);
  if (i < 0) return null;
  const next = entries.slice();
  next[i] = { ...entries[i], grading: overlayGrading(entries[i].grading, grading, entries[i]), gradedAt: Date.now() };
  writeCfbLedger(next);
  return next[i];
}

/* ---------- bank (base $2,500 + logged moves + graded P/L, its own key) ---------- */

export function readCfbBankStore(): BankStore | null {
  const raw = rawItem(CFB_KEYS.bank);
  if (!raw) return null;
  try {
    const v = validateBankStore(JSON.parse(raw));
    return v.ok ? v.store : null;
  } catch {
    return null;
  }
}

export function writeCfbBankStore(store: BankStore): boolean {
  const ok = setRaw(CFB_KEYS.bank, JSON.stringify(store));
  bump();
  return ok;
}

/** The persisted bank store, initialized on first use. */
export function getCfbBankStore(): BankStore {
  const cur = readCfbBankStore();
  if (cur) return cur;
  const store: BankStore = { ...DEFAULT_BANK, log: [] };
  writeCfbBankStore(store);
  return store;
}

export function addCfbBankAdjustment(kind: "deposit" | "withdrawal", amt: number, note: string): BankStore {
  const store = getCfbBankStore();
  const clean = Math.max(0, Math.round(Number(amt) || 0));
  if (!(clean > 0)) return store;
  const next: BankStore = { ...store, log: [...store.log, { ts: Date.now(), kind, amt: clean, note: (note || "").slice(0, 120) }] };
  writeCfbBankStore(next);
  return next;
}

/** The one true CFB bankroll: base + logged adjustments + realized graded CFB P/L. Read-only
    (no first-use write) so it is safe to call from a render body or a query key. */
export function getCfbBankroll(): number {
  return cfbBankroll(readCfbBankStore() ?? DEFAULT_BANK, readCfbLedger());
}

/** Locked exposure (CORE + FUN stakes) for a slate date, in dollars. */
export function cfbExposure(date: string): number {
  return todayExposure(readCfbLedger(), date);
}

/* ---------- export / import / wipe ---------- */

export function exportCfbLedger(): string {
  return JSON.stringify(readCfbLedger(), null, 2);
}

export type CfbImportResult = { ok: true; entries: CfbLedgerEntry[]; added: number; merged: number } | { ok: false; error: string };

/** Merge an exported record into this device (union by date, richer day wins, accruals
    overlaid — the same kernel sync uses). Accepts the bare array or `{ ledger: [...] }`. */
export function importCfbLedger(text: string): CfbImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const wrapped = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { ledger?: unknown }).ledger : undefined;
  const list = Array.isArray(parsed) ? parsed : Array.isArray(wrapped) ? wrapped : null;
  if (!list) return { ok: false, error: "expected a ledger array" };
  const v = validateLedger(list);
  if (!v.ok) return { ok: false, error: v.error };
  const foreign = v.entries.find((e) => e.sport !== "cfb");
  if (foreign) return { ok: false, error: `entry ${foreign.date} is not a cfb entry (sport must be "cfb")` };
  const local = readCfbLedger();
  const have = new Set(local.map((e) => e.date));
  const merged = cfbEntriesOf(mergeLedgers(local, v.entries));
  const added = merged.filter((e) => !have.has(e.date)).length;
  const overlapped = v.entries.filter((e) => have.has(e.date)).length;
  if (!writeCfbLedger(merged)) return { ok: false, error: "device storage unavailable" };
  return { ok: true, entries: merged, added, merged: overlapped };
}

/** Drops the CFB ledger and bank from THIS device only (the cloud copy refills it on sync). */
export function wipeCfbDevice(): void {
  removeRaw(CFB_KEYS.ledger);
  removeRaw(CFB_KEYS.bank);
  bump();
}

/* ---------- actions (pure modules do the work; this stores the result) ---------- */

/** Lock a built card for its slate date. A date already locked is returned as-is with
    `refused: true` — the second press of LOCK can never re-stake a Saturday. */
export function lockCfb(card: CfbCard, board: CfbBoard): { entry: CfbLedgerEntry; refused: boolean } {
  const existing = findCfbEntry(card.date);
  if (existing) return { entry: existing, refused: true };
  const entry = lockCfbCard(card, board, Date.now());
  const r = upsertCfbEntry(entry);
  return { entry: r.entry, refused: r.refused };
}

/**
 * Grade a locked date against ESPN finals and store the verdict. Null when nothing is locked.
 *
 * RETURNS WHAT WAS STORED, NOT WHAT THE GRADER PROPOSED (INSTRUCTION 45, 2026-09-06, defect B3).
 * `applyCfbGrading` now overlays rather than replaces, so the grader's own output and the record
 * can differ — a `lost` proposed over a stored, uncorroborated void does not land. Returning the
 * proposal would make this function report a verdict the device does not hold. The one caller,
 * `gradeCfbPending` (src/components/cfb/CfbLedger.tsx), reads it for truthiness only ("days
 * touched"), and the entry exists on every path that reaches this line, so the count is unchanged.
 */
export function gradeCfb(date: string, finals: CfbFinals): CfbGrading | null {
  const entry = findCfbEntry(date);
  if (!entry) return null;
  return applyCfbGrading(date, gradeCfbEntry(entry, finals))?.grading ?? null;
}

/* ---------- the hook ---------- */

export type CfbLedgerSnapshot = {
  entries: CfbLedgerEntry[];
  bankStore: BankStore;
  bankroll: number;
  stats: { core: CfbStats; fun: CfbStats };
};

function compute(entries: CfbLedgerEntry[], bankStore: BankStore): CfbLedgerSnapshot {
  return {
    entries,
    bankStore,
    bankroll: cfbBankroll(bankStore, entries),
    stats: { core: cfbLedgerStats(entries, "core"), fun: cfbLedgerStats(entries, "fun") },
  };
}

let cachedVersion = -1;
let cached: CfbLedgerSnapshot | null = null;
function snapshot(): CfbLedgerSnapshot {
  if (cached && cachedVersion === version) return cached;
  cached = compute(readCfbLedger(), readCfbBankStore() ?? DEFAULT_BANK);
  cachedVersion = version;
  return cached;
}

let empty: CfbLedgerSnapshot | null = null;
function serverSnapshot(): CfbLedgerSnapshot {
  if (!empty) empty = compute([], DEFAULT_BANK);
  return empty;
}

function subscribe(cb: () => void): () => void {
  const onExternal = () => {
    version++;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CFB_KEYS.ledger || e.key === CFB_KEYS.bank) onExternal();
  };
  window.addEventListener(CFB_CHANGE_EVENT, cb);
  window.addEventListener(CFB_SYNC_EVENT, onExternal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CFB_CHANGE_EVENT, cb);
    window.removeEventListener(CFB_SYNC_EVENT, onExternal);
    window.removeEventListener("storage", onStorage);
  };
}

/* stable identities — safe in effect dependency arrays */
const ACTIONS = {
  addAdjustment: addCfbBankAdjustment,
  lock: lockCfb,
  grade: gradeCfb,
  importText: importCfbLedger,
  exportText: exportCfbLedger,
  wipe: wipeCfbDevice,
} as const;

/** Everything the CFB Ledger / Builder / Settings need, live from the device record. Empty on
    the server and during hydration; the real record appears right after mount. */
export function useCfbLedger() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { ...snap, ...ACTIONS };
}
