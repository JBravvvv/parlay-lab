"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * OVERLAY (INSTRUCTION 40, 2026-09-05): the one modal surface on the desk. Josh's ask — the
 * FPI board "can be put in a button that pops out into an overlay that covers 60% of the
 * screen and disappears when you click the 'x' in top right or click outside the borders".
 *
 *   size "sixty"  phone: a bottom sheet 60vh tall, full width, rounded top
 *                 ≥768px: a centered panel capped at 60vw × 60vh
 *   size "full"   phone: a 92dvh bottom sheet; desktop: a centered panel capped at 720px × 88vh
 *
 * Backdrop is a plain rgba dim — NO blur filter of any kind (the iOS freeze guard in tests/nav-flat).
 * Closes on backdrop tap, the × (aria-label "Close"), and Escape. Body scroll is locked while
 * open, focus moves into the panel on open and returns to the opener on close. Rendered through
 * a portal onto document.body so it escapes any transformed / overflow-clipped ancestor.
 * Enter/exit is motion/react opacity + translateY; reduced motion collapses it to a fade.
 */
export type OverlaySize = "sixty" | "full";

export type OverlayProps = {
  open: boolean;
  onClose: () => void;
  /** header text; also the dialog's accessible name */
  title: ReactNode;
  children: ReactNode;
  size?: OverlaySize;
  /** optional accent for the header rule: "cfb" (amber), "gold", default lime */
  tone?: "pos" | "cfb" | "gold";
  className?: string;
};

const SIZE_CLASS: Record<OverlaySize, string> = {
  sixty: "sheet-60",
  full: "sheet-full",
};
const TONE_CLASS: Record<NonNullable<OverlayProps["tone"]>, string> = {
  pos: "",
  cfb: "is-cfb",
  gold: "is-gold",
};

export function Overlay({ open, onClose, title, children, size = "sixty", tone = "pos", className = "" }: OverlayProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes; body scroll locks; focus moves into the panel and returns on close
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const rise = reduced ? 0 : 28;
  const tr = reduced ? { duration: 0.01 } : { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.9 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay-backdrop"
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0.01 } : { duration: 0.18 }}
          onClick={onClose}
          data-testid="overlay-backdrop"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className}`}
            initial={{ opacity: 0, y: rise }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: rise }}
            transition={tr}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-grab md:hidden" aria-hidden>
              <span />
            </div>
            <div className="sheet-head">
              <h2 id={titleId} className="display min-w-0 truncate text-[17px] leading-tight text-text">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="press -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 bg-white/[0.04] text-[13px] font-bold text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** `const fpi = useOverlay(); <Pill onClick={fpi.show}>FPI</Pill> <Overlay open={fpi.open} onClose={fpi.hide} …>` */
export function useOverlay(initial = false): { open: boolean; show: () => void; hide: () => void; toggle: () => void } {
  const [open, setOpen] = useState(initial);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, show, hide, toggle };
}
