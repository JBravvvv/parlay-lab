import { chooseFunRows } from "@/lib/football/fun-parlay";
import { imageNameKey } from "@/lib/player-images";
import { priceFootballProp } from "@/lib/sportsbook/football";
import { CFB_PROP_MARKETS } from "./props-types";
import { decFromAmerican } from "@/engine2/devig";
import { decToAm } from "@/lib/ticket-math";
import { CFB_RULES } from "@/lib/cfb/rules";
import { baseMarketOf, isH1Market, marketWord } from "@/lib/cfb/markets";
import { rowProbAt, sideLabel } from "@/lib/cfb/model";
import type { CfbBoard, CfbCard, CfbCardOpts, CfbGame, CfbRow, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";
import { isFullPaper } from "@/lib/football/sunday-paper";
import type { LeagueRules } from "@/lib/football/league";

/**
 * THE CFB PAPER CARD (INSTRUCTION 38, 2026-09-05) — `buildCfbCard`, pure, from a priced board
 * to the day's tickets under CFB_RULES. Same shape as the MLB card Josh already reads: a CORE
 * set ($150) of short-priced +EV tickets, one FUN ticket ($25), every stake a whole dollar.
 *
 *   candidates  playable rows (kickoff after opts.now) with EV ≥ minEvPct at Caesars and
 *               Caesars dec ≤ maxDec; one row per game (the highest EV, then the likelier).
 *   tickets     singles + cross-game DOUBLEs whose combined dec ≤ maxDec, ranked by EV%;
 *               a ticket's prob = Π(p_i / (1 − push_i)) — the push mass drops out because a
 *               pushed leg hands the stake back at settlement — and its EV = 100·(prob·dec − 1).
 *   picking     greedy by EV, never two core tickets on one game, stake = ¼-Kelly clamped to
 *               [minStake, maxStake], stop at tickets.max or the $150.
 *   top-up      the $150 must deploy: raise stakes (likeliest first) to maxStake; then add
 *               tickets by probability from the forced pool (dec ≤ forcedMaxDec, EV ≥ 0);
 *               what still cannot deploy is written into `notes`, never forced past the rules.
 *   fun         one 3–5 leg parlay across distinct games, searching probability and payout bands
 *               among grade D-or-better sides. Enforce fun.minDec ≤ payout ≤ fun.maxDec;
 *               leave the fun allocation unspent when no qualifying combination exists. Named FAVORITES PARLAY when the legs mostly are favorites, else FUN PARLAY.
 *   noPlay      nothing staked at all — no core ticket AND no fun parlay — and the note says so.
 *
 * ONE CARD BUILDER, TWO LEAGUES (2026-09-08, the NFL build). The rules object `R` is
 * `opts.rules ?? CFB_RULES` — the component layer passes nothing and gets the CFB desk; the server
 * seams pass their league's rules (NFL_RULES: $350 across ≤ 10 tickets of ≤ $50). Every helper that
 * used to read CFB_RULES by name (`ticketKelly`, `drafts`) now takes `R`, so no NFL ticket can be
 * sized on a CFB knob. Ticket ids are minted `${opts.idPrefix ?? "cfb"}-${date}-core-${i}` / `-fun-1`
 * — the grading map is keyed on them, so a league's ids name the league they belong to.
 */

/**
 * THE CORE GATE MUST NOT GATE THE FUN MONEY (INSTRUCTION 45, 2026-09-06). Josh, verbatim:
 * "Parlay Lab CFB should've been running the same $150 per day theoretical Core money and $25
 * Fun money per day". Both halves are money, and this function was throwing the second one away.
 *
 * WHAT WENT WRONG. `buildCfbCard` filtered `cands` off the CORE gate — R.minEvPct (+2% EV at
 * Caesars) and R.maxDec (2.60) — and when `bestRows` came back empty it RETURNED, from inside the
 * CORE section, `{ core: [], funT: [], noPlay: true }`. The fun section sits below that return and
 * was never reached. But the fun parlay is priced off an entirely different and looser gate —
 * CFB_RULES.fun.minEvPct = -3 (grade D or better at Caesars), its own 4–40 decimal band, 3–5 legs
 * across distinct games — so a board that offers the core nothing routinely still carries a good
 * $25 ticket. The core's verdict was being applied to money the core does not own.
 *
 * MEASURED on this repo's own real 2026-09-05 fixture, no synthetic uplift. The lock's card seats
 * its core on three games; `planCfbTopUp` (src/lib/cfb/lock-server.ts) then re-prices exactly the
 * games the core is not on — nine games, 46 priced sides, ZERO clearing the +2% / 2.60 core gate,
 * SIX clearing the -3% fun gate across FIVE distinct games. That board answered noPlay with $0 of
 * the $25. Rebuilt with `daily: 0` and with `daily: 150` it answered noPlay both times, so it was
 * never a room problem — the fun bucket simply sat behind the core's gate. Each such attempt buys
 * one CFB game-lines pull (6 Odds credits), up to CFB_TOPUP_MAX per date (2 when this was
 * measured; 6 since INSTRUCTION 48, 2026-09-09), for nothing seated,
 * every Saturday, against a 2500/day cap that already binds on Saturdays.
 *
 * THE SHAPE OF THE FIX. The early return is gone. The whole core body — `admit`, `raise`, the
 * forced top-up, the undeployed / minimum-tickets notes and the bench sweep — is wrapped in
 * `if (bestRows.length)`, so a core-empty board skips it exactly as the return used to, and then
 * FALLS THROUGH to the fun section untouched. Nothing about the fun build changed: it still reads
 * `playable` (not `cands`), still filters on R.fun.minEvPct, still honours R.fun.legs and
 * R.fun.minDec / R.fun.maxDec, and still stakes exactly `opts.fun`. No gate was widened.
 *
 * `noPlay` KEEPS ITS MEANING — nothing was staked — and simply becomes true LESS OFTEN: it is the
 * old condition (`!bestRows.length`) ANDed with "and the fun bucket stayed empty too". It can
 * never become true on a board where it used to be false. THIS ALSO CHANGES THE LOCK PATH, not
 * only the top-up: a locked day that previously recorded NO-PLAY may now record a $25 fun ticket,
 * which is precisely what Josh asked for.
 *
 * THE NOTE, deferred to the end for the same reason. A core-empty day no longer claims a no-play
 * it did not have: it says the core found nothing and that the fun parlay is the day's only money.
 * The genuine no-play wording is unchanged, byte for byte, and is `unshift`ed so it stays
 * `notes[0]` — `buildCfbLockEntry` and `buildCfbSweepEntry` both read `card.notes[0]`.
 */

type Draft = { legs: CfbTicketLeg[]; games: string[]; dec: number; prob: number; ev: number; rows: CfbRow[] };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, dp: number) => {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
};

