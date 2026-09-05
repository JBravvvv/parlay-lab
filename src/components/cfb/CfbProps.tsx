"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCfbDesk } from "@/components/cfb/CfbBuilder";
import { addCfbLeg, CfbSlip, type CfbSlipLeg } from "@/components/cfb/CfbSlip";
import { TeamMark } from "@/components/cfb/TeamMark";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { useShellInsets } from "@/components/props/useShellInsets";
import { GradeChip } from "@/components/ui/GradeChip";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { CFB_PROPS_STALE_MS, cfbPropsQueryKey, loadCfbProps } from "@/lib/cfb/client";
import { kickoffLabel } from "@/lib/cfb/dates";
import { fmtLine, rowProbAt, sideLabel } from "@/lib/cfb/model";
import { CFB_PROP_MARKETS, type CfbPropMarket, type CfbPropQuote, type CfbPropRow } from "@/lib/cfb/props-types";
import { CFB_MODEL, CFB_PROPS } from "@/lib/cfb/rules";
import type { CfbGame, CfbMarketKey, CfbQuote, CfbRow, CfbSideKey } from "@/lib/cfb/types";
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

const MARKETS: { key: CfbMarketKey; label: string; sides: [CfbSideKey, CfbSideKey] }[] = [
  { key: "ml", label: "ML", sides: ["away", "home"] },
  { key: "spread", label: "Spread", sides: ["away", "home"] },
  { key: "total", label: "Total", sides: ["over", "under"] },
];

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
  };
}

/** short cell text: "IND" / "IND +40.5" / "O 56.5" */
function cellText(game: CfbGame, market: CfbMarketKey, side: CfbSideKey, line: number | null): string {
  if (market === "total") return `${side === "over" ? "O" : "U"} ${line ?? "—"}`;
  const abbr = side === "home" ? game.home.abbr : game.away.abbr;
  if (market === "ml") return abbr;
  return `${abbr} ${line == null ? "—" : fmtLine(line)}`;
}

