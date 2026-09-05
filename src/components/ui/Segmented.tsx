"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Segmented control (INSTRUCTION 38, 2026-09-05): one pill track, one option lit.
 * The lit "thumb" is a motion `layoutId` element rendered inside the ACTIVE option, so
 * a change slides it to the new option on the spring-back ease (`--ease-press`) instead
 * of repainting. `.press` gives every option the haptic-feel tap scale.
 *
 * Accessibility: a radiogroup (each option is a radio; ← → move the selection).
 * The thumb never animates on first paint — the hydrated value (a localStorage-backed
 * store flips from its SSR default right after mount) lands instantly, not with a slide.
 */
export type SegmentedOption<K extends string> = {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  /** tooltip / accessible name when `label` is not plain text */
  title?: string;
};

/** the `--ease-press` snap: cubic-bezier(0.34, 1.56, 0.64, 1), a touch of overshoot */
export const SNAP: Transition = { type: "tween", duration: 0.32, ease: [0.34, 1.56, 0.64, 1] };
const INSTANT: Transition = { duration: 0 };

/** true one frame after mount — gates the first layout animation */
function useReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return ready;
}

const SIZE = {
  sm: "h-[26px] gap-[3px] px-1.5 text-[10px]",
  md: "h-[30px] gap-1.5 px-3 text-[11.5px]",
} as const;

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  size = "md",
  tone = "pos",
  label,
  className = "",
}: {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: "sm" | "md";
  /** the thumb's accent — lime (default) or the CFB amber */
  tone?: "pos" | "cfb";
  /** accessible name for the group */
  label?: string;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const ready = useReady();
  const group = useRef<HTMLDivElement>(null);
  const transition = ready && !reduced ? SNAP : INSTANT;
  const lit = tone === "cfb" ? "text-cfb" : "text-pos";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.key === value);
    if (i < 0) return;
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.key);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)]?.focus();
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={`segmented ${className}`}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={`press relative flex items-center justify-center whitespace-nowrap rounded-full font-semibold ${SIZE[size]} ${
              on ? lit : "text-muted hover:text-text"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`segmented-thumb-${id}`}
                initial={false}
                transition={transition}
                className={`segmented-thumb ${tone === "cfb" ? "is-cfb" : ""}`}
                aria-hidden
              />
            )}
            {o.icon != null && <span className="relative z-[1] leading-none">{o.icon}</span>}
            <span className="relative z-[1] leading-none">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
