"use client";
import { useSessionState } from "@/lib/use-session-state";
import { useCallback, useState } from "react";
import { MY_PARLAY_MAX, type MyLeg } from "@/lib/my-parlay";

/** INSTRUCTION 71: the Board's tapped legs. Temporary session drafts only — never ledgered. */
export function useMyParlay() {
  const [legs, setLegs] = useSessionState<MyLeg[]>("use-my-parlay:legs", []);
  const has = useCallback((key: string) => legs.some((l) => l.key === key), [legs]);
  const toggle = useCallback((leg: MyLeg) => {
    setLegs((cur) => (cur.some((l) => l.key === leg.key) ? cur.filter((l) => l.key !== leg.key) : cur.length >= MY_PARLAY_MAX ? cur : cur.concat(leg)));
  }, [setLegs]);
  const addAll = useCallback((add: MyLeg[]) => {
    setLegs((cur) => {
      const out = cur.slice();
      for (const l of add) if (!out.some((o) => o.key === l.key) && out.length < MY_PARLAY_MAX) out.push(l);
      return out;
    });
  }, [setLegs]);
  const remove = useCallback((key: string) => setLegs((cur) => cur.filter((l) => l.key !== key)), [setLegs]);
  const clear = useCallback(() => setLegs([]), [setLegs]);
  return { legs, has, toggle, addAll, remove, clear };
}