/** INSTRUCTION 46 fix round (2026-09-08): exported so the identity copy below is pinned directly. */
export function legOf(row: CfbRow, game: CfbGame): CfbTicketLeg | null {
  if (!row.cz) return null;
  const base = baseMarketOf(row.market);
  const line = base === "ml" ? null : row.cz.line;
  const p = rowProbAt(game.model, row.market, row.side, base === "ml" ? null : line);
  if (!p) return null;
  const leg: CfbTicketLeg = {
    label: sideLabel(game, row.market, row.side, line),
    prop: marketWord(row.market),
    cz: row.cz.price,
    gkey: row.gameId,
    lkey: row.key,
    market: row.market,
    side: row.side,
    line,
    teamId: row.teamId,
    prob: p.win,
    push: p.push,
  };
  // INSTRUCTION 46 fix round: a pick that names a player carries his headshot / position / team
  // abbreviation onto the leg so the Ledger and ticket cards draw the PlayerMark (his face + HIS
  // team's logo). Side rows carry none of these and the leg stays byte-identical to before.
  if (row.player) {
    leg.player = row.player;
    leg.headshot = row.headshot ?? null;
    leg.pos = row.pos ?? null;
    if (row.teamAbbr != null) leg.teamAbbr = row.teamAbbr;
  }
  return leg;
}

