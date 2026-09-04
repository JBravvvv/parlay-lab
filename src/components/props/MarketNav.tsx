"use client";

import { useEffect, useRef, useState } from "react";
import { MARKETS, TABS, type TabKey } from "./props-model";

/**
 * Two-row market navigation, sticky under the app's top bar on mobile:
 *   row 1 — Games / Batter Props / Pitcher Props segmented control
 *   row 2 — a horizontally scrolling pill rail (snap, momentum, no scrollbar,
 *           fade at the right edge while there is more to scroll)
 *   row 3 — (batter/pitcher only) the compact player search + line count
 */
export function MarketNav({
  tab,
  mktKey,
  onTab,
  onMarket,
  top,
  search,
  onSearch,
  count,
}: {
  tab: TabKey;
  mktKey: string;
  onTab: (t: TabKey) => void;
  onMarket: (k: string) => void;
  /** px offset of the AppShell's mobile top bar (0 on desktop) */
  top: number;
  /** null hides the search row (game markets / unpriced markets) */
  search: string | null;
  onSearch: (s: string) => void;
  count: { lines: number; games: number };
}) {
  return (
    <div
      className="sticky z-20 -mx-4 mb-2 border-b border-white/[0.06] bg-bg/85 px-4 pb-2 pt-1 backdrop-blur-xl md:mx-0 md:rounded-b-[16px] md:px-0"
      style={{ top }}
    >
      <Segmented tab={tab} onTab={onTab} />
      <MarketRail tab={tab} mktKey={mktKey} onMarket={onMarket} />
      {search != null && (
        <SearchBox value={search} onChange={onSearch} lines={count.lines} games={count.games} />
      )}
    </div>
  );
}

function Segmented({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  return (
    <div className="grid h-[34px] grid-cols-3 rounded-[10px] border border-white/[0.06] bg-surface-2/80 p-[3px]" role="tablist">
      {TABS.map((t) => {
        const on = tab === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.key)}
            className={`rounded-[8px] text-[11.5px] font-semibold transition-colors duration-(--dur-fast) ${
              on ? "bg-pos/15 text-pos shadow-[inset_0_0_0_1px_rgba(182,255,61,0.35)]" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MarketRail({ tab, mktKey, onMarket }: { tab: TabKey; mktKey: string; onMarket: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  /* the fade shows only while there is rail left to scroll; re-measure when the
     tab's pill set changes (a different tab has a different rail width) */
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  /* keep the active pill in view (e.g. after switching tabs) */
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-mkt="${mktKey}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [mktKey, tab]);

  return (
    <div className="relative mt-2">
      <div
        ref={ref}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
      >
        {MARKETS[tab].map((m) => {
          const on = mktKey === m.key;
          return (
            <button
              key={m.key}
              data-mkt={m.key}
              aria-pressed={on}
              onClick={() => onMarket(m.key)}
              className={`h-[30px] shrink-0 snap-start whitespace-nowrap rounded-full border px-3 text-[11.5px] font-semibold transition-[transform,background,color,border-color] duration-(--dur-fast) active:scale-[0.96] ${
                on
                  ? "border-pos bg-pos text-bg"
                  : m.cat
                    ? "border-line-2 bg-white/[0.03] text-muted hover:text-text"
                    : "border-line bg-transparent text-faint"
              }`}
            >
              {m.label}
            </button>
          );
        })}
        {/* trailing spacer so the last pill can clear the fade */}
        <span className="w-6 shrink-0" aria-hidden />
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-14 bg-linear-to-l from-bg/85 to-transparent transition-opacity duration-(--dur-fast) ${
          more ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  lines,
  games,
}: {
  value: string;
  onChange: (s: string) => void;
  lines: number;
  games: number;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-surface-2 px-2.5 focus-within:border-pos/50">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-faint" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search players…"
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
        />
        {value && (
          <button
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] text-muted"
          >
            ✕
          </button>
        )}
      </label>
      <span className="num shrink-0 text-right text-[10px] leading-tight text-faint">
        {lines} line{lines === 1 ? "" : "s"}
        <br />
        {games} game{games === 1 ? "" : "s"}
      </span>
    </div>
  );
}
