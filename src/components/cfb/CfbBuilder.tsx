"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CfbDayMarksNote, cfbDayMarks } from "@/components/cfb/CfbLedger";
import { CfbTicketCard, cfbGradingOf, cfbTicketsOf, type CfbGradingView } from "@/components/cfb/CfbTicketCard";
import { useLeague } from "@/components/football/LeagueContext";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { useShellInsets } from "@/components/props/useShellInsets";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { buildCfbCard } from "@/lib/cfb/card";
import { ptDateOf } from "@/lib/cfb/dates";
import { cfbExposureOn } from "@/lib/cfb/ledger";
import type { CfbCard, CfbLedgerEntry, CfbSlate, CfbTicket } from "@/lib/cfb/types";
import type { DeskHandles, League } from "@/lib/football/league";
import { fmtEv } from "@/lib/format";
import { railLabel } from "@/lib/games";

/**
 * CFB BUILDER (INSTRUCTION 38, 2026-09-05): the College Football card desk. Loads the slate
 * for a date (Friday can build Saturday — the lock is per slate date), runs `buildCfbCard`
 * over it with the CFB paper allotment ($250 core + $25 fun) and the CFB bankroll, shows the
 * core tickets and the fun parlay as perforated slips, the builder's notes and the benched
 * sides, and locks the card into the CFB ledger — its own record, its own bank, never the
 * MLB one. A day with nothing playable is recorded as NO-PLAY (a locked entry with an
 * empty core) so the ledger shows the desk sat out rather than forgot.
 *
 * Every figure on this page is the slate's or the card's own; a missing one renders "—".
 *
 * PHONE-FIRST RELAYOUT (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim: "Builder UI on phone
 * app version is atrocious (screenshot 9/7/26 4:11pm)"). Diagnosis read from the pre-change
 * source; the screenshot was not seen by anyone in the session that made this change. At a
 * 375px viewport the pre-change source put the paper banner, the date rail and FOUR stat tiles
 * in a 2×2 grid on the first screen; the
 * first ticket sat below the fold, as an 82vw carousel slip with a "swipe" hint, and the LOCK
 * button was a wrapped row at the very bottom of a long panel. What changed, phone only (md+
 * keeps the tiles and the carousel it had):
 *   · the four tiles collapse to ONE money strip (Core · Fun · Bank · Exposure) on phones;
 *   · the card's headline (tickets · $ deployed · avg EV) is a three-cell stat row, not prose;
 *   · tickets stack full-width on phones (the .carousel strip survives at md+ — same DOM, the
 *     phone overrides are `max-md:` utilities marked important because globals.css is unlayered);
 *   · a LOCKED day renders a structured block — status pill, money cells, record line — with
 *     `lockedLine`'s sentence kept byte for byte beneath it (tests/cfb-card-ui.test.ts pins it);
 *   · the builder's notes fold into a "Builder notes (N)" details, collapsed by default;
 *   · the LOCK button is a full-width 48px pill in a sticky row that rides the bottom tab bar
 *     (useShellInsets — the same measured inset the props slip uses), so locking never needs a
 *     scroll to the panel's end; on md+ it is the static row it was;
 *   · nothing on this surface is set below 11px any more (was 9.5px / 10px / 10.5px).
 * Every string a test asserts, the lock, NO-PLAY, the refused-lock message and the marks note
 * are unchanged; the layout is the only thing that moved.
 *
 * THE NFL BUILD (2026-09-08, Josh: "NFL needs to be built NOW"): this file is now the SHARED
 * football card desk. Every league-specific handle — the paper allotment, the bank base, the
 * rules, the ledger hook, the slate hook, the sync kick — is read through `useLeague()`
 * (src/components/football/LeagueContext.tsx). The context's default is CFB_DESK, so this
 * component mounted bare (app/builder/page.tsx) is the CFB Builder, byte for byte; mounted
 * under `<LeagueProvider desk={NFL_DESK}>` (src/components/nfl/NflBuilder.tsx) it is the NFL
 * Builder — $350 core + $25 fun, the NFL ledger and bank, `nfl-…` ticket ids, blue accents.
 * The hooks the handles carry (`L.useDesk()`, `L.store.useLedger()`) are called unconditionally:
 * the context value never changes within a mount (a page is one desk for its whole life), so
 * the hook order is stable and the rules of hooks hold. The desk's accent classes are written
 * out literally for both leagues (`ACCENT`) because Tailwind cannot see a template class.
 */

