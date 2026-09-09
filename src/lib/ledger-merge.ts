import { PAPER } from "@/lib/paper-mode";
import { CFB_PAPER } from "@/lib/cfb/rules";
import { NFL_PAPER } from "@/lib/nfl/rules";

/**
 * THE DESK ALLOTMENT TABLE (2026-09-08, the NFL build). `allotmentCap` / `funCap` used to ask
 * "is either side CFB?" and pick between two constants; with a third desk the question is "which
 * desk is this entry?", answered off the entry's own `sport` (absent on MLB entries, "cfb" or
 * "nfl" on the football ones). The fallback for an unknown or missing sport is the MLB PAPER set,
 * exactly as before. Today's numbers: MLB 150 / 25, CFB 250 / 25, NFL 350 / 25.
 */
const DESK_PAPER: Record<string, { daily: number; fun: number }> = { mlb: PAPER, cfb: CFB_PAPER, nfl: NFL_PAPER };

function sportOf(e: SyncEntry): string | null {
  const s = (e as { sport?: unknown }).sport;
  return typeof s === "string" ? s : null;
}

/** the desk's own paper set for a pair of copies of one date — the first readable `sport` decides */
function deskPaperOf(base: SyncEntry, other: SyncEntry): { daily: number; fun: number } {
  const s = sportOf(base) ?? sportOf(other);
  return DESK_PAPER[s ?? "mlb"] ?? PAPER;
}

/**
 * Ledger sync — the shared merge kernel. Pure TypeScript, no browser, no
 * server imports: the client (ledgerSync.ts) and the API route both use it,
 * so both sides agree on what "the same record" means. The two imports above
 * are the desks' own paper allotments — pure constant modules with no imports
 * of their own (so no cycle) and no runtime of their own, already shared by
 * the server cron and the browser engine.
 *
 * The ledger is append-only by date and only LOCKED days sync. Merging is a
 * union by date; when both sides carry the same date the entries are the same
 * locked card, differing only in what accrued afterwards (grading, CLV
 * sightings, NV price confirms) — so the richer entry wins as the base and
 * the other side's accruals are overlaid onto anything the base is missing.
 * The rules are symmetric and deterministic: merge(a,b) === merge(b,a), and
 * re-merging is a no-op, which is what lets two devices converge no matter
 * who syncs first.
 */

export type SyncTicket = {
  id?: string;
  confirmed?: number | null;
  /**
   * PLACEMENT (2026-08-02). The system locks a card every day and NEVER places; these are the
   * only fields that record what Josh actually did with it. THREE STATES, and the third is the
   * point: `true` = placed · `false` = deliberately NOT placed, a decision · `null`/absent =
   * UNANSWERED. **Reading a null as a false turns "we don't know" into "he passed"**, which
   * silently changes the denominator of every P&L figure — so null is preserved and counted.
   */
  placed?: boolean | null;
  /** What was actually risked, which need not equal the sized stake. Null until answered. */
  actualStake?: number | null;
  [k: string]: unknown;
};

/**
 * Per-ticket fields that ACCRUE after the lock and must survive a merge from either side.
 *
 * WHY THIS IS A LIST AND NOT THREE COPIES OF THE SAME CODE: `mergeDay` deep-copies the
 * pickBase winner, so any per-ticket field NOT named here is DROPPED when the other device
 * wins. `confirmed` was the only member and the rule lived inline; adding `placed` without
 * generalising would have lost real-money answers to a background sync with no error anywhere.
 * **Anything added to a ticket after the lock belongs in this list.**
 * Guard: `tests/placed-field.test.ts` (observed red on all three fields before the fix).
 *
 * TWO FIELDS ARE CARRIED ELSEWHERE, not here (INSTRUCTION 45, 2026-09-06): `stake` and its
 * `topUp` move through the SHARED-ID RAISE in `unionCore`, under the union's AGREEMENT and
 * ALLOTMENT gates. They cannot be plain accruals — `fill` is fill-only ("an existing answer is
 * never overwritten"), and a raise by definition overwrites an existing stake. So this list is
 * still exhaustive for accruals; it is no longer the ONLY path off the losing entry.
 */
export const ACCRUAL_FIELDS = ["confirmed", "placed", "actualStake"] as const;

export type SyncEntry = {
  date: string;
  locked: boolean;
  core: SyncTicket[];
  funT?: SyncTicket[];
  grading?: {
    done?: boolean;
    tickets?: Record<string, unknown>;
    legs?: Record<string, unknown>;
  } | null;
  clv?: Record<string, { am: number; at: number }>;
  /** PER-BLOCK LOCKING (2026-08-08): each block fire records its scope here — budget
      (pro-rata share of `daily`), tickets appended, the block's game keys (the
      TWO-CARDS-ONE-GAME check reads these), and when it fired. Additive; days locked
      before this ship simply have no blocks map. */
  blocks?: Record<string, { budget: number; tickets: number; gkeys?: string[]; firedAt?: number }>;
  /** DUAL-MODE TRACKING (2026-08-21, Josh's word: "track bets for both internally so it
      can calibrate either selection"): the OTHER disciplined selection's card for the same
      day, built by the same server pipeline. Internal — never in core, never in any net. */
  alt?: { selMode: string; core: SyncTicket[]; allocSum: number; gatedSum: number; underShare?: number };
  [k: string]: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRIES = 500;
export const MAX_BYTES = 900_000;

/** Locked-day shape check for anything arriving over the wire or from disk. */
export function validateLedger(x: unknown): { ok: true; entries: SyncEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "ledger must be an array" };
  if (x.length > MAX_ENTRIES) return { ok: false, error: `more than ${MAX_ENTRIES} days` };
  const seen = new Set<string>();
  for (const e of x) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { ok: false, error: "entry is not an object" };
    const d = (e as SyncEntry).date;
    if (typeof d !== "string" || !DATE_RE.test(d)) return { ok: false, error: "entry missing a YYYY-MM-DD date" };
    if ((e as SyncEntry).locked !== true) return { ok: false, error: `unlocked entry (${d}) — only locked days sync` };
    if (!Array.isArray((e as SyncEntry).core)) return { ok: false, error: `entry ${d} has no core tickets array` };
    if (seen.has(d)) return { ok: false, error: `duplicate date ${d}` };
    seen.add(d);
    /* PLACEMENT SHAPE (2026-08-02) — validated only WHEN PRESENT, so every existing client
       stays valid and the field is purely additive. A malformed `placed` must not reach the
       store: it is the denominator of the realized-P&L population. */
    for (const t of [...(e as SyncEntry).core, ...((e as SyncEntry).funT ?? [])]) {
      const p = (t as SyncTicket).placed;
      if (p !== undefined && p !== null && typeof p !== "boolean") {
        return { ok: false, error: `entry ${d}: placed must be boolean or null, got ${typeof p}` };
      }
      const s = (t as SyncTicket).actualStake;
      if (s !== undefined && s !== null && !(typeof s === "number" && Number.isFinite(s) && s >= 0)) {
        return { ok: false, error: `entry ${d}: actualStake must be a finite number >= 0 or null` };
      }
    }
  }
  if (JSON.stringify(x).length > MAX_BYTES) return { ok: false, error: "ledger too large" };
  return { ok: true, entries: x as SyncEntry[] };
}

function clvCount(e: SyncEntry): number {
  return e.clv ? Object.keys(e.clv).length : 0;
}
function confirmedCount(e: SyncEntry): number {
  let n = 0;
  for (const t of [...e.core, ...(e.funT ?? [])]) if (t.confirmed != null) n++;
  return n;
}
function gradeScore(e: SyncEntry): number {
  if (!e.grading) return 0;
  return e.grading.done ? 2 : 1;
}

/* ============================================================================================
 * THE CORE UNION — INSTRUCTION 45 (2026-09-06), Josh verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day".
 *
 * WHAT WENT WRONG. `mergeDay` unioned `funT` by ticket id and never `core`, because until the
 * CFB server lock shipped only the supplemental FUN lock ever appended to a locked day. The CFB
 * top-up (src/lib/cfb/lock-server.ts `planCfbTopUp` / `applyCfbTopUp`) now appends CORE tickets
 * hours after the lock, to reach the $150 the lock instant could not deploy. So: Josh pulls the
 * $75 server entry at noon and the CFB Ledger tab grades it — his copy gains grading richness;
 * the server tops the day up to $150 at 1pm; his app pushes at 2pm; `pickBase` prefers his graded
 * $75 copy (gradeScore outranks everything below it) and `out` is a deep copy of it, so the three
 * appended core tickets and the day's extra $75 are DELETED from durable state. The ledger goes on
 * calling it a full paper day, `ledgerStats` scores $75, and `cfbBankroll` sizes every later day
 * off the wrong number. Exactly the hazard the funT union above was written for, on the money side.
 *
 * WHY THE UNION IS GUARDED AND NOT BLIND. CFB core ids are POSITIONAL — `cfb-<date>-core-<i>`
 * (src/lib/cfb/card.ts) — not content-addressed the way MLB's are (the engine's shTicketId is the
 * ticket type plus a hash of its sorted legs, so one bet has one id on every device, forever). Two
 * independent locks of one CFB date — Josh's Builder lock on a device that has not synced, and the
 * server's — therefore both mint `cfb-<date>-core-1` holding DIFFERENT bets. A blind union would
 * append the loser's surplus tickets onto a card that is already a full day's money, staking a
 * Saturday twice. tests/cfb-lock-route.test.ts already pins that rival case ("a device copy of the
 * SAME date outranks the server's — the phone's lock is never replaced"), and this union must not
 * break that pin. So two gates, both of which a genuine append passes by construction:
 *
 *   AGREEMENT   the sides must agree about every id they SHARE: same id ⇒ same bet. An append
 *               copies the existing tickets through byte for byte (`applyCfbTopUp` spreads
 *               `entry.core`; the MLB block fire carries `carry.core` and dedupes by id), so a
 *               real append always agrees. Two rival cards disagree on the very first positional
 *               id, and the union then refuses entirely — the base's card stands whole, which is
 *               the behaviour that shipped before this block and the one the route's pin expects.
 *               The bet is compared on the LEG IDENTITY fields only, never on price or stake: a
 *               re-quoted leg is the same wager, and MLB's own top-up raises a shared ticket's
 *               stake under its existing id (src/lib/server/lock-card.ts `withTopUp`).
 *   ALLOTMENT   the union may never carry the merged core past the day's own recorded `daily` —
 *               the core allotment both desks size to and the CFB money guard asserts on
 *               (`assertCfbCardMoney`, src/lib/cfb/lock-server.ts, read this turn:
 *               `if (coreSum > CFB_PAPER.daily + MONEY_EPS) {` throws). So merged core stake is
 *               at most max(base's own core stake, daily), and no merge can inflate a day.
 *               When NEITHER side carries a numeric `daily` the gate falls back to the DESK'S OWN
 *               allotment — see `allotmentCap` below for why that default was inverted.
 *
 * Appends are deep-copied and ordered by ticket id, so the merged day is a pure function of the
 * two inputs whatever order either side happened to store its tickets in, and `mergeDay` stays
 * symmetric and idempotent. A ticket id already on the base is never appended — a shared id is a
 * fill (ACCRUAL_FIELDS above) or a RAISE (below), never a second copy, so no day can be
 * double-staked by a re-merge.
 *
 * ── THE SHARED-ID RAISE (defect D, same instruction, same day) ───────────────────────────────
 * The union above closed only half the hazard. It appends tickets carrying NEW ids, but the
 * pickBase winner is deep-copied wholesale and `fill` copies only ACCRUAL_FIELDS — so a stake
 * RAISED under an EXISTING id was still discarded. MLB's residue top-up does exactly that
 * (src/lib/server/lock-card.ts `withTopUp`: `{ ...t, stake: Number(t.stake) + tu[t.id],
 * topUp: tu[t.id] }`), and it is deliberately invisible to AGREEMENT, which compares LEG IDENTITY
 * and never price or stake.
 *
 * MEASURED: the phone's copy of 2026-09-05 core `[MIXED_a1 $40, MIXED_b2 $35]` with
 * `grading:{done:false}` (gradeScore 1) against the server's copy after the 2pm residue fire
 * `[MIXED_a1 $60 (topUp:20), MIXED_b2 $35]` with no grading (gradeScore 0). pickBase took the
 * phone, the append pass found no new ids, and the merged day carried `MIXED_a1.stake === 40`,
 * `topUp === undefined`, core sum 75 — the $20 the desk actually deployed deleted from durable
 * state, with ledgerStats / realizedPL / computeBankroll all scoring the smaller day.
 *
 * THE RULE: under the same two gates, when the sides agree on a shared id's BET but differ on its
 * stake, the larger stake wins — BUT ONLY WITH A RECEIPT.
 *
 * ── THE RAISE NEEDS A RECEIPT (defect N3, same instruction, same day) ────────────────────────
 * The raise first shipped as plain LARGER-WINS, justified as "no writer on either desk ever
 * LOWERS a stake under a fixed id". THAT JUSTIFICATION WAS FALSE on the MLB rail and the claim is
 * withdrawn here. `buildModeCard` (src/lib/server/lock-card.ts) runs `shAllocate` over the whole
 * slate pool, and the ids/legs exclusion built from `carriedTix` is applied only to the FORCED
 * pass's `rest` — so a later block fire re-picks a bet an earlier fire already staked. MLB ids are
 * content-addressed, so it re-mints the SAME id at a smaller pro-rata stake, and
 * `const carried = (carry?.core ?? []).filter((t) => !newCore.some((n) => n.id === t.id))` lets
 * the new copy REPLACE the carried one. The stored day then holds p:abc at $12 where an earlier
 * fire recorded $40. MEASURED: a device that pulled before block 2 still holds $40, PUTs it, and
 * plain larger-wins raised the stored $12 back to $40 — merged core sum 90 on a day whose own
 * `allocSum` records 62, with nothing anywhere to reconcile the two. Before this round `mergeDay`
 * never touched core at all, so the stored value was authoritative and this could not happen.
 * (The double-pick in `buildModeCard` is a pre-existing MLB allocator defect and is NOT fixed
 * here; this gate only stops the merge from laundering its output into durable state.)
 *
 * SO THE RAISE IS GATED ON EVIDENCE THAT THE LARGER STAKE WAS ACTUALLY DEPLOYED. The one writer
 * that legitimately raises a shared id is `withTopUp` (src/lib/server/lock-card.ts:
 * `{ ...t, stake: Number(t.stake) + tu[t.id], topUp: tu[t.id] }`), and it STAMPS THE DELTA IT
 * ADDED. The union therefore takes the larger stake only when the two copies' `topUp` stamps
 * account for the difference, which says precisely: both stakes rest on ONE allocator sizing and
 * everything above it is residue a fire really deployed. A stale copy of a differently-sized fire
 * carries no such receipt (it has no `topUp` at all, or one that describes a different fire's
 * arithmetic) and is refused, leaving the stored value standing exactly as it did before this
 * block existed.
 * The raise carries `stake` AND `topUp` together because `stake − topUp` is how the allocator's
 * own sizing stays recoverable (lock-card.ts stamps them in one object) — carrying one without
 * the other would make that subtraction lie, and it is now also the receipt a re-merge re-reads.
 *
 * ── THE RECEIPT IS A DIFFERENCE, NOT AN ABSOLUTE (defect K1, a regression of N3, same
 *    instruction, same day) ──────────────────────────────────────────────────────────────────
 * N3 first shipped the comparison as `m.stake − t.stake === m.topUp`, reading the raiser's own
 * `topUp` as if it were the day's running total on that ticket. It is not. `withTopUp` stamps
 * THAT FIRE's addition and each block fire recomputes its residue from its own numbers, so a
 * ticket re-picked in a later fire carries a DIFFERENT `topUp` in each stored copy. The gate
 * therefore held only when the base carried NO topUp on the shared ticket — exactly the
 * single-fire case N3 was measured on — and REFUSED every legitimate SECOND top-up.
 *
 * MEASURED twice on `unionCore` directly: base `{ id: "p:abc", stake: 22, topUp: 2 }` against
 * other `{ id: "p:abc", stake: 25, topUp: 5 }` — delta 3, tu 5, `Math.abs(delta − tu) < 1e-6`
 * false, the raise refused, and the merged stake left at 22 against the 25 actually deployed. At
 * fire-1/fire-2 scale, base `{ stake: 40, topUp: 10 }` against other `{ stake: 50, topUp: 20 }`
 * merged to stake 40 / topUp 10 and realizedPL scored −40 on a lost ticket whose truth is −50.
 *
 * So the receipt is the DIFFERENCE OF THE TWO RECEIPTS: `delta === m.topUp − t.topUp`. With no
 * topUp on the base that is N3's own arithmetic, so nothing N3 got right changes;
 * what changes is that a second top-up is no longer indistinguishable from a stale copy. Both of
 * N3's refusals are re-verified in tests/ledger-merge.test.ts.
 *
 * CFB is unaffected either way: `planCfbTopUp` mints NEW ids (`cfb-<date>-topup<n>-core-<i>`) and
 * `applyCfbTopUp` says it in the file — "a top-up never re-stakes a game, never lowers a stake" —
 * so a CFB top-up travels through the APPEND pass, never the raise.
 *
 * A RAISE ALSO INVALIDATES THE VERDICT IT WAS PRICED UNDER (defect N1) — `unionCore` returns the
 * ids whose stake moved and `mergeDay` withdraws their grades; see THE RAISE INVALIDATES ITS
 * VERDICT there for the measured $38 error and for why the verdict is deleted, not rescaled.
 *
 * THE RECONCILIATION RUNS FIRST, THEN THE APPENDS — INSTRUCTION 45, FINAL K6 (2026-09-06), a
 * FALSE CITATION corrected. This paragraph said "APPENDS RUN FIRST, THEN RAISES, each in ticket-id
 * order against the same running sum", and `unionCore` has done the opposite since the
 * reconciliation shipped (defect C2): the reconciliation walks `base.core` in the BASE'S OWN array
 * order, and only then does the append pass walk the unseen ids in TICKET-ID order against the
 * reconciled sum. Neither half of the old sentence held — not the order of the two passes, and not
 * "ticket-id order" for the reconciliation.
 *
 * THAT ORDER IS DELIBERATE: money on a wager BOTH copies already hold is settled before anything
 * is measured against the allotment, so the room the append pass is offered is room the two copies
 * agree this card has, rather than whatever the pickBase clone happened to carry. Fixed order also
 * makes the result a pure function of (base, other) — and since pickBase chooses the same base in
 * either argument order, `mergeDay` stays symmetric. It stays IDEMPOTENT because both passes are
 * at a fixed point after one merge: every shared id is seated at the stake the pair agrees on, so
 * a re-merge finds no difference to move — or re-derives the same refusal, marker included — and
 * every id the base lacked is either seated (and so no longer unseen) or refused again for the
 * same reason. Both properties are asserted in tests/ledger-merge.test.ts.
 * ========================================================================================== */

/** The fields that say WHICH SIDE of WHICH MARKET a leg is — never a price, never a stake. */
const LEG_IDENTITY = ["lkey", "gkey", "label", "prop", "market", "side", "line"] as const;

