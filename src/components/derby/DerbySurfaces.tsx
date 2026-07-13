"use client";

/* Derby tabs for the Board, The Sharp and the Builder — all fed by the shared
   useDerby() hook (statsapi bracket + Statcast power sim + pasted book odds).
   Parlays here are priced JOINTLY off the tournament draws: correlations
   between legs (a winner and his own HR total, two hitters in the same pool)
   are counted, not assumed away. Display-only: derby tickets don't enter the
   allocator or auto-graded ledger — record them manually if you fire. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { fmtMoney } from "@/lib/format";
import { useDerby, EMPTY_PASTE, type PasteState, type DerbyMarket } from "@/lib/useDerby";
import {
  fairAmerican,
  quarterKelly,
  lastName,
  priceDerbyCombo,
  devigFieldSum,
  type PricedLeg,
  type DerbyParlay,
} from "@/engine2/derby";
import { impliedFromAmerican } from "@/engine2/devig";

const fmtAm = (a: number | null | undefined) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtP = (p: number | null | undefined, dp = 1) => (p == null ? "—" : `${(p * 100).toFixed(dp)}%`);
const fairAm = (p: number | null | undefined) => (p == null ? "—" : fmtAm(fairAmerican(p)));
const decToAm = (dc: number) => (dc >= 2 ? Math.round((dc - 1) * 100) : -Math.round(100 / (dc - 1)));

/* ------------------------------------------------------------ paste panel */

export function PastePanel({
  m,
  defaultOpen,
}: {
  m: Pick<DerbyMarket, "paste" | "savePaste" | "parsed">;
  defaultOpen?: boolean;
}) {
  const { paste, savePaste, parsed } = m;
  const any = Boolean(paste.winner.trim() || paste.h2h.trim() || paste.totals.trim());
  return (
    <details className="glass px-5 py-4" open={defaultOpen ?? !any}>
      <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        Market odds · paste from the book{" "}
        {any && (
          <span className="num ml-1 text-pos">
            {parsed.winner.quotes.length + parsed.h2h.quotes.length * 2 + parsed.totals.quotes.length} markets loaded
          </span>
        )}
      </summary>
      <div className="mt-3 mb-3 text-[11.5px] leading-relaxed text-muted">
        The Odds API doesn&apos;t carry the Derby, so prices come from you: open the book&apos;s Derby page and paste
        the lines below — one entry per line, extra text is ignored. Everything is Shin de-vigged, blended 25/75
        model/market before EV.
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <PasteBox
          label="Winner"
          hint="Kyle Schwarber +330"
          value={paste.winner}
          onChange={(v) => savePaste({ ...paste, winner: v })}
          parsed={parsed.winner.quotes.length}
          unmatched={parsed.winner.unmatched}
        />
        <PasteBox
          label="R1 matchups"
          hint="Schwarber -140 Caglianone +120"
          value={paste.h2h}
          onChange={(v) => savePaste({ ...paste, h2h: v })}
          parsed={parsed.h2h.quotes.length}
          unmatched={parsed.h2h.unmatched}
        />
        <PasteBox
          label="Player HR totals"
          hint="Schwarber Over 15.5 -115 Under 15.5 -105"
          value={paste.totals}
          onChange={(v) => savePaste({ ...paste, totals: v })}
          parsed={parsed.totals.quotes.length}
          unmatched={parsed.totals.unmatched}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5">
          {(["event", "r1"] as const).map((s) => (
            <FilterPill key={s} selected={paste.scope === s} onClick={() => savePaste({ ...paste, scope: s })}>
              {s === "event" ? "Totals: whole derby" : "Totals: round 1"}
            </FilterPill>
          ))}
        </div>
        {any && (
          <Pill variant="ghost" className="!px-3 !py-1 text-[11px]" onClick={() => savePaste(EMPTY_PASTE)}>
            Clear
          </Pill>
        )}
      </div>
    </details>
  );
}

