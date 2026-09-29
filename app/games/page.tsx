"use client";
import { Overlay } from "@/components/ui/Overlay";
import { GameDetail } from "@/components/games/GameDetail";
import { TeamProfileExplorer } from "@/components/games/TeamProfileExplorer";
import { isGameCardBackground } from "@/lib/game-card-interaction";
import {useSportsbook} from "@/lib/sportsbook/store";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DateRail } from "@/components/games/DateRail";
import { LinescoreTable } from "@/components/games/LinescoreTable";
import { logoFor, ptToday, startLabel } from "@/components/games/logo";
import { PlayerName } from "@/components/player/PlayerName";
import { GradeChip } from "@/components/ui/GradeChip";
import { SplitsChip } from "@/components/ui/SplitsChip";
import { findGameSplits, sideSplit, type GameSplits } from "@/lib/splits";
import { useSplits } from "@/lib/use-splits";
import {
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

/* MLB schedule and postseason placeholders come from the official feed. */

/** "Skubal 8-7 | 2.84 ERA" — the surname is tappable and opens the player profile sheet by MLB id. */
const pitcherLine = (p: { id: number; name: string; wl: string | null; era: string | null }) => (
  <>
    <PlayerName id={p.id} name={p.name}>
      {p.name.split(" ").slice(-1)[0]}
    </PlayerName>
    {`${p.wl ? ` ${p.wl}` : ""}${p.era ? ` | ${p.era} ERA` : ""}`}
  </>
);

/* 2026-09-28: THE SHEET LIVES ON THE PAGE, NOT ON THE CARD. Each status has its own <Section> grid and a key only matches among
   siblings, so a game that changed status — Upcoming → Live at warmup, Live → Final on the refetch after the last out, a
   suspension — remounted its card, and the card-local sheet (live play-by-play, the Game Preview, a team page) vanished
   mid-read with no exit. One sheet now sits after the sections, keyed by gamePk: a card only asks to open it, the sheet reads
   its game by pk from the slate, and the last game seen for that pk keeps the title through a refetch that briefly lacks it.
   A failed background refetch no longer swaps the list for an error either — TanStack keeps q.data while isError is true, so
   the full error shows only with nothing loaded and the list gets a one-line "Refresh failed" note. */
type Sheet = { pk: number; team: GameTeam | null };

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cfbDesk = CFB_ENABLED && sport === "cfb";
  const nflDesk = NFL_ENABLED && sport === "nfl";
  const qDate = useSearchParams().get("date");
  // Keep archive links bounded while allowing every postseason date.
  const [date, setDate] = useState<string>(() => clampToWindow(qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : today));
  const rail = useMemo(() => seasonDates(), []);
  const calendar = useQuery<{ rounds: { name: string; date: string }[] }>({
    queryKey: ["mlb-postseason-calendar"], enabled: mounted && !cfbDesk && !nflDesk,
    queryFn: async () => { const res = await fetch("/api/games/calendar"); if (!res.ok) throw new Error("Calendar unavailable"); return res.json(); },
    staleTime: 300_000,
  });

  const selectedBook=useSportsbook();
  const q = useQuery<GamesPayload>({
    queryKey: ["games", date, selectedBook],
    enabled: mounted && !cfbDesk && !nflDesk, // the CFB and NFL desks never spend an MLB games fetch
    queryFn: async () => {
      const r = await fetch(`/api/games?date=${date}&book=${selectedBook}`);
      const j = (await r.json().catch(() => null)) as (GamesPayload & { error?: string }) | null;
      if (!r.ok || !j || j.error) throw new Error(j?.error ?? `games ${r.status}`);
      return j;
    },
    refetchInterval: (query) => ((query.state.data?.counts.live ?? 0) > 0 ? 60_000 : 300_000),
    staleTime: 30_000,
  });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const sheetSeen = useRef<ShapedGame | null>(null);
  /* a desk switch (another tab can flip it) closes the MLB sheet: the page stays mounted and holds `sheet`, so without this the
     old game's sheet would open by itself when the MLB desk comes back */
  useEffect(() => {
    if (cfbDesk || nflDesk) setSheet(null);
  }, [cfbDesk, nflDesk]);

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
  const sheetGame = sheet ? games.find((g) => g.pk === sheet.pk) ?? (sheetSeen.current?.pk === sheet.pk ? sheetSeen.current : null) : null;
  if (sheetGame) sheetSeen.current = sheetGame;

  /* CFB desk (2026-09-05): the global SportSwitch routes the page to the College Football
     slate. Every hook above has already run, so this early return is hooks-safe. */
  if (cfbDesk) {
    return (
      <div>
        <PageHeader
          title="Games"
          eyebrow="College Football"
          chip={<CfbChip />}
          sub="Every FBS game by slate day — kickoffs, selected-book lines and finals from the desk's CFB feed."
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
          sub="Every NFL game by slate day — kickoffs, selected-book lines and finals from the desk's NFL feed."
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

      {!!calendar.data?.rounds.length && <nav aria-label="Postseason rounds" className="mb-2 flex flex-wrap gap-1.5">
        {calendar.data.rounds.map(round => <button key={round.name} type="button" onClick={() => pick(round.date)} className="rounded-full border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold text-gold hover:bg-gold/20">{round.name}</button>)}
      </nav>}
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
      ) : !q.data ? (
        <ErrorState title="Couldn't load the slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {q.isError && (
            <p role="status" className="mb-2 text-[11px] text-muted">
              Refresh failed · showing the last loaded slate ·{" "}
              <button type="button" onClick={() => void q.refetch()} className="font-semibold underline underline-offset-2 hover:text-text">
                Retry
              </button>
            </p>
          )}
          {games.length === 0 ? (
            <EmptyState title="No games" body={`Nothing on the MLB schedule for ${railLabel(date)}.`} />
          ) : (
            <div className="space-y-6">
              <Section title="Live" games={live} tone="text-live" date={date} sheet={sheet} onSheet={setSheet} />
              <Section title="Upcoming" games={upcoming} date={date} sheet={sheet} onSheet={setSheet} />
              <Section title="Final" games={final} date={date} sheet={sheet} onSheet={setSheet} />
            </div>
          )}
        </>
      )}
      <Overlay open={!!sheet} onClose={() => setSheet(null)} title={sheet?.team?.name ?? (sheetGame ? `${sheetGame.away.abbr} @ ${sheetGame.home.abbr} · ${cardLinkLabel(sheetGame.status)}` : "Game")} size="full">
        {sheet && (sheet.team ? <TeamProfileExplorer key={`${sheet.pk}:${sheet.team.id}`} sport="mlb" teamId={String(sheet.team.id)} /> : <GameDetail key={sheet.pk} pk={String(sheet.pk)} qDate={date} embedded/>)}
      </Overlay>
    </div>
  );
}

