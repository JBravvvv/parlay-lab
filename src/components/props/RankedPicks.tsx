"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GradeChip } from "@/components/ui/GradeChip";
import { gradeFromEv, gradeRank, type Grade } from "@/lib/grade";
import { amFmt } from "@/lib/ticket-math";

/**
 * EVERY PICK TODAY, S DOWN (2026-09-18, Josh's word, verbatim: "Below the Parlay Generator, the
 * default view should be every pick available for the day ranked from S down. So every S pick no
 * matter if its a ML, prop, etc is listed first, then all of the As, Bs & so on. There should be
 * filters above it to sort by each option (ex: ML, RL, HR, Hits, H+R+RBI, etc); when you select a
 * filter (ie: H+R+RBI) it should list every pick under that category for the entire day (every
 * single prop under that category for every single player in every single game) from S to A to B").
 *
 * Desk-agnostic: the page hands it rows it already priced (the generator's own pool for props, the
 * board's own ML / RL / spread / total rows for sides) — nothing here fetches, prices, or grades on
 * a number the page did not already show. The grade is gradeFromEv on the row's EV at the posted
 * price, the same cut-offs as every GradeChip on the site.
 */

export type RankedPick<P> = {
  /** the slip leg id — `isSel` reads it */
  id: string;
  /** the filter key this pick belongs to ("ml" / "rl" / a prop market key) */
  market: string;
  /** the name line: player or club */
  label: string;
  /** the bet + game line */
  sub: string;
  /** the posted American price */
  am: number;
  /** win % (0..100) */
  prob: number;
  /** EV in PERCENT at `am` */
  ev: number;
  book?: string | null;
  src?: "model" | "market";
  started?: boolean;
  alt?: boolean;
  /** the desk's own slip leg — handed to `onToggle` untouched */
  leg: P;
  /** the mark on the left: PlayerMark / TeamMark / TeamAvatar, rendered by the desk */
  mark: ReactNode;
  /** the desk's hit-rate chip for this line, if it has one */
  hit?: ReactNode;
  /** the bet % / money % chip, if the desk has a split for this side */
  splits?: ReactNode;
};

export type RankedFilter = { key: string; label: string };
export type RankedAccent = "pos" | "cfb" | "nfl";

const ON: Record<RankedAccent, string> = {
  pos: "border-pos/60 bg-pos/15 text-pos",
  cfb: "border-cfb/60 bg-cfb/15 text-cfb",
  nfl: "border-nfl/60 bg-nfl/15 text-nfl",
};
const PRICE: Record<RankedAccent, string> = { pos: "text-pos", cfb: "text-cfb", nfl: "text-nfl" };

/** rows per page — "every single prop" can run past a thousand rows; the rest is one tap away */
export const RANKED_PAGE = 60;
const TIERS: readonly Grade[] = ["S", "A", "B", "C", "D", "F"];

