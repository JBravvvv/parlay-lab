"use client";
import { useCallback, useState } from "react";
import { MY_PARLAY_MAX, type MyLeg } from "@/lib/my-parlay";

/** INSTRUCTION 71: the Board's tapped legs. Page state only — never stored, never ledgered. */
export function useMyParlay() {
  const [legs, setLegs] = useState<MyLeg[]>([]);
  const has = useCallback((key: string) => legs.some((l) => l.key === key), [legs]);
  const toggle = useCallback((leg: MyLeg) => {
    setLegs((cur) => (cur.some((l) => l.key === leg.key) ? cur.filter((l) => l.key !== leg.key) : cur.length >= MY_PARLAY_MAX ? cur : cur.concat(leg)));
  }, []);
  const addAll = useCallback((add: MyLeg[]) => {
    setLegs((cur) => {
      const out = cur.slice();
      for (const l of add) if (!out.some((o) => o.key === l.key) && out.length < MY_PARLAY_MAX) out.push(l);
      return out;
    });
  }, []);
  const remove = useCallback((key: string) => setLegs((cur) => cur.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setLegs([]), []);
  return { legs, has, toggle, addAll, remove, clear };
}