/* ============================================================================================
 * A MISSING FIELD IS NOT A DIFFERENT BET — INSTRUCTION 45, defect A2's first rule (2026-09-06), a
 * REGRESSION of the agreement gate itself.
 *
 * WHAT WENT WRONG. The old `betOf` projected each leg onto LEG_IDENTITY with `o[f] ?? null` and
 * compared the two JSON strings, so ABSENT and PRESENT read as a disagreement. And the drift is
 * built into the write path: `toTicket` in src/lib/server/lock-card.ts writes its legs as, read
 * this turn —
 *
 *     legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null,
 *       prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),
 *
 * — `gkey` is CONDITIONALLY PRESENT. `legOf` in src/lib/cfb/card.ts always sets `gkey: row.gameId`
 * (read this turn), so the same wager can reach two copies with and without the key, NEITHER copy
 * wrong, and the old projection called them rival cards.
 *
 * THE RULE IS A POSITIVE DISAGREEMENT. Two copies of one leg differ on a field only when BOTH
 * record a value and the values differ. A field one side simply does not carry says nothing about
 * WHICH SIDE OF WHICH MARKET the leg is — which is the only question LEG_IDENTITY exists to ask.
 * The LEG COUNT still has to match, because a different number of legs is a different wager no
 * matter what the individual legs say.
 *
 * This can only ever make the gate MORE permissive on a pair the old one already accepted, and it
 * never makes two genuinely different sides agree: `lkey` "g9|MICH" against "g1|ALA" is two
 * recorded values that differ, and that is still a refusal — pinned in tests/ledger-merge.test.ts
 * both by "REFUSES the union when the two sides disagree about a shared id" and by the D2 block.
 * ========================================================================================== */
/** Do two copies of one leg record CONTRADICTORY identity, as opposed to unequal completeness? */
function legsDiffer(a: unknown, b: unknown): boolean {
  const p = (a ?? {}) as Record<string, unknown>;
  const q = (b ?? {}) as Record<string, unknown>;
  return LEG_IDENTITY.some((f) => {
    const u = p[f];
    const v = q[f];
    if (u == null || v == null) return false;
    return JSON.stringify(u) !== JSON.stringify(v);
  });
}

/** Do the two sides mean the SAME wager by one shared ticket id? */
function sameBet(t: SyncTicket, m: SyncTicket): boolean {
  const legsOf = (x: SyncTicket): unknown[] =>
    Array.isArray((x as { legs?: unknown }).legs) ? ((x as { legs: unknown[] }).legs) : [];
  const mine = legsOf(t);
  const theirs = legsOf(m);
  if (mine.length !== theirs.length) return false;
  return !mine.some((l, i) => legsDiffer(l, theirs[i]));
}

/**
 * Do the two copies' own `topUp` stamps ACCOUNT for the difference between their stakes? — the
 * receipt test, read off the unordered pair. See THE RAISE NEEDS A RECEIPT and THE RECEIPT IS A
 * DIFFERENCE above `pickBase` for the whole argument: `stake − topUp` is the allocator's own
 * sizing, so two copies whose stamps differ by exactly the stake difference rest on ONE sizing and
 * differ only in residue a fire really deployed. A stale copy carries no stamp (`tu` is NaN and
 * fails `Number.isFinite`) or one describing a different fire's arithmetic, and is refused.
 *
 * LIFTED OUT OF `unionCore`'S RECONCILIATION LOOP (INSTRUCTION 45, FINAL2 K1, 2026-09-06) so the
 * loop and the FLOOR it is now measured against ask the identical question. Two copies of this
 * expression could drift, and the floor is only a sound bound while it agrees with the decision
 * exactly. Nothing else changed: the loop's own `hi`/`lo` are chosen by stake the same way.
 */
function receiptedPair(a: SyncTicket, b: SyncTicket): boolean {
  const [hi, lo] = (Number(a.stake) || 0) >= (Number(b.stake) || 0) ? [a, b] : [b, a];
  const tu = Number(hi.topUp);
  return (
    Number.isFinite(tu) &&
    Math.abs((Number(hi.stake) || 0) - (Number(lo.stake) || 0) - (tu - (Number(lo.topUp) || 0))) < 1e-6
  );
}

const stakeSum = (tix: SyncTicket[]): number => tix.reduce((s, t) => s + (Number(t.stake) || 0), 0);
const byId = (p: SyncTicket, q: SyncTicket) => (String(p.id) < String(q.id) ? -1 : String(p.id) > String(q.id) ? 1 : 0);

/**
 * THE ALLOTMENT CEILING for a merged day — the day's own recorded `daily` when either side has
 * one, and otherwise the DESK'S OWN allotment.
 *
 * THE DEFAULT WAS INVERTED (INSTRUCTION 45, defect E, 2026-09-06). The gate used to be SKIPPED
 * when `daily` was absent, on the reasoning that legacy days predate the field and an append is
 * worth more than a missing number. Measured synthetically: two copies of one date with `daily`
 * deleted, one graded at $75 and one carrying two $100 tickets, merged to a core sum of 275 on a
 * day whose ceiling is $150 — and NO GUARD RUNS ON A MERGE RESULT, so that number would simply
 * have become the record. The critic could not reach the branch with real entries (`lockCfbCard`
 * in src/lib/cfb/ledger.ts and `buildLockEntry` in src/lib/server/lock-card.ts both stamp `daily`
 * unconditionally; the one writer that omits it, `buildReasonRecord`, emits `core: []` and so has
 * nothing to union), but nothing stops a future writer omitting the field, and an unbounded union
 * is the one failure mode this whole block exists to prevent.
 *
 * NOT ENFORCED IN `validateLedger` INSTEAD, deliberately: `buildReasonRecord` runs its own output
 * through that validator and would then throw on every no-bet day, and every epoch-1 client entry
 * that predates the field would stop syncing. A rejection turns a latent merge hazard into a live
 * outage; a fallback bounds the same hazard and cannot break a legacy day.
 *
 * The desk is read off `sport` — the field `validateCfbLedger` already requires on every CFB
 * entry — and both allotments are $150 today, so this is about which constant the bound FOLLOWS,
 * not about today's arithmetic.
 *
 * ── A STORED BLOB CANNOT RAISE ITS OWN CORE CEILING (INSTRUCTION 45, defect A1, 2026-09-06) ──
 * Josh's instruction this round: "Parlay Lab CFB should've been running the same $150 per day
 * theoretical Core money and $25 Fun money per day". The fun half of that sentence was already
 * enforced — see `funCap` immediately below, whose closing paragraph reported this same hazard on
 * the core side as a CARRY-FORWARD and named the reconciliation in `unionCore` as its stand-in
 * guard. The carry-forward came due: the reconciliation only backstops a RAISE to a stake that is
 * already shared, and the APPEND pass has nothing to do with it.
 *
 * WHAT WENT WRONG. The form was `Number(base.daily ?? other.daily)` — read ONE side's number and
 * believe it. `pickBase` chooses that side on GRADING RICHNESS, then CLV count, then confirmed
 * count, then byte length, then raw JSON compare; not one link of that chain is a claim about the
 * day's allotment, and NOTHING on the merge rail checks `daily`: `validateLedger` above reads the
 * date, the `placed` shape and the `actualStake` shape and no money field at all.
 *
 * MEASURED (fixtures dated 2026-09-05, sport cfb): a copy claiming `daily: 500` carrying eight
 * $25 core tickets, graded, so it wins pickBase on gradeScore — merged with an honest `daily: 150`
 * copy carrying one further $25 ticket. Result: NINE tickets, coreSum 225 on a desk that deploys
 * $150 of core money a day, `capBreach` UNDEFINED because the inflated claim had also become the
 * number the breach is measured against, and `daily: 500` carried FORWARD onto the merged day —
 * so the very next merge inherited the raised ceiling and seated a tenth ticket at coreSum 250.
 *
 * THE FIX IS `funCap`'S SHAPE, VERBATIM. The desk's own allotment is the ceiling; a recorded
 * `daily` may only LOWER it, and only when it is the LARGEST claim on the day (that is A1's floor
 * argument on the fun rail, kept intact here: the smaller of two claims about ONE day must not
 * bound a ticket the larger one already seated). A stored blob writing a bigger number into itself
 * changes nothing. The desk is read off `sport`, the field `validateCfbLedger` already requires on
 * every CFB entry.
 *
 * WHY THE INVERTED-DEFAULT ARGUMENT ABOVE SURVIVES UNCHANGED: a day with no readable `daily` still
 * falls back to the desk's allotment, which is the whole point of defect E. The allotments were
 * both $150 when this was written; since 2026-09-08 they differ per desk (PAPER.daily 150 in
 * src/lib/paper-mode.ts, CFB_PAPER.daily 250 in src/lib/cfb/rules.ts, NFL_PAPER.daily 350 in
 * src/lib/nfl/rules.ts — the DESK_PAPER table above), which is exactly why the bound follows the
 * entry's OWN desk rather than one shared number. Every honest writer is arithmetically unchanged:
 * `lockCfbCard` (src/lib/cfb/ledger.ts) and `buildLockEntry` (src/lib/server/lock-card.ts) both
 * stamp the desk's own number, so `Math.min(desk, recorded)` is the recorded daily — a CFB day
 * locked at 150 before the widening still caps at its own 150. What changes is only the direction
 * that was never defensible — upward.
 */
function allotmentCap(base: SyncEntry, other: SyncEntry): number {
  const desk = deskPaperOf(base, other).daily;
  const recorded = [(base as { daily?: unknown }).daily, (other as { daily?: unknown }).daily]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  return recorded.length ? Math.min(desk, Math.max(...recorded)) : desk;
}

/**
 * THE FUN ALLOTMENT CEILING — the same rule as `allotmentCap`, on the other half of Josh's
 * instruction (45, 2026-09-06): "$150 per day theoretical Core money **and $25 Fun money per
 * day**". The day's own recorded `fun` when either side has one, else the desk's own allotment.
 *
 * WHY THIS EXISTS ONLY NOW (defect N2, a regression of this same round). The funT union below has
 * NEVER had a bound, and that was harmless purely by accident: every CFB copy's fun ticket was the
 * single id `cfb-<date>-fun-1`, so the union could never find a new id to append, and the MLB fun
 * bucket is built once per day (`buildLockEntry`: `if (funT.length === 0) { ... }`, sized to
 * PAPER.fun across however many tickets it mints) and carried byte for byte afterwards. Then
 * `planCfbTopUp` (src/lib/cfb/lock-server.ts) started minting a SECOND distinct fun id,
 * `cfb-<date>-topup<n>-fun-1`, and the append became reachable.
 *
 * MEASURED: two overlapping pokes of 2026-09-05, the second reading `cur` before the first had
 * SET, so the blob's last write carries `topup2-fun-1` and the phone still holds `topup1-fun-1`
 * from its pull in between. The merge appended one to the other: funT sum $50 against
 * CFB_PAPER.fun = $25. `assertCfbCardMoney`'s funSum guard runs only on the server WRITE paths,
 * and `validateLedger` above checks dates and placed/actualStake shapes only — NOTHING on the
 * merge rail looks at stakes — so the $50 would simply have become the record, in todayExposure
 * and in realizedPL.
 *
 * ── THE CEILING IS THE LARGEST CLAIM, NOT THE BASE'S (INSTRUCTION 45, defect A1's second shape,
 *    a regression of N2, 2026-09-06) ────────────────────────────────────────────────────────────
 * N2 shipped this as `base.fun ?? other.fun`, which reads the BASE's number first and stops. But
 * `pickBase` chooses the base on GRADING RICHNESS (then CLV, then confirmed count, then byte
 * length) — nothing in that ordering is a claim about the day's fun allotment. So a copy carrying
 * a token positive `fun` shrank the whole merged day's fun ceiling to that token: MEASURED, a
 * graded copy carrying `fun: 1` and an EMPTY fun bucket against a copy carrying `fun: 25` and one
 * real `cfb-2026-09-05-zfun-1 @ $25` ticket merged to funT [] / $0, the $25 wager refused into an
 * empty bucket and only named on `funDropped`.
 *
 * A1's ANSWER WAS `Math.max(desk, ...recorded)`, AND IT WAS RIGHT ABOUT THE FLOOR AND WRONG ABOUT
 * THE CEILING (INSTRUCTION 45, defect C3, a REGRESSION of A1, 2026-09-06). Taking the LARGEST of
 * the two claims stops a token `fun: 1` shrinking a real day — but it also lets the larger of two
 * recorded claims RAISE the merged day's limit, and `validateLedger` above checks the date, the
 * `placed` shape and the `actualStake` shape and NOTHING about `fun`, so an inflated claim is
 * simply believed. MEASURED: a copy claiming `fun: 100` carrying one $25 fun ticket, merged with a
 * copy claiming the desk's own `fun: 25` and a DIFFERENT $25 ticket, seated BOTH — funT sum $50 on
 * a desk that deploys $25 of fun money a day, and with no `capBreach` either, because the inflated
 * claim had also become the number the breach is measured against.
 *
 * THE CEILING IS THE DESK'S OWN ALLOTMENT. A recorded `fun` is a writer's claim about one day; the
 * desk's allotment is the standing rule Josh stated ("$25 Fun money per day"), and a stored blob
 * must not be able to raise its own limit by writing a bigger number into itself. So the ceiling
 * is the desk's allotment, which a recorded claim may only LOWER — and only when it is the LARGEST
 * claim on the day, which is A1's floor argument kept intact: the smaller of two claims about ONE
 * day still cannot bound a ticket the larger one already seated.
 *
 * Every existing case is arithmetically unchanged: both CFB writers stamp `fun: CFB_PAPER.fun`
 * (src/lib/cfb/ledger.ts `lockCfbCard`), MLB entries stamp no `fun` at all and take the desk's own
 * number, A1's `fun: 1` against `fun: 25` still yields 25, and a legacy day whose `fun` is
 * unreadable still falls back to the desk. What changes is only the direction that was never
 * defensible — upward.
 *
 * `allotmentCap` above CARRIED THE OLD `base ?? other` SHAPE when this paragraph was first
 * written, and this block closed by reporting that as a carry-forward. THE CARRY-FORWARD IS NOW
 * CLOSED (INSTRUCTION 45, defect A1, 2026-09-06): `allotmentCap` was given this function's shape
 * verbatim — desk allotment as the ceiling, largest recorded claim as the only thing that may
 * lower it — because the reconciliation in `unionCore` backstops only a RAISE to a SHARED stake
 * and never bounded the APPEND pass at all. See that function's own block for the measured
 * nine-ticket / coreSum-225 shape.
 */
function funCap(base: SyncEntry, other: SyncEntry): number {
  const desk = deskPaperOf(base, other).fun;
  const recorded = [(base as { fun?: unknown }).fun, (other as { fun?: unknown }).fun]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  return recorded.length ? Math.min(desk, Math.max(...recorded)) : desk;
}

