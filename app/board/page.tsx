"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { getSyncKey } from "@/lib/ledgerSync";
import { refillReason, useRefillDesk } from "@/lib/refill-client";
import { UfcBoard } from "@/components/ufc/UfcBoard";
import { AsgBoardTab } from "@/components/allstar/AllStarSurfaces";
import { ASG_ENABLED, CFB_ENABLED, NFL_ENABLED, UFC_ENABLED } from "@/lib/features";
import { useSport } from "@/lib/sport";
import { CfbPicksBoard, CfbRefreshPill } from "@/components/cfb/CfbPicksBoard";
import { NflPicksBoard, NflRefreshPill } from "@/components/nfl/NflPicksBoard";
import { ParlaysSection } from "@/components/mlb/ParlaysSection";
import { SharpDesk } from "@/components/mlb/SharpDesk";
import { SimDesk, type SimMarketRow } from "@/components/mlb/SimDesk";
import { GEN_CREDITS_EST, generatesToday, getMoney, getSelectionMode, SIM_PATHS_TXT, type SelectionMode } from "@/lib/engine-client";
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
import { legSideOf, settledRead, type LegSettledRead } from "@/lib/leg-settled";
import { lineOf } from "@/lib/pred-serialize";
import { fmtAmerican } from "@/lib/format";
import { serverRepricesToday, useLiveBoardReprice } from "@/lib/mlb/live-board-client";
import { MLB_LIVE_CLIENT, mlbLiveAgeLabel, mlbLiveClockLabel, mlbLiveGap, mlbLiveGapNote, mlbLiveView, useMlbLiveQuotes, useMlbLiveSyncReady, type MlbLiveQuote, type MlbLiveView } from "@/lib/mlb/live-client";

