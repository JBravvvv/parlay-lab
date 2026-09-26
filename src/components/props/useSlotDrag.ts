"use client";
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./ParlayReveal";

/**
 * HOLD-AND-DRAG REORDER (2026-09-26, Josh, verbatim: "Should be able to press on pick in parlay generator and drag it
 * to wherever on list").
 *
 * The 2026-09-18 reorder used the HTML5 `draggable` API, which a phone never fires: on a thumb the only way to move a
 * pick was the tiny ▲/▼ pair beside the lock. This is pointer-based, so one gesture works everywhere:
 *   - a THUMB holds the card for HOLD_MS, it lifts (a short buzz where the phone offers one), and then it follows the
 *     finger. Moving more than SLOP_PX before the hold ends is a scroll and the page scrolls exactly as before;
 *   - a MOUSE lifts the card as soon as it has moved MOUSE_START_PX with the button down.
 * While a card is lifted the others slide apart to open the gap it will drop into, and the list scrolls itself when the
 * finger sits near the top or bottom of the screen, so slot 20 can travel to slot 1. On release the move is committed
 * ONCE through `onMove(from, to)` — the same call the ▲/▼ buttons make, so a pin still travels with its leg.
 *
 * The frames never re-render React: the cards are moved with inline transforms and only the drop sets state. Controls
 * marked `data-no-drag` (the lock, the exclude ✕, the ▲/▼) never start a drag, and the tap that ends a hold is
 * swallowed so releasing a lifted card never also opens the player sheet under the finger.
 */
export const HOLD_MS = 260;
export const SLOP_PX = 8;
export const MOUSE_START_PX = 4;

/** Where a card lifted from `from` drops: how many OTHER cards' resting centres sit above its current centre `y`. */
export function dropIndex(from: number, centers: readonly number[], y: number): number {
  let to = 0;
  for (let i = 0; i < centers.length; i++) if (i !== from && centers[i] < y) to++;
  return to;
}

/**
 * THE PHONE CONTENT IS ZOOMED (`.desk-content { zoom: 0.7 }` below 768px, 2026-09-26), and a transform inside a zoomed box
 * moves 0.7× on screen — a card following `translateY(dy)` would trail the finger by 30%. Worse, engines disagree on
 * whether getBoundingClientRect includes an ancestor's zoom (standardised zoom, Chrome 128+: it does; the older
 * WebKit model: it reports un-zoomed units). So nothing is assumed: at lift the card is nudged by a known translate and
 * `k` — rect units per translate px — is MEASURED. A zoom-aware engine reports k ≈ zoom and its rects are already on the
 * finger's scale; an engine that reports k = 1 either has no zoom or un-zoomed rects, and the ancestors' computed zoom
 * decides which. Returns the effective zoom (finger px per translate px) and the rect → finger-px factor.
 */
export function zoomFactors(k: number, computedZoom: number): { zoom: number; toScreen: number } {
  const kk = Number.isFinite(k) && k > 0.05 ? k : 1;
  const cz = Number.isFinite(computedZoom) && computedZoom > 0.05 ? computedZoom : 1;
  if (kk < 0.999) return { zoom: kk, toScreen: 1 };
  return { zoom: cz, toScreen: cz };
}

function ancestorZoom(el: Element): number {
  let z = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).getPropertyValue("zoom"));
    if (Number.isFinite(v) && v > 0) z *= v;
  }
  return z;
}

/** Which way card `i` slides (in units of the lifted card's pitch) while the card from `from` hovers over slot `to`. */
export function shiftOf(i: number, from: number, to: number): -1 | 0 | 1 {
  if (i === from) return 0;
  if (from < to && i > from && i <= to) return -1;
  if (to < from && i >= to && i < from) return 1;
  return 0;
}

