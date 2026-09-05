"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateRail } from "@/components/games/DateRail";
import { ptToday } from "@/components/games/logo";
import { Reveal } from "@/components/motion/Reveal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { KellyChip } from "@/components/ui/KellyChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { CFB_STALE_MS, cfbQueryKey, loadCfbSlate } from "@/lib/cfb/client";
import { fmtLine } from "@/lib/cfb/model";
import { CFB_BANK_BASE, CFB_MODEL } from "@/lib/cfb/rules";
import { CFB_CHANGE_EVENT, CFB_SYNC_EVENT, getCfbBankroll } from "@/lib/cfb/store";
import type { CfbGame, CfbMarketKey, CfbRow, CfbSlate, CfbTeam } from "@/lib/cfb/types";
import { quotaRemaining } from "@/lib/fetcher";
import { fmtAmerican, fmtMoney, fmtPct } from "@/lib/format";
import { railLabel } from "@/lib/games";
import { gradeRank } from "@/lib/grade";
import { bookShort, CfbGameCard } from "./CfbGameCard";
import { PairMark, TeamMark } from "./TeamMark";

/**
 * THE CFB BOARD (INSTRUCTION 38, 2026-09-05, Josh: "Board for CFB should be separate"). The
 * page supplies the header; this is the desk: a date rail over every slate date the odds feed
 * knows, a market filter, a team search, the ranked table of every priced side S → F on its EV
 * at Caesars, and under it a card per game. One query per (date, bankroll) against /api/cfb —
 * the route serves odds off a 4-minute cache, so a refresh inside the window costs no quota.
 *
 * Nothing on this surface is estimated: a side with no Caesars quote has no EV, no grade and
 * no stake, and says "—"; a game the odds feed did not match prices nothing and shows ESPN's
 * embedded line as context only. The board is informational — setups, not predictions.
 */

const MARKETS = [
  { key: "all", label: "All" },
  { key: "ml", label: "ML" },
  { key: "spread", label: "Spread" },
  { key: "total", label: "Total" },
] as const;
type MarketFilter = (typeof MARKETS)[number]["key"];

/* ---------- shared desk hooks (CfbGames and CfbSharp reuse these) ---------- */

/** The CFB bankroll off the device store — null until mount so SSR and the first client
    render agree (the slate query waits for it, so the first fetch carries the real figure). */
export function useCfbBankroll(): number | null {
  const [bankroll, setBankroll] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setBankroll(getCfbBankroll());
    read();
    window.addEventListener(CFB_CHANGE_EVENT, read);
    window.addEventListener(CFB_SYNC_EVENT, read);
    return () => {
      window.removeEventListener(CFB_CHANGE_EVENT, read);
      window.removeEventListener(CFB_SYNC_EVENT, read);
    };
  }, []);
  return bankroll;
}

/**
 * Date + slate for the CFB desk. The date starts on today (Pacific) and, once today's slate
 * arrives empty, advances ONCE to the first later slate date the odds feed lists — Friday
 * shows Saturday's board — unless the user has already picked a date. The rail is the union
 * of today, the picked date and every slate date the feed has reported, so it never shrinks
 * while a new date loads. While any game is live the slate refetches every cache window.
 */
export function useCfbDesk() {
  const today = useMemo(ptToday, []);
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(false);
  const bankroll = useCfbBankroll();
  const [known, setKnown] = useState<string[]>([]);

  const q = useQuery<CfbSlate>({
    queryKey: cfbQueryKey(date, bankroll ?? CFB_BANK_BASE),
    queryFn: () => loadCfbSlate(date, { bankroll: bankroll ?? undefined }),
    staleTime: CFB_STALE_MS,
    retry: 1,
    enabled: bankroll != null,
    refetchInterval: (query) => (query.state.data?.games.some((g) => g.status === "live") ? CFB_STALE_MS : false),
  });

  const slate = q.data;
  useEffect(() => {
    if (!slate) return;
    setKnown((prev) => {
      const next = new Set(prev);
      for (const d of slate.slateDates) next.add(d);
      return next.size === prev.length ? prev : [...next].sort();
    });
  }, [slate]);

  const advanced = useRef(false);
  useEffect(() => {
    if (advanced.current || picked || !slate || slate.date !== today) return;
    advanced.current = true;
    if (slate.games.length > 0) return;
    const next = slate.slateDates.find((d) => d > today);
    if (next) setDate(next);
  }, [slate, picked, today]);

  const rail = useMemo(() => [...new Set([today, date, ...known])].sort(), [today, date, known]);
  const pick = useCallback((d: string) => {
    setPicked(true);
    setDate(d);
  }, []);

  return { today, date, pick, rail, bankroll, q, slate };
}

/* ---------- the ranked rows ---------- */

export type BoardRow = { row: CfbRow; game: CfbGame; team: CfbTeam | null };

/** Every priced side on the slate, ranked S → F (grade, then EV at Caesars, then fair). Sides
    without a Caesars quote sort last — they carry no EV and no grade. */