/* INSTRUCTION 31 (2026-09-04, Josh: "there should be two tabs next to each other 'Top 50' &
   'ALL'; If I click on 'Top 50' then click on one of the categories (ie: hits) then all top
   50 picks in that category will show; If I click on 'ALL' then click on one of the
   categories (ie: hits) then it will show all daily hits props starting with S grade, then
   A, B, C, etc down"). TOP 50 = the engine's ranked pool / the day's stamped picks (as
   before); ALL = every priced line on the day's prop board (data.propBoard — the same
   uncapped book the Parlay Builder browses), graded on model − fair and ordered S → F.
   INSTRUCTION 41 (2026-09-05, Josh: "run everything based on the current caesars lines; hide
   the non-Caesars lines from ALL"): ALL keeps only the lines Caesars posts (`cz` priced) —
   a line another book posts at a different number (the "O 0.5 H+R+RBI" rows Josh saw when
   Caesars had 1.5) is hidden and counted in the footnote, never graded. The settle book
   stays Caesars until Josh says he is in another state on DK / FD. */
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
/** INSTRUCTION 46 (2026-09-08): where the Board remembers whether the engine notes are open */
const OVERVIEW_OPEN_KEY = "pl:board:overview-open";

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
  const refill = useRefillDesk();
  /* THE LIVE POOL JOSH'S OWN TAP CAN NOW BUILD (2026-09-12) — /api/generate?live=1, a server
     re-price that stores the board and its live pool and never enters the stake path, so
     INSTRUCTION 48's locked card cannot move. The paid call itself lives in
     src/lib/mlb/live-board-client.ts: tests/board-settled.test.ts requires this page to write
     exactly one `fetch(` (the free /api/picks read) so that no priced read can be added to a page
     without going through a named client. `onFallback` is the browser re-price, which runs on every
     failure EXCEPT the 45-minute limiter refusing — see that module. */
  const liveBoard = useLiveBoardReprice({ onFallback: () => regen.mutate() });
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
  /* INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "On 'Board' tab, The engine description
     below 'Refresh MLB' button should be expandable/collapsible to reduce space it takes up
     initially"). The engine overview starts COLLAPSED — one truncated preview line behind an
     "Engine notes" toggle; a tap opens the full text. The choice is remembered in localStorage
     (OVERVIEW_OPEN_KEY) and read only after mount — the hydration rule again: the server always
     renders it collapsed, so an initializer read would mismatch. */
  const [overviewOpen, setOverviewOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(OVERVIEW_OPEN_KEY) === "1") setOverviewOpen(true);
    } catch { /* fresh device / storage blocked */ }
  }, []);
  const toggleOverview = () => {
    const next = !overviewOpen;
    setOverviewOpen(next);
    try { localStorage.setItem(OVERVIEW_OPEN_KEY, next ? "1" : "0"); } catch {}
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
    /* INSTRUCTION 50 (2026-09-11, Josh: "it will show the player is top 4th w/ 3 H+R+RBI, but
       show them as an 'S' grade for over .5 H+R+RBI"). The leg key carries the LINE, which is
       what turns a live tally into "already cleared". /api/picks now emits it (W1) and the
       ALL-scope builder below copies it off the prop-board row. */
    lkey?: string | null;
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
  /* INSTRUCTION 50 (2026-09-11), Josh's item 1, verbatim: "Refresh button not working on 'Board'
     tab; works if I refresh on 'The Sharp' tab". THIS was the mechanism. The day's stamped picks —
     the rows every prop tab renders — were fetched ONCE on mount with an empty dependency list, so
     no refresh could ever replace them; navigating to The Sharp unmounted the page and coming back
     remounted it, which refetched. The refresh never did it, the navigation did.

     It is a TanStack query now, keyed ["picks"] and always stale, and both refresh mutations
     invalidate that key (src/lib/refill-client.ts, src/lib/useBoard.ts) — so a tap re-reads the
     picks exactly like leaving and coming back does. No auth, no credits: /api/picks is a free
     read of what the server already stored. */
  const picksQuery = useQuery<PicksPayload>({
    queryKey: ["picks"],
    queryFn: async () => {
      const r = await fetch("/api/picks", { cache: "no-store" });
      if (!r.ok) throw new Error(`picks ${r.status}`);
      return (await r.json()) as PicksPayload;
    },
    staleTime: 0,
    retry: false,
  });
  const picksData = picksQuery.data ?? null;
  /* INSTRUCTION 51 (2026-09-11), Josh's order verbatim: "Authorize the live in-play odds pull for
     MLB". THE SECOND HALF of INSTRUCTION 50 item 2. Item 2 could only suppress a dead row, because
     the in-play re-pull costs money Josh had not authorised. He has now authorised it, for MLB.

     The board still reaches NO paid feed itself: this is one free GET to the budgeted server route
     (src/lib/mlb/live-client.ts), which owns the key, the daily budget, the divergence gate that
     decides which games are worth paying for, and the 429 cooldown. There is no refetchInterval
     anywhere in that module — a timer on a paid feed spends money while nobody is watching. It
     re-reads on mount, on focus, and on Josh's own Refresh tap. */
  const liveQuotes = useMlbLiveQuotes(board?.date ?? null);
  const liveOverlay = liveQuotes.data ?? null;
  /* WHY THERE IS NO LIVE LINE, WHEN THERE IS NO LIVE LINE (fix pass, 2026-09-11). The route is
     behind the sync phrase, so without one stored the query is disabled and the Board shows pregame
     numbers with no explanation — which is the symptom Josh reported, wearing no symptom at all.
     Both reasons are now printed in the footnote: no phrase, or a route that answered with an
     error. */
  const liveSyncReady = useMlbLiveSyncReady();
  const liveError = liveQuotes.error ? String((liveQuotes.error as Error).message ?? liveQuotes.error) : null;
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
  const [allRows, allNoCz] = useMemo<[ApiPick[] | null, number]>(() => {
    if (scope !== "all" || live || !(PROP_TABS.has(cat) || cat === "all")) return [null, 0];
    const pb = (d?.propBoard ?? []) as PropBoardGame[];
    const mkts = cat === "all" ? Object.keys(MARKET_SHORT) : [cat];
    const out: ApiPick[] = [];
    let noCz = 0; // INSTRUCTION 41: lines only other books post are hidden from ALL, counted here
    for (const g of pb) {
      for (const m of mkts) {
        for (const r of g.markets?.[m] ?? []) {
          if (r.cz?.o == null) {
            noCz++;
            continue;
          }
          const edge = r.pO != null && r.fO != null ? Math.round((r.pO - r.fO) * 10) / 10 : null;
          const odds = r.o ?? r.cz?.o ?? null;
          out.push({
            rank: 0, player: `${r.p} (${r.tm})`, side: "o", line: r.ln, prob: r.pO, implied: r.fO, edge,
            cz: r.cz?.o ?? null, odds, book: r.o != null ? r.oBook : odds != null ? "Caesars" : null,
            gkey: g.gkey, start: g.start, res: null, market: m, lkey: r.lkey ?? null,
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
    return [out, noCz];
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

  /* INSTRUCTION 50 item 2 — ONE GUARD PER ROW, not one per cell (fix pass).
     Suppressing only the Grade chip left the same row printing the pregame number four more
     ways: EV @ CZR / EV @ basis with its green EDGE badge, the ¼-Kelly stake chip, the True %
     bar and the row's own ev-glow. On Josh's exact case — 3 H+R+RBI in the top of the 4th
     against a 0.5 line — that reads as one honest cell surrounded by four dishonest ones, and
     the Kelly chip is the worst of them because it is an instruction to stake money on a bet
     that is already decided. Every one of those cells now asks this single question. */
  /* INSTRUCTION 51 — THE OVERLAY'S QUOTE FOR THIS ROW, OR NOTHING.
     Three separate reasons for null, and each is a deliberate refusal rather than an omission:
       • no quote — the book posts no in-play market on this leg, or the budget refused the pull;
       • the game is not live — a quote may never outlive its game, so a final never prints a
         live price, it drops back to the final/SETTLED read on the next render;
       • the quote is older than MLB_LIVE_CLIENT.quoteMaxAgeSec — THE HARD RENDER-TIME DROP. Redis
         may still hold it; the screen may not show it. No label older than the cap can ever
         appear, which is the only thing that lets the word "live" be taken at face value.
     Every one of those falls through to INSTRUCTION 50's SETTLED suppression, byte-identical. */
  const rowLive = useCallback(
    (r: { gkey?: string | null; lkey?: string | null }): MlbLiveQuote | null => {
      const rows = liveOverlay?.rows;
      if (!rows || !r.gkey || !r.lkey) return null;
      const q = rows[`${r.gkey}|${r.lkey}`];
      if (!q) return null;
      const pk = d?.gameInfo?.[r.gkey]?.pk ?? null;
      if (pk == null || !liveNow.games[pk]?.live) return null;
      if (Date.now() - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) return null;
      return q;
    },
    [liveOverlay, d, liveNow],
  );
  /** when THIS GAME's live line was pulled — per game, never board-level; that is the whole answer to "how fresh" */
  const livePricedAt = useCallback(
    (gkey: string | null | undefined) => (gkey ? liveOverlay?.pricedAt?.[gkey] ?? null : null),
    [liveOverlay],
  );

  /* INSTRUCTION 50 item 2 — ONE GUARD PER ROW, now asked AT THE LIVE LINE (INSTRUCTION 51).
     The join is the elegant part, and it must not be "improved": settledRead is handed the
     stored lkey with its THIRD segment swapped for the line the book is posting now. Then
       • case A, re-anchored — 3 against a live 3.5 returns null all by itself, because
         !(3 > 3.5) (src/lib/leg-settled.ts:87). The suppression falls away the moment a real
         line exists, and every money cell on the row comes back graded at that live price.
       • case B, provably settled — 3 against a live 0.5 still reads over-cleared, and now the
         sentence cites the LIVE line rather than a pregame one.
       • case C, no quote — identical to INSTRUCTION 50, byte for byte. That is the default on
         every failure path: no budget, a 429, a game with no in-play market, an unmatched event.
     `lineOf` reads the third segment with no edit to that module (src/lib/pred-serialize.ts:205),
     and tab purity is untouched because segment 1, the player, never changes. */
  const rowSettled = useCallback(
    (r: { gkey?: string | null; lkey?: string | null; sub?: string | null }): LegSettledRead | null => {
      const q = rowLive(r);
      const tally = legLive({ gkey: r.gkey, lkey: r.lkey })?.val;
      /* THE SWAP IS AN OVER-ONLY MOVE (fix pass, 2026-09-11). Re-anchoring says "the bet on this row
         is now the one the book is posting" — which is true for an Over, whose stored leg has WON
         and whose live leg at the new line is a fresh, open, actionable bet. It is false for an
         Under: a tally past the stored line means that Under has LOST, permanently, and swapping
         in a higher live line un-decides a decided loss and prints the row as open. Josh's own
         case, mirrored: 3 H+R+RBI against a stored UNDER 0.5 is gone, and a live 3.5 does not
         bring it back. An Under is therefore always read at the line Josh actually holds; when
         that read is null the row is still open and falls through to the live Under price below. */
      if (!q || legSideOf(r.sub) === "U") return settledRead(r.lkey, r.sub, tally);
      const [player, market] = String(r.lkey ?? "").split("|");
      return settledRead(`${player}|${market}|${q.ln}`, r.sub, tally);
    },
    [legLive, rowLive],
  );
  /**
   * THE QUOTE A ROW MAY PRESENT — which is not always the quote that exists (fix pass, 2026-09-11).
   *
   * `rowSettled` refuses to re-anchor an Under, so on a SETTLED Under the verdict, the line it cites
   * and the numbers behind it are all taken at the line Josh holds. Presenting the live Under price,
   * the live line and the "at the live line" clause beside that verdict would claim the live line
   * decided a bet it did not decide, and would hang a live price on a ticket that is already lost.
   *
   * Every PRESENTATION site asks this. `rowSettled` itself still asks `rowLive`, which is exactly
   * what lets case B — an Over decided AT the live line — keep citing that live line.
   */
  const rowQuote = useCallback(
    (r: { gkey?: string | null; lkey?: string | null; sub?: string | null }): MlbLiveQuote | null => {
      const q = rowLive(r);
      if (!q) return null;
      return legSideOf(r.sub) === "U" && rowSettled(r) ? null : q;
    },
    [rowLive, rowSettled],
  );
  /** the live American price for the side THIS ROW is on, or null — the price-column half of the
      side fix; `null` means "there is no live price here", never "use the pregame one silently". */
  const liveAmOf = useCallback(
    (r: { gkey?: string | null; lkey?: string | null; sub?: string | null }) => {
      const q = rowQuote(r);
      return q ? mlbLiveView(q, legSideOf(r.sub)).am : null;
    },
    [rowQuote],
  );

  const columns: Column<PickRow>[] = useMemo(
    () => [
      {
        key: "pick",
        header: "Pick",
        sortValue: (r) => r.label,
        cell: (r) => {
          const n = legLive({ gkey: r.gkey, lkey: r.lkey });
          const q = rowQuote(r);
          return (
            <div className={r.susp || rowOut(r) ? "opacity-50" : undefined}>
              <div className="font-medium text-text">
                <BoardLabel label={r.label} />
                {rowOut(r) && <OutTag />}
                <CzInfo pickKey={`${r.label}|${r.sub}`} offered={!cz.isHidden(`${r.label}|${r.sub}`)} onToggle={cz.toggle} />
              </div>
              {/* THE ROW'S STATED BET, RE-ANCHORED (fix pass, 2026-09-11). `r.sub` is the pregame
                  sentence — "H+R+RBI O 0.5" — and on a re-anchored row it is the ONE cell still
                  describing the dead bet while the grade, the price, the EV and the True % have all
                  moved to the live line. Reading "O 0.5" beside "Tier B at the live line" is how a
                  person concludes the S grade was about 0.5 after all. The live line is appended,
                  never substituted, so the bet Josh locked is still legible. */}
              <div className="text-[11px] text-muted">
                {r.sub}
                {q && q.ln !== lineOf(r.lkey ?? "") ? (
                  <span className="text-live"> → {legSideOf(r.sub)} {q.ln} live</span>
                ) : null}
              </div>
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
                  {(() => {
                    const s0 = rowSettled(r);
                    /* the relation in plain language, and the SIDE it decided — "already over
                       0.5" reads as good news next to an Under bet that has in fact just lost.
                       INSTRUCTION 51: this asks rowSettled, so on a re-anchored row the sentence
                       cites the LIVE line — and a row whose live line the tally has NOT cleared
                       says nothing here at all, which is exactly the case Josh reported. */
                    return s0 ? (
                      <span className="text-gold">
                        {" · "}
                        {s0.why}
                        {q ? " — at the live line" : " — priced pregame"}
                      </span>
                    ) : null;
                  })()}
                </div>
              )}
              {q && <LivePriceLine view={mlbLiveView(q, legSideOf(r.sub))} pricedAt={livePricedAt(r.gkey)} />}
            </div>
          );
        },
      },
      {
        key: "grade",
        header: "Grade",
        /* grades the SAME EV the mode displays — czEv at Caesars, bsEv under dk_fd — EXCEPT on a
           leg the live boxscore has already decided (INSTRUCTION 50 item 2). A tally past the
           line means the Over is won and the Under lost, at any point in any game: the stored EV
           is then a PREGAME lock, not a live market, and dressing it as an S grade is the exact
           bug Josh reported. No grade is shown; gradeRank(null) = 0, so the row sinks. The row
           itself stays visible — nothing is hidden, nothing is deleted, no price is invented. */
        sortValue: (r) => {
          /* INSTRUCTION 51: a RE-ANCHORED row sorts on its LIVE grade — it is open, actionable and
             priced, so it belongs wherever that grade puts it. Case-B and case-C rows still sink
             at gradeRank(null), unchanged. */
          const q = rowQuote(r);
          const v = q ? mlbLiveView(q, legSideOf(r.sub)) : null;
          return rowSettled(r)
            ? gradeRank(null)
            : v
              ? gradeRank(v.pSrc === "sim" ? gradeFromEv(v.ev) : null)
              : gradeRank(gradeFromEv(basisMode ? (r.bsEv == null ? null : Number(r.bsEv)) : r.czEv == null ? null : Number(r.czEv)));
        },
        cell: (r) => {
          const s0 = rowSettled(r);
          const q = rowQuote(r);
          return s0 ? (
            <SettledGrade read={s0} />
          ) : q ? (
            <LiveGrade view={mlbLiveView(q, legSideOf(r.sub))} pricedAt={livePricedAt(r.gkey)} />
          ) : basisMode ? (
            <GradeChip grade={gradeFromEv(r.bsEv == null ? null : Number(r.bsEv))} basis="EV @ basis (DK/FD)" />
          ) : (
            <GradeChip grade={gradeFromEv(r.czEv == null ? null : Number(r.czEv))} basis="EV @ Caesars" />
          );
        },
      },
      {
        key: "prob",
        header: "True %",
        numeric: true,
        sortValue: (r) => Number(r.prob) || 0,
        /* on a decided leg this is no longer a "true %" of anything open — it is the model's
           PREGAME number, said so in words rather than drawn as a live probability bar */
        cell: (r) => {
          /* INSTRUCTION 51: on a re-anchored row the pregame % is not the true % of anything —
             3 H+R+RBI already banked against a live 3.5 is a different bet. The live number is
             the engine's own remaining-game sim where it has one, and the market's de-vigged fair
             where it does not — and a market fair is NEVER drawn as a ProbBar, because a bar
             reads as model edge over the market and a market fair has none by construction. */
          const q = rowQuote(r);
          return rowSettled(r) ? (
            <span className="num text-[11px] text-faint" title="The model's pregame probability — the leg is already decided, so this is history, not a live read">
              {(Number(r.prob) || 0).toFixed(1)}% pregame model
            </span>
          ) : q && q.pLive != null ? (
            <LiveProb pregamePct={Number(r.prob) || 0} view={mlbLiveView(q, legSideOf(r.sub))} />
          ) : (
            <ProbBar p={(Number(r.prob) || 0) / 100} className="w-28 justify-end md:w-36" />
          );
        },
      },
      ...(basisMode
        ? [
            // dk_fd: the "Best" (all-books) column is dropped on purpose — that
            // price is exactly what the basis mode forbids from steering anything
            {
              key: "basis",
              header: "Basis",
              numeric: true,
              sortValue: (r) => (rowQuote(r) ? -Infinity : Number(String(r.bsOdds ?? "").replace(/[^\d.-]/g, "")) || 0),
              /* A PREGAME PRICE MAY NOT SIT UNLABELLED BESIDE A LIVE ONE (fix pass, 2026-09-11).
                 The in-play pull asks Caesars only, so on a re-anchored row there IS no live DK/FD
                 basis — and the stored one prices a different line. It is withdrawn and said so. */
              cell: (r) =>
                rowQuote(r) ? (
                  <span className="text-[10px] text-faint" title="The in-play pull prices Caesars only — there is no live DK/FD basis, and the pregame one prices a different line">
                    no live DK/FD basis
                  </span>
                ) : r.bsOdds != null ? (
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
              sortValue: (r) => liveAmOf(r) ?? (Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0),
              cell: (r) => <CzPrice row={r} live={rowQuote(r)} />,
            } satisfies Column<PickRow>,
            {
              key: "bsEv",
              header: "EV @ basis",
              numeric: true,
              sortValue: (r) => (rowSettled(r) || r.bsEv == null ? -99 : Number(r.bsEv)),
              cell: (r) => {
                const q = rowQuote(r);
                return rowSettled(r) ? (
                  <SettledDash />
                ) : q ? (
                  /* the in-play pull asks for the six core markets at us regions only, so there is
                     no live DK/FD basis to price against — the honest substitute is the EV at the
                     live Caesars line, said in as many words rather than a pregame basis number */
                  <LiveEv view={mlbLiveView(q, legSideOf(r.sub))} basis="EV at the live Caesars line" note="the in-play pull prices Caesars, so there is no live DK/FD basis — this is the EV at the live Caesars line" />
                ) : r.bsEv != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <EvBadge ev={Number(r.bsEv)} />
                    {r.bsBadge ? (
                      <span className="rounded-full border border-pos/50 bg-pos/10 px-1.5 py-0.5 text-[9px] font-bold text-pos">EDGE</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                );
              },
            } satisfies Column<PickRow>,
            {
              key: "stake",
              header: "¼-Kelly",
              numeric: true,
              sortValue: (r) => (rowSettled(r) ? -99 : Number(r.bsKellyF) || 0),
              /* a stake chip on a decided leg is an INSTRUCTION TO BET on a settled market */
              cell: (r) => {
                const q = rowQuote(r);
                return rowSettled(r) ? (
                  <SettledDash />
                ) : q ? (
                  <LiveTag />
                ) : r.bsKellyF != null && Number(r.bsKellyF) > 0 ? (
                  <KellyChip stake={Number(r.bsKellyF) * bankroll} />
                ) : (
                  <span className="text-faint">—</span>
                );
              },
            } satisfies Column<PickRow>,
          ]
        : [
            {
              key: "best",
              header: "Best",
              numeric: true,
              sortValue: (r) => (rowQuote(r) ? -Infinity : Number(String(r.odds).replace(/[^\d.-]/g, "")) || 0),
              /* the all-books best is a PREGAME survey of a line the game has moved past; the
                 in-play pull buys Caesars only, so there is no live best to put here (fix pass) */
              cell: (r) =>
                rowQuote(r) ? (
                  <span className="text-[10px] text-faint" title="The in-play pull prices Caesars only — no all-books survey exists at the live line">
                    no live best
                  </span>
                ) : r.odds != null ? (
                  <OddsCell odds={r.odds as never} />
                ) : (
                  <span className="text-faint">—</span>
                ),
            } satisfies Column<PickRow>,
            {
              key: "cz",
              header: "Caesars",
              numeric: true,
              sortValue: (r) => liveAmOf(r) ?? (Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0),
              cell: (r) => <CzPrice row={r} live={rowQuote(r)} />,
            } satisfies Column<PickRow>,
            {
              key: "czEv",
              header: "EV @ CZR",
              numeric: true,
              sortValue: (r) => (rowSettled(r) ? -99 : Number(r.czEv) || 0),
              cell: (r) => {
                const q = rowQuote(r);
                return rowSettled(r) ? (
                  <SettledDash />
                ) : q ? (
                  <LiveEv view={mlbLiveView(q, legSideOf(r.sub))} basis="EV at the live Caesars line" />
                ) : r.czEv != null ? (
                  <EvBadge ev={Number(r.czEv)} />
                ) : (
                  <span className="text-faint">—</span>
                );
              },
            } satisfies Column<PickRow>,
            {
              key: "stake",
              header: "¼-Kelly",
              numeric: true,
              sortValue: (r) => (rowSettled(r) ? -99 : Number(r.czKellyF) || 0),
              /* a stake chip on a decided leg is an INSTRUCTION TO BET on a settled market */
              cell: (r) => {
                const q = rowQuote(r);
                /* NO ¼-KELLY ON A LIVE LINE, following the football desks exactly (CfbPicksBoard
                   :417 / src/lib/cfb/props.ts:287). A market-derived fair has zero edge over the
                   market by construction, and the pregame Kelly prices a DIFFERENT bet at a
                   DIFFERENT line — a stake chip there is an instruction to bet a phantom. */
                return rowSettled(r) ? (
                  <SettledDash />
                ) : q ? (
                  <LiveTag />
                ) : r.czKellyF != null && Number(r.czKellyF) > 0 ? (
                  <KellyChip stake={Number(r.czKellyF) * bankroll} />
                ) : (
                  <span className="text-faint">—</span>
                );
              },
            } satisfies Column<PickRow>,
          ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bankroll, basisMode, legLive, rowSettled, rowQuote, liveAmOf, livePricedAt, cz.hidden, rowOut],
  );

  /* INSTRUCTION 29 (2026-09-04, Josh: "I should be able to sort each tab on the 'Board'
     like H+R+RBI, Hits, etc by clicking on the title of the column ie: 'Tier' or 'Edge
     Status'"): the stamped-picks table is now the same sortable DataTable the ML/RL tabs
     use — every column carries a sortValue, so every header is clickable (▲/▼). */
  const pickOut = useCallback((p: ApiPick) => isOut(p.player, p.market ?? cat, p.gkey), [isOut, cat]);
  /* INSTRUCTION 50 item 2, the stamped-picks and ALL-scope tables. `side` is the row's sub string
     on a stamped pick ("H+R+RBI O 0.5") and "o" on an ALL-scope row — legSettled reads the side the
     byte-identical way the grader does (/ U /), so both shapes are read correctly. */
  /* INSTRUCTION 51 WAS NEVER WIRED INTO THIS TABLE (fix pass, 2026-09-11) — the defect Josh would
     have hit first. `pickRows` is non-null on EVERY prop tab with LIVE off (propRows) and on every
     ALL-scope view (allRows), and the render branches to the stamped-picks DataTable whenever it is
     non-empty. So on the H+R+RBI tab — the exact tab his complaint came from — not one of the live
     components below was reachable: the table asked `settledRead` at the STORED line only, and a
     row whose live line had moved past the tally printed the pregame grade with no live price
     anywhere on it. Every live read the main table performs is performed here now, side-aware, off
     the same `rowLive`, so the two tables cannot disagree about what the book is posting. */
  const pickLive = useCallback(
    (p: ApiPick) => rowLive({ gkey: p.gkey, lkey: p.lkey }),
    [rowLive],
  );
  const pickSettled = useCallback(
    (p: ApiPick): LegSettledRead | null => {
      const q = pickLive(p);
      const tally = legLive({ gkey: p.gkey, lkey: p.lkey })?.val;
      /* the Over-only swap, for the same reason as `rowSettled`: an Under past its stored line has
         LOST and a higher live line does not un-decide it */
      if (!q || legSideOf(p.side) === "U") return settledRead(p.lkey, p.side, tally);
      const [player, market] = String(p.lkey ?? "").split("|");
      return settledRead(`${player}|${market}|${q.ln}`, p.side, tally);
    },
    [legLive, pickLive],
  );
  /** the stamped table's half of the rule above — the same gate, asked of the same two functions */
  const pickQuote = useCallback(
    (p: ApiPick): MlbLiveQuote | null => {
      const q = pickLive(p);
      if (!q) return null;
      return legSideOf(p.side) === "U" && pickSettled(p) ? null : q;
    },
    [pickLive, pickSettled],
  );
  const pickKey = useCallback((p: ApiPick) => `${p.market ?? cat}|${p.player}|${p.line}|${p.side}`, [cat]);
  const pickColumns: Column<ApiPick>[] = useMemo(() => {
    const now = Date.now();
    const statusRank: Record<string, number> = { won: 0, live: 1, upcoming: 2, lost: 3, void: 4, ungradable: 5 };
    return [
      { key: "rank", header: "#", numeric: true, sortValue: (p) => p.rank, cell: (p) => <span className="text-faint">{p.rank}</span> },
      {
        key: "grade",
        header: "Grade",
        sortValue: (p) => {
          const q = pickQuote(p);
          const v = q ? mlbLiveView(q, legSideOf(p.side)) : null;
          return pickSettled(p)
            ? gradeRank(null)
            : v
              ? gradeRank(v.pSrc === "sim" ? gradeFromEv(v.ev) : null)
              : gradeRank(gradeFromEv(p.edge == null ? null : Number(p.edge)));
        },
        cell: (p) => {
          const s0 = pickSettled(p);
          const q = pickQuote(p);
          return s0 ? (
            <SettledGrade read={s0} />
          ) : q ? (
            <LiveGrade view={mlbLiveView(q, legSideOf(p.side))} pricedAt={livePricedAt(p.gkey)} />
          ) : (
            <GradeChip grade={gradeFromEv(p.edge == null ? null : Number(p.edge))} basis="model − implied edge (pts)" />
          );
        },
      },
      {
        key: "pick",
        header: "Pick",
        sortValue: (p) => p.player ?? "",
        cell: (p) => {
          const pk = pickKey(p);
          const mk = p.market && cat === "all" ? `${MARKET_SHORT[p.market] ?? p.market} ` : "";
          const q = pickQuote(p);
          const side = legSideOf(p.side);
          return (
            <div className={pickOut(p) ? "opacity-50" : undefined}>
              {p.player ? <PlayerName name={parseBoardLabel(p.player)?.name ?? p.player} team={parseBoardLabel(p.player)?.team ?? null} /> : null}{" "}
              <span className="text-muted">
                {mk}{p.side === "o" ? `over ${p.line ?? ""}` : p.side === "u" ? `under ${p.line ?? ""}` : p.side ?? ""}
              </span>
              <CzInfo pickKey={pk} offered={!cz.isHidden(pk)} onToggle={cz.toggle} />
              {pickOut(p) && <OutTag />}
              {p.susp && <span className="ml-1 text-[10px] text-gold">SUSPENDED — shown always, never on a ticket</span>}
              {q && q.ln !== p.line ? <span className="ml-1 text-[10px] font-bold text-live">→ {side} {q.ln} live</span> : null}
              {q && <LivePriceLine view={mlbLiveView(q, side)} pricedAt={livePricedAt(p.gkey)} />}
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
        sortValue: (p) => (pickQuote(p) ? -Infinity : Number(p.edge ?? -Infinity)),
        /* model − implied, both measured at the PREGAME line. On a re-anchored row that is a number
           about a bet nobody can place any more, so it is labelled rather than left to be read as
           the live edge (fix pass, 2026-09-11). */
        cell: (p) =>
          p.edge == null ? (
            "—"
          ) : pickQuote(p) ? (
            <span className="num text-[11px] text-faint" title="The pregame model − implied edge; the book has since moved the line, so this is history">
              {`${Number(p.edge) > 0 ? "+" : ""}${Number(p.edge).toFixed(1)} pregame`}
            </span>
          ) : (
            `${Number(p.edge) > 0 ? "+" : ""}${Number(p.edge).toFixed(1)}`
          ),
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
  }, [cat, cz.hidden, pickOut, pickKey, pickSettled, pickQuote, livePricedAt]);
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

  /* INSTRUCTION 50 item 2 (the header half): how many games are already under way on a board that
     was priced BEFORE first pitch. Those rows carry the pregame lock, not a live market — the
     header says so out loud instead of letting a live tally sit beside a stale price unexplained. */
  const pregameLive = useMemo(() => {
    if (!d?.gameInfo || !board) return 0;
    /* IN PROGRESS, not "the clock has passed first pitch" (INSTRUCTION 50 fix pass). gameInfo
       carries no state at all, so a pure clock test counted every FINISHED game too — after
       the slate ended the header read "15 games under way", which is false. useLiveNow already
       tracks live/final per game on its 60s poll, so the honest answer was in scope; reading it
       here also makes the badge tick up as games actually start, which the old `Date.now()`
       inside a [d, board] memo never did (it froze at page load). */
    return Object.values(d.gameInfo).filter((g) => {
      const st = g.start ? Date.parse(g.start) : NaN;
      return g.pk != null && liveNow.games[g.pk]?.live && Number.isFinite(st) && board.at <= st;
    }).length;
  }, [d, board, liveNow]);

  /* INSTRUCTION 51 — the header half. `pregameLive` counts the games under way; this counts how
     many of THOSE carry a live line on this very render, using the same three tests rowLive
     applies (a quote exists, the game is live, the quote is inside quoteMaxAgeSec). A board that
     is part live and part pregame must never read as uniformly one or the other. */
  const liveQuoteGames = useMemo(() => {
    const rows = liveOverlay?.rows;
    if (!rows || !d?.gameInfo) return 0;
    const now = Date.now();
    const seen = new Set<string>();
    for (const [key, q] of Object.entries(rows)) {
      const gkey = key.split("|")[0];
      const pk = d.gameInfo[gkey]?.pk ?? null;
      if (pk == null || !liveNow.games[pk]?.live) continue;
      if (now - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) continue;
      seen.add(gkey);
    }
    return seen.size;
  }, [liveOverlay, d, liveNow]);
  /**
   * "priced live 4:52p" — THE OLDEST stamp among the games actually carrying a rendered live line.
   *
   * It was `Math.max` over every key in `pricedAt` (fix pass, 2026-09-11), which is the most
   * flattering number available twice over: the newest stamp speaks for games priced long before
   * it, and the set included games that are finished or whose quotes the render-time cap has
   * already dropped. One headline number covering several games has to be the WORST of them, or it
   * is an advertisement rather than a measurement.
   */
  const livePricedLabel = useMemo(() => {
    const rows = liveOverlay?.rows;
    if (!rows || !d?.gameInfo) return null;
    const now = Date.now();
    const stamps: number[] = [];
    for (const [key, q] of Object.entries(rows)) {
      const gkey = key.split("|")[0];
      const pk = d.gameInfo[gkey]?.pk ?? null;
      if (pk == null || !liveNow.games[pk]?.live) continue;
      if (now - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) continue;
      const t = Date.parse(liveOverlay?.pricedAt?.[gkey] ?? q.at);
      if (Number.isFinite(t)) stamps.push(t);
    }
    return stamps.length ? mlbLiveClockLabel(new Date(Math.min(...stamps)).toISOString()) : null;
  }, [liveOverlay, d, liveNow]);
  /* EVERY GAME UNDER WAY, not only the ones priced before first pitch (2026-09-12).
     `pregameLive` asks `board.at <= start`, which is the right question for "is this row's price
     older than the game". It is the WRONG question for "should the Board explain itself": a board
     re-priced at 7pm has `board.at` after every start, so `pregameLive` collapses to 0 and the
     explanation below used to vanish at exactly the moment Josh is staring at in-play rows. This
     count is every game the live poll says is in progress, whatever the board's age. */
  const liveGameKeys = useMemo(() => {
    if (!d?.gameInfo) return [] as string[];
    return Object.entries(d.gameInfo)
      .filter(([, g]) => g.pk != null && liveNow.games[g.pk]?.live)
      .map(([gkey]) => gkey);
  }, [d, liveNow]);
  const liveGap = useMemo(
    () => mlbLiveGap({ liveGameKeys, rows: liveOverlay?.rows ?? null }),
    [liveGameKeys, liveOverlay],
  );
  /* WHY A ROW SHOWS NO LIVE PRICE, IN WORDS (2026-09-12 — the fourth defect).
     `rowLive` refuses a quote for three reasons and renders nothing for all three, so a missing
     sync phrase, a game the pull never reached and a price that has gone stale past
     `quoteMaxAgeSec` all look identical from the outside: "it isn't updating with live odds". Each
     has a different answer and two are things Josh can act on, so the Board names which one it is.
     Nothing here polls and nothing re-buys a stale price — naming it is the honest alternative.
     The `!liveOverlay && pregameLive > 0` case is skipped because the paragraph below already
     says it in its own words; this sentence covers everything that gate misses. */
  const liveReasonNote = useMemo(
    () =>
      !liveOverlay && pregameLive > 0
        ? null
        : mlbLiveGapNote(liveGap, { syncReady: liveSyncReady, overlay: !!liveOverlay, error: liveError }),
    [liveGap, liveSyncReady, liveOverlay, liveError, pregameLive],
  );
  /* THE SPEND IS SHOWN, NEVER HIDDEN — the same discipline as the browser re-price counter below.
     Josh authorised this spend; he gets to watch it. `spentToday` is null only when no store is
     configured, and in that case the route refuses to fetch at all, so there is nothing to report. */
  const liveSpendNote =
    liveOverlay && liveOverlay.spentToday != null
      ? ` · ${liveOverlay.spentToday}/${MLB_LIVE_CLIENT.dailyBudget} live-odds credits`
      : "";
  /* With no overlay this is byte-identical to INSTRUCTION 50's clause. With one it names how many
     of the games under way carry a live line, when those lines were taken, and what today's live
     pull has cost so far. */
  const underWayNote =
    pregameLive === 0
      ? ""
      : liveQuoteGames > 0
        ? ` · ${pregameLive} game${pregameLive === 1 ? "" : "s"} under way · ${liveQuoteGames} priced live${livePricedLabel ? ` ${livePricedLabel}` : ""} · ${pregameLive - liveQuoteGames} priced pregame${liveSpendNote}`
        : ` · ${pregameLive} game${pregameLive === 1 ? "" : "s"} under way — priced pregame`;

  /* INSTRUCTION 50 item 1: EVERY tap prints a line. A plain success used to print nothing at all —
     which is precisely what "the refresh button doesn't work" looks like from the outside. The
     spend is shown too: generatesToday() × GEN_CREDITS_EST. That counter exists to make the spend
     VISIBLE, never to block it (src/lib/engine-client.ts) — there is deliberately no cooldown here,
     because nothing in this app may stop a bet. */
  const spendNote = (() => {
    const n = generatesToday();
    /* BOTH HALVES OF THE BILL (review round, 2026-09-12). The server's board-only pass costs the
       same full generate as the browser one, and showing only the browser count made the more
       expensive half invisible — a night could read "1 browser re-price today" with six server
       generates bought behind it. Both are counted for visibility only; neither blocks a tap. */
    const s = serverRepricesToday();
    const browser = n > 0 ? ` · ${n} browser re-price${n === 1 ? "" : "s"} today ≈ ${n * GEN_CREDITS_EST} Odds credits (counted, never blocked)` : "";
    const server = s > 0 ? ` · ${s} server board re-price${s === 1 ? "" : "s"} today ≈ ${s * GEN_CREDITS_EST} Odds credits (counted, never blocked)` : "";
    return `${browser}${server}`;
  })();
  /* WHAT THE SERVER'S BOARD-ONLY PASS DID, in plain English, appended to whatever the refill said
     (2026-09-12). A refused refill resolves rather than throwing, so `refill.data` is set on exactly
     the taps that go on to the board-only pass — reporting the refusal and saying nothing about what
     was done instead is how a refresh ends up looking like it did nothing. "ran recently" is the
     45-minute limiter, which is a real answer and not a failure: it is named as pacing. */
  const liveBoardNote = liveBoard.isPending
    ? " · the server is re-pricing the board and the games in play…"
    : liveBoard.isSuccess
      ? " · board and live odds re-priced on the server — your locked card was not touched"
      : liveBoard.isError
        ? /ran recently/.test(liveBoard.error.message)
          ? /* PACING, AND NO LONGER A DEAD END (review round, 2026-09-12). This used to end "so
               there was nothing new to buy", which became untrue the moment the limiter started
               falling through to the device re-price: something WAS bought, just in this tab. It
               now says only what the server did, and the "board re-priced on this device" clause
               that follows says what the tap actually produced. */
            " · the server buys a stored re-price at most once every 45 minutes and it ran recently, so it did not buy again"
          : ` · the server did not re-price the live board: ${liveBoard.error.message}`
        : "";
  const refreshNote =
    refill.isPending || regen.isPending || liveBoard.isPending
      ? liveBoard.isPending
        ? "refreshing — the server is re-pricing the board and the games in play (your locked card is not touched)…"
        : "refreshing — asking the server for a refill, then re-pricing the board on this device…"
      : refill.error
        ? /* THE FALLBACK'S ACTUAL OUTCOME, NOT AN ASSERTION (INSTRUCTION 50 fix pass). This
             branch used to say "re-priced in the browser instead" unconditionally — but the
             offline case trips exactly here: the refill fetch throws, onError fires
             regen.mutate(), that fails too, and Josh was told the board had been re-priced on
             his device when nothing was. A refresh may never report an action it did not take. */
          regen.isError
          ? `refill failed: ${refill.error.message}, and the browser re-price also failed: ${regen.error?.message ?? "the odds feed didn't answer"} — nothing was re-priced and nothing was fabricated${spendNote}`
          : regen.isSuccess
            ? `refill failed: ${refill.error.message} — re-priced in the browser instead${spendNote}`
            : `refill failed: ${refill.error.message} — re-pricing in the browser…`
        : regen.isError
          ? `re-price failed: ${regen.error?.message ?? "the odds feed didn't answer"} — nothing was fabricated${spendNote}`
          : refill.data
            ? `${refillReason(refill.data.body) ?? (refill.data.body.fired === true ? "refilled — the server ran its own pass" : "the server had nothing to add")}${liveBoardNote}${
                regen.isSuccess ? " · board re-priced on this device" : ""
              }${spendNote}`
            : liveBoard.isSuccess
              ? `board and live odds re-priced on the server — your locked card was not touched${spendNote}`
              : liveBoard.isError
                ? `the server did not re-price the live board: ${liveBoard.error.message}${regen.isSuccess ? " · board re-priced on this device instead" : ""}${spendNote}`
                : regen.isSuccess
                  ? `board re-priced on this device${spendNote}`
                  : null;

  /* CFB desk (2026-09-05): the global SportSwitch routes the page to the College Football
     board. Every hook above has already run, so this early return is hooks-safe. */
  if (CFB_ENABLED && desk === "cfb") {
    return (
      <>
        <PageHeader
          title="Board"
          eyebrow="College Football"
          chip={<CfbChip />}
          sub="Every playable side and player prop on the slate ranked on its EV at Caesars, and the desk's parlay sets — safer, longshots, mixed and live. The games list is on Games."
          action={<CfbRefreshPill />}
        />
        <CfbPicksBoard />
      </>
    );
  }

  /* NFL desk (2026-09-08): the same shared football board on the NFL desk handles — its own slate, ledger and bank. */
  if (NFL_ENABLED && desk === "nfl") {
    return (
      <>
        <PageHeader
          title="Board"
          eyebrow="National Football League"
          chip={<NflChip />}
          sub="Every playable side and player prop on the NFL slate ranked on its EV at Caesars, and the desk's parlay sets — safer, longshots, mixed and live. The games list is on Games."
          action={<NflRefreshPill />}
        />
        <NflPicksBoard />
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
              ? `${gameCount} games · ${pickCount} live board rows · prop tabs show the day's stamped picks · TOP 50 ${MODE_LABEL[selMode]} · ${basisMode ? "priced at the DK/FD basis (Builder's selection price) · Caesars settles" : "consensus is multi-book, prices are Caesars"} · ${SIM_PATHS_TXT}-path sims · updated ${new Date(board!.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${underWayNote}`
              : basisMode
                ? "Consensus de-vigged probability · EV at the DK/FD basis, settled at Caesars"
                : "Consensus de-vigged probability vs the Caesars line"
        }
        action={
          sport === "mlb" ? (
            /* INSTRUCTION 49: with a board up and the sync phrase stored, Refresh runs the server's
               refill pass (the same one the five slots run); otherwise the pre-49 browser generate */
            <Pill
              variant="primary"
              onClick={() => {
                if (!(d && getSyncKey())) {
                  regen.mutate();
                  return;
                }
                refill.mutate("mlb", {
                  /* INSTRUCTION 50 item 1 (2026-09-11). The 49 fix only fell back to a browser
                     re-price when the server refused with ONE of two reasons — and the refill
                     pass is slot-gated and attempt-capped, so most taps were refused free under
                     one of the other seven reasons and NOTHING re-priced. Worse, refillDesk
                     resolves 401 / 502 / 503 as a mutation SUCCESS carrying no `fired` field at
                     all, so a failing server also did nothing. A tap must never resolve with
                     nothing re-priced: fall back on ANY refusal, ANY non-2xx, and on a throw. */
                  onSuccess: (r) => {
                    const refused = r.body.fired === false;
                    const httpFail = r.status < 200 || r.status > 299;
                    /* 2026-09-12: WITH A GAME UNDER WAY THE SERVER GOES FIRST. A browser re-price
                       builds a board in this tab and never stores it, so the STORED board — the one
                       every other device, the stamped picks and tomorrow's grading read — stayed
                       frozen at its pre-kick state on exactly the slate Josh is watching. The
                       board-only pass stores it and cannot touch the locked card. Pregame, the line
                       below is reached unchanged.

                       GATED ON `liveGap.live`, NOT `pregameLive` (review round, 2026-09-12).
                       `pregameLive` additionally requires `board.at <= start` — "is this row's price
                       older than its game" — which is a different question and one this very pass
                       destroys: the board it stores is newer than every first pitch, so the second
                       tap of the evening would have found `pregameLive === 0` and silently gone back
                       to the browser-only path for the rest of the night. On an all-early slate it
                       would never have fired at all. `liveGap.live` is the count the live poll
                       actually reports as in progress, whatever the board's age. */
                    if (liveGap.live > 0 && (refused || httpFail)) {
                      liveBoard.mutate();
                      return;
                    }
                    if (refused || httpFail) regen.mutate();
                  },
                  onError: () => regen.mutate(),
                });
              }}
              disabled={regen.isPending || refill.isPending || isPending}
            >
              {regen.isPending || refill.isPending ? "Scanning slate…" : d ? "Refresh MLB" : "Generate board"}
            </Pill>
          ) : undefined
        }
      />

      {sport === "mlb" && refreshNote && (
        <p className="mb-3 text-xs text-muted" data-testid="mlb-refill-note">
          {refreshNote}
        </p>
      )}

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
      {/* INSTRUCTION 46: engine notes — collapsed by default, one preview line, tap to open */}
      {typeof d?.overview === "string" && d.overview && (
        <Reveal>
          <div
            data-testid="board-overview"
            data-open={overviewOpen ? "1" : "0"}
            className="mb-4 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-1 text-[12.5px] leading-relaxed text-muted"
          >
            <button
              type="button"
              aria-expanded={overviewOpen}
              aria-controls={overviewOpen ? "board-overview-text" : undefined}
              onClick={toggleOverview}
              className="flex min-h-[44px] w-full items-center gap-2.5 text-left"
            >
              <span
                className={`inline-block shrink-0 text-[10px] text-faint transition-transform duration-(--dur-fast) ${overviewOpen ? "rotate-90" : ""}`}
                aria-hidden
              >
                ▶
              </span>
              <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Engine notes</span>
              {!overviewOpen && <span className="min-w-0 flex-1 truncate text-faint">{d.overview}</span>}
              <span className="ml-auto shrink-0 text-[10.5px] text-faint">{overviewOpen ? "Hide" : "Show"}</span>
            </button>
            {overviewOpen && (
              <div id="board-overview-text" className="pb-2 pt-1">
                {d.overview}
              </div>
            )}
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
              {cat === "all" ? "Every market" : CAT_LABELS[cat]} · {allRows.length} line{allRows.length === 1 ? "" : "s"} Caesars posts on today&apos;s board, graded S → F on model − fair
              {allNoCz > 0 ? ` · ${allNoCz} line${allNoCz === 1 ? "" : "s"} only other books post hidden` : ""}
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
            /* a settled row never glows green: the glow is "this is a live edge" (INSTRUCTION 50) */
            /* ...and neither does a re-anchored one: ev-glow signals a MODEL edge, and a live
               row is graded against the market's own posted price (INSTRUCTION 51) */
            rowClassName={(r) => (r.susp || rowSettled(r) ? "" : rowQuote(r) ? "" : Number(basisMode ? r.bsEv : r.czEv) > 0 ? "ev-glow" : "")}
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

      {/* INSTRUCTION 51 — the MLB twin of CfbProps' props footnote. Every clause is a count off the
          overlay the server returned; none of it is estimated, and the budget is stated out loud. */}
      {!liveOverlay && pregameLive > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-faint" data-testid="mlb-live-unavailable">
          {!liveSyncReady
            ? "live in-play prices need your sync phrase — enter it in Settings and the Board will re-price the games under way (the pull is budgeted server-side; nothing is fabricated without it)"
            : liveError
              ? `live in-play prices are unavailable — the server route answered "${liveError}". The rows below carry their pregame lock, graded as such.`
              : "live in-play prices have not loaded yet — the rows below carry their pregame lock"}
        </p>
      )}

      {/* FIX 4 — the Board says WHICH of the three refusals it is in, instead of rendering nothing. */}
      {liveReasonNote && (
        <p className="mt-2 text-[10px] leading-snug text-faint" data-testid="mlb-live-reason">
          {liveReasonNote}
        </p>
      )}

      {liveOverlay && (
        <p className="mt-2 text-[10px] leading-snug text-faint" data-testid="mlb-live-footnote">
          live lines priced {livePricedLabel ?? "—"} · {liveQuoteGames} of {liveOverlay.live} in-play game
          {liveOverlay.live === 1 ? "" : "s"}
          {liveOverlay.noLive ? ` · ${liveOverlay.noLive} game${liveOverlay.noLive === 1 ? "" : "s"} post no in-play market` : ""}
          {liveOverlay.unmatched ? ` · ${liveOverlay.unmatched} game${liveOverlay.unmatched === 1 ? "" : "s"} could not be matched to an odds event` : ""}
          {/* THE CAP IS A STANDING RULE, NOT THIS PASS'S COUNT (fix pass, 2026-09-11): `fetched` is
              how many games this pull happened to buy, which on the probe reads "capped at 3". */}
          {liveOverlay.capped ? ` · capped at ${MLB_LIVE_CLIENT.liveMaxEvents} games per pull` : ""}
          {liveOverlay.stale ? " · showing stored quotes — the current window was not re-pulled" : ""}
          {liveOverlay.oddsMissing ? " · the odds feed did not answer — nothing was fabricated" : ""}
          {` · today's live-odds budget is ${MLB_LIVE_CLIENT.dailyBudget} credits`}
          {liveOverlay.spentToday != null ? ` · ${liveOverlay.spentToday} spent today` : ""}
          {liveOverlay.note ? ` · ${liveOverlay.note}` : ""}
          {" · prices are posted quotes, never invented"}
        </p>
      )}
        </>
      )}
    </>
  );
}

/**
 * INSTRUCTION 50 (2026-09-11), Josh's item 2, verbatim: "It's not updating with live odds; it will
 * show the player is top 4th w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI when
 * their live over/under is 3.5 H+R+RBI".
 *
 * The grade cell for a leg the official boxscore has ALREADY decided. All six MLB prop markets are
 * monotone counting stats, so a tally past the line settles the Over won / the Under lost with
 * certainty. What it does NOT tell us is the live price — that needs an in-play re-pull Josh has
 * not authorised — so this cell shows no number it did not read: an em dash, the SETTLED tag, and
 * the plain-language reason. The row stays on the board; only the manufactured grade is gone.
 */
function SettledGrade({ read }: { read: LegSettledRead }) {
  /* `why` is the module's own sentence, and it names the SIDE — "this Under is decided lost"
     next to an under bet, "this Over is decided won" next to an over. The first cut of this
     cell said "already over 0.5" from the line alone, which reads as good news beside a leg
     that has in fact just lost (INSTRUCTION 50 fix pass). */
  const txt = `${read.why} — the price shown is the pregame lock, not a live market`;
  const tone = read.side === "U" ? "text-neg" : "text-pos";
  return (
    <span className="inline-flex flex-col items-start gap-0.5" title={txt}>
      <span className="inline-flex items-center gap-1.5">
        <span className="num text-faint">—</span>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">
          SETTLED
        </span>
      </span>
      <span className={`text-[9.5px] leading-tight ${tone}`}>{txt}</span>
    </span>
  );
}

/**
 * The placeholder every OTHER number on a settled row collapses to — EV, the EDGE badge and
 * the ¼-Kelly stake. Each of those was computed pregame against a market that is now closed;
 * printing them beside a SETTLED grade would restate the exact claim the grade just withdrew.
 */
function SettledDash() {
  return (
    <span className="text-faint" title="This leg is already decided by the live boxscore — the stored EV and stake were computed pregame and no longer describe anything you can bet">
      —
    </span>
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

/**
 * INSTRUCTION 51 (2026-09-11), Josh's order verbatim: "Authorize the live in-play odds pull for MLB".
 *
 * THE BINDING PLACEMENT RULE: every live component below is defined AFTER `OutTag`, never between
 * `SettledGrade` and it. tests/board-settled.test.ts slices the source from `function SettledGrade`
 * to `function OutTag` and asserts that slice carries no hand-typed American price — the guard that
 * the SETTLED cell invents nothing. A live cell dropped into that gap would be swept into the slice
 * and red-line a pin that is doing its job. New live components go here.
 *
 * These cells DO print prices, and every digit of every one of them comes off the quote object the
 * server bought from the book. There is not one hand-typed number anywhere below.
 */

/** the pulsing in-play marker, one shape for every live cell on the row */
function LiveDot() {
  return <span className="pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-live" aria-hidden />;
}

/**
 * The line the book is posting RIGHT NOW, under the gold live-tally chip in the Pick cell. This is
 * the sentence Josh asked for: not "an S grade for over 0.5" beside a player who already has 3, but
 * "over 3.5 at -145, pulled at 4:52p". Freshness is per GAME (the overlay's own `pricedAt[gkey]`),
 * never board-level — one game turning due may not make another game's price look older than it is.
 */
function LivePriceLine({ view, pricedAt }: { view: MlbLiveView; pricedAt: string | null }) {
  /* AGE IS THIS QUOTE'S OWN AGE (fix pass, 2026-09-11). It read `pricedAt ?? quote.at` — the
     GAME's last-asked stamp — while the hard render-time drop tests `quote.at`. A quote carried
     across a pull that failed for this event therefore printed "just now" under a fresh game stamp
     while being up to 30 minutes old, which is the one thing the cap exists to prevent. The game
     stamp is still shown, in the tooltip, as what it actually is. */
  const age = mlbLiveAgeLabel(view.at);
  const asked = pricedAt ? mlbLiveAgeLabel(pricedAt) : null;
  return (
    <div
      className="num mt-0.5 flex items-center gap-1 text-[10px] font-bold tabular-nums text-live"
      data-testid="mlb-live-price"
      title={`Priced in play at Caesars, this quote taken ${age} — ${view.books} book${view.books === 1 ? "" : "s"} quoting this line${asked ? `; the game was last asked ${asked}` : ""}. A posted quote, never invented.`}
    >
      <LiveDot />
      <span>
        ↻ live {view.side} {view.ln}
        {view.am != null ? ` · ${fmtAmerican(view.am)} CZR` : " · no Caesars price at this line"}
        {` · ${age}`}
      </span>
    </div>
  );
}

/**
 * The grade on a RE-ANCHORED row — a real letter, off a real EV, against the price the book is
 * posting now. The pulsing LIVE pill sits where SETTLED sits, so no column widens and the two
 * states are never mistakable for each other. No ¼-Kelly stake rides along with it: see LiveTag.
 */
function LiveGrade({ view, pricedAt }: { view: MlbLiveView; pricedAt: string | null }) {
  const age = mlbLiveAgeLabel(view.at);
  const asked = pricedAt ? mlbLiveAgeLabel(pricedAt) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* A LETTER GRADE IS MODEL VOCABULARY (fix pass, 2026-09-11). `GradeChip` is the same S–F
          ladder the model's own edge is graded on, and on a `pSrc: "market"` row the number behind
          it is the de-vigged price ITSELF — an edge of zero by construction, rounded into whatever
          letter the vig noise lands on. Until the sim socket is wired (`legPOf` is never supplied,
          so this is 100% of production rows) a market-derived fair gets the figure and the words,
          and no letter: a grade nobody computed is worse than no grade. */}
      {view.pSrc === "sim" ? (
        <GradeChip grade={gradeFromEv(view.ev)} basis={`EV at the live Caesars line (${view.side} ${view.ln}), this quote taken ${age}`} />
      ) : (
        <span
          className="num text-[11px] text-muted"
          data-testid="mlb-live-market-grade"
          title={`The de-vigged consensus at the live ${view.side} ${view.ln} — the market's own price, not a model read. No letter grade is shown because none was computed: a market fair has no edge over the market it came from.`}
        >
          {view.ev == null ? "—" : `${view.ev > 0 ? "+" : ""}${view.ev.toFixed(1)}% vs market`}
        </span>
      )}
      <span
        className="inline-flex items-center gap-1 rounded-full border border-live/50 bg-live/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-live"
        data-testid="mlb-live-pill"
        title={`Priced in play at Caesars, this quote taken ${age}${asked ? `; the game was last asked ${asked}` : ""} — no ¼-Kelly stake on a live line.`}
      >
        <LiveDot /> LIVE
      </span>
    </span>
  );
}

/**
 * The True % cell on a re-anchored row. Two sources, two very different readings, and the
 * difference is never blurred (INSTRUCTION 51 §5's probability ladder):
 *   • "sim"    — the engine's own remaining-game probability, resumed from the real live state.
 *                Shown as pregame → live, because watching that number move IS the information.
 *   • "market" — the de-vigged live pair. A market fair is NOT a model number and is never dressed
 *                as one: muted text, the words "market fair", and never a ProbBar, because a bar
 *                reads as edge over the market and a market fair has none by construction.
 * The pregame number is never re-used against the live price — that is how you print a confidently
 * wrong EV, which is strictly worse than the dash it would replace.
 */
function LiveProb({ pregamePct, view }: { pregamePct: number; view: MlbLiveView }) {
  if (view.p == null) return <span className="text-faint">—</span>;
  /* the probability of THIS ROW'S SIDE: `1 - pLive` on an Under, because the overlay's `pLive` is
     always P(over) — the lkey it is keyed by carries no side at all (fix pass, 2026-09-11) */
  const livePct = view.p * 100;
  return view.pSrc === "sim" ? (
    <span
      className="num text-[11px] text-text"
      data-testid="mlb-live-prob"
      title="The engine's own sim, resumed from the real live game state — what is left of this bet, not what it was worth before first pitch"
    >
      {pregamePct.toFixed(1)}% <span className="text-faint">→</span>{" "}
      <span className="font-semibold text-live">{livePct.toFixed(1)}% live</span>
    </span>
  ) : (
    <span
      className="num text-[11px] text-muted"
      data-testid="mlb-live-prob"
      title="The de-vigged consensus at the live line — the market's own number, not the model's. No edge is claimed over a price it was derived from."
    >
      {livePct.toFixed(1)}% market fair
    </span>
  );
}

/** EV against the price the book is posting now — a real number, computed by the route off a real quote. */
function LiveEv({ view, basis, note }: { view: MlbLiveView; basis: string; note?: string }) {
  if (view.ev == null) return <span className="text-faint">—</span>;
  /* SAME RULE AS THE GRADE CHIP: `EvBadge` is the green/red model-edge badge the pregame board
     uses, and a `pSrc: "market"` EV is the de-vigged price against itself — zero edge, dressed as
     an edge. The number is still shown, because it IS the EV at the live price and Josh asked for
     the live price; it is shown as a figure with its source named, not as a badge (fix pass). */
  return view.pSrc === "sim" ? (
    <span className="inline-flex items-center gap-1.5" data-testid="mlb-live-ev" title={`${basis}${note ? ` — ${note}` : ""}`}>
      <EvBadge ev={view.ev} />
      <span className="text-[9px] font-bold uppercase tracking-wide text-live">live</span>
    </span>
  ) : (
    <span
      className="num inline-flex items-center gap-1.5 text-[11px] text-muted"
      data-testid="mlb-live-ev"
      title={`${basis}${note ? ` — ${note}` : ""} — derived from the market's own de-vigged price, so it claims no edge over that price`}
    >
      {`${view.ev > 0 ? "+" : ""}${view.ev.toFixed(1)}% vs market`}
      <span className="text-[9px] font-bold uppercase tracking-wide text-live">live</span>
    </span>
  );
}

/**
 * The Caesars price column on a row that may or may not be re-anchored (fix pass, 2026-09-11).
 *
 * It was `<OddsCell odds={r.czOdds} book="caesars" />` unconditionally, so the pregame price sat
 * unlabelled in the settlement column of a row whose grade, EV, True % and stated line had all
 * moved to the live number. A price column is the last place an unlabelled stale figure belongs.
 * With a live quote it prints the live American for THIS ROW'S SIDE; with a live quote the book
 * posts no price for, it says so rather than falling back.
 */
function CzPrice({ row, live }: { row: { czOdds?: unknown; sub?: string | null }; live: MlbLiveQuote | null }) {
  if (!live) return <OddsCell odds={row.czOdds as never} book="caesars" />;
  const v = mlbLiveView(live, legSideOf(row.sub));
  return v.am == null ? (
    <span className="text-[10px] text-faint" title="Caesars posts no in-play price on this side at the live line — the pregame price is a different bet and is not shown here">
      no live price
    </span>
  ) : (
    <span className="num inline-flex items-baseline gap-1" data-testid="mlb-live-cz">
      <OddsCell odds={fmtAmerican(v.am) as never} book="caesars" />
      <span className="text-[9px] font-bold uppercase tracking-wide text-live">live</span>
    </span>
  );
}

/**
 * What stands in BOTH ¼-Kelly columns on a live row — the football desks' tag, verbatim
 * (src/components/cfb/CfbPicksBoard.tsx:228). A stake is never shown on an in-play line: a
 * market-derived fair has zero edge over the market by construction, and the pregame Kelly
 * fraction prices a different bet at a different number. Either way the chip would be an
 * instruction to stake money on a phantom.
 */
function LiveTag() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-live/50 bg-live/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-live"
      title="In play — graded on EV at Caesars, no ¼-Kelly stake on a live line"
      data-testid="mlb-live-tag"
    >
      <LiveDot /> live
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

/* NFL desk chip — the 🏈 badge beside the h1 whenever the global SportSwitch is on the NFL (2026-09-08) */
function NflChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-nfl/40 bg-nfl/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-nfl">
      🏈 NFL
    </span>
  );
}
