/**
 * INSTRUCTION 49 (2026-09-09) — the app's manual refill. Josh: "Other than that I can manually
 * do it and it can function the same way whether I manually refresh it or it refreshes itself
 * automatically." The desk's Refresh pill POSTs /api/refill, which runs the SAME server pass the
 * five refill slots run (slot "manual"). It spends credits, so it sits behind the sync phrase;
 * without one stored the pill falls back to its pre-49 behaviour and never reaches this file.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSyncKey, syncNow } from "@/lib/ledgerSync";

export type RefillDesk = "mlb" | "cfb" | "nfl";

export async function refillDesk(desk: RefillDesk): Promise<{ status: number; body: Record<string, unknown> }> {
  const key = getSyncKey();
  if (!key) throw new Error("sync phrase required");
  const r = await fetch(`/api/refill?desk=${desk}`, { method: "POST", headers: { "x-pl-sync": key }, cache: "no-store" });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, body: body && typeof body === "object" ? body : {} };
}

function reasonOf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const r = (v as { reason?: unknown }).reason;
  return typeof r === "string" && r ? r : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** the one-line note under the pill — EVERY click prints one line (fix round, 2026-09-09):
    MLB `topup.reason` (or the generate body's `skipped` / `error`); football `result.topUp.reason`,
    else the lock route's not-yet-locked shapes (`waiting — locks at …`, `locked <date> — n tickets`,
    `no-slate`, `odds-missing`, a `note`), else `result.error`; a bare error body prints its `error` */
export function refillReason(b: Record<string, unknown>): string | null {
  const mlb = reasonOf(b.topup);
  if (mlb) return mlb;
  const gen = b.generate;
  if (gen && typeof gen === "object") {
    const g = gen as { skipped?: unknown; error?: unknown; lock?: { tickets?: unknown } };
    if (str(g.skipped)) return `generate skipped: ${g.skipped as string}`;
    if (str(g.error)) return `generate error: ${g.error as string}`;
    if (g.lock && typeof g.lock === "object" && typeof g.lock.tickets === "number") return `refilled — the card now holds ${g.lock.tickets} ticket${g.lock.tickets === 1 ? "" : "s"}`;
  }
  const result = b.result;
  if (result && typeof result === "object") {
    const r = result as { topUp?: unknown; status?: unknown; note?: unknown; locksAt?: unknown; date?: unknown; tickets?: unknown; error?: unknown; firstKickoff?: unknown };
    const fb = reasonOf(r.topUp);
    if (fb) return fb;
    const status = str(r.status);
    if (status === "waiting") return `waiting — locks at ${str(r.locksAt) ?? str(r.firstKickoff) ?? "the 60-min lead"}${str(r.note) ? ` (${r.note as string})` : ""}`;
    if (status === "locked") return `locked ${str(r.date) ?? "today"}${typeof r.tickets === "number" ? ` — ${r.tickets} ticket${r.tickets === 1 ? "" : "s"}` : ""}`;
    if (str(r.note)) return r.note as string;
    if (status) return status;
    if (str(r.error)) return r.error as string;
  }
  return str(b.error);
}

/**
 * The mutation the Board page's Refresh pill runs. Whatever the server answers (seated, capped,
 * refused free) the board and the ledger are re-read so the card shows what the server now holds.
 */
export function useRefillDesk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (desk: RefillDesk) => refillDesk(desk),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["board"] });
      void syncNow();
    },
  });
}
