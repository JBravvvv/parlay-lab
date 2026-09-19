"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GradeChip } from "@/components/ui/GradeChip";
import { gradeFromEv, gradeRank, type Grade } from "@/lib/grade";
import { parseAmerican } from "@/lib/parlay-calc";
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

/**
 * ODDS RANGE + PRICE SORT (2026-09-19, Josh, verbatim: "Need to be able to sort 'Every pick today'
 * underneath parlay builder by odds for example I should be able to go in under the CFB Anytime TD
 * filter and then filter between -200 to +250 for players or whatever other odds I want").
 *
 * American prices order numerically the way a bettor reads them: -200 is shorter than -150, which
 * is shorter than +100, which is shorter than +250. So a range is two bounds on the posted price
 * (an open bound, null, is no bound) and a price sort is a numeric sort on it — no conversion, no
 * second scale. The range narrows the chips' counts too, so "Anytime TD 41" is the count inside
 * the range. Nothing here prices anything: the rows arrive priced from the page.
 */
export type OddsRange = { min: number | null; max: number | null };
export const OPEN_RANGE: OddsRange = { min: null, max: null };
export type RankedSort = "grade" | "shortest" | "longest";
export const RANKED_SORTS: readonly { key: RankedSort; label: string }[] = [
  { key: "grade", label: "Grade S → F" },
  { key: "shortest", label: "Shortest price first" },
  { key: "longest", label: "Longest price first" },
];
export function inOddsRange(am: number, r: OddsRange): boolean {
  if (!Number.isFinite(am)) return false;
  return (r.min == null || am >= r.min) && (r.max == null || am <= r.max);
}
export function rangeText(r: OddsRange): string | null {
  if (r.min == null && r.max == null) return null;
  if (r.min != null && r.max != null) return `${amFmt(r.min)} to ${amFmt(r.max)}`;
  return r.min != null ? `${amFmt(r.min)} or longer` : `${amFmt(r.max as number)} or shorter`;
}
/** grade: S first, then EV, then name (the list's default); shortest / longest: the posted price, ties by grade */
export function sortRanked<T extends { grade: Grade | null; ev: number; am: number; label: string }>(rows: readonly T[], sort: RankedSort): T[] {
  const byGrade = (a: T, b: T) => gradeRank(b.grade) - gradeRank(a.grade) || b.ev - a.ev || a.label.localeCompare(b.label);
  const out = [...rows];
  if (sort === "shortest") return out.sort((a, b) => a.am - b.am || byGrade(a, b));
  if (sort === "longest") return out.sort((a, b) => b.am - a.am || byGrade(a, b));
  return out.sort(byGrade);
}