function Section({ title, games, tone = "text-muted", date, sheet, onSheet }: { title: string; games: ShapedGame[]; tone?: string; date: string; sheet: Sheet | null; onSheet: (s: Sheet) => void }) {
  if (!games.length) return null;
  return (
    <section>
      <h2 className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
        {tone === "text-live" && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />}
        {title}
        <span className="num text-faint">{games.length}</span>
      </h2>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.pk} g={g} date={date} open={sheet?.pk === g.pk && !sheet.team} onOpen={() => onSheet({ pk: g.pk, team: null })} onTeam={(team) => onSheet({ pk: g.pk, team })} />
        ))}
      </div>
    </section>
  );
}

function GameCard({ g, date, open, onOpen, onTeam }: { g: ShapedGame; date: string; open: boolean; onOpen: () => void; onTeam: (team: GameTeam) => void }) {
  /* bet % / money % per side (2026-09-18): one feed per league (react-query dedupes), matched to this game by club */
  const splitsFeed = useSplits("mlb");
  const gameSplits: GameSplits | null = findGameSplits(splitsFeed, { abbr: g.away.abbr, name: g.away.name }, { abbr: g.home.abbr, name: g.home.name });
  // INSTRUCTION 46: collapsed by default; the body and the top-right button open the page's one sheet (2026-09-28: `open` is that sheet showing this game)
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
      <span className="text-text">{g.startTimeTBD ? "Time TBD" : startLabel(g.start)}</span>
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

  return (
    <article className="glass min-w-0 cursor-pointer" onClick={(e) => { if (isGameCardBackground(e.target, e.currentTarget)) onOpen(); }}>
      {g.postseason && <p className="px-3 pt-2 text-[10px] font-semibold text-gold">{g.postseason.round}{g.postseason.game ? ` · Game ${g.postseason.game}` : ""}{g.postseason.ifNecessary ? " · If necessary" : ""}</p>}
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
        <span className="flex min-w-0 items-center truncate">{header}{dh}</span>
        <Link
          href={`/games/${g.pk}?date=${date}`}
          onClick={e=>{e.preventDefault();onOpen();}}
          replace
          className="inline-flex min-h-[32px] shrink-0 items-center rounded-full border border-line-2 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold normal-case tracking-normal text-muted transition-[transform,background,color] duration-(--dur-fast) hover:bg-white/[0.08] hover:text-text active:scale-[0.96]"
        >
          {cardLinkLabel(g.status)} ›
        </Link>
      </div>
      <div
        className="flex w-full items-center gap-2 px-3 pb-2.5 pt-1.5 text-left transition-[background] duration-(--dur-fast) hover:bg-white/[0.03] active:bg-white/[0.05]"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <TeamRow onTeam={() => onTeam(g.away)} t={g.away} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.away.score ?? 0) > (g.home.score ?? 0)} split={sideSplit(gameSplits, "ml", "away")} />
          <TeamRow onTeam={() => onTeam(g.home)} t={g.home} score={showScore} upcoming={upcoming} winner={g.status === "final" && (g.home.score ?? 0) > (g.away.score ?? 0)} split={sideSplit(gameSplits, "ml", "home")} />
        </div>
        <span aria-hidden className={`shrink-0 text-[12px] leading-none text-faint transition-transform duration-(--dur-fast) ${open ? "rotate-180" : ""}`}>
          ⌄
        </span>
      </div>
    </article>
  );
}

