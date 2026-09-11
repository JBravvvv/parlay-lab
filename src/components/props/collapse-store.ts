"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * INSTRUCTION 50 (2026-09-11), item 5, Josh's word, verbatim: "Need to be able to collapse
 * list of picks for each individual game/prop by clicking/pressing in the top box that shows
 * the team matchup".
 *
 * The collapse itself already existed (GameHeader is a real <button aria-expanded>), but the
 * open/closed choice lived in a bare `useState(true)` INSIDE each card — so it was lost on
 * every remount (the props page re-mounts every card when the market changes or a deep link
 * narrows the list) and on every reload. This is that state, moved one level out: a tiny
 * localStorage-backed, subscribable set of COLLAPSED game keys.
 *
 * Three rules it obeys:
 *  1. OPEN IS THE DEFAULT. A game key that is not in the set is open, so a first-time board
 *     looks exactly as it does today. Changing that default is Josh's call, not a side effect
 *     of adding persistence.
 *  2. HYDRATION. The server, and the first client render, both see an EMPTY set (everything
 *     open) — `getServerSnapshot` returns false and the stored set is read only AFTER mount,
 *     from an effect. An initializer read would mismatch the server HTML.
 *  3. EVERY localStorage ACCESS IS IN try/catch. Private mode, a blocked-storage device or a
 *     corrupt value degrades to "everything open for this session", never to a thrown render.
 */

export const COLLAPSED_KEY = "pl:props:collapsed";

/** Keys are cheap; this only exists so a long season cannot grow the entry without bound. */
const MAX_KEYS = 400;

let mem: ReadonlySet<string> = new Set<string>();
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of [...listeners]) fn();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  /* another tab collapsed a card — mirror it here rather than letting the two drift */
  const onStorage = (e: StorageEvent) => {
    if (e.key !== COLLAPSED_KEY) return;
    hydrated = false;
    hydrateCollapsed();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stable key for one game card: the engine's game key when it has one, the matchup
    string otherwise (ML/RL groups on old boards carry no gkey). */
export function collapseKey(gkey: string | null | undefined, game: string): string {
  return gkey || game || "";
}

/** A DOM-safe id for the body panel a header controls (game strings hold spaces, "@" and "·"). */
export function panelIdFor(key: string): string {
  const slug = key
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `props-panel-${slug || "game"}`;
}

/** Read the stored set once, after mount. Idempotent: the first card to mount pays for all. */
export function hydrateCollapsed(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const next = new Set<string>();
    for (const v of parsed) if (typeof v === "string" && v) next.add(v);
    if (next.size === 0 && mem.size === 0) return;
    mem = next;
    emit();
  } catch {
    /* fresh device / storage blocked / corrupt value — every card stays open */
  }
}

function persist(set: ReadonlySet<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full or blocked — the choice still holds for this page life */
  }
}

export function isCollapsed(key: string): boolean {
  return mem.has(key);
}

export function setCollapsed(key: string, collapsed: boolean): void {
  if (!key || mem.has(key) === collapsed) return;
  const next = new Set(mem);
  if (collapsed) next.add(key);
  else next.delete(key);
  /* Sets keep insertion order, so the oldest collapse is the one that ages out */
  while (next.size > MAX_KEYS) {
    const oldest = next.values().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  mem = next;
  persist(next);
  emit();
}

export function toggleCollapsed(key: string): void {
  setCollapsed(key, !mem.has(key));
}

/** TEST SEAM: drop the in-memory set and re-arm the post-mount read. Not called by the UI. */
export function resetCollapsedForTest(): void {
  mem = new Set<string>();
  hydrated = false;
  emit();
}

/**
 * One card's open state + its toggle. `open` is true on the server and on the first client
 * render (see rule 2 above); the stored value arrives on the effect that follows.
 */
export function useGameCollapse(key: string): { open: boolean; toggle: () => void } {
  useEffect(() => {
    hydrateCollapsed();
  }, []);
  const collapsed = useSyncExternalStore(
    subscribe,
    () => mem.has(key),
    () => false,
  );
  const toggle = useCallback(() => toggleCollapsed(key), [key]);
  return { open: !collapsed, toggle };
}
