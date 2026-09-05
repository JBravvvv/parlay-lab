"use client";

import { useMemo } from "react";
import { PairMark, TeamMark } from "@/components/cfb/TeamMark";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { WonPaid } from "@/components/ui/WonPaid";
import type { CfbBoard, CfbGame, CfbGrade, CfbLedgerEntry, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";
import { fmtAmerican } from "@/lib/format";
import { gradeFromEv } from "@/lib/grade";
import { ticketPayout, usd } from "@/lib/ticket-payout";

/**
 * The College Football ticket — a perforated `.ticket` slip (globals.css, owner D).
 * Bucket tag (CORE / FUN), name, one line per leg (team mark · label · Caesars price ·
 * market word), then the tear line and the money: stake, Wins/Pays (ticketPayout —
 * the same reading every MLB parlay card uses), hit probability, EV at Caesars and
 * the S–F grade on that EV.
 *
 * `ev-glow` rides a wrapper because the ticket's mask clips its own box-shadow;
 * `.shine` (the S-grade sweep) is on the slip itself. `board` is the slate the legs
 * came from, so a leg can carry the real logo (a total gets the pair); without it — a
 * locked day whose slate is not loaded — the mark falls back to the letters of the
 * label. `grade` is the ledger's settled result for the ticket, `legResults` the
 * per-leg verdicts keyed by `leg.lkey` (the grader's own key).
 */

/** a leg's verdict as the ledger stores it (the grader's result word + its detail line) */
export type CfbLegVerdict = { result: string; detail?: string };
/** an entry's grading block, narrowed off the SyncEntry intersection */
export type CfbGradingView = { tickets: Record<string, CfbGrade>; legs: Record<string, CfbLegVerdict>; done: boolean };
type LegGame = Pick<CfbGame, "id" | "home" | "away">;

/**
 * `CfbLedgerEntry` intersects `SyncEntry`, whose `SyncTicket[]` wins the array-method
 * overloads (`.map` hands back SyncTicket). Spreading keeps the CFB shape — these two
 * are the one place the Builder and Ledger read an entry's tickets and grades.
 */
export function cfbTicketsOf(e: CfbLedgerEntry, bucket: "core" | "fun"): CfbTicket[] {
  return [...(bucket === "core" ? e.core : e.funT)];
}
export function cfbGradingOf(e: CfbLedgerEntry): CfbGradingView | null {
  return e.grading ?? null;
}

const RESULT_PILL: Record<string, { text: string; cls: string }> = {
  won: { text: "WON", cls: "border-pos/60 bg-pos/15 text-pos" },
  lost: { text: "LOST", cls: "border-neg/60 bg-neg/15 text-neg" },
  push: { text: "PUSH", cls: "border-line-2 bg-surface-2 text-muted" },
  pending: { text: "PENDING", cls: "border-live/50 bg-live/10 text-live" },
  ungradable: { text: "VOID", cls: "border-gold/50 bg-gold/10 text-gold" },
};

const LEG_DOT: Record<string, string> = {
  won: "bg-pos",
  lost: "bg-neg",
  push: "bg-muted",
  pending: "bg-live",
  ungradable: "bg-gold",
};

/** "Ohio State -6.5" → "OS", "Indiana ML" → "IND", "Over 56.5" → "O" */
function fallbackAbbr(leg: CfbTicketLeg): string {
  if (leg.market === "total") return leg.side === "over" ? "O" : "U";
  const name = leg.label.replace(/\s+(ML|[+-]?\d+(\.\d+)?|PK)$/i, "").trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  return name.slice(0, 3).toUpperCase() || "—";
}

function LegMark({ leg, game }: { leg: CfbTicketLeg; game: LegGame | undefined }) {
  if (game) {
    if (leg.market === "total") return <PairMark away={game.away} home={game.home} size="xs" />;
    const team = leg.teamId === game.home.id ? game.home : leg.teamId === game.away.id ? game.away : null;
    if (team) return <TeamMark team={team} size="xs" showRank />;
  }
  const tone = leg.market === "total" ? "border-line-2 bg-surface-2 text-muted" : "border-cfb/40 bg-cfb/10 text-cfb";
  return (
    <span
      className={`num inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1 text-[8.5px] font-bold ${tone}`}
      aria-hidden
    >
      {fallbackAbbr(leg)}
    </span>
  );
}

export function CfbTicketCard({
  t,
  grade,
  tag,
  dimmed = false,
  board,
  legResults,
}: {
  t: CfbTicket;
  grade?: CfbGrade | null;
  tag?: string;
  dimmed?: boolean;
  /** the slate the legs came from — real logos on the legs; letters without it */
  board?: Pick<CfbBoard, "games"> | null;
  /** per-leg verdicts keyed by leg.lkey */
  legResults?: Record<string, CfbLegVerdict>;
}) {
  const games = useMemo(() => {
    const m = new Map<string, LegGame>();
    for (const g of board?.games ?? []) m.set(g.id, g);
    return m;
  }, [board]);
  const evGrade = gradeFromEv(t.czEv);
  const glow = t.czEv > 0 ? "ev-glow" : "";
  const shine = evGrade === "S" ? "shine" : "";
  const payout = ticketPayout({ stake: t.stake, czDec: t.czDec, czOdds: t.czOdds }, grade);
  const toWin = Math.round(t.stake * (t.czDec - 1) * 100) / 100;
  const result = grade?.result ? RESULT_PILL[grade.result] : null;
  const oneIn = t.prob > 0 ? Math.round(100 / t.prob) : null;
  const bucketCls = t.bucket === "core" ? "border-cfb/50 bg-cfb/10 text-cfb" : "border-gold/40 bg-gold/10 text-gold";

  return (
    <div className={`rounded-[16px] ${glow} ${dimmed ? "opacity-55" : ""}`} data-testid="cfb-ticket">
      <article className={`ticket ${shine} px-4 pt-3`}>
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${bucketCls}`}>
                {t.bucket === "core" ? "Core" : "Fun"}
              </span>
              {tag && (
                <span className="rounded-full border border-line-2 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">
                  {tag}
                </span>
              )}
              {result && (
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${result.cls}`}>
                  {result.text}
                </span>
              )}
            </div>
            <div className="mt-1.5 truncate text-[13px] font-bold text-text">{t.name}</div>
            <div className="num mt-0.5 text-[10.5px] text-faint">
              <span className="text-gold">{fmtAmerican(t.czOdds)}</span> · {t.czDec.toFixed(2)}× · {t.legs.length} leg
              {t.legs.length === 1 ? "" : "s"} at Caesars
            </div>
          </div>
          <span className="num shrink-0 rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[12px] font-bold text-pos">
            ${t.stake}
          </span>
        </header>

        <ul className="mt-3 space-y-1.5">
          {t.legs.map((leg) => {
            const v = legResults?.[leg.lkey];
            return (
              <li key={leg.lkey} className="flex items-center gap-2 text-[11.5px]" title={v?.detail}>
                <LegMark leg={leg} game={games.get(leg.gkey)} />
                <span className="min-w-0 flex-1 truncate text-text">{leg.label}</span>
                <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-faint">{leg.prop}</span>
                <span className="num shrink-0 font-semibold text-gold">{fmtAmerican(leg.cz)}</span>
                {v && (
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${LEG_DOT[v.result] ?? "bg-muted"}`}
                    role="img"
                    aria-label={`leg ${v.result}`}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="ticket-tear my-3" aria-hidden />

        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pb-1">
          {payout ? (
            <WonPaid t={{ stake: t.stake, czDec: t.czDec, czOdds: t.czOdds }} grade={grade} />
          ) : (
            <span className="num text-[10.5px] text-muted">
              <span className="uppercase tracking-wide text-faint">To win</span> {usd(toWin)}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <span className="num text-[10.5px] text-muted" title={oneIn ? `≈ 1 in ${oneIn} slates` : undefined}>
              {t.prob.toFixed(1)}% to hit
            </span>
            <EvBadge ev={t.czEv} />
            <GradeChip grade={evGrade} basis="EV at Caesars" />
          </div>
        </footer>
      </article>
    </div>
  );
}