/** the desk's accent utilities — both literals, so Tailwind emits each (H adds `--color-nfl`) */
const ACCENT: Record<League, { text: string; banner: string; rule: string }> = {
  cfb: { text: "text-cfb", banner: "border-cfb/40 bg-cfb/10 text-cfb", rule: "border-cfb/25" },
  nfl: { text: "text-nfl", banner: "border-nfl/40 bg-nfl/10 text-nfl", rule: "border-nfl/25" },
};

/** the Pacific date the desk calls "today" */
export function todayPT(): string {
  return ptDateOf(new Date().toISOString());
}

/** "$2,487.50" / "$2,500" */
export function usdFull(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100) % 100 !== 0;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "Today" for the current Pacific date, else the rail's "Sat 9/6" */
export function dayLabel(date: string, today: string): string {
  return date === today ? "Today" : railLabel(date);
}

/**
 * The slate desk shared by the Builder and the sandbox — the league's own date + slate hook
 * (`L.useDesk()`: src/lib/cfb/useCfbDesk.ts for CFB, its NFL twin under src/lib/nfl), shaped
 * for these views. That hook starts on today (Pacific), advances ONCE to the next slate date
 * when today's slate arrives with no games — Friday builds Saturday's card — keys the query on
 * the concrete date and waits for the device's bankroll to mount before the first fetch, so the
 * Board, the Builder and the sandbox share one cached fetch per 4-minute window and never fetch
 * at the base figure. Reads the desk off LeagueContext (CFB by default).
 */
export function useCfbDesk() {
  const L = useLeague();
  const { today, date, pick, rail, bankroll, q, slate } = L.useDesk();
  /** the slate for the picked date only — anything else (rail mid-switch) reads as loading */
  const current: CfbSlate | null = slate && slate.date === date ? slate : null;
  return {
    today,
    date,
    dates: rail,
    pick,
    slate: current,
    /** the base until the device store mounts; the real figure right after */
    bankroll: bankroll ?? L.bankBase,
    loading: q.isPending || (slate != null && current == null && !q.isError),
    fetching: q.isFetching,
    error: q.error,
    refetch: () => void q.refetch(),
  };
}

/** The football paper-mode banner — the MLB PaperBanner's shape in the desk's accent (CFB amber /
    NFL blue), its own dates and dollars. One line on a phone (INSTRUCTION 46, 2026-09-08): the
    "since" date and the separate-ledger reminder show from sm up; the money never hides. */