/* ============================================================================================
 * THE CAP MUST NOT DELETE MONEY THAT IS ALREADY SETTLED — INSTRUCTION 45, defect A1 (2026-09-06),
 * a REGRESSION of N2/K4 above.
 *
 * WHAT WENT WRONG. `unionFun`'s cap collision decided which of two rival $25 fun tickets survived
 * by `pickBase` plus ticket-id byte order, and NEITHER of those is a fact about the money. Last
 * round the CFB DEVICE rail was delegated to this same function — src/lib/cfb/store.ts
 * `upsertCfbEntries` runs `mergeLedgers([cur], [entry])` and takes `funT` and `funDropped` off the
 * merged day ("THE FUN BUCKET IS THE SYNC RAIL'S OWN ANSWER", verified in that file today) — so
 * the defect ran on BOTH rails, including the copy the phone renders.
 *
 * MEASURED, both fixtures dated 2026-09-05 / sport cfb / fun 25. STORED (the device copy) funT
 * [`cfb-2026-09-05-zfun-1` @ $25], grading {done:true, tickets:{zfun-1: won, payout 47.73},
 * legs:{"g1|ml|home|": won}}. INCOMING core [`cfb-2026-09-05-core-1` @ $25], funT
 * [`cfb-2026-09-05-afun-1` @ $25], grading carrying TWO graded tickets (both lost) — richer, so
 * `pickBase` seats the INCOMING as the base. Result: funT [afun-1], funDropped [zfun-1], day P/L
 * −50.00, and `grading.tickets` left holding an ORPHANED `zfun-1: won` verdict for a ticket no
 * longer on the day. A settled winner deleted, on the strength of "a" sorting before "z".
 * Reachable in production on the sync rail through the two overlapping top-up pokes `funCap`'s own
 * N2 block measures, each minting a distinct `cfb-<date>-topup<n>-fun-1`.
 *
 * A1's ANSWER WAS "SETTLED MONEY IS SEATED FIRST", AND IT OVER-CORRECTED (INSTRUCTION 45, defect
 * C1, a REGRESSION of A1, same day). It ranked on `RESOLVED = won | lost | push`, so ANY settled
 * ticket — including one LOST at payout 0 — displaced a LIVE, PLACED, ungraded wager, and the
 * evicted wager left no receipt at all because A1 recorded `droppedPL` only when the dropped
 * ticket already carried a verdict. MEASURED, both merge orders and both rails: the phone's
 * `cfb-2026-09-05-fun-1 @ $25`, `placed: true`, `actualStake: 25`, ungraded, against the server's
 * `cfb-2026-09-05-topup1-fun-1 @ $25` graded LOST at payout 0 — merged funT [topup1-fun-1],
 * funDropped [fun-1], funDroppedPL UNDEFINED, realizedPL −25.00, where the same day with the
 * phone's own ticket graded measures +65.00. A $90 error on one ticket, into `computeBankroll` and
 * every Kelly stake sized after it. And on the MLB rail it SHRANK the bucket: the base's
 * `mlb-hr-1 @ $25` (placed) against a settled `mlb-supp @ $10` won at payout 30 seated the $10
 * winner first, left the $25 wager unable to fit under PAPER.fun, and returned a $10 day —
 * $25 of placed money deleted and $15 of the desk's own allotment unstaked. The ranking was also
 * not STABLE OVER TIME: the same pair seated topup1-fun-1 while fun-1 was ungraded and flipped
 * back to fun-1 the moment fun-1's verdict arrived, so the day's ticket set was a function of
 * grading state at merge time rather than of the card.
 *
 * THE RULE, AND IT IS ONE PREDICATE RATHER THAN A TUNING OF THE OLD ORDER. A merge may drop a
 * record whose story is COMPLETE — its money is fully described by the receipt it leaves behind.
 * It may never drop a wager whose story is UNFINISHED, because no receipt can describe money that
 * nobody has determined yet. Every candidate — the base's own tickets and the ids only `other`
 * holds, in one pool — is ranked by
 *
 *     (1) 3  LIVE MONEY: `placed === true` and NO RESOLVED VERDICT on either side. Real money is
 *            at risk and there is nothing yet to write down; deleting the ticket deletes the only
 *            record a verdict could ever be produced for.
 *
 *            ── THE RANK-2 PREDICATE USED TO READ `placed === true` (INSTRUCTION 45, defect A3,
 *               2026-09-06, a REGRESSION of this same C1 block) ─────────────────────────────────
 *            `placed` IS A FIELD NO CFB WRITER SETS. GREPPED WORD-BOUNDARY ACROSS src/lib/cfb/
 *            THIS TURN (2026-09-06, defect F5): the word appears on FIVE lines and not one of
 *            them is a ticket — two are docblocks in types.ts restating THIS module's own
 *            `DroppedPL`, one is that restatement's type `export type CfbMergeDropPL = { result:
 *            string; payout: number; stake: number; placed?: boolean; actualStake?: number };`,
 *            and two are docblocks in store.ts about the merge's dropped-ticket receipt and about
 *            the ledger validator. No ticket `lockCfbCard` (src/lib/cfb/ledger.ts) or the CFB
 *            lock server mints carries the key. (Line numbers are deliberately NOT quoted: that
 *            file is under concurrent edit and every number moved between two reads this same
 *            turn. This paragraph used to say "exactly one place — a docblock in store.ts"; the
 *            count was stale, the conclusion is not.) So on the desk this block was written for,
 *            `placed === true` was NEVER true and rank 2 was DEAD CODE: every ungraded CFB ticket
 *            fell to rank 0 and C1's protection was inert.
 *            MEASURED, both merge orders, the real production shape (no `placed` key anywhere):
 *            the phone's ungraded `cfb-2026-09-05-fun-1 @ $25` against the server's
 *            `cfb-2026-09-05-topup1-fun-1 @ $25` graded LOST at payout 0 — both ranked 0, the
 *            seat was decided by key (3), and the day's own LIVE $25 wager was deleted by a
 *            settled loser worth nothing. On MLB the field is written, but as `placed: false`
 *            (`toTicket` in src/lib/server/lock-card.ts stamps `placed: false,` and `actualStake: 0,`,
 *            read this turn) — the desk's own standing NOT-PLACED ANSWER, which is not the same
 *            statement as "this is only a sizing" and which `self-reading.ts` requires to be
 *            exactly `false` on every paper ticket (`if (t.placed !== false) violations.push(...)`,
 *            read this turn). Reading it as droppable made the shape the write path guarantees
 *            the shape the merge discards.
 *            THE FACT THE DESK ACTUALLY RECORDS IS THE GRADE. An UNGRADED ticket is the unfinished
 *            story this rule exists to protect, on both desks, whatever any writer did or did not
 *            stamp about placement — so an ungraded ticket without a `placed: true` answer is NOT
 *            demoted to the bottom the way A3's dead key demoted it; it is rank 1 below.
 *         2  A SETTLED WIN with payout > 0 — complete, but the payout is the one number on the day
 *            that no re-grade can rebuild once the ticket it was priced on is gone. This is A1's
 *            own argument, narrowed to the only verdict it is true of: a `lost` or `push` verdict
 *            is fully reconstructible by re-grading the surviving ticket, so it may never displace
 *            an unsettled wager.
 *         1  AN UNPLACED UNGRADED SIZING — ungraded, but with no `placed: true` answer on it. The
 *            shape BOTH desks actually mint (CFB stamps no `placed` key at all; MLB's `toTicket`
 *            stamps `placed: false`). Below a settled win, ABOVE a settled loser.
 *         0  A SETTLED `lost` or `push` — fully reconstructible by re-grading the surviving
 *            ticket, so it may never displace an unsettled wager.
 *     (2) then the payout that verdict credits the day (0 for everything but a win), so two
 *         settled winners are separated by the money and not by a byte,
 *     (3) then the order the cap has always consumed: the base's bucket in the base's own order,
 *         then the extras in TICKET-ID order,
 *
 * and the cap is spent down that ranking. Key (3) is the whole of the pre-A1 behaviour, so a day
 * with nothing settled seats exactly what it seated before — which is why every N2 / K4 / A4 pin is
 * arithmetically untouched. A day where NOTHING is graded now has every candidate at rank 1, which
 * is the same tie, resolved the same way by key (3).
 *
 * ── THE BAND IS MONOTONE, AND THAT IS THE WHOLE POINT OF IT (INSTRUCTION 45, defect F1,
 *    2026-09-06, a REGRESSION of A3 above) ─────────────────────────────────────────────────────
 * A3 collapsed rank 2 to "no resolved verdict" and left a settled WIN at 1, so an ungraded rival
 * outranked a settled winner and GRADING A TICKET A WINNER WAS WHAT EVICTED IT. MEASURED through
 * this kernel, both orders, on the two ids `planCfbTopUp` mints: `cfb-2026-09-05-topup1-fun-1 @
 * $25` ungraded against `cfb-2026-09-05-topup2-fun-1 @ $25` ungraded — equal rank, the tiebreak
 * seats topup2; topup2 grades WON at payout 150; the rival copy syncs again and the winner is
 * DROPPED (funDropped `[topup2-fun-1]`, funDroppedPL `{"result":"won","payout":150,"stake":25}`),
 * the reopen loop forces `grading.done` false, and `ledgerStats` loses the win from Net P/L, ROI
 * and the win/loss record. If topup1 is never graded the eviction is PERMANENT.
 * THE BAND FIXES THE DIRECTION: for every ticket either desk mints — no `placed: true` anywhere —
 * an ungraded candidate sits at 1, and its own verdict landing moves it to 2 (won) or 0
 * (lost/push). A WIN THEREFORE PROMOTES AND CAN NEVER COST THE TICKET ITS SEAT, which is what
 * "monotone across a grading sequence" means and what the SEQUENCE pins in
 * tests/ledger-merge.test.ts (F1) assert: merge ungraded/ungraded, grade the seated one won,
 * re-merge against the rival, and the seated id is unchanged, in both orders, CFB and MLB.
 * The one shape where a verdict LOWERS the band is 3 -> 2, a ticket answered `placed: true` and
 * then won. That shape is not reachable from any writer in this repo (see the grep above, and
 * `buildReading` in src/lib/server/self-reading.ts records a VIOLATION for any paper ticket whose
 * `placed !== false`), and it is the ordering the desk asked for anyway: money still at risk
 * outranks money already counted.
 *
 * WHAT THE BAND DELIBERATELY DOES **NOT** DO: it does not stop a settled WINNER being evicted by a
 * ticket that is still LIVE. Rank 2 still sits below rank 3, so a $25 PLACED ungraded wager still
 * displaces a $25 settled winner when the allotment cannot hold both. That ordering is PINNED —
 * "the MLB rail: a settled $10 winner does not shrink a $25 placed bucket, both orders" in
 * tests/ledger-merge.test.ts requires exactly it, on a fixture whose `mlb-hr-1` carries
 * `placed: true, actualStake: 25` — and it is the same judgement as above: the winner's money is
 * fully described by the receipt it leaves on `funDroppedPL` (result, payout, stake), and the live
 * wager's is not describable at all.
 *
 * AND EVERY EVICTION LEAVES A RECEIPT, settled or not. `droppedPL` now records `result: "pending"`
 * with the stake for a ticket nobody has graded, and carries its `placed` / `actualStake` answers
 * when it has them, so a deleted wager's money is on the day whichever direction the cap cut. That
 * is what makes the eviction survivable at all: what leaves the bucket is still legible.
 *
 * WHY THE CAP STILL EVICTS AT ALL, rather than keeping the day whole and MARKING it the way K3
 * does for core. Because a settled winner that lives only on the LOSING copy can be seated no
 * other way: A1's own fixture is a $25 winner on the copy `pickBase` does not choose, and seating
 * it REQUIRES displacing the base's own $25 loser. Refusing every eviction would put that $47.73
 * back on `funDropped` and score the day −50.00, which is the defect A1 shipped to fix. The
 * eviction class is not removed; what is removed is its ability to destroy money that no receipt
 * can describe.
 *
 * ORDER-FREE, BY CONSTRUCTION. The only fact the rank reads off the TICKET is `placed`, which is
 * the same value on the same ticket whichever copy carries it, and `verdictOf` reads BOTH sides'
 * grading, so a candidate's rank is a fact about the PAIR of inputs and not about which copy
 * `pickBase` seated as the base; `pickBase` itself answers the same way in either argument order,
 * so `mergeDay(a,b)` and `mergeDay(b,a)` call this function with the same `(base, other)`.
 * STABLE OVER TIME, AND MONOTONE: an ungraded wager of the shape either desk mints holds rank 1
 * until its own verdict lands, and that verdict can only PROMOTE it (to 2 as a win) or settle it
 * into the band a re-grade rebuilds (0 as a loss or push) — it can never cost a WINNER the seat it
 * already held, which is precisely defect F1 above. Two rank-0 records separate on key (3), the
 * base's own order, and both are fully described by receipts, so no money moves when that flips.
 * IDEMPOTENT: after one merge the seated set is already the top of the ranking and a dropped id is
 * not in either bucket to be re-ranked, so a second merge seats the same tickets and re-derives
 * the same receipt.
 * ========================================================================================== */

/** The three verdicts that are a SETTLEMENT; `pending` / `ungradable` are the absence of one. */
const RESOLVED = new Set(["won", "lost", "push"]);
type Verdict = { result: string; payout: number };
type DroppedPL = { result: string; payout: number; stake: number; placed?: boolean; actualStake?: number };
type FunUnion<T extends SyncEntry> = { funT: NonNullable<T["funT"]>; dropped: string[]; droppedPL: Record<string, DroppedPL> };

/**
 * THE RECEIPT A DROPPED TICKET LEAVES ON THE DAY (INSTRUCTION 45, defect C1, 2026-09-06). A1
 * recorded one only `if (c.v)` — only for a ticket that already carried a verdict — so exactly the
 * eviction with nothing to write down, the LIVE one, left nothing behind. An unsettled drop records
 * `result: "pending"` (the same word `ticketPL` in src/lib/bankroll.ts already scores as 0 — read
 * this turn: `if (!g) return 0; if (g.result === "won") … if (g.result === "lost") … return 0`),
 * and both placement answers ride along when the ticket has them, because "he risked $25 on it" is
 * the fact that makes a deleted wager worth reconciling. Absent answers are OMITTED rather than
 * written as nulls, so a settled drop on a ticket carrying neither answer is byte-for-byte
 * the receipt A1 recorded — every pin A1 left behind reads unchanged.
 */
function receiptOf(t: SyncTicket, v: Verdict | null): DroppedPL {
  const r: DroppedPL = { result: v ? v.result : "pending", payout: v ? v.payout : 0, stake: Number(t.stake) || 0 };
  if (typeof t.placed === "boolean") r.placed = t.placed;
  if (typeof t.actualStake === "number" && Number.isFinite(t.actualStake)) r.actualStake = t.actualStake;
  return r;
}

/**
 * A candidate's RANK in the fun cap's seating order — see the block above for the whole argument.
 * 3 = LIVE MONEY (`placed === true` and nobody has settled it), 2 = a settled WIN with a payout,
 * 1 = an UNPLACED ungraded sizing (the shape both desks actually mint), 0 = a settled `lost` or
 * `push`, which a re-grade of the surviving ticket rebuilds.
 *
 * THE BAND IS MONOTONE FOR EVERY TICKET THIS REPO MINTS (INSTRUCTION 45, defect F1, 2026-09-06).
 * A3 answered 2 for ANY ungraded ticket and 1 for a settled win, so an ungraded rival outranked
 * the day's own winner and GRADING A TICKET WON WAS WHAT EVICTED IT — measured through
 * `mergeLedgers` in both orders on `cfb-2026-09-05-topup1-fun-1` against
 * `cfb-2026-09-05-topup2-fun-1` before this fix. Neither desk stamps `placed: true` on a paper
 * ticket (CFB stamps no such key; MLB's `toTicket` stamps `placed: false`), so every ticket enters
 * at 1 and its own verdict moves it UP to 2 or down into the reconstructible band — a win can
 * never cost a ticket the seat it already held.
 *
 * `t` is read again for exactly one question, `placed === true`, which is what separates band 3
 * from band 1. That is not the dead key A3 removed: A3's defect was letting the ABSENCE of the
 * answer drop a ticket to the BOTTOM, below a settled loser. Here its absence costs one band, not
 * three, and rank 3 remains the promise that a wager a human has actually placed is never deleted
 * while it is unsettled.
 */
function funRank(t: SyncTicket, v: Verdict | null): number {
  if (!v) return t.placed === true ? 3 : 1;
  return v.result === "won" && v.payout > 0 ? 2 : 0;
}

/**
 * The SETTLEMENT one grading record states, or null when the record settles nothing (`pending`,
 * `ungradable`, a malformed record, or no record at all). Split out of `verdictOf` below
 * (INSTRUCTION 45, FINAL2 K3, 2026-09-06) so the grading-map merge in `mergeDay` can ask the same
 * question of a single record without a second copy of the test.
 */
function settlementOf(g: unknown): Verdict | null {
  if (!g || typeof g !== "object") return null;
  const result = String((g as { result?: unknown }).result ?? "");
  return RESOLVED.has(result) ? { result, payout: Number((g as { payout?: unknown }).payout) || 0 } : null;
}

/** A ticket id's resolved verdict as EITHER side records it, or null when nobody has settled it. */
function verdictOf(id: string, ...sides: (SyncEntry | undefined)[]): Verdict | null {
  for (const e of sides) {
    const v = settlementOf(e?.grading?.tickets?.[id]);
    if (v) return v;
  }
  return null;
}

/**
 * THE FUN UNION — the base's fun tickets and the ones only `other` holds, seated against `funCap`
 * in the SETTLEMENT RANKING described in the block directly above (settled first, then by the
 * payout it credits, then the base's own order and TICKET-ID order) — so which ticket wins a
 * scarce allotment is a pure function of the two inputs and not of the order the loser happened to
 * store its tickets in, nor of a ticket id's byte order. Returns null when `other` holds no id the
 * base lacks, so an unchanged day is never needlessly rebuilt. Never mutates `other`; a ticket
 * taken from `other` is a deep clone, and a ticket the base already held is passed through by
 * reference because `mergeDay` cloned the whole base entry before it got here.
 *
 * A BASE TICKET CAN NOW BE DISPLACED (INSTRUCTION 45, defect A1, 2026-09-06), which it could not
 * before: the base's bucket used to be seated wholesale and the cap only ever refused an incoming
 * ticket. So the returned bucket is not "base plus extras" any more and `mergeDay` compares the
 * seated ID LIST, not its length, before assigning — a swap of one ticket for another leaves the
 * length identical and would otherwise have been dropped on the floor.
 *
 * `dropped` NAMES THE TICKETS THE CAP REFUSED (INSTRUCTION 45, defect K4, 2026-09-06). This loop
 * used to do `if (sum + stake > cap + 1e-6) continue;` and nothing else: a ticket that would push
 * the bucket past its allotment simply VANISHED — not counted, not flagged, and no trace anywhere
 * for anyone reconciling the ledger against a device that still shows the bet. No legitimate
 * writer exceeds the cap today (MLB entries carry no top-level `fun`, so the bound is PAPER.fun =
 * 25 and `buildLockEntry` sizes the whole bucket to exactly that — grepped in
 * src/lib/server/lock-card.ts this turn, `const hrAmount = ladder ? PAPER.fun - FUN_LADDER.amount
 * : PAPER.fun;`; CFB's `planCfbTopUp` seats AT MOST ONE fun parlay per date and sizes it at the
 * allotment rather than measuring it against one — its single fun candidate is the `t` binding in
 * `planCfbTopUp` (src/lib/cfb/lock-server.ts), taken only when the entry's own fun bucket is empty
 * AND nothing is on the refused channel, and the loud bound is `assertCfbCardMoney`'s
 * `if (funSum > CFB_PAPER.fun + MONEY_EPS) {` throw.
 *
 * A SECOND CITATION CORRECTED, INSTRUCTION 45, FINAL K6 (2026-09-06): the sentence above named
 * that seat by quoting it, and the quote NO LONGER GREPS — `planCfbTopUp` gained a second
 * disqualifier, `cfbFunRefusedOf(entry).length`, after the quote was taken, so the quoted form is
 * a strictly weaker condition than the code. It is replaced here by the SYMBOL and a description
 * of what it tests, which cannot go stale the same way. CITATION CORRECTED
 * THE SAME TURN IT WAS WRITTEN (INSTRUCTION 45, CLOSING K8, 2026-09-06): this sentence first
 * shipped this round claiming CFB "breaks out of its own fun loop at `if (!(t.stake > 0) ||
 * funStake + t.stake > CFB_PAPER.fun + MONEY_EPS) break;`". Grepped one fragment at a time in the
 * K8 sweep, that break is NOT in the file: the running-sum loop was removed as mutation survivor
 * R26 earlier this same round, and the only occurrence of those bytes today is inside that
 * removal's own docblock quoting what it deleted. A citation is a claim, and that one did not
 * hold), which is why this is low severity — but the silence
 * means the day a writer does exceed it, the loss is invisible. The cap STAYS; the drop is now
 * reported on this channel, recorded on the merged day as `funDropped`, and warned about by name.
 *
 * `droppedPL` CARRIES THE MONEY, NOT ONLY THE NAME (INSTRUCTION 45, defect A1, 2026-09-06). An id
 * on `funDropped` says a wager was refused; it does not say what that wager was WORTH. When the
 * refused ticket already carries a resolved verdict, its `result`, its `payout` and its `stake`
 * travel with the id, so a settled ticket's P/L is never deleted in silence even in the case the
 * ranking above still has to drop one. `mergeDay` records this on the day as `funDroppedPL`.
 *
 * EXPORTED (INSTRUCTION 45, defect K5, 2026-09-06) for the same reason `unionCore` was: at the
 * time, src/lib/cfb/store.ts `upsertCfbEntries` did not union funT at all, so the $25 fun ticket
 * the server seated was dropped on the phone — measured, device funT [] / $0 against sync funT
 * [`cfb-2026-09-05-topup1-fun-1` @ $25] / $25 for the same pair. THAT RAIL NOW TAKES THE WHOLE
 * MERGED DAY (read this turn, 2026-09-06: `const syncDay = (mergeLedgers([cur], [entry])[0] as
 * CfbLedgerEntry | undefined) ?? cur;` then `const kept: CfbLedgerEntry = { ...syncDay, grading };`
 * in `upsertCfbEntries`), so it reaches this union through `mergeDay` rather than calling it
 * directly. The export stands, and so does its reason: the fun allotment lives in ONE place, and
 * nothing may grow a second copy of the cap.
 * Generic in the entry for the same reason `unionCore` is: `CfbLedgerEntry` narrows `funT` to a
 * required `CfbTicket[]` (src/lib/cfb/types.ts), so a bare `SyncTicket[]` return would not assign
 * and every call site would have to cast. The one cast is here instead, and it is sound by
 * construction: every element is either an element of `base.funT` or a deep clone of an element
 * of `other.funT`, both already `T["funT"][number]`.
 */
