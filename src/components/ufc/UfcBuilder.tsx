"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { OddsCell } from "@/components/ui/OddsCell";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney } from "@/lib/engine-client";
import { loadUfcBoard, amToDec, decToAm, fmtAm } from "@/lib/ufc";
import { UfcProps, type PropLeg } from "@/components/ufc/UfcProps";
import { UfcLiveProps } from "@/components/ufc/UfcLiveProps";

/* Build-your-own UFC parlay from the Caesars-priced sides of the next card.
   Same market math as the Board's UFC desk (consensus = de-vigged median
   across books, no fight model) and the same sizing discipline (¼-Kelly,
   2% cap). Fights are independent, so the product math is clean — the one
   thing we block is both sides of the same fight on one ticket. */

type SlipLeg = {
  fightId: string;
  fight: string;
  pick: string;
  record?: string;
  czOdds: number;
  prob: number;
};

const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

export function UfcBuilder() {
  const bankroll = typeof window !== "undefined" ? getMoney().bankroll : 750;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ufc-board"],
    queryFn: () => loadUfcBoard({ bankroll }),
    staleTime: 240_000,
    retry: 1,
  });
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");

  const playable = useMemo(() => {
    if (!q.data) return [];
    return q.data.fights.flatMap((f) =>
      [
        { side: f.a, opp: f.b },
        { side: f.b, opp: f.a },
      ]
        .filter(({ side }) => side.czOdds != null && side.prob != null)
        .map(({ side, opp }) => ({
          fightId: f.id,
          fight: `${f.a.name} vs ${f.b.name}`,
          start: f.start,
          pick: side.name,
          record: side.record,
          opp: opp.name,
          czOdds: side.czOdds!,
          prob: side.prob!,
          czEv: side.czEv ?? null,
        })),
    );
  }, [q.data]);

  const matches = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return playable
      .filter((p) => !slip.some((l) => l.pick === p.pick))
      .filter((p) => !qq || p.pick.toLowerCase().includes(qq) || p.opp.toLowerCase().includes(qq))
      .slice(0, qq ? 10 : 18);
  }, [playable, slip, query]);

  const add = (p: (typeof playable)[number]) => {
    const clash = slip.find((l) => l.fightId === p.fightId);
    if (clash) {
      setNote(`Both sides of ${p.fight} can't ride one ticket — remove ${clash.pick} first.`);
      return;
    }
    setNote("");
    setSlip((s) => [...s, { fightId: p.fightId, fight: p.fight, pick: p.pick, record: p.record, czOdds: p.czOdds, prob: p.prob }]);
  };

  /* typed prop legs — a prop shares its fight's id, so the same guard blocks
     exclusive/correlated combos (two methods of one fight, or ML + method) */
  const addProp = (p: PropLeg) => {
    const clash = slip.find((l) => l.fightId === p.groupId);
    if (clash) {
      setNote(`${p.pick} can't ride with ${clash.pick} — same fight/market, outcomes aren't independent.`);
      return;
    }
    setNote("");
    setSlip((s) => [...s, { fightId: p.groupId, fight: p.fight, pick: p.pick, czOdds: p.czOdds, prob: p.prob }]);
  };

  const calc = useMemo(() => {
    if (slip.length < 1) return null;
    const p = slip.reduce((a, l) => a * l.prob, 1);
    const dec = slip.reduce((a, l) => a * amToDec(l.czOdds), 1);
    const fairDec = 1 / p;
    const ev = p * dec - 1;
    const b = dec - 1;
    const f = (b * p - (1 - p)) / b;
    const stake = Math.round(Math.max(0, Math.min(f / 4, 0.02)) * bankroll * 100) / 100;
    return { p, dec, fairDec, ev, stake };
  }, [slip, bankroll]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-text">{q.data?.eventName ?? "Next UFC card"}</div>
          <div className="text-[11px] text-muted">
            Pick any Caesars-priced sides and see the real combined math. Ready-made tickets live on the{" "}
            <Link href="/board" className="text-pos underline underline-offset-2">Board&apos;s UFC tab</Link>.
          </div>
        </div>
        <Pill
          variant="ghost"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["ufc-board"] });
            qc.invalidateQueries({ queryKey: ["ufc-props"] });
          }}
          disabled={q.isFetching}
        >
          {q.isFetching ? "Refreshing…" : "↻ Refresh UFC"}
        </Pill>
      </div>

      {q.isPending ? (
        <Panel><SkeletonRows rows={8} /></Panel>
      ) : q.isError ? (
        <Panel><ErrorState title="Couldn't load UFC odds" onRetry={() => q.refetch()} /></Panel>
      ) : playable.length === 0 ? (
        <Panel>
          <EmptyState title="No Caesars-priced fights right now" body="Started fights drop off the slip automatically — refresh closer to the next card." />
        </Panel>
      ) : (
        <Reveal>
          <Panel title="UFC slip — combine any fighters on the card">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="⌕ Search a fighter…"
              className="mb-3 w-full rounded-full border border-line-2 bg-white/[0.03] px-4 py-2 text-[12.5px] text-text outline-none transition-colors placeholder:text-faint focus:border-pos/60 md:max-w-[320px]"
            />
            <div className="grid gap-1.5 md:grid-cols-2">
              {matches.map((p) => (
                <button
                  key={p.pick}
                  onClick={() => add(p)}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-pos/40 hover:bg-white/[0.05]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-text">
                      ＋ {p.pick}
                      {p.record && <span className="num ml-1 text-[10px] text-muted">({p.record})</span>}
                    </span>
                    <span className="block truncate text-[10.5px] text-faint">
                      vs {p.opp} · {new Date(p.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="num flex shrink-0 items-center gap-2 text-[11.5px] text-muted">
                    {fmtPct(p.prob)}
                    <OddsCell odds={fmtAm(p.czOdds) as never} book="caesars" />
                  </span>
                </button>
              ))}
            </div>

            {note && <div className="mt-3 text-[11.5px] text-gold">{note}</div>}

            {slip.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                {slip.map((l, i) => (
                  <div key={l.pick} className="flex items-center justify-between gap-2 py-1 text-[12.5px]">
                    <span className="min-w-0 truncate text-text">
                      {l.pick}
                      {l.record && <span className="num ml-1 text-[10px] text-muted">({l.record})</span>}
                      <span className="ml-1.5 text-[10.5px] text-faint">{l.fight}</span>
                    </span>
                    <span className="num flex shrink-0 items-center gap-2 text-[11.5px] text-muted">
                      {fmtPct(l.prob)} · {fmtAm(l.czOdds)}
                      <button
                        onClick={() => setSlip((s) => s.filter((_, j) => j !== i))}
                        className="rounded-full px-1.5 text-neg hover:bg-neg/10"
                        aria-label={`remove ${l.pick}`}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}

                {calc && (
                  <div className="num mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[12px]">
                    <span className="text-text">{fmtPct(calc.p)} true</span>
                    <span className="text-gold">{fmtAm(decToAm(calc.dec))} @ CZR</span>
                    <span className="text-muted">fair {fmtAm(decToAm(calc.fairDec))}</span>
                    <EvBadge ev={calc.ev * 100} />
                    <span className="text-muted">
                      ¼-Kelly {calc.stake > 0 ? fmtMoney(calc.stake) : "$0 (no edge)"}
                    </span>
                    <Pill variant="ghost" onClick={() => { setSlip([]); setNote(""); }} className="!px-3 !py-1 text-[11px]">
                      Clear
                    </Pill>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </Reveal>
      )}

      <UfcLiveProps fights={q.data?.fights ?? []} onAdd={addProp} />

      <UfcProps fights={q.data?.fights ?? []} onAdd={addProp} />

      <div className="text-[10.5px] leading-relaxed text-faint">
        True % is the de-vigged consensus across every US book in the feed — no fight model. Different fights are
        independent, so combined probability is the straight product; both sides of one fight are blocked. Method and
        round props aren&apos;t in the feed at any book — the props desk above prices them from what you type in.
        Informational only, not betting advice.
      </div>
    </div>
  );
}
