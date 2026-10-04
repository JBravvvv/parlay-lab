export type RelevantSport = "nfl" | "cfb" | "mlb";
export type SportSchedule = { nfl: number | null; cfb: number | null; mlb: number | null; mlbPlayoffs: number | null };
export function pacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function weekdayFor(date: string) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
/** Explicit weekend defaults; NFL prime-time and baseball's daily/postseason schedule decide weekdays. */
export function relevantSport(date: string, games?: SportSchedule): RelevantSport {
  const day = weekdayFor(date);
  if (day === 0) return "nfl";
  if (day === 6) return "cfb";
  if (!games) return day === 1 || day === 4 ? "nfl" : day === 5 ? "cfb" : "mlb";
  if ((day === 1 || day === 4) && (games.nfl === null || games.nfl > 0)) return "nfl";
  if ((games.mlbPlayoffs ?? 0) > 0) return "mlb";
  if ((games.nfl ?? 0) > 0) return "nfl";
  if (day === 5 && (games.cfb ?? 0) > 0) return "cfb";
  if ((games.mlb ?? 0) > 0) return "mlb";
  if ((games.cfb ?? 0) > 0) return "cfb";
  return relevantSport(date);
}
