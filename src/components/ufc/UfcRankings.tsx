"use client";

/* UFC divisional rankings + active rosters — a pure STATS reference (no odds,
   no model, nothing invented). The rank order is the official UFC media-panel
   ranking (champion + #1..15) pulled from ufc.com; the unranked names and every
   fighter's MMA record come from Wikipedia's maintained active-roster tables.
   Both are baked into /model/ufc.json weekly by tools/build_ufc.py, so this view
   just reads and renders. Decoupled from the UFC betting flag: rankings are
   useful year-round, the betting board only appears on fight weeks. */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";

type Move = { dir: "up" | "down" | "new"; n: number } | null;
type Fighter = {
  rank: number | "C" | null;
  name: string;
  slug: string | null;
  record: string | null;
  nickname: string;
  age: string;
  country: string | null;
  move: Move;
};
type Division = {
  id: string;
  name: string;
  weight: string;
  gender: "men" | "women";
  rankedCount: number;
  totalCount: number;
  fighters: Fighter[];
};
type P4PRow = { rank: number; name: string; slug: string | null; record: string | null; nickname: string; move: Move };
type UfcData = {
  generatedAt: number;
  source: string;
  divisions: Division[];
  p4p: { men: P4PRow[]; women: P4PRow[] };
};

const UFC_ATHLETE = "https://www.ufc.com/athlete/";
const rec = (r: string | null) => r || "—";

function MoveTag({ move, ranked }: { move: Move; ranked: boolean }) {
  if (move?.dir === "up")
    return <span className="num text-[10.5px] font-bold text-pos">▲{move.n || ""}</span>;
  if (move?.dir === "down")
    return <span className="num text-[10.5px] font-bold text-neg">▼{move.n || ""}</span>;
  if (move?.dir === "new")
    return <span className="text-[9px] font-bold uppercase tracking-wider text-gold">NEW</span>;
  return ranked ? <span className="text-[10.5px] text-faint">–</span> : null;
}

