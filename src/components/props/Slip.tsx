"use client";

import { useState } from "react";
import { amFmt, decToAm, type SandboxLeg, type TicketCalc } from "@/lib/ticket-math";
import { BoardLabel } from "@/components/player/PlayerName";

/**
 * The ticket slip as a bottom sheet. Collapsed by default: a one-line handle
 * ("3 legs · +1240 · true 8.1%") that sits right above the tab bar. Tapping it
 * expands the leg list + the ticket math; the whole sheet never exceeds 45vh
 * (the list scrolls inside it). Odds / True / EV / payout math is combineTicket's,
 * untouched; "Fair (true)" is that same true % expressed as an american price —
 * the break-even price for the ticket, NOT a posted quote from any book.
 *
 * On md+ the sheet is aligned to the content column (AppShell: md:ml-[200px]
 * md:px-8, inner mx-auto max-w-[1280px]) so it shares the cards' left edge.
 */
export function Slip({
  legs,
  calc,
  stake,
  onStake,
  onRemove,
  onClear,
  bottom,
}: {
  legs: SandboxLeg[];
  calc: TicketCalc;
  stake: number;
  onStake: (n: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** px height of the AppShell's mobile tab bar (0 on desktop) */
  bottom: number;
}) {
  const [open, setOpen] = useState(false);
  const anyMarketProb = legs.some((l) => l.src === "market");
  const fairAm = calc.trueProb > 0 ? decToAm(1 / calc.trueProb) : null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 z-40 md:left-[calc(200px+2rem)] md:right-8" style={{ bottom }}>
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="pointer-events-auto flex max-h-[45vh] max-w-[720px] flex-col px-3 pb-2 md:px-0 md:pb-4">
          <div className="flex max-h-full flex-col overflow-hidden rounded-[16px] border border-white/[0.12] bg-surface/95 shadow-2xl backdrop-blur-xl">
          {/* handle — a row of two sibling buttons (expand/collapse, Clear), never nested */}
          <div className="flex h-12 shrink-0 items-center gap-1 pr-1">
            <button
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Collapse" : "Expand"} slip`}
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-pos px-1.5 text-[11px] font-bold text-bg">
                {calc.n}
              </span>
              <span className="num min-w-0 flex-1 truncate text-[12px] text-text">
                {calc.n} leg{calc.n > 1 ? "s" : ""} · <b className="text-pos">{amFmt(calc.am)}</b> ·{" "}
                <span className="text-muted">true</span>{" "}
                <b className={calc.trueProb > calc.impProb ? "text-pos" : "text-text"}>{(calc.trueProb * 100).toFixed(1)}%</b>
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={`shrink-0 text-muted transition-transform duration-(--dur-fast) ${open ? "rotate-180" : ""}`}
                aria-hidden
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              className="h-8 shrink-0 rounded-full px-2.5 text-[10.5px] font-semibold text-neg hover:bg-neg/10"
              onClick={onClear}
            >
              Clear
            </button>
          </div>

          {open && (
            <>
              {/* legs — the only part that scrolls */}
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] px-3 py-1">
                {legs.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 border-b border-white/[0.04] py-1.5 text-[11.5px] last:border-b-0">
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-text">
                        <BoardLabel label={l.label} /> <span className="text-muted">{l.sub}</span>
                      </span>
                      <span className="block truncate text-[9.5px] text-faint">{l.game.split(" · ")[0]}</span>
                    </span>
                    <span className={`num shrink-0 text-[11px] text-muted ${l.src === "market" ? "italic" : ""}`}>
                      {l.prob.toFixed(1)}%
                    </span>
                    <span className="num w-[52px] shrink-0 text-right text-pos">
                      {amFmt(l.cz)}
                      {l.book && l.book !== "CZ" && <span className="ml-0.5 text-[8.5px] uppercase text-faint">{l.book}</span>}
                    </span>
                    <button
                      aria-label={`Remove ${l.label}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] text-neg hover:bg-neg/10"
                      onClick={() => onRemove(l.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* ticket math */}
              <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
                <div className="num grid grid-cols-4 gap-1 text-center">
                  <Stat label="Odds" value={amFmt(calc.am)} tone="pos" />
                  <Stat
                    label="True"
                    value={`${(calc.trueProb * 100).toFixed(1)}%`}
                    tone={calc.trueProb > calc.impProb ? "pos" : "text"}
                    sub={`imp ${(calc.impProb * 100).toFixed(1)}%`}
                  />
                  <Stat
                    label="EV"
                    value={`${calc.ev >= 0 ? "+" : ""}${(calc.ev * 100).toFixed(1)}%`}
                    tone={calc.ev >= 0 ? "pos" : "neg"}
                  />
                  <Stat label="Fair (true)" value={fairAm != null ? amFmt(fairAm) : "—"} tone="text" />
                </div>
                <div className="num mt-2 flex items-center justify-end gap-1.5 text-[12px]">
                  <span className="text-muted">$</span>
                  <input
                    type="number"
                    value={stake}
                    min={0}
                    inputMode="decimal"
                    onChange={(e) => onStake(Math.max(0, Number(e.target.value) || 0))}
                    className="h-8 w-[64px] rounded-[8px] border border-white/[0.08] bg-surface-2 px-2 text-right text-[12px] text-text"
                  />
                  <span className="text-muted">pays</span>
                  <b className="text-text">${calc.payout(stake).toFixed(2)}</b>
                </div>
                <div className="mt-1.5 text-[9.5px] leading-snug text-faint">
                  True % is the naive product — same-game legs are correlated and this sandbox does not model that.
                  {anyMarketProb && (
                    <> Italic legs use the market&apos;s own fair %, so their EV is ~0 by construction, not an edge.</>
                  )}{" "}
                  Fair (true) is the price at which that true % breaks even — a yardstick, not a posted quote.{" "}
                  Not tracked, never enters the ledger.
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "pos" | "neg" | "text" }) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-text";
  return (
    <div className="rounded-[8px] bg-white/[0.03] px-1 py-1.5 leading-none">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`mt-1 text-[13px] font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[8.5px] text-faint">{sub}</div>}
    </div>
  );
}
