"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/components/motion/Reveal";

/**
 * PAGE ENTER (INSTRUCTION 38, 2026-09-05): every route mounts with a fade + 8px rise on
 * the shared ease, over `--dur-reveal` (700ms). A template re-mounts per navigation, so
 * the entrance plays on every tab change — the shell (rail, header, tab bar, backdrop)
 * lives outside it in the layout and never blinks.
 *
 * The rise animates `top` on a position:relative wrapper, NOT a transform: the Parlay
 * Builder's slip is position:fixed inside the page, and a transformed (or will-change)
 * ancestor would re-anchor it to the wrapper for the whole animation. `top` on a relative
 * box moves the content the same 8px without touching any containing block.
 *
 * prefers-reduced-motion: the page simply appears.
 */
const DUR_REVEAL = 0.7;

export default function Template({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="relative"
      initial={reduced ? false : { opacity: 0, top: 8 }}
      animate={{ opacity: 1, top: 0 }}
      transition={{ duration: DUR_REVEAL, ease: [...EASE_OUT] }}
    >
      {children}
    </motion.div>
  );
}
