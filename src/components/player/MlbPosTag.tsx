"use client";

import { parseBoardLabel } from "@/lib/player-card";
import { mlbLeadingName, mlbPickPosition } from "@/lib/mlb/positions";
import { useMlbPositions } from "@/lib/mlb/useMlbPositions";
import { PosTag, cleanPos } from "./PosTag";

/** a player market — ML / RL / totals and anything else carry no player, so no position */
export const isMlbPlayerMarket = (market: string | null | undefined) => !!market && /^(batter|pitcher)_/.test(market);

/**
 * The position tag for an MLB pick that only knows its printed label (2026-09-28, Josh: "Add players position to
 * every pick on parlay lab"). A board / slip / ticket label prints "Name (TEAM)" — the team is what breaks a tie
 * between two players of the same name — and the position comes from the season's player index on the device
 * (useMlbPositions: one free GET per session, shared by every pick). `pos` wins when the leg already carries one.
 * Anything it cannot place with certainty draws nothing.
 */
export function MlbPosTag({
  label,
  name,
  team,
  market,
  pos,
  className,
}: {
  /** "Aaron Judge (NYY)" — or pass `name` / `team` directly */
  label?: string | null;
  name?: string | null;
  team?: string | null;
  /** the pick's market; omit ONLY where the caller already knows the label names a player (a parsed "Name (TEAM)") */
  market?: string | null;
  pos?: string | null;
  className?: string;
}) {
  const player = market == null ? true : isMlbPlayerMarket(market);
  const resolve = useMlbPositions(player && !pos);
  if (!player) return null;
  if (pos) return <PosTag pos={mlbPickPosition(pos, market)} className={className} />;
  const parsed = !name && label ? parseBoardLabel(label) : null;
  const who = name ?? parsed?.name ?? label ?? null;
  if (!who || !resolve) return null;
  return <PosTag pos={mlbPickPosition(resolve(who, team ?? parsed?.team ?? null), market)} className={className} />;
}

/**
 * An engine line that opens with the player's name and nothing else to go on ("Aaron Judge Hits O 1.5 (-150)" — The
 * Sharp's trap and passes): the tag lands right after the name when the lead is exactly one indexed player.
 */
export function MlbLeadText({ text }: { text: string }) {
  const resolve = useMlbPositions();
  const lead = mlbLeadingName(resolve, text);
  if (!lead || !cleanPos(lead.pos)) return <>{text}</>;
  return <>{lead.name}<PosTag pos={lead.pos} /> {lead.rest}</>;
}
