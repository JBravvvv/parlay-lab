"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PairMark, PlayerMark, TeamMark } from "@/components/cfb/TeamMark";
import { EvBadge } from "@/components/ui/EvBadge";
import { GradeChip } from "@/components/ui/GradeChip";
import { WonPaid } from "@/components/ui/WonPaid";
import type { CfbBoard, CfbGame, CfbGrade, CfbLedgerEntry, CfbTicket, CfbTicketLeg } from "@/lib/cfb/types";
import { playerSlug } from "@/lib/cfb/props";
import { fmtAmerican } from "@/lib/format";
import { gradeFromEv } from "@/lib/grade";
import { ticketPayout, usd } from "@/lib/ticket-payout";

/**
 * The College Football ticket — a perforated `.ticket` slip (globals.css, owner D) in the
 * Caesars "boost card" grammar (INSTRUCTION 40, 2026-09-05): bucket tag (CORE / FAVORITES
 * PARLAY — the favorites parlay is the amber card), name, the combined Caesars price as the
 * hero figure, one line per leg (team mark · label · market word · Caesars price), then the
 * tear line and the money: "$stake pays $payout" (ticketPayout — the same reading every MLB
 * parlay card uses; Won/Paid once graded), "% to hit", EV at Caesars and the S–F grade.
 *
 * `ev-glow` rides a wrapper because the ticket's mask clips its own box-shadow;
 * `.shine` (the S-grade sweep) is on the slip itself. `board` is the slate the legs
 * came from, so a leg can carry the real logo (a total gets the pair); without it — a
 * locked day whose slate is not loaded — the mark falls back to the letters of the
 * label. `grade` is the ledger's settled result for the ticket, `legResults` the
 * per-leg verdicts keyed by `leg.lkey` (the grader's own key).
 *
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "it should be the team logo the player
 * plays for not both team logos"): a PROP leg draws the player's headshot with HIS team's logo
 * (PlayerMark), a side its team, and the pair is only ever a total. Point 9 of the same
 * instruction ("clicking the players name in the bet which should take you to that bet if it is
 * currently available pregame or live; even if the line has changed"): the Ledger hands the card
 * `legLink`, and a leg that is still open renders its label as a replace-Link into the Builder
 * (`cfbLegHref` — game + market + player slug, never the line); a closed leg (graded, or a slate
 * day that has passed) stays plain text with a title saying the bet is no longer available.
 * Without `legLink` (the Builder's own locked panel) nothing changes.
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
  const team = game ? (leg.teamId === game.home.id ? game.home : leg.teamId === game.away.id ? game.away : null) : null;
  /* INSTRUCTION 46: a player leg is the player + HIS team — with or without the slate loaded, never the pair */
  if (leg.player) return <PlayerMark player={leg.player} headshot={leg.headshot ?? null} team={team} pos={leg.pos ?? null} size="sm" />;
  if (game) {
    if (leg.market === "total") return <PairMark away={game.away} home={game.home} size="sm" />;
    if (team) return <TeamMark team={team} size="sm" showRank showAbbr={false} />;
  }
  const tone = leg.market === "total" ? "border-line-2 bg-surface-2 text-muted" : "border-cfb/40 bg-cfb/10 text-cfb";
  return (
    <span
      className={`num inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1 text-[9px] font-bold ${tone}`}
      aria-hidden
    >
      {fallbackAbbr(leg)}
    </span>
  );
}

/* ---------- INSTRUCTION 46, point 9: the leg → Builder link, pure so the tests pin the strings ---------- */

/** what a leg's label renders as: a Link to the Builder while the bet is open, else plain text with a reason */
export type CfbLegLink = { href: string | null; title: string };

/** "Ohio State -6.5" → "ohio-state" — the team slug a side leg carries in `player=` */
export function cfbLegSlug(leg: Pick<CfbTicketLeg, "label" | "player" | "market" | "side">): string {
  if (leg.player) return playerSlug(leg.player);
  if (leg.market === "total") return leg.side;
  return playerSlug(leg.label.replace(/\s+(ML|[+-]?\d+(\.\d+)?|PK)$/i, "").trim());
}

/** the Builder deep link: day + game + market + player slug — never the line ("even if the line has changed") */
export function cfbLegHref(leg: Pick<CfbTicketLeg, "gkey" | "market" | "label" | "player" | "side">, date: string): string {
  const q = new URLSearchParams({ cfb: "1", date, game: leg.gkey, mkt: leg.market, player: cfbLegSlug(leg) });
  return `/props?${q.toString()}`;
}

/**
 * A leg is CLOSED (no link) once it is graded (won / lost / push / void), once its game is final or
 * postponed on a loaded slate, or once its slate day is behind today's — a bet on a day that has
 * passed is never "currently available pregame or live". Pending on today's / a later slate → open.
 */
export function cfbLegClosed(opts: { verdict?: CfbLegVerdict | null; date: string; today: string; status?: CfbGame["status"] | null }): boolean {
  const r = opts.verdict?.result;
  if (r === "won" || r === "lost" || r === "push" || r === "ungradable") return true;
  if (opts.status === "final" || opts.status === "postponed") return true;
  return opts.date < opts.today;
}

export const CFB_LEG_CLOSED_TITLE = "Bet no longer available — the game is over or graded";

