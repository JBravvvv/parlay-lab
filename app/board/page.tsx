"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EvBadge } from "@/components/ui/EvBadge";
import { ProbBar } from "@/components/ui/ProbBar";
import { KellyChip } from "@/components/ui/KellyChip";
import { GradeChip } from "@/components/ui/GradeChip";
import { gradeFromEv, gradeRank } from "@/lib/grade";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import { UfcBoard } from "@/components/ufc/UfcBoard";
import { AsgBoardTab } from "@/components/allstar/AllStarSurfaces";
import { ASG_ENABLED, CFB_ENABLED, UFC_ENABLED } from "@/lib/features";
import { useSport } from "@/lib/sport";
import { CfbBoard } from "@/components/cfb/CfbBoard";
import { ParlaysSection } from "@/components/mlb/ParlaysSection";
import { SharpDesk } from "@/components/mlb/SharpDesk";
import { SimDesk, type SimMarketRow } from "@/components/mlb/SimDesk";
import { getMoney, getSelectionMode, SIM_PATHS_TXT, type SelectionMode } from "@/lib/engine-client";
import { MODE_LABEL, orderByMode } from "@/lib/board-order";
import { nowLabel, useLiveNow } from "@/lib/liveNow";
import { pickStatus, STATUS_LABEL } from "@/lib/picks-status";
import { useCzHidden } from "@/lib/cz-offered";
import { CzInfo } from "@/components/ui/CzInfo";
import { quotaRemaining } from "@/lib/fetcher";
import type { PickRow } from "@/engine";
import { splitPure } from "@/lib/tab-purity";
import { BoardLabel, PlayerName } from "@/components/player/PlayerName";
import { normalizeName, parseBoardLabel } from "@/lib/player-card";
import type { PropBoardGame } from "@/engine";
import { useLineups } from "@/lib/useLineups";
import { lineupStatus, marketOfLkey, SCRATCHED_LABEL } from "@/lib/lineup-check";

/* INSTRUCTION 31 (2026-09-04, Josh: "there should be two tabs next to each other 'Top 50' &
   'ALL'; If I click on 'Top 50' then click on one of the categories (ie: hits) then all top
   50 picks in that category will show; If I click on 'ALL' then click on one of the
   categories (ie: hits) then it will show all daily hits props starting with S grade, then
   A, B, C, etc down"). TOP 50 = the engine's ranked pool / the day's stamped picks (as
   before); ALL = every priced line on the day's prop board (data.propBoard — the same
   uncapped book the Parlay Builder browses), graded on model − fair and ordered S → F. */
type Scope = "top" | "all";
const MARKET_SHORT: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "TB",
  batter_home_runs: "HR",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K",
  pitcher_outs: "Outs",
};
const ALL_SCOPE_CAP = 400;

const CAT_LABELS: Record<string, string> = {
  all: "OVERALL",
  ml: "MONEYLINE",
  rl: "RUN LINE",
  batter_hits: "HITS",
  batter_total_bases: "TOTAL BASES",
  batter_home_runs: "HOME RUNS",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "STRIKEOUTS",
  pitcher_outs: "OUTS",
};

