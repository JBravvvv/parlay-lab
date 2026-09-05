"use client";

import { useMemo, useState } from "react";
import { useIsFetching, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { DateRail } from "@/components/games/DateRail";
import { Reveal } from "@/components/motion/Reveal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { KellyChip } from "@/components/ui/KellyChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { CFB_PROPS_STALE_MS, cfbCacheLabel, cfbPricedAtLabel, cfbPropsQueryKey, cfbPropsStaleMs, cfbQueryKey, loadCfbProps } from "@/lib/cfb/client";
import { fmtLine } from "@/lib/cfb/model";
import { buildCfbPicks, CFB_PICK_CATEGORIES } from "@/lib/cfb/picks";
import { CFB_PROP_MARKETS, type CfbParlay, type CfbParlayLeg, type CfbPickRow, type CfbPicks, type CfbPropsBoard } from "@/lib/cfb/props-types";
import { CFB_BANK_BASE, CFB_PARLAYS, CFB_PROPS } from "@/lib/cfb/rules";
import { payout, profit } from "@/lib/calc-math";
import { usd } from "@/lib/ticket-payout";

/** the props route's PRE-KICK window in hours (CFB_PROPS.revalidateSec) — only the fallback before a board loads;
    a loaded board prints its own window through cfbCacheLabel (10 min while a priced game is live) */
const PROPS_CACHE_H = CFB_PROPS.revalidateSec / 3600;
const LIVE_CACHE_MIN = CFB_PROPS.liveRevalidateSec / 60;

/** the props query's staleTime: what is left of the loaded board's window (its ttlSec less its age), else CFB_PROPS_STALE_MS */
function propsBoardStaleMs(board: CfbPropsBoard | undefined): number {
  return board ? cfbPropsStaleMs(board) : CFB_PROPS_STALE_MS;
}
import type { CfbGame } from "@/lib/cfb/types";
import { useCfbDesk } from "@/lib/cfb/useCfbDesk";
import { quotaRemaining } from "@/lib/fetcher";
import { fmtAmerican, fmtMoney, fmtPct } from "@/lib/format";
import { railLabel } from "@/lib/games";
import { gradeFromEv, gradeRank } from "@/lib/grade";
import { bookShort } from "./CfbGameCard";
import { PairMark, TeamMark } from "./TeamMark";

/**
 * THE CFB BOARD — picks + parlays (2026-09-05, Josh: "The games list doesn't need to be on the
 * 'Board' when it's already on the 'Games' tab; what should be on the 'Board' tab is all of the
 * prop parlay options like MLB has with live, mixed, safe. Longshots, etc"). The games list
 * lives on Games; this surface is the MLB Board's shape for College Football: a day rail, four
 * stat tiles, TOP 50 / ALL scope, a category strip (sides, then one tab per player-prop
 * market), a search box, the ranked read-only table S → F on the EV at Caesars, and under it
 * the generated parlay sets in three views (PARLAYS / MIXED / LIVE) with tier and type filters.
 *
 * Two feeds: the slate (sides — rows appear at once) and the props board (`/api/cfb/props`,
 * one query per date, stale for the board's own ttlSec (10 min live / 2 h pre-kick), never polled — a fresh pull costs
 * quota per event, and the route holds a daily credit budget it will not spend past). Every
 * figure is the feed's own or the model's own at Caesars' price; a missing value says "—".
 * Read-only, like the MLB Board: the Builder writes tickets, this page never does.
 */

const CATS: readonly { key: (typeof CFB_PICK_CATEGORIES)[number]; label: string; prop: boolean }[] = [
  { key: "all", label: "ALL", prop: false },
  { key: "ml", label: "ML", prop: false },
  { key: "spread", label: "SPREAD", prop: false },
  { key: "total", label: "TOTAL", prop: false },
  { key: "anytime_td", label: "ANYTIME TD", prop: true },
  { key: "pass_tds", label: "PASS TDS", prop: true },
  { key: "pass_yds", label: "PASS YDS", prop: true },
  { key: "receptions", label: "REC", prop: true },
  { key: "rush_yds", label: "RUSH YDS", prop: true },
  { key: "rec_yds", label: "REC YDS", prop: true },
];
type Cat = (typeof CATS)[number]["key"];

const SCOPES = [
  { key: "top", label: "Top 50" },
  { key: "all", label: "All" },
] as const;
type Scope = (typeof SCOPES)[number]["key"];
const TOP_N = 50;
/** featured cards in the TOP EDGES carousel */
const FEATURED_N = 8;

const MARKET_WORD: Record<string, string> = { ml: "ML", spread: "Spread", total: "Total" };
for (const m of CFB_PROP_MARKETS) MARKET_WORD[m.id] = m.label;

/* ---------- the one refresh control (INSTRUCTION 40, 2026-09-05) ----------
   Josh: "The green 'Refresh Board' button is gone from the Board screen". The page header
   carries ONE green primary pill (the MLB desk's "Refresh MLB" placement) and it refetches
   BOTH feeds: the slate (4-minute data cache) and the player-props board (Redis / a
   CFB_PROPS.revalidateSec cache with a daily credit budget) — a refresh inside either window
   spends no Odds API quota. The prefixes are the key builders' own first two segments, so a
   renamed key can never strand one feed. */

/** every ["cfb","slate",…] and ["cfb","props",…] query, whatever date / bankroll they carry */
export const CFB_SLATE_KEY_PREFIX = cfbQueryKey(null, CFB_BANK_BASE).slice(0, 2);
export const CFB_PROPS_KEY_PREFIX = cfbPropsQueryKey(null, CFB_BANK_BASE).slice(0, 2);

/** invalidate (and refetch, where mounted) the slate AND the props board */
export function refreshCfbBoard(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: CFB_SLATE_KEY_PREFIX }),
    qc.invalidateQueries({ queryKey: CFB_PROPS_KEY_PREFIX }),
  ]).then(() => undefined);
}

