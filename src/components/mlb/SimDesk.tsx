"use client";

import { Panel } from "@/components/ui/Panel";
import { EvBadge } from "@/components/ui/EvBadge";
import { Reveal } from "@/components/motion/Reveal";

/* ENGINE V2 · sim pricing desk — the 10,000-run PA-level Monte Carlo priced as
   markets: game totals (model blended 30/70 with the de-vigged consensus, EV at
   the Caesars quote when CZ hangs the same number), first-5-innings and team
   totals (model fair prices — no market feed for those yet, stated plainly).
   Display-only: nothing here feeds parlays, the allocator, or ledger grading. */

export type SimMarketRow = {
  game: string;
  start: string | null;
  n: number;
  avgAway: number;
  avgHome: number;
  f5: { pHome: number; pAway: number; pTie: number; avg: number; o45: number; o55: number };
  tt: {
    home: { avg: number; o35: number; o45: number };
    away: { avg: number; o35: number; o45: number };
  };
  total?: {
    pt: number;
    model: number;
    market: number | null;
    books: number;
    final: number;
    cz: { pt: number; o: number; u: number } | null;
    evOver?: number | null;
    evUnder?: number | null;
  };
};

const fmtAm = (a: number | null | undefined) => (a == null ? "—" : a > 0 ? `+${a}` : `${a}`);
const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);
const fairAm = (p: number) => {
  if (!(p > 0) || !(p < 1)) return "—";
  const am = p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return fmtAm(am);
};
const tLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

export function SimDesk({ rows }: { rows: SimMarketRow[] | null }) {
  if (!rows || rows.length === 0) return null;
  const teams = (g: string) => g.split(" @ ");
  return (
    <Reveal>
      <div className="mt-8">
        <div className="mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Engine v2 · sim pricing — totals · first 5 · team totals
          </h2>
          <div className="text-[11px] text-muted">
            Priced from the {rows[0].n.toLocaleString()}-run PA-level Monte Carlo (log5 batter×pitcher, platoon,
            park×handedness, TTO/manager hook, bullpen fatigue). Totals blend the sim 30/70 with the de-vigged market;
            F5 and team totals are model-fair only — no market feed for those yet.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const [away, home] = teams(r.game);
            const t = r.total;
            const hot = (t?.evOver ?? -1) > 0.01 || (t?.evUnder ?? -1) > 0.01;
            return (
              <Panel key={r.game} className={hot ? "glow-pos" : ""}>
                <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate text-text">{r.game}</span>
                  <span className="num shrink-0 text-[10.5px] text-faint">
                    {tLabel(r.start)} · sim {r.avgAway.toFixed(1)}–{r.avgHome.toFixed(1)}
                  </span>
                </div>

                {t ? (
                  <div className="num flex flex-wrap items-center gap-2.5 text-[11.5px] text-muted">
                    <span>
                      O/U {t.pt} · sim over {fmtPct(t.model)}
                      {t.market != null && <> · market {fmtPct(t.market)}</>}
                      {" · "}final <span className="text-text">{fmtPct(t.final)}</span>
                    </span>
                    {t.cz && (
                      <span className="text-gold">
                        CZ {t.cz.pt}: {fmtAm(t.cz.o)}/{fmtAm(t.cz.u)}
                      </span>
                    )}
                    {t.evOver != null && <span>O <EvBadge ev={t.evOver * 100} /></span>}
                    {t.evUnder != null && <span>U <EvBadge ev={t.evUnder * 100} /></span>}
                    {t.cz && t.cz.pt !== t.pt && (
                      <span className="text-faint">CZ hangs a different number — not comparable, shop it</span>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-faint">no market total posted for this game</div>
                )}

                <div className="num mt-2.5 space-y-1 border-t border-line pt-2 text-[11px] text-muted">
                  <div>
                    F5: {away} {fmtPct(r.f5.pAway)} · {home} {fmtPct(r.f5.pHome)} · tie {fmtPct(r.f5.pTie)}
                    <span className="text-faint"> · fair {fairAm(r.f5.pAway)}/{fairAm(r.f5.pHome)}</span>
                  </div>
                  <div>
                    F5 total avg {r.f5.avg.toFixed(1)} · O4.5 {fmtPct(r.f5.o45)} ({fairAm(r.f5.o45)}) · O5.5{" "}
                    {fmtPct(r.f5.o55)} ({fairAm(r.f5.o55)})
                  </div>
                  <div>
                    TT {away}: O3.5 {fmtPct(r.tt.away.o35)} · O4.5 {fmtPct(r.tt.away.o45)}
                    <span className="mx-1.5 text-faint">|</span>
                    TT {home}: O3.5 {fmtPct(r.tt.home.o35)} · O4.5 {fmtPct(r.tt.home.o45)}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="mt-2 text-[10.5px] text-faint">
          F5 and team-total fair prices are the model alone — compare them to the CZ app before betting anything.
          Display-only desk: these markets are not fed into parlays, the allocator, or the ledger. Informational only,
          not betting advice.
        </div>
      </div>
    </Reveal>
  );
}
