"use client";

import type { ReactNode } from "react";
import { usePlayerSheet } from "@/components/player/PlayerSheet";
import { parseBoardLabel } from "@/lib/player-card";

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
 */
export function BoardLabel({ label, className = "" }: { label: string; className?: string }) {
  const parsed = parseBoardLabel(label);
  if (!parsed) return <>{label}</>;
  return (
    <>
      <PlayerName name={parsed.name} team={parsed.team} className={className} />
      {label.slice(label.indexOf(parsed.name) + parsed.name.length)}
    </>
  );
}
