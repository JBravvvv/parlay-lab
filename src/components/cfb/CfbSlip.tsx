"use client";

import { useEffect, useRef, useState } from "react";
import type { CfbMarketKey } from "@/lib/cfb/types";
import { amFmt, decToAm, type TicketCalc } from "@/lib/ticket-math";

/**
 * The College Football sandbox slip — the MLB Parlay Builder's bottom sheet on CFB legs.
 * Collapsed it is one line above the tab bar ("3 legs · +612 · true 14.1%"); open it lists
 * the legs (one side per game — CfbProps enforces that), the combined American / decimal /
 * true % / EV from `combineTicket`, a stake → pays line and a "Copy slip" button that hands
 * the ticket to the clipboard as text. Nothing here writes the ledger: the sandbox's
 * whole contract is that it is untracked.
 */

export type CfbSlipLeg = {
  /** the board row's key — the clash guard is `gameId`, one side per game */
  key: string;
  gameId: string;
  /** "Indiana -40.5" / "Over 56.5" — relabelled to the priced book's own line */
  label: string;
  /** "IND @ OSU · Sat 9:00 AM" */
  sub: string;
  market: CfbMarketKey;
  /** the American price the slip is priced at */
  cz: number;
  /** "CZ" for Caesars, else the book's short tag */
  book: string;
  /** model win probability at the priced line, PERCENT (0..100) */
  prob: number;
};

export function CfbSlip({
  legs,
  calc,
  stake,
  onStake,
  onRemove,
  onClear,
  bottom,
  copyText,
}: {
  legs: CfbSlipLeg[];
  calc: TicketCalc;
  stake: number;
  onStake: (n: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  /** px height of the AppShell's mobile tab bar (0 on desktop) */
  bottom: number;
  /** the slip as plain text for "Copy slip" */
  copyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const fairAm = calc.trueProb > 0 ? decToAm(1 / calc.trueProb) : null;
  const evPct = calc.ev * 100;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="pointer-events-none fixed left-0 right-0 z-40 md:left-[calc(200px+2rem)] md:right-8" style={{ bottom }}>
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="pointer-events-auto flex max-h-[45vh] max-w-[720px] flex-col px-3 pb-2 md:px-0 md:pb-4">
          <div className="flex max-h-full flex-col overflow-hidden rounded-[16px] border border-cfb/25 bg-surface/95 shadow-2xl backdrop-blur-xl">
            {/* handle — sibling buttons (expand/collapse, Clear), never nested */}
            <div className="flex h-12 shrink-0 items-center gap-1 pr-1">
              <button
                className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} slip`}
              >
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cfb px-1.5 text-[11px] font-bold text-[#131a26]">
                  {calc.n}
                </span>
                <span className="num min-w-0 flex-1 truncate text-[12px] text-text">
                  {calc.n} leg{calc.n > 1 ? "s" : ""} · <b className="text-cfb">{amFmt(calc.am)}</b> ·{" "}
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
              <button className="h-8 shrink-0 rounded-full px-2.5 text-[10.5px] font-semibold text-neg hover:bg-neg/10" onClick={onClear}>
                Clear
              </button>
            </div>

            {open && (
              <>
                {/* legs — the only part that scrolls */}
                <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] px-3 py-1">
                  {legs.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 border-b border-white/[0.04] py-1.5 text-[11.5px] last:border-b-0">
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-text">
                          {l.label} <span className="text-[9.5px] uppercase text-faint">{l.market === "ml" ? "ML" : l.market}</span>
                        </span>
                        <span className="block truncate text-[9.5px] text-faint">{l.sub}</span>
                      </span>
                      <span className="num shrink-0 text-[11px] text-muted">{l.prob.toFixed(1)}%</span>
                      <span className="num w-[58px] shrink-0 text-right text-cfb">
                        {amFmt(l.cz)}
                        {l.book !== "CZ" && <span className="ml-0.5 text-[8.5px] uppercase text-faint">{l.book}</span>}
                      </span>
                      <button
                        aria-label={`Remove ${l.label}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] text-neg hover:bg-neg/10"
                        onClick={() => onRemove(l.key)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* ticket math */}
                <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
                  <div className="num grid grid-cols-4 gap-1 text-center">
                    <Stat label="Odds" value={amFmt(calc.am)} sub={`${calc.dec.toFixed(2)}×`} tone="cfb" />
                    <Stat
                      label="True"
                      value={`${(calc.trueProb * 100).toFixed(1)}%`}
                      tone={calc.trueProb > calc.impProb ? "pos" : "text"}
                      sub={`imp ${(calc.impProb * 100).toFixed(1)}%`}
                    />
                    <Stat label="EV" value={`${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%`} tone={evPct >= 0 ? "pos" : "neg"} />
                    <Stat label="Fair (true)" value={fairAm != null ? amFmt(fairAm) : "—"} tone="text" />
                  </div>
                  <div className="num mt-2 flex items-center justify-between gap-2 text-[12px]">
                    <button
                      onClick={() => void copy()}
                      className="shrink-0 rounded-full border border-line-2 bg-white/[0.04] px-3 py-1 text-[10.5px] font-semibold text-text transition-transform duration-(--dur-fast) hover:bg-white/[0.08] active:scale-[0.96]"
                    >
                      {copied === "ok" ? "Copied" : copied === "fail" ? "Copy blocked" : "Copy slip"}
                    </button>
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted">$</span>
                      <input
                        type="number"
                        value={stake}
                        min={0}
                        inputMode="decimal"
                        aria-label="Stake"
                        onChange={(e) => onStake(Math.max(0, Number(e.target.value) || 0))}
                        className="h-8 w-[64px] rounded-[8px] border border-white/[0.08] bg-surface-2 px-2 text-right text-[12px] text-text"
                      />
                      <span className="text-muted">pays</span>
                      <b className="text-text">${calc.payout(stake).toFixed(2)}</b>
                    </span>
                  </div>
                  <div className="mt-1.5 text-[9.5px] leading-snug text-faint">
                    True % is the naive product of the model&apos;s win probabilities — legs are priced one side per game, so
                    same-game correlation never enters. Fair (true) is the break-even price for that true %, a yardstick,
                    not a posted quote. Sandbox only — nothing here enters the CFB ledger.
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

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "pos" | "neg" | "cfb" | "text" }) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "cfb" ? "text-cfb" : "text-text";
  return (
    <div className="rounded-[8px] bg-white/[0.03] px-1 py-1.5 leading-none">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`mt-1 text-[13px] font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[8.5px] text-faint">{sub}</div>}
    </div>
  );
}
