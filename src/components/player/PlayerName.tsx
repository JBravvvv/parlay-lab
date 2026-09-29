"use client";

import { PlayerMark } from "./PlayerMark";
import { clubFromLabel } from "@/lib/mlb-visuals";

import type { ReactNode } from "react";
import { usePlayerSheet } from "@/components/player/PlayerSheet";
import { parseBoardLabel } from "@/lib/player-card";
import { MlbPosTag, isMlbPlayerMarket } from "./MlbPosTag";

/**
 * A player's printed name, made tappable: same font as its surroundings,
 * underline on hover, opens the profile sheet. Pass `id` when the surface has
 * an MLB id (Stats table, Pitcher vs Team); otherwise the sheet resolves the
 * name (+ team abbreviation when known) itself.
 *
 * Wiring is a one-line swap: `{r.name}` → `<PlayerName name={r.name} />`, or
 * for board / ticket labels printed as "Name (TEAM)": `<BoardLabel label={l.label} />`.
 */
export function PlayerName({
  name,
  id,
  team,
  className = "",
  children,
}: {
  name: string;
  id?: number | null;
  team?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const open = usePlayerSheet();
  const fire = () => open({ id: id ?? null, name, team: team ?? null });
  return (
    <span
      role="button"
      tabIndex={0}
      title={`${name} — profile`}
      onClick={(e) => {
        // the name may sit inside a <Link> card (Games list) — open the sheet, never navigate
        e.preventDefault();
        e.stopPropagation();
        fire();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          fire();
        }
      }}
      className={`cursor-pointer underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none ${className}`}
    >
      {children ?? name}
    </span>
  );
}

/**
 * Engine labels: player rows print "Name (TEAM)", ML/RL rows print a club
 * name. The former gets the tappable name (suffix kept); the latter renders
 * as plain text — a club is not a player.
 *
 * A player label ends with his position (2026-09-28, Josh: "Add players position to every pick on parlay lab") —
 * MLB's own, matched on the name AND the team the label prints; `market` lets the two-way player read P or DH.
 */
export function BoardLabel({ label, className = "", showMark = true, market }: { label: string; className?: string; showMark?: boolean; market?: string | null }) {
  const parsed = parseBoardLabel(label);
  /* a bare player name on a player market (the engine dropped the team suffix): tag it, matched on the name alone */
  if (!parsed && isMlbPlayerMarket(market)) return <>{label}<MlbPosTag name={label} market={market} /></>;
  if (!parsed) {
    /* INSTRUCTION 70 (2026-09-17): a club leg ("Detroit Tigers", "Tigers ML") carries the club's own
       logo — a team pick "only needs a team logo". No club named, no mark: the label stands alone. */
    const club = showMark ? clubFromLabel(label) : null;
    return club ? (
      <>
        <span className="mr-2 inline-flex py-1 align-middle"><PlayerMark player={null} team={club} headshot={null} size="sm" /></span>
        {label}
      </>
    ) : (
      <>{label}</>
    );
  }
  return (
    <>
      {showMark && <span className="mr-2 inline-flex py-1 align-middle"><PlayerMark player={parsed.name} team={parsed.team} headshot={null} size="sm" /></span>}
      <PlayerName name={parsed.name} team={parsed.team} className={className} />
      {label.slice(label.indexOf(parsed.name) + parsed.name.length)}
      {/* a parsed "Name (TEAM)" is a player; the market only refines the two-way player, so an unknown one is dropped */}
      <MlbPosTag name={parsed.name} team={parsed.team} market={isMlbPlayerMarket(market) ? market : null} />
    </>
  );
}
