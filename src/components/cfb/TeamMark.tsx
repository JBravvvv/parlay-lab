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
 *
 * PLAYER MARK (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim: "Board & Builder should have
 * player headshot as well as team logo" and "it should be the team logo the player plays for not
 * both team logos so it's easier to separate the players & teams"): `PlayerMark` is the one way a
 * player pick is drawn — ESPN's headshot in the disc with HIS team's logo as the corner badge (the
 * slot the rank badge uses on a TeamMark; a player mark never shows a rank). No headshot, or one
 * that fails to load → his initials on a disc tinted in the team colour, badge unchanged. No
 * player at all → a plain TeamMark. A PairMark (both logos) is now only ever a total.
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

/** the corner logo badge of a PlayerMark, px per size (about half the disc) */
const LOGO_BADGE_PX: Record<TeamMarkSize, number> = { xs: 10, sm: 13, md: 17, lg: 22 };

/**
 * ESPN's image combiner URL for a headshot at a small size — the full-size PNG is ~220 KB, the
 * combiner form (verified 2026-09-08, HTTP 200) serves a resized copy. Non-ESPN hrefs pass through.
 */
export function headshotThumb(href: string, w: number = 96, h: number = 70): string {
  const m = /^https?:\/\/a\.espncdn\.com(\/i\/headshots\/.+\.(?:png|jpg))$/i.exec(href);
  if (!m) return href;
  return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(m[1])}&w=${w}&h=${h}`;
}

/** "TS" for "Ty Simpson" — the initials disc when no headshot loads (moved here from CfbProps, INSTRUCTION 46) */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z\s'-]/g, "").split(/[\s-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase() || "?";
}

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

/**
 * The mark for a PLAYER pick (INSTRUCTION 46): headshot disc + the player's own team logo as the
 * corner badge. `team` may be null when neither the odds feed nor ESPN placed the player — the disc
 * then carries initials on the surface tone and no badge, and nothing is guessed.
 */
export function PlayerMark({
  player,
  headshot,
  team,
  pos,
  size = "sm",
  className = "",
  style,
}: {
  player: string | null | undefined;
  headshot: string | null | undefined;
  team: TeamMarkTeam | null | undefined;
  /** ESPN position abbreviation for the title ("QB"), or null */
  pos?: string | null;
  size?: TeamMarkSize;
  className?: string;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const [badgeBroken, setBadgeBroken] = useState(false);
  const px = PX[size];
  const name = (player ?? "").trim();
  if (!name) {
    if (!team) return null;
    return <TeamMark team={team} size={size} showAbbr={false} className={className} style={style} />;
  }
  const hex = teamHex(team?.color);
  const usePhoto = !!headshot && !broken;
  const badgePx = LOGO_BADGE_PX[size];
  const title = [name, pos, team?.abbr].filter(Boolean).join(" · ");
  const useBadgeLogo = !!team?.logo && !badgeBroken;

  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} style={style}>
      <span
        role="img"
        aria-label={title}
        title={title}
        data-player-mark
        className="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]"
        style={{ width: px, height: px }}
      >
        {usePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshotThumb(headshot as string)}
            alt=""
            width={px}
            height={px}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full rounded-full object-cover object-top"
          />
        ) : (
          <span
            aria-hidden
            className={`num flex h-full w-full items-center justify-center rounded-full font-bold uppercase leading-none tracking-tight text-text ${DISC_TEXT[size]}`}
            style={hex ? { background: `color-mix(in srgb, ${hex} 55%, var(--color-surface-2))` } : undefined}
          >
            {initials(name)}
          </span>
        )}
        {team && (
          <span
            aria-hidden
            data-team-badge
            className="absolute -left-1 -top-1 flex items-center justify-center rounded-full bg-[#101215] ring-1 ring-white/[0.12] shadow-[0_0_0_1.5px_rgba(8,9,11,0.9)]"
            style={{ width: badgePx, height: badgePx }}
          >
            {useBadgeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo ?? undefined}
                alt=""
                width={badgePx}
                height={badgePx}
                loading="lazy"
                decoding="async"
                onError={() => setBadgeBroken(true)}
                className="h-[80%] w-[80%] object-contain"
              />
            ) : (
              <span className="h-[60%] w-[60%] rounded-full" style={{ background: hex ?? "rgba(255,255,255,0.35)" }} />
            )}
          </span>
        )}
      </span>
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
