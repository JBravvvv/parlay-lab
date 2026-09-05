"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useQuery } from "@tanstack/react-query";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import type { PickRow, PropBoardGame } from "@/engine";
import { combineTicket, type SandboxLeg } from "@/lib/ticket-math";
import { useHeadshots } from "@/lib/mlb-visuals";
import { MarketNav } from "@/components/props/MarketNav";
import { PropGameCard } from "@/components/props/PlayerRow";
import { GameMarketCard } from "@/components/props/GameCard";
import { Slip } from "@/components/props/Slip";
import { useShellInsets } from "@/components/props/useShellInsets";
import {
  MARKETS,
  bothSides,
  groupByGame,
  isGameMarket,
  legId,
  norm,
  rankOf,
  type TabKey,
} from "@/components/props/props-model";

/**
 * PARLAY BUILDER (sandbox, 2026-07-24; UI rebuilt 2026-09-03) — a Caesars-style
 * prop board for messing around with tickets that are NOT tracked: no lock, no
 * ledger, no bankroll math.
 *
 * Player props read the board's FULL prop board (`data.propBoard`): every player
 * the odds feed posts, both sides, every line, uncapped. The engine's ranked
 * `categories` are the selection pool — top 50 per market, one side, and only
 * players past the model's lineup/sample filters — which is the right pool to
 * pick plays from and the wrong one to browse a book with. Game markets (ML/RL)
 * still come from `categories`, where they are never truncated.
 *
 * Nothing is ever invented: prices are real posted quotes (Caesars when Caesars
 * posts the line, otherwise the best price in the feed, labelled with the book),
 * and the win % is either the engine's own model number for that line or the
 * de-vigged market fair, always tagged as one or the other. The tables and the
 * price/prob/label helpers live in src/components/props/props-model.ts.
 *
 * 2026-09-03 rebuild (Josh: "massive UI rebuild … pick choices … WAY TOO BIG"):
 * two-row sticky market nav (segmented control + scrolling pill rail), 40px
 * player rows with 32px price buttons, collapsible compact game cards, and the
 * slip as a collapsed bottom-sheet handle. Data flow is unchanged.
 */

