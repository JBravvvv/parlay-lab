import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cfbBreachChip, cfbCutLine, cfbDayDisclosure, cfbDayMarks, cfbDaySettlement, cfbDropLine, cfbRivalLine } from "@/components/cfb/CfbLedger";
import type { CfbLedgerEntry } from "@/lib/cfb/types";
import { stripComments } from "./helpers/source";

/**
 * CFB GAME CARD + BUILDER TICKETS ON THE CAESARS GRAMMAR (INSTRUCTION 40, 2026-09-05).
 * Source-level pins, the nav-flat style: the Games card is built on the shared OddsGrid, the
 * Builder lays its tickets out as a .carousel, none of the four files carry a per-item blur
 * (the iOS freeze rule), every <Link> is replace-only, and the card draws its marks at "md"
 * or "sm" — never the 18px "xs" Josh called disproportionate.
 */

const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const FILES = {
  card: "src/components/cfb/CfbGameCard.tsx",
  games: "src/components/cfb/CfbGames.tsx",
  builder: "src/components/cfb/CfbBuilder.tsx",
  ticket: "src/components/cfb/CfbTicketCard.tsx",
} as const;

const BLUR = /backdrop-filter|backdrop-blur/;

describe("cfb-card-ui — the game card is built on the shared OddsGrid", () => {
  const src = read(FILES.card);
  it("imports OddsGrid from the shared primitive and renders it in the CFB tone", () => {
    expect(src).toMatch(/import \{[^}]*\bOddsGrid\b[^}]*\} from "@\/components\/ui\/OddsGrid"/);
    expect(src).toMatch(/<OddsGrid\s[^>]*tone="cfb"/);
    expect(src).toMatch(/columns=\{\["Spread", "Money", "Total"\]\}/);
  });
  it("keeps the card's public surface (props + the helpers other CFB views import)", () => {
    for (const name of ["bookShort", "timeLabelPT", "fmtSigned", "pctOrDash", "numOrDash", "marketSides", "orderedRows", "cellLabel", "quoteText", "StatusMark", "CfbGameCard"]) {
      expect(src, `export ${name}`).toMatch(new RegExp(`export (?:function|const) ${name}\\b`));
    }
    for (const prop of ["expanded", "onToggle", "onPick", "isPicked"]) expect(src, `prop ${prop}`).toContain(prop);
  });
  it("lights a +EV Caesars cell with the \"ev\" tone and lists the grade chip inline", () => {
    expect(src).toMatch(/"ev"/);
    expect(src).toMatch(/<GradeChip/);
  });
  it("draws the live pill with the pulsing dot", () => {
    expect(src).toMatch(/pulse-dot/);
  });
  it("renders TeamMark at md or sm — never xs", () => {
    const sizes = [...src.matchAll(/<TeamMark\b[^>]*\bsize="([a-z]+)"/g)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(["md", "sm"]).toContain(s);
    expect(src).not.toMatch(/<TeamMark\b[^>]*\bsize="xs"/);
  });
});

describe("cfb-card-ui — the Builder lays its tickets out as a carousel with hero prices", () => {
  it("CfbBuilder uses the .carousel strip", () => {
    expect(read(FILES.builder)).toMatch(/className="carousel[\s"]/);
  });
  it("CfbTicketCard carries the hero-price and the favorites parlay is the amber card", () => {
    const src = read(FILES.ticket);
    expect(src).toMatch(/hero-price/);
    expect(src).toMatch(/is-cfb/);
    expect(src).toMatch(/to hit/);
    expect(src).toMatch(/pays/);
    expect(src).toMatch(/ticketPayout\(/);
  });
});

describe("cfb-card-ui — no per-item blur, no history-pushing Link", () => {
  for (const [k, f] of Object.entries(FILES)) {
    it(`${k} (${f}) carries no backdrop-filter / backdrop-blur`, () => {
      expect(read(f)).not.toMatch(BLUR);
    });
    it(`${k} (${f}) has no <Link> without replace and no router.push`, () => {
      const src = read(f);
      const links = [...src.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]);
      for (const tag of links) expect(tag, tag).toMatch(/\breplace\b/);
      expect(src).not.toMatch(/router\.push\(/);
    });
  }
});

/* ==========================================================================================
 * THE MERGE'S MARKERS ARE RENDERED, NOT ONLY STORED (INSTRUCTION 45, defect D1, 2026-09-06).
 *
 * WHAT WENT WRONG. The CFB device rail now delegates its core bucket to the shared merge
 * (src/lib/cfb/store.ts `upsertCfbEntries` -> `unionCore`), so where the phone used to truncate
 * an over-cap day it now DISPLAYS the whole over-cap set. `mergeDay` (src/lib/ledger-merge.ts)
 * keeps such a day whole ON PURPOSE and stamps `capBreach { core: { sum, cap } }` on it, and
 * refuses fun tickets it cannot seat, naming them on `funDropped` with a `funDroppedPL` receipt
 * carrying the refused ticket's result, payout and stake. A grep before this round found every
 * one of those markers rendered NOWHERE: the phone could show $180 of core money on a $150 desk
 * with nothing saying the day was over its allotment, and a graded fun ticket the cap deleted
 * left no trace on any screen.
 *
 * WHAT IS PINNED HERE. `cfbDayMarks` is the pure reader both CFB surfaces render from — it turns
 * the day's marker fields into the figures on screen (the excess is DERIVED, so the note can never
 * disagree with the sum and the cap beside it), and it returns null for a day carrying no markers,
 * which is what makes the "unmarked day is unchanged" claim below checkable. (Those fields used to
 * be described here as UNTYPED, and are not: `CfbLedgerEntry` declares all seven and closes its
 * index signature, which "the type-level closure" block at the end of this file pins. They arrive
 * as parsed JSON all the same, so the reader validates every value — which is what the malformed-
 * marker cases below are for.)
 *
 * THE UNMARKED DAY. Every marker element in both files is guarded on that null, and the chrome a
 * marked and an unmarked day share is pinned BYTE FOR BYTE (the `details`, the `summary`, the
 * No-play pill, the money span's opening tag, the empty-bucket line and the ticket grid), so a
 * marker that cost an unmarked day a class, a wrapper or a line break fails here. Those byte pins
 * were green before this block was written and are green after: they are a guard, not a red.
 * Source is read through `stripComments` so a docblock quoting the JSX cannot satisfy them.
 * ======================================================================================== */

const DAY = "2026-09-06";
const dayWith = (extra: Record<string, unknown>): CfbLedgerEntry =>
  ({ sport: "cfb", date: DAY, locked: true, daily: 150, fun: 25, core: [], funT: [], lockedAt: 1, games: {}, ...extra }) as unknown as CfbLedgerEntry;
const marks = (e: Record<string, unknown>) => cfbDayMarks(dayWith(e));
const FUN1 = `cfb-${DAY}-fun-1`;
const FUN2 = `cfb-${DAY}-topup1-fun-1`;
/** n tickets of $stake, the shape the day actually carries — the sum on screen is derived from these */
const tix = (n: number, stake: number, bucket: "core" | "fun") =>
  Array.from({ length: n }, (_, i) => ({ id: `cfb-${DAY}-${bucket}-${i + 1}`, stake, bucket, legs: [] }));

