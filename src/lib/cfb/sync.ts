"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSyncKey, type SyncState } from "@/lib/ledgerSync";
import { mergeLedgers } from "@/lib/ledger-merge";
import { mergeBankStores, validateBankStore, type BankStore } from "@/lib/bankroll";
import { CFB_SYNC_EVENT, cfbEntriesOf, readCfbBankStore, readCfbLedger, readCfbRaw, writeCfbBankStore, writeCfbLedger } from "./store";
import type { CfbLedgerEntry } from "./types";

/**
 * Client side of College Football ledger sync — the CFB record's own pull → merge → push
 * loop against its own route (/api/cfb/ledger) and its own cloud blobs, behind the ONE sync
 * phrase Josh already entered in Settings (read through ledgerSync's getSyncKey; this module
 * never stores or logs the phrase anywhere new).
 *
 * Same contract as the MLB loop: the server merges too, so no device can erase another's
 * locked Saturday — a wiped device refills from the cloud copy. Cadence: on open, on returning
 * to the tab, within a minute of any local CFB change, and a heartbeat every few minutes while
 * visible. No epoch machinery and no NO-PLAY log ride these rails (see the route header).
 */

export { CFB_SYNC_EVENT };
export type CfbSyncState = SyncState;

const ENDPOINT = "/api/cfb/ledger";
const OFF: SyncState = { kind: "off" };
let state: SyncState = OFF;
const subs = new Set<() => void>();
function setState(s: SyncState) {
  state = s;
  for (const f of subs) f();
}

export function useCfbSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => OFF,
  );
}

/** Raw CFB ledger + bank strings as of the last completed sync — the change detector. */
let lastSeenLedger: string | null = null;
let lastSeenBank: string | null = null;
let lastSyncAt = 0;
let inFlight = false;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function syncCfbNow(): Promise<void> {
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
    const remote = cfbEntriesOf(got.ledger);
    const vb = got.bank != null ? validateBankStore(got.bank) : null;
    const remoteBank: BankStore | null = vb?.ok ? vb.store : null;

    const local = readCfbLedger();
    let merged: CfbLedgerEntry[] = cfbEntriesOf(mergeLedgers(local, remote));

    const localBank = readCfbBankStore();
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
        const backLedger = cfbEntriesOf(back.ledger);
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

    const before = readCfbRaw();
    let changed = false;
    // an untouched device holds "" — the same record as "[]", not a change worth a write
    if (JSON.stringify(merged) !== (before.ledger || "[]")) {
      if (!writeCfbLedger(merged)) {
        setState({ kind: "error", detail: "device storage full" });
        return;
      }
      changed = true;
    }
    if (mergedBank && JSON.stringify(mergedBank) !== before.bank) {
      if (writeCfbBankStore(mergedBank)) changed = true;
      /* a failed bank write is not fatal — the cloud copy is still the truth next sync */
    }
    if (changed) window.dispatchEvent(new CustomEvent(CFB_SYNC_EVENT));
    const after = readCfbRaw();
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

const TICK_MS = 60_000;
const HEARTBEAT_MS = 4 * 60_000;

/** Mounted once in the app shell next to the MLB beacon — the whole CFB auto-sync loop. */
export function useCfbSyncBeacon() {
  useEffect(() => {
    // first sync always runs — even a background-loaded tab gets one pull;
    // the hidden-check only stops the RECURRING work from churning offscreen
    void syncCfbNow();
    const kick = () => {
      if (!document.hidden) void syncCfbNow();
    };
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("focus", kick);
    const iv = setInterval(() => {
      if (document.hidden || !getSyncKey()) return;
      const raw = readCfbRaw();
      const changed = (lastSeenLedger !== null && raw.ledger !== lastSeenLedger) || (lastSeenBank !== null && raw.bank !== lastSeenBank);
      if (changed || Date.now() - lastSyncAt > HEARTBEAT_MS) void syncCfbNow();
    }, TICK_MS);
    return () => {
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("focus", kick);
      clearInterval(iv);
    };
  }, []);
}
