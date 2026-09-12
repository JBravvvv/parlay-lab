"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCfbDesk } from "@/components/cfb/CfbBuilder";
import { addCfbLeg, CfbSlip, type CfbSlipLeg } from "@/components/cfb/CfbSlip";
import { PlayerMark, TeamMark } from "@/components/cfb/TeamMark";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { GenSheet } from "@/components/props/GenSheet";
import { useParlayGen, blankPins } from "@/components/props/useParlayGen";
import { useShellInsets } from "@/components/props/useShellInsets";
import { GradeChip } from "@/components/ui/GradeChip";
import { OddsCellButton, OddsGrid, type OddsGridCell } from "@/components/ui/OddsGrid";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { useLeague } from "@/components/football/LeagueContext";
import type { DeskClient, LeagueRules } from "@/lib/football/league";
import { CFB_PROPS_STALE_MS, cfbCacheLabel, cfbPricedAtLabel, cfbPropsQueryKey, cfbPropsStaleMs, loadCfbProps } from "@/lib/cfb/client";
import { kickoffLabel } from "@/lib/cfb/dates";
import { fmtLine, rowProbAt, sideLabel } from "@/lib/cfb/model";
import { playerSlug } from "@/lib/cfb/props";
import { FOOTBALL_GEN_MARKETS, footballGenPool } from "@/lib/football/gen-pool";
import type { GenSpec } from "@/lib/parlay-gen";
import { CFB_PROP_MARKETS, type CfbPropMarket, type CfbPropQuote, type CfbPropRow, type CfbPropsBoard } from "@/lib/cfb/props-types";
import { CFB_RULES } from "@/lib/cfb/rules";
import type { CfbGame, CfbMarketKey, CfbQuote, CfbRow, CfbSideKey, CfbTeam } from "@/lib/cfb/types";
import { gradeFromEv } from "@/lib/grade";
import { amFmt, combineTicket } from "@/lib/ticket-math";
import { railLabel } from "@/lib/games";

/**
 * CFB PARLAY BUILDER (INSTRUCTION 38, 2026-09-05): the College Football sandbox. The day's
 * games as compact cards — ML / spread / total, both sides tappable — priced at Caesars or at
 * the best posted book (a toggle), one side per game on the slip. The sticky bottom slip
 * (CfbSlip) combines the legs with `combineTicket` on the model's own win probabilities.
 * Purely a sandbox: nothing here is tracked and nothing writes the CFB ledger.
 *
 * Player props (INSTRUCTION 39): a market nav on top — SIDES (the game cards) then one tab per
 * `CFB_PROP_MARKETS` entry. Prop tabs read `/api/cfb/props` (`loadCfbProps`, one query per
 * date + bankroll, stale for the route's own revalidate window, never on a timer) and list
 * player rows grouped by game in kickoff order. A tap adds a `kind: "prop"` leg; `addCfbLeg`
 * refuses a second leg on the same player and shows the note inline. A prop and a side on the
 * same game are allowed. Prices are posted quotes (Caesars, or the best book on the toggle);
 * a market Caesars has not posted renders the empty state with the route's own counts.
 *
 * THE CARDS (INSTRUCTION 40, 2026-09-05 — Josh: "the logo sizes on the parlay builder page are
 * so disproportionate to the boxes. The boxes should be smaller vertically and the logos should
 * be slightly bigger"): every SIDES card is now the Caesars grammar on the shared OddsGrid —
 * the two teams stacked on the left (a 32 px TeamMark with the rank badge, the abbreviation,
 * the record or the live score), a Spread / Money / Total grid on the right, every price a
 * 44 px pill with the line above it that adds the leg to the slip (amber ring while it is on
 * the slip). A live game carries a pulsing LIVE pill with ESPN's clock and score and its pills
 * stay tappable (in-play prices, the slate refetches while anything is live); a final game
 * collapses to one line with the score and no grid. Prop tabs are rows — initials disc, name,
 * team, season context — with Over / Under two-button cells (anytime TD is one YES pill); a
 * game with no priced line in the market prints one muted line instead of vanishing. No blur
 * filter on any per-item surface (the iOS freeze rule); nothing here scrolls sideways at 375 px.
 *
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "Board & Builder should have player headshot
 * as well as team logo"): a prop row's disc is now the player's ESPN headshot with HIS team's
 * logo as the corner badge (PlayerMark; initials in the team colour when no headshot loaded),
 * and the slip legs carry the same marks. The team beside the name and the matchup line are
 * unchanged. The Builder also answers a ledger deep link (INSTRUCTION 46, point 9 — tapping a
 * player's name on a ledger ticket): `?game=<id>&mkt=<market>&player=<slug>[&date=<day>]`
 * picks the day, opens the market tab (sides for ml / spread / total), clears the search and
 * scrolls the player's row (matched by slug + market, never by the line — "even if the line has
 * changed") or the game card into view with a short amber ring. The query is read inside a
 * Suspense boundary (Next's `useSearchParams` rule, same as the Games page).
 */

type PriceMode = "cz" | "best";

const PRICE_OPTIONS = [
  { key: "cz", label: "Caesars" },
  { key: "best", label: "Best price" },
] as const;

const BOOK_TAG: Record<string, string> = {
  williamhill_us: "CZ",
  draftkings: "DK",
  fanduel: "FD",
  pinnacle: "PIN",
  betmgm: "MGM",
  betrivers: "BR",
  bovada: "BOV",
  fanatics: "FAN",
  espnbet: "ESPN",
  hardrockbet: "HR",
  betonlineag: "BOL",
  lowvig: "LV",
  mybookieag: "MB",
  betus: "BUS",
  unibet_us: "UNI",
  ballybet: "BB",
};

function bookTag(q: CfbQuote | CfbPropQuote): string {
  return BOOK_TAG[q.book] ?? q.title.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
}

