/**
 * BET ALERTS + THE TAKEN FEED (2026-10-09). Josh, verbatim:
 *   "I want the app to send me a push notification every time it adds a new + EV bet to the card; so right when it
 *    finds a bet, adds it & locks it; it sends me a notification like
 *      Parlay Lab: NFL
 *      Justin Jefferson Anytime TD +105 ($730)"
 *   "Should also have a notification page/tab/scroll I can check that only has bets locked/taken listed in order top
 *    to bottom from most recent timing wise ... to oldest"
 *
 * One wording for both: the push body and the feed row are the SAME string, built here from the locked ticket
 * itself. Pure — no store, no network — so the server (push) and the page (feed) share it byte for byte.
 *
 * No "LIVE" word and no parlay format in the alert (agreed 2026-10-09): every card bet since 2026-10-06 is a
 * pregame straight. Multi-leg tickets locked on earlier days still appear in the feed as "N-leg: A / B / C".
 */

export type AlertSport = "mlb" | "cfb" | "nfl";
export const ALERT_SPORTS: readonly AlertSport[] = ["mlb", "nfl", "cfb"];
export const SPORT_WORD: Record<AlertSport, string> = { mlb: "MLB", nfl: "NFL", cfb: "CFB" };
/** the Redis key each desk's locked ledger lives under (lock-card.ts LEDGER_STORE_KEY, cfb/rules.ts CFB_REDIS, nfl lock route) */
export const LEDGER_KEYS: Record<AlertSport, string> = { mlb: "pl:ledger:v1", cfb: "pl:cfb:ledger:v1", nfl: "pl:nfl:ledger:v1" };

export type AlertLeg = { label?: string | null; prop?: string | null; cz?: number | null; gkey?: string | null };
export type AlertTicket = {
  id?: string;
  stake?: number;
  czDec?: number | null;
  czOdds?: number | null;
  legs?: AlertLeg[];
  found?: boolean;
  foundAt?: number;
  [k: string]: unknown;
};
export type AlertEntry = {
  date: string;
  locked?: boolean;
  lockedAt?: number;
  core?: AlertTicket[];
  funT?: AlertTicket[];
  grading?: { tickets?: Record<string, { result?: string; payout?: number } | undefined> } | null;
  games?: Record<string, { start?: string | null } | undefined>;
  [k: string]: unknown;
};

/** "+110" / "-125" — American odds the way a book prints them */
export function fmtAmerican(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : String(r);
}

/** decimal → American, the board's own convention (≥2.0 → +, else −) */
export function decToAmerican(dec: number): number {
  return dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1);
}

/** "Hits O 0.5" → "Hits over .5" · "Pitcher K's U 5.5" → "Pitcher K's under 5.5" (Josh's own phrasing) */
function sayProp(prop: string): string {
  return prop
    .replace(/(^|\s)O (\d)/g, "$1over $2")
    .replace(/(^|\s)U (\d)/g, "$1under $2")
    .replace(/(over|under) 0\.5\b/g, "$1 .5");
}

/** one leg in words, no price: "Enrique Hernandez Hits over .5" · "Miami Marlins ML vs Cleveland Guardians" ·
 *  football "Justin Jefferson Anytime TD" / "Justin Jefferson Rec Yds over 74.5" / "Indiana -3.5" */
export function legWords(leg: AlertLeg): string {
  const label = String(leg.label ?? "").replace(/\s*\([A-Z]{2,4}\)\s*$/, "").trim();
  const prop = String(leg.prop ?? "").trim();
  /* football rows carry the whole selection in the label ("Name O 74.5 Rec Yds"); say it the MLB way */
  const fb = /^(.+?) ([OU]) (\d+(?:\.\d+)?) (.+)$/.exec(label);
  if (fb) return `${fb[1]} ${fb[4]} ${fb[2] === "O" ? "over" : "under"} ${fb[3] === "0.5" ? ".5" : fb[3]}`;
  if (!prop || label.endsWith(prop) || /^(ML|Spread|Total)$/i.test(prop)) return label || prop;
  return `${label} ${sayProp(prop)}`.trim();
}

