"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DateRail } from "@/components/games/DateRail";
import { LinescoreTable } from "@/components/games/LinescoreTable";
import { logoFor, ptToday, startLabel } from "@/components/games/logo";
import { PlayerName } from "@/components/player/PlayerName";
import {
  SEASON_WINDOW,
  cardExpansion,
  cardLinkLabel,
  clampToWindow,
  railLabel,
  seasonDates,
  xBottomOf,
  type GamesPayload,
  type GameTeam,
  type ShapedGame,
} from "@/lib/games";
import { CFB_ENABLED, NFL_ENABLED } from "@/lib/features";
import { useSport } from "@/lib/sport";
import { CfbGames } from "@/components/cfb/CfbGames";
import { NflGames } from "@/components/nfl/NflGames";

/* GAMES TAB (2026-09-03, Josh): every game of the day, MLB-app style — a date
   rail over the whole September window (9/1 → the last regular-season day, Sun
   9/27), LIVE / UPCOMING / FINAL sections, a card per game with logos, records,
   the engine board's moneyline (or the score), probables / decisions with season
   lines and broadcasts. Every figure is the feed's own; a missing one prints "—".

   INSTRUCTION 46 (2026-09-08), Josh's word, verbatim: "On 'Games' tab on phone app
   version, game boxes can be significantly smaller to fit more on one screen. They
   can also be expandable/collapsible. I would start with them collapsed how they
   are and allow them to be clicked to expand down to show box score preview. To go
   to full box score, just click 'box score' button in top right of each box" —
   and "'Preview' should be named 'Game Preview'". So: a compact card (one line per
   club: logo, abbr, record, score or ML), collapsed by default; tapping the body
   opens the linescore + W/L/S (or the probables) and venue / TV inline; the
   top-right button — "Box score" for a played game, "Game Preview" for an
   unplayed one — is the only way to the full page. */

/** "Skubal 8-7 | 2.84 ERA" — the surname is tappable and opens the player profile sheet by MLB id. */
const pitcherLine = (p: { id: number; name: string; wl: string | null; era: string | null }) => (
  <>
    <PlayerName id={p.id} name={p.name}>
      {p.name.split(" ").slice(-1)[0]}
    </PlayerName>
    {`${p.wl ? ` ${p.wl}` : ""}${p.era ? ` | ${p.era} ERA` : ""}`}
  </>
);

export default function GamesPage() {
  // useSearchParams needs a Suspense boundary; it is read on both server and client so ?date= hydrates cleanly
  return (
    <Suspense fallback={null}>
      <Games />
    </Suspense>
  );
}

function Games() {
  const today = useMemo(ptToday, []);
  const sport = useSport();
  const cfbDesk = CFB_ENABLED && sport === "cfb";
  const nflDesk = NFL_ENABLED && sport === "nfl";
  const qDate = useSearchParams().get("date");
  // a URL date outside the window (or a today past 9/27) clamps to the nearest edge
  const [date, setDate] = useState<string>(() => clampToWindow(qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : today));
  const rail = useMemo(() => seasonDates(), []);

  const q = useQuery<GamesPayload>({
    queryKey: ["games", date],
    enabled: !cfbDesk && !nflDesk, // the CFB and NFL desks never spend an MLB games fetch
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

  /* CFB desk (2026-09-05): the global SportSwitch routes the page to the College Football
     slate. Every hook above has already run, so this early return is hooks-safe. */
  if (cfbDesk) {
    return (
      <div>
        <PageHeader
          title="Games"
          eyebrow="College Football"
          chip={<CfbChip />}
          sub="Every FBS game by slate day — kickoffs, Caesars lines and finals from the desk's CFB feed."
        />
        <CfbGames />
      </div>
    );
  }

  /* NFL desk (2026-09-08): the shared football games list on the NFL desk handles. */
  if (nflDesk) {
    return (
      <div>
        <PageHeader
          title="Games"
          eyebrow="National Football League"
          chip={<NflChip />}
          sub="Every NFL game by slate day — kickoffs, Caesars lines and finals from the desk's NFL feed."
        />
        <NflGames />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Games"
        sub="Every game on the slate, from MLB's official feed. Moneylines are the day's board prices; scores and linescores update live."
      />

      <DateRail dates={rail} date={date} today={today} onPick={pick} />

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
        <EmptyState title="No games" body={`Nothing on the MLB schedule for ${railLabel(date)}.`} />
      ) : (
        <div className="space-y-6">
          <Section title="Live" games={live} tone="text-live" date={date} />
          <Section title="Upcoming" games={upcoming} date={date} />
          <Section title="Final" games={final} date={date} />
        </div>
      )}
      {date === SEASON_WINDOW.end && (
        <p className="mt-6 text-center text-[11px] text-faint">Sunday {railLabel(SEASON_WINDOW.end).slice(4)} is the last day of the regular season.</p>
      )}
    </div>
  );
}

function Section({ title, games, tone = "text-muted", date }: { title: string; games: ShapedGame[]; tone?: string; date: string }) {
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
          <GameCard key={g.pk} g={g} date={date} />
        ))}
      </div>
    </section>
  );
}

