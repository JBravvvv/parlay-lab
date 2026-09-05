"use client";

import { useState, type CSSProperties } from "react";
import type { CfbTeam } from "@/lib/cfb/types";

/**
 * TEAM MARK (INSTRUCTION 38, 2026-09-05): the one way a College Football team is drawn on the
 * desk — ESPN's logo when it loads, else a disc in the team's own color carrying its abbreviation.
 * An optional AP/CFP rank rides the corner as a small amber badge; an optional abbreviation sits
 * beside the mark. Nothing here is styled per team beyond ESPN's own `color` — when that is null
 * the disc falls back to the surface tone.
 *
 * `team` is structural (`abbr`, `logo`, `color`, `rank`, plus optional `name` / `short`), so a
 * full CfbTeam and a ledger-lean stub both fit.
 */
export type TeamMarkTeam = Pick<CfbTeam, "abbr" | "logo" | "color" | "rank"> & Partial<Pick<CfbTeam, "id" | "name" | "short">>;
export type TeamMarkSize = "xs" | "sm" | "md" | "lg";

const PX: Record<TeamMarkSize, number> = { xs: 18, sm: 24, md: 32, lg: 44 };
const DISC_TEXT: Record<TeamMarkSize, string> = { xs: "text-[7px]", sm: "text-[8.5px]", md: "text-[10px]", lg: "text-[13px]" };
const ABBR_TEXT: Record<TeamMarkSize, string> = { xs: "text-[10px]", sm: "text-[11px]", md: "text-[12.5px]", lg: "text-[14px]" };
const BADGE: Record<TeamMarkSize, string> = {
  xs: "-left-1 -top-1 h-3 min-w-3 px-[3px] text-[7px]",
  sm: "-left-1 -top-1 h-3.5 min-w-3.5 px-[3px] text-[8px]",
  md: "-left-1.5 -top-1.5 h-4 min-w-4 px-1 text-[9px]",
  lg: "-left-1.5 -top-1.5 h-[18px] min-w-[18px] px-1 text-[10px]",
};

/** "#RRGGBB" from ESPN's bare hex (or null when the feed has no color / an odd value). */
export function teamHex(color: string | null | undefined): string | null {
  if (!color) return null;
  const c = color.replace(/^#/, "").trim();
  return /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : /^[0-9a-f]{3}$/i.test(c) ? `#${c}` : null;
}

/** Legible text over a team color: ink on light colors, white on dark ones. */
function inkFor(hex: string): string {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160 ? "#131a26" : "#ffffff";
}

export function TeamMark({
  team,
  size = "sm",
  showRank = false,
  showAbbr = true,
  className = "",
  style,
}: {
  team: TeamMarkTeam;
  size?: TeamMarkSize;
  /** show the AP/CFP rank badge when the team is ranked */
  showRank?: boolean;
  /** print the abbreviation beside the mark (default on; the board's pick column turns it off) */
  showAbbr?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const px = PX[size];
  const hex = teamHex(team.color);
  const name = team.name ?? team.short ?? team.abbr;
  const useLogo = !!team.logo && !broken;
  const rank = showRank && team.rank != null ? team.rank : null;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`} style={style}>
      <span
        role="img"
        aria-label={rank != null ? `#${rank} ${name}` : name}
        title={name}
        className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]"
        style={{ width: px, height: px }}
      >
        {useLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logo ?? undefined}
            alt=""
            width={px}
            height={px}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-[82%] w-[82%] object-contain"
          />
        ) : (
          <span
            aria-hidden
            className={`flex h-full w-full items-center justify-center rounded-full font-bold uppercase leading-none tracking-tight ${DISC_TEXT[size]}`}
            style={hex ? { background: hex, color: inkFor(hex) } : undefined}
          >
            {team.abbr.slice(0, 4)}
          </span>
        )}
        {rank != null && (
          <span
            aria-hidden
            className={`num absolute flex items-center justify-center rounded-full bg-cfb font-bold leading-none text-[#131a26] shadow-[0_0_0_1.5px_rgba(8,9,11,0.9)] ${BADGE[size]}`}
          >
            {rank}
          </span>
        )}
      </span>
      {showAbbr && <span className={`font-semibold leading-none text-text ${ABBR_TEXT[size]}`}>{team.abbr}</span>}
    </span>
  );
}

/** Two marks overlapping — the mark for a total (the game, not a side). */
export function PairMark({ away, home, size = "sm", className = "" }: { away: TeamMarkTeam; home: TeamMarkTeam; size?: TeamMarkSize; className?: string }) {
  const px = PX[size];
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} style={{ width: Math.round(px * 1.6), height: px }}>
      <TeamMark team={away} size={size} showAbbr={false} className="relative z-[1]" />
      <TeamMark team={home} size={size} showAbbr={false} className="relative" style={{ marginLeft: -Math.round(px * 0.4) }} />
    </span>
  );
}
