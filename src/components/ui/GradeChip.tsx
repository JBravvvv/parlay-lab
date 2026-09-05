"use client";

import type { Grade } from "@/lib/grade";

/**
 * The S/A–F grade chip (2026-08-10, Josh's ask; S added 2026-09-04, INSTRUCTION 32). Color follows the design system's
 * one-accent-per-meaning rule: electric green family for +EV tiers, muted for
 * about-fair, red-orange family for −EV tiers. The title states the basis and
 * the fixed cutoffs so the grade is self-explanatory on hover.
 */

const STYLE: Record<Grade, string> = {
  S: "border-gold/70 bg-gold/20 text-gold shadow-[0_0_10px_rgba(255,200,80,0.25)]",
  A: "border-pos/60 bg-pos/15 text-pos",
  B: "border-acc-green/50 bg-acc-green/10 text-acc-green",
  C: "border-line-2 bg-surface-2 text-muted",
  D: "border-neg/40 bg-neg/[0.07] text-neg/80",
  F: "border-neg/60 bg-neg/15 text-neg",
};

export function GradeChip({ grade, basis }: { grade: Grade | null; basis: string }) {
  if (!grade) return <span className="text-faint">—</span>;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold ${STYLE[grade]}`}
      title={`Tier ${grade} on ${basis} · fixed cutoffs: S ≥ +6, A ≥ +3, B ≥ +1, C ≥ −1 (about fair), D ≥ −3, F below −3 · a label on the engine's own number, not a prediction`}
    >
      {grade}
    </span>
  );
}
