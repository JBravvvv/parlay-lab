"use client";

import { useMemo } from "react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";
import type { CfbTeam } from "@/lib/cfb/types";
import { TeamMark } from "./TeamMark";
import { fmtSigned } from "./CfbGameCard";

/**
 * FPI PANEL (INSTRUCTION 38, 2026-09-05): ESPN's Football Power Index for a set of teams — the
 * slate only carries the day's teams, so the default title says so ("FPI · today's teams").
 * Sorted by FPI descending; a team ESPN does not rate (FCS, or an unlisted program) is counted
 * at the foot, never given a number. The bar is each rating's share of the strongest listed
 * team's |FPI| — a visual, not a probability. Reusable: The Sharp and the Stats page embed it.
 */
export function CfbFpiPanel({
  teams,
  updated = null,
  title = "FPI · today's teams",
  limit = 25,
  className = "",
}: {
  teams: readonly CfbTeam[];
  /** ESPN's `lastUpdated` stamp for the footnote */
  updated?: string | null;
  title?: string;
  /** how many rated teams to list (the rest are counted) */
  limit?: number;
  className?: string;
}) {
  const { rated, unrated, scale } = useMemo(() => {
    const seen = new Set<string>();
    const unique: CfbTeam[] = [];
    for (const t of teams) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }
    const rated = unique.filter((t) => t.fpi != null).sort((a, b) => (b.fpi ?? 0) - (a.fpi ?? 0));
    const unrated = unique.filter((t) => t.fpi == null);
    const scale = rated.reduce((m, t) => Math.max(m, Math.abs(t.fpi ?? 0)), 0) || 1;
    return { rated, unrated, scale };
  }, [teams]);

  const shown = rated.slice(0, Math.max(0, limit));
  const more = rated.length - shown.length;

  return (
    <Panel title={title} className={className} action={<span className="num text-[10px] text-faint">{rated.length} rated</span>}>
      {rated.length === 0 ? (
        <EmptyState title="No FPI on this slate" body="ESPN's power index was unavailable for this load, or none of these teams is rated (FCS programs are not)." />
      ) : (
        <ol className="space-y-1.5">
          {shown.map((t, i) => {
            const fpi = t.fpi ?? 0;
            const w = Math.min(100, (Math.abs(fpi) / scale) * 100);
            return (
              <li key={t.id} className="flex min-w-0 items-center gap-2.5">
                <span className="num w-5 shrink-0 text-right text-[10.5px] text-faint">{i + 1}</span>
                <TeamMark team={t} size="sm" showRank showAbbr={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-text">{t.short}</span>
                    {t.record && <span className="num shrink-0 text-[10px] text-faint">{t.record}</span>}
                    {t.fpiRank != null && <span className="num ml-auto shrink-0 text-[10px] text-muted">FPI #{t.fpiRank}</span>}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className={`h-full rounded-full ${fpi >= 0 ? "bg-cfb" : "bg-neg/70"}`} style={{ width: `${w}%` }} />
                  </div>
                </div>
                <span className={`num w-12 shrink-0 text-right text-[13px] font-bold ${fpi >= 0 ? "text-text" : "text-neg"}`}>{fmtSigned(fpi)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {(more > 0 || unrated.length > 0 || updated) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-faint">
          {more > 0 && <span>+{more} more rated</span>}
          {unrated.length > 0 && (
            <span title={unrated.map((t) => t.short).join(", ")}>
              {unrated.length} unrated (FCS / not listed): {unrated.map((t) => t.abbr).join(", ")}
            </span>
          )}
          {updated && <span className="ml-auto">ESPN FPI · updated {fmtUpdated(updated)}</span>}
        </div>
      )}
    </Panel>
  );
}

function fmtUpdated(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
}
