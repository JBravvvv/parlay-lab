"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyPool,
  generate,
  specSeed,
  type GenPool,
  type GenResult,
  type GenSpec,
} from "@/lib/parlay-gen";

/**
 * THE PARLAY GENERATOR'S STATE, once (INSTRUCTION 52, 2026-09-12, Josh's word, verbatim:
 * "Parlay Generator should be on CFB & NFL just like it is on MLB").
 *
 * This is the ~95 lines that used to sit inside app/props/page.tsx. Re-typing them inside
 * CfbProps would have been the fork: two copies of the remembered open/closed state, the
 * seeded spin counter, the 10-deep anti-repeat history, the pin rules and the Add/Undo pair,
 * drifting apart the first time one of them was fixed. There is one copy and both desks call it.
 *
 * EVERY RULE THAT WAS FIXED ONCE STAYS FIXED HERE:
 *  - `open` is read from localStorage only AFTER mount, and `nowMs` starts at 0 — a server
 *    render must mark no game as started, or hydration mismatches.
 *  - `nowMs` is set once on mount and NEVER on a timer: a ticket Josh is looking at must not
 *    reshuffle itself under him.
 *  - changing the leg count or the market CLEARS the pins, because a pin is a leg id and a leg
 *    id is market-specific — keeping them would only ever come back as "pin-missing".
 *  - UNPINNING ALWAYS WORKS: clearing a pin reads the id from the SPEC (always available), not
 *    from the ticket, so the control the failure copy tells Josh to press is never a no-op.
 *  - the pool and the ticket are gated on `open`: a reader who never opens the sheet pays for
 *    no pool build and no seeded fill.
 *
 * PURE READER. The `build` the caller passes in reads the board that is ALREADY on the device;
 * nothing here fetches, adds a market to a pull, spends an Odds credit, seats money or writes a
 * ledger row. `generate` is pure and seeded, so the same board + spec + spin gives the same
 * ticket on any device.
 */
export type UseParlayGen<P> = {
  /** the sheet's remembered open/closed state */
  open: boolean;
  setOpen: (v: boolean) => void;
  spec: GenSpec;
  /** patch the spec; a market patch is routed to the rail instead (the rail owns the market) */
  patchSpec: (patch: Partial<GenSpec>) => void;
  pool: GenPool<P>;
  result: GenResult<P>;
  /** keep / release slot `i` */
  togglePin: (slot: number) => void;
  /** Regenerate — remembers this ticket so the next spin moves */
  spin: () => void;
  /** put the generated legs on the slip, remembering what was there */
  add: () => void;
  undo: () => void;
  canUndo: boolean;
  /** Date.now() as of mount, 0 during SSR — the caller formats the board clock off it */
  nowMs: number;
};