export default function PropsPage() {
  const q = useBoard();
  const regen = useRegenerateBoard();
  const ins = useShellInsets();
  const [tab, setTab] = useState<TabKey>("games");
  const [mktKey, setMktKey] = useState<string>("ml");
  const [legs, setLegs] = useState<SandboxLeg[]>([]);
  const [stake, setStake] = useState(10);
  const [search, setSearch] = useState("");

  const d = q.data?.data;
  const mkt = MARKETS[tab].find((m) => m.key === mktKey) ?? MARKETS[tab][0];
  const cat = mkt.cat;
  const gameTab = !!cat && isGameMarket(cat);

  /* ML/RL: the ranked categories (never truncated — one row per game) */
  const gameRows = useMemo(() => {
    if (!d || !cat || !gameTab) return [];
    const cats = (d.categories ?? {}) as Record<string, PickRow[]>;
    const live = (d.categoriesLive ?? {}) as Record<string, PickRow[]>;
    const seen = new Set<string>();
    const base = [...(cats[cat] ?? []), ...(live[cat] ?? [])].filter((r) => {
      const id = legId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return bothSides(base);
  }, [d, cat, gameTab]);
  const gameGroups = useMemo(() => groupByGame(gameRows), [gameRows]);

  /* player props: the FULL prop board — every player, both sides, uncapped.
     INSTRUCTION 34 (2026-09-04, Josh: "Prop bets still aren't pulling up on 'Parlay Builder'.
     Daily odds should generate along with the 'Board' generating"): a board this device
     regenerated could come back with NO prop rows (the odds proxy 403'd the engine's props
     call until the same-day fix in odds-shape.ts) and still win bestBoard on freshness. When
     the chosen board has no prop board, fall back to the server-built one for today — its
     props generate with the board — and say so. */
  const ownProps = (d?.propBoard ?? []) as PropBoardGame[];
  const ownEmpty = !!d && ownProps.length === 0;
  const serverProps = useQuery<PropBoardGame[]>({
    queryKey: ["server-props", q.data?.date ?? null],
    enabled: ownEmpty,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/board?date=${encodeURIComponent(q.data!.date)}`, { cache: "no-store" });
      if (!r.ok) return [];
      const j = (await r.json()) as { board?: { data?: { propBoard?: PropBoardGame[] } } | null };
      return j?.board?.data?.propBoard ?? [];
    },
  });
  const propBoard = ownEmpty ? serverProps.data ?? [] : ownProps;
  const fromServer = ownEmpty && (serverProps.data?.length ?? 0) > 0;
  const propGames = useMemo(() => {
    if (!cat || gameTab) return [];
    const needle = norm(search.trim());
    return propBoard
      .map((g) => {
        let rows = (g.markets?.[cat] ?? []).slice();
        if (needle) rows = rows.filter((r) => norm(r.p).includes(needle));
        rows.sort((a, b) => rankOf(b) - rankOf(a));
        return { g, rows };
      })
      .filter((x) => x.rows.length > 0);
  }, [propBoard, cat, gameTab, search]);

  const totalRows = propGames.reduce((n, x) => n + x.rows.length, 0);
  const playerNames = useMemo(
    () => [...new Set(propGames.flatMap((x) => x.rows.map((r) => r.p)))],
    [propGames],
  );
  const headshots = useHeadshots(playerNames);

  /* a board generated before the full prop board shipped has no `propBoard` */
  const legacyBoard = !!d && !d.propBoard && !gameTab && !fromServer && !serverProps.isPending;

  const isSel = (id: string) => legs.some((l) => l.id === id);
  const toggle = (leg: SandboxLeg) =>
    setLegs((cur) => (cur.some((l) => l.id === leg.id) ? cur.filter((l) => l.id !== leg.id) : [...cur, leg]));

  const calc = useMemo(() => combineTicket(legs), [legs]);

  const empty = gameTab ? gameGroups.length === 0 : propGames.length === 0;

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h1 className="text-[17px] font-bold tracking-tight text-text">Parlay Builder</h1>
        <span className="truncate text-[10px] text-faint">Sandbox · nothing here is tracked or enters the ledger</span>
      </div>

      <MarketNav
        tab={tab}
        mktKey={mktKey}
        onTab={(t) => {
          setTab(t);
          setMktKey(MARKETS[t][0].key);
        }}
        onMarket={setMktKey}
        top={ins.top}
        search={!gameTab && cat != null ? search : null}
        onSearch={setSearch}
        count={{ lines: totalRows, games: propGames.length }}
      />

      {fromServer && !gameTab && (
        <div className="mb-2 rounded-[10px] border border-gold/30 bg-gold/[0.07] px-3 py-1.5 text-[10.5px] text-gold">
          Your device&apos;s board has no prop lines — showing the server-built prop board for today.
        </div>
      )}
      {q.isPending || (ownEmpty && !gameTab && serverProps.isPending) ? (
        <BoardSkeleton />
      ) : cat == null ? (
        <Panel>
          <EmptyState
            title={`${mkt.label} — not in the feed mirror yet`}
            body="This market is posted at Caesars Sportsbook — the app's odds feed simply mirrors a subset of the book and doesn't carry it yet, so there are no real prices to show here (prices are never invented). The priced categories are the ones the engine already collects."
          />
        </Panel>
      ) : legacyBoard ? (
        <Panel>
          <EmptyState
            title="This board predates the full prop board"
            body="Your cached board was generated before every player's prices were exported. Regenerate it and the whole book — every player, both sides — appears here."
          />
          <div className="mt-3 text-center">
            <Pill variant="ghost" onClick={() => regen.mutate()}>
              {regen.isPending ? "Generating…" : "Regenerate board"}
            </Pill>
          </div>
        </Panel>
      ) : !d || empty ? (
        <Panel>
          <EmptyState
            title={search.trim() ? "No player matches that search" : "No board yet"}
            body={
              search.trim()
                ? "Clear the search to see every player the book posts for this market."
                : "The prop board comes from today's generated quant board. Generate one (Board tab or the button below) and every game, batter prop and pitcher prop appears here with the engine's win % next to its price."
            }
          />
          {!search.trim() && (
            <div className="mt-3 text-center">
              <Pill variant="ghost" onClick={() => regen.mutate()}>
                {regen.isPending ? "Generating…" : "Generate today's board"}
              </Pill>
            </div>
          )}
        </Panel>
      ) : (
        <div className={`space-y-2 ${legs.length ? "pb-20" : "pb-6"}`}>
          {gameTab
            ? gameGroups.map((g) => (
                <Reveal key={g.game} y={10}>
                  <GameMarketCard g={g} market={cat} isSel={isSel} onToggle={toggle} />
                </Reveal>
              ))
            : propGames.map(({ g, rows }) => (
                <Reveal key={g.game} y={10}>
                  <PropGameCard g={g} cat={cat} rows={rows} headshots={headshots} isSel={isSel} onToggle={toggle} />
                </Reveal>
              ))}
          <details className="group rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-faint">
            <summary className="cursor-pointer list-none text-[10.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
              How to read this <span className="inline-block transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-1.5">
              {gameTab ? (
                <>Prices are the board&apos;s captured Caesars quotes; the % is the engine&apos;s blended win % for that side.</>
              ) : (
                <>
                  Every player the odds feed posts for this market, both sides, uncapped. Prices are real posted quotes —
                  Caesars when Caesars posts the line, otherwise the best price in the feed with the book named on the
                  button. The % is the engine&apos;s model number for that line; where the engine didn&apos;t price the
                  player (bench bats, sub-25-AB samples, unposted lineups) it is the de-vigged market fair, tagged{" "}
                  <span className="italic">mkt</span> — a price the market thinks is fair, not an edge. ALT = a Caesars
                  milestone ladder line. Nothing here is tracked or enters the ledger.
                </>
              )}
            </div>
          </details>
        </div>
      )}

      {/* the slip — collapsed bottom-sheet handle above the tab bar */}
      {legs.length > 0 && calc && (
        <Slip
          legs={legs}
          calc={calc}
          stake={stake}
          onStake={setStake}
          onRemove={(id) => setLegs((cur) => cur.filter((x) => x.id !== id))}
          onClear={() => setLegs([])}
          bottom={ins.bottom}
        />
      )}
    </>
  );
}

/** Two game cards' worth of 40px rows — the same height the real rows render at. */
function BoardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 2 }).map((_, c) => (
        <div key={c} className="glass overflow-hidden">
          <div className="flex h-9 items-center gap-2 px-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="px-1.5 pb-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5 border-t border-white/[0.04] py-1">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-8 w-[80px] rounded-[8px]" />
                <Skeleton className="h-8 w-[80px] rounded-[8px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
