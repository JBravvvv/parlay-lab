import type { LeagueRules } from "./league";

export function isSundayPaper(rules: LeagueRules, date: string): boolean {
  return !!rules.sundayPaperSince && date >= rules.sundayPaperSince && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
}

export function isFullPaper(rules: LeagueRules, date: string): boolean {
  return (!!rules.fullPaperSince && date >= rules.fullPaperSince) || isSundayPaper(rules, date);
}
