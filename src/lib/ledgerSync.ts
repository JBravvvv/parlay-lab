"use client";

import { useEffect, useSyncExternalStore } from "react";
import { mergeLedgers, type SyncEntry } from "./ledger-merge";
import { BANK_KEY, mergeBankStores, validateBankStore, type BankStore } from "./bankroll";
import { NOPLAY_KEY, mergeNoPlayLogs, validateNoPlayLog, type NoPlayLog } from "./noplay";
import { LEDGER_EPOCH, LOCAL_ARCHIVE_KEY, LOCAL_EPOCH_KEY } from "./ledger-epoch";

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

/* PAPER EPOCH (2026-08-15, Josh: "Clear the ledger"). When the cloud announces a newer
   epoch, this device ARCHIVES its local season first (first archive wins — re-adoption
   can never clobber it with an empty copy), then drops it and adopts. The old record is
   never destroyed: it sits under pl_ledger_archive_e1 here and pl:ledger:archive:e1 in
   the cloud. */
function localEpoch(): number {
  try {
    return Number(localStorage.getItem(LOCAL_EPOCH_KEY) ?? "1") || 1;
  } catch {
    return 1;
  }
}

function adoptEpoch(server: number) {
  if (!Number.isFinite(server) || server <= localEpoch()) return;
  try {
    const cur = localStorage.getItem(LEDGER_LS);
    if (cur && !localStorage.getItem(LOCAL_ARCHIVE_KEY)) localStorage.setItem(LOCAL_ARCHIVE_KEY, cur);
    localStorage.removeItem(LEDGER_LS);
    localStorage.setItem(LOCAL_EPOCH_KEY, String(server));
  } catch {
    /* storage failure — the next sync retries the adoption */
  }
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

/* Hardening Phase 1: the bankroll adjustment log (pl_bank2) rides the same
   pull → merge → push. The merge is an append-only union (see mergeBankStores),
   so a deposit logged on one device reaches every other device and no side can
   erase an entry — a first sync from a device with pre-sync local entries just
   merges them in (that IS the migration; de-dup is by ts+kind+amt+note). */
function readLocalBank(): { store: BankStore | null; raw: string } {
  let raw = "";
  try {
    raw = localStorage.getItem(BANK_KEY) ?? "";
    if (raw) {
      const v = validateBankStore(JSON.parse(raw));
      if (v.ok) return { store: v.store, raw };
    }
  } catch {
    /* unreadable — treat as absent; engine-client re-inits on next read */
  }
  return { store: null, raw };
}

/* Hardening Phase 3: the NO-PLAY verdict log (pl_noplay) syncs the same way —
   append-only union by date, earlier sighting wins. */
function readLocalNoPlay(): { log: NoPlayLog | null; raw: string } {
  let raw = "";
  try {
    raw = localStorage.getItem(NOPLAY_KEY) ?? "";
    if (raw) {
      const v = validateNoPlayLog(JSON.parse(raw));
      if (v.ok) return { log: v.log, raw };
    }
  } catch {
    /* unreadable — treat as absent */
  }
  return { log: null, raw };
}

/** Raw pl_ledger + pl_bank2 + pl_noplay as of the last completed sync — the change detector. */
let lastSeenLocal: string | null = null;
let lastSeenBank: string | null = null;
let lastSeenNoPlay: string | null = null;
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
    const got = (await res.json()) as { ledger: SyncEntry[]; bank?: unknown; noplay?: unknown; epoch?: number };
    adoptEpoch(Number(got.epoch ?? 1)); // BEFORE readLocal — the old season must not merge up
    const remote = got.ledger ?? [];
    const vb = got.bank != null ? validateBankStore(got.bank) : null;
    const remoteBank: BankStore | null = vb?.ok ? vb.store : null;
    const vn = got.noplay != null ? validateNoPlayLog(got.noplay) : null;
    const remoteNoPlay: NoPlayLog | null = vn?.ok ? vn.log : null;

    const local = readLocal();
    let merged = mergeLedgers(local.locked, remote);

    const localBank = readLocalBank();
    let mergedBank: BankStore | null =
      localBank.store && remoteBank ? mergeBankStores(localBank.store, remoteBank) : (localBank.store ?? remoteBank);
    const bankNeedsPush = mergedBank != null && JSON.stringify(mergedBank) !== JSON.stringify(remoteBank);

    const localNoPlay = readLocalNoPlay();
    let mergedNoPlay: NoPlayLog | null =
      localNoPlay.log && remoteNoPlay ? mergeNoPlayLogs(localNoPlay.log, remoteNoPlay) : (localNoPlay.log ?? remoteNoPlay);
    const noPlayNeedsPush = mergedNoPlay != null && JSON.stringify(mergedNoPlay) !== JSON.stringify(remoteNoPlay);

    if (JSON.stringify(merged) !== JSON.stringify(remote) || bankNeedsPush || noPlayNeedsPush) {
      const put = await fetch("/api/ledger", {
        method: "PUT",
        headers,
        cache: "no-store",
        body: JSON.stringify({
          ledger: merged,
          epoch: LEDGER_EPOCH, // the resurrection gate: a push must know the current era
          ...(mergedBank ? { bank: mergedBank } : {}),
          ...(mergedNoPlay ? { noplay: mergedNoPlay } : {}),
        }),
      });
      if (put.ok) {
        // the server merged again (covers a concurrent push from the phone)
        const back = (await put.json()) as { ledger: SyncEntry[]; bank?: unknown; noplay?: unknown };
        merged = back.ledger ?? merged;
        const vbb = back.bank != null ? validateBankStore(back.bank) : null;
        if (vbb?.ok) mergedBank = vbb.store;
        const vnb = back.noplay != null ? validateNoPlayLog(back.noplay) : null;
        if (vnb?.ok) mergedNoPlay = vnb.log;
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
    let changed = false;
    if (nextRaw !== local.raw) {
      try {
        localStorage.setItem(LEDGER_LS, nextRaw);
      } catch {
        setState({ kind: "error", detail: "device storage full" });
        return state;
      }
      changed = true;
    }
    const bankRaw = mergedBank ? JSON.stringify(mergedBank) : localBank.raw;
    if (mergedBank && bankRaw !== localBank.raw) {
      try {
        localStorage.setItem(BANK_KEY, bankRaw);
        changed = true;
      } catch {
        /* device storage full — the cloud copy is still the truth next sync */
      }
    }
    const noPlayRaw = mergedNoPlay ? JSON.stringify(mergedNoPlay) : localNoPlay.raw;
    if (mergedNoPlay && noPlayRaw !== localNoPlay.raw) {
      try {
        localStorage.setItem(NOPLAY_KEY, noPlayRaw);
        changed = true;
      } catch {
        /* device storage full — the cloud copy is still the truth next sync */
      }
    }
    if (changed) window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    lastSeenLocal = nextRaw;
    lastSeenBank = bankRaw;
    lastSeenNoPlay = noPlayRaw;
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
const CLV_MS = 15 * 60_000;

/* upgrade 03: nudge the server-side CLV sighting whenever a synced device has
   the app open — the server rate-caps and decides per game whether a pull is
   worth quota, so this is free redundancy under the cron-job.org schedule. */
let lastClv = 0;
function clvTick() {
  const key = getSyncKey();
  if (!key || Date.now() - lastClv < CLV_MS) return;
  lastClv = Date.now();
  fetch("/api/clv", { headers: { "x-pl-sync": key }, cache: "no-store" }).catch(() => {});
}

/** Mounted once in the app shell — the whole auto-sync loop. */
export function useLedgerSyncBeacon() {
  useEffect(() => {
    // first sync always runs — even a background-loaded tab gets one pull;
    // the hidden-check only stops the RECURRING work from churning offscreen
    void syncNow();
    clvTick();
    const kick = () => {
      if (!document.hidden) void syncNow();
    };
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("focus", kick);
    const iv = setInterval(() => {
      if (document.hidden || !getSyncKey()) return;
      let raw = "";
      let bankRaw = "";
      let noPlayRaw = "";
      try {
        raw = localStorage.getItem(LEDGER_LS) ?? "";
        bankRaw = localStorage.getItem(BANK_KEY) ?? "";
        noPlayRaw = localStorage.getItem(NOPLAY_KEY) ?? "";
      } catch {
        /* unreadable — let the heartbeat handle it */
      }
      const changed =
        (lastSeenLocal !== null && raw !== lastSeenLocal) ||
        (lastSeenBank !== null && bankRaw !== lastSeenBank) ||
        (lastSeenNoPlay !== null && noPlayRaw !== lastSeenNoPlay);
      if (changed || Date.now() - lastSyncAt > HEARTBEAT_MS) void syncNow();
      clvTick();
    }, TICK_MS);
    return () => {
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("focus", kick);
      clearInterval(iv);
    };
  }, []);
}
