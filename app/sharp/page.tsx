"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { UfcSharp } from "@/components/ufc/UfcSharp";
import { AsgSharpTab } from "@/components/allstar/AllStarSurfaces";
import { ASG_ENABLED, UFC_ENABLED } from "@/lib/features";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import { getEngine, getSelectionMode, SIM_PATHS_TXT } from "@/lib/engine-client";
import { useCalibration } from "@/lib/useCalibration";
import { nowLabel, useLiveNow } from "@/lib/liveNow";
import type { PickRow } from "@/engine";

/* The Sharp = the built-in quant engine's daily read. Same engine as the old
   GitHub app, running verbatim (parity-proven in tests/parity.test.ts) — free,
   no key, no AI. The optional Claude second-opinion mode lives at the bottom
   and stays dormant unless a server key is ever configured. */

type Trap = { prop: string; reason: string };
type Pass = { prop: string; reason: string };

function ConvChip({ c }: { c?: string }) {
  if (!c) return null;
  const tone =
    c === "A"
      ? "text-pos border-pos/50 bg-pos/10"
      : c === "B"
        ? "text-gold border-gold/50 bg-gold/10"
        : "text-muted border-line-2 bg-surface-2";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>CONVICTION {c}</span>;
}

export default function SharpPage() {
  const { data: board, isPending } = useBoard();
  const regen = useRegenerateBoard();
  const d = board?.data;
  // localStorage only after mount — an initializer read would diverge from the
  // server's "mlb" and trip a hydration mismatch
  const [sport, setSport] = useState<"mlb" | "ufc" | "asg">("mlb");
  useEffect(() => {
    try {
      const s = localStorage.getItem("pl_sharp_sport");
      if (UFC_ENABLED && s === "ufc") setSport("ufc");
      else if (ASG_ENABLED && s === "asg") setSport("asg");
    } catch { /* fresh device */ }
  }, []);
  const pickSport = (s: "mlb" | "ufc" | "asg") => {
    setSport(s);
    try { localStorage.setItem("pl_sharp_sport", s); } catch {}
  };

  // selection_mode: ev_gated (upgrade-01 default) and probability both rank
  // today's plays by the engine's true % — Caesars' price never changes WHICH
  // picks are chosen, it only prices them (the EV gate lives in the Builder's
  // allocator, where stakes are). caesars_ev is the legacy ranking.
  const [selMode, setSelModeState] = useState<"dk_fd" | "ev_gated" | "probability" | "caesars_ev">("dk_fd");
  // dk_fd: the active core EV gate, straight from the engine (mounted only) —
  // The Sharp's plays clear the same bar the Builder's allocator enforces
  const [gatePct, setGatePct] = useState(0);
  useEffect(() => {
    setSelModeState(getSelectionMode());
    const cfg = getEngine().get<{ coreEvMin?: number }>("SH_CFG");
    setGatePct(cfg?.coreEvMin ?? 0);
  }, []);
  const cal = useCalibration();

  const { plays, notOffered } = useMemo(() => {
    if (!d) return { plays: [] as PickRow[], notOffered: [] as PickRow[] };
    const seen = new Set<string>();
    const rows = Object.entries(d.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([mkt, v]) => v.map((r) => ({ ...r, __mkt: mkt })))
      .filter((r) => {
        const k = `${r.label}|${r.sub}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      // 3D sanity breaker: quarantined markets are frozen out of suggested
      // plays (they stay on the Board, badged UNDER REVIEW)
      .filter((r) => !cal.quarantine.includes((r as { __mkt: string }).__mkt));
    if (selMode === "caesars_ev") {
      return {
        plays: rows
          .filter((r) => r.cz != null && Number(r.czEv) > 0)
          .sort((a, b) => Number(b.czEv) - Number(a.czEv))
          .slice(0, 8),
        notOffered: [] as PickRow[],
      };
    }
    if (selMode === "dk_fd") {
      // Builder discipline, verbatim: a play needs BOTH a DK/FD basis quote and a
      // Caesars quote, must clear the core EV gate at the basis, and is ranked by
      // EV at the basis. Gate-clearing picks Caesars doesn't offer are disclosed,
      // never substituted.
      const gated = rows
        .filter((r) => r.bs != null && Number(r.bsEv) >= gatePct)
        .sort((a, b) => Number(b.bsEv) - Number(a.bsEv));
      return {
        plays: gated.filter((r) => r.cz != null).slice(0, 8),
        notOffered: gated.filter((r) => r.cz == null).slice(0, 8),
      };
    }
    const top = rows.sort((a, b) => Number(b.prob) - Number(a.prob)).slice(0, 8);
    return {
      plays: top.filter((r) => r.cz != null),
      notOffered: top.filter((r) => r.cz == null),
    };
  }, [d, selMode, gatePct, cal.quarantine]);

  const trap = d?.trap as Trap | undefined;
  const passes = (d?.passes as Pass[] | undefined) ?? [];

  // live "now" stats for plays whose games are in progress
  const liveReqs = useMemo(
    () => (d?.gameInfo ? Object.values(d.gameInfo).map((g) => ({ pk: g.pk, date: g.start ?? null })) : []),
    [d],
  );
  const liveNow = useLiveNow(liveReqs);
  const playNow = useCallback(
    (r: PickRow) =>
      r.gkey && d?.gameInfo ? liveNow.legNow(d.gameInfo[r.gkey]?.pk ?? null, r.lkey) : null,
    [d, liveNow],
  );

  return (
    <>
      <PageHeader
        title="The Sharp"
        sub={
          sport === "ufc"
            ? "The desk's UFC read — market consensus vs the Caesars line, no fight model, no key needed"
            : sport === "asg"
            ? "The desk's All-Star read — consensus-anchored ML/F3/F5, sim-priced correct scores, straight bets only"
            : "The quant engine's daily read — the exact engine from the original app (parity-proven), free, no key needed"
        }
        action={
          sport === "mlb" ? (
            <Pill variant="primary" onClick={() => regen.mutate()} disabled={regen.isPending || isPending}>
              {regen.isPending ? "Working the slate…" : d ? "Refresh read" : "Generate today's read"}
            </Pill>
          ) : undefined
        }
      />

      {(UFC_ENABLED || ASG_ENABLED) && (
        <div className="mb-4 flex items-center gap-2">
          <FilterPill selected={sport === "mlb"} onClick={() => pickSport("mlb")}>⚾ MLB</FilterPill>
          {UFC_ENABLED && <FilterPill selected={sport === "ufc"} onClick={() => pickSport("ufc")}>🥊 UFC</FilterPill>}
          {ASG_ENABLED && <FilterPill selected={sport === "asg"} onClick={() => pickSport("asg")}>⭐ ASG</FilterPill>}
        </div>
      )}

      {sport === "ufc" ? (
        <UfcSharp />
      ) : sport === "asg" ? (
        <AsgSharpTab />
      ) : !d ? (
        <Panel>
          <EmptyState
            title={isPending || regen.isPending ? "Working the numbers…" : "No read yet today"}
            body="One run pulls the slate, de-vigs every book, sims lineups and ranks the edges — the same engine that built every board since day one."
          />
        </Panel>
      ) : (
        <div className="space-y-5">
          {typeof d.overview === "string" && (
            <Reveal>
              <Panel title="The engine's own overview">
                <p className="text-[13px] leading-relaxed text-muted">{d.overview}</p>
                <div className="num mt-2 border-t border-white/[0.05] pt-2 text-[10.5px] text-faint">
                  Engine setting: Monte Carlo {SIM_PATHS_TXT} paths per game (live games resume from the real
                  score/inning/base-out state). The paragraph above is frozen at generation time — refresh for a
                  current read.
                </div>
              </Panel>
            </Reveal>
          )}

          {cal.line && (
            <Reveal>
              <div className="num rounded-(--radius-panel) border border-white/[0.06] bg-surface/60 px-4 py-2.5 text-[11.5px] text-muted">
                {cal.line}
              </div>
            </Reveal>
          )}

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {selMode === "dk_fd"
                ? `Today's plays — EV at the DK/FD basis, gate +${gatePct}% (the Builder's exact bar; Caesars settles, never picks)`
                : selMode !== "caesars_ev"
                ? "Today's plays — highest true probability (consensus-anchored; Caesars prices the ticket, never picks it)"
                : "Today's plays — best playable EV at Caesars"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {plays.map((r, i) => (
                <Panel key={`${r.label}|${r.sub}`} className={i === 0 ? "glow-pos" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="display text-[16px] text-text">{r.label}</div>
                      <div className="mt-0.5 text-[12px] text-muted">{r.sub}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {selMode === "dk_fd" && r.bsOdds != null && (
                        <span className="num inline-flex items-baseline gap-1.5">
                          <OddsCell odds={r.bsOdds as never} />
                          <span className="text-[9.5px] uppercase text-muted">
                            {String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}
                          </span>
                        </span>
                      )}
                      <OddsCell odds={r.czOdds as never} book="caesars" />
                      <ConvChip c={r.conv as string} />
                    </div>
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                    <span className="text-text">{Number(r.prob).toFixed(1)}% true</span>
                    {(() => {
                      const n = playNow(r);
                      return n ? (
                        <span
                          className="text-[10px] font-bold text-live"
                          title="Live from the official boxscore — updates every minute while the game is in progress"
                        >
                          ● {nowLabel(n)}
                        </span>
                      ) : null;
                    })()}
                    <EvBadge ev={Number(selMode === "dk_fd" ? r.bsEv : r.czEv)} />
                    {selMode === "dk_fd" && r.czEv != null && (
                      <span className="text-muted" title="Informational: EV at the Caesars settlement price">
                        @CZ {Number(r.czEv) > 0 ? "+" : ""}{Number(r.czEv).toFixed(1)}%
                      </span>
                    )}
                    {(selMode === "dk_fd" ? r.bsBadge : r.czBadge) ? (
                      <span className="rounded-full border border-pos/50 bg-pos/10 px-2 py-0.5 text-[9.5px] font-bold text-pos">
                        EDGE
                      </span>
                    ) : null}
                    {r.lu === "projected" && (
                      <span
                        className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold"
                        title="Lineup not posted yet — projected everyday starter; Caesars auto-voids the leg if he sits"
                      >
                        PROJ
                      </span>
                    )}
                  </div>
                  {Array.isArray(r.tags) && r.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(r.tags as string[]).slice(0, 4).map((t) => (
                        <span key={t} className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
            {notOffered.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
                  {selMode === "dk_fd"
                    ? "Clears the gate at the basis, not offered at Caesars — never substituted with a weaker pick"
                    : "In the top picks, not offered at Caesars — never substituted with a lower-probability pick"}
                </h3>
                <div className="space-y-1.5">
                  {notOffered.map((r) => (
                    <div key={`${r.label}|${r.sub}`} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span>
                        <span className="text-text">{r.label}</span> <span className="text-muted">{r.sub}</span>
                        {r.lu === "projected" && <span className="ml-1.5 text-[9.5px] font-bold text-gold">PROJ</span>}
                      </span>
                      <span className="num text-[11.5px] text-muted">
                        {selMode === "dk_fd"
                          ? `${Number(r.prob).toFixed(1)}% true · basis ${String(r.bsOdds)} (${String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}) · +${Number(r.bsEv).toFixed(1)}% EV`
                          : `${Number(r.prob).toFixed(1)}% true · best ${String(r.odds)} @ ${String(r.book ?? "—")}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {plays.length === 0 && (
              <Panel>
                <EmptyState
                  title={
                    selMode === "dk_fd"
                      ? `Nothing clears +${gatePct}% EV at the DK/FD basis right now`
                      : selMode !== "caesars_ev"
                      ? "No playable picks right now"
                      : "No positive-EV plays at Caesars right now"
                  }
                  body="The engine found nothing playable on this slate — that's a real answer, not a failure. Passing is a position."
                />
              </Panel>
            )}
          </Reveal>

          {trap && (
            <Reveal>
              <Panel title="Trap of the day" className="border-neg/20">
                <div className="text-[13px] font-semibold text-neg">{trap.prop}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-muted">{trap.reason}</div>
              </Panel>
            </Reveal>
          )}

          {passes.length > 0 && (
            <Reveal>
              <details className="glass px-5 py-4">
                <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  What the engine passed on ({passes.length}) — and why
                </summary>
                <div className="mt-3 space-y-2.5">
                  {passes.map((p) => (
                    <div key={p.prop}>
                      <div className="text-[12.5px] font-medium text-text">{p.prop}</div>
                      <div className="text-[11.5px] text-muted">{p.reason}</div>
                    </div>
                  ))}
                </div>
              </details>
            </Reveal>
          )}

          <Reveal>
            <details className="glass px-5 py-4">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                How the engine thinks (the method, in plain language)
              </summary>
              <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted">
                <p>
                  <b className="text-text">1 · The market is the prior.</b> Every posted book gets de-vigged;
                  the median across books is the consensus &quot;fair&quot; probability. The engine has to earn any
                  disagreement with it.
                </p>
                <p>
                  <b className="text-text">2 · Form without hot-hand chasing.</b> Player rates blend the last
                  7/15/30 days, then shrink toward the player&apos;s own Statcast skill (xwOBA/xBA/xSLG, barrel
                  and hard-hit rates) — small samples get pulled hard, real signals survive. Batter-vs-pitcher
                  history only nudges with 15+ career meetings.
                </p>
                <p>
                  <b className="text-text">2b · Pitchers judged on what they control.</b> Starter quality blends
                  ERA with FIP (strikeouts, walks, HBP, homers — defense stripped out) plus WHIP for baserunner
                  traffic. A starter whose ERA flatters his xERA gets faded as a regression candidate; the
                  unlucky ones get credit. Starters averaging deep pitch counts lose late-inning outs, and the
                  bullpen behind every lead is scored on both fatigue (3-day workload) and quality (rolling pen
                  ERA/WHIP vs league).
                </p>
                <p>
                  <b className="text-text">3 · Games get simulated.</b> {SIM_PATHS_TXT} seeded Monte Carlo paths
                  per game with confirmed lineups — a full per-plate-appearance base-out machine with platoon
                  (LHP/RHP) splits, park factors by batter handedness, wind and temperature, ump strike zones,
                  and bullpen chains. In-progress games RESUME from the real score, inning, outs, runners and
                  each player&apos;s current tally, and simulate only the remainder. It prices ML/RL, props,
                  and flags correlated parlay legs.
                </p>
                <p>
                  <b className="text-text">4 · Model meets market.</b> Final probability = 35% model / 65%
                  consensus for props (15/85 for ML-RL). EV is computed at the DK/FD selection basis (Caesars
                  settles the ticket). EDGE badges need both the EV threshold and enough sample behind it.
                </p>
                <p>
                  <b className="text-text">5 · Discipline is hard-coded.</b> ¼-Kelly capped at 2% per bet,
                  overs only, HR props never mix with other types, the daily card always spreads across 4+
                  tickets with no ticket over 25%, K&apos;s parlays are last-resort fill capped at 15% (they
                  went 0-for-4 as lead tickets — the ledger is the boss), no pick rides two tickets, the
                  daily amount always sums exactly — and everything locked gets graded from official box
                  scores.
                </p>
              </div>
            </details>
          </Reveal>

          <Reveal>
            <details className="glass px-5 py-4 opacity-80">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                Optional: AI second opinion (off — needs a server API key, ~$0.50/run)
              </summary>
              <AiMode />
            </details>
          </Reveal>
        </div>
      )}

      <div className="mt-6 text-[10.5px] text-faint">
        {sport === "ufc"
          ? "UFC numbers are market-derived only (de-vigged consensus) — no model, nothing invented. Informational only, not betting advice."
          : "Same math, provably: the engine runs verbatim from the original app and a test suite rejects any change that alters its picks. Informational only, not betting advice."}
      </div>
    </>
  );
}

/* ---------- optional Claude mode (dormant without ANTHROPIC_API_KEY) ---------- */
function AiMode() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg("Checking the server…");
    try {
      const r = await fetch("/api/sharp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      setMsg(j.error || "Configured — ask Claude to wire the full AI run when you want it.");
    } catch {
      setMsg("Server unreachable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 text-[12px] text-muted">
      <p>
        An LLM handicapper can read the same slate and argue its own card. It costs real money per run and is
        entirely optional — the quant engine above is and stays the default brain of this app.
      </p>
      <Pill variant="ghost" onClick={run} disabled={busy}>
        {busy ? "Checking…" : "Check availability"}
      </Pill>
      {msg && <div className="text-[11.5px] text-gold">{msg}</div>}
    </div>
  );
}
