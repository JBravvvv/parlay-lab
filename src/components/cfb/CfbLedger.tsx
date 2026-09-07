"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { CfbTicketCard, cfbGradingOf, cfbTicketsOf, type CfbGradingView, type CfbLegVerdict } from "@/components/cfb/CfbTicketCard";
import { CfbSyncChip } from "@/components/cfb/CfbSyncChip";
import { Reveal } from "@/components/motion/Reveal";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/states";
import { loadCfbFinals } from "@/lib/cfb/client";
import { ptDateOf } from "@/lib/cfb/dates";
import { CFB_BANK_BASE } from "@/lib/cfb/rules";
import { CFB_SYNC_EVENT, gradeCfb, readCfbLedger, useCfbLedger } from "@/lib/cfb/store";
import { syncCfbNow } from "@/lib/cfb/sync";
import type { CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import { fmtMoneyExact } from "@/lib/format";
import { railLabel } from "@/lib/games";
import { roiPct } from "@/lib/useLedger";

/**
 * CFB LEDGER (INSTRUCTION 38, 2026-09-05): the College Football record — its own entries,
 * its own bank, graded off ESPN finals. On view every locked day on or before today whose
 * grading is not done is graded (finals fetch → `grade`), re-armed whenever the sync loop
 * lands a change (CFB_SYNC_EVENT). CORE / FUN scope, the five stat tiles, an equity
 * sparkline, one collapsible card per day with the tickets and every leg's verdict, the
 * sync chip, and the page-header actions (`CfbLedgerActions`: grade / export / copy /
 * import / wipe) exported separately so the page can hand them to its PageHeader.
 */

type Scope = "core" | "fun";

const SCOPES = [
  { key: "core", label: "Core" },
  { key: "fun", label: "Fun" },
] as const;

const RESULT_TONE: Record<string, string> = {
  won: "text-pos",
  lost: "text-neg",
  push: "text-muted",
  pending: "text-live",
  ungradable: "text-gold",
};

const todayPT = () => ptDateOf(new Date().toISOString());

/* ---------- what the merge kept over cap, and what it deleted ---------- */

/**
 * THE MERGE'S MARKERS, ON SCREEN (INSTRUCTION 45, defect D1, 2026-09-06).
 *
 * WHAT WENT WRONG. `mergeDay` (src/lib/ledger-merge.ts) deliberately KEEPS an over-cap day whole
 * rather than truncating it — deleting tickets a device still shows is the silence defect the
 * drop channel exists to end — and records the fact as `capBreach { core?: { sum, cap },
 * fun?: { sum, cap } }`. When its fun allotment cannot seat a ticket it names the refused ids on
 * `funDropped` and files the money beside them on `funDroppedPL` (`{ result, payout, stake }` per
 * id).
 *
 * A CITATION IS A CLAIM, AND THE ONE THAT STOOD HERE WAS FALSE (INSTRUCTION 45, defect B3,
 * 2026-09-06). This paragraph used to say the device rail carried the markers because
 * "src/lib/cfb/store.ts writes `kept.funDropped` and `kept.capBreach`". GREPPED AGAIN TODAY:
 * store.ts contains NO such assignment, and its own docblock says so in as many words — "no
 * `kept.capBreach = …` / `kept.funDropped = …` assignment". What is actually true is stronger and
 * needs no list: `upsertCfbEntries` builds the kept day off the merged one — read this turn,
 * `const kept: CfbLedgerEntry = { ...syncDay, grading };` — so EVERY field of the merged day
 * — every marker channel named here, including ones added after this comment was written —
 * reaches the phone by DEFAULT, and only the eight lock-instant keys are taken back off `cur`.
 * There is no per-field carry to fall behind.
 *
 * Every one of those markers was rendered NOWHERE. Now that the device rail delegates its core
 * bucket to the shared union, the phone no longer truncates an over-cap day to $150 — it DISPLAYS
 * the whole set. So the card could show $180 of core money on a $150 desk with nothing saying the
 * day was over its allotment, and a graded fun ticket the cap deleted left no trace on any screen
 * Josh looks at.
 *
 * WHY A READER AND NOT A RENDER-TIME LOOKUP. A DECLARATION IS NOT A CHECK ON DATA OFF THE WIRE
 * (INSTRUCTION 45, defect U3, 2026-09-06 — this paragraph's own citation had gone stale). It used
 * to say the marker fields are untyped because `CfbLedgerEntry` inherits an index signature from
 * `SyncEntry`. THAT IS NO LONGER TRUE: `CfbLedgerEntry` (src/lib/cfb/types.ts) declares all seven
 * markers and wraps its base in the `NoIndex` mapped type, so the base's index signature is gone
 * from the CFB entry and a MISSPELLED marker name is now a compile error on both ends (pinned in
 * tests/cfb-card-ui.test.ts, "the type-level closure"). What a declaration cannot do is check a
 * VALUE: every day this reader sees arrives from localStorage, an import paste or the sync route
 * as parsed JSON that was merely asserted to be an entry, so a `capBreach.cap` of `"one hundred
 * and eighty"` still reaches here at runtime. That is why the reading stays in ONE place, validates
 * every number before it becomes a figure on screen, and DERIVES the excess from the sum and the
 * cap it renders beside — so the note can never disagree with the two figures it is explaining.
 *
 * IT RETURNS NULL FOR A DAY WITH NO MARKERS, and that is load-bearing: every marker element in
 * `DayCard` here and in the Builder's locked panel is guarded on it, so a day carrying no markers
 * renders exactly the chrome it rendered before this shipped — no wrapper, no empty container, no
 * layout shift. tests/cfb-card-ui.test.ts pins that null AND the shared chrome byte for byte.
 *
 * ONLY A REAL BREACH COUNTS. A day sitting exactly ON its allotment is not over it, a malformed
 * or empty marker mints no figure, and `dropPl` stays null until at least one dropped ticket
 * carries a settled receipt — an unsettled drop is a wager withdrawn, not a loss booked.
 *
 * AND "SETTLED" MEANS THE KERNEL'S THREE VERDICTS, NOT "HAS A RESULT FIELD" (INSTRUCTION 45,
 * defect B1, 2026-09-06 — a REGRESSION of this file's own first round). The kernel widened the
 * receipt the same round this reader shipped: `receiptOf` in src/lib/ledger-merge.ts now writes
 * one for EVERY refused ticket rather than only for one already carrying a verdict, and an
 * ungraded drop records `{ result: "pending", payout: 0, stake: 25 }`. This loop's gate skipped a
 * receipt only when its `result` or its `stake` was null — "pending" is neither, so it fell
 * through and scored payout minus stake. MEASURED on the two overlapping 2026-09-05 fun
 * top-up pokes, one of which the cap seats and the other it drops: `dropPl: -25`, the note
 * reading "Dropped by the cap · 1 · -$25.00 P/L" over a row reading "$25 fun · pending · pays
 * $0.00". Josh read a $25 loss and a $0 payout on a wager whose game may not have kicked off.
 * The gate is now the kernel's own settlement set — the same three words `RESOLVED` holds in
 * src/lib/ledger-merge.ts (`const RESOLVED = new Set(["won", "lost", "push"]);`, read this turn)
 * — and `cfbDropLine` refuses to print a payout for anything outside it.
 *
 * BOTH BUCKETS, NOT ONLY FUN (INSTRUCTION 45, defect B2, 2026-09-06). `mergeDay` records the core
 * side on exactly the same channels — `coreDropped` / `coreDroppedPL` for a core wager the
 * allotment refused (written by `unionCore`'s append pass through the same `receiptOf`), and
 * `stakeConflict` `{ kept, refused }` for a shared id whose two copies named different stakes and
 * the merge would not seat the larger — under EITHER of that function's two refusal rules, which
 * this sentence used to describe as only the receipt one (see defect U1 at `cfbDisclosureOf`).
 * Both reach the phone by the default above. This reader saw only the fun channel, so a refused
 * core wager and a refused stake raise were invisible on the one surface Josh reads — which is the
 * failure the marker work existed to end. Core drops now join the same sorted list under their own
 * `bucket`, core first, and the refused raises come back as `cuts`.
 *
 * AND THE THIRD REFUSAL KIND: THE RIVAL CARD (INSTRUCTION 45, defect B2, 2026-09-06). `unionCore`
 * also names, on `betConflict`, every shared core id whose two copies fail `sameBet` — two
 * DIFFERENT locks sharing an id namespace — and on that finding it refuses to mix the two cards.
 * `mergeDay` carries the ids onto the merged day and `console.warn`s. Nothing read them, so a day
 * whose ONLY marker was a refused rival card returned null from here and disclosed nothing at all.
 * It is read now, on `rivals`, gated on the seated ticket for the reason spelled out at the reading
 * site in `cfbDayMarks` below.
 *
 * WHAT THAT REFUSAL COSTS IS DISCLOSED THROUGH THE CHANNELS ALREADY READ HERE (INSTRUCTION 45,
 * defect U2, 2026-09-06). A rival-card refusal used to discard the other copy's unseen core
 * tickets with no name and no receipt; when the kernel files receipts for them it files them on
 * `coreDropped` / `coreDroppedPL`, the same pair the cap's refusals use and the same pair `dropsIn`
 * below already unions. So they surface as rows in the existing list WITHOUT a channel being added
 * here — and because nothing on the wire tells a cap refusal from a rival one, the list's heading
 * says only what is true of both (see `cfbDisclosureOf`).
 *
 * A CUT IS MEASURED AGAINST THE SEATED TICKET, never against the marker's `kept`. Same lesson as
 * the breach sum: `stakeConflict.kept` is what the LAST merge seated, and the core ticket on the
 * day is the stake as it stands. So a cut is claimed only while the id is still seated for LESS
 * than the refused figure, and the amount not staked is derived from the seated stake — a later
 * merge that lands the raise leaves nothing to disclose, exactly as `mergeDay` drops the marker
 * once the id is no longer seated at the stake it names.
 *
 * AND THE SUM IS THE DAY'S TICKETS, NEVER THE MARKER'S STORED `sum`. This is the whole lesson of
 * the round the marker comes from: `mergeDay` deep-clones pickBase's winner and TRUSTS it, and
 * every defect since has been a stored figure believed downstream of that clone. `capBreach.sum`
 * is a figure the LAST merge measured; the tickets rendered one line above it are the day as it
 * stands now. Rendering the stored one would put two numbers about the same money side by side
 * with no rule that they agree. So only the CAP — the allotment the merge weighed the day
 * against, which no ticket carries — is taken from the marker; the sum and therefore the excess
 * are re-derived from `core` / `funT` here, and a day whose tickets no longer exceed that cap
 * claims nothing, exactly as `mergeDay` drops the marker once the breach is gone.
 */
export type CfbCapBreach = { bucket: "core" | "fun"; sum: number; cap: number; over: number };
export type CfbDropReceipt = { id: string; bucket: "core" | "fun"; result: string | null; payout: number | null; stake: number | null };
/** a stake raise the merge refused: `kept` is the stake SEATED on the day, `cut` the money not staked */
export type CfbStakeCut = { id: string; kept: number; refused: number; cut: number };
export type CfbDayMarks = {
  breaches: CfbCapBreach[];
  drops: CfbDropReceipt[];
  dropPl: number | null;
  cuts: CfbStakeCut[];
  /** ids whose two copies name DIFFERENT bets — the seated ticket stands, the rival card was refused */
  rivals: string[];
};

/** the kernel's settlement set, verbatim — src/lib/ledger-merge.ts `RESOLVED`; `pending` and
    `ungradable` are the ABSENCE of a settlement and must never be scored as money. */
const SETTLED = new Set(["won", "lost", "push"]);

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const cents = (n: number): number => Math.round(n * 100) / 100;
const staked = (tix: CfbTicket[] | undefined): number => cents((tix ?? []).reduce((s, t) => s + (finite(t.stake) ?? 0), 0));
const objOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * One bucket's refusals. The NAMES and the RECEIPTS are unioned, not intersected: the `*Dropped`
 * list can name an id whose receipt no side ever wrote, and a receipt without its name is still
 * money that left the day. Sorted, like the merge sorts both channels, so the list is stable.
 */
function dropsIn(e: CfbLedgerEntry, bucket: "core" | "fun"): CfbDropReceipt[] {
  const receipts = objOf((e as Record<string, unknown>)[bucket === "core" ? "coreDroppedPL" : "funDroppedPL"]);
  const listed = (e as Record<string, unknown>)[bucket === "core" ? "coreDropped" : "funDropped"];
  const named = Array.isArray(listed) ? (listed as unknown[]).map(String) : [];
  return [...new Set([...named, ...Object.keys(receipts)])].sort().map((id) => {
    const rec = receipts[id] && typeof receipts[id] === "object" && !Array.isArray(receipts[id]) ? (receipts[id] as Record<string, unknown>) : null;
    return {
      id,
      bucket,
      result: rec && typeof rec.result === "string" ? rec.result : null,
      payout: rec ? finite(rec.payout) : null,
      stake: rec ? finite(rec.stake) : null,
    };
  });
}

export function cfbDayMarks(e: CfbLedgerEntry): CfbDayMarks | null {
  const breaches: CfbCapBreach[] = [];
  const cb = (e as { capBreach?: unknown }).capBreach;
  if (cb && typeof cb === "object" && !Array.isArray(cb)) {
    for (const bucket of ["core", "fun"] as const) {
      const b = (cb as Record<string, unknown>)[bucket];
      if (!b || typeof b !== "object") continue;
      const cap = finite((b as { cap?: unknown }).cap);
      const sum = staked(bucket === "core" ? e.core : e.funT);
      if (cap == null || sum <= cap) continue;
      breaches.push({ bucket, sum, cap, over: cents(sum - cap) });
    }
  }
  /* core first: it is the $150 that counts in net P/L, and the fun list is what shipped before */
  const drops: CfbDropReceipt[] = [...dropsIn(e, "core"), ...dropsIn(e, "fun")];
  let settled = false;
  let pl = 0;
  for (const d of drops) {
    if (d.stake == null || !SETTLED.has(d.result ?? "")) continue;
    pl += (d.payout ?? 0) - d.stake;
    settled = true;
  }
  /* the refused raises, measured against the stake the day ACTUALLY carries (see A CUT IS
     MEASURED AGAINST THE SEATED TICKET above) — an id no longer seated below the refused figure
     has nothing left to disclose. */
  const cuts: CfbStakeCut[] = [];
  const sc = (e as { stakeConflict?: unknown }).stakeConflict;
  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const seated = new Map((e.core ?? []).filter((t) => t.id).map((t) => [String(t.id), finite(t.stake) ?? 0]));
    for (const id of Object.keys(sc as Record<string, unknown>).sort()) {
      const c = (sc as Record<string, unknown>)[id];
      if (!c || typeof c !== "object") continue;
      const refused = finite((c as { refused?: unknown }).refused);
      const kept = seated.get(id);
      if (refused == null || kept == null || refused <= kept) continue;
      cuts.push({ id, kept, refused, cut: cents(refused - kept) });
    }
  }
  /* THE REFUSED RIVAL CARD (INSTRUCTION 45, defect B2, 2026-09-06). `unionCore` names on
     `betConflict` every shared core id whose two copies fail `sameBet` — two DIFFERENT locks
     sharing an id namespace — and on that finding refuses to mix the two cards, so this day can be
     MISSING tickets the other copy holds. `mergeDay` carries the ids onto the merged day while they
     are still seated (`const stillBetConflict = [...betConflict].filter((id) => seatedCore.has(id)).sort();`,
     grepped in src/lib/ledger-merge.ts this turn) and warns on the console — and NOTHING read them,
     so a day whose only marker was a refused rival card returned null here and said nothing on any
     screen. What that refusal COST is disclosed separately, through `dropsIn` above, whenever the
     kernel files receipts for the tickets it discarded (defect U2).

     GATED ON THE SEATED TICKET, exactly as the cuts are and exactly as the kernel's own filter
     above is: the sentence claims "this device's ticket stands", so it is claimed only while that
     ticket is actually on the day. A marker naming an id the card no longer carries would
     contradict the card beside it. */
  const rivals: string[] = [];
  const bc = (e as Record<string, unknown>).betConflict;
  if (Array.isArray(bc)) {
    const seatedIds = new Set((e.core ?? []).filter((t) => t.id).map((t) => String(t.id)));
    for (const id of [...new Set((bc as unknown[]).map(String))].sort()) if (seatedIds.has(id)) rivals.push(id);
  }
  if (!breaches.length && !drops.length && !cuts.length && !rivals.length) return null;
  return { breaches, drops, dropPl: settled ? cents(pl) : null, cuts, rivals };
}

