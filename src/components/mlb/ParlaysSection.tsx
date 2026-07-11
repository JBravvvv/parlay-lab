"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import type { Ticket } from "@/engine";

/* The engine's generated parlay sets, straight from BoardData — the old app's
   PARLAYS / MIXED PARLAYS / LIVE PARLAYS tabs. Display only: every number here
   is the engine's own output (tier, type, prob, EV @ CZ, stake → win). */

const CAT_LABELS: Record<string, string> = {
  ml: "MONEYLINE",
  rl: "RUN LINE",
  batter_hits: "HITS",
  batter_total_bases: "TOTAL BASES",
  batter_home_runs: "HOME RUNS",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "STRIKEOUTS",
  pitcher_outs: "OUTS",
  MIX: "MIXED",
};

type View = "parlays" | "mixed" | "live";
const VIEWS: [View, string, string][] = [
  ["parlays", "PARLAYS", "Tickets built only from games that haven't started yet."],
  ["mixed", "MIXED PARLAYS", "Cross-game tickets from not-started games plus live games before the 7th."],
  ["live", "LIVE PARLAYS", "In-game tickets from every live game, using live odds, to the final out."],
];

/* extra engine fields carried on Ticket via its index signature */
const x = (t: Ticket) =>
  t as Ticket & { tier?: string; typeLabel?: string; stake?: number; toWin?: number; note?: string };

const SHOW_CAP = 24;

function TierTag({ tier }: { tier?: string }) {
  const cls =
    tier === "SAFER"
      ? "border-pos/50 bg-pos/10 text-pos"
      : tier === "LONGSHOT"
        ? "border-gold/50 bg-gold/10 text-gold"
        : "border-line-2 bg-surface-2 text-muted";
  return <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${cls}`}>{tier ?? "BALANCED"}</span>;
}

export function ParlaysSection({ parlays, mixed, live }: { parlays: Ticket[]; mixed: Ticket[]; live: Ticket[] }) {
  const [view, setView] = useState<View>("parlays");
  const [pfilter, setPfilter] = useState("all");

  const lists: Record<View, Ticket[]> = { parlays, mixed, live };
  const all = lists[view] ?? [];

  const filters = useMemo(() => {
    const base: [string, string][] = [["all", "ALL"], ["SAFER", "SAFER"], ["LONGSHOT", "LONGSHOTS"], ["MIX", "MIXED"]];
    const types = Array.from(new Set(all.map((t) => t.type).filter((t): t is string => !!t && t !== "MIX")));
    return base.concat(types.map((t) => [t, CAT_LABELS[t] ?? t.toUpperCase()]));
  }, [all]);

  const match = (t: Ticket, f: string) =>
    f === "all" ? true : f === "SAFER" || f === "LONGSHOT" ? x(t).tier === f : t.type === f;
  const shown = all.filter((t) => match(t, filters.some(([k]) => k === pfilter) ? pfilter : "all"));
  const playable = shown.filter((t) => t.czOdds != null);
  const offBook = shown.filter((t) => t.czOdds == null);

  return (
    <Reveal>
      <div className="mt-8">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Generated parlays — the engine&apos;s ticket sets
        </h2>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {VIEWS.map(([v, label]) => (
            <FilterPill key={v} selected={view === v} onClick={() => { setView(v); setPfilter("all"); }}>
              {label}
              <span className="num ml-1 text-[10px] opacity-70">{(lists[v] ?? []).length}</span>
            </FilterPill>
          ))}
        </div>
        <div className="mb-3 text-[11px] text-muted">{VIEWS.find(([v]) => v === view)![2]}</div>

        {all.length === 0 ? (
          <Panel>
            <EmptyState
              title={view === "live" ? "No games in progress right now" : "No parlays in this set yet"}
              body={
                view === "live"
                  ? "In-game parlays appear the moment a game starts and run to the final out."
                  : "Not enough qualifying picks — regenerate closer to game time."
              }
            />
          </Panel>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {filters.map(([k, label]) => {
                const n = all.filter((t) => match(t, k)).length;
                return (
                  <FilterPill key={k} selected={pfilter === k} onClick={() => setPfilter(k)} disabled={!n} className="!px-2.5 !py-1 !text-[10.5px]">
                    {label}
                    {n > 0 && <span className="num ml-1 text-[9.5px] opacity-70">{n}</span>}
                  </FilterPill>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {playable.slice(0, SHOW_CAP).map((t, ti) => {
                const e = x(t);
                const toWin = e.czDec && e.stake != null ? Math.round(e.stake * (e.czDec - 1)) : e.toWin;
                return (
                  <Panel key={`${view}|${ti}`} className={(t.czEv ?? -1) >= 0 ? "glow-pos" : ""}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="display text-[14px] text-text">{t.name}</div>
                      <span className="num shrink-0 text-[13.5px] font-bold text-gold">{String(t.czOdds)} @ CZ</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <TierTag tier={e.tier} />
                      {e.typeLabel && (
                        <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[9.5px] font-bold text-muted">
                          {e.typeLabel.toUpperCase()}
                        </span>
                      )}
                      {t.posCorr && (
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold">
                          CORRELATED
                        </span>
                      )}
                    </div>
                    <div className="num mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
                      <span className="text-text">{String(t.prob)}% combined</span>
                      {t.czEv != null && <EvBadge ev={Number(t.czEv)} />}
                      {e.stake != null && (
                        <span className="text-muted">${e.stake} → <b className="text-text">${toWin}</b></span>
                      )}
                    </div>
                    <ul className="mt-2.5 space-y-1 text-[12px] text-muted">
                      {t.legs.map((l, i) => (
                        <li key={i} className="truncate">
                          <span className="text-text">{l.label}</span> · {l.prop}
                          {l.cz != null && <span className="num ml-1 text-[10.5px]">({l.cz > 0 ? `+${l.cz}` : l.cz})</span>}
                        </li>
                      ))}
                    </ul>
                    {e.note && <div className="mt-2 text-[10.5px] leading-relaxed text-faint">{e.note}</div>}
                  </Panel>
                );
              })}
            </div>
            {playable.length > SHOW_CAP && (
              <div className="mt-2 text-[11px] text-faint">
                +{playable.length - SHOW_CAP} more in this view — narrow with the filters above.
              </div>
            )}
            {playable.length === 0 && (
              <Panel><EmptyState title="No parlays match this filter" /></Panel>
            )}

            {offBook.length > 0 && (
              <details className="mt-3 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer select-none text-[12px] font-semibold text-muted">
                  Not at Caesars ({offBook.length}) — tickets with a leg Caesars doesn&apos;t price
                </summary>
                <div className="mt-3 space-y-1.5">
                  {offBook.map((t, ti) => (
                    <div key={`${t.name}|${ti}`} className="text-[12px] text-muted">
                      <span className="text-text">{t.name}</span>{" "}
                      <span className="num text-[10.5px]">
                        missing: {t.legs.filter((l) => l.cz == null).map((l) => `${l.label} ${l.prop}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Reveal>
  );
}
