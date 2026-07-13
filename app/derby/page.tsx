"use client";

/* HR DERBY DESK — the engine pointed at the Home Run Derby.
   Bracket + live HR counts come straight from MLB statsapi; the power model
   runs on the nightly Statcast priors; market prices arrive by paste (The
   Odds API has no derby key — verified) and get Shin de-vigged like every
   other market in the product. Display-only: nothing here feeds parlays,
   the allocator, or ledger grading. */

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney } from "@/lib/engine-client";
import { fmtMoney } from "@/lib/format";
import {
  parseDerby,
  buildHitters,
  simDerby,
  probOver,
  lastName,
  parseWinnerOdds,
  parseH2HOdds,
  parseTotalOdds,
  devigField,
  fairTwoWay,
  blendProb,
  evAtAmerican,
  quarterKelly,
  fairAmerican,
  DERBY_MODEL_W,
  type DerbyState,
  type DerbyHitter,
  type SimResult,
  type PriorsBatter,
} from "@/engine2/derby";

const STATS = "https://statsapi.mlb.com/api/v1";
const SIM_N = 15000;
const LS_KEY = "pl_derbyOdds";

const fmtAm = (a: number | null | undefined) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtP = (p: number | null | undefined, dp = 1) => (p == null ? "—" : `${(p * 100).toFixed(dp)}%`);
const fairAm = (p: number | null | undefined) => (p == null ? "—" : fmtAm(fairAmerican(p)));
const headshot = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;

/* ------------------------------------------------------------- data hook */

type Loaded = { state: DerbyState; fetchedAt: number };

function useDerby() {
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const eventIdRef = useRef<number | null>(null);
  const priorsRef = useRef<Record<string, PriorsBatter> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let dead = false;

    async function findEventId(): Promise<number | null> {
      if (eventIdRef.current) return eventIdRef.current;
      const year = new Date().getFullYear();
      const r = await fetch(
        `${STATS}/schedule?sportId=1&startDate=${year}-07-01&endDate=${year}-07-31&scheduleTypes=events`,
      );
      if (!r.ok) throw new Error(`schedule ${r.status}`);
      const j = (await r.json()) as { dates?: { events?: { id: number; name?: string }[] }[] };
      // MLB also schedules rehearsals ("Home Run Derby Test #3") and the
      // workout day — only the real event will do
      const candidates: { id: number; name: string }[] = [];
      for (const d of j.dates ?? [])
        for (const e of d.events ?? []) {
          const n = e.name ?? "";
          if (/home run derby/i.test(n) && !/workout|batting practice|test/i.test(n)) candidates.push({ id: e.id, name: n });
        }
      const exact = candidates.find((c) => /^\d{4} MLB Home Run Derby$/i.test(c.name.trim()));
      const pick = exact ?? candidates[0] ?? null;
      if (pick) eventIdRef.current = pick.id;
      return pick?.id ?? null;
    }

    async function load() {
      try {
        if (!priorsRef.current) {
          const pr = await fetch("/model/priors.json");
          priorsRef.current = pr.ok ? ((await pr.json()) as { batters?: Record<string, PriorsBatter> }).batters ?? {} : {};
        }
        const id = await findEventId();
        if (dead) return;
        if (!id) {
          setErr("no-derby");
          setLoading(false);
          return;
        }
        const r = await fetch(`${STATS}/homeRunDerby/${id}`);
        if (!r.ok) throw new Error(`derby ${r.status}`);
        const parsed = parseDerby(await r.json());
        if (dead) return;
        if (!parsed) {
          setErr("bad-payload");
          setLoading(false);
          return;
        }
        const hitters = buildHitters(parsed.players, priorsRef.current);
        setData({ state: { ...parsed, hitters }, fetchedAt: Date.now() });
        setErr(null);
        setLoading(false);
      } catch (e) {
        if (!dead) {
          setErr(String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      dead = true;
    };
  }, [tick]);

  // live polling: every 20s while the event is near/in progress and not Final
  useEffect(() => {
    if (!data) return;
    const { state } = data;
    if (state.state === "Final") return;
    const evT = Date.parse(state.dateIso);
    const near = isFinite(evT) && Math.abs(Date.now() - evT) < 12 * 3600 * 1000;
    if (!near) return;
    const t = setTimeout(() => setTick((x) => x + 1), 20000);
    return () => clearTimeout(t);
  }, [data]);

  return { data, err, loading, refresh: () => setTick((x) => x + 1) };
}

/* -------------------------------------------------------------- the page */

type PasteState = { winner: string; h2h: string; totals: string; scope: "event" | "r1" };
const EMPTY_PASTE: PasteState = { winner: "", h2h: "", totals: "", scope: "event" };

export default function DerbyPage() {
  const { data, err, loading, refresh } = useDerby();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [paste, setPaste] = useState<PasteState>(EMPTY_PASTE);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setPaste({ ...EMPTY_PASTE, ...(JSON.parse(raw) as Partial<PasteState>) });
    } catch {
      /* fresh device */
    }
  }, []);
  const savePaste = (p: PasteState) => {
    setPaste(p);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {
      /* storage full/blocked — paste still works this session */
    }
  };

  const bankroll = mounted ? getMoney().bankroll : 750;

  const state = data?.state ?? null;

  // sim key: only re-run when the model inputs change, not on every live poll
  const simKey = state
    ? `${state.id}|${state.rounds.map((r) => r.swings).join(",")}|${state.hitters.map((h) => `${h.id}:${h.hrPerSwing.toFixed(4)}`).join(",")}`
    : "";
  const sim: SimResult | null = useMemo(() => {
    if (!state) return null;
    return simDerby(state, { n: SIM_N });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simKey]);

  if (loading)
    return (
      <>
        <PageHeader title="HR Derby" sub="Pulling the official bracket from MLB…" />
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </>
    );

  if (err === "no-derby" || !state || !sim)
    return (
      <>
        <PageHeader title="HR Derby" sub="The engine's Home Run Derby desk" />
        {err && err !== "no-derby" ? (
          <ErrorState title="Couldn't reach MLB statsapi" body={err} onRetry={refresh} />
        ) : (
          <EmptyState
            title="No Home Run Derby on the calendar"
            body="This desk lights up during All-Star week, when MLB publishes the official bracket."
          />
        )}
      </>
    );

  return <DerbyDesk state={state} sim={sim} paste={paste} savePaste={savePaste} bankroll={bankroll} refresh={refresh} />;
}

