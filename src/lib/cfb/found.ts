import { assertAppendOnly } from "@/lib/append-only";
import { buildCfbCard, byEv, drafts, finish, ticketName, type Draft } from "@/lib/cfb/card";
import { gradeCfbEntry } from "@/lib/cfb/grade";
import { validateCfbLedger } from "@/lib/cfb/ledger";
import { assertEntryMoney, cfbFunRefusedOf, cfbPricedAhead, cfbStakeOf } from "@/lib/cfb/lock-server";
import { baseMarketOf, isH1Market } from "@/lib/cfb/markets";
import { CFB_PROP_MARKETS } from "@/lib/cfb/props-types";
import type { CfbBoard, CfbFinals, CfbGame, CfbLedgerEntry, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";
import { FOUND, FOUND_POLICY, STRAIGHT_POLICY, foundCeiling, foundFunOf, foundStake, foundWonByOf, foundWonOf, isStraightDay, pickFound } from "@/lib/found-mode";
import { imageNameKey } from "@/lib/player-images";
import { priceFootballProp } from "@/lib/sportsbook/football";

/**
 * FOUND MODE, THE FOOTBALL HALF (CFB + NFL) — 2026-10-03, Josh's word (verbatim in
 * src/lib/found-mode.ts): "The engine should lock bets as it finds them … any time it finds a bet
 * or a parlay, it can add that to the daily card and lock that pick/parlay on it … increase the
 * daily amount for each sport to $2500. Bets can be of any amount".
 *
 * Pure. On a found day (date >= FOUND_SINCE) the football card has no lock instant, no ticket
 * count and no slot shape. Every pass that pays for a priced board hands that board here and
 * gets back the bets it found that the day does not already carry:
 *
 *   candidates  the Kelly branch of `buildCfbCard`, unchanged in its gate: playable full-game rows
 *               (`r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market)`) on games
 *               that start after `now`, EV >= rules.minEvPct (+2%) at DraftKings, dec <= rules.maxDec
 *               (2.60), singles and cross-game doubles (one leg per game inside a ticket). On a board
 *               that carries the NFL variety props (`paperProps`), the same fresh O/U prop singles the
 *               variety card admits, under the same +EV / maxDec gate. Unlike the slot card there is
 *               no "best row per game" cut — a game's total and its side are different bets.
 *   dedupe      at most ONE core bet per (game, family) for the whole day, seeded from the stored
 *               core: family "side" (spread + ML — the same outcome priced two ways), "total", or a
 *               prop keyed by player|market. A pass never re-seats what an earlier pass seated.
 *   ranking     ticket EV at the DraftKings price, descending; ties by probability, then by the
 *               ticket's leg keys, so two runs over one board pick the same bets.
 *   sizing      `foundStake` — whole dollars, $5 floor, $800 ceiling, sized off FOUND.bankroll
 *               ($10,000, never the runtime bankroll), trimmed to the room left under the day's
 *               ceiling: FOUND.daily plus what the day's bets have already WON (2026-10-03, Josh:
 *               "If a bet wins … that is added on top of what can be bet on the day") — the
 *               server's settle pass grades each poke, so a final frees its winnings on the next.
 *   fun         $25 once a day through the existing fun builder (`buildCfbCard` with daily 0 seats
 *               no core and builds only the fun parlay), and only while the day has no fun ticket
 *               and no refused one.
 *
 * Prices are never touched: every leg's price is the slate's DraftKings quote, carried as given.
 */

/** the dedupe family of one leg: "side" (spread / ML), "total", or a player prop by player|market */
export function foundFamilyOf(leg: Pick<CfbTicketLeg, "market" | "player">): string {
  if (leg.player) return `prop:${imageNameKey(leg.player)}|${leg.market}`;
  const base = baseMarketOf(leg.market);
  if (base === "spread" || base === "ml") return "side";
  if (base === "total") return "total";
  return `m:${base}`;
}

/** `${gkey}|${family}` — the day-level dedupe key */
export function foundKeyOf(leg: Pick<CfbTicketLeg, "gkey" | "market" | "player">): string {
  return `${leg.gkey}|${foundFamilyOf(leg)}`;
}

/** every (game, family) the stored CORE already sits on */
export function foundUsedOf(core: readonly CfbTicket[]): Set<string> {
  const out = new Set<string>();
  for (const t of core) for (const l of t.legs ?? []) out.add(foundKeyOf(l));
  return out;
}

const FOUND_ID_RE = /-found-(\d+)$/;

/** the next `-found-N` ordinal: one past the highest on the day (core and fun share the id space) */
export function nextFoundIndex(tickets: readonly { id: string }[]): number {
  let hi = 0;
  for (const t of tickets) {
    const m = FOUND_ID_RE.exec(String(t.id));
    if (m) hi = Math.max(hi, Number(m[1]));
  }
  return hi + 1;
}

const PROP_MARKETS = ["pass_yds", "pass_tds", "rush_yds", "receptions", "rec_yds"];

/** the NFL variety O/U prop singles, filtered exactly as `buildCfbCard`'s variety branch filters them, plus the core EV gate */
function propDrafts(cfg: LeagueConfig, board: CfbBoard, games: Map<string, CfbGame>, now: number): Draft[] {
  const R = cfg.rules;
  const pp = board.paperProps;
  if (!pp || pp.date !== board.date) return [];
  const kicked = (g: CfbGame) => !(Date.parse(g.start) > now);
  return (pp.rows ?? [])
    .map((r) => priceFootballProp(r, "draftkings", FOUND.bankroll, R))
    .filter((r) => {
      const g = games.get(r.gameId);
      const stamp = Date.parse(pp.pricedAt?.[r.gameId] ?? "");
      return (
        !!r.teamId && !!g && [g.home.id, g.away.id].includes(r.teamId) && g.status === "upcoming" && !kicked(g) &&
        PROP_MARKETS.includes(r.market) && r.side !== "yes" && r.line != null && r.line % 1 === 0.5 &&
        !!r.cz && r.cz.line === r.line && r.cz.dec <= R.maxDec && r.cz.dec > 1 &&
        r.fair != null && r.fair > 0 && r.fair < 1 && Number.isFinite(r.evCz) && (r.evCz as number) >= R.minEvPct &&
        Number.isFinite(stamp) && stamp <= now && now - stamp <= 30 * 60_000
      );
    })
    .map((r) => ({
      legs: [{
        label: r.label,
        prop: CFB_PROP_MARKETS.find((m) => m.id === r.market)!.label,
        cz: r.cz!.price,
        gkey: r.gameId,
        lkey: r.key,
        market: r.market,
        side: r.side as "over" | "under",
        line: r.line,
        teamId: r.teamId,
        player: r.player,
        headshot: r.headshot,
        pos: r.pos,
        teamAbbr: r.teamAbbr,
        prob: r.fair!,
        push: 0,
      }],
      games: [r.gameId],
      dec: r.cz!.dec,
      prob: r.fair!,
      ev: r.evCz!,
      rows: [],
    }));
}

const keyOfDraft = (d: Draft) => d.legs.map((l) => l.lkey).join("+");

/** every found candidate on the board, best first (EV at DK, then probability, then leg keys) */
export function foundCandidates(cfg: LeagueConfig, board: CfbBoard, now: number): Draft[] {
  const R = cfg.rules;
  const games = new Map(board.games.map((g) => [g.id, g]));
  const ahead = (g: CfbGame) => Date.parse(g.start) > now;
  const rows = board.games.flatMap((g) =>
    ahead(g)
      ? g.rows.filter(
          (r) => r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market) && r.evCz >= R.minEvPct && r.cz.dec <= R.maxDec,
        )
      : [],
  );
  /* STRAIGHT BETS ONLY from STRAIGHT_SINCE (2026-10-06): singles; before it, singles and cross-game doubles */
  const legCap = isStraightDay(board.date) ? 1 : Math.min(R.maxLegs, 2);
  const out = drafts(rows, games, R.maxDec, legCap).filter((d) => d.legs.length <= legCap).filter((d) => d.dec <= R.maxDec && new Set(d.games).size === d.games.length);
  out.push(...propDrafts(cfg, board, games, now));
  return out.sort((a, b) => byEv(a, b) || keyOfDraft(a).localeCompare(keyOfDraft(b)));
}

