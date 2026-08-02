import { describe, expect, it } from "vitest";
import { mergeLedgers, validateLedger, type SyncEntry } from "@/lib/ledger-merge";

/**
 * THE `placed` FIELD (2026-08-02, owner's item 2 — the prerequisite that rides in front of
 * lock-at-generation).
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────────────
 * The system locks a card every day and NEVER places. `placed` is the answer to "did Josh
 * actually put this on?", and `actualStake` is what he actually risked, which may differ from
 * the sized stake. Three states, and the third is the whole point:
 *     placed === true    → placed, actualStake is the real money
 *     placed === false   → deliberately NOT placed. A DECISION, recorded.
 *     placed == null     → UNANSWERED. Not the same as "no".
 * Every downstream P&L number is denominated in placed tickets. Reading a null as a false
 * silently converts "we don't know" into "he passed", which is the population error this
 * project keeps finding — so null is preserved and COUNTED, never defaulted.
 *
 * ── THE MERGE-DROP HAZARD, OBSERVED RED BEFORE THE FIX ───────────────────────────────
 * `mergeDay` deep-copies the pickBase WINNER and then overlays only: grading, clv, per-ticket
 * `confirmed`, funT extras, games. **Any OTHER per-ticket field on the loser is dropped.**
 * So: phone marks `placed:true, actualStake:25`; laptop holds the same day with richer grading
 * and no placement; laptop wins pickBase; **the placement is destroyed by a sync.** Real money
 * answers would be lost to a background merge with no error anywhere.
 *
 * OBSERVED RED 2026-08-02: this file's merge cases fail against `ledger-merge.ts` as it stood,
 * `placed` and `actualStake` both arriving `undefined` on the merged ticket. The fix generalises
 * the existing `confirmed` fill to an ACCRUAL_FIELDS list — fill-only, never overwrite — so the
 * property being asserted is the one `confirmed` already had.
 *
 * ── WHY FILL-ONLY IS THE RIGHT RULE FOR A BOOLEAN ────────────────────────────────────
 * `placed:false` is an ANSWER and must never be overwritten by a later null. `!= null` treats
 * false as present, so a false fills a null and nothing overwrites a false. Two devices that
 * disagree true-vs-false is a real conflict the merge cannot resolve; it is out of scope here
 * and named rather than papered over — pickBase order decides it, and that is recorded.
 */

const T = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });
const E = (over: Partial<SyncEntry> = {}): SyncEntry =>
  ({ date: "2026-08-02", locked: true, core: [T("t1"), T("t2")], ...over }) as SyncEntry;