/**
 * ONE ROW OF THE DISCLOSURE, AS A PURE STRING (INSTRUCTION 45, defects B1 and B2, 2026-09-06).
 * The row used to be assembled inline in the JSX as three ternaries, which is why B1 could put
 * "· pending · pays $0.00" on screen without any test being able to see it: the note's markup is
 * only reachable from a source regex, and a source regex passes a behaviourally-identical
 * rewording. As a function the sentence is pinned by VALUE in tests/cfb-card-ui.test.ts.
 *
 * A payout is printed ONLY for a settlement. "pays $0.00" beside "pending" is the specific lie
 * B1 shipped — the wager may not have kicked off — so an unsettled drop says what is actually
 * true: the money left the day and nobody has graded it. The bucket rides in the stake clause
 * ("$25 core" / "$25 fun") because both buckets now share this list.
 */
export function cfbDropLine(d: CfbDropReceipt): string {
  const stake = d.stake != null ? `$${d.stake} ${d.bucket}` : "stake unrecorded";
  if (d.result == null) return `${stake} · no verdict recorded`;
  if (!SETTLED.has(d.result)) return `${stake} · ${d.result} — not graded yet, no P/L booked`;
  return `${stake} · ${d.result}${d.payout != null ? ` · pays $${d.payout.toFixed(2)}` : ""}`;
}