export function unionFun<T extends SyncEntry>(base: T, other: T): FunUnion<T> | null {
  const have = new Set((base.funT ?? []).map((t) => t.id).filter(Boolean));
  const extras = (other.funT ?? []).filter((t) => t.id && !have.has(t.id)).sort(byId);
  if (!extras.length) return null;
  const cap = funCap(base, other);
  /* THE CANDIDATE POOL, IN THE ORDER THE CAP USED TO CONSUME IT: the base's own bucket first, in
     the base's own order, then the ids only `other` holds, in TICKET-ID order. `seq` freezes that
     order, and it is the LAST tiebreak below — so with no settled money anywhere the seating is
     byte for byte what it was before this block (base's tickets seated, extras in id order). */
  const pool = [...(base.funT ?? []), ...extras].map((t, seq) => {
    const v = t.id ? verdictOf(String(t.id), base, other) : null;
    return { t, seq, mine: seq < (base.funT ?? []).length, rank: funRank(t, v), payout: v && v.result === "won" ? v.payout : 0, v };
  });
  const seated = new Set<number>();
  let sum = 0;
  /* ── A SEAT THE DAY ALREADY HOLDS IS NOT LOST TO A BIGGER PAPER WINNER (INSTRUCTION 45,
     CLOSING K4, 2026-09-06, a REGRESSION of defect F1 above) ──────────────────────────────────
     F1's band fixed UNGRADED-versus-SETTLED: a ticket's own win promotes it from band 1 to band 2
     and can no longer cost it its seat. It did not fix SETTLED-versus-SETTLED. Once BOTH rivals
     settle they share band 2, and `q.payout - p.payout` then EVICTS the winner the day already
     recorded in favour of whichever paper ticket won more.
     MEASURED THROUGH `mergeLedgers` over the whole four-step sequence, BOTH ORDERS, on the two ids
     `planCfbTopUp` mints:
       {"seat":"cfb-2026-09-05-topup2-fun-1",
        "s1":["…topup2-fun-1"],"s2":["…topup2-fun-1"],
        "s3":["…topup1-fun-1"],"s4":["…topup1-fun-1"],"pl2":125,"pl3":175}
     Step 3 is the RIVAL's own verdict landing, and it takes the seat off a settled winner the day
     had already recorded and moves realizedPL from +125.00 to +175.00 on $25 of fun money — the
     day's P/L a function of a paper ticket's payout rather than of the card.
     THE KEY: within a band, a candidate the BASE already seats outranks one it does not. That is
     the same fact key (3) already reads — the base's own bucket comes first in `seq` — lifted
     above the payout so a settled winner cannot be displaced by a settled winner. Two candidates
     the day does NOT yet seat are still separated by the money and not by a byte, which is the
     whole reason the payout key exists (pinned in tests/ledger-merge.test.ts under CLOSING K4).
     ORDER-FREE for exactly the reason `seq` is: `pickBase` answers the same way in either
     argument order, so both directions call this function with the same `(base, other)`. */
  for (const c of [...pool].sort((p, q) => q.rank - p.rank || Number(q.mine) - Number(p.mine) || q.payout - p.payout || p.seq - q.seq)) {
    const stake = Number(c.t.stake) || 0;
    if (sum + stake > cap + 1e-6) continue;
    seated.add(c.seq);
    sum += stake;
  }
  const funT: SyncTicket[] = [];
  const dropped: string[] = [];
  const droppedPL: Record<string, DroppedPL> = {};
  for (const c of pool) {
    if (seated.has(c.seq)) {
      funT.push(c.mine ? c.t : (JSON.parse(JSON.stringify(c.t)) as SyncTicket));
      continue;
    }
    dropped.push(String(c.t.id));
    droppedPL[String(c.t.id)] = receiptOf(c.t, c.v);
  }
  return { funT: funT as NonNullable<T["funT"]>, dropped, droppedPL };
}

/** The leg keys a ticket's grading is filed under (`grading.legs` is keyed by lkey). */
function lkeysOf(t: SyncTicket | undefined): string[] {
  const legs = Array.isArray((t as { legs?: unknown } | undefined)?.legs) ? ((t as { legs: unknown[] }).legs) : [];
  return legs.map((l) => String((l as Record<string, unknown> | null)?.lkey ?? "")).filter(Boolean);
}

type StakeConflict = { kept: number; refused: number };
type CoreUnion<T extends SyncEntry> = {
  core: T["core"];
  restaked: string[];
  dropped: string[];
  droppedPL: Record<string, DroppedPL>;
  conflict: Record<string, StakeConflict>;
  /** ids the two sides mean DIFFERENT BETS by — see A MISSING FIELD IS NOT A DIFFERENT BET. */
  betConflict: string[];
};

/* ============================================================================================
 * STOP TRUSTING THE CLONE — INSTRUCTION 45, defect C2 (2026-09-06), a REGRESSION of the core
 * union itself. Josh verbatim: "Parlay Lab CFB should've been running the same $150 per day
 * theoretical Core money and $25 Fun money per day".
 *
 * THE PATTERN, NOT THE SYMPTOM. `mergeDay` picks a base with `pickBase` and DEEP-CLONES it
 * wholesale, and every union above only ever bounded what it APPENDS or RAISES on top of that
 * clone. So whatever money the winning copy happened to carry was never checked against anything
 * — and `pickBase`'s last two tiebreakers are JSON LENGTH and then a raw JSON BYTE COMPARISON
 * (`ja > jb ? [a, b] : [b, a]`). Every round so far has patched a consequence downstream of that
 * clone. This one reconciles the clone.
 *
 * MEASURED THREE WAYS, all on the real kernel, all on 2026-09-05:
 *   · A REFUSED RE-LOCK RIDES IN ON BYTE ORDER. Two copies of the one id `cfb-2026-09-05-core-1`,
 *     one at $10 and one at $25. Both serialise to 213 BYTES, so gradeScore, clvCount,
 *     confirmedCount and JSON length all tie and `pickBase` falls through to comparing the raw
 *     JSON strings — "$25" sorts after "$10", the $25 copy is cloned, and the merged day stakes
 *     $25. `unionCore` returned null in BOTH directions, correctly refusing a raise no `topUp`
 *     explains; the clone put the money back anyway, past the union that had just refused it.
 *     tests/cfb-store.test.ts pins the device rail's answer to this exact re-lock at 10 (`expect(
 *     r.entry.core[0].stake).toBe(10)`) and had been RED against the sync rail since.
 *   · IT BREACHES THE DAY'S ALLOTMENT. Six shared ids at $25 ($150, the whole desk) against the
 *     same six at $30 ($180), no `topUp` anywhere: merged coreSum 180 — $30 over CFB_PAPER.daily
 *     on six stakes NO writer raised.
 *   · IT DELETES A PLACED WAGER. A phone holding its own PLACED $25 ticket, merged against a
 *     server copy of six different ids at $25, comes back as the six server ids with the phone's
 *     ticket GONE and no marker of any kind: the append pass correctly refused it at the cap, and
 *     then said nothing, so $25 of real money left durable state in silence.
 *
 * THE RULE, and it is a function of the unordered PAIR. For every id both sides hold, let `hi` be
 * the larger stake and `lo` the smaller. The receipt test is the one the raise pass already used —
 * `hi.topUp - lo.topUp` must equal `hi.stake - lo.stake` — one predicate, `receiptedPair`, now
 * answers it for both passes, and it reads the same either way round, so the agreed stake
 * (`hi` when receipted, `lo` when not) does not depend on which copy
 * `pickBase` seated. A refusal is recorded as `stakeConflict {id: {kept, refused}}` in BOTH
 * directions, including when the base ALREADY holds the smaller stake and nothing moves, so the
 * marker is pair-symmetric too. `topUp` travels with the stake it explains, in both directions.
 *
 * A RECEIPTED RAISE IS NO LONGER GATED BY THE CAP, and that removes an asymmetry rather than
 * adding money: the old gate refused a receipted raise past `cap` only when the SMALLER copy was
 * the base, and kept it when the larger one was — the same pair, two answers, decided by
 * `pickBase`. A raise with a receipt is money the desk provably deployed, so it is now kept and
 * MARKED, which is exactly what defect K3 already does for an over-cap stored day (see ASSERT THE
 * ALLOTMENT, DO NOT TRUST IT in `mergeDay`: "KEPT AND MARKED, NOT TRUNCATED"). The two pins that
 * exercise the cap on a raise — "a raise that would breach the day's own allotment is refused" and
 * "with no `daily` a raise is bounded by PAPER.daily" — are both RECEIPTLESS, so both still land
 * on the smaller stake and both still measure 150; they are refused by the receipt rule now
 * instead of by the cap, which is the stronger of the two refusals.
 *
 * `restaked` REPLACES `raised` because the reconciliation moves stakes DOWN as well as up, and
 * defect N1's argument does not care about the direction: a verdict is priced under the stake it
 * was graded against (src/lib/cfb/grade.ts `settle`: payout from stake), so a $25 payout beside a
 * reconciled $10 stake is the same corruption as a $40 payout beside a raised $60 one. The one
 * consumer outside this file computes its own before/after diff and does not read this field:
 * src/lib/cfb/store.ts `upsertCfbEntries` calls `restakedIds(cur.core, core)` and passes THAT to
 * `withdrawRaisedVerdicts`, so the rename cannot reach it.
 * ======================================================================================== */
/**
 * The merged core: every shared id RECONCILED to one agreed stake, then `base`'s tickets plus the
 * ones only `other` holds — all gated by AGREEMENT above and the ALLOTMENT on the appends,
 * reconciliation before appends so the cap is measured against agreed money, the append pass in
 * ticket-id order against one running sum. Returns null when nothing changed and nothing was
 * refused, so an unchanged day is not needlessly rebuilt. Never mutates `other`.
 *
 * `restaked` names the ids whose stake actually MOVED, in either direction. `mergeDay` needs them
 * because the stake a verdict was priced under is gone — see THE RAISE INVALIDATES ITS VERDICT in
 * `mergeDay`. `dropped` / `droppedPL` are the receipt channel `unionFun` has had since defect K4:
 * an append the allotment refuses is NAMED and carries the money it represented. `conflict` names
 * every shared id whose two stakes disagreed with no receipt to explain the difference.
 *
 * THE RETURN IS SIX FIELDS: `{ core, restaked, dropped, droppedPL, conflict, betConflict }`.
 *
 * `betConflict` — THE EXACT SHAPE, for the ledger UI that started reading it this round
 * (INSTRUCTION 45, defect F6, 2026-09-06). FROM THIS FUNCTION it is a `string[]` of TICKET IDS,
 * ASCENDING (plain `Array.prototype.sort()`, lexicographic on the id strings, applied on the way
 * out), one entry per shared id, POSSIBLY EMPTY — an empty array is the normal answer whenever the
 * union returns non-null for some other reason (a restake, a refused append, a stake conflict).
 * Each id names a ticket BOTH copies hold whose two copies FAIL `sameBet`: a different game,
 * market, side or line. It is NOT a stake disagreement (that is `conflict`, `{id: {kept,
 * refused}}`) and NOT a field one copy simply omits (see A MISSING FIELD IS NOT A DIFFERENT BET).
 * The ticket seated for such an id is ALWAYS the BASE's, byte-unchanged, and the rival copy's
 * ticket is never carried onto the merged day in any form.
 *
 * ON THE MERGED DAY, `mergeDay` republishes it as the day's own `betConflict` (same name, declared
 * `betConflict?: string[]` on `CfbLedgerEntry` in src/lib/cfb/types.ts) with two differences the
 * UI must rely on: it is the UNION of this union's ids with any `betConflict` either INPUT day
 * already carried, filtered to the ids STILL SEATED on the merged core and sorted; and it is
 * ABSENT (the key `delete`d, never `[]`) when nothing survives that filter. So on a day the
 * property is present it is a non-empty ascending `string[]`, and `undefined` means "no rival
 * ticket is seated here" — the two states a consumer needs to distinguish.
 *
 * EXPORTED (INSTRUCTION 45, 2026-09-06) so the CFB device store can call THIS function instead of
 * keeping its own copy. src/lib/cfb/store.ts `coreAppends` — a NOW-DELETED private helper; grepped
 * this turn (2026-09-06), the name survives only in that file's own history docblock at store.ts
 * line 281 and nowhere in its code — had re-implemented only the APPEND half
 * and skipped the allotment bound whenever `daily` was absent, so the two rails converged on
 * DIFFERENT core sets for one date (measured: shared id cfb-2026-09-05-core-1, device copy $15,
 * incoming $25 — `upsertCfbEntries` kept 15 while `mergeLedgers` produced 25; the phone and the
 * cloud disagreed about the money on one ticket). `CfbTicket extends SyncTicket` and
 * `CfbLedgerEntry extends SyncEntry` (src/lib/cfb/types.ts), so a CFB entry is accepted directly.
 * This module is import-safe from a `"use client"` file: it has no `"use client"` of its own and
 * its only imports are `@/lib/paper-mode` and `@/lib/cfb/rules`, both constant-only modules with
 * no imports at all (store.ts already imports `mergeLedgers` from here).
 *
 * IT IS GENERIC IN THE ENTRY so the caller gets ITS OWN ticket type back and needs no cast at the
 * call site: `CfbTicket` narrows several of `SyncTicket`'s optional fields to required, so a bare
 * `SyncTicket[]` return would not assign to `CfbTicket[]` and the device store would have to cast
 * on every call. The one cast is here instead, and it is sound by construction: every element of
 * `core` is either an element of `base.core` or a deep clone of an element of `other.core`, both
 * of which are already `T["core"][number]`, plus (for a raise) a spread of a `base.core` element
 * with its `stake`/`topUp` replaced — no element is ever synthesised from nothing.
 */
