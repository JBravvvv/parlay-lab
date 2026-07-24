"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import type { PickRow } from "@/engine";
import { amFmt, combineTicket, type SandboxLeg } from "@/lib/ticket-math";
import { parseMatchup, teamAbbr, teamCode, teamLogo, teamLogoFromLabel, useHeadshots } from "@/lib/mlb-visuals";

/**
 * PARLAY BUILDER (sandbox, 2026-07-24) — a Caesars-style prop board for
 * messing around with tickets that are NOT tracked: no lock, no ledger, no
 * bankroll math. Every price is the engine board's captured Caesars quote and
 * every True Win % is the engine's blended probability for that exact side —
 * the side the engine prices; the opposite side's price isn't captured, so it
 * is never shown (nothing here is ever fabricated). Combined true % is the
 * naive product — same-game correlation is NOT modeled in this sandbox.
 *
 * The category rows mirror the Caesars app 1:1 (Josh's screenshots). Markets
 * the app's odds feed doesn't mirror yet get an honest empty state — every
 * market IS posted at the book; the feed just carries a subset.
 */

const TABS = [
  { key: "games", label: "Games" },
  { key: "batter", label: "Batter Props" },
  { key: "pitcher", label: "Pitcher Props" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** cat = engine market key; null = posted at the book, not in the feed mirror. */
const MARKETS: Record<TabKey, { key: string; label: string; cat: string | null }[]> = {
  games: [
    { key: "ml", label: "Moneyline", cat: "ml" },
    { key: "rl", label: "Run Line", cat: "rl" },
    { key: "r1st", label: "Run In 1st Inning", cat: null },
    { key: "fp", label: "First Pitch", cat: null },
    { key: "f3", label: "1st 3 Innings", cat: null },
    { key: "f5", label: "1st 5 Innings", cat: null },
  ],
  batter: [
    { key: "hr", label: "Anytime HR", cat: "batter_home_runs" },
    { key: "hits", label: "Hits", cat: "batter_hits" },
    { key: "tb", label: "Total Bases O/U", cat: "batter_total_bases" },
    { key: "hrr", label: "Hits + Runs + RBI O/U", cat: "batter_hits_runs_rbis" },
    { key: "rbi", label: "RBI", cat: null },
    { key: "runs", label: "Batter Runs", cat: null },
    { key: "althr", label: "Alternate Home Runs", cat: null },
    { key: "xbh", label: "Extra-Base Hit", cat: null },
    { key: "singles", label: "Singles", cat: null },
  ],
  pitcher: [
    { key: "k", label: "Pitcher Strikeouts O/U", cat: "pitcher_strikeouts" },
    { key: "outs", label: "Outs Recorded O/U", cat: "pitcher_outs" },
    { key: "er", label: "Earned Runs Allowed O/U", cat: null },
    { key: "ha", label: "Hits Allowed O/U", cat: null },
    { key: "walks", label: "Pitcher Walks O/U", cat: null },
    { key: "mostk", label: "Most Strikeouts", cat: null },
  ],
};

type GameGroup = { game: string; away: string; home: string; time: string; rows: PickRow[] };

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
    const m = parseMatchup(g);
    by.set(g, { game: g, away: m.away, home: m.home, time: m.time, rows: [r] });
  }
  return [...by.values()].sort((a, b) => (a.game < b.game ? -1 : 1));
}

const legId = (r: PickRow) => `${r.lkey ?? ""}|${r.label}|${r.sub}`;
const isGameMarket = (cat: string) => cat === "ml" || cat === "rl";

function Avatar({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-full border border-white/[0.08] bg-surface-2 object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-surface-2 text-[11px] font-bold text-muted">
      {label
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()}
    </span>
  );
}

function TeamMark({ name, side }: { name: string; side: "away" | "home" }) {
  const code = teamCode(name);
  const img = code ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={teamLogo(code)} alt="" loading="lazy" className="h-7 w-7 object-contain" />
  ) : null;
  const ab = <span className="text-[14px] font-bold tracking-wide text-text">{teamAbbr(name)}</span>;
  return (
    <span className="flex items-center gap-2">
      {side === "away" ? img : ab}
      {side === "away" ? ab : img}
    </span>
  );
}