function GameCard({ g, date }: { g: ShapedGame; date: string }) {
  // INSTRUCTION 46: collapsed by default; the body toggles, the top-right button navigates
  const [open, setOpen] = useState(false);
  const upcoming = g.status === "upcoming";
  const showScore = g.status === "live" || g.status === "final";
  const ex = cardExpansion(g);
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
  const dh = g.gameNumber != null ? <span className="ml-1.5 rounded-full border border-line-2 px-1.5 py-px text-[9px] font-bold uppercase text-muted">Game {g.gameNumber}</span> : null;

  const sub = ex.decisions && g.decisions ? (
    <>
      {g.decisions.w && <span>W: {pitcherLine(g.decisions.w)}</span>}
      {g.decisions.l && <span> · L: {pitcherLine(g.decisions.l)}</span>}
      {g.decisions.s && (
        <span>
          {" "}
          · S:{" "}
          <PlayerName id={g.decisions.s.id} name={g.decisions.s.name}>
            {g.decisions.s.name.split(" ").slice(-1)[0]}
          </PlayerName>
          {g.decisions.s.saves != null ? ` ${g.decisions.s.saves}` : ""}
        </span>
      )}
    </>
  ) : ex.probables ? (
    <>
      <span>
        {g.away.abbr}: {g.away.probable ? pitcherLine(g.away.probable) : "TBD"}
      </span>
      <span>
        {" "}
        · {g.home.abbr}: {g.home.probable ? pitcherLine(g.home.probable) : "TBD"}
      </span>
    </>
  ) : upcoming ? (
    <span>Probables TBD</span>
  ) : null;

  const panelId = `game-${g.pk}-detail`;
  return (
    <article className="glass min-w-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
        <span className="flex min-w-0 items-center truncate">{header}{dh}</span>
        <Link
          href={`/games/${g.pk}?date=${date}`}
          replace
          className="inline-flex min-h-[32px] shrink-0 items-center rounded-full border border-line-2 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold normal-case tracking-normal text-muted transition-[transform,background,color] duration-(--dur-fast) hover:bg-white/[0.08] hover:text-text active:scale-[0.96]"
        >
          {cardLinkLabel(g.status)} ›
        </Link>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 pb-2.5 pt-1.5 text-left transition-[background] duration-(--dur-fast) hover:bg-white/[0.03] active:bg-white/[0.05]"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <TeamRow t={g.away} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.away.score ?? 0) > (g.home.score ?? 0)} />
          <TeamRow t={g.home} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.home.score ?? 0) > (g.away.score ?? 0)} />
        </div>
        <span aria-hidden className={`shrink-0 text-[12px] leading-none text-faint transition-transform duration-(--dur-fast) ${open ? "rotate-180" : ""}`}>
          ⌄
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-2 border-t border-white/[0.06] px-3 py-2.5 text-[11px] leading-snug text-muted">
          {ex.linescore && g.linescore && (
            <LinescoreTable
              ls={{ ...g.linescore, xBottom: xBottomOf(g.linescore, g.status) }}
              away={g.away.abbr}
              home={g.home.abbr}
              winner={g.status === "final" ? ((g.away.score ?? 0) > (g.home.score ?? 0) ? "away" : (g.home.score ?? 0) > (g.away.score ?? 0) ? "home" : null) : null}
            />
          )}
          {sub && <div className="num">{sub}</div>}
          {ex.venue && (
            <div className="text-faint">
              {g.broadcasts.join(", ")}
              {g.broadcasts.length > 0 && g.venue ? " · " : ""}
              {g.venue}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** one compact line per club: logo, abbr (full name from md up), record, then the score or the ML */
function TeamRow({ t, score, upcoming, winner }: { t: GameTeam; score: boolean; upcoming: boolean; winner: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoFor(t.abbr)} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={`truncate text-[13px] font-semibold ${winner ? "text-text" : score ? "text-muted" : "text-text"}`}>
          {t.abbr}
          <span className="ml-1.5 hidden text-[12px] font-medium text-muted md:inline">{t.name}</span>
        </span>
        <span className="num shrink-0 text-[10px] text-faint">{t.record}</span>
      </div>
      {score ? (
        <span className={`num shrink-0 text-[17px] font-bold leading-none ${winner ? "text-text" : "text-muted"}`}>{t.score ?? "—"}</span>
      ) : upcoming ? (
        <span className="num flex shrink-0 items-baseline gap-1.5 leading-none">
          {t.ml && (
            <span className="text-[9px] text-faint">
              {t.ml.book ?? ""}
              {t.ml.cz ? ` · CZ ${t.ml.cz}` : ""}
            </span>
          )}
          <span className="text-[13px] font-bold text-gold">{t.ml?.odds ?? "—"}</span>
        </span>
      ) : null}
    </div>
  );
}

/* CFB desk chip — the 🏈 badge beside the h1 whenever the global SportSwitch is on College Football */
function CfbChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cfb/40 bg-cfb/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cfb">
      🏈 CFB
    </span>
  );
}

/* NFL desk chip — the 🏈 badge beside the h1 whenever the global SportSwitch is on the NFL (2026-09-08) */
function NflChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-nfl/40 bg-nfl/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-nfl">
      🏈 NFL
    </span>
  );
}