/** The header's green "Refresh Board" pill — app/board/page.tsx mounts it as the CFB PageHeader action. */
export function CfbRefreshPill() {
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: CFB_SLATE_KEY_PREFIX }) + useIsFetching({ queryKey: CFB_PROPS_KEY_PREFIX }) > 0;
  return (
    <Pill
      variant="primary"
      onClick={() => void refreshCfbBoard(qc)}
      disabled={fetching}
      title={`Re-pulls the slate and the player props. Sides cache up to 4 minutes per date, player props ${PROPS_CACHE_H} h pre-kick / ${LIVE_CACHE_MIN} min while a priced game is in play — a refresh inside the window spends no Odds API quota.`}
      data-testid="cfb-refresh-board"
    >
      {fetching ? "Pulling…" : "Refresh Board"}
    </Pill>
  );
}

/** "$10 wins $X" off the book's own decimal price — profit on a $10 stake, to the cent like every other payout on the desk */
const WIN_STAKE = 10;
function winsOn(dec: number): number {
  return profit(WIN_STAKE, dec);
}

function rowMatches(r: CfbPickRow, needle: string): boolean {
  return !needle || r.label.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle);
}

/** the team behind a row / leg, off the slate (null for totals and unknown ids) */
function teamOf(games: Map<string, CfbGame>, gameId: string, teamId: string | null | undefined) {
  const g = games.get(gameId);
  if (!g || teamId == null) return null;
  return teamId === g.home.id ? g.home : teamId === g.away.id ? g.away : null;
}

function Mark({ games, gameId, teamId, kind, size = "sm" }: { games: Map<string, CfbGame>; gameId: string; teamId: string | null | undefined; kind: "side" | "prop"; size?: "xs" | "sm" | "md" }) {
  const g = games.get(gameId);
  const team = teamOf(games, gameId, teamId);
  if (team) return <TeamMark team={team} size={size} showRank showAbbr={false} />;
  if (g) return <PairMark away={g.away} home={g.home} size={size} />;
  const tone = kind === "prop" ? "border-cfb/40 bg-cfb/10 text-cfb" : "border-line-2 bg-surface-2 text-muted";
  return (
    <span className={`num inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1 text-[8.5px] font-bold ${tone}`} aria-hidden>
      {kind === "prop" ? "P" : "—"}
    </span>
  );
}

/* ---------- the desk ---------- */