/** the ticket's price: a single leg's own book price, else the combined price */
export function ticketPrice(t: AlertTicket): number | null {
  const legs = t.legs ?? [];
  if (legs.length === 1 && Number.isFinite(legs[0].cz)) return Number(legs[0].cz);
  if (Number.isFinite(t.czOdds)) return Number(t.czOdds);
  if (Number.isFinite(t.czDec) && Number(t.czDec) > 1) return decToAmerican(Number(t.czDec));
  return null;
}

/** the selection text without price or stake */
export function ticketWords(t: AlertTicket): string {
  const legs = t.legs ?? [];
  if (legs.length <= 1) return legs[0] ? legWords(legs[0]) : String(t.name ?? t.id ?? "bet");
  return `${legs.length}-leg: ${legs.map(legWords).join(" / ")}`;
}

/** THE LINE: "Enrique Hernandez Hits over .5 +110 ($355)" — the push body and the feed row */
export function alertBody(t: AlertTicket): string {
  const p = ticketPrice(t);
  return `${ticketWords(t)}${p == null ? "" : ` ${fmtAmerican(p)}`} ($${Math.round(Number(t.stake) || 0)})`;
}

export function alertTitle(sport: AlertSport): string {
  return `Parlay Lab: ${SPORT_WORD[sport]}`;
}

/** stable per-ticket identity across desks and days (MLB ids repeat across dates) */
export function alertKey(sport: AlertSport, date: string, id: string): string {
  return `${sport}:${date}:${id}`;
}

export type TakenStatus = "pending" | "live" | "won" | "lost" | "push" | "void";

export type TakenRow = {
  key: string;
  sport: AlertSport;
  date: string;
  id: string;
  title: string;
  text: string;
  words: string;
  price: number | null;
  stake: number;
  at: number;
  status: TakenStatus;
  payout: number | null;
  fun: boolean;
};

function statusOf(e: AlertEntry, t: AlertTicket, now: number): { status: TakenStatus; payout: number | null } {
  const g = t.id ? e.grading?.tickets?.[String(t.id)] : undefined;
  const r = String(g?.result ?? "");
  if (r === "won" || r === "lost" || r === "push") return { status: r, payout: g?.payout ?? null };
  if (r === "void" || r === "ungradable" || r === "cancelled") return { status: "void", payout: g?.payout ?? null };
  const started = (t.legs ?? []).some((l) => {
    const s = l.gkey ? e.games?.[l.gkey]?.start : null;
    return !!s && Date.parse(s) <= now;
  });
  return { status: started ? "live" : "pending", payout: null };
}

/** every locked ticket of one desk's ledger as feed rows — the lock records themselves, never the push log */
export function takenRowsOf(sport: AlertSport, ledger: AlertEntry[], now: number): TakenRow[] {
  const out: TakenRow[] = [];
  for (const e of ledger ?? []) {
    if (!e || !e.locked || typeof e.date !== "string") continue;
    const groups: Array<[AlertTicket[] | undefined, boolean]> = [[e.core, false], [e.funT, true]];
    for (const [list, fun] of groups) {
      for (const t of list ?? []) {
        if (!t || !t.id || !(Number(t.stake) > 0)) continue;
        const at = Number.isFinite(t.foundAt) ? Number(t.foundAt) : Number(e.lockedAt);
        if (!Number.isFinite(at)) continue;
        const { status, payout } = statusOf(e, t, now);
        out.push({
          key: alertKey(sport, e.date, String(t.id)),
          sport,
          date: e.date,
          id: String(t.id),
          title: alertTitle(sport),
          text: alertBody(t),
          words: ticketWords(t),
          price: ticketPrice(t),
          stake: Math.round(Number(t.stake)),
          at,
          status,
          payout,
          fun,
        });
      }
    }
  }
  return out;
}

/** newest first; ties (one pass locks several bets at one instant) keep a fixed order */
export function sortTaken(rows: TakenRow[]): TakenRow[] {
  return [...rows].sort((a, b) => b.at - a.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** "30s ago" · "5m ago" · "2h ago" · "3d ago" · past a week, the date ("Sep 28") */
export function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d <= 7) return `${d}d ago`;
  const dt = new Date(at);
  const md = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  const yNow = new Date(now).getUTCFullYear();
  return dt.getUTCFullYear() === yNow ? md : `${md}, ${dt.getUTCFullYear()}`;
}