/** the Ledger's `legLink`: href while open, else null with the closed title */
export function cfbLegLink(leg: CfbTicketLeg, opts: { date: string; today: string; verdict?: CfbLegVerdict | null; status?: CfbGame["status"] | null }): CfbLegLink {
  if (cfbLegClosed(opts)) return { href: null, title: CFB_LEG_CLOSED_TITLE };
  return { href: cfbLegHref(leg, opts.date), title: "Open this bet on the Builder" };
}

export function CfbTicketCard({
  t,
  grade,
  tag,
  dimmed = false,
  board,
  legResults,
  legLink,
  className = "",
}: {
  t: CfbTicket;
  grade?: CfbGrade | null;
  tag?: string;
  dimmed?: boolean;
  /** the slate the legs came from — real logos on the legs; letters without it */
  board?: Pick<CfbBoard, "games"> | null;
  /** per-leg verdicts keyed by leg.lkey */
  legResults?: Record<string, CfbLegVerdict>;
  /** INSTRUCTION 46 (point 9): the Ledger's leg → Builder link; absent on the Builder's own panel */
  legLink?: (leg: CfbTicketLeg) => CfbLegLink | null;
  /** width / snap classes from a carousel parent */
  className?: string;
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
  /* the favorites parlay (fun) is the amber card; core money is the desk's green */
  const fun = t.bucket === "fun";
  const bucketCls = fun ? "border-cfb/50 bg-cfb/12 text-cfb" : "border-pos/40 bg-pos/10 text-pos";
  const rim = fun ? "ring-1 ring-cfb/35" : "";
  const heroTone = fun ? "is-cfb" : "";
  const settled = !!payout?.settled;

  return (
    <div className={`rounded-[16px] ${glow} ${dimmed ? "opacity-55" : ""} ${className}`} data-testid="cfb-ticket">
      <article className={`ticket ${shine} ${rim} px-4 pt-3`}>
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${bucketCls}`}>
              {fun ? "Favorites parlay" : "Core"}
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
          <span className="num shrink-0 text-[10.5px] text-faint">
            {t.legs.length} leg{t.legs.length === 1 ? "" : "s"}
          </span>
        </header>

        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-bold text-text">{t.name}</div>
            <div className="num mt-0.5 text-[10px] text-faint">{t.czDec.toFixed(2)}× at Caesars</div>
          </div>
          <span className={`hero-price ${heroTone} shrink-0`} aria-label={`Caesars price ${fmtAmerican(t.czOdds)}`}>
            {fmtAmerican(t.czOdds)}
          </span>
        </div>

        <ul className="mt-3 space-y-1.5">
          {t.legs.map((leg) => {
            const v = legResults?.[leg.lkey];
            const link = legLink?.(leg) ?? null;
            const game = games.get(leg.gkey);
            // INSTRUCTION 46 fix round (2026-09-08): a player leg prints the matchup under the name
            // (his own team's logo is the mark; the other team is still named here)
            const matchup = leg.player && game ? `${game.away.abbr} @ ${game.home.abbr}` : null;
            return (
              <li key={leg.lkey} className="flex items-center gap-2 text-[11.5px]" title={v?.detail}>
                <LegMark leg={leg} game={game} />
                <span className="flex min-w-0 flex-1 flex-col">
                {link?.href ? (
                  // the name is the one tap inside a ledger box that does NOT collapse it (INSTRUCTION 46, point 9)
                  <Link
                    replace
                    href={link.href}
                    title={link.title}
                    onClick={(ev) => ev.stopPropagation()}
                    className="min-w-0 flex-1 truncate text-text underline decoration-cfb/50 decoration-dotted underline-offset-2"
                    data-cfb-leg-link
                  >
                    {leg.label}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-text" title={link?.title}>{leg.label}</span>
                )}
                {matchup && <span className="truncate text-[9.5px] text-faint" data-cfb-leg-matchup>{matchup}</span>}
                </span>
                <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-faint">{leg.prop}</span>
                <span className={`num shrink-0 font-semibold ${leg.cz > 0 ? "text-pos" : "text-text"}`}>{fmtAmerican(leg.cz)}</span>
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

        <footer className="pb-1.5">
          <div className="flex items-baseline justify-between gap-3">
            {payout && !settled ? (
              <span className="num text-[13px] font-bold text-text">
                ${t.stake} <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">pays</span>{" "}
                <span className={fun ? "text-cfb" : "text-pos"}>{usd(payout.pays)}</span>
              </span>
            ) : payout ? (
              <WonPaid t={{ stake: t.stake, czDec: t.czDec, czOdds: t.czOdds }} grade={grade} className="!text-[12px]" />
            ) : (
              <span className="num text-[12px] text-muted">
                ${t.stake} <span className="uppercase tracking-wide text-faint">to win</span> {usd(toWin)}
              </span>
            )}
            <span className="num shrink-0 text-[11px] font-semibold text-muted" title={oneIn ? `≈ 1 in ${oneIn} slates` : undefined}>
              {t.prob.toFixed(1)}% <span className="text-[9.5px] font-medium uppercase tracking-wide text-faint">to hit</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {payout && !settled ? (
              <span className="num text-[10px] text-faint">wins {usd(payout.wins)} · stake ${t.stake}</span>
            ) : (
              <span className="num text-[10px] text-faint">stake ${t.stake}</span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <EvBadge ev={t.czEv} />
              <GradeChip grade={evGrade} basis="EV at Caesars" />
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
