"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { getSyncKey } from "@/lib/ledgerSync";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { engineCard, isCardPath, isCardSport, type CardPick, type CardSport, type EngineCard } from "@/lib/anytime/card";
import { ago } from "@/lib/anytime/view";
import { SPORT_META, isArchived, useSport } from "@/lib/sport";

/**
 * LOCKED PICKS ON THE CARD (2026-11-15, Josh: "Nothing is locking on the card. Picks should lock at any
 * point in time ... add new bets 24/7 while never removing locked bets").
 *
 * The any-time engine records every new pick; this block puts those picks on the two card pages
 * (Builder and Ledger) of the desk they belong to. Read-only: it shows the engine's own append-only
 * ledger and writes nothing. It reads when the page opens, when the app comes back to the front and
 * on a tap; there is no timer (the read loads the whole ledger from the store).
 *
 * It is never blank without a reason: no sync phrase, a refused phrase, a failed read and "nothing
 * locked yet" each say so in words.
 */

export const ENGINE_PICKS_URL = "/api/anytime?limit=2000";

type Load = { kind: "loading" } | { kind: "no-key" } | { kind: "bad-key" } | { kind: "error"; why: string } | { kind: "ready"; rows: LedgerRow[]; count: number; lastRun: string | null; at: number };

export async function loadEnginePicks(now: () => number = Date.now): Promise<Load> {
  const key = getSyncKey();
  if (!key) return { kind: "no-key" };
  try {
    const r = await fetch(ENGINE_PICKS_URL, { headers: { "x-pl-sync": key }, cache: "no-store" });
    if (r.status === 401) return { kind: "bad-key" };
    const body = (await r.json().catch(() => null)) as { rows?: LedgerRow[]; count?: number; health?: { last?: { finishedAt?: string } | null }; error?: string } | null;
    if (!r.ok || !body || !Array.isArray(body.rows)) return { kind: "error", why: body?.error ?? `the server answered ${r.status}` };
    return { kind: "ready", rows: body.rows, count: typeof body.count === "number" ? body.count : body.rows.length, lastRun: body.health?.last?.finishedAt ?? null, at: now() };
  } catch {
    return { kind: "error", why: "the request did not get through" };
  }
}

const STATUS_TONE: Record<CardPick["status"], string> = { open: "text-pos", won: "text-pos", lost: "text-neg", push: "text-faint", void: "text-faint" };
const STATUS_WORD: Record<CardPick["status"], string> = { open: "locked", won: "won", lost: "lost", push: "push", void: "void" };
const TONE = { pos: "text-pos", neg: "text-neg", muted: "text-muted" } as const;

