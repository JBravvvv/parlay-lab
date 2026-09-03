"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterPill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { teamLogo } from "@/lib/mlb-visuals";
import { dateStrip, type GamesPayload, type GameTeam, type ShapedGame } from "@/lib/games";

/* GAMES TAB (2026-09-03, Josh): every game of the day, MLB-app style — date strip,
   LIVE / UPCOMING / FINAL sections, a card per game with logos, records, the
   engine board's moneyline (or the score), probables / decisions with season
   lines, broadcasts, and an expandable linescore for live and final games.
   Every figure is the feed's own; a missing one prints "—". */

const PT = "America/Los_Angeles";

function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
}
function stripLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
function startLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: PT }).format(
    new Date(iso),
  );
}
const pitcherLine = (p: { name: string; wl: string | null; era: string | null }) =>
  `${p.name.split(" ").slice(-1)[0]}${p.wl ? ` ${p.wl}` : ""}${p.era ? ` | ${p.era} ERA` : ""}`;

/** ESPN's logo codes differ from statsapi abbreviations on a few clubs. */
const LOGO_CODE: Record<string, string> = { ath: "oak", cws: "chw", az: "ari", was: "wsh" };
const logoFor = (abbr: string) => {
  const a = abbr.toLowerCase();
  return teamLogo(LOGO_CODE[a] ?? a);
};

export default function GamesPage() {
  const today = useMemo(ptToday, []);
  const [date, setDate] = useState<string>(() => {
    if (typeof window === "undefined") return today;
    const q = new URLSearchParams(window.location.search).get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  });
  const strip = useMemo(() => dateStrip(today, 2), [today]);

  const q = useQuery<GamesPayload>({
    queryKey: ["games", date],
    queryFn: async () => {
      const r = await fetch(`/api/games?date=${date}`);
      const j = (await r.json().catch(() => null)) as (GamesPayload & { error?: string }) | null;
      if (!r.ok || !j || j.error) throw new Error(j?.error ?? `games ${r.status}`);
      return j;
    },
    refetchInterval: (query) => ((query.state.data?.counts.live ?? 0) > 0 ? 60_000 : 300_000),
    staleTime: 30_000,
  });

  const pick = (d: string) => {
    setDate(d);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("date", d);
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* URL sync is a convenience */
    }
  };

  const games = q.data?.games ?? [];
  const live = games.filter((g) => g.status === "live");
  const upcoming = games.filter((g) => g.status === "upcoming" || g.status === "postponed");
  const final = games.filter((g) => g.status === "final");

  return (
    <div>
      <PageHeader
        title="Games"
        sub="Every game on the slate, from MLB's official feed. Moneylines are the day's board prices; scores and linescores update live."
      />

      {/* date strip — one row, scrolls sideways inside itself on the narrowest phones */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max gap-1.5">
          {strip.map((d) => (
            <FilterPill key={d} selected={d === date} onClick={() => pick(d)} className="whitespace-nowrap">
              {d === today ? "Today" : stripLabel(d)}
            </FilterPill>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass p-4">
              <Skeleton className="mb-3 h-3 w-24" />
              <Skeleton className="mb-2 h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load the slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : games.length === 0 ? (
        <EmptyState title="No games" body={`Nothing on the MLB schedule for ${stripLabel(date)}.`} />
      ) : (
        <div className="space-y-6">
          <Section title="Live" games={live} tone="text-live" />
          <Section title="Upcoming" games={upcoming} />
          <Section title="Final" games={final} />
        </div>
      )}
    </div>
  );
}

function Section({ title, games, tone = "text-muted" }: { title: string; games: ShapedGame[]; tone?: string }) {
  if (!games.length) return null;
  return (
    <section>
      <h2 className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
        {tone === "text-live" && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />}
        {title}
        <span className="num text-faint">{games.length}</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.pk} g={g} />
        ))}
      </div>
    </section>
  );
}

