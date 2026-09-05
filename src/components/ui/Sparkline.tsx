import { useId } from "react";

/**
 * Sparkline (INSTRUCTION 38, 2026-09-05): an inline SVG line with a soft fill under it
 * and an end-point dot — the equity curve in a stat row, nothing more. It stretches to
 * its container (`preserveAspectRatio="none"` + a non-scaling stroke), and the dot is an
 * HTML element placed by percentage so it stays round at any stretch.
 *
 * `tone` "auto" reads the series: lime when it ends at or above where it began, red-orange
 * otherwise. Fewer than two points render a flat dashed baseline — no curve is invented.
 */
export type SparkTone = "auto" | "pos" | "neg" | "gold" | "cfb" | "muted";

const COLOR: Record<Exclude<SparkTone, "auto">, string> = {
  pos: "var(--color-pos)",
  neg: "var(--color-neg)",
  gold: "var(--color-gold)",
  cfb: "var(--color-cfb)",
  muted: "var(--color-muted)",
};

const W = 100; // internal x units (percent of the width)
const PAD = 2; // px of vertical breathing room so the stroke never clips

export function Sparkline({
  values,
  tone = "auto",
  height = 36,
  strokeWidth = 1.75,
  className = "",
  label,
}: {
  values: readonly number[];
  tone?: SparkTone;
  /** px */
  height?: number;
  strokeWidth?: number;
  className?: string;
  /** accessible description; defaults to the point count */
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const pts = values.filter((v) => Number.isFinite(v));
  const n = pts.length;
  const color =
    tone === "auto" ? (n >= 2 && pts[n - 1] < pts[0] ? COLOR.neg : COLOR.pos) : COLOR[tone];

  if (n < 2) {
    return (
      <span
        className={`relative block w-full ${className}`}
        style={{ height }}
        role="img"
        aria-label={label ?? `${n} point${n === 1 ? "" : "s"} — not enough for a curve`}
      >
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <line
            x1="0"
            x2={W}
            y1={height / 2}
            y2={height / 2}
            stroke="var(--color-line-2)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => height - PAD - ((v - min) / span) * (height - PAD * 2);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${height} L0 ${height} Z`;
  const last = pts[n - 1];

  return (
    <span
      className={`relative block w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={label ?? `${n} points, ending at ${last}`}
    >
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: "100%",
          top: `${(y(last) / height) * 100}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </span>
  );
}
