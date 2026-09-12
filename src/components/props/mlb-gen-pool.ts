/**
 * THE MLB ADAPTER for the parlay generator (INSTRUCTION 52, 2026-09-12, Josh's word, verbatim:
 * "Parlay Generator should be on CFB & NFL just like it is on MLB").
 *
 * `buildPool` lived in src/lib/parlay-gen.ts until the generator went to the football desks.
 * The LOGIC HERE IS UNCHANGED — same rows, same skips, same leg minter, same counters — it is
 * only reshaped to fill in the fields the core now reads directly (`id`/`am`/`prob`/`src`/`side`/
 * `label`/`sub`) instead of reaching into the MLB leg object. A given board + spec + seed still
 * produces the byte-identical ticket it did before the move, which is what the pinned fixture
 * numbers in tests/parlay-gen.test.ts check.
 *
 * It sits in src/components/props/ rather than src/lib/ because it is the MLB prop board's own
 * vocabulary: `playerLeg`, `nameKey` and `teamTag` are this desk's, and the core must not import
 * them (that coupling is exactly what kept the generator off CFB and NFL).
 *
 * PURE: no React, no fetch, no clock, no Odds credit. `nowMs` is passed in.
 */

import type { PropBoardGame, PropBoardRow } from "@/engine";
import { amToDec } from "@/lib/ticket-math";
import { poolOf, type GenLeg, type GenMarket, type GenPool, type GenSpec } from "@/lib/parlay-gen";
import { MKT_LABEL, nameKey, playerLeg, teamTag, type Side } from "./props-model";
import type { SandboxLeg } from "@/lib/ticket-math";

/** the six markets the sandbox prices; ML/RL are game markets and have no player slots (v1) */
export const GEN_MARKETS: readonly string[] = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
];

/** the engine suspends these two from its OWN auto-built tickets (SH_CFG hrrAltMax:-1, outsSusp:true) */
const SUSPENDED = new Set(["batter_hits_runs_rbis", "pitcher_outs"]);

/** the same six, with the labels the board already uses and the engine's own suspension flag */
export const MLB_GEN_MARKETS: readonly GenMarket[] = GEN_MARKETS.map((key) => ({
  key,
  label: MKT_LABEL[key] ?? key,
  suspended: SUSPENDED.has(key),
}));

/** the MLB pool's payload is the slip's own leg object, handed over untouched on Add */
export type MlbGenPool = GenPool<SandboxLeg>;

/**
 * Every leg this market can currently produce, from the real board rows.
 *
 * The started-game skip is the FIRST consumer of `PropBoardGame.live` / `.start` in the
 * builder (both carried by the engine since the prop board shipped, and read by nothing
 * here until now): a game in progress still shows its PREGAME prices, so those legs are
 * off by default and admitted only when Josh asks for them.
 *
 * `nowMs` is passed in rather than read from the clock so this stays pure — the caller
 * sets it in a post-mount effect and SSR passes 0, which marks nothing started.
 */
export function buildPool(board: readonly PropBoardGame[], spec: GenSpec, nowMs: number): MlbGenPool {
  const legs: GenLeg<SandboxLeg>[] = [];
  let rows = 0;
  let startedDropped = 0;
  let noParlayDropped = 0;

  for (const g of board) {
    const rowsHere: PropBoardRow[] = g.markets?.[spec.market] ?? [];
    if (!rowsHere.length) continue;
    /* Date.parse of an unparseable start is NaN, and NaN <= nowMs is false — an unknown
       start time is never guessed into "started". */
    const started = !!g.live || (!!g.start && Date.parse(g.start) <= nowMs);
    if (started && !spec.includeStarted) {
      startedDropped += rowsHere.length;
      continue;
    }
    rows += rowsHere.length;
    const gameKey = g.gkey ?? g.game;
    for (const r of rowsHere) {
      if (r.noParlay) {
        noParlayDropped++;
        continue;
      }
      for (const side of ["o", "u"] as Side[]) {
        /* playerLeg returns null when that side is not posted — the one and only reason a
           side is missing, and the reason no price is ever invented for it. */
        const leg = playerLeg(r, spec.market, side, g.game, g.gkey);
        if (!leg) continue;
        if (!(leg.prob > 0)) continue; // no model number and no market fair → nothing to weigh
        const dec = amToDec(leg.cz);
        legs.push({
          /* the hoisted fields the core reads. `side` is the SAME value playerLeg just minted
             into the leg id, so the side filter cannot disagree with the leg it filtered. */
          id: leg.id,
          am: leg.cz,
          prob: leg.prob,
          src: leg.src,
          side,
          label: leg.label,
          sub: leg.sub,
          leg,
          dec,
          gameKey,
          playerKey: nameKey(r.p),
          team: r.tm ? teamTag(r.tm) : null,
          started,
          alt: !!r.alt,
          book: leg.book ?? "BOOK",
          ev: (leg.prob / 100) * dec - 1,
        });
      }
    }
  }

  /* the canonical id sort, the byId map and the game count are poolOf's — one implementation,
     shared with the football adapter, so the two sports cannot drift on the part that makes
     "same seed → same ticket" true on two different devices. */
  return poolOf(legs, { rows, startedDropped, noParlayDropped });
}