/** One ranked row (used for both divisions and P4P). */
function RankRow({ f }: { f: Fighter | (P4PRow & { country?: null; age?: string }) }) {
  const isChamp = (f as Fighter).rank === "C";
  const inner = (
    <div
      className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors ${
        isChamp
          ? "border border-gold/30 bg-gold/[0.06]"
          : "border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.045]"
      }`}
    >
      <div
        className={`num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
          isChamp ? "bg-gold/20 text-gold" : "bg-pos/10 text-pos"
        }`}
      >
        {isChamp ? "★" : f.rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-text">{f.name}</span>
          {isChamp && (
            <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-widest text-gold">
              Champ
            </span>
          )}
        </div>
        {f.nickname && <div className="truncate text-[10.5px] text-muted">&ldquo;{f.nickname}&rdquo;</div>}
      </div>
      <div className="num shrink-0 text-right text-[12px] tabular-nums text-muted">{rec(f.record)}</div>
      <div className="w-8 shrink-0 text-right">
        <MoveTag move={f.move} ranked={!isChamp} />
      </div>
    </div>
  );
  return f.slug ? (
    <a href={`${UFC_ATHLETE}${f.slug}`} target="_blank" rel="noopener noreferrer" className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

function DivisionView({ d }: { d: Division }) {
  const ranked = d.fighters.filter((f) => f.rank === "C" || typeof f.rank === "number");
  const unranked = d.fighters.filter((f) => f.rank === null);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        {ranked.map((f) => (
          <RankRow key={`${f.rank}-${f.name}`} f={f} />
        ))}
      </div>

      {unranked.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
            Unranked
            <span className="rounded-full bg-white/[0.05] px-1.5 py-px text-[9.5px] text-muted">
              {unranked.length} active
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {unranked.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5"
              >
                <span className="truncate text-[12px] text-text/90">{f.name}</span>
                <span className="num shrink-0 text-[11px] tabular-nums text-faint">{rec(f.record)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function P4PView({ rows, label }: { rows: P4PRow[]; label: string }) {
  if (!rows.length) return <EmptyState title={`No ${label} data`} body="It’ll appear after the next rankings refresh." />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {rows.map((r) => (
        <RankRow key={`${r.rank}-${r.name}`} f={{ ...r, rank: r.rank, country: null, age: "", slug: r.slug }} />
      ))}
    </div>
  );
}

export function UfcRankings() {
  const q = useQuery({
    queryKey: ["ufc-rankings"],
    queryFn: async (): Promise<UfcData> => {
      const r = await fetch("/model/ufc.json");
      if (!r.ok) throw new Error(`ufc.json ${r.status}`);
      return r.json();
    },
    staleTime: 60 * 60_000,
    retry: 1,
  });

  // selected view: a division id, or "p4p-men" / "p4p-women". Mounted-gated so
  // the localStorage read never diverges from the SSR render (hydration-safe).
  const [view, setView] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const v = localStorage.getItem("pl_ufc_view");
      if (v) setView(v);
    } catch {}
  }, []);
  const pick = (v: string) => {
    setView(v);
    try { localStorage.setItem("pl_ufc_view", v); } catch {}
  };

  const d = q.data;
  const activeView = view || d?.divisions[0]?.id || "heavyweight";
  const division = useMemo(() => d?.divisions.find((x) => x.id === activeView), [d, activeView]);
  const isP4P = activeView.startsWith("p4p");

  if (q.isPending) return <Panel><SkeletonRows rows={10} /></Panel>;
  if (q.isError || !d)
    return (
      <Panel>
        <EmptyState
          title="Rankings not published yet"
          body="The weekly UFC rankings feed (public/model/ufc.json) hasn’t been generated for this deploy yet — it lands with the next rankings refresh."
        />
      </Panel>
    );

  const men = d.divisions.filter((x) => x.gender === "men");
  const women = d.divisions.filter((x) => x.gender === "women");
  const updated = new Date(d.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      <Reveal>
        <Panel className="!p-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">P4P</span>
              <FilterPill selected={activeView === "p4p-men"} onClick={() => pick("p4p-men")}>Men&apos;s</FilterPill>
              <FilterPill selected={activeView === "p4p-women"} onClick={() => pick("p4p-women")}>Women&apos;s</FilterPill>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">Men</span>
              {men.map((x) => (
                <FilterPill key={x.id} selected={activeView === x.id} onClick={() => pick(x.id)}>{x.name}</FilterPill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">Women</span>
              {women.map((x) => (
                <FilterPill key={x.id} selected={activeView === x.id} onClick={() => pick(x.id)}>
                  {x.name.replace("Women's ", "")}
                </FilterPill>
              ))}
            </div>
          </div>
        </Panel>
      </Reveal>

      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <div>
          <div className="display text-[20px] font-semibold text-text">
            {isP4P
              ? `${activeView === "p4p-women" ? "Women's" : "Men's"} Pound-for-Pound`
              : `${division?.name}`}
          </div>
          <div className="text-[11px] text-muted">
            {isP4P
              ? "Best fighters regardless of weight class"
              : `${division?.weight} · ${division?.rankedCount} ranked · ${division ? division.totalCount - division.rankedCount : 0} more active`}
          </div>
        </div>
      </div>

      <Reveal key={activeView}>
        {isP4P ? (
          <P4PView
            rows={activeView === "p4p-women" ? d.p4p.women : d.p4p.men}
            label={activeView === "p4p-women" ? "women’s P4P" : "men’s P4P"}
          />
        ) : division ? (
          <DivisionView d={division} />
        ) : (
          <EmptyState title="Division not found" />
        )}
      </Reveal>

      <div className="mt-2 text-[10px] leading-relaxed text-faint">
        Official UFC rankings via ufc.com · active rosters &amp; records via Wikipedia · refreshed weekly (last {updated}).
        Rankings reflect the UFC media panel; “–” means a record isn’t published for that fighter yet. Informational only, not betting advice.
      </div>
    </div>
  );
}
