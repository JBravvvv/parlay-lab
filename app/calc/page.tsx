"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { fmtAmerican } from "@/lib/format";
import { parseAmerican, quoteParlay } from "@/lib/parlay-calc";

/**
 * PARLAY CALCULATOR (2026-08-20, Josh's word, verbatim: "Add a parlay calculator tab
 * where you can enter any amount for the bet and it has lines for each bet of the
 * parlay to enter the odds. It should start with 2 lines for bets then have a
 * '+ a leg' button underneath … At the bottom it should have 'wins' and 'pays'
 * amounts.") Free-standing math on the user's own numbers — no board, no engine.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CalcPage() {
  const [stake, setStake] = useState("10");
  // starts with 2 lines for bets, per the instruction
  const [legs, setLegs] = useState<string[]>(["", ""]);

  const stakeNum = Number(stake);
  const stakeOk = /^\d+(\.\d{1,2})?$/.test(stake.trim()) && stakeNum > 0;
  const parsed = legs.map((v) => parseAmerican(v));
  const allOdds = parsed.every((p): p is number => p != null);
  const quote = stakeOk && allOdds ? quoteParlay(stakeNum, parsed as number[]) : null;

  const setLeg = (i: number, v: string) => setLegs((ls) => ls.map((x, j) => (j === i ? v : x)));
  const addLeg = () => setLegs((ls) => [...ls, ""]);
  const removeLeg = (i: number) => setLegs((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));

  return (
    <>
      <PageHeader
        title="Parlay calculator"
        sub="Your stake, your prices — American odds on every leg. Wins is profit; pays is the full return with the stake back in."
      />
      <div className="mx-auto max-w-[560px] space-y-5">
        <Panel title="Bet amount">
          <label className="flex items-center gap-3">
            <span className="text-[15px] font-semibold text-muted">$</span>
            <input
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Bet amount"
              className={`num w-full rounded-xl border bg-surface-2 px-4 py-3 text-[17px] font-semibold text-text outline-none transition-colors ${
                stake.trim() === "" || stakeOk ? "border-line-2 focus:border-pos/50" : "border-neg/50"
              }`}
            />
          </label>
        </Panel>

        <Panel title="Legs">
          <div className="space-y-2.5">
            {legs.map((v, i) => {
              const bad = v.trim() !== "" && parsed[i] == null;
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-[52px] shrink-0 text-[10px] font-bold uppercase tracking-widest text-faint">
                    Leg {i + 1}
                  </span>
                  <input
                    value={v}
                    onChange={(e) => setLeg(i, e.target.value)}
                    placeholder="+150 or -110"
                    aria-label={`Leg ${i + 1} odds`}
                    className={`num w-full rounded-xl border bg-surface-2 px-4 py-2.5 text-[15px] font-semibold text-text outline-none transition-colors ${
                      bad ? "border-neg/50" : "border-line-2 focus:border-pos/50"
                    }`}
                  />
                  <span className="num w-[56px] shrink-0 text-right text-[11px] text-faint">
                    {parsed[i] != null ? `×${(parsed[i]! > 0 ? 1 + parsed[i]! / 100 : 1 + 100 / -parsed[i]!).toFixed(2)}` : ""}
                  </span>
                  {legs.length > 2 && (
                    <button
                      onClick={() => removeLeg(i)}
                      aria-label={`Remove leg ${i + 1}`}
                      className="shrink-0 rounded-full px-2 py-1 text-[13px] text-muted hover:bg-neg/10 hover:text-neg"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Pill variant="ghost" onClick={addLeg}>
              + a leg
            </Pill>
          </div>
        </Panel>

        <Panel title="Payout" className={quote ? "glow-gold" : ""}>
          {quote && (
            <div className="num mb-3 text-[11.5px] text-muted">
              {legs.length}-leg parlay · {fmtAmerican(quote.american)} · decimal {quote.dec.toFixed(2)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line-2 bg-surface-2/60 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-faint">Wins</div>
              <div className={`num mt-1 text-[24px] font-bold ${quote ? "text-pos" : "text-faint"}`}>
                {quote ? money(quote.wins) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gold/80">Pays</div>
              <div className={`num mt-1 text-[24px] font-bold ${quote ? "text-gold" : "text-faint"}`}>
                {quote ? money(quote.pays) : "—"}
              </div>
            </div>
          </div>
          {!quote && (
            <div className="mt-3 text-[11.5px] text-faint">
              Enter a bet amount and American odds (whole numbers, ±100 up) on every leg.
            </div>
          )}
        </Panel>

        <div className="text-center text-[10px] text-faint">
          Straight multiplication of your own prices — informational only, not betting advice.
        </div>
      </div>
    </>
  );
}