/** The refused-raise sentence, same reasoning as `cfbDropLine`: pinned by value, not by regex. */
export function cfbCutLine(c: CfbStakeCut): string {
  return `$${c.kept} stands · a $${c.refused} raise was refused · $${c.cut} not staked`;
}

/**
 * The refused-rival-card sentence (INSTRUCTION 45, defect B2, 2026-09-06). Same shape and same
 * reasoning as the two above. It names the id because that is the only thing the kernel records —
 * `betConflict` is a `string[]`, the rival copy's ticket is never carried onto the merged day —
 * and it says whose ticket won, because on this channel the base's ticket is what stands.
 */
export function cfbRivalLine(id: string): string {
  return `${id} · another copy names a DIFFERENT bet — this device's ticket stands`;
}

/**
 * The breach chip that rides in the DayCard summary's money span, as a string (INSTRUCTION 45,
 * defect B1, 2026-09-06). It used to be a template literal inline in the JSX, reachable only from
 * a source regex; as a function the figures Josh reads beside the day's stake total are pinned by
 * VALUE. Every number in it comes off a `CfbCapBreach`, whose `sum` and `over` `cfbDayMarks`
 * derives from the day's own tickets.
 */
export function cfbBreachChip(breach: CfbCapBreach): string {
  return `$${breach.sum} of $${breach.cap} · $${breach.over} over`;
}

