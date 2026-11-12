"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/components/motion/Reveal";
import { DeskGate } from "@/components/shell/DeskGate";

/**
 * PAGE ENTER (INSTRUCTION 38, 2026-09-05): every route mounts with a fade on the shared
 * ease. A template re-mounts per navigation, so the entrance plays on every tab change —
 * the shell (rail, header, tab bar, backdrop) lives outside it in the layout and never blinks.
 *
 * OPACITY ONLY (iOS freeze fix, 2026-09-05): the first cut animated `top` on this wrapper
 * for 700ms, which re-laid-out the whole page (68 CFB cards) on every frame and stalled the
 * iPhone. Opacity composites without layout. It stays a plain `position: relative` box with
 * NO transform / will-change: the Parlay Builder's slip is position:fixed inside the page,
 * and a transformed ancestor would re-anchor it to this wrapper for the whole animation.
 *
 * prefers-reduced-motion: the page simply appears.
 */
const DUR_ENTER = 0.45;

export default function Template({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="relative"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR_ENTER, ease: [...EASE_OUT] }}
    >
      {/* 2026-11-12: a desk the app's own pages were not written for (College Basketball) shows its own
          page here, and an archived desk's pages get their banner; every other desk passes straight through */}
      <DeskGate>{children}</DeskGate>
    </motion.div>
  );
}