export default function BoardPage() {
  const { data: board, isPending, isError, refetch } = useBoard();
  // the global SportSwitch (🏈 CFB); the `sport` state below is the MLB desk's own ufc/asg sub-switch
  const desk = useSport();
  const regen = useRegenerateBoard();
  const [cat, setCat] = useState("all");
  const [live, setLive] = useState(false);
  const [scope, setScope] = useState<Scope>("top");
  /* INSTRUCTION 33 (2026-09-04, Josh: "There should be a search bar on right side of live tab
     on board to search for a player within the prop i have highlighted or all of their daily
     props if i search under 'All' tab") */
  const [search, setSearch] = useState("");
  const needle = normalizeName(search.trim());
  const nameHit = useCallback(
    (label: string | null | undefined) => !needle || normalizeName((label && parseBoardLabel(label)?.name) || label || "").includes(needle),
    [needle],
  );
  // ONE SELECTION MODE SITE-WIDE (2026-08-11, Josh's rule): the Board reads the
  // FULL Settings mode like The Sharp and the Builder do — mounted-gated
  // localStorage read (hydration rule). dk_fd additionally reprices the columns
  // at the DK/FD basis; every mode drives the TOP 50 order via orderByMode.
  const [selMode, setSelMode] = useState<SelectionMode>("ev_gated");
  useEffect(() => setSelMode(getSelectionMode()), []);
  const basisMode = selMode === "dk_fd";
  // localStorage only after mount — an initializer read would diverge from the
  // server's "mlb" and trip a hydration mismatch
  const [sport, setSport] = useState<"mlb" | "ufc" | "asg">("mlb");
  useEffect(() => {
    try {
      const s = localStorage.getItem("pl_board_sport");
      if (UFC_ENABLED && s === "ufc") setSport("ufc");
      else if (ASG_ENABLED && s === "asg") setSport("asg");
    } catch { /* fresh device */ }
  }, []);
  const pickSport = (s: "mlb" | "ufc" | "asg") => {
    setSport(s);
    try { localStorage.setItem("pl_board_sport", s); } catch {}
  };

  const d = board?.data;
  const cats = (live ? d?.categoriesLive : d?.categories) ?? {};
  /* TAB PURITY (2026-08-05, operator report: RL under Hits, ML under RL). The engine's arrays
     measured pure on the fixture and this page is key-addressed — but the defensive layer now
     makes the property enforced rather than assumed: a row failing its tab's market key is
     EXCLUDED and COUNTED, never rendered under the wrong tab. Purity runs BEFORE any ranking
     or truncation, so a contaminated bucket can never eat another market's slots. */
  const { rows, crossMarket } = useMemo(() => {
    const { pure, excluded } = splitPure(cat, cats[cat] ?? []);
    // TOP 50 runs on the site-wide selection mode (the legacy "all" ranking was
    // EV at the all-books best price — a price no mode selects at). Rows missing
    // the mode's price sink to the bottom, never vanish. Category tabs stay
    // probability-ranked by design: they are the Builder's high-floor parlay pool.
    const base = cat === "all" ? orderByMode(pure, selMode) : pure;
    return { rows: base as PickRow[], crossMarket: excluded.length };
  }, [cats, cat, selMode]);
  /* EVERY PICK POSTS (2026-08-09, Josh's call): no more holding rows out for lacking a
     Caesars price — off-book rows render with their best price and Josh's own ⓘ toggle
     ("offered at Caesars right now?") is the only thing that hides a pick. */
  const cz = useCzHidden();
  /* INSTRUCTION 28 (2026-09-04, Josh: "It keeps showing Jose Caballero on the board even
     with a refresh yet he's not in the yankees starting lineup so there's no bets available
     for him at any book"). The stored board — and the stamped picks, which ARE that board —
     keep a batter the engine took from a PROJECTED lineup after the posted nine excluded
     him. Render-time cross-check against statsapi's posted lineups (src/lib/lineup-check.ts):
     an absent batter is SCRATCHED — hidden by default, one toggle shows him greyed with an
     OUT tag. Nothing stored is touched; pitchers and unposted games are never judged. */
  const lineups = useLineups(board?.date ?? null);
  const [showScratched, setShowScratched] = useState(false);
  const pkOf = useCallback((gkey: string | null | undefined) => (gkey ? d?.gameInfo?.[gkey]?.pk ?? null : null), [d]);
  const isOut = useCallback(
    (label: string | null | undefined, market: string | null, gkey: string | null | undefined) =>
      lineupStatus(label ? parseBoardLabel(label)?.name ?? label : null, market, pkOf(gkey), lineups.data) === "out",
    [pkOf, lineups.data],
  );
  const rowOut = useCallback((r: PickRow) => isOut(r.label, marketOfLkey(r.lkey), r.gkey), [isOut]);
  const visibleRows = useMemo(
    () => rows.filter((r) => nameHit(r.label) && !cz.isHidden(`${r.label}|${r.sub}`) && (showScratched || !rowOut(r))),
    [rows, cz, showScratched, rowOut, nameHit],
  );
  const scratchedHere = useMemo(() => new Set(rows.filter(rowOut).map((r) => `${r.label}|${r.sub}`)).size, [rows, rowOut]);
  // distinct PICKS, not hidden row occurrences — one pick can sit in this list
  // twice (TOP 50 + its category pool) and must still read "1 pick hidden"
  const czHiddenHere = new Set(
    rows.map((r) => `${r.label}|${r.sub}`).filter((k) => cz.isHidden(k)),
  ).size;
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;

  /* THE PICKS PRODUCT ON THE TABS (2026-08-08, operator's screenshot: every prop tab 0 at
     8:12 PM while the stored board carried full N — §12Z.14). The prop tabs were reading
     whatever board object bestBoard held (by evening: a live view with an empty pregame
     pool). They now render THE DAY'S STAMPED PICKS from /api/picks — the stored board,
     with the TTL walk-back and staleNote — so a prop tab is never empty by clock again.
     The LIVE pill still shows the live pool; TOP 50/ML/RL stay the actionable board view. */
  type ApiPick = {
    rank: number; player: string | null; side: string | null; line: number | null;
    prob: number | null; implied: number | null; edge: number | null;
    cz: number | null; odds: string | number | null; book: string | null;
    gkey: string | null; start: string | null; res: string | null; susp?: boolean;
    /** ALL-scope rows only: the row's market (the "every market" view mixes them) */
    market?: string;
  };
  type PicksPayload = {
    date?: string; servedDate?: string | null; staleNote?: string | null;
    picks?: Record<string, ApiPick[]> | null; ns?: Record<string, number>;
    record?: { markets?: Record<string, CohortMkt>; flag?: string | null } | null;
  };
  type CohortMkt = {
    days: number; n: number; w: number; l: number; hitRate: number | null; impliedMean: number | null;
    bySource: { stamped: number; reconstructed: number };
    perDay?: { date: string; n: number; w: number; l: number }[];
  };
  const [picksData, setPicksData] = useState<PicksPayload | null>(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/picks")
      .then((r) => r.json())
      .then((j) => {
        if (!dead && j) setPicksData(j as PicksPayload);
      })
      .catch(() => {});
    return () => {
      void (dead = true);
    };
  }, []);
  const cohorts = picksData?.record?.markets ?? null;
  const catRecord = cohorts?.[cat] ?? null;
  const catDay = catRecord?.perDay?.length
    ? catRecord.perDay.find((d0) => d0.date === picksData?.servedDate) ?? null
    : null;
  const PROP_TABS = useMemo(
    () => new Set(["batter_hits", "batter_total_bases", "batter_home_runs", "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"]),
    [],
  );
  const propRows = !live && PROP_TABS.has(cat) ? picksData?.picks?.[cat] ?? null : null;
  /* ALL scope: every priced OVER line on the prop board for this market (or every market),
     graded on pO − fO (the engine's model % minus the de-vigged fair — the same "edge" the
     stamped picks grade on), ordered S → F then by edge. Rows the engine did not price
     (pO null: bench bats, tiny samples) carry no grade and sink to the bottom. */
  const allRows = useMemo<ApiPick[] | null>(() => {
    if (scope !== "all" || live || !(PROP_TABS.has(cat) || cat === "all")) return null;
    const pb = (d?.propBoard ?? []) as PropBoardGame[];
    const mkts = cat === "all" ? Object.keys(MARKET_SHORT) : [cat];
    const out: ApiPick[] = [];
    for (const g of pb) {
      for (const m of mkts) {
        for (const r of g.markets?.[m] ?? []) {
          const edge = r.pO != null && r.fO != null ? Math.round((r.pO - r.fO) * 10) / 10 : null;
          const odds = r.o ?? r.cz?.o ?? null;
          out.push({
            rank: 0, player: `${r.p} (${r.tm})`, side: "o", line: r.ln, prob: r.pO, implied: r.fO, edge,
            cz: r.cz?.o ?? null, odds, book: r.o != null ? r.oBook : odds != null ? "Caesars" : null,
            gkey: g.gkey, start: g.start, res: null, market: m,
          });
        }
      }
    }
    out.sort(
      (a, b) =>
        gradeRank(gradeFromEv(b.edge)) - gradeRank(gradeFromEv(a.edge)) ||
        (b.edge ?? -99) - (a.edge ?? -99) ||
        (b.prob ?? -1) - (a.prob ?? -1),
    );
    out.forEach((r, i) => void (r.rank = i + 1));
    return out;
  }, [scope, live, cat, d, PROP_TABS]);
  const pickRows = allRows ?? propRows;

  // live "now" stats for in-progress games — one shared poll for the whole page
  // (board rows, parlay legs); only live games fetch boxscores
  const liveReqs = useMemo(
    () => (d?.gameInfo ? Object.values(d.gameInfo).map((g) => ({ pk: g.pk, date: g.start ?? null })) : []),
    [d],
  );
  const liveNow = useLiveNow(liveReqs);
  const legLive = useCallback(
    (l: { gkey?: string | null; lkey?: string | null }) =>
      l.gkey && d?.gameInfo ? liveNow.legNow(d.gameInfo[l.gkey]?.pk ?? null, l.lkey) : null,
    [d, liveNow],
  );

  const columns: Column<PickRow>[] = useMemo(
    () => [
      {
        key: "pick",
        header: "Pick",
        sortValue: (r) => r.label,
        cell: (r) => {
          const n = legLive({ gkey: r.gkey, lkey: r.lkey });
          return (
            <div className={r.susp || rowOut(r) ? "opacity-50" : undefined}>
              <div className="font-medium text-text">
                <BoardLabel label={r.label} />
                {rowOut(r) && <OutTag />}
                <CzInfo pickKey={`${r.label}|${r.sub}`} offered={!cz.isHidden(`${r.label}|${r.sub}`)} onToggle={cz.toggle} />
              </div>
              <div className="text-[11px] text-muted">{r.sub}</div>
              {r.susp && (
                <div
                  className="mt-0.5 inline-block rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted"
                  title="H+R+RBI alt lines above O0.5 hit 32% vs 55%+ implied over the graded ledger — barred from every auto-built ticket until the market recalibrates"
                >
                  Suspended — sim recalibration
                </div>
              )}
              {r.watch && (
                <div className="mt-0.5 inline-block rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold" title="H+R+RBI O0.5 stays active (12/19 this week) but is on watch">
                  watch
                </div>
              )}
              {n && (
                <div
                  className="num text-[10px] font-bold text-live"
                  title="Live from the official boxscore — updates every minute while the game is in progress"
                >
                  ● {nowLabel(n)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "grade",
        header: "Grade",
        // grades the SAME EV the mode displays — czEv at Caesars, bsEv under dk_fd
        sortValue: (r) => gradeRank(gradeFromEv(basisMode ? (r.bsEv == null ? null : Number(r.bsEv)) : r.czEv == null ? null : Number(r.czEv))),
        cell: (r) =>
          basisMode ? (
            <GradeChip grade={gradeFromEv(r.bsEv == null ? null : Number(r.bsEv))} basis="EV @ basis (DK/FD)" />
          ) : (
            <GradeChip grade={gradeFromEv(r.czEv == null ? null : Number(r.czEv))} basis="EV @ Caesars" />
          ),
      },
      {
        key: "prob",
        header: "True %",
        numeric: true,
        sortValue: (r) => Number(r.prob) || 0,
        cell: (r) => <ProbBar p={(Number(r.prob) || 0) / 100} className="w-28 justify-end md:w-36" />,
      },
      ...(basisMode
        ? [
            // dk_fd: the "Best" (all-books) column is dropped on purpose — that
            // price is exactly what the basis mode forbids from steering anything
            {
              key: "basis",
              header: "Basis",
              numeric: true,
              sortValue: (r) => Number(String(r.bsOdds ?? "").replace(/[^\d.-]/g, "")) || 0,
              cell: (r) =>
                r.bsOdds != null ? (
                  <span className="num inline-flex items-baseline gap-1.5">
                    <OddsCell odds={r.bsOdds as never} />
                    <span className="text-[9.5px] uppercase text-muted">{String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}</span>
                  </span>
                ) : (
                  <span
                    className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold"
                    title="No DraftKings or FanDuel quote — card-ineligible under dk_fd (still a real pick; manual slips only)"
                  >
                    NO DK/FD BASIS
                  </span>
                ),
            } satisfies Column<PickRow>,
            {
              key: "cz",
              header: "CZ (settles)",
              numeric: true,
              sortValue: (r) => Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0,
              cell: (r) => <OddsCell odds={r.czOdds as never} book="caesars" />,
            } satisfies Column<PickRow>,
            {
              key: "bsEv",
              header: "EV @ basis",
              numeric: true,
              sortValue: (r) => (r.bsEv == null ? -99 : Number(r.bsEv)),
              cell: (r) =>
                r.bsEv != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <EvBadge ev={Number(r.bsEv)} />
                    {r.bsBadge ? (
                      <span className="rounded-full border border-pos/50 bg-pos/10 px-1.5 py-0.5 text-[9px] font-bold text-pos">EDGE</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                ),
            } satisfies Column<PickRow>,
            {
              key: "stake",
              header: "¼-Kelly",
              numeric: true,
              sortValue: (r) => Number(r.bsKellyF) || 0,
              cell: (r) =>
                r.bsKellyF != null && Number(r.bsKellyF) > 0 ? (
                  <KellyChip stake={Number(r.bsKellyF) * bankroll} />
                ) : (
                  <span className="text-faint">—</span>
                ),
            } satisfies Column<PickRow>,
          ]
        : [
            {
              key: "best",
              header: "Best",
              numeric: true,
              sortValue: (r) => Number(String(r.odds).replace(/[^\d.-]/g, "")) || 0,
              cell: (r) => (r.odds != null ? <OddsCell odds={r.odds as never} /> : <span className="text-faint">—</span>),
            } satisfies Column<PickRow>,
            {
              key: "cz",
              header: "Caesars",
              numeric: true,
              sortValue: (r) => Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0,
              cell: (r) => <OddsCell odds={r.czOdds as never} book="caesars" />,
            } satisfies Column<PickRow>,
            {
              key: "czEv",
              header: "EV @ CZR",
              numeric: true,
              sortValue: (r) => Number(r.czEv) || 0,
              cell: (r) => (r.czEv != null ? <EvBadge ev={Number(r.czEv)} /> : <span className="text-faint">—</span>),
            } satisfies Column<PickRow>,
            {
              key: "stake",
              header: "¼-Kelly",
              numeric: true,
              sortValue: (r) => Number(r.czKellyF) || 0,
              cell: (r) =>
                r.czKellyF != null && Number(r.czKellyF) > 0 ? (
                  <KellyChip stake={Number(r.czKellyF) * bankroll} />
                ) : (
                  <span className="text-faint">—</span>
                ),
            } satisfies Column<PickRow>,
          ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bankroll, basisMode, legLive, cz.hidden, rowOut],
  );

  /* INSTRUCTION 29 (2026-09-04, Josh: "I should be able to sort each tab on the 'Board'
     like H+R+RBI, Hits, etc by clicking on the title of the column ie: 'Tier' or 'Edge
     Status'"): the stamped-picks table is now the same sortable DataTable the ML/RL tabs
     use — every column carries a sortValue, so every header is clickable (▲/▼). */
  const pickOut = useCallback((p: ApiPick) => isOut(p.player, p.market ?? cat, p.gkey), [isOut, cat]);
  const pickKey = useCallback((p: ApiPick) => `${p.market ?? cat}|${p.player}|${p.line}|${p.side}`, [cat]);
  const pickColumns: Column<ApiPick>[] = useMemo(() => {
    const now = Date.now();
    const statusRank: Record<string, number> = { won: 0, live: 1, upcoming: 2, lost: 3, void: 4, ungradable: 5 };
    return [
      { key: "rank", header: "#", numeric: true, sortValue: (p) => p.rank, cell: (p) => <span className="text-faint">{p.rank}</span> },
      {
        key: "grade",
        header: "Grade",
        sortValue: (p) => gradeRank(gradeFromEv(p.edge == null ? null : Number(p.edge))),
        cell: (p) => <GradeChip grade={gradeFromEv(p.edge == null ? null : Number(p.edge))} basis="model − implied edge (pts)" />,
      },
      {
        key: "pick",
        header: "Pick",
        sortValue: (p) => p.player ?? "",
        cell: (p) => {
          const pk = pickKey(p);
          const mk = p.market && cat === "all" ? `${MARKET_SHORT[p.market] ?? p.market} ` : "";
          return (
            <div className={pickOut(p) ? "opacity-50" : undefined}>
              {p.player ? <PlayerName name={parseBoardLabel(p.player)?.name ?? p.player} team={parseBoardLabel(p.player)?.team ?? null} /> : null}{" "}
              <span className="text-muted">
                {mk}{p.side === "o" ? `over ${p.line ?? ""}` : p.side === "u" ? `under ${p.line ?? ""}` : p.side ?? ""}
              </span>
              <CzInfo pickKey={pk} offered={!cz.isHidden(pk)} onToggle={cz.toggle} />
              {pickOut(p) && <OutTag />}
              {p.susp && <span className="ml-1 text-[10px] text-gold">SUSPENDED — shown always, never on a ticket</span>}
            </div>
          );
        },
      },
      {
        key: "price",
        header: "Lock price",
        sortValue: (p) => (p.odds == null || p.odds === "" ? -Infinity : Number(p.odds)),
        cell: (p) => (
          <span className="num text-muted">
            {p.odds ?? "—"}
            {p.book ? <span className="ml-1 text-[10px] text-faint">{p.book}</span> : null}
          </span>
        ),
      },
      { key: "model", header: "Model", numeric: true, sortValue: (p) => Number(p.prob ?? -1), cell: (p) => (p.prob == null ? "—" : `${Number(p.prob).toFixed(1)}%`) },
      {
        key: "implied",
        header: "Implied",
        numeric: true,
        sortValue: (p) => Number(p.implied ?? -1),
        cell: (p) => <span className="text-muted">{p.implied == null ? "—" : `${Number(p.implied).toFixed(1)}%`}</span>,
      },
      {
        key: "edge",
        header: "Edge",
        numeric: true,
        sortValue: (p) => Number(p.edge ?? -Infinity),
        cell: (p) => (p.edge == null ? "—" : `${Number(p.edge) > 0 ? "+" : ""}${Number(p.edge).toFixed(1)}`),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (p) => statusRank[pickStatus(p.start, p.res, now)] ?? 9,
        cell: (p) => {
          const st = pickStatus(p.start, p.res, now);
          return <span className={`text-[11px] ${st === "won" ? "text-live" : st === "lost" ? "text-red-400" : "text-muted"}`}>{STATUS_LABEL[st]}</span>;
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, cz.hidden, pickOut, pickKey]);
  const visiblePicksAll = useMemo(
    () => (pickRows ?? []).filter((p) => nameHit(p.player) && !cz.isHidden(pickKey(p)) && (showScratched || !pickOut(p))),
    [pickRows, cz, pickKey, showScratched, pickOut, nameHit],
  );
  // the every-market ALL view is thousands of lines — cap the render, search narrows it
  const capped = allRows != null && visiblePicksAll.length > ALL_SCOPE_CAP;
  const visiblePicks = capped ? visiblePicksAll.slice(0, ALL_SCOPE_CAP) : visiblePicksAll;
  const scratchedPicks = useMemo(() => (pickRows ?? []).filter(pickOut).length, [pickRows, pickOut]);

  const gameCount = d?.gameInfo ? Object.keys(d.gameInfo).length : 0;
  const pickCount = d ? Object.entries(d.categories).filter(([k]) => k !== "all").reduce((s, [, v]) => s + v.length, 0) : 0;
  const quota = quotaRemaining();

  /* CFB desk (2026-09-05): the global SportSwitch routes the page to the College Football
     board. Every hook above has already run, so this early return is hooks-safe. */
  if (CFB_ENABLED && desk === "cfb") {
    return (
      <>
        <PageHeader
          title="Board"
          eyebrow="College Football"
          chip={<CfbChip />}
          sub="Every FBS game on the slate with a Caesars price — sides, totals and moneylines against the desk's market + FPI number."
        />
        <CfbBoard />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Board"
        sub={
          sport === "ufc"
            ? "UFC — de-vigged market consensus vs the Caesars moneyline, records live from ESPN"
            : sport === "asg"
            ? "All-Star Game — ML, F3, F5, HR props & correct score · straight bets only at Caesars"
            : d
              ? `${gameCount} games · ${pickCount} live board rows · prop tabs show the day's stamped picks · TOP 50 ${MODE_LABEL[selMode]} · ${basisMode ? "priced at the DK/FD basis (Builder's selection price) · Caesars settles" : "consensus is multi-book, prices are Caesars"} · ${SIM_PATHS_TXT}-path sims · updated ${new Date(board!.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : basisMode
                ? "Consensus de-vigged probability · EV at the DK/FD basis, settled at Caesars"
                : "Consensus de-vigged probability vs the Caesars line"
        }
        action={
          sport === "mlb" ? (
            <Pill variant="primary" onClick={() => regen.mutate()} disabled={regen.isPending || isPending}>
              {regen.isPending ? "Scanning slate…" : d ? "Refresh MLB" : "Generate board"}
            </Pill>
          ) : undefined
        }
      />

      {(UFC_ENABLED || ASG_ENABLED) && (
        <div className="mb-4 flex items-center gap-2">
          <FilterPill selected={sport === "mlb"} onClick={() => pickSport("mlb")}>⚾ MLB</FilterPill>
          {UFC_ENABLED && <FilterPill selected={sport === "ufc"} onClick={() => pickSport("ufc")}>🥊 UFC</FilterPill>}
          {ASG_ENABLED && <FilterPill selected={sport === "asg"} onClick={() => pickSport("asg")}>⭐ ASG</FilterPill>}
        </div>
      )}

      {sport === "ufc" ? (
        <UfcBoard />
      ) : sport === "asg" ? (
        <AsgBoardTab />
      ) : (
        <>
      {typeof d?.overview === "string" && d.overview && (
        <Reveal>
          <div className="mb-4 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            {d.overview}
          </div>
        </Reveal>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-white/[0.08] bg-surface-2 p-0.5" data-testid="board-scope" role="tablist">
          {(["top", "all"] as Scope[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={scope === k}
              onClick={() => setScope(k)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                scope === k ? "bg-pos/20 text-pos" : "text-muted hover:text-text"
              }`}
              title={k === "top" ? "The engine's ranked top 50 per market — the day's stamped picks" : "Every priced line on today's prop board, graded S → F"}
            >
              {k === "top" ? "Top 50" : "All"}
            </button>
          ))}
        </div>
        {Object.keys(cats)
          .sort((a, b) => (a === "all" ? -1 : b === "all" ? 1 : 0))
          .map((k) => (
            <FilterPill key={k} selected={cat === k} onClick={() => setCat(k)}>
              {scope === "all" && k === "all" ? "EVERY MARKET" : CAT_LABELS[k] ?? k.toUpperCase()}
              {scope === "top" && <span className="num ml-1 text-[10px] opacity-70">{(cats[k] ?? []).length}</span>}
            </FilterPill>
          ))}
      </div>
      <div className="mb-4 flex items-center gap-2">
        {d?.categoriesLive && Object.values(d.categoriesLive).some((v) => v.length) && (
          <FilterPill
            selected={live}
            onClick={() => {
              setLive(!live);
              setCat("all");
            }}
            className={live ? "" : "!text-live"}
          >
            ● LIVE
          </FilterPill>
        )}
        <label className="ml-auto flex h-8 w-full max-w-[240px] items-center gap-2 rounded-[10px] border border-white/[0.08] bg-surface-2 px-2.5 focus-within:border-pos/50">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-faint" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={scope === "all" && cat === "all" ? "Search a player's props…" : "Search players…"}
            inputMode="search"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Search players"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-faint"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] text-muted">
              ✕
            </button>
          )}
        </label>
      </div>

      {catRecord && catRecord.n > 0 && (
        <div className="mb-3 rounded-(--radius-panel) border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-muted">
          <span className="font-semibold text-fg">PICKS RECORD</span>{" "}
          <span className="num">
            {catRecord.w}–{catRecord.l}
          </span>{" "}
          over {catRecord.days} day{catRecord.days === 1 ? "" : "s"} · hit{" "}
          <span className="num">{catRecord.hitRate == null ? "—" : `${(catRecord.hitRate * 100).toFixed(1)}%`}</span> vs implied{" "}
          <span className="num">{catRecord.impliedMean == null ? "—" : `${(catRecord.impliedMean * 100).toFixed(1)}%`}</span>
          {catDay && (
            <span>
              {" "}· today <span className="num">{catDay.w}–{catDay.l}</span>
            </span>
          )}
          {catRecord.bySource.reconstructed > 0 && (
            <span className="opacity-70">
              {" "}
              · {catRecord.bySource.stamped} stamped-at-lock / {catRecord.bySource.reconstructed} reconstructed-from-stored-board
            </span>
          )}
        </div>
      )}

      {propRows && picksData?.staleNote && (
        <div className="mb-3 rounded-(--radius-panel) border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11.5px] text-muted">
          {picksData.staleNote}
        </div>
      )}

      {crossMarket > 0 && (
        <div className="mb-3 rounded-(--radius-panel) border border-gold/40 bg-gold/10 px-3 py-2 text-[11.5px] text-gold">
          {crossMarket} row{crossMarket === 1 ? "" : "s"} excluded (cross-market) — rows whose market key does not
          match this tab. They are counted here instead of rendered under the wrong market; if you see this,
          the engine filed rows under the wrong category and that is a data finding, not a display bug.
        </div>
      )}

      {isPending || regen.isPending ? (
        <Panel title={regen.isPending ? "Scanning today's slate" : "Loading board"}>
          <div className="mb-3 text-[12px] text-muted">
            Pulling schedule, lineups, multi-book odds and player form — then de-vigging, simulating
            ({SIM_PATHS_TXT} paths per game; live games resume from the real state) and ranking. ~30–60
            seconds on a full slate.
          </div>
          <SkeletonRows rows={10} />
        </Panel>
      ) : isError ? (
        <ErrorState
          title="Couldn't build the board"
          body="The odds feed or MLB stats API didn't answer. Nothing is fabricated on failure."
          onRetry={() => refetch()}
        />
      ) : pickRows && pickRows.length > 0 ? (
        /* THE DAY'S PICKS (2026-08-08): stamped top-N from the stored board — the same
           cohort /api/picks serves and the grading records. Never empty by clock. */
        <Panel>
          {allRows && (
            <div className="mb-2 text-[11px] text-muted">
              {cat === "all" ? "Every market" : CAT_LABELS[cat]} · {allRows.length} priced line{allRows.length === 1 ? "" : "s"} on today&apos;s board, graded S → F on model − fair
              {capped ? ` · showing the top ${ALL_SCOPE_CAP} — search to narrow` : ""}
            </div>
          )}
          {visiblePicks.length === 0 && needle ? (
            <EmptyState title="No player matches that search" body="Clear the search to see every line in this view." />
          ) : (
            <DataTable columns={pickColumns} rows={visiblePicks} rowKey={(p) => `${p.market ?? cat}|${p.rank}|${p.player}|${p.line}`} />
          )}
          {scratchedPicks > 0 && <ScratchedNote n={scratchedPicks} shown={showScratched} onToggle={() => setShowScratched((v) => !v)} />}
          {cz.count > 0 && (
            <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted">
              <span>{cz.count} pick{cz.count === 1 ? "" : "s"} hidden by your Caesars toggle (all tabs)</span>
              <button type="button" onClick={cz.reset} className="font-semibold text-pos hover:underline">
                show all again
              </button>
            </div>
          )}
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No picks in this category"
            body="Either the slate is empty right now or every candidate failed the engine's thresholds (see another tab)."
          />
        </Panel>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={visibleRows}
            rowKey={(r) => `${r.label}|${r.sub}`}
            stagger
            rowClassName={(r) => (r.susp ? "" : Number(basisMode ? r.bsEv : r.czEv) > 0 ? "ev-glow" : "")}
          />
          {scratchedHere > 0 && <ScratchedNote n={scratchedHere} shown={showScratched} onToggle={() => setShowScratched((v) => !v)} />}
          {czHiddenHere > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-2 text-[11.5px] text-muted">
              <span>
                {czHiddenHere} pick{czHiddenHere === 1 ? "" : "s"} hidden by your Caesars toggle
              </span>
              <button type="button" onClick={cz.reset} className="font-semibold text-pos hover:underline">
                show all again
              </button>
            </div>
          )}
        </>
      )}

      {d && (
        <ParlaysSection
          parlays={d.parlays ?? []}
          mixed={d.parlaysMixed ?? []}
          live={d.parlaysLive ?? []}
          legNow={legLive}
          legOut={(l) => isOut(l.label, marketOfLkey(l.lkey), l.gkey)}
        />
      )}

      <SimDesk rows={(d?.simMarkets as SimMarketRow[] | null | undefined) ?? null} />

      <SharpDesk />

      <div className="mt-4 text-[10.5px] text-faint">
        {quota && <>Odds API quota remaining: <span className="num">{quota}</span> · </>}
        {basisMode
          ? "EV and Kelly are at the DK/FD basis (the better de-vigged price of the pair, tie → DK) — the exact price the Builder selects on. Caesars is the settlement price; the NV app can differ — confirm at lock."
          : "Prices are Caesars' US feed via The Odds API; the NV app can differ — confirm at lock."}
        Informational only, not betting advice.
      </div>
        </>
      )}
    </>
  );
}

/** INSTRUCTION 28 — the OUT tag on a batter the posted lineup excludes. */
function OutTag() {
  return (
    <span
      className="ml-1 inline-block rounded-full border border-red-400/40 bg-red-400/10 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-red-400"
      title={SCRATCHED_LABEL}
    >
      out
    </span>
  );
}

function ScratchedNote({ n, shown, onToggle }: { n: number; shown: boolean; onToggle: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-(--radius-panel) border border-red-400/20 bg-red-400/[0.06] px-4 py-2 text-[11.5px] text-muted">
      <span>
        {n} pick{n === 1 ? "" : "s"} scratched — not in the posted lineup, so no book offers them
      </span>
      <button type="button" onClick={onToggle} className="font-semibold text-pos hover:underline">
        {shown ? "hide scratched" : "show scratched"}
      </button>
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
