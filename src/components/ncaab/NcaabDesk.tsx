"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ArchiveShelf } from "@/components/shell/ArchiveNotes";
import { american, pct, prob } from "@/lib/anytime/view";
import { AZ_BOOKS, AZ_BOOK_SHORT } from "@/lib/az/books";
import { NCAAB_STALE_MS, loadNcaabSlate, ncaabQueryKey } from "@/lib/ncaab/client";
import { boardRows, type NcaabRow, type NcaabSlate, type NcaabSlateGame, type NcaabTeam } from "@/lib/ncaab/slate";
import { NCAAB_TITLE, dayChips, noLineReason, rowGroups, sectionsOf, slateLine, tabNameOf, tipLabel, type NcaabView } from "@/lib/ncaab/view";
import { pacificDate } from "@/lib/relevant-sport";

/**
 * THE COLLEGE BASKETBALL DESK (2026-11-12, Josh: "Add NCAAB to the site").
 *
 * One component, mounted by DeskGate in place of the app's own page while the switch is on CBB:
 *   Games   every Division I game of the date, with the two books' lines under each one still to tip
 *   Board   every priced selection of the date whose better price beats the two books' fair number
 *   Ledger  where this desk's paper picks are recorded (the any-time record)
 *   other   the tabs this desk does not have yet, said plainly
 *
 * Every number is read from GET /api/ncaab; this file formats and does no arithmetic of its own.
 * It asks on open, on a date change and on Refresh, and never on a timer: the prices are paid for.
 */

const LINK = "press inline-flex min-h-11 items-center justify-center rounded-[10px] border border-white/[0.1] bg-surface-2 px-4 text-[13px] font-bold text-text";
const GRID = "grid grid-cols-[minmax(0,1fr)_3.1rem_3.1rem_3.1rem_3.4rem] items-center gap-x-1";

function Team({ t, lead }: { t: NcaabTeam; lead: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {t.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.logo} alt="" loading="lazy" className="h-5 w-5 shrink-0 object-contain" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full bg-white/[0.06]" aria-hidden />
      )}
      <span className={`min-w-0 truncate text-[13px] ${lead ? "font-bold text-text" : "font-semibold text-text/90"}`}>
        {t.rank != null && <span className="num mr-1 text-[10.5px] font-semibold text-faint">#{t.rank}</span>}
        {t.short}
      </span>
      {t.record && <span className="num shrink-0 text-[10.5px] text-faint">{t.record}</span>}
      {t.score != null && <span className={`num ml-auto shrink-0 text-[15px] ${lead ? "font-bold text-text" : "font-semibold text-muted"}`}>{t.score}</span>}
    </div>
  );
}

