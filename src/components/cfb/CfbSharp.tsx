"use client";

import { useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EdgeMeter } from "@/components/ui/EdgeMeter";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { CFB_MODEL, CFB_PAPER, CFB_RULES } from "@/lib/cfb/rules";
import type { CfbGame, CfbRow } from "@/lib/cfb/types";
import { fmtAmerican, fmtMoney, fmtPct } from "@/lib/format";
import { railLabel } from "@/lib/games";
import { GRADE_CUTS } from "@/lib/grade";
import { rankRows, useCfbDesk, fpiStamp, type BoardRow } from "./CfbBoard";
import { CfbFpiPanel } from "./CfbFpiPanel";
import { bookShort, fmtSigned, numOrDash, pctOrDash, timeLabelPT } from "./CfbGameCard";
import { TeamMark } from "./TeamMark";

/**
 * THE SHARP — CFB (INSTRUCTION 38, 2026-09-05): the explanation desk. Nothing here is a new
 * number: it prints the constants the model runs on (from CFB_MODEL / CFB_RULES, the one copy),
 * reads the day's slate back as a paragraph, lists the best and worst Caesars prices against
 * the model with an edge meter each, tabulates every game's model parts (the three P(home)
 * inputs, the blend, the expected margin and total, σ), shows which books priced the slate,
 * and ends with ESPN's FPI for the day's teams. Setups, not predictions.
 */

type Coverage = { key: "cz" | "dk" | "fd" | "pin"; label: string; games: number };

function coverage(games: CfbGame[]): Coverage[] {
  const has = (g: CfbGame, k: Coverage["key"]) => g.rows.some((r) => r[k] != null);
  const count = (k: Coverage["key"]) => games.filter((g) => has(g, k)).length;
  return [
    { key: "cz", label: "Caesars", games: count("cz") },
    { key: "dk", label: "DraftKings", games: count("dk") },
    { key: "fd", label: "FanDuel", games: count("fd") },
    { key: "pin", label: "Pinnacle", games: count("pin") },
  ];
}

