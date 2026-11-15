"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { getSyncKey } from "@/lib/ledgerSync";
import type { LedgerRow } from "@/lib/anytime/ledger";
import { PairMark, TeamMark } from "@/components/cfb/TeamMark";
import { UNIT_TEXT, cardDays, engineCard, isCardPath, isCardSport, type CardPick, type CardSport, type EngineCard } from "@/lib/anytime/card";
import { fallbackAbbr, pickMark, type MarksById } from "@/lib/anytime/marks";
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

/** The logos for those game days, or null when they cannot be read (the cards then show letters, never a guess). No secret is sent. */
export async function loadMarks(sport: CardSport, days: string): Promise<MarksById | null> {
  try {
    const r = await fetch(`/api/anytime/marks?sport=${sport}&dates=${days}`);
    if (!r.ok) return null;
    const body = (await r.json().catch(() => null)) as { games?: MarksById } | null;
    return body && body.games && typeof body.games === "object" ? body.games : null;
  } catch {
    return null;
  }
}

const STATUS_CHIP: Record<CardPick["status"], string> = { open: "bg-pos/15 text-pos", won: "bg-pos/15 text-pos", lost: "bg-neg/15 text-neg", push: "bg-white/[0.06] text-faint", void: "bg-white/[0.06] text-faint" };
const STATUS_WORD: Record<CardPick["status"], string> = { open: "locked", won: "won", lost: "lost", push: "push", void: "void" };
const TONE = { pos: "text-pos", neg: "text-neg", muted: "text-muted" } as const;

/** the logo for one pick: the picked team for a side, both teams for a total; letters when no logo is in hand */
function Mark({ p, marks }: { p: CardPick; marks: MarksById | null }) {
  const m = pickMark(p, marks);
  if (m?.kind === "team") return <TeamMark team={m.team} size="lg" showAbbr={false} />;
  if (m?.kind === "pair") return <PairMark away={m.away} home={m.home} size="md" />;
  return (
    <span data-engine-mark="letters" aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-bold uppercase leading-none text-muted ring-1 ring-white/[0.08]">
      {fallbackAbbr(p)}
    </span>
  );
}

const CHIP = "inline-flex min-h-6 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-semibold leading-none text-muted tabular-nums";

/** ONE PICK, ONE CARD: its own bordered box, the mark on the left, the price on the right */
function PickCard({ p, now, marks }: { p: CardPick; now: number; marks: MarksById | null }) {
  const settled = p.status !== "open";
  return (
    <li className="rounded-[14px] border border-white/[0.09] bg-surface-2 p-3" data-engine-pick={p.status}>
      <div className="flex items-center gap-3">
        <span className="flex w-[52px] shrink-0 justify-center" data-engine-mark-slot>
          <Mark p={p} marks={marks} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight text-text tabular-nums">{p.selection}</div>
          <div className="mt-1 text-[11.5px] font-semibold leading-snug text-muted">{p.event}</div>
          <div className="text-[11.5px] leading-snug text-faint tabular-nums">{p.kickoff} PT</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[18px] font-black leading-none text-pos tabular-nums">{p.price}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">{p.bookName}</div>
        </div>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3 rounded-[10px] bg-white/[0.04] px-3 py-2" data-engine-bet>
        <div className="text-[13px] font-semibold text-muted">
          Bet <span className="text-[17px] font-black text-text tabular-nums">{p.bet}</span>
        </div>
        <div className="text-[12.5px] font-semibold text-muted tabular-nums">
          to win <span className="font-bold text-text">{p.toWin}</span>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-[10.5px] font-black uppercase leading-none tracking-wide ${STATUS_CHIP[p.status]}`}>{STATUS_WORD[p.status]}</span>
        {settled && p.result && <span className={`${CHIP} ${TONE[p.profitTone]}`}>{p.result}</span>}
        <span className={CHIP}>EV {p.ev}</span>
        {p.stakeDollars === 0 && <span className={CHIP}>not staked: this game&apos;s limit was already used</span>}
        <span className={CHIP}>{p.other}</span>
        {p.reentry && <span className={CHIP}>{p.reentry}</span>}
        <span className="text-[11px] leading-none text-faint">locked {ago(p.ts, now)}</span>
      </div>
    </li>
  );
}

const LIST = "grid gap-2 md:grid-cols-2";

export function EnginePicksView({ sport, load, now, marks = null, onRefresh }: { sport: CardSport; load: Load; now: number; marks?: MarksById | null; onRefresh?: () => void }) {
  const name = SPORT_META[sport].short;
  const card: EngineCard | null = load.kind === "ready" ? engineCard(load.rows, sport, now) : null;
  const title = card ? `Locked picks · ${name} · ${card.open} open · ${card.atRiskText} staked` : `Locked picks · ${name}`;
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
              <section key={d.date} className="mb-3 last:mb-0" data-engine-day={d.date}>
                <h3 className="px-1 pb-1.5 text-[11px] font-black uppercase tracking-wide text-muted">
                  {d.label} · {d.picks.length}
                </h3>
                <ul className={LIST}>
                  {d.picks.map((p) => (
                    <PickCard key={p.id} p={p} now={now} marks={marks} />
                  ))}
                </ul>
              </section>
            ))}
            {card.settled.length > 0 && (
              <details className="mt-2" data-engine-settled>
                <summary className="cursor-pointer px-1 text-[11px] font-black uppercase tracking-wide text-muted">Graded · {card.settledTotal}</summary>
                <ul className={`mt-1.5 ${LIST}`}>
                  {card.settled.map((p) => (
                    <PickCard key={p.id} p={p} now={now} marks={marks} />
                  ))}
                </ul>
                {card.settledTotal > card.settled.length && <p className="px-1 pt-1 text-[11px] text-faint">Showing the latest {card.settled.length}. Every pick is on the Any-time page.</p>}
              </details>
            )}
            <p className="mt-2 px-1 text-[11px] leading-snug text-faint">
              A locked pick is never removed or changed; new ones are added as they qualify. Paper dollars: {UNIT_TEXT}.
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
  /* the team logos for the game days on show: one free request (ESPN's scoreboard through this app), re-asked only when the days change */
  const days = load.kind === "ready" ? cardDays(engineCard(load.rows, sport, now)).join(",") : "";
  const [marks, setMarks] = useState<MarksById | null>(null);
  useEffect(() => {
    if (!days) return;
    let live = true;
    void loadMarks(sport, days).then((m) => {
      if (live && m) setMarks(m);
    });
    return () => {
      live = false;
    };
  }, [sport, days]);
  return <EnginePicksView sport={sport} load={load} now={now} marks={marks} onRefresh={() => void read()} />;
}

/** Mounted once above every page: shows the block on a card page (Builder, Ledger) of a live desk, nothing anywhere else. */
export function EngineCardSlot() {
  const sport = useSport();
  const pathname = usePathname();
  if (!isCardPath(pathname) || !isCardSport(sport) || isArchived(sport)) return null;
  return <EnginePicks key={sport} sport={sport} />;
}
