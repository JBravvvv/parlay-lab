import type { ReactNode } from "react";

/**
 * Stat tile (INSTRUCTION 38, 2026-09-05): one small focal number on its own glass —
 * label on top, the figure in the display face, an optional sub-line, an optional icon.
 * `tone` colors the figure and the tile's corner glint (`.stat-tile` in globals.css):
 * pos = lime, neg = red-orange, gold = the Caesars layer, cfb = the College Football
 * amber, muted = a quiet grey. The default figure is plain text.
 *
 * Nothing is formatted here — the caller passes the rendered value ("$150", "—", …),
 * so a missing feed value renders exactly as the caller says it should.
 */
export type StatTone = "pos" | "neg" | "gold" | "cfb" | "muted";

const TONE: Record<StatTone, string> = {
  pos: "text-pos",
  neg: "text-neg",
  gold: "text-gold",
  cfb: "text-cfb",
  muted: "text-muted",
};

const GLINT: Partial<Record<StatTone, string>> = { cfb: "is-cfb", gold: "is-gold", neg: "is-neg" };

export function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`stat-tile ${tone ? (GLINT[tone] ?? "") : ""} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[9.5px] font-bold uppercase tracking-[0.2em] text-muted">{label}</div>
        {icon != null && (
          <span className="shrink-0 text-[13px] leading-none text-faint" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div className={`display num mt-2 text-[22px] leading-none tracking-tight ${tone ? TONE[tone] : "text-text"}`}>
        {value}
      </div>
      {sub != null && <div className="num mt-1.5 text-[10.5px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}
