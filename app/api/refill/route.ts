import { NextRequest, NextResponse } from "next/server";
import { storeEnv, syncAuthed } from "@/lib/server/store";
import { ptToday } from "@/lib/server/pt-date";
import { decideMlbRefill, forwardMlbRefill, readMlbDay } from "@/lib/server/refill";

/**
 * THE MANUAL REFILL (INSTRUCTION 49, 2026-09-09), Josh verbatim: "It shouldn't be refreshing every
 * 15 minutes. It should be 8am, 9:30am, 12pm, 3pm & 4:45pm. Other than that I can manually do it
 * and it can function the same way whether I manually refresh it or it refreshes itself
 * automatically".
 *
 *   POST /api/refill?desk=mlb|cfb|nfl      header x-pl-sync: <phrase>
 *
 * Josh's Refresh pill calls this with his sync phrase; it runs the IDENTICAL server pass the
 * scheduler runs on a slot tick, with slot "manual":
 *   - mlb: the free decision (readMlbDay + decideMlbRefill) first, then — only when it fires — the
 *     forward to /api/generate?topup=1&slot=manual with the cron key.
 *   - cfb/nfl: the league's own lock route with ?date=<today>&manual=1 (the already-locked branch
 *     runs topUpDate with slot "manual"; ?date suppresses sweep/settle, as on any hand poke).
 *
 * COST, STATED HONESTLY: a refill refused BEFORE the pull (not a slot, same slot, cap, manual
 * headroom, pending block, fully deployed, slot-fit, no lock) costs zero; an attempt that prices a
 * board and seats nothing still costs that board — 6 credits on football, 114-150 on MLB — and,
 * with the cooldowns unwired, may recur on the next slot. The cron secret travels
 * only in the server-side x-cron-key header — never in a URL query, never in a response body.
 * POST only: a click spends credits, so it is never a GET. Fails closed: 503 when CRON_SECRET or
 * the store is unset.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DESKS = ["mlb", "cfb", "nfl"] as const;
type Desk = (typeof DESKS)[number];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !storeEnv()) return NextResponse.json({ ok: false, error: "refill unavailable" }, { status: 503 });
  if (!syncAuthed(req)) return NextResponse.json({ ok: false, error: "sync phrase required" }, { status: 401 });

  const asked = req.nextUrl.searchParams.get("desk");
  if (!asked || !(DESKS as readonly string[]).includes(asked)) {
    return NextResponse.json({ ok: false, error: "desk must be mlb|cfb|nfl" }, { status: 400 });
  }
  const desk = asked as Desk;
  const now = Date.now();
  const at = new Date(now).toISOString();
  const base = { ok: true as const, desk, trigger: "manual" as const, slot: "manual" as const, at };

  /* NEVER RETHROW FROM A SPENDING ROUTE (fix round, 2026-09-09): a forward that rejects (network,
     an abort past the target's budget) used to escape POST as Next's HTML 500, which the pill
     could not read. Every failure is a 502 JSON with the message; the secret is never in it. */
  try {
    if (desk === "mlb") {
      const day = await readMlbDay(ptToday());
      const d = decideMlbRefill({ ...day, now, slot: "manual" });
      if (!d.fire) return NextResponse.json({ ...base, fired: false, topup: d });
      const g = await forwardMlbRefill({ origin: req.nextUrl.origin, secret, slot: "manual" });
      return NextResponse.json({ ...base, fired: true, topup: d, ...g });
    }

    const r = await fetch(new URL(`/api/${desk}/lock?date=${ptToday()}&manual=1`, req.nextUrl.origin), {
      headers: { "x-cron-key": secret },
      cache: "no-store",
    });
    const result = await r.json().catch(() => null);
    return NextResponse.json({ ...base, status: r.status, result });
  } catch (e) {
    const msg = String((e as Error).message ?? e).split(secret).join("[secret]");
    console.warn(`[refill] ${desk} forward failed: ${msg}`);
    return NextResponse.json({ ...base, ok: false, error: msg }, { status: 502 });
  }
}
