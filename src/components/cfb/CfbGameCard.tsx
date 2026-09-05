"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { EdgeMeter } from "@/components/ui/EdgeMeter";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { KellyChip } from "@/components/ui/KellyChip";
import { fmtLine } from "@/lib/cfb/model";
import { CFB_MODEL } from "@/lib/cfb/rules";
import type { CfbGame, CfbMarketKey, CfbQuote, CfbRow } from "@/lib/cfb/types";
import { fmtAmerican, fmtPct } from "@/lib/format";
import { TeamMark } from "./TeamMark";

/**
 * CFB GAME CARD (INSTRUCTION 38, 2026-09-05): one game, every priced side. The header is the
 * matchup (away @ home — or "vs" on a neutral site — with ranks, records, the kickoff or the
 * live clock or the final score, TV and venue); under it the three markets sit side by side as
 * a 3-column grid, two cells each (away/home, away/home, over/under): the side's line, Caesars'
 * price, the EV chip at Caesars, the letter grade, the model's fair price and the ¼-Kelly stake.
 * Expanded, every side gets an edge meter (model vs de-vigged market) and the model's parts are
 * printed in full — the three P(home) inputs and their blend, the expected margin and total, the
 * book counts, FPI for both teams, and each side's best / DK / FD / Pinnacle quotes.
 *
 * Every figure is the board's own (the route built it from the feeds). A missing one is "—":
 * an unmatched game shows ESPN's embedded line as CONTEXT, labelled as such, and prices nothing.
 */

const BOOK_SHORT: Record<string, string> = {
  williamhill_us: "Caesars",
  draftkings: "DK",
  fanduel: "FD",
  pinnacle: "Pinnacle",
  betmgm: "MGM",
  betrivers: "BetRivers",
  bovada: "Bovada",
  fanatics: "Fanatics",
  betonlineag: "BetOnline",
  lowvig: "LowVig",
  mybookieag: "MyBookie",
  betus: "BetUS",
  williamhill: "Will Hill",
  unibet_us: "Unibet",
  ballybet: "Bally",
  espnbet: "ESPN Bet",
  hardrockbet: "Hard Rock",
};

/** A short book name for chips ("DK", "Caesars"); the feed's own title for books the map lacks. */
export function bookShort(q: Pick<CfbQuote, "book" | "title">): string {
  return BOOK_SHORT[q.book] ?? q.title;
}

const PT = "America/Los_Angeles";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: PT, hour: "numeric", minute: "2-digit", hour12: true });

/** "9:00 AM" — the Pacific kickoff time on its own (the Games view groups by it). */
export function timeLabelPT(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? timeFmt.format(new Date(t)) : "—";
}

/** "+18.4" / "-2.1" / "0.0" */
export function fmtSigned(n: number, dp = 1): string {
  const s = n.toFixed(dp);
  return n > 0 ? `+${s}` : s;
}

export const pctOrDash = (p: number | null | undefined, dp = 1): string => (p == null ? "—" : fmtPct(p, dp));
export const numOrDash = (n: number | null | undefined, dp = 1): string => (n == null ? "—" : n.toFixed(dp));

export type MarketSides = {
  ml: { away: CfbRow | null; home: CfbRow | null };
  spread: { away: CfbRow | null; home: CfbRow | null };
  total: { over: CfbRow | null; under: CfbRow | null };
};

/** The game's rows keyed by market and side (null where the market has no consensus). */
export function marketSides(game: CfbGame): MarketSides {
  const find = (m: CfbMarketKey, s: CfbRow["side"]) => game.rows.find((r) => r.market === m && r.side === s) ?? null;
  return {
    ml: { away: find("ml", "away"), home: find("ml", "home") },
    spread: { away: find("spread", "away"), home: find("spread", "home") },
    total: { over: find("total", "over"), under: find("total", "under") },
  };
}

/** The rows in display order: ML away/home, spread away/home, total over/under. */
export function orderedRows(game: CfbGame): CfbRow[] {
  const s = marketSides(game);
  return [s.ml.away, s.ml.home, s.spread.away, s.spread.home, s.total.over, s.total.under].filter((r): r is CfbRow => !!r);
}

/** "UNT +40.5" · "IU ML" · "O 56.5" — the compact cell label (abbreviations, not names). */
export function cellLabel(row: CfbRow, game: CfbGame): string {
  if (row.market === "total") return `${row.side === "over" ? "O" : "U"} ${row.line ?? "—"}`;
  const team = row.side === "home" ? game.home : game.away;
  if (row.market === "ml") return `${team.abbr} ML`;
  return `${team.abbr} ${row.line == null ? "—" : fmtLine(row.line)}`;
}