/** one compact line per club: logo, abbr (full name from md up), record, then the score or the ML */
/** `split` (2026-09-18): the consensus bet%/money% on this club's moneyline; the ML grade rides beside the price (Josh: "grades next to every pick on the games page") */
function TeamRow({ t, score, upcoming, winner, split = null, onTeam }: { onTeam: () => void; t: GameTeam; score: boolean; upcoming: boolean; winner: boolean; split?: import("@/lib/splits").SideSplit | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {t.placeholder ? <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-gold">◇</span> : <img src={logoFor(t.abbr)} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {t.placeholder ? <span className="text-[12px] font-semibold text-muted">{t.name}</span> : <button type="button" onClick={(e) => { e.stopPropagation(); onTeam(); }} aria-label={`Open ${t.name} team page`} className={`min-h-8 rounded text-left underline decoration-current/30 underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 truncate text-[13px] font-semibold ${winner ? "text-text" : score ? "text-muted" : "text-text"}`}>
          {t.abbr}
          <span className="ml-1.5 hidden text-[12px] font-medium text-muted md:inline">{t.name}</span>
        </button>}
        {!t.placeholder && <span className="num shrink-0 text-[10px] text-faint">{t.record}</span>}
      </div>
      {score ? (
        <span className={`num shrink-0 text-[17px] font-bold leading-none ${winner ? "text-text" : "text-muted"}`}>{t.score ?? "—"}</span>
      ) : upcoming ? (
        <span className="num flex shrink-0 items-center gap-1.5 leading-none">
          <SplitsChip split={split} compact />
          {t.ml && (
            <span className="text-[9px] text-faint">
              {t.ml.book ?? ""}
            </span>
          )}
          <span className="text-[13px] font-bold text-gold">{t.ml?.odds ?? "—"}</span>
          {t.ml?.grade && <GradeChip grade={t.ml.grade} basis="EV at the best posted price" />}
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
