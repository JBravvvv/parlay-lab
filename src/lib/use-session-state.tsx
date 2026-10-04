"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { WorkspaceSession } from "./workspace-session";
export const SessionScope = createContext("workspace");
let session: WorkspaceSession | null = null;
const listeners = new Set<() => void>();
let queued = false;
export function currentSession() { return session; }
export function startSession() {
  if (!session) {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch {}
    session = new WorkspaceSession(storage);
  }
  return session;
}
function checkpoint() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; session?.flush(); });
}
export function readSession<T>(key: string, initial: () => T): T { return session ? session.read(key, initial) : initial(); }
export function writeSession<T>(key: string, value: T, notify = true) {
  session?.write(key, value); checkpoint();
  if (notify) listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** Stable snapshots; scoped by route and sport. No mount effect overwrites a restored value. */
export function useSessionState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(SessionScope);
  const key = `${scope}:${name}`;
  const fallback = useMemo(() => typeof initial === "function" ? (initial as () => T)() : initial, [key]);
  const snapshot = useCallback(() => readSession(key, () => fallback), [key, fallback]);
  const value = useSyncExternalStore(subscribe, snapshot, () => fallback);
  const latest = useRef(value); latest.current = value;
  const set = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    const before = readSession(key, () => latest.current);
    const next = typeof update === "function" ? (update as (v: T) => T)(before) : update;
    if (Object.is(before, next)) return;
    latest.current = next;
    writeSession(key, next);
  }, [key]);
  return [value, set];
}
/** Ref payloads (held ticket, undo and history) share the same session without notifying during render. */
export function useSessionRef<T>(name: string, initial: T) {
  const scope = useContext(SessionScope);
  const key = `${scope}:${name}`;
  return useMemo(() => {
    let fallback = initial;
    return { get current(): T { return readSession(key, () => fallback); },
      set current(value: T) { fallback = value; writeSession(key, value, false); } };
  }, [key]);
}
