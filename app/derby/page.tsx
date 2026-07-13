"use client";

/* HR DERBY DESK — the engine pointed at the Home Run Derby.
   Bracket + live HR counts come straight from MLB statsapi; the power model
   runs on the nightly Statcast priors; the book's full board ships as a seed
   (public/model/derby-odds.json, transcribed from screenshots) with paste
   boxes to override moving prices. The same data feeds the Board, The Sharp
   and the Builder derby tabs via the shared useDerby() hook. Display-only:
   nothing here feeds the allocator or ledger grading. */

import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useDerby, type DerbyMarket } from "@/lib/useDerby";
import { PastePanel, GroupedEdges, SeedStamp, UnmodeledPanel } from "@/components/derby/DerbySurfaces";
import { fairAmerican, type DerbyState, type DerbyHitter, type SimResult } from "@/engine2/derby";

const fmtAm = (a: number | null | undefined) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtP = (p: number | null | undefined, dp = 1) => (p == null ? "—" : `${(p * 100).toFixed(dp)}%`);
const fairAm = (p: number | null | undefined) => (p == null ? "—" : fmtAm(fairAmerican(p)));
const headshot = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;

export default function DerbyPage() {
  const m = useDerby();

  if (m.loading)
    return (
      <>
        <PageHeader title="HR Derby" sub="Pulling the official bracket from MLB…" />
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </>
    );

  if (m.err === "no-derby" || !m.state || !m.sim)
    return (
      <>
        <PageHeader title="HR Derby" sub="The engine's Home Run Derby desk" />
        {m.err && m.err !== "no-derby" ? (
          <ErrorState title="Couldn't reach MLB statsapi" body={m.err} onRetry={m.refresh} />
        ) : (
          <EmptyState
            title="No Home Run Derby on the calendar"
            body="This desk lights up during All-Star week, when MLB publishes the official bracket."
          />
        )}
      </>
    );

  return <DerbyDesk m={m} />;
}

/* ---------------------------------------------------------------- desk */

function DerbyDesk({ m }: { m: DerbyMarket }) {
  const state = m.state as DerbyState;
  const sim = m.sim as SimResult;
  const hitters = state.hitters;
  const byId = new Map(hitters.map((h) => [h.id, h]));

  const started = Object.values(state.live).some((ls) => ls.some((l) => l.started || l.hr > 0));
  const when = new Date(state.dateIso);
  const whenLabel = isFinite(when.getTime())
    ? when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "";

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
          <Pill variant="ghost" onClick={m.refresh}>
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
            The rate scale is calibrated to the posted market (R1 total ~73, derby total ~117); the ORDERING is the
            model&apos;s own Statcast read. Event total sims to ~{sim.totalAvg.toFixed(0)} HRs.
          </div>
        </Panel>
      </Reveal>

      {/* ---- the book board, priced */}
      <div className="mt-4 space-y-4">
        <Reveal>
          <SeedStamp m={m} />
        </Reveal>
        <PastePanel m={m} />
        {m.legs.length > 0 && (
          <Reveal>
            <GroupedEdges legs={m.legs} bankroll={m.bankroll} />
          </Reveal>
        )}
        <UnmodeledPanel m={m} />
      </div>

      <div className="mt-4 text-[10.5px] text-faint">
        Sources: MLB statsapi (bracket + live counts) · nightly Statcast priors (power model) · the book board from
        your screenshots (market). Every market is a straight bet — the derby has no parlays; size a Daily + Fun card
        in the Builder. Derby tickets stay out of the MLB allocator and auto-graded ledger. Informational only, not
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
