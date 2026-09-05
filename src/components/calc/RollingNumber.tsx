"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Rolling number (INSTRUCTION 40, 2026-09-05): the hero PAYS figure rolls from its last
 * value to the new one instead of snapping — a motion/react `animate` tween on the raw
 * number, formatted every frame. Mono/tabular so the width never jitters mid-roll.
 * Reduced motion: lands instantly. The very first paint never rolls from zero.
 */
export function RollingNumber({
  value,
  format,
  duration = 0.55,
  className = "",
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    const from = last.current;
    last.current = value;
    if (reduced || !Number.isFinite(from) || !Number.isFinite(value) || from === value) {
      setShown(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [value, duration, reduced]);

  return <span className={`num ${className}`}>{format(shown)}</span>;
}
