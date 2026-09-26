"use client";
import type { ComponentProps } from "react";
import { DiscoveryFilters } from "@/components/props/DiscoveryFilters";
import { defaultMarkets } from "@/lib/market-scope";
import { STRATEGIES } from "@/lib/discovery";
import { hourLabel } from "@/lib/game-time-window";

/** Category remains visible; optional discovery controls open together on demand. */
export function BoardFilters(props: ComponentProps<typeof DiscoveryFilters>) {
  const { value, markets } = props;
  const defaults=defaultMarkets(markets,value.sports);
  const changed = [
    value.odds?.min != null || value.odds?.max != null,
    value.timing.length !== 2,
    value.markets.length !== defaults.length || value.markets.some(m=>!defaults.includes(m)),
    value.strategies.length !== STRATEGIES.length,
    value.sports.length !== 1,
    value.timeWindow?.[0] !== 0 || value.timeWindow?.[1] !== 24,
  ].filter(Boolean).length;
  const timing = value.timing.length === 2 ? "Pregame + live" : value.timing.length ? value.timing[0] === "live" ? "Live" : "Pregame" : "No timing";
  const hours = value.timeWindow && (value.timeWindow[0] !== 0 || value.timeWindow[1] !== 24) ? `${hourLabel(value.timeWindow[0])}–${hourLabel(value.timeWindow[1])}` : "All game times";
  return <details className="board-filters">
    <summary><span className="board-filter-icon" aria-hidden>☷</span><span><strong>Customize picks</strong><small>Categories & odds · {timing} · {hours}</small></span><b>{changed ? `${changed} active` : "Filters"}</b><span className="board-filter-chevron" aria-hidden>⌄</span></summary>
    <DiscoveryFilters {...props}/>
  </details>;
}
