"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSyncKey, type SyncState } from "@/lib/ledgerSync";
import { mergeLedgers } from "@/lib/ledger-merge";
import { mergeBankStores, validateBankStore, type BankStore } from "@/lib/bankroll";
import type { LeagueConfig } from "@/lib/football/league";
import type { DeviceStore } from "@/lib/football/store";
import type { CfbLedgerEntry } from "@/lib/cfb/types";

/**
 * THE FOOTBALL SYNC LOOP FACTORY (2026-09-08, the NFL build) — a desk's own pull → merge → push
 * loop against its own ledger route (`cfg.routes.ledger`) and its own cloud blobs, behind the ONE
 * sync phrase Josh already entered in Settings (read through ledgerSync's getSyncKey; this module
 * never stores or logs the phrase anywhere new).
 *
 * This is the College Football loop (src/lib/cfb/sync.ts, which stays as it is — its source is
 * pinned by name) with the route, the sync event and the device store taken off `cfg`. Every
 * instance owns its own state cell, subscriber set, change detector and in-flight latch, so two
 * desks syncing on one page never block or mislabel each other.
 *
 * Same contract as the MLB loop: the server merges too, so no device can erase another's locked
 * day — a wiped device refills from the cloud copy. Cadence: on open, on returning to the tab,
 * within a minute of any local change, and a heartbeat every few minutes while visible. No epoch
 * machinery and no NO-PLAY log ride these rails (see the CFB ledger route header).
 */

export type SyncConfig = Pick<LeagueConfig, "id" | "routes" | "events"> & { store: DeviceStore };

export type DeskSyncLoop = {
  /** the ledger route this loop talks to — exposed so a test can pin it without a source scan */
  ENDPOINT: string;
  useSyncState: () => SyncState;
  syncNow: () => Promise<void>;
  /** Mounted once in the app shell next to the other desks' beacons — the whole auto-sync loop. */
  useSyncBeacon: () => void;
};

const TICK_MS = 60_000;
const HEARTBEAT_MS = 4 * 60_000;
const OFF: SyncState = { kind: "off" };

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function makeSync(cfg: SyncConfig): DeskSyncLoop {
  const ENDPOINT = cfg.routes.ledger;
  const SYNC_EVENT = cfg.events.sync;
  const { store } = cfg;

  let state: SyncState = OFF;
  const subs = new Set<() => void>();
  function setState(s: SyncState) {
    state = s;
    for (const f of subs) f();
  }

  function useSyncState(): SyncState {
    return useSyncExternalStore(
      (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      () => state,
      () => OFF,
    );
  }

  /** Raw ledger + bank strings as of the last completed sync — the change detector. */
  let lastSeenLedger: string | null = null;
  let lastSeenBank: string | null = null;
  let lastSyncAt = 0;
  let inFlight = false;

  async function syncNow(): Promise<void> {
    const key = getSyncKey();
    if (!key) {
      setState(OFF);
      return;
    }
    if (inFlight) return;
    inFlight = true;
    setState({ kind: "syncing" });
    try {
      const headers = { "x-pl-sync": key, "content-type": "application/json" };
      const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
      if (res.status === 503) {
        const j = (await res.json().catch(() => ({}))) as { missing?: string[] };
        setState({ kind: "not-configured", missing: j.missing ?? [] });
        return;
      }
      if (res.status === 401) {
        setState({ kind: "bad-key" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", detail: `sync server ${res.status}` });
        return;
      }
      const got = (await res.json()) as { ledger?: unknown; bank?: unknown };
      const remote = store.entriesOf(got.ledger);
      const vb = got.bank != null ? validateBankStore(got.bank) : null;
      const remoteBank: BankStore | null = vb?.ok ? vb.store : null;

      const local = store.readLedger();
      let merged: CfbLedgerEntry[] = store.entriesOf(mergeLedgers(local, remote));

      const localBank = store.readBankStore();
      let mergedBank: BankStore | null = localBank && remoteBank ? mergeBankStores(localBank, remoteBank) : (localBank ?? remoteBank);
      const bankNeedsPush = mergedBank != null && !sameJson(mergedBank, remoteBank);

      if (!sameJson(merged, remote) || bankNeedsPush) {
        const put = await fetch(ENDPOINT, {
          method: "PUT",
          headers,
          cache: "no-store",
          body: JSON.stringify({ ledger: merged, ...(mergedBank ? { bank: mergedBank } : {}) }),
        });
        if (put.ok) {
          // the server merged again (covers a concurrent push from the phone)
          const back = (await put.json()) as { ledger?: unknown; bank?: unknown };
          const backLedger = store.entriesOf(back.ledger);
          if (Array.isArray(back.ledger)) merged = backLedger;
          const vbb = back.bank != null ? validateBankStore(back.bank) : null;
          if (vbb?.ok) mergedBank = vbb.store;
        } else if (put.status === 401) {
          setState({ kind: "bad-key" });
          return;
        } else {
          const j = (await put.json().catch(() => ({}))) as { error?: string };
          setState({ kind: "error", detail: j.error ?? `push failed (${put.status})` });
          return;
        }
      }

      const before = store.readRaw();
      let changed = false;
      // an untouched device holds "" — the same record as "[]", not a change worth a write
      if (JSON.stringify(merged) !== (before.ledger || "[]")) {
        if (!store.writeLedger(merged)) {
          setState({ kind: "error", detail: "device storage full" });
          return;
        }
        changed = true;
      }
      if (mergedBank && JSON.stringify(mergedBank) !== before.bank) {
        if (store.writeBankStore(mergedBank)) changed = true;
        /* a failed bank write is not fatal — the cloud copy is still the truth next sync */
      }
      if (changed) window.dispatchEvent(new CustomEvent(SYNC_EVENT));
      const after = store.readRaw();
      lastSeenLedger = after.ledger;
      lastSeenBank = after.bank;
      lastSyncAt = Date.now();
      setState({ kind: "synced", at: lastSyncAt, days: merged.length });
    } catch {
      setState({ kind: "error", detail: "offline — will retry" });
    } finally {
      inFlight = false;
    }
  }

  function useSyncBeacon() {
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
        const raw = store.readRaw();
        const changed = (lastSeenLedger !== null && raw.ledger !== lastSeenLedger) || (lastSeenBank !== null && raw.bank !== lastSeenBank);
        if (changed || Date.now() - lastSyncAt > HEARTBEAT_MS) void syncNow();
      }, TICK_MS);
      return () => {
        document.removeEventListener("visibilitychange", kick);
        window.removeEventListener("focus", kick);
        clearInterval(iv);
      };
    }, []);
  }

  return { ENDPOINT, useSyncState, syncNow, useSyncBeacon };
}