export function RankedPicks<P>({
  picks,
  filters,
  isSel,
  onToggle,
  loading = false,
  accent = "pos",
  emptyBody = "No priced picks on this board yet.",
  filter: filterProp,
  onFilter,
}: {
  picks: readonly RankedPick<P>[];
  /** the category chips, in rail order; "All" is added first */
  filters: readonly RankedFilter[];
  isSel: (id: string) => boolean;
  onToggle: (leg: P) => void;
  loading?: boolean;
  accent?: RankedAccent;
  emptyBody?: string;
  /** CONTROLLED category (2026-09-18, Josh: "when I click a filter like 'H+R+RBI' it still shows
      washington nationals ML, anytime HR props etc"): the chips here worked, but the market rail at
      the top of the desk and the generator's category chips carry the same labels and left this
      list alone. The page now hands the rail's market down, so every "H+R+RBI" on the desk narrows
      this list. Omit both and the list keeps its own state, as the football desks do. */
  filter?: string;
  onFilter?: (key: string) => void;
}) {
  const [own, setOwn] = useState<string>("all");
  const filter = filterProp ?? own;
  const [limit, setLimit] = useState(RANKED_PAGE);
  const graded = useMemo(
    () =>
      picks
        .map((p) => ({ ...p, grade: gradeFromEv(p.ev) }))
        .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || b.ev - a.ev || a.label.localeCompare(b.label)),
    [picks],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of graded) m.set(p.market, (m.get(p.market) ?? 0) + 1);
    return m;
  }, [graded]);
  const shown = useMemo(() => (filter === "all" ? graded : graded.filter((p) => p.market === filter)), [graded, filter]);
  const tiers = useMemo(() => {
    const m = new Map<Grade, number>();
    for (const p of shown) if (p.grade) m.set(p.grade, (m.get(p.grade) ?? 0) + 1);
    return m;
  }, [shown]);
  const labelOf = (key: string) => filters.find((f) => f.key === key)?.label ?? key;
  const pick = (key: string) => {
    setOwn(key);
    onFilter?.(key);
    setLimit(RANKED_PAGE);
  };
  const visible = shown.slice(0, limit);
  return (
    <section data-testid="ranked-picks" className="glass overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-faint">Every pick today</div>
          <div className="text-[13px] font-bold tracking-tight text-text">Ranked S → F{filter !== "all" && <span className="text-muted"> · {labelOf(filter)}</span>}</div>
        </div>
        <div className="num flex shrink-0 flex-wrap justify-end gap-x-2 text-[9.5px] text-faint" aria-label="Picks per tier">
          {TIERS.map((t) => (tiers.get(t) ? <span key={t}><b className="text-text">{t}</b> {tiers.get(t)}</span> : null))}
        </div>
      </header>
      <div role="tablist" aria-label="Pick category" className="mt-2 flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => pick("all")}
          className={`press h-7 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold ${filter === "all" ? ON[accent] : "border-white/[0.08] bg-surface-2 text-muted"}`}>
          All <span className="num opacity-70">{graded.length}</span>
        </button>
        {filters.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => pick(f.key)}
            className={`press h-7 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold ${filter === f.key ? ON[accent] : "border-white/[0.08] bg-surface-2 text-muted"} ${counts.get(f.key) ? "" : "opacity-40"}`}>
            {f.label} <span className="num opacity-70">{counts.get(f.key) ?? 0}</span>
          </button>
        ))}
      </div>
      {loading && graded.length === 0 ? (
        <div className="px-3 pb-3 text-[11px] text-muted">Loading the board…</div>
      ) : shown.length === 0 ? (
        <div className="px-3 pb-3 text-[11px] text-muted">{emptyBody}</div>
      ) : (
        <div className="px-2 pb-1">
          {visible.map((p, idx) => {
            const sel = isSel(p.id);
            return (
              <div key={p.id} data-ranked-pick={p.id} data-grade={p.grade ?? ""} className="flex items-center gap-2 border-t border-white/[0.04] py-1">
                <span className="num w-5 shrink-0 text-right text-[9.5px] text-faint">{idx + 1}</span>
                {p.mark}
                <div className="min-w-0 flex-1 leading-none">
                  <div className="truncate text-[12px] font-medium text-text">{p.label}</div>
                  <div className="mt-[3px] flex items-center gap-1.5 truncate text-[9.5px] text-faint">
                    <span className="shrink-0 rounded-sm bg-white/[0.06] px-1 text-[8.5px] font-bold uppercase tracking-wide text-muted">{labelOf(p.market)}</span>
                    <span className="truncate">{p.sub}</span>
                    {p.alt && <span className="shrink-0 rounded-[4px] border border-line-2 bg-surface-2 px-1 text-[8px] font-bold uppercase">alt</span>}
                    {p.started && <span className="shrink-0 text-live">started</span>}
                    {p.splits}
                  </div>
                  {p.hit && <div className="mt-[3px]">{p.hit}</div>}
                </div>
                <span className="num hidden shrink-0 flex-col items-end text-[9.5px] leading-none text-muted sm:flex" title="win % at the posted price · EV at that price">
                  <span>{p.prob.toFixed(1)}%</span>
                  <span className={`mt-[3px] ${p.ev >= 0 ? "text-pos" : "text-neg"}`}>{p.ev >= 0 ? "+" : ""}{p.ev.toFixed(1)}% EV</span>
                </span>
                <GradeChip grade={p.grade} basis="EV at the posted price" />
                <button
                  type="button"
                  aria-pressed={sel}
                  onClick={() => onToggle(p.leg)}
                  className={`num flex h-8 w-[76px] shrink-0 flex-col items-center justify-center rounded-[8px] border text-[12px] font-semibold leading-none ${PRICE[accent]} transition-[background,border-color,box-shadow] duration-(--dur-fast) active:scale-[0.97] ${
                    sel ? "border-pos/60 bg-pos/10 ring-1 ring-pos/50" : "border-white/[0.08] bg-surface-2 hover:border-pos/40"
                  }`}
                >
                  {amFmt(p.am)}
                  {(p.src === "market" || (p.book && p.book !== "CZ")) && (
                    <span className="mt-[2px] text-[8px] font-normal uppercase text-faint">{p.src === "market" ? "mkt " : ""}{p.book && p.book !== "CZ" ? p.book : ""}</span>
                  )}
                </button>
              </div>
            );
          })}
          {shown.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + RANKED_PAGE)} className="press mt-1 flex min-h-11 w-full items-center justify-center rounded-[10px] border border-white/[0.08] text-[11px] font-semibold text-muted">
              Show {Math.min(RANKED_PAGE, shown.length - limit)} more · {shown.length - limit} left
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Ranked | By game — the ranked list is the default view under the generator (2026-09-18) */
export function RankedViewTabs({ view, onView, accent = "pos" }: { view: "ranked" | "games"; onView: (v: "ranked" | "games") => void; accent?: RankedAccent }) {
  const tab = (key: "ranked" | "games", text: string) => (
    <button type="button" role="tab" aria-selected={view === key} onClick={() => onView(key)}
      className={`press h-8 rounded-full border px-3 text-[11px] font-semibold ${view === key ? ON[accent] : "border-white/[0.08] bg-surface-2 text-muted"}`}>
      {text}
    </button>
  );
  return (
    <div role="tablist" aria-label="Board view" className="mb-2 flex items-center gap-1.5">
      {tab("ranked", "Ranked · S → F")}
      {tab("games", "By game")}
    </div>
  );
}
