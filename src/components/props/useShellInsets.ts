"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/* measure before first paint in the browser; plain effect during SSR (no DOM) */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The AppShell's mobile top bar (sticky header) and bottom tab bar (fixed nav)
 * are outside this page; their heights depend on the iOS safe-area insets. The
 * sticky market rail and the slip need to sit exactly against them, so measure
 * both at runtime instead of hardcoding a pixel wall. On md+ both are
 * display:none, so they measure 0 and the page sticks to the viewport edges.
 * Measured in a layout effect so the first paint already has the right offsets
 * (no one-frame jump under the AppShell header).
 */
export function useShellInsets(): { top: number; bottom: number } {
  const [ins, setIns] = useState({ top: 0, bottom: 0 });
  useIsoLayoutEffect(() => {
    const hdr = document.querySelector<HTMLElement>("header.sticky");
    const nav = document.querySelector<HTMLElement>("nav.fixed");
    const read = () => setIns({ top: hdr?.offsetHeight ?? 0, bottom: nav?.offsetHeight ?? 0 });
    read();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    if (ro && hdr) ro.observe(hdr);
    if (ro && nav) ro.observe(nav);
    window.addEventListener("resize", read);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);
  return ins;
}

/**
 * The zoom the phone layout puts on the page content (globals.css: `.desk-content { zoom:0.7 }` below 768px) —
 * MEASURED, never assumed. A sticky offset set INSIDE the zoomed box is scaled by it too, so an in-content bar that
 * must sit against the unzoomed header or tab bar divides the measured inset by this (2026-09-28: the Props market
 * rail, the football By-game bar and the Builder's lock row sat 30% short — under the header / behind the tab bar).
 * The slips and the parlay bar are portaled out of the box and keep the raw insets. 1 on the server and on desktop.
 */
export function useContentZoom(): number {
  const [zoom, setZoom] = useState(1);
  useIsoLayoutEffect(() => {
    const read = () => {
      const box = document.querySelector<HTMLElement>(".desk-content");
      const z = box ? parseFloat(getComputedStyle(box).getPropertyValue("zoom")) : 1;
      setZoom(Number.isFinite(z) && z > 0 ? z : 1);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return zoom;
}
