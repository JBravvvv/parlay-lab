import type { ReactNode } from "react";

const HALOS = {
  pos: "rgba(182,255,61,0.32)",
  gold: "rgba(199,154,59,0.34)",
  live: "rgba(92,200,255,0.30)",
} as const;

/**
 * Soft radial halo behind a hero element — light appears to emanate from
 * behind the content. Purely decorative (aria-hidden).
 */
export function Glow({
  tone = "pos",
  children,
  className = "",
}: {
  tone?: keyof typeof HALOS;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[130%] w-[115%] -translate-x-1/2 -translate-y-1/2 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${HALOS[tone]}, transparent 72%)` }}
      />
      {children}
    </div>
  );
}
