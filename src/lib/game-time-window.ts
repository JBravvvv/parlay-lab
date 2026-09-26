/** Game start windows use Pacific wall time, matching the board's date. */
export type GameTimeWindow = readonly [number, number];

/** The "every start" sentinel: no time filter at all (the default everywhere). */
export const ALL_DAY: GameTimeWindow = [0, 24];
/** 2026-09-26, Josh: "the game start slider should start at 9am" unless the slate carries an earlier game
 *  (a London NFL kick, an international CFB or MLB game) — then it opens at that game, floored to the half hour. */
export const SLATE_OPEN_HOUR = 9;
/** 2026-09-26, Josh: "Should go in 30 minute increments". */
export const TIME_STEP = 0.5;
export const DEFAULT_TIME_BOUNDS: GameTimeWindow = [SLATE_OPEN_HOUR, 24];

export const isAllDay = (window?: GameTimeWindow | null): boolean => !window || (window[0] <= 0 && window[1] >= 24);

/* PERF (2026-09-26, Josh: "Parlay Builder is moving EXTREMELY SLOW", "Game start slider ... not responding for
   5-10 seconds"). Building an Intl.DateTimeFormat costs ~0.1ms; `gameHour` built one per call, and the generator's
   32-run strategy search filters the whole pool through it on every render once the window is narrowed — 15s of
   main thread per slider tick on a 4,000-leg pool (measured on production: 45-99s per tick at 4x CPU). One
   formatter per module, and each distinct start string is converted once. */
let hourFmt: Intl.DateTimeFormat | null = null;
let labelFmt: Intl.DateTimeFormat | null = null;
const HOUR_CACHE_MAX = 4096;
const hourCache = new Map<string, number | null>();

export function gameHour(start?: string | null): number | null {
  if (!start) return null;
  const hit = hourCache.get(start);
  if (hit !== undefined) return hit;
  const ms = Date.parse(start);
  let hour: number | null = null;
  if (Number.isFinite(ms)) {
    hourFmt ??= new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const parts = hourFmt.formatToParts(ms);
    hour = Number(parts.find((p) => p.type === "hour")?.value) + Number(parts.find((p) => p.type === "minute")?.value) / 60;
  }
  if (hourCache.size >= HOUR_CACHE_MAX) hourCache.clear();
  hourCache.set(start, hour);
  return hour;
}

export function inGameTimeWindow(start: string | null | undefined, window?: GameTimeWindow): boolean {
  if (isAllDay(window)) return true;
  const hour = gameHour(start);
  return hour !== null && hour >= window![0] && hour <= window![1];
}

/** "9am", "9:30am", "12pm"; 24 reads "11:59pm" (the end of the board's day). */
export function hourLabel(hour: number): string {
  if (hour >= 24) return "11:59pm";
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** The slider's track for a slate: 9am PT to 11:59pm, opening earlier only when a real game starts before 9. */
export function slateTimeBounds(starts: Iterable<string | null | undefined>): GameTimeWindow {
  let lo = SLATE_OPEN_HOUR;
  for (const s of starts) {
    const h = gameHour(s);
    if (h !== null && h < lo) lo = Math.floor(h / TIME_STEP) * TIME_STEP;
  }
  return lo === SLATE_OPEN_HOUR ? DEFAULT_TIME_BOUNDS : [lo, 24];
}

export function gameTimeLabel(start?: string | null): string {
  if (!start || !Number.isFinite(Date.parse(start))) return "Start time unavailable";
  labelFmt ??= new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
  return labelFmt.format(new Date(start)) + " PT";
}
