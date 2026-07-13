"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "gold" | "danger" | "hero";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-pos text-[#08090b] font-bold hover:brightness-110 glow-pos",
  ghost:
    "border border-line-2 bg-white/[0.04] text-text hover:bg-white/[0.08] hover:border-white/20",
  gold:
    "border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20",
  danger:
    "border border-neg/40 bg-neg/10 text-neg hover:bg-neg/20",
  hero: "liquid-glass text-text hover:bg-white/[0.06]",
};

/** Pill-shaped button — the only button shape in the product. */
export function Pill({
  variant = "ghost",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-[transform,background,filter,border-color] duration-(--dur-fast) active:scale-[0.96] disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Selectable filter pill (tabs, market filters, scopes). */
export function FilterPill({
  selected,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-[transform,background,color,border-color] duration-(--dur-fast) active:scale-[0.96] ${
        selected
          ? "border border-pos/60 bg-pos/15 text-pos"
          : "border border-line-2 bg-white/[0.03] text-muted hover:text-text hover:bg-white/[0.07]"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
