"use client";

import { moveParlayHistory } from "@/lib/parlay-history";
import { decodeSetup, encodeSetup } from "@/lib/parlay-gen-setup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyPool,
  generate,
  specSeed,
  type GenLeg,
  type GenPool,
  type GenResult,
  type GenSpec,
  type GenPoolSpec,
} from "@/lib/parlay-gen";
import { excludePlayers, exclusionKey, exclusionFilterKey } from "@/lib/parlay-exclusions";
import { BOOKS, SETTLE_BOOK_SHORT } from "@/lib/sportsbook/books";
import { useSportsbook } from "@/lib/sportsbook/store";
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
  /** move the leg in slot `from` to slot `to` — display order; a pin travels with its leg (2026-09-18) */
  reorder: (from: number, to: number) => void;
  excludedPlayers: readonly { key: string; label: string }[];
  excludePlayer: (slot: number) => void;
  restorePlayer: (key: string) => void;
  clearExclusions: () => void;
  /** Regenerate — remembers this ticket so the next spin moves */
  spin: () => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  historyNotice: string | null;
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
  /* INSTRUCTION 67 (2026-09-17): "settle-book only" keeps legs priced at the selected sportsbook — DraftKings by default */
  const selectedBook = useSportsbook();
  const pricingBook = BOOKS.find((b) => b.key === selectedBook)?.short ?? SETTLE_BOOK_SHORT;
  const filterKey = `${storageKey}:${boardKey}:${exclusionFilterKey(spec)}`;
  const [exclusions, setExclusions] = useState<{ filter: string; players: {key: string; label: string}[] }>({ filter: "", players: [] });
  const excludedPlayers = useMemo(() => exclusions.filter === filterKey ? exclusions.players : [], [exclusions, filterKey]);
  const excludedKeys = useMemo(() => new Set(excludedPlayers.map(p => p.key)), [excludedPlayers]);
  // Clear stored exclusions when filters change, so returning to an old filter cannot revive them.
  useEffect(() => { setExclusions({ filter: filterKey, players: [] }); }, [filterKey]);
  const [savedSetup, setSavedSetup] = useState<GenSpec | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  useEffect(() => {
    try { setSavedSetup(decodeSetup(localStorage.getItem(`${storageKey}:setup`), marketKeys, positions)); }
    catch { setSavedSetup(null); }
  }, [storageKey, marketKeys, positions]);
  const saveSetup = () => {
    try {
      const raw = encodeSetup(spec);
      localStorage.setItem(`${storageKey}:setup`, raw);
      setSavedSetup(decodeSetup(raw, marketKeys, positions));
      setSetupNotice("Setup saved on this device. Players will rotate from the current board.");
    } catch { setSetupNotice("This browser could not save the setup. You can keep building."); }
  };
  const loadSetup = () => {
    if (!savedSetup) return;
    leaveRecall();
    onMarket(savedSetup.market);
    setSpec({...savedSetup,...(defaultSpec.phase?{phase:savedSetup.phase??"pregame"}:{})});
    setSetupNotice("Saved setup loaded. Pins cleared; picks use the current board.");
  };
  type Snapshot = { spec: GenSpec; result: GenResult<P> };
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [, refreshHistory] = useState(0);
  const [recalled, setRecalled] = useState<Snapshot | null>(null);
  const leaveRecall = () => { setRecalled(null); future.current = []; };
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
  const poolSpec = useMemo(() => ({ market: spec.market, markets: spec.markets, includeStarted: spec.includeStarted, phase: spec.phase }), [spec.market, spec.markets, spec.includeStarted, spec.phase]);
  const pool = useMemo(() => (open ? excludePlayers(build(poolSpec, nowMs), excludedKeys) : emptyPool<P>()), [open, build, poolSpec, nowMs, excludedKeys]);
  const generated = useMemo<GenResult<P>>(
    () =>
      open
        ? generate(pool, { ...spec, pricingBook }, specSeed(spec, boardKey, roll), new Set(history.current), playerExposure(recentPlayers.current))
        : { ok: false, fail: { code: "no-rows" } },
    [open, pool, spec, pricingBook, roll, boardKey],
  );

  /* DISPLAY ORDER (2026-09-18, Josh: "ability to reorder/drag the picks so if im keeping the bottom
     pick i can drag it to top, hit the 'lock it in' button on the pick then regenerate the ones
     below it"). A ticket is a SET — its key is order-independent — so the order Josh drags into
     is an overlay keyed by that ticket: it applies while the same legs are on screen and falls
     away the moment a spin produces a different set. A pin travels with its leg: the spec's slot
     pins are permuted by the same move, so "drag to the top, lock it, regenerate" seats the kept
     leg in slot 1 of the next ticket. Pins alone do not change which legs the walk seats
     (tests/parlay-gen-reorder.test.ts), so the permuted spec re-rolls to the same set. */
  const [order, setOrder] = useState<{ key: string; ids: readonly string[] } | null>(null);
  const baseResult = recalled?.result ?? generated;
  const result = useMemo(() => applyOrder(baseResult, order), [baseResult, order]);
  const reorder = (from: number, to: number) => {
    if (!result.ok) return;
    const legs = result.ticket.legs;
    if (from === to || from < 0 || to < 0 || from >= legs.length || to >= legs.length) return;
    const ids = legs.map((l) => l.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setOrder({ key: result.ticket.key, ids });
    setSpec((sp) => {
      const pinned = Array.from({ length: sp.legs }, (_, k) => sp.pinned[k] ?? null);
      if (!pinned.some(Boolean)) return sp; // nothing locked: the spec is untouched, nothing re-rolls
      const [pin] = pinned.splice(from, 1);
      pinned.splice(to, 0, pin ?? null);
      return { ...sp, pinned };
    });
  };
  const remember = () => { if (result.ok) past.current.push({ spec, result }); };
  const navigate = (direction: "back" | "forward") => {
    const from = direction === "back" ? past.current : future.current;
    const to = direction === "back" ? future.current : past.current;
    const snapshot = moveParlayHistory(from, to, { spec, result });
    if (!snapshot) return;
    setSpec(snapshot.spec);
    onMarket(snapshot.spec.market);
    setRecalled(snapshot);
    setSetupNotice(null);
  };
  useEffect(() => {
    past.current = []; future.current = []; setRecalled(null);
    refreshHistory((revision) => revision + 1);
  }, [boardKey, storageKey]);

  /* ONE market state: the RAIL owns it. A category tap inside the sheet moves the rail, and
     this effect copies the rail's market back into the spec, so the two cannot disagree.
     Pins are leg ids and a leg id is market-specific — changing market clears them rather
     than leaving pins that could only ever come back as "pin-missing". */
  useEffect(() => {
    if (!railMarket || !marketKeys.includes(railMarket)) return;
    if (railMarket !== spec.market) leaveRecall();
    /* several categories (2026-09-18): a rail move INSIDE the selected set just changes which one
       the rail shows — the pool is the same union, so the pins stay. A rail move OUTSIDE it
       collapses the set to the rail's category, the way a single-category sheet always behaved. */
    setSpec((sp) => {
      if (sp.market === railMarket) return sp;
      if (sp.markets?.includes(railMarket)) return { ...sp, market: railMarket };
      return { ...sp, market: railMarket, markets: undefined, pinned: blankPins(sp.legs) };
    });
  }, [railMarket, marketKeys]);

  const patchSpec = (patch: Partial<GenSpec>) => {
    remember();
    leaveRecall();
    setSetupNotice(null);
    if (patch.market && patch.market !== spec.market) {
      onMarket(patch.market);
      return;
    }
    /* a category-set edit (2026-09-18): the rail must keep showing a category that is ON the
       ticket, so dropping the rail's own category moves the rail to the first one left */
    const nextMarkets = patch.markets === undefined ? undefined : [...new Set(patch.markets)].filter((m) => marketKeys.includes(m));
    const railMove = nextMarkets?.length && !nextMarkets.includes(spec.market) ? nextMarkets[0] : null;
    setSpec((sp) => {
      const next: GenSpec = { ...sp, ...patch };
      if (nextMarkets !== undefined) {
        next.markets = nextMarkets.length > 1 ? nextMarkets : undefined;
        if (railMove) next.market = railMove;
        else if (!nextMarkets.length) next.markets = undefined;
        if (setKey(next.markets ?? [next.market]) !== setKey(sp.markets ?? [sp.market])) next.pinned = blankPins(next.legs);
      }
      if (patch.timeWindow !== undefined || patch.noMarkets) next.pinned = blankPins(next.legs);
      if (patch.phase != null && patch.phase !== sp.phase) next.pinned = blankPins(next.legs);
      if (patch.legs != null && patch.legs !== sp.legs) next.pinned = blankPins(patch.legs);
      return next;
    });
    if (railMove) onMarket(railMove);
  };

  /* UNPINNING ALWAYS WORKS (INSTRUCTION 50 fix pass). This used to open with `if (!gen.ok)
     return;` and read the id off the ticket — so on any failure the control was a no-op, while
     the failure copy ("unpin the gold slot and spin again") told Josh to use exactly it.
     Clearing a pin reads the id from the SPEC, which is always available; only SETTING a new
     pin needs a ticket. */
  const togglePin = (slot: number) => {
    leaveRecall();
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

  const excludePlayer = (slot: number) => {
    if (!result.ok) return;
    const leg = result.ticket.legs[slot];
    if (!leg) return;
    remember(); leaveRecall();
    const key = exclusionKey(leg);
    setExclusions({ filter: filterKey, players: [...excludedPlayers.filter(p => p.key !== key), { key, label: leg.label }] });
    setSpec(sp => ({ ...sp, pinned: sp.pinned.map(id => {
      const kept = id ? pool.byId.get(id) : null;
      return kept && exclusionKey(kept) === key ? null : id;
    }) }));
    setSetupNotice(`${leg.label} excluded. Picks updated; exclusions last until filters change.`);
  };
  const restorePlayer = (key: string) => {
    leaveRecall();
    setExclusions({ filter: filterKey, players: excludedPlayers.filter(p => p.key !== key) });
    setSetupNotice(null);
  };
  const clearExclusions = () => {
    leaveRecall(); setExclusions({ filter: filterKey, players: [] }); setSetupNotice(null);
  };

  const spin = () => {
    // A recalled ticket may restore a pin for a player excluded after it was saved.
    if (result.ok && excludedKeys.size) {
      const excludedIds = new Set(result.ticket.legs.filter(l => excludedKeys.has(exclusionKey(l))).map(l => l.id));
      setSpec(sp => ({ ...sp, pinned: sp.pinned.map(id => id && excludedIds.has(id) ? null : id) }));
    }
    setNowMs(Date.now());
    remember();
    leaveRecall();
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
    if (result.ticket.legs.some(l => excludedKeys.has(exclusionKey(l)))) {
      setSetupNotice("This saved ticket includes an excluded player. Regenerate or restore that player before adding."); return;
    }
    if(spec.phase){
      const current=build(poolSpec,Date.now());
      if(result.ticket.legs.some(l=>{const fresh=current.byId.get(l.id);return !fresh||fresh.am!==l.am||fresh.book!==l.book||fresh.prob!==l.prob||fresh.quoteAt!==l.quoteAt;})){
        setSetupNotice("These quotes changed or are no longer available. Regenerate before adding to the slip.");return;
      }
    }
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
    reorder,
    excludedPlayers, excludePlayer, restorePlayer, clearExclusions,
    spin,
    back: () => navigate("back"), forward: () => navigate("forward"),
    canBack: past.current.length > 0, canForward: future.current.length > 0,
    historyNotice: recalled ? "Previous ticket · saved quotes, not refreshed. Regenerate to use the current board." : null,
    add,
    undo,
    canUndo: added && prevLegs.current != null,
    nowMs,
    saveSetup, loadSetup, hasSetup: savedSetup != null, setupNotice,
  };
}

export const blankPins = (n: number): (string | null)[] => Array.from({ length: n }, () => null);
const setKey = (ms: readonly string[]) => [...new Set(ms)].sort().join(",");


function playerExposure(tickets: readonly string[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ticket of tickets) for (const player of new Set(ticket)) counts.set(player, (counts.get(player) ?? 0) + 1);
  return counts;
}

/** the ticket in the order Josh dragged it into — only while those exact legs are the ticket */
function applyOrder<P>(r: GenResult<P>, order: { key: string; ids: readonly string[] } | null): GenResult<P> {
  if (!r.ok || !order || order.key !== r.ticket.key) return r;
  const byId = new Map(r.ticket.legs.map((l) => [l.id, l]));
  const legs = order.ids.map((id) => byId.get(id)).filter((l): l is GenLeg<P> => !!l);
  if (legs.length !== r.ticket.legs.length) return r;
  return { ok: true, ticket: { ...r.ticket, legs } };
}