describe("cfb-card-ui — cfbDayMarks reads the merge's markers into the figures on screen", () => {
  it("an over-cap core day carries its sum, its allotment and the derived excess", () => {
    const m = marks({ core: tix(6, 30, "core"), capBreach: { core: { sum: 180, cap: 150 } } });
    expect(m).not.toBeNull();
    expect(m!.breaches).toEqual([{ bucket: "core", sum: 180, cap: 150, over: 30 }]);
    expect(m!.drops).toEqual([]);
    expect(m!.dropPl).toBeNull();
  });

  it("the sum on screen is the day's OWN tickets — a marker that disagrees with them does not win", () => {
    /* the stored `sum` is what the LAST merge measured; the tickets are the day as it stands. The
       figure rendered one line under the day's stake total must be that total, or the card shows
       two numbers about the same money with no rule that they agree. */
    const m = marks({ core: tix(6, 30, "core"), capBreach: { core: { sum: 999, cap: 150 } } })!;
    expect(m.breaches).toEqual([{ bucket: "core", sum: 180, cap: 150, over: 30 }]);
    expect(marks({ core: tix(6, 25, "core"), capBreach: { core: { sum: 180, cap: 150 } } }), "a stale marker over a day that now fits its allotment claims nothing").toBeNull();
  });

  it("both buckets breach independently and each names its own allotment", () => {
    const m = marks({
      core: tix(6, 30, "core"),
      funT: tix(2, 25, "fun"),
      capBreach: { core: { sum: 180, cap: 150 }, fun: { sum: 50, cap: 25 } },
    })!;
    expect(m.breaches).toEqual([
      { bucket: "core", sum: 180, cap: 150, over: 30 },
      { bucket: "fun", sum: 50, cap: 25, over: 25 },
    ]);
  });

  it("a dropped ticket carries the P/L it represented, not only its id", () => {
    const m = marks({
      funDropped: [FUN1],
      funDroppedPL: { [FUN1]: { result: "won", payout: 92.5, stake: 25 } },
    })!;
    expect(m.drops).toEqual([{ id: FUN1, bucket: "fun", result: "won", payout: 92.5, stake: 25 }]);
    expect(m.dropPl).toBe(67.5);
  });

  it("a dropped id with no receipt is still named, and only settled drops move the P/L", () => {
    const m = marks({
      funDropped: [FUN2, FUN1],
      funDroppedPL: { [FUN1]: { result: "lost", payout: 0, stake: 25 } },
    })!;
    expect(m.drops.map((d) => d.id)).toEqual([FUN1, FUN2]);
    expect(m.drops[1]).toEqual({ id: FUN2, bucket: "fun", result: null, payout: null, stake: null });
    expect(m.dropPl).toBe(-25);
  });

  it("a day with no markers reads as null — which is what the render path is guarded on", () => {
    expect(cfbDayMarks(dayWith({}))).toBeNull();
    expect(marks({ core: tix(6, 25, "core"), capBreach: {} }), "an empty breach object is not a breach").toBeNull();
    expect(marks({ core: tix(6, 25, "core"), capBreach: { core: { cap: 150 } } }), "a day ON its allotment is not over it").toBeNull();
    expect(marks({ funDropped: [] }), "an empty drop list is not a drop").toBeNull();
    expect(marks({ core: tix(6, 30, "core"), capBreach: "over" }), "a malformed marker must not mint a figure").toBeNull();
    expect(marks({ core: tix(6, 30, "core"), capBreach: { core: { sum: 180 } } }), "a breach with no allotment to name is not renderable").toBeNull();
  });
});