function GameCard({ g }: { g: ShapedGame }) {
  const upcoming = g.status === "upcoming";
  const showScore = g.status === "live" || g.status === "final";
  const header =
    g.status === "live" && g.inning ? (
      <span className="flex items-center gap-1.5 text-live">
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" />
        {g.detail === "Warmup" ? "Warmup" : `${g.inning.state} ${g.inning.ordinal}`}
      </span>
    ) : g.status === "live" ? (
      <span className="text-live">{g.detail}</span>
    ) : g.status === "final" ? (
      <span className="text-text">FINAL{g.linescore && g.linescore.innings.length > 9 ? `/${g.linescore.innings.length}` : ""}</span>
    ) : g.status === "postponed" ? (
      <span className="text-gold">{g.detail.toUpperCase()}</span>
    ) : (
      <span className="text-text">{startLabel(g.start)}</span>
    );

  const sub =
    g.status === "final" && g.decisions ? (
      <>
        {g.decisions.w && <span>W: {pitcherLine(g.decisions.w)}</span>}
        {g.decisions.l && <span> · L: {pitcherLine(g.decisions.l)}</span>}
        {g.decisions.s && (
          <span>
            {" "}
            · S: {g.decisions.s.name.split(" ").slice(-1)[0]}
            {g.decisions.s.saves != null ? ` ${g.decisions.s.saves}` : ""}
          </span>
        )}
      </>
    ) : g.away.probable || g.home.probable ? (
      <>
        <span>
          {g.away.abbr}: {g.away.probable ? pitcherLine(g.away.probable) : "TBD"}
        </span>
        <span>
          {" "}
          · {g.home.abbr}: {g.home.probable ? pitcherLine(g.home.probable) : "TBD"}
        </span>
      </>
    ) : null;

  const rows = (
    <div className="space-y-1.5">
      <TeamRow t={g.away} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.away.score ?? 0) > (g.home.score ?? 0)} />
      <TeamRow t={g.home} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.home.score ?? 0) > (g.away.score ?? 0)} />
    </div>
  );

  const meta = (
    <div className="mt-2.5 space-y-0.5 text-[11px] leading-snug text-muted">
      {sub && <div className="num">{sub}</div>}
      {(g.broadcasts.length > 0 || g.venue) && (
        <div className="text-faint">
          {g.broadcasts.join(", ")}
          {g.broadcasts.length > 0 && g.venue ? " · " : ""}
          {g.venue}
        </div>
      )}
    </div>
  );

  const head = (
    <div className="mb-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em]">
      {header}
      {showScore && g.linescore && <span className="text-[10px] font-medium normal-case tracking-normal text-faint">Linescore</span>}
    </div>
  );

  if (showScore && g.linescore) {
    return (
      <details className="glass group min-w-0 p-4">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {head}
          {rows}
          {meta}
        </summary>
        <LinescoreGrid g={g} />
      </details>
    );
  }
  return (
    <div className="glass min-w-0 p-4">
      {head}
      {rows}
      {meta}
    </div>
  );
}

function TeamRow({ t, score, upcoming, winner }: { t: GameTeam; score: boolean; upcoming: boolean; winner: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoFor(t.abbr)} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 object-contain" loading="lazy" />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={`truncate text-[13.5px] font-semibold ${winner ? "text-text" : score ? "text-muted" : "text-text"}`}>
          <span className="mr-1 text-[11px] text-faint">{t.abbr}</span>
          {t.name}
        </span>
        <span className="num shrink-0 text-[10.5px] text-faint">{t.record}</span>
      </div>
      {score ? (
        <span className={`num shrink-0 text-[20px] font-bold leading-none ${winner ? "text-text" : "text-muted"}`}>
          {t.score ?? "—"}
        </span>
      ) : upcoming ? (
        <span className="num flex shrink-0 flex-col items-end leading-tight">
          <span className="text-[13.5px] font-bold text-gold">{t.ml?.odds ?? "—"}</span>
          {t.ml && (
            <span className="text-[9.5px] text-faint">
              {t.ml.book ?? ""}
              {t.ml.cz ? ` · CZ ${t.ml.cz}` : ""}
            </span>
          )}
        </span>
      ) : null}
    </div>
  );
}

function LinescoreGrid({ g }: { g: ShapedGame }) {
  const ls = g.linescore!;
  const n = Math.max(9, ls.innings.length);
  const cells = Array.from({ length: n }, (_, i) => ls.innings[i] ?? { n: i + 1, away: null, home: null });
  const cell = (v: number | null) => (v == null ? "" : String(v));
  const row = (label: string, side: "away" | "home") => (
    <tr>
      <th className="sticky left-0 bg-surface/90 pr-3 text-left text-[11px] font-semibold text-text">{label}</th>
      {cells.map((c) => (
        <td key={c.n} className="num px-1.5 text-center text-[11.5px] text-muted">
          {cell(c[side])}
        </td>
      ))}
      <td className="num border-l border-white/[0.08] px-1.5 pl-2.5 text-center text-[11.5px] font-bold text-text">{ls.totals[side].r}</td>
      <td className="num px-1.5 text-center text-[11.5px] text-muted">{ls.totals[side].h}</td>
      <td className="num px-1.5 text-center text-[11.5px] text-muted">{ls.totals[side].e}</td>
    </tr>
  );
  return (
    <div className="-mx-4 mt-3 overflow-x-auto border-t border-white/[0.06] px-4 pt-3" style={{ scrollbarWidth: "none" }}>
      <table className="w-max border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface/90" />
            {cells.map((c) => (
              <th key={c.n} className="num px-1.5 text-center text-[10px] font-semibold text-faint">
                {c.n}
              </th>
            ))}
            <th className="num border-l border-white/[0.08] px-1.5 pl-2.5 text-center text-[10px] font-semibold text-faint">R</th>
            <th className="num px-1.5 text-center text-[10px] font-semibold text-faint">H</th>
            <th className="num px-1.5 text-center text-[10px] font-semibold text-faint">E</th>
          </tr>
        </thead>
        <tbody>
          {row(g.away.abbr, "away")}
          {row(g.home.abbr, "home")}
        </tbody>
      </table>
    </div>
  );
}
