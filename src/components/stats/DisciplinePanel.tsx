"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { Reveal } from "@/components/motion/Reveal";
import { useLedger } from "@/lib/useLedger";
import { getNoPlayLog, todayStr } from "@/lib/engine-client";
import { discipline, type DiscSplit } from "@/lib/noplay";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * Hardening Phase 3 — the mirror that shows whether the old behavior is
 * creeping back in. Gated vs override, month and lifetime, plus NO-PLAY days
 * honored vs overridden. All figures derive from the ledger's own overrode
 * stamp and the synced NO-PLAY verdict log; history is never reconstructed —
 * "honored" counting starts the day this shipped.
 */

const money = (v: number, sign = false) => `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}$${Math.abs(v).toFixed(2).replace(/\.00$/, "")}`;
const roiF = (r: number | null) => (r == null ? "—" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`);

function Line({ label, l, tone }: { label: string; l: DiscSplit; tone: "pos" | "neg" | "muted" }) {
  return (
    <tr className="border-t border-white/[0.04]">
      <td
        className={`py-1.5 font-sans font-semibold ${tone === "pos" ? "text-text" : tone === "neg" ? "text-neg" : "text-muted"}`}
      >
        {label}
      </td>
      <td className="py-1.5 text-right text-muted">{l.tickets}</td>
      <td className="py-1.5 text-right">{money(l.staked)}</td>
      <td className={`py-1.5 text-right ${l.pl > 0 ? "text-pos" : l.pl < 0 ? "text-neg" : "text-muted"}`}>{money(l.pl, true)}</td>
      <td className={`py-1.5 text-right ${l.roi != null && l.roi < 0 ? "text-neg" : l.roi != null ? "text-pos" : "text-faint"}`}>
        {roiF(l.roi)}
      </td>
    </tr>
  );
}

export function DisciplinePanel() {
  const { api } = useLedger();
  const [scope, setScope] = useState<"month" | "lifetime">("month");
  const disc = useMemo(
    () => discipline(((api?.entries ?? []) as unknown) as SyncEntry[], typeof window !== "undefined" ? getNoPlayLog() : {}, todayStr()),
    [api],
  );
  const s = disc[scope];

  return (
    <Reveal>
      <Panel title="Discipline — gated vs override">
        <div className="mb-3 flex gap-1.5">
          <FilterPill selected={scope === "month"} onClick={() => setScope("month")}>
            THIS MONTH
          </FilterPill>
          <FilterPill selected={scope === "lifetime"} onClick={() => setScope("lifetime")}>
            LIFETIME
          </FilterPill>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                <th className="pb-2">Bucket</th>
                <th className="pb-2 text-right">Tickets</th>
                <th className="pb-2 text-right">Staked</th>
                <th className="pb-2 text-right">P/L</th>
                <th className="pb-2 text-right" title="P/L over settled stake">
                  ROI
                </th>
              </tr>
            </thead>
            <tbody>
              {/* CORE and FUN are split because FUN is EV-gate-exempt BY DESIGN. Folded
                  together, a FUN-only lock on a NO-PLAY day showed up as gated core
                  action — discipline held while money moved. */}
              <Line label="Gated · core" l={s.gated.core} tone="pos" />
              <Line label="Gated · fun" l={s.gated.fun} tone="muted" />
              <Line label="Override · core" l={s.override.core} tone="neg" />
              <Line label="Override · fun" l={s.override.fun} tone="muted" />
            </tbody>
          </table>
        </div>
        <div className="num mt-3 text-[12px]">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-muted">NO-PLAY days</span>{" "}
          <span className="text-pos">{s.noPlay.honored} honored</span>
          <span className="text-faint"> · </span>
          <span className={s.noPlay.overridden > 0 ? "text-neg" : "text-muted"}>{s.noPlay.overridden} overridden</span>
          {s.noPlay.funOnly > 0 ? (
            <>
              <span className="text-faint"> · </span>
              <span className="text-muted" title="The core gate was honored, but a FUN ticket was still locked — not an action-free day">
                {s.noPlay.funOnly} fun-only
              </span>
            </>
          ) : null}
        </div>
        <div className="mt-2 text-[10.5px] leading-relaxed text-faint">
          FUN never faces the EV gate, the settlement floor or the consensus gates, so its rows are shown apart
          from core rather than added to it — a &quot;fun-only&quot; NO-PLAY day honored the core gate but was not an
          action-free day. Override figures come from the ledger&apos;s own per-day stamp. A NO-PLAY verdict counts as honored once its
          day ends with no override lock; honored counting starts from this deploy (nothing reconstructed), so early
          numbers undercount the discipline, never the overrides.
        </div>
      </Panel>
    </Reveal>
  );
}