describe("cfb-card-ui — the markers are rendered where the day's money is, and only when they exist", () => {
  const ledger = () => stripComments(read("src/components/cfb/CfbLedger.tsx"));
  const builder = () => stripComments(read(FILES.builder));

  it("CfbLedger's DayCard reads the marks and shows the breach beside the day's stake sum", () => {
    const src = ledger();
    expect(src).toMatch(/const dayMarks = cfbDayMarks\(e\)/);
    expect(src).toMatch(/dayMarks\?\.breaches\.find\(\(b\) => b\.bucket === scope\)/);
    /* the breach line sits INSIDE the summary's money span, guarded on the breach */
    expect(src).toMatch(/\{breach && \(\s*<span className="block/);
    expect(src).toMatch(/\$\$\{breach\.sum\} of \$\$\{breach\.cap\}/);
    expect(src).toMatch(/\$\$\{breach\.over\} over/);
  });

  it("both CFB surfaces render the disclosure, and every render site is guarded on the marks", () => {
    for (const [name, src] of [["CfbLedger", ledger()], ["CfbBuilder", builder()]] as const) {
      const uses = [...src.matchAll(/.{0,20}<CfbDayMarksNote\b/g)].map((m) => m[0]);
      expect(uses.length, `${name} must render the marker note`).toBeGreaterThan(0);
      for (const u of uses) expect(u, `${name}: an unguarded marker note`).toMatch(/\{\s*\w*[Mm]arks && </);
    }
    expect(builder()).toMatch(/import \{[^}]*\bcfbDayMarks\b[^}]*\} from "@\/components\/cfb\/CfbLedger"/);
    expect(builder()).toMatch(/const lockedMarks = locked \? cfbDayMarks\(locked\) : null/);
  });

  it("the note names the allotment, the excess and what the merge refused", () => {
    const src = ledger();
    expect(src).toMatch(/export function CfbDayMarksNote/);
    expect(src).toMatch(/against this day's \$\$\{b\.cap\} allotment/);
    expect(src).toMatch(/kept whole and marked, not truncated/i);
    /* REWRITTEN, NOT LOOSENED (INSTRUCTION 45, defect U2, 2026-09-06). This line was
         expect(src).toMatch(/Dropped by the cap/);
       — a source pin on a heading that is no longer true of every receipt under it: `unionCore`
       refuses a rival card's appends with no cap involved and files them on the SAME `coreDropped`
       / `coreDroppedPL` channels. The heading is a decided VALUE now, so the assertion moves UP in
       strength rather than down: this line pins that the JSX renders the decided heading and
       builds none of its own, and the exact string is pinned BY VALUE in the U2 block below
       (`expect(d.drops!.label).toBe("Refused by the merge · 1")`), which a source regex could
       never do — a reworded heading passed the old pin. */
    expect(src, "the heading is the decided value, not a claim built at the markup").toMatch(/\{d\.drops\.label\}/);
    expect(src).toMatch(/fmtMoneyExact\(marks\.dropPl\)/);
  });

  it("an unmarked day keeps the chrome it has today, byte for byte", () => {
    const src = ledger();
    for (const frag of [
      `<details className="glass px-4 py-3" open={open}>`,
      `<summary className="flex cursor-pointer list-none items-center justify-between gap-2">`,
      `<span className="min-w-0">`,
      `{e.noPlay && <span className="ml-2 rounded-full border border-line-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">No-play</span>}`,
      `<span className="num shrink-0 text-[11px] text-muted">`,
      `{e.noPlay ? "NO-PLAY — nothing staked." : scope === "fun" ? "No fun parlay that day." : "No core tickets that day."}`,
      `<div className="mt-3 grid gap-3 md:grid-cols-2">`,
    ]) {
      expect(src, `unmarked-day chrome changed: ${frag}`).toContain(frag);
    }
    expect(builder()).toContain(`<p className="text-[12px] text-gold">{lockedLine(locked)}</p>`);
  });
});

/* ==========================================================================================
 * THE CLOSING ROUND'S THREE HOLES IN THE MARKER RENDER (INSTRUCTION 45, 2026-09-06).
 *
 * B1 — THE CARD BOOKED A LOSS ON A WAGER NOBODY HAD GRADED. Last round widened the drop receipt
 * (src/lib/ledger-merge.ts `receiptOf`) to cover EVERY refused ticket, not just one already
 * carrying a verdict: an ungraded drop now records `{ result: "pending", payout: 0, stake: 25 }`.
 * `cfbDayMarks` was not widened with it — it skipped only `result == null`, so "pending" fell
 * through and scored `(payout ?? 0) - stake` = -25. Measured on the two overlapping 2026-09-05
 * fun top-up pokes: `dropPl: -25`, the note reading "Dropped by the cap · 1 · -$25.00 P/L" over a
 * row reading "$25 fun · pending · pays $0.00" — a $25 loss and a $0 payout on a wager whose game
 * may not have kicked off.
 *
 * B2 — THE CORE-SIDE MARKERS WERE RENDERED NOWHERE. `mergeDay` records `coreDropped` /
 * `coreDroppedPL` (a core wager the allotment refused) and `stakeConflict` (a stake raise that
 * the merge would not seat, under either of `unionCore`'s two refusal rules) exactly as it records
 * the fun-side pair, and both reach the phone — `upsertCfbEntries` keeps the whole merged day. The reader read only
 * the fun channel, so a refused core wager and a refused raise were invisible on the surface Josh
 * reads, which is the failure the marker work existed to end.
 *
 * WHAT IS PINNED. Behaviourally, not by source regex: the reader's shape, and the two pure line
 * builders the note renders each row from (`cfbDropLine`, `cfbCutLine`) — a source regex passes a
 * behaviourally-identical rewording and proves nothing. The unmarked-day byte pins above still
 * stand and are re-checked by the block above this one.
 * ======================================================================================== */

const CORE1 = `cfb-${DAY}-core-1`;
const CORE2 = `cfb-${DAY}-core-2`;

describe("cfb-card-ui — an ungraded drop is a withdrawn wager, not a booked loss (B1)", () => {
  it("a `pending` receipt moves no P/L and leaves the figure absent", () => {
    const m = marks({ funDropped: [FUN2], funDroppedPL: { [FUN2]: { result: "pending", payout: 0, stake: 25 } } })!;
    expect(m.drops).toEqual([{ id: FUN2, bucket: "fun", result: "pending", payout: 0, stake: 25 }]);
    expect(m.dropPl, "nothing settled — no P/L figure at all, not a zero").toBeNull();
  });

  it("only the kernel's three SETTLEMENT verdicts move the P/L; the unsettled ride along at zero", () => {
    const m = marks({
      funDropped: [FUN1, FUN2],
      funDroppedPL: { [FUN1]: { result: "lost", payout: 0, stake: 25 }, [FUN2]: { result: "pending", payout: 0, stake: 25 } },
    })!;
    expect(m.drops.map((d) => d.result)).toEqual(["lost", "pending"]);
    expect(m.dropPl, "the settled $25 loss only — the pending one is not money yet").toBe(-25);
  });

  it("an `ungradable` drop is not a settlement either", () => {
    const m = marks({ funDropped: [FUN1], funDroppedPL: { [FUN1]: { result: "ungradable", payout: 0, stake: 25 } } })!;
    expect(m.dropPl).toBeNull();
  });

  it("the row the note renders says NOT GRADED rather than showing a $0 payout", () => {
    const pending = cfbDropLine({ id: FUN2, bucket: "fun", result: "pending", payout: 0, stake: 25 });
    expect(pending, "a $0.00 payout on an ungraded wager is the lie").not.toMatch(/pays/);
    expect(pending).toMatch(/not graded yet/i);
    expect(pending).toContain("$25 fun");
    /* a settled drop still says everything it said before */
    expect(cfbDropLine({ id: FUN1, bucket: "fun", result: "won", payout: 92.5, stake: 25 })).toBe("$25 fun · won · pays $92.50");
    expect(cfbDropLine({ id: FUN2, bucket: "fun", result: null, payout: null, stake: null })).toBe("stake unrecorded · no verdict recorded");
  });
});

describe("cfb-card-ui — the core-side markers are read and rendered (B2)", () => {
  it("a core wager the allotment refused is named with its money, beside the fun ones", () => {
    const m = marks({
      coreDropped: [CORE1],
      coreDroppedPL: { [CORE1]: { result: "won", payout: 60, stake: 25 } },
      funDropped: [FUN1],
      funDroppedPL: { [FUN1]: { result: "lost", payout: 0, stake: 25 } },
    })!;
    expect(m.drops).toEqual([
      { id: CORE1, bucket: "core", result: "won", payout: 60, stake: 25 },
      { id: FUN1, bucket: "fun", result: "lost", payout: 0, stake: 25 },
    ]);
    expect(m.dropPl, "+35 on the core win, -25 on the fun loss").toBe(10);
    expect(cfbDropLine(m.drops[0])).toBe("$25 core · won · pays $60.00");
  });

  it("a core drop with no receipt is still named, exactly as a fun one is", () => {
    const m = marks({ coreDropped: [CORE2, CORE1] })!;
    expect(m.drops).toEqual([
      { id: CORE1, bucket: "core", result: null, payout: null, stake: null },
      { id: CORE2, bucket: "core", result: null, payout: null, stake: null },
    ]);
    expect(m.dropPl).toBeNull();
  });

  it("a refused stake raise is disclosed against the stake actually seated on the day", () => {
    const m = marks({
      core: [{ id: CORE1, stake: 15, bucket: "core", legs: [] }],
      stakeConflict: { [CORE1]: { kept: 15, refused: 25 } },
    })!;
    expect(m.cuts).toEqual([{ id: CORE1, kept: 15, refused: 25, cut: 10 }]);
    expect(cfbCutLine(m.cuts[0])).toBe("$15 stands · a $25 raise was refused · $10 not staked");
  });

  it("a stale or malformed conflict marker mints no figure", () => {
    expect(marks({ core: [{ id: CORE1, stake: 25, bucket: "core", legs: [] }], stakeConflict: { [CORE1]: { kept: 15, refused: 25 } } }), "the raise has since landed — nothing was cut").toBeNull();
    expect(marks({ stakeConflict: { [CORE1]: { kept: 15, refused: 25 } } }), "the id is not seated on this day at all").toBeNull();
    expect(marks({ core: [{ id: CORE1, stake: 15, bucket: "core", legs: [] }], stakeConflict: { [CORE1]: { kept: 15 } } }), "no refused figure to name").toBeNull();
    expect(marks({ core: [{ id: CORE1, stake: 15, bucket: "core", legs: [] }], stakeConflict: "cut" }), "a malformed marker is not a marker").toBeNull();
  });

  it("the note renders every marker channel, each guarded, and the day card still guards the whole note", () => {
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src, "the cuts are rendered").toMatch(/marks\.cuts\.map\(/);
    expect(src, "each row's text comes from the pinned line builder").toMatch(/cfbDropLine\(d\)/);
    expect(src).toMatch(/cfbCutLine\(c\)/);
    /* REWRITTEN, NOT LOOSENED (INSTRUCTION 45, defect B1, 2026-09-06). The three fragments below
       are asserted exactly as before — `toContain`, same strings. Only the MESSAGE changed, and it
       had to: it used to read "`${frag}` must live inside CfbDayMarksNote", which is now false.
       The three maps moved out of the JSX into `cfbDisclosureOf`, which is the whole point of this
       round — the decision is a value, and the block above pins each of these three channels by
       that value. A message is a claim like any other; a passing assertion under a false one is
       exactly the defect this doctrine exists to stop. */
    for (const frag of ["marks.cuts.map(", "marks.drops.map(", "marks.breaches.map("]) {
      expect(src, `${frag} must live in cfbDisclosureOf, the pure decision the note renders`).toContain(frag);
    }
  });

  it("the JSX renders the decided structure and decides nothing itself", () => {
    /* THE HALF A VALUE CANNOT REACH (INSTRUCTION 45, defect B1, 2026-09-06). The block below this
       one pins WHAT a day discloses by value. Nothing in a value can say the component actually
       consumes it, so these four source pins do — and they are explicitly source pins, kept for
       that reason and no other: `CfbDayMarksNote` computes the disclosure once, renders each line's
       own `claim` and `note`, and renders each drop row's own `text` and `tone` rather than
       rebuilding either at the JSX. */
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src, "the note renders one decided structure").toMatch(/const d = cfbDisclosureOf\(marks\)/);
    expect(src, "each gold line is the decided claim + note").toMatch(/\{line\.claim\}<\/b> <span className="text-muted">\{line\.note\}/);
    expect(src, "each drop row is the decided text in the decided tone").toMatch(/\$\{row\.tone\}`\}>\{row\.text\}/);
    expect(src, "the summary's money figure is the decided string, absent when nothing settled").toMatch(/\{d\.drops\.settledPl && </);
  });
});

describe("cfb-card-ui — two money figures on one screen say what each counts (B4)", () => {
  it("the ledger header's staked figure names the settled tickets it counts", () => {
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src, "a bare `staked` over settled-only stakes, above day cards showing ALL stakes").not.toMatch(/\$\{s\.staked\.toFixed\(2\)\} staked\s*$/m);
    expect(src).toMatch(/\$\{s\.staked\.toFixed\(2\)\} staked on settled tickets/);
  });
  it("the day card's figure names the tickets it sums", () => {
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src).toMatch(/tix\.reduce\(\(s, t\) => s \+ t\.stake, 0\)\} staked/);
  });
});

/* ==========================================================================================
 * THE DISCLOSURE IS A VALUE BEFORE IT IS MARKUP (INSTRUCTION 45, defect B1, 2026-09-06).
 *
 * WHAT WENT WRONG. Everything above this line that guards the marker note is a SOURCE REGEX over
 * comment-stripped text, because no test in this suite renders React. A mutation pass proved what
 * that is worth: the whole `CfbDayMarksNote` body — breaches, cuts, drop rows — can be made
 * unreachable and every one of the 987 tests still passes. A regex over source also passes any
 * behaviourally-identical rewording, so it pins the SPELLING of the render and not the render.
 *
 * THE FIX IS STRUCTURAL, NOT A NEW DEPENDENCY. The decision — which markers a day discloses, what
 * each line claims, which rows the drop list carries and what each row says — is now a pure
 * function, `cfbDayDisclosure` / `cfbDisclosureOf` in src/components/cfb/CfbLedger.tsx, and the
 * component renders that structure and nothing else. These pins feed it real merged-day shapes and
 * assert the exact disclosure BY VALUE. What the source regexes above still buy, and the reason
 * none of them were deleted, is the part a value cannot reach: that the JSX actually consumes this
 * structure, that both surfaces render the note, that every render site is guarded on the marks,
 * and that an unmarked day's chrome is unchanged byte for byte.
 * ======================================================================================== */

const RIVAL1 = `cfb-${DAY}-core-9`;
/** an id OUTSIDE the `tix()` run, so a seated ticket cannot be shadowed by a generated one */
const CUT1 = `cfb-${DAY}-core-8`;
const seat = (id: string, stake: number) => ({ id, stake, bucket: "core", legs: [] });

describe("cfb-card-ui — the day's disclosure is decided by a pure function (B1)", () => {
  it("an unmarked day discloses nothing at all — the render path's null", () => {
    expect(cfbDayDisclosure(dayWith({}))).toBeNull();
    expect(cfbDayDisclosure(dayWith({ core: tix(6, 25, "core"), capBreach: {} }))).toBeNull();
  });

  it("a breach is one gold line: the claim carries the figures, the note explains the keep-whole rule", () => {
    const d = cfbDayDisclosure(dayWith({ core: tix(6, 30, "core"), capBreach: { core: { sum: 180, cap: 150 } } }))!;
    expect(d.drops).toBeNull();
    /* REWRITTEN, NOT LOOSENED (INSTRUCTION 45, defect U4, 2026-09-06). The `note` below was
         note: "A copy of this day was already over cap before the merge — it is kept whole and marked, not truncated."
       and it is now
         note: "The day is kept whole and marked, not truncated — no wager a device still shows is deleted to make it fit."
       A REWRITE, because the first clause asserted a CAUSE the kernel does not guarantee: `mergeDay`
       stamps `capBreach` off the MERGED day's own stake sums, so a merge can MINT a breach out of
       two copies that were each inside the desk. MEASURED TWICE THIS ROUND through `mergeLedgers`,
       both orders: copy A six agreed $25 core tickets ($150 exactly), copy B the same card with
       `core-2` topped up to $50 carrying `topUp: 25` and `core-6` absent ($150 exactly).
         · against the kernel earlier today — merged stakes [25,50,25,25,25,25], sum 175,
           `capBreach {"core":{"sum":175,"cap":150}}`, under a note telling Josh a copy had ARRIVED
           over cap;
         · against the kernel as it now stands, after it began weighing a receipted raise against
           `cap` on every pair — stakes [25,25,25,25,25,25], sum 150, no `capBreach`, the refusal
           named as `stakeConflict {"cfb-2026-09-05-core-2":{"kept":25,"refused":50}}`.
       The cause changed underneath the sentence inside one round, and closing one creation path is
       not a proof that none is left — so the note claims no cause. Same strength: still `toEqual`
       over the whole line, still every field, still the key and the claim character for character.
       The surviving clause is the kernel's actual policy, true of every breach it can produce
       however the breach arose. */
    expect(d.lines).toEqual([
      {
        key: "breach:core",
        claim: "Core money is $180 against this day's $150 allotment — $30 over.",
        note: "The day is kept whole and marked, not truncated — no wager a device still shows is deleted to make it fit.",
      },
    ]);
  });

  it("the breach note claims no CAUSE — a merge can mint a breach out of two in-desk copies (U4)", () => {
    const note = cfbDayDisclosure(dayWith({ core: tix(6, 30, "core"), capBreach: { core: { sum: 180, cap: 150 } } }))!.lines[0].note;
    expect(note, "a breach the merge MINTS is not a copy that arrived over cap — see the rewrite note above").not.toMatch(/already over cap/i);
    expect(note, "what IS true of every breach the kernel can produce: nothing is deleted to fit").toMatch(/kept whole and marked, not truncated/);
  });

  it("the fun breach names FUN and its own allotment, and core discloses first", () => {
    const d = cfbDayDisclosure(
      dayWith({
        core: tix(6, 30, "core"),
        funT: tix(2, 25, "fun"),
        capBreach: { core: { sum: 180, cap: 150 }, fun: { sum: 50, cap: 25 } },
      }),
    )!;
    expect(d.lines.map((l) => l.key)).toEqual(["breach:core", "breach:fun"]);
    expect(d.lines[1].claim).toBe("Fun money is $50 against this day's $25 allotment — $25 over.");
  });

  it("the drop list is a described block: how many, what settled, and one row per refused wager", () => {
    const d = cfbDayDisclosure(
      dayWith({
        coreDropped: [CORE1],
        coreDroppedPL: { [CORE1]: { result: "won", payout: 60, stake: 25 } },
        funDropped: [FUN1, FUN2],
        funDroppedPL: { [FUN1]: { result: "lost", payout: 0, stake: 25 }, [FUN2]: { result: "pending", payout: 0, stake: 25 } },
      }),
    )!;
    expect(d.lines).toEqual([]);
    /* WIDENED, NOT REWRITTEN (INSTRUCTION 45, defect U2, 2026-09-06): `label` is a NEW field on the
       disclosure — the heading, which used to be a template literal in the JSX — so this exact
       `toEqual` now pins one more thing than it did. Every field it already pinned is unchanged. */
    expect(d.drops).toEqual({
      label: "Refused by the merge · 3",
      count: 3,
      settledPl: "+$10.00",
      rows: [
        { id: CORE1, result: "won", tone: "text-pos", text: "$25 core · won · pays $60.00" },
        { id: FUN1, result: "lost", tone: "text-neg", text: "$25 fun · lost · pays $0.00" },
        { id: FUN2, result: "pending", tone: "text-live", text: "$25 fun · pending — not graded yet, no P/L booked" },
      ],
    });
  });

  it("a refused raise discloses as a line in the breach's own shape, after the breaches", () => {
    const d = cfbDayDisclosure(
      dayWith({
        core: [seat(CUT1, 15), ...tix(6, 30, "core")],
        capBreach: { core: { sum: 195, cap: 150 } },
        stakeConflict: { [CUT1]: { kept: 15, refused: 25 } },
      }),
    )!;
    expect(d.lines.map((l) => l.key)).toEqual(["breach:core", `cut:${CUT1}`]);
    /* REWRITTEN, NOT LOOSENED (INSTRUCTION 45, defect U1, 2026-09-06). The `note` below was
         note: `Two copies of ${CUT1} disagreed on stake with no top-up receipt — the smaller stake stands.`
       and it is now
         note: `Two copies of ${CUT1} named different stakes and the merge would not seat the larger — either no top-up receipt accounted for it, or seating it would have carried this day past its allotment.`
       This is a REWRITE because the pinned sentence encoded a FALSE explanation, not because the
       assertion was inconvenient: `unionCore` (src/lib/ledger-merge.ts) writes this marker from a
       second branch — the refused-raise arm, which keeps THIS card's stake — reached on rival cards
       with no receipt consulted at all, and reached again when a valid receipt is overruled because
       seating the raise would carry the projected core past `cap`. So "with no
       top-up receipt" was asserted over refusals whose receipt had been read and accepted. Same
       strength: still `toEqual` over the whole line, still every field, still the key and the claim
       character for character. */
    expect(d.lines[1]).toEqual({
      key: `cut:${CUT1}`,
      claim: "$15 stands · a $25 raise was refused · $10 not staked",
      note: `Two copies of ${CUT1} named different stakes and the merge would not seat the larger — either no top-up receipt accounted for it, or seating it would have carried this day past its allotment.`,
    });
  });

  it("the breach chip beside the day's stake sum is the same decision, as a string", () => {
    expect(cfbBreachChip({ bucket: "core", sum: 180, cap: 150, over: 30 })).toBe("$180 of $150 · $30 over");
    expect(cfbBreachChip({ bucket: "fun", sum: 50, cap: 25, over: 25 })).toBe("$50 of $25 · $25 over");
  });
});

/* ==========================================================================================
 * A REFUSED RIVAL CARD IS DISCLOSED (INSTRUCTION 45, defect B2, 2026-09-06).
 *
 * WHAT WENT WRONG. `unionCore` in src/lib/ledger-merge.ts names on `betConflict` every shared core
 * id whose two copies fail `sameBet` — the copies are two DIFFERENT locks sharing an id namespace
 * — and on that finding its `appendable` list is emptied, so the append pass is refused wholesale
 * for the date. `mergeDay` carries the ids onto the merged day for as long as they are still
 * seated — `stillBetConflict`, its `betConflict` filtered by `seatedCore` — and warns on the
 * console. NOTHING READ IT. On a day whose only marker is a bet
 * conflict, `cfbDayMarks` returned null and the card said nothing at all — a rival card was
 * refused, tickets from the other copy were not appended, and Josh's screen showed a normal day.
 *
 * WHAT IS PINNED. The reader now carries the ids on `rivals`, gated the way the cuts are — only
 * while the id is STILL SEATED on the day, which is the kernel's own rule above, so a marker that
 * names a ticket the card no longer carries claims nothing.
 * ======================================================================================== */

describe("cfb-card-ui — a refused rival card is disclosed (B2)", () => {
  it("a bet conflict alone is enough to disclose a day that used to read as unmarked", () => {
    const m = marks({ core: [seat(RIVAL1, 30)], betConflict: [RIVAL1] })!;
    expect(m, "a day whose ONLY marker is a bet conflict used to return null").not.toBeNull();
    expect(m.rivals).toEqual([RIVAL1]);
    expect(m.breaches).toEqual([]);
    expect(m.drops).toEqual([]);
    expect(m.cuts).toEqual([]);
  });

  it("it renders in the same visual language as the other markers, last in the list", () => {
    const d = cfbDayDisclosure(
      dayWith({
        core: [seat(RIVAL1, 30), seat(CORE1, 15)],
        stakeConflict: { [CORE1]: { kept: 15, refused: 25 } },
        betConflict: [RIVAL1],
      }),
    )!;
    expect(d.lines.map((l) => l.key)).toEqual([`cut:${CORE1}`, `bet:${RIVAL1}`]);
    expect(d.lines[1]).toEqual({
      key: `bet:${RIVAL1}`,
      claim: cfbRivalLine(RIVAL1),
      note: "Rival cards are never mixed, so nothing from that copy was added to this day.",
    });
    expect(cfbRivalLine(RIVAL1)).toBe(`${RIVAL1} · another copy names a DIFFERENT bet — this device's ticket stands`);
  });

  it("more than one rival id discloses one line each, in id order", () => {
    const m = marks({ core: [seat(CORE2, 30), seat(CORE1, 30)], betConflict: [CORE2, CORE1] })!;
    expect(m.rivals).toEqual([CORE1, CORE2]);
  });

  it("a stale or malformed bet-conflict marker mints no line", () => {
    expect(marks({ betConflict: [RIVAL1] }), "the id is not seated on this day at all").toBeNull();
    expect(marks({ core: [seat(RIVAL1, 30)], betConflict: [] }), "an empty list is not a conflict").toBeNull();
    expect(marks({ core: [seat(RIVAL1, 30)], betConflict: "rival" }), "a malformed marker is not a marker").toBeNull();
  });
});

/* ==========================================================================================
 * THE THREE MONEY PROPERTIES, RE-PINNED THROUGH THE PURE FUNCTION (INSTRUCTION 45, B3,
 * 2026-09-06). (a) an ungraded dropped wager books no P/L and READS as not-yet-graded; (b) a day
 * whose only receipts are ungraded leaves the P/L figure ABSENT, not zero — the summary's span
 * does not render at all; (c) every money figure the card mints is derived from the tickets on the
 * day, never from a stored summary the last merge measured.
 * ======================================================================================== */

describe("cfb-card-ui — the money on the disclosure comes from the day, not from a summary (B3)", () => {
  it("(a) an ungraded drop books nothing and says so in its own row", () => {
    const d = cfbDayDisclosure(dayWith({ funDropped: [FUN2], funDroppedPL: { [FUN2]: { result: "pending", payout: 0, stake: 25 } } }))!;
    expect(d.drops!.rows).toEqual([{ id: FUN2, result: "pending", tone: "text-live", text: "$25 fun · pending — not graded yet, no P/L booked" }]);
    expect(d.drops!.rows[0].text, "a $0.00 payout on a wager that may not have kicked off").not.toMatch(/pays/);
  });

  it("(b) a day whose only receipts are ungraded has NO P/L figure — not a zero", () => {
    const d = cfbDayDisclosure(
      dayWith({
        funDropped: [FUN1, FUN2],
        funDroppedPL: { [FUN1]: { result: "ungradable", payout: 0, stake: 25 }, [FUN2]: { result: "pending", payout: 0, stake: 25 } },
      }),
    )!;
    expect(d.drops!.count, "both are still counted beside the summary").toBe(2);
    expect(d.drops!.settledPl, "absent, so the span never renders — $0.00 would read as a settled break-even").toBeNull();
  });

  it("(c) the breach sum follows the tickets when the stored marker disagrees with them", () => {
    const stale = { core: tix(6, 30, "core"), capBreach: { core: { sum: 999, cap: 150 } } };
    expect(cfbDayDisclosure(dayWith(stale))!.lines[0].claim).toBe("Core money is $180 against this day's $150 allotment — $30 over.");
    expect(cfbBreachChip(cfbDayMarks(dayWith(stale))!.breaches[0])).toBe("$180 of $150 · $30 over");
  });

  it("(c) the cut is measured against the seated stake, not against the marker's `kept`", () => {
    const d = cfbDayDisclosure(dayWith({ core: [seat(CORE1, 10)], stakeConflict: { [CORE1]: { kept: 15, refused: 25 } } }))!;
    expect(d.lines[0].claim, "the ticket says $10; the marker's stale `kept` said $15").toBe("$10 stands · a $25 raise was refused · $15 not staked");
  });
});

/* ==========================================================================================
 * THE CLOSING ROUND — A REFUSAL MUST EXPLAIN ITSELF TRUTHFULLY (INSTRUCTION 45, defects U1/U2/U3,
 * 2026-09-06). Josh verbatim: "Parlay Lab CFB should've been running the same $150 per day
 * theoretical Core money and $25 Fun money per day".
 *
 * U1 — THE CARD PRINTED A FALSE EXPLANATION. `unionCore` (src/lib/ledger-merge.ts) writes the
 * `conflict` record — republished by `mergeDay` as the day's `stakeConflict` — from TWO different
 * branches, both grepped this turn against the kernel as it now stands, after this same round
 * narrowed the rival refusal:
 *     · the RECEIPTLESS rule — the chain's last `else`, reached when no `topUp` receipt accounts
 *       for the difference and no id on the day is disputed; it records the smaller stake as
 *       `kept` and the larger as `refused`; and
 *     · the KEPT-MINE rule — written from more than one arm above it, it keeps `mine`, the BASE
 *       card's own stake, and records the other copy's as `refused`.
 * (Named by symbol rather than quoted line for line: a quoted expression goes stale the moment the
 * kernel is edited, and this file shipped exactly such a stale quote last round — INSTRUCTION 45,
 * the false-citation pattern, 2026-09-06. The kernel restructured these very arms again DURING this
 * round, which is the argument in one sentence.) Only the FIRST is about a missing receipt. The
 * second is reached on RIVAL CARDS, where no receipt is consulted, and also when a VALID receipt is
 * read and then overruled because seating the raise would carry the projected core past `cap` — and
 * `kept` is then the base's stake, which is the LARGER of the two whenever the base holds the
 * larger. The card asserted "with no top-up receipt" over every one of these, so a refusal whose receipt was read, accepted and then overruled by the $150
 * desk was explained to Josh as a receipt that did not exist. Nothing on the wire says which rule
 * minted a marker — same `{ kept, refused }` shape, same channel, unioned across both input days —
 * so the note names the two possible reasons as a DISJUNCTION and asserts neither of a given
 * marker.
 *
 * U2 — THE HEADING OVER THE REFUSED WAGERS SAID "CAP", and this round made that provably false.
 * `unionCore` now files a receipt for the core tickets it discards because the two copies are RIVAL
 * CARDS — read this turn: on a non-empty `betConflict` it walks `unseen`, pushing each id onto
 * `dropped` and filing `receiptOf(...)` beside it on `droppedPL` (symbols, not a quoted line: the
 * quote that stood here collapsed three statements onto one line and matched nothing in the file)
 * — and those land on the SAME two channels the cap's refusals use, `coreDropped` /
 * `coreDroppedPL`, which `cfbDayMarks` already unions. No cap is consulted on that path, and
 * nothing on the wire tells a cap refusal from a rival one. "Dropped by the cap" over such a row is
 * the same class of false explanation as U1, so the heading became a decided VALUE naming what is
 * true of every receipt on the list: the merge refused it. The block below pins BOTH halves — the
 * heading's exact string, and that a rival-refused core wager surfaces in that list with its money.
 *
 * U3 — A DAY CAN NOW REOPEN. The merge can withdraw a verdict, taking a day from `done: true` back
 * to `done: false` with a ticket's grade gone. The day-card summary's arithmetic was inline in the
 * JSX, so no test in this suite could see what such a day renders. It is a pure function now, and
 * the reopened day is pinned by value: not settled, counted as pending, and NO P/L figure — the
 * card shows "1 pending", not a loss and not a blank.
 * ======================================================================================== */

const T1 = `cfb-${DAY}-core-11`;
const T2 = `cfb-${DAY}-core-12`;
const tkt = (id: string, stake: number) => seat(id, stake) as unknown as import("@/lib/cfb/types").CfbTicket;
const grading = (tickets: Record<string, { result: string; payout: number }>, done: boolean) =>
  ({ tickets, legs: {}, done }) as unknown as Parameters<typeof cfbDaySettlement>[1];

describe("cfb-card-ui — the refused-raise note is true of EVERY refusal the kernel can produce (U1)", () => {
  const line = () =>
    cfbDayDisclosure(dayWith({ core: [seat(CUT1, 15)], stakeConflict: { [CUT1]: { kept: 15, refused: 25 } } }))!.lines[0];

  it("never ASSERTS a missing top-up receipt — a rival-pair refusal can have read a valid one", () => {
    expect(line().note, "the old note said `with no top-up receipt` of every refusal, including ones whose receipt the allotment overruled").not.toMatch(/with no top-up receipt/i);
  });

  it("names the OTHER reason the kernel can refuse a raise for, so neither is asserted alone", () => {
    const note = line().note;
    expect(note, "`unionCore` weighs an accepted `topUp` lift against `cap` before seating it — a valid receipt the $150 desk overrules lands on this same channel").toMatch(/past its allotment/i);
    expect(note, "the two reasons are offered as alternatives, not as a verdict on which applied").toMatch(/either .* or /i);
  });

  it("never states the rule as `the smaller stake stands` — the kept-mine rule keeps THIS card's stake", () => {
    expect(line().note, "the kept-mine rule keeps `mine`, which is the base's stake and not necessarily the smaller").not.toMatch(/smaller stake stands/i);
  });

  it("states both reasons and leaves the figures to the claim", () => {
    expect(line()).toEqual({
      key: `cut:${CUT1}`,
      claim: "$15 stands · a $25 raise was refused · $10 not staked",
      note: `Two copies of ${CUT1} named different stakes and the merge would not seat the larger — either no top-up receipt accounted for it, or seating it would have carried this day past its allotment.`,
    });
  });
});

describe("cfb-card-ui — the refused-wager list's heading is true of every receipt on it (U2)", () => {
  it("the heading is a decided value that does not blame a cap the kernel may not have applied", () => {
    const d = cfbDayDisclosure(dayWith({ coreDropped: [CORE1], coreDroppedPL: { [CORE1]: { result: "lost", payout: 0, stake: 25 } } }))!;
    expect(d.drops!.label).toBe("Refused by the merge · 1");
    expect(d.drops!.label, "a rival card's appends are refused with no cap involved").not.toMatch(/cap/i);
  });

  it("a core wager refused beside a rival card reaches the surface in the same list, in the same language", () => {
    const d = cfbDayDisclosure(
      dayWith({
        core: [seat(RIVAL1, 30)],
        betConflict: [RIVAL1],
        coreDropped: [CORE1],
        coreDroppedPL: { [CORE1]: { result: "pending", payout: 0, stake: 25 } },
      }),
    )!;
    expect(d.lines.map((l) => l.key)).toEqual([`bet:${RIVAL1}`]);
    expect(d.drops).toEqual({
      label: "Refused by the merge · 1",
      count: 1,
      settledPl: null,
      rows: [{ id: CORE1, result: "pending", tone: "text-live", text: "$25 core · pending — not graded yet, no P/L booked" }],
    });
  });

  it("the heading still carries the settled P/L beside it, and only when something settled", () => {
    const settled = cfbDayDisclosure(dayWith({ coreDropped: [CORE1], coreDroppedPL: { [CORE1]: { result: "won", payout: 60, stake: 25 } } }))!;
    expect(settled.drops!.label).toBe("Refused by the merge · 1");
    expect(settled.drops!.settledPl).toBe("+$35.00");
  });
});

/* ==========================================================================================
 * A RECEIPT WITHOUT ITS NAME IS STILL MONEY THAT LEFT THE DAY (INSTRUCTION 45, defect U1,
 * 2026-09-06) — A MUTATION SURVIVOR, NOT A CODE DEFECT.
 *
 * `dropsIn` (src/components/cfb/CfbLedger.tsx) unions the `*Dropped` ID LIST with the keys of the
 * `*DroppedPL` RECEIPT map, because either channel can carry an id the other does not: the kernel
 * writes both together, but a day reaches this reader after merges, imports and partial writes,
 * and a receipt with no name is a wager whose money is on the day with nothing to list it under.
 * Only the NAME half was pinned. MEASURED by mutation: deleting the receipt keys from that union —
 * `[...new Set(named)]` in place of `[...new Set([...named, ...Object.keys(receipts)])]` — passed
 * the whole of this file and every other file importing the component. Under that mutant a day
 * carrying `coreDroppedPL` alone returns drops [] and dropPl null, so `cfbDayMarks` returns NULL,
 * the note never renders, and refused money a device still shows — with its settled P/L — is
 * invisible. THE CODE IS CORRECT; the pin was missing. These are that pin, taken through the same
 * pure disclosure the card renders.
 * ======================================================================================== */

describe("cfb-card-ui — a receipt with no name is still disclosed (U1)", () => {
  it("a settled CORE receipt whose id is on no `coreDropped` list discloses a row and its P/L", () => {
    const e = dayWith({ coreDroppedPL: { [CORE1]: { result: "won", payout: 60, stake: 25 } } });
    const m = cfbDayMarks(e);
    expect(m, "the day has no `coreDropped` at all — under the one-sided reader this day is unmarked").not.toBeNull();
    expect(m!.drops).toEqual([{ id: CORE1, bucket: "core", result: "won", payout: 60, stake: 25 }]);
    expect(m!.dropPl, "a settled +$35 that would otherwise vanish with the row").toBe(35);
    expect(cfbDayDisclosure(e)!.drops).toEqual({
      label: "Refused by the merge · 1",
      count: 1,
      settledPl: "+$35.00",
      rows: [{ id: CORE1, result: "won", tone: "text-pos", text: "$25 core · won · pays $60.00" }],
    });
  });

  it("the FUN bucket's receipt half is unioned the same way", () => {
    const d = cfbDayDisclosure(dayWith({ funDroppedPL: { [FUN1]: { result: "lost", payout: 0, stake: 25 } } }))!;
    expect(d.drops!.rows).toEqual([{ id: FUN1, result: "lost", tone: "text-neg", text: "$25 fun · lost · pays $0.00" }]);
    expect(d.drops!.settledPl).toBe("-$25.00");
  });

  it("the two channels are UNIONED, not intersected — a named id and an unnamed receipt both show", () => {
    const m = cfbDayMarks(dayWith({
      coreDropped: [CORE2],
      coreDroppedPL: { [CORE1]: { result: "won", payout: 60, stake: 25 } },
    }))!;
    expect(m.drops.map((d) => d.id), "sorted, one row per id, neither channel dropping the other's").toEqual([CORE1, CORE2]);
    expect(m.drops[1], "the named id with no receipt reads as ungraded, exactly as before").toEqual({ id: CORE2, bucket: "core", result: null, payout: null, stake: null });
    expect(m.dropPl).toBe(35);
  });
});

describe("cfb-card-ui — a day that REOPENS reads as ungraded, not as a loss or a blank (U3)", () => {
  const two = [tkt(T1, 25), tkt(T2, 25)];

  it("a fully graded day settles and books its P/L", () => {
    const s = cfbDaySettlement(two, grading({ [T1]: { result: "won", payout: 60 }, [T2]: { result: "lost", payout: 0 } }, true));
    expect(s).toEqual({ pending: 0, settledStaked: 50, returned: 60, pl: 10, settled: true });
  });

  it("a verdict the merge withdrew puts the day back to PENDING — the card shows no figure at all", () => {
    const s = cfbDaySettlement(two, grading({ [T1]: { result: "won", payout: 60 } }, false));
    expect(s.settled, "settled is what gates the P/L figure; false renders `1 pending` instead").toBe(false);
    expect(s.pending, "the ticket whose verdict is gone is not graded, so it is pending").toBe(1);
  });

  it("a day whose every verdict was withdrawn books nothing and reads as wholly ungraded", () => {
    const s = cfbDaySettlement(two, grading({}, false));
    expect(s).toEqual({ pending: 2, settledStaked: 0, returned: 0, pl: 0, settled: false });
  });

  it("an empty bucket is not a settled break-even", () => {
    expect(cfbDaySettlement([], null).settled, "$0.00 on a day with no tickets in this bucket would read as a graded push").toBe(false);
  });

  it("an ungradable or pending verdict is pending money, exactly as it was before this extraction", () => {
    const s = cfbDaySettlement(two, grading({ [T1]: { result: "ungradable", payout: 0 }, [T2]: { result: "pending", payout: 0 } }, true));
    expect(s).toEqual({ pending: 2, settledStaked: 0, returned: 0, pl: 0, settled: false });
  });

  it("a push returns the stake, so a pushed day settles at zero", () => {
    const s = cfbDaySettlement([tkt(T1, 25)], grading({ [T1]: { result: "push", payout: 0 } }, true));
    expect(s).toEqual({ pending: 0, settledStaked: 25, returned: 25, pl: 0, settled: true });
  });

  it("the day card renders that decision and computes none of it itself", () => {
    const src = stripComments(read("src/components/cfb/CfbLedger.tsx"));
    expect(src, "the summary is the decided value").toMatch(/cfbDaySettlement\(tix, g\)/);
    expect(src, "the pending branch is what a reopened day renders").toMatch(/\{pending\} pending/);
  });
});

/* ==========================================================================================
 * THE TYPE-LEVEL CLOSURE, GIVEN A STANDING TEST (INSTRUCTION 45, defect U5, 2026-09-06).
 *
 * WHAT IT GUARDS. A merge marker is a RECEIPT FOR REFUSED MONEY, and the failure mode that has
 * cost this desk the most is a marker nobody reads: a kernel writing `capBreech`, a card reading
 * `funDropedPL`. `CfbLedgerEntry` (src/lib/cfb/types.ts) declares all seven and wraps its base in
 * the `NoIndex` mapped type, which drops `SyncEntry`'s `[k: string]: unknown` from the CFB entry —
 * so a misspelled OUTER name is a compile error on both ends instead of a brand-new string-keyed
 * member that typechecks and renders nothing.
 *
 * WHY IT HAD NO TEST, AND WHY THIS ONE IS SHAPED LIKE THIS. The closure's only proof was a
 * scratchpad probe that was deleted with the scratchpad. It cannot be a runtime assertion — there
 * is nothing to observe at runtime; the whole point is that the code never compiles. And it cannot
 * be a bare `@ts-expect-error` in this file either: tsconfig.json lists "tests" in its `exclude`,
 * so `npx tsc --noEmit` never reads this file, and vitest transpiles without typechecking. So the
 * test drives the TypeScript compiler itself (the `typescript` package, already a dependency) over
 * probe sources held in memory — nothing is written to the repo — and asserts the diagnostics.
 *
 * IT IS PROVED BY CONTRAST, so it cannot pass vacuously: the same misspelling is compiled against
 * the OPEN shape the entry used to have (`SyncEntry & { … }`), where it must produce NO error. If
 * `NoIndex` were removed from `CfbLedgerEntry`, the closed cases would go green like the control
 * and every one of the seven assertions below would fail.
 * ======================================================================================== */

describe("cfb-card-ui — the type-level closure: a misspelled marker name does not compile (U5)", () => {
  /** the seven merge markers, each beside the typo a reader would actually make */
  const TYPOS: [string, string][] = [
    ["coreDropped", "coreDroped"],
    ["coreDroppedPL", "coreDropedPL"],
    ["funDropped", "funDroped"],
    ["funDroppedPL", "funDropedPL"],
    ["stakeConflict", "stakeConflicts"],
    ["betConflict", "betConflicts"],
    ["capBreach", "capBreech"],
  ];
  /** a well-typed value for each marker, so the OK probe fails on the NAME and nothing else */
  const VALUE: Record<string, string> = {
    coreDropped: `["a"]`,
    coreDroppedPL: `{ a: { result: "won", payout: 60, stake: 25 } }`,
    funDropped: `["a"]`,
    funDroppedPL: `{ a: { result: "lost", payout: 0, stake: 25 } }`,
    stakeConflict: `{ a: { kept: 10, refused: 25 } }`,
    betConflict: `["a"]`,
    capBreach: `{ core: { sum: 175, cap: 150 } }`,
  };

  it("every one of the seven marker names is closed — and the open shape proves the check has teeth", async () => {
    const ts = (await import("typescript")).default;
    const head = `import type { CfbLedgerEntry } from "@/lib/cfb/types";\ndeclare const e: CfbLedgerEntry;\n`;
    const openHead = `import type { SyncEntry } from "@/lib/ledger-merge";\ndeclare const o: SyncEntry & { coreDropped?: string[] };\n`;
    const files: Record<string, string> = {
      [path.join(ROOT, "__marker-ok.ts")]: head + TYPOS.map(([ok]) => `e.${ok} = ${VALUE[ok]};`).join("\n"),
      /* the CONTROL: the same typo against the index-signature shape the entry used to have */
      [path.join(ROOT, "__marker-open.ts")]: openHead + `o.coreDroped = ["a"];`,
    };
    for (const [, bad] of TYPOS) files[path.join(ROOT, `__marker-${bad}.ts`)] = head + `e.${bad} = ${VALUE[TYPOS.find(([, b]) => b === bad)![0]]};`;

    const options: import("typescript").CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: ROOT,
      paths: { "@/*": ["./src/*"] },
      types: [],
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    };
    const host = ts.createCompilerHost(options, true);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fn, lv, oe, sc) => (files[fn] ? ts.createSourceFile(fn, files[fn], lv, true) : getSourceFile(fn, lv, oe, sc));
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (fn) => (files[fn] ? true : fileExists(fn));
    const readFile = host.readFile.bind(host);
    host.readFile = (fn) => (files[fn] ? files[fn] : readFile(fn));

    const program = ts.createProgram(Object.keys(files), options, host);
    const diags = ts.getPreEmitDiagnostics(program);
    const errorsIn = (base: string) =>
      diags
        .filter((d) => d.file?.fileName.endsWith(base))
        .map((d) => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);

    /* the seven correct spellings, with well-typed values, compile clean */
    expect(errorsIn("__marker-ok.ts"), "a correctly spelled marker write must still compile").toEqual([]);
    /* each typo is a compile error naming the property */
    for (const [ok, bad] of TYPOS) {
      const errs = errorsIn(`__marker-${bad}.ts`);
      expect(errs.length, `\`${bad}\` (for \`${ok}\`) compiled with no error — the entry's index signature is back`).toBeGreaterThan(0);
      expect(errs.join(" "), `the error must be about the NAME \`${bad}\``).toContain(bad);
    }
    /* the control: the identical typo against the OPEN shape is silently accepted, which is what
       the closure removes — if this ever errors, the contrast above proves nothing */
    expect(errorsIn("__marker-open.ts"), "the index-signature shape swallows the same typo — that is the defect NoIndex closed").toEqual([]);
  });
});