/** the grid's three columns, in the Caesars order: Spread · Money · Total */
const GRID_COLUMNS: { key: CfbMarketKey; label: string }[] = [
  { key: "spread", label: "Spread" },
  { key: "ml", label: "Money" },
  { key: "total", label: "Total" },
];
const COLUMN_LABELS = GRID_COLUMNS.map((c) => c.label);

/** the row for (market, side) — the board keys rows by line, so prefer the one Caesars posts */
function rowFor(game: CfbGame, market: CfbMarketKey, side: CfbSideKey): CfbRow | null {
  const rows = game.rows.filter((r) => r.market === market && r.side === side);
  if (!rows.length) return null;
  return rows.find((r) => r.cz) ?? rows[0];
}

function quoteFor(row: CfbRow, mode: PriceMode): CfbQuote | null {
  if (mode === "cz") return row.cz;
  return row.best ?? row.cz;
}

function sideEv(row: CfbRow, mode: PriceMode): number | null {
  if (mode === "cz") return row.evCz;
  return row.best ? row.evBest : row.evCz;
}

/** the slip leg for a row at a quote — probability re-read at the quote's own line */
function legOf(game: CfbGame, row: CfbRow, q: CfbQuote): CfbSlipLeg {
  const p = rowProbAt(game.model, row.market, row.side, q.line) ?? { win: row.fair, push: row.push };
  const label = row.market === "ml" || q.line === row.line ? row.label : sideLabel(game, row.market, row.side, q.line);
  return {
    kind: "side",
    key: row.key,
    gameId: game.id,
    label,
    sub: `${game.away.abbr} @ ${game.home.abbr} · ${kickoffLabel(game.start)}`,
    market: row.market,
    cz: q.price,
    book: bookTag(q),
    prob: p.win * 100,
    // INSTRUCTION 46: the side's own team for the slip mark; a total carries the pair instead
    team: row.market === "total" ? null : row.side === "home" ? game.home : game.away,
    pair: row.market === "total" ? { away: game.away, home: game.home } : null,
  };
}

/** the small line above a price: "+40.5" / "O 56.5" / nothing for a moneyline */
function lineText(market: CfbMarketKey, side: CfbSideKey, line: number | null): string | null {
  if (market === "ml") return null;
  if (market === "total") return `${side === "over" ? "O" : "U"} ${line ?? "—"}`;
  return line == null ? "—" : fmtLine(line);
}

/**
 * THE LEAGUE SEAM (2026-09-08, the NFL build): this sandbox is the shared football props surface —
 * the league's props table, client, model, rules and accent come off `useLeague()` (default the
 * CFB desk; src/components/nfl/NflProps.tsx mounts it under the NFL provider). The pinned CFB
 * names inside CfbProps (`CFB_PROPS`, `cfbPropsQueryKey`, `loadCfbProps`, `cacheLabel`,
 * `cfbPricedAtLabel`) are LOCALS read off the league in scope — NFL_DESK's under the NFL provider.
 * The pure cell builders take the league's rules as a trailing argument (CFB_RULES when omitted).
 */

/** a price pill's tone: lit whole when it clears the core EV gate, accent price when plus, plain when minus */
function priceTone(price: number, ev: number | null, rules: Pick<LeagueRules, "minEvPct"> = CFB_RULES): OddsGridCell["tone"] {
  if (ev != null && ev >= rules.minEvPct) return "ev";
  return price > 0 ? "plus" : "minus";
}

/** one grid cell for (market, side) of a game — a real leg when priced, a muted "—" otherwise */
function sideCell(game: CfbGame, market: CfbMarketKey, side: CfbSideKey, mode: PriceMode, picked: string | null, onPick: (leg: CfbSlipLeg) => void, rules: Pick<LeagueRules, "minEvPct"> = CFB_RULES): OddsGridCell {
  const row = rowFor(game, market, side);
  if (!row) return {};
  const q = quoteFor(row, mode);
  if (!q) return { line: lineText(market, side, row.line) ?? undefined, price: mode === "cz" ? "no CZ" : "—", tone: "muted" };
  const tag = bookTag(q);
  const line = [lineText(market, side, q.line), tag !== "CZ" ? tag : null].filter(Boolean).join(" · ") || undefined;
  const closed = game.status === "final" || game.status === "postponed";
  return {
    line,
    price: amFmt(q.price),
    tone: priceTone(q.price, sideEv(row, mode), rules),
    selected: picked === row.key,
    disabled: closed,
    aria: `${row.label} ${amFmt(q.price)}${tag !== "CZ" ? ` at ${tag}` : ""}`,
    onClick: () => onPick(legOf(game, row, q)),
  };
}

/** the team block in the grid's first column: mark + rank, abbreviation, record or live score */
function TeamBlock({ team, score, live }: { team: CfbTeam; score: number | null; live: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamMark team={team} size="md" showRank showAbbr={false} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-bold text-text">{team.abbr}</span>
          {score != null && <span className={`num text-[13px] font-bold ${live ? "text-live" : "text-text"}`}>{score}</span>}
        </div>
        <div className="truncate text-[9.5px] text-faint">
          {team.short}
          {team.record ? ` · ${team.record}` : ""}
        </div>
      </div>
    </div>
  );
}

function LivePill({ detail, score }: { detail: string | null; score: string | null }) {
  return (
    <span className="num inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[10px] font-bold text-live">
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
      LIVE
      {detail ? ` · ${detail}` : ""}
      {score ? ` · ${score}` : ""}
    </span>
  );
}

