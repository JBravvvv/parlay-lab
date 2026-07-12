"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { fmtAm, amToDec, type UfcFight } from "@/lib/ufc";
import type { PropLeg } from "@/components/ufc/UfcProps";

/* Live Caesars fight props via the BestFightOdds scrape (/api/ufcprops).
   For each prop Caesars prices we show the best price elsewhere and the
   cross-book median — an honest line-shop read. The median implied % is used
   as the slip probability and slightly overstates true chances on longshots
   (per-outcome vig can't be fully stripped on partial markets) — disclosed. */

type ApiProp = { label: string; cz: number; bestBook: string | null; bestOdds: number | null; medImplied: number; books: number };
type ApiFight = { a: string; b: string; czMlA: number | null; czMlB: number | null; props: ApiProp[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const sameName = (x: string, y: string) => {
  const a = norm(x), b = norm(y);
  return a === b || a.startsWith(b) || b.startsWith(a);
};
const lastName = (s: string) => s.trim().split(/\s+/).slice(-1)[0];
const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;

export function UfcLiveProps({ fights, onAdd }: { fights: UfcFight[]; onAdd: (leg: PropLeg) => void }) {
  const q = useQuery({
    queryKey: ["ufc-props"],
    queryFn: async (): Promise<{ fights: ApiFight[]; source?: string }> => {
      const r = await fetch("/api/ufcprops");
      if (!r.ok) throw new Error(`props feed ${r.status}`);
      return r.json();
    },
    staleTime: 240_000,
    retry: 1,
  });

  /* keep only fights still upcoming in our odds feed; carry their id for slip guards */
  const matched = useMemo(() => {
    if (!q.data) return [];
    return q.data.fights
      .map((bf) => {
        const f = fights.find(
          (uf) =>
            sameName(uf.a.name, bf.a) || sameName(uf.b.name, bf.a) ||
            sameName(uf.a.name, bf.b) || sameName(uf.b.name, bf.b),
        );
        return f ? { bf, f } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [q.data, fights]);

  if (q.isPending)
    return (
      <Panel title="Caesars fight props — live" className="mt-6">
        <SkeletonRows rows={5} />
      </Panel>
    );
  if (q.isError)
    return (
      <Panel title="Caesars fight props — live" className="mt-6">
        <EmptyState
          title="Prop feed unreachable right now"
          body="The BestFightOdds scrape didn't answer — the typed-price props desk below still prices anything you see in the Caesars app."
        />
      </Panel>
    );
  if (matched.length === 0)
    return (
      <Panel title="Caesars fight props — live" className="mt-6">
        <EmptyState title="No Caesars props for the remaining fights" body="Props drop off as fights start." />
      </Panel>
    );

  return (
    <Reveal>
      <Panel title="Caesars fight props — live (rounds · draw, via BestFightOdds)" className="mt-6">
        <div className="space-y-4">
          {matched.map(({ bf, f }) => (
            <div key={f.id}>
              <div className="mb-1.5 text-[12px] font-semibold text-text">
                {f.a.name} vs {f.b.name}
                <span className="num ml-2 text-[10px] text-faint">
                  {new Date(f.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="space-y-1">
                {bf.props.map((p) => {
                  const evVsMed = p.medImplied * amToDec(p.cz) - 1;
                  const czBest = p.bestOdds == null || amToDec(p.cz) >= amToDec(p.bestOdds);
                  const longshot = p.cz >= 1500;
                  return (
                    <div key={p.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-muted">{p.label}</span>
                      <span className="num flex shrink-0 items-center gap-2.5 text-[11.5px]">
                        <span className="font-bold text-gold">{fmtAm(p.cz)}</span>
                        {czBest ? (
                          <span className="rounded-full border border-pos/50 bg-pos/10 px-1.5 py-0.5 text-[9px] font-bold text-pos">
                            CZ BEST
                          </span>
                        ) : (
                          <span className="text-[10px] text-faint">
                            best {fmtAm(p.bestOdds!)} {p.bestBook}
                          </span>
                        )}
                        <span className={`text-[10.5px] ${evVsMed > 0.02 && !longshot ? "text-pos" : "text-faint"}`}>
                          {evVsMed >= 0 ? "+" : ""}{(evVsMed * 100).toFixed(1)}% vs mkt
                        </span>
                        <button
                          onClick={() =>
                            onAdd({
                              groupId: f.id,
                              fight: `${f.a.name} vs ${f.b.name}`,
                              pick: p.label,
                              czOdds: p.cz,
                              prob: p.medImplied,
                            })
                          }
                          className="rounded-full border border-pos/50 bg-pos/10 px-2 py-0.5 text-[10px] font-bold text-pos hover:bg-pos/20"
                        >
                          ＋ slip
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10.5px] leading-relaxed text-faint">
          &quot;vs mkt&quot; compares Caesars to the cross-book median for the same outcome — a line-shop read, not a
          model. On big longshots the median overstates true chances (vig can&apos;t be fully stripped from partial
          markets), so treat green there with suspicion; CZ BEST just means no book on the board beats this price.
          Slip probability uses the market median, same caveat. Method-of-victory prices from the Caesars NV app
          aren&apos;t tracked here — type those into the desk below. Informational only, not betting advice.
        </p>
      </Panel>
    </Reveal>
  );
}
