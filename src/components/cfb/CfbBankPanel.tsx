"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLeague } from "@/components/football/LeagueContext";
import { Pill } from "@/components/ui/Pill";
import type { League } from "@/lib/football/league";

/**
 * CFB BANK (INSTRUCTION 38, 2026-09-05): the College Football bankroll's adjustments —
 * the Settings page's MLB bank rows on the CFB store. The bankroll is managed, never
 * hand-edited: $2,500 base + the logged deposits / withdrawals + graded CFB P/L. Logging a
 * move appends to the CFB bank's own log and kicks the CFB sync loop.
 *
 * PHONE PASS (INSTRUCTION 46, 2026-09-08, the Builder relayout's sibling — Settings is where the
 * CFB bank lives): each row stacks its label OVER its controls on a phone instead of a
 * flex-wrap that broke the amount box, the note box and "Log it" across three ragged lines;
 * the amount and note inputs are 44px tall (the tap target the props sandbox uses); the
 * Deposit / Withdrawal pair and "Log it" fill their own lines. md+ keeps the label-left,
 * controls-right rows the MLB bank has. Nothing here is set below 11px.
 *
 * THE NFL BUILD (2026-09-08): the shared football bank panel — the store, the base and the sync
 * kick come from `useLeague()` (CFB_DESK by default, so Settings mounting this bare is the CFB
 * bank unchanged; src/components/nfl/NflBankPanel.tsx mounts it on the NFL desk). The desk's
 * hook (`L.store.useLedger()`) is called unconditionally: the context value is fixed per mount.
 */

/** the bankroll figure's accent per desk — both literals so Tailwind emits each */
const ACCENT: Record<League, string> = { cfb: "text-cfb", nfl: "text-nfl" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.04] py-3 last:border-0 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3">
      <span className="text-[12px] text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CfbBankPanel() {
  const L = useLeague();
  const { bankStore, bankroll, addAdjustment } = L.store.useLedger();
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const flash = (text: string) => {
    setSaved(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(null), 2000);
  };

  const logIt = () => {
    const n = Number(amt);
    if (!Number.isFinite(n) || n <= 0) {
      flash("Enter an amount above $0.");
      return;
    }
    addAdjustment(kind, Math.round(n * 100) / 100, note.trim());
    setAmt("");
    setNote("");
    flash("Logged.");
    void L.sync.syncNow();
  };

  const log = [...bankStore.log].sort((a, b) => b.ts - a.ts);
  const moves = bankStore.log.reduce((s, a) => s + (a.kind === "deposit" ? a.amt : -a.amt), 0);

  return (
    <div>
      <Row label={`${L.short} bankroll (managed — never hand-edited)`}>
        <span className={`num text-[16px] font-bold ${ACCENT[L.id]} md:text-[14px]`}>{money(bankroll)}</span>
        <span className="num text-[11px] text-faint">
          = ${L.bankBase.toLocaleString("en-US")} base ({bankStore.asOf}) {moves >= 0 ? "+" : "−"} ${Math.abs(moves).toFixed(2)} logged moves + graded {L.short} P/L
        </span>
      </Row>
      <Row label="Log a deposit / withdrawal">
        {/* phones: kind pair / $ + amount + note / Log it, one line each; md+: one flowing row */}
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-center" data-testid="cfb-bank-kind">
          <Pill
            variant={kind === "deposit" ? "gold" : "ghost"}
            className="min-h-[40px] justify-center !px-3 !py-1 text-[12px] md:min-h-0 md:!py-0.5 md:text-[11px]"
            onClick={() => setKind("deposit")}
            aria-pressed={kind === "deposit"}
          >
            Deposit
          </Pill>
          <Pill
            variant={kind === "withdrawal" ? "gold" : "ghost"}
            className="min-h-[40px] justify-center !px-3 !py-1 text-[12px] md:min-h-0 md:!py-0.5 md:text-[11px]"
            onClick={() => setKind("withdrawal")}
            aria-pressed={kind === "withdrawal"}
          >
            Withdrawal
          </Pill>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <span className="num text-[13px] text-muted">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            aria-label="Amount"
            className="num min-h-[44px] w-24 rounded-full border border-line-2 bg-surface-2 px-3 py-1.5 text-[14px] text-text md:min-h-0 md:w-20 md:text-[12px]"
          />
          <input
            type="text"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note (why)"
            aria-label="Note"
            className="min-h-[44px] min-w-0 flex-1 rounded-full border border-line-2 bg-surface-2 px-3 py-1.5 text-[14px] text-text md:min-h-0 md:w-36 md:flex-none md:text-[12px]"
          />
        </div>
        <Pill variant="gold" className="min-h-[44px] w-full justify-center !px-3 !py-1 text-[13px] md:min-h-0 md:w-auto md:text-[11px]" onClick={logIt}>
          Log it
        </Pill>
        {saved && <span className="text-[11px] text-muted">{saved}</span>}
      </Row>
      <Row label="Adjustment log (append-only)">
        {log.length === 0 ? (
          <span className="text-[11px] text-faint">No moves logged — the {L.short} bank sits at its ${L.bankBase.toLocaleString("en-US")} base.</span>
        ) : (
          <ul className="w-full space-y-1.5">
            {log.map((a) => (
              <li key={`${a.ts}-${a.kind}-${a.amt}`} className="num flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-faint">{new Date(a.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{a.note || (a.kind === "deposit" ? "deposit" : "withdrawal")}</span>
                <span className={a.kind === "deposit" ? "text-pos" : "text-neg"}>
                  {a.kind === "deposit" ? "+" : "−"}${a.amt.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Row>
    </div>
  );
}
