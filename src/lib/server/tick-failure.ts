/**
 * WHAT THE SCHEDULER ANSWERS WHEN ITS MLB TICK THROWS (AUDIT E1-1).
 *
 * The tick reads the store before any of its own try blocks. With the store down (the 2026-10-18
 * outage answered 403 to every call) the throw escaped the route, the platform rendered a bodyless
 * 500, and the poke said nothing about why: no reason for the cron provider's failure mail, no
 * football result, no alert retry. Forty-eight pokes a day, all silent.
 *
 * This turns the throw into an answer: a JSON body naming the reason, a 5xx status so the cron
 * provider still counts the run as failed, and one fixed log token to search for. It is pure; the
 * route decides nothing else from it and the rest of the poke carries on.
 */

/** the log line starts with this, so one search finds every failed tick */
export const TICK_ALERT_TOKEN = "[ALERT] scheduler mlb tick failed";

export type TickFailureKind = "store-unreachable" | "ledger-unreadable" | "mlb-tick-failed";

export type TickFailure = {
  status: 500 | 503;
  body: { ok: false; error: TickFailureKind; detail: string };
};

const DETAIL_MAX = 240;

/** the store client's own failures: no env, an HTTP status, or an error string the store sent back */
const STORE_FAILURE = /^(no store\b|store \d{3}\b|(ERR|WRONGPASS|NOPERM|NOAUTH|READONLY)\b)/;

/** the message, with every given secret removed and the length capped */
export function tickDetailOf(e: unknown, secrets: (string | undefined | null)[] = []): string {
  let msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg) msg = "unknown error";
  for (const s of secrets) {
    if (typeof s === "string" && s.length >= 4) msg = msg.split(s).join("[redacted]");
  }
  return msg.slice(0, DETAIL_MAX);
}

export function tickFailureKindOf(e: unknown): TickFailureKind {
  if (e instanceof Error && e.name === "LedgerUnreadable") return "ledger-unreadable";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return STORE_FAILURE.test(msg) ? "store-unreachable" : "mlb-tick-failed";
}

/** a store or ledger fault is a dependency being down (503); anything else is this route's own fault (500) */
export function tickFailureOf(e: unknown, secrets: (string | undefined | null)[] = []): TickFailure {
  const error = tickFailureKindOf(e);
  return { status: error === "mlb-tick-failed" ? 500 : 503, body: { ok: false, error, detail: tickDetailOf(e, secrets) } };
}
