/** Game start windows use Pacific wall time, matching the board's date. */
export type GameTimeWindow = readonly [number, number];
export function gameHour(start?: string | null): number | null {
  if (!start || !Number.isFinite(Date.parse(start))) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(start));
  return Number(parts.find(p => p.type === "hour")?.value) + Number(parts.find(p => p.type === "minute")?.value) / 60;
}
export function inGameTimeWindow(start: string | null | undefined, window?: GameTimeWindow): boolean {
  if (!window || (window[0] === 0 && window[1] === 24)) return true;
  const hour = gameHour(start);
  return hour !== null && hour >= window[0] && hour <= window[1];
}
export function hourLabel(hour: number): string {
  return hour === 24 ? "11:59pm" : `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
}
export function gameTimeLabel(start?: string | null): string {
  if (!start || !Number.isFinite(Date.parse(start))) return "Start time unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(new Date(start)) + " PT";
}