/* ---------- the disclosure: a described structure, decided before anything is markup ---------- */

/** one gold sentence: a bold claim carrying the figures, and the muted rule that explains it */
export type CfbMarkLine = { key: string; claim: string; note: string };
/** one refused wager: its id, its verdict (null when no receipt), the tone class and the sentence */
export type CfbDropRow = { id: string; result: string | null; tone: string; text: string };
/**
 * the collapsible refused-wager list: the heading, how many were refused, what SETTLED among them,
 * and the rows. `label` carries the heading as a VALUE for the reason spelled out at
 * `cfbDisclosureOf` — the heading is a claim about WHY the money left the day, and it used to be a
 * template literal in the JSX that no test could read.
 */
export type CfbDropDisclosure = { label: string; count: number; settledPl: string | null; rows: CfbDropRow[] };
export type CfbDisclosure = { lines: CfbMarkLine[]; drops: CfbDropDisclosure | null };

/**
 * WHAT A DAY DISCLOSES, DECIDED AS A VALUE (INSTRUCTION 45, defect B1, 2026-09-06).
 *
 * WHAT WENT WRONG. Every guard on the marker note in tests/cfb-card-ui.test.ts was a regex over
 * comment-stripped SOURCE, because no test in this suite renders React. A mutation pass measured
 * what that buys: the entire body of `CfbDayMarksNote` — breaches, cuts, drop rows — can be made
 * unreachable and the whole suite stays green. A source regex also passes any behaviourally
 * identical rewording, so it pins the spelling of the render rather than the render.
 *
 * WHY THIS SHAPE. The DECISION — which markers a day discloses, in what order, what each line
 * claims, whether the drop list exists, what its summary figure is and what each row says — is all
 * here, in one pure function over a `CfbDayMarks`, and `CfbDayMarksNote` below renders this
 * structure and NOTHING ELSE: no ternary, no lookup, no string built at the JSX. That is what
 * makes the user-visible deliverable checkable by value instead of by spelling, without adding a
 * React test renderer to the suite. The remaining source pins are kept for the part a value cannot
 * reach — that the JSX consumes this structure, that both surfaces render the note, that every
 * render site is guarded, and that an unmarked day's chrome is untouched byte for byte.
 *
 * `settledPl` IS A STRING OR ABSENT, NEVER A ZERO (defect B1's money half). `marks.dropPl` is null
 * when no dropped ticket carries one of the kernel's three settlement verdicts, and this carries
 * that null straight through, so the summary's figure does not render at all rather than reading
 * "$0.00" over wagers whose games may not have kicked off.
 *
 * THE ORDER IS THE ORDER ON SCREEN, and it is the order of severity of the money: the breaches
 * first (the day is over its allotment), then the raises the merge cut, then the rival cards it
 * refused, then the collapsible list of what left the day entirely.
 *
 * ------------------------------------------------------------------------------------------
 * THE REFUSED-RAISE NOTE ASSERTED A REASON THAT IS NOT THE REASON (INSTRUCTION 45, defect U1,
 * 2026-09-06 — a REGRESSION carried in by last round's rival branch).
 *
 * WHAT WENT WRONG. The note read "Two copies of {id} disagreed on stake with no top-up receipt —
 * the smaller stake stands." `unionCore` (src/lib/ledger-merge.ts) writes the `conflict` record
 * that becomes this day's `stakeConflict` under TWO RULES, spread across the arms of one chain,
 * both read this turn against the kernel AS IT NOW STANDS and named by SYMBOL rather than quoted
 * line for line — a quoted expression goes stale the moment the kernel is edited, and this file
 * shipped exactly such a stale quote (INSTRUCTION 45, the false-citation pattern):
 *     · the RECEIPTLESS rule — the chain's last `else`, reached when no `topUp` receipt accounts
 *       for the difference and no id on the day is disputed. It seats `lo` and records the SMALLER
 *       stake as `kept`, the larger as `refused`. This one, and only this one, is about a missing
 *       receipt;
 *     · the KEPT-MINE rule — written from more than one arm of the same chain, it keeps `mine`,
 *       THIS card's own stake, and names the other copy's as `refused`. It is reached whenever the
 *       two copies are RIVAL CARDS, receipt or no receipt (including when this card already seats
 *       the LARGER of the two, so `refused < kept` is reachable), and — this is the case the old
 *       note lied about — when a receipt was read, accepted as valid, and OVERRULED because seating
 *       the raise would carry the projected core past `cap`.
 * The card printed "no top-up receipt" over every one of these. "The smaller stake stands" is the
 * receiptless rule's line and not the other's: `mine` is the base's stake, which is the larger of
 * the two whenever the base holds the larger.
 *
 * (The kernel widened the allotment half of that second rule DURING this round — the raise used
 * to be weighed against `cap` only on a rival pair and is now weighed on every pair. The note
 * below named the two REASONS rather than the two rules, so it stayed true across that change,
 * which is the whole argument for wording it as a disjunction.)
 *
 * WHY THE FIX IS SHAPED THIS WAY, AND WHY IT IS NOT TWO SENTENCES. There is no discriminator on
 * the wire. Both rules write the identical `{ kept, refused }` shape onto the identical
 * channel, and `mergeDay` unions that channel across both input days, so a marker on a day says
 * nothing about which rule minted it. The receiptless rule does guarantee `kept < refused`, but
 * the kept-mine rule can produce that too — and the one shape it alone can produce,
 * `refused < kept`, is already filtered out of `cfbDayMarks.cuts` as a marker the day has outgrown. So the note names
 * the two reasons a refusal can have, as a disjunction rather than as a verdict on which one
 * applied: no receipt accounted for the raise, or seating it would have carried the day past its
 * allotment. Every refusal the code above can produce falls under one of those, and neither is
 * asserted of a particular marker. The figures stay where they were, in `cfbCutLine`'s claim,
 * which is derived from the SEATED ticket.
 *
 * AND THE LIST'S HEADING NO LONGER BLAMES THE CAP (INSTRUCTION 45, defect U2, same day). It read
 * "Dropped by the cap · N", and this round made that provably false. `unionCore` now files a
 * receipt for the core tickets it discards because the two copies are RIVAL CARDS — read this
 * turn: on a non-empty `betConflict` it walks its `unseen` list, pushing each id onto `dropped`
 * and filing `receiptOf(...)` beside it on `droppedPL`, the same two names its allotment refusal
 * writes. (Named as symbols rather than quoted as a line: the previous revision of this paragraph
 * quoted those three statements collapsed onto one line, a "quote" that matched nothing in the
 * file — INSTRUCTION 45, the false-citation pattern, 2026-09-06.) Both channels reach the day as
 * the SAME two the cap's refusals use (`coreDropped` / `coreDroppedPL`,
 * which `dropsIn` above already unions). No cap is consulted on that path. Nothing on the wire
 * tells the two apart, so `label` names what is true of every receipt that can reach this list,
 * whichever gate refused it. It is a decided VALUE rather than a template literal in the JSX for
 * exactly the reason the rows are: a string built at the markup is unreachable from a behavioural
 * pin, and this heading is the sentence that explains the money under it.
 *
 * ------------------------------------------------------------------------------------------
 * AND THE BREACH NOTE NO LONGER NAMES A CAUSE THE MERGE CANNOT GUARANTEE (INSTRUCTION 45, defect
 * U4, 2026-09-06). It read "A copy of this day was already over cap before the merge — it is kept
 * whole and marked, not truncated." The second half is a policy the kernel really does obey; the
 * FIRST half is a claim about how the day GOT over its allotment, and the merge does not only
 * inherit breaches, it can CREATE one. `mergeDay` stamps `capBreach` from the MERGED day's own
 * stake sums against `allotmentCap` / `funCap`, so any path that seats more money than either input
 * carried lands here too, and the reader cannot tell from the wire which path a given breach came
 * down.
 *
 * MEASURED TWICE THIS ROUND, through `mergeLedgers`, BOTH ORDERS, on 2026-09-05: copy A = six
 * agreed $25 core tickets ($150, exactly the desk); copy B = the same card with `core-2` topped up
 * to $50 carrying `topUp: 25` and `core-6` absent ($150, also exactly the desk). NEITHER copy is
 * over cap.
 *   · against the kernel EARLIER TODAY, which weighed a receipted raise against `cap` only on a
 *     rival pair: stakes [25,50,25,25,25,25], sum 175, `capBreach {"core":{"sum":175,"cap":150}}`
 *     — a breach the merge minted, under a note telling Josh a copy had ARRIVED over cap;
 *   · against the kernel AS IT NOW STANDS, after it hoisted that allotment test onto every pair:
 *     stakes [25,25,25,25,25,25], sum 150, no `capBreach`, and the refusal named instead as
 *     `stakeConflict {"cfb-2026-09-05-core-2":{"kept":25,"refused":50}}`.
 * The answer to "how did this day get over cap" therefore changed underneath this note inside a
 * single round, and closing one creation path is not a proof that none is left (the fun bucket and
 * every future merge rule would each need that proof). So the note asserts no cause at all. What IS
 * true of every breach the kernel can produce, and the thing Josh needs when he sees $175 on a $150
 * desk, is what the merge DID about it: it kept every wager rather than deleting some to fit. The
 * figures are unchanged and still derived from the day's own tickets.
 */
