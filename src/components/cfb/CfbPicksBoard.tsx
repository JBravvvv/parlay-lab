"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CFB_PROPS_STALE_MS, cfbPropsQueryKey, loadCfbProps } from "@/lib/cfb/client";
import { fmtLine } from "@/lib/cfb/model";
import { buildCfbPicks, CFB_PICK_CATEGORIES } from "@/lib/cfb/picks";
import { CFB_PROP_MARKETS, type CfbParlay, type CfbParlayLeg, type CfbPickRow, type CfbPicks, type CfbPropsBoard } from "@/lib/cfb/props-types";
import { CFB_BANK_BASE, CFB_PARLAYS, CFB_PROPS } from "@/lib/cfb/rules";

/** the props route's cache window in hours (CFB_PROPS.revalidateSec) — the footnotes never hardcode it */
const PROPS_CACHE_H = CFB_PROPS.revalidateSec / 3600;
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
 * one query per date, stale for CFB_PROPS.revalidateSec, never polled — a fresh pull costs
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

const MARKET_WORD: Record<string, string> = { ml: "ML", spread: "Spread", total: "Total" };
for (const m of CFB_PROP_MARKETS) MARKET_WORD[m.id] = m.label;

function rowMatches(r: CfbPickRow, needle: string): boolean {
  return !needle || r.label.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle);
}

/** the team behind a row / leg, off the slate (null for totals and unknown ids) */
function teamOf(games: Map<string, CfbGame>, gameId: string, teamId: string | null | undefined) {
  const g = games.get(gameId);
  if (!g || teamId == null) return null;
  return teamId === g.home.id ? g.home : teamId === g.away.id ? g.away : null;
}

function Mark({ games, gameId, teamId, kind, size = "sm" }: { games: Map<string, CfbGame>; gameId: string; teamId: string | null | undefined; kind: "side" | "prop"; size?: "xs" | "sm" }) {
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
  const qc = useQueryClient();
  const [cat, setCat] = useState<Cat>("all");
  const [scope, setScope] = useState<Scope>("top");
  const [search, setSearch] = useState("");

  /** the slate for the picked date only — a rail mid-switch reads as loading */
  const current = slate && slate.date === date ? slate : null;
  const propsOn = bankroll != null && current != null && current.games.length > 0 && !current.oddsMissing;
  const propsQ = useQuery<CfbPropsBoard>({
    queryKey: cfbPropsQueryKey(date, bankroll ?? CFB_BANK_BASE),
    queryFn: () => loadCfbProps(date, { bankroll: bankroll ?? undefined }),
    staleTime: CFB_PROPS_STALE_MS,
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
        <Segmented options={SCOPES} value={scope} onChange={setScope} size="sm" tone="cfb" label="Scope" />
        <label className="relative min-w-0 flex-1 basis-[160px]">
          <span className="sr-only">Search picks</span>
          <input
            type="search"
            aria-label="Search picks"
            placeholder="Search picks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            className="num h-[30px] w-full rounded-full border border-line-2 bg-white/[0.04] px-3.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-cfb/60"
          />
        </label>
        <Pill
          variant="ghost"
          className="press"
          onClick={() => qc.invalidateQueries({ queryKey: ["cfb", "slate"] })}
          disabled={q.isFetching}
          title={`Sides cache up to 4 minutes per date — a refresh inside the window spends no Odds API quota. Player props hold for ${PROPS_CACHE_H} h.`}
        >
          {q.isFetching ? "Pulling…" : "↻ Refresh"}
        </Pill>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Pick category" data-testid="cfb-board-cats">
        <div className="flex w-max gap-1.5">
          {CATS.map((c) => {
            const n = picks?.categories[c.key]?.length ?? 0;
            return (
              <FilterPill key={c.key} role="tab" aria-selected={cat === c.key} selected={cat === c.key} onClick={() => setCat(c.key)} className="!px-2.5 !py-1 !text-[10.5px] whitespace-nowrap">
                {c.label}
                <span className="num ml-1 text-[9.5px] opacity-70">{c.prop && propsPending ? "…" : n}</span>
              </FilterPill>
            );
          })}
        </div>
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
                props for <span className="num">{propsQ.data.fetched}</span> of <span className="num">{propsQ.data.events}</span> games · cached {PROPS_CACHE_H} h
                {propsQ.data.capped ? ` · capped at ${CFB_PROPS.maxEvents} priced games per slate` : ""}
                {propsQ.data.budgeted ? " · today's props budget is used up — more games price again tomorrow" : ""}
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
            Sides cache up to 4 min per date, player props {PROPS_CACHE_H} h — a refresh inside the window spends no quota. Caesars is the settlement
            price (The Odds API&apos;s US feed); the NV app can differ — confirm at lock. Parlays multiply each leg&apos;s own probability
            (legs on different games are treated as independent). Setups that match criteria, not predictions. Informational only, not
            betting advice.
          </div>
        </>
      )}
    </div>
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
                    <FilterPill key={k} selected={active === k} onClick={() => setFilter(k)} disabled={!n} className="!px-2.5 !py-1 !text-[10.5px] whitespace-nowrap">
                      {label}
                      {n > 0 && <span className="num ml-1 text-[9.5px] opacity-70">{n}</span>}
                    </FilterPill>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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
 * The parlay slip — CfbTicketCard's layout (tier / type chips, name, one line per leg with the
 * mark · label · market · Caesars price, the tear line, then the money) on a SELF-TINTED
 * surface: no backdrop-filter per card (the iOS freeze rule), the glow on a wrapper.
 */
export function CfbParlayCard({ t, games }: { t: CfbParlay; games: Map<string, CfbGame> }) {
  const grade = gradeFromEv(t.ev);
  const pct = t.prob * 100;
  const oneIn = pct > 0 ? Math.round(100 / pct) : null;
  const pays = Math.round(REF_STAKE * t.dec);
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
            <span className="uppercase tracking-wide text-faint">${REF_STAKE} pays</span> ${pays}
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
