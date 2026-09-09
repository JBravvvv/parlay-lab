"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { EdgeMeter } from "@/components/ui/EdgeMeter";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { KellyChip } from "@/components/ui/KellyChip";
import { OddsGrid, type OddsGridCell, type OddsGridRow } from "@/components/ui/OddsGrid";
import { fmtLine } from "@/lib/cfb/model";
import { useLeague } from "@/components/football/LeagueContext";
import type { CfbGame, CfbMarketKey, CfbQuote, CfbRow } from "@/lib/cfb/types";
import { fmtAmerican, fmtEv, fmtPct } from "@/lib/format";
import { TeamMark } from "./TeamMark";

/**
 * CFB GAME CARD (INSTRUCTION 38, 2026-09-05; rebuilt on the Caesars grammar, INSTRUCTION 40):
 * one game, every priced side. The header carries the status (kickoff, the live pill + clock,
 * FINAL) and TV; the body is the shared OddsGrid — teams stacked left, Spread / Money / Total
 * cells right, each Caesars' line over Caesars' price, +EV sides lit and listed with their grade,
 * fair price and ¼-Kelly stake. Expanded, every side gets an edge meter (model vs de-vigged market) and the model's parts are
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

/**
 * The Caesars grammar (INSTRUCTION 40, 2026-09-05): the two teams stacked on the left — mark,
 * rank badge, abbreviation, the record (or the FPI rank when there is no record yet) — and a
 * Spread / Money / Total grid on the right, one row per team (Over rides the away row, Under the
 * home row). Every cell is Caesars' line above Caesars' price; a +EV side lights amber ("ev")
 * and is listed under the grid with its grade, EV and ¼-Kelly stake. Live games carry the
 * pulsing pill + clock and the running score beside each team; finals collapse to a score
 * line (the grid closed at kickoff — the model still opens below).
 *
 * A price tap does what the card's own tap did before: with `onPick` (the sandbox) it picks
 * the side; without it the tap opens the model, the same as tapping the header. No navigation.
 */

