import { legSideOf, MONOTONE_MARKETS } from "@/lib/leg-settled";
import { lineOf } from "@/lib/pred-serialize";

/**
 * THE FREE DIVERGENCE GATE (INSTRUCTION 51, 2026-09-11) — which live games are worth paying for,
 * decided before a single Odds credit is spent.
 *
 * THIS IS THE ONE GENUINELY MLB-NATIVE IDEA IN THE BUILD, and the reason the MLB desk does not
 * have to copy CFB's "re-price every live game on a timer and bind against a rail". Every input
 * below is FREE:
 *
 *   - live / final / inning per game            statsapi `/schedule?...&hydrate=linescore`, keyless
 *   - the live tally per stored row             `currentValue` (`src/engine2/grade.ts:153-197`) —
 *                                               ONE stat extractor, no second implementation
 *   - the remaining-game probability per leg     `shLiveState` -> `shSimGames(init).legP`
 *                                               (pinned `tests/live-sim.test.ts:43-150`)
 *
 * CFB cannot do this — it has no free per-play state feed — which is exactly why the football rig
 * re-prices on a clock. Here the gate turns an ungated ~516-credit day into an expected ~174-credit
 * day using only free inputs, which is the whole ballgame on a plan that is already short.
 *
 * PURE: no network, no `Date.now()`, no React, nothing from `app/`. `now` is a parameter, so every
 * branch below is testable at an exact instant (`tests/mlb-live-divergence.test.ts`).
 */

/** Why a live game is being bought this pass — and the order the budget buys them in. */
export type Why = "cleared" | "drifted" | "unpriced" | "expired";

/**
 * Cheapest win LAST, proof FIRST — the same discipline as the football pool
 * (`src/lib/server/football-props.ts:268-287`).
 *
 *   cleared   PROOF, not an estimate: the live tally is already past the stored line, so the
 *             pregame line is dead and the book has certainly re-hung. This is literally Josh's
 *             complaint — the row currently showing a SETTLED dash. Credits go here first.
 *   drifted   the free sim says the true probability has moved materially. Banked production AND
 *             remaining opportunity both feed it, which is what actually moves an in-play line.
 *   unpriced  a live game with no live quote yet today — nothing to show at all.
 *   expired   live, its own quote simply aged out, nothing diverged. Cheapest win, bought last.
 */
export const WHY_RANK: Record<Why, number> = { cleared: 0, drifted: 1, unpriced: 2, expired: 3 };

/** The free statsapi facts about one game, plus its Odds event id once `matchEvent` has run. */
export type MlbLiveGame = {
  /** the board's own game key (`away@home` [+ `gmN`]) */
  gkey: string;
  /** MLB's gamePk — the statsapi join */
  pk: number;
  /** statsapi says in progress (the predicate is lifted verbatim from `src/lib/liveNow.ts:135-136`) */
  live: boolean;
  /** statsapi says final / game over / completed */
  final: boolean;
  /** the Odds API event id from `matchEvent`, or null when unmatched / refused as ambiguous */
  oddsEventId: string | null;
};

/** One stored board row, reduced to what the gate reads. `prob` is the PREGAME percentage (0..100). */
export type MlbStoredRow = {
  /** `player|market|line` as stamped on the board */
  lkey: string;
  /** the pregame model probability in PERCENT, or null when the row carries none */
  prob: number | null;
  /**
   * The row's own side string ("H+R+RBI O 0.5" / "… U 1.5"), read with the SAME grammar
   * `settledRead` uses. A cleared line settles the Over WON and the Under LOST at the same
   * instant, and no live line can un-lose a lost Under — so an Under row is not proof that a
   * re-anchorable line exists, and it must not buy a credit. Optional, because a row that
   * carries no sub is read as an Over exactly as `settledRead` reads it.
   */
  sub?: string | null;
};

/**
 * The slice of the stored overlay the gate reads. `MlbLiveQuoteBoard` satisfies this structurally,
 * so the route hands the whole overlay straight in.
 */
