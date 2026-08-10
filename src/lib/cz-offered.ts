"use client";

import { useCallback, useEffect, useState } from "react";
import { getSyncKey } from "./ledgerSync";
import { mergeCzHidden, pruneCzHidden, validateCzHidden, type CzHiddenMap } from "./cz-hidden-merge";

/**
 * "IS THIS PICK OFFERED AT CAESARS RIGHT NOW?" (2026-08-09, Josh's call.)
 *
 * The board stopped holding picks back for having no Caesars price — every pick posts,
 * and JOSH is the instrument for offer-state: each pick carries an ⓘ whose toggle
 * defaults YES; flipping it to NO hides the pick from his board. Reversible (the
 * hidden count + reset line always shows), and it never touches the engine, the
 * card, or the record — display only.
 *
 * SYNCED ACROSS HIS DEVICES (2026-08-10, Josh's word). v2 stores {hidden, at} per
 * key under pl_cz_hidden_v2 and rides the ledger-sync phrase (x-pl-sync via
 * getSyncKey — Josh types it once per device in Settings; it is never entered for
 * him): pull + merge on load, debounced push on every toggle/reset. localStorage
 * stays the offline copy — no phrase, no network, and the toggle still works
 * device-locally exactly as before. Unhides write tombstones ({hidden: false})
 * so they out-vote stale hides on other devices; see cz-hidden-merge.ts.
 * v1 (bare key→true) migrates on first load and is left in place so a stale
 * cached bundle still finds its own key.
 */

const KEY_V1 = "pl_cz_hidden_v1";
const KEY = "pl_cz_hidden_v2";
const PULL_MIN_MS = 30_000; // remounts within this window reuse the last pull
const PUSH_DEBOUNCE_MS = 1_200; // rapid toggles coalesce into one PUT

function load(): CzHiddenMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = validateCzHidden(JSON.parse(raw));
      if (v.ok) return v.map;
    }
    const old = JSON.parse(localStorage.getItem(KEY_V1) ?? "{}") as Record<string, unknown>;
    const at = Date.now();
    const map: CzHiddenMap = {};
    for (const k of Object.keys(old)) if (old[k] === true) map[k] = { hidden: true, at };
    return map;
  } catch {
    return {};
  }
}

function save(map: CzHiddenMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full — session-only; the cloud copy is still the truth next pull */
  }
}

let lastPullAt = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Pull the cloud map and merge it over `local`. Null = no phrase on this
    device, pulled too recently, or offline — in every case local stands. */
async function pullMerge(local: CzHiddenMap): Promise<CzHiddenMap | null> {
  const key = getSyncKey();
  if (!key || Date.now() - lastPullAt < PULL_MIN_MS) return null;
  lastPullAt = Date.now();
  try {
    const res = await fetch("/api/prefs", { headers: { "x-pl-sync": key }, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { czHidden?: unknown };
    const v = j.czHidden != null ? validateCzHidden(j.czHidden) : null;
    const remote = v?.ok ? v.map : {};
    const merged = pruneCzHidden(mergeCzHidden(local, remote), Date.now());
    // this device knew something the cloud didn't (first sync, offline toggles) — push it up
    if (JSON.stringify(merged) !== JSON.stringify(remote)) schedulePush(merged);
    return merged;
  } catch {
    return null;
  }
}

function schedulePush(map: CzHiddenMap) {
  const key = getSyncKey();
  if (!key) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // fire-and-forget: the server merges (never replaces), and any concurrent
    // change from another device reconciles on that device's next pull
    void fetch("/api/prefs", {
      method: "PUT",
      headers: { "x-pl-sync": getSyncKey(), "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ czHidden: map }),
    }).catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

export function useCzHidden(): {
  hidden: CzHiddenMap;
  isHidden: (k: string) => boolean;
  toggle: (k: string) => void;
  reset: () => void;
  count: number;
} {
  const [hidden, setHidden] = useState<CzHiddenMap>({});
  useEffect(() => {
    const local = load();
    setHidden(local);
    void pullMerge(local).then((merged) => {
      if (merged) {
        save(merged);
        setHidden(merged);
      }
    });
  }, []);
  const toggle = useCallback((k: string) => {
    setHidden((h) => {
      const next = { ...h, [k]: { hidden: !h[k]?.hidden, at: Date.now() } };
      save(next);
      schedulePush(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    // tombstones, not removeItem(KEY): a reset must SYNC — clearing storage
    // would let every other device's stale hides win the next merge
    setHidden((h) => {
      const at = Date.now();
      const next: CzHiddenMap = { ...h };
      for (const k of Object.keys(next)) {
        if (next[k].hidden) next[k] = { hidden: false, at };
      }
      save(next);
      schedulePush(next);
      return next;
    });
  }, []);
  const count = Object.values(hidden).filter((e) => e.hidden).length;
  return { hidden, isHidden: (k) => !!hidden[k]?.hidden, toggle, reset, count };
}