/* ---------------------------------------------------------------- desk */

function DerbyDesk({
  state,
  sim,
  paste,
  savePaste,
  bankroll,
  refresh,
}: {
  state: DerbyState;
  sim: SimResult;
  paste: PasteState;
  savePaste: (p: PasteState) => void;
  bankroll: number;
  refresh: () => void;
}) {
  const hitters = state.hitters;
  const byId = new Map(hitters.map((h) => [h.id, h]));
  const nm = (id: number) => byId.get(id)?.name ?? `#${id}`;
  const last = (id: number) => lastName(nm(id));

  const live = state.state !== "Preview";
  const started = Object.values(state.live).some((ls) => ls.some((l) => l.started || l.hr > 0));
  const when = new Date(state.dateIso);
  const whenLabel = isFinite(when.getTime())
    ? when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "";

  /* ---- markets from paste */
  const winner = parseWinnerOdds(paste.winner, hitters);
  const winnerFair = winner.quotes.length >= 3 ? devigField(winner.quotes) : null;
  const h2h = parseH2HOdds(paste.h2h, hitters);
  const totals = parseTotalOdds(paste.totals, hitters);

  const winnerRows = hitters
    .map((h) => {
      const o = sim.byId[h.id];
      const q = winner.quotes.find((x) => x.id === h.id) ?? null;
      const mkt = q && winnerFair ? (winnerFair.get(h.id) ?? null) : null;
      const blend = blendProb(o.win, mkt);
      const ev = q ? evAtAmerican(blend, q.odds) : null;
      return { h, o, q, mkt, blend, ev, kelly: q && ev != null && ev > 0 ? quarterKelly(blend, q.odds, bankroll) : 0 };
    })
    .sort((a, b) => b.blend - a.blend);

  const anyOdds = winner.quotes.length > 0 || h2h.quotes.length > 0 || totals.quotes.length > 0;

  return (
    <>
      <PageHeader
        title="HR Derby"
        sub={
          <>
            {state.name} · {state.venue} · {whenLabel} ·{" "}
            {state.state === "Final" ? (
              <span className="text-gold">Final</span>
            ) : started ? (
              <span className="text-live">
                <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />
                Round {state.currentRound} live
              </span>
            ) : (
              "Tonight"
            )}
            {" · "}
            {state.rounds.map((r) => r.swings).join("/")} swings, pool → bracket
          </>
        }
        action={
          <Pill variant="ghost" onClick={refresh}>
            Refresh
          </Pill>
        }
      />

      {/* ---- live bracket / field */}
      <Reveal>
        <Panel title={started || state.state === "Final" ? "Bracket · live" : "The field · round-1 pool"}>
          <div className="grid gap-2 sm:grid-cols-2">
            {state.pairs.map(([a, b]) => (
              <PairCard key={`${a}-${b}`} a={byId.get(a)!} b={byId.get(b)!} live={state.live} round={1} />
            ))}
          </div>
          {state.laterPairs.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {state.laterPairs.map((lp) => (
                <PairCard
                  key={`${lp.round}-${lp.ids[0]}`}
                  a={byId.get(lp.ids[0])!}
                  b={byId.get(lp.ids[1])!}
                  live={state.live}
                  round={lp.round}
                />
              ))}
            </div>
          )}
          <div className="mt-3 text-[10.5px] text-faint">
            All eight hit in one 20-swing pool; the top four HR totals advance to 15-swing head-to-head semis (ties:
            longest HR, then 3-swing swing-offs). A homer on the final swing keeps the round alive until a miss.
            {started && " Live counts update every ~20s from MLB's own feed."}
          </div>
        </Panel>
      </Reveal>

      {/* ---- model board */}
      <Reveal>
        <Panel
          title={`Model board · ${sim.n.toLocaleString()} tournament sims`}
          className="mt-4"
          action={<span className="num text-[10px] text-faint">Statcast priors · barrels/xISO/EV/hard-hit</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  <th className="pb-2 pr-3">Hitter</th>
                  <th className="pb-2 pr-3">Power pct</th>
                  <th className="pb-2 pr-3">Win</th>
                  <th className="pb-2 pr-3">Fair</th>
                  <th className="pb-2 pr-3">Top 4</th>
                  <th className="pb-2 pr-3">Final</th>
                  <th className="pb-2 pr-3">R1 HRs</th>
                  <th className="pb-2">Derby HRs</th>
                </tr>
              </thead>
              <tbody className="num text-[12.5px]">
                {[...hitters]
                  .sort((a, b) => sim.byId[b.id].win - sim.byId[a.id].win)
                  .map((h) => {
                    const o = sim.byId[h.id];
                    return (
                      <tr key={h.id} className="border-t border-white/[0.04]">
                        <td className="py-2 pr-3">
                          <span className="font-sans font-medium text-text">
                            {h.seed}. {h.name}
                          </span>{" "}
                          <span className="text-[10.5px] text-faint">
                            {h.team ?? ""}
                            {h.thin ? " · thin sample" : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.07]">
                              <div className="h-full rounded-full bg-pos/70" style={{ width: `${h.pctPower ?? 0}%` }} />
                            </div>
                            <span className="text-muted">{h.pctPower?.toFixed(0) ?? "—"}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-text">{fmtP(o.win)}</td>
                        <td className="py-2 pr-3 text-muted">{fairAm(o.win)}</td>
                        <td className="py-2 pr-3 text-muted">{fmtP(o.advanceR1, 0)}</td>
                        <td className="py-2 pr-3 text-muted">{fmtP(o.reachFinal, 0)}</td>
                        <td className="py-2 pr-3 text-muted">{o.r1Avg.toFixed(1)}</td>
                        <td className="py-2 text-muted">{o.evtAvg.toFixed(1)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10.5px] text-faint">
            Swing-limited rounds are brand new in 2026 — there is no history to calibrate absolute HR totals on, so
            trust the rankings more than the averages. Event total across all rounds sims to ~{sim.totalAvg.toFixed(0)}{" "}
            HRs.
          </div>
        </Panel>
      </Reveal>

      {/* ---- odds paste */}
      <Reveal>
        <Panel
          title="Market odds · paste from the book"
          className="mt-4"
          action={
            anyOdds ? (
              <Pill variant="ghost" className="!px-3 !py-1 text-[11px]" onClick={() => savePaste(EMPTY_PASTE)}>
                Clear
              </Pill>
            ) : undefined
          }
        >
          <div className="mb-3 text-[11.5px] leading-relaxed text-muted">
            The Odds API doesn&apos;t carry the Derby, so prices come from you: open the book&apos;s Derby page and
            paste the lines below — one entry per line, any extra text is ignored. Everything gets Shin de-vigged, then
            blended {Math.round(DERBY_MODEL_W * 100)}/{Math.round((1 - DERBY_MODEL_W) * 100)} model/market before EV.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <PasteBox
              label="Winner"
              hint={`Kyle Schwarber +330`}
              value={paste.winner}
              onChange={(v) => savePaste({ ...paste, winner: v })}
              parsed={winner.quotes.length}
              unmatched={winner.unmatched}
            />
            <PasteBox
              label="R1 matchups"
              hint={`Schwarber -140 Caglianone +120`}
              value={paste.h2h}
              onChange={(v) => savePaste({ ...paste, h2h: v })}
              parsed={h2h.quotes.length}
              unmatched={h2h.unmatched}
            />
            <PasteBox
              label="Player HR totals"
              hint={`Schwarber Over 15.5 -115 Under 15.5 -105`}
              value={paste.totals}
              onChange={(v) => savePaste({ ...paste, totals: v })}
              parsed={totals.quotes.length}
              unmatched={totals.unmatched}
            />
          </div>
        </Panel>
      </Reveal>

      {/* ---- winner market */}
      <Reveal>
        <Panel title="To win the derby" className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  <th className="pb-2 pr-3">Hitter</th>
                  <th className="pb-2 pr-3">Book</th>
                  <th className="pb-2 pr-3">Market fair</th>
                  <th className="pb-2 pr-3">Model</th>
                  <th className="pb-2 pr-3">Blend</th>
                  <th className="pb-2 pr-3">EV</th>
                  <th className="pb-2">¼-Kelly</th>
                </tr>
              </thead>
              <tbody className="num text-[12.5px]">
                {winnerRows.map(({ h, o, q, mkt, blend, ev, kelly }) => (
                  <tr key={h.id} className={`border-t border-white/[0.04] ${ev != null && ev > 0.01 ? "ev-glow" : ""}`}>
                    <td className="py-2 pr-3 font-sans font-medium text-text">{h.name}</td>
                    <td className="py-2 pr-3 text-gold">{q ? fmtAm(q.odds) : "—"}</td>
                    <td className="py-2 pr-3 text-muted">{fmtP(mkt)}</td>
                    <td className="py-2 pr-3 text-muted">{fmtP(o.win)}</td>
                    <td className="py-2 pr-3 text-text">
                      {fmtP(blend)} <span className="text-faint">({fairAm(blend)})</span>
                    </td>
                    <td className="py-2 pr-3">{ev != null ? <EvBadge ev={ev * 100} /> : <span className="text-faint">—</span>}</td>
                    <td className="py-2">
                      {kelly > 0.5 ? <span className="text-pos">{fmtMoney(kelly)}</span> : <span className="text-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!winner.quotes.length && (
            <div className="mt-2 text-[11px] text-faint">
              No winner odds pasted yet — the model column stands alone. Paste the book&apos;s outright board above to
              light up EV.
            </div>
          )}
          {winner.quotes.length > 0 && winner.quotes.length < hitters.length && (
            <div className="mt-2 text-[11px] text-gold">
              Only {winner.quotes.length} of {hitters.length} prices pasted — the de-vig is skewed until the field is
              complete.
            </div>
          )}
        </Panel>
      </Reveal>

      {/* ---- H2H + totals */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Panel title="Round-1 matchups · head-to-head">
            <div className="space-y-2.5">
              {sim.pairs.map((pr) => {
                const q = h2h.quotes.find(
                  (x) => (x.aId === pr.a && x.bId === pr.b) || (x.aId === pr.b && x.bId === pr.a),
                );
                const aligned = q && q.aId === pr.a ? q : q ? { aId: q.bId, bId: q.aId, aOdds: q.bOdds, bOdds: q.aOdds } : null;
                const mkt = aligned ? fairTwoWay(aligned.aOdds, aligned.bOdds) : null;
                // sim H2H excludes ties (a push at the book); renormalized
                const pA = pr.pA / (pr.pA + pr.pB);
                const blendA = blendProb(pA, mkt?.a ?? null);
                const evA = aligned ? evAtAmerican(blendA, aligned.aOdds) : null;
                const evB = aligned ? evAtAmerican(1 - blendA, aligned.bOdds) : null;
                return (
                  <div key={`${pr.a}-${pr.b}`} className="num border-b border-white/[0.04] pb-2.5 text-[12px] last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-sans text-[12.5px] font-medium text-text">
                        {last(pr.a)} <span className="text-faint">vs</span> {last(pr.b)}
                      </span>
                      <span className="text-muted">
                        {fmtP(blendA)} / {fmtP(1 - blendA)}
                        <span className="text-faint"> · fair {fairAm(blendA)} / {fairAm(1 - blendA)}</span>
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span>model {fmtP(pA)} · tie {fmtP(pr.pTie)} (push)</span>
                      {aligned && (
                        <>
                          <span className="text-gold">
                            {fmtAm(aligned.aOdds)} / {fmtAm(aligned.bOdds)}
                          </span>
                          {evA != null && <span>{last(pr.a)} <EvBadge ev={evA * 100} /></span>}
                          {evB != null && <span>{last(pr.b)} <EvBadge ev={evB * 100} /></span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[10.5px] text-faint">
              Graded on round-1 totals. Model probabilities shown with the tie stripped out — most books push a tie.
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.06}>
          <Panel
            title="Player HR totals"
            action={
              <div className="flex gap-1">
                {(["event", "r1"] as const).map((s) => (
                  <FilterPill key={s} selected={paste.scope === s} onClick={() => savePaste({ ...paste, scope: s })}>
                    {s === "event" ? "Whole derby" : "Round 1"}
                  </FilterPill>
                ))}
              </div>
            }
          >
            {totals.quotes.length ? (
              <div className="space-y-2.5">
                {totals.quotes.map((q) => {
                  const o = sim.byId[q.id];
                  if (!o) return null;
                  const hist = paste.scope === "r1" ? o.r1Hist : o.evtHist;
                  const model = probOver(hist, q.line, sim.n);
                  const mkt = fairTwoWay(q.overOdds, q.underOdds);
                  const blendOver = blendProb(model.over, mkt?.a ?? null);
                  const evO = q.overOdds != null ? evAtAmerican(blendOver, q.overOdds) : null;
                  const evU = q.underOdds != null ? evAtAmerican(1 - blendOver, q.underOdds) : null;
                  return (
                    <div key={`${q.id}-${q.line}`} className="num border-b border-white/[0.04] pb-2.5 text-[12px] last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-sans text-[12.5px] font-medium text-text">
                          {nm(q.id)} <span className="text-muted">O/U {q.line}</span>
                        </span>
                        <span className="text-muted">
                          model over {fmtP(model.over)}
                          {model.push > 0 && <span className="text-faint"> · push {fmtP(model.push)}</span>}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span className="text-gold">
                          {q.overOdds != null && <>O {fmtAm(q.overOdds)}</>} {q.underOdds != null && <>U {fmtAm(q.underOdds)}</>}
                        </span>
                        {mkt ? (
                          <span>market over {fmtP(mkt.a)} · blend {fmtP(blendOver)}</span>
                        ) : (
                          <span className="text-faint">one side only — model-only prob, no de-vig</span>
                        )}
                        {evO != null && <span>O <EvBadge ev={evO * 100} /></span>}
                        {evU != null && <span>U <EvBadge ev={evU * 100} /></span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No totals pasted"
                body={`Paste lines like "Schwarber Over 15.5 -115" and price them against the sim's HR distributions — toggle whole-derby vs round-1 scope to match how the book grades it.`}
              />
            )}
            <div className="mt-2 text-[10.5px] text-faint">
              Absolute HR totals are the model&apos;s weakest read in a brand-new format — sanity-check the average
              before trusting an edge here.
            </div>
          </Panel>
        </Reveal>
      </div>

      <div className="mt-4 text-[10.5px] text-faint">
        Sources: MLB statsapi (bracket + live counts) · nightly Statcast priors (power model) · your pasted book prices
        (market). Display-only desk — nothing here feeds parlays, the allocator, or the ledger. Informational only, not
        betting advice.
      </div>
    </>
  );
}

/* --------------------------------------------------------- small pieces */

function PairCard({
  a,
  b,
  live,
  round,
}: {
  a: DerbyHitter;
  b: DerbyHitter;
  live: Record<number, { round: number; hr: number; done: boolean; started: boolean; winner: boolean; longest: number | null }[]>;
  round: number;
}) {
  const line = (id: number) => live[id]?.find((l) => l.round === round);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      {round > 1 && (
        <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-faint">
          {round === 3 ? "Final" : "Semifinal"}
        </div>
      )}
      {[a, b].map((h) => {
        const l = line(h.id);
        const hot = l && (l.started || l.hr > 0);
        return (
          <div key={h.id} className="flex items-center gap-2.5 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headshot(h.id)}
              alt=""
              width={30}
              height={30}
              loading="lazy"
              className="h-[30px] w-[30px] shrink-0 rounded-full border border-white/10 bg-white/[0.04] object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
            />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[13px] font-medium ${l?.winner ? "text-pos" : "text-text"}`}>
                <span className="num mr-1.5 text-[10.5px] text-faint">{h.seed}</span>
                {h.name}
                {l?.winner && " ✓"}
              </div>
              <div className="num text-[10px] text-faint">
                {h.team ?? ""} · brl {h.barrelPct != null ? `${h.barrelPct.toFixed(1)}%` : "—"}
                {l?.longest ? ` · long ${Math.round(l.longest)} ft` : ""}
              </div>
            </div>
            <div className={`num text-[19px] font-semibold ${hot ? "text-pos" : "text-faint"}`}>{l ? l.hr : 0}</div>
          </div>
        );
      })}
    </div>
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
