"use client";
import { startTransition, useEffect, useRef, useState } from "react";
import { ALL_DAY, DEFAULT_TIME_BOUNDS, hourLabel, TIME_STEP, type GameTimeWindow } from "@/lib/game-time-window";

/**
 * The game-start window (2026-09-26, Josh: "needs to have immediate response and drag with cursor as I drag it not
 * delayed. Should go in 30 minute increments ... should start at 9am" / "doesn't need to be that long").
 *
 * The thumbs and labels run on a LOCAL draft, so dragging repaints only this fieldset. The window is handed up once,
 * when the drag ends (the native `change` event, which fires on pointer release and on each key step), inside a
 * transition — the pool filter and the generator never run mid-drag. Both thumbs at the track's ends hand up the
 * ALL_DAY sentinel, so a start-less row or an off-track game is never dropped by an untouched slider.
 */
export function GameTimeRange({ value = ALL_DAY, onChange, bounds = DEFAULT_TIME_BOUNDS }: { value?: GameTimeWindow; onChange: (value: GameTimeWindow) => void; bounds?: GameTimeWindow }) {
  const [min, max] = bounds;
  const [draft, setDraftState] = useState<GameTimeWindow | null>(null);
  /* the ref is written in the input handler itself, so a key step's `change` can never commit a stale draft */
  const draftRef = useRef<GameTimeWindow | null>(null);
  const setDraft = (w: GameTimeWindow | null) => { draftRef.current = w; setDraftState(w); };
  const loRef = useRef<HTMLInputElement>(null);
  const hiRef = useRef<HTMLInputElement>(null);
  const clamp = (w: GameTimeWindow): GameTimeWindow => {
    const lo = Math.min(Math.max(w[0], min), max - TIME_STEP);
    return [lo, Math.max(Math.min(w[1], max), lo + TIME_STEP)];
  };
  const [lo, hi] = clamp(draft ?? value);
  /* a committed (or reset / loaded) window replaces the draft */
  useEffect(() => { draftRef.current = null; setDraftState(null); }, [value[0], value[1]]);
  const commit = useRef<() => void>(() => {});
  commit.current = () => {
    const d = draftRef.current;
    if (!d) return;
    const next: GameTimeWindow = d[0] <= min && d[1] >= max ? ALL_DAY : d;
    if (next[0] === value[0] && next[1] === value[1]) return setDraft(null);
    draftRef.current = null; // handed up once; the painted draft stays until the new value arrives
    startTransition(() => onChange(next));
  };
  useEffect(() => {
    const done = () => commit.current();
    const els = [loRef.current, hiRef.current];
    for (const el of els) el?.addEventListener("change", done);
    return () => { for (const el of els) el?.removeEventListener("change", done); };
  }, []);
  const pct = (h: number) => ((h - min) / (max - min)) * 100;
  const thumb = "pointer-events-none absolute inset-0 h-7 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-pos [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(58,176,232,0.18)] active:[&::-webkit-slider-thumb]:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white/80 [&::-moz-range-thumb]:bg-pos";
  return <fieldset data-testid="game-time-range" className="game-time-range w-full min-w-0 max-w-[15rem] rounded-lg border border-white/10 px-2 py-1">
    <legend className="text-[9px] text-muted">Game start · Pacific time</legend>
    <div className="num flex justify-between text-[10px] text-text" aria-live="off"><span>{hourLabel(lo)}</span><span>{hourLabel(hi)}</span></div>
    <div className="relative h-7">
      <div className="absolute inset-x-2.5 top-[13px] h-[3px] rounded-full bg-white/15" />
      <div className="absolute top-[13px] h-[3px] rounded-full bg-pos" style={{ left: `calc(10px + ${pct(lo)}% - ${pct(lo) * 0.2}px)`, right: `calc(10px + ${100 - pct(hi)}% - ${(100 - pct(hi)) * 0.2}px)` }} />
      <input ref={loRef} type="range" aria-label="Earliest game start" aria-valuetext={hourLabel(lo)} min={min} max={max} step={TIME_STEP} value={lo}
        onChange={e => setDraft([Math.min(Number(e.target.value), hi - TIME_STEP), hi])} onBlur={() => commit.current()}
        style={{ zIndex: lo > (min + max) / 2 ? 2 : 1 }} className={thumb} />
      <input ref={hiRef} type="range" aria-label="Latest game start" aria-valuetext={hourLabel(hi)} min={min} max={max} step={TIME_STEP} value={hi}
        onChange={e => setDraft([lo, Math.max(Number(e.target.value), lo + TIME_STEP)])} onBlur={() => commit.current()}
        className={thumb} />
    </div>
  </fieldset>;
}
