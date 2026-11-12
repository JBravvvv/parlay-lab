import { CFB_REDIS } from "@/lib/cfb/rules";
import { EPOCH_ARCHIVE_KEY } from "@/lib/ledger-epoch";
import { NFL_REDIS } from "@/lib/nfl/rules";
import type { HistoryDesk, HistorySource } from "@/lib/az/history";
import { redis } from "@/lib/server/store";

/**
 * THE OLDER LEDGERS, READ ONLY.
 *
 * Four GETs and nothing else: this file has no SET, DEL or any other write, so reading the history
 * can never change it. A blob that is absent is reported `missing`; one that is present but cannot
 * be parsed is reported `unreadable` rather than treated as empty — an unreadable ledger is a fault
 * to show, not a zero to add up.
 */

export const HISTORY_KEYS: Record<HistoryDesk, string> = {
  mlb: "pl:ledger:v1",
  cfb: CFB_REDIS.ledger,
  nfl: NFL_REDIS.ledger,
  "mlb-era1": EPOCH_ARCHIVE_KEY,
};

export type HistoryGet = (key: string) => Promise<unknown>;
export type HistoryReader = () => Promise<HistorySource[]>;

export function sourceOf(desk: HistoryDesk, raw: unknown): HistorySource {
  if (raw == null || raw === "") return { desk, entries: [], missing: true };
  try {
    const v: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ledger = Array.isArray(v) ? v : (v as { ledger?: unknown } | null)?.ledger;
    return Array.isArray(ledger) ? { desk, entries: ledger } : { desk, entries: [], unreadable: true };
  } catch {
    return { desk, entries: [], unreadable: true };
  }
}

export function historyReader(get: HistoryGet = (key) => redis(["GET", key])): HistoryReader {
  return async () => {
    const desks = Object.keys(HISTORY_KEYS) as HistoryDesk[];
    const raws = await Promise.all(desks.map((d) => get(HISTORY_KEYS[d])));
    return desks.map((d, i) => sourceOf(d, raws[i]));
  };
}