function PasteBox({
  label,
  hint,
  value,
  onChange,
  parsed,
  unmatched,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  parsed: number;
  unmatched: string[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
        {value.trim() && (
          <span className={`num text-[10px] ${parsed ? "text-pos" : "text-neg"}`}>
            {parsed} parsed{unmatched.length ? ` · ${unmatched.length} skipped` : ""}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        rows={4}
        spellCheck={false}
        className="num w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[12px] text-text placeholder:text-faint focus:border-pos/40 focus:outline-none"
      />
    </div>
  );
}

/* ------------------------------------------------------------ edge table */

export function DerbyEdgeTable({ legs, bankroll }: { legs: PricedLeg[]; bankroll: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
            <th className="pb-2 pr-3">Market</th>
            <th className="pb-2 pr-3">Book</th>
            <th className="pb-2 pr-3">Market fair</th>
            <th className="pb-2 pr-3">Model</th>
            <th className="pb-2 pr-3">Blend</th>
            <th className="pb-2 pr-3">EV</th>
            <th className="pb-2">¼-Kelly</th>
          </tr>
        </thead>
        <tbody className="num text-[12.5px]">
          {legs.map((l) => {
            const stake = l.ev > 0 ? Math.round(Math.min(0.02 * bankroll, quarterKelly(l.blend, l.odds, bankroll))) : 0;
            return (
              <tr key={l.key} className={`border-t border-white/[0.04] ${l.ev > 0.01 ? "ev-glow" : ""}`}>
                <td className="py-2 pr-3">
                  <span className="font-sans font-medium text-text">{l.label}</span>{" "}
                  <span className="font-sans text-[11.5px] text-muted">{l.prop}</span>
                </td>
                <td className="py-2 pr-3 text-gold">{fmtAm(l.odds)}</td>
                <td className="py-2 pr-3 text-muted">{fmtP(l.market)}</td>
                <td className="py-2 pr-3 text-muted">{fmtP(l.model)}</td>
                <td className="py-2 pr-3 text-text">
                  {fmtP(l.blend)} <span className="text-faint">({fairAm(l.blend)})</span>
                </td>
                <td className="py-2 pr-3">
                  <EvBadge ev={l.ev * 100} />
                </td>
                <td className="py-2">{stake > 0 ? <span className="text-pos">{fmtMoney(stake)}</span> : <span className="text-faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* canonical market-family order for the grouped board */
const GROUP_ORDER = [
  "Winner",
  "Reach the final",
  "Make the top 4",
  "R1 head-to-head",
  "Player HR totals",
  "Derby totals",
  "R1 duos",
  "Field specials",
  "First swing",
  "Most R1 HRs",
  "Finalists",
  "Exacta",
];

export function GroupedEdges({ legs, bankroll }: { legs: PricedLeg[]; bankroll: number }) {
  const groups = new Map<string, PricedLeg[]>();
  for (const l of legs) (groups.get(l.group) ?? groups.set(l.group, []).get(l.group)!).push(l);
  const ordered = [...groups.entries()].sort(
    (a, b) => (GROUP_ORDER.indexOf(a[0]) + 100) % 200 - (GROUP_ORDER.indexOf(b[0]) + 100) % 200,
  );
  return (
    <div className="space-y-2">
      {ordered.map(([name, ls], i) => (
        <details key={name} className="glass px-5 py-3.5" open={i < 3}>
          <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {name} <span className="num text-[10px] text-faint">{ls.length}</span>
            {ls.some((l) => l.ev > 0.01) && <span className="ml-2 text-pos">● edge</span>}
          </summary>
          <div className="mt-2">
            <DerbyEdgeTable legs={ls} bankroll={bankroll} />
          </div>
        </details>
      ))}
    </div>
  );
}

export function SeedStamp({ m }: { m: DerbyMarket }) {
  if (!m.seed?.captured_at) return null;
  const t = new Date(m.seed.captured_at);
  return (
    <div className="rounded-(--radius-panel) border border-gold/25 bg-gold/[0.06] px-4 py-2.5 text-[11.5px] text-muted">
      Book board loaded from your screenshots, captured{" "}
      <span className="text-gold">
        {isFinite(t.getTime()) ? t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : m.seed.captured_at}
      </span>{" "}
      — prices move all day, so re-check the app at lock. Pasting fresh winner/matchup/total prices overrides the
      seeded ones.
    </div>
  );
}

export function UnmodeledPanel({ m }: { m: DerbyMarket }) {
  const u = m.seed?.unmodeled;
  if (!u) return null;
  const field = (xs: { name: string; odds: number }[] | undefined) => {
    if (!xs?.length) return null;
    const fair = devigFieldSum(xs.map((q) => impliedFromAmerican(q.odds)), 1);
    return xs.map((q, i) => ({ ...q, fair: fair?.[i] ?? null }));
  };
  const longest = field(u.longestHrPlayer);
  const ev = field(u.highestExitVelo);
  return (
    <details className="glass px-5 py-3.5">
      <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        Distance & exit-velo props — market only, the sim doesn&apos;t model these
      </summary>
      <div className="mt-3 grid gap-4 text-[12px] md:grid-cols-2">
        {longest && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Longest HR</div>
            {longest.map((q) => (
              <div key={q.name} className="num flex justify-between border-t border-white/[0.04] py-1.5">
                <span className="font-sans text-text">{q.name}</span>
                <span>
                  <span className="text-gold">{fmtAm(q.odds)}</span>{" "}
                  <span className="text-faint">fair {fmtP(q.fair)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {ev && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Highest exit velo</div>
            {ev.map((q) => (
              <div key={q.name} className="num flex justify-between border-t border-white/[0.04] py-1.5">
                <span className="font-sans text-text">{q.name}</span>
                <span>
                  <span className="text-gold">{fmtAm(q.odds)}</span>{" "}
                  <span className="text-faint">fair {fmtP(q.fair)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="num mt-3 space-y-1 text-[11.5px] text-muted">
        {u.longestHrDistance && (
          <div>
            Longest HR distance O/U {u.longestHrDistance.line} ft: O {fmtAm(u.longestHrDistance.over)} / U{" "}
            {fmtAm(u.longestHrDistance.under)}
          </div>
        )}
        {u.any520Plus && <div>Any player hits a 520+ ft HR: {fmtAm(u.any520Plus.odds)}</div>}
        {u.boosts?.map((b) => (
          <div key={b.label}>
            Boost: {b.label} {fmtAm(b.odds)}
            {b.base != null && <span className="text-faint"> (open field price {fmtAm(b.base)})</span>}
            {b.warn && <span className="text-neg"> — {b.warn}</span>}
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10.5px] text-faint">
        &quot;Fair&quot; here is only the de-vigged market — no model opinion exists for distance or exit velo.
      </div>
    </details>
  );
}

/* ----------------------------------------------------------- parlay card */

/** Combos whose legs move together get repriced (or refused) by the book as
    an SGP — the multiplied-singles price and its EV are fiction there. */
export const CORRELATED = (p: DerbyParlay) => p.corr > 1.15;

export function ParlayCard({ p, highlight }: { p: DerbyParlay; highlight?: boolean }) {
  const names = [...new Set(p.legs.map((l) => lastName(l.label)))];
  const name = names.join(" + ") + (names.length < p.legs.length ? ` · ${p.legs.length} legs` : "");
  const sgp = CORRELATED(p);
  return (
    <div className={`glass px-4 py-3 ${!sgp && p.ev > 0 ? "ev-glow" : ""} ${highlight ? "glow-pos" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-text">{name}</div>
        <div className="flex items-center gap-2">
          {sgp ? (
            <span className="num rounded-full border border-gold/50 bg-gold/10 px-2.5 py-0.5 text-[12px] font-bold text-gold">
              fair {fairAm(p.pJoint)}
            </span>
          ) : (
            <>
              {p.kelly > 0 && (
                <span className="num rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[12px] font-bold text-pos">
                  {fmtMoney(p.kelly)}
                </span>
              )}
              <span className="num text-[13px] font-semibold text-gold">{fmtAm(decToAm(p.dec))}</span>
              <EvBadge ev={p.ev * 100} />
            </>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {p.legs.map((l) => (
          <div key={l.key} className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="text-muted">
              <span className="text-text">{l.label}</span> {l.prop}
            </span>
            <span className="num shrink-0 text-gold">{fmtAm(l.odds)}</span>
          </div>
        ))}
      </div>
      <div className="num mt-2 text-[10.5px] text-faint">
        {fmtP(p.pJoint)} to hit · fair {fairAm(p.pJoint)}
        {sgp ? (
          <>
            {" "}
            · legs correlated ×{p.corr.toFixed(2)} — the book will reprice this as an SGP (or refuse it). The number
            that matters is <span className="text-gold">fair {fairAm(p.pJoint)}</span>: any book quote better than that
            is +EV.
          </>
        ) : (
          Math.abs(p.corr - 1) > 0.07 && <> · correlation ×{p.corr.toFixed(2)} counted off the sim</>
        )}
      </div>
    </div>
  );
}

export function ParlayGrid({ parlays, limit }: { parlays: DerbyParlay[]; limit?: number }) {
  const clean = parlays.filter((p) => !CORRELATED(p)).slice(0, limit ?? 6);
  const sgp = parlays.filter(CORRELATED).slice(0, limit ?? 6);
  return (
    <div className="space-y-4">
      {clean.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Derby parlays · independent legs, priced at multiplied book odds
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {clean.map((p, i) => (
              <ParlayCard key={p.legs.map((l) => l.key).join("|")} p={p} highlight={i === 0 && p.ev > 0} />
            ))}
          </div>
        </div>
      )}
      {sgp.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            Correlated combos · SGP territory — compare the book&apos;s quote to fair
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sgp.map((p) => (
              <ParlayCard key={p.legs.map((l) => l.key).join("|")} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- shared loading shells */

function DerbyShell({ m, children }: { m: DerbyMarket; children: (m: DerbyMarket) => React.ReactNode }) {
  if (m.loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  if (m.err === "no-derby" || !m.state || !m.sim)
    return m.err && m.err !== "no-derby" ? (
      <ErrorState title="Couldn't reach MLB statsapi" body={m.err} onRetry={m.refresh} />
    ) : (
      <Panel>
        <EmptyState
          title="No Home Run Derby on the calendar"
          body="The derby desks light up during All-Star week, when MLB publishes the official bracket."
        />
      </Panel>
    );
  return <>{children(m)}</>;
}

function EventLine({ m }: { m: DerbyMarket }) {
  const s = m.state!;
  const when = new Date(s.dateIso);
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
      <span>
        {s.name} · {s.venue} ·{" "}
        {isFinite(when.getTime()) ? when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""}
        {s.state === "Final" ? " · Final" : ""}
      </span>
      <Link href="/derby" className="font-semibold text-pos hover:underline">
        Bracket, live counts &amp; model board →
      </Link>
    </div>
  );
}

/* ============================================================ BOARD tab */

export function DerbyBoardTab() {
  const m = useDerby();
  return (
    <DerbyShell m={m}>
      {(m) => (
        <div className="space-y-4">
          <EventLine m={m} />
          <SeedStamp m={m} />
          <PastePanel m={m} />
          {m.legs.length > 0 && (
            <Reveal>
              <Panel title={`Top edges · best of ${m.legs.length} priced markets`}>
                <DerbyEdgeTable legs={m.legs.slice(0, 10)} bankroll={m.bankroll} />
              </Panel>
            </Reveal>
          )}
          {m.legs.length > 0 ? (
            <Reveal>
              <GroupedEdges legs={m.legs} bankroll={m.bankroll} />
            </Reveal>
          ) : (
            <Panel>
              <EmptyState
                title="No derby odds loaded"
                body="Paste the book's winner board, matchups or HR totals above — every market gets de-vigged and priced against the 15,000-tournament sim."
              />
            </Panel>
          )}
          <UnmodeledPanel m={m} />
          {m.parlays.length > 0 && (
            <Reveal>
              <ParlayGrid parlays={m.parlays} />
            </Reveal>
          )}
          <div className="text-[10.5px] text-faint">
            Correlations are counted across simulated tournaments, not assumed. Exotic fields (exacta, finalists,
            most-R1) stay out of the parlay generator. Derby tickets don&apos;t enter the allocator or auto-graded
            ledger — record what you fire. Informational only, not betting advice.
          </div>
        </div>
      )}
    </DerbyShell>
  );
}

/* ============================================================ SHARP tab */

function sharpReason(l: PricedLeg, m: DerbyMarket): string {
  const h = m.state!.hitters.find((x) => x.name === l.label || l.label.includes(lastName(x.name)));
  const o = h ? m.sim!.byId[h.id] : null;
  const edge =
    l.market != null
      ? `Model ${fmtP(l.model)} vs market ${fmtP(l.market)} after the vig comes out.`
      : `Model ${fmtP(l.model)} — one-sided paste, no de-vig to anchor on.`;
  if (l.leg.kind === "winner" && h && o)
    return `${edge} ${lastName(h.name)} carries a ${h.pctPower?.toFixed(0) ?? "—"}th-percentile raw-power blend and sims ${o.r1Avg.toFixed(1)} HRs in the 20-swing pool with a ${fmtP(o.advanceR1, 0)} advance rate.`;
  if (l.leg.kind === "h2h") return `${edge} Graded on round-1 totals; ties push and are stripped from the price.`;
  if (l.leg.kind === "total" && h && o)
    return `${edge} The sim averages ${(l.leg.scope === "r1" ? o.r1Avg : o.evtAvg).toFixed(1)} HRs for him in that window — but totals are the model's weakest read in a brand-new format.`;
  return edge;
}

export function DerbySharpTab() {
  const m = useDerby();
  return (
    <DerbyShell m={m}>
      {(m) => {
        const plays = m.legs.filter((l) => l.ev > 0).slice(0, 6);
        const top = [...m.state!.hitters].sort((a, b) => m.sim!.byId[b.id].win - m.sim!.byId[a.id].win).slice(0, 3);
        // endorse only book-friendly combos — correlated ones get repriced as SGPs
        const bestParlay = m.parlays.find((p) => !CORRELATED(p) && p.ev > 0) ?? null;
        return (
          <div className="space-y-5">
            <EventLine m={m} />
            <SeedStamp m={m} />
            <Reveal>
              <Panel title="The engine's derby read">
                <p className="text-[13px] leading-relaxed text-muted">
                  {m.sim!.n.toLocaleString()} simulated tournaments off the Statcast power profiles make{" "}
                  {top.map((h, i) => (
                    <span key={h.id}>
                      {i > 0 && (i === top.length - 1 ? " and " : ", ")}
                      <span className="text-text">{h.name}</span> {fmtP(m.sim!.byId[h.id].win)}
                    </span>
                  ))}{" "}
                  to win. Swing-limited rounds are new in 2026 — no history behind the calibration, so the market keeps
                  75% of the vote on every price and the rankings deserve more trust than any single number.
                </p>
              </Panel>
            </Reveal>
            <PastePanel m={m} />
            {plays.length > 0 ? (
              <Reveal>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Playable derby edges — at your pasted prices
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {plays.map((l, i) => (
                    <Panel key={l.key} className={i === 0 ? "glow-pos" : ""}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="display text-[16px] text-text">{l.label}</div>
                          <div className="mt-0.5 text-[12px] text-muted">{l.prop}</div>
                        </div>
                        <span className="num shrink-0 text-[14px] font-semibold text-gold">{fmtAm(l.odds)}</span>
                      </div>
                      <div className="num mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                        <span className="text-text">{fmtP(l.blend)} true</span>
                        <EvBadge ev={l.ev * 100} />
                      </div>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{sharpReason(l, m)}</p>
                    </Panel>
                  ))}
                </div>
              </Reveal>
            ) : (
              <Panel>
                <EmptyState
                  title={m.anyOdds ? "No positive-EV derby play at these prices" : "Paste the book's derby odds to get the read"}
                  body={
                    m.anyOdds
                      ? "The blend can't beat the vig anywhere on this board — that's a real answer. Passing is a position, especially on a one-night carnival event."
                      : "The Sharp prices every pasted market against the tournament sim and only endorses what survives the 75% market anchor."
                  }
                />
              </Panel>
            )}
            {bestParlay && (
              <Reveal>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Best book-friendly parlay
                </h2>
                <ParlayCard p={bestParlay} highlight />
              </Reveal>
            )}
            <div className="text-[10.5px] text-faint">
              One-night event, tiny edges, huge variance — FUN-money sizing only. Informational only, not betting
              advice.
            </div>
          </div>
        );
      }}
    </DerbyShell>
  );
}

/* ========================================================== BUILDER tab */

export function DerbyBuilderTab() {
  const m = useDerby();
  const [slipKeys, setSlipKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const slip = useMemo(() => slipKeys.map((k) => m.legs.find((l) => l.key === k)).filter(Boolean) as PricedLeg[], [slipKeys, m.legs]);
  const combo = useMemo(
    () => (m.draws && slip.length >= 2 ? priceDerbyCombo(m.draws, slip, m.bankroll) : null),
    [m.draws, slip, m.bankroll],
  );
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return m.legs.filter((l) => `${l.label} ${l.prop}`.toLowerCase().includes(q) && !slipKeys.includes(l.key)).slice(0, 6);
  }, [query, m.legs, slipKeys]);

  return (
    <DerbyShell m={m}>
      {(m) => (
        <div className="space-y-4">
          <EventLine m={m} />
          <SeedStamp m={m} />
          <PastePanel m={m} />
          <Reveal>
            <Panel title="Derby slip — combine any pasted markets (correlation-exact)">
              {!m.legs.length ? (
                <EmptyState
                  title="Paste odds first"
                  body="The slip combines any priced derby markets and prices the combo jointly off the 15,000-tournament sim — correlations between legs are counted, not assumed."
                />
              ) : (
                <>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a hitter or market…"
                    className="w-full rounded-full border border-line-2 bg-surface-2 px-4 py-2.5 text-[13px] text-text outline-none focus:border-pos/50"
                  />
                  {results.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {results.map((l) => (
                        <button
                          key={l.key}
                          onClick={() => {
                            setSlipKeys((s) => [...s, l.key]);
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.05]"
                        >
                          <span>
                            <span className="text-text">{l.label}</span> <span className="text-muted">{l.prop}</span>
                          </span>
                          <span className="num text-gold">{fmtAm(l.odds)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {slip.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {slip.map((l) => (
                        <div key={l.key} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span>
                            <span className="text-text">{l.label}</span> <span className="text-muted">{l.prop}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="num text-gold">{fmtAm(l.odds)}</span>
                            <button
                              onClick={() => setSlipKeys((s) => s.filter((k) => k !== l.key))}
                              aria-label="remove"
                              className="rounded-full px-2 text-muted hover:text-neg"
                            >
                              ✕
                            </button>
                          </span>
                        </div>
                      ))}
                      {slip.length >= 2 &&
                        (combo ? (
                          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3">
                            <span className="num text-[13px] text-text">
                              {fmtP(combo.pJoint)} true · <span className="text-gold">{fmtAm(decToAm(combo.dec))}</span>
                            </span>
                            <span className="num text-[12px] text-muted">fair {fairAm(combo.pJoint)}</span>
                            <EvBadge ev={combo.ev * 100} />
                            {combo.kelly > 0 && <span className="num text-[12px] text-muted">¼-Kelly {fmtMoney(combo.kelly)}</span>}
                            {Math.abs(combo.corr - 1) > 0.07 && (
                              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                                correlated ×{combo.corr.toFixed(2)} — priced jointly, not independence
                              </span>
                            )}
                            <Pill variant="ghost" onClick={() => setSlipKeys([])} className="!px-3 !py-1 text-[11px]">
                              Clear
                            </Pill>
                          </div>
                        ) : (
                          <div className="mt-3 border-t border-white/[0.05] pt-3 text-[12px] text-neg">
                            These legs can&apos;t all win together (mutually exclusive) — the combo prices to zero.
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </Panel>
          </Reveal>
          {m.parlays.length > 0 && (
            <Reveal>
              <ParlayGrid parlays={m.parlays} limit={4} />
            </Reveal>
          )}
          <div className="text-[10.5px] text-faint">
            Derby tickets stay out of the locked card and auto-graded ledger — the event grades in one night, record
            what you fire. Informational only, not betting advice.
          </div>
        </div>
      )}
    </DerbyShell>
  );
}