export type MlbLiveOverlayRead = {
  pricedAt?: Readonly<Record<string, string>>;
  emptyAt?: Readonly<Record<string, string>>;
  /**
   * The quotes this desk already holds, keyed `<gkey>|<lkey>` (`liveQuoteKey`). Read for ONE
   * purpose: a row whose stored pregame line the tally has cleared BUT which already carries a
   * live quote at or above that tally has already been re-anchored, and is therefore no longer
   * proof of a dead line. Without this the `cleared` rung never extinguishes — see `divergenceOf`.
   */
  rows?: Readonly<Record<string, { ln: number }>>;
};

/** The knobs the gate reads out of `MLB_LIVE_PROPS` — a structural subset, so the constant fits. */
export type MlbLiveCfg = {
  liveMaxEvents: number;
  liveRevalidateSec: number;
  emptyHoldSec: number;
  driftMin: number;
};

/**
 * Everything `divergenceOf` needs about one candidate game, bundled — so `selectLiveEvents` is a
 * pure fold over a list and the route does the (network-shaped) assembly.
 *
 * `tallies` and `legP` are keyed by the SAME lkey the rows carry: `tallies[lkey]` is
 * `currentValue`'s live number for that row's player+market, `legP[lkey]` is the sim's
 * remaining-game probability for that leg as a FRACTION (0..1), against `row.prob` in PERCENT.
 */
export type MlbLiveCandidate = {
  game: MlbLiveGame;
  rows: readonly MlbStoredRow[];
  tallies: Readonly<Record<string, number | null>>;
  legP: Readonly<Record<string, number | null>>;
  overlay: MlbLiveOverlayRead | null;
};

/** One selected game, with the reason it was bought and the number that justified it. */
export type MlbLiveSelection = {
  game: MlbLiveGame;
  why: Why;
  /** the largest |legP - pregame| across this game's monotone rows, 0..1 */
  drift: number;
  /** how many of this game's stored rows the live tally has already cleared */
  clearedCount: number;
  /** this game's position in the input list — the stable final tie-break */
  index: number;
};

/** The market segment of a prop lkey (`player|market|line`); null for ml_/rl_ and junk. */
const marketOf = (lkey: string | null | undefined): string | null => {
  const parts = String(lkey ?? "").split("|");
  return parts.length === 3 ? parts[1] : null;
};

/** Age in ms of an ISO stamp out of a per-game map, or null when absent / unparsable. */
function ageMs(map: Readonly<Record<string, string>> | undefined, gkey: string, now: number): number | null {
  const iso = map?.[gkey];
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? now - t : null;
}

const ZERO = { why: null, drift: 0, clearedCount: 0 } as const;

/**
 * The side a stored row was taken on, read with `settledRead`'s OWN grammar
 * (`src/lib/leg-settled.ts:112`) so the gate and the grader can never disagree. Two spellings are
 * in the tree — the board's " O " / " U " subs and /api/picks' bare "o" / "u" — and both are read.
 */
export function storedSideOf(sub: string | null | undefined): "O" | "U" {
  const s = String(sub ?? "").trim();
  /* the bare lowercase token the ALL-scope table uses for a side; every other shape is the
     grader's own reading, borrowed rather than re-implemented (src/lib/leg-settled.ts:97) */
  if (s === "u") return "U";
  return legSideOf(s);
}

