import { teamLogo } from "@/lib/mlb-visuals";

/** ESPN's logo codes differ from statsapi abbreviations on a few clubs. */
const LOGO_CODE: Record<string, string> = { ath: "oak", cws: "chw", az: "ari", was: "wsh" };

export const logoFor = (abbr: string) => {
  const a = abbr.toLowerCase();
  return teamLogo(LOGO_CODE[a] ?? a);
};

export const PT = "America/Los_Angeles";

export function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
}

/** "7:10 PM PDT" */
export function startLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: PT }).format(new Date(iso));
}

/** "Wed, Sep 2" */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const dash = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : String(v));