function Row({ p, now }: { p: CardPick; now: number }) {
  return (
    <li className="border-b border-white/[0.06] px-1 py-2 last:border-b-0" data-engine-pick={p.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-snug text-text tabular-nums">
            {p.selection} <span className="text-pos">{p.taken}</span>
          </div>
          <div className="mt-0.5 text-[11px] font-semibold leading-snug text-muted tabular-nums">
            {p.event} · {p.kickoff} PT · {p.other}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-faint tabular-nums">
            EV {p.ev} · {p.stake} · locked {ago(p.ts, now)}
            {p.reentry ? ` · ${p.reentry}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-[12px] font-black uppercase tracking-wide ${STATUS_TONE[p.status]}`}>{STATUS_WORD[p.status]}</div>
          {p.status !== "open" && <div className={`text-[13px] font-bold tabular-nums ${TONE[p.profitTone]}`}>{p.profit}</div>}
        </div>
      </div>
    </li>
  );
}

export function EnginePicksView({ sport, load, now, onRefresh }: { sport: CardSport; load: Load; now: number; onRefresh?: () => void }) {
  const name = SPORT_META[sport].short;
  const card: EngineCard | null = load.kind === "ready" ? engineCard(load.rows, sport, now) : null;
  const title = card ? `Locked picks · ${name} · ${card.open} open` : `Locked picks · ${name}`;
  return (
    <div className="mb-3" data-engine-picks={load.kind}>
      <Panel
        title={title}
        action={
          onRefresh ? (
            <button type="button" onClick={onRefresh} disabled={load.kind === "loading"} className="press min-h-9 rounded-[8px] border border-white/[0.1] bg-surface-2 px-3 text-[12px] font-bold text-text disabled:opacity-50">
              Refresh
            </button>
          ) : undefined
        }
      >
        {load.kind === "loading" && <p className="text-[12px] text-muted">Reading the locked picks…</p>}
        {load.kind === "no-key" && (
          <p className="text-[12px] leading-snug text-text">
            This device has no sync phrase, so it cannot read the locked picks. Add it in{" "}
            <Link href="/settings" replace className="font-bold underline">
              Settings
            </Link>{" "}
            and they show here.
          </p>
        )}
        {load.kind === "bad-key" && (
          <p className="text-[12px] leading-snug text-neg">
            The sync phrase on this device was refused, so the locked picks cannot be read. Re-enter it in{" "}
            <Link href="/settings" replace className="font-bold underline">
              Settings
            </Link>
            .
          </p>
        )}
        {load.kind === "error" && <p className="text-[12px] leading-snug text-neg">Couldn&apos;t read the locked picks ({load.why}). Nothing was changed. Tap Refresh to try again.</p>}
        {card && load.kind === "ready" && (
          <>
            {card.open === 0 && (
              <p className="text-[12px] leading-snug text-muted" data-engine-empty>
                No {name} pick is locked right now. The engine checks around the clock and locks a pick the moment a DraftKings or FanDuel price clears its bar.
              </p>
            )}
            {card.days.map((d) => (
              <section key={d.date} className="mb-2 last:mb-0" data-engine-day={d.date}>
                <h3 className="px-1 pb-0.5 text-[11px] font-black uppercase tracking-wide text-muted">
                  {d.label} · {d.picks.length}
                </h3>
                <ul>
                  {d.picks.map((p) => (
                    <Row key={p.id} p={p} now={now} />
                  ))}
                </ul>
              </section>
            ))}
            {card.settled.length > 0 && (
              <details className="mt-2" data-engine-settled>
                <summary className="cursor-pointer px-1 text-[11px] font-black uppercase tracking-wide text-muted">Graded · {card.settledTotal}</summary>
                <ul>
                  {card.settled.map((p) => (
                    <Row key={p.id} p={p} now={now} />
                  ))}
                </ul>
                {card.settledTotal > card.settled.length && <p className="px-1 pt-1 text-[11px] text-faint">Showing the latest {card.settled.length}. Every pick is on the Any-time page.</p>}
              </details>
            )}
            <p className="mt-2 px-1 text-[11px] leading-snug text-faint">
              A locked pick is never removed or changed; new ones are added as they qualify.
              {load.lastRun ? ` Engine last ran ${ago(load.lastRun, now)}.` : ""}
              {load.count > load.rows.length ? ` Showing the newest ${load.rows.length} of ${load.count} picks across all desks.` : ""}{" "}
              <Link href="/anytime" replace className="font-bold underline">
                Full record
              </Link>
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}

/** The block for one desk: reads on mount, when the app returns to the front, and on a tap. */
export function EnginePicks({ sport }: { sport: CardSport }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const read = useCallback(async () => {
    setLoad((l) => (l.kind === "ready" ? l : { kind: "loading" }));
    const next = await loadEnginePicks();
    setNow(Date.now());
    setLoad(next);
  }, []);
  useEffect(() => {
    void read();
    const onShow = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [read]);
  return <EnginePicksView sport={sport} load={load} now={now} onRefresh={() => void read()} />;
}

/** Mounted once above every page: shows the block on a card page (Builder, Ledger) of a live desk, nothing anywhere else. */
export function EngineCardSlot() {
  const sport = useSport();
  const pathname = usePathname();
  if (!isCardPath(pathname) || !isCardSport(sport) || isArchived(sport)) return null;
  return <EnginePicks key={sport} sport={sport} />;
}
