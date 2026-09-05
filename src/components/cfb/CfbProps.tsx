"use client";

import { useMemo, useState } from "react";
import { useCfbDesk } from "@/components/cfb/CfbBuilder";
import { CfbSlip, type CfbSlipLeg } from "@/components/cfb/CfbSlip";
import { TeamMark } from "@/components/cfb/TeamMark";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { useShellInsets } from "@/components/props/useShellInsets";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { kickoffLabel } from "@/lib/cfb/dates";
import { fmtLine, rowProbAt, sideLabel } from "@/lib/cfb/model";
import { CFB_MODEL } from "@/lib/cfb/rules";
import type { CfbGame, CfbMarketKey, CfbQuote, CfbRow, CfbSideKey } from "@/lib/cfb/types";
import { amFmt, combineTicket } from "@/lib/ticket-math";
import { railLabel } from "@/lib/games";

/**
 * CFB PARLAY BUILDER (INSTRUCTION 38, 2026-09-05): the College Football sandbox. The day's
 * games as compact cards — ML / spread / total, both sides tappable — priced at Caesars or at
 * the best posted book (a toggle), one side per game on the slip. The sticky bottom slip
 * (CfbSlip) combines the legs with `combineTicket` on the model's own win probabilities.
 * Purely a sandbox: nothing here is tracked and nothing writes the CFB ledger.
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

function bookTag(q: CfbQuote): string {
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

export function CfbProps() {
  const { today, date, dates, pick, slate, loading, error, refetch } = useCfbDesk();
  const { bottom } = useShellInsets();
  const [mode, setMode] = useState<PriceMode>("cz");
  const [legs, setLegs] = useState<CfbSlipLeg[]>([]);
  const [stake, setStake] = useState(10);

  const calc = useMemo(() => combineTicket(legs.map((l) => ({ cz: l.cz, prob: l.prob }))), [legs]);
  const pickedByGame = useMemo(() => new Map(legs.map((l) => [l.gameId, l.key])), [legs]);

  const toggle = (leg: CfbSlipLeg) =>
    setLegs((prev) => {
      if (prev.some((l) => l.key === leg.key)) return prev.filter((l) => l.key !== leg.key);
      /* one side per game — a new pick on a game replaces the old one */
      return [...prev.filter((l) => l.gameId !== leg.gameId), leg];
    });

  const games = useMemo(() => (slate ? [...slate.games].sort((a, b) => a.start.localeCompare(b.start)) : []), [slate]);

  const copyText = useMemo(() => {
    if (!calc) return "";
    const lines = [
      `CFB slip · ${railLabel(date)} · ${calc.n} leg${calc.n === 1 ? "" : "s"} · ${amFmt(calc.am)} (${calc.dec.toFixed(2)}x)`,
      ...legs.map((l) => `• ${l.label} · ${l.sub} · ${amFmt(l.cz)} ${l.book}`),
      `$${stake} → pays $${calc.payout(stake).toFixed(2)} · true ${(calc.trueProb * 100).toFixed(1)}% · EV ${calc.ev >= 0 ? "+" : ""}${(calc.ev * 100).toFixed(1)}%`,
      "Sandbox — not tracked, not in the CFB ledger.",
    ];
    return lines.join("\n");
  }, [calc, legs, stake, date]);

  const label = date === today ? "Today" : railLabel(date);

  return (
    <div className={legs.length ? "pb-20" : ""}>
      <p className="mb-3 text-[11.5px] text-muted">Sandbox · nothing here is tracked or enters the CFB ledger.</p>
      <DateRail dates={dates} date={date} today={today} onPick={pick} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented options={PRICE_OPTIONS} value={mode} onChange={setMode} size="sm" tone="cfb" label="Price at" />
        <span className="num text-[10.5px] text-faint">
          {mode === "cz" ? "Caesars is the settling book" : `best of ${CFB_MODEL.minBooks}+ books · Caesars settles`}
        </span>
      </div>

      {loading ? (
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