export function rankRows(games: CfbGame[]): BoardRow[] {
  const out: BoardRow[] = [];
  for (const game of games) {
    for (const row of game.rows) {
      out.push({ row, game, team: row.teamId == null ? null : row.teamId === game.home.id ? game.home : game.away });
    }
  }
  return out.sort((a, b) => {
    const g = gradeRank(b.row.grade) - gradeRank(a.row.grade);
    if (g !== 0) return g;
    const e = (b.row.evCz ?? -Infinity) - (a.row.evCz ?? -Infinity);
    if (e !== 0) return e;
    return b.row.fair - a.row.fair;
  });
}

/** Team search: school name, short name or abbreviation of either side (case-insensitive). */
export function gameMatches(g: CfbGame, needle: string): boolean {
  if (!needle) return true;
  const hay = [g.home.name, g.home.short, g.home.abbr, g.away.name, g.away.short, g.away.abbr].join(" ").toLowerCase();
  return hay.includes(needle);
}

function matchesSearch(r: BoardRow, needle: string): boolean {
  return !needle || gameMatches(r.game, needle) || r.row.label.toLowerCase().includes(needle);
}

/* ---------- the desk ---------- */

export function CfbBoard() {
  const { today, date, pick, rail, bankroll, q, slate } = useCfbDesk();
  const qc = useQueryClient();
  const [market, setMarket] = useState<MarketFilter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ranked = useMemo(() => (slate ? rankRows(slate.games) : []), [slate]);
  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () => ranked.filter((r) => (market === "all" || r.row.market === market) && matchesSearch(r, needle)),
    [ranked, market, needle],
  );
  const cards = useMemo(() => (slate ? slate.games.filter((g) => gameMatches(g, needle)) : []), [slate, needle]);

  const plusEv = ranked.filter((r) => (r.row.evCz ?? -1) > 0 && r.row.playable);
  const top = plusEv[0] ?? null;
  const czGames = slate ? slate.games.filter((g) => g.rows.some((r) => r.cz != null)).length : 0;
  const fpiTeams = slate ? slate.games.flatMap((g) => [g.home, g.away]).filter((t) => t.fpi != null).length : 0;
  const quota = quotaRemaining();

  const columns: Column<BoardRow>[] = useMemo(
    () => [
      {
        key: "pick",
        header: "Pick",
        stickyLeft: 0,
        sortValue: (r) => r.row.label,
        cell: (r) => (
          <div className="flex max-w-[168px] items-center gap-2 md:max-w-none">
            {r.team ? <TeamMark team={r.team} size="sm" showRank showAbbr={false} /> : <PairMark away={r.game.away} home={r.game.home} size="sm" />}
            <div className="min-w-0">
              <div className="truncate font-medium text-text">{r.row.label}</div>
              <div className="truncate text-[10.5px] text-faint">{r.row.sub}</div>
            </div>
          </div>
        ),
      },
      {
        key: "grade",
        header: "Grade",
        sortValue: (r) => gradeRank(r.row.grade),
        cell: (r) => <GradeChip grade={r.row.grade} basis="EV @ Caesars" />,
      },
      {
        key: "fair",
        header: "Fair",
        numeric: true,
        sortValue: (r) => r.row.fair,
        cell: (r) => (
          <span className="num" title={r.row.push > 0 ? `${fmtPct(r.row.fair)} win · ${fmtPct(r.row.push)} push` : `${fmtPct(r.row.fair)} win`}>
            {fmtAmerican(r.row.fairAm)} <span className="text-[10px] text-faint">{fmtPct(r.row.fair, 0)}</span>
          </span>
        ),
      },
      {
        key: "cz",
        header: "Caesars",
        numeric: true,
        sortValue: (r) => r.row.cz?.price ?? -100000,
        cell: (r) =>
          r.row.cz ? (
            <span className="inline-flex items-baseline gap-1">
              <OddsCell odds={r.row.cz.price} book="caesars" />
              {r.row.market !== "ml" && r.row.cz.line != null && r.row.line != null && Math.abs(r.row.cz.line - r.row.line) > 1e-9 && (
                <span className="num text-[9.5px] text-cfb" title="Caesars' own line differs from the consensus line">
                  @{r.row.market === "spread" ? fmtLine(r.row.cz.line) : r.row.cz.line}
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
        sortValue: (r) => r.row.best?.price ?? -100000,
        cell: (r) =>
          r.row.best ? (
            <span className="num text-[12px] text-muted">
              {fmtAmerican(r.row.best.price)} <span className="text-[9.5px] text-faint">{bookShort(r.row.best)}</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "ev",
        header: "EV @ CZR",
        numeric: true,
        sortValue: (r) => r.row.evCz ?? -999,
        cell: (r) => (r.row.evCz != null ? <EvBadge ev={r.row.evCz} /> : <span className="text-faint">—</span>),
      },
      {
        key: "kelly",
        header: "¼-Kelly",
        numeric: true,
        sortValue: (r) => (r.row.playable ? r.row.kelly : -1),
        cell: (r) => (r.row.playable ? <KellyChip stake={r.row.kelly} /> : <span className="text-faint">—</span>),
      },
    ],
    [],
  );

  const loading = bankroll == null || q.isPending;

  return (
    <div className="space-y-5">
      <DateRail dates={rail} date={date} today={today} onPick={pick} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Games" value={slate ? String(slate.games.length) : "—"} sub={slate ? `${czGames} priced at Caesars` : railLabel(date)} tone="cfb" icon="🏈" />
        <StatTile label="+EV at Caesars" value={slate ? String(plusEv.length) : "—"} sub={slate ? `of ${ranked.length} priced sides` : undefined} tone={plusEv.length > 0 ? "pos" : "muted"} />
        <StatTile
          label="Best edge"
          value={top ? <span className="block truncate text-[16px]">{top.row.label}</span> : "—"}
          sub={top && top.row.evCz != null && top.row.cz ? `${fmtAmerican(top.row.cz.price)} · ${top.row.evCz > 0 ? "+" : ""}${top.row.evCz.toFixed(1)}% · ¼K ${fmtMoney(top.row.kelly)}` : "no +EV side yet"}
          tone={top ? "pos" : "muted"}
        />
        <StatTile
          label="ESPN FPI"
          value={slate ? `${fpiTeams}/${slate.games.length * 2}` : "—"}
          sub={slate?.fpiUpdated ? `teams rated · ${fpiStamp(slate.fpiUpdated)}` : slate ? "FPI unavailable this load" : undefined}
          tone="cfb"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={MARKETS} value={market} onChange={setMarket} size="sm" tone="cfb" label="Market" />
        <label className="relative min-w-0 flex-1 basis-[160px]">
          <span className="sr-only">Search teams</span>
          <input
            type="search"
            aria-label="Search teams"
            placeholder="Search teams…"
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
          title="Prices cache up to 4 minutes per date — a refresh inside the window spends no Odds API quota"
        >
          {q.isFetching ? "Pulling…" : "↻ Refresh"}
        </Pill>
      </div>

      {loading ? (
        <Panel>
          <SkeletonRows rows={8} />
        </Panel>
      ) : q.isError ? (
        <Panel>
          <ErrorState title="Couldn't load the CFB slate" body={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !slate || slate.games.length === 0 ? (
        <Panel>
          <EmptyState
            title={`No FBS games on ${railLabel(date)}`}
            body="Pick another date on the rail — it lists every date the odds feed has an upcoming kickoff."
          />
        </Panel>
      ) : (
        <>
          {slate.oddsMissing && (
            <div className="rounded-(--radius-panel) border border-neg/30 bg-neg/5 px-4 py-3 text-[12px] leading-relaxed text-muted">
              <b className="text-neg">Scores only.</b> The server had no odds feed for this load (no key, or the fetch failed) — prices, EV,
              grades and stakes are unavailable and nothing is estimated in their place.
            </div>
          )}
          {slate.unmatched > 0 && !slate.oddsMissing && (
            <div className="text-[11px] leading-relaxed text-muted">
              <span className="text-cfb">{slate.unmatched}</span> of {slate.games.length} games have no odds-feed match — their cards show ESPN&apos;s
              line as context only.
            </div>
          )}

          <Reveal>
            {rows.length === 0 ? (
              <Panel>
                <EmptyState
                  title={needle ? `Nothing matches “${search.trim()}”` : market === "all" ? "No priced sides yet" : `No ${MARKETS.find((m) => m.key === market)?.label} lines yet`}
                  body={needle ? "Try a school, a nickname or an abbreviation." : `A market needs ${CFB_MODEL.minBooks} books at a line before it is priced.`}
                />
              </Panel>
            ) : (
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.row.key} maxHeight="62vh" stagger rowClassName={(r) => ((r.row.evCz ?? -1) > 0 ? "ev-glow" : "")} />
            )}
          </Reveal>

          <Reveal>
            <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Games <span className="num text-faint">{cards.length}</span>
              <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-faint">tap a card for the model</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((g) => (
                <CfbGameCard key={g.id} game={g} expanded={open.has(g.id)} onToggle={() => toggle(g.id)} />
              ))}
            </div>
          </Reveal>

          <div className="text-[10.5px] leading-relaxed text-faint">
            {quota && (
              <>
                Odds API quota remaining: <span className="num">{quota}</span> ·{" "}
              </>
            )}
            Prices cache up to 4 min per date — a refresh inside the window spends no quota. Caesars is the settlement price (The Odds
            API&apos;s US feed); the NV app can differ — confirm at lock. Fair prices come from the desk&apos;s margin model over the de-vigged
            consensus and ESPN FPI; setups that match criteria, not predictions. Informational only, not betting advice.
          </div>
        </>
      )}
    </div>
  );
}

/** "Sep 4" from ESPN's FPI lastUpdated ISO stamp; the raw string when it does not parse. */
export function fpiStamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }).format(new Date(t));
}