export function useParlayGen<P>({
  storageKey,
  defaultSpec,
  marketKeys,
  railMarket,
  boardKey,
  build,
  onMarket,
  legs,
  setLegs,
}: {
  /** where the open/closed state is remembered — derive it from the league, never a literal */
  storageKey: string;
  defaultSpec: GenSpec;
  /** the market keys this desk's generator understands — the rail sync ignores anything else */
  marketKeys: readonly string[];
  /** the market the rail is currently on, or null on a tab with no generator market */
  railMarket: string | null;
  /** the board's identity (its date): a fresh board re-rolls */
  boardKey: string;
  /** the desk's own pool builder — memoize it on the board, it is the pool's only dependency */
  build: (spec: GenSpec, nowMs: number) => GenPool<P>;
  /** move the market rail; the generator never owns the market, it follows the rail */
  onMarket: (market: string) => void;
  /** the slip as it stands, so Add can be undone */
  legs: readonly P[];
  setLegs: (legs: P[]) => void;
}): UseParlayGen<P> {
  /* `open` is read from localStorage only AFTER mount — the hydration rule (the same one
     app/board/page.tsx:123-135 states): an initializer read would render one tree on the
     server and another on the client. */
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") setOpenState(true);
    } catch {
      /* fresh device / storage blocked */
    }
  }, [storageKey]);
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
    },
    [storageKey],
  );

  const [spec, setSpec] = useState<GenSpec>(defaultSpec);
  const [roll, setRoll] = useState(0);
  const [added, setAdded] = useState(false);
  /* 0 on the server, so a server render marks NO game as started; set once on mount, never on
     a timer — a ticket Josh is looking at must not reshuffle itself under him. */
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => setNowMs(Date.now()), []);
  /* the last 10 ticket keys, so Regenerate does not hand back the spin just seen */
  const history = useRef<string[]>([]);
  /* the slip exactly as it was before "Add to slip" — the Undo */
  const prevLegs = useRef<P[] | null>(null);

  /* Both are pure: `build`/`generate` never fetch, never touch the engine sandbox and never
     spend an Odds credit — they read the board that is already on the device.

     Both are also gated on `open`: a reader who never opens the sheet should not pay for pool
     construction over the whole board plus the seeded fill and the bounded repair loop on every
     dependency change. A closed sheet gets the empty pool, which the generator answers with
     `no-rows` at no cost. */
  const pool = useMemo(() => (open ? build(spec, nowMs) : emptyPool<P>()), [open, build, spec, nowMs]);
  const result = useMemo<GenResult<P>>(
    () =>
      open
        ? generate(pool, spec, specSeed(spec, boardKey, roll), new Set(history.current))
        : { ok: false, fail: { code: "no-rows" } },
    [open, pool, spec, roll, boardKey],
  );

  /* ONE market state: the RAIL owns it. A category tap inside the sheet moves the rail, and
     this effect copies the rail's market back into the spec, so the two cannot disagree.
     Pins are leg ids and a leg id is market-specific — changing market clears them rather
     than leaving pins that could only ever come back as "pin-missing". */
  useEffect(() => {
    if (!railMarket || !marketKeys.includes(railMarket)) return;
    setSpec((sp) => (sp.market === railMarket ? sp : { ...sp, market: railMarket, pinned: blankPins(sp.legs) }));
  }, [railMarket, marketKeys]);

  const patchSpec = (patch: Partial<GenSpec>) => {
    if (patch.market && patch.market !== spec.market) {
      onMarket(patch.market);
      return;
    }
    setSpec((sp) => {
      const next: GenSpec = { ...sp, ...patch };
      if (patch.legs != null && patch.legs !== sp.legs) next.pinned = blankPins(patch.legs);
      return next;
    });
  };

  /* UNPINNING ALWAYS WORKS (INSTRUCTION 50 fix pass). This used to open with `if (!gen.ok)
     return;` and read the id off the ticket — so on any failure the control was a no-op, while
     the failure copy ("unpin the gold slot and spin again") told Josh to use exactly it.
     Clearing a pin reads the id from the SPEC, which is always available; only SETTING a new
     pin needs a ticket. */
  const togglePin = (slot: number) => {
    setSpec((sp) => {
      const pinned = Array.from({ length: sp.legs }, (_, k) => sp.pinned[k] ?? null);
      if (pinned[slot]) {
        pinned[slot] = null;
        return { ...sp, pinned };
      }
      if (!result.ok) return sp;
      const id = result.ticket.legs[slot]?.id;
      if (!id) return sp;
      pinned[slot] = id;
      return { ...sp, pinned };
    });
  };

  const spin = () => {
    if (result.ok) {
      const k = result.ticket.key;
      history.current = [k, ...history.current.filter((x) => x !== k)].slice(0, 10);
    }
    setRoll((r) => r + 1);
  };

  const add = () => {
    if (!result.ok) return;
    prevLegs.current = legs.slice();
    setLegs(result.ticket.legs.map((l) => l.leg));
    setAdded(true);
  };

  const undo = () => {
    setLegs(prevLegs.current ?? []);
    prevLegs.current = null;
    setAdded(false);
  };

  return {
    open,
    setOpen,
    spec,
    patchSpec,
    pool,
    result,
    togglePin,
    spin,
    add,
    undo,
    canUndo: added && prevLegs.current != null,
    nowMs,
  };
}

export const blankPins = (n: number): (string | null)[] => Array.from({ length: n }, () => null);
