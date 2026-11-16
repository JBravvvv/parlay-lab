"use client";
import { useMemo, useState, type ReactNode } from "react";
import { CrossMark } from "./CrossMark";
import { AskClaude } from "@/components/anytime/AskClaude";
import { ticketPrompt } from "@/lib/ask-claude";
import type { CrossLeg } from "@/lib/cross-sport";
import { gameTimeLabel } from "@/lib/game-time-window";
import { openOptions, type GenLeg, type GenPool, type GenSpec, type OpenOptions } from "@/lib/parlay-gen";
import { parseBoardLabel } from "@/lib/player-card";
import { amFmt } from "@/lib/ticket-math";

/**
 * EVERY PICK THAT FITS (2026-11-15, Josh, verbatim: "when on parlay builder, after generating picks
 * etc. i should be able to click a button or dropdown that displays all possible picks in those
 * filters so if i have 3/4 picks i like & I keep spinning to get the same 5 or 6 guys as my 4th leg
 * on the parlay, i can click that to see if there are only 6 options or 20 options to help make my
 * last leg decision easier").
 *
 * A fold under the ticket. Its header always carries the count, so "6 or 20" is answered before it
 * is even opened; open, it lists every leg a spin could put in an open slot, read from the very
 * sets the generator draws from (openOptions). Read-only: it changes no filter, no lock and no
 * ticket, and prints only prices and estimates the pool already carries.
 */

export const OPTIONS_SHOWN = 150;

export type OptionSort = "chance" | "short" | "long";
export const OPTION_SORTS: readonly { value: OptionSort; label: string }[] = [
  { value: "chance", label: "Best chance first" },
  { value: "short", label: "Shortest odds first" },
  { value: "long", label: "Longest odds first" },
];

