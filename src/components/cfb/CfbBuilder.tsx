"use client";

import { useEffect, useMemo, useState } from "react";
import { useCfbDesk as useCfbSlateDesk } from "@/components/cfb/CfbBoard";
import { CfbTicketCard, cfbGradingOf, cfbTicketsOf } from "@/components/cfb/CfbTicketCard";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { buildCfbCard } from "@/lib/cfb/card";
import { ptDateOf } from "@/lib/cfb/dates";
import { cfbExposureOn } from "@/lib/cfb/ledger";
import { CFB_BANK_BASE, CFB_PAPER, CFB_RULES } from "@/lib/cfb/rules";
import { useCfbLedger } from "@/lib/cfb/store";
import { syncCfbNow } from "@/lib/cfb/sync";
import type { CfbLedgerEntry, CfbSlate } from "@/lib/cfb/types";
import { fmtEv } from "@/lib/format";
import { railLabel } from "@/lib/games";

/**
 * CFB BUILDER (INSTRUCTION 38, 2026-09-05): the College Football card desk. Loads the slate
 * for a date (Friday can build Saturday — the lock is per slate date), runs `buildCfbCard`
 * over it with the CFB paper allotment ($150 core + $25 fun) and the CFB bankroll, shows the
 * core tickets and the fun parlay as perforated slips, the builder's notes and the benched
 * sides, and locks the card into the CFB ledger — its own record, its own bank, never the
 * MLB one. A day with nothing playable is recorded as NO-PLAY (a locked entry with an
 * empty core) so the ledger shows the desk sat out rather than forgot.
 *
 * Every figure on this page is the slate's or the card's own; a missing one renders "—".
 */

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
 * The slate desk shared by the Builder and the sandbox — the Board's own date + slate hook
 * (src/components/cfb/CfbBoard.tsx), shaped for these views. That hook starts on today
 * (Pacific), advances ONCE to the next slate date when today's slate arrives with no games
 * — Friday builds Saturday's card — keys the query on the concrete date and waits for the
 * device's CFB bankroll to mount before the first fetch, so the Board, the Builder and the
 * sandbox share one cached fetch per 4-minute window and never fetch at the base figure.
 */
export function useCfbDesk() {
  const { today, date, pick, rail, bankroll, q, slate } = useCfbSlateDesk();
  /** the slate for the picked date only — anything else (rail mid-switch) reads as loading */
  const current: CfbSlate | null = slate && slate.date === date ? slate : null;
  return {
    today,
    date,
    dates: rail,
    pick,
    slate: current,
    /** the base until the device store mounts; the real figure right after */
    bankroll: bankroll ?? CFB_BANK_BASE,
    loading: q.isPending || (slate != null && current == null && !q.isError),
    fetching: q.isFetching,
    error: q.error,
    refetch: () => void q.refetch(),
  };
}

/** The CFB paper-mode banner — the MLB PaperBanner's shape in the CFB amber, its own dates and dollars. */
export function CfbPaperBanner() {
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-panel) border border-cfb/40 bg-cfb/10 px-4 py-2.5 text-[12px] text-cfb"
      role="note"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]">🏈 CFB paper</span>
      <span className="num">
        · ${CFB_PAPER.daily} core + ${CFB_PAPER.fun} fun per slate day since {CFB_PAPER.since} · separate ledger &amp; bank
      </span>
    </div>
  );
}

function sumStakes(tix: { stake: number }[]): number {
  return tix.reduce((s, t) => s + t.stake, 0);
}

function lockedLine(entry: CfbLedgerEntry): string {
  if (entry.noPlay) return "NO-PLAY recorded — nothing staked. The day stands in the CFB ledger.";
  return `Card locked — $${sumStakes(entry.core)} core + $${sumStakes(entry.funT)} fun recorded to the CFB ledger. Grades post as games go final.`;
}