export function CfbSharp() {
  const { today, date, pick, rail, bankroll, q, slate } = useCfbDesk();
  const qc = useQueryClient();

  const ranked = useMemo(() => (slate ? rankRows(slate.games) : []), [slate]);
  const priced = useMemo(() => ranked.filter((r) => r.row.cz != null && r.row.evCz != null), [ranked]);
  const playable = priced.filter((r) => r.row.playable);
  const value = playable.slice(0, 4);
  const trap = priced.length > 0 ? priced[priced.length - 1] : null;
  const plusEv = playable.filter((r) => (r.row.evCz ?? -1) > 0);
  const books = useMemo(() => coverage(slate?.games ?? []), [slate]);
  const teams = useMemo(() => (slate ? slate.games.flatMap((g) => [g.home, g.away]) : []), [slate]);
  const matched = slate ? slate.games.filter((g) => g.oddsEventId != null).length : 0;
  const withMl = slate ? slate.games.filter((g) => g.model.parts.mkt != null).length : 0;
  const withFpi = slate ? slate.games.filter((g) => g.model.parts.fpi != null).length : 0;
  const disagree = useMemo(
    () =>
      (slate?.games ?? [])
        .filter((g) => g.model.pHome != null && g.model.parts.mkt != null)
        .map((g) => ({ g, gap: (g.model.pHome ?? 0) - (g.model.parts.mkt ?? 0) }))
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
        .slice(0, 3),
    [slate],
  );

  const overview = slate
    ? `${slate.games.length} FBS game${slate.games.length === 1 ? "" : "s"} on ${railLabel(date)}: ${matched} matched to the odds feed, ${withMl} with a two-book moneyline consensus, ${withFpi} with FPI on both sides. ` +
      (priced.length === 0
        ? "Caesars has not posted a price the desk can grade yet."
        : `Of ${priced.length} Caesars-priced sides, ${plusEv.length} clear${plusEv.length === 1 ? "s" : ""} the model's fair price and ${
            plusEv.filter((r) => (r.row.evCz ?? 0) >= CFB_RULES.minEvPct).length
          } clear${plusEv.filter((r) => (r.row.evCz ?? 0) >= CFB_RULES.minEvPct).length === 1 ? "s" : ""} the card's +${CFB_RULES.minEvPct}% bar. `) +
      "Every edge below is a gap between a posted price and the blend of the de-vigged market and ESPN FPI — a setup that matches criteria, not a prediction."
    : "";

  const modelCols: Column<CfbGame>[] = useMemo(
    () => [
      {
        key: "game",
        header: "Game",
        stickyLeft: 0,
        sortValue: (g) => Date.parse(g.start),
        cell: (g) => (
          <div className="flex max-w-[176px] items-center gap-2 md:max-w-none">
            <span className="flex shrink-0 -space-x-1.5">
              <TeamMark team={g.away} size="xs" showAbbr={false} className="relative z-[1]" />
              <TeamMark team={g.home} size="xs" showAbbr={false} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-text">
                {g.away.abbr} {g.neutral ? "vs" : "@"} {g.home.abbr}
              </div>
              <div className="num truncate text-[10.5px] text-faint">
                {timeLabelPT(g.start)} · {g.oddsEventId == null ? "unmatched" : `ML ${g.model.books.ml} · SPR ${g.model.books.spread} · TOT ${g.model.books.total}`}
              </div>
            </div>
          </div>
        ),
      },
      { key: "mkt", header: "Market", numeric: true, sortValue: (g) => g.model.parts.mkt ?? -1, cell: (g) => <Pct p={g.model.parts.mkt} /> },
      { key: "spread", header: "Spread", numeric: true, sortValue: (g) => g.model.parts.spread ?? -1, cell: (g) => <Pct p={g.model.parts.spread} /> },
      { key: "fpi", header: "FPI", numeric: true, sortValue: (g) => g.model.parts.fpi ?? -1, cell: (g) => <Pct p={g.model.parts.fpi} /> },
      {
        key: "blend",
        header: "Blend",
        numeric: true,
        sortValue: (g) => g.model.pHome ?? -1,
        cell: (g) => <span className={`num font-semibold ${g.model.pHome == null ? "text-faint" : "text-text"}`}>{pctOrDash(g.model.pHome)}</span>,
      },
      {
        key: "margin",
        header: "μ margin",
        numeric: true,
        sortValue: (g) => g.model.muMargin ?? -999,
        cell: (g) => <span className="num text-muted">{g.model.muMargin == null ? "—" : `${g.home.abbr} ${fmtSigned(g.model.muMargin)}`}</span>,
      },
      { key: "sigma", header: "σ", numeric: true, cell: (g) => <span className="num text-faint">{g.model.sigma}</span> },
      { key: "total", header: "μ total", numeric: true, sortValue: (g) => g.model.muTotal ?? -1, cell: (g) => <span className="num text-muted">{numOrDash(g.model.muTotal)}</span> },
    ],
    [],
  );

  const loading = bankroll == null || q.isPending;

  return (
    <div className="space-y-5">
      <DateRail dates={rail} date={date} today={today} onPick={pick} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text">The CFB read · {railLabel(date)}</div>
          <div className="text-[11px] text-muted">Market + FPI margin model, priced at Caesars. Every constant below is the one the board runs on.</div>
        </div>
        <Pill variant="ghost" className="press" onClick={() => qc.invalidateQueries({ queryKey: ["cfb", "slate"] })} disabled={q.isFetching}>
          {q.isFetching ? "Reading…" : "↻ Refresh read"}
        </Pill>
      </div>

      <Reveal>
        <HowItPrices />
      </Reveal>

      {loading ? (
        <Panel>
          <SkeletonRows rows={7} />
        </Panel>
      ) : q.isError ? (
        <Panel>
          <ErrorState title="Couldn't load the CFB slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !slate || slate.games.length === 0 ? (
        <Panel>
          <EmptyState title={`No FBS games on ${railLabel(date)}`} body="Pick a slate date on the rail — the read follows the board." />
        </Panel>
      ) : (
        <>
          <Reveal>
            <Panel title="The desk's overview">
              <p className="text-[13px] leading-relaxed text-muted">{overview}</p>
              {slate.oddsMissing && (
                <p className="mt-2 text-[12px] text-neg">Scores only this load — the server had no odds feed, so nothing is priced or graded.</p>
              )}
            </Panel>
          </Reveal>

          {value.length > 0 && (
            <Reveal>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Best Caesars prices vs the model</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {value.map((r, i) => (
                  <Spot key={r.row.key} r={r} lit={i === 0 && (r.row.evCz ?? -1) > 0} />
                ))}
              </div>
            </Reveal>
          )}

          {trap && (trap.row.evCz ?? 0) <= GRADE_CUTS.D && (
            <Reveal>
              <Panel title="Worst price on the slate" className="border-neg/20">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-neg">
                  {trap.team && <TeamMark team={trap.team} size="sm" showAbbr={false} />}
                  <span>
                    {trap.row.label} {trap.row.cz ? fmtAmerican(trap.row.cz.price) : "—"} at Caesars
                  </span>
                  <EvBadge ev={trap.row.evCz ?? 0} />
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-muted">
                  The model makes this side {fmtPct(trap.row.fair)} ({fmtAmerican(trap.row.fairAm)} fair)
                  {trap.row.mkt != null ? `; the de-vigged market says ${fmtPct(trap.row.mkt)}` : ""}. Caesars&apos; price gives up{" "}
                  {Math.abs(trap.row.evCz ?? 0).toFixed(1)}% per dollar
                  {trap.row.best && trap.row.best.book !== trap.row.cz?.book ? ` (${fmtAmerican(trap.row.best.price)} is posted at ${bookShort(trap.row.best)})` : ""}. If you
                  like this side anyway, this is the leg a parlay bleeds on.
                </div>
              </Panel>
            </Reveal>
          )}

          {disagree.length > 0 && (
            <Reveal>
              <Panel title="Where the blend leaves the market">
                <div className="space-y-2">
                  {disagree.map(({ g, gap }) => (
                    <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <span className="flex items-center gap-1.5 font-semibold text-text">
                        <TeamMark team={g.home} size="xs" showAbbr={false} />
                        {g.home.short}
                        <span className="text-faint">{g.neutral ? "vs" : "hosts"}</span>
                        {g.away.short}
                      </span>
                      <span className="num text-muted">
                        market {pctOrDash(g.model.parts.mkt)} → blend {pctOrDash(g.model.pHome)}{" "}
                        <span className={gap > 0 ? "text-pos" : gap < 0 ? "text-neg" : "text-muted"}>({fmtSigned(gap * 100)} pts)</span>
                        {g.model.parts.fpi != null ? ` · FPI ${pctOrDash(g.model.parts.fpi)}` : " · no FPI"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                  P(home) in probability points: the moneyline consensus alone vs the {Math.round(CFB_MODEL.blend.mkt * 100)}/{Math.round(CFB_MODEL.blend.spread * 100)}/
                  {Math.round(CFB_MODEL.blend.fpi * 100)} blend with the spread-implied and FPI-implied figures. A big gap is where the desk&apos;s edges come from — and
                  where it is most exposed to FPI being wrong.
                </p>
              </Panel>
            </Reveal>
          )}

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Per-game model · P(home) inputs and the blend</h2>
            <DataTable columns={modelCols} rows={[...slate.games].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))} rowKey={(g) => g.id} maxHeight="56vh" stagger />
          </Reveal>

          <Reveal>
            <Panel title="Book coverage" action={<span className="num text-[10px] text-faint">{slate.games.length} games</span>}>
              <div className="flex flex-wrap gap-2">
                {books.map((b) => (
                  <span
                    key={b.key}
                    className={`num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      b.key === "cz" ? "border-gold/40 bg-gold/10 text-gold" : b.key === "pin" ? "border-cfb/40 bg-cfb/10 text-cfb" : "border-line-2 bg-white/[0.03] text-text"
                    }`}
                  >
                    {b.label}
                    <span className="text-muted">
                      {b.games}/{slate.games.length}
                    </span>
                  </span>
                ))}
                <span className="num inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted">
                  consensus books · ML {sumBooks(slate.games, "ml")} · Spread {sumBooks(slate.games, "spread")} · Total {sumBooks(slate.games, "total")}
                </span>
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                Games each book prices on this slate. Caesars settles every ticket; Pinnacle counts ×{CFB_MODEL.pinnacleWeight} in the consensus median; a
                market needs {CFB_MODEL.minBooks} books at a line to exist at all.
                {slate.unmatched > 0 ? ` ${slate.unmatched} game${slate.unmatched === 1 ? "" : "s"} had no odds-feed event and priced nothing.` : ""}
              </p>
            </Panel>
          </Reveal>

          <Reveal>
            <CfbFpiPanel teams={teams} updated={slate.fpiUpdated} />
          </Reveal>

          <div className="text-[10.5px] leading-relaxed text-faint">
            {slate.fpiUpdated ? `FPI updated ${fpiStamp(slate.fpiUpdated)} (ESPN). ` : "FPI was unavailable for this load. "}
            Prices are The Odds API&apos;s US feed; Caesars is the settlement price and the NV app can differ — confirm at lock. Informational only, not betting
            advice.
          </div>
        </>
      )}
    </div>
  );
}

function sumBooks(games: CfbGame[], k: "ml" | "spread" | "total"): number {
  return games.reduce((n, g) => n + g.model.books[k], 0);
}

function Pct({ p }: { p: number | null }) {
  return <span className={`num ${p == null ? "text-faint" : "text-muted"}`}>{pctOrDash(p)}</span>;
}

function Spot({ r, lit }: { r: BoardRow; lit: boolean }) {
  const { row, game, team } = r;
  return (
    <Panel className={lit ? "glow-pos" : ""}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {team && <TeamMark team={team} size="md" showRank showAbbr={false} />}
          <div className="min-w-0">
            <div className="display truncate text-[15px] text-text">{row.label}</div>
            <div className="truncate text-[11px] text-muted">
              {row.sub}
              {game.neutral ? " · neutral" : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <GradeChip grade={row.grade} basis="EV @ Caesars" />
          {row.cz && <OddsCell odds={row.cz.price} book="caesars" />}
        </div>
      </div>
      <EdgeMeter fair={row.fair} mkt={row.mkt} tone="cfb" className="mt-3" />
      <div className="num mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
        <span className="text-text">fair {fmtAmerican(row.fairAm)}</span>
        {row.evCz != null && <EvBadge ev={row.evCz} />}
        <span className="text-muted">¼-Kelly {row.kelly > 0 ? fmtMoney(row.kelly) : "$0 (no edge)"}</span>
        {row.best && row.best.book !== row.cz?.book && (
          <span className="text-muted">
            best {fmtAmerican(row.best.price)} <span className="text-[9.5px] text-faint">{bookShort(row.best)}</span>
          </span>
        )}
        <span className="text-faint">{row.books} books</span>
      </div>
    </Panel>
  );
}

/* ---------- the constants, printed from the one copy ---------- */

function HowItPrices() {
  const m = CFB_MODEL;
  const r = CFB_RULES;
  return (
    <details className="glass px-5 py-4" open>
      <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">How this desk prices a game</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2.5">
          <Term k={`σ = ${m.sigma} pts`} label="Margin spread">
            FBS final margins scatter about the closing spread with this standard deviation — wider than the NFL&apos;s. A spread (or an FPI gap) becomes a
            win probability through a normal curve with this width; a cover probability at any other line comes from the same curve.
          </Term>
          <Term
            k={
              <>
                σ<sub>T</sub> = {m.sigmaTotal} pts
              </>
            }
            label="Total spread"
          >
            The same idea for game totals: the over/under line and its price imply an expected total; the model prices any other total off that.
          </Term>
          <Term k={`HFA = +${m.hfa}`} label="Home field">
            Added to the FPI margin only — the market&apos;s spread already prices it. Neutral-site games get no HFA.
          </Term>
          <Term k={`${Math.round(m.blend.mkt * 100)} / ${Math.round(m.blend.spread * 100)} / ${Math.round(m.blend.fpi * 100)}`} label="P(home) blend">
            Weights on the de-vigged moneyline consensus, the spread-implied probability and the FPI-implied probability. They renormalize over what exists —
            a game with no moneyline (the −40 blowouts post &quot;OFF&quot;) blends spread + FPI only.
          </Term>
          <Term k={`${Math.round(m.spreadBlend.mkt * 100)} / ${Math.round(m.spreadBlend.fpi * 100)}`} label="Margin blend">
            The expected margin every spread is priced off: mostly the market&apos;s consensus margin, nudged by FPI.
          </Term>
          <Term k={`Pinnacle ×${m.pinnacleWeight} · min ${m.minBooks} books`} label="Consensus">
            Each market&apos;s consensus is a weighted median across books, Pinnacle counting twice as the sharp anchor. Under {m.minBooks} books at a line, the
            market is left blank and nothing is invented.
          </Term>
        </div>
        <div className="space-y-2.5">
          <Term k="Caesars" label="Settlement">
            EV, grade and stake are all at Caesars&apos; own quote at its own line (re-priced when its line differs from the consensus). Other books only
            inform the consensus and the &quot;best&quot; column.
          </Term>
          <Term k={`¼-Kelly · cap ${Math.round(r.kellyCap * 100)}%`} label="Sizing">
            Stake = {r.kellyFrac}× the Kelly fraction at Caesars, capped at {Math.round(r.kellyCap * 100)}% of the CFB bankroll, whole dollars, $0 when the edge is ≤ 0.
            Passing is a position.
          </Term>
          <Term k={`S ≥ +${GRADE_CUTS.S} · A ≥ +${GRADE_CUTS.A} · B ≥ +${GRADE_CUTS.B} · C ≥ ${GRADE_CUTS.C} · D ≥ ${GRADE_CUTS.D} · F`} label="Grades">
            A label on the EV% at Caesars, fixed cutoffs, never curved — most of a retail board is −EV and the grade says so.
          </Term>
          <Term k={`$${CFB_PAPER.daily} core + $${CFB_PAPER.fun} fun`} label="The card">
            Core legs need ≥ +{r.minEvPct}% EV at Caesars and a price ≤ {r.maxDec} decimal; singles and 2-leg cross-game parlays, one leg per game, no two core
            tickets on the same game, {r.tickets.min}–{r.tickets.max} tickets at ${r.minStake}–${r.maxStake} each. The fun ticket is a {r.fun.legs.min}–{r.fun.legs.max}-leg
            favorites parlay at ≥ {r.fun.minDec}× — its own ledger and bank, separate from MLB, since {CFB_PAPER.since}.
          </Term>
          <Term k={`${Math.round(m.matchWindowMs / 3600_000)} h window`} label="Feed matching">
            An ESPN game and an odds event pair by exact name, then a curated alias, then one exact side + token overlap with kickoffs within this window.
            Unmatched games price nothing and show ESPN&apos;s line as context.
          </Term>
        </div>
      </div>
    </details>
  );
}

function Term({ k, label, children }: { k: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-3">
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{label}</div>
        <div className="num text-[12px] font-semibold text-cfb">{k}</div>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