export function cfbDisclosureOf(marks: CfbDayMarks): CfbDisclosure {
  const lines: CfbMarkLine[] = [
    ...marks.breaches.map((b) => ({
      key: `breach:${b.bucket}`,
      claim: `${b.bucket === "core" ? "Core" : "Fun"} money is $${b.sum} against this day's $${b.cap} allotment — $${b.over} over.`,
      note: "The day is kept whole and marked, not truncated — no wager a device still shows is deleted to make it fit.",
    })),
    ...marks.cuts.map((c) => ({
      key: `cut:${c.id}`,
      claim: cfbCutLine(c),
      note: `Two copies of ${c.id} named different stakes and the merge would not seat the larger — either no top-up receipt accounted for it, or seating it would have carried this day past its allotment.`,
    })),
    ...marks.rivals.map((id) => ({
      key: `bet:${id}`,
      claim: cfbRivalLine(id),
      note: "Rival cards are never mixed, so nothing from that copy was added to this day.",
    })),
  ];
  const drops: CfbDropDisclosure | null = marks.drops.length
    ? {
        label: `Refused by the merge · ${marks.drops.length}`,
        count: marks.drops.length,
        settledPl: marks.dropPl != null ? fmtMoneyExact(marks.dropPl) : null,
        rows: marks.drops.map((d) => ({ id: d.id, result: d.result, tone: RESULT_TONE[d.result ?? ""] ?? "text-faint", text: cfbDropLine(d) })),
      }
    : null;
  return { lines, drops };
}