export function unionCore<T extends SyncEntry>(base: T, other: T): CoreUnion<T> | null {
  const cap = allotmentCap(base, other);
  const theirs = new Map<string, SyncTicket>();
  for (const t of other.core) if (t.id) theirs.set(String(t.id), t);

  const out: SyncTicket[] = [];
  const restaked: string[] = [];
  const dropped: string[] = [];
  const droppedPL: Record<string, DroppedPL> = {};
  const conflict: Record<string, StakeConflict> = {};
  const betConflict: string[] = [];
  let changed = false;

  /* ============================================================================================
   * A RIVAL CARD'S MONEY IS NOT THIS CARD'S MONEY — INSTRUCTION 45, defect F2 (2026-09-06), a
   * REGRESSION of defect A2 in the block directly above. Josh verbatim: "Parlay Lab CFB should've
   * been running the same $150 per day theoretical Core money and $25 Fun money per day".
   *
   * A2 was right that ONE disputed ticket must not switch reconciliation off for the whole date,
   * and wrong about what "the rest of the date" is. It let the money reconciliation keep running
   * over the OTHER shared ids of a pair the same loop had just declared RIVAL CARDS — two
   * different locks that only share an id namespace. So the rival's receipted `topUp` was read as
   * a receipt for THIS card's stake and raised it.
   *
   * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, 2026-09-05, before this fix: a card of six
   * agreed $25 tickets (exactly CFB_PAPER.daily, $150) against a rival copy whose
   * `cfb-2026-09-05-core-1` names a DIFFERENT game (`betConflict: ["cfb-2026-09-05-core-1"]`) and
   * whose `core-2` carries $50 with `topUp: 25`. The rival's raise was seated: merged
   * `core-2.stake` 50, `coreSum` 175, `capBreach {"core":{"sum":175,"cap":150}}`, `allocSum` 175
   * beside `daily` 150 — the day staked $25 past its own allotment on a receipt written by a
   * lock this card never made. The append pass had already refused that same rival's surplus
   * wholesale; the reconciliation walked it in through the side door.
   *
   * THE RULE: when ANY shared id names two different bets, the two copies are not two views of one
   * card and NOTHING crosses between them. This card keeps its own tickets at its own stakes; no
   * shared id is reconciled, raised or lowered; each disagreeing stake is recorded on the marker
   * channel that already exists (`conflict`, surfaced as `stakeConflict`) with `kept` = the stake
   * actually seated, so `mergeDay`'s "still seated AT THE STAKE IT NAMES" filter keeps the marker
   * and the UI can say what was refused. The receipt test is not consulted at all: a receipt is
   * only evidence about the card that wrote it.
   *
   * PAIR-SYMMETRIC, because `rivals` is a property of the unordered pair (`sameBet` is symmetric
   * and every shared id is visited), and because the branch keeps whatever the BASE holds and
   * `pickBase` answers the same way in either argument order. IDEMPOTENT: re-merging the result
   * against the rival still disputes the same id, so the same refusal is re-derived and no stake
   * moves a second time.
   * ========================================================================================== */
  for (const t of base.core) {
    const m = t.id ? theirs.get(String(t.id)) : undefined;
    if (m && !sameBet(t, m)) betConflict.push(String(t.id));
  }
  const rivals = betConflict.length > 0;
  /* ── THE BOUND MEASURES THE MERGED DAY, NOT A RUNNING CLONE (INSTRUCTION 45, FINAL2 K1,
     2026-09-06, a REGRESSION of FINAL K1 below) ────────────────────────────────────────────────
     FINAL K1 was right that a receipted lift must be bounded by the allotment on every path, and
     it measured the bound against a value SEEDED WITH THE BASE'S OWN STAKES. So an id this loop
     has not reached yet — and is about to LOWER — was still counted at its old stake while an
     EARLIER id's lift was being judged, and a raise the merged day plainly has room for was
     refused. The day then came out UNDER the $150 Josh asked for: the same instruction missed from
     the other side, and with a `stakeConflict` marker naming a raise the card could afford.

     MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on two copies of 2026-09-05 that BOTH hold
     exactly CFB_PAPER.daily and carry no rival id anywhere (the phone's core-2 still at the $50 it
     locked; the server's core-1 lifted 25 -> 45 with `topUp: 20` and its core-2 re-sized to $30):
       {"coreSum":130,"stakes":[25,30,25,25,25],
        "stakeConflict":{"cfb-2026-09-05-core-1":{"kept":25,"refused":45},
                         "cfb-2026-09-05-core-2":{"kept":30,"refused":50}}}
     — $20 of money the desk deployed deleted from the record, and `allocSum` (derived from the
     seated core) handing `decideTopUp` $20 of fresh room to stake a day that is already full.

     THE FLOOR IS WHAT THE MERGED DAY HOLDS IF NO LIFT IS GRANTED, and it is a pure function of the
     pair: every shared id settles on the base's own stake unless the pair is ordinary, receiptless
     and disagreeing, in which case it settles on the smaller (the `win = lo` branch below, which is
     never gated). A LIFT IS THE ONLY UPWARD MOVE THIS PASS MAKES, so floor + the lifts already
     granted IS the core the day will carry, and "refuse only when the FINAL total would breach" is
     exactly what the gate asks. It is measured BEFORE the loop for the same reason the
     reconciliation runs before the appends: money the two copies agree about is settled before
     anything is measured against the allotment.

     PAIR-SYMMETRIC AND IDEMPOTENT: `rivals`, `sameBet` and `receiptedPair` are all properties of
     the unordered pair, `pickBase` answers the same way in either argument order, and after one
     merge every shared id is already at the agreed stake so the floor equals the seated core and
     no lift remains to grant. */
  let projected = 0;
  for (const t of base.core) {
    const m = t.id ? theirs.get(String(t.id)) : undefined;
    const mine = Number(t.stake) || 0;
    projected += !m || rivals || receiptedPair(t, m) ? mine : Math.min(mine, Number(m.stake) || 0);
  }

  /* RECONCILIATION: every id BOTH sides hold is settled to ONE agreed stake before anything is
     measured against the allotment, so the running sum the append pass reads below is money the
     two copies agree on rather than whatever the clone happened to carry. */
  for (const t of base.core) {
    const m = t.id ? theirs.get(String(t.id)) : undefined;
    /* THE AGREEMENT TEST IS PER-ID, NOT PER-ENTRY (INSTRUCTION 45, defect A2's second rule,
       2026-09-06). It used to run once over the whole core, BEFORE anything was reconciled, and
       return null on the first mismatch — so one ticket's drift switched the money reconciliation
       off for the WHOLE date and `mergeDay` kept the untrusted pickBase clone entire. Here, an id
       the two copies genuinely disagree about keeps the BASE's ticket, is NAMED on `betConflict`
       by the pre-pass above, and does not stop the ids they DO agree on being APPENDED to. */
    if (m && !sameBet(t, m)) {
      out.push(t);
      continue;
    }
    const mine = Number(t.stake) || 0;
    const yours = m ? Number(m.stake) || 0 : mine;
    if (!m || Math.abs(mine - yours) < 1e-6) {
      out.push(t);
      continue;
    }
    const hi = yours > mine ? m : t;
    const lo = yours > mine ? t : m;
    /* THE RECEIPT, UNCHANGED — the same difference-of-two-receipts test the RAISE pass used, read
       off the unordered pair instead of off `base`/`other`; it lives in `receiptedPair` above
       since FINAL2 K1, because the FLOOR the bound is measured against must ask the identical
       question. See THE RAISE NEEDS A RECEIPT and THE RECEIPT IS A DIFFERENCE above `pickBase`. */
    const receipted = receiptedPair(t, m);
    /* ── A RIVAL ON ONE ID IS NOT A FACT ABOUT ANOTHER (INSTRUCTION 45, CLOSING K2, 2026-09-06,
       a REGRESSION of defect F2 above) ───────────────────────────────────────────────────────
       F2 was right that a rival card's `topUp` is a claim by ANOTHER allocator about ANOTHER
       card, and it wrote the refusal as a whole-date branch: `if (rivals)` refused the
       reconciliation of EVERY shared id because SOME id was disputed. That is the same shape as
       the whole-entry agreement bail A2 had just removed one level down, reintroduced one level
       up — and it costs real money in the direction Josh's instruction cares about.

       MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, as a matched pair one field apart. Two
       server-locked copies of 2026-09-05, both holding core-1 @ $25 (g1), core-2 (g2), core-3 @
       $25 (g3) and topup1-core-4 @ $25, one copy's core-2 legitimately topped up to $50 carrying
       `topUp: 25` — a receipt that passes the difference test exactly.
         CONTROL (topup1-core-4 on the same game on both copies):
           {"stakes":[25,50,25,25],"sum":125,"allocSum":125}
         DEFECT (the ONLY change — topup1-core-4 names a different game on the two copies):
           {"stakes":[25,25,25,25],"sum":100,"allocSum":100,
            "stakeConflict":{"cfb-2026-09-05-core-2":{"kept":25,"refused":50}},
            "betConflict":["cfb-2026-09-05-topup1-core-4"]}
       An UNRELATED ticket's drift deleted $25 of deployed money from the record and — because
       `allocSum` is derived from the seated core — handed `decideCfbTopUp` $25 of fresh room to
       stake again, up to $175 on a $150 day.

       THE REFUSAL IS NARROWED TO WHAT THE RIVAL'S RECEIPT COULD ACTUALLY CORRUPT. An id whose
       two copies pass `sameBet` is two views of ONE wager no matter what a different id does, so
       its receipt test runs normally; what a rival's stamp may NOT do is carry the date past the
       allotment Josh set, which is the harm F2 measured — a merged `coreSum` of 175 against a
       `CFB_PAPER.daily` of 150. So on a rival pair the larger stake is honoured only while the
       projected core stays inside `cap`, and otherwise THIS CARD'S OWN stake stands and the
       refusal is named on `conflict` exactly as F2 recorded it. F2's own fixture — six agreed
       $25 tickets, the whole $150 desk, against a rival raise of $25 — is 175 over a 150 cap and
       is still refused with `{kept: 25, refused: 50}`; this fixture's card carries $100 and
       lands at $125, inside the desk, so the wager the two copies AGREE about keeps the money.

       PAIR-SYMMETRIC AND IDEMPOTENT for the same reasons F2's branch was: `rivals` is a property
       of the unordered pair, `projected` is measured off the base and `pickBase` answers the same
       way in either argument order, and after one merge the seated stake is already the agreed
       one so a re-merge finds no difference to move. */
    /* ── THE ALLOTMENT BOUNDS A RECEIPTED LIFT ON EVERY PATH (INSTRUCTION 45, FINAL K1,
       2026-09-06, a REGRESSION of CLOSING K2 directly above) ─────────────────────────────────
       CLOSING K2 gave the bound to the RIVAL branch alone and left the ordinary path's
       `receipted ? hi : lo` unbounded — so the guard was a property of "did some UNRELATED id
       drift" instead of a property of the ALLOTMENT, which is what Josh's sentence is about.

       MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on two plausible overlapping top-up copies of
       2026-09-05 that BOTH sum to exactly CFB_PAPER.daily and carry NO rival id anywhere:
         copy A  core-1 g1 $25 (topUp 0) · core-2 g2 $25 (topUp 20, raised from $5) · core-3..6 $25
         copy B  core-1 g1 $45 (topUp 20, raised from $25) · core-2 g2 $5 (topUp 0) · core-3..6 $25
       Both pairs pass the difference receipt (45 − 25 === 20 − 0 and 25 − 5 === 20 − 0), so each
       side's own residue was seated and nothing was given back:
         {"coreSum":170,"allocSum":170,"capBreach":{"core":{"sum":170,"cap":150}}}
       — $20 over the desk with no `stakeConflict` anywhere, and ASSERT THE ALLOTMENT in `mergeDay`
       only MARKS that breach after the fact.

       SO `projected` IS HOISTED OUT OF THE RIVAL BRANCH and the same test runs on both paths: a
       receipted lift is honoured only while the projected core stays inside `cap`, and otherwise
       THIS CARD'S OWN stake stands with the refusal named on `conflict` as {kept, refused} —
       byte-identical to the marker the rival branch has recorded since F2. Every existing fixture
       is arithmetically unchanged because every one of them already sits inside the allotment.

       ── AND A RIVAL CARD'S SMALLER STAKE IS A REFUSAL TOO (INSTRUCTION 45, FINAL K4,
          2026-09-06) ──────────────────────────────────────────────────────────────────────────
       A non-positive `lift` means `hi` IS this card's own ticket (`hi` is the larger stake, so it
       can only be `t` when `t` is at least the other copy's), i.e. this card seats MORE than the
       other copy claims. The branch shipped keeping `t` and writing NOTHING to any marker channel,
       so no surface could disclose the stake it declined. Every other refusal on this rail carries
       a receipt; this one did not. MEASURED THROUGH `mergeLedgers`, BOTH ORDERS: base core-1 @ $50
       `topUp: 25` against a rival copy's core-1 @ $25, core-2 naming a different game — merged
       core-1 $50, `betConflict ["…core-2"]`, `stakeConflict` UNDEFINED.

       THE TWO PATHS DELIBERATELY ANSWER DIFFERENTLY, and that is the whole content of the fix. On
       an ORDINARY pair the receipt IS evidence: `stake − topUp` is one allocator sizing both copies
       share, so the smaller copy is a stale view of THIS card's own money and marking it a refusal
       would be false (it would also make every N3 / CLOSING K2 re-sync report a refusal, which
       those idempotency pins forbid). On a RIVAL pair the F2 docblock at the head of `unionCore`
       already settles it — when a shared id names two different bets the copies are two locks, not
       two views, and a stamp written by one is a claim by ANOTHER allocator about ANOTHER card —
       so the two stakes are two cards' answers, this card's stands, and the other is REFUSED and
       named with the same {kept, refused} shape the rival branch already writes when the lift is
       positive and the allotment refuses it. IDEMPOTENT: the merged day seats this card's stake, so
       a re-merge against the rival re-derives the identical marker, and `mergeDay`'s "still seated
       AT THE STAKE IT NAMES" filter keeps it. */
    /* ── AND A RIVAL LOCK'S STAKE NEVER CROSSES, WHICHEVER WAY THE DIFFERENCE POINTS
       (INSTRUCTION 45, FINAL2 K2, 2026-09-06, a REGRESSION of CLOSING K2 above) ────────────────
       The F2 block at the head of this function states the rule this series has held since it
       shipped: when a shared id names two different bets the two copies are two LOCKS and not two
       views of one card, so NOTHING crosses between them and every refusal leaves a receipt.
       FINAL K4 directly above made the rival pair's SMALLER stake a marked refusal for exactly
       that reason. CLOSING K2 had meanwhile carved the LARGER stake out of the same rule: on a
       rival pair a receipted lift was seated whenever it happened to fit under the allotment, and
       the seating branch writes no marker — so the merged day recorded a stake the device never
       placed, sourced from a `topUp` stamped by ANOTHER allocator about ANOTHER card, with nothing
       on any channel to disclose it. One pair, two rival stakes, two opposite answers.

       MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on CLOSING K2's own fixture (the phone's card
       against a server lock whose `topup1-core-4` names a different game):
         {"stakes":[25,50,25,25],"sum":125,"stakeConflict":undefined,
          "betConflict":["cfb-2026-09-05-topup1-core-4"]}

       SO THE LIFT IS GATED ON `!rivals` AS WELL AS ON THE ALLOTMENT, and a rival pair falls
       through to the `receipted || rivals` branch, which keeps THIS CARD'S stake and names the
       refusal with the {kept, refused} shape F2 already writes. CLOSING K2's finding that a
       disagreement about ONE id is not a fact about ANOTHER is not reversed by this — it is what
       FINAL2 K1's floor now delivers on the ORDINARY path, where a receipt is evidence about the
       card that wrote it. What CLOSING K2 could not have: a rival's receipt is not evidence about
       this card at ANY size, so its cost is disclosed rather than absorbed silently. */
    const lift = (Number(hi.stake) || 0) - mine;
    let win: SyncTicket;
    if (receipted && lift <= 0) {
      win = t;
      if (rivals) conflict[String(t.id)] = { kept: mine, refused: yours };
    } else if (!rivals && receipted && projected + lift <= cap + 1e-6) {
      win = hi;
      projected += lift;
    } else if (receipted || rivals) {
      win = t;
      conflict[String(t.id)] = { kept: mine, refused: yours };
    } else {
      /* `projected` is NOT moved here: the FLOOR above already seats this id at the smaller
         stake, because this branch is never gated and so is not a lift the bound may grant. */
      win = lo;
      conflict[String(t.id)] = { kept: Number(lo.stake) || 0, refused: Number(hi.stake) || 0 };
    }
    if (win === t) {
      out.push(t);
      continue;
    }
    /* `topUp` TRAVELS WITH THE STAKE IT EXPLAINS, in both directions: `stake − topUp` is the
       allocator's own sizing, so a moved stake beside the other copy's stamp would make that
       subtraction lie. A winner carrying no stamp of its own leaves the field ABSENT rather than
       stale — the un-topped-up sizing is the whole stake. */
    const up: SyncTicket = { ...t, stake: Number(win.stake) || 0 };
    const wtu = Number(win.topUp);
    if (Number.isFinite(wtu)) up.topUp = wtu;
    else delete up.topUp;
    out.push(up);
    restaked.push(String(t.id));
    changed = true;
  }

  /* APPENDS: the tickets `other` holds that `base` has never seen, deep-copied, in ticket-id
     order against the reconciled sum. What the allotment refuses is NAMED, never swallowed. */
  let sum = stakeSum(out);
  const ids = new Set(base.core.map((t) => t.id).filter(Boolean));
  /* RIVAL CARDS ARE STILL NEVER MIXED. When any shared id names two different bets the two copies
     are two DIFFERENT LOCKS that happen to share an id namespace, and appending one's surplus onto
     the other would stake the day twice — so the append pass is refused wholesale for that date.
     That is the standing behaviour of the pin "REFUSES the union when the two sides disagree about
     a shared id — rival locks are never mixed" in tests/ledger-merge.test.ts, and it is unchanged.
     What A2 changes is that the refusal is no longer SILENT and no longer takes the reconciliation
     of the agreeing ids down with it.

     ── AND THE DISCARD LEAVES A RECEIPT (INSTRUCTION 45, CLOSING K3, 2026-09-06) ───────────────
     A2 ended the silence around the REFUSAL and left the discarded TICKETS silent. `appendable`
     was emptied outright, so every core ticket only the losing copy held vanished with no receipt
     of any kind — not on `coreDropped`, not on `coreDroppedPL` — while the allotment's own refusal
     two lines below has carried both since defect K4. MEASURED THROUGH `mergeLedgers`, BOTH
     ORDERS: Josh's Builder lock (one $20 ticket on g9, ungraded, so `gradeScore` seats it as the
     base) against the server's rival lock (the same positional core-1 from a different board plus
     core-2 and core-3 at $25) came out as
       {"ids":["cfb-2026-09-05-core-1"],"sum":20,"allocSum":20,
        "betConflict":["cfb-2026-09-05-core-1"]}
     — `coreDropped` and `coreDroppedPL` both ABSENT over $50 of wagers a device still shows.

     THE DECISION IS REFUSE-WITH-A-RECEIPT, NOT APPEND, and it is deliberate. Appending a rival
     lock's surplus onto this card stakes the Saturday twice, which the pin "REFUSES the union when
     the two sides disagree about a shared id — rival locks are never mixed" in
     tests/ledger-merge.test.ts has required since this union shipped. And the refused money is not
     THIS card's exposure: it is a wager on a card the ledger does not keep. `allocSum` is DERIVED
     from the seated core (defect F3), so it reports the money this card actually carries and the
     top-up deciders are offered only the room this card is genuinely short — suppressing that room
     instead would leave the day under the $150 Josh asked for, the same instruction missed from
     the other side. What changes is only that the loss is legible: each discarded id is named on
     `dropped` and carries its money on `droppedPL`, the channels that already exist. */
  const unseen = other.core.filter((t) => t.id && !ids.has(t.id)).sort(byId);
  if (betConflict.length) {
    for (const t of unseen) {
      dropped.push(String(t.id));
      droppedPL[String(t.id)] = receiptOf(t, verdictOf(String(t.id), base, other));
    }
  }
  const appendable = betConflict.length ? [] : unseen;
  for (const t of appendable) {
    const stake = Number(t.stake) || 0;
    if (sum + stake > cap + 1e-6) {
      dropped.push(String(t.id));
      droppedPL[String(t.id)] = receiptOf(t, verdictOf(String(t.id), base, other));
      continue;
    }
    out.push(JSON.parse(JSON.stringify(t)) as SyncTicket);
    sum += stake;
    changed = true;
  }
  if (!changed && !dropped.length && !Object.keys(conflict).length && !betConflict.length) return null;
  return { core: out as T["core"], restaked, dropped, droppedPL, conflict, betConflict: betConflict.sort() };
}

/* ============================================================================================
 * THE MONEY METADATA MUST FOLLOW THE UNITED CORE — INSTRUCTION 45, defect K2 (2026-09-06), a
 * REGRESSION of the core union itself.
 *
 * WHAT WENT WRONG. `unionCore` unions the MLB `core` ARRAY and nothing else, so `mergeDay` left
 * `allocSum`, `gatedSum`, `blocks` and `topUpSum` at the pickBase base's stale values. MEASURED
 * against the real kernel: merging a stored block-1 MLB day (which carries a CLV sighting and so
 * wins pickBase) with the fresher block-1+2 entry yielded `core tickets: 4 · core stake sum: 150 ·
 * allocSum: 75 · gatedSum: 75 · blocks: {"b1":{...}} · owed(150−allocSum): 75`.
 *
 * WHY THAT IS MONEY AND NOT COSMETICS. `decideTopUp` (src/lib/server/blocks.ts) computes
 * `const owed = daily - Number(entry.allocSum ?? 0);` from exactly that field. On a day already
 * carrying the full $150 it reads owed = $75 and fires another top-up generate run — roughly 120
 * Odds credits — deploying a THIRD block on top of a full allotment. Nothing downstream stops it:
 * lock-card.ts's money guards are the TWO ALLOCATORS pair and the ledger validator, and none of
 * them compares the core stake sum to `daily`. It is reachable in production because
 * `buildLockEntry` copies neither `grading` nor `clv` from `carry`, so a stored day that has
 * accrued a CLV sighting reliably outranks the fresher entry on pickBase.
 *
 * THE SHAPE OF THE FIX: CARRY THE DELTA, DO NOT REWRITE THE RECORD. Each field is moved by
 * exactly what the union added to the core, measured on the SAME projection the write path sums:
 *
 *   allocSum   Σ stake.            `buildLockEntry` stamps `carry.allocSum + deployed`, where
 *              `deployed` is the sum of this fire's new core stakes and carried tickets come
 *              through byte for byte (`withTopUp` is applied only to `newCore`) — so the write
 *              path's own invariant is `allocSum === Σ core stake`, and moving it by the union's
 *              stake delta restores that invariant rather than inventing a number.
 *   gatedSum   Σ (forced ? 0 : stake − topUp). `gatedSum` is `carry.gatedSum + gatedDeployed`
 *              and `gatedDeployed = Σ cappedStake` over the GATED picks only — forced picks
 *              contribute nothing and residue is not allocator sizing. A stored ticket records
 *              both facts: `forced: true` on the forced ones, and `stake − topUp` is exactly the
 *              `cappedStake` it was sized at. A RAISE moves this projection by zero on its own
 *              (before `S − p`, after `(S + tu − p) − tu`), which is right: residue is never
 *              gated sizing.
 *   topUpSum   Σ topUp. `topUpSum` is `carry.topUpSum + Σ this fire's stamped top-ups`, so the
 *              same projection over the whole core is the same number.
 *
 * `capResidue` IS DELIBERATELY NOT TOUCHED. It is not cumulative and not a position: it is what
 * the $25 per-ticket ceiling could not absorb IN ONE FIRE (`capResidue: primaryCard.capResidue`),
 * consumed only by lock-card.ts's own note text and by write-path pins. A merge performs no
 * allocation, so it has no cap residue of its own; recomputing one would be inventing a fire that
 * never ran, and leaving the base's is the honest record of the last fire that did.
 *
 * ONLY FIELDS THE BASE ALREADY CARRIES ARE MOVED. CFB entries stamp none of these — their top-up
 * reads the money straight off the tickets (`planCfbTopUp`: `const staked = cfbStakeOf(entry.core)`)
 * and is immune to this defect — and a merge has no business minting an MLB allocator field onto
 * a CFB day. `blocks` is different and is unioned unconditionally beside `games`: it is an
 * accrual map keyed by block id, and a block present only on the loser must survive exactly the
 * way an appended ticket does.
 * ========================================================================================== */

/** The three projections the write path sums; see the block above for why each is shaped so. */
const MONEY_META = [
  ["allocSum", (t: SyncTicket) => Number(t.stake) || 0],
  ["gatedSum", (t: SyncTicket) => ((t as Record<string, unknown>).forced ? 0 : (Number(t.stake) || 0) - (Number(t.topUp) || 0))],
  ["topUpSum", (t: SyncTicket) => Number(t.topUp) || 0],
] as const;

