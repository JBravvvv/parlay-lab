"use client";

import { decodeSetup, encodeSetup } from "@/lib/parlay-gen-setup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyPool,
  generate,
  specSeed,
  type GenPool,
  type GenResult,
  type GenSpec,
  type GenPoolSpec,
} from "@/lib/parlay-gen";
const NO_POSITIONS: readonly string[] = [];

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
 *  - "ADD TO SLIP" ADDS. It used to overwrite the slip outright, which on football — where ONE
 *    slip carries the Sides rail's spreads and the prop rails' legs — deleted every leg Josh had
 *    tapped before he spun (INSTRUCTION 52 fix pass). The desk passes its OWN adder, so the fold
 *    obeys that desk's clash rules and keeps what is already there; Undo still restores the slip
 *    exactly as it stood.
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
  saveSetup: () => void;
  loadSetup: () => void;
  hasSetup: boolean;
  setupNotice: string | null;
};

export function useParlayGen<P>({
  storageKey,
  defaultSpec,
  marketKeys,
  positions = NO_POSITIONS,
  railMarket,
  boardKey,
  build,
  onMarket,
  legs,
  setLegs,
  addLegs,
}: {
  /** where the open/closed state is remembered — derive it from the league, never a literal */
  storageKey: string;
  defaultSpec: GenSpec;
  /** the market keys this desk's generator understands — the rail sync ignores anything else */
  marketKeys: readonly string[];
  positions?: readonly string[];
  /** the market the rail is currently on, or null on a tab with no generator market */
  railMarket: string | null;
  /** the board's identity (its date): a fresh board re-rolls */
  boardKey: string;
  /** the desk's own pool builder — memoize it on the board, it is the pool's only dependency */
  build: (spec: GenPoolSpec, nowMs: number) => GenPool<P>;
  /** move the market rail; the generator never owns the market, it follows the rail */
  onMarket: (market: string) => void;
  /** the slip as it stands, so Add can be undone */
  legs: readonly P[];
  setLegs: (legs: P[]) => void;
  /**
   * How THIS desk folds the generated legs into the slip it already has. Required, and required
   * to ADD rather than replace: the button says "Add to slip", and on football one slip carries
   * the Sides rail's legs and the prop rails' legs at once, so an overwrite silently deleted the
   * spreads Josh had tapped (INSTRUCTION 52 fix pass). The desk supplies it because only the desk
   * knows its own clash rules — one side per game and one leg per player on football
   * (`addCfbLeg`), dedupe by leg id on MLB — and a leg the slip refuses must not be double-added
   * or toggled back off.
   */
  addLegs: (prev: readonly P[], add: readonly P[]) => P[];
}): UseParlayGen<P> {
  /* `open` is read from localStorage only AFTER mount — the hydration rule (the same one
     app/board/page.tsx:123-135 states): an initializer read would render one tree on the
     server and another on the client. */
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== "0") setOpenState(true);
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
  const [savedSetup, setSavedSetup] = useState<GenSpec | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  useEffect(() => {
    try { setSavedSetup(decodeSetup(localStorage.getItem(`${storageKey}:setup`), marketKeys, positions)); }
    catch { setSavedSetup(null); }
  }, [storageKey, marketKeys, positions]);
  const saveSetup = () => {
    try {
      const raw = encodeSetup({ ...spec, style: spec.style ?? "safer" });
      localStorage.setItem(`${storageKey}:setup`, raw);
      setSavedSetup(decodeSetup(raw, marketKeys, positions));
      setSetupNotice("Setup saved on this device. Players will rotate from the current board.");
    } catch { setSetupNotice("This browser could not save the setup. You can keep building."); }
  };
  const loadSetup = () => {
    if (!savedSetup) return;
    onMarket(savedSetup.market);
    setSpec(savedSetup);
    setSetupNotice("Saved setup loaded. Pins cleared; picks use the current board.");
  };
  const [roll, setRoll] = useState(0);
  const [added, setAdded] = useState(false);
  /* 0 on the server, so a server render marks NO game as started; set once on mount, never on
     a timer — a ticket Josh is looking at must not reshuffle itself under him. */
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => setNowMs(Date.now()), []);
  /* the last 10 ticket keys, so Regenerate does not hand back the spin just seen */
  const history = useRef<string[]>([]);
  const recentPlayers = useRef<string[][]>([]);
  /* the slip exactly as it was before "Add to slip" — the Undo */
  const prevLegs = useRef<P[] | null>(null);

  /* Both are pure: `build`/`generate` never fetch, never touch the engine sandbox and never
     spend an Odds credit — they read the board that is already on the device.

     Both are also gated on `open`: a reader who never opens the sheet should not pay for pool
     construction over the whole board plus the seeded fill and the bounded repair loop on every
     dependency change. A closed sheet gets the empty pool, which the generator answers with
     `no-rows` at no cost. */
  const poolSpec = useMemo(() => ({ market: spec.market, includeStarted: spec.includeStarted }), [spec.market, spec.includeStarted]);
  const pool = useMemo(() => (open ? build(poolSpec, nowMs) : emptyPool<P>()), [open, build, poolSpec, nowMs]);
  const result = useMemo<GenResult<P>>(
    () =>
      open
        ? generate(pool, spec, specSeed(spec, boardKey, roll), new Set(history.current), playerExposure(recentPlayers.current))
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
    setSetupNotice(null);
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
    setSetupNotice(null);
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
    setSetupNotice(null);
    if (result.ok) {
      recentPlayers.current = [result.ticket.legs.map((l) => l.playerKey), ...recentPlayers.current].slice(0, 4);
      const k = result.ticket.key;
      history.current = [k, ...history.current.filter((x) => x !== k)].slice(0, 10);
    }
    setRoll((r) => r + 1);
  };

  /* ADDS, never replaces — and the fold is the desk's own, so the legs Josh tapped before he
     spun survive and the desk's clash rules still decide what may join them. `prevLegs` is the
     slip exactly as it stood, which is what Undo puts back. */
  const add = () => {
    setSetupNotice(null);
    if (!result.ok) return;
    prevLegs.current = legs.slice();
    setLegs(addLegs(legs, result.ticket.legs.map((l) => l.leg)));
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
    saveSetup, loadSetup, hasSetup: savedSetup != null, setupNotice,
  };
}

export const blankPins = (n: number): (string | null)[] => Array.from({ length: n }, () => null);


function playerExposure(tickets: readonly string[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ticket of tickets) for (const player of new Set(ticket)) counts.set(player, (counts.get(player) ?? 0) + 1);
  return counts;
}