/**
 * The whole decision for one day, from the entry: null for a day carrying no markers, which is the
 * null both surfaces guard their marker elements on. `cfbDayMarks` remains exported and pinned
 * separately because `DayCard` needs one breach out of it by bucket for the summary chip.
 */
export function cfbDayDisclosure(e: CfbLedgerEntry): CfbDisclosure | null {
  const marks = cfbDayMarks(e);
  return marks ? cfbDisclosureOf(marks) : null;
}

/**
 * The disclosure itself — the No-play pill's tone (`border-gold/50 bg-gold/10`, the same pair
 * `RESULT_PILL.ungradable` uses in src/components/cfb/CfbTicketCard.tsx) and the Builder's own
 * Benched `<details>` for the list, so nothing new is invented visually. The breach sentence is
 * always visible inside the note; what the merge refused is one tap away, because on a 375px phone
 * a per-ticket list under every day's money row is the chrome this desk keeps out of the way.
 * The wording follows the merge's own console.warn: kept, not truncated.
 *
 * THE CORE SIDE USES THE SAME LANGUAGE, NOT A SECOND ONE (INSTRUCTION 45, defect B2, 2026-09-06).
 * A refused stake raise is a gold sentence in the breach's own shape — a bold `num` claim plus a
 * muted explanation — because it is the same kind of fact: money the merge would not seat. A
 * refused CORE wager is a row in the existing drop list rather than a second list, since it is
 * the same event on the other bucket and `cfbDropLine` already names which bucket it was.
 *
 * AND THE SUMMARY'S FIGURE SAYS "SETTLED P/L" (defect B1). It is the sum over dropped tickets
 * that carry one of the kernel's three settlement verdicts, and `dropPl` — and therefore the
 * disclosure's `settledPl` — is null when none of them do, so the span does not render at all. A
 * dropped wager nobody has graded is counted in the "· N" beside it and in no dollar figure.
 *
 * THIS COMPONENT DECIDES NOTHING (INSTRUCTION 45, defect B1, 2026-09-06). Every sentence, every
 * row, every tone class and the drop list's existence are settled by `cfbDisclosureOf` above,
 * which the tests pin BY VALUE; what is left here is the markup. A regex over this JSX was the
 * only guard the user-visible deliverable had, and a mutation pass showed the whole body could be
 * made unreachable with the suite green — so the decision moved out rather than the pins moving in.
 */