/** Float dust off a sum of computed stakes — these are money figures, not free-running floats. */
const money = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Move `out`'s money metadata by what the union actually added, in place. `before` is the base's
 * core as it stood when `mergeDay` cloned it; `after` is the united core. `allocSum` is not moved
 * by a delta at all — it is DERIVED from `after` — see `allocSum` IS THE SEATED CORE below.
 *
 * ── A REFUSED STAKE MAY NOT MANUFACTURE `owed` (INSTRUCTION 45, defect A4, 2026-09-06, a
 *    REGRESSION of K2 above crossed with C2's reconciliation) ────────────────────────────────────
 * K2 moves each field by the union's delta INCLUDING DOWNWARD, and C2 made a receiptless raise
 * deterministically settle on the SMALLER stake. Put together, a stake the merge REFUSED lowered
 * `allocSum` — and `decideTopUp` (src/lib/server/blocks.ts, read this turn:
 * `const owed = daily - Number(entry.allocSum ?? 0);`) reads that field as "how much of today's
 * allotment is already deployed", so a refusal read as SPARE ROOM and bought a further block.
 *
 * MEASURED, both merge orders: the phone holds `p:abc @ $10` / `allocSum: 10` from block 1; the
 * server holds `p:abc @ $25` / `allocSum: 25` after block 2 re-picked the same id with no residue,
 * so `withTopUp` (src/lib/server/lock-card.ts, read this turn:
 * `t.id && tu[t.id] > 0 ? { ...t, stake: Number(t.stake) + tu[t.id], topUp: tu[t.id] } : t`)
 * stamped no receipt. Merged: p:abc @ $10 with `stakeConflict {"p:abc":{kept:10,refused:25}}` and
 * `allocSum: 10` — owed = 150 − 10 = 140 on a date where $25 is already at risk, and a further
 * generate run (~120 Odds credits) to deploy it. Second shape, a receipt that does not ACCOUNT for
 * the difference: phone `$25 topUp 5` (sizing 20) against server `$47 topUp 25` (sizing 22) —
 * refused, and `allocSum` fell 47 → 25.
 *
 * A REFUSAL IS NOT A WITHDRAWAL. The desk did not un-deploy that money; two copies merely disagree
 * about how much of it there was, and the reconciliation resolves the TICKET conservatively by
 * keeping the smaller stake. Resolving the LEDGER the same direction is the opposite of
 * conservative, because on this field small means "go spend more".
 *
 * ── `allocSum` IS THE SEATED CORE, NOT A PATCHED DELTA (INSTRUCTION 45, defect F3, 2026-09-06,
 *    a REGRESSION of the A4 fix immediately above) ────────────────────────────────────────────
 * A4's answer was a FLOOR: `Math.max(cur + delta, Math.min(cur, cap))`. It stopped `allocSum`
 * falling — and stopping it falling is exactly what leaves it ABOVE the money the day is actually
 * carrying. `decideTopUp` computes `const owed = daily - Number(entry.allocSum ?? 0);`, so an
 * `allocSum` held above the seated core UNDER-REPORTS what the day is short and THE DAY NEVER
 * TOPS UP TO $150 — the same $150 Josh asked for, missed from the other side.
 *
 * MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, 2026-09-05, before this fix: the A4 shape itself.
 * Phone `p:abc @ $10` / `allocSum: 10`; server `p:abc @ $25` / `allocSum: 25`, no receipt. Merged:
 * `stake 10`, `coreSum 10`, `allocSum 25` — a card carrying $10 of tickets telling the allocator
 * it has deployed $25, so `owed` reads 125 and the desk stops $15 short of its own allotment. The
 * floor did not merely preserve a stale total; it made the ledger disagree with the tickets it
 * describes, in the direction that starves the day.
 *
 * THE FIX: `allocSum` is DERIVED from the seated core — `Σ stake` over `after` — so it is a
 * RESTATEMENT of the tickets rather than a running patch, and the write path's own invariant
 * (src/lib/server/lock-card.ts, read this turn: `allocSum: Number(carry?.allocSum ?? 0) +
 * deployed,` with `const deployed = newCore.reduce((a, t) => a + Number(t.stake), 0);`) is what
 * the merged day now states directly: allocSum === Σ core stake. BOTH DIRECTIONS FOLLOW FROM ONE
 * RULE: a refused rival raise leaves the seated stakes alone, so it manufactures NO fresh `owed`;
 * and a day that is genuinely short reports the full shortfall, so `stakeOf(core) + owed ===
 * CFB_PAPER.daily` and the top-up reaches $150. A4's own worry — a refusal read as spare room —
 * is answered by the same identity from the other end: the refusal does not move a seated stake,
 * so it cannot move `allocSum` either.
 *
 * K2's PIN IS ARITHMETICALLY UNTOUCHED. "the money metadata follows the reconciliation down as
 * well as up (K2 both ways)" in tests/ledger-merge.test.ts is six shared ids at $25 against the
 * same six at $30 reconciling to $25 each: the delta answer was 180 → 150 and Σ of the seated core
 * is 6 × 25 = 150, the same number by a shorter route. The `cap` parameter is gone with the floor;
 * it has no other use, and an over-cap seated core is `mergeDay`'s business (see ASSERT THE
 * ALLOTMENT, DO NOT TRUST IT: kept and MARKED, not truncated), not this projection's.
 *
 * ONLY `allocSum` IS DERIVED. `gatedSum` is allocator SIZING (`stake − topUp`) and `topUpSum` is
 * the sum of stamps that travel with the stake they explain; both are ACCRUALS the write path adds
 * to across blocks and neither is a restatement of the tickets currently seated, so both keep the
 * K2 delta carry. `decideTopUp` reads `allocSum` and nothing else.
 */
function carryMoneyMeta(out: SyncEntry, before: SyncTicket[], after: SyncTicket[]): void {
  const rec = out as Record<string, unknown>;
  for (const [key, project] of MONEY_META) {
    const cur = Number(rec[key]);
    if (rec[key] === undefined || !Number.isFinite(cur)) continue;
    const sum = after.reduce((s, t) => s + project(t), 0);
    if (key === "allocSum") {
      rec[key] = money(sum);
      continue;
    }
    const delta = sum - before.reduce((s, t) => s + project(t), 0);
    if (Math.abs(delta) < 1e-9) continue;
    rec[key] = money(cur + delta);
  }
}

/** Richer-entry-wins ordering; final tiebreak is byte order so ties are still deterministic. */
function pickBase(a: SyncEntry, b: SyncEntry): [SyncEntry, SyncEntry] {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja === jb) return [a, b];
  const ka = [gradeScore(a), clvCount(a), confirmedCount(a), ja.length];
  const kb = [gradeScore(b), clvCount(b), confirmedCount(b), jb.length];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i] ? [a, b] : [b, a];
  }
  return ja > jb ? [a, b] : [b, a];
}

