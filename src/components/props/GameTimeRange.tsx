"use client";
import { hourLabel, type GameTimeWindow } from "@/lib/game-time-window";
export function GameTimeRange({ value = [0, 24], onChange }: { value?: GameTimeWindow; onChange: (value: GameTimeWindow) => void }) {
  const [lo, hi] = value;
  const thumb = "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pos [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-pos";
  return <fieldset className="min-w-0 rounded-lg border border-white/10 px-2 py-1">
    <legend className="text-[9px] text-muted">Game start · Pacific time</legend>
    <div className="flex justify-between text-[10px] text-text"><span>{hourLabel(lo)}</span><span>{hourLabel(hi)}</span></div>
    <div className="relative h-6"><div className="absolute inset-x-0 top-3 h-px bg-white/20" />
      <input type="range" aria-label="Earliest game start" aria-valuetext={hourLabel(lo)} min={0} max={24} step={1} value={lo} onChange={e => onChange([Math.min(Number(e.target.value), hi - 1), hi])} className={thumb} />
      <input type="range" aria-label="Latest game start" aria-valuetext={hourLabel(hi)} min={0} max={24} step={1} value={hi} onChange={e => onChange([lo, Math.max(Number(e.target.value), lo + 1)])} className={thumb} />
    </div>
  </fieldset>;
}