export function CfbDayMarksNote({ marks }: { marks: CfbDayMarks }) {
  const d = cfbDisclosureOf(marks);
  return (
    <div className="mt-3 rounded-[12px] border border-gold/50 bg-gold/10 px-3 py-2">
      {d.lines.map((line) => (
        <p key={line.key} className="text-[10.5px] leading-snug text-gold">
          <b className="num">{line.claim}</b> <span className="text-muted">{line.note}</span>
        </p>
      ))}
      {d.drops && (
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <span className="mr-1 inline-block transition-transform duration-(--dur-fast) group-open:rotate-90" aria-hidden>
              ▶
            </span>
            {d.drops.label}
            {d.drops.settledPl && <span className="num normal-case tracking-normal text-faint"> · {d.drops.settledPl} settled P/L</span>}
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {d.drops.rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-2 text-[10.5px]">
                <span className="min-w-0 truncate text-muted">{row.id}</span>
                <span className={`num shrink-0 ${row.tone}`}>{row.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ---------- shared UI state: the header's Import toggle opens the body's paste panel ---------- */

let importOpen = false;
const importSubs = new Set<() => void>();
function setImportOpen(v: boolean) {
  importOpen = v;
  for (const f of importSubs) f();
}
function useImportOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      importSubs.add(cb);
      return () => importSubs.delete(cb);
    },
    () => importOpen,
    () => false,
  );
}

/* ---------- grading ---------- */

let gradingRun: Promise<number> | null = null;

/** Grade every locked day on or before today whose grading is not done. Returns days touched. */
export function gradeCfbPending(): Promise<number> {
  if (gradingRun) return gradingRun;
  gradingRun = (async () => {
    const today = todayPT();
    const due = readCfbLedger().filter((e) => !e.grading?.done && e.date <= today && (e.core.length > 0 || e.funT.length > 0));
    let n = 0;
    for (const e of due) {
      try {
        const { finals } = await loadCfbFinals(e.date);
        if (gradeCfb(e.date, finals)) n++;
      } catch {
        /* offline or the feed hiccupped — the next view retries */
      }
    }
    return n;
  })().finally(() => {
    gradingRun = null;
  });
  return gradingRun;
}

/* ---------- header actions ---------- */

export function CfbLedgerActions() {
  const { exportText, wipe } = useCfbLedger();
  const open = useImportOpen();
  const [armed, setArmed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);
  const msgTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
      if (msgTimer.current) window.clearTimeout(msgTimer.current);
    },
    [],
  );

  const flash = (text: string) => {
    setMsg(text);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 2400);
  };

  const download = (): boolean => {
    try {
      const blob = new Blob([exportText()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parlay-lab-cfb-ledger-${todayPT()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch {
      return false;
    }
  };

  const doGrade = async () => {
    if (grading) return;
    setGrading(true);
    try {
      const n = await gradeCfbPending();
      flash(n ? `Graded ${n} day${n === 1 ? "" : "s"}.` : "Nothing new to grade.");
      if (n) void syncCfbNow();
    } finally {
      setGrading(false);
    }
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      flash("Copied — paste it into Import on the other device.");
    } catch {
      flash("Clipboard blocked — use Export instead.");
    }
  };

  const doWipe = () => {
    if (!armed) {
      download();
      setArmed(true);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(false), 6000);
      flash("Backup exported — tap again within 6s to wipe this device's CFB ledger.");
      return;
    }
    wipe();
    setArmed(false);
    if (armTimer.current) window.clearTimeout(armTimer.current);
    flash("CFB ledger wiped on this device. Sync refills it from the cloud copy.");
  };

  const small = "!px-3 !py-1 text-[11px]";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {msg && <span className="basis-full text-right text-[10.5px] text-muted md:basis-auto">{msg}</span>}
      <Pill variant="primary" className={small} onClick={() => void doGrade()} disabled={grading}>
        {grading ? "Grading…" : "Grade now"}
      </Pill>
      <Pill className={small} onClick={() => (download() ? flash("Exported.") : flash("Export blocked by the browser."))}>
        Export
      </Pill>
      <Pill className={small} onClick={() => void doCopy()}>
        Copy for phone
      </Pill>
      <Pill className={small} onClick={() => setImportOpen(!open)} aria-expanded={open}>
        {open ? "Close import" : "Import"}
      </Pill>
      <Pill className={`${small} ${armed ? "!border-neg/60 !bg-neg/10 !text-neg" : ""}`} onClick={doWipe}>
        {armed ? "Confirm wipe" : "Wipe device"}
      </Pill>
    </div>
  );
}

/* ---------- body ---------- */

function LegResults({ t, legs }: { t: CfbTicket; legs: Record<string, CfbLegVerdict> | undefined }) {
  if (!legs) return null;
  const rows = t.legs.map((leg) => ({ leg, v: legs[leg.lkey] })).filter((r) => r.v);
  if (!rows.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 px-1 text-[10.5px]">
      {rows.map(({ leg, v }) => (
        <li key={leg.lkey} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-muted">{leg.label}</span>
          <span className={`num shrink-0 ${RESULT_TONE[v.result] ?? "text-muted"}`}>
            {v.result}
            {v.detail && <span className="text-faint"> · {v.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** what one day's bucket has actually settled: the P/L figure and the gate that decides whether
    it may be shown at all. `settledStaked` / `returned` are the P/L's own two halves — NOT the
    stake sum on screen, which is every ticket listed beside it (see the B4 note further down). */
export type CfbDaySettlement = { pending: number; settledStaked: number; returned: number; pl: number; settled: boolean };

/**
 * A DAY CAN REOPEN, AND THE CARD HAS TO SAY SO (INSTRUCTION 45, defect U3, 2026-09-06).
 *
 * WHAT THIS IS. The arithmetic that used to sit inline at the top of `DayCard`, moved out
 * UNCHANGED — same skip set, same `won` / `push` returns, same cent rounding, same
 * `tix.length > 0 && pending === 0` gate. Nothing about the figures moves.
 *
 * WHY IT MOVED. The merge can now WITHDRAW a verdict: a day that was `grading.done === true`
 * comes back `done: false` with one ticket's grade gone from `grading.tickets`. What the card
 * renders for such a day was decided by a loop inside a React component, and no test in this
 * suite renders React — so the one thing that had to be checked (that a reopened day does not
 * read as a loss, and does not read as a blank) could not be checked at all. As a pure function
 * it is pinned BY VALUE in tests/cfb-card-ui.test.ts.
 *
 * WHAT IT DOES WITH A WITHDRAWN VERDICT, and why that is the honest answer. A ticket with no
 * entry in `grading.tickets` takes the SAME path as a `pending` one — `!r` is the first clause of
 * the skip — so it is counted in `pending`, its stake never enters `settledStaked`, and `settled`
 * goes false. The card therefore drops the P/L figure entirely and renders "N pending" in the live
 * tone: not a loss (the withdrawn ticket's stake is not booked against the day), not a blank (the
 * count is on screen), and not a stale figure from the grading that has been taken back. `done` is
 * deliberately NOT consulted — the verdicts on the tickets are the fact, and a day whose grades
 * all survive a `done: false` still shows its P/L, which is correct: nothing was withdrawn.
 *
 * AN EMPTY BUCKET IS NOT A SETTLED ZERO. `tix.length > 0` is load-bearing and is kept: without it
 * a day with no tickets in this scope would render "$0.00" in the settled tone, which reads as a
 * graded break-even rather than as a bucket that never played.
 */
export function cfbDaySettlement(tix: CfbTicket[], g: CfbGradingView | null): CfbDaySettlement {
  let settledStaked = 0, returned = 0, pending = 0;
  for (const t of tix) {
    const r = g?.tickets[t.id];
    if (!r || r.result === "pending" || r.result === "ungradable") {
      pending++;
      continue;
    }
    settledStaked += t.stake;
    returned += r.result === "won" ? r.payout : r.result === "push" ? t.stake : 0;
  }
  return {
    pending,
    settledStaked,
    returned,
    pl: Math.round((returned - settledStaked) * 100) / 100,
    settled: tix.length > 0 && pending === 0,
  };
}

function DayCard({ e, scope, open, today }: { e: CfbLedgerEntry; scope: Scope; open: boolean; today: string }) {
  const tix = cfbTicketsOf(e, scope);
  const g = cfbGradingOf(e);
  const { pending, pl, settled } = cfbDaySettlement(tix, g);
  const plTone = pl > 0 ? "text-pos" : pl < 0 ? "text-neg" : "text-muted";
  /* INSTRUCTION 45 (defect D1, 2026-09-06): the breach that belongs to the bucket THIS card is
     showing sits in the summary's money span, because that is the figure it qualifies — the
     stake sum one line above it is the over-cap total. The other bucket's breach and everything
     the merge refused are in the note below, which renders only when there is something to say. */
  const dayMarks = cfbDayMarks(e);
  const breach = dayMarks?.breaches.find((b) => b.bucket === scope) ?? null;
  return (
    <details className="glass px-4 py-3" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="text-[13px] font-bold text-text">{e.date === today ? "Today" : railLabel(e.date)}</span>
          <span className="num ml-2 text-[10.5px] text-faint">{e.date}</span>
          {e.noPlay && <span className="ml-2 rounded-full border border-line-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">No-play</span>}
        </span>
        <span className="num shrink-0 text-[11px] text-muted">
          {tix.length} ticket{tix.length === 1 ? "" : "s"} · ${tix.reduce((s, t) => s + t.stake, 0)} staked
          {settled ? (
            <b className={`ml-2 ${plTone}`}>{fmtMoneyExact(pl)}</b>
          ) : tix.length ? (
            <span className="ml-2 text-live">{pending} pending</span>
          ) : null}
          {breach && (
            <span className="block font-semibold text-gold">{cfbBreachChip(breach)}</span>
          )}
        </span>
      </summary>
      {dayMarks && <CfbDayMarksNote marks={dayMarks} />}
      {tix.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          {e.noPlay ? "NO-PLAY — nothing staked." : scope === "fun" ? "No fun parlay that day." : "No core tickets that day."}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {tix.map((t) => (
            <div key={t.id}>
              <CfbTicketCard t={t} grade={g?.tickets[t.id]} legResults={g?.legs} />
              <LegResults t={t} legs={g?.legs} />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function CfbLedger() {
  const { entries, stats, bankroll, importText } = useCfbLedger();
  const [scope, setScope] = useState<Scope>("core");
  const open = useImportOpen();
  const [paste, setPaste] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const today = useMemo(todayPT, []);
  const s = stats[scope];

  /* auto-grade on view; re-arm when sync lands a change */
  const graded = useRef(false);
  useEffect(() => {
    const run = () => {
      if (graded.current) return;
      graded.current = true;
      void gradeCfbPending();
    };
    run();
    const rearm = () => {
      graded.current = false;
      run();
    };
    window.addEventListener(CFB_SYNC_EVENT, rearm);
    return () => window.removeEventListener(CFB_SYNC_EVENT, rearm);
  }, []);

  const days = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const equity = useMemo(() => s.days.map((d) => d.cumPl), [s]);

  const applyImport = (text: string) => {
    const r = importText(text);
    if (r.ok) {
      setImportMsg(`Imported — ${r.added} added, ${r.merged} merged. ${r.entries.length} locked day${r.entries.length === 1 ? "" : "s"} on this device.`);
      setPaste("");
      setImportOpen(false);
      void syncCfbNow();
    } else {
      setImportMsg(`Import refused — ${r.error}`);
    }
  };
  const onFile = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    f.text().then(applyImport, () => setImportMsg("Could not read that file."));
  };

  const plTone = s.pl > 0 ? "pos" : s.pl < 0 ? "neg" : "muted";
  const record = `${s.w}-${s.l}${s.push ? `-${s.push}` : ""}`;

  return (
    <div className="space-y-4">
      <CfbSyncChip />

      {(open || importMsg) && (
        <Panel title="Import a CFB ledger backup" action={<span className="text-[10.5px] text-faint">merges — never erases a locked day</span>}>
          {open && (
            <>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste the exported CFB ledger JSON here"
                rows={5}
                className="num w-full rounded-[12px] border border-line-2 bg-surface-2 px-3 py-2 text-[11px] text-text"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill variant="gold" className="!px-3 !py-1 text-[11px]" onClick={() => applyImport(paste)} disabled={!paste.trim()}>
                  Import pasted
                </Pill>
                <Pill className="!px-3 !py-1 text-[11px]" onClick={() => fileRef.current?.click()}>
                  Choose file
                </Pill>
                <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile} />
              </div>
            </>
          )}
          {importMsg && <p className="mt-2 text-[11px] text-muted">{importMsg}</p>}
        </Panel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented options={SCOPES} value={scope} onChange={setScope} size="md" tone="cfb" label="Ledger scope" />
        {/* INSTRUCTION 45 (defect B4, 2026-09-06): TWO MONEY FIGURES, ONE WORD. This line renders
            `stats.staked`, which is SETTLED stakes only — src/lib/ledger-stats.ts `ledgerStats`
            does `if (!r || r.result === "pending") { d.pending++; pendT++; continue; }` (read this
            turn, one fragment at a time) and the same for
            `ungradable` BEFORE `d.staked += t.stake`, so a pending ticket is counted and never
            staked. Directly under it, every `DayCard` summary sums EVERY ticket in the scope
            (`tix.reduce(…)`, pending included). The two were both labelled with the bare word
            "staked" and disagreed on any day with an ungraded ticket, with nothing on screen
            saying why. NEITHER COMPUTATION IS CHANGED — only what each one says it counts: this
            one names the settled tickets, the day card's names the tickets listed beside it. */}
        <span className="num text-[10.5px] text-faint">
          {entries.length} locked day{entries.length === 1 ? "" : "s"} · ${s.staked.toFixed(2)} staked on settled tickets
        </span>
      </div>

      <Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Net P/L" value={fmtMoneyExact(s.pl)} sub={`$${s.ret.toFixed(2)} returned`} tone={plTone} />
          <StatTile label="ROI" value={roiPct(s.roi)} sub="on settled stakes" tone={s.roi == null ? "muted" : s.roi >= 0 ? "pos" : "neg"} />
          <StatTile label="Record" value={record} sub={`${s.pending} pending · ${s.ungradable} void`} tone="cfb" />
          <StatTile label="Max drawdown" value={s.dd > 0 ? `-$${s.dd.toFixed(2)}` : "$0.00"} sub="from the running peak" tone={s.dd > 0 ? "neg" : "muted"} />
          <StatTile
            label="CFB bankroll"
            value={`$${bankroll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`$${CFB_BANK_BASE.toLocaleString("en-US")} base · both buckets`}
            tone="gold"
            className="col-span-2 md:col-span-1"
          />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Panel
          title={`Equity · ${scope}`}
          action={<span className="num text-[10.5px] text-faint">{s.days.length} settled day{s.days.length === 1 ? "" : "s"}</span>}
        >
          <Sparkline values={equity} height={44} label={`cumulative ${scope} P/L over ${s.days.length} days`} />
          {s.bigHit && scope === "fun" && (
            <p className="num mt-2 text-[10.5px] text-gold">
              Biggest hit · {s.bigHit.name} · ${s.bigHit.payout.toFixed(2)} on {railLabel(s.bigHit.date)}
            </p>
          )}
        </Panel>
      </Reveal>

      {days.length === 0 ? (
        <EmptyState title="No locked CFB days yet" body="Lock a card on the Builder — each slate day lands here with its grades." />
      ) : (
        <div className="space-y-2">
          {days.map((e, i) => (
            <Reveal key={e.date} delay={Math.min(i, 6) * 0.04} y={10}>
              <DayCard e={e} scope={scope} open={i === 0} today={today} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