function SideCell({
  game,
  market,
  side,
  mode,
  selected,
  onPick,
}: {
  game: CfbGame;
  market: CfbMarketKey;
  side: CfbSideKey;
  mode: PriceMode;
  selected: boolean;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  const row = rowFor(game, market, side);
  const q = row ? quoteFor(row, mode) : null;
  const closed = game.status === "final" || game.status === "postponed";
  if (!row || !q) {
    return (
      <div className="num flex h-10 items-center justify-center rounded-[8px] border border-dashed border-line-2 text-[10.5px] text-faint">
        {row ? `no ${mode === "cz" ? "CZ" : "price"}` : "—"}
      </div>
    );
  }
  const tag = bookTag(q);
  return (
    <button
      aria-pressed={selected}
      disabled={closed}
      onClick={() => onPick(legOf(game, row, q))}
      className={`num press flex h-10 w-full flex-col items-center justify-center rounded-[8px] border leading-none transition-colors duration-(--dur-fast) disabled:opacity-40 ${
        selected ? "border-cfb/60 bg-cfb/10 ring-1 ring-cfb/50" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
      title={`${row.label} · fair ${(row.fair * 100).toFixed(1)}% · EV at Caesars ${row.evCz == null ? "—" : `${row.evCz.toFixed(1)}%`}`}
    >
      <span className="text-[10.5px] font-semibold text-text">{cellText(game, market, side, q.line)}</span>
      <span className="mt-1 text-[11px] font-bold text-cfb">
        {amFmt(q.price)}
        {tag !== "CZ" && <span className="ml-1 text-[8px] font-semibold uppercase text-faint">{tag}</span>}
      </span>
    </button>
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
  const live = game.status === "live";
  const done = game.status === "final";
  const score = game.homeScore != null && game.awayScore != null ? `${game.awayScore}–${game.homeScore}` : null;
  const when = done ? `Final${score ? ` · ${score}` : ""}` : live ? `${game.detail || "Live"}${score ? ` · ${score}` : ""}` : kickoffLabel(game.start);
  return (
    <article className={`glass card-lift px-3 py-3 ${picked ? "ring-1 ring-cfb/40" : ""}`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-text">
          <TeamMark team={game.away} size="xs" showRank />
          <span className="text-faint">{game.neutral ? "vs" : "@"}</span>
          <TeamMark team={game.home} size="xs" showRank />
        </div>
        <span className={`num shrink-0 text-[10.5px] ${live ? "text-live" : "text-faint"}`}>
          {live && <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" aria-hidden />}
          {when}
        </span>
      </header>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {MARKETS.map((m) => (
          <div key={m.key} className="space-y-1">
            <div className="text-center text-[8.5px] font-bold uppercase tracking-[0.14em] text-faint">{m.label}</div>
            {m.sides.map((side) => {
              const row = rowFor(game, m.key, side);
              return (
                <SideCell
                  key={side}
                  game={game}
                  market={m.key}
                  side={side}
                  mode={mode}
                  selected={row != null && picked === row.key}
                  onPick={onPick}
                />
              );
            })}
          </div>
        ))}
      </div>
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
/** the props route's cache window in hours (CFB_PROPS.revalidateSec) — never hardcoded in the footnote */
const PROPS_CACHE_H = CFB_PROPS.revalidateSec / 3600;

function normName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function propQuote(row: CfbPropRow, mode: PriceMode): CfbPropQuote | null {
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
 * (Caesars alone at 249.5 against a 245.5 consensus) has no fair, so it gets no leg — the dashed
 * cell, exactly as the Board prints EV "—" for it.
 */
function propLegOf(row: CfbPropRow, q: CfbPropQuote): CfbSlipLeg | null {
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
  };
}

/** one row per player + line: both sides of an O/U prop, or the single "yes" side */
type PlayerLine = { id: string; player: string; team: string | null; line: number | null; sides: CfbPropRow[] };

type PropGroup = { gameId: string; kickoff: string; sub: string; lines: PlayerLine[] };

function evRank(row: CfbPropRow, mode: PriceMode): number {
  const ev = propEv(row, mode);
  return ev == null ? -Infinity : ev;
}

/** group prop rows by game (kickoff order), then by player + line, best EV first */
function groupProps(rows: CfbPropRow[], market: CfbPropMarket, mode: PriceMode, needle: string): PropGroup[] {
  const games = new Map<string, PropGroup>();
  for (const r of rows) {
    if (r.market !== market) continue;
    if (needle && !normName(r.player).includes(needle)) continue;
    let g = games.get(r.gameId);
    if (!g) {
      g = { gameId: r.gameId, kickoff: r.kickoff, sub: r.sub, lines: [] };
      games.set(r.gameId, g);
    }
    const id = `${normName(r.player)}|${r.line ?? ""}`;
    let pl = g.lines.find((x) => x.id === id);
    if (!pl) {
      pl = { id, player: r.player, team: r.teamAbbr ?? r.team, line: r.line, sides: [] };
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
  out.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.sub.localeCompare(b.sub));
  return out;
}

function ctxLine(row: CfbPropRow): string | null {
  const c = row.ctx;
  if (!c || c.perGame == null) return null;
  const per = Number.isInteger(c.perGame) ? String(c.perGame) : c.perGame.toFixed(1);
  return `per game ${per} · ${c.g} G`;
}

/* prop-rows:start — plain surfaces only on per-item rows (the iOS freeze rule: no blur filters here) */

function PropPrice({
  row,
  mode,
  selected,
  onPick,
}: {
  row: CfbPropRow;
  mode: PriceMode;
  selected: boolean;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  const q = propQuote(row, mode);
  const closed = row.status === "final" || row.status === "postponed";
  const leg = q ? propLegOf(row, q) : null;
  if (!q || !leg) {
    return (
      <span className="num flex h-8 w-[74px] items-center justify-center rounded-[8px] border border-dashed border-line-2 text-[10px] text-faint">
        {row.side === "yes" ? "no price" : `${sideTag(row.side)} —`}
      </span>
    );
  }
  const tag = bookTag(q);
  return (
    <button
      aria-pressed={selected}
      disabled={closed}
      onClick={() => onPick(leg)}
      className={`num press flex h-8 w-[74px] flex-col items-center justify-center rounded-[8px] border leading-none transition-colors duration-(--dur-fast) disabled:opacity-40 ${
        selected ? "border-cfb/60 bg-cfb/10 ring-1 ring-cfb/50" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
      title={`${leg.label} · fair ${row.fair == null ? "—" : `${(row.fair * 100).toFixed(1)}%`} · EV ${propEv(row, mode) == null ? "—" : `${propEv(row, mode)!.toFixed(1)}%`}`}
    >
      <span className="text-[9.5px] font-semibold text-muted">
        {row.side === "yes" ? "YES" : `${sideTag(row.side)} ${q.line ?? row.line ?? "—"}`}
      </span>
      <span className="mt-0.5 text-[11px] font-bold text-cfb">
        {amFmt(q.price)}
        {tag !== "CZ" && <span className="ml-1 text-[8px] font-semibold uppercase text-faint">{tag}</span>}
      </span>
    </button>
  );
}

function PropRow({
  pl,
  mode,
  pickedKeys,
  onPick,
}: {
  pl: PlayerLine;
  mode: PriceMode;
  pickedKeys: Set<string>;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  /* the row's headline number is its best-EV side at the chosen price */
  const lead = pl.sides.reduce((a, b) => (evRank(b, mode) > evRank(a, mode) ? b : a), pl.sides[0]);
  const ev = propEv(lead, mode);
  const grade = gradeFromEv(ev);
  const ctx = ctxLine(lead);
  return (
    <div className="flex min-h-[44px] items-center gap-2 border-t border-white/[0.04] py-1.5 first:border-t-0">
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
      <div className="flex shrink-0 gap-1">
        {pl.sides.map((r) => (
          <PropPrice key={r.key} row={r} mode={mode} selected={pickedKeys.has(r.key)} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function PropGameGroup({
  group,
  game,
  mode,
  pickedKeys,
  onPick,
}: {
  group: PropGroup;
  game: CfbGame | null;
  mode: PriceMode;
  pickedKeys: Set<string>;
  onPick: (leg: CfbSlipLeg) => void;
}) {
  return (
    <section className="rounded-[14px] border border-white/[0.07] bg-white/[0.03]">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        {game ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-text">
            <TeamMark team={game.away} size="xs" showRank />
            <span className="text-faint">{game.neutral ? "vs" : "@"}</span>
            <TeamMark team={game.home} size="xs" showRank />
          </div>
        ) : (
          <span className="truncate text-[12px] font-semibold text-text">{group.sub}</span>
        )}
        <span className="num shrink-0 text-[10.5px] text-faint">
          {kickoffLabel(group.kickoff)} · {group.lines.length}
        </span>
      </header>
      <div className="px-3">
        {group.lines.map((pl) => (
          <PropRow key={pl.id} pl={pl} mode={mode} pickedKeys={pickedKeys} onPick={onPick} />
        ))}
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
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="px-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-h-[44px] items-center gap-2 border-t border-white/[0.04] py-1.5 first:border-t-0">
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-8 w-[74px] rounded-[8px]" />
                <Skeleton className="h-8 w-[74px] rounded-[8px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CfbProps() {
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

  const propsQ = useQuery({
    queryKey: cfbPropsQueryKey(date, bankroll),
    queryFn: () => loadCfbProps(date, { bankroll }),
    enabled: nav !== "sides" && !!date,
    staleTime: PROPS_STALE_MS,
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

  const games = useMemo(() => (slate ? [...slate.games].sort((a, b) => a.start.localeCompare(b.start)) : []), [slate]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

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

  const copyText = useMemo(() => {
    if (!calc) return "";
    const lines = [
      `CFB slip · ${railLabel(date)} · ${calc.n} leg${calc.n === 1 ? "" : "s"} · ${amFmt(calc.am)} (${calc.dec.toFixed(2)}x)`,
      ...legs.map((l) => `• ${l.label}${l.kind === "prop" ? ` (${l.marketLabel ?? l.market})` : ""} · ${l.sub} · ${amFmt(l.cz)} ${l.book}`),
      `$${stake} → pays $${calc.payout(stake).toFixed(2)} · true ${(calc.trueProb * 100).toFixed(1)}% · EV ${calc.ev >= 0 ? "+" : ""}${(calc.ev * 100).toFixed(1)}%`,
      "Sandbox — not tracked, not in the CFB ledger.",
    ];
    return lines.join("\n");
  }, [calc, legs, stake, date]);

  const label = date === today ? "Today" : railLabel(date);
  const navLabel = nav === "sides" ? "Sides" : marketMeta(nav).label;

  return (
    <div className={legs.length ? "pb-20" : ""}>
      <p className="mb-3 text-[11.5px] text-muted">Sandbox · nothing here is tracked or enters the CFB ledger.</p>
      <DateRail dates={dates} date={date} today={today} onPick={pick} />

      {/* market nav — sticky under the phone header; the segmented track scrolls sideways on 375px */}
      <div className="sticky z-20 -mx-4 mb-3 border-b border-white/[0.06] bg-bg/95 px-4 pb-2 pt-1 md:mx-0 md:px-0" style={{ top }}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <Segmented options={NAV_OPTIONS} value={nav} onChange={setNav} size="sm" tone="cfb" label="Market" className="w-max" />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Segmented options={PRICE_OPTIONS} value={mode} onChange={setMode} size="sm" tone="cfb" label="Price at" />
          <span className="num text-[10.5px] text-faint">
            {mode === "cz" ? "Caesars is the settling book" : `best of ${CFB_MODEL.minBooks}+ books · Caesars settles`}
          </span>
        </div>
        {nav !== "sides" && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
              aria-label="Search players"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-white/[0.08] bg-surface-2 px-2.5 text-[12px] text-text placeholder:text-faint"
            />
            <span className="num shrink-0 text-[10.5px] text-faint">
              {lineCount} line{lineCount === 1 ? "" : "s"} · {groups.length} game{groups.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      {note && (
        <div role="status" className="mb-2 rounded-[10px] border border-gold/30 bg-gold/[0.07] px-3 py-1.5 text-[10.5px] text-gold">
          {note}
        </div>
      )}

      {nav === "sides" ? (
        loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <ErrorState title="The CFB slate did not load" body={error instanceof Error ? error.message : String(error)} onRetry={refetch} />
        ) : games.length === 0 ? (
          <EmptyState title={`No FBS games on ${label}`} body="Pick a slate day on the rail." />
        ) : (
          <div className="space-y-2">
            {slate?.oddsMissing && (
              <p className="text-[11px] text-gold">Caesars prices are missing for this slate — sides without a price are greyed out.</p>
            )}
            {games.map((g, i) => (
              <Reveal key={g.id} delay={Math.min(i, 8) * 0.03} y={10}>
                <SlipGameCard game={g} mode={mode} picked={pickedByGame.get(g.id) ?? null} onPick={toggle} />
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
              <PropGameGroup group={g} game={gameById.get(g.gameId) ?? null} mode={mode} pickedKeys={pickedKeys} onPick={toggle} />
            </Reveal>
          ))}
          <p className="px-1 text-[9.5px] leading-snug text-faint">
            props for {board.fetched} of {board.events} game{board.events === 1 ? "" : "s"} · cached {PROPS_CACHE_H} h{board.capped ? ` · capped at ${CFB_PROPS.maxEvents}` : ""}
            {board.budgeted ? " · today's props budget is used up — more games price again tomorrow" : ""} ·
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
