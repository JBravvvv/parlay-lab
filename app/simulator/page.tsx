"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { ProbBar } from "@/components/ui/ProbBar";
import { getSims, type SimOut as Sim } from "@/lib/engine-client";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import { fmtAmerican, fmtPct } from "@/lib/format";

function fairML(p: number): string {
  if (!(p > 0) || !(p < 1)) return "—";
  return fmtAmerican(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
}

function teamNames(gkey: string, info?: Record<string, { away: string; home: string }>): { away: string; home: string } {
  const gi = info?.[gkey];
  if (gi) return { away: gi.away, home: gi.home };
  const [away, home] = gkey.split("@");
  const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  return { away: cap(away ?? ""), home: cap(home ?? "") };
}

export default function SimulatorPage() {
  const { data: board } = useBoard();
  const regen = useRegenerateBoard();
  const sims = useMemo<Record<string, Sim>>(() => {
    if (typeof window === "undefined") return {};
    // populated by a fresh analyze run in this session (not by the day-cache)
    void board;
    void regen.isSuccess;
    return getSims();
  }, [board, regen.isSuccess]);

  const keys = Object.keys(sims);
  const [sel, setSel] = useState<string | null>(null);
  const key = sel ?? keys[0] ?? null;
  const sim = key ? sims[key] : null;
  const info = board?.data.gameInfo as Record<string, { away: string; home: string }> | undefined;
  const nm = key ? teamNames(key, info) : null;

  const legRows = useMemo(
    () =>
      sim
        ? Object.entries(sim.legP)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 24)
        : [],
    [sim],
  );

  return (
    <>
      <PageHeader
        title="Simulator"
        sub="The engine's Monte Carlo game sims — 4,000 seeded paths per game, per-PA base-out machine, real lineups only"
        action={
          <Pill variant="primary" onClick={() => regen.mutate()} disabled={regen.isPending}>
            {regen.isPending ? "Simulating…" : "Run fresh sims"}
          </Pill>
        }
      />

      {keys.length === 0 ? (
        <Panel>
          <EmptyState
            title={regen.isPending ? "Running the slate…" : "No sims in memory"}
            body="Sims are produced during a fresh board run for pregame games with confirmed lineups. Run fresh sims to populate this page — no lineup, no sim, never a made-up one."
            action={
              !regen.isPending ? (
                <Pill variant="primary" onClick={() => regen.mutate()}>
                  Run fresh sims
                </Pill>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => {
              const t = teamNames(k, info);
              return (
                <FilterPill key={k} selected={key === k} onClick={() => setSel(k)}>
                  {t.away} @ {t.home}
                </FilterPill>
              );
            })}
          </div>

          {sim && nm && (
            <>
              <Reveal>
                <div className="grid gap-4 md:grid-cols-3">
                  <Panel className="glow-pos">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                      Win probability
                    </div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-[12px]">
                          <span className="font-semibold text-text">{nm.home} (home)</span>
                          <span className="num text-pos">{fmtPct(sim.pHome)}</span>
                        </div>
                        <ProbBar p={sim.pHome} />
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[12px]">
                          <span className="font-semibold text-text">{nm.away}</span>
                          <span className="num text-muted">{fmtPct(1 - sim.pHome)}</span>
                        </div>
                        <ProbBar p={1 - sim.pHome} />
                      </div>
                    </div>
                    <div className="num mt-3 text-[11px] text-muted">
                      fair ML: {nm.home} {fairML(sim.pHome)} · {nm.away} {fairML(1 - sim.pHome)}
                    </div>
                  </Panel>

                  <Panel>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                      Expected runs
                    </div>
                    <div className="mt-2 flex items-end gap-6">
                      <div>
                        <div className="display num text-[34px] leading-none text-text">
                          <CountUp value={sim.avgHome} format={(n) => n.toFixed(2)} />
                        </div>
                        <div className="text-[11px] text-muted">{nm.home}</div>
                      </div>
                      <div>
                        <div className="display num text-[34px] leading-none text-text">
                          <CountUp value={sim.avgAway} format={(n) => n.toFixed(2)} />
                        </div>
                        <div className="text-[11px] text-muted">{nm.away}</div>
                      </div>
                    </div>
                    <div className="num mt-3 text-[11px] text-faint">{sim.n.toLocaleString()} seeded paths — deterministic, re-runs match</div>
                  </Panel>

                  <Panel>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                      Run line cover (±1.5)
                    </div>
                    <div className="mt-2 h-36">
                      <ResponsiveContainer>
                        <BarChart
                          data={[
                            { k: `${nm.home} -1.5`, p: sim.pHomeM15 * 100 },
                            { k: `${nm.home} +1.5`, p: sim.pHomeP15 * 100 },
                            { k: `${nm.away} -1.5`, p: sim.pAwayM15 * 100 },
                            { k: `${nm.away} +1.5`, p: sim.pAwayP15 * 100 },
                          ]}
                          margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
                        >
                          <XAxis dataKey="k" stroke="var(--color-faint)" fontSize={9} tickLine={false} interval={0} />
                          <YAxis stroke="var(--color-faint)" fontSize={10} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              background: "var(--color-surface-2)",
                              border: "1px solid var(--color-line-2)",
                              borderRadius: 10,
                              fontSize: 11,
                            }}
                            formatter={(v) => [`${Number(v).toFixed(1)}%`, "cover"]}
                          />
                          <Bar dataKey="p" fill="var(--color-pos)" fillOpacity={0.75} radius={[4, 4, 0, 0]} isAnimationActive />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>
              </Reveal>

              <Reveal>
                <Panel title={`Per-leg hit rates from the same ${sim.n.toLocaleString()} paths (top ${legRows.length})`}>
                  <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                    {legRows.map(([k, p]) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="truncate text-muted">{k}</span>
                        <span className="num shrink-0 text-text">{fmtPct(p)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[10.5px] text-faint">
                    These marginals (and their pairwise correlations) are exactly what prices H+R+RBI and
                    flags correlated parlay legs — one simulation, every consumer.
                  </div>
                </Panel>
              </Reveal>
            </>
          )}
        </div>
      )}

      <div className="mt-4 text-[10.5px] text-faint">
        Sims exist only for pregame games with confirmed lineups; games without one use the closed-form
        fallback and are labeled as such on the Board. Informational only.
      </div>
    </>
  );
}