/** Overlay the loser's accruals onto whatever the base is missing. */
function mergeDay(x: SyncEntry, y: SyncEntry): SyncEntry {
  const [base, other] = pickBase(x, y);
  const out: SyncEntry = JSON.parse(JSON.stringify(base));
  /* THE BASE'S OWN GRADED IDS, CAPTURED BEFORE ANY GRADING CROSSES (INSTRUCTION 45, FINAL K2,
     2026-09-06) — the verdict withdrawal below needs to know WHOSE verdict is standing under a
     disputed id, and every overlay from here down (the `!out.grading` adoption on the next line
     and the fill-only ticket map merge further down) makes the two indistinguishable. */
  const baseGraded = new Set(Object.keys((base.grading?.tickets ?? {}) as Record<string, unknown>));
  if (!out.grading && other.grading) out.grading = JSON.parse(JSON.stringify(other.grading));
  /* ALT CARD (2026-08-21): the server's dual-mode shadow record rides the entry — a
     pre-ship client copy that wins pickBase on grading richness must not drop it. */
  if (!out.alt && other.alt) out.alt = JSON.parse(JSON.stringify(other.alt));
  /* THE DAY'S SHAPE IS CHOSEN ONCE (INSTRUCTION 46, 2026-09-08; durability fix round the same
     day). `coreShape` / `shapeLine` ride the entry the way `alt` does: adopted from the other
     copy when this one has none, NEVER replaced once held — a mid-day calibration tilt that
     re-picked the shape on a later fire cannot switch a day that already carries one, because
     buildLockEntry reads `carry.coreShape` and the merge keeps the first shape the day held. */
  const shp = out as { coreShape?: unknown; shapeLine?: unknown };
  const oshp = other as { coreShape?: unknown; shapeLine?: unknown };
  if (shp.coreShape == null && oshp.coreShape != null) {
    shp.coreShape = JSON.parse(JSON.stringify(oshp.coreShape));
    if (typeof oshp.shapeLine === "string") shp.shapeLine = oshp.shapeLine;
  } else if (shp.coreShape != null && typeof shp.shapeLine !== "string" && typeof oshp.shapeLine === "string") {
    shp.shapeLine = oshp.shapeLine;
  }
  /* slotUnderSum (cap at Kelly, 2026-09-08): money Kelly declined inside seated slots. It
     only grows within a day and cannot be re-derived from tickets (the slot stake is not on
     the ticket), so the merge keeps the LARGER of the two copies — dropping it would let the
     top-up sweep read seated slots as money still owed. */
  const su = out as { slotUnderSum?: unknown };
  const osu = other as { slotUnderSum?: unknown };
  const a = Number(su.slotUnderSum), b = Number(osu.slotUnderSum);
  if (Number.isFinite(b) && (!Number.isFinite(a) || b > a)) su.slotUnderSum = b;
  /* THE FOOTBALL ATTEMPT LOG IS UNIONED BY ORDINAL (INSTRUCTION 48 fix round, 2026-09-09,
     defect 3). `topUps` (src/lib/cfb/lock-server.ts claim/apply rows) was base-only, so a stale
     phone copy winning pickBase on a graded early game erased the server's later attempt rows:
     `used` under-counted (the cap re-opened) and the ordinal regressed, so the next plan re-minted
     `<prefix>-<date>-topup<n>-core-1` onto a seated id and assertCardMoney threw on every poke.
     Base wins per ordinal; rows only the other copy holds are deep-copied in; sorted by `n`. */
  {
    const rowsOf = (e: SyncEntry): { n?: unknown }[] => {
      const v = (e as Record<string, unknown>).topUps;
      return Array.isArray(v) ? (v as { n?: unknown }[]) : [];
    };
    const mine = rowsOf(out), theirs = rowsOf(other);
    if (theirs.length) {
      const seen = new Set(mine.map((r) => Number(r?.n)));
      const extra = theirs.filter((r) => !seen.has(Number(r?.n))).map((r) => JSON.parse(JSON.stringify(r)) as { n?: unknown });
      if (extra.length || !mine.length) {
        (out as Record<string, unknown>).topUps = [...mine, ...extra].sort((a, b) => (Number(a?.n) || 0) - (Number(b?.n) || 0));
      }
    }
  }
  /* THE ALT WORLD APPENDS TOO (same round): `alt.core` was base-only once both copies carried an
     `alt`, so a merge whose base predates a fire lost the shadow card's appended tickets. Tickets
     the other copy's alt holds under an unseen id are appended; the base's own are never touched. */
  if (out.alt && other.alt && Array.isArray(other.alt.core)) {
    const have = new Set((out.alt.core ?? []).map((t) => t.id));
    const add = other.alt.core.filter((t) => t.id && !have.has(t.id));
    if (add.length) {
      out.alt.core = [...(out.alt.core ?? []), ...add.map((t) => JSON.parse(JSON.stringify(t)) as SyncTicket)];
      out.alt.allocSum = money(out.alt.core.reduce((sum, t) => sum + (Number(t.stake) || 0), 0));
    }
  }
  /* THE OPEN-SLOT REPORT FOLLOWS THE COPY THAT SEATED MORE (same round): `slotsOpen` /
     `slotsUnfilled` are written by buildLockEntry for the seating it just did, so the copy with
     the LARGER allocSum is the one whose report is current; a base that won on grading richness
     otherwise kept a pre-fire report and showed slots as open that a later fire had seated. */
  {
    const oa = Number((other as { allocSum?: unknown }).allocSum), ba = Number((out as { allocSum?: unknown }).allocSum);
    const o = other as Record<string, unknown>, b = out as Record<string, unknown>;
    if (Number.isFinite(oa) && (!Number.isFinite(ba) || oa > ba)) {
      for (const k of ["slotsOpen", "slotsUnfilled"] as const) {
        if (o[k] != null) b[k] = JSON.parse(JSON.stringify(o[k]));
      }
    }
  }
  if (other.clv) {
    out.clv = { ...JSON.parse(JSON.stringify(other.clv)), ...(out.clv ?? {}) };
  }
  /* FILL-ONLY, per field, over ACCRUAL_FIELDS. An existing answer is never overwritten in
     either direction — `!= null` treats `placed:false` as an ANSWER, so a false fills a null
     and nothing overwrites a false. Two devices holding true-vs-false for the same ticket is a
     genuine conflict this merge cannot adjudicate; pickBase order decides it, and that is
     stated rather than hidden. */
  const fill = (mine: SyncTicket[], theirs: SyncTicket[] | undefined) => {
    if (!theirs) return;
    for (const t of mine) {
      if (!t.id) continue;
      const m = theirs.find((o) => o.id === t.id);
      if (!m) continue;
      for (const f of ACCRUAL_FIELDS) {
        if (t[f] == null && m[f] != null) (t as Record<string, unknown>)[f] = m[f];
      }
    }
  };
  fill(out.core, other.core);
  fill(out.funT ?? [], other.funT);
  /* PER-TICKET `shapeSlot` (INSTRUCTION 46) — fill-only like the accruals above, kept OUT of
     ACCRUAL_FIELDS on purpose: that list is the placement-answer contract (tests/placed-field)
     and a slot index is not an answer Josh gave. A ticket this copy holds without a slot takes
     the slot the other copy stamped for the same id; a stamped slot is never overwritten.
     Tickets unionCore APPENDS from the other side are deep clones, so their slot rides along. */
  const fillSlot = (mine: SyncTicket[], theirs: SyncTicket[] | undefined) => {
    if (!theirs) return;
    for (const t of mine) {
      if (!t.id || typeof (t as { shapeSlot?: unknown }).shapeSlot === "number") continue;
      const m = theirs.find((o) => o.id === t.id) as { shapeSlot?: unknown } | undefined;
      if (m && typeof m.shapeSlot === "number") (t as Record<string, unknown>).shapeSlot = m.shapeSlot;
    }
  };
  fillSlot(out.core, other.core);
  /* CORE UNION (INSTRUCTION 45, 2026-09-06) — the CFB top-up appends core tickets to an
     already-locked day and MLB's residue top-up raises a shared ticket's stake under its own id,
     so core is now more than what funT has always been: two sides of one date holding different
     ticket SETS *and* different money on the tickets they share. Guarded by AGREEMENT +
     ALLOTMENT; see the block above `pickBase` for what went wrong and why the gates are shaped
     this way. Runs AFTER `fill` so a raised ticket carries the accruals fill just gave it. */
  const coreBefore = out.core;
  const united = unionCore(out, other);
  if (united) {
    out.core = united.core;
    /* THE MONEY METADATA FOLLOWS THE CORE (INSTRUCTION 45, defect K2) — otherwise the merged day
       keeps the base's stale `allocSum` and `decideTopUp` buys a third block on a full $150 day.
       See THE MONEY METADATA MUST FOLLOW THE UNITED CORE above `pickBase`. */
    carryMoneyMeta(out, coreBefore, united.core);
  }
  /* WHAT THE CORE UNION REFUSED IS NAMED, THE SAME WAY THE FUN UNION'S REFUSALS ARE
     (INSTRUCTION 45, defect C2, 2026-09-06) — see STOP TRUSTING THE CLONE above `unionCore`. Three
     markers, all accrued from BOTH sides so a refusal an earlier merge recorded is not lost when
     this one appends something else, base last so a value this merge just measured wins:
       · `coreDropped`   — ids the allotment refused, dropped again if the id is now seated.
       · `coreDroppedPL` — what each of those wagers was WORTH, same shape as `funDroppedPL`.
       · `stakeConflict` — {kept, refused} for a shared id whose stakes disagreed with no receipt.
     A conflict marker is kept only while the id is still seated AT THE STAKE IT NAMES, so a later
     merge that arrives WITH a receipt and lifts the stake clears the marker rather than leaving it
     to contradict the ticket beside it.

     `coreDropped` / `coreDroppedPL` NOW CARRY TWO REFUSALS, not one (INSTRUCTION 45, CLOSING K3,
     2026-09-06). The three bullets above were written when the allotment was the only thing that
     refused a core ticket; since this round a ticket held only by a RIVAL LOCK is refused with the
     same receipt rather than discarded in silence — see AND THE DISCARD LEAVES A RECEIPT in
     `unionCore`. The bullets are left byte-unchanged because they are quoted verbatim by
     tests/cfb-store-convergence.test.ts; this paragraph is the amendment. */
  const coreDropOf = (e: SyncEntry): string[] => (Array.isArray(e.coreDropped) ? (e.coreDropped as unknown[]).map(String) : []);
  const mapOf = <V,>(e: SyncEntry, k: string): Record<string, V> => {
    const v = (e as Record<string, unknown>)[k];
    return v && typeof v === "object" && !Array.isArray(v) ? ({ ...(v as Record<string, V>) }) : {};
  };
  const arrOf = (e: SyncEntry, k: string): string[] => {
    const v = (e as Record<string, unknown>)[k];
    return Array.isArray(v) ? (v as unknown[]).map(String) : [];
  };
  const coreDropped = new Set<string>([...coreDropOf(out), ...coreDropOf(other)]);
  /* `betConflict` (INSTRUCTION 45, defect A2, 2026-09-06) — the ids the two copies mean DIFFERENT
     BETS by. Accrued from both sides like the three markers above, because the refusal it records
     is a fact about a PAIR of copies and a later merge against a third copy must not erase it. */
  const betConflict = new Set<string>([...arrOf(out, "betConflict"), ...arrOf(other, "betConflict")]);
  const coreDroppedPL: Record<string, DroppedPL> = { ...mapOf<DroppedPL>(other, "coreDroppedPL"), ...mapOf<DroppedPL>(out, "coreDroppedPL") };
  const conflicts: Record<string, StakeConflict> = { ...mapOf<StakeConflict>(other, "stakeConflict"), ...mapOf<StakeConflict>(out, "stakeConflict") };
  if (united) {
    for (const id of united.dropped) coreDropped.add(id);
    Object.assign(coreDroppedPL, united.droppedPL);
    Object.assign(conflicts, united.conflict);
    if (united.dropped.length) {
      /* TWO REFUSALS SHARE THIS CHANNEL TOO (INSTRUCTION 45, CLOSING K3, 2026-09-06). Since the
         rival-lock discard started leaving a receipt, `dropped` carries both the allotment's
         refusal and the rival card's — and "the allotment is spent" is FALSE of the second one:
         the measured rival fixture drops $50 off a card carrying $20 of its $150. The allotment
         wording is byte-unchanged on the branch it describes. */
      console.warn(
        united.betConflict.length
          ? `[ledger-merge] ${out.date}: ${united.dropped.length} core ticket(s) belong to a RIVAL lock and were refused, not staked on this card — each is named with its money: ${united.dropped.join(", ")}`
          : `[ledger-merge] ${out.date}: the $${allotmentCap(out, other)} core allotment is spent — ${united.dropped.length} core ticket(s) refused by the merge: ${united.dropped.join(", ")}`,
      );
    }
    if (Object.keys(united.conflict).length) {
      /* TWO REFUSALS SHARE ONE MARKER CHANNEL, SO THEY MAY NOT SHARE ONE SENTENCE (INSTRUCTION 45,
         defect F2, 2026-09-06). `conflict` now carries the RIVAL-CARD refusal as well as the
         receiptless one, and in the rival case the stake that stands is THIS CARD'S — which can be
         the larger of the two. Saying "the SMALLER stake stands" there would be false. The
         receiptless wording is left as it is on the branch it describes for one reason only —
         it is still exactly what that branch does. NOTHING OUTSIDE THIS FILE QUOTES THIS WARN
         STRING AND NO TEST ASSERTS IT BY VALUE. Grepped this turn, "disagreed on stake" outside
         this file occurs in exactly four places — src/lib/cfb/store.ts, src/lib/cfb/types.ts,
         src/components/cfb/CfbLedger.tsx and tests/cfb-card-ui.test.ts — and every one of them
         carries the CARD'S note or this field's old doc, each framed in the past tense as
         superseded. None is this line, and none is live. An earlier draft of this block named
         three files as verbatim carriers of THIS string and was false on all three; line numbers
         are deliberately omitted here because they are what goes stale.

         ── THE "no topUp receipt" CLAUSE IS DELETED, NOT REWORDED (INSTRUCTION 45, FINAL2 K6,
            2026-09-06) ──────────────────────────────────────────────────────────────────────────
         The non-rival branch reaches this line from TWO refusals, not one: the receiptless
         disagreement (`win = lo`) and a receipted lift the ALLOTMENT could not seat (`receipted ||
         rivals` with the receipt present, read and then overruled). The second is the case FINAL
         K1 added and it makes "with no topUp receipt" FALSE — observed on this round's own K1
         fixture, verbatim: "[ledger-merge] 2026-09-05: 2 shared core id(s) disagreed on stake with
         no topUp receipt — the SMALLER stake stands: cfb-2026-09-05-core-1, cfb-2026-09-05-core-2"
         where core-1's receipt passed the difference test exactly.
         AT WARN TIME THE FUNCTION CANNOT TELL THE TWO APART — `conflict` is {kept, refused} and
         nothing on it records WHY — and a channel that recorded the reason would be new machinery
         for a console line. What the code does know is that on this branch `kept` is the smaller
         stake in BOTH cases (the receipted refusal keeps `mine` against a larger `yours`; the
         receiptless one keeps `lo`), so "the SMALLER stake stands" is true of every id it names
         and is kept for that reason alone. The clause that was not true of every id it named is
         simply gone. */
      const cids = Object.keys(united.conflict).sort().join(", ");
      const n = Object.keys(united.conflict).length;
      console.warn(
        united.betConflict.length
          ? `[ledger-merge] ${out.date}: ${n} shared core id(s) disagreed on stake across RIVAL CARDS — nothing was reconciled between them and this card's own stake stands: ${cids}`
          : `[ledger-merge] ${out.date}: ${n} shared core id(s) disagreed on stake — the SMALLER stake stands: ${cids}`,
      );
    }
    for (const id of united.betConflict) betConflict.add(id);
    if (united.betConflict.length) {
      console.warn(
        `[ledger-merge] ${out.date}: ${united.betConflict.length} shared core id(s) name DIFFERENT BETS on the two copies — rival cards are never mixed, so the base's ticket stands and nothing was appended: ${united.betConflict.join(", ")}`,
      );
    }
  }
  const seatedCore = new Map(out.core.filter((t) => t.id).map((t) => [String(t.id), Number(t.stake) || 0]));
  const sortedKeys = (o: Record<string, unknown>) => Object.keys(o).sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
  const stillCoreDropped = [...coreDropped].filter((id) => !seatedCore.has(id)).sort();
  if (stillCoreDropped.length) out.coreDropped = stillCoreDropped;
  else delete out.coreDropped;
  const stillCorePL = Object.fromEntries(sortedKeys(coreDroppedPL).filter((id) => !seatedCore.has(id)).map((id) => [id, coreDroppedPL[id]]));
  if (Object.keys(stillCorePL).length) out.coreDroppedPL = stillCorePL;
  else delete out.coreDroppedPL;
  const stillConflict = Object.fromEntries(
    sortedKeys(conflicts)
      .filter((id) => seatedCore.has(id) && Math.abs((seatedCore.get(id) as number) - conflicts[id].kept) < 1e-6)
      .map((id) => [id, conflicts[id]]),
  );
  if (Object.keys(stillConflict).length) out.stakeConflict = stillConflict;
  else delete out.stakeConflict;
  /* A bet conflict is kept only while the id is STILL SEATED, exactly as `coreDropped`'s mirror
     image: a marker naming a ticket the merged day no longer carries would contradict the card. */
  const stillBetConflict = [...betConflict].filter((id) => seatedCore.has(id)).sort();
  if (stillBetConflict.length) (out as Record<string, unknown>).betConflict = stillBetConflict;
  else delete (out as Record<string, unknown>).betConflict;
  /* BLOCKS (same defect): an accrual map keyed by block id, unioned the way `games` is, base wins
     conflicts. A block fire recorded only on the loser must survive the merge exactly the way the
     tickets it seated do — the measured merge kept `{"b1":…}` over a day that had fired twice.

     THE LOSER'S RECORDS ARE DEEP-COPIED (INSTRUCTION 45, defect A2, 2026-09-06). This was a plain
     spread of `other.blocks`, which copies the MAP but not the block records inside it — unlike
     `unionCore` / `unionFun`, which deep-clone every ticket they append. The base's own records
     are already safe (`mergeDay` clones the pickBase winner wholesale), but a block present only
     on the LOSER arrived on the merged day as a live reference into the losing input entry.
     MEASURED: base carries blocks {b1} and wins pickBase on gradeScore, other carries {b1, b2};
     the merged entry's `blocks.b2` was the SAME OBJECT as the input's, so setting
     `merged.blocks.b2.tickets = 99` left the input entry reading 99 too.

     LOW, and here is the whole of why: keys are block ids and the base wins conflicts, so a block
     can never be DOUBLE-COUNTED — a two-fire day merges to {b1, b2} with allocSum 150 and
     `decideTopUp` owed 0 in both orders.

     THE CONSEQUENCE THIS ONCE NAMED WAS FALSE AND IS WITHDRAWN (INSTRUCTION 45, defect A4,
     2026-09-06). It read "a consumer editing a block record in place (the registry write in
     app/api/generate/route.ts) mutates the merged day and the input together". GREPPED AGAIN
     TODAY: NO writer in this repo edits a block record in place. The line that was named assigns a
     FRESH object to a different map entirely — `reg[k] = { firedAt: now, tickets: (entry.blocks?.
     [k]?.tickets ?? 0), budget: blockBudget, at: now }`, where `reg` is the Redis BLOCK REGISTRY
     and `entry.blocks` is only READ for a number — and `buildLockEntry`
     (src/lib/server/lock-card.ts) rebuilds the map as `{ ...(carry?.blocks ?? {}), [blockKey]:
     { … } }`, a spread plus a fresh record. A citation is a claim, and that one did not hold.

     WHAT IS TRUE, and is the whole justification the deep copy needs: aliasing between the merged
     OUTPUT and a LOSING INPUT is a hazard the ticket unions already refuse — `unionCore` and
     `unionFun` deep-clone every ticket they seat, and `mergeDay` deep-clones the base entry
     wholesale — so a map that hands back live references into the loser is the one place the
     merged day is not independent of its inputs. Closing it removes a class of hazard rather than
     a measured symptom, and it makes this union consistent with the ones beside it. The sibling
     `games` union carried the identical shape and was closed the same way this round (defect A3;
     see the games union in `mergeDay`). */
  if (other.blocks || out.blocks) {
    out.blocks = { ...(JSON.parse(JSON.stringify(other.blocks ?? {})) as NonNullable<SyncEntry["blocks"]>), ...(out.blocks ?? {}) };
  }
  /* Supplemental fun locks append funT tickets after the daily lock, so the two
     sides of a merge can hold different ticket SETS for the same day. Union by
     ticket id — an append on one device must survive a merge with a copy that
     predates it (even one that outranked it in pickBase by grading richness).
     BOUNDED BY THE DAY'S FUN ALLOTMENT since 2026-09-06 (INSTRUCTION 45, defect N2) — see
     `funCap` for the two overlapping pokes that measured $50 of fun money on a $25 day. Appends
     are taken in TICKET-ID ORDER, like the core union's, so which ticket wins a scarce allotment
     is a pure function of the two inputs and not of the order the loser happened to store its
     tickets in; `mergeDay` stays symmetric and idempotent. The loop itself now lives in
     `unionFun`, exported so the CFB device store shares this one cap (INSTRUCTION 45, K5).

     AND WHAT THE CAP REFUSES IS NAMED, NOT SWALLOWED (INSTRUCTION 45, defect K4, 2026-09-06) —
     see `unionFun` for why a silent drop is the wrong shape. `funDropped` accrues from BOTH sides
     so a drop recorded by an earlier merge is not lost when this one appends something else, and
     an id that is now seated is removed from it, so the marker never outlives the loss it names. */
  const droppedOf = (e: SyncEntry): string[] => (Array.isArray(e.funDropped) ? (e.funDropped as unknown[]).map(String) : []);
  const plOf = (e: SyncEntry): Record<string, DroppedPL> => {
    const v = (e as { funDroppedPL?: unknown }).funDroppedPL;
    return v && typeof v === "object" && !Array.isArray(v) ? ({ ...(v as Record<string, DroppedPL>) }) : {};
  };
  const dropped = new Set<string>([...droppedOf(out), ...droppedOf(other)]);
  /* THE RECEIPT ACCRUES THE SAME WAY THE NAMES DO (INSTRUCTION 45, defect A1) — from BOTH sides,
     base last so a value this merge just measured wins, and filtered by what is seated below so a
     receipt never outlives the loss it describes. */
  const droppedPL: Record<string, DroppedPL> = { ...plOf(other), ...plOf(out) };
  const fu = unionFun(out, other);
  if (fu) {
    /* BY ID LIST, NOT BY LENGTH (INSTRUCTION 45, defect A1): the settlement ranking can SWAP one
       $25 ticket for another, which leaves the count identical — a length test would have thrown
       the swap away and left the unsettled loser seated. */
    const idList = (tix: SyncTicket[]) => tix.map((t) => String(t.id)).join("|");
    if (idList(fu.funT) !== idList(out.funT ?? [])) out.funT = fu.funT;
    for (const id of fu.dropped) dropped.add(id);
    Object.assign(droppedPL, fu.droppedPL);
    if (fu.dropped.length) {
      console.warn(
        `[ledger-merge] ${out.date}: the $${funCap(out, other)} fun allotment is spent — ${fu.dropped.length} fun ticket(s) refused by the merge and NOT recorded on the day: ${fu.dropped.join(", ")}`,
      );
    }
  }
  const seatedFun = new Set((out.funT ?? []).map((t) => String(t.id)));
  const stillDropped = [...dropped].filter((id) => !seatedFun.has(id)).sort();
  if (stillDropped.length) out.funDropped = stillDropped;
  else delete out.funDropped;
  const stillPL = Object.fromEntries(
    Object.entries(droppedPL)
      .filter(([id]) => !seatedFun.has(id))
      .sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)),
  );
  if (Object.keys(stillPL).length) out.funDroppedPL = stillPL;
  else delete out.funDroppedPL;
  /* ── NO-PLAY IS NOT A DAY WITH BETS ON IT — EITHER BUCKET ────────────────────────────────────
     (INSTRUCTION 45, defect N4, 2026-09-06; MOVED AND WIDENED here for defect A1, a regression of
     N4, same instruction, same day.)

     The same one-line rule the server write path applies over BOTH money buckets — which until N4
     lived ONLY on the entry the server writes.

     CITATION CORRECTED (INSTRUCTION 45, defect A5, 2026-09-06). This paragraph quoted
     `applyCfbTopUp` as reading, "verbatim today",
     `if (next.noPlay && (core.length || funT.length)) delete next.noPlay;`. That was its form when
     N4 was written and it is NOT what the function says now: `applyCfbTopUp` in
     src/lib/cfb/lock-server.ts, grepped this turn, reads

         if (next.noPlay && (staked > MONEY_EPS || funStaked > MONEY_EPS)) delete next.noPlay;

     — it adopted THIS line's staked-money test (that file names the change "...AND THE TEST IS
     STAKED MONEY, NOT A ROW COUNT", and cites this rule as the one it followed). So the two rails
     agree more closely than the stale quotation admitted: both end the claim on MONEY, not on a
     row's existence, and `MONEY_EPS` is that file's name for the literal 1e-9 used below. Measured on the merge rail: the server records 2026-09-05
     as a NO-PLAY (core [], noPlay true); the phone pulls it and grades the empty day
     (`gradeCfbEntry`'s `every` over an empty ticket list is vacuously true), so its copy carries
     done:true and wins pickBase on gradeScore 2 > 0; the server then tops the day up to two
     tickets, and the union appends them INTO the no-play copy. The merged entry read noPlay:true
     over 2 core tickets and $50 staked, and the Builder renders such a day as NO-PLAY. The flag is
     a claim about the card, so it cannot outlive the card being empty.

     N4 SHIPPED THE TEST AS `out.core.length` ALONE, AND THAT WAS A REGRESSION WAITING ON THIS
     ROUND'S OTHER HALF. It was exact only while a no-play day could not hold fun money:
     `buildCfbCard` returned from inside its CORE section when nothing cleared the +2% gate, so a
     NO-PLAY card had an empty fun bucket by construction. src/lib/cfb/card.ts changed that in this
     same round — the fun allotment is gated independently of the core, so a board where nothing
     clears the core gate still seats the $25 parlay, and `planCfbTopUp` can return a plan of ONE
     fun ticket and no core ticket at all. MEASURED, both merge orders: base = the no-play day the
     server locked and the phone graded (core [], funT [], noPlay true, grading done — grading an
     EMPTY ticket list is vacuously done, so this copy wins pickBase and becomes the base); other =
     the same date carrying `cfb-2026-09-05-topup1-fun-1 @ $25`. Merged: core 0 · funT 1 · fun $25 ·
     noPlay TRUE. src/components/cfb/CfbBuilder.tsx `lockedLine` returns "NO-PLAY recorded — nothing
     staked. The day stands in the CFB ledger." off that flag, and src/components/cfb/CfbLedger.tsx
     `DayCard` puts a "No-play" pill in the day's summary row — which under the FUN scope sits
     directly above the $25 ticket it denies, since `DayCard` lists `cfbTicketsOf(e, scope)` beneath
     it. The P/L arithmetic is unaffected; this is a pure reporting lie over live
     money, which is why it is a REPORTING fix and touches no stake anywhere.

     THE CLEAR HAD TO MOVE, NOT ONLY WIDEN. It used to run between the `blocks` union and the fun
     union — i.e. ABOVE the `unionFun` call and above the `out.funT = fu.funT` assignment it feeds —
     so widening the condition in place would have been a NO-OP: `out.funT` was still the base's own
     (empty) list at the moment the flag was decided, and the fun ticket that makes the day real had
     not been seated yet. It now runs BELOW the fun union and below the `funDropped` bookkeeping,
     where
     both buckets are final. Nothing between the union and here can reintroduce the flag: the only
     writers in between are `out.funT`, `out.funDropped`, `out.funDroppedPL` and the
     `console.warn`, and `noPlay` is never written anywhere in this module.

     ── AND THE TEST IS STAKED MONEY, NOT A TICKET COUNT (INSTRUCTION 45, defect A2, 2026-09-06) ──
     N4 shipped this as `out.core.length`, and the widening above added `(out.funT ?? []).length`
     beside it — both COUNTS. `noPlay` is a claim about the CARD: "the day locked with nothing
     staked". A $0 entry stakes nothing, so a day whose only rows are $0 rows is still exactly the
     day the flag describes, and ending the claim on the row's EXISTENCE reports a day as played
     over $0.00 of exposure. Summing the stakes is also the same projection every consumer already
     uses to decide whether the day carries money — `todayExposure` (src/lib/bankroll.ts) reduces
     `core` + `funT` over `t.stake`, and `assertCfbCardMoney` (src/lib/cfb/lock-server.ts) guards
     the same sums — so the flag and the money now answer off one number instead of two.
     WHAT DOES NOT CHANGE: a genuinely empty day still KEEPS the flag (both buckets empty sum to 0
     and the condition is false), and a real staked ticket in EITHER bucket still ends it. */
  if (out.noPlay && (stakeSum(out.core) > 1e-9 || stakeSum(out.funT ?? []) > 1e-9)) delete out.noPlay;
  /* games union (base wins conflicts): an appended ticket's legs may reference
     games the base copy never saw, and grading + CLV both key off entry.games

     THE LOSER'S RECORDS ARE DEEP-COPIED (INSTRUCTION 45, defect A3, 2026-09-06), the way the
     `blocks` union beside it was last round and the way `unionCore` / `unionFun` deep-clone every
     ticket they seat. This was a plain spread of `other.games`, which copies the MAP but not the
     game RECORDS inside it: the base's own are already safe (`mergeDay` clones the pickBase winner
     wholesale), but a game key present only on the LOSER arrived on the merged day as a live
     reference into the losing input entry. MEASURED: base carries games {g1} and wins pickBase on
     gradeScore, other carries {g1, g2}; the merged entry's `games.g2` was the SAME OBJECT as the
     input's, so setting `merged.games.g2.pk = 99` left the input entry reading 99 too.

     LOW, and the same reasoning as the blocks union's: keys are game keys and the base wins
     conflicts, so nothing can be double-counted, and no writer in the repo edits a game record in
     place today — `repairEntry` below is the one writer that changes a `pk` at all and it clones
     the whole entry first. What the aliasing removes is a class of hazard rather than a live one:
     the merged output and a losing input silently sharing mutable state, which the ticket unions
     already refuse. The union is now consistent with them. */
  if (other.games || out.games) {
    out.games = {
      ...(JSON.parse(JSON.stringify(other.games ?? {})) as Record<string, unknown>),
      ...((out.games as Record<string, unknown>) ?? {}),
    };
  }
  /* grades are deterministic from boxscores — fill-only map merge makes the
     merged day strictly better-informed without ever overwriting a grade

     ── A SETTLEMENT IS NOT OVERWRITTEN BY THE ABSENCE OF ONE (INSTRUCTION 45, FINAL2 K3,
        2026-09-06, inherited; found independently by two critics) ─────────────────────────────
     "Without ever overwriting a grade" was the intent; `{...other, ...out}` was the whole of the
     implementation, and it treats a NON-verdict as a grade. `RESOLVED` above is this module's own
     name for the three verdicts that are a SETTLEMENT — `pending` and `ungradable` are the absence
     of one — so a stale 48-hour VOID standing on the base DELETED a corroborated correction.

     IT WAS UNRECOVERABLE, in both merge orders, because `pickBase`'s last two tiebreaks are the
     entry's SERIALISED BYTE LENGTH and then a raw JSON byte comparison, and neither is a fact
     about how well-settled a day is: `{"result":"ungradable","payout":0}` is THREE BYTES LONGER
     than `{"result":"won","payout":47.73}`, so the void copy wins that tiebreak every time it
     syncs. MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, on one $25 CFB ticket:
       {"result":"ungradable","payout":0,"note":"stale"}
     — the day closed (`done: true`) on a void for a ticket the other copy settled at $47.73, and
     every later sync re-derived the same answer.

     THE FIX IS NOT IN `pickBase`: reordering the base choice moves every merge in this file, and
     the harm is specific. A SETTLEMENT FILLS OVER THE ABSENCE OF ONE, in either direction; two
     settlements that disagree are still decided by the base, exactly as before, and so is every
     pair where neither side has settled. `betConflict` ids are EXCLUDED — importing a rival card's
     verdict under a shared id is precisely the harm CLOSING K1 exists to prevent, and the
     withdrawal below does not re-delete a verdict the base already carried (FINAL K2's scope).
     CONVERGENT: after one merge the day carries the settlement, so a later sync of the void copy
     re-derives it whichever copy `pickBase` seats. */
  if (out.grading && other.grading) {
    const theirTix = (other.grading.tickets ?? {}) as Record<string, unknown>;
    const ourTix = (out.grading.tickets ?? {}) as Record<string, unknown>;
    const tix: Record<string, unknown> = { ...theirTix, ...ourTix };
    const inDispute = new Set(united ? united.betConflict : []);
    for (const id of Object.keys(theirTix)) {
      if (!inDispute.has(id) && settlementOf(theirTix[id]) && !settlementOf(ourTix[id])) tix[id] = theirTix[id];
    }
    out.grading.tickets = tix;
    out.grading.legs = { ...(other.grading.legs ?? {}), ...(out.grading.legs ?? {}) };
  }
  /* ── THE RAISE INVALIDATES ITS VERDICT (INSTRUCTION 45, defect N1, 2026-09-06) ─────────────
     A stake and the payout beside it are ONE quote. The graders price the payout FROM the stake
     (src/lib/cfb/grade.ts `settle`: `const payout = Math.round(stake * dec * 100) / 100;`), so the moment the
     union raises a shared id the verdict already in `grading.tickets` describes a bet that no
     longer exists — and `done: true` tells every grader there is nothing left to recompute. The
     reopen rule below cannot catch it: that rule fires on a MISSING id, and a raised id is
     PRESENT. `realizedPL` (src/lib/bankroll.ts `ticketPL`: won -> payout - stake) then reads the
     NEW stake against the OLD payout.

     MEASURED on the MLB PUT rail: the phone pulls 2026-09-01 between block fires holding core
     [p:abc $40, p:def $50], grades it (p:abc won, payout 76 = 40 x 1.90; p:def lost) and sets
     done; the server's residue top-up has meanwhile raised p:abc to $60 (topUp 20). After the
     merge: stake 60, payout 76, done true, realizedPL -34 and computeBankroll 2466 against an
     honest +4 / 2504 — a $38 permanent error on one ticket, flowing into ticketKelly and every
     stake sized after it.

     DELETE, NOT RESCALE. Rescaling needs the ticket's settling decimal and the record does not
     reliably hold it: `dec` is written on SOME grades only (`settle` returns it on `won` and on
     the all-legs-pushed `push`, never on `lost` / `pending` / `ungradable`; the MLB ticket grade
     type says the same — src/lib/useLedger.ts `TicketGrade`, `dec?: number`), a PUSH payout is
     the STAKE handed back rather than stake x dec, and a won parlay's `dec` is the product of the
     legs that STOOD (pushed legs drop out), so it is not recoverable from the ticket's own
     czOdds / czDec either. Deleting hands the arithmetic back to the grader, which reads finals
     and the NEW stake. Until it runs the ticket scores 0 — exactly what `ticketPL` already
     returns for an ungraded ticket, and the honest state: nobody has priced a $60 winner yet.

     THE LEGS go with it, but only the ones no surviving ticket still references. Leg verdicts are
     stake-INDEPENDENT, so they are not wrong after a raise and this is not required for the money;
     it is here so an invalidated ticket does not leave a half-present grading record behind it —
     a settled leg map standing over a ticket whose verdict was withdrawn is the shape that bred
     this defect. A leg another ticket still owns is left alone, because that ticket's verdict is
     still standing and both overlays refuse to overwrite a SETTLED leg (src/lib/cfb/store.ts
     `overlayGrading`, src/lib/cfb/lock-server.ts `overlayCfbGrading`).

     RUNS AFTER the fill-only grading map merge above, not beside `out.core`: the loser may carry
     the same stale verdict, and that merge would put it straight back.

     ── AND A REFUSED WAGER MAY NOT BOOK ITS VERDICT AS A WIN (INSTRUCTION 45, CLOSING K1,
        2026-09-06) ─────────────────────────────────────────────────────────────────────────────
     N1 drove this withdrawal off `restaked` ALONE. A RIVAL-CARD id never enters `restaked` —
     `unionCore`'s pre-pass pushes it onto `betConflict` and seats the BASE's ticket byte-unchanged
     — so the withdrawal never fired for it, while the fill-only grading merge directly above had
     ALREADY copied the RIVAL copy's verdict in under that same id. This round built the detector
     (`betConflict`) and this remedy and wired one to the other for only half the ids in dispute.

     MEASURED THROUGH `mergeLedgers`, BOTH ORDERS, before this fix. Two CFB copies of 2026-09-05
     share `cfb-2026-09-05-core-1` on DIFFERENT games; the base (gradeScore 2, done) carries it on
     g1, the rival names g2 and grades it `{result:"won", payout:47.73}` with leg
     `g2|spread|home|-3`:
       {"seatedGkey":"g1","verdict":{"result":"won","payout":47.73},"done":true,
        "legKeys":["g2|spread|home|-3","g2b|spread|home|-3"],
        "betConflict":["cfb-2026-09-05-core-1"],"realizedPL":-2.27,"coreSum":50}
     $47.73 of payout credited on a wager the merge REFUSED, plus an orphan leg key for a game the
     day does not seat. `won` is in RESOLVED so no overlay may overwrite it and `done: true` stops
     every grader recomputing — the day is closed on a fiction, permanently.

     SO THE WITHDRAWAL IS DRIVEN OFF `restaked` UNION `betConflict`. Both name ids in dispute and
     the remedy is identical for both, because the reason is identical: the verdict on the day
     describes a bet the merged card does not carry. The refusal stays scoped to the ids actually
     in dispute — a shared id the two copies agree about keeps its verdict and its leg keys.
     THE RIVAL COPY'S LEG KEYS GO TOO, and only they: `keep` is built from every ticket NOT in
     dispute, and a disputed id surrenders the lkeys of BOTH copies' ticket (the seated one and the
     rival's) minus anything `keep` still owns. Withdrawing only the SEATED ticket's lkeys would
     leave the orphan `g2|…` key above standing over a game the day does not seat, which is the
     half-present grading record this whole rule exists to prevent. */
  /* ── THE WITHDRAWAL IS SCOPED TO THE VERDICT IN DISPUTE, NOT TO THE ID (INSTRUCTION 45,
        FINAL K2, 2026-09-06, a REGRESSION of CLOSING K1 directly above) ─────────────────────────
     CLOSING K1's `betConflict` half is UNCONDITIONAL, so it deletes whatever verdict stands under
     a disputed id — including the day's OWN re-grade of the ticket it actually SEATS. The first
     merge is right (the rival's imported payout is withdrawn and the day reopens); the grader then
     re-grades the SEATED bet honestly; and the next sync of that same rival copy deletes the honest
     verdict again, because `betConflict` is re-derived from the tickets every time and the
     fill-only grading merge above has just kept the base's own answer for it to delete. The day is
     re-closed and re-opened forever and its `realizedPL` never holds the honest number.

     MEASURED, BOTH ORDERS, as merge → grade → merge → grade. CFB 2026-09-05 (device core-1 g1 $25
     + core-2 g2b $25 graded lost/done, against the server's rival lock naming core-1 on g2 at
     {won, 47.73}): six cycles gave done [false × 6] and realizedPL [−25 × 6] against the honest
     −50. MLB 2026-09-01 (core [p:abc $50, p:def $50], the rival naming p:abc on another leg at
     {won, 95}): four cycles gave −50 against the honest −5 — the whole day wrong by $45 on every
     sync, through `computeBankroll` into `ticketKelly` and every stake sized after it.

     THE SCOPE. A `restaked` id is still withdrawn UNCONDITIONALLY: its stake moved, so its own
     payout is stale whoever produced it. A `betConflict` id is withdrawn only when the verdict now
     standing came from `other` — i.e. when `baseGraded` (captured at the top of this function,
     before any grading crossed) does not already hold it. THE LEG KEYS ARE NOT NARROWED: the rival
     copy's exclusive lkeys are dropped for EVERY disputed id, which is the orphan-key half CLOSING
     K1 got right, and a leg the merged card still owns is protected by `keep` either way.
     CONVERGENT, and that is the property FINAL K2's pins assert over repeated cycles rather than
     over one merge: once the day carries its own verdict for a disputed id, every later merge is a
     no-op on it, so `done` stays true and the honest P/L stands. */
  const disputed = united ? united.betConflict.filter((id) => !baseGraded.has(id)) : [];
  const withdrawn = united ? [...new Set([...united.restaked, ...disputed])].sort() : [];
  const legWithdrawn = united ? [...new Set([...withdrawn, ...united.betConflict])].sort() : [];
  if (legWithdrawn.length && out.grading) {
    const tix = { ...(out.grading.tickets ?? {}) };
    const legs = { ...(out.grading.legs ?? {}) };
    const all = [...out.core, ...(out.funT ?? [])];
    const raised = new Set(withdrawn);
    const keep = new Set<string>();
    for (const t of all) if (!(t.id && raised.has(String(t.id)))) for (const k of lkeysOf(t)) keep.add(k);
    const rivalCopy = new Map<string, SyncTicket>();
    for (const t of [...other.core, ...(other.funT ?? [])]) if (t.id) rivalCopy.set(String(t.id), t);
    for (const id of legWithdrawn) {
      if (raised.has(id)) delete tix[id];
      const doomed = [...lkeysOf(all.find((t) => String(t.id) === id)), ...lkeysOf(rivalCopy.get(id))];
      for (const k of doomed) if (!keep.has(k)) delete legs[k];
    }
    out.grading.tickets = tix;
    out.grading.legs = legs;
    if (withdrawn.length) out.grading.done = false;
  }
  /* any ticket without a grade reopens grading so the auto-grader picks it up */
  if (out.grading?.done) {
    const graded = out.grading.tickets ?? {};
    if ([...out.core, ...(out.funT ?? [])].some((t) => t.id && !(t.id in graded))) out.grading.done = false;
  }
  /* ── ASSERT THE ALLOTMENT, DO NOT TRUST IT (INSTRUCTION 45, defect K3, 2026-09-06) ──────────
     `unionCore`'s ALLOTMENT gate bounds only what the union APPENDS or RAISES. `mergeDay` reaches
     that gate only after deep-cloning pickBase's winner WHOLESALE, with no allotment check on the
     clone — so a stored blob that is ALREADY over cap comes out of the merge intact and becomes
     the authoritative record. MEASURED: a = 3 core @ $25 ($75) against b = 7 core @ $25 ($175);
     `unionCore(a,b)` correctly gives 6 tickets / $150 and `unionCore(b,a)` returns null, but
     pickBase prefers b on the JSON-length tiebreak, so the merge returned 7 tickets / $175 — $25
     over CFB_PAPER.daily, with no error and no note anywhere.

     No current writer can mint an over-cap entry (`assertCfbCardMoney` throws on
     `if (coreSum > CFB_PAPER.daily + MONEY_EPS) {`, read this turn; `buildLockEntry`'s TWO ALLOCATORS pair refuses a card the
     allocator did not size), so this is a containment gap rather than a live overstake — but the
     merge is the one place a corrupt stored blob is laundered INTO the ledger instead of caught,
     and it is the last thing to touch the record before it is durable.

     KEPT AND MARKED, NOT TRUNCATED. Dropping tickets to fit would delete wagers a device still
     shows — the same silence defect K4 above exists to end. The breach is recomputed on every
     merge and removed once it is gone, so `mergeDay` stays symmetric and idempotent. */
  const coreSum = money(stakeSum(out.core));
  const fSum = money(stakeSum(out.funT ?? []));
  const coreCap = allotmentCap(out, other);
  /* ── THE DAY RECORDS THE CEILING THE MERGE ACTUALLY USED (INSTRUCTION 45, defect F4,
     2026-09-06) ────────────────────────────────────────────────────────────────────────────────
     `allotmentCap` has always treated the day's own `daily` as a claim that may only LOWER the
     desk allotment (`recorded.length ? Math.min(desk, Math.max(...recorded)) : desk`, read this
     turn) — but the merged day went on carrying the REFUSED claim. MEASURED, both orders,
     2026-09-05: two CFB copies stamped `daily: 500`, eight $25 tickets between them; the merge
     bounded the appends at 150 and published `capBreach {"core":{"sum":200,"cap":150}}` beside
     `daily: 500`. Every later reader that trusts the field instead of recomputing the cap —
     `decideTopUp`'s `const owed = daily - Number(entry.allocSum ?? 0);` foremost — reads a $500
     day, and the ledger contradicts the breach note printed next to it.

     ONLY A DAY THAT ALREADY CARRIES A POSITIVE `daily` IS RESTATED, and it is restated to the
     number the cap used, never raised past the claim it made: `coreCap` is `min(desk, max(...))`,
     so it is ≤ every recorded claim's maximum and ≤ the desk. A legitimately LOWER claim (a $50
     day) equals its own cap and is left byte-identical; a day neither copy stamped gains no key,
     because minting an MLB/CFB allocator field onto a day that never had one is the mistake ONLY
     FIELDS THE BASE ALREADY CARRIES ARE MOVED exists to prevent. IDEMPOTENT: re-merging feeds
     `coreCap` back through `min(desk, max(...))`, which is already at a fixed point.

     `fun` HAD THE IDENTICAL TWIN DEFECT, reported here and left unfixed — "Out of scope this
     round; reported, not touched." THE CARRY-FORWARD IS NOW CLOSED (INSTRUCTION 45, CLOSING K6,
     2026-09-06): `fun` is restated below by the same rule, off `funCap` instead of `allotmentCap`.
     MEASURED, BOTH ORDERS, on defect C3's own fixture (a copy claiming `fun: 100` against an
     honest `fun: 25`, one $25 ticket each): {"fun":100,"daily":150,"funSum":25,
     "funDropped":["cfb-2026-09-05-zfun-1"]} — the merge refused the inflated claim (the bucket is
     bounded at CFB_PAPER.fun and the second ticket is named on `funDropped`) and the merged day
     went on publishing `fun: 100` beside the refusal. */
  const recDaily = Number((out as Record<string, unknown>).daily);
  if (Number.isFinite(recDaily) && recDaily > 0 && Math.abs(recDaily - coreCap) > 1e-6) {
    (out as Record<string, unknown>).daily = coreCap;
  }
  const fCap = funCap(out, other);
  /* THE SAME RESTATEMENT ON THE FUN BUCKET (INSTRUCTION 45, CLOSING K6) — only a day that ALREADY
     carries a positive `fun` is restated, and only to the number the cap used, never above the
     largest claim on the day: `funCap` is `min(desk, max(...recorded))`. A legitimately lower
     claim equals its own cap and is left byte-identical; a day neither copy stamped gains no key,
     because minting an allotment field onto a day that never had one is the mistake ONLY FIELDS
     THE BASE ALREADY CARRIES ARE MOVED exists to prevent. IDEMPOTENT: re-merging feeds `fCap` back
     through `min(desk, max(...))`, which is already at a fixed point. */
  const recFun = Number((out as Record<string, unknown>).fun);
  if (Number.isFinite(recFun) && recFun > 0 && Math.abs(recFun - fCap) > 1e-6) {
    (out as Record<string, unknown>).fun = fCap;
  }
  const breach: { core?: { sum: number; cap: number }; fun?: { sum: number; cap: number } } = {};
  if (coreSum > coreCap + 1e-6) breach.core = { sum: coreSum, cap: coreCap };
  if (fSum > fCap + 1e-6) breach.fun = { sum: fSum, cap: fCap };
  if (breach.core || breach.fun) {
    /* THE PROVENANCE CLAIM IS DELETED (INSTRUCTION 45, FINAL2 K6, 2026-09-06). This line used to
       end "A stored copy was already over cap before this merge." — a claim about the INPUTS that
       nothing in this function establishes: no input is measured against any allotment anywhere on
       the merge rail (`validateLedger` reads the date and the placed/actualStake shapes and no
       money field at all), so the sentence was asserting a cause the code never checked. The UI
       reached the same conclusion about its own copy of the wording and pinned it —
       tests/cfb-card-ui.test.ts requires the day note NOT to match /already over cap/. What the
       function does know is the number, the ceiling and its own decision not to truncate, and that
       is all this line now says. */
    out.capBreach = breach;
    console.warn(
      `[ledger-merge] ${out.date}: the merged day is OVER ITS ALLOTMENT and was kept, not truncated — ` +
        `${breach.core ? `core $${breach.core.sum} of $${breach.core.cap}` : ""}${breach.core && breach.fun ? " · " : ""}` +
        `${breach.fun ? `fun $${breach.fun.sum} of $${breach.fun.cap}` : ""}.`,
    );
  } else delete out.capBreach;
  return out;
}