function PropRow({
  r,
  market,
  gameCat,
  headshot,
  selected,
  onToggle,
}: {
  r: PickRow;
  market: string;
  gameCat: boolean;
  headshot: string | null;
  selected: boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const cz = typeof r.cz === "number" ? r.cz : null;
  const prob = typeof r.prob === "number" ? r.prob : null;
  const avatarSrc = gameCat ? teamLogoFromLabel(r.label) : headshot;
  return (
    <div className={`flex items-center justify-between gap-2 border-t border-white/[0.04] py-2 ${r.susp ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar src={avatarSrc} label={r.label} />
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
  gameCat,
  headshots,
  isSel,
  onToggle,
}: {
  g: GameGroup;
  market: string;
  gameCat: boolean;
  headshots: Record<string, string>;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(6);
  return (
    <Panel>
      <button className="flex w-full items-center justify-between gap-2" onClick={() => setOpen((o) => !o)}>
        <TeamMark name={g.away} side="away" />
        <span className="num text-[11px] text-muted">
          {g.time} {open ? "▾" : "▸"}
        </span>
        <TeamMark name={g.home} side="home" />
      </button>
      {open && (
        <div className="mt-2">
          {g.rows.slice(0, shown).map((r) => (
            <PropRow
              key={legId(r)}
              r={r}
              market={market}
              gameCat={gameCat}
              headshot={headshots[r.label] ?? null}
              selected={isSel(legId(r))}
              onToggle={onToggle}
            />
          ))}
          {g.rows.length > shown && (
            <button className="mt-2 w-full text-center text-[11.5px] font-semibold text-pos" onClick={() => setShown(g.rows.length)}>
              Show More ({g.rows.length - shown}) ▾
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
  const [mktKey, setMktKey] = useState<string>("ml");
  const [legs, setLegs] = useState<SandboxLeg[]>([]);
  const [stake, setStake] = useState(10);

  const d = q.data?.data;
  const mkt = MARKETS[tab].find((m) => m.key === mktKey) ?? MARKETS[tab][0];
  const cat = mkt.cat;
  const rows = useMemo(() => {
    if (!d || !cat) return [];
    const cats = (d.categories ?? {}) as Record<string, PickRow[]>;
    const live = (d.categoriesLive ?? {}) as Record<string, PickRow[]>;
    const seen = new Set<string>();
    return [...(cats[cat] ?? []), ...(live[cat] ?? [])].filter((r) => {
      const id = legId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [d, cat]);
  const games = useMemo(() => groupByGame(rows), [rows]);
  const playerNames = useMemo(
    () => (cat && !isGameMarket(cat) ? [...new Set(rows.map((r) => r.label))] : []),
    [rows, cat],
  );
  const headshots = useHeadshots(playerNames);

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
          <FilterPill
            key={t.key}
            selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setMktKey(MARKETS[t.key][0].key);
            }}
          >
            {t.label}
          </FilterPill>
        ))}
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {MARKETS[tab].map((m) => (
          <span key={m.key} className="shrink-0">
            <FilterPill selected={mkt.key === m.key} onClick={() => setMktKey(m.key)}>
              {m.label}
            </FilterPill>
          </span>
        ))}
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[64px] rounded-[14px]" />
          ))}
        </div>
      ) : cat == null ? (
        <Panel>
          <EmptyState
            title={`${mkt.label} — not in the feed mirror yet`}
            body="This market is posted at Caesars Sportsbook — the app's odds feed simply mirrors a subset of the book and doesn't carry it yet, so there are no real prices to show here (prices are never invented). The priced categories are the ones the engine already collects."
          />
        </Panel>
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
              <GameCard
                g={g}
                market={cat}
                gameCat={isGameMarket(cat)}
                headshots={headshots}
                isSel={isSel}
                onToggle={toggle}
              />
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