function draftOf(rows: CfbRow[], games: Map<string, CfbGame>): Draft | null {
  const legs: CfbTicketLeg[] = [];
  let dec = 1;
  let prob = 1;
  for (const r of rows) {
    const g = games.get(r.gameId);
    if (!g) return null;
    const leg = legOf(r, g);
    if (!leg) return null;
    legs.push(leg);
    dec *= decFromAmerican(leg.cz);
    prob *= leg.prob / Math.max(1e-9, 1 - leg.push);
  }
  return { legs, games: rows.map((r) => r.gameId), dec, prob, ev: 100 * (prob * dec - 1), rows };
}

/** ¼-Kelly on the ticket's no-push probability, whole dollars, `R.kellyCap` (2%) cap. */
function ticketKelly(d: Draft, bankroll: number, R: LeagueRules): number {
  const b = d.dec - 1;
  if (!(b > 0)) return 0;
  const f = R.kellyFrac * ((d.prob * b - (1 - d.prob)) / b);
  if (!(f > 0)) return 0;
  return Math.round(Math.min(f, R.kellyCap) * bankroll);
}

function ticketName(d: Draft): string {
  const labels = d.legs.map((l) => l.label).join(" + ");
  return d.legs.length === 1 ? `SINGLE · ${labels}` : `DOUBLE · ${labels}`;
}

function finish(id: string, bucket: "core" | "fun", name: string, d: Draft, stake: number): CfbTicket {
  return {
    id,
    bucket,
    name,
    stake,
    czOdds: decToAm(d.dec),
    czDec: round(d.dec, 4),
    prob: round(d.prob * 100, 2),
    czEv: round(d.ev, 2),
    legs: d.legs,
  };
}

const byEv = (a: Draft, b: Draft) => b.ev - a.ev || b.prob - a.prob;
const byProb = (a: Draft, b: Draft) => b.prob - a.prob || b.ev - a.ev;
const better = (a: CfbRow, b: CfbRow) => (a.evCz ?? -Infinity) - (b.evCz ?? -Infinity) || a.fair - b.fair;

/** One row per game: the highest EV at Caesars, then the likelier. The rest are benched. */
function bestPerGame(rows: CfbRow[], benched: CfbCard["benched"], reason: (winner: CfbRow) => string): Map<string, CfbRow> {
  const best = new Map<string, CfbRow>();
  for (const r of rows) {
    const cur = best.get(r.gameId);
    if (!cur) {
      best.set(r.gameId, r);
      continue;
    }
    if (better(r, cur) > 0) {
      benched.push({ label: cur.label, evCz: cur.evCz ?? 0, reason: reason(r) });
      best.set(r.gameId, r);
    } else {
      benched.push({ label: r.label, evCz: r.evCz ?? 0, reason: reason(cur) });
    }
  }
  return best;
}

function drafts(rows: CfbRow[], games: Map<string, CfbGame>, maxDec: number, maxLegs: number): Draft[] {
  const out: Draft[] = [];
  const singles = new Map<string, Draft>();
  for (const r of rows) {
    const d = draftOf([r], games);
    if (d && d.dec <= maxDec) {
      out.push(d);
      singles.set(r.key, d);
    }
  }
  if (maxLegs >= 2) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].gameId === rows[j].gameId) continue;
        const si = singles.get(rows[i].key);
        const sj = singles.get(rows[j].key);
        if (!si || !sj || si.dec * sj.dec > maxDec) continue;
        const d = draftOf([rows[i], rows[j]], games);
        if (d && d.dec <= maxDec) out.push(d);
      }
    }
  }
  return out;
}

