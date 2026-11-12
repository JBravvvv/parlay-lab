import type { AzBook } from "@/lib/az/books";
import type { GradeRecord, GradeResult, PickRecord } from "@/lib/anytime/types";

/**
 * GRADING (pure). A pick is settled from the final score and nothing else, by the rules of the
 * book it was taken at.
 *
 * HOUSE RULES, PER BOOK. Where DraftKings and FanDuel settle a case differently the table below is
 * where that difference lives, keyed by book, so a pick is always settled by ITS book's rule.
 *
 * For full-game football sides and totals the table settles both books the same way on the cases
 * a final score decides (overtime counts; a spread or total landing exactly on the number is a
 * push; a tied two-way moneyline is refunded). That is the general industry convention; it has not
 * been read off each book's rule page either, hence `verified: false`.
 *
 * Where they DIFFER is a postponed or abandoned game:
 *   DraftKings  the game must be completed within 48 hours of its scheduled start, else void.
 *   FanDuel     the game must be played within the same scheduling week (for the NFL, Thursday
 *               through the following Wednesday), else void.
 * SOURCE AND LIMIT: both windows are as reported in 2023 press coverage of the two books' rules
 * (IBJ, Action Network), not read from the books' current published house rules, and the FanDuel
 * wording was reported for the NFL; it is applied to college football here as the nearest stated
 * rule. `verified: false` marks every row that still needs checking against the live rule page.
 * The effect of being wrong is small and one-directional: it only changes whether a pick on a
 * game that was postponed and then replayed late is graded or voided.
 */

export type VoidWindow =
  /** Void unless played within this long of the scheduled start. */
  | { kind: "hours"; ms: number }
  /** Void unless played before the next Thursday 00:00 US Eastern after the scheduled start. */
  | { kind: "schedule-week" };

export type HouseRule = {
  /** Overtime counts toward full-game sides and totals. */
  overtimeCounts: boolean;
  /** A tie on a two-way moneyline: "push" (stake refunded) or "lost". */
  mlTie: "push" | "lost";
  /** How long a postponed game may be replayed and still count. */
  voidWindow: VoidWindow;
  /** False until the row has been checked against the book's own current rule page. */
  verified: boolean;
};

const DK_FOOTBALL: HouseRule = { overtimeCounts: true, mlTie: "push", voidWindow: { kind: "hours", ms: 48 * 3600_000 }, verified: false };
const FD_FOOTBALL: HouseRule = { overtimeCounts: true, mlTie: "push", voidWindow: { kind: "schedule-week" }, verified: false };

/* COLLEGE BASKETBALL (2026-11-12). Overtime counts toward full-game sides and totals; a game cannot
   end level, so `mlTie` never applies. The postponement window is an ASSUMPTION, not a rule that was
   read: 24 hours from the scheduled tip at both books, written down so a moved game has a defined
   outcome, and marked unverified like the football rows until each book's own page is checked.
   Being wrong changes one thing only: whether a pick on a game replayed a day or more late is
   graded or voided. */
const BASKETBALL: HouseRule = { overtimeCounts: true, mlTie: "push", voidWindow: { kind: "hours", ms: 24 * 3600_000 }, verified: false };

export const HOUSE_RULES: Record<AzBook, Record<string, HouseRule>> = {
  draftkings: { nfl: DK_FOOTBALL, cfb: DK_FOOTBALL, ncaab: BASKETBALL },
  fanduel: { nfl: FD_FOOTBALL, cfb: FD_FOOTBALL, ncaab: BASKETBALL },
};

export function houseRuleOf(book: AzBook, sport: string): HouseRule | null {
  return HOUSE_RULES[book]?.[sport] ?? null;
}

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The latest moment a game scheduled at `startMs` may START and still count at this book. */
export function voidDeadline(rule: HouseRule, startMs: number): number {
  if (rule.voidWindow.kind === "hours") return startMs + rule.voidWindow.ms;
  const parts = Object.fromEntries(ET.formatToParts(new Date(startMs)).map((p) => [p.type, p.value]));
  const dow = DOW[parts.weekday as string] ?? 0;
  const intoDay = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  const daysAhead = (4 - dow + 7) % 7 || 7;
  return startMs - intoDay + daysAhead * 86_400_000;
}

export type FinalScore = {
  home: number;
  away: number;
  /** The feed says the game is over. */
  final: boolean;
  /** "final" | "postponed" | "live" | "upcoming" | ... as the feed words it. */
  status: string;
  /** The start time the feed shows NOW (ISO). Later than the pick's when the game was moved. */
  start?: string | null;
};

/** Settle one side from a final score. Full-game markets only; anything else is null (not gradable here). */
export function gradeSide(p: Pick<PickRecord, "market" | "side" | "line" | "book" | "sport">, s: { home: number; away: number }): GradeResult | null {
  const rule = houseRuleOf(p.book, p.sport);
  if (!rule) return null;
  if (!Number.isFinite(s.home) || !Number.isFinite(s.away)) return null;
  if (p.market === "ml") {
    if (p.side !== "home" && p.side !== "away") return null;
    if (s.home === s.away) return rule.mlTie;
    const homeWon = s.home > s.away;
    return (p.side === "home") === homeWon ? "won" : "lost";
  }
  if (p.market === "spread") {
    if (p.line == null || (p.side !== "home" && p.side !== "away")) return null;
    const diff = (p.side === "home" ? s.home - s.away : s.away - s.home) + p.line;
    return diff > 0 ? "won" : diff < 0 ? "lost" : "push";
  }
  if (p.market === "total") {
    if (p.line == null || (p.side !== "over" && p.side !== "under")) return null;
    const sum = s.home + s.away;
    if (sum === p.line) return "push";
    return (p.side === "over") === sum > p.line ? "won" : "lost";
  }
  return null;
}

/**
 * The grade for a pick given what the results feed says now, or null when it cannot be settled yet.
 * `score` is undefined when the feed has no row for the game.
 */
export function gradeOf(p: PickRecord, score: FinalScore | undefined, now: number, source: string): GradeRecord | null {
  const gradedAt = new Date(now).toISOString();
  const start = Date.parse(p.commence);
  const rule = houseRuleOf(p.book, p.sport);
  const deadline = rule && Number.isFinite(start) ? voidDeadline(rule, start) : null;
  if (score?.final) {
    /* a game moved past the book's window is void at that book even though it was eventually played */
    const played = score.start ? Date.parse(score.start) : Number.NaN;
    if (deadline != null && Number.isFinite(played) && played > deadline) {
      return { id: p.id, result: "void", reason: "postponed", detail: `played ${score.start}, past this book's window`, gradedAt, source };
    }
    const result = gradeSide(p, score);
    if (!result) return null;
    return { id: p.id, result, detail: `${score.away}-${score.home} (away-home)`, gradedAt, source };
  }
  /* "missing": the results provider searched the schedule and the game is no longer on it */
  const dead = score?.status === "postponed" || score?.status === "cancelled" || score?.status === "canceled" || score?.status === "missing";
  if (dead && deadline != null && now > deadline) {
    return { id: p.id, result: "void", reason: "postponed", detail: `feed status ${score!.status}`, gradedAt, source };
  }
  return null;
}
