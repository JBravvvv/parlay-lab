"use client";

/* Derby tabs for the Board, The Sharp and the Builder — all fed by the shared
   useDerby() hook (statsapi bracket + Statcast power sim + pasted book odds).
   Parlays here are priced JOINTLY off the tournament draws: correlations
   between legs (a winner and his own HR total, two hitters in the same pool)
   are counted, not assumed away. Display-only: derby tickets don't enter the
   allocator or auto-graded ledger — record them manually if you fire. */

import { useEffect, useMemo, useState } from "react";
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
  devigFieldSum,
  derbyCard,
  type PricedLeg,
  type DerbyCardPick,
} from "@/engine2/derby";
import { impliedFromAmerican } from "@/engine2/devig";
import { getMoney, setMoney } from "@/lib/engine-client";

const fmtAm = (a: number | null | undefined) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtP = (p: number | null | undefined, dp = 1) => (p == null ? "—" : `${(p * 100).toFixed(dp)}%`);
const fairAm = (p: number | null | undefined) => (p == null ? "—" : fmtAm(fairAmerican(p)));

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
          <div className="text-[10.5px] text-faint">
            Every market is a straight bet — the Home Run Derby has no parlays. Head to the Builder to size a Daily +
            Fun card from these edges. Derby tickets don&apos;t enter the MLB allocator or auto-graded ledger — record
            what you fire. Informational only, not betting advice.
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
            <div className="text-[10.5px] text-faint">
              One-night event, straight bets only, tiny edges, huge variance — FUN-money sizing only. Size a full card
              in the Builder. Informational only, not betting advice.
            </div>
          </div>
        );
      }}
    </DerbyShell>
  );
}

/* ========================================================== BUILDER tab */

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-line-2 bg-surface-2 px-4 py-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className="num text-[13px] text-muted">$</span>
      <input
        type="number"
        min={0}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="num w-16 bg-transparent text-[14px] font-semibold text-text outline-none"
      />
    </label>
  );
}