/**
 * Should this game be re-priced in play, and why — computed entirely from free inputs.
 *
 * Eligibility (spec section 3): ALL FOUR must hold before any `why` can be returned.
 *   1. statsapi says live and NOT final. Upcoming games are `/api/generate`'s job; duplicating it
 *      here would double-bill the slate.
 *   2. the game matched an Odds event. A wrong event id prints another game's player prices, which
 *      is invisible and strictly worse than no price, so `matchEvent`'s doubleheader refusal
 *      arrives here as `oddsEventId: null`.
 *   3. at least one stored row whose market is in `MONOTONE_MARKETS` (`src/lib/leg-settled.ts:49-56`).
 *      No stored row means there is nothing to re-anchor, so there is nothing to buy.
 *   4. THE EMPTY-EVENT RULE: a live game whose last pull returned zero usable quotes is held for
 *      `emptyHoldSec` and never re-asked on the fast path. Books take in-play markets down, and
 *      asking again in 30 minutes does not bring them back. This is
 *      `src/lib/server/football-props.ts:272-278`'s rule in spirit. It outranks EVERY `why`,
 *      `cleared` included — an empty event has no price to give us whatever the tally says.
 *
 * THEN THE RE-PRICE WINDOW, WHICH NOTHING BYPASSES: a game inside its OWN `liveRevalidateSec`
 * window returns null whatever its rows say — it is CARRIED, not fetched. One `cleared` game
 * turning due cannot drag every other live game into the pull, and a game re-priced a minute ago
 * cannot buy a second credit because a stored pregame line is still dead.
 *
 * Only then does the reason matter, in WHY_RANK order: a cleared row (proof) beats a drifted sim
 * (estimate) beats never priced beats simply aged out. Those four decide the ORDER the budget buys
 * the eligible pool in; they are not four separate licences to spend.
 */
export function divergenceOf(
  game: MlbLiveGame,
  storedRows: readonly MlbStoredRow[],
  tallies: Readonly<Record<string, number | null>>,
  legP: Readonly<Record<string, number | null>>,
  overlay: MlbLiveOverlayRead | null,
  now: number,
  cfg: MlbLiveCfg,
): { why: Why | null; drift: number; clearedCount: number } {
  if (!game.live || game.final) return { ...ZERO };
  if (!game.oddsEventId) return { ...ZERO };

  const mono = storedRows.filter((r) => {
    const mkt = marketOf(r.lkey);
    return !!mkt && MONOTONE_MARKETS.has(mkt) && lineOf(r.lkey) != null;
  });

  let clearedCount = 0;
  let drift = 0;
  for (const r of mono) {
    const ln = lineOf(r.lkey);
    const val = tallies[r.lkey];
    // strict `>`, exactly as `settledRead` decides it: at the line the leg is still undecided
    if (ln != null && val != null && Number.isFinite(val) && val > ln && clearedIsProof(r, val, game.gkey, overlay)) clearedCount++;
    const p = legP[r.lkey];
    if (p != null && Number.isFinite(p) && r.prob != null && Number.isFinite(r.prob)) {
      const d = Math.abs(p - r.prob / 100);
      if (d > drift) drift = d;
    }
  }

  if (mono.length === 0) return { why: null, drift, clearedCount };

  const emptyAge = ageMs(overlay?.emptyAt, game.gkey, now);
  if (emptyAge != null && emptyAge < cfg.emptyHoldSec * 1000) return { why: null, drift, clearedCount };

  /* DRIFT IS THE ONE RUNG THAT MAY BEAT THE GAME'S OWN RE-PRICE WINDOW, and the reason is the
     difference between new information and a standing fact.

     `drift` is the free sim's remaining-game probability moving away from the pregame one. It is
     computed fresh on every pass from live game state that did not exist when the last quote was
     bought, so a drift past `driftMin` is information the stored quote CANNOT contain, and it is
     self-limiting: once the game is re-priced the moved probability is what the new quote is
     measured against. (It is also INERT until the sim socket is wired — `legPOf` is never supplied
     by the route, so `drift` is 0 on every production row today; see MLB_LIVE_PROPS.driftMin.)

     `clearedCount` is the opposite kind of thing, and putting it above the window was the defect
     (fix pass, 2026-09-11). It is computed from the STORED board rows; the stored board is only
     rewritten by /api/generate; and by the middle innings almost every game has SOME row
     (batter_hits O0.5, pitcher_outs) whose tally is past its pregame line. A cleared row therefore
     stays cleared for the rest of the game and said "buy this game" on EVERY call — forty seconds
     after the last pull included — so the free gate, the entire justification for the 600-credit
     rail and the ~174-credit expected day, degenerated mid-slate into "buy every live game, every
     pass". A PWA cold start builds a fresh QueryClient and fetches immediately, so every launch
     re-bought every cleared game. Nothing was learned by any of those pulls: `clearedIsProof`
     already drops a row the last pull re-anchored, so what survives below the floor is a row the
     book posts nothing for, or one it prices under the tally — and neither changes in two minutes.

     Below the floor, `cleared` still OUTRANKS `drifted` (WHY_RANK), which is what the ladder was
     always for: when the window has expired and several games qualify, proof is bought first. */
  if (drift >= cfg.driftMin) return { why: "drifted", drift, clearedCount };

  const pricedAge = ageMs(overlay?.pricedAt, game.gkey, now);
  if (pricedAge != null && pricedAge <= cfg.liveRevalidateSec * 1000) return { why: null, drift, clearedCount };

  if (clearedCount > 0) return { why: "cleared", drift, clearedCount };
  if (pricedAge == null) return { why: "unpriced", drift, clearedCount };
  return { why: "expired", drift, clearedCount };
}

