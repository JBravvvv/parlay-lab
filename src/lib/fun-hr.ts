/**
 * FUN MONEY COMPOSER (2026-08-15, Josh's word, verbatim: "The 'Fun' Money needs to be
 * split out between 2-5 tickets mainly HR over longshots. It can't include 2 players
 * from the same team though as that shrinks odds significantly. it should be 3-8
 * players on each with limited repeat players").
 *
 * A deterministic composer over the board's OWN HR-over rows — engine probability and
 * the Caesars price ride through untouched; the only new numbers are products. The
 * longshot lives in the PARLAY, so legs are taken most-likely-first: the likeliest HR
 * hitters, stacked 3–8 deep across distinct teams, are what give a 20-to-1 ticket a
 * real chance of cashing.
 *
 * Rules, encoded exactly:
 *   - 2–5 tickets, $-exact split (remainder rides the first);
 *   - 3–8 legs per ticket, sizes laddered 3,4,5,6,7 so payouts tier;
 *   - a TEAM appears at most once per ticket (same-team HR overs correlate — Josh:
 *     "that shrinks odds significantly");
 *   - a PLAYER appears on at most repeatCap tickets across the day ("limited repeat
 *     players"), enforced globally;
 *   - tickets rotate their starting point through the pool so no two are identical;
 *   - a pool too thin for the rules builds fewer/smaller tickets — or none, with a
 *     note. Nothing is ever fabricated to fill the shape.
 *
 * Cross-team legs from different games are treated as independent for the product
 * price; that is the naive multiplication, disclosed here — HR sim-joint pricing is
 * an engine-ship rider, not a reason to hold the product.
 */

export const FUN_SHAPE = {
  /* 2026-08-22, Josh's word: "The fun money should be 3-5 tickets every day" (was 2-5) */
  tickets: { min: 3, max: 5 },
  legs: { min: 3, max: 8 },
  repeatCap: 2,
} as const;

/** ladder of target sizes — 3,4,5,6,7 keeps every ticket inside 3–8 and tiers payouts */
const SIZES = [3, 4, 5, 6, 7] as const;

export type FunLegSrc = {
  player: string;
  team: string | null;
  label: string;
  prop: string;
  prob: number | null; // percent, the engine's own
  dec: number | null; // Caesars decimal
  cz: number | null; // Caesars American
  lkey: string | null;
  gkey: string | null;
};

export type FunTicket = {
  name: string;
  type: "fun_hr";
  stake: number;
  czDec: number;
  czOdds: string;
  prob: number; // percent, naive product
  czEv: number; // percent
  legs: FunLegSrc[];
};

const legKeyOf = (l: { label: string; prop: string }) => `${l.label}|${l.prop}`;

export function buildFunHrTickets(
  poolIn: FunLegSrc[],
  amount: number,
  usedLegKeys: Set<string>,
  /* INSTRUCTION 18 (2026-09-03): the ladder takes one of the day's fun seats, so the HR
     composer's ticket ceiling is reducible — the day stays within FUN_SHAPE.tickets.max */
  maxTickets: number = FUN_SHAPE.tickets.max,
): { tickets: FunTicket[]; sum: number; note?: string } {
  const tixMax = Math.max(1, Math.min(FUN_SHAPE.tickets.max, Math.floor(Number(maxTickets) || FUN_SHAPE.tickets.max)));
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  const pool = poolIn
    .filter(
      (l) =>
        l.team &&
        l.player &&
        l.dec != null &&
        Number(l.dec) > 1 &&
        l.prob != null &&
        Number(l.prob) > 0 &&
        !usedLegKeys.has(legKeyOf(l)),
    )
    // most-likely-first; name breaks ties so the order is total and deterministic
    .sort((a, b) => Number(b.prob) - Number(a.prob) || a.player.localeCompare(b.player));
  if (!pool.length || amt <= 0) {
    return { tickets: [], sum: 0, note: "fun: no Caesars-priced HR-over pool today" };
  }

  const appearances = new Map<string, number>();
  const built: FunLegSrc[][] = [];
  const seen = new Set<string>(); // leg-set signatures — no two identical tickets
  for (let k = 0; k < tixMax; k++) {
    const want = Math.min(SIZES[k] ?? FUN_SHAPE.legs.max, FUN_SHAPE.legs.max);
    const teams = new Set<string>();
    const legs: FunLegSrc[] = [];
    for (let j = 0; j < pool.length && legs.length < want; j++) {
      const c = pool[(j + k) % pool.length]; // rotated start — tickets differ by construction
      if ((appearances.get(c.player) ?? 0) >= FUN_SHAPE.repeatCap) continue;
      if (teams.has(c.team as string)) continue;
      if (legs.some((l) => l.player === c.player)) continue;
      teams.add(c.team as string);
      legs.push(c);
    }
    if (legs.length < FUN_SHAPE.legs.min) break; // the pool can no longer seat a legal ticket
    const sig = legs.map((l) => l.player).sort().join("|");
    if (seen.has(sig)) break;
    seen.add(sig);
    for (const l of legs) appearances.set(l.player, (appearances.get(l.player) ?? 0) + 1);
    built.push(legs);
  }

  if (!built.length) {
    return { tickets: [], sum: 0, note: `fun: the HR pool could not seat a ${FUN_SHAPE.legs.min}-leg team-disjoint ticket today` };
  }

  const base = Math.floor(amt / built.length);
  const rem = amt - base * built.length;
  const tickets: FunTicket[] = built.map((legs, i) => {
    const dec = legs.reduce((a, l) => a * Number(l.dec), 1);
    const p = legs.reduce((a, l) => a * (Number(l.prob) / 100), 1);
    const am = dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1));
    return {
      name: `HR Longshot · ${legs.length} hitters, ${legs.length} teams`,
      type: "fun_hr",
      stake: base + (i === 0 ? rem : 0),
      czDec: dec,
      czOdds: am > 0 ? `+${am}` : String(am),
      prob: p * 100,
      czEv: (p * dec - 1) * 100,
      legs,
    };
  });
  const sum = tickets.reduce((a, t) => a + t.stake, 0);
  return {
    tickets,
    sum,
    ...(built.length < FUN_SHAPE.tickets.min
      ? { note: `fun: pool seated only ${built.length} legal ticket${built.length === 1 ? "" : "s"} (target ${FUN_SHAPE.tickets.min}-${FUN_SHAPE.tickets.max})` }
      : {}),
  };
}