type Gesture = {
  i: number;
  /** the card the finger actually pressed — a lift is refused unless it is still that card, in this list */
  card: HTMLElement;
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  /** the page's scroll offset at the press — positions are compared in document space so auto-scroll just works */
  scroll0: number;
  lastY: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  raf: number;
  els: HTMLElement[];
  /** finger px, document space */
  centers: number[];
  /** finger px */
  pitch: number;
  /** finger px per translate px (the phone's 0.7 content zoom), and rect units per translate px */
  zoom: number;
  k: number;
  to: number;
  off: () => void;
};

export function useSlotDrag(
  onMove: ((from: number, to: number) => void) | undefined,
  enabled: boolean,
  /** the ticket on screen — a different ticket is a different list, and a drag never survives into it */
  listKey?: string | null,
): { listRef: RefObject<HTMLDivElement | null>; grab: ((i: number) => (e: ReactPointerEvent<HTMLElement>) => void) | null } {
  const listRef = useRef<HTMLDivElement | null>(null);
  const g = useRef<Gesture | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  /* a sheet that closes (or a ticket that re-renders away) mid-drag must not leave listeners or transforms behind */
  useEffect(() => () => g.current?.off(), []);
  useEffect(() => { if (!enabled) g.current?.off(); }, [enabled]);
  /* the list was swapped under the finger (a new ticket landed, a provisional one firmed up): drop the gesture, so the
     drop never reorders a ticket Josh did not touch and a stranded lift can never keep the scroll gate shut on iOS,
     where the removed card's touch events no longer reach the window (2026-09-26 review) */
  useLayoutEffect(() => () => g.current?.off(), [listKey]);
  /* THE SCROLL GATE is registered up front, not when a finger lands. WebKit settles whether it may scroll a touch
     without asking the page when that touch BEGINS, so a non-passive touchmove listener added from inside the touch
     cannot stop the scroll on iOS (WebKit bug 184250 — the same reason drag libraries register one at mount). It
     only ever cancels a move while a card is lifted; every other swipe scrolls exactly as before. */
  const live = !!onMove && enabled;
  useEffect(() => {
    if (!live) return;
    const gate = (ev: TouchEvent) => { if (g.current?.active && ev.cancelable) ev.preventDefault(); };
    window.addEventListener("touchmove", gate, { passive: false });
    return () => window.removeEventListener("touchmove", gate);
  }, [live]);

  if (!onMove || !enabled) return { listRef, grab: null };

  const grab = (i: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (g.current || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element | null)?.closest?.("[data-no-drag]")) return;
    const touch = e.pointerType !== "mouse";
    const st: Gesture = {
      i, card: e.currentTarget, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY, scroll0: window.scrollY, lastY: e.clientY,
      active: false, timer: null, raf: 0, els: [], centers: [], pitch: 0, zoom: 1, k: 1, to: i, off: () => {},
    };

    const lift = () => {
      const root = listRef.current;
      if (!root || g.current !== st) return end(false);
      st.els = Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-gen-slot]"));
      const el = st.els[i];
      if (!el || el !== st.card || !el.isConnected) return end(false);
      const rects = st.els.map((x) => x.getBoundingClientRect());
      /* measure how a translate maps onto rect units here (see zoomFactors) — one forced layout, once per lift */
      el.style.transform = "translateY(100px)";
      st.k = (el.getBoundingClientRect().top - rects[i].top) / 100;
      el.style.transform = "";
      const { zoom, toScreen } = zoomFactors(st.k, ancestorZoom(el));
      st.zoom = zoom;
      if (!(st.k > 0.05)) st.k = 1;
      st.centers = rects.map((r) => (r.top + r.height / 2) * toScreen + window.scrollY);
      const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
      st.pitch = (rects[i].height + gap) * toScreen;
      st.active = true;
      root.setAttribute("data-slots-dragging", "");
      el.setAttribute("data-lifted", "");
      try { navigator.vibrate?.(10); } catch { /* not offered on this device */ }
      follow(st.lastY);
      st.raf = requestAnimationFrame(edgeScroll);
    };

    /* place the lifted card under the finger and open the gap it would drop into */
    const follow = (clientY: number) => {
      st.lastY = clientY;
      const dy = clientY + window.scrollY - (st.y0 + st.scroll0);
      st.els[i].style.transform = `translateY(${dy / st.zoom}px) scale(1.02)`;
      const to = dropIndex(i, st.centers, st.centers[i] + dy);
      if (to === st.to) return;
      st.to = to;
      st.els.forEach((el, k) => {
        if (k === i) return;
        const s = shiftOf(k, i, to);
        el.style.transform = s ? `translateY(${(s * st.pitch) / st.zoom}px)` : "";
      });
    };

    /* the finger parked near the top or bottom of the screen scrolls the page, so a long ticket can be crossed */
    const edgeScroll = () => {
      if (!st.active || g.current !== st) return;
      if (!st.els[i]?.isConnected) return end(false); // any remount the ticket key did not catch
      const h = window.innerHeight;
      const top = h * 0.14;
      const bottom = h * 0.84;
      const y = st.lastY;
      const v = y < top ? -Math.ceil(16 * (1 - y / top)) : y > bottom ? Math.ceil(16 * Math.min(1, (y - bottom) / (h - bottom))) : 0;
      if (v) {
        window.scrollBy(0, v);
        follow(st.lastY);
      }
      st.raf = requestAnimationFrame(edgeScroll);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== st.pointerId) return;
      if (st.active) {
        ev.preventDefault();
        follow(ev.clientY);
        return;
      }
      const dist = Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0);
      if (st.touch) {
        if (dist > SLOP_PX) end(false); // it is a scroll — hand the page back
      } else if (dist >= MOUSE_START_PX) {
        st.lastY = ev.clientY;
        lift();
      }
    };
    const onPointerUp = (ev: PointerEvent) => { if (ev.pointerId === st.pointerId) end(true); };
    const onPointerCancel = (ev: PointerEvent) => { if (ev.pointerId === st.pointerId) end(false); };
    const onContextMenu = (ev: Event) => { ev.preventDefault(); };

    const off = () => {
      if (st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(st.raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("contextmenu", onContextMenu, true);
      listRef.current?.removeAttribute("data-slots-dragging");
      for (const el of st.els) { el.removeAttribute("data-lifted"); el.style.transform = ""; }
      if (g.current === st) g.current = null;
    };
    st.off = off;

    function end(commit: boolean) {
      const lifted = st.active;
      const from = st.i;
      const to = st.to;
      const el = st.els[from];
      const here = !!el?.isConnected && !!listRef.current?.contains(el);
      const before = lifted && here ? el.getBoundingClientRect().top : 0;
      /* transitions off BEFORE the DOM reorders, so no card animates from a stale offset */
      listRef.current?.removeAttribute("data-slots-dragging");
      if (lifted && commit && here && to !== from) flushSync(() => moveRef.current?.(from, to));
      off();
      if (!lifted) return;
      /* settle the card from where the finger left it into its new seat — unless motion is reduced */
      if (here && el.isConnected && !prefersReducedMotion()) {
        const after = el.getBoundingClientRect().top;
        el.animate?.([{ transform: `translateY(${(before - after) / st.k}px)` }, { transform: "none" }], { duration: 170, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
      /* the tap that ends a hold is not a tap on whatever sits under the finger — but a NEW touch after the drop is a
         real tap (a quick lock right after a drag), so the next pointer-down disarms it */
      const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      const disarm = () => { window.removeEventListener("click", swallow, true); window.removeEventListener("pointerdown", disarm, true); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.addEventListener("pointerdown", disarm, { capture: true, once: true });
      setTimeout(disarm, 400);
    }

    g.current = st;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("contextmenu", onContextMenu, true);
    if (touch) st.timer = setTimeout(lift, HOLD_MS);
  };

  return { listRef, grab };
}