export function buildCfbCard(board: CfbBoard, opts: CfbCardOpts): CfbCard {
  const R: LeagueRules = opts.rules ?? CFB_RULES;
  const idPrefix = opts.idPrefix ?? "cfb";
  const notes: string[] = [];
  const benched: CfbCard["benched"] = [];
  const games = new Map(board.games.map((g) => [g.id, g]));
  const kicked = (g: CfbGame) => !(Date.parse(g.start) > opts.now);
  // 2026-09-19: the auto paper card stays a FULL-GAME card — the first-half rows (1H ML / spread / total) are
  // Josh's to pick on the board and in the builder, never drafted onto the locked card unasked
  const playable = board.games.flatMap((g) => (kicked(g) ? [] : g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market))));

  /* ---------- CORE ---------- */
  const cands = playable.filter((r) => (r.evCz ?? -Infinity) >= R.minEvPct && (r.cz?.dec ?? Infinity) <= R.maxDec);
  const bestRows = [...bestPerGame(cands, benched, (w) => `one leg per game — ${w.label} ranks higher`).values()];

  type Pick = { d: Draft; stake: number };
  const picked: Pick[] = [];

  /* A CORE-EMPTY BOARD SKIPS THE CORE AND FALLS THROUGH TO THE FUN SECTION (INSTRUCTION 45,
     2026-09-06). This `if` replaces the early `return` that used to stand here; everything inside
     it is the core body byte for byte. See the docblock above `buildCfbCard` for why the core's
     verdict may not be applied to the fun bucket's money. */
  const sundayPaper = isFullPaper(R, board.date);
  const varied = !!R.variedPaperSince && board.date >= R.variedPaperSince;
  const policy = varied ? "nfl-variety-v2" : R.fullPaperSince ? "full-core-v1" : "sunday-full-v1";
  const policyLabel = varied ? "NFL variety" : R.fullPaperSince ? "Full core" : "Sunday";
  if (sundayPaper) {
    // A fixed-budget paper cohort: rank real, pregame single bets by estimated EV,
    // diversify across games, then equal-weight. No outcome or current score is read.
    const eligible = playable.filter(r => Number.isFinite(r.evCz) && r.cz!.dec > 1 && r.cz!.dec <= R.maxDec);
    let singles = drafts([...bestPerGame(eligible, [], () => "").values()], games, R.maxDec, 1)
      .sort((a, b) => byEv(a, b) || a.rows[0].key.localeCompare(b.rows[0].key));
    if (varied) {
      const props = (board.paperProps?.rows ?? []).map(r => priceFootballProp(r, "draftkings", opts.bankroll, R)).filter(r => {
        const g=games.get(r.gameId); const stamp=Date.parse(board.paperProps?.pricedAt?.[r.gameId] ?? "");
        return board.paperProps?.date===board.date && r.teamId && g && [g.home.id,g.away.id].includes(r.teamId) && g.status==="upcoming" && !kicked(g) && ["pass_yds","pass_tds","rush_yds","receptions","rec_yds"].includes(r.market) && r.side!=="yes" && r.line!=null && r.line%1===0.5 && r.cz && r.cz.line===r.line && r.cz.dec<=R.maxDec && r.cz.dec>1 && r.fair!=null && r.fair>0 && r.fair<1 && Number.isFinite(r.evCz) && Number.isFinite(stamp) && stamp<=opts.now && opts.now-stamp<=30*60_000;
      }).sort((a,b)=>(b.evCz??-Infinity)-(a.evCz??-Infinity)||a.key.localeCompare(b.key));
      const propDrafts: Draft[] = props.map(r=>({legs:[{label:r.label,prop:CFB_PROP_MARKETS.find(m=>m.id===r.market)!.label,cz:r.cz!.price,gkey:r.gameId,lkey:r.key,market:r.market,side:r.side as "over"|"under",line:r.line,teamId:r.teamId,player:r.player,headshot:r.headshot,pos:r.pos,teamAbbr:r.teamAbbr,prob:r.fair!,push:0}],games:[r.gameId],dec:r.cz!.dec,prob:r.fair!,ev:r.evCz!,rows:[]}));
      const selected:Draft[]=[];const used=new Set<string>();const players=new Set<string>();
      const add=(d:Draft)=>{const player=d.legs[0].player; if(used.has(d.games[0]) || (player && players.has(imageNameKey(player)))) return; selected.push(d);used.add(d.games[0]);if(player)players.add(imageNameKey(player));};
      // Reserve up to three distinct games for supported, fresh O/U props; remaining slots compete on EV.
      for(const d of propDrafts){if(selected.length>=Math.min(3,R.tickets.max))break;add(d);}
      for(const d of [...singles,...propDrafts].sort(byEv)){if(selected.length>=R.tickets.max)break;add(d);}
      singles=selected.sort(byEv);
      notes.push(`Variety v2: ${selected.filter(d=>d.legs[0].player).length} fresh O/U prop singles; distinct games and players. Props use market-consensus estimates. Missing or older-than-30-minute quotes stay out; sides fill available slots.`);
    }
    const n = Math.min(singles.length, R.tickets.max, Math.floor(opts.daily / R.minStake));
    if (n) {
      const base = Math.floor(opts.daily / n);
      const stakes=Array(n).fill(varied ? Math.min(R.minStake,base) : base) as number[];
      if(varied){let left=opts.daily-stakes.reduce((a,b)=>a+b,0); const cap=Math.max(R.maxStake,Math.ceil(opts.daily/n)); const weights=singles.slice(0,n).map((d,i)=>Math.max(1,n-i)*Math.max(.1,d.prob)); const total=weights.reduce((a,b)=>a+b,0);
        const target=weights.map(w=>opts.daily*w/total);
        while(left>0){let best=-1;for(let i=0;i<n;i++)if(stakes[i]<cap && (best<0 || target[i]-stakes[i]>target[best]-stakes[best]))best=i;if(best<0)break;stakes[best]++;left--;}
      }else for(let i=0;i<opts.daily-base*n;i++)stakes[i]++;
      for (let i = 0; i < n; i++) picked.push({ d: singles[i], stake: stakes[i] });
      notes.push(`${policyLabel} paper allocation: $${opts.daily} across ${n} distinct games. Ranked by estimated EV; full allocation can include negative-EV picks. This cohort is an experiment, not a positive-edge claim.`);
      if (Math.ceil(opts.daily / n) > R.maxStake) notes.push(`Thin slate: equal-weight stakes exceed the usual $${R.maxStake} cap to meet the requested ${policyLabel.toLowerCase()} paper budget.`);
    } else notes.push(`${policyLabel} paper allocation blocked: no verified pregame single under ${R.maxDec} decimal. Missing prices and started games are never invented or backdated.`);
  } else if (bestRows.length) {
    const usedGames = new Set<string>();
    let sum = 0;
    const room = () => opts.daily - sum;
    const admit = (list: Draft[]) => {
      for (const d of list) {
        if (picked.length >= R.tickets.max || room() < R.minStake) break;
        if (d.games.some((g) => usedGames.has(g))) continue;
        const stake = Math.min(clamp(ticketKelly(d, opts.bankroll, R), R.minStake, R.maxStake), room());
        picked.push({ d, stake });
        sum += stake;
        for (const g of d.games) usedGames.add(g);
      }
    };
    const raise = () => {
      for (const p of [...picked].sort((a, b) => byProb(a.d, b.d))) {
        if (room() <= 0) break;
        const add = Math.min(R.maxStake - p.stake, room());
        if (add <= 0) continue;
        p.stake += add;
        sum += add;
      }
    };

    admit(drafts(bestRows, games, R.maxDec, R.maxLegs).sort(byEv));

    /* the top-up: the whole `opts.daily` must deploy */
    if (room() > 0) raise();
    if (room() > 0 && picked.length < R.tickets.max) {
      const forcedRows = playable.filter(
        (r) => !usedGames.has(r.gameId) && (r.evCz ?? -Infinity) >= R.forcedMinEvPct && (r.cz?.dec ?? Infinity) <= R.forcedMaxDec,
      );
      const forcedBest = [...bestPerGame(forcedRows, [], () => "").values()];
      const before = picked.length;
      admit(drafts(forcedBest, games, R.forcedMaxDec, R.maxLegs).sort(byProb));
      if (picked.length > before) {
        notes.push(`Top-up: ${picked.length - before} short-priced ticket(s) (dec ≤ ${R.forcedMaxDec}, EV ≥ ${R.forcedMinEvPct}%) added by probability to deploy the $${opts.daily}.`);
        if (room() > 0) raise();
      }
    }
    if (room() > 0) {
      const why =
        picked.length >= R.tickets.max
          ? `the ${R.tickets.max}-ticket cap`
          : picked.every((p) => p.stake >= R.maxStake)
            ? `every ticket is at the $${R.maxStake} max and no other game offers a side ≥ ${R.forcedMinEvPct}% EV under ${R.forcedMaxDec}`
            : `no further stake fits the $${R.minStake}–$${R.maxStake} band`;
      notes.push(`$${room()} of the $${opts.daily} stayed undeployed — ${why}.`);
    }
    if (picked.length < R.tickets.min) {
      notes.push(`Only ${picked.length} core ticket${picked.length === 1 ? "" : "s"} (minimum ${R.tickets.min}) — the pool is exhausted: ${bestRows.length} game${bestRows.length === 1 ? "" : "s"} carry a +${R.minEvPct}% side.`);
    }
    for (const r of bestRows) {
      if (!usedGames.has(r.gameId)) {
        benched.push({ label: r.label, evCz: r.evCz ?? 0, reason: picked.length >= R.tickets.max ? "ticket cap reached" : "daily allotment reached" });
      }
    }
  }

  const core = picked.map((p, i) => ({
    ...finish(`${idPrefix}-${board.date}-core-${i + 1}`, "core", ticketName(p.d), p.d, p.stake),
    ...(sundayPaper ? { paperPolicy: policy, forced: true, clearsEdgeGate: p.d.ev >= R.minEvPct } : {}),
  }));

  /* ---------- FUN ---------- */
  const funT: CfbTicket[] = [];
  // grade D or better at Caesars: a favorites parlay is priced by the book, so a strict ≥ 0% gate
  // left the 9/5 fixture's fun ticket with three underdogs (the only fair-or-better sides)
  const funRows = playable.filter((r) => (r.evCz ?? -Infinity) >= R.fun.minEvPct);
  const legs = chooseFunRows(funRows.flatMap(row => {
    const game=games.get(row.gameId), leg=game?legOf(row,game):null;
    return leg ? [{row,dec:row.cz!.dec,prob:leg.prob / Math.max(1e-9,1-leg.push)}] : [];
  }),R.fun);
  if (legs.length >= R.fun.legs.min) {
    const d = draftOf(legs, games);
    if (d && d.dec >= R.fun.minDec && d.dec <= R.fun.maxDec) {
      // "FAVORITES" only when the legs mostly are favorites (no-push probability ≥ ½ at Caesars' line)
      const favs = d.legs.filter((l) => l.prob / Math.max(1e-9, 1 - l.push) >= 0.5).length;
      const name = favs * 2 >= d.legs.length ? "FAVORITES PARLAY" : "FUN PARLAY";
      funT.push(finish(`${idPrefix}-${board.date}-fun-1`, "fun", name, d, opts.fun));

    }
  } else {
    notes.push(`Fun: no qualifying ${R.fun.legs.min}–${R.fun.legs.max} leg ticket in the ${R.fun.minDec}×–${R.fun.maxDec}× payout band. The $${opts.fun} fun allocation stays unspent.`);
  }

  /* ---------- THE VERDICT ---------- */
  /* NO-PLAY means NOTHING WAS STAKED — both buckets empty, not just the core's (INSTRUCTION 45,
     2026-09-06). This is the old `!bestRows.length` condition ANDed with an empty fun bucket, so
     it can only ever fire on a day the old code also called no-play. The note is decided here,
     after the fun build, and `unshift`ed so the verdict stays `notes[0]` for the two callers that
     read it by index (`buildCfbLockEntry`, `buildCfbSweepEntry` in src/lib/cfb/lock-server.ts). */
  const noPlay = !core.length && !funT.length;
  if (!bestRows.length && !sundayPaper) {
    const gate = `no playable side clears +${R.minEvPct}% EV at DraftKings under ${R.maxDec.toFixed(2)} (${playable.length} priced sides on ${board.games.length} games)`;
    notes.unshift(
      noPlay
        ? `NO-PLAY — ${gate}. Nothing staked.`
        : `No core ticket — ${gate}. None of the $${opts.daily} core is staked; the $${opts.fun} fun parlay is the day's only money.`,
    );
  }

  return {
    date: board.date,
    core,
    funT,
    coreSum: core.reduce((s, t) => s + t.stake, 0),
    funSum: funT.reduce((s, t) => s + t.stake, 0),
    noPlay,
    notes,
    benched,
  };
}