describe("the placed field survives a sync", () => {
  it("PLANT (invalid-by-value): the loser's placement is dropped by a base-only merge", () => {
    /* the pre-fix behaviour, reproduced with a local copy of the old mergeDay body so the
       regression is asserted rather than remembered. If someone reverts the ACCRUAL_FIELDS
       fill, the case below goes red and this one stays green — that pairing is the signal. */
    const oldMergeDay = (base: SyncEntry, other: SyncEntry) => {
      const out: SyncEntry = JSON.parse(JSON.stringify(base));
      for (const t of out.core) {
        if (t.confirmed != null || !t.id) continue;
        const m = other.core.find((o) => o.id === t.id);
        if (m && m.confirmed != null) t.confirmed = m.confirmed;
      }
      return out;
    };
    const rich = E({ grading: { done: true } });
    const placed = E({ core: [T("t1", { placed: true, actualStake: 25 }), T("t2")] });
    const merged = oldMergeDay(rich, placed);
    expect(merged.core[0].placed, "the old merge would have KEPT placed — the hazard is not real").toBeUndefined();
  });

  it("a placement on the pickBase LOSER survives the merge", () => {
    // laptop: richer grading, wins pickBase, knows nothing about placement
    const laptop = E({ grading: { done: true, tickets: { t1: { result: "won" } } } });
    // phone: the placement answers
    const phone = E({ core: [T("t1", { placed: true, actualStake: 25 }), T("t2", { placed: false })] });
    const [m] = mergeLedgers([laptop], [phone]);
    expect(m.core[0].placed, "placed:true was DROPPED by the merge — real-money answers are being lost").toBe(true);
    expect(m.core[0].actualStake, "actualStake was dropped").toBe(25);
    expect(m.core[1].placed, "placed:FALSE was dropped — a deliberate no-play is not a null").toBe(false);
  });

  it("merge stays symmetric and idempotent with the new fields", () => {
    const a = E({ grading: { done: true }, core: [T("t1", { placed: true, actualStake: 25 }), T("t2")] });
    const b = E({ core: [T("t1"), T("t2", { placed: false })] });
    const ab = JSON.stringify(mergeLedgers([a], [b]));
    const ba = JSON.stringify(mergeLedgers([b], [a]));
    expect(ab, "merge(a,b) !== merge(b,a) — devices will not converge").toBe(ba);
    expect(JSON.stringify(mergeLedgers(mergeLedgers([a], [b]), [b])), "re-merging changed the result").toBe(ab);
  });

  it("fill-only: an existing answer is never overwritten, in either direction", () => {
    const yes = E({ grading: { done: true }, core: [T("t1", { placed: true, actualStake: 25 })] });
    const no = E({ core: [T("t1", { placed: false, actualStake: 0 })] });
    const [m] = mergeLedgers([yes], [no]);
    expect(m.core[0].placed, "the base's own answer was overwritten by the other side").toBe(true);
    expect(m.core[0].actualStake).toBe(25);
    // and a null base takes the other side's answer
    const [m2] = mergeLedgers([E({ grading: { done: true }, core: [T("t1", { placed: null })] })], [no]);
    expect(m2.core[0].placed, "a null base did not take the other side's recorded answer").toBe(false);
  });

  it("null is UNANSWERED and is preserved, not defaulted to false", () => {
    const [m] = mergeLedgers([E()], [E()]);
    expect(m.core[0].placed ?? null, "an unanswered ticket was defaulted — 'unknown' became 'he passed'").toBeNull();
  });

  it("validateLedger accepts the new fields and still rejects bad shapes", () => {
    const ok = validateLedger([E({ core: [T("t1", { placed: true, actualStake: 25 }), T("t2", { placed: null })] })]);
    expect(ok.ok, `a valid placed/actualStake entry was rejected: ${ok.ok ? "" : ok.error}`).toBe(true);
    expect(validateLedger([{ date: "2026-08-02", locked: false, core: [] }]).ok).toBe(false);
    expect(validateLedger("nope").ok).toBe(false);
  });

  it("the report's placement census never pools not-placed with unanswered", async () => {
    const { placementCensus } = await import("../tools/ledger-report.mjs");
    const c = placementCensus([
      { date: "2026-08-02", core: [T("a", { placed: true, stake: 20, actualStake: 25 }), T("b", { placed: false }), T("c")] },
      { date: "2026-08-03", core: [T("d", { placed: null })], funT: [T("e", { placed: true, stake: 10, actualStake: 10 })] },
    ]);
    expect(c).toMatchObject({ tickets: 5, placed: 2, notPlaced: 1, unanswered: 2 });
    expect(c.placed + c.notPlaced + c.unanswered, "the three states do not partition the tickets").toBe(c.tickets);
    expect(c.stakeMismatch.length, "a placed ticket whose real money differed from the sizing was not reported").toBe(1);
    // VACUITY: an empty population must be visible as empty, not as a clean zero
    expect(placementCensus([])).toMatchObject({ tickets: 0, placed: 0, unanswered: 0 });
  });

  it("funT tickets carry placement too — supplemental locks are real money as well", () => {
    const base = E({ grading: { done: true }, funT: [T("f1")] });
    const other = E({ funT: [T("f1", { placed: true, actualStake: 10 })] });
    const [m] = mergeLedgers([base], [other]);
    expect((m.funT ?? [])[0]?.placed, "funT placement dropped").toBe(true);
    expect((m.funT ?? [])[0]?.actualStake).toBe(10);
  });
});