/** one bound of the range: an American price or empty; commits on every valid keystroke, snaps back on blur */
function AmField({ value, onCommit, placeholder, label, testId }: { value: number | null; onCommit: (v: number | null) => void; placeholder: string; label: string; testId: string }) {
  const [txt, setTxt] = useState(value == null ? "" : amFmt(value));
  useEffect(() => setTxt(value == null ? "" : amFmt(value)), [value]);
  const bad = txt.trim() !== "" && parseAmerican(txt) == null;
  return (
    <input
      value={txt}
      onChange={(e) => {
        const t = e.target.value;
        setTxt(t);
        if (t.trim() === "") {
          onCommit(null);
          return;
        }
        const n = parseAmerican(t);
        if (n != null) onCommit(n);
      }}
      onBlur={() => setTxt(value == null ? "" : amFmt(value))}
      inputMode="numeric"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={bad}
      data-testid={testId}
      className={`num h-8 w-[66px] shrink-0 rounded-[8px] border bg-surface-2 px-1.5 text-center text-[12px] font-semibold text-text outline-none placeholder:text-faint ${
        bad ? "border-gold/60" : "border-white/[0.08] focus:border-pos/50"
      }`}
    />
  );
}

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
  range: rangeProp,
  onRange,
  sort: sortProp,
  onSort,
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
  /** the odds range and the price sort (2026-09-19) — controlled the same way, or the list keeps its own */
  range?: OddsRange;
  onRange?: (r: OddsRange) => void;
  sort?: RankedSort;
  onSort?: (s: RankedSort) => void;
}) {
  const [own, setOwn] = useState<string>("all");
  const filter = filterProp ?? own;
  const [ownRange, setOwnRange] = useState<OddsRange>(OPEN_RANGE);
  const range = rangeProp ?? ownRange;
  const [ownSort, setOwnSort] = useState<RankedSort>("grade");
  const sort = sortProp ?? ownSort;
  const [limit, setLimit] = useState(RANKED_PAGE);
  const graded = useMemo(
    () =>
      picks
        .map((p) => ({ ...p, grade: gradeFromEv(p.ev) }))
        .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || b.ev - a.ev || a.label.localeCompare(b.label)),
    [picks],
  );
  /* the odds range first: the chips count what is inside it, so a category's number is what the range would show */
  const ranged = useMemo(() => (range.min == null && range.max == null ? graded : graded.filter((p) => inOddsRange(p.am, range))), [graded, range]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of ranged) m.set(p.market, (m.get(p.market) ?? 0) + 1);
    return m;
  }, [ranged]);
  const shown = useMemo(() => sortRanked(filter === "all" ? ranged : ranged.filter((p) => p.market === filter), sort), [ranged, filter, sort]);
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
  const setRange = (r: OddsRange) => {
    setOwnRange(r);
    onRange?.(r);
    setLimit(RANKED_PAGE);
  };
  const setSort = (s: RankedSort) => {
    setOwnSort(s);
    onSort?.(s);
    setLimit(RANKED_PAGE);
  };
  const rangeLabel = rangeText(range);
  const visible = shown.slice(0, limit);
  return (
    <section data-testid="ranked-picks" className="glass overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-faint">Every pick today</div>
          <div className="text-[13px] font-bold tracking-tight text-text">
            {sort === "grade" ? "Ranked S → F" : sort === "shortest" ? "Shortest price first" : "Longest price first"}
            {filter !== "all" && <span className="text-muted"> · {labelOf(filter)}</span>}
            {rangeLabel && <span className="num text-muted"> · {rangeLabel}</span>}
          </div>
        </div>
        <div className="num flex shrink-0 flex-wrap justify-end gap-x-2 text-[9.5px] text-faint" aria-label="Picks per tier">
          {TIERS.map((t) => (tiers.get(t) ? <span key={t}><b className="text-text">{t}</b> {tiers.get(t)}</span> : null))}
        </div>
      </header>
      <div role="tablist" aria-label="Pick category" className="mt-2 flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
        <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => pick("all")}
          className={`press h-7 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold ${filter === "all" ? ON[accent] : "border-white/[0.08] bg-surface-2 text-muted"}`}>
          All <span className="num opacity-70">{ranged.length}</span>
        </button>
        {filters.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => pick(f.key)}
            className={`press h-7 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold ${filter === f.key ? ON[accent] : "border-white/[0.08] bg-surface-2 text-muted"} ${counts.get(f.key) ? "" : "opacity-40"}`}>
            {f.label} <span className="num opacity-70">{counts.get(f.key) ?? 0}</span>
          </button>
        ))}
      </div>
      {/* the odds range and the price sort — one thin row under the chips, thumb-sized on the phone */}
      <div data-testid="ranked-odds-row" className="flex items-center gap-1.5 px-3 pb-2 text-[10px] text-faint">
        <span className="shrink-0 font-bold uppercase tracking-[0.12em]">Odds</span>
        <AmField value={range.min} onCommit={(v) => setRange({ ...range, min: v })} placeholder="-200" label="Shortest price to show" testId="ranked-odds-min" />
        <span className="shrink-0">to</span>
        <AmField value={range.max} onCommit={(v) => setRange({ ...range, max: v })} placeholder="+250" label="Longest price to show" testId="ranked-odds-max" />
        {rangeLabel && (
          <button type="button" onClick={() => setRange(OPEN_RANGE)} aria-label="Clear odds range" className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-surface-2 text-[13px] text-muted">
            ×
          </button>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as RankedSort)}
          aria-label="Sort picks"
          data-testid="ranked-sort"
          className="num ml-auto h-8 min-w-0 max-w-[46%] rounded-[8px] border border-white/[0.08] bg-surface-2 px-2 text-[11px] font-semibold text-text outline-none"
        >
          {RANKED_SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>
      {/* a slate still pricing behind rows already on the page (a cold Saturday pull is up to 60 event calls): say so, instead of a list that looks finished */}
      {loading && graded.length > 0 && (
        <div role="status" data-testid="ranked-still-pricing" className="px-3 pb-2 text-[10.5px] text-muted">
          Still pricing this slate — more picks land as the feed answers.
        </div>
      )}
      {loading && graded.length === 0 ? (
        <div className="px-3 pb-3 text-[11px] text-muted">Loading the board…</div>
      ) : shown.length === 0 ? (
        <div className="px-3 pb-3 text-[11px] text-muted">
          {ranged.length === 0 && graded.length > 0 && rangeLabel ? `No pick is priced ${rangeLabel} — widen the odds range.` : emptyBody}
        </div>
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