/** a stable order for the list: the chosen key, then the player's name, then the leg id */
export function sortOptions<P>(legs: readonly GenLeg<P>[], sort: OptionSort): GenLeg<P>[] {
  const key = (l: GenLeg<P>) => (sort === "chance" ? -l.prob : sort === "short" ? l.dec : -l.dec);
  return legs.slice().sort((a, b) => key(a) - key(b) || a.label.localeCompare(b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** the fold's header, in words: what the list is for, and how many picks and players are in it */
export function optionsTitle(o: Pick<OpenOptions, "legs" | "players" | "locked" | "open">): { lead: string; count: string } {
  if (o.open <= 0) return { lead: "Every slot is locked", count: "unlock one to see what else fits" };
  const lead = o.locked > 0 ? `Every pick that fits your ${plural(o.open, "open slot")}` : "Every pick that fits these filters";
  return { lead, count: o.legs.length ? `${plural(o.legs.length, "pick")} · ${plural(o.players, "player")}` : "none" };
}

const NO_LEGS: readonly GenLeg<never>[] = [];

type Part<P> = (a: { leg: P; gen: GenLeg<P>; name: string; team: string | null }) => ReactNode;

export function GenOptions<P>({ pool, spec, ticketIds, ticket = NO_LEGS, renderMark, startOpen = false }: {
  pool: GenPool<P>;
  spec: GenSpec;
  /** the legs on the ticket now, so the list can mark the ones already showing */
  ticketIds: readonly string[];
  /** the ticket's own legs in slot order (a held leg may have left the pool), for the Ask Claude question */
  ticket?: readonly GenLeg<P>[];
  renderMark: Part<P>;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [sort, setSort] = useState<OptionSort>("chance");
  const options = useMemo(() => openOptions(pool, spec), [pool, spec]);
  const sorted = useMemo(() => (open ? sortOptions(options.legs, sort) : []), [open, options, sort]);
  const onTicket = useMemo(() => new Set(ticketIds), [ticketIds]);
  const title = optionsTitle(options);
  const shown = sorted.slice(0, OPTIONS_SHOWN);
  /* the question for Claude: the ticket as it stands, then what could fill the open slots, best chance first */
  const ask = useMemo(() => (ticket.length || options.legs.length ? ticketPrompt({
    legs: ticket,
    lockedIdx: ticket.flatMap((l, i) => (spec.pinned[i] === l.id ? [i] : [])),
    options: sortOptions(options.legs, "chance"),
    open: options.open,
  }) : null), [ticket, options, spec.pinned]);
  return (
    <section data-testid="gen-options" className="mt-2 rounded-[12px] border border-white/[0.09] bg-surface-2/60">
      <button type="button" aria-expanded={open} aria-controls="gen-options-list" onClick={() => setOpen((v) => !v)}
        className="press flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-bold text-text">{title.lead}</span>
          <span data-testid="gen-options-count" className="num block truncate text-[10.5px] font-semibold text-pos">{title.count}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[10px] font-bold text-muted">{open ? "Hide ▴" : "Show ▾"}</span>
      </button>
      {ask && (
        <div className="border-t border-white/[0.06] px-2.5 py-1.5">
          <AskClaude label={options.open > 0 && options.legs.length ? "Ask Claude which pick to take" : "Ask Claude about this parlay"} prompt={ask} />
        </div>
      )}
      {open && (
        <div id="gen-options-list" className="border-t border-white/[0.06] px-2.5 pb-2 pt-1.5">
          {options.open <= 0 ? (
            <p className="text-[10.5px] text-muted">All {options.locked} slots are locked, so a spin has nothing to change. Unlock a slot and this list shows every pick that could take it.</p>
          ) : !options.legs.length ? (
            <p className="text-[10.5px] text-gold">No pick on this board fits {options.locked > 0 ? "beside your locked picks" : "these filters"}. Widen the odds, add a market or game, or unlock a pick.</p>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-muted">
                  Sort
                  <select aria-label="Sort the possible picks" value={sort} onChange={(e) => setSort(e.target.value as OptionSort)}
                    className="h-8 rounded-lg border border-white/15 bg-surface-2 px-1.5 text-[11px] font-semibold text-text">
                    {OPTION_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                {options.locked > 0 && <span className="text-[9.5px] text-faint">beside your {plural(options.locked, "locked pick")}</span>}
              </div>
              <ul className="max-h-[22rem] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                {shown.map((l) => {
                  const parsed = parseBoardLabel(l.label);
                  const name = parsed?.name ?? l.label;
                  const team = parsed?.team ?? l.team;
                  const cross = (l.leg as { cross?: CrossLeg }).cross;
                  return (
                    <li key={l.id} data-gen-option={l.id} className="flex items-center gap-2 rounded-[10px] border border-white/[0.06] bg-bg/40 px-2 py-1.5">
                      {cross ? <CrossMark leg={cross} /> : renderMark({ leg: l.leg, gen: l, name, team })}
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="truncate text-[12px] font-semibold text-text">{name}</span>
                          {onTicket.has(l.id) && <span className="shrink-0 rounded-full bg-pos/15 px-1.5 text-[8.5px] font-bold uppercase text-pos">on ticket</span>}
                        </div>
                        <div className="flex items-center gap-1 truncate text-[10px] text-muted">
                          <span className="truncate">{l.sub}</span>
                          {l.alt && <span className="shrink-0 rounded-[4px] border border-line-2 px-1 text-[8px] font-bold uppercase text-faint">alt</span>}
                          {l.started && <span className="shrink-0 text-live">live</span>}
                        </div>
                        {l.gameLabel && <div className="truncate text-[9px] text-faint">{l.gameLabel} · {gameTimeLabel(l.start)}</div>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end leading-none">
                        <span className="num text-[13px] font-semibold text-pos">{amFmt(l.am)}</span>
                        <span className="mt-1 text-[8.5px] text-muted">{l.src === "market" ? "Mkt est." : "Model"} <strong className="num text-text">{l.prob.toFixed(1)}%</strong></span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {sorted.length > shown.length && <p className="mt-1 text-[9.5px] text-faint">Showing the first {shown.length} of {sorted.length}. Narrow the filters to see the rest.</p>}
              <p className="mt-1.5 text-[9.5px] leading-snug text-faint">
                These are all the picks a spin can draw from with your filters{options.locked > 0 ? " and locked picks" : ""}. A spin favors some over others, so a short list here is why the same names keep coming up. Estimates, not certainties.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
