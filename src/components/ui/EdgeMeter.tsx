import { fmtPct } from "@/lib/format";

/**
 * Edge meter (INSTRUCTION 38, 2026-09-05): model vs market on one 0–100% scale —
 * two thin bars (the model's fair win probability over the de-vigged market probability)
 * and the gap between them in probability points. A missing market (null) renders "—"
 * and an empty track; nothing is invented to fill it.
 *
 * `fair` and `mkt` are probabilities 0..1 (the CfbRow convention).
 */
export function EdgeMeter({
  fair,
  mkt,
  tone = "pos",
  className = "",
}: {
  fair: number;
  mkt: number | null;
  /** the model bar's accent — lime (default) or the CFB amber */
  tone?: "pos" | "cfb";
  className?: string;
}) {
  const f = clamp01(fair);
  const m = mkt == null ? null : clamp01(mkt);
  const gapPts = m == null ? null : (f - m) * 100;
  const gapTone = gapPts == null ? "text-faint" : gapPts > 0 ? "text-pos" : gapPts < 0 ? "text-neg" : "text-muted";
  const label =
    m == null
      ? `Model ${fmtPct(f)}, market not priced`
      : `Model ${fmtPct(f)} vs market ${fmtPct(m)}, ${signed(gapPts!)} points`;

  return (
    <div className={`min-w-0 ${className}`} role="img" aria-label={label}>
      <Bar name="Model" p={f} fill={tone === "cfb" ? "bg-cfb" : "bg-pos"} />
      <Bar name="Market" p={m} fill="bg-text/40" className="mt-1" />
      <div className={`num mt-1 text-right text-[10px] leading-none ${gapTone}`}>
        {gapPts == null ? "— pts" : `${signed(gapPts)} pts`}
      </div>
    </div>
  );
}

function Bar({ name, p, fill, className = "" }: { name: string; p: number | null; fill: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="w-11 shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{name}</span>
      <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
        {p != null && (
          <span
            className={`block h-full rounded-full ${fill} transition-[width] duration-(--dur-reveal) ease-(--ease-out)`}
            style={{ width: `${p * 100}%` }}
          />
        )}
      </span>
      <span className="num w-11 shrink-0 text-right text-[10.5px] text-muted">{p == null ? "—" : fmtPct(p)}</span>
    </div>
  );
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

function signed(pts: number): string {
  const s = pts.toFixed(1);
  return pts > 0 ? `+${s}` : s;
}