function CardTicket({ p }: { p: DerbyCardPick }) {
  return (
    <div className={`glass px-4 py-3 ${p.leg.ev > 0 ? "ev-glow" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-text">
          {p.leg.label} <span className="font-normal text-muted">{p.leg.prop}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[12px] font-bold text-pos">
            {fmtMoney(p.stake)}
          </span>
          <span className="num text-[13px] font-semibold text-gold">{fmtAm(p.leg.odds)}</span>
          <EvBadge ev={p.leg.ev * 100} />
        </div>
      </div>
      <div className="num mt-1.5 text-[10.5px] text-faint">
        {fmtP(p.leg.blend)} to hit · fair {fairAm(p.leg.blend)} · {p.leg.group}
        {p.leg.market == null && " · one-sided market, anchored to the raw price"}
      </div>
    </div>
  );
}

const DERBY_MONEY_KEY = "pl_derbyMoney";

export function DerbyBuilderTab() {
  const m = useDerby();

  // derby stakes are their own pot — deliberately NOT the MLB card's
  // daily/fun (locking the MLB card consumes those); bankroll is shared
  const [money, setMoneyState] = useState({ daily: 0, fun: 0, bankroll: 750 });
  useEffect(() => {
    let saved = { daily: 0, fun: 0 };
    try {
      saved = { ...saved, ...(JSON.parse(localStorage.getItem(DERBY_MONEY_KEY) ?? "{}") as Partial<typeof saved>) };
    } catch {
      /* fresh device */
    }
    setMoneyState({ daily: saved.daily, fun: saved.fun, bankroll: getMoney().bankroll });
  }, []);
  const updateMoney = (patch: Partial<{ daily: number; fun: number; bankroll: number }>) => {
    setMoneyState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(DERBY_MONEY_KEY, JSON.stringify({ daily: next.daily, fun: next.fun }));
      } catch {
        /* session-only */
      }
      if (patch.bankroll != null) setMoney({ bankroll: patch.bankroll });
      return next;
    });
  };

  const card = useMemo(
    () => (m.legs.length && (money.daily > 0 || money.fun > 0) ? derbyCard(m.legs, { ...money }) : null),
    [m.legs, money],
  );

  return (
    <DerbyShell m={m}>
      {(m) => (
        <div className="space-y-4">
          <EventLine m={m} />
          <SeedStamp m={m} />
          <PastePanel m={m} />

          {/* ---- money inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <MoneyInput label="Daily" value={money.daily} onChange={(n) => updateMoney({ daily: n })} />
            <MoneyInput label="Fun" value={money.fun} onChange={(n) => updateMoney({ fun: n })} />
            <MoneyInput label="Bankroll" value={money.bankroll} onChange={(n) => updateMoney({ bankroll: n })} />
          </div>

          {/* ---- allocated card (straight bets — the derby has no parlays) */}
          {!m.legs.length ? (
            <Panel>
              <EmptyState
                title="No derby odds loaded"
                body="The book board seeds automatically during All-Star week; paste fresh prices above to override it. Then set a Daily and/or Fun amount to size a card."
              />
            </Panel>
          ) : !card ? (
            <Panel>
              <EmptyState
                title="Enter a Daily $ (and optional Fun $)"
                body="Daily spreads across the strongest +EV straight bets — at most two per market family, capped at 2% of bankroll each, summed exactly to your amount, and never the market's least-likely champions. Fun buys 1–3 honest longshots (+500 or longer)."
              />
            </Panel>
          ) : (
            <div className="space-y-5">
              {card.reduced && card.daily.picks.length > 0 && (
                <div className="rounded-(--radius-panel) border border-gold/40 bg-gold/10 px-4 py-3 text-[12px] text-gold">
                  No positive-EV straight bet on this board — the model can&apos;t beat the vig anywhere. Allocating{" "}
                  {fmtMoney(money.daily)} as requested across the least-bad prices; consider passing or trimming.
                </div>
              )}

              {card.daily.picks.length > 0 && (
                <Reveal>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Today&apos;s derby card · {fmtMoney(card.daily.sum)} across {card.daily.picks.length} straight bets
                    </h2>
                    <span className="num flex items-center gap-1.5 text-[11px] text-muted">
                      card EV <EvBadge ev={card.daily.ev * 100} />
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {card.daily.picks.map((p) => (
                      <CardTicket key={p.leg.key} p={p} />
                    ))}
                  </div>
                </Reveal>
              )}

              {card.fun.picks.length > 0 && (
                <Reveal>
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                    Fun money · {fmtMoney(card.fun.sum)} — longshots, most nights lose, tracked separately
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {card.fun.picks.map((p) => (
                      <CardTicket key={p.leg.key} p={p} />
                    ))}
                  </div>
                </Reveal>
              )}

              {card.daily.picks.length === 0 && card.fun.picks.length === 0 && (
                <Panel>
                  <EmptyState
                    title="Nothing to size yet"
                    body="Daily needs at least a dollar; Fun needs a +500-or-longer market on the board. Adjust the amounts above."
                  />
                </Panel>
              )}
            </div>
          )}

          {/* ---- the full straight-bet board to hand-pick from */}
          {m.legs.length > 0 && (
            <Reveal>
              <GroupedEdges legs={m.legs} bankroll={m.bankroll} />
            </Reveal>
          )}

          <div className="text-[10.5px] text-faint">
            The Home Run Derby is straight bets only — no parlays — so the card sizes individual tickets. Daily is
            exact-sum ¼-Kelly across the best edges (two per family max, the market&apos;s least-likely champions
            excluded); Fun is the longshot bucket. Derby tickets stay out of the MLB locked card and auto-graded ledger
            — record what you fire. Informational only, not betting advice.
          </div>
        </div>
      )}
    </DerbyShell>
  );
}