export function CfbPaperBanner() {
  const L = useLeague();
  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-(--radius-panel) border ${ACCENT[L.id].banner} px-3.5 py-2 text-[12px] md:mb-4 md:px-4 md:py-2.5`}
      role="note"
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.18em]">🏈 {L.short} paper</span>
      <span className="num">
        · ${L.paper.daily} core + ${L.paper.fun} fun per slate day
        <span className="hidden sm:inline"> since {L.paper.since} · separate ledger &amp; bank</span>
      </span>
    </div>
  );
}

function sumStakes(tix: { stake: number }[]): number {
  return tix.reduce((s, t) => s + t.stake, 0);
}

/** "9:00 AM" in Pacific time for a lock instant */
function ptClock(t: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(new Date(t));
}

/** INSTRUCTION 45 (2026-09-05): a day /api/cfb/lock (or /api/nfl/lock) wrote says so — the server
    locks the card an hour before the first kickoff; the manual LOCK below still refuses an
    already-locked day. `short` names the desk's ledger ("CFB" / "NFL"). */
function lockedLine(entry: CfbLedgerEntry, short: string): string {
  const by = entry.source === "server-lock" ? ` Locked by the server at ${ptClock(entry.lockedAt)} PT.` : "";
  if (entry.noPlay) return `NO-PLAY recorded — nothing staked. The day stands in the ${short} ledger.${by}`;
  return `Card locked — $${sumStakes(entry.core)} core + $${sumStakes(entry.funT)} fun recorded to the ${short} ledger. Grades post as games go final.${by}`;
}

/** the day's ticket verdicts counted up — null until the grader has written anything */
export function gradeCounts(entry: CfbLedgerEntry): { won: number; lost: number; push: number; void: number; pending: number; done: boolean } | null {
  const g = entry.grading;
  if (!g) return null;
  const all = [...entry.core, ...entry.funT];
  let w = 0, l = 0, p = 0, pend = 0, v = 0;
  for (const t of all) {
    const r = g.tickets[t.id]?.result;
    if (r === "won") w++;
    else if (r === "lost") l++;
    else if (r === "push") p++;
    else if (r === "ungradable") v++;
    else pend++;
  }
  return { won: w, lost: l, push: p, void: v, pending: pend, done: g.done };
}

/** "2 won · 1 lost · 1 pending — still grading" — the record line under a locked card */
export function gradeSummary(entry: CfbLedgerEntry): string | null {
  const c = gradeCounts(entry);
  if (!c) return null;
  const parts = [`${c.won} won`, `${c.lost} lost`];
  if (c.push) parts.push(`${c.push} push`);
  if (c.void) parts.push(`${c.void} void`);
  if (c.pending) parts.push(`${c.pending} pending`);
  return `${parts.join(" · ")}${c.done ? "" : " — still grading"}`;
}

/** the mean Caesars EV across the card's core tickets, or null on an empty core */
export function avgCoreEv(card: Pick<CfbCard, "core">): number | null {
  if (card.core.length === 0) return null;
  return card.core.reduce((s, t) => s + t.czEv, 0) / card.core.length;
}

/**
 * The manual LOCK, as a value (INSTRUCTION 46, 2026-09-08 — split out of the click handler so
 * the phone tests can drive it without a DOM): calls the store's `lock` exactly once with the
 * card and its slate, and returns the line the panel prints — the refusal when a lock already
 * stands for the day (INSTRUCTION 45: "the first lock stands"), else `lockedLine` for the entry
 * that was written. `short` is the desk's ledger name ("CFB" by default, "NFL" on that desk).
 */
export function lockOutcome(
  lock: (card: CfbCard, slate: CfbSlate) => { entry: CfbLedgerEntry; refused: boolean },
  card: CfbCard,
  slate: CfbSlate,
  today: string,
  short = "CFB",
): string {
  const { entry, refused } = lock(card, slate);
  return refused ? `Already locked for ${dayLabel(entry.date, today)} — the first lock stands.` : lockedLine(entry, short);
}

/**
 * The day's tickets. On md+ the Caesars-style "boost card" carousel (INSTRUCTION 40): one snap
 * per card, 340px wide, the .carousel strip from globals.css. On a phone the same element
 * STACKS full-width (INSTRUCTION 46, 2026-09-08): the 82vw slip-and-a-peek plus a "swipe" hint
 * is the likeliest culprit — diagnosis read from the pre-change source; screenshot not seen —
 * and the MLB builder already stacks its tickets on phones. The phone overrides are `max-md:` utilities marked important because
 * globals.css is unlayered (its `.carousel { display:flex; overflow-x:auto; scroll-snap-type }`
 * would otherwise beat any layered Tailwind utility); the bleed (`-mx-5 px-5`) is md+ only so a
 * stacked slip sits inside the panel's own padding. `label` names the list for the screen reader.
 */
function TicketStack({
  tickets,
  board,
  grading,
  label,
}: {
  tickets: CfbTicket[];
  board: CfbSlate | null;
  grading?: CfbGradingView | null;
  label: string;
}) {
  return (
    <div className="carousel max-md:flex-col! max-md:overflow-visible! max-md:snap-none! md:-mx-5 md:px-5" role="list" aria-label={label}>
      {tickets.map((t) => (
        <div key={t.id} role="listitem" className="max-md:w-full md:w-[340px]">
          <CfbTicketCard t={t} grade={grading?.tickets[t.id]} legResults={grading?.legs} board={board} />
        </div>
      ))}
    </div>
  );
}

/**
 * one cell of the phone money strip / the card's headline row — label over a tabular figure.
 * `sub` is an optional 11px line under the figure ("/ $150"): a 3-across row at 375px leaves
 * ~89px per cell, and "$150 / $150" at 18px mono bold measures ~114px, so the big figure holds
 * only the number that matters and the denominator drops to the sub-line. The figure is mono
 * (`.num`), never `display` — money reads as tabular digits.
 */
function StatCell({ label, value, sub, tone = "text-text", size = "md" }: { label: string; value: string; sub?: string; tone?: string; size?: "sm" | "md" }) {
  return (
    <div className="min-w-0 px-1.5 py-2 text-center">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`num mt-0.5 font-bold leading-none ${size === "sm" ? "text-[13px] truncate" : "text-[18px] tracking-tight whitespace-nowrap"} ${tone}`}>{value}</div>
      {sub && <div className="num mt-1 text-[11px] leading-none text-muted">{sub}</div>}
    </div>
  );
}

/**
 * THE PHONE MONEY STRIP (INSTRUCTION 46, 2026-09-08): the four stat tiles as one row — Core ·
 * Fun · Bank · Exposure — so the first screen at 375px reaches the card. md+ keeps the tiles.
 * The figures are the tiles' own: the paper allotment, the desk's bankroll, the day's exposure.
 * The group is named for its desk ("CFB money" / `cfb-money-strip`, "NFL money" / `nfl-money-strip`).
 */
function MoneyStrip({ L, bankroll, bankTone, exposure }: { L: DeskHandles; bankroll: number; bankTone: "pos" | "neg"; exposure: number }) {
  return (
    <div
      className="mb-3 grid grid-cols-4 divide-x divide-white/[0.06] rounded-[14px] border border-line-2 bg-surface-2/60 md:hidden"
      role="group"
      aria-label={`${L.short} money`}
      data-testid={`${L.id}-money-strip`}
    >
      <StatCell label="Core" value={`$${L.paper.daily}`} tone={ACCENT[L.id].text} size="sm" />
      <StatCell label="Fun" value={`$${L.paper.fun}`} tone={ACCENT[L.id].text} size="sm" />
      <StatCell label="Bank" value={usdFull(bankroll)} tone={bankTone === "pos" ? "text-pos" : "text-neg"} size="sm" />
      <StatCell label="Exposure" value={`$${exposure}`} tone="text-muted" size="sm" />
    </div>
  );
}

/** the small "▶ Heading (N)" summary line every folded section on this surface uses */
function FoldSummary({ children }: { children: ReactNode }) {
  return (
    <summary className="flex min-h-[40px] cursor-pointer list-none items-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
      <span className="mr-1.5 inline-block transition-transform duration-(--dur-fast) group-open:rotate-90" aria-hidden>
        ▶
      </span>
      {children}
    </summary>
  );
}

/**
 * A LOCKED DAY AS A STRUCTURED BLOCK (INSTRUCTION 46, 2026-09-08): status pill (LOCKED /
 * NO-PLAY, plus the server clock when /api/cfb/lock wrote the day), the money as cells (core ·
 * fun · record), then `lockedLine`'s sentence exactly as it stood — that `<p>` is pinned byte
 * for byte by tests/cfb-card-ui.test.ts ("an unmarked day keeps the chrome it has today").
 */
function LockedSummary({ locked, today, L }: { locked: CfbLedgerEntry; today: string; L: DeskHandles }) {
  const record = gradeSummary(locked);
  const server = locked.source === "server-lock";
  return (
    <div className="rounded-[14px] border border-gold/30 bg-gold/[0.06] px-3.5 py-3" data-testid="cfb-locked-summary">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
          {locked.noPlay ? "No-play" : "Locked"}
        </span>
        {server && (
          <span className="num rounded-full border border-line-2 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-muted">
            Server · {ptClock(locked.lockedAt)} PT
          </span>
        )}
        <span className="num ml-auto text-[11px] text-faint">{dayLabel(locked.date, today)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-white/[0.06] rounded-[12px] bg-white/[0.03]">
        <StatCell label="Core" value={locked.noPlay ? "$0" : `$${sumStakes(locked.core)}`} tone="text-pos" />
        <StatCell label="Fun" value={`$${sumStakes(locked.funT)}`} tone={ACCENT[L.id].text} />
        <StatCell label="Record" value={record ? `${gradeCounts(locked)!.won}–${gradeCounts(locked)!.lost}` : "—"} tone="text-text" />
      </div>
      <div className="mt-2">
        <p className="text-[12px] text-gold">{lockedLine(locked, L.short)}</p>
      </div>
      {record && (
        <p className="num mt-1 text-[11px] text-muted" data-testid="cfb-locked-record">
          {record}
        </p>
      )}
    </div>
  );
}

export function CfbBuilder() {
  /* the desk (CFB by default; NFL under NflBuilder's provider) — fixed for the mount, so the
     hooks it hands out below are called in one stable order */
  const L = useLeague();
  const c = ACCENT[L.id];
  const { today, date, dates, pick, slate, bankroll, loading, fetching, error, refetch } = useCfbDesk();
  const { entries, lock } = L.store.useLedger();
  const [status, setStatus] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /* the bottom tab bar's measured height (0 on md+) — the sticky LOCK row rides just above it */
  const insets = useShellInsets();

  /* the card excludes games that have kicked off — keep `now` honest while the tab is open */
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const locked = useMemo(() => entries.find((e) => e.date === date) ?? null, [entries, date]);
  const lockedCore = useMemo(() => (locked ? cfbTicketsOf(locked, "core") : []), [locked]);
  const lockedFun = useMemo(() => (locked ? cfbTicketsOf(locked, "fun") : []), [locked]);
  const lockedGrading = locked ? cfbGradingOf(locked) : null;
  /* INSTRUCTION 45 (defect D1, 2026-09-06): `lockedLine` above states the day's money ("$180 core
     + $25 fun recorded"), and until this shipped nothing said when that figure was OVER the $150
     allotment or that the merge had deleted a fun ticket to fit. `cfbDayMarks` reads the merge's
     own markers and returns null for a day carrying none, so an unmarked locked card renders
     exactly what it rendered before. The reader and the note live in CfbLedger.tsx because both
     CFB surfaces show a day's money and the marker must read the same on each; the import runs
     THIS way because the Ledger's extra module graph is the ui primitives plus `loadCfbFinals`,
     while the reverse would pull `buildCfbCard` and the Board's slate query into the ledger page.

     BOTH BUCKETS AND BOTH REFUSAL KINDS, WITHOUT A LINE CHANGING HERE (INSTRUCTION 45, defect B2,
     2026-09-06). `cfbDayMarks` was widened this round to read the core-side channels too — a core
     wager the allotment refused (`coreDropped` / `coreDroppedPL`) and a stake raise the merge would
     not seat (`stakeConflict`) — and `CfbDayMarksNote`
     renders them in the breach's own gold sentence and the existing drop list. This surface picks
     both up through the same guarded `lockedMarks` it already had, which is the whole reason the
     reader and the note live in ONE file rather than once per screen.

     AND THE THIRD REFUSAL, ALSO WITHOUT A LINE CHANGING HERE (INSTRUCTION 45, defect B2's second
     half, 2026-09-06). `unionCore` names on `betConflict` every shared core id whose two copies
     mean DIFFERENT bets, and refuses the append pass for the whole date on that finding — so this
     locked card can be MISSING tickets the other copy holds. `cfbDayMarks` now carries those ids
     on `rivals` and the note discloses one gold line each, so the panel whose headline says what
     the day staked also says when a rival card was turned away. Nothing below changes: the day
     either has markers or it does not, and `lockedMarks` is the one guard either way.

     WHAT THE NOTE RENDERS IS NOW A VALUE (INSTRUCTION 45, defect B1, same day). `CfbDayMarksNote`
     no longer decides anything at the JSX — `cfbDisclosureOf` in CfbLedger.tsx settles which lines
     a day discloses and what each says, and tests/cfb-card-ui.test.ts pins that by value rather
     than by matching the markup's spelling. This surface is unaffected: it still hands the note
     the same `CfbDayMarks` it always did.

     AND THE SENTENCES IT RENDERS NOW CLAIM ONLY WHAT THE KERNEL GUARANTEES (INSTRUCTION 45, defect
     U1, same day). The refused-raise note used to blame a missing top-up receipt; `unionCore`
     writes that same marker from a second branch that refuses a raise whose receipt it DID read
     and accept — because seating it would carry the day past its allotment — so the locked card
     here was printing a reason the code had not checked. (That branch was narrowed again inside
     this round, which is why the note names REASONS and not branches.) The wording moved to the rule
     both branches obey, and the refused-wager list's heading stopped blaming the cap for refusals
     the cap did not make. Again nothing below changes — the decision is one function away. */
  const lockedMarks = locked ? cfbDayMarks(locked) : null;
  const exposure = cfbExposureOn(entries, date);
  const card = useMemo(
    () => (slate ? buildCfbCard(slate, { bankroll, daily: L.paper.daily, fun: L.paper.fun, now, rules: L.rules, idPrefix: L.idPrefix }) : null),
    [slate, bankroll, now, L],
  );

  const onPick = (d: string) => {
    setStatus(null);
    pick(d);
  };

  const doLock = () => {
    if (!card || !slate || locking) return;
    setLocking(true);
    try {
      setStatus(lockOutcome(lock, card, slate, today, L.short));
      void L.sync.syncNow();
    } finally {
      setLocking(false);
    }
  };

  const label = dayLabel(date, today);
  const bankTone = bankroll >= L.bankBase ? "pos" : "neg";
  const avgEv = card ? avgCoreEv(card) : null;

  return (
    <div>
      <CfbPaperBanner />
      <DateRail dates={dates} date={date} today={today} onPick={onPick} />

      <Reveal>
        {/* phones: one money strip; md+: the four tiles (INSTRUCTION 46, 2026-09-08) */}
        <MoneyStrip L={L} bankroll={bankroll} bankTone={bankTone} exposure={exposure} />
        <div className="mb-4 hidden gap-3 md:grid md:grid-cols-4" data-testid={`${L.id}-money-tiles`}>
          <StatTile label="Core" value={`$${L.paper.daily}`} sub="per slate day · counts in P/L" tone={L.id} />
          <StatTile label="Fun" value={`$${L.paper.fun}`} sub="one favorites parlay" tone={L.id} />
          <StatTile
            label={`${L.short} bankroll`}
            value={usdFull(bankroll)}
            sub={`$${L.bankBase.toLocaleString("en-US")} base + moves + graded P/L`}
            tone={bankTone}
          />
          <StatTile label="Exposure" value={`$${exposure}`} sub={`locked ${label === "Today" ? "today" : `on ${label}`}`} tone="muted" />
        </div>
      </Reveal>

      {locked ? (
        <Reveal delay={0.05}>
          <Panel
            title={`${label}'s card — LOCKED`}
            className="glow-gold"
            action={<span className="num text-[11px] text-faint">{locked.date}</span>}
          >
            <LockedSummary locked={locked} today={today} L={L} />
            {lockedMarks && <CfbDayMarksNote marks={lockedMarks} />}
            {locked.note && <p className="mt-2 text-[11px] text-muted">{locked.note}</p>}
            {status && status !== lockedLine(locked, L.short) && <p className="mt-2 text-[11px] text-muted">{status}</p>}
            {lockedCore.length > 0 && (
              <>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                  Core money <span className="num normal-case tracking-normal text-faint">· {lockedCore.length}</span>
                </div>
                <div className="mt-2">
                  <TicketStack tickets={lockedCore} board={slate} grading={lockedGrading} label="Locked core tickets" />
                </div>
              </>
            )}
            {lockedFun.length > 0 && (
              <div className={`mt-4 border-t ${c.rule} pt-4`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${c.text}`}>Favorites parlay</div>
                <div className="mt-2">
                  <TicketStack tickets={lockedFun} board={slate} grading={lockedGrading} label="Locked favorites parlay" />
                </div>
              </div>
            )}
            {locked.noPlay && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                No side cleared +{L.rules.minEvPct}% EV at Caesars under {L.rules.maxDec.toFixed(2)} that day — recommended stake $0.
              </p>
            )}
          </Panel>
        </Reveal>
      ) : loading ? (
        <Panel title={`${label}'s card`}>
          <SkeletonRows rows={6} />
        </Panel>
      ) : error ? (
        <ErrorState title={`The ${L.short} slate did not load`} body={error instanceof Error ? error.message : String(error)} onRetry={refetch} />
      ) : !slate || !card ? (
        <EmptyState title={`No slate for ${label}`} body="Pick another date on the rail." />
      ) : slate.games.length === 0 ? (
        <EmptyState title={`No ${L.noun} games on ${label}`} body={L.id === "nfl" ? "Pick a slate day on the rail — Sunday is the card." : "Pick a slate day on the rail — Saturday is the card."} />
      ) : (
        <Reveal delay={0.05}>
          <Panel
            title={`${label}'s card`}
            action={
              <span className="num text-[11px] text-faint">
                {slate.games.length} games{slate.oddsMissing ? " · Caesars prices missing" : ""}
                {fetching ? " · refreshing" : ""}
              </span>
            }
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
              Core money <span className="normal-case tracking-normal text-faint">— the main check, counts in net P/L</span>
            </div>

            {card.noPlay ? (
              <div className="mt-3 rounded-[14px] border border-line-2 bg-white/[0.03] px-4 py-4">
                <div className="display text-[18px] leading-none tracking-tight text-text">NO-PLAY</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  No playable side clears +{L.rules.minEvPct}% EV at Caesars under {L.rules.maxDec.toFixed(2)} on this slate.
                  Recommended core stake <b className="num text-text">$0</b> — record the day so the ledger shows the desk sat out.
                </p>
              </div>
            ) : (
              <>
                {/* the card's headline as a stat row, not a sentence (INSTRUCTION 46, 2026-09-08) */}
                <div
                  className="mt-2 grid grid-cols-3 divide-x divide-white/[0.06] rounded-[12px] bg-white/[0.03]"
                  role="group"
                  aria-label="Core card headline"
                  data-testid="cfb-card-headline"
                >
                  <StatCell label={card.core.length === 1 ? "Ticket" : "Tickets"} value={String(card.core.length)} />
                  <StatCell label="Deployed" value={`$${card.coreSum}`} sub={`/ $${L.paper.daily}`} tone="text-pos" />
                  <StatCell label="Avg EV" value={avgEv == null ? "—" : fmtEv(avgEv)} tone={avgEv != null && avgEv > 0 ? "text-pos" : "text-text"} />
                </div>
                <div className="mt-3">
                  <TicketStack tickets={card.core} board={slate} label="Core tickets" />
                </div>
              </>
            )}

            {card.notes.length > 0 && (
              <details className="group mt-3 rounded-[12px] bg-white/[0.03] px-3" data-testid="cfb-builder-notes">
                <FoldSummary>Builder notes ({card.notes.length})</FoldSummary>
                <ul className="space-y-1.5 pb-3 text-[12px] leading-snug text-muted">
                  {card.notes.map((n, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-faint" aria-hidden>
                        ·
                      </span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {card.benched.length > 0 && (
              <details className="group mt-3 rounded-[12px] bg-white/[0.03] px-3" data-testid="cfb-builder-benched">
                <FoldSummary>Benched ({card.benched.length})</FoldSummary>
                <ul className="space-y-1.5 pb-3">
                  {card.benched.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-text">{b.label}</span>
                      <span className="num shrink-0 text-muted">
                        {fmtEv(b.evCz)} <span className="text-faint">· {b.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className={`mt-4 border-t ${c.rule} pt-4`}>
              <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${c.text}`}>
                Favorites parlay <span className="normal-case tracking-normal text-faint">— ${L.paper.fun} fun money, one ticket</span>
              </div>
              {card.funT.length > 0 ? (
                <div className="mt-3">
                  <TicketStack tickets={card.funT} board={slate} label="Favorites parlay" />
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-muted">
                  No fun parlay today — the builder needs {L.rules.fun.legs.min}–{L.rules.fun.legs.max} favorites paying{" "}
                  {L.rules.fun.minDec}×–{L.rules.fun.maxDec}× combined.
                </p>
              )}
            </div>

            {/* THE LOCK ROW (INSTRUCTION 46, 2026-09-08): on a phone a sticky, bottom-safe box that
                sits `insets.bottom` (the measured tab bar) + 8px above the viewport edge while the
                panel is on screen, with a full-width 48px pill — no scrolling to the panel's end to
                lock. It is the panel's last child, so once the panel's bottom scrolls up the row
                takes its natural place. md+ is the static row it always was. No blur here (the iOS
                compositor rule) — a near-opaque surface tint carries the row over the slips. */}
            <div
              className="sticky z-20 -mx-2 mt-5 rounded-[18px] border border-gold/30 bg-surface/95 p-2 shadow-[0_-10px_28px_-14px_rgba(0,0,0,0.7)] md:static md:mx-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
              style={{ bottom: insets.bottom + 8 }}
              data-testid="cfb-lock-row"
            >
              <div className="flex flex-col gap-1.5 md:flex-row md:flex-wrap md:items-center md:gap-3">
                <Pill
                  variant="gold"
                  className="min-h-[48px] w-full justify-center text-[14px] md:min-h-0 md:w-auto md:text-[12.5px]"
                  onClick={doLock}
                  disabled={locking}
                  aria-label={card.noPlay ? "Record NO-PLAY" : "Lock card"}
                >
                  {card.noPlay ? "Record NO-PLAY" : "🔒 Lock card"}
                </Pill>
                <span className="num text-center text-[11px] text-muted md:text-left">
                  {card.noPlay ? "Locks the day with $0 staked" : `Locks $${card.coreSum} core + $${card.funSum} fun for ${label}`}
                </span>
              </div>
              {status && <p className="mt-2 text-center text-[12px] text-gold md:text-left">{status}</p>}
            </div>
          </Panel>
        </Reveal>
      )}
    </div>
  );
}
