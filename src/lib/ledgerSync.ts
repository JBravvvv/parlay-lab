"use client";

import { useEffect, useSyncExternalStore } from "react";
import { mergeLedgers, type SyncEntry } from "./ledger-merge";

/**
 * Client side of ledger sync. One sync phrase (entered once per device in
 * Settings) = one shared season record. Every sync is pull → merge → push:
 * the server merges too, so no device can ever erase another's locked days —
 * a wiped device simply refills from the cloud copy.
 *
 * Auto cadence: on open, on returning to the tab, within a minute of any
 * local ledger change, and a heartbeat every few minutes while visible.
 */

const KEY_LS = "pl_synckey";
const LEDGER_LS = "pl_ledger";
export const SYNC_EVENT = "pl:ledger-sync";

export type SyncState =
  | { kind: "off" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number; days: number }
  | { kind: "not-configured"; missing: string[] }
  | { kind: "bad-key" }
  | { kind: "error"; detail: string };

const OFF: SyncState = { kind: "off" };
let state: SyncState = OFF;
const subs = new Set<() => void>();
function setState(s: SyncState) {
  state = s;
  for (const f of subs) f();
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => OFF,
  );
}

export function getSyncKey(): string {
  try {
    return localStorage.getItem(KEY_LS) ?? "";
  } catch {
    return "";
  }
}

export function setSyncKey(key: string) {
  const k = key.trim();
  try {
    if (k) localStorage.setItem(KEY_LS, k);
    else localStorage.removeItem(KEY_LS);
  } catch {
    /* private-mode storage failure — sync just stays off */
  }
  if (k) void syncNow();
  else setState(OFF);
}

function readLocal(): { all: SyncEntry[]; locked: SyncEntry[]; unlocked: SyncEntry[]; raw: string } {
  let raw = "";
  let all: SyncEntry[] = [];
  try {
    raw = localStorage.getItem(LEDGER_LS) ?? "";
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) all = parsed;
  } catch {
    all = [];
  }
  return {
    all,
    locked: all.filter((e) => e && e.locked === true),
    unlocked: all.filter((e) => e && e.locked !== true),
    raw,
  };
}

/** Raw pl_ledger as of the last completed sync — the change detector. */
let lastSeenLocal: string | null = null;
let lastSyncAt = 0;
let inFlight = false;

export async function syncNow(): Promise<SyncState> {
  const key = getSyncKey();
  if (!key) {
    setState(OFF);
    return state;
  }
  if (inFlight) return state;
  inFlight = true;
  setState({ kind: "syncing" });
  try {
    const headers = { "x-pl-sync": key, "content-type": "application/json" };
    const res = await fetch("/api/ledger", { headers, cache: "no-store" });
    if (res.status === 503) {
      const j = (await res.json().catch(() => ({}))) as { missing?: string[] };
      setState({ kind: "not-configured", missing: j.missing ?? [] });
      return state;
    }
    if (res.status === 401) {
      setState({ kind: "bad-key" });
      return state;
    }
    if (!res.ok) {
      setState({ kind: "error", detail: `sync server ${res.status}` });
      return state;
    }
    const remote = ((await res.json()) as { ledger: SyncEntry[] }).ledger ?? [];

    const local = readLocal();
    let merged = mergeLedgers(local.locked, remote);

    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      const put = await fetch("/api/ledger", {
        method: "PUT",
        headers,
        cache: "no-store",
        body: JSON.stringify({ ledger: merged }),
      });
      if (put.ok) {
        // the server merged again (covers a concurrent push from the phone)
        merged = ((await put.json()) as { ledger: SyncEntry[] }).ledger ?? merged;
      } else if (put.status === 401) {
        setState({ kind: "bad-key" });
        return state;
      } else {
        const j = (await put.json().catch(() => ({}))) as { error?: string };
        setState({ kind: "error", detail: j.error ?? `push failed (${put.status})` });
        return state;
      }
    }

    const next = [...merged, ...local.unlocked].sort((a, b) => (a.date < b.date ? -1 : 1));
    const nextRaw = JSON.stringify(next);
    if (nextRaw !== local.raw) {
      try {
        localStorage.setItem(LEDGER_LS, nextRaw);
      } catch {
        setState({ kind: "error", detail: "device storage full" });
        return state;
      }
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    }
    lastSeenLocal = nextRaw;
    lastSyncAt = Date.now();
    setState({ kind: "synced", at: lastSyncAt, days: merged.length });
    return state;
  } catch {
    setState({ kind: "error", detail: "offline — will retry" });
    return state;
  } finally {
    inFlight = false;
  }
}

const TICK_MS = 60_000;
const HEARTBEAT_MS = 4 * 60_000;

/** Mounted once in the app shell — the whole auto-sync loop. */
export function useLedgerSyncBeacon() {
  useEffect(() => {
    // first sync always runs — even a background-loaded tab gets one pull;
    // the hidden-check only stops the RECURRING work from churning offscreen
    void syncNow();
    const kick = () => {
      if (!document.hidden) void syncNow();
    };
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("focus", kick);
    const iv = setInterval(() => {
      if (document.hidden || !getSyncKey()) return;
      let raw = "";
      try {
        raw = localStorage.getItem(LEDGER_LS) ?? "";
      } catch {
        /* unreadable — let the heartbeat handle it */
      }
      const changed = lastSeenLocal !== null && raw !== lastSeenLocal;
      if (changed || Date.now() - lastSyncAt > HEARTBEAT_MS) void syncNow();
    }, TICK_MS);
    return () => {
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("focus", kick);
      clearInterval(iv);
    };
  }, []);
}
