"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Shared easing token — everything eases the same way. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Scroll-reveal wrapper: fade + rise, once, softly eased.
 * Under prefers-reduced-motion the content just renders in place.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay, ease: [...EASE_OUT] }}
    >
      {children}
    </motion.div>
  );
}
