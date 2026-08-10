"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "IS THIS PICK OFFERED AT CAESARS RIGHT NOW?" (2026-08-09, Josh's call.)
 *
 * The board stopped holding picks back for having no Caesars price — every pick posts,
 * and JOSH is the instrument for offer-state: each pick carries an ⓘ whose toggle
 * defaults YES; flipping it to NO hides the pick from his board. Device-local
 * (localStorage), reversible (the hidden count + reset line always shows), and it never
 * touches the engine, the card, or the record — display only.
 */

const KEY = "pl_cz_hidden_v1";

function load(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

export function useCzHidden(): {
  hidden: Record<string, true>;
  isHidden: (k: string) => boolean;
  toggle: (k: string) => void;
  reset: () => void;
  count: number;
} {
  const [hidden, setHidden] = useState<Record<string, true>>({});
  useEffect(() => setHidden(load()), []);
  const toggle = useCallback((k: string) => {
    setHidden((h) => {
      const next = { ...h };
      if (next[k]) delete next[k];
      else next[k] = true;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage full — session-only */
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    setHidden({});
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);
  return { hidden, isHidden: (k) => !!hidden[k], toggle, reset, count: Object.keys(hidden).length };
}
