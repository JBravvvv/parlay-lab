import { buildCfbCard } from "@/lib/cfb/card";
import { planFound } from "@/lib/cfb/found";
import type { CfbBoard, CfbCard } from "@/lib/cfb/types";
import type { LeagueConfig } from "@/lib/football/league";
import { isFoundDay } from "@/lib/found-mode";

/** Read-only preview: use the same candidate gates and sizing as the server's first pass.
 * Historical dates retain their original allocator. Nothing here writes or locks a ticket. */
export function previewFootballCard(cfg: LeagueConfig, board: CfbBoard, bankroll: number, now: number): CfbCard {
  if (!isFoundDay(board.date)) return buildCfbCard(board, {
    bankroll, daily: cfg.paper.daily, fun: cfg.paper.fun, now, rules: cfg.rules, idPrefix: cfg.idPrefix,
  });
  const plan = planFound(cfg, board, null, now);
  return {
    date: board.date, core: plan.tickets, funT: plan.fun,
    coreSum: plan.stake, funSum: plan.funStake,
    noPlay: plan.tickets.length === 0 && plan.fun.length === 0,
    notes: [`Preview only — $${plan.stake} qualifies now against the $${plan.ceiling} daily ceiling. The server locks qualifying bets throughout the slate day; prices and eligibility can change. Unused allowance stays available, and only that day's realized winnings increase its ceiling.`],
    benched: [],
  };
}