/** the Caesars price cell for one side, as the OddsGrid wants it */
export function sideCell(
  row: CfbRow | null,
  opts: { picked?: boolean; onClick?: () => void; game: CfbGame },
): OddsGridCell {
  if (!row) return { aria: "no line" };
  const line = row.market === "ml" ? undefined : row.market === "total" ? `${row.side === "over" ? "O" : "U"} ${row.line ?? "—"}` : row.line == null ? "—" : fmtLine(row.line);
  if (!row.cz) return { line, price: "—", tone: "muted", onClick: opts.onClick, selected: opts.picked, aria: `${row.label} — no Caesars price` };
  const czDiffers = row.market !== "ml" && row.cz.line != null && row.line != null && Math.abs(row.cz.line - row.line) > 1e-9;
  const czLine = czDiffers ? (row.market === "spread" ? fmtLine(row.cz.line!) : `${row.side === "over" ? "O" : "U"} ${row.cz.line}`) : line;
  const closed = !row.playable && opts.game.status !== "upcoming";
  const tone: OddsGridCell["tone"] = closed ? "muted" : (row.evCz ?? -1) > 0 ? "ev" : row.cz.price > 0 ? "plus" : "minus";
  return {
    line: czLine,
    price: fmtAmerican(row.cz.price),
    tone,
    selected: opts.picked,
    onClick: opts.onClick,
    aria: `${row.label} at Caesars ${fmtAmerican(row.cz.price)}${row.evCz != null ? `, EV ${fmtEv(row.evCz)}` : ""}${closed ? ", closed" : ""}`,
  };
}

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
  /* the league seam (2026-09-08): the accent classes come off useLeague() — both class strings literal */
  const L = useLeague();
  const nfl = L.id === "nfl";
  const accentText = nfl ? "text-nfl" : "text-cfb";
  const sides = marketSides(game);
  const scored = game.status === "live" || game.status === "final";
  const isFinal = game.status === "final";
  const isLive = game.status === "live";
  const homeWon = isFinal && game.homeScore != null && game.awayScore != null && game.homeScore > game.awayScore;
  const awayWon = isFinal && game.homeScore != null && game.awayScore != null && game.awayScore > game.homeScore;
  const unmatched = game.oddsEventId == null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  /* a price tap: pick the side in the sandbox, else open the model (what the card did before) */
  const tap = (row: CfbRow | null) => (row && onPick ? () => onPick(row) : onToggle);
  const picked = (row: CfbRow | null) => (row != null && !!isPicked?.(row));
  const cell = (row: CfbRow | null) => sideCell(row, { picked: picked(row), onClick: tap(row), game });

  const rows: OddsGridRow[] = [
    {
      key: `${game.id}-away`,
      team: <TeamBlock team={game.away} score={scored ? game.awayScore : null} scored={scored} winner={awayWon} loser={homeWon} />,
      cells: [cell(sides.spread.away), cell(sides.ml.away), cell(sides.total.over)],
    },
    {
      key: `${game.id}-home`,
      team: <TeamBlock team={game.home} score={scored ? game.homeScore : null} scored={scored} winner={homeWon} loser={awayWon} prefix={game.neutral ? "vs" : "@"} />,
      cells: [cell(sides.spread.home), cell(sides.ml.home), cell(sides.total.under)],
    },
  ];

  /* the +EV sides at Caesars, best first — the everyday bettor's "what's the play here" */
  const edges = orderedRows(game)
    .filter((r) => (r.evCz ?? -1) > 0)
    .sort((a, b) => (b.evCz ?? 0) - (a.evCz ?? 0));

  const meta: ReactNode[] = [];
  // the header carries the network for upcoming / final games; live games show it here (the header holds the Live pill)
  if (game.tv && isLive) meta.push(<span key="tv">{game.tv}</span>);
  if (game.venue) meta.push(<span key="venue">{game.venue}</span>);
  if (game.espnLine && (game.espnLine.details || game.espnLine.spread != null || game.espnLine.total != null)) {
    const parts = [
      game.espnLine.details ?? (game.espnLine.spread != null ? `${game.home.abbr} ${fmtLine(game.espnLine.spread)}` : null),
      game.espnLine.total != null ? `O/U ${game.espnLine.total}` : null,
    ].filter(Boolean);
    meta.push(
      <span key="espn" className={unmatched ? accentText : ""} title="ESPN's embedded line — context only, not a priced quote">
        ESPN line {parts.join(" · ")}
      </span>,
    );
  }

  return (
    <article className={`glass card-lift min-w-0 overflow-hidden ${isLive ? "ring-1 ring-live/25" : ""} ${className}`}>
      {/* header: status left (live pill · kickoff · FINAL), neutral tag + model toggle right */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={onKey}
        className={`press flex cursor-pointer select-none items-center justify-between gap-3 px-3.5 pb-1.5 pt-3 outline-none focus-visible:ring-2 ${nfl ? "focus-visible:ring-nfl/60" : "focus-visible:ring-cfb/60"}`}
      >
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-live/40 bg-live/10 px-2 py-0.5 text-live">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
              <span>Live</span>
              <span className="num normal-case tracking-normal">{game.detail ?? (game.period != null ? `Q${game.period}${game.clock ? ` ${game.clock}` : ""}` : "")}</span>
            </span>
          ) : (
            <StatusMark game={game} />
          )}
          {game.neutral && (
            <span className={`rounded-full border px-1.5 py-px text-[8.5px] font-bold tracking-[0.14em] ${nfl ? "border-nfl/40 bg-nfl/10 text-nfl" : "border-cfb/40 bg-cfb/10 text-cfb"}`}>Neutral</span>
          )}
          {game.tv && !isLive && <span className="truncate text-[9.5px] font-medium normal-case tracking-normal text-faint">{game.tv}</span>}
        </div>
        <span className="shrink-0 text-[9.5px] font-medium text-faint">{expanded ? "Less ▴" : "Model ▾"}</span>
      </div>

      <div className="px-3 pb-3">
        {isFinal ? (
          <FinalLine game={game} homeWon={homeWon} awayWon={awayWon} />
        ) : game.rows.length === 0 ? (
          <>
            <div className="space-y-2 py-1">
              {rows.map((r) => (
                <div key={r.key}>{r.team}</div>
              ))}
            </div>
            <div className="mt-2 rounded-[10px] border border-dashed border-white/[0.08] px-3 py-2 text-center text-[10.5px] text-faint">
              {unmatched ? "No odds-feed match yet — nothing priced." : "No market has a consensus yet (two books at a line are needed)."}
            </div>
          </>
        ) : (
          <OddsGrid tone={L.id} columns={["Spread", "Money", "Total"]} rows={rows} />
        )}

        {!isFinal && edges.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Edges at Caesars">
            {edges.map((r) => (
              <li key={r.key} className={`flex items-center gap-2 rounded-[10px] border px-2 py-1 text-[11px] ${nfl ? "border-nfl/25 bg-nfl/[0.06]" : "border-cfb/25 bg-cfb/[0.06]"}`}>
                <GradeChip grade={r.grade} basis="EV @ Caesars" />
                <span className="min-w-0 flex-1 truncate font-semibold text-text">{cellLabel(r, game)}</span>
                <span className="num shrink-0 text-[10px] text-muted">fair {fmtAmerican(r.fairAm)}</span>
                {r.evCz != null && <EvBadge ev={r.evCz} className="scale-90" />}
                {r.playable ? <KellyChip stake={r.kelly} className="origin-right scale-90" /> : <span className="text-[9.5px] text-faint">closed</span>}
              </li>
            ))}
          </ul>
        )}

        {(meta.length > 0 || unmatched) && (
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug text-faint">
            {unmatched && <span className={accentText}>No odds-feed match</span>}
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {(i > 0 || unmatched) && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      {expanded && <Expanded game={game} />}
    </article>
  );
}

/** the team column of a grid row: mark + rank + abbreviation + record/FPI line, the score beside it in play */
function TeamBlock({
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
  const rankText = useLeague().id === "nfl" ? "text-nfl" : "text-cfb";
  const sub = team.record ?? (team.fpiRank != null ? `FPI #${team.fpiRank}` : team.fpi != null ? `FPI ${fmtSigned(team.fpi)}` : null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamMark team={team} size="md" showRank showAbbr={false} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`flex items-baseline gap-1 truncate text-[13px] font-bold ${loser ? "text-muted" : "text-text"}`}>
          {prefix && <span className="text-[9px] font-bold text-faint">{prefix}</span>}
          {team.rank != null && <span className={`num text-[10px] font-bold ${rankText}`}>#{team.rank}</span>}
          <span className="truncate">{team.abbr}</span>
        </div>
        <div className="num truncate text-[10px] text-faint">{sub ?? team.short}</div>
      </div>
      {scored && <span className={`num shrink-0 pr-1 text-[18px] font-bold leading-none ${winner ? "text-text" : "text-muted"}`}>{score ?? "—"}</span>}
    </div>
  );
}

/** a final: the two teams and the score, the winner lit — no grid (it closed at kickoff) */
function FinalLine({ game, homeWon, awayWon }: { game: CfbGame; homeWon: boolean; awayWon: boolean }) {
  return (
    <div className="space-y-1.5 py-0.5">
      <TeamBlock team={game.away} score={game.awayScore} scored winner={awayWon} loser={homeWon} />
      <TeamBlock team={game.home} score={game.homeScore} scored winner={homeWon} loser={awayWon} prefix={game.neutral ? "vs" : "@"} />
    </div>
  );
}

/* ---------- expanded: the model, in full ---------- */

function Expanded({ game }: { game: CfbGame }) {
  const L = useLeague();
  const CFB_MODEL = L.model;
  const m = game.model;
  const p = m.parts;
  const rows = orderedRows(game);
  const hfaNote = game.neutral ? "neutral site, no HFA" : `HFA +${CFB_MODEL.hfa}`;
  return (
    <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
      <div className={`text-[9.5px] font-bold uppercase tracking-[0.2em] ${L.id === "nfl" ? "text-nfl" : "text-cfb"}`}>The model</div>
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
  const L = useLeague();
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
      <EdgeMeter fair={row.fair} mkt={row.mkt} tone={L.id} className="mt-2" />
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
