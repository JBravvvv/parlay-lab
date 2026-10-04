/**
 * THE POSITION TAG (2026-09-28, Josh: "Add players position to every pick on parlay lab"). One small badge — "RF",
 * "QB" — drawn right after the player's name on every pick, on every desk. The position is always the sport's own
 * data (MLB's primary position from its player index, ESPN's athlete position for football); unknown draws nothing,
 * never a guess. Pure render: no fetch, no state.
 */
const TITLE: Record<string, string> = {
  P: "Pitcher", SP: "Starting pitcher", RP: "Relief pitcher", C: "Catcher", "1B": "First base", "2B": "Second base",
  "3B": "Third base", SS: "Shortstop", LF: "Left field", CF: "Center field", RF: "Right field", OF: "Outfield",
  IF: "Infield", DH: "Designated hitter", TWP: "Two-way player",
  QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", FB: "Fullback", K: "Kicker",
  PK: "Kicker", ATH: "Athlete", LB: "Linebacker", CB: "Cornerback", S: "Safety", DE: "Defensive end",
  DT: "Defensive tackle", DL: "Defensive line", DB: "Defensive back", OL: "Offensive line",
};

/**
 * A printable position: 1–4 capitals or digits ("1B", "QB", "ATH"). "D/ST" is dropped — a defense's pick already
 * says so in its name — and anything longer or stranger is not a position abbreviation.
 */
export function cleanPos(pos: string | null | undefined): string | null {
  if (typeof pos !== "string") return null;
  const p = pos.trim().toUpperCase();
  return /^[A-Z0-9]{1,4}$/.test(p) && /[A-Z]/.test(p) ? p : null;
}

/** `className` replaces the default 4px lead-in (`ml-1`) — pass the spacing a flex row with its own gap wants */
export function PosTag({ pos, className = "ml-1" }: { pos: string | null | undefined; className?: string }) {
  const p = cleanPos(pos);
  if (!p) return null;
  return (
    <span
      data-pos-tag={p}
      title={TITLE[p] ?? p}
      className={`pos-tag inline-flex h-[14px] shrink-0 items-center rounded-[3px] border border-white/15 bg-white/[0.06] px-[3px] align-[1px] text-[8.5px] font-bold uppercase leading-none tracking-[0.04em] text-muted ${className}`}
    >
      {p}
    </span>
  );
}

/**
 * A pick label that starts with the player's name ("Josh Allen Over 250.5") with the tag seated right after the name,
 * so a truncating line still shows it. A label that does not start with the name keeps the tag at its end.
 */
export function LabelWithPos({ label, player, pos }: { label: string; player?: string | null; pos: string | null | undefined }) {
  if (!player || !label.startsWith(player)) return <><span className="pick-identity-name">{label}</span><PosTag pos={pos} /></>;
  return <><span className="pick-identity-name">{player}</span><PosTag pos={pos} />{label.slice(player.length)}</>;
}