/** a finished game: one line, the score, no grid */
function FinalRow({ game }: { game: CfbGame }) {
  const a = game.awayScore;
  const h = game.homeScore;
  const awayWon = a != null && h != null && a > h;
  const homeWon = a != null && h != null && h > a;
  return (
    <article className="glass flex items-center justify-between gap-2 px-3 py-2" aria-label={`Final: ${game.away.abbr} ${a ?? "—"}, ${game.home.abbr} ${h ?? "—"}`}>
      <div className="flex min-w-0 items-center gap-2 text-[12px]">
        <TeamMark team={game.away} size="sm" showRank />
        <span className={`num text-[13px] font-bold ${awayWon ? "text-text" : "text-muted"}`}>{a ?? "—"}</span>
        <span className="text-faint">–</span>
        <span className={`num text-[13px] font-bold ${homeWon ? "text-text" : "text-muted"}`}>{h ?? "—"}</span>
        <TeamMark team={game.home} size="sm" showRank />
      </div>
      <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">Final</span>
    </article>
  );
}

function SlipGameCard({
  game,
  mode,
  picked,
  onPick,
}: {
  game: CfbGame;
  mode: PriceMode;
  /** the row key on the slip for this game, if any */
  picked: string | null;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  const L = useLeague();
  if (game.status === "final") return <FinalRow game={game} />;
  const live = game.status === "live";
  const postponed = game.status === "postponed";
  const score = game.homeScore != null && game.awayScore != null ? `${game.awayScore}–${game.homeScore}` : null;
  const cells = (side: "away" | "home"): OddsGridCell[] =>
    GRID_COLUMNS.map((c) => sideCell(game, c.key, c.key === "total" ? (side === "away" ? "over" : "under") : side, mode, picked, onPick, L.rules));
  const pickedRing = L.id === "nfl" ? "ring-1 ring-nfl/40" : "ring-1 ring-cfb/40";
  return (
    <article className={`glass card-lift px-3 pb-2.5 pt-2 ${picked ? pickedRing : ""}`}>
      <header className="mb-1.5 flex items-center justify-between gap-2">
        {live ? (
          <LivePill detail={game.detail} score={score} />
        ) : (
          <span className="num text-[10.5px] text-faint">
            {postponed ? "Postponed" : kickoffLabel(game.start)}
            {game.tv ? ` · ${game.tv}` : ""}
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-faint">{game.neutral ? "neutral site" : `${game.away.abbr} @ ${game.home.abbr}`}</span>
      </header>
      <OddsGrid
        tone={L.id}
        columns={COLUMN_LABELS}
        rows={[
          { key: `${game.id}|away`, team: <TeamBlock team={game.away} score={game.awayScore} live={live} />, cells: cells("away") },
          { key: `${game.id}|home`, team: <TeamBlock team={game.home} score={game.homeScore} live={live} />, cells: cells("home") },
        ]}
      />
    </article>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Market nav: SIDES + the six prop markets (one source of truth: CFB_PROP_MARKETS)             */
/* ------------------------------------------------------------------------------------------ */

type NavKey = "sides" | CfbPropMarket;

const NAV_OPTIONS: readonly { key: NavKey; label: string }[] = [
  { key: "sides", label: "SIDES" },
  ...CFB_PROP_MARKETS.map((m) => ({ key: m.id, label: m.label.toUpperCase() })),
];

function marketMeta(id: CfbPropMarket) {
  return CFB_PROP_MARKETS.find((m) => m.id === id) ?? CFB_PROP_MARKETS[0];
}

/** matches the route's revalidate window — a tab that refetches inside it never spends quota */
const PROPS_STALE_MS = CFB_PROPS_STALE_MS;

/**
 * The query's staleness follows the board's OWN window (`ttlSec`: 10 min once a priced game is
 * in play, else the 2 h default) — INSTRUCTION 40 — measured from the board's generatedAt, not
 * from the fetch (cfbPropsStaleMs): a Redis-served board that is already 9 min old is stale in
 * 1 min. Still never on a timer: a live board is only re-read on the next mount / focus after
 * its window, and the route answers from Redis inside its window, so this never spends quota
 * the route would not have spent anyway.
 */
function propsStaleMs(board: CfbPropsBoard | undefined, client?: DeskClient): number {
  if (board) return (client?.propsStaleMs ?? cfbPropsStaleMs)(board);
  return client ? client.PROPS_STALE_MS : PROPS_STALE_MS;
}

/** "2 h" / "10 min" — the window the board itself says it was cached for (never hardcoded) */
const cacheLabel = cfbCacheLabel;

function normName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function propQuote(row: CfbPropRow, mode: PriceMode): CfbPropQuote | null {
  if (mode === "cz") return row.cz;
  return row.best ?? row.cz;
}

function propEv(row: CfbPropRow, mode: PriceMode): number | null {
  if (mode === "cz") return row.evCz;
  return row.best ? row.evBest : row.evCz;
}

function sideTag(side: CfbPropRow["side"]): string {
  return side === "over" ? "O" : side === "under" ? "U" : "Yes";
}

/** "Ty Simpson O 245.5" / "R. Williams Anytime TD" — at the quote's OWN line */
function propLegLabel(row: CfbPropRow, line: number | null): string {
  if (row.side === "yes") return `${row.player} ${marketMeta(row.market).label}`;
  return `${row.player} ${sideTag(row.side)} ${line ?? row.line ?? "—"}`;
}

const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

/**
 * the slip leg for a prop row at a quote — the model probability is the row's `fair`, which exists
 * only AT THE ROW'S LINE (props.ts, point 4: nothing is interpolated). A quote at any other line
 * (Caesars alone at 249.5 against a 245.5 consensus) has no fair, so it gets no leg — the muted
 * cell, exactly as the Board prints EV "—" for it.
 */
export function propLegOf(row: CfbPropRow, q: CfbPropQuote): CfbSlipLeg | null {
  if (row.fair == null || !sameLine(q.line, row.line)) return null;
  return {
    kind: "prop",
    key: row.key,
    gameId: row.gameId,
    label: propLegLabel(row, q.line),
    sub: row.sub,
    market: row.market,
    marketLabel: marketMeta(row.market).label,
    player: row.player,
    cz: q.price,
    book: bookTag(q),
    prob: row.fair * 100,
    // INSTRUCTION 46: the row knows the headshot / position; PropRow attaches the team object
    headshot: row.headshot,
    pos: row.pos,
  };
}

/** one row per player + line: both sides of an O/U prop, or the single "yes" side */
type PlayerLine = {
  id: string;
  player: string;
  team: string | null;
  teamId: string | null;
  /** INSTRUCTION 46: ESPN headshot href / position from the row (null → initials disc) */
  headshot: string | null;
  pos: string | null;
  line: number | null;
  sides: CfbPropRow[];
};

/** INSTRUCTION 46 (point 9): what a ledger deep link asked the Builder to show */
type PropFocus = { gameId: string; market: NavKey; player: string | null };

type PropGroup = { gameId: string; kickoff: string; status: CfbPropRow["status"]; sub: string; lines: PlayerLine[] };

function evRank(row: CfbPropRow, mode: PriceMode): number {
  const ev = propEv(row, mode);
  return ev == null ? -Infinity : ev;
}

/**
 * group prop rows by game (live first, then kickoff order), then by player + line, best EV
 * first. Every PRICED game (any row in any market) gets a group, so a game with nothing in
 * this market still renders — as one muted line, not a missing card — unless a search is on.
 */
function groupProps(rows: CfbPropRow[], market: CfbPropMarket, mode: PriceMode, needle: string): PropGroup[] {
  const games = new Map<string, PropGroup>();
  const groupFor = (r: CfbPropRow): PropGroup => {
    let g = games.get(r.gameId);
    if (!g) {
      g = { gameId: r.gameId, kickoff: r.kickoff, status: r.status, sub: r.sub, lines: [] };
      games.set(r.gameId, g);
    }
    return g;
  };
  for (const r of rows) {
    if (!needle) groupFor(r);
    if (r.market !== market) continue;
    if (needle && !normName(r.player).includes(needle)) continue;
    const g = groupFor(r);
    const id = `${normName(r.player)}|${r.line ?? ""}`;
    let pl = g.lines.find((x) => x.id === id);
    if (!pl) {
      pl = { id, player: r.player, team: r.teamAbbr ?? r.team, teamId: r.teamId, headshot: r.headshot, pos: r.pos, line: r.line, sides: [] };
      g.lines.push(pl);
    }
    pl.sides.push(r);
  }
  const out = [...games.values()];
  for (const g of out) {
    for (const pl of g.lines) pl.sides.sort((a, b) => (a.side === "under" ? 1 : 0) - (b.side === "under" ? 1 : 0));
    g.lines.sort((a, b) => {
      const ea = Math.max(...a.sides.map((r) => evRank(r, mode)));
      const eb = Math.max(...b.sides.map((r) => evRank(r, mode)));
      if (ea !== eb) return eb - ea;
      return a.player.localeCompare(b.player);
    });
  }
  const liveRank = (g: PropGroup) => (g.status === "live" ? 0 : 1);
  out.sort((a, b) => liveRank(a) - liveRank(b) || a.kickoff.localeCompare(b.kickoff) || a.sub.localeCompare(b.sub));
  return out;
}

function ctxLine(row: CfbPropRow): string | null {
  const c = row.ctx;
  if (!c || c.perGame == null) return null;
  const per = Number.isInteger(c.perGame) ? String(c.perGame) : c.perGame.toFixed(1);
  return `${per} / game · ${c.g} G`;
}

/* the initials disc moved to TeamMark.tsx (`initials`, INSTRUCTION 46) — PlayerMark draws it when no headshot loads */

/* prop-rows:start — plain surfaces only on per-item rows (the iOS freeze rule: no blur filters here) */

/** one Over / Under / YES pill for a prop row — a real leg when priced at the row's line, else muted */
function propCell(row: CfbPropRow, mode: PriceMode, selected: boolean, onPick: (leg: CfbSlipLeg) => void, rules: Pick<LeagueRules, "minEvPct"> = CFB_RULES): OddsGridCell {
  const q = propQuote(row, mode);
  const yes = row.side === "yes";
  const closed = row.status === "final" || row.status === "postponed";
  if (!q) return { line: yes ? "YES" : `${sideTag(row.side)} ${row.line ?? "—"}`, price: "—", tone: "muted" };
  const leg = propLegOf(row, q);
  const tag = bookTag(q);
  const line = [yes ? "YES" : `${sideTag(row.side)} ${q.line ?? row.line ?? "—"}`, tag !== "CZ" ? tag : null].filter(Boolean).join(" · ");
  if (!leg) return { line, price: "—", tone: "muted", aria: `${row.player} ${line} — no fair at this line` };
  return {
    line,
    price: amFmt(q.price),
    tone: priceTone(q.price, propEv(row, mode), rules),
    selected,
    disabled: closed,
    aria: `${leg.label} ${amFmt(q.price)}${tag !== "CZ" ? ` at ${tag}` : ""}`,
    onClick: () => onPick(leg),
  };
}

/** the amber ring a deep-linked row / card wears while the Builder scrolls to it (INSTRUCTION 46, point 9) */
const FOCUS_RING = "rounded-[12px] ring-2 ring-cfb/70 ring-offset-2 ring-offset-bg";
const FOCUS_RING_NFL = "rounded-[12px] ring-2 ring-nfl/70 ring-offset-2 ring-offset-bg";
/** the deep-link ring in the league's accent (both class strings literal, so Tailwind emits both) */
function focusRing(league: "cfb" | "nfl"): string {
  return league === "nfl" ? FOCUS_RING_NFL : FOCUS_RING;
}

function PropRow({
  pl,
  mode,
  team,
  gameId,
  focused,
  pickedKeys,
  onPick: pickLeg,
}: {
  pl: PlayerLine;
  mode: PriceMode;
  /** the slate team the player is on (logo + colour for the PlayerMark), or null when unresolved */
  team: CfbTeam | null;
  gameId: string;
  /** INSTRUCTION 46 (point 9): this row is the one a ledger deep link pointed at */
  focused: boolean;
  pickedKeys: Set<string>;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  const L = useLeague();
  /* INSTRUCTION 46: the leg leaves with the team object so the slip draws the same mark */
  const onPick = (leg: CfbSlipLeg) => pickLeg({ ...leg, team });
  /* the row's headline number is its best-EV side at the chosen price */
  const lead = pl.sides.reduce((a, b) => (evRank(b, mode) > evRank(a, mode) ? b : a), pl.sides[0]);
  const ev = propEv(lead, mode);
  const grade = gradeFromEv(ev);
  const ctx = ctxLine(lead);
  const yes = lead.side === "yes";
  return (
    <div
      data-prop-game={gameId}
      data-prop-player={playerSlug(pl.player)}
      className={`flex min-h-[52px] items-center gap-2 border-t border-white/[0.04] py-1.5 first:border-t-0 ${focused ? focusRing(L.id) : ""}`}
    >
      <PlayerMark player={pl.player} headshot={pl.headshot} team={team} pos={pl.pos} size="md" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] font-semibold text-text">
          {pl.player}
          {pl.team && <span className="ml-1 text-[9.5px] font-semibold uppercase text-faint">{pl.team}</span>}
        </div>
        <div className="num mt-0.5 truncate text-[9.5px] text-faint">
          {ctx ?? "no season ctx"}
          <span className="mx-1 text-line-2">·</span>
          <span className={ev == null ? "" : ev >= 0 ? "text-pos" : "text-neg/80"}>
            EV {ev == null ? "—" : `${ev >= 0 ? "+" : ""}${ev.toFixed(1)}%`}
          </span>
        </div>
      </div>
      <GradeChip grade={grade} basis={mode === "cz" ? "EV @ Caesars" : "EV @ best price"} />
      <div className={`${L.id === "nfl" ? "odds-grid is-nfl" : "odds-grid is-cfb"} shrink-0 ${yes ? "w-[74px] grid-cols-1" : "w-[150px] grid-cols-2"}`}>
        {pl.sides.map((r) => (
          <OddsCellButton key={r.key} cell={propCell(r, mode, pickedKeys.has(r.key), onPick, L.rules)} />
        ))}
      </div>
    </div>
  );
}

function PropGameGroup({
  group,
  game,
  market,
  mode,
  focus,
  pickedKeys,
  onPick,
}: {
  group: PropGroup;
  game: CfbGame | null;
  market: CfbPropMarket;
  mode: PriceMode;
  /** INSTRUCTION 46 (point 9): the deep-linked row, if any */
  focus: PropFocus | null;
  pickedKeys: Set<string>;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  const live = (game?.status ?? group.status) === "live";
  const score = game && game.homeScore != null && game.awayScore != null ? `${game.awayScore}–${game.homeScore}` : null;
  /* the slate team the player is on — by the row's teamId (odds feed or ESPN, props.ts), never guessed */
  const teamOf = (pl: PlayerLine): CfbTeam | null => {
    if (!game || !pl.teamId) return null;
    return pl.teamId === game.home.id ? game.home : pl.teamId === game.away.id ? game.away : null;
  };
  /* matched by slug + market only — the line may have moved since the ticket locked */
  const focusedSlug = focus && focus.gameId === group.gameId && focus.market === market ? focus.player : null;
  const firstFocus = focusedSlug ? group.lines.find((pl) => playerSlug(pl.player) === focusedSlug) : undefined;
  return (
    <section className="rounded-[14px] border border-white/[0.07] bg-white/[0.03]">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        {game ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-text">
            <TeamMark team={game.away} size="sm" showRank />
            <span className="text-faint">{game.neutral ? "vs" : "@"}</span>
            <TeamMark team={game.home} size="sm" showRank />
          </div>
        ) : (
          <span className="truncate text-[12px] font-semibold text-text">{group.sub}</span>
        )}
        {live ? (
          <LivePill detail={game?.detail ?? null} score={score} />
        ) : (
          <span className="num shrink-0 text-[10.5px] text-faint">
            {kickoffLabel(group.kickoff)} · {group.lines.length}
          </span>
        )}
      </header>
      <div className="px-3">
        {group.lines.length === 0 ? (
          <div className="num py-2.5 text-[10.5px] text-faint">No {marketMeta(market).label} lines priced for this game.</div>
        ) : (
          group.lines.map((pl) => (
            <PropRow key={pl.id} pl={pl} mode={mode} team={teamOf(pl)} gameId={group.gameId} focused={pl === firstFocus} pickedKeys={pickedKeys} onPick={onPick} />
          ))
        )}
      </div>
    </section>
  );
}

/* prop-rows:end */

function PropSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: 2 }).map((_, c) => (
        <div key={c} className="rounded-[14px] border border-white/[0.07] bg-white/[0.03]">
          <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] px-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="px-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-h-[52px] items-center gap-2 border-t border-white/[0.04] py-1.5 first:border-t-0">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-11 w-[72px] rounded-[12px]" />
                <Skeleton className="h-11 w-[72px] rounded-[12px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** the shape of a ledger deep link (INSTRUCTION 46, point 9) — every field the URL's own value or null */
export type CfbPropsLink = { date: string | null; game: string | null; mkt: string | null; player: string | null };

/** `?date&game&mkt&player` → CfbPropsLink; a link with no `game` is null (nothing to show) */
export function cfbPropsLinkOf(params: { get(name: string): string | null }): CfbPropsLink | null {
  const game = params.get("game");
  if (!game) return null;
  return { date: params.get("date"), game, mkt: params.get("mkt"), player: params.get("player") };
}

/** the nav tab a link's `mkt` opens: a prop market by id, anything else (ml / spread / total / missing) the sides */
export function cfbPropsLinkNav(mkt: string | null): NavKey {
  return CFB_PROP_MARKETS.some((m) => m.id === mkt) ? (mkt as CfbPropMarket) : "sides";
}

/**
 * Reads the deep link once per distinct query. Lives in its own component so the Suspense
 * boundary around `useSearchParams` (Next's rule) never wraps the whole Builder.
 */
function PropsLinkReader({ onLink }: { onLink: (link: CfbPropsLink) => void }) {
  const params = useSearchParams();
  const key = params.toString();
  useEffect(() => {
    const link = cfbPropsLinkOf(params);
    if (link) onLink(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the query's identity
  }, [key]);
  return null;
}

/* ---- INSTRUCTION 52 (2026-09-12, Josh's word, verbatim: "Parlay Generator should be on CFB &
   NFL just like it is on MLB") — the generator's football defaults.

   ONE set for BOTH football desks. CfbProps is the shared football surface and NflProps is an
   18-line wrapper around it (INSTRUCTION 47), so the NFL gets the generator by being the same
   component, not by carrying a second copy of any of this.

   THE DEFAULT BAND IS WIDER THAN MLB'S. MLB opens on Josh's own worked example (-152 → +110), but
   football's six markets are not priced in that range: anytime TD is plus money by nature and
   would open every session on "no leg is priced in this band". -250 → +250 (1.40 → 3.50 in
   decimal, which is how the band is actually compared) has real legs in all six. A band is a
   filter over posted prices, never a price — widening the default invents nothing. */
const GEN_MARKET_KEYS: readonly string[] = FOOTBALL_GEN_MARKETS.map((m) => m.key);
const GEN_SPEC_DEFAULT: GenSpec = {
  market: FOOTBALL_GEN_MARKETS[0].key,
  legs: 4,
  legMinAm: -250,
  legMaxAm: 250,
  payout: null,
  sides: "o",
  onePerGame: true,
  czOnly: false,
  includeStarted: false,
  modelOnly: false,
  pinned: blankPins(4),
};

/** the line under the category pills, and the sheet's stand-in on the Sides rail */
const GEN_CATEGORY_NOTE =
  "Sides, totals and moneylines are game markets, not player slots — the generator leaves them alone for now.";
const GEN_STUB_NOTE =
  "The parlay generator builds PLAYER-prop parlays — pick a player market above and it appears here. Sides, totals and moneylines are game markets and have no player slots yet.";
/* EVERY football leg is market-priced: the win % is the de-vigged consensus of the books that
   posted the line (src/lib/cfb/props.ts), so the MLB sentence — "their EV is ~0 by construction"
   — would be plainly false here. The EV beside a football leg is measured against the ONE price
   being taken, which is the whole point of the Caesars / best-price toggle. */
const GEN_MARKET_NOTE =
  "Every win % here is the de-vigged consensus of the books that posted the line; the EV beside it is measured against the one price you would take.";

export function CfbProps() {
  const L = useLeague();
  /* the league's props table and client under the pinned CFB names (see the seam note above) */
  const { props: CFB_PROPS } = L;
  const { propsQueryKey: cfbPropsQueryKey, loadProps: loadCfbProps, cacheLabel, pricedAtLabel: cfbPricedAtLabel } = L.client;
  const { today, date, dates, pick, slate, bankroll, loading, error, refetch } = useCfbDesk();
  const { top, bottom } = useShellInsets();
  const [mode, setMode] = useState<PriceMode>("cz");
  const [nav, setNav] = useState<NavKey>("sides");
  const [search, setSearch] = useState("");
  const [legs, setLegs] = useState<CfbSlipLeg[]>([]);
  const [stake, setStake] = useState(10);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  useEffect(() => () => { if (noteTimer.current) window.clearTimeout(noteTimer.current); }, []);

  /* INSTRUCTION 46 (point 9): a ledger deep link → day, market tab, then scroll + ring the target */
  const [focus, setFocus] = useState<PropFocus | null>(null);
  const focusTimer = useRef<number | null>(null);
  useEffect(() => () => { if (focusTimer.current) window.clearTimeout(focusTimer.current); }, []);
  const onLink = (link: CfbPropsLink) => {
    if (link.date) pick(link.date);
    setNav(cfbPropsLinkNav(link.mkt));
    setSearch("");
    setFocus({ gameId: link.game as string, market: cfbPropsLinkNav(link.mkt), player: link.player });
  };

  const propsQ = useQuery({
    queryKey: cfbPropsQueryKey(date, bankroll),
    queryFn: () => loadCfbProps(date, { bankroll }),
    enabled: nav !== "sides" && !!date,
    staleTime: (q) => propsStaleMs(q.state.data, L.client),
    retry: 1,
  });

  const calc = useMemo(() => combineTicket(legs.map((l) => ({ cz: l.cz, prob: l.prob }))), [legs]);
  const pickedByGame = useMemo(
    () => new Map(legs.filter((l) => l.kind === "side").map((l) => [l.gameId, l.key])),
    [legs],
  );
  const pickedKeys = useMemo(() => new Set(legs.map((l) => l.key)), [legs]);

  const showNote = (text: string) => {
    setNote(text);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2400);
  };

  const toggle = (leg: CfbSlipLeg) => {
    const r = addCfbLeg(legs, leg);
    if (r.note) showNote(r.note);
    else setLegs(r.legs);
  };

  /* live games first, then kickoff order — finals sink to the bottom as one-line rows */
  const games = useMemo(() => {
    const rank = (g: CfbGame) => (g.status === "live" ? 0 : g.status === "final" ? 2 : 1);
    return slate ? [...slate.games].sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start)) : [];
  }, [slate]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const liveGames = games.filter((g) => g.status === "live").length;

  const board = propsQ.data;
  const groups = useMemo(
    () => (nav === "sides" || !board ? [] : groupProps(board.rows, nav, mode, normName(search.trim()))),
    [board, nav, mode, search],
  );
  const marketRows = useMemo(
    () => (nav === "sides" || !board ? 0 : board.rows.filter((r) => r.market === nav).length),
    [board, nav],
  );
  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);

  /* ---- INSTRUCTION 52: the parlay generator --------------------------------------------
     The same pure core, the same state hook and the same sheet the MLB desk uses — the only
     football-specific part is the pool builder, which reads THIS board's rows through the
     desk's OWN quote picker and leg minter (`propQuote` / `propLegOf`), so a generated leg is
     byte-for-byte the leg a tap on that cell would have produced, and a cell the board draws as
     an untappable dash is never offered.

     A PURE READER: no fetch, no extra market on any pull, not one Odds credit, no money seated
     and no ledger row. The rows are the board that is already on the device. */
  const buildGenPool = useCallback(
    (sp: GenSpec, at: number) =>
      footballGenPool<CfbSlipLeg>(board?.rows ?? [], sp, {
        mode,
        nowMs: at,
        /* the row's own team tag, folded to one spelling per club — never guessed */
        teamOf: (row) => row.teamAbbr ?? row.team,
        quoteOf: propQuote,
        legOf: (row, q) => {
          const leg = propLegOf(row, q);
          if (!leg) return null;
          /* the SAME team resolution PropGameGroup uses — by the row's teamId against the slate
             game, never by name — so a generated leg reaches the slip with the identical mark */
          const g = gameById.get(row.gameId);
          const team = g && row.teamId ? (row.teamId === g.home.id ? g.home : row.teamId === g.away.id ? g.away : null) : null;
          return { ...leg, team };
        },
      }),
    [board, mode, gameById],
  );
  const gen = useParlayGen<CfbSlipLeg>({
    /* derived from the league, never a literal: one desk's remembered state must not be the
       other's, and a hardcoded league key here is exactly what the separation tests forbid */
    storageKey: `pl:${L.id}:props:gen-open`,
    defaultSpec: GEN_SPEC_DEFAULT,
    marketKeys: GEN_MARKET_KEYS,
    railMarket: nav === "sides" ? null : nav,
    boardKey: date,
    build: buildGenPool,
    onMarket: (m) => setNav(m as CfbPropMarket),
    legs,
    setLegs,
  });
  const genMarketLabel = FOOTBALL_GEN_MARKETS.find((m) => m.key === gen.spec.market)?.label ?? gen.spec.market;
  /* the board's own generation time, formatted only after mount (gen.nowMs is 0 on the server,
     so SSR prints no clock and hydration cannot mismatch on a locale-rendered time) */
  const genBoardAt =
    gen.nowMs > 0 && board?.generatedAt
      ? new Date(board.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : null;

  /* scroll the deep-linked row / card into view once it exists; the ring clears itself after a beat */
  useEffect(() => {
    if (!focus || focusTimer.current) return;
    const sel =
      focus.market === "sides"
        ? `[data-cfb-game="${focus.gameId}"]`
        : `[data-prop-game="${focus.gameId}"][data-prop-player="${focus.player ?? ""}"]`;
    const el = document.querySelector(sel);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      setFocus(null);
    }, 5000);
  }, [focus, groups, games]);

  const copyText = useMemo(() => {
    if (!calc) return "";
    const lines = [
      `${L.short} slip · ${railLabel(date)} · ${calc.n} leg${calc.n === 1 ? "" : "s"} · ${amFmt(calc.am)} (${calc.dec.toFixed(2)}x)`,
      ...legs.map((l) => `• ${l.label}${l.kind === "prop" ? ` (${l.marketLabel ?? l.market})` : ""} · ${l.sub} · ${amFmt(l.cz)} ${l.book}`),
      `$${stake} → pays $${calc.payout(stake).toFixed(2)} · true ${(calc.trueProb * 100).toFixed(1)}% · EV ${calc.ev >= 0 ? "+" : ""}${(calc.ev * 100).toFixed(1)}%`,
      `Sandbox — not tracked, not in the ${L.short} ledger.`,
    ];
    return lines.join("\n");
  }, [calc, legs, stake, date, L.short]);

  const label = date === today ? "Today" : railLabel(date);
  const navLabel = nav === "sides" ? "Sides" : marketMeta(nav).label;

  return (
    <div className={legs.length ? "pb-20" : ""}>
      <Suspense fallback={null}>
        <PropsLinkReader onLink={onLink} />
      </Suspense>
      <p className="mb-3 text-[11.5px] text-muted">Sandbox · nothing here is tracked or enters the {L.short} ledger.</p>
      <DateRail dates={dates} date={date} today={today} onPick={pick} />

      {/* market nav — sticky under the phone header; the segmented track scrolls sideways on 375px */}
      <div className="sticky z-20 -mx-4 mb-3 border-b border-white/[0.06] bg-bg/95 px-4 py-2 md:mx-0 md:px-0" style={{ top }}>
        <div className="chip-row -mx-4 px-4 md:mx-0 md:px-0">
          <Segmented options={NAV_OPTIONS} value={nav} onChange={setNav} size="md" tone={L.id} label="Market" className="w-max" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pb-1">
          <Segmented options={PRICE_OPTIONS} value={mode} onChange={setMode} size="md" tone={L.id} label="Price at" />
          <span className="num flex items-center gap-2 text-[10.5px] text-faint">
            {liveGames > 0 && nav === "sides" && (
              <span className="inline-flex items-center gap-1 text-live">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
                {liveGames} live
              </span>
            )}
            {mode === "cz" ? "Caesars settles" : `best of ${L.model.minBooks}+ books · Caesars settles`}
          </span>
        </div>
        {nav !== "sides" && (
          <div className="mt-1 flex items-center gap-2 pb-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
              aria-label="Search players"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-white/[0.08] bg-surface-2 px-3 text-[16px] text-text placeholder:text-faint"
            />
            <span className="num shrink-0 text-[10.5px] text-faint">
              {lineCount} line{lineCount === 1 ? "" : "s"} · {groups.length} game{groups.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      <GenSheet
        market={gen.spec.market}
        marketLabel={genMarketLabel}
        markets={FOOTBALL_GEN_MARKETS}
        pool={gen.pool}
        renderMark={({ leg }) => (
          <PlayerMark
            player={leg.player ?? null}
            headshot={leg.headshot ?? null}
            team={leg.team ?? null}
            pos={leg.pos ?? null}
            size="md"
          />
        )}
        renderName={({ name }) => (
          /* plain text, exactly as the board prints it — the tappable MLB profile sheet would
             resolve a football name against statsapi and come back "couldn't match" */
          <span className="block truncate text-[12.5px] font-medium tracking-tight text-text">{name}</span>
        )}
        spec={gen.spec}
        onSpec={gen.patchSpec}
        result={gen.result}
        onGenerate={gen.spin}
        onTogglePin={gen.togglePin}
        onAdd={gen.add}
        canUndo={gen.canUndo}
        onUndo={gen.undo}
        open={gen.open}
        onOpen={gen.setOpen}
        boardAt={genBoardAt}
        loading={propsQ.isPending}
        gameMarket={nav === "sides"}
        showModelOnly={false}
        categoryNote={GEN_CATEGORY_NOTE}
        stubNote={GEN_STUB_NOTE}
        marketNote={GEN_MARKET_NOTE}
      />

      {note && (
        <div role="status" className="mb-2 rounded-[10px] border border-gold/30 bg-gold/[0.07] px-3 py-1.5 text-[10.5px] text-gold">
          {note}
        </div>
      )}

      {nav === "sides" ? (
        loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <ErrorState title={`The ${L.short} slate did not load`} body={error instanceof Error ? error.message : String(error)} onRetry={refetch} />
        ) : games.length === 0 ? (
          <EmptyState title={`No ${L.noun} games on ${label}`} body="Pick a slate day on the rail." />
        ) : (
          <div className="space-y-2">
            {slate?.oddsMissing && (
              <p className="text-[11px] text-gold">Caesars prices are missing for this slate — sides without a price are greyed out.</p>
            )}
            {games.map((g, i) => (
              <Reveal key={g.id} delay={Math.min(i, 8) * 0.03} y={10}>
                <div data-cfb-game={g.id} className={focus?.market === "sides" && focus.gameId === g.id ? focusRing(L.id) : undefined}>
                  <SlipGameCard game={g} mode={mode} picked={pickedByGame.get(g.id) ?? null} onPick={toggle} />
                </div>
              </Reveal>
            ))}
          </div>
        )
      ) : propsQ.isPending ? (
        <PropSkeleton />
      ) : propsQ.isError ? (
        <ErrorState
          title="Player props did not load"
          body={propsQ.error instanceof Error ? propsQ.error.message : String(propsQ.error)}
          onRetry={() => void propsQ.refetch()}
        />
      ) : !board || board.oddsMissing || marketRows === 0 ? (
        <EmptyState
          title="Caesars hasn't posted player props for this slate yet"
          body={
            board
              ? `${navLabel} · ${board.fetched} of ${board.events} event${board.events === 1 ? "" : "s"} priced${board.capped ? " (capped)" : ""}${board.oddsMissing ? " · odds feed missing" : ""}${board.budgeted ? " · today's props budget is used up — more games price again tomorrow" : ""} · ${label}`
              : label
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No player matches that search"
          body={`${marketRows} ${navLabel} line${marketRows === 1 ? "" : "s"} across ${board.fetched} priced event${board.fetched === 1 ? "" : "s"} — clear the search to see them.`}
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <Reveal key={g.gameId} delay={Math.min(i, 8) * 0.03} y={10}>
              <PropGameGroup group={g} game={gameById.get(g.gameId) ?? null} market={nav} mode={mode} focus={focus} pickedKeys={pickedKeys} onPick={toggle} />
            </Reveal>
          ))}
          <p className="px-1 text-[9.5px] leading-snug text-faint">
            priced {board.fetched - board.noProps} of {board.events} game{board.events === 1 ? "" : "s"}
            {board.live ? ` · ${board.live} in play` : ""} · cached {cacheLabel(board)}{board.capped ? ` · capped at ${CFB_PROPS.maxEvents}` : ""}
            {board.stale ? ` · ${board.live || "some"} in-play game${board.live === 1 ? "" : "s"} show lines as priced at ${cfbPricedAtLabel(board)}${board.budgeted ? " — today's props budget is used up" : ""}` : board.budgeted ? " · today's props budget is used up — more games price again tomorrow" : ""}
            {board.czMissing ? ` · ${board.czMissing} game${board.czMissing === 1 ? "" : "s"} post player props at other books but no Caesars line yet — re-checked every ${CFB_PROPS.czMissingRevalidateSec / 60} min inside ${CFB_PROPS.czMissingWindowSec / 3600} h of kickoff` : ""}
            {board.noProps ? ` · ${board.noProps} game${board.noProps === 1 ? "" : "s"} on the slate ha${board.noProps === 1 ? "s" : "ve"} no player props posted at the books we price` : ""} ·
            prices are posted quotes, never invented · the % on a leg is the model&apos;s number for that line.
          </p>
        </div>
      )}

      {calc && (
        <CfbSlip
          legs={legs}
          calc={calc}
          stake={stake}
          onStake={setStake}
          onRemove={(key) => setLegs((prev) => prev.filter((l) => l.key !== key))}
          onClear={() => setLegs([])}
          bottom={bottom}
          copyText={copyText}
        />
      )}
    </div>
  );
}
