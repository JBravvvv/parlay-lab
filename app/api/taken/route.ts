import { NextRequest, NextResponse } from "next/server";
import { redis, syncAuthed } from "@/lib/server/store";
import { ALERT_SPORTS, LEDGER_KEYS, sortTaken, takenRowsOf, type AlertEntry, type TakenRow } from "@/lib/bet-alert";
import { readAlertRecords } from "@/lib/server/push";

/**
 * THE TAKEN FEED (2026-10-09): every locked bet on every desk, newest first, read from the lock records
 * themselves (not the alert log), so a bet whose alert failed is still listed. Paged by time:
 * `?before=<ms>&limit=<n>` returns the next older page and `next` is the cursor for the one after.
 * Behind the sync phrase, like the Ledger.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 40));
  const beforeAt = sp.get("before") != null ? Number(sp.get("before")) : Infinity;
  const beforeKey = sp.get("beforeKey") ?? "";
  const now = Date.now();
  const raws = (await redis(["MGET", ...ALERT_SPORTS.map((s) => LEDGER_KEYS[s])])) as Array<string | null>;
  let rows: TakenRow[] = [];
  ALERT_SPORTS.forEach((sport, i) => {
    try {
      const ledger = raws?.[i] ? ((JSON.parse(raws[i] as string) as { ledger?: AlertEntry[] }).ledger ?? []) : [];
      rows.push(...takenRowsOf(sport, ledger, now));
    } catch {
      /* an unreadable desk contributes nothing rather than failing the feed */
    }
  });
  rows = sortTaken(rows);
  const total = rows.length;
  /* the cursor is (at, key) in the same order sortTaken uses, so a page boundary inside one pass's
     same-instant bets neither repeats nor skips one */
  const start = Number.isFinite(beforeAt)
    ? rows.findIndex((r) => r.at < beforeAt || (r.at === beforeAt && r.key > beforeKey))
    : 0;
  const page = start < 0 ? [] : rows.slice(start, start + limit);
  const recs = await readAlertRecords(page.map((r) => r.key)).catch(() => ({}) as Record<string, never>);
  const last = page[page.length - 1];
  const more = start >= 0 && start + limit < total;
  return NextResponse.json({
    now,
    total,
    rows: page.map((r) => ({ ...r, alert: recs[r.key]?.status ?? null })),
    next: more && last ? { before: last.at, beforeKey: last.key } : null,
  });
}