function gradeSummary(entry: CfbLedgerEntry): string | null {
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
  const parts = [`${w} won`, `${l} lost`];
  if (p) parts.push(`${p} push`);
  if (v) parts.push(`${v} void`);
  if (pend) parts.push(`${pend} pending`);
  return `${parts.join(" · ")}${g.done ? "" : " — still grading"}`;
}

export function CfbBuilder() {
  const { today, date, dates, pick, slate, bankroll, loading, fetching, error, refetch } = useCfbDesk();
  const { entries, lock } = useCfbLedger();
  const [status, setStatus] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* the card excludes games that have kicked off — keep `now` honest while the tab is open */
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const locked = useMemo(() => entries.find((e) => e.date === date) ?? null, [entries, date]);
  const lockedCore = useMemo(() => (locked ? cfbTicketsOf(locked, "core") : []), [locked]);
  const lockedFun = useMemo(() => (locked ? cfbTicketsOf(locked, "fun") : []), [locked]);
  const lockedGrading = locked ? cfbGradingOf(locked) : null;
  const exposure = cfbExposureOn(entries, date);
  const card = useMemo(
    () => (slate ? buildCfbCard(slate, { bankroll, daily: CFB_PAPER.daily, fun: CFB_PAPER.fun, now }) : null),
    [slate, bankroll, now],
  );

  const onPick = (d: string) => {
    setStatus(null);
    pick(d);
  };

  const doLock = () => {
    if (!card || !slate || locking) return;
    setLocking(true);
    try {
      const { entry, refused } = lock(card, slate);
      setStatus(refused ? `Already locked for ${dayLabel(entry.date, today)} — the first lock stands.` : lockedLine(entry));
      void syncCfbNow();
    } finally {
      setLocking(false);
    }
  };

  const label = dayLabel(date, today);
  const bankTone = bankroll >= CFB_BANK_BASE ? "pos" : "neg";

  return (
    <div>
      <CfbPaperBanner />
      <DateRail dates={dates} date={date} today={today} onPick={onPick} />

      <Reveal>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Core" value={`$${CFB_PAPER.daily}`} sub="per slate day · counts in P/L" tone="cfb" />
          <StatTile label="Fun" value={`$${CFB_PAPER.fun}`} sub="one favorites parlay" tone="gold" />
          <StatTile
            label="CFB bankroll"
            value={usdFull(bankroll)}
            sub={`$${CFB_BANK_BASE.toLocaleString("en-US")} base + moves + graded P/L`}
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
            action={<span className="num text-[10.5px] text-faint">{locked.date}</span>}
          >
            <p className="text-[12px] text-gold">{lockedLine(locked)}</p>
            {gradeSummary(locked) && <p className="num mt-1 text-[11px] text-muted">{gradeSummary(locked)}</p>}
            {status && status !== lockedLine(locked) && <p className="mt-1 text-[11px] text-muted">{status}</p>}
            {lockedCore.length > 0 && (
              <>
                <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Core money</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {lockedCore.map((t) => (
                    <CfbTicketCard key={t.id} t={t} grade={lockedGrading?.tickets[t.id]} legResults={lockedGrading?.legs} board={slate} />
                  ))}
                </div>
              </>
            )}
            {lockedFun.length > 0 && (
              <div className="mt-4 border-t border-gold/25 pt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Fun money</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {lockedFun.map((t) => (
                    <CfbTicketCard key={t.id} t={t} grade={lockedGrading?.tickets[t.id]} legResults={lockedGrading?.legs} board={slate} />
                  ))}
                </div>
              </div>
            )}
            {locked.noPlay && (
              <p className="mt-3 text-[11px] text-muted">
                No side cleared +{CFB_RULES.minEvPct}% EV at Caesars under {CFB_RULES.maxDec.toFixed(2)} that day — recommended stake $0.
              </p>
            )}
          </Panel>
        </Reveal>
      ) : loading ? (
        <Panel title={`${label}'s card`}>
          <SkeletonRows rows={6} />
        </Panel>
      ) : error ? (
        <ErrorState title="The CFB slate did not load" body={error instanceof Error ? error.message : String(error)} onRetry={refetch} />
      ) : !slate || !card ? (
        <EmptyState title={`No slate for ${label}`} body="Pick another date on the rail." />
      ) : slate.games.length === 0 ? (
        <EmptyState title={`No FBS games on ${label}`} body="Pick a slate day on the rail — Saturday is the card." />
      ) : (
        <Reveal delay={0.05}>
          <Panel
            title={`${label}'s card`}
            action={
              <span className="num text-[10.5px] text-faint">
                {slate.games.length} games{slate.oddsMissing ? " · Caesars prices missing" : ""}
                {fetching ? " · refreshing" : ""}
              </span>
            }
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              Core money <span className="normal-case tracking-normal text-faint">— the main check, counts in net P/L</span>
            </div>

            {card.noPlay ? (
              <div className="mt-3 rounded-[12px] border border-line-2 bg-white/[0.03] px-4 py-4">
                <div className="text-[13px] font-bold text-text">NO-PLAY</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  No playable side clears +{CFB_RULES.minEvPct}% EV at Caesars under {CFB_RULES.maxDec.toFixed(2)} on this slate.
                  Recommended core stake <b className="num text-text">$0</b> — record the day so the ledger shows the desk sat out.
                </p>
              </div>
            ) : (
              <>
                <div className="num mt-1 text-[11px] text-muted">
                  {card.core.length} ticket{card.core.length === 1 ? "" : "s"} · ${card.coreSum} of ${CFB_PAPER.daily} deployed
                  {card.core.length > 0 && ` · avg EV ${fmtEv(card.core.reduce((s, t) => s + t.czEv, 0) / card.core.length)}`}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {card.core.map((t) => (
                    <CfbTicketCard key={t.id} t={t} board={slate} />
                  ))}
                </div>
              </>
            )}

            {card.notes.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11px] leading-snug text-muted">
                {card.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-faint" aria-hidden>
                      ·
                    </span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}

            {card.benched.length > 0 && (
              <details className="group mt-3 rounded-[12px] bg-white/[0.03] px-3 py-2">
                <summary className="cursor-pointer list-none text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                  <span className="mr-1 inline-block transition-transform duration-(--dur-fast) group-open:rotate-90" aria-hidden>
                    ▶
                  </span>
                  Benched · {card.benched.length}
                </summary>
                <ul className="mt-2 space-y-1">
                  {card.benched.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-text">{b.label}</span>
                      <span className="num shrink-0 text-muted">
                        {fmtEv(b.evCz)} <span className="text-faint">· {b.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-4 border-t border-gold/25 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                Fun money <span className="normal-case tracking-normal text-faint">— ${CFB_PAPER.fun} on one favorites parlay</span>
              </div>
              {card.funT.length > 0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {card.funT.map((t) => (
                    <CfbTicketCard key={t.id} t={t} board={slate} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted">
                  No fun parlay today — the builder needs {CFB_RULES.fun.legs.min}–{CFB_RULES.fun.legs.max} favorites paying{" "}
                  {CFB_RULES.fun.minDec}×–{CFB_RULES.fun.maxDec}× combined.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Pill variant="gold" onClick={doLock} disabled={locking} aria-label={card.noPlay ? "Record NO-PLAY" : "Lock card"}>
                {card.noPlay ? "Record NO-PLAY" : "🔒 Lock card"}
              </Pill>
              <span className="num text-[11px] text-muted">
                {card.noPlay ? "Locks the day with $0 staked" : `Locks $${card.coreSum} core + $${card.funSum} fun for ${label}`}
              </span>
            </div>
            {status && <p className="mt-2 text-[11.5px] text-gold">{status}</p>}
          </Panel>
        </Reveal>
      )}
    </div>
  );
}
