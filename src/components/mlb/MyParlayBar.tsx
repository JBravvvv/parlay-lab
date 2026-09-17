"use client";
/**
 * INSTRUCTION 71 (2026-09-17): the Board's "My parlay" bar. Tap "+" on any board row or on any
 * generated-ticket leg and the bar prices the ticket the way the engine prices its own — the
 * selected book's odds multiplied out, the engine's true % multiplied out, EV = true × dec − 1.
 * Same layout family as the Builder's slip (fixed bottom sheet, expand/collapse, Clear).
 */
import { useState } from "react";
import { BoardLabel } from "@/components/player/PlayerName";
import { useShellInsets } from "@/components/props/useShellInsets";
import { evPct, readMyParlay, type MyLeg } from "@/lib/my-parlay";
import { amFmt } from "@/lib/ticket-math";
import { PARLAY_VARIETY } from "@/lib/env-adjust";

function Stat({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" | "gold" }) {
  const cls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-red-400" : tone === "gold" ? "text-gold" : "text-text";
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">{k}</div>
      <div className={`num text-[15px] font-bold ${cls}`}>{v}</div>
    </div>
  );
}

export function MyParlayBar({
  legs,
  onRemove,
  onClear,
  bottom,
}: {
  legs: MyLeg[];
  onRemove: (key: string) => void;
  onClear: () => void;
  /** px height of the AppShell's mobile tab bar (0 on desktop); measured by the page when omitted */
  bottom?: number;
}) {
  const ins = useShellInsets();
  const [open, setOpen] = useState(true);
  const read = readMyParlay(legs, PARLAY_VARIETY.parlayGameCap);
  const c = read.calc;
  if (legs.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-40 md:left-[calc(200px+2rem)] md:right-8"
      style={{ bottom: bottom ?? ins.bottom }}
      data-testid="my-parlay-bar"
    >
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="pointer-events-auto flex max-h-[50vh] max-w-[760px] flex-col px-3 pb-2 md:px-0 md:pb-4">
          <div className="flex max-h-full flex-col overflow-hidden rounded-[16px] border border-white/[0.12] bg-surface/95 shadow-2xl backdrop-blur-xl">
            <div className="flex h-12 shrink-0 items-center gap-1 pr-1">
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} my parlay`}
              >
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-bg">
                  {legs.length}
                </span>
                <span className="num min-w-0 flex-1 truncate text-[12px] text-text">
                  <span className="font-semibold">My parlay</span> · {legs.length} leg{legs.length === 1 ? "" : "s"}
                  {c ? (
                    <>
                      {" "}· <b className="text-gold">{amFmt(c.am)}</b> · <span className="text-muted">EV</span>{" "}
                      <b className={c.ev >= 0 ? "text-pos" : "text-red-400"}>{evPct(c.ev)}</b>
                    </>
                  ) : (
                    <span className="text-muted"> · no priced legs yet</span>
                  )}
                </span>
              </button>
              <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold text-muted hover:text-text" onClick={onClear}>
                Clear
              </button>
            </div>

            {open && (
              <div className="min-h-0 overflow-y-auto border-t border-white/[0.08] px-3 pb-3 pt-2">
                <div className="grid grid-cols-4 gap-3">
                  <Stat k="Odds @ book" v={c ? amFmt(c.am) : "—"} tone="gold" />
                  <Stat k="True %" v={c ? `${(c.trueProb * 100).toFixed(1)}%` : "—"} tone={c && c.trueProb > c.impProb ? "pos" : undefined} />
                  <Stat k="Implied" v={c ? `${(c.impProb * 100).toFixed(1)}%` : "—"} />
                  <Stat k="EV" v={c ? evPct(c.ev) : "—"} tone={c ? (c.ev >= 0 ? "pos" : "neg") : undefined} />
                </div>
                <div className="mt-1.5 text-[10.5px] text-faint">
                  {c ? (
                    <>
                      Fair {read.fairAm != null ? amFmt(read.fairAm) : "—"} · $100 → ${Math.round(c.payout(100) - 100)} to win · the engine&apos;s own
                      ticket math (true % × price − 1, legs independent)
                    </>
                  ) : (
                    "add a priced leg to see the engine's ticket math"
                  )}
                </div>
                {read.sameGame.length > 0 && (
                  <div className="mt-1 text-[10.5px] text-gold" data-testid="my-parlay-same-game">
                    {read.overCap.length > 0
                      ? `${read.overCap.map((g) => `${g.n} legs from one game`).join(", ")} — the engine caps its own tickets at ${PARLAY_VARIETY.parlayGameCap} per game; `
                      : `${read.sameGame.length} game${read.sameGame.length === 1 ? "" : "s"} with two legs — `}
                    same-game correlation is not modelled here, so the true % reads high on stacked legs.
                  </div>
                )}
                {read.skipped.length > 0 && (
                  <div className="mt-1 text-[10.5px] text-muted">
                    {read.skipped.length} leg{read.skipped.length === 1 ? "" : "s"} left out of the math: {read.skipped.map((s) => `${s.leg.label} (${s.why})`).join("; ")}
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-[12px]">
                  {legs.map((l) => (
                    <li key={l.key} className="flex items-center gap-2" data-testid="my-parlay-leg">
                      <span className="min-w-0 flex-1 truncate text-text">
                        <BoardLabel label={l.label} /> <span className="text-muted">· {l.sub}</span>
                      </span>
                      <span className="num shrink-0 text-[11px] text-muted">
                        {l.odds != null ? amFmt(l.odds) : "no price"} · {l.prob != null ? `${l.prob.toFixed(1)}%` : "—"}
                      </span>
                      <button
                        type="button"
                        className="h-6 w-6 shrink-0 rounded-full text-[12px] text-muted hover:bg-white/[0.06] hover:text-text"
                        aria-label={`Remove ${l.label} ${l.sub}`}
                        onClick={() => onRemove(l.key)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** the "+" cell every board row and ticket leg carries — one component so the two look identical */
export function MyToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={on}
      aria-label={`${on ? "Remove from" : "Add to"} my parlay: ${label}`}
      title={on ? "Remove from my parlay" : "Add to my parlay — see the engine's edge on your own ticket"}
      data-my-toggle={on ? "on" : "off"}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[13px] font-bold leading-none transition ${
        on ? "border-gold bg-gold text-bg" : "border-line-2 text-muted hover:border-gold hover:text-gold"
      }`}
    >
      {on ? "✓" : "+"}
    </button>
  );
}