/* One-time data repair — 2026-07-18 doubleheader incident. The engine used to
   collapse both games of a same-day matchup into one key, and the locked 7/18
   card stored game 2's gamePk for PIT@CLE while the card had priced game 1
   (Mangum hit, -260) — so the leg graded against the wrong box score (he went
   0-for-5 in game 1, 1-for-5 in game 2). Any copy still carrying the wrong pk
   is re-pointed at game 1 and its grading cleared so the grader re-runs from
   the right game. The match is exact (date + key + wrong pk): a repaired,
   re-graded copy no longer matches, so its corrected grades outrank every
   stale copy in pickBase and the honest result wins all future merges. */
const DH_REPAIR = {
  date: "2026-07-18",
  gkey: "pittsburghpirates@clevelandguardians",
  wrongPk: 824412, // game 2 (last-write-wins under the old collapsed key)
  pk: 824414, // game 1 — the game the card actually priced
  start: "2026-07-18T17:10:00Z",
};
function repairEntry(e: SyncEntry): SyncEntry {
  type GameRef = { pk?: number | null; start?: string | null };
  const games = e.games as Record<string, GameRef> | undefined;
  if (e.date !== DH_REPAIR.date || games?.[DH_REPAIR.gkey]?.pk !== DH_REPAIR.wrongPk) return e;
  const out: SyncEntry = JSON.parse(JSON.stringify(e));
  const g = (out.games as Record<string, GameRef>)[DH_REPAIR.gkey];
  g.pk = DH_REPAIR.pk;
  g.start = DH_REPAIR.start;
  out.grading = null;
  out.gradedAt = null;
  return out;
}

/** Union by date, richer day wins, accruals overlaid. Symmetric + idempotent. */
export function mergeLedgers(a: SyncEntry[], b: SyncEntry[]): SyncEntry[] {
  const byDate = new Map<string, SyncEntry>();
  for (const e of a) if (e.locked) byDate.set(e.date, repairEntry(e));
  for (const e of b) {
    if (!e.locked) continue;
    const r = repairEntry(e);
    const cur = byDate.get(r.date);
    byDate.set(r.date, cur ? mergeDay(cur, r) : r);
  }
  return [...byDate.values()].sort((p, q) => (p.date < q.date ? -1 : 1));
}