/**
 * THE H+R+RBI LADDER (INSTRUCTION 18, 2026-09-03, Josh's word, verbatim: "Could maybe
 * look into taking like. 8-15 leg H+R+RBI etc as one or more of the fun tickets daily
 * as well. Could be other props or longshots as well." — and "I dont want to change that
 * $25 fun money hypothetical per day").
 *
 * One 8–12 leg (target 10) ticket a day of the likeliest H+R+RBI O 0.5 and Hits O 0.5
 * rows that carry a Caesars price, taken most-likely-first from the board's own rows:
 *   - at most 2 legs per team (same-lineup overs correlate; the ladder is a longshot, not
 *     a team stack);
 *   - one leg per player;
 *   - leg-disjoint from everything already staked today (`used`);
 *   - rows flagged noParlay are skipped; the susp flag is IGNORED for fun money (the
 *     HRR-over suspension is a CORE rule — fun money is where the longshot lives).
 * Fewer than 8 seats → null, and the $25 goes to the HR composer exactly as before.
 * Price and probability are naive products of the rows' own numbers — disclosed, never
 * fabricated. The ladder's $10 comes out of the same $25: the fun total never moves.
 */
export const FUN_LADDER = {
  since: "2026-09-03",
  amount: 10,
  legs: { min: 8, target: 10, max: 12 },
  teamCap: 2,
} as const;

export type FunLadderTicket = {
  name: string;
  type: "fun_ladder";
  stake: number;
  czDec: number;
  czOdds: string;
  prob: number; // percent, naive product
  czEv: number; // percent
  legs: FunLegSrc[];
};

export function buildFunLadderTicket(
  poolIn: FunLegSrc[],
  amount: number,
  used: Set<string>,
): FunLadderTicket | null {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (amt <= 0) return null;
  const pool = poolIn
    .filter(
      (l) =>
        l.team &&
        l.player &&
        l.dec != null &&
        Number(l.dec) > 1 &&
        l.prob != null &&
        Number(l.prob) > 0 &&
        !used.has(legKeyOf(l)),
    )
    .sort((a, b) => Number(b.prob) - Number(a.prob) || a.player.localeCompare(b.player) || a.prop.localeCompare(b.prop));
  const teams = new Map<string, number>();
  const players = new Set<string>();
  const legs: FunLegSrc[] = [];
  for (const c of pool) {
    if (legs.length >= FUN_LADDER.legs.target) break;
    const t = c.team as string;
    if ((teams.get(t) ?? 0) >= FUN_LADDER.teamCap) continue;
    if (players.has(c.player)) continue;
    teams.set(t, (teams.get(t) ?? 0) + 1);
    players.add(c.player);
    legs.push(c);
  }
  if (legs.length < FUN_LADDER.legs.min) return null;
  const dec = legs.reduce((a, l) => a * Number(l.dec), 1);
  const p = legs.reduce((a, l) => a * (Number(l.prob) / 100), 1);
  const am = dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1));
  return {
    name: `H+R+RBI Ladder · ${legs.length} hitters`,
    type: "fun_ladder",
    stake: amt,
    czDec: dec,
    czOdds: am > 0 ? `+${am}` : String(am),
    prob: p * 100,
    czEv: (p * dec - 1) * 100,
    legs,
  };
}