/** A book's quote as text: the price, plus its own line when it differs from the row's consensus line. */
export function quoteText(q: CfbQuote | null, row: CfbRow): string {
  if (!q) return "—";
  const differs = row.market !== "ml" && q.line != null && row.line != null && Math.abs(q.line - row.line) > 1e-9;
  return differs ? `${fmtAmerican(q.price)} @ ${row.market === "spread" ? fmtLine(q.line!) : q.line}` : fmtAmerican(q.price);
}

/** The header's status block: kickoff, live clock, FINAL, or PPD. */
export function StatusMark({ game, className = "" }: { game: CfbGame; className?: string }) {
  if (game.status === "live") {
    const text = game.detail ?? (game.period != null ? `Q${game.period}${game.clock ? ` ${game.clock}` : ""}` : "LIVE");
    return (
      <span className={`inline-flex items-center gap-1.5 text-live ${className}`}>
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
        <span className="num">{text}</span>
      </span>
    );
  }
  if (game.status === "final") return <span className={`text-text ${className}`}>{game.detail && /OT/i.test(game.detail) ? game.detail.toUpperCase() : "FINAL"}</span>;
  if (game.status === "postponed") return <span className={`text-gold ${className}`}>{game.detail?.toUpperCase() ?? "POSTPONED"}</span>;
  return <span className={`num text-text ${className}`}>{game.detail ?? timeLabelPT(game.start)}</span>;
}

/* ---------- the card ---------- */

