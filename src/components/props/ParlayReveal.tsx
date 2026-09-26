"use client";
import { useEffect, useRef, useState } from "react";
import { amFmt, amToDec, decToAm } from "@/lib/ticket-math";

/**
 * THE REVEAL (2026-09-26, Josh: "Make the parlay generation more interactive like some kind of spinnings wheel,
 * reveal, etc whatever you think makes the most sense and is the most fun").
 *
 * A slot machine. On a Generate / Regenerate press every unlocked slot becomes a reel that spins through REAL legs
 * from the current pool — names, lines and posted prices the board actually carries, never an invented one — slows,
 * and lands top to bottom on the leg the generator already chose; locked slots stay put. Then the combined odds
 * count up to the ticket's price and the total flashes.
 *
 * It is presentation only: the ticket is fully computed before the first frame, the reels write text straight to the
 * DOM from requestAnimationFrame (no React render per frame), a tap on a reel skips to the result, and
 * prefers-reduced-motion gets the ticket at once.
 */
export const REEL_BASE_MS = 560;
export const REEL_STAGGER_MS = 170;
/** the last reel lands at most this long after the first — a 20-leg ticket (2026-09-26) would otherwise take 3.8s */
export const REEL_WINDOW_MS = 1600;
export const ODDS_COUNT_MS = 480;

/** `end` is Infinity while a reveal is HELD — the reels keep spinning until the spin's ticket exists */
export type Reveal = { spin: number; at: number; end: number };
export type ReelFace = { name: string; sub: string; price: string };

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** the gap between two landings: 170ms up to ten reels, tighter above that so the whole ticket lands inside REEL_WINDOW_MS */
export const staggerMs = (spinning: number): number =>
  spinning > 1 ? Math.min(REEL_STAGGER_MS, Math.floor(REEL_WINDOW_MS / (spinning - 1))) : REEL_STAGGER_MS;

/** when the k-th of `spinning` unlocked slots lands, in ms after the reveal starts */
export const landAtMs = (k: number, spinning = 1): number => REEL_BASE_MS + k * staggerMs(spinning);

/** A reveal for `spinning` unlocked slots, or null when there is nothing to spin or motion is reduced. */
export function startReveal(spin: number, spinning: number): Reveal | null {
  if (spinning <= 0 || prefersReducedMotion()) return null;
  return { spin, at: performance.now(), end: landAtMs(spinning - 1, spinning) };
}

/**
 * A HELD reveal: the reels spin with no landing while the desk is still fetching the quotes the spin will use (the
 * football Live/Mixed path refreshes prices first, then spins). The reels only ever land on the ticket that spin
 * produced — never on the old one that is about to be replaced (2026-09-26, Josh: "It shouldn't change anything
 * after it rolls them out one by one").
 */
export function holdReveal(spin: number, at: number): Reveal | null {
  if (prefersReducedMotion()) return null;
  return { spin, at, end: Infinity };
}

/** One reel over one slot. Unmounts itself once it has landed. */
export function ReelOverlay({ reveal, landAt, faces, offset, onSkip }: { reveal: Reveal; landAt: number; faces: readonly ReelFace[]; offset: number; onSkip: () => void }) {
  const [landed, setLanded] = useState(() => !faces.length);
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLSpanElement>(null);
  const price = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!faces.length) return;
    let raf = 0;
    let last = -Infinity;
    let k = offset;
    let stopped = false;
    const land = () => {
      try { navigator.vibrate?.(8); } catch { /* not offered on this device */ }
      const a = box.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-out", fill: "forwards" });
      if (a) a.onfinish = () => !stopped && setLanded(true);
      else setLanded(true);
    };
    const tick = () => {
      const t = performance.now() - reveal.at;
      if (t >= landAt) return land();
      /* fast at the start, slowing into the landing — the reel "catches". A held reel (landAt Infinity) stays fast. */
      const p = Number.isFinite(landAt) ? Math.max(0, t) / landAt : 0;
      const gap = 42 + 190 * p * p;
      if (t - last >= gap) {
        last = t;
        const f = faces[k++ % faces.length];
        if (name.current) name.current.textContent = f.name;
        if (sub.current) sub.current.textContent = f.sub;
        if (price.current) price.current.textContent = f.price;
        strip.current?.animate?.([{ transform: "translateY(-70%)", opacity: 0.25 }, { transform: "translateY(0)", opacity: 1 }], { duration: Math.min(gap, 170), easing: "cubic-bezier(.2,.8,.2,1)" });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [reveal, landAt, faces, offset]);
  if (landed) return null;
  return (
    <div ref={box} aria-hidden onClick={onSkip} title="Tap to skip" className="gen-reel absolute inset-0 z-10 flex cursor-pointer items-center overflow-hidden rounded-[inherit] px-2.5">
      <div ref={strip} className="gen-reel-strip flex min-w-0 flex-1 items-center gap-2">
        <span ref={name} className="min-w-0 truncate text-[12px] font-semibold text-text" />
        <span ref={sub} className="min-w-0 truncate text-[9.5px] text-muted" />
        <span ref={price} className="num ml-auto shrink-0 text-[13px] font-semibold text-pos" />
      </div>
    </div>
  );
}

/** The combined odds: "···" while the reels spin (and while a reveal is held), then a count up to the ticket's price. */
export function OddsTicker({ am, reveal }: { am: number; reveal: Reveal | null }) {
  const [done, setDone] = useState(!reveal);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!reveal) return setDone(true);
    const endDec = amToDec(am);
    const startDec = Math.min(2, endDec);
    let raf = 0;
    let shown = "";
    const write = (s: string) => { if (s !== shown && ref.current) { shown = s; ref.current.textContent = s; } };
    const tick = () => {
      const t = performance.now() - reveal.at - reveal.end;
      if (t < 0) write("···");
      else {
        const p = Math.min(1, t / ODDS_COUNT_MS);
        if (p >= 1) return setDone(true);
        write(amFmt(decToAm(startDec + (endDec - startDec) * (1 - (1 - p) ** 3))));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [am, reveal]);
  return done ? <>{amFmt(am)}</> : <span ref={ref} aria-hidden>···</span>;
}