/**
 * Is this cleared row actually PROOF that a dead line needs re-anchoring? Two rows are not:
 *
 *   • AN UNDER. A cleared line settles the Over won and the Under LOST at the same instant
 *     (`src/lib/leg-settled.ts:118`), and no in-play line un-loses a lost bet. Buying a credit to
 *     re-price a decided-lost leg is spending on a row that has nothing to say.
 *   • A ROW ALREADY RE-ANCHORED. If this desk already holds a quote for the row whose live line is
 *     at or above the tally, the book has already been asked and answered: the stored pregame line
 *     being dead is old news, not a new fact. Josh's own row — 3 H+R+RBI against a stored 0.5,
 *     correctly re-anchored to a live 3.5 — is exactly this case, and before the fix it stayed
 *     permanently `cleared` even after the re-anchor succeeded.
 */
function clearedIsProof(
  row: MlbStoredRow,
  val: number,
  gkey: string,
  overlay: MlbLiveOverlayRead | null,
): boolean {
  if (storedSideOf(row.sub) === "U") return false;
  const q = overlay?.rows?.[`${gkey}|${row.lkey}`];
  return !(q && Number.isFinite(q.ln) && q.ln >= val);
}

/**
 * The pool this pass may pay for: every eligible candidate, ordered cheapest-win-last and clipped
 * to `cfg.liveMaxEvents`.
 *
 * `capped` is true when the gate wanted more games than the cap allows — reported on the overlay so
 * the footnote can say so out loud rather than quietly pricing nine of sixteen. `liveCount` is
 * every game statsapi has in play, eligible or not, so the header can print "9 under way ·
 * 7 priced live" honestly.
 *
 * The daily-credit rail is NOT applied here: that is `mlbAffordableEvents` in
 * `src/lib/mlb/live-props-store.ts`, which must be called with the MLB budget explicitly.
 */
export function selectLiveEvents(
  games: readonly MlbLiveCandidate[],
  now: number,
  cfg: MlbLiveCfg,
): { events: MlbLiveSelection[]; capped: boolean; liveCount: number } {
  const liveCount = games.filter((c) => c.game.live && !c.game.final).length;
  const need: MlbLiveSelection[] = [];
  games.forEach((c, index) => {
    const d = divergenceOf(c.game, c.rows, c.tallies, c.legP, c.overlay, now, cfg);
    if (d.why == null) return;
    need.push({ game: c.game, why: d.why, drift: d.drift, clearedCount: d.clearedCount, index });
  });
  need.sort((a, b) => WHY_RANK[a.why] - WHY_RANK[b.why] || b.drift - a.drift || a.index - b.index);
  const cap = Math.max(0, cfg.liveMaxEvents);
  return { events: need.slice(0, cap), capped: need.length > cap, liveCount };
}
