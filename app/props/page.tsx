"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import type { PickRow } from "@/engine";
import { amFmt, combineTicket, type SandboxLeg } from "@/lib/ticket-math";

/**
 * PARLAY BUILDER (sandbox, 2026-07-24) — a Caesars-style prop board for
 * messing around with tickets that are NOT tracked: no lock, no ledger, no
 * bankroll math. Every price is the engine board's captured Caesars quote and
 * every True Win % is the engine's blended probability for that exact side —
 * the side the engine prices; the opposite side's price isn't captured, so it
 * is never shown (nothing here is ever fabricated). Combined true % is the
 * naive product — same-game correlation is NOT modeled in this sandbox.
 */

const TABS = [
  { key: "games", label: "Games" },
  { key: "batter", label: "Batter Props" },
  { key: "pitcher", label: "Pitcher Props" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const MARKETS: Record<TabKey, { key: string; label: string }[]> = {
  games: [
    { key: "ml", label: "Moneyline" },
    { key: "rl", label: "Run Line" },
  ],
  batter: [
    { key: "batter_hits", label: "Hits" },
    { key: "batter_total_bases", label: "Total Bases" },
    { key: "batter_hits_runs_rbis", label: "Hits + Runs + RBI" },
    { key: "batter_home_runs", label: "Home Runs" },
  ],
  pitcher: [
    { key: "pitcher_strikeouts", label: "Strikeouts" },
    { key: "pitcher_outs", label: "Outs Recorded" },
  ],
};

type GameGroup = { game: string; matchup: string; time: string; rows: PickRow[] };

function groupByGame(rows: PickRow[]): GameGroup[] {
  const by = new Map<string, GameGroup>();
  for (const r of rows) {
    const g = String(r.game ?? "");
    if (!g) continue;
    const cur = by.get(g);
    if (cur) {
      cur.rows.push(r);
      continue;
    }
    const [matchup, ...rest] = g.split(" · ");
    by.set(g, { game: g, matchup, time: rest.join(" · "), rows: [r] });
  }
  return [...by.values()].sort((a, b) => (a.game < b.game ? -1 : 1));
}

const legId = (r: PickRow) => `${r.lkey ?? ""}|${r.label}|${r.sub}`;

function PropRow({
  r,
  market,
  selected,
  onToggle,
}: {
  r: PickRow;
  market: string;
  selected: boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const cz = typeof r.cz === "number" ? r.cz : null;
  const prob = typeof r.prob === "number" ? r.prob : null;
  return (
    <div className={`flex items-center justify-between gap-2 border-t border-white/[0.04] py-2 ${r.susp ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-text">
          {r.label}
          {r.susp && (
            <span className="ml-1.5 rounded-full border border-line-2 bg-surface-2 px-1.5 py-px text-[8.5px] font-bold uppercase text-muted">
              susp
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-muted">{r.sub}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {prob != null && (
          <span className="num text-[10.5px] text-muted" title="Engine blended true win % for this exact side">
            {prob.toFixed(1)}%
          </span>
        )}
        {cz != null ? (
          <button
            onClick={() =>
              onToggle({
                id: legId(r),
                label: r.label,
                sub: r.sub,
                game: String(r.game ?? ""),
                cz,
                prob: prob ?? 0,
                market,
                susp: r.susp,
              })
            }
            className={`num min-w-[72px] rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
              selected
                ? "border-pos/60 bg-pos/15 text-pos"
                : "border-white/[0.08] bg-surface-2 text-pos hover:border-pos/40"
            }`}
          >
            {amFmt(cz)}
          </button>
        ) : (
          <span className="min-w-[72px] rounded-[10px] border border-white/[0.05] bg-surface-2/50 px-3 py-2 text-center text-[10px] text-faint">
            no CZ
          </span>
        )}
      </div>
    </div>
  );
}

function GameCard({
  g,
  market,
  isSel,
  onToggle,
}: {
  g: GameGroup;
  market: string;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(6);
  const rows = g.rows;
  return (
    <Panel>
      <button className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <span className="text-[13px] font-semibold text-text">{g.matchup}</span>
        <span className="num text-[11px] text-muted">
          {g.time} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="mt-2">
          {rows.slice(0, shown).map((r) => (
            <PropRow key={legId(r)} r={r} market={market} selected={isSel(legId(r))} onToggle={onToggle} />
          ))}
          {rows.length > shown && (
            <button className="mt-2 w-full text-center text-[11.5px] font-semibold text-pos" onClick={() => setShown(rows.length)}>
              Show More ({rows.length - shown}) ▾
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function PropsPage() {
  const q = useBoard();
  const regen = useRegenerateBoard();
  const [tab, setTab] = useState<TabKey>("games");
  const [mkt, setMkt] = useState<string>("ml");
  const [legs, setLegs] = useState<SandboxLeg[]>([]);
  const [stake, setStake] = useState(10);

  const d = q.data?.data;
  const activeMkt = MARKETS[tab].some((m) => m.key === mkt) ? mkt : MARKETS[tab][0].key;
  const rows = useMemo(() => {
    if (!d) return [];
    const cats = { ...(d.categories ?? {}) } as Record<string, PickRow[]>;
    const live = (d.categoriesLive ?? {}) as Record<string, PickRow[]>;
    const seen = new Set<string>();
    const all = [...(cats[activeMkt] ?? []), ...(live[activeMkt] ?? [])];
    return all.filter((r) => {
      const id = legId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [d, activeMkt]);
  const games = useMemo(() => groupByGame(rows), [rows]);

  const isSel = (id: string) => legs.some((l) => l.id === id);
  const toggle = (leg: SandboxLeg) =>
    setLegs((cur) => (cur.some((l) => l.id === leg.id) ? cur.filter((l) => l.id !== leg.id) : [...cur, leg]));

  const calc = useMemo(() => combineTicket(legs), [legs]);

  return (
    <>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[19px] font-bold tracking-tight text-text">Parlay Builder</h1>
        <span className="text-[10.5px] text-faint">Sandbox — nothing here is tracked or enters the ledger</span>
      </div>

      <div className="mb-2 flex gap-1.5">
        {TABS.map((t) => (
          <FilterPill key={t.key} selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </FilterPill>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MARKETS[tab].map((m) => (
          <FilterPill key={m.key} selected={activeMkt === m.key} onClick={() => setMkt(m.key)}>
            {m.label}
          </FilterPill>
        ))}
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[64px] rounded-[14px]" />
          ))}
        </div>
      ) : !d || games.length === 0 ? (
        <Panel>
          <EmptyState
            title="No board yet"
            body="The prop board comes from today's generated quant board. Generate one (Board tab or the button below) and every game, batter prop, and pitcher prop appears here with the engine's True Win % next to its Caesars price."
          />
          <div className="mt-3 text-center">
            <Pill variant="ghost" onClick={() => regen.mutate()}>
              {regen.isPending ? "Generating…" : "Generate today's board"}
            </Pill>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3 pb-40">
          {games.map((g) => (
            <Reveal key={g.game}>
              <GameCard g={g} market={activeMkt} isSel={isSel} onToggle={toggle} />
            </Reveal>
          ))}
          <div className="text-[10px] leading-relaxed text-faint">
            Prices are the engine board&apos;s captured Caesars quotes; True Win % is the engine&apos;s blended
            probability for that exact side. Only the side the engine prices is shown — the opposite side&apos;s
            price isn&apos;t captured and is never invented. SUSP rows are markets suspended from the real card;
            here they&apos;re selectable because this is a sandbox.
          </div>
        </div>
      )}

      {/* the slip — fixed bottom sheet, Caesars-style */}
      {legs.length > 0 && calc && (
        <div className="fixed inset-x-0 bottom-[64px] z-40 mx-auto max-w-[720px] px-3 md:bottom-4 md:pl-[212px]">
          <div className="rounded-[16px] border border-white/[0.1] bg-surface/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                Ticket · {calc.n} leg{calc.n > 1 ? "s" : ""}
              </span>
              <button className="text-[11px] font-semibold text-neg" onClick={() => setLegs([])}>
                Clear all
              </button>
            </div>
            <div className="max-h-[30vh] space-y-1 overflow-y-auto">
              {legs.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="min-w-0 truncate text-text">
                    {l.label} <span className="text-muted">{l.sub}</span>
                    <span className="ml-1 text-faint">({l.game.split(" · ")[0]})</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-muted">{l.prob.toFixed(1)}%</span>
                    <span className="num text-pos">{amFmt(l.cz)}</span>
                    <button className="text-neg" onClick={() => setLegs((cur) => cur.filter((x) => x.id !== l.id))}>
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
              <span>
                <span className="text-muted">Odds </span>
                <b className="text-pos">{amFmt(calc.am)}</b>
              </span>
              <span>
                <span className="text-muted">True </span>
                <b className={calc.trueProb > calc.impProb ? "text-pos" : "text-text"}>
                  {(calc.trueProb * 100).toFixed(1)}%
                </b>
                <span className="text-faint"> (implied {(calc.impProb * 100).toFixed(1)}%)</span>
              </span>
              <span>
                <span className="text-muted">EV </span>
                <b className={calc.ev >= 0 ? "text-pos" : "text-neg"}>
                  {calc.ev >= 0 ? "+" : ""}
                  {(calc.ev * 100).toFixed(1)}%
                </b>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  value={stake}
                  min={0}
                  onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
                  className="w-[64px] rounded-[8px] border border-white/[0.08] bg-surface-2 px-2 py-1 text-right text-[12px] text-text"
                />
                <span className="text-muted">pays</span>
                <b className="text-text">${calc.payout(stake).toFixed(2)}</b>
              </span>
            </div>
            <div className="mt-1.5 text-[9.5px] text-faint">
              True % is the naive product — same-game legs are correlated and this sandbox does not model that.
              Not tracked, never enters the ledger.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