export function CfbPicksBoard() {
  const { today, date, pick, rail, bankroll, q, slate } = useCfbDesk();
  const [cat, setCat] = useState<Cat>("all");
  const [scope, setScope] = useState<Scope>("top");
  const [search, setSearch] = useState("");

  /** the slate for the picked date only — a rail mid-switch reads as loading */
  const current = slate && slate.date === date ? slate : null;
  const propsOn = bankroll != null && current != null && current.games.length > 0 && !current.oddsMissing;
  const propsQ = useQuery<CfbPropsBoard>({
    queryKey: cfbPropsQueryKey(date, bankroll ?? CFB_BANK_BASE),
    queryFn: () => loadCfbProps(date, { bankroll: bankroll ?? undefined }),
    // stale for the board's own window (ttlSec: 600 s while a priced game is live, else the
    // route's 2 h) — after a live pull the LIVE / MIXED parlays must not sit on a 10-min board
    // for 2 h (2026-09-05); still never polled
    staleTime: (q) => propsBoardStaleMs(q.state.data),
    refetchInterval: false,
    retry: 0,
    enabled: propsOn,
  });
  const propRows = propsQ.data?.rows ?? null;
  const propsPending = propsOn && propsQ.isPending;

  const games = useMemo(() => new Map((current?.games ?? []).map((g) => [g.id, g])), [current]);
  const picks: CfbPicks | null = useMemo(
    () => (current ? buildCfbPicks(current, propRows, { now: Date.now(), bankroll: bankroll ?? CFB_BANK_BASE }) : null),
    [current, propRows, bankroll],
  );

  const needle = search.trim().toLowerCase();
  const catRows = picks?.categories[cat] ?? [];
  const rows = useMemo(() => {
    const hit = catRows.filter((r) => rowMatches(r, needle));
    return scope === "top" ? hit.slice(0, TOP_N) : hit;
  }, [catRows, needle, scope]);

  const all = picks?.categories.all ?? [];
  const sides = all.filter((r) => r.kind === "side").length;
  const propsN = all.length - sides;
  const plusEv = all.filter((r) => (r.evCz ?? -1) > 0);
  const top = plusEv[0] ?? null;
  /** the featured strip: the ranked +EV picks that carry a Caesars price (S → F, EV, fair) */
  const featured = useMemo(() => plusEv.filter((r) => r.cz != null).slice(0, FEATURED_N), [plusEv]);
  const parlayCount = picks ? picks.parlays.length + picks.mixed.length + picks.live.length : 0;
  const tierCount = (tier: string) => picks?.parlays.filter((t) => t.tier === tier).length ?? 0;
  const liveGames = current?.games.filter((g) => g.status === "live").length ?? 0;
  const quota = quotaRemaining();

  const columns: Column<CfbPickRow>[] = useMemo(
    () => [
      {
        key: "pick",
        header: "Pick",
        stickyLeft: 0,
        sortValue: (r) => r.label,
        cell: (r) => (
          <div className="flex max-w-[176px] items-center gap-2 md:max-w-none">
            <Mark games={games} gameId={r.gameId} teamId={r.kind === "side" ? (r.market === "total" ? null : sideTeamId(r, games)) : propTeamId(r, propRows)} kind={r.kind} />
            <div className="min-w-0">
              <div className="truncate font-medium text-text">{r.label}</div>
              <div className="truncate text-[10.5px] text-faint">
                {r.kind === "prop" && <span className="mr-1 rounded-sm bg-cfb/15 px-1 text-[9px] font-bold uppercase tracking-wide text-cfb">{MARKET_WORD[r.market] ?? r.market}</span>}
                {r.sub}
              </div>
            </div>
          </div>
        ),
      },
      { key: "grade", header: "Grade", sortValue: (r) => gradeRank(r.grade), cell: (r) => <GradeChip grade={r.grade} basis="EV @ Caesars" /> },
      {
        key: "fair",
        header: "Fair",
        numeric: true,
        sortValue: (r) => r.fair ?? -1,
        cell: (r) =>
          r.fair != null && r.fairAm != null ? (
            <span className="num" title={r.push > 0 ? `${fmtPct(r.fair)} win · ${fmtPct(r.push)} push` : `${fmtPct(r.fair)} to hit`}>
              {fmtAmerican(r.fairAm)} <span className="text-[10px] text-faint">{fmtPct(r.fair, 0)}</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "cz",
        header: "Caesars",
        numeric: true,
        sortValue: (r) => r.cz?.price ?? -100000,
        cell: (r) =>
          r.cz ? (
            <span className="inline-flex items-baseline gap-1">
              <OddsCell odds={r.cz.price} book="caesars" />
              {r.market !== "ml" && r.cz.line != null && r.line != null && Math.abs(r.cz.line - r.line) > 1e-9 && (
                <span className="num text-[9.5px] text-cfb" title="Caesars' own line differs from the consensus line">
                  @{r.market === "spread" ? fmtLine(r.cz.line) : r.cz.line}
                </span>
              )}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "best",
        header: "Best",
        numeric: true,
        sortValue: (r) => r.best?.price ?? -100000,
        cell: (r) =>
          r.best ? (
            <span className="num text-[12px] text-muted">
              {fmtAmerican(r.best.price)} <span className="text-[9.5px] text-faint">{bookShort(r.best)}</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      { key: "ev", header: "EV @ CZR", numeric: true, sortValue: (r) => r.evCz ?? -999, cell: (r) => (r.evCz != null ? <EvBadge ev={r.evCz} /> : <span className="text-faint">—</span>) },
      {
        key: "kelly",
        header: "¼-Kelly",
        numeric: true,
        sortValue: (r) => r.kelly ?? -1,
        cell: (r) => (r.kelly != null ? <KellyChip stake={r.kelly} /> : <span className="text-faint">—</span>),
      },
    ],
    [games, propRows],
  );

  const loading = bankroll == null || q.isPending || (slate != null && current == null && !q.isError);
  const catIsProp = CATS.find((c) => c.key === cat)?.prop ?? false;

  return (
    <div className="space-y-5">
      <DateRail dates={rail} date={date} today={today} onPick={pick} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Picks" value={picks ? String(all.length) : "—"} sub={picks ? `${sides} sides · ${propsPending ? "props pricing…" : `${propsN} props`}` : railLabel(date)} tone="cfb" icon="🏈" />
        <StatTile label="+EV at Caesars" value={picks ? String(plusEv.length) : "—"} sub={picks ? `of ${all.length} priced picks` : undefined} tone={plusEv.length > 0 ? "pos" : "muted"} />
        <StatTile
          label="Best edge"
          value={top ? <span className="block truncate text-[16px]">{top.label}</span> : "—"}
          sub={top && top.evCz != null && top.cz ? `${fmtAmerican(top.cz.price)} · ${top.evCz > 0 ? "+" : ""}${top.evCz.toFixed(1)}%${top.kelly != null ? ` · ¼K ${fmtMoney(top.kelly)}` : ""}` : "no +EV pick yet"}
          tone={top ? "pos" : "muted"}
        />
        <StatTile
          label="Parlays"
          value={picks ? String(parlayCount) : "—"}
          sub={picks ? `${tierCount("SAFER")} safer · ${tierCount("LONGSHOT")} longshot · ${tierCount("MIX")} mix${liveGames ? ` · ${liveGames} live` : ""}` : undefined}
          tone={parlayCount > 0 ? "gold" : "muted"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={SCOPES} value={scope} onChange={setScope} size="md" tone="cfb" label="Scope" />
        <label className="relative min-w-0 flex-1 basis-[160px]">
          <span className="sr-only">Search picks</span>
          <input
            type="search"
            aria-label="Search picks"
            placeholder="Search picks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            className="num h-11 w-full rounded-full border border-line-2 bg-white/[0.04] px-4 text-[16px] text-text outline-none placeholder:text-faint focus:border-cfb/60"
          />
        </label>
      </div>

      <div className="chip-row -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Pick category" data-testid="cfb-board-cats">
          {CATS.map((c) => {
            const n = picks?.categories[c.key]?.length ?? 0;
            return (
              <FilterPill key={c.key} role="tab" aria-selected={cat === c.key} selected={cat === c.key} onClick={() => setCat(c.key)} className="min-h-[40px] !px-3 !text-[11px] whitespace-nowrap">
                {c.label}
                <span className="num ml-1 text-[9.5px] opacity-70">{c.prop && propsPending ? "…" : n}</span>
              </FilterPill>
            );
          })}
      </div>

      {loading ? (
        <Panel>
          <SkeletonRows rows={8} />
        </Panel>
      ) : q.isError ? (
        <Panel>
          <ErrorState title="Couldn't load the CFB slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !current || current.games.length === 0 ? (
        <Panel>
          <EmptyState title={`No FBS games on ${railLabel(date)}`} body="Pick another date on the rail — it lists every date the odds feed has an upcoming kickoff." />
        </Panel>
      ) : current.oddsMissing ? (
        <div className="rounded-(--radius-panel) border border-neg/30 bg-neg/5 px-4 py-3 text-[12px] leading-relaxed text-muted">
          <b className="text-neg">Scores only.</b> The server had no odds feed for this load (no key, or the fetch failed) — no prices, no EV, no
          grades, no props and no parlays; nothing is estimated in their place. The Games tab still shows the slate.
        </div>
      ) : (
        <>
          {featured.length > 0 && <TopEdges rows={featured} total={plusEv.length} games={games} propRows={propRows} />}

          <Reveal>
            {rows.length === 0 ? (
              <Panel>
                {catIsProp && propsPending ? (
                  <div className="space-y-3">
                    <div className="text-[11px] text-muted">Pricing player props at Caesars…</div>
                    <SkeletonRows rows={5} />
                  </div>
                ) : (
                  <EmptyState
                    title={needle ? `Nothing matches “${search.trim()}”` : cat === "all" ? "No playable picks yet" : `No ${CATS.find((c) => c.key === cat)?.label} picks yet`}
                    body={
                      needle
                        ? "Try a school, a player or an abbreviation."
                        : catIsProp && propsQ.isError
                          ? "The player-props feed did not answer — sides are still priced."
                          : catIsProp
                            ? `A prop needs ${CFB_PROPS.minBooks} books at a line and a Caesars price before it is a pick.`
                            : "A pick needs a Caesars price on a game that has not kicked off."
                    }
                  />
                )}
              </Panel>
            ) : (
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} maxHeight="62vh" stagger={scope === "top"} rowClassName={(r) => ((r.evCz ?? -1) > 0 ? "ev-glow" : "")} />
            )}
          </Reveal>

          <div className="text-[10.5px] leading-relaxed text-faint" data-testid="cfb-props-footnote">
            {propsPending ? (
              <span className="inline-flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" /> pricing player props · sides are live now
              </span>
            ) : propsQ.isError ? (
              <span>
                <span className="text-neg">Player props unavailable</span> — {(propsQ.error as Error).message}. Sides only until the feed answers.
              </span>
            ) : propsQ.data ? (
              <span>
                props for <span className="num">{propsQ.data.fetched}</span> of <span className="num">{propsQ.data.events}</span> games
                {propsQ.data.live ? ` · ${propsQ.data.live} in play` : ""} · cached {cfbCacheLabel(propsQ.data)}
                {propsQ.data.capped ? ` · capped at ${CFB_PROPS.maxEvents} priced games per slate` : ""}
                {propsQ.data.stale
                  ? ` · lines as priced at ${cfbPricedAtLabel(propsQ.data)} — today's props budget is used up`
                  : propsQ.data.budgeted
                    ? " · today's props budget is used up — more games price again tomorrow"
                    : ""}
              </span>
            ) : null}
            {scope === "top" && catRows.filter((r) => rowMatches(r, needle)).length > TOP_N && (
              <span>
                {" "}
                · showing the top {TOP_N} of {catRows.filter((r) => rowMatches(r, needle)).length} — switch to All for every pick
              </span>
            )}
          </div>

          {picks && <CfbParlaysSection picks={picks} games={games} propsPending={propsPending} liveGames={liveGames} />}

          <div className="text-[10.5px] leading-relaxed text-faint">
            {quota && (
              <>
                Odds API quota remaining: <span className="num">{quota}</span> ·{" "}
              </>
            )}
            Sides cache up to 4 min per date, player props {propsQ.data ? cfbCacheLabel(propsQ.data) : `${PROPS_CACHE_H} h`}
            {propsQ.data?.live ? " while a game is in play" : ` pre-kick / ${LIVE_CACHE_MIN} min while a priced game is in play`} — a refresh inside the window spends no quota. Caesars is the settlement
            price (The Odds API&apos;s US feed); the NV app can differ — confirm at lock. Parlays multiply each leg&apos;s own probability
            (legs on different games are treated as independent). Setups that match criteria, not predictions. Informational only, not
            betting advice.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- TOP EDGES — the featured strip (INSTRUCTION 40, the Caesars "boost card" grammar) ----------
   One card per ranked +EV pick with a Caesars price: the mark, the pick, the big price, the
   grade + EV, and "$10 wins $X" off Caesars' own decimal. A horizontal snap carousel — the
   strip scrolls, the page never does. Every figure is the row's own; nothing is estimated. */

function TopEdges({ rows, total, games, propRows }: { rows: CfbPickRow[]; total: number; games: Map<string, CfbGame>; propRows: CfbPropsBoard["rows"] | null }) {
  return (
    <Reveal>
      <section aria-label="Top edges" data-testid="cfb-top-edges">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Top edges <span className="num ml-1 text-cfb">{total}</span> <span className="text-faint">+EV at Caesars</span>
          </h2>
          {total > rows.length && <span className="num text-[10px] text-faint">top {rows.length} · the table has all {total}</span>}
        </div>
        <div className="carousel -mx-4 px-4 md:mx-0 md:px-0">
          {rows.map((r, i) => (
            <FeaturedPick key={r.key} r={r} rank={i + 1} games={games} propRows={propRows} />
          ))}
        </div>
      </section>
    </Reveal>
  );
}

function FeaturedPick({ r, rank, games, propRows }: { r: CfbPickRow; rank: number; games: Map<string, CfbGame>; propRows: CfbPropsBoard["rows"] | null }) {
  const cz = r.cz!;
  const teamId = r.kind === "side" ? (r.market === "total" ? null : sideTeamId(r, games)) : propTeamId(r, propRows);
  const s = r.grade === "S";
  return (
    <article
      className={`press card-lift relative w-[78vw] max-w-[320px] rounded-[18px] border px-4 pb-3.5 pt-3.5 md:w-[300px] ${s ? "shine" : ""} ${(r.evCz ?? 0) > 0 ? "ev-glow" : ""}`}
      style={{
        borderColor: "color-mix(in srgb, var(--color-cfb) 26%, rgba(255,255,255,0.08))",
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--color-cfb) 12%, transparent), transparent 55%, color-mix(in srgb, var(--color-pos) 6%, transparent)), color-mix(in srgb, var(--color-surface) 94%, transparent)",
      }}
      data-testid="cfb-featured-pick"
    >
      <header className="flex items-center gap-2.5">
        <Mark games={games} gameId={r.gameId} teamId={teamId} kind={r.kind} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-text">{r.label}</div>
          <div className="truncate text-[10.5px] text-faint">
            <span className="mr-1 rounded-sm bg-cfb/15 px-1 text-[9px] font-bold uppercase tracking-wide text-cfb">{MARKET_WORD[r.market] ?? r.market}</span>
            {r.sub}
          </div>
        </div>
        <span className="num shrink-0 rounded-full border border-line-2 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold text-muted" aria-label={`rank ${rank}`}>
          #{rank}
        </span>
      </header>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-faint">Caesars</div>
          <div className="hero-price is-cfb num mt-0.5">{fmtAmerican(cz.price)}</div>
          {r.market !== "ml" && cz.line != null && r.line != null && Math.abs(cz.line - r.line) > 1e-9 && (
            <div className="num mt-1 text-[9.5px] text-cfb" title="Caesars' own line differs from the consensus line">
              at {r.market === "spread" ? fmtLine(cz.line) : cz.line}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {r.evCz != null && <EvBadge ev={r.evCz} />}
            <GradeChip grade={r.grade} basis="EV @ Caesars" />
          </div>
          {r.fair != null && (
            <span className="num text-[10.5px] text-muted" title={r.push > 0 ? `${fmtPct(r.fair)} win · ${fmtPct(r.push)} push` : "model probability the pick hits"}>
              {fmtPct(r.fair, 0)} to hit
            </span>
          )}
        </div>
      </div>

      <div className="ticket-tear my-3" aria-hidden />

      <footer className="flex items-center justify-between gap-2">
        <span className="num text-[11px] text-text">
          <span className="text-[9.5px] uppercase tracking-wide text-faint">${WIN_STAKE} wins</span> <b className="text-pos">{usd(winsOn(cz.dec))}</b>
        </span>
        {r.kelly != null ? <KellyChip stake={r.kelly} /> : <span className="num text-[10px] text-faint">no ¼-Kelly stake</span>}
      </footer>
    </article>
  );
}

function sideTeamId(r: CfbPickRow, games: Map<string, CfbGame>): string | null {
  const g = games.get(r.gameId);
  if (!g) return null;
  const row = g.rows.find((x) => x.key === r.key);
  return row?.teamId ?? null;
}

function propTeamId(r: CfbPickRow, propRows: CfbPropsBoard["rows"] | null): string | null {
  if (!propRows) return null;
  const row = propRows.find((x) => x.key === r.key);
  return row?.teamId ?? null;
}

/* ---------- the generated parlays ---------- */

type View = "parlays" | "mixed" | "live";
const VIEWS: [View, string, string][] = [
  ["parlays", "PARLAYS", "Tickets built only from games that haven't kicked off — SAFER, LONGSHOT and MIX tiers at Caesars' prices."],
  ["mixed", "MIXED PARLAYS", "Cross-game tickets pairing a game in progress (in-play price) with games still to kick off."],
  ["live", "LIVE PARLAYS", "In-game tickets from games in progress only, at the feed's live Caesars prices."],
];
const TIERS: [string, string][] = [
  ["all", "ALL"],
  ["SAFER", "SAFER"],
  ["LONGSHOT", "LONGSHOTS"],
  ["MIX", "MIXED"],
];
const TYPES: Record<string, string> = { SIDES: "SIDES ONLY", PROPS: "PROPS ONLY", MIXED: "SIDES + PROPS" };
const SHOW_CAP = 24;

function TierTag({ tier }: { tier: CfbParlay["tier"] }) {
  const cls = tier === "SAFER" ? "border-pos/50 bg-pos/10 text-pos" : tier === "LONGSHOT" ? "border-gold/50 bg-gold/10 text-gold" : "border-cfb/50 bg-cfb/10 text-cfb";
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${cls}`}>{tier}</span>;
}

export function CfbParlaysSection({ picks, games, propsPending, liveGames }: { picks: CfbPicks; games: Map<string, CfbGame>; propsPending: boolean; liveGames: number }) {
  const [view, setView] = useState<View>("parlays");
  const [filter, setFilter] = useState("all");
  const lists: Record<View, CfbParlay[]> = { parlays: picks.parlays, mixed: picks.mixed, live: picks.live };
  const all = lists[view];

  const filters = useMemo(() => {
    const types = Array.from(new Set(all.map((t) => t.type).filter((t) => t in TYPES)));
    return TIERS.concat(types.map((t) => [t, TYPES[t]] as [string, string]));
  }, [all]);
  const match = (t: CfbParlay, f: string) => (f === "all" ? true : f === "SAFER" || f === "LONGSHOT" || f === "MIX" ? t.tier === f : t.type === f);
  const active = filters.some(([k]) => k === filter) ? filter : "all";
  const shown = all.filter((t) => match(t, active));

  const empty =
    view === "live"
      ? { title: "No games in progress right now", body: "In-game tickets appear once a kickoff goes live and the feed carries in-play Caesars prices." }
      : view === "mixed"
        ? liveGames === 0
          ? { title: "No games in progress right now", body: "Mixed tickets need a live game beside the upcoming ones — they appear the moment a kickoff goes live." }
          : { title: "No mixed tickets yet", body: "A live leg and an upcoming leg each need a Caesars price and grade D or better (EV ≥ −3%)." }
        : propsPending
          ? { title: "Building parlays…", body: "SAFER tickets come from the sides; LONGSHOT and MIX fill in as player props finish pricing." }
          : { title: "No parlays yet", body: `Not enough qualifying legs — a leg needs a Caesars price and grade D or better (EV ≥ ${CFB_PARLAYS.minLegEvPct}%), and SAFER legs must be ≥ ${Math.round(CFB_PARLAYS.safer.minLegProb * 100)}% to hit.` };

  return (
    <Reveal>
      <div className="mt-8" data-testid="cfb-parlays">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Generated parlays — the desk&apos;s ticket sets at Caesars</h2>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {VIEWS.map(([v, label]) => (
            <FilterPill
              key={v}
              selected={view === v}
              className="min-h-[40px]"
              onClick={() => {
                setView(v);
                setFilter("all");
              }}
            >
              {label}
              <span className="num ml-1 text-[10px] opacity-70">{lists[v].length}</span>
            </FilterPill>
          ))}
        </div>
        <div className="mb-3 text-[11px] text-muted">{VIEWS.find(([v]) => v === view)![2]}</div>

        {all.length === 0 ? (
          <Panel>
            <EmptyState title={empty.title} body={empty.body} />
          </Panel>
        ) : (
          <>
            <div className="-mx-4 mb-3 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
              <div className="flex w-max items-center gap-1.5">
                {filters.map(([k, label]) => {
                  const n = all.filter((t) => match(t, k)).length;
                  return (
                    <FilterPill key={k} selected={active === k} onClick={() => setFilter(k)} disabled={!n} className="min-h-[40px] !px-3 !text-[11px] whitespace-nowrap">
                      {label}
                      {n > 0 && <span className="num ml-1 text-[9.5px] opacity-70">{n}</span>}
                    </FilterPill>
                  );
                })}
              </div>
            </div>

            {/* phones: one snap carousel of compact tickets (the Caesars "boost" strip); ≥768px: the full slips in a grid */}
            <div className="carousel -mx-4 px-4 md:hidden" data-testid="cfb-parlay-carousel">
              {shown.slice(0, SHOW_CAP).map((t, i) => (
                <CfbParlayFeature key={t.id} t={t} rank={i + 1} live={view !== "parlays"} />
              ))}
            </div>
            <div className="hidden gap-3 md:grid md:grid-cols-2">
              {shown.slice(0, SHOW_CAP).map((t) => (
                <CfbParlayCard key={t.id} t={t} games={games} />
              ))}
            </div>
            {shown.length > SHOW_CAP && <div className="mt-2 text-[11px] text-faint">+{shown.length - SHOW_CAP} more in this view — narrow with the filters above.</div>}
            {shown.length === 0 && (
              <Panel>
                <EmptyState title="No parlays match this filter" />
              </Panel>
            )}
          </>
        )}
      </div>
    </Reveal>
  );
}

/** A reference stake for the payout line — the desk's fun-money unit, not a stake this page places. */
const REF_STAKE = 25;

/**
 * The phone ticket (INSTRUCTION 40): the tier badge, the leg count, the +price as the hero,
 * "$25 pays $Y", % to hit, EV and grade — a compact snap card in the parlay carousel. Legs
 * are listed underneath so a tap never has to leave the strip to see what is in it.
 */
export function CfbParlayFeature({ t, rank, live }: { t: CfbParlay; rank: number; live: boolean }) {
  const grade = gradeFromEv(t.ev);
  const pct = t.prob * 100;
  const oneIn = pct > 0 ? Math.round(100 / pct) : null;
  const pays = payout(REF_STAKE, t.dec);
  return (
    <article
      className={`press relative w-[82vw] max-w-[340px] rounded-[18px] border px-4 pb-3.5 pt-3.5 ${grade === "S" ? "shine" : ""} ${t.ev > 0 ? "ev-glow" : ""}`}
      style={{
        borderColor: "color-mix(in srgb, var(--color-gold) 30%, rgba(255,255,255,0.08))",
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--color-gold) 12%, transparent), color-mix(in srgb, var(--color-cfb) 6%, transparent) 60%, transparent), color-mix(in srgb, var(--color-surface) 94%, transparent)",
      }}
      data-testid="cfb-parlay-feature"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <TierTag tier={t.tier} />
          <span className="rounded-full border border-line-2 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">{TYPES[t.type] ?? t.type}</span>
          {live && (
            <span className="inline-flex items-center gap-1 rounded-full border border-live/50 bg-live/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-live">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-live" aria-hidden /> live
            </span>
          )}
        </div>
        <span className="num shrink-0 text-[9px] font-bold text-faint">#{rank}</span>
      </header>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-text">{t.name}</div>
          <div className="num mt-0.5 text-[10.5px] text-faint">
            {t.legs.length} legs · {t.dec.toFixed(2)}× at Caesars
          </div>
          <div className="hero-price is-gold num mt-2">{fmtAmerican(t.am)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <EvBadge ev={t.ev} />
            <GradeChip grade={grade} basis="EV at Caesars" />
          </div>
          <span className="num text-[10.5px] text-muted" title={oneIn ? `≈ 1 in ${oneIn}` : undefined}>
            {pct.toFixed(1)}% to hit
          </span>
          <span className="num text-[11px] text-text">
            <span className="text-[9.5px] uppercase tracking-wide text-faint">${REF_STAKE} pays</span> <b className="text-gold">{usd(pays)}</b>
          </span>
        </div>
      </div>

      <div className="ticket-tear my-3" aria-hidden />

      <ul className="space-y-1">
        {t.legs.map((leg: CfbParlayLeg) => (
          <li key={leg.rowKey} className="flex items-center gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-text">{leg.label}</span>
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-faint">{MARKET_WORD[leg.market] ?? leg.market}</span>
            <span className="num shrink-0 font-semibold text-gold">{fmtAmerican(leg.cz)}</span>
          </li>
        ))}
      </ul>
      {t.note && <div className="mt-2 text-[10.5px] leading-relaxed text-faint">{t.note}</div>}
    </article>
  );
}

/**
 * The parlay slip — CfbTicketCard's layout (tier / type chips, name, one line per leg with the
 * mark · label · market · Caesars price, the tear line, then the money) on a SELF-TINTED
 * surface: no blur filter per card (the iOS freeze rule), the glow on a wrapper.
 */
export function CfbParlayCard({ t, games }: { t: CfbParlay; games: Map<string, CfbGame> }) {
  const grade = gradeFromEv(t.ev);
  const pct = t.prob * 100;
  const oneIn = pct > 0 ? Math.round(100 / pct) : null;
  const pays = payout(REF_STAKE, t.dec);
  return (
    <div className={`rounded-[16px] ${t.ev > 0 ? "ev-glow" : ""}`} data-testid="cfb-parlay">
      <article
        className={`relative rounded-[16px] border px-4 pb-3 pt-3 ${grade === "S" ? "shine" : ""}`}
        style={{
          borderColor: "color-mix(in srgb, var(--color-cfb) 22%, rgba(255,255,255,0.07))",
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--color-cfb) 10%, transparent), color-mix(in srgb, var(--color-acc-green) 5%, transparent) 60%, color-mix(in srgb, var(--color-cfb) 7%, transparent)), color-mix(in srgb, var(--color-surface) 92%, transparent)",
        }}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <TierTag tier={t.tier} />
              <span className="rounded-full border border-line-2 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">{TYPES[t.type] ?? t.type}</span>
            </div>
            <div className="mt-1.5 truncate text-[13px] font-bold text-text">{t.name}</div>
            <div className="num mt-0.5 text-[10.5px] text-faint">
              {t.dec.toFixed(2)}× · {t.legs.length} legs at Caesars
            </div>
          </div>
          <span className="num shrink-0 rounded-full border border-gold/50 bg-gold/10 px-2.5 py-0.5 text-[12px] font-bold text-gold">{fmtAmerican(t.am)}</span>
        </header>

        <ul className="mt-3 space-y-1.5">
          {t.legs.map((leg: CfbParlayLeg) => (
            <li key={leg.rowKey} className="flex items-center gap-2 text-[11.5px]">
              <Mark games={games} gameId={leg.gameId} teamId={leg.kind === "side" && leg.market === "total" ? null : leg.teamId} kind={leg.kind} size="xs" />
              <span className="min-w-0 flex-1 truncate text-text">{leg.label}</span>
              <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-faint">{MARKET_WORD[leg.market] ?? leg.market}</span>
              <span className="num shrink-0 text-[10px] text-muted">{fmtPct(leg.prob, 0)}</span>
              <span className="num shrink-0 font-semibold text-gold">{fmtAmerican(leg.cz)}</span>
            </li>
          ))}
        </ul>

        <div className="ticket-tear my-3" aria-hidden />

        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="num text-[10.5px] text-muted">
            <span className="uppercase tracking-wide text-faint">${REF_STAKE} pays</span> {usd(pays)}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="num text-[10.5px] text-muted" title={oneIn ? `≈ 1 in ${oneIn}` : undefined}>
              {pct.toFixed(1)}% to hit
            </span>
            <EvBadge ev={t.ev} />
            <GradeChip grade={grade} basis="EV at Caesars" />
          </div>
        </footer>
        {t.note && <div className="mt-2 text-[10.5px] leading-relaxed text-faint">{t.note}</div>}
      </article>
    </div>
  );
}