export function CfbGameCard({
  game,
  expanded,
  onToggle,
  onPick,
  isPicked,
  className = "",
}: {
  game: CfbGame;
  expanded: boolean;
  onToggle: () => void;
  /** when given, every priced side becomes a tappable pick (the Parlay Builder sandbox) */
  onPick?: (row: CfbRow) => void;
  /** lights a picked side */
  isPicked?: (row: CfbRow) => boolean;
  className?: string;
}) {
  const sides = marketSides(game);
  const scored = game.status === "live" || game.status === "final";
  const homeWon = game.status === "final" && game.homeScore != null && game.awayScore != null && game.homeScore > game.awayScore;
  const awayWon = game.status === "final" && game.homeScore != null && game.awayScore != null && game.awayScore > game.homeScore;
  const unmatched = game.oddsEventId == null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  const meta: ReactNode[] = [];
  if (game.tv) meta.push(<span key="tv">{game.tv}</span>);
  if (game.venue) meta.push(<span key="venue">{game.venue}</span>);
  if (game.espnLine && (game.espnLine.details || game.espnLine.spread != null || game.espnLine.total != null)) {
    const parts = [
      game.espnLine.details ?? (game.espnLine.spread != null ? `${game.home.abbr} ${fmtLine(game.espnLine.spread)}` : null),
      game.espnLine.total != null ? `O/U ${game.espnLine.total}` : null,
    ].filter(Boolean);
    meta.push(
      <span key="espn" className={unmatched ? "text-cfb" : ""} title="ESPN's embedded line — context only, not a priced quote">
        ESPN line {parts.join(" · ")}
      </span>,
    );
  }

  return (
    <article className={`glass card-lift min-w-0 overflow-hidden ${className}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={onKey}
        className="press cursor-pointer select-none px-4 pb-3 pt-3.5 outline-none focus-visible:ring-2 focus-visible:ring-cfb/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <TeamLine team={game.away} score={scored ? game.awayScore : null} scored={scored} winner={awayWon} loser={homeWon} />
            <TeamLine team={game.home} score={scored ? game.homeScore : null} scored={scored} winner={homeWon} loser={awayWon} prefix={game.neutral ? "vs" : "@"} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">
            <StatusMark game={game} />
            <div className="flex items-center gap-1">
              {game.neutral && (
                <span className="rounded-full border border-cfb/40 bg-cfb/10 px-1.5 py-px text-[8.5px] font-bold tracking-[0.14em] text-cfb">Neutral</span>
              )}
              <span className="text-[9.5px] font-medium normal-case tracking-normal text-faint">{expanded ? "Less ▴" : "Model ▾"}</span>
            </div>
          </div>
        </div>
        {(meta.length > 0 || unmatched) && (
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] leading-snug text-faint">
            {unmatched && <span className="text-cfb">No odds-feed match — nothing priced</span>}
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {(i > 0 || unmatched) && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.05] px-3 pb-3 pt-2.5">
        {game.rows.length === 0 ? (
          <div className="py-2 text-center text-[11px] text-faint">
            {unmatched ? "The odds feed has no event for this game yet." : "No market has a consensus yet (two books at a line are needed)."}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            <MarketCol title="ML" top={sides.ml.away} bottom={sides.ml.home} topFallback={`${game.away.abbr} ML`} bottomFallback={`${game.home.abbr} ML`} game={game} onPick={onPick} isPicked={isPicked} />
            <MarketCol title="Spread" top={sides.spread.away} bottom={sides.spread.home} topFallback={game.away.abbr} bottomFallback={game.home.abbr} game={game} onPick={onPick} isPicked={isPicked} />
            <MarketCol title="Total" top={sides.total.over} bottom={sides.total.under} topFallback="Over" bottomFallback="Under" game={game} onPick={onPick} isPicked={isPicked} />
          </div>
        )}
      </div>

      {expanded && <Expanded game={game} />}
    </article>
  );
}

function TeamLine({
  team,
  score,
  scored,
  winner,
  loser,
  prefix,
}: {
  team: CfbGame["home"];
  score: number | null;
  scored: boolean;
  winner: boolean;
  loser: boolean;
  prefix?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {prefix ? <span className="w-3 shrink-0 text-center text-[10px] font-bold text-faint">{prefix}</span> : <span className="w-3 shrink-0" aria-hidden />}
      <TeamMark team={team} size="md" showRank showAbbr={false} />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={`truncate text-[13.5px] font-semibold ${loser ? "text-muted" : "text-text"}`}>
          {team.rank != null && <span className="num mr-1 text-[10.5px] font-bold text-cfb">#{team.rank}</span>}
          {team.short}
        </span>
        <span className="num shrink-0 text-[10.5px] text-faint">{team.record ?? ""}</span>
      </div>
      {scored && <span className={`num shrink-0 text-[20px] font-bold leading-none ${winner ? "text-text" : "text-muted"}`}>{score ?? "—"}</span>}
    </div>
  );
}

function MarketCol({
  title,
  top,
  bottom,
  topFallback,
  bottomFallback,
  game,
  onPick,
  isPicked,
}: {
  title: string;
  top: CfbRow | null;
  bottom: CfbRow | null;
  topFallback: string;
  bottomFallback: string;
  game: CfbGame;
  onPick?: (row: CfbRow) => void;
  isPicked?: (row: CfbRow) => boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 px-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-faint">{title}</div>
      <div className="space-y-1.5">
        <SideCell row={top} fallback={topFallback} game={game} onPick={onPick} picked={top != null && !!isPicked?.(top)} />
        <SideCell row={bottom} fallback={bottomFallback} game={game} onPick={onPick} picked={bottom != null && !!isPicked?.(bottom)} />
      </div>
    </div>
  );
}

function SideCell({ row, fallback, game, onPick, picked }: { row: CfbRow | null; fallback: string; game: CfbGame; onPick?: (row: CfbRow) => void; picked: boolean }) {
  if (!row) {
    return (
      <div className="rounded-[10px] border border-dashed border-white/[0.06] px-2 py-1.5">
        <div className="truncate text-[11px] font-semibold text-faint">{fallback}</div>
        <div className="num mt-1 text-[12px] text-faint">—</div>
        <div className="mt-1 text-[9.5px] text-faint">no line</div>
      </div>
    );
  }
  const czDiffers = row.cz != null && row.market !== "ml" && row.cz.line != null && row.line != null && Math.abs(row.cz.line - row.line) > 1e-9;
  const lit = (row.evCz ?? -1) > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className={`truncate text-[11px] font-semibold ${row.playable ? "text-text" : "text-muted"}`}>{cellLabel(row, game)}</span>
        <GradeChip grade={row.grade} basis="EV @ Caesars" />
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className={`num text-[13px] font-bold leading-none ${row.cz ? "text-gold" : "text-faint"}`}>
          {row.cz ? fmtAmerican(row.cz.price) : "—"}
          {czDiffers && <span className="ml-0.5 text-[9px] font-medium text-cfb" title="Caesars' own line differs from the consensus line">@{row.market === "spread" ? fmtLine(row.cz!.line!) : row.cz!.line}</span>}
        </span>
        {row.evCz != null ? <EvBadge ev={row.evCz} /> : <span className="text-[10px] text-faint">no CZ</span>}
      </div>
      <div className="num mt-1 flex items-center justify-between gap-1 text-[9.5px] leading-none text-muted">
        <span title={`Model: ${fmtPct(row.fair)} to win${row.push > 0 ? `, ${fmtPct(row.push)} push` : ""}`}>fair {fmtAmerican(row.fairAm)}</span>
        {row.playable ? <KellyChip stake={row.kelly} className="scale-90 origin-right" /> : <span className="text-faint">{game.status === "upcoming" ? "—" : "closed"}</span>}
      </div>
    </>
  );
  const tone = picked
    ? "border-cfb/70 bg-cfb/15 shadow-[0_0_16px_-6px_rgba(245,165,36,0.6)]"
    : lit
      ? "border-pos/30 bg-pos/[0.07]"
      : "border-white/[0.06] bg-white/[0.03]";
  if (onPick) {
    return (
      <button
        type="button"
        onClick={() => onPick(row)}
        aria-pressed={picked}
        aria-label={`${row.label} at Caesars ${row.cz ? fmtAmerican(row.cz.price) : "unpriced"}`}
        className={`press block w-full rounded-[10px] border px-2 py-1.5 text-left transition-colors ${tone} hover:bg-white/[0.06]`}
      >
        {body}
      </button>
    );
  }
  return <div className={`rounded-[10px] border px-2 py-1.5 ${tone}`}>{body}</div>;
}

/* ---------- expanded: the model, in full ---------- */

function Expanded({ game }: { game: CfbGame }) {
  const m = game.model;
  const p = m.parts;
  const rows = orderedRows(game);
  const hfaNote = game.neutral ? "neutral site, no HFA" : `HFA +${CFB_MODEL.hfa}`;
  return (
    <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-cfb">The model</div>
      <dl className="num mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11.5px] leading-snug sm:grid-cols-2">
        <Line k={`P(${game.home.abbr} wins)`}>
          <span className="text-muted">Market {pctOrDash(p.mkt)} · Spread {pctOrDash(p.spread)} · FPI {pctOrDash(p.fpi)}</span>
          <span className="text-text"> → {pctOrDash(m.pHome)}</span>
        </Line>
        <Line k="Expected margin">
          <span className="text-text">{m.muMargin == null ? "—" : `${game.home.abbr} ${fmtSigned(m.muMargin)}`}</span>
          <span className="text-muted">
            {" "}
            (market {p.mktMargin == null ? "—" : fmtSigned(p.mktMargin)} · FPI {p.fpiMargin == null ? "—" : fmtSigned(p.fpiMargin)}) · σ {m.sigma}
          </span>
        </Line>
        <Line k="Expected total">
          <span className="text-text">{numOrDash(m.muTotal)}</span>
          <span className="text-muted"> · σ {m.sigmaTotal}</span>
        </Line>
        <Line k="Books behind the consensus">
          <span className="text-muted">
            ML {m.books.ml} · Spread {m.books.spread} · Total {m.books.total}
            {m.books.ml < CFB_MODEL.minBooks || m.books.spread < CFB_MODEL.minBooks || m.books.total < CFB_MODEL.minBooks ? ` · under ${CFB_MODEL.minBooks} = no market` : ""}
          </span>
        </Line>
        <Line k="ESPN FPI">
          <span className="text-muted">
            {game.home.abbr} {game.home.fpi == null ? "—" : fmtSigned(game.home.fpi)}
            {game.home.fpiRank != null ? ` (#${game.home.fpiRank})` : ""} · {game.away.abbr} {game.away.fpi == null ? "—" : fmtSigned(game.away.fpi)}
            {game.away.fpiRank != null ? ` (#${game.away.fpiRank})` : ""} · {hfaNote}
          </span>
        </Line>
      </dl>

      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <RowDetail key={r.key} row={r} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function RowDetail({ row, game }: { row: CfbRow; game: CfbGame }) {
  const lit = (row.evCz ?? -1) > 0;
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${lit ? "border-pos/25 bg-pos/[0.05]" : "border-white/[0.06] bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold text-text">
          <GradeChip grade={row.grade} basis="EV @ Caesars" />
          <span className="truncate">{cellLabel(row, game)}</span>
        </span>
        <span className="num shrink-0 text-[10.5px] text-muted">
          fair {fmtAmerican(row.fairAm)} · {fmtPct(row.fair)}
          {row.push > 0 ? ` · push ${fmtPct(row.push)}` : ""}
        </span>
      </div>
      <EdgeMeter fair={row.fair} mkt={row.mkt} tone="cfb" className="mt-2" />
      <div className="num mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <span>
          CZ <span className={row.cz ? "text-gold" : "text-faint"}>{quoteText(row.cz, row)}</span>
          {row.evCz != null && <EvBadge ev={row.evCz} className="ml-1 scale-90" />}
        </span>
        <span>
          Best <span className="text-text">{quoteText(row.best, row)}</span>
          {row.best && <span className="ml-1 text-[9.5px] text-faint">{bookShort(row.best)}</span>}
          {row.evBest != null && <span className="ml-1 text-faint">({row.evBest > 0 ? "+" : ""}{row.evBest.toFixed(1)}%)</span>}
        </span>
        <span>DK {quoteText(row.dk, row)}</span>
        <span>FD {quoteText(row.fd, row)}</span>
        <span>Pin {quoteText(row.pin, row)}</span>
        <span className="text-faint">{row.books} book{row.books === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
