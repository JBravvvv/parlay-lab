"use client";

import { useState, type CSSProperties } from "react";
import { teamLogo } from "@/lib/mlb-visuals";
import { espnLogoCode } from "@/lib/player-card";
import { teamTag } from "@/components/props/props-model";

/**
 * PLAYER MARK — MLB (INSTRUCTION 50, 2026-09-11, Josh's word, verbatim: "Need player headshots
 * for Parlay Builder etc or need team logo next to name").
 *
 * The MLB twin of the CFB mark Josh already signed off on (src/components/cfb/TeamMark.tsx's
 * PlayerMark, INSTRUCTION 46): the headshot in a disc with HIS OWN team's logo as a corner
 * badge — never both clubs, so a Giants bat and a Rockies bat are told apart at a glance.
 *
 * NOTHING HERE IS INVENTED. The headshot href is whatever `useHeadshots` (src/lib/mlb-visuals.ts,
 * `headshotUrl` at :68) resolved for that name — an unresolved name simply has none and the disc
 * falls back to his initials. The badge is ESPN's logo for the team the ROW carries; no team tag
 * means no badge, never a guess.
 *
 * THE ATH / CWS TRAP (verified 2026-09-11): the engine spells the Athletics "ATH" and the White
 * Sox "CWS"; mlb-visuals' own table spells them "OAK"/"CHW" (src/lib/mlb-visuals.ts:19,33). The
 * team string is folded through props-model's `teamTag` (:97-101, OAK→ATH / CHW→CWS, and full
 * club names through teamAbbr) and then through `espnLogoCode` (src/lib/player-card.ts:386-391,
 * whose specials map ATH and OAK both to "oak", CWS and CHW both to "chw"), so every spelling of
 * those two clubs — and a full club name — lands on the right logo instead of silently losing it.
 */

export type PlayerMarkSize = "xs" | "sm" | "md" | "lg";

/* px per size — mirrors the CFB mark's PX (TeamMark.tsx:27) and LOGO_BADGE_PX (:38) */
const PX: Record<PlayerMarkSize, number> = { xs: 18, sm: 24, md: 32, lg: 44 };
const LOGO_BADGE_PX: Record<PlayerMarkSize, number> = { xs: 10, sm: 13, md: 17, lg: 22 };
const DISC_TEXT: Record<PlayerMarkSize, string> = {
  xs: "text-[7px]",
  sm: "text-[8.5px]",
  md: "text-[10px]",
  lg: "text-[13px]",
};

/** "YA" for "Yordan Alvarez" — the initials disc when no headshot resolves or one fails to load. */
export function playerInitials(name: string): string {
  const parts = name
    .replace(/[^A-Za-z\s'-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase() || "?";
}

/**
 * ESPN's logo href for a team as the board spells it — an abbreviation ("HOU", "ATH", "OAK") or a
 * full club name ("Oakland Athletics"). null when there is no team to draw.
 */
export function mlbTeamLogo(team: string | null | undefined): string | null {
  const t = (team ?? "").trim();
  if (!t) return null;
  const code = espnLogoCode(teamTag(t));
  return code ? teamLogo(code) : null;
}

export function PlayerMark({
  player,
  headshot,
  team,
  size = "sm",
  className = "",
  style,
}: {
  player: string | null | undefined;
  /** the URL useHeadshots resolved for this name, or null — never constructed here */
  headshot: string | null | undefined;
  /** the row's own team tag or club name, or null when the feed did not place him */
  team: string | null | undefined;
  size?: PlayerMarkSize;
  className?: string;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const [badgeBroken, setBadgeBroken] = useState(false);
  const px = PX[size];
  const badgePx = LOGO_BADGE_PX[size];
  const name = (player ?? "").trim();
  const tag = (team ?? "").trim() ? teamTag((team ?? "").trim()) : null;
  const logo = mlbTeamLogo(team);
  const title = [name, tag].filter(Boolean).join(" · ");

  /* no player and no team — there is nothing honest to draw */
  if (!name && !tag) return null;

  /* no player, but a team: the club's own logo alone (an ML/RL leg is a club, not a person) */
  if (!name) {
    return (
      <span
        role="img"
        aria-label={tag ?? ""}
        title={tag ?? ""}
        data-team-mark
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/[0.08] ${className}`}
        style={{ width: px, height: px, ...style }}
      >
        {logo && !badgeBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={px}
            height={px}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBadgeBroken(true)}
            className="h-[78%] w-[78%] object-contain"
          />
        ) : (
          <span className={`num font-bold uppercase leading-none tracking-tight text-muted ${DISC_TEXT[size]}`}>{tag}</span>
        )}
      </span>
    );
  }

  const usePhoto = !!headshot && !broken;

  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} style={style}>
      <span
        role="img"
        aria-label={title}
        title={title}
        data-player-mark
        className="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full bg-surface-2 ring-1 ring-white/[0.08]"
        style={{ width: px, height: px }}
      >
        {usePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshot as string}
            alt=""
            width={px}
            height={px}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full rounded-full object-cover object-top"
          />
        ) : (
          <span
            aria-hidden
            className={`num flex h-full w-full items-center justify-center rounded-full font-bold uppercase leading-none tracking-tight text-muted ${DISC_TEXT[size]}`}
          >
            {playerInitials(name)}
          </span>
        )}
        {tag && (
          <span
            aria-hidden
            data-team-badge
            className="absolute -left-1 -top-1 flex items-center justify-center rounded-full bg-[#101215] ring-1 ring-white/[0.12] shadow-[0_0_0_1.5px_rgba(8,9,11,0.9)]"
            style={{ width: badgePx, height: badgePx }}
          >
            {logo && !badgeBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                width={badgePx}
                height={badgePx}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setBadgeBroken(true)}
                className="h-[80%] w-[80%] object-contain"
              />
            ) : (
              <span className="h-[60%] w-[60%] rounded-full bg-white/35" />
            )}
          </span>
        )}
      </span>
    </span>
  );
}