export type FoundPlan = {
  tickets: CfbTicket[];
  stake: number;
  fun: CfbTicket[];
  funStake: number;
  games: NonNullable<CfbLedgerEntry["games"]>;
  /** core room under the day's ceiling before this plan */
  roomBefore: number;
  /** the day's realized winnings this plan counted (foundWonOf the entry) */
  won: number;
  /** the day's core ceiling: FOUND.daily + won */
  ceiling: number;
  /** core room left after this plan */
  room: number;
  candidates: number;
  pricedAhead: number;
};

/**
 * What this pass would add to `entry` (null = the day's first entry). Pure; never mutates `entry`.
 */
export function planFound(cfg: LeagueConfig, board: CfbBoard, entry: CfbLedgerEntry | null, now: number): FoundPlan {
  const core = entry?.core ?? [];
  const funT = entry?.funT ?? [];
  const used = foundUsedOf(core);
  const won = foundWonOf(entry as never);
  const ceiling = foundCeiling(won);
  const roomBefore = Math.max(0, ceiling - cfbStakeOf(core));
  const cands = foundCandidates(cfg, board, now);
  const { picks, room } = pickFound(cands, {
    room: roomBefore,
    stakeOf: (d, r) => foundStake(d.prob, d.dec, r),
    admit: (d) => new Set(d.games).size === d.games.length && d.legs.every((l) => !used.has(foundKeyOf(l))),
    commit: (d) => {
      for (const l of d.legs) used.add(foundKeyOf(l));
    },
  });

  const ids = new Set([...core, ...funT].map((t) => String(t.id)));
  let n = nextFoundIndex([...core, ...funT]);
  const mint = () => {
    let id = `${cfg.idPrefix}-${board.date}-found-${n++}`;
    while (ids.has(id)) id = `${cfg.idPrefix}-${board.date}-found-${n++}`;
    ids.add(id);
    return id;
  };
  const tickets: CfbTicket[] = picks.map((p) => ({
    ...finish(mint(), "core", ticketName(p.c), p.c, p.stake),
    found: true,
    foundAt: now,
    paperPolicy: isStraightDay(board.date) ? STRAIGHT_POLICY : FOUND_POLICY,
  }));

  /* FUN: $25 once a day, the existing builder, only while the day has no fun ticket and no refused one */
  const fun: CfbTicket[] = [];
  if (!funT.length && foundFunOf(board.date) > 0 && !(entry && cfbFunRefusedOf(entry).length)) {
    const card = buildCfbCard(board, { bankroll: FOUND.bankroll, daily: 0, fun: cfg.paper.fun, now, rules: cfg.rules, idPrefix: cfg.idPrefix });
    const t = card.funT[0];
    if (t && t.stake > 0) {
      let id = t.id;
      for (let k = 1; ids.has(id); k++) id = `${cfg.idPrefix}-${board.date}-found-fun-${k}`;
      ids.add(id);
      fun.push({ ...t, id, found: true, foundAt: now, paperPolicy: FOUND_POLICY });
    }
  }

  const byId = new Map(board.games.map((g) => [g.id, g]));
  const games: NonNullable<CfbLedgerEntry["games"]> = {};
  for (const t of [...tickets, ...fun]) {
    for (const l of t.legs) {
      if (games[l.gkey]) continue;
      const g = byId.get(l.gkey);
      if (g) games[l.gkey] = { pk: Number(g.id), start: g.start, home: g.home.name, away: g.away.name };
    }
  }
  const stake = cfbStakeOf(tickets);
  return {
    tickets,
    stake,
    fun,
    funStake: cfbStakeOf(fun),
    games,
    roomBefore,
    won,
    ceiling,
    room: Math.max(0, roomBefore - stake),
    candidates: cands.length,
    pricedAhead: cfbPricedAhead(board.games, now),
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** the one plain line under the card when a pass seats nothing new */
export function foundNothingReason(cfg: LeagueConfig, date: string, plan: FoundPlan): string {
  if (plan.pricedAhead === 0) return `no DraftKings price on any ${cfg.short} game still ahead on ${date} — nothing new was added.`;
  if (plan.roomBefore < FOUND.minStake) return `the day's $${plan.ceiling} ${cfg.short} ceiling is reached — nothing new was added.`;
  return `nothing new on the ${plan.pricedAhead} priced ${cfg.short} sides still ahead on ${date} clears +${cfg.rules.minEvPct}% EV at DraftKings on a game and bet type the card is not already on — nothing added, $${plan.roomBefore} of the $${plan.ceiling} ceiling stays open.`;
}

/**
 * The day's FIRST found entry — always written on a found day, even at $0 (core: [] and a note), so
 * every later pass is the append path. Throws (nothing written) on a money-guard or validator failure.
 */
export function buildFoundEntry(
  cfg: LeagueConfig,
  board: CfbBoard,
  o: { now: number; ahead: number; total: number; trigger?: string },
): { entry: CfbLedgerEntry; plan: FoundPlan } {
  const plan = planFound(cfg, board, null, o.now);
  const staked = plan.stake + plan.funStake;
  const head = `Found mode — the card locks bets as the engine finds them (up to $${FOUND.daily} a day plus that day's winnings, Kelly-sized whole dollars). First pass at ${new Date(o.now).toISOString()}`;
  const body = plan.tickets.length
    ? `${plural(plan.tickets.length, "core ticket")} for $${plan.stake}.`
    : o.ahead === 0
      ? `every one of the ${o.total} games had kicked off — nothing pregame was left to seat.`
      : `nothing yet — ${foundNothingReason(cfg, board.date, plan)} Later refreshes append what they find.`;
  const fun = plan.fun.length ? ` Fun: $${plan.funStake}.` : ` Fun: no qualifying parlay yet.`;
  const entry: CfbLedgerEntry = {
    sport: cfg.id,
    date: board.date,
    locked: true,
    daily: FOUND.daily,
    fun: cfg.paper.fun,
    core: plan.tickets,
    funT: plan.fun,
    lockedAt: o.now,
    games: plan.games,
    grading: null,
    source: cfg.lockSource,
    trigger: cfg.triggers.lock,
    note: `${head}: ${body}${fun}`,
  };
  if (!(staked > 0)) entry.noPlay = true;
  const rec = entry as Record<string, unknown>;
  rec.found = true;
  rec.paperPolicy = FOUND_POLICY;
  if (o.trigger) rec.foundTrigger = o.trigger;
  assertEntryMoney(cfg, entry);
  const v = validateCfbLedger([entry], cfg);
  if (!v.ok) throw new Error(`found entry failed the ${cfg.short} ledger's own validator: ${v.error}`);
  return { entry, plan };
}

/**
 * Append a plan to a stored entry. Append only: every stored ticket stays at its stake; grading
 * reopens when it had closed (as `applyTopUp` does); the money guard and validator run over the
 * merged entry and throw on any breach (nothing written).
 */
export function applyFound(cfg: LeagueConfig, entry: CfbLedgerEntry, plan: FoundPlan, now: number, slot?: string): CfbLedgerEntry {
  const core = [...entry.core, ...plan.tickets];
  const funT = [...entry.funT, ...plan.fun];
  const staked = cfbStakeOf(core);
  const funStaked = cfbStakeOf(funT);
  const next: CfbLedgerEntry = {
    ...entry,
    /* a day locked before it turned found (2026-10-03 itself) carried its old allotment — the found
       day's ceiling is $2,500, and the merge reads `daily` as the day's claim (ledger-merge.ts) */
    daily: FOUND.daily,
    core,
    funT,
    games: { ...plan.games, ...(entry.games ?? {}) },
    note: `${entry.note ?? ""} · Found ${new Date(now).toISOString()}${slot ? ` (${slot})` : ""}: +${plural(plan.tickets.length, "core ticket")} $${plan.stake}${plan.fun.length ? `, +fun $${plan.funStake}` : ""} — the day now carries $${staked} of the $${plan.ceiling} ceiling${plan.won > 0 ? ` ($${FOUND.daily} + $${plan.won} won today)` : ""} and $${funStaked} of the $${cfg.paper.fun} fun.`.trim(),
  };
  /* the winnings this write counted ride on the entry, so the merge and the money guard see them */
  const rec = next as Record<string, unknown>;
  const wonBy = foundWonByOf(next as never);
  if (Object.keys(wonBy).length) rec.foundWonBy = wonBy;
  else delete rec.foundWonBy;
  if (next.noPlay && (staked > 1e-9 || funStaked > 1e-9)) delete next.noPlay;
  const grading = next.grading;
  if (grading?.done) {
    const graded = grading.tickets ?? {};
    if ([...core, ...(next.funT ?? [])].some((t) => !(t.id in graded))) {
      next.grading = { ...grading, tickets: { ...graded }, legs: { ...(grading.legs ?? {}) }, done: false };
    }
  }
  assertAppendOnly(entry, next, "applyFound");
  assertEntryMoney(cfg, next);
  const v = validateCfbLedger([next], cfg);
  if (!v.ok) throw new Error(`found entry failed the ${cfg.short} ledger's own validator: ${v.error}`);
  return next;
}

/**
 * THE DAY'S WINNINGS AS OF THIS POKE (2026-10-03, Josh: "If a bet wins … that is added on top of what
 * can be bet on the day … Only way to get more money for that day is to hit a bet THAT DAY").
 *
 * The settle pass grades a football day only once it is over (cfg.settle.finishMs past its LAST
 * kickoff), so a noon win would add nothing until night. The found pass therefore grades the stored
 * entry IN MEMORY against the finals of the free ESPN board it already read on this poke (zero Odds
 * credits) — the same `gradeCfbEntry` the settle pass uses — and counts each ticket that grades WON.
 * A ticket still waiting on a game, a void, a prop leg without its stat line: nothing. The result is
 * never written as `grading` (the settle pass still owns that); it travels only as the entry's
 * recorded per-ticket `foundWonBy` read. Never throws — a grading failure reads as "nothing new won".
 */
export function foundWonByFromFinals(cfg: LeagueConfig, entry: CfbLedgerEntry, finals: CfbFinals, now: number): Record<string, number> {
  const recorded = foundWonByOf(entry as never);
  try {
    const mem = gradeCfbEntry(entry, finals, now, cfg).tickets ?? {};
    /* the grade that decides each ticket: the STORED settled grade, else this read's settled grade (so a
       loss this read sees cancels an earlier recorded win), else the recorded read for a ticket still open */
    const stored = (entry.grading?.tickets ?? {}) as Record<string, { result?: unknown }>;
    const tickets: Record<string, unknown> = {};
    for (const [id, g] of Object.entries(mem)) if (g && g.result !== "pending") tickets[id] = g;
    for (const [id, g] of Object.entries(stored)) if (g && g.result != null && g.result !== "pending") tickets[id] = g;
    return foundWonByOf({ core: entry.core, funT: entry.funT, grading: { tickets }, foundWonBy: (entry as { foundWonBy?: unknown }).foundWonBy } as never);
  } catch {
    return recorded;
  }
}

/** the same read as one number */
export function foundWonFromFinals(cfg: LeagueConfig, entry: CfbLedgerEntry, finals: CfbFinals, now: number): number {
  return foundWonOf({ ...(entry as object), foundWonBy: foundWonByFromFinals(cfg, entry, finals, now) } as never);
}