function Lines({ rows }: { rows: readonly NcaabRow[] }) {
  return (
    <div className="mt-2 border-t border-white/[0.06] pt-2" data-ncaab-lines>
      <div className={`${GRID} pb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint`}>
        <span />
        {AZ_BOOKS.map((b) => (
          <span key={b} className="text-right">
            {AZ_BOOK_SHORT[b]}
          </span>
        ))}
        <span className="text-right">Fair</span>
        <span className="text-right">Edge</span>
      </div>
      {rowGroups(rows).map((g) => (
        <div key={g.market} className="border-t border-white/[0.04] py-1 first:border-t-0">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</div>
          {g.rows.map((r) => (
            <div key={`${r.market}|${r.side}|${r.line}`} className={`${GRID} min-h-7 text-[12px]`} data-ncaab-row={r.market}>
              <span className="min-w-0 truncate font-semibold text-text/90">{r.selection}</span>
              {AZ_BOOKS.map((b) => (
                <span key={b} className={`num text-right ${r.prices[b] == null ? "text-faint" : r.best.book === b ? "font-bold text-pos" : "text-muted"}`}>
                  {american(r.prices[b])}
                </span>
              ))}
              <span className="num text-right text-muted">{prob(r.fair)}</span>
              <span className={`num text-right font-semibold ${r.ev > 0 ? "text-pos" : "text-faint"}`}>{pct(r.ev)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GameCard({ g, slate }: { g: NcaabSlateGame; slate: NcaabSlate }) {
  const done = g.status === "final";
  const homeLead = done && (g.home.score ?? 0) > (g.away.score ?? 0);
  const awayLead = done && (g.away.score ?? 0) > (g.home.score ?? 0);
  const why = noLineReason(g, slate);
  return (
    <li className="glass px-3 py-2.5 sm:px-4" data-ncaab-game={g.status}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
        <span className={g.status === "live" ? "text-live" : "text-muted"}>{g.status === "upcoming" ? tipLabel(g.start) : g.detail || g.status}</span>
        {g.neutral && <span className="text-faint">Neutral site</span>}
      </div>
      <div className="space-y-1.5">
        <Team t={g.away} lead={awayLead} />
        <Team t={g.home} lead={homeLead} />
      </div>
      {g.rows.length > 0 ? <Lines rows={g.rows} /> : why && <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11.5px] text-faint">{why}</p>}
    </li>
  );
}

function Section({ title, games, slate }: { title: string; games: NcaabSlateGame[]; slate: NcaabSlate }) {
  if (!games.length) return null;
  return (
    <section>
      <h2 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {title} <span className="num text-faint">{games.length}</span>
      </h2>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.id} g={g} slate={slate} />
        ))}
      </ul>
    </section>
  );
}

function Games({ slate }: { slate: NcaabSlate }) {
  const s = sectionsOf(slate.games);
  if (!slate.games.length) return <EmptyState title="No games on this date" body="Pick another day above. The season runs from early November into April." />;
  return (
    <>
      <Section title="In play" games={s.live} slate={slate} />
      <Section title="Still to tip" games={s.upcoming} slate={slate} />
      <Section title="Final" games={s.final} slate={slate} />
      <Section title="Called off" games={s.off} slate={slate} />
    </>
  );
}

function Board({ slate }: { slate: NcaabSlate }) {
  const rows = boardRows(slate);
  if (!rows.length) {
    return (
      <EmptyState
        title={slate.oddsMissing ? "Prices are not loaded right now" : "No price beats the fair number on this date"}
        body="A row lands here when one of the two books pays more than both books' prices, with the vig taken out, say it should. Most days that is a short list, and some days it is empty."
      />
    );
  }
  return (
    <Panel title={`Best prices · ${rows.length}`}>
      <ul>
        {rows.map((r) => (
          <li key={`${r.gameId}|${r.market}|${r.side}|${r.line}`} className="flex items-center gap-3 border-b border-white/[0.06] py-2 last:border-b-0" data-ncaab-board-row>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-text">{r.selection}</div>
              <div className="truncate text-[11px] text-muted">
                {r.event} · {tipLabel(r.start)}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-[13px] font-bold text-text">
                {american(r.best.price)} <span className="text-[10.5px] font-semibold text-muted">{AZ_BOOK_SHORT[r.best.book]}</span>
              </div>
              <div className="num text-[11px] text-muted">fair {prob(r.fair)}</div>
            </div>
            <div className="num w-14 shrink-0 text-right text-[13px] font-bold text-pos">{pct(r.ev)}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LedgerNote() {
  return (
    <>
      <Panel title="Paper picks on this desk">
        <p className="text-[13px] leading-relaxed text-muted">
          College Basketball picks are made and recorded by the any-time engine, beside the NFL and College Football ones: each pick names its book, its price and the other book&apos;s price, and is graded from the final score on its own. The record there
          splits by sport, so this desk&apos;s results stand on their own line.
        </p>
        <div className="mt-3">
          <Link replace href="/anytime" className={LINK}>
            Open the any-time record
          </Link>
        </div>
      </Panel>
      <ArchiveShelf />
    </>
  );
}

function NotHere({ name }: { name: string }) {
  return (
    <Panel>
      <EmptyState
        title={`${name} is not on the College Basketball desk yet`}
        body="This desk has the games with both books' lines, the best-price board and the paper record. The other tabs still belong to the football desks."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link replace href="/games" className={LINK}>
              Games
            </Link>
            <Link replace href="/board" className={LINK}>
              Board
            </Link>
          </div>
        }
      />
    </Panel>
  );
}

export function NcaabDesk({ view }: { view: NcaabView }) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const today = pacificDate();
  const [date, setDate] = useState(today);
  const priced = view === "games" || view === "board";
  const q = useQuery({ queryKey: ncaabQueryKey(date), queryFn: () => loadNcaabSlate(date), staleTime: NCAAB_STALE_MS, enabled: priced, retry: 1 });
  const slate = q.data;

  return (
    <div data-ncaab-desk={view}>
      <PageHeader
        title={NCAAB_TITLE[view]}
        eyebrow="College Basketball"
        sub="Men's Division I, full game, before tip-off. DK and FD are the two books' prices; Fair is both books' prices with the vig taken out; Edge is what the better price is worth against that number. There is no model of its own on this desk, so an edge here is line shopping and nothing more. Prices refresh at most every four minutes. Informational only, not betting advice."
        subMobile={priced && slate ? slateLine(slate) : undefined}
        action={
          priced ? (
            <Pill onClick={() => void qc.invalidateQueries({ queryKey: ncaabQueryKey(date) })} disabled={q.isFetching} aria-label="Refresh the College Basketball slate">
              {q.isFetching ? "Loading…" : "Refresh"}
            </Pill>
          ) : undefined
        }
      />
      {priced && (
        <div className="chip-row mb-2" role="group" aria-label="Date">
          {dayChips(today).map((c) => (
            <FilterPill key={c.date} selected={c.date === date} onClick={() => setDate(c.date)}>
              {c.label}
            </FilterPill>
          ))}
        </div>
      )}
      {view === "ledger" ? (
        <LedgerNote />
      ) : view === "other" ? (
        <NotHere name={tabNameOf(pathname)} />
      ) : q.isError ? (
        <ErrorState title="The slate did not load" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : !slate ? (
        <Panel>
          <SkeletonRows rows={8} />
        </Panel>
      ) : view === "games" ? (
        <Games slate={slate} />
      ) : (
        <Board slate={slate} />
      )}
    </div>
  );
}
